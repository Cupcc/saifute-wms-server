import {
  assertDistinctSourceAndTargetDatabases,
  assertExpectedDatabaseName,
  EXPECTED_TARGET_DATABASE_NAME,
  loadMigrationEnvironment,
  parseMigrationCliOptions,
  resolveReportPath,
} from "../config";
import { closePools, createMariaDbPool, withPoolConnection } from "../db";
import { BusinessDocumentType } from "../shared/business-document-type";
import { stableJsonStringify } from "../shared/deterministic";
import { writeStableReport } from "../shared/report-writer";
import {
  readLegacySalesReturnSnapshot,
  readSalesReturnDependencySnapshot,
} from "./legacy-reader";
import { buildSalesReturnMigrationPlan } from "./transformer";
import type {
  ArchivedFieldPayloadRecord,
  SalesReturnMigrationPlan,
} from "./types";
import { MAP_TABLES, TARGET_TABLES } from "./writer";

const SALES_STOCK_DOCUMENT_TYPE = BusinessDocumentType.SalesStockOrder;

interface ArchivedPayloadExpectation {
  legacyTable: string;
  legacyId: number;
  targetTable: string;
  targetCode: string;
  payloadKind: ArchivedFieldPayloadRecord["payloadKind"];
  archiveReason: string;
  payloadJson: string;
}

interface PendingRelationStoredRow {
  legacyTable: string;
  legacyId: number;
  legacyLineId: number | null;
  pendingReason: string;
  payloadJson: string;
}

interface ArchivedRelationStoredRow {
  legacyTable: string;
  legacyId: number;
  legacyLineId: number | null;
  archiveReason: string;
  payloadJson: string;
}

interface PendingRelationExpectation {
  legacyTable: string;
  legacyId: number;
  legacyLineId: number;
  pendingReason: string;
  payloadJson: string;
}

interface ArchivedRelationExpectation {
  legacyTable: string;
  legacyId: number;
  legacyLineId: number;
  archiveReason: string;
  payloadJson: string;
}

interface ArchivedPayloadStoredRow {
  legacyTable: string;
  legacyId: number;
  targetTable: string;
  targetId: number | null;
  targetCode: string | null;
  payloadKind: ArchivedFieldPayloadRecord["payloadKind"];
  archiveReason: string;
  payloadJson: string;
}

interface ExcludedDocumentStoredRow {
  legacyTable: string;
  legacyId: number;
  exclusionReason: string;
  payloadJson: string;
}

function comparableScalar(value: unknown): string | null {
  if (value === null || value === undefined) {
    return null;
  }

  const stringValue = String(value).trim();
  const dateTimeMatch = stringValue.match(
    /^(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})(?:\.\d+)?$/u,
  );

  if (dateTimeMatch) {
    return dateTimeMatch[1] ?? stringValue;
  }

  if (/^-?\d+(\.\d+)?$/u.test(stringValue)) {
    const sign = stringValue.startsWith("-") ? "-" : "";
    const unsignedValue = sign ? stringValue.slice(1) : stringValue;
    const [integerPartRaw, fractionalPartRaw = ""] = unsignedValue.split(".");
    const normalizedIntegerPart =
      integerPartRaw.replace(/^0+(?=\d)/u, "") || "0";
    const normalizedFractionalPart = fractionalPartRaw.replace(/0+$/u, "");

    return normalizedFractionalPart.length > 0
      ? `${sign}${normalizedIntegerPart}.${normalizedFractionalPart}`
      : `${sign}${normalizedIntegerPart}`;
  }

  return stringValue;
}

function pushValueMismatch(
  validationIssues: Array<Record<string, unknown>>,
  context: Record<string, unknown>,
  field: string,
  expected: unknown,
  actual: unknown,
): void {
  if (comparableScalar(expected) === comparableScalar(actual)) {
    return;
  }

  validationIssues.push({
    severity: "blocker",
    ...context,
    field,
    reason: `${field} does not match the deterministic migration plan.`,
    expected,
    actual,
  });
}

function buildArchivedPayloadIdentity(input: {
  legacyTable: string;
  legacyId: number;
  targetTable: string;
  payloadKind: ArchivedFieldPayloadRecord["payloadKind"];
}): string {
  return [
    input.legacyTable,
    String(input.legacyId),
    input.targetTable,
    input.payloadKind,
  ].join("::");
}

function buildExcludedDocumentIdentity(input: {
  legacyTable: string;
  legacyId: number;
}): string {
  return `${input.legacyTable}::${input.legacyId}`;
}

function buildRelationStagingIdentity(input: {
  legacyTable: string;
  legacyId: number;
  legacyLineId: number | null;
}): string {
  return `${input.legacyTable}::${input.legacyId}::${input.legacyLineId ?? "null"}`;
}

function collectExpectedArchivedPayloads(
  plan: SalesReturnMigrationPlan,
): ArchivedPayloadExpectation[] {
  const expectations: ArchivedPayloadExpectation[] = [];

  for (const order of plan.admittedOrders) {
    expectations.push({
      legacyTable: order.archivedPayload.legacyTable,
      legacyId: order.archivedPayload.legacyId,
      targetTable: order.archivedPayload.targetTable,
      targetCode: order.archivedPayload.targetCode,
      payloadKind: order.archivedPayload.payloadKind,
      archiveReason: order.archivedPayload.archiveReason,
      payloadJson: stableJsonStringify(order.archivedPayload.payload),
    });

    for (const line of order.lines) {
      if (!line.archivedPayload) {
        continue;
      }

      expectations.push({
        legacyTable: line.archivedPayload.legacyTable,
        legacyId: line.archivedPayload.legacyId,
        targetTable: line.archivedPayload.targetTable,
        targetCode: line.archivedPayload.targetCode,
        payloadKind: line.archivedPayload.payloadKind,
        archiveReason: line.archivedPayload.archiveReason,
        payloadJson: stableJsonStringify(line.archivedPayload.payload),
      });
    }
  }

  return expectations.sort(
    (left, right) =>
      left.legacyTable.localeCompare(right.legacyTable) ||
      left.legacyId - right.legacyId ||
      left.targetTable.localeCompare(right.targetTable) ||
      left.payloadKind.localeCompare(right.payloadKind),
  );
}

