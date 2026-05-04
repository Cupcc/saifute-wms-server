import { writeFileSync } from "node:fs";
import { dirname, relative } from "node:path";
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
import type {
  InventoryReplayBlocker,
  ReturnSourceLinkCandidateRow,
} from "./types";
import { executeInventoryReplayPlan } from "./writer";

async function getExistingInventoryCounts(connection: {
  query<T = unknown>(sql: string, values?: readonly unknown[]): Promise<T>;
}): Promise<{
  balanceCount: number;
  logCount: number;
  sourceUsageCount: number;
  orphanSourceUsageCount: number;
}> {
  const rows = await connection.query<
    Array<{ tableName: string; total: number }>
  >(
    `
      SELECT 'inventory_balance' AS tableName, COUNT(*) AS total FROM inventory_balance
      UNION ALL
      SELECT 'inventory_log' AS tableName, COUNT(*) AS total FROM inventory_log
      UNION ALL
      SELECT 'inventory_source_usage' AS tableName, COUNT(*) AS total FROM inventory_source_usage
      UNION ALL
      SELECT 'orphan_inventory_source_usage' AS tableName, COUNT(*) AS total
      FROM inventory_source_usage u
      LEFT JOIN inventory_log l ON l.id = u.source_log_id
      WHERE l.id IS NULL
    `,
  );

  const counts = Object.fromEntries(
    rows.map((row) => [row.tableName, Number(row.total)] as const),
  );

  return {
    balanceCount: counts.inventory_balance ?? 0,
    logCount: counts.inventory_log ?? 0,
    sourceUsageCount: counts.inventory_source_usage ?? 0,
    orphanSourceUsageCount: counts.orphan_inventory_source_usage ?? 0,
  };
}

function markdownValue(value: unknown): string {
  if (value === null || typeof value === "undefined") return "";
  return String(value).replace(/\|/gu, "\\|");
}

function tsvValue(value: unknown): string {
  if (value === null || typeof value === "undefined") return "";
  return String(value).replace(/\t|\r?\n/gu, " ");
}

function countByReason(
  rows: readonly { reason: string }[],
): Map<string, number> {
  const counts = new Map<string, number>();
  for (const row of rows) {
    counts.set(row.reason, (counts.get(row.reason) ?? 0) + 1);
  }
  return counts;
}

function recommendedActionLabel(
  action: ReturnSourceLinkCandidateRow["recommendedAction"],
): string {
  if (action === "review-and-link-unique-covering-candidate") {
    return "人工复核：唯一可覆盖候选";
  }
  if (action === "manual-review-multiple-covering-candidates") {
    return "人工复核：多个可覆盖候选";
  }
  if (action === "manual-review-no-full-quantity-candidate") {
    return "人工复核：无完整数量候选";
  }
  return "人工复核：无候选";
}

function returnOperationTypeLabel(
  operationType: ReturnSourceLinkCandidateRow["returnOperationType"],
): string {
  if (operationType === "SALES_RETURN_IN") return "销售退货入库";
  return "车间退料入库";
}

function yesNoValue(value: boolean | null | undefined): string {
  if (typeof value !== "boolean") return "";
  return value ? "是" : "否";
}

