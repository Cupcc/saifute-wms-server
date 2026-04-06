import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  assertDistinctSourceAndTargetDatabases,
  assertExpectedDatabaseName,
  EXPECTED_TARGET_DATABASE_NAME,
  loadMigrationEnvironment,
} from "../config";
import { closePools, createMariaDbPool, withPoolConnection } from "../db";
import { writeStableReport } from "../shared/report-writer";
import { MAP_TABLES, TARGET_TABLES } from "./writer";

interface MapTargetRow {
  legacyTable: string;
  legacyId: number;
  targetId: number;
  targetCode: string | null;
  foundDocumentNo: string | null;
  foundOrderType: string | null;
  foundLifecycleStatus: string | null;
  foundAuditStatusSnapshot: string | null;
  foundInventoryEffectStatus: string | null;
  foundWorkshopId: number | null;
  foundBizDate: string | null;
  foundTotalQty: string | null;
  foundTotalAmount: string | null;
}

interface MapTargetLineRow {
  legacyTable: string;
  legacyId: number;
  targetId: number;
  targetCode: string | null;
  foundOrderId: number | null;
  foundLineNo: number | null;
  foundMaterialId: number | null;
  foundQuantity: string | null;
  foundSourceDocumentType: string | null;
  foundSourceDocumentId: number | null;
  foundSourceDocumentLineId: number | null;
}

interface PendingRelationRow {
  legacyTable: string;
  legacyId: number;
  legacyLineId: number;
  relationType: string;
  pendingReason: string;
}

interface ExcludedDocumentRow {
  legacyTable: string;
  legacyId: number;
  exclusionReason: string;
}

export interface ForbiddenTableCounts {
  document_relation: number;
  document_line_relation: number;
  workflow_audit_document: number;
  inventory_balance: number;
  inventory_log: number;
  inventory_source_usage: number;
  factory_number_reservation: number;
}

export interface Batch3bPickBaselinePreservation {
  pickOrderMapCount: number;
  pickLineMapCount: number;
  pickExcludedCount: number;
  pickOrderCount: number;
  pickLineCount: number;
  expectedPickOrderMapCount: number;
  expectedPickLineMapCount: number;
  expectedPickExcludedCount: number;
  issues: string[];
}

export interface WorkshopReturnValidationReport {
  migrationBatch: string;
  cutoverReady: boolean;
  targetDatabaseName: string;
  mapCounts: {
    orders: number;
    lines: number;
    linesWithNullSource: number;
  };
  pendingRelationCount: number;
  excludedDocumentCount: number;
  integrityIssues: Array<{
    scope: string;
    issue: string;
    details: Record<string, unknown>;
  }>;
  mapSamples: {
    orders: MapTargetRow[];
    lines: MapTargetLineRow[];
  };
  pendingRelationSamples: PendingRelationRow[];
  excludedDocumentSamples: ExcludedDocumentRow[];
  forbiddenTableCounts: ForbiddenTableCounts;
  forbiddenTableIssues: string[];
  batch3bPickBaselinePreservation: Batch3bPickBaselinePreservation;
  sourceEnrichmentNote: string | null;
}

interface WorkshopReturnDryRunBaseline {
  counts?: {
    admittedOrders?: number;
    admittedLines?: number;
    excludedHeaders?: number;
    sourceCounts?: {
      orders?: number;
      details?: number;
    };
  };
  excludedDocumentSummary?: Array<{
    detailCount?: number;
    exclusionReason?: string;
  }>;
}

async function getOrderMapTargetRows(
  connection: {
    query<T = unknown>(sql: string, values?: readonly unknown[]): Promise<T>;
  },
  migrationBatch: string,
): Promise<MapTargetRow[]> {
  return connection.query<MapTargetRow[]>(
    `
      SELECT
        map_row.legacy_table AS legacyTable,
        map_row.legacy_id AS legacyId,
        map_row.target_id AS targetId,
        map_row.target_code AS targetCode,
        order_row.documentNo AS foundDocumentNo,
        order_row.orderType AS foundOrderType,
        order_row.lifecycleStatus AS foundLifecycleStatus,
        order_row.auditStatusSnapshot AS foundAuditStatusSnapshot,
        order_row.inventoryEffectStatus AS foundInventoryEffectStatus,
        order_row.workshopId AS foundWorkshopId,
        order_row.bizDate AS foundBizDate,
        order_row.totalQty AS foundTotalQty,
        order_row.totalAmount AS foundTotalAmount
      FROM migration_staging.${MAP_TABLES.order} map_row
      LEFT JOIN ${TARGET_TABLES.order} order_row
        ON order_row.id = map_row.target_id
      WHERE map_row.migration_batch = ?
      ORDER BY map_row.legacy_table ASC, map_row.legacy_id ASC
      LIMIT 50
    `,
    [migrationBatch],
  );
}