function collectExpectedExcludedDocuments(
  plan: SalesReturnMigrationPlan,
): Array<{
  legacyTable: string;
  legacyId: number;
  exclusionReason: string;
  payloadJson: string;
}> {
  return [...plan.excludedDocuments]
    .sort(
      (left, right) =>
        left.legacyTable.localeCompare(right.legacyTable) ||
        left.legacyId - right.legacyId,
    )
    .map((record) => ({
      legacyTable: record.legacyTable,
      legacyId: record.legacyId,
      exclusionReason: record.exclusionReason,
      payloadJson: stableJsonStringify(record.payload),
    }));
}

function collectExpectedPendingRelations(
  plan: SalesReturnMigrationPlan,
): PendingRelationExpectation[] {
  return [...plan.pendingRelations]
    .sort(
      (left, right) =>
        left.legacyTable.localeCompare(right.legacyTable) ||
        left.legacyId - right.legacyId ||
        left.legacyLineId - right.legacyLineId,
    )
    .map((record) => ({
      legacyTable: record.legacyTable,
      legacyId: record.legacyId,
      legacyLineId: record.legacyLineId,
      pendingReason: record.pendingReason,
      payloadJson: stableJsonStringify(record.payload),
    }));
}

function collectExpectedArchivedRelations(
  plan: SalesReturnMigrationPlan,
): ArchivedRelationExpectation[] {
  return [...plan.pendingRelations]
    .sort(
      (left, right) =>
        left.legacyTable.localeCompare(right.legacyTable) ||
        left.legacyId - right.legacyId ||
        left.legacyLineId - right.legacyLineId,
    )
    .map((record) => ({
      legacyTable: record.legacyTable,
      legacyId: record.legacyId,
      legacyLineId: record.legacyLineId,
      archiveReason: record.pendingReason,
      payloadJson: stableJsonStringify(record.payload),
    }));
}

async function getBatchMapCount(
  connection: {
    query<T = unknown>(sql: string, values?: readonly unknown[]): Promise<T>;
  },
  mapTableName: string,
  migrationBatch: string,
): Promise<number> {
  const rows = await connection.query<Array<{ total: number }>>(
    `
      SELECT COUNT(*) AS total
      FROM migration_staging.${mapTableName}
      WHERE migration_batch = ?
    `,
    [migrationBatch],
  );
  return Number(rows[0]?.total ?? 0);
}

async function getMissingMapTargets(
  connection: {
    query<T = unknown>(sql: string, values?: readonly unknown[]): Promise<T>;
  },
  mapTableName: string,
  targetTableName: string,
  migrationBatch: string,
): Promise<number> {
  const rows = await connection.query<Array<{ total: number }>>(
    `
      SELECT COUNT(*) AS total
      FROM migration_staging.${mapTableName} map_row
      LEFT JOIN ${targetTableName} target_row
        ON target_row.id = map_row.target_id
      WHERE map_row.migration_batch = ?
        AND target_row.id IS NULL
    `,
    [migrationBatch],
  );

  return Number(rows[0]?.total ?? 0);
}

async function getBatchOwnedTargetRowCount(
  connection: {
    query<T = unknown>(sql: string, values?: readonly unknown[]): Promise<T>;
  },
  mapTableName: string,
  targetTableName: string,
  migrationBatch: string,
): Promise<number> {
  const rows = await connection.query<Array<{ total: number }>>(
    `
      SELECT COUNT(*) AS total
      FROM ${targetTableName} target_row
      INNER JOIN migration_staging.${mapTableName} map_row
        ON map_row.target_id = target_row.id
      WHERE map_row.migration_batch = ?
    `,
    [migrationBatch],
  );

  return Number(rows[0]?.total ?? 0);
}

async function getArchivedPayloadCount(
  connection: {
    query<T = unknown>(sql: string, values?: readonly unknown[]): Promise<T>;
  },
  migrationBatch: string,
): Promise<number> {
  const rows = await connection.query<Array<{ total: number }>>(
    `
      SELECT COUNT(*) AS total
      FROM migration_staging.archived_field_payload
      WHERE migration_batch = ?
        AND target_table IN ('sales_stock_order', 'sales_stock_order_line')
    `,
    [migrationBatch],
  );
  return Number(rows[0]?.total ?? 0);
}

async function getArchivedPayloadRows(
  connection: {
    query<T = unknown>(sql: string, values?: readonly unknown[]): Promise<T>;
  },
  migrationBatch: string,
): Promise<ArchivedPayloadStoredRow[]> {
  return connection.query<ArchivedPayloadStoredRow[]>(
    `
      SELECT
        legacy_table AS legacyTable,
        legacy_id AS legacyId,
        target_table AS targetTable,
        target_id AS targetId,
        target_code AS targetCode,
        payload_kind AS payloadKind,
        archive_reason AS archiveReason,
        payload_json AS payloadJson
      FROM migration_staging.archived_field_payload
      WHERE migration_batch = ?
        AND target_table IN ('sales_stock_order', 'sales_stock_order_line')
      ORDER BY legacy_table ASC, legacy_id ASC, target_table ASC, payload_kind ASC
    `,
    [migrationBatch],
  );
}

async function getExcludedDocumentRows(
  connection: {
    query<T = unknown>(sql: string, values?: readonly unknown[]): Promise<T>;
  },
  migrationBatch: string,
): Promise<ExcludedDocumentStoredRow[]> {
  return connection.query<ExcludedDocumentStoredRow[]>(
    `
      SELECT
        legacy_table AS legacyTable,
        legacy_id AS legacyId,
        exclusion_reason AS exclusionReason,
        payload_json AS payloadJson
      FROM migration_staging.excluded_documents
      WHERE migration_batch = ?
        AND legacy_table IN ('saifute_sales_return_order')
      ORDER BY legacy_table ASC, legacy_id ASC
    `,
    [migrationBatch],
  );
}

async function stagingSchemaExists(connection: {
  query<T = unknown>(sql: string, values?: readonly unknown[]): Promise<T>;
}): Promise<boolean> {
  const rows = await connection.query<Array<{ schemaName: string }>>(
    `
      SELECT schema_name AS schemaName
      FROM information_schema.schemata
      WHERE schema_name = 'migration_staging'
    `,
  );

  return rows.length > 0;
}

