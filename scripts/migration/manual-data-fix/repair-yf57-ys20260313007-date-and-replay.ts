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
  type QueryResultWithInsertId,
  withPoolConnection,
} from "../db";
import { buildInventoryReplayPlan } from "../inventory-replay/planner";
import { readInventoryReplayInput } from "../inventory-replay/reader";
import type {
  InventoryReplayBlocker,
  PlannedBalanceRow,
  PlannedLogInsert,
  PlannedSourceUsageInsert,
} from "../inventory-replay/types";
import { writeStableReport } from "../shared/report-writer";

const MATERIAL_CODE = "yf57";
const MATERIAL_ID = 774;
const STOCK_IN_DOCUMENT_NO = "YS20260313007";
const PICK_DOCUMENT_NO = "LL20260311004";
const OLD_STOCK_IN_BIZ_DATE = "2026-03-13";
const CONFIRMED_STOCK_IN_BIZ_DATE = "2026-03-10";
const PICK_BIZ_DATE = "2026-03-11";
const UPDATED_BY = "manual-repair-yf57-date-replay-20260518";
const DRY_RUN_REPORT_FILE_NAME =
  "repair-yf57-ys20260313007-date-and-replay-dry-run-report.json";
const EXECUTE_REPORT_FILE_NAME =
  "repair-yf57-ys20260313007-date-and-replay-execute-report.json";

const COST_LINE_FIXES = [
  {
    documentNo: "LL20260406005",
    lineId: 1091,
    oldUnitCost: "6.60",
    confirmedUnitCost: "6.23",
  },
  {
    documentNo: "LL20260417007",
    lineId: 1295,
    oldUnitCost: "6.60",
    confirmedUnitCost: "6.23",
  },
  {
    documentNo: "LL20260422009",
    lineId: 1477,
    oldUnitCost: "6.60",
    confirmedUnitCost: "6.23",
  },
  {
    documentNo: "LL20260425003",
    lineId: 1491,
    oldUnitCost: "6.60",
    confirmedUnitCost: "6.23",
  },
] as const;

interface StockInRow {
  orderId: number;
  documentNo: string;
  bizDate: string;
  orderType: string;
  lifecycleStatus: string;
  inventoryEffectStatus: string;
  lineId: number;
  materialId: number;
  materialCode: string;
  quantity: string;
  unitPrice: string;
  amount: string;
}

interface WorkshopLineRow {
  orderId: number;
  documentNo: string;
  bizDate: string;
  orderType: string;
  lifecycleStatus: string;
  inventoryEffectStatus: string;
  totalAmount: string;
  lineId: number;
  materialId: number;
  materialCode: string;
  quantity: string;
  unitPrice: string;
  amount: string;
  costUnitPrice: string | null;
  costAmount: string | null;
}

interface InventoryLogRow {
  logId: number;
  bizDate: string;
  direction: string;
  operationType: string;
  documentNo: string;
  lineId: number;
  changeQty: string;
  beforeQty: string;
  afterQty: string;
  unitCost: string | null;
  costAmount: string | null;
}

interface SourceUsageRow {
  usageId: number;
  sourceDocumentNo: string;
  sourceBizDate: string;
  sourceUnitCost: string | null;
  consumerDocumentType: string;
  consumerDocumentId: number;
  consumerLineId: number;
  consumerDocumentNo: string | null;
  consumerBizDate: string | null;
  allocatedQty: string;
  releasedQty: string;
  status: string;
}

function decimalEq(left: string | null, right: string): boolean {
  return Number(left ?? Number.NaN).toFixed(2) === Number(right).toFixed(2);
}

function qtyEq(left: string | null, right: string): boolean {
  return Number(left ?? Number.NaN).toFixed(6) === Number(right).toFixed(6);
}

function isAllowedDate(value: string): boolean {
  return (
    value === OLD_STOCK_IN_BIZ_DATE || value === CONFIRMED_STOCK_IN_BIZ_DATE
  );
}

