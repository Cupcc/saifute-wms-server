import {
  assertExpectedDatabaseName,
  EXPECTED_TARGET_DATABASE_NAME,
  loadMigrationEnvironment,
  parseMigrationCliOptions,
  resolveReportPath,
} from "../config";
import { closePools, createMariaDbPool, withPoolConnection } from "../db";
import { writeStableReport } from "../shared/report-writer";
import { buildInventoryReplayPlan } from "./planner";
import { readInventoryReplayInput } from "./reader";
import { REPLAY_FIFO_SOURCE_OPERATION_TYPES } from "./types";

async function main(): Promise<void> {
  const cliOptions = parseMigrationCliOptions();
  const reportPath = resolveReportPath(
    cliOptions,
    "inventory-replay-validate-report.json",
  );
  const env = loadMigrationEnvironment({ requireLegacyDatabaseUrl: false });
  const targetDatabaseName = assertExpectedDatabaseName(
    env.databaseUrl,
    EXPECTED_TARGET_DATABASE_NAME,
    "Target",
  );

  const targetPool = createMariaDbPool(env.databaseUrl);

  try {
    const report = await withPoolConnection(
      targetPool,
      async (targetConnection) => {
        const replayInput = await readInventoryReplayInput(targetConnection);
        const plan = buildInventoryReplayPlan(replayInput.events, {
          coverageGaps: replayInput.coverageGaps,
        });

        const validationIssues: Array<Record<string, unknown>> = [];
        for (const blocker of plan.blockers) {
          validationIssues.push({
            severity: "blocker",
            reason: "Replay plan still has a dry-run blocker.",
            blocker,
          });
        }

        const balanceRows = await targetConnection.query<
          Array<{
            materialId: number;
            stockScopeId: number;
            quantityOnHand: string;
          }>
        >(
          `
            SELECT
              material_id AS materialId,
              stock_scope_id AS stockScopeId,
              quantity_on_hand AS quantityOnHand
            FROM inventory_balance
            ORDER BY material_id ASC, stock_scope_id ASC
          `,
        );

        const logCount = await targetConnection.query<Array<{ total: number }>>(
          `SELECT COUNT(*) AS total FROM inventory_log WHERE reversal_of_log_id IS NULL`,
        );
        const actualLogCount = Number(logCount[0]?.total ?? 0);
        const sourceUsageCount = await targetConnection.query<
          Array<{ total: number }>
        >(`SELECT COUNT(*) AS total FROM inventory_source_usage`);
        const actualSourceUsageCount = Number(sourceUsageCount[0]?.total ?? 0);

        if (balanceRows.length !== plan.plannedBalances.length) {
          validationIssues.push({
            severity: "blocker",
            reason:
              "inventory_balance row count does not match the replay plan.",
            expected: plan.plannedBalances.length,
            actual: balanceRows.length,
          });
        }

        if (actualLogCount !== plan.plannedLogs.length) {
          validationIssues.push({
            severity: "blocker",
            reason: "inventory_log row count does not match the replay plan.",
            expected: plan.plannedLogs.length,
            actual: actualLogCount,
          });
        }

        if (actualSourceUsageCount !== plan.plannedSourceUsages.length) {
          validationIssues.push({
            severity: "blocker",
            reason:
              "inventory_source_usage row count does not match the replay plan.",
            expected: plan.plannedSourceUsages.length,
            actual: actualSourceUsageCount,
          });
        }

        const balanceMap = new Map(
          balanceRows.map((row) => [
            `${row.materialId}::${row.stockScopeId}`,
            row.quantityOnHand,
          ]),
        );

        let balanceMismatches = 0;
        for (const planned of plan.plannedBalances) {
          const key = `${planned.materialId}::${planned.stockScopeId}`;
          const actual = balanceMap.get(key);
          if (actual === undefined) {
            validationIssues.push({
              severity: "blocker",
              reason: "Expected inventory_balance row is missing.",
              materialId: planned.materialId,
              stockScopeId: planned.stockScopeId,
              expectedQty: planned.quantityOnHand,
            });
            balanceMismatches += 1;
          } else {
            const plannedNorm = normalizeDecimal(planned.quantityOnHand);
            const actualNorm = normalizeDecimal(actual);
            if (plannedNorm !== actualNorm) {
              validationIssues.push({
                severity: "blocker",
                reason:
                  "inventory_balance quantityOnHand does not match the replay plan.",
                materialId: planned.materialId,
                stockScopeId: planned.stockScopeId,
                expected: planned.quantityOnHand,
                actual,
              });
              balanceMismatches += 1;
            }
          }
        }

        const idempotencyKeyCount = await targetConnection.query<
          Array<{ total: number }>
        >(`SELECT COUNT(DISTINCT idempotency_key) AS total FROM inventory_log`);
        const actualUniqueKeys = Number(idempotencyKeyCount[0]?.total ?? 0);

        if (actualUniqueKeys !== plan.plannedLogs.length) {
          validationIssues.push({
            severity: "warning",
            reason:
              "inventory_log unique idempotency key count does not match the replay plan (may include reversal entries).",
            expected: plan.plannedLogs.length,
            actual: actualUniqueKeys,
          });
        }

        const sourceUsageIntegrityRows = await targetConnection.query<
          Array<{ issueType: string; total: number }>
        >(
          `
            SELECT 'orphan_source_usage' AS issueType, COUNT(*) AS total
            FROM inventory_source_usage u
            LEFT JOIN inventory_log l ON l.id = u.source_log_id
            WHERE l.id IS NULL
            UNION ALL
            SELECT 'material_mismatch' AS issueType, COUNT(*) AS total
            FROM inventory_source_usage u
            JOIN inventory_log l ON l.id = u.source_log_id
            WHERE u.material_id <> l.material_id
            UNION ALL
            SELECT 'over_allocated_source' AS issueType, COUNT(*) AS total
            FROM (
              SELECT
                l.id,
                l.change_qty,
                COALESCE(SUM(u.allocated_qty - u.released_qty), 0) AS netAllocated
              FROM inventory_log l
              LEFT JOIN inventory_source_usage u ON u.source_log_id = l.id
              GROUP BY l.id, l.change_qty
              HAVING netAllocated > l.change_qty
            ) over_allocated
          `,
        );
        for (const row of sourceUsageIntegrityRows) {
          if (Number(row.total) > 0) {
            validationIssues.push({
              severity: "blocker",
              reason: "inventory_source_usage integrity check failed.",
              issueType: row.issueType,
              total: Number(row.total),
            });
          }
        }

        const sourceTypesSql = REPLAY_FIFO_SOURCE_OPERATION_TYPES.map(
          (value) => `'${value}'`,
        ).join(", ");
        const priceLayerMismatchRows = await targetConnection.query<
          Array<{
            materialId: number;
            stockScopeId: number;
            balanceQty: string;
            sourceAvailableQty: string;
            differenceQty: string;
          }>
        >(
          `
            SELECT
              b.material_id AS materialId,
              b.stock_scope_id AS stockScopeId,
              b.quantity_on_hand AS balanceQty,
              COALESCE(src.sourceAvailableQty, 0) AS sourceAvailableQty,
              COALESCE(src.sourceAvailableQty, 0) - b.quantity_on_hand AS differenceQty
            FROM inventory_balance b
            LEFT JOIN (
              SELECT
                l.material_id AS materialId,
                l.stock_scope_id AS stockScopeId,
                SUM(l.change_qty - COALESCE(usage_totals.netAllocated, 0)) AS sourceAvailableQty
              FROM inventory_log l
              LEFT JOIN (
                SELECT
                  source_log_id,
                  SUM(allocated_qty - released_qty) AS netAllocated
                FROM inventory_source_usage
                GROUP BY source_log_id
              ) usage_totals ON usage_totals.source_log_id = l.id
              WHERE l.direction = 'IN'
                AND l.operation_type IN (${sourceTypesSql})
                AND l.unit_cost IS NOT NULL
              GROUP BY l.material_id, l.stock_scope_id
            ) src
              ON src.materialId = b.material_id
             AND src.stockScopeId = b.stock_scope_id
            WHERE ABS(COALESCE(src.sourceAvailableQty, 0) - b.quantity_on_hand) > 0.000001
          `,
        );

        for (const row of priceLayerMismatchRows) {
          validationIssues.push({
            severity: "blocker",
            reason:
              "price-layer available quantity does not match inventory_balance.",
            materialId: row.materialId,
            stockScopeId: row.stockScopeId,
            balanceQty: row.balanceQty,
            sourceAvailableQty: row.sourceAvailableQty,
            differenceQty: row.differenceQty,
          });
        }

        return {
          mode: "validate",
          targetDatabaseName,
          migrationBatch: plan.migrationBatch,
          totalEvents: plan.events.length,
          eventCounts: plan.eventCounts,
          expectedBalances: plan.plannedBalances.length,
          expectedLogs: plan.plannedLogs.length,
          expectedSourceUsages: plan.plannedSourceUsages.length,
          actualBalances: balanceRows.length,
          actualLogs: actualLogCount,
          actualSourceUsages: actualSourceUsageCount,
          balanceMismatches,
          warnings: plan.warnings,
          coverageGaps: plan.coverageGaps,
          planBlockers: plan.blockers,
          validationIssues,
        };
      },
    );

    writeStableReport(reportPath, report);
    console.log(`Inventory-replay validation completed. report=${reportPath}`);

    if (report.validationIssues.some((issue) => issue.severity === "blocker")) {
      process.exitCode = 1;
    }
  } finally {
    await closePools(targetPool);
  }
}

function normalizeDecimal(value: string): string {
  const trimmed = String(value).trim();
  const match = trimmed.match(/^([+-])?(\d+)(?:\.(\d+))?$/u);
  if (!match) return trimmed;
  const [, sign = "", intPart, fracPart = ""] = match;
  const normalizedInt = intPart.replace(/^0+(?=\d)/u, "") || "0";
  const normalizedFrac = fracPart.replace(/0+$/u, "");
  const prefix =
    sign === "-" && (normalizedInt !== "0" || normalizedFrac) ? "-" : "";
  return normalizedFrac
    ? `${prefix}${normalizedInt}.${normalizedFrac}`
    : `${prefix}${normalizedInt}`;
}

void main();
