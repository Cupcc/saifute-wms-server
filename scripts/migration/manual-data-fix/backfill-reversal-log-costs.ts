import {
  assertExpectedDatabaseName,
  EXPECTED_TARGET_DATABASE_NAME,
  loadMigrationEnvironment,
  parseMigrationCliOptions,
  resolveReportPath,
} from "../config";
import {
  closePools,
  createMariaDbPool,
  type MigrationConnectionLike,
  withPoolConnection,
} from "../db";
import { writeStableReport } from "../shared/report-writer";

const DRY_RUN_REPORT_FILE_NAME =
  "backfill-reversal-log-costs-dry-run-report.json";
const EXECUTE_REPORT_FILE_NAME =
  "backfill-reversal-log-costs-execute-report.json";

interface ReversalCostCandidate {
  reversalLogId: number;
  sourceLogId: number;
  businessDocumentType: string;
  businessDocumentId: number;
  businessDocumentNumber: string;
  businessDocumentLineId: number | null;
  materialId: number;
  operationType: string;
  direction: string;
  changeQty: string;
  currentUnitCost: string | null;
  currentCostAmount: string | null;
  sourceUnitCost: string | null;
  sourceCostAmount: string | null;
}

interface ReversalCostMismatch {
  reversalLogId: number;
  sourceLogId: number;
  businessDocumentNumber: string;
  currentUnitCost: string | null;
  currentCostAmount: string | null;
  sourceUnitCost: string | null;
  sourceCostAmount: string | null;
}

async function readCandidates(
  connection: MigrationConnectionLike,
): Promise<ReversalCostCandidate[]> {
  return connection.query<ReversalCostCandidate[]>(`
    SELECT
      rev.id AS reversalLogId,
      source.id AS sourceLogId,
      rev.business_document_type AS businessDocumentType,
      rev.business_document_id AS businessDocumentId,
      rev.business_document_number AS businessDocumentNumber,
      rev.business_document_line_id AS businessDocumentLineId,
      rev.material_id AS materialId,
      rev.operation_type AS operationType,
      rev.direction,
      rev.change_qty AS changeQty,
      rev.unit_cost AS currentUnitCost,
      rev.cost_amount AS currentCostAmount,
      source.unit_cost AS sourceUnitCost,
      source.cost_amount AS sourceCostAmount
    FROM inventory_log rev
    JOIN inventory_log source ON source.id = rev.reversal_of_log_id
    WHERE rev.reversal_of_log_id IS NOT NULL
      AND (rev.unit_cost IS NULL OR rev.cost_amount IS NULL)
      AND (source.unit_cost IS NOT NULL OR source.cost_amount IS NOT NULL)
    ORDER BY rev.id
  `);
}

async function readMismatches(
  connection: MigrationConnectionLike,
): Promise<ReversalCostMismatch[]> {
  return connection.query<ReversalCostMismatch[]>(`
    SELECT
      rev.id AS reversalLogId,
      source.id AS sourceLogId,
      rev.business_document_number AS businessDocumentNumber,
      rev.unit_cost AS currentUnitCost,
      rev.cost_amount AS currentCostAmount,
      source.unit_cost AS sourceUnitCost,
      source.cost_amount AS sourceCostAmount
    FROM inventory_log rev
    JOIN inventory_log source ON source.id = rev.reversal_of_log_id
    WHERE rev.reversal_of_log_id IS NOT NULL
      AND (
        (rev.unit_cost IS NOT NULL AND source.unit_cost IS NOT NULL AND rev.unit_cost <> source.unit_cost)
        OR
        (rev.cost_amount IS NOT NULL AND source.cost_amount IS NOT NULL AND rev.cost_amount <> source.cost_amount)
      )
    ORDER BY rev.id
  `);
}

async function executeBackfill(connection: MigrationConnectionLike) {
  await connection.beginTransaction();

  try {
    const result = await connection.query<{ affectedRows?: number }>(`
      UPDATE inventory_log rev
      JOIN inventory_log source ON source.id = rev.reversal_of_log_id
      SET
        rev.unit_cost = COALESCE(rev.unit_cost, source.unit_cost),
        rev.cost_amount = COALESCE(rev.cost_amount, source.cost_amount)
      WHERE rev.reversal_of_log_id IS NOT NULL
        AND (rev.unit_cost IS NULL OR rev.cost_amount IS NULL)
        AND (source.unit_cost IS NOT NULL OR source.cost_amount IS NOT NULL)
    `);

    await connection.commit();

    return {
      updatedRows: Number(result.affectedRows ?? 0),
    };
  } catch (error) {
    await connection.rollback();
    throw error;
  }
}

async function main() {
  const cliOptions = parseMigrationCliOptions();
  const execute = cliOptions.execute;
  const reportPath = resolveReportPath(
    cliOptions,
    execute ? EXECUTE_REPORT_FILE_NAME : DRY_RUN_REPORT_FILE_NAME,
  );
  const environment = loadMigrationEnvironment({
    requireLegacyDatabaseUrl: false,
  });
  const targetDatabase = assertExpectedDatabaseName(
    environment.databaseUrl,
    EXPECTED_TARGET_DATABASE_NAME,
    "target",
  );
  const pool = createMariaDbPool(environment.databaseUrl);

  try {
    await withPoolConnection(pool, async (connection) => {
      const beforeCandidates = await readCandidates(connection);
      const beforeMismatches = await readMismatches(connection);
      const executeResult = execute ? await executeBackfill(connection) : null;
      const afterCandidates = execute ? await readCandidates(connection) : null;
      const afterMismatches = execute ? await readMismatches(connection) : null;

      const report = {
        generatedAt: new Date().toISOString(),
        mode: execute ? "execute" : "dry-run",
        targetDatabase,
        purpose:
          "Backfill null cost fields on reversal inventory logs from the original log they reverse.",
        beforeCandidateCount: beforeCandidates.length,
        beforeCandidates,
        beforeMismatchCount: beforeMismatches.length,
        beforeMismatches,
        executeResult,
        afterCandidateCount: afterCandidates?.length ?? null,
        afterCandidates,
        afterMismatchCount: afterMismatches?.length ?? null,
        afterMismatches,
      };

      writeStableReport(reportPath, report);
      console.log(
        `Backfill reversal log costs ${execute ? "execute" : "dry-run"} completed. candidates=${beforeCandidates.length}, report=${reportPath}`,
      );
    });
  } finally {
    await closePools(pool);
  }
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
