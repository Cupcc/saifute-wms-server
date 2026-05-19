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

const MATERIAL_CODE = "yf12";
const MATERIAL_NAME = "铜接头";
const CONFIRMED_UNIT_COST = "0.88";
const PREVIOUS_LINE_UNIT_COST = "0.89";
const UPDATED_BY = "manual-repair-yf12-pick-amount-to-0-88-20260518";
const DRY_RUN_REPORT_FILE_NAME =
  "repair-yf12-workshop-pick-amount-to-0-88-dry-run-report.json";
const EXECUTE_REPORT_FILE_NAME =
  "repair-yf12-workshop-pick-amount-to-0-88-execute-report.json";

const TARGET_LINES = [
  {
    documentNo: "LL20260503003",
    lineId: 1629,
    quantity: "400.000000",
    previousAmount: "356.00",
    confirmedAmount: "352.00",
  },
  {
    documentNo: "LL20260505002",
    lineId: 1715,
    quantity: "500.000000",
    previousAmount: "445.00",
    confirmedAmount: "440.00",
  },
  {
    documentNo: "LL20260509001",
    lineId: 1794,
    quantity: "200.000000",
    previousAmount: "178.00",
    confirmedAmount: "176.00",
  },
] as const;

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
  lineId: number;
  usageId: number;
  sourceLogId: number;
  allocatedQty: string;
  releasedQty: string;
  netQty: string;
  sourceDocumentNo: string;
  sourceUnitCost: string | null;
}

interface TotalsContext {
  orderId: number;
  lineCount: number;
  totalQty: string;
  totalAmount: string;
}

