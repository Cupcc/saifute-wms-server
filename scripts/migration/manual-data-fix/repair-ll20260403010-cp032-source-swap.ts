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

const MATERIAL_CODE = "cp032";
const MATERIAL_ID = 277;
const QUANTITY = "5.000000";
const SALES_OUTBOUND_DOCUMENT_NO = "CK20260403001";
const SALES_OUTBOUND_LINE_ID = 450;
const SALES_OUTBOUND_OUT_LOG_ID = 38914;
const SALES_OUTBOUND_USAGE_ID = 19303;
const LEGACY_SALES_RETURN_DOCUMENT_NO = "TH20260403001";
const TARGET_SALES_RETURN_DOCUMENT_NO = "XT20260403001";
const SALES_RETURN_LINE_ID = 670;
const SALES_RETURN_SOURCE_LOG_ID = 38878;
const SALES_RETURN_UNIT_COST = "126.00";
const SALES_RETURN_COST_AMOUNT = "630.00";
const STOCK_IN_DOCUMENT_NO = "RK20260403005";
const STOCK_IN_LINE_ID = 1843;
const STOCK_IN_SOURCE_LOG_ID = 38892;
const STOCK_IN_UNIT_COST = "132.00";
const STOCK_IN_COST_AMOUNT = "660.00";
const WORKSHOP_DOCUMENT_NO = "LL20260403010";
const WORKSHOP_LINE_ID = 1665;
const WORKSHOP_OUT_LOG_ID = 38931;
const WORKSHOP_USAGE_ID = 21509;
const UPDATED_BY = "manual-repair-ll20260403010-cp032-source-swap-20260518";
const DRY_RUN_REPORT_FILE_NAME =
  "repair-ll20260403010-cp032-source-swap-dry-run-report.json";
const EXECUTE_REPORT_FILE_NAME =
  "repair-ll20260403010-cp032-source-swap-execute-report.json";

interface LineContext {
  contextName: "sales-outbound" | "sales-return" | "workshop-pick";
  orderId: number;
  documentNo: string;
  orderType: string;
  bizDate: string;
  lifecycleStatus: string;
  inventoryEffectStatus: string;
  orderTotalQty: string;
  orderTotalAmount: string;
  lineId: number;
  lineNo: number;
  materialId: number;
  materialCode: string;
  materialName: string;
  quantity: string;
  unitPrice: string;
  amount: string;
  selectedUnitCost: string | null;
  costUnitPrice: string | null;
  costAmount: string | null;
  outLogId: number | null;
  outLogUnitCost: string | null;
  outLogCostAmount: string | null;
}

interface SourceLogContext {
  sourceLogId: number;
  documentType: string;
  documentNo: string;
  lineId: number;
  bizDate: string;
  materialId: number;
  changeQty: string;
  unitCost: string | null;
  costAmount: string | null;
}

interface UsageContext {
  usageId: number;
  materialId: number;
  sourceLogId: number;
  consumerDocumentType: string;
  consumerDocumentId: number;
  consumerLineId: number;
  allocatedQty: string;
  releasedQty: string;
  netQty: string;
  status: string;
  sourceDocumentNo: string;
  sourceUnitCost: string | null;
  consumerDocumentNo: string | null;
  consumerOutLogId: number | null;
  consumerOutUnitCost: string | null;
  consumerOutCostAmount: string | null;
}

interface PriceLayerSummary {
  unitCost: string;
  sourceLogCount: number;
  totalSourceQty: string;
  netAllocatedQty: string;
  availableQty: string;
  sourceLogs: string | null;
}

type RepairState = "before-repair" | "already-fixed" | "inconsistent";

function decimalEq(left: string | number | null, right: string): boolean {
  return Number(left ?? Number.NaN).toFixed(2) === Number(right).toFixed(2);
}

function qtyEq(left: string | number | null, right: string): boolean {
  return Number(left ?? Number.NaN).toFixed(6) === Number(right).toFixed(6);
}

function byLine(lines: readonly LineContext[], lineId: number) {
  return lines.find((line) => line.lineId === lineId) ?? null;
}

function bySourceLog(
  sources: readonly SourceLogContext[],
  sourceLogId: number,
) {
  return sources.find((source) => source.sourceLogId === sourceLogId) ?? null;
}

function activeUsagesForLine(
  usages: readonly UsageContext[],
  consumerLineId: number,
) {
  return usages.filter(
    (usage) =>
      usage.consumerLineId === consumerLineId && Number(usage.netQty) > 0,
  );
}

