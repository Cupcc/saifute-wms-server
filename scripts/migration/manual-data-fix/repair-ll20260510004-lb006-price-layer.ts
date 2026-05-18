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

const DOCUMENT_NO = "LL20260510004";
const MATERIAL_CODE = "lb006";
const EXPECTED_QUANTITY = "6.000000";
const EXPECTED_UNIT_COST = "19.80";
const EXPECTED_COST_AMOUNT = "118.80";
const WRONG_OUT_LOG_UNIT_COST = "12.40";
const UPDATED_BY = "manual-repair-ll20260510004-lb006-20260517";
const DRY_RUN_REPORT_FILE_NAME =
  "repair-ll20260510004-lb006-price-layer-dry-run-report.json";
const EXECUTE_REPORT_FILE_NAME =
  "repair-ll20260510004-lb006-price-layer-execute-report.json";

interface UsageRow {
  orderId: number;
  lineId: number;
  outLogId: number;
  usageId: number;
  sourceLogId: number;
  materialId: number;
  documentNo: string;
  materialCode: string;
  materialName: string;
  quantity: string;
  lineUnitPrice: string;
  lineAmount: string;
  lineCostUnitPrice: string | null;
  lineCostAmount: string | null;
  outLogUnitCost: string | null;
  outLogCostAmount: string | null;
  allocatedQty: string;
  releasedQty: string;
  status: string;
  sourceDocumentNo: string;
  sourceUnitCost: string | null;
}

interface SourceCandidate {
  sourceLogId: number;
  sourceDocumentNo: string;
  sourceLineId: number;
  bizDate: string;
  changeQty: string;
  unitCost: string;
  costAmount: string;
  allocatedQty: string;
  releasedQty: string;
  availableQty: string;
}

interface PriceLayerRow {
  unitCost: string;
  availableQty: string;
  sourceLogCount: number;
  sourceLogs: string | null;
}

function decimalEq(left: string | null, right: string): boolean {
  return Number(left ?? Number.NaN).toFixed(2) === Number(right).toFixed(2);
}

function decimal6(value: number): string {
  return value.toFixed(6);
}

async function readUsageRows(
  connection: MigrationConnectionLike,
): Promise<UsageRow[]> {
  return connection.query<UsageRow[]>(
    `
      SELECT
        o.id AS orderId,
        l.id AS lineId,
        log.id AS outLogId,
        u.id AS usageId,
        u.source_log_id AS sourceLogId,
        l.material_id AS materialId,
        o.document_no AS documentNo,
        l.material_code_snapshot AS materialCode,
        l.material_name_snapshot AS materialName,
        l.quantity,
        l.unit_price AS lineUnitPrice,
        l.amount AS lineAmount,
        l.cost_unit_price AS lineCostUnitPrice,
        l.cost_amount AS lineCostAmount,
        log.unit_cost AS outLogUnitCost,
        log.cost_amount AS outLogCostAmount,
        u.allocated_qty AS allocatedQty,
        u.released_qty AS releasedQty,
        u.status,
        source_log.business_document_number AS sourceDocumentNo,
        source_log.unit_cost AS sourceUnitCost
      FROM workshop_material_order o
      JOIN workshop_material_order_line l ON l.order_id = o.id
      JOIN inventory_log log
        ON log.business_document_type = 'WorkshopMaterialOrder'
       AND log.business_document_id = o.id
       AND log.business_document_line_id = l.id
       AND log.operation_type = 'PICK_OUT'
       AND log.direction = 'OUT'
       AND NOT EXISTS (
         SELECT 1
         FROM inventory_log rev
         WHERE rev.reversal_of_log_id = log.id
       )
      JOIN inventory_source_usage u
        ON u.consumer_document_type = 'WorkshopMaterialOrder'
       AND u.consumer_document_id = o.id
       AND u.consumer_line_id = l.id
      JOIN inventory_log source_log ON source_log.id = u.source_log_id
      WHERE o.document_no = ?
        AND l.material_code_snapshot = ?
      ORDER BY l.id, u.id
    `,
    [DOCUMENT_NO, MATERIAL_CODE],
  );
}

