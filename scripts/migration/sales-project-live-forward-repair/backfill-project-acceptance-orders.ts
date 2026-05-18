import {
  assertExpectedDatabaseName,
  EXPECTED_LEGACY_DATABASE_NAME,
  EXPECTED_TARGET_DATABASE_NAME,
  loadMigrationEnvironment,
  parseMigrationCliOptions,
  resolveReportPath,
} from "../config";
import {
  closePools,
  createMariaDbPool,
  type MigrationConnectionLike,
  type QueryResultWithInsertId,
  withPoolConnection,
} from "../db";
import { writeStableReport } from "../shared/report-writer";

const DRY_RUN_REPORT_FILE_NAME =
  "sales-project-acceptance-backfill-dry-run-report.json";
const EXECUTE_REPORT_FILE_NAME =
  "sales-project-acceptance-backfill-execute-report.json";
const EXPECTED_PROJECT_COUNT = 21;
const GENERATED_BY = "sales-project-acceptance-backfill";
const GENERATED_DOCUMENT_PREFIX = "YS-PROJ-";
const DEFAULT_CATEGORY_CODE = "15";

interface ProjectRow {
  legacyId: number;
  salesProjectId: number;
  salesProjectCode: string;
  salesProjectName: string;
  bizDate: string;
  managerPersonnelId: number | null;
  managerNameSnapshot: string | null;
  workshopId: number;
  workshopNameSnapshot: string;
  stockScopeId: number | null;
  projectTargetId: number | null;
  createdBy: string | null;
  createdAt: string;
  updatedBy: string | null;
  updatedAt: string;
  existingGeneratedOrderId: number | null;
  existingGeneratedSalesProjectId: number | null;
  existingProjectOrderCount: number;
  lineCount: number;
  totalQty: string;
  totalAmount: string;
}

interface LineRow {
  legacyLineId: number | null;
  projectId: number;
  lineNo: number;
  materialId: number;
  materialCategoryIdSnapshot: number | null;
  materialCategoryCodeSnapshot: string | null;
  materialCategoryNameSnapshot: string | null;
  materialCategoryPathSnapshot: string | null;
  materialCategoryUsedFallback: number;
  materialCodeSnapshot: string;
  materialNameSnapshot: string;
  materialSpecSnapshot: string | null;
  unitCodeSnapshot: string;
  quantity: string;
  unitPrice: string;
  amount: string;
  remark: string | null;
  createdBy: string | null;
  createdAt: string;
  updatedBy: string | null;
  updatedAt: string;
}

interface Blocker {
  reason: string;
  details?: Record<string, unknown>;
}

interface LegacyProjectUsageSummary {
  usageRowCount: number;
  lineCount: number;
  useQty: string;
  beforeOrderTypes: number[];
}

function documentNoForProject(project: ProjectRow): string {
  return `${GENERATED_DOCUMENT_PREFIX}${project.salesProjectCode}`;
}

function numberValue(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "bigint") return Number(value);
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function affectedRowsValue(value: unknown): number {
  if (
    typeof value === "object" &&
    value !== null &&
    "affectedRows" in value &&
    typeof value.affectedRows === "number"
  ) {
    return value.affectedRows;
  }
  return 0;
}

async function runInsert(
  connection: MigrationConnectionLike,
  sql: string,
  values: readonly unknown[],
): Promise<number> {
  const result =
    (await connection.query<QueryResultWithInsertId>(sql, values)) ?? {};
  const insertId = Number(result.insertId ?? 0);
  if (!Number.isFinite(insertId) || insertId <= 0) {
    throw new Error("Insert did not yield a valid id.");
  }
  return insertId;
}

