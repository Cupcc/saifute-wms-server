import {
  assertExpectedDatabaseName,
  EXPECTED_TARGET_DATABASE_NAME,
  loadMigrationEnvironment,
  parseMigrationCliOptions,
  resolveReportPath,
} from "../config";
import { closePools, createMariaDbPool, withPoolConnection } from "../db";
import { writeStableReport } from "../shared/report-writer";

type Queryable = {
  query<T = unknown>(sql: string, values?: readonly unknown[]): Promise<T>;
  beginTransaction(): Promise<void>;
  commit(): Promise<void>;
  rollback(): Promise<void>;
};

type NullCountRow = {
  tableName: string;
  totalRows: number;
  nullRows: number;
};

type ConflictRow = {
  materialId: number;
  targetScopeCode: string;
  duplicateCount: number;
};

type WorkshopRefRow = {
  tableName: string;
  workshopId: number;
  workshopCode: string | null;
  workshopName: string | null;
  totalRows: number;
};

const SCOPE_CODE_MAIN = "MAIN";
const SCOPE_CODE_RD_SUB = "RD_SUB";

async function ensureStockScopeSeed(connection: Queryable): Promise<void> {
  await connection.query(
    `
      INSERT INTO stock_scope (
        scopeCode,
        scopeName,
        status,
        createdAt,
        updatedAt
      )
      VALUES
        (?, '主仓', 'ACTIVE', NOW(), NOW()),
        (?, '研发小仓', 'ACTIVE', NOW(), NOW())
      ON DUPLICATE KEY UPDATE
        scopeName = VALUES(scopeName),
        status = VALUES(status),
        updatedAt = NOW()
    `,
    [SCOPE_CODE_MAIN, SCOPE_CODE_RD_SUB],
  );
}

async function readStockScopeIds(connection: Queryable): Promise<{
  MAIN: number;
  RD_SUB: number;
}> {
  const rows = await connection.query<Array<{ scopeCode: string; id: number }>>(
    `
      SELECT scopeCode, id
      FROM stock_scope
      WHERE scopeCode IN (?, ?)
    `,
    [SCOPE_CODE_MAIN, SCOPE_CODE_RD_SUB],
  );

  const byCode = new Map(rows.map((row) => [row.scopeCode, Number(row.id)]));
  const mainId = byCode.get(SCOPE_CODE_MAIN);
  const rdId = byCode.get(SCOPE_CODE_RD_SUB);

  if (!mainId || !rdId) {
    throw new Error("stock_scope seed incomplete: MAIN / RD_SUB missing");
  }

  return {
    MAIN: mainId,
    RD_SUB: rdId,
  };
}

async function getNullCounts(connection: Queryable): Promise<NullCountRow[]> {
  return connection.query<NullCountRow[]>(
    `
      SELECT 'inventory_balance' AS tableName, COUNT(*) AS totalRows, SUM(CASE WHEN stockScopeId IS NULL THEN 1 ELSE 0 END) AS nullRows
      FROM inventory_balance
      UNION ALL
      SELECT 'inventory_log' AS tableName, COUNT(*) AS totalRows, SUM(CASE WHEN stockScopeId IS NULL THEN 1 ELSE 0 END) AS nullRows
      FROM inventory_log
      UNION ALL
      SELECT 'factory_number_reservation' AS tableName, COUNT(*) AS totalRows, SUM(CASE WHEN stockScopeId IS NULL THEN 1 ELSE 0 END) AS nullRows
      FROM factory_number_reservation
      UNION ALL
      SELECT 'stock_in_order' AS tableName, COUNT(*) AS totalRows, SUM(CASE WHEN stockScopeId IS NULL THEN 1 ELSE 0 END) AS nullRows
      FROM stock_in_order
      UNION ALL
      SELECT 'customer_stock_order' AS tableName, COUNT(*) AS totalRows, SUM(CASE WHEN stockScopeId IS NULL THEN 1 ELSE 0 END) AS nullRows
      FROM customer_stock_order
      UNION ALL
      SELECT 'workshop_material_order' AS tableName, COUNT(*) AS totalRows, SUM(CASE WHEN stockScopeId IS NULL THEN 1 ELSE 0 END) AS nullRows
      FROM workshop_material_order
      UNION ALL
      SELECT 'project' AS tableName, COUNT(*) AS totalRows, SUM(CASE WHEN stockScopeId IS NULL THEN 1 ELSE 0 END) AS nullRows
      FROM project
      UNION ALL
      SELECT 'rd_handoff_order' AS tableName, COUNT(*) AS totalRows, SUM(CASE WHEN sourceStockScopeId IS NULL OR targetStockScopeId IS NULL THEN 1 ELSE 0 END) AS nullRows
      FROM rd_handoff_order
      UNION ALL
      SELECT 'rd_procurement_request' AS tableName, COUNT(*) AS totalRows, SUM(CASE WHEN stockScopeId IS NULL THEN 1 ELSE 0 END) AS nullRows
      FROM rd_procurement_request
      UNION ALL
      SELECT 'rd_stocktake_order' AS tableName, COUNT(*) AS totalRows, SUM(CASE WHEN stockScopeId IS NULL THEN 1 ELSE 0 END) AS nullRows
      FROM rd_stocktake_order
    `,
  );
}

