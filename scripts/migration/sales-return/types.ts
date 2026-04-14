import type { BusinessDocumentTypeValue } from "../shared/business-document-type";

export const SALES_RETURN_MIGRATION_BATCH =
  "batch3c-outbound-sales-return-recoverable";
export const OUTBOUND_BASE_MIGRATION_BATCH = "batch2c-outbound-base";
export const BATCH1_MASTER_DATA_BATCH = "batch1-master-data";

export type SalesReturnOrderTypeValue = "SALES_RETURN";
export type DocumentLifecycleStatusValue = "EFFECTIVE" | "VOIDED";
export type AuditStatusSnapshotValue =
  | "NOT_REQUIRED"
  | "PENDING"
  | "APPROVED"
  | "REJECTED";
export type InventoryEffectStatusValue = "POSTED" | "REVERSED";
export type SourceDocumentTypeValue = BusinessDocumentTypeValue;

export type PendingRelationReasonCode =
  | "missing-mapped-material"
  | "missing-mapped-customer"
  | "no-upstream-line-candidate"
  | "multiple-upstream-line-candidates"
  | "upstream-customer-mismatch"
  | "upstream-workshop-mismatch"
  | "inventory-used-only-evidence-insufficient";

export type MasterDataBaselineEntity =
  | "materialCategory"
  | "workshop"
  | "supplier"
  | "personnel"
  | "customer"
  | "material";

export interface LegacySalesReturnOrderRow {
  legacyTable: "saifute_sales_return_order";
  legacyId: number;
  returnNo: string | null;
  returnDate: string | null;
  customerLegacyId: number | null;
  sourceType: number | null;
  sourceLegacyId: number | null;
  chargeBy: string | null;
  attn: string | null;
  totalAmount: string | number | null;
  remark: string | null;
  delFlag: string | number | null;
  voidDescription: string | null;
  createdBy: string | null;
  createdAt: string | null;
  updatedBy: string | null;
  updatedAt: string | null;
}

export interface LegacySalesReturnDetailRow {
  legacyTable: "saifute_sales_return_detail";
  legacyId: number;
  parentLegacyTable: "saifute_sales_return_order";
  parentLegacyId: number;
  materialLegacyId: number | null;
  returnQty: string | number | null;
  unit: string | null;
  unitPrice: string | number | null;
  interval: string | null;
  remark: string | null;
}

export interface LegacySalesReturnAuditRow {
  legacyId: number;
  documentType: 7;
  documentId: number;
  auditStatus: string | null;
  auditor: string | null;
  auditTime: string | null;
  auditOpinion: string | null;
}

export interface LegacyInventoryUsedRow {
  usedId: number;
  materialId: number | null;
  beforeOrderType: number | null;
  beforeOrderId: number | null;
  beforeDetailId: number | null;
  afterOrderType: number | null;
  afterOrderId: number | null;
  afterDetailId: number | null;
}

export interface LegacySalesReturnSnapshot {
  orders: LegacySalesReturnOrderRow[];
  details: LegacySalesReturnDetailRow[];
  audits: LegacySalesReturnAuditRow[];
  inventoryUsedByDetailId: Map<number, LegacyInventoryUsedRow[]>;
}

export interface ResolvedMaterialDependency {
  targetId: number;
  materialCode: string;
  materialName: string;
  specModel: string | null;
  unitCode: string;
}

export interface ResolvedCustomerDependency {
  targetId: number;
  customerCode: string;
  customerName: string;
}

export interface ResolvedPersonnelDependency {
  targetId: number;
  personnelName: string;
}

export interface Batch1BaselineSummary {
  expectedMapCounts: Record<MasterDataBaselineEntity, number>;
  actualMapCounts: Record<MasterDataBaselineEntity, number>;
  expectedBlockedMaterialCount: number;
  actualBlockedMaterialCount: number;
  issues: string[];
}

export interface OutboundBaseBaselineSummary {
  expectedOrderMapCount: number;
  actualOrderMapCount: number;
  expectedLineMapCount: number;
  actualLineMapCount: number;
  expectedExcludedDocumentCount: number;
  actualExcludedDocumentCount: number;
  issues: string[];
}

export interface CurrentOutboundOrderRecord {
  targetId: number;
  documentNo: string;
  customerId: number | null;
  workshopId: number;
  bizDate: string | null;
  lifecycleStatus: string;
}

export interface CurrentOutboundLineRecord {
  targetLineId: number;
  targetOrderId: number;
  lineNo: number;
  materialId: number;
  customerId: number | null;
  workshopId: number;
  bizDate: string | null;
  documentNo: string;
  quantity: string;
  startNumber: string | null;
  endNumber: string | null;
}

export interface ResolvedWorkshopDependency {
  targetId: number;
  workshopName: string;
}

export interface SalesReturnDependencySnapshot {
  materialByLegacyKey: Map<string, ResolvedMaterialDependency>;
  customerByLegacyKey: Map<string, ResolvedCustomerDependency>;
  personnelByNormalizedName: Map<string, ResolvedPersonnelDependency>;
  ambiguousPersonnelNames: Set<string>;
  blockedMaterialLegacyIds: Set<number>;
  batch1Baseline: Batch1BaselineSummary;
  outboundBaseBaseline: OutboundBaseBaselineSummary;
  outboundLinesByMaterialId: Map<number, CurrentOutboundLineRecord[]>;
  outboundOrderMapByLegacyId: Map<
    number,
    { targetOrderId: number; documentNo: string }
  >;
  workshopByTargetId: Map<number, ResolvedWorkshopDependency>;
  existingDocumentNos: Set<string>;
}

