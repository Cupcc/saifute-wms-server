import type { MigrationConnectionLike, QueryResultWithInsertId } from "../db";
import { stableJsonStringify } from "../shared/deterministic";
import type {
  ArchivedFieldPayloadRecord,
  CustomerPlanRecord,
  ExecutionOptions,
  ExecutionResult,
  MasterDataEntity,
  MasterDataMigrationPlan,
  MaterialCategoryPlanRecord,
  MaterialPlanRecord,
  PersonnelPlanRecord,
  SupplierPlanRecord,
  WorkshopPlanRecord,
} from "./types";

export const TARGET_TABLE_BY_ENTITY: Record<MasterDataEntity, string> = {
  materialCategory: "material_category",
  workshop: "workshop",
  supplier: "supplier",
  personnel: "personnel",
  customer: "customer",
  material: "material",
};

export const MAP_TABLE_BY_ENTITY: Record<MasterDataEntity, string> = {
  materialCategory: "map_material_category",
  workshop: "map_workshop",
  supplier: "map_supplier",
  personnel: "map_personnel",
  customer: "map_customer",
  material: "map_material",
};

const ZERO_COUNTS: Record<MasterDataEntity, number> = {
  materialCategory: 0,
  workshop: 0,
  supplier: 0,
  personnel: 0,
  customer: 0,
  material: 0,
};

async function runUpsert(
  connection: MigrationConnectionLike,
  sql: string,
  values: readonly unknown[],
): Promise<number> {
  const result =
    (await connection.query<QueryResultWithInsertId>(sql, values)) ?? {};
  const insertId = Number(result.insertId ?? 0);

  if (!Number.isFinite(insertId) || insertId <= 0) {
    throw new Error("Upsert did not yield a valid target id.");
  }

  return insertId;
}

async function upsertMaterialCategory(
  connection: MigrationConnectionLike,
  record: MaterialCategoryPlanRecord,
): Promise<number> {
  return runUpsert(
    connection,
    `
      INSERT INTO material_category (
        categoryCode,
        categoryName,
        parentId,
        sortOrder,
        status,
        createdBy,
        createdAt,
        updatedBy,
        updatedAt
      ) VALUES (
        ?, ?, NULL, ?, ?, ?, COALESCE(?, CURRENT_TIMESTAMP), ?, COALESCE(?, CURRENT_TIMESTAMP)
      )
      ON DUPLICATE KEY UPDATE
        categoryName = VALUES(categoryName),
        sortOrder = VALUES(sortOrder),
        status = VALUES(status),
        createdBy = VALUES(createdBy),
        createdAt = COALESCE(VALUES(createdAt), createdAt),
        updatedBy = VALUES(updatedBy),
        updatedAt = COALESCE(VALUES(updatedAt), updatedAt),
        id = LAST_INSERT_ID(id)
    `,
    [
      record.target.categoryCode,
      record.target.categoryName,
      record.target.sortOrder,
      record.target.status,
      record.target.createdBy,
      record.target.createdAt,
      record.target.updatedBy,
      record.target.updatedAt,
    ],
  );
}

async function upsertWorkshop(
  connection: MigrationConnectionLike,
  record: WorkshopPlanRecord,
): Promise<number> {
  return runUpsert(
    connection,
    `
      INSERT INTO workshop (
        workshopName,
        status,
        createdBy,
        createdAt,
        updatedBy,
        updatedAt
      ) VALUES (
        ?, ?, ?, COALESCE(?, CURRENT_TIMESTAMP), ?, COALESCE(?, CURRENT_TIMESTAMP)
      )
      ON DUPLICATE KEY UPDATE
        status = VALUES(status),
        createdBy = VALUES(createdBy),
        createdAt = COALESCE(VALUES(createdAt), createdAt),
        updatedBy = VALUES(updatedBy),
        updatedAt = COALESCE(VALUES(updatedAt), updatedAt),
        id = LAST_INSERT_ID(id)
    `,
    [
      record.target.workshopName,
      record.target.status,
      record.target.createdBy,
      record.target.createdAt,
      record.target.updatedBy,
      record.target.updatedAt,
    ],
  );
}