interface PlannedLineUpdate {
  documentNo: string;
  lineId: number;
  quantity: string;
  previousUnitCost: string;
  previousAmount: string;
  confirmedUnitCost: string;
  confirmedAmount: string;
  lineAmountDelta: string;
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

function targetByLineId(lineId: number) {
  return TARGET_LINES.find((target) => target.lineId === lineId) ?? null;
}

async function readLineContexts(
  connection: MigrationConnectionLike,
): Promise<LineContext[]> {
  return connection.query<LineContext[]>(
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
      WHERE l.id IN (?, ?, ?)
      ORDER BY l.id
    `,
    TARGET_LINES.map((target) => target.lineId),
  );
}

async function readActiveSourceUsages(
  connection: MigrationConnectionLike,
): Promise<ActiveSourceUsage[]> {
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
        AND u.consumer_line_id IN (?, ?, ?)
        AND u.allocated_qty > u.released_qty
      ORDER BY u.consumer_line_id, u.id
    `,
    TARGET_LINES.map((target) => target.lineId),
  );
}

async function readOrderTotals(
  connection: MigrationConnectionLike,
  orderIds: readonly number[],
): Promise<TotalsContext[]> {
  if (orderIds.length === 0) return [];

  return connection.query<TotalsContext[]>(
    `
      SELECT
        order_id AS orderId,
        COUNT(*) AS lineCount,
        COALESCE(SUM(quantity), 0) AS totalQty,
        COALESCE(SUM(amount), 0) AS totalAmount
      FROM workshop_material_order_line
      WHERE order_id IN (?, ?, ?)
      GROUP BY order_id
      ORDER BY order_id
    `,
    [...orderIds, ...orderIds.slice(-1), ...orderIds.slice(-1)].slice(0, 3),
  );
}

function buildPlannedUpdates(lines: readonly LineContext[]) {
  return lines
    .map((line): PlannedLineUpdate | null => {
      const target = targetByLineId(line.lineId);
      if (!target) return null;

      return {
        documentNo: target.documentNo,
        lineId: target.lineId,
        quantity: target.quantity,
        previousUnitCost: PREVIOUS_LINE_UNIT_COST,
        previousAmount: target.previousAmount,
        confirmedUnitCost: CONFIRMED_UNIT_COST,
        confirmedAmount: target.confirmedAmount,
        lineAmountDelta: money(
          Number(target.confirmedAmount) - Number(line.lineAmount),
        ),
      };
    })
    .filter((update): update is PlannedLineUpdate => update !== null);
}

function validateContext(
  lines: readonly LineContext[],
  activeSourceUsages: readonly ActiveSourceUsage[],
) {
  const blockers: string[] = [];

  if (lines.length !== TARGET_LINES.length) {
    blockers.push(
      `目标行数量不是 ${TARGET_LINES.length}: actual=${lines.length}`,
    );
  }

  const lineIds = new Set(lines.map((line) => line.lineId));
  for (const target of TARGET_LINES) {
    if (!lineIds.has(target.lineId)) {
      blockers.push(
        `未找到目标行: ${target.documentNo}/lineId=${target.lineId}`,
      );
    }
  }

  for (const line of lines) {
    const target = targetByLineId(line.lineId);
    if (!target) {
      blockers.push(`出现非目标行: lineId=${line.lineId}`);
      continue;
    }

    if (line.documentNo !== target.documentNo) {
      blockers.push(
        `目标行单据号不匹配: lineId=${line.lineId}, actual=${line.documentNo}, expected=${target.documentNo}`,
      );
    }
    if (line.orderType !== "PICK") {
      blockers.push(
        `目标行不是车间领料 PICK: ${line.documentNo}/lineId=${line.lineId}, actual=${line.orderType}`,
      );
    }
    if (line.materialCode !== MATERIAL_CODE) {
      blockers.push(
        `目标行物料编码不是 ${MATERIAL_CODE}: ${line.documentNo}/lineId=${line.lineId}, actual=${line.materialCode}`,
      );
    }
    if (line.materialName !== MATERIAL_NAME) {
      blockers.push(
        `目标行物料名称不是 ${MATERIAL_NAME}: ${line.documentNo}/lineId=${line.lineId}, actual=${line.materialName}`,
      );
    }
    if (!qtyEq(line.quantity, target.quantity)) {
      blockers.push(
        `目标行数量不是 ${target.quantity}: ${line.documentNo}/lineId=${line.lineId}, actual=${line.quantity}`,
      );
    }
    if (
      !decimalEq(line.lineUnitPrice, PREVIOUS_LINE_UNIT_COST) &&
      !decimalEq(line.lineUnitPrice, CONFIRMED_UNIT_COST)
    ) {
      blockers.push(
        `目标行单价既不是待修复值 ${PREVIOUS_LINE_UNIT_COST} 也不是确认值 ${CONFIRMED_UNIT_COST}: ${line.documentNo}/lineId=${line.lineId}, actual=${line.lineUnitPrice}`,
      );
    }
    if (
      !decimalEq(line.lineAmount, target.previousAmount) &&
      !decimalEq(line.lineAmount, target.confirmedAmount)
    ) {
      blockers.push(
        `目标行金额既不是待修复值 ${target.previousAmount} 也不是确认值 ${target.confirmedAmount}: ${line.documentNo}/lineId=${line.lineId}, actual=${line.lineAmount}`,
      );
    }
    if (!decimalEq(line.outLogUnitCost, CONFIRMED_UNIT_COST)) {
      blockers.push(
        `库存出库流水单价不是已确认 ${CONFIRMED_UNIT_COST}: ${line.documentNo}/lineId=${line.lineId}, actual=${line.outLogUnitCost ?? "null"}`,
      );
    }
    if (!decimalEq(line.outLogCostAmount, target.confirmedAmount)) {
      blockers.push(
        `库存出库流水金额不是已确认 ${target.confirmedAmount}: ${line.documentNo}/lineId=${line.lineId}, actual=${line.outLogCostAmount ?? "null"}`,
      );
    }
  }

  for (const target of TARGET_LINES) {
    const usages = activeSourceUsages.filter(
      (usage) => usage.lineId === target.lineId,
    );
    const netQty = usages.reduce((sum, usage) => sum + Number(usage.netQty), 0);
    if (!qtyEq(netQty, target.quantity)) {
      blockers.push(
        `有效来源占用数量不是 ${target.quantity}: ${target.documentNo}/lineId=${target.lineId}, actual=${netQty.toFixed(6)}`,
      );
    }
    const wrongUsages = usages.filter(
      (usage) => !decimalEq(usage.sourceUnitCost, CONFIRMED_UNIT_COST),
    );
    if (wrongUsages.length > 0) {
      blockers.push(
        `${target.documentNo}/lineId=${target.lineId} 存在非 ${CONFIRMED_UNIT_COST} 的有效来源占用: usageIds=${wrongUsages
          .map((usage) => usage.usageId)
          .join(",")}`,
      );
    }
  }

  return blockers;
}

async function executeRepair(
  connection: MigrationConnectionLike,
  lines: readonly LineContext[],
) {
  await connection.beginTransaction();

  try {
    const updatedLines: PlannedLineUpdate[] = [];

    for (const line of lines) {
      const target = targetByLineId(line.lineId);
      if (!target) continue;

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
          target.confirmedAmount,
          CONFIRMED_UNIT_COST,
          target.confirmedAmount,
          UPDATED_BY,
          line.lineId,
        ],
      );

      updatedLines.push({
        documentNo: target.documentNo,
        lineId: target.lineId,
        quantity: target.quantity,
        previousUnitCost: PREVIOUS_LINE_UNIT_COST,
        previousAmount: target.previousAmount,
        confirmedUnitCost: CONFIRMED_UNIT_COST,
        confirmedAmount: target.confirmedAmount,
        lineAmountDelta: money(
          Number(target.confirmedAmount) - Number(line.lineAmount),
        ),
      });
    }

