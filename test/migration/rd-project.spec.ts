import { buildCutoverReadiness } from "../../scripts/migration/rd-project/cutover-readiness";
import { buildRdProjectMigrationPlan } from "../../scripts/migration/rd-project/transformer";
import type {
  LegacyRdProjectSnapshot,
  RdProjectDependencySnapshot,
} from "../../scripts/migration/rd-project/types";

function buildLegacyKey(legacyTable: string, legacyId: number): string {
  return `${legacyTable}::${legacyId}`;
}

function buildDependencies(): RdProjectDependencySnapshot {
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
    autoCreatedMaterialByNormalizedKey: new Map(),
    autoCreatedMaterialConflicts: [],
    existingMaterialCodes: new Set(["MAT-701", "MAT-702", "MAT-703"]),
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

function buildSnapshot(): LegacyRdProjectSnapshot {
  return {
    projects: [
      {
        legacyTable: "saifute_composite_product",
        legacyId: 10,
        projectName: "白龙山硐室",
        customerLegacyId: 201,
        customerName: "旧华电集团",
        classification: "硐室",
        salesman: "王工",
        totalAmount: "88.50",
        orderDate: "2026-01-02",
        outBoundDate: "2026-01-09",
        remark: "首批项目",
        delFlag: 0,
        createdBy: "admin",
        createdAt: "2026-01-02 08:00:00",
        updatedBy: "admin",
        updatedAt: "2026-01-02 09:00:00",
      },
      {
        legacyTable: "saifute_composite_product",
        legacyId: 11,
        projectName: "雨汪硐室",
        customerLegacyId: null,
        customerName: null,
        classification: "硐室",
        salesman: "张三",
        totalAmount: "20.00",
        orderDate: null,
        outBoundDate: "2026-01-12",
        remark: "已作废",
        delFlag: 2,
        createdBy: "admin",
        createdAt: "2026-01-11 08:00:00",
        updatedBy: "checker",
        updatedAt: "2026-01-12 11:00:00",
      },
      {
        legacyTable: "saifute_composite_product",
        legacyId: 12,
        projectName: "旋转支护",
        customerLegacyId: 202,
        customerName: "未映射客户",
        classification: "支护",
        salesman: "李四",
        totalAmount: null,
        orderDate: null,
        outBoundDate: null,
        remark: null,
        delFlag: 0,
        createdBy: "builder",
        createdAt: "2026-01-15 08:30:00",
        updatedBy: null,
        updatedAt: null,
      },
      {
        legacyTable: "saifute_composite_product",
        legacyId: 13,
        projectName: "阻断项目",
        customerLegacyId: null,
        customerName: null,
        classification: null,
        salesman: null,
        totalAmount: "3.00",
        orderDate: "2026-01-16",
        outBoundDate: null,
        remark: null,
        delFlag: 0,
        createdBy: "admin",
        createdAt: "2026-01-16 08:00:00",
        updatedBy: null,
        updatedAt: null,
      },
      {
        legacyTable: "saifute_composite_product",
        legacyId: 14,
        projectName: "缺料项目",
        customerLegacyId: null,
        customerName: null,
        classification: null,
        salesman: null,
        totalAmount: "1.00",
        orderDate: "2026-01-17",
        outBoundDate: null,
        remark: null,
        delFlag: 0,
        createdBy: "admin",
        createdAt: "2026-01-17 08:00:00",
        updatedBy: null,
        updatedAt: null,
      },
    ],
    lines: [
      {
        legacyTable: "saifute_product_material",
        legacyId: 1002,
        parentLegacyTable: "saifute_composite_product",
        parentLegacyId: 10,
        materialLegacyId: 702,
        materialName: "滤芯",
        materialSpec: null,
        quantity: "5",
        unitPrice: null,
        instruction: null,
        interval: null,
        remark: "辅料",
        acceptanceDate: "2026-01-04",
        supplierLegacyId: 302,
        unit: "套",
        taxIncludedPrice: null,
      },
      {
        legacyTable: "saifute_product_material",
        legacyId: 1001,
        parentLegacyTable: "saifute_composite_product",
        parentLegacyId: 10,
        materialLegacyId: 701,
        materialName: "旧壳体快照",
        materialSpec: "S-701-OLD",
        quantity: "3.5",
        unitPrice: "10.00",
        instruction: "主料",
        interval: "A01-A03",
        remark: "主料备注",
        acceptanceDate: "2026-01-03",
        supplierLegacyId: 301,
        unit: "件",
        taxIncludedPrice: "11.20",
      },
      {
        legacyTable: "saifute_product_material",
        legacyId: 1003,
        parentLegacyTable: "saifute_composite_product",
        parentLegacyId: 11,
        materialLegacyId: 703,
        materialName: "整机",
        materialSpec: "P-703",
        quantity: "2",
        unitPrice: "10.00",
        instruction: "整机",
        interval: "B01-B02",
        remark: null,
        acceptanceDate: "2026-01-12",
        supplierLegacyId: 303,
        unit: "台",
        taxIncludedPrice: "11.00",
      },
      {
        legacyTable: "saifute_product_material",
        legacyId: 1004,
        parentLegacyTable: "saifute_composite_product",
        parentLegacyId: 12,
        materialLegacyId: 701,
        materialName: "壳体",
        materialSpec: "S-701",
        quantity: "1",
        unitPrice: "5.00",
        instruction: null,
        interval: null,
        remark: null,
        acceptanceDate: null,
        supplierLegacyId: 304,
        unit: "个",
        taxIncludedPrice: null,
      },
      {
        legacyTable: "saifute_product_material",
        legacyId: 1005,
        parentLegacyTable: "saifute_composite_product",
        parentLegacyId: 13,
        materialLegacyId: 999,
        materialName: "阻断物料",
        materialSpec: null,
        quantity: "1",
        unitPrice: "3.00",
        instruction: null,
        interval: null,
        remark: null,
        acceptanceDate: null,
        supplierLegacyId: null,
        unit: "件",
        taxIncludedPrice: null,
      },
      {
        legacyTable: "saifute_product_material",
        legacyId: 1006,
        parentLegacyTable: "saifute_composite_product",
        parentLegacyId: 14,
        materialLegacyId: null,
        materialName: "缺料",
        materialSpec: null,
        quantity: "1",
        unitPrice: "1.00",
        instruction: null,
        interval: null,
        remark: null,
        acceptanceDate: null,
        supplierLegacyId: null,
        unit: "件",
        taxIncludedPrice: null,
      },
    ],
  };
}

describe("rd-project migration transformer — three-state model", () => {
  it("should classify projects into migrated / pending / excluded with deterministic counts", () => {
    const plan = buildRdProjectMigrationPlan(
      buildSnapshot(),
      buildDependencies(),
    );

    expect(plan.migrationBatch).toBe("batch2b-rd-project");
    expect(plan.globalBlockers).toHaveLength(0);

    // Auto-created material support admits project 14, leaving only the blocked-material
    // project pending.
    expect(plan.counts.projects).toEqual({
      source: 5,
      migrated: 4,
      pending: 1,
      excluded: 0,
    });
    // lines: 5 migrated (project 14 now consumes an auto-created material); only the
    // blocked-material project remains pending with 1 line.
    expect(plan.counts.lines).toEqual({
      source: 6,
      migrated: 5,
      pending: 1,
      excluded: 0,
    });

    // migrated + pending + excluded must cover all source headers
    const headerTotal =
      plan.counts.projects.migrated +
      plan.counts.projects.pending +
      plan.counts.projects.excluded;
    expect(headerTotal).toBe(plan.counts.projects.source);

    const lineTotal =
      plan.counts.lines.migrated +
      plan.counts.lines.pending +
      plan.counts.lines.excluded;
    expect(lineTotal).toBe(plan.counts.lines.source);
  });

  it("should admit project 10 fully: correct target fields, line ordering, and archived payloads", () => {
    const plan = buildRdProjectMigrationPlan(
      buildSnapshot(),
      buildDependencies(),
    );

    const primaryProject = plan.migratedProjects.find(
      (record) => record.legacyId === 10,
    );
    expect(primaryProject?.target.projectCode).toBe("YFXMBH-10");
    expect(primaryProject?.target.bizDate).toBe("2026-01-02");
    expect(primaryProject?.target.customerId).toBe(5201);
    expect(primaryProject?.target.customerCodeSnapshot).toBe("CUS-201");
    expect(primaryProject?.target.customerNameSnapshot).toBe("华电集团");
    expect(primaryProject?.target.supplierId).toBeNull();
    expect(primaryProject?.target.managerPersonnelId).toBe(610);
    expect(primaryProject?.target.managerNameSnapshot).toBe("王工");
    expect(primaryProject?.target.workshopId).toBe(7000);
    expect(primaryProject?.target.workshopNameSnapshot).toBe("默认车间");
    expect(primaryProject?.target.auditStatusSnapshot).toBe("NOT_REQUIRED");
    expect(primaryProject?.target.inventoryEffectStatus).toBe("POSTED");
    expect(primaryProject?.target.totalQty).toBe("8.500000");
    expect(primaryProject?.target.totalAmount).toBe("88.50");
    expect(
      primaryProject?.lines.map((line) => [line.legacyId, line.target.lineNo]),
    ).toEqual([
      [1001, 1],
      [1002, 2],
    ]);
    expect(primaryProject?.lines[0]?.target.unitCodeSnapshot).toBe("件");
    expect(primaryProject?.lines[0]?.target.materialNameSnapshot).toBe(
      "旧壳体快照",
    );
    expect(primaryProject?.lines[0]?.target.materialSpecSnapshot).toBe(
      "S-701-OLD",
    );
    expect(primaryProject?.lines[0]?.target.amount).toBe("35.00");
    expect(primaryProject?.lines[1]?.target.unitPrice).toBe("0.00");
    expect(primaryProject?.lines[1]?.target.amount).toBe("0.00");
    expect(primaryProject?.archivedPayload.payload).toEqual({
      classification: "硐室",
      outBoundDate: "2026-01-09",
      salesman: "王工",
    });
    expect(primaryProject?.lines[0]?.archivedPayload.payload).toEqual({
      acceptanceDate: "2026-01-03",
      instruction: "主料",
      interval: "A01-A03",
      supplierLegacyId: 301,
      taxIncludedPrice: "11.20",
    });
  });

  it("should admit voided project 11 with REVERSED inventoryEffectStatus", () => {
    const plan = buildRdProjectMigrationPlan(
      buildSnapshot(),
      buildDependencies(),
    );

    const voidedProject = plan.migratedProjects.find(
      (record) => record.legacyId === 11,
    );
    expect(voidedProject?.target.bizDate).toBe("2026-01-12");
    expect(voidedProject?.target.lifecycleStatus).toBe("VOIDED");
    expect(voidedProject?.target.auditStatusSnapshot).toBe("NOT_REQUIRED");
    expect(voidedProject?.target.inventoryEffectStatus).toBe("REVERSED");
    expect(voidedProject?.target.voidedBy).toBe("checker");
    expect(voidedProject?.target.voidedAt).toBe("2026-01-12 11:00:00");
    expect(voidedProject?.target.managerPersonnelId).toBeNull();
    expect(voidedProject?.target.managerNameSnapshot).toBe("张三");
  });

  it("should admit project 12 with fallback customer/manager snapshots and emit warnings", () => {
    const plan = buildRdProjectMigrationPlan(
      buildSnapshot(),
      buildDependencies(),
    );

    const fallbackProject = plan.migratedProjects.find(
      (record) => record.legacyId === 12,
    );
    expect(fallbackProject?.target.bizDate).toBe("2026-01-15");
    expect(fallbackProject?.target.customerId).toBeNull();
    expect(fallbackProject?.target.customerNameSnapshot).toBe("未映射客户");
    expect(fallbackProject?.target.managerPersonnelId).toBeNull();
    expect(fallbackProject?.target.managerNameSnapshot).toBe("李四");
    expect(fallbackProject?.target.supplierId).toBeNull();
    expect(
      plan.warnings.some(
        (warning) =>
          warning.legacyId === 12 && warning.reason.includes("customer map"),
      ),
    ).toBe(true);
    expect(
      plan.warnings.some(
        (warning) =>
          warning.legacyId === 12 &&
          warning.reason.includes("manager_name_snapshot"),
      ),
    ).toBe(true);
    expect(
      plan.warnings.some(
        (warning) =>
          warning.legacyTable === "personnel" &&
          warning.reason.includes("ambiguous names"),
      ),
    ).toBe(true);
  });

  it("should classify project 13 (blocked material) as pending, not excluded", () => {
    const plan = buildRdProjectMigrationPlan(
      buildSnapshot(),
      buildDependencies(),
    );

    const pending13 = plan.pendingProjects.find((p) => p.legacyId === 13);
    expect(pending13).toBeDefined();
    expect(pending13?.targetProjectCodeCandidate).toBe("YFXMBH-13");
    expect(pending13?.pendingLineCount).toBe(1);
    expect(pending13?.resolvedLineCount).toBe(0);
    expect(pending13?.pendingLines).toHaveLength(1);

    const pendingLine = pending13?.pendingLines[0];
    expect(pendingLine?.legacyId).toBe(1005);
    expect(pendingLine?.resolutionEvidence.ruleId).toBe(
      "pending-blocked-material",
    );
    expect(pendingLine?.resolutionEvidence.materialLegacyId).toBe(999);
    expect(pendingLine?.resolutionEvidence.resolved).toBe(false);
    expect(pendingLine?.resolutionEvidence.targetMaterialId).toBeNull();
    expect(pendingLine?.pendingReason).toContain("pending-blocked-material");
    expect(pendingLine?.pendingReason).toContain("999");

    // Summary archived payload must be present with correct kind and evidence
    expect(pending13?.summaryArchivedPayload.payloadKind).toBe(
      "pending-material-resolution-summary",
    );
    expect(pending13?.summaryArchivedPayload.payload.pendingLineCount).toBe(1);
    expect(pending13?.summaryArchivedPayload.payload.resolvedLineCount).toBe(0);
  });

  it("should auto-create a deterministic material and admit project 14", () => {
    const plan = buildRdProjectMigrationPlan(
      buildSnapshot(),
      buildDependencies(),
    );

    const migrated14 = plan.migratedProjects.find((p) => p.legacyId === 14);
    expect(migrated14).toBeDefined();
    expect(migrated14?.target.projectCode).toBe("YFXMBH-14");
    expect(migrated14?.lines).toHaveLength(1);
    expect(migrated14?.lines[0]?.target.materialId).toBeNull();
    expect(migrated14?.lines[0]?.target.materialNameSnapshot).toBe("缺料");

    expect(
      plan.pendingProjects.some((project) => project.legacyId === 14),
    ).toBe(false);
    expect(plan.autoCreatedMaterials).toHaveLength(1);
    expect(plan.autoCreatedMaterials[0]?.representativeLineLegacyId).toBe(1006);
    expect(plan.autoCreatedMaterials[0]?.target.materialName).toBe("缺料");
    expect(plan.autoCreatedMaterials[0]?.target.unitCode).toBe("件");
    expect(plan.autoCreatedMaterials[0]?.target.materialCode).toBe("xm1006");
    expect(migrated14?.lines[0]?.target.materialCodeSnapshot).toBe(
      plan.autoCreatedMaterials[0]?.target.materialCode,
    );
  });

  it("should allocate the next numeric xm code when the seed is occupied", () => {
    const deps = buildDependencies();
    deps.existingMaterialCodes.add("xm1006");

    const plan = buildRdProjectMigrationPlan(buildSnapshot(), deps);
    const migrated14 = plan.migratedProjects.find(
      (project) => project.legacyId === 14,
    );

    expect(plan.autoCreatedMaterials).toHaveLength(1);
    expect(plan.autoCreatedMaterials[0]?.target.materialCode).toBe("xm1007");
    expect(migrated14?.lines[0]?.target.materialCodeSnapshot).toBe("xm1007");
  });

  it("should have zero excluded projects when all issues are material-resolution pending", () => {
    const plan = buildRdProjectMigrationPlan(
      buildSnapshot(),
      buildDependencies(),
    );

    expect(plan.excludedProjects).toHaveLength(0);
  });

  it("should enforce all-or-nothing: project with pending lines must not appear in migratedProjects", () => {
    const plan = buildRdProjectMigrationPlan(
      buildSnapshot(),
      buildDependencies(),
    );

    const migratedIds = new Set(plan.migratedProjects.map((p) => p.legacyId));
    const pendingIds = new Set(plan.pendingProjects.map((p) => p.legacyId));

    // No project may appear in both migrated and pending
    for (const id of pendingIds) {
      expect(migratedIds.has(id)).toBe(false);
    }

    // Pending project 13 must not have live lines in migratedProjects
    expect(
      plan.migratedProjects.some((p) =>
        p.lines.some((l) => l.parentLegacyId === 13),
      ),
    ).toBe(false);
  });

  it("should not create map_project* records for pending projects (only in writer, verified by plan shape)", () => {
    const plan = buildRdProjectMigrationPlan(
      buildSnapshot(),
      buildDependencies(),
    );

    // migratedProjects have targetCode; pendingProjects only have targetProjectCodeCandidate
    for (const pending of plan.pendingProjects) {
      // PendingRdProjectPlanRecord has no targetTable or lines for live admission
      expect(
        "targetTable" in pending &&
          (pending as Record<string, unknown>).targetTable !== undefined,
      ).toBe(false);
    }
  });

  it("should contain stable sourcePayload in pending line records", () => {
    const plan = buildRdProjectMigrationPlan(
      buildSnapshot(),
      buildDependencies(),
    );

    const pending13 = plan.pendingProjects.find((p) => p.legacyId === 13);
    const linePayload = pending13?.pendingLines[0]?.sourcePayload;

    expect(linePayload?.materialLegacyId).toBe(999);
    expect(linePayload?.materialName).toBe("阻断物料");
    expect(linePayload?.quantity).toBe("1.000000");
    expect(linePayload?.unit).toBe("件");
  });

  it("should classify a structurally invalid project as excluded, not pending", () => {
    const snapshot: LegacyRdProjectSnapshot = {
      projects: [
        {
          legacyTable: "saifute_composite_product",
          legacyId: 50,
          projectName: null,
          customerLegacyId: null,
          customerName: null,
          classification: null,
          salesman: null,
          totalAmount: null,
          orderDate: null,
          outBoundDate: null,
          remark: null,
          delFlag: 0,
          createdBy: null,
          createdAt: null,
          updatedBy: null,
          updatedAt: null,
        },
      ],
      lines: [
        {
          legacyTable: "saifute_product_material",
          legacyId: 2001,
          parentLegacyTable: "saifute_composite_product",
          parentLegacyId: 50,
          materialLegacyId: 701,
          materialName: "壳体",
          materialSpec: "S-701",
          quantity: "1",
          unitPrice: "5.00",
          instruction: null,
          interval: null,
          remark: null,
          acceptanceDate: null,
          supplierLegacyId: null,
          unit: "件",
          taxIncludedPrice: null,
        },
      ],
    };

    const plan = buildRdProjectMigrationPlan(snapshot, buildDependencies());

    expect(plan.excludedProjects).toHaveLength(1);
    expect(plan.pendingProjects).toHaveLength(0);
    expect(plan.migratedProjects).toHaveLength(0);
    expect(plan.excludedProjects[0]?.legacyId).toBe(50);
    expect(plan.excludedProjects[0]?.exclusionReason).toContain(
      "Project name is required",
    );
    expect(plan.excludedProjects[0]?.exclusionReason).toContain(
      "Business date is required",
    );
  });

  it("should classify a project with line structural failure (null quantity) as excluded, not pending", () => {
    const snapshot: LegacyRdProjectSnapshot = {
      projects: [
        {
          legacyTable: "saifute_composite_product",
          legacyId: 51,
          projectName: "结构失败项目",
          customerLegacyId: null,
          customerName: null,
          classification: null,
          salesman: null,
          totalAmount: null,
          orderDate: "2026-01-20",
          outBoundDate: null,
          remark: null,
          delFlag: 0,
          createdBy: "admin",
          createdAt: "2026-01-20 08:00:00",
          updatedBy: null,
          updatedAt: null,
        },
      ],
      lines: [
        {
          legacyTable: "saifute_product_material",
          legacyId: 2002,
          parentLegacyTable: "saifute_composite_product",
          parentLegacyId: 51,
          materialLegacyId: 701,
          materialName: "壳体",
          materialSpec: null,
          quantity: null,
          unitPrice: null,
          instruction: null,
          interval: null,
          remark: null,
          acceptanceDate: null,
          supplierLegacyId: null,
          unit: "件",
          taxIncludedPrice: null,
        },
      ],
    };

    const plan = buildRdProjectMigrationPlan(snapshot, buildDependencies());

    expect(plan.excludedProjects).toHaveLength(1);
    expect(plan.pendingProjects).toHaveLength(0);
    expect(plan.excludedProjects[0]?.exclusionReason).toContain(
      "quantity is required",
    );
  });

  it("should classify a project where material_id resolves but also has missing-from-map as pending", () => {
    const snapshot: LegacyRdProjectSnapshot = {
      projects: [
        {
          legacyTable: "saifute_composite_product",
          legacyId: 52,
          projectName: "找不到map项目",
          customerLegacyId: null,
          customerName: null,
          classification: null,
          salesman: null,
          totalAmount: "5.00",
          orderDate: "2026-01-21",
          outBoundDate: null,
          remark: null,
          delFlag: 0,
          createdBy: "admin",
          createdAt: "2026-01-21 08:00:00",
          updatedBy: null,
          updatedAt: null,
        },
      ],
      lines: [
        {
          legacyTable: "saifute_product_material",
          legacyId: 2003,
          parentLegacyTable: "saifute_composite_product",
          parentLegacyId: 52,
          materialLegacyId: 888,
          materialName: "未映射物料",
          materialSpec: null,
          quantity: "1",
          unitPrice: "5.00",
          instruction: null,
          interval: null,
          remark: null,
          acceptanceDate: null,
          supplierLegacyId: null,
          unit: "件",
          taxIncludedPrice: null,
        },
      ],
    };

    const plan = buildRdProjectMigrationPlan(snapshot, buildDependencies());

    expect(plan.pendingProjects).toHaveLength(1);
    expect(plan.excludedProjects).toHaveLength(0);
    expect(plan.migratedProjects).toHaveLength(0);

    const pendingLine = plan.pendingProjects[0]?.pendingLines[0];
    expect(pendingLine?.resolutionEvidence.ruleId).toBe(
      "pending-missing-from-map",
    );
    expect(pendingLine?.resolutionEvidence.materialLegacyId).toBe(888);
  });

  it("should surface global blockers when the frozen default workshop or batch1 baseline is unavailable", () => {
    const dependencies = buildDependencies();
    dependencies.defaultWorkshop = null;
    dependencies.batch1Baseline.issues = [
      "batch1 workshop map count mismatch: expected 13, received 12.",
    ];

    const plan = buildRdProjectMigrationPlan(buildSnapshot(), dependencies);

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

  it("should keep stable pending reason codes and rule ids across reruns", () => {
    const plan1 = buildRdProjectMigrationPlan(
      buildSnapshot(),
      buildDependencies(),
    );
    const plan2 = buildRdProjectMigrationPlan(
      buildSnapshot(),
      buildDependencies(),
    );

    const pending1 = plan1.pendingProjects.map((p) =>
      p.pendingLines.map((l) => ({
        ruleId: l.resolutionEvidence.ruleId,
        pendingReason: l.pendingReason,
      })),
    );
    const pending2 = plan2.pendingProjects.map((p) =>
      p.pendingLines.map((l) => ({
        ruleId: l.resolutionEvidence.ruleId,
        pendingReason: l.pendingReason,
      })),
    );

    expect(pending1).toEqual(pending2);
  });

  it("should resolve a line with null materialId via unique-normalized-name-spec-unit when name+spec+unit uniquely identifies one batch1 material", () => {
    const snapshot: LegacyRdProjectSnapshot = {
      projects: [
        {
          legacyTable: "saifute_composite_product",
          legacyId: 60,
          projectName: "名称唯一回填项目",
          customerLegacyId: null,
          customerName: null,
          classification: null,
          salesman: null,
          totalAmount: "35.00",
          orderDate: "2026-02-01",
          outBoundDate: null,
          remark: null,
          delFlag: 0,
          createdBy: "admin",
          createdAt: "2026-02-01 08:00:00",
          updatedBy: null,
          updatedAt: null,
        },
      ],
      lines: [
        {
          legacyTable: "saifute_product_material",
          legacyId: 3001,
          parentLegacyTable: "saifute_composite_product",
          parentLegacyId: 60,
          materialLegacyId: null,
          materialName: "壳体",
          materialSpec: "S-701",
          quantity: "3.5",
          unitPrice: "10.00",
          instruction: null,
          interval: null,
          remark: null,
          acceptanceDate: null,
          supplierLegacyId: null,
          unit: "件",
          taxIncludedPrice: null,
        },
      ],
    };

    const plan = buildRdProjectMigrationPlan(snapshot, buildDependencies());

    // "壳体|S-701|件" uniquely matches MAT-701 → project should be migrated
    expect(plan.migratedProjects).toHaveLength(1);
    expect(plan.pendingProjects).toHaveLength(0);
    expect(plan.excludedProjects).toHaveLength(0);

    const migratedProject = plan.migratedProjects[0];
    expect(migratedProject?.target.projectCode).toBe("YFXMBH-60");
    expect(migratedProject?.lines).toHaveLength(1);
    expect(migratedProject?.lines[0]?.target.materialId).toBe(1701);
    expect(migratedProject?.lines[0]?.target.materialCodeSnapshot).toBe(
      "MAT-701",
    );
    // materialNameSnapshot falls back to line value when present
    expect(migratedProject?.lines[0]?.target.materialNameSnapshot).toBe("壳体");
  });

  it("should classify a line as pending-null-material-id when both materialId and materialName are absent", () => {
    const snapshot: LegacyRdProjectSnapshot = {
      projects: [
        {
          legacyTable: "saifute_composite_product",
          legacyId: 61,
          projectName: "完全无物料证据项目",
          customerLegacyId: null,
          customerName: null,
          classification: null,
          salesman: null,
          totalAmount: "1.00",
          orderDate: "2026-02-02",
          outBoundDate: null,
          remark: null,
          delFlag: 0,
          createdBy: "admin",
          createdAt: "2026-02-02 08:00:00",
          updatedBy: null,
          updatedAt: null,
        },
      ],
      lines: [
        {
          legacyTable: "saifute_product_material",
          legacyId: 3002,
          parentLegacyTable: "saifute_composite_product",
          parentLegacyId: 61,
          materialLegacyId: null,
          materialName: null,
          materialSpec: null,
          quantity: "1",
          unitPrice: "1.00",
          instruction: null,
          interval: null,
          remark: null,
          acceptanceDate: null,
          supplierLegacyId: null,
          unit: "件",
          taxIncludedPrice: null,
        },
      ],
    };

    const plan = buildRdProjectMigrationPlan(snapshot, buildDependencies());

    expect(plan.pendingProjects).toHaveLength(1);
    expect(plan.migratedProjects).toHaveLength(0);

    const pendingLine = plan.pendingProjects[0]?.pendingLines[0];
    expect(pendingLine?.resolutionEvidence.ruleId).toBe(
      "pending-null-material-id",
    );
    expect(pendingLine?.resolutionEvidence.materialLegacyId).toBeNull();
    expect(pendingLine?.pendingReason).toContain("pending-null-material-id");
    expect(pendingLine?.resolutionEvidence.candidateSummary).toBeUndefined();
  });

  it("should classify a line as pending-ambiguous-candidate when name+spec+unit matches multiple batch1 materials", () => {
    const deps = buildDependencies();
    // Inject a second material with the same name+spec+unit as MAT-701
    deps.materialByLegacyKey.set("saifute_material::704", {
      targetId: 1704,
      materialCode: "MAT-704",
      materialName: "壳体",
      specModel: "S-701",
      unitCode: "件",
    });

    const snapshot: LegacyRdProjectSnapshot = {
      projects: [
        {
          legacyTable: "saifute_composite_product",
          legacyId: 62,
          projectName: "物料多候选项目",
          customerLegacyId: null,
          customerName: null,
          classification: null,
          salesman: null,
          totalAmount: "5.00",
          orderDate: "2026-02-03",
          outBoundDate: null,
          remark: null,
          delFlag: 0,
          createdBy: "admin",
          createdAt: "2026-02-03 08:00:00",
          updatedBy: null,
          updatedAt: null,
        },
      ],
      lines: [
        {
          legacyTable: "saifute_product_material",
          legacyId: 3003,
          parentLegacyTable: "saifute_composite_product",
          parentLegacyId: 62,
          materialLegacyId: null,
          materialName: "壳体",
          materialSpec: "S-701",
          quantity: "1",
          unitPrice: "5.00",
          instruction: null,
          interval: null,
          remark: null,
          acceptanceDate: null,
          supplierLegacyId: null,
          unit: "件",
          taxIncludedPrice: null,
        },
      ],
    };

    const plan = buildRdProjectMigrationPlan(snapshot, deps);

    expect(plan.pendingProjects).toHaveLength(1);
    expect(plan.migratedProjects).toHaveLength(0);

    const pendingLine = plan.pendingProjects[0]?.pendingLines[0];
    expect(pendingLine?.resolutionEvidence.ruleId).toBe(
      "pending-ambiguous-candidate",
    );
    expect(pendingLine?.resolutionEvidence.materialLegacyId).toBeNull();
    expect(pendingLine?.pendingReason).toContain("pending-ambiguous-candidate");
    // candidateSummary should contain both matching materials
    expect(pendingLine?.resolutionEvidence.candidateSummary).toHaveLength(2);
    const candidateCodes =
      pendingLine?.resolutionEvidence.candidateSummary?.map(
        (c) => c.materialCode,
      );
    expect(candidateCodes).toContain("MAT-701");
    expect(candidateCodes).toContain("MAT-704");
  });

  // ── Finding 1 regression: mixed structural+material invalid lines ─────────────

  it("should classify project with mixed invalid line (null materialId + name present + null quantity) as structural-excluded, not pending", () => {
    // Reproduced case from reviewer finding: material_id=null, materialName present,
    // quantity=null. Before the fix this returned pending-no-candidate; after the fix
    // structural validation wins and the project is excluded.
    const snapshot: LegacyRdProjectSnapshot = {
      projects: [
        {
          legacyTable: "saifute_composite_product",
          legacyId: 70,
          projectName: "混合无效行项目",
          customerLegacyId: null,
          customerName: null,
          classification: null,
          salesman: null,
          totalAmount: "0.00",
          orderDate: "2026-03-01",
          outBoundDate: null,
          remark: null,
          delFlag: 0,
          createdBy: "admin",
          createdAt: "2026-03-01 08:00:00",
          updatedBy: null,
          updatedAt: null,
        },
      ],
      lines: [
        {
          legacyTable: "saifute_product_material",
          legacyId: 4001,
          parentLegacyTable: "saifute_composite_product",
          parentLegacyId: 70,
          materialLegacyId: null,
          materialName: "缺料",
          materialSpec: null,
          quantity: null, // structural failure
          unitPrice: "1.00",
          instruction: null,
          interval: null,
          remark: null,
          acceptanceDate: null,
          supplierLegacyId: null,
          unit: "件",
          taxIncludedPrice: null,
        },
      ],
    };

    const plan = buildRdProjectMigrationPlan(snapshot, buildDependencies());

    // Must be structural-excluded, NOT pending, even though material is also unresolvable
    expect(plan.excludedProjects).toHaveLength(1);
    expect(plan.pendingProjects).toHaveLength(0);
    expect(plan.migratedProjects).toHaveLength(0);
    expect(plan.excludedProjects[0]?.exclusionReason).toContain(
      "quantity is required",
    );
    // Must not mention pending reason codes
    expect(plan.excludedProjects[0]?.exclusionReason).not.toContain(
      "pending-no-candidate",
    );
  });

  it("should classify project with mixed invalid line (null materialId + name present + null unit) as structural-excluded, not pending", () => {
    const snapshot: LegacyRdProjectSnapshot = {
      projects: [
        {
          legacyTable: "saifute_composite_product",
          legacyId: 71,
          projectName: "缺单位行项目",
          customerLegacyId: null,
          customerName: null,
          classification: null,
          salesman: null,
          totalAmount: "2.00",
          orderDate: "2026-03-02",
          outBoundDate: null,
          remark: null,
          delFlag: 0,
          createdBy: "admin",
          createdAt: "2026-03-02 08:00:00",
          updatedBy: null,
          updatedAt: null,
        },
      ],
      lines: [
        {
          legacyTable: "saifute_product_material",
          legacyId: 4002,
          parentLegacyTable: "saifute_composite_product",
          parentLegacyId: 71,
          materialLegacyId: null,
          materialName: "缺料",
          materialSpec: null,
          quantity: "1",
          unitPrice: "2.00",
          instruction: null,
          interval: null,
          remark: null,
          acceptanceDate: null,
          supplierLegacyId: null,
          unit: null, // structural failure
          taxIncludedPrice: null,
        },
      ],
    };

    const plan = buildRdProjectMigrationPlan(snapshot, buildDependencies());

    expect(plan.excludedProjects).toHaveLength(1);
    expect(plan.pendingProjects).toHaveLength(0);
    expect(plan.excludedProjects[0]?.exclusionReason).toContain(
      "unit is required",
    );
    expect(plan.excludedProjects[0]?.exclusionReason).not.toContain(
      "pending-no-candidate",
    );
  });

  it("should fill the confirmed legacy project 16 pin line unit override", () => {
    const snapshot: LegacyRdProjectSnapshot = {
      projects: [
        {
          legacyTable: "saifute_composite_product",
          legacyId: 16,
          projectName: "旋转支护 石煤机160-200",
          customerLegacyId: null,
          customerName: null,
          classification: null,
          salesman: null,
          totalAmount: "60.00",
          orderDate: "2026-02-01",
          outBoundDate: null,
          remark: null,
          delFlag: 0,
          createdBy: "admin",
          createdAt: "2026-02-01 08:00:00",
          updatedBy: null,
          updatedAt: null,
        },
      ],
      lines: [
        {
          legacyTable: "saifute_product_material",
          legacyId: 157,
          parentLegacyTable: "saifute_composite_product",
          parentLegacyId: 16,
          materialLegacyId: null,
          materialName: "销轴",
          materialSpec: "24*67",
          quantity: "2",
          unitPrice: "30.00",
          instruction: null,
          interval: null,
          remark: null,
          acceptanceDate: "2026-02-01",
          supplierLegacyId: null,
          unit: null,
          taxIncludedPrice: null,
        },
      ],
    };

    const plan = buildRdProjectMigrationPlan(snapshot, buildDependencies());

    expect(plan.excludedProjects).toHaveLength(0);
    expect(plan.pendingProjects).toHaveLength(0);
    expect(plan.migratedProjects).toHaveLength(1);
    expect(plan.autoCreatedMaterials[0]?.target.unitCode).toBe("个");
    expect(plan.migratedProjects[0]?.lines[0]?.target.unitCodeSnapshot).toBe(
      "个",
    );
    expect(plan.warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          legacyTable: "saifute_product_material",
          legacyId: 157,
          reason: "Project material line unit filled by migration override.",
          details: expect.objectContaining({
            parentLegacyId: 16,
            unitCode: "个",
            confirmedAt: "2026-05-16",
          }),
        }),
      ]),
    );
  });

  it("should reuse an existing auto-created project material on rerun", () => {
    const deps = buildDependencies();
    deps.autoCreatedMaterialByNormalizedKey.set("缺料||件", {
      targetId: 2701,
      materialCode: "xm1006",
      materialName: "缺料",
      specModel: null,
      unitCode: "件",
    });
    deps.existingMaterialCodes.add("xm1006");

    const plan = buildRdProjectMigrationPlan(buildSnapshot(), deps);
    const migrated14 = plan.migratedProjects.find(
      (project) => project.legacyId === 14,
    );

    expect(plan.autoCreatedMaterials).toHaveLength(1);
    expect(plan.autoCreatedMaterials[0]?.target.materialCode).toBe("xm1006");
    expect(migrated14?.lines[0]?.target.materialId).toBe(2701);
    expect(migrated14?.lines[0]?.target.materialCodeSnapshot).toBe("xm1006");
  });

  it("should group multiple no-candidate lines with the same normalized key into one auto-created material", () => {
    const snapshot: LegacyRdProjectSnapshot = {
      projects: [
        {
          legacyTable: "saifute_composite_product",
          legacyId: 80,
          projectName: "重复补建项目",
          customerLegacyId: null,
          customerName: null,
          classification: null,
          salesman: null,
          totalAmount: "9.00",
          orderDate: "2026-03-03",
          outBoundDate: null,
          remark: null,
          delFlag: 0,
          createdBy: "admin",
          createdAt: "2026-03-03 08:00:00",
          updatedBy: null,
          updatedAt: null,
        },
      ],
      lines: [
        {
          legacyTable: "saifute_product_material",
          legacyId: 5001,
          parentLegacyTable: "saifute_composite_product",
          parentLegacyId: 80,
          materialLegacyId: null,
          materialName: "重复补建件",
          materialSpec: "SAME",
          quantity: "1",
          unitPrice: "4.00",
          instruction: null,
          interval: null,
          remark: null,
          acceptanceDate: null,
          supplierLegacyId: null,
          unit: "件",
          taxIncludedPrice: null,
        },
        {
          legacyTable: "saifute_product_material",
          legacyId: 5002,
          parentLegacyTable: "saifute_composite_product",
          parentLegacyId: 80,
          materialLegacyId: null,
          materialName: "重复补建件",
          materialSpec: "SAME",
          quantity: "1",
          unitPrice: "5.00",
          instruction: null,
          interval: null,
          remark: null,
          acceptanceDate: null,
          supplierLegacyId: null,
          unit: "件",
          taxIncludedPrice: null,
        },
      ],
    };

    const plan = buildRdProjectMigrationPlan(snapshot, buildDependencies());

    expect(plan.autoCreatedMaterials).toHaveLength(1);
    expect(plan.migratedProjects).toHaveLength(1);
    expect(plan.pendingProjects).toHaveLength(0);
    expect(plan.migratedProjects[0]?.lines).toHaveLength(2);
    expect(
      plan.migratedProjects[0]?.lines[0]?.target.materialCodeSnapshot,
    ).toBe(plan.autoCreatedMaterials[0]?.target.materialCode);
    expect(
      plan.migratedProjects[0]?.lines[1]?.target.materialCodeSnapshot,
    ).toBe(plan.autoCreatedMaterials[0]?.target.materialCode);
  });
});

