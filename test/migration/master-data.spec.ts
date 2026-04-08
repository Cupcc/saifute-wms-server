import { buildMasterDataMigrationPlan } from "../../scripts/migration/master-data/transformer";
import type { LegacyMasterDataSnapshot } from "../../scripts/migration/master-data/types";

function buildSnapshot(): LegacyMasterDataSnapshot {
  return {
    materialCategories: [
      {
        dictCode: 1,
        dictSort: 1,
        dictLabel: "原材料",
        dictValue: "1",
        dictType: "saifute_material_category",
        status: "0",
        cssClass: null,
        listClass: "primary",
        isDefault: "Y",
        remark: "keep",
        createBy: "admin",
        createTime: "2026-03-15 00:00:00",
        updateBy: null,
        updateTime: null,
      },
      {
        dictCode: 2,
        dictSort: 2,
        dictLabel: "成品",
        dictValue: "3",
        dictType: "saifute_material_category",
        status: "0",
        cssClass: null,
        listClass: null,
        isDefault: "N",
        remark: null,
        createBy: "admin",
        createTime: "2026-03-15 00:00:00",
        updateBy: null,
        updateTime: null,
      },
    ],
    workshops: [
      {
        workshopId: 6,
        workshopName: "装备车间",
        contactPerson: "陈苗苗",
        chargeBy: "黄学兰",
        delFlag: 0,
        voidDescription: null,
        createBy: "admin",
        createTime: "2026-03-15 00:00:00",
        updateBy: null,
        updateTime: null,
      },
    ],
    suppliers: [
      {
        supplierId: 5,
        supplierCode: null,
        supplierName: "江苏聚义",
        supplierShortName: "聚义",
        contactPerson: "周海",
        contactPhone: "123",
        address: "江苏",
        delFlag: 0,
        voidDescription: null,
        createBy: "admin",
        createTime: "2026-03-15 00:00:00",
        updateBy: null,
        updateTime: null,
      },
    ],
    personnel: [
      {
        personnelId: 35,
        type: 2,
        code: "",
        name: "陈苗苗",
        namePinyin: "chenmiaomiao",
        contactPhone: "18800000000",
        delFlag: 0,
        voidDescription: null,
        createBy: "admin",
        createTime: "2026-03-15 00:00:00",
        updateBy: null,
        updateTime: null,
      },
    ],
    customers: [
      {
        customerId: 13,
        customerCode: "2",
        customerName: "华电集团",
        customerShortName: null,
        customerType: "集团客户",
        parentId: null,
        contactPerson: "张帅",
        contactPhone: null,
        address: null,
        remark: null,
        delFlag: 0,
        voidDescription: null,
        createBy: "admin",
        createTime: "2026-03-15 00:00:00",
        updateBy: null,
        updateTime: null,
      },
      {
        customerId: 14,
        customerCode: "2",
        customerName: "柳林县东方万象",
        customerShortName: null,
        customerType: null,
        parentId: 999,
        contactPerson: "盛兆义",
        contactPhone: null,
        address: null,
        remark: "legacy note",
        delFlag: 2,
        voidDescription: "错误",
        createBy: "admin",
        createTime: "2026-03-15 00:00:00",
        updateBy: null,
        updateTime: null,
      },
    ],
    materials: [
      {
        materialId: 5,
        materialCode: "013",
        materialName: "物料一",
        specification: "S-1",
        category: 1,
        isAttachment: 0,
        unit: "件",
        isHidden: 0,
        stockMin: "10",
        delFlag: 0,
        voidDescription: null,
        createBy: "admin",
        createTime: "2026-03-15 00:00:00",
        updateBy: null,
        updateTime: null,
      },
      {
        materialId: 6,
        materialCode: "013",
        materialName: "物料二",
        specification: "S-2",
        category: 3,
        isAttachment: 1,
        unit: " ",
        isHidden: 0,
        stockMin: null,
        delFlag: 0,
        voidDescription: "缺单位",
        createBy: "admin",
        createTime: "2026-03-15 00:00:00",
        updateBy: null,
        updateTime: null,
      },
      {
        materialId: 7,
        materialCode: null,
        materialName: "物料三",
        specification: null,
        category: 9,
        isAttachment: 0,
        unit: "台",
        isHidden: 1,
        stockMin: "3",
        delFlag: 2,
        voidDescription: "分类不存在",
        createBy: "admin",
        createTime: "2026-03-15 00:00:00",
        updateBy: null,
        updateTime: null,
      },
    ],
  };
}

