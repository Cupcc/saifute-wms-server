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

const UPDATED_BY = "manual-repair-workshop-instruction-price-splits-20260518";
const DRY_RUN_REPORT_FILE_NAME =
  "repair-workshop-instruction-price-splits-dry-run-report.json";
const EXECUTE_REPORT_FILE_NAME =
  "repair-workshop-instruction-price-splits-execute-report.json";

interface TargetLineContext {
  orderId: number;
  documentNo: string;
  orderType: "PICK" | "SCRAP";
  bizDate: string;
  lifecycleStatus: string;
  inventoryEffectStatus: string;
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
  expectedUnitCost: string;
  expectedCostAmount: string;
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
  operationType: "PICK_OUT" | "SCRAP_OUT";
  businessModule: string;
  businessDocumentType: string;
  changeQty: string;
  beforeQty: string;
  afterQty: string;
  outLogUnitCost: string | null;
  outLogCostAmount: string | null;
  operatorId: string | null;
  occurredAt: string;
  instruction: string | null;
}

interface ActiveSourceUsage {
  lineId: number;
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

interface PlannedSplit {
  orderId: number;
  documentNo: string;
  orderType: "PICK" | "SCRAP";
  lineId: number;
  lineNo: number;
  outLogId: number;
  materialCode: string;
  materialName: string;
  originalQuantity: string;
  originalUnitPrice: string;
  originalAmount: string;
  originalExpectedUnitCost: string;
  originalExpectedAmount: string;
  instruction: string;
  plannedPieces: PlannedSplitPiece[];
}

interface BlockedSplit {
  documentNo: string;
  orderType: "PICK" | "SCRAP";
  lineId: number;
  materialCode: string;
  materialName: string;
  quantity: string;
  expectedUnitCost: string;
  expectedCostAmount: string;
  instruction: string | null;
  instructionPieces: InstructionPiece[];
  activeSourceUsages: ActiveSourceUsage[];
  reason: string;
  detail: string;
}

interface OrderTotals {
  orderId: number;
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

function decimalEq(
  left: string | number | null,
  right: string | number,
): boolean {
  return Number(left ?? Number.NaN).toFixed(2) === Number(right).toFixed(2);
}

function qtyEq(left: string | number | null, right: string | number): boolean {
  return Number(left ?? Number.NaN).toFixed(6) === Number(right).toFixed(6);
}

function placeholders(values: readonly unknown[]): string {
  return values.map(() => "?").join(", ");
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

function mapQtyByUnitCost(
  items: readonly { unitCost: string; quantity: string }[],
) {
  const result = new Map<string, number>();
  for (const item of items) {
    result.set(
      item.unitCost,
      (result.get(item.unitCost) ?? 0) + toNumber(item.quantity),
    );
  }
  return result;
}

function mapUsageQtyByUnitCost(usages: readonly ActiveSourceUsage[]) {
  const result = new Map<string, number>();
  for (const usage of usages) {
    if (usage.sourceUnitCost === null) continue;
    const unitCost = money(toNumber(usage.sourceUnitCost));
    result.set(unitCost, (result.get(unitCost) ?? 0) + toNumber(usage.netQty));
  }
  return result;
}

function formatQtyMap(
  map: ReadonlyMap<string, number>,
): Record<string, string> {
  return Object.fromEntries(
    [...map.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([unitCost, quantity]) => [unitCost, qty(quantity)]),
  );
}

async function readTargetLines(
  connection: MigrationConnectionLike,
): Promise<TargetLineContext[]> {
  return connection.query<TargetLineContext[]>(
    `
      SELECT
        o.id AS orderId,
        o.document_no AS documentNo,
        o.order_type AS orderType,
        DATE_FORMAT(o.biz_date, '%Y-%m-%d') AS bizDate,
        o.lifecycle_status AS lifecycleStatus,
        o.inventory_effect_status AS inventoryEffectStatus,
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
        COALESCE(NULLIF(l.cost_unit_price, 0), NULLIF(l.unit_price, 0)) AS expectedUnitCost,
        COALESCE(
          NULLIF(l.cost_amount, 0),
          NULLIF(l.amount, 0),
          ROUND(l.quantity * COALESCE(NULLIF(l.cost_unit_price, 0), NULLIF(l.unit_price, 0)), 2)
        ) AS expectedCostAmount,
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
        DATE_FORMAT(log.occurred_at, '%Y-%m-%d %H:%i:%s') AS occurredAt,
        JSON_UNQUOTE(JSON_EXTRACT(payload.payload_json, '$.instruction')) AS instruction
      FROM workshop_material_order o
      JOIN workshop_material_order_line l ON l.order_id = o.id
      JOIN inventory_log log
        ON log.business_document_type = 'WorkshopMaterialOrder'
       AND log.business_document_id = o.id
       AND log.business_document_line_id = l.id
       AND log.direction = 'OUT'
       AND log.operation_type IN ('PICK_OUT', 'SCRAP_OUT')
       AND NOT EXISTS (
         SELECT 1
         FROM inventory_log rev
         WHERE rev.reversal_of_log_id = log.id
       )
      JOIN migration_staging.archived_field_payload payload
        ON payload.target_table = 'workshop_material_order_line'
       AND payload.target_id = l.id
       AND payload.payload_kind = 'legacy-unmapped-fields'
      WHERE o.order_type IN ('PICK', 'SCRAP')
        AND o.lifecycle_status = 'EFFECTIVE'
        AND o.inventory_effect_status = 'POSTED'
        AND JSON_UNQUOTE(JSON_EXTRACT(payload.payload_json, '$.instruction')) IS NOT NULL
      ORDER BY o.biz_date ASC, o.id ASC, l.line_no ASC, l.id ASC
    `,
  );
}

async function readActiveSourceUsages(
  connection: MigrationConnectionLike,
  lineIds: readonly number[],
): Promise<ActiveSourceUsage[]> {
  if (lineIds.length === 0) return [];

  return connection.query<ActiveSourceUsage[]>(
    `
      SELECT
        u.consumer_line_id AS lineId,
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
        AND u.consumer_line_id IN (${placeholders(lineIds)})
        AND u.allocated_qty > u.released_qty
      ORDER BY u.consumer_line_id ASC, u.id ASC
    `,
    lineIds,
  );
}

async function readOrderTotals(
  connection: MigrationConnectionLike,
  orderIds: readonly number[],
): Promise<OrderTotals[]> {
  if (orderIds.length === 0) return [];

  return connection.query<OrderTotals[]>(
    `
      SELECT
        order_id AS orderId,
        COUNT(*) AS lineCount,
        COALESCE(SUM(quantity), 0) AS totalQty,
        COALESCE(SUM(amount), 0) AS totalAmount
      FROM workshop_material_order_line
      WHERE order_id IN (${placeholders(orderIds)})
      GROUP BY order_id
      ORDER BY order_id ASC
    `,
    orderIds,
  );
}

function buildPlans(
  contexts: readonly TargetLineContext[],
  sourceUsages: readonly ActiveSourceUsage[],
) {
  const usagesByLineId = new Map<number, ActiveSourceUsage[]>();
  for (const usage of sourceUsages) {
    usagesByLineId.set(usage.lineId, [
      ...(usagesByLineId.get(usage.lineId) ?? []),
      usage,
    ]);
  }

  const repairs: PlannedSplit[] = [];
  const blocked: BlockedSplit[] = [];
  const skipped: Array<{
    documentNo: string;
    lineId: number;
    materialCode: string;
    reason: string;
  }> = [];

  for (const context of contexts) {
    const instructionPieces = parseInstruction(context.instruction);
    const lineUsages = usagesByLineId.get(context.lineId) ?? [];
    const instructionQty = instructionPieces.reduce(
      (sum, piece) => sum + toNumber(piece.quantity),
      0,
    );
    const instructionAmount = instructionPieces.reduce(
      (sum, piece) => sum + toNumber(piece.amount),
      0,
    );
    if (instructionPieces.length < 2) {
      skipped.push({
        documentNo: context.documentNo,
        lineId: context.lineId,
        materialCode: context.materialCode,
        reason: "not-average-instruction-price",
      });
      continue;
    }

    if (
      !qtyEq(context.quantity, instructionQty) ||
      !decimalEq(context.expectedCostAmount, instructionAmount)
    ) {
      skipped.push({
        documentNo: context.documentNo,
        lineId: context.lineId,
        materialCode: context.materialCode,
        reason: "instruction-no-longer-matches-current-line",
      });
      continue;
    }

    const hasAveragePrice = !instructionPieces.every((piece) =>
      decimalEq(piece.unitCost, context.expectedUnitCost),
    );

    if (!hasAveragePrice) {
      skipped.push({
        documentNo: context.documentNo,
        lineId: context.lineId,
        materialCode: context.materialCode,
        reason: "instruction-price-already-current-line-price",
      });
      continue;
    }

    const blockerBase = {
      documentNo: context.documentNo,
      orderType: context.orderType,
      lineId: context.lineId,
      materialCode: context.materialCode,
      materialName: context.materialName,
      quantity: context.quantity,
      expectedUnitCost: money(toNumber(context.expectedUnitCost)),
      expectedCostAmount: money(toNumber(context.expectedCostAmount)),
      instruction: context.instruction,
      instructionPieces,
      activeSourceUsages: lineUsages,
    };

    const nullCostUsage = lineUsages.find(
      (usage) => usage.sourceUnitCost === null,
    );
    if (nullCostUsage) {
      blocked.push({
        ...blockerBase,
        reason: "source-unit-cost-missing",
        detail: `来源占用 ${nullCostUsage.usageId} 缺少 source unit_cost。`,
      });
      continue;
    }

    const instructionQtyByCost = mapQtyByUnitCost(instructionPieces);
    const usageQtyByCost = mapUsageQtyByUnitCost(lineUsages);
    const sourceMatchesInstruction =
      JSON.stringify(formatQtyMap(instructionQtyByCost)) ===
      JSON.stringify(formatQtyMap(usageQtyByCost));

    if (!sourceMatchesInstruction) {
      blocked.push({
        ...blockerBase,
        reason: "instruction-source-layer-mismatch",
        detail: `说明字段价层 ${JSON.stringify(formatQtyMap(instructionQtyByCost))} 与当前来源价层 ${JSON.stringify(formatQtyMap(usageQtyByCost))} 不一致。`,
      });
      continue;
    }

    let runningBeforeQty = toNumber(context.beforeQty);
    const plannedPieces = instructionPieces.map((piece) => {
      const afterQty = runningBeforeQty - toNumber(piece.quantity);
      const matchingUsages = lineUsages.filter((usage) =>
        decimalEq(usage.sourceUnitCost, piece.unitCost),
      );
      const plannedPiece: PlannedSplitPiece = {
        ...piece,
        sourceUsageIds: matchingUsages.map((usage) => usage.usageId),
        sourceLogIds: matchingUsages.map((usage) => usage.sourceLogId),
        targetLineId: null,
        targetLogId: null,
        beforeQty: qty(runningBeforeQty),
        afterQty: qty(afterQty),
      };
      runningBeforeQty = afterQty;
      return plannedPiece;
    });

    if (!qtyEq(runningBeforeQty, context.afterQty)) {
      blocked.push({
        ...blockerBase,
        reason: "inventory-log-after-qty-mismatch",
        detail: `拆分后 after_qty ${qty(runningBeforeQty)} 与原流水 after_qty ${context.afterQty} 不一致。`,
      });
      continue;
    }

    repairs.push({
      orderId: context.orderId,
      documentNo: context.documentNo,
      orderType: context.orderType,
      lineId: context.lineId,
      lineNo: context.lineNo,
      outLogId: context.outLogId,
      materialCode: context.materialCode,
      materialName: context.materialName,
      originalQuantity: context.quantity,
      originalUnitPrice: context.unitPrice,
      originalAmount: context.amount,
      originalExpectedUnitCost: money(toNumber(context.expectedUnitCost)),
      originalExpectedAmount: money(toNumber(context.expectedCostAmount)),
      instruction: context.instruction ?? "",
      plannedPieces,
    });
  }

  return { repairs, blocked, skipped };
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
      `按旧系统说明字段拆分 ${context.documentNo}/${context.materialCode} 平均价价格层。`,
    ],
  );

