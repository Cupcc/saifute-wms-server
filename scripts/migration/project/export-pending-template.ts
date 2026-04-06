import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

import {
  assertDistinctSourceAndTargetDatabases,
  assertExpectedDatabaseName,
  EXPECTED_TARGET_DATABASE_NAME,
  loadMigrationEnvironment,
  parseMigrationCliOptions,
} from "../config";
import { closePools, createMariaDbPool, withPoolConnection } from "../db";
import { writeStableReport } from "../shared/report-writer";
import {
  readLegacyProjectSnapshot,
  readProjectDependencySnapshot,
} from "./legacy-reader";
import { buildProjectMigrationPlan } from "./transformer";
import type { PendingLinePlanRecord, PendingProjectPlanRecord } from "./types";

/** One row in the pending material mapping template. */
interface TemplateLine {
  projectLegacyId: number;
  lineLegacyId: number;
  materialLegacyId: number | null;
  materialName: string | null;
  materialSpec: string | null;
  unit: string | null;
  quantity: string | null;
  unitPrice: string | null;
  supplierLegacyId: number | null;
  acceptanceDate: string | null;
  ruleId: string;
  pendingReason: string;
  candidateCount: number;
  /** Pipe-separated candidate tuples; empty when zero candidates. */
  candidateSummary: string;
  /** Human fills this in when decision = "map". */
  approvedTargetMaterialCode: string;
  /** One of: map | exclude | fix-source */
  decision: string;
  notes: string;
}

const DECISION_OPTIONS = "map | exclude | fix-source";

const CSV_HEADERS: readonly string[] = [
  "project_legacy_id",
  "line_legacy_id",
  "material_legacy_id",
  "material_name",
  "material_spec",
  "unit",
  "quantity",
  "unit_price",
  "supplier_legacy_id",
  "acceptance_date",
  "rule_id",
  "pending_reason",
  "candidate_count",
  "candidate_summary",
  "approved_target_material_code",
  "decision",
  "notes",
];

function buildTemplateLine(
  project: PendingProjectPlanRecord,
  line: PendingLinePlanRecord,
): TemplateLine {
  const evidence = line.resolutionEvidence;
  const payload = line.sourcePayload;
  const candidates = evidence.candidateSummary ?? [];
  const candidateSummary =
    candidates.length === 0
      ? ""
      : candidates
          .map(
            (c) =>
              `${c.materialCode}|${c.materialName}|${c.specModel ?? ""}|${c.unitCode}`,
          )
          .join("; ");

  return {
    projectLegacyId: project.legacyId,
    lineLegacyId: line.legacyId,
    materialLegacyId:
      typeof payload.materialLegacyId === "number"
        ? payload.materialLegacyId
        : null,
    materialName:
      typeof payload.materialName === "string" ? payload.materialName : null,
    materialSpec:
      typeof payload.materialSpec === "string" ? payload.materialSpec : null,
    unit: typeof payload.unit === "string" ? payload.unit : null,
    quantity: typeof payload.quantity === "string" ? payload.quantity : null,
    unitPrice: typeof payload.unitPrice === "string" ? payload.unitPrice : null,
    supplierLegacyId:
      typeof payload.supplierLegacyId === "number"
        ? payload.supplierLegacyId
        : null,
    acceptanceDate:
      typeof payload.acceptanceDate === "string"
        ? payload.acceptanceDate
        : null,
    ruleId: evidence.ruleId,
    pendingReason: line.pendingReason,
    candidateCount: candidates.length,
    candidateSummary,
    approvedTargetMaterialCode: "",
    decision: "",
    notes: "",
  };
}

function escapeCsvField(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "";
  const str = String(value);
  if (str.includes(",") || str.includes('"') || str.includes("\n")) {
    return `"${str.replace(/"/gu, '""')}"`;
  }
  return str;
}

function buildCsvRow(line: TemplateLine): string {
  return [
    line.projectLegacyId,
    line.lineLegacyId,
    line.materialLegacyId,
    line.materialName,
    line.materialSpec,
    line.unit,
    line.quantity,
    line.unitPrice,
    line.supplierLegacyId,
    line.acceptanceDate,
    line.ruleId,
    line.pendingReason,
    line.candidateCount,
    line.candidateSummary,
    line.approvedTargetMaterialCode,
    line.decision,
    line.notes,
  ]
    .map(escapeCsvField)
    .join(",");
}

function buildRuleBreakdown(lines: TemplateLine[]): Record<string, number> {
  const breakdown: Record<string, number> = {};
  for (const line of lines) {
    breakdown[line.ruleId] = (breakdown[line.ruleId] ?? 0) + 1;
  }
  return breakdown;
}

