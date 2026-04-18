import {
  assertExpectedDatabaseName,
  EXPECTED_TARGET_DATABASE_NAME,
  loadMigrationEnvironment,
  parseMigrationCliOptions,
  resolveReportPath,
} from "../config";
import { closePools, createMariaDbPool, withPoolConnection } from "../db";
import { writeStableReport } from "../shared/report-writer";

interface MigrationConnection {
  query<T = unknown>(sql: string, values?: readonly unknown[]): Promise<T>;
}

interface CategoryRow {
  id: number;
  categoryCode: string;
  categoryName: string;
}

interface MaterialRow {
  id: number;
  categoryId: number | null;
}

interface PendingLineRow {
  id: number;
  materialId: number;
}

interface SnapshotPayload {
  categoryId: number | null;
  categoryCode: string | null;
  categoryName: string;
  categoryPathSnapshot: string;
  usedFallback: boolean;
}

const DEFAULT_CATEGORY_CODE = "UNCATEGORIZED";
const DEFAULT_BACKFILL_BATCH_SIZE = 500;

const STOCK_IN_TABLE = "stock_in_order_line";
const SALES_TABLE = "sales_stock_order_line";
const SNAPSHOT_COLUMNS = [
  {
    name: "materialCategoryIdSnapshot",
    sql: "ADD COLUMN `materialCategoryIdSnapshot` INT NULL",
  },
  {
    name: "materialCategoryCodeSnapshot",
    sql: "ADD COLUMN `materialCategoryCodeSnapshot` VARCHAR(64) NULL",
  },
  {
    name: "materialCategoryNameSnapshot",
    sql: "ADD COLUMN `materialCategoryNameSnapshot` VARCHAR(128) NULL",
  },
  {
    name: "materialCategoryPathSnapshot",
    sql: "ADD COLUMN `materialCategoryPathSnapshot` JSON NULL",
  },
] as const;

function buildMissingSnapshotWhereClause() {
  return `(
    materialCategoryIdSnapshot IS NULL
    OR materialCategoryCodeSnapshot IS NULL
    OR materialCategoryNameSnapshot IS NULL
    OR materialCategoryPathSnapshot IS NULL
  )`;
}