async function getInventoryBalanceConflicts(
  connection: Queryable,
): Promise<ConflictRow[]> {
  return connection.query<ConflictRow[]>(
    `
      SELECT
        ib.materialId AS materialId,
        CASE
          WHEN w.workshopCode = 'MAIN' THEN 'MAIN'
          WHEN w.workshopCode IN ('RD', 'RD_SUB') THEN 'RD_SUB'
          ELSE '__UNMAPPED__'
        END AS targetScopeCode,
        COUNT(*) AS duplicateCount
      FROM inventory_balance ib
      JOIN workshop w ON w.id = ib.workshopId
      GROUP BY
        ib.materialId,
        CASE
          WHEN w.workshopCode = 'MAIN' THEN 'MAIN'
          WHEN w.workshopCode IN ('RD', 'RD_SUB') THEN 'RD_SUB'
          ELSE '__UNMAPPED__'
        END
      HAVING targetScopeCode <> '__UNMAPPED__' AND COUNT(*) > 1
      ORDER BY duplicateCount DESC, materialId ASC
    `,
  );
}

async function getUnmappedWorkshopReferences(
  connection: Queryable,
): Promise<WorkshopRefRow[]> {
  return connection.query<WorkshopRefRow[]>(
    `
      SELECT
        refs.tableName AS tableName,
        refs.workshopId AS workshopId,
        w.workshopCode AS workshopCode,
        w.workshopName AS workshopName,
        COUNT(*) AS totalRows
      FROM (
        SELECT 'inventory_balance' AS tableName, workshopId FROM inventory_balance WHERE stockScopeId IS NULL
        UNION ALL
        SELECT 'inventory_log' AS tableName, workshopId FROM inventory_log WHERE stockScopeId IS NULL
        UNION ALL
        SELECT 'factory_number_reservation' AS tableName, workshopId FROM factory_number_reservation WHERE stockScopeId IS NULL
        UNION ALL
        SELECT 'rd_procurement_request' AS tableName, workshopId FROM rd_procurement_request WHERE stockScopeId IS NULL
        UNION ALL
        SELECT 'rd_stocktake_order' AS tableName, workshopId FROM rd_stocktake_order WHERE stockScopeId IS NULL
        UNION ALL
        SELECT 'rd_handoff_order.source' AS tableName, sourceWorkshopId AS workshopId FROM rd_handoff_order WHERE sourceStockScopeId IS NULL
        UNION ALL
        SELECT 'rd_handoff_order.target' AS tableName, targetWorkshopId AS workshopId FROM rd_handoff_order WHERE targetStockScopeId IS NULL
      ) refs
      JOIN workshop w ON w.id = refs.workshopId
      WHERE w.workshopCode NOT IN ('MAIN', 'RD', 'RD_SUB')
      GROUP BY refs.tableName, refs.workshopId, w.workshopCode, w.workshopName
      ORDER BY refs.tableName ASC, refs.workshopId ASC
    `,
  );
}