async function upsertSupplier(
  connection: MigrationConnectionLike,
  record: SupplierPlanRecord,
): Promise<number> {
  return runUpsert(
    connection,
    `
      INSERT INTO supplier (
        supplierCode,
        supplierName,
        status,
        creationMode,
        sourceDocumentType,
        sourceDocumentId,
        createdBy,
        createdAt,
        updatedBy,
        updatedAt
      ) VALUES (
        ?, ?, ?, ?, ?, ?, ?, COALESCE(?, CURRENT_TIMESTAMP), ?, COALESCE(?, CURRENT_TIMESTAMP)
      )
      ON DUPLICATE KEY UPDATE
        supplierName = VALUES(supplierName),
        status = VALUES(status),
        creationMode = VALUES(creationMode),
        sourceDocumentType = VALUES(sourceDocumentType),
        sourceDocumentId = VALUES(sourceDocumentId),
        createdBy = VALUES(createdBy),
        createdAt = COALESCE(VALUES(createdAt), createdAt),
        updatedBy = VALUES(updatedBy),
        updatedAt = COALESCE(VALUES(updatedAt), updatedAt),
        id = LAST_INSERT_ID(id)
    `,
    [
      record.target.supplierCode,
      record.target.supplierName,
      record.target.status,
      record.target.creationMode,
      record.target.sourceDocumentType,
      record.target.sourceDocumentId,
      record.target.createdBy,
      record.target.createdAt,
      record.target.updatedBy,
      record.target.updatedAt,
    ],
  );
}

async function upsertPersonnel(
  connection: MigrationConnectionLike,
  record: PersonnelPlanRecord,
): Promise<number> {
  return runUpsert(
    connection,
    `
      INSERT INTO personnel (
        personnelName,
        status,
        createdBy,
        createdAt,
        updatedBy,
        updatedAt
      ) VALUES (
        ?, ?, ?, COALESCE(?, CURRENT_TIMESTAMP), ?, COALESCE(?, CURRENT_TIMESTAMP)
      )
      ON DUPLICATE KEY UPDATE
        personnelName = VALUES(personnelName),
        status = VALUES(status),
        createdBy = VALUES(createdBy),
        createdAt = COALESCE(VALUES(createdAt), createdAt),
        updatedBy = VALUES(updatedBy),
        updatedAt = COALESCE(VALUES(updatedAt), updatedAt),
        id = LAST_INSERT_ID(id)
    `,
    [
      record.target.personnelName,
      record.target.status,
      record.target.createdBy,
      record.target.createdAt,
      record.target.updatedBy,
      record.target.updatedAt,
    ],
  );
}

async function upsertCustomer(
  connection: MigrationConnectionLike,
  record: CustomerPlanRecord,
): Promise<number> {
  return runUpsert(
    connection,
    `
      INSERT INTO customer (
        customerCode,
        customerName,
        parentId,
        status,
        creationMode,
        sourceDocumentType,
        sourceDocumentId,
        createdBy,
        createdAt,
        updatedBy,
        updatedAt
      ) VALUES (
        ?, ?, NULL, ?, ?, ?, ?, ?, COALESCE(?, CURRENT_TIMESTAMP), ?, COALESCE(?, CURRENT_TIMESTAMP)
      )
      ON DUPLICATE KEY UPDATE
        customerName = VALUES(customerName),
        status = VALUES(status),
        creationMode = VALUES(creationMode),
        sourceDocumentType = VALUES(sourceDocumentType),
        sourceDocumentId = VALUES(sourceDocumentId),
        createdBy = VALUES(createdBy),
        createdAt = COALESCE(VALUES(createdAt), createdAt),
        updatedBy = VALUES(updatedBy),
        updatedAt = COALESCE(VALUES(updatedAt), updatedAt),
        id = LAST_INSERT_ID(id)
    `,
    [
      record.target.customerCode,
      record.target.customerName,
      record.target.status,
      record.target.creationMode,
      record.target.sourceDocumentType,
      record.target.sourceDocumentId,
      record.target.createdBy,
      record.target.createdAt,
      record.target.updatedBy,
      record.target.updatedAt,
    ],
  );
}

