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
  withPoolConnection,
} from "../db";
import { writeStableReport } from "../shared/report-writer";

const REPORT_FILE_NAME =
  "sales-project-legacy-admission-split-audit-report.json";
const GENERATED_DOCUMENT_PREFIX = "YS-PROJ-";
const GENERATED_BY = "sales-project-accepted-inbound-backfill";

const EXPECTED_BASELINE = {
  legacyProjectCount: 24,
  legacyLineCount: 758,
  existingGeneratedOrderCount: 109,
  existingGeneratedLineCount: 634,
  arrivalAcceptedInboundLineCount: 380,
  historicalProjectDirectInboundLineCount: 254,
  existingInventorySelectionLineCount: 122,
  pendingSelectionCandidateLineCount: 0,
  voidedProjectHoldLineCount: 2,
  excludedNeedsRepairLineCount: 0,
  overgeneratedYsProjectLineCount: 0,
} as const;

type LineClassification =
  | "arrival-accepted-inbound"
  | "historical-project-direct-inbound"
  | "existing-inventory-selection"
  | "pending-selection-candidate"
  | "voided-project-hold"
  | "excluded-needs-repair";

type ProjectDisposition =
  | "arrival-accepted-inbound-only"
  | "historical-project-direct-inbound-only"
  | "existing-inventory-selection-only"
  | "pending-selection-candidate-only"
  | "mixed-project-inbound-and-inventory-selection"
  | "voided-project-hold"
  | "excluded-needs-repair"
  | "ignored-no-lines";

interface LegacyProjectRow {
  legacyProjectId: number;
  projectName: string | null;
  delFlag: number | string | null;
  customerLegacyId: number | null;
  orderDate: string | null;
  outBoundDate: string | null;
  createdDate: string | null;
}

interface LegacyLineRow {
  legacyLineId: number;
  legacyProjectId: number;
  legacyMaterialId: number | null;
  materialName: string | null;
  materialSpec: string | null;
  quantity: string;
  unitPrice: string | null;
  amount: string | null;
  unit: string | null;
  supplierLegacyId: number | null;
  acceptanceDate: string | null;
}

interface LegacyInventoryEvidenceRow {
  legacyLineId: number;
  inventoryUsageRows: number;
  inventoryUsedQty: string;
  inventoryBeforeOrderTypes: string | null;
  projectInventoryLogRows: number;
  projectInventoryLogChangeQty: string;
}

interface TargetProjectMapRow {
  legacyProjectId: number;
  targetTable: string;
  targetId: number;
  targetCode: string | null;
  migrationBatch: string;
  salesProjectId: number | null;
  salesProjectCode: string | null;
  salesProjectName: string | null;
  projectTargetId: number | null;
}

interface TargetLineMapRow {
  legacyLineId: number;
  targetTable: string;
  targetId: number;
  targetCode: string | null;
  migrationBatch: string;
  salesProjectMaterialLineId: number | null;
  salesProjectId: number | null;
  lineNo: number | null;
  materialId: number | null;
  materialCodeSnapshot: string | null;
  materialNameSnapshot: string | null;
  materialSpecSnapshot: string | null;
  unitCodeSnapshot: string | null;
  quantity: string | null;
  unitPrice: string | null;
  amount: string | null;
}

interface GeneratedOrderRow {
  orderId: number;
  documentNo: string;
  salesProjectId: number | null;
  createdBy: string | null;
  lineCount: number;
}

interface GeneratedLineRow {
  orderId: number;
  orderLineId: number;
  documentNo: string;
  bizDate: string | null;
  salesProjectId: number | null;
  createdBy: string | null;
  lineNo: number;
  materialId: number;
  quantity: string;
  unitPrice: string;
  amount: string;
}

interface AuditBlocker {
  reason: string;
  expected?: number | string;
  actual?: number | string;
  details?: Record<string, unknown>;
}

interface AuditedLine {
  legacyLineId: number;
  legacyProjectId: number;
  legacyProjectName: string | null;
  legacyDelFlag: number;
  acceptanceDate: string | null;
  effectiveInboundBizDate: string | null;
  classification: LineClassification;
  legacyMaterialId: number | null;
  inventoryUsageRows: number;
  inventoryUsedQty: string;
  inventoryBeforeOrderTypes: string | null;
  projectInventoryLogRows: number;
  projectInventoryLogChangeQty: string;
  targetProjectTable: string | null;
  salesProjectId: number | null;
  salesProjectCode: string | null;
  targetLineTable: string | null;
  salesProjectMaterialLineId: number | null;
  targetLineNo: number | null;
  targetMaterialId: number | null;
  coveredByGeneratedYsProjectOrder: boolean;
  generatedOrderId: number | null;
  generatedOrderLineId: number | null;
  generatedDocumentNo: string | null;
  generatedBy: string | null;
  materialMatchesGeneratedLine: boolean | null;
}

