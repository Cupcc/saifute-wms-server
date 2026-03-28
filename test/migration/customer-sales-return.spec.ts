import { buildSalesReturnMigrationPlan } from "../../scripts/migration/customer-sales-return/transformer";
import type {
  LegacySalesReturnSnapshot,
  SalesReturnDependencySnapshot,
} from "../../scripts/migration/customer-sales-return/types";

function buildLegacyKey(legacyTable: string, legacyId: number): string {
  return `${legacyTable}::${legacyId}`;
}

function buildDependencies(): SalesReturnDependencySnapshot {
  return {
    materialByLegacyKey: new Map([
      [
        buildLegacyKey("saifute_material", 701),
        {
          targetId: 1701,
          materialCode: "MAT-701",
          materialName: "壳体",
          specModel: "S-701",
          unitCode: "件",
        },
      ],
      [
        buildLegacyKey("saifute_material", 702),
        {
          targetId: 1702,
          materialCode: "MAT-702",
          materialName: "滤芯",
          specModel: null,
          unitCode: "套",
        },
      ],
      [
        buildLegacyKey("saifute_material", 703),
        {
          targetId: 1703,
          materialCode: "MAT-703",
          materialName: "整机",
          specModel: "P-703",
          unitCode: "台",
        },
      ],
    ]),
    customerByLegacyKey: new Map([
      [
        buildLegacyKey("saifute_customer", 201),
        {
          targetId: 5201,
          customerCode: "CUS-201",
          customerName: "华电集团",
        },
      ],
    ]),
    personnelByNormalizedName: new Map([
      [
        "王工",
        {
          targetId: 610,
          personnelCode: "PERS-610",
          personnelName: "王工",
        },
      ],
    ]),
    ambiguousPersonnelNames: new Set(["张三"]),
    blockedMaterialLegacyIds: new Set([999]),
    batch1Baseline: {
      expectedMapCounts: {
        materialCategory: 8,
        workshop: 13,
        supplier: 93,
        personnel: 51,
        customer: 184,
        material: 437,
      },
      actualMapCounts: {
        materialCategory: 8,
        workshop: 13,
        supplier: 93,
        personnel: 51,
        customer: 184,
        material: 437,
      },
      expectedBlockedMaterialCount: 21,
      actualBlockedMaterialCount: 21,
      issues: [],
    },
    outboundBaseBaseline: {
      expectedOrderMapCount: 3,
      actualOrderMapCount: 3,
      expectedLineMapCount: 4,
      actualLineMapCount: 4,
      expectedExcludedDocumentCount: 2,
      actualExcludedDocumentCount: 2,
      issues: [],
    },
    outboundLinesByMaterialId: new Map([
      [
        1701,
        [
          {
            targetLineId: 8001,
            targetOrderId: 9001,
            lineNo: 1,
            materialId: 1701,
            customerId: 5201,
            workshopId: 7000,
            bizDate: "2026-01-02",
            documentNo: "CK001",
            quantity: "10.000000",
            startNumber: null,
            endNumber: null,
          },
        ],
      ],
      [
        1702,
        [
          {
            targetLineId: 8002,
            targetOrderId: 9001,
            lineNo: 2,
            materialId: 1702,
            customerId: 5201,
            workshopId: 7000,
            bizDate: "2026-01-02",
            documentNo: "CK001",
            quantity: "5.000000",
            startNumber: null,
            endNumber: null,
          },
          {
            targetLineId: 8005,
            targetOrderId: 9002,
            lineNo: 1,
            materialId: 1702,
            customerId: 5201,
            workshopId: 7000,
            bizDate: "2026-01-10",
            documentNo: "CK002",
            quantity: "5.000000",
            startNumber: null,
            endNumber: null,
          },
        ],
      ],
    ]),
    outboundOrderMapByLegacyId: new Map([
      [901, { targetOrderId: 9001, documentNo: "CK001" }],
      [902, { targetOrderId: 9002, documentNo: "CK002" }],
    ]),
    workshopByTargetId: new Map([
      [
        1,
        {
          targetId: 1,
          workshopCode: "WS-LEGACY-DEFAULT",
          workshopName: "历史默认车间",
        },
      ],
      [
        7000,
        {
          targetId: 7000,
          workshopCode: "WS-7000",
          workshopName: "总装车间",
        },
      ],
    ]),
    existingDocumentNos: new Set(["CK001", "CK002"]),
  };
}

