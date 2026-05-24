import {
  assertExpectedDatabaseName,
  EXPECTED_TARGET_DATABASE_NAME,
  loadMigrationEnvironment,
  parseMigrationCliOptions,
  resolveReportPath,
} from "./config";
import {
  closePools,
  createMariaDbPool,
  type MigrationConnectionLike,
  withPoolConnection,
} from "./db";
import { writeStableReport } from "./shared/report-writer";

const OLD_PREFIX = "PRJ-LEGACY-";
const NEW_PREFIX = "XMBH-";
const SALES_PROJECT_TARGET_TYPE = "SALES_PROJECT";
const MIGRATION_ACTOR = "migration-project-code-prefix-backfill";

interface CountRow {
  count: number | string;
}

interface SalesProjectRow {
  id: number;
  salesProjectCode: string;
  salesProjectName: string;
  projectTargetId: number | null;
}

interface RdProjectRow {
  id: number;
  projectCode: string;
  projectName: string;
}

interface ProjectTargetRow {
  id: number;
  targetCode: string;
  sourceDocumentId: number;
}

interface ProjectCodeRename {
  id: number;
  oldCode: string;
  newCode: string;
  name: string;
  projectTargetId?: number | null;
}

interface ReportMetric {
  metric: string;
  count: number;
}

interface BackfillPlan {
  blockers: string[];
  salesProjects: {
    renameCount: number;
    sample: ProjectCodeRename[];
  };
  rdProjects: {
    renameCount: number;
    sample: ProjectCodeRename[];
  };
  impactedRows: ReportMetric[];
}