async function getForbiddenTableCounts(connection: {
  query<T = unknown>(sql: string, values?: readonly unknown[]): Promise<T>;
}): Promise<Record<string, number>> {
  const rows = await connection.query<
    Array<{ tableName: string; total: number }>
  >(
    `
      SELECT 'approval_document' AS tableName, COUNT(*) AS total
      FROM approval_document
      WHERE documentFamily = 'SALES_STOCK' OR documentType = '${SALES_STOCK_DOCUMENT_TYPE}'
      UNION ALL
      SELECT 'document_relation' AS tableName, COUNT(*) AS total
      FROM document_relation
      WHERE upstreamFamily = 'SALES_STOCK'
         OR downstreamFamily = 'SALES_STOCK'
         OR upstreamDocumentType = '${SALES_STOCK_DOCUMENT_TYPE}'
         OR downstreamDocumentType = '${SALES_STOCK_DOCUMENT_TYPE}'
      UNION ALL
      SELECT 'document_line_relation' AS tableName, COUNT(*) AS total
      FROM document_line_relation
      WHERE upstreamFamily = 'SALES_STOCK'
         OR downstreamFamily = 'SALES_STOCK'
         OR upstreamDocumentType = '${SALES_STOCK_DOCUMENT_TYPE}'
         OR downstreamDocumentType = '${SALES_STOCK_DOCUMENT_TYPE}'
      UNION ALL
      SELECT 'factory_number_reservation' AS tableName, COUNT(*) AS total
      FROM factory_number_reservation fnr
      INNER JOIN sales_stock_order cso
        ON cso.id = fnr.businessDocumentId
      WHERE fnr.businessDocumentType = '${SALES_STOCK_DOCUMENT_TYPE}'
        AND cso.orderType = 'SALES_RETURN'
      UNION ALL
      SELECT 'inventory_balance' AS tableName, COUNT(*) AS total
      FROM inventory_balance
      UNION ALL
      SELECT 'inventory_log' AS tableName, COUNT(*) AS total
      FROM inventory_log
      WHERE businessDocumentType = '${SALES_STOCK_DOCUMENT_TYPE}'
      UNION ALL
      SELECT 'inventory_source_usage' AS tableName, COUNT(*) AS total
      FROM inventory_source_usage
      WHERE consumerDocumentType = '${SALES_STOCK_DOCUMENT_TYPE}'
    `,
  );

  return Object.fromEntries(
    rows.map((row) => [row.tableName, Number(row.total)] as const),
  );
}

async function getBatchPendingRelationRows(
  connection: {
    query<T = unknown>(sql: string, values?: readonly unknown[]): Promise<T>;
  },
  migrationBatch: string,
): Promise<PendingRelationStoredRow[]> {
  return connection.query<PendingRelationStoredRow[]>(
    `
      SELECT
        legacy_table AS legacyTable,
        legacy_id AS legacyId,
        legacy_line_id AS legacyLineId,
        pending_reason AS pendingReason,
        payload_json AS payloadJson
      FROM migration_staging.pending_relations
      WHERE migration_batch = ?
        AND legacy_table IN ('saifute_sales_return_order')
      ORDER BY legacy_table ASC, legacy_id ASC, legacy_line_id ASC
    `,
    [migrationBatch],
  );
}

async function getBatchArchivedRelationRows(
  connection: {
    query<T = unknown>(sql: string, values?: readonly unknown[]): Promise<T>;
  },
  migrationBatch: string,
): Promise<ArchivedRelationStoredRow[]> {
  return connection.query<ArchivedRelationStoredRow[]>(
    `
      SELECT
        legacy_table AS legacyTable,
        legacy_id AS legacyId,
        legacy_line_id AS legacyLineId,
        archive_reason AS archiveReason,
        payload_json AS payloadJson
      FROM migration_staging.archived_relations
      WHERE migration_batch = ?
        AND legacy_table IN ('saifute_sales_return_order')
      ORDER BY legacy_table ASC, legacy_id ASC, legacy_line_id ASC
    `,
    [migrationBatch],
  );
}

async function getOrderRowsByDocumentNo(connection: {
  query<T = unknown>(sql: string, values?: readonly unknown[]): Promise<T>;
}): Promise<
  Map<
    string,
    {
      id: number;
      documentNo: string;
      orderType: string;
      bizDate: string;
      customerId: number | null;
      handlerPersonnelId: number | null;
      workshopId: number;
      lifecycleStatus: string;
      auditStatusSnapshot: string;
      inventoryEffectStatus: string;
      revisionNo: number;
      customerCodeSnapshot: string | null;
      customerNameSnapshot: string | null;
      handlerNameSnapshot: string | null;
      workshopNameSnapshot: string;
      totalQty: string;
      totalAmount: string;
      remark: string | null;
      voidReason: string | null;
      voidedBy: string | null;
      voidedAt: string | null;
      createdBy: string | null;
      createdAt: string | null;
      updatedBy: string | null;
      updatedAt: string | null;
    }
  >
> {
  const rows = await connection.query<
    Array<{
      id: number;
      documentNo: string;
      orderType: string;
      bizDate: string;
      customerId: number | null;
      handlerPersonnelId: number | null;
      workshopId: number;
      lifecycleStatus: string;
      auditStatusSnapshot: string;
      inventoryEffectStatus: string;
      revisionNo: number;
      customerCodeSnapshot: string | null;
      customerNameSnapshot: string | null;
      handlerNameSnapshot: string | null;
      workshopNameSnapshot: string;
      totalQty: string;
      totalAmount: string;
      remark: string | null;
      voidReason: string | null;
      voidedBy: string | null;
      voidedAt: string | null;
      createdBy: string | null;
      createdAt: string | null;
      updatedBy: string | null;
      updatedAt: string | null;
    }>
  >(
    `
      SELECT
        id,
        documentNo,
        orderType,
        bizDate,
        customerId,
        handlerPersonnelId,
        workshopId,
        lifecycleStatus,
        auditStatusSnapshot,
        inventoryEffectStatus,
        revisionNo,
        customerCodeSnapshot,
        customerNameSnapshot,
        handlerNameSnapshot,
        workshopNameSnapshot,
        totalQty,
        totalAmount,
        remark,
        voidReason,
        voidedBy,
        voidedAt,
        createdBy,
        createdAt,
        updatedBy,
        updatedAt
      FROM sales_stock_order
      ORDER BY documentNo ASC
    `,
  );

  return new Map(rows.map((row) => [row.documentNo, row] as const));
}