async function loadProjects(
  connection: MigrationConnectionLike,
): Promise<ProjectRow[]> {
  return connection.query<ProjectRow[]>(
    `
      SELECT
        mp.legacy_id AS legacyId,
        sp.id AS salesProjectId,
        sp.sales_project_code AS salesProjectCode,
        sp.sales_project_name AS salesProjectName,
        DATE_FORMAT(sp.biz_date, '%Y-%m-%d') AS bizDate,
        sp.manager_personnel_id AS managerPersonnelId,
        sp.manager_name_snapshot AS managerNameSnapshot,
        sp.workshop_id AS workshopId,
        sp.workshop_name_snapshot AS workshopNameSnapshot,
        sp.stock_scope_id AS stockScopeId,
        sp.project_target_id AS projectTargetId,
        sp.created_by AS createdBy,
        sp.created_at AS createdAt,
        sp.updated_by AS updatedBy,
        sp.updated_at AS updatedAt,
        generated_order.id AS existingGeneratedOrderId,
        generated_order.sales_project_id AS existingGeneratedSalesProjectId,
        COALESCE(project_order_stats.existingProjectOrderCount, 0) AS existingProjectOrderCount,
        COALESCE(line_stats.lineCount, 0) AS lineCount,
        COALESCE(line_stats.totalQty, 0) AS totalQty,
        COALESCE(line_stats.totalAmount, 0) AS totalAmount
      FROM migration_staging.map_project mp
      INNER JOIN sales_project sp
        ON sp.id = mp.target_id
      LEFT JOIN stock_in_order generated_order
        ON generated_order.document_no = CONCAT(?, sp.sales_project_code)
      LEFT JOIN (
        SELECT sales_project_id, COUNT(*) AS existingProjectOrderCount
        FROM stock_in_order
        WHERE sales_project_id IS NOT NULL
        GROUP BY sales_project_id
      ) project_order_stats
        ON project_order_stats.sales_project_id = sp.id
      LEFT JOIN (
        SELECT
          project_id,
          COUNT(*) AS lineCount,
          SUM(quantity) AS totalQty,
          SUM(amount) AS totalAmount
        FROM sales_project_material_line
        GROUP BY project_id
      ) line_stats
        ON line_stats.project_id = sp.id
      WHERE mp.legacy_table = 'saifute_composite_product'
        AND mp.target_table = 'sales_project'
      ORDER BY mp.legacy_id ASC
    `,
    [GENERATED_DOCUMENT_PREFIX],
  );
}

async function loadLines(
  connection: MigrationConnectionLike,
  projectIds: readonly number[],
): Promise<LineRow[]> {
  if (projectIds.length === 0) return [];
  const placeholders = projectIds.map(() => "?").join(",");
  return connection.query<LineRow[]>(
    `
      SELECT
        map_line.legacy_id AS legacyLineId,
        line.project_id AS projectId,
        line.line_no AS lineNo,
        line.material_id AS materialId,
        COALESCE(category.id, default_category.id) AS materialCategoryIdSnapshot,
        COALESCE(category.category_code, default_category.category_code) AS materialCategoryCodeSnapshot,
        COALESCE(category.category_name, default_category.category_name) AS materialCategoryNameSnapshot,
        CASE
          WHEN category.id IS NOT NULL THEN JSON_ARRAY(JSON_OBJECT(
            'id', category.id,
            'categoryCode', category.category_code,
            'categoryName', category.category_name
          ))
          WHEN default_category.id IS NOT NULL THEN JSON_ARRAY(JSON_OBJECT(
            'id', default_category.id,
            'categoryCode', default_category.category_code,
            'categoryName', default_category.category_name
          ))
          ELSE NULL
        END AS materialCategoryPathSnapshot,
        CASE WHEN category.id IS NULL THEN 1 ELSE 0 END AS materialCategoryUsedFallback,
        line.material_code_snapshot AS materialCodeSnapshot,
        line.material_name_snapshot AS materialNameSnapshot,
        line.material_spec_snapshot AS materialSpecSnapshot,
        line.unit_code_snapshot AS unitCodeSnapshot,
        line.quantity,
        line.unit_price AS unitPrice,
        line.amount,
        line.remark,
        line.created_by AS createdBy,
        line.created_at AS createdAt,
        line.updated_by AS updatedBy,
        line.updated_at AS updatedAt
      FROM sales_project_material_line line
      INNER JOIN material
        ON material.id = line.material_id
      LEFT JOIN material_category category
        ON category.id = material.category_id
      LEFT JOIN material_category default_category
        ON default_category.category_code = ?
      LEFT JOIN migration_staging.map_project_material_line map_line
        ON map_line.target_id = line.id
       AND map_line.legacy_table = 'saifute_product_material'
       AND map_line.target_table = 'sales_project_material_line'
      WHERE line.project_id IN (${placeholders})
      ORDER BY line.project_id ASC, line.line_no ASC
    `,
    [DEFAULT_CATEGORY_CODE, ...projectIds],
  );
}

