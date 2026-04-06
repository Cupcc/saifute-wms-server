import {
  assertDistinctSourceAndTargetDatabases,
  assertExpectedDatabaseName,
  EXPECTED_TARGET_DATABASE_NAME,
  loadMigrationEnvironment,
  parseMigrationCliOptions,
  resolveReportPath,
} from "../config";
import { closePools, createMariaDbPool, withPoolConnection } from "../db";
import { stableJsonStringify } from "../shared/deterministic";
import { writeStableReport } from "../shared/report-writer";
import { buildCutoverReadiness } from "./cutover-readiness";
import {
  readLegacyProjectSnapshot,
  readProjectDependencySnapshot,
} from "./legacy-reader";
import { buildProjectMigrationPlan } from "./transformer";
import type { ArchivedFieldPayloadRecord, ProjectMigrationPlan } from "./types";
import {
  PENDING_RELATION_TYPE_PROJECT_LINE_MATERIAL,
  PROJECT_AUTO_CREATED_MATERIAL_SOURCE_DOCUMENT_TYPE,
} from "./types";
import { MAP_TABLES, TARGET_TABLES } from "./writer";

interface ArchivedPayloadExpectation {
  legacyTable: string;
  legacyId: number;
  targetTable: string;
  targetCode: string;
  payloadKind: ArchivedFieldPayloadRecord["payloadKind"];
  archiveReason: string;
  payloadJson: string;
}

interface ArchivedPayloadStoredRow {
  legacyTable: string;
  legacyId: number;
  targetTable: string;
  targetId: number | null;
  targetCode: string | null;
  payloadKind: ArchivedFieldPayloadRecord["payloadKind"];
  archiveReason: string;
  payloadJson: string;
}

interface ExcludedDocumentStoredRow {
  legacyTable: string;
  legacyId: number;
  exclusionReason: string;
  payloadJson: string;
}

interface MapStoredRow {
  legacyTable: string;
  legacyId: number;
  targetTable: string;
  targetId: number;
  targetCode: string | null;
}

interface PendingRelationStoredRow {
  legacyTable: string;
  legacyId: number;
  legacyLineId: number | null;
  relationType: string | null;
  pendingReason: string;
  payloadJson: string;
}

function comparableScalar(value: unknown): string | null {
  if (value === null || value === undefined) {
    return null;
  }

  const stringValue = String(value).trim();
  const dateTimeMatch = stringValue.match(
    /^(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})(?:\.\d+)?$/u,
  );

  if (dateTimeMatch) {
    return dateTimeMatch[1] ?? stringValue;
  }

  if (/^-?\d+(\.\d+)?$/u.test(stringValue)) {
    const sign = stringValue.startsWith("-") ? "-" : "";
    const unsignedValue = sign ? stringValue.slice(1) : stringValue;
    const [integerPartRaw, fractionalPartRaw = ""] = unsignedValue.split(".");
    const normalizedIntegerPart =
      integerPartRaw.replace(/^0+(?=\d)/u, "") || "0";
    const normalizedFractionalPart = fractionalPartRaw.replace(/0+$/u, "");

    return normalizedFractionalPart.length > 0
      ? `${sign}${normalizedIntegerPart}.${normalizedFractionalPart}`
      : `${sign}${normalizedIntegerPart}`;
  }

  return stringValue;
}

function pushValueMismatch(
  validationIssues: Array<Record<string, unknown>>,
  context: Record<string, unknown>,
  field: string,
  expected: unknown,
  actual: unknown,
): void {
  if (comparableScalar(expected) === comparableScalar(actual)) {
    return;
  }

  validationIssues.push({
    severity: "blocker",
    ...context,
    field,
    reason: `${field} does not match the deterministic migration plan.`,
    expected,
    actual,
  });
}

function buildArchivedPayloadIdentity(input: {
  legacyTable: string;
  legacyId: number;
  targetTable: string;
  payloadKind: ArchivedFieldPayloadRecord["payloadKind"];
}): string {
  return [
    input.legacyTable,
    String(input.legacyId),
    input.targetTable,
    input.payloadKind,
  ].join("::");
}

function buildExcludedDocumentIdentity(input: {
  legacyTable: string;
  legacyId: number;
}): string {
  return `${input.legacyTable}::${input.legacyId}`;
}

function buildMapIdentity(input: {
  legacyTable: string;
  legacyId: number;
}): string {
  return `${input.legacyTable}::${input.legacyId}`;
}

function buildPendingRelationIdentity(input: {
  legacyTable: string;
  legacyId: number;
  legacyLineId: number | null;
}): string {
  return `${input.legacyTable}::${input.legacyId}::${input.legacyLineId ?? "null"}`;
}

/**
 * Collect all expected archived_field_payload rows for this migration batch.
 * Includes both migrated project/line payloads and pending project summary payloads.
 */
function collectExpectedArchivedPayloads(
  plan: ProjectMigrationPlan,
): ArchivedPayloadExpectation[] {
  const expectations: ArchivedPayloadExpectation[] = [];

  for (const material of plan.autoCreatedMaterials) {
    expectations.push({
      legacyTable: material.archivedPayload.legacyTable,
      legacyId: material.archivedPayload.legacyId,
      targetTable: material.archivedPayload.targetTable,
      targetCode: material.archivedPayload.targetCode,
      payloadKind: material.archivedPayload.payloadKind,
      archiveReason: material.archivedPayload.archiveReason,
      payloadJson: stableJsonStringify(material.archivedPayload.payload),
    });
  }

  for (const project of plan.migratedProjects) {
    expectations.push({
      legacyTable: project.archivedPayload.legacyTable,
      legacyId: project.archivedPayload.legacyId,
      targetTable: project.archivedPayload.targetTable,
      targetCode: project.archivedPayload.targetCode,
      payloadKind: project.archivedPayload.payloadKind,
      archiveReason: project.archivedPayload.archiveReason,
      payloadJson: stableJsonStringify(project.archivedPayload.payload),
    });

    for (const line of project.lines) {
      expectations.push({
        legacyTable: line.archivedPayload.legacyTable,
        legacyId: line.archivedPayload.legacyId,
        targetTable: line.archivedPayload.targetTable,
        targetCode: line.archivedPayload.targetCode,
        payloadKind: line.archivedPayload.payloadKind,
        archiveReason: line.archivedPayload.archiveReason,
        payloadJson: stableJsonStringify(line.archivedPayload.payload),
      });
    }
  }

  for (const pendingProject of plan.pendingProjects) {
    expectations.push({
      legacyTable: pendingProject.summaryArchivedPayload.legacyTable,
      legacyId: pendingProject.summaryArchivedPayload.legacyId,
      targetTable: pendingProject.summaryArchivedPayload.targetTable,
      targetCode: pendingProject.summaryArchivedPayload.targetCode,
      payloadKind: pendingProject.summaryArchivedPayload.payloadKind,
      archiveReason: pendingProject.summaryArchivedPayload.archiveReason,
      payloadJson: stableJsonStringify(
        pendingProject.summaryArchivedPayload.payload,
      ),
    });
  }

  return expectations.sort(
    (left, right) =>
      left.legacyTable.localeCompare(right.legacyTable) ||
      left.legacyId - right.legacyId ||
      left.targetTable.localeCompare(right.targetTable) ||
      left.payloadKind.localeCompare(right.payloadKind),
  );
}

