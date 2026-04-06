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
  ACCEPTED_NEGATIVE_BALANCE_WARNING,
  buildValidationReadiness,
} from "./execute-guard";
import { buildPostAdmissionMigrationPlan } from "./planner";
import {
  readPostAdmissionBaseline,
  readSharedTableCounts,
  stagingSchemaExists,
} from "./reader";

const EXPECTED_SALES_RETURN_ORDERS = 9;
const EXPECTED_SALES_RETURN_LINES = 13;
const EXPECTED_WORKSHOP_RETURN_ORDERS = 3;
const EXPECTED_WORKSHOP_RETURN_LINES = 4;
const EXPECTED_FACTORY_NUMBER_RESERVATION_COUNT = 80;

async function getWorkflowDocumentCount(connection: {
  query<T = unknown>(sql: string, values?: readonly unknown[]): Promise<T>;
}): Promise<number> {
  const rows = await connection.query<Array<{ total: number }>>(
    `SELECT COUNT(*) AS total FROM workflow_audit_document`,
  );

  return Number(rows[0]?.total ?? 0);
}

async function getInventoryBalanceCount(connection: {
  query<T = unknown>(sql: string, values?: readonly unknown[]): Promise<T>;
}): Promise<number> {
  const rows = await connection.query<Array<{ total: number }>>(
    `SELECT COUNT(*) AS total FROM inventory_balance`,
  );

  return Number(rows[0]?.total ?? 0);
}

async function getInventoryLogCount(connection: {
  query<T = unknown>(sql: string, values?: readonly unknown[]): Promise<T>;
}): Promise<number> {
  const rows = await connection.query<Array<{ total: number }>>(
    `SELECT COUNT(*) AS total FROM inventory_log`,
  );

  return Number(rows[0]?.total ?? 0);
}

async function getDocumentRelationCount(connection: {
  query<T = unknown>(sql: string, values?: readonly unknown[]): Promise<T>;
}): Promise<number> {
  const rows = await connection.query<Array<{ total: number }>>(
    `SELECT COUNT(*) AS total FROM document_relation`,
  );

  return Number(rows[0]?.total ?? 0);
}

async function getDocumentLineRelationCount(connection: {
  query<T = unknown>(sql: string, values?: readonly unknown[]): Promise<T>;
}): Promise<number> {
  const rows = await connection.query<Array<{ total: number }>>(
    `SELECT COUNT(*) AS total FROM document_line_relation`,
  );

  return Number(rows[0]?.total ?? 0);
}

async function getSourceUsageCount(connection: {
  query<T = unknown>(sql: string, values?: readonly unknown[]): Promise<T>;
}): Promise<number> {
  const rows = await connection.query<Array<{ total: number }>>(
    `SELECT COUNT(*) AS total FROM inventory_source_usage`,
  );

  return Number(rows[0]?.total ?? 0);
}

async function getNegativeBalanceCount(connection: {
  query<T = unknown>(sql: string, values?: readonly unknown[]): Promise<T>;
}): Promise<number> {
  const rows = await connection.query<Array<{ total: number }>>(
    `SELECT COUNT(*) AS total FROM inventory_balance WHERE quantityOnHand < 0`,
  );

  return Number(rows[0]?.total ?? 0);
}

async function getInventoryLogConsistencyIssues(connection: {
  query<T = unknown>(sql: string, values?: readonly unknown[]): Promise<T>;
}): Promise<number> {
  const rows = await connection.query<Array<{ total: number }>>(
    `
      SELECT COUNT(*) AS total
      FROM inventory_log log_row
      LEFT JOIN inventory_balance bal_row ON bal_row.id = log_row.balanceId
      WHERE bal_row.id IS NULL
    `,
  );

  return Number(rows[0]?.total ?? 0);
}

async function getWorkflowDocsByFamily(connection: {
  query<T = unknown>(sql: string, values?: readonly unknown[]): Promise<T>;
}): Promise<Record<string, number>> {
  const rows = await connection.query<
    Array<{ documentFamily: string; total: number }>
  >(
    `
      SELECT documentFamily, COUNT(*) AS total
      FROM workflow_audit_document
      GROUP BY documentFamily
    `,
  );

  return Object.fromEntries(
    rows.map((row) => [row.documentFamily, Number(row.total)] as const),
  );
}

