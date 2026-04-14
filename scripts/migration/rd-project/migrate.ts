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
import { writeStableReport } from "../shared/report-writer";
import {
  buildDownstreamConsumerBlockers,
  buildMissingMapTargetBlockers,
  buildPendingRelationCountBlockers,
  buildSliceDirtyTargetBlockers,
} from "./execute-guard";
import {
  readLegacyRdProjectSnapshot,
  readRdProjectDependencySnapshot,
} from "./legacy-reader";
import {
  buildDryRunSummary,
  buildRdProjectMigrationPlan,
  hasExecutionBlockers,
} from "./transformer";

const RD_PROJECT_DOCUMENT_TYPE = BusinessDocumentType.RdProject;
import { executeRdProjectPlan, MAP_TABLES, TARGET_TABLES } from "./writer";

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

async function getRdProjectDownstreamConsumerCounts(connection: {
  query<T = unknown>(sql: string, values?: readonly unknown[]): Promise<T>;
}): Promise<Record<string, number>> {
  const rows = await connection.query<
    Array<{ consumer: string; total: number }>
  >(
    `
      SELECT 'approval_document' AS consumer, COUNT(*) AS total
      FROM approval_document
      WHERE documentFamily = 'RD_PROJECT' OR documentType = '${RD_PROJECT_DOCUMENT_TYPE}'
      UNION ALL
      SELECT 'document_relation' AS consumer, COUNT(*) AS total
      FROM document_relation
      WHERE upstreamFamily = 'PROJECT'
         OR downstreamFamily = 'PROJECT'
         OR upstreamDocumentType = '${RD_PROJECT_DOCUMENT_TYPE}'
         OR downstreamDocumentType = '${RD_PROJECT_DOCUMENT_TYPE}'
      UNION ALL
      SELECT 'document_line_relation' AS consumer, COUNT(*) AS total
      FROM document_line_relation
      WHERE upstreamFamily = 'PROJECT'
         OR downstreamFamily = 'PROJECT'
         OR upstreamDocumentType = '${RD_PROJECT_DOCUMENT_TYPE}'
         OR downstreamDocumentType = '${RD_PROJECT_DOCUMENT_TYPE}'
      UNION ALL
      SELECT 'inventory_log' AS consumer, COUNT(*) AS total
      FROM inventory_log
      WHERE businessDocumentType = '${RD_PROJECT_DOCUMENT_TYPE}'
      UNION ALL
      SELECT 'inventory_source_usage' AS consumer, COUNT(*) AS total
      FROM inventory_source_usage
      WHERE consumerDocumentType = '${RD_PROJECT_DOCUMENT_TYPE}'
      UNION ALL
      SELECT 'factory_number_reservation' AS consumer, COUNT(*) AS total
      FROM factory_number_reservation
      WHERE businessDocumentType = '${RD_PROJECT_DOCUMENT_TYPE}'
    `,
  );

  return Object.fromEntries(
    rows.map((row) => [row.consumer, Number(row.total)] as const),
  );
}