async function getExistingColumns(
  connection: MigrationConnection,
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

async function ensureSnapshotColumns(
  connection: MigrationConnection,
  tableName: string,
  execute: boolean,
): Promise<{
  missingColumns: string[];
  addedColumns: string[];
}> {
  const existingColumns = await getExistingColumns(connection, tableName);
  const missingColumns = SNAPSHOT_COLUMNS.filter(
    (column) => !existingColumns.has(column.name),
  );

  if (!execute || missingColumns.length === 0) {
    return {
      missingColumns: missingColumns.map((column) => column.name),
      addedColumns: [],
    };
  }

  await connection.query(
    `
      ALTER TABLE \`${tableName}\`
      ${missingColumns.map((column) => column.sql).join(",\n      ")}
    `,
  );

  return {
    missingColumns: [],
    addedColumns: missingColumns.map((column) => column.name),
  };
}

async function countMissingSnapshotRows(
  connection: MigrationConnection,
  tableName: string,
  snapshotColumnsReady: boolean,
): Promise<number> {
  if (!snapshotColumnsReady) {
    const rows = await connection.query<Array<{ total: number }>>(
      `
        SELECT COUNT(*) AS total
        FROM \`${tableName}\`
      `,
    );

    return Number(rows[0]?.total ?? 0);
  }

  const rows = await connection.query<Array<{ total: number }>>(
    `
      SELECT COUNT(*) AS total
      FROM \`${tableName}\`
      WHERE ${buildMissingSnapshotWhereClause()}
    `,
  );

  return Number(rows[0]?.total ?? 0);
}

async function countMissingMaterialRows(
  connection: MigrationConnection,
  tableName: string,
  snapshotColumnsReady: boolean,
): Promise<number> {
  const rows = await connection.query<Array<{ total: number }>>(
    `
      SELECT COUNT(*) AS total
      FROM \`${tableName}\` line
      LEFT JOIN material material ON material.id = line.materialId
      WHERE ${
        snapshotColumnsReady ? `${buildMissingSnapshotWhereClause()} AND ` : ""
      } material.id IS NULL
    `,
  );

  return Number(rows[0]?.total ?? 0);
}

async function readPendingLineBatch(
  connection: MigrationConnection,
  tableName: string,
  snapshotColumnsReady: boolean,
  afterId: number,
  limit: number,
): Promise<PendingLineRow[]> {
  if (!snapshotColumnsReady) {
    return connection.query<PendingLineRow[]>(
      `
        SELECT id, materialId
        FROM \`${tableName}\`
        WHERE id > ?
        ORDER BY id ASC
        LIMIT ?
      `,
      [afterId, limit],
    );
  }

  return connection.query<PendingLineRow[]>(
    `
      SELECT id, materialId
      FROM \`${tableName}\`
      WHERE ${buildMissingSnapshotWhereClause()}
        AND id > ?
      ORDER BY id ASC
      LIMIT ?
    `,
    [afterId, limit],
  );
}

async function readMaterials(
  connection: MigrationConnection,
  materialIds: number[],
): Promise<Map<number, MaterialRow>> {
  if (materialIds.length === 0) {
    return new Map();
  }

  const placeholders = materialIds.map(() => "?").join(", ");
  const rows = await connection.query<MaterialRow[]>(
    `
      SELECT id, categoryId
      FROM material
      WHERE id IN (${placeholders})
    `,
    materialIds,
  );

  return new Map(rows.map((row) => [row.id, row]));
}

async function readCategories(
  connection: MigrationConnection,
): Promise<Map<number, CategoryRow>> {
  const rows = await connection.query<CategoryRow[]>(
    `
      SELECT
        id,
        categoryCode,
        categoryName
      FROM material_category
    `,
  );

  return new Map(rows.map((row) => [row.id, row]));
}

function buildSnapshotPayload(
  materialId: number,
  materialMap: Map<number, MaterialRow>,
  categoryMap: Map<number, CategoryRow>,
  defaultCategory: CategoryRow | null,
): SnapshotPayload {
  const material = materialMap.get(materialId) ?? null;
  const resolvedCategory =
    (material?.categoryId != null
      ? (categoryMap.get(material.categoryId) ?? null)
      : null) ?? defaultCategory;

  if (!resolvedCategory) {
    throw new Error(
      `Cannot resolve material-category snapshot for materialId=${materialId}; default category ${DEFAULT_CATEGORY_CODE} is missing.`,
    );
  }

  const normalizedPath = [
    {
      id: resolvedCategory.id,
      categoryCode: resolvedCategory.categoryCode,
      categoryName: resolvedCategory.categoryName,
    },
  ];

  return {
    categoryId: resolvedCategory.id,
    categoryCode: resolvedCategory.categoryCode,
    categoryName: resolvedCategory.categoryName,
    categoryPathSnapshot: JSON.stringify(normalizedPath),
    usedFallback:
      material == null ||
      material.categoryId == null ||
      material.categoryId !== resolvedCategory.id,
  };
}

async function applyBackfillBatch(
  connection: MigrationConnection & {
    beginTransaction(): Promise<void>;
    commit(): Promise<void>;
    rollback(): Promise<void>;
  },
  tableName: string,
  pendingLines: PendingLineRow[],
  materialMap: Map<number, MaterialRow>,
  categoryMap: Map<number, CategoryRow>,
  defaultCategory: CategoryRow | null,
): Promise<{
  updatedRows: number;
  fallbackRows: number;
}> {
  if (pendingLines.length === 0) {
    return {
      updatedRows: 0,
      fallbackRows: 0,
    };
  }

  let fallbackRows = 0;

  await connection.beginTransaction();
  try {
    for (const line of pendingLines) {
      const payload = buildSnapshotPayload(
        line.materialId,
        materialMap,
        categoryMap,
        defaultCategory,
      );

      if (payload.usedFallback) {
        fallbackRows += 1;
      }

      await connection.query(
        `
          UPDATE \`${tableName}\`
          SET
            materialCategoryIdSnapshot = ?,
            materialCategoryCodeSnapshot = ?,
            materialCategoryNameSnapshot = ?,
            materialCategoryPathSnapshot = ?
          WHERE id = ?
        `,
        [
          payload.categoryId,
          payload.categoryCode,
          payload.categoryName,
          payload.categoryPathSnapshot,
          line.id,
        ],
      );
    }

    await connection.commit();
    return {
      updatedRows: pendingLines.length,
      fallbackRows,
    };
  } catch (error) {
    await connection.rollback();
    throw error;
  }
}

async function applyBackfillInBatches(
  connection: MigrationConnection & {
    beginTransaction(): Promise<void>;
    commit(): Promise<void>;
    rollback(): Promise<void>;
  },
  tableName: string,
  snapshotColumnsReady: boolean,
  categoryMap: Map<number, CategoryRow>,
  defaultCategory: CategoryRow | null,
  batchSize: number,
): Promise<{
  updatedRows: number;
  fallbackRows: number;
  batchCount: number;
}> {
  let updatedRows = 0;
  let fallbackRows = 0;
  let batchCount = 0;
  let lastProcessedId = 0;

  while (true) {
    const pendingLines = await readPendingLineBatch(
      connection,
      tableName,
      snapshotColumnsReady,
      lastProcessedId,
      batchSize,
    );
    if (pendingLines.length === 0) {
      break;
    }

    const materialIds = [
      ...new Set(pendingLines.map((line) => line.materialId)),
    ];
    const materialMap = await readMaterials(connection, materialIds);
    const batchResult = await applyBackfillBatch(
      connection,
      tableName,
      pendingLines,
      materialMap,
      categoryMap,
      defaultCategory,
    );

    updatedRows += batchResult.updatedRows;
    fallbackRows += batchResult.fallbackRows;
    batchCount += 1;
    lastProcessedId =
      pendingLines[pendingLines.length - 1]?.id ?? lastProcessedId;
  }

  return {
    updatedRows,
    fallbackRows,
    batchCount,
  };
}

async function main() {
  const cliOptions = parseMigrationCliOptions();
  const reportPath = resolveReportPath(
    cliOptions,
    cliOptions.execute
      ? "monthly-reporting-material-category-snapshot-execute-report.json"
      : "monthly-reporting-material-category-snapshot-dry-run-report.json",
  );
  const env = loadMigrationEnvironment({ requireLegacyDatabaseUrl: false });
  const targetDatabaseName = assertExpectedDatabaseName(
    env.databaseUrl,
    EXPECTED_TARGET_DATABASE_NAME,
    "Target",
  );

  const targetPool = createMariaDbPool(env.databaseUrl);

  try {
    const report = await withPoolConnection(targetPool, async (connection) => {
      const stockInSchema = await ensureSnapshotColumns(
        connection,
        STOCK_IN_TABLE,
        cliOptions.execute,
      );
      const stockInSnapshotColumnsReady =
        cliOptions.execute || stockInSchema.missingColumns.length === 0;
      const salesSchema = await ensureSnapshotColumns(
        connection,
        SALES_TABLE,
        cliOptions.execute,
      );
      const salesSnapshotColumnsReady =
        cliOptions.execute || salesSchema.missingColumns.length === 0;
      const categories = await readCategories(connection);
      const defaultCategory =
        [...categories.values()].find(
          (category) => category.categoryCode === DEFAULT_CATEGORY_CODE,
        ) ?? null;
      const batchSize = DEFAULT_BACKFILL_BATCH_SIZE;
      const stockInMissingSnapshotRows = await countMissingSnapshotRows(
        connection,
        STOCK_IN_TABLE,
        stockInSnapshotColumnsReady,
      );
      const salesMissingSnapshotRows = await countMissingSnapshotRows(
        connection,
        SALES_TABLE,
        salesSnapshotColumnsReady,
      );

      const blockers: string[] = [];
      if (!defaultCategory) {
        blockers.push(
          `Default material category ${DEFAULT_CATEGORY_CODE} is missing.`,
        );
      }

      const stockInMissingMaterials = await countMissingMaterialRows(
        connection,
        STOCK_IN_TABLE,
        stockInSnapshotColumnsReady,
      );
      const salesMissingMaterials = await countMissingMaterialRows(
        connection,
        SALES_TABLE,
        salesSnapshotColumnsReady,
      );

      const dryRunReport = {
        mode: cliOptions.execute ? "execute" : "dry-run",
        targetDatabaseName,
        batchSize,
        blockers,
        schema: {
          [STOCK_IN_TABLE]: stockInSchema,
          [SALES_TABLE]: salesSchema,
        },
        counts: {
          stockInMissingSnapshotRows,
          salesMissingSnapshotRows,
          stockInMissingMaterialRows: stockInMissingMaterials,
          salesMissingMaterialRows: salesMissingMaterials,
          stockInCurrentMissingCount: stockInMissingSnapshotRows,
          salesCurrentMissingCount: salesMissingSnapshotRows,
        },
      };

      if (!cliOptions.execute || blockers.length > 0) {
        if (cliOptions.execute && blockers.length > 0) {
          process.exitCode = 1;
        }
        return dryRunReport;
      }

      const stockInResult = await applyBackfillInBatches(
        connection,
        STOCK_IN_TABLE,
        stockInSnapshotColumnsReady,
        categories,
        defaultCategory,
        batchSize,
      );
      const salesResult = await applyBackfillInBatches(
        connection,
        SALES_TABLE,
        salesSnapshotColumnsReady,
        categories,
        defaultCategory,
        batchSize,
      );

      return {
        ...dryRunReport,
        execution: {
          stockInBatchCount: stockInResult.batchCount,
          salesBatchCount: salesResult.batchCount,
          stockInUpdatedRows: stockInResult.updatedRows,
          salesUpdatedRows: salesResult.updatedRows,
          stockInFallbackRows: stockInResult.fallbackRows,
          salesFallbackRows: salesResult.fallbackRows,
          stockInRemainingMissingCount: await countMissingSnapshotRows(
            connection,
            STOCK_IN_TABLE,
            true,
          ),
          salesRemainingMissingCount: await countMissingSnapshotRows(
            connection,
            SALES_TABLE,
            true,
          ),
        },
      };
    });

    writeStableReport(reportPath, report);
    console.log(
      cliOptions.execute
        ? `Monthly-reporting material-category snapshot execute completed. report=${reportPath}`
        : `Monthly-reporting material-category snapshot dry-run completed. report=${reportPath}`,
    );
  } finally {
    await closePools(targetPool);
  }
}

void main();
