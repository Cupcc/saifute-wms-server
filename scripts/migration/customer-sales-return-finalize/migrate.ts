import {
  assertDistinctSourceAndTargetDatabases,
  assertExpectedDatabaseName,
  EXPECTED_TARGET_DATABASE_NAME,
  loadMigrationEnvironment,
  parseMigrationCliOptions,
  resolveReportPath,
} from "../config";
import {
  readLegacySalesReturnSnapshot,
  readSalesReturnDependencySnapshot,
} from "../customer-sales-return/legacy-reader";
import { buildSalesReturnMigrationPlan } from "../customer-sales-return/transformer";
import { closePools, createMariaDbPool, withPoolConnection } from "../db";
import { writeStableReport } from "../shared/report-writer";
import { buildAlreadyArchivedMismatchBlockers } from "./execute-guard";
import {
  buildDryRunSummary,
  buildFinalizationPlan,
  hasFinalizationBlockers,
} from "./planner";
import type {
  ArchivedRelationDbRow,
  FinalizationPlan,
  PendingRelationDbRow,
} from "./types";
import { FINALIZE_LEGACY_TABLE, FINALIZE_ORIGINATING_BATCH } from "./types";
import { executeFinalizationPlan } from "./writer";

interface ExcludedDocumentDbRow {
  legacyTable: string;
  legacyId: number;
  exclusionReason: string;
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

async function readBatchPendingRelations(
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

async function readBatchArchivedRelations(
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

async function readBatchExcludedDocuments(
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

function buildExcludedDocumentSignOffSummary(
  plan: FinalizationPlan,
  excludedDocumentRows: ExcludedDocumentDbRow[],
): {
  currentExcludedDocumentCount: number;
  affectedExcludedDocumentCount: number;
  excludedDocumentSummary: Array<{
    legacyTable: string;
    legacyId: number;
    exclusionReason: string;
  }>;
  affectedExcludedDocumentSummary: Array<{
    legacyTable: string;
    legacyId: number;
    exclusionReason: string;
    archivedRelationCount: number;
    archivedRelationLineIds: number[];
  }>;
  missingAffectedExcludedLegacyIds: number[];
} {
  const affectedLegacyIdSet = new Set(plan.affectedLegacyIds);
  const archivedLineIdsByLegacyId = new Map<number, number[]>();

  for (const candidate of plan.archiveCandidates) {
    const lineIds = archivedLineIdsByLegacyId.get(candidate.legacyId) ?? [];
    lineIds.push(candidate.legacyLineId);
    archivedLineIdsByLegacyId.set(candidate.legacyId, lineIds);
  }

  const affectedExcludedDocumentSummary = excludedDocumentRows
    .filter((row) => affectedLegacyIdSet.has(row.legacyId))
    .map((row) => ({
      legacyTable: row.legacyTable,
      legacyId: row.legacyId,
      exclusionReason: row.exclusionReason,
      archivedRelationCount:
        archivedLineIdsByLegacyId.get(row.legacyId)?.length ?? 0,
      archivedRelationLineIds: [
        ...(archivedLineIdsByLegacyId.get(row.legacyId) ?? []),
      ].sort((left, right) => left - right),
    }));

  const currentExcludedLegacyIds = new Set(
    excludedDocumentRows.map((row) => row.legacyId),
  );
  const missingAffectedExcludedLegacyIds = plan.affectedLegacyIds.filter(
    (legacyId) => !currentExcludedLegacyIds.has(legacyId),
  );

  return {
    currentExcludedDocumentCount: excludedDocumentRows.length,
    affectedExcludedDocumentCount: affectedExcludedDocumentSummary.length,
    excludedDocumentSummary: excludedDocumentRows.map((row) => ({
      legacyTable: row.legacyTable,
      legacyId: row.legacyId,
      exclusionReason: row.exclusionReason,
    })),
    affectedExcludedDocumentSummary,
    missingAffectedExcludedLegacyIds,
  };
}

async function main(): Promise<void> {
  const cliOptions = parseMigrationCliOptions();
  const reportPath = resolveReportPath(
    cliOptions,
    cliOptions.execute
      ? "customer-sales-return-finalize-execute-report.json"
      : "customer-sales-return-finalize-dry-run-report.json",
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
    const { deterministicPendingRelations } = await withPoolConnection(
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

        return {
          deterministicPendingRelations: batch3cPlan.pendingRelations,
        };
      },
    );

    let currentPendingRows: PendingRelationDbRow[] = [];
    let currentExcludedDocumentRows: ExcludedDocumentDbRow[] = [];
    let stagingReady = false;

    const plan = await withPoolConnection(
      targetPool,
      async (targetConnection) => {
        stagingReady = await stagingSchemaExists(targetConnection);

        if (!stagingReady) {
          return {
            originatingBatch: FINALIZE_ORIGINATING_BATCH,
            archiveCandidates: [],
            affectedLegacyIds: [],
            affectedHeaderCount: 0,
            reasonCounts: {},
            blockers: [
              {
                reason:
                  "migration_staging schema is missing. Run pnpm migration:bootstrap-staging first.",
              },
            ],
          } satisfies FinalizationPlan;
        }

        currentPendingRows = await readBatchPendingRelations(
          targetConnection,
          FINALIZE_ORIGINATING_BATCH,
        );
        currentExcludedDocumentRows = await readBatchExcludedDocuments(
          targetConnection,
          FINALIZE_ORIGINATING_BATCH,
        );

        return buildFinalizationPlan(
          currentPendingRows,
          deterministicPendingRelations,
        );
      },
    );

    const dryRunSummary = buildDryRunSummary(plan, currentPendingRows.length);
    const excludedDocumentSummary = buildExcludedDocumentSignOffSummary(
      plan,
      currentExcludedDocumentRows,
    );
    const dryRunReport = {
      mode: cliOptions.execute ? "execute" : "dry-run",
      targetDatabaseName,
      ...dryRunSummary,
      ...excludedDocumentSummary,
    };

    if (!cliOptions.execute) {
      writeStableReport(reportPath, dryRunReport);
      console.log(
        `Sales-return finalization dry-run completed. report=${reportPath}`,
      );

      if (hasFinalizationBlockers(plan)) {
        process.exitCode = 1;
      }

      return;
    }

    const executionReport = await withPoolConnection(
      targetPool,
      async (targetConnection) => {
        const executeBlockers: Array<Record<string, unknown>> = [];

        if (!stagingReady) {
          executeBlockers.push({
            reason:
              "migration_staging schema is missing. Run pnpm migration:bootstrap-staging first.",
          });
        }

        if (hasFinalizationBlockers(plan)) {
          executeBlockers.push(
            ...plan.blockers.map((blocker) => ({
              reason: blocker.reason,
              ...blocker.details,
            })),
          );
        }

        if (stagingReady && executeBlockers.length === 0) {
          const currentArchivedRows = await readBatchArchivedRelations(
            targetConnection,
            FINALIZE_ORIGINATING_BATCH,
          );
          const archivedMismatchBlockers = buildAlreadyArchivedMismatchBlockers(
            {
              archivedRows: currentArchivedRows,
              expectedCandidates: plan.archiveCandidates,
            },
          );
          executeBlockers.push(...archivedMismatchBlockers);
        }

        if (executeBlockers.length > 0) {
          const blockedReport = {
            ...dryRunReport,
            executionRequested: true,
            stagingReady,
            executeBlockers,
          };
          writeStableReport(reportPath, blockedReport);
          process.exitCode = 1;
          return blockedReport;
        }

        const executionResult = await executeFinalizationPlan(
          targetConnection,
          plan,
        );

        const report = {
          ...dryRunReport,
          executionRequested: true,
          stagingReady,
          executionResult,
        };

        writeStableReport(reportPath, report);
        return report;
      },
    );

    console.log(
      `Sales-return finalization execute completed. report=${reportPath}`,
    );

    if (
      Array.isArray(
        (executionReport as { executeBlockers?: unknown[] }).executeBlockers,
      )
    ) {
      process.exitCode = 1;
    }
  } finally {
    await closePools(legacyPool, targetPool);
  }
}

void main();
