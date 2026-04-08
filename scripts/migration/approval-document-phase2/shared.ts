import type { PoolConnection } from "mariadb";

export const CANONICAL_APPROVAL_DOCUMENT_TABLE = "approval_document";
export const LEGACY_APPROVAL_DOCUMENT_OBJECT = "audit_document";

export type SqlObjectType = "BASE TABLE" | "VIEW";

export interface ApprovalDocumentObjectState {
  name: string;
  type: SqlObjectType | null;
  rowCount: number | null;
  columns: string[];
}

export interface ApprovalDocumentCutoverState {
  schemaName: string;
  canonical: ApprovalDocumentObjectState;
  legacy: ApprovalDocumentObjectState;
}

type DatabaseNameRow = { schemaName: string | null };
type TableMetadataRow = { tableName: string; tableType: SqlObjectType };
type ColumnMetadataRow = { columnName: string };
type CountRow = { total: number };

export async function readApprovalDocumentCutoverState(
  connection: Pick<PoolConnection, "query">,
): Promise<ApprovalDocumentCutoverState> {
  const [databaseRow] = await connection.query<DatabaseNameRow[]>(
    `SELECT DATABASE() AS schemaName`,
  );
  const schemaName = databaseRow?.schemaName?.trim();

  if (!schemaName) {
    throw new Error(
      "Cannot resolve active database name for approval cutover.",
    );
  }

  const objects = await connection.query<TableMetadataRow[]>(
    `
      SELECT table_name AS tableName, table_type AS tableType
      FROM information_schema.tables
      WHERE table_schema = ?
        AND table_name IN (?, ?)
      ORDER BY table_name ASC
    `,
    [
      schemaName,
      CANONICAL_APPROVAL_DOCUMENT_TABLE,
      LEGACY_APPROVAL_DOCUMENT_OBJECT,
    ],
  );
  const metadataByName = new Map(
    objects.map((entry) => [entry.tableName, entry.tableType]),
  );

  const canonicalType =
    metadataByName.get(CANONICAL_APPROVAL_DOCUMENT_TABLE) ?? null;
  const legacyType =
    metadataByName.get(LEGACY_APPROVAL_DOCUMENT_OBJECT) ?? null;

  return {
    schemaName,
    canonical: {
      name: CANONICAL_APPROVAL_DOCUMENT_TABLE,
      type: canonicalType,
      rowCount:
        canonicalType === null
          ? null
          : await readRowCount(connection, CANONICAL_APPROVAL_DOCUMENT_TABLE),
      columns:
        canonicalType === null
          ? []
          : await readColumnNames(
              connection,
              schemaName,
              CANONICAL_APPROVAL_DOCUMENT_TABLE,
            ),
    },
    legacy: {
      name: LEGACY_APPROVAL_DOCUMENT_OBJECT,
      type: legacyType,
      rowCount:
        legacyType === null
          ? null
          : await readRowCount(connection, LEGACY_APPROVAL_DOCUMENT_OBJECT),
      columns:
        legacyType === null
          ? []
          : await readColumnNames(
              connection,
              schemaName,
              LEGACY_APPROVAL_DOCUMENT_OBJECT,
            ),
    },
  };
}

async function readColumnNames(
  connection: Pick<PoolConnection, "query">,
  schemaName: string,
  tableName: string,
) {
  const rows = await connection.query<ColumnMetadataRow[]>(
    `
      SELECT column_name AS columnName
      FROM information_schema.columns
      WHERE table_schema = ?
        AND table_name = ?
      ORDER BY ordinal_position ASC
    `,
    [schemaName, tableName],
  );

  return rows.map((entry) => entry.columnName);
}

async function readRowCount(
  connection: Pick<PoolConnection, "query">,
  objectName:
    | typeof CANONICAL_APPROVAL_DOCUMENT_TABLE
    | typeof LEGACY_APPROVAL_DOCUMENT_OBJECT,
) {
  const [row] = await connection.query<CountRow[]>(
    `SELECT COUNT(*) AS total FROM \`${objectName}\``,
  );

  return Number(row?.total ?? 0);
}