async function readLineContexts(
  connection: MigrationConnectionLike,
): Promise<LineContext[]> {
  return connection.query<LineContext[]>(
    `
      SELECT
        'sales-outbound' AS contextName,
        o.id AS orderId,
        o.document_no AS documentNo,
        o.order_type AS orderType,
        DATE_FORMAT(o.biz_date, '%Y-%m-%d') AS bizDate,
        o.lifecycle_status AS lifecycleStatus,
        o.inventory_effect_status AS inventoryEffectStatus,
        o.total_qty AS orderTotalQty,
        o.total_amount AS orderTotalAmount,
        l.id AS lineId,
        l.line_no AS lineNo,
        l.material_id AS materialId,
        l.material_code_snapshot AS materialCode,
        l.material_name_snapshot AS materialName,
        l.quantity,
        l.unit_price AS unitPrice,
        l.amount,
        l.selected_unit_cost AS selectedUnitCost,
        l.cost_unit_price AS costUnitPrice,
        l.cost_amount AS costAmount,
        log.id AS outLogId,
        log.unit_cost AS outLogUnitCost,
        log.cost_amount AS outLogCostAmount
      FROM sales_stock_order o
      JOIN sales_stock_order_line l ON l.order_id = o.id
      LEFT JOIN inventory_log log
        ON log.business_document_type = 'SalesStockOrder'
       AND log.business_document_id = o.id
       AND log.business_document_line_id = l.id
       AND log.direction = 'OUT'
       AND log.operation_type = 'OUTBOUND_OUT'
       AND NOT EXISTS (
         SELECT 1 FROM inventory_log rev WHERE rev.reversal_of_log_id = log.id
       )
      WHERE o.document_no = ?
        AND l.id = ?

      UNION ALL

      SELECT
        'sales-return' AS contextName,
        o.id AS orderId,
        o.document_no AS documentNo,
        o.order_type AS orderType,
        DATE_FORMAT(o.biz_date, '%Y-%m-%d') AS bizDate,
        o.lifecycle_status AS lifecycleStatus,
        o.inventory_effect_status AS inventoryEffectStatus,
        o.total_qty AS orderTotalQty,
        o.total_amount AS orderTotalAmount,
        l.id AS lineId,
        l.line_no AS lineNo,
        l.material_id AS materialId,
        l.material_code_snapshot AS materialCode,
        l.material_name_snapshot AS materialName,
        l.quantity,
        l.unit_price AS unitPrice,
        l.amount,
        l.selected_unit_cost AS selectedUnitCost,
        l.cost_unit_price AS costUnitPrice,
        l.cost_amount AS costAmount,
        log.id AS outLogId,
        log.unit_cost AS outLogUnitCost,
        log.cost_amount AS outLogCostAmount
      FROM sales_stock_order o
      JOIN sales_stock_order_line l ON l.order_id = o.id
      LEFT JOIN inventory_log log
        ON log.business_document_type = 'SalesStockOrder'
       AND log.business_document_id = o.id
       AND log.business_document_line_id = l.id
       AND log.direction = 'IN'
       AND log.operation_type = 'SALES_RETURN_IN'
       AND NOT EXISTS (
         SELECT 1 FROM inventory_log rev WHERE rev.reversal_of_log_id = log.id
       )
      WHERE o.document_no = ?
        AND l.id = ?

      UNION ALL

      SELECT
        'workshop-pick' AS contextName,
        o.id AS orderId,
        o.document_no AS documentNo,
        o.order_type AS orderType,
        DATE_FORMAT(o.biz_date, '%Y-%m-%d') AS bizDate,
        o.lifecycle_status AS lifecycleStatus,
        o.inventory_effect_status AS inventoryEffectStatus,
        o.total_qty AS orderTotalQty,
        o.total_amount AS orderTotalAmount,
        l.id AS lineId,
        l.line_no AS lineNo,
        l.material_id AS materialId,
        l.material_code_snapshot AS materialCode,
        l.material_name_snapshot AS materialName,
        l.quantity,
        l.unit_price AS unitPrice,
        l.amount,
        NULL AS selectedUnitCost,
        l.cost_unit_price AS costUnitPrice,
        l.cost_amount AS costAmount,
        log.id AS outLogId,
        log.unit_cost AS outLogUnitCost,
        log.cost_amount AS outLogCostAmount
      FROM workshop_material_order o
      JOIN workshop_material_order_line l ON l.order_id = o.id
      LEFT JOIN inventory_log log
        ON log.business_document_type = 'WorkshopMaterialOrder'
       AND log.business_document_id = o.id
       AND log.business_document_line_id = l.id
       AND log.direction = 'OUT'
       AND log.operation_type = 'PICK_OUT'
       AND NOT EXISTS (
         SELECT 1 FROM inventory_log rev WHERE rev.reversal_of_log_id = log.id
       )
      WHERE o.document_no = ?
        AND l.id = ?
      ORDER BY lineId
    `,
    [
      SALES_OUTBOUND_DOCUMENT_NO,
      SALES_OUTBOUND_LINE_ID,
      TARGET_SALES_RETURN_DOCUMENT_NO,
      SALES_RETURN_LINE_ID,
      WORKSHOP_DOCUMENT_NO,
      WORKSHOP_LINE_ID,
    ],
  );
}

