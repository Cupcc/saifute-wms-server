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

const MATERIAL_CODE = process.env.MATERIAL_CODE?.trim() || "cp004";
const EXPECTED_SPEC_MODEL = process.env.EXPECTED_SPEC_MODEL?.trim() || "ZY45X";
const NEW_PRICE = process.env.NEW_PRICE?.trim() || "124.00";
const REPORT_PRICE = NEW_PRICE.replace(/\./gu, "-");
const REPORT_SLUG =
  process.env.REPORT_SLUG?.trim() ||
  `material-${MATERIAL_CODE}-force-price-${REPORT_PRICE}`;
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

interface PriceColumnState {
  unitPrice: boolean;
  amount: boolean;
  selectedUnitCost: boolean;
  costUnitPrice: boolean;
  costAmount: boolean;
}

interface LineTablePreview {
  tableName: string;
  affectedRowCount: number;
  affectedParentIds: number[];
  priceColumns: PriceColumnState;
  distributions: Record<string, unknown[]>;
  rows: Array<Record<string, unknown>>;
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

const PRICE_COLUMNS = [
  "unit_price",
  "selected_unit_cost",
  "cost_unit_price",
  "unit_cost",
  "wrong_unit_cost",
  "correct_unit_cost",
] as const;

const AMOUNT_COLUMNS = [
  "amount",
  "cost_amount",
  "historical_diff_amount",
  "total_amount",
  "total_in_amount",
  "total_out_amount",
] as const;

function assertValidPrice(price: string): void {
  if (!/^\d+(?:\.\d{1,2})?$/u.test(price) || !Number.isFinite(Number(price))) {
    throw new Error(
      `NEW_PRICE must be a positive decimal with at most 2 decimals: ${price}`,
    );
  }
}

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

function priceColumnState(columns: Set<string>): PriceColumnState {
  return {
    unitPrice: columns.has("unit_price"),
    amount: columns.has("amount"),
    selectedUnitCost: columns.has("selected_unit_cost"),
    costUnitPrice: columns.has("cost_unit_price"),
    costAmount: columns.has("cost_amount"),
  };
}

async function readColumnDistribution(
  connection: MigrationConnectionLike,
  tableName: string,
  columns: Set<string>,
  columnName: string,
  materialId: number,
): Promise<unknown[]> {
  const selectParts = [
    `${quoteIdentifier(columnName)} AS value`,
    "COUNT(*) AS rowCount",
    columns.has("quantity") ? "SUM(quantity) AS quantity" : "NULL AS quantity",
    columns.has("amount") ? "SUM(amount) AS amount" : "NULL AS amount",
    columns.has("cost_amount")
      ? "SUM(cost_amount) AS costAmount"
      : "NULL AS costAmount",
    "MIN(id) AS minId",
    "MAX(id) AS maxId",
  ];

  return connection.query(
    `
      SELECT ${selectParts.join(", ")}
      FROM ${quoteIdentifier(tableName)}
      WHERE material_id = ?
      GROUP BY ${quoteIdentifier(columnName)}
      ORDER BY ${quoteIdentifier(columnName)}
    `,
    [materialId],
  );
}

async function readLineTablePreview(
  connection: MigrationConnectionLike,
  config: LineTableConfig,
  materialId: number,
): Promise<LineTablePreview> {
  const columns = await tableColumns(connection, config.tableName);
  const priceColumns = priceColumnState(columns);
  const lineTable = quoteIdentifier(config.tableName);
  const parentTable = quoteIdentifier(config.parentTableName);
  const parentForeignKey = quoteIdentifier(config.parentForeignKey);
  const parentPrimaryKey = quoteIdentifier(config.parentPrimaryKey);
  const parentNumberColumn = quoteIdentifier(config.parentNumberColumn);
  const parentTypeColumn = quoteIdentifier(config.parentTypeColumn);
  const parentDateColumn = quoteIdentifier(config.parentDateColumn);
  const affectedRowCount = await countRows(
    connection,
    `
      SELECT COUNT(*) AS total
      FROM ${lineTable}
      WHERE material_id = ?
    `,
    [materialId],
  );
  const affectedParentIds =
    affectedRowCount === 0
      ? []
      : await connection.query<Array<{ parentId: number }>>(
          `
            SELECT DISTINCT ${parentForeignKey} AS parentId
            FROM ${lineTable}
            WHERE material_id = ?
            ORDER BY ${parentForeignKey}
          `,
          [materialId],
        );

  const distributions: Record<string, unknown[]> = {};
  for (const columnName of PRICE_COLUMNS) {
    if (columns.has(columnName)) {
      distributions[columnName] = await readColumnDistribution(
        connection,
        config.tableName,
        columns,
        columnName,
        materialId,
      );
    }
  }

  const rows =
    affectedRowCount === 0
      ? []
      : await connection.query<Array<Record<string, unknown>>>(
          `
            SELECT
              line.id,
              line.${parentForeignKey} AS parentId,
              ${columns.has("line_no") ? "line.line_no" : "NULL"} AS lineNo,
              parent.${parentNumberColumn} AS parentNo,
              parent.${parentTypeColumn} AS parentType,
              parent.${parentDateColumn} AS bizDate,
              line.quantity,
              ${
                priceColumns.unitPrice ? "line.unit_price" : "NULL"
              } AS unitPrice,
              ${priceColumns.amount ? "line.amount" : "NULL"} AS amount,
              ${
                priceColumns.selectedUnitCost
                  ? "line.selected_unit_cost"
                  : "NULL"
              } AS selectedUnitCost,
              ${
                priceColumns.costUnitPrice ? "line.cost_unit_price" : "NULL"
              } AS costUnitPrice,
              ${
                priceColumns.costAmount ? "line.cost_amount" : "NULL"
              } AS costAmount,
              ROUND(line.quantity * ?, 2) AS targetAmount
            FROM ${lineTable} line
            JOIN ${parentTable} parent
              ON parent.${parentPrimaryKey} = line.${parentForeignKey}
            WHERE line.material_id = ?
            ORDER BY parent.${parentDateColumn}, parent.${parentNumberColumn}, line.id
          `,
          [NEW_PRICE, materialId],
        );

  return {
    tableName: config.tableName,
    affectedRowCount,
    affectedParentIds: affectedParentIds.map((row) => Number(row.parentId)),
    priceColumns,
    distributions,
    rows,
  };
}

async function readLineTablePreviews(
  connection: MigrationConnectionLike,
  materialId: number,
): Promise<LineTablePreview[]> {
  const previews: LineTablePreview[] = [];

  for (const config of LINE_TABLES) {
    const preview = await readLineTablePreview(connection, config, materialId);
    if (preview.affectedRowCount > 0) {
      previews.push(preview);
    }
  }

  return previews;
}

async function readInventoryLogRows(
  connection: MigrationConnectionLike,
  materialId: number,
): Promise<Array<Record<string, unknown>>> {
  return connection.query<Array<Record<string, unknown>>>(
    `
      SELECT
        id,
        balance_id AS balanceId,
        stock_scope_id AS stockScopeId,
        workshop_id AS workshopId,
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
        ROUND(change_qty * ?, 2) AS targetCostAmount,
        reversal_of_log_id AS reversalOfLogId,
        note
      FROM inventory_log
      WHERE material_id = ?
      ORDER BY biz_date, id
    `,
    [NEW_PRICE, materialId],
  );
}

async function readInventoryLogSummary(
  connection: MigrationConnectionLike,
  materialId: number,
): Promise<unknown[]> {
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
      ORDER BY unit_cost, direction, operation_type, business_document_type
    `,
    [materialId],
  );
}

async function readSourceUsageSummary(
  connection: MigrationConnectionLike,
  materialId: number,
): Promise<unknown[]> {
  return connection.query(
    `
      SELECT
        source_log.unit_cost AS sourceUnitCost,
        usage_row.status,
        COUNT(*) AS rowCount,
        SUM(usage_row.allocated_qty) AS allocatedQty,
        SUM(usage_row.released_qty) AS releasedQty
      FROM inventory_source_usage usage_row
      JOIN inventory_log source_log ON source_log.id = usage_row.source_log_id
      WHERE usage_row.material_id = ?
      GROUP BY source_log.unit_cost, usage_row.status
      ORDER BY source_log.unit_cost, usage_row.status
    `,
    [materialId],
  );
}

async function readMonthlySnapshots(
  connection: MigrationConnectionLike,
  materialId: number,
): Promise<unknown[]> {
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
      ORDER BY id
    `,
    [materialId],
  );
}

