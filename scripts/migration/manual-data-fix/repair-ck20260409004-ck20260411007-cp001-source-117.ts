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

const MATERIAL_ID = 1;
const MATERIAL_CODE = "cp001";
const UNIT_COST_117 = "117.00";
const UPDATED_BY = "manual-cp001-ck117-source-20260518";
const DRY_RUN_REPORT_FILE_NAME =
  "repair-ck20260409004-ck20260411007-cp001-source-117-dry-run-report.json";
const EXECUTE_REPORT_FILE_NAME =
  "repair-ck20260409004-ck20260411007-cp001-source-117-execute-report.json";

const CK_09004 = {
  documentNo: "CK20260409004",
  lineId: 460,
  logId: 39090,
  wrongUsageId: 19318,
  replacementSourceLogId: 39077,
  quantity: "50.000000",
  costAmount: "5850.00",
} as const;

const CK_11007 = {
  documentNo: "CK20260411007",
  lineId: 494,
  logId: 39243,
  wrongUsageId: 19368,
  replacementSourceLogId: 39077,
  quantity: "50.000000",
  costAmount: "5850.00",
} as const;

const SOURCE_SHIFT = {
  movedUsageId: 19417,
  mergedUsageId: 19418,
  consumerDocumentNo: "CK20260420001",
  consumerLineId: 520,
  oldSourceLogId: 39077,
  newSourceLogId: 39361,
  quantity: "3.000000",
} as const;

const AFFECTED_SOURCE_LOG_IDS = [38712, 39077, 39361] as const;

function numberValue(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "bigint") return Number(value);
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function placeholders(values: readonly unknown[]): string {
  return values.map(() => "?").join(", ");
}

async function readTargetLines(
  connection: MigrationConnectionLike,
): Promise<Array<Record<string, unknown>>> {
  return connection.query<Array<Record<string, unknown>>>(
    `
      SELECT
        parent.document_no AS documentNo,
        DATE_FORMAT(parent.biz_date, '%Y-%m-%d') AS bizDate,
        line.id AS lineId,
        line.quantity,
        line.unit_price AS unitPrice,
        line.amount,
        line.selected_unit_cost AS selectedUnitCost,
        line.cost_unit_price AS costUnitPrice,
        line.cost_amount AS costAmount,
        log.id AS logId,
        log.unit_cost AS logUnitCost,
        log.cost_amount AS logCostAmount,
        log.note AS logNote
      FROM sales_stock_order_line line
      JOIN sales_stock_order parent ON parent.id = line.order_id
      JOIN inventory_log log
        ON log.business_document_type = 'SalesStockOrder'
       AND log.business_document_id = parent.id
       AND log.business_document_line_id = line.id
       AND log.direction = 'OUT'
      WHERE parent.document_no IN (?, ?, ?)
        AND line.material_id = ?
      ORDER BY parent.biz_date, parent.document_no, line.id
    `,
    [
      CK_09004.documentNo,
      CK_11007.documentNo,
      SOURCE_SHIFT.consumerDocumentNo,
      MATERIAL_ID,
    ],
  );
}

async function readTargetUsages(
  connection: MigrationConnectionLike,
): Promise<Array<Record<string, unknown>>> {
  return connection.query<Array<Record<string, unknown>>>(
    `
      SELECT
        usage_row.id AS usageId,
        consumer_log.business_document_number AS consumerDocumentNo,
        consumer_log.business_document_line_id AS consumerLineId,
        usage_row.source_log_id AS sourceLogId,
        source_log.business_document_number AS sourceDocumentNo,
        source_log.business_document_line_id AS sourceLineId,
        DATE_FORMAT(source_log.biz_date, '%Y-%m-%d') AS sourceBizDate,
        source_log.unit_cost AS sourceUnitCost,
        usage_row.allocated_qty AS allocatedQty,
        usage_row.released_qty AS releasedQty,
        usage_row.allocated_qty - usage_row.released_qty AS netQty,
        usage_row.status
      FROM inventory_source_usage usage_row
      JOIN inventory_log source_log ON source_log.id = usage_row.source_log_id
      JOIN inventory_log consumer_log
        ON consumer_log.business_document_type = usage_row.consumer_document_type
       AND consumer_log.business_document_id = usage_row.consumer_document_id
       AND consumer_log.business_document_line_id = usage_row.consumer_line_id
       AND consumer_log.direction = 'OUT'
      WHERE consumer_log.business_document_number IN (?, ?, ?)
        AND usage_row.allocated_qty > usage_row.released_qty
      ORDER BY consumer_log.business_document_number, usage_row.id
    `,
    [CK_09004.documentNo, CK_11007.documentNo, SOURCE_SHIFT.consumerDocumentNo],
  );
}

