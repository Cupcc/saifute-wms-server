import { buildWorkshopReturnMigrationPlan } from "../../scripts/migration/workshop-return/transformer";
import type {
  LegacyWorkshopReturnSnapshot,
  WorkshopReturnDependencySnapshot,
} from "../../scripts/migration/workshop-return/types";

function buildLegacyKey(legacyTable: string, legacyId: number): string {
  return `${legacyTable}::${legacyId}`;
}

function requireDefined<T>(value: T | null | undefined): T {
  expect(value).toBeDefined();
  if (value == null) {
    throw new Error("Expected value to be defined");
  }
  return value;
}

function buildDependencies(): WorkshopReturnDependencySnapshot {
  return {
    materialByLegacyKey: new Map([
      [
        buildLegacyKey("saifute_material", 101),
        {
          targetId: 1101,
          materialCode: "MAT-101",
          materialName: "轴承",
          specModel: "6205",
          unitCode: "个",
        },
      ],
      [
        buildLegacyKey("saifute_material", 102),
        {
          targetId: 1102,
          materialCode: "MAT-102",
          materialName: "密封圈",
          specModel: null,
          unitCode: "套",
        },
      ],
      [
        buildLegacyKey("saifute_material", 103),
        {
          targetId: 1103,
          materialCode: "MAT-103",
          materialName: "螺栓",
          specModel: "M10",
          unitCode: "个",
        },
      ],
    ]),
    workshopByLegacyKey: new Map([
      [
        buildLegacyKey("saifute_workshop", 10),
        {
          targetId: 3010,
          workshopCode: "WS-10",
          workshopName: "机加工车间",
        },
      ],
    ]),
    workshopByTargetId: new Map([
      [
        1,
        {
          targetId: 1,
          workshopCode: "WS-LEGACY-DEFAULT",
          workshopName: "默认车间",
        },
      ],
      [
        3010,
        {
          targetId: 3010,
          workshopCode: "WS-10",
          workshopName: "机加工车间",
        },
      ],
    ]),
    personnelByNormalizedName: new Map([
      [
        "李工",
        {
          targetId: 620,
          personnelCode: "PERS-620",
          personnelName: "李工",
        },
      ],
    ]),
    ambiguousPersonnelNames: new Set<string>(),
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
    workshopPickBaseBaseline: {
      expectedOrderMapCount: 61,
      actualOrderMapCount: 61,
      expectedLineMapCount: 145,
      actualLineMapCount: 145,
      expectedExcludedDocumentCount: 14,
      actualExcludedDocumentCount: 14,
      issues: [],
    },
    pickLinesByMaterialId: new Map([
      [
        1101,
        [
          {
            targetLineId: 7001,
            targetOrderId: 8001,
            lineNo: 1,
            materialId: 1101,
            workshopId: 3010,
            bizDate: "2026-01-02",
            documentNo: "PK-001",
            quantity: "10.000000",
          },
        ],
      ],
      [
        1102,
        [
          {
            targetLineId: 7002,
            targetOrderId: 8001,
            lineNo: 2,
            materialId: 1102,
            workshopId: 3010,
            bizDate: "2026-01-02",
            documentNo: "PK-001",
            quantity: "5.000000",
          },
          {
            targetLineId: 7005,
            targetOrderId: 8002,
            lineNo: 1,
            materialId: 1102,
            workshopId: 3010,
            bizDate: "2026-01-10",
            documentNo: "PK-002",
            quantity: "3.000000",
          },
        ],
      ],
    ]),
    pickOrderMapByLegacyId: new Map([
      [501, { targetOrderId: 8001, documentNo: "PK-001" }],
      [502, { targetOrderId: 8002, documentNo: "PK-002" }],
    ]),
    existingWorkshopMaterialDocumentNos: new Set(["PK-001", "PK-002"]),
    excludedPickLegacyIds: new Set<number>(),
  };
}