interface AuditedProject {
  legacyProjectId: number;
  projectName: string | null;
  delFlag: number;
  disposition: ProjectDisposition;
  lineCount: number;
  arrivalAcceptedInboundLineCount: number;
  historicalProjectDirectInboundLineCount: number;
  existingInventorySelectionLineCount: number;
  pendingSelectionCandidateLineCount: number;
  voidedProjectHoldLineCount: number;
  excludedNeedsRepairLineCount: number;
  salesProjectId: number | null;
  salesProjectCode: string | null;
  projectTargetId: number | null;
  existingGeneratedOrderId: number | null;
  existingGeneratedDocumentNo: string | null;
  existingGeneratedBy: string | null;
  existingGeneratedLineCount: number;
  acceptedCoveredByYsProjectLineCount: number;
  overgeneratedYsProjectLineCount: number;
}

function numberValue(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "bigint") return Number(value);
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function generatedLineSignature(params: {
  salesProjectId: number | null;
  bizDate: string | null;
  materialId: number | null;
  quantity: string | null;
  unitPrice: string | null;
  amount: string | null;
}): string | null {
  if (
    params.salesProjectId === null ||
    params.bizDate === null ||
    params.materialId === null ||
    params.quantity === null ||
    params.unitPrice === null ||
    params.amount === null
  ) {
    return null;
  }

  return [
    params.salesProjectId,
    params.bizDate,
    params.materialId,
    params.quantity,
    params.unitPrice,
    params.amount,
  ].join(":");
}

function createLineCounts(): Record<LineClassification, number> {
  return {
    "arrival-accepted-inbound": 0,
    "historical-project-direct-inbound": 0,
    "existing-inventory-selection": 0,
    "pending-selection-candidate": 0,
    "voided-project-hold": 0,
    "excluded-needs-repair": 0,
  };
}

function createProjectDispositionCounts(): Record<ProjectDisposition, number> {
  return {
    "arrival-accepted-inbound-only": 0,
    "historical-project-direct-inbound-only": 0,
    "existing-inventory-selection-only": 0,
    "pending-selection-candidate-only": 0,
    "mixed-project-inbound-and-inventory-selection": 0,
    "voided-project-hold": 0,
    "excluded-needs-repair": 0,
    "ignored-no-lines": 0,
  };
}

function isVoidedProject(project: LegacyProjectRow): boolean {
  return numberValue(project.delFlag) === 2;
}

function hasValidSalesProjectMapping(
  mapping: TargetProjectMapRow | undefined,
): boolean {
  return (
    mapping?.targetTable === "sales_project" &&
    mapping.salesProjectId !== null &&
    mapping.salesProjectCode !== null
  );
}

function hasValidSalesProjectLineMapping(
  mapping: TargetLineMapRow | undefined,
): boolean {
  return (
    mapping?.targetTable === "sales_project_material_line" &&
    mapping.salesProjectMaterialLineId !== null &&
    mapping.salesProjectId !== null &&
    mapping.lineNo !== null
  );
}

function classifyLine(
  project: LegacyProjectRow,
  line: LegacyLineRow,
  inventoryEvidence: LegacyInventoryEvidenceRow | undefined,
  projectMapping: TargetProjectMapRow | undefined,
  lineMapping: TargetLineMapRow | undefined,
): LineClassification {
  if (isVoidedProject(project)) return "voided-project-hold";
  if (
    !hasValidSalesProjectMapping(projectMapping) ||
    !hasValidSalesProjectLineMapping(lineMapping)
  ) {
    return "excluded-needs-repair";
  }
  if (hasExistingInventorySelectionEvidence(line, inventoryEvidence)) {
    return "existing-inventory-selection";
  }
  if (line.acceptanceDate !== null) return "arrival-accepted-inbound";
  if (project.createdDate !== null) return "historical-project-direct-inbound";
  return "excluded-needs-repair";
}

function effectiveInboundBizDate(
  project: LegacyProjectRow,
  line: LegacyLineRow,
): string | null {
  return line.acceptanceDate ?? project.createdDate;
}

