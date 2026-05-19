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

const DOCUMENT_NO = "LL20260429002";
const LINE_ID = 1579;
const MATERIAL_ID = 1;
const MATERIAL_CODE = "cp001";
const MATERIAL_NAME = "压缩氧自救器";
const EXPECTED_QUANTITY = "4.000000";
const WRONG_UNIT_PRICE = "57.00";
const WRONG_AMOUNT = "228.00";
const WRONG_SOURCE_LOG_ID = 40081;
const CONFIRMED_UNIT_COST = "104.00";
const CONFIRMED_AMOUNT = "416.00";
const TARGET_OUT_LOG_ID = 40276;
const SHIFT_DOCUMENT_NO = "CK20260511001";
const SHIFT_LINE_ID = 690;
const SHIFT_OUT_LOG_ID = 40701;
const SHIFT_USAGE_ID_FROM_40217 = 19592;
const SHIFT_USAGE_ID_ON_40297 = 19591;
const SOURCE_LOG_38712 = 38712;
const SOURCE_LOG_40217 = 40217;
const SOURCE_LOG_40297 = 40297;
const UPDATED_BY =
  "manual-repair-ll20260429002-cp001-document-price-to-104-20260518";
const DRY_RUN_REPORT_FILE_NAME =
  "repair-ll20260429002-cp001-document-price-to-104-dry-run-report.json";
const EXECUTE_REPORT_FILE_NAME =
  "repair-ll20260429002-cp001-document-price-to-104-execute-report.json";

interface LineContext {
  orderId: number;
  documentNo: string;
  orderType: string;
  lineId: number;
  materialId: number;
  materialCode: string;
  materialName: string;
  quantity: string;
  lineUnitPrice: string;
  lineAmount: string;
  lineCostUnitPrice: string | null;
  lineCostAmount: string | null;
  orderTotalQty: string;
  orderTotalAmount: string;
  outLogId: number;
  outLogUnitCost: string | null;
  outLogCostAmount: string | null;
  outLogNote: string | null;
}

interface ActiveSourceUsage {
  usageId: number;
  sourceLogId: number;
  allocatedQty: string;
  releasedQty: string;
  netQty: string;
  sourceDocumentNo: string;
  sourceUnitCost: string | null;
}

interface ShiftUsageContext {
  usageId: number;
  consumerDocumentNo: string;
  consumerLineId: number;
  sourceLogId: number;
  sourceDocumentNo: string;
  sourceUnitCost: string | null;
  allocatedQty: string;
  releasedQty: string;
  netQty: string;
}

interface SourceAvailability {
  sourceLogId: number;
  sourceDocumentNo: string;
  sourceLineId: number;
  sourceBizDate: string;
  unitCost: string;
  sourceQty: string;
  currentAvailableQty: string;
}

interface TotalsContext {
  lineCount: number;
  totalQty: string;
  totalAmount: string;
}

function decimalEq(left: string | number | null, right: string): boolean {
  return Number(left ?? Number.NaN).toFixed(2) === Number(right).toFixed(2);
}

function qtyEq(left: string | number | null, right: string): boolean {
  return Number(left ?? Number.NaN).toFixed(6) === Number(right).toFixed(6);
}

function placeholders(values: readonly unknown[]): string {
  return values.map(() => "?").join(", ");
}

function assertAffectedRows(label: string, result: unknown): void {
  const affectedRows = Number(
    (result as { affectedRows?: number })?.affectedRows ?? Number.NaN,
  );
  if (!Number.isFinite(affectedRows) || affectedRows !== 1) {
    throw new Error(`${label} affected ${affectedRows} rows, expected 1.`);
  }
}