async function readSourceCandidates(
  connection: MigrationConnectionLike,
  materialId: number,
  requiredAdditionalQty: string,
): Promise<SourceCandidate[]> {
  return connection.query<SourceCandidate[]>(
    `
      SELECT
        source_log.id AS sourceLogId,
        source_log.business_document_number AS sourceDocumentNo,
        source_log.business_document_line_id AS sourceLineId,
        source_log.biz_date AS bizDate,
        source_log.change_qty AS changeQty,
        source_log.unit_cost AS unitCost,
        source_log.cost_amount AS costAmount,
        COALESCE(SUM(u.allocated_qty), 0) AS allocatedQty,
        COALESCE(SUM(u.released_qty), 0) AS releasedQty,
        source_log.change_qty
          - COALESCE(SUM(u.allocated_qty), 0)
          + COALESCE(SUM(u.released_qty), 0) AS availableQty
      FROM inventory_log source_log
      LEFT JOIN inventory_source_usage u ON u.source_log_id = source_log.id
      WHERE source_log.material_id = ?
        AND source_log.direction = 'IN'
        AND source_log.operation_type = 'ACCEPTANCE_IN'
        AND source_log.unit_cost = ?
        AND NOT EXISTS (
          SELECT 1
          FROM inventory_log rev
          WHERE rev.reversal_of_log_id = source_log.id
        )
      GROUP BY source_log.id
      HAVING availableQty >= ?
      ORDER BY source_log.biz_date ASC, source_log.id ASC
    `,
    [materialId, EXPECTED_UNIT_COST, requiredAdditionalQty],
  );
}

async function readPriceLayers(
  connection: MigrationConnectionLike,
): Promise<PriceLayerRow[]> {
  return connection.query<PriceLayerRow[]>(
    `
      SELECT
        source_log.unit_cost AS unitCost,
        SUM(source_log.change_qty - COALESCE(usage_totals.net_used_qty, 0)) AS availableQty,
        COUNT(*) AS sourceLogCount,
        GROUP_CONCAT(
          CONCAT(
            source_log.id,
            ':',
            source_log.business_document_number,
            ':',
            source_log.change_qty - COALESCE(usage_totals.net_used_qty, 0)
          )
          ORDER BY source_log.biz_date, source_log.id
          SEPARATOR ' | '
        ) AS sourceLogs
      FROM inventory_log source_log
      JOIN material m ON m.id = source_log.material_id
      LEFT JOIN (
        SELECT source_log_id, SUM(allocated_qty - released_qty) AS net_used_qty
        FROM inventory_source_usage
        GROUP BY source_log_id
      ) usage_totals ON usage_totals.source_log_id = source_log.id
      WHERE m.material_code = ?
        AND source_log.direction = 'IN'
        AND source_log.reversal_of_log_id IS NULL
        AND NOT EXISTS (
          SELECT 1
          FROM inventory_log rev
          WHERE rev.reversal_of_log_id = source_log.id
        )
      GROUP BY source_log.unit_cost
      HAVING availableQty <> 0
      ORDER BY source_log.unit_cost
    `,
    [MATERIAL_CODE],
  );
}

