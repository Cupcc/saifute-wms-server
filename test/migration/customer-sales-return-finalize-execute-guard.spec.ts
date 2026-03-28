import {
  buildAlreadyArchivedMismatchBlockers,
  buildDisallowedReasonBlockers,
  buildPendingDriftBlockers,
} from "../../scripts/migration/customer-sales-return-finalize/execute-guard";
import type {
  ArchivedRelationDbRow,
  FinalizationArchiveCandidate,
  PendingRelationDbRow,
} from "../../scripts/migration/customer-sales-return-finalize/types";
import { ALLOWED_FINALIZE_REASON } from "../../scripts/migration/customer-sales-return-finalize/types";
import { stableJsonStringify } from "../../scripts/migration/shared/deterministic";

function makePendingPayload(
  legacyId: number,
  legacyLineId: number,
): Record<string, unknown> {
  return {
    materialLegacyId: 700 + legacyId,
    targetMaterialId: 1700 + legacyId,
    returnQty: "3.000",
    returnDate: "2026-02-10",
    targetCustomerId: 5200 + legacyId,
    candidateCount: 0,
    candidateSummary: [],
    intervalEvidence: null,
    remarkEvidence: `detail-${legacyLineId}`,
  };
}

function makePendingDbRow(
  legacyId: number,
  legacyLineId: number,
  pendingReason: string = ALLOWED_FINALIZE_REASON,
  payloadOverride?: Record<string, unknown>,
): PendingRelationDbRow {
  return {
    legacyTable: "saifute_sales_return_order",
    legacyId,
    legacyLineId,
    pendingReason,
    payloadJson: stableJsonStringify(
      payloadOverride ?? makePendingPayload(legacyId, legacyLineId),
    ),
  };
}

function makeExpectedRelation(
  legacyId: number,
  legacyLineId: number,
  pendingReason: string = ALLOWED_FINALIZE_REASON,
): {
  legacyTable: string;
  legacyId: number;
  legacyLineId: number;
  pendingReason: string;
  payloadJson: string;
} {
  return {
    legacyTable: "saifute_sales_return_order",
    legacyId,
    legacyLineId,
    pendingReason,
    payloadJson: stableJsonStringify(
      makePendingPayload(legacyId, legacyLineId),
    ),
  };
}

function makeArchiveCandidate(
  legacyId: number,
  legacyLineId: number,
): FinalizationArchiveCandidate {
  return {
    legacyTable: "saifute_sales_return_order",
    legacyId,
    legacyLineId,
    archiveReason: ALLOWED_FINALIZE_REASON,
    payloadJson: stableJsonStringify(
      makePendingPayload(legacyId, legacyLineId),
    ),
  };
}

function makeArchivedDbRow(
  legacyId: number,
  legacyLineId: number,
  archiveReason: string = ALLOWED_FINALIZE_REASON,
  payloadOverride?: Record<string, unknown>,
): ArchivedRelationDbRow {
  return {
    legacyTable: "saifute_sales_return_order",
    legacyId,
    legacyLineId,
    archiveReason,
    payloadJson: stableJsonStringify(
      payloadOverride ?? makePendingPayload(legacyId, legacyLineId),
    ),
  };
}

