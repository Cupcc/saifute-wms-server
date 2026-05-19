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

const MATERIAL_CODE = "cp001";
const EXPECTED_SPEC_MODEL = "ZY30X";
const OLD_PRICE = "105.00";
const NEW_PRICE = "104.00";
const UPDATED_BY = "manual-repair-cp001-price-105-to-104-20260518";
const DRY_RUN_REPORT_FILE_NAME =
  "repair-cp001-price-105-to-104-dry-run-report.json";
const EXECUTE_REPORT_FILE_NAME =
  "repair-cp001-price-105-to-104-execute-report.json";

interface MaterialRow {
  id: number;
  materialCode: string;
  materialName: string;
  specModel: string | null;
  unitCode: string;
}

interface ParentIdsByTable {
  stockInOrderIds: number[];
  salesStockOrderIds: number[];
}

function numberValue(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "bigint") return Number(value);
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function placeholders(values: readonly unknown[]): string {
  return values.map(() => "?").join(", ");
}

async function readMaterial(
  connection: MigrationConnectionLike,
): Promise<MaterialRow[]> {
  return connection.query<MaterialRow[]>(
    `
      SELECT
        id,
        material_code AS materialCode,
        material_name AS materialName,
        spec_model AS specModel,
        unit_code AS unitCode
      FROM material
      WHERE material_code = ?
      ORDER BY id
    `,
    [MATERIAL_CODE],
  );
}

async function readStockInRows(
  connection: MigrationConnectionLike,
  materialId: number,
): Promise<Array<Record<string, unknown>>> {
  return connection.query<Array<Record<string, unknown>>>(
    `
      SELECT
        line.id,
        line.order_id AS orderId,
        parent.document_no AS documentNo,
        parent.order_type AS orderType,
        DATE_FORMAT(parent.biz_date, '%Y-%m-%d') AS bizDate,
        line.quantity,
        line.unit_price AS unitPrice,
        line.amount,
        ROUND(line.quantity * ?, 2) AS newAmount
      FROM stock_in_order_line line
      JOIN stock_in_order parent ON parent.id = line.order_id
      WHERE line.material_id = ?
        AND line.unit_price = ?
      ORDER BY parent.biz_date, parent.document_no, line.id
    `,
    [NEW_PRICE, materialId, OLD_PRICE],
  );
}

async function readSalesRows(
  connection: MigrationConnectionLike,
  materialId: number,
): Promise<Array<Record<string, unknown>>> {
  return connection.query<Array<Record<string, unknown>>>(
    `
      SELECT
        line.id,
        line.order_id AS orderId,
        parent.document_no AS documentNo,
        parent.order_type AS orderType,
        DATE_FORMAT(parent.biz_date, '%Y-%m-%d') AS bizDate,
        line.quantity,
        line.unit_price AS unitPrice,
        line.amount,
        line.selected_unit_cost AS selectedUnitCost,
        line.cost_unit_price AS costUnitPrice,
        line.cost_amount AS costAmount,
        ROUND(line.quantity * ?, 2) AS newAmount
      FROM sales_stock_order_line line
      JOIN sales_stock_order parent ON parent.id = line.order_id
      WHERE line.material_id = ?
        AND (
          line.unit_price = ?
          OR line.selected_unit_cost = ?
          OR line.cost_unit_price = ?
        )
      ORDER BY parent.biz_date, parent.document_no, line.id
    `,
    [NEW_PRICE, materialId, OLD_PRICE, OLD_PRICE, OLD_PRICE],
  );
}

async function readInventoryLogRows(
  connection: MigrationConnectionLike,
  materialId: number,
): Promise<Array<Record<string, unknown>>> {
  return connection.query<Array<Record<string, unknown>>>(
    `
      SELECT
        id,
        DATE_FORMAT(biz_date, '%Y-%m-%d') AS bizDate,
        direction,
        operation_type AS operationType,
        business_document_type AS businessDocumentType,
        business_document_id AS businessDocumentId,
        business_document_number AS businessDocumentNumber,
        business_document_line_id AS businessDocumentLineId,
        change_qty AS changeQty,
        unit_cost AS unitCost,
        cost_amount AS costAmount,
        ROUND(change_qty * ?, 2) AS newCostAmount
      FROM inventory_log
      WHERE material_id = ?
        AND unit_cost = ?
      ORDER BY biz_date, id
    `,
    [NEW_PRICE, materialId, OLD_PRICE],
  );
}