async function readSourceLogs(
  connection: MigrationConnectionLike,
): Promise<SourceLogContext[]> {
  return connection.query<SourceLogContext[]>(
    `
      SELECT
        id AS sourceLogId,
        business_document_type AS documentType,
        business_document_number AS documentNo,
        business_document_line_id AS lineId,
        DATE_FORMAT(biz_date, '%Y-%m-%d') AS bizDate,
        material_id AS materialId,
        change_qty AS changeQty,
        unit_cost AS unitCost,
        cost_amount AS costAmount
      FROM inventory_log
      WHERE id IN (?, ?)
        AND direction = 'IN'
        AND reversal_of_log_id IS NULL
        AND NOT EXISTS (
          SELECT 1 FROM inventory_log rev WHERE rev.reversal_of_log_id = inventory_log.id
        )
      ORDER BY id
    `,
    [SALES_RETURN_SOURCE_LOG_ID, STOCK_IN_SOURCE_LOG_ID],
  );
}

async function readUsages(
  connection: MigrationConnectionLike,
): Promise<UsageContext[]> {
  return connection.query<UsageContext[]>(
    `
      SELECT
        u.id AS usageId,
        u.material_id AS materialId,
        u.source_log_id AS sourceLogId,
        u.consumer_document_type AS consumerDocumentType,
        u.consumer_document_id AS consumerDocumentId,
        u.consumer_line_id AS consumerLineId,
        u.allocated_qty AS allocatedQty,
        u.released_qty AS releasedQty,
        u.allocated_qty - u.released_qty AS netQty,
        u.status,
        source_log.business_document_number AS sourceDocumentNo,
        source_log.unit_cost AS sourceUnitCost,
        out_log.business_document_number AS consumerDocumentNo,
        out_log.id AS consumerOutLogId,
        out_log.unit_cost AS consumerOutUnitCost,
        out_log.cost_amount AS consumerOutCostAmount
      FROM inventory_source_usage u
      JOIN inventory_log source_log ON source_log.id = u.source_log_id
      LEFT JOIN inventory_log out_log
        ON out_log.business_document_type = u.consumer_document_type
       AND out_log.business_document_id = u.consumer_document_id
       AND out_log.business_document_line_id = u.consumer_line_id
       AND out_log.direction = 'OUT'
       AND NOT EXISTS (
         SELECT 1 FROM inventory_log rev WHERE rev.reversal_of_log_id = out_log.id
       )
      WHERE (
          u.consumer_document_type = 'SalesStockOrder'
          AND u.consumer_line_id = ?
        )
        OR (
          u.consumer_document_type = 'WorkshopMaterialOrder'
          AND u.consumer_line_id = ?
        )
      ORDER BY u.consumer_document_type, u.consumer_line_id, u.id
    `,
    [SALES_OUTBOUND_LINE_ID, WORKSHOP_LINE_ID],
  );
}

async function readPriceLayers(
  connection: MigrationConnectionLike,
): Promise<PriceLayerSummary[]> {
  return connection.query<PriceLayerSummary[]>(
    `
      SELECT
        source_log.unit_cost AS unitCost,
        COUNT(*) AS sourceLogCount,
        SUM(source_log.change_qty) AS totalSourceQty,
        COALESCE(SUM(usage_totals.net_used_qty), 0) AS netAllocatedQty,
        SUM(source_log.change_qty - COALESCE(usage_totals.net_used_qty, 0)) AS availableQty,
        GROUP_CONCAT(
          CONCAT(
            source_log.id,
            ':',
            source_log.business_document_number,
            ':used=',
            COALESCE(usage_totals.net_used_qty, 0),
            ':available=',
            source_log.change_qty - COALESCE(usage_totals.net_used_qty, 0)
          )
          ORDER BY source_log.biz_date, source_log.id
          SEPARATOR ' | '
        ) AS sourceLogs
      FROM inventory_log source_log
      LEFT JOIN (
        SELECT source_log_id, SUM(allocated_qty - released_qty) AS net_used_qty
        FROM inventory_source_usage
        GROUP BY source_log_id
      ) usage_totals ON usage_totals.source_log_id = source_log.id
      WHERE source_log.material_id = ?
        AND source_log.direction = 'IN'
        AND source_log.unit_cost IS NOT NULL
        AND source_log.reversal_of_log_id IS NULL
        AND NOT EXISTS (
          SELECT 1 FROM inventory_log rev WHERE rev.reversal_of_log_id = source_log.id
        )
      GROUP BY source_log.unit_cost
      ORDER BY source_log.unit_cost
    `,
    [MATERIAL_ID],
  );
}