async function readSourceAvailability(
  connection: MigrationConnectionLike,
): Promise<Array<Record<string, unknown>>> {
  return connection.query<Array<Record<string, unknown>>>(
    `
      SELECT
        source_log.id AS sourceLogId,
        source_log.business_document_number AS sourceDocumentNo,
        source_log.business_document_line_id AS sourceLineId,
        DATE_FORMAT(source_log.biz_date, '%Y-%m-%d') AS sourceBizDate,
        source_log.change_qty AS sourceQty,
        source_log.unit_cost AS unitCost,
        COALESCE(SUM(usage_row.allocated_qty - usage_row.released_qty), 0) AS netAllocatedQty,
        source_log.change_qty - COALESCE(SUM(usage_row.allocated_qty - usage_row.released_qty), 0) AS currentAvailableQty
      FROM inventory_log source_log
      LEFT JOIN inventory_source_usage usage_row ON usage_row.source_log_id = source_log.id
      WHERE source_log.id IN (${placeholders(AFFECTED_SOURCE_LOG_IDS)})
      GROUP BY source_log.id
      ORDER BY source_log.id
    `,
    [...AFFECTED_SOURCE_LOG_IDS],
  );
}

async function readWeightedCostCheck(
  connection: MigrationConnectionLike,
): Promise<Array<Record<string, unknown>>> {
  return connection.query<Array<Record<string, unknown>>>(
    `
      SELECT
        out_log.business_document_number AS documentNo,
        out_log.business_document_line_id AS lineId,
        out_log.change_qty AS changeQty,
        out_log.unit_cost AS logUnitCost,
        out_log.cost_amount AS logCostAmount,
        SUM((usage_row.allocated_qty - usage_row.released_qty) * source_log.unit_cost) AS sourceCostAmount,
        ROUND(SUM((usage_row.allocated_qty - usage_row.released_qty) * source_log.unit_cost) / out_log.change_qty, 2) AS weightedUnitCost,
        GROUP_CONCAT(
          CONCAT(source_log.business_document_number, '/', source_log.unit_cost, '*', usage_row.allocated_qty - usage_row.released_qty)
          ORDER BY source_log.biz_date, source_log.id SEPARATOR '; '
        ) AS sourceBreakdown
      FROM inventory_log out_log
      JOIN inventory_source_usage usage_row
        ON usage_row.consumer_document_type = 'SalesStockOrder'
       AND usage_row.consumer_document_id = out_log.business_document_id
       AND usage_row.consumer_line_id = out_log.business_document_line_id
       AND usage_row.allocated_qty > usage_row.released_qty
      JOIN inventory_log source_log ON source_log.id = usage_row.source_log_id
      WHERE out_log.business_document_number IN (?, ?, ?)
        AND out_log.material_id = ?
        AND out_log.direction = 'OUT'
      GROUP BY out_log.id
      ORDER BY out_log.business_document_number
    `,
    [
      CK_09004.documentNo,
      CK_11007.documentNo,
      SOURCE_SHIFT.consumerDocumentNo,
      MATERIAL_ID,
    ],
  );
}

