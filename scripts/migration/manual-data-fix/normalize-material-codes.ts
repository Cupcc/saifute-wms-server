import {
  buildNextSequentialMaterialCode,
  normalizeMaterialCode,
} from "../../../src/shared/domain/material-code";
import {
  assertExpectedDatabaseName,
  EXPECTED_TARGET_DATABASE_NAME,
  loadMigrationEnvironment,
  parseMigrationCliOptions,
  resolveReportPath,
} from "../config";
import {
  closePools,
  createMariaDbPool,
  type MigrationConnectionLike,
  withPoolConnection,
} from "../db";
import { writeStableReport } from "../shared/report-writer";

const UPDATED_BY = "manual-normalize-material-codes-20260518";
const DRY_RUN_REPORT_FILE_NAME = "normalize-material-codes-dry-run-report.json";
const EXECUTE_REPORT_FILE_NAME = "normalize-material-codes-execute-report.json";
const WHITESPACE_REGEXP = "[[:space:]]";
const WHITESPACE_REPLACE_REGEXP = "[[:space:]]+";
const MATERIAL_CODE_MAX_LENGTH = 64;

interface CountRow {
  count: number | string | null;
}

interface UpdateResult {
  affectedRows?: number;
}

interface MaterialRow {
  id: number;
  materialCode: string;
  materialName: string;
  specModel: string | null;
  unitCode: string;
  status: string;
}

interface MaterialRename {
  id: number;
  oldCode: string;
  newCode: string;
  materialName: string;
  specModel: string | null;
  unitCode: string;
  status: string;
  collisionAvoided: boolean;
  collisionWith: Array<{ id: number; materialCode: string }>;
}

interface CodeColumn {
  tableName: string;
  columnName: string;
  hasMaterialId: boolean;
}

interface CodeSample {
  oldCode: string;
  newCode: string;
  count: number | string;
}

interface CodeColumnSummary {
  tableName: string;
  columnName: string;
  hasMaterialId: boolean;
  whitespaceRowCount: number;
  sampleRewrites: CodeSample[];
}

interface SnapshotUpdateSummary {
  tableName: string;
  columnName: string;
  affectedRows: number;
  mode: "material-id-master-code" | "direct-whitespace-removal";
}

interface NormalizationPlan {
  blockers: string[];
  materialRenames: MaterialRename[];
  codeColumns: CodeColumn[];
  whitespaceColumns: CodeColumnSummary[];
}

function toCount(row: CountRow | undefined): number {
  return Number(row?.count ?? 0);
}

function quoteIdentifier(identifier: string): string {
  return `\`${identifier.replaceAll("`", "``")}\``;
}

function materialCodeKey(value: string): string {
  return normalizeMaterialCode(value).toLocaleLowerCase("en-US");
}

function hasWhitespace(value: string): boolean {
  return /\s/u.test(value);
}

function buildTrimmedCodeWithSuffix(baseCode: string, suffix: string): string {
  const maxBaseLength = MATERIAL_CODE_MAX_LENGTH - suffix.length;

  if (maxBaseLength <= 0) {
    throw new Error(`物料编码后缀 ${suffix} 超过字段长度限制。`);
  }

  return `${baseCode.slice(0, maxBaseLength)}${suffix}`;
}

function allocateUniqueCode(
  seedCode: string,
  reservedKeys: ReadonlySet<string>,
  assignedKeys: Set<string>,
): string {
  let attempt = 0;

  while (true) {
    const candidateCode =
      attempt === 0
        ? seedCode
        : buildTrimmedCodeWithSuffix(seedCode, `-DUP-${attempt}`);
    const candidateKey = materialCodeKey(candidateCode);

    if (!reservedKeys.has(candidateKey) && !assignedKeys.has(candidateKey)) {
      assignedKeys.add(candidateKey);
      return candidateCode;
    }

    attempt += 1;
  }
}