async function loadLegacyProjectUsageSummary(
  connection: MigrationConnectionLike,
  legacyLineIds: readonly number[],
): Promise<LegacyProjectUsageSummary> {
  const ids = [...new Set(legacyLineIds)].filter((id) => Number.isFinite(id));
  if (ids.length === 0) {
    return {
      usageRowCount: 0,
      lineCount: 0,
      useQty: "0",
      beforeOrderTypes: [],
    };
  }

  const placeholders = ids.map(() => "?").join(",");
  const rows = await connection.query<
    Array<{
      usageRowCount: number;
      lineCount: number;
      useQty: string | number | null;
      beforeOrderTypes: string | null;
    }>
  >(
    `
      SELECT
        COUNT(*) AS usageRowCount,
        COUNT(DISTINCT after_detail_id) AS lineCount,
        COALESCE(SUM(use_qty), 0) AS useQty,
        GROUP_CONCAT(DISTINCT before_order_type ORDER BY before_order_type) AS beforeOrderTypes
      FROM saifute_inventory_used
      WHERE after_order_type = 8
        AND after_detail_id IN (${placeholders})
    `,
    ids,
  );
  const row = rows[0];

  return {
    usageRowCount: numberValue(row?.usageRowCount),
    lineCount: numberValue(row?.lineCount),
    useQty: String(row?.useQty ?? 0),
    beforeOrderTypes: (row?.beforeOrderTypes ?? "")
      .split(",")
      .map((value) => Number(value))
      .filter((value) => Number.isFinite(value)),
  };
}

function buildBlockers(
  projects: readonly ProjectRow[],
  lines: readonly LineRow[],
  legacyProjectUsageSummary: LegacyProjectUsageSummary,
): Blocker[] {
  const blockers: Blocker[] = [];

  if (projects.length !== EXPECTED_PROJECT_COUNT) {
    blockers.push({
      reason: "project-count-drift",
      details: {
        expected: EXPECTED_PROJECT_COUNT,
        actual: projects.length,
      },
    });
  }

  const missingTargetProjects = projects.filter(
    (project) => project.projectTargetId === null,
  );
  if (missingTargetProjects.length > 0) {
    blockers.push({
      reason: "project-target-missing",
      details: {
        salesProjectIds: missingTargetProjects.map(
          (project) => project.salesProjectId,
        ),
      },
    });
  }

  const noLineProjects = projects.filter((project) => project.lineCount === 0);
  if (noLineProjects.length > 0) {
    blockers.push({
      reason: "project-material-lines-missing",
      details: {
        salesProjectIds: noLineProjects.map(
          (project) => project.salesProjectId,
        ),
      },
    });
  }

  const conflictingGeneratedOrders = projects.filter(
    (project) =>
      project.existingGeneratedOrderId !== null &&
      project.existingGeneratedSalesProjectId !== project.salesProjectId,
  );
  if (conflictingGeneratedOrders.length > 0) {
    blockers.push({
      reason: "generated-document-conflict",
      details: {
        documentNos: conflictingGeneratedOrders.map((project) =>
          documentNoForProject(project),
        ),
      },
    });
  }

  const existingProjectOrders = projects.filter(
    (project) =>
      project.existingProjectOrderCount > 0 &&
      project.existingGeneratedOrderId === null,
  );
  if (existingProjectOrders.length > 0) {
    blockers.push({
      reason: "project-already-has-stock-in-order",
      details: {
        salesProjectIds: existingProjectOrders.map(
          (project) => project.salesProjectId,
        ),
      },
    });
  }

  const missingCategorySnapshotLines = lines.filter(
    (line) =>
      line.materialCategoryIdSnapshot === null ||
      !line.materialCategoryCodeSnapshot ||
      !line.materialCategoryNameSnapshot ||
      !line.materialCategoryPathSnapshot,
  );
  if (missingCategorySnapshotLines.length > 0) {
    blockers.push({
      reason: "material-category-snapshot-missing",
      details: {
        projectIds: [
          ...new Set(
            missingCategorySnapshotLines.map((line) => line.projectId),
          ),
        ],
        lineCount: missingCategorySnapshotLines.length,
      },
    });
  }

  const missingLegacyLineMaps = lines.filter(
    (line) => line.legacyLineId === null,
  );
  if (missingLegacyLineMaps.length > 0) {
    blockers.push({
      reason: "legacy-project-line-map-missing",
      details: {
        lineCount: missingLegacyLineMaps.length,
        projectIds: [
          ...new Set(missingLegacyLineMaps.map((line) => line.projectId)),
        ],
      },
    });
  }

  if (legacyProjectUsageSummary.lineCount > 0) {
    blockers.push({
      reason: "legacy-project-lines-have-existing-source-usage",
      details: {
        lineCount: legacyProjectUsageSummary.lineCount,
        usageRowCount: legacyProjectUsageSummary.usageRowCount,
        useQty: legacyProjectUsageSummary.useQty,
        beforeOrderTypes: legacyProjectUsageSummary.beforeOrderTypes,
      },
    });
  }

  return blockers;
}