function validateLineContext(lines: readonly LineContext[]): string[] {
  const blockers: string[] = [];
  const salesOutbound = byLine(lines, SALES_OUTBOUND_LINE_ID);
  const salesReturn = byLine(lines, SALES_RETURN_LINE_ID);
  const workshopPick = byLine(lines, WORKSHOP_LINE_ID);

  if (lines.length !== 3) {
    blockers.push(`目标业务行数量不是 3: actual=${lines.length}`);
  }

  const expectedLines = [
    {
      line: salesOutbound,
      contextName: "sales-outbound",
      documentNo: SALES_OUTBOUND_DOCUMENT_NO,
      orderType: "OUTBOUND",
      lineId: SALES_OUTBOUND_LINE_ID,
      quantity: QUANTITY,
      unitPrice: STOCK_IN_UNIT_COST,
      amount: STOCK_IN_COST_AMOUNT,
      outLogId: SALES_OUTBOUND_OUT_LOG_ID,
    },
    {
      line: salesReturn,
      contextName: "sales-return",
      documentNo: TARGET_SALES_RETURN_DOCUMENT_NO,
      orderType: "SALES_RETURN",
      lineId: SALES_RETURN_LINE_ID,
      quantity: QUANTITY,
      unitPrice: SALES_RETURN_UNIT_COST,
      amount: SALES_RETURN_COST_AMOUNT,
      outLogId: SALES_RETURN_SOURCE_LOG_ID,
    },
    {
      line: workshopPick,
      contextName: "workshop-pick",
      documentNo: WORKSHOP_DOCUMENT_NO,
      orderType: "PICK",
      lineId: WORKSHOP_LINE_ID,
      quantity: QUANTITY,
      unitPrice: SALES_RETURN_UNIT_COST,
      amount: SALES_RETURN_COST_AMOUNT,
      outLogId: WORKSHOP_OUT_LOG_ID,
    },
  ] as const;

  for (const expected of expectedLines) {
    if (!expected.line) {
      blockers.push(
        `未找到目标业务行: ${expected.documentNo}/${expected.lineId}`,
      );
      continue;
    }
    if (expected.line.contextName !== expected.contextName) {
      blockers.push(
        `${expected.documentNo}/${expected.lineId} 上下文不匹配: ${expected.line.contextName}`,
      );
    }
    if (expected.line.documentNo !== expected.documentNo) {
      blockers.push(
        `目标行单据号不匹配: expected=${expected.documentNo}, actual=${expected.line.documentNo}`,
      );
    }
    if (expected.line.orderType !== expected.orderType) {
      blockers.push(
        `${expected.documentNo}/${expected.lineId} 单据类型不是 ${expected.orderType}: ${expected.line.orderType}`,
      );
    }
    if (expected.line.lifecycleStatus !== "EFFECTIVE") {
      blockers.push(
        `${expected.documentNo}/${expected.lineId} lifecycle_status 不是 EFFECTIVE: ${expected.line.lifecycleStatus}`,
      );
    }
    if (expected.line.inventoryEffectStatus !== "POSTED") {
      blockers.push(
        `${expected.documentNo}/${expected.lineId} inventory_effect_status 不是 POSTED: ${expected.line.inventoryEffectStatus}`,
      );
    }
    if (expected.line.materialId !== MATERIAL_ID) {
      blockers.push(
        `${expected.documentNo}/${expected.lineId} material_id 不是 ${MATERIAL_ID}: ${expected.line.materialId}`,
      );
    }
    if (expected.line.materialCode !== MATERIAL_CODE) {
      blockers.push(
        `${expected.documentNo}/${expected.lineId} 物料编码不是 ${MATERIAL_CODE}: ${expected.line.materialCode}`,
      );
    }
    if (!qtyEq(expected.line.quantity, expected.quantity)) {
      blockers.push(
        `${expected.documentNo}/${expected.lineId} 数量不是 ${expected.quantity}: ${expected.line.quantity}`,
      );
    }
    if (!decimalEq(expected.line.unitPrice, expected.unitPrice)) {
      blockers.push(
        `${expected.documentNo}/${expected.lineId} 业务单价不是 ${expected.unitPrice}: ${expected.line.unitPrice}`,
      );
    }
    if (!decimalEq(expected.line.amount, expected.amount)) {
      blockers.push(
        `${expected.documentNo}/${expected.lineId} 业务金额不是 ${expected.amount}: ${expected.line.amount}`,
      );
    }
    if (expected.line.outLogId !== expected.outLogId) {
      blockers.push(
        `${expected.documentNo}/${expected.lineId} 库存流水 id 不是 ${expected.outLogId}: ${expected.line.outLogId ?? "null"}`,
      );
    }
  }

  return blockers;
}

