import type { MigrationConnectionLike } from "../db";
import {
  DEFAULT_WORKSHOP_CODE,
  normalizeOptionalText,
} from "../shared/deterministic";
import type {
  Batch1BaselineSummary,
  LegacyAuditDocumentRow,
  LegacyStockInLineRow,
  LegacyStockInOrderRow,
  LegacyStockInSnapshot,
  MasterDataBaselineEntity,
  ResolvedMaterialDependency,
  ResolvedPersonnelDependency,
  ResolvedSupplierDependency,
  ResolvedWorkshopDependency,
  StockInDependencySnapshot,
} from "./types";
import { BATCH1_MASTER_DATA_BATCH } from "./types";

const EXPECTED_BATCH1_MAP_COUNTS: Record<MasterDataBaselineEntity, number> = {
  materialCategory: 8,
  workshop: 13,
  supplier: 93,
  personnel: 51,
  customer: 184,
  material: 437,
};

const EXPECTED_BLOCKED_MATERIAL_COUNT = 21;

function buildLegacyKey(legacyTable: string, legacyId: number): string {
  return `${legacyTable}::${legacyId}`;
}

export async function readLegacyStockInSnapshot(
  connection: MigrationConnectionLike,
): Promise<LegacyStockInSnapshot> {
  const [inboundOrders, intoOrders, inboundLines, intoLines, audits] =
    await Promise.all([
      connection.query<LegacyStockInOrderRow[]>(
        `
          SELECT
            'saifute_inbound_order' AS legacyTable,
            inbound_id AS legacyId,
            1 AS legacyAuditDocumentType,
            inbound_no AS sourceDocumentNo,
            inbound_type AS sourceOrderTypeValue,
            inbound_date AS bizDate,
            total_amount AS totalAmount,
            supplier_id AS supplierLegacyId,
            workshop_id AS workshopLegacyId,
            charge_by AS chargeBy,
            attn AS handlerName,
            remark,
            del_flag AS delFlag,
            void_description AS voidReason,
            create_by AS createdBy,
            create_time AS createdAt,
            update_by AS updatedBy,
            update_time AS updatedAt
          FROM saifute_inbound_order
          ORDER BY inbound_id ASC
        `,
      ),
      connection.query<LegacyStockInOrderRow[]>(
        `
          SELECT
            'saifute_into_order' AS legacyTable,
            into_id AS legacyId,
            2 AS legacyAuditDocumentType,
            into_no AS sourceDocumentNo,
            into_type AS sourceOrderTypeValue,
            into_date AS bizDate,
            total_amount AS totalAmount,
            NULL AS supplierLegacyId,
            workshop_id AS workshopLegacyId,
            charge_by AS chargeBy,
            attn AS handlerName,
            remark,
            del_flag AS delFlag,
            void_description AS voidReason,
            create_by AS createdBy,
            create_time AS createdAt,
            update_by AS updatedBy,
            update_time AS updatedAt
          FROM saifute_into_order
          ORDER BY into_id ASC
        `,
      ),
      connection.query<LegacyStockInLineRow[]>(
        `
          SELECT
            'saifute_inbound_detail' AS legacyTable,
            detail_id AS legacyId,
            'saifute_inbound_order' AS parentLegacyTable,
            inbound_id AS parentLegacyId,
            material_id AS materialLegacyId,
            quantity,
            unit_price AS unitPrice,
            tax_price AS taxPrice,
            NULL AS \`interval\`,
            remark
          FROM saifute_inbound_detail
          ORDER BY inbound_id ASC, detail_id ASC
        `,
      ),
      connection.query<LegacyStockInLineRow[]>(
        `
          SELECT
            'saifute_into_detail' AS legacyTable,
            detail_id AS legacyId,
            'saifute_into_order' AS parentLegacyTable,
            into_id AS parentLegacyId,
            material_id AS materialLegacyId,
            quantity,
            unit_price AS unitPrice,
            NULL AS taxPrice,
            \`interval\` AS \`interval\`,
            remark
          FROM saifute_into_detail
          ORDER BY into_id ASC, detail_id ASC
        `,
      ),
      connection.query<LegacyAuditDocumentRow[]>(
        `
          SELECT
            audit_id AS legacyId,
            document_type AS documentType,
            document_id AS documentId,
            audit_status AS auditStatus,
            auditor,
            audit_time AS auditTime,
            audit_opinion AS auditOpinion
          FROM saifute_audit_document
          WHERE document_type IN (1, 2)
          ORDER BY document_type ASC, document_id ASC, audit_id ASC
        `,
      ),
    ]);

  return {
    orders: [...inboundOrders, ...intoOrders].sort(
      (left, right) =>
        left.legacyTable.localeCompare(right.legacyTable) ||
        left.legacyId - right.legacyId,
    ),
    lines: [...inboundLines, ...intoLines].sort(
      (left, right) =>
        left.parentLegacyTable.localeCompare(right.parentLegacyTable) ||
        left.parentLegacyId - right.parentLegacyId ||
        left.legacyId - right.legacyId,
    ),
    audits,
  };
}

