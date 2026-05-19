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

const MATERIAL_CODE = "zjq106";
const MATERIAL_NAME = "卡扣弹簧钢";
const SOURCE_DOCUMENT_NO = "YS20260425007";
const CONFIRMED_UNIT_COST = "0.10";
const UPDATED_BY =
  "manual-repair-zjq106-after-ys20260425007-price-to-0-10-20260518";
const DRY_RUN_REPORT_FILE_NAME =
  "repair-zjq106-after-ys20260425007-price-to-0-10-dry-run-report.json";
const EXECUTE_REPORT_FILE_NAME =
  "repair-zjq106-after-ys20260425007-price-to-0-10-execute-report.json";

interface SourceAcceptanceContext {
  orderId: number;
  documentNo: string;
  bizDate: string;
  lineId: number;
  materialId: number;
  materialCode: string;
  materialName: string;
  quantity: string;
  unitPrice: string;
  amount: string;
  sourceLogId: number;
  sourceLogUnitCost: string | null;
  sourceLogCostAmount: string | null;
}

interface WorkshopLineContext {
  orderId: number;
  documentNo: string;
  bizDate: string;
  orderType: string;
  lifecycleStatus: string;
  inventoryEffectStatus: string;
  orderTotalQty: string;
  orderTotalAmount: string;
  lineId: number;
  materialId: number;
  materialCode: string;
  materialName: string;
  quantity: string;
  lineUnitPrice: string;
  lineAmount: string;
  lineCostUnitPrice: string | null;
  lineCostAmount: string | null;
  outLogId: number;
  outLogUnitCost: string | null;
  outLogCostAmount: string | null;
}

interface ActiveSourceUsage {
  lineId: number;
  usageId: number;
  sourceLogId: number;
  allocatedQty: string;
  releasedQty: string;
  netQty: string;
  sourceDocumentNo: string;
  sourceUnitCost: string | null;
}

interface PlannedLineUpdate {
  orderId: number;
  documentNo: string;
  lineId: number;
  outLogId: number;
  quantity: string;
  previousLineUnitPrice: string;
  previousLineAmount: string;
  previousCostUnitPrice: string | null;
  previousCostAmount: string | null;
  previousOutLogUnitCost: string | null;
  previousOutLogCostAmount: string | null;
  confirmedUnitCost: string;
  confirmedAmount: string;
  lineAmountDelta: string;
}

