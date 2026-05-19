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

const MATERIAL_CODE = process.env.MATERIAL_CODE?.trim() || "033";
const WORKSHOP_COST_PRICE = process.env.WORKSHOP_COST_PRICE?.trim() || "3.50";
const SALES_UNIT_PRICE = process.env.SALES_UNIT_PRICE?.trim() || "3.90";
const SALES_COST_PRICE = process.env.SALES_COST_PRICE?.trim() || "3.50";
const REPORT_SLUG =
  process.env.REPORT_SLUG?.trim() ||
  `material-${MATERIAL_CODE}-confirmed-price-repair`;
const UPDATED_BY =
  process.env.UPDATED_BY?.trim() ||
  `manual-${REPORT_SLUG}-${new Date().toISOString().slice(0, 10).replaceAll("-", "")}`;
const DRY_RUN_REPORT_FILE_NAME = `${REPORT_SLUG}-dry-run-report.json`;
const EXECUTE_REPORT_FILE_NAME = `${REPORT_SLUG}-execute-report.json`;

interface MaterialRow {
  id: number;
  materialCode: string;
  materialName: string;
  specModel: string | null;
  unitCode: string;
}

interface WorkshopLinePreview {
  orderId: number;
  documentNo: string;
  orderType: string;
  bizDate: string;
  lineId: number;
  quantity: string;
  oldUnitPrice: string;
  oldAmount: string;
  oldCostUnitPrice: string | null;
  oldCostAmount: string | null;
  oldLogUnitCost: string | null;
  oldLogCostAmount: string | null;
  newUnitPrice: string;
  newAmount: string;
}

interface SalesLinePreview {
  orderId: number;
  documentNo: string;
  orderType: string;
  bizDate: string;
  lineId: number;
  quantity: string;
  oldUnitPrice: string;
  oldAmount: string;
  oldSelectedUnitCost: string;
  oldCostUnitPrice: string | null;
  oldCostAmount: string | null;
  oldLogUnitCost: string | null;
  oldLogCostAmount: string | null;
  newUnitPrice: string;
  newAmount: string;
  newSelectedUnitCost: string;
  newCostAmount: string;
}

interface CountRow {
  total: number | string | null;
}

interface VerificationRow {
  checkName: string;
  total: number | string | null;
}

