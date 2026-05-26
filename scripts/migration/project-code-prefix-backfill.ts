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
const SALES_PROJECT_NEW_PREFIX = "XMBH-";
const RD_PROJECT_NEW_PREFIX = "YFXMBH-";
const SALES_PROJECT_SOURCE_PREFIXES = [OLD_PREFIX] as const;
const RD_PROJECT_SOURCE_PREFIXES = [
  OLD_PREFIX,
  SALES_PROJECT_NEW_PREFIX,
] as const;
const SALES_PROJECT_TARGET_TYPE = "SALES_PROJECT";
const RD_PROJECT_TARGET_TYPE = "RD_PROJECT";
const MIGRATION_ACTOR = "migration-project-code-prefix-backfill";

interface PrefixRename {
  sourcePrefix: string;
  newPrefix: string;
}

const SALES_PROJECT_PREFIX_RENAMES: readonly PrefixRename[] = [
  { sourcePrefix: OLD_PREFIX, newPrefix: SALES_PROJECT_NEW_PREFIX },
];
const RD_PROJECT_PREFIX_RENAMES: readonly PrefixRename[] = [
  { sourcePrefix: OLD_PREFIX, newPrefix: RD_PROJECT_NEW_PREFIX },
  { sourcePrefix: SALES_PROJECT_NEW_PREFIX, newPrefix: RD_PROJECT_NEW_PREFIX },
];

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
  projectTargetId: number | null;
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

function toCount(row: CountRow | undefined): number {
  return Number(row?.count ?? 0);
}

function buildPrefixWhere(columnName: string, prefixes: readonly string[]) {
  return prefixes.map(() => `${columnName} LIKE ?`).join(" OR ");
}

function buildPrefixValues(prefixes: readonly string[]) {
  return prefixes.map((prefix) => `${prefix}%`);
}

function renameCode(code: string, renames: readonly PrefixRename[]): string {
  for (const rename of renames) {
    if (code.startsWith(rename.sourcePrefix)) {
      return `${rename.newPrefix}${code.slice(rename.sourcePrefix.length)}`;
    }
  }
  return code;
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
      WHERE ${buildPrefixWhere("sales_project_code", SALES_PROJECT_SOURCE_PREFIXES)}
      ORDER BY id ASC
    `,
    buildPrefixValues(SALES_PROJECT_SOURCE_PREFIXES),
  );

  return rows.map((row) => ({
    id: row.id,
    oldCode: row.salesProjectCode,
    newCode: renameCode(row.salesProjectCode, SALES_PROJECT_PREFIX_RENAMES),
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
        project_name AS projectName,
        project_target_id AS projectTargetId
      FROM rd_project
      WHERE ${buildPrefixWhere("project_code", RD_PROJECT_SOURCE_PREFIXES)}
      ORDER BY id ASC
    `,
    buildPrefixValues(RD_PROJECT_SOURCE_PREFIXES),
  );

  return rows.map((row) => ({
    id: row.id,
    oldCode: row.projectCode,
    newCode: renameCode(row.projectCode, RD_PROJECT_PREFIX_RENAMES),
    name: row.projectName,
    projectTargetId: row.projectTargetId,
  }));
}

async function readProjectTargets(
  connection: MigrationConnectionLike,
  targetType: string,
  sourcePrefixes: readonly string[],
): Promise<ProjectTargetRow[]> {
  return connection.query<ProjectTargetRow[]>(
    `
      SELECT
        id,
        target_code AS targetCode,
        source_document_id AS sourceDocumentId
      FROM project_target
      WHERE target_type = ?
        AND (${buildPrefixWhere("target_code", sourcePrefixes)})
      ORDER BY id ASC
    `,
    [targetType, ...buildPrefixValues(sourcePrefixes)],
  );
}

async function countPrefixRows(
  connection: MigrationConnectionLike,
  params: {
    tableName: string;
    columnName: string;
    sourcePrefixes: readonly string[];
    extraWhere?: string;
    values?: readonly unknown[];
  },
) {
  const { tableName, columnName, sourcePrefixes, extraWhere, values } = params;
  return countRows(
    connection,
    `
      SELECT COUNT(*) AS count
      FROM ${tableName}
      WHERE (${buildPrefixWhere(columnName, sourcePrefixes)})
        ${extraWhere ?? ""}
    `,
    [...buildPrefixValues(sourcePrefixes), ...(values ?? [])],
  );
}

