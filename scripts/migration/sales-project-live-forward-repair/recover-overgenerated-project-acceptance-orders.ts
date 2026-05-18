import {
  assertExpectedDatabaseName,
  EXPECTED_TARGET_DATABASE_NAME,
  loadMigrationEnvironment,
  parseMigrationCliOptions,
  resolveReportPath,
} from "../config";
import {
  closePools,
  createMariaDbPool,
  type MigrationConnectionLike,
  withPoolConnection,
} from "../db";
import { writeStableReport } from "../shared/report-writer";

const DRY_RUN_REPORT_FILE_NAME =
  "sales-project-legacy-admission-split-recovery-dry-run-report.json";
const EXECUTE_REPORT_FILE_NAME =
  "sales-project-legacy-admission-split-recovery-execute-report.json";
const GENERATED_DOCUMENT_PREFIX = "YS-PROJ-";
const ALLOWED_GENERATED_BY = [
  "sales-project-accepted-inbound-backfill",
  "sales-project-acceptance-backfill",
] as const;
const STOCK_IN_DOCUMENT_TYPE = "StockInOrder";
const EXPECTED_RECOVERY_SCOPE = {
  orderCount: 99,
  lineCount: 380,
} as const;

interface RecoveryOrderRow {
  orderId: number;
  documentNo: string;
  salesProjectId: number | null;
  createdBy: string | null;
  lineCount: number;
}

interface RecoveryLineRow {
  orderLineId: number;
  orderId: number;
}

interface DownstreamCounts {
  inventoryLogCount: number;
  inventorySourceUsageAsSourceCount: number;
  inventorySourceUsageAsConsumerCount: number;
  documentRelationCount: number;
  documentLineRelationCount: number;
  approvalDocumentCount: number;
  factoryNumberReservationCount: number;
  priceCorrectionLineCount: number;
}

interface RecoveryBlocker {
  reason: string;
  expected?: number | string;
  actual?: number | string;
  details?: Record<string, unknown>;
}

interface ExecutionResult {
  deletedOrders: number;
  deletedLines: number;
}

function numberValue(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "bigint") return Number(value);
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function affectedRowsValue(value: unknown): number {
  if (
    typeof value === "object" &&
    value !== null &&
    "affectedRows" in value &&
    typeof value.affectedRows === "number"
  ) {
    return value.affectedRows;
  }
  return 0;
}

function placeholders(values: readonly unknown[]): string {
  return values.map(() => "?").join(",");
}

function zeroDownstreamCounts(): DownstreamCounts {
  return {
    inventoryLogCount: 0,
    inventorySourceUsageAsSourceCount: 0,
    inventorySourceUsageAsConsumerCount: 0,
    documentRelationCount: 0,
    documentLineRelationCount: 0,
    approvalDocumentCount: 0,
    factoryNumberReservationCount: 0,
    priceCorrectionLineCount: 0,
  };
}

async function loadRecoveryOrders(
  connection: MigrationConnectionLike,
): Promise<RecoveryOrderRow[]> {
  return connection.query<RecoveryOrderRow[]>(
    `
      SELECT
        stock_in_order.id AS orderId,
        stock_in_order.document_no AS documentNo,
        stock_in_order.sales_project_id AS salesProjectId,
        stock_in_order.created_by AS createdBy,
        COUNT(stock_in_order_line.id) AS lineCount
      FROM stock_in_order
      LEFT JOIN stock_in_order_line
        ON stock_in_order_line.order_id = stock_in_order.id
      WHERE stock_in_order.document_no LIKE ?
      GROUP BY
        stock_in_order.id,
        stock_in_order.document_no,
        stock_in_order.sales_project_id,
        stock_in_order.created_by
      ORDER BY stock_in_order.document_no ASC
    `,
    [`${GENERATED_DOCUMENT_PREFIX}%`],
  );
}

async function loadRecoveryLines(
  connection: MigrationConnectionLike,
  orderIds: readonly number[],
): Promise<RecoveryLineRow[]> {
  if (orderIds.length === 0) return [];
  return connection.query<RecoveryLineRow[]>(
    `
      SELECT
        id AS orderLineId,
        order_id AS orderId
      FROM stock_in_order_line
      WHERE order_id IN (${placeholders(orderIds)})
      ORDER BY order_id ASC, line_no ASC
    `,
    orderIds,
  );
}

async function countSingle(
  connection: MigrationConnectionLike,
  sql: string,
  values: readonly unknown[],
): Promise<number> {
  const rows = await connection.query<Array<{ total: number }>>(sql, values);
  return numberValue(rows[0]?.total ?? 0);
}

