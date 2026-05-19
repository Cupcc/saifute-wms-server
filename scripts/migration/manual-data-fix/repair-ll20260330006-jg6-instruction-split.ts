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
  type QueryResultWithInsertId,
  withPoolConnection,
} from "../db";
import { writeStableReport } from "../shared/report-writer";

const DOCUMENT_NO = "LL20260330006";
const LINE_ID = 983;
const MATERIAL_CODE = "jg6";
const UPDATED_BY = "manual-repair-ll20260330006-jg6-instruction-split-20260518";
const DRY_RUN_REPORT_FILE_NAME =
  "repair-ll20260330006-jg6-instruction-split-dry-run-report.json";
const EXECUTE_REPORT_FILE_NAME =
  "repair-ll20260330006-jg6-instruction-split-execute-report.json";

interface TargetLineContext {
  orderId: number;
  documentNo: string;
  orderType: string;
  bizDate: string;
  lifecycleStatus: string;
  inventoryEffectStatus: string;
  orderTotalQty: string;
  orderTotalAmount: string;
  lineId: number;
  lineNo: number;
  materialId: number;
  materialCode: string;
  materialName: string;
  materialSpec: string | null;
  unitCode: string;
  quantity: string;
  unitPrice: string;
  amount: string;
  costUnitPrice: string | null;
  costAmount: string | null;
  sourceDocumentType: string | null;
  sourceDocumentId: number | null;
  sourceDocumentLineId: number | null;
  remark: string | null;
  createdBy: string | null;
  createdAt: string | null;
  updatedBy: string | null;
  updatedAt: string | null;
  outLogId: number;
  balanceId: number;
  stockScopeId: number | null;
  workshopId: number | null;
  projectTargetId: number | null;
  direction: string;
  operationType: string;
  businessModule: string;
  businessDocumentType: string;
  changeQty: string;
  beforeQty: string;
  afterQty: string;
  outLogUnitCost: string | null;
  outLogCostAmount: string | null;
  operatorId: string | null;
  occurredAt: string;
  idempotencyKey: string;
  note: string | null;
  instruction: string | null;
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

interface InstructionPiece {
  quantity: string;
  unitCost: string;
  amount: string;
}

interface PlannedSplitPiece extends InstructionPiece {
  sourceUsageIds: number[];
  sourceLogIds: number[];
  targetLineId: number | null;
  targetLogId: number | null;
  beforeQty: string;
  afterQty: string;
}

interface OrderTotals {
  lineCount: number;
  totalQty: string;
  totalAmount: string;
}

function toNumber(value: string | number | null): number {
  if (value === null) return 0;
  return Number(value);
}

function qty(value: number): string {
  return value.toFixed(6);
}

function money(value: number): string {
  return value.toFixed(2);
}

function decimalEq(left: string | number | null, right: string): boolean {
  return Number(left ?? Number.NaN).toFixed(2) === Number(right).toFixed(2);
}

function qtyEq(left: string | number | null, right: string | number): boolean {
  return Number(left ?? Number.NaN).toFixed(6) === Number(right).toFixed(6);
}

function parseInstruction(instruction: string | null): InstructionPiece[] {
  if (!instruction) return [];

  const pieces: InstructionPiece[] = [];
  const pattern =
    /数量\s*[:：]\s*([0-9]+(?:\.[0-9]+)?)\s*[，,、\s]*单价\s*[:：]\s*([0-9]+(?:\.[0-9]+)?)/g;

  for (const match of instruction.matchAll(pattern)) {
    const quantity = Number(match[1]);
    const unitCost = Number(match[2]);
    if (!Number.isFinite(quantity) || !Number.isFinite(unitCost)) continue;
    pieces.push({
      quantity: qty(quantity),
      unitCost: money(unitCost),
      amount: money(quantity * unitCost),
    });
  }

  return pieces;
}

async function readTargetLine(
  connection: MigrationConnectionLike,
): Promise<TargetLineContext | null> {
  const rows = await connection.query<TargetLineContext[]>(
    `
      SELECT
        o.id AS orderId,
        o.document_no AS documentNo,
        o.order_type AS orderType,
        DATE_FORMAT(o.biz_date, '%Y-%m-%d') AS bizDate,
        o.lifecycle_status AS lifecycleStatus,
        o.inventory_effect_status AS inventoryEffectStatus,
        o.total_qty AS orderTotalQty,
        o.total_amount AS orderTotalAmount,
        l.id AS lineId,
        l.line_no AS lineNo,
        l.material_id AS materialId,
        l.material_code_snapshot AS materialCode,
        l.material_name_snapshot AS materialName,
        l.material_spec_snapshot AS materialSpec,
        l.unit_code_snapshot AS unitCode,
        l.quantity,
        l.unit_price AS unitPrice,
        l.amount,
        l.cost_unit_price AS costUnitPrice,
        l.cost_amount AS costAmount,
        l.source_document_type AS sourceDocumentType,
        l.source_document_id AS sourceDocumentId,
        l.source_document_line_id AS sourceDocumentLineId,
        l.remark,
        l.created_by AS createdBy,
        DATE_FORMAT(l.created_at, '%Y-%m-%d %H:%i:%s') AS createdAt,
        l.updated_by AS updatedBy,
        DATE_FORMAT(l.updated_at, '%Y-%m-%d %H:%i:%s') AS updatedAt,
        log.id AS outLogId,
        log.balance_id AS balanceId,
        log.stock_scope_id AS stockScopeId,
        log.workshop_id AS workshopId,
        log.project_target_id AS projectTargetId,
        log.direction,
        log.operation_type AS operationType,
        log.business_module AS businessModule,
        log.business_document_type AS businessDocumentType,
        log.change_qty AS changeQty,
        log.before_qty AS beforeQty,
        log.after_qty AS afterQty,
        log.unit_cost AS outLogUnitCost,
        log.cost_amount AS outLogCostAmount,
        log.operator_id AS operatorId,
        DATE_FORMAT(log.occurred_at, '%Y-%m-%d %H:%i:%s') AS occurredAt,
        log.idempotency_key AS idempotencyKey,
        log.note,
        JSON_UNQUOTE(JSON_EXTRACT(payload.payload_json, '$.instruction')) AS instruction
      FROM workshop_material_order o
      JOIN workshop_material_order_line l ON l.order_id = o.id
      JOIN inventory_log log
        ON log.business_document_type = 'WorkshopMaterialOrder'
       AND log.business_document_id = o.id
       AND log.business_document_line_id = l.id
       AND log.direction = 'OUT'
       AND log.operation_type = 'PICK_OUT'
       AND NOT EXISTS (
         SELECT 1
         FROM inventory_log rev
         WHERE rev.reversal_of_log_id = log.id
       )
      LEFT JOIN migration_staging.archived_field_payload payload
        ON payload.target_table = 'workshop_material_order_line'
       AND payload.target_id = l.id
       AND payload.payload_kind = 'legacy-unmapped-fields'
      WHERE o.document_no = ?
        AND l.id = ?
        AND l.material_code_snapshot = ?
      ORDER BY log.id
    `,
    [DOCUMENT_NO, LINE_ID, MATERIAL_CODE],
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

async function readOrderTotals(
  connection: MigrationConnectionLike,
  orderId: number,
): Promise<OrderTotals> {
  const rows = await connection.query<OrderTotals[]>(
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

function matchSourceUsagesByPiece(
  pieces: readonly InstructionPiece[],
  sourceUsages: readonly ActiveSourceUsage[],
) {
  const blockers: string[] = [];
  const usageIdsByUnitCost = new Map<string, number[]>();
  const sourceLogIdsByUnitCost = new Map<string, number[]>();
  const qtyByUnitCost = new Map<string, number>();

  for (const usage of sourceUsages) {
    if (usage.sourceUnitCost === null) {
      blockers.push(`来源占用 ${usage.usageId} 缺少 source unit_cost。`);
      continue;
    }
    const unitCost = money(toNumber(usage.sourceUnitCost));
    usageIdsByUnitCost.set(unitCost, [
      ...(usageIdsByUnitCost.get(unitCost) ?? []),
      usage.usageId,
    ]);
    sourceLogIdsByUnitCost.set(unitCost, [
      ...(sourceLogIdsByUnitCost.get(unitCost) ?? []),
      usage.sourceLogId,
    ]);
    qtyByUnitCost.set(
      unitCost,
      (qtyByUnitCost.get(unitCost) ?? 0) + toNumber(usage.netQty),
    );
  }

  const pieceQtyByUnitCost = new Map<string, number>();
  for (const piece of pieces) {
    pieceQtyByUnitCost.set(
      piece.unitCost,
      (pieceQtyByUnitCost.get(piece.unitCost) ?? 0) + toNumber(piece.quantity),
    );
  }

  for (const [unitCost, pieceQty] of pieceQtyByUnitCost) {
    const sourceQty = qtyByUnitCost.get(unitCost) ?? 0;
    if (!qtyEq(sourceQty, pieceQty)) {
      blockers.push(
        `说明字段 ${unitCost} 价层数量 ${qty(pieceQty)} 与来源占用数量 ${qty(sourceQty)} 不一致。`,
      );
    }
  }

  for (const [unitCost, sourceQty] of qtyByUnitCost) {
    const pieceQty = pieceQtyByUnitCost.get(unitCost) ?? 0;
    if (!qtyEq(sourceQty, pieceQty)) {
      blockers.push(
        `来源 ${unitCost} 价层数量 ${qty(sourceQty)} 与说明字段数量 ${qty(pieceQty)} 不一致。`,
      );
    }
  }

  return {
    blockers,
    usageIdsByUnitCost,
    sourceLogIdsByUnitCost,
  };
}

function buildPlan(
  context: TargetLineContext | null,
  sourceUsages: readonly ActiveSourceUsage[],
) {
  const blockers: string[] = [];
  const pieces = parseInstruction(context?.instruction ?? null);

  if (!context) {
    return {
      blockers: ["未找到目标行或有效出库流水。"],
      pieces,
      plannedPieces: [],
    };
  }

  if (context.lifecycleStatus !== "EFFECTIVE") {
    blockers.push(`目标单据不是 EFFECTIVE: ${context.lifecycleStatus}`);
  }
  if (context.inventoryEffectStatus !== "POSTED") {
    blockers.push(
      `目标单据库存状态不是 POSTED: ${context.inventoryEffectStatus}`,
    );
  }
  if (context.direction !== "OUT" || context.operationType !== "PICK_OUT") {
    blockers.push(
      `目标库存流水不是 PICK_OUT: direction=${context.direction}, operationType=${context.operationType}`,
    );
  }
  if (pieces.length < 2) {
    blockers.push("说明字段没有解析出至少两段价层。");
  }

  const expectedQty = pieces.reduce(
    (sum, piece) => sum + toNumber(piece.quantity),
    0,
  );
  const expectedAmount = pieces.reduce(
    (sum, piece) => sum + toNumber(piece.amount),
    0,
  );

  if (!qtyEq(context.quantity, expectedQty)) {
    blockers.push(
      `目标行数量 ${context.quantity} 与说明字段数量 ${qty(expectedQty)} 不一致。`,
    );
  }
  if (!decimalEq(context.amount, money(expectedAmount))) {
    blockers.push(
      `目标行金额 ${context.amount} 与说明字段金额 ${money(expectedAmount)} 不一致。`,
    );
  }

  const sourceMatch = matchSourceUsagesByPiece(pieces, sourceUsages);
  blockers.push(...sourceMatch.blockers);

  let runningBeforeQty = toNumber(context.beforeQty);
  const plannedPieces: PlannedSplitPiece[] = pieces.map((piece) => {
    const afterQty = runningBeforeQty - toNumber(piece.quantity);
    const plannedPiece: PlannedSplitPiece = {
      ...piece,
      sourceUsageIds: sourceMatch.usageIdsByUnitCost.get(piece.unitCost) ?? [],
      sourceLogIds:
        sourceMatch.sourceLogIdsByUnitCost.get(piece.unitCost) ?? [],
      targetLineId: null,
      targetLogId: null,
      beforeQty: qty(runningBeforeQty),
      afterQty: qty(afterQty),
    };
    runningBeforeQty = afterQty;
    return plannedPiece;
  });

  if (!qtyEq(runningBeforeQty, context.afterQty)) {
    blockers.push(
      `拆分后流水 after_qty ${qty(runningBeforeQty)} 与原 after_qty ${context.afterQty} 不一致。`,
    );
  }

  return { blockers, pieces, plannedPieces };
}

async function insertLine(
  connection: MigrationConnectionLike,
  context: TargetLineContext,
  lineNo: number,
  piece: InstructionPiece,
): Promise<number> {
  const result = await connection.query<QueryResultWithInsertId>(
    `
      INSERT INTO workshop_material_order_line (
        order_id,
        line_no,
        material_id,
        material_code_snapshot,
        material_name_snapshot,
        material_spec_snapshot,
        unit_code_snapshot,
        quantity,
        unit_price,
        amount,
        cost_unit_price,
        cost_amount,
        source_document_type,
        source_document_id,
        source_document_line_id,
        remark,
        created_by,
        created_at,
        updated_by,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `,
    [
      context.orderId,
      lineNo,
      context.materialId,
      context.materialCode,
      context.materialName,
      context.materialSpec,
      context.unitCode,
      piece.quantity,
      piece.unitCost,
      piece.amount,
      piece.unitCost,
      piece.amount,
      context.sourceDocumentType,
      context.sourceDocumentId,
      context.sourceDocumentLineId,
      context.remark,
      context.createdBy,
      context.createdAt,
      UPDATED_BY,
    ],
  );

  const insertId = Number(result.insertId ?? 0);
  if (!Number.isFinite(insertId) || insertId <= 0) {
    throw new Error("新增拆分明细未返回 insertId。");
  }
  return insertId;
}

async function insertOutLog(
  connection: MigrationConnectionLike,
  context: TargetLineContext,
  lineId: number,
  piece: PlannedSplitPiece,
): Promise<number> {
  const result = await connection.query<QueryResultWithInsertId>(
    `
      INSERT INTO inventory_log (
        balance_id,
        material_id,
        stock_scope_id,
        workshop_id,
        project_target_id,
        biz_date,
        direction,
        operation_type,
        business_module,
        business_document_type,
        business_document_id,
        business_document_number,
        business_document_line_id,
        change_qty,
        before_qty,
        after_qty,
        unit_cost,
        cost_amount,
        operator_id,
        occurred_at,
        idempotency_key,
        note
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    [
      context.balanceId,
      context.materialId,
      context.stockScopeId,
      context.workshopId,
      context.projectTargetId,
      context.bizDate,
      context.direction,
      context.operationType,
      context.businessModule,
      context.businessDocumentType,
      context.orderId,
      context.documentNo,
      lineId,
      piece.quantity,
      piece.beforeQty,
      piece.afterQty,
      piece.unitCost,
      piece.amount,
      context.operatorId,
      context.occurredAt,
      `WorkshopMaterialOrder:${context.orderId}:line:${lineId}`,
      `按旧系统说明字段拆分 ${DOCUMENT_NO}/${MATERIAL_CODE} 价格层。`,
    ],
  );

  const insertId = Number(result.insertId ?? 0);
  if (!Number.isFinite(insertId) || insertId <= 0) {
    throw new Error("新增拆分库存流水未返回 insertId。");
  }
  return insertId;
}

async function executeRepair(
  connection: MigrationConnectionLike,
  context: TargetLineContext,
  plannedPieces: readonly PlannedSplitPiece[],
) {
  await connection.beginTransaction();

  try {
    const extraLineCount = plannedPieces.length - 1;

    await connection.query(
      `
        UPDATE workshop_material_order_line
        SET line_no = line_no + ?
        WHERE order_id = ?
          AND line_no > ?
        ORDER BY line_no DESC
      `,
      [extraLineCount, context.orderId, context.lineNo],
    );

    const firstPiece = plannedPieces[0];
    await connection.query(
      `
        UPDATE workshop_material_order_line
        SET
          quantity = ?,
          unit_price = ?,
          amount = ?,
          cost_unit_price = ?,
          cost_amount = ?,
          updated_by = ?,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `,
      [
        firstPiece.quantity,
        firstPiece.unitCost,
        firstPiece.amount,
        firstPiece.unitCost,
        firstPiece.amount,
        UPDATED_BY,
        context.lineId,
      ],
    );

    await connection.query(
      `
        UPDATE inventory_log
        SET
          change_qty = ?,
          after_qty = ?,
          unit_cost = ?,
          cost_amount = ?,
          note = ?
        WHERE id = ?
      `,
      [
        firstPiece.quantity,
        firstPiece.afterQty,
        firstPiece.unitCost,
        firstPiece.amount,
        `按旧系统说明字段拆分 ${DOCUMENT_NO}/${MATERIAL_CODE} 价格层，保留第一段。`,
        context.outLogId,
      ],
    );

    const executedPieces: PlannedSplitPiece[] = [
      {
        ...firstPiece,
        targetLineId: context.lineId,
        targetLogId: context.outLogId,
      },
    ];

    for (let index = 1; index < plannedPieces.length; index += 1) {
      const piece = plannedPieces[index];
      const newLineId = await insertLine(
        connection,
        context,
        context.lineNo + index,
        piece,
      );
      const newLogId = await insertOutLog(
        connection,
        context,
        newLineId,
        piece,
      );

      if (piece.sourceUsageIds.length > 0) {
        await connection.query(
          `
            UPDATE inventory_source_usage
            SET
              consumer_line_id = ?,
              updated_by = ?,
              updated_at = CURRENT_TIMESTAMP
            WHERE id IN (${piece.sourceUsageIds.map(() => "?").join(", ")})
          `,
          [newLineId, UPDATED_BY, ...piece.sourceUsageIds],
        );
      }

      executedPieces.push({
        ...piece,
        targetLineId: newLineId,
        targetLogId: newLogId,
      });
    }

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
    );

    await connection.commit();

    return {
      updatedOrderId: context.orderId,
      originalLineId: context.lineId,
      originalOutLogId: context.outLogId,
      executedPieces,
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
      const before = await readTargetLine(connection);
      const beforeSourceUsages = await readActiveSourceUsages(connection);
      const beforeTotals = before
        ? await readOrderTotals(connection, before.orderId)
        : null;
      const plan = buildPlan(before, beforeSourceUsages);

      if (execute && plan.blockers.length > 0) {
        throw new Error(`Refusing to execute: ${plan.blockers.join("; ")}`);
      }

      const executeResult =
        execute && before
          ? await executeRepair(connection, before, plan.plannedPieces)
          : null;

      const after = execute ? await readTargetLine(connection) : null;
      const afterSourceUsages = execute
        ? await readActiveSourceUsages(connection)
        : null;
      const afterTotals = after
        ? await readOrderTotals(connection, after.orderId)
        : null;

      const report = {
        generatedAt: new Date().toISOString(),
        mode: execute ? "execute" : "dry-run",
        targetDatabase,
        documentNo: DOCUMENT_NO,
        lineId: LINE_ID,
        materialCode: MATERIAL_CODE,
        rule: "不按平均成本落账；按旧系统说明字段拆分为真实来源价格层。",
        updatedBy: UPDATED_BY,
        blockers: plan.blockers,
        instructionPieces: plan.pieces,
        plannedPieces: plan.plannedPieces,
        before,
        beforeTotals,
        beforeSourceUsages,
        executeResult,
        after,
        afterTotals,
        afterSourceUsages,
      };

      writeStableReport(reportPath, report);
      console.log(
        `Repair ${DOCUMENT_NO}/${MATERIAL_CODE} instruction split ${execute ? "execute" : "dry-run"} completed. blockers=${plan.blockers.length}, pieces=${plan.plannedPieces.length}, report=${reportPath}`,
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