async function getLineMapTargetRows(
  connection: {
    query<T = unknown>(sql: string, values?: readonly unknown[]): Promise<T>;
  },
  migrationBatch: string,
): Promise<MapTargetLineRow[]> {
  return connection.query<MapTargetLineRow[]>(
    `
      SELECT
        map_row.legacy_table AS legacyTable,
        map_row.legacy_id AS legacyId,
        map_row.target_id AS targetId,
        map_row.target_code AS targetCode,
        line_row.orderId AS foundOrderId,
        line_row.lineNo AS foundLineNo,
        line_row.materialId AS foundMaterialId,
        line_row.quantity AS foundQuantity,
        line_row.sourceDocumentType AS foundSourceDocumentType,
        line_row.sourceDocumentId AS foundSourceDocumentId,
        line_row.sourceDocumentLineId AS foundSourceDocumentLineId
      FROM migration_staging.${MAP_TABLES.line} map_row
      LEFT JOIN ${TARGET_TABLES.line} line_row
        ON line_row.id = map_row.target_id
      WHERE map_row.migration_batch = ?
      ORDER BY map_row.legacy_table ASC, map_row.legacy_id ASC
      LIMIT 50
    `,
    [migrationBatch],
  );
}

async function getPendingRelations(
  connection: {
    query<T = unknown>(sql: string, values?: readonly unknown[]): Promise<T>;
  },
  migrationBatch: string,
): Promise<{ count: number; samples: PendingRelationRow[] }> {
  const countRows = await connection.query<Array<{ total: number }>>(
    `
      SELECT COUNT(*) AS total
      FROM migration_staging.pending_relations
      WHERE migration_batch = ?
        AND legacy_table IN ('saifute_return_order')
    `,
    [migrationBatch],
  );
  const count = Number(countRows[0]?.total ?? 0);

  const samples = await connection.query<PendingRelationRow[]>(
    `
      SELECT
        legacy_table AS legacyTable,
        legacy_id AS legacyId,
        legacy_line_id AS legacyLineId,
        relation_type AS relationType,
        pending_reason AS pendingReason
      FROM migration_staging.pending_relations
      WHERE migration_batch = ?
        AND legacy_table IN ('saifute_return_order')
      ORDER BY legacy_table ASC, legacy_id ASC, legacy_line_id ASC
      LIMIT 10
    `,
    [migrationBatch],
  );

  return { count, samples };
}

async function getExcludedDocuments(
  connection: {
    query<T = unknown>(sql: string, values?: readonly unknown[]): Promise<T>;
  },
  migrationBatch: string,
): Promise<{ count: number; samples: ExcludedDocumentRow[] }> {
  const countRows = await connection.query<Array<{ total: number }>>(
    `
      SELECT COUNT(*) AS total
      FROM migration_staging.excluded_documents
      WHERE migration_batch = ?
        AND legacy_table IN ('saifute_return_order')
    `,
    [migrationBatch],
  );
  const count = Number(countRows[0]?.total ?? 0);

  const samples = await connection.query<ExcludedDocumentRow[]>(
    `
      SELECT
        legacy_table AS legacyTable,
        legacy_id AS legacyId,
        exclusion_reason AS exclusionReason
      FROM migration_staging.excluded_documents
      WHERE migration_batch = ?
        AND legacy_table IN ('saifute_return_order')
      ORDER BY legacy_table ASC, legacy_id ASC
      LIMIT 10
    `,
    [migrationBatch],
  );

  return { count, samples };
}