async function readUnhandledTables(
  connection: MigrationConnectionLike,
  materialId: number,
): Promise<unknown[]> {
  const handledTables = new Set([
    ...LINE_TABLES.map((config) => config.tableName),
    "inventory_log",
    "inventory_monthly_snapshot",
    "stock_in_price_correction_order_line",
  ]);
  const rows = await connection.query<
    Array<{ tableName: string; columnName: string }>
  >(
    `
      SELECT TABLE_NAME AS tableName, COLUMN_NAME AS columnName
      FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND COLUMN_NAME IN (${placeholders([
          "material_id",
          ...PRICE_COLUMNS,
          ...AMOUNT_COLUMNS,
        ])})
      ORDER BY TABLE_NAME, ORDINAL_POSITION
    `,
    ["material_id", ...PRICE_COLUMNS, ...AMOUNT_COLUMNS],
  );
  const columnsByTable = new Map<string, Set<string>>();

  for (const row of rows) {
    if (!columnsByTable.has(row.tableName)) {
      columnsByTable.set(row.tableName, new Set());
    }
    columnsByTable.get(row.tableName)?.add(row.columnName);
  }

  const unhandled: unknown[] = [];
  for (const [tableName, columns] of columnsByTable.entries()) {
    if (
      handledTables.has(tableName) ||
      !columns.has("material_id") ||
      ![...PRICE_COLUMNS, ...AMOUNT_COLUMNS].some((column) =>
        columns.has(column),
      )
    ) {
      continue;
    }

    const rowCount = await countRows(
      connection,
      `
        SELECT COUNT(*) AS total
        FROM ${quoteIdentifier(tableName)}
        WHERE material_id = ?
      `,
      [materialId],
    );
    if (rowCount > 0) {
      unhandled.push({
        tableName,
        rowCount,
        columns: [...columns].filter((column) => column !== "material_id"),
      });
    }
  }

  return unhandled;
}

