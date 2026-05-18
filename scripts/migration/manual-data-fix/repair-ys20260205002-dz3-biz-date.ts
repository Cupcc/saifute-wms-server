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

const STOCK_IN_DOCUMENT_NO = "YS20260205002";
const STOCK_IN_LINE_ID = 266;
const PICK_DOCUMENT_NO = "LL20260202001";
const PICK_LINE_ID = 226;
const MATERIAL_CODE = "dz3";
const EXPECTED_QUANTITY = "500.000000";
const CONFIRMED_UNIT_COST = "28.00";
const CONFIRMED_AMOUNT = "14000.00";
const WRONG_AVERAGE_UNIT_COST = "28.06";
const WRONG_AVERAGE_AMOUNT = "14030.00";
const OLD_STOCK_IN_BIZ_DATE = "2026-02-05";
const CONFIRMED_STOCK_IN_BIZ_DATE = "2026-02-02";
const UPDATED_BY = "manual-repair-ys20260205002-dz3-biz-date-20260517";
const DRY_RUN_REPORT_FILE_NAME =
  "repair-ys20260205002-dz3-biz-date-dry-run-report.json";
const EXECUTE_REPORT_FILE_NAME =
  "repair-ys20260205002-dz3-biz-date-execute-report.json";

interface StockInContext {
  orderId: number;
  documentNo: string;
  orderBizDate: string;
  orderType: string;
  lifecycleStatus: string;
  inventoryEffectStatus: string;
  lineId: number;
  materialId: number;
  materialCode: string;
  quantity: string;
  unitPrice: string;
  amount: string;
  inLogId: number;
  logBizDate: string;
  logBeforeQty: string;
  logAfterQty: string;
  logUnitCost: string | null;
  logCostAmount: string | null;
}

interface PickContext {
  orderId: number;
  documentNo: string;
  orderBizDate: string;
  orderTotalAmount: string;
  lineId: number;
  materialId: number;
  materialCode: string;
  quantity: string;
  unitPrice: string;
  amount: string;
  costUnitPrice: string | null;
  costAmount: string | null;
  outLogId: number;
  outLogBeforeQty: string;
  outLogAfterQty: string;
  outLogUnitCost: string | null;
  outLogCostAmount: string | null;
}

interface SourceUsageContext {
  usageId: number;
  sourceLogId: number;
  consumerLineId: number;
  allocatedQty: string;
  releasedQty: string;
  netQty: string;
  status: string;
  sourceDocumentNo: string;
  sourceUnitCost: string | null;
}

interface LayerRow {
  unitCost: string;
  sourceQty: string;
  netUsedQty: string;
  availableQty: string;
}

interface TimelineRow {
  logId: number;
  bizDate: string;
  documentNo: string;
  direction: string;
  operationType: string;
  changeQty: string;
  beforeQty: string;
  afterQty: string;
  unitCost: string | null;
  costAmount: string | null;
}

function decimalEq(left: string | null, right: string): boolean {
  return Number(left ?? Number.NaN).toFixed(2) === Number(right).toFixed(2);
}

function qtyEq(left: string | number | null, right: string): boolean {
  return Number(left ?? Number.NaN).toFixed(6) === Number(right).toFixed(6);
}

function dateIsAllowed(value: string, allowedValues: readonly string[]) {
  return allowedValues.includes(value);
}

