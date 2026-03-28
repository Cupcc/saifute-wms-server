import type { PendingRelationRecord } from "../../scripts/migration/customer-sales-return/types";
import {
  buildFinalizationPlan,
  hasFinalizationBlockers,
} from "../../scripts/migration/customer-sales-return-finalize/planner";
import type { PendingRelationDbRow } from "../../scripts/migration/customer-sales-return-finalize/types";
import {
  ALLOWED_FINALIZE_REASON,
  FINALIZE_ORIGINATING_BATCH,
} from "../../scripts/migration/customer-sales-return-finalize/types";
import { stableJsonStringify } from "../../scripts/migration/shared/deterministic";

function makePendingRecord(
  legacyId: number,
  legacyLineId: number,
  candidateCount = 0,
): PendingRelationRecord {
  return {
    legacyTable: "saifute_sales_return_order",
    legacyId,
    legacyLineId,
    pendingReason: "no-upstream-line-candidate",
    payload: {
      materialLegacyId: 701,
      targetMaterialId: 1701,
      returnQty: "2.000",
      returnDate: "2026-01-15",
      targetCustomerId: 5201,
      candidateCount,
      candidateSummary: [],
      intervalEvidence: null,
      remarkEvidence: null,
    },
  };
}

function makePendingDbRow(
  legacyId: number,
  legacyLineId: number,
  pendingReason: string = ALLOWED_FINALIZE_REASON,
  overridePayload?: Record<string, unknown>,
): PendingRelationDbRow {
  const record = makePendingRecord(legacyId, legacyLineId);
  const payload = overridePayload ?? record.payload;

  return {
    legacyTable: "saifute_sales_return_order",
    legacyId,
    legacyLineId,
    pendingReason,
    payloadJson: stableJsonStringify(payload),
  };
}