function lineMismatchPredicate(columns: Set<string>): {
  sql: string;
  values: unknown[];
} {
  const predicates: string[] = [];
  const values: unknown[] = [];

  if (columns.has("unit_price")) {
    predicates.push("(unit_price IS NULL OR unit_price <> ?)");
    values.push(NEW_PRICE);
  }
  if (columns.has("amount") && columns.has("quantity")) {
    predicates.push("(amount IS NULL OR amount <> ROUND(quantity * ?, 2))");
    values.push(NEW_PRICE);
  }
  if (columns.has("selected_unit_cost")) {
    predicates.push("(selected_unit_cost IS NULL OR selected_unit_cost <> ?)");
    values.push(NEW_PRICE);
  }
  if (columns.has("cost_unit_price")) {
    predicates.push("(cost_unit_price IS NULL OR cost_unit_price <> ?)");
    values.push(NEW_PRICE);
  }
  if (columns.has("cost_amount") && columns.has("quantity")) {
    predicates.push(
      "(cost_amount IS NULL OR cost_amount <> ROUND(quantity * ?, 2))",
    );
    values.push(NEW_PRICE);
  }

  return {
    sql: predicates.length > 0 ? predicates.join(" OR ") : "FALSE",
    values,
  };
}

async function readValidation(
  connection: MigrationConnectionLike,
  materialId: number,
): Promise<Record<string, unknown>> {
  const lineTableMismatches: Record<string, number> = {};

  for (const config of LINE_TABLES) {
    const columns = await tableColumns(connection, config.tableName);
    const mismatch = lineMismatchPredicate(columns);
    const count = await countRows(
      connection,
      `
        SELECT COUNT(*) AS total
        FROM ${quoteIdentifier(config.tableName)}
        WHERE material_id = ?
          AND (${mismatch.sql})
      `,
      [materialId, ...mismatch.values],
    );
    if (count > 0) {
      lineTableMismatches[config.tableName] = count;
    }
  }

  const inventoryLogMismatches = await countRows(
    connection,
    `
      SELECT COUNT(*) AS total
      FROM inventory_log
      WHERE material_id = ?
        AND (
          unit_cost IS NULL
          OR unit_cost <> ?
          OR cost_amount IS NULL
          OR cost_amount <> ROUND(change_qty * ?, 2)
        )
    `,
    [materialId, NEW_PRICE, NEW_PRICE],
  );
  const priceCorrectionMismatches = await countRows(
    connection,
    `
      SELECT COUNT(*) AS total
      FROM stock_in_price_correction_order_line
      WHERE material_id = ?
        AND (
          wrong_unit_cost <> ?
          OR correct_unit_cost <> ?
          OR historical_diff_amount <> 0
        )
    `,
    [materialId, NEW_PRICE, NEW_PRICE],
  );
  const sourceUsageMismatches = await countRows(
    connection,
    `
      SELECT COUNT(*) AS total
      FROM inventory_source_usage usage_row
      JOIN inventory_log source_log ON source_log.id = usage_row.source_log_id
      WHERE usage_row.material_id = ?
        AND (source_log.unit_cost IS NULL OR source_log.unit_cost <> ?)
    `,
    [materialId, NEW_PRICE],
  );

  return {
    lineTableMismatches,
    inventoryLogMismatches,
    priceCorrectionMismatches,
    sourceUsageMismatches,
  };
}

