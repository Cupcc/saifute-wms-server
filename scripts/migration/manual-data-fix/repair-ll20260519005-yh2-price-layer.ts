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

const DOCUMENT_NO = "LL20260519005";
const MATERIAL_CODE = "yh2";
const EXPECTED_QUANTITY = "25.000000";
const EXPECTED_UNIT_COST = "18.58";
const EXPECTED_COST_AMOUNT = "464.50";
const WRONG_UNIT_COST = "11.95";
const UPDATED_BY = "manual-repair-ll20260519005-yh2-20260521";
const DRY_RUN_REPORT_FILE_NAME =
  "repair-ll20260519005-yh2-price-layer-dry-run-report.json";
const EXECUTE_REPORT_FILE_NAME =
  "repair-ll20260519005-yh2-price-layer-execute-report.json";

interface UsageRow {
  orderId: number;
  documentNo: string;
  orderType: "PICK";
  bizDate: string;
  lifecycleStatus: string;
  inventoryEffectStatus: string;
  orderTotalAmount: string;
  lineId: number;
  lineNo: number;
  materialId: number;
  materialCode: string;
  materialName: string;
  quantity: string;
  lineUnitPrice: string;
  lineAmount: string;
  lineCostUnitPrice: string | null;
  lineCostAmount: string | null;
  outLogId: number;
  stockScopeId: number | null;
  outLogUnitCost: string | null;
  outLogCostAmount: string | null;
  usageId: number;
  sourceLogId: number;
  allocatedQty: string;
  releasedQty: string;
  usageStatus: string;
  sourceDocumentNo: string;
  sourceLineId: number;
  sourceBizDate: string;
  sourceUnitCost: string | null;
}