async function lookupCategoryIdByCode(
  connection: MigrationConnectionLike,
  categoryCode: string,
): Promise<number | null> {
  const rows = await connection.query<Array<{ id: number }>>(
    "SELECT id FROM material_category WHERE categoryCode = ? LIMIT 1",
    [categoryCode],
  );

  return rows[0]?.id ?? null;
}

async function upsertMaterial(
  connection: MigrationConnectionLike,
  record: MaterialPlanRecord,
): Promise<number> {
  const categoryId = record.sourceCategoryCode
    ? await lookupCategoryIdByCode(connection, record.sourceCategoryCode)
    : null;

  return runUpsert(
    connection,
    `
      INSERT INTO material (
        materialCode,
        materialName,
        specModel,
        categoryId,
        unitCode,
        warningMinQty,
        warningMaxQty,
        status,
        creationMode,
        sourceDocumentType,
        sourceDocumentId,
        createdBy,
        createdAt,
        updatedBy,
        updatedAt
      ) VALUES (
        ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, COALESCE(?, CURRENT_TIMESTAMP), ?, COALESCE(?, CURRENT_TIMESTAMP)
      )
      ON DUPLICATE KEY UPDATE
        materialName = VALUES(materialName),
        specModel = VALUES(specModel),
        categoryId = VALUES(categoryId),
        unitCode = VALUES(unitCode),
        warningMinQty = VALUES(warningMinQty),
        warningMaxQty = VALUES(warningMaxQty),
        status = VALUES(status),
        creationMode = VALUES(creationMode),
        sourceDocumentType = VALUES(sourceDocumentType),
        sourceDocumentId = VALUES(sourceDocumentId),
        createdBy = VALUES(createdBy),
        createdAt = COALESCE(VALUES(createdAt), createdAt),
        updatedBy = VALUES(updatedBy),
        updatedAt = COALESCE(VALUES(updatedAt), updatedAt),
        id = LAST_INSERT_ID(id)
    `,
    [
      record.target.materialCode,
      record.target.materialName,
      record.target.specModel,
      categoryId,
      record.target.unitCode,
      record.target.warningMinQty,
      record.target.warningMaxQty,
      record.target.status,
      record.target.creationMode,
      record.target.sourceDocumentType,
      record.target.sourceDocumentId,
      record.target.createdBy,
      record.target.createdAt,
      record.target.updatedBy,
      record.target.updatedAt,
    ],
  );
}

async function upsertMapRow(
  connection: MigrationConnectionLike,
  entity: MasterDataEntity,
  plan: MasterDataMigrationPlan,
  record: {
    legacyTable: string;
    legacyId: number;
    targetTable: string;
    targetCode: string;
  },
  targetId: number,
): Promise<void> {
  const mapTable = MAP_TABLE_BY_ENTITY[entity];

  await connection.query(
    `
      INSERT INTO migration_staging.${mapTable} (
        legacy_table,
        legacy_id,
        target_table,
        target_id,
        target_code,
        migration_batch
      ) VALUES (?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        target_table = VALUES(target_table),
        target_id = VALUES(target_id),
        target_code = VALUES(target_code),
        migration_batch = VALUES(migration_batch)
    `,
    [
      record.legacyTable,
      record.legacyId,
      record.targetTable,
      targetId,
      record.targetCode,
      plan.migrationBatch,
    ],
  );
}

async function upsertArchivedPayload(
  connection: MigrationConnectionLike,
  plan: MasterDataMigrationPlan,
  payload: ArchivedFieldPayloadRecord,
  targetId: number | null,
): Promise<void> {
  await connection.query(
    `
      INSERT INTO migration_staging.archived_field_payload (
        legacy_table,
        legacy_id,
        target_table,
        target_id,
        target_code,
        payload_kind,
        archive_reason,
        payload_json,
        migration_batch
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        target_id = VALUES(target_id),
        target_code = VALUES(target_code),
        payload_kind = VALUES(payload_kind),
        archive_reason = VALUES(archive_reason),
        payload_json = VALUES(payload_json),
        migration_batch = VALUES(migration_batch)
    `,
    [
      payload.legacyTable,
      payload.legacyId,
      payload.targetTable,
      targetId,
      payload.targetCode,
      payload.payloadKind,
      payload.archiveReason,
      stableJsonStringify(payload.payload),
      plan.migrationBatch,
    ],
  );
}

