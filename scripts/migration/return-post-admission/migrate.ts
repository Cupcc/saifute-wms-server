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
  buildAdmissionBaselineBlockers,
  buildFactoryNumberReservationBlockers,
  buildSharedTableBlockers,
} from "./execute-guard";
import {
  buildDryRunSummary,
  buildPostAdmissionMigrationPlan,
  hasExecutionBlockers,
} from "./planner";
import {
  readPostAdmissionBaseline,
  readSharedTableCounts,
  stagingSchemaExists,
} from "./reader";
import { executePostAdmissionPlan } from "./writer";

const EXPECTED_FACTORY_NUMBER_RESERVATION_COUNT = 80;

async function main(): Promise<void> {
  const cliOptions = parseMigrationCliOptions();
  const reportPath = resolveReportPath(
    cliOptions,
    cliOptions.execute
      ? "return-post-admission-execute-report.json"
      : "return-post-admission-dry-run-report.json",
  );
  const env = loadMigrationEnvironment({ requireLegacyDatabaseUrl: false });
  const targetDatabaseName = assertExpectedDatabaseName(
    env.databaseUrl,
    EXPECTED_TARGET_DATABASE_NAME,
    "Target",
  );

  const targetPool = createMariaDbPool(env.databaseUrl);

  try {
    const { plan, sharedTableCounts } = await withPoolConnection(
      targetPool,
      async (targetConnection) => {
        const baseline = await readPostAdmissionBaseline(targetConnection);
        const plan = buildPostAdmissionMigrationPlan(baseline);
        const sharedTableCounts = await readSharedTableCounts(targetConnection);

        return { plan, sharedTableCounts };
      },
    );

    const dryRunSummary = buildDryRunSummary(plan);
    const dryRunReport = {
      mode: cliOptions.execute ? "execute" : "dry-run",
      targetDatabaseName,
      sharedTableCountsBeforeExecute: sharedTableCounts,
      ...dryRunSummary,
    };

    if (!cliOptions.execute) {
      writeStableReport(reportPath, dryRunReport);
      console.log(
        `Return post-admission dry-run completed. report=${reportPath}`,
      );

      if (hasExecutionBlockers(plan)) {
        process.exitCode = 1;
      }

      return;
    }

    const executionReport = await withPoolConnection(
      targetPool,
      async (targetConnection) => {
        const stagingReady = await stagingSchemaExists(targetConnection);
        const executeBlockers: Array<Record<string, unknown>> = [];

        const isRerun =
          sharedTableCounts.inventory_balance != null &&
          sharedTableCounts.inventory_balance > 0;

        executeBlockers.push(
          ...buildSharedTableBlockers({
            tableCounts: sharedTableCounts,
            isRerun,
          }),
          ...buildFactoryNumberReservationBlockers({
            currentCount: sharedTableCounts.factory_number_reservation ?? 0,
            expectedCount: EXPECTED_FACTORY_NUMBER_RESERVATION_COUNT,
          }),
          ...buildAdmissionBaselineBlockers({
            admittedSalesReturnOrders: plan.counts.admittedSalesReturnOrders,
            admittedSalesReturnLines: plan.counts.admittedSalesReturnLines,
            admittedWorkshopReturnOrders:
              plan.counts.admittedWorkshopReturnOrders,
            admittedWorkshopReturnLines:
              plan.counts.admittedWorkshopReturnLines,
          }),
        );

        if (hasExecutionBlockers(plan)) {
          executeBlockers.push(
            ...plan.globalBlockers.map((blocker) => ({
              reason: blocker.reason,
              ...blocker.details,
            })),
          );
        }

        if (executeBlockers.length > 0) {
          const blockedReport = {
            ...dryRunReport,
            executionRequested: true,
            stagingReady,
            executeBlockers,
          };
          writeStableReport(reportPath, blockedReport);
          process.exitCode = 1;
          return blockedReport;
        }

        const executionResult = await executePostAdmissionPlan(
          targetConnection,
          plan,
        );

        const sharedTableCountsAfter =
          await readSharedTableCounts(targetConnection);

        const report = {
          ...dryRunReport,
          executionRequested: true,
          stagingReady,
          executionResult,
          sharedTableCountsAfterExecute: sharedTableCountsAfter,
        };

        writeStableReport(reportPath, report);
        return report;
      },
    );

    console.log(
      `Return post-admission execute completed. report=${reportPath}`,
    );

    if (
      Array.isArray(
        (executionReport as { executeBlockers?: unknown[] }).executeBlockers,
      )
    ) {
      process.exitCode = 1;
    }
  } finally {
    await closePools(targetPool);
  }
}

void main();
