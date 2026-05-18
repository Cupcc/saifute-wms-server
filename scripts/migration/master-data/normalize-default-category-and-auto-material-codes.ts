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
} from "../db";
import { writeStableReport } from "../shared/report-writer";

const LEGACY_DEFAULT_CATEGORY_CODES = ["UNCATEGORIZED", "WFL"] as const;
const DEFAULT_CATEGORY_CODE = "15";
const DEFAULT_CATEGORY_NAME = "未分类";
const MIGRATION_ACTOR = "migration-code-normalization";
const LEGACY_RD_AUTO_MATERIAL_PREFIX = "MAT-PROJECT-AUTO-L";
const PREVIOUS_RD_AUTO_MATERIAL_CODE_PATTERN = "^xma[0-9]+$";
const EXISTING_RD_AUTO_MATERIAL_CODE_PATTERN = "^xmbj[0-9]+$";
const DUPLICATE_RD_AUTO_MATERIAL_CODE_PATTERN = "^xm[0-9]+-DUP-[0-9]+$";
const RD_AUTO_MATERIAL_SHORT_PREFIX = "xm";
const MATERIAL_CODE_MAX_LENGTH = 64;
const LEGACY_RD_AUTO_MATERIAL_PATTERN =
  /^MAT-PROJECT-AUTO-L(?<legacyLineId>\d+)-[0-9A-F]+$/u;
const PREVIOUS_RD_AUTO_MATERIAL_PATTERN = /^xma(?<legacyLineId>\d+)$/u;
const EXISTING_RD_AUTO_MATERIAL_PATTERN = /^xmbj(?<legacyLineId>\d+)$/u;
const DUPLICATE_RD_AUTO_MATERIAL_PATTERN = /^xm(?<legacyLineId>\d+)-DUP-\d+$/u;
const NUMERIC_RD_AUTO_MATERIAL_PATTERN = /^xm(?<sequence>\d+)$/u;

const MATERIAL_CODE_SNAPSHOT_TABLES = [
  "stock_in_order_line",
  "sales_stock_order_line",
  "sales_project_material_line",
  "workshop_material_order_line",
  "rd_project_material_line",
  "rd_project_bom_line",
  "rd_project_material_action_line",
  "rd_handoff_order_line",
  "rd_procurement_request_line",
  "rd_stocktake_order_line",
] as const;

const CATEGORY_CODE_SNAPSHOT_TABLES = [
  "stock_in_order_line",
  "sales_stock_order_line",
] as const;

interface CategoryRow {
  id: number;
  categoryCode: string;
  categoryName: string;
  status: string;
}

interface MaterialRow {
  id: number;
  materialCode: string;
  materialName: string;
  specModel: string | null;
  unitCode: string;
}

interface CountRow {
  count: number | string;
}

interface DistinctCodeRow {
  code: string;
}

interface UpdateResult {
  affectedRows?: number;
}

interface MaterialRename {
  id: number;
  oldCode: string;
  newCode: string;
  materialName: string;
  specModel: string | null;
  unitCode: string;
}

interface SnapshotTableSummary {
  tableName: string;
  rowCount: number;
  distinctCodeCount?: number;
  unknownCodes?: string[];
}

interface CategoryReferenceCount {
  materialCount: number;
  stockInSnapshotCount: number;
  salesSnapshotCount: number;
  total: number;
}

interface NormalizationPlan {
  blockers: string[];
  category: {
    rows: CategoryRow[];
    masterRename: {
      id: number;
      oldCode: string;
      newCode: string;
      deleteDuplicateIds?: number[];
      duplicateReferenceCounts?: Array<{
        id: number;
        code: string;
        references: CategoryReferenceCount;
      }>;
    } | null;
    snapshotTables: SnapshotTableSummary[];
  };
  material: {
    renameCount: number;
    sampleRenames: MaterialRename[];
    snapshotTables: SnapshotTableSummary[];
  };
  materialRenames: MaterialRename[];
}

function toCount(row: CountRow | undefined): number {
  return Number(row?.count ?? 0);
}

function quoteIdentifier(identifier: string): string {
  return `\`${identifier}\``;
}