describe("master-data migration transformer", () => {
  it("should build deterministic batch1 plan with blockers, rewrites, and archived payloads", () => {
    const plan = buildMasterDataMigrationPlan(buildSnapshot());

    expect(plan.migrationBatch).toBe("batch1-master-data");
    expect(plan.records.workshop[0]?.isSyntheticDefault).toBe(true);
    expect(plan.records.workshop[0]?.target.workshopName).toBe("历史默认车间");
    expect(plan.records.workshop[1]?.target.workshopName).toBe("装备车间");

    expect(plan.records.supplier[0]?.target.supplierCode).toBe("SUP-LEGACY-5");
    expect(plan.records.personnel[0]?.target.personnelName).toBe("陈苗苗");

    expect(plan.records.customer[0]?.target.customerCode).toBe("2");
    expect(plan.records.customer[1]?.target.customerCode).toBe("2-LEGACY-14");

    expect(plan.records.material[0]?.target.materialCode).toBe("013");
    expect(plan.records.material[1]?.target.materialCode).toBe("013-LEGACY-6");
    expect(plan.records.material[2]?.target.materialCode).toBe("MAT-LEGACY-7");

    expect(plan.context.missingMaterialUnitCount).toBe(1);
    expect(plan.context.activeMissingMaterialUnitCount).toBe(1);
    expect(
      plan.blockers.some(
        (blocker) =>
          blocker.entity === "material" &&
          blocker.legacyId === 6 &&
          blocker.fields.includes("unit"),
      ),
    ).toBe(true);
    expect(
      plan.blockers.some(
        (blocker) =>
          blocker.entity === "material" &&
          blocker.legacyId === 7 &&
          blocker.fields.includes("category") &&
          blocker.reason.includes("could not be mapped"),
      ),
    ).toBe(true);

    expect(
      plan.warnings.some(
        (warning) =>
          warning.entity === "customer" &&
          warning.legacyId === 14 &&
          warning.reason.includes("parent reference"),
      ),
    ).toBe(true);

    expect(plan.records.material[0]?.archivedPayload?.payloadKind).toBe(
      "legacy-unmapped-fields",
    );
    expect(plan.records.material[1]?.archivedPayload?.payloadKind).toBe(
      "blocked-record",
    );

    expect(plan.duplicateRewrites).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          entity: "customer",
          originalCode: "2",
          keptLegacyId: 13,
        }),
        expect.objectContaining({
          entity: "material",
          originalCode: "013",
          keptLegacyId: 5,
        }),
      ]),
    );
  });

  it("should block materials that point at blocked material categories", () => {
    const snapshot = buildSnapshot();
    snapshot.materialCategories.push({
      dictCode: 9,
      dictSort: 9,
      dictLabel: null,
      dictValue: "9",
      dictType: "saifute_material_category",
      status: "0",
      cssClass: null,
      listClass: null,
      isDefault: "N",
      remark: null,
      createBy: "admin",
      createTime: "2026-03-15 00:00:00",
      updateBy: null,
      updateTime: null,
    });
    snapshot.materials.push({
      materialId: 8,
      materialCode: "MAT-8",
      materialName: "物料四",
      specification: "S-4",
      category: 9,
      isAttachment: 0,
      unit: "个",
      isHidden: 0,
      stockMin: null,
      delFlag: 0,
      voidDescription: null,
      createBy: "admin",
      createTime: "2026-03-15 00:00:00",
      updateBy: null,
      updateTime: null,
    });

    const plan = buildMasterDataMigrationPlan(snapshot);

    expect(
      plan.blockers.some(
        (blocker) =>
          blocker.entity === "material" &&
          blocker.legacyId === 8 &&
          blocker.fields.includes("category") &&
          blocker.reason.includes("blocked material category row"),
      ),
    ).toBe(true);
  });
});
