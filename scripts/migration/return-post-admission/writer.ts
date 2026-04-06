import type { MigrationConnectionLike, QueryResultWithInsertId } from "../db";
import type {
  AuditDocumentInsert,
  DocumentLineRelationInsert,
  DocumentRelationInsert,
  InventoryLogInsert,
  InventorySourceUsageInsert,
  PostAdmissionExecutionResult,
  PostAdmissionMigrationPlan,
  SourceBackfillRecord,
  StaleClearRecord,
} from "./types";

async function applySourceBackfill(
  connection: MigrationConnectionLike,
  record: SourceBackfillRecord,
  documentType: "CustomerStockOrder" | "WorkshopMaterialOrder",
): Promise<void> {
  const targetTable =
    documentType === "CustomerStockOrder"
      ? "customer_stock_order_line"
      : "workshop_material_order_line";

  await connection.query(
    `
      UPDATE ${targetTable}
      SET
        sourceDocumentType = ?,
        sourceDocumentId = ?,
        sourceDocumentLineId = ?
      WHERE id = ?
        AND sourceDocumentId IS NULL
    `,
    [
      record.sourceDocumentType,
      record.sourceDocumentId,
      record.sourceDocumentLineId,
      record.lineId,
    ],
  );
}

async function upsertDocumentRelation(
  connection: MigrationConnectionLike,
  record: DocumentRelationInsert,
): Promise<void> {
  await connection.query(
    `
      INSERT INTO document_relation (
        relationType,
        upstreamFamily,
        upstreamDocumentType,
        upstreamDocumentId,
        downstreamFamily,
        downstreamDocumentType,
        downstreamDocumentId,
        isActive,
        updatedAt
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      ON DUPLICATE KEY UPDATE
        isActive = VALUES(isActive),
        updatedAt = CURRENT_TIMESTAMP
    `,
    [
      record.relationType,
      record.upstreamFamily,
      record.upstreamDocumentType,
      record.upstreamDocumentId,
      record.downstreamFamily,
      record.downstreamDocumentType,
      record.downstreamDocumentId,
      record.isActive ? 1 : 0,
    ],
  );
}

async function upsertDocumentLineRelation(
  connection: MigrationConnectionLike,
  record: DocumentLineRelationInsert,
): Promise<void> {
  await connection.query(
    `
      INSERT INTO document_line_relation (
        relationType,
        upstreamFamily,
        upstreamDocumentType,
        upstreamDocumentId,
        upstreamLineId,
        downstreamFamily,
        downstreamDocumentType,
        downstreamDocumentId,
        downstreamLineId,
        linkedQty,
        updatedAt
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      ON DUPLICATE KEY UPDATE
        linkedQty = VALUES(linkedQty),
        updatedAt = CURRENT_TIMESTAMP
    `,
    [
      record.relationType,
      record.upstreamFamily,
      record.upstreamDocumentType,
      record.upstreamDocumentId,
      record.upstreamLineId,
      record.downstreamFamily,
      record.downstreamDocumentType,
      record.downstreamDocumentId,
      record.downstreamLineId,
      record.linkedQty,
    ],
  );
}

async function clearInventoryTables(
  connection: MigrationConnectionLike,
): Promise<void> {
  await connection.query(`DELETE FROM inventory_source_usage`);
  await connection.query(`DELETE FROM inventory_log`);
  await connection.query(`DELETE FROM inventory_balance`);
}

async function clearAuditDocuments(
  connection: MigrationConnectionLike,
): Promise<void> {
  await connection.query(`DELETE FROM audit_document`);
}

async function clearDocumentRelations(
  connection: MigrationConnectionLike,
): Promise<void> {
  await connection.query(`DELETE FROM document_line_relation`);
  await connection.query(`DELETE FROM document_relation`);
}

async function clearStaleReturnLineSourceFields(
  connection: MigrationConnectionLike,
  records: StaleClearRecord[],
): Promise<number> {
  let cleared = 0;

  for (const record of records) {
    await connection.query(
      `UPDATE ${record.documentTable}
       SET sourceDocumentType = NULL, sourceDocumentId = NULL, sourceDocumentLineId = NULL
       WHERE id = ?`,
      [record.lineId],
    );
    cleared += 1;
  }

  return cleared;
}