async function getRelationsByType(connection: {
  query<T = unknown>(sql: string, values?: readonly unknown[]): Promise<T>;
}): Promise<Record<string, number>> {
  const rows = await connection.query<
    Array<{ relationType: string; total: number }>
  >(
    `
      SELECT relationType, COUNT(*) AS total
      FROM document_relation
      GROUP BY relationType
    `,
  );

  return Object.fromEntries(
    rows.map((row) => [row.relationType, Number(row.total)] as const),
  );
}

async function getChronologicallyInvalidRelationCount(connection: {
  query<T = unknown>(sql: string, values?: readonly unknown[]): Promise<T>;
}): Promise<number> {
  const salesReturnRows = await connection.query<Array<{ total: number }>>(
    `
      SELECT COUNT(*) AS total
      FROM document_line_relation dlr
      INNER JOIN customer_stock_order upstream_order
        ON upstream_order.id = dlr.upstreamDocumentId
      INNER JOIN customer_stock_order downstream_order
        ON downstream_order.id = dlr.downstreamDocumentId
      WHERE dlr.relationType = 'SALES_RETURN_FROM_OUTBOUND'
        AND upstream_order.bizDate > downstream_order.bizDate
    `,
  );

  const workshopReturnRows = await connection.query<Array<{ total: number }>>(
    `
      SELECT COUNT(*) AS total
      FROM document_line_relation dlr
      INNER JOIN workshop_material_order upstream_order
        ON upstream_order.id = dlr.upstreamDocumentId
      INNER JOIN workshop_material_order downstream_order
        ON downstream_order.id = dlr.downstreamDocumentId
      WHERE dlr.relationType = 'WORKSHOP_RETURN_FROM_PICK'
        AND upstream_order.bizDate > downstream_order.bizDate
    `,
  );

  return (
    Number(salesReturnRows[0]?.total ?? 0) +
    Number(workshopReturnRows[0]?.total ?? 0)
  );
}

async function getNullSourceReturnLineCounts(connection: {
  query<T = unknown>(sql: string, values?: readonly unknown[]): Promise<T>;
}): Promise<{ salesReturn: number; workshopReturn: number }> {
  const salesRows = await connection.query<Array<{ total: number }>>(
    `
      SELECT COUNT(*) AS total
      FROM customer_stock_order_line line_row
      INNER JOIN customer_stock_order order_row ON order_row.id = line_row.orderId
      WHERE order_row.orderType = 'SALES_RETURN'
        AND line_row.sourceDocumentId IS NULL
    `,
  );

  const workshopRows = await connection.query<Array<{ total: number }>>(
    `
      SELECT COUNT(*) AS total
      FROM workshop_material_order_line line_row
      INNER JOIN workshop_material_order order_row ON order_row.id = line_row.orderId
      WHERE order_row.orderType = 'RETURN'
        AND line_row.sourceDocumentId IS NULL
    `,
  );

  return {
    salesReturn: Number(salesRows[0]?.total ?? 0),
    workshopReturn: Number(workshopRows[0]?.total ?? 0),
  };
}

