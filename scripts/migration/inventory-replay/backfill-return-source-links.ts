import { writeFileSync } from "node:fs";
import {
  assertExpectedDatabaseName,
  EXPECTED_TARGET_DATABASE_NAME,
  loadMigrationEnvironment,
  parseMigrationCliOptions,
  resolveReportPath,
} from "../config";
import type { MigrationConnectionLike } from "../db";
import { closePools, createMariaDbPool, withPoolConnection } from "../db";
import { BusinessDocumentType } from "../shared/business-document-type";
import { writeStableReport } from "../shared/report-writer";
import { buildInventoryReplayPlan } from "./planner";
import { readInventoryReplayInput } from "./reader";
import {
  type BestReturnSourceBackfillPlan,
  buildBestReturnSourceLinkBackfillPlan,
  type SelectedReturnSourceBackfill,
  type SkippedReturnSourceBackfill,
} from "./return-source-link-backfill-planner";
import type {
  InventoryEvent,
  InventoryReplayBlocker,
  InventoryReplayCoverageGap,
  ReturnSourceLinkCandidateRow,
} from "./types";

const BACKFILL_UPDATED_BY = "inventory-replay-best-candidate-backfill";

function returnLineKey(params: {
  documentType: string;
  documentId: number;
  lineId: number;
  materialId: number;
}): string {
  return [
    params.documentType,
    params.documentId,
    params.lineId,
    params.materialId,
  ].join("::");
}

function selectionReturnKey(selection: SelectedReturnSourceBackfill): string {
  return returnLineKey({
    documentType: selection.returnDocumentType,
    documentId: selection.returnDocumentId,
    lineId: selection.returnLineId,
    materialId: selection.materialId,
  });
}

function validateSelectionsCanRelease(params: {
  events: readonly InventoryEvent[];
  coverageGaps: readonly InventoryReplayCoverageGap[];
  backfillPlan: BestReturnSourceBackfillPlan;
}): BestReturnSourceBackfillPlan {
  if (params.backfillPlan.selectedRows.length === 0) {
    return params.backfillPlan;
  }

  const selectionByReturnKey = new Map(
    params.backfillPlan.selectedRows.map(
      (selection) => [selectionReturnKey(selection), selection] as const,
    ),
  );
  const simulatedEvents = params.events.map((event) => {
    const selection = selectionByReturnKey.get(
      returnLineKey({
        documentType: event.businessDocumentType,
        documentId: event.businessDocumentId,
        lineId: event.businessDocumentLineId,
        materialId: event.materialId,
      }),
    );

    if (!selection) return event;

    return {
      ...event,
      sourceDocumentType: selection.sourceDocumentType,
      sourceDocumentId: selection.sourceDocumentId,
      sourceDocumentLineId: selection.sourceLineId,
    };
  });
  const simulatedPlan = buildInventoryReplayPlan(simulatedEvents, {
    coverageGaps: [...params.coverageGaps],
  });
  const unreleasableReturnKeys = new Set(
    simulatedPlan.blockers
      .filter(
        (blocker) => blocker.reason === "return-source-release-insufficient",
      )
      .map((blocker) => {
        const details = blocker.details ?? {};
        return returnLineKey({
          documentType: String(details.documentType ?? ""),
          documentId: Number(details.documentId ?? 0),
          lineId: Number(details.lineId ?? 0),
          materialId: Number(details.materialId ?? 0),
        });
      }),
  );

  if (unreleasableReturnKeys.size === 0) {
    return params.backfillPlan;
  }

  const selectedRows = params.backfillPlan.selectedRows.filter(
    (selection) => !unreleasableReturnKeys.has(selectionReturnKey(selection)),
  );
  const rejectedRows: SkippedReturnSourceBackfill[] =
    params.backfillPlan.selectedRows
      .filter((selection) =>
        unreleasableReturnKeys.has(selectionReturnKey(selection)),
      )
      .map((selection) => ({
        returnDocumentType: selection.returnDocumentType,
        returnDocumentId: selection.returnDocumentId,
        returnDocumentNumber: selection.returnDocumentNumber,
        returnLineId: selection.returnLineId,
        materialId: selection.materialId,
        stockScopeId: selection.stockScopeId,
        returnQty: selection.returnQty,
        candidateCount: selection.candidateCount,
        reason: "selected-candidate-cannot-release-full-return-quantity",
      }));

  return {
    ...params.backfillPlan,
    selectedRows,
    skippedRows: [...params.backfillPlan.skippedRows, ...rejectedRows],
  };
}

