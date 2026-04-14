import { BadRequestException, NotFoundException } from "@nestjs/common";
import {
  Prisma,
  RdMaterialStatus,
  RdMaterialStatusEventType,
  type RdMaterialStatusLedger,
} from "../../../../generated/prisma/client";
import { BusinessDocumentType } from "../../../shared/domain/business-document-type";
import { PrismaService } from "../../../shared/prisma/prisma.service";

type DbClient = Prisma.TransactionClient | PrismaService;
type DecimalLike = Prisma.Decimal | number | string;

export const RD_PROCUREMENT_REQUEST_DOCUMENT_TYPE =
  BusinessDocumentType.RdProcurementRequest;
export const STOCK_IN_ORDER_DOCUMENT_TYPE = BusinessDocumentType.StockInOrder;
export const RD_HANDOFF_ORDER_DOCUMENT_TYPE = BusinessDocumentType.RdHandoffOrder;
export const WORKSHOP_MATERIAL_ORDER_DOCUMENT_TYPE =
  BusinessDocumentType.WorkshopMaterialOrder;

type LedgerStatusField =
  | "pendingQty"
  | "inProcurementQty"
  | "canceledQty"
  | "acceptedQty"
  | "handedOffQty"
  | "scrappedQty"
  | "returnedQty";

type LedgerBucketValues = Record<LedgerStatusField, Prisma.Decimal>;

const ZERO = new Prisma.Decimal(0);

const STATUS_FIELD_MAP: Record<RdMaterialStatus, LedgerStatusField> = {
  [RdMaterialStatus.PENDING_PROCUREMENT]: "pendingQty",
  [RdMaterialStatus.IN_PROCUREMENT]: "inProcurementQty",
  [RdMaterialStatus.CANCELLED]: "canceledQty",
  [RdMaterialStatus.ACCEPTED]: "acceptedQty",
  [RdMaterialStatus.HANDED_OFF]: "handedOffQty",
  [RdMaterialStatus.SCRAPPED]: "scrappedQty",
  [RdMaterialStatus.RETURNED]: "returnedQty",
};

interface StatusDocumentRef {
  sourceDocumentType?: string | null;
  sourceDocumentId?: number | null;
  sourceDocumentLineId?: number | null;
  sourceDocumentNumber?: string | null;
  referenceNo?: string | null;
  reason?: string | null;
  note?: string | null;
  relatedInventoryLogId?: number | null;
  operatorId?: string;
}

interface TransferStatusQuantityInput extends StatusDocumentRef {
  requestLineId: number;
  eventType: RdMaterialStatusEventType;
  toStatus: RdMaterialStatus;
  quantity: DecimalLike;
  fromStatuses: RdMaterialStatus[];
}

interface ReverseHistoryInput extends StatusDocumentRef {
  historyId: number;
}

interface ReverseBySourceDocumentInput extends StatusDocumentRef {
  eventType: RdMaterialStatusEventType;
  sourceDocumentType: string;
  sourceDocumentId: number;
}

interface RequestLineStatusProjection {
  requestLineId: number;
  pendingQty: Prisma.Decimal;
  inProcurementQty: Prisma.Decimal;
  canceledQty: Prisma.Decimal;
  acceptedQty: Prisma.Decimal;
  handedOffQty: Prisma.Decimal;
  scrappedQty: Prisma.Decimal;
  returnedQty: Prisma.Decimal;
  lastEventAt: Date | null;
}

function toDecimal(value: DecimalLike): Prisma.Decimal {
  return value instanceof Prisma.Decimal ? value : new Prisma.Decimal(value);
}

function toPositiveDecimal(value: DecimalLike): Prisma.Decimal {
  const decimal = toDecimal(value);
  if (decimal.lte(0)) {
    throw new BadRequestException("数量必须大于 0");
  }
  return decimal;
}