async function readRemainingPrice105(
  connection: MigrationConnectionLike,
  materialId: number,
): Promise<Record<string, number>> {
  const [
    stockInRows,
    salesUnitRows,
    salesSelectedRows,
    salesCostRows,
    logRows,
  ] = await Promise.all([
    connection.query<Array<{ total: number | string }>>(
      `
          SELECT COUNT(*) AS total
          FROM stock_in_order_line
          WHERE material_id = ?
            AND unit_price = ?
        `,
      [materialId, OLD_PRICE],
    ),
    connection.query<Array<{ total: number | string }>>(
      `
          SELECT COUNT(*) AS total
          FROM sales_stock_order_line
          WHERE material_id = ?
            AND unit_price = ?
        `,
      [materialId, OLD_PRICE],
    ),
    connection.query<Array<{ total: number | string }>>(
      `
          SELECT COUNT(*) AS total
          FROM sales_stock_order_line
          WHERE material_id = ?
            AND selected_unit_cost = ?
        `,
      [materialId, OLD_PRICE],
    ),
    connection.query<Array<{ total: number | string }>>(
      `
          SELECT COUNT(*) AS total
          FROM sales_stock_order_line
          WHERE material_id = ?
            AND cost_unit_price = ?
        `,
      [materialId, OLD_PRICE],
    ),
    connection.query<Array<{ total: number | string }>>(
      `
          SELECT COUNT(*) AS total
          FROM inventory_log
          WHERE material_id = ?
            AND unit_cost = ?
        `,
      [materialId, OLD_PRICE],
    ),
  ]);

  return {
    stockInUnitPrice: numberValue(stockInRows[0]?.total),
    salesUnitPrice: numberValue(salesUnitRows[0]?.total),
    salesSelectedUnitCost: numberValue(salesSelectedRows[0]?.total),
    salesCostUnitPrice: numberValue(salesCostRows[0]?.total),
    inventoryLogUnitCost: numberValue(logRows[0]?.total),
  };
}

function parentIdsFromRows(
  stockInRows: readonly Record<string, unknown>[],
  salesRows: readonly Record<string, unknown>[],
): ParentIdsByTable {
  return {
    stockInOrderIds: [
      ...new Set(stockInRows.map((row) => Number(row.orderId))),
    ].sort((left, right) => left - right),
    salesStockOrderIds: [
      ...new Set(salesRows.map((row) => Number(row.orderId))),
    ].sort((left, right) => left - right),
  };
}

async function readPreview(
  connection: MigrationConnectionLike,
  material: MaterialRow,
) {
  const [stockInRows, salesRows, inventoryLogRows, remainingPrice105] =
    await Promise.all([
      readStockInRows(connection, material.id),
      readSalesRows(connection, material.id),
      readInventoryLogRows(connection, material.id),
      readRemainingPrice105(connection, material.id),
    ]);

  return {
    stockInRows,
    salesRows,
    inventoryLogRows,
    parentIds: parentIdsFromRows(stockInRows, salesRows),
    remainingPrice105,
  };
}

async function recalculateStockInTotals(
  connection: MigrationConnectionLike,
  orderIds: readonly number[],
): Promise<number> {
  if (orderIds.length === 0) return 0;

  const result = await connection.query<{ affectedRows?: number }>(
    `
      UPDATE stock_in_order parent
      JOIN (
        SELECT
          order_id,
          SUM(quantity) AS total_qty,
          SUM(amount) AS total_amount
        FROM stock_in_order_line
        WHERE order_id IN (${placeholders(orderIds)})
        GROUP BY order_id
      ) totals ON totals.order_id = parent.id
      SET
        parent.total_qty = totals.total_qty,
        parent.total_amount = totals.total_amount,
        parent.updated_by = ?,
        parent.updated_at = CURRENT_TIMESTAMP
      WHERE parent.id IN (${placeholders(orderIds)})
    `,
    [...orderIds, UPDATED_BY, ...orderIds],
  );

  return numberValue(result?.affectedRows);
}

async function recalculateSalesTotals(
  connection: MigrationConnectionLike,
  orderIds: readonly number[],
): Promise<number> {
  if (orderIds.length === 0) return 0;

  const result = await connection.query<{ affectedRows?: number }>(
    `
      UPDATE sales_stock_order parent
      JOIN (
        SELECT
          order_id,
          SUM(quantity) AS total_qty,
          SUM(amount) AS total_amount
        FROM sales_stock_order_line
        WHERE order_id IN (${placeholders(orderIds)})
        GROUP BY order_id
      ) totals ON totals.order_id = parent.id
      SET
        parent.total_qty = totals.total_qty,
        parent.total_amount = totals.total_amount,
        parent.updated_by = ?,
        parent.updated_at = CURRENT_TIMESTAMP
      WHERE parent.id IN (${placeholders(orderIds)})
    `,
    [...orderIds, UPDATED_BY, ...orderIds],
  );

  return numberValue(result?.affectedRows);
}

