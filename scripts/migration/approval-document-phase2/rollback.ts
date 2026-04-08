import {
  assertExpectedDatabaseName,
  EXPECTED_TARGET_DATABASE_NAME,
  loadMigrationEnvironment,
  parseMigrationCliOptions,
  resolveReportPath,
} from "../config";
import { closePools, createMariaDbPool, withPoolConnection } from "../db";
import { writeStableReport } from "../shared/report-writer";
import {
  CANONICAL_APPROVAL_DOCUMENT_TABLE,
  LEGACY_APPROVAL_DOCUMENT_OBJECT,
  readApprovalDocumentCutoverState,
} from "./shared";

async function main(): Promise<void> {
  const cliOptions = parseMigrationCliOptions();
  const reportPath = resolveReportPath(
    cliOptions,
    "approval-document-phase2-rollback-report.json",
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
      const stateBefore = await readApprovalDocumentCutoverState(connection);
      const actions: string[] = [];

      if (
        stateBefore.canonical.type === "BASE TABLE" &&
        stateBefore.legacy.type === "BASE TABLE"
      ) {
        throw new Error(
          "Rollback aborted: both approval_document and audit_document exist as base tables.",
        );
      }

      if (stateBefore.legacy.type === "VIEW") {
        await connection.query(
          `DROP VIEW IF EXISTS \`${LEGACY_APPROVAL_DOCUMENT_OBJECT}\``,
        );
        actions.push("dropped audit_document compatibility view");
      }

      const stateAfterDrop = await readApprovalDocumentCutoverState(connection);

      if (stateAfterDrop.canonical.type === "BASE TABLE") {
        await connection.query(
          `RENAME TABLE \`${CANONICAL_APPROVAL_DOCUMENT_TABLE}\` TO \`${LEGACY_APPROVAL_DOCUMENT_OBJECT}\``,
        );
        actions.push(
          "renamed approval_document base table back to audit_document",
        );
      }

      const stateAfter = await readApprovalDocumentCutoverState(connection);

      if (stateAfter.canonical.type !== null) {
        throw new Error(
          "Rollback failed: approval_document still exists after rename back.",
        );
      }

      if (stateAfter.legacy.type !== "BASE TABLE") {
        throw new Error(
          "Rollback failed: audit_document base table is missing after rollback.",
        );
      }

      const report = {
        scope: "approval-document-phase2-rollback",
        targetDatabaseName,
        actions,
        stateBefore,
        stateAfter,
      };

      writeStableReport(reportPath, report);
      console.log(
        `approval-document phase2 rollback completed. actions=${actions.length} report=${reportPath}`,
      );
    });
  } finally {
    await closePools(targetPool);
  }
}

void main();
