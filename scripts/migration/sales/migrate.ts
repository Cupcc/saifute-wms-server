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
  buildMapConsistencyBlockers,
  buildMissingMapTargetBlockers,
  buildSliceDirtyTargetBlockers,
} from "./execute-guard";
import {
  readLegacyOutboundSnapshot,
  readOutboundDependencySnapshot,
} from "./legacy-reader";
import {
  buildDryRunSummary,
  buildOutboundMigrationPlan,
  hasExecutionBlockers,
} from "./transformer";

const SALES_STOCK_DOCUMENT_TYPE = BusinessDocumentType.SalesStockOrder;
import { executeOutboundPlan, MAP_TABLES, TARGET_TABLES } from "./writer";

interface StoredMapRow {
  legacyTable: string;
  legacyId: number;
  targetTable: string;
  targetId: number;
  targetCode: string | null;
  actualTargetCode: string | null;
}

function buildMapIdentity(input: {
  legacyTable: string;
  legacyId: number;
}): string {
  return `${input.legacyTable}::${input.legacyId}`;
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

async function getOrderMapRows(
  connection: {
    query<T = unknown>(sql: string, values?: readonly unknown[]): Promise<T>;
  },
  migrationBatch: string,
): Promise<StoredMapRow[]> {
  return connection.query<StoredMapRow[]>(
    `
      SELECT
        map_row.legacy_table AS legacyTable,
        map_row.legacy_id AS legacyId,
        map_row.target_table AS targetTable,
        map_row.target_id AS targetId,
        map_row.target_code AS targetCode,
        order_row.documentNo AS actualTargetCode
      FROM migration_staging.${MAP_TABLES.order} map_row
      LEFT JOIN ${TARGET_TABLES.order} order_row
        ON order_row.id = map_row.target_id
      WHERE map_row.migration_batch = ?
      ORDER BY map_row.legacy_table ASC, map_row.legacy_id ASC
    `,
    [migrationBatch],
  );
}

async function getLineMapRows(
  connection: {
    query<T = unknown>(sql: string, values?: readonly unknown[]): Promise<T>;
  },
  migrationBatch: string,
): Promise<StoredMapRow[]> {
  return connection.query<StoredMapRow[]>(
    `
      SELECT
        map_row.legacy_table AS legacyTable,
        map_row.legacy_id AS legacyId,
        map_row.target_table AS targetTable,
        map_row.target_id AS targetId,
        map_row.target_code AS targetCode,
        CASE
          WHEN order_row.documentNo IS NULL OR line_row.lineNo IS NULL THEN NULL
          ELSE CONCAT(order_row.documentNo, '#', line_row.lineNo)
        END AS actualTargetCode
      FROM migration_staging.${MAP_TABLES.line} map_row
      LEFT JOIN ${TARGET_TABLES.line} line_row
        ON line_row.id = map_row.target_id
      LEFT JOIN ${TARGET_TABLES.order} order_row
        ON order_row.id = line_row.orderId
      WHERE map_row.migration_batch = ?
      ORDER BY map_row.legacy_table ASC, map_row.legacy_id ASC
    `,
    [migrationBatch],
  );
}

function buildMapConsistencySummary(
  expectedRows: Array<{
    legacyTable: string;
    legacyId: number;
    targetTable: string;
    targetCode: string;
  }>,
  storedRows: StoredMapRow[],
): {
  missingExpectedMapRows: number;
  unexpectedMapRows: number;
  mismatchedTargetCodes: number;
  mismatchedActualTargetCodes: number;
} {
  const expectedByIdentity = new Map(
    expectedRows.map((row) => [buildMapIdentity(row), row] as const),
  );
  const storedByIdentity = new Map(
    storedRows.map((row) => [buildMapIdentity(row), row] as const),
  );

  let missingExpectedMapRows = 0;
  let mismatchedTargetCodes = 0;
  let mismatchedActualTargetCodes = 0;

  for (const [identity, expectedRow] of expectedByIdentity.entries()) {
    const storedRow = storedByIdentity.get(identity);

    if (!storedRow) {
      missingExpectedMapRows += 1;
      continue;
    }

    if (
      storedRow.targetTable !== expectedRow.targetTable ||
      storedRow.targetCode !== expectedRow.targetCode
    ) {
      mismatchedTargetCodes += 1;
    }

    if (
      storedRow.actualTargetCode !== null &&
      storedRow.actualTargetCode !== expectedRow.targetCode
    ) {
      mismatchedActualTargetCodes += 1;
    }
  }

  const unexpectedMapRows = storedRows.filter(
    (row) => !expectedByIdentity.has(buildMapIdentity(row)),
  ).length;

  return {
    missingExpectedMapRows,
    unexpectedMapRows,
    mismatchedTargetCodes,
    mismatchedActualTargetCodes,
  };
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

async function getOutboundDownstreamConsumerCounts(connection: {
  query<T = unknown>(sql: string, values?: readonly unknown[]): Promise<T>;
}): Promise<Record<string, number>> {
  const rows = await connection.query<
    Array<{ consumer: string; total: number }>
  >(
    `
      SELECT 'approval_document' AS consumer, COUNT(*) AS total
      FROM approval_document
      WHERE documentFamily = 'SALES_STOCK' OR documentType = '${SALES_STOCK_DOCUMENT_TYPE}'
      UNION ALL
      SELECT 'document_relation' AS consumer, COUNT(*) AS total
      FROM document_relation
      WHERE upstreamFamily = 'SALES_STOCK'
         OR downstreamFamily = 'SALES_STOCK'
         OR upstreamDocumentType = '${SALES_STOCK_DOCUMENT_TYPE}'
         OR downstreamDocumentType = '${SALES_STOCK_DOCUMENT_TYPE}'
      UNION ALL
      SELECT 'document_line_relation' AS consumer, COUNT(*) AS total
      FROM document_line_relation
      WHERE upstreamFamily = 'SALES_STOCK'
         OR downstreamFamily = 'SALES_STOCK'
         OR upstreamDocumentType = '${SALES_STOCK_DOCUMENT_TYPE}'
         OR downstreamDocumentType = '${SALES_STOCK_DOCUMENT_TYPE}'
      UNION ALL
      SELECT 'inventory_log' AS consumer, COUNT(*) AS total
      FROM inventory_log
      WHERE businessDocumentType = '${SALES_STOCK_DOCUMENT_TYPE}'
      UNION ALL
      SELECT 'inventory_source_usage' AS consumer, COUNT(*) AS total
      FROM inventory_source_usage
      WHERE consumerDocumentType = '${SALES_STOCK_DOCUMENT_TYPE}'
      UNION ALL
      SELECT 'factory_number_reservation' AS consumer, COUNT(*) AS total
      FROM factory_number_reservation
      WHERE businessDocumentType = '${SALES_STOCK_DOCUMENT_TYPE}'
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
      ? "outbound-execute-report.json"
      : "outbound-dry-run-report.json",
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
        const snapshot = await readLegacyOutboundSnapshot(legacyConnection);
        const dependencies = await withPoolConnection(
          targetPool,
          async (targetConnection) =>
            readOutboundDependencySnapshot(targetConnection),
        );

        return {
          snapshot,
          dependencies,
          plan: buildOutboundMigrationPlan(snapshot, dependencies),
        };
      },
    );

    const dryRunReport = {
      mode: cliOptions.execute ? "execute" : "dry-run",
      targetDatabaseName,
      sourceCounts: {
        orders: snapshot.orders.length,
        lines: snapshot.lines.length,
        audits: snapshot.audits.length,
      },
      dependencyBaseline: dependencies.batch1Baseline,
      ...buildDryRunSummary(plan),
    };

    if (!cliOptions.execute) {
      writeStableReport(reportPath, dryRunReport);
      console.log(`Outbound dry-run completed. report=${reportPath}`);

      if (hasExecutionBlockers(plan)) {
        process.exitCode = 1;
      }
      return;
    }

    let orderTargetRows = 0;
    let lineTargetRows = 0;
    let orderBatchMapRows = 0;
    let lineBatchMapRows = 0;
    let missingMappedOrders = 0;
    let missingMappedLines = 0;
    let orderMapConsistency = {
      missingExpectedMapRows: 0,
      unexpectedMapRows: 0,
      mismatchedTargetCodes: 0,
      mismatchedActualTargetCodes: 0,
    };
    let lineMapConsistency = {
      missingExpectedMapRows: 0,
      unexpectedMapRows: 0,
      mismatchedTargetCodes: 0,
      mismatchedActualTargetCodes: 0,
    };
    let downstreamConsumerCounts: Record<string, number> = {};
    let stagingReady = false;

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
          orderTargetRows = await getTableCount(
            targetConnection,
            TARGET_TABLES.order,
          );
          lineTargetRows = await getTableCount(
            targetConnection,
            TARGET_TABLES.line,
          );
          orderBatchMapRows = await getBatchMapCount(
            targetConnection,
            MAP_TABLES.order,
            plan.migrationBatch,
          );
          lineBatchMapRows = await getBatchMapCount(
            targetConnection,
            MAP_TABLES.line,
            plan.migrationBatch,
          );
          missingMappedOrders = await getMissingMapTargets(
            targetConnection,
            MAP_TABLES.order,
            TARGET_TABLES.order,
            plan.migrationBatch,
          );
          missingMappedLines = await getMissingMapTargets(
            targetConnection,
            MAP_TABLES.line,
            TARGET_TABLES.line,
            plan.migrationBatch,
          );
          downstreamConsumerCounts =
            await getOutboundDownstreamConsumerCounts(targetConnection);

          if (orderBatchMapRows > 0) {
            const storedOrderMapRows = await getOrderMapRows(
              targetConnection,
              plan.migrationBatch,
            );
            orderMapConsistency = buildMapConsistencySummary(
              plan.migratedOrders.map((order) => ({
                legacyTable: order.legacyTable,
                legacyId: order.legacyId,
                targetTable: order.targetTable,
                targetCode: order.target.documentNo,
              })),
              storedOrderMapRows,
            );
          }

          if (lineBatchMapRows > 0) {
            const storedLineMapRows = await getLineMapRows(
              targetConnection,
              plan.migrationBatch,
            );
            lineMapConsistency = buildMapConsistencySummary(
              plan.migratedOrders.flatMap((order) =>
                order.lines.map((line) => ({
                  legacyTable: line.legacyTable,
                  legacyId: line.legacyId,
                  targetTable: line.targetTable,
                  targetCode: line.targetCode,
                })),
              ),
              storedLineMapRows,
            );
          }

          executeBlockers.push(
            ...buildSliceDirtyTargetBlockers({
              targetTable: TARGET_TABLES.order,
              targetRows: orderTargetRows,
              batchMapRows: orderBatchMapRows,
            }),
            ...buildSliceDirtyTargetBlockers({
              targetTable: TARGET_TABLES.line,
              targetRows: lineTargetRows,
              batchMapRows: lineBatchMapRows,
            }),
            ...buildMissingMapTargetBlockers({
              targetTable: TARGET_TABLES.order,
              missingMappedTargets: missingMappedOrders,
            }),
            ...buildMissingMapTargetBlockers({
              targetTable: TARGET_TABLES.line,
              missingMappedTargets: missingMappedLines,
            }),
            ...buildMapConsistencyBlockers({
              targetTable: TARGET_TABLES.order,
              ...orderMapConsistency,
            }),
            ...buildMapConsistencyBlockers({
              targetTable: TARGET_TABLES.line,
              ...lineMapConsistency,
            }),
            ...buildDownstreamConsumerBlockers({
              isRerun:
                orderTargetRows > 0 ||
                lineTargetRows > 0 ||
                orderBatchMapRows > 0 ||
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
              orderTargetRows,
              lineTargetRows,
              orderBatchMapRows,
              lineBatchMapRows,
              missingMappedOrders,
              missingMappedLines,
              orderMapConsistency,
              lineMapConsistency,
              downstreamConsumerCounts,
            },
            executeBlockers,
          };
          writeStableReport(reportPath, blockedReport);
          process.exitCode = 1;
          return blockedReport;
        }

        const executionResult = await executeOutboundPlan(
          targetConnection,
          plan,
        );
        const report = {
          ...dryRunReport,
          executionRequested: true,
          stagingReady,
          targetSummary: {
            orderTargetRows,
            lineTargetRows,
            orderBatchMapRows,
            lineBatchMapRows,
            missingMappedOrders,
            missingMappedLines,
            orderMapConsistency,
            lineMapConsistency,
            downstreamConsumerCounts,
          },
          executionResult,
        };
        writeStableReport(reportPath, report);
        return report;
      },
    );

    console.log(`Outbound execute completed. report=${reportPath}`);

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
