export const OUTBOUND_MIGRATION_BATCH = "batch2c-outbound-base";
export const BATCH1_MASTER_DATA_BATCH = "batch1-master-data";

export type OutboundOrderSourceTable = "saifute_outbound_order";
export type OutboundLineSourceTable = "saifute_outbound_detail";
export type CustomerStockOrderTypeValue = "OUTBOUND";
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

export interface LegacyOutboundOrderRow {
  legacyTable: OutboundOrderSourceTable;
  legacyId: number;
  legacyAuditDocumentType: 4;
  sourceDocumentNo: string | null;
  customerLegacyId: number | null;
  customerName: string | null;
  bizDate: string | null;
  chargeBy: string | null;
  bookkeeping: string | null;
  totalAmount: string | number | null;
  remark: string | null;
  delFlag: string | number | null;
  voidReason: string | null;
  createdBy: string | null;
  createdAt: string | null;
  updatedBy: string | null;
  updatedAt: string | null;
}

export interface LegacyOutboundLineRow {
  legacyTable: OutboundLineSourceTable;
  legacyId: number;
  parentLegacyTable: OutboundOrderSourceTable;
  parentLegacyId: number;
  materialLegacyId: number | null;
  quantity: string | number | null;
  unitPrice: string | number | null;
  interval: string | null;
  remark: string | null;
}

export interface LegacyAuditDocumentRow {
  legacyId: number;
  documentType: 4;
  documentId: number;
  auditStatus: string | null;
  auditor: string | null;
  auditTime: string | null;
  auditOpinion: string | null;
}

export interface LegacyOutboundSnapshot {
  orders: LegacyOutboundOrderRow[];
  lines: LegacyOutboundLineRow[];
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

export interface OutboundDependencySnapshot {
  materialByLegacyKey: Map<string, ResolvedMaterialDependency>;
  customerByLegacyKey: Map<string, ResolvedCustomerDependency>;
  defaultWorkshop: ResolvedWorkshopDependency | null;
  personnelByNormalizedName: Map<string, ResolvedPersonnelDependency>;
  ambiguousPersonnelNames: Set<string>;
  blockedMaterialLegacyIds: Set<number>;
  batch1Baseline: Batch1BaselineSummary;
}

export interface OutboundWarning {
  legacyTable: string;
  legacyId: number | null;
  reason: string;
  details?: Record<string, unknown>;
}

export interface OutboundGlobalBlocker {
  reason: string;
  details?: Record<string, unknown>;
}

export interface DocumentNoRewriteSummary {
  originalDocumentNo: string;
  keptLegacyTable: OutboundOrderSourceTable;
  keptLegacyId: number;
  rewritten: Array<{
    legacyTable: OutboundOrderSourceTable;
    legacyId: number;
    rewrittenDocumentNo: string;
  }>;
}

export interface ArchivedFieldPayloadRecord {
  legacyTable: string;
  legacyId: number;
  targetTable: "customer_stock_order" | "customer_stock_order_line";
  targetCode: string;
  payloadKind: "legacy-unmapped-fields";
  archiveReason: string;
  payload: Record<string, unknown>;
}

export interface ExcludedOutboundPlanRecord {
  legacyTable: OutboundOrderSourceTable;
  legacyId: number;
  exclusionReason: string;
  payload: Record<string, unknown>;
}

export interface CustomerStockOrderTargetInsert {
  documentNo: string;
  orderType: CustomerStockOrderTypeValue;
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

export interface CustomerStockOrderLineTargetInsert {
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
  sourceDocumentType: null;
  sourceDocumentId: null;
  sourceDocumentLineId: null;
  remark: string | null;
  createdBy: string | null;
  createdAt: string | null;
  updatedBy: string | null;
  updatedAt: string | null;
}

export interface OutboundLinePlanRecord {
  legacyTable: OutboundLineSourceTable;
  legacyId: number;
  parentLegacyTable: OutboundOrderSourceTable;
  parentLegacyId: number;
  targetTable: "customer_stock_order_line";
  targetCode: string;
  target: CustomerStockOrderLineTargetInsert;
  archivedPayload: ArchivedFieldPayloadRecord | null;
}

export interface OutboundOrderPlanRecord {
  legacyTable: OutboundOrderSourceTable;
  legacyId: number;
  sourceDocumentNo: string;
  targetTable: "customer_stock_order";
  targetCode: string;
  target: CustomerStockOrderTargetInsert;
  lines: OutboundLinePlanRecord[];
  archivedPayload: ArchivedFieldPayloadRecord;
}

export interface OutboundPlanCounts {
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
  sourceOrderTables: Record<OutboundOrderSourceTable, number>;
  sourceLineTables: Record<OutboundLineSourceTable, number>;
}

export interface OutboundMigrationPlan {
  migrationBatch: string;
  migratedOrders: OutboundOrderPlanRecord[];
  excludedDocuments: ExcludedOutboundPlanRecord[];
  documentNoRewrites: DocumentNoRewriteSummary[];
  warnings: OutboundWarning[];
  globalBlockers: OutboundGlobalBlocker[];
  counts: OutboundPlanCounts;
  context: {
    defaultWorkshopCode: string | null;
    defaultWorkshopName: string | null;
    blockedMaterialLegacyIds: number[];
    batch1Baseline: Batch1BaselineSummary;
  };
}

export interface OutboundExecutionResult {
  insertedOrUpdatedOrders: number;
  insertedOrUpdatedLines: number;
  archivedPayloadCount: number;
  excludedDocumentCount: number;
}
