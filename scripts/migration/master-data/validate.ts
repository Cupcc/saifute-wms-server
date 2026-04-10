import {
  assertDistinctSourceAndTargetDatabases,
  assertExpectedDatabaseName,
  EXPECTED_TARGET_DATABASE_NAME,
  loadMigrationEnvironment,
  parseMigrationCliOptions,
  resolveReportPath,
} from "../config";
import { closePools, createMariaDbPool, withPoolConnection } from "../db";
import { stableJsonStringify } from "../shared/deterministic";
import { writeStableReport } from "../shared/report-writer";
import { readLegacyMasterDataSnapshot } from "./legacy-reader";
import { buildMasterDataMigrationPlan } from "./transformer";
import type {
  ArchivedFieldPayloadRecord,
  MasterDataEntity,
  MasterDataMigrationPlan,
} from "./types";
import { MAP_TABLE_BY_ENTITY, TARGET_TABLE_BY_ENTITY } from "./writer";

const CODE_COLUMN_BY_ENTITY: Record<MasterDataEntity, string> = {
  materialCategory: "categoryCode",
  workshop: "workshopName",
  supplier: "supplierCode",
  personnel: "personnelName",
  customer: "customerCode",
  material: "materialCode",
};

interface ArchivedPayloadExpectation {
  entity: MasterDataEntity;
  legacyTable: string;
  legacyId: number;
  targetTable: string;
  targetCode: string;
  payloadKind: ArchivedFieldPayloadRecord["payloadKind"];
  archiveReason: string;
  payloadJson: string;
  expectsTargetId: boolean;
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

function comparableScalar(value: unknown): string | null {
  if (value === null || value === undefined) {
    return null;
  }

  const stringValue = String(value).trim();

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
  context: {
    entity: MasterDataEntity;
    legacyTable: string;
    legacyId: number;
    targetCode: string;
  },
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

function collectExpectedArchivedPayloads(
  plan: MasterDataMigrationPlan,
): ArchivedPayloadExpectation[] {
  const expectations: ArchivedPayloadExpectation[] = [];

  for (const entity of plan.entityOrder) {
    for (const record of plan.records[entity]) {
      if (!record.archivedPayload) {
        continue;
      }

      expectations.push({
        entity,
        legacyTable: record.archivedPayload.legacyTable,
        legacyId: record.archivedPayload.legacyId,
        targetTable: record.archivedPayload.targetTable,
        targetCode: record.archivedPayload.targetCode,
        payloadKind: record.archivedPayload.payloadKind,
        archiveReason: record.archivedPayload.archiveReason,
        payloadJson: stableJsonStringify(record.archivedPayload.payload),
        expectsTargetId: record.blockers.length === 0,
      });
    }
  }

  return expectations.sort(
    (left, right) =>
      left.entity.localeCompare(right.entity) ||
      left.legacyTable.localeCompare(right.legacyTable) ||
      left.legacyId - right.legacyId ||
      left.targetTable.localeCompare(right.targetTable) ||
      left.payloadKind.localeCompare(right.payloadKind),
  );
}

async function getTableCount(
  connection: {
    query<T = unknown>(sql: string, values?: readonly unknown[]): Promise<T>;
  },
  tableName: string,
): Promise<number> {
  const rows = await connection.query<Array<{ total: number }>>(
    `SELECT COUNT(*) AS total FROM ${tableName}`,
  );
  return Number(rows[0]?.total ?? 0);
}

async function getMapCount(
  connection: {
    query<T = unknown>(sql: string, values?: readonly unknown[]): Promise<T>;
  },
  entity: MasterDataEntity,
  migrationBatch: string,
): Promise<number> {
  const rows = await connection.query<Array<{ total: number }>>(
    `SELECT COUNT(*) AS total FROM migration_staging.${MAP_TABLE_BY_ENTITY[entity]} WHERE migration_batch = ?`,
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
      ORDER BY legacy_table ASC, legacy_id ASC, target_table ASC, payload_kind ASC
    `,
    [migrationBatch],
  );
}

async function getTargetRowsByCode<T extends Record<string, unknown>>(
  connection: {
    query<TResult = unknown>(
      sql: string,
      values?: readonly unknown[],
    ): Promise<TResult>;
  },
  sql: string,
  codeField: keyof T,
): Promise<Map<string, T>> {
  const rows = await connection.query<T[]>(sql);
  const rowsByCode = new Map<string, T>();

  for (const row of rows) {
    const codeValue = row[codeField];

    if (typeof codeValue === "string") {
      rowsByCode.set(codeValue, row);
    }
  }

  return rowsByCode;
}

async function getMissingMapTargets(
  connection: {
    query<T = unknown>(sql: string, values?: readonly unknown[]): Promise<T>;
  },
  entity: MasterDataEntity,
  migrationBatch: string,
): Promise<number> {
  const mapTable = MAP_TABLE_BY_ENTITY[entity];
  const targetTable = TARGET_TABLE_BY_ENTITY[entity];

  const rows = await connection.query<Array<{ total: number }>>(
    `
      SELECT COUNT(*) AS total
      FROM migration_staging.${mapTable} map_row
      LEFT JOIN ${targetTable} target_row
        ON target_row.id = map_row.target_id
      WHERE map_row.migration_batch = ?
        AND target_row.id IS NULL
    `,
    [migrationBatch],
  );

  return Number(rows[0]?.total ?? 0);
}

async function getDuplicateCodes(
  connection: {
    query<T = unknown>(sql: string, values?: readonly unknown[]): Promise<T>;
  },
  entity: MasterDataEntity,
): Promise<Array<{ code: string; total: number }>> {
  const targetTable = TARGET_TABLE_BY_ENTITY[entity];
  const codeColumn = CODE_COLUMN_BY_ENTITY[entity];

  return connection.query<Array<{ code: string; total: number }>>(
    `
      SELECT ${codeColumn} AS code, COUNT(*) AS total
      FROM ${targetTable}
      GROUP BY ${codeColumn}
      HAVING COUNT(*) > 1
      ORDER BY ${codeColumn} ASC
    `,
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

async function main(): Promise<void> {
  const cliOptions = parseMigrationCliOptions();
  const reportPath = resolveReportPath(
    cliOptions,
    "master-data-validate-report.json",
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
    const { snapshot, plan } = await withPoolConnection(
      legacyPool,
      async (legacyConnection) => {
        const snapshot = await readLegacyMasterDataSnapshot(legacyConnection);
        return {
          snapshot,
          plan: buildMasterDataMigrationPlan(snapshot),
        };
      },
    );

    const report = await withPoolConnection(
      targetPool,
      async (targetConnection) => {
        const validationIssues: Array<Record<string, unknown>> = [];
        const expectedArchivedPayloads = collectExpectedArchivedPayloads(plan);
        const targetSummary = {} as Record<
          MasterDataEntity,
          {
            expectedMigratedRows: number;
            targetRows: number;
            mapRows: number;
            missingMappedTargets: number;
            duplicateCodes: Array<{ code: string; total: number }>;
          }
        >;

        const stagingReady = await stagingSchemaExists(targetConnection);
        if (!stagingReady) {
          validationIssues.push({
            severity: "blocker",
            reason: "migration_staging schema does not exist.",
          });
        }

        for (const entity of plan.entityOrder) {
          const expectedMigratedRows = plan.records[entity].filter(
            (record) => record.blockers.length === 0,
          ).length;
          const targetRows = await getTableCount(
            targetConnection,
            TARGET_TABLE_BY_ENTITY[entity],
          );
          const mapRows = stagingReady
            ? await getMapCount(targetConnection, entity, plan.migrationBatch)
            : 0;
          const missingMappedTargets = stagingReady
            ? await getMissingMapTargets(
                targetConnection,
                entity,
                plan.migrationBatch,
              )
            : 0;
          const duplicateCodes = await getDuplicateCodes(
            targetConnection,
            entity,
          );

          if (stagingReady && mapRows !== expectedMigratedRows) {
            validationIssues.push({
              severity: "blocker",
              entity,
              reason:
                "Map row count does not match the deterministic migration plan.",
              expectedMigratedRows,
              actualMapRows: mapRows,
            });
          }

          if (targetRows < expectedMigratedRows) {
            validationIssues.push({
              severity: "blocker",
              entity,
              reason:
                "Target row count is smaller than the deterministic migration plan.",
              expectedMigratedRows,
              actualTargetRows: targetRows,
            });
          } else if (targetRows > expectedMigratedRows) {
            validationIssues.push({
              severity: "warning",
              entity,
              reason:
                "Target table contains more rows than this migration slice expects.",
              expectedMigratedRows,
              actualTargetRows: targetRows,
            });
          }

          if (missingMappedTargets > 0) {
            validationIssues.push({
              severity: "blocker",
              entity,
              reason: "Some staging map rows point at missing target records.",
              missingMappedTargets,
            });
          }

          if (duplicateCodes.length > 0) {
            validationIssues.push({
              severity: "blocker",
              entity,
              reason: "Duplicate target codes detected after migration.",
              duplicateCodes,
            });
          }

          targetSummary[entity] = {
            expectedMigratedRows,
            targetRows,
            mapRows,
            missingMappedTargets,
            duplicateCodes,
          };
        }

        const archivedPayloadCount = stagingReady
          ? await getArchivedPayloadCount(targetConnection, plan.migrationBatch)
          : 0;
        const archivedPayloadRows = stagingReady
          ? await getArchivedPayloadRows(targetConnection, plan.migrationBatch)
          : [];

        if (
          stagingReady &&
          archivedPayloadCount !== expectedArchivedPayloads.length
        ) {
          validationIssues.push({
            severity: "blocker",
            reason:
              "archived_field_payload row count does not match the deterministic migration plan.",
            expectedArchivedPayloads: expectedArchivedPayloads.length,
            actualArchivedPayloads: archivedPayloadCount,
          });
        }

        const archivedPayloadRowByIdentity = new Map(
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
          const storedRow = archivedPayloadRowByIdentity.get(
            buildArchivedPayloadIdentity(expectation),
          );

          if (!storedRow) {
            validationIssues.push({
              severity: "blocker",
              entity: expectation.entity,
              legacyTable: expectation.legacyTable,
              legacyId: expectation.legacyId,
              reason: "Expected archived_field_payload row is missing.",
              payloadKind: expectation.payloadKind,
            });
            continue;
          }

          if (storedRow.targetCode !== expectation.targetCode) {
            validationIssues.push({
              severity: "blocker",
              entity: expectation.entity,
              legacyTable: expectation.legacyTable,
              legacyId: expectation.legacyId,
              reason:
                "archived_field_payload target_code does not match the deterministic plan.",
              expectedTargetCode: expectation.targetCode,
              actualTargetCode: storedRow.targetCode,
            });
          }

          if (storedRow.archiveReason !== expectation.archiveReason) {
            validationIssues.push({
              severity: "blocker",
              entity: expectation.entity,
              legacyTable: expectation.legacyTable,
              legacyId: expectation.legacyId,
              reason:
                "archived_field_payload archive_reason does not match the deterministic plan.",
              expectedArchiveReason: expectation.archiveReason,
              actualArchiveReason: storedRow.archiveReason,
            });
          }

          if (storedRow.payloadJson !== expectation.payloadJson) {
            validationIssues.push({
              severity: "blocker",
              entity: expectation.entity,
              legacyTable: expectation.legacyTable,
              legacyId: expectation.legacyId,
              reason:
                "archived_field_payload payload_json does not match the deterministic plan.",
            });
          }

          if (expectation.expectsTargetId && storedRow.targetId === null) {
            validationIssues.push({
              severity: "blocker",
              entity: expectation.entity,
              legacyTable: expectation.legacyTable,
              legacyId: expectation.legacyId,
              reason:
                "archived_field_payload should reference a target row for migrated records, but target_id is NULL.",
            });
          }

          if (!expectation.expectsTargetId && storedRow.targetId !== null) {
            validationIssues.push({
              severity: "blocker",
              entity: expectation.entity,
              legacyTable: expectation.legacyTable,
              legacyId: expectation.legacyId,
              reason:
                "archived_field_payload should not reference a target row for blocked records, but target_id is present.",
              actualTargetId: storedRow.targetId,
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
              "archived_field_payload contains rows that are not part of the deterministic migration plan.",
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

        const materialCategoryRowsByCode = await getTargetRowsByCode<{
          id: number;
          categoryCode: string;
          categoryName: string;
          sortOrder: number;
          status: string;
        }>(
          targetConnection,
          "SELECT id, categoryCode, categoryName, sortOrder, status FROM material_category",
          "categoryCode",
        );
        const workshopRowsByCode = await getTargetRowsByCode<{
          id: number;
          workshopName: string;
          status: string;
        }>(
          targetConnection,
          "SELECT id, workshopName, status FROM workshop",
          "workshopName",
        );
        const supplierRowsByCode = await getTargetRowsByCode<{
          id: number;
          supplierCode: string;
          supplierName: string;
          supplierShortName: string | null;
          contactPerson: string | null;
          contactPhone: string | null;
          address: string | null;
          status: string;
        }>(
          targetConnection,
          "SELECT id, supplierCode, supplierName, supplierShortName, contactPerson, contactPhone, address, status FROM supplier",
          "supplierCode",
        );
        const personnelRowsByName = await getTargetRowsByCode<{
          id: number;
          personnelName: string;
          contactPhone: string | null;
          status: string;
        }>(
          targetConnection,
          "SELECT id, personnelName, contact_phone AS contactPhone, status FROM personnel",
          "personnelName",
        );
        const customerRowsByCode = await getTargetRowsByCode<{
          id: number;
          customerCode: string;
          customerName: string;
          parentId: number | null;
          status: string;
        }>(
          targetConnection,
          "SELECT id, customerCode, customerName, parentId, status FROM customer",
          "customerCode",
        );
        const materialRowsByCode = await getTargetRowsByCode<{
          id: number;
          materialCode: string;
          materialName: string;
          specModel: string | null;
          categoryId: number | null;
          unitCode: string;
          warningMinQty: string | number | null;
          warningMaxQty: string | number | null;
          status: string;
        }>(
          targetConnection,
          "SELECT id, materialCode, materialName, specModel, categoryId, unitCode, warningMinQty, warningMaxQty, status FROM material",
          "materialCode",
        );

        for (const record of plan.records.materialCategory) {
          if (record.blockers.length > 0) {
            continue;
          }

          const targetRow = materialCategoryRowsByCode.get(
            record.target.categoryCode,
          );

          if (!targetRow) {
            validationIssues.push({
              severity: "blocker",
              entity: "materialCategory",
              legacyTable: record.legacyTable,
              legacyId: record.legacyId,
              targetCode: record.target.categoryCode,
              reason:
                "Expected material_category row is missing for a migrated record.",
            });
            continue;
          }

          const context = {
            entity: "materialCategory" as const,
            legacyTable: record.legacyTable,
            legacyId: record.legacyId,
            targetCode: record.target.categoryCode,
          };

          pushValueMismatch(
            validationIssues,
            context,
            "material_category.categoryName",
            record.target.categoryName,
            targetRow.categoryName,
          );
          pushValueMismatch(
            validationIssues,
            context,
            "material_category.sortOrder",
            record.target.sortOrder,
            targetRow.sortOrder,
          );
          pushValueMismatch(
            validationIssues,
            context,
            "material_category.status",
            record.target.status,
            targetRow.status,
          );
        }

        for (const record of plan.records.workshop) {
          if (record.blockers.length > 0) {
            continue;
          }

          const targetRow = workshopRowsByCode.get(record.target.workshopName);

          if (!targetRow) {
            validationIssues.push({
              severity: "blocker",
              entity: "workshop",
              legacyTable: record.legacyTable,
              legacyId: record.legacyId,
              targetCode: record.target.workshopName,
              reason: "Expected workshop row is missing for a migrated record.",
            });
            continue;
          }

          const context = {
            entity: "workshop" as const,
            legacyTable: record.legacyTable,
            legacyId: record.legacyId,
            targetCode: record.target.workshopName,
          };

          pushValueMismatch(
            validationIssues,
            context,
            "workshop.workshopName",
            record.target.workshopName,
            targetRow.workshopName,
          );
          pushValueMismatch(
            validationIssues,
            context,
            "workshop.status",
            record.target.status,
            targetRow.status,
          );
        }

        for (const record of plan.records.supplier) {
          if (record.blockers.length > 0) {
            continue;
          }

          const targetRow = supplierRowsByCode.get(record.target.supplierCode);

          if (!targetRow) {
            validationIssues.push({
              severity: "blocker",
              entity: "supplier",
              legacyTable: record.legacyTable,
              legacyId: record.legacyId,
              targetCode: record.target.supplierCode,
              reason: "Expected supplier row is missing for a migrated record.",
            });
            continue;
          }

          const context = {
            entity: "supplier" as const,
            legacyTable: record.legacyTable,
            legacyId: record.legacyId,
            targetCode: record.target.supplierCode,
          };

          pushValueMismatch(
            validationIssues,
            context,
            "supplier.supplierName",
            record.target.supplierName,
            targetRow.supplierName,
          );
          pushValueMismatch(
            validationIssues,
            context,
            "supplier.supplierShortName",
            record.target.supplierShortName,
            targetRow.supplierShortName,
          );
          pushValueMismatch(
            validationIssues,
            context,
            "supplier.contactPerson",
            record.target.contactPerson,
            targetRow.contactPerson,
          );
          pushValueMismatch(
            validationIssues,
            context,
            "supplier.contactPhone",
            record.target.contactPhone,
            targetRow.contactPhone,
          );
          pushValueMismatch(
            validationIssues,
            context,
            "supplier.address",
            record.target.address,
            targetRow.address,
          );
          pushValueMismatch(
            validationIssues,
            context,
            "supplier.status",
            record.target.status,
            targetRow.status,
          );
        }

        for (const record of plan.records.personnel) {
          if (record.blockers.length > 0) {
            continue;
          }

          const targetRow = personnelRowsByName.get(
            record.target.personnelName,
          );

          if (!targetRow) {
            validationIssues.push({
              severity: "blocker",
              entity: "personnel",
              legacyTable: record.legacyTable,
              legacyId: record.legacyId,
              targetCode: record.target.personnelName,
              reason:
                "Expected personnel row is missing for a migrated record.",
            });
            continue;
          }

          const context = {
            entity: "personnel" as const,
            legacyTable: record.legacyTable,
            legacyId: record.legacyId,
            targetCode: record.target.personnelName,
          };

          pushValueMismatch(
            validationIssues,
            context,
            "personnel.personnelName",
            record.target.personnelName,
            targetRow.personnelName,
          );
          pushValueMismatch(
            validationIssues,
            context,
            "personnel.contactPhone",
            record.target.contactPhone,
            targetRow.contactPhone,
          );
          pushValueMismatch(
            validationIssues,
            context,
            "personnel.status",
            record.target.status,
            targetRow.status,
          );
        }

        const customerTargetCodeByLegacyId = new Map(
          plan.records.customer
            .filter((record) => record.blockers.length === 0)
            .map(
              (record) =>
                [record.legacyId, record.target.customerCode] as const,
            ),
        );

        for (const record of plan.records.customer) {
          if (record.blockers.length > 0) {
            continue;
          }

          const targetRow = customerRowsByCode.get(record.target.customerCode);

          if (!targetRow) {
            validationIssues.push({
              severity: "blocker",
              entity: "customer",
              legacyTable: record.legacyTable,
              legacyId: record.legacyId,
              targetCode: record.target.customerCode,
              reason: "Expected customer row is missing for a migrated record.",
            });
            continue;
          }

          const expectedParentCode =
            record.sourceParentLegacyId !== null
              ? (customerTargetCodeByLegacyId.get(
                  record.sourceParentLegacyId,
                ) ?? null)
              : null;
          const expectedParentId =
            expectedParentCode !== null
              ? (customerRowsByCode.get(expectedParentCode)?.id ?? null)
              : null;
          const context = {
            entity: "customer" as const,
            legacyTable: record.legacyTable,
            legacyId: record.legacyId,
            targetCode: record.target.customerCode,
          };

          pushValueMismatch(
            validationIssues,
            context,
            "customer.customerName",
            record.target.customerName,
            targetRow.customerName,
          );
          pushValueMismatch(
            validationIssues,
            context,
            "customer.status",
            record.target.status,
            targetRow.status,
          );
          pushValueMismatch(
            validationIssues,
            context,
            "customer.parentId",
            expectedParentId,
            targetRow.parentId,
          );
        }

        for (const record of plan.records.material) {
          if (record.blockers.length > 0) {
            continue;
          }

          const targetRow = materialRowsByCode.get(record.target.materialCode);

          if (!targetRow) {
            validationIssues.push({
              severity: "blocker",
              entity: "material",
              legacyTable: record.legacyTable,
              legacyId: record.legacyId,
              targetCode: record.target.materialCode,
              reason: "Expected material row is missing for a migrated record.",
            });
            continue;
          }

          const expectedCategoryId =
            record.sourceCategoryCode !== null
              ? (materialCategoryRowsByCode.get(record.sourceCategoryCode)
                  ?.id ?? null)
              : null;
          const context = {
            entity: "material" as const,
            legacyTable: record.legacyTable,
            legacyId: record.legacyId,
            targetCode: record.target.materialCode,
          };

          pushValueMismatch(
            validationIssues,
            context,
            "material.materialName",
            record.target.materialName,
            targetRow.materialName,
          );
          pushValueMismatch(
            validationIssues,
            context,
            "material.specModel",
            record.target.specModel,
            targetRow.specModel,
          );
          pushValueMismatch(
            validationIssues,
            context,
            "material.unitCode",
            record.target.unitCode,
            targetRow.unitCode,
          );
          pushValueMismatch(
            validationIssues,
            context,
            "material.warningMinQty",
            record.target.warningMinQty,
            targetRow.warningMinQty,
          );
          pushValueMismatch(
            validationIssues,
            context,
            "material.warningMaxQty",
            record.target.warningMaxQty,
            targetRow.warningMaxQty,
          );
          pushValueMismatch(
            validationIssues,
            context,
            "material.status",
            record.target.status,
            targetRow.status,
          );
          pushValueMismatch(
            validationIssues,
            context,
            "material.categoryId",
            expectedCategoryId,
            targetRow.categoryId,
          );
        }

        return {
          mode: "validate",
          targetDatabaseName,
          migrationBatch: plan.migrationBatch,
          counts: plan.counts,
          context: plan.context,
          targetSummary,
          expectedArchivedPayloadCount: expectedArchivedPayloads.length,
          archivedPayloadCount,
          sourceRowCounts: {
            materialCategories: snapshot.materialCategories.length,
            workshops: snapshot.workshops.length,
            suppliers: snapshot.suppliers.length,
            personnel: snapshot.personnel.length,
            customers: snapshot.customers.length,
            materials: snapshot.materials.length,
          },
          validationIssues,
        };
      },
    );

    writeStableReport(reportPath, report);
    console.log(`Master-data validation completed. report=${reportPath}`);

    if (report.validationIssues.some((issue) => issue.severity === "blocker")) {
      process.exitCode = 1;
    }
  } finally {
    await closePools(legacyPool, targetPool);
  }
}

void main();