async function upsertInventoryBalance(
  connection: MigrationConnectionLike,
  materialId: number,
  workshopId: number,
): Promise<number> {
  const result =
    (await connection.query<QueryResultWithInsertId>(
      `
        INSERT INTO inventory_balance (
          materialId,
          workshopId,
          quantityOnHand,
          rowVersion,
          updatedAt
        ) VALUES (?, ?, 0, 0, CURRENT_TIMESTAMP)
        ON DUPLICATE KEY UPDATE
          id = LAST_INSERT_ID(id)
      `,
      [materialId, workshopId],
    )) ?? {};

  return Number(result.insertId ?? 0);
}

async function updateInventoryBalance(
  connection: MigrationConnectionLike,
  balanceId: number,
  quantityOnHand: string,
): Promise<void> {
  await connection.query(
    `UPDATE inventory_balance SET quantityOnHand = ?, rowVersion = rowVersion + 1, updatedAt = CURRENT_TIMESTAMP WHERE id = ?`,
    [quantityOnHand, balanceId],
  );
}

async function insertInventoryLog(
  connection: MigrationConnectionLike,
  balanceId: number,
  beforeQty: string,
  afterQty: string,
  log: InventoryLogInsert,
  reversalOfLogId: number | null,
): Promise<number> {
  const result =
    (await connection.query<QueryResultWithInsertId>(
      `
        INSERT INTO inventory_log (
          balanceId,
          materialId,
          workshopId,
          direction,
          operationType,
          businessModule,
          businessDocumentType,
          businessDocumentId,
          businessDocumentNumber,
          businessDocumentLineId,
          changeQty,
          beforeQty,
          afterQty,
          operatorId,
          occurredAt,
          reversalOfLogId,
          idempotencyKey,
          note
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NOW(), ?, ?, ?)
        ON DUPLICATE KEY UPDATE
          id = LAST_INSERT_ID(id)
      `,
      [
        balanceId,
        log.materialId,
        log.workshopId,
        log.direction,
        log.operationType,
        log.businessModule,
        log.businessDocumentType,
        log.businessDocumentId,
        log.businessDocumentNumber,
        log.businessDocumentLineId,
        log.changeQty,
        beforeQty,
        afterQty,
        reversalOfLogId,
        log.idempotencyKey,
        log.note,
      ],
    )) ?? {};

  return Number(result.insertId ?? 0);
}

async function upsertInventorySourceUsage(
  connection: MigrationConnectionLike,
  usage: InventorySourceUsageInsert,
  sourceLogId: number,
): Promise<void> {
  await connection.query(
    `
      INSERT INTO inventory_source_usage (
        materialId,
        sourceLogId,
        consumerDocumentType,
        consumerDocumentId,
        consumerLineId,
        allocatedQty,
        releasedQty,
        status,
        updatedAt
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      ON DUPLICATE KEY UPDATE
        allocatedQty = VALUES(allocatedQty),
        releasedQty = VALUES(releasedQty),
        status = VALUES(status),
        updatedAt = CURRENT_TIMESTAMP
    `,
    [
      usage.materialId,
      sourceLogId,
      usage.consumerDocumentType,
      usage.consumerDocumentId,
      usage.consumerLineId,
      usage.allocatedQty,
      usage.allocatedQty,
      usage.status,
    ],
  );
}

async function upsertAuditDocument(
  connection: MigrationConnectionLike,
  doc: AuditDocumentInsert,
): Promise<void> {
  await connection.query(
    `
      INSERT INTO audit_document (
        documentFamily,
        documentType,
        documentId,
        documentNumber,
        auditStatus,
        updatedAt
      ) VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      ON DUPLICATE KEY UPDATE
        documentFamily = VALUES(documentFamily),
        documentNumber = VALUES(documentNumber),
        auditStatus = VALUES(auditStatus),
        updatedAt = CURRENT_TIMESTAMP
    `,
    [
      doc.documentFamily,
      doc.documentType,
      doc.documentId,
      doc.documentNumber,
      doc.auditStatus,
    ],
  );
}

async function getInventoryLogIdByIdempotencyKey(
  connection: MigrationConnectionLike,
  idempotencyKey: string,
): Promise<number | null> {
  const rows = await connection.query<Array<{ id: number }>>(
    `SELECT id FROM inventory_log WHERE idempotencyKey = ?`,
    [idempotencyKey],
  );

  return rows[0]?.id ?? null;
}