function buildPlaceholders(values: readonly unknown[]): string {
  return values.map(() => "?").join(", ");
}

function toMaterialCodeKey(value: string): string {
  return value.trim().toLocaleLowerCase("en-US");
}

function parseNumericAutoMaterialSequence(code: string): number | null {
  const match = NUMERIC_RD_AUTO_MATERIAL_PATTERN.exec(code);
  const sequence = Number(match?.groups?.sequence ?? Number.NaN);
  return Number.isSafeInteger(sequence) && sequence > 0 ? sequence : null;
}

function resolveNextAutoMaterialSequence(
  materialCodeKeys: ReadonlySet<string>,
): number {
  let maxSequence = 0;

  for (const materialCodeKey of materialCodeKeys) {
    const sequence = parseNumericAutoMaterialSequence(materialCodeKey);
    if (sequence !== null && sequence > maxSequence) {
      maxSequence = sequence;
    }
  }

  return maxSequence + 1;
}

function allocateAutoMaterialCode(
  seedCode: string,
  reservedKeys: ReadonlySet<string>,
  assignedKeys: Set<string>,
  sequenceState: { nextSequence: number },
): string {
  const seedKey = toMaterialCodeKey(seedCode);
  if (!reservedKeys.has(seedKey) && !assignedKeys.has(seedKey)) {
    assignedKeys.add(seedKey);
    const seedSequence = parseNumericAutoMaterialSequence(seedKey);
    if (seedSequence !== null && seedSequence >= sequenceState.nextSequence) {
      sequenceState.nextSequence = seedSequence + 1;
    }
    return seedCode;
  }

  while (true) {
    const candidateCode = `${RD_AUTO_MATERIAL_SHORT_PREFIX}${sequenceState.nextSequence}`;
    if (candidateCode.length > MATERIAL_CODE_MAX_LENGTH) {
      throw new Error(
        `Material code ${candidateCode} exceeds the column length.`,
      );
    }
    const candidateKey = toMaterialCodeKey(candidateCode);
    sequenceState.nextSequence += 1;

    if (!reservedKeys.has(candidateKey) && !assignedKeys.has(candidateKey)) {
      assignedKeys.add(candidateKey);
      return candidateCode;
    }
  }
}

function buildShortAutoMaterialCode(materialCode: string): string | null {
  const match =
    LEGACY_RD_AUTO_MATERIAL_PATTERN.exec(materialCode) ??
    PREVIOUS_RD_AUTO_MATERIAL_PATTERN.exec(materialCode) ??
    EXISTING_RD_AUTO_MATERIAL_PATTERN.exec(materialCode) ??
    DUPLICATE_RD_AUTO_MATERIAL_PATTERN.exec(materialCode);
  const legacyLineId = match?.groups?.legacyLineId;
  return legacyLineId
    ? `${RD_AUTO_MATERIAL_SHORT_PREFIX}${legacyLineId}`
    : null;
}

async function countRows(
  connection: MigrationConnectionLike,
  sql: string,
  values: readonly unknown[] = [],
): Promise<number> {
  const rows = await connection.query<CountRow[]>(sql, values);
  return toCount(rows[0]);
}

async function countCategoryReferences(
  connection: MigrationConnectionLike,
  categoryId: number,
): Promise<CategoryReferenceCount> {
  const materialCount = await countRows(
    connection,
    "SELECT COUNT(*) AS count FROM material WHERE category_id = ?",
    [categoryId],
  );
  const stockInSnapshotCount = await countRows(
    connection,
    `
      SELECT COUNT(*) AS count
      FROM stock_in_order_line
      WHERE material_category_id_snapshot = ?
    `,
    [categoryId],
  );
  const salesSnapshotCount = await countRows(
    connection,
    `
      SELECT COUNT(*) AS count
      FROM sales_stock_order_line
      WHERE material_category_id_snapshot = ?
    `,
    [categoryId],
  );

  return {
    materialCount,
    stockInSnapshotCount,
    salesSnapshotCount,
    total: materialCount + stockInSnapshotCount + salesSnapshotCount,
  };
}