interface TotalsContext {
  orderId: number;
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

function money(value: number): string {
  return value.toFixed(2);
}

function placeholders(values: readonly unknown[]): string {
  return values.map(() => "?").join(", ");
}

function targetAmount(quantity: string | number): string {
  return money(Number(quantity) * Number(CONFIRMED_UNIT_COST));
}

function uniqueNumbers(values: readonly number[]): number[] {
  return [...new Set(values)].sort((left, right) => left - right);
}

async function readSourceAcceptance(
  connection: MigrationConnectionLike,
): Promise<SourceAcceptanceContext[]> {
  return connection.query<SourceAcceptanceContext[]>(
    `
      SELECT
        o.id AS orderId,
        o.document_no AS documentNo,
        DATE_FORMAT(o.biz_date, '%Y-%m-%d') AS bizDate,
        l.id AS lineId,
        l.material_id AS materialId,
        l.material_code_snapshot AS materialCode,
        l.material_name_snapshot AS materialName,
        l.quantity,
        l.unit_price AS unitPrice,
        l.amount,
        log.id AS sourceLogId,
        log.unit_cost AS sourceLogUnitCost,
        log.cost_amount AS sourceLogCostAmount
      FROM stock_in_order o
      JOIN stock_in_order_line l ON l.order_id = o.id
      JOIN inventory_log log
        ON log.business_document_type = 'StockInOrder'
       AND log.business_document_id = o.id
       AND log.business_document_line_id = l.id
       AND log.direction = 'IN'
       AND NOT EXISTS (
         SELECT 1
         FROM inventory_log rev
         WHERE rev.reversal_of_log_id = log.id
       )
      WHERE o.document_no = ?
        AND l.material_code_snapshot = ?
      ORDER BY l.id, log.id
    `,
    [SOURCE_DOCUMENT_NO, MATERIAL_CODE],
  );
}

async function readPostSourceWorkshopLines(
  connection: MigrationConnectionLike,
  source: SourceAcceptanceContext,
): Promise<WorkshopLineContext[]> {
  return connection.query<WorkshopLineContext[]>(
    `
      SELECT
        o.id AS orderId,
        o.document_no AS documentNo,
        DATE_FORMAT(o.biz_date, '%Y-%m-%d') AS bizDate,
        o.order_type AS orderType,
        o.lifecycle_status AS lifecycleStatus,
        o.inventory_effect_status AS inventoryEffectStatus,
        o.total_qty AS orderTotalQty,
        o.total_amount AS orderTotalAmount,
        l.id AS lineId,
        l.material_id AS materialId,
        l.material_code_snapshot AS materialCode,
        l.material_name_snapshot AS materialName,
        l.quantity,
        l.unit_price AS lineUnitPrice,
        l.amount AS lineAmount,
        l.cost_unit_price AS lineCostUnitPrice,
        l.cost_amount AS lineCostAmount,
        log.id AS outLogId,
        log.unit_cost AS outLogUnitCost,
        log.cost_amount AS outLogCostAmount
      FROM workshop_material_order o
      JOIN workshop_material_order_line l ON l.order_id = o.id
      JOIN inventory_log log
        ON log.business_document_type = 'WorkshopMaterialOrder'
       AND log.business_document_id = o.id
       AND log.business_document_line_id = l.id
       AND log.direction = 'OUT'
       AND log.operation_type IN ('PICK_OUT', 'SCRAP_OUT')
       AND NOT EXISTS (
         SELECT 1
         FROM inventory_log rev
         WHERE rev.reversal_of_log_id = log.id
       )
      WHERE l.material_id = ?
        AND o.biz_date > ?
        AND o.order_type IN ('PICK', 'SCRAP')
        AND o.lifecycle_status = 'EFFECTIVE'
        AND o.inventory_effect_status = 'POSTED'
      ORDER BY o.biz_date, o.id, l.id, log.id
    `,
    [source.materialId, source.bizDate],
  );
}

async function readActiveSourceUsages(
  connection: MigrationConnectionLike,
  lineIds: readonly number[],
): Promise<ActiveSourceUsage[]> {
  if (lineIds.length === 0) return [];

  return connection.query<ActiveSourceUsage[]>(
    `
      SELECT
        u.consumer_line_id AS lineId,
        u.id AS usageId,
        u.source_log_id AS sourceLogId,
        u.allocated_qty AS allocatedQty,
        u.released_qty AS releasedQty,
        u.allocated_qty - u.released_qty AS netQty,
        source_log.business_document_number AS sourceDocumentNo,
        source_log.unit_cost AS sourceUnitCost
      FROM inventory_source_usage u
      JOIN inventory_log source_log ON source_log.id = u.source_log_id
      WHERE u.consumer_document_type = 'WorkshopMaterialOrder'
        AND u.consumer_line_id IN (${placeholders(lineIds)})
        AND u.allocated_qty > u.released_qty
      ORDER BY u.consumer_line_id, u.id
    `,
    lineIds,
  );
}

async function readOrderTotals(
  connection: MigrationConnectionLike,
  orderIds: readonly number[],
): Promise<TotalsContext[]> {
  const uniqueOrderIds = uniqueNumbers(orderIds);
  if (uniqueOrderIds.length === 0) return [];

  return connection.query<TotalsContext[]>(
    `
      SELECT
        order_id AS orderId,
        COUNT(*) AS lineCount,
        COALESCE(SUM(quantity), 0) AS totalQty,
        COALESCE(SUM(amount), 0) AS totalAmount
      FROM workshop_material_order_line
      WHERE order_id IN (${placeholders(uniqueOrderIds)})
      GROUP BY order_id
      ORDER BY order_id
    `,
    uniqueOrderIds,
  );
}

async function readPostSourceDocumentRows(
  connection: MigrationConnectionLike,
  source: SourceAcceptanceContext,
): Promise<Array<Record<string, unknown>>> {
  return connection.query<Array<Record<string, unknown>>>(
    `
      SELECT
        'stock_in' AS documentKind,
        o.document_no AS documentNo,
        DATE_FORMAT(o.biz_date, '%Y-%m-%d') AS bizDate,
        l.id AS lineId,
        l.quantity,
        l.unit_price AS unitPrice,
        l.amount,
        NULL AS costUnitPrice,
        NULL AS costAmount
      FROM stock_in_order o
      JOIN stock_in_order_line l ON l.order_id = o.id
      WHERE l.material_id = ?
        AND o.biz_date >= ?
      UNION ALL
      SELECT
        'workshop' AS documentKind,
        o.document_no AS documentNo,
        DATE_FORMAT(o.biz_date, '%Y-%m-%d') AS bizDate,
        l.id AS lineId,
        l.quantity,
        l.unit_price AS unitPrice,
        l.amount,
        l.cost_unit_price AS costUnitPrice,
        l.cost_amount AS costAmount
      FROM workshop_material_order o
      JOIN workshop_material_order_line l ON l.order_id = o.id
      WHERE l.material_id = ?
        AND o.biz_date > ?
      ORDER BY bizDate, documentNo, lineId
    `,
    [source.materialId, source.bizDate, source.materialId, source.bizDate],
  );
}

async function readPostSourceInventoryLogMismatches(
  connection: MigrationConnectionLike,
  source: SourceAcceptanceContext,
): Promise<Array<Record<string, unknown>>> {
  return connection.query<Array<Record<string, unknown>>>(
    `
      SELECT
        id,
        DATE_FORMAT(biz_date, '%Y-%m-%d') AS bizDate,
        direction,
        operation_type AS operationType,
        business_document_type AS businessDocumentType,
        business_document_number AS businessDocumentNumber,
        business_document_line_id AS businessDocumentLineId,
        change_qty AS changeQty,
        unit_cost AS unitCost,
        cost_amount AS costAmount,
        ROUND(change_qty * ?, 2) AS expectedCostAmount
      FROM inventory_log
      WHERE material_id = ?
        AND biz_date >= ?
        AND reversal_of_log_id IS NULL
        AND unit_cost IS NOT NULL
        AND (
          ROUND(unit_cost, 2) <> ROUND(?, 2)
          OR ROUND(cost_amount, 2) <> ROUND(change_qty * ?, 2)
        )
      ORDER BY biz_date, id
    `,
    [
      CONFIRMED_UNIT_COST,
      source.materialId,
      source.bizDate,
      CONFIRMED_UNIT_COST,
      CONFIRMED_UNIT_COST,
    ],
  );
}

function buildPlannedUpdates(
  lines: readonly WorkshopLineContext[],
): PlannedLineUpdate[] {
  return lines
    .filter((line) => {
      const amount = targetAmount(line.quantity);

      return (
        !decimalEq(line.lineUnitPrice, CONFIRMED_UNIT_COST) ||
        !decimalEq(line.lineAmount, amount) ||
        !decimalEq(line.lineCostUnitPrice, CONFIRMED_UNIT_COST) ||
        !decimalEq(line.lineCostAmount, amount) ||
        !decimalEq(line.outLogUnitCost, CONFIRMED_UNIT_COST) ||
        !decimalEq(line.outLogCostAmount, amount)
      );
    })
    .map((line) => {
      const amount = targetAmount(line.quantity);

      return {
        orderId: line.orderId,
        documentNo: line.documentNo,
        lineId: line.lineId,
        outLogId: line.outLogId,
        quantity: line.quantity,
        previousLineUnitPrice: line.lineUnitPrice,
        previousLineAmount: line.lineAmount,
        previousCostUnitPrice: line.lineCostUnitPrice,
        previousCostAmount: line.lineCostAmount,
        previousOutLogUnitCost: line.outLogUnitCost,
        previousOutLogCostAmount: line.outLogCostAmount,
        confirmedUnitCost: CONFIRMED_UNIT_COST,
        confirmedAmount: amount,
        lineAmountDelta: money(Number(amount) - Number(line.lineAmount)),
      };
    });
}

function validateContext(params: {
  sourceAcceptanceRows: readonly SourceAcceptanceContext[];
  source: SourceAcceptanceContext | null;
  allPostSourceLines: readonly WorkshopLineContext[];
  plannedUpdates: readonly PlannedLineUpdate[];
  activeSourceUsages: readonly ActiveSourceUsage[];
}) {
  const blockers: string[] = [];

  if (params.sourceAcceptanceRows.length !== 1) {
    blockers.push(
      `验收来源 ${SOURCE_DOCUMENT_NO}/${MATERIAL_CODE} 数量不是 1: actual=${params.sourceAcceptanceRows.length}`,
    );
  }

  if (!params.source) {
    return blockers.length > 0 ? blockers : ["未找到确认验收来源。"];
  }

  if (!decimalEq(params.source.unitPrice, CONFIRMED_UNIT_COST)) {
    blockers.push(
      `验收明细单价不是 ${CONFIRMED_UNIT_COST}: ${params.source.unitPrice}`,
    );
  }

  if (!decimalEq(params.source.sourceLogUnitCost, CONFIRMED_UNIT_COST)) {
    blockers.push(
      `验收入库流水单价不是 ${CONFIRMED_UNIT_COST}: ${params.source.sourceLogUnitCost ?? "null"}`,
    );
  }

  for (const line of params.allPostSourceLines) {
    if (
      line.materialCode !== MATERIAL_CODE ||
      line.materialName !== MATERIAL_NAME
    ) {
      blockers.push(
        `后续候选行物料快照不匹配: ${line.documentNo}/lineId=${line.lineId}/${line.materialCode}/${line.materialName}`,
      );
    }
  }

  const usagesByLineId = new Map<number, ActiveSourceUsage[]>();
  for (const usage of params.activeSourceUsages) {
    usagesByLineId.set(usage.lineId, [
      ...(usagesByLineId.get(usage.lineId) ?? []),
      usage,
    ]);
  }

  for (const update of params.plannedUpdates) {
    const usages = usagesByLineId.get(update.lineId) ?? [];
    const activeNetQty = usages.reduce(
      (sum, usage) => sum + Number(usage.netQty),
      0,
    );

    if (!qtyEq(activeNetQty, update.quantity)) {
      blockers.push(
        `有效来源占用数量不等于明细数量: ${update.documentNo}/lineId=${update.lineId}, active=${activeNetQty.toFixed(6)}, quantity=${update.quantity}`,
      );
    }

    const mismatchedSourceUsages = usages.filter(
      (usage) => !decimalEq(usage.sourceUnitCost, CONFIRMED_UNIT_COST),
    );
    if (mismatchedSourceUsages.length > 0) {
      blockers.push(
        `存在非 ${CONFIRMED_UNIT_COST} 来源占用: ${update.documentNo}/lineId=${update.lineId}, usageIds=${mismatchedSourceUsages
          .map((usage) => usage.usageId)
          .join(",")}`,
      );
    }
  }

  return blockers;
}

async function executeRepair(
  connection: MigrationConnectionLike,
  plannedUpdates: readonly PlannedLineUpdate[],
) {
  await connection.beginTransaction();

  try {
    for (const update of plannedUpdates) {
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
          update.confirmedUnitCost,
          update.confirmedAmount,
          update.confirmedUnitCost,
          update.confirmedAmount,
          UPDATED_BY,
          update.lineId,
        ],
      );

      await connection.query(
        `
          UPDATE inventory_log
          SET
            unit_cost = ?,
            cost_amount = ?,
            note = CASE
              WHEN ROUND(COALESCE(unit_cost, -1), 2) <> ROUND(?, 2)
                OR ROUND(COALESCE(cost_amount, -1), 2) <> ROUND(?, 2)
              THEN ?
              ELSE note
            END
          WHERE id = ?
        `,
        [
          update.confirmedUnitCost,
          update.confirmedAmount,
          update.confirmedUnitCost,
          update.confirmedAmount,
          `人工修复：业务确认 ${SOURCE_DOCUMENT_NO} 验收之后 ${MATERIAL_CODE} 单据操作价格统一为 ${CONFIRMED_UNIT_COST}。`,
          update.outLogId,
        ],
      );
    }