async function main(): Promise<void> {
  const cliOptions = parseMigrationCliOptions();
  const workspaceDir = join(
    process.cwd(),
    "docs",
    "workspace",
    "migration-java-to-nestjs",
  );
  const reportJsonPath =
    cliOptions.reportPath ??
    join(workspaceDir, "project-pending-material-template.json");
  const reportCsvPath = join(
    dirname(reportJsonPath),
    "project-pending-material-template.csv",
  );

  const env = loadMigrationEnvironment({ requireLegacyDatabaseUrl: true });
  const targetDatabaseName = assertExpectedDatabaseName(
    env.databaseUrl,
    EXPECTED_TARGET_DATABASE_NAME,
    "Target",
  );
  assertDistinctSourceAndTargetDatabases(
    env.legacyDatabaseUrl,
    env.databaseUrl,
  );

  const legacyPool = createMariaDbPool(env.legacyDatabaseUrl ?? "");
  const targetPool = createMariaDbPool(env.databaseUrl);

  try {
    const plan = await withPoolConnection(
      legacyPool,
      async (legacyConnection) => {
        const snapshot = await readLegacyProjectSnapshot(legacyConnection);
        const dependencies = await withPoolConnection(
          targetPool,
          async (targetConnection) =>
            readProjectDependencySnapshot(targetConnection),
        );
        return buildProjectMigrationPlan(snapshot, dependencies);
      },
    );

    // Fail fast: if the dependency baseline is unhealthy the candidate counts in
    // the template would silently under-report or mislabel rows.  Emit a blocked
    // artifact and exit non-zero so callers and CI cannot ignore the state.
    if (plan.globalBlockers.length > 0) {
      const blockedReport = {
        generatedAt: new Date().toISOString(),
        targetDatabaseName,
        status: "BLOCKED",
        globalBlockers: plan.globalBlockers,
        batch1Baseline: plan.context.batch1Baseline,
        message:
          "Template export aborted: buildProjectMigrationPlan() reported global blockers. " +
          "The dependency baseline (batch1 material map / default-workshop) is unhealthy. " +
          "Candidate counts and pending-reason labels in the template would be unreliable. " +
          "Fix the baseline issues listed in globalBlockers and rerun.",
      };
      writeStableReport(reportJsonPath, blockedReport);
      console.error(
        `\n[BLOCKED] Project pending material template export aborted — global blockers detected.\n` +
          `  JSON  : ${reportJsonPath}\n` +
          `  Count : ${plan.globalBlockers.length} blocker(s)\n` +
          plan.globalBlockers
            .map((b, i) => `  [${i + 1}] ${b.reason}`)
            .join("\n") +
          `\n  Batch1 baseline issues: ${plan.context.batch1Baseline.issues.length === 0 ? "none" : plan.context.batch1Baseline.issues.join("; ")}\n` +
          `  Resolve the blockers above before re-exporting the pending template.\n`,
      );
      process.exit(1);
    }

    const templateLines: TemplateLine[] = plan.pendingProjects
      .flatMap((project) =>
        project.pendingLines.map((line) => buildTemplateLine(project, line)),
      )
      .sort((a, b) => {
        if (a.projectLegacyId !== b.projectLegacyId) {
          return a.projectLegacyId - b.projectLegacyId;
        }
        return a.lineLegacyId - b.lineLegacyId;
      });

    const ruleBreakdown = buildRuleBreakdown(templateLines);

    const jsonReport = {
      generatedAt: new Date().toISOString(),
      targetDatabaseName,
      status: "OK",
      globalBlockers: plan.globalBlockers,
      batch1Baseline: plan.context.batch1Baseline,
      summary: {
        pendingProjectCount: plan.pendingProjects.length,
        pendingLineCount: templateLines.length,
        ruleBreakdown,
        pendingLinesByProject: plan.pendingProjects.map((p) => ({
          projectLegacyId: p.legacyId,
          pendingLineCount: p.pendingLineCount,
        })),
      },
      instructions: {
        purpose:
          "Manual material mapping template for the project migration backlog. " +
          "Fill in approved_target_material_code and decision for each line, then hand off for re-execution.",
        decisionOptions: DECISION_OPTIONS,
        fieldGuide: {
          approved_target_material_code:
            "Fill with the target materialCode when decision is 'map'.",
          decision: `One of: ${DECISION_OPTIONS}`,
          notes: "Optional free-text annotation for the reviewer.",
        },
        candidateSummaryFormat:
          "materialCode|materialName|specModel|unitCode tuples separated by '; '",
      },
      lines: templateLines,
    };

    writeStableReport(reportJsonPath, jsonReport);

    const csvLines = [CSV_HEADERS.join(","), ...templateLines.map(buildCsvRow)];
    mkdirSync(dirname(reportCsvPath), { recursive: true });
    writeFileSync(reportCsvPath, `${csvLines.join("\n")}\n`, "utf8");

    console.log(
      `Project pending material template exported.\n` +
        `  JSON : ${reportJsonPath}\n` +
        `  CSV  : ${reportCsvPath}\n` +
        `  Pending projects : ${plan.pendingProjects.length}\n` +
        `  Pending lines    : ${templateLines.length}\n` +
        `  Rule breakdown   : ${JSON.stringify(ruleBreakdown)}`,
    );
  } finally {
    await closePools(legacyPool, targetPool);
  }
}

void main();