async function getInventoryBalanceId(
  connection: MigrationConnectionLike,
  materialId: number,
  workshopId: number,
): Promise<number | null> {
  const rows = await connection.query<
    Array<{ id: number; quantityOnHand: string }>
  >(
    `SELECT id, quantityOnHand FROM inventory_balance WHERE materialId = ? AND workshopId = ?`,
    [materialId, workshopId],
  );

  return rows[0]?.id ?? null;
}

async function getInventoryBalanceQty(
  connection: MigrationConnectionLike,
  balanceId: number,
): Promise<string> {
  const rows = await connection.query<Array<{ quantityOnHand: string }>>(
    `SELECT quantityOnHand FROM inventory_balance WHERE id = ?`,
    [balanceId],
  );

  return rows[0]?.quantityOnHand ?? "0.000000";
}

function parseDecimalBigInt(s: string): bigint {
  const trimmed = s.trim();
  const isNegative = trimmed.startsWith("-");
  const abs = isNegative ? trimmed.slice(1) : trimmed;
  const dotIndex = abs.indexOf(".");
  const intPart = dotIndex === -1 ? abs : abs.slice(0, dotIndex);
  const fracRaw = dotIndex === -1 ? "" : abs.slice(dotIndex + 1);
  const fracPadded = fracRaw.padEnd(6, "0").slice(0, 6);
  const raw = BigInt(`${intPart}${fracPadded}`);

  return isNegative ? -raw : raw;
}

function formatDecimalBigInt(n: bigint): string {
  const isNeg = n < 0n;
  const abs = isNeg ? -n : n;
  const intPart = abs / 1_000_000n;
  const fracPart = abs % 1_000_000n;

  return `${isNeg ? "-" : ""}${intPart}.${String(fracPart).padStart(6, "0")}`;
}

function addDecimalStrings(a: string, b: string): string {
  return formatDecimalBigInt(parseDecimalBigInt(a) + parseDecimalBigInt(b));
}

function subtractDecimalStrings(a: string, b: string): string {
  return formatDecimalBigInt(parseDecimalBigInt(a) - parseDecimalBigInt(b));
}