describe("customer-sales-return-finalize execute guard", () => {
  describe("buildDisallowedReasonBlockers", () => {
    it("should allow execute when all pending rows use the allowed reason", () => {
      expect(
        buildDisallowedReasonBlockers({
          pendingRows: [makePendingDbRow(15, 22), makePendingDbRow(16, 24)],
        }),
      ).toEqual([]);
    });

    it("should block when any row has a disallowed pending_reason", () => {
      const blockers = buildDisallowedReasonBlockers({
        pendingRows: [
          makePendingDbRow(15, 22),
          makePendingDbRow(16, 24, "multiple-upstream-line-candidates"),
        ],
      });

      expect(blockers).toHaveLength(1);
      expect(blockers[0]).toEqual(
        expect.objectContaining({
          disallowedCount: 1,
        }),
      );
    });

    it("should report all disallowed rows when multiple exist", () => {
      const blockers = buildDisallowedReasonBlockers({
        pendingRows: [
          makePendingDbRow(15, 22, "missing-mapped-material"),
          makePendingDbRow(16, 24, "upstream-customer-mismatch"),
          makePendingDbRow(18, 26),
        ],
      });

      expect(blockers).toHaveLength(1);
      expect(blockers[0]).toEqual(
        expect.objectContaining({
          disallowedCount: 2,
        }),
      );
    });

    it("should allow execute when pending rows list is empty", () => {
      expect(buildDisallowedReasonBlockers({ pendingRows: [] })).toEqual([]);
    });
  });

  describe("buildPendingDriftBlockers", () => {
    it("should not block when current pending rows exactly match the deterministic plan", () => {
      const blockers = buildPendingDriftBlockers({
        currentPendingRows: [
          makePendingDbRow(15, 22),
          makePendingDbRow(16, 24),
        ],
        expectedRelations: [
          makeExpectedRelation(15, 22),
          makeExpectedRelation(16, 24),
        ],
      });

      expect(blockers).toEqual([]);
    });

    it("should block when count mismatches (more DB rows than expected)", () => {
      const blockers = buildPendingDriftBlockers({
        currentPendingRows: [
          makePendingDbRow(15, 22),
          makePendingDbRow(15, 23),
        ],
        expectedRelations: [makeExpectedRelation(15, 22)],
      });

      const countBlocker = blockers.find((b) =>
        String(b.reason).includes("count differs"),
      );
      expect(countBlocker).toBeDefined();
    });

    it("should block when count mismatches (fewer DB rows than expected)", () => {
      const blockers = buildPendingDriftBlockers({
        currentPendingRows: [makePendingDbRow(15, 22)],
        expectedRelations: [
          makeExpectedRelation(15, 22),
          makeExpectedRelation(15, 23),
        ],
      });

      const countBlocker = blockers.find((b) =>
        String(b.reason).includes("count differs"),
      );
      expect(countBlocker).toBeDefined();
    });

    it("should block when an expected row is missing from DB", () => {
      const blockers = buildPendingDriftBlockers({
        currentPendingRows: [makePendingDbRow(15, 22)],
        expectedRelations: [
          makeExpectedRelation(15, 22),
          makeExpectedRelation(16, 24),
        ],
      });

      const missingBlocker = blockers.find((b) =>
        String(b.reason).toLowerCase().includes("missing"),
      );
      expect(missingBlocker).toBeDefined();
    });

    it("should block when DB contains unexpected rows not in the plan", () => {
      const blockers = buildPendingDriftBlockers({
        currentPendingRows: [
          makePendingDbRow(15, 22),
          makePendingDbRow(99, 999),
        ],
        expectedRelations: [
          makeExpectedRelation(15, 22),
          makeExpectedRelation(99, 999),
        ],
      });

      expect(blockers).toHaveLength(0);
    });

    it("should block when an existing DB row has a different pending_reason", () => {
      const blockers = buildPendingDriftBlockers({
        currentPendingRows: [
          makePendingDbRow(15, 22, "upstream-customer-mismatch"),
        ],
        expectedRelations: [makeExpectedRelation(15, 22)],
      });

      const reasonBlocker = blockers.find((b) =>
        String(b.reason).toLowerCase().includes("reason"),
      );
      expect(reasonBlocker).toBeDefined();
    });

    it("should block when payload JSON drifts from deterministic plan", () => {
      const blockers = buildPendingDriftBlockers({
        currentPendingRows: [
          makePendingDbRow(15, 22, ALLOWED_FINALIZE_REASON, {
            materialLegacyId: 999,
            targetMaterialId: null,
            returnQty: "100.000",
            returnDate: "2020-01-01",
            targetCustomerId: null,
            candidateCount: 0,
            candidateSummary: [],
            intervalEvidence: null,
            remarkEvidence: null,
          }),
        ],
        expectedRelations: [makeExpectedRelation(15, 22)],
      });

      const payloadBlocker = blockers.find((b) =>
        String(b.reason).toLowerCase().includes("payload"),
      );
      expect(payloadBlocker).toBeDefined();
    });

    it("should handle empty pending rows and empty expected relations without blocking", () => {
      const blockers = buildPendingDriftBlockers({
        currentPendingRows: [],
        expectedRelations: [],
      });

      expect(blockers).toEqual([]);
    });
  });

  describe("buildAlreadyArchivedMismatchBlockers", () => {
    it("should allow execute when no archived rows exist yet (first run)", () => {
      const blockers = buildAlreadyArchivedMismatchBlockers({
        archivedRows: [],
        expectedCandidates: [makeArchiveCandidate(15, 22)],
      });

      expect(blockers).toEqual([]);
    });

    it("should allow re-execute when existing archived rows exactly match the expected candidates", () => {
      const blockers = buildAlreadyArchivedMismatchBlockers({
        archivedRows: [makeArchivedDbRow(15, 22), makeArchivedDbRow(16, 24)],
        expectedCandidates: [
          makeArchiveCandidate(15, 22),
          makeArchiveCandidate(16, 24),
        ],
      });

      expect(blockers).toEqual([]);
    });

    it("should block when archived rows contain rows outside the expected candidate set", () => {
      const blockers = buildAlreadyArchivedMismatchBlockers({
        archivedRows: [makeArchivedDbRow(15, 22), makeArchivedDbRow(99, 999)],
        expectedCandidates: [makeArchiveCandidate(15, 22)],
      });

      const unexpectedBlocker = blockers.find((b) =>
        String(b.reason).toLowerCase().includes("unexpected"),
      );
      expect(unexpectedBlocker).toBeDefined();
    });

    it("should block when an archived row has a mismatched archive_reason", () => {
      const blockers = buildAlreadyArchivedMismatchBlockers({
        archivedRows: [makeArchivedDbRow(15, 22, "wrong-reason")],
        expectedCandidates: [makeArchiveCandidate(15, 22)],
      });

      const reasonBlocker = blockers.find((b) =>
        String(b.reason).toLowerCase().includes("reason"),
      );
      expect(reasonBlocker).toBeDefined();
    });

    it("should block when an archived row has a mismatched payload_json", () => {
      const blockers = buildAlreadyArchivedMismatchBlockers({
        archivedRows: [
          makeArchivedDbRow(15, 22, ALLOWED_FINALIZE_REASON, {
            materialLegacyId: 999,
            targetMaterialId: null,
            returnQty: "0.000",
            returnDate: null,
            targetCustomerId: null,
            candidateCount: 0,
            candidateSummary: [],
            intervalEvidence: null,
            remarkEvidence: null,
          }),
        ],
        expectedCandidates: [makeArchiveCandidate(15, 22)],
      });

      const payloadBlocker = blockers.find((b) =>
        String(b.reason).toLowerCase().includes("payload"),
      );
      expect(payloadBlocker).toBeDefined();
    });

    it("should allow empty archived rows and empty expected candidates", () => {
      const blockers = buildAlreadyArchivedMismatchBlockers({
        archivedRows: [],
        expectedCandidates: [],
      });

      expect(blockers).toEqual([]);
    });
  });
});
