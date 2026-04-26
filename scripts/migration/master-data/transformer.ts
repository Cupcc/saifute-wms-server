import {
  buildFallbackCode,
  DEFAULT_WORKSHOP_NAME,
  normalizeOptionalText,
  resolveDeterministicCodes,
} from "../shared/deterministic";
import type {
  ArchivedFieldPayloadRecord,
  CustomerPlanRecord,
  DuplicateRewriteSummary,
  LegacyCustomerRow,
  LegacyMasterDataSnapshot,
  LegacyMaterialCategoryRow,
  LegacyMaterialRow,
  LegacyPersonnelRow,
  LegacySupplierRow,
  LegacyWorkshopRow,
  MasterDataCountSummary,
  MasterDataEntity,
  MasterDataMigrationPlan,
  MasterDataStatusValue,
  MigrationBlocker,
  MigrationWarning,
  PersonnelPlanRecord,
  SupplierPlanRecord,
  WorkshopPlanRecord,
} from "./types";

const BATCH_NAME = "batch1-master-data";

const ENTITY_ORDER: MasterDataEntity[] = [
  "materialCategory",
  "workshop",
  "supplier",
  "personnel",
  "customer",
  "material",
];

function toStatus(
  delFlag: number | string | null | undefined,
): MasterDataStatusValue {
  return String(delFlag ?? "0") === "2" ? "DISABLED" : "ACTIVE";
}

function toArchivedPayload(
  legacyTable: string,
  legacyId: number,
  targetTable: string,
  targetCode: string,
  archiveReason: string,
  payload: Record<string, unknown>,
): ArchivedFieldPayloadRecord | null {
  const filteredPayloadEntries = Object.entries(payload).filter(
    ([, value]) => value !== null && value !== undefined,
  );

  if (filteredPayloadEntries.length === 0) {
    return null;
  }

  return {
    legacyTable,
    legacyId,
    targetTable,
    targetCode,
    archiveReason,
    payloadKind: "legacy-unmapped-fields",
    payload: Object.fromEntries(filteredPayloadEntries),
  };
}

function toBlockedPayload(
  legacyTable: string,
  legacyId: number,
  targetTable: string,
  targetCode: string,
  blockers: MigrationBlocker[],
  legacySnapshot: Record<string, unknown>,
): ArchivedFieldPayloadRecord {
  return {
    legacyTable,
    legacyId,
    targetTable,
    targetCode,
    archiveReason: blockers.map((blocker) => blocker.reason).join("; "),
    payloadKind: "blocked-record",
    payload: {
      blockers,
      legacySnapshot,
    },
  };
}

function createBlocker(
  entity: MasterDataEntity,
  legacyTable: string,
  legacyId: number,
  reason: string,
  fields: string[],
  legacyCode: string | null,
  isActive: boolean,
): MigrationBlocker {
  return {
    entity,
    legacyTable,
    legacyId,
    reason,
    fields,
    legacyCode,
    isActive,
  };
}

function createWarning(
  entity: MasterDataEntity,
  legacyTable: string,
  legacyId: number,
  reason: string,
  details?: Record<string, unknown>,
): MigrationWarning {
  return {
    entity,
    legacyTable,
    legacyId,
    reason,
    details,
  };
}

function summarizeCounts<TEntity extends MasterDataEntity>(
  entity: TEntity,
  sourceCount: number,
  records: Array<{
    blockers: MigrationBlocker[];
    archivedPayload: ArchivedFieldPayloadRecord | null;
  }>,
): Record<TEntity, MasterDataCountSummary> {
  return {
    [entity]: {
      source: sourceCount,
      planned: records.length,
      blocked: records.filter((record) => record.blockers.length > 0).length,
      archivedPayloads: records.filter(
        (record) => record.archivedPayload !== null,
      ).length,
    },
  } as Record<TEntity, MasterDataCountSummary>;
}

function resolveLegacyCodes<
  T extends { legacyId: number; sourceCode: string | null; isActive: boolean },