async function getMapCounts(
  connection: {
    query<T = unknown>(sql: string, values?: readonly unknown[]): Promise<T>;
  },
  migrationBatch: string,
): Promise<{ orders: number; lines: number; linesWithNullSource: number }> {
  const [orderCountRows, lineCountRows, nullSourceCountRows] =
    await Promise.all([
      connection.query<Array<{ total: number }>>(
        `
        SELECT COUNT(*) AS total
        FROM migration_staging.${MAP_TABLES.order}
        WHERE migration_batch = ?
      `,
        [migrationBatch],
      ),
      connection.query<Array<{ total: number }>>(
        `
        SELECT COUNT(*) AS total
        FROM migration_staging.${MAP_TABLES.line}
        WHERE migration_batch = ?
      `,
        [migrationBatch],
      ),
      connection.query<Array<{ total: number }>>(
        `
        SELECT COUNT(*) AS total
        FROM migration_staging.${MAP_TABLES.line} map_row
        INNER JOIN ${TARGET_TABLES.line} line_row ON line_row.id = map_row.target_id
        WHERE map_row.migration_batch = ?
          AND line_row.sourceDocumentType IS NULL
      `,
        [migrationBatch],
      ),
    ]);

  return {
    orders: Number(orderCountRows[0]?.total ?? 0),
    lines: Number(lineCountRows[0]?.total ?? 0),
    linesWithNullSource: Number(nullSourceCountRows[0]?.total ?? 0),
  };
}

const EXPECTED_BATCH3B_PICK_ORDER_MAP_COUNT = 61;
const EXPECTED_BATCH3B_PICK_LINE_MAP_COUNT = 145;
const EXPECTED_BATCH3B_PICK_EXCLUDED_COUNT = 14;
const BATCH3B_MIGRATION_BATCH = "batch3b-workshop-pick-base";

function readForbiddenTableBaseline(
  executeReportPath: string,
): ForbiddenTableCounts | null {
  try {
    const parsed = JSON.parse(readFileSync(executeReportPath, "utf8")) as {
      targetSummary?: { forbiddenTableCounts?: ForbiddenTableCounts };
    };
    return parsed.targetSummary?.forbiddenTableCounts ?? null;
  } catch {
    return null;
  }
}

async function getForbiddenTableCounts(connection: {
  query<T = unknown>(sql: string, values?: readonly unknown[]): Promise<T>;
}): Promise<ForbiddenTableCounts> {
  const rows = await connection.query<
    Array<{
      document_relation: number;
      document_line_relation: number;
      workflow_audit_document: number;
      inventory_balance: number;
      inventory_log: number;
      inventory_source_usage: number;
      factory_number_reservation: number;
    }>
  >(
    `
      SELECT
        (SELECT COUNT(*) FROM document_relation)              AS document_relation,
        (SELECT COUNT(*) FROM document_line_relation)         AS document_line_relation,
        (SELECT COUNT(*) FROM workflow_audit_document)        AS workflow_audit_document,
        (SELECT COUNT(*) FROM inventory_balance)              AS inventory_balance,
        (SELECT COUNT(*) FROM inventory_log)                  AS inventory_log,
        (SELECT COUNT(*) FROM inventory_source_usage)         AS inventory_source_usage,
        (SELECT COUNT(*) FROM factory_number_reservation)     AS factory_number_reservation
    `,
  );

  const row = rows[0] ?? {
    document_relation: 0,
    document_line_relation: 0,
    workflow_audit_document: 0,
    inventory_balance: 0,
    inventory_log: 0,
    inventory_source_usage: 0,
    factory_number_reservation: 0,
  };

  return {
    document_relation: Number(row.document_relation),
    document_line_relation: Number(row.document_line_relation),
    workflow_audit_document: Number(row.workflow_audit_document),
    inventory_balance: Number(row.inventory_balance),
    inventory_log: Number(row.inventory_log),
    inventory_source_usage: Number(row.inventory_source_usage),
    factory_number_reservation: Number(row.factory_number_reservation),
  };
}

