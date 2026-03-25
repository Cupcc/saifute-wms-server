import type { MigrationConnectionLike } from "../db";
import {
  DEFAULT_WORKSHOP_CODE,
  DEFAULT_WORKSHOP_NAME,
  normalizeOptionalText,
} from "../shared/deterministic";
import type {
  Batch1BaselineSummary,
  LegacyProjectLineRow,
  LegacyProjectRow,
  LegacyProjectSnapshot,
  MasterDataBaselineEntity,
  ProjectAutoCreatedMaterialConflict,
  ProjectDependencySnapshot,
  ResolvedCustomerDependency,
  ResolvedMaterialDependency,
  ResolvedPersonnelDependency,
  ResolvedWorkshopDependency,
} from "./types";
import {
  BATCH1_MASTER_DATA_BATCH,
  PROJECT_AUTO_CREATED_MATERIAL_SOURCE_DOCUMENT_TYPE,
} from "./types";

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

function buildNormalizedNameSpecUnitKey(
  name: string | null | undefined,
  spec: string | null | undefined,
  unit: string | null | undefined,
): string {
  const normalizedName = normalizeOptionalText(name) ?? "";
  const normalizedSpec = normalizeOptionalText(spec) ?? "";
  const normalizedUnit = normalizeOptionalText(unit) ?? "";
  return `${normalizedName}|${normalizedSpec}|${normalizedUnit}`;
}