  const insertId = Number(result.insertId ?? 0);
  if (!Number.isFinite(insertId) || insertId <= 0) {
    throw new Error("新增拆分库存流水未返回 insertId。");
  }
  return insertId;
}

async function executeRepairs(
  connection: MigrationConnectionLike,
  contexts: readonly TargetLineContext[],
  repairs: readonly PlannedSplit[],
) {
  const contextByLineId = new Map(
    contexts.map((context) => [context.lineId, context]),
  );
  const sortedRepairs = [...repairs].sort((left, right) => {
    if (left.orderId !== right.orderId) return right.orderId - left.orderId;
    return right.lineNo - left.lineNo;
  });
  const executed: PlannedSplit[] = [];

  await connection.beginTransaction();
  try {
    for (const repair of sortedRepairs) {
      const context = contextByLineId.get(repair.lineId);
      if (!context)
        throw new Error(`Missing context for line ${repair.lineId}.`);

      const extraLineCount = repair.plannedPieces.length - 1;
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

      const firstPiece = repair.plannedPieces[0];
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
          `按旧系统说明字段拆分 ${context.documentNo}/${context.materialCode} 平均价价格层，保留第一段。`,
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

      for (let index = 1; index < repair.plannedPieces.length; index += 1) {
        const piece = repair.plannedPieces[index];
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
              WHERE id IN (${placeholders(piece.sourceUsageIds)})
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

      executed.push({
        ...repair,
        plannedPieces: executedPieces,
      });
    }

    await connection.commit();
    return executed;
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
      const contexts = await readTargetLines(connection);
      const sourceUsages = await readActiveSourceUsages(
        connection,
        contexts.map((context) => context.lineId),
      );
      const plan = buildPlans(contexts, sourceUsages);
      const orderIds = [
        ...new Set(plan.repairs.map((repair) => repair.orderId)),
      ];
      const beforeTotals = await readOrderTotals(connection, orderIds);
      const executedRepairs =
        execute && plan.repairs.length > 0
          ? await executeRepairs(connection, contexts, plan.repairs)
          : [];
      const afterTotals = execute
        ? await readOrderTotals(connection, orderIds)
        : [];

      const report = {
        generatedAt: new Date().toISOString(),
        mode: execute ? "execute" : "dry-run",
        targetDatabase,
        updatedBy: UPDATED_BY,
        scannedInstructionLineCount: contexts.length,
        plannedRepairCount: plan.repairs.length,
        blockedAverageSplitCount: plan.blocked.length,
        skippedNonAverageInstructionCount: plan.skipped.length,
        beforeTotals,
        afterTotals,
        repairs: plan.repairs,
        executedRepairs,
        blocked: plan.blocked,
        skipped: plan.skipped,
      };

      writeStableReport(reportPath, report);
      console.log(
        `Workshop instruction price split ${execute ? "execute" : "dry-run"} completed. planned=${plan.repairs.length}, blocked=${plan.blocked.length}, report=${reportPath}`,
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
