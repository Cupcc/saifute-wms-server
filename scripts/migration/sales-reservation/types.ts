import type { BusinessDocumentTypeValue } from "../shared/business-document-type";

export const OUTBOUND_RESERVATION_MIGRATION_BATCH =
  "batch3a-outbound-order-type4-reservation";
export const OUTBOUND_BASE_MIGRATION_BATCH = "batch2c-outbound-base";

export type ReservationBusinessDocumentTypeValue = BusinessDocumentTypeValue;
export type ReservationStatusValue = "RESERVED" | "RELEASED";

export interface LegacyIntervalRow {
  legacyTable: "saifute_interval";
  legacyId: number;
  orderType: number | null;
  detailLegacyId: number | null;
  startNum: string | number | null;
  endNum: string | number | null;
}

export interface LegacyOutboundDetailReferenceRow {
  legacyId: number;
  parentLegacyId: number;
}

export interface LegacyIntervalSnapshot {
  intervals: LegacyIntervalRow[];
  outboundDetailReferences: LegacyOutboundDetailReferenceRow[];
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

export interface MappedOutboundOrderRecord {
  legacyTable: "saifute_outbound_order";
  legacyId: number;
  targetTable: "sales_stock_order";
  targetId: number;
  targetCode: string | null;
  actualTargetCode: string | null;
  lifecycleStatus: string | null;
  workshopId: number | null;
  bizDate: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  voidedAt: string | null;
}

export interface MappedOutboundLineRecord {
  legacyTable: "saifute_outbound_detail";
  legacyId: number;
  targetTable: "sales_stock_order_line";
  targetId: number;
  targetCode: string | null;
  actualTargetCode: string | null;
  orderTargetId: number | null;
  lineNo: number | null;
  materialId: number | null;
  startNumber: string | null;
  endNumber: string | null;
  sourceDocumentType: string | null;
  sourceDocumentId: number | null;
  sourceDocumentLineId: number | null;
}

export interface ExcludedOutboundDocumentRecord {
  legacyTable: "saifute_outbound_order";
  legacyId: number;
  exclusionReason: string;
  payloadJson: string;
}

export interface OutboundReservationDependencySnapshot {
  orderMapByLegacyId: Map<number, MappedOutboundOrderRecord>;
  lineMapByLegacyId: Map<number, MappedOutboundLineRecord>;
  excludedOrderByLegacyId: Map<number, ExcludedOutboundDocumentRecord>;
  outboundBaseBaseline: OutboundBaseBaselineSummary;
}

export interface OutboundReservationGlobalBlocker {
  reason: string;
  details?: Record<string, unknown>;
}

export interface FactoryNumberReservationTargetInsert {
  materialId: number;
  workshopId: number;
  businessDocumentType: ReservationBusinessDocumentTypeValue;
  businessDocumentId: number;
  businessDocumentLineId: number;
  startNumber: string;
  endNumber: string;
  status: ReservationStatusValue;
  reservedAt: string;
  releasedAt: string | null;
  createdBy: null;
  createdAt: string;
  updatedBy: null;
  updatedAt: string;
}

export interface ReservationPlanRecord {
  legacyTable: "saifute_interval";
  legacyId: number;
  detailLegacyId: number;
  parentLegacyTable: "saifute_outbound_order";
  parentLegacyId: number;
  targetTable: "factory_number_reservation";
  targetCode: string;
  target: FactoryNumberReservationTargetInsert;
}

export interface LineBackfillPlanRecord {
  targetLineId: number;
  targetLineCode: string;
  startNumber: string | null;
  endNumber: string | null;
  liveSegmentCount: number;
  preservedSourceDocumentType: string | null;
  preservedSourceDocumentId: number | null;
  preservedSourceDocumentLineId: number | null;
}

export interface ArchivedIntervalPlanRecord {
  legacyTable: "saifute_interval";
  legacyId: number;
  orderType: number | null;
  archiveReason: string;
  payload: Record<string, unknown>;
}

export interface OutboundReservationPlanCounts {
  sourceIntervalCount: number;
  liveReservationCount: number;
  archivedIntervalCount: number;
  sourceByOrderType: {
    orderType2: number;
    orderType4: number;
    orderType7: number;
    unexpected: number;
  };
  liveOrderType4Count: number;
  archivedOrderType4Count: number;
  archivedOrderType2Count: number;
  archivedOrderType7Count: number;
  singleIntervalLineBackfillCount: number;
  multiIntervalLiveLineCount: number;
}

export interface OutboundReservationMigrationPlan {
  migrationBatch: string;
  liveReservations: ReservationPlanRecord[];
  archivedIntervals: ArchivedIntervalPlanRecord[];
  lineBackfills: LineBackfillPlanRecord[];
  globalBlockers: OutboundReservationGlobalBlocker[];
  counts: OutboundReservationPlanCounts;
  context: {
    outboundBaseBaseline: OutboundBaseBaselineSummary;
    excludedOrderIds: number[];
    touchedLineIds: number[];
    unexpectedOrderTypes: number[];
  };
}

export interface OutboundReservationExecutionResult {
  insertedOrUpdatedReservations: number;
  archivedIntervalCount: number;
  touchedLineCount: number;
  singleIntervalLineBackfillCount: number;
}
