import { buildOutboundMigrationPlan } from "../../scripts/migration/customer/transformer";
import type {
  LegacyOutboundSnapshot,
  OutboundDependencySnapshot,
} from "../../scripts/migration/customer/types";

function buildLegacyKey(legacyTable: string, legacyId: number): string {
  return `${legacyTable}::${legacyId}`;
}

function buildDependencies(): OutboundDependencySnapshot {
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
    defaultWorkshop: {
      targetId: 7000,
      workshopCode: "WS-LEGACY-DEFAULT",
      workshopName: "历史默认车间",
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

function buildSnapshot(): LegacyOutboundSnapshot {
  return {
    orders: [
      {
        legacyTable: "saifute_outbound_order",
        legacyId: 10,
        legacyAuditDocumentType: 4,
        sourceDocumentNo: "CK001",
        customerLegacyId: 201,
        customerName: "旧华电集团",
        bizDate: "2026-01-02 00:00:00",
        chargeBy: "王工",
        bookkeeping: "会计甲",
        totalAmount: "88.50",
        remark: "首批出库",
        delFlag: 0,
        voidReason: null,
        createdBy: "admin",
        createdAt: "2026-01-02 08:00:00",
        updatedBy: "admin",
        updatedAt: "2026-01-02 09:00:00",
      },
      {
        legacyTable: "saifute_outbound_order",
        legacyId: 11,
        legacyAuditDocumentType: 4,
        sourceDocumentNo: "CK001",
        customerLegacyId: null,
        customerName: null,
        bizDate: "2026-01-03",
        chargeBy: "张三",
        bookkeeping: "会计乙",
        totalAmount: "20.00",
        remark: "作废单",
        delFlag: 2,
        voidReason: "重开",
        createdBy: "admin",
        createdAt: "2026-01-03 08:00:00",
        updatedBy: "checker",
        updatedAt: "2026-01-03 10:00:00",
      },
      {
        legacyTable: "saifute_outbound_order",
        legacyId: 12,
        legacyAuditDocumentType: 4,
        sourceDocumentNo: "CK002",
        customerLegacyId: 202,
        customerName: "未映射客户",
        bizDate: "2026-01-04",
        chargeBy: "李四",
        bookkeeping: "会计丙",
        totalAmount: null,
        remark: null,
        delFlag: 0,
        voidReason: null,
        createdBy: "ops",
        createdAt: "2026-01-04 08:30:00",
        updatedBy: null,
        updatedAt: null,
      },
      {
        legacyTable: "saifute_outbound_order",
        legacyId: 13,
        legacyAuditDocumentType: 4,
        sourceDocumentNo: "CK-BLOCKED",
        customerLegacyId: null,
        customerName: null,
        bizDate: "2026-01-05",
        chargeBy: null,
        bookkeeping: null,
        totalAmount: "3.00",
        remark: null,
        delFlag: 0,
        voidReason: null,
        createdBy: "ops",
        createdAt: "2026-01-05 08:00:00",
        updatedBy: null,
        updatedAt: null,
      },
      {
        legacyTable: "saifute_outbound_order",
        legacyId: 14,
        legacyAuditDocumentType: 4,
        sourceDocumentNo: "CK-MISSING-MAT",
        customerLegacyId: null,
        customerName: null,
        bizDate: "2026-01-06",
        chargeBy: null,
        bookkeeping: null,
        totalAmount: "1.00",
        remark: null,
        delFlag: 0,
        voidReason: null,
        createdBy: "ops",
        createdAt: "2026-01-06 08:00:00",
        updatedBy: null,
        updatedAt: null,
      },
    ],
    lines: [
      {
        legacyTable: "saifute_outbound_detail",
        legacyId: 1002,
        parentLegacyTable: "saifute_outbound_order",
        parentLegacyId: 10,
        materialLegacyId: 702,
        quantity: "5",
        unitPrice: null,
        interval: null,
        remark: "辅料",
      },
      {
        legacyTable: "saifute_outbound_detail",
        legacyId: 1001,
        parentLegacyTable: "saifute_outbound_order",
        parentLegacyId: 10,
        materialLegacyId: 701,
        quantity: "3.5",
        unitPrice: "10.00",
        interval: "A01-A03",
        remark: "主料",
      },
      {
        legacyTable: "saifute_outbound_detail",
        legacyId: 1003,
        parentLegacyTable: "saifute_outbound_order",
        parentLegacyId: 11,
        materialLegacyId: 703,
        quantity: "2",
        unitPrice: "10.00",
        interval: "B01-B02",
        remark: null,
      },
      {
        legacyTable: "saifute_outbound_detail",
        legacyId: 1004,
        parentLegacyTable: "saifute_outbound_order",
        parentLegacyId: 12,
        materialLegacyId: 701,
        quantity: "1",
        unitPrice: "5.00",
        interval: null,
        remark: null,
      },
      {
        legacyTable: "saifute_outbound_detail",
        legacyId: 1005,
        parentLegacyTable: "saifute_outbound_order",
        parentLegacyId: 13,
        materialLegacyId: 999,
        quantity: "1",
        unitPrice: "3.00",
        interval: null,
        remark: null,
      },
      {
        legacyTable: "saifute_outbound_detail",
        legacyId: 1006,
        parentLegacyTable: "saifute_outbound_order",
        parentLegacyId: 14,
        materialLegacyId: null,
        quantity: "1",
        unitPrice: "1.00",
        interval: null,
        remark: null,
      },
    ],
    audits: [
      {
        legacyId: 5001,
        documentType: 4,
        documentId: 10,
        auditStatus: "1",
        auditor: "审核员甲",
        auditTime: "2026-01-02 10:00:00",
        auditOpinion: "通过",
      },
      {
        legacyId: 5002,
        documentType: 4,
        documentId: 11,
        auditStatus: "2",
        auditor: "审核员乙",
        auditTime: "2026-01-03 09:00:00",
        auditOpinion: "驳回",
      },
    ],
  };
}

describe("outbound migration transformer", () => {
  it("should build deterministic outbound plans with document rewrites, warnings, archived payloads, and whole-document exclusions", () => {
    const plan = buildOutboundMigrationPlan(
      buildSnapshot(),
      buildDependencies(),
    );

    expect(plan.migrationBatch).toBe("batch2c-outbound-base");
    expect(plan.globalBlockers).toHaveLength(0);
    expect(plan.counts.orders).toEqual({
      source: 5,
      migrated: 3,
      excluded: 2,
    });
    expect(plan.counts.lines).toEqual({
      source: 6,
      migrated: 4,
      excluded: 2,
    });

    const primaryOrder = plan.migratedOrders.find(
      (record) => record.legacyId === 10,
    );
    expect(primaryOrder?.target.documentNo).toBe("CK001");
    expect(primaryOrder?.target.orderType).toBe("OUTBOUND");
    expect(primaryOrder?.target.bizDate).toBe("2026-01-02");
    expect(primaryOrder?.target.customerId).toBe(5201);
    expect(primaryOrder?.target.customerCodeSnapshot).toBe("CUS-201");
    expect(primaryOrder?.target.customerNameSnapshot).toBe("华电集团");
    expect(primaryOrder?.target.handlerPersonnelId).toBe(610);
    expect(primaryOrder?.target.handlerNameSnapshot).toBe("王工");
    expect(primaryOrder?.target.workshopId).toBe(7000);
    expect(primaryOrder?.target.auditStatusSnapshot).toBe("APPROVED");
    expect(primaryOrder?.target.inventoryEffectStatus).toBe("POSTED");
    expect(primaryOrder?.target.totalQty).toBe("8.500000");
    expect(primaryOrder?.target.totalAmount).toBe("88.50");
    expect(
      primaryOrder?.lines.map((line) => [line.legacyId, line.target.lineNo]),
    ).toEqual([
      [1001, 1],
      [1002, 2],
    ]);
    expect(primaryOrder?.lines[0]?.target.startNumber).toBeNull();
    expect(primaryOrder?.lines[0]?.target.endNumber).toBeNull();
    expect(primaryOrder?.lines[0]?.target.sourceDocumentType).toBeNull();
    expect(primaryOrder?.lines[0]?.target.amount).toBe("35.00");
    expect(primaryOrder?.lines[1]?.target.unitPrice).toBe("0.00");
    expect(primaryOrder?.lines[1]?.target.amount).toBe("0.00");
    expect(primaryOrder?.archivedPayload.payload).toEqual({
      bookkeeping: "会计甲",
      chargeBy: "王工",
      customerLegacyId: 201,
      legacyAudit: {
        auditOpinion: "通过",
        auditStatus: "1",
        auditTime: "2026-01-02 10:00:00",
        auditor: "审核员甲",
      },
      originalDocumentNo: "CK001",
    });
    expect(primaryOrder?.lines[0]?.archivedPayload?.payload).toEqual({
      interval: "A01-A03",
    });

    const rewrittenOrder = plan.migratedOrders.find(
      (record) => record.legacyId === 11,
    );
    expect(rewrittenOrder?.target.documentNo).toBe("CK001-LEGACY-11");
    expect(rewrittenOrder?.target.lifecycleStatus).toBe("VOIDED");
    expect(rewrittenOrder?.target.auditStatusSnapshot).toBe("NOT_REQUIRED");
    expect(rewrittenOrder?.target.inventoryEffectStatus).toBe("REVERSED");
    expect(rewrittenOrder?.target.voidedBy).toBe("checker");
    expect(rewrittenOrder?.target.voidedAt).toBe("2026-01-03 10:00:00");
    expect(rewrittenOrder?.target.handlerPersonnelId).toBeNull();
    expect(rewrittenOrder?.target.handlerNameSnapshot).toBe("张三");

    const fallbackOrder = plan.migratedOrders.find(
      (record) => record.legacyId === 12,
    );
    expect(fallbackOrder?.target.documentNo).toBe("CK002");
    expect(fallbackOrder?.target.auditStatusSnapshot).toBe("PENDING");
    expect(fallbackOrder?.target.customerId).toBeNull();
    expect(fallbackOrder?.target.customerNameSnapshot).toBe("未映射客户");
    expect(fallbackOrder?.target.handlerPersonnelId).toBeNull();
    expect(fallbackOrder?.target.handlerNameSnapshot).toBe("李四");
    expect(
      plan.warnings.some(
        (warning) =>
          warning.legacyId === 12 && warning.reason.includes("customer map"),
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
        originalDocumentNo: "CK001",
        keptLegacyTable: "saifute_outbound_order",
        keptLegacyId: 10,
        rewritten: [
          {
            legacyTable: "saifute_outbound_order",
            legacyId: 11,
            rewrittenDocumentNo: "CK001-LEGACY-11",
          },
        ],
      },
    ]);

    expect(plan.excludedDocuments).toEqual([
      expect.objectContaining({
        legacyTable: "saifute_outbound_order",
        legacyId: 13,
      }),
      expect.objectContaining({
        legacyTable: "saifute_outbound_order",
        legacyId: 14,
      }),
    ]);
    expect(plan.excludedDocuments[0]?.exclusionReason).toContain(
      "references blocked batch1 material 999",
    );
    expect(plan.excludedDocuments[1]?.exclusionReason).toContain(
      "is missing material_id",
    );
  });

  it("should surface global blockers when the frozen default workshop or batch1 baseline is unavailable", () => {
    const dependencies = buildDependencies();
    dependencies.defaultWorkshop = null;
    dependencies.batch1Baseline.issues = [
      "batch1 workshop map count mismatch: expected 13, received 12.",
    ];

    const plan = buildOutboundMigrationPlan(buildSnapshot(), dependencies);

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
      ]),
    );
  });
});
