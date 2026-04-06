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
  readLegacyScrapSnapshot,
  readScrapDependencySnapshot,
} from "./legacy-reader";
import { buildScrapMigrationPlan } from "./transformer";
import type { ArchivedFieldPayloadRecord, ScrapMigrationPlan } from "./types";
import { MAP_TABLES, TARGET_TABLES } from "./writer";

function comparableScalar(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const stringValue = String(value).trim();
  const dateTimeMatch = stringValue.match(
    /^(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})(?:\.\d+)?$/u,
  );
  if (dateTimeMatch) return dateTimeMatch[1] ?? stringValue;

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

function _pushValueMismatch(
  validationIssues: Array<Record<string, unknown>>,
  context: Record<string, unknown>,
  field: string,
  expected: unknown,
  actual: unknown,
): void {
  if (comparableScalar(expected) === comparableScalar(actual)) return;
  validationIssues.push({
    severity: "blocker",
    ...context,
    field,
    reason: `${field} does not match the deterministic migration plan.`,
    expected,
    actual,
  });
}

async function _getTableCount(
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
    `SELECT COUNT(*) AS total FROM migration_staging.${mapTableName} WHERE migration_batch = ?`,
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
      INNER JOIN migration_staging.${mapTableName} map_row ON map_row.target_id = target_row.id
      WHERE map_row.migration_batch = ?
    `,
    [migrationBatch],
  );
  return Number(rows[0]?.total ?? 0);
}

async function stagingSchemaExists(connection: {
  query<T = unknown>(sql: string, values?: readonly unknown[]): Promise<T>;
}): Promise<boolean> {
  const rows = await connection.query<Array<{ schemaName: string }>>(
    `SELECT schema_name AS schemaName FROM information_schema.schemata WHERE schema_name = 'migration_staging'`,
  );
  return rows.length > 0;
}

function collectExpectedArchivedPayloads(plan: ScrapMigrationPlan): Array<{
  legacyTable: string;
  legacyId: number;
  targetTable: string;
  targetCode: string;
  payloadKind: ArchivedFieldPayloadRecord["payloadKind"];
  archiveReason: string;
  payloadJson: string;
}> {
  const expectations: Array<{
    legacyTable: string;
    legacyId: number;
    targetTable: string;
    targetCode: string;
    payloadKind: ArchivedFieldPayloadRecord["payloadKind"];
    archiveReason: string;
    payloadJson: string;
  }> = [];

  for (const order of plan.migratedOrders) {
    expectations.push({
      legacyTable: order.archivedPayload.legacyTable,
      legacyId: order.archivedPayload.legacyId,
      targetTable: order.archivedPayload.targetTable,
      targetCode: order.archivedPayload.targetCode,
      payloadKind: order.archivedPayload.payloadKind,
      archiveReason: order.archivedPayload.archiveReason,
      payloadJson: stableJsonStringify(order.archivedPayload.payload),
    });
    for (const line of order.lines) {
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

  return expectations.sort(
    (left, right) =>
      left.legacyTable.localeCompare(right.legacyTable) ||
      left.legacyId - right.legacyId,
  );
}

async function main(): Promise<void> {
  const cliOptions = parseMigrationCliOptions();
  const reportPath = resolveReportPath(
    cliOptions,
    "scrap-validate-report.json",
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
    const { plan } = await withPoolConnection(
      legacyPool,
      async (legacyConnection) => {
        const snapshot = await readLegacyScrapSnapshot(legacyConnection);
        const dependencies = await withPoolConnection(
          targetPool,
          async (targetConnection) =>
            readScrapDependencySnapshot(targetConnection),
        );
        return {
          plan: buildScrapMigrationPlan(snapshot, dependencies),
        };
      },
    );

    const expectedArchivedPayloads = collectExpectedArchivedPayloads(plan);

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

        if (plan.globalBlockers.length > 0) {
          validationIssues.push(
            ...plan.globalBlockers.map((blocker) => ({
              severity: "blocker",
              reason: blocker.reason,
              ...blocker.details,
            })),
          );
        }

        const orderBatchMapRows = stagingReady
          ? await getBatchMapCount(
              targetConnection,
              MAP_TABLES.order,
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
        const batchOwnedOrderRows = stagingReady
          ? await getBatchOwnedTargetRowCount(
              targetConnection,
              MAP_TABLES.order,
              TARGET_TABLES.order,
              plan.migrationBatch,
            )
          : 0;
        const batchOwnedLineRows = stagingReady
          ? await getBatchOwnedTargetRowCount(
              targetConnection,
              MAP_TABLES.line,
              TARGET_TABLES.line,
              plan.migrationBatch,
            )
          : 0;

        const expectedMigratedOrders = plan.migratedOrders.length;
        const expectedMigratedLines = plan.migratedOrders.reduce(
          (total, order) => total + order.lines.length,
          0,
        );

        if (stagingReady && orderBatchMapRows !== expectedMigratedOrders) {
          validationIssues.push({
            severity: "blocker",
            reason:
              "workshop_material_order map row count does not match the deterministic scrap migration plan.",
            expectedMigratedOrders,
            actualOrderMapRows: orderBatchMapRows,
          });
        }

        if (stagingReady && lineBatchMapRows !== expectedMigratedLines) {
          validationIssues.push({
            severity: "blocker",
            reason:
              "workshop_material_order_line map row count does not match the deterministic scrap migration plan.",
            expectedMigratedLines,
            actualLineMapRows: lineBatchMapRows,
          });
        }

        if (batchOwnedOrderRows !== expectedMigratedOrders) {
          validationIssues.push({
            severity: "blocker",
            reason:
              "Batch-owned workshop_material_order row count does not match the scrap migration plan.",
            expectedMigratedOrders,
            actualBatchOwnedOrderRows: batchOwnedOrderRows,
          });
        }

        if (batchOwnedLineRows !== expectedMigratedLines) {
          validationIssues.push({
            severity: "blocker",
            reason:
              "Batch-owned workshop_material_order_line row count does not match the scrap migration plan.",
            expectedMigratedLines,
            actualBatchOwnedLineRows: batchOwnedLineRows,
          });
        }

        return {
          mode: "validate",
          targetDatabaseName,
          migrationBatch: plan.migrationBatch,
          counts: plan.counts,
          expectedArchivedPayloadCount: expectedArchivedPayloads.length,
          targetSummary: {
            orderBatchMapRows,
            lineBatchMapRows,
            batchOwnedOrderRows,
            batchOwnedLineRows,
          },
          validationIssues,
        };
      },
    );

    writeStableReport(reportPath, report);
    console.log(`Scrap validation completed. report=${reportPath}`);

    if (report.validationIssues.some((issue) => issue.severity === "blocker")) {
      process.exitCode = 1;
    }
  } finally {
    await closePools(legacyPool, targetPool);
  }
}

void main();