function buildSnapshot(): LegacyWorkshopReturnSnapshot {
  return {
    orders: [
      {
        legacyTable: "saifute_return_order",
        legacyId: 30,
        returnNo: "TR-2026-001",
        returnDate: "2026-01-15 00:00:00",
        workshopLegacyId: 10,
        sourceType: null,
        sourceId: null,
        returnBy: "李工",
        chargeBy: null,
        totalAmount: "15.00",
        remark: null,
        delFlag: 0,
        voidDescription: null,
        createdBy: "admin",
        createdAt: "2026-01-15 08:00:00",
        updatedBy: "admin",
        updatedAt: "2026-01-15 08:00:00",
      },
    ],
    details: [
      {
        legacyTable: "saifute_return_detail",
        legacyId: 301,
        parentLegacyTable: "saifute_return_order",
        parentLegacyId: 30,
        materialLegacyId: 101,
        returnQty: "3.000000",
        unitPrice: "5.00",
        remark: null,
      },
    ],
    audits: [
      {
        legacyId: 401,
        documentType: 5,
        documentId: 30,
        auditStatus: "1",
        auditor: "李工",
        auditTime: "2026-01-15 09:00:00",
        auditOpinion: null,
      },
    ],
    inventoryUsedByReturnOrderId: new Map([
      [
        30,
        [
          {
            usedId: 9001,
            materialId: 101,
            beforeOrderType: 4,
            beforeOrderId: 501,
            beforeDetailId: null,
            afterOrderType: 5,
            afterOrderId: 30,
            afterDetailId: 301,
          },
        ],
      ],
    ]),
  };
}

