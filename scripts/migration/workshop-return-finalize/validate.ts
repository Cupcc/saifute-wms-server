import { readFileSync } from "node:fs";
import { join } from "node:path";
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
import {
  readLegacyWorkshopReturnSnapshot,
  readWorkshopReturnDependencySnapshot,
} from "../workshop-return/legacy-reader";
import { buildWorkshopReturnMigrationPlan } from "../workshop-return/transformer";
import type { ArchivedRelationDbRow, PendingRelationDbRow } from "./types";
import { FINALIZE_LEGACY_TABLE, FINALIZE_ORIGINATING_BATCH } from "./types";

interface ExcludedDocumentDbRow {
  legacyTable: string;
  legacyId: number;
  exclusionReason: string;
}

interface ForbiddenTableCounts {
  document_relation: number;
  document_line_relation: number;
  audit_document: number;
  inventory_balance: number;
  inventory_log: number;
  inventory_source_usage: number;
  factory_number_reservation: number;
}

function buildRelationIdentity(input: {
  legacyTable: string;
  legacyId: number;
  legacyLineId: number | null;
}): string {
  return `${input.legacyTable}::${input.legacyId}::${input.legacyLineId ?? "null"}`;
}

function buildExcludedIdentity(input: {
  legacyTable: string;
  legacyId: number;
}): string {
  return `${input.legacyTable}::${input.legacyId}`;
}

