import { BadRequestException, NotFoundException } from "@nestjs/common";
import {
  Prisma,
  RdMaterialStatus,
  RdMaterialStatusEventType,
  type RdMaterialStatusLedger,
} from "../../../../generated/prisma/client";
import { BusinessDocumentType } from "../../../shared/domain/business-document-type";
export type DbClient = Prisma.TransactionClient;
export type DecimalLike = Prisma.Decimal | number | string;
export const RD_PROCUREMENT_REQUEST_DOCUMENT_TYPE =
  BusinessDocumentType.RdProcurementRequest;
export const STOCK_IN_ORDER_DOCUMENT_TYPE = BusinessDocumentType.StockInOrder;
export const RD_HANDOFF_ORDER_DOCUMENT_TYPE = BusinessDocumentType.RdHandoffOrder;
export const WORKSHOP_MATERIAL_ORDER_DOCUMENT_TYPE =
  BusinessDocumentType.WorkshopMaterialOrder;
export type LedgerStatusField =
  | "pendingQty"
  | "inProcurementQty"
  | "canceledQty"
  | "acceptedQty"
  | "handedOffQty"
  | "scrappedQty"
  | "returnedQty";
export type LedgerBucketValues = Record<LedgerStatusField, Prisma.Decimal>;
export const ZERO = new Prisma.Decimal(0);
export const STATUS_FIELD_MAP: Record<RdMaterialStatus, LedgerStatusField> = {
  [RdMaterialStatus.PENDING_PROCUREMENT]: "pendingQty",
  [RdMaterialStatus.IN_PROCUREMENT]: "inProcurementQty",
  [RdMaterialStatus.CANCELLED]: "canceledQty",
  [RdMaterialStatus.ACCEPTED]: "acceptedQty",
  [RdMaterialStatus.HANDED_OFF]: "handedOffQty",
  [RdMaterialStatus.SCRAPPED]: "scrappedQty",
  [RdMaterialStatus.RETURNED]: "returnedQty",
};
export interface StatusDocumentRef {
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
export interface TransferStatusQuantityInput extends StatusDocumentRef {
  requestLineId: number;
  eventType: RdMaterialStatusEventType;
  toStatus: RdMaterialStatus;
  quantity: DecimalLike;
  fromStatuses: RdMaterialStatus[];
}
export interface ReverseHistoryInput extends StatusDocumentRef {
  historyId: number;
}
export interface ReverseBySourceDocumentInput extends StatusDocumentRef {
  eventType: RdMaterialStatusEventType;
  sourceDocumentType: string;
  sourceDocumentId: number;
}
export interface RequestLineStatusProjection {
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
export function toDecimal(value: DecimalLike): Prisma.Decimal {
  return value instanceof Prisma.Decimal ? value : new Prisma.Decimal(value);
}
export function toPositiveDecimal(value: DecimalLike): Prisma.Decimal {
  const decimal = toDecimal(value);
  if (decimal.lte(0)) {
    throw new BadRequestException("数量必须大于 0");
  }
  return decimal;
}
export function cloneLedgerBuckets(
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
export function sumBuckets(values: LedgerBucketValues): Prisma.Decimal {
  return Object.values(values).reduce(
    (sum, current) => sum.add(current),
    new Prisma.Decimal(0),
  );
}
export function toLedgerUpdateData(
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
export function assertBucketTotalWithinLineQuantity(
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
export async function sumAcceptedQtyByRequestLineId(
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
export async function sumHandoffQtyByRequestLineId(
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
export async function sumScrappedQtyByRequestLineId(
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
export async function buildProjectionFromFacts(
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
export async function buildProjectionFromHistories(
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
export async function buildStatusProjection(
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
export async function ensureStatusLedger(
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

