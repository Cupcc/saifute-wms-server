import { normalizeOptionalText } from "../shared/deterministic";
import { BusinessDocumentType } from "../shared/business-document-type";
import type {
  ArchivedIntervalPlanRecord,
  FactoryNumberReservationTargetInsert,
  LegacyIntervalRow,
  LegacyIntervalSnapshot,
  LineBackfillPlanRecord,
  MappedOutboundLineRecord,
  MappedOutboundOrderRecord,
  OutboundReservationDependencySnapshot,
  OutboundReservationGlobalBlocker,
  OutboundReservationMigrationPlan,
  OutboundReservationPlanCounts,
  ReservationPlanRecord,
  ReservationStatusValue,
} from "./types";
import { OUTBOUND_RESERVATION_MIGRATION_BATCH } from "./types";

const SUPPORTED_ORDER_TYPES = new Set([2, 4, 7]);
const SALES_STOCK_DOCUMENT_TYPE = BusinessDocumentType.SalesStockOrder;

interface NormalizedIntervalRange {
  startNumber: string;
  endNumber: string;
}

interface OrderTypeCounts {
  orderType2: number;
  orderType4: number;
  orderType7: number;
  unexpected: number;
}

function normalizePositiveInteger(
  value: string | number | null | undefined,
): number | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const numericValue = Number(value);

  if (!Number.isSafeInteger(numericValue) || numericValue <= 0) {
    return null;
  }

  return numericValue;
}

function normalizeAllowedOrderType(
  value: string | number | null | undefined,
): number | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const numericValue = Number(value);

  if (!Number.isSafeInteger(numericValue)) {
    return null;
  }

  return numericValue;
}

function normalizeIntervalEndpoint(
  value: string | number | null | undefined,
): bigint | null {
  const normalized = normalizeOptionalText(value);

  if (!normalized || !/^\d+$/u.test(normalized)) {
    return null;
  }

  const endpoint = BigInt(normalized);
  return endpoint > 0n ? endpoint : null;
}

function normalizeIntervalRange(
  interval: Pick<LegacyIntervalRow, "startNum" | "endNum">,
): NormalizedIntervalRange | null {
  const startNumber = normalizeIntervalEndpoint(interval.startNum);
  const endNumber = normalizeIntervalEndpoint(interval.endNum);

  if (!startNumber || !endNumber || startNumber > endNumber) {
    return null;
  }

  return {
    startNumber: startNumber.toString(),
    endNumber: endNumber.toString(),
  };
}

function toDateTimeFromDate(value: string | null): string | null {
  return value ? `${value} 00:00:00` : null;
}

function normalizeDate(value: string | null | undefined): string | null {
  const normalized = normalizeOptionalText(value);

  if (!normalized) {
    return null;
  }

  const match = normalized.match(/^(\d{4}-\d{2}-\d{2})/u);
  return match?.[1] ?? null;
}

function normalizeDateTime(value: string | null | undefined): string | null {
  const normalized = normalizeOptionalText(value);
  return normalized ? normalized.slice(0, 19) : null;
}

function resolveReservationStatus(
  lifecycleStatus: string | null,
): ReservationStatusValue | null {
  if (lifecycleStatus === "EFFECTIVE") {
    return "RESERVED";
  }

  if (lifecycleStatus === "VOIDED") {
    return "RELEASED";
  }

  return null;
}

function resolveReservedAt(order: MappedOutboundOrderRecord): string | null {
  return (
    normalizeDateTime(order.createdAt) ??
    toDateTimeFromDate(normalizeDate(order.bizDate))
  );
}

function resolveReleasedAt(order: MappedOutboundOrderRecord): string | null {
  return (
    normalizeDateTime(order.voidedAt) ??
    normalizeDateTime(order.updatedAt) ??
    normalizeDateTime(order.createdAt) ??
    toDateTimeFromDate(normalizeDate(order.bizDate))
  );
}

