import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from "@nestjs/common";
import {
  Prisma,
  RdMaterialStatus,
  RdMaterialStatusEventType,
} from "../../../../generated/prisma/client";
import {
  cloneLedgerBuckets,
  type DbClient,
  type DecimalLike,
  ensureStatusLedger,
  type LedgerBucketValues,
  RD_MATERIAL_STATUS_LABELS,
  RD_PROCUREMENT_REQUEST_DOCUMENT_TYPE,
  type ReverseBySourceDocumentInput,
  type ReverseHistoryInput,
  STATUS_FIELD_MAP,
  type TransferStatusQuantityInput,
  toLedgerUpdateData,
  toPositiveDecimal,
} from "./rd-material-status-core.helper";

async function resolveRequestLineMaterialLabel(
  requestLineId: number,
  db: DbClient,
) {
  const line = await db.rdProcurementRequestLine.findUnique({
    where: { id: requestLineId },
    select: { materialCodeSnapshot: true, materialNameSnapshot: true },
  });
  return line?.materialNameSnapshot || line?.materialCodeSnapshot || null;
}

/**
 * Optimistic-concurrency write for the status ledger: the update only lands
 * when every previously-read bucket value is still current, otherwise the
 * read-modify-write raced a concurrent apply/reverse and must be retried.
 */
async function updateLedgerGuarded(
  ledger: Awaited<ReturnType<typeof ensureStatusLedger>>,
  nextValues: LedgerBucketValues,
  operatorId: string | undefined,
  db: DbClient,
) {
  const result = await db.rdMaterialStatusLedger.updateMany({
    where: {
      id: ledger.id,
      pendingQty: ledger.pendingQty,
      inProcurementQty: ledger.inProcurementQty,
      canceledQty: ledger.canceledQty,
      acceptedQty: ledger.acceptedQty,
      handedOffQty: ledger.handedOffQty,
      scrappedQty: ledger.scrappedQty,
      returnedQty: ledger.returnedQty,
    },
    data: toLedgerUpdateData(nextValues, operatorId),
  });
  if (result.count !== 1) {
    throw new ConflictException("RD 状态台账并发冲突，请重试");
  }
}