async function readStockInRow(
  connection: MigrationConnectionLike,
): Promise<StockInRow | null> {
  const rows = await connection.query<StockInRow[]>(
    `
      SELECT
        o.id AS orderId,
        o.document_no AS documentNo,
        DATE_FORMAT(o.biz_date, '%Y-%m-%d') AS bizDate,
        o.order_type AS orderType,
        o.lifecycle_status AS lifecycleStatus,
        o.inventory_effect_status AS inventoryEffectStatus,
        l.id AS lineId,
        l.material_id AS materialId,
        l.material_code_snapshot AS materialCode,
        l.quantity,
        l.unit_price AS unitPrice,
        l.amount
      FROM stock_in_order o
      JOIN stock_in_order_line l ON l.order_id = o.id
      WHERE o.document_no = ?
        AND l.material_id = ?
        AND l.material_code_snapshot = ?
      ORDER BY l.id
    `,
    [STOCK_IN_DOCUMENT_NO, MATERIAL_ID, MATERIAL_CODE],
  );

  return rows[0] ?? null;
}

async function readPickLine(
  connection: MigrationConnectionLike,
): Promise<WorkshopLineRow | null> {
  const rows = await connection.query<WorkshopLineRow[]>(
    `
      SELECT
        o.id AS orderId,
        o.document_no AS documentNo,
        DATE_FORMAT(o.biz_date, '%Y-%m-%d') AS bizDate,
        o.order_type AS orderType,
        o.lifecycle_status AS lifecycleStatus,
        o.inventory_effect_status AS inventoryEffectStatus,
        o.total_amount AS totalAmount,
        l.id AS lineId,
        l.material_id AS materialId,
        l.material_code_snapshot AS materialCode,
        l.quantity,
        l.unit_price AS unitPrice,
        l.amount,
        l.cost_unit_price AS costUnitPrice,
        l.cost_amount AS costAmount
      FROM workshop_material_order o
      JOIN workshop_material_order_line l ON l.order_id = o.id
      WHERE o.document_no = ?
        AND l.material_id = ?
        AND l.material_code_snapshot = ?
      ORDER BY l.id
    `,
    [PICK_DOCUMENT_NO, MATERIAL_ID, MATERIAL_CODE],
  );

  return rows[0] ?? null;
}

async function readCostLineFixRows(
  connection: MigrationConnectionLike,
): Promise<WorkshopLineRow[]> {
  return connection.query<WorkshopLineRow[]>(
    `
      SELECT
        o.id AS orderId,
        o.document_no AS documentNo,
        DATE_FORMAT(o.biz_date, '%Y-%m-%d') AS bizDate,
        o.order_type AS orderType,
        o.lifecycle_status AS lifecycleStatus,
        o.inventory_effect_status AS inventoryEffectStatus,
        o.total_amount AS totalAmount,
        l.id AS lineId,
        l.material_id AS materialId,
        l.material_code_snapshot AS materialCode,
        l.quantity,
        l.unit_price AS unitPrice,
        l.amount,
        l.cost_unit_price AS costUnitPrice,
        l.cost_amount AS costAmount
      FROM workshop_material_order o
      JOIN workshop_material_order_line l ON l.order_id = o.id
      WHERE l.id IN (${COST_LINE_FIXES.map(() => "?").join(", ")})
      ORDER BY o.biz_date, o.id, l.id
    `,
    COST_LINE_FIXES.map((fix) => fix.lineId),
  );
}