function buildReservationTargetCode(
  line: MappedOutboundLineRecord,
  range: NormalizedIntervalRange,
): string {
  const lineCode =
    normalizeOptionalText(line.actualTargetCode) ??
    normalizeOptionalText(line.targetCode) ??
    `line-${line.targetId}`;
  return `${lineCode}@${range.startNumber}-${range.endNumber}`;
}

function buildArchivePayload(
  interval: LegacyIntervalRow,
  details?: Record<string, unknown>,
): Record<string, unknown> {
  return {
    detailLegacyId: normalizePositiveInteger(interval.detailLegacyId),
    endNum: normalizeOptionalText(interval.endNum),
    orderType: normalizeAllowedOrderType(interval.orderType),
    startNum: normalizeOptionalText(interval.startNum),
    ...details,
  };
}

function buildArchivedInterval(
  interval: LegacyIntervalRow,
  archiveReason: string,
  details?: Record<string, unknown>,
): ArchivedIntervalPlanRecord {
  return {
    legacyTable: interval.legacyTable,
    legacyId: interval.legacyId,
    orderType: normalizeAllowedOrderType(interval.orderType),
    archiveReason,
    payload: buildArchivePayload(interval, details),
  };
}

function buildOrderTypeCounts(
  intervals: readonly LegacyIntervalRow[],
): OrderTypeCounts {
  return intervals.reduce<OrderTypeCounts>(
    (counts, interval) => {
      const orderType = normalizeAllowedOrderType(interval.orderType);

      switch (orderType) {
        case 2:
          counts.orderType2 += 1;
          break;
        case 4:
          counts.orderType4 += 1;
          break;
        case 7:
          counts.orderType7 += 1;
          break;
        default:
          counts.unexpected += 1;
          break;
      }

      return counts;
    },
    {
      orderType2: 0,
      orderType4: 0,
      orderType7: 0,
      unexpected: 0,
    },
  );
}

function buildOutboundDetailParentMap(
  snapshot: LegacyIntervalSnapshot,
): Map<number, number> {
  return new Map(
    snapshot.outboundDetailReferences.map(
      (row) => [row.legacyId, row.parentLegacyId] as const,
    ),
  );
}

function describeTargetMismatch(
  order: MappedOutboundOrderRecord,
  line: MappedOutboundLineRecord,
): string[] {
  const mismatches: string[] = [];

  if (
    order.targetId <= 0 ||
    line.targetId <= 0 ||
    line.orderTargetId === null ||
    line.orderTargetId <= 0
  ) {
    mismatches.push("missing target ids");
  }

  if (
    normalizeOptionalText(order.actualTargetCode) !==
    normalizeOptionalText(order.targetCode)
  ) {
    mismatches.push("order target code drift");
  }

  if (
    normalizeOptionalText(line.actualTargetCode) !==
    normalizeOptionalText(line.targetCode)
  ) {
    mismatches.push("line target code drift");
  }

  if (line.orderTargetId !== order.targetId) {
    mismatches.push("line parent order mismatch");
  }

  if (line.materialId === null || line.materialId <= 0) {
    mismatches.push("missing mapped material");
  }

  if (order.workshopId === null || order.workshopId <= 0) {
    mismatches.push("missing mapped workshop");
  }

  if (!resolveReservationStatus(order.lifecycleStatus)) {
    mismatches.push("unsupported lifecycle status");
  }

  if (!resolveReservedAt(order)) {
    mismatches.push("missing reservedAt source");
  }

  return mismatches;
}