async function getBatch3bPickBaselinePreservation(connection: {
  query<T = unknown>(sql: string, values?: readonly unknown[]): Promise<T>;
}): Promise<Batch3bPickBaselinePreservation> {
  const rows = await connection.query<
    Array<{
      pickOrderMapCount: number;
      pickLineMapCount: number;
      pickExcludedCount: number;
      pickOrderCount: number;
      pickLineCount: number;
    }>
  >(
    `
      SELECT
        (SELECT COUNT(*) FROM migration_staging.map_workshop_material_order
          WHERE migration_batch = ?)                        AS pickOrderMapCount,
        (SELECT COUNT(*) FROM migration_staging.map_workshop_material_order_line
          WHERE migration_batch = ?)                        AS pickLineMapCount,
        (SELECT COUNT(*) FROM migration_staging.excluded_documents
          WHERE migration_batch = ?
            AND legacy_table = 'saifute_pick_order')        AS pickExcludedCount,
        (SELECT COUNT(*) FROM workshop_material_order
          WHERE orderType = 'PICK')                         AS pickOrderCount,
        (SELECT COUNT(*) FROM workshop_material_order_line wol
          INNER JOIN workshop_material_order wo ON wo.id = wol.orderId
          WHERE wo.orderType = 'PICK')                      AS pickLineCount
    `,
    [BATCH3B_MIGRATION_BATCH, BATCH3B_MIGRATION_BATCH, BATCH3B_MIGRATION_BATCH],
  );

  const row = rows[0] ?? {
    pickOrderMapCount: 0,
    pickLineMapCount: 0,
    pickExcludedCount: 0,
    pickOrderCount: 0,
    pickLineCount: 0,
  };

  const pickOrderMapCount = Number(row.pickOrderMapCount);
  const pickLineMapCount = Number(row.pickLineMapCount);
  const pickExcludedCount = Number(row.pickExcludedCount);
  const issues: string[] = [];

  if (pickOrderMapCount !== EXPECTED_BATCH3B_PICK_ORDER_MAP_COUNT) {
    issues.push(
      `batch3b pick order map count changed: expected ${EXPECTED_BATCH3B_PICK_ORDER_MAP_COUNT}, found ${pickOrderMapCount}.`,
    );
  }

  if (pickLineMapCount !== EXPECTED_BATCH3B_PICK_LINE_MAP_COUNT) {
    issues.push(
      `batch3b pick line map count changed: expected ${EXPECTED_BATCH3B_PICK_LINE_MAP_COUNT}, found ${pickLineMapCount}.`,
    );
  }

  if (pickExcludedCount !== EXPECTED_BATCH3B_PICK_EXCLUDED_COUNT) {
    issues.push(
      `batch3b pick excluded document count changed: expected ${EXPECTED_BATCH3B_PICK_EXCLUDED_COUNT}, found ${pickExcludedCount}.`,
    );
  }

  if (Number(row.pickOrderCount) !== EXPECTED_BATCH3B_PICK_ORDER_MAP_COUNT) {
    issues.push(
      `batch3b live PICK order count changed: expected ${EXPECTED_BATCH3B_PICK_ORDER_MAP_COUNT}, found ${Number(row.pickOrderCount)}.`,
    );
  }

  if (Number(row.pickLineCount) !== EXPECTED_BATCH3B_PICK_LINE_MAP_COUNT) {
    issues.push(
      `batch3b live PICK line count changed: expected ${EXPECTED_BATCH3B_PICK_LINE_MAP_COUNT}, found ${Number(row.pickLineCount)}.`,
    );
  }

  return {
    pickOrderMapCount,
    pickLineMapCount,
    pickExcludedCount,
    pickOrderCount: Number(row.pickOrderCount),
    pickLineCount: Number(row.pickLineCount),
    expectedPickOrderMapCount: EXPECTED_BATCH3B_PICK_ORDER_MAP_COUNT,
    expectedPickLineMapCount: EXPECTED_BATCH3B_PICK_LINE_MAP_COUNT,
    expectedPickExcludedCount: EXPECTED_BATCH3B_PICK_EXCLUDED_COUNT,
    issues,
  };
}

function buildForbiddenTableIssues(
  current: ForbiddenTableCounts,
  baseline: ForbiddenTableCounts | null,
): string[] {
  if (baseline === null) {
    return [];
  }

  const issues: string[] = [];

  for (const key of Object.keys(current) as Array<keyof ForbiddenTableCounts>) {
    if (current[key] !== baseline[key]) {
      issues.push(
        `forbidden table count changed for ${key}: expected ${baseline[key]}, found ${current[key]}.`,
      );
    }
  }

  return issues;
}

function readDryRunBaseline(
  dryRunReportPath: string,
): WorkshopReturnDryRunBaseline | null {
  try {
    return JSON.parse(
      readFileSync(dryRunReportPath, "utf8"),
    ) as WorkshopReturnDryRunBaseline;
  } catch {
    return null;
  }
}

function isRelationOnlyExclusionReason(reason: string | undefined): boolean {
  if (!reason) {
    return false;
  }

  return /(upstream|candidate|sourceDocument|source relation|pick line)/iu.test(
    reason,
  );
}