async function readLineContext(
  connection: MigrationConnectionLike,
): Promise<LineContext | null> {
  const rows = await connection.query<LineContext[]>(
    `
      SELECT
        o.id AS orderId,
        o.document_no AS documentNo,
        o.order_type AS orderType,
        l.id AS lineId,
        l.material_id AS materialId,
        l.material_code_snapshot AS materialCode,
        l.material_name_snapshot AS materialName,
        l.quantity,
        l.unit_price AS lineUnitPrice,
        l.amount AS lineAmount,
        l.cost_unit_price AS lineCostUnitPrice,
        l.cost_amount AS lineCostAmount,
        o.total_qty AS orderTotalQty,
        o.total_amount AS orderTotalAmount,
        log.id AS outLogId,
        log.unit_cost AS outLogUnitCost,
        log.cost_amount AS outLogCostAmount,
        log.note AS outLogNote
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
      WHERE o.document_no = ?
        AND l.id = ?
        AND l.material_id = ?
      ORDER BY log.id
    `,
    [DOCUMENT_NO, LINE_ID, MATERIAL_ID],
  );

  return rows[0] ?? null;
}

async function readActiveSourceUsages(
  connection: MigrationConnectionLike,
): Promise<ActiveSourceUsage[]> {
  return connection.query<ActiveSourceUsage[]>(
    `
      SELECT
        u.id AS usageId,
        u.source_log_id AS sourceLogId,
        u.allocated_qty AS allocatedQty,
        u.released_qty AS releasedQty,
        u.allocated_qty - u.released_qty AS netQty,
        source_log.business_document_number AS sourceDocumentNo,
        source_log.unit_cost AS sourceUnitCost
      FROM inventory_source_usage u
      JOIN inventory_log source_log ON source_log.id = u.source_log_id
      WHERE u.consumer_document_type = 'WorkshopMaterialOrder'
        AND u.consumer_line_id = ?
        AND u.allocated_qty > u.released_qty
      ORDER BY u.id
    `,
    [LINE_ID],
  );
}

async function readShiftUsages(
  connection: MigrationConnectionLike,
): Promise<ShiftUsageContext[]> {
  return connection.query<ShiftUsageContext[]>(
    `
      SELECT
        usage_row.id AS usageId,
        consumer_log.business_document_number AS consumerDocumentNo,
        consumer_log.business_document_line_id AS consumerLineId,
        usage_row.source_log_id AS sourceLogId,
        source_log.business_document_number AS sourceDocumentNo,
        source_log.unit_cost AS sourceUnitCost,
        usage_row.allocated_qty AS allocatedQty,
        usage_row.released_qty AS releasedQty,
        usage_row.allocated_qty - usage_row.released_qty AS netQty
      FROM inventory_source_usage usage_row
      JOIN inventory_log source_log ON source_log.id = usage_row.source_log_id
      JOIN inventory_log consumer_log
        ON consumer_log.business_document_type = usage_row.consumer_document_type
       AND consumer_log.business_document_id = usage_row.consumer_document_id
       AND consumer_log.business_document_line_id = usage_row.consumer_line_id
       AND consumer_log.direction = 'OUT'
      WHERE usage_row.id IN (?, ?)
      ORDER BY usage_row.id
    `,
    [SHIFT_USAGE_ID_ON_40297, SHIFT_USAGE_ID_FROM_40217],
  );
}

async function readSourceAvailability(
  connection: MigrationConnectionLike,
): Promise<SourceAvailability[]> {
  return connection.query<SourceAvailability[]>(
    `
      SELECT
        source_log.id AS sourceLogId,
        source_log.business_document_number AS sourceDocumentNo,
        source_log.business_document_line_id AS sourceLineId,
        DATE_FORMAT(source_log.biz_date, '%Y-%m-%d') AS sourceBizDate,
        source_log.unit_cost AS unitCost,
        source_log.change_qty AS sourceQty,
        source_log.change_qty
          - COALESCE(SUM(usage_row.allocated_qty - usage_row.released_qty), 0) AS currentAvailableQty
      FROM inventory_log source_log
      LEFT JOIN inventory_source_usage usage_row ON usage_row.source_log_id = source_log.id
      WHERE source_log.id IN (${placeholders([
        WRONG_SOURCE_LOG_ID,
        SOURCE_LOG_38712,
        SOURCE_LOG_40217,
        SOURCE_LOG_40297,
      ])})
      GROUP BY source_log.id
      ORDER BY source_log.id
    `,
    [WRONG_SOURCE_LOG_ID, SOURCE_LOG_38712, SOURCE_LOG_40217, SOURCE_LOG_40297],
  );
}

