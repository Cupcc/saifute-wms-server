import type { BusinessDocumentTypeValue } from "../shared/business-document-type";

export const POST_ADMISSION_MIGRATION_BATCH = "batch3f-return-post-admission";

export const SALES_RETURN_ADMISSION_BATCH =
  "batch3c-outbound-sales-return-recoverable";
export const WORKSHOP_RETURN_ADMISSION_BATCH =
  "batch3e-workshop-return-recoverable";

export type RelationClassification = "proven" | "unresolved" | "ambiguous";

export type DocumentFamilyValue =
  | "STOCK_IN"
  | "SALES_STOCK"
  | "WORKSHOP_MATERIAL"
  | "PROJECT";

export type DocumentRelationTypeValue =
  | "SALES_RETURN_FROM_OUTBOUND"
  | "WORKSHOP_RETURN_FROM_PICK";

export type AuditStatusSnapshotValue =
  | "NOT_REQUIRED"
  | "PENDING"
  | "APPROVED"
  | "REJECTED";

export type InventoryEffectStatusValue = "POSTED" | "REVERSED";
export type DocumentLifecycleStatusValue = "EFFECTIVE" | "VOIDED";
export type StockDirectionValue = "IN" | "OUT";
export type SourceUsageStatusValue =
  | "ALLOCATED"
  | "PARTIALLY_RELEASED"
  | "RELEASED";

export type InventoryOperationTypeValue =
  | "ACCEPTANCE_IN"
  | "PRODUCTION_RECEIPT_IN"
  | "OUTBOUND_OUT"
  | "SALES_RETURN_IN"
  | "PICK_OUT"
  | "RETURN_IN"
  | "REVERSAL_IN"
  | "REVERSAL_OUT";

export interface AdmittedOrderRow {
  id: number;
  documentNo: string;
  orderType: string;
  bizDate: string;
  workshopId: number;
  customerId: number | null;
  lifecycleStatus: DocumentLifecycleStatusValue;
  auditStatusSnapshot: AuditStatusSnapshotValue;
  inventoryEffectStatus: InventoryEffectStatusValue;
}

export interface AdmittedLineRow {
  id: number;
  orderId: number;
  lineNo: number;
  materialId: number;
  quantity: string;
  sourceDocumentType: string | null;
  sourceDocumentId: number | null;
  sourceDocumentLineId: number | null;
  documentNo: string;
  orderType: string;
  bizDate: string;
  workshopId: number;
  customerId: number | null;
  lifecycleStatus: DocumentLifecycleStatusValue;
  inventoryEffectStatus: InventoryEffectStatusValue;
}

export interface UpstreamOutboundLineRow {
  id: number;
  orderId: number;
  lineNo: number;
  materialId: number;
  quantity: string;
  documentNo: string;
  bizDate: string;
  workshopId: number;
  customerId: number | null;
  lifecycleStatus: DocumentLifecycleStatusValue;
  inventoryEffectStatus: InventoryEffectStatusValue;
}

export interface UpstreamPickLineRow {
  id: number;
  orderId: number;
  lineNo: number;
  materialId: number;
  quantity: string;
  documentNo: string;
  bizDate: string;
  workshopId: number;
  lifecycleStatus: DocumentLifecycleStatusValue;
  inventoryEffectStatus: InventoryEffectStatusValue;
}

export interface AdmittedStockInLineRow {
  id: number;
  orderId: number;
  lineNo: number;
  materialId: number;
  quantity: string;
  documentNo: string;
  orderType: string;
  bizDate: string;
  workshopId: number;
  lifecycleStatus: DocumentLifecycleStatusValue;
  inventoryEffectStatus: InventoryEffectStatusValue;
}

export interface PostAdmissionBaseline {
  salesReturnOrders: AdmittedOrderRow[];
  salesReturnLines: AdmittedLineRow[];
  workshopReturnOrders: AdmittedOrderRow[];
  workshopReturnLines: AdmittedLineRow[];
  outboundLines: UpstreamOutboundLineRow[];
  pickLines: UpstreamPickLineRow[];
  stockInLines: AdmittedStockInLineRow[];
  outboundOrders: AdmittedOrderRow[];
  pickOrders: AdmittedOrderRow[];
  stockInOrders: AdmittedOrderRow[];
}

export interface ReturnLineClassification {
  lineId: number;
  orderId: number;
  lineNo: number;
  materialId: number;
  documentNo: string;
  orderType: "SALES_RETURN" | "RETURN";
  classification: RelationClassification;
  currentSourceDocumentId: number | null;
  currentSourceDocumentLineId: number | null;
  provenUpstreamLineId: number | null;
  provenUpstreamOrderId: number | null;
  provenUpstreamDocumentNo: string | null;
  candidateCount: number;
  candidateSummary: Array<{
    upstreamLineId: number;
    upstreamOrderId: number;
    upstreamDocumentNo: string;
  }>;
}