>(
  rows: readonly T[],
  fallbackPrefix: string,
  entity: MasterDataEntity,
): {
  codeByLegacyId: Map<number, string>;
  rewrites: DuplicateRewriteSummary[];
} {
  const resolution = resolveDeterministicCodes(
    rows.map((row) => ({
      legacyId: row.legacyId,
      isActive: row.isActive,
      sourceCode: row.sourceCode,
    })),
    fallbackPrefix,
  );

  return {
    codeByLegacyId: resolution.codeByLegacyId,
    rewrites: resolution.rewrites.map((rewrite) => ({
      entity,
      originalCode: rewrite.originalCode,
      keptLegacyId: rewrite.keptLegacyId,
      rewritten: rewrite.rewritten,
    })),
  };
}

function transformMaterialCategories(
  rows: readonly LegacyMaterialCategoryRow[],
): {
  records: MasterDataMigrationPlan["records"]["materialCategory"];
  warnings: MigrationWarning[];
  duplicateRewrites: DuplicateRewriteSummary[];
} {
  const warnings: MigrationWarning[] = [];
  const { codeByLegacyId, rewrites } = resolveLegacyCodes(
    rows.map((row) => ({
      legacyId: row.dictCode,
      sourceCode: normalizeOptionalText(row.dictValue),
      isActive: String(row.status ?? "0") === "0",
    })),
    "MAT-CAT-LEGACY",
    "materialCategory",
  );

  const records = [...rows]
    .sort(
      (left, right) =>
        left.dictSort - right.dictSort || left.dictCode - right.dictCode,
    )
    .map((row) => {
      const targetCode =
        codeByLegacyId.get(row.dictCode) ??
        buildFallbackCode("MAT-CAT-LEGACY", row.dictCode);
      const blockers: MigrationBlocker[] = [];
      const categoryName = normalizeOptionalText(row.dictLabel);

      if (!categoryName) {
        blockers.push(
          createBlocker(
            "materialCategory",
            "sys_dict_data",
            row.dictCode,
            "Material category label is required.",
            ["dict_label"],
            normalizeOptionalText(row.dictValue),
            String(row.status ?? "0") === "0",
          ),
        );
      }

      return {
        entity: "materialCategory" as const,
        legacyTable: "sys_dict_data",
        legacyId: row.dictCode,
        targetTable: "material_category",
        targetCode,
        target: {
          categoryCode: targetCode,
          categoryName: categoryName ?? `MISSING-CATEGORY-NAME-${row.dictCode}`,
          sortOrder: row.dictSort,
          status: (String(row.status ?? "0") === "0"
            ? "ACTIVE"
            : "DISABLED") as MasterDataStatusValue,
          createdBy: normalizeOptionalText(row.createBy),
          createdAt: row.createTime,
          updatedBy: normalizeOptionalText(row.updateBy),
          updatedAt: row.updateTime,
        },
        archivedPayload: null as ArchivedFieldPayloadRecord | null,
        blockers,
      };
    })
    .map((record) => ({
      ...record,
      archivedPayload:
        record.blockers.length > 0
          ? toBlockedPayload(
              record.legacyTable,
              record.legacyId,
              record.targetTable,
              record.targetCode,
              record.blockers,
              {
                cssClass:
                  rows.find((row) => row.dictCode === record.legacyId)
                    ?.cssClass ?? null,
                listClass:
                  rows.find((row) => row.dictCode === record.legacyId)
                    ?.listClass ?? null,
                isDefault:
                  rows.find((row) => row.dictCode === record.legacyId)
                    ?.isDefault ?? null,
                remark:
                  rows.find((row) => row.dictCode === record.legacyId)
                    ?.remark ?? null,
              },
            )
          : toArchivedPayload(
              record.legacyTable,
              record.legacyId,
              record.targetTable,
              record.targetCode,
              "Archive source-only material category fields.",
              {
                cssClass:
                  rows.find((row) => row.dictCode === record.legacyId)
                    ?.cssClass ?? null,
                listClass:
                  rows.find((row) => row.dictCode === record.legacyId)
                    ?.listClass ?? null,
                isDefault:
                  rows.find((row) => row.dictCode === record.legacyId)
                    ?.isDefault ?? null,
                remark:
                  rows.find((row) => row.dictCode === record.legacyId)
                    ?.remark ?? null,
              },
            ),
    }));

  return {
    records,
    warnings,
    duplicateRewrites: rewrites,
  };
}

