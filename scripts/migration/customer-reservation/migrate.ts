import {
  assertDistinctSourceAndTargetDatabases,
  assertExpectedDatabaseName,
  EXPECTED_TARGET_DATABASE_NAME,
  loadMigrationEnvironment,
  parseMigrationCliOptions,
  resolveReportPath,
} from "../config";
import { closePools, createMariaDbPool, withPoolConnection } from "../db";
import { writeStableReport } from "../shared/report-writer";
import {
  buildDownstreamConsumerBlockers,
  buildExistingCollisionBlockers,
  buildLineBackfillDriftBlockers,
  buildMapConsistencyBlockers,
  buildMissingMapTargetBlockers,
  buildSliceDirtyTargetBlockers,
} from "./execute-guard";
import {
  readLegacyIntervalSnapshot,
  readOutboundReservationDependencySnapshot,
} from "./legacy-reader";
import {
  buildDryRunSummary,
  buildOutboundReservationMigrationPlan,
  hasExecutionBlockers,
} from "./transformer";
import {
  executeOutboundReservationPlan,
  MAP_TABLES,
  TARGET_TABLES,
} from "./writer";

interface StoredMapRow {
  legacyTable: string;
  legacyId: number;
  targetTable: string;
  targetId: number;
  targetCode: string | null;
  actualTargetCode: string | null;
}

interface StoredLineBackfillRow {
  lineId: number;
  lineCode: string | null;
  startNumber: string | null;
  endNumber: string | null;
}