export interface DocumentRelationInsert {
  relationType: DocumentRelationTypeValue;
  upstreamFamily: DocumentFamilyValue;
  upstreamDocumentType: BusinessDocumentTypeValue;
  upstreamDocumentId: number;
  downstreamFamily: DocumentFamilyValue;
  downstreamDocumentType: BusinessDocumentTypeValue;
  downstreamDocumentId: number;
  isActive: boolean;
}

export interface DocumentLineRelationInsert {
  relationType: DocumentRelationTypeValue;
  upstreamFamily: DocumentFamilyValue;
  upstreamDocumentType: BusinessDocumentTypeValue;
  upstreamDocumentId: number;
  upstreamLineId: number;
  downstreamFamily: DocumentFamilyValue;
  downstreamDocumentType: BusinessDocumentTypeValue;
  downstreamDocumentId: number;
  downstreamLineId: number;
  linkedQty: string;
}

export interface SourceBackfillRecord {
  lineId: number;
  sourceDocumentType: BusinessDocumentTypeValue;
  sourceDocumentId: number;
  sourceDocumentLineId: number;
}

export interface StaleClearRecord {
  lineId: number;
  documentTable: "sales_stock_order_line" | "workshop_material_order_line";
}

export interface InventoryLogInsert {
  idempotencyKey: string;
  balanceKey: string;
  materialId: number;
  workshopId: number;
  direction: StockDirectionValue;
  operationType: InventoryOperationTypeValue;
  businessModule: string;
  businessDocumentType: BusinessDocumentTypeValue;
  businessDocumentId: number;
  businessDocumentNumber: string;
  businessDocumentLineId: number | null;
  changeQty: string;
  note: string | null;
  isReversal: boolean;
  primaryIdempotencyKey: string | null;
}

export interface InventoryBalanceRecord {
  balanceKey: string;
  materialId: number;
  workshopId: number;
  quantityOnHand: string;
}

export interface InventorySourceUsageInsert {
  materialId: number;
  sourceLogIdempotencyKey: string;
  consumerDocumentType: BusinessDocumentTypeValue;
  consumerDocumentId: number;
  consumerLineId: number;
  allocatedQty: string;
  status: SourceUsageStatusValue;
}

export interface AuditDocumentInsert {
  documentFamily: DocumentFamilyValue;
  documentType: BusinessDocumentTypeValue;
  documentId: number;
  documentNumber: string;
  auditStatus: AuditStatusSnapshotValue;
}

export interface RelationClassificationPlan {
  salesReturnClassifications: ReturnLineClassification[];
  workshopReturnClassifications: ReturnLineClassification[];
  provenCount: number;
  unresolvedCount: number;
  ambiguousCount: number;
  alreadyLinkedCount: number;
}

export interface SourceBackfillPlan {
  backfillRecords: SourceBackfillRecord[];
  documentRelations: DocumentRelationInsert[];
  documentLineRelations: DocumentLineRelationInsert[];
  staleClearRecords: StaleClearRecord[];
}

export interface InventoryReplayPlan {
  logInserts: InventoryLogInsert[];
  sourceUsageInserts: InventorySourceUsageInsert[];
  unresolvedSourceUsageGaps: Array<{
    returnLineId: number;
    returnDocumentNo: string;
    orderType: string;
    reason: string;
  }>;
}

export interface AuditProjectionPlan {
  auditDocumentInserts: AuditDocumentInsert[];
}

export interface PostAdmissionMigrationPlan {
  migrationBatch: string;
  relation: RelationClassificationPlan;
  backfill: SourceBackfillPlan;
  replay: InventoryReplayPlan;
  audit: AuditProjectionPlan;
  globalBlockers: Array<{ reason: string; details?: Record<string, unknown> }>;
  warnings: Array<{ reason: string; details?: Record<string, unknown> }>;
  counts: PostAdmissionPlanCounts;
}

export interface PostAdmissionPlanCounts {
  admittedSalesReturnOrders: number;
  admittedSalesReturnLines: number;
  admittedWorkshopReturnOrders: number;
  admittedWorkshopReturnLines: number;
  provenRelations: number;
  unresolvedRelations: number;
  ambiguousRelations: number;
  alreadyLinkedLines: number;
  staleSourceFieldsToClean: number;
  documentRelationsToInsert: number;
  documentLineRelationsToInsert: number;
  sourceBackfillsToApply: number;
  inventoryLogInserts: number;
  sourceUsageInserts: number;
  sourceUsageGaps: number;
  auditDocumentInserts: number;
}

export interface PostAdmissionExecutionResult {
  staleSourceFieldsCleared: number;
  sourceBackfillsApplied: number;
  documentRelationsInserted: number;
  documentLineRelationsInserted: number;
  inventoryBalancesInserted: number;
  inventoryLogsInserted: number;
  sourceUsageInserted: number;
  auditDocumentsInserted: number;
}
