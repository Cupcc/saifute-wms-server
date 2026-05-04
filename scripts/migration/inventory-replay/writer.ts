import type { MigrationConnectionLike, QueryResultWithInsertId } from "../db";
import type {
  InventoryReplayExecutionResult,
  InventoryReplayPlan,
  PlannedLogInsert,
  PlannedSourceUsageInsert,
} from "./types";

async function cleanupExistingInventoryData(
  connection: MigrationConnectionLike,
): Promise<{
  deletedSourceUsages: number;
  deletedLogs: number;
  deletedBalances: number;
}> {
  const sourceUsageResult = await connection.query<QueryResultWithInsertId>(
    `
      DELETE u
      FROM inventory_source_usage u
      LEFT JOIN inventory_log l ON l.id = u.source_log_id
      WHERE l.id IS NULL
    `,
  );
  const deletedSourceUsages = Number(
    (sourceUsageResult as { affectedRows?: number }).affectedRows ?? 0,
  );

  const logResult = await connection.query<QueryResultWithInsertId>(
    `DELETE FROM inventory_log`,
  );
  const deletedLogs = Number(
    (logResult as { affectedRows?: number }).affectedRows ?? 0,
  );

  const balanceResult = await connection.query<QueryResultWithInsertId>(
    `DELETE FROM inventory_balance`,
  );
  const deletedBalances = Number(
    (balanceResult as { affectedRows?: number }).affectedRows ?? 0,
  );

  return { deletedSourceUsages, deletedLogs, deletedBalances };
}

async function insertBalanceRow(
  connection: MigrationConnectionLike,
  materialId: number,
  stockScopeId: number,
  quantityOnHand: string,
): Promise<number> {
  const result = await connection.query<QueryResultWithInsertId>(
    `
      INSERT INTO inventory_balance (
        material_id, stock_scope_id, quantity_on_hand,
        row_version, created_by, created_at, updated_by, updated_at
      )
      VALUES (?, ?, ?, 0, 'migration-replay', NOW(), 'migration-replay', NOW())
      ON DUPLICATE KEY UPDATE
        quantity_on_hand = VALUES(quantity_on_hand),
        row_version = row_version + 1,
        updated_by = VALUES(updated_by),
        updated_at = NOW(),
        id = LAST_INSERT_ID(id)
    `,
    [materialId, stockScopeId, quantityOnHand],
  );
  const insertId = Number(result?.insertId ?? 0);
  if (!Number.isFinite(insertId) || insertId <= 0) {
    throw new Error(
      `Failed to insert/update inventory_balance for material=${materialId}, stockScope=${stockScopeId}`,
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
        balance_id, material_id, stock_scope_id, workshop_id, biz_date,
        direction, operation_type, business_module, business_document_type,
        business_document_id, business_document_number,
        business_document_line_id, change_qty, before_qty, after_qty,
        unit_cost, cost_amount, operator_id, occurred_at, idempotency_key, note
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        id = LAST_INSERT_ID(id),
        balance_id = VALUES(balance_id),
        stock_scope_id = VALUES(stock_scope_id),
        unit_cost = VALUES(unit_cost),
        cost_amount = VALUES(cost_amount),
        note = VALUES(note)
    `,
    [
      balanceId,
      log.materialId,
      log.stockScopeId,
      log.workshopId,
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

  const insertId = Number(result?.insertId ?? 0);
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
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'migration-replay', NOW(), 'migration-replay', NOW())
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

export async function executeInventoryReplayPlan(
  connection: MigrationConnectionLike,
  plan: InventoryReplayPlan,
): Promise<InventoryReplayExecutionResult> {
  await connection.beginTransaction();

  try {
    const cleanupResult = await cleanupExistingInventoryData(connection);

    const balanceIdMap = new Map<string, number>();
    const logIdByIdempotencyKey = new Map<string, number>();
    let insertedBalances = 0;

    for (const balance of plan.plannedBalances) {
      const balanceId = await insertBalanceRow(
        connection,
        balance.materialId,
        balance.stockScopeId,
        balance.quantityOnHand,
      );
      balanceIdMap.set(
        `${balance.materialId}::${balance.stockScopeId}`,
        balanceId,
      );
      insertedBalances += 1;
    }

    let insertedLogs = 0;

    for (const log of plan.plannedLogs) {
      const key = `${log.materialId}::${log.stockScopeId}`;
      let balanceId = balanceIdMap.get(key);

      if (balanceId === undefined) {
        balanceId = await insertBalanceRow(
          connection,
          log.materialId,
          log.stockScopeId,
          "0.000000",
        );
        balanceIdMap.set(key, balanceId);
        insertedBalances += 1;
      }

      const logId = await insertLogRow(connection, balanceId, log);
      logIdByIdempotencyKey.set(log.idempotencyKey, logId);
      insertedLogs += 1;
    }

    let insertedSourceUsages = 0;
    for (const usage of plan.plannedSourceUsages) {
      const sourceLogId = logIdByIdempotencyKey.get(
        usage.sourceLogIdempotencyKey,
      );
      if (!sourceLogId) {
        throw new Error(
          `Missing source log for usage: ${usage.sourceLogIdempotencyKey}`,
        );
      }
      await insertSourceUsageRow(connection, usage, sourceLogId);
      insertedSourceUsages += 1;
    }

    await connection.commit();

    return {
      ...cleanupResult,
      insertedBalances,
      insertedLogs,
      insertedSourceUsages,
    };
  } catch (error) {
    await connection.rollback();
    throw error;
  }
}