async function loadCategoryPlan(
  connection: MigrationConnectionLike,
  blockers: string[],
) {
  const categoryCodeCandidates = [
    ...LEGACY_DEFAULT_CATEGORY_CODES,
    DEFAULT_CATEGORY_CODE,
  ];
  const rows = await connection.query<CategoryRow[]>(
    `
      SELECT
        id,
        category_code AS categoryCode,
        category_name AS categoryName,
        status
      FROM material_category
      WHERE category_code IN (${buildPlaceholders(categoryCodeCandidates)})
        OR category_name = ?
      ORDER BY id
    `,
    [...categoryCodeCandidates, DEFAULT_CATEGORY_NAME],
  );
  const legacyDefaults = rows.filter((row) =>
    LEGACY_DEFAULT_CATEGORY_CODES.includes(
      row.categoryCode as (typeof LEGACY_DEFAULT_CATEGORY_CODES)[number],
    ),
  );
  const currentDefault = rows.find(
    (row) => row.categoryCode === DEFAULT_CATEGORY_CODE,
  );
  let masterRename: NormalizationPlan["category"]["masterRename"] = null;

  if (legacyDefaults.length > 0) {
    const legacyDefaultsWithReferences = await Promise.all(
      legacyDefaults.map(async (row) => ({
        row,
        references: await countCategoryReferences(connection, row.id),
      })),
    );
    const referencedLegacyDefaults = legacyDefaultsWithReferences.filter(
      (item) => item.references.total > 0,
    );

    if (currentDefault && referencedLegacyDefaults.length > 0) {
      const currentDefaultReferences = await countCategoryReferences(
        connection,
        currentDefault.id,
      );
      if (
        currentDefaultReferences.total === 0 &&
        referencedLegacyDefaults.length === 1
      ) {
        const primaryLegacyDefault = referencedLegacyDefaults[0];
        const duplicateLegacyDefaults = legacyDefaultsWithReferences.filter(
          (item) => item.row.id !== primaryLegacyDefault.row.id,
        );
        masterRename = {
          id: primaryLegacyDefault.row.id,
          oldCode: primaryLegacyDefault.row.categoryCode,
          newCode: DEFAULT_CATEGORY_CODE,
          deleteDuplicateIds: [
            currentDefault.id,
            ...duplicateLegacyDefaults.map((item) => item.row.id),
          ],
          duplicateReferenceCounts: [
            {
              id: currentDefault.id,
              code: currentDefault.categoryCode,
              references: currentDefaultReferences,
            },
            ...duplicateLegacyDefaults.map((item) => ({
              id: item.row.id,
              code: item.row.categoryCode,
              references: item.references,
            })),
          ],
        };
      } else {
        blockers.push(
          `默认分类编码冲突：${DEFAULT_CATEGORY_CODE}#${currentDefault.id} 已存在，但旧默认分类仍有引用：${referencedLegacyDefaults
            .map(
              (item) =>
                `${item.row.categoryCode}#${item.row.id}(${item.references.total})`,
            )
            .join(", ")}。`,
        );
      }
    } else if (!currentDefault) {
      const primaryLegacyDefault = [...legacyDefaultsWithReferences].sort(
        (left, right) =>
          right.references.total - left.references.total ||
          left.row.id - right.row.id,
      )[0];
      const duplicateLegacyDefaults = legacyDefaultsWithReferences.filter(
        (item) => item.row.id !== primaryLegacyDefault.row.id,
      );
      const referencedDuplicates = duplicateLegacyDefaults.filter(
        (item) => item.references.total > 0,
      );

      if (referencedDuplicates.length > 0) {
        blockers.push(
          `多个旧默认分类都有引用，不能自动选择合并目标：${referencedDuplicates
            .map(
              (item) =>
                `${item.row.categoryCode}#${item.row.id}(${item.references.total})`,
            )
            .join(", ")}。`,
        );
      } else {
        masterRename = {
          id: primaryLegacyDefault.row.id,
          oldCode: primaryLegacyDefault.row.categoryCode,
          newCode: DEFAULT_CATEGORY_CODE,
          deleteDuplicateIds: duplicateLegacyDefaults.map(
            (item) => item.row.id,
          ),
          duplicateReferenceCounts: duplicateLegacyDefaults.map((item) => ({
            id: item.row.id,
            code: item.row.categoryCode,
            references: item.references,
          })),
        };
      }
    }
  }

  const snapshotTables: SnapshotTableSummary[] = [];
  for (const tableName of CATEGORY_CODE_SNAPSHOT_TABLES) {
    const quotedTableName = quoteIdentifier(tableName);
    const rowCount = await countRows(
      connection,
      `
        SELECT COUNT(*) AS count
        FROM ${quotedTableName}
        WHERE material_category_code_snapshot IN (${buildPlaceholders(
          LEGACY_DEFAULT_CATEGORY_CODES,
        )})
          OR ${LEGACY_DEFAULT_CATEGORY_CODES.map(
            () => "material_category_path_snapshot LIKE ?",
          ).join(" OR ")}
      `,
      [
        ...LEGACY_DEFAULT_CATEGORY_CODES,
        ...LEGACY_DEFAULT_CATEGORY_CODES.map((code) => `%${code}%`),
      ],
    );
    snapshotTables.push({ tableName, rowCount });
  }

  return {
    rows,
    masterRename,
    snapshotTables,
  };
}

async function loadMaterialRenames(
  connection: MigrationConnectionLike,
  blockers: string[],
): Promise<MaterialRename[]> {
  const rows = await connection.query<MaterialRow[]>(
    `
      SELECT
        id,
        material_code AS materialCode,
        material_name AS materialName,
        spec_model AS specModel,
        unit_code AS unitCode
      FROM material
      WHERE material_code LIKE ?
        OR material_code REGEXP ?
        OR material_code REGEXP ?
        OR material_code REGEXP ?
      ORDER BY id
    `,
    [
      `${LEGACY_RD_AUTO_MATERIAL_PREFIX}%`,
      PREVIOUS_RD_AUTO_MATERIAL_CODE_PATTERN,
      EXISTING_RD_AUTO_MATERIAL_CODE_PATTERN,
      DUPLICATE_RD_AUTO_MATERIAL_CODE_PATTERN,
    ],
  );
  const renames: MaterialRename[] = [];
  const sourceCodeKeys = new Set(
    rows.map((row) => toMaterialCodeKey(row.materialCode)),
  );
  const materialCodeRows = await connection.query<DistinctCodeRow[]>(
    `
      SELECT material_code AS code
      FROM material
      ORDER BY material_code
    `,
  );
  const reservedKeys = new Set(
    materialCodeRows
      .map((row) => toMaterialCodeKey(row.code))
      .filter((codeKey) => !sourceCodeKeys.has(codeKey)),
  );
  const assignedKeys = new Set<string>();
  const sequenceState = {
    nextSequence: resolveNextAutoMaterialSequence(
      new Set(materialCodeRows.map((row) => toMaterialCodeKey(row.code))),
    ),
  };

  for (const row of rows) {
    const seedCode = buildShortAutoMaterialCode(row.materialCode);
    if (!seedCode) {
      blockers.push(
        `无法解析自动物料编码：material#${row.id} ${row.materialCode}`,
      );
      continue;
    }

    const newCode = allocateAutoMaterialCode(
      seedCode,
      reservedKeys,
      assignedKeys,
      sequenceState,
    );
    const rename = {
      id: row.id,
      oldCode: row.materialCode,
      newCode,
      materialName: row.materialName,
      specModel: row.specModel,
      unitCode: row.unitCode,
    };
    renames.push(rename);
  }

  return renames;
}