function buildExpectedArchiveFromPendingPlan(
  pendingRelations: Array<{
    legacyTable: string;
    legacyId: number;
    legacyLineId: number;
    pendingReason: string;
    payload: Record<string, unknown>;
  }>,
): Array<{
  legacyTable: string;
  legacyId: number;
  legacyLineId: number;
  archiveReason: string;
  payloadJson: string;
}> {
  return [...pendingRelations]
    .sort(
      (left, right) =>
        left.legacyTable.localeCompare(right.legacyTable) ||
        left.legacyId - right.legacyId ||
        left.legacyLineId - right.legacyLineId,
    )
    .map((record) => ({
      legacyTable: record.legacyTable,
      legacyId: record.legacyId,
      legacyLineId: record.legacyLineId,
      archiveReason: record.pendingReason,
      payloadJson: stableJsonStringify(record.payload),
    }));
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

async function getBatchPendingRelationRows(
  connection: {
    query<T = unknown>(sql: string, values?: readonly unknown[]): Promise<T>;
  },
  migrationBatch: string,
): Promise<PendingRelationDbRow[]> {
  return connection.query<PendingRelationDbRow[]>(
    `
      SELECT
        legacy_table AS legacyTable,
        legacy_id AS legacyId,
        legacy_line_id AS legacyLineId,
        pending_reason AS pendingReason,
        payload_json AS payloadJson
      FROM migration_staging.pending_relations
      WHERE migration_batch = ?
        AND legacy_table IN (?)
      ORDER BY legacy_table ASC, legacy_id ASC, legacy_line_id ASC
    `,
    [migrationBatch, FINALIZE_LEGACY_TABLE],
  );
}

async function getBatchArchivedRelationRows(
  connection: {
    query<T = unknown>(sql: string, values?: readonly unknown[]): Promise<T>;
  },
  migrationBatch: string,
): Promise<ArchivedRelationDbRow[]> {
  return connection.query<ArchivedRelationDbRow[]>(
    `
      SELECT
        legacy_table AS legacyTable,
        legacy_id AS legacyId,
        legacy_line_id AS legacyLineId,
        archive_reason AS archiveReason,
        payload_json AS payloadJson
      FROM migration_staging.archived_relations
      WHERE migration_batch = ?
        AND legacy_table IN (?)
      ORDER BY legacy_table ASC, legacy_id ASC, legacy_line_id ASC
    `,
    [migrationBatch, FINALIZE_LEGACY_TABLE],
  );
}

async function getBatchExcludedDocumentRows(
  connection: {
    query<T = unknown>(sql: string, values?: readonly unknown[]): Promise<T>;
  },
  migrationBatch: string,
): Promise<ExcludedDocumentDbRow[]> {
  return connection.query<ExcludedDocumentDbRow[]>(
    `
      SELECT
        legacy_table AS legacyTable,
        legacy_id AS legacyId,
        exclusion_reason AS exclusionReason
      FROM migration_staging.excluded_documents
      WHERE migration_batch = ?
        AND legacy_table IN (?)
      ORDER BY legacy_table ASC, legacy_id ASC
    `,
    [migrationBatch, FINALIZE_LEGACY_TABLE],
  );
}

async function getBatchMapRowCount(
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

async function getBatchOwnedTargetRowCount(
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
      FROM ${targetTableName} target_row
      INNER JOIN migration_staging.${mapTableName} map_row
        ON map_row.target_id = target_row.id
      WHERE map_row.migration_batch = ?
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
        AND target_table IN ('workshop_material_order', 'workshop_material_order_line')
    `,
    [migrationBatch],
  );

  return Number(rows[0]?.total ?? 0);
}

async function getBatch3bPickBaselineCounts(connection: {
  query<T = unknown>(sql: string, values?: readonly unknown[]): Promise<T>;
}): Promise<{
  pickOrderMapCount: number;
  pickLineMapCount: number;
  pickExcludedCount: number;
}> {
  const BATCH3B = "batch3b-workshop-pick-base";
  const rows = await connection.query<
    Array<{
      pickOrderMapCount: number;
      pickLineMapCount: number;
      pickExcludedCount: number;
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
            AND legacy_table = 'saifute_pick_order')        AS pickExcludedCount
    `,
    [BATCH3B, BATCH3B, BATCH3B],
  );

  const row = rows[0] ?? {
    pickOrderMapCount: 0,
    pickLineMapCount: 0,
    pickExcludedCount: 0,
  };

  return {
    pickOrderMapCount: Number(row.pickOrderMapCount),
    pickLineMapCount: Number(row.pickLineMapCount),
    pickExcludedCount: Number(row.pickExcludedCount),
  };
}

async function getForbiddenTableCounts(connection: {
  query<T = unknown>(sql: string, values?: readonly unknown[]): Promise<T>;
}): Promise<ForbiddenTableCounts> {
  const rows = await connection.query<
    Array<{
      document_relation: number;
      document_line_relation: number;
      audit_document: number;
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
        (SELECT COUNT(*) FROM audit_document)        AS audit_document,
        (SELECT COUNT(*) FROM inventory_balance)              AS inventory_balance,
        (SELECT COUNT(*) FROM inventory_log)                  AS inventory_log,
        (SELECT COUNT(*) FROM inventory_source_usage)         AS inventory_source_usage,
        (SELECT COUNT(*) FROM factory_number_reservation)     AS factory_number_reservation
    `,
  );

  const row = rows[0] ?? {
    document_relation: 0,
    document_line_relation: 0,
    audit_document: 0,
    inventory_balance: 0,
    inventory_log: 0,
    inventory_source_usage: 0,
    factory_number_reservation: 0,
  };

  return {
    document_relation: Number(row.document_relation),
    document_line_relation: Number(row.document_line_relation),
    audit_document: Number(row.audit_document),
    inventory_balance: Number(row.inventory_balance),
    inventory_log: Number(row.inventory_log),
    inventory_source_usage: Number(row.inventory_source_usage),
    factory_number_reservation: Number(row.factory_number_reservation),
  };
}

function readForbiddenTableBaseline(
  validateReportPath: string,
): ForbiddenTableCounts | null {
  try {
    const parsed = JSON.parse(readFileSync(validateReportPath, "utf8")) as {
      forbiddenTableCounts?: ForbiddenTableCounts;
    };
    return parsed.forbiddenTableCounts ?? null;
  } catch {
    return null;
  }
}

async function main(): Promise<void> {
  const cliOptions = parseMigrationCliOptions();
  const reportPath = resolveReportPath(
    cliOptions,
    "workshop-return-finalize-validate-report.json",
  );
  const env = loadMigrationEnvironment({ requireLegacyDatabaseUrl: true });
  const targetDatabaseName = assertExpectedDatabaseName(
    env.databaseUrl,
    EXPECTED_TARGET_DATABASE_NAME,
    "Target",
  );
  assertDistinctSourceAndTargetDatabases(
    env.legacyDatabaseUrl,
    env.databaseUrl,
  );

  const workshopReturnValidateReportPath = join(
    process.cwd(),
    "scripts",
    "migration",
    "reports",
    "workshop-return-validate-report.json",
  );
  const forbiddenTableBaseline = readForbiddenTableBaseline(
    workshopReturnValidateReportPath,
  );

  const legacyPool = createMariaDbPool(env.legacyDatabaseUrl ?? "");
  const targetPool = createMariaDbPool(env.databaseUrl);

  try {
    const batch3ePlan = await withPoolConnection(
      legacyPool,
      async (legacyConnection) => {
        const snapshot =
          await readLegacyWorkshopReturnSnapshot(legacyConnection);
        const dependencies = await withPoolConnection(
          targetPool,
          async (targetConnection) =>
            readWorkshopReturnDependencySnapshot(targetConnection),
        );
        return buildWorkshopReturnMigrationPlan(snapshot, dependencies);
      },
    );

    const deterministicPendingRelations = batch3ePlan.pendingRelations;
    const expectedArchivedRelations = buildExpectedArchiveFromPendingPlan(
      deterministicPendingRelations,
    );

    const expectedAffectedLegacyIds = new Set(
      deterministicPendingRelations.map((r) => r.legacyId),
    );
    const expectedBatchOwnedOrderCount = batch3ePlan.admittedOrders.length;
    const expectedBatchOwnedLineCount = batch3ePlan.admittedOrders.reduce(
      (sum, order) => sum + order.lines.length,
      0,
    );
    const expectedArchivedPayloadCount = batch3ePlan.admittedOrders.reduce(
      (sum, order) => sum + 1 + order.lines.length,
      0,
    );
    const expectedExcludedDocumentCount = batch3ePlan.excludedDocuments.length;

    const EXPECTED_BATCH3B_PICK_ORDER_MAP_COUNT = 61;
    const EXPECTED_BATCH3B_PICK_LINE_MAP_COUNT = 145;
    const EXPECTED_BATCH3B_PICK_EXCLUDED_COUNT = 14;

    const report = await withPoolConnection(
      targetPool,
      async (targetConnection) => {
        const validationIssues: Array<Record<string, unknown>> = [];
        const stagingReady = await stagingSchemaExists(targetConnection);

        if (!stagingReady) {
          validationIssues.push({
            severity: "blocker",
            reason: "migration_staging schema does not exist.",
          });
        }

        const batchPendingRelationRows = stagingReady
          ? await getBatchPendingRelationRows(
              targetConnection,
              FINALIZE_ORIGINATING_BATCH,
            )
          : [];
        const batchArchivedRelationRows = stagingReady
          ? await getBatchArchivedRelationRows(
              targetConnection,
              FINALIZE_ORIGINATING_BATCH,
            )
          : [];
        const excludedDocumentRows = stagingReady
          ? await getBatchExcludedDocumentRows(
              targetConnection,
              FINALIZE_ORIGINATING_BATCH,
            )
          : [];
        const batchOrderMapRows = stagingReady
          ? await getBatchMapRowCount(
              targetConnection,
              "map_workshop_material_order",
              FINALIZE_ORIGINATING_BATCH,
            )
          : 0;
        const batchLineMapRows = stagingReady
          ? await getBatchMapRowCount(
              targetConnection,
              "map_workshop_material_order_line",
              FINALIZE_ORIGINATING_BATCH,
            )
          : 0;
        const batchOwnedOrderRows = stagingReady
          ? await getBatchOwnedTargetRowCount(
              targetConnection,
              "map_workshop_material_order",
              "workshop_material_order",
              FINALIZE_ORIGINATING_BATCH,
            )
          : 0;
        const batchOwnedLineRows = stagingReady
          ? await getBatchOwnedTargetRowCount(
              targetConnection,
              "map_workshop_material_order_line",
              "workshop_material_order_line",
              FINALIZE_ORIGINATING_BATCH,
            )
          : 0;
        const archivedPayloadCount = stagingReady
          ? await getArchivedPayloadCount(
              targetConnection,
              FINALIZE_ORIGINATING_BATCH,
            )
          : 0;
        const forbiddenTableCounts =
          await getForbiddenTableCounts(targetConnection);
        const batch3bPickCounts =
          await getBatch3bPickBaselineCounts(targetConnection);

        const batchPendingRelationCount = batchPendingRelationRows.length;
        const batchArchivedRelationCount = batchArchivedRelationRows.length;

        if (stagingReady && batchPendingRelationCount > 0) {
          validationIssues.push({
            severity: "blocker",
            reason:
              "batch3e workshop-return pending_relations still contains rows after finalization. Finalization did not complete successfully.",
            batchPendingRelationCount,
            pendingRows: batchPendingRelationRows.map((row) => ({
              legacyTable: row.legacyTable,
              legacyId: row.legacyId,
              legacyLineId: row.legacyLineId,
              pendingReason: row.pendingReason,
            })),
          });
        }

        if (
          stagingReady &&
          batchArchivedRelationCount !== expectedArchivedRelations.length
        ) {
          validationIssues.push({
            severity: "blocker",
            reason:
              "archived_relations row count does not match the deterministic former pending plan.",
            expectedArchivedRelationCount: expectedArchivedRelations.length,
            actualArchivedRelationCount: batchArchivedRelationCount,
          });
        }

        const expectedArchivedByIdentity = new Map(
          expectedArchivedRelations.map((record) => [
            buildRelationIdentity(record),
            record,
          ]),
        );

        const unexpectedArchivedRows: ArchivedRelationDbRow[] = [];
        const mismatchedArchivedReasonRows: Array<{
          legacyTable: string;
          legacyId: number;
          legacyLineId: number | null;
          expectedArchiveReason: string;
          actualArchiveReason: string;
        }> = [];
        const mismatchedArchivedPayloadRows: Array<{
          legacyTable: string;
          legacyId: number;
          legacyLineId: number | null;
        }> = [];

        for (const row of batchArchivedRelationRows) {
          const expectedRelation = expectedArchivedByIdentity.get(
            buildRelationIdentity(row),
          );

          if (!expectedRelation) {
            unexpectedArchivedRows.push(row);
          } else if (row.archiveReason !== expectedRelation.archiveReason) {
            mismatchedArchivedReasonRows.push({
              legacyTable: row.legacyTable,
              legacyId: row.legacyId,
              legacyLineId: row.legacyLineId,
              expectedArchiveReason: expectedRelation.archiveReason,
              actualArchiveReason: row.archiveReason,
            });
          } else if (row.payloadJson !== expectedRelation.payloadJson) {
            mismatchedArchivedPayloadRows.push({
              legacyTable: row.legacyTable,
              legacyId: row.legacyId,
              legacyLineId: row.legacyLineId,
            });
          }
        }

        if (unexpectedArchivedRows.length > 0) {
          validationIssues.push({
            severity: "blocker",
            reason:
              "archived_relations contains rows whose identity is not in the deterministic former pending plan.",
            unexpectedCount: unexpectedArchivedRows.length,
            unexpectedRows: unexpectedArchivedRows.map((row) => ({
              legacyTable: row.legacyTable,
              legacyId: row.legacyId,
              legacyLineId: row.legacyLineId,
            })),
          });
        }

        if (mismatchedArchivedReasonRows.length > 0) {
          validationIssues.push({
            severity: "blocker",
            reason:
              "archived_relations archive_reason does not match the expected reason from the former pending plan.",
            mismatchedArchivedReasonRows,
          });
        }

        if (mismatchedArchivedPayloadRows.length > 0) {
          validationIssues.push({
            severity: "blocker",
            reason:
              "archived_relations payload_json does not match the deterministic payload derived from the former pending plan.",
            mismatchedArchivedPayloadRows,
          });
        }

        const excludedDocumentsByIdentity = new Map(
          excludedDocumentRows.map((row) => [buildExcludedIdentity(row), row]),
        );

        const archivedHeadersMissingFromExcluded: number[] = [];

        for (const affectedLegacyId of expectedAffectedLegacyIds) {
          const identity = buildExcludedIdentity({
            legacyTable: FINALIZE_LEGACY_TABLE,
            legacyId: affectedLegacyId,
          });

          if (!excludedDocumentsByIdentity.has(identity)) {
            archivedHeadersMissingFromExcluded.push(affectedLegacyId);
          }
        }

        if (archivedHeadersMissingFromExcluded.length > 0) {
          validationIssues.push({
            severity: "blocker",
            reason:
              "Some archived relation headers are missing from excluded_documents. Exclusion visibility is broken.",
            missingCount: archivedHeadersMissingFromExcluded.length,
            missingLegacyIds: archivedHeadersMissingFromExcluded,
          });
        }

        if (
          stagingReady &&
          excludedDocumentRows.length !== expectedExcludedDocumentCount
        ) {
          validationIssues.push({
            severity: "blocker",
            reason:
              "excluded_documents row count no longer matches the deterministic batch3e workshop-return plan.",
            expectedExcludedDocumentCount,
            actualExcludedDocumentCount: excludedDocumentRows.length,
          });
        }

        if (
          stagingReady &&
          batchOrderMapRows !== expectedBatchOwnedOrderCount
        ) {
          validationIssues.push({
            severity: "blocker",
            reason:
              "map_workshop_material_order row count changed during finalization.",
            expectedBatchOwnedOrderCount,
            actualBatchOrderMapRows: batchOrderMapRows,
          });
        }

        if (stagingReady && batchLineMapRows !== expectedBatchOwnedLineCount) {
          validationIssues.push({
            severity: "blocker",
            reason:
              "map_workshop_material_order_line row count changed during finalization.",
            expectedBatchOwnedLineCount,
            actualBatchLineMapRows: batchLineMapRows,
          });
        }

        if (
          stagingReady &&
          batchOwnedOrderRows !== expectedBatchOwnedOrderCount
        ) {
          validationIssues.push({
            severity: "blocker",
            reason:
              "Batch-owned workshop_material_order row count drifted from the deterministic batch3e baseline.",
            expectedBatchOwnedOrderCount,
            actualBatchOwnedOrderRows: batchOwnedOrderRows,
          });
        }

        if (
          stagingReady &&
          batchOwnedLineRows !== expectedBatchOwnedLineCount
        ) {
          validationIssues.push({
            severity: "blocker",
            reason:
              "Batch-owned workshop_material_order_line row count drifted from the deterministic batch3e baseline.",
            expectedBatchOwnedLineCount,
            actualBatchOwnedLineRows: batchOwnedLineRows,
          });
        }

        if (
          stagingReady &&
          archivedPayloadCount !== expectedArchivedPayloadCount
        ) {
          validationIssues.push({
            severity: "blocker",
            reason:
              "archived_field_payload row count changed during finalization.",
            expectedArchivedPayloadCount,
            actualArchivedPayloadCount: archivedPayloadCount,
          });
        }

        if (forbiddenTableBaseline !== null) {
          for (const key of Object.keys(forbiddenTableCounts) as Array<
            keyof ForbiddenTableCounts
          >) {
            if (forbiddenTableCounts[key] !== forbiddenTableBaseline[key]) {
              validationIssues.push({
                severity: "blocker",
                reason:
                  "A forbidden table count changed during finalization. The finalization slice must not write to these tables.",
                tableName: key,
                expectedCount: forbiddenTableBaseline[key],
                actualCount: forbiddenTableCounts[key],
              });
            }
          }
        }

        if (
          batch3bPickCounts.pickOrderMapCount !==
          EXPECTED_BATCH3B_PICK_ORDER_MAP_COUNT
        ) {
          validationIssues.push({
            severity: "blocker",
            reason: "batch3b pick order map count changed during finalization.",
            expectedCount: EXPECTED_BATCH3B_PICK_ORDER_MAP_COUNT,
            actualCount: batch3bPickCounts.pickOrderMapCount,
          });
        }

        if (
          batch3bPickCounts.pickLineMapCount !==
          EXPECTED_BATCH3B_PICK_LINE_MAP_COUNT
        ) {
          validationIssues.push({
            severity: "blocker",
            reason: "batch3b pick line map count changed during finalization.",
            expectedCount: EXPECTED_BATCH3B_PICK_LINE_MAP_COUNT,
            actualCount: batch3bPickCounts.pickLineMapCount,
          });
        }

        if (
          batch3bPickCounts.pickExcludedCount !==
          EXPECTED_BATCH3B_PICK_EXCLUDED_COUNT
        ) {
          validationIssues.push({
            severity: "blocker",
            reason:
              "batch3b pick excluded document count changed during finalization.",
            expectedCount: EXPECTED_BATCH3B_PICK_EXCLUDED_COUNT,
            actualCount: batch3bPickCounts.pickExcludedCount,
          });
        }

        const businessSignOffRequired = excludedDocumentRows.length > 0;

        const finalizationComplete =
          stagingReady &&
          batchPendingRelationCount === 0 &&
          batchArchivedRelationCount === expectedArchivedRelations.length &&
          !validationIssues.some((issue) => issue.severity === "blocker");

        return {
          mode: "validate",
          targetDatabaseName,
          originatingBatch: FINALIZE_ORIGINATING_BATCH,
          sliceType: "archive/finalization",
          deterministicPendingPlanCount: deterministicPendingRelations.length,
          expectedArchivedRelationCount: expectedArchivedRelations.length,
          expectedExcludedDocumentCount,
          expectedArchivedPayloadCount,
          targetSummary: {
            batchPendingRelationCount,
            batchArchivedRelationCount,
            excludedDocumentCount: excludedDocumentRows.length,
            batchOwnedOrderRows,
            batchOwnedLineRows,
            batchOrderMapRows,
            batchLineMapRows,
            archivedPayloadCount,
            forbiddenTableCounts,
            forbiddenTableBaseline: forbiddenTableBaseline ?? "unavailable",
            batch3bPickBaselinePreservation: {
              pickOrderMapCount: batch3bPickCounts.pickOrderMapCount,
              expectedPickOrderMapCount: EXPECTED_BATCH3B_PICK_ORDER_MAP_COUNT,
              pickLineMapCount: batch3bPickCounts.pickLineMapCount,
              expectedPickLineMapCount: EXPECTED_BATCH3B_PICK_LINE_MAP_COUNT,
              pickExcludedCount: batch3bPickCounts.pickExcludedCount,
              expectedPickExcludedCount: EXPECTED_BATCH3B_PICK_EXCLUDED_COUNT,
            },
            preservedBatch3eSurfaceCounts: {
              workshopMaterialOrderRows: {
                expected: expectedBatchOwnedOrderCount,
                actual: batchOwnedOrderRows,
              },
              workshopMaterialOrderLineRows: {
                expected: expectedBatchOwnedLineCount,
                actual: batchOwnedLineRows,
              },
              mapWorkshopMaterialOrderRows: {
                expected: expectedBatchOwnedOrderCount,
                actual: batchOrderMapRows,
              },
              mapWorkshopMaterialOrderLineRows: {
                expected: expectedBatchOwnedLineCount,
                actual: batchLineMapRows,
              },
              archivedFieldPayloadRows: {
                expected: expectedArchivedPayloadCount,
                actual: archivedPayloadCount,
              },
            },
            archivedRelationIdentitySummary: batchArchivedRelationRows.map(
              (row) => ({
                legacyTable: row.legacyTable,
                legacyId: row.legacyId,
                legacyLineId: row.legacyLineId,
                archiveReason: row.archiveReason,
              }),
            ),
            excludedDocumentSummary: excludedDocumentRows.map((row) => ({
              legacyTable: row.legacyTable,
              legacyId: row.legacyId,
              exclusionReason: row.exclusionReason,
            })),
          },
          finalizationComplete,
          businessSignOffRequired,
          businessSignOffNote: businessSignOffRequired
            ? "Excluded workshop-return headers remain non-empty. Manual business sign-off is required before cutover."
            : "No excluded workshop-return documents remain.",
          validationIssues,
        };
      },
    );

    writeStableReport(reportPath, report);
    console.log(
      `Workshop-return finalization validate completed. report=${reportPath}`,
    );

    if (report.validationIssues.some((issue) => issue.severity === "blocker")) {
      process.exitCode = 1;
    }
  } finally {
    await closePools(legacyPool, targetPool);
  }
}

void main();