async function readMappedMaterials(
  connection: MigrationConnectionLike,
): Promise<Map<string, ResolvedMaterialDependency>> {
  const rows = await connection.query<
    Array<{
      legacyTable: string;
      legacyId: number;
      targetId: number;
      materialCode: string;
      materialName: string;
      specModel: string | null;
      unitCode: string;
    }>
  >(
    `
      SELECT
        map_row.legacy_table AS legacyTable,
        map_row.legacy_id AS legacyId,
        map_row.target_id AS targetId,
        material.materialCode AS materialCode,
        material.materialName AS materialName,
        material.specModel AS specModel,
        material.unitCode AS unitCode
      FROM migration_staging.map_material map_row
      INNER JOIN material
        ON material.id = map_row.target_id
      ORDER BY map_row.legacy_table ASC, map_row.legacy_id ASC
    `,
  );
  const materialByLegacyKey = new Map<string, ResolvedMaterialDependency>();

  for (const row of rows) {
    materialByLegacyKey.set(buildLegacyKey(row.legacyTable, row.legacyId), {
      targetId: row.targetId,
      materialCode: row.materialCode,
      materialName: row.materialName,
      specModel: row.specModel,
      unitCode: row.unitCode,
    });
  }

  return materialByLegacyKey;
}

async function readMappedWorkshops(
  connection: MigrationConnectionLike,
): Promise<{
  workshopByLegacyKey: Map<string, ResolvedWorkshopDependency>;
  defaultWorkshop: ResolvedWorkshopDependency | null;
}> {
  const rows = await connection.query<
    Array<{
      legacyTable: string;
      legacyId: number;
      targetId: number;
      workshopCode: string;
      workshopName: string;
    }>
  >(
    `
      SELECT
        map_row.legacy_table AS legacyTable,
        map_row.legacy_id AS legacyId,
        map_row.target_id AS targetId,
        workshop.workshopCode AS workshopCode,
        workshop.workshopName AS workshopName
      FROM migration_staging.map_workshop map_row
      INNER JOIN workshop
        ON workshop.id = map_row.target_id
      ORDER BY map_row.legacy_table ASC, map_row.legacy_id ASC
    `,
  );
  const workshopByLegacyKey = new Map<string, ResolvedWorkshopDependency>();
  let defaultWorkshop: ResolvedWorkshopDependency | null = null;

  for (const row of rows) {
    const dependency = {
      targetId: row.targetId,
      workshopCode: row.workshopCode,
      workshopName: row.workshopName,
    };
    workshopByLegacyKey.set(
      buildLegacyKey(row.legacyTable, row.legacyId),
      dependency,
    );

    if (
      row.legacyTable === "migration_default_workshop" &&
      row.legacyId === 0 &&
      row.workshopCode === DEFAULT_WORKSHOP_CODE
    ) {
      defaultWorkshop = dependency;
    }
  }

  return {
    workshopByLegacyKey,
    defaultWorkshop,
  };
}