async function loadMaterialSnapshotPlan(
  connection: MigrationConnectionLike,
  renames: MaterialRename[],
  blockers: string[],
): Promise<SnapshotTableSummary[]> {
  const knownOldCodeKeys = new Set(
    renames.map((rename) => toMaterialCodeKey(rename.oldCode)),
  );
  const snapshotTables: SnapshotTableSummary[] = [];

  for (const tableName of MATERIAL_CODE_SNAPSHOT_TABLES) {
    const quotedTableName = quoteIdentifier(tableName);
    const rowCount = await countRows(
      connection,
      `
        SELECT COUNT(*) AS count
        FROM ${quotedTableName}
        WHERE material_code_snapshot LIKE ?
          OR material_code_snapshot REGEXP ?
          OR material_code_snapshot REGEXP ?
          OR material_code_snapshot REGEXP ?
      `,
      [
        `${LEGACY_RD_AUTO_MATERIAL_PREFIX}%`,
        PREVIOUS_RD_AUTO_MATERIAL_CODE_PATTERN,
        EXISTING_RD_AUTO_MATERIAL_CODE_PATTERN,
        DUPLICATE_RD_AUTO_MATERIAL_CODE_PATTERN,
      ],
    );
    const codeRows = await connection.query<DistinctCodeRow[]>(
      `
        SELECT DISTINCT material_code_snapshot AS code
        FROM ${quotedTableName}
        WHERE material_code_snapshot LIKE ?
          OR material_code_snapshot REGEXP ?
          OR material_code_snapshot REGEXP ?
          OR material_code_snapshot REGEXP ?
        ORDER BY material_code_snapshot
      `,
      [
        `${LEGACY_RD_AUTO_MATERIAL_PREFIX}%`,
        PREVIOUS_RD_AUTO_MATERIAL_CODE_PATTERN,
        EXISTING_RD_AUTO_MATERIAL_CODE_PATTERN,
        DUPLICATE_RD_AUTO_MATERIAL_CODE_PATTERN,
      ],
    );
    const unknownCodes = codeRows
      .map((row) => row.code)
      .filter((code) => !knownOldCodeKeys.has(toMaterialCodeKey(code)));

    if (unknownCodes.length > 0) {
      blockers.push(
        `${tableName} 存在没有主数据映射的自动物料快照：${unknownCodes
          .slice(0, 10)
          .join(", ")}`,
      );
    }

    snapshotTables.push({
      tableName,
      rowCount,
      distinctCodeCount: codeRows.length,
      unknownCodes: unknownCodes.slice(0, 20),
    });
  }

  return snapshotTables;
}

