export const INVENTORY_REPLAY_MIGRATION_BATCH = "batch4-inventory-replay";

export type StockDirection = "IN" | "OUT";
export type SourceUsageStatusValue =
  | "ALLOCATED"
  | "PARTIALLY_RELEASED"
  | "RELEASED";

export type InventoryOperationType =
  | "ACCEPTANCE_IN"
  | "PRODUCTION_RECEIPT_IN"
  | "PRICE_CORRECTION_IN"
  | "PRICE_CORRECTION_OUT"
  | "OUTBOUND_OUT"
  | "SALES_RETURN_IN"
  | "PICK_OUT"
  | "RETURN_IN"
  | "SCRAP_OUT"
  | "RD_PROJECT_OUT"
  | "RD_HANDOFF_OUT"
  | "RD_HANDOFF_IN"
  | "RD_STOCKTAKE_IN"
  | "RD_STOCKTAKE_OUT"
  | "REVERSAL_IN"
  | "REVERSAL_OUT";

export const REPLAY_FIFO_SOURCE_OPERATION_TYPES = [
  "ACCEPTANCE_IN",
  "PRODUCTION_RECEIPT_IN",
  "PRICE_CORRECTION_IN",
  "RD_HANDOFF_IN",
] as const satisfies readonly InventoryOperationType[];

export const REPLAY_CONSUMER_OPERATION_TYPES = [
  "PRICE_CORRECTION_OUT",
  "OUTBOUND_OUT",
  "PICK_OUT",
  "SCRAP_OUT",
  "RD_PROJECT_OUT",
  "RD_HANDOFF_OUT",
  "RD_STOCKTAKE_OUT",
  "REVERSAL_OUT",
] as const satisfies readonly InventoryOperationType[];

export interface InventoryReplayCoverageGap {
  family: string;
  effectiveRows: number;
  reason: string;
}

export interface InventoryEvent {
  bizDate: string;
  direction: StockDirection;
  operationType: InventoryOperationType;
  businessModule: string;
  businessDocumentType: string;
  businessDocumentId: number;
  businessDocumentNumber: string;
  businessDocumentLineId: number;
  materialId: number;
  stockScopeId: number;
  workshopId: number | null;
  changeQty: string;
  unitCost: string | null;
  costAmount: string | null;
  selectedUnitCost: string | null;
  sourceDocumentType: string | null;
  sourceDocumentId: number | null;
  sourceDocumentLineId: number | null;
  transferInStockScopeId: number | null;
  transferInWorkshopId: number | null;
  remark?: string | null;
  idempotencyKey: string;
  operatorId: string | null;
  occurredAt: string;
  sortPriority: number;
}

export interface PlannedBalanceRow {
  materialId: number;
  stockScopeId: number;
  quantityOnHand: string;
}

export interface PlannedLogInsert {
  bizDate: string;
  materialId: number;
  stockScopeId: number;
  workshopId: number | null;
  direction: StockDirection;
  operationType: InventoryOperationType;
  businessModule: string;
  businessDocumentType: string;
  businessDocumentId: number;
  businessDocumentNumber: string;
  businessDocumentLineId: number;
  changeQty: string;
  beforeQty: string;
  afterQty: string;
  unitCost: string | null;
  costAmount: string | null;
  operatorId: string | null;
  occurredAt: string;
  idempotencyKey: string;
  note: string | null;
}

export interface PlannedSourceUsageInsert {
  materialId: number;
  sourceLogIdempotencyKey: string;
  consumerDocumentType: string;
  consumerDocumentId: number;
  consumerLineId: number;
  allocatedQty: string;
  releasedQty: string;
  status: SourceUsageStatusValue;
}

export interface PlannedPriceLayerRow {
  materialId: number;
  stockScopeId: number;
  unitCost: string;
  availableQty: string;
  sourceLogCount: number;
}

export interface PriceLayerReconciliationRow {
  materialId: number;
  stockScopeId: number;
  balanceQty: string;
  sourceAvailableQty: string;
  differenceQty: string;
}

export interface ReturnSourceLinkCandidateRow {
  returnDocumentType: string;
  returnDocumentId: number;
  returnDocumentNumber: string;
  returnLineId: number;
  returnOperationType: "SALES_RETURN_IN" | "RETURN_IN";
  returnBizDate: string;
  materialId: number;
  stockScopeId: number;
  workshopId: number | null;
  returnQty: string;
  returnUnitCost: string | null;
  returnRemark: string | null;
  remarkTargetDates: string[];
  candidateCount: number;
  coveringCandidateCount: number;
  recommendedAction:
    | "review-and-link-unique-covering-candidate"
    | "manual-review-multiple-covering-candidates"
    | "manual-review-no-full-quantity-candidate"
    | "manual-review-no-candidate";
  suggestedSourceDocumentType: string | null;
  suggestedSourceDocumentId: number | null;
  suggestedSourceDocumentNumber: string | null;
  suggestedSourceLineId: number | null;
  candidates: Array<{
    sourceDocumentType: string;
    sourceDocumentId: number;
    sourceDocumentNumber: string;
    sourceLineId: number;
    sourceOperationType: "OUTBOUND_OUT" | "PICK_OUT";
    sourceBizDate: string;
    sourceQty: string;
    alreadyLinkedReturnQty: string;
    remainingReturnableQty: string;
    sourceUnitCost: string | null;
    sourceRemark?: string | null;
    remarkDateMatches?: boolean | null;
    remarkMatchedDate?: string | null;
    daysBeforeReturn: number;
    sameWorkshop: boolean | null;
    unitCostMatches: boolean | null;
  }>;
}

export interface InventoryReplayBlocker {
  severity: "blocker";
  reason: string;
  details?: Record<string, unknown>;
}

export interface InventoryReplayPlan {
  migrationBatch: string;
  events: InventoryEvent[];
  plannedBalances: PlannedBalanceRow[];
  plannedLogs: PlannedLogInsert[];
  plannedSourceUsages: PlannedSourceUsageInsert[];
  plannedPriceLayers: PlannedPriceLayerRow[];
  priceLayerReconciliation: PriceLayerReconciliationRow[];
  returnSourceLinkCandidates: ReturnSourceLinkCandidateRow[];
  eventCounts: Record<InventoryOperationType, number>;
  uniqueBalanceBuckets: number;
  warnings: string[];
  blockers: InventoryReplayBlocker[];
  coverageGaps: InventoryReplayCoverageGap[];
  negativeBalanceMaterials: Array<{
    materialId: number;
    stockScopeId: number;
    finalQty: string;
  }>;
}

export interface InventoryReplayExecutionResult {
  deletedSourceUsages: number;
  deletedLogs: number;
  deletedBalances: number;
  insertedBalances: number;
  insertedLogs: number;
  insertedSourceUsages: number;
}
