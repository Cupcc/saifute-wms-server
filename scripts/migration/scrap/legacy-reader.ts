import type { MigrationConnectionLike } from "../db";
import {
  DEFAULT_WORKSHOP_CODE,
  DEFAULT_WORKSHOP_NAME,
  normalizeOptionalText,
} from "../shared/deterministic";
import type {
  Batch1BaselineSummary,
  LegacyScrapDetailRow,
  LegacyScrapOrderRow,
  LegacyScrapSnapshot,
  MasterDataBaselineEntity,
  ResolvedMaterialDependency,
  ResolvedPersonnelDependency,
  ResolvedWorkshopDependency,
  ScrapDependencySnapshot,
} from "./types";
import { BATCH1_MASTER_DATA_BATCH } from "./types";

const REQUIRED_BATCH1_MAP_ENTITIES: MasterDataBaselineEntity[] = [
  "materialCategory",
  "workshop",
  "supplier",
  "personnel",
  "customer",
  "material",
];

const EXPECTED_BLOCKED_MATERIAL_COUNT = 0;

function buildLegacyKey(legacyTable: string, legacyId: number): string {
  return `${legacyTable}::${legacyId}`;
}

export async function readLegacyScrapSnapshot(
  connection: MigrationConnectionLike,
): Promise<LegacyScrapSnapshot> {
  const [orders, details] = await Promise.all([
    connection.query<LegacyScrapOrderRow[]>(
      `
        SELECT
          'saifute_scrap_order' AS legacyTable,
          scrap_id AS legacyId,
          scrap_no AS sourceDocumentNo,
          scrap_date AS bizDate,
          disposal_method AS disposalMethod,
          charge_by AS chargeBy,
          attn,
          remark,
          del_flag AS delFlag,
          void_description AS voidReason,
          create_by AS createdBy,
          create_time AS createdAt,
          update_by AS updatedBy,
          update_time AS updatedAt
        FROM saifute_scrap_order
        ORDER BY scrap_id ASC
      `,
    ),
    connection.query<LegacyScrapDetailRow[]>(
      `
        SELECT
          'saifute_scrap_detail' AS legacyTable,
          detail_id AS legacyId,
          'saifute_scrap_order' AS parentLegacyTable,
          scrap_id AS parentLegacyId,
          material_id AS materialLegacyId,
          scrap_qty AS quantity,
          unit,
          estimated_loss AS estimatedLoss,
          scrap_reason AS scrapReason,
          remark
        FROM saifute_scrap_detail
        ORDER BY scrap_id ASC, detail_id ASC
      `,
    ),
  ]);

  return { orders, details };
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
        material.material_code AS materialCode,
        material.material_name AS materialName,
        material.spec_model AS specModel,
        material.unit_code AS unitCode
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

async function readDefaultWorkshop(
  connection: MigrationConnectionLike,
): Promise<ResolvedWorkshopDependency | null> {
  const rows = await connection.query<
    Array<{
      targetId: number;
      workshopCode: string;
      workshopName: string;
    }>
  >(
    `
      SELECT
        map_row.target_id AS targetId,
        ? AS workshopCode,
        workshop.workshop_name AS workshopName
      FROM migration_staging.map_workshop map_row
      INNER JOIN workshop
        ON workshop.id = map_row.target_id
      WHERE map_row.legacy_table = 'migration_default_workshop'
        AND map_row.legacy_id = 0
    `,
    [DEFAULT_WORKSHOP_CODE],
  );

  if (rows.length === 0) {
    return null;
  }

  const row = rows[0];
  return row
    ? {
        targetId: row.targetId,
        workshopCode: row.workshopCode,
        workshopName: row.workshopName,
      }
    : null;
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
      personnelCode: string;
      personnelName: string;
    }>
  >(
    `
      SELECT
        personnel.id AS targetId,
        CAST(map_row.legacy_id AS CHAR) AS personnelCode,
        personnel.personnel_name AS personnelName
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
    if (
      !existingRows.some((existingRow) => existingRow.targetId === row.targetId)
    ) {
      existingRows.push({
        targetId: row.targetId,
        personnelCode: row.personnelCode,
        personnelName: row.personnelName,
      });
    }
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

  return { personnelByNormalizedName, ambiguousPersonnelNames };
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
    Array.from({ length: 6 }, () => BATCH1_MASTER_DATA_BATCH),
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
  for (const entity of REQUIRED_BATCH1_MAP_ENTITIES) {
    const actualCount = actualMapCounts[entity];
    if (actualCount <= 0) {
      issues.push(
        `batch1 ${entity} map is empty; run master-data execute before this migration slice.`,
      );
    }
  }

  if (blockedMaterialRows.length !== EXPECTED_BLOCKED_MATERIAL_COUNT) {
    issues.push(
      `batch1 blocked material count mismatch: expected ${EXPECTED_BLOCKED_MATERIAL_COUNT}, received ${blockedMaterialRows.length}.`,
    );
  }

  return {
    expectedMapCounts: { ...actualMapCounts },
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

export async function readScrapDependencySnapshot(
  connection: MigrationConnectionLike,
): Promise<ScrapDependencySnapshot> {
  const [
    materialByLegacyKey,
    defaultWorkshop,
    personnelSnapshot,
    batch1Baseline,
    blockedMaterialLegacyIds,
  ] = await Promise.all([
    readMappedMaterials(connection),
    readDefaultWorkshop(connection),
    readPersonnelDependencies(connection),
    readBatch1Baseline(connection),
    readBlockedMaterialLegacyIds(connection),
  ]);

  return {
    materialByLegacyKey,
    defaultWorkshop,
    personnelByNormalizedName: personnelSnapshot.personnelByNormalizedName,
    ambiguousPersonnelNames: personnelSnapshot.ambiguousPersonnelNames,
    blockedMaterialLegacyIds,
    batch1Baseline,
  };
}

export const SCRAP_DEFAULT_WORKSHOP_EXPECTATION = {
  code: DEFAULT_WORKSHOP_CODE,
  name: DEFAULT_WORKSHOP_NAME,
} as const;