function collectExpectedExcludedDocuments(plan: ProjectMigrationPlan): Array<{
  legacyTable: string;
  legacyId: number;
  exclusionReason: string;
  payloadJson: string;
}> {
  return [...plan.excludedProjects]
    .sort(
      (left, right) =>
        left.legacyTable.localeCompare(right.legacyTable) ||
        left.legacyId - right.legacyId,
    )
    .map((record) => ({
      legacyTable: record.legacyTable,
      legacyId: record.legacyId,
      exclusionReason: record.exclusionReason,
      payloadJson: stableJsonStringify(record.payload),
    }));
}

async function getTableCount(
  connection: {
    query<T = unknown>(sql: string, values?: readonly unknown[]): Promise<T>;
  },
  tableName: string,
): Promise<number> {
  const rows = await connection.query<Array<{ total: number }>>(
    `SELECT COUNT(*) AS total FROM ${tableName}`,
  );
  return Number(rows[0]?.total ?? 0);
}

async function getBatchMapCount(
  connection: {
    query<T = unknown>(sql: string, values?: readonly unknown[]): Promise<T>;
  },
  mapTableName: string,
  migrationBatch: string,
): Promise<number> {
  const rows = await connection.query<Array<{ total: number }>>(
    `
      SELECT COUNT(*) AS total
      FROM migration_staging.${mapTableName}
      WHERE migration_batch = ?
    `,
    [migrationBatch],
  );
  return Number(rows[0]?.total ?? 0);
}

async function getMissingMapTargets(
  connection: {
    query<T = unknown>(sql: string, values?: readonly unknown[]): Promise<T>;
  },
  mapTableName: string,
  targetTableName: string,
  migrationBatch: string,
): Promise<number> {
  const rows = await connection.query<Array<{ total: number }>>(
    `
      SELECT COUNT(*) AS total
      FROM migration_staging.${mapTableName} map_row
      LEFT JOIN ${targetTableName} target_row
        ON target_row.id = map_row.target_id
      WHERE map_row.migration_batch = ?
        AND target_row.id IS NULL
    `,
    [migrationBatch],
  );

  return Number(rows[0]?.total ?? 0);
}

async function getArchivedPayloadCount(
  connection: {
    query<T = unknown>(sql: string, values?: readonly unknown[]): Promise<T>;
  },
  migrationBatch: string,
): Promise<number> {
  const rows = await connection.query<Array<{ total: number }>>(
    `
      SELECT COUNT(*) AS total
      FROM migration_staging.archived_field_payload
      WHERE migration_batch = ?
        AND target_table IN ('material', 'project', 'project_material_line')
    `,
    [migrationBatch],
  );
  return Number(rows[0]?.total ?? 0);
}

async function getArchivedPayloadRows(
  connection: {
    query<T = unknown>(sql: string, values?: readonly unknown[]): Promise<T>;
  },
  migrationBatch: string,
): Promise<ArchivedPayloadStoredRow[]> {
  return connection.query<ArchivedPayloadStoredRow[]>(
    `
      SELECT
        legacy_table AS legacyTable,
        legacy_id AS legacyId,
        target_table AS targetTable,
        target_id AS targetId,
        target_code AS targetCode,
        payload_kind AS payloadKind,
        archive_reason AS archiveReason,
        payload_json AS payloadJson
      FROM migration_staging.archived_field_payload
      WHERE migration_batch = ?
        AND target_table IN ('material', 'project', 'project_material_line')
      ORDER BY legacy_table ASC, legacy_id ASC, target_table ASC, payload_kind ASC
    `,
    [migrationBatch],
  );
}

async function getExcludedDocumentRows(
  connection: {
    query<T = unknown>(sql: string, values?: readonly unknown[]): Promise<T>;
  },
  migrationBatch: string,
): Promise<ExcludedDocumentStoredRow[]> {
  return connection.query<ExcludedDocumentStoredRow[]>(
    `
      SELECT
        legacy_table AS legacyTable,
        legacy_id AS legacyId,
        exclusion_reason AS exclusionReason,
        payload_json AS payloadJson
      FROM migration_staging.excluded_documents
      WHERE migration_batch = ?
        AND legacy_table = 'saifute_composite_product'
      ORDER BY legacy_table ASC, legacy_id ASC
    `,
    [migrationBatch],
  );
}

async function getMapRows(
  connection: {
    query<T = unknown>(sql: string, values?: readonly unknown[]): Promise<T>;
  },
  mapTableName: string,
  migrationBatch: string,
): Promise<MapStoredRow[]> {
  return connection.query<MapStoredRow[]>(
    `
      SELECT
        legacy_table AS legacyTable,
        legacy_id AS legacyId,
        target_table AS targetTable,
        target_id AS targetId,
        target_code AS targetCode
      FROM migration_staging.${mapTableName}
      WHERE migration_batch = ?
      ORDER BY legacy_table ASC, legacy_id ASC
    `,
    [migrationBatch],
  );
}

async function getPendingRelationRows(
  connection: {
    query<T = unknown>(sql: string, values?: readonly unknown[]): Promise<T>;
  },
  migrationBatch: string,
): Promise<PendingRelationStoredRow[]> {
  return connection.query<PendingRelationStoredRow[]>(
    `
      SELECT
        legacy_table AS legacyTable,
        legacy_id AS legacyId,
        legacy_line_id AS legacyLineId,
        relation_type AS relationType,
        pending_reason AS pendingReason,
        payload_json AS payloadJson
      FROM migration_staging.pending_relations
      WHERE migration_batch = ?
        AND legacy_table = 'saifute_composite_product'
      ORDER BY legacy_id ASC, legacy_line_id ASC
    `,
    [migrationBatch],
  );
}

async function stagingSchemaExists(connection: {
  query<T = unknown>(sql: string, values?: readonly unknown[]): Promise<T>;
}): Promise<boolean> {
  const rows = await connection.query<Array<{ schemaName: string }>>(
    `
      SELECT schema_name AS schemaName
      FROM information_schema.schemata
      WHERE schema_name = 'migration_staging'
    `,
  );

  return rows.length > 0;
}