function buildLineBackfills(
  liveReservations: readonly ReservationPlanRecord[],
  lineByTargetId: Map<number, MappedOutboundLineRecord>,
): LineBackfillPlanRecord[] {
  const reservationsByLineId = new Map<number, ReservationPlanRecord[]>();

  for (const reservation of liveReservations) {
    const existingReservations =
      reservationsByLineId.get(reservation.target.businessDocumentLineId) ?? [];
    existingReservations.push(reservation);
    reservationsByLineId.set(
      reservation.target.businessDocumentLineId,
      existingReservations,
    );
  }

  return Array.from(reservationsByLineId.entries())
    .sort(([left], [right]) => left - right)
    .map(([targetLineId, reservations]) => {
      const [firstReservation] = [...reservations].sort(
        (left, right) => left.legacyId - right.legacyId,
      );
      const line = lineByTargetId.get(targetLineId);
      const targetLineCode =
        normalizeOptionalText(line?.actualTargetCode) ??
        normalizeOptionalText(line?.targetCode) ??
        `line-${targetLineId}`;
      const liveSegmentCount = reservations.length;

      return {
        targetLineId,
        targetLineCode,
        startNumber:
          liveSegmentCount === 1
            ? (firstReservation?.target.startNumber ?? null)
            : null,
        endNumber:
          liveSegmentCount === 1
            ? (firstReservation?.target.endNumber ?? null)
            : null,
        liveSegmentCount,
        preservedSourceDocumentType: line?.sourceDocumentType ?? null,
        preservedSourceDocumentId: line?.sourceDocumentId ?? null,
        preservedSourceDocumentLineId: line?.sourceDocumentLineId ?? null,
      };
    });
}

function buildPlanCounts(
  snapshot: LegacyIntervalSnapshot,
  liveReservations: readonly ReservationPlanRecord[],
  archivedIntervals: readonly ArchivedIntervalPlanRecord[],
  lineBackfills: readonly LineBackfillPlanRecord[],
): OutboundReservationPlanCounts {
  const sourceByOrderType = buildOrderTypeCounts(snapshot.intervals);

  return {
    sourceIntervalCount: snapshot.intervals.length,
    liveReservationCount: liveReservations.length,
    archivedIntervalCount: archivedIntervals.length,
    sourceByOrderType,
    liveOrderType4Count: liveReservations.length,
    archivedOrderType4Count: archivedIntervals.filter(
      (record) => record.orderType === 4,
    ).length,
    archivedOrderType2Count: archivedIntervals.filter(
      (record) => record.orderType === 2,
    ).length,
    archivedOrderType7Count: archivedIntervals.filter(
      (record) => record.orderType === 7,
    ).length,
    singleIntervalLineBackfillCount: lineBackfills.filter(
      (record) => record.liveSegmentCount === 1,
    ).length,
    multiIntervalLiveLineCount: lineBackfills.filter(
      (record) => record.liveSegmentCount > 1,
    ).length,
  };
}