function buildLineIdentity(documentNo: string, lineNo: number): string {
  return `${documentNo}#${lineNo}`;
}

async function getLineRowsByIdentity(connection: {
  query<T = unknown>(sql: string, values?: readonly unknown[]): Promise<T>;
}): Promise<
  Map<
    string,
    {
      documentNo: string;
      lineNo: number;
      materialId: number;
      materialCodeSnapshot: string;
      materialNameSnapshot: string;
      materialSpecSnapshot: string | null;
      unitCodeSnapshot: string;
      quantity: string;
      unitPrice: string;
      amount: string;
      startNumber: string | null;
      endNumber: string | null;
      sourceDocumentType: string | null;
      sourceDocumentId: number | null;
      sourceDocumentLineId: number | null;
      remark: string | null;
      createdBy: string | null;
      createdAt: string | null;
      updatedBy: string | null;
      updatedAt: string | null;
    }
  >
> {
  const rows = await connection.query<
    Array<{
      documentNo: string;
      lineNo: number;
      materialId: number;
      materialCodeSnapshot: string;
      materialNameSnapshot: string;
      materialSpecSnapshot: string | null;
      unitCodeSnapshot: string;
      quantity: string;
      unitPrice: string;
      amount: string;
      startNumber: string | null;
      endNumber: string | null;
      sourceDocumentType: string | null;
      sourceDocumentId: number | null;
      sourceDocumentLineId: number | null;
      remark: string | null;
      createdBy: string | null;
      createdAt: string | null;
      updatedBy: string | null;
      updatedAt: string | null;
    }>
  >(
    `
      SELECT
        order_row.documentNo AS documentNo,
        line_row.lineNo AS lineNo,
        line_row.materialId AS materialId,
        line_row.materialCodeSnapshot AS materialCodeSnapshot,
        line_row.materialNameSnapshot AS materialNameSnapshot,
        line_row.materialSpecSnapshot AS materialSpecSnapshot,
        line_row.unitCodeSnapshot AS unitCodeSnapshot,
        line_row.quantity AS quantity,
        line_row.unitPrice AS unitPrice,
        line_row.amount AS amount,
        line_row.startNumber AS startNumber,
        line_row.endNumber AS endNumber,
        line_row.sourceDocumentType AS sourceDocumentType,
        line_row.sourceDocumentId AS sourceDocumentId,
        line_row.sourceDocumentLineId AS sourceDocumentLineId,
        line_row.remark AS remark,
        line_row.createdBy AS createdBy,
        line_row.createdAt AS createdAt,
        line_row.updatedBy AS updatedBy,
        line_row.updatedAt AS updatedAt
      FROM sales_stock_order_line line_row
      INNER JOIN sales_stock_order order_row
        ON order_row.id = line_row.orderId
      ORDER BY order_row.documentNo ASC, line_row.lineNo ASC
    `,
  );

  return new Map(
    rows.map(
      (row) => [buildLineIdentity(row.documentNo, row.lineNo), row] as const,
    ),
  );
}

