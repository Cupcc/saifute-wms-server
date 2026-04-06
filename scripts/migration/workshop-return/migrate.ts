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
  buildDocumentNoCollisionBlockers,
  buildDownstreamConsumerBlockers,
  buildMapConsistencyBlockers,
  buildMissingMapTargetBlockers,
} from "./execute-guard";
import {
  readLegacyWorkshopReturnSnapshot,
  readWorkshopReturnDependencySnapshot,
} from "./legacy-reader";
import {
  buildDryRunSummary,
  buildWorkshopReturnMigrationPlan,
  hasExecutionBlockers,
} from "./transformer";
import { executeWorkshopReturnPlan, MAP_TABLES, TARGET_TABLES } from "./writer";

interface StoredMapRow {
  legacyTable: string;
  legacyId: number;
  targetTable: string;
  targetId: number;
  targetCode: string | null;
  actualTargetCode: string | null;
  actualFingerprint: string | null;
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

interface Batch3bPickBaselinePreservation {
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

const EXPECTED_BATCH3B_PICK_ORDER_MAP_COUNT = 61;
const EXPECTED_BATCH3B_PICK_LINE_MAP_COUNT = 145;
const EXPECTED_BATCH3B_PICK_EXCLUDED_COUNT = 14;
const BATCH3B_MIGRATION_BATCH = "batch3b-workshop-pick-base";

function buildOrderFingerprint(input: {
  orderType: string;
  workshopId: number;
  lifecycleStatus: string;
  auditStatusSnapshot: string;
  inventoryEffectStatus: string;
  bizDate: string;
  totalQty: string;
  totalAmount: string;
}): string {
  return [
    input.orderType,
    String(input.workshopId),
    input.lifecycleStatus,
    input.auditStatusSnapshot,
    input.inventoryEffectStatus,
    input.bizDate,
    input.totalQty,
    input.totalAmount,
  ].join("|");
}

function buildLineFingerprint(input: {
  materialId: number;
  quantity: string;
  sourceDocumentType: string | null;
  sourceDocumentId: number | null;
  sourceDocumentLineId: number | null;
}): string {
  return [
    String(input.materialId),
    input.quantity,
    input.sourceDocumentType ?? "",
    input.sourceDocumentId !== null ? String(input.sourceDocumentId) : "",
    input.sourceDocumentLineId !== null
      ? String(input.sourceDocumentLineId)
      : "",
  ].join("|");
}

function buildMapIdentity(input: {
  legacyTable: string;
  legacyId: number;
}): string {
  return `${input.legacyTable}::${input.legacyId}`;
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
        order_row.documentNo AS actualTargetCode,
        CASE
          WHEN order_row.id IS NULL THEN NULL
          ELSE CONCAT_WS(
            '|',
            COALESCE(order_row.orderType, ''),
            COALESCE(CAST(order_row.workshopId AS CHAR), ''),
            COALESCE(order_row.lifecycleStatus, ''),
            COALESCE(order_row.auditStatusSnapshot, ''),
            COALESCE(order_row.inventoryEffectStatus, ''),
            COALESCE(CAST(order_row.bizDate AS CHAR), ''),
            COALESCE(CAST(order_row.totalQty AS CHAR), ''),
            COALESCE(CAST(order_row.totalAmount AS CHAR), '')
          )
        END AS actualFingerprint
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
        END AS actualTargetCode,
        CASE
          WHEN line_row.id IS NULL THEN NULL
          ELSE CONCAT_WS(
            '|',
            COALESCE(CAST(line_row.materialId AS CHAR), ''),
            COALESCE(CAST(line_row.quantity AS CHAR), ''),
            COALESCE(line_row.sourceDocumentType, ''),
            COALESCE(CAST(line_row.sourceDocumentId AS CHAR), ''),
            COALESCE(CAST(line_row.sourceDocumentLineId AS CHAR), '')
          )
        END AS actualFingerprint
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
    targetFingerprint: string;
  }>,
  storedRows: StoredMapRow[],
): {
  missingExpectedMapRows: number;
  unexpectedMapRows: number;
  mismatchedTargetCodes: number;
  mismatchedActualTargetCodes: number;
  mismatchedActualTargetRows: number;
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
  let mismatchedActualTargetRows = 0;

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

    if (
      storedRow.actualFingerprint !== null &&
      storedRow.actualFingerprint !== expectedRow.targetFingerprint
    ) {
      mismatchedActualTargetRows += 1;
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
    mismatchedActualTargetRows,
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

async function getExistingUnownedDocumentNos(
  connection: {
    query<T = unknown>(sql: string, values?: readonly unknown[]): Promise<T>;
  },
  migrationBatch: string,
  plannedDocumentNos: string[],
): Promise<string[]> {
  if (plannedDocumentNos.length === 0) {
    return [];
  }

  const placeholders = plannedDocumentNos.map(() => "?").join(", ");
  const rows = await connection.query<Array<{ documentNo: string }>>(
    `
      SELECT order_row.documentNo
      FROM ${TARGET_TABLES.order} order_row
      LEFT JOIN migration_staging.${MAP_TABLES.order} map_row
        ON map_row.target_id = order_row.id
        AND map_row.migration_batch = ?
      WHERE order_row.documentNo IN (${placeholders})
        AND map_row.target_id IS NULL
    `,
    [migrationBatch, ...plannedDocumentNos],
  );

  return rows.map((row) => row.documentNo);
}

async function getDownstreamConsumerCounts(connection: {
  query<T = unknown>(sql: string, values?: readonly unknown[]): Promise<T>;
}): Promise<Record<string, number>> {
  const rows = await connection.query<
    Array<{ consumer: string; total: number }>
  >(
    `
      SELECT 'audit_document' AS consumer, COUNT(*) AS total
      FROM audit_document
      WHERE documentFamily = 'WORKSHOP_MATERIAL' OR documentType = 'WorkshopMaterialOrder'
      UNION ALL
      SELECT 'document_relation' AS consumer, COUNT(*) AS total
      FROM document_relation
      WHERE upstreamFamily = 'WORKSHOP_MATERIAL'
         OR downstreamFamily = 'WORKSHOP_MATERIAL'
         OR upstreamDocumentType = 'WorkshopMaterialOrder'
         OR downstreamDocumentType = 'WorkshopMaterialOrder'
      UNION ALL
      SELECT 'document_line_relation' AS consumer, COUNT(*) AS total
      FROM document_line_relation
      WHERE upstreamFamily = 'WORKSHOP_MATERIAL'
         OR downstreamFamily = 'WORKSHOP_MATERIAL'
         OR upstreamDocumentType = 'WorkshopMaterialOrder'
         OR downstreamDocumentType = 'WorkshopMaterialOrder'
      UNION ALL
      SELECT 'inventory_log' AS consumer, COUNT(*) AS total
      FROM inventory_log
      WHERE businessDocumentType = 'WorkshopMaterialOrder'
      UNION ALL
      SELECT 'inventory_source_usage' AS consumer, COUNT(*) AS total
      FROM inventory_source_usage
      WHERE consumerDocumentType = 'WorkshopMaterialOrder'
    `,
  );

  return Object.fromEntries(
    rows.map((row) => [row.consumer, Number(row.total)] as const),
  );
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

  const issues: string[] = [];
  const pickOrderMapCount = Number(row.pickOrderMapCount);
  const pickLineMapCount = Number(row.pickLineMapCount);
  const pickExcludedCount = Number(row.pickExcludedCount);
  const pickOrderCount = Number(row.pickOrderCount);
  const pickLineCount = Number(row.pickLineCount);

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
  if (pickOrderCount !== EXPECTED_BATCH3B_PICK_ORDER_MAP_COUNT) {
    issues.push(
      `batch3b live PICK order count changed: expected ${EXPECTED_BATCH3B_PICK_ORDER_MAP_COUNT}, found ${pickOrderCount}.`,
    );
  }
  if (pickLineCount !== EXPECTED_BATCH3B_PICK_LINE_MAP_COUNT) {
    issues.push(
      `batch3b live PICK line count changed: expected ${EXPECTED_BATCH3B_PICK_LINE_MAP_COUNT}, found ${pickLineCount}.`,
    );
  }

  return {
    pickOrderMapCount,
    pickLineMapCount,
    pickExcludedCount,
    pickOrderCount,
    pickLineCount,
    expectedPickOrderMapCount: EXPECTED_BATCH3B_PICK_ORDER_MAP_COUNT,
    expectedPickLineMapCount: EXPECTED_BATCH3B_PICK_LINE_MAP_COUNT,
    expectedPickExcludedCount: EXPECTED_BATCH3B_PICK_EXCLUDED_COUNT,
    issues,
  };
}

async function main(): Promise<void> {
  const cliOptions = parseMigrationCliOptions();
  const reportPath = resolveReportPath(
    cliOptions,
    cliOptions.execute
      ? "workshop-return-execute-report.json"
      : "workshop-return-dry-run-report.json",
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
        const snapshot =
          await readLegacyWorkshopReturnSnapshot(legacyConnection);
        const dependencies = await withPoolConnection(
          targetPool,
          async (targetConnection) =>
            readWorkshopReturnDependencySnapshot(targetConnection),
        );

        return {
          snapshot,
          dependencies,
          plan: buildWorkshopReturnMigrationPlan(snapshot, dependencies),
        };
      },
    );

    const dryRunReport = {
      mode: cliOptions.execute ? "execute" : "dry-run",
      targetDatabaseName,
      ...buildDryRunSummary(plan),
    };

    if (!cliOptions.execute) {
      writeStableReport(reportPath, dryRunReport);
      console.log(`Workshop-return dry-run completed. report=${reportPath}`);

      if (hasExecutionBlockers(plan)) {
        process.exitCode = 1;
      }

      return;
    }

    let orderBatchMapRows = 0;
    let lineBatchMapRows = 0;
    let missingMappedOrders = 0;
    let missingMappedLines = 0;
    let orderMapConsistency = {
      missingExpectedMapRows: 0,
      unexpectedMapRows: 0,
      mismatchedTargetCodes: 0,
      mismatchedActualTargetCodes: 0,
      mismatchedActualTargetRows: 0,
    };
    let lineMapConsistency = {
      missingExpectedMapRows: 0,
      unexpectedMapRows: 0,
      mismatchedTargetCodes: 0,
      mismatchedActualTargetCodes: 0,
      mismatchedActualTargetRows: 0,
    };
    let downstreamConsumerCounts: Record<string, number> = {};
    let forbiddenTableCounts: ForbiddenTableCounts = {
      document_relation: 0,
      document_line_relation: 0,
      audit_document: 0,
      inventory_balance: 0,
      inventory_log: 0,
      inventory_source_usage: 0,
      factory_number_reservation: 0,
    };
    let batch3bPickBaselinePreservation: Batch3bPickBaselinePreservation = {
      pickOrderMapCount: 0,
      pickLineMapCount: 0,
      pickExcludedCount: 0,
      pickOrderCount: 0,
      pickLineCount: 0,
      expectedPickOrderMapCount: EXPECTED_BATCH3B_PICK_ORDER_MAP_COUNT,
      expectedPickLineMapCount: EXPECTED_BATCH3B_PICK_LINE_MAP_COUNT,
      expectedPickExcludedCount: EXPECTED_BATCH3B_PICK_EXCLUDED_COUNT,
      issues: [],
    };
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
            await getDownstreamConsumerCounts(targetConnection);
          forbiddenTableCounts =
            await getForbiddenTableCounts(targetConnection);
          batch3bPickBaselinePreservation =
            await getBatch3bPickBaselinePreservation(targetConnection);

          const isRerun = orderBatchMapRows > 0 || lineBatchMapRows > 0;

          if (orderBatchMapRows > 0) {
            const storedOrderMapRows = await getOrderMapRows(
              targetConnection,
              plan.migrationBatch,
            );
            orderMapConsistency = buildMapConsistencySummary(
              plan.admittedOrders.map((order) => ({
                legacyTable: order.legacyTable,
                legacyId: order.legacyId,
                targetTable: order.targetTable,
                targetCode: order.target.documentNo,
                targetFingerprint: buildOrderFingerprint({
                  orderType: order.target.orderType,
                  workshopId: order.target.workshopId,
                  lifecycleStatus: order.target.lifecycleStatus,
                  auditStatusSnapshot: order.target.auditStatusSnapshot,
                  inventoryEffectStatus: order.target.inventoryEffectStatus,
                  bizDate: order.target.bizDate,
                  totalQty: order.target.totalQty,
                  totalAmount: order.target.totalAmount,
                }),
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
              plan.admittedOrders.flatMap((order) =>
                order.lines.map((line) => ({
                  legacyTable: line.legacyTable,
                  legacyId: line.legacyId,
                  targetTable: line.targetTable,
                  targetCode: line.targetCode,
                  targetFingerprint: buildLineFingerprint({
                    materialId: line.target.materialId,
                    quantity: line.target.quantity,
                    sourceDocumentType: line.target.sourceDocumentType,
                    sourceDocumentId: line.target.sourceDocumentId,
                    sourceDocumentLineId: line.target.sourceDocumentLineId,
                  }),
                })),
              ),
              storedLineMapRows,
            );
          }

          const plannedDocumentNos = plan.admittedOrders.map(
            (order) => order.target.documentNo,
          );
          const existingUnownedDocumentNos =
            await getExistingUnownedDocumentNos(
              targetConnection,
              plan.migrationBatch,
              plannedDocumentNos,
            );

          executeBlockers.push(
            ...buildDocumentNoCollisionBlockers({
              plannedDocumentNos,
              existingUnownedDocumentNos,
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
              isRerun,
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
              orderBatchMapRows,
              lineBatchMapRows,
              missingMappedOrders,
              missingMappedLines,
              orderMapConsistency,
              lineMapConsistency,
              downstreamConsumerCounts,
              forbiddenTableCounts,
              batch3bPickBaselinePreservation,
            },
            executeBlockers,
          };
          writeStableReport(reportPath, blockedReport);
          process.exitCode = 1;
          return blockedReport;
        }

        const executionResult = await executeWorkshopReturnPlan(
          targetConnection,
          plan,
        );
        const report = {
          ...dryRunReport,
          executionRequested: true,
          stagingReady,
          targetSummary: {
            orderBatchMapRows,
            lineBatchMapRows,
            missingMappedOrders,
            missingMappedLines,
            orderMapConsistency,
            lineMapConsistency,
            downstreamConsumerCounts,
            forbiddenTableCounts,
            batch3bPickBaselinePreservation,
          },
          executionResult,
        };
        writeStableReport(reportPath, report);
        return report;
      },
    );

    console.log(`Workshop-return execute completed. report=${reportPath}`);

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
