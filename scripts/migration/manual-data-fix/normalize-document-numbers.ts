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
  "normalize-document-numbers-dry-run-report.json";
const EXECUTE_REPORT_FILE_NAME =
  "normalize-document-numbers-execute-report.json";
const SHORT_DOCUMENT_NO_PATTERN = "^[A-Z]{2}[0-9]{11}$";

interface CountRow {
  count: number | string;
}

interface UpdateResult {
  affectedRows?: number;
}

interface DocumentTableConfig {
  tableName: string;
  documentType: string;
  fixedPrefix?: string;
  discriminatorColumn?: string;
  prefixByDiscriminator?: Record<string, string>;
  inventoryLogBacked?: boolean;
}

interface SourceDocumentRow {
  tableName: string;
  documentType: string;
  id: number;
  discriminator: string | null;
  oldDocumentNo: string;
  bizDate: string;
  createdAt: string;
  prefix: string;
}

interface PlannedDocumentChange extends SourceDocumentRow {
  newDocumentNo: string;
  sequence: number;
  changed: boolean;
}

const DOCUMENT_TABLES: readonly DocumentTableConfig[] = [
  {
    tableName: "stock_in_order",
    documentType: "StockInOrder",
    discriminatorColumn: "order_type",
    prefixByDiscriminator: {
      ACCEPTANCE: "YS",
      PRODUCTION_RECEIPT: "RK",
      SUPPLIER_RETURN: "TG",
    },
    inventoryLogBacked: true,
  },
  {
    tableName: "stock_in_price_correction_order",
    documentType: "StockInPriceCorrectionOrder",
    fixedPrefix: "PC",
    inventoryLogBacked: true,
  },
  {
    tableName: "sales_stock_order",
    documentType: "SalesStockOrder",
    discriminatorColumn: "order_type",
    prefixByDiscriminator: {
      OUTBOUND: "CK",
      SALES_RETURN: "XT",
    },
    inventoryLogBacked: true,
  },
  {
    tableName: "workshop_material_order",
    documentType: "WorkshopMaterialOrder",
    discriminatorColumn: "order_type",
    prefixByDiscriminator: {
      PICK: "LL",
      RETURN: "TL",
      SCRAP: "BF",
    },
    inventoryLogBacked: true,
  },
  {
    tableName: "rd_project_material_action",
    documentType: "RdProjectMaterialAction",
    discriminatorColumn: "action_type",
    prefixByDiscriminator: {
      PICK: "RL",
      RETURN: "RR",
      SCRAP: "RS",
    },
    inventoryLogBacked: true,
  },
  {
    tableName: "rd_handoff_order",
    documentType: "RdHandoffOrder",
    fixedPrefix: "RH",
    inventoryLogBacked: true,
  },
  {
    tableName: "rd_procurement_request",
    documentType: "RdProcurementRequest",
    fixedPrefix: "RQ",
  },
  {
    tableName: "rd_stocktake_order",
    documentType: "RdStocktakeOrder",
    fixedPrefix: "RP",
    inventoryLogBacked: true,
  },
];

function quoteIdentifier(identifier: string): string {
  return `\`${identifier}\``;
}

function toCount(row: CountRow | undefined): number {
  return Number(row?.count ?? 0);
}

function affectedRows(result: unknown): number {
  return Number((result as UpdateResult | undefined)?.affectedRows ?? 0);
}

function compactDate(value: string): string {
  const match = String(value).match(
    /^(?<year>\d{4})-(?<month>\d{2})-(?<day>\d{2})/u,
  );
  if (!match?.groups) return "";
  return `${match.groups.year}${match.groups.month}${match.groups.day}`;
}

function buildShortDocumentNo(
  prefix: string,
  bizDate: string,
  sequence: number,
): string {
  return `${prefix}${compactDate(bizDate)}${String(sequence).padStart(3, "0")}`;
}

function requirePrefix(
  config: DocumentTableConfig,
  discriminator: string | null,
) {
  const prefix =
    config.fixedPrefix ??
    config.prefixByDiscriminator?.[String(discriminator ?? "")];
  if (!prefix) {
    throw new Error(
      `Missing document prefix for ${config.tableName}.${discriminator ?? "null"}`,
    );
  }
  if (!/^[A-Z]{2}$/u.test(prefix)) {
    throw new Error(
      `Document prefix must be exactly two uppercase letters: ${prefix}`,
    );
  }
  return prefix;
}