async function readInventoryLogs(
  connection: MigrationConnectionLike,
): Promise<InventoryLogRow[]> {
  return connection.query<InventoryLogRow[]>(
    `
      SELECT
        id AS logId,
        DATE_FORMAT(biz_date, '%Y-%m-%d') AS bizDate,
        direction,
        operation_type AS operationType,
        business_document_number AS documentNo,
        business_document_line_id AS lineId,
        change_qty AS changeQty,
        before_qty AS beforeQty,
        after_qty AS afterQty,
        unit_cost AS unitCost,
        cost_amount AS costAmount
      FROM inventory_log
      WHERE material_id = ?
      ORDER BY biz_date, direction, id
    `,
    [MATERIAL_ID],
  );
}

async function readSourceUsages(
  connection: MigrationConnectionLike,
): Promise<SourceUsageRow[]> {
  return connection.query<SourceUsageRow[]>(
    `
      SELECT
        u.id AS usageId,
        source_log.business_document_number AS sourceDocumentNo,
        DATE_FORMAT(source_log.biz_date, '%Y-%m-%d') AS sourceBizDate,
        source_log.unit_cost AS sourceUnitCost,
        u.consumer_document_type AS consumerDocumentType,
        u.consumer_document_id AS consumerDocumentId,
        u.consumer_line_id AS consumerLineId,
        consumer_o.document_no AS consumerDocumentNo,
        DATE_FORMAT(consumer_o.biz_date, '%Y-%m-%d') AS consumerBizDate,
        u.allocated_qty AS allocatedQty,
        u.released_qty AS releasedQty,
        u.status
      FROM inventory_source_usage u
      JOIN inventory_log source_log ON source_log.id = u.source_log_id
      LEFT JOIN workshop_material_order_line consumer_l
        ON consumer_l.id = u.consumer_line_id
       AND u.consumer_document_type = 'WorkshopMaterialOrder'
      LEFT JOIN workshop_material_order consumer_o ON consumer_o.id = consumer_l.order_id
      WHERE u.material_id = ?
      ORDER BY source_log.biz_date, source_log.id, u.id
    `,
    [MATERIAL_ID],
  );
}

async function readBalanceRows(connection: MigrationConnectionLike) {
  return connection.query<
    Array<{
      materialId: number;
      stockScopeId: number;
      quantityOnHand: string;
    }>
  >(
    `
      SELECT
        material_id AS materialId,
        stock_scope_id AS stockScopeId,
        quantity_on_hand AS quantityOnHand
      FROM inventory_balance
      WHERE material_id = ?
      ORDER BY stock_scope_id
    `,
    [MATERIAL_ID],
  );
}

async function readContext(connection: MigrationConnectionLike) {
  const replayInput = await readInventoryReplayInput(connection);
  const plan = buildInventoryReplayPlan(replayInput.events, {
    coverageGaps: replayInput.coverageGaps,
  });
  return {
    stockIn: await readStockInRow(connection),
    pickLine: await readPickLine(connection),
    costLineFixes: await readCostLineFixRows(connection),
    logs: await readInventoryLogs(connection),
    sourceUsages: await readSourceUsages(connection),
    balances: await readBalanceRows(connection),
    replayBlockers: plan.blockers,
    yf57ReplayBlockers: filterYf57Blockers(plan.blockers),
  };
}

function filterYf57Blockers(
  blockers: readonly InventoryReplayBlocker[],
): InventoryReplayBlocker[] {
  return blockers.filter((blocker) => {
    const details = blocker.details as Record<string, unknown> | undefined;
    return (
      details?.materialId === MATERIAL_ID ||
      JSON.stringify(details ?? {}).includes(STOCK_IN_DOCUMENT_NO) ||
      JSON.stringify(details ?? {}).includes(PICK_DOCUMENT_NO)
    );
  });
}