async function insertStockInOrder(
  connection: MigrationConnectionLike,
  project: ProjectRow,
): Promise<number> {
  return runInsert(
    connection,
    `
      INSERT INTO stock_in_order (
        document_no,
        order_type,
        biz_date,
        sales_project_id,
        supplier_id,
        handler_personnel_id,
        stock_scope_id,
        workshop_id,
        rd_procurement_request_id,
        lifecycle_status,
        audit_status_snapshot,
        inventory_effect_status,
        revision_no,
        sales_project_code_snapshot,
        sales_project_name_snapshot,
        supplier_code_snapshot,
        supplier_name_snapshot,
        handler_name_snapshot,
        workshop_name_snapshot,
        rd_procurement_request_no_snapshot,
        rd_procurement_project_code_snapshot,
        rd_procurement_project_name_snapshot,
        total_qty,
        total_amount,
        remark,
        void_reason,
        voided_by,
        voided_at,
        created_by,
        created_at,
        updated_by,
        updated_at
      ) VALUES (
        ?, 'ACCEPTANCE', ?, ?, NULL, ?, ?, ?, NULL,
        'EFFECTIVE', 'PENDING', 'POSTED', 1,
        ?, ?, NULL, NULL, ?, ?, NULL, NULL, NULL,
        ?, ?, ?, NULL, NULL, NULL, ?, ?, ?, ?
      )
    `,
    [
      documentNoForProject(project),
      project.bizDate,
      project.salesProjectId,
      project.managerPersonnelId,
      project.stockScopeId,
      project.workshopId,
      project.salesProjectCode,
      project.salesProjectName,
      project.managerNameSnapshot,
      project.workshopNameSnapshot,
      project.totalQty,
      project.totalAmount,
      `销售项目前向修复生成项目验收单：${project.salesProjectCode}`,
      GENERATED_BY,
      project.createdAt,
      GENERATED_BY,
      project.updatedAt ?? project.createdAt,
    ],
  );
}

async function insertStockInOrderLine(
  connection: MigrationConnectionLike,
  orderId: number,
  line: LineRow,
): Promise<void> {
  const result = await connection.query(
    `
      INSERT INTO stock_in_order_line (
        order_id,
        line_no,
        material_id,
        rd_procurement_request_line_id,
        material_category_id_snapshot,
        material_category_code_snapshot,
        material_category_name_snapshot,
        material_category_path_snapshot,
        material_code_snapshot,
        material_name_snapshot,
        material_spec_snapshot,
        unit_code_snapshot,
        quantity,
        unit_price,
        amount,
        remark,
        created_by,
        created_at,
        updated_by,
        updated_at
      ) VALUES (
        ?, ?, ?, NULL, ?, ?, ?, ?,
        ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
      )
    `,
    [
      orderId,
      line.lineNo,
      line.materialId,
      line.materialCategoryIdSnapshot,
      line.materialCategoryCodeSnapshot,
      line.materialCategoryNameSnapshot,
      line.materialCategoryPathSnapshot,
      line.materialCodeSnapshot,
      line.materialNameSnapshot,
      line.materialSpecSnapshot,
      line.unitCodeSnapshot,
      line.quantity,
      line.unitPrice,
      line.amount,
      line.remark,
      GENERATED_BY,
      line.createdAt,
      GENERATED_BY,
      line.updatedAt ?? line.createdAt,
    ],
  );
  if (affectedRowsValue(result) !== 1) {
    throw new Error(
      `Expected to insert one stock_in_order_line, orderId=${orderId}, lineNo=${line.lineNo}.`,
    );
  }
}

async function executeBackfill(
  connection: MigrationConnectionLike,
  projects: readonly ProjectRow[],
  lines: readonly LineRow[],
): Promise<{
  insertedOrders: number;
  insertedLines: number;
  skippedExistingOrders: number;
}> {
  const linesByProjectId = new Map<number, LineRow[]>();
  for (const line of lines) {
    const bucket = linesByProjectId.get(line.projectId) ?? [];
    bucket.push(line);
    linesByProjectId.set(line.projectId, bucket);
  }

  await connection.beginTransaction();
  try {
    let insertedOrders = 0;
    let insertedLines = 0;
    let skippedExistingOrders = 0;

    for (const project of projects) {
      if (project.existingGeneratedOrderId !== null) {
        skippedExistingOrders += 1;
        continue;
      }

      const orderId = await insertStockInOrder(connection, project);
      insertedOrders += 1;

      for (const line of linesByProjectId.get(project.salesProjectId) ?? []) {
        await insertStockInOrderLine(connection, orderId, line);
        insertedLines += 1;
      }
    }

    await connection.commit();
    return { insertedOrders, insertedLines, skippedExistingOrders };
  } catch (error) {
    await connection.rollback();
    throw error;
  }
}

