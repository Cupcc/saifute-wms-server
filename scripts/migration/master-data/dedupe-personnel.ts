import { join } from "node:path";
import { loadMigrationEnvironment, parseDatabaseName } from "../config";
import {
  closePools,
  createMariaDbPool,
  type MigrationConnectionLike,
  withPoolConnection,
} from "../db";
import { writeStableReport } from "../shared/report-writer";

interface PersonnelReferenceColumn {
  columnName: string;
  schemaName?: string;
  tableName: string;
}

interface DuplicatePersonnelCandidate {
  contactPhone: string | null;
  documentRefCount: number;
  id: number;
  mapRefCount: number;
  personnelName: string;
  status: string;
  workshopId: number | null;
}

interface DuplicatePersonnelGroup {
  candidates: DuplicatePersonnelCandidate[];
  contactPhone: string | null;
  duplicateIds: number[];
  keepId: number;
  personnelName: string;
  workshopId: number | null;
}

interface ExecuteSummary {
  archivedPayloadRowsUpdated: number;
  duplicateRowsDeleted: number;
  duplicateRowsDisabled: number;
  mapRowsUpdated: number;
  referenceRowsUpdated: Record<string, number>;
}

function parseOptions(argv = process.argv.slice(2)): {
  deleteDuplicates: boolean;
  execute: boolean;
  reportPath: string;
} {
  let deleteDuplicates = false;
  let execute = false;
  let reportPath: string | null = null;

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--execute") {
      execute = true;
      continue;
    }
    if (argument === "--delete") {
      deleteDuplicates = true;
      continue;
    }
    if (argument === "--report") {
      reportPath = argv[index + 1] ?? null;
      index += 1;
    }
  }

  return {
    deleteDuplicates,
    execute,
    reportPath:
      reportPath ??
      join(
        process.cwd(),
        "scripts",
        "migration",
        "reports",
        execute
          ? deleteDuplicates
            ? "personnel-dedupe-delete-report.json"
            : "personnel-dedupe-execute-report.json"
          : "personnel-dedupe-dry-run-report.json",
      ),
  };
}

function qualifiedTableName(reference: PersonnelReferenceColumn): string {
  return reference.schemaName
    ? `${reference.schemaName}.${reference.tableName}`
    : reference.tableName;
}

function placeholders(values: readonly unknown[]): string {
  return values.map(() => "?").join(", ");
}

function affectedRows(result: unknown): number {
  if (typeof result !== "object" || result === null) {
    return 0;
  }

  const value = (result as { affectedRows?: unknown }).affectedRows;
  return typeof value === "number" ? value : 0;
}

async function tableExists(
  connection: MigrationConnectionLike,
  schemaName: string,
  tableName: string,
): Promise<boolean> {
  const rows = await connection.query<Array<{ total: number }>>(
    `
      SELECT COUNT(*) AS total
      FROM information_schema.tables
      WHERE table_schema = ?
        AND table_name = ?
    `,
    [schemaName, tableName],
  );

  return Number(rows[0]?.total ?? 0) > 0;
}

async function findPersonnelReferenceColumns(
  connection: MigrationConnectionLike,
): Promise<PersonnelReferenceColumn[]> {
  return connection.query<PersonnelReferenceColumn[]>(
    `
      SELECT
        TABLE_NAME AS tableName,
        COLUMN_NAME AS columnName
      FROM information_schema.KEY_COLUMN_USAGE
      WHERE REFERENCED_TABLE_SCHEMA = DATABASE()
        AND REFERENCED_TABLE_NAME = 'personnel'
        AND REFERENCED_COLUMN_NAME = 'id'
      ORDER BY TABLE_NAME, COLUMN_NAME
    `,
  );
}

function groupKey(row: {
  contactPhone: string | null;
  personnelName: string;
  workshopId: number | null;
}): string {
  return [
    row.personnelName.trim(),
    row.contactPhone?.trim() ?? "",
    String(row.workshopId ?? 0),
  ].join("\u0000");
}

function buildReferenceUnion(
  references: readonly PersonnelReferenceColumn[],
): string {
  if (references.length === 0) {
    return "SELECT NULL AS personnel_id, 0 AS cnt WHERE 1 = 0";
  }

  return references
    .map(
      (reference) => `
        SELECT ${reference.columnName} AS personnel_id, COUNT(*) AS cnt
        FROM ${qualifiedTableName(reference)}
        WHERE ${reference.columnName} IS NOT NULL
        GROUP BY ${reference.columnName}
      `,
    )
    .join("\nUNION ALL\n");
}