async function loadDownstreamCounts(
  connection: MigrationConnectionLike,
  orderIds: readonly number[],
  lineIds: readonly number[],
): Promise<DownstreamCounts> {
  if (orderIds.length === 0) return zeroDownstreamCounts();
  const orderIdPlaceholders = placeholders(orderIds);
  const lineIdPlaceholders = placeholders(lineIds);
  const hasLines = lineIds.length > 0;

  const inventoryLogCount = await countSingle(
    connection,
    `
      SELECT COUNT(*) AS total
      FROM inventory_log
      WHERE business_document_type = ?
        AND business_document_id IN (${orderIdPlaceholders})
    `,
    [STOCK_IN_DOCUMENT_TYPE, ...orderIds],
  );
  const inventorySourceUsageAsSourceCount = await countSingle(
    connection,
    `
      SELECT COUNT(*) AS total
      FROM inventory_source_usage usage_row
      INNER JOIN inventory_log log_row
        ON log_row.id = usage_row.source_log_id
      WHERE log_row.business_document_type = ?
        AND log_row.business_document_id IN (${orderIdPlaceholders})
    `,
    [STOCK_IN_DOCUMENT_TYPE, ...orderIds],
  );
  const inventorySourceUsageAsConsumerCount = await countSingle(
    connection,
    `
      SELECT COUNT(*) AS total
      FROM inventory_source_usage
      WHERE consumer_document_type = ?
        AND consumer_document_id IN (${orderIdPlaceholders})
    `,
    [STOCK_IN_DOCUMENT_TYPE, ...orderIds],
  );
  const documentRelationCount = await countSingle(
    connection,
    `
      SELECT COUNT(*) AS total
      FROM document_relation
      WHERE (upstream_document_type = ?
             AND upstream_document_id IN (${orderIdPlaceholders}))
         OR (downstream_document_type = ?
             AND downstream_document_id IN (${orderIdPlaceholders}))
    `,
    [STOCK_IN_DOCUMENT_TYPE, ...orderIds, STOCK_IN_DOCUMENT_TYPE, ...orderIds],
  );
  const documentLineRelationCount = hasLines
    ? await countSingle(
        connection,
        `
          SELECT COUNT(*) AS total
          FROM document_line_relation
          WHERE (upstream_document_type = ?
                 AND upstream_line_id IN (${lineIdPlaceholders}))
             OR (downstream_document_type = ?
                 AND downstream_line_id IN (${lineIdPlaceholders}))
        `,
        [
          STOCK_IN_DOCUMENT_TYPE,
          ...lineIds,
          STOCK_IN_DOCUMENT_TYPE,
          ...lineIds,
        ],
      )
    : 0;
  const approvalDocumentCount = await countSingle(
    connection,
    `
      SELECT COUNT(*) AS total
      FROM approval_document
      WHERE document_type = ?
        AND document_id IN (${orderIdPlaceholders})
    `,
    [STOCK_IN_DOCUMENT_TYPE, ...orderIds],
  );
  const factoryNumberReservationCount = hasLines
    ? await countSingle(
        connection,
        `
          SELECT COUNT(*) AS total
          FROM factory_number_reservation
          WHERE business_document_type = ?
            AND (
              business_document_id IN (${orderIdPlaceholders})
              OR business_document_line_id IN (${lineIdPlaceholders})
            )
        `,
        [STOCK_IN_DOCUMENT_TYPE, ...orderIds, ...lineIds],
      )
    : 0;
  const priceCorrectionLineCount = hasLines
    ? await countSingle(
        connection,
        `
          SELECT COUNT(*) AS total
          FROM stock_in_price_correction_order_line
          WHERE source_stock_in_order_id IN (${orderIdPlaceholders})
             OR source_stock_in_order_line_id IN (${lineIdPlaceholders})
        `,
        [...orderIds, ...lineIds],
      )
    : 0;

  return {
    inventoryLogCount,
    inventorySourceUsageAsSourceCount,
    inventorySourceUsageAsConsumerCount,
    documentRelationCount,
    documentLineRelationCount,
    approvalDocumentCount,
    factoryNumberReservationCount,
    priceCorrectionLineCount,
  };
}

function pushCountBlocker(
  blockers: RecoveryBlocker[],
  reason: string,
  expected: number,
  actual: number,
): void {
  if (actual !== expected) {
    blockers.push({ reason, expected, actual });
  }
}

