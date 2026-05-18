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

const UPDATED_BY = "manual-repair-workshop-selected-price-layer-drift-20260517";
const DRY_RUN_REPORT_FILE_NAME =
  "repair-workshop-selected-price-layer-drift-dry-run-report.json";
const EXECUTE_REPORT_FILE_NAME =
  "repair-workshop-selected-price-layer-drift-execute-report.json";

interface UsageContextRow {
  orderId: number;
  documentNo: string;
  orderType: "PICK" | "SCRAP";
  bizDate: string;
  lineId: number;
  materialId: number;
  stockScopeId: number;
  materialCode: string;
  materialName: string;
  quantity: string;
  expectedUnitCost: string;
  expectedCostAmount: string;
  outLogId: number;
  outLogUnitCost: string | null;
  outLogCostAmount: string | null;
  usageId: number;
  sourceLogId: number;
  allocatedQty: string;
  releasedQty: string;
  status: string;
  sourceUnitCost: string | null;
  sourceDocumentNo: string;
}

interface SourceRow {
  sourceLogId: number;
  materialId: number;
  stockScopeId: number;
  unitCost: string;
  bizDate: string;
  sourceDocumentNo: string;
  currentAvailableQty: string;
}

interface UsagePiece {
  usageId: number;
  sourceLogId: number;
  sourceUnitCost: string | null;
  sourceDocumentNo: string;
  allocatedQty: number;
  releasedQty: number;
  netQty: number;
}

interface LineContext {
  orderId: number;
  documentNo: string;
  orderType: "PICK" | "SCRAP";
  bizDate: string;
  lineId: number;
  materialId: number;
  stockScopeId: number;
  materialCode: string;
  materialName: string;
  quantity: number;
  expectedUnitCost: string;
  expectedCostAmount: string;
  outLogId: number;
  outLogUnitCost: string | null;
  outLogCostAmount: string | null;
  wrongUsages: UsagePiece[];
  matchingUsages: UsagePiece[];
}

interface AllocationPiece {
  sourceLogId: number;
  sourceDocumentNo: string;
  qty: number;
}

interface PlannedRepair {
  orderId: number;
  documentNo: string;
  orderType: "PICK" | "SCRAP";
  lineId: number;
  outLogId: number;
  materialId: number;
  materialCode: string;
  materialName: string;
  quantity: string;
  expectedUnitCost: string;
  expectedCostAmount: string;
  wrongNetQty: string;
  releasedUsageIds: number[];
  allocations: AllocationPiece[];
}

interface BlockedRepair {
  documentNo: string;
  orderType: "PICK" | "SCRAP";
  lineId: number;
  materialId: number;
  materialCode: string;
  materialName: string;
  quantity: string;
  expectedUnitCost: string;
  expectedCostAmount: string;
  wrongNetQty: string;
  missingQty: string;
  reason: string;
}

function toNumber(value: string | number | null): number {
  if (value === null) return 0;
  return Number(value);
}

function qty(value: number): string {
  return value.toFixed(6);
}

function decimalEq(left: string | null, right: string): boolean {
  return Number(left ?? Number.NaN).toFixed(2) === Number(right).toFixed(2);
}

function sourceKey(params: {
  materialId: number;
  stockScopeId: number;
  unitCost: string;
}) {
  return `${params.materialId}:${params.stockScopeId}:${Number(params.unitCost).toFixed(2)}`;
}

async function readUsageContexts(
  connection: MigrationConnectionLike,
): Promise<UsageContextRow[]> {
  return connection.query<UsageContextRow[]>(
    `
      SELECT
        o.id AS orderId,
        o.document_no AS documentNo,
        o.order_type AS orderType,
        DATE_FORMAT(o.biz_date, '%Y-%m-%d') AS bizDate,
        l.id AS lineId,
        l.material_id AS materialId,
        log.stock_scope_id AS stockScopeId,
        l.material_code_snapshot AS materialCode,
        l.material_name_snapshot AS materialName,
        l.quantity,
        COALESCE(NULLIF(l.cost_unit_price, 0), NULLIF(l.unit_price, 0)) AS expectedUnitCost,
        COALESCE(
          NULLIF(l.cost_amount, 0),
          NULLIF(l.amount, 0),
          ROUND(l.quantity * COALESCE(NULLIF(l.cost_unit_price, 0), NULLIF(l.unit_price, 0)), 2)
        ) AS expectedCostAmount,
        log.id AS outLogId,
        log.unit_cost AS outLogUnitCost,
        log.cost_amount AS outLogCostAmount,
        u.id AS usageId,
        u.source_log_id AS sourceLogId,
        u.allocated_qty AS allocatedQty,
        u.released_qty AS releasedQty,
        u.status,
        source_log.unit_cost AS sourceUnitCost,
        source_log.business_document_number AS sourceDocumentNo
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
      JOIN inventory_source_usage u
        ON u.consumer_document_type = 'WorkshopMaterialOrder'
       AND u.consumer_document_id = o.id
       AND u.consumer_line_id = l.id
      JOIN inventory_log source_log ON source_log.id = u.source_log_id
      WHERE o.order_type IN ('PICK', 'SCRAP')
        AND o.lifecycle_status = 'EFFECTIVE'
        AND o.inventory_effect_status = 'POSTED'
        AND COALESCE(NULLIF(l.cost_unit_price, 0), NULLIF(l.unit_price, 0)) IS NOT NULL
      ORDER BY o.biz_date ASC, o.id ASC, l.id ASC, u.id ASC
    `,
  );
}