// ── Finding 2: structural exclusion sign-off clearance path ───────────────────

describe("rd-project cutover readiness — structural exclusion sign-off", () => {
  function makePlanWithExcluded(excludedCount: number, pendingCount: number) {
    const excludedProjects = Array.from({ length: excludedCount }, (_, i) => ({
      legacyTable: "saifute_composite_product" as const,
      legacyId: 100 + i,
      exclusionReason: "structural failure",
      payload: { lines: [] as unknown[] },
    }));

    const pendingProjects = Array.from({ length: pendingCount }, (_, i) => ({
      legacyTable: "saifute_composite_product" as const,
      legacyId: 200 + i,
      targetProjectCodeCandidate: `YFXMBH-${200 + i}`,
      resolvedLineCount: 0,
      pendingLineCount: 1,
      pendingLines: [
        {
          legacyTable: "saifute_product_material" as const,
          legacyId: 9000 + i,
          parentLegacyTable: "saifute_composite_product" as const,
          parentLegacyId: 200 + i,
          pendingReason: "pending-null-material-id: stub",
          resolutionEvidence: {
            ruleId: "pending-null-material-id" as const,
            resolved: false,
            pendingReason: "pending-null-material-id: stub",
            materialLegacyId: null,
            targetMaterialId: null,
            targetMaterialCode: null,
          },
          sourcePayload: {},
        },
      ],
      summaryArchivedPayload: {
        legacyTable: "saifute_composite_product" as const,
        legacyId: 200 + i,
        targetTable: "rd_project" as const,
        targetCode: `YFXMBH-${200 + i}`,
        payloadKind: "pending-material-resolution-summary" as const,
        archiveReason: "stub",
        payload: {
          pendingRuleBreakdown: {},
          pendingLineCount: 1,
          resolvedLineCount: 0,
          totalLineCount: 1,
          targetProjectCodeCandidate: `YFXMBH-${200 + i}`,
          projectName: null,
          pendingLinesEvidence: [],
        },
      },
    }));

    return {
      migrationBatch: "batch2b-rd-project",
      autoCreatedMaterials: [],
      migratedProjects: [],
      pendingProjects,
      excludedProjects,
      warnings: [],
      globalBlockers: [],
      counts: {
        projects: {
          source: excludedCount + pendingCount,
          migrated: 0,
          pending: pendingCount,
          excluded: excludedCount,
        },
        lines: {
          source: pendingCount,
          migrated: 0,
          pending: pendingCount,
          excluded: 0,
        },
        sourceProjectTables: {
          saifute_composite_product: excludedCount + pendingCount,
        },
        sourceLineTables: { saifute_product_material: pendingCount },
      },
      context: {
        defaultWorkshopCode: "WS-LEGACY-DEFAULT",
        defaultWorkshopName: "默认车间",
        blockedMaterialLegacyIds: [],
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
      },
    } as Parameters<typeof buildCutoverReadiness>[0];
  }

  const emptyConsumers = {
    approval_document: 0,
    document_relation: 0,
    document_line_relation: 0,
    inventory_log: 0,
    inventory_source_usage: 0,
    factory_number_reservation: 0,
  };

  it("should block cutover when structural exclusions exist and not yet acknowledged", () => {
    const plan = makePlanWithExcluded(2, 0);
    const result = buildCutoverReadiness(plan, emptyConsumers, false);

    expect(result.cutoverReady).toBe(false);
    expect(result.structuralExcludedProjectCount).toBe(2);
    expect(result.structuralExclusionsAcknowledged).toBe(false);
    expect(result.cutoverBlockers).toHaveLength(1);
    expect(result.cutoverBlockers[0]).toContain("structurally excluded");
    expect(result.cutoverBlockers[0]).toContain(
      "PROJECT_STRUCTURAL_EXCLUSIONS_ACKNOWLEDGED",
    );
  });

  it("should clear structural exclusion blocker when acknowledged (no other blockers)", () => {
    const plan = makePlanWithExcluded(2, 0);
    const result = buildCutoverReadiness(plan, emptyConsumers, true);

    expect(result.cutoverReady).toBe(true);
    expect(result.cutoverBlockers).toHaveLength(0);
    expect(result.structuralExclusionsAcknowledged).toBe(true);
    expect(result.structuralExcludedProjectCount).toBe(2);
  });

  it("should still block when exclusions are acknowledged but pending projects remain", () => {
    const plan = makePlanWithExcluded(1, 3);
    const result = buildCutoverReadiness(plan, emptyConsumers, true);

    expect(result.cutoverReady).toBe(false);
    // Pending backlog is still a blocker even though structural exclusions are cleared
    expect(
      result.cutoverBlockers.some((b) =>
        b.includes("unresolved material backlog"),
      ),
    ).toBe(true);
    // Structural exclusion blocker must be absent
    expect(
      result.cutoverBlockers.some((b) => b.includes("structurally excluded")),
    ).toBe(false);
  });

  it("should report only unresolved pending lines in the cutover backlog message", () => {
    const plan = makePlanWithExcluded(0, 1);
    const [pendingProject] = plan.pendingProjects;

    expect(pendingProject).toBeDefined();
    if (!pendingProject) {
      throw new Error("Expected a pending project in the test fixture.");
    }

    pendingProject.resolvedLineCount = 2;
    pendingProject.summaryArchivedPayload.payload = {
      pendingRuleBreakdown: {},
      pendingLineCount: 1,
      resolvedLineCount: 2,
      totalLineCount: 3,
      targetProjectCodeCandidate: "YFXMBH-200",
      projectName: null,
      pendingLinesEvidence: [],
    };
    plan.counts.lines.source = 3;
    plan.counts.lines.pending = 3;

    const result = buildCutoverReadiness(plan, emptyConsumers, false);

    expect(result.pendingLineCount).toBe(1);
    expect(result.cutoverBlockers[0]).toContain("(1 pending line(s))");
  });

  it("should clear the replay blocker when downstream evidence covers all migrated lines", () => {
    const plan = makePlanWithExcluded(0, 0);
    plan.migratedProjects = [
      {
        legacyTable: "saifute_composite_product",
        legacyId: 300,
        targetTable: "rd_project",
        targetCode: "YFXMBH-300",
        target: {} as never,
        lines: [{} as never, {} as never],
        archivedPayload: {} as never,
      },
    ];
    plan.counts.projects.source = 1;
    plan.counts.projects.migrated = 1;
    plan.counts.lines.source = 2;
    plan.counts.lines.migrated = 2;

    const result = buildCutoverReadiness(
      plan,
      {
        ...emptyConsumers,
        inventory_log: 5,
        inventory_source_usage: 5,
      },
      false,
    );

    expect(result.cutoverReady).toBe(true);
    expect(result.cutoverBlockers).toHaveLength(0);
    expect(result.inventoryReplayCompleted).toBe(true);
    expect(result.expectedInventoryReplayLogCount).toBe(2);
    expect(result.actualInventoryReplayLogCount).toBe(5);
  });

  it("should block cutover when replay evidence is below the migrated line count", () => {
    const plan = makePlanWithExcluded(0, 0);
    plan.migratedProjects = [
      {
        legacyTable: "saifute_composite_product",
        legacyId: 301,
        targetTable: "rd_project",
        targetCode: "YFXMBH-301",
        target: {} as never,
        lines: [{} as never, {} as never, {} as never],
        archivedPayload: {} as never,
      },
    ];
    plan.counts.projects.source = 1;
    plan.counts.projects.migrated = 1;
    plan.counts.lines.source = 3;
    plan.counts.lines.migrated = 3;

    const result = buildCutoverReadiness(
      plan,
      {
        ...emptyConsumers,
        inventory_log: 2,
      },
      false,
    );

    expect(result.cutoverReady).toBe(false);
    expect(result.inventoryReplayCompleted).toBe(false);
    expect(result.expectedInventoryReplayLogCount).toBe(3);
    expect(result.actualInventoryReplayLogCount).toBe(2);
    expect(result.cutoverBlockers).toContain(
      "Inventory replay is incomplete for rd-project slice: expected at least 3 rd-project inventory log(s), found 2.",
    );
  });

  it("should not emit structural exclusion blocker when there are no excluded projects", () => {
    const plan = makePlanWithExcluded(0, 1);
    const result = buildCutoverReadiness(plan, emptyConsumers, false);

    expect(result.structuralExcludedProjectCount).toBe(0);
    expect(
      result.cutoverBlockers.some((b) => b.includes("structurally excluded")),
    ).toBe(false);
  });
});