describe("customer-sales-return-finalize plan builder", () => {
  describe("buildFinalizationPlan - happy path", () => {
    it("should build a plan with archive candidates matching current DB pending rows", () => {
      const pending1 = makePendingRecord(15, 22);
      const pending2 = makePendingRecord(15, 23);
      const dbRow1 = makePendingDbRow(15, 22);
      const dbRow2 = makePendingDbRow(15, 23);

      const plan = buildFinalizationPlan(
        [dbRow1, dbRow2],
        [pending1, pending2],
      );

      expect(plan.originatingBatch).toBe(FINALIZE_ORIGINATING_BATCH);
      expect(plan.archiveCandidates).toHaveLength(2);
      expect(plan.affectedHeaderCount).toBe(1);
      expect(plan.affectedLegacyIds).toEqual([15]);
      expect(plan.reasonCounts[ALLOWED_FINALIZE_REASON]).toBe(2);
      expect(plan.blockers).toHaveLength(0);
    });

    it("should build a plan tracking multiple affected headers", () => {
      const pending1 = makePendingRecord(15, 22);
      const pending2 = makePendingRecord(16, 24);
      const dbRow1 = makePendingDbRow(15, 22);
      const dbRow2 = makePendingDbRow(16, 24);

      const plan = buildFinalizationPlan(
        [dbRow1, dbRow2],
        [pending1, pending2],
      );

      expect(plan.affectedHeaderCount).toBe(2);
      expect(plan.affectedLegacyIds).toEqual([15, 16]);
      expect(plan.blockers).toHaveLength(0);
    });

    it("should set archive_reason = pending_reason for each candidate", () => {
      const pending = makePendingRecord(15, 22);
      const dbRow = makePendingDbRow(15, 22);

      const plan = buildFinalizationPlan([dbRow], [pending]);

      expect(plan.archiveCandidates[0]?.archiveReason).toBe(
        ALLOWED_FINALIZE_REASON,
      );
    });

    it("should preserve payload JSON byte-for-byte from DB pending row", () => {
      const pending = makePendingRecord(15, 22);
      const expectedPayloadJson = stableJsonStringify(pending.payload);
      const dbRow = makePendingDbRow(15, 22);

      const plan = buildFinalizationPlan([dbRow], [pending]);

      expect(plan.archiveCandidates[0]?.payloadJson).toBe(expectedPayloadJson);
    });

    it("should sort archive candidates deterministically by legacyId then legacyLineId", () => {
      const pending1 = makePendingRecord(18, 27);
      const pending2 = makePendingRecord(18, 26);
      const pending3 = makePendingRecord(15, 22);
      const dbRow1 = makePendingDbRow(18, 27);
      const dbRow2 = makePendingDbRow(18, 26);
      const dbRow3 = makePendingDbRow(15, 22);

      const plan = buildFinalizationPlan(
        [dbRow1, dbRow2, dbRow3],
        [pending1, pending2, pending3],
      );

      expect(plan.archiveCandidates.map((c) => c.legacyLineId)).toEqual([
        22, 26, 27,
      ]);
    });

    it("should return empty archive candidates and no blockers when both plan and DB have no pending rows", () => {
      const plan = buildFinalizationPlan([], []);

      expect(plan.archiveCandidates).toHaveLength(0);
      expect(plan.blockers).toHaveLength(0);
      expect(plan.affectedHeaderCount).toBe(0);
    });
  });

  describe("buildFinalizationPlan - disallowed reason families", () => {
    it("should block when any DB pending row has a disallowed reason", () => {
      const pending = makePendingRecord(15, 22);
      const dbRow = makePendingDbRow(
        15,
        22,
        "multiple-upstream-line-candidates",
      );

      const plan = buildFinalizationPlan([dbRow], [pending]);

      expect(hasFinalizationBlockers(plan)).toBe(true);
      expect(plan.blockers[0]?.reason).toMatch(/disallowed/i);
    });

    it("should block when a mix of allowed and disallowed reasons exists", () => {
      const pending1 = makePendingRecord(15, 22);
      const pending2 = makePendingRecord(16, 24);
      const dbRowAllowed = makePendingDbRow(15, 22);
      const dbRowDisallowed = makePendingDbRow(
        16,
        24,
        "upstream-customer-mismatch",
      );

      const plan = buildFinalizationPlan(
        [dbRowAllowed, dbRowDisallowed],
        [pending1, pending2],
      );

      expect(hasFinalizationBlockers(plan)).toBe(true);
    });

    it("should not include disallowed rows in archive candidates", () => {
      const pending1 = makePendingRecord(15, 22);
      const pending2 = makePendingRecord(16, 24);
      const dbRowAllowed = makePendingDbRow(15, 22);
      const dbRowDisallowed = makePendingDbRow(
        16,
        24,
        "upstream-customer-mismatch",
      );

      const plan = buildFinalizationPlan(
        [dbRowAllowed, dbRowDisallowed],
        [pending1, pending2],
      );

      expect(plan.archiveCandidates.every((c) => c.legacyLineId === 22)).toBe(
        true,
      );
    });
  });

  describe("buildFinalizationPlan - pending drift detection", () => {
    it("should block when current DB pending rows exceed the deterministic plan", () => {
      const pending1 = makePendingRecord(15, 22);
      const dbRow1 = makePendingDbRow(15, 22);
      const dbRowExtra = makePendingDbRow(15, 23);

      const plan = buildFinalizationPlan([dbRow1, dbRowExtra], [pending1]);

      expect(hasFinalizationBlockers(plan)).toBe(true);
    });

    it("should block when deterministic plan has more rows than DB", () => {
      const pending1 = makePendingRecord(15, 22);
      const pending2 = makePendingRecord(15, 23);
      const dbRow1 = makePendingDbRow(15, 22);

      const plan = buildFinalizationPlan([dbRow1], [pending1, pending2]);

      expect(hasFinalizationBlockers(plan)).toBe(true);
    });

    it("should block when DB row payload does not match deterministic plan payload", () => {
      const pending = makePendingRecord(15, 22);
      const dbRowDrifted = makePendingDbRow(15, 22, ALLOWED_FINALIZE_REASON, {
        materialLegacyId: 999,
        targetMaterialId: null,
        returnQty: "99.000",
        returnDate: "2025-01-01",
        targetCustomerId: null,
        candidateCount: 5,
        candidateSummary: [],
        intervalEvidence: null,
        remarkEvidence: null,
      });

      const plan = buildFinalizationPlan([dbRowDrifted], [pending]);

      expect(hasFinalizationBlockers(plan)).toBe(true);
      const payloadBlocker = plan.blockers.find((b) =>
        b.reason.toLowerCase().includes("payload"),
      );
      expect(payloadBlocker).toBeDefined();
    });

    it("should not block when all DB rows match the deterministic plan exactly", () => {
      const pending1 = makePendingRecord(15, 22);
      const pending2 = makePendingRecord(18, 26);
      const dbRow1 = makePendingDbRow(15, 22);
      const dbRow2 = makePendingDbRow(18, 26);

      const plan = buildFinalizationPlan(
        [dbRow1, dbRow2],
        [pending1, pending2],
      );

      expect(hasFinalizationBlockers(plan)).toBe(false);
    });
  });

  describe("hasFinalizationBlockers", () => {
    it("should return false when the plan has no blockers", () => {
      const pending = makePendingRecord(15, 22);
      const dbRow = makePendingDbRow(15, 22);
      const plan = buildFinalizationPlan([dbRow], [pending]);

      expect(hasFinalizationBlockers(plan)).toBe(false);
    });

    it("should return true when the plan has blockers", () => {
      const plan = buildFinalizationPlan(
        [makePendingDbRow(15, 22, "disallowed-reason")],
        [makePendingRecord(15, 22)],
      );

      expect(hasFinalizationBlockers(plan)).toBe(true);
    });
  });
});