function allocateNormalizedMaterialCode(
  row: MaterialRow,
  reservedKeys: ReadonlySet<string>,
  assignedKeys: Set<string>,
  reservedCodes: readonly string[],
  assignedCodes: Set<string>,
): string {
  const normalizedCode =
    normalizeMaterialCode(row.materialCode) || `MAT-LEGACY-${row.id}`;
  const normalizedKey = materialCodeKey(normalizedCode);

  if (!reservedKeys.has(normalizedKey) && !assignedKeys.has(normalizedKey)) {
    assignedKeys.add(normalizedKey);
    assignedCodes.add(normalizedCode);
    return normalizedCode;
  }

  const nextSequentialCode = buildNextSequentialMaterialCode(normalizedCode, [
    ...reservedCodes,
    ...assignedCodes,
  ]);
  if (nextSequentialCode) {
    const nextSequentialKey = materialCodeKey(nextSequentialCode);
    if (
      !reservedKeys.has(nextSequentialKey) &&
      !assignedKeys.has(nextSequentialKey)
    ) {
      assignedKeys.add(nextSequentialKey);
      assignedCodes.add(nextSequentialCode);
      return nextSequentialCode;
    }
  }

  const fallbackCode = allocateUniqueCode(
    buildTrimmedCodeWithSuffix(normalizedCode, `-LEGACY-${row.id}`),
    reservedKeys,
    assignedKeys,
  );
  assignedCodes.add(fallbackCode);
  return fallbackCode;
}

async function countRows(
  connection: MigrationConnectionLike,
  sql: string,
  values: readonly unknown[] = [],
): Promise<number> {
  const rows = await connection.query<CountRow[]>(sql, values);
  return toCount(rows[0]);
}

async function loadCodeColumns(
  connection: MigrationConnectionLike,
): Promise<CodeColumn[]> {
  const rows = await connection.query<
    Array<{ tableName: string; columnName: string }>
  >(
    `
      SELECT
        TABLE_NAME AS tableName,
        COLUMN_NAME AS columnName
      FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND COLUMN_NAME IN ('material_code', 'material_code_snapshot')
      ORDER BY TABLE_NAME, COLUMN_NAME
    `,
  );

  const columns: CodeColumn[] = [];
  for (const row of rows) {
    const hasMaterialId =
      (await countRows(
        connection,
        `
          SELECT COUNT(*) AS count
          FROM information_schema.COLUMNS
          WHERE TABLE_SCHEMA = DATABASE()
            AND TABLE_NAME = ?
            AND COLUMN_NAME = 'material_id'
        `,
        [row.tableName],
      )) > 0;

    columns.push({
      tableName: row.tableName,
      columnName: row.columnName,
      hasMaterialId,
    });
  }

  return columns;
}

async function loadWhitespaceColumnSummaries(
  connection: MigrationConnectionLike,
  codeColumns: readonly CodeColumn[],
): Promise<CodeColumnSummary[]> {
  const summaries: CodeColumnSummary[] = [];

  for (const column of codeColumns) {
    const tableName = quoteIdentifier(column.tableName);
    const columnName = quoteIdentifier(column.columnName);
    const whitespaceRowCount = await countRows(
      connection,
      `
        SELECT COUNT(*) AS count
        FROM ${tableName}
        WHERE ${columnName} REGEXP ?
      `,
      [WHITESPACE_REGEXP],
    );

    const sampleRewrites =
      whitespaceRowCount > 0
        ? await connection.query<CodeSample[]>(
            `
              SELECT
                ${columnName} AS oldCode,
                REGEXP_REPLACE(
                  CAST(${columnName} AS CHAR),
                  ?,
                  ''
                ) AS newCode,
                COUNT(*) AS count
              FROM ${tableName}
              WHERE ${columnName} REGEXP ?
              GROUP BY oldCode, newCode
              ORDER BY count DESC, oldCode
              LIMIT 20
            `,
            [WHITESPACE_REPLACE_REGEXP, WHITESPACE_REGEXP],
          )
        : [];

    summaries.push({
      ...column,
      whitespaceRowCount,
      sampleRewrites,
    });
  }

  return summaries;
}