async function getProjectRowsByProjectCode(connection: {
  query<T = unknown>(sql: string, values?: readonly unknown[]): Promise<T>;
}): Promise<
  Map<
    string,
    {
      id: number;
      projectCode: string;
      projectName: string;
      bizDate: string;
      customerId: number | null;
      supplierId: number | null;
      managerPersonnelId: number | null;
      workshopId: number;
      lifecycleStatus: string;
      auditStatusSnapshot: string;
      inventoryEffectStatus: string;
      revisionNo: number;
      customerCodeSnapshot: string | null;
      customerNameSnapshot: string | null;
      supplierCodeSnapshot: string | null;
      supplierNameSnapshot: string | null;
      managerNameSnapshot: string | null;
      workshopNameSnapshot: string;
      totalQty: string;
      totalAmount: string;
      remark: string | null;
      voidReason: string | null;
      voidedBy: string | null;
      voidedAt: string | null;
      createdBy: string | null;
      createdAt: string | null;
      updatedBy: string | null;
      updatedAt: string | null;
    }
  >
> {
  const rows = await connection.query<
    Array<{
      id: number;
      projectCode: string;
      projectName: string;
      bizDate: string;
      customerId: number | null;
      supplierId: number | null;
      managerPersonnelId: number | null;
      workshopId: number;
      lifecycleStatus: string;
      auditStatusSnapshot: string;
      inventoryEffectStatus: string;
      revisionNo: number;
      customerCodeSnapshot: string | null;
      customerNameSnapshot: string | null;
      supplierCodeSnapshot: string | null;
      supplierNameSnapshot: string | null;
      managerNameSnapshot: string | null;
      workshopNameSnapshot: string;
      totalQty: string;
      totalAmount: string;
      remark: string | null;
      voidReason: string | null;
      voidedBy: string | null;
      voidedAt: string | null;
      createdBy: string | null;
      createdAt: string | null;
      updatedBy: string | null;
      updatedAt: string | null;
    }>
  >(
    `
      SELECT
        id,
        projectCode,
        projectName,
        bizDate,
        customerId,
        supplierId,
        managerPersonnelId,
        workshopId,
        lifecycleStatus,
        auditStatusSnapshot,
        inventoryEffectStatus,
        revisionNo,
        customerCodeSnapshot,
        customerNameSnapshot,
        supplierCodeSnapshot,
        supplierNameSnapshot,
        managerNameSnapshot,
        workshopNameSnapshot,
        totalQty,
        totalAmount,
        remark,
        voidReason,
        voidedBy,
        voidedAt,
        createdBy,
        createdAt,
        updatedBy,
        updatedAt
      FROM project
      ORDER BY projectCode ASC
    `,
  );

  return new Map(rows.map((row) => [row.projectCode, row] as const));
}

function buildLineIdentity(projectCode: string, lineNo: number): string {
  return `${projectCode}#${lineNo}`;
}

async function getLineRowsByIdentity(connection: {
  query<T = unknown>(sql: string, values?: readonly unknown[]): Promise<T>;
}): Promise<
  Map<
    string,
    {
      id: number;
      projectCode: string;
      lineNo: number;
      materialId: number;
      materialCodeSnapshot: string;
      materialNameSnapshot: string;
      materialSpecSnapshot: string | null;
      unitCodeSnapshot: string;
      quantity: string;
      unitPrice: string;
      amount: string;
      remark: string | null;
      createdBy: string | null;
      createdAt: string | null;
      updatedBy: string | null;
      updatedAt: string | null;
    }
  >
> {
  const rows = await connection.query<
    Array<{
      id: number;
      projectCode: string;
      lineNo: number;
      materialId: number;
      materialCodeSnapshot: string;
      materialNameSnapshot: string;
      materialSpecSnapshot: string | null;
      unitCodeSnapshot: string;
      quantity: string;
      unitPrice: string;
      amount: string;
      remark: string | null;
      createdBy: string | null;
      createdAt: string | null;
      updatedBy: string | null;
      updatedAt: string | null;
    }>
  >(
    `
      SELECT
        line_row.id AS id,
        project_row.projectCode AS projectCode,
        line_row.lineNo AS lineNo,
        line_row.materialId AS materialId,
        line_row.materialCodeSnapshot AS materialCodeSnapshot,
        line_row.materialNameSnapshot AS materialNameSnapshot,
        line_row.materialSpecSnapshot AS materialSpecSnapshot,
        line_row.unitCodeSnapshot AS unitCodeSnapshot,
        line_row.quantity AS quantity,
        line_row.unitPrice AS unitPrice,
        line_row.amount AS amount,
        line_row.remark AS remark,
        line_row.createdBy AS createdBy,
        line_row.createdAt AS createdAt,
        line_row.updatedBy AS updatedBy,
        line_row.updatedAt AS updatedAt
      FROM project_material_line line_row
      INNER JOIN project project_row
        ON project_row.id = line_row.projectId
      ORDER BY project_row.projectCode ASC, line_row.lineNo ASC
    `,
  );

  return new Map(
    rows.map(
      (row) => [buildLineIdentity(row.projectCode, row.lineNo), row] as const,
    ),
  );
}

async function getAutoCreatedMaterialRowsByCode(connection: {
  query<T = unknown>(sql: string, values?: readonly unknown[]): Promise<T>;
}): Promise<
  Map<
    string,
    {
      id: number;
      materialCode: string;
      materialName: string;
      specModel: string | null;
      unitCode: string;
      warningMinQty: string | number | null;
      warningMaxQty: string | number | null;
      status: string;
      creationMode: string;
      sourceDocumentType: string | null;
      sourceDocumentId: number | null;
      createdBy: string | null;
      updatedBy: string | null;
    }
  >
> {
  const rows = await connection.query<
    Array<{
      id: number;
      materialCode: string;
      materialName: string;
      specModel: string | null;
      unitCode: string;
      warningMinQty: string | number | null;
      warningMaxQty: string | number | null;
      status: string;
      creationMode: string;
      sourceDocumentType: string | null;
      sourceDocumentId: number | null;
      createdBy: string | null;
      updatedBy: string | null;
    }>
  >(
    `
      SELECT
        id,
        materialCode,
        materialName,
        specModel,
        unitCode,
        warningMinQty,
        warningMaxQty,
        status,
        creationMode,
        sourceDocumentType,
        sourceDocumentId,
        createdBy,
        updatedBy
      FROM material
      WHERE creationMode = 'AUTO_CREATED'
        AND sourceDocumentType = ?
      ORDER BY materialCode ASC
    `,
    [PROJECT_AUTO_CREATED_MATERIAL_SOURCE_DOCUMENT_TYPE],
  );

  return new Map(rows.map((row) => [row.materialCode, row] as const));
}

