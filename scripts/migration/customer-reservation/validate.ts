import { existsSync, readFileSync } from "node:fs";
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
  readLegacyIntervalSnapshot,
  readOutboundReservationDependencySnapshot,
} from "./legacy-reader";
import { buildOutboundReservationMigrationPlan } from "./transformer";
import type { OutboundReservationMigrationPlan } from "./types";
import { MAP_TABLES, TARGET_TABLES } from "./writer";

interface ArchivedIntervalExpectation {
  legacyTable: string;
  legacyId: number;
  archiveReason: string;
  payloadJson: string;
}

interface ArchivedIntervalStoredRow {
  legacyTable: string;
  legacyId: number;
  archiveReason: string;
  payloadJson: string;
}

interface ReservationStoredRow {
  targetCode: string | null;
  materialId: number;
  workshopId: number;
  businessDocumentType: string;
  businessDocumentId: number;
  businessDocumentLineId: number;
  startNumber: string;
  endNumber: string;
  status: string;
  reservedAt: string;
  releasedAt: string | null;
  createdBy: string | null;
  createdAt: string | null;
  updatedBy: string | null;
  updatedAt: string | null;
}

interface LineStoredRow {
  targetLineId: number;
  targetLineCode: string | null;
  startNumber: string | null;
  endNumber: string | null;
  sourceDocumentType: string | null;
  sourceDocumentId: number | null;
  sourceDocumentLineId: number | null;
}

interface ExecuteReportForbiddenBaseline {
  targetSummary?: {
    downstreamConsumerCounts?: Record<string, number>;
  };
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
    reason: `${field} does not match the deterministic reservation plan.`,
    expected,
    actual,
  });
}

function buildArchivedIntervalIdentity(input: {
  legacyTable: string;
  legacyId: number;
}): string {
  return `${input.legacyTable}::${input.legacyId}`;
}

function buildTargetCodeIdentity(input: { targetCode: string | null }): string {
  return input.targetCode ?? "missing-target-code";
}

function readExecuteReportForbiddenBaseline(): Record<string, number> | null {
  const executeReportPath = join(
    process.cwd(),
    "scripts",
    "migration",
    "reports",
    "outbound-reservation-execute-report.json",
  );

  if (!existsSync(executeReportPath)) {
    return null;
  }

  try {
    const report = JSON.parse(
      readFileSync(executeReportPath, "utf8"),
    ) as ExecuteReportForbiddenBaseline;
    return report.targetSummary?.downstreamConsumerCounts ?? null;
  } catch {
    return null;
  }
}

function collectExpectedArchivedIntervals(
  plan: OutboundReservationMigrationPlan,
): ArchivedIntervalExpectation[] {
  return [...plan.archivedIntervals]
    .sort((left, right) => left.legacyId - right.legacyId)
    .map((record) => ({
      legacyTable: record.legacyTable,
      legacyId: record.legacyId,
      archiveReason: record.archiveReason,
      payloadJson: stableJsonStringify(record.payload),
    }));
}

