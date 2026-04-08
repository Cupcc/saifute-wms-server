import {
  assertExpectedDatabaseName,
  EXPECTED_TARGET_DATABASE_NAME,
  loadMigrationEnvironment,
  parseMigrationCliOptions,
  resolveReportPath,
} from "../config";
import { closePools, createMariaDbPool, withPoolConnection } from "../db";
import { writeStableReport } from "../shared/report-writer";
import { readApprovalDocumentCutoverState } from "./shared";

async function main(): Promise<void> {
  const cliOptions = parseMigrationCliOptions();
  const reportPath = resolveReportPath(
    cliOptions,
    "approval-document-phase2-validate-report.json",
  );
  const env = loadMigrationEnvironment({ requireLegacyDatabaseUrl: false });
  const targetDatabaseName = assertExpectedDatabaseName(
    env.databaseUrl,
    EXPECTED_TARGET_DATABASE_NAME,
    "Target",
  );
  const targetPool = createMariaDbPool(env.databaseUrl);

  try {
    await withPoolConnection(targetPool, async (connection) => {
      const state = await readApprovalDocumentCutoverState(connection);
      const validationErrors: string[] = [];

      if (state.canonical.type !== "BASE TABLE") {
        validationErrors.push(
          "approval_document base table is missing or not a base table.",
        );
      }

      if (state.legacy.type !== null) {
        validationErrors.push("legacy audit_document object still exists.");
      }

      const report = {
        scope: "approval-document-phase2-validate",
        targetDatabaseName,
        state,
        legacyObjectRemoved: state.legacy.type === null,
        validationErrors,
        valid: validationErrors.length === 0,
      };

      writeStableReport(reportPath, report);

      if (validationErrors.length > 0) {
        throw new Error(
          `approval-document phase2 validation failed: ${validationErrors.join(" | ")}`,
        );
      }

      console.log(
        `approval-document phase2 validation passed. report=${reportPath}`,
      );
    });
  } finally {
    await closePools(targetPool);
  }
}

void main();