function writeReturnSourceLinkCandidatesMarkdownReport(
  reportPath: string,
  report: {
    sourceReportPath: string;
    mode: string;
    targetDatabaseName: string;
    blockers: readonly InventoryReplayBlocker[];
    rows: readonly ReturnSourceLinkCandidateRow[];
  },
): void {
  const blockerCounts = countByReason(report.blockers);
  const rowsWithCandidates = report.rows.filter(
    (row) => row.candidates.length > 0,
  ).length;
  const rowsWithCoveringCandidates = report.rows.filter(
    (row) => row.coveringCandidateCount > 0,
  ).length;
  const uniqueCoveringRows = report.rows.filter(
    (row) =>
      row.recommendedAction === "review-and-link-unique-covering-candidate",
  ).length;
  const relativeSourcePath = relative(process.cwd(), report.sourceReportPath);

  const lines = [
    "# 库存重放退货来源关联候选报告",
    "",
    `来源报告：\`${relativeSourcePath}\``,
    `最近生成模式：\`${report.mode}\``,
    `目标库：\`${report.targetDatabaseName}\``,
    `缺来源关联总数：${report.rows.length}`,
    `有候选行数：${rowsWithCandidates}`,
    `有可覆盖候选行数：${rowsWithCoveringCandidates}`,
    `可复核回填的唯一覆盖候选：${uniqueCoveringRows}`,
    "",
    "## 当前 blocker 统计",
    "",
    "| blocker | 数量 |",
    "| --- | ---: |",
  ];

  for (const [reason, count] of [...blockerCounts.entries()].sort((a, b) =>
    a[0].localeCompare(b[0]),
  )) {
    lines.push(`| ${markdownValue(reason)} | ${count} |`);
  }

  lines.push(
    "",
    "## 当前缺来源候选明细",
    "",
    "| 处理建议 | 退回类型 | 退回单号 | 退回行ID | 物料ID | 退回数量 | 退回备注 | 备注日期 | 候选数 | 可覆盖候选数 | 首选候选 | 首选候选日期 | 首选候选可退数量 | 首选候选备注 | 备注日期命中 |",
    "| --- | --- | --- | ---: | ---: | ---: | --- | --- | ---: | ---: | --- | --- | ---: | --- | --- |",
  );

  for (const row of report.rows) {
    const candidate = row.candidates[0];
    lines.push(
      [
        recommendedActionLabel(row.recommendedAction),
        returnOperationTypeLabel(row.returnOperationType),
        row.returnDocumentNumber,
        row.returnLineId,
        row.materialId,
        row.returnQty,
        row.returnRemark,
        row.remarkTargetDates.join(","),
        row.candidateCount,
        row.coveringCandidateCount,
        candidate
          ? `${candidate.sourceDocumentNumber}/${candidate.sourceLineId}`
          : "",
        candidate?.sourceBizDate,
        candidate?.remainingReturnableQty,
        candidate?.sourceRemark,
        candidate?.remarkDateMatches ? candidate.remarkMatchedDate : "",
      ]
        .map(markdownValue)
        .join(" | ")
        .replace(/^/u, "| ")
        .replace(/$/u, " |"),
    );
  }

  lines.push(
    "",
    "## 下一步",
    "",
    "1. 先看 `inventory-replay-return-source-link-best-backfill-report.md` 中已选择候选；`document-price-diff-not-cost-blocker` 只说明单据价格不同，不再作为库存成本阻塞，仍需确认原单关系是否可信。",
    "2. 对 `no-candidate` 行，确认是否缺历史出库/领料，或是否需要“无原单但有可信成本”的新来源规则。",
    "3. 对无完整数量候选的行，确认是否需要拆分多来源退货，或是否存在候选数量/历史单据缺失。",
    "4. 每处理一批后重新运行 `bun run migration:inventory-replay:dry-run`，确认 blocker 数量下降；只有 `blockers=[]` 才能 execute。",
  );

  writeFileSync(reportPath, `${lines.join("\n")}\n`, "utf8");
}

function writeReturnSourceLinkCandidatesTsvReport(
  reportPath: string,
  rows: readonly ReturnSourceLinkCandidateRow[],
): void {
  const lines = [
    [
      "处理建议",
      "退回类型",
      "退回单号",
      "退回单ID",
      "退回明细行ID",
      "退回业务日期",
      "物料ID",
      "库存范围ID",
      "车间ID",
      "退回数量",
      "退回成本信号",
      "退回备注",
      "备注日期",
      "候选数",
      "可覆盖候选数",
      "建议原单号",
      "建议原单ID",
      "建议原单明细行ID",
      "首选候选单号",
      "首选候选单ID",
      "首选候选明细行ID",
      "首选候选业务日期",
      "首选候选可退数量",
      "首选候选成本信号",
      "首选候选备注",
      "备注日期命中",
      "距离退回天数",
      "车间是否一致",
      "成本信号是否一致",
    ].join("\t"),
  ];

  for (const row of rows) {
    const candidate = row.candidates[0];
    lines.push(
      [
        recommendedActionLabel(row.recommendedAction),
        returnOperationTypeLabel(row.returnOperationType),
        row.returnDocumentNumber,
        row.returnDocumentId,
        row.returnLineId,
        row.returnBizDate,
        row.materialId,
        row.stockScopeId,
        row.workshopId,
        row.returnQty,
        row.returnUnitCost,
        row.returnRemark,
        row.remarkTargetDates.join(","),
        row.candidateCount,
        row.coveringCandidateCount,
        row.suggestedSourceDocumentNumber,
        row.suggestedSourceDocumentId,
        row.suggestedSourceLineId,
        candidate?.sourceDocumentNumber,
        candidate?.sourceDocumentId,
        candidate?.sourceLineId,
        candidate?.sourceBizDate,
        candidate?.remainingReturnableQty,
        candidate?.sourceUnitCost,
        candidate?.sourceRemark,
        candidate?.remarkDateMatches ? candidate.remarkMatchedDate : "",
        candidate?.daysBeforeReturn,
        yesNoValue(candidate?.sameWorkshop),
        yesNoValue(candidate?.unitCostMatches),
      ]
        .map(tsvValue)
        .join("\t"),
    );
  }

  writeFileSync(reportPath, `${lines.join("\n")}\n`, "utf8");
}