async function readDocumentRows(
  connection: MigrationConnectionLike,
  config: DocumentTableConfig,
): Promise<SourceDocumentRow[]> {
  const discriminatorSelect = config.discriminatorColumn
    ? `${quoteIdentifier(config.discriminatorColumn)} AS discriminator`
    : "NULL AS discriminator";
  const rows = await connection.query<
    Array<{
      id: number;
      discriminator: string | null;
      oldDocumentNo: string;
      bizDate: string;
      createdAt: string;
    }>
  >(
    `
      SELECT
        id,
        ${discriminatorSelect},
        document_no AS oldDocumentNo,
        DATE_FORMAT(biz_date, '%Y-%m-%d') AS bizDate,
        DATE_FORMAT(created_at, '%Y-%m-%d %H:%i:%s') AS createdAt
      FROM ${quoteIdentifier(config.tableName)}
      ORDER BY biz_date, created_at, id
    `,
  );

  return rows.map((row) => ({
    tableName: config.tableName,
    documentType: config.documentType,
    id: row.id,
    discriminator: row.discriminator,
    oldDocumentNo: row.oldDocumentNo,
    bizDate: row.bizDate,
    createdAt: row.createdAt,
    prefix: requirePrefix(config, row.discriminator),
  }));
}

function planDocumentChanges(rows: readonly SourceDocumentRow[]): {
  changes: PlannedDocumentChange[];
  blockers: string[];
} {
  const blockers: string[] = [];
  const sequenceByPrefixAndDate = new Map<string, number>();
  const newDocumentNosByTable = new Map<string, Set<string>>();

  const sortedRows = [...rows].sort((left, right) => {
    const prefixCompare = left.prefix.localeCompare(right.prefix);
    if (prefixCompare !== 0) return prefixCompare;
    const dateCompare = left.bizDate.localeCompare(right.bizDate);
    if (dateCompare !== 0) return dateCompare;
    const createdCompare = left.createdAt.localeCompare(right.createdAt);
    if (createdCompare !== 0) return createdCompare;
    return left.id - right.id;
  });

  const changes = sortedRows.map((row): PlannedDocumentChange => {
    const date = compactDate(row.bizDate);
    if (!/^\d{8}$/u.test(date)) {
      blockers.push(
        `${row.tableName}#${row.id} has invalid bizDate ${row.bizDate}`,
      );
    }
    const sequenceKey = `${row.prefix}:${date}`;
    const sequence = (sequenceByPrefixAndDate.get(sequenceKey) ?? 0) + 1;
    sequenceByPrefixAndDate.set(sequenceKey, sequence);
    if (sequence > 999) {
      blockers.push(`${sequenceKey} exceeds 999 daily document numbers`);
    }

    const newDocumentNo = buildShortDocumentNo(
      row.prefix,
      row.bizDate,
      sequence,
    );
    const tableDocumentNos =
      newDocumentNosByTable.get(row.tableName) ?? new Set<string>();
    if (tableDocumentNos.has(newDocumentNo)) {
      blockers.push(
        `${row.tableName} duplicated planned documentNo ${newDocumentNo}`,
      );
    }
    tableDocumentNos.add(newDocumentNo);
    newDocumentNosByTable.set(row.tableName, tableDocumentNos);

    return {
      ...row,
      newDocumentNo,
      sequence,
      changed: row.oldDocumentNo !== newDocumentNo,
    };
  });

  return { changes, blockers };
}

async function countSql(
  connection: MigrationConnectionLike,
  sql: string,
  params: readonly unknown[] = [],
): Promise<number> {
  const rows = await connection.query<CountRow[]>(sql, params);
  return toCount(rows[0]);
}