export async function readLegacyProjectSnapshot(
  connection: MigrationConnectionLike,
): Promise<LegacyProjectSnapshot> {
  const [projects, lines] = await Promise.all([
    connection.query<LegacyProjectRow[]>(
      `
        SELECT
          'saifute_composite_product' AS legacyTable,
          project_row.product_id AS legacyId,
          project_row.product_name AS projectName,
          project_row.customer_id AS customerLegacyId,
          customer.customer_name AS customerName,
          project_row.classification AS classification,
          project_row.salesman AS salesman,
          project_row.total_amount AS totalAmount,
          project_row.order_date AS orderDate,
          project_row.out_bound_date AS outBoundDate,
          project_row.remark AS remark,
          project_row.del_flag AS delFlag,
          project_row.create_by AS createdBy,
          project_row.create_time AS createdAt,
          project_row.update_by AS updatedBy,
          project_row.update_time AS updatedAt
        FROM saifute_composite_product project_row
        LEFT JOIN saifute_customer customer
          ON customer.customer_id = project_row.customer_id
        ORDER BY project_row.product_id ASC
      `,
    ),
    connection.query<LegacyProjectLineRow[]>(
      `
        SELECT
          'saifute_product_material' AS legacyTable,
          line_row.id AS legacyId,
          'saifute_composite_product' AS parentLegacyTable,
          line_row.product_id AS parentLegacyId,
          line_row.material_id AS materialLegacyId,
          line_row.material_name AS materialName,
          line_row.specification AS materialSpec,
          line_row.quantity AS quantity,
          line_row.unit_price AS unitPrice,
          line_row.instruction AS instruction,
          line_row.\`interval\` AS \`interval\`,
          line_row.remark AS remark,
          line_row.acceptance_date AS acceptanceDate,
          line_row.supplier_id AS supplierLegacyId,
          line_row.unit AS unit,
          line_row.tax_included_price AS taxIncludedPrice
        FROM saifute_product_material line_row
        ORDER BY line_row.product_id ASC, line_row.id ASC
      `,
    ),
  ]);

  return {
    projects,
    lines,
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

async function readProjectAutoCreatedMaterials(
  connection: MigrationConnectionLike,
): Promise<{
  autoCreatedMaterialByNormalizedKey: Map<string, ResolvedMaterialDependency>;
  autoCreatedMaterialConflicts: ProjectAutoCreatedMaterialConflict[];
}> {
  const rows = await connection.query<
    Array<{
      targetId: number;
      materialCode: string;
      materialName: string;
      specModel: string | null;
      unitCode: string;
    }>
  >(
    `
      SELECT
        material.id AS targetId,
        material.materialCode AS materialCode,
        material.materialName AS materialName,
        material.specModel AS specModel,
        material.unitCode AS unitCode
      FROM material
      WHERE material.creationMode = 'AUTO_CREATED'
        AND material.sourceDocumentType = ?
      ORDER BY material.materialCode ASC
    `,
    [PROJECT_AUTO_CREATED_MATERIAL_SOURCE_DOCUMENT_TYPE],
  );
  const groupedRows = new Map<string, ResolvedMaterialDependency[]>();

  for (const row of rows) {
    const key = buildNormalizedNameSpecUnitKey(
      row.materialName,
      row.specModel,
      row.unitCode,
    );
    const existingRows = groupedRows.get(key) ?? [];
    existingRows.push({
      targetId: row.targetId,
      materialCode: row.materialCode,
      materialName: row.materialName,
      specModel: row.specModel,
      unitCode: row.unitCode,
    });
    groupedRows.set(key, existingRows);
  }

  const autoCreatedMaterialByNormalizedKey = new Map<
    string,
    ResolvedMaterialDependency
  >();
  const autoCreatedMaterialConflicts: ProjectAutoCreatedMaterialConflict[] = [];

  for (const [normalizedKey, matches] of [...groupedRows.entries()].sort(
    ([left], [right]) => left.localeCompare(right),
  )) {
    if (matches.length === 1) {
      const [match] = matches;
      if (match) {
        autoCreatedMaterialByNormalizedKey.set(normalizedKey, match);
      }
      continue;
    }

    autoCreatedMaterialConflicts.push({
      normalizedKey,
      materialCodes: matches
        .map((match) => match.materialCode)
        .sort((left, right) => left.localeCompare(right)),
    });
  }

  return {
    autoCreatedMaterialByNormalizedKey,
    autoCreatedMaterialConflicts,
  };
}

async function readExistingMaterialCodes(
  connection: MigrationConnectionLike,
): Promise<Set<string>> {
  const rows = await connection.query<Array<{ materialCode: string }>>(
    `
      SELECT materialCode
      FROM material
      ORDER BY materialCode ASC
    `,
  );

  return new Set(rows.map((row) => row.materialCode));
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
      personnelCode: string;
      personnelName: string;
    }>
  >(
    `
      SELECT
        personnel.id AS targetId,
        personnel.personnelCode AS personnelCode,
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
      personnelCode: row.personnelCode,
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

export async function readProjectDependencySnapshot(
  connection: MigrationConnectionLike,
): Promise<ProjectDependencySnapshot> {
  const [
    materialByLegacyKey,
    projectAutoCreatedMaterialSnapshot,
    existingMaterialCodes,
    customerByLegacyKey,
    defaultWorkshop,
    personnelSnapshot,
    batch1Baseline,
    blockedMaterialLegacyIds,
  ] = await Promise.all([
    readMappedMaterials(connection),
    readProjectAutoCreatedMaterials(connection),
    readExistingMaterialCodes(connection),
    readMappedCustomers(connection),
    readMappedWorkshops(connection),
    readPersonnelDependencies(connection),
    readBatch1Baseline(connection),
    readBlockedMaterialLegacyIds(connection),
  ]);

  return {
    materialByLegacyKey,
    autoCreatedMaterialByNormalizedKey:
      projectAutoCreatedMaterialSnapshot.autoCreatedMaterialByNormalizedKey,
    autoCreatedMaterialConflicts:
      projectAutoCreatedMaterialSnapshot.autoCreatedMaterialConflicts,
    existingMaterialCodes,
    customerByLegacyKey,
    defaultWorkshop,
    personnelByNormalizedName: personnelSnapshot.personnelByNormalizedName,
    ambiguousPersonnelNames: personnelSnapshot.ambiguousPersonnelNames,
    blockedMaterialLegacyIds,
    batch1Baseline,
  };
}

export const PROJECT_DEFAULT_WORKSHOP_EXPECTATION = {
  code: DEFAULT_WORKSHOP_CODE,
  name: DEFAULT_WORKSHOP_NAME,
} as const;