    for (const orderId of uniqueNumbers(
      plannedUpdates.map((update) => update.orderId),
    )) {
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
        [orderId, orderId, UPDATED_BY, orderId],
      );
    }

    await connection.commit();

    return {
      updatedLineIds: plannedUpdates.map((update) => update.lineId),
      updatedOutLogIds: plannedUpdates.map((update) => update.outLogId),
      updatedOrderIds: uniqueNumbers(
        plannedUpdates.map((update) => update.orderId),
      ),
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
      const sourceAcceptanceRows = await readSourceAcceptance(connection);
      const source = sourceAcceptanceRows[0] ?? null;
      const beforeLines = source
        ? await readPostSourceWorkshopLines(connection, source)
        : [];
      const plannedUpdates = buildPlannedUpdates(beforeLines);
      const plannedLineIds = plannedUpdates.map((update) => update.lineId);
      const beforeActiveSourceUsages = await readActiveSourceUsages(
        connection,
        plannedLineIds,
      );
      const beforeOrderTotals = await readOrderTotals(
        connection,
        plannedUpdates.map((update) => update.orderId),
      );
      const blockers = validateContext({
        sourceAcceptanceRows,
        source,
        allPostSourceLines: beforeLines,
        plannedUpdates,
        activeSourceUsages: beforeActiveSourceUsages,
      });
      const beforePostSourceDocumentRows = source
        ? await readPostSourceDocumentRows(connection, source)
        : [];
      const beforePostSourceInventoryLogMismatches = source
        ? await readPostSourceInventoryLogMismatches(connection, source)
        : [];

      if (execute && blockers.length > 0) {
        throw new Error(`Refusing to execute: ${blockers.join("; ")}`);
      }

      const executeResult =
        execute && plannedUpdates.length > 0
          ? await executeRepair(connection, plannedUpdates)
          : null;
      const afterLines =
        execute && source
          ? await readPostSourceWorkshopLines(connection, source)
          : null;
      const afterPlannedUpdates =
        afterLines === null ? null : buildPlannedUpdates(afterLines);
      const afterOrderTotals = execute
        ? await readOrderTotals(
            connection,
            plannedUpdates.map((update) => update.orderId),
          )
        : null;
      const afterPostSourceDocumentRows =
        execute && source
          ? await readPostSourceDocumentRows(connection, source)
          : null;
      const afterPostSourceInventoryLogMismatches =
        execute && source
          ? await readPostSourceInventoryLogMismatches(connection, source)
          : null;

      const report = {
        generatedAt: new Date().toISOString(),
        mode: execute ? "execute" : "dry-run",
        targetDatabase,
        materialCode: MATERIAL_CODE,
        materialName: MATERIAL_NAME,
        sourceDocumentNo: SOURCE_DOCUMENT_NO,
        businessConfirmation:
          "已确认：YS20260425007 验收之后的 zjq106 / 卡扣弹簧钢所有单据操作价格改为 0.10。",
        updatedBy: UPDATED_BY,
        confirmedUnitCost: CONFIRMED_UNIT_COST,
        sourceAcceptanceRows,
        blockers,
        before: {
          lineCount: beforeLines.length,
          plannedUpdateCount: plannedUpdates.length,
          lines: beforeLines,
          plannedUpdates,
          activeSourceUsages: beforeActiveSourceUsages,
          orderTotals: beforeOrderTotals,
          postSourceDocumentRows: beforePostSourceDocumentRows,
          postSourceInventoryLogMismatches:
            beforePostSourceInventoryLogMismatches,
        },
        executeResult,
        after: execute
          ? {
              lineCount: afterLines?.length ?? 0,
              remainingPlannedUpdateCount: afterPlannedUpdates?.length ?? 0,
              lines: afterLines,
              orderTotals: afterOrderTotals,
              postSourceDocumentRows: afterPostSourceDocumentRows,
              postSourceInventoryLogMismatches:
                afterPostSourceInventoryLogMismatches,
            }
          : null,
      };

      writeStableReport(reportPath, report);
      console.log(
        `Repair ${MATERIAL_CODE} after ${SOURCE_DOCUMENT_NO} ${execute ? "execute" : "dry-run"} completed. planned=${plannedUpdates.length}, blockers=${blockers.length}, report=${reportPath}`,
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