async function recomputeMonthlySnapshots(
  connection: MigrationConnectionLike,
  materialId: number,
): Promise<number> {
  const result = await connection.query<{ affectedRows?: number }>(
    `
      UPDATE inventory_monthly_snapshot snapshot
      JOIN (
        SELECT
          snapshot_inner.id,
          COALESCE(SUM(
            CASE
              WHEN log_row.biz_date < STR_TO_DATE(CONCAT(snapshot_inner.\`year_month\`, '-01'), '%Y-%m-%d')
              THEN CASE WHEN log_row.direction = 'IN' THEN log_row.change_qty ELSE -log_row.change_qty END
              ELSE 0
            END
          ), 0) AS opening_qty,
          COALESCE(SUM(
            CASE
              WHEN log_row.biz_date < DATE_ADD(STR_TO_DATE(CONCAT(snapshot_inner.\`year_month\`, '-01'), '%Y-%m-%d'), INTERVAL 1 MONTH)
              THEN CASE WHEN log_row.direction = 'IN' THEN log_row.change_qty ELSE -log_row.change_qty END
              ELSE 0
            END
          ), 0) AS closing_qty,
          COALESCE(SUM(
            CASE
              WHEN log_row.biz_date >= STR_TO_DATE(CONCAT(snapshot_inner.\`year_month\`, '-01'), '%Y-%m-%d')
                AND log_row.biz_date < DATE_ADD(STR_TO_DATE(CONCAT(snapshot_inner.\`year_month\`, '-01'), '%Y-%m-%d'), INTERVAL 1 MONTH)
                AND log_row.direction = 'IN'
              THEN log_row.change_qty
              ELSE 0
            END
          ), 0) AS total_in_qty,
          COALESCE(SUM(
            CASE
              WHEN log_row.biz_date >= STR_TO_DATE(CONCAT(snapshot_inner.\`year_month\`, '-01'), '%Y-%m-%d')
                AND log_row.biz_date < DATE_ADD(STR_TO_DATE(CONCAT(snapshot_inner.\`year_month\`, '-01'), '%Y-%m-%d'), INTERVAL 1 MONTH)
                AND log_row.direction = 'IN'
              THEN COALESCE(log_row.cost_amount, 0)
              ELSE 0
            END
          ), 0) AS total_in_amount,
          COALESCE(SUM(
            CASE
              WHEN log_row.biz_date >= STR_TO_DATE(CONCAT(snapshot_inner.\`year_month\`, '-01'), '%Y-%m-%d')
                AND log_row.biz_date < DATE_ADD(STR_TO_DATE(CONCAT(snapshot_inner.\`year_month\`, '-01'), '%Y-%m-%d'), INTERVAL 1 MONTH)
                AND log_row.direction = 'OUT'
              THEN log_row.change_qty
              ELSE 0
            END
          ), 0) AS total_out_qty,
          COALESCE(SUM(
            CASE
              WHEN log_row.biz_date >= STR_TO_DATE(CONCAT(snapshot_inner.\`year_month\`, '-01'), '%Y-%m-%d')
                AND log_row.biz_date < DATE_ADD(STR_TO_DATE(CONCAT(snapshot_inner.\`year_month\`, '-01'), '%Y-%m-%d'), INTERVAL 1 MONTH)
                AND log_row.direction = 'OUT'
              THEN COALESCE(log_row.cost_amount, 0)
              ELSE 0
            END
          ), 0) AS total_out_amount
        FROM inventory_monthly_snapshot snapshot_inner
        LEFT JOIN inventory_log log_row
          ON log_row.material_id = snapshot_inner.material_id
          AND log_row.stock_scope_id <=> snapshot_inner.stock_scope_id
        WHERE snapshot_inner.material_id = ?
        GROUP BY snapshot_inner.id
      ) calculated ON calculated.id = snapshot.id
      SET
        snapshot.opening_qty = calculated.opening_qty,
        snapshot.closing_qty = calculated.closing_qty,
        snapshot.total_in_qty = calculated.total_in_qty,
        snapshot.total_in_amount = calculated.total_in_amount,
        snapshot.total_out_qty = calculated.total_out_qty,
        snapshot.total_out_amount = calculated.total_out_amount,
        snapshot.snapshot_at = CURRENT_TIMESTAMP
      WHERE snapshot.material_id = ?
    `,
    [materialId, materialId],
  );

  return numberValue(result?.affectedRows);
}