function validateContext(params: {
  stockIn: StockInRow | null;
  pickLine: WorkshopLineRow | null;
  costLineFixRows: readonly WorkshopLineRow[];
}): string[] {
  const blockers: string[] = [];
  const { stockIn, pickLine, costLineFixRows } = params;

  if (!stockIn) {
    blockers.push(`未找到 ${STOCK_IN_DOCUMENT_NO}/${MATERIAL_CODE} 验收明细。`);
  } else {
    if (!isAllowedDate(stockIn.bizDate)) {
      blockers.push(`验收业务日期不是可修复值: ${stockIn.bizDate}`);
    }
    if (stockIn.orderType !== "ACCEPTANCE") {
      blockers.push(`验收单类型不是 ACCEPTANCE: ${stockIn.orderType}`);
    }
    if (stockIn.lifecycleStatus !== "EFFECTIVE") {
      blockers.push(
        `验收单 lifecycle_status 不是 EFFECTIVE: ${stockIn.lifecycleStatus}`,
      );
    }
    if (stockIn.inventoryEffectStatus !== "POSTED") {
      blockers.push(
        `验收单 inventory_effect_status 不是 POSTED: ${stockIn.inventoryEffectStatus}`,
      );
    }
    if (!qtyEq(stockIn.quantity, "3.000000")) {
      blockers.push(`验收数量不是 3.000000: ${stockIn.quantity}`);
    }
    if (!decimalEq(stockIn.unitPrice, "6.60")) {
      blockers.push(`验收单价不是 6.60: ${stockIn.unitPrice}`);
    }
    if (!decimalEq(stockIn.amount, "19.80")) {
      blockers.push(`验收金额不是 19.80: ${stockIn.amount}`);
    }
  }

  if (!pickLine) {
    blockers.push(`未找到 ${PICK_DOCUMENT_NO}/${MATERIAL_CODE} 领料明细。`);
  } else {
    if (pickLine.bizDate !== PICK_BIZ_DATE) {
      blockers.push(`领料业务日期不是 ${PICK_BIZ_DATE}: ${pickLine.bizDate}`);
    }
    if (pickLine.orderType !== "PICK") {
      blockers.push(`领料单类型不是 PICK: ${pickLine.orderType}`);
    }
    if (pickLine.lifecycleStatus !== "EFFECTIVE") {
      blockers.push(
        `领料单 lifecycle_status 不是 EFFECTIVE: ${pickLine.lifecycleStatus}`,
      );
    }
    if (pickLine.inventoryEffectStatus !== "POSTED") {
      blockers.push(
        `领料单 inventory_effect_status 不是 POSTED: ${pickLine.inventoryEffectStatus}`,
      );
    }
    if (!qtyEq(pickLine.quantity, "2.000000")) {
      blockers.push(`领料数量不是 2.000000: ${pickLine.quantity}`);
    }
    if (!decimalEq(pickLine.unitPrice, "6.60")) {
      blockers.push(`领料单价不是 6.60: ${pickLine.unitPrice}`);
    }
  }

  const costRowsById = new Map(costLineFixRows.map((row) => [row.lineId, row]));
  for (const fix of COST_LINE_FIXES) {
    const row = costRowsById.get(fix.lineId);
    if (!row) {
      blockers.push(
        `未找到待修复领料明细: ${fix.documentNo}/lineId=${fix.lineId}`,
      );
      continue;
    }
    if (row.documentNo !== fix.documentNo) {
      blockers.push(
        `待修复明细单据号不匹配: lineId=${fix.lineId}, actual=${row.documentNo}, expected=${fix.documentNo}`,
      );
    }
    if (row.materialId !== MATERIAL_ID || row.materialCode !== MATERIAL_CODE) {
      blockers.push(
        `待修复明细物料不匹配: ${fix.documentNo}/lineId=${fix.lineId}/${row.materialCode}`,
      );
    }
    if (!qtyEq(row.quantity, "1.000000")) {
      blockers.push(
        `待修复明细数量不是 1.000000: ${fix.documentNo}/lineId=${fix.lineId}/${row.quantity}`,
      );
    }
    if (
      !decimalEq(row.unitPrice, fix.oldUnitCost) &&
      !decimalEq(row.unitPrice, fix.confirmedUnitCost)
    ) {
      blockers.push(
        `待修复明细单价既不是旧值 ${fix.oldUnitCost} 也不是确认值 ${fix.confirmedUnitCost}: ${fix.documentNo}/lineId=${fix.lineId}/${row.unitPrice}`,
      );
    }
  }

  return blockers;
}