export function buildOutboundReservationMigrationPlan(
  snapshot: LegacyIntervalSnapshot,
  dependencies: OutboundReservationDependencySnapshot,
): OutboundReservationMigrationPlan {
  const liveReservations: ReservationPlanRecord[] = [];
  const archivedIntervals: ArchivedIntervalPlanRecord[] = [];
  const globalBlockers: OutboundReservationGlobalBlocker[] = [];
  const unexpectedOrderTypes = new Set<number>();
  const invalidOrderTypeIntervalIds: number[] = [];
  const targetMismatchLegacyIds: number[] = [];
  const outboundDetailParentByLegacyId = buildOutboundDetailParentMap(snapshot);
  const lineByTargetId = new Map<number, MappedOutboundLineRecord>();

  for (const line of dependencies.lineMapByLegacyId.values()) {
    lineByTargetId.set(line.targetId, line);
  }

  for (const issue of dependencies.outboundBaseBaseline.issues) {
    globalBlockers.push({
      reason: issue,
    });
  }

  for (const interval of [...snapshot.intervals].sort(
    (left, right) => left.legacyId - right.legacyId,
  )) {
    const orderType = normalizeAllowedOrderType(interval.orderType);

    if (!orderType || !SUPPORTED_ORDER_TYPES.has(orderType)) {
      if (orderType === null) {
        invalidOrderTypeIntervalIds.push(interval.legacyId);
      } else {
        unexpectedOrderTypes.add(orderType);
      }

      archivedIntervals.push(
        buildArchivedInterval(interval, "unexpected-order-type", {
          supportedOrderTypes: [2, 4, 7],
        }),
      );
      continue;
    }

    if (orderType === 2) {
      archivedIntervals.push(
        buildArchivedInterval(
          interval,
          "unsupported-order-type-2-production-in-interval",
        ),
      );
      continue;
    }

    if (orderType === 7) {
      archivedIntervals.push(
        buildArchivedInterval(
          interval,
          "unsupported-order-type-7-sales-return-interval",
        ),
      );
      continue;
    }

    const detailLegacyId = normalizePositiveInteger(interval.detailLegacyId);
    const parentLegacyId =
      detailLegacyId === null
        ? null
        : (outboundDetailParentByLegacyId.get(detailLegacyId) ?? null);

    if (detailLegacyId === null || parentLegacyId === null) {
      archivedIntervals.push(
        buildArchivedInterval(interval, "order-type-4-missing-line-map", {
          detailLegacyId,
          parentLegacyId,
        }),
      );
      continue;
    }

    const excludedOrder =
      dependencies.excludedOrderByLegacyId.get(parentLegacyId) ?? null;

    if (excludedOrder) {
      archivedIntervals.push(
        buildArchivedInterval(
          interval,
          "order-type-4-parent-document-excluded",
          {
            excludedDocumentReason: excludedOrder.exclusionReason,
            parentLegacyId,
          },
        ),
      );
      continue;
    }

    const line = dependencies.lineMapByLegacyId.get(detailLegacyId) ?? null;

    if (!line) {
      archivedIntervals.push(
        buildArchivedInterval(interval, "order-type-4-missing-line-map", {
          detailLegacyId,
          parentLegacyId,
        }),
      );
      continue;
    }

    const order = dependencies.orderMapByLegacyId.get(parentLegacyId) ?? null;

    if (!order) {
      archivedIntervals.push(
        buildArchivedInterval(interval, "order-type-4-missing-order-map", {
          detailLegacyId,
          parentLegacyId,
        }),
      );
      continue;
    }

    const normalizedRange = normalizeIntervalRange(interval);

    if (!normalizedRange) {
      archivedIntervals.push(
        buildArchivedInterval(interval, "order-type-4-invalid-range", {
          detailLegacyId,
          parentLegacyId,
        }),
      );
      continue;
    }

    const mismatches = describeTargetMismatch(order, line);

    if (mismatches.length > 0) {
      targetMismatchLegacyIds.push(interval.legacyId);
      archivedIntervals.push(
        buildArchivedInterval(interval, "order-type-4-target-row-mismatch", {
          detailLegacyId,
          mismatchReasons: mismatches,
          parentLegacyId,
        }),
      );
      continue;
    }

    const status = resolveReservationStatus(order.lifecycleStatus);
    const reservedAt = resolveReservedAt(order);
    const releasedAt = status === "RELEASED" ? resolveReleasedAt(order) : null;

    if (!status || !reservedAt || (status === "RELEASED" && !releasedAt)) {
      targetMismatchLegacyIds.push(interval.legacyId);
      archivedIntervals.push(
        buildArchivedInterval(interval, "order-type-4-target-row-mismatch", {
          detailLegacyId,
          mismatchReasons: ["reservation status timestamps are incomplete"],
          parentLegacyId,
        }),
      );
      continue;
    }

    const target: FactoryNumberReservationTargetInsert = {
      materialId: Number(line.materialId),
      workshopId: Number(order.workshopId),
      businessDocumentType: SALES_STOCK_DOCUMENT_TYPE,
      businessDocumentId: order.targetId,
      businessDocumentLineId: line.targetId,
      startNumber: normalizedRange.startNumber,
      endNumber: normalizedRange.endNumber,
      status,
      reservedAt,
      releasedAt,
      createdBy: null,
      createdAt: reservedAt,
      updatedBy: null,
      updatedAt: releasedAt ?? reservedAt,
    };

    liveReservations.push({
      legacyTable: interval.legacyTable,
      legacyId: interval.legacyId,
      detailLegacyId,
      parentLegacyTable: "saifute_outbound_order",
      parentLegacyId,
      targetTable: "factory_number_reservation",
      targetCode: buildReservationTargetCode(line, normalizedRange),
      target,
    });
  }

  if (invalidOrderTypeIntervalIds.length > 0) {
    globalBlockers.push({
      reason:
        "Legacy saifute_interval contains null or malformed order_type values outside the frozen {2,4,7} distribution.",
      details: {
        invalidOrderTypeIntervalIds: [...invalidOrderTypeIntervalIds].sort(
          (left, right) => left - right,
        ),
      },
    });
  }

  if (unexpectedOrderTypes.size > 0) {
    globalBlockers.push({
      reason:
        "Legacy saifute_interval contains unexpected order_type values outside the frozen {2,4,7} distribution.",
      details: {
        unexpectedOrderTypes: Array.from(unexpectedOrderTypes).sort(
          (left, right) => left - right,
        ),
      },
    });
  }

  if (targetMismatchLegacyIds.length > 0) {
    globalBlockers.push({
      reason:
        "One or more mapped order_type=4 intervals no longer match the batch2c outbound target state.",
      details: {
        affectedIntervalIds: [...targetMismatchLegacyIds].sort(
          (left, right) => left - right,
        ),
      },
    });
  }

  const sortedLiveReservations = [...liveReservations].sort(
    (left, right) => left.legacyId - right.legacyId,
  );
  const lineBackfills = buildLineBackfills(
    sortedLiveReservations,
    lineByTargetId,
  );
  const sortedArchivedIntervals = [...archivedIntervals].sort(
    (left, right) => left.legacyId - right.legacyId,
  );
  const counts = buildPlanCounts(
    snapshot,
    sortedLiveReservations,
    sortedArchivedIntervals,
    lineBackfills,
  );

  return {
    migrationBatch: OUTBOUND_RESERVATION_MIGRATION_BATCH,
    liveReservations: sortedLiveReservations,
    archivedIntervals: sortedArchivedIntervals,
    lineBackfills,
    globalBlockers,
    counts,
    context: {
      outboundBaseBaseline: dependencies.outboundBaseBaseline,
      excludedOrderIds: Array.from(
        dependencies.excludedOrderByLegacyId.keys(),
      ).sort((left, right) => left - right),
      touchedLineIds: lineBackfills.map((record) => record.targetLineId),
      unexpectedOrderTypes: Array.from(unexpectedOrderTypes).sort(
        (left, right) => left - right,
      ),
    },
  };
}