function validateSourceLogs(sources: readonly SourceLogContext[]): string[] {
  const blockers: string[] = [];
  const salesReturnSource = bySourceLog(sources, SALES_RETURN_SOURCE_LOG_ID);
  const stockInSource = bySourceLog(sources, STOCK_IN_SOURCE_LOG_ID);

  const expectedSources = [
    {
      source: salesReturnSource,
      sourceLogId: SALES_RETURN_SOURCE_LOG_ID,
      documentNo: TARGET_SALES_RETURN_DOCUMENT_NO,
      lineId: SALES_RETURN_LINE_ID,
      unitCost: SALES_RETURN_UNIT_COST,
      costAmount: SALES_RETURN_COST_AMOUNT,
    },
    {
      source: stockInSource,
      sourceLogId: STOCK_IN_SOURCE_LOG_ID,
      documentNo: STOCK_IN_DOCUMENT_NO,
      lineId: STOCK_IN_LINE_ID,
      unitCost: STOCK_IN_UNIT_COST,
      costAmount: STOCK_IN_COST_AMOUNT,
    },
  ] as const;

  for (const expected of expectedSources) {
    if (!expected.source) {
      blockers.push(`未找到来源流水: ${expected.sourceLogId}`);
      continue;
    }
    if (expected.source.materialId !== MATERIAL_ID) {
      blockers.push(
        `来源流水 ${expected.sourceLogId} material_id 不是 ${MATERIAL_ID}: ${expected.source.materialId}`,
      );
    }
    if (expected.source.documentNo !== expected.documentNo) {
      blockers.push(
        `来源流水 ${expected.sourceLogId} 单据号不是 ${expected.documentNo}: ${expected.source.documentNo}`,
      );
    }
    if (expected.source.lineId !== expected.lineId) {
      blockers.push(
        `来源流水 ${expected.sourceLogId} 行 id 不是 ${expected.lineId}: ${expected.source.lineId}`,
      );
    }
    if (!qtyEq(expected.source.changeQty, QUANTITY)) {
      blockers.push(
        `来源流水 ${expected.sourceLogId} 数量不是 ${QUANTITY}: ${expected.source.changeQty}`,
      );
    }
    if (!decimalEq(expected.source.unitCost, expected.unitCost)) {
      blockers.push(
        `来源流水 ${expected.sourceLogId} 成本价不是 ${expected.unitCost}: ${expected.source.unitCost ?? "null"}`,
      );
    }
    if (!decimalEq(expected.source.costAmount, expected.costAmount)) {
      blockers.push(
        `来源流水 ${expected.sourceLogId} 成本金额不是 ${expected.costAmount}: ${expected.source.costAmount ?? "null"}`,
      );
    }
  }

  return blockers;
}

function validateUsageBasics(usages: readonly UsageContext[]): string[] {
  const blockers: string[] = [];
  const salesUsages = activeUsagesForLine(usages, SALES_OUTBOUND_LINE_ID);
  const workshopUsages = activeUsagesForLine(usages, WORKSHOP_LINE_ID);

  if (salesUsages.length !== 1) {
    blockers.push(
      `${SALES_OUTBOUND_DOCUMENT_NO}/${SALES_OUTBOUND_LINE_ID} 有效来源占用数量不是 1: actual=${salesUsages.length}`,
    );
  }
  if (workshopUsages.length !== 1) {
    blockers.push(
      `${WORKSHOP_DOCUMENT_NO}/${WORKSHOP_LINE_ID} 有效来源占用数量不是 1: actual=${workshopUsages.length}`,
    );
  }

  const expectedUsageIds = new Map([
    [SALES_OUTBOUND_LINE_ID, SALES_OUTBOUND_USAGE_ID],
    [WORKSHOP_LINE_ID, WORKSHOP_USAGE_ID],
  ]);

  for (const usage of [...salesUsages, ...workshopUsages]) {
    const expectedUsageId = expectedUsageIds.get(usage.consumerLineId);
    if (usage.usageId !== expectedUsageId) {
      blockers.push(
        `消费行 ${usage.consumerLineId} usageId 不是 ${expectedUsageId}: ${usage.usageId}`,
      );
    }
    if (usage.materialId !== MATERIAL_ID) {
      blockers.push(
        `usage ${usage.usageId} material_id 不是 ${MATERIAL_ID}: ${usage.materialId}`,
      );
    }
    if (!qtyEq(usage.allocatedQty, QUANTITY)) {
      blockers.push(
        `usage ${usage.usageId} allocated_qty 不是 ${QUANTITY}: ${usage.allocatedQty}`,
      );
    }
    if (!qtyEq(usage.releasedQty, "0.000000")) {
      blockers.push(
        `usage ${usage.usageId} released_qty 不是 0: ${usage.releasedQty}`,
      );
    }
    if (!qtyEq(usage.netQty, QUANTITY)) {
      blockers.push(
        `usage ${usage.usageId} 净占用不是 ${QUANTITY}: ${usage.netQty}`,
      );
    }
    if (usage.status !== "ALLOCATED") {
      blockers.push(
        `usage ${usage.usageId} 状态不是 ALLOCATED: ${usage.status}`,
      );
    }
  }

  const inactiveTargetUsages = usages.filter(
    (usage) =>
      (usage.consumerLineId === SALES_OUTBOUND_LINE_ID ||
        usage.consumerLineId === WORKSHOP_LINE_ID) &&
      Number(usage.netQty) <= 0,
  );
  if (inactiveTargetUsages.length > 0) {
    blockers.push(
      `目标消费行存在额外的非有效来源占用，拒绝自动交换: usageIds=${inactiveTargetUsages
        .map((usage) => usage.usageId)
        .join(",")}`,
    );
  }

  return blockers;
}

