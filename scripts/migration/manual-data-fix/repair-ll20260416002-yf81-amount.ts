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

const DOCUMENT_NO = "LL20260416002";
const LINE_ID = 1263;
const MATERIAL_CODE = "yf81";
const MATERIAL_NAME = "接头座";
const EXPECTED_QUANTITY = "100.000000";
const CONFIRMED_UNIT_COST = "4.87";
const CONFIRMED_AMOUNT = "487.00";
const WRONG_LINE_UNIT_PRICE = "5.75";
const WRONG_LINE_AMOUNT = "575.00";
const UPDATED_BY = "manual-repair-ll20260416002-yf81-amount-20260518";
const DRY_RUN_REPORT_FILE_NAME =
  "repair-ll20260416002-yf81-amount-dry-run-report.json";
const EXECUTE_REPORT_FILE_NAME =
  "repair-ll20260416002-yf81-amount-execute-report.json";

interface LineContext {
  orderId: number;
  documentNo: string;
  orderType: string;
  lineId: number;
  materialId: number;
  materialCode: string;
  materialName: string;
  quantity: string;
  lineUnitPrice: string;
  lineAmount: string;
  lineCostUnitPrice: string | null;
  lineCostAmount: string | null;
  orderTotalQty: string;
  orderTotalAmount: string;
  outLogId: number;
  outLogUnitCost: string | null;
  outLogCostAmount: string | null;
}

interface ActiveSourceUsage {
  usageId: number;
  sourceLogId: number;
  allocatedQty: string;
  releasedQty: string;
  netQty: string;
  sourceDocumentNo: string;
  sourceUnitCost: string | null;
  sourceCostAmount: string | null;
}

interface TotalsContext {
  lineCount: number;
  totalQty: string;
  totalAmount: string;
}

function decimalEq(left: string | number | null, right: string): boolean {
  return Number(left ?? Number.NaN).toFixed(2) === Number(right).toFixed(2);
}

function qtyEq(left: string | number | null, right: string): boolean {
  return Number(left ?? Number.NaN).toFixed(6) === Number(right).toFixed(6);
}

async function readLineContext(
  connection: MigrationConnectionLike,
): Promise<LineContext | null> {
  const rows = await connection.query<LineContext[]>(
    `
      SELECT
        o.id AS orderId,
        o.document_no AS documentNo,
        o.order_type AS orderType,
        l.id AS lineId,
        l.material_id AS materialId,
        l.material_code_snapshot AS materialCode,
        l.material_name_snapshot AS materialName,
        l.quantity,
        l.unit_price AS lineUnitPrice,
        l.amount AS lineAmount,
        l.cost_unit_price AS lineCostUnitPrice,
        l.cost_amount AS lineCostAmount,
        o.total_qty AS orderTotalQty,
        o.total_amount AS orderTotalAmount,
        log.id AS outLogId,
        log.unit_cost AS outLogUnitCost,
        log.cost_amount AS outLogCostAmount
      FROM workshop_material_order o
      JOIN workshop_material_order_line l ON l.order_id = o.id
      JOIN inventory_log log
        ON log.business_document_type = 'WorkshopMaterialOrder'
       AND log.business_document_id = o.id
       AND log.business_document_line_id = l.id
       AND log.operation_type = 'PICK_OUT'
       AND log.direction = 'OUT'
       AND NOT EXISTS (
         SELECT 1
         FROM inventory_log rev
         WHERE rev.reversal_of_log_id = log.id
       )
      WHERE o.document_no = ?
        AND l.id = ?
        AND l.material_code_snapshot = ?
      ORDER BY log.id
    `,
    [DOCUMENT_NO, LINE_ID, MATERIAL_CODE],
  );

  return rows[0] ?? null;
}

async function readActiveSourceUsages(
  connection: MigrationConnectionLike,
): Promise<ActiveSourceUsage[]> {
  return connection.query<ActiveSourceUsage[]>(
    `
      SELECT
        u.id AS usageId,
        u.source_log_id AS sourceLogId,
        u.allocated_qty AS allocatedQty,
        u.released_qty AS releasedQty,
        u.allocated_qty - u.released_qty AS netQty,
        source_log.business_document_number AS sourceDocumentNo,
        source_log.unit_cost AS sourceUnitCost,
        source_log.cost_amount AS sourceCostAmount
      FROM inventory_source_usage u
      JOIN inventory_log source_log ON source_log.id = u.source_log_id
      WHERE u.consumer_document_type = 'WorkshopMaterialOrder'
        AND u.consumer_line_id = ?
        AND u.allocated_qty > u.released_qty
      ORDER BY u.id
    `,
    [LINE_ID],
  );
}

async function readOrderTotals(
  connection: MigrationConnectionLike,
  orderId: number,
): Promise<TotalsContext> {
  const rows = await connection.query<TotalsContext[]>(
    `
      SELECT
        COUNT(*) AS lineCount,
        COALESCE(SUM(quantity), 0) AS totalQty,
        COALESCE(SUM(amount), 0) AS totalAmount
      FROM workshop_material_order_line
      WHERE order_id = ?
    `,
    [orderId],
  );

  return (
    rows[0] ?? {
      lineCount: 0,
      totalQty: "0.000000",
      totalAmount: "0.00",
    }
  );
}