async function applyBusinessFactFixes(
  connection: MigrationConnectionLike,
): Promise<void> {
  await connection.query(
    `
      UPDATE stock_in_order
      SET
        biz_date = ?,
        updated_by = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE document_no = ?
    `,
    [CONFIRMED_STOCK_IN_BIZ_DATE, UPDATED_BY, STOCK_IN_DOCUMENT_NO],
  );

  for (const fix of COST_LINE_FIXES) {
    await connection.query(
      `
        UPDATE workshop_material_order_line
        SET
          unit_price = ?,
          amount = ROUND(quantity * ?, 2),
          cost_unit_price = ?,
          cost_amount = ROUND(quantity * ?, 2),
          updated_by = ?,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `,
      [
        fix.confirmedUnitCost,
        fix.confirmedUnitCost,
        fix.confirmedUnitCost,
        fix.confirmedUnitCost,
        UPDATED_BY,
        fix.lineId,
      ],
    );
  }

  const affectedOrderIds = await connection.query<Array<{ orderId: number }>>(
    `
      SELECT DISTINCT order_id AS orderId
      FROM workshop_material_order_line
      WHERE id IN (${COST_LINE_FIXES.map(() => "?").join(", ")})
      ORDER BY order_id
    `,
    COST_LINE_FIXES.map((fix) => fix.lineId),
  );

  for (const row of affectedOrderIds) {
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
      [row.orderId, row.orderId, UPDATED_BY, row.orderId],
    );
  }
}

async function deleteYf57InventoryFacts(connection: MigrationConnectionLike) {
  const sourceUsageResult = await connection.query<QueryResultWithInsertId>(
    `
      DELETE u
      FROM inventory_source_usage u
      LEFT JOIN inventory_log source_log ON source_log.id = u.source_log_id
      WHERE u.material_id = ?
         OR source_log.material_id = ?
    `,
    [MATERIAL_ID, MATERIAL_ID],
  );

  const logResult = await connection.query<QueryResultWithInsertId>(
    `DELETE FROM inventory_log WHERE material_id = ?`,
    [MATERIAL_ID],
  );

  const balanceResult = await connection.query<QueryResultWithInsertId>(
    `DELETE FROM inventory_balance WHERE material_id = ?`,
    [MATERIAL_ID],
  );

  return {
    deletedSourceUsages: Number(
      (sourceUsageResult as { affectedRows?: number }).affectedRows ?? 0,
    ),
    deletedLogs: Number(
      (logResult as { affectedRows?: number }).affectedRows ?? 0,
    ),
    deletedBalances: Number(
      (balanceResult as { affectedRows?: number }).affectedRows ?? 0,
    ),
  };
}

async function insertBalanceRow(
  connection: MigrationConnectionLike,
  balance: PlannedBalanceRow,
): Promise<number> {
  const result = await connection.query<QueryResultWithInsertId>(
    `
      INSERT INTO inventory_balance (
        material_id, stock_scope_id, quantity_on_hand,
        row_version, created_by, created_at, updated_by, updated_at
      )
      VALUES (?, ?, ?, 0, 'manual-yf57-replay', NOW(), 'manual-yf57-replay', NOW())
      ON DUPLICATE KEY UPDATE
        quantity_on_hand = VALUES(quantity_on_hand),
        row_version = row_version + 1,
        updated_by = VALUES(updated_by),
        updated_at = NOW(),
        id = LAST_INSERT_ID(id)
    `,
    [balance.materialId, balance.stockScopeId, balance.quantityOnHand],
  );

  const insertId = Number(result.insertId ?? 0);
  if (!Number.isFinite(insertId) || insertId <= 0) {
    throw new Error(
      `Failed to insert inventory_balance for material=${balance.materialId}, stockScope=${balance.stockScopeId}`,
    );
  }
  return insertId;
}

