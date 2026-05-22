import { buildStockInMigrationPlan } from "../../scripts/migration/stock-in/transformer";
import type {
  LegacyStockInSnapshot,
  StockInDependencySnapshot,
} from "../../scripts/migration/stock-in/types";

function buildLegacyKey(legacyTable: string, legacyId: number): string {
  return `${legacyTable}::${legacyId}`;
}

function buildDependencies(): StockInDependencySnapshot {
  return {
    materialByLegacyKey: new Map([
      [
        buildLegacyKey("saifute_material", 501),
        {
          targetId: 1501,
          materialCode: "MAT-501",
          materialName: "壳体",
          specModel: "S-501",
          unitCode: "件",
        },
      ],
      [
        buildLegacyKey("saifute_material", 502),
        {
          targetId: 1502,
          materialCode: "MAT-502",
          materialName: "滤芯",
          specModel: null,
          unitCode: "套",
        },
      ],
      [
        buildLegacyKey("saifute_material", 503),
        {
          targetId: 1503,
          materialCode: "MAT-503",
          materialName: "成品",
          specModel: "P-503",
          unitCode: "台",
        },
      ],
    ]),
    workshopByLegacyKey: new Map([
      [
        buildLegacyKey("saifute_workshop", 6),
        {
          targetId: 2606,
          workshopCode: "WS-LEGACY-6",
          workshopName: "总装车间",
        },
      ],
    ]),
    supplierByLegacyKey: new Map([
      [
        buildLegacyKey("saifute_supplier", 20),
        {
          targetId: 320,
          supplierCode: "SUP-20",
          supplierName: "华北供应商",
        },
      ],
    ]),
    defaultWorkshop: {
      targetId: 2000,
      workshopCode: "WS-LEGACY-DEFAULT",
      workshopName: "默认车间",
    },
    personnelByNormalizedName: new Map([
      [
        "王工",
        {
          targetId: 410,
          personnelCode: "PERS-410",
          personnelName: "王工",
        },
      ],
      [
        "陈苗苗",
        {
          targetId: 411,
          personnelCode: "PERS-411",
          personnelName: "陈苗苗",
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

function buildSnapshot(): LegacyStockInSnapshot {
  return {
    orders: [
      {
        legacyTable: "saifute_inbound_order",
        legacyId: 10,
        legacyAuditDocumentType: 1,
        sourceDocumentNo: "YS001",
        sourceOrderTypeValue: null,
        bizDate: "2026-01-02 00:00:00",
        totalAmount: "35.00",
        supplierLegacyId: 20,
        workshopLegacyId: null,
        chargeBy: "赵主任",
        handlerName: "王工",
        remark: "首单",
        delFlag: 0,
        voidReason: null,
        createdBy: "admin",
        createdAt: "2026-01-02 08:00:00",
        updatedBy: "admin",
        updatedAt: "2026-01-02 09:00:00",
      },
      {
        legacyTable: "saifute_inbound_order",
        legacyId: 11,
        legacyAuditDocumentType: 1,
        sourceDocumentNo: "YS001",
        sourceOrderTypeValue: null,
        bizDate: "2026-01-03 00:00:00",
        totalAmount: "-5.00",
        supplierLegacyId: 20,
        workshopLegacyId: 6,
        chargeBy: "赵主任",
        handlerName: "王工",
        remark: "重开前作废",
        delFlag: 2,
        voidReason: "录错数量",
        createdBy: "admin",
        createdAt: "2026-01-03 08:00:00",
        updatedBy: "checker",
        updatedAt: "2026-01-03 10:00:00",
      },
      {
        legacyTable: "saifute_into_order",
        legacyId: 12,
        legacyAuditDocumentType: 2,
        sourceDocumentNo: "RK001",
        sourceOrderTypeValue: null,
        bizDate: "2026-01-04 00:00:00",
        totalAmount: "132.00",
        supplierLegacyId: null,
        workshopLegacyId: 6,
        chargeBy: "黄主任",
        handlerName: "陈苗苗",
        remark: "生产入库",
        delFlag: 0,
        voidReason: null,
        createdBy: "prod",
        createdAt: "2026-01-04 08:00:00",
        updatedBy: null,
        updatedAt: null,
      },
      {
        legacyTable: "saifute_inbound_order",
        legacyId: 13,
        legacyAuditDocumentType: 1,
        sourceDocumentNo: "YS-BLOCKED",
        sourceOrderTypeValue: null,
        bizDate: "2026-01-05 00:00:00",
        totalAmount: "10.00",
        supplierLegacyId: 20,
        workshopLegacyId: 6,
        chargeBy: "赵主任",
        handlerName: "王工",
        remark: null,
        delFlag: 0,
        voidReason: null,
        createdBy: "admin",
        createdAt: "2026-01-05 08:00:00",
        updatedBy: null,
        updatedAt: null,
      },
      {
        legacyTable: "saifute_into_order",
        legacyId: 14,
        legacyAuditDocumentType: 2,
        sourceDocumentNo: "RK-AMB",
        sourceOrderTypeValue: null,
        bizDate: "2026-01-06 00:00:00",
        totalAmount: "12.00",
        supplierLegacyId: null,
        workshopLegacyId: 6,
        chargeBy: "黄主任",
        handlerName: "张三",
        remark: null,
        delFlag: 0,
        voidReason: null,
        createdBy: "prod",
        createdAt: "2026-01-06 08:00:00",
        updatedBy: null,
        updatedAt: null,
      },
    ],
    lines: [
      {
        legacyTable: "saifute_inbound_detail",
        legacyId: 101,
        parentLegacyTable: "saifute_inbound_order",
        parentLegacyId: 10,
        materialLegacyId: 501,
        quantity: "2.50",
        unitPrice: "10.00",
        taxPrice: "11.00",
        interval: null,
        remark: "主料",
      },
      {
        legacyTable: "saifute_inbound_detail",
        legacyId: 99,
        parentLegacyTable: "saifute_inbound_order",
        parentLegacyId: 10,
        materialLegacyId: 502,
        quantity: "1.00",
        unitPrice: null,
        taxPrice: null,
        interval: null,
        remark: "辅料",
      },
      {
        legacyTable: "saifute_inbound_detail",
        legacyId: 111,
        parentLegacyTable: "saifute_inbound_order",
        parentLegacyId: 11,
        materialLegacyId: 501,
        quantity: "-0.50",
        unitPrice: "10.00",
        taxPrice: null,
        interval: null,
        remark: "作废冲销",
      },
      {
        legacyTable: "saifute_into_detail",
        legacyId: 201,
        parentLegacyTable: "saifute_into_order",
        parentLegacyId: 12,
        materialLegacyId: 503,
        quantity: "1.00",
        unitPrice: "132.00",
        taxPrice: null,
        interval: "26010001-26010001",
        remark: "整机",
      },
      {
        legacyTable: "saifute_inbound_detail",
        legacyId: 301,
        parentLegacyTable: "saifute_inbound_order",
        parentLegacyId: 13,
        materialLegacyId: 999,
        quantity: "1.00",
        unitPrice: "10.00",
        taxPrice: null,
        interval: null,
        remark: null,
      },
      {
        legacyTable: "saifute_into_detail",
        legacyId: 401,
        parentLegacyTable: "saifute_into_order",
        parentLegacyId: 14,
        materialLegacyId: 503,
        quantity: "1.00",
        unitPrice: "12.00",
        taxPrice: null,
        interval: null,
        remark: null,
      },
    ],
    audits: [
      {
        legacyId: 1,
        documentType: 1,
        documentId: 10,
        auditStatus: "1",
        auditor: "审核员A",
        auditTime: "2026-01-02 10:00:00",
        auditOpinion: "通过",
      },
      {
        legacyId: 2,
        documentType: 1,
        documentId: 11,
        auditStatus: "2",
        auditor: "审核员B",
        auditTime: "2026-01-03 10:05:00",
        auditOpinion: "驳回",
      },
    ],
  };
}

describe("stock-in migration transformer", () => {
  it("should build deterministic stock-in plan with rewrites, fallback workshop, archived payloads, and exclusions", () => {
    const plan = buildStockInMigrationPlan(
      buildSnapshot(),
      buildDependencies(),
    );

    expect(plan.migrationBatch).toBe("batch2a-stock-in");
    expect(plan.globalBlockers).toHaveLength(0);
    expect(plan.counts.orders).toEqual({
      source: 5,
      migrated: 4,
      excluded: 1,
    });
    expect(plan.counts.lines).toEqual({
      source: 6,
      migrated: 5,
      excluded: 1,
    });

    expect(plan.documentNoRewrites).toEqual([
      {
        originalDocumentNo: "YS001",
        keptLegacyTable: "saifute_inbound_order",
        keptLegacyId: 10,
        rewritten: [
          {
            legacyTable: "saifute_inbound_order",
            legacyId: 11,
            rewrittenDocumentNo: "YS001-LEGACY-11",
          },
        ],
      },
    ]);

    const inboundOrder = plan.migratedOrders.find(
      (record) =>
        record.legacyTable === "saifute_inbound_order" &&
        record.legacyId === 10,
    );
    expect(inboundOrder?.target.documentNo).toBe("YS001");
    expect(inboundOrder?.target.orderType).toBe("ACCEPTANCE");
    expect(inboundOrder?.target.workshopId).toBe(2000);
    expect(inboundOrder?.target.workshopNameSnapshot).toBe("默认车间");
    expect(inboundOrder?.target.supplierId).toBe(320);
    expect(inboundOrder?.target.handlerPersonnelId).toBe(410);
    expect(inboundOrder?.target.auditStatusSnapshot).toBe("APPROVED");
    expect(inboundOrder?.target.totalQty).toBe("3.500000");
    expect(inboundOrder?.target.totalAmount).toBe("35.00");
    expect(
      inboundOrder?.lines.map((line) => [line.legacyId, line.target.lineNo]),
    ).toEqual([
      [99, 1],
      [101, 2],
    ]);
    expect(inboundOrder?.lines[1]?.archivedPayload?.payload).toEqual({
      interval: null,
      taxPrice: "11.00",
    });
    expect(inboundOrder?.archivedPayload.payload).toEqual({
      chargeBy: "赵主任",
      legacyAudit: {
        auditOpinion: "通过",
        auditStatus: "1",
        auditTime: "2026-01-02 10:00:00",
        auditor: "审核员A",
      },
      originalDocumentNo: "YS001",
      sourceOrderTypeFieldName: "inbound_type",
      sourceOrderTypeFieldValue: null,
    });

    const voidedDuplicate = plan.migratedOrders.find(
      (record) =>
        record.legacyTable === "saifute_inbound_order" &&
        record.legacyId === 11,
    );
    expect(voidedDuplicate?.target.documentNo).toBe("YS001-LEGACY-11");
    expect(voidedDuplicate?.target.lifecycleStatus).toBe("VOIDED");
    expect(voidedDuplicate?.target.auditStatusSnapshot).toBe("NOT_REQUIRED");
    expect(voidedDuplicate?.target.inventoryEffectStatus).toBe("REVERSED");
    expect(voidedDuplicate?.target.voidedBy).toBe("checker");
    expect(voidedDuplicate?.target.voidedAt).toBe("2026-01-03 10:00:00");

    const intoOrder = plan.migratedOrders.find(
      (record) =>
        record.legacyTable === "saifute_into_order" && record.legacyId === 12,
    );
    expect(intoOrder?.target.documentNo).toBe("RK001");
    expect(intoOrder?.target.orderType).toBe("PRODUCTION_RECEIPT");
    expect(intoOrder?.target.supplierId).toBeNull();
    expect(intoOrder?.target.auditStatusSnapshot).toBe("PENDING");
    expect(intoOrder?.lines[0]?.archivedPayload?.payload).toEqual({
      interval: "26010001-26010001",
      taxPrice: null,
    });

    const ambiguousIntoOrder = plan.migratedOrders.find(
      (record) =>
        record.legacyTable === "saifute_into_order" && record.legacyId === 14,
    );
    expect(ambiguousIntoOrder?.target.handlerPersonnelId).toBeNull();
    expect(ambiguousIntoOrder?.target.handlerNameSnapshot).toBe("张三");

    expect(plan.excludedDocuments).toEqual([
      expect.objectContaining({
        legacyTable: "saifute_inbound_order",
        legacyId: 13,
      }),
    ]);
    expect(plan.excludedDocuments[0]?.exclusionReason).toContain(
      "references blocked batch1 material 999",
    );
    expect(
      plan.warnings.some(
        (warning) =>
          warning.legacyTable === "saifute_into_order" &&
          warning.legacyId === 14 &&
          warning.reason.includes("preserving handlerNameSnapshot"),
      ),
    );
  });

  it("should surface global blockers when the frozen default workshop or batch1 baseline is not available", () => {
    const dependencies = buildDependencies();
    dependencies.defaultWorkshop = null;
    dependencies.batch1Baseline.issues = [
      "batch1 workshop map count mismatch: expected 13, received 12.",
    ];

    const plan = buildStockInMigrationPlan(buildSnapshot(), dependencies);

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
