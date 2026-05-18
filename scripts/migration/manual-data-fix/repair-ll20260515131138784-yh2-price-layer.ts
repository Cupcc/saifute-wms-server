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

const DOCUMENT_NO = "LL20260515131138784";
const MATERIAL_CODE = "yh2";
const EXPECTED_QUANTITY = "30.000000";
const EXPECTED_UNIT_COST = "11.95";
const WRONG_SOURCE_UNIT_COST = "18.58";
const UPDATED_BY = "manual-repair-ll20260515131138784-yh2-20260516";
const DRY_RUN_REPORT_FILE_NAME =
  "repair-ll20260515131138784-yh2-price-layer-dry-run-report.json";
const EXECUTE_REPORT_FILE_NAME =
  "repair-ll20260515131138784-yh2-price-layer-execute-report.json";

interface PickLineContext {
  orderId: number;
  lineId: number;
  outLogId: number;
  usageId: number;
  currentSourceLogId: number;
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

function decimalEq(left: string | null, right: string): boolean {
  return Number(left ?? Number.NaN).toFixed(2) === Number(right).toFixed(2);
}

async function readLineContext(
  connection: MigrationConnectionLike,
): Promise<PickLineContext | null> {
  const rows = await connection.query<PickLineContext[]>(
    `
      SELECT
        o.id AS orderId,
        l.id AS lineId,
        log.id AS outLogId,
        u.id AS usageId,
        u.source_log_id AS currentSourceLogId,
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

  return rows[0] ?? null;
}

async function readSourceCandidates(
  connection: MigrationConnectionLike,
  context: PickLineContext,
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
    [context.materialId, EXPECTED_UNIT_COST, context.quantity],
  );
}

function validateContext(context: PickLineContext | null) {
  const blockers: string[] = [];

  if (!context) {
    return ["未找到目标领料单 yh2 明细、库存出库流水或来源分配。"];
  }
  if (context.quantity !== EXPECTED_QUANTITY) {
    blockers.push(
      `目标明细数量不是 ${EXPECTED_QUANTITY}: actual=${context.quantity}`,
    );
  }
  if (!decimalEq(context.lineUnitPrice, EXPECTED_UNIT_COST)) {
    blockers.push(
      `目标明细单价不是 ${EXPECTED_UNIT_COST}: actual=${context.lineUnitPrice}`,
    );
  }
  if (!decimalEq(context.sourceUnitCost, WRONG_SOURCE_UNIT_COST)) {
    blockers.push(
      `当前来源层不是 ${WRONG_SOURCE_UNIT_COST}: actual=${context.sourceUnitCost}`,
    );
  }
  if (Number(context.releasedQty) !== 0) {
    blockers.push(`来源分配已有释放数量: releasedQty=${context.releasedQty}`);
  }

  return blockers;
}

async function executeRepair(
  connection: MigrationConnectionLike,
  context: PickLineContext,
  targetSource: SourceCandidate,
) {
  await connection.beginTransaction();

  try {
    await connection.query(
      `
        UPDATE inventory_source_usage
        SET
          source_log_id = ?,
          updated_by = ?,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `,
      [targetSource.sourceLogId, UPDATED_BY, context.usageId],
    );

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
        context.lineAmount,
        `人工修复：按领料单 ${DOCUMENT_NO} 明细选择的 ${EXPECTED_UNIT_COST} 价格层重新绑定来源。原来源流水 ${context.currentSourceLogId}，新来源流水 ${targetSource.sourceLogId}。`,
        context.outLogId,
      ],
    );

    await connection.commit();

    return {
      updatedUsageId: context.usageId,
      updatedOutLogId: context.outLogId,
      oldSourceLogId: context.currentSourceLogId,
      newSourceLogId: targetSource.sourceLogId,
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
      const before = await readLineContext(connection);
      const contextBlockers = validateContext(before);
      const candidates = before
        ? await readSourceCandidates(connection, before)
        : [];
      const targetSource = candidates[0] ?? null;
      const blockers = [
        ...contextBlockers,
        ...(targetSource ? [] : ["没有足够可用的 11.95 入库来源层。"]),
      ];

      if (execute && blockers.length > 0) {
        throw new Error(`Refusing to execute: ${blockers.join("; ")}`);
      }

      const executeResult =
        execute && before && targetSource
          ? await executeRepair(connection, before, targetSource)
          : null;
      const after = execute ? await readLineContext(connection) : null;
      const report = {
        generatedAt: new Date().toISOString(),
        mode: execute ? "execute" : "dry-run",
        targetDatabase,
        documentNo: DOCUMENT_NO,
        materialCode: MATERIAL_CODE,
        updatedBy: UPDATED_BY,
        blockers,
        before,
        sourceCandidates: candidates,
        selectedTargetSource: targetSource,
        executeResult,
        after,
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