describe("workshop-return transformer (formal-row-first)", () => {
  it("should admit a return order where all lines resolve uniquely to a single upstream pick line", () => {
    const plan = buildWorkshopReturnMigrationPlan(
      buildSnapshot(),
      buildDependencies(),
    );

    expect(plan.globalBlockers).toHaveLength(0);
    expect(plan.admittedOrders).toHaveLength(1);
    expect(plan.excludedDocuments).toHaveLength(0);
    expect(plan.pendingRelations).toHaveLength(0);

    const order = requireDefined(plan.admittedOrders[0]);
    expect(order.target.orderType).toBe("RETURN");
    expect(order.target.documentNo).toBe("TR-2026-001");
    expect(order.target.workshopId).toBe(3010);
    expect(order.target.lifecycleStatus).toBe("EFFECTIVE");
    expect(order.target.auditStatusSnapshot).toBe("APPROVED");
    expect(order.lines).toHaveLength(1);

    const line = requireDefined(order.lines[0]);
    expect(line.target.sourceDocumentType).toBe("WorkshopMaterialOrder");
    expect(line.target.sourceDocumentId).toBe(8001);
    expect(line.target.sourceDocumentLineId).toBe(7001);
    expect(line.target.materialId).toBe(1101);
    expect(line.target.quantity).toBe("3.000000");
  });

  it("should archive non-null source_id as a warning without forging a relation", () => {
    const snapshot = buildSnapshot();
    snapshot.orders[0] = {
      ...requireDefined(snapshot.orders[0]),
      sourceId: 42,
      sourceType: null,
    };
    const plan = buildWorkshopReturnMigrationPlan(
      snapshot,
      buildDependencies(),
    );

    expect(plan.globalBlockers).toHaveLength(0);
    expect(plan.context.sourceFieldBlocker).toBe(true);
    expect(
      plan.warnings.some((w) =>
        w.reason.includes("non-null source_id or source_type"),
      ),
    ).toBe(true);
  });

  it("should archive non-null source_type as a warning without forging a relation", () => {
    const snapshot = buildSnapshot();
    snapshot.orders[0] = {
      ...requireDefined(snapshot.orders[0]),
      sourceId: null,
      sourceType: 2,
    };
    const plan = buildWorkshopReturnMigrationPlan(
      snapshot,
      buildDependencies(),
    );

    expect(plan.globalBlockers).toHaveLength(0);
    expect(plan.context.sourceFieldBlocker).toBe(true);
  });

  it("should exclude header when a detail line references an unknown material (structural exclusion)", () => {
    // Unknown material is a structural exclusion — no materialId to write.
    // With only one detail and it's excluded, the whole header is excluded.
    const snapshot = buildSnapshot();
    snapshot.details[0] = {
      ...requireDefined(snapshot.details[0]),
      materialLegacyId: 9999,
    };
    const plan = buildWorkshopReturnMigrationPlan(
      snapshot,
      buildDependencies(),
    );

    expect(plan.admittedOrders).toHaveLength(0);
    expect(plan.excludedDocuments).toHaveLength(1);
    // Structural exclusion — no pending relation record (nothing to enrich later)
    expect(plan.pendingRelations).toHaveLength(0);
  });

  it("should exclude header when a detail line references a blocked material (structural exclusion)", () => {
    const snapshot = buildSnapshot();
    snapshot.details[0] = {
      ...requireDefined(snapshot.details[0]),
      materialLegacyId: 999,
    };
    const plan = buildWorkshopReturnMigrationPlan(
      snapshot,
      buildDependencies(),
    );

    expect(plan.admittedOrders).toHaveLength(0);
    expect(plan.excludedDocuments).toHaveLength(1);
    expect(plan.pendingRelations).toHaveLength(0);
  });

  it("should admit header with null source fields when no upstream pick line candidate exists", () => {
    // Under formal-row-first: unresolved pick relation is NOT a structural exclusion.
    // The header is admitted; the line is admitted with null sourceDocument* fields.
    const dependencies = buildDependencies();
    dependencies.pickLinesByMaterialId.delete(1101);
    const plan = buildWorkshopReturnMigrationPlan(
      buildSnapshot(),
      dependencies,
    );

    expect(plan.admittedOrders).toHaveLength(1);
    expect(plan.excludedDocuments).toHaveLength(0);
    expect(plan.pendingRelations).toHaveLength(1);
    expect(plan.pendingRelations[0]?.pendingReason).toBe(
      "no-upstream-pick-line-candidate",
    );

    const order = requireDefined(plan.admittedOrders[0]);
    const line = requireDefined(order.lines[0]);
    expect(line.target.sourceDocumentType).toBeNull();
    expect(line.target.sourceDocumentId).toBeNull();
    expect(line.target.sourceDocumentLineId).toBeNull();
    expect(plan.counts.admittedLinesWithNullSource).toBe(1);
  });

  it("should admit header with null source fields when upstream pick line date is after the return date", () => {
    // Temporal mismatch → no candidate → admitted with null source fields.
    const dependencies = buildDependencies();
    dependencies.pickLinesByMaterialId.set(1101, [
      {
        targetLineId: 7001,
        targetOrderId: 8001,
        lineNo: 1,
        materialId: 1101,
        workshopId: 3010,
        bizDate: "2026-02-01",
        documentNo: "PK-001",
        quantity: "10.000000",
      },
    ]);

    const plan = buildWorkshopReturnMigrationPlan(
      buildSnapshot(),
      dependencies,
    );

    expect(plan.admittedOrders).toHaveLength(1);
    expect(plan.excludedDocuments).toHaveLength(0);
    expect(plan.pendingRelations).toHaveLength(1);
    const line = requireDefined(
      requireDefined(plan.admittedOrders[0]).lines[0],
    );
    expect(line.target.sourceDocumentType).toBeNull();
  });

  it("should exclude header when no returnNo is present", () => {
    const snapshot = buildSnapshot();
    snapshot.orders[0] = {
      ...requireDefined(snapshot.orders[0]),
      returnNo: null,
    };
    const plan = buildWorkshopReturnMigrationPlan(
      snapshot,
      buildDependencies(),
    );

    expect(plan.admittedOrders).toHaveLength(0);
    expect(plan.excludedDocuments).toHaveLength(1);
    expect(plan.pendingRelations).toHaveLength(0);
  });

  it("should exclude header when no returnDate is present", () => {
    const snapshot = buildSnapshot();
    snapshot.orders[0] = {
      ...requireDefined(snapshot.orders[0]),
      returnDate: null,
    };
    const plan = buildWorkshopReturnMigrationPlan(
      snapshot,
      buildDependencies(),
    );

    expect(plan.admittedOrders).toHaveLength(0);
    expect(plan.excludedDocuments).toHaveLength(1);
  });

  it("should exclude header when details list is empty", () => {
    const snapshot = buildSnapshot();
    snapshot.details = [];
    const plan = buildWorkshopReturnMigrationPlan(
      snapshot,
      buildDependencies(),
    );

    expect(plan.admittedOrders).toHaveLength(0);
    expect(plan.excludedDocuments).toHaveLength(1);
  });

  it("should rewrite document number on collision with existing documents", () => {
    const dependencies = buildDependencies();
    dependencies.existingWorkshopMaterialDocumentNos.add("TR-2026-001");

    const plan = buildWorkshopReturnMigrationPlan(
      buildSnapshot(),
      dependencies,
    );

    expect(plan.admittedOrders).toHaveLength(1);
    expect(requireDefined(plan.admittedOrders[0]).target.documentNo).not.toBe(
      "TR-2026-001",
    );
    expect(plan.documentNoRewrites).toHaveLength(1);
    expect(requireDefined(plan.documentNoRewrites[0]).originalDocumentNo).toBe(
      "TR-2026-001",
    );
  });

  it("should set lifecycleStatus VOIDED when del_flag is 2", () => {
    const snapshot = buildSnapshot();
    snapshot.orders[0] = {
      ...requireDefined(snapshot.orders[0]),
      delFlag: 2,
      voidDescription: "作废原因",
    };
    const plan = buildWorkshopReturnMigrationPlan(
      snapshot,
      buildDependencies(),
    );

    expect(plan.admittedOrders).toHaveLength(1);
    const order = requireDefined(plan.admittedOrders[0]);
    expect(order.target.lifecycleStatus).toBe("VOIDED");
    expect(order.target.inventoryEffectStatus).toBe("REVERSED");
    expect(order.target.voidReason).toBe("作废原因");
  });

  it("should set auditStatusSnapshot NOT_REQUIRED when voided", () => {
    const snapshot = buildSnapshot();
    snapshot.orders[0] = { ...requireDefined(snapshot.orders[0]), delFlag: 2 };
    const plan = buildWorkshopReturnMigrationPlan(
      snapshot,
      buildDependencies(),
    );

    expect(plan.admittedOrders).toHaveLength(1);
    expect(
      requireDefined(plan.admittedOrders[0]).target.auditStatusSnapshot,
    ).toBe("NOT_REQUIRED");
  });

  it("should produce a global blocker when batch1 baseline has issues", () => {
    const dependencies = buildDependencies();
    dependencies.batch1Baseline.issues.push("Batch1 map count mismatch");
    const plan = buildWorkshopReturnMigrationPlan(
      buildSnapshot(),
      dependencies,
    );

    expect(plan.globalBlockers.length).toBeGreaterThan(0);
    expect(
      plan.globalBlockers.some((b) =>
        b.reason.includes("Batch1 map count mismatch"),
      ),
    ).toBe(true);
  });

  it("should produce a global blocker when workshop-pick-base baseline has issues", () => {
    const dependencies = buildDependencies();
    dependencies.workshopPickBaseBaseline.issues.push(
      "Pick base count mismatch",
    );
    const plan = buildWorkshopReturnMigrationPlan(
      buildSnapshot(),
      dependencies,
    );

    expect(plan.globalBlockers.length).toBeGreaterThan(0);
    expect(
      plan.globalBlockers.some((b) =>
        b.reason.includes("Pick base count mismatch"),
      ),
    ).toBe(true);
  });

  it("should admit header with null source fields when multiple pick line candidates exist and inventory_used does not narrow to one", () => {
    // Under formal-row-first: multi-candidate is NOT a structural exclusion.
    // The order is admitted; the line has null sourceDocument* fields.
    const snapshot = buildSnapshot();
    snapshot.details[0] = {
      ...requireDefined(snapshot.details[0]),
      materialLegacyId: 102,
    };
    snapshot.inventoryUsedByReturnOrderId = new Map();

    const plan = buildWorkshopReturnMigrationPlan(
      snapshot,
      buildDependencies(),
    );

    expect(plan.admittedOrders).toHaveLength(1);
    expect(plan.pendingRelations).toHaveLength(1);
    expect(plan.pendingRelations[0]?.pendingReason).toBe(
      "multiple-upstream-pick-line-candidates",
    );

    const line = requireDefined(
      requireDefined(plan.admittedOrders[0]).lines[0],
    );
    expect(line.target.sourceDocumentType).toBeNull();
    expect(plan.counts.admittedLinesWithNullSource).toBe(1);
  });

  it("should narrow to single candidate using inventory_used evidence when multiple candidates exist", () => {
    const snapshot = buildSnapshot();
    snapshot.details[0] = {
      ...requireDefined(snapshot.details[0]),
      materialLegacyId: 102,
      returnQty: "2.000000",
    };
    snapshot.inventoryUsedByReturnOrderId = new Map([
      [
        30,
        [
          {
            usedId: 9002,
            materialId: 102,
            beforeOrderType: 4,
            beforeOrderId: 502,
            beforeDetailId: null,
            afterOrderType: 5,
            afterOrderId: 30,
            afterDetailId: null,
          },
        ],
      ],
    ]);

    const plan = buildWorkshopReturnMigrationPlan(
      snapshot,
      buildDependencies(),
    );

    expect(plan.admittedOrders).toHaveLength(1);
    expect(plan.pendingRelations).toHaveLength(0);
    const order = requireDefined(plan.admittedOrders[0]);
    const line = requireDefined(order.lines[0]);
    expect(line.target.sourceDocumentType).toBe("WorkshopMaterialOrder");
    expect(line.target.sourceDocumentId).toBe(8002);
    expect(line.target.sourceDocumentLineId).toBe(7005);
  });

  it("should report counts accurately for a fully resolved order", () => {
    const plan = buildWorkshopReturnMigrationPlan(
      buildSnapshot(),
      buildDependencies(),
    );

    expect(plan.counts.sourceCounts.orders).toBe(1);
    expect(plan.counts.sourceCounts.details).toBe(1);
    expect(plan.counts.admittedOrders).toBe(1);
    expect(plan.counts.admittedLines).toBe(1);
    expect(plan.counts.admittedLinesWithNullSource).toBe(0);
    expect(plan.counts.pendingRelationLines).toBe(0);
    expect(plan.counts.excludedHeaders).toBe(0);
  });

  it("should report admittedLinesWithNullSource when pick resolution fails", () => {
    const dependencies = buildDependencies();
    dependencies.pickLinesByMaterialId.delete(1101);
    const plan = buildWorkshopReturnMigrationPlan(
      buildSnapshot(),
      dependencies,
    );

    expect(plan.counts.admittedOrders).toBe(1);
    expect(plan.counts.admittedLines).toBe(1);
    expect(plan.counts.admittedLinesWithNullSource).toBe(1);
    expect(plan.counts.pendingRelationLines).toBe(1);
  });

  it("should record context.sourceFieldBlocker as false when all source fields are null", () => {
    const plan = buildWorkshopReturnMigrationPlan(
      buildSnapshot(),
      buildDependencies(),
    );
    expect(plan.context.sourceFieldBlocker).toBe(false);
  });

  it("should not admit order when workshop legacy ID is not found in batch1 map", () => {
    const snapshot = buildSnapshot();
    snapshot.orders[0] = {
      ...requireDefined(snapshot.orders[0]),
      workshopLegacyId: 9999,
    };
    const plan = buildWorkshopReturnMigrationPlan(
      snapshot,
      buildDependencies(),
    );

    expect(plan.admittedOrders).toHaveLength(0);
    expect(plan.excludedDocuments).toHaveLength(1);
  });

  it("should produce archived payload for admitted order and lines", () => {
    const plan = buildWorkshopReturnMigrationPlan(
      buildSnapshot(),
      buildDependencies(),
    );

    expect(plan.admittedOrders).toHaveLength(1);
    const order = requireDefined(plan.admittedOrders[0]);
    expect(order.archivedPayload).toBeDefined();
    expect(order.archivedPayload.legacyTable).toBe("saifute_return_order");
    expect(order.archivedPayload.legacyId).toBe(30);

    const line = requireDefined(order.lines[0]);
    expect(line.archivedPayload).toBeDefined();
    expect(line.archivedPayload.legacyTable).toBe("saifute_return_detail");
    expect(line.archivedPayload.legacyId).toBe(301);
  });

  it("should produce archived payload with null pick fields when source is unresolved", () => {
    const dependencies = buildDependencies();
    dependencies.pickLinesByMaterialId.delete(1101);
    const plan = buildWorkshopReturnMigrationPlan(
      buildSnapshot(),
      dependencies,
    );

    expect(plan.admittedOrders).toHaveLength(1);
    const line = requireDefined(
      requireDefined(plan.admittedOrders[0]).lines[0],
    );
    expect(line.archivedPayload.payload.resolvedPickLineId).toBeNull();
    expect(line.archivedPayload.payload.resolvedPickOrderId).toBeNull();
    expect(line.archivedPayload.payload.resolvedPickDocumentNo).toBeNull();
  });

  it("should admit order using header workshopLegacyId when pick line resolves to a different workshop", () => {
    // Under formal-row-first: the header's workshop is canonical.
    // When the pick line has a mismatching workshop, the line is admitted with null source fields
    // (pick resolution returns upstream-workshop-mismatch → pending relation).
    // The order is admitted using targetWorkshopId from the header.
    const snapshot = buildSnapshot();
    snapshot.orders[0] = {
      ...requireDefined(snapshot.orders[0]),
      workshopLegacyId: 10,
    };

    const dependencies = buildDependencies();
    dependencies.pickLinesByMaterialId.set(1101, [
      {
        targetLineId: 7001,
        targetOrderId: 8001,
        lineNo: 1,
        materialId: 1101,
        workshopId: 3099,
        bizDate: "2026-01-02",
        documentNo: "PK-001",
        quantity: "10.000000",
      },
    ]);

    const plan = buildWorkshopReturnMigrationPlan(snapshot, dependencies);

    expect(plan.admittedOrders).toHaveLength(1);
    expect(plan.excludedDocuments).toHaveLength(0);
    expect(plan.pendingRelations).toHaveLength(1);
    expect(plan.pendingRelations[0]?.pendingReason).toBe(
      "upstream-workshop-mismatch",
    );

    const order = requireDefined(plan.admittedOrders[0]);
    expect(order.target.workshopId).toBe(3010);

    const line = requireDefined(order.lines[0]);
    expect(line.target.sourceDocumentType).toBeNull();
  });

  it("should use the frozen default workshop when return order has no workshopLegacyId", () => {
    const snapshot = buildSnapshot();
    snapshot.orders[0] = {
      ...requireDefined(snapshot.orders[0]),
      workshopLegacyId: null,
    };

    const plan = buildWorkshopReturnMigrationPlan(
      snapshot,
      buildDependencies(),
    );

    expect(plan.admittedOrders).toHaveLength(1);
    const order = requireDefined(plan.admittedOrders[0]);
    expect(order.target.workshopId).toBe(1);
    expect(order.target.workshopNameSnapshot).toBe("默认车间");
  });

  it("should still admit header with the frozen default workshop when no workshopLegacyId and no pick line resolves", () => {
    const snapshot = buildSnapshot();
    snapshot.orders[0] = {
      ...requireDefined(snapshot.orders[0]),
      workshopLegacyId: null,
    };
    const dependencies = buildDependencies();
    dependencies.pickLinesByMaterialId.delete(1101);

    const plan = buildWorkshopReturnMigrationPlan(snapshot, dependencies);

    expect(plan.admittedOrders).toHaveLength(1);
    expect(plan.excludedDocuments).toHaveLength(0);
    expect(requireDefined(plan.admittedOrders[0]).target.workshopId).toBe(1);
  });

  it("should not allow inventory_used evidence from one detail to narrow another detail's candidates (per-detail scoping)", () => {
    // Under formal-row-first: detail 301 resolves via inventory evidence to pick line 7005.
    // Detail 302 has no scoped evidence → multiple candidates → admitted with null source.
    // Both details are admitted; detail 302 produces a pending relation.
    const snapshot: LegacyWorkshopReturnSnapshot = {
      orders: [
        {
          legacyTable: "saifute_return_order",
          legacyId: 30,
          returnNo: "TR-2026-001",
          returnDate: "2026-01-15 00:00:00",
          workshopLegacyId: 10,
          sourceType: null,
          sourceId: null,
          returnBy: "李工",
          chargeBy: null,
          totalAmount: "4.00",
          remark: null,
          delFlag: 0,
          voidDescription: null,
          createdBy: "admin",
          createdAt: "2026-01-15 08:00:00",
          updatedBy: "admin",
          updatedAt: "2026-01-15 08:00:00",
        },
      ],
      details: [
        {
          legacyTable: "saifute_return_detail",
          legacyId: 301,
          parentLegacyTable: "saifute_return_order",
          parentLegacyId: 30,
          materialLegacyId: 102,
          returnQty: "2.000000",
          unitPrice: "2.00",
          remark: null,
        },
        {
          legacyTable: "saifute_return_detail",
          legacyId: 302,
          parentLegacyTable: "saifute_return_order",
          parentLegacyId: 30,
          materialLegacyId: 102,
          returnQty: "2.000000",
          unitPrice: "2.00",
          remark: null,
        },
      ],
      audits: [],
      inventoryUsedByReturnOrderId: new Map([
        [
          30,
          [
            {
              // Explicitly tied to detail 301 only — must NOT be used for detail 302
              usedId: 9002,
              materialId: 102,
              beforeOrderType: 4,
              beforeOrderId: 502,
              beforeDetailId: null,
              afterOrderType: 5,
              afterOrderId: 30,
              afterDetailId: 301,
            },
          ],
        ],
      ]),
    };

    const plan = buildWorkshopReturnMigrationPlan(
      snapshot,
      buildDependencies(),
    );

    // Under formal-row-first: both details are admitted.
    // Detail 301 → resolves to pick 8002 (via inventory evidence) → non-null source.
    // Detail 302 → multi-candidate, no scoped evidence → null source → pending relation.
    expect(plan.admittedOrders).toHaveLength(1);
    expect(plan.excludedDocuments).toHaveLength(0);
    expect(plan.pendingRelations).toHaveLength(1);
    expect(plan.pendingRelations[0]?.pendingReason).toBe(
      "multiple-upstream-pick-line-candidates",
    );

    const order = requireDefined(plan.admittedOrders[0]);
    expect(order.lines).toHaveLength(2);

    const line301 = order.lines.find((l) => l.legacyId === 301);
    const line302 = order.lines.find((l) => l.legacyId === 302);

    expect(requireDefined(line301).target.sourceDocumentType).toBe(
      "WorkshopMaterialOrder",
    );
    expect(requireDefined(line301).target.sourceDocumentId).toBe(8002);

    expect(requireDefined(line302).target.sourceDocumentType).toBeNull();
    expect(requireDefined(line302).target.sourceDocumentId).toBeNull();

    expect(plan.counts.admittedLinesWithNullSource).toBe(1);
  });

  it("should keep canonical documentNo for EFFECTIVE order when VOIDED shares same return_no (active-first rule)", () => {
    const snapshot: LegacyWorkshopReturnSnapshot = {
      orders: [
        {
          legacyTable: "saifute_return_order",
          legacyId: 29,
          returnNo: "TR-2026-DUP",
          returnDate: "2026-01-10 00:00:00",
          workshopLegacyId: 10,
          sourceType: null,
          sourceId: null,
          returnBy: null,
          chargeBy: null,
          totalAmount: "15.00",
          remark: null,
          delFlag: 2,
          voidDescription: "已作废",
          createdBy: "admin",
          createdAt: "2026-01-10 08:00:00",
          updatedBy: "admin",
          updatedAt: "2026-01-10 09:00:00",
        },
        {
          legacyTable: "saifute_return_order",
          legacyId: 30,
          returnNo: "TR-2026-DUP",
          returnDate: "2026-01-15 00:00:00",
          workshopLegacyId: 10,
          sourceType: null,
          sourceId: null,
          returnBy: "李工",
          chargeBy: null,
          totalAmount: "15.00",
          remark: null,
          delFlag: 0,
          voidDescription: null,
          createdBy: "admin",
          createdAt: "2026-01-15 08:00:00",
          updatedBy: "admin",
          updatedAt: "2026-01-15 08:00:00",
        },
      ],
      details: [
        {
          legacyTable: "saifute_return_detail",
          legacyId: 291,
          parentLegacyTable: "saifute_return_order",
          parentLegacyId: 29,
          materialLegacyId: 101,
          returnQty: "3.000000",
          unitPrice: "5.00",
          remark: null,
        },
        {
          legacyTable: "saifute_return_detail",
          legacyId: 301,
          parentLegacyTable: "saifute_return_order",
          parentLegacyId: 30,
          materialLegacyId: 101,
          returnQty: "3.000000",
          unitPrice: "5.00",
          remark: null,
        },
      ],
      audits: [],
      inventoryUsedByReturnOrderId: new Map(),
    };

    const plan = buildWorkshopReturnMigrationPlan(
      snapshot,
      buildDependencies(),
    );

    expect(plan.globalBlockers).toHaveLength(0);
    expect(plan.admittedOrders).toHaveLength(2);

    const effectiveOrder = plan.admittedOrders.find((o) => o.legacyId === 30);
    const voidedOrder = plan.admittedOrders.find((o) => o.legacyId === 29);

    // EFFECTIVE order must keep the canonical documentNo without a suffix
    expect(effectiveOrder?.target.documentNo).toBe("TR-2026-DUP");
    expect(effectiveOrder?.target.lifecycleStatus).toBe("EFFECTIVE");

    // VOIDED order must receive the -LEGACY-<legacyId> rewrite
    expect(voidedOrder?.target.documentNo).toContain("LEGACY-29");
    expect(voidedOrder?.target.lifecycleStatus).toBe("VOIDED");

    // Exactly one rewrite is recorded (for the VOIDED order)
    expect(plan.documentNoRewrites).toHaveLength(1);
    expect(plan.documentNoRewrites[0]?.originalDocumentNo).toBe("TR-2026-DUP");
  });

  it("should exclude the whole header when one detail line is structurally invalid", () => {
    // Structural invalidity remains a whole-header exclusion even under formal-row-first.
    const snapshot: LegacyWorkshopReturnSnapshot = {
      orders: [
        {
          legacyTable: "saifute_return_order",
          legacyId: 30,
          returnNo: "TR-MIXED",
          returnDate: "2026-01-15 00:00:00",
          workshopLegacyId: 10,
          sourceType: null,
          sourceId: null,
          returnBy: "李工",
          chargeBy: null,
          totalAmount: "20.00",
          remark: null,
          delFlag: 0,
          voidDescription: null,
          createdBy: "admin",
          createdAt: "2026-01-15 08:00:00",
          updatedBy: "admin",
          updatedAt: "2026-01-15 08:00:00",
        },
      ],
      details: [
        {
          legacyTable: "saifute_return_detail",
          legacyId: 301,
          parentLegacyTable: "saifute_return_order",
          parentLegacyId: 30,
          materialLegacyId: 101,
          returnQty: "3.000000",
          unitPrice: "5.00",
          remark: null,
        },
        {
          legacyTable: "saifute_return_detail",
          legacyId: 302,
          parentLegacyTable: "saifute_return_order",
          parentLegacyId: 30,
          materialLegacyId: 999, // blocked material -> structural invalid
          returnQty: "2.000000",
          unitPrice: "5.00",
          remark: null,
        },
      ],
      audits: [],
      inventoryUsedByReturnOrderId: new Map(),
    };

    const plan = buildWorkshopReturnMigrationPlan(
      snapshot,
      buildDependencies(),
    );

    expect(plan.admittedOrders).toHaveLength(0);
    expect(plan.excludedDocuments).toHaveLength(1);
    expect(plan.pendingRelations).toHaveLength(0);
    expect(plan.excludedDocuments[0]?.exclusionReason).toContain(
      "whole-header exclusion",
    );
  });
});