function validateContext(
  context: LineContext | null,
  activeSourceUsages: readonly ActiveSourceUsage[],
) {
  const blockers: string[] = [];

  if (!context) {
    return ["未找到目标车间领料行、有效出库流水或单据。"];
  }

  if (context.documentNo !== DOCUMENT_NO || context.lineId !== LINE_ID) {
    blockers.push(
      `目标行不匹配: documentNo=${context.documentNo}, lineId=${context.lineId}`,
    );
  }

  if (context.orderType !== "PICK") {
    blockers.push(`目标单据不是车间领料 PICK: ${context.orderType}`);
  }

  if (context.materialName !== MATERIAL_NAME) {
    blockers.push(`目标物料名称不是 ${MATERIAL_NAME}: ${context.materialName}`);
  }

  if (!qtyEq(context.quantity, EXPECTED_QUANTITY)) {
    blockers.push(`目标明细数量不是 ${EXPECTED_QUANTITY}: ${context.quantity}`);
  }

  if (
    !decimalEq(context.lineUnitPrice, WRONG_LINE_UNIT_PRICE) &&
    !decimalEq(context.lineUnitPrice, CONFIRMED_UNIT_COST)
  ) {
    blockers.push(
      `目标明细单价既不是待修复值 ${WRONG_LINE_UNIT_PRICE}，也不是确认值 ${CONFIRMED_UNIT_COST}: ${context.lineUnitPrice}`,
    );
  }

  if (
    !decimalEq(context.lineAmount, WRONG_LINE_AMOUNT) &&
    !decimalEq(context.lineAmount, CONFIRMED_AMOUNT)
  ) {
    blockers.push(
      `目标明细金额既不是待修复值 ${WRONG_LINE_AMOUNT}，也不是确认值 ${CONFIRMED_AMOUNT}: ${context.lineAmount}`,
    );
  }

  if (
    context.lineCostUnitPrice !== null &&
    !decimalEq(context.lineCostUnitPrice, CONFIRMED_UNIT_COST)
  ) {
    blockers.push(
      `目标明细成本单价既不是空值也不是确认值 ${CONFIRMED_UNIT_COST}: ${context.lineCostUnitPrice}`,
    );
  }

  if (
    context.lineCostAmount !== null &&
    !decimalEq(context.lineCostAmount, CONFIRMED_AMOUNT)
  ) {
    blockers.push(
      `目标明细成本金额既不是空值也不是确认值 ${CONFIRMED_AMOUNT}: ${context.lineCostAmount}`,
    );
  }

  if (!decimalEq(context.outLogUnitCost, CONFIRMED_UNIT_COST)) {
    blockers.push(
      `库存出库流水单价不是 ${CONFIRMED_UNIT_COST}: ${context.outLogUnitCost ?? "null"}`,
    );
  }

  if (!decimalEq(context.outLogCostAmount, CONFIRMED_AMOUNT)) {
    blockers.push(
      `库存出库流水金额不是 ${CONFIRMED_AMOUNT}: ${context.outLogCostAmount ?? "null"}`,
    );
  }

  const activeNetQty = activeSourceUsages.reduce(
    (sum, usage) => sum + Number(usage.netQty),
    0,
  );

  if (!qtyEq(activeNetQty, EXPECTED_QUANTITY)) {
    blockers.push(
      `当前有效来源占用数量不是 ${EXPECTED_QUANTITY}: ${activeNetQty.toFixed(6)}`,
    );
  }

  const mismatchedSourceUsages = activeSourceUsages.filter(
    (usage) => !decimalEq(usage.sourceUnitCost, CONFIRMED_UNIT_COST),
  );
  if (mismatchedSourceUsages.length > 0) {
    blockers.push(
      `存在非 ${CONFIRMED_UNIT_COST} 的有效来源占用: usageIds=${mismatchedSourceUsages
        .map((usage) => usage.usageId)
        .join(",")}`,
    );
  }

  return blockers;
}

async function executeRepair(
  connection: MigrationConnectionLike,
  context: LineContext,
) {
  await connection.beginTransaction();

  try {
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
        context.lineId,
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
      [context.orderId, context.orderId, UPDATED_BY, context.orderId],
    );

    await connection.commit();

    return {
      updatedOrderId: context.orderId,
      updatedLineId: context.lineId,
      preservedOutLogId: context.outLogId,
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
      const before = await readLineContext(connection);
      const beforeTotals = before
        ? await readOrderTotals(connection, before.orderId)
        : null;
      const beforeActiveSourceUsages = await readActiveSourceUsages(connection);
      const blockers = validateContext(before, beforeActiveSourceUsages);

      if (execute && blockers.length > 0) {
        throw new Error(`Refusing to execute: ${blockers.join("; ")}`);
      }

      const executeResult =
        execute && before ? await executeRepair(connection, before) : null;
      const after = execute ? await readLineContext(connection) : null;
      const afterTotals = after
        ? await readOrderTotals(connection, after.orderId)
        : null;
      const afterActiveSourceUsages = execute
        ? await readActiveSourceUsages(connection)
        : null;

      const report = {
        generatedAt: new Date().toISOString(),
        mode: execute ? "execute" : "dry-run",
        targetDatabase,
        documentNo: DOCUMENT_NO,
        lineId: LINE_ID,
        materialCode: MATERIAL_CODE,
        confirmedBusinessFact:
          "业务确认：LL20260416002 的 yf81 接头座价格填写错误，应按库存来源价格 4.87 处理。",
        updatedBy: UPDATED_BY,
        expected: {
          quantity: EXPECTED_QUANTITY,
          previousUnitPrice: WRONG_LINE_UNIT_PRICE,
          previousAmount: WRONG_LINE_AMOUNT,
          confirmedUnitCost: CONFIRMED_UNIT_COST,
          confirmedAmount: CONFIRMED_AMOUNT,
        },
        blockers,
        before,
        beforeTotals,
        beforeActiveSourceUsages,
        executeResult,
        after,
        afterTotals,
        afterActiveSourceUsages,
      };

      writeStableReport(reportPath, report);
      console.log(
        `LL20260416002 yf81 amount repair ${execute ? "execute" : "dry-run"} completed. blockers=${blockers.length}, report=${reportPath}`,
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
