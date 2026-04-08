import type { MigrationConnectionLike } from "../db";
import {
  DEFAULT_WORKSHOP_CODE,
  DEFAULT_WORKSHOP_NAME,
  normalizeOptionalText,
} from "../shared/deterministic";
import type {
  Batch1BaselineSummary,
  LegacyAuditDocumentRow,
  LegacyOutboundLineRow,
  LegacyOutboundOrderRow,
  LegacyOutboundSnapshot,
  MasterDataBaselineEntity,
  OutboundDependencySnapshot,
  ResolvedCustomerDependency,
  ResolvedMaterialDependency,
  ResolvedPersonnelDependency,
  ResolvedWorkshopDependency,
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

export async function readLegacyOutboundSnapshot(
  connection: MigrationConnectionLike,
): Promise<LegacyOutboundSnapshot> {
  const [orders, lines, audits] = await Promise.all([
    connection.query<LegacyOutboundOrderRow[]>(
      `
        SELECT
          'saifute_outbound_order' AS legacyTable,
          outbound_row.outbound_id AS legacyId,
          4 AS legacyAuditDocumentType,
          outbound_row.outbound_no AS sourceDocumentNo,
          outbound_row.customer_id AS customerLegacyId,
          customer.customer_name AS customerName,
          outbound_row.outbound_date AS bizDate,
          outbound_row.charge_by AS chargeBy,
          outbound_row.bookkeeping AS bookkeeping,
          outbound_row.total_amount AS totalAmount,
          outbound_row.remark AS remark,
          outbound_row.del_flag AS delFlag,
          outbound_row.void_description AS voidReason,
          outbound_row.create_by AS createdBy,
          outbound_row.create_time AS createdAt,
          outbound_row.update_by AS updatedBy,
          outbound_row.update_time AS updatedAt
        FROM saifute_outbound_order outbound_row
        LEFT JOIN saifute_customer customer
          ON customer.customer_id = outbound_row.customer_id
        ORDER BY outbound_row.outbound_id ASC
      `,
    ),
    connection.query<LegacyOutboundLineRow[]>(
      `
        SELECT
          'saifute_outbound_detail' AS legacyTable,
          detail_id AS legacyId,
          'saifute_outbound_order' AS parentLegacyTable,
          outbound_id AS parentLegacyId,
          material_id AS materialLegacyId,
          quantity,
          unit_price AS unitPrice,
          \`interval\` AS \`interval\`,
          remark
        FROM saifute_outbound_detail
        ORDER BY outbound_id ASC, detail_id ASC
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
        WHERE document_type = 4
        ORDER BY document_id ASC, audit_id ASC
      `,
    ),
  ]);

  return {
    orders,
    lines,
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

async function readMappedCustomers(
  connection: MigrationConnectionLike,
): Promise<Map<string, ResolvedCustomerDependency>> {
  const rows = await connection.query<
    Array<{
      legacyTable: string;
      legacyId: number;
      targetId: number;
      customerCode: string;
      customerName: string;
    }>
  >(
    `
      SELECT
        map_row.legacy_table AS legacyTable,
        map_row.legacy_id AS legacyId,
        map_row.target_id AS targetId,
        customer.customerCode AS customerCode,
        customer.customerName AS customerName
      FROM migration_staging.map_customer map_row
      INNER JOIN customer
        ON customer.id = map_row.target_id
      ORDER BY map_row.legacy_table ASC, map_row.legacy_id ASC
    `,
  );
  const customerByLegacyKey = new Map<string, ResolvedCustomerDependency>();

  for (const row of rows) {
    customerByLegacyKey.set(buildLegacyKey(row.legacyTable, row.legacyId), {
      targetId: row.targetId,
      customerCode: row.customerCode,
      customerName: row.customerName,
    });
  }

  return customerByLegacyKey;
}

async function readMappedWorkshops(
  connection: MigrationConnectionLike,
): Promise<ResolvedWorkshopDependency | null> {
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

  for (const row of rows) {
    if (
      row.legacyTable === "migration_default_workshop" &&
      row.legacyId === 0 &&
      row.workshopCode === DEFAULT_WORKSHOP_CODE
    ) {
      return {
        targetId: row.targetId,
        workshopCode: row.workshopCode,
        workshopName: row.workshopName,
      };
    }
  }

  return null;
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

export async function readOutboundDependencySnapshot(
  connection: MigrationConnectionLike,
): Promise<OutboundDependencySnapshot> {
  const [
    materialByLegacyKey,
    customerByLegacyKey,
    defaultWorkshop,
    personnelSnapshot,
    batch1Baseline,
    blockedMaterialLegacyIds,
  ] = await Promise.all([
    readMappedMaterials(connection),
    readMappedCustomers(connection),
    readMappedWorkshops(connection),
    readPersonnelDependencies(connection),
    readBatch1Baseline(connection),
    readBlockedMaterialLegacyIds(connection),
  ]);

  return {
    materialByLegacyKey,
    customerByLegacyKey,
    defaultWorkshop,
    personnelByNormalizedName: personnelSnapshot.personnelByNormalizedName,
    ambiguousPersonnelNames: personnelSnapshot.ambiguousPersonnelNames,
    blockedMaterialLegacyIds,
    batch1Baseline,
  };
}

export const OUTBOUND_DEFAULT_WORKSHOP_EXPECTATION = {
  code: DEFAULT_WORKSHOP_CODE,
  name: DEFAULT_WORKSHOP_NAME,
} as const;