function buildBlockers(params: {
  orders: readonly RecoveryOrderRow[];
  lineCount: number;
  downstreamCounts: DownstreamCounts;
}): RecoveryBlocker[] {
  const blockers: RecoveryBlocker[] = [];
  pushCountBlocker(
    blockers,
    "recovery-order-count-drift",
    EXPECTED_RECOVERY_SCOPE.orderCount,
    params.orders.length,
  );
  pushCountBlocker(
    blockers,
    "recovery-line-count-drift",
    EXPECTED_RECOVERY_SCOPE.lineCount,
    params.lineCount,
  );

  const unsafeOrders = params.orders.filter(
    (order) =>
      !order.documentNo.startsWith(GENERATED_DOCUMENT_PREFIX) ||
      !ALLOWED_GENERATED_BY.includes(
        order.createdBy as (typeof ALLOWED_GENERATED_BY)[number],
      ) ||
      order.salesProjectId === null,
  );
  if (unsafeOrders.length > 0) {
    blockers.push({
      reason: "unsafe-generated-order-scope",
      details: {
        orders: unsafeOrders.map((order) => ({
          orderId: order.orderId,
          documentNo: order.documentNo,
          salesProjectId: order.salesProjectId,
          createdBy: order.createdBy,
        })),
      },
    });
  }

  const nonReplayDownstreamCounts = {
    documentRelationCount: params.downstreamCounts.documentRelationCount,
    documentLineRelationCount:
      params.downstreamCounts.documentLineRelationCount,
    approvalDocumentCount: params.downstreamCounts.approvalDocumentCount,
    factoryNumberReservationCount:
      params.downstreamCounts.factoryNumberReservationCount,
    priceCorrectionLineCount: params.downstreamCounts.priceCorrectionLineCount,
  };
  const nonReplayDownstreamTotal = Object.values(
    nonReplayDownstreamCounts,
  ).reduce((sum, count) => sum + count, 0);
  if (nonReplayDownstreamTotal > 0) {
    blockers.push({
      reason: "non-replay-downstream-reference-exists",
      details: nonReplayDownstreamCounts,
    });
  }

  return blockers;
}

async function executeRecovery(
  connection: MigrationConnectionLike,
  orderIds: readonly number[],
): Promise<ExecutionResult> {
  if (orderIds.length === 0) {
    return { deletedOrders: 0, deletedLines: 0 };
  }

  await connection.beginTransaction();
  try {
    const deletedLinesResult = await connection.query(
      `
        DELETE FROM stock_in_order_line
        WHERE order_id IN (${placeholders(orderIds)})
      `,
      orderIds,
    );
    const deletedOrdersResult = await connection.query(
      `
        DELETE FROM stock_in_order
        WHERE id IN (${placeholders(orderIds)})
      `,
      orderIds,
    );
    await connection.commit();

    return {
      deletedOrders: affectedRowsValue(deletedOrdersResult),
      deletedLines: affectedRowsValue(deletedLinesResult),
    };
  } catch (error) {
    await connection.rollback();
    throw error;
  }
}

async function main(): Promise<void> {
  const cliOptions = parseMigrationCliOptions();
  const reportPath = resolveReportPath(
    cliOptions,
    cliOptions.execute ? EXECUTE_REPORT_FILE_NAME : DRY_RUN_REPORT_FILE_NAME,
  );
  const env = loadMigrationEnvironment({ requireLegacyDatabaseUrl: false });
  const targetDatabaseName = assertExpectedDatabaseName(
    env.databaseUrl,
    EXPECTED_TARGET_DATABASE_NAME,
    "Target",
  );
  const pool = createMariaDbPool(env.databaseUrl);

  try {
    await withPoolConnection(pool, async (connection) => {
      const orders = await loadRecoveryOrders(connection);
      const orderIds = orders.map((order) => order.orderId);
      const lines = await loadRecoveryLines(connection, orderIds);
      const lineIds = lines.map((line) => line.orderLineId);
      const downstreamCounts = await loadDownstreamCounts(
        connection,
        orderIds,
        lineIds,
      );
      const blockers = buildBlockers({
        orders,
        lineCount: lines.length,
        downstreamCounts,
      });

      let executionResult: ExecutionResult | null = null;
      if (cliOptions.execute) {
        if (!cliOptions.allowBlockers && blockers.length > 0) {
          throw new Error(
            `sales-project admission split recovery blocked: ${blockers
              .map((blocker) => blocker.reason)
              .join(", ")}`,
          );
        }
        executionResult = await executeRecovery(connection, orderIds);
      }

      const report = {
        mode: cliOptions.execute ? "execute" : "dry-run",
        targetDatabaseName,
        generatedAt: new Date().toISOString(),
        generatedDocumentPrefix: GENERATED_DOCUMENT_PREFIX,
        allowedGeneratedBy: ALLOWED_GENERATED_BY,
        expectedRecoveryScope: EXPECTED_RECOVERY_SCOPE,
        eligible: blockers.length === 0,
        blockers,
        summary: {
          scopedOrderCount: orders.length,
          scopedLineCount: lines.length,
          documentNos: orders.map((order) => order.documentNo),
          downstreamCounts,
          replayDerivedCounts: {
            inventoryLogCount: downstreamCounts.inventoryLogCount,
            inventorySourceUsageAsSourceCount:
              downstreamCounts.inventorySourceUsageAsSourceCount,
            inventorySourceUsageAsConsumerCount:
              downstreamCounts.inventorySourceUsageAsConsumerCount,
          },
        },
        orders,
        executionResult,
      };

      writeStableReport(reportPath, report);
      console.log(
        `Sales-project admission split recovery ${report.mode} completed. blockers=${blockers.length}, scopedOrders=${orders.length}, scopedLines=${lines.length}, report=${reportPath}`,
      );
    });
  } finally {
    await closePools(pool);
  }
}

void main();