function resolveProjectDisposition(
  lineCount: number,
  counts: Record<LineClassification, number>,
): ProjectDisposition {
  if (lineCount === 0) return "ignored-no-lines";
  if (counts["voided-project-hold"] > 0) return "voided-project-hold";
  if (counts["excluded-needs-repair"] > 0) return "excluded-needs-repair";
  const activeCategoryCount = [
    counts["arrival-accepted-inbound"],
    counts["historical-project-direct-inbound"],
    counts["existing-inventory-selection"],
    counts["pending-selection-candidate"],
  ].filter((count) => count > 0).length;
  if (activeCategoryCount > 1) {
    return "mixed-project-inbound-and-inventory-selection";
  }
  if (counts["arrival-accepted-inbound"] > 0) {
    return "arrival-accepted-inbound-only";
  }
  if (counts["historical-project-direct-inbound"] > 0) {
    return "historical-project-direct-inbound-only";
  }
  if (counts["existing-inventory-selection"] > 0) {
    return "existing-inventory-selection-only";
  }
  return "pending-selection-candidate-only";
}

function hasExistingInventorySelectionEvidence(
  line: LegacyLineRow,
  inventoryEvidence: LegacyInventoryEvidenceRow | undefined,
): boolean {
  return (
    line.legacyMaterialId !== null &&
    (numberValue(inventoryEvidence?.inventoryUsageRows ?? 0) > 0 ||
      numberValue(inventoryEvidence?.projectInventoryLogRows ?? 0) > 0)
  );
}

async function loadLegacyProjects(
  connection: MigrationConnectionLike,
): Promise<LegacyProjectRow[]> {
  return connection.query<LegacyProjectRow[]>(
    `
      SELECT
        project_row.product_id AS legacyProjectId,
        project_row.product_name AS projectName,
        project_row.del_flag AS delFlag,
        project_row.customer_id AS customerLegacyId,
        DATE_FORMAT(project_row.order_date, '%Y-%m-%d') AS orderDate,
        DATE_FORMAT(project_row.out_bound_date, '%Y-%m-%d') AS outBoundDate,
        DATE_FORMAT(project_row.create_time, '%Y-%m-%d') AS createdDate
      FROM saifute_composite_product project_row
      ORDER BY project_row.product_id ASC
    `,
  );
}

async function loadLegacyLines(
  connection: MigrationConnectionLike,
): Promise<LegacyLineRow[]> {
  return connection.query<LegacyLineRow[]>(
    `
      SELECT
        line_row.id AS legacyLineId,
        line_row.product_id AS legacyProjectId,
        line_row.material_id AS legacyMaterialId,
        line_row.material_name AS materialName,
        line_row.specification AS materialSpec,
        line_row.quantity AS quantity,
        line_row.unit_price AS unitPrice,
        line_row.tax_included_price AS amount,
        line_row.unit AS unit,
        line_row.supplier_id AS supplierLegacyId,
        DATE_FORMAT(line_row.acceptance_date, '%Y-%m-%d') AS acceptanceDate
      FROM saifute_product_material line_row
      ORDER BY line_row.product_id ASC, line_row.id ASC
    `,
  );
}

async function loadLegacyInventoryEvidence(
  connection: MigrationConnectionLike,
): Promise<LegacyInventoryEvidenceRow[]> {
  return connection.query<LegacyInventoryEvidenceRow[]>(
    `
      SELECT
        line_row.id AS legacyLineId,
        COALESCE(usage_summary.inventoryUsageRows, 0) AS inventoryUsageRows,
        COALESCE(usage_summary.inventoryUsedQty, 0) AS inventoryUsedQty,
        usage_summary.inventoryBeforeOrderTypes AS inventoryBeforeOrderTypes,
        COALESCE(log_summary.projectInventoryLogRows, 0) AS projectInventoryLogRows,
        COALESCE(log_summary.projectInventoryLogChangeQty, 0) AS projectInventoryLogChangeQty
      FROM saifute_product_material line_row
      LEFT JOIN (
        SELECT
          after_detail_id AS legacyLineId,
          COUNT(*) AS inventoryUsageRows,
          COALESCE(SUM(use_qty), 0) AS inventoryUsedQty,
          GROUP_CONCAT(DISTINCT before_order_type ORDER BY before_order_type) AS inventoryBeforeOrderTypes
        FROM saifute_inventory_used
        WHERE after_order_type = 8
        GROUP BY after_detail_id
      ) usage_summary
        ON usage_summary.legacyLineId = line_row.id
      LEFT JOIN (
        SELECT
          product_line.id AS legacyLineId,
          COUNT(*) AS projectInventoryLogRows,
          COALESCE(SUM(log_row.change_qty), 0) AS projectInventoryLogChangeQty
        FROM saifute_product_material product_line
        INNER JOIN saifute_inventory_log log_row
          ON log_row.related_order_type = 8
         AND log_row.related_order_id = product_line.product_id
         AND log_row.material_id = product_line.material_id
        GROUP BY product_line.id
      ) log_summary
        ON log_summary.legacyLineId = line_row.id
      ORDER BY line_row.id ASC
    `,
  );
}