async function loadMaterialRenames(
  connection: MigrationConnectionLike,
): Promise<MaterialRename[]> {
  const materials = await connection.query<MaterialRow[]>(
    `
      SELECT
        id,
        material_code AS materialCode,
        material_name AS materialName,
        spec_model AS specModel,
        unit_code AS unitCode,
        status
      FROM material
      ORDER BY id
    `,
  );
  const dirtyMaterials = materials.filter((row) =>
    hasWhitespace(row.materialCode),
  );
  const cleanMaterialsByKey = new Map<
    string,
    Array<{ id: number; materialCode: string }>
  >();

  for (const row of materials) {
    if (hasWhitespace(row.materialCode)) {
      continue;
    }

    const key = materialCodeKey(row.materialCode);
    const rows = cleanMaterialsByKey.get(key) ?? [];
    rows.push({ id: row.id, materialCode: row.materialCode });
    cleanMaterialsByKey.set(key, rows);
  }

  const reservedKeys = new Set(cleanMaterialsByKey.keys());
  const reservedCodes = materials
    .filter((row) => !hasWhitespace(row.materialCode))
    .map((row) => row.materialCode);
  const assignedKeys = new Set<string>();
  const assignedCodes = new Set<string>();

  return dirtyMaterials.map((row) => {
    const strippedCode =
      normalizeMaterialCode(row.materialCode) || `MAT-LEGACY-${row.id}`;
    const strippedKey = materialCodeKey(strippedCode);
    const collisionWith = cleanMaterialsByKey.get(strippedKey) ?? [];
    const newCode = allocateNormalizedMaterialCode(
      row,
      reservedKeys,
      assignedKeys,
      reservedCodes,
      assignedCodes,
    );

    return {
      id: row.id,
      oldCode: row.materialCode,
      newCode,
      materialName: row.materialName,
      specModel: row.specModel,
      unitCode: row.unitCode,
      status: row.status,
      collisionAvoided: newCode !== strippedCode,
      collisionWith,
    };
  });
}

function validatePlan(plan: NormalizationPlan): string[] {
  const blockers = [...plan.blockers];
  const targetKeys = new Set<string>();

  for (const rename of plan.materialRenames) {
    if (!rename.newCode) {
      blockers.push(`material#${rename.id} 归一化后编码为空。`);
      continue;
    }

    if (hasWhitespace(rename.newCode)) {
      blockers.push(
        `material#${rename.id} 目标编码仍包含空白字符：${rename.newCode}`,
      );
    }

    if (rename.newCode.length > MATERIAL_CODE_MAX_LENGTH) {
      blockers.push(
        `material#${rename.id} 目标编码超过 ${MATERIAL_CODE_MAX_LENGTH} 位：${rename.newCode}`,
      );
    }

    const key = materialCodeKey(rename.newCode);
    if (targetKeys.has(key)) {
      blockers.push(`多个物料会写入同一个目标编码：${rename.newCode}`);
    }
    targetKeys.add(key);
  }

  return blockers;
}

async function buildPlan(
  connection: MigrationConnectionLike,
): Promise<NormalizationPlan> {
  const codeColumns = await loadCodeColumns(connection);
  const whitespaceColumns = await loadWhitespaceColumnSummaries(
    connection,
    codeColumns,
  );
  const materialRenames = await loadMaterialRenames(connection);
  const plan = {
    blockers: [],
    materialRenames,
    codeColumns,
    whitespaceColumns,
  };

  return {
    ...plan,
    blockers: validatePlan(plan),
  };
}

async function updateMaterialCodes(
  connection: MigrationConnectionLike,
  renames: readonly MaterialRename[],
): Promise<number> {
  let affectedRows = 0;

  for (const rename of renames) {
    const result = await connection.query<UpdateResult>(
      `
        UPDATE material
        SET material_code = ?,
            updated_by = ?,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
          AND material_code = ?
      `,
      [rename.newCode, UPDATED_BY, rename.id, rename.oldCode],
    );
    affectedRows += Number(result.affectedRows ?? 0);
  }

  return affectedRows;
}