async function upsertEntityRecord(
  connection: MigrationConnectionLike,
  entity: MasterDataEntity,
  record:
    | MaterialCategoryPlanRecord
    | WorkshopPlanRecord
    | SupplierPlanRecord
    | PersonnelPlanRecord
    | CustomerPlanRecord
    | MaterialPlanRecord,
): Promise<number> {
  switch (entity) {
    case "materialCategory":
      return upsertMaterialCategory(
        connection,
        record as MaterialCategoryPlanRecord,
      );
    case "workshop":
      return upsertWorkshop(connection, record as WorkshopPlanRecord);
    case "supplier":
      return upsertSupplier(connection, record as SupplierPlanRecord);
    case "personnel":
      return upsertPersonnel(connection, record as PersonnelPlanRecord);
    case "customer":
      return upsertCustomer(connection, record as CustomerPlanRecord);
    case "material":
      return upsertMaterial(connection, record as MaterialPlanRecord);
  }
}

async function resolveCustomerParents(
  connection: MigrationConnectionLike,
  customerRecords: readonly CustomerPlanRecord[],
  targetIdsByLegacyId: Map<number, number>,
): Promise<void> {
  for (const record of customerRecords) {
    if (record.blockers.length > 0 || record.sourceParentLegacyId === null) {
      continue;
    }

    const targetId = targetIdsByLegacyId.get(record.legacyId);
    const parentTargetId = targetIdsByLegacyId.get(record.sourceParentLegacyId);

    if (!targetId || !parentTargetId || targetId === parentTargetId) {
      continue;
    }

    await connection.query("UPDATE customer SET parentId = ? WHERE id = ?", [
      parentTargetId,
      targetId,
    ]);
  }
}

export async function executeMasterDataPlan(
  connection: MigrationConnectionLike,
  plan: MasterDataMigrationPlan,
  options: ExecutionOptions,
): Promise<ExecutionResult> {
  void options;
  const insertedOrUpdatedCounts = { ...ZERO_COUNTS };
  const skippedBlockedCounts = { ...ZERO_COUNTS };
  const targetIdsByEntity = new Map<MasterDataEntity, Map<number, number>>();
  let archivedPayloadCount = 0;

  for (const entity of plan.entityOrder) {
    targetIdsByEntity.set(entity, new Map<number, number>());
  }

  await connection.beginTransaction();

  try {
    for (const entity of plan.entityOrder) {
      const entityTargetIds = targetIdsByEntity.get(entity);

      if (!entityTargetIds) {
        throw new Error(`Missing target id tracker for entity ${entity}.`);
      }

      for (const record of plan.records[entity]) {
        if (record.blockers.length > 0) {
          skippedBlockedCounts[entity] += 1;
          if (record.archivedPayload) {
            await upsertArchivedPayload(
              connection,
              plan,
              record.archivedPayload,
              null,
            );
            archivedPayloadCount += 1;
          }
          continue;
        }

        const targetId = await upsertEntityRecord(connection, entity, record);
        entityTargetIds.set(record.legacyId, targetId);
        insertedOrUpdatedCounts[entity] += 1;

        await upsertMapRow(connection, entity, plan, record, targetId);

        if (record.archivedPayload) {
          await upsertArchivedPayload(
            connection,
            plan,
            record.archivedPayload,
            targetId,
          );
          archivedPayloadCount += 1;
        }
      }
    }

    await resolveCustomerParents(
      connection,
      plan.records.customer,
      targetIdsByEntity.get("customer") ?? new Map<number, number>(),
    );

    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  }

  return {
    insertedOrUpdatedCounts,
    skippedBlockedCounts,
    archivedPayloadCount,
  };
}
