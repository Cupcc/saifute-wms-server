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
const OLD_PRICE = process.env.OLD_PRICE?.trim() || "0.40";
const NEW_PRICE = process.env.NEW_PRICE?.trim() || "3.50";
const REPORT_SLUG =
  process.env.REPORT_SLUG?.trim() || `material-${MATERIAL_CODE}-price-adjust`;
const UPDATED_BY =
  process.env.UPDATED_BY?.trim() ||
  `manual-${REPORT_SLUG}-${new Date().toISOString().slice(0, 10).replaceAll("-", "")}`;
const DRY_RUN_REPORT_FILE_NAME = `${REPORT_SLUG}-dry-run-report.json`;
const EXECUTE_REPORT_FILE_NAME = `${REPORT_SLUG}-execute-report.json`;

interface CountRow {
  total: number | string | null;
}

interface MaterialRow {
  id: number;
  materialCode: string;
  materialName: string;
  specModel: string | null;
  unitCode: string;
}

interface LineTableConfig {
  tableName: string;
  parentTableName: string;
  parentForeignKey: string;
  parentPrimaryKey: string;
  parentNumberColumn: string;
  parentTypeColumn: string;
  parentDateColumn: string;
}

interface AffectedLineRow {
  id: number;
  parentId: number;
  parentNo: string;
  parentType: string;
  bizDate: string;
  quantity: string;
  unitPrice: string | null;
  amount: string | null;
  selectedUnitCost: string | null;
  costUnitPrice: string | null;
  costAmount: string | null;
  newLineAmount: string;
}

interface PriceColumnState {
  unitPrice: boolean;
  selectedUnitCost: boolean;
  costUnitPrice: boolean;
  costAmount: boolean;
}

interface LineTablePreview {
  tableName: string;
  affectedRows: AffectedLineRow[];
  affectedRowCount: number;
  affectedParentIds: number[];
  priceColumns: PriceColumnState;
}

const LINE_TABLES: LineTableConfig[] = [
  {
    tableName: "stock_in_order_line",
    parentTableName: "stock_in_order",
    parentForeignKey: "order_id",
    parentPrimaryKey: "id",
    parentNumberColumn: "document_no",
    parentTypeColumn: "order_type",
    parentDateColumn: "biz_date",
  },
  {
    tableName: "sales_stock_order_line",
    parentTableName: "sales_stock_order",
    parentForeignKey: "order_id",
    parentPrimaryKey: "id",
    parentNumberColumn: "document_no",
    parentTypeColumn: "order_type",
    parentDateColumn: "biz_date",
  },
  {
    tableName: "workshop_material_order_line",
    parentTableName: "workshop_material_order",
    parentForeignKey: "order_id",
    parentPrimaryKey: "id",
    parentNumberColumn: "document_no",
    parentTypeColumn: "order_type",
    parentDateColumn: "biz_date",
  },
  {
    tableName: "sales_project_material_line",
    parentTableName: "sales_project",
    parentForeignKey: "project_id",
    parentPrimaryKey: "id",
    parentNumberColumn: "sales_project_code",
    parentTypeColumn: "sales_project_name",
    parentDateColumn: "biz_date",
  },
  {
    tableName: "rd_project_material_line",
    parentTableName: "rd_project",
    parentForeignKey: "project_id",
    parentPrimaryKey: "id",
    parentNumberColumn: "project_code",
    parentTypeColumn: "project_name",
    parentDateColumn: "biz_date",
  },
  {
    tableName: "rd_project_bom_line",
    parentTableName: "rd_project",
    parentForeignKey: "project_id",
    parentPrimaryKey: "id",
    parentNumberColumn: "project_code",
    parentTypeColumn: "project_name",
    parentDateColumn: "biz_date",
  },
  {
    tableName: "rd_procurement_request_line",
    parentTableName: "rd_procurement_request",
    parentForeignKey: "request_id",
    parentPrimaryKey: "id",
    parentNumberColumn: "document_no",
    parentTypeColumn: "project_name",
    parentDateColumn: "biz_date",
  },
  {
    tableName: "rd_project_material_action_line",
    parentTableName: "rd_project_material_action",
    parentForeignKey: "action_id",
    parentPrimaryKey: "id",
    parentNumberColumn: "document_no",
    parentTypeColumn: "action_type",
    parentDateColumn: "biz_date",
  },
  {
    tableName: "rd_handoff_order_line",
    parentTableName: "rd_handoff_order",
    parentForeignKey: "order_id",
    parentPrimaryKey: "id",
    parentNumberColumn: "document_no",
    parentTypeColumn: "lifecycle_status",
    parentDateColumn: "biz_date",
  },
];