async function readAsOfAvailability(
  connection: MigrationConnectionLike,
): Promise<Array<Record<string, unknown>>> {
  return connection.query<Array<Record<string, unknown>>>(
    `
      SELECT
        target.id AS targetLogId,
        target.business_document_number AS documentNo,
        DATE_FORMAT(target.biz_date, '%Y-%m-%d') AS bizDate,
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
         SELECT 1
         FROM inventory_log source_reversal
         WHERE source_reversal.reversal_of_log_id = source_log.id
       )
      WHERE target.id = ?
        AND target.material_id = ?
        AND target.direction = 'OUT'
      GROUP BY target.id
    `,
    [CONFIRMED_UNIT_COST, TARGET_OUT_LOG_ID, MATERIAL_ID],
  );
}

async function readOrderTotals(
  connection: MigrationConnectionLike,
  orderId: number,
): Promise<TotalsContext> {
  const rows = await connection.query<TotalsContext[]>(
    `
      SELECT
        COUNT(*) AS lineCount,
        COALESCE(SUM(quantity), 0) AS totalQty,
        COALESCE(SUM(amount), 0) AS totalAmount
      FROM workshop_material_order_line
      WHERE order_id = ?
    `,
    [orderId],
  );

  return (
    rows[0] ?? {
      lineCount: 0,
      totalQty: "0.000000",
      totalAmount: "0.00",
    }
  );
}