async function readImpactMetrics(
  connection: MigrationConnectionLike,
): Promise<ReportMetric[]> {
  return [
    {
      metric: "sales_project.sales_project_code",
      count: await countPrefixRows(connection, {
        tableName: "sales_project",
        columnName: "sales_project_code",
        sourcePrefixes: SALES_PROJECT_SOURCE_PREFIXES,
      }),
    },
    {
      metric: "project_target.target_code.sales_project",
      count: await countPrefixRows(connection, {
        tableName: "project_target",
        columnName: "target_code",
        sourcePrefixes: SALES_PROJECT_SOURCE_PREFIXES,
        extraWhere: "AND target_type = ?",
        values: [SALES_PROJECT_TARGET_TYPE],
      }),
    },
    {
      metric: "project_target.target_code.rd_project",
      count: await countPrefixRows(connection, {
        tableName: "project_target",
        columnName: "target_code",
        sourcePrefixes: RD_PROJECT_SOURCE_PREFIXES,
        extraWhere: "AND target_type = ?",
        values: [RD_PROJECT_TARGET_TYPE],
      }),
    },
    {
      metric: "stock_in_order.sales_project_code_snapshot",
      count: await countPrefixRows(connection, {
        tableName: "stock_in_order",
        columnName: "sales_project_code_snapshot",
        sourcePrefixes: SALES_PROJECT_SOURCE_PREFIXES,
      }),
    },
    {
      metric: "rd_project.project_code",
      count: await countPrefixRows(connection, {
        tableName: "rd_project",
        columnName: "project_code",
        sourcePrefixes: RD_PROJECT_SOURCE_PREFIXES,
      }),
    },
    {
      metric: "rd_procurement_request.project_code",
      count: await countPrefixRows(connection, {
        tableName: "rd_procurement_request",
        columnName: "project_code",
        sourcePrefixes: RD_PROJECT_SOURCE_PREFIXES,
      }),
    },
    {
      metric: "stock_in_order.rd_procurement_project_code_snapshot",
      count: await countPrefixRows(connection, {
        tableName: "stock_in_order",
        columnName: "rd_procurement_project_code_snapshot",
        sourcePrefixes: RD_PROJECT_SOURCE_PREFIXES,
      }),
    },
    {
      metric: "rd_handoff_order_line.rd_project_code_snapshot",
      count: await countPrefixRows(connection, {
        tableName: "rd_handoff_order_line",
        columnName: "rd_project_code_snapshot",
        sourcePrefixes: RD_PROJECT_SOURCE_PREFIXES,
      }),
    },
    {
      metric: "rd_stocktake_order_line.rd_project_code_snapshot",
      count: await countPrefixRows(connection, {
        tableName: "rd_stocktake_order_line",
        columnName: "rd_project_code_snapshot",
        sourcePrefixes: RD_PROJECT_SOURCE_PREFIXES,
      }),
    },
  ];
}

function buildCollisionCodeSet(
  renames: readonly ProjectCodeRename[],
): Set<string> {
  return new Set(renames.map((item) => item.newCode));
}

function buildPlaceholders(count: number) {
  return Array.from({ length: count }, () => "?").join(", ");
}

function findDuplicateNewCodes(
  label: string,
  renames: readonly ProjectCodeRename[],
): string[] {
  const idsByCode = new Map<string, number[]>();

  for (const rename of renames) {
    const ids = idsByCode.get(rename.newCode) ?? [];
    ids.push(rename.id);
    idsByCode.set(rename.newCode, ids);
  }

  return [...idsByCode.entries()]
    .filter(([, ids]) => ids.length > 1)
    .map(
      ([code, ids]) =>
        `${label} duplicate target code ${code}: ids=${ids.join(",")}`,
    );
}

