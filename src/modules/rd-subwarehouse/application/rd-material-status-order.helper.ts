import { RdMaterialStatus, RdMaterialStatusEventType } from "../../../../generated/prisma/client";
import {
  RD_HANDOFF_ORDER_DOCUMENT_TYPE,
  STOCK_IN_ORDER_DOCUMENT_TYPE,
  WORKSHOP_MATERIAL_ORDER_DOCUMENT_TYPE,
  type DbClient,
  type DecimalLike,
  RD_PROCUREMENT_REQUEST_DOCUMENT_TYPE,
} from "./rd-material-status-core.helper";
import {
  reverseStatusHistoriesBySourceDocument,
  transferStatusQuantity,
} from "./rd-material-status-operations.helper";

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

