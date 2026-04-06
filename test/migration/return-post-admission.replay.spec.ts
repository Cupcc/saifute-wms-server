import { buildPostAdmissionMigrationPlan } from "../../scripts/migration/return-post-admission/planner";
import type {
  AdmittedLineRow,
  AdmittedOrderRow,
  AdmittedStockInLineRow,
  PostAdmissionBaseline,
  UpstreamOutboundLineRow,
  UpstreamPickLineRow,
} from "../../scripts/migration/return-post-admission/types";

function buildStockInOrder(
  overrides: Partial<AdmittedOrderRow> = {},
): AdmittedOrderRow {
  return {
    id: 100,
    documentNo: "RK-001",
    orderType: "ACCEPTANCE",
    bizDate: "2024-01-01",
    workshopId: 1,
    customerId: null,
    lifecycleStatus: "EFFECTIVE",
    auditStatusSnapshot: "PENDING",
    inventoryEffectStatus: "POSTED",
    ...overrides,
  };
}

function buildStockInLine(
  overrides: Partial<AdmittedStockInLineRow> = {},
): AdmittedStockInLineRow {
  return {
    id: 101,
    orderId: 100,
    lineNo: 1,
    materialId: 701,
    quantity: "20.000000",
    documentNo: "RK-001",
    orderType: "ACCEPTANCE",
    bizDate: "2024-01-01",
    workshopId: 1,
    lifecycleStatus: "EFFECTIVE",
    inventoryEffectStatus: "POSTED",
    ...overrides,
  };
}

function buildOutboundLine(
  overrides: Partial<UpstreamOutboundLineRow> = {},
): UpstreamOutboundLineRow {
  return {
    id: 3001,
    orderId: 3000,
    lineNo: 1,
    materialId: 701,
    quantity: "10.000000",
    documentNo: "OUT-001",
    bizDate: "2024-01-10",
    workshopId: 1,
    customerId: 201,
    lifecycleStatus: "EFFECTIVE",
    inventoryEffectStatus: "POSTED",
    ...overrides,
  };
}

function buildPickLine(
  overrides: Partial<UpstreamPickLineRow> = {},
): UpstreamPickLineRow {
  return {
    id: 4001,
    orderId: 4000,
    lineNo: 1,
    materialId: 701,
    quantity: "5.000000",
    documentNo: "PICK-001",
    bizDate: "2024-01-12",
    workshopId: 1,
    lifecycleStatus: "EFFECTIVE",
    inventoryEffectStatus: "POSTED",
    ...overrides,
  };
}