async function readStockInContext(
  connection: MigrationConnectionLike,
): Promise<StockInContext | null> {
  const rows = await connection.query<StockInContext[]>(
    `
      SELECT
        o.id AS orderId,
        o.document_no AS documentNo,
        DATE_FORMAT(o.biz_date, '%Y-%m-%d') AS orderBizDate,
        o.order_type AS orderType,
        o.lifecycle_status AS lifecycleStatus,
        o.inventory_effect_status AS inventoryEffectStatus,
        l.id AS lineId,
        l.material_id AS materialId,
        l.material_code_snapshot AS materialCode,
        l.quantity,
        l.unit_price AS unitPrice,
        l.amount,
        log.id AS inLogId,
        DATE_FORMAT(log.biz_date, '%Y-%m-%d') AS logBizDate,
        log.before_qty AS logBeforeQty,
        log.after_qty AS logAfterQty,
        log.unit_cost AS logUnitCost,
        log.cost_amount AS logCostAmount
      FROM stock_in_order o
      JOIN stock_in_order_line l ON l.order_id = o.id
      JOIN inventory_log log
        ON log.business_document_type = 'StockInOrder'
       AND log.business_document_id = o.id
       AND log.business_document_line_id = l.id
       AND log.direction = 'IN'
       AND log.operation_type = 'ACCEPTANCE_IN'
       AND log.reversal_of_log_id IS NULL
      WHERE o.document_no = ?
        AND l.id = ?
        AND l.material_code_snapshot = ?
      ORDER BY log.id
    `,
    [STOCK_IN_DOCUMENT_NO, STOCK_IN_LINE_ID, MATERIAL_CODE],
  );

  return rows[0] ?? null;
}

async function readPickContext(
  connection: MigrationConnectionLike,
): Promise<PickContext | null> {
  const rows = await connection.query<PickContext[]>(
    `
      SELECT
        o.id AS orderId,
        o.document_no AS documentNo,
        DATE_FORMAT(o.biz_date, '%Y-%m-%d') AS orderBizDate,
        o.total_amount AS orderTotalAmount,
        l.id AS lineId,
        l.material_id AS materialId,
        l.material_code_snapshot AS materialCode,
        l.quantity,
        l.unit_price AS unitPrice,
        l.amount,
        l.cost_unit_price AS costUnitPrice,
        l.cost_amount AS costAmount,
        log.id AS outLogId,
        log.before_qty AS outLogBeforeQty,
        log.after_qty AS outLogAfterQty,
        log.unit_cost AS outLogUnitCost,
        log.cost_amount AS outLogCostAmount
      FROM workshop_material_order o
      JOIN workshop_material_order_line l ON l.order_id = o.id
      JOIN inventory_log log
        ON log.business_document_type = 'WorkshopMaterialOrder'
       AND log.business_document_id = o.id
       AND log.business_document_line_id = l.id
       AND log.direction = 'OUT'
       AND log.operation_type = 'PICK_OUT'
       AND log.reversal_of_log_id IS NULL
      WHERE o.document_no = ?
        AND l.id = ?
        AND l.material_code_snapshot = ?
      ORDER BY log.id
    `,
    [PICK_DOCUMENT_NO, PICK_LINE_ID, MATERIAL_CODE],
  );

  return rows[0] ?? null;
}

async function readSourceUsageContext(
  connection: MigrationConnectionLike,
): Promise<SourceUsageContext[]> {
  return connection.query<SourceUsageContext[]>(
    `
      SELECT
        u.id AS usageId,
        u.source_log_id AS sourceLogId,
        u.consumer_line_id AS consumerLineId,
        u.allocated_qty AS allocatedQty,
        u.released_qty AS releasedQty,
        u.allocated_qty - u.released_qty AS netQty,
        u.status,
        source_log.business_document_number AS sourceDocumentNo,
        source_log.unit_cost AS sourceUnitCost
      FROM inventory_source_usage u
      JOIN inventory_log source_log ON source_log.id = u.source_log_id
      WHERE u.consumer_document_type = 'WorkshopMaterialOrder'
        AND u.consumer_line_id = ?
      ORDER BY u.id
    `,
    [PICK_LINE_ID],
  );
}

async function readLayerRows(
  connection: MigrationConnectionLike,
): Promise<LayerRow[]> {
  return connection.query<LayerRow[]>(
    `
      SELECT
        source_log.unit_cost AS unitCost,
        SUM(source_log.change_qty) AS sourceQty,
        SUM(COALESCE(usage_totals.net_used_qty, 0)) AS netUsedQty,
        SUM(source_log.change_qty - COALESCE(usage_totals.net_used_qty, 0)) AS availableQty
      FROM inventory_log source_log
      LEFT JOIN (
        SELECT source_log_id, SUM(allocated_qty - released_qty) AS net_used_qty
        FROM inventory_source_usage
        GROUP BY source_log_id
      ) usage_totals ON usage_totals.source_log_id = source_log.id
      WHERE source_log.material_id = ?
        AND source_log.stock_scope_id = 1
        AND source_log.direction = 'IN'
        AND source_log.unit_cost IS NOT NULL
        AND source_log.reversal_of_log_id IS NULL
        AND NOT EXISTS (
          SELECT 1 FROM inventory_log rev WHERE rev.reversal_of_log_id = source_log.id
        )
      GROUP BY source_log.unit_cost
      ORDER BY source_log.unit_cost
    `,
    [133],
  );
}