function classifyRepairState(
  lines: readonly LineContext[],
  usages: readonly UsageContext[],
): RepairState {
  const salesOutbound = byLine(lines, SALES_OUTBOUND_LINE_ID);
  const workshopPick = byLine(lines, WORKSHOP_LINE_ID);
  const salesUsage =
    activeUsagesForLine(usages, SALES_OUTBOUND_LINE_ID)[0] ?? null;
  const workshopUsage =
    activeUsagesForLine(usages, WORKSHOP_LINE_ID)[0] ?? null;

  if (!salesOutbound || !workshopPick || !salesUsage || !workshopUsage) {
    return "inconsistent";
  }

  const beforeRepair =
    salesUsage.sourceLogId === SALES_RETURN_SOURCE_LOG_ID &&
    workshopUsage.sourceLogId === STOCK_IN_SOURCE_LOG_ID &&
    decimalEq(salesOutbound.outLogUnitCost, SALES_RETURN_UNIT_COST) &&
    decimalEq(salesOutbound.outLogCostAmount, SALES_RETURN_COST_AMOUNT) &&
    decimalEq(workshopPick.outLogUnitCost, STOCK_IN_UNIT_COST) &&
    decimalEq(workshopPick.outLogCostAmount, STOCK_IN_COST_AMOUNT);

  if (beforeRepair) return "before-repair";

  const alreadyFixed =
    salesUsage.sourceLogId === STOCK_IN_SOURCE_LOG_ID &&
    workshopUsage.sourceLogId === SALES_RETURN_SOURCE_LOG_ID &&
    decimalEq(salesOutbound.outLogUnitCost, STOCK_IN_UNIT_COST) &&
    decimalEq(salesOutbound.outLogCostAmount, STOCK_IN_COST_AMOUNT) &&
    decimalEq(salesOutbound.selectedUnitCost, STOCK_IN_UNIT_COST) &&
    decimalEq(salesOutbound.costUnitPrice, STOCK_IN_UNIT_COST) &&
    decimalEq(salesOutbound.costAmount, STOCK_IN_COST_AMOUNT) &&
    decimalEq(workshopPick.outLogUnitCost, SALES_RETURN_UNIT_COST) &&
    decimalEq(workshopPick.outLogCostAmount, SALES_RETURN_COST_AMOUNT) &&
    decimalEq(workshopPick.costUnitPrice, SALES_RETURN_UNIT_COST) &&
    decimalEq(workshopPick.costAmount, SALES_RETURN_COST_AMOUNT);

  return alreadyFixed ? "already-fixed" : "inconsistent";
}

function buildBlockers(
  lines: readonly LineContext[],
  sources: readonly SourceLogContext[],
  usages: readonly UsageContext[],
  state: RepairState,
) {
  const blockers = [
    ...validateLineContext(lines),
    ...validateSourceLogs(sources),
    ...validateUsageBasics(usages),
  ];

  if (state === "inconsistent") {
    blockers.push(
      "当前来源占用 / 库存流水成本既不是待修复状态，也不是已修复状态。",
    );
  }

  return blockers;
}