async function main(): Promise<void> {
  const cliOptions = parseMigrationCliOptions();
  const reportPath = resolveReportPath(
    cliOptions,
    "return-post-admission-validate-report.json",
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
        const validationIssues: Array<Record<string, unknown>> = [];
        const stagingReady = await stagingSchemaExists(targetConnection);

        const baseline = await readPostAdmissionBaseline(targetConnection);
        const plan = buildPostAdmissionMigrationPlan(baseline);

        if (plan.globalBlockers.length > 0) {
          for (const blocker of plan.globalBlockers) {
            validationIssues.push({
              severity: "blocker",
              reason: blocker.reason,
              ...blocker.details,
            });
          }
        }

        const sharedTableCounts = await readSharedTableCounts(targetConnection);
        const factoryNumberReservationCount =
          sharedTableCounts.factory_number_reservation ?? 0;

        if (
          factoryNumberReservationCount !==
          EXPECTED_FACTORY_NUMBER_RESERVATION_COUNT
        ) {
          validationIssues.push({
            severity: "blocker",
            reason:
              "factory_number_reservation count changed from the known live baseline.",
            expected: EXPECTED_FACTORY_NUMBER_RESERVATION_COUNT,
            actual: factoryNumberReservationCount,
          });
        }

        const admittedSalesReturnOrders = baseline.salesReturnOrders.length;
        const admittedSalesReturnLines = baseline.salesReturnLines.length;
        const admittedWorkshopReturnOrders =
          baseline.workshopReturnOrders.length;
        const admittedWorkshopReturnLines = baseline.workshopReturnLines.length;

        if (admittedSalesReturnOrders !== EXPECTED_SALES_RETURN_ORDERS) {
          validationIssues.push({
            severity: "blocker",
            reason: "Admitted sales-return order count is wrong.",
            expected: EXPECTED_SALES_RETURN_ORDERS,
            actual: admittedSalesReturnOrders,
          });
        }

        if (admittedSalesReturnLines !== EXPECTED_SALES_RETURN_LINES) {
          validationIssues.push({
            severity: "blocker",
            reason: "Admitted sales-return line count is wrong.",
            expected: EXPECTED_SALES_RETURN_LINES,
            actual: admittedSalesReturnLines,
          });
        }

        if (admittedWorkshopReturnOrders !== EXPECTED_WORKSHOP_RETURN_ORDERS) {
          validationIssues.push({
            severity: "blocker",
            reason: "Admitted workshop-return order count is wrong.",
            expected: EXPECTED_WORKSHOP_RETURN_ORDERS,
            actual: admittedWorkshopReturnOrders,
          });
        }

        if (admittedWorkshopReturnLines !== EXPECTED_WORKSHOP_RETURN_LINES) {
          validationIssues.push({
            severity: "blocker",
            reason: "Admitted workshop-return line count is wrong.",
            expected: EXPECTED_WORKSHOP_RETURN_LINES,
            actual: admittedWorkshopReturnLines,
          });
        }

        const staleLinkedNonProven = [
          ...plan.relation.salesReturnClassifications,
          ...plan.relation.workshopReturnClassifications,
        ].filter(
          (c) =>
            c.classification !== "proven" && c.currentSourceDocumentId !== null,
        );

        if (staleLinkedNonProven.length > 0) {
          validationIssues.push({
            severity: "blocker",
            reason:
              "Some non-proven return-family lines still retain non-null sourceDocument* values after execute. Stale source fields were not cleared.",
            count: staleLinkedNonProven.length,
            examples: staleLinkedNonProven.slice(0, 3).map((c) => ({
              lineId: c.lineId,
              documentNo: c.documentNo,
              classification: c.classification,
            })),
          });
        }

        const chronologicallyInvalidRelationCount =
          await getChronologicallyInvalidRelationCount(targetConnection);

        if (chronologicallyInvalidRelationCount > 0) {
          validationIssues.push({
            severity: "blocker",
            reason:
              "document_line_relation contains links where the upstream bizDate is later than the return bizDate (chronologically impossible).",
            chronologicallyInvalidRelationCount,
          });
        }

        const inventoryBalanceCount =
          await getInventoryBalanceCount(targetConnection);
        const inventoryLogCount = await getInventoryLogCount(targetConnection);
        const documentRelationCount =
          await getDocumentRelationCount(targetConnection);
        const documentLineRelationCount =
          await getDocumentLineRelationCount(targetConnection);
        const sourceUsageCount = await getSourceUsageCount(targetConnection);
        const workflowDocCount =
          await getWorkflowDocumentCount(targetConnection);
        const negativeBalanceCount =
          await getNegativeBalanceCount(targetConnection);
        const logConsistencyIssues =
          await getInventoryLogConsistencyIssues(targetConnection);
        const workflowDocsByFamily =
          await getWorkflowDocsByFamily(targetConnection);
        const relationsByType = await getRelationsByType(targetConnection);
        const nullSourceCounts =
          await getNullSourceReturnLineCounts(targetConnection);

        const expectedWorkflowDocs =
          plan.workflow.workflowDocumentInserts.length;
        const expectedDocRelations = plan.backfill.documentRelations.length;
        const expectedDocLineRelations =
          plan.backfill.documentLineRelations.length;
        const expectedInventoryLogs = plan.replay.logInserts.length;
        const expectedSourceUsage = plan.replay.sourceUsageInserts.length;

        if (inventoryBalanceCount === 0 && inventoryLogCount > 0) {
          validationIssues.push({
            severity: "blocker",
            reason:
              "inventory_log rows exist but no inventory_balance rows; replay may be incomplete.",
          });
        }

        if (negativeBalanceCount > 0) {
          validationIssues.push({
            severity: "warning",
            warningType: ACCEPTED_NEGATIVE_BALANCE_WARNING,
            reason:
              "inventory_balance contains negative balances after replay. This matches the accepted historical sequencing drift in legacy operations (system entry order can differ from real-world handling order), so it remains a non-blocking warning rather than a cutover gate.",
            negativeBalanceCount,
          });
        }

        if (logConsistencyIssues > 0) {
          validationIssues.push({
            severity: "blocker",
            reason:
              "Some inventory_log rows reference missing inventory_balance rows.",
            logConsistencyIssues,
          });
        }

        if (inventoryLogCount !== expectedInventoryLogs) {
          validationIssues.push({
            severity: "warning",
            reason:
              "inventory_log row count does not match the deterministic replay plan.",
            expectedInventoryLogs,
            actualInventoryLogs: inventoryLogCount,
          });
        }

        if (documentRelationCount !== expectedDocRelations) {
          validationIssues.push({
            severity: "warning",
            reason:
              "document_relation row count does not match the deterministic plan.",
            expectedDocRelations,
            actualDocRelations: documentRelationCount,
          });
        }

        if (documentLineRelationCount !== expectedDocLineRelations) {
          validationIssues.push({
            severity: "warning",
            reason:
              "document_line_relation row count does not match the deterministic plan.",
            expectedDocLineRelations,
            actualDocLineRelations: documentLineRelationCount,
          });
        }

        if (workflowDocCount !== expectedWorkflowDocs) {
          validationIssues.push({
            severity: "warning",
            reason:
              "workflow_audit_document row count does not match the deterministic plan.",
            expectedWorkflowDocs,
            actualWorkflowDocs: workflowDocCount,
          });
        }

        if (sourceUsageCount !== expectedSourceUsage) {
          validationIssues.push({
            severity: "warning",
            reason:
              "inventory_source_usage row count does not match the deterministic plan.",
            expectedSourceUsage,
            actualSourceUsage: sourceUsageCount,
          });
        }

        const { manualReviewRequired, cutoverReady } = buildValidationReadiness(
          {
            validationIssues,
          },
        );

        return {
          mode: "validate",
          targetDatabaseName,
          migrationBatch: plan.migrationBatch,
          stagingReady,
          admissionBaseline: {
            admittedSalesReturnOrders,
            admittedSalesReturnLines,
            admittedWorkshopReturnOrders,
            admittedWorkshopReturnLines,
          },
          planCounts: plan.counts,
          sharedTableCounts,
          dbCounts: {
            inventoryBalanceCount,
            inventoryLogCount,
            documentRelationCount,
            documentLineRelationCount,
            sourceUsageCount,
            workflowDocCount,
            negativeBalanceCount,
            logConsistencyIssues,
          },
          workflowDocsByFamily,
          relationsByType,
          nullSourceCounts,
          unresolvedSourceUsageGaps: plan.replay.unresolvedSourceUsageGaps,
          classificationSummary: {
            provenRelations: plan.counts.provenRelations,
            unresolvedRelations: plan.counts.unresolvedRelations,
            ambiguousRelations: plan.counts.ambiguousRelations,
            alreadyLinkedLines: plan.counts.alreadyLinkedLines,
          },
          validationIssues,
          manualReviewRequired,
          cutoverReady,
        };
      },
    );

    writeStableReport(reportPath, report);
    console.log(
      `Return post-admission validation completed. report=${reportPath}`,
    );

    if (report.validationIssues.some((issue) => issue.severity === "blocker")) {
      process.exitCode = 1;
    }
  } finally {
    await closePools(targetPool);
  }
}

void main();