async function insertLogRow(
  connection: MigrationConnectionLike,
  balanceId: number,
  log: PlannedLogInsert,
): Promise<number> {
  const result = await connection.query<QueryResultWithInsertId>(
    `
      INSERT INTO inventory_log (
        balance_id, material_id, stock_scope_id, workshop_id, project_target_id, biz_date,
        direction, operation_type, business_module, business_document_type,
        business_document_id, business_document_number,
        business_document_line_id, change_qty, before_qty, after_qty,
        unit_cost, cost_amount, operator_id, occurred_at, idempotency_key, note
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        id = LAST_INSERT_ID(id),
        balance_id = VALUES(balance_id),
        stock_scope_id = VALUES(stock_scope_id),
        project_target_id = VALUES(project_target_id),
        unit_cost = VALUES(unit_cost),
        cost_amount = VALUES(cost_amount),
        note = VALUES(note)
    `,
    [
      balanceId,
      log.materialId,
      log.stockScopeId,
      log.workshopId,
      log.projectTargetId,
      log.bizDate,
      log.direction,
      log.operationType,
      log.businessModule,
      log.businessDocumentType,
      log.businessDocumentId,
      log.businessDocumentNumber,
      log.businessDocumentLineId,
      log.changeQty,
      log.beforeQty,
      log.afterQty,
      log.unitCost,
      log.costAmount,
      log.operatorId,
      log.occurredAt,
      log.idempotencyKey,
      log.note,
    ],
  );

  const insertId = Number(result.insertId ?? 0);
  if (!Number.isFinite(insertId) || insertId <= 0) {
    throw new Error(`Failed to insert inventory_log: ${log.idempotencyKey}`);
  }
  return insertId;
}

async function insertSourceUsageRow(
  connection: MigrationConnectionLike,
  usage: PlannedSourceUsageInsert,
  sourceLogId: number,
): Promise<void> {
  await connection.query(
    `
      INSERT INTO inventory_source_usage (
        material_id, source_log_id, consumer_document_type,
        consumer_document_id, consumer_line_id, allocated_qty, released_qty,
        status, created_by, created_at, updated_by, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'manual-yf57-replay', NOW(), 'manual-yf57-replay', NOW())
      ON DUPLICATE KEY UPDATE
        allocated_qty = VALUES(allocated_qty),
        released_qty = VALUES(released_qty),
        status = VALUES(status),
        updated_by = VALUES(updated_by),
        updated_at = NOW()
    `,
    [
      usage.materialId,
      sourceLogId,
      usage.consumerDocumentType,
      usage.consumerDocumentId,
      usage.consumerLineId,
      usage.allocatedQty,
      usage.releasedQty,
      usage.status,
    ],
  );
}

