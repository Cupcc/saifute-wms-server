export const STOCK_IN_MIGRATION_BATCH = "batch2a-stock-in";
export const BATCH1_MASTER_DATA_BATCH = "batch1-master-data";

export type StockInOrderSourceTable =
  | "saifute_inbound_order"
  | "saifute_into_order";

export type StockInLineSourceTable =
  | "saifute_inbound_detail"
  | "saifute_into_detail";

export type StockInOrderTypeValue = "ACCEPTANCE" | "PRODUCTION_RECEIPT";
export type DocumentLifecycleStatusValue = "EFFECTIVE" | "VOIDED";
export type AuditStatusSnapshotValue =
  | "NOT_REQUIRED"
  | "PENDING"
  | "APPROVED"
  | "REJECTED";
export type InventoryEffectStatusValue = "POSTED" | "REVERSED";

export type MasterDataBaselineEntity =
  | "materialCategory"
  | "workshop"
  | "supplier"
  | "personnel"
  | "customer"
  | "material";

export interface LegacyStockInOrderRow {
  legacyTable: StockInOrderSourceTable;
  legacyId: number;
  legacyAuditDocumentType: 1 | 2;
  sourceDocumentNo: string | null;
  sourceOrderTypeValue: string | number | null;
  bizDate: string | null;
  totalAmount: string | number | null;
  supplierLegacyId: number | null;
  workshopLegacyId: number | null;
  chargeBy: string | null;
  handlerName: string | null;
  remark: string | null;
  delFlag: string | number | null;
  voidReason: string | null;
  createdBy: string | null;
  createdAt: string | null;
  updatedBy: string | null;
  updatedAt: string | null;
}

export interface LegacyStockInLineRow {
  legacyTable: StockInLineSourceTable;
  legacyId: number;
  parentLegacyTable: StockInOrderSourceTable;
  parentLegacyId: number;
  materialLegacyId: number | null;
  quantity: string | number | null;
  unitPrice: string | number | null;
  taxPrice: string | number | null;
  interval: string | null;
  remark: string | null;
}

export interface LegacyAuditDocumentRow {
  legacyId: number;
  documentType: 1 | 2;
  documentId: number;
  auditStatus: string | null;
  auditor: string | null;
  auditTime: string | null;
  auditOpinion: string | null;
}

export interface LegacyStockInSnapshot {
  orders: LegacyStockInOrderRow[];
  lines: LegacyStockInLineRow[];
  audits: LegacyAuditDocumentRow[];
}

export interface ResolvedMaterialDependency {
  targetId: number;
  materialCode: string;
  materialName: string;
  specModel: string | null;
  unitCode: string;
}

export interface ResolvedWorkshopDependency {
  targetId: number;
  workshopCode: string;
  workshopName: string;
}

export interface ResolvedSupplierDependency {
  targetId: number;
  supplierCode: string;
  supplierName: string;
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

export interface StockInDependencySnapshot {
  materialByLegacyKey: Map<string, ResolvedMaterialDependency>;
  workshopByLegacyKey: Map<string, ResolvedWorkshopDependency>;
  supplierByLegacyKey: Map<string, ResolvedSupplierDependency>;
  defaultWorkshop: ResolvedWorkshopDependency | null;
  personnelByNormalizedName: Map<string, ResolvedPersonnelDependency>;
  ambiguousPersonnelNames: Set<string>;
  blockedMaterialLegacyIds: Set<number>;
  batch1Baseline: Batch1BaselineSummary;
}

export interface StockInWarning {
  legacyTable: string;
  legacyId: number | null;
  reason: string;
  details?: Record<string, unknown>;
}

export interface StockInGlobalBlocker {
  reason: string;
  details?: Record<string, unknown>;
}

export interface DocumentNoRewriteSummary {
  originalDocumentNo: string;
  keptLegacyTable: StockInOrderSourceTable;
  keptLegacyId: number;
  rewritten: Array<{
    legacyTable: StockInOrderSourceTable;
    legacyId: number;
    rewrittenDocumentNo: string;
  }>;
}

export interface ArchivedFieldPayloadRecord {
  legacyTable: string;
  legacyId: number;
  targetTable: "stock_in_order" | "stock_in_order_line";
  targetCode: string;
  payloadKind: "legacy-unmapped-fields";
  archiveReason: string;
  payload: Record<string, unknown>;
}

export interface ExcludedDocumentPlanRecord {
  legacyTable: StockInOrderSourceTable;
  legacyId: number;
  exclusionReason: string;
  payload: Record<string, unknown>;
}

export interface StockInOrderTargetInsert {
  documentNo: string;
  orderType: StockInOrderTypeValue;
  bizDate: string;
  supplierId: number | null;
  handlerPersonnelId: number | null;
  workshopId: number;
  lifecycleStatus: DocumentLifecycleStatusValue;
  auditStatusSnapshot: AuditStatusSnapshotValue;
  inventoryEffectStatus: InventoryEffectStatusValue;
  revisionNo: number;
  supplierCodeSnapshot: string | null;
  supplierNameSnapshot: string | null;
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

export interface StockInOrderLineTargetInsert {
  lineNo: number;
  materialId: number;
  materialCodeSnapshot: string;
  materialNameSnapshot: string;
  materialSpecSnapshot: string | null;
  unitCodeSnapshot: string;
  quantity: string;
  unitPrice: string;
  amount: string;
  remark: string | null;
  createdBy: string | null;
  createdAt: string | null;
  updatedBy: string | null;
  updatedAt: string | null;
}

export interface StockInLinePlanRecord {
  legacyTable: StockInLineSourceTable;
  legacyId: number;
  parentLegacyTable: StockInOrderSourceTable;
  parentLegacyId: number;
  targetTable: "stock_in_order_line";
  targetCode: string;
  target: StockInOrderLineTargetInsert;
  archivedPayload: ArchivedFieldPayloadRecord | null;
}

export interface StockInOrderPlanRecord {
  legacyTable: StockInOrderSourceTable;
  legacyId: number;
  sourceDocumentNo: string;
  targetTable: "stock_in_order";
  targetCode: string;
  target: StockInOrderTargetInsert;
  lines: StockInLinePlanRecord[];
  archivedPayload: ArchivedFieldPayloadRecord;
}

export interface StockInPlanCounts {
  orders: {
    source: number;
    migrated: number;
    excluded: number;
  };
  lines: {
    source: number;
    migrated: number;
    excluded: number;
  };
  sourceOrderTables: Record<StockInOrderSourceTable, number>;
  sourceLineTables: Record<StockInLineSourceTable, number>;
}

export interface StockInMigrationPlan {
  migrationBatch: string;
  migratedOrders: StockInOrderPlanRecord[];
  excludedDocuments: ExcludedDocumentPlanRecord[];
  documentNoRewrites: DocumentNoRewriteSummary[];
  warnings: StockInWarning[];
  globalBlockers: StockInGlobalBlocker[];
  counts: StockInPlanCounts;
  context: {
    defaultWorkshopCode: string | null;
    defaultWorkshopName: string | null;
    blockedMaterialLegacyIds: number[];
    batch1Baseline: Batch1BaselineSummary;
  };
}

export interface StockInExecutionResult {
  insertedOrUpdatedOrders: number;
  insertedOrUpdatedLines: number;
  archivedPayloadCount: number;
  excludedDocumentCount: number;
}