async function executeBackfill(
  connection: Queryable,
  stockScopeIds: { MAIN: number; RD_SUB: number },
): Promise<Record<string, number>> {
  const updates: Record<string, number> = {};

  const stockInResult = await connection.query<{ affectedRows?: number }>(
    `
      UPDATE stock_in_order
      SET stockScopeId = ?
      WHERE stockScopeId IS NULL
    `,
    [stockScopeIds.MAIN],
  );
  updates.stockInOrder = Number(stockInResult.affectedRows ?? 0);

  const customerResult = await connection.query<{ affectedRows?: number }>(
    `
      UPDATE customer_stock_order
      SET stockScopeId = ?
      WHERE stockScopeId IS NULL
    `,
    [stockScopeIds.MAIN],
  );
  updates.customerStockOrder = Number(customerResult.affectedRows ?? 0);

  const workshopMaterialResult = await connection.query<{
    affectedRows?: number;
  }>(
    `
      UPDATE workshop_material_order wmo
      JOIN workshop w ON w.id = wmo.workshopId
      SET wmo.stockScopeId =
        CASE
          WHEN wmo.orderType = 'SCRAP' AND w.workshopCode IN ('RD', 'RD_SUB') THEN ?
          ELSE ?
        END
      WHERE wmo.stockScopeId IS NULL
    `,
    [stockScopeIds.RD_SUB, stockScopeIds.MAIN],
  );
  updates.workshopMaterialOrder = Number(
    workshopMaterialResult.affectedRows ?? 0,
  );

  const projectResult = await connection.query<{ affectedRows?: number }>(
    `
      UPDATE project p
      JOIN workshop w ON w.id = p.workshopId
      SET p.stockScopeId =
        CASE
          WHEN w.workshopCode IN ('RD', 'RD_SUB') THEN ?
          ELSE ?
        END
      WHERE p.stockScopeId IS NULL
    `,
    [stockScopeIds.RD_SUB, stockScopeIds.MAIN],
  );
  updates.project = Number(projectResult.affectedRows ?? 0);

  const rdHandoffResult = await connection.query<{ affectedRows?: number }>(
    `
      UPDATE rd_handoff_order rho
      JOIN workshop sw ON sw.id = rho.sourceWorkshopId
      JOIN workshop tw ON tw.id = rho.targetWorkshopId
      SET
        rho.sourceStockScopeId =
          CASE
            WHEN sw.workshopCode IN ('RD', 'RD_SUB') THEN ?
            WHEN sw.workshopCode = 'MAIN' THEN ?
            ELSE rho.sourceStockScopeId
          END,
        rho.targetStockScopeId =
          CASE
            WHEN tw.workshopCode IN ('RD', 'RD_SUB') THEN ?
            WHEN tw.workshopCode = 'MAIN' THEN ?
            ELSE rho.targetStockScopeId
          END
      WHERE rho.sourceStockScopeId IS NULL OR rho.targetStockScopeId IS NULL
    `,
    [
      stockScopeIds.RD_SUB,
      stockScopeIds.MAIN,
      stockScopeIds.RD_SUB,
      stockScopeIds.MAIN,
    ],
  );
  updates.rdHandoffOrder = Number(rdHandoffResult.affectedRows ?? 0);

  const rdProcurementResult = await connection.query<{ affectedRows?: number }>(
    `
      UPDATE rd_procurement_request
      SET stockScopeId = ?
      WHERE stockScopeId IS NULL
    `,
    [stockScopeIds.RD_SUB],
  );
  updates.rdProcurementRequest = Number(rdProcurementResult.affectedRows ?? 0);

  const rdStocktakeResult = await connection.query<{ affectedRows?: number }>(
    `
      UPDATE rd_stocktake_order
      SET stockScopeId = ?
      WHERE stockScopeId IS NULL
    `,
    [stockScopeIds.RD_SUB],
  );
  updates.rdStocktakeOrder = Number(rdStocktakeResult.affectedRows ?? 0);

  const inventoryLogResult = await connection.query<{ affectedRows?: number }>(
    `
      UPDATE inventory_log il
      JOIN workshop w ON w.id = il.workshopId
      SET il.stockScopeId =
        CASE
          WHEN w.workshopCode IN ('RD', 'RD_SUB') THEN ?
          WHEN w.workshopCode = 'MAIN' THEN ?
          ELSE il.stockScopeId
        END
      WHERE il.stockScopeId IS NULL
    `,
    [stockScopeIds.RD_SUB, stockScopeIds.MAIN],
  );
  updates.inventoryLog = Number(inventoryLogResult.affectedRows ?? 0);

  const reservationResult = await connection.query<{ affectedRows?: number }>(
    `
      UPDATE factory_number_reservation fnr
      JOIN workshop w ON w.id = fnr.workshopId
      SET fnr.stockScopeId =
        CASE
          WHEN w.workshopCode IN ('RD', 'RD_SUB') THEN ?
          WHEN w.workshopCode = 'MAIN' THEN ?
          ELSE fnr.stockScopeId
        END
      WHERE fnr.stockScopeId IS NULL
    `,
    [stockScopeIds.RD_SUB, stockScopeIds.MAIN],
  );
  updates.factoryNumberReservation = Number(
    reservationResult.affectedRows ?? 0,
  );

  const balanceResult = await connection.query<{ affectedRows?: number }>(
    `
      UPDATE inventory_balance ib
      JOIN workshop w ON w.id = ib.workshopId
      SET ib.stockScopeId =
        CASE
          WHEN w.workshopCode IN ('RD', 'RD_SUB') THEN ?
          WHEN w.workshopCode = 'MAIN' THEN ?
          ELSE ib.stockScopeId
        END
      WHERE ib.stockScopeId IS NULL
    `,
    [stockScopeIds.RD_SUB, stockScopeIds.MAIN],
  );
  updates.inventoryBalance = Number(balanceResult.affectedRows ?? 0);

  return updates;
}