async function main(): Promise<void> {
  const cliOptions = parseMigrationCliOptions();
  const reportPath = resolveReportPath(
    cliOptions,
    "outbound-sales-return-validate-report.json",
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
    const { snapshot, dependencies, plan } = await withPoolConnection(
      legacyPool,
      async (legacyConnection) => {
        const snapshot = await readLegacySalesReturnSnapshot(legacyConnection);
        const dependencies = await withPoolConnection(
          targetPool,
          async (targetConnection) =>
            readSalesReturnDependencySnapshot(targetConnection),
        );

        return {
          snapshot,
          dependencies,
          plan: buildSalesReturnMigrationPlan(snapshot, dependencies),
        };
      },
    );

    const expectedArchivedPayloads = collectExpectedArchivedPayloads(plan);
    const expectedExcludedDocuments = collectExpectedExcludedDocuments(plan);

    const report = await withPoolConnection(
      targetPool,
      async (targetConnection) => {
        const validationIssues: Array<Record<string, unknown>> = [];
        const stagingReady = await stagingSchemaExists(targetConnection);
        const expectedAdmittedOrders = plan.admittedOrders.length;
        const expectedAdmittedLines = plan.admittedOrders.reduce(
          (total, order) => total + order.lines.length,
          0,
        );

        if (!stagingReady) {
          validationIssues.push({
            severity: "blocker",
            reason: "migration_staging schema does not exist.",
          });
        }

        if (plan.globalBlockers.length > 0) {
          validationIssues.push(
            ...plan.globalBlockers.map((blocker) => ({
              severity: "blocker",
              reason: blocker.reason,
              ...blocker.details,
            })),
          );
        }

        const orderBatchMapRows = stagingReady
          ? await getBatchMapCount(
              targetConnection,
              MAP_TABLES.order,
              plan.migrationBatch,
            )
          : 0;
        const lineBatchMapRows = stagingReady
          ? await getBatchMapCount(
              targetConnection,
              MAP_TABLES.line,
              plan.migrationBatch,
            )
          : 0;
        const batchOwnedOrderRows = stagingReady
          ? await getBatchOwnedTargetRowCount(
              targetConnection,
              MAP_TABLES.order,
              TARGET_TABLES.order,
              plan.migrationBatch,
            )
          : 0;
        const batchOwnedLineRows = stagingReady
          ? await getBatchOwnedTargetRowCount(
              targetConnection,
              MAP_TABLES.line,
              TARGET_TABLES.line,
              plan.migrationBatch,
            )
          : 0;
        const missingMappedOrders = stagingReady
          ? await getMissingMapTargets(
              targetConnection,
              MAP_TABLES.order,
              TARGET_TABLES.order,
              plan.migrationBatch,
            )
          : 0;
        const missingMappedLines = stagingReady
          ? await getMissingMapTargets(
              targetConnection,
              MAP_TABLES.line,
              TARGET_TABLES.line,
              plan.migrationBatch,
            )
          : 0;
        const forbiddenTableCounts =
          await getForbiddenTableCounts(targetConnection);
        const pendingRelationRows = stagingReady
          ? await getBatchPendingRelationRows(
              targetConnection,
              plan.migrationBatch,
            )
          : [];
        const archivedRelationRows = stagingReady
          ? await getBatchArchivedRelationRows(
              targetConnection,
              plan.migrationBatch,
            )
          : [];
        const batchPendingRelationCount = pendingRelationRows.length;
        const batchArchivedRelationCount = archivedRelationRows.length;

        if (stagingReady && orderBatchMapRows !== expectedAdmittedOrders) {
          validationIssues.push({
            severity: "blocker",
            reason:
              "sales-return order map row count does not match the deterministic migration plan.",
            expectedAdmittedOrders,
            actualOrderMapRows: orderBatchMapRows,
          });
        }

        if (stagingReady && lineBatchMapRows !== expectedAdmittedLines) {
          validationIssues.push({
            severity: "blocker",
            reason:
              "sales-return line map row count does not match the deterministic migration plan.",
            expectedAdmittedLines,
            actualLineMapRows: lineBatchMapRows,
          });
        }

        if (batchOwnedOrderRows !== expectedAdmittedOrders) {
          validationIssues.push({
            severity: "blocker",
            reason:
              "Batch-owned sales_stock_order row count does not match the migration plan.",
            expectedAdmittedOrders,
            actualBatchOwnedOrderRows: batchOwnedOrderRows,
          });
        }

        if (batchOwnedLineRows !== expectedAdmittedLines) {
          validationIssues.push({
            severity: "blocker",
            reason:
              "Batch-owned sales_stock_order_line row count does not match the migration plan.",
            expectedAdmittedLines,
            actualBatchOwnedLineRows: batchOwnedLineRows,
          });
        }

        if (missingMappedOrders > 0) {
          validationIssues.push({
            severity: "blocker",
            reason:
              "Some sales-return order staging map rows point at missing target rows.",
            missingMappedOrders,
          });
        }

        if (missingMappedLines > 0) {
          validationIssues.push({
            severity: "blocker",
            reason:
              "Some sales-return line staging map rows point at missing target rows.",
            missingMappedLines,
          });
        }

        for (const [tableName, total] of Object.entries(forbiddenTableCounts)) {
          if (total > 0) {
            validationIssues.push({
              severity: "blocker",
              reason:
                "A table that must remain untouched by the sales-return slice already contains SalesStockOrder-linked rows.",
              tableName,
              total,
            });
          }
        }

        // Under the formal-row-first rule, pending_relations are no longer written by this
        // slice. Any non-zero count here indicates stale rows from a prior execution under
        // the old recoverable-only behavior. This is reported as a blocker so that the
        // operator can clear them before validating the new plan.
        if (stagingReady && batchPendingRelationCount > 0) {
          validationIssues.push({
            severity: "blocker",
            reason:
              "Batch-owned pending_relations rows are present but the formal-row-first plan expects none. Rerun migrate --execute to clean up stale staging rows.",
            batchPendingRelationCount,
          });
        }

        const expectedPendingRelations = collectExpectedPendingRelations(plan);
        const expectedArchivedRelations =
          collectExpectedArchivedRelations(plan);

        if (
          stagingReady &&
          pendingRelationRows.length !== expectedPendingRelations.length
        ) {
          validationIssues.push({
            severity: "blocker",
            reason:
              "pending_relations row count does not match the deterministic sales-return plan.",
            expectedPendingRelationCount: expectedPendingRelations.length,
            actualPendingRelationCount: pendingRelationRows.length,
          });
        }

        const pendingRelationRowsByIdentity = new Map(
          pendingRelationRows.map(
            (row) => [buildRelationStagingIdentity(row), row] as const,
          ),
        );
        const expectedPendingKeys = new Set(
          expectedPendingRelations.map((expectation) =>
            buildRelationStagingIdentity(expectation),
          ),
        );

        for (const expectation of expectedPendingRelations) {
          const storedRow = pendingRelationRowsByIdentity.get(
            buildRelationStagingIdentity(expectation),
          );

          if (!storedRow) {
            validationIssues.push({
              severity: "blocker",
              reason: "Expected pending_relations row is missing.",
              legacyTable: expectation.legacyTable,
              legacyId: expectation.legacyId,
              legacyLineId: expectation.legacyLineId,
            });
            continue;
          }

          if (storedRow.pendingReason !== expectation.pendingReason) {
            validationIssues.push({
              severity: "blocker",
              reason:
                "pending_relations pending_reason does not match the deterministic plan.",
              legacyTable: expectation.legacyTable,
              legacyId: expectation.legacyId,
              legacyLineId: expectation.legacyLineId,
              expectedPendingReason: expectation.pendingReason,
              actualPendingReason: storedRow.pendingReason,
            });
          }

          if (storedRow.payloadJson !== expectation.payloadJson) {
            validationIssues.push({
              severity: "blocker",
              reason:
                "pending_relations payload_json does not match the deterministic plan.",
              legacyTable: expectation.legacyTable,
              legacyId: expectation.legacyId,
              legacyLineId: expectation.legacyLineId,
            });
          }
        }

        const unexpectedPendingRelationRows = pendingRelationRows.filter(
          (row) => !expectedPendingKeys.has(buildRelationStagingIdentity(row)),
        );

        if (unexpectedPendingRelationRows.length > 0) {
          validationIssues.push({
            severity: "blocker",
            reason:
              "pending_relations contains rows outside the sales-return deterministic plan.",
            unexpectedPendingRelationRows: unexpectedPendingRelationRows.map(
              (row) => ({
                legacyTable: row.legacyTable,
                legacyId: row.legacyId,
                legacyLineId: row.legacyLineId,
              }),
            ),
          });
        }

        // archived_relations is a historical artifact of the superseded recoverable-only model.
        // Under the formal-row-first rule, an empty current pending plan means these archive rows
        // are no longer an active completion gate and should not fail validation by themselves.
        if (expectedArchivedRelations.length > 0) {
          const expectedArchivedRelationsByIdentity = new Map(
            expectedArchivedRelations.map((record) => [
              buildRelationStagingIdentity(record),
              record,
            ]),
          );

          const unexpectedArchivedRelationRows: ArchivedRelationStoredRow[] =
            [];
          const mismatchedArchivedReasonRows: Array<{
            legacyTable: string;
            legacyId: number;
            legacyLineId: number | null;
            expectedArchiveReason: string;
            actualArchiveReason: string;
          }> = [];
          const mismatchedArchivedPayloadRows: Array<{
            legacyTable: string;
            legacyId: number;
            legacyLineId: number | null;
          }> = [];

          for (const row of archivedRelationRows) {
            const expectedRelation = expectedArchivedRelationsByIdentity.get(
              buildRelationStagingIdentity(row),
            );

            if (!expectedRelation) {
              unexpectedArchivedRelationRows.push(row);
            } else if (row.archiveReason !== expectedRelation.archiveReason) {
              mismatchedArchivedReasonRows.push({
                legacyTable: row.legacyTable,
                legacyId: row.legacyId,
                legacyLineId: row.legacyLineId,
                expectedArchiveReason: expectedRelation.archiveReason,
                actualArchiveReason: row.archiveReason,
              });
            } else if (row.payloadJson !== expectedRelation.payloadJson) {
              mismatchedArchivedPayloadRows.push({
                legacyTable: row.legacyTable,
                legacyId: row.legacyId,
                legacyLineId: row.legacyLineId,
              });
            }
          }

          if (unexpectedArchivedRelationRows.length > 0) {
            validationIssues.push({
              severity: "blocker",
              reason:
                "archived_relations contains rows whose identity is not traceable to the sales-return pending plan.",
              unexpectedArchivedRelationRows:
                unexpectedArchivedRelationRows.map((row) => ({
                  legacyTable: row.legacyTable,
                  legacyId: row.legacyId,
                  legacyLineId: row.legacyLineId,
                })),
            });
          }

          if (mismatchedArchivedReasonRows.length > 0) {
            validationIssues.push({
              severity: "blocker",
              reason:
                "archived_relations archive_reason does not match the expected reason from the sales-return pending plan.",
              mismatchedArchivedReasonRows,
            });
          }

          if (mismatchedArchivedPayloadRows.length > 0) {
            validationIssues.push({
              severity: "blocker",
              reason:
                "archived_relations payload_json does not match the deterministic payload derived from the sales-return pending plan.",
              mismatchedArchivedPayloadRows,
            });
          }
        }

        const archivedPayloadCount = stagingReady
          ? await getArchivedPayloadCount(targetConnection, plan.migrationBatch)
          : 0;
        const archivedPayloadRows = stagingReady
          ? await getArchivedPayloadRows(targetConnection, plan.migrationBatch)
          : [];
        const excludedDocumentRows = stagingReady
          ? await getExcludedDocumentRows(targetConnection, plan.migrationBatch)
          : [];

        if (
          stagingReady &&
          archivedPayloadCount !== expectedArchivedPayloads.length
        ) {
          validationIssues.push({
            severity: "blocker",
            reason:
              "archived_field_payload row count does not match the deterministic sales-return plan.",
            expectedArchivedPayloadCount: expectedArchivedPayloads.length,
            actualArchivedPayloadCount: archivedPayloadCount,
          });
        }

        if (
          stagingReady &&
          excludedDocumentRows.length !== expectedExcludedDocuments.length
        ) {
          validationIssues.push({
            severity: "blocker",
            reason:
              "excluded_documents row count does not match the deterministic sales-return plan.",
            expectedExcludedDocumentCount: expectedExcludedDocuments.length,
            actualExcludedDocumentCount: excludedDocumentRows.length,
          });
        }

        const archivedPayloadRowsByIdentity = new Map(
          archivedPayloadRows.map(
            (row) => [buildArchivedPayloadIdentity(row), row] as const,
          ),
        );
        const expectedArchivedPayloadKeys = new Set(
          expectedArchivedPayloads.map((expectation) =>
            buildArchivedPayloadIdentity(expectation),
          ),
        );

        for (const expectation of expectedArchivedPayloads) {
          const storedRow = archivedPayloadRowsByIdentity.get(
            buildArchivedPayloadIdentity(expectation),
          );

          if (!storedRow) {
            validationIssues.push({
              severity: "blocker",
              reason: "Expected archived_field_payload row is missing.",
              legacyTable: expectation.legacyTable,
              legacyId: expectation.legacyId,
              targetTable: expectation.targetTable,
            });
            continue;
          }

          if (storedRow.targetCode !== expectation.targetCode) {
            validationIssues.push({
              severity: "blocker",
              reason:
                "archived_field_payload target_code does not match the deterministic plan.",
              legacyTable: expectation.legacyTable,
              legacyId: expectation.legacyId,
              expectedTargetCode: expectation.targetCode,
              actualTargetCode: storedRow.targetCode,
            });
          }

          if (storedRow.archiveReason !== expectation.archiveReason) {
            validationIssues.push({
              severity: "blocker",
              reason:
                "archived_field_payload archive_reason does not match the deterministic plan.",
              legacyTable: expectation.legacyTable,
              legacyId: expectation.legacyId,
              expectedArchiveReason: expectation.archiveReason,
              actualArchiveReason: storedRow.archiveReason,
            });
          }

          if (storedRow.payloadJson !== expectation.payloadJson) {
            validationIssues.push({
              severity: "blocker",
              reason:
                "archived_field_payload payload_json does not match the deterministic plan.",
              legacyTable: expectation.legacyTable,
              legacyId: expectation.legacyId,
            });
          }
        }

        const unexpectedArchivedPayloadRows = archivedPayloadRows.filter(
          (row) =>
            !expectedArchivedPayloadKeys.has(buildArchivedPayloadIdentity(row)),
        );

        if (unexpectedArchivedPayloadRows.length > 0) {
          validationIssues.push({
            severity: "blocker",
            reason:
              "archived_field_payload contains rows outside the sales-return deterministic plan.",
            unexpectedArchivedPayloadRows: unexpectedArchivedPayloadRows.map(
              (row) => ({
                legacyTable: row.legacyTable,
                legacyId: row.legacyId,
                targetTable: row.targetTable,
                payloadKind: row.payloadKind,
              }),
            ),
          });
        }

        const excludedRowsByIdentity = new Map(
          excludedDocumentRows.map(
            (row) => [buildExcludedDocumentIdentity(row), row] as const,
          ),
        );
        const expectedExcludedKeys = new Set(
          expectedExcludedDocuments.map((record) =>
            buildExcludedDocumentIdentity(record),
          ),
        );

        for (const expectation of expectedExcludedDocuments) {
          const storedRow = excludedRowsByIdentity.get(
            buildExcludedDocumentIdentity(expectation),
          );

          if (!storedRow) {
            validationIssues.push({
              severity: "blocker",
              reason: "Expected excluded_documents row is missing.",
              legacyTable: expectation.legacyTable,
              legacyId: expectation.legacyId,
            });
            continue;
          }

          if (storedRow.exclusionReason !== expectation.exclusionReason) {
            validationIssues.push({
              severity: "blocker",
              reason:
                "excluded_documents exclusion_reason does not match the deterministic plan.",
              legacyTable: expectation.legacyTable,
              legacyId: expectation.legacyId,
              expectedExclusionReason: expectation.exclusionReason,
              actualExclusionReason: storedRow.exclusionReason,
            });
          }

          if (storedRow.payloadJson !== expectation.payloadJson) {
            validationIssues.push({
              severity: "blocker",
              reason:
                "excluded_documents payload_json does not match the deterministic plan.",
              legacyTable: expectation.legacyTable,
              legacyId: expectation.legacyId,
            });
          }
        }

        const unexpectedExcludedRows = excludedDocumentRows.filter(
          (row) =>
            !expectedExcludedKeys.has(buildExcludedDocumentIdentity(row)),
        );

        if (unexpectedExcludedRows.length > 0) {
          validationIssues.push({
            severity: "blocker",
            reason:
              "excluded_documents contains rows outside the sales-return deterministic plan.",
            unexpectedExcludedRows: unexpectedExcludedRows.map((row) => ({
              legacyTable: row.legacyTable,
              legacyId: row.legacyId,
            })),
          });
        }

        const orderRowsByDocumentNo =
          await getOrderRowsByDocumentNo(targetConnection);
        const lineRowsByIdentity =
          await getLineRowsByIdentity(targetConnection);

        for (const order of plan.admittedOrders) {
          const targetRow = orderRowsByDocumentNo.get(order.target.documentNo);

          if (!targetRow) {
            validationIssues.push({
              severity: "blocker",
              reason: "Expected sales_stock_order row is missing.",
              legacyTable: order.legacyTable,
              legacyId: order.legacyId,
              documentNo: order.target.documentNo,
            });
            continue;
          }

          const context = {
            legacyTable: order.legacyTable,
            legacyId: order.legacyId,
            documentNo: order.target.documentNo,
          };

          pushValueMismatch(
            validationIssues,
            context,
            "sales_stock_order.orderType",
            order.target.orderType,
            targetRow.orderType,
          );
          pushValueMismatch(
            validationIssues,
            context,
            "sales_stock_order.bizDate",
            order.target.bizDate,
            targetRow.bizDate,
          );
          pushValueMismatch(
            validationIssues,
            context,
            "sales_stock_order.customerId",
            order.target.customerId,
            targetRow.customerId,
          );
          pushValueMismatch(
            validationIssues,
            context,
            "sales_stock_order.handlerPersonnelId",
            order.target.handlerPersonnelId,
            targetRow.handlerPersonnelId,
          );
          pushValueMismatch(
            validationIssues,
            context,
            "sales_stock_order.workshopId",
            order.target.workshopId,
            targetRow.workshopId,
          );
          pushValueMismatch(
            validationIssues,
            context,
            "sales_stock_order.lifecycleStatus",
            order.target.lifecycleStatus,
            targetRow.lifecycleStatus,
          );
          pushValueMismatch(
            validationIssues,
            context,
            "sales_stock_order.auditStatusSnapshot",
            order.target.auditStatusSnapshot,
            targetRow.auditStatusSnapshot,
          );
          pushValueMismatch(
            validationIssues,
            context,
            "sales_stock_order.inventoryEffectStatus",
            order.target.inventoryEffectStatus,
            targetRow.inventoryEffectStatus,
          );
          pushValueMismatch(
            validationIssues,
            context,
            "sales_stock_order.revisionNo",
            order.target.revisionNo,
            targetRow.revisionNo,
          );
          pushValueMismatch(
            validationIssues,
            context,
            "sales_stock_order.customerCodeSnapshot",
            order.target.customerCodeSnapshot,
            targetRow.customerCodeSnapshot,
          );
          pushValueMismatch(
            validationIssues,
            context,
            "sales_stock_order.customerNameSnapshot",
            order.target.customerNameSnapshot,
            targetRow.customerNameSnapshot,
          );
          pushValueMismatch(
            validationIssues,
            context,
            "sales_stock_order.handlerNameSnapshot",
            order.target.handlerNameSnapshot,
            targetRow.handlerNameSnapshot,
          );
          pushValueMismatch(
            validationIssues,
            context,
            "sales_stock_order.workshopNameSnapshot",
            order.target.workshopNameSnapshot,
            targetRow.workshopNameSnapshot,
          );
          pushValueMismatch(
            validationIssues,
            context,
            "sales_stock_order.totalQty",
            order.target.totalQty,
            targetRow.totalQty,
          );
          pushValueMismatch(
            validationIssues,
            context,
            "sales_stock_order.totalAmount",
            order.target.totalAmount,
            targetRow.totalAmount,
          );
          pushValueMismatch(
            validationIssues,
            context,
            "sales_stock_order.remark",
            order.target.remark,
            targetRow.remark,
          );
          pushValueMismatch(
            validationIssues,
            context,
            "sales_stock_order.voidReason",
            order.target.voidReason,
            targetRow.voidReason,
          );
          pushValueMismatch(
            validationIssues,
            context,
            "sales_stock_order.voidedBy",
            order.target.voidedBy,
            targetRow.voidedBy,
          );
          pushValueMismatch(
            validationIssues,
            context,
            "sales_stock_order.voidedAt",
            order.target.voidedAt,
            targetRow.voidedAt,
          );
          pushValueMismatch(
            validationIssues,
            context,
            "sales_stock_order.createdBy",
            order.target.createdBy,
            targetRow.createdBy,
          );
          pushValueMismatch(
            validationIssues,
            context,
            "sales_stock_order.createdAt",
            order.target.createdAt,
            targetRow.createdAt,
          );
          pushValueMismatch(
            validationIssues,
            context,
            "sales_stock_order.updatedBy",
            order.target.updatedBy,
            targetRow.updatedBy,
          );
          pushValueMismatch(
            validationIssues,
            context,
            "sales_stock_order.updatedAt",
            order.target.updatedAt,
            targetRow.updatedAt,
          );

          for (const line of order.lines) {
            const targetLine = lineRowsByIdentity.get(
              buildLineIdentity(order.target.documentNo, line.target.lineNo),
            );

            if (!targetLine) {
              validationIssues.push({
                severity: "blocker",
                reason: "Expected sales_stock_order_line row is missing.",
                legacyTable: line.legacyTable,
                legacyId: line.legacyId,
                documentNo: order.target.documentNo,
                lineNo: line.target.lineNo,
              });
              continue;
            }

            const lineContext = {
              legacyTable: line.legacyTable,
              legacyId: line.legacyId,
              documentNo: order.target.documentNo,
              lineNo: line.target.lineNo,
            };

            pushValueMismatch(
              validationIssues,
              lineContext,
              "sales_stock_order_line.materialId",
              line.target.materialId,
              targetLine.materialId,
            );
            pushValueMismatch(
              validationIssues,
              lineContext,
              "sales_stock_order_line.materialCodeSnapshot",
              line.target.materialCodeSnapshot,
              targetLine.materialCodeSnapshot,
            );
            pushValueMismatch(
              validationIssues,
              lineContext,
              "sales_stock_order_line.materialNameSnapshot",
              line.target.materialNameSnapshot,
              targetLine.materialNameSnapshot,
            );
            pushValueMismatch(
              validationIssues,
              lineContext,
              "sales_stock_order_line.materialSpecSnapshot",
              line.target.materialSpecSnapshot,
              targetLine.materialSpecSnapshot,
            );
            pushValueMismatch(
              validationIssues,
              lineContext,
              "sales_stock_order_line.unitCodeSnapshot",
              line.target.unitCodeSnapshot,
              targetLine.unitCodeSnapshot,
            );
            pushValueMismatch(
              validationIssues,
              lineContext,
              "sales_stock_order_line.quantity",
              line.target.quantity,
              targetLine.quantity,
            );
            pushValueMismatch(
              validationIssues,
              lineContext,
              "sales_stock_order_line.unitPrice",
              line.target.unitPrice,
              targetLine.unitPrice,
            );
            pushValueMismatch(
              validationIssues,
              lineContext,
              "sales_stock_order_line.amount",
              line.target.amount,
              targetLine.amount,
            );
            pushValueMismatch(
              validationIssues,
              lineContext,
              "sales_stock_order_line.startNumber",
              line.target.startNumber,
              targetLine.startNumber,
            );
            pushValueMismatch(
              validationIssues,
              lineContext,
              "sales_stock_order_line.endNumber",
              line.target.endNumber,
              targetLine.endNumber,
            );
            pushValueMismatch(
              validationIssues,
              lineContext,
              "sales_stock_order_line.sourceDocumentType",
              line.target.sourceDocumentType,
              targetLine.sourceDocumentType,
            );
            pushValueMismatch(
              validationIssues,
              lineContext,
              "sales_stock_order_line.sourceDocumentId",
              line.target.sourceDocumentId,
              targetLine.sourceDocumentId,
            );
            pushValueMismatch(
              validationIssues,
              lineContext,
              "sales_stock_order_line.sourceDocumentLineId",
              line.target.sourceDocumentLineId,
              targetLine.sourceDocumentLineId,
            );
            pushValueMismatch(
              validationIssues,
              lineContext,
              "sales_stock_order_line.remark",
              line.target.remark,
              targetLine.remark,
            );
            pushValueMismatch(
              validationIssues,
              lineContext,
              "sales_stock_order_line.createdBy",
              line.target.createdBy,
              targetLine.createdBy,
            );
            pushValueMismatch(
              validationIssues,
              lineContext,
              "sales_stock_order_line.createdAt",
              line.target.createdAt,
              targetLine.createdAt,
            );
            pushValueMismatch(
              validationIssues,
              lineContext,
              "sales_stock_order_line.updatedBy",
              line.target.updatedBy,
              targetLine.updatedBy,
            );
            pushValueMismatch(
              validationIssues,
              lineContext,
              "sales_stock_order_line.updatedAt",
              line.target.updatedAt,
              targetLine.updatedAt,
            );
          }
        }

        const cutoverReady = !validationIssues.some(
          (issue) => issue.severity === "blocker",
        );

        return {
          mode: "validate",
          targetDatabaseName,
          migrationBatch: plan.migrationBatch,
          sourceCounts: {
            orders: snapshot.orders.length,
            details: snapshot.details.length,
            audits: snapshot.audits.length,
          },
          dependencyBaseline: {
            batch1: dependencies.batch1Baseline,
            outboundBase: dependencies.outboundBaseBaseline,
          },
          counts: plan.counts,
          expectedArchivedPayloadCount: expectedArchivedPayloads.length,
          expectedExcludedDocumentCount: expectedExcludedDocuments.length,
          admittedLinesWithNullSourceDocument:
            plan.counts.admittedLinesWithNullSourceDocument,
          targetSummary: {
            orderBatchMapRows,
            lineBatchMapRows,
            batchOwnedOrderRows,
            batchOwnedLineRows,
            missingMappedOrders,
            missingMappedLines,
            archivedPayloadCount,
            excludedDocumentCount: excludedDocumentRows.length,
            forbiddenTableCounts,
            batchPendingRelationCount,
            batchArchivedRelationCount,
            pendingRelationIdentitySummary: pendingRelationRows.map((row) => ({
              legacyTable: row.legacyTable,
              legacyId: row.legacyId,
              legacyLineId: row.legacyLineId,
              pendingReason: row.pendingReason,
            })),
            archivedRelationIdentitySummary: archivedRelationRows.map(
              (row) => ({
                legacyTable: row.legacyTable,
                legacyId: row.legacyId,
                legacyLineId: row.legacyLineId,
                archiveReason: row.archiveReason,
              }),
            ),
          },
          cutoverReady,
          validationIssues,
        };
      },
    );

    writeStableReport(reportPath, report);
    console.log(`Sales-return validation completed. report=${reportPath}`);

    if (report.validationIssues.some((issue) => issue.severity === "blocker")) {
      process.exitCode = 1;
    }
  } finally {
    await closePools(legacyPool, targetPool);
  }
}

void main();