function validateContext(rows: UsageRow[]) {
  const blockers: string[] = [];
  const first = rows[0] ?? null;

  if (!first) {
    return ["未找到目标领料单 lb006 明细、库存出库流水或来源分配。"];
  }

  const orderIds = new Set(rows.map((row) => row.orderId));
  const lineIds = new Set(rows.map((row) => row.lineId));
  const outLogIds = new Set(rows.map((row) => row.outLogId));
  if (orderIds.size !== 1 || lineIds.size !== 1 || outLogIds.size !== 1) {
    blockers.push("目标上下文不唯一，拒绝自动修复。");
  }
  if (first.quantity !== EXPECTED_QUANTITY) {
    blockers.push(
      `目标明细数量不是 ${EXPECTED_QUANTITY}: actual=${first.quantity}`,
    );
  }
  if (!decimalEq(first.lineUnitPrice, EXPECTED_UNIT_COST)) {
    blockers.push(
      `目标明细单价不是 ${EXPECTED_UNIT_COST}: actual=${first.lineUnitPrice}`,
    );
  }
  if (!decimalEq(first.lineAmount, EXPECTED_COST_AMOUNT)) {
    blockers.push(
      `目标明细金额不是 ${EXPECTED_COST_AMOUNT}: actual=${first.lineAmount}`,
    );
  }
  if (!decimalEq(first.outLogUnitCost, WRONG_OUT_LOG_UNIT_COST)) {
    blockers.push(
      `当前出库流水单价不是待修复的 ${WRONG_OUT_LOG_UNIT_COST}: actual=${first.outLogUnitCost}`,
    );
  }

  const netAllocatedQty = rows.reduce(
    (sum, row) => sum + Number(row.allocatedQty) - Number(row.releasedQty),
    0,
  );
  if (decimal6(netAllocatedQty) !== EXPECTED_QUANTITY) {
    blockers.push(
      `来源分配净数量不是 ${EXPECTED_QUANTITY}: actual=${decimal6(netAllocatedQty)}`,
    );
  }
  for (const row of rows) {
    if (Number(row.releasedQty) !== 0) {
      blockers.push(`usage ${row.usageId} 已有释放数量: ${row.releasedQty}`);
    }
  }

  return blockers;
}

async function executeRepair(
  connection: MigrationConnectionLike,
  rows: UsageRow[],
  targetSource: SourceCandidate,
) {
  const first = rows[0];
  const wrongRows = rows.filter(
    (row) => !decimalEq(row.sourceUnitCost, EXPECTED_UNIT_COST),
  );
  const expectedRows = rows.filter((row) =>
    decimalEq(row.sourceUnitCost, EXPECTED_UNIT_COST),
  );
  const wrongNetQty = wrongRows.reduce(
    (sum, row) => sum + Number(row.allocatedQty) - Number(row.releasedQty),
    0,
  );
  const existingExpectedQty = expectedRows.reduce(
    (sum, row) => sum + Number(row.allocatedQty) - Number(row.releasedQty),
    0,
  );

  await connection.beginTransaction();

  try {
    for (const row of wrongRows) {
      await connection.query(
        `
          UPDATE inventory_source_usage
          SET
            released_qty = allocated_qty,
            status = 'RELEASED',
            updated_by = ?,
            updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `,
        [UPDATED_BY, row.usageId],
      );
    }

    const expectedUsage = expectedRows[0] ?? null;
    if (expectedUsage) {
      await connection.query(
        `
          UPDATE inventory_source_usage
          SET
            allocated_qty = ?,
            released_qty = 0,
            status = 'ALLOCATED',
            updated_by = ?,
            updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `,
        [
          decimal6(existingExpectedQty + wrongNetQty),
          UPDATED_BY,
          expectedUsage.usageId,
        ],
      );
    } else {
      await connection.query(
        `
          INSERT INTO inventory_source_usage (
            material_id,
            source_log_id,
            consumer_document_type,
            consumer_document_id,
            consumer_line_id,
            allocated_qty,
            released_qty,
            status,
            created_by,
            created_at,
            updated_by,
            updated_at
          )
          VALUES (?, ?, 'WorkshopMaterialOrder', ?, ?, ?, 0, 'ALLOCATED', ?, CURRENT_TIMESTAMP, ?, CURRENT_TIMESTAMP)
        `,
        [
          first.materialId,
          targetSource.sourceLogId,
          first.orderId,
          first.lineId,
          EXPECTED_QUANTITY,
          UPDATED_BY,
          UPDATED_BY,
        ],
      );
    }

    await connection.query(
      `
        UPDATE inventory_log
        SET
          unit_cost = ?,
          cost_amount = ?,
          note = ?
        WHERE id = ?
      `,
      [
        EXPECTED_UNIT_COST,
        EXPECTED_COST_AMOUNT,
        `人工修复：按领料单 ${DOCUMENT_NO} 明细选择的 ${EXPECTED_UNIT_COST} 价格层重算来源。原 12.40 来自混用 5.00 与 19.80 来源层。`,
        first.outLogId,
      ],
    );

    await connection.query(
      `
        UPDATE workshop_material_order_line
        SET
          unit_price = ?,
          amount = ?,
          cost_unit_price = ?,
          cost_amount = ?,
          updated_by = ?,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `,
      [
        EXPECTED_UNIT_COST,
        EXPECTED_COST_AMOUNT,
        EXPECTED_UNIT_COST,
        EXPECTED_COST_AMOUNT,
        UPDATED_BY,
        first.lineId,
      ],
    );

    await connection.commit();

    return {
      releasedWrongUsageIds: wrongRows.map((row) => row.usageId),
      targetUsageId: expectedUsage?.usageId ?? null,
      targetSourceLogId: targetSource.sourceLogId,
      updatedOutLogId: first.outLogId,
      updatedLineId: first.lineId,
    };
  } catch (error) {
    await connection.rollback();
    throw error;
  }
}