function transformWorkshops(rows: readonly LegacyWorkshopRow[]): {
  records: WorkshopPlanRecord[];
  warnings: MigrationWarning[];
} {
  const warnings: MigrationWarning[] = [];
  const records: WorkshopPlanRecord[] = [
    {
      entity: "workshop",
      legacyTable: "migration_default_workshop",
      legacyId: 0,
      targetTable: "workshop",
      targetCode: DEFAULT_WORKSHOP_NAME,
      target: {
        workshopName: DEFAULT_WORKSHOP_NAME,
        status: "ACTIVE",
        createdBy: "migration",
        createdAt: null,
        updatedBy: "migration",
        updatedAt: null,
      },
      archivedPayload: null,
      blockers: [],
      isSyntheticDefault: true,
    },
  ];

  for (const row of [...rows].sort(
    (left, right) => left.workshopId - right.workshopId,
  )) {
    const workshopName = normalizeOptionalText(row.workshopName);
    const blockers: MigrationBlocker[] = [];

    if (!workshopName) {
      blockers.push(
        createBlocker(
          "workshop",
          "saifute_workshop",
          row.workshopId,
          "Workshop name is required.",
          ["workshop_name"],
          null,
          toStatus(row.delFlag) === "ACTIVE",
        ),
      );
    }

    const targetCode =
      workshopName ?? `MISSING-WORKSHOP-NAME-${row.workshopId}`;
    const archivedPayload =
      blockers.length > 0
        ? toBlockedPayload(
            "saifute_workshop",
            row.workshopId,
            "workshop",
            targetCode,
            blockers,
            {
              workshopName: row.workshopName,
              contactPerson: row.contactPerson,
              chargeBy: row.chargeBy,
              delFlag: row.delFlag,
              voidDescription: row.voidDescription,
            },
          )
        : toArchivedPayload(
            "saifute_workshop",
            row.workshopId,
            "workshop",
            targetCode,
            "Archive source-only workshop fields.",
            {
              contactPerson: normalizeOptionalText(row.contactPerson),
              chargeBy: normalizeOptionalText(row.chargeBy),
              voidDescription: normalizeOptionalText(row.voidDescription),
            },
          );

    records.push({
      entity: "workshop",
      legacyTable: "saifute_workshop",
      legacyId: row.workshopId,
      targetTable: "workshop",
      targetCode,
      target: {
        workshopName: targetCode,
        status: toStatus(row.delFlag),
        createdBy: normalizeOptionalText(row.createBy),
        createdAt: row.createTime,
        updatedBy: normalizeOptionalText(row.updateBy),
        updatedAt: row.updateTime,
      },
      archivedPayload,
      blockers,
      isSyntheticDefault: false,
    });
  }

  return {
    records,
    warnings,
  };
}