async function main(): Promise<void> {
  const cliOptions = parseMigrationCliOptions();
  const reportPath = resolveReportPath(
    cliOptions,
    cliOptions.execute
      ? "inventory-replay-execute-report.json"
      : "inventory-replay-dry-run-report.json",
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

        const existingCounts =
          await getExistingInventoryCounts(targetConnection);

        const dryRunReport = {
          mode: cliOptions.execute ? "execute" : "dry-run",
          targetDatabaseName,
          migrationBatch: plan.migrationBatch,
          totalEvents: plan.events.length,
          eventCounts: plan.eventCounts,
          plannedBalances: plan.uniqueBalanceBuckets,
          plannedLogs: plan.plannedLogs.length,
          plannedSourceUsages: plan.plannedSourceUsages.length,
          plannedPriceLayers: plan.plannedPriceLayers.length,
          existingCounts,
          warnings: plan.warnings,
          blockers: plan.blockers,
          coverageGaps: plan.coverageGaps,
          negativeBalanceMaterials: plan.negativeBalanceMaterials,
          priceLayerReconciliationMismatches:
            plan.priceLayerReconciliation.filter(
              (row) => row.differenceQty !== "0.000000",
            ),
          returnSourceLinkCandidates: {
            totalMissingLinks: plan.returnSourceLinkCandidates.length,
            recommendedUniqueCoveringLinks:
              plan.returnSourceLinkCandidates.filter(
                (row) =>
                  row.recommendedAction ===
                  "review-and-link-unique-covering-candidate",
              ).length,
            rows: plan.returnSourceLinkCandidates,
          },
        };

        if (!cliOptions.execute) {
          writeStableReport(reportPath, dryRunReport);
          writeReturnSourceLinkCandidatesMarkdownReport(
            `${dirname(reportPath)}/inventory-replay-return-source-link-candidates.md`,
            {
              sourceReportPath: reportPath,
              mode: dryRunReport.mode,
              targetDatabaseName,
              blockers: plan.blockers,
              rows: plan.returnSourceLinkCandidates,
            },
          );
          writeReturnSourceLinkCandidatesTsvReport(
            `${dirname(reportPath)}/inventory-replay-return-source-link-candidates.tsv`,
            plan.returnSourceLinkCandidates,
          );
          console.log(
            `Inventory-replay dry-run completed. report=${reportPath}`,
          );

          if (plan.blockers.length > 0) {
            console.log(
              `BLOCKED: ${plan.blockers.length} blocker(s) must be resolved before execute.`,
            );
          }
          return dryRunReport;
        }

        const executeBlockers: Array<Record<string, unknown>> = [];

        if (
          existingCounts.sourceUsageCount > 0 &&
          existingCounts.orphanSourceUsageCount !==
            existingCounts.sourceUsageCount
        ) {
          executeBlockers.push({
            reason:
              "inventory_source_usage contains rows that still reference existing inventory_log rows. Replay can only clean fully orphaned source usages.",
            sourceUsageCount: existingCounts.sourceUsageCount,
            orphanSourceUsageCount: existingCounts.orphanSourceUsageCount,
          });
        }

        if (plan.blockers.length > 0) {
          executeBlockers.push({
            reason:
              "Replay plan has blockers. Execute is disabled until dry-run is clean.",
            blockerCount: plan.blockers.length,
            blockers: plan.blockers,
          });
        }

        if (executeBlockers.length > 0) {
          const blockedReport = {
            ...dryRunReport,
            executionRequested: true,
            executeBlockers,
          };
          writeStableReport(reportPath, blockedReport);
          process.exitCode = 1;
          return blockedReport;
        }

        const executionResult = await executeInventoryReplayPlan(
          targetConnection,
          plan,
        );

        const executeReport = {
          ...dryRunReport,
          executionRequested: true,
          executionResult,
          cleanedUp: {
            previousBalanceCount: existingCounts.balanceCount,
            previousLogCount: existingCounts.logCount,
          },
        };
        writeStableReport(reportPath, executeReport);
        console.log(`Inventory-replay execute completed. report=${reportPath}`);
        return executeReport;
      },
    );

    if (
      Array.isArray((report as { executeBlockers?: unknown[] }).executeBlockers)
    ) {
      process.exitCode = 1;
    }
  } finally {
    await closePools(targetPool);
  }
}

void main();
