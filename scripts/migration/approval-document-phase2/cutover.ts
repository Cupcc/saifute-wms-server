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
    "approval-document-phase2-cutover-report.json",
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
          "Cutover aborted: both approval_document and audit_document exist as base tables.",
        );
      }

      if (
        stateBefore.canonical.type === null &&
        stateBefore.legacy.type === "VIEW"
      ) {
        throw new Error(
          "Cutover aborted: audit_document is already a view but approval_document base table is missing.",
        );
      }

      if (stateBefore.canonical.type === null) {
        if (stateBefore.legacy.type !== "BASE TABLE") {
          throw new Error(
            "Cutover aborted: expected legacy audit_document base table before rename.",
          );
        }

        await connection.query(
          `RENAME TABLE \`${LEGACY_APPROVAL_DOCUMENT_OBJECT}\` TO \`${CANONICAL_APPROVAL_DOCUMENT_TABLE}\``,
        );
        actions.push("renamed audit_document base table to approval_document");
      }

      const stateAfterRename =
        await readApprovalDocumentCutoverState(connection);
      if (stateAfterRename.legacy.type === "BASE TABLE") {
        throw new Error(
          "Cutover aborted: legacy audit_document is still a base table after rename step.",
        );
      }

      if (stateAfterRename.legacy.type === "VIEW") {
        await connection.query(
          `DROP VIEW IF EXISTS \`${LEGACY_APPROVAL_DOCUMENT_OBJECT}\``,
        );
        actions.push("dropped legacy audit_document compatibility view");
      }

      const stateAfter = await readApprovalDocumentCutoverState(connection);

      if (stateAfter.canonical.type !== "BASE TABLE") {
        throw new Error(
          "Cutover failed: approval_document is not a base table.",
        );
      }

      if (stateAfter.legacy.type !== null) {
        throw new Error(
          "Cutover failed: legacy audit_document object still exists after cleanup.",
        );
      }

      const report = {
        scope: "approval-document-phase2-cutover",
        targetDatabaseName,
        actions,
        stateBefore,
        stateAfter,
        legacyObjectRemoved: stateAfter.legacy.type === null,
      };

      writeStableReport(reportPath, report);
      console.log(
        `approval-document phase2 cutover completed. actions=${actions.length} report=${reportPath}`,
      );
    });
  } finally {
    await closePools(targetPool);
  }
}

void main();