function buildIntegrityIssues(
  orderRows: MapTargetRow[],
  lineRows: MapTargetLineRow[],
): Array<{
  scope: string;
  issue: string;
  details: Record<string, unknown>;
}> {
  const issues: Array<{
    scope: string;
    issue: string;
    details: Record<string, unknown>;
  }> = [];

  for (const row of orderRows) {
    if (row.foundDocumentNo === null) {
      issues.push({
        scope: "workshop_material_order",
        issue: "Mapped target row is missing from workshop_material_order",
        details: {
          legacyTable: row.legacyTable,
          legacyId: row.legacyId,
          targetId: row.targetId,
        },
      });
      continue;
    }

    if (row.foundOrderType !== "RETURN") {
      issues.push({
        scope: "workshop_material_order",
        issue: "Target row orderType is not RETURN",
        details: {
          legacyId: row.legacyId,
          targetId: row.targetId,
          foundOrderType: row.foundOrderType,
        },
      });
    }

    if (
      row.targetCode !== null &&
      row.foundDocumentNo !== null &&
      row.targetCode !== row.foundDocumentNo
    ) {
      issues.push({
        scope: "workshop_material_order",
        issue: "Map target_code does not match target row documentNo",
        details: {
          legacyId: row.legacyId,
          targetId: row.targetId,
          targetCode: row.targetCode,
          foundDocumentNo: row.foundDocumentNo,
        },
      });
    }

    if (row.foundWorkshopId === null) {
      issues.push({
        scope: "workshop_material_order",
        issue: "Target row is missing workshopId",
        details: { legacyId: row.legacyId, targetId: row.targetId },
      });
    }

    if (!row.foundBizDate) {
      issues.push({
        scope: "workshop_material_order",
        issue: "Target row is missing bizDate",
        details: { legacyId: row.legacyId, targetId: row.targetId },
      });
    }
  }

  for (const row of lineRows) {
    if (row.foundOrderId === null) {
      issues.push({
        scope: "workshop_material_order_line",
        issue:
          "Mapped target line row is missing from workshop_material_order_line",
        details: {
          legacyTable: row.legacyTable,
          legacyId: row.legacyId,
          targetId: row.targetId,
        },
      });
      continue;
    }

    if (row.foundMaterialId === null || row.foundMaterialId <= 0) {
      issues.push({
        scope: "workshop_material_order_line",
        issue: "Target line row materialId is null or non-positive",
        details: {
          legacyId: row.legacyId,
          targetId: row.targetId,
          foundMaterialId: row.foundMaterialId,
        },
      });
    }

    // sourceDocumentType may be null for historical rows whose upstream pick relation is unresolved.
    // Only flag when sourceDocumentType is non-null but has an unexpected value, or when the
    // sourceDocument triple is internally inconsistent (type set but id/lineId missing, or vice versa).
    if (
      row.foundSourceDocumentType !== null &&
      row.foundSourceDocumentType !== "WorkshopMaterialOrder"
    ) {
      issues.push({
        scope: "workshop_material_order_line",
        issue:
          "Target line row sourceDocumentType is set but is not WorkshopMaterialOrder",
        details: {
          legacyId: row.legacyId,
          targetId: row.targetId,
          foundSourceDocumentType: row.foundSourceDocumentType,
        },
      });
    }

    const hasSourceType = row.foundSourceDocumentType !== null;
    const hasSourceId =
      row.foundSourceDocumentId !== null && row.foundSourceDocumentId > 0;
    const hasSourceLineId =
      row.foundSourceDocumentLineId !== null &&
      row.foundSourceDocumentLineId > 0;

    if (hasSourceType && (!hasSourceId || !hasSourceLineId)) {
      issues.push({
        scope: "workshop_material_order_line",
        issue:
          "Target line row has sourceDocumentType set but sourceDocumentId or sourceDocumentLineId is missing — inconsistent source triple",
        details: {
          legacyId: row.legacyId,
          targetId: row.targetId,
          foundSourceDocumentType: row.foundSourceDocumentType,
          foundSourceDocumentId: row.foundSourceDocumentId,
          foundSourceDocumentLineId: row.foundSourceDocumentLineId,
        },
      });
    }

    if (!hasSourceType && (hasSourceId || hasSourceLineId)) {
      issues.push({
        scope: "workshop_material_order_line",
        issue:
          "Target line row has null sourceDocumentType but non-null sourceDocumentId or sourceDocumentLineId — inconsistent source triple",
        details: {
          legacyId: row.legacyId,
          targetId: row.targetId,
          foundSourceDocumentId: row.foundSourceDocumentId,
          foundSourceDocumentLineId: row.foundSourceDocumentLineId,
        },
      });
    }
  }

  return issues;
}

