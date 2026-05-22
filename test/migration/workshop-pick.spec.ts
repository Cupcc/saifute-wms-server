import { buildWorkshopPickMigrationPlan } from "../../scripts/migration/workshop-pick/transformer";
import type {
  LegacyPickSnapshot,
  WorkshopPickDependencySnapshot,
} from "../../scripts/migration/workshop-pick/types";

function buildLegacyKey(legacyTable: string, legacyId: number): string {
  return `${legacyTable}::${legacyId}`;
}

function buildDependencies(): WorkshopPickDependencySnapshot {
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
    workshopByLegacyKey: new Map([
      [
        buildLegacyKey("saifute_workshop", 8),
        {
          targetId: 8008,
          workshopCode: "WS-LEGACY-8",
          workshopName: "焊接车间",
        },
      ],
      [
        buildLegacyKey("saifute_workshop", 10),
        {
          targetId: 8010,
          workshopCode: "WS-LEGACY-10",
          workshopName: "装配车间",
        },
      ],
    ]),
    defaultWorkshop: {
      targetId: 7000,
      workshopCode: "WS-LEGACY-DEFAULT",
      workshopName: "默认车间",
    },
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
  };
}

function buildSnapshot(): LegacyPickSnapshot {
  return {
    orders: [
      {
        legacyTable: "saifute_pick_order",
        legacyId: 10,
        legacyAuditDocumentType: 3,
        sourceDocumentNo: "LL001",
        projectId: "PRJ-A",
        bizDate: "2026-01-02 00:00:00",
        totalAmount: "188.50",
        picker: "王工",
        workshopLegacyId: 8,
        chargeBy: "班组长甲",
        remark: "首批领料",
        delFlag: 0,
        voidReason: null,
        createdBy: "admin",
        createdAt: "2026-01-02 08:00:00",
        updatedBy: "admin",
        updatedAt: "2026-01-02 09:00:00",
      },
      {
        legacyTable: "saifute_pick_order",
        legacyId: 11,
        legacyAuditDocumentType: 3,
        sourceDocumentNo: "LL001",
        projectId: null,
        bizDate: "2026-01-03",
        totalAmount: "20.00",
        picker: "张三",
        workshopLegacyId: 8,
        chargeBy: "班组长乙",
        remark: "作废重开",
        delFlag: 2,
        voidReason: "重开",
        createdBy: "admin",
        createdAt: "2026-01-03 08:00:00",
        updatedBy: "checker",
        updatedAt: "2026-01-03 10:00:00",
      },
      {
        legacyTable: "saifute_pick_order",
        legacyId: 12,
        legacyAuditDocumentType: 3,
        sourceDocumentNo: "LL002",
        projectId: null,
        bizDate: "2026-01-04",
        totalAmount: null,
        picker: "李四",
        workshopLegacyId: null,
        chargeBy: null,
        remark: null,
        delFlag: 0,
        voidReason: null,
        createdBy: "builder",
        createdAt: "2026-01-04 08:30:00",
        updatedBy: null,
        updatedAt: null,
      },
      {
        legacyTable: "saifute_pick_order",
        legacyId: 13,
        legacyAuditDocumentType: 3,
        sourceDocumentNo: "LL-MISSING-WS",
        projectId: null,
        bizDate: "2026-01-05",
        totalAmount: "3.00",
        picker: null,
        workshopLegacyId: 999,
        chargeBy: null,
        remark: null,
        delFlag: 0,
        voidReason: null,
        createdBy: "ops",
        createdAt: "2026-01-05 08:00:00",
        updatedBy: null,
        updatedAt: null,
      },
      {
        legacyTable: "saifute_pick_order",
        legacyId: 14,
        legacyAuditDocumentType: 3,
        sourceDocumentNo: "LL-BLOCKED-MAT",
        projectId: null,
        bizDate: "2026-01-06",
        totalAmount: "3.00",
        picker: null,
        workshopLegacyId: 10,
        chargeBy: null,
        remark: null,
        delFlag: 0,
        voidReason: null,
        createdBy: "ops",
        createdAt: "2026-01-06 08:00:00",
        updatedBy: null,
        updatedAt: null,
      },
      {
        legacyTable: "saifute_pick_order",
        legacyId: 15,
        legacyAuditDocumentType: 3,
        sourceDocumentNo: "LL-PRICE",
        projectId: null,
        bizDate: "2026-01-07",
        totalAmount: "10.00",
        picker: null,
        workshopLegacyId: 10,
        chargeBy: null,
        remark: null,
        delFlag: 0,
        voidReason: null,
        createdBy: "ops",
        createdAt: "2026-01-07 08:00:00",
        updatedBy: null,
        updatedAt: null,
      },
    ],
    lines: [
      {
        legacyTable: "saifute_pick_detail",
        legacyId: 1002,
        parentLegacyTable: "saifute_pick_order",
        parentLegacyId: 10,
        materialLegacyId: 702,
        quantity: "5",
        priceEvidence: "88.50",
        instruction: null,
        remark: "辅料",
      },
      {
        legacyTable: "saifute_pick_detail",
        legacyId: 1001,
        parentLegacyTable: "saifute_pick_order",
        parentLegacyId: 10,
        materialLegacyId: 701,
        quantity: "4",
        priceEvidence: "100.0000",
        instruction: "主料",
        remark: "主料备注",
      },
      {
        legacyTable: "saifute_pick_detail",
        legacyId: 1003,
        parentLegacyTable: "saifute_pick_order",
        parentLegacyId: 11,
        materialLegacyId: 703,
        quantity: "2",
        priceEvidence: "20.00",
        instruction: "整机",
        remark: null,
      },
      {
        legacyTable: "saifute_pick_detail",
        legacyId: 1004,
        parentLegacyTable: "saifute_pick_order",
        parentLegacyId: 12,
        materialLegacyId: 701,
        quantity: "1",
        priceEvidence: "5.00",
        instruction: null,
        remark: null,
      },
      {
        legacyTable: "saifute_pick_detail",
        legacyId: 1005,
        parentLegacyTable: "saifute_pick_order",
        parentLegacyId: 13,
        materialLegacyId: 701,
        quantity: "1",
        priceEvidence: "3.00",
        instruction: null,
        remark: null,
      },
      {
        legacyTable: "saifute_pick_detail",
        legacyId: 1006,
        parentLegacyTable: "saifute_pick_order",
        parentLegacyId: 14,
        materialLegacyId: 999,
        quantity: "1",
        priceEvidence: "3.00",
        instruction: null,
        remark: null,
      },
      {
        legacyTable: "saifute_pick_detail",
        legacyId: 1007,
        parentLegacyTable: "saifute_pick_order",
        parentLegacyId: 15,
        materialLegacyId: 701,
        quantity: "3",
        priceEvidence: "10.000",
        instruction: "价格歧义",
        remark: null,
      },
    ],
    audits: [
      {
        legacyId: 9001,
        documentType: 3,
        documentId: 10,
        auditStatus: "1",
        auditor: "审核员甲",
        auditTime: "2026-01-02 10:00:00",
        auditOpinion: "通过",
      },
      {
        legacyId: 9002,
        documentType: 3,
        documentId: 11,
        auditStatus: "2",
        auditor: "审核员乙",
        auditTime: "2026-01-03 09:00:00",
        auditOpinion: "驳回",
      },
    ],
  };
}