async function buildVerification(
  connection: MigrationConnectionLike,
): Promise<Record<string, number>> {
  const verification: Record<string, number> = {};

  for (const config of DOCUMENT_TABLES) {
    verification[`${config.tableName}.invalidLength`] = await countSql(
      connection,
      `
        SELECT COUNT(*) AS count
        FROM ${quoteIdentifier(config.tableName)}
        WHERE document_no NOT REGEXP ?
      `,
      [SHORT_DOCUMENT_NO_PATTERN],
    );

    verification[`${config.tableName}.approvalMismatch`] = await countSql(
      connection,
      `
        SELECT COUNT(*) AS count
        FROM approval_document approval
        JOIN ${quoteIdentifier(config.tableName)} doc
          ON approval.document_type = ?
         AND approval.document_id = doc.id
        WHERE approval.document_number <> doc.document_no
      `,
      [config.documentType],
    );

    if (config.inventoryLogBacked) {
      verification[`${config.tableName}.inventoryLogMismatch`] = await countSql(
        connection,
        `
          SELECT COUNT(*) AS count
          FROM inventory_log log
          JOIN ${quoteIdentifier(config.tableName)} doc
            ON log.business_document_type = ?
           AND log.business_document_id = doc.id
          WHERE log.business_document_number <> doc.document_no
        `,
        [config.documentType],
      );
    }

    verification[`${config.tableName}.rdStatusHistorySourceMismatch`] =
      await countSql(
        connection,
        `
          SELECT COUNT(*) AS count
          FROM rd_material_status_history history
          JOIN ${quoteIdentifier(config.tableName)} doc
            ON history.source_document_type = ?
           AND history.source_document_id = doc.id
          WHERE history.source_document_number IS NOT NULL
            AND history.source_document_number <> doc.document_no
        `,
        [config.documentType],
      );
  }

  verification.stockInOrderRdProcurementSnapshotMismatch = await countSql(
    connection,
    `
      SELECT COUNT(*) AS count
      FROM stock_in_order stock_in
      JOIN rd_procurement_request request
        ON request.id = stock_in.rd_procurement_request_id
      WHERE stock_in.rd_procurement_request_no_snapshot IS NOT NULL
        AND stock_in.rd_procurement_request_no_snapshot <> request.document_no
    `,
  );

  verification.priceCorrectionSourceDocumentSnapshotMismatch = await countSql(
    connection,
    `
      SELECT COUNT(*) AS count
      FROM stock_in_price_correction_order_line line
      JOIN stock_in_order stock_in
        ON stock_in.id = line.source_stock_in_order_id
      WHERE line.source_document_no_snapshot IS NOT NULL
        AND line.source_document_no_snapshot <> stock_in.document_no
    `,
  );

  return verification;
}

function summarizeByTable(changes: readonly PlannedDocumentChange[]) {
  return DOCUMENT_TABLES.map((config) => {
    const tableChanges = changes.filter(
      (change) => change.tableName === config.tableName,
    );
    return {
      tableName: config.tableName,
      documentType: config.documentType,
      total: tableChanges.length,
      changed: tableChanges.filter((change) => change.changed).length,
    };
  });
}

async function applyDocumentNumberChanges(
  connection: MigrationConnectionLike,
  changes: readonly PlannedDocumentChange[],
): Promise<Record<string, number>> {
  const applied: Record<string, number> = {};
  const changedRows = changes.filter((change) => change.changed);

  await connection.beginTransaction();
  try {
    for (const config of DOCUMENT_TABLES) {
      const tableRows = changedRows.filter(
        (change) => change.tableName === config.tableName,
      );
      for (const change of tableRows) {
        const result = await connection.query<UpdateResult>(
          `
            UPDATE ${quoteIdentifier(config.tableName)}
            SET document_no = ?
            WHERE id = ?
          `,
          [`__DN_${change.id}`, change.id],
        );
        applied[`${config.tableName}.temporary`] =
          (applied[`${config.tableName}.temporary`] ?? 0) +
          affectedRows(result);
      }
    }

    for (const config of DOCUMENT_TABLES) {
      const tableRows = changedRows.filter(
        (change) => change.tableName === config.tableName,
      );
      for (const change of tableRows) {
        const result = await connection.query<UpdateResult>(
          `
            UPDATE ${quoteIdentifier(config.tableName)}
            SET document_no = ?
            WHERE id = ?
          `,
          [change.newDocumentNo, change.id],
        );
        applied[`${config.tableName}.documentNo`] =
          (applied[`${config.tableName}.documentNo`] ?? 0) +
          affectedRows(result);
      }
    }

    for (const change of changes) {
      const approvalResult = await connection.query<UpdateResult>(
        `
          UPDATE approval_document
          SET document_number = ?
          WHERE document_type = ?
            AND document_id = ?
            AND document_number <> ?
        `,
        [
          change.newDocumentNo,
          change.documentType,
          change.id,
          change.newDocumentNo,
        ],
      );
      applied["approval_document.document_number"] =
        (applied["approval_document.document_number"] ?? 0) +
        affectedRows(approvalResult);

      const inventoryResult = await connection.query<UpdateResult>(
        `
          UPDATE inventory_log
          SET business_document_number = ?
          WHERE business_document_type = ?
            AND business_document_id = ?
            AND business_document_number <> ?
        `,
        [
          change.newDocumentNo,
          change.documentType,
          change.id,
          change.newDocumentNo,
        ],
      );
      applied["inventory_log.business_document_number"] =
        (applied["inventory_log.business_document_number"] ?? 0) +
        affectedRows(inventoryResult);

      const statusHistoryResult = await connection.query<UpdateResult>(
        `
          UPDATE rd_material_status_history
          SET source_document_number = ?
          WHERE source_document_type = ?
            AND source_document_id = ?
            AND source_document_number IS NOT NULL
            AND source_document_number <> ?
        `,
        [
          change.newDocumentNo,
          change.documentType,
          change.id,
          change.newDocumentNo,
        ],
      );
      applied["rd_material_status_history.source_document_number"] =
        (applied["rd_material_status_history.source_document_number"] ?? 0) +
        affectedRows(statusHistoryResult);
    }

    for (const requestChange of changes.filter(
      (change) => change.documentType === "RdProcurementRequest",
    )) {
      const result = await connection.query<UpdateResult>(
        `
          UPDATE stock_in_order
          SET rd_procurement_request_no_snapshot = ?
          WHERE rd_procurement_request_id = ?
            AND rd_procurement_request_no_snapshot IS NOT NULL
            AND rd_procurement_request_no_snapshot <> ?
        `,
        [
          requestChange.newDocumentNo,
          requestChange.id,
          requestChange.newDocumentNo,
        ],
      );
      applied["stock_in_order.rd_procurement_request_no_snapshot"] =
        (applied["stock_in_order.rd_procurement_request_no_snapshot"] ?? 0) +
        affectedRows(result);
    }

    for (const stockInChange of changes.filter(
      (change) => change.documentType === "StockInOrder",
    )) {
      const result = await connection.query<UpdateResult>(
        `
          UPDATE stock_in_price_correction_order_line
          SET source_document_no_snapshot = ?
          WHERE source_stock_in_order_id = ?
            AND source_document_no_snapshot IS NOT NULL
            AND source_document_no_snapshot <> ?
        `,
        [
          stockInChange.newDocumentNo,
          stockInChange.id,
          stockInChange.newDocumentNo,
        ],
      );
      applied[
        "stock_in_price_correction_order_line.source_document_no_snapshot"
      ] =
        (applied[
          "stock_in_price_correction_order_line.source_document_no_snapshot"
        ] ?? 0) + affectedRows(result);
    }

    await connection.commit();
    return applied;
  } catch (error) {
    await connection.rollback();
    throw error;
  }
}

