import type { MigrationConnectionLike } from "../db";
import { normalizeOptionalText } from "../shared/deterministic";
import type {
  Batch1BaselineSummary,
  CurrentOutboundLineRecord,
  LegacyInventoryUsedRow,
  LegacySalesReturnAuditRow,
  LegacySalesReturnDetailRow,
  LegacySalesReturnOrderRow,
  LegacySalesReturnSnapshot,
  MasterDataBaselineEntity,
  OutboundBaseBaselineSummary,
  ResolvedCustomerDependency,
  ResolvedMaterialDependency,
  ResolvedPersonnelDependency,
  ResolvedWorkshopDependency,
  SalesReturnDependencySnapshot,
} from "./types";
import {
  BATCH1_MASTER_DATA_BATCH,
  OUTBOUND_BASE_MIGRATION_BATCH,
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
const EXPECTED_OUTBOUND_BASE_ORDER_MAP_COUNT = 108;
const EXPECTED_OUTBOUND_BASE_LINE_MAP_COUNT = 137;
const EXPECTED_OUTBOUND_BASE_EXCLUDED_DOCUMENT_COUNT = 4;

function buildLegacyKey(legacyTable: string, legacyId: number): string {
  return `${legacyTable}::${legacyId}`;
}

export async function readLegacySalesReturnSnapshot(
  connection: MigrationConnectionLike,
): Promise<LegacySalesReturnSnapshot> {
  const [orders, details, audits, inventoryUsedRows] = await Promise.all([
    connection.query<LegacySalesReturnOrderRow[]>(
      `
        SELECT
          'saifute_sales_return_order' AS legacyTable,
          return_id AS legacyId,
          return_no AS returnNo,
          return_date AS returnDate,
          customer_id AS customerLegacyId,
          source_type AS sourceType,
          source_id AS sourceLegacyId,
          charge_by AS chargeBy,
          attn,
          total_amount AS totalAmount,
          remark,
          del_flag AS delFlag,
          void_description AS voidDescription,
          create_by AS createdBy,
          create_time AS createdAt,
          update_by AS updatedBy,
          update_time AS updatedAt
        FROM saifute_sales_return_order
        ORDER BY return_id ASC
      `,
    ),
    connection.query<LegacySalesReturnDetailRow[]>(
      `
        SELECT
          'saifute_sales_return_detail' AS legacyTable,
          detail_id AS legacyId,
          'saifute_sales_return_order' AS parentLegacyTable,
          return_id AS parentLegacyId,
          material_id AS materialLegacyId,
          return_qty AS returnQty,
          unit,
          unit_price AS unitPrice,
          \`interval\` AS \`interval\`,
          remark
        FROM saifute_sales_return_detail
        ORDER BY return_id ASC, detail_id ASC
      `,
    ),
    connection.query<LegacySalesReturnAuditRow[]>(
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
        WHERE document_type = 7
        ORDER BY document_id ASC, audit_id ASC
      `,
    ),
    connection.query<LegacyInventoryUsedRow[]>(
      `
        SELECT
          used_id AS usedId,
          material_id AS materialId,
          before_order_type AS beforeOrderType,
          before_order_id AS beforeOrderId,
          before_detail_id AS beforeDetailId,
          after_order_type AS afterOrderType,
          after_order_id AS afterOrderId,
          after_detail_id AS afterDetailId
        FROM saifute_inventory_used
        WHERE before_order_type = 7
           OR after_order_type = 7
        ORDER BY used_id ASC
      `,
    ),
  ]);

  const inventoryUsedByDetailId = new Map<number, LegacyInventoryUsedRow[]>();

  for (const row of inventoryUsedRows) {
    if (row.beforeOrderType === 7 && row.beforeDetailId !== null) {
      const existing = inventoryUsedByDetailId.get(row.beforeDetailId) ?? [];
      existing.push(row);
      inventoryUsedByDetailId.set(row.beforeDetailId, existing);
    }
  }

  return {
    orders,
    details,
    audits,
    inventoryUsedByDetailId,
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

async function readOutboundBaseBaseline(
  connection: MigrationConnectionLike,
): Promise<OutboundBaseBaselineSummary> {
  const [countRows, excludedRows] = await Promise.all([
    connection.query<Array<{ tableName: string; total: number }>>(
      `
        SELECT 'map_customer_stock_order' AS tableName, COUNT(*) AS total
        FROM migration_staging.map_customer_stock_order
        WHERE migration_batch = ?
        UNION ALL
        SELECT 'map_customer_stock_order_line' AS tableName, COUNT(*) AS total
        FROM migration_staging.map_customer_stock_order_line
        WHERE migration_batch = ?
      `,
      [OUTBOUND_BASE_MIGRATION_BATCH, OUTBOUND_BASE_MIGRATION_BATCH],
    ),
    connection.query<Array<{ total: number }>>(
      `
        SELECT COUNT(*) AS total
        FROM migration_staging.excluded_documents
        WHERE migration_batch = ?
          AND legacy_table = 'saifute_outbound_order'
      `,
      [OUTBOUND_BASE_MIGRATION_BATCH],
    ),
  ]);

  let actualOrderMapCount = 0;
  let actualLineMapCount = 0;

  for (const row of countRows) {
    if (row.tableName === "map_customer_stock_order") {
      actualOrderMapCount = Number(row.total);
    }

    if (row.tableName === "map_customer_stock_order_line") {
      actualLineMapCount = Number(row.total);
    }
  }

  const actualExcludedDocumentCount = Number(excludedRows[0]?.total ?? 0);
  const issues: string[] = [];

  if (actualOrderMapCount !== EXPECTED_OUTBOUND_BASE_ORDER_MAP_COUNT) {
    issues.push(
      `batch2c outbound order map count mismatch: expected ${EXPECTED_OUTBOUND_BASE_ORDER_MAP_COUNT}, received ${actualOrderMapCount}.`,
    );
  }

  if (actualLineMapCount !== EXPECTED_OUTBOUND_BASE_LINE_MAP_COUNT) {
    issues.push(
      `batch2c outbound line map count mismatch: expected ${EXPECTED_OUTBOUND_BASE_LINE_MAP_COUNT}, received ${actualLineMapCount}.`,
    );
  }

  if (
    actualExcludedDocumentCount !==
    EXPECTED_OUTBOUND_BASE_EXCLUDED_DOCUMENT_COUNT
  ) {
    issues.push(
      `batch2c excluded outbound document count mismatch: expected ${EXPECTED_OUTBOUND_BASE_EXCLUDED_DOCUMENT_COUNT}, received ${actualExcludedDocumentCount}.`,
    );
  }

  return {
    expectedOrderMapCount: EXPECTED_OUTBOUND_BASE_ORDER_MAP_COUNT,
    actualOrderMapCount,
    expectedLineMapCount: EXPECTED_OUTBOUND_BASE_LINE_MAP_COUNT,
    actualLineMapCount,
    expectedExcludedDocumentCount:
      EXPECTED_OUTBOUND_BASE_EXCLUDED_DOCUMENT_COUNT,
    actualExcludedDocumentCount,
    issues,
  };
}

async function readCurrentOutboundLines(
  connection: MigrationConnectionLike,
): Promise<Map<number, CurrentOutboundLineRecord[]>> {
  const rows = await connection.query<
    Array<{
      targetLineId: number;
      targetOrderId: number;
      lineNo: number;
      materialId: number;
      customerId: number | null;
      workshopId: number;
      bizDate: string | null;
      documentNo: string;
      quantity: string;
      startNumber: string | null;
      endNumber: string | null;
    }>
  >(
    `
      SELECT
        line_row.id AS targetLineId,
        line_row.orderId AS targetOrderId,
        line_row.lineNo AS lineNo,
        line_row.materialId AS materialId,
        order_row.customerId AS customerId,
        order_row.workshopId AS workshopId,
        order_row.bizDate AS bizDate,
        order_row.documentNo AS documentNo,
        line_row.quantity AS quantity,
        line_row.startNumber AS startNumber,
        line_row.endNumber AS endNumber
      FROM customer_stock_order_line line_row
      INNER JOIN customer_stock_order order_row
        ON order_row.id = line_row.orderId
      WHERE order_row.orderType = 'OUTBOUND'
        AND order_row.lifecycleStatus = 'EFFECTIVE'
      ORDER BY line_row.id ASC
    `,
  );

  const outboundLinesByMaterialId = new Map<
    number,
    CurrentOutboundLineRecord[]
  >();

  for (const row of rows) {
    const existing = outboundLinesByMaterialId.get(row.materialId) ?? [];
    existing.push({
      targetLineId: row.targetLineId,
      targetOrderId: row.targetOrderId,
      lineNo: row.lineNo,
      materialId: row.materialId,
      customerId: row.customerId,
      workshopId: row.workshopId,
      bizDate: row.bizDate,
      documentNo: row.documentNo,
      quantity: String(row.quantity ?? "0"),
      startNumber: row.startNumber ?? null,
      endNumber: row.endNumber ?? null,
    });
    outboundLinesByMaterialId.set(row.materialId, existing);
  }

  return outboundLinesByMaterialId;
}

async function readOutboundOrderMapByLegacyId(
  connection: MigrationConnectionLike,
): Promise<Map<number, { targetOrderId: number; documentNo: string }>> {
  const rows = await connection.query<
    Array<{ legacyId: number; targetId: number; documentNo: string }>
  >(
    `
      SELECT
        map_row.legacy_id AS legacyId,
        map_row.target_id AS targetId,
        order_row.documentNo AS documentNo
      FROM migration_staging.map_customer_stock_order map_row
      INNER JOIN customer_stock_order order_row
        ON order_row.id = map_row.target_id
      WHERE map_row.migration_batch = ?
        AND map_row.legacy_table = 'saifute_outbound_order'
      ORDER BY map_row.legacy_id ASC
    `,
    [OUTBOUND_BASE_MIGRATION_BATCH],
  );

  return new Map(
    rows.map((row) => [
      row.legacyId,
      { targetOrderId: row.targetId, documentNo: row.documentNo },
    ]),
  );
}

async function readWorkshopDependencies(
  connection: MigrationConnectionLike,
): Promise<Map<number, ResolvedWorkshopDependency>> {
  const rows = await connection.query<
    Array<{
      targetId: number;
      workshopName: string;
    }>
  >(
    `
      SELECT
        workshop.id AS targetId,
        workshop.workshopName AS workshopName
      FROM migration_staging.map_workshop map_row
      INNER JOIN workshop
        ON workshop.id = map_row.target_id
      WHERE map_row.migration_batch = ?
      ORDER BY map_row.target_id ASC
    `,
    [BATCH1_MASTER_DATA_BATCH],
  );

  return new Map(
    rows.map((row) => [
      row.targetId,
      {
        targetId: row.targetId,
        workshopName: row.workshopName,
      },
    ]),
  );
}

async function readExistingDocumentNos(
  connection: MigrationConnectionLike,
  excludeMigrationBatch: string,
): Promise<Set<string>> {
  const rows = await connection.query<Array<{ documentNo: string }>>(
    `
      SELECT cso.documentNo
      FROM customer_stock_order cso
      WHERE NOT EXISTS (
        SELECT 1
        FROM migration_staging.map_customer_stock_order map_row
        WHERE map_row.target_id = cso.id
          AND map_row.migration_batch = ?
      )
      ORDER BY cso.id ASC
    `,
    [excludeMigrationBatch],
  );

  return new Set(rows.map((row) => row.documentNo));
}

export async function readSalesReturnDependencySnapshot(
  connection: MigrationConnectionLike,
): Promise<SalesReturnDependencySnapshot> {
  const { SALES_RETURN_MIGRATION_BATCH } = await import("./types");

  const [
    materialByLegacyKey,
    customerByLegacyKey,
    personnelSnapshot,
    blockedMaterialLegacyIds,
    batch1Baseline,
    outboundBaseBaseline,
    outboundLinesByMaterialId,
    outboundOrderMapByLegacyId,
    workshopByTargetId,
    existingDocumentNos,
  ] = await Promise.all([
    readMappedMaterials(connection),
    readMappedCustomers(connection),
    readPersonnelDependencies(connection),
    readBlockedMaterialLegacyIds(connection),
    readBatch1Baseline(connection),
    readOutboundBaseBaseline(connection),
    readCurrentOutboundLines(connection),
    readOutboundOrderMapByLegacyId(connection),
    readWorkshopDependencies(connection),
    readExistingDocumentNos(connection, SALES_RETURN_MIGRATION_BATCH),
  ]);

  return {
    materialByLegacyKey,
    customerByLegacyKey,
    personnelByNormalizedName: personnelSnapshot.personnelByNormalizedName,
    ambiguousPersonnelNames: personnelSnapshot.ambiguousPersonnelNames,
    blockedMaterialLegacyIds,
    batch1Baseline,
    outboundBaseBaseline,
    outboundLinesByMaterialId,
    outboundOrderMapByLegacyId,
    workshopByTargetId,
    existingDocumentNos,
  };
}