async function readTimeline(
  connection: MigrationConnectionLike,
): Promise<TimelineRow[]> {
  return connection.query<TimelineRow[]>(
    `
      SELECT
        id AS logId,
        DATE_FORMAT(biz_date, '%Y-%m-%d') AS bizDate,
        business_document_number AS documentNo,
        direction,
        operation_type AS operationType,
        change_qty AS changeQty,
        before_qty AS beforeQty,
        after_qty AS afterQty,
        unit_cost AS unitCost,
        cost_amount AS costAmount
      FROM inventory_log
      WHERE material_id = 133
        AND stock_scope_id = 1
        AND unit_cost IS NOT NULL
        AND reversal_of_log_id IS NULL
        AND NOT EXISTS (
          SELECT 1 FROM inventory_log rev WHERE rev.reversal_of_log_id = inventory_log.id
        )
      ORDER BY biz_date ASC, direction ASC, id ASC
    `,
  );
}

function validateContext(params: {
  stockIn: StockInContext | null;
  pick: PickContext | null;
  sourceUsages: readonly SourceUsageContext[];
}) {
  const blockers: string[] = [];
  const { stockIn, pick, sourceUsages } = params;

  if (!stockIn) {
    blockers.push("未找到目标验收单、明细或有效入库流水。");
  } else {
    if (
      !dateIsAllowed(stockIn.orderBizDate, [
        OLD_STOCK_IN_BIZ_DATE,
        CONFIRMED_STOCK_IN_BIZ_DATE,
      ])
    ) {
      blockers.push(`验收单业务日期不是可修复值: ${stockIn.orderBizDate}`);
    }
    if (
      !dateIsAllowed(stockIn.logBizDate, [
        OLD_STOCK_IN_BIZ_DATE,
        CONFIRMED_STOCK_IN_BIZ_DATE,
      ])
    ) {
      blockers.push(`验收入库流水业务日期不是可修复值: ${stockIn.logBizDate}`);
    }
    if (!qtyEq(stockIn.quantity, EXPECTED_QUANTITY)) {
      blockers.push(
        `验收明细数量不是 ${EXPECTED_QUANTITY}: ${stockIn.quantity}`,
      );
    }
    if (!decimalEq(stockIn.unitPrice, CONFIRMED_UNIT_COST)) {
      blockers.push(
        `验收明细单价不是 ${CONFIRMED_UNIT_COST}: ${stockIn.unitPrice}`,
      );
    }
    if (!decimalEq(stockIn.amount, CONFIRMED_AMOUNT)) {
      blockers.push(`验收明细金额不是 ${CONFIRMED_AMOUNT}: ${stockIn.amount}`);
    }
    if (!decimalEq(stockIn.logUnitCost, CONFIRMED_UNIT_COST)) {
      blockers.push(
        `验收入库流水单价不是 ${CONFIRMED_UNIT_COST}: ${stockIn.logUnitCost ?? "null"}`,
      );
    }
    if (!decimalEq(stockIn.logCostAmount, CONFIRMED_AMOUNT)) {
      blockers.push(
        `验收入库流水金额不是 ${CONFIRMED_AMOUNT}: ${stockIn.logCostAmount ?? "null"}`,
      );
    }
  }

  if (!pick) {
    blockers.push("未找到目标车间领料单、明细或有效出库流水。");
  } else {
    if (!qtyEq(pick.quantity, EXPECTED_QUANTITY)) {
      blockers.push(`领料明细数量不是 ${EXPECTED_QUANTITY}: ${pick.quantity}`);
    }
    if (
      !decimalEq(pick.unitPrice, WRONG_AVERAGE_UNIT_COST) &&
      !decimalEq(pick.unitPrice, CONFIRMED_UNIT_COST)
    ) {
      blockers.push(
        `领料明细单价既不是旧平均价 ${WRONG_AVERAGE_UNIT_COST}，也不是确认价 ${CONFIRMED_UNIT_COST}: ${pick.unitPrice}`,
      );
    }
    if (
      !decimalEq(pick.amount, WRONG_AVERAGE_AMOUNT) &&
      !decimalEq(pick.amount, CONFIRMED_AMOUNT)
    ) {
      blockers.push(
        `领料明细金额既不是旧金额 ${WRONG_AVERAGE_AMOUNT}，也不是确认金额 ${CONFIRMED_AMOUNT}: ${pick.amount}`,
      );
    }
    if (!decimalEq(pick.outLogUnitCost, CONFIRMED_UNIT_COST)) {
      blockers.push(
        `领料出库流水单价不是 ${CONFIRMED_UNIT_COST}: ${pick.outLogUnitCost ?? "null"}`,
      );
    }
    if (!decimalEq(pick.outLogCostAmount, CONFIRMED_AMOUNT)) {
      blockers.push(
        `领料出库流水金额不是 ${CONFIRMED_AMOUNT}: ${pick.outLogCostAmount ?? "null"}`,
      );
    }
  }

  if (stockIn && pick) {
    const targetUsage = sourceUsages.find(
      (usage) =>
        usage.sourceLogId === stockIn.inLogId &&
        usage.consumerLineId === pick.lineId,
    );
    if (!targetUsage) {
      blockers.push(
        `领料行没有绑定到 ${STOCK_IN_DOCUMENT_NO} 的入库流水: sourceLogId=${stockIn.inLogId}`,
      );
    } else {
      if (!qtyEq(targetUsage.allocatedQty, EXPECTED_QUANTITY)) {
        blockers.push(
          `来源占用原始分配数量不是 ${EXPECTED_QUANTITY}: ${targetUsage.allocatedQty}`,
        );
      }
      if (!qtyEq(targetUsage.releasedQty, "170.000000")) {
        blockers.push(
          `来源占用释放数量不是 170.000000: ${targetUsage.releasedQty}`,
        );
      }
      if (!decimalEq(targetUsage.sourceUnitCost, CONFIRMED_UNIT_COST)) {
        blockers.push(
          `来源占用成本价不是 ${CONFIRMED_UNIT_COST}: ${targetUsage.sourceUnitCost ?? "null"}`,
        );
      }
    }
  }

  return blockers;
}

