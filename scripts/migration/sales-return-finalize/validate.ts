import {
  assertDistinctSourceAndTargetDatabases,
  assertExpectedDatabaseName,
  EXPECTED_TARGET_DATABASE_NAME,
  loadMigrationEnvironment,
  parseMigrationCliOptions,
  resolveReportPath,
} from "../config";
import { closePools, createMariaDbPool, withPoolConnection } from "../db";
import { BusinessDocumentType } from "../shared/business-document-type";
import {
  readLegacySalesReturnSnapshot,
  readSalesReturnDependencySnapshot,
} from "../sales-return/legacy-reader";
import { buildSalesReturnMigrationPlan } from "../sales-return/transformer";
import { stableJsonStringify } from "../shared/deterministic";
import { writeStableReport } from "../shared/report-writer";
import type { ArchivedRelationDbRow, PendingRelationDbRow } from "./types";
import { FINALIZE_LEGACY_TABLE, FINALIZE_ORIGINATING_BATCH } from "./types";

const SALES_STOCK_DOCUMENT_TYPE = BusinessDocumentType.SalesStockOrder;

interface ExcludedDocumentDbRow {
  legacyTable: string;
  legacyId: number;
  exclusionReason: string;
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
        AND target_table IN ('sales_stock_order', 'sales_stock_order_line')
    `,
    [migrationBatch],
  );

  return Number(rows[0]?.total ?? 0);
}

async function getForbiddenTableCounts(connection: {
  query<T = unknown>(sql: string, values?: readonly unknown[]): Promise<T>;
}): Promise<Record<string, number>> {
  const rows = await connection.query<
    Array<{ tableName: string; total: number }>
  >(
    `
      SELECT 'approval_document' AS tableName, COUNT(*) AS total
      FROM approval_document
      WHERE documentFamily = 'SALES_STOCK' OR documentType = '${SALES_STOCK_DOCUMENT_TYPE}'
      UNION ALL
      SELECT 'document_relation' AS tableName, COUNT(*) AS total
      FROM document_relation
      WHERE upstreamFamily = 'SALES_STOCK'
         OR downstreamFamily = 'SALES_STOCK'
         OR upstreamDocumentType = '${SALES_STOCK_DOCUMENT_TYPE}'
         OR downstreamDocumentType = '${SALES_STOCK_DOCUMENT_TYPE}'
      UNION ALL
      SELECT 'document_line_relation' AS tableName, COUNT(*) AS total
      FROM document_line_relation
      WHERE upstreamFamily = 'SALES_STOCK'
         OR downstreamFamily = 'SALES_STOCK'
         OR upstreamDocumentType = '${SALES_STOCK_DOCUMENT_TYPE}'
         OR downstreamDocumentType = '${SALES_STOCK_DOCUMENT_TYPE}'
      UNION ALL
      SELECT 'factory_number_reservation' AS tableName, COUNT(*) AS total
      FROM factory_number_reservation fnr
      INNER JOIN sales_stock_order cso
        ON cso.id = fnr.businessDocumentId
      WHERE fnr.businessDocumentType = '${SALES_STOCK_DOCUMENT_TYPE}'
        AND cso.orderType = 'SALES_RETURN'
      UNION ALL
      SELECT 'inventory_balance' AS tableName, COUNT(*) AS total
      FROM inventory_balance
      UNION ALL
      SELECT 'inventory_log' AS tableName, COUNT(*) AS total
      FROM inventory_log
      WHERE businessDocumentType = '${SALES_STOCK_DOCUMENT_TYPE}'
      UNION ALL
      SELECT 'inventory_source_usage' AS tableName, COUNT(*) AS total
      FROM inventory_source_usage
      WHERE consumerDocumentType = '${SALES_STOCK_DOCUMENT_TYPE}'
    `,
  );

  return Object.fromEntries(
    rows.map((row) => [row.tableName, Number(row.total)] as const),
  );
}

async function main(): Promise<void> {
  const cliOptions = parseMigrationCliOptions();
  const reportPath = resolveReportPath(
    cliOptions,
    "sales-return-finalize-validate-report.json",
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

  const legacyPool = createMariaDbPool(env.legacyDatabaseUrl ?? "");
  const targetPool = createMariaDbPool(env.databaseUrl);

  try {
    const batch3cPlan = await withPoolConnection(
      legacyPool,
      async (legacyConnection) => {
        const snapshot = await readLegacySalesReturnSnapshot(legacyConnection);
        const dependencies = await withPoolConnection(
          targetPool,
          async (targetConnection) =>
            readSalesReturnDependencySnapshot(targetConnection),
        );
        const batch3cPlan = buildSalesReturnMigrationPlan(
          snapshot,
          dependencies,
        );

        return batch3cPlan;
      },
    );

    const deterministicPendingRelations = batch3cPlan.pendingRelations;
    const expectedArchivedRelations = buildExpectedArchiveFromPendingPlan(
      deterministicPendingRelations,
    );

    const expectedAffectedLegacyIds = new Set(
      deterministicPendingRelations.map((r) => r.legacyId),
    );
    const expectedBatchOwnedOrderCount = batch3cPlan.admittedOrders.length;
    const expectedBatchOwnedLineCount = batch3cPlan.admittedOrders.reduce(
      (sum, order) => sum + order.lines.length,
      0,
    );
    const expectedArchivedPayloadCount = batch3cPlan.admittedOrders.reduce(
      (sum, order) => sum + 1 + order.lines.length,
      0,
    );
    const expectedExcludedDocumentCount = batch3cPlan.excludedDocuments.length;

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
              "map_sales_stock_order",
              FINALIZE_ORIGINATING_BATCH,
            )
          : 0;
        const batchLineMapRows = stagingReady
          ? await getBatchMapRowCount(
              targetConnection,
              "map_sales_stock_order_line",
              FINALIZE_ORIGINATING_BATCH,
            )
          : 0;
        const batchOwnedOrderRows = stagingReady
          ? await getBatchOwnedTargetRowCount(
              targetConnection,
              "map_sales_stock_order",
              "sales_stock_order",
              FINALIZE_ORIGINATING_BATCH,
            )
          : 0;
        const batchOwnedLineRows = stagingReady
          ? await getBatchOwnedTargetRowCount(
              targetConnection,
              "map_sales_stock_order_line",
              "sales_stock_order_line",
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

        const batchPendingRelationCount = batchPendingRelationRows.length;
        const batchArchivedRelationCount = batchArchivedRelationRows.length;

        if (stagingReady && batchPendingRelationCount > 0) {
          validationIssues.push({
            severity: "blocker",
            reason:
              "batch3c sales-return pending_relations still contains rows after finalization. Finalization did not complete successfully.",
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
              "excluded_documents row count no longer matches the deterministic batch3c sales-return plan.",
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
              "map_sales_stock_order row count changed during finalization.",
            expectedBatchOwnedOrderCount,
            actualBatchOrderMapRows: batchOrderMapRows,
          });
        }

        if (stagingReady && batchLineMapRows !== expectedBatchOwnedLineCount) {
          validationIssues.push({
            severity: "blocker",
            reason:
              "map_sales_stock_order_line row count changed during finalization.",
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
              "Batch-owned sales_stock_order row count drifted from the deterministic batch3c baseline.",
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
              "Batch-owned sales_stock_order_line row count drifted from the deterministic batch3c baseline.",
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

        for (const [tableName, total] of Object.entries(forbiddenTableCounts)) {
          if (total > 0) {
            validationIssues.push({
              severity: "blocker",
              reason:
                "A table that must remain untouched by the finalization slice already contains SalesStockOrder-linked rows.",
              tableName,
              total,
            });
          }
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
            preservedBatch3cSurfaceCounts: {
              salesStockOrderRows: {
                expected: expectedBatchOwnedOrderCount,
                actual: batchOwnedOrderRows,
              },
              salesStockOrderLineRows: {
                expected: expectedBatchOwnedLineCount,
                actual: batchOwnedLineRows,
              },
              mapSalesStockOrderRows: {
                expected: expectedBatchOwnedOrderCount,
                actual: batchOrderMapRows,
              },
              mapSalesStockOrderLineRows: {
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
            ? "Excluded sales-return headers remain non-empty. Manual business sign-off is required before cutover."
            : "No excluded sales-return documents remain.",
          validationIssues,
        };
      },
    );

    writeStableReport(reportPath, report);
    console.log(
      `Sales-return finalization validate completed. report=${reportPath}`,
    );

    if (report.validationIssues.some((issue) => issue.severity === "blocker")) {
      process.exitCode = 1;
    }
  } finally {
    await closePools(legacyPool, targetPool);
  }
}

void main();