function quoteIdentifier(identifier: string): string {
  if (!/^[A-Za-z0-9_]+$/u.test(identifier)) {
    throw new Error(`Unsafe SQL identifier: ${identifier}`);
  }

  return `\`${identifier}\``;
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

async function tableColumns(
  connection: MigrationConnectionLike,
  tableName: string,
): Promise<Set<string>> {
  const rows = await connection.query<Array<{ columnName: string }>>(
    `
      SELECT COLUMN_NAME AS columnName
      FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = ?
    `,
    [tableName],
  );

  return new Set(rows.map((row) => row.columnName));
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

async function readAffectedLineRows(
  connection: MigrationConnectionLike,
  config: LineTableConfig,
  materialId: number,
): Promise<LineTablePreview> {
  const columns = await tableColumns(connection, config.tableName);
  const priceColumns = {
    unitPrice: columns.has("unit_price"),
    selectedUnitCost: columns.has("selected_unit_cost"),
    costUnitPrice: columns.has("cost_unit_price"),
    costAmount: columns.has("cost_amount"),
  };
  const pricePredicates: Array<{ sql: string; values: unknown[] }> = [];

  if (priceColumns.unitPrice && columns.has("amount")) {
    pricePredicates.push({
      sql: "(line.unit_price = ? OR (line.unit_price = ? AND line.amount <> ROUND(line.quantity * line.unit_price, 2)))",
      values: [OLD_PRICE, NEW_PRICE],
    });
  } else if (priceColumns.unitPrice) {
    pricePredicates.push({
      sql: "line.unit_price = ?",
      values: [OLD_PRICE],
    });
  }
  if (priceColumns.selectedUnitCost) {
    pricePredicates.push({
      sql: "line.selected_unit_cost = ?",
      values: [OLD_PRICE],
    });
  }
  if (priceColumns.costUnitPrice && priceColumns.costAmount) {
    pricePredicates.push({
      sql: "(line.cost_unit_price = ? OR (line.cost_unit_price = ? AND line.cost_amount <> ROUND(line.quantity * line.cost_unit_price, 2)))",
      values: [OLD_PRICE, NEW_PRICE],
    });
  } else if (priceColumns.costUnitPrice) {
    pricePredicates.push({
      sql: "line.cost_unit_price = ?",
      values: [OLD_PRICE],
    });
  }

  if (pricePredicates.length === 0) {
    return {
      tableName: config.tableName,
      affectedRows: [],
      affectedRowCount: 0,
      affectedParentIds: [],
      priceColumns,
    };
  }

  const predicateValues = pricePredicates.flatMap((item) => item.values);
  const baseWhere = `
    line.material_id = ?
    AND (${pricePredicates.map((item) => item.sql).join(" OR ")})
  `;
  const baseValues = [materialId, ...predicateValues];
  const lineTable = quoteIdentifier(config.tableName);
  const parentTable = quoteIdentifier(config.parentTableName);
  const parentForeignKey = quoteIdentifier(config.parentForeignKey);
  const parentPrimaryKey = quoteIdentifier(config.parentPrimaryKey);
  const parentNumberColumn = quoteIdentifier(config.parentNumberColumn);
  const parentTypeColumn = quoteIdentifier(config.parentTypeColumn);
  const parentDateColumn = quoteIdentifier(config.parentDateColumn);

  const affectedRows = await connection.query<AffectedLineRow[]>(
    `
      SELECT
        line.id,
        line.${parentForeignKey} AS parentId,
        parent.${parentNumberColumn} AS parentNo,
        parent.${parentTypeColumn} AS parentType,
        parent.${parentDateColumn} AS bizDate,
        line.quantity,
        ${priceColumns.unitPrice ? "line.unit_price" : "NULL"} AS unitPrice,
        ${columns.has("amount") ? "line.amount" : "NULL"} AS amount,
        ${
          priceColumns.selectedUnitCost ? "line.selected_unit_cost" : "NULL"
        } AS selectedUnitCost,
        ${priceColumns.costUnitPrice ? "line.cost_unit_price" : "NULL"} AS costUnitPrice,
        ${priceColumns.costAmount ? "line.cost_amount" : "NULL"} AS costAmount,
        ROUND(line.quantity * ?, 2) AS newLineAmount
      FROM ${lineTable} line
      JOIN ${parentTable} parent
        ON parent.${parentPrimaryKey} = line.${parentForeignKey}
      WHERE ${baseWhere}
      ORDER BY parent.${parentDateColumn}, parent.${parentNumberColumn}, line.id
    `,
    [NEW_PRICE, ...baseValues],
  );
  const affectedRowCount = await countRows(
    connection,
    `
      SELECT COUNT(*) AS total
      FROM ${lineTable} line
      WHERE ${baseWhere}
    `,
    baseValues,
  );
  const affectedParentIds = [
    ...new Set(affectedRows.map((row) => Number(row.parentId))),
  ].sort((left, right) => left - right);

  return {
    tableName: config.tableName,
    affectedRows,
    affectedRowCount,
    affectedParentIds,
    priceColumns,
  };
}

async function readLineTablePreviews(
  connection: MigrationConnectionLike,
  materialId: number,
): Promise<LineTablePreview[]> {
  const previews: LineTablePreview[] = [];

  for (const config of LINE_TABLES) {
    previews.push(await readAffectedLineRows(connection, config, materialId));
  }

  return previews;
}

async function readInventoryLogOldRows(
  connection: MigrationConnectionLike,
  materialId: number,
): Promise<Array<Record<string, unknown>>> {
  return connection.query<Array<Record<string, unknown>>>(
    `
      SELECT
        id,
        balance_id AS balanceId,
        stock_scope_id AS stockScopeId,
        project_target_id AS projectTargetId,
        biz_date AS bizDate,
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
        AND (
          unit_cost = ?
          OR note LIKE ?
        )
      ORDER BY biz_date, id
    `,
    [NEW_PRICE, materialId, OLD_PRICE, `%${OLD_PRICE}%`],
  );
}

async function readInventoryLogSummary(
  connection: MigrationConnectionLike,
  materialId: number,
) {
  return connection.query(
    `
      SELECT
        unit_cost AS unitCost,
        direction,
        operation_type AS operationType,
        business_document_type AS businessDocumentType,
        COUNT(*) AS rowCount,
        SUM(change_qty) AS quantity,
        SUM(cost_amount) AS costAmount,
        MIN(biz_date) AS minBizDate,
        MAX(biz_date) AS maxBizDate
      FROM inventory_log
      WHERE material_id = ?
      GROUP BY unit_cost, direction, operation_type, business_document_type
      ORDER BY unit_cost, businessDocumentType, operationType, direction
    `,
    [materialId],
  );
}

async function readOldLayerUsageSummary(
  connection: MigrationConnectionLike,
  materialId: number,
) {
  return connection.query(
    `
      SELECT
        usage_row.status,
        COUNT(*) AS rowCount,
        SUM(usage_row.allocated_qty) AS allocatedQty,
        SUM(usage_row.released_qty) AS releasedQty
      FROM inventory_source_usage usage_row
      JOIN inventory_log source_log
        ON source_log.id = usage_row.source_log_id
      WHERE source_log.material_id = ?
        AND source_log.unit_cost = ?
      GROUP BY usage_row.status
      ORDER BY usage_row.status
    `,
    [materialId, OLD_PRICE],
  );
}

async function readMonthlySnapshots(
  connection: MigrationConnectionLike,
  materialId: number,
) {
  return connection.query(
    `
      SELECT
        id,
        \`year_month\` AS yearMonth,
        stock_scope_id AS stockScopeId,
        opening_qty AS openingQty,
        closing_qty AS closingQty,
        total_in_qty AS totalInQty,
        total_in_amount AS totalInAmount,
        total_out_qty AS totalOutQty,
        total_out_amount AS totalOutAmount,
        snapshot_at AS snapshotAt
      FROM inventory_monthly_snapshot
      WHERE material_id = ?
      ORDER BY \`year_month\`, stock_scope_id
    `,
    [materialId],
  );
}

async function readPriceCorrectionRows(
  connection: MigrationConnectionLike,
  materialId: number,
): Promise<Array<Record<string, unknown>>> {
  return connection.query<Array<Record<string, unknown>>>(
    `
      SELECT
        id,
        order_id AS orderId,
        source_inventory_log_id AS sourceInventoryLogId,
        wrong_unit_cost AS wrongUnitCost,
        correct_unit_cost AS correctUnitCost,
        source_in_qty AS sourceInQty,
        consumed_qty_at_correction AS consumedQtyAtCorrection,
        remaining_qty_at_correction AS remainingQtyAtCorrection,
        historical_diff_amount AS historicalDiffAmount
      FROM stock_in_price_correction_order_line
      WHERE material_id = ?
        AND (wrong_unit_cost = ? OR correct_unit_cost = ?)
      ORDER BY id
    `,
    [materialId, OLD_PRICE, OLD_PRICE],
  );
}

async function updateLineTable(
  connection: MigrationConnectionLike,
  config: LineTableConfig,
  materialId: number,
): Promise<number> {
  const columns = await tableColumns(connection, config.tableName);
  const setClauses: string[] = [];
  const whereClauses: string[] = [];
  const whereValues: unknown[] = [];
  const values: unknown[] = [];

  if (columns.has("unit_price")) {
    setClauses.push(
      "amount = CASE WHEN unit_price = ? OR (unit_price = ? AND amount <> ROUND(quantity * unit_price, 2)) THEN ROUND(quantity * ?, 2) ELSE amount END",
      "unit_price = CASE WHEN unit_price = ? THEN ? ELSE unit_price END",
    );
    values.push(OLD_PRICE, NEW_PRICE, NEW_PRICE, OLD_PRICE, NEW_PRICE);
    whereClauses.push(
      "(unit_price = ? OR (unit_price = ? AND amount <> ROUND(quantity * unit_price, 2)))",
    );
    whereValues.push(OLD_PRICE, NEW_PRICE);
  }

  if (columns.has("cost_amount") && columns.has("cost_unit_price")) {
    const selectedCondition = columns.has("selected_unit_cost")
      ? " OR selected_unit_cost = ?"
      : "";
    setClauses.push(
      `cost_amount = CASE WHEN cost_unit_price = ?${selectedCondition} OR (cost_unit_price = ? AND cost_amount <> ROUND(quantity * cost_unit_price, 2)) THEN ROUND(quantity * ?, 2) ELSE cost_amount END`,
    );
    values.push(OLD_PRICE);
    if (columns.has("selected_unit_cost")) values.push(OLD_PRICE);
    values.push(NEW_PRICE, NEW_PRICE);
    whereClauses.push(
      "(cost_unit_price = ? OR (cost_unit_price = ? AND cost_amount <> ROUND(quantity * cost_unit_price, 2)))",
    );
    whereValues.push(OLD_PRICE, NEW_PRICE);
  }

  if (columns.has("selected_unit_cost")) {
    setClauses.push(
      "selected_unit_cost = CASE WHEN selected_unit_cost = ? THEN ? ELSE selected_unit_cost END",
    );
    values.push(OLD_PRICE, NEW_PRICE);
    whereClauses.push("selected_unit_cost = ?");
    whereValues.push(OLD_PRICE);
  }

  if (columns.has("cost_unit_price")) {
    const selectedCondition = columns.has("selected_unit_cost")
      ? " OR selected_unit_cost = ?"
      : "";
    setClauses.push(
      `cost_unit_price = CASE WHEN cost_unit_price = ?${selectedCondition} THEN ? ELSE cost_unit_price END`,
    );
    values.push(OLD_PRICE);
    if (columns.has("selected_unit_cost")) values.push(OLD_PRICE);
    values.push(NEW_PRICE);
    whereClauses.push("cost_unit_price = ?");
    whereValues.push(OLD_PRICE);
  }

  if (setClauses.length === 0 || whereClauses.length === 0) return 0;

  setClauses.push("updated_by = ?", "updated_at = CURRENT_TIMESTAMP");
  values.push(UPDATED_BY);

  const result = await connection.query<{ affectedRows?: number }>(
    `
      UPDATE ${quoteIdentifier(config.tableName)}
      SET ${setClauses.join(", ")}
      WHERE material_id = ?
        AND (${whereClauses.join(" OR ")})
    `,
    [...values, materialId, ...whereValues],
  );

  return numberValue(result?.affectedRows);
}

async function updateInventoryLogs(
  connection: MigrationConnectionLike,
  materialId: number,
): Promise<number> {
  const result = await connection.query<{ affectedRows?: number }>(
    `
      UPDATE inventory_log
      SET
        cost_amount = CASE
          WHEN unit_cost = ? THEN ROUND(change_qty * ?, 2)
          ELSE cost_amount
        END,
        unit_cost = CASE
          WHEN unit_cost = ? THEN ?
          ELSE unit_cost
        END,
        note = CASE
          WHEN note LIKE ? THEN REPLACE(note, ?, ?)
          ELSE note
        END
      WHERE material_id = ?
        AND (
          unit_cost = ?
          OR note LIKE ?
        )
    `,
    [
      OLD_PRICE,
      NEW_PRICE,
      OLD_PRICE,
      NEW_PRICE,
      `%${OLD_PRICE}%`,
      OLD_PRICE,
      NEW_PRICE,
      materialId,
      OLD_PRICE,
      `%${OLD_PRICE}%`,
    ],
  );

  return numberValue(result?.affectedRows);
}

async function updatePriceCorrectionRows(
  connection: MigrationConnectionLike,
  materialId: number,
): Promise<number> {
  const result = await connection.query<{ affectedRows?: number }>(
    `
      UPDATE stock_in_price_correction_order_line
      SET
        wrong_unit_cost = CASE
          WHEN wrong_unit_cost = ? THEN ?
          ELSE wrong_unit_cost
        END,
        correct_unit_cost = CASE
          WHEN correct_unit_cost = ? THEN ?
          ELSE correct_unit_cost
        END,
        historical_diff_amount = ROUND(
          (
            CASE WHEN correct_unit_cost = ? THEN ? ELSE correct_unit_cost END
            - CASE WHEN wrong_unit_cost = ? THEN ? ELSE wrong_unit_cost END
          ) * consumed_qty_at_correction,
          2
        ),
        updated_by = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE material_id = ?
        AND (wrong_unit_cost = ? OR correct_unit_cost = ?)
    `,
    [
      OLD_PRICE,
      NEW_PRICE,
      OLD_PRICE,
      NEW_PRICE,
      OLD_PRICE,
      NEW_PRICE,
      OLD_PRICE,
      NEW_PRICE,
      UPDATED_BY,
      materialId,
      OLD_PRICE,
      OLD_PRICE,
    ],
  );

  return numberValue(result?.affectedRows);
}

async function recalculateStandardParentTotals(
  connection: MigrationConnectionLike,
  config: LineTableConfig,
  parentIds: readonly number[],
): Promise<number> {
  if (parentIds.length === 0) return 0;

  const result = await connection.query<{ affectedRows?: number }>(
    `
      UPDATE ${quoteIdentifier(config.parentTableName)} parent
      JOIN (
        SELECT
          ${quoteIdentifier(config.parentForeignKey)} AS parent_id,
          SUM(quantity) AS total_qty,
          SUM(amount) AS total_amount
        FROM ${quoteIdentifier(config.tableName)}
        WHERE ${quoteIdentifier(config.parentForeignKey)} IN (${placeholders(parentIds)})
        GROUP BY ${quoteIdentifier(config.parentForeignKey)}
      ) totals
        ON totals.parent_id = parent.${quoteIdentifier(config.parentPrimaryKey)}
      SET
        parent.total_qty = totals.total_qty,
        parent.total_amount = totals.total_amount,
        parent.updated_by = ?,
        parent.updated_at = CURRENT_TIMESTAMP
    `,
    [...parentIds, UPDATED_BY],
  );

  return numberValue(result?.affectedRows);
}

async function recalculateRdProjectTotals(
  connection: MigrationConnectionLike,
  parentIds: readonly number[],
): Promise<number> {
  if (parentIds.length === 0) return 0;

  const result = await connection.query<{ affectedRows?: number }>(
    `
      UPDATE rd_project project
      LEFT JOIN (
        SELECT project_id, COUNT(*) AS row_count, SUM(quantity) AS total_qty, SUM(amount) AS total_amount
        FROM rd_project_bom_line
        WHERE project_id IN (${placeholders(parentIds)})
        GROUP BY project_id
      ) bom_totals
        ON bom_totals.project_id = project.id
      LEFT JOIN (
        SELECT project_id, SUM(quantity) AS total_qty, SUM(amount) AS total_amount
        FROM rd_project_material_line
        WHERE project_id IN (${placeholders(parentIds)})
        GROUP BY project_id
      ) material_totals
        ON material_totals.project_id = project.id
      SET
        project.total_qty = CASE
          WHEN COALESCE(bom_totals.row_count, 0) > 0 THEN COALESCE(bom_totals.total_qty, 0)
          ELSE COALESCE(material_totals.total_qty, 0)
        END,
        project.total_amount = CASE
          WHEN COALESCE(bom_totals.row_count, 0) > 0 THEN COALESCE(bom_totals.total_amount, 0)
          ELSE COALESCE(material_totals.total_amount, 0)
        END,
        project.updated_by = ?,
        project.updated_at = CURRENT_TIMESTAMP
      WHERE project.id IN (${placeholders(parentIds)})
    `,
    [...parentIds, ...parentIds, UPDATED_BY, ...parentIds],
  );

  return numberValue(result?.affectedRows);
}

async function recalculateParentTotals(
  connection: MigrationConnectionLike,
  previews: readonly LineTablePreview[],
): Promise<Record<string, number>> {
  const result: Record<string, number> = {};

  for (const config of LINE_TABLES) {
    const preview = previews.find(
      (item) => item.tableName === config.tableName,
    );
    const parentIds = preview?.affectedParentIds ?? [];
    if (parentIds.length === 0) {
      result[config.parentTableName] = result[config.parentTableName] ?? 0;
      continue;
    }

    if (config.parentTableName === "rd_project") {
      const mergedParentIds = [
        ...new Set(
          previews
            .filter((item) =>
              ["rd_project_material_line", "rd_project_bom_line"].includes(
                item.tableName,
              ),
            )
            .flatMap((item) => item.affectedParentIds),
        ),
      ].sort((left, right) => left - right);
      result.rd_project = await recalculateRdProjectTotals(
        connection,
        mergedParentIds,
      );
      continue;
    }

    result[config.parentTableName] = await recalculateStandardParentTotals(
      connection,
      config,
      parentIds,
    );
  }

  return result;
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
      ) calculated
        ON calculated.id = snapshot.id
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

async function buildReportPayload(
  connection: MigrationConnectionLike,
  material: MaterialRow,
) {
  const [
    lineTablePreviews,
    inventoryLogOldRows,
    inventoryLogSummary,
    oldLayerUsageSummary,
    monthlySnapshots,
    priceCorrectionRows,
  ] = await Promise.all([
    readLineTablePreviews(connection, material.id),
    readInventoryLogOldRows(connection, material.id),
    readInventoryLogSummary(connection, material.id),
    readOldLayerUsageSummary(connection, material.id),
    readMonthlySnapshots(connection, material.id),
    readPriceCorrectionRows(connection, material.id),
  ]);

  return {
    material,
    oldPrice: OLD_PRICE,
    newPrice: NEW_PRICE,
    lineTablePreviews,
    inventoryLogOldRows,
    inventoryLogOldRowCount: inventoryLogOldRows.length,
    inventoryLogSummary,
    oldLayerUsageSummary,
    monthlySnapshots,
    priceCorrectionRows,
    priceCorrectionRowCount: priceCorrectionRows.length,
  };
}

async function executeAdjustment(
  connection: MigrationConnectionLike,
  material: MaterialRow,
  beforePreviews: readonly LineTablePreview[],
) {
  const lineTableUpdates: Record<string, number> = {};

  await connection.beginTransaction();
  try {
    for (const config of LINE_TABLES) {
      lineTableUpdates[config.tableName] = await updateLineTable(
        connection,
        config,
        material.id,
      );
    }

    const inventoryLogUpdates = await updateInventoryLogs(
      connection,
      material.id,
    );
    const priceCorrectionUpdates = await updatePriceCorrectionRows(
      connection,
      material.id,
    );
    const parentTotalUpdates = await recalculateParentTotals(
      connection,
      beforePreviews,
    );
    const monthlySnapshotUpdates = await recomputeMonthlySnapshots(
      connection,
      material.id,
    );

    await connection.commit();

    return {
      lineTableUpdates,
      inventoryLogUpdates,
      priceCorrectionUpdates,
      parentTotalUpdates,
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
      const blockers: Array<Record<string, unknown>> = [];

      if (materials.length !== 1) {
        blockers.push({
          reason: "material-code-not-unique-or-missing",
          materialCode: MATERIAL_CODE,
          materialCount: materials.length,
        });
      }

      if (blockers.length > 0) {
        return {
          execute,
          targetDatabase,
          blockers,
          materialCode: MATERIAL_CODE,
          oldPrice: OLD_PRICE,
          newPrice: NEW_PRICE,
        };
      }

      const material = materials[0];
      const before = await buildReportPayload(connection, material);
      let executeResult: Awaited<ReturnType<typeof executeAdjustment>> | null =
        null;

      if (execute) {
        executeResult = await executeAdjustment(
          connection,
          material,
          before.lineTablePreviews,
        );
      }

      const after = execute
        ? await buildReportPayload(connection, material)
        : null;

      return {
        execute,
        targetDatabase,
        blockers,
        updatedBy: UPDATED_BY,
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