export function hasExecutionBlockers(
  plan: OutboundReservationMigrationPlan,
): boolean {
  return plan.globalBlockers.length > 0;
}

export function buildDryRunSummary(
  plan: OutboundReservationMigrationPlan,
): Record<string, unknown> {
  const archiveReasonCounts = plan.archivedIntervals.reduce<
    Record<string, number>
  >((counts, record) => {
    counts[record.archiveReason] = (counts[record.archiveReason] ?? 0) + 1;
    return counts;
  }, {});

  return {
    migrationBatch: plan.migrationBatch,
    counts: plan.counts,
    archiveReasonCounts,
    globalBlockers: plan.globalBlockers,
    liveReservations: plan.liveReservations.map((record) => ({
      businessDocumentId: record.target.businessDocumentId,
      businessDocumentLineId: record.target.businessDocumentLineId,
      legacyId: record.legacyId,
      parentLegacyId: record.parentLegacyId,
      status: record.target.status,
      targetCode: record.targetCode,
    })),
    archivedIntervals: plan.archivedIntervals.map((record) => ({
      archiveReason: record.archiveReason,
      legacyId: record.legacyId,
      orderType: record.orderType,
    })),
    lineBackfills: plan.lineBackfills.map((record) => ({
      endNumber: record.endNumber,
      liveSegmentCount: record.liveSegmentCount,
      startNumber: record.startNumber,
      targetLineCode: record.targetLineCode,
      targetLineId: record.targetLineId,
    })),
    context: plan.context,
  };
}