async function main() {
  const cliOptions = parseMigrationCliOptions();
  const reportPath = resolveReportPath(
    cliOptions,
    cliOptions.execute ? EXECUTE_REPORT_FILE_NAME : DRY_RUN_REPORT_FILE_NAME,
  );
  const env = loadMigrationEnvironment({ requireLegacyDatabaseUrl: false });
  const targetDatabase = assertExpectedDatabaseName(
    env.databaseUrl,
    EXPECTED_TARGET_DATABASE_NAME,
    "target",
  );
  const pool = createMariaDbPool(env.databaseUrl);

  try {
    const report = await withPoolConnection(pool, async (connection) => {
      const sourceRows = (
        await Promise.all(
          DOCUMENT_TABLES.map((config) => readDocumentRows(connection, config)),
        )
      ).flat();
      const { changes, blockers } = planDocumentChanges(sourceRows);
      const preVerification = await buildVerification(connection);

      if (
        blockers.length > 0 &&
        cliOptions.execute &&
        !cliOptions.allowBlockers
      ) {
        throw new Error(
          `Document number normalization has blockers: ${blockers.join("; ")}`,
        );
      }

      const applied = cliOptions.execute
        ? await applyDocumentNumberChanges(connection, changes)
        : {};
      const postVerification = cliOptions.execute
        ? await buildVerification(connection)
        : null;

      return {
        mode: cliOptions.execute ? "execute" : "dry-run",
        targetDatabase,
        format: "2 uppercase prefix + YYYYMMDD + 3 digit daily sequence",
        expectedLength: 13,
        blockers,
        summary: summarizeByTable(changes),
        changedCount: changes.filter((change) => change.changed).length,
        unchangedCount: changes.filter((change) => !change.changed).length,
        samples: changes
          .filter((change) => change.changed)
          .slice(0, 30)
          .map((change) => ({
            tableName: change.tableName,
            documentType: change.documentType,
            id: change.id,
            discriminator: change.discriminator,
            bizDate: change.bizDate,
            oldDocumentNo: change.oldDocumentNo,
            newDocumentNo: change.newDocumentNo,
          })),
        preVerification,
        applied,
        postVerification,
      };
    });

    writeStableReport(reportPath, report);
    console.log(JSON.stringify(report, null, 2));
    console.log(`Report written to ${reportPath}`);
  } finally {
    await closePools(pool);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