function numberValue(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "bigint") return Number(value);
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function uniqueNumbers(values: readonly number[]): number[] {
  return [...new Set(values)].sort((left, right) => left - right);
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

async function countRows(
  connection: MigrationConnectionLike,
  sql: string,
  values: readonly unknown[],
): Promise<number> {
  const rows = await connection.query<CountRow[]>(sql, values);
  return numberValue(rows[0]?.total);
}

async function readWorkshopLines(
  connection: MigrationConnectionLike,
  materialId: number,
): Promise<WorkshopLinePreview[]> {
  return connection.query<WorkshopLinePreview[]>(
    `
      SELECT
        o.id AS orderId,
        o.document_no AS documentNo,
        o.order_type AS orderType,
        DATE_FORMAT(o.biz_date, '%Y-%m-%d') AS bizDate,
        l.id AS lineId,
        l.quantity,
        l.unit_price AS oldUnitPrice,
        l.amount AS oldAmount,
        l.cost_unit_price AS oldCostUnitPrice,
        l.cost_amount AS oldCostAmount,
        log.unit_cost AS oldLogUnitCost,
        log.cost_amount AS oldLogCostAmount,
        ? AS newUnitPrice,
        ROUND(l.quantity * ?, 2) AS newAmount
      FROM workshop_material_order o
      JOIN workshop_material_order_line l ON l.order_id = o.id
      LEFT JOIN inventory_log log
        ON log.business_document_type = 'WorkshopMaterialOrder'
       AND log.business_document_id = o.id
       AND log.business_document_line_id = l.id
       AND log.direction = 'OUT'
       AND log.operation_type = 'PICK_OUT'
       AND NOT EXISTS (
         SELECT 1 FROM inventory_log rev WHERE rev.reversal_of_log_id = log.id
       )
      WHERE l.material_id = ?
        AND o.order_type = 'PICK'
        AND o.lifecycle_status = 'EFFECTIVE'
        AND o.inventory_effect_status = 'POSTED'
      ORDER BY o.biz_date, o.id, l.id
    `,
    [WORKSHOP_COST_PRICE, WORKSHOP_COST_PRICE, materialId],
  );
}

async function readSalesLines(
  connection: MigrationConnectionLike,
  materialId: number,
): Promise<SalesLinePreview[]> {
  return connection.query<SalesLinePreview[]>(
    `
      SELECT
        o.id AS orderId,
        o.document_no AS documentNo,
        o.order_type AS orderType,
        DATE_FORMAT(o.biz_date, '%Y-%m-%d') AS bizDate,
        l.id AS lineId,
        l.quantity,
        l.unit_price AS oldUnitPrice,
        l.amount AS oldAmount,
        l.selected_unit_cost AS oldSelectedUnitCost,
        l.cost_unit_price AS oldCostUnitPrice,
        l.cost_amount AS oldCostAmount,
        log.unit_cost AS oldLogUnitCost,
        log.cost_amount AS oldLogCostAmount,
        ? AS newUnitPrice,
        ROUND(l.quantity * ?, 2) AS newAmount,
        ? AS newSelectedUnitCost,
        ROUND(l.quantity * ?, 2) AS newCostAmount
      FROM sales_stock_order o
      JOIN sales_stock_order_line l ON l.order_id = o.id
      LEFT JOIN inventory_log log
        ON log.business_document_type = 'SalesStockOrder'
       AND log.business_document_id = o.id
       AND log.business_document_line_id = l.id
       AND log.operation_type IN ('OUTBOUND_OUT', 'SALES_RETURN_IN')
       AND NOT EXISTS (
         SELECT 1 FROM inventory_log rev WHERE rev.reversal_of_log_id = log.id
       )
      WHERE l.material_id = ?
        AND o.order_type IN ('OUTBOUND', 'SALES_RETURN')
        AND o.lifecycle_status = 'EFFECTIVE'
        AND o.inventory_effect_status = 'POSTED'
      ORDER BY o.biz_date, o.id, l.id
    `,
    [
      SALES_UNIT_PRICE,
      SALES_UNIT_PRICE,
      SALES_COST_PRICE,
      SALES_COST_PRICE,
      materialId,
    ],
  );
}

async function readVerification(
  connection: MigrationConnectionLike,
  materialId: number,
): Promise<VerificationRow[]> {
  return connection.query<VerificationRow[]>(
    `
      SELECT 'workshop_line_price_mismatch' AS checkName, COUNT(*) AS total
      FROM workshop_material_order o
      JOIN workshop_material_order_line l ON l.order_id = o.id
      WHERE l.material_id = ?
        AND o.order_type = 'PICK'
        AND o.lifecycle_status = 'EFFECTIVE'
        AND o.inventory_effect_status = 'POSTED'
        AND (
          NOT (l.unit_price <=> ?)
          OR l.amount <> ROUND(l.quantity * ?, 2)
          OR NOT (l.cost_unit_price <=> ?)
          OR NOT (l.cost_amount <=> ROUND(l.quantity * ?, 2))
        )
      UNION ALL
      SELECT 'workshop_log_cost_mismatch' AS checkName, COUNT(*) AS total
      FROM inventory_log log
      JOIN workshop_material_order_line l ON l.id = log.business_document_line_id
      JOIN workshop_material_order o ON o.id = l.order_id
      WHERE log.material_id = ?
        AND log.business_document_type = 'WorkshopMaterialOrder'
        AND log.direction = 'OUT'
        AND log.operation_type = 'PICK_OUT'
        AND o.order_type = 'PICK'
        AND o.lifecycle_status = 'EFFECTIVE'
        AND o.inventory_effect_status = 'POSTED'
        AND NOT EXISTS (
          SELECT 1 FROM inventory_log rev WHERE rev.reversal_of_log_id = log.id
        )
        AND (
          NOT (log.unit_cost <=> ?)
          OR NOT (log.cost_amount <=> ROUND(log.change_qty * ?, 2))
        )
      UNION ALL
      SELECT 'sales_line_price_mismatch' AS checkName, COUNT(*) AS total
      FROM sales_stock_order o
      JOIN sales_stock_order_line l ON l.order_id = o.id
      WHERE l.material_id = ?
        AND o.order_type IN ('OUTBOUND', 'SALES_RETURN')
        AND o.lifecycle_status = 'EFFECTIVE'
        AND o.inventory_effect_status = 'POSTED'
        AND (
          NOT (l.unit_price <=> ?)
          OR l.amount <> ROUND(l.quantity * ?, 2)
          OR NOT (l.selected_unit_cost <=> ?)
          OR NOT (l.cost_unit_price <=> ?)
          OR NOT (l.cost_amount <=> ROUND(l.quantity * ?, 2))
        )
      UNION ALL
      SELECT 'sales_log_cost_mismatch' AS checkName, COUNT(*) AS total
      FROM inventory_log log
      JOIN sales_stock_order_line l ON l.id = log.business_document_line_id
      JOIN sales_stock_order o ON o.id = l.order_id
      WHERE log.material_id = ?
        AND log.business_document_type = 'SalesStockOrder'
        AND log.operation_type IN ('OUTBOUND_OUT', 'SALES_RETURN_IN')
        AND o.order_type IN ('OUTBOUND', 'SALES_RETURN')
        AND o.lifecycle_status = 'EFFECTIVE'
        AND o.inventory_effect_status = 'POSTED'
        AND NOT EXISTS (
          SELECT 1 FROM inventory_log rev WHERE rev.reversal_of_log_id = log.id
        )
        AND (
          NOT (log.unit_cost <=> ?)
          OR NOT (log.cost_amount <=> ROUND(log.change_qty * ?, 2))
        )
      UNION ALL
      SELECT 'workshop_parent_total_mismatch' AS checkName, COUNT(*) AS total
      FROM workshop_material_order o
      WHERE o.id IN (
        SELECT DISTINCT order_id
        FROM workshop_material_order_line
        WHERE material_id = ?
      )
        AND o.total_amount <> (
          SELECT COALESCE(SUM(line.amount), 0)
          FROM workshop_material_order_line line
          WHERE line.order_id = o.id
        )
      UNION ALL
      SELECT 'sales_parent_total_mismatch' AS checkName, COUNT(*) AS total
      FROM sales_stock_order o
      WHERE o.id IN (
        SELECT DISTINCT order_id
        FROM sales_stock_order_line
        WHERE material_id = ?
      )
        AND o.total_amount <> (
          SELECT COALESCE(SUM(line.amount), 0)
          FROM sales_stock_order_line line
          WHERE line.order_id = o.id
        )
    `,
    [
      materialId,
      WORKSHOP_COST_PRICE,
      WORKSHOP_COST_PRICE,
      WORKSHOP_COST_PRICE,
      WORKSHOP_COST_PRICE,
      materialId,
      WORKSHOP_COST_PRICE,
      WORKSHOP_COST_PRICE,
      materialId,
      SALES_UNIT_PRICE,
      SALES_UNIT_PRICE,
      SALES_COST_PRICE,
      SALES_COST_PRICE,
      SALES_COST_PRICE,
      materialId,
      SALES_COST_PRICE,
      SALES_COST_PRICE,
      materialId,
      materialId,
    ],
  );
}

async function executeRepair(
  connection: MigrationConnectionLike,
  materialId: number,
  workshopOrderIds: readonly number[],
  salesOrderIds: readonly number[],
): Promise<void> {
  await connection.beginTransaction();

  try {
    await connection.query(
      `
        UPDATE workshop_material_order_line l
        JOIN workshop_material_order o ON o.id = l.order_id
        SET
          l.unit_price = ?,
          l.amount = ROUND(l.quantity * ?, 2),
          l.cost_unit_price = ?,
          l.cost_amount = ROUND(l.quantity * ?, 2),
          l.updated_by = ?,
          l.updated_at = CURRENT_TIMESTAMP
        WHERE l.material_id = ?
          AND o.order_type = 'PICK'
          AND o.lifecycle_status = 'EFFECTIVE'
          AND o.inventory_effect_status = 'POSTED'
      `,
      [
        WORKSHOP_COST_PRICE,
        WORKSHOP_COST_PRICE,
        WORKSHOP_COST_PRICE,
        WORKSHOP_COST_PRICE,
        UPDATED_BY,
        materialId,
      ],
    );

    await connection.query(
      `
        UPDATE inventory_log log
        JOIN workshop_material_order_line l ON l.id = log.business_document_line_id
        JOIN workshop_material_order o ON o.id = l.order_id
        LEFT JOIN inventory_log rev ON rev.reversal_of_log_id = log.id
        SET
          log.unit_cost = ?,
          log.cost_amount = ROUND(log.change_qty * ?, 2),
          log.note = ?,
          log.operator_id = COALESCE(log.operator_id, ?)
        WHERE log.material_id = ?
          AND log.business_document_type = 'WorkshopMaterialOrder'
          AND log.direction = 'OUT'
          AND log.operation_type = 'PICK_OUT'
          AND o.order_type = 'PICK'
          AND o.lifecycle_status = 'EFFECTIVE'
          AND o.inventory_effect_status = 'POSTED'
          AND rev.id IS NULL
      `,
      [
        WORKSHOP_COST_PRICE,
        WORKSHOP_COST_PRICE,
        `人工确认：物料 ${MATERIAL_CODE} 车间领料成本统一调整为 ${WORKSHOP_COST_PRICE}。`,
        UPDATED_BY,
        materialId,
      ],
    );

    await connection.query(
      `
        UPDATE sales_stock_order_line l
        JOIN sales_stock_order o ON o.id = l.order_id
        SET
          l.unit_price = ?,
          l.amount = ROUND(l.quantity * ?, 2),
          l.selected_unit_cost = ?,
          l.cost_unit_price = ?,
          l.cost_amount = ROUND(l.quantity * ?, 2),
          l.updated_by = ?,
          l.updated_at = CURRENT_TIMESTAMP
        WHERE l.material_id = ?
          AND o.order_type IN ('OUTBOUND', 'SALES_RETURN')
          AND o.lifecycle_status = 'EFFECTIVE'
          AND o.inventory_effect_status = 'POSTED'
      `,
      [
        SALES_UNIT_PRICE,
        SALES_UNIT_PRICE,
        SALES_COST_PRICE,
        SALES_COST_PRICE,
        SALES_COST_PRICE,
        UPDATED_BY,
        materialId,
      ],
    );

    await connection.query(
      `
        UPDATE inventory_log log
        JOIN sales_stock_order_line l ON l.id = log.business_document_line_id
        JOIN sales_stock_order o ON o.id = l.order_id
        LEFT JOIN inventory_log rev ON rev.reversal_of_log_id = log.id
        SET
          log.unit_cost = ?,
          log.cost_amount = ROUND(log.change_qty * ?, 2),
          log.note = ?,
          log.operator_id = COALESCE(log.operator_id, ?)
        WHERE log.material_id = ?
          AND log.business_document_type = 'SalesStockOrder'
          AND log.operation_type IN ('OUTBOUND_OUT', 'SALES_RETURN_IN')
          AND o.order_type IN ('OUTBOUND', 'SALES_RETURN')
          AND o.lifecycle_status = 'EFFECTIVE'
          AND o.inventory_effect_status = 'POSTED'
          AND rev.id IS NULL
      `,
      [
        SALES_COST_PRICE,
        SALES_COST_PRICE,
        `人工确认：物料 ${MATERIAL_CODE} 销售单销售价 ${SALES_UNIT_PRICE}，库存成本 ${SALES_COST_PRICE}。`,
        UPDATED_BY,
        materialId,
      ],
    );

    if (workshopOrderIds.length > 0) {
      await connection.query(
        `
          UPDATE workshop_material_order o
          SET
            o.total_qty = (
              SELECT COALESCE(SUM(line.quantity), 0)
              FROM workshop_material_order_line line
              WHERE line.order_id = o.id
            ),
            o.total_amount = (
              SELECT COALESCE(SUM(line.amount), 0)
              FROM workshop_material_order_line line
              WHERE line.order_id = o.id
            ),
            o.updated_by = ?,
            o.updated_at = CURRENT_TIMESTAMP
          WHERE o.id IN (${placeholders(workshopOrderIds)})
        `,
        [UPDATED_BY, ...workshopOrderIds],
      );
    }

    if (salesOrderIds.length > 0) {
      await connection.query(
        `
          UPDATE sales_stock_order o
          SET
            o.total_qty = (
              SELECT COALESCE(SUM(line.quantity), 0)
              FROM sales_stock_order_line line
              WHERE line.order_id = o.id
            ),
            o.total_amount = (
              SELECT COALESCE(SUM(line.amount), 0)
              FROM sales_stock_order_line line
              WHERE line.order_id = o.id
            ),
            o.updated_by = ?,
            o.updated_at = CURRENT_TIMESTAMP
          WHERE o.id IN (${placeholders(salesOrderIds)})
        `,
        [UPDATED_BY, ...salesOrderIds],
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
      const materials = await readMaterial(connection);
      if (materials.length !== 1) {
        throw new Error(
          `Expected exactly one material for code ${MATERIAL_CODE}, received ${materials.length}.`,
        );
      }

      const material = materials[0];
      const workshopLines = await readWorkshopLines(connection, material.id);
      const salesLines = await readSalesLines(connection, material.id);
      const workshopOrderIds = uniqueNumbers(
        workshopLines.map((line) => line.orderId),
      );
      const salesOrderIds = uniqueNumbers(
        salesLines.map((line) => line.orderId),
      );
      const snapshotRows = await countRows(
        connection,
        "SELECT COUNT(*) AS total FROM inventory_monthly_snapshot WHERE material_id = ?",
        [material.id],
      );

      if (execute) {
        await executeRepair(
          connection,
          material.id,
          workshopOrderIds,
          salesOrderIds,
        );
      }

      const verification = await readVerification(connection, material.id);
      const report = {
        generatedAt: new Date().toISOString(),
        mode: execute ? "execute" : "dry-run",
        targetDatabase,
        updatedBy: UPDATED_BY,
        material,
        confirmedRule: {
          workshopPickCostPrice: WORKSHOP_COST_PRICE,
          salesUnitPrice: SALES_UNIT_PRICE,
          salesCostPrice: SALES_COST_PRICE,
        },
        workshopLineCount: workshopLines.length,
        workshopOrderIds,
        salesLineCount: salesLines.length,
        salesOrderIds,
        snapshotRows,
        verification,
        workshopLines,
        salesLines,
      };

      writeStableReport(reportPath, report);
      console.log(
        `Material ${MATERIAL_CODE} confirmed price repair ${execute ? "execute" : "dry-run"} completed. workshopLines=${workshopLines.length}, salesLines=${salesLines.length}, snapshotRows=${snapshotRows}, report=${reportPath}`,
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
