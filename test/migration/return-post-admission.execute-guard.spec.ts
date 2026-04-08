import {
  ACCEPTED_NEGATIVE_BALANCE_WARNING,
  buildAdmissionBaselineBlockers,
  buildFactoryNumberReservationBlockers,
  buildSharedTableBlockers,
  buildValidationReadiness,
} from "../../scripts/migration/return-post-admission/execute-guard";

describe("return-post-admission execute guard", () => {
  describe("buildSharedTableBlockers", () => {
    it("should return no blockers when all shared tables are empty on first run", () => {
      const blockers = buildSharedTableBlockers({
        tableCounts: {
          document_relation: 0,
          document_line_relation: 0,
          inventory_balance: 0,
          inventory_log: 0,
          inventory_source_usage: 0,
          approval_document: 0,
          factory_number_reservation: 80,
        },
        isRerun: false,
      });

      expect(blockers).toHaveLength(0);
    });

    it("should return a blocker when shared tables are non-empty on first run", () => {
      const blockers = buildSharedTableBlockers({
        tableCounts: {
          document_relation: 0,
          document_line_relation: 0,
          inventory_balance: 5,
          inventory_log: 10,
          inventory_source_usage: 0,
          approval_document: 0,
          factory_number_reservation: 80,
        },
        isRerun: false,
      });

      expect(blockers.length).toBeGreaterThan(0);
      expect(blockers[0]).toHaveProperty("reason");
      expect(blockers[0]?.reason).toContain("not empty");
    });

    it("should not block when tables are non-empty on rerun", () => {
      const blockers = buildSharedTableBlockers({
        tableCounts: {
          document_relation: 5,
          document_line_relation: 10,
          inventory_balance: 20,
          inventory_log: 100,
          inventory_source_usage: 3,
          approval_document: 64,
          factory_number_reservation: 80,
        },
        isRerun: true,
      });

      expect(blockers).toHaveLength(0);
    });

    it("should ignore factory_number_reservation count when checking shared table emptiness", () => {
      const blockers = buildSharedTableBlockers({
        tableCounts: {
          document_relation: 0,
          document_line_relation: 0,
          inventory_balance: 0,
          inventory_log: 0,
          inventory_source_usage: 0,
          approval_document: 0,
          factory_number_reservation: 999,
        },
        isRerun: false,
      });

      expect(blockers).toHaveLength(0);
    });
  });

  describe("buildFactoryNumberReservationBlockers", () => {
    it("should return no blockers when reservation count matches expected", () => {
      const blockers = buildFactoryNumberReservationBlockers({
        currentCount: 80,
        expectedCount: 80,
      });

      expect(blockers).toHaveLength(0);
    });

    it("should return a blocker when reservation count does not match expected", () => {
      const blockers = buildFactoryNumberReservationBlockers({
        currentCount: 81,
        expectedCount: 80,
      });

      expect(blockers.length).toBeGreaterThan(0);
      expect(blockers[0]?.expectedCount).toBe(80);
      expect(blockers[0]?.currentCount).toBe(81);
    });

    it("should block if reservation count dropped below expected", () => {
      const blockers = buildFactoryNumberReservationBlockers({
        currentCount: 75,
        expectedCount: 80,
      });

      expect(blockers.length).toBeGreaterThan(0);
    });
  });

  describe("buildAdmissionBaselineBlockers", () => {
    it("should return no blockers for correct baseline counts", () => {
      const blockers = buildAdmissionBaselineBlockers({
        admittedSalesReturnOrders: 9,
        admittedSalesReturnLines: 13,
        admittedWorkshopReturnOrders: 3,
        admittedWorkshopReturnLines: 4,
      });

      expect(blockers).toHaveLength(0);
    });

    it("should return a blocker if sales-return order count is wrong", () => {
      const blockers = buildAdmissionBaselineBlockers({
        admittedSalesReturnOrders: 8,
        admittedSalesReturnLines: 13,
        admittedWorkshopReturnOrders: 3,
        admittedWorkshopReturnLines: 4,
      });

      expect(blockers.length).toBeGreaterThan(0);
      expect(
        blockers.some(
          (b) =>
            typeof b.reason === "string" && b.reason.includes("sales-return"),
        ),
      ).toBe(true);
    });

    it("should return a blocker if sales-return line count is wrong", () => {
      const blockers = buildAdmissionBaselineBlockers({
        admittedSalesReturnOrders: 9,
        admittedSalesReturnLines: 12,
        admittedWorkshopReturnOrders: 3,
        admittedWorkshopReturnLines: 4,
      });

      expect(blockers.length).toBeGreaterThan(0);
    });

    it("should return a blocker if workshop-return order count is wrong", () => {
      const blockers = buildAdmissionBaselineBlockers({
        admittedSalesReturnOrders: 9,
        admittedSalesReturnLines: 13,
        admittedWorkshopReturnOrders: 4,
        admittedWorkshopReturnLines: 4,
      });

      expect(blockers.length).toBeGreaterThan(0);
      expect(
        blockers.some(
          (b) =>
            typeof b.reason === "string" &&
            b.reason.includes("workshop-return"),
        ),
      ).toBe(true);
    });

    it("should return a blocker if workshop-return line count is wrong", () => {
      const blockers = buildAdmissionBaselineBlockers({
        admittedSalesReturnOrders: 9,
        admittedSalesReturnLines: 13,
        admittedWorkshopReturnOrders: 3,
        admittedWorkshopReturnLines: 5,
      });

      expect(blockers.length).toBeGreaterThan(0);
    });

    it("should return multiple blockers if both families have wrong counts", () => {
      const blockers = buildAdmissionBaselineBlockers({
        admittedSalesReturnOrders: 10,
        admittedSalesReturnLines: 14,
        admittedWorkshopReturnOrders: 5,
        admittedWorkshopReturnLines: 7,
      });

      expect(blockers.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe("buildValidationReadiness", () => {
    it("should keep negative-balance warnings non-blocking for cutover readiness", () => {
      const readiness = buildValidationReadiness({
        validationIssues: [
          {
            severity: "warning",
            warningType: ACCEPTED_NEGATIVE_BALANCE_WARNING,
            reason:
              "inventory_balance contains negative balances after replay.",
            negativeBalanceCount: 102,
          },
        ],
      });

      expect(readiness.manualReviewRequired).toBe(false);
      expect(readiness.cutoverReady).toBe(true);
    });

    it("should still block cutover when blocker issues exist", () => {
      const readiness = buildValidationReadiness({
        validationIssues: [
          {
            severity: "warning",
            warningType: ACCEPTED_NEGATIVE_BALANCE_WARNING,
            reason: "negative balances remain visible",
          },
          { severity: "blocker", reason: "baseline counts drifted" },
        ],
      });

      expect(readiness.manualReviewRequired).toBe(false);
      expect(readiness.cutoverReady).toBe(false);
    });

    it("should require manual review for non-negative-balance warnings", () => {
      const readiness = buildValidationReadiness({
        validationIssues: [
          {
            severity: "warning",
            reason:
              "approval_document row count does not match the deterministic plan.",
          },
        ],
      });

      expect(readiness.manualReviewRequired).toBe(true);
      expect(readiness.cutoverReady).toBe(false);
    });
  });
});