function buildSnapshot(): LegacySalesReturnSnapshot {
  return {
    orders: [
      {
        legacyTable: "saifute_sales_return_order",
        legacyId: 20,
        returnNo: "TH-2026-001",
        returnDate: "2026-01-15 00:00:00",
        customerLegacyId: 201,
        sourceType: null,
        sourceLegacyId: null,
        chargeBy: "王工",
        attn: "王工",
        totalAmount: "35.00",
        remark: "正常退货",
        delFlag: 0,
        voidDescription: null,
        createdBy: "admin",
        createdAt: "2026-01-15 08:00:00",
        updatedBy: "admin",
        updatedAt: "2026-01-15 09:00:00",
      },
      {
        legacyTable: "saifute_sales_return_order",
        legacyId: 21,
        returnNo: "TH-2026-001",
        returnDate: "2026-01-16 00:00:00",
        customerLegacyId: 201,
        sourceType: null,
        sourceLegacyId: null,
        chargeBy: "张三",
        attn: "张三",
        totalAmount: "20.00",
        remark: "重开退货单",
        delFlag: 0,
        voidDescription: null,
        createdBy: "admin",
        createdAt: "2026-01-16 08:00:00",
        updatedBy: "admin",
        updatedAt: "2026-01-16 09:00:00",
      },
      {
        legacyTable: "saifute_sales_return_order",
        legacyId: 22,
        returnNo: "TH-2026-002",
        returnDate: "2026-01-20 00:00:00",
        customerLegacyId: 201,
        sourceType: null,
        sourceLegacyId: null,
        chargeBy: null,
        attn: null,
        totalAmount: null,
        remark: null,
        delFlag: 2,
        voidDescription: "重开",
        createdBy: "ops",
        createdAt: "2026-01-20 08:00:00",
        updatedBy: "checker",
        updatedAt: "2026-01-20 10:00:00",
      },
      {
        // legacyId 23: unmapped customer (999) — structural exclusion under formal admission
        legacyTable: "saifute_sales_return_order",
        legacyId: 23,
        returnNo: "TH-2026-UNMAPPED-CUST",
        returnDate: "2026-01-21 00:00:00",
        customerLegacyId: 999,
        sourceType: null,
        sourceLegacyId: null,
        chargeBy: null,
        attn: null,
        totalAmount: "10.00",
        remark: null,
        delFlag: 0,
        voidDescription: null,
        createdBy: "ops",
        createdAt: "2026-01-21 08:00:00",
        updatedBy: null,
        updatedAt: null,
      },
      {
        // legacyId 24: multiple upstream line candidates — admitted with null sourceDoc*
        legacyTable: "saifute_sales_return_order",
        legacyId: 24,
        returnNo: "TH-2026-MULTI-CAND",
        returnDate: "2026-01-25 00:00:00",
        customerLegacyId: 201,
        sourceType: null,
        sourceLegacyId: null,
        chargeBy: null,
        attn: null,
        totalAmount: "10.00",
        remark: null,
        delFlag: 0,
        voidDescription: null,
        createdBy: "ops",
        createdAt: "2026-01-25 08:00:00",
        updatedBy: null,
        updatedAt: null,
      },
    ],
    details: [
      {
        legacyTable: "saifute_sales_return_detail",
        legacyId: 3001,
        parentLegacyTable: "saifute_sales_return_order",
        parentLegacyId: 20,
        materialLegacyId: 701,
        returnQty: "3.5",
        unit: "件",
        unitPrice: "10.00",
        interval: null,
        remark: "主料退货",
      },
      {
        legacyTable: "saifute_sales_return_detail",
        legacyId: 3002,
        parentLegacyTable: "saifute_sales_return_order",
        parentLegacyId: 21,
        materialLegacyId: 701,
        returnQty: "2",
        unit: "件",
        unitPrice: "10.00",
        interval: null,
        remark: null,
      },
      {
        legacyTable: "saifute_sales_return_detail",
        legacyId: 3003,
        parentLegacyTable: "saifute_sales_return_order",
        parentLegacyId: 22,
        materialLegacyId: 701,
        returnQty: "1",
        unit: "件",
        unitPrice: "10.00",
        interval: null,
        remark: null,
      },
      {
        // detail 3004: material 703 (mapped, no outbound lines) for unmapped-customer order
        legacyTable: "saifute_sales_return_detail",
        legacyId: 3004,
        parentLegacyTable: "saifute_sales_return_order",
        parentLegacyId: 23,
        materialLegacyId: 703,
        returnQty: "1",
        unit: "台",
        unitPrice: "10.00",
        interval: null,
        remark: null,
      },
      {
        // detail 3005: material 702 with two upstream candidates
        legacyTable: "saifute_sales_return_detail",
        legacyId: 3005,
        parentLegacyTable: "saifute_sales_return_order",
        parentLegacyId: 24,
        materialLegacyId: 702,
        returnQty: "1",
        unit: "套",
        unitPrice: "10.00",
        interval: null,
        remark: null,
      },
    ],
    audits: [],
    inventoryUsedByDetailId: new Map(),
  };
}

