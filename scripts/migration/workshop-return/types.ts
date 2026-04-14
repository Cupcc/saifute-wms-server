import type { BusinessDocumentTypeValue } from "../shared/business-document-type";

export const WORKSHOP_RETURN_MIGRATION_BATCH = "batch3e-workshop-return-formal";
export const WORKSHOP_PICK_BASE_MIGRATION_BATCH = "batch3b-workshop-pick-base";
export const BATCH1_MASTER_DATA_BATCH = "batch1-master-data";

export type ReturnOrderSourceTable = "saifute_return_order";
export type ReturnDetailSourceTable = "saifute_return_detail";
export type WorkshopReturnOrderTypeValue = "RETURN";
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
  | "no-upstream-pick-line-candidate"
  | "multiple-upstream-pick-line-candidates"
  | "upstream-workshop-mismatch"
  | "inventory-used-only-evidence-insufficient";

export type MasterDataBaselineEntity =
  | "materialCategory"
  | "workshop"
  | "supplier"
  | "personnel"
  | "customer"
  | "material";

export interface LegacyReturnOrderRow {
  legacyTable: ReturnOrderSourceTable;
  legacyId: number;
  returnNo: string | null;
  returnDate: string | null;
  workshopLegacyId: number | null;
  sourceType: number | null;
  sourceId: number | null;
  returnBy: string | null;
  chargeBy: string | null;
  totalAmount: string | number | null;
  remark: string | null;
  delFlag: string | number | null;
  voidDescription: string | null;
  createdBy: string | null;
  createdAt: string | null;
  updatedBy: string | null;
  updatedAt: string | null;
}

export interface LegacyReturnDetailRow {
  legacyTable: ReturnDetailSourceTable;
  legacyId: number;
  parentLegacyTable: ReturnOrderSourceTable;
  parentLegacyId: number;
  materialLegacyId: number | null;
  returnQty: string | number | null;
  unitPrice: string | number | null;
  remark: string | null;
}