async function executeRepair(connection: MigrationConnectionLike) {
  await connection.beginTransaction();

  try {
    await connection.query(
      `
        UPDATE inventory_source_usage
        SET
          source_log_id = ?,
          updated_by = ?,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
          AND consumer_document_type = 'SalesStockOrder'
          AND consumer_line_id = ?
          AND source_log_id = ?
          AND allocated_qty = ?
          AND released_qty = 0
          AND status = 'ALLOCATED'
      `,
      [
        STOCK_IN_SOURCE_LOG_ID,
        UPDATED_BY,
        SALES_OUTBOUND_USAGE_ID,
        SALES_OUTBOUND_LINE_ID,
        SALES_RETURN_SOURCE_LOG_ID,
        QUANTITY,
      ],
    );

    await connection.query(
      `
        UPDATE inventory_source_usage
        SET
          source_log_id = ?,
          updated_by = ?,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
          AND consumer_document_type = 'WorkshopMaterialOrder'
          AND consumer_line_id = ?
          AND source_log_id = ?
          AND allocated_qty = ?
          AND released_qty = 0
          AND status = 'ALLOCATED'
      `,
      [
        SALES_RETURN_SOURCE_LOG_ID,
        UPDATED_BY,
        WORKSHOP_USAGE_ID,
        WORKSHOP_LINE_ID,
        STOCK_IN_SOURCE_LOG_ID,
        QUANTITY,
      ],
    );

    await connection.query(
      `
        UPDATE inventory_log
        SET
          unit_cost = ?,
          cost_amount = ?,
          note = ?,
          operator_id = COALESCE(operator_id, ?)
        WHERE id = ?
          AND business_document_type = 'SalesStockOrder'
          AND business_document_number = ?
          AND business_document_line_id = ?
      `,
      [
        STOCK_IN_UNIT_COST,
        STOCK_IN_COST_AMOUNT,
        `人工修复：${MATERIAL_CODE} 出库成本来源从 ${TARGET_SALES_RETURN_DOCUMENT_NO}（旧库 ${LEGACY_SALES_RETURN_DOCUMENT_NO}）/${SALES_RETURN_UNIT_COST} 调整为 ${STOCK_IN_DOCUMENT_NO}/${STOCK_IN_UNIT_COST}，释放退货来源给 ${WORKSHOP_DOCUMENT_NO}。`,
        UPDATED_BY,
        SALES_OUTBOUND_OUT_LOG_ID,
        SALES_OUTBOUND_DOCUMENT_NO,
        SALES_OUTBOUND_LINE_ID,
      ],
    );

    await connection.query(
      `
        UPDATE inventory_log
        SET
          unit_cost = ?,
          cost_amount = ?,
          note = ?,
          operator_id = COALESCE(operator_id, ?)
        WHERE id = ?
          AND business_document_type = 'WorkshopMaterialOrder'
          AND business_document_number = ?
          AND business_document_line_id = ?
      `,
      [
        SALES_RETURN_UNIT_COST,
        SALES_RETURN_COST_AMOUNT,
        `人工修复：${MATERIAL_CODE} 车间领料按旧库 inventory_used 关系绑定 ${TARGET_SALES_RETURN_DOCUMENT_NO}（旧库 ${LEGACY_SALES_RETURN_DOCUMENT_NO}）/${SALES_RETURN_UNIT_COST} 来源。`,
        UPDATED_BY,
        WORKSHOP_OUT_LOG_ID,
        WORKSHOP_DOCUMENT_NO,
        WORKSHOP_LINE_ID,
      ],
    );

    await connection.query(
      `
        UPDATE sales_stock_order_line
        SET
          selected_unit_cost = ?,
          cost_unit_price = ?,
          cost_amount = ?,
          updated_by = ?,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
          AND material_id = ?
      `,
      [
        STOCK_IN_UNIT_COST,
        STOCK_IN_UNIT_COST,
        STOCK_IN_COST_AMOUNT,
        UPDATED_BY,
        SALES_OUTBOUND_LINE_ID,
        MATERIAL_ID,
      ],
    );

    await connection.query(
      `
        UPDATE sales_stock_order_line
        SET
          cost_unit_price = ?,
          cost_amount = ?,
          updated_by = ?,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
          AND material_id = ?
      `,
      [
        SALES_RETURN_UNIT_COST,
        SALES_RETURN_COST_AMOUNT,
        UPDATED_BY,
        SALES_RETURN_LINE_ID,
        MATERIAL_ID,
      ],
    );

    await connection.query(
      `
        UPDATE workshop_material_order_line
        SET
          unit_price = ?,
          amount = ?,
          cost_unit_price = ?,
          cost_amount = ?,
          updated_by = ?,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
          AND material_id = ?
      `,
      [
        SALES_RETURN_UNIT_COST,
        SALES_RETURN_COST_AMOUNT,
        SALES_RETURN_UNIT_COST,
        SALES_RETURN_COST_AMOUNT,
        UPDATED_BY,
        WORKSHOP_LINE_ID,
        MATERIAL_ID,
      ],
    );

    await connection.commit();

    return {
      swappedUsageIds: [SALES_OUTBOUND_USAGE_ID, WORKSHOP_USAGE_ID],
      updatedInventoryLogIds: [SALES_OUTBOUND_OUT_LOG_ID, WORKSHOP_OUT_LOG_ID],
      updatedSalesLineIds: [SALES_OUTBOUND_LINE_ID, SALES_RETURN_LINE_ID],
      updatedWorkshopLineIds: [WORKSHOP_LINE_ID],
    };
  } catch (error) {
    await connection.rollback();
    throw error;
  }
}