function transformSuppliers(rows: readonly LegacySupplierRow[]): {
  records: SupplierPlanRecord[];
  warnings: MigrationWarning[];
  duplicateRewrites: DuplicateRewriteSummary[];
} {
  const warnings: MigrationWarning[] = [];
  const { codeByLegacyId, rewrites } = resolveLegacyCodes(
    rows.map((row) => ({
      legacyId: row.supplierId,
      sourceCode: normalizeOptionalText(row.supplierCode),
      isActive: toStatus(row.delFlag) === "ACTIVE",
    })),
    "SUP-LEGACY",
    "supplier",
  );

  const records = [...rows]
    .sort((left, right) => left.supplierId - right.supplierId)
    .map((row) => {
      const supplierName = normalizeOptionalText(row.supplierName);
      const targetCode =
        codeByLegacyId.get(row.supplierId) ??
        buildFallbackCode("SUP-LEGACY", row.supplierId);
      const blockers: MigrationBlocker[] = [];

      if (!supplierName) {
        blockers.push(
          createBlocker(
            "supplier",
            "saifute_supplier",
            row.supplierId,
            "Supplier name is required.",
            ["supplier_name"],
            normalizeOptionalText(row.supplierCode),
            toStatus(row.delFlag) === "ACTIVE",
          ),
        );
      }

      const archivedPayload =
        blockers.length > 0
          ? toBlockedPayload(
              "saifute_supplier",
              row.supplierId,
              "supplier",
              targetCode,
              blockers,
              {
                supplierCode: row.supplierCode,
                supplierName: row.supplierName,
                supplierShortName: row.supplierShortName,
                contactPerson: row.contactPerson,
                contactPhone: row.contactPhone,
                address: row.address,
                delFlag: row.delFlag,
                voidDescription: row.voidDescription,
              },
            )
          : toArchivedPayload(
              "saifute_supplier",
              row.supplierId,
              "supplier",
              targetCode,
              "Archive unmapped supplier legacy fields.",
              {
                voidDescription: normalizeOptionalText(row.voidDescription),
              },
            );

      return {
        entity: "supplier" as const,
        legacyTable: "saifute_supplier",
        legacyId: row.supplierId,
        targetTable: "supplier",
        targetCode,
        target: {
          supplierCode: targetCode,
          supplierName:
            supplierName ?? `MISSING-SUPPLIER-NAME-${row.supplierId}`,
          supplierShortName: normalizeOptionalText(row.supplierShortName),
          contactPerson: normalizeOptionalText(row.contactPerson),
          contactPhone: normalizeOptionalText(row.contactPhone),
          address: normalizeOptionalText(row.address),
          status: toStatus(row.delFlag),
          creationMode: "MANUAL" as const,
          sourceDocumentType: null,
          sourceDocumentId: null,
          createdBy: normalizeOptionalText(row.createBy),
          createdAt: row.createTime,
          updatedBy: normalizeOptionalText(row.updateBy),
          updatedAt: row.updateTime,
        },
        archivedPayload,
        blockers,
      };
    });

  return {
    records,
    warnings,
    duplicateRewrites: rewrites,
  };
}

function transformPersonnel(rows: readonly LegacyPersonnelRow[]): {
  records: PersonnelPlanRecord[];
  warnings: MigrationWarning[];
  duplicateRewrites: DuplicateRewriteSummary[];
} {
  const warnings: MigrationWarning[] = [];
  const { codeByLegacyId, rewrites } = resolveLegacyCodes(
    rows.map((row) => ({
      legacyId: row.personnelId,
      sourceCode: normalizeOptionalText(row.code),
      isActive: toStatus(row.delFlag) === "ACTIVE",
    })),
    "PERS-LEGACY",
    "personnel",
  );

  const records = [...rows]
    .sort((left, right) => left.personnelId - right.personnelId)
    .map((row) => {
      const personnelName = normalizeOptionalText(row.name);
      const targetCode =
        codeByLegacyId.get(row.personnelId) ??
        buildFallbackCode("PERS-LEGACY", row.personnelId);
      const blockers: MigrationBlocker[] = [];

      if (!personnelName) {
        blockers.push(
          createBlocker(
            "personnel",
            "saifute_personnel",
            row.personnelId,
            "Personnel name is required.",
            ["name"],
            normalizeOptionalText(row.code),
            toStatus(row.delFlag) === "ACTIVE",
          ),
        );
      }

      const archivedPayload =
        blockers.length > 0
          ? toBlockedPayload(
              "saifute_personnel",
              row.personnelId,
              "personnel",
              targetCode,
              blockers,
              {
                type: row.type,
                code: row.code,
                name: row.name,
                namePinyin: row.namePinyin,
                contactPhone: row.contactPhone,
                delFlag: row.delFlag,
                voidDescription: row.voidDescription,
              },
            )
          : toArchivedPayload(
              "saifute_personnel",
              row.personnelId,
              "personnel",
              targetCode,
              "Archive source-only personnel fields.",
              {
                type: row.type,
                namePinyin: normalizeOptionalText(row.namePinyin),
                voidDescription: normalizeOptionalText(row.voidDescription),
              },
            );

      return {
        entity: "personnel" as const,
        legacyTable: "saifute_personnel",
        legacyId: row.personnelId,
        targetTable: "personnel",
        targetCode,
        target: {
          personnelName:
            personnelName ?? `MISSING-PERSONNEL-NAME-${row.personnelId}`,
          contactPhone: normalizeOptionalText(row.contactPhone),
          status: toStatus(row.delFlag),
          createdBy: normalizeOptionalText(row.createBy),
          createdAt: row.createTime,
          updatedBy: normalizeOptionalText(row.updateBy),
          updatedAt: row.updateTime,
        },
        archivedPayload,
        blockers,
      };
    });

  return {
    records,
    warnings,
    duplicateRewrites: rewrites,
  };
}

