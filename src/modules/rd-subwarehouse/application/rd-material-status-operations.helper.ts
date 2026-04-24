import { BadRequestException, NotFoundException } from "@nestjs/common";
import { Prisma, RdMaterialStatus, RdMaterialStatusEventType } from "../../../../generated/prisma/client";
import {
  type DbClient,
  type ReverseBySourceDocumentInput,
  type DecimalLike,
  type ReverseHistoryInput,
  type TransferStatusQuantityInput,
  RD_PROCUREMENT_REQUEST_DOCUMENT_TYPE,
  assertBucketTotalWithinLineQuantity,
  buildStatusProjection,
  cloneLedgerBuckets,
  ensureStatusLedger,
  STATUS_FIELD_MAP,
  sumBuckets,
  toLedgerUpdateData,
  toPositiveDecimal,
} from "./rd-material-status-core.helper";

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
    throw new BadRequestException(
      `RD 状态数量不足，无法推进到 ${input.toStatus}: 还缺 ${remaining.toFixed(6)}`,
    );
  }
  await db.rdMaterialStatusLedger.update({
    where: { id: ledger.id },
    data: toLedgerUpdateData(nextValues, input.operatorId),
  });
  for (const historyInput of historyInputs) {
    await db.rdMaterialStatusHistory.create({ data: historyInput });
  }
  return historyInputs;
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
    throw new BadRequestException(
      `RD 状态回滚失败：${history.toStatus} 当前数量不足 ${history.quantity.toFixed(6)}`,
    );
  }
  nextValues[toField] = nextValues[toField].sub(history.quantity);
  nextValues[fromField] = nextValues[fromField].add(history.quantity);
  await db.rdMaterialStatusLedger.update({
    where: { id: ledger.id },
    data: toLedgerUpdateData(nextValues, input.operatorId),
  });
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