async function executeRepair(
  connection: MigrationConnectionLike,
  stockIn: StockInContext,
  pick: PickContext,
) {
  await connection.beginTransaction();

  try {
    await connection.query(
      `
        UPDATE stock_in_order
        SET
          biz_date = ?,
          updated_by = ?,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `,
      [CONFIRMED_STOCK_IN_BIZ_DATE, UPDATED_BY, stockIn.orderId],
    );

    await connection.query(
      `
        UPDATE inventory_log
        SET
          biz_date = ?,
          before_qty = 0,
          after_qty = ?,
          note = ?,
          operator_id = COALESCE(operator_id, ?)
        WHERE id = ?
      `,
      [
        CONFIRMED_STOCK_IN_BIZ_DATE,
        EXPECTED_QUANTITY,
        `人工修复：${STOCK_IN_DOCUMENT_NO} 业务日期由 ${OLD_STOCK_IN_BIZ_DATE} 更正为 ${CONFIRMED_STOCK_IN_BIZ_DATE}；该 500 @ 28.00 来源应早于 ${PICK_DOCUMENT_NO}。`,
        UPDATED_BY,
        stockIn.inLogId,
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
      `,
      [
        CONFIRMED_UNIT_COST,
        CONFIRMED_AMOUNT,
        CONFIRMED_UNIT_COST,
        CONFIRMED_AMOUNT,
        UPDATED_BY,
        pick.lineId,
      ],
    );

    await connection.query(
      `
        UPDATE workshop_material_order
        SET
          total_qty = (
            SELECT COALESCE(SUM(line.quantity), 0)
            FROM workshop_material_order_line line
            WHERE line.order_id = ?
          ),
          total_amount = (
            SELECT COALESCE(SUM(line.amount), 0)
            FROM workshop_material_order_line line
            WHERE line.order_id = ?
          ),
          updated_by = ?,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `,
      [pick.orderId, pick.orderId, UPDATED_BY, pick.orderId],
    );

    await connection.query(
      `
        UPDATE inventory_log
        SET
          before_qty = ?,
          after_qty = 0,
          unit_cost = ?,
          cost_amount = ?,
          note = ?
        WHERE id = ?
      `,
      [
        EXPECTED_QUANTITY,
        CONFIRMED_UNIT_COST,
        CONFIRMED_AMOUNT,
        `人工修复：仓库确认 ${PICK_DOCUMENT_NO} 实际为 ${EXPECTED_QUANTITY} 台 ${MATERIAL_CODE}，成本价 ${CONFIRMED_UNIT_COST}，不是旧库平均价 ${WRONG_AVERAGE_UNIT_COST}；来源为 ${STOCK_IN_DOCUMENT_NO}。`,
        pick.outLogId,
      ],
    );

    await connection.commit();

    return {
      updatedStockInOrderId: stockIn.orderId,
      updatedStockInLogId: stockIn.inLogId,
      updatedPickOrderId: pick.orderId,
      updatedPickLineId: pick.lineId,
      updatedPickLogId: pick.outLogId,
    };
  } catch (error) {
    await connection.rollback();
    throw error;
  }
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
      const before = {
        stockIn: await readStockInContext(connection),
        pick: await readPickContext(connection),
        sourceUsages: await readSourceUsageContext(connection),
        layers: await readLayerRows(connection),
        timeline: await readTimeline(connection),
      };
      const blockers = validateContext({
        stockIn: before.stockIn,
        pick: before.pick,
        sourceUsages: before.sourceUsages,
      });

      if (execute && blockers.length > 0) {
        throw new Error(`Refusing to execute: ${blockers.join("; ")}`);
      }

      const executeResult =
        execute && before.stockIn && before.pick
          ? await executeRepair(connection, before.stockIn, before.pick)
          : null;

      const after = execute
        ? {
            stockIn: await readStockInContext(connection),
            pick: await readPickContext(connection),
            sourceUsages: await readSourceUsageContext(connection),
            layers: await readLayerRows(connection),
            timeline: await readTimeline(connection),
          }
        : null;

      const report = {
        generatedAt: new Date().toISOString(),
        mode: execute ? "execute" : "dry-run",
        targetDatabase,
        updatedBy: UPDATED_BY,
        confirmedBusinessFact:
          "YS20260205002 业务日期应为 2026-02-02，早于 LL20260202001；LL20260202001 实际出库为 dz3 500 台 × 28.00，不包含 29.00 价格层。",
        expected: {
          stockInDocumentNo: STOCK_IN_DOCUMENT_NO,
          stockInLineId: STOCK_IN_LINE_ID,
          pickDocumentNo: PICK_DOCUMENT_NO,
          pickLineId: PICK_LINE_ID,
          materialCode: MATERIAL_CODE,
          quantity: EXPECTED_QUANTITY,
          unitCost: CONFIRMED_UNIT_COST,
          amount: CONFIRMED_AMOUNT,
          oldStockInBizDate: OLD_STOCK_IN_BIZ_DATE,
          confirmedStockInBizDate: CONFIRMED_STOCK_IN_BIZ_DATE,
        },
        blockers,
        before,
        executeResult,
        after,
      };

      writeStableReport(reportPath, report);
      console.log(
        `Repair ${STOCK_IN_DOCUMENT_NO}/${PICK_DOCUMENT_NO}/${MATERIAL_CODE} ${execute ? "execute" : "dry-run"} completed. blockers=${blockers.length}, report=${reportPath}`,
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