function transformCustomers(rows: readonly LegacyCustomerRow[]): {
  records: CustomerPlanRecord[];
  warnings: MigrationWarning[];
  duplicateRewrites: DuplicateRewriteSummary[];
} {
  const warnings: MigrationWarning[] = [];
  const { codeByLegacyId, rewrites } = resolveLegacyCodes(
    rows.map((row) => ({
      legacyId: row.customerId,
      sourceCode: normalizeOptionalText(row.customerCode),
      isActive: toStatus(row.delFlag) === "ACTIVE",
    })),
    "CUS-LEGACY",
    "customer",
  );

  const existingIds = new Set(rows.map((row) => row.customerId));

  const records = [...rows]
    .sort((left, right) => left.customerId - right.customerId)
    .map((row) => {
      const customerName = normalizeOptionalText(row.customerName);
      const targetCode =
        codeByLegacyId.get(row.customerId) ??
        buildFallbackCode("CUS-LEGACY", row.customerId);
      const blockers: MigrationBlocker[] = [];

      if (!customerName) {
        blockers.push(
          createBlocker(
            "customer",
            "saifute_customer",
            row.customerId,
            "Customer name is required.",
            ["customer_name"],
            normalizeOptionalText(row.customerCode),
            toStatus(row.delFlag) === "ACTIVE",
          ),
        );
      }

      const sourceParentLegacyId =
        row.parentId && row.parentId > 0 ? row.parentId : null;

      if (
        sourceParentLegacyId !== null &&
        !existingIds.has(sourceParentLegacyId)
      ) {
        warnings.push(
          createWarning(
            "customer",
            "saifute_customer",
            row.customerId,
            "Customer parent reference does not exist in legacy source.",
            { sourceParentLegacyId },
          ),
        );
      }

      const archivedPayload =
        blockers.length > 0
          ? toBlockedPayload(
              "saifute_customer",
              row.customerId,
              "customer",
              targetCode,
              blockers,
              {
                customerCode: row.customerCode,
                customerName: row.customerName,
                customerShortName: row.customerShortName,
                customerType: row.customerType,
                parentId: row.parentId,
                contactPerson: row.contactPerson,
                contactPhone: row.contactPhone,
                address: row.address,
                remark: row.remark,
                delFlag: row.delFlag,
                voidDescription: row.voidDescription,
              },
            )
          : toArchivedPayload(
              "saifute_customer",
              row.customerId,
              "customer",
              targetCode,
              "Archive source-only customer fields.",
              {
                customerShortName: normalizeOptionalText(row.customerShortName),
                customerType: normalizeOptionalText(row.customerType),
                remark: normalizeOptionalText(row.remark),
                voidDescription: normalizeOptionalText(row.voidDescription),
              },
            );

      return {
        entity: "customer" as const,
        legacyTable: "saifute_customer",
        legacyId: row.customerId,
        targetTable: "customer",
        targetCode,
        target: {
          customerCode: targetCode,
          customerName:
            customerName ?? `MISSING-CUSTOMER-NAME-${row.customerId}`,
          contactPerson: normalizeOptionalText(row.contactPerson),
          contactPhone: normalizeOptionalText(row.contactPhone),
          address: normalizeOptionalText(row.address),
          status: toStatus(row.delFlag),
          creationMode: "MANUAL" as const,
          sourceDocumentType: null,
          sourceDocumentId: null,
          createdBy: normalizeOptionalText(row.createBy),
          createdAt: row.createTime,
          updatedBy: normalizeOptionalText(row.updateBy),
          updatedAt: row.updateTime,
        },
        archivedPayload,
        blockers,
        sourceParentLegacyId,
      };
    });

  return {
    records,
    warnings,
    duplicateRewrites: rewrites,
  };
}