async function main(): Promise<void> {
  const cliOptions = parseMigrationCliOptions();
  const reportPath = resolveReportPath(
    cliOptions,
    cliOptions.execute
      ? "rd-project-execute-report.json"
      : "rd-project-dry-run-report.json",
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
    const { snapshot, dependencies, plan } = await withPoolConnection(
      legacyPool,
      async (legacyConnection) => {
        const snapshot = await readLegacyRdProjectSnapshot(legacyConnection);
        const dependencies = await withPoolConnection(
          targetPool,
          async (targetConnection) =>
            readRdProjectDependencySnapshot(targetConnection),
        );

        return {
          snapshot,
          dependencies,
          plan: buildRdProjectMigrationPlan(snapshot, dependencies),
        };
      },
    );

    const dryRunReport = {
      mode: cliOptions.execute ? "execute" : "dry-run",
      targetDatabaseName,
      sourceCounts: {
        projects: snapshot.projects.length,
        lines: snapshot.lines.length,
      },
      dependencyBaseline: dependencies.batch1Baseline,
      ...buildDryRunSummary(plan),
    };

    if (!cliOptions.execute) {
      writeStableReport(reportPath, dryRunReport);
      console.log(`RD project dry-run completed. report=${reportPath}`);

      if (hasExecutionBlockers(plan)) {
        process.exitCode = 1;
      }
      return;
    }

    let projectTargetRows = 0;
    let lineTargetRows = 0;
    let projectBatchMapRows = 0;
    let lineBatchMapRows = 0;
    let missingMappedProjects = 0;
    let missingMappedLines = 0;
    let batchPendingRelationRows = 0;
    let downstreamConsumerCounts: Record<string, number> = {};
    let stagingReady = false;
    const expectedPendingRelationCount = plan.pendingProjects.reduce(
      (total, project) => total + project.pendingLineCount,
      0,
    );

    const executionReport = await withPoolConnection(
      targetPool,
      async (targetConnection) => {
        stagingReady = await stagingSchemaExists(targetConnection);
        const executeBlockers: Array<Record<string, unknown>> = [];

        if (!stagingReady) {
          executeBlockers.push({
            reason:
              "migration_staging schema is missing. Run pnpm migration:bootstrap-staging first.",
          });
        } else {
          projectTargetRows = await getTableCount(
            targetConnection,
            TARGET_TABLES.project,
          );
          lineTargetRows = await getTableCount(
            targetConnection,
            TARGET_TABLES.line,
          );
          projectBatchMapRows = await getBatchMapCount(
            targetConnection,
            MAP_TABLES.project,
            plan.migrationBatch,
          );
          lineBatchMapRows = await getBatchMapCount(
            targetConnection,
            MAP_TABLES.line,
            plan.migrationBatch,
          );
          missingMappedProjects = await getMissingMapTargets(
            targetConnection,
            MAP_TABLES.project,
            TARGET_TABLES.project,
            plan.migrationBatch,
          );
          missingMappedLines = await getMissingMapTargets(
            targetConnection,
            MAP_TABLES.line,
            TARGET_TABLES.line,
            plan.migrationBatch,
          );
          const pendingRelationCountRows = await targetConnection.query<
            Array<{ total: number }>
          >(
            `SELECT COUNT(*) AS total FROM migration_staging.pending_relations WHERE migration_batch = ? AND legacy_table = 'saifute_composite_product'`,
            [plan.migrationBatch],
          );
          batchPendingRelationRows = Number(
            pendingRelationCountRows[0]?.total ?? 0,
          );
          downstreamConsumerCounts =
            await getRdProjectDownstreamConsumerCounts(targetConnection);

          executeBlockers.push(
            ...buildSliceDirtyTargetBlockers({
              targetTable: TARGET_TABLES.project,
              targetRows: projectTargetRows,
              batchMapRows: projectBatchMapRows,
            }),
            ...buildSliceDirtyTargetBlockers({
              targetTable: TARGET_TABLES.line,
              targetRows: lineTargetRows,
              batchMapRows: lineBatchMapRows,
            }),
            ...buildMissingMapTargetBlockers({
              targetTable: TARGET_TABLES.project,
              missingMappedTargets: missingMappedProjects,
            }),
            ...buildMissingMapTargetBlockers({
              targetTable: TARGET_TABLES.line,
              missingMappedTargets: missingMappedLines,
            }),
            ...buildDownstreamConsumerBlockers({
              isRerun:
                projectTargetRows > 0 ||
                lineTargetRows > 0 ||
                projectBatchMapRows > 0 ||
                lineBatchMapRows > 0,
              consumerCounts: downstreamConsumerCounts,
            }),
          );
        }

        if (hasExecutionBlockers(plan)) {
          executeBlockers.push(
            ...plan.globalBlockers.map((blocker) => ({
              reason: blocker.reason,
              ...blocker.details,
            })),
          );
        }

        if (executeBlockers.length > 0) {
          const blockedReport = {
            ...dryRunReport,
            executionRequested: true,
            stagingReady,
            targetSummary: {
              projectTargetRows,
              lineTargetRows,
              projectBatchMapRows,
              lineBatchMapRows,
              missingMappedProjects,
              missingMappedLines,
              batchPendingRelationRows,
              expectedPendingRelationCount,
              downstreamConsumerCounts,
            },
            executeBlockers,
          };
          writeStableReport(reportPath, blockedReport);
          process.exitCode = 1;
          return blockedReport;
        }

        const executionResult = await executeRdProjectPlan(
          targetConnection,
          plan,
        );

        const postExecutePendingRelationCountRows =
          await targetConnection.query<Array<{ total: number }>>(
            `SELECT COUNT(*) AS total FROM migration_staging.pending_relations WHERE migration_batch = ? AND legacy_table = 'saifute_composite_product'`,
            [plan.migrationBatch],
          );
        const postExecutePendingRelationRows = Number(
          postExecutePendingRelationCountRows[0]?.total ?? 0,
        );

        const postExecuteBlockers = buildPendingRelationCountBlockers({
          expectedPendingRelationCount,
          actualPendingRelationCount: postExecutePendingRelationRows,
        });

        const report = {
          ...dryRunReport,
          executionRequested: true,
          stagingReady,
          targetSummary: {
            projectTargetRows,
            lineTargetRows,
            projectBatchMapRows,
            lineBatchMapRows,
            missingMappedProjects,
            missingMappedLines,
            batchPendingRelationRows: postExecutePendingRelationRows,
            expectedPendingRelationCount,
            downstreamConsumerCounts,
          },
          executionResult,
          postExecuteBlockers,
        };
        if (postExecuteBlockers.length > 0) {
          process.exitCode = 1;
        }
        writeStableReport(reportPath, report);
        return report;
      },
    );

    console.log(`RD project execute completed. report=${reportPath}`);

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
