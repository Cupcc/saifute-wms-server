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

const MATERIAL_CODE = "zjq042";
const MATERIAL_NAME = "309胶";
const WRONG_UNIT_COST = "208.33";
const UPDATED_BY = "repair-zjq042-actual-source-cost-20260518";
const DRY_RUN_REPORT_FILE_NAME =
  "repair-zjq042-workshop-pick-to-actual-source-cost-dry-run-report.json";
const EXECUTE_REPORT_FILE_NAME =
  "repair-zjq042-workshop-pick-to-actual-source-cost-execute-report.json";

const SIMPLE_TARGETS = [
  {
    documentNo: "LL20260413006",
    lineId: 1238,
    quantity: "3.000000",
    actualUnitCost: "210.00",
    actualAmount: "630.00",
    currentWrongAmount: "624.99",
  },
  {
    documentNo: "LL20260430002",
    lineId: 1597,
    quantity: "2.000000",
    actualUnitCost: "210.00",
    actualAmount: "420.00",
    currentWrongAmount: "416.66",
  },
] as const;

const SPLIT_TARGET = {
  documentNo: "LL20260503007",
  lineId: 1679,
  quantity: "2.000000",
  currentWrongAmount: "416.66",
  pieces: [
    {
      quantity: "1.000000",
      unitCost: "210.00",
      amount: "210.00",
      sourceUsageId: 21524,
      sourceLogId: 37676,
      expectedBeforeReleasedQty: "1.000000",
    },
    {
      quantity: "1.000000",
      unitCost: "215.00",
      amount: "215.00",
      sourceUsageId: 21525,
      sourceLogId: 40355,
      expectedBeforeReleasedQty: "0.000000",
    },
  ],
} as const;

interface LineContext {
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
}

interface SourceUsageContext {
  lineId: number;
  usageId: number;
  sourceLogId: number;
  sourceDocumentNo: string;
  sourceUnitCost: string | null;
  allocatedQty: string;
  releasedQty: string;
  netQty: string;
  status: string;
}

interface OrderTotals {
  orderId: number;
  lineCount: number;
  totalQty: string;
  totalAmount: string;
}

interface PlannedSimpleUpdate {
  documentNo: string;
  lineId: number;
  quantity: string;
  previousUnitCost: string;
  previousAmount: string;
  actualUnitCost: string;
  actualAmount: string;
  lineAmountDelta: string;
}

interface PlannedSplitPiece {
  quantity: string;
  unitCost: string;
  amount: string;
  sourceUsageId: number;
  sourceLogId: number;
  beforeQty: string;
  afterQty: string;
  targetLineId: number | null;
  targetLogId: number | null;
}

function lineIds(): number[] {
  return [
    ...SIMPLE_TARGETS.map((target) => target.lineId),
    SPLIT_TARGET.lineId,
  ];
}

function placeholders(values: readonly unknown[]): string {
  return values.map(() => "?").join(", ");
}

function money(value: number): string {
  return value.toFixed(2);
}

function qty(value: number): string {
  return value.toFixed(6);
}

function decimalEq(left: string | number | null, right: string): boolean {
  return Number(left ?? Number.NaN).toFixed(2) === Number(right).toFixed(2);
}

function qtyEq(left: string | number | null, right: string | number): boolean {
  return Number(left ?? Number.NaN).toFixed(6) === Number(right).toFixed(6);
}

function simpleTargetByLineId(lineId: number) {
  return SIMPLE_TARGETS.find((target) => target.lineId === lineId) ?? null;
}

function uniqueNumbers(values: readonly number[]): number[] {
  return [...new Set(values)].sort((left, right) => left - right);
}

