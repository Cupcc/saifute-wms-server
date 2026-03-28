import type { PendingRelationRecord } from "../customer-sales-return/types";
import { stableJsonStringify } from "../shared/deterministic";
import {
  buildDisallowedReasonBlockers,
  buildPendingDriftBlockers,
} from "./execute-guard";
import type {
  FinalizationArchiveCandidate,
  FinalizationPlan,
  PendingRelationDbRow,
} from "./types";
import { ALLOWED_FINALIZE_REASON, FINALIZE_ORIGINATING_BATCH } from "./types";

export function buildExpectedRelationsFromPlan(
  pendingRelations: PendingRelationRecord[],
): Array<{
  legacyTable: string;
  legacyId: number;
  legacyLineId: number;
  pendingReason: string;
  payloadJson: string;
}> {
  return [...pendingRelations]
    .sort(
      (left, right) =>
        left.legacyTable.localeCompare(right.legacyTable) ||
        left.legacyId - right.legacyId ||
        left.legacyLineId - right.legacyLineId,
    )
    .map((record) => ({
      legacyTable: record.legacyTable,
      legacyId: record.legacyId,
      legacyLineId: record.legacyLineId,
      pendingReason: record.pendingReason,
      payloadJson: stableJsonStringify(record.payload),
    }));
}

export function buildFinalizationPlan(
  currentPendingRows: PendingRelationDbRow[],
  deterministicPendingRelations: PendingRelationRecord[],
): FinalizationPlan {
  const blockers: Array<{ reason: string; details?: Record<string, unknown> }> =
    [];

  const expectedRelations = buildExpectedRelationsFromPlan(
    deterministicPendingRelations,
  );

  const disallowedBlockers = buildDisallowedReasonBlockers({
    pendingRows: currentPendingRows,
  });

  const driftBlockers = buildPendingDriftBlockers({
    currentPendingRows,
    expectedRelations,
  });

  blockers.push(
    ...disallowedBlockers.map((b) => ({
      reason: String(b.reason),
      details: b,
    })),
    ...driftBlockers.map((b) => ({
      reason: String(b.reason),
      details: b,
    })),
  );

  const eligibleRows = currentPendingRows.filter(
    (row) => row.pendingReason === ALLOWED_FINALIZE_REASON,
  );

  const archiveCandidates: FinalizationArchiveCandidate[] = eligibleRows
    .sort(
      (left, right) =>
        left.legacyTable.localeCompare(right.legacyTable) ||
        left.legacyId - right.legacyId ||
        left.legacyLineId - right.legacyLineId,
    )
    .map((row) => ({
      legacyTable: row.legacyTable,
      legacyId: row.legacyId,
      legacyLineId: row.legacyLineId,
      archiveReason: row.pendingReason,
      payloadJson: row.payloadJson,
    }));

  const affectedLegacyIds = [
    ...new Set(archiveCandidates.map((c) => c.legacyId)),
  ].sort((left, right) => left - right);

  const reasonCounts: Record<string, number> = {};

  for (const row of currentPendingRows) {
    reasonCounts[row.pendingReason] =
      (reasonCounts[row.pendingReason] ?? 0) + 1;
  }

  return {
    originatingBatch: FINALIZE_ORIGINATING_BATCH,
    archiveCandidates,
    affectedLegacyIds,
    affectedHeaderCount: affectedLegacyIds.length,
    reasonCounts,
    blockers,
  };
}

export function hasFinalizationBlockers(plan: FinalizationPlan): boolean {
  return plan.blockers.length > 0;
}

export function buildDryRunSummary(
  plan: FinalizationPlan,
  currentPendingCount: number,
): Record<string, unknown> {
  return {
    sliceType: "archive/finalization",
    originatingBatch: plan.originatingBatch,
    currentPendingRelationCount: currentPendingCount,
    archiveCandidateCount: plan.archiveCandidates.length,
    affectedHeaderCount: plan.affectedHeaderCount,
    affectedLegacyIds: plan.affectedLegacyIds,
    reasonCounts: plan.reasonCounts,
    archiveCandidateSummary: plan.archiveCandidates.map((c) => ({
      legacyTable: c.legacyTable,
      legacyId: c.legacyId,
      legacyLineId: c.legacyLineId,
      archiveReason: c.archiveReason,
    })),
    blockers: plan.blockers,
    businessSignOffRequired: true,
    businessSignOffNote:
      "Excluded sales-return headers remain non-empty after finalization. Manual business sign-off is required before cutover.",
  };
}