async function updateSnapshotCodes(
  connection: MigrationConnectionLike,
  codeColumns: readonly CodeColumn[],
): Promise<SnapshotUpdateSummary[]> {
  const summaries: SnapshotUpdateSummary[] = [];

  for (const column of codeColumns) {
    if (column.columnName !== "material_code_snapshot") {
      continue;
    }

    const tableName = quoteIdentifier(column.tableName);
    const columnName = quoteIdentifier(column.columnName);
    const result = column.hasMaterialId
      ? await connection.query<UpdateResult>(
          `
            UPDATE ${tableName} target_table
            JOIN material ON material.id = target_table.material_id
            SET target_table.${columnName} = material.material_code
            WHERE target_table.${columnName} REGEXP ?
              AND material.material_code NOT REGEXP ?
          `,
          [WHITESPACE_REGEXP, WHITESPACE_REGEXP],
        )
      : await connection.query<UpdateResult>(
          `
            UPDATE ${tableName}
            SET ${columnName} = REGEXP_REPLACE(
              CAST(${columnName} AS CHAR),
              ?,
              ''
            )
            WHERE ${columnName} REGEXP ?
          `,
          [WHITESPACE_REPLACE_REGEXP, WHITESPACE_REGEXP],
        );

    summaries.push({
      tableName: column.tableName,
      columnName: column.columnName,
      affectedRows: Number(result.affectedRows ?? 0),
      mode: column.hasMaterialId
        ? "material-id-master-code"
        : "direct-whitespace-removal",
    });
  }

  return summaries;
}

async function executePlan(
  connection: MigrationConnectionLike,
  plan: NormalizationPlan,
) {
  await connection.beginTransaction();

  try {
    const materialAffectedRows = await updateMaterialCodes(
      connection,
      plan.materialRenames,
    );
    const snapshotUpdates = await updateSnapshotCodes(
      connection,
      plan.codeColumns,
    );
    await connection.commit();

    return {
      materialAffectedRows,
      snapshotUpdates,
      snapshotAffectedRows: snapshotUpdates.reduce(
        (sum, item) => sum + item.affectedRows,
        0,
      ),
    };
  } catch (error) {
    await connection.rollback();
    throw error;
  }
}

async function main() {
  const cliOptions = parseMigrationCliOptions();
  const environment = loadMigrationEnvironment({
    requireLegacyDatabaseUrl: false,
  });
  const databaseName = assertExpectedDatabaseName(
    environment.databaseUrl,
    EXPECTED_TARGET_DATABASE_NAME,
    "target",
  );
  const pool = createMariaDbPool(environment.databaseUrl);
  const reportPath = resolveReportPath(
    cliOptions,
    cliOptions.execute ? EXECUTE_REPORT_FILE_NAME : DRY_RUN_REPORT_FILE_NAME,
  );

  try {
    const report = await withPoolConnection(pool, async (connection) => {
      const plan = await buildPlan(connection);
      const baseReport = {
        databaseName,
        executed: cliOptions.execute,
        plan: {
          blockers: plan.blockers,
          materialRenameCount: plan.materialRenames.length,
          materialRenames: plan.materialRenames,
          whitespaceColumns: plan.whitespaceColumns.filter(
            (column) => column.whitespaceRowCount > 0,
          ),
        },
      };

      if (plan.blockers.length > 0 || !cliOptions.execute) {
        return baseReport;
      }

      const execution = await executePlan(connection, plan);
      const postCheck = await buildPlan(connection);

      return {
        ...baseReport,
        execution,
        postCheck: {
          blockers: postCheck.blockers,
          materialRenameCount: postCheck.materialRenames.length,
          remainingWhitespaceColumns: postCheck.whitespaceColumns.filter(
            (column) => column.whitespaceRowCount > 0,
          ),
        },
      };
    });

    writeStableReport(reportPath, report);
    console.log(JSON.stringify({ reportPath, ...report }, null, 2));

    if (report.plan.blockers.length > 0 && cliOptions.execute) {
      throw new Error("Material code normalization blocked. See report.");
    }
  } finally {
    await closePools(pool);
  }
}

void main();