async function getProjectDownstreamConsumerCounts(connection: {
  query<T = unknown>(sql: string, values?: readonly unknown[]): Promise<T>;
}): Promise<Record<string, number>> {
  const rows = await connection.query<
    Array<{ consumer: string; total: number }>
  >(
    `
      SELECT 'audit_document' AS consumer, COUNT(*) AS total
      FROM audit_document
      WHERE documentFamily = 'PROJECT' OR documentType = 'Project'
      UNION ALL
      SELECT 'document_relation' AS consumer, COUNT(*) AS total
      FROM document_relation
      WHERE upstreamFamily = 'PROJECT'
         OR downstreamFamily = 'PROJECT'
         OR upstreamDocumentType = 'Project'
         OR downstreamDocumentType = 'Project'
      UNION ALL
      SELECT 'document_line_relation' AS consumer, COUNT(*) AS total
      FROM document_line_relation
      WHERE upstreamFamily = 'PROJECT'
         OR downstreamFamily = 'PROJECT'
         OR upstreamDocumentType = 'Project'
         OR downstreamDocumentType = 'Project'
      UNION ALL
      SELECT 'inventory_log' AS consumer, COUNT(*) AS total
      FROM inventory_log
      WHERE businessDocumentType = 'Project'
      UNION ALL
      SELECT 'inventory_source_usage' AS consumer, COUNT(*) AS total
      FROM inventory_source_usage
      WHERE consumerDocumentType = 'Project'
      UNION ALL
      SELECT 'factory_number_reservation' AS consumer, COUNT(*) AS total
      FROM factory_number_reservation
      WHERE businessDocumentType = 'Project'
    `,
  );

  return Object.fromEntries(
    rows.map((row) => [row.consumer, Number(row.total)] as const),
  );
}

// buildCutoverReadiness is imported from ./cutover-readiness and used in main().

