export type MasterDataEntity =
  | "materialCategory"
  | "workshop"
  | "supplier"
  | "personnel"
  | "customer"
  | "material";

export type MasterDataStatusValue = "ACTIVE" | "DISABLED";

export interface LegacyMaterialCategoryRow {
  dictCode: number;
  dictSort: number;
  dictLabel: string | null;
  dictValue: string | null;
  dictType: string;
  status: string | null;
  cssClass: string | null;
  listClass: string | null;
  isDefault: string | null;
  remark: string | null;
  createBy: string | null;
  createTime: string | null;
  updateBy: string | null;
  updateTime: string | null;
}

export interface LegacyWorkshopRow {
  workshopId: number;
  workshopName: string | null;
  contactPerson: string | null;
  chargeBy: string | null;
  delFlag: number | null;
  voidDescription: string | null;
  createBy: string | null;
  createTime: string | null;
  updateBy: string | null;
  updateTime: string | null;
}

export interface LegacySupplierRow {
  supplierId: number;
  supplierCode: string | null;
  supplierName: string | null;
  supplierShortName: string | null;
  contactPerson: string | null;
  contactPhone: string | null;
  address: string | null;
  delFlag: number | null;
  voidDescription: string | null;
  createBy: string | null;
  createTime: string | null;
  updateBy: string | null;
  updateTime: string | null;
}

export interface LegacyPersonnelRow {
  personnelId: number;
  type: number | null;
  code: string | null;
  name: string | null;
  namePinyin: string | null;
  contactPhone: string | null;
  delFlag: number | null;
  voidDescription: string | null;
  createBy: string | null;
  createTime: string | null;
  updateBy: string | null;
  updateTime: string | null;
}

export interface LegacyCustomerRow {
  customerId: number;
  customerCode: string | null;
  customerName: string | null;
  customerShortName: string | null;
  customerType: string | null;
  parentId: number | null;
  contactPerson: string | null;
  contactPhone: string | null;
  address: string | null;
  remark: string | null;
  delFlag: number | null;
  voidDescription: string | null;
  createBy: string | null;
  createTime: string | null;
  updateBy: string | null;
  updateTime: string | null;
}

export interface LegacyMaterialRow {
  materialId: number;
  materialCode: string | null;
  materialName: string | null;
  specification: string | null;
  category: number | null;
  isAttachment: number | null;
  unit: string | null;
  isHidden: number | null;
  stockMin: string | number | null;
  delFlag: number | null;
  voidDescription: string | null;
  createBy: string | null;
  createTime: string | null;
  updateBy: string | null;
  updateTime: string | null;
}

export interface LegacyMasterDataSnapshot {
  materialCategories: LegacyMaterialCategoryRow[];
  workshops: LegacyWorkshopRow[];
  suppliers: LegacySupplierRow[];
  personnel: LegacyPersonnelRow[];
  customers: LegacyCustomerRow[];
  materials: LegacyMaterialRow[];
}

export interface MaterialCategoryTargetInsert {
  categoryCode: string;
  categoryName: string;
  sortOrder: number;
  status: MasterDataStatusValue;
  createdBy: string | null;
  createdAt: string | null;
  updatedBy: string | null;
  updatedAt: string | null;
}

export interface WorkshopTargetInsert {
  workshopName: string;
  status: MasterDataStatusValue;
  createdBy: string | null;
  createdAt: string | null;
  updatedBy: string | null;
  updatedAt: string | null;
}

export interface SupplierTargetInsert {
  supplierCode: string;
  supplierName: string;
  supplierShortName: string | null;
  contactPerson: string | null;
  contactPhone: string | null;
  address: string | null;
  status: MasterDataStatusValue;
  creationMode: "MANUAL";
  sourceDocumentType: null;
  sourceDocumentId: null;
  createdBy: string | null;
  createdAt: string | null;
  updatedBy: string | null;
  updatedAt: string | null;
}

export interface PersonnelTargetInsert {
  personnelName: string;
  contactPhone: string | null;
  status: MasterDataStatusValue;
  createdBy: string | null;
  createdAt: string | null;
  updatedBy: string | null;
  updatedAt: string | null;
}

