import {
  buildDocumentNoCollisionBlockers,
  buildDownstreamConsumerBlockers,
  buildMapConsistencyBlockers,
  buildMissingMapTargetBlockers,
} from "../../scripts/migration/customer-sales-return/execute-guard";

describe("customer-sales-return execute guard", () => {
  describe("buildMissingMapTargetBlockers", () => {
    it("should allow execute when all staging map targets exist", () => {
      expect(
        buildMissingMapTargetBlockers({
          targetTable: "customer_stock_order",
          missingMappedTargets: 0,
        }),
      ).toEqual([]);
    });

    it("should block execute when staging map rows point at missing target rows", () => {
      expect(
        buildMissingMapTargetBlockers({
          targetTable: "customer_stock_order",
          missingMappedTargets: 2,
        }),
      ).toEqual([
        expect.objectContaining({
          targetTable: "customer_stock_order",
          missingMappedTargets: 2,
        }),
      ]);
    });

    it("should allow execute for lines when no missing targets", () => {
      expect(
        buildMissingMapTargetBlockers({
          targetTable: "customer_stock_order_line",
          missingMappedTargets: 0,
        }),
      ).toEqual([]);
    });
  });

  describe("buildMapConsistencyBlockers", () => {
    it("should allow execute when batch map rows exactly match the deterministic plan", () => {
      expect(
        buildMapConsistencyBlockers({
          targetTable: "customer_stock_order",
          missingExpectedMapRows: 0,
          unexpectedMapRows: 0,
          mismatchedTargetCodes: 0,
          mismatchedActualTargetCodes: 0,
        }),
      ).toEqual([]);
    });

    it("should block execute when expected map rows are missing", () => {
      expect(
        buildMapConsistencyBlockers({
          targetTable: "customer_stock_order",
          missingExpectedMapRows: 1,
          unexpectedMapRows: 0,
          mismatchedTargetCodes: 0,
          mismatchedActualTargetCodes: 0,
        }),
      ).toEqual([
        expect.objectContaining({
          targetTable: "customer_stock_order",
          missingExpectedMapRows: 1,
        }),
      ]);
    });

    it("should allow controlled batch expansion when old batch-owned maps are a clean subset of the new deterministic plan", () => {
      expect(
        buildMapConsistencyBlockers({
          targetTable: "customer_stock_order",
          missingExpectedMapRows: 9,
          unexpectedMapRows: 0,
          mismatchedTargetCodes: 0,
          mismatchedActualTargetCodes: 0,
          allowMissingExpectedMapRows: true,
        }),
      ).toEqual([]);
    });

    it("should block execute when unexpected map rows are present", () => {
      expect(
        buildMapConsistencyBlockers({
          targetTable: "customer_stock_order_line",
          missingExpectedMapRows: 0,
          unexpectedMapRows: 3,
          mismatchedTargetCodes: 0,
          mismatchedActualTargetCodes: 0,
        }),
      ).toEqual([
        expect.objectContaining({
          targetTable: "customer_stock_order_line",
          unexpectedMapRows: 3,
        }),
      ]);
    });

    it("should allow controlled batch cleanup when old batch-owned maps contain extra members outside the new deterministic plan", () => {
      expect(
        buildMapConsistencyBlockers({
          targetTable: "customer_stock_order_line",
          missingExpectedMapRows: 0,
          unexpectedMapRows: 1,
          mismatchedTargetCodes: 0,
          mismatchedActualTargetCodes: 0,
          allowUnexpectedMapRows: true,
        }),
      ).toEqual([]);
    });

    it("should block execute when target codes drift from the plan", () => {
      expect(
        buildMapConsistencyBlockers({
          targetTable: "customer_stock_order",
          missingExpectedMapRows: 0,
          unexpectedMapRows: 0,
          mismatchedTargetCodes: 2,
          mismatchedActualTargetCodes: 1,
        }),
      ).toEqual([
        expect.objectContaining({
          targetTable: "customer_stock_order",
          mismatchedTargetCodes: 2,
          mismatchedActualTargetCodes: 1,
        }),
      ]);
    });
  });

  describe("buildDocumentNoCollisionBlockers", () => {
    it("should allow execute when planned document numbers do not collide with unowned rows", () => {
      expect(
        buildDocumentNoCollisionBlockers({
          plannedDocumentNos: ["TH-2026-001", "TH-2026-002"],
          existingUnownedDocumentNos: ["CK-2026-001"],
        }),
      ).toEqual([]);
    });

    it("should block execute when planned document numbers collide with unowned target rows", () => {
      expect(
        buildDocumentNoCollisionBlockers({
          plannedDocumentNos: ["TH-2026-001", "TH-2026-002", "TH-2026-003"],
          existingUnownedDocumentNos: ["CK-2026-001", "TH-2026-002"],
        }),
      ).toEqual([
        expect.objectContaining({
          collisionCount: 1,
        }),
      ]);
    });

    it("should handle case-insensitive collision detection", () => {
      expect(
        buildDocumentNoCollisionBlockers({
          plannedDocumentNos: ["TH-2026-001"],
          existingUnownedDocumentNos: ["th-2026-001"],
        }),
      ).toEqual([
        expect.objectContaining({
          collisionCount: 1,
        }),
      ]);
    });

    it("should allow execute when planned list is empty", () => {
      expect(
        buildDocumentNoCollisionBlockers({
          plannedDocumentNos: [],
          existingUnownedDocumentNos: ["CK-2026-001"],
        }),
      ).toEqual([]);
    });

    it("should allow execute when unowned list is empty", () => {
      expect(
        buildDocumentNoCollisionBlockers({
          plannedDocumentNos: ["TH-2026-001"],
          existingUnownedDocumentNos: [],
        }),
      ).toEqual([]);
    });
  });

  describe("buildDownstreamConsumerBlockers", () => {
    it("should allow first execute when no downstream consumers exist", () => {
      expect(
        buildDownstreamConsumerBlockers({
          isRerun: false,
          consumerCounts: {
            document_relation: 0,
            audit_document: 0,
          },
        }),
      ).toEqual([]);
    });

    it("should allow rerun when no downstream consumers exist", () => {
      expect(
        buildDownstreamConsumerBlockers({
          isRerun: true,
          consumerCounts: {
            document_relation: 0,
            document_line_relation: 0,
            inventory_log: 0,
            inventory_source_usage: 0,
            audit_document: 0,
          },
        }),
      ).toEqual([]);
    });

    it("should block first execute when downstream consumers already reference CustomerStockOrder rows", () => {
      expect(
        buildDownstreamConsumerBlockers({
          isRerun: false,
          consumerCounts: {
            document_relation: 3,
            audit_document: 1,
          },
        }),
      ).toEqual([
        expect.objectContaining({
          downstreamConsumers: {
            document_relation: 3,
            audit_document: 1,
          },
        }),
      ]);
    });

    it("should block rerun when downstream consumers already reference CustomerStockOrder rows", () => {
      expect(
        buildDownstreamConsumerBlockers({
          isRerun: true,
          consumerCounts: {
            document_relation: 2,
            document_line_relation: 0,
            inventory_log: 0,
            inventory_source_usage: 0,
            audit_document: 0,
          },
        }),
      ).toEqual([
        expect.objectContaining({
          downstreamConsumers: {
            document_relation: 2,
          },
        }),
      ]);
    });

    it("should block rerun and report all active downstream consumers", () => {
      expect(
        buildDownstreamConsumerBlockers({
          isRerun: true,
          consumerCounts: {
            document_relation: 1,
            document_line_relation: 3,
            inventory_log: 0,
            inventory_source_usage: 0,
            audit_document: 5,
          },
        }),
      ).toEqual([
        expect.objectContaining({
          downstreamConsumers: {
            document_relation: 1,
            document_line_relation: 3,
            audit_document: 5,
          },
        }),
      ]);
    });
  });
});