function getReturnLineTable(documentType: string): string {
  if (documentType === BusinessDocumentType.SalesStockOrder) {
    return "sales_stock_order_line";
  }
  if (documentType === BusinessDocumentType.WorkshopMaterialOrder) {
    return "workshop_material_order_line";
  }
  throw new Error(`Unsupported return document type: ${documentType}`);
}

async function applyBackfillPlan(
  connection: MigrationConnectionLike,
  selections: SelectedReturnSourceBackfill[],
): Promise<SelectedReturnSourceBackfill[]> {
  await connection.beginTransaction();

  try {
    const appliedSelections: SelectedReturnSourceBackfill[] = [];

    for (const selection of selections) {
      const tableName = getReturnLineTable(selection.returnDocumentType);
      const result = await connection.query<{ affectedRows?: number }>(
        `
          UPDATE ${tableName}
          SET
            source_document_type = ?,
            source_document_id = ?,
            source_document_line_id = ?,
            updated_by = ?,
            updated_at = NOW()
          WHERE id = ?
            AND order_id = ?
            AND material_id = ?
            AND source_document_type IS NULL
            AND source_document_id IS NULL
            AND source_document_line_id IS NULL
        `,
        [
          selection.sourceDocumentType,
          selection.sourceDocumentId,
          selection.sourceLineId,
          BACKFILL_UPDATED_BY,
          selection.returnLineId,
          selection.returnDocumentId,
          selection.materialId,
        ],
      );
      const affectedRows = Number(result.affectedRows ?? 0);
      if (affectedRows !== 1) {
        throw new Error(
          `Expected to update exactly one return line for ${selection.returnDocumentNumber} line ${selection.returnLineId}, affectedRows=${affectedRows}.`,
        );
      }
      appliedSelections.push({ ...selection, affectedRows });
    }

    await connection.commit();
    return appliedSelections;
  } catch (error) {
    await connection.rollback();
    throw error;
  }
}