async function findDuplicateGroups(
  connection: MigrationConnectionLike,
  includeMapTable: boolean,
  referenceColumns: readonly PersonnelReferenceColumn[],
  options: { includeDisabled: boolean },
): Promise<DuplicatePersonnelGroup[]> {
  const references = includeMapTable
    ? [
        ...referenceColumns,
        {
          schemaName: "migration_staging",
          tableName: "map_personnel",
          columnName: "target_id",
        },
      ]
    : referenceColumns;
  const referenceUnion = buildReferenceUnion(references);
  const duplicateStatusFilter = options.includeDisabled
    ? ""
    : "WHERE status = 'ACTIVE'";
  const candidateStatusFilter = options.includeDisabled
    ? ""
    : "WHERE p.status = 'ACTIVE'";
  const mapRefsCte = includeMapTable
    ? `
      map_refs AS (
        SELECT target_id AS personnel_id, COUNT(*) AS map_ref_count
        FROM migration_staging.map_personnel
        WHERE target_id IS NOT NULL
        GROUP BY target_id
      )
    `
    : `
      map_refs AS (
        SELECT NULL AS personnel_id, 0 AS map_ref_count
        WHERE 1 = 0
      )
    `;
  const rows = await connection.query<DuplicatePersonnelCandidate[]>(
    `
      WITH duplicate_identities AS (
        SELECT
          TRIM(personnel_name) AS name_key,
          COALESCE(NULLIF(TRIM(contact_phone), ''), '') AS phone_key,
          COALESCE(workshop_id, 0) AS workshop_key
        FROM personnel
        ${duplicateStatusFilter}
        GROUP BY
          TRIM(personnel_name),
          COALESCE(NULLIF(TRIM(contact_phone), ''), ''),
          COALESCE(workshop_id, 0)
        HAVING COUNT(*) > 1
      ),
      candidates AS (
        SELECT
          p.id,
          p.personnel_name AS personnelName,
          p.contact_phone AS contactPhone,
          p.status,
          p.workshop_id AS workshopId,
          TRIM(p.personnel_name) AS name_key,
          COALESCE(NULLIF(TRIM(p.contact_phone), ''), '') AS phone_key,
          COALESCE(p.workshop_id, 0) AS workshop_key
        FROM personnel p
        INNER JOIN duplicate_identities d
          ON TRIM(p.personnel_name) = d.name_key
         AND COALESCE(NULLIF(TRIM(p.contact_phone), ''), '') = d.phone_key
         AND COALESCE(p.workshop_id, 0) = d.workshop_key
        ${candidateStatusFilter}
      ),
      refs AS (
        ${referenceUnion}
      ),
      ref_totals AS (
        SELECT personnel_id, SUM(cnt) AS ref_count
        FROM refs
        GROUP BY personnel_id
      ),
      ${mapRefsCte}
      SELECT
        c.id,
        c.personnelName,
        c.contactPhone,
        c.status,
        c.workshopId,
        COALESCE(r.ref_count, 0) - COALESCE(m.map_ref_count, 0) AS documentRefCount,
        COALESCE(m.map_ref_count, 0) AS mapRefCount
      FROM candidates c
      LEFT JOIN ref_totals r ON r.personnel_id = c.id
      LEFT JOIN map_refs m ON m.personnel_id = c.id
      ORDER BY c.name_key ASC, c.phone_key ASC, c.workshop_key ASC, c.id ASC
    `,
  );

  const rowsByGroup = new Map<string, DuplicatePersonnelCandidate[]>();
  for (const row of rows) {
    const candidates = rowsByGroup.get(groupKey(row)) ?? [];
    candidates.push({
      ...row,
      documentRefCount: Number(row.documentRefCount),
      id: Number(row.id),
      mapRefCount: Number(row.mapRefCount),
      workshopId: row.workshopId === null ? null : Number(row.workshopId),
    });
    rowsByGroup.set(groupKey(row), candidates);
  }

  return [...rowsByGroup.values()].map((candidates) => {
    const sortedCandidates = [...candidates].sort(
      (left, right) =>
        Number(right.status === "ACTIVE") - Number(left.status === "ACTIVE") ||
        right.documentRefCount +
          right.mapRefCount -
          (left.documentRefCount + left.mapRefCount) ||
        left.id - right.id,
    );
    const keep = sortedCandidates[0];
    if (!keep) {
      throw new Error("Duplicate group has no candidates.");
    }

    return {
      personnelName: keep.personnelName,
      contactPhone: keep.contactPhone,
      workshopId: keep.workshopId,
      keepId: keep.id,
      duplicateIds: sortedCandidates
        .filter((candidate) => candidate.id !== keep.id)
        .map((candidate) => candidate.id),
      candidates: sortedCandidates,
    };
  });
}

async function updateReferenceColumn(
  connection: MigrationConnectionLike,
  reference: PersonnelReferenceColumn,
  keepId: number,
  duplicateIds: readonly number[],
): Promise<number> {
  if (duplicateIds.length === 0) {
    return 0;
  }

  const result = await connection.query(
    `
      UPDATE ${qualifiedTableName(reference)}
      SET ${reference.columnName} = ?
      WHERE ${reference.columnName} IN (${placeholders(duplicateIds)})
    `,
    [keepId, ...duplicateIds],
  );

  return affectedRows(result);
}