async function readAsOfAvailability(
  connection: MigrationConnectionLike,
): Promise<Array<Record<string, unknown>>> {
  return connection.query<Array<Record<string, unknown>>>(
    `
      SELECT
        target.business_document_number AS documentNo,
        DATE_FORMAT(target.biz_date, '%Y-%m-%d') AS bizDate,
        target.id AS targetLogId,
        SUM(source_log.change_qty) AS sourceQty,
        SUM(
          COALESCE((
            SELECT SUM(usage_row.allocated_qty - usage_row.released_qty)
            FROM inventory_source_usage usage_row
            JOIN inventory_log consumer_log
              ON consumer_log.business_document_type = usage_row.consumer_document_type
             AND consumer_log.business_document_id = usage_row.consumer_document_id
             AND consumer_log.business_document_line_id = usage_row.consumer_line_id
             AND consumer_log.direction = 'OUT'
            WHERE usage_row.source_log_id = source_log.id
              AND (
                consumer_log.biz_date < target.biz_date
                OR (consumer_log.biz_date = target.biz_date AND consumer_log.id < target.id)
              )
          ), 0)
        ) AS allocatedBeforeTargetQty,
        SUM(source_log.change_qty) - SUM(
          COALESCE((
            SELECT SUM(usage_row.allocated_qty - usage_row.released_qty)
            FROM inventory_source_usage usage_row
            JOIN inventory_log consumer_log
              ON consumer_log.business_document_type = usage_row.consumer_document_type
             AND consumer_log.business_document_id = usage_row.consumer_document_id
             AND consumer_log.business_document_line_id = usage_row.consumer_line_id
             AND consumer_log.direction = 'OUT'
            WHERE usage_row.source_log_id = source_log.id
              AND (
                consumer_log.biz_date < target.biz_date
                OR (consumer_log.biz_date = target.biz_date AND consumer_log.id < target.id)
              )
          ), 0)
        ) AS availableBeforeTargetQty
      FROM inventory_log target
      JOIN inventory_log source_log
        ON source_log.material_id = target.material_id
       AND source_log.stock_scope_id <=> target.stock_scope_id
       AND source_log.direction = 'IN'
       AND source_log.unit_cost = ?
       AND (
         source_log.biz_date < target.biz_date
         OR (source_log.biz_date = target.biz_date AND source_log.id < target.id)
       )
       AND source_log.reversal_of_log_id IS NULL
       AND NOT EXISTS (
         SELECT 1 FROM inventory_log source_reversal WHERE source_reversal.reversal_of_log_id = source_log.id
       )
      WHERE target.business_document_number IN (?, ?)
        AND target.material_id = ?
        AND target.direction = 'OUT'
      GROUP BY target.id
      ORDER BY target.biz_date, target.id
    `,
    [UNIT_COST_117, CK_09004.documentNo, CK_11007.documentNo, MATERIAL_ID],
  );
}

async function buildReportPayload(connection: MigrationConnectionLike) {
  const [
    targetLines,
    targetUsages,
    sourceAvailability,
    weightedCostCheck,
    asOfAvailability,
  ] = await Promise.all([
    readTargetLines(connection),
    readTargetUsages(connection),
    readSourceAvailability(connection),
    readWeightedCostCheck(connection),
    readAsOfAvailability(connection),
  ]);

  return {
    targetLines,
    targetUsages,
    sourceAvailability,
    weightedCostCheck,
    asOfAvailability,
  };
}

function assertAffectedRows(label: string, result: unknown): void {
  const affectedRows = numberValue(
    (result as { affectedRows?: number })?.affectedRows,
  );
  if (affectedRows !== 1) {
    throw new Error(`${label} affected ${affectedRows} rows, expected 1.`);
  }
}