const MIGRATION_BATCH = "batch3e-workshop-return-formal";

async function main(): Promise<void> {
  const reportPathEnv = process.env.WORKSHOP_RETURN_VALIDATE_REPORT_PATH;
  const env = loadMigrationEnvironment({ requireLegacyDatabaseUrl: false });
  const targetDatabaseName = assertExpectedDatabaseName(
    env.databaseUrl,
    EXPECTED_TARGET_DATABASE_NAME,
    "Target",
  );
  assertDistinctSourceAndTargetDatabases(
    env.legacyDatabaseUrl ?? env.databaseUrl,
    env.databaseUrl,
  );

  const reportPath =
    reportPathEnv ??
    join(
      process.cwd(),
      "scripts",
      "migration",
      "reports",
      "workshop-return-validate-report.json",
    );
  const executeReportPath = join(
    process.cwd(),
    "scripts",
    "migration",
    "reports",
    "workshop-return-execute-report.json",
  );
  const dryRunReportPath = join(
    process.cwd(),
    "scripts",
    "migration",
    "reports",
    "workshop-return-dry-run-report.json",
  );
  const forbiddenTableBaseline = readForbiddenTableBaseline(executeReportPath);
  const dryRunBaseline = readDryRunBaseline(dryRunReportPath);

  const targetPool = createMariaDbPool(env.databaseUrl);

  try {
    const report = await withPoolConnection(
      targetPool,
      async (targetConnection) => {
        const [
          mapCounts,
          orderMapRows,
          lineMapRows,
          pendingResult,
          excludedResult,
          forbiddenTableCounts,
          batch3bPickBaselinePreservation,
        ] = await Promise.all([
          getMapCounts(targetConnection, MIGRATION_BATCH),
          getOrderMapTargetRows(targetConnection, MIGRATION_BATCH),
          getLineMapTargetRows(targetConnection, MIGRATION_BATCH),
          getPendingRelations(targetConnection, MIGRATION_BATCH),
          getExcludedDocuments(targetConnection, MIGRATION_BATCH),
          getForbiddenTableCounts(targetConnection),
          getBatch3bPickBaselinePreservation(targetConnection),
        ]);

        const integrityIssues = buildIntegrityIssues(orderMapRows, lineMapRows);
        const expectedSourceOrderCount =
          dryRunBaseline?.counts?.sourceCounts?.orders ?? null;
        const expectedSourceDetailCount =
          dryRunBaseline?.counts?.sourceCounts?.details ?? null;
        const expectedAdmittedOrderCount =
          dryRunBaseline?.counts?.admittedOrders ?? null;
        const expectedAdmittedLineCount =
          dryRunBaseline?.counts?.admittedLines ?? null;
        const expectedExcludedHeaderCount =
          dryRunBaseline?.counts?.excludedHeaders ?? null;
        const excludedDetailCountFromBaseline =
          dryRunBaseline?.excludedDocumentSummary?.reduce(
            (sum, record) => sum + Number(record.detailCount ?? 0),
            0,
          ) ?? null;

        if (dryRunBaseline === null) {
          integrityIssues.push({
            scope: "workshop_return_validate",
            issue:
              "Dry-run baseline report is missing; validate cannot prove full source partition without the current deterministic dry-run artifact.",
            details: { dryRunReportPath },
          });
        }

        if (
          expectedAdmittedOrderCount !== null &&
          mapCounts.orders !== expectedAdmittedOrderCount
        ) {
          integrityIssues.push({
            scope: "workshop_material_order",
            issue:
              "Admitted workshop-return order count does not match the deterministic dry-run plan.",
            details: {
              expectedAdmittedOrderCount,
              actualAdmittedOrderCount: mapCounts.orders,
            },
          });
        }

        if (
          expectedAdmittedLineCount !== null &&
          mapCounts.lines !== expectedAdmittedLineCount
        ) {
          integrityIssues.push({
            scope: "workshop_material_order_line",
            issue:
              "Admitted workshop-return line count does not match the deterministic dry-run plan.",
            details: {
              expectedAdmittedLineCount,
              actualAdmittedLineCount: mapCounts.lines,
            },
          });
        }

        if (
          expectedExcludedHeaderCount !== null &&
          excludedResult.count !== expectedExcludedHeaderCount
        ) {
          integrityIssues.push({
            scope: "migration_staging.excluded_documents",
            issue:
              "Excluded workshop-return header count does not match the deterministic dry-run plan.",
            details: {
              expectedExcludedHeaderCount,
              actualExcludedHeaderCount: excludedResult.count,
            },
          });
        }

        if (
          expectedSourceOrderCount !== null &&
          expectedExcludedHeaderCount !== null &&
          mapCounts.orders + excludedResult.count !== expectedSourceOrderCount
        ) {
          integrityIssues.push({
            scope: "workshop_return_partition",
            issue:
              "Admitted plus excluded workshop-return headers do not fully partition the deterministic source set.",
            details: {
              expectedSourceOrderCount,
              admittedOrderCount: mapCounts.orders,
              excludedHeaderCount: excludedResult.count,
            },
          });
        }

        if (
          expectedSourceDetailCount !== null &&
          excludedDetailCountFromBaseline !== null &&
          mapCounts.lines + excludedDetailCountFromBaseline !==
            expectedSourceDetailCount
        ) {
          integrityIssues.push({
            scope: "workshop_return_partition",
            issue:
              "Admitted plus structurally excluded workshop-return lines do not fully partition the deterministic source set.",
            details: {
              expectedSourceDetailCount,
              admittedLineCount: mapCounts.lines,
              excludedDetailCount: excludedDetailCountFromBaseline,
            },
          });
        }

        const relationOnlyExcludedReasons =
          dryRunBaseline?.excludedDocumentSummary?.filter((record) =>
            isRelationOnlyExclusionReason(record.exclusionReason),
          ) ?? [];

        if (relationOnlyExcludedReasons.length > 0) {
          integrityIssues.push({
            scope: "migration_staging.excluded_documents",
            issue:
              "Relation-only exclusion reasons are present in the deterministic dry-run plan, which violates the formal-admission contract.",
            details: {
              relationOnlyExcludedReasonCount:
                relationOnlyExcludedReasons.length,
            },
          });
        }

        const baselineIssues = batch3bPickBaselinePreservation.issues;
        const forbiddenTableIssues = buildForbiddenTableIssues(
          forbiddenTableCounts,
          forbiddenTableBaseline,
        );

        // Pending relations are now source-enrichment records, not admission gates.
        // They do not block cutover readiness.
        const cutoverReady =
          mapCounts.orders > 0 &&
          integrityIssues.length === 0 &&
          baselineIssues.length === 0 &&
          forbiddenTableIssues.length === 0;

        // When admitted lines have null sourceDocument* fields, they are candidates for
        // later source enrichment. This does not block cutover, but should be noted.
        const sourceEnrichmentNote =
          mapCounts.linesWithNullSource > 0
            ? `${mapCounts.linesWithNullSource} admitted line(s) have null sourceDocument* fields. These rows are formally admitted. A later source-enrichment step (not a separate admission gate) may populate the sourceDocumentType/Id/LineId fields once upstream pick relations are confirmed.`
            : null;

        const validationReport: WorkshopReturnValidationReport = {
          migrationBatch: MIGRATION_BATCH,
          cutoverReady,
          targetDatabaseName,
          mapCounts,
          pendingRelationCount: pendingResult.count,
          excludedDocumentCount: excludedResult.count,
          integrityIssues,
          mapSamples: {
            orders: orderMapRows,
            lines: lineMapRows,
          },
          pendingRelationSamples: pendingResult.samples,
          excludedDocumentSamples: excludedResult.samples,
          forbiddenTableCounts,
          forbiddenTableIssues,
          batch3bPickBaselinePreservation,
          sourceEnrichmentNote,
        };

        return validationReport;
      },
    );

    writeStableReport(reportPath, report);
    console.log(
      `Workshop-return validation completed. cutoverReady=${String(report.cutoverReady)} linesWithNullSource=${report.mapCounts.linesWithNullSource} pendingRelations=${report.pendingRelationCount} baselineIssues=${report.batch3bPickBaselinePreservation.issues.length} report=${reportPath}`,
    );

    if (!report.cutoverReady) {
      process.exitCode = 1;
    }
  } finally {
    await closePools(targetPool);
  }
}

void main();
