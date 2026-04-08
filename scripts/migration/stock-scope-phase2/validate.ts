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
};

type ValidationIssue = {
  severity: "blocker" | "warning";
  reason: string;
  details?: Record<string, unknown>;
};

async function getScopePresence(connection: Queryable) {
  return connection.query<Array<{ scopeCode: string; total: number }>>(
    `
      SELECT scopeCode, COUNT(*) AS total
      FROM stock_scope
      WHERE scopeCode IN ('MAIN', 'RD_SUB')
      GROUP BY scopeCode
      ORDER BY scopeCode ASC
    `,
  );
}

async function getNullCounts(connection: Queryable) {
  return connection.query<
    Array<{ tableName: string; totalRows: number; nullRows: number }>
  >(
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

async function getBalanceConflicts(connection: Queryable) {
  return connection.query<
    Array<{ materialId: number; stockScopeId: number; duplicateCount: number }>
  >(
    `
      SELECT materialId, stockScopeId, COUNT(*) AS duplicateCount
      FROM inventory_balance
      WHERE stockScopeId IS NOT NULL
      GROUP BY materialId, stockScopeId
      HAVING COUNT(*) > 1
      ORDER BY duplicateCount DESC, materialId ASC
    `,
  );
}

async function getMainOrderDrift(connection: Queryable) {
  return connection.query<Array<{ tableName: string; unexpectedRows: number }>>(
    `
      SELECT 'stock_in_order' AS tableName, COUNT(*) AS unexpectedRows
      FROM stock_in_order sio
      JOIN stock_scope ss ON ss.id = sio.stockScopeId
      WHERE ss.scopeCode <> 'MAIN'
      UNION ALL
      SELECT 'customer_stock_order' AS tableName, COUNT(*) AS unexpectedRows
      FROM customer_stock_order cso
      JOIN stock_scope ss ON ss.id = cso.stockScopeId
      WHERE ss.scopeCode <> 'MAIN'
    `,
  );
}

async function getWorkshopMaterialDrift(connection: Queryable) {
  return connection.query<
    Array<{
      orderType: string;
      workshopName: string;
      scopeCode: string;
      totalRows: number;
    }>
  >(
    `
      SELECT
        wmo.orderType AS orderType,
        w.workshopName AS workshopName,
        ss.scopeCode AS scopeCode,
        COUNT(*) AS totalRows
      FROM workshop_material_order wmo
      JOIN workshop w ON w.id = wmo.workshopId
      JOIN stock_scope ss ON ss.id = wmo.stockScopeId
      WHERE
        (wmo.orderType IN ('PICK', 'RETURN') AND ss.scopeCode <> 'MAIN')
        OR
        (wmo.orderType = 'SCRAP' AND w.workshopName = '研发小仓' AND ss.scopeCode <> 'RD_SUB')
        OR
        (wmo.orderType = 'SCRAP' AND w.workshopName = '主仓' AND ss.scopeCode <> 'MAIN')
      GROUP BY wmo.orderType, w.workshopName, ss.scopeCode
    `,
  );
}

async function getRdDrift(connection: Queryable) {
  return connection.query<
    Array<{
      tableName: string;
      detail: string;
      totalRows: number;
    }>
  >(
    `
      SELECT
        'rd_procurement_request' AS tableName,
        ss.scopeCode AS detail,
        COUNT(*) AS totalRows
      FROM rd_procurement_request rpr
      JOIN stock_scope ss ON ss.id = rpr.stockScopeId
      WHERE ss.scopeCode <> 'RD_SUB'
      GROUP BY ss.scopeCode
      UNION ALL
      SELECT
        'rd_stocktake_order' AS tableName,
        ss.scopeCode AS detail,
        COUNT(*) AS totalRows
      FROM rd_stocktake_order rso
      JOIN stock_scope ss ON ss.id = rso.stockScopeId
      WHERE ss.scopeCode <> 'RD_SUB'
      GROUP BY ss.scopeCode
      UNION ALL
      SELECT
        'rd_handoff_order.source' AS tableName,
        ss.scopeCode AS detail,
        COUNT(*) AS totalRows
      FROM rd_handoff_order rho
      JOIN stock_scope ss ON ss.id = rho.sourceStockScopeId
      WHERE ss.scopeCode <> 'MAIN'
      GROUP BY ss.scopeCode
      UNION ALL
      SELECT
        'rd_handoff_order.target' AS tableName,
        ss.scopeCode AS detail,
        COUNT(*) AS totalRows
      FROM rd_handoff_order rho
      JOIN stock_scope ss ON ss.id = rho.targetStockScopeId
      WHERE ss.scopeCode <> 'RD_SUB'
      GROUP BY ss.scopeCode
    `,
  );
}

async function main(): Promise<void> {
  const cliOptions = parseMigrationCliOptions();
  const reportPath = resolveReportPath(
    cliOptions,
    "stock-scope-phase2-validate-report.json",
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
      const [
        scopePresence,
        nullCounts,
        balanceConflicts,
        mainOrderDrift,
        workshopMaterialDrift,
        rdDrift,
      ] = await Promise.all([
        getScopePresence(connection),
        getNullCounts(connection),
        getBalanceConflicts(connection),
        getMainOrderDrift(connection),
        getWorkshopMaterialDrift(connection),
        getRdDrift(connection),
      ]);

      const validationIssues: ValidationIssue[] = [];

      const scopeCodes = new Set(scopePresence.map((row) => row.scopeCode));
      if (!scopeCodes.has("MAIN") || !scopeCodes.has("RD_SUB")) {
        validationIssues.push({
          severity: "blocker",
          reason:
            "stock_scope does not contain both MAIN and RD_SUB canonical rows.",
          details: { scopePresence },
        });
      }

      for (const row of nullCounts) {
        if (Number(row.nullRows) > 0) {
          validationIssues.push({
            severity: "blocker",
            reason: `${row.tableName} still contains rows with null stockScopeId.`,
            details: row,
          });
        }
      }

      if (balanceConflicts.length > 0) {
        validationIssues.push({
          severity: "blocker",
          reason:
            "inventory_balance still contains duplicate materialId + stockScopeId buckets.",
          details: { sample: balanceConflicts.slice(0, 20) },
        });
      }

      for (const row of mainOrderDrift) {
        if (Number(row.unexpectedRows) > 0) {
          validationIssues.push({
            severity: "blocker",
            reason: `${row.tableName} contains rows not mapped to MAIN.`,
            details: row,
          });
        }
      }

      if (workshopMaterialDrift.length > 0) {
        validationIssues.push({
          severity: "blocker",
          reason:
            "workshop_material_order contains rows whose stockScopeId does not match current business rules.",
          details: { sample: workshopMaterialDrift.slice(0, 20) },
        });
      }

      if (rdDrift.length > 0) {
        validationIssues.push({
          severity: "blocker",
          reason:
            "rd-subwarehouse persistence rows contain stockScopeId values that do not match current business rules.",
          details: { sample: rdDrift.slice(0, 20) },
        });
      }

      return {
        mode: "validate",
        targetDatabaseName,
        scopePresence,
        nullCounts,
        balanceConflicts,
        mainOrderDrift,
        workshopMaterialDrift,
        rdDrift,
        validationIssues,
      };
    });

    writeStableReport(reportPath, report);
    console.log(`stock-scope-phase2 validate completed. report=${reportPath}`);

    if (
      report.validationIssues.some(
        (issue: ValidationIssue) => issue.severity === "blocker",
      )
    ) {
      process.exitCode = 1;
    }
  } finally {
    await closePools(targetPool);
  }
}

void main();