async function loadTargetProjectMaps(
  connection: MigrationConnectionLike,
): Promise<TargetProjectMapRow[]> {
  return connection.query<TargetProjectMapRow[]>(
    `
      SELECT
        map_row.legacy_id AS legacyProjectId,
        map_row.target_table AS targetTable,
        map_row.target_id AS targetId,
        map_row.target_code AS targetCode,
        map_row.migration_batch AS migrationBatch,
        sales_project.id AS salesProjectId,
        sales_project.sales_project_code AS salesProjectCode,
        sales_project.sales_project_name AS salesProjectName,
        sales_project.project_target_id AS projectTargetId
      FROM migration_staging.map_project map_row
      LEFT JOIN sales_project
        ON sales_project.id = map_row.target_id
       AND map_row.target_table = 'sales_project'
      WHERE map_row.legacy_table = 'saifute_composite_product'
      ORDER BY map_row.legacy_id ASC
    `,
  );
}

async function loadTargetLineMaps(
  connection: MigrationConnectionLike,
): Promise<TargetLineMapRow[]> {
  return connection.query<TargetLineMapRow[]>(
    `
      SELECT
        map_row.legacy_id AS legacyLineId,
        map_row.target_table AS targetTable,
        map_row.target_id AS targetId,
        map_row.target_code AS targetCode,
        map_row.migration_batch AS migrationBatch,
        line.id AS salesProjectMaterialLineId,
        line.project_id AS salesProjectId,
        line.line_no AS lineNo,
        line.material_id AS materialId,
        line.material_code_snapshot AS materialCodeSnapshot,
        line.material_name_snapshot AS materialNameSnapshot,
        line.material_spec_snapshot AS materialSpecSnapshot,
        line.unit_code_snapshot AS unitCodeSnapshot,
        line.quantity AS quantity,
        line.unit_price AS unitPrice,
        line.amount AS amount
      FROM migration_staging.map_project_material_line map_row
      LEFT JOIN sales_project_material_line line
        ON line.id = map_row.target_id
       AND map_row.target_table = 'sales_project_material_line'
      WHERE map_row.legacy_table = 'saifute_product_material'
      ORDER BY map_row.legacy_id ASC
    `,
  );
}

async function loadGeneratedOrders(
  connection: MigrationConnectionLike,
): Promise<GeneratedOrderRow[]> {
  return connection.query<GeneratedOrderRow[]>(
    `
      SELECT
        stock_in_order.id AS orderId,
        stock_in_order.document_no AS documentNo,
        stock_in_order.sales_project_id AS salesProjectId,
        stock_in_order.created_by AS createdBy,
        COUNT(stock_in_order_line.id) AS lineCount
      FROM stock_in_order
      LEFT JOIN stock_in_order_line
        ON stock_in_order_line.order_id = stock_in_order.id
      WHERE stock_in_order.document_no LIKE ?
      GROUP BY
        stock_in_order.id,
        stock_in_order.document_no,
        stock_in_order.sales_project_id,
        stock_in_order.created_by
      ORDER BY stock_in_order.document_no ASC
    `,
    [`${GENERATED_DOCUMENT_PREFIX}%`],
  );
}