async function rebuildYf57InventoryFacts(connection: MigrationConnectionLike) {
  const replayInput = await readInventoryReplayInput(connection);
  const plan = buildInventoryReplayPlan(replayInput.events, {
    coverageGaps: replayInput.coverageGaps,
  });
  const yf57Blockers = filterYf57Blockers(plan.blockers);

  if (yf57Blockers.length > 0) {
    throw new Error(
      `Refusing targeted replay because yf57 still has blocker(s): ${yf57Blockers
        .map((blocker) => blocker.reason)
        .join(", ")}`,
    );
  }

  const plannedBalances = plan.plannedBalances.filter(
    (balance) => balance.materialId === MATERIAL_ID,
  );
  const plannedLogs = plan.plannedLogs.filter(
    (log) => log.materialId === MATERIAL_ID,
  );
  const plannedSourceUsages = plan.plannedSourceUsages.filter(
    (usage) => usage.materialId === MATERIAL_ID,
  );
  const cleanupResult = await deleteYf57InventoryFacts(connection);

  const balanceIdMap = new Map<string, number>();
  for (const balance of plannedBalances) {
    const balanceId = await insertBalanceRow(connection, balance);
    balanceIdMap.set(
      `${balance.materialId}::${balance.stockScopeId}`,
      balanceId,
    );
  }

  const logIdByIdempotencyKey = new Map<string, number>();
  for (const log of plannedLogs) {
    const balanceKey = `${log.materialId}::${log.stockScopeId}`;
    const balanceId = balanceIdMap.get(balanceKey);
    if (!balanceId) {
      throw new Error(`Missing planned balance for ${balanceKey}.`);
    }
    const logId = await insertLogRow(connection, balanceId, log);
    logIdByIdempotencyKey.set(log.idempotencyKey, logId);
  }

  for (const usage of plannedSourceUsages) {
    const sourceLogId = logIdByIdempotencyKey.get(
      usage.sourceLogIdempotencyKey,
    );
    if (!sourceLogId) {
      throw new Error(
        `Missing source log for usage ${usage.sourceLogIdempotencyKey}.`,
      );
    }
    await insertSourceUsageRow(connection, usage, sourceLogId);
  }

  return {
    cleanupResult,
    plannedBalances: plannedBalances.length,
    plannedLogs: plannedLogs.length,
    plannedSourceUsages: plannedSourceUsages.length,
    remainingGlobalBlockers: plan.blockers.length,
    remainingGlobalBlockerCounts: countBlockers(plan.blockers),
  };
}

function countBlockers(blockers: readonly InventoryReplayBlocker[]) {
  const counts = new Map<string, number>();
  for (const blocker of blockers) {
    counts.set(blocker.reason, (counts.get(blocker.reason) ?? 0) + 1);
  }
  return Object.fromEntries(
    [...counts.entries()].sort(([left], [right]) => left.localeCompare(right)),
  );
}

async function executeRepair(connection: MigrationConnectionLike) {
  await connection.beginTransaction();
  try {
    await applyBusinessFactFixes(connection);
    const rebuildResult = await rebuildYf57InventoryFacts(connection);
    await connection.commit();
    return rebuildResult;
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
      const before = await readContext(connection);
      const blockers = validateContext({
        stockIn: before.stockIn,
        pickLine: before.pickLine,
        costLineFixRows: before.costLineFixes,
      });

      if (execute && blockers.length > 0) {
        throw new Error(`Refusing to execute: ${blockers.join("; ")}`);
      }

      const executeResult = execute ? await executeRepair(connection) : null;
      const after = execute ? await readContext(connection) : null;
      const report = {
        generatedAt: new Date().toISOString(),
        mode: execute ? "execute" : "dry-run",
        targetDatabase,
        updatedBy: UPDATED_BY,
        confirmedBusinessFact:
          "YS20260313007/yf57 的业务日期应早于 2026-03-11 的 LL20260311004；后续 4 条 yf57 领料实际来源为 YS20260323003 的 6.23 成本层，不是 6.60。",
        expected: {
          materialCode: MATERIAL_CODE,
          materialId: MATERIAL_ID,
          stockInDocumentNo: STOCK_IN_DOCUMENT_NO,
          oldStockInBizDate: OLD_STOCK_IN_BIZ_DATE,
          confirmedStockInBizDate: CONFIRMED_STOCK_IN_BIZ_DATE,
          pickDocumentNo: PICK_DOCUMENT_NO,
          pickBizDate: PICK_BIZ_DATE,
          costLineFixes: COST_LINE_FIXES,
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
      if (after) {
        console.log(
          `After targeted replay: yf57ReplayBlockers=${after.yf57ReplayBlockers.length}, globalReplayBlockers=${after.replayBlockers.length}`,
        );
      }
    });
  } finally {
    await closePools(pool);
  }
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