describe("customer-sales-return migration transformer (formal-row-first)", () => {
  it("should build deterministic sales-return plans and admit all structurally-valid orders", () => {
    const plan = buildSalesReturnMigrationPlan(
      buildSnapshot(),
      buildDependencies(),
    );

    expect(plan.migrationBatch).toBe(
      "batch3c-outbound-sales-return-recoverable",
    );
    expect(plan.globalBlockers).toHaveLength(0);
    expect(plan.counts.sourceCounts.orders).toBe(5);
    expect(plan.counts.sourceCounts.details).toBe(5);
    // Order 23 is structurally invalid because customer mapping is required.
    expect(plan.admittedOrders).toHaveLength(4);
    expect(plan.excludedDocuments).toHaveLength(1);
    // No pending relations under formal-row-first.
    expect(plan.pendingRelations).toHaveLength(0);
  });

  it("should admit a sales-return order that resolves to exactly one upstream outbound line with sourceDoc* populated", () => {
    const plan = buildSalesReturnMigrationPlan(
      buildSnapshot(),
      buildDependencies(),
    );

    const admittedOrder = plan.admittedOrders.find(
      (record) => record.legacyId === 20,
    );
    expect(admittedOrder).toBeDefined();
    expect(admittedOrder?.target.documentNo).toBe("TH-2026-001");
    expect(admittedOrder?.target.orderType).toBe("SALES_RETURN");
    expect(admittedOrder?.target.bizDate).toBe("2026-01-15");
    expect(admittedOrder?.target.customerId).toBe(5201);
    expect(admittedOrder?.target.customerCodeSnapshot).toBe("CUS-201");
    expect(admittedOrder?.target.customerNameSnapshot).toBe("华电集团");
    expect(admittedOrder?.target.auditStatusSnapshot).toBe("PENDING");
    expect(admittedOrder?.target.inventoryEffectStatus).toBe("POSTED");
    expect(admittedOrder?.target.lifecycleStatus).toBe("EFFECTIVE");

    expect(admittedOrder?.lines).toHaveLength(1);
    const line = admittedOrder?.lines[0];
    expect(line?.target.materialId).toBe(1701);
    expect(line?.target.materialCodeSnapshot).toBe("MAT-701");
    expect(line?.target.quantity).toBe("3.500000");
    expect(line?.target.startNumber).toBeNull();
    expect(line?.target.endNumber).toBeNull();
    // Resolved: sourceDoc* should be populated.
    expect(line?.target.sourceDocumentType).toBe("CustomerStockOrder");
    expect(line?.target.sourceDocumentId).toBe(9001);
    expect(line?.target.sourceDocumentLineId).toBe(8001);
    expect(line?.nullSourceDocumentReason).toBeNull();
  });

  it("should rewrite duplicate returnNo and admit both orders", () => {
    const plan = buildSalesReturnMigrationPlan(
      buildSnapshot(),
      buildDependencies(),
    );

    const admitted20 = plan.admittedOrders.find(
      (record) => record.legacyId === 20,
    );
    const admitted21 = plan.admittedOrders.find(
      (record) => record.legacyId === 21,
    );
    expect(admitted20?.target.documentNo).toBe("TH-2026-001");
    expect(admitted21?.target.documentNo).toBe("TH-2026-001-LEGACY-21");
    // Both are admitted, not excluded.
    expect(admitted20).toBeDefined();
    expect(admitted21).toBeDefined();
  });

  it("should set auditStatusSnapshot to PENDING for effective sales-return orders (no type-7 audit records)", () => {
    const plan = buildSalesReturnMigrationPlan(
      buildSnapshot(),
      buildDependencies(),
    );

    for (const order of plan.admittedOrders) {
      if (order.target.lifecycleStatus === "EFFECTIVE") {
        expect(order.target.auditStatusSnapshot).toBe("PENDING");
      }
    }
  });

  it("should set lifecycleStatus to VOIDED and inventoryEffectStatus to REVERSED for del_flag=2 orders", () => {
    const plan = buildSalesReturnMigrationPlan(
      buildSnapshot(),
      buildDependencies(),
    );

    const voidedOrder = plan.admittedOrders.find(
      (record) => record.legacyId === 22,
    );
    expect(voidedOrder).toBeDefined();
    expect(voidedOrder?.target.lifecycleStatus).toBe("VOIDED");
    expect(voidedOrder?.target.inventoryEffectStatus).toBe("REVERSED");
    expect(voidedOrder?.target.voidReason).toBe("重开");
  });

  it("should exclude an order whose customer mapping is missing", () => {
    const plan = buildSalesReturnMigrationPlan(
      buildSnapshot(),
      buildDependencies(),
    );

    const admitted23 = plan.admittedOrders.find(
      (record) => record.legacyId === 23,
    );
    expect(admitted23).toBeUndefined();

    const excluded23 = plan.excludedDocuments.find(
      (record) => record.legacyId === 23,
    );
    expect(excluded23).toBeDefined();
    expect(excluded23?.exclusionReason).toContain("batch1 customer map");
  });

  it("should admit an order with multiple upstream line candidates with null sourceDoc*", () => {
    const plan = buildSalesReturnMigrationPlan(
      buildSnapshot(),
      buildDependencies(),
    );

    // Order 24 has material 702 with 2 candidate lines — ambiguous.
    // Under formal-row-first it must be admitted with null sourceDoc*.
    const admitted24 = plan.admittedOrders.find(
      (record) => record.legacyId === 24,
    );
    expect(admitted24).toBeDefined();
    expect(admitted24?.target.customerId).toBe(5201);

    const line = admitted24?.lines[0];
    expect(line?.target.materialId).toBe(1702);
    expect(line?.target.sourceDocumentType).toBeNull();
    expect(line?.target.sourceDocumentId).toBeNull();
    expect(line?.target.sourceDocumentLineId).toBeNull();
    expect(line?.nullSourceDocumentReason).toBe(
      "multiple-upstream-line-candidates",
    );

    // Must NOT appear in excluded documents or pending relations.
    const excluded24 = plan.excludedDocuments.find(
      (record) => record.legacyId === 24,
    );
    expect(excluded24).toBeUndefined();
    expect(plan.pendingRelations).toHaveLength(0);
  });

  it("should count admitted lines with null sourceDocument* separately", () => {
    const plan = buildSalesReturnMigrationPlan(
      buildSnapshot(),
      buildDependencies(),
    );

    // Order 24 remains admitted with unresolved source linkage.
    expect(plan.counts.admittedLinesWithNullSourceDocument).toBe(1);
    // Orders 20, 21, 22 fully resolve — their lines have sourceDoc* set.
    const resolvedCount =
      plan.counts.admittedLines -
      plan.counts.admittedLinesWithNullSourceDocument;
    expect(resolvedCount).toBeGreaterThanOrEqual(3);
  });

  it("should surface global blockers when batch1 baseline has issues", () => {
    const dependencies = buildDependencies();
    dependencies.batch1Baseline.issues = [
      "batch1 material map count mismatch: expected 437, received 436.",
    ];

    const plan = buildSalesReturnMigrationPlan(buildSnapshot(), dependencies);

    expect(plan.globalBlockers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          reason:
            "batch1 material map count mismatch: expected 437, received 436.",
        }),
      ]),
    );
  });

  it("should surface global blockers when outbound base baseline has issues", () => {
    const dependencies = buildDependencies();
    dependencies.outboundBaseBaseline.issues = [
      "batch2c order map count mismatch: expected 3, received 2.",
    ];

    const plan = buildSalesReturnMigrationPlan(buildSnapshot(), dependencies);

    expect(plan.globalBlockers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          reason: "batch2c order map count mismatch: expected 3, received 2.",
        }),
      ]),
    );
  });

  it("should emit a warning for ambiguous personnel names on non-void orders", () => {
    const plan = buildSalesReturnMigrationPlan(
      buildSnapshot(),
      buildDependencies(),
    );

    expect(
      plan.warnings.some(
        (warning) =>
          warning.reason.includes("ambiguous") ||
          warning.reason.includes("handlerNameSnapshot"),
      ),
    ).toBe(true);
  });

  it("should include deterministic document number rewrite entries", () => {
    const plan = buildSalesReturnMigrationPlan(
      buildSnapshot(),
      buildDependencies(),
    );

    const rewrites = plan.documentNoRewrites;
    expect(rewrites).toHaveLength(1);
    expect(rewrites[0]?.originalDocumentNo).toBe("TH-2026-001");
    expect(rewrites[0]?.rewrittenDocumentNo).toBe("TH-2026-001-LEGACY-21");
  });

  it("should not write startNumber or endNumber on any admitted line", () => {
    const plan = buildSalesReturnMigrationPlan(
      buildSnapshot(),
      buildDependencies(),
    );

    for (const order of plan.admittedOrders) {
      for (const line of order.lines) {
        expect(line.target.startNumber).toBeNull();
        expect(line.target.endNumber).toBeNull();
      }
    }
  });

  it("should produce deterministic archived payloads for admitted orders", () => {
    const plan = buildSalesReturnMigrationPlan(
      buildSnapshot(),
      buildDependencies(),
    );

    const admittedOrder20 = plan.admittedOrders.find(
      (record) => record.legacyId === 20,
    );
    expect(admittedOrder20?.archivedPayload.legacyTable).toBe(
      "saifute_sales_return_order",
    );
    expect(admittedOrder20?.archivedPayload.legacyId).toBe(20);
    expect(admittedOrder20?.archivedPayload.targetTable).toBe(
      "customer_stock_order",
    );
    expect(admittedOrder20?.archivedPayload.payload).toEqual(
      expect.objectContaining({
        originalDocumentNo: "TH-2026-001",
      }),
    );
  });

  it("should use the real resolved workshop name snapshot instead of a synthesized placeholder", () => {
    const plan = buildSalesReturnMigrationPlan(
      buildSnapshot(),
      buildDependencies(),
    );

    const admittedOrder = plan.admittedOrders.find(
      (record) => record.legacyId === 20,
    );
    expect(admittedOrder?.target.workshopId).toBe(7000);
    expect(admittedOrder?.target.workshopNameSnapshot).toBe("总装车间");
    expect(admittedOrder?.target.workshopNameSnapshot).not.toMatch(
      /^workshop-\d+$/u,
    );
  });

  it("should use the frozen default workshop when no unique upstream workshop can be derived", () => {
    const dependencies = buildDependencies();
    dependencies.outboundLinesByMaterialId.set(1702, [
      {
        targetLineId: 8002,
        targetOrderId: 9001,
        lineNo: 2,
        materialId: 1702,
        customerId: 5201,
        workshopId: 7000,
        bizDate: "2026-01-02",
        documentNo: "CK001",
        quantity: "5.000000",
        startNumber: null,
        endNumber: null,
      },
      {
        targetLineId: 8005,
        targetOrderId: 9002,
        lineNo: 1,
        materialId: 1702,
        customerId: 5201,
        workshopId: 7001,
        bizDate: "2026-01-10",
        documentNo: "CK002",
        quantity: "5.000000",
        startNumber: null,
        endNumber: null,
      },
    ]);

    const plan = buildSalesReturnMigrationPlan(buildSnapshot(), dependencies);

    const admitted24 = plan.admittedOrders.find(
      (record) => record.legacyId === 24,
    );
    expect(admitted24?.target.workshopId).toBe(1);
    expect(admitted24?.target.workshopNameSnapshot).toBe("历史默认车间");
  });

  it("should use source_id to anchor candidate outbound order and narrow to one resolved line", () => {
    const dependencies = buildDependencies();
    const snapshot = buildSnapshot();

    // Add a second outbound line for material 1701 under a different order
    dependencies.outboundLinesByMaterialId.set(1701, [
      {
        targetLineId: 8001,
        targetOrderId: 9001,
        lineNo: 1,
        materialId: 1701,
        customerId: 5201,
        workshopId: 7000,
        bizDate: "2026-01-02",
        documentNo: "CK001",
        quantity: "10.000000",
        startNumber: null,
        endNumber: null,
      },
      {
        targetLineId: 8010,
        targetOrderId: 9002,
        lineNo: 3,
        materialId: 1701,
        customerId: 5201,
        workshopId: 7000,
        bizDate: "2026-01-01",
        documentNo: "CK002",
        quantity: "10.000000",
        startNumber: null,
        endNumber: null,
      },
    ]);

    // Without source_id: order 20 (sourceLegacyId: null) has multiple candidates.
    // Under formal-row-first it is still admitted, but with null sourceDoc*.
    const planWithoutAnchor = buildSalesReturnMigrationPlan(
      snapshot,
      dependencies,
    );
    const admitted20NoAnchor = planWithoutAnchor.admittedOrders.find(
      (record) => record.legacyId === 20,
    );
    expect(admitted20NoAnchor).toBeDefined();
    expect(admitted20NoAnchor?.lines[0]?.target.sourceDocumentType).toBeNull();

    // With source_id set to legacy outbound order 901 (→ targetOrderId 9001):
    // narrows to a single candidate → sourceDoc* populated.
    const snapshotWithSourceId: typeof snapshot = {
      ...snapshot,
      orders: snapshot.orders.map((order) =>
        order.legacyId === 20 ? { ...order, sourceLegacyId: 901 } : order,
      ),
    };
    const planWithAnchor = buildSalesReturnMigrationPlan(
      snapshotWithSourceId,
      dependencies,
    );
    const admitted20WithAnchor = planWithAnchor.admittedOrders.find(
      (record) => record.legacyId === 20,
    );
    expect(admitted20WithAnchor).toBeDefined();
    expect(admitted20WithAnchor?.lines[0]?.target.sourceDocumentType).toBe(
      "CustomerStockOrder",
    );
    expect(admitted20WithAnchor?.lines[0]?.target.sourceDocumentId).toBe(9001);
    expect(admitted20WithAnchor?.lines[0]?.target.sourceDocumentLineId).toBe(
      8001,
    );
  });

  it("should admit a line with null sourceDoc* when returnQty exceeds all outbound line quantities", () => {
    const dependencies = buildDependencies();

    // Set outbound line quantity very low so returnQty=3.5 exceeds it
    dependencies.outboundLinesByMaterialId.set(1701, [
      {
        targetLineId: 8001,
        targetOrderId: 9001,
        lineNo: 1,
        materialId: 1701,
        customerId: 5201,
        workshopId: 7000,
        bizDate: "2026-01-02",
        documentNo: "CK001",
        quantity: "2.000000",
        startNumber: null,
        endNumber: null,
      },
    ]);

    const plan = buildSalesReturnMigrationPlan(buildSnapshot(), dependencies);

    // Order 20 detail 3001 (returnQty=3.5) exceeds outbound qty=2.
    // Under formal-row-first: admitted with null sourceDoc*, not excluded.
    const admitted20 = plan.admittedOrders.find(
      (record) => record.legacyId === 20,
    );
    expect(admitted20).toBeDefined();

    const line = admitted20?.lines[0];
    expect(line?.target.sourceDocumentType).toBeNull();
    expect(line?.target.sourceDocumentId).toBeNull();
    expect(line?.nullSourceDocumentReason).toBe("no-upstream-line-candidate");

    // No excluded document or pending relation for order 20.
    const excluded20 = plan.excludedDocuments.find(
      (record) => record.legacyId === 20,
    );
    expect(excluded20).toBeUndefined();
    expect(plan.pendingRelations).toHaveLength(0);
  });

  it("should narrow using saifute_inventory_used when multiple candidates exist and produce a resolved line", () => {
    const dependencies = buildDependencies();

    // Two outbound lines for material 1702: targets 9001 (CK001) and 9002 (CK002)
    // Normally detail 3005 (material 1702, customer 201) would be ambiguous.
    // inventory_used row: beforeOrderType=7, afterOrderId=902 -> maps to targetOrderId 9002
    const snapshot = buildSnapshot();
    const snapshotWithInventoryUsed: typeof snapshot = {
      ...snapshot,
      inventoryUsedByDetailId: new Map([
        [
          3005,
          [
            {
              usedId: 500,
              materialId: 702,
              beforeOrderType: 7,
              beforeOrderId: 24,
              beforeDetailId: 3005,
              afterOrderType: 3,
              afterOrderId: 902,
              afterDetailId: null,
            },
          ],
        ],
      ]),
    };

    const plan = buildSalesReturnMigrationPlan(
      snapshotWithInventoryUsed,
      dependencies,
    );

    // Order 24 detail 3005 narrows to one candidate (line 8005) via inventory_used.
    const admitted24 = plan.admittedOrders.find(
      (record) => record.legacyId === 24,
    );
    expect(admitted24).toBeDefined();
    expect(admitted24?.lines[0]?.target.sourceDocumentType).toBe(
      "CustomerStockOrder",
    );
    expect(admitted24?.lines[0]?.target.sourceDocumentId).toBe(9002);
    expect(admitted24?.lines[0]?.target.sourceDocumentLineId).toBe(8005);
    expect(admitted24?.lines[0]?.nullSourceDocumentReason).toBeNull();
  });

  it("should exclude a header where all detail lines are structurally invalid", () => {
    const dependencies = buildDependencies();
    const snapshot = buildSnapshot();

    // Build a snapshot with an order whose only detail has a blocked material.
    const snapshotWithBlockedLine: typeof snapshot = {
      ...snapshot,
      orders: [
        {
          legacyTable: "saifute_sales_return_order",
          legacyId: 99,
          returnNo: "TH-ALL-BLOCKED",
          returnDate: "2026-01-30 00:00:00",
          customerLegacyId: 201,
          sourceType: null,
          sourceLegacyId: null,
          chargeBy: null,
          attn: null,
          totalAmount: "5.00",
          remark: null,
          delFlag: 0,
          voidDescription: null,
          createdBy: "ops",
          createdAt: "2026-01-30 08:00:00",
          updatedBy: null,
          updatedAt: null,
        },
      ],
      details: [
        {
          // Material legacyId=999 is in blockedMaterialLegacyIds
          legacyTable: "saifute_sales_return_detail",
          legacyId: 9901,
          parentLegacyTable: "saifute_sales_return_order",
          parentLegacyId: 99,
          materialLegacyId: 999,
          returnQty: "1",
          unit: "件",
          unitPrice: "5.00",
          interval: null,
          remark: null,
        },
      ],
      audits: [],
      inventoryUsedByDetailId: new Map(),
    };

    const plan = buildSalesReturnMigrationPlan(
      snapshotWithBlockedLine,
      dependencies,
    );

    const excluded99 = plan.excludedDocuments.find(
      (record) => record.legacyId === 99,
    );
    expect(excluded99).toBeDefined();
    expect(excluded99?.isHardBlocker).toBe(true);

    const admitted99 = plan.admittedOrders.find(
      (record) => record.legacyId === 99,
    );
    expect(admitted99).toBeUndefined();
  });
});