export interface ArchivedFieldPayloadRecord {
  legacyTable: string;
  legacyId: number;
  targetTable: "sales_stock_order" | "sales_stock_order_line";
  targetCode: string;
  payloadKind: "legacy-unmapped-fields";
  archiveReason: string;
  payload: Record<string, unknown>;
}

export interface PendingRelationRecord {
  legacyTable: "saifute_sales_return_order";
  legacyId: number;
  legacyLineId: number;
  pendingReason: PendingRelationReasonCode;
  payload: {
    materialLegacyId: number | null;
    targetMaterialId: number | null;
    returnQty: string | null;
    returnDate: string | null;
    targetCustomerId: number | null;
    candidateCount: number;
    candidateSummary: Array<{
      targetLineId: number;
      targetOrderId: number;
      documentNo: string;
    }>;
    intervalEvidence: string | null;
    remarkEvidence: string | null;
  };
}

export interface ExcludedSalesReturnPlanRecord {
  legacyTable: "saifute_sales_return_order";
  legacyId: number;
  exclusionReason: string;
  isHardBlocker: boolean;
  payload: Record<string, unknown>;
}

export interface SalesStockOrderTargetInsert {
  documentNo: string;
  orderType: SalesReturnOrderTypeValue;
  bizDate: string;
  customerId: number | null;
  handlerPersonnelId: number | null;
  workshopId: number;
  lifecycleStatus: DocumentLifecycleStatusValue;
  auditStatusSnapshot: AuditStatusSnapshotValue;
  inventoryEffectStatus: InventoryEffectStatusValue;
  revisionNo: number;
  customerCodeSnapshot: string | null;
  customerNameSnapshot: string | null;
  handlerNameSnapshot: string | null;
  workshopNameSnapshot: string;
  totalQty: string;
  totalAmount: string;
  remark: string | null;
  voidReason: string | null;
  voidedBy: string | null;
  voidedAt: string | null;
  createdBy: string | null;
  createdAt: string | null;
  updatedBy: string | null;
  updatedAt: string | null;
}

export interface SalesReturnLineTargetInsert {
  lineNo: number;
  materialId: number;
  materialCodeSnapshot: string;
  materialNameSnapshot: string;
  materialSpecSnapshot: string | null;
  unitCodeSnapshot: string;
  quantity: string;
  unitPrice: string;
  amount: string;
  startNumber: null;
  endNumber: null;
  sourceDocumentType: SourceDocumentTypeValue | null;
  sourceDocumentId: number | null;
  sourceDocumentLineId: number | null;
  remark: string | null;
  createdBy: string | null;
  createdAt: string | null;
  updatedBy: string | null;
  updatedAt: string | null;
}

export interface SalesReturnLinePlanRecord {
  legacyTable: "saifute_sales_return_detail";
  legacyId: number;
  parentLegacyTable: "saifute_sales_return_order";
  parentLegacyId: number;
  targetTable: "sales_stock_order_line";
  targetCode: string;
  target: SalesReturnLineTargetInsert;
  archivedPayload: ArchivedFieldPayloadRecord;
  nullSourceDocumentReason: PendingRelationReasonCode | null;
}

export interface SalesReturnOrderPlanRecord {
  legacyTable: "saifute_sales_return_order";
  legacyId: number;
  sourceDocumentNo: string;
  targetTable: "sales_stock_order";
  targetCode: string;
  target: SalesStockOrderTargetInsert;
  lines: SalesReturnLinePlanRecord[];
  archivedPayload: ArchivedFieldPayloadRecord;
}

export interface SalesReturnPlanCounts {
  sourceCounts: {
    orders: number;
    details: number;
    audits: number;
  };
  admittedOrders: number;
  admittedLines: number;
  admittedLinesWithNullSourceDocument: number;
  pendingRelationLines: number;
  excludedHeaders: number;
  pendingReasonCounts: Partial<Record<PendingRelationReasonCode, number>>;
}

export interface SalesReturnMigrationPlan {
  migrationBatch: string;
  admittedOrders: SalesReturnOrderPlanRecord[];
  pendingRelations: PendingRelationRecord[];
  excludedDocuments: ExcludedSalesReturnPlanRecord[];
  documentNoRewrites: Array<{
    originalDocumentNo: string;
    keptLegacyId: number;
    rewrittenDocumentNo: string;
  }>;
  globalBlockers: Array<{ reason: string; details?: Record<string, unknown> }>;
  warnings: Array<{
    legacyTable: string;
    legacyId: number | null;
    reason: string;
    details?: Record<string, unknown>;
  }>;
  counts: SalesReturnPlanCounts;
  context: {
    batch1Baseline: Batch1BaselineSummary;
    outboundBaseBaseline: OutboundBaseBaselineSummary;
    blockedMaterialLegacyIds: number[];
  };
}

export interface SalesReturnExecutionResult {
  insertedOrUpdatedOrders: number;
  insertedOrUpdatedLines: number;
  archivedPayloadCount: number;
  pendingRelationCount: number;
  excludedDocumentCount: number;
}
