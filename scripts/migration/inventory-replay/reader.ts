import type { MigrationConnectionLike } from "../db";
import { BusinessDocumentType } from "../shared/business-document-type";
import type { InventoryEvent } from "./types";

interface DocumentLineRow {
  orderId: number;
  documentNo: string;
  orderType: string;
  bizDate: string;
  workshopId: number;
  lineId: number;
  materialId: number;
  quantity: string;
  createdBy: string | null;
  createdAt: string | null;
}

const DIRECTION_PRIORITY_IN = 0;
const DIRECTION_PRIORITY_OUT = 1;
const STOCK_IN_DOCUMENT_TYPE = BusinessDocumentType.StockInOrder;
const SALES_STOCK_DOCUMENT_TYPE = BusinessDocumentType.SalesStockOrder;
const WORKSHOP_MATERIAL_DOCUMENT_TYPE =
  BusinessDocumentType.WorkshopMaterialOrder;
const RD_PROJECT_DOCUMENT_TYPE = BusinessDocumentType.RdProject;

function toDateString(value: string | null): string {
  if (!value) return "1970-01-01";
  const match = value.match(/^(\d{4}-\d{2}-\d{2})/u);
  return match?.[1] ?? "1970-01-01";
}

function toDateTimeString(value: string | null): string {
  if (!value) return "1970-01-01 00:00:00";
  return value.length >= 19 ? value.slice(0, 19) : value;
}

async function readStockInEvents(
  connection: MigrationConnectionLike,
): Promise<InventoryEvent[]> {
  const rows = await connection.query<DocumentLineRow[]>(`
    SELECT
      o.id AS orderId, o.documentNo, o.orderType, o.bizDate, o.workshopId,
      l.id AS lineId, l.materialId, l.quantity,
      o.createdBy, o.createdAt
    FROM stock_in_order o
    JOIN stock_in_order_line l ON l.orderId = o.id
    WHERE o.lifecycleStatus = 'EFFECTIVE'
    ORDER BY o.bizDate ASC, o.id ASC, l.id ASC
  `);

  return rows.map((row) => ({
    bizDate: toDateString(row.bizDate),
    direction: "IN" as const,
    operationType:
      row.orderType === "PRODUCTION_RECEIPT"
        ? ("PRODUCTION_RECEIPT_IN" as const)
        : ("ACCEPTANCE_IN" as const),
    businessModule: "inbound",
    businessDocumentType: STOCK_IN_DOCUMENT_TYPE,
    businessDocumentId: row.orderId,
    businessDocumentNumber: row.documentNo,
    businessDocumentLineId: row.lineId,
    materialId: row.materialId,
    workshopId: row.workshopId,
    changeQty: String(row.quantity),
    idempotencyKey: `${STOCK_IN_DOCUMENT_TYPE}:${row.orderId}:line:${row.lineId}`,
    operatorId: row.createdBy,
    occurredAt: toDateTimeString(row.createdAt),
    sortPriority: DIRECTION_PRIORITY_IN,
  }));
}

async function readCustomerEvents(
  connection: MigrationConnectionLike,
): Promise<InventoryEvent[]> {
  const rows = await connection.query<DocumentLineRow[]>(`
    SELECT
      o.id AS orderId, o.documentNo, o.orderType, o.bizDate, o.workshopId,
      l.id AS lineId, l.materialId, l.quantity,
      o.createdBy, o.createdAt
    FROM sales_stock_order o
    JOIN sales_stock_order_line l ON l.orderId = o.id
    WHERE o.lifecycleStatus = 'EFFECTIVE'
    ORDER BY o.bizDate ASC, o.id ASC, l.id ASC
  `);

  return rows.map((row) => {
    const isSalesReturn = row.orderType === "SALES_RETURN";
    return {
      bizDate: toDateString(row.bizDate),
      direction: isSalesReturn ? ("IN" as const) : ("OUT" as const),
      operationType: isSalesReturn
        ? ("SALES_RETURN_IN" as const)
        : ("OUTBOUND_OUT" as const),
      businessModule: "sales",
      businessDocumentType: SALES_STOCK_DOCUMENT_TYPE,
      businessDocumentId: row.orderId,
      businessDocumentNumber: row.documentNo,
      businessDocumentLineId: row.lineId,
      materialId: row.materialId,
      workshopId: row.workshopId,
      changeQty: String(row.quantity),
      idempotencyKey: `${SALES_STOCK_DOCUMENT_TYPE}:${row.orderId}:line:${row.lineId}`,
      operatorId: row.createdBy,
      occurredAt: toDateTimeString(row.createdAt),
      sortPriority: isSalesReturn
        ? DIRECTION_PRIORITY_IN
        : DIRECTION_PRIORITY_OUT,
    };
  });
}