function cloneLedgerBuckets(
  ledger:
    | Pick<
        RdMaterialStatusLedger,
        | "pendingQty"
        | "inProcurementQty"
        | "canceledQty"
        | "acceptedQty"
        | "handedOffQty"
        | "scrappedQty"
        | "returnedQty"
      >
    | RequestLineStatusProjection,
): LedgerBucketValues {
  return {
    pendingQty: new Prisma.Decimal(ledger.pendingQty),
    inProcurementQty: new Prisma.Decimal(ledger.inProcurementQty),
    canceledQty: new Prisma.Decimal(ledger.canceledQty),
    acceptedQty: new Prisma.Decimal(ledger.acceptedQty),
    handedOffQty: new Prisma.Decimal(ledger.handedOffQty),
    scrappedQty: new Prisma.Decimal(ledger.scrappedQty),
    returnedQty: new Prisma.Decimal(ledger.returnedQty),
  };
}

function sumBuckets(values: LedgerBucketValues): Prisma.Decimal {
  return Object.values(values).reduce(
    (sum, current) => sum.add(current),
    new Prisma.Decimal(0),
  );
}

function toLedgerUpdateData(
  values: LedgerBucketValues,
  operatorId?: string,
): Prisma.RdMaterialStatusLedgerUncheckedUpdateInput {
  return {
    pendingQty: values.pendingQty,
    inProcurementQty: values.inProcurementQty,
    canceledQty: values.canceledQty,
    acceptedQty: values.acceptedQty,
    handedOffQty: values.handedOffQty,
    scrappedQty: values.scrappedQty,
    returnedQty: values.returnedQty,
    lastEventAt: new Date(),
    updatedBy: operatorId,
  };
}

function assertBucketTotalWithinLineQuantity(
  totalQty: Prisma.Decimal,
  values: LedgerBucketValues,
) {
  const currentTotal = sumBuckets(values);
  if (currentTotal.gt(totalQty)) {
    throw new BadRequestException(
      `RD 状态投影异常：累计数量 ${currentTotal.toFixed(6)} 超过需求数量 ${totalQty.toFixed(6)}`,
    );
  }
}

async function sumAcceptedQtyByRequestLineId(
  requestLineId: number,
  db: DbClient,
): Promise<Prisma.Decimal> {
  const result = await db.stockInOrderLine.aggregate({
    where: {
      rdProcurementRequestLineId: requestLineId,
      order: { lifecycleStatus: "EFFECTIVE" },
    },
    _sum: { quantity: true },
  });
  return new Prisma.Decimal(result._sum.quantity ?? 0);
}

async function sumHandoffQtyByRequestLineId(
  requestLineId: number,
  db: DbClient,
): Promise<Prisma.Decimal> {
  const result = await db.rdHandoffOrderLine.aggregate({
    where: {
      sourceDocumentType: RD_PROCUREMENT_REQUEST_DOCUMENT_TYPE,
      sourceDocumentLineId: requestLineId,
      order: { lifecycleStatus: "EFFECTIVE" },
    },
    _sum: { quantity: true },
  });
  return new Prisma.Decimal(result._sum.quantity ?? 0);
}

async function sumScrappedQtyByRequestLineId(
  requestLineId: number,
  db: DbClient,
): Promise<Prisma.Decimal> {
  const result = await db.workshopMaterialOrderLine.aggregate({
    where: {
      sourceDocumentType: RD_PROCUREMENT_REQUEST_DOCUMENT_TYPE,
      sourceDocumentLineId: requestLineId,
      order: {
        lifecycleStatus: "EFFECTIVE",
        orderType: "SCRAP",
      },
    },
    _sum: { quantity: true },
  });
  return new Prisma.Decimal(result._sum.quantity ?? 0);
}

async function buildProjectionFromFacts(
  requestLineId: number,
  lineQty: Prisma.Decimal,
  db: DbClient,
): Promise<LedgerBucketValues> {
  const [acceptedTotal, handedOffTotal, scrappedTotal] = await Promise.all([
    sumAcceptedQtyByRequestLineId(requestLineId, db),
    sumHandoffQtyByRequestLineId(requestLineId, db),
    sumScrappedQtyByRequestLineId(requestLineId, db),
  ]);

  const currentHandedOff = Prisma.Decimal.max(
    handedOffTotal.sub(scrappedTotal),
    ZERO,
  );
  const currentAccepted = Prisma.Decimal.max(
    acceptedTotal.sub(handedOffTotal),
    ZERO,
  );
  const pendingQty = Prisma.Decimal.max(
    lineQty.sub(currentAccepted).sub(currentHandedOff).sub(scrappedTotal),
    ZERO,
  );

  const buckets: LedgerBucketValues = {
    pendingQty,
    inProcurementQty: new Prisma.Decimal(0),
    canceledQty: new Prisma.Decimal(0),
    acceptedQty: currentAccepted,
    handedOffQty: currentHandedOff,
    scrappedQty: scrappedTotal,
    returnedQty: new Prisma.Decimal(0),
  };
  assertBucketTotalWithinLineQuantity(lineQty, buckets);
  return buckets;
}