async function updatePersonnelArchivedPayloadRows(
  connection: MigrationConnectionLike,
  keepId: number,
  duplicateIds: readonly number[],
): Promise<number> {
  if (duplicateIds.length === 0) {
    return 0;
  }

  const result = await connection.query(
    `
      UPDATE migration_staging.archived_field_payload
      SET target_id = ?
      WHERE target_table = 'personnel'
        AND target_id IN (${placeholders(duplicateIds)})
    `,
    [keepId, ...duplicateIds],
  );

  return affectedRows(result);
}

async function executeDedupe(
  connection: MigrationConnectionLike,
  groups: readonly DuplicatePersonnelGroup[],
  options: {
    deleteDuplicates: boolean;
    hasArchivedPayloadTable: boolean;
    hasMapPersonnelTable: boolean;
    referenceColumns: readonly PersonnelReferenceColumn[];
  },
): Promise<ExecuteSummary> {
  const referenceRowsUpdated: Record<string, number> = {};
  let duplicateRowsDeleted = 0;
  let duplicateRowsDisabled = 0;
  let mapRowsUpdated = 0;
  let archivedPayloadRowsUpdated = 0;

  await connection.beginTransaction();

  try {
    for (const group of groups) {
      for (const reference of options.referenceColumns) {
        const key = `${reference.tableName}.${reference.columnName}`;
        referenceRowsUpdated[key] =
          (referenceRowsUpdated[key] ?? 0) +
          (await updateReferenceColumn(
            connection,
            reference,
            group.keepId,
            group.duplicateIds,
          ));
      }

      if (options.hasMapPersonnelTable) {
        mapRowsUpdated += await updateReferenceColumn(
          connection,
          {
            schemaName: "migration_staging",
            tableName: "map_personnel",
            columnName: "target_id",
          },
          group.keepId,
          group.duplicateIds,
        );
      }

      if (options.hasArchivedPayloadTable) {
        archivedPayloadRowsUpdated += await updatePersonnelArchivedPayloadRows(
          connection,
          group.keepId,
          group.duplicateIds,
        );
      }

      if (group.duplicateIds.length === 0) {
        continue;
      }

      if (options.deleteDuplicates) {
        const result = await connection.query(
          `
            DELETE FROM personnel
            WHERE id IN (${placeholders(group.duplicateIds)})
          `,
          group.duplicateIds,
        );
        duplicateRowsDeleted += affectedRows(result);
        continue;
      }

      if (group.duplicateIds.length > 0) {
        const result = await connection.query(
          `
            UPDATE personnel
            SET status = 'DISABLED',
                updated_by = 'dedupe-personnel',
                updated_at = CURRENT_TIMESTAMP
            WHERE id IN (${placeholders(group.duplicateIds)})
              AND status = 'ACTIVE'
          `,
          group.duplicateIds,
        );
        duplicateRowsDisabled += affectedRows(result);
      }
    }

    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  }

  return {
    archivedPayloadRowsUpdated,
    duplicateRowsDeleted,
    duplicateRowsDisabled,
    mapRowsUpdated,
    referenceRowsUpdated,
  };
}

async function main(): Promise<void> {
  const options = parseOptions();
  const env = loadMigrationEnvironment({ requireLegacyDatabaseUrl: false });
  const targetDatabaseName = parseDatabaseName(env.databaseUrl);
  const targetPool = createMariaDbPool(env.databaseUrl);

  try {
    const report = await withPoolConnection(targetPool, async (connection) => {
      const hasMapPersonnelTable = await tableExists(
        connection,
        "migration_staging",
        "map_personnel",
      );
      const hasArchivedPayloadTable = await tableExists(
        connection,
        "migration_staging",
        "archived_field_payload",
      );
      const referenceColumns = await findPersonnelReferenceColumns(connection);
      const groups = await findDuplicateGroups(
        connection,
        hasMapPersonnelTable,
        referenceColumns,
        { includeDisabled: options.deleteDuplicates },
      );
      const duplicateRowsToProcess = groups.reduce(
        (total, group) => total + group.duplicateIds.length,
        0,
      );
      const executeSummary = options.execute
        ? await executeDedupe(connection, groups, {
            deleteDuplicates: options.deleteDuplicates,
            hasArchivedPayloadTable,
            hasMapPersonnelTable,
            referenceColumns,
          })
        : null;

      return {
        mode: options.execute
          ? options.deleteDuplicates
            ? "delete"
            : "execute"
          : "dry-run",
        targetDatabaseName,
        duplicateGroupCount: groups.length,
        duplicateRowsToDelete: options.deleteDuplicates
          ? duplicateRowsToProcess
          : undefined,
        duplicateRowsToDisable: options.deleteDuplicates
          ? undefined
          : duplicateRowsToProcess,
        rowsInDuplicateGroups: groups.length + duplicateRowsToProcess,
        referenceColumns,
        groups,
        executeSummary,
      };
    });

    writeStableReport(options.reportPath, report);
    console.log(
      `Personnel dedupe ${options.execute && options.deleteDuplicates ? "delete" : options.execute ? "execute" : "dry-run"} completed. report=${options.reportPath}`,
    );
  } finally {
    await closePools(targetPool);
  }
}

void main();