function validateContext(
  context: LineContext | null,
  activeSourceUsages: readonly ActiveSourceUsage[],
  shiftUsages: readonly ShiftUsageContext[],
  sourceAvailability: readonly SourceAvailability[],
  asOfAvailability: readonly Record<string, unknown>[],
) {
  const blockers: string[] = [];

  if (!context) {
    return ["未找到目标车间领料行、有效出库流水或单据。"];
  }

  if (context.documentNo !== DOCUMENT_NO || context.lineId !== LINE_ID) {
    blockers.push(
      `目标行不匹配: documentNo=${context.documentNo}, lineId=${context.lineId}`,
    );
  }

  if (
    context.materialId !== MATERIAL_ID ||
    context.materialCode !== MATERIAL_CODE
  ) {
    blockers.push(
      `目标物料不是 ${MATERIAL_CODE}: materialId=${context.materialId}, materialCode=${context.materialCode}`,
    );
  }

  if (context.materialName !== MATERIAL_NAME) {
    blockers.push(`目标物料名称不是 ${MATERIAL_NAME}: ${context.materialName}`);
  }

  if (context.orderType !== "PICK") {
    blockers.push(`目标单据不是领料单: ${context.orderType}`);
  }

  if (!qtyEq(context.quantity, EXPECTED_QUANTITY)) {
    blockers.push(`目标明细数量不是 ${EXPECTED_QUANTITY}: ${context.quantity}`);
  }

  if (
    !decimalEq(context.lineUnitPrice, WRONG_UNIT_PRICE) &&
    !decimalEq(context.lineUnitPrice, CONFIRMED_UNIT_COST)
  ) {
    blockers.push(
      `目标明细单价既不是待修复值 ${WRONG_UNIT_PRICE}，也不是确认值 ${CONFIRMED_UNIT_COST}: ${context.lineUnitPrice}`,
    );
  }

  if (
    !decimalEq(context.lineAmount, WRONG_AMOUNT) &&
    !decimalEq(context.lineAmount, CONFIRMED_AMOUNT)
  ) {
    blockers.push(
      `目标明细金额既不是待修复值 ${WRONG_AMOUNT}，也不是确认值 ${CONFIRMED_AMOUNT}: ${context.lineAmount}`,
    );
  }

  if (
    !decimalEq(context.outLogUnitCost, "117.00") &&
    !decimalEq(context.outLogUnitCost, CONFIRMED_UNIT_COST)
  ) {
    blockers.push(
      `库存出库流水单价不是预期修复前/后状态: ${context.outLogUnitCost ?? "null"}`,
    );
  }

  const activeNetQty = activeSourceUsages.reduce(
    (sum, usage) => sum + Number(usage.netQty),
    0,
  );
  if (!qtyEq(activeNetQty, EXPECTED_QUANTITY)) {
    blockers.push(
      `当前有效来源占用数量不是 ${EXPECTED_QUANTITY}: ${activeNetQty.toFixed(6)}`,
    );
  }

  if (shiftUsages.length !== 2) {
    blockers.push(`同价挪移 usage 数量不是 2: ${shiftUsages.length}`);
  }

  const source40297 = shiftUsages.find(
    (usage) => usage.usageId === SHIFT_USAGE_ID_ON_40297,
  );
  const source40217 = shiftUsages.find(
    (usage) => usage.usageId === SHIFT_USAGE_ID_FROM_40217,
  );
  if (!source40297) {
    blockers.push(`缺少 usage ${SHIFT_USAGE_ID_ON_40297}`);
  }
  if (!source40217) {
    blockers.push(`缺少 usage ${SHIFT_USAGE_ID_FROM_40217}`);
  }

  if (
    source40297 &&
    (!decimalEq(source40297.sourceUnitCost, CONFIRMED_UNIT_COST) ||
      source40297.sourceLogId !== SOURCE_LOG_40297)
  ) {
    blockers.push(
      `usage ${SHIFT_USAGE_ID_ON_40297} 不是预期的 ${SOURCE_LOG_40297}/${CONFIRMED_UNIT_COST}`,
    );
  }
  if (
    source40217 &&
    (!decimalEq(source40217.sourceUnitCost, CONFIRMED_UNIT_COST) ||
      source40217.sourceLogId !== SOURCE_LOG_40217 ||
      !qtyEq(source40217.netQty, "3.000000"))
  ) {
    blockers.push(
      `usage ${SHIFT_USAGE_ID_FROM_40217} 不是预期的 ${SOURCE_LOG_40217}/${CONFIRMED_UNIT_COST}/3`,
    );
  }

  const availabilityById = new Map(
    sourceAvailability.map((row) => [row.sourceLogId, row]),
  );
  const row38712 = availabilityById.get(SOURCE_LOG_38712);
  const row40217 = availabilityById.get(SOURCE_LOG_40217);
  const row40297 = availabilityById.get(SOURCE_LOG_40297);
  const row40081 = availabilityById.get(WRONG_SOURCE_LOG_ID);
  if (!row38712 || Number(row38712.currentAvailableQty) < 3) {
    blockers.push(
      `source ${SOURCE_LOG_38712} 当前可用数量不足 3: ${row38712?.currentAvailableQty ?? "missing"}`,
    );
  }
  if (!row40217 || Number(row40217.currentAvailableQty) !== 0) {
    blockers.push(
      `source ${SOURCE_LOG_40217} 当前应为 0 可用，待通过挪移释放: ${row40217?.currentAvailableQty ?? "missing"}`,
    );
  }
  if (!row40297 || Number(row40297.currentAvailableQty) < 3) {
    blockers.push(
      `source ${SOURCE_LOG_40297} 当前可用数量不足 3: ${row40297?.currentAvailableQty ?? "missing"}`,
    );
  }
  if (!row40081 || Number(row40081.currentAvailableQty) < 0) {
    blockers.push(
      `source ${WRONG_SOURCE_LOG_ID} 状态异常: ${row40081?.currentAvailableQty ?? "missing"}`,
    );
  }

  const availableBeforeTargetQty = Number(
    asOfAvailability[0]?.availableBeforeTargetQty ?? Number.NaN,
  );
  if (
    !Number.isFinite(availableBeforeTargetQty) ||
    availableBeforeTargetQty < 4
  ) {
    blockers.push(
      `截至 ${DOCUMENT_NO} 业务时点的 104 来源可用量不足 4: ${asOfAvailability[0]?.availableBeforeTargetQty ?? "missing"}`,
    );
  }

  return blockers;
}