async function assertNoSalesProjectCollisions(
  connection: MigrationConnectionLike,
  renames: readonly ProjectCodeRename[],
): Promise<string[]> {
  if (renames.length === 0) {
    return [];
  }

  const newCodes = [...buildCollisionCodeSet(renames)];
  const sourceIds = renames.map((rename) => rename.id);
  const rows = await connection.query<
    Array<{ id: number; salesProjectCode: string }>
  >(
    `
      SELECT id, sales_project_code AS salesProjectCode
      FROM sales_project
      WHERE sales_project_code IN (${buildPlaceholders(newCodes.length)})
        AND id NOT IN (${buildPlaceholders(sourceIds.length)})
    `,
    [...newCodes, ...sourceIds],
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
  const sourceIds = renames.map((rename) => rename.id);
  const rows = await connection.query<
    Array<{ id: number; projectCode: string }>
  >(
    `
      SELECT id, project_code AS projectCode
      FROM rd_project
      WHERE project_code IN (${buildPlaceholders(newCodes.length)})
        AND id NOT IN (${buildPlaceholders(sourceIds.length)})
    `,
    [...newCodes, ...sourceIds],
  );

  return rows.map(
    (row) =>
      `rd_project collision: id=${row.id} already uses ${row.projectCode}`,
  );
}

async function assertNoProjectTargetCollisions(
  connection: MigrationConnectionLike,
  renames: readonly ProjectCodeRename[],
  sourceTargets: readonly ProjectTargetRow[],
): Promise<string[]> {
  if (renames.length === 0) {
    return [];
  }

  const newCodes = [...buildCollisionCodeSet(renames)];
  const sourceTargetIds = sourceTargets.map((target) => target.id);
  const sourceTargetExclusion =
    sourceTargetIds.length > 0
      ? `AND id NOT IN (${buildPlaceholders(sourceTargetIds.length)})`
      : "";
  const rows = await connection.query<
    Array<{ id: number; targetCode: string; targetType: string }>
  >(
    `
      SELECT id, target_code AS targetCode, target_type AS targetType
      FROM project_target
      WHERE target_code IN (${buildPlaceholders(newCodes.length)})
        ${sourceTargetExclusion}
    `,
    [...newCodes, ...sourceTargetIds],
  );

  return rows.map(
    (row) =>
      `project_target collision: id=${row.id} type=${row.targetType} already uses ${row.targetCode}`,
  );
}

function validateProjectTargets(
  label: string,
  renames: readonly ProjectCodeRename[],
  targetRows: readonly ProjectTargetRow[],
  options: { requireProjectTarget: boolean },
): string[] {
  const blockers: string[] = [];
  const targetById = new Map(targetRows.map((row) => [row.id, row] as const));

  for (const project of renames) {
    if (!project.projectTargetId) {
      if (options.requireProjectTarget) {
        blockers.push(`${label} id=${project.id} missing projectTargetId`);
      }
      continue;
    }

    const target = targetById.get(project.projectTargetId);
    if (!target) {
      blockers.push(
        `${label} id=${project.id} missing project_target row id=${project.projectTargetId}`,
      );
      continue;
    }

    if (target.sourceDocumentId !== project.id) {
      blockers.push(
        `project_target id=${target.id} sourceDocumentId=${target.sourceDocumentId} does not match ${label} id=${project.id}`,
      );
    }

    if (target.targetCode !== project.oldCode) {
      blockers.push(
        `project_target id=${target.id} code mismatch: target=${target.targetCode}, ${label}=${project.oldCode}`,
      );
    }
  }

  return blockers;
}

async function buildBackfillPlan(
  connection: MigrationConnectionLike,
): Promise<BackfillPlan> {
  const [salesRenames, rdRenames, salesTargetRows, rdTargetRows, impactedRows] =
    await Promise.all([
      readSalesProjects(connection),
      readRdProjects(connection),
      readProjectTargets(
        connection,
        SALES_PROJECT_TARGET_TYPE,
        SALES_PROJECT_SOURCE_PREFIXES,
      ),
      readProjectTargets(
        connection,
        RD_PROJECT_TARGET_TYPE,
        RD_PROJECT_SOURCE_PREFIXES,
      ),
      readImpactMetrics(connection),
    ]);

  const blockers = [
    ...validateProjectTargets("sales_project", salesRenames, salesTargetRows, {
      requireProjectTarget: true,
    }),
    ...validateProjectTargets("rd_project", rdRenames, rdTargetRows, {
      requireProjectTarget: false,
    }),
    ...findDuplicateNewCodes("sales_project", salesRenames),
    ...findDuplicateNewCodes("rd_project", rdRenames),
    ...(await assertNoSalesProjectCollisions(connection, salesRenames)),
    ...(await assertNoRdProjectCollisions(connection, rdRenames)),
    ...(await assertNoProjectTargetCollisions(
      connection,
      [...salesRenames, ...rdRenames],
      [...salesTargetRows, ...rdTargetRows],
    )),
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

function buildPrefixRenameCase(
  columnName: string,
  renames: readonly PrefixRename[],
) {
  return renames
    .map(
      () =>
        `WHEN ${columnName} LIKE ? THEN CONCAT(?, SUBSTRING(${columnName}, ?))`,
    )
    .join("\n          ");
}

function buildPrefixRenameValues(renames: readonly PrefixRename[]) {
  return renames.flatMap((rename) => [
    `${rename.sourcePrefix}%`,
    rename.newPrefix,
    rename.sourcePrefix.length + 1,
  ]);
}

async function updateCodePrefixes(params: {
  connection: MigrationConnectionLike;
  tableName: string;
  columnName: string;
  renames: readonly PrefixRename[];
  extraWhere?: string;
  values?: readonly unknown[];
}) {
  const { connection, tableName, columnName, renames, extraWhere, values } =
    params;
  const sourcePrefixes = renames.map((rename) => rename.sourcePrefix);
  return connection.query(
    `
      UPDATE ${tableName}
      SET
        ${columnName} = CASE
          ${buildPrefixRenameCase(columnName, renames)}
          ELSE ${columnName}
        END,
        updated_by = ?,
        updated_at = NOW()
      WHERE (${buildPrefixWhere(columnName, sourcePrefixes)})
        ${extraWhere ?? ""}
    `,
    [
      ...buildPrefixRenameValues(renames),
      MIGRATION_ACTOR,
      ...buildPrefixValues(sourcePrefixes),
      ...(values ?? []),
    ],
  );
}

async function executeBackfill(
  connection: MigrationConnectionLike,
): Promise<Record<string, number>> {
  const salesProjectUpdated = await updateCodePrefixes({
    connection,
    tableName: "sales_project",
    columnName: "sales_project_code",
    renames: SALES_PROJECT_PREFIX_RENAMES,
  });

  const salesProjectTargetUpdated = await updateCodePrefixes({
    connection,
    tableName: "project_target",
    columnName: "target_code",
    renames: SALES_PROJECT_PREFIX_RENAMES,
    extraWhere: "AND target_type = ?",
    values: [SALES_PROJECT_TARGET_TYPE],
  });

  const stockInSalesSnapshotUpdated = await updateCodePrefixes({
    connection,
    tableName: "stock_in_order",
    columnName: "sales_project_code_snapshot",
    renames: SALES_PROJECT_PREFIX_RENAMES,
  });

  const rdProjectUpdated = await updateCodePrefixes({
    connection,
    tableName: "rd_project",
    columnName: "project_code",
    renames: RD_PROJECT_PREFIX_RENAMES,
  });

  const rdProjectTargetUpdated = await updateCodePrefixes({
    connection,
    tableName: "project_target",
    columnName: "target_code",
    renames: RD_PROJECT_PREFIX_RENAMES,
    extraWhere: "AND target_type = ?",
    values: [RD_PROJECT_TARGET_TYPE],
  });

  const rdProcurementUpdated = await updateCodePrefixes({
    connection,
    tableName: "rd_procurement_request",
    columnName: "project_code",
    renames: RD_PROJECT_PREFIX_RENAMES,
  });

  const stockInRdSnapshotUpdated = await updateCodePrefixes({
    connection,
    tableName: "stock_in_order",
    columnName: "rd_procurement_project_code_snapshot",
    renames: RD_PROJECT_PREFIX_RENAMES,
  });

  const rdHandoffSnapshotUpdated = await updateCodePrefixes({
    connection,
    tableName: "rd_handoff_order_line",
    columnName: "rd_project_code_snapshot",
    renames: RD_PROJECT_PREFIX_RENAMES,
  });

  const rdStocktakeSnapshotUpdated = await updateCodePrefixes({
    connection,
    tableName: "rd_stocktake_order_line",
    columnName: "rd_project_code_snapshot",
    renames: RD_PROJECT_PREFIX_RENAMES,
  });

  return {
    salesProjectUpdated: Number(
      (salesProjectUpdated as { affectedRows?: number }).affectedRows ?? 0,
    ),
    salesProjectTargetUpdated: Number(
      (salesProjectTargetUpdated as { affectedRows?: number }).affectedRows ??
        0,
    ),
    stockInSalesSnapshotUpdated: Number(
      (stockInSalesSnapshotUpdated as { affectedRows?: number }).affectedRows ??
        0,
    ),
    rdProjectUpdated: Number(
      (rdProjectUpdated as { affectedRows?: number }).affectedRows ?? 0,
    ),
    rdProjectTargetUpdated: Number(
      (rdProjectTargetUpdated as { affectedRows?: number }).affectedRows ?? 0,
    ),
    rdProcurementUpdated: Number(
      (rdProcurementUpdated as { affectedRows?: number }).affectedRows ?? 0,
    ),
    stockInRdSnapshotUpdated: Number(
      (stockInRdSnapshotUpdated as { affectedRows?: number }).affectedRows ?? 0,
    ),
    rdHandoffSnapshotUpdated: Number(
      (rdHandoffSnapshotUpdated as { affectedRows?: number }).affectedRows ?? 0,
    ),
    rdStocktakeSnapshotUpdated: Number(
      (rdStocktakeSnapshotUpdated as { affectedRows?: number }).affectedRows ??
        0,
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
      salesProjectSourcePrefixes: SALES_PROJECT_SOURCE_PREFIXES,
      rdProjectSourcePrefixes: RD_PROJECT_SOURCE_PREFIXES,
      salesProjectNewPrefix: SALES_PROJECT_NEW_PREFIX,
      rdProjectNewPrefix: RD_PROJECT_NEW_PREFIX,
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
