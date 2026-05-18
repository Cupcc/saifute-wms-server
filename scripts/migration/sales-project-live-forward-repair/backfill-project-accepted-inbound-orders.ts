import {
  assertDistinctSourceAndTargetDatabases,
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
  "sales-project-accepted-inbound-backfill-dry-run-report.json";
const EXECUTE_REPORT_FILE_NAME =
  "sales-project-accepted-inbound-backfill-execute-report.json";
const GENERATED_DOCUMENT_PREFIX = "YS-PROJ-";
const GENERATED_BY = "sales-project-accepted-inbound-backfill";
const DEFAULT_CATEGORY_CODE = "15";
const EXPECTED_PROJECT_INBOUND_LINE_COUNT = 634;

interface LegacyProjectRow {
  legacyProjectId: number;
  projectName: string | null;
  delFlag: number | string | null;
}

interface LegacyProjectInboundLineRow {
  legacyLineId: number;
  legacyProjectId: number;
  acceptanceDate: string | null;
  projectCreatedDate: string | null;
  inboundBizDate: string | null;
  inboundDateSource: string | null;
  legacyMaterialId: number | null;
  inventoryUsageRows: number;
  projectInventoryLogRows: number;
}

interface ProjectMapRow {
  legacyProjectId: number;
  salesProjectId: number;
  salesProjectCode: string;
  salesProjectName: string;
  managerPersonnelId: number | null;
  managerNameSnapshot: string | null;
  workshopId: number;
  workshopNameSnapshot: string;
  stockScopeId: number | null;
  createdAt: string;
  updatedAt: string;
}

interface LineMapRow {
  legacyLineId: number;
  salesProjectMaterialLineId: number;
  salesProjectId: number;
  projectLineNo: number;
  materialId: number;
  materialCategoryIdSnapshot: number | null;
  materialCategoryCodeSnapshot: string | null;
  materialCategoryNameSnapshot: string | null;
  materialCategoryPathSnapshot: string | null;
  materialCodeSnapshot: string;
  materialNameSnapshot: string;
  materialSpecSnapshot: string | null;
  unitCodeSnapshot: string;
  quantity: string;
  unitPrice: string;
  amount: string;
  remark: string | null;
  createdAt: string;
  updatedAt: string;
}

interface ExistingOrderRow {
  orderId: number;
  documentNo: string;
  createdBy: string | null;
  lineCount: number;
}

interface BackfillGroup {
  groupKey: string;
  documentNo: string;
  bizDate: string;
  dateSourceCounts: Record<string, number>;
  project: ProjectMapRow;
  lines: Array<LineMapRow & { legacyLineId: number }>;
  totalQty: string;
  totalAmount: string;
  existingOrder: ExistingOrderRow | null;
}

interface BackfillBlocker {
  reason: string;
  expected?: number | string;
  actual?: number | string;
  details?: Record<string, unknown>;
}

interface ExecutionResult {
  insertedOrders: number;
  insertedLines: number;
  skippedExistingOrders: number;
}

function numberValue(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "bigint") return Number(value);
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function amountValue(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function documentDatePart(date: string): string {
  return date.replaceAll("-", "");
}

function documentNoForGroup(project: ProjectMapRow, acceptanceDate: string) {
  return `${GENERATED_DOCUMENT_PREFIX}${project.salesProjectCode}-${documentDatePart(
    acceptanceDate,
  )}`;
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

async function loadLegacyProjects(
  connection: MigrationConnectionLike,
): Promise<LegacyProjectRow[]> {
  return connection.query<LegacyProjectRow[]>(
    `
      SELECT
        product_id AS legacyProjectId,
        product_name AS projectName,
        del_flag AS delFlag
      FROM saifute_composite_product
      ORDER BY product_id ASC
    `,
  );
}

async function loadLegacyAcceptedLines(
  connection: MigrationConnectionLike,
): Promise<LegacyProjectInboundLineRow[]> {
  return connection.query<LegacyProjectInboundLineRow[]>(
    `
      SELECT
        line_row.id AS legacyLineId,
        line_row.product_id AS legacyProjectId,
        DATE_FORMAT(line_row.acceptance_date, '%Y-%m-%d') AS acceptanceDate,
        DATE_FORMAT(project_row.create_time, '%Y-%m-%d') AS projectCreatedDate,
        DATE_FORMAT(
          COALESCE(line_row.acceptance_date, project_row.create_time),
          '%Y-%m-%d'
        ) AS inboundBizDate,
        CASE
          WHEN line_row.acceptance_date IS NOT NULL THEN 'acceptance_date'
          WHEN project_row.create_time IS NOT NULL THEN 'project_create_time'
          ELSE NULL
        END AS inboundDateSource,
        line_row.material_id AS legacyMaterialId,
        COALESCE(usage_summary.inventoryUsageRows, 0) AS inventoryUsageRows,
        COALESCE(log_summary.projectInventoryLogRows, 0) AS projectInventoryLogRows
      FROM saifute_product_material line_row
      INNER JOIN saifute_composite_product project_row
        ON project_row.product_id = line_row.product_id
      LEFT JOIN (
        SELECT
          after_detail_id AS legacyLineId,
          COUNT(*) AS inventoryUsageRows
        FROM saifute_inventory_used
        WHERE after_order_type = 8
        GROUP BY after_detail_id
      ) usage_summary
        ON usage_summary.legacyLineId = line_row.id
      LEFT JOIN (
        SELECT
          product_line.id AS legacyLineId,
          COUNT(*) AS projectInventoryLogRows
        FROM saifute_product_material product_line
        INNER JOIN saifute_inventory_log log_row
          ON log_row.related_order_type = 8
         AND log_row.related_order_id = product_line.product_id
         AND log_row.material_id = product_line.material_id
        GROUP BY product_line.id
      ) log_summary
        ON log_summary.legacyLineId = line_row.id
      ORDER BY
        line_row.product_id ASC,
        COALESCE(line_row.acceptance_date, DATE(project_row.create_time)) ASC,
        line_row.id ASC
    `,
  );
}

async function loadProjectMaps(
  connection: MigrationConnectionLike,
): Promise<ProjectMapRow[]> {
  return connection.query<ProjectMapRow[]>(
    `
      SELECT
        map_row.legacy_id AS legacyProjectId,
        sales_project.id AS salesProjectId,
        sales_project.sales_project_code AS salesProjectCode,
        sales_project.sales_project_name AS salesProjectName,
        sales_project.manager_personnel_id AS managerPersonnelId,
        sales_project.manager_name_snapshot AS managerNameSnapshot,
        sales_project.workshop_id AS workshopId,
        sales_project.workshop_name_snapshot AS workshopNameSnapshot,
        sales_project.stock_scope_id AS stockScopeId,
        sales_project.created_at AS createdAt,
        sales_project.updated_at AS updatedAt
      FROM migration_staging.map_project map_row
      INNER JOIN sales_project
        ON sales_project.id = map_row.target_id
      WHERE map_row.legacy_table = 'saifute_composite_product'
        AND map_row.target_table = 'sales_project'
      ORDER BY map_row.legacy_id ASC
    `,
  );
}

async function loadLineMaps(
  connection: MigrationConnectionLike,
): Promise<LineMapRow[]> {
  return connection.query<LineMapRow[]>(
    `
      SELECT
        map_row.legacy_id AS legacyLineId,
        line.id AS salesProjectMaterialLineId,
        line.project_id AS salesProjectId,
        line.line_no AS projectLineNo,
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
        line.material_code_snapshot AS materialCodeSnapshot,
        line.material_name_snapshot AS materialNameSnapshot,
        line.material_spec_snapshot AS materialSpecSnapshot,
        line.unit_code_snapshot AS unitCodeSnapshot,
        line.quantity,
        line.unit_price AS unitPrice,
        line.amount,
        line.remark,
        line.created_at AS createdAt,
        line.updated_at AS updatedAt
      FROM migration_staging.map_project_material_line map_row
      INNER JOIN sales_project_material_line line
        ON line.id = map_row.target_id
      INNER JOIN material
        ON material.id = line.material_id
      LEFT JOIN material_category category
        ON category.id = material.category_id
      LEFT JOIN material_category default_category
        ON default_category.category_code = ?
      WHERE map_row.legacy_table = 'saifute_product_material'
        AND map_row.target_table = 'sales_project_material_line'
      ORDER BY line.project_id ASC, line.line_no ASC
    `,
    [DEFAULT_CATEGORY_CODE],
  );
}

async function loadExistingOrders(
  connection: MigrationConnectionLike,
): Promise<ExistingOrderRow[]> {
  return connection.query<ExistingOrderRow[]>(
    `
      SELECT
        stock_in_order.id AS orderId,
        stock_in_order.document_no AS documentNo,
        stock_in_order.created_by AS createdBy,
        COUNT(stock_in_order_line.id) AS lineCount
      FROM stock_in_order
      LEFT JOIN stock_in_order_line
        ON stock_in_order_line.order_id = stock_in_order.id
      WHERE stock_in_order.document_no LIKE ?
      GROUP BY
        stock_in_order.id,
        stock_in_order.document_no,
        stock_in_order.created_by
      ORDER BY stock_in_order.document_no ASC
    `,
    [`${GENERATED_DOCUMENT_PREFIX}%`],
  );
}

function buildLookup<T, K extends string | number>(
  rows: readonly T[],
  keyOf: (row: T) => K,
): Map<K, T> {
  const lookup = new Map<K, T>();
  for (const row of rows) {
    lookup.set(keyOf(row), row);
  }
  return lookup;
}

function isVoidedProject(project: LegacyProjectRow | undefined): boolean {
  return numberValue(project?.delFlag ?? 0) === 2;
}

function hasExistingInventorySelectionEvidence(
  line: LegacyProjectInboundLineRow,
): boolean {
  return (
    line.legacyMaterialId !== null &&
    (numberValue(line.inventoryUsageRows) > 0 ||
      numberValue(line.projectInventoryLogRows) > 0)
  );
}

function buildGroups(params: {
  legacyProjects: readonly LegacyProjectRow[];
  legacyAcceptedLines: readonly LegacyProjectInboundLineRow[];
  projectMaps: readonly ProjectMapRow[];
  lineMaps: readonly LineMapRow[];
  existingOrders: readonly ExistingOrderRow[];
}): {
  groups: BackfillGroup[];
  excludedAcceptedLineCount: number;
  voidedAcceptedLineCount: number;
  missingProjectMapLineCount: number;
  missingLineMapLineCount: number;
  existingInventorySelectionLineCount: number;
  missingInboundBizDateLineCount: number;
  historicalProjectDirectInboundLineCount: number;
  unsupportedNoAcceptanceLineCount: number;
} {
  const legacyProjectById = buildLookup(
    params.legacyProjects,
    (project) => project.legacyProjectId,
  );
  const projectMapByLegacyId = buildLookup(
    params.projectMaps,
    (project) => project.legacyProjectId,
  );
  const lineMapByLegacyId = buildLookup(
    params.lineMaps,
    (line) => line.legacyLineId,
  );
  const existingOrderByDocumentNo = buildLookup(
    params.existingOrders,
    (order) => order.documentNo,
  );
  const groupByKey = new Map<string, BackfillGroup>();
  let excludedAcceptedLineCount = 0;
  let voidedAcceptedLineCount = 0;
  let missingProjectMapLineCount = 0;
  let missingLineMapLineCount = 0;
  let existingInventorySelectionLineCount = 0;
  let missingInboundBizDateLineCount = 0;
  let historicalProjectDirectInboundLineCount = 0;
  let unsupportedNoAcceptanceLineCount = 0;

  for (const legacyLine of params.legacyAcceptedLines) {
    const legacyProject = legacyProjectById.get(legacyLine.legacyProjectId);
    if (isVoidedProject(legacyProject)) {
      voidedAcceptedLineCount += 1;
      continue;
    }

    if (hasExistingInventorySelectionEvidence(legacyLine)) {
      existingInventorySelectionLineCount += 1;
      continue;
    }

    if (
      legacyLine.acceptanceDate === null &&
      legacyLine.legacyMaterialId !== null
    ) {
      unsupportedNoAcceptanceLineCount += 1;
      excludedAcceptedLineCount += 1;
      continue;
    }

    if (!legacyLine.inboundBizDate) {
      missingInboundBizDateLineCount += 1;
      excludedAcceptedLineCount += 1;
      continue;
    }

    const project = projectMapByLegacyId.get(legacyLine.legacyProjectId);
    if (!project) {
      missingProjectMapLineCount += 1;
      excludedAcceptedLineCount += 1;
      continue;
    }

    const line = lineMapByLegacyId.get(legacyLine.legacyLineId);
    if (!line || line.salesProjectId !== project.salesProjectId) {
      missingLineMapLineCount += 1;
      excludedAcceptedLineCount += 1;
      continue;
    }

    if (legacyLine.inboundDateSource === "project_create_time") {
      historicalProjectDirectInboundLineCount += 1;
    }

    const groupKey = `${project.salesProjectId}:${legacyLine.inboundBizDate}`;
    const documentNo = documentNoForGroup(project, legacyLine.inboundBizDate);
    const group =
      groupByKey.get(groupKey) ??
      ({
        groupKey,
        documentNo,
        bizDate: legacyLine.inboundBizDate,
        dateSourceCounts: {},
        project,
        lines: [],
        totalQty: "0.000000",
        totalAmount: "0.00",
        existingOrder: existingOrderByDocumentNo.get(documentNo) ?? null,
      } satisfies BackfillGroup);
    const dateSource = legacyLine.inboundDateSource ?? "unknown";
    group.dateSourceCounts[dateSource] =
      (group.dateSourceCounts[dateSource] ?? 0) + 1;
    group.lines.push({ ...line, legacyLineId: legacyLine.legacyLineId });
    groupByKey.set(groupKey, group);
  }

  const groups = [...groupByKey.values()].map((group) => {
    const totalQty = group.lines.reduce(
      (sum, line) => sum + amountValue(line.quantity),
      0,
    );
    const totalAmount = group.lines.reduce(
      (sum, line) => sum + amountValue(line.amount),
      0,
    );
    return {
      ...group,
      lines: group.lines.sort(
        (left, right) => left.projectLineNo - right.projectLineNo,
      ),
      totalQty: totalQty.toFixed(6),
      totalAmount: totalAmount.toFixed(2),
    };
  });

  return {
    groups: groups.sort((left, right) =>
      left.documentNo.localeCompare(right.documentNo),
    ),
    excludedAcceptedLineCount,
    voidedAcceptedLineCount,
    missingProjectMapLineCount,
    missingLineMapLineCount,
    existingInventorySelectionLineCount,
    missingInboundBizDateLineCount,
    historicalProjectDirectInboundLineCount,
    unsupportedNoAcceptanceLineCount,
  };
}

function buildBlockers(params: {
  eligibleLineCount: number;
  groups: readonly BackfillGroup[];
  existingOrders: readonly ExistingOrderRow[];
}): BackfillBlocker[] {
  const blockers: BackfillBlocker[] = [];
  if (params.eligibleLineCount !== EXPECTED_PROJECT_INBOUND_LINE_COUNT) {
    blockers.push({
      reason: "project-inbound-line-count-drift",
      expected: EXPECTED_PROJECT_INBOUND_LINE_COUNT,
      actual: params.eligibleLineCount,
    });
  }

  const conflictingOrders = params.groups.filter(
    (group) =>
      group.existingOrder !== null &&
      group.existingOrder.createdBy !== GENERATED_BY,
  );
  if (conflictingOrders.length > 0) {
    blockers.push({
      reason: "planned-document-conflict",
      details: {
        documentNos: conflictingOrders.map((group) => group.documentNo),
      },
    });
  }

  const plannedDocumentNos = new Set(
    params.groups.map((group) => group.documentNo),
  );
  const orphanExistingOrders = params.existingOrders.filter(
    (order) => !plannedDocumentNos.has(order.documentNo),
  );
  if (orphanExistingOrders.length > 0) {
    blockers.push({
      reason: "generated-document-no-longer-planned",
      actual: orphanExistingOrders.length,
      details: {
        orders: orphanExistingOrders.map((order) => ({
          orderId: order.orderId,
          documentNo: order.documentNo,
          lineCount: order.lineCount,
          createdBy: order.createdBy,
        })),
      },
    });
  }

  const staleExistingOrders = params.groups.filter(
    (group) =>
      group.existingOrder !== null &&
      group.existingOrder.createdBy === GENERATED_BY &&
      numberValue(group.existingOrder.lineCount) !== group.lines.length,
  );
  if (staleExistingOrders.length > 0) {
    blockers.push({
      reason: "generated-document-line-count-stale",
      actual: staleExistingOrders.length,
      details: {
        orders: staleExistingOrders.map((group) => ({
          orderId: group.existingOrder?.orderId ?? null,
          documentNo: group.documentNo,
          expectedLineCount: group.lines.length,
          actualLineCount: group.existingOrder?.lineCount ?? null,
        })),
      },
    });
  }

  return blockers;
}

async function insertStockInOrder(
  connection: MigrationConnectionLike,
  group: BackfillGroup,
): Promise<number> {
  const project = group.project;
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
      group.documentNo,
      group.bizDate,
      project.salesProjectId,
      project.managerPersonnelId,
      project.stockScopeId,
      project.workshopId,
      project.salesProjectCode,
      project.salesProjectName,
      project.managerNameSnapshot,
      project.workshopNameSnapshot,
      group.totalQty,
      group.totalAmount,
      `销售项目历史项目入库重建：${project.salesProjectCode} ${group.bizDate}`,
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
  lineNo: number,
  line: LineMapRow,
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
      lineNo,
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
      `Expected to insert one accepted stock_in_order_line, orderId=${orderId}, lineNo=${lineNo}.`,
    );
  }
}

async function executeBackfill(
  connection: MigrationConnectionLike,
  groups: readonly BackfillGroup[],
): Promise<ExecutionResult> {
  await connection.beginTransaction();
  try {
    let insertedOrders = 0;
    let insertedLines = 0;
    let skippedExistingOrders = 0;

    for (const group of groups) {
      if (group.existingOrder !== null) {
        skippedExistingOrders += 1;
        continue;
      }

      const orderId = await insertStockInOrder(connection, group);
      insertedOrders += 1;

      for (let index = 0; index < group.lines.length; index += 1) {
        await insertStockInOrderLine(
          connection,
          orderId,
          index + 1,
          group.lines[index],
        );
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
  const reportPath = resolveReportPath(
    cliOptions,
    cliOptions.execute ? EXECUTE_REPORT_FILE_NAME : DRY_RUN_REPORT_FILE_NAME,
  );
  const env = loadMigrationEnvironment({ requireLegacyDatabaseUrl: true });
  assertDistinctSourceAndTargetDatabases(
    env.legacyDatabaseUrl,
    env.databaseUrl,
  );
  const targetDatabaseName = assertExpectedDatabaseName(
    env.databaseUrl,
    EXPECTED_TARGET_DATABASE_NAME,
    "Target",
  );
  const legacyDatabaseUrl = env.legacyDatabaseUrl;
  if (!legacyDatabaseUrl) {
    throw new Error("LEGACY_DATABASE_URL is required for accepted backfill.");
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
        const [
          legacyProjects,
          legacyAcceptedLines,
          projectMaps,
          lineMaps,
          existingOrders,
        ] = await Promise.all([
          loadLegacyProjects(legacyConnection),
          loadLegacyAcceptedLines(legacyConnection),
          loadProjectMaps(connection),
          loadLineMaps(connection),
          loadExistingOrders(connection),
        ]);

        const grouped = buildGroups({
          legacyProjects,
          legacyAcceptedLines,
          projectMaps,
          lineMaps,
          existingOrders,
        });
        const eligibleLineCount = grouped.groups.reduce(
          (sum, group) => sum + group.lines.length,
          0,
        );
        const plannedGroups = grouped.groups.filter(
          (group) => group.existingOrder === null,
        );
        const blockers = buildBlockers({
          eligibleLineCount,
          groups: grouped.groups,
          existingOrders,
        });

        let executionResult: ExecutionResult | null = null;
        if (cliOptions.execute) {
          if (!cliOptions.allowBlockers && blockers.length > 0) {
            throw new Error(
              `sales-project accepted inbound backfill blocked: ${blockers
                .map((blocker) => blocker.reason)
                .join(", ")}`,
            );
          }
          executionResult = await executeBackfill(connection, grouped.groups);
        }

        const report = {
          mode: cliOptions.execute ? "execute" : "dry-run",
          targetDatabaseName,
          legacyDatabaseName,
          generatedAt: new Date().toISOString(),
          generatedDocumentPrefix: GENERATED_DOCUMENT_PREFIX,
          generatedBy: GENERATED_BY,
          expectedProjectInboundLineCount: EXPECTED_PROJECT_INBOUND_LINE_COUNT,
          eligible: blockers.length === 0,
          blockers,
          summary: {
            legacyLineCount: legacyAcceptedLines.length,
            eligibleProjectInboundLineCount: eligibleLineCount,
            historicalProjectDirectInboundLineCount:
              grouped.historicalProjectDirectInboundLineCount,
            existingInventorySelectionLineCount:
              grouped.existingInventorySelectionLineCount,
            voidedAcceptedLineCount: grouped.voidedAcceptedLineCount,
            excludedAcceptedLineCount: grouped.excludedAcceptedLineCount,
            missingProjectMapLineCount: grouped.missingProjectMapLineCount,
            missingLineMapLineCount: grouped.missingLineMapLineCount,
            missingInboundBizDateLineCount:
              grouped.missingInboundBizDateLineCount,
            unsupportedNoAcceptanceLineCount:
              grouped.unsupportedNoAcceptanceLineCount,
            existingGeneratedOrderCount:
              grouped.groups.length - plannedGroups.length,
            wouldCreateOrders: plannedGroups.length,
            wouldCreateLines: plannedGroups.reduce(
              (sum, group) => sum + group.lines.length,
              0,
            ),
          },
          groups: grouped.groups.map((group) => ({
            documentNo: group.documentNo,
            salesProjectId: group.project.salesProjectId,
            salesProjectCode: group.project.salesProjectCode,
            bizDate: group.bizDate,
            dateSourceCounts: group.dateSourceCounts,
            lineCount: group.lines.length,
            totalQty: group.totalQty,
            totalAmount: group.totalAmount,
            existingOrderId: group.existingOrder?.orderId ?? null,
            legacyLineIds: group.lines.map((line) => line.legacyLineId),
          })),
          executionResult,
        };

        writeStableReport(reportPath, report);
        console.log(
          `Sales-project accepted inbound backfill ${report.mode} completed. blockers=${blockers.length}, wouldCreateOrders=${report.summary.wouldCreateOrders}, wouldCreateLines=${report.summary.wouldCreateLines}, report=${reportPath}`,
        );
      });
    });
  } finally {
    await closePools(pool, legacyPool);
  }
}

void main();