async function loadGeneratedLines(
  connection: MigrationConnectionLike,
): Promise<GeneratedLineRow[]> {
  return connection.query<GeneratedLineRow[]>(
    `
      SELECT
        stock_in_order.id AS orderId,
        stock_in_order_line.id AS orderLineId,
        stock_in_order.document_no AS documentNo,
        DATE_FORMAT(stock_in_order.biz_date, '%Y-%m-%d') AS bizDate,
        stock_in_order.sales_project_id AS salesProjectId,
        stock_in_order.created_by AS createdBy,
        stock_in_order_line.line_no AS lineNo,
        stock_in_order_line.material_id AS materialId,
        stock_in_order_line.quantity AS quantity,
        stock_in_order_line.unit_price AS unitPrice,
        stock_in_order_line.amount AS amount
      FROM stock_in_order
      INNER JOIN stock_in_order_line
        ON stock_in_order_line.order_id = stock_in_order.id
      WHERE stock_in_order.document_no LIKE ?
      ORDER BY stock_in_order.document_no ASC, stock_in_order_line.line_no ASC
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

function buildGeneratedLineBuckets(
  rows: readonly GeneratedLineRow[],
): Map<string, GeneratedLineRow[]> {
  const buckets = new Map<string, GeneratedLineRow[]>();
  for (const row of rows) {
    const key = generatedLineSignature({
      salesProjectId: row.salesProjectId,
      bizDate: row.bizDate,
      materialId: row.materialId,
      quantity: row.quantity,
      unitPrice: row.unitPrice,
      amount: row.amount,
    });
    if (key === null) continue;
    const bucket = buckets.get(key) ?? [];
    bucket.push(row);
    buckets.set(key, bucket);
  }
  return buckets;
}

function pushCountBlocker(
  blockers: AuditBlocker[],
  reason: string,
  expected: number,
  actual: number,
): void {
  if (actual !== expected) {
    blockers.push({ reason, expected, actual });
  }
}

function buildBlockers(params: {
  summary: {
    legacyProjectCount: number;
    legacyLineCount: number;
    existingGeneratedOrderCount: number;
    existingGeneratedLineCount: number;
    lineClassificationCounts: Record<LineClassification, number>;
    overgeneratedYsProjectLineCount: number;
  };
  nonBackfillGeneratedOrders: GeneratedOrderRow[];
}): AuditBlocker[] {
  const blockers: AuditBlocker[] = [];
  const { summary } = params;

  pushCountBlocker(
    blockers,
    "legacy-project-count-drift",
    EXPECTED_BASELINE.legacyProjectCount,
    summary.legacyProjectCount,
  );
  pushCountBlocker(
    blockers,
    "legacy-line-count-drift",
    EXPECTED_BASELINE.legacyLineCount,
    summary.legacyLineCount,
  );
  pushCountBlocker(
    blockers,
    "existing-generated-order-count-drift",
    EXPECTED_BASELINE.existingGeneratedOrderCount,
    summary.existingGeneratedOrderCount,
  );
  pushCountBlocker(
    blockers,
    "existing-generated-line-count-drift",
    EXPECTED_BASELINE.existingGeneratedLineCount,
    summary.existingGeneratedLineCount,
  );
  pushCountBlocker(
    blockers,
    "arrival-accepted-inbound-line-count-drift",
    EXPECTED_BASELINE.arrivalAcceptedInboundLineCount,
    summary.lineClassificationCounts["arrival-accepted-inbound"],
  );
  pushCountBlocker(
    blockers,
    "historical-project-direct-inbound-line-count-drift",
    EXPECTED_BASELINE.historicalProjectDirectInboundLineCount,
    summary.lineClassificationCounts["historical-project-direct-inbound"],
  );
  pushCountBlocker(
    blockers,
    "existing-inventory-selection-line-count-drift",
    EXPECTED_BASELINE.existingInventorySelectionLineCount,
    summary.lineClassificationCounts["existing-inventory-selection"],
  );
  pushCountBlocker(
    blockers,
    "pending-selection-candidate-line-count-drift",
    EXPECTED_BASELINE.pendingSelectionCandidateLineCount,
    summary.lineClassificationCounts["pending-selection-candidate"],
  );
  pushCountBlocker(
    blockers,
    "voided-project-hold-line-count-drift",
    EXPECTED_BASELINE.voidedProjectHoldLineCount,
    summary.lineClassificationCounts["voided-project-hold"],
  );
  pushCountBlocker(
    blockers,
    "excluded-needs-repair-line-count-drift",
    EXPECTED_BASELINE.excludedNeedsRepairLineCount,
    summary.lineClassificationCounts["excluded-needs-repair"],
  );
  pushCountBlocker(
    blockers,
    "overgenerated-ys-project-line-count-drift",
    EXPECTED_BASELINE.overgeneratedYsProjectLineCount,
    summary.overgeneratedYsProjectLineCount,
  );

  if (params.nonBackfillGeneratedOrders.length > 0) {
    blockers.push({
      reason: "ys-project-order-not-created-by-backfill",
      details: {
        orders: params.nonBackfillGeneratedOrders.map((order) => ({
          orderId: order.orderId,
          documentNo: order.documentNo,
          createdBy: order.createdBy,
        })),
      },
    });
  }

  return blockers;
}

function auditRows(params: {
  legacyProjects: readonly LegacyProjectRow[];
  legacyLines: readonly LegacyLineRow[];
  legacyInventoryEvidence: readonly LegacyInventoryEvidenceRow[];
  targetProjectMaps: readonly TargetProjectMapRow[];
  targetLineMaps: readonly TargetLineMapRow[];
  generatedOrders: readonly GeneratedOrderRow[];
  generatedLines: readonly GeneratedLineRow[];
}): {
  projects: AuditedProject[];
  lines: AuditedLine[];
  lineClassificationCounts: Record<LineClassification, number>;
  projectDispositionCounts: Record<ProjectDisposition, number>;
  remainingOvergeneratedYsProjectLineCount: number;
  nonBackfillGeneratedOrders: GeneratedOrderRow[];
} {
  const projectById = buildLookup(
    params.legacyProjects,
    (project) => project.legacyProjectId,
  );
  const projectMapByLegacyId = buildLookup(
    params.targetProjectMaps,
    (mapping) => mapping.legacyProjectId,
  );
  const lineMapByLegacyId = buildLookup(
    params.targetLineMaps,
    (mapping) => mapping.legacyLineId,
  );
  const inventoryEvidenceByLegacyLineId = buildLookup(
    params.legacyInventoryEvidence,
    (evidence) => evidence.legacyLineId,
  );
  const generatedOrderByProjectId = new Map<number, GeneratedOrderRow>();
  for (const order of params.generatedOrders) {
    if (order.salesProjectId !== null) {
      generatedOrderByProjectId.set(order.salesProjectId, order);
    }
  }

  const lineBucketsByProjectId = new Map<number, LegacyLineRow[]>();
  for (const line of params.legacyLines) {
    const bucket = lineBucketsByProjectId.get(line.legacyProjectId) ?? [];
    bucket.push(line);
    lineBucketsByProjectId.set(line.legacyProjectId, bucket);
  }

  const unmatchedGeneratedLineBuckets = buildGeneratedLineBuckets(
    params.generatedLines,
  );

  const auditedLines: AuditedLine[] = [];
  const auditedProjects: AuditedProject[] = [];
  const lineClassificationCounts = createLineCounts();
  const projectDispositionCounts = createProjectDispositionCounts();

  for (const project of params.legacyProjects) {
    const projectMapping = projectMapByLegacyId.get(project.legacyProjectId);
    const projectLineCounts = createLineCounts();
    const lines = lineBucketsByProjectId.get(project.legacyProjectId) ?? [];
    const generatedOrder =
      projectMapping?.salesProjectId === null ||
      typeof projectMapping === "undefined"
        ? null
        : (generatedOrderByProjectId.get(projectMapping.salesProjectId) ??
          null);

    let acceptedCoveredByYsProjectLineCount = 0;
    let overgeneratedYsProjectLineCount = 0;

    for (const line of lines) {
      const lineMapping = lineMapByLegacyId.get(line.legacyLineId);
      const inventoryEvidence = inventoryEvidenceByLegacyLineId.get(
        line.legacyLineId,
      );
      const classification = classifyLine(
        project,
        line,
        inventoryEvidence,
        projectMapping,
        lineMapping,
      );
      lineClassificationCounts[classification] += 1;
      projectLineCounts[classification] += 1;

      const inboundBizDate = effectiveInboundBizDate(project, line);
      const coverageKey = generatedLineSignature({
        salesProjectId: projectMapping?.salesProjectId ?? null,
        bizDate: inboundBizDate,
        materialId: lineMapping?.materialId ?? null,
        quantity: lineMapping?.quantity ?? null,
        unitPrice: lineMapping?.unitPrice ?? null,
        amount: lineMapping?.amount ?? null,
      });
      const generatedLineBucket =
        coverageKey === null
          ? null
          : (unmatchedGeneratedLineBuckets.get(coverageKey) ?? null);
      const generatedLine =
        (classification === "arrival-accepted-inbound" ||
          classification === "historical-project-direct-inbound") &&
        generatedLineBucket !== null &&
        generatedLineBucket.length > 0
          ? (generatedLineBucket.shift() ?? null)
          : null;
      const coveredByGeneratedYsProjectOrder = generatedLine !== null;

      if (
        (classification === "arrival-accepted-inbound" ||
          classification === "historical-project-direct-inbound") &&
        coveredByGeneratedYsProjectOrder
      ) {
        acceptedCoveredByYsProjectLineCount += 1;
      }
      if (
        classification !== "arrival-accepted-inbound" &&
        coveredByGeneratedYsProjectOrder
      ) {
        overgeneratedYsProjectLineCount += 1;
      }

      auditedLines.push({
        legacyLineId: line.legacyLineId,
        legacyProjectId: line.legacyProjectId,
        legacyProjectName: project.projectName,
        legacyDelFlag: numberValue(project.delFlag),
        acceptanceDate: line.acceptanceDate,
        effectiveInboundBizDate: inboundBizDate,
        classification,
        legacyMaterialId: line.legacyMaterialId,
        inventoryUsageRows: numberValue(
          inventoryEvidence?.inventoryUsageRows ?? 0,
        ),
        inventoryUsedQty: inventoryEvidence?.inventoryUsedQty ?? "0",
        inventoryBeforeOrderTypes:
          inventoryEvidence?.inventoryBeforeOrderTypes ?? null,
        projectInventoryLogRows: numberValue(
          inventoryEvidence?.projectInventoryLogRows ?? 0,
        ),
        projectInventoryLogChangeQty:
          inventoryEvidence?.projectInventoryLogChangeQty ?? "0",
        targetProjectTable: projectMapping?.targetTable ?? null,
        salesProjectId: projectMapping?.salesProjectId ?? null,
        salesProjectCode: projectMapping?.salesProjectCode ?? null,
        targetLineTable: lineMapping?.targetTable ?? null,
        salesProjectMaterialLineId:
          lineMapping?.salesProjectMaterialLineId ?? null,
        targetLineNo: lineMapping?.lineNo ?? null,
        targetMaterialId: lineMapping?.materialId ?? null,
        coveredByGeneratedYsProjectOrder,
        generatedOrderId: generatedLine?.orderId ?? null,
        generatedOrderLineId: generatedLine?.orderLineId ?? null,
        generatedDocumentNo: generatedLine?.documentNo ?? null,
        generatedBy: generatedLine?.createdBy ?? null,
        materialMatchesGeneratedLine:
          generatedLine === null || lineMapping?.materialId === null
            ? null
            : generatedLine.materialId === lineMapping?.materialId,
      });
    }

    const disposition = resolveProjectDisposition(
      lines.length,
      projectLineCounts,
    );
    projectDispositionCounts[disposition] += 1;

    auditedProjects.push({
      legacyProjectId: project.legacyProjectId,
      projectName: project.projectName,
      delFlag: numberValue(project.delFlag),
      disposition,
      lineCount: lines.length,
      arrivalAcceptedInboundLineCount:
        projectLineCounts["arrival-accepted-inbound"],
      historicalProjectDirectInboundLineCount:
        projectLineCounts["historical-project-direct-inbound"],
      existingInventorySelectionLineCount:
        projectLineCounts["existing-inventory-selection"],
      pendingSelectionCandidateLineCount:
        projectLineCounts["pending-selection-candidate"],
      voidedProjectHoldLineCount: projectLineCounts["voided-project-hold"],
      excludedNeedsRepairLineCount: projectLineCounts["excluded-needs-repair"],
      salesProjectId: projectMapping?.salesProjectId ?? null,
      salesProjectCode: projectMapping?.salesProjectCode ?? null,
      projectTargetId: projectMapping?.projectTargetId ?? null,
      existingGeneratedOrderId: generatedOrder?.orderId ?? null,
      existingGeneratedDocumentNo: generatedOrder?.documentNo ?? null,
      existingGeneratedBy: generatedOrder?.createdBy ?? null,
      existingGeneratedLineCount: numberValue(generatedOrder?.lineCount ?? 0),
      acceptedCoveredByYsProjectLineCount,
      overgeneratedYsProjectLineCount,
    });
  }

  const orphanLines = params.legacyLines.filter(
    (line) => !projectById.has(line.legacyProjectId),
  );
  for (const line of orphanLines) {
    lineClassificationCounts["excluded-needs-repair"] += 1;
    auditedLines.push({
      legacyLineId: line.legacyLineId,
      legacyProjectId: line.legacyProjectId,
      legacyProjectName: null,
      legacyDelFlag: 0,
      acceptanceDate: line.acceptanceDate,
      effectiveInboundBizDate: null,
      classification: "excluded-needs-repair",
      legacyMaterialId: line.legacyMaterialId,
      inventoryUsageRows: 0,
      inventoryUsedQty: "0",
      inventoryBeforeOrderTypes: null,
      projectInventoryLogRows: 0,
      projectInventoryLogChangeQty: "0",
      targetProjectTable: null,
      salesProjectId: null,
      salesProjectCode: null,
      targetLineTable: null,
      salesProjectMaterialLineId: null,
      targetLineNo: null,
      targetMaterialId: null,
      coveredByGeneratedYsProjectOrder: false,
      generatedOrderId: null,
      generatedOrderLineId: null,
      generatedDocumentNo: null,
      generatedBy: null,
      materialMatchesGeneratedLine: null,
    });
  }

  const remainingOvergeneratedYsProjectLineCount = [
    ...unmatchedGeneratedLineBuckets.values(),
  ].reduce((sum, rows) => sum + rows.length, 0);

  for (const project of auditedProjects) {
    const remainingCount = project.salesProjectId
      ? [...unmatchedGeneratedLineBuckets.values()].reduce((sum, rows) => {
          const projectRows = rows.filter(
            (row) => row.salesProjectId === project.salesProjectId,
          );
          return sum + projectRows.length;
        }, 0)
      : 0;
    project.overgeneratedYsProjectLineCount = remainingCount;
  }

  return {
    projects: auditedProjects,
    lines: auditedLines,
    lineClassificationCounts,
    projectDispositionCounts,
    remainingOvergeneratedYsProjectLineCount,
    nonBackfillGeneratedOrders: params.generatedOrders.filter(
      (order) => order.createdBy !== GENERATED_BY,
    ),
  };
}

async function main(): Promise<void> {
  const cliOptions = parseMigrationCliOptions();
  if (cliOptions.execute) {
    throw new Error(
      "This audit is read-only. Remove --execute and use the staged recovery task before any live mutation.",
    );
  }

  const reportPath = resolveReportPath(cliOptions, REPORT_FILE_NAME);
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
    throw new Error("LEGACY_DATABASE_URL is required for split audit.");
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
          legacyLines,
          legacyInventoryEvidence,
          targetProjectMaps,
          targetLineMaps,
          generatedOrders,
          generatedLines,
        ] = await Promise.all([
          loadLegacyProjects(legacyConnection),
          loadLegacyLines(legacyConnection),
          loadLegacyInventoryEvidence(legacyConnection),
          loadTargetProjectMaps(connection),
          loadTargetLineMaps(connection),
          loadGeneratedOrders(connection),
          loadGeneratedLines(connection),
        ]);

        const audit = auditRows({
          legacyProjects,
          legacyLines,
          legacyInventoryEvidence,
          targetProjectMaps,
          targetLineMaps,
          generatedOrders,
          generatedLines,
        });
        const summary = {
          legacyProjectCount: legacyProjects.length,
          legacyLineCount: legacyLines.length,
          targetProjectMapCount: targetProjectMaps.length,
          targetLineMapCount: targetLineMaps.length,
          existingGeneratedOrderCount: generatedOrders.length,
          existingGeneratedLineCount: generatedLines.length,
          lineClassificationCounts: audit.lineClassificationCounts,
          projectDispositionCounts: audit.projectDispositionCounts,
          acceptedCoveredByYsProjectLineCount: audit.projects.reduce(
            (sum, project) => sum + project.acceptedCoveredByYsProjectLineCount,
            0,
          ),
          overgeneratedYsProjectLineCount:
            audit.remainingOvergeneratedYsProjectLineCount,
        };
        const blockers = buildBlockers({
          summary,
          nonBackfillGeneratedOrders: audit.nonBackfillGeneratedOrders,
        });
        const report = {
          mode: "audit",
          targetDatabaseName,
          legacyDatabaseName,
          generatedAt: new Date().toISOString(),
          generatedDocumentPrefix: GENERATED_DOCUMENT_PREFIX,
          generatedBy: GENERATED_BY,
          expectedBaseline: EXPECTED_BASELINE,
          eligibleForRecoveryDesign: blockers.length === 0,
          blockers,
          summary,
          projects: audit.projects,
          lines: audit.lines,
        };

        writeStableReport(reportPath, report);
        console.log(
          `Sales-project legacy admission split audit completed. blockers=${blockers.length}, arrivalAccepted=${summary.lineClassificationCounts["arrival-accepted-inbound"]}, historicalProjectDirectInbound=${summary.lineClassificationCounts["historical-project-direct-inbound"]}, existingInventorySelection=${summary.lineClassificationCounts["existing-inventory-selection"]}, pendingSelection=${summary.lineClassificationCounts["pending-selection-candidate"]}, overgenerated=${summary.overgeneratedYsProjectLineCount}, report=${reportPath}`,
        );
      });
    });
  } finally {
    await closePools(pool, legacyPool);
  }
}

void main();