async function readMappedSuppliers(
  connection: MigrationConnectionLike,
): Promise<Map<string, ResolvedSupplierDependency>> {
  const rows = await connection.query<
    Array<{
      legacyTable: string;
      legacyId: number;
      targetId: number;
      supplierCode: string;
      supplierName: string;
    }>
  >(
    `
      SELECT
        map_row.legacy_table AS legacyTable,
        map_row.legacy_id AS legacyId,
        map_row.target_id AS targetId,
        supplier.supplierCode AS supplierCode,
        supplier.supplierName AS supplierName
      FROM migration_staging.map_supplier map_row
      INNER JOIN supplier
        ON supplier.id = map_row.target_id
      ORDER BY map_row.legacy_table ASC, map_row.legacy_id ASC
    `,
  );
  const supplierByLegacyKey = new Map<string, ResolvedSupplierDependency>();

  for (const row of rows) {
    supplierByLegacyKey.set(buildLegacyKey(row.legacyTable, row.legacyId), {
      targetId: row.targetId,
      supplierCode: row.supplierCode,
      supplierName: row.supplierName,
    });
  }

  return supplierByLegacyKey;
}

function normalizePersonnelLookupName(
  value: string | null | undefined,
): string | null {
  const normalized = normalizeOptionalText(value);
  return normalized ? normalized.replace(/\s+/gu, " ") : null;
}

async function readPersonnelDependencies(
  connection: MigrationConnectionLike,
): Promise<{
  personnelByNormalizedName: Map<string, ResolvedPersonnelDependency>;
  ambiguousPersonnelNames: Set<string>;
}> {
  const rows = await connection.query<
    Array<{
      targetId: number;
      personnelName: string;
    }>
  >(
    `
      SELECT
        personnel.id AS targetId,
        personnel.personnelName AS personnelName
      FROM migration_staging.map_personnel map_row
      INNER JOIN personnel
        ON personnel.id = map_row.target_id
      WHERE map_row.migration_batch = ?
      ORDER BY map_row.legacy_id ASC
    `,
    [BATCH1_MASTER_DATA_BATCH],
  );
  const groupedPersonnel = new Map<string, ResolvedPersonnelDependency[]>();

  for (const row of rows) {
    const normalizedName = normalizePersonnelLookupName(row.personnelName);

    if (!normalizedName) {
      continue;
    }

    const existingRows = groupedPersonnel.get(normalizedName) ?? [];
    existingRows.push({
      targetId: row.targetId,
      personnelName: row.personnelName,
    });
    groupedPersonnel.set(normalizedName, existingRows);
  }

  const personnelByNormalizedName = new Map<
    string,
    ResolvedPersonnelDependency
  >();
  const ambiguousPersonnelNames = new Set<string>();

  for (const [normalizedName, matches] of groupedPersonnel.entries()) {
    if (matches.length === 1) {
      const [match] = matches;
      if (match) {
        personnelByNormalizedName.set(normalizedName, match);
      }
      continue;
    }

    ambiguousPersonnelNames.add(normalizedName);
  }

  return {
    personnelByNormalizedName,
    ambiguousPersonnelNames,
  };
}