export async function executePostAdmissionPlan(
  connection: MigrationConnectionLike,
  plan: PostAdmissionMigrationPlan,
): Promise<PostAdmissionExecutionResult> {
  let staleSourceFieldsCleared = 0;
  let sourceBackfillsApplied = 0;
  let documentRelationsInserted = 0;
  let documentLineRelationsInserted = 0;
  let inventoryBalancesInserted = 0;
  let inventoryLogsInserted = 0;
  let sourceUsageInserted = 0;
  let auditDocumentsInserted = 0;

  await connection.beginTransaction();

  try {
    await clearDocumentRelations(connection);
    await clearInventoryTables(connection);
    await clearAuditDocuments(connection);

    staleSourceFieldsCleared = await clearStaleReturnLineSourceFields(
      connection,
      plan.backfill.staleClearRecords,
    );

    for (const record of plan.backfill.backfillRecords) {
      const docType =
        record.sourceDocumentType === "CustomerStockOrder"
          ? "CustomerStockOrder"
          : "WorkshopMaterialOrder";
      await applySourceBackfill(connection, record, docType);
      sourceBackfillsApplied += 1;
    }

    for (const relation of plan.backfill.documentRelations) {
      await upsertDocumentRelation(connection, relation);
      documentRelationsInserted += 1;
    }

    for (const lineRelation of plan.backfill.documentLineRelations) {
      await upsertDocumentLineRelation(connection, lineRelation);
      documentLineRelationsInserted += 1;
    }

    const balanceIdByKey = new Map<string, number>();
    const logIdByIdempotencyKey = new Map<string, number>();
    const primaryLogIdByIdempotencyKey = new Map<string, number>();

    const firstPassLogs = plan.replay.logInserts.filter((l) => !l.isReversal);
    const reversalLogs = plan.replay.logInserts.filter((l) => l.isReversal);

    for (const log of firstPassLogs) {
      let balanceId = balanceIdByKey.get(log.balanceKey);

      if (balanceId === undefined) {
        balanceId = await upsertInventoryBalance(
          connection,
          log.materialId,
          log.workshopId,
        );

        if (!balanceId || balanceId <= 0) {
          const existingId = await getInventoryBalanceId(
            connection,
            log.materialId,
            log.workshopId,
          );

          if (!existingId) {
            throw new Error(
              `Failed to create or find inventory_balance for materialId=${log.materialId} workshopId=${log.workshopId}`,
            );
          }

          balanceId = existingId;
        }

        balanceIdByKey.set(log.balanceKey, balanceId);
        inventoryBalancesInserted += 1;
      }

      const beforeQty = await getInventoryBalanceQty(connection, balanceId);
      const afterQty =
        log.direction === "IN"
          ? addDecimalStrings(beforeQty, log.changeQty)
          : subtractDecimalStrings(beforeQty, log.changeQty);

      const logId = await insertInventoryLog(
        connection,
        balanceId,
        beforeQty,
        afterQty,
        log,
        null,
      );

      primaryLogIdByIdempotencyKey.set(log.idempotencyKey, logId);
      logIdByIdempotencyKey.set(log.idempotencyKey, logId);
      inventoryLogsInserted += 1;

      if (!log.note?.includes("pre-reversal")) {
        await updateInventoryBalance(connection, balanceId, afterQty);
      }
    }

    for (const log of reversalLogs) {
      const primaryKey = log.primaryIdempotencyKey;

      if (!primaryKey) {
        continue;
      }

      const primaryLogId = primaryLogIdByIdempotencyKey.get(primaryKey);

      if (!primaryLogId) {
        continue;
      }

      let balanceId = balanceIdByKey.get(log.balanceKey);

      if (balanceId === undefined) {
        balanceId = await upsertInventoryBalance(
          connection,
          log.materialId,
          log.workshopId,
        );

        if (!balanceId || balanceId <= 0) {
          const existingId = await getInventoryBalanceId(
            connection,
            log.materialId,
            log.workshopId,
          );

          if (!existingId) {
            throw new Error(
              `Failed to create or find inventory_balance for materialId=${log.materialId} workshopId=${log.workshopId}`,
            );
          }

          balanceId = existingId;
        }

        balanceIdByKey.set(log.balanceKey, balanceId);
        inventoryBalancesInserted += 1;
      }

      const primaryLog = firstPassLogs.find(
        (l) => l.idempotencyKey === primaryKey,
      );

      if (!primaryLog) {
        continue;
      }

      const beforeQty = await getInventoryBalanceQty(connection, balanceId);

      let afterQtyPrimary: string;

      if (primaryLog.direction === "IN") {
        afterQtyPrimary = addDecimalStrings(beforeQty, primaryLog.changeQty);
      } else {
        afterQtyPrimary = subtractDecimalStrings(
          beforeQty,
          primaryLog.changeQty,
        );
      }

      await connection.query(
        `UPDATE inventory_log SET beforeQty = ?, afterQty = ? WHERE id = ?`,
        [beforeQty, afterQtyPrimary, primaryLogId],
      );

      await updateInventoryBalance(connection, balanceId, afterQtyPrimary);

      const reversalBeforeQty = afterQtyPrimary;
      const reversalAfterQty =
        log.direction === "IN"
          ? addDecimalStrings(reversalBeforeQty, log.changeQty)
          : subtractDecimalStrings(reversalBeforeQty, log.changeQty);

      const reversalLogId = await insertInventoryLog(
        connection,
        balanceId,
        reversalBeforeQty,
        reversalAfterQty,
        log,
        primaryLogId,
      );

      logIdByIdempotencyKey.set(log.idempotencyKey, reversalLogId);
      inventoryLogsInserted += 1;

      await updateInventoryBalance(connection, balanceId, reversalAfterQty);
    }

    for (const usage of plan.replay.sourceUsageInserts) {
      let sourceLogId = logIdByIdempotencyKey.get(
        usage.sourceLogIdempotencyKey,
      );

      if (!sourceLogId) {
        sourceLogId =
          (await getInventoryLogIdByIdempotencyKey(
            connection,
            usage.sourceLogIdempotencyKey,
          )) ?? undefined;
      }

      if (!sourceLogId) {
        continue;
      }

      await upsertInventorySourceUsage(connection, usage, sourceLogId);
      sourceUsageInserted += 1;
    }

    for (const doc of plan.audit.auditDocumentInserts) {
      await upsertAuditDocument(connection, doc);
      auditDocumentsInserted += 1;
    }

    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  }

  return {
    staleSourceFieldsCleared,
    sourceBackfillsApplied,
    documentRelationsInserted,
    documentLineRelationsInserted,
    inventoryBalancesInserted,
    inventoryLogsInserted,
    sourceUsageInserted,
    auditDocumentsInserted,
  };
}