function buildMapIdentity(input: {
  legacyTable: string;
  legacyId: number;
}): string {
  return `${input.legacyTable}::${input.legacyId}`;
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

  return stringValue;
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

async function getBatchOwnedReservationRows(
  connection: {
    query<T = unknown>(sql: string, values?: readonly unknown[]): Promise<T>;
  },
  migrationBatch: string,
): Promise<number> {
  const rows = await connection.query<Array<{ total: number }>>(
    `
      SELECT COUNT(*) AS total
      FROM ${TARGET_TABLES.reservation} reservation_row
      INNER JOIN migration_staging.${MAP_TABLES.reservation} map_row
        ON map_row.target_id = reservation_row.id
      WHERE map_row.migration_batch = ?
    `,
    [migrationBatch],
  );

  return Number(rows[0]?.total ?? 0);
}

async function countUnownedReservationKeyCollisions(
  connection: {
    query<T = unknown>(sql: string, values?: readonly unknown[]): Promise<T>;
  },
  migrationBatch: string,
  expectedRows: Array<{
    businessDocumentType: string;
    businessDocumentLineId: number;
    startNumber: string;
    endNumber: string;
  }>,
): Promise<number> {
  if (expectedRows.length === 0) {
    return 0;
  }

  const predicates: string[] = [];
  const values: Array<string | number> = [migrationBatch];

  for (const expectedRow of expectedRows) {
    predicates.push(
      "(reservation_row.businessDocumentType = ? AND reservation_row.businessDocumentLineId = ? AND reservation_row.startNumber = ? AND reservation_row.endNumber = ?)",
    );
    values.push(
      expectedRow.businessDocumentType,
      expectedRow.businessDocumentLineId,
      expectedRow.startNumber,
      expectedRow.endNumber,
    );
  }

  const rows = await connection.query<Array<{ total: number }>>(
    `
      SELECT COUNT(*) AS total
      FROM ${TARGET_TABLES.reservation} reservation_row
      LEFT JOIN migration_staging.${MAP_TABLES.reservation} map_row
        ON map_row.target_id = reservation_row.id
       AND map_row.migration_batch = ?
      WHERE map_row.id IS NULL
        AND (${predicates.join(" OR ")})
    `,
    values,
  );

  return Number(rows[0]?.total ?? 0);
}

async function getReservationMapRows(
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
          WHEN order_row.documentNo IS NULL
            OR line_row.lineNo IS NULL
            OR reservation_row.startNumber IS NULL
            OR reservation_row.endNumber IS NULL
          THEN NULL
          ELSE CONCAT(
            order_row.documentNo,
            '#',
            line_row.lineNo,
            '@',
            reservation_row.startNumber,
            '-',
            reservation_row.endNumber
          )
        END AS actualTargetCode
      FROM migration_staging.${MAP_TABLES.reservation} map_row
      LEFT JOIN ${TARGET_TABLES.reservation} reservation_row
        ON reservation_row.id = map_row.target_id
      LEFT JOIN ${TARGET_TABLES.line} line_row
        ON line_row.id = reservation_row.businessDocumentLineId
      LEFT JOIN customer_stock_order order_row
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

async function getBatchOwnedLineIds(
  connection: {
    query<T = unknown>(sql: string, values?: readonly unknown[]): Promise<T>;
  },
  migrationBatch: string,
): Promise<number[]> {
  const rows = await connection.query<Array<{ lineId: number }>>(
    `
      SELECT DISTINCT reservation_row.businessDocumentLineId AS lineId
      FROM ${TARGET_TABLES.reservation} reservation_row
      INNER JOIN migration_staging.${MAP_TABLES.reservation} map_row
        ON map_row.target_id = reservation_row.id
      WHERE map_row.migration_batch = ?
      ORDER BY reservation_row.businessDocumentLineId ASC
    `,
    [migrationBatch],
  );

  return rows
    .map((row) => Number(row.lineId))
    .filter((lineId) => Number.isFinite(lineId) && lineId > 0);
}

async function getStoredLineBackfills(
  connection: {
    query<T = unknown>(sql: string, values?: readonly unknown[]): Promise<T>;
  },
  lineIds: readonly number[],
): Promise<StoredLineBackfillRow[]> {
  if (lineIds.length === 0) {
    return [];
  }

  const placeholders = lineIds.map(() => "?").join(", ");

  return connection.query<StoredLineBackfillRow[]>(
    `
      SELECT
        line_row.id AS lineId,
        CASE
          WHEN order_row.documentNo IS NULL OR line_row.lineNo IS NULL THEN NULL
          ELSE CONCAT(order_row.documentNo, '#', line_row.lineNo)
        END AS lineCode,
        line_row.startNumber AS startNumber,
        line_row.endNumber AS endNumber
      FROM ${TARGET_TABLES.line} line_row
      LEFT JOIN customer_stock_order order_row
        ON order_row.id = line_row.orderId
      WHERE line_row.id IN (${placeholders})
      ORDER BY line_row.id ASC
    `,
    lineIds,
  );
}

function buildLineBackfillDriftSummary(
  expectedRows: Array<{
    targetLineId: number;
    startNumber: string | null;
    endNumber: string | null;
  }>,
  storedRows: StoredLineBackfillRow[],
): {
  missingTargetLines: number;
  mismatchedStartNumbers: number;
  mismatchedEndNumbers: number;
} {
  const expectedByLineId = new Map(
    expectedRows.map((row) => [row.targetLineId, row] as const),
  );
  const storedByLineId = new Map(
    storedRows.map((row) => [row.lineId, row] as const),
  );

  let missingTargetLines = 0;
  let mismatchedStartNumbers = 0;
  let mismatchedEndNumbers = 0;

  for (const [lineId, expectedRow] of expectedByLineId.entries()) {
    const storedRow = storedByLineId.get(lineId);

    if (!storedRow) {
      missingTargetLines += 1;
      continue;
    }

    if (
      comparableScalar(expectedRow.startNumber) !==
      comparableScalar(storedRow.startNumber)
    ) {
      mismatchedStartNumbers += 1;
    }

    if (
      comparableScalar(expectedRow.endNumber) !==
      comparableScalar(storedRow.endNumber)
    ) {
      mismatchedEndNumbers += 1;
    }
  }

  return {
    missingTargetLines,
    mismatchedStartNumbers,
    mismatchedEndNumbers,
  };
}

async function getDownstreamConsumerCounts(connection: {
  query<T = unknown>(sql: string, values?: readonly unknown[]): Promise<T>;
}): Promise<Record<string, number>> {
  const rows = await connection.query<
    Array<{ consumer: string; total: number }>
  >(
    `
      SELECT 'document_relation' AS consumer, COUNT(*) AS total
      FROM document_relation
      WHERE upstreamFamily = 'CUSTOMER_STOCK'
         OR downstreamFamily = 'CUSTOMER_STOCK'
         OR upstreamDocumentType = 'CustomerStockOrder'
         OR downstreamDocumentType = 'CustomerStockOrder'
      UNION ALL
      SELECT 'document_line_relation' AS consumer, COUNT(*) AS total
      FROM document_line_relation
      WHERE upstreamFamily = 'CUSTOMER_STOCK'
         OR downstreamFamily = 'CUSTOMER_STOCK'
         OR upstreamDocumentType = 'CustomerStockOrder'
         OR downstreamDocumentType = 'CustomerStockOrder'
      UNION ALL
      SELECT 'approval_document' AS consumer, COUNT(*) AS total
      FROM approval_document
      WHERE documentFamily = 'CUSTOMER_STOCK' OR documentType = 'CustomerStockOrder'
      UNION ALL
      SELECT 'inventory_balance' AS consumer, COUNT(*) AS total
      FROM inventory_balance
      UNION ALL
      SELECT 'inventory_log' AS consumer, COUNT(*) AS total
      FROM inventory_log
      WHERE businessDocumentType = 'CustomerStockOrder'
      UNION ALL
      SELECT 'inventory_source_usage' AS consumer, COUNT(*) AS total
      FROM inventory_source_usage
      WHERE consumerDocumentType = 'CustomerStockOrder'
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
      ? "outbound-reservation-execute-report.json"
      : "outbound-reservation-dry-run-report.json",
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
        const snapshot = await readLegacyIntervalSnapshot(legacyConnection);
        const dependencies = await withPoolConnection(
          targetPool,
          async (targetConnection) =>
            readOutboundReservationDependencySnapshot(targetConnection),
        );

        return {
          snapshot,
          dependencies,
          plan: buildOutboundReservationMigrationPlan(snapshot, dependencies),
        };
      },
    );

    const dryRunReport = {
      mode: cliOptions.execute ? "execute" : "dry-run",
      targetDatabaseName,
      sourceCounts: {
        intervals: snapshot.intervals.length,
        outboundDetailReferences: snapshot.outboundDetailReferences.length,
      },
      dependencyBaseline: dependencies.outboundBaseBaseline,
      ...buildDryRunSummary(plan),
    };

    if (!cliOptions.execute) {
      writeStableReport(reportPath, dryRunReport);
      console.log(
        `Outbound reservation dry-run completed. report=${reportPath}`,
      );

      if (hasExecutionBlockers(plan)) {
        process.exitCode = 1;
      }
      return;
    }

    let reservationTargetRows = 0;
    let batchOwnedReservationRows = 0;
    let reservationBatchMapRows = 0;
    let missingMappedReservations = 0;
    let existingUnownedCollisions = 0;
    let reservationMapConsistency = {
      missingExpectedMapRows: 0,
      unexpectedMapRows: 0,
      mismatchedTargetCodes: 0,
      mismatchedActualTargetCodes: 0,
    };
    let lineBackfillDrift = {
      missingTargetLines: 0,
      mismatchedStartNumbers: 0,
      mismatchedEndNumbers: 0,
    };
    let downstreamConsumerCounts: Record<string, number> = {};
    let stagingReady = false;

    const executionReport = await withPoolConnection(
      targetPool,
      async (targetConnection) => {
        stagingReady = await stagingSchemaExists(targetConnection);
        const executeBlockers: Array<Record<string, unknown>> = [];
        const expectedMapRows = plan.liveReservations.map((record) => ({
          legacyTable: record.legacyTable,
          legacyId: record.legacyId,
          targetTable: record.targetTable,
          targetCode: record.targetCode,
        }));
        const expectedReservationKeys = plan.liveReservations.map((record) => ({
          businessDocumentType: record.target.businessDocumentType,
          businessDocumentLineId: record.target.businessDocumentLineId,
          startNumber: record.target.startNumber,
          endNumber: record.target.endNumber,
        }));

        if (!stagingReady) {
          executeBlockers.push({
            reason:
              "migration_staging schema is missing. Run pnpm migration:bootstrap-staging first.",
          });
        } else {
          reservationTargetRows = await getTableCount(
            targetConnection,
            TARGET_TABLES.reservation,
          );
          reservationBatchMapRows = await getBatchMapCount(
            targetConnection,
            MAP_TABLES.reservation,
            plan.migrationBatch,
          );
          batchOwnedReservationRows = await getBatchOwnedReservationRows(
            targetConnection,
            plan.migrationBatch,
          );
          missingMappedReservations = await getMissingMapTargets(
            targetConnection,
            MAP_TABLES.reservation,
            TARGET_TABLES.reservation,
            plan.migrationBatch,
          );
          existingUnownedCollisions =
            await countUnownedReservationKeyCollisions(
              targetConnection,
              plan.migrationBatch,
              expectedReservationKeys,
            );
          downstreamConsumerCounts =
            await getDownstreamConsumerCounts(targetConnection);
          const hasBatchOwnership =
            batchOwnedReservationRows > 0 || reservationBatchMapRows > 0;

          if (reservationBatchMapRows > 0) {
            const storedMapRows = await getReservationMapRows(
              targetConnection,
              plan.migrationBatch,
            );
            reservationMapConsistency = buildMapConsistencySummary(
              expectedMapRows,
              storedMapRows,
            );
          }

          const previousBatchOwnedLineIds = await getBatchOwnedLineIds(
            targetConnection,
            plan.migrationBatch,
          );
          const lineIdsForDrift = Array.from(
            new Set([
              ...plan.lineBackfills.map((record) => record.targetLineId),
              ...previousBatchOwnedLineIds,
            ]),
          ).sort((left, right) => left - right);

          if (lineIdsForDrift.length > 0) {
            const storedLineRows = await getStoredLineBackfills(
              targetConnection,
              lineIdsForDrift,
            );
            const expectedLineRows = lineIdsForDrift.map((targetLineId) => {
              const plannedRecord =
                plan.lineBackfills.find(
                  (record) => record.targetLineId === targetLineId,
                ) ?? null;

              return {
                targetLineId,
                startNumber: plannedRecord?.startNumber ?? null,
                endNumber: plannedRecord?.endNumber ?? null,
              };
            });
            lineBackfillDrift = buildLineBackfillDriftSummary(
              expectedLineRows,
              storedLineRows,
            );
          }

          executeBlockers.push(
            ...buildSliceDirtyTargetBlockers({
              targetTable: TARGET_TABLES.reservation,
              batchOwnedTargetRows: batchOwnedReservationRows,
              batchMapRows: reservationBatchMapRows,
            }),
            ...buildMissingMapTargetBlockers({
              targetTable: TARGET_TABLES.reservation,
              missingMappedTargets: missingMappedReservations,
            }),
            ...buildExistingCollisionBlockers({
              targetTable: TARGET_TABLES.reservation,
              existingUnownedCollisions,
            }),
            ...buildMapConsistencyBlockers({
              targetTable: TARGET_TABLES.reservation,
              ...reservationMapConsistency,
            }),
            ...buildLineBackfillDriftBlockers({
              isRerun: hasBatchOwnership,
              ...lineBackfillDrift,
            }),
            ...buildDownstreamConsumerBlockers({
              hasBatchOwnership,
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
              reservationTargetRows,
              batchOwnedReservationRows,
              reservationBatchMapRows,
              missingMappedReservations,
              existingUnownedCollisions,
              reservationMapConsistency,
              lineBackfillDrift,
              downstreamConsumerCounts,
            },
            executeBlockers,
          };
          writeStableReport(reportPath, blockedReport);
          process.exitCode = 1;
          return blockedReport;
        }

        const executionResult = await executeOutboundReservationPlan(
          targetConnection,
          plan,
        );
        const report = {
          ...dryRunReport,
          executionRequested: true,
          stagingReady,
          targetSummary: {
            reservationTargetRows,
            batchOwnedReservationRows,
            reservationBatchMapRows,
            missingMappedReservations,
            existingUnownedCollisions,
            reservationMapConsistency,
            lineBackfillDrift,
            downstreamConsumerCounts,
          },
          executionResult,
        };
        writeStableReport(reportPath, report);
        return report;
      },
    );

    console.log(`Outbound reservation execute completed. report=${reportPath}`);

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