    const orderIds = [...new Set(lines.map((line) => line.orderId))];
    for (const orderId of orderIds) {
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
      updatedOrderIds: orderIds,
      updatedLines,
      preservedInventoryLogIds: lines.map((line) => line.outLogId),
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
      const before = await readLineContexts(connection);
      const beforeActiveSourceUsages = await readActiveSourceUsages(connection);
      const beforeOrderTotals = await readOrderTotals(connection, [
        ...new Set(before.map((line) => line.orderId)),
      ]);
      const plannedLineUpdates = buildPlannedUpdates(before);
      const blockers = validateContext(before, beforeActiveSourceUsages);

      if (execute && blockers.length > 0) {
        throw new Error(`Refusing to execute: ${blockers.join("; ")}`);
      }

      const executeResult = execute
        ? await executeRepair(connection, before)
        : null;
      const after = execute ? await readLineContexts(connection) : null;
      const afterActiveSourceUsages = execute
        ? await readActiveSourceUsages(connection)
        : null;
      const afterOrderTotals =
        execute && after
          ? await readOrderTotals(connection, [
              ...new Set(after.map((line) => line.orderId)),
            ])
          : null;

      const report = {
        generatedAt: new Date().toISOString(),
        mode: execute ? "execute" : "dry-run",
        targetDatabase,
        materialCode: MATERIAL_CODE,
        materialName: MATERIAL_NAME,
        confirmedBusinessFact:
          "业务已确认：yf12 / 铜接头 这 3 条车间领料成本价由 0.89 改为 0.88，保留当前 0.88 库存来源链。",
        updatedBy: UPDATED_BY,
        targetLines: TARGET_LINES,
        plannedLineUpdates,
        blockers,
        before,
        beforeOrderTotals,
        beforeActiveSourceUsages,
        executeResult,
        after,
        afterOrderTotals,
        afterActiveSourceUsages,
      };

      writeStableReport(reportPath, report);
      console.log(
        `Repair ${MATERIAL_CODE} workshop pick amount to ${CONFIRMED_UNIT_COST} ${execute ? "execute" : "dry-run"} completed. blockers=${blockers.length}, report=${reportPath}`,
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