async function buildPlan(
  connection: MigrationConnectionLike,
): Promise<NormalizationPlan> {
  const blockers: string[] = [];
  const category = await loadCategoryPlan(connection, blockers);
  const materialRenames = await loadMaterialRenames(connection, blockers);
  const materialSnapshotTables = await loadMaterialSnapshotPlan(
    connection,
    materialRenames,
    blockers,
  );

  return {
    blockers,
    category,
    material: {
      renameCount: materialRenames.length,
      sampleRenames: materialRenames.slice(0, 20),
      snapshotTables: materialSnapshotTables,
    },
    materialRenames,
  };
}

async function updateDefaultCategory(
  connection: MigrationConnectionLike,
  plan: NormalizationPlan,
): Promise<number> {
  let affectedRows = 0;

  if (plan.category.masterRename) {
    for (const duplicateId of plan.category.masterRename.deleteDuplicateIds ??
      []) {
      const deleteResult = await connection.query<UpdateResult>(
        `
          DELETE FROM material_category
          WHERE id = ?
            AND category_code IN (${buildPlaceholders([
              ...LEGACY_DEFAULT_CATEGORY_CODES,
              DEFAULT_CATEGORY_CODE,
            ])})
        `,
        [duplicateId, ...LEGACY_DEFAULT_CATEGORY_CODES, DEFAULT_CATEGORY_CODE],
      );
      affectedRows += Number(deleteResult.affectedRows ?? 0);
    }

    const result = await connection.query<UpdateResult>(
      `
        UPDATE material_category
        SET category_code = ?,
            updated_by = ?,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
          AND category_code = ?
      `,
      [
        DEFAULT_CATEGORY_CODE,
        MIGRATION_ACTOR,
        plan.category.masterRename.id,
        plan.category.masterRename.oldCode,
      ],
    );
    affectedRows += Number(result.affectedRows ?? 0);
  }

  for (const tableName of CATEGORY_CODE_SNAPSHOT_TABLES) {
    for (const legacyCode of LEGACY_DEFAULT_CATEGORY_CODES) {
      const result = await connection.query<UpdateResult>(
        `
          UPDATE ${quoteIdentifier(tableName)}
          SET material_category_code_snapshot =
                CASE
                  WHEN material_category_code_snapshot = ? THEN ?
                  ELSE material_category_code_snapshot
                END,
              material_category_path_snapshot =
                CASE
                  WHEN material_category_path_snapshot IS NULL THEN NULL
                  ELSE REPLACE(
                    REPLACE(
                      CAST(material_category_path_snapshot AS CHAR),
                      ?,
                      ?
                    ),
                    ?,
                    ?
                  )
                END
          WHERE material_category_code_snapshot = ?
            OR material_category_path_snapshot LIKE ?
        `,
        [
          legacyCode,
          DEFAULT_CATEGORY_CODE,
          `"categoryCode":"${legacyCode}"`,
          `"categoryCode":"${DEFAULT_CATEGORY_CODE}"`,
          `"code":"${legacyCode}"`,
          `"code":"${DEFAULT_CATEGORY_CODE}"`,
          legacyCode,
          `%${legacyCode}%`,
        ],
      );
      affectedRows += Number(result.affectedRows ?? 0);
    }
  }

  return affectedRows;
}