function markdownValue(value: unknown): string {
  if (value === null || typeof value === "undefined") return "";
  return String(value).replace(/\|/gu, "\\|");
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

function parseQtyNumber(value: string | null | undefined): number {
  if (!value) return 0;
  const parsedValue = Number(value);
  return Number.isFinite(parsedValue) ? parsedValue : 0;
}

function formatQtyNumber(value: number): string {
  return value.toFixed(6);
}

function returnOperationTypeLabel(operationType: string | undefined): string {
  if (operationType === "SALES_RETURN_IN") return "销售退货入库";
  if (operationType === "RETURN_IN") return "车间退料入库";
  return operationType ?? "";
}

function skippedReasonLabel(reason: SkippedReturnSourceBackfill["reason"]): {
  label: string;
  meaning: string;
  nextAction: string;
} {
  if (reason === "no-candidate") {
    return {
      label: "无候选",
      meaning:
        "当前已迁移历史里找不到同物料、同库存范围、日期不晚于退回日期的原出库/原领料行。",
      nextAction:
        "先查是否缺原出库/领料、状态/日期/库存范围迁错；若业务确认本来就是无源退回，再补显式成本/调整事实，不能伪造来源。",
    };
  }

  if (reason === "no-single-candidate-can-cover-return-quantity") {
    return {
      label: "无单条完整覆盖候选",
      meaning:
        "存在候选原单，但没有任何一条原单行既有足够可退数量、又有足够可释放来源覆盖整条退回。",
      nextAction:
        "确认是否多来源退回；需要拆分退回行或让 replay 支持带数量的行级关系，不能硬选一条来源。",
    };
  }

  if (reason === "selected-candidate-cannot-release-full-return-quantity") {
    return {
      label: "候选无法释放完整来源",
      meaning:
        "候选原单数量看起来够，但 replay 模拟后发现原出库/领料行自身没有足够来源占用可释放。",
      nextAction:
        "先修候选原单自身的 FIFO 来源不足/负库存问题，再重新跑最佳候选回填。",
    };
  }

  return {
    label: "退回数量无效",
    meaning: "退回数量为空、非数字或不大于 0。",
    nextAction: "先修正历史退回行数量，再重新生成候选报告。",
  };
}

function candidateRowKey(row: {
  returnDocumentType: string;
  returnDocumentId: number;
  returnLineId: number;
  materialId: number;
}): string {
  return returnLineKey({
    documentType: row.returnDocumentType,
    documentId: row.returnDocumentId,
    lineId: row.returnLineId,
    materialId: row.materialId,
  });
}

function candidateRemainingTotal(row: ReturnSourceLinkCandidateRow): string {
  return formatQtyNumber(
    row.candidates.reduce(
      (total, candidate) =>
        total + parseQtyNumber(candidate.remainingReturnableQty),
      0,
    ),
  );
}

function candidateCoverageAction(row: ReturnSourceLinkCandidateRow): string {
  const returnQty = parseQtyNumber(row.returnQty);
  const candidateTotal = parseQtyNumber(candidateRemainingTotal(row));

  if (row.candidates.length === 0) {
    return "先补缺失原单/修状态范围；或形成明确无源退回成本规则。";
  }

  if (candidateTotal < returnQty) {
    return "候选合计数量仍不足，优先查缺失原单或数量迁移错误。";
  }

  return "候选合计足够但单条不够，按多来源退回处理：拆行或使用 document_line_relation.linkedQty。";
}

function blockerDetailsValue(
  blocker: InventoryReplayBlocker,
  key: string,
): string {
  const value = blocker.details?.[key];
  if (value === null || typeof value === "undefined") return "";
  return String(value);
}

function blockerDetailsNumber(
  blocker: InventoryReplayBlocker,
  key: string,
): number {
  const value = Number(blocker.details?.[key] ?? 0);
  return Number.isFinite(value) ? value : 0;
}

function writeMarkdownReport(
  reportPath: string,
  report: {
    mode: string;
    targetDatabaseName: string;
    totalMissingLinks: number;
    rowsWithCandidates: number;
    blockers: readonly InventoryReplayBlocker[];
    candidateRows: readonly ReturnSourceLinkCandidateRow[];
    events: readonly InventoryEvent[];
    selectedRows: SelectedReturnSourceBackfill[];
    skippedRows: SkippedReturnSourceBackfill[];
  },
): void {
  const skippedCounts = countByReason(report.skippedRows);
  const blockerCounts = countByReason(report.blockers);
  const skippedQtyByReason = new Map<string, number>();
  for (const row of report.skippedRows) {
    skippedQtyByReason.set(
      row.reason,
      (skippedQtyByReason.get(row.reason) ?? 0) + parseQtyNumber(row.returnQty),
    );
  }
  const candidateRowsByKey = new Map(
    report.candidateRows.map((row) => [candidateRowKey(row), row] as const),
  );
  const eventsByKey = new Map(
    report.events.map(
      (event) =>
        [
          returnLineKey({
            documentType: event.businessDocumentType,
            documentId: event.businessDocumentId,
            lineId: event.businessDocumentLineId,
            materialId: event.materialId,
          }),
          event,
        ] as const,
    ),
  );
  const selectedSummary =
    report.selectedRows.length === 0
      ? "没有可安全自动回填的来源链；剩余问题需要修历史数据或补 replay 表达能力。"
      : "存在可安全自动回填的来源链；执行前仍要复核候选关系是否符合业务事实。";
  const releaseInsufficientBlockers = report.blockers.filter(
    (blocker) => blocker.reason === "return-source-release-insufficient",
  );
  const lines = [
    "# 库存重放退货来源最佳候选回填报告",
    "",
    `模式：${report.mode}`,
    `目标库：${report.targetDatabaseName}`,
    `缺来源关联总数：${report.totalMissingLinks}`,
    `有候选行数：${report.rowsWithCandidates}`,
    `选择回填：${report.selectedRows.length}`,
    `跳过：${report.skippedRows.length}`,
    "",
    "## 结论",
    "",
    `- ${selectedSummary}`,
    `- 本轮剩余 \`${report.skippedRows.length}\` 条退货 / 退料缺来源链，其中 \`${skippedCounts.get("no-candidate") ?? 0}\` 条没有任何候选，\`${skippedCounts.get("no-single-candidate-can-cover-return-quantity") ?? 0}\` 条有候选但没有单条能覆盖整条退回数量。`,
    `- 当前 replay 计划仍有 \`${report.blockers.length}\` 个 blocker；退货来源链只是其中一类，价格层余额差异要等前置来源问题修完后再复核。`,
    "- 本脚本只做安全单来源回填：必须是一条退回行对应一条原出库/领料行，且数量与可释放来源都能覆盖。剩余行不满足这个条件，不能靠硬填一个 `source_document_*` 解决。",
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
    "## 跳过原因汇总",
    "",
    "| 原因 | 数量 | 涉及退回数量 | 能看出什么 | 处理路径 |",
    "| --- | ---: | ---: | --- | --- |",
  );

  for (const [reason, count] of [...skippedCounts.entries()].sort((a, b) =>
    a[0].localeCompare(b[0]),
  )) {
    const reasonText = skippedReasonLabel(
      reason as SkippedReturnSourceBackfill["reason"],
    );
    lines.push(
      [
        reasonText.label,
        count,
        formatQtyNumber(skippedQtyByReason.get(reason) ?? 0),
        reasonText.meaning,
        reasonText.nextAction,
      ]
        .map(markdownValue)
        .join(" | ")
        .replace(/^/u, "| ")
        .replace(/$/u, " |"),
    );
  }

  if (releaseInsufficientBlockers.length > 0) {
    lines.push(
      "",
      "## 已有关联但无法释放来源",
      "",
      "这些不是“缺链接”，而是原出库 / 原领料自身没有足够 `inventory_source_usage` 可释放；要先修原单的 FIFO 来源不足。",
      "",
      "| 退回单号 | 退回单类型 | 退回单ID | 退回行ID | 物料ID | 退回数量 | 已释放 | 缺口 | 原单号 | 原单类型 | 原单ID | 原单行ID |",
      "| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | --- | --- | ---: | ---: |",
    );

    for (const blocker of releaseInsufficientBlockers) {
      const returnEvent = eventsByKey.get(
        returnLineKey({
          documentType: blockerDetailsValue(blocker, "documentType"),
          documentId: blockerDetailsNumber(blocker, "documentId"),
          lineId: blockerDetailsNumber(blocker, "lineId"),
          materialId: blockerDetailsNumber(blocker, "materialId"),
        }),
      );
      const sourceEvent = eventsByKey.get(
        returnLineKey({
          documentType: blockerDetailsValue(blocker, "sourceDocumentType"),
          documentId: blockerDetailsNumber(blocker, "sourceDocumentId"),
          lineId: blockerDetailsNumber(blocker, "sourceDocumentLineId"),
          materialId: blockerDetailsNumber(blocker, "materialId"),
        }),
      );
      lines.push(
        [
          returnEvent?.businessDocumentNumber,
          blockerDetailsValue(blocker, "documentType"),
          blockerDetailsValue(blocker, "documentId"),
          blockerDetailsValue(blocker, "lineId"),
          blockerDetailsValue(blocker, "materialId"),
          blockerDetailsValue(blocker, "requestedQty"),
          blockerDetailsValue(blocker, "releasedQty"),
          blockerDetailsValue(blocker, "missingQty"),
          sourceEvent?.businessDocumentNumber,
          blockerDetailsValue(blocker, "sourceDocumentType"),
          blockerDetailsValue(blocker, "sourceDocumentId"),
          blockerDetailsValue(blocker, "sourceDocumentLineId"),
        ]
          .map(markdownValue)
          .join(" | ")
          .replace(/^/u, "| ")
          .replace(/$/u, " |"),
      );
    }
  }

  lines.push(
    "",
    "## 已选择候选",
    "",
    "只有进入这一节的行，才满足当前脚本的安全自动回填条件。",
    "",
    "| 退回单号 | 退回行ID | 物料ID | 退回数量 | 退回备注 | 备注日期 | 原单号 | 原单日期 | 原单ID | 原单行ID | 原单备注 | 候选排名 | 备注日期命中 | 单据剩余量变化 | 可释放量变化 | 信号 |",
    "| --- | ---: | ---: | ---: | --- | --- | --- | --- | ---: | ---: | --- | ---: | --- | --- | --- | --- |",
  );

  for (const row of report.selectedRows) {
    lines.push(
      [
        row.returnDocumentNumber,
        row.returnLineId,
        row.materialId,
        row.returnQty,
        row.returnRemark,
        row.remarkTargetDates.join(","),
        row.sourceDocumentNumber,
        row.sourceBizDate,
        row.sourceDocumentId,
        row.sourceLineId,
        row.sourceRemark,
        row.selectedCandidateRank,
        row.remarkDateMatches ? row.remarkMatchedDate : "",
        `${row.sourceRemainingBefore} -> ${row.sourceRemainingAfter}`,
        row.sourceReleasableBefore && row.sourceReleasableAfter
          ? `${row.sourceReleasableBefore} -> ${row.sourceReleasableAfter}`
          : "",
        row.warnings.length > 0 ? row.warnings.join(",") : "ok",
      ]
        .map(markdownValue)
        .join(" | ")
        .replace(/^/u, "| ")
        .replace(/$/u, " |"),
    );
  }

  lines.push("", "## 跳过候选", "");
  lines.push(
    "这里的“跳过”不是忽略问题，而是脚本拒绝做不安全写入；每一行都需要按处理路径修数据或扩展 replay 表达能力。",
    "",
    "| 退回类型 | 退回单号 | 退回行ID | 物料ID | 退回数量 | 退回备注 | 备注日期 | 候选数 | 可覆盖候选数 | 候选合计可退 | 首选候选 | 首选可退 | 原因 | 下一步 |",
    "| --- | --- | ---: | ---: | ---: | --- | --- | ---: | ---: | ---: | --- | ---: | --- | --- |",
  );

  for (const row of report.skippedRows) {
    const candidateRow = candidateRowsByKey.get(candidateRowKey(row));
    const topCandidate = candidateRow?.candidates[0];
    const reasonText = skippedReasonLabel(row.reason);
    lines.push(
      [
        returnOperationTypeLabel(candidateRow?.returnOperationType),
        row.returnDocumentNumber,
        row.returnLineId,
        row.materialId,
        row.returnQty,
        candidateRow?.returnRemark,
        candidateRow?.remarkTargetDates.join(","),
        row.candidateCount,
        candidateRow?.coveringCandidateCount,
        candidateRow ? candidateRemainingTotal(candidateRow) : "",
        topCandidate
          ? `${topCandidate.sourceDocumentNumber}/${topCandidate.sourceLineId}`
          : "",
        topCandidate?.remainingReturnableQty,
        reasonText.label,
        candidateRow
          ? candidateCoverageAction(candidateRow)
          : reasonText.nextAction,
      ]
        .map(markdownValue)
        .join(" | ")
        .replace(/^/u, "| ")
        .replace(/$/u, " |"),
    );
  }

  lines.push(
    "",
    "## 如何解决",
    "",
    "1. 对 `无候选` 行：按物料、库存范围、备注日期、业务日期回查历史出库 / 领料是否缺迁移、状态被过滤、日期或库存范围迁错；如果业务确认就是无源退回，必须补明确成本来源或调整事实，不能虚构原单关系。",
    "2. 对 `无单条完整覆盖候选` 行：先看候选合计是否足够。合计不足说明仍缺原单或数量；合计足够但单条不足说明是多来源退回，当前单个 `source_document_*` 字段表达不了，需要拆退回行，或让 replay 读取 `document_line_relation.linkedQty` 后按多来源释放。",
    "3. 对 `已有关联但无法释放来源` 行：不要再改退货链接，先修原出库 / 原领料的 `fifo-source-insufficient`、`negative-balance-during-replay`，让原消费行产生可释放的来源占用。",
    "4. 修完一批后重新运行 `bun run migration:inventory-replay:dry-run`，再运行 `bun run migration:inventory-replay:return-source-links:dry-run`。只有 `blockers=[]` 才能进入 execute。",
  );

  writeFileSync(reportPath, `${lines.join("\n")}\n`, "utf8");
}

async function main(): Promise<void> {
  const cliOptions = parseMigrationCliOptions();
  const reportPath = resolveReportPath(
    cliOptions,
    "inventory-replay-return-source-link-best-backfill-report.json",
  );
  const markdownReportPath = reportPath.replace(/\.json$/u, ".md");
  const env = loadMigrationEnvironment({ requireLegacyDatabaseUrl: false });
  const targetDatabaseName = assertExpectedDatabaseName(
    env.databaseUrl,
    EXPECTED_TARGET_DATABASE_NAME,
    "Target",
  );

  const targetPool = createMariaDbPool(env.databaseUrl);

  try {
    await withPoolConnection(targetPool, async (connection) => {
      const replayInput = await readInventoryReplayInput(connection);
      const plan = buildInventoryReplayPlan(replayInput.events, {
        coverageGaps: replayInput.coverageGaps,
      });
      const initialBackfillPlan = buildBestReturnSourceLinkBackfillPlan(
        plan.returnSourceLinkCandidates,
        { plannedSourceUsages: plan.plannedSourceUsages },
      );
      const backfillPlan = validateSelectionsCanRelease({
        events: replayInput.events,
        coverageGaps: replayInput.coverageGaps,
        backfillPlan: initialBackfillPlan,
      });
      const selectedRows = cliOptions.execute
        ? await applyBackfillPlan(connection, backfillPlan.selectedRows)
        : backfillPlan.selectedRows;
      const report = {
        mode: cliOptions.execute ? "execute" : "dry-run",
        targetDatabaseName,
        totalMissingLinks: backfillPlan.totalMissingLinks,
        rowsWithCandidates: backfillPlan.rowsWithCandidates,
        selectedCount: selectedRows.length,
        skippedCount: backfillPlan.skippedRows.length,
        selectedRows,
        skippedRows: backfillPlan.skippedRows,
      };

      writeStableReport(reportPath, report);
      writeMarkdownReport(markdownReportPath, {
        ...report,
        blockers: plan.blockers,
        candidateRows: plan.returnSourceLinkCandidates,
        events: plan.events,
      });

      console.log(
        `Inventory-replay return-source best-candidate backfill ${report.mode} completed. selected=${report.selectedCount}, skipped=${report.skippedCount}, report=${reportPath}`,
      );
    });
  } finally {
    await closePools(targetPool);
  }
}

if (require.main === module) {
  void main();
}