async function main(): Promise<void> {
  const cliOptions = parseMigrationCliOptions();
  const reportPath = resolveReportPath(
    cliOptions,
    "project-validate-report.json",
  );
  const env = loadMigrationEnvironment({ requireLegacyDatabaseUrl: true });
  const structuralExclusionsAcknowledged =
    process.env.PROJECT_STRUCTURAL_EXCLUSIONS_ACKNOWLEDGED === "true";
  const targetDatabaseName = assertExpectedDatabaseName(
    env.databaseUrl,
    EXPECTED_TARGET_DATABASE_NAME,
    "Target",
  );
  assertDistinctSourceAndTargetDatabases(
    env.legacyDatabaseUrl,
    env.databaseUrl,
  );

  const legacyPool = createMariaDbPool(env.legacyDatabaseUrl ?? "");
  const targetPool = createMariaDbPool(env.databaseUrl);

  try {
    const { snapshot, dependencies, plan } = await withPoolConnection(
      legacyPool,
      async (legacyConnection) => {
        const snapshot = await readLegacyProjectSnapshot(legacyConnection);
        const dependencies = await withPoolConnection(
          targetPool,
          async (targetConnection) =>
            readProjectDependencySnapshot(targetConnection),
        );

        return {
          snapshot,
          dependencies,
          plan: buildProjectMigrationPlan(snapshot, dependencies),
        };
      },
    );

    const expectedArchivedPayloads = collectExpectedArchivedPayloads(plan);
    const expectedExcludedDocuments = collectExpectedExcludedDocuments(plan);
    const expectedPendingRelationCount = plan.pendingProjects.reduce(
      (total, project) => total + project.pendingLineCount,
      0,
    );

    const report = await withPoolConnection(
      targetPool,
      async (targetConnection) => {
        const validationIssues: Array<Record<string, unknown>> = [];
        const stagingReady = await stagingSchemaExists(targetConnection);
        const expectedMigratedProjects = plan.migratedProjects.length;
        const expectedMigratedLines = plan.migratedProjects.reduce(
          (total, project) => total + project.lines.length,
          0,
        );

        if (!stagingReady) {
          validationIssues.push({
            severity: "blocker",
            reason: "migration_staging schema does not exist.",
          });
        }

        if (plan.globalBlockers.length > 0) {
          validationIssues.push(
            ...plan.globalBlockers.map((blocker) => ({
              severity: "blocker",
              reason: blocker.reason,
              ...blocker.details,
            })),
          );
        }

        const projectTargetRows = await getTableCount(
          targetConnection,
          TARGET_TABLES.project,
        );
        const lineTargetRows = await getTableCount(
          targetConnection,
          TARGET_TABLES.line,
        );
        const projectBatchMapRows = stagingReady
          ? await getBatchMapCount(
              targetConnection,
              MAP_TABLES.project,
              plan.migrationBatch,
            )
          : 0;
        const lineBatchMapRows = stagingReady
          ? await getBatchMapCount(
              targetConnection,
              MAP_TABLES.line,
              plan.migrationBatch,
            )
          : 0;
        const missingMappedProjects = stagingReady
          ? await getMissingMapTargets(
              targetConnection,
              MAP_TABLES.project,
              TARGET_TABLES.project,
              plan.migrationBatch,
            )
          : 0;
        const missingMappedLines = stagingReady
          ? await getMissingMapTargets(
              targetConnection,
              MAP_TABLES.line,
              TARGET_TABLES.line,
              plan.migrationBatch,
            )
          : 0;

        const pendingRelationRows = stagingReady
          ? await getPendingRelationRows(targetConnection, plan.migrationBatch)
          : [];
        const actualPendingRelationCount = pendingRelationRows.length;

        const downstreamConsumerCounts =
          await getProjectDownstreamConsumerCounts(targetConnection);

        if (stagingReady && projectBatchMapRows !== expectedMigratedProjects) {
          validationIssues.push({
            severity: "blocker",
            reason:
              "project map row count does not match the deterministic migration plan.",
            expectedMigratedProjects,
            actualProjectMapRows: projectBatchMapRows,
          });
        }

        if (stagingReady && lineBatchMapRows !== expectedMigratedLines) {
          validationIssues.push({
            severity: "blocker",
            reason:
              "project material line map row count does not match the deterministic migration plan.",
            expectedMigratedLines,
            actualLineMapRows: lineBatchMapRows,
          });
        }

        if (projectTargetRows < expectedMigratedProjects) {
          validationIssues.push({
            severity: "blocker",
            reason: "project row count is smaller than the migration plan.",
            expectedMigratedProjects,
            actualProjectRows: projectTargetRows,
          });
        } else if (projectTargetRows > expectedMigratedProjects) {
          validationIssues.push({
            severity: "blocker",
            reason:
              "project contains more rows than this migration slice expects.",
            expectedMigratedProjects,
            actualProjectRows: projectTargetRows,
          });
        }

        if (lineTargetRows < expectedMigratedLines) {
          validationIssues.push({
            severity: "blocker",
            reason:
              "project_material_line row count is smaller than the migration plan.",
            expectedMigratedLines,
            actualLineRows: lineTargetRows,
          });
        } else if (lineTargetRows > expectedMigratedLines) {
          validationIssues.push({
            severity: "blocker",
            reason:
              "project_material_line contains more rows than this migration slice expects.",
            expectedMigratedLines,
            actualLineRows: lineTargetRows,
          });
        }

        if (missingMappedProjects > 0) {
          validationIssues.push({
            severity: "blocker",
            reason:
              "Some project staging map rows point at missing target rows.",
            missingMappedProjects,
          });
        }

        if (missingMappedLines > 0) {
          validationIssues.push({
            severity: "blocker",
            reason:
              "Some project material line staging map rows point at missing target rows.",
            missingMappedLines,
          });
        }

        if (
          stagingReady &&
          actualPendingRelationCount !== expectedPendingRelationCount
        ) {
          validationIssues.push({
            severity: "blocker",
            reason:
              "pending_relations count does not match the deterministic plan's expected pending line count.",
            expectedPendingRelationCount,
            actualPendingRelationCount,
          });
        }

        const archivedPayloadCount = stagingReady
          ? await getArchivedPayloadCount(targetConnection, plan.migrationBatch)
          : 0;
        const archivedPayloadRows = stagingReady
          ? await getArchivedPayloadRows(targetConnection, plan.migrationBatch)
          : [];
        const excludedDocumentRows = stagingReady
          ? await getExcludedDocumentRows(targetConnection, plan.migrationBatch)
          : [];
        const projectMapRows = stagingReady
          ? await getMapRows(
              targetConnection,
              MAP_TABLES.project,
              plan.migrationBatch,
            )
          : [];
        const lineMapRows = stagingReady
          ? await getMapRows(
              targetConnection,
              MAP_TABLES.line,
              plan.migrationBatch,
            )
          : [];

        if (
          stagingReady &&
          archivedPayloadCount !== expectedArchivedPayloads.length
        ) {
          validationIssues.push({
            severity: "blocker",
            reason:
              "archived_field_payload row count does not match the deterministic project plan.",
            expectedArchivedPayloadCount: expectedArchivedPayloads.length,
            actualArchivedPayloadCount: archivedPayloadCount,
          });
        }

        if (
          stagingReady &&
          excludedDocumentRows.length !== expectedExcludedDocuments.length
        ) {
          validationIssues.push({
            severity: "blocker",
            reason:
              "excluded_documents row count does not match the deterministic project plan.",
            expectedExcludedDocumentCount: expectedExcludedDocuments.length,
            actualExcludedDocumentCount: excludedDocumentRows.length,
          });
        }

        const archivedPayloadRowsByIdentity = new Map(
          archivedPayloadRows.map(
            (row) => [buildArchivedPayloadIdentity(row), row] as const,
          ),
        );
        const expectedArchivedPayloadKeys = new Set(
          expectedArchivedPayloads.map((expectation) =>
            buildArchivedPayloadIdentity(expectation),
          ),
        );

        for (const expectation of expectedArchivedPayloads) {
          const storedRow = archivedPayloadRowsByIdentity.get(
            buildArchivedPayloadIdentity(expectation),
          );

          if (!storedRow) {
            validationIssues.push({
              severity: "blocker",
              reason: "Expected archived_field_payload row is missing.",
              legacyTable: expectation.legacyTable,
              legacyId: expectation.legacyId,
              targetTable: expectation.targetTable,
              payloadKind: expectation.payloadKind,
            });
            continue;
          }

          if (storedRow.targetCode !== expectation.targetCode) {
            validationIssues.push({
              severity: "blocker",
              reason:
                "archived_field_payload target_code does not match the deterministic plan.",
              legacyTable: expectation.legacyTable,
              legacyId: expectation.legacyId,
              expectedTargetCode: expectation.targetCode,
              actualTargetCode: storedRow.targetCode,
            });
          }

          if (storedRow.archiveReason !== expectation.archiveReason) {
            validationIssues.push({
              severity: "blocker",
              reason:
                "archived_field_payload archive_reason does not match the deterministic plan.",
              legacyTable: expectation.legacyTable,
              legacyId: expectation.legacyId,
              expectedArchiveReason: expectation.archiveReason,
              actualArchiveReason: storedRow.archiveReason,
            });
          }

          if (storedRow.payloadJson !== expectation.payloadJson) {
            validationIssues.push({
              severity: "blocker",
              reason:
                "archived_field_payload payload_json does not match the deterministic plan.",
              legacyTable: expectation.legacyTable,
              legacyId: expectation.legacyId,
              payloadKind: expectation.payloadKind,
            });
          }
        }

        const unexpectedArchivedPayloadRows = archivedPayloadRows.filter(
          (row) =>
            !expectedArchivedPayloadKeys.has(buildArchivedPayloadIdentity(row)),
        );

        if (unexpectedArchivedPayloadRows.length > 0) {
          validationIssues.push({
            severity: "blocker",
            reason:
              "archived_field_payload contains rows outside the project deterministic plan.",
            unexpectedArchivedPayloadRows: unexpectedArchivedPayloadRows.map(
              (row) => ({
                legacyTable: row.legacyTable,
                legacyId: row.legacyId,
                targetTable: row.targetTable,
                payloadKind: row.payloadKind,
              }),
            ),
          });
        }

        const excludedRowsByIdentity = new Map(
          excludedDocumentRows.map(
            (row) => [buildExcludedDocumentIdentity(row), row] as const,
          ),
        );
        const projectMapRowsByIdentity = new Map(
          projectMapRows.map((row) => [buildMapIdentity(row), row] as const),
        );
        const lineMapRowsByIdentity = new Map(
          lineMapRows.map((row) => [buildMapIdentity(row), row] as const),
        );
        const expectedExcludedKeys = new Set(
          expectedExcludedDocuments.map((record) =>
            buildExcludedDocumentIdentity(record),
          ),
        );

        for (const expectation of expectedExcludedDocuments) {
          const storedRow = excludedRowsByIdentity.get(
            buildExcludedDocumentIdentity(expectation),
          );

          if (!storedRow) {
            validationIssues.push({
              severity: "blocker",
              reason: "Expected excluded_documents row is missing.",
              legacyTable: expectation.legacyTable,
              legacyId: expectation.legacyId,
            });
            continue;
          }

          if (storedRow.exclusionReason !== expectation.exclusionReason) {
            validationIssues.push({
              severity: "blocker",
              reason:
                "excluded_documents exclusion_reason does not match the deterministic plan.",
              legacyTable: expectation.legacyTable,
              legacyId: expectation.legacyId,
              expectedExclusionReason: expectation.exclusionReason,
              actualExclusionReason: storedRow.exclusionReason,
            });
          }

          if (storedRow.payloadJson !== expectation.payloadJson) {
            validationIssues.push({
              severity: "blocker",
              reason:
                "excluded_documents payload_json does not match the deterministic plan.",
              legacyTable: expectation.legacyTable,
              legacyId: expectation.legacyId,
            });
          }
        }

        const unexpectedExcludedRows = excludedDocumentRows.filter(
          (row) =>
            !expectedExcludedKeys.has(buildExcludedDocumentIdentity(row)),
        );

        if (unexpectedExcludedRows.length > 0) {
          validationIssues.push({
            severity: "blocker",
            reason:
              "excluded_documents contains rows outside the project deterministic plan.",
            unexpectedExcludedRows: unexpectedExcludedRows.map((row) => ({
              legacyTable: row.legacyTable,
              legacyId: row.legacyId,
            })),
          });
        }

        const projectRowsByProjectCode =
          await getProjectRowsByProjectCode(targetConnection);
        const lineRowsByIdentity =
          await getLineRowsByIdentity(targetConnection);
        const autoCreatedMaterialRowsByCode =
          await getAutoCreatedMaterialRowsByCode(targetConnection);
        const expectedAutoCreatedMaterialCodes = new Set(
          plan.autoCreatedMaterials.map(
            (material) => material.target.materialCode,
          ),
        );

        for (const material of plan.autoCreatedMaterials) {
          const targetRow = autoCreatedMaterialRowsByCode.get(
            material.target.materialCode,
          );

          if (!targetRow) {
            validationIssues.push({
              severity: "blocker",
              reason: "Expected auto-created material row is missing.",
              legacyTable: material.archivedPayload.legacyTable,
              legacyId: material.archivedPayload.legacyId,
              materialCode: material.target.materialCode,
            });
            continue;
          }

          const context = {
            legacyTable: material.archivedPayload.legacyTable,
            legacyId: material.archivedPayload.legacyId,
            materialCode: material.target.materialCode,
          };
          const materialArchivedPayloadRow = archivedPayloadRowsByIdentity.get(
            buildArchivedPayloadIdentity(material.archivedPayload),
          );

          if (!materialArchivedPayloadRow) {
            validationIssues.push({
              severity: "blocker",
              ...context,
              reason:
                "Expected auto-created material archived_field_payload row is missing.",
            });
          } else {
            pushValueMismatch(
              validationIssues,
              context,
              "archived_field_payload.targetId",
              targetRow.id,
              materialArchivedPayloadRow.targetId,
            );
          }

          pushValueMismatch(
            validationIssues,
            context,
            "material.materialName",
            material.target.materialName,
            targetRow.materialName,
          );
          pushValueMismatch(
            validationIssues,
            context,
            "material.specModel",
            material.target.specModel,
            targetRow.specModel,
          );
          pushValueMismatch(
            validationIssues,
            context,
            "material.unitCode",
            material.target.unitCode,
            targetRow.unitCode,
          );
          pushValueMismatch(
            validationIssues,
            context,
            "material.warningMinQty",
            material.target.warningMinQty,
            targetRow.warningMinQty,
          );
          pushValueMismatch(
            validationIssues,
            context,
            "material.warningMaxQty",
            material.target.warningMaxQty,
            targetRow.warningMaxQty,
          );
          pushValueMismatch(
            validationIssues,
            context,
            "material.status",
            material.target.status,
            targetRow.status,
          );
          pushValueMismatch(
            validationIssues,
            context,
            "material.creationMode",
            material.target.creationMode,
            targetRow.creationMode,
          );
          pushValueMismatch(
            validationIssues,
            context,
            "material.sourceDocumentType",
            material.target.sourceDocumentType,
            targetRow.sourceDocumentType,
          );
          pushValueMismatch(
            validationIssues,
            context,
            "material.sourceDocumentId",
            material.target.sourceDocumentId,
            targetRow.sourceDocumentId,
          );
          pushValueMismatch(
            validationIssues,
            context,
            "material.createdBy",
            material.target.createdBy,
            targetRow.createdBy,
          );
          pushValueMismatch(
            validationIssues,
            context,
            "material.updatedBy",
            material.target.updatedBy,
            targetRow.updatedBy,
          );
        }

        const unexpectedAutoCreatedMaterialCodes = [
          ...autoCreatedMaterialRowsByCode.keys(),
        ].filter(
          (materialCode) => !expectedAutoCreatedMaterialCodes.has(materialCode),
        );
        if (unexpectedAutoCreatedMaterialCodes.length > 0) {
          validationIssues.push({
            severity: "blocker",
            reason:
              "material contains ProjectAutoCreatedMaterial rows outside the deterministic plan.",
            unexpectedAutoCreatedMaterialCodes:
              unexpectedAutoCreatedMaterialCodes.sort((left, right) =>
                left.localeCompare(right),
              ),
          });
        }

        for (const project of plan.migratedProjects) {
          const targetRow = projectRowsByProjectCode.get(
            project.target.projectCode,
          );

          if (!targetRow) {
            validationIssues.push({
              severity: "blocker",
              reason: "Expected project row is missing.",
              legacyTable: project.legacyTable,
              legacyId: project.legacyId,
              projectCode: project.target.projectCode,
            });
            continue;
          }

          const context = {
            legacyTable: project.legacyTable,
            legacyId: project.legacyId,
            projectCode: project.target.projectCode,
          };
          const projectMapRow = projectMapRowsByIdentity.get(
            buildMapIdentity(project),
          );
          const projectArchivedPayloadRow = archivedPayloadRowsByIdentity.get(
            buildArchivedPayloadIdentity(project.archivedPayload),
          );

          if (!projectMapRow) {
            validationIssues.push({
              severity: "blocker",
              ...context,
              reason: "Expected project staging map row is missing.",
            });
          } else {
            pushValueMismatch(
              validationIssues,
              context,
              "map_project.targetTable",
              "project",
              projectMapRow.targetTable,
            );
            pushValueMismatch(
              validationIssues,
              context,
              "map_project.targetCode",
              project.target.projectCode,
              projectMapRow.targetCode,
            );
            pushValueMismatch(
              validationIssues,
              context,
              "map_project.targetId",
              targetRow.id,
              projectMapRow.targetId,
            );
          }

          if (!projectArchivedPayloadRow) {
            validationIssues.push({
              severity: "blocker",
              ...context,
              reason: "Expected project archived_field_payload row is missing.",
            });
          } else {
            pushValueMismatch(
              validationIssues,
              context,
              "archived_field_payload.targetId",
              targetRow.id,
              projectArchivedPayloadRow.targetId,
            );
          }

          pushValueMismatch(
            validationIssues,
            context,
            "project.projectName",
            project.target.projectName,
            targetRow.projectName,
          );
          pushValueMismatch(
            validationIssues,
            context,
            "project.bizDate",
            project.target.bizDate,
            targetRow.bizDate,
          );
          pushValueMismatch(
            validationIssues,
            context,
            "project.customerId",
            project.target.customerId,
            targetRow.customerId,
          );
          pushValueMismatch(
            validationIssues,
            context,
            "project.supplierId",
            project.target.supplierId,
            targetRow.supplierId,
          );
          pushValueMismatch(
            validationIssues,
            context,
            "project.managerPersonnelId",
            project.target.managerPersonnelId,
            targetRow.managerPersonnelId,
          );
          pushValueMismatch(
            validationIssues,
            context,
            "project.workshopId",
            project.target.workshopId,
            targetRow.workshopId,
          );
          pushValueMismatch(
            validationIssues,
            context,
            "project.lifecycleStatus",
            project.target.lifecycleStatus,
            targetRow.lifecycleStatus,
          );
          pushValueMismatch(
            validationIssues,
            context,
            "project.auditStatusSnapshot",
            project.target.auditStatusSnapshot,
            targetRow.auditStatusSnapshot,
          );
          pushValueMismatch(
            validationIssues,
            context,
            "project.inventoryEffectStatus",
            project.target.inventoryEffectStatus,
            targetRow.inventoryEffectStatus,
          );
          pushValueMismatch(
            validationIssues,
            context,
            "project.revisionNo",
            project.target.revisionNo,
            targetRow.revisionNo,
          );
          pushValueMismatch(
            validationIssues,
            context,
            "project.customerCodeSnapshot",
            project.target.customerCodeSnapshot,
            targetRow.customerCodeSnapshot,
          );
          pushValueMismatch(
            validationIssues,
            context,
            "project.customerNameSnapshot",
            project.target.customerNameSnapshot,
            targetRow.customerNameSnapshot,
          );
          pushValueMismatch(
            validationIssues,
            context,
            "project.supplierCodeSnapshot",
            project.target.supplierCodeSnapshot,
            targetRow.supplierCodeSnapshot,
          );
          pushValueMismatch(
            validationIssues,
            context,
            "project.supplierNameSnapshot",
            project.target.supplierNameSnapshot,
            targetRow.supplierNameSnapshot,
          );
          pushValueMismatch(
            validationIssues,
            context,
            "project.managerNameSnapshot",
            project.target.managerNameSnapshot,
            targetRow.managerNameSnapshot,
          );
          pushValueMismatch(
            validationIssues,
            context,
            "project.workshopNameSnapshot",
            project.target.workshopNameSnapshot,
            targetRow.workshopNameSnapshot,
          );
          pushValueMismatch(
            validationIssues,
            context,
            "project.totalQty",
            project.target.totalQty,
            targetRow.totalQty,
          );
          pushValueMismatch(
            validationIssues,
            context,
            "project.totalAmount",
            project.target.totalAmount,
            targetRow.totalAmount,
          );
          pushValueMismatch(
            validationIssues,
            context,
            "project.remark",
            project.target.remark,
            targetRow.remark,
          );
          pushValueMismatch(
            validationIssues,
            context,
            "project.voidReason",
            project.target.voidReason,
            targetRow.voidReason,
          );
          pushValueMismatch(
            validationIssues,
            context,
            "project.voidedBy",
            project.target.voidedBy,
            targetRow.voidedBy,
          );
          pushValueMismatch(
            validationIssues,
            context,
            "project.voidedAt",
            project.target.voidedAt,
            targetRow.voidedAt,
          );
          pushValueMismatch(
            validationIssues,
            context,
            "project.createdBy",
            project.target.createdBy,
            targetRow.createdBy,
          );
          pushValueMismatch(
            validationIssues,
            context,
            "project.createdAt",
            project.target.createdAt,
            targetRow.createdAt,
          );
          pushValueMismatch(
            validationIssues,
            context,
            "project.updatedBy",
            project.target.updatedBy,
            targetRow.updatedBy,
          );
          pushValueMismatch(
            validationIssues,
            context,
            "project.updatedAt",
            project.target.updatedAt,
            targetRow.updatedAt,
          );

          for (const line of project.lines) {
            const targetLine = lineRowsByIdentity.get(
              buildLineIdentity(project.target.projectCode, line.target.lineNo),
            );

            if (!targetLine) {
              validationIssues.push({
                severity: "blocker",
                reason: "Expected project_material_line row is missing.",
                legacyTable: line.legacyTable,
                legacyId: line.legacyId,
                projectCode: project.target.projectCode,
                lineNo: line.target.lineNo,
              });
              continue;
            }

            const lineContext = {
              legacyTable: line.legacyTable,
              legacyId: line.legacyId,
              projectCode: project.target.projectCode,
              lineNo: line.target.lineNo,
            };
            const lineMapRow = lineMapRowsByIdentity.get(
              buildMapIdentity(line),
            );
            const lineArchivedPayloadRow = archivedPayloadRowsByIdentity.get(
              buildArchivedPayloadIdentity(line.archivedPayload),
            );

            if (!lineMapRow) {
              validationIssues.push({
                severity: "blocker",
                ...lineContext,
                reason:
                  "Expected project material line staging map row is missing.",
              });
            } else {
              pushValueMismatch(
                validationIssues,
                lineContext,
                "map_project_material_line.targetTable",
                "project_material_line",
                lineMapRow.targetTable,
              );
              pushValueMismatch(
                validationIssues,
                lineContext,
                "map_project_material_line.targetCode",
                line.targetCode,
                lineMapRow.targetCode,
              );
              pushValueMismatch(
                validationIssues,
                lineContext,
                "map_project_material_line.targetId",
                targetLine.id,
                lineMapRow.targetId,
              );
            }

            if (!lineArchivedPayloadRow) {
              validationIssues.push({
                severity: "blocker",
                ...lineContext,
                reason:
                  "Expected project material line archived_field_payload row is missing.",
              });
            } else {
              pushValueMismatch(
                validationIssues,
                lineContext,
                "archived_field_payload.targetId",
                targetLine.id,
                lineArchivedPayloadRow.targetId,
              );
            }

            pushValueMismatch(
              validationIssues,
              lineContext,
              "project_material_line.materialId",
              line.target.materialId,
              targetLine.materialId,
            );
            pushValueMismatch(
              validationIssues,
              lineContext,
              "project_material_line.materialCodeSnapshot",
              line.target.materialCodeSnapshot,
              targetLine.materialCodeSnapshot,
            );
            pushValueMismatch(
              validationIssues,
              lineContext,
              "project_material_line.materialNameSnapshot",
              line.target.materialNameSnapshot,
              targetLine.materialNameSnapshot,
            );
            pushValueMismatch(
              validationIssues,
              lineContext,
              "project_material_line.materialSpecSnapshot",
              line.target.materialSpecSnapshot,
              targetLine.materialSpecSnapshot,
            );
            pushValueMismatch(
              validationIssues,
              lineContext,
              "project_material_line.unitCodeSnapshot",
              line.target.unitCodeSnapshot,
              targetLine.unitCodeSnapshot,
            );
            pushValueMismatch(
              validationIssues,
              lineContext,
              "project_material_line.quantity",
              line.target.quantity,
              targetLine.quantity,
            );
            pushValueMismatch(
              validationIssues,
              lineContext,
              "project_material_line.unitPrice",
              line.target.unitPrice,
              targetLine.unitPrice,
            );
            pushValueMismatch(
              validationIssues,
              lineContext,
              "project_material_line.amount",
              line.target.amount,
              targetLine.amount,
            );
            pushValueMismatch(
              validationIssues,
              lineContext,
              "project_material_line.remark",
              line.target.remark,
              targetLine.remark,
            );
            pushValueMismatch(
              validationIssues,
              lineContext,
              "project_material_line.createdBy",
              line.target.createdBy,
              targetLine.createdBy,
            );
            pushValueMismatch(
              validationIssues,
              lineContext,
              "project_material_line.createdAt",
              line.target.createdAt,
              targetLine.createdAt,
            );
            pushValueMismatch(
              validationIssues,
              lineContext,
              "project_material_line.updatedBy",
              line.target.updatedBy,
              targetLine.updatedBy,
            );
            pushValueMismatch(
              validationIssues,
              lineContext,
              "project_material_line.updatedAt",
              line.target.updatedAt,
              targetLine.updatedAt,
            );
          }
        }

        const pendingRelationByIdentity = new Map(
          pendingRelationRows.map(
            (row) => [buildPendingRelationIdentity(row), row] as const,
          ),
        );

        for (const pendingProject of plan.pendingProjects) {
          for (const pendingLine of pendingProject.pendingLines) {
            const expectedKey = buildPendingRelationIdentity({
              legacyTable: "saifute_composite_product",
              legacyId: pendingProject.legacyId,
              legacyLineId: pendingLine.legacyId,
            });
            const storedRow = pendingRelationByIdentity.get(expectedKey);

            if (!storedRow) {
              validationIssues.push({
                severity: "blocker",
                reason: "Expected pending_relations row is missing.",
                legacyTable: "saifute_composite_product",
                legacyId: pendingProject.legacyId,
                legacyLineId: pendingLine.legacyId,
                relationType: "PROJECT_LINE_MATERIAL",
              });
              continue;
            }

            if (
              storedRow.relationType !==
              PENDING_RELATION_TYPE_PROJECT_LINE_MATERIAL
            ) {
              validationIssues.push({
                severity: "blocker",
                reason:
                  "pending_relations relation_type does not match the deterministic plan.",
                legacyTable: "saifute_composite_product",
                legacyId: pendingProject.legacyId,
                legacyLineId: pendingLine.legacyId,
                expectedRelationType:
                  PENDING_RELATION_TYPE_PROJECT_LINE_MATERIAL,
                actualRelationType: storedRow.relationType,
              });
            }

            const expectedPendingReason = pendingLine.pendingReason.slice(
              0,
              255,
            );
            if (storedRow.pendingReason !== expectedPendingReason) {
              validationIssues.push({
                severity: "blocker",
                reason:
                  "pending_relations pending_reason does not match the deterministic plan.",
                legacyTable: "saifute_composite_product",
                legacyId: pendingProject.legacyId,
                legacyLineId: pendingLine.legacyId,
                expectedPendingReason,
                actualPendingReason: storedRow.pendingReason,
              });
            }

            const expectedPayloadJson = stableJsonStringify({
              ...pendingLine.sourcePayload,
              resolutionEvidence: pendingLine.resolutionEvidence,
            });
            if (storedRow.payloadJson !== expectedPayloadJson) {
              validationIssues.push({
                severity: "blocker",
                reason:
                  "pending_relations payload_json does not match the deterministic plan.",
                legacyTable: "saifute_composite_product",
                legacyId: pendingProject.legacyId,
                legacyLineId: pendingLine.legacyId,
              });
            }
          }
        }

        const cutoverReadiness = buildCutoverReadiness(
          plan,
          downstreamConsumerCounts,
          structuralExclusionsAcknowledged,
        );

        const pendingRelationRuleBreakdown: Record<string, number> = {};
        for (const pendingProject of plan.pendingProjects) {
          for (const pendingLine of pendingProject.pendingLines) {
            const ruleId = pendingLine.resolutionEvidence.ruleId;
            pendingRelationRuleBreakdown[ruleId] =
              (pendingRelationRuleBreakdown[ruleId] ?? 0) + 1;
          }
        }

        return {
          mode: "validate",
          targetDatabaseName,
          migrationBatch: plan.migrationBatch,
          sourceCounts: {
            projects: snapshot.projects.length,
            lines: snapshot.lines.length,
          },
          dependencyBaseline: dependencies.batch1Baseline,
          counts: plan.counts,
          expectedArchivedPayloadCount: expectedArchivedPayloads.length,
          expectedExcludedDocumentCount: expectedExcludedDocuments.length,
          expectedPendingRelationCount,
          targetSummary: {
            projectTargetRows,
            lineTargetRows,
            projectBatchMapRows,
            lineBatchMapRows,
            missingMappedProjects,
            missingMappedLines,
            archivedPayloadCount,
            excludedDocumentCount: excludedDocumentRows.length,
            pendingRelationCount: actualPendingRelationCount,
          },
          autoCreatedMaterialSummary: {
            materialCount: plan.autoCreatedMaterials.length,
            materialCodes: plan.autoCreatedMaterials.map(
              (material) => material.target.materialCode,
            ),
          },
          pendingRelationSummary: {
            expectedPendingRelationCount,
            actualPendingRelationCount,
            pendingProjectCount: plan.pendingProjects.length,
            pendingLineCount: expectedPendingRelationCount,
            ruleBreakdown: Object.fromEntries(
              Object.entries(pendingRelationRuleBreakdown).sort(([a], [b]) =>
                a.localeCompare(b),
              ),
            ),
          },
          cutoverReadiness,
          validationIssues,
        };
      },
    );

    writeStableReport(reportPath, report);
    console.log(`Project validation completed. report=${reportPath}`);

    if (report.validationIssues.some((issue) => issue.severity === "blocker")) {
      process.exitCode = 1;
    }
  } finally {
    await closePools(legacyPool, targetPool);
  }
}

if (require.main === module) {
  void main();
}
