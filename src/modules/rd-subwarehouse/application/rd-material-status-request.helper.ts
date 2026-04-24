import { RdMaterialStatus, RdMaterialStatusEventType } from "../../../../generated/prisma/client";
import {
  RD_PROCUREMENT_REQUEST_DOCUMENT_TYPE,
  type DbClient,
  type DecimalLike,
  getStatusLedgerProjection,
} from "./rd-material-status-core.helper";
import {
  reverseStatusHistoriesBySourceDocument,
  transferStatusQuantity,
} from "./rd-material-status-operations.helper";

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