async function readBatch1Baseline(
  connection: MigrationConnectionLike,
): Promise<Batch1BaselineSummary> {
  const mapCountRows = await connection.query<
    Array<{ mapTable: string; total: number }>
  >(
    `
      SELECT 'map_material_category' AS mapTable, COUNT(*) AS total
      FROM migration_staging.map_material_category
      WHERE migration_batch = ?
      UNION ALL
      SELECT 'map_workshop' AS mapTable, COUNT(*) AS total
      FROM migration_staging.map_workshop
      WHERE migration_batch = ?
      UNION ALL
      SELECT 'map_supplier' AS mapTable, COUNT(*) AS total
      FROM migration_staging.map_supplier
      WHERE migration_batch = ?
      UNION ALL
      SELECT 'map_personnel' AS mapTable, COUNT(*) AS total
      FROM migration_staging.map_personnel
      WHERE migration_batch = ?
      UNION ALL
      SELECT 'map_customer' AS mapTable, COUNT(*) AS total
      FROM migration_staging.map_customer
      WHERE migration_batch = ?
      UNION ALL
      SELECT 'map_material' AS mapTable, COUNT(*) AS total
      FROM migration_staging.map_material
      WHERE migration_batch = ?
    `,
    [
      BATCH1_MASTER_DATA_BATCH,
      BATCH1_MASTER_DATA_BATCH,
      BATCH1_MASTER_DATA_BATCH,
      BATCH1_MASTER_DATA_BATCH,
      BATCH1_MASTER_DATA_BATCH,
      BATCH1_MASTER_DATA_BATCH,
    ],
  );
  const blockedMaterialRows = await connection.query<
    Array<{ legacyId: number }>
  >(
    `
      SELECT legacy_id AS legacyId
      FROM migration_staging.archived_field_payload
      WHERE migration_batch = ?
        AND legacy_table = 'saifute_material'
        AND target_table = 'material'
        AND payload_kind = 'blocked-record'
      ORDER BY legacy_id ASC
    `,
    [BATCH1_MASTER_DATA_BATCH],
  );

  const actualMapCounts: Record<MasterDataBaselineEntity, number> = {
    materialCategory: 0,
    workshop: 0,
    supplier: 0,
    personnel: 0,
    customer: 0,
    material: 0,
  };

  for (const row of mapCountRows) {
    switch (row.mapTable) {
      case "map_material_category":
        actualMapCounts.materialCategory = Number(row.total);
        break;
      case "map_workshop":
        actualMapCounts.workshop = Number(row.total);
        break;
      case "map_supplier":
        actualMapCounts.supplier = Number(row.total);
        break;
      case "map_personnel":
        actualMapCounts.personnel = Number(row.total);
        break;
      case "map_customer":
        actualMapCounts.customer = Number(row.total);
        break;
      case "map_material":
        actualMapCounts.material = Number(row.total);
        break;
    }
  }

  const issues: string[] = [];
  for (const [entity, expectedCount] of Object.entries(
    EXPECTED_BATCH1_MAP_COUNTS,
  ) as Array<[MasterDataBaselineEntity, number]>) {
    const actualCount = actualMapCounts[entity];
    if (actualCount !== expectedCount) {
      issues.push(
        `batch1 ${entity} map count mismatch: expected ${expectedCount}, received ${actualCount}.`,
      );
    }
  }

  if (blockedMaterialRows.length !== EXPECTED_BLOCKED_MATERIAL_COUNT) {
    issues.push(
      `batch1 blocked material count mismatch: expected ${EXPECTED_BLOCKED_MATERIAL_COUNT}, received ${blockedMaterialRows.length}.`,
    );
  }

  return {
    expectedMapCounts: EXPECTED_BATCH1_MAP_COUNTS,
    actualMapCounts,
    expectedBlockedMaterialCount: EXPECTED_BLOCKED_MATERIAL_COUNT,
    actualBlockedMaterialCount: blockedMaterialRows.length,
    issues,
  };
}

async function readBlockedMaterialLegacyIds(
  connection: MigrationConnectionLike,
): Promise<Set<number>> {
  const rows = await connection.query<Array<{ legacyId: number }>>(
    `
      SELECT legacy_id AS legacyId
      FROM migration_staging.archived_field_payload
      WHERE migration_batch = ?
        AND legacy_table = 'saifute_material'
        AND target_table = 'material'
        AND payload_kind = 'blocked-record'
      ORDER BY legacy_id ASC
    `,
    [BATCH1_MASTER_DATA_BATCH],
  );

  return new Set(rows.map((row) => row.legacyId));
}

export async function readStockInDependencySnapshot(
  connection: MigrationConnectionLike,
): Promise<StockInDependencySnapshot> {
  const [
    materialByLegacyKey,
    workshopSnapshot,
    supplierByLegacyKey,
    personnelSnapshot,
    batch1Baseline,
    blockedMaterialLegacyIds,
  ] = await Promise.all([
    readMappedMaterials(connection),
    readMappedWorkshops(connection),
    readMappedSuppliers(connection),
    readPersonnelDependencies(connection),
    readBatch1Baseline(connection),
    readBlockedMaterialLegacyIds(connection),
  ]);

  return {
    materialByLegacyKey,
    workshopByLegacyKey: workshopSnapshot.workshopByLegacyKey,
    supplierByLegacyKey,
    defaultWorkshop: workshopSnapshot.defaultWorkshop,
    personnelByNormalizedName: personnelSnapshot.personnelByNormalizedName,
    ambiguousPersonnelNames: personnelSnapshot.ambiguousPersonnelNames,
    blockedMaterialLegacyIds,
    batch1Baseline,
  };
}