export interface LegacyReturnAuditRow {
  legacyId: number;
  documentType: 5;
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

export interface LegacyWorkshopReturnSnapshot {
  orders: LegacyReturnOrderRow[];
  details: LegacyReturnDetailRow[];
  audits: LegacyReturnAuditRow[];
  inventoryUsedByReturnOrderId: Map<number, LegacyInventoryUsedRow[]>;
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
  workshopName: string;
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

export interface WorkshopPickBaseBaselineSummary {
  expectedOrderMapCount: number;
  actualOrderMapCount: number;
  expectedLineMapCount: number;
  actualLineMapCount: number;
  expectedExcludedDocumentCount: number;
  actualExcludedDocumentCount: number;
  issues: string[];
}

export interface CurrentPickOrderLineRecord {
  targetLineId: number;
  targetOrderId: number;
  lineNo: number;
  materialId: number;
  workshopId: number;
  bizDate: string | null;
  documentNo: string;
  quantity: string;
}

export interface WorkshopReturnDependencySnapshot {
  materialByLegacyKey: Map<string, ResolvedMaterialDependency>;
  workshopByLegacyKey: Map<string, ResolvedWorkshopDependency>;
  workshopByTargetId: Map<number, ResolvedWorkshopDependency>;
  personnelByNormalizedName: Map<string, ResolvedPersonnelDependency>;
  ambiguousPersonnelNames: Set<string>;
  blockedMaterialLegacyIds: Set<number>;
  batch1Baseline: Batch1BaselineSummary;
  workshopPickBaseBaseline: WorkshopPickBaseBaselineSummary;
  pickLinesByMaterialId: Map<number, CurrentPickOrderLineRecord[]>;
  pickOrderMapByLegacyId: Map<
    number,
    { targetOrderId: number; documentNo: string }
  >;
  existingWorkshopMaterialDocumentNos: Set<string>;
  excludedPickLegacyIds: Set<number>;
}

export interface ArchivedFieldPayloadRecord {
  legacyTable: string;
  legacyId: number;
  targetTable: "workshop_material_order" | "workshop_material_order_line";
  targetCode: string;
  payloadKind: "legacy-unmapped-fields";
  archiveReason: string;
  payload: Record<string, unknown>;
}

export interface PendingRelationRecord {
  legacyTable: ReturnOrderSourceTable;
  legacyId: number;
  legacyLineId: number;
  pendingReason: PendingRelationReasonCode;
  payload: {
    materialLegacyId: number | null;
    targetMaterialId: number | null;
    returnQty: string | null;
    returnDate: string | null;
    targetWorkshopId: number | null;
    candidateCount: number;
    candidateSummary: Array<{
      targetLineId: number;
      targetOrderId: number;
      documentNo: string;
    }>;
    remarkEvidence: string | null;
  };
}

export interface ExcludedWorkshopReturnPlanRecord {
  legacyTable: ReturnOrderSourceTable;
  legacyId: number;
  exclusionReason: string;
  isHardBlocker: boolean;
  payload: Record<string, unknown>;
}

export interface WorkshopMaterialOrderTargetInsert {
  documentNo: string;
  orderType: WorkshopReturnOrderTypeValue;
  bizDate: string;
  handlerPersonnelId: number | null;
  workshopId: number;
  lifecycleStatus: DocumentLifecycleStatusValue;
  auditStatusSnapshot: AuditStatusSnapshotValue;
  inventoryEffectStatus: InventoryEffectStatusValue;
  revisionNo: number;
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

export interface WorkshopMaterialOrderLineTargetInsert {
  lineNo: number;
  materialId: number;
  materialCodeSnapshot: string;
  materialNameSnapshot: string;
  materialSpecSnapshot: string | null;
  unitCodeSnapshot: string;
  quantity: string;
  unitPrice: string;
  amount: string;
  sourceDocumentType: SourceDocumentTypeValue | null;
  sourceDocumentId: number | null;
  sourceDocumentLineId: number | null;
  remark: string | null;
  createdBy: string | null;
  createdAt: string | null;
  updatedBy: string | null;
  updatedAt: string | null;
}

export interface WorkshopReturnLinePlanRecord {
  legacyTable: ReturnDetailSourceTable;
  legacyId: number;
  parentLegacyTable: ReturnOrderSourceTable;
  parentLegacyId: number;
  targetTable: "workshop_material_order_line";
  targetCode: string;
  target: WorkshopMaterialOrderLineTargetInsert;
  archivedPayload: ArchivedFieldPayloadRecord;
}

export interface WorkshopReturnOrderPlanRecord {
  legacyTable: ReturnOrderSourceTable;
  legacyId: number;
  sourceDocumentNo: string;
  targetTable: "workshop_material_order";
  targetCode: string;
  target: WorkshopMaterialOrderTargetInsert;
  lines: WorkshopReturnLinePlanRecord[];
  archivedPayload: ArchivedFieldPayloadRecord;
}

export interface WorkshopReturnPlanCounts {
  sourceCounts: {
    orders: number;
    details: number;
    audits: number;
  };
  admittedOrders: number;
  admittedLines: number;
  admittedLinesWithNullSource: number;
  pendingRelationLines: number;
  excludedHeaders: number;
  pendingReasonCounts: Partial<Record<PendingRelationReasonCode, number>>;
}

export interface WorkshopReturnMigrationPlan {
  migrationBatch: string;
  admittedOrders: WorkshopReturnOrderPlanRecord[];
  pendingRelations: PendingRelationRecord[];
  excludedDocuments: ExcludedWorkshopReturnPlanRecord[];
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
  counts: WorkshopReturnPlanCounts;
  context: {
    batch1Baseline: Batch1BaselineSummary;
    workshopPickBaseBaseline: WorkshopPickBaseBaselineSummary;
    blockedMaterialLegacyIds: number[];
    sourceFieldBlocker: boolean;
  };
}

export interface WorkshopReturnExecutionResult {
  insertedOrUpdatedOrders: number;
  insertedOrUpdatedLines: number;
  archivedPayloadCount: number;
  pendingRelationCount: number;
  excludedDocumentCount: number;
}