async function main(): Promise<void> {
  const cliOptions = parseMigrationCliOptions();
  const reportPath = resolveReportPath(
    cliOptions,
    cliOptions.execute
      ? "stock-scope-phase2-execute-report.json"
      : "stock-scope-phase2-dry-run-report.json",
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
      const [nullCounts, conflicts, unmappedReferences] = await Promise.all([
        getNullCounts(connection),
        getInventoryBalanceConflicts(connection),
        getUnmappedWorkshopReferences(connection),
      ]);

      const executeBlockers: Array<Record<string, unknown>> = [];
      if (conflicts.length > 0) {
        executeBlockers.push({
          reason:
            "inventory_balance contains multiple rows that would collapse into the same materialId + stockScopeId bucket.",
          conflictCount: conflicts.length,
          sample: conflicts.slice(0, 20),
        });
      }
      if (unmappedReferences.length > 0) {
        executeBlockers.push({
          reason:
            "Some legacy workshop references cannot be mapped to canonical MAIN / RD_SUB.",
          unmappedCount: unmappedReferences.length,
          sample: unmappedReferences.slice(0, 20),
        });
      }

      const dryRunReport = {
        mode: cliOptions.execute ? "execute" : "dry-run",
        targetDatabaseName,
        nullCounts,
        inventoryBalanceConflicts: conflicts,
        unmappedWorkshopReferences: unmappedReferences,
        executeBlockers,
      };

      if (!cliOptions.execute) {
        writeStableReport(reportPath, dryRunReport);
        console.log(
          `stock-scope-phase2 dry-run completed. report=${reportPath}`,
        );
        if (executeBlockers.length > 0) {
          process.exitCode = 1;
        }
        return dryRunReport;
      }

      if (executeBlockers.length > 0 && !cliOptions.allowBlockers) {
        writeStableReport(reportPath, dryRunReport);
        process.exitCode = 1;
        return dryRunReport;
      }

      await connection.beginTransaction();
      try {
        await ensureStockScopeSeed(connection);
        const stockScopeIds = await readStockScopeIds(connection);
        const executionResult = await executeBackfill(
          connection,
          stockScopeIds,
        );
        await connection.commit();

        const executeReport = {
          ...dryRunReport,
          executionRequested: true,
          allowBlockers: cliOptions.allowBlockers,
          stockScopeIds,
          executionResult,
          postExecuteNullCounts: await getNullCounts(connection),
        };
        writeStableReport(reportPath, executeReport);
        console.log(
          `stock-scope-phase2 execute completed. report=${reportPath}`,
        );
        return executeReport;
      } catch (error) {
        await connection.rollback();
        throw error;
      }
    });

    if (
      Array.isArray(
        (report as { executeBlockers?: unknown[] }).executeBlockers,
      ) &&
      (report as { executeBlockers?: unknown[] }).executeBlockers?.length > 0 &&
      !cliOptions.execute
    ) {
      process.exitCode = 1;
    }
  } finally {
    await closePools(targetPool);
  }
}

void main();