async function main() {
  const cliOptions = parseMigrationCliOptions();
  const execute = cliOptions.execute;
  const reportPath = resolveReportPath(
    cliOptions,
    execute ? EXECUTE_REPORT_FILE_NAME : DRY_RUN_REPORT_FILE_NAME,
  );
  const environment = loadMigrationEnvironment({
    requireLegacyDatabaseUrl: false,
  });
  const targetDatabase = assertExpectedDatabaseName(
    environment.databaseUrl,
    EXPECTED_TARGET_DATABASE_NAME,
    "target",
  );
  const pool = createMariaDbPool(environment.databaseUrl);

  try {
    await withPoolConnection(pool, async (connection) => {
      const before = await readUsageRows(connection);
      const beforePriceLayers = await readPriceLayers(connection);
      const contextBlockers = validateContext(before);
      const first = before[0] ?? null;
      const wrongNetQty = before
        .filter((row) => !decimalEq(row.sourceUnitCost, EXPECTED_UNIT_COST))
        .reduce(
          (sum, row) =>
            sum + Number(row.allocatedQty) - Number(row.releasedQty),
          0,
        );
      const candidates =
        first && wrongNetQty > 0
          ? await readSourceCandidates(
              connection,
              first.materialId,
              decimal6(wrongNetQty),
            )
          : [];
      const targetSource =
        candidates.find((candidate) =>
          before.some(
            (row) =>
              row.sourceLogId === candidate.sourceLogId &&
              decimalEq(row.sourceUnitCost, EXPECTED_UNIT_COST),
          ),
        ) ??
        candidates[0] ??
        null;
      const blockers = [
        ...contextBlockers,
        ...(targetSource
          ? []
          : [`没有足够可用的 ${EXPECTED_UNIT_COST} 入库来源层。`]),
      ];

      if (execute && blockers.length > 0) {
        throw new Error(`Refusing to execute: ${blockers.join("; ")}`);
      }

      const executeResult =
        execute && first && targetSource
          ? await executeRepair(connection, before, targetSource)
          : null;
      const after = execute ? await readUsageRows(connection) : null;
      const afterPriceLayers = execute
        ? await readPriceLayers(connection)
        : null;
      const report = {
        generatedAt: new Date().toISOString(),
        mode: execute ? "execute" : "dry-run",
        targetDatabase,
        documentNo: DOCUMENT_NO,
        materialCode: MATERIAL_CODE,
        expectedQuantity: EXPECTED_QUANTITY,
        expectedUnitCost: EXPECTED_UNIT_COST,
        expectedCostAmount: EXPECTED_COST_AMOUNT,
        updatedBy: UPDATED_BY,
        blockers,
        before,
        beforePriceLayers,
        wrongNetQty: decimal6(wrongNetQty),
        sourceCandidates: candidates,
        selectedTargetSource: targetSource,
        executeResult,
        after,
        afterPriceLayers,
      };

      writeStableReport(reportPath, report);
      console.log(
        `Repair ${DOCUMENT_NO}/${MATERIAL_CODE} ${execute ? "execute" : "dry-run"} completed. report=${reportPath}`,
      );
    });
  } finally {
    await closePools(pool);
  }
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