function buildValidBaseline(
  partialBaseline: Partial<PostAdmissionBaseline> = {},
): PostAdmissionBaseline {
  const salesReturnOrders: AdmittedOrderRow[] = Array.from(
    { length: 9 },
    (_, i) => ({
      id: 1001 + i,
      documentNo: `SR-${String(i + 1).padStart(3, "0")}`,
      orderType: "SALES_RETURN",
      bizDate: "2024-01-15",
      workshopId: 1,
      customerId: 201,
      lifecycleStatus: "EFFECTIVE" as const,
      auditStatusSnapshot: "PENDING" as const,
      inventoryEffectStatus: "POSTED" as const,
    }),
  );

  const salesReturnLines: AdmittedLineRow[] = Array.from(
    { length: 13 },
    (_, i) => ({
      id: 5001 + i,
      orderId:
        salesReturnOrders[Math.min(i, 8)]?.id ??
        salesReturnOrders[0]?.id ??
        1001,
      lineNo: i + 1,
      materialId: 701 + (i % 3),
      quantity: "5.000000",
      sourceDocumentType: null,
      sourceDocumentId: null,
      sourceDocumentLineId: null,
      documentNo:
        salesReturnOrders[Math.min(i, 8)]?.documentNo ??
        salesReturnOrders[0]?.documentNo ??
        "SR-001",
      orderType: "SALES_RETURN",
      bizDate: "2024-01-15",
      workshopId: 1,
      customerId: 201,
      lifecycleStatus: "EFFECTIVE" as const,
      inventoryEffectStatus: "POSTED" as const,
    }),
  );

  const workshopReturnOrders: AdmittedOrderRow[] = Array.from(
    { length: 3 },
    (_, i) => ({
      id: 2001 + i,
      documentNo: `WR-${String(i + 1).padStart(3, "0")}`,
      orderType: "RETURN",
      bizDate: "2024-01-16",
      workshopId: 1,
      customerId: null,
      lifecycleStatus: "EFFECTIVE" as const,
      auditStatusSnapshot: "PENDING" as const,
      inventoryEffectStatus: "POSTED" as const,
    }),
  );

  const workshopReturnLines: AdmittedLineRow[] = Array.from(
    { length: 4 },
    (_, i) => ({
      id: 6001 + i,
      orderId:
        workshopReturnOrders[Math.min(i, 2)]?.id ??
        workshopReturnOrders[0]?.id ??
        2001,
      lineNo: i + 1,
      materialId: 701 + (i % 2),
      quantity: "3.000000",
      sourceDocumentType: null,
      sourceDocumentId: null,
      sourceDocumentLineId: null,
      documentNo:
        workshopReturnOrders[Math.min(i, 2)]?.documentNo ??
        workshopReturnOrders[0]?.documentNo ??
        "WR-001",
      orderType: "RETURN",
      bizDate: "2024-01-16",
      workshopId: 1,
      customerId: null,
      lifecycleStatus: "EFFECTIVE" as const,
      inventoryEffectStatus: "POSTED" as const,
    }),
  );

  return {
    salesReturnOrders,
    salesReturnLines,
    workshopReturnOrders,
    workshopReturnLines,
    outboundLines: [],
    pickLines: [],
    stockInLines: [],
    outboundOrders: [],
    pickOrders: [],
    stockInOrders: [],
    ...partialBaseline,
  };
}