function buildHistoryCreateInput(
  input: TransferStatusQuantityInput,
  fromStatus: RdMaterialStatus,
  quantity: Prisma.Decimal,
): Prisma.RdMaterialStatusHistoryUncheckedCreateInput {
  return {
    requestLineId: input.requestLineId,
    eventType: input.eventType,
    fromStatus,
    toStatus: input.toStatus,
    quantity,
    sourceDocumentType: input.sourceDocumentType ?? null,
    sourceDocumentId: input.sourceDocumentId ?? null,
    sourceDocumentLineId: input.sourceDocumentLineId ?? null,
    sourceDocumentNumber: input.sourceDocumentNumber ?? null,
    referenceNo: input.referenceNo ?? null,
    reason: input.reason ?? null,
    note: input.note ?? null,
    relatedInventoryLogId: input.relatedInventoryLogId ?? null,
    createdBy: input.operatorId,
  };
}
export async function initializeRequestStatusTruth(
  params: {
    requestId?: number;
    documentNo: string;
    lines: Array<{ id: number; quantity: DecimalLike }>;
    operatorId?: string;
  },
  db: DbClient,
) {
  for (const line of params.lines) {
    const quantity = toPositiveDecimal(line.quantity);
    await db.rdMaterialStatusLedger.create({
      data: {
        requestLineId: line.id,
        pendingQty: quantity,
        inProcurementQty: 0,
        canceledQty: 0,
        acceptedQty: 0,
        handedOffQty: 0,
        scrappedQty: 0,
        returnedQty: 0,
        lastEventAt: new Date(),
        createdBy: params.operatorId,
        updatedBy: params.operatorId,
      },
    });
    await db.rdMaterialStatusHistory.create({
      data: {
        requestLineId: line.id,
        eventType: RdMaterialStatusEventType.REQUEST_CREATED,
        fromStatus: null,
        toStatus: RdMaterialStatus.PENDING_PROCUREMENT,
        quantity,
        sourceDocumentType: RD_PROCUREMENT_REQUEST_DOCUMENT_TYPE,
        sourceDocumentId: params.requestId ?? null,
        sourceDocumentLineId: line.id,
        sourceDocumentNumber: params.documentNo,
        createdBy: params.operatorId,
      },
    });
  }
}
export async function transferStatusQuantity(
  input: TransferStatusQuantityInput,
  db: DbClient,
) {
  const quantity = toPositiveDecimal(input.quantity);
  const ledger = await ensureStatusLedger(
    input.requestLineId,
    input.operatorId,
    db,
  );
  const nextValues = cloneLedgerBuckets(ledger);
  const targetField = STATUS_FIELD_MAP[input.toStatus];
  let remaining = quantity;
  const historyInputs: Prisma.RdMaterialStatusHistoryUncheckedCreateInput[] =
    [];
  for (const fromStatus of input.fromStatuses) {
    const sourceField = STATUS_FIELD_MAP[fromStatus];
    const availableQty = nextValues[sourceField];
    if (availableQty.lte(0)) {
      continue;
    }
    const moveQty = availableQty.gte(remaining) ? remaining : availableQty;
    nextValues[sourceField] = nextValues[sourceField].sub(moveQty);
    nextValues[targetField] = nextValues[targetField].add(moveQty);
    historyInputs.push(buildHistoryCreateInput(input, fromStatus, moveQty));
    remaining = remaining.sub(moveQty);
    if (remaining.eq(0)) {
      break;
    }
  }
  if (remaining.gt(0)) {
    const materialLabel = await resolveRequestLineMaterialLabel(
      input.requestLineId,
      db,
    );
    throw new BadRequestException(
      `${materialLabel ? `物料 ${materialLabel} ` : ""}可转为「${RD_MATERIAL_STATUS_LABELS[input.toStatus]}」的数量不足，还缺 ${remaining.toString()}`,
    );
  }
  await updateLedgerGuarded(ledger, nextValues, input.operatorId, db);
  const createdHistories = [];
  for (const historyInput of historyInputs) {
    createdHistories.push(
      await db.rdMaterialStatusHistory.create({ data: historyInput }),
    );
  }
  return createdHistories;
}
export async function reverseStatusHistory(
  input: ReverseHistoryInput,
  db: DbClient,
) {
  const history = await db.rdMaterialStatusHistory.findUnique({
    where: { id: input.historyId },
  });
  if (!history) {
    throw new NotFoundException(`RD 状态历史不存在: ${input.historyId}`);
  }
  if (history.reversalOfHistoryId) {
    throw new BadRequestException("不能重复回滚回滚记录");
  }
  if (history.isReversed) {
    return null;
  }
  if (!history.fromStatus) {
    throw new BadRequestException("当前状态事件不支持直接回滚");
  }
  const ledger = await ensureStatusLedger(
    history.requestLineId,
    input.operatorId,
    db,
  );
  const nextValues = cloneLedgerBuckets(ledger);
  const fromField = STATUS_FIELD_MAP[history.fromStatus];
  const toField = STATUS_FIELD_MAP[history.toStatus];
  const currentToQty = nextValues[toField];
  if (currentToQty.lt(history.quantity)) {
    const materialLabel = await resolveRequestLineMaterialLabel(
      history.requestLineId,
      db,
    );
    throw new BadRequestException(
      `${materialLabel ? `物料 ${materialLabel} ` : ""}状态回滚失败：「${RD_MATERIAL_STATUS_LABELS[history.toStatus]}」当前数量不足，无法回退 ${history.quantity.toString()}`,
    );
  }
  nextValues[toField] = nextValues[toField].sub(history.quantity);
  nextValues[fromField] = nextValues[fromField].add(history.quantity);
  await updateLedgerGuarded(ledger, nextValues, input.operatorId, db);
  await db.rdMaterialStatusHistory.update({
    where: { id: history.id },
    data: {
      isReversed: true,
      reversedBy: input.operatorId,
      reversedAt: new Date(),
    },
  });
  return db.rdMaterialStatusHistory.create({
    data: {
      requestLineId: history.requestLineId,
      eventType: RdMaterialStatusEventType.FACT_ROLLBACK,
      fromStatus: history.toStatus,
      toStatus: history.fromStatus,
      quantity: history.quantity,
      sourceDocumentType:
        input.sourceDocumentType ?? history.sourceDocumentType,
      sourceDocumentId: input.sourceDocumentId ?? history.sourceDocumentId,
      sourceDocumentLineId:
        input.sourceDocumentLineId ?? history.sourceDocumentLineId,
      sourceDocumentNumber:
        input.sourceDocumentNumber ?? history.sourceDocumentNumber,
      referenceNo: input.referenceNo ?? history.referenceNo,
      reason: input.reason ?? history.reason,
      note: input.note ?? `回滚状态事件 ${history.id}`,
      relatedInventoryLogId:
        input.relatedInventoryLogId ?? history.relatedInventoryLogId,
      reversalOfHistoryId: history.id,
      createdBy: input.operatorId,
    },
  });
}
export async function reverseStatusHistoriesBySourceDocument(
  input: ReverseBySourceDocumentInput,
  db: DbClient,
) {
  const histories = await db.rdMaterialStatusHistory.findMany({
    where: {
      eventType: input.eventType,
      sourceDocumentType: input.sourceDocumentType,
      sourceDocumentId: input.sourceDocumentId,
      reversalOfHistoryId: null,
      isReversed: false,
    },
    orderBy: [{ id: "desc" }],
  });
  for (const history of histories) {
    await reverseStatusHistory(
      {
        historyId: history.id,
        sourceDocumentType: input.sourceDocumentType,
        sourceDocumentId: input.sourceDocumentId,
        sourceDocumentLineId: history.sourceDocumentLineId,
        sourceDocumentNumber:
          input.sourceDocumentNumber ?? history.sourceDocumentNumber,
        referenceNo: input.referenceNo ?? history.referenceNo,
        reason: input.reason ?? history.reason,
        note: input.note,
        relatedInventoryLogId: input.relatedInventoryLogId,
        operatorId: input.operatorId,
      },
      db,
    );
  }
  return histories.length;
}