async function main(): Promise<void> {
  const cliOptions = parseMigrationCliOptions();
  if (cliOptions.execute) {
    throw new Error(
      "The legacy project acceptance backfill execute path is disabled because it generated all sales_project_material_line rows without checking legacy acceptance_date. Use the admission split audit/recovery task before rebuilding accepted-only inbound orders.",
    );
  }
  const reportPath = resolveReportPath(
    cliOptions,
    cliOptions.execute ? EXECUTE_REPORT_FILE_NAME : DRY_RUN_REPORT_FILE_NAME,
  );
  const env = loadMigrationEnvironment({ requireLegacyDatabaseUrl: true });
  const targetDatabaseName = assertExpectedDatabaseName(
    env.databaseUrl,
    EXPECTED_TARGET_DATABASE_NAME,
    "Target",
  );
  const legacyDatabaseUrl = env.legacyDatabaseUrl;
  if (!legacyDatabaseUrl) {
    throw new Error("LEGACY_DATABASE_URL is required for project usage guard.");
  }
  const legacyDatabaseName = assertExpectedDatabaseName(
    legacyDatabaseUrl,
    EXPECTED_LEGACY_DATABASE_NAME,
    "Legacy",
  );
  const pool = createMariaDbPool(env.databaseUrl);
  const legacyPool = createMariaDbPool(legacyDatabaseUrl);

  try {
    await withPoolConnection(pool, async (connection) => {
      await withPoolConnection(legacyPool, async (legacyConnection) => {
        const projects = await loadProjects(connection);
        const lines = await loadLines(
          connection,
          projects.map((project) => project.salesProjectId),
        );
        const legacyProjectUsageSummary = await loadLegacyProjectUsageSummary(
          legacyConnection,
          lines
            .map((line) => line.legacyLineId)
            .filter((id): id is number => id !== null),
        );
        const blockers = buildBlockers(
          projects,
          lines,
          legacyProjectUsageSummary,
        );
        const existingGeneratedOrders = projects.filter(
          (project) => project.existingGeneratedOrderId !== null,
        ).length;
        const plannedProjects = projects.filter(
          (project) => project.existingGeneratedOrderId === null,
        );

        let executionResult: Awaited<
          ReturnType<typeof executeBackfill>
        > | null = null;
        if (cliOptions.execute) {
          if (!cliOptions.allowBlockers && blockers.length > 0) {
            throw new Error(
              `sales-project acceptance backfill blocked: ${blockers
                .map((blocker) => blocker.reason)
                .join(", ")}`,
            );
          }
          executionResult = await executeBackfill(connection, projects, lines);
        }

        const report = {
          mode: cliOptions.execute ? "execute" : "dry-run",
          targetDatabaseName,
          legacyDatabaseName,
          generatedAt: new Date().toISOString(),
          blockers,
          eligible: blockers.length === 0,
          summary: {
            scopedProjectCount: projects.length,
            scopedLineCount: lines.length,
            legacyProjectUsage: legacyProjectUsageSummary,
            materialCategoryFallbackLines: lines.filter((line) =>
              Boolean(numberValue(line.materialCategoryUsedFallback)),
            ).length,
            existingGeneratedOrders,
            wouldCreateOrders: plannedProjects.length,
            wouldCreateLines: plannedProjects.reduce(
              (sum, project) => sum + numberValue(project.lineCount),
              0,
            ),
          },
          projects: projects.map((project) => ({
            legacyId: project.legacyId,
            salesProjectId: project.salesProjectId,
            salesProjectCode: project.salesProjectCode,
            documentNo: documentNoForProject(project),
            projectTargetId: project.projectTargetId,
            lineCount: numberValue(project.lineCount),
            totalQty: project.totalQty,
            totalAmount: project.totalAmount,
            existingGeneratedOrderId: project.existingGeneratedOrderId,
            existingProjectOrderCount: numberValue(
              project.existingProjectOrderCount,
            ),
          })),
          executionResult,
        };

        writeStableReport(reportPath, report);
        console.log(
          `Sales-project acceptance backfill ${report.mode} completed. blockers=${blockers.length}, wouldCreateOrders=${report.summary.wouldCreateOrders}, wouldCreateLines=${report.summary.wouldCreateLines}, report=${reportPath}`,
        );
      });
    });
  } finally {
    await closePools(pool, legacyPool);
  }
}

void main();