async function executeRepair(
  connection: MigrationConnectionLike,
  material: MaterialRow,
  parentIds: ParentIdsByTable,
) {
  await connection.beginTransaction();

  try {
    const stockInUpdate = await connection.query<{ affectedRows?: number }>(
      `
        UPDATE stock_in_order_line
        SET
          unit_price = ?,
          amount = ROUND(quantity * ?, 2),
          updated_by = ?,
          updated_at = CURRENT_TIMESTAMP
        WHERE material_id = ?
          AND unit_price = ?
      `,
      [NEW_PRICE, NEW_PRICE, UPDATED_BY, material.id, OLD_PRICE],
    );

    const salesUpdate = await connection.query<{ affectedRows?: number }>(
      `
        UPDATE sales_stock_order_line
        SET
          unit_price = CASE WHEN unit_price = ? THEN ? ELSE unit_price END,
          amount = CASE
            WHEN unit_price = ? OR amount = ROUND(quantity * ?, 2)
            THEN ROUND(quantity * ?, 2)
            ELSE amount
          END,
          selected_unit_cost = CASE
            WHEN selected_unit_cost = ? THEN ?
            ELSE selected_unit_cost
          END,
          cost_unit_price = CASE
            WHEN cost_unit_price = ? THEN ?
            ELSE cost_unit_price
          END,
          cost_amount = CASE
            WHEN cost_unit_price = ? OR cost_amount = ROUND(quantity * ?, 2)
            THEN ROUND(quantity * ?, 2)
            ELSE cost_amount
          END,
          updated_by = ?,
          updated_at = CURRENT_TIMESTAMP
        WHERE material_id = ?
          AND (
            unit_price = ?
            OR selected_unit_cost = ?
            OR cost_unit_price = ?
          )
      `,
      [
        OLD_PRICE,
        NEW_PRICE,
        OLD_PRICE,
        OLD_PRICE,
        NEW_PRICE,
        OLD_PRICE,
        NEW_PRICE,
        OLD_PRICE,
        NEW_PRICE,
        OLD_PRICE,
        OLD_PRICE,
        NEW_PRICE,
        UPDATED_BY,
        material.id,
        OLD_PRICE,
        OLD_PRICE,
        OLD_PRICE,
      ],
    );

    const inventoryLogUpdate = await connection.query<{
      affectedRows?: number;
    }>(
      `
        UPDATE inventory_log
        SET
          unit_cost = ?,
          cost_amount = ROUND(change_qty * ?, 2)
        WHERE material_id = ?
          AND unit_cost = ?
      `,
      [NEW_PRICE, NEW_PRICE, material.id, OLD_PRICE],
    );

    const stockInParentUpdates = await recalculateStockInTotals(
      connection,
      parentIds.stockInOrderIds,
    );
    const salesParentUpdates = await recalculateSalesTotals(
      connection,
      parentIds.salesStockOrderIds,
    );
    const monthlySnapshotUpdates = await recomputeMonthlySnapshots(
      connection,
      material.id,
    );

    await connection.commit();

    return {
      stockInLineUpdates: numberValue(stockInUpdate?.affectedRows),
      salesLineUpdates: numberValue(salesUpdate?.affectedRows),
      inventoryLogUpdates: numberValue(inventoryLogUpdate?.affectedRows),
      stockInParentUpdates,
      salesParentUpdates,
      monthlySnapshotUpdates,
    };
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
      const materials = await readMaterial(connection);
      const material = materials[0] ?? null;
      const blockers: Array<Record<string, unknown>> = [];

      if (materials.length !== 1) {
        blockers.push({
          reason: "material-code-not-unique-or-missing",
          materialCode: MATERIAL_CODE,
          materialCount: materials.length,
        });
      }
      if (material && material.specModel !== EXPECTED_SPEC_MODEL) {
        blockers.push({
          reason: "material-spec-model-mismatch",
          expectedSpecModel: EXPECTED_SPEC_MODEL,
          actualSpecModel: material.specModel,
        });
      }

      if (blockers.length > 0 || !material) {
        if (execute) {
          throw new Error(`Refusing to execute: ${JSON.stringify(blockers)}`);
        }

        return {
          execute,
          targetDatabase,
          blockers,
          materialCode: MATERIAL_CODE,
          expectedSpecModel: EXPECTED_SPEC_MODEL,
          oldPrice: OLD_PRICE,
          newPrice: NEW_PRICE,
        };
      }

      const before = await readPreview(connection, material);
      const executeResult = execute
        ? await executeRepair(connection, material, before.parentIds)
        : null;
      const after = execute ? await readPreview(connection, material) : null;

      return {
        execute,
        targetDatabase,
        blockers,
        updatedBy: UPDATED_BY,
        material,
        oldPrice: OLD_PRICE,
        newPrice: NEW_PRICE,
        before,
        executeResult,
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