export interface CustomerTargetInsert {
  customerCode: string;
  customerName: string;
  status: MasterDataStatusValue;
  creationMode: "MANUAL";
  sourceDocumentType: null;
  sourceDocumentId: null;
  createdBy: string | null;
  createdAt: string | null;
  updatedBy: string | null;
  updatedAt: string | null;
}

export interface MaterialTargetInsert {
  materialCode: string;
  materialName: string;
  specModel: string | null;
  unitCode: string;
  warningMinQty: string | number | null;
  warningMaxQty: null;
  status: MasterDataStatusValue;
  creationMode: "MANUAL";
  sourceDocumentType: null;
  sourceDocumentId: null;
  createdBy: string | null;
  createdAt: string | null;
  updatedBy: string | null;
  updatedAt: string | null;
}

export interface MigrationBlocker {
  entity: MasterDataEntity;
  legacyTable: string;
  legacyId: number;
  reason: string;
  fields: string[];
  legacyCode: string | null;
  isActive: boolean;
}

export interface MigrationWarning {
  entity: MasterDataEntity;
  legacyTable: string;
  legacyId: number;
  reason: string;
  details?: Record<string, unknown>;
}

export interface DuplicateRewriteSummary {
  entity: MasterDataEntity;
  originalCode: string;
  keptLegacyId: number;
  rewritten: Array<{
    legacyId: number;
    rewrittenCode: string;
  }>;
}

export interface ArchivedFieldPayloadRecord {
  legacyTable: string;
  legacyId: number;
  targetTable: string;
  targetCode: string;
  archiveReason: string;
  payloadKind: "legacy-unmapped-fields" | "blocked-record";
  payload: Record<string, unknown>;
}

interface BasePlanRecord<TEntity extends MasterDataEntity, TTarget> {
  entity: TEntity;
  legacyTable: string;
  legacyId: number;
  targetTable: string;
  targetCode: string;
  target: TTarget;
  archivedPayload: ArchivedFieldPayloadRecord | null;
  blockers: MigrationBlocker[];
}

export interface MaterialCategoryPlanRecord
  extends BasePlanRecord<"materialCategory", MaterialCategoryTargetInsert> {}

export interface WorkshopPlanRecord
  extends BasePlanRecord<"workshop", WorkshopTargetInsert> {
  isSyntheticDefault: boolean;
}

export interface SupplierPlanRecord
  extends BasePlanRecord<"supplier", SupplierTargetInsert> {}

export interface PersonnelPlanRecord
  extends BasePlanRecord<"personnel", PersonnelTargetInsert> {}

export interface CustomerPlanRecord
  extends BasePlanRecord<"customer", CustomerTargetInsert> {
  sourceParentLegacyId: number | null;
}

export interface MaterialPlanRecord
  extends BasePlanRecord<"material", MaterialTargetInsert> {
  sourceCategoryCode: string | null;
}

export interface MasterDataPlanRecordMap {
  materialCategory: MaterialCategoryPlanRecord[];
  workshop: WorkshopPlanRecord[];
  supplier: SupplierPlanRecord[];
  personnel: PersonnelPlanRecord[];
  customer: CustomerPlanRecord[];
  material: MaterialPlanRecord[];
}

export interface MasterDataCountSummary {
  source: number;
  planned: number;
  blocked: number;
  archivedPayloads: number;
}

export interface MasterDataMigrationPlan {
  migrationBatch: string;
  entityOrder: MasterDataEntity[];
  records: MasterDataPlanRecordMap;
  duplicateRewrites: DuplicateRewriteSummary[];
  blockers: MigrationBlocker[];
  warnings: MigrationWarning[];
  counts: Record<MasterDataEntity, MasterDataCountSummary>;
  context: {
    missingMaterialUnitCount: number;
    activeMissingMaterialUnitCount: number;
  };
}

export interface ExecutionOptions {
  allowBlockers: boolean;
}

export interface ExecutionResult {
  insertedOrUpdatedCounts: Record<MasterDataEntity, number>;
  skippedBlockedCounts: Record<MasterDataEntity, number>;
  archivedPayloadCount: number;
}