async function buildProjectionFromHistories(
  requestLineId: number,
  lineQty: Prisma.Decimal,
  db: DbClient,
): Promise<LedgerBucketValues | null> {
  const histories = await db.rdMaterialStatusHistory.findMany({
    where: {
      requestLineId,
      reversalOfHistoryId: null,
    },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });
  if (histories.length === 0) {
    return null;
  }

  const buckets: LedgerBucketValues = {
    pendingQty: new Prisma.Decimal(0),
    inProcurementQty: new Prisma.Decimal(0),
    canceledQty: new Prisma.Decimal(0),
    acceptedQty: new Prisma.Decimal(0),
    handedOffQty: new Prisma.Decimal(0),
    scrappedQty: new Prisma.Decimal(0),
    returnedQty: new Prisma.Decimal(0),
  };

  for (const history of histories) {
    if (history.isReversed) {
      continue;
    }

    if (history.fromStatus) {
      const fromField = STATUS_FIELD_MAP[history.fromStatus];
      buckets[fromField] = buckets[fromField].sub(history.quantity);
      if (buckets[fromField].lt(0)) {
        throw new BadRequestException(
          `RD 状态历史异常：${history.fromStatus} 数量被减成负数`,
        );
      }
    }

    const toField = STATUS_FIELD_MAP[history.toStatus];
    buckets[toField] = buckets[toField].add(history.quantity);
  }

  assertBucketTotalWithinLineQuantity(lineQty, buckets);
  const currentTotal = sumBuckets(buckets);
  if (currentTotal.lt(lineQty)) {
    buckets.pendingQty = buckets.pendingQty.add(lineQty.sub(currentTotal));
  }

  return buckets;
}

async function buildStatusProjection(
  requestLineId: number,
  db: DbClient,
): Promise<RequestLineStatusProjection> {
  const requestLine = await db.rdProcurementRequestLine.findUnique({
    where: { id: requestLineId },
    select: {
      id: true,
      quantity: true,
      statusHistories: {
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: 1,
        select: { createdAt: true },
      },
    },
  });
  if (!requestLine) {
    throw new NotFoundException(`RD 采购需求行不存在: ${requestLineId}`);
  }

  const lineQty = new Prisma.Decimal(requestLine.quantity);
  const fromHistories = await buildProjectionFromHistories(
    requestLineId,
    lineQty,
    db,
  );
  const buckets =
    fromHistories ??
    (await buildProjectionFromFacts(requestLineId, lineQty, db));

  return {
    requestLineId,
    ...buckets,
    lastEventAt: requestLine.statusHistories[0]?.createdAt ?? null,
  };
}

export async function getStatusLedgerProjection(
  requestLineId: number,
  db: DbClient,
): Promise<RequestLineStatusProjection> {
  const ledger = await db.rdMaterialStatusLedger.findUnique({
    where: { requestLineId },
  });
  if (ledger) {
    return {
      requestLineId,
      pendingQty: new Prisma.Decimal(ledger.pendingQty),
      inProcurementQty: new Prisma.Decimal(ledger.inProcurementQty),
      canceledQty: new Prisma.Decimal(ledger.canceledQty),
      acceptedQty: new Prisma.Decimal(ledger.acceptedQty),
      handedOffQty: new Prisma.Decimal(ledger.handedOffQty),
      scrappedQty: new Prisma.Decimal(ledger.scrappedQty),
      returnedQty: new Prisma.Decimal(ledger.returnedQty),
      lastEventAt: ledger.lastEventAt,
    };
  }
  return buildStatusProjection(requestLineId, db);
}