async function executeRepair(
  connection: MigrationConnectionLike,
): Promise<void> {
  await connection.beginTransaction();

  try {
    assertAffectedRows(
      "Release CK20260420001 early 117 usage",
      await connection.query(
        `
          UPDATE inventory_source_usage
          SET
            released_qty = allocated_qty,
            status = 'RELEASED',
            updated_by = ?,
            updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
            AND source_log_id = ?
            AND consumer_document_type = 'SalesStockOrder'
            AND consumer_line_id = ?
            AND allocated_qty = ?
            AND released_qty = 0
            AND status = 'ALLOCATED'
        `,
        [
          UPDATED_BY,
          SOURCE_SHIFT.movedUsageId,
          SOURCE_SHIFT.oldSourceLogId,
          SOURCE_SHIFT.consumerLineId,
          SOURCE_SHIFT.quantity,
        ],
      ),
    );

    assertAffectedRows(
      "Merge CK20260420001 quantity into later 117 usage",
      await connection.query(
        `
          UPDATE inventory_source_usage
          SET
            allocated_qty = allocated_qty + ?,
            updated_by = ?,
            updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
            AND source_log_id = ?
            AND consumer_document_type = 'SalesStockOrder'
            AND consumer_line_id = ?
            AND released_qty = 0
            AND status = 'ALLOCATED'
        `,
        [
          SOURCE_SHIFT.quantity,
          UPDATED_BY,
          SOURCE_SHIFT.mergedUsageId,
          SOURCE_SHIFT.newSourceLogId,
          SOURCE_SHIFT.consumerLineId,
        ],
      ),
    );

    for (const target of [CK_09004, CK_11007]) {
      assertAffectedRows(
        `Move ${target.documentNo} 104 usage to 117 source`,
        await connection.query(
          `
            UPDATE inventory_source_usage
            SET
              source_log_id = ?,
              updated_by = ?,
              updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
              AND source_log_id = 38712
              AND consumer_document_type = 'SalesStockOrder'
              AND consumer_line_id = ?
              AND released_qty = 0
              AND status = 'ALLOCATED'
          `,
          [
            target.replacementSourceLogId,
            UPDATED_BY,
            target.wrongUsageId,
            target.lineId,
          ],
        ),
      );

      assertAffectedRows(
        `Update ${target.documentNo} inventory log`,
        await connection.query(
          `
            UPDATE inventory_log
            SET
              unit_cost = ?,
              cost_amount = ?,
              note = ?,
              operator_id = COALESCE(operator_id, ?)
            WHERE id = ?
              AND business_document_type = 'SalesStockOrder'
              AND business_document_number = ?
              AND business_document_line_id = ?
          `,
          [
            UNIT_COST_117,
            target.costAmount,
            `人工修复：${MATERIAL_CODE} 出库来源改为全 117 价层，替换原 104 来源占用。`,
            UPDATED_BY,
            target.logId,
            target.documentNo,
            target.lineId,
          ],
        ),
      );

      assertAffectedRows(
        `Update ${target.documentNo} sales cost snapshot`,
        await connection.query(
          `
            UPDATE sales_stock_order_line
            SET
              selected_unit_cost = ?,
              cost_unit_price = ?,
              cost_amount = ?,
              updated_by = ?,
              updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
              AND material_id = ?
          `,
          [
            UNIT_COST_117,
            UNIT_COST_117,
            target.costAmount,
            UPDATED_BY,
            target.lineId,
            MATERIAL_ID,
          ],
        ),
      );
    }

    assertAffectedRows(
      "Annotate CK20260420001 same-cost source shift",
      await connection.query(
        `
          UPDATE inventory_log
          SET
            note = ?,
            operator_id = COALESCE(operator_id, ?)
          WHERE business_document_type = 'SalesStockOrder'
            AND business_document_number = ?
            AND business_document_line_id = ?
            AND material_id = ?
            AND direction = 'OUT'
        `,
        [
          `人工修复：同价 117 来源从 RK20260409001 调整到 RK20260414004，释放早期来源给 ${CK_09004.documentNo}/${CK_11007.documentNo}。`,
          UPDATED_BY,
          SOURCE_SHIFT.consumerDocumentNo,
          SOURCE_SHIFT.consumerLineId,
          MATERIAL_ID,
        ],
      ),
    );

    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  }
}

async function main(): Promise<void> {
  const cliOptions = parseMigrationCliOptions();
  const execute = cliOptions.execute;
  const environment = loadMigrationEnvironment({
    requireLegacyDatabaseUrl: false,
  });
  const reportPath = resolveReportPath(
    cliOptions,
    execute ? EXECUTE_REPORT_FILE_NAME : DRY_RUN_REPORT_FILE_NAME,
  );
  const pool = createMariaDbPool(environment.databaseUrl);

  try {
    const report = await withPoolConnection(pool, async (connection) => {
      const targetDatabase = assertExpectedDatabaseName(
        environment.databaseUrl,
        EXPECTED_TARGET_DATABASE_NAME,
        "Target",
      );
      const before = await buildReportPayload(connection);

      if (execute) {
        await executeRepair(connection);
      }

      const after = execute ? await buildReportPayload(connection) : null;

      return {
        execute,
        targetDatabase,
        updatedBy: UPDATED_BY,
        repairPlan: {
          reason:
            "CK20260409004 and CK20260411007 had enough 117 source quantity at their business time; move later same-cost usage to preserve source capacity.",
          replace104Usages: [
            {
              documentNo: CK_09004.documentNo,
              usageId: CK_09004.wrongUsageId,
              replacementSourceLogId: CK_09004.replacementSourceLogId,
            },
            {
              documentNo: CK_11007.documentNo,
              usageId: CK_11007.wrongUsageId,
              replacementSourceLogId: CK_11007.replacementSourceLogId,
            },
          ],
          sameCostFutureShift: SOURCE_SHIFT,
        },
        before,
        after,
      };
    });

    writeStableReport(reportPath, report);
    console.log(`Report written: ${reportPath}`);
    console.log(JSON.stringify(report, null, 2));
  } finally {
    await closePools(pool);
  }
}

void main();