async function readSources(
  connection: MigrationConnectionLike,
): Promise<SourceRow[]> {
  return connection.query<SourceRow[]>(
    `
      SELECT
        source_log.id AS sourceLogId,
        source_log.material_id AS materialId,
        source_log.stock_scope_id AS stockScopeId,
        source_log.unit_cost AS unitCost,
        DATE_FORMAT(source_log.biz_date, '%Y-%m-%d') AS bizDate,
        source_log.business_document_number AS sourceDocumentNo,
        source_log.change_qty
          - COALESCE(SUM(u.allocated_qty - u.released_qty), 0) AS currentAvailableQty
      FROM inventory_log source_log
      LEFT JOIN inventory_source_usage u ON u.source_log_id = source_log.id
      WHERE source_log.direction = 'IN'
        AND source_log.unit_cost IS NOT NULL
        AND source_log.reversal_of_log_id IS NULL
        AND NOT EXISTS (
          SELECT 1
          FROM inventory_log rev
          WHERE rev.reversal_of_log_id = source_log.id
        )
      GROUP BY source_log.id
      ORDER BY source_log.biz_date ASC, source_log.id ASC
    `,
  );
}

function buildLineContexts(rows: readonly UsageContextRow[]): LineContext[] {
  const lines = new Map<number, LineContext>();

  for (const row of rows) {
    const existing = lines.get(row.lineId);
    const line =
      existing ??
      ({
        orderId: row.orderId,
        documentNo: row.documentNo,
        orderType: row.orderType,
        bizDate: row.bizDate,
        lineId: row.lineId,
        materialId: row.materialId,
        stockScopeId: row.stockScopeId,
        materialCode: row.materialCode,
        materialName: row.materialName,
        quantity: toNumber(row.quantity),
        expectedUnitCost: Number(row.expectedUnitCost).toFixed(2),
        expectedCostAmount: Number(row.expectedCostAmount).toFixed(2),
        outLogId: row.outLogId,
        outLogUnitCost: row.outLogUnitCost,
        outLogCostAmount: row.outLogCostAmount,
        wrongUsages: [],
        matchingUsages: [],
      } satisfies LineContext);

    const piece: UsagePiece = {
      usageId: row.usageId,
      sourceLogId: row.sourceLogId,
      sourceUnitCost: row.sourceUnitCost,
      sourceDocumentNo: row.sourceDocumentNo,
      allocatedQty: toNumber(row.allocatedQty),
      releasedQty: toNumber(row.releasedQty),
      netQty: Math.max(
        0,
        toNumber(row.allocatedQty) - toNumber(row.releasedQty),
      ),
    };

    if (piece.netQty > 0) {
      if (decimalEq(piece.sourceUnitCost, line.expectedUnitCost)) {
        line.matchingUsages.push(piece);
      } else {
        line.wrongUsages.push(piece);
      }
    }

    lines.set(row.lineId, line);
  }

  return [...lines.values()].filter((line) => {
    return (
      line.wrongUsages.length > 0 ||
      !decimalEq(line.outLogUnitCost, line.expectedUnitCost) ||
      !decimalEq(line.outLogCostAmount, line.expectedCostAmount)
    );
  });
}