async function buildReportPayload(
  connection: MigrationConnectionLike,
  material: MaterialRow,
) {
  const [
    lineTablePreviews,
    inventoryLogRows,
    inventoryLogSummary,
    sourceUsageSummary,
    monthlySnapshots,
    priceCorrectionRows,
    unhandledTables,
    validation,
  ] = await Promise.all([
    readLineTablePreviews(connection, material.id),
    readInventoryLogRows(connection, material.id),
    readInventoryLogSummary(connection, material.id),
    readSourceUsageSummary(connection, material.id),
    readMonthlySnapshots(connection, material.id),
    readPriceCorrectionRows(connection, material.id),
    readUnhandledTables(connection, material.id),
    readValidation(connection, material.id),
  ]);

  return {
    material,
    newPrice: NEW_PRICE,
    lineTablePreviews,
    inventoryLogRows,
    inventoryLogRowCount: inventoryLogRows.length,
    inventoryLogSummary,
    sourceUsageSummary,
    monthlySnapshots,
    priceCorrectionRows,
    priceCorrectionRowCount: priceCorrectionRows.length,
    unhandledTables,
    validation,
  };
}

async function updateLineTable(
  connection: MigrationConnectionLike,
  config: LineTableConfig,
  materialId: number,
): Promise<number> {
  const columns = await tableColumns(connection, config.tableName);
  const setClauses: string[] = [];
  const values: unknown[] = [];

  if (columns.has("unit_price")) {
    setClauses.push("unit_price = ?");
    values.push(NEW_PRICE);
  }
  if (columns.has("amount") && columns.has("quantity")) {
    setClauses.push("amount = ROUND(quantity * ?, 2)");
    values.push(NEW_PRICE);
  }
  if (columns.has("selected_unit_cost")) {
    setClauses.push("selected_unit_cost = ?");
    values.push(NEW_PRICE);
  }
  if (columns.has("cost_unit_price")) {
    setClauses.push("cost_unit_price = ?");
    values.push(NEW_PRICE);
  }
  if (columns.has("cost_amount") && columns.has("quantity")) {
    setClauses.push("cost_amount = ROUND(quantity * ?, 2)");
    values.push(NEW_PRICE);
  }
  if (columns.has("updated_by")) {
    setClauses.push("updated_by = ?");
    values.push(UPDATED_BY);
  }
  if (columns.has("updated_at")) {
    setClauses.push("updated_at = CURRENT_TIMESTAMP");
  }

  const mismatch = lineMismatchPredicate(columns);
  if (setClauses.length === 0 || mismatch.sql === "FALSE") return 0;

  const result = await connection.query<{ affectedRows?: number }>(
    `
      UPDATE ${quoteIdentifier(config.tableName)}
      SET ${setClauses.join(", ")}
      WHERE material_id = ?
        AND (${mismatch.sql})
    `,
    [...values, materialId, ...mismatch.values],
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
        unit_cost = ?,
        cost_amount = ROUND(change_qty * ?, 2)
      WHERE material_id = ?
        AND (
          unit_cost IS NULL
          OR unit_cost <> ?
          OR cost_amount IS NULL
          OR cost_amount <> ROUND(change_qty * ?, 2)
        )
    `,
    [NEW_PRICE, NEW_PRICE, materialId, NEW_PRICE, NEW_PRICE],
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
        wrong_unit_cost = ?,
        correct_unit_cost = ?,
        historical_diff_amount = 0,
        updated_by = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE material_id = ?
        AND (
          wrong_unit_cost <> ?
          OR correct_unit_cost <> ?
          OR historical_diff_amount <> 0
        )
    `,
    [NEW_PRICE, NEW_PRICE, UPDATED_BY, materialId, NEW_PRICE, NEW_PRICE],
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
  const rdProjectParentIds = [
    ...new Set(
      previews
        .filter((preview) =>
          ["rd_project_material_line", "rd_project_bom_line"].includes(
            preview.tableName,
          ),
        )
        .flatMap((preview) => preview.affectedParentIds),
    ),
  ].sort((left, right) => left - right);

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
      result.rd_project =
        result.rd_project ??
        (await recalculateRdProjectTotals(connection, rdProjectParentIds));
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

async function executeAdjustment(
  connection: MigrationConnectionLike,
  material: MaterialRow,
  beforePreviews: readonly LineTablePreview[],
): Promise<Record<string, unknown>> {
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
  assertValidPrice(NEW_PRICE);

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
      const material = materials[0] ?? null;
      if (
        material &&
        EXPECTED_SPEC_MODEL &&
        material.specModel !== EXPECTED_SPEC_MODEL
      ) {
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
          newPrice: NEW_PRICE,
        };
      }

      const before = await buildReportPayload(connection, material);
      if (before.unhandledTables.length > 0) {
        blockers.push({
          reason: "unhandled-material-price-tables",
          unhandledTables: before.unhandledTables,
        });
      }
      if (execute && blockers.length > 0) {
        throw new Error(`Refusing to execute: ${JSON.stringify(blockers)}`);
      }

      const executeResult = execute
        ? await executeAdjustment(
            connection,
            material,
            before.lineTablePreviews,
          )
        : null;
      const after = execute
        ? await buildReportPayload(connection, material)
        : null;

      return {
        execute,
        targetDatabase,
        blockers,
        updatedBy: UPDATED_BY,
        materialCode: MATERIAL_CODE,
        expectedSpecModel: EXPECTED_SPEC_MODEL,
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