async function executeRepair(
  connection: MigrationConnectionLike,
  context: LineContext,
) {
  await connection.beginTransaction();

  try {
    assertAffectedRows(
      "Release CK20260511001 source 40217 usage",
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
          AND allocated_qty = '3.000000'
          AND released_qty = 0
          AND status = 'ALLOCATED'
      `,
        [
          UPDATED_BY,
          SHIFT_USAGE_ID_FROM_40217,
          SOURCE_LOG_40217,
          SHIFT_LINE_ID,
        ],
      ),
    );

    assertAffectedRows(
      "Merge CK20260511001 quantity into source 40297 usage",
      await connection.query(
        `
        UPDATE inventory_source_usage
        SET
          allocated_qty = allocated_qty + '3.000000',
          updated_by = ?,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
          AND source_log_id = ?
          AND consumer_document_type = 'SalesStockOrder'
          AND consumer_line_id = ?
          AND released_qty = 0
          AND status = 'ALLOCATED'
      `,
        [UPDATED_BY, SHIFT_USAGE_ID_ON_40297, SOURCE_LOG_40297, SHIFT_LINE_ID],
      ),
    );

    assertAffectedRows(
      "Release LL20260429002 wrong 117 usage",
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
          AND consumer_document_type = 'WorkshopMaterialOrder'
          AND consumer_line_id = ?
          AND allocated_qty = '4.000000'
          AND released_qty = 0
          AND status = 'ALLOCATED'
      `,
        [UPDATED_BY, 21425, WRONG_SOURCE_LOG_ID, LINE_ID],
      ),
    );

    const insert38712 = await connection.query(
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
        VALUES (?, ?, 'WorkshopMaterialOrder', ?, ?, '3.000000', 0, 'ALLOCATED', ?, CURRENT_TIMESTAMP, ?, CURRENT_TIMESTAMP)
      `,
      [
        MATERIAL_ID,
        SOURCE_LOG_38712,
        context.orderId,
        LINE_ID,
        UPDATED_BY,
        UPDATED_BY,
      ],
    );
    assertAffectedRows("Insert LL20260429002 source 38712 usage", insert38712);

    const insert40217 = await connection.query(
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
        VALUES (?, ?, 'WorkshopMaterialOrder', ?, ?, '1.000000', 0, 'ALLOCATED', ?, CURRENT_TIMESTAMP, ?, CURRENT_TIMESTAMP)
      `,
      [
        MATERIAL_ID,
        SOURCE_LOG_40217,
        context.orderId,
        LINE_ID,
        UPDATED_BY,
        UPDATED_BY,
      ],
    );
    assertAffectedRows("Insert LL20260429002 source 40217 usage", insert40217);

    assertAffectedRows(
      "Update LL20260429002 document line",
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
          CONFIRMED_UNIT_COST,
          CONFIRMED_AMOUNT,
          CONFIRMED_UNIT_COST,
          CONFIRMED_AMOUNT,
          UPDATED_BY,
          context.lineId,
        ],
      ),
    );

    assertAffectedRows(
      "Recalculate LL20260429002 order totals",
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
        [context.orderId, context.orderId, UPDATED_BY, context.orderId],
      ),
    );

    assertAffectedRows(
      "Update LL20260429002 inventory log",
      await connection.query(
        `
        UPDATE inventory_log
        SET
          unit_cost = ?,
          cost_amount = ?,
          note = ?,
          operator_id = COALESCE(operator_id, ?)
        WHERE id = ?
          AND business_document_type = 'WorkshopMaterialOrder'
          AND business_document_number = ?
          AND business_document_line_id = ?
      `,
        [
          CONFIRMED_UNIT_COST,
          CONFIRMED_AMOUNT,
          `人工修复：${MATERIAL_CODE} 车间领料按确认事实改为 4 * 104.00，并重绑到 104 价层来源。`,
          UPDATED_BY,
          TARGET_OUT_LOG_ID,
          DOCUMENT_NO,
          LINE_ID,
        ],
      ),
    );

    assertAffectedRows(
      "Annotate CK20260511001 same-cost source shift",
      await connection.query(
        `
        UPDATE inventory_log
        SET
          note = ?,
          operator_id = COALESCE(operator_id, ?)
        WHERE id = ?
          AND business_document_type = 'SalesStockOrder'
          AND business_document_number = ?
          AND business_document_line_id = ?
      `,
        [
          `人工修复：同价 104 来源从 RK20260429005 调整到 RK20260430006，释放早期 104 来源给 ${DOCUMENT_NO}。`,
          UPDATED_BY,
          SHIFT_OUT_LOG_ID,
          SHIFT_DOCUMENT_NO,
          SHIFT_LINE_ID,
        ],
      ),
    );

    await connection.commit();

    return {
      updatedOrderId: context.orderId,
      updatedLineId: context.lineId,
      updatedOutLogId: context.outLogId,
      releasedWrongUsageId: 21425,
      movedFutureUsageId: SHIFT_USAGE_ID_FROM_40217,
      mergedFutureUsageId: SHIFT_USAGE_ID_ON_40297,
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
      const beforeTotals = before
        ? await readOrderTotals(connection, before.orderId)
        : null;
      const beforeActiveSourceUsages = await readActiveSourceUsages(connection);
      const beforeShiftUsages = await readShiftUsages(connection);
      const beforeSourceAvailability = await readSourceAvailability(connection);
      const beforeAsOfAvailability = await readAsOfAvailability(connection);
      const blockers = validateContext(
        before,
        beforeActiveSourceUsages,
        beforeShiftUsages,
        beforeSourceAvailability,
        beforeAsOfAvailability,
      );

      if (execute && blockers.length > 0) {
        throw new Error(`Refusing to execute: ${blockers.join("; ")}`);
      }

      const executeResult =
        execute && before ? await executeRepair(connection, before) : null;
      const after = execute ? await readLineContext(connection) : null;
      const afterTotals = after
        ? await readOrderTotals(connection, after.orderId)
        : null;
      const afterActiveSourceUsages = execute
        ? await readActiveSourceUsages(connection)
        : null;
      const afterShiftUsages = execute
        ? await readShiftUsages(connection)
        : null;
      const afterSourceAvailability = execute
        ? await readSourceAvailability(connection)
        : null;
      const afterAsOfAvailability = execute
        ? await readAsOfAvailability(connection)
        : null;

      const report = {
        generatedAt: new Date().toISOString(),
        mode: execute ? "execute" : "dry-run",
        targetDatabase,
        documentNo: DOCUMENT_NO,
        lineId: LINE_ID,
        materialCode: MATERIAL_CODE,
        confirmedBusinessFact:
          "业务已确认：LL20260429002 第 1579 行 cp001 压缩氧自救器真实领料为 4 个 104.00 元，并非说明字段的 2 * 10.00 + 2 * 104.00，也不是当前错误来源链显示的 4 * 117.00。",
        updatedBy: UPDATED_BY,
        expected: {
          quantity: EXPECTED_QUANTITY,
          unitCost: CONFIRMED_UNIT_COST,
          amount: CONFIRMED_AMOUNT,
        },
        knownWrongValues: {
          lineUnitPrice: WRONG_UNIT_PRICE,
          lineAmount: WRONG_AMOUNT,
          outLogUnitCost: "117.00",
          outLogCostAmount: "468.00",
        },
        sameCostShiftPlan: {
          shiftedConsumerDocumentNo: SHIFT_DOCUMENT_NO,
          shiftedConsumerLineId: SHIFT_LINE_ID,
          fromSourceLogId: SOURCE_LOG_40217,
          toSourceLogId: SOURCE_LOG_40297,
          quantity: "3.000000",
        },
        targetReplacementPlan: {
          releaseUsageId: 21425,
          replacementSources: [
            { sourceLogId: SOURCE_LOG_38712, quantity: "3.000000" },
            { sourceLogId: SOURCE_LOG_40217, quantity: "1.000000" },
          ],
        },
        blockers,
        before,
        beforeTotals,
        beforeActiveSourceUsages,
        beforeShiftUsages,
        beforeSourceAvailability,
        beforeAsOfAvailability,
        executeResult,
        after,
        afterTotals,
        afterActiveSourceUsages,
        afterShiftUsages,
        afterSourceAvailability,
        afterAsOfAvailability,
      };

      writeStableReport(reportPath, report);
      console.log(
        `Repair ${DOCUMENT_NO}/${MATERIAL_CODE} ${execute ? "execute" : "dry-run"} completed. blockers=${blockers.length}, report=${reportPath}`,
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