describe("workshop-pick migration transformer", () => {
  it("should build deterministic pick-only plans with document rewrites, workshop fallback, archived payloads, and whole-document exclusions", () => {
    const plan = buildWorkshopPickMigrationPlan(
      buildSnapshot(),
      buildDependencies(),
    );

    expect(plan.migrationBatch).toBe("batch3b-workshop-pick-base");
    expect(plan.globalBlockers).toHaveLength(0);
    expect(plan.counts.orders).toEqual({
      source: 6,
      migrated: 3,
      excluded: 3,
    });
    expect(plan.counts.lines).toEqual({
      source: 7,
      migrated: 4,
      excluded: 3,
    });
    expect(plan.context.nullWorkshopFallbackCount).toBe(1);
    expect(plan.context.priceDerivationFailureCount).toBe(1);

    const primaryOrder = plan.migratedOrders.find(
      (record) => record.legacyId === 10,
    );
    expect(primaryOrder?.target.documentNo).toBe("LL001");
    expect(primaryOrder?.target.orderType).toBe("PICK");
    expect(primaryOrder?.target.bizDate).toBe("2026-01-02");
    expect(primaryOrder?.target.handlerPersonnelId).toBe(610);
    expect(primaryOrder?.target.handlerNameSnapshot).toBe("王工");
    expect(primaryOrder?.target.workshopId).toBe(8008);
    expect(primaryOrder?.target.workshopNameSnapshot).toBe("焊接车间");
    expect(primaryOrder?.target.auditStatusSnapshot).toBe("APPROVED");
    expect(primaryOrder?.target.inventoryEffectStatus).toBe("POSTED");
    expect(primaryOrder?.target.totalQty).toBe("9.000000");
    expect(primaryOrder?.target.totalAmount).toBe("188.50");
    expect(
      primaryOrder?.lines.map((line) => [line.legacyId, line.target.lineNo]),
    ).toEqual([
      [1001, 1],
      [1002, 2],
    ]);
    expect(primaryOrder?.lines[0]?.target.sourceDocumentType).toBeNull();
    expect(primaryOrder?.lines[0]?.target.sourceDocumentId).toBeNull();
    expect(primaryOrder?.lines[0]?.target.sourceDocumentLineId).toBeNull();
    expect(primaryOrder?.lines[0]?.target.amount).toBe("100.00");
    expect(primaryOrder?.lines[0]?.target.unitPrice).toBe("25.00");
    expect(primaryOrder?.lines[1]?.target.amount).toBe("88.50");
    expect(primaryOrder?.lines[1]?.target.unitPrice).toBe("17.70");
    expect(primaryOrder?.archivedPayload.payload).toEqual({
      chargeBy: "班组长甲",
      legacyAudit: {
        auditOpinion: "通过",
        auditStatus: "1",
        auditTime: "2026-01-02 10:00:00",
        auditor: "审核员甲",
      },
      originalDocumentNo: null,
      picker: "王工",
      projectId: "PRJ-A",
      workshopLegacyId: 8,
    });
    expect(primaryOrder?.lines[0]?.archivedPayload.payload).toEqual({
      derivedAmount: "100.00",
      derivedUnitPrice: "25.00",
      instruction: "主料",
      rawPriceEvidence: "100.0000",
      rawQuantity: "4.000000",
    });

    const rewrittenOrder = plan.migratedOrders.find(
      (record) => record.legacyId === 11,
    );
    expect(rewrittenOrder?.target.documentNo).toBe("LL001-LEGACY-11");
    expect(rewrittenOrder?.target.lifecycleStatus).toBe("VOIDED");
    expect(rewrittenOrder?.target.auditStatusSnapshot).toBe("NOT_REQUIRED");
    expect(rewrittenOrder?.target.inventoryEffectStatus).toBe("REVERSED");
    expect(rewrittenOrder?.target.voidedBy).toBe("checker");
    expect(rewrittenOrder?.target.voidedAt).toBe("2026-01-03 10:00:00");
    expect(rewrittenOrder?.target.handlerPersonnelId).toBeNull();
    expect(rewrittenOrder?.target.handlerNameSnapshot).toBe("张三");
    expect(rewrittenOrder?.archivedPayload.payload).toEqual({
      chargeBy: "班组长乙",
      legacyAudit: {
        auditOpinion: "驳回",
        auditStatus: "2",
        auditTime: "2026-01-03 09:00:00",
        auditor: "审核员乙",
      },
      originalDocumentNo: "LL001",
      picker: "张三",
      projectId: null,
      workshopLegacyId: 8,
    });

    const fallbackOrder = plan.migratedOrders.find(
      (record) => record.legacyId === 12,
    );
    expect(fallbackOrder?.target.documentNo).toBe("LL002");
    expect(fallbackOrder?.target.auditStatusSnapshot).toBe("PENDING");
    expect(fallbackOrder?.target.handlerPersonnelId).toBeNull();
    expect(fallbackOrder?.target.handlerNameSnapshot).toBe("李四");
    expect(fallbackOrder?.target.workshopId).toBe(7000);
    expect(fallbackOrder?.target.workshopNameSnapshot).toBe("默认车间");
    expect(fallbackOrder?.target.totalAmount).toBe("5.00");
    expect(
      plan.warnings.some(
        (warning) =>
          warning.legacyId === 12 &&
          warning.reason.includes("personnel snapshot"),
      ),
    ).toBe(true);
    expect(
      plan.warnings.some(
        (warning) =>
          warning.legacyId === 11 &&
          warning.reason.includes("handlerNameSnapshot"),
      ),
    ).toBe(true);
    expect(
      plan.warnings.some(
        (warning) =>
          warning.legacyTable === "personnel" &&
          warning.reason.includes("ambiguous names"),
      ),
    ).toBe(true);

    expect(plan.documentNoRewrites).toEqual([
      {
        originalDocumentNo: "LL001",
        keptLegacyTable: "saifute_pick_order",
        keptLegacyId: 10,
        rewritten: [
          {
            legacyTable: "saifute_pick_order",
            legacyId: 11,
            rewrittenDocumentNo: "LL001-LEGACY-11",
          },
        ],
      },
    ]);

    expect(plan.excludedDocuments).toEqual([
      expect.objectContaining({
        legacyTable: "saifute_pick_order",
        legacyId: 13,
      }),
      expect.objectContaining({
        legacyTable: "saifute_pick_order",
        legacyId: 14,
      }),
      expect.objectContaining({
        legacyTable: "saifute_pick_order",
        legacyId: 15,
      }),
    ]);
    expect(plan.excludedDocuments[0]?.exclusionReason).toContain(
      "Workshop 999 is missing from the batch1 workshop map.",
    );
    expect(plan.excludedDocuments[1]?.exclusionReason).toContain(
      "references blocked batch1 material 999",
    );
    expect(plan.excludedDocuments[2]?.exclusionReason).toContain(
      "cannot derive a deterministic unit_price",
    );
    expect(plan.excludedDocuments[2]?.payload.lines).toEqual([
      expect.objectContaining({
        legacyId: 1007,
        priceEvidence: "10.000",
        quantity: "3.000000",
      }),
    ]);
  });

  it("should surface global blockers when the frozen default workshop, batch1 baseline, or legacy audit statuses drift", () => {
    const dependencies = buildDependencies();
    dependencies.defaultWorkshop = null;
    dependencies.batch1Baseline.issues = [
      "batch1 workshop map count mismatch: expected 13, received 12.",
    ];

    const snapshot = buildSnapshot();
    snapshot.audits.push({
      legacyId: 9003,
      documentType: 3,
      documentId: 12,
      auditStatus: "9",
      auditor: "异常审核员",
      auditTime: "2026-01-04 10:00:00",
      auditOpinion: null,
    });

    const plan = buildWorkshopPickMigrationPlan(snapshot, dependencies);

    expect(plan.globalBlockers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          reason:
            "batch1 workshop map count mismatch: expected 13, received 12.",
        }),
        expect.objectContaining({
          reason:
            "Frozen default workshop is missing from the migrated workshop staging map.",
        }),
        expect.objectContaining({
          reason:
            "Legacy saifute_audit_document contains unexpected audit_status values outside the frozen {0,1,2} set for pick documents.",
        }),
      ]),
    );
  });
});