async function updateAutoMaterialCodes(
  connection: MigrationConnectionLike,
  renames: MaterialRename[],
): Promise<number> {
  let affectedRows = 0;

  for (const rename of renames) {
    const materialResult = await connection.query<UpdateResult>(
      `
        UPDATE material
        SET material_code = ?,
            updated_by = ?,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
          AND material_code = ?
      `,
      [rename.newCode, MIGRATION_ACTOR, rename.id, rename.oldCode],
    );
    affectedRows += Number(materialResult.affectedRows ?? 0);

    for (const tableName of MATERIAL_CODE_SNAPSHOT_TABLES) {
      const snapshotResult = await connection.query<UpdateResult>(
        `
          UPDATE ${quoteIdentifier(tableName)}
          SET material_code_snapshot = ?
          WHERE material_code_snapshot = ?
        `,
        [rename.newCode, rename.oldCode],
      );
      affectedRows += Number(snapshotResult.affectedRows ?? 0);
    }
  }

  return affectedRows;
}

async function executePlan(
  connection: MigrationConnectionLike,
  plan: NormalizationPlan,
) {
  await connection.beginTransaction();

  try {
    const categoryAffectedRows = await updateDefaultCategory(connection, plan);
    const materialAffectedRows = await updateAutoMaterialCodes(
      connection,
      plan.materialRenames,
    );
    await connection.commit();
    return {
      categoryAffectedRows,
      materialAffectedRows,
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
    "normalize-default-category-and-auto-material-codes-report.json",
  );

  try {
    const report = await (async () => {
      const connection = await pool.getConnection();
      try {
        const plan = await buildPlan(connection);
        const baseReport = {
          executed: cliOptions.execute,
          databaseName,
          constants: {
            legacyDefaultCategoryCodes: LEGACY_DEFAULT_CATEGORY_CODES,
            defaultCategoryCode: DEFAULT_CATEGORY_CODE,
            legacyRdAutoMaterialPrefix: LEGACY_RD_AUTO_MATERIAL_PREFIX,
            previousRdAutoMaterialPattern:
              PREVIOUS_RD_AUTO_MATERIAL_CODE_PATTERN,
            existingRdAutoMaterialPattern:
              EXISTING_RD_AUTO_MATERIAL_CODE_PATTERN,
            duplicateRdAutoMaterialPattern:
              DUPLICATE_RD_AUTO_MATERIAL_CODE_PATTERN,
            rdAutoMaterialShortPrefix: RD_AUTO_MATERIAL_SHORT_PREFIX,
          },
          blockers: plan.blockers,
          category: plan.category,
          material: plan.material,
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
            category: postCheck.category,
            material: postCheck.material,
          },
        };
      } finally {
        connection.release();
      }
    })();

    writeStableReport(reportPath, report);
    console.log(JSON.stringify({ reportPath, ...report }, null, 2));

    if (report.blockers.length > 0 && cliOptions.execute) {
      throw new Error("Code normalization execute blocked. See report.");
    }
  } finally {
    await closePools(pool);
  }
}

void main();