function quote(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

function toCount(row: CountRow | undefined): number {
  return Number(row?.count ?? 0);
}

function renameLegacyCode(code: string): string {
  if (!code.startsWith(OLD_PREFIX)) {
    return code;
  }
  return `${NEW_PREFIX}${code.slice(OLD_PREFIX.length)}`;
}

async function countRows(
  connection: MigrationConnectionLike,
  sql: string,
  values: readonly unknown[] = [],
): Promise<number> {
  const rows = await connection.query<CountRow[]>(sql, values);
  return toCount(rows[0]);
}

async function readSalesProjects(
  connection: MigrationConnectionLike,
): Promise<ProjectCodeRename[]> {
  const rows = await connection.query<SalesProjectRow[]>(
    `
      SELECT
        id,
        sales_project_code AS salesProjectCode,
        sales_project_name AS salesProjectName,
        project_target_id AS projectTargetId
      FROM sales_project
      WHERE sales_project_code LIKE ?
      ORDER BY id ASC
    `,
    [`${OLD_PREFIX}%`],
  );

  return rows.map((row) => ({
    id: row.id,
    oldCode: row.salesProjectCode,
    newCode: renameLegacyCode(row.salesProjectCode),
    name: row.salesProjectName,
    projectTargetId: row.projectTargetId,
  }));
}

async function readRdProjects(
  connection: MigrationConnectionLike,
): Promise<ProjectCodeRename[]> {
  const rows = await connection.query<RdProjectRow[]>(
    `
      SELECT
        id,
        project_code AS projectCode,
        project_name AS projectName
      FROM rd_project
      WHERE project_code LIKE ?
      ORDER BY id ASC
    `,
    [`${OLD_PREFIX}%`],
  );

  return rows.map((row) => ({
    id: row.id,
    oldCode: row.projectCode,
    newCode: renameLegacyCode(row.projectCode),
    name: row.projectName,
  }));
}

async function readSalesProjectTargets(
  connection: MigrationConnectionLike,
): Promise<ProjectTargetRow[]> {
  return connection.query<ProjectTargetRow[]>(
    `
      SELECT
        id,
        target_code AS targetCode,
        source_document_id AS sourceDocumentId
      FROM project_target
      WHERE target_type = ?
        AND target_code LIKE ?
      ORDER BY id ASC
    `,
    [SALES_PROJECT_TARGET_TYPE, `${OLD_PREFIX}%`],
  );
}

async function readImpactMetrics(
  connection: MigrationConnectionLike,
): Promise<ReportMetric[]> {
  return [
    {
      metric: "sales_project.sales_project_code",
      count: await countRows(
        connection,
        `
          SELECT COUNT(*) AS count
          FROM sales_project
          WHERE sales_project_code LIKE ?
        `,
        [`${OLD_PREFIX}%`],
      ),
    },
    {
      metric: "project_target.target_code",
      count: await countRows(
        connection,
        `
          SELECT COUNT(*) AS count
          FROM project_target
          WHERE target_type = ?
            AND target_code LIKE ?
        `,
        [SALES_PROJECT_TARGET_TYPE, `${OLD_PREFIX}%`],
      ),
    },
    {
      metric: "stock_in_order.sales_project_code_snapshot",
      count: await countRows(
        connection,
        `
          SELECT COUNT(*) AS count
          FROM stock_in_order
          WHERE sales_project_code_snapshot LIKE ?
        `,
        [`${OLD_PREFIX}%`],
      ),
    },
    {
      metric: "rd_project.project_code",
      count: await countRows(
        connection,
        `
          SELECT COUNT(*) AS count
          FROM rd_project
          WHERE project_code LIKE ?
        `,
        [`${OLD_PREFIX}%`],
      ),
    },
  ];
}

function buildCollisionCodeSet(
  renames: readonly ProjectCodeRename[],
): Set<string> {
  return new Set(renames.map((item) => item.newCode));
}

async function assertNoSalesProjectCollisions(
  connection: MigrationConnectionLike,
  renames: readonly ProjectCodeRename[],
): Promise<string[]> {
  if (renames.length === 0) {
    return [];
  }

  const newCodes = [...buildCollisionCodeSet(renames)];
  const placeholders = newCodes.map(() => "?").join(", ");
  const rows = await connection.query<
    Array<{ id: number; salesProjectCode: string }>
  >(
    `
      SELECT id, sales_project_code AS salesProjectCode
      FROM sales_project
      WHERE sales_project_code IN (${placeholders})
        AND sales_project_code NOT LIKE ?
    `,
    [...newCodes, `${OLD_PREFIX}%`],
  );

  return rows.map(
    (row) =>
      `sales_project collision: id=${row.id} already uses ${row.salesProjectCode}`,
  );
}

async function assertNoRdProjectCollisions(
  connection: MigrationConnectionLike,
  renames: readonly ProjectCodeRename[],
): Promise<string[]> {
  if (renames.length === 0) {
    return [];
  }

  const newCodes = [...buildCollisionCodeSet(renames)];
  const placeholders = newCodes.map(() => "?").join(", ");
  const rows = await connection.query<
    Array<{ id: number; projectCode: string }>
  >(
    `
      SELECT id, project_code AS projectCode
      FROM rd_project
      WHERE project_code IN (${placeholders})
        AND project_code NOT LIKE ?
    `,
    [...newCodes, `${OLD_PREFIX}%`],
  );

  return rows.map(
    (row) =>
      `rd_project collision: id=${row.id} already uses ${row.projectCode}`,
  );
}

async function assertNoProjectTargetCollisions(
  connection: MigrationConnectionLike,
  renames: readonly ProjectCodeRename[],
): Promise<string[]> {
  if (renames.length === 0) {
    return [];
  }

  const newCodes = [...buildCollisionCodeSet(renames)];
  const placeholders = newCodes.map(() => "?").join(", ");
  const rows = await connection.query<
    Array<{ id: number; targetCode: string; targetType: string }>
  >(
    `
      SELECT id, target_code AS targetCode, target_type AS targetType
      FROM project_target
      WHERE target_code IN (${placeholders})
        AND target_code NOT LIKE ?
    `,
    [...newCodes, `${OLD_PREFIX}%`],
  );

  return rows.map(
    (row) =>
      `project_target collision: id=${row.id} type=${row.targetType} already uses ${row.targetCode}`,
  );
}

function validateSalesTargets(
  salesRenames: readonly ProjectCodeRename[],
  targetRows: readonly ProjectTargetRow[],
): string[] {
  const blockers: string[] = [];
  const targetById = new Map(targetRows.map((row) => [row.id, row] as const));

  for (const project of salesRenames) {
    if (!project.projectTargetId) {
      blockers.push(`sales_project id=${project.id} missing projectTargetId`);
      continue;
    }

    const target = targetById.get(project.projectTargetId);
    if (!target) {
      blockers.push(
        `sales_project id=${project.id} missing project_target row id=${project.projectTargetId}`,
      );
      continue;
    }

    if (target.sourceDocumentId !== project.id) {
      blockers.push(
        `project_target id=${target.id} sourceDocumentId=${target.sourceDocumentId} does not match sales_project id=${project.id}`,
      );
    }

    if (target.targetCode !== project.oldCode) {
      blockers.push(
        `project_target id=${target.id} code mismatch: target=${target.targetCode}, sales_project=${project.oldCode}`,
      );
    }
  }

  return blockers;
}

async function buildBackfillPlan(
  connection: MigrationConnectionLike,
): Promise<BackfillPlan> {
  const [salesRenames, rdRenames, targetRows, impactedRows] = await Promise.all(
    [
      readSalesProjects(connection),
      readRdProjects(connection),
      readSalesProjectTargets(connection),
      readImpactMetrics(connection),
    ],
  );

  const blockers = [
    ...validateSalesTargets(salesRenames, targetRows),
    ...(await assertNoSalesProjectCollisions(connection, salesRenames)),
    ...(await assertNoRdProjectCollisions(connection, rdRenames)),
    ...(await assertNoProjectTargetCollisions(connection, salesRenames)),
  ];

  return {
    blockers,
    salesProjects: {
      renameCount: salesRenames.length,
      sample: salesRenames.slice(0, 10),
    },
    rdProjects: {
      renameCount: rdRenames.length,
      sample: rdRenames.slice(0, 10),
    },
    impactedRows,
  };
}

async function executeBackfill(
  connection: MigrationConnectionLike,
): Promise<Record<string, number>> {
  const salesProjectUpdated = await connection.query(
    `
      UPDATE sales_project
      SET
        sales_project_code = CONCAT(?, SUBSTRING(sales_project_code, ?)),
        updated_by = ?,
        updated_at = NOW()
      WHERE sales_project_code LIKE ?
    `,
    [NEW_PREFIX, OLD_PREFIX.length + 1, MIGRATION_ACTOR, `${OLD_PREFIX}%`],
  );

  const projectTargetUpdated = await connection.query(
    `
      UPDATE project_target
      SET
        target_code = CONCAT(?, SUBSTRING(target_code, ?)),
        updated_by = ?,
        updated_at = NOW()
      WHERE target_type = ?
        AND target_code LIKE ?
    `,
    [
      NEW_PREFIX,
      OLD_PREFIX.length + 1,
      MIGRATION_ACTOR,
      SALES_PROJECT_TARGET_TYPE,
      `${OLD_PREFIX}%`,
    ],
  );

  const stockInSnapshotUpdated = await connection.query(
    `
      UPDATE stock_in_order
      SET
        sales_project_code_snapshot = CONCAT(?, SUBSTRING(sales_project_code_snapshot, ?)),
        updated_by = ?,
        updated_at = NOW()
      WHERE sales_project_code_snapshot LIKE ?
    `,
    [NEW_PREFIX, OLD_PREFIX.length + 1, MIGRATION_ACTOR, `${OLD_PREFIX}%`],
  );

  const rdProjectUpdated = await connection.query(
    `
      UPDATE rd_project
      SET
        project_code = CONCAT(?, SUBSTRING(project_code, ?)),
        updated_by = ?,
        updated_at = NOW()
      WHERE project_code LIKE ?
    `,
    [NEW_PREFIX, OLD_PREFIX.length + 1, MIGRATION_ACTOR, `${OLD_PREFIX}%`],
  );

  return {
    salesProjectUpdated: Number(
      (salesProjectUpdated as { affectedRows?: number }).affectedRows ?? 0,
    ),
    projectTargetUpdated: Number(
      (projectTargetUpdated as { affectedRows?: number }).affectedRows ?? 0,
    ),
    stockInSnapshotUpdated: Number(
      (stockInSnapshotUpdated as { affectedRows?: number }).affectedRows ?? 0,
    ),
    rdProjectUpdated: Number(
      (rdProjectUpdated as { affectedRows?: number }).affectedRows ?? 0,
    ),
  };
}

async function main(): Promise<void> {
  const cliOptions = parseMigrationCliOptions();
  const reportPath = resolveReportPath(
    cliOptions,
    cliOptions.execute
      ? "project-code-prefix-backfill-execute-report.json"
      : "project-code-prefix-backfill-dry-run-report.json",
  );
  const env = loadMigrationEnvironment({ requireLegacyDatabaseUrl: false });
  const targetDatabaseName = assertExpectedDatabaseName(
    env.databaseUrl,
    EXPECTED_TARGET_DATABASE_NAME,
    "Target",
  );
  const targetPool = createMariaDbPool(env.databaseUrl);

  try {
    const plan = await withPoolConnection(targetPool, buildBackfillPlan);
    const baseReport = {
      mode: cliOptions.execute ? "execute" : "dry-run",
      targetDatabaseName,
      oldPrefix: OLD_PREFIX,
      newPrefix: NEW_PREFIX,
      ...plan,
    };

    if (!cliOptions.execute) {
      writeStableReport(reportPath, baseReport);
      console.log(
        `Project code prefix backfill dry-run completed. report=${reportPath}`,
      );
      if (plan.blockers.length > 0) {
        process.exitCode = 1;
      }
      return;
    }

    if (plan.blockers.length > 0) {
      writeStableReport(reportPath, baseReport);
      throw new Error(
        `Project code prefix backfill blocked: ${plan.blockers.join(" | ")}`,
      );
    }

    const executionReport = await withPoolConnection(
      targetPool,
      async (connection) => {
        await connection.beginTransaction();
        try {
          const updatedRows = await executeBackfill(connection);
          const verification = await buildBackfillPlan(connection);
          await connection.commit();
          return {
            ...baseReport,
            updatedRows,
            verification,
          };
        } catch (error) {
          await connection.rollback();
          throw error;
        }
      },
    );

    writeStableReport(reportPath, executionReport);
    console.log(
      `Project code prefix backfill execute completed. report=${reportPath}`,
    );
  } finally {
    await closePools(targetPool);
  }
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