function planRepairs(
  lines: readonly LineContext[],
  sources: readonly SourceRow[],
) {
  const releaseBySource = new Map<number, number>();
  for (const line of lines) {
    for (const usage of line.wrongUsages) {
      releaseBySource.set(
        usage.sourceLogId,
        (releaseBySource.get(usage.sourceLogId) ?? 0) + usage.netQty,
      );
    }
  }

  const availabilityBySource = new Map<number, number>();
  const sourcesByLayer = new Map<string, SourceRow[]>();
  for (const source of sources) {
    availabilityBySource.set(
      source.sourceLogId,
      toNumber(source.currentAvailableQty) +
        (releaseBySource.get(source.sourceLogId) ?? 0),
    );
    const key = sourceKey(source);
    sourcesByLayer.set(key, [...(sourcesByLayer.get(key) ?? []), source]);
  }

  const repairs: PlannedRepair[] = [];
  const blocked: BlockedRepair[] = [];

  for (const line of lines) {
    const wrongNetQty = line.wrongUsages.reduce(
      (sum, usage) => sum + usage.netQty,
      0,
    );

    if (wrongNetQty <= 0) {
      blocked.push({
        documentNo: line.documentNo,
        orderType: line.orderType,
        lineId: line.lineId,
        materialId: line.materialId,
        materialCode: line.materialCode,
        materialName: line.materialName,
        quantity: qty(line.quantity),
        expectedUnitCost: line.expectedUnitCost,
        expectedCostAmount: line.expectedCostAmount,
        wrongNetQty: qty(0),
        missingQty: qty(0),
        reason: "log-only-mismatch",
      });
      continue;
    }

    const targetSources =
      sourcesByLayer.get(
        sourceKey({
          materialId: line.materialId,
          stockScopeId: line.stockScopeId,
          unitCost: line.expectedUnitCost,
        }),
      ) ?? [];
    let remaining = wrongNetQty;
    const allocations: AllocationPiece[] = [];

    for (const source of targetSources) {
      if (remaining <= 0) break;
      const available = availabilityBySource.get(source.sourceLogId) ?? 0;
      if (available <= 0) continue;
      const allocated = Math.min(available, remaining);
      allocations.push({
        sourceLogId: source.sourceLogId,
        sourceDocumentNo: source.sourceDocumentNo,
        qty: allocated,
      });
      availabilityBySource.set(source.sourceLogId, available - allocated);
      remaining -= allocated;
    }

    if (remaining > 0.000001) {
      for (const allocation of allocations) {
        availabilityBySource.set(
          allocation.sourceLogId,
          (availabilityBySource.get(allocation.sourceLogId) ?? 0) +
            allocation.qty,
        );
      }
      blocked.push({
        documentNo: line.documentNo,
        orderType: line.orderType,
        lineId: line.lineId,
        materialId: line.materialId,
        materialCode: line.materialCode,
        materialName: line.materialName,
        quantity: qty(line.quantity),
        expectedUnitCost: line.expectedUnitCost,
        expectedCostAmount: line.expectedCostAmount,
        wrongNetQty: qty(wrongNetQty),
        missingQty: qty(remaining),
        reason: "same-price-source-insufficient-after-release",
      });
      continue;
    }

    repairs.push({
      orderId: line.orderId,
      documentNo: line.documentNo,
      orderType: line.orderType,
      lineId: line.lineId,
      outLogId: line.outLogId,
      materialId: line.materialId,
      materialCode: line.materialCode,
      materialName: line.materialName,
      quantity: qty(line.quantity),
      expectedUnitCost: line.expectedUnitCost,
      expectedCostAmount: line.expectedCostAmount,
      wrongNetQty: qty(wrongNetQty),
      releasedUsageIds: line.wrongUsages.map((usage) => usage.usageId),
      allocations,
    });
  }

  return { repairs, blocked };
}

async function executeRepairs(
  connection: MigrationConnectionLike,
  repairs: readonly PlannedRepair[],
) {
  await connection.beginTransaction();

  try {
    for (const repair of repairs) {
      for (const usageId of repair.releasedUsageIds) {
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
          [UPDATED_BY, usageId],
        );
      }

      for (const allocation of repair.allocations) {
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
            ON DUPLICATE KEY UPDATE
              allocated_qty = allocated_qty + VALUES(allocated_qty),
              status = CASE
                WHEN released_qty = 0 THEN 'ALLOCATED'
                WHEN allocated_qty + VALUES(allocated_qty) > released_qty THEN 'PARTIALLY_RELEASED'
                ELSE 'RELEASED'
              END,
              updated_by = VALUES(updated_by),
              updated_at = CURRENT_TIMESTAMP
          `,
          [
            repair.materialId,
            allocation.sourceLogId,
            repair.orderId,
            repair.lineId,
            qty(allocation.qty),
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
          repair.expectedUnitCost,
          repair.expectedCostAmount,
          `批量修复：按车间单据明细指定的 ${repair.expectedUnitCost} 价格层重算来源，释放错价来源占用。`,
          repair.outLogId,
        ],
      );

      await connection.query(
        `
          UPDATE workshop_material_order_line
          SET
            cost_unit_price = ?,
            cost_amount = ?,
            updated_by = ?,
            updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `,
        [
          repair.expectedUnitCost,
          repair.expectedCostAmount,
          UPDATED_BY,
          repair.lineId,
        ],
      );
    }

    await connection.commit();
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
      const contexts = buildLineContexts(await readUsageContexts(connection));
      const { repairs, blocked } = planRepairs(
        contexts,
        await readSources(connection),
      );

      if (execute && repairs.length > 0) {
        await executeRepairs(connection, repairs);
      }

      const report = {
        generatedAt: new Date().toISOString(),
        mode: execute ? "execute" : "dry-run",
        targetDatabase,
        updatedBy: UPDATED_BY,
        scannedMismatchCount: contexts.length,
        plannedRepairCount: repairs.length,
        blockedCount: blocked.length,
        plannedReleaseUsageCount: repairs.reduce(
          (sum, repair) => sum + repair.releasedUsageIds.length,
          0,
        ),
        plannedAllocationCount: repairs.reduce(
          (sum, repair) => sum + repair.allocations.length,
          0,
        ),
        repairs,
        blocked,
      };

      writeStableReport(reportPath, report);
      console.log(
        `Workshop selected price-layer drift repair ${execute ? "execute" : "dry-run"} completed. planned=${repairs.length}, blocked=${blocked.length}, report=${reportPath}`,
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