function transformMaterials(
  rows: readonly LegacyMaterialRow[],
  categoryRecords: MasterDataMigrationPlan["records"]["materialCategory"],
): {
  records: MasterDataMigrationPlan["records"]["material"];
  warnings: MigrationWarning[];
  duplicateRewrites: DuplicateRewriteSummary[];
} {
  const warnings: MigrationWarning[] = [];
  const { codeByLegacyId, rewrites } = resolveLegacyCodes(
    rows.map((row) => ({
      legacyId: row.materialId,
      sourceCode: normalizeOptionalText(row.materialCode),
      isActive: toStatus(row.delFlag) === "ACTIVE",
    })),
    "MAT-LEGACY",
    "material",
  );

  const categoryRecordsByCode = new Map(
    categoryRecords.map(
      (record) => [record.target.categoryCode, record] as const,
    ),
  );

  const records = [...rows]
    .sort((left, right) => left.materialId - right.materialId)
    .map((row) => {
      const materialName = normalizeOptionalText(row.materialName);
      const unitCode = normalizeOptionalText(row.unit);
      const targetCode =
        codeByLegacyId.get(row.materialId) ??
        buildFallbackCode("MAT-LEGACY", row.materialId);
      const blockers: MigrationBlocker[] = [];

      if (!materialName) {
        blockers.push(
          createBlocker(
            "material",
            "saifute_material",
            row.materialId,
            "Material name is required.",
            ["material_name"],
            normalizeOptionalText(row.materialCode),
            toStatus(row.delFlag) === "ACTIVE",
          ),
        );
      }

      if (!unitCode) {
        blockers.push(
          createBlocker(
            "material",
            "saifute_material",
            row.materialId,
            "Material unit is required for migration.",
            ["unit"],
            normalizeOptionalText(row.materialCode),
            toStatus(row.delFlag) === "ACTIVE",
          ),
        );
      }

      const sourceCategoryCode =
        row.category === null
          ? null
          : normalizeOptionalText(String(row.category));

      const sourceCategoryRecord =
        sourceCategoryCode !== null
          ? (categoryRecordsByCode.get(sourceCategoryCode) ?? null)
          : null;

      if (sourceCategoryCode && sourceCategoryRecord === null) {
        blockers.push(
          createBlocker(
            "material",
            "saifute_material",
            row.materialId,
            "Material category could not be mapped to a migrated material category.",
            ["category"],
            normalizeOptionalText(row.materialCode),
            toStatus(row.delFlag) === "ACTIVE",
          ),
        );
      } else if (
        sourceCategoryCode &&
        sourceCategoryRecord !== null &&
        sourceCategoryRecord.blockers.length > 0
      ) {
        blockers.push(
          createBlocker(
            "material",
            "saifute_material",
            row.materialId,
            "Material category points at a blocked material category row.",
            ["category"],
            normalizeOptionalText(row.materialCode),
            toStatus(row.delFlag) === "ACTIVE",
          ),
        );
      }

      const archivedPayload =
        blockers.length > 0
          ? toBlockedPayload(
              "saifute_material",
              row.materialId,
              "material",
              targetCode,
              blockers,
              {
                materialCode: row.materialCode,
                materialName: row.materialName,
                specification: row.specification,
                category: row.category,
                isAttachment: row.isAttachment,
                unit: row.unit,
                isHidden: row.isHidden,
                stockMin: row.stockMin,
                delFlag: row.delFlag,
                voidDescription: row.voidDescription,
              },
            )
          : toArchivedPayload(
              "saifute_material",
              row.materialId,
              "material",
              targetCode,
              "Archive source-only material fields.",
              {
                isAttachment: row.isAttachment,
                isHidden: row.isHidden,
                voidDescription: normalizeOptionalText(row.voidDescription),
                unmatchedCategoryCode:
                  sourceCategoryCode && sourceCategoryRecord === null
                    ? sourceCategoryCode
                    : null,
                blockedCategoryCode:
                  sourceCategoryCode &&
                  sourceCategoryRecord !== null &&
                  sourceCategoryRecord.blockers.length > 0
                    ? sourceCategoryCode
                    : null,
              },
            );

      return {
        entity: "material" as const,
        legacyTable: "saifute_material",
        legacyId: row.materialId,
        targetTable: "material",
        targetCode,
        target: {
          materialCode: targetCode,
          materialName:
            materialName ?? `MISSING-MATERIAL-NAME-${row.materialId}`,
          specModel: normalizeOptionalText(row.specification),
          unitCode: unitCode ?? "",
          warningMinQty: row.stockMin,
          warningMaxQty: null,
          status: toStatus(row.delFlag),
          creationMode: "MANUAL" as const,
          sourceDocumentType: null,
          sourceDocumentId: null,
          createdBy: normalizeOptionalText(row.createBy),
          createdAt: row.createTime,
          updatedBy: normalizeOptionalText(row.updateBy),
          updatedAt: row.updateTime,
        },
        archivedPayload,
        blockers,
        sourceCategoryCode,
      };
    });

  return {
    records,
    warnings,
    duplicateRewrites: rewrites,
  };
}