async function readWorkshopEvents(
  connection: MigrationConnectionLike,
): Promise<InventoryEvent[]> {
  const rows = await connection.query<DocumentLineRow[]>(`
    SELECT
      o.id AS orderId, o.documentNo, o.orderType, o.bizDate, o.workshopId,
      l.id AS lineId, l.materialId, l.quantity,
      o.createdBy, o.createdAt
    FROM workshop_material_order o
    JOIN workshop_material_order_line l ON l.orderId = o.id
    WHERE o.lifecycleStatus = 'EFFECTIVE'
    ORDER BY o.bizDate ASC, o.id ASC, l.id ASC
  `);

  return rows.map((row) => {
    const isReturn = row.orderType === "RETURN";
    const operationType =
      row.orderType === "PICK"
        ? ("PICK_OUT" as const)
        : row.orderType === "SCRAP"
          ? ("SCRAP_OUT" as const)
          : ("RETURN_IN" as const);

    return {
      bizDate: toDateString(row.bizDate),
      direction: isReturn ? ("IN" as const) : ("OUT" as const),
      operationType,
      businessModule: "workshop-material",
      businessDocumentType: WORKSHOP_MATERIAL_DOCUMENT_TYPE,
      businessDocumentId: row.orderId,
      businessDocumentNumber: row.documentNo,
      businessDocumentLineId: row.lineId,
      materialId: row.materialId,
      workshopId: row.workshopId,
      changeQty: String(row.quantity),
      idempotencyKey: `${WORKSHOP_MATERIAL_DOCUMENT_TYPE}:${row.orderId}:line:${row.lineId}`,
      operatorId: row.createdBy,
      occurredAt: toDateTimeString(row.createdAt),
      sortPriority: isReturn ? DIRECTION_PRIORITY_IN : DIRECTION_PRIORITY_OUT,
    };
  });
}

async function readProjectEvents(
  connection: MigrationConnectionLike,
): Promise<InventoryEvent[]> {
  const rows = await connection.query<
    Array<{
      projectId: number;
      projectCode: string;
      bizDate: string;
      workshopId: number;
      lineId: number;
      materialId: number;
      quantity: string;
      createdBy: string | null;
      createdAt: string | null;
    }>
  >(`
    SELECT
      p.id AS projectId, p.projectCode, p.bizDate, p.workshopId,
      l.id AS lineId, l.materialId, l.quantity,
      p.createdBy, p.createdAt
    FROM rd_project p
    JOIN rd_project_material_line l ON l.projectId = p.id
    WHERE p.lifecycleStatus = 'EFFECTIVE'
    ORDER BY p.bizDate ASC, p.id ASC, l.id ASC
  `);

  return rows.map((row) => ({
    bizDate: toDateString(row.bizDate),
    direction: "OUT" as const,
    operationType: "RD_PROJECT_OUT" as const,
    businessModule: "rd-project",
    businessDocumentType: RD_PROJECT_DOCUMENT_TYPE,
    businessDocumentId: row.projectId,
    businessDocumentNumber: row.projectCode,
    businessDocumentLineId: row.lineId,
    materialId: row.materialId,
    workshopId: row.workshopId,
    changeQty: String(row.quantity),
    idempotencyKey: `${RD_PROJECT_DOCUMENT_TYPE}:${row.projectId}:line:${row.lineId}`,
    operatorId: row.createdBy,
    occurredAt: toDateTimeString(row.createdAt),
    sortPriority: DIRECTION_PRIORITY_OUT,
  }));
}

export async function readAllInventoryEvents(
  connection: MigrationConnectionLike,
): Promise<InventoryEvent[]> {
  const [stockIn, customer, workshop, project] = await Promise.all([
    readStockInEvents(connection),
    readCustomerEvents(connection),
    readWorkshopEvents(connection),
    readProjectEvents(connection),
  ]);

  return [...stockIn, ...customer, ...workshop, ...project];
}