async function ensureStatusLedger(
  requestLineId: number,
  operatorId: string | undefined,
  db: DbClient,
) {
  const existing = await db.rdMaterialStatusLedger.findUnique({
    where: { requestLineId },
  });
  if (existing) {
    return existing;
  }

  const projection = await buildStatusProjection(requestLineId, db);
  return db.rdMaterialStatusLedger.create({
    data: {
      requestLineId,
      pendingQty: projection.pendingQty,
      inProcurementQty: projection.inProcurementQty,
      canceledQty: projection.canceledQty,
      acceptedQty: projection.acceptedQty,
      handedOffQty: projection.handedOffQty,
      scrappedQty: projection.scrappedQty,
      returnedQty: projection.returnedQty,
      lastEventAt: projection.lastEventAt,
      createdBy: operatorId,
      updatedBy: operatorId,
    },
  });
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

export async function applyProcurementStartedStatus(
  params: {
    requestLineId: number;
    quantity: DecimalLike;
    requestId: number;
    requestDocumentNo: string;
    operatorId?: string;
    note?: string;
  },
  db: DbClient,
) {
  return transferStatusQuantity(
    {
      requestLineId: params.requestLineId,
      eventType: RdMaterialStatusEventType.PROCUREMENT_STARTED,
      toStatus: RdMaterialStatus.IN_PROCUREMENT,
      quantity: params.quantity,
      fromStatuses: [RdMaterialStatus.PENDING_PROCUREMENT],
      sourceDocumentType: RD_PROCUREMENT_REQUEST_DOCUMENT_TYPE,
      sourceDocumentId: params.requestId,
      sourceDocumentLineId: params.requestLineId,
      sourceDocumentNumber: params.requestDocumentNo,
      note: params.note,
      operatorId: params.operatorId,
    },
    db,
  );
}

export async function applyManualAcceptanceStatus(
  params: {
    requestLineId: number;
    quantity: DecimalLike;
    requestId: number;
    requestDocumentNo: string;
    operatorId?: string;
    note?: string;
    reason?: string;
    referenceNo?: string;
  },
  db: DbClient,
) {
  return transferStatusQuantity(
    {
      requestLineId: params.requestLineId,
      eventType: RdMaterialStatusEventType.ACCEPTANCE_CONFIRMED,
      toStatus: RdMaterialStatus.ACCEPTED,
      quantity: params.quantity,
      fromStatuses: [
        RdMaterialStatus.IN_PROCUREMENT,
        RdMaterialStatus.PENDING_PROCUREMENT,
      ],
      sourceDocumentType: RD_PROCUREMENT_REQUEST_DOCUMENT_TYPE,
      sourceDocumentId: params.requestId,
      sourceDocumentLineId: params.requestLineId,
      sourceDocumentNumber: params.requestDocumentNo,
      referenceNo: params.referenceNo,
      reason: params.reason,
      note: params.note,
      operatorId: params.operatorId,
    },
    db,
  );
}

export async function applyManualCancelStatus(
  params: {
    requestLineId: number;
    quantity: DecimalLike;
    requestId: number;
    requestDocumentNo: string;
    operatorId?: string;
    note?: string;
    reason?: string;
  },
  db: DbClient,
) {
  return transferStatusQuantity(
    {
      requestLineId: params.requestLineId,
      eventType: RdMaterialStatusEventType.MANUAL_CANCELLED,
      toStatus: RdMaterialStatus.CANCELLED,
      quantity: params.quantity,
      fromStatuses: [
        RdMaterialStatus.IN_PROCUREMENT,
        RdMaterialStatus.PENDING_PROCUREMENT,
      ],
      sourceDocumentType: RD_PROCUREMENT_REQUEST_DOCUMENT_TYPE,
      sourceDocumentId: params.requestId,
      sourceDocumentLineId: params.requestLineId,
      sourceDocumentNumber: params.requestDocumentNo,
      note: params.note,
      reason: params.reason,
      operatorId: params.operatorId,
    },
    db,
  );
}

export async function applyManualReturnStatus(
  params: {
    requestLineId: number;
    quantity: DecimalLike;
    requestId: number;
    requestDocumentNo: string;
    operatorId?: string;
    note?: string;
    reason: string;
    referenceNo: string;
  },
  db: DbClient,
) {
  return transferStatusQuantity(
    {
      requestLineId: params.requestLineId,
      eventType: RdMaterialStatusEventType.MANUAL_RETURNED,
      toStatus: RdMaterialStatus.RETURNED,
      quantity: params.quantity,
      fromStatuses: [RdMaterialStatus.HANDED_OFF],
      sourceDocumentType: RD_PROCUREMENT_REQUEST_DOCUMENT_TYPE,
      sourceDocumentId: params.requestId,
      sourceDocumentLineId: params.requestLineId,
      sourceDocumentNumber: params.requestDocumentNo,
      referenceNo: params.referenceNo,
      reason: params.reason,
      note: params.note,
      operatorId: params.operatorId,
    },
    db,
  );
}

export async function applyRequestVoidStatus(
  params: {
    requestLineId: number;
    requestId: number;
    requestDocumentNo: string;
    operatorId?: string;
    note?: string;
    reason?: string;
  },
  db: DbClient,
) {
  const projection = await getStatusLedgerProjection(params.requestLineId, db);
  const openQty = projection.pendingQty.add(projection.inProcurementQty);
  if (openQty.eq(0)) {
    return [];
  }

  return transferStatusQuantity(
    {
      requestLineId: params.requestLineId,
      eventType: RdMaterialStatusEventType.REQUEST_VOIDED,
      toStatus: RdMaterialStatus.CANCELLED,
      quantity: openQty,
      fromStatuses: [
        RdMaterialStatus.IN_PROCUREMENT,
        RdMaterialStatus.PENDING_PROCUREMENT,
      ],
      sourceDocumentType: RD_PROCUREMENT_REQUEST_DOCUMENT_TYPE,
      sourceDocumentId: params.requestId,
      sourceDocumentLineId: params.requestLineId,
      sourceDocumentNumber: params.requestDocumentNo,
      note: params.note,
      reason: params.reason,
      operatorId: params.operatorId,
    },
    db,
  );
}

export async function applyAcceptanceStatusesForOrder(
  params: {
    orderId: number;
    documentNo: string;
    lines: Array<{
      id: number;
      quantity: DecimalLike;
      rdProcurementRequestLineId: number | null;
    }>;
    operatorId?: string;
    logIdByLineId?: Map<number, number>;
  },
  db: DbClient,
) {
  for (const line of params.lines) {
    if (!line.rdProcurementRequestLineId) {
      continue;
    }

    await transferStatusQuantity(
      {
        requestLineId: line.rdProcurementRequestLineId,
        eventType: RdMaterialStatusEventType.ACCEPTANCE_CONFIRMED,
        toStatus: RdMaterialStatus.ACCEPTED,
        quantity: line.quantity,
        fromStatuses: [
          RdMaterialStatus.IN_PROCUREMENT,
          RdMaterialStatus.PENDING_PROCUREMENT,
        ],
        sourceDocumentType: STOCK_IN_ORDER_DOCUMENT_TYPE,
        sourceDocumentId: params.orderId,
        sourceDocumentLineId: line.id,
        sourceDocumentNumber: params.documentNo,
        relatedInventoryLogId: params.logIdByLineId?.get(line.id) ?? null,
        operatorId: params.operatorId,
      },
      db,
    );
  }
}

export async function reverseAcceptanceStatusesForOrder(
  params: {
    orderId: number;
    documentNo?: string;
    operatorId?: string;
    note?: string;
  },
  db: DbClient,
) {
  return reverseStatusHistoriesBySourceDocument(
    {
      eventType: RdMaterialStatusEventType.ACCEPTANCE_CONFIRMED,
      sourceDocumentType: STOCK_IN_ORDER_DOCUMENT_TYPE,
      sourceDocumentId: params.orderId,
      sourceDocumentNumber: params.documentNo,
      note: params.note,
      operatorId: params.operatorId,
    },
    db,
  );
}

export async function applyHandoffStatusesForOrder(
  params: {
    orderId: number;
    documentNo: string;
    lines: Array<{
      id: number;
      quantity: DecimalLike;
      sourceDocumentType?: string | null;
      sourceDocumentId?: number | null;
      sourceDocumentLineId?: number | null;
    }>;
    operatorId?: string;
    logIdByLineId?: Map<number, number>;
  },
  db: DbClient,
) {
  for (const line of params.lines) {
    if (
      line.sourceDocumentType !== RD_PROCUREMENT_REQUEST_DOCUMENT_TYPE ||
      !line.sourceDocumentLineId
    ) {
      continue;
    }

    await transferStatusQuantity(
      {
        requestLineId: line.sourceDocumentLineId,
        eventType: RdMaterialStatusEventType.HANDOFF_CONFIRMED,
        toStatus: RdMaterialStatus.HANDED_OFF,
        quantity: line.quantity,
        fromStatuses: [RdMaterialStatus.ACCEPTED],
        sourceDocumentType: RD_HANDOFF_ORDER_DOCUMENT_TYPE,
        sourceDocumentId: params.orderId,
        sourceDocumentLineId: line.id,
        sourceDocumentNumber: params.documentNo,
        relatedInventoryLogId: params.logIdByLineId?.get(line.id) ?? null,
        operatorId: params.operatorId,
      },
      db,
    );
  }
}

export async function reverseHandoffStatusesForOrder(
  params: {
    orderId: number;
    documentNo?: string;
    operatorId?: string;
    note?: string;
  },
  db: DbClient,
) {
  return reverseStatusHistoriesBySourceDocument(
    {
      eventType: RdMaterialStatusEventType.HANDOFF_CONFIRMED,
      sourceDocumentType: RD_HANDOFF_ORDER_DOCUMENT_TYPE,
      sourceDocumentId: params.orderId,
      sourceDocumentNumber: params.documentNo,
      note: params.note,
      operatorId: params.operatorId,
    },
    db,
  );
}

export async function applyScrapStatusesForOrder(
  params: {
    orderId: number;
    documentNo: string;
    lines: Array<{
      id: number;
      quantity: DecimalLike;
      sourceDocumentType?: string | null;
      sourceDocumentId?: number | null;
      sourceDocumentLineId?: number | null;
    }>;
    operatorId?: string;
    logIdByLineId?: Map<number, number>;
  },
  db: DbClient,
) {
  for (const line of params.lines) {
    if (
      line.sourceDocumentType !== RD_PROCUREMENT_REQUEST_DOCUMENT_TYPE ||
      !line.sourceDocumentLineId
    ) {
      continue;
    }

    await transferStatusQuantity(
      {
        requestLineId: line.sourceDocumentLineId,
        eventType: RdMaterialStatusEventType.SCRAP_CONFIRMED,
        toStatus: RdMaterialStatus.SCRAPPED,
        quantity: line.quantity,
        fromStatuses: [RdMaterialStatus.HANDED_OFF],
        sourceDocumentType: WORKSHOP_MATERIAL_ORDER_DOCUMENT_TYPE,
        sourceDocumentId: params.orderId,
        sourceDocumentLineId: line.id,
        sourceDocumentNumber: params.documentNo,
        relatedInventoryLogId: params.logIdByLineId?.get(line.id) ?? null,
        operatorId: params.operatorId,
      },
      db,
    );
  }
}

export async function reverseScrapStatusesForOrder(
  params: {
    orderId: number;
    documentNo?: string;
    operatorId?: string;
    note?: string;
  },
  db: DbClient,
) {
  return reverseStatusHistoriesBySourceDocument(
    {
      eventType: RdMaterialStatusEventType.SCRAP_CONFIRMED,
      sourceDocumentType: WORKSHOP_MATERIAL_ORDER_DOCUMENT_TYPE,
      sourceDocumentId: params.orderId,
      sourceDocumentNumber: params.documentNo,
      note: params.note,
      operatorId: params.operatorId,
    },
    db,
  );
}

export function formatStatusBuckets(
  projection:
    | RequestLineStatusProjection
    | Pick<
        RdMaterialStatusLedger,
        | "pendingQty"
        | "inProcurementQty"
        | "canceledQty"
        | "acceptedQty"
        | "handedOffQty"
        | "scrappedQty"
        | "returnedQty"
      >,
) {
  return {
    pendingQty: projection.pendingQty,
    inProcurementQty: projection.inProcurementQty,
    canceledQty: projection.canceledQty,
    acceptedQty: projection.acceptedQty,
    handedOffQty: projection.handedOffQty,
    scrappedQty: projection.scrappedQty,
    returnedQty: projection.returnedQty,
  };
}

export type { RequestLineStatusProjection, ReverseBySourceDocumentInput };