async function readTargetLines(
  connection: MigrationConnectionLike,
): Promise<LineContext[]> {
  const ids = lineIds();

  return connection.query<LineContext[]>(
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
        DATE_FORMAT(log.occurred_at, '%Y-%m-%d %H:%i:%s') AS occurredAt
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
      WHERE l.id IN (${placeholders(ids)})
      ORDER BY o.biz_date, o.id, l.line_no, l.id
    `,
    ids,
  );
}

async function readSourceUsages(
  connection: MigrationConnectionLike,
): Promise<SourceUsageContext[]> {
  const ids = lineIds();

  return connection.query<SourceUsageContext[]>(
    `
      SELECT
        u.consumer_line_id AS lineId,
        u.id AS usageId,
        u.source_log_id AS sourceLogId,
        source_log.business_document_number AS sourceDocumentNo,
        source_log.unit_cost AS sourceUnitCost,
        u.allocated_qty AS allocatedQty,
        u.released_qty AS releasedQty,
        u.allocated_qty - u.released_qty AS netQty,
        u.status
      FROM inventory_source_usage u
      JOIN inventory_log source_log ON source_log.id = u.source_log_id
      WHERE u.consumer_document_type = 'WorkshopMaterialOrder'
        AND u.consumer_line_id IN (${placeholders(ids)})
      ORDER BY u.consumer_line_id, u.id
    `,
    ids,
  );
}

async function readOrderTotals(
  connection: MigrationConnectionLike,
  orderIds: readonly number[],
): Promise<OrderTotals[]> {
  const uniqueOrderIds = uniqueNumbers(orderIds);
  if (uniqueOrderIds.length === 0) return [];

  return connection.query<OrderTotals[]>(
    `
      SELECT
        order_id AS orderId,
        COUNT(*) AS lineCount,
        COALESCE(SUM(quantity), 0) AS totalQty,
        COALESCE(SUM(amount), 0) AS totalAmount
      FROM workshop_material_order_line
      WHERE order_id IN (${placeholders(uniqueOrderIds)})
      GROUP BY order_id
      ORDER BY order_id
    `,
    uniqueOrderIds,
  );
}

function buildPlannedSimpleUpdates(
  lines: readonly LineContext[],
): PlannedSimpleUpdate[] {
  return lines
    .map((line): PlannedSimpleUpdate | null => {
      const target = simpleTargetByLineId(line.lineId);
      if (!target) return null;

      return {
        documentNo: target.documentNo,
        lineId: target.lineId,
        quantity: target.quantity,
        previousUnitCost: WRONG_UNIT_COST,
        previousAmount: target.currentWrongAmount,
        actualUnitCost: target.actualUnitCost,
        actualAmount: target.actualAmount,
        lineAmountDelta: money(
          Number(target.actualAmount) - Number(line.amount),
        ),
      };
    })
    .filter((update): update is PlannedSimpleUpdate => update !== null);
}

function buildPlannedSplitPieces(
  splitLine: LineContext | null,
): PlannedSplitPiece[] {
  if (!splitLine) return [];

  let runningBeforeQty = Number(splitLine.beforeQty);
  return SPLIT_TARGET.pieces.map((piece) => {
    const afterQty = runningBeforeQty - Number(piece.quantity);
    const plannedPiece = {
      quantity: piece.quantity,
      unitCost: piece.unitCost,
      amount: piece.amount,
      sourceUsageId: piece.sourceUsageId,
      sourceLogId: piece.sourceLogId,
      beforeQty: qty(runningBeforeQty),
      afterQty: qty(afterQty),
      targetLineId: null,
      targetLogId: null,
    };
    runningBeforeQty = afterQty;
    return plannedPiece;
  });
}

function validateSimpleLine(
  line: LineContext,
  sourceUsages: readonly SourceUsageContext[],
): string[] {
  const blockers: string[] = [];
  const target = simpleTargetByLineId(line.lineId);
  if (!target) return blockers;

  if (line.documentNo !== target.documentNo) {
    blockers.push(
      `目标行单据号不匹配: lineId=${line.lineId}, actual=${line.documentNo}, expected=${target.documentNo}`,
    );
  }
  if (!qtyEq(line.quantity, target.quantity)) {
    blockers.push(
      `${target.documentNo}/lineId=${target.lineId} 数量不是 ${target.quantity}: ${line.quantity}`,
    );
  }
  if (
    !decimalEq(line.unitPrice, WRONG_UNIT_COST) &&
    !decimalEq(line.unitPrice, target.actualUnitCost)
  ) {
    blockers.push(
      `${target.documentNo}/lineId=${target.lineId} 单价既不是 ${WRONG_UNIT_COST} 也不是 ${target.actualUnitCost}: ${line.unitPrice}`,
    );
  }
  if (
    !decimalEq(line.amount, target.currentWrongAmount) &&
    !decimalEq(line.amount, target.actualAmount)
  ) {
    blockers.push(
      `${target.documentNo}/lineId=${target.lineId} 金额既不是 ${target.currentWrongAmount} 也不是 ${target.actualAmount}: ${line.amount}`,
    );
  }
  if (!decimalEq(line.outLogUnitCost, target.actualUnitCost)) {
    blockers.push(
      `${target.documentNo}/lineId=${target.lineId} 出库流水单价不是 ${target.actualUnitCost}: ${line.outLogUnitCost ?? "null"}`,
    );
  }
  if (!decimalEq(line.outLogCostAmount, target.actualAmount)) {
    blockers.push(
      `${target.documentNo}/lineId=${target.lineId} 出库流水金额不是 ${target.actualAmount}: ${line.outLogCostAmount ?? "null"}`,
    );
  }

  const activeUsages = sourceUsages.filter(
    (usage) => usage.lineId === line.lineId && Number(usage.netQty) > 0,
  );
  const activeQty = activeUsages.reduce(
    (sum, usage) => sum + Number(usage.netQty),
    0,
  );
  if (!qtyEq(activeQty, target.quantity)) {
    blockers.push(
      `${target.documentNo}/lineId=${target.lineId} 有效来源占用数量不是 ${target.quantity}: ${qty(activeQty)}`,
    );
  }
  const wrongUsages = activeUsages.filter(
    (usage) => !decimalEq(usage.sourceUnitCost, target.actualUnitCost),
  );
  if (wrongUsages.length > 0) {
    blockers.push(
      `${target.documentNo}/lineId=${target.lineId} 存在非 ${target.actualUnitCost} 的有效来源占用: usageIds=${wrongUsages
        .map((usage) => usage.usageId)
        .join(",")}`,
    );
  }

  return blockers;
}

function validateSplitLine(
  line: LineContext | null,
  sourceUsages: readonly SourceUsageContext[],
  plannedPieces: readonly PlannedSplitPiece[],
): string[] {
  const blockers: string[] = [];

  if (!line) {
    return [
      `未找到拆分目标行: ${SPLIT_TARGET.documentNo}/lineId=${SPLIT_TARGET.lineId}`,
    ];
  }

  if (line.documentNo !== SPLIT_TARGET.documentNo) {
    blockers.push(
      `拆分目标行单据号不匹配: actual=${line.documentNo}, expected=${SPLIT_TARGET.documentNo}`,
    );
  }
  if (!qtyEq(line.quantity, SPLIT_TARGET.quantity)) {
    blockers.push(
      `${SPLIT_TARGET.documentNo}/lineId=${SPLIT_TARGET.lineId} 数量不是 ${SPLIT_TARGET.quantity}: ${line.quantity}`,
    );
  }
  if (
    !decimalEq(line.unitPrice, WRONG_UNIT_COST) &&
    !decimalEq(line.unitPrice, SPLIT_TARGET.pieces[0].unitCost)
  ) {
    blockers.push(
      `${SPLIT_TARGET.documentNo}/lineId=${SPLIT_TARGET.lineId} 单价既不是 ${WRONG_UNIT_COST} 也不是拆分后第一段 ${SPLIT_TARGET.pieces[0].unitCost}: ${line.unitPrice}`,
    );
  }
  if (
    !decimalEq(line.amount, SPLIT_TARGET.currentWrongAmount) &&
    !decimalEq(line.amount, SPLIT_TARGET.pieces[0].amount)
  ) {
    blockers.push(
      `${SPLIT_TARGET.documentNo}/lineId=${SPLIT_TARGET.lineId} 金额既不是 ${SPLIT_TARGET.currentWrongAmount} 也不是拆分后第一段 ${SPLIT_TARGET.pieces[0].amount}: ${line.amount}`,
    );
  }
  if (!decimalEq(line.outLogUnitCost, "212.50")) {
    blockers.push(
      `${SPLIT_TARGET.documentNo}/lineId=${SPLIT_TARGET.lineId} 拆分前出库流水单价不是 212.50: ${line.outLogUnitCost ?? "null"}`,
    );
  }
  if (!decimalEq(line.outLogCostAmount, "425.00")) {
    blockers.push(
      `${SPLIT_TARGET.documentNo}/lineId=${SPLIT_TARGET.lineId} 拆分前出库流水金额不是 425.00: ${line.outLogCostAmount ?? "null"}`,
    );
  }
  if (!qtyEq(line.afterQty, plannedPieces.at(-1)?.afterQty ?? Number.NaN)) {
    blockers.push(
      `${SPLIT_TARGET.documentNo}/lineId=${SPLIT_TARGET.lineId} 拆分后 after_qty 与原流水不一致。`,
    );
  }

  for (const piece of SPLIT_TARGET.pieces) {
    const usage = sourceUsages.find(
      (candidate) => candidate.usageId === piece.sourceUsageId,
    );
    if (!usage) {
      blockers.push(`缺少拆分来源占用: usageId=${piece.sourceUsageId}`);
      continue;
    }
    if (usage.lineId !== SPLIT_TARGET.lineId) {
      blockers.push(
        `拆分来源占用 ${piece.sourceUsageId} 不在原始行 ${SPLIT_TARGET.lineId}: actualLineId=${usage.lineId}`,
      );
    }
    if (usage.sourceLogId !== piece.sourceLogId) {
      blockers.push(
        `拆分来源占用 ${piece.sourceUsageId} 来源流水不匹配: actual=${usage.sourceLogId}, expected=${piece.sourceLogId}`,
      );
    }
    if (!decimalEq(usage.sourceUnitCost, piece.unitCost)) {
      blockers.push(
        `拆分来源占用 ${piece.sourceUsageId} 来源单价不是 ${piece.unitCost}: ${usage.sourceUnitCost ?? "null"}`,
      );
    }
    if (!qtyEq(usage.allocatedQty, piece.quantity)) {
      blockers.push(
        `拆分来源占用 ${piece.sourceUsageId} 分配数量不是 ${piece.quantity}: ${usage.allocatedQty}`,
      );
    }
    if (!qtyEq(usage.releasedQty, piece.expectedBeforeReleasedQty)) {
      blockers.push(
        `拆分来源占用 ${piece.sourceUsageId} 当前 released_qty 不是 ${piece.expectedBeforeReleasedQty}: ${usage.releasedQty}`,
      );
    }
  }

  return blockers;
}

function validateContext(
  lines: readonly LineContext[],
  sourceUsages: readonly SourceUsageContext[],
  plannedSplitPieces: readonly PlannedSplitPiece[],
) {
  const blockers: string[] = [];

  if (lines.length !== lineIds().length) {
    blockers.push(`目标行数量不是 ${lineIds().length}: actual=${lines.length}`);
  }

  const lineById = new Map(lines.map((line) => [line.lineId, line]));
  for (const targetLineId of lineIds()) {
    if (!lineById.has(targetLineId)) {
      blockers.push(`未找到目标行: lineId=${targetLineId}`);
    }
  }

  for (const line of lines) {
    if (line.orderType !== "PICK") {
      blockers.push(
        `${line.documentNo}/lineId=${line.lineId} 不是车间领料 PICK: ${line.orderType}`,
      );
    }
    if (line.lifecycleStatus !== "EFFECTIVE") {
      blockers.push(
        `${line.documentNo}/lineId=${line.lineId} lifecycle_status 不是 EFFECTIVE: ${line.lifecycleStatus}`,
      );
    }
    if (line.inventoryEffectStatus !== "POSTED") {
      blockers.push(
        `${line.documentNo}/lineId=${line.lineId} inventory_effect_status 不是 POSTED: ${line.inventoryEffectStatus}`,
      );
    }
    if (line.materialCode !== MATERIAL_CODE) {
      blockers.push(
        `${line.documentNo}/lineId=${line.lineId} 物料编码不是 ${MATERIAL_CODE}: ${line.materialCode}`,
      );
    }
    if (line.materialName !== MATERIAL_NAME) {
      blockers.push(
        `${line.documentNo}/lineId=${line.lineId} 物料名称不是 ${MATERIAL_NAME}: ${line.materialName}`,
      );
    }
    blockers.push(...validateSimpleLine(line, sourceUsages));
  }

  blockers.push(
    ...validateSplitLine(
      lineById.get(SPLIT_TARGET.lineId) ?? null,
      sourceUsages,
      plannedSplitPieces,
    ),
  );

  return blockers;
}

async function updateSimpleLine(
  connection: MigrationConnectionLike,
  line: LineContext,
  target: (typeof SIMPLE_TARGETS)[number],
) {
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
      target.actualUnitCost,
      target.actualAmount,
      target.actualUnitCost,
      target.actualAmount,
      UPDATED_BY,
      line.lineId,
    ],
  );
}

async function insertSplitLine(
  connection: MigrationConnectionLike,
  context: LineContext,
  lineNo: number,
  piece: PlannedSplitPiece,
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

async function insertSplitOutLog(
  connection: MigrationConnectionLike,
  context: LineContext,
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
      `按业务确认将 ${SPLIT_TARGET.documentNo}/${MATERIAL_CODE} 拆成实际库存价格层。`,
    ],
  );

  const insertId = Number(result.insertId ?? 0);
  if (!Number.isFinite(insertId) || insertId <= 0) {
    throw new Error("新增拆分库存流水未返回 insertId。");
  }
  return insertId;
}

async function updateOrderTotals(
  connection: MigrationConnectionLike,
  orderIds: readonly number[],
) {
  for (const orderId of uniqueNumbers(orderIds)) {
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
      [orderId, orderId, UPDATED_BY, orderId],
    );
  }
}

async function executeRepair(
  connection: MigrationConnectionLike,
  lines: readonly LineContext[],
  plannedSplitPieces: readonly PlannedSplitPiece[],
) {
  await connection.beginTransaction();

  try {
    const lineById = new Map(lines.map((line) => [line.lineId, line]));
    const simpleUpdates: PlannedSimpleUpdate[] = [];

    for (const target of SIMPLE_TARGETS) {
      const line = lineById.get(target.lineId);
      if (!line) continue;
      await updateSimpleLine(connection, line, target);
      simpleUpdates.push({
        documentNo: target.documentNo,
        lineId: target.lineId,
        quantity: target.quantity,
        previousUnitCost: WRONG_UNIT_COST,
        previousAmount: target.currentWrongAmount,
        actualUnitCost: target.actualUnitCost,
        actualAmount: target.actualAmount,
        lineAmountDelta: money(
          Number(target.actualAmount) - Number(line.amount),
        ),
      });
    }

    const splitLine = lineById.get(SPLIT_TARGET.lineId);
    if (!splitLine) {
      throw new Error("执行时未找到拆分目标行。");
    }

    await connection.query(
      `
        UPDATE workshop_material_order_line
        SET line_no = line_no + 1
        WHERE order_id = ?
          AND line_no > ?
        ORDER BY line_no DESC
      `,
      [splitLine.orderId, splitLine.lineNo],
    );

    const firstPiece = plannedSplitPieces[0];
    const secondPiece = plannedSplitPieces[1];

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
        splitLine.lineId,
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
        `按业务确认将 ${SPLIT_TARGET.documentNo}/${MATERIAL_CODE} 拆成实际库存价格层，保留第一段。`,
        splitLine.outLogId,
      ],
    );

    await connection.query(
      `
        UPDATE inventory_source_usage
        SET
          released_qty = 0,
          status = 'ALLOCATED',
          updated_by = ?,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `,
      [UPDATED_BY, firstPiece.sourceUsageId],
    );

    const secondLineId = await insertSplitLine(
      connection,
      splitLine,
      splitLine.lineNo + 1,
      secondPiece,
    );
    const secondLogId = await insertSplitOutLog(
      connection,
      splitLine,
      secondLineId,
      secondPiece,
    );

    await connection.query(
      `
        UPDATE inventory_source_usage
        SET
          consumer_line_id = ?,
          updated_by = ?,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `,
      [secondLineId, UPDATED_BY, secondPiece.sourceUsageId],
    );

    const orderIds = uniqueNumbers(lines.map((line) => line.orderId));
    await updateOrderTotals(connection, orderIds);

    await connection.commit();

    return {
      simpleUpdates,
      split: {
        originalLineId: splitLine.lineId,
        originalOutLogId: splitLine.outLogId,
        executedPieces: [
          {
            ...firstPiece,
            targetLineId: splitLine.lineId,
            targetLogId: splitLine.outLogId,
          },
          {
            ...secondPiece,
            targetLineId: secondLineId,
            targetLogId: secondLogId,
          },
        ],
      },
      updatedOrderIds: orderIds,
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
      const before = await readTargetLines(connection);
      const beforeSourceUsages = await readSourceUsages(connection);
      const beforeOrderTotals = await readOrderTotals(
        connection,
        before.map((line) => line.orderId),
      );
      const splitLine =
        before.find((line) => line.lineId === SPLIT_TARGET.lineId) ?? null;
      const plannedSimpleUpdates = buildPlannedSimpleUpdates(before);
      const plannedSplitPieces = buildPlannedSplitPieces(splitLine);
      const blockers = validateContext(
        before,
        beforeSourceUsages,
        plannedSplitPieces,
      );

      if (execute && blockers.length > 0) {
        throw new Error(`Refusing to execute: ${blockers.join("; ")}`);
      }

      const executeResult = execute
        ? await executeRepair(connection, before, plannedSplitPieces)
        : null;
      const after = execute ? await readTargetLines(connection) : null;
      const afterSourceUsages = execute
        ? await readSourceUsages(connection)
        : null;
      const afterOrderTotals =
        execute && after
          ? await readOrderTotals(
              connection,
              after.map((line) => line.orderId),
            )
          : null;

      const report = {
        generatedAt: new Date().toISOString(),
        mode: execute ? "execute" : "dry-run",
        targetDatabase,
        materialCode: MATERIAL_CODE,
        materialName: MATERIAL_NAME,
        confirmedBusinessFact:
          "业务已确认：zjq042 / 309胶 这 3 条车间领料原单据填写错误，应按照当前实际库存来源价格层领料。",
        updatedBy: UPDATED_BY,
        simpleTargets: SIMPLE_TARGETS,
        splitTarget: SPLIT_TARGET,
        plannedSimpleUpdates,
        plannedSplitPieces,
        blockers,
        before,
        beforeOrderTotals,
        beforeSourceUsages,
        executeResult,
        after,
        afterOrderTotals,
        afterSourceUsages,
      };

      writeStableReport(reportPath, report);
      console.log(
        `Repair ${MATERIAL_CODE} workshop pick to actual source cost ${execute ? "execute" : "dry-run"} completed. blockers=${blockers.length}, report=${reportPath}`,
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
