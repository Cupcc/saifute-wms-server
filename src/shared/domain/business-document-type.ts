export enum BusinessDocumentType {
  StockInOrder = "StockInOrder",
  StockInPriceCorrectionOrder = "StockInPriceCorrectionOrder",
  SalesStockOrder = "SalesStockOrder",
  WorkshopMaterialOrder = "WorkshopMaterialOrder",
  RdProcurementRequest = "RdProcurementRequest",
  RdHandoffOrder = "RdHandoffOrder",
  RdStocktakeOrder = "RdStocktakeOrder",
  RdProject = "RdProject",
  RdProjectMaterialAction = "RdProjectMaterialAction",
  SalesProject = "SalesProject",
}

export const BUSINESS_DOCUMENT_TYPE_VALUES = Object.values(
  BusinessDocumentType,
);

export type BusinessDocumentTypeValue = `${BusinessDocumentType}`;

export const INVENTORY_BUSINESS_DOCUMENT_TYPES = [
  BusinessDocumentType.StockInOrder,
  BusinessDocumentType.StockInPriceCorrectionOrder,
  BusinessDocumentType.SalesStockOrder,
  BusinessDocumentType.WorkshopMaterialOrder,
  BusinessDocumentType.RdProjectMaterialAction,
  BusinessDocumentType.RdHandoffOrder,
  BusinessDocumentType.RdStocktakeOrder,
] as const;

export type InventoryBusinessDocumentType =
  `${(typeof INVENTORY_BUSINESS_DOCUMENT_TYPES)[number]}`;

const BUSINESS_DOCUMENT_TYPE_SET = new Set<string>(BUSINESS_DOCUMENT_TYPE_VALUES);

export function isBusinessDocumentType(
  value: string,
): value is BusinessDocumentTypeValue {
  return BUSINESS_DOCUMENT_TYPE_SET.has(value);
}