function collectExpectedLineStates(
  snapshot: {
    intervals: Array<{
      detailLegacyId: number | string | null;
      orderType: number | string | null;
    }>;
  },
  dependencies: {
    lineMapByLegacyId: Map<
      number,
      {
        targetId: number;
        targetCode: string | null;
        sourceDocumentType: string | null;
        sourceDocumentId: number | null;
        sourceDocumentLineId: number | null;
      }
    >;
  },
  plan: OutboundReservationMigrationPlan,
): Array<{
  targetLineId: number;
  targetLineCode: string;
  startNumber: string | null;
  endNumber: string | null;
  preservedSourceDocumentType: string | null;
  preservedSourceDocumentId: number | null;
  preservedSourceDocumentLineId: number | null;
}> {
  const plannedBackfillByLineId = new Map(
    plan.lineBackfills.map((record) => [record.targetLineId, record] as const),
  );
  const targetLineIds = new Set<number>();

  for (const interval of snapshot.intervals) {
    if (Number(interval.orderType) !== 4) {
      continue;
    }

    const detailLegacyId = Number(interval.detailLegacyId);
    if (!Number.isSafeInteger(detailLegacyId) || detailLegacyId <= 0) {
      continue;
    }

    const mappedLine = dependencies.lineMapByLegacyId.get(detailLegacyId);
    if (
      !mappedLine ||
      !Number.isFinite(mappedLine.targetId) ||
      mappedLine.targetId <= 0
    ) {
      continue;
    }

    targetLineIds.add(mappedLine.targetId);
  }

  return Array.from(targetLineIds)
    .sort((left, right) => left - right)
    .map((targetLineId) => {
      const plannedBackfill = plannedBackfillByLineId.get(targetLineId);
      const mappedLine =
        Array.from(dependencies.lineMapByLegacyId.values()).find(
          (line) => line.targetId === targetLineId,
        ) ?? null;
      const targetLineCode =
        plannedBackfill?.targetLineCode ??
        comparableScalar(mappedLine?.targetCode) ??
        `line-${targetLineId}`;

      return {
        targetLineId,
        targetLineCode,
        startNumber: plannedBackfill?.startNumber ?? null,
        endNumber: plannedBackfill?.endNumber ?? null,
        preservedSourceDocumentType: mappedLine?.sourceDocumentType ?? null,
        preservedSourceDocumentId: mappedLine?.sourceDocumentId ?? null,
        preservedSourceDocumentLineId: mappedLine?.sourceDocumentLineId ?? null,
      };
    });
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

async function getArchivedIntervalCount(
  connection: {
    query<T = unknown>(sql: string, values?: readonly unknown[]): Promise<T>;
  },
  migrationBatch: string,
): Promise<number> {
  const rows = await connection.query<Array<{ total: number }>>(
    `
      SELECT COUNT(*) AS total
      FROM migration_staging.archived_intervals
      WHERE migration_batch = ?
        AND legacy_table = 'saifute_interval'
    `,
    [migrationBatch],
  );
  return Number(rows[0]?.total ?? 0);
}

async function getArchivedIntervalRows(
  connection: {
    query<T = unknown>(sql: string, values?: readonly unknown[]): Promise<T>;
  },
  migrationBatch: string,
): Promise<ArchivedIntervalStoredRow[]> {
  return connection.query<ArchivedIntervalStoredRow[]>(
    `
      SELECT
        legacy_table AS legacyTable,
        legacy_id AS legacyId,
        archive_reason AS archiveReason,
        payload_json AS payloadJson
      FROM migration_staging.archived_intervals
      WHERE migration_batch = ?
        AND legacy_table = 'saifute_interval'
      ORDER BY legacy_id ASC
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

async function getForbiddenTableCounts(connection: {
  query<T = unknown>(sql: string, values?: readonly unknown[]): Promise<T>;
}): Promise<Record<string, number>> {
  const rows = await connection.query<
    Array<{ tableName: string; total: number }>
  >(
    `
      SELECT 'document_relation' AS tableName, COUNT(*) AS total
      FROM document_relation
      WHERE upstreamFamily = 'CUSTOMER_STOCK'
         OR downstreamFamily = 'CUSTOMER_STOCK'
         OR upstreamDocumentType = 'CustomerStockOrder'
         OR downstreamDocumentType = 'CustomerStockOrder'
      UNION ALL
      SELECT 'document_line_relation' AS tableName, COUNT(*) AS total
      FROM document_line_relation
      WHERE upstreamFamily = 'CUSTOMER_STOCK'
         OR downstreamFamily = 'CUSTOMER_STOCK'
         OR upstreamDocumentType = 'CustomerStockOrder'
         OR downstreamDocumentType = 'CustomerStockOrder'
      UNION ALL
      SELECT 'approval_document' AS tableName, COUNT(*) AS total
      FROM approval_document
      WHERE documentFamily = 'CUSTOMER_STOCK' OR documentType = 'CustomerStockOrder'
      UNION ALL
      SELECT 'inventory_balance' AS tableName, COUNT(*) AS total
      FROM inventory_balance
      UNION ALL
      SELECT 'inventory_log' AS tableName, COUNT(*) AS total
      FROM inventory_log
      WHERE businessDocumentType = 'CustomerStockOrder'
      UNION ALL
      SELECT 'inventory_source_usage' AS tableName, COUNT(*) AS total
      FROM inventory_source_usage
      WHERE consumerDocumentType = 'CustomerStockOrder'
    `,
  );

  return Object.fromEntries(
    rows.map((row) => [row.tableName, Number(row.total)] as const),
  );
}

async function getReservationRowsByTargetCode(
  connection: {
    query<T = unknown>(sql: string, values?: readonly unknown[]): Promise<T>;
  },
  migrationBatch: string,
): Promise<Map<string, ReservationStoredRow>> {
  const rows = await connection.query<ReservationStoredRow[]>(
    `
      SELECT
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
        END AS targetCode,
        reservation_row.materialId AS materialId,
        reservation_row.workshopId AS workshopId,
        reservation_row.businessDocumentType AS businessDocumentType,
        reservation_row.businessDocumentId AS businessDocumentId,
        reservation_row.businessDocumentLineId AS businessDocumentLineId,
        reservation_row.startNumber AS startNumber,
        reservation_row.endNumber AS endNumber,
        reservation_row.status AS status,
        reservation_row.reservedAt AS reservedAt,
        reservation_row.releasedAt AS releasedAt,
        reservation_row.createdBy AS createdBy,
        reservation_row.createdAt AS createdAt,
        reservation_row.updatedBy AS updatedBy,
        reservation_row.updatedAt AS updatedAt
      FROM ${TARGET_TABLES.reservation} reservation_row
      INNER JOIN migration_staging.${MAP_TABLES.reservation} map_row
        ON map_row.target_id = reservation_row.id
      LEFT JOIN ${TARGET_TABLES.line} line_row
        ON line_row.id = reservation_row.businessDocumentLineId
      LEFT JOIN customer_stock_order order_row
        ON order_row.id = line_row.orderId
      WHERE map_row.migration_batch = ?
      ORDER BY reservation_row.id ASC
    `,
    [migrationBatch],
  );

  return new Map(
    rows.map((row) => [buildTargetCodeIdentity(row), row] as const),
  );
}

async function getLineRowsById(
  connection: {
    query<T = unknown>(sql: string, values?: readonly unknown[]): Promise<T>;
  },
  lineIds: readonly number[],
): Promise<Map<number, LineStoredRow>> {
  if (lineIds.length === 0) {
    return new Map();
  }

  const placeholders = lineIds.map(() => "?").join(", ");
  const rows = await connection.query<LineStoredRow[]>(
    `
      SELECT
        line_row.id AS targetLineId,
        CASE
          WHEN order_row.documentNo IS NULL OR line_row.lineNo IS NULL THEN NULL
          ELSE CONCAT(order_row.documentNo, '#', line_row.lineNo)
        END AS targetLineCode,
        line_row.startNumber AS startNumber,
        line_row.endNumber AS endNumber,
        line_row.sourceDocumentType AS sourceDocumentType,
        line_row.sourceDocumentId AS sourceDocumentId,
        line_row.sourceDocumentLineId AS sourceDocumentLineId
      FROM ${TARGET_TABLES.line} line_row
      LEFT JOIN customer_stock_order order_row
        ON order_row.id = line_row.orderId
      WHERE line_row.id IN (${placeholders})
      ORDER BY line_row.id ASC
    `,
    lineIds,
  );

  return new Map(rows.map((row) => [row.targetLineId, row] as const));
}

async function main(): Promise<void> {
  const cliOptions = parseMigrationCliOptions();
  const reportPath = resolveReportPath(
    cliOptions,
    "outbound-reservation-validate-report.json",
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

    const expectedArchivedIntervals = collectExpectedArchivedIntervals(plan);

    const report = await withPoolConnection(
      targetPool,
      async (targetConnection) => {
        const validationIssues: Array<Record<string, unknown>> = [];
        const stagingReady = await stagingSchemaExists(targetConnection);
        const expectedLiveReservations = plan.liveReservations.length;

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

        if (
          plan.counts.liveReservationCount +
            plan.counts.archivedIntervalCount !==
          plan.counts.sourceIntervalCount
        ) {
          validationIssues.push({
            severity: "blocker",
            reason:
              "Deterministic plan does not partition every legacy interval row.",
            sourceIntervalCount: plan.counts.sourceIntervalCount,
            liveReservationCount: plan.counts.liveReservationCount,
            archivedIntervalCount: plan.counts.archivedIntervalCount,
          });
        }

        const reservationTargetRows = await getTableCount(
          targetConnection,
          TARGET_TABLES.reservation,
        );
        const reservationBatchMapRows = stagingReady
          ? await getBatchMapCount(
              targetConnection,
              MAP_TABLES.reservation,
              plan.migrationBatch,
            )
          : 0;
        const batchOwnedReservationRows = stagingReady
          ? await getBatchOwnedReservationRows(
              targetConnection,
              plan.migrationBatch,
            )
          : 0;
        const missingMappedReservations = stagingReady
          ? await getMissingMapTargets(
              targetConnection,
              MAP_TABLES.reservation,
              TARGET_TABLES.reservation,
              plan.migrationBatch,
            )
          : 0;
        const archivedIntervalCount = stagingReady
          ? await getArchivedIntervalCount(
              targetConnection,
              plan.migrationBatch,
            )
          : 0;
        const archivedIntervalRows = stagingReady
          ? await getArchivedIntervalRows(targetConnection, plan.migrationBatch)
          : [];
        const forbiddenTableCounts =
          await getForbiddenTableCounts(targetConnection);
        const forbiddenBaselineCounts = readExecuteReportForbiddenBaseline();

        if (
          stagingReady &&
          reservationBatchMapRows !== expectedLiveReservations
        ) {
          validationIssues.push({
            severity: "blocker",
            reason:
              "Reservation map row count does not match the deterministic plan.",
            expectedLiveReservations,
            actualReservationMapRows: reservationBatchMapRows,
          });
        }

        if (batchOwnedReservationRows !== expectedLiveReservations) {
          validationIssues.push({
            severity: "blocker",
            reason:
              "Batch-owned factory_number_reservation row count does not match the deterministic plan.",
            expectedLiveReservations,
            actualBatchOwnedReservationRows: batchOwnedReservationRows,
          });
        }

        if (missingMappedReservations > 0) {
          validationIssues.push({
            severity: "blocker",
            reason:
              "Some reservation staging map rows point at missing target rows.",
            missingMappedReservations,
          });
        }

        if (
          stagingReady &&
          archivedIntervalCount !== expectedArchivedIntervals.length
        ) {
          validationIssues.push({
            severity: "blocker",
            reason:
              "archived_intervals row count does not match the deterministic reservation plan.",
            expectedArchivedIntervalCount: expectedArchivedIntervals.length,
            actualArchivedIntervalCount: archivedIntervalCount,
          });
        }

        if (!forbiddenBaselineCounts) {
          validationIssues.push({
            severity: "blocker",
            reason:
              "Cannot verify forbidden downstream table counts remained unchanged because the outbound-reservation execute report baseline is missing.",
          });
        } else {
          for (const [tableName, total] of Object.entries(
            forbiddenTableCounts,
          )) {
            const baselineTotal = Number(
              forbiddenBaselineCounts[tableName] ?? 0,
            );

            if (total !== baselineTotal) {
              validationIssues.push({
                severity: "blocker",
                reason:
                  "A forbidden downstream table count changed relative to the execute-time baseline.",
                tableName,
                baselineTotal,
                actualTotal: total,
              });
            }
          }
        }

        const archivedRowsByIdentity = new Map(
          archivedIntervalRows.map(
            (row) => [buildArchivedIntervalIdentity(row), row] as const,
          ),
        );
        const expectedArchivedKeys = new Set(
          expectedArchivedIntervals.map((record) =>
            buildArchivedIntervalIdentity(record),
          ),
        );

        for (const expectation of expectedArchivedIntervals) {
          const storedRow = archivedRowsByIdentity.get(
            buildArchivedIntervalIdentity(expectation),
          );

          if (!storedRow) {
            validationIssues.push({
              severity: "blocker",
              reason: "Expected archived_intervals row is missing.",
              legacyTable: expectation.legacyTable,
              legacyId: expectation.legacyId,
            });
            continue;
          }

          if (storedRow.archiveReason !== expectation.archiveReason) {
            validationIssues.push({
              severity: "blocker",
              reason:
                "archived_intervals archive_reason does not match the deterministic plan.",
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
                "archived_intervals payload_json does not match the deterministic plan.",
              legacyTable: expectation.legacyTable,
              legacyId: expectation.legacyId,
            });
          }
        }

        const unexpectedArchivedRows = archivedIntervalRows.filter(
          (row) =>
            !expectedArchivedKeys.has(buildArchivedIntervalIdentity(row)),
        );

        if (unexpectedArchivedRows.length > 0) {
          validationIssues.push({
            severity: "blocker",
            reason:
              "archived_intervals contains rows outside the deterministic reservation plan.",
            unexpectedArchivedRows: unexpectedArchivedRows.map((row) => ({
              legacyTable: row.legacyTable,
              legacyId: row.legacyId,
            })),
          });
        }

        const reservationRowsByTargetCode =
          await getReservationRowsByTargetCode(
            targetConnection,
            plan.migrationBatch,
          );

        for (const reservation of plan.liveReservations) {
          const targetRow = reservationRowsByTargetCode.get(
            buildTargetCodeIdentity({ targetCode: reservation.targetCode }),
          );

          if (!targetRow) {
            validationIssues.push({
              severity: "blocker",
              reason: "Expected factory_number_reservation row is missing.",
              legacyTable: reservation.legacyTable,
              legacyId: reservation.legacyId,
              targetCode: reservation.targetCode,
            });
            continue;
          }

          const context = {
            legacyTable: reservation.legacyTable,
            legacyId: reservation.legacyId,
            targetCode: reservation.targetCode,
          };

          pushValueMismatch(
            validationIssues,
            context,
            "factory_number_reservation.materialId",
            reservation.target.materialId,
            targetRow.materialId,
          );
          pushValueMismatch(
            validationIssues,
            context,
            "factory_number_reservation.workshopId",
            reservation.target.workshopId,
            targetRow.workshopId,
          );
          pushValueMismatch(
            validationIssues,
            context,
            "factory_number_reservation.businessDocumentType",
            reservation.target.businessDocumentType,
            targetRow.businessDocumentType,
          );
          pushValueMismatch(
            validationIssues,
            context,
            "factory_number_reservation.businessDocumentId",
            reservation.target.businessDocumentId,
            targetRow.businessDocumentId,
          );
          pushValueMismatch(
            validationIssues,
            context,
            "factory_number_reservation.businessDocumentLineId",
            reservation.target.businessDocumentLineId,
            targetRow.businessDocumentLineId,
          );
          pushValueMismatch(
            validationIssues,
            context,
            "factory_number_reservation.startNumber",
            reservation.target.startNumber,
            targetRow.startNumber,
          );
          pushValueMismatch(
            validationIssues,
            context,
            "factory_number_reservation.endNumber",
            reservation.target.endNumber,
            targetRow.endNumber,
          );
          pushValueMismatch(
            validationIssues,
            context,
            "factory_number_reservation.status",
            reservation.target.status,
            targetRow.status,
          );
          pushValueMismatch(
            validationIssues,
            context,
            "factory_number_reservation.reservedAt",
            reservation.target.reservedAt,
            targetRow.reservedAt,
          );
          pushValueMismatch(
            validationIssues,
            context,
            "factory_number_reservation.releasedAt",
            reservation.target.releasedAt,
            targetRow.releasedAt,
          );
          pushValueMismatch(
            validationIssues,
            context,
            "factory_number_reservation.createdBy",
            reservation.target.createdBy,
            targetRow.createdBy,
          );
          pushValueMismatch(
            validationIssues,
            context,
            "factory_number_reservation.createdAt",
            reservation.target.createdAt,
            targetRow.createdAt,
          );
          pushValueMismatch(
            validationIssues,
            context,
            "factory_number_reservation.updatedBy",
            reservation.target.updatedBy,
            targetRow.updatedBy,
          );
          pushValueMismatch(
            validationIssues,
            context,
            "factory_number_reservation.updatedAt",
            reservation.target.updatedAt,
            targetRow.updatedAt,
          );
        }

        const expectedLineStates = collectExpectedLineStates(
          snapshot,
          dependencies,
          plan,
        );
        const lineIds = expectedLineStates.map((record) => record.targetLineId);
        const lineRowsById = await getLineRowsById(targetConnection, lineIds);

        if (lineRowsById.size !== expectedLineStates.length) {
          validationIssues.push({
            severity: "blocker",
            reason:
              "Touched customer_stock_order_line rows could not be resolved for every deterministic reservation line state.",
            expectedTouchedLines: expectedLineStates.length,
            actualResolvedLines: lineRowsById.size,
          });
        }

        for (const lineBackfill of expectedLineStates) {
          const targetLine = lineRowsById.get(lineBackfill.targetLineId);

          if (!targetLine) {
            validationIssues.push({
              severity: "blocker",
              reason: "Expected customer_stock_order_line row is missing.",
              targetLineId: lineBackfill.targetLineId,
              targetLineCode: lineBackfill.targetLineCode,
            });
            continue;
          }

          const context = {
            targetLineId: lineBackfill.targetLineId,
            targetLineCode: lineBackfill.targetLineCode,
          };

          pushValueMismatch(
            validationIssues,
            context,
            "customer_stock_order_line.startNumber",
            lineBackfill.startNumber,
            targetLine.startNumber,
          );
          pushValueMismatch(
            validationIssues,
            context,
            "customer_stock_order_line.endNumber",
            lineBackfill.endNumber,
            targetLine.endNumber,
          );
          pushValueMismatch(
            validationIssues,
            context,
            "customer_stock_order_line.sourceDocumentType",
            lineBackfill.preservedSourceDocumentType,
            targetLine.sourceDocumentType,
          );
          pushValueMismatch(
            validationIssues,
            context,
            "customer_stock_order_line.sourceDocumentId",
            lineBackfill.preservedSourceDocumentId,
            targetLine.sourceDocumentId,
          );
          pushValueMismatch(
            validationIssues,
            context,
            "customer_stock_order_line.sourceDocumentLineId",
            lineBackfill.preservedSourceDocumentLineId,
            targetLine.sourceDocumentLineId,
          );
        }

        return {
          mode: "validate",
          targetDatabaseName,
          migrationBatch: plan.migrationBatch,
          sourceCounts: {
            intervals: snapshot.intervals.length,
            outboundDetailReferences: snapshot.outboundDetailReferences.length,
          },
          dependencyBaseline: dependencies.outboundBaseBaseline,
          counts: plan.counts,
          expectedArchivedIntervalCount: expectedArchivedIntervals.length,
          targetSummary: {
            reservationTargetRows,
            reservationBatchMapRows,
            batchOwnedReservationRows,
            missingMappedReservations,
            archivedIntervalCount,
            touchedLineCount: lineIds.length,
            forbiddenBaselineCounts,
            forbiddenTableCounts,
          },
          validationIssues,
        };
      },
    );

    writeStableReport(reportPath, report);
    console.log(
      `Outbound reservation validation completed. report=${reportPath}`,
    );

    if (report.validationIssues.some((issue) => issue.severity === "blocker")) {
      process.exitCode = 1;
    }
  } finally {
    await closePools(legacyPool, targetPool);
  }
}

void main();