export function buildMasterDataMigrationPlan(
  snapshot: LegacyMasterDataSnapshot,
): MasterDataMigrationPlan {
  const categoryResult = transformMaterialCategories(
    snapshot.materialCategories,
  );
  const workshopResult = transformWorkshops(snapshot.workshops);
  const supplierResult = transformSuppliers(snapshot.suppliers);
  const personnelResult = transformPersonnel(snapshot.personnel);
  const customerResult = transformCustomers(snapshot.customers);
  const materialResult = transformMaterials(
    snapshot.materials,
    categoryResult.records,
  );

  const records = {
    materialCategory: categoryResult.records,
    workshop: workshopResult.records,
    supplier: supplierResult.records,
    personnel: personnelResult.records,
    customer: customerResult.records,
    material: materialResult.records,
  };

  const blockers: MigrationBlocker[] = [];
  for (const entity of ENTITY_ORDER) {
    for (const record of records[entity]) {
      blockers.push(...record.blockers);
    }
  }

  const warnings = [
    ...categoryResult.warnings,
    ...workshopResult.warnings,
    ...supplierResult.warnings,
    ...personnelResult.warnings,
    ...customerResult.warnings,
    ...materialResult.warnings,
  ].sort(
    (left, right) =>
      left.entity.localeCompare(right.entity) ||
      left.legacyId - right.legacyId ||
      left.reason.localeCompare(right.reason),
  );

  const duplicateRewrites = [
    ...categoryResult.duplicateRewrites,
    ...supplierResult.duplicateRewrites,
    ...personnelResult.duplicateRewrites,
    ...customerResult.duplicateRewrites,
    ...materialResult.duplicateRewrites,
  ].sort(
    (left, right) =>
      left.entity.localeCompare(right.entity) ||
      left.originalCode.localeCompare(right.originalCode) ||
      left.keptLegacyId - right.keptLegacyId,
  );

  const missingMaterialUnitBlockers = blockers.filter(
    (blocker) =>
      blocker.entity === "material" &&
      blocker.reason === "Material unit is required for migration.",
  );

  const counts = {
    ...summarizeCounts(
      "materialCategory",
      snapshot.materialCategories.length,
      records.materialCategory,
    ),
    ...summarizeCounts(
      "workshop",
      snapshot.workshops.length + 1,
      records.workshop,
    ),
    ...summarizeCounts("supplier", snapshot.suppliers.length, records.supplier),
    ...summarizeCounts(
      "personnel",
      snapshot.personnel.length,
      records.personnel,
    ),
    ...summarizeCounts("customer", snapshot.customers.length, records.customer),
    ...summarizeCounts("material", snapshot.materials.length, records.material),
  };

  return {
    migrationBatch: BATCH_NAME,
    entityOrder: ENTITY_ORDER,
    records,
    duplicateRewrites,
    blockers,
    warnings,
    counts,
    context: {
      missingMaterialUnitCount: missingMaterialUnitBlockers.length,
      activeMissingMaterialUnitCount: missingMaterialUnitBlockers.filter(
        (blocker) => blocker.isActive,
      ).length,
    },
  };
}

export function hasExecutionBlockers(plan: MasterDataMigrationPlan): boolean {
  return plan.blockers.length > 0;
}

export function buildDryRunSummary(
  plan: MasterDataMigrationPlan,
): Record<string, unknown> {
  return {
    migrationBatch: plan.migrationBatch,
    entityOrder: plan.entityOrder,
    counts: plan.counts,
    duplicateRewrites: plan.duplicateRewrites,
    blockers: plan.blockers,
    warnings: plan.warnings,
    context: plan.context,
  };
}