async function readSnapshot(connection: MigrationConnectionLike) {
  const [lines, sources, usages, priceLayers] = await Promise.all([
    readLineContexts(connection),
    readSourceLogs(connection),
    readUsages(connection),
    readPriceLayers(connection),
  ]);
  const state = classifyRepairState(lines, usages);

  return {
    lines,
    sources,
    usages,
    priceLayers,
    state,
    blockers: buildBlockers(lines, sources, usages, state),
  };
}

async function main() {
  const cliOptions = parseMigrationCliOptions();
  const execute = cliOptions.execute;
  const reportPath = resolveReportPath(
    cliOptions,
    execute ? EXECUTE_REPORT_FILE_NAME : DRY_RUN_REPORT_FILE_NAME,
  );
  const environment = loadMigrationEnvironment({
    requireLegacyDatabaseUrl: false,
  });
  const targetDatabase = assertExpectedDatabaseName(
    environment.databaseUrl,
    EXPECTED_TARGET_DATABASE_NAME,
    "target",
  );
  const pool = createMariaDbPool(environment.databaseUrl);

  try {
    await withPoolConnection(pool, async (connection) => {
      const before = await readSnapshot(connection);

      if (before.blockers.length > 0) {
        if (execute) {
          throw new Error(`Refusing to execute: ${before.blockers.join("; ")}`);
        }
      }

      const executeResult =
        execute && before.state === "before-repair"
          ? await executeRepair(connection)
          : null;
      const after = execute ? await readSnapshot(connection) : null;
      const report = {
        generatedAt: new Date().toISOString(),
        mode: execute ? "execute" : "dry-run",
        targetDatabase,
        materialCode: MATERIAL_CODE,
        materialId: MATERIAL_ID,
        businessCase:
          "Swap cp032 source usage so CK20260403001 consumes RK20260403005 at 132.00 and LL20260403010 consumes target XT20260403001 (legacy TH20260403001) at 126.00.",
        updatedBy: UPDATED_BY,
        plannedChanges: {
          sourceUsageSwap: [
            {
              usageId: SALES_OUTBOUND_USAGE_ID,
              consumerDocumentNo: SALES_OUTBOUND_DOCUMENT_NO,
              consumerLineId: SALES_OUTBOUND_LINE_ID,
              fromSourceLogId: SALES_RETURN_SOURCE_LOG_ID,
              toSourceLogId: STOCK_IN_SOURCE_LOG_ID,
            },
            {
              usageId: WORKSHOP_USAGE_ID,
              consumerDocumentNo: WORKSHOP_DOCUMENT_NO,
              consumerLineId: WORKSHOP_LINE_ID,
              fromSourceLogId: STOCK_IN_SOURCE_LOG_ID,
              toSourceLogId: SALES_RETURN_SOURCE_LOG_ID,
            },
          ],
          inventoryLogCosts: [
            {
              logId: SALES_OUTBOUND_OUT_LOG_ID,
              documentNo: SALES_OUTBOUND_DOCUMENT_NO,
              unitCost: STOCK_IN_UNIT_COST,
              costAmount: STOCK_IN_COST_AMOUNT,
            },
            {
              logId: WORKSHOP_OUT_LOG_ID,
              documentNo: WORKSHOP_DOCUMENT_NO,
              unitCost: SALES_RETURN_UNIT_COST,
              costAmount: SALES_RETURN_COST_AMOUNT,
            },
          ],
          lineCostSnapshots: [
            {
              table: "sales_stock_order_line",
              lineId: SALES_OUTBOUND_LINE_ID,
              selectedUnitCost: STOCK_IN_UNIT_COST,
              costUnitPrice: STOCK_IN_UNIT_COST,
              costAmount: STOCK_IN_COST_AMOUNT,
            },
            {
              table: "sales_stock_order_line",
              lineId: SALES_RETURN_LINE_ID,
              costUnitPrice: SALES_RETURN_UNIT_COST,
              costAmount: SALES_RETURN_COST_AMOUNT,
            },
            {
              table: "workshop_material_order_line",
              lineId: WORKSHOP_LINE_ID,
              unitPrice: SALES_RETURN_UNIT_COST,
              amount: SALES_RETURN_COST_AMOUNT,
              costUnitPrice: SALES_RETURN_UNIT_COST,
              costAmount: SALES_RETURN_COST_AMOUNT,
            },
          ],
        },
        before,
        executeResult,
        after,
      };

      writeStableReport(reportPath, report);
      console.log(
        `Repair ${WORKSHOP_DOCUMENT_NO}/${MATERIAL_CODE} ${execute ? "execute" : "dry-run"} completed. state=${before.state}. report=${reportPath}`,
      );
    });
  } finally {
    await closePools(pool);
  }
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