interface SourceCandidate {
  sourceLogId: number;
  sourceDocumentNo: string;
  sourceLineId: number;
  bizDate: string;
  stockScopeId: number | null;
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
        o.document_no AS documentNo,
        o.order_type AS orderType,
        DATE_FORMAT(o.biz_date, '%Y-%m-%d') AS bizDate,
        o.lifecycle_status AS lifecycleStatus,
        o.inventory_effect_status AS inventoryEffectStatus,
        o.total_amount AS orderTotalAmount,
        l.id AS lineId,
        l.line_no AS lineNo,
        l.material_id AS materialId,
        l.material_code_snapshot AS materialCode,
        l.material_name_snapshot AS materialName,
        l.quantity,
        l.unit_price AS lineUnitPrice,
        l.amount AS lineAmount,
        l.cost_unit_price AS lineCostUnitPrice,
        l.cost_amount AS lineCostAmount,
        log.id AS outLogId,
        log.stock_scope_id AS stockScopeId,
        log.unit_cost AS outLogUnitCost,
        log.cost_amount AS outLogCostAmount,
        u.id AS usageId,
        u.source_log_id AS sourceLogId,
        u.allocated_qty AS allocatedQty,
        u.released_qty AS releasedQty,
        u.status AS usageStatus,
        source_log.business_document_number AS sourceDocumentNo,
        source_log.business_document_line_id AS sourceLineId,
        DATE_FORMAT(source_log.biz_date, '%Y-%m-%d') AS sourceBizDate,
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
  context: UsageRow,
  requiredQty: string,
): Promise<SourceCandidate[]> {
  return connection.query<SourceCandidate[]>(
    `
      SELECT
        source_log.id AS sourceLogId,
        source_log.business_document_number AS sourceDocumentNo,
        source_log.business_document_line_id AS sourceLineId,
        DATE_FORMAT(source_log.biz_date, '%Y-%m-%d') AS bizDate,
        source_log.stock_scope_id AS stockScopeId,
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
        AND source_log.stock_scope_id <=> ?
        AND source_log.direction = 'IN'
        AND source_log.unit_cost = ?
        AND source_log.biz_date <= ?
        AND source_log.reversal_of_log_id IS NULL
        AND NOT EXISTS (
          SELECT 1
          FROM inventory_log rev
          WHERE rev.reversal_of_log_id = source_log.id
        )
      GROUP BY source_log.id
      HAVING availableQty >= ?
      ORDER BY source_log.biz_date ASC, source_log.id ASC
    `,
    [
      context.materialId,
      context.stockScopeId,
      EXPECTED_UNIT_COST,
      context.bizDate,
      requiredQty,
    ],
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
        AND source_log.unit_cost IS NOT NULL
        AND source_log.reversal_of_log_id IS NULL
        AND NOT EXISTS (
          SELECT 1
          FROM inventory_log rev
          WHERE rev.reversal_of_log_id = source_log.id
        )
      GROUP BY source_log.unit_cost
      ORDER BY source_log.unit_cost
    `,
    [MATERIAL_CODE],
  );
}

function validateContext(rows: UsageRow[]) {
  const blockers: string[] = [];
  const first = rows[0] ?? null;

  if (!first) {
    return ["未找到目标领料单 yh2 明细、库存出库流水或来源分配。"];
  }

  const orderIds = new Set(rows.map((row) => row.orderId));
  const lineIds = new Set(rows.map((row) => row.lineId));
  const outLogIds = new Set(rows.map((row) => row.outLogId));
  if (orderIds.size !== 1 || lineIds.size !== 1 || outLogIds.size !== 1) {
    blockers.push("目标上下文不唯一，拒绝自动修复。");
  }
  if (first.orderType !== "PICK") {
    blockers.push(`目标单据不是 PICK: actual=${first.orderType}`);
  }
  if (first.lifecycleStatus !== "EFFECTIVE") {
    blockers.push(`目标单据不是 EFFECTIVE: actual=${first.lifecycleStatus}`);
  }
  if (first.inventoryEffectStatus !== "POSTED") {
    blockers.push(
      `目标单据库存状态不是 POSTED: actual=${first.inventoryEffectStatus}`,
    );
  }
  if (first.quantity !== EXPECTED_QUANTITY) {
    blockers.push(
      `目标明细数量不是 ${EXPECTED_QUANTITY}: actual=${first.quantity}`,
    );
  }
  if (!decimalEq(first.lineUnitPrice, WRONG_UNIT_COST)) {
    blockers.push(
      `目标明细当前单价不是待修复的 ${WRONG_UNIT_COST}: actual=${first.lineUnitPrice}`,
    );
  }
  if (!decimalEq(first.lineCostUnitPrice, WRONG_UNIT_COST)) {
    blockers.push(
      `目标明细当前成本单价不是待修复的 ${WRONG_UNIT_COST}: actual=${first.lineCostUnitPrice}`,
    );
  }
  if (!decimalEq(first.outLogUnitCost, WRONG_UNIT_COST)) {
    blockers.push(
      `目标出库流水当前成本不是待修复的 ${WRONG_UNIT_COST}: actual=${first.outLogUnitCost}`,
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
    if (!decimalEq(row.sourceUnitCost, WRONG_UNIT_COST)) {
      blockers.push(
        `当前来源层不是待修复的 ${WRONG_UNIT_COST}: sourceLogId=${row.sourceLogId}, actual=${row.sourceUnitCost}`,
      );
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

  await connection.beginTransaction();

  try {
    for (const row of rows) {
      await connection.query(
        `
          UPDATE inventory_source_usage
          SET
            source_log_id = ?,
            updated_by = ?,
            updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `,
        [targetSource.sourceLogId, UPDATED_BY, row.usageId],
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
        `人工修复：按确认结果将领料单 ${DOCUMENT_NO} / ${MATERIAL_CODE} 改为 ${EXPECTED_UNIT_COST} 价格层，来源从 ${WRONG_UNIT_COST} 重新绑定到流水 ${targetSource.sourceLogId}。`,
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

    await connection.query(
      `
        UPDATE workshop_material_order
        SET
          total_qty = (
            SELECT COALESCE(SUM(line.quantity), 0)
            FROM workshop_material_order_line line
            WHERE line.order_id = ?
          ),
          total_amount = (
            SELECT COALESCE(SUM(line.amount), 0)
            FROM workshop_material_order_line line
            WHERE line.order_id = ?
          ),
          updated_by = ?,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `,
      [first.orderId, first.orderId, UPDATED_BY, first.orderId],
    );

    await connection.commit();

    return {
      updatedUsageIds: rows.map((row) => row.usageId),
      oldSourceLogIds: rows.map((row) => row.sourceLogId),
      newSourceLogId: targetSource.sourceLogId,
      updatedOutLogId: first.outLogId,
      updatedLineId: first.lineId,
      updatedOrderId: first.orderId,
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
      const candidates = first
        ? await readSourceCandidates(connection, first, EXPECTED_QUANTITY)
        : [];
      const targetSource = candidates[0] ?? null;
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
        wrongUnitCost: WRONG_UNIT_COST,
        updatedBy: UPDATED_BY,
        blockers,
        before,
        beforePriceLayers,
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