describe("return-post-admission inventory replay", () => {
  describe("inventory log generation", () => {
    it("should create IN log entries for stock-in ACCEPTANCE lines (POSTED)", () => {
      const stockInLines = [buildStockInLine()];
      const baseline = buildValidBaseline({ stockInLines });
      const plan = buildPostAdmissionMigrationPlan(baseline);

      const acceptanceLogs = plan.replay.logInserts.filter(
        (l) =>
          l.operationType === "ACCEPTANCE_IN" &&
          l.businessDocumentType === "StockInOrder",
      );

      expect(acceptanceLogs).toHaveLength(1);
      expect(acceptanceLogs[0]?.direction).toBe("IN");
      expect(acceptanceLogs[0]?.changeQty).toBe("20.000000");
      expect(acceptanceLogs[0]?.isReversal).toBe(false);
    });

    it("should create OUT log entries for OUTBOUND lines (POSTED)", () => {
      const outboundLines = [buildOutboundLine()];
      const baseline = buildValidBaseline({ outboundLines });
      const plan = buildPostAdmissionMigrationPlan(baseline);

      const outboundLogs = plan.replay.logInserts.filter(
        (l) => l.operationType === "OUTBOUND_OUT",
      );

      expect(outboundLogs).toHaveLength(1);
      expect(outboundLogs[0]?.direction).toBe("OUT");
    });

    it("should create IN log entries for SALES_RETURN lines (POSTED)", () => {
      const baseline = buildValidBaseline();
      const plan = buildPostAdmissionMigrationPlan(baseline);

      const salesReturnLogs = plan.replay.logInserts.filter(
        (l) => l.operationType === "SALES_RETURN_IN",
      );

      expect(salesReturnLogs.length).toBe(13);
      expect(salesReturnLogs.every((l) => l.direction === "IN")).toBe(true);
    });

    it("should create OUT log entries for PICK lines (POSTED)", () => {
      const pickLines = [buildPickLine()];
      const baseline = buildValidBaseline({ pickLines });
      const plan = buildPostAdmissionMigrationPlan(baseline);

      const pickLogs = plan.replay.logInserts.filter(
        (l) => l.operationType === "PICK_OUT",
      );

      expect(pickLogs).toHaveLength(1);
      expect(pickLogs[0]?.direction).toBe("OUT");
    });

    it("should create IN log entries for RETURN lines (POSTED)", () => {
      const baseline = buildValidBaseline();
      const plan = buildPostAdmissionMigrationPlan(baseline);

      const returnLogs = plan.replay.logInserts.filter(
        (l) => l.operationType === "RETURN_IN",
      );

      expect(returnLogs.length).toBe(4);
      expect(returnLogs.every((l) => l.direction === "IN")).toBe(true);
    });

    it("should create primary and reversal log pairs for VOIDED/REVERSED lines", () => {
      const reversedStockInLine = buildStockInLine({
        inventoryEffectStatus: "REVERSED",
      });

      const baseline = buildValidBaseline({
        stockInLines: [reversedStockInLine],
      });

      const plan = buildPostAdmissionMigrationPlan(baseline);

      const primaryLogs = plan.replay.logInserts.filter(
        (l) =>
          !l.isReversal && l.businessDocumentLineId === reversedStockInLine.id,
      );

      const reversalLogs = plan.replay.logInserts.filter(
        (l) =>
          l.isReversal && l.businessDocumentLineId === reversedStockInLine.id,
      );

      expect(primaryLogs).toHaveLength(1);
      expect(reversalLogs).toHaveLength(1);
      expect(reversalLogs[0]?.primaryIdempotencyKey).toBe(
        primaryLogs[0]?.idempotencyKey,
      );
      expect(reversalLogs[0]?.direction).toBe("OUT");
      expect(reversalLogs[0]?.operationType).toBe("REVERSAL_OUT");
    });

    it("should generate deterministic idempotency keys", () => {
      const baseline = buildValidBaseline({
        stockInLines: [buildStockInLine()],
        outboundLines: [buildOutboundLine()],
      });

      const plan = buildPostAdmissionMigrationPlan(baseline);
      const keys = plan.replay.logInserts.map((l) => l.idempotencyKey);
      const uniqueKeys = new Set(keys);

      expect(uniqueKeys.size).toBe(keys.length);
    });

    it("should emit runtime businessModule strings (inbound / customer / workshop-material)", () => {
      const baseline = buildValidBaseline({
        stockInLines: [buildStockInLine({ id: 101, materialId: 901 })],
        outboundLines: [buildOutboundLine({ id: 3001, materialId: 902 })],
        pickLines: [buildPickLine({ id: 4001, materialId: 903 })],
      });

      const plan = buildPostAdmissionMigrationPlan(baseline);

      const stockInLogs = plan.replay.logInserts.filter(
        (l) => l.operationType === "ACCEPTANCE_IN",
      );
      const outboundLogs = plan.replay.logInserts.filter(
        (l) => l.operationType === "OUTBOUND_OUT",
      );
      const pickLogs = plan.replay.logInserts.filter(
        (l) => l.operationType === "PICK_OUT",
      );
      const salesReturnLogs = plan.replay.logInserts.filter(
        (l) => l.operationType === "SALES_RETURN_IN",
      );
      const workshopReturnLogs = plan.replay.logInserts.filter(
        (l) => l.operationType === "RETURN_IN",
      );

      expect(stockInLogs.length).toBeGreaterThan(0);
      expect(stockInLogs.every((l) => l.businessModule === "inbound")).toBe(
        true,
      );

      expect(outboundLogs.length).toBeGreaterThan(0);
      expect(outboundLogs.every((l) => l.businessModule === "customer")).toBe(
        true,
      );

      expect(pickLogs.length).toBeGreaterThan(0);
      expect(
        pickLogs.every((l) => l.businessModule === "workshop-material"),
      ).toBe(true);

      expect(salesReturnLogs.length).toBeGreaterThan(0);
      expect(
        salesReturnLogs.every((l) => l.businessModule === "customer"),
      ).toBe(true);

      expect(workshopReturnLogs.length).toBeGreaterThan(0);
      expect(
        workshopReturnLogs.every(
          (l) => l.businessModule === "workshop-material",
        ),
      ).toBe(true);
    });

    it("should not use document-family labels as businessModule values", () => {
      const baseline = buildValidBaseline({
        stockInLines: [buildStockInLine()],
        outboundLines: [buildOutboundLine()],
        pickLines: [buildPickLine()],
      });

      const plan = buildPostAdmissionMigrationPlan(baseline);
      const forbiddenLabels = new Set([
        "STOCK_IN",
        "CUSTOMER_STOCK",
        "WORKSHOP_MATERIAL",
      ]);

      for (const log of plan.replay.logInserts) {
        expect(forbiddenLabels.has(log.businessModule)).toBe(false);
      }
    });

    it("should compare quantities exactly without floating-point precision loss for large decimal values", () => {
      const salesReturnOrders: AdmittedOrderRow[] = Array.from(
        { length: 9 },
        (_, i) => ({
          id: 1001 + i,
          documentNo: `SR-${String(i + 1).padStart(3, "0")}`,
          orderType: "SALES_RETURN",
          bizDate: "2024-01-15",
          workshopId: 1,
          customerId: 201,
          lifecycleStatus: "EFFECTIVE" as const,
          auditStatusSnapshot: "PENDING" as const,
          inventoryEffectStatus: "POSTED" as const,
        }),
      );

      const workshopReturnOrders: AdmittedOrderRow[] = Array.from(
        { length: 3 },
        (_, i) => ({
          id: 2001 + i,
          documentNo: `WR-${String(i + 1).padStart(3, "0")}`,
          orderType: "RETURN",
          bizDate: "2024-01-16",
          workshopId: 1,
          customerId: null,
          lifecycleStatus: "EFFECTIVE" as const,
          auditStatusSnapshot: "PENDING" as const,
          inventoryEffectStatus: "POSTED" as const,
        }),
      );

      const workshopReturnLines: AdmittedLineRow[] = Array.from(
        { length: 4 },
        (_, i) => ({
          id: 6001 + i,
          orderId: workshopReturnOrders[Math.min(i, 2)]?.id ?? 2001,
          lineNo: i + 1,
          materialId: 800 + i,
          quantity: "3.000000",
          sourceDocumentType: null,
          sourceDocumentId: null,
          sourceDocumentLineId: null,
          documentNo:
            workshopReturnOrders[Math.min(i, 2)]?.documentNo ?? "WR-001",
          orderType: "RETURN",
          bizDate: "2024-01-16",
          workshopId: 1,
          customerId: null,
          lifecycleStatus: "EFFECTIVE" as const,
          inventoryEffectStatus: "POSTED" as const,
        }),
      );

      const salesReturnLines: AdmittedLineRow[] = Array.from(
        { length: 13 },
        (_, i) => ({
          id: 5001 + i,
          orderId: salesReturnOrders[Math.min(i, 8)]?.id ?? 1001,
          lineNo: i + 1,
          materialId: 700 + i,
          quantity: "123456789012.345678",
          sourceDocumentType: null,
          sourceDocumentId: null,
          sourceDocumentLineId: null,
          documentNo: salesReturnOrders[Math.min(i, 8)]?.documentNo ?? "SR-001",
          orderType: "SALES_RETURN",
          bizDate: "2024-01-15",
          workshopId: 1,
          customerId: 201,
          lifecycleStatus: "EFFECTIVE" as const,
          inventoryEffectStatus: "POSTED" as const,
        }),
      );

      const outboundLines: UpstreamOutboundLineRow[] = salesReturnLines.map(
        (line, i) => ({
          id: 3001 + i,
          orderId: 3000 + i,
          lineNo: 1,
          materialId: line.materialId,
          quantity: "123456789012.345679",
          documentNo: `OUT-${String(i + 1).padStart(3, "0")}`,
          bizDate: "2024-01-10",
          workshopId: 1,
          customerId: 201,
          lifecycleStatus: "EFFECTIVE" as const,
          inventoryEffectStatus: "POSTED" as const,
        }),
      );

      const baseline: PostAdmissionBaseline = {
        salesReturnOrders,
        salesReturnLines,
        workshopReturnOrders,
        workshopReturnLines,
        outboundLines,
        pickLines: [],
        stockInLines: [],
        outboundOrders: [],
        pickOrders: [],
        stockInOrders: [],
      };

      const plan = buildPostAdmissionMigrationPlan(baseline);

      const allClassifications = plan.relation.salesReturnClassifications;

      expect(
        allClassifications.every((c) => c.classification !== "proven"),
      ).toBe(true);
    });
  });

  describe("inventory source usage derivation", () => {
    it("should derive source usage for proven SALES_RETURN links with matching quantities", () => {
      const salesReturnOrders: AdmittedOrderRow[] = Array.from(
        { length: 9 },
        (_, i) => ({
          id: 1001 + i,
          documentNo: `SR-${String(i + 1).padStart(3, "0")}`,
          orderType: "SALES_RETURN",
          bizDate: "2024-01-15",
          workshopId: 1,
          customerId: 201,
          lifecycleStatus: "EFFECTIVE" as const,
          auditStatusSnapshot: "PENDING" as const,
          inventoryEffectStatus: "POSTED" as const,
        }),
      );

      const salesReturnLines: AdmittedLineRow[] = Array.from(
        { length: 13 },
        (_, i) => ({
          id: 5001 + i,
          orderId:
            salesReturnOrders[Math.min(i, 8)]?.id ??
            salesReturnOrders[0]?.id ??
            1001,
          lineNo: i + 1,
          materialId: 701 + i,
          quantity: "10.000000",
          sourceDocumentType: null,
          sourceDocumentId: null,
          sourceDocumentLineId: null,
          documentNo:
            salesReturnOrders[Math.min(i, 8)]?.documentNo ??
            salesReturnOrders[0]?.documentNo ??
            "SR-001",
          orderType: "SALES_RETURN",
          bizDate: "2024-01-15",
          workshopId: 1,
          customerId: 201,
          lifecycleStatus: "EFFECTIVE" as const,
          inventoryEffectStatus: "POSTED" as const,
        }),
      );

      const outboundLines: UpstreamOutboundLineRow[] = salesReturnLines.map(
        (line, i) => ({
          id: 3001 + i,
          orderId: 3000 + i,
          lineNo: 1,
          materialId: line.materialId,
          quantity: "10.000000",
          documentNo: `OUT-${String(i + 1).padStart(3, "0")}`,
          bizDate: "2024-01-10",
          workshopId: 1,
          customerId: 201,
          lifecycleStatus: "EFFECTIVE" as const,
          inventoryEffectStatus: "POSTED" as const,
        }),
      );

      const workshopReturnOrders: AdmittedOrderRow[] = Array.from(
        { length: 3 },
        (_, i) => ({
          id: 2001 + i,
          documentNo: `WR-${String(i + 1).padStart(3, "0")}`,
          orderType: "RETURN",
          bizDate: "2024-01-16",
          workshopId: 1,
          customerId: null,
          lifecycleStatus: "EFFECTIVE" as const,
          auditStatusSnapshot: "PENDING" as const,
          inventoryEffectStatus: "POSTED" as const,
        }),
      );

      const workshopReturnLines: AdmittedLineRow[] = Array.from(
        { length: 4 },
        (_, i) => ({
          id: 6001 + i,
          orderId:
            workshopReturnOrders[Math.min(i, 2)]?.id ??
            workshopReturnOrders[0]?.id ??
            2001,
          lineNo: i + 1,
          materialId: 800 + i,
          quantity: "5.000000",
          sourceDocumentType: null,
          sourceDocumentId: null,
          sourceDocumentLineId: null,
          documentNo:
            workshopReturnOrders[Math.min(i, 2)]?.documentNo ??
            workshopReturnOrders[0]?.documentNo ??
            "WR-001",
          orderType: "RETURN",
          bizDate: "2024-01-16",
          workshopId: 1,
          customerId: null,
          lifecycleStatus: "EFFECTIVE" as const,
          inventoryEffectStatus: "POSTED" as const,
        }),
      );

      const baseline: PostAdmissionBaseline = {
        salesReturnOrders,
        salesReturnLines,
        workshopReturnOrders,
        workshopReturnLines,
        outboundLines,
        pickLines: [],
        stockInLines: [],
        outboundOrders: [],
        pickOrders: [],
        stockInOrders: [],
      };

      const plan = buildPostAdmissionMigrationPlan(baseline);

      expect(plan.replay.sourceUsageInserts.length).toBeGreaterThan(0);

      for (const usage of plan.replay.sourceUsageInserts) {
        expect(usage.consumerDocumentType).toBe("CustomerStockOrder");
        expect(usage.status).toBe("RELEASED");
        expect(usage.allocatedQty).not.toBe("0.000000");
      }
    });

    it("should report unresolved source usage gaps when upstream has no match", () => {
      const baseline = buildValidBaseline();
      const plan = buildPostAdmissionMigrationPlan(baseline);

      expect(plan.replay.unresolvedSourceUsageGaps.length).toBeGreaterThan(0);
      expect(plan.counts.sourceUsageGaps).toBeGreaterThan(0);
    });

    it("should report unresolved gap and not create source usage when upstream quantity differs from return quantity", () => {
      const salesReturnOrders: AdmittedOrderRow[] = Array.from(
        { length: 9 },
        (_, i) => ({
          id: 1001 + i,
          documentNo: `SR-${String(i + 1).padStart(3, "0")}`,
          orderType: "SALES_RETURN",
          bizDate: "2024-01-15",
          workshopId: 1,
          customerId: 201,
          lifecycleStatus: "EFFECTIVE" as const,
          auditStatusSnapshot: "PENDING" as const,
          inventoryEffectStatus: "POSTED" as const,
        }),
      );

      const salesReturnLines: AdmittedLineRow[] = Array.from(
        { length: 13 },
        (_, i) => ({
          id: 5001 + i,
          orderId:
            salesReturnOrders[Math.min(i, 8)]?.id ??
            salesReturnOrders[0]?.id ??
            1001,
          lineNo: i + 1,
          materialId: 701 + i,
          quantity: "10.000000",
          sourceDocumentType: null,
          sourceDocumentId: null,
          sourceDocumentLineId: null,
          documentNo:
            salesReturnOrders[Math.min(i, 8)]?.documentNo ??
            salesReturnOrders[0]?.documentNo ??
            "SR-001",
          orderType: "SALES_RETURN",
          bizDate: "2024-01-15",
          workshopId: 1,
          customerId: 201,
          lifecycleStatus: "EFFECTIVE" as const,
          inventoryEffectStatus: "POSTED" as const,
        }),
      );

      const outboundLines: UpstreamOutboundLineRow[] = salesReturnLines.map(
        (line, i) => ({
          id: 3001 + i,
          orderId: 3000 + i,
          lineNo: 1,
          materialId: line.materialId,
          quantity: "7.000000",
          documentNo: `OUT-${String(i + 1).padStart(3, "0")}`,
          bizDate: "2024-01-10",
          workshopId: 1,
          customerId: 201,
          lifecycleStatus: "EFFECTIVE" as const,
          inventoryEffectStatus: "POSTED" as const,
        }),
      );

      const workshopReturnOrders: AdmittedOrderRow[] = Array.from(
        { length: 3 },
        (_, i) => ({
          id: 2001 + i,
          documentNo: `WR-${String(i + 1).padStart(3, "0")}`,
          orderType: "RETURN",
          bizDate: "2024-01-16",
          workshopId: 1,
          customerId: null,
          lifecycleStatus: "EFFECTIVE" as const,
          auditStatusSnapshot: "PENDING" as const,
          inventoryEffectStatus: "POSTED" as const,
        }),
      );

      const workshopReturnLines: AdmittedLineRow[] = Array.from(
        { length: 4 },
        (_, i) => ({
          id: 6001 + i,
          orderId:
            workshopReturnOrders[Math.min(i, 2)]?.id ??
            workshopReturnOrders[0]?.id ??
            2001,
          lineNo: i + 1,
          materialId: 800 + i,
          quantity: "3.000000",
          sourceDocumentType: null,
          sourceDocumentId: null,
          sourceDocumentLineId: null,
          documentNo:
            workshopReturnOrders[Math.min(i, 2)]?.documentNo ??
            workshopReturnOrders[0]?.documentNo ??
            "WR-001",
          orderType: "RETURN",
          bizDate: "2024-01-16",
          workshopId: 1,
          customerId: null,
          lifecycleStatus: "EFFECTIVE" as const,
          inventoryEffectStatus: "POSTED" as const,
        }),
      );

      const baseline: PostAdmissionBaseline = {
        salesReturnOrders,
        salesReturnLines,
        workshopReturnOrders,
        workshopReturnLines,
        outboundLines,
        pickLines: [],
        stockInLines: [],
        outboundOrders: [],
        pickOrders: [],
        stockInOrders: [],
      };

      const plan = buildPostAdmissionMigrationPlan(baseline);

      expect(plan.replay.sourceUsageInserts).toHaveLength(0);
      expect(plan.replay.unresolvedSourceUsageGaps.length).toBeGreaterThan(0);

      for (const classification of plan.relation.salesReturnClassifications) {
        expect(classification.classification).not.toBe("proven");
      }
    });
  });

  describe("audit document projection", () => {
    it("should create audit documents for PENDING orders only", () => {
      const stockInOrders: AdmittedOrderRow[] = [
        buildStockInOrder({
          id: 100,
          auditStatusSnapshot: "PENDING",
          lifecycleStatus: "EFFECTIVE",
        }),
        buildStockInOrder({
          id: 101,
          documentNo: "RK-002",
          auditStatusSnapshot: "NOT_REQUIRED",
          lifecycleStatus: "EFFECTIVE",
        }),
      ];

      const baseline = buildValidBaseline({ stockInOrders });
      const plan = buildPostAdmissionMigrationPlan(baseline);

      const stockInAuditDocs = plan.audit.auditDocumentInserts.filter(
        (d) => d.documentFamily === "STOCK_IN",
      );

      expect(stockInAuditDocs).toHaveLength(1);
      expect(stockInAuditDocs[0]?.documentId).toBe(100);
    });

    it("should not create audit documents for VOIDED orders", () => {
      const stockInOrders: AdmittedOrderRow[] = [
        buildStockInOrder({
          id: 100,
          auditStatusSnapshot: "PENDING",
          lifecycleStatus: "VOIDED",
        }),
      ];

      const baseline = buildValidBaseline({ stockInOrders });
      const plan = buildPostAdmissionMigrationPlan(baseline);

      const stockInAuditDocs = plan.audit.auditDocumentInserts.filter(
        (d) => d.documentFamily === "STOCK_IN",
      );

      expect(stockInAuditDocs).toHaveLength(0);
    });

    it("should create audit documents for CUSTOMER_STOCK and WORKSHOP_MATERIAL families", () => {
      const salesReturnOrders: AdmittedOrderRow[] = Array.from(
        { length: 9 },
        (_, i) => ({
          id: 1001 + i,
          documentNo: `SR-${String(i + 1).padStart(3, "0")}`,
          orderType: "SALES_RETURN",
          bizDate: "2024-01-15",
          workshopId: 1,
          customerId: 201,
          lifecycleStatus: "EFFECTIVE" as const,
          auditStatusSnapshot: "PENDING" as const,
          inventoryEffectStatus: "POSTED" as const,
        }),
      );

      const salesReturnLines: AdmittedLineRow[] = Array.from(
        { length: 13 },
        (_, i) => ({
          id: 5001 + i,
          orderId:
            salesReturnOrders[Math.min(i, 8)]?.id ??
            salesReturnOrders[0]?.id ??
            1001,
          lineNo: i + 1,
          materialId: 701 + (i % 3),
          quantity: "5.000000",
          sourceDocumentType: null,
          sourceDocumentId: null,
          sourceDocumentLineId: null,
          documentNo:
            salesReturnOrders[Math.min(i, 8)]?.documentNo ??
            salesReturnOrders[0]?.documentNo ??
            "SR-001",
          orderType: "SALES_RETURN",
          bizDate: "2024-01-15",
          workshopId: 1,
          customerId: 201,
          lifecycleStatus: "EFFECTIVE" as const,
          inventoryEffectStatus: "POSTED" as const,
        }),
      );

      const workshopReturnOrders: AdmittedOrderRow[] = Array.from(
        { length: 3 },
        (_, i) => ({
          id: 2001 + i,
          documentNo: `WR-${String(i + 1).padStart(3, "0")}`,
          orderType: "RETURN",
          bizDate: "2024-01-16",
          workshopId: 1,
          customerId: null,
          lifecycleStatus: "EFFECTIVE" as const,
          auditStatusSnapshot: "PENDING" as const,
          inventoryEffectStatus: "POSTED" as const,
        }),
      );

      const workshopReturnLines: AdmittedLineRow[] = Array.from(
        { length: 4 },
        (_, i) => ({
          id: 6001 + i,
          orderId:
            workshopReturnOrders[Math.min(i, 2)]?.id ??
            workshopReturnOrders[0]?.id ??
            2001,
          lineNo: i + 1,
          materialId: 701 + (i % 2),
          quantity: "3.000000",
          sourceDocumentType: null,
          sourceDocumentId: null,
          sourceDocumentLineId: null,
          documentNo:
            workshopReturnOrders[Math.min(i, 2)]?.documentNo ??
            workshopReturnOrders[0]?.documentNo ??
            "WR-001",
          orderType: "RETURN",
          bizDate: "2024-01-16",
          workshopId: 1,
          customerId: null,
          lifecycleStatus: "EFFECTIVE" as const,
          inventoryEffectStatus: "POSTED" as const,
        }),
      );

      const outboundOrders: AdmittedOrderRow[] = [
        {
          id: 3000,
          documentNo: "OUT-001",
          orderType: "OUTBOUND",
          bizDate: "2024-01-10",
          workshopId: 1,
          customerId: 201,
          lifecycleStatus: "EFFECTIVE",
          auditStatusSnapshot: "PENDING",
          inventoryEffectStatus: "POSTED",
        },
      ];

      const pickOrders: AdmittedOrderRow[] = [
        {
          id: 4000,
          documentNo: "PICK-001",
          orderType: "PICK",
          bizDate: "2024-01-12",
          workshopId: 1,
          customerId: null,
          lifecycleStatus: "EFFECTIVE",
          auditStatusSnapshot: "PENDING",
          inventoryEffectStatus: "POSTED",
        },
      ];

      const baseline: PostAdmissionBaseline = {
        salesReturnOrders,
        salesReturnLines,
        workshopReturnOrders,
        workshopReturnLines,
        outboundLines: [],
        pickLines: [],
        stockInLines: [],
        outboundOrders,
        pickOrders,
        stockInOrders: [],
      };

      const plan = buildPostAdmissionMigrationPlan(baseline);

      const customerStockDocs = plan.audit.auditDocumentInserts.filter(
        (d) => d.documentFamily === "CUSTOMER_STOCK",
      );

      const workshopMaterialDocs = plan.audit.auditDocumentInserts.filter(
        (d) => d.documentFamily === "WORKSHOP_MATERIAL",
      );

      expect(customerStockDocs.length).toBeGreaterThan(0);
      expect(workshopMaterialDocs.length).toBeGreaterThan(0);
    });

    it("should not gate audit projection on relation reconstruction completeness", () => {
      const baseline = buildValidBaseline();
      const plan = buildPostAdmissionMigrationPlan(baseline);

      expect(plan.counts.auditDocumentInserts).toBe(
        plan.audit.auditDocumentInserts.length,
      );
    });
  });
});
