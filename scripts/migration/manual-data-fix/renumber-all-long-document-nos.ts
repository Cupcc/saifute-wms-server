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

const UPDATED_BY = "manual-renumber-all-long-document-nos-20260517";
const COMPACT_LONG_DOCUMENT_NO_REGEXP = "^[A-Z]+[0-9]{17}$";
const COMPACT_SHORT_DOCUMENT_NO_REGEXP = "^[A-Z]+[0-9]{11}$";
const DRY_RUN_REPORT_FILE_NAME =
  "renumber-all-long-document-nos-dry-run-report.json";
const EXECUTE_REPORT_FILE_NAME =
  "renumber-all-long-document-nos-execute-report.json";

interface DocumentConfig {
  key: string;
  tableName: string;
  documentType: string;
  typeColumn: string | null;
  prefixesByType: Record<string, string>;
  fixedPrefix?: string;
}

const DOCUMENT_CONFIGS: DocumentConfig[] = [
  {
    key: "stockIn",
    tableName: "stock_in_order",
    documentType: "StockInOrder",
    typeColumn: "order_type",
    prefixesByType: {
      ACCEPTANCE: "YS",
      PRODUCTION_RECEIPT: "RK",
      SUPPLIER_RETURN: "TGC",
    },
  },
  {
    key: "salesStock",
    tableName: "sales_stock_order",
    documentType: "SalesStockOrder",
    typeColumn: "order_type",
    prefixesByType: {
      OUTBOUND: "CK",
      SALES_RETURN: "XSTH",
    },
  },
  {
    key: "workshopMaterial",
    tableName: "workshop_material_order",
    documentType: "WorkshopMaterialOrder",
    typeColumn: "order_type",
    prefixesByType: {
      PICK: "LL",
      RETURN: "TL",
      SCRAP: "BF",
    },
  },
  {
    key: "priceCorrection",
    tableName: "stock_in_price_correction_order",
    documentType: "StockInPriceCorrectionOrder",
    typeColumn: null,
    prefixesByType: {},
    fixedPrefix: "PC",
  },
  {
    key: "rdProjectAction",
    tableName: "rd_project_material_action",
    documentType: "RdProjectMaterialAction",
    typeColumn: "action_type",
    prefixesByType: {
      PICK: "RAP",
      RETURN: "RAR",
      SCRAP: "RAS",
    },
  },
  {
    key: "rdProcurementRequest",
    tableName: "rd_procurement_request",
    documentType: "RdProcurementRequest",
    typeColumn: null,
    prefixesByType: {},
    fixedPrefix: "RDPUR",
  },
  {
    key: "rdHandoff",
    tableName: "rd_handoff_order",
    documentType: "RdHandoffOrder",
    typeColumn: null,
    prefixesByType: {},
    fixedPrefix: "RDH",
  },
  {
    key: "rdStocktake",
    tableName: "rd_stocktake_order",
    documentType: "RdStocktakeOrder",
    typeColumn: null,
    prefixesByType: {},
    fixedPrefix: "RDST",
  },
];

interface DocumentRow {
  configKey: string;
  tableName: string;
  documentType: string;
  orderId: number;
  rowType: string;
  oldDocumentNo: string;
  bizDate: string;
  createdAt: string;
}

interface ExistingDocumentNoRow {
  tableName: string;
  orderId: number;
  documentNo: string;
}

interface ParsedDocumentNo {
  prefix: string;
  datePart: string;
  sequence?: number;
}

interface PlannedRenumber extends DocumentRow {
  documentDate: string;
  dateMatchesBizDate: boolean;
  newDocumentNo: string;
}

interface ReferenceCount {
  documentType: string;
  orderId: number;
  oldDocumentNo: string;
  inventoryLogCount: number;
  approvalDocumentCount: number;
  rdMaterialStatusHistoryCount: number;
  priceCorrectionSnapshotCount: number;
  rdProcurementSnapshotCount: number;
}

interface AppliedCount {
  documentType: string;
  orderId: number;
  oldDocumentNo: string;
  newDocumentNo: string;
  sourceTableRows: number;
  inventoryLogRows: number;
  approvalDocumentRows: number;
  rdMaterialStatusHistoryRows: number;
  priceCorrectionSnapshotRows: number;
  rdProcurementSnapshotRows: number;
}

interface ValidationSummary {
  remainingCompactLongMainCount: number;
  remainingCompactLongReferenceCount: number;
  remainingOldReferenceCount: number;
  mismatchedNewMainCount: number;
}

interface Report {
  mode: "dry-run" | "execute";
  targetDatabase: string;
  candidateCount: number;
  dateMismatchCount: number;
  blockers: string[];
  plannedRenumbers: PlannedRenumber[];
  referenceCounts: ReferenceCount[];
  appliedCounts?: AppliedCount[];
  validation?: ValidationSummary;
}

function escapeSqlIdentifier(identifier: string): string {
  return `\`${identifier.replaceAll("`", "``")}\``;
}

function expectedPrefix(
  config: DocumentConfig,
  rowType: string,
): string | null {
  return config.fixedPrefix ?? config.prefixesByType[rowType] ?? null;
}

function parseCompactLongDocumentNo(
  documentNo: string,
): ParsedDocumentNo | null {
  const match = /^([A-Z]+)(\d{8})\d{6}\d{3}$/u.exec(documentNo);
  if (!match) {
    return null;
  }
  return {
    prefix: match[1],
    datePart: match[2],
  };
}

function parseCompactShortDocumentNo(
  documentNo: string,
): ParsedDocumentNo | null {
  const match = /^([A-Z]+)(\d{8})(\d{3})$/u.exec(documentNo);
  if (!match) {
    return null;
  }
  return {
    prefix: match[1],
    datePart: match[2],
    sequence: Number(match[3]),
  };
}

function dateTextFromCompact(datePart: string): string {
  return `${datePart.slice(0, 4)}-${datePart.slice(4, 6)}-${datePart.slice(
    6,
    8,
  )}`;
}

function compactDate(dateText: string): string {
  return dateText.replaceAll("-", "");
}

function nextSequence(usedSequences: Set<number>): number {
  for (let sequence = 1; sequence <= 999; sequence += 1) {
    if (!usedSequences.has(sequence)) {
      return sequence;
    }
  }
  throw new Error("单据编号当日流水已满");
}

function buildShortDocumentNo(
  prefix: string,
  datePart: string,
  sequence: number,
) {
  return `${prefix}${datePart}${String(sequence).padStart(3, "0")}`;
}

function numberValue(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function affectedRowsValue(value: unknown): number {
  if (
    value &&
    typeof value === "object" &&
    "affectedRows" in value &&
    typeof value.affectedRows === "number"
  ) {
    return value.affectedRows;
  }
  return 0;
}

async function readLongDocumentRows(
  connection: MigrationConnectionLike,
  config: DocumentConfig,
  lockRows: boolean,
): Promise<DocumentRow[]> {
  const typeExpression = config.typeColumn
    ? escapeSqlIdentifier(config.typeColumn)
    : "'DEFAULT'";
  const rows = await connection.query<
    Array<{
      orderId: number;
      rowType: string;
      oldDocumentNo: string;
      bizDate: string;
      createdAt: string;
    }>
  >(
    `
      SELECT
        id AS orderId,
        ${typeExpression} AS rowType,
        document_no AS oldDocumentNo,
        DATE_FORMAT(biz_date, '%Y-%m-%d') AS bizDate,
        DATE_FORMAT(created_at, '%Y-%m-%d %H:%i:%s') AS createdAt
      FROM ${escapeSqlIdentifier(config.tableName)}
      WHERE document_no REGEXP ?
      ORDER BY biz_date ASC, created_at ASC, id ASC
      ${lockRows ? "FOR UPDATE" : ""}
    `,
    [COMPACT_LONG_DOCUMENT_NO_REGEXP],
  );

  return rows.map((row) => ({
    ...row,
    configKey: config.key,
    tableName: config.tableName,
    documentType: config.documentType,
  }));
}

async function readExistingDocumentNos(
  connection: MigrationConnectionLike,
  config: DocumentConfig,
): Promise<ExistingDocumentNoRow[]> {
  const rows = await connection.query<
    Array<{ orderId: number; documentNo: string }>
  >(
    `
      SELECT id AS orderId, document_no AS documentNo
      FROM ${escapeSqlIdentifier(config.tableName)}
      WHERE document_no REGEXP ?
         OR document_no REGEXP ?
    `,
    [COMPACT_SHORT_DOCUMENT_NO_REGEXP, COMPACT_LONG_DOCUMENT_NO_REGEXP],
  );

  return rows.map((row) => ({ ...row, tableName: config.tableName }));
}

async function readAllLongDocumentRows(
  connection: MigrationConnectionLike,
  lockRows: boolean,
) {
  const nestedRows = await Promise.all(
    DOCUMENT_CONFIGS.map((config) =>
      readLongDocumentRows(connection, config, lockRows),
    ),
  );
  return nestedRows.flat().sort((left, right) => {
    const dateCompare = left.bizDate.localeCompare(right.bizDate);
    if (dateCompare !== 0) return dateCompare;
    const createdCompare = left.createdAt.localeCompare(right.createdAt);
    if (createdCompare !== 0) return createdCompare;
    return left.orderId - right.orderId;
  });
}

async function readAllExistingDocumentNos(connection: MigrationConnectionLike) {
  const nestedRows = await Promise.all(
    DOCUMENT_CONFIGS.map((config) =>
      readExistingDocumentNos(connection, config),
    ),
  );
  return nestedRows.flat();
}

function buildPlan(
  longRows: readonly DocumentRow[],
  existingRows: readonly ExistingDocumentNoRow[],
) {
  const blockers: string[] = [];
  const plannedRenumbers: PlannedRenumber[] = [];
  const usedSequencesByStem = new Map<string, Set<number>>();
  const reservedDocumentNos = new Map<string, string>();
  const configByKey = new Map(
    DOCUMENT_CONFIGS.map((config) => [config.key, config]),
  );

  for (const row of existingRows) {
    reservedDocumentNos.set(row.documentNo, `${row.tableName}:${row.orderId}`);
    const parsed = parseCompactShortDocumentNo(row.documentNo);
    if (!parsed?.sequence) {
      continue;
    }
    const stem = `${parsed.prefix}${parsed.datePart}`;
    const usedSequences = usedSequencesByStem.get(stem) ?? new Set<number>();
    usedSequences.add(parsed.sequence);
    usedSequencesByStem.set(stem, usedSequences);
  }

  for (const row of longRows) {
    const config = configByKey.get(row.configKey);
    const parsed = parseCompactLongDocumentNo(row.oldDocumentNo);
    if (!config || !parsed) {
      blockers.push(
        `无法解析长编号: ${row.tableName}:${row.orderId} ${row.oldDocumentNo}`,
      );
      continue;
    }

    const prefix = expectedPrefix(config, row.rowType);
    if (!prefix) {
      blockers.push(
        `未知单据类型前缀: ${row.tableName}:${row.orderId} type=${row.rowType}`,
      );
      continue;
    }
    if (parsed.prefix !== prefix) {
      blockers.push(
        `编号前缀与类型不匹配: ${row.tableName}:${row.orderId} old=${row.oldDocumentNo}, type=${row.rowType}, expectedPrefix=${prefix}`,
      );
      continue;
    }

    const stem = `${parsed.prefix}${parsed.datePart}`;
    const usedSequences = usedSequencesByStem.get(stem) ?? new Set<number>();
    const sequence = nextSequence(usedSequences);
    const newDocumentNo = buildShortDocumentNo(
      parsed.prefix,
      parsed.datePart,
      sequence,
    );
    const reservedBy = reservedDocumentNos.get(newDocumentNo);

    if (
      reservedBy !== undefined &&
      reservedBy !== `${row.tableName}:${row.orderId}`
    ) {
      blockers.push(
        `目标编号冲突: ${newDocumentNo} 已被 ${reservedBy} 使用，无法给 ${row.tableName}:${row.orderId}`,
      );
      continue;
    }

    usedSequences.add(sequence);
    usedSequencesByStem.set(stem, usedSequences);
    reservedDocumentNos.set(newDocumentNo, `${row.tableName}:${row.orderId}`);
    plannedRenumbers.push({
      ...row,
      documentDate: dateTextFromCompact(parsed.datePart),
      dateMatchesBizDate: parsed.datePart === compactDate(row.bizDate),
      newDocumentNo,
    });
  }

  return { blockers, plannedRenumbers };
}

async function countOne(
  connection: MigrationConnectionLike,
  sql: string,
  values: readonly unknown[],
): Promise<number> {
  const rows = await connection.query<Array<{ count: number }>>(sql, values);
  return numberValue(rows[0]?.count);
}

async function readReferenceCounts(
  connection: MigrationConnectionLike,
  plannedRenumbers: readonly PlannedRenumber[],
): Promise<ReferenceCount[]> {
  const counts: ReferenceCount[] = [];

  for (const item of plannedRenumbers) {
    const inventoryLogCount = await countOne(
      connection,
      `
        SELECT COUNT(*) AS count
        FROM inventory_log
        WHERE business_document_type = ?
          AND business_document_id = ?
          AND business_document_number = ?
      `,
      [item.documentType, item.orderId, item.oldDocumentNo],
    );
    const approvalDocumentCount = await countOne(
      connection,
      `
        SELECT COUNT(*) AS count
        FROM approval_document
        WHERE document_type = ?
          AND document_id = ?
          AND document_number = ?
      `,
      [item.documentType, item.orderId, item.oldDocumentNo],
    );
    const rdMaterialStatusHistoryCount = await countOne(
      connection,
      `
        SELECT COUNT(*) AS count
        FROM rd_material_status_history
        WHERE source_document_type = ?
          AND source_document_id = ?
          AND source_document_number = ?
      `,
      [item.documentType, item.orderId, item.oldDocumentNo],
    );
    const priceCorrectionSnapshotCount = await countOne(
      connection,
      `
        SELECT COUNT(*) AS count
        FROM stock_in_price_correction_order_line line
        JOIN inventory_log log ON log.id = line.source_inventory_log_id
        WHERE log.business_document_type = ?
          AND log.business_document_id = ?
          AND line.source_document_no_snapshot = ?
      `,
      [item.documentType, item.orderId, item.oldDocumentNo],
    );
    const rdProcurementSnapshotCount =
      item.documentType === "RdProcurementRequest"
        ? await countOne(
            connection,
            `
              SELECT COUNT(*) AS count
              FROM stock_in_order
              WHERE rd_procurement_request_id = ?
                AND rd_procurement_request_no_snapshot = ?
            `,
            [item.orderId, item.oldDocumentNo],
          )
        : 0;

    counts.push({
      documentType: item.documentType,
      orderId: item.orderId,
      oldDocumentNo: item.oldDocumentNo,
      inventoryLogCount,
      approvalDocumentCount,
      rdMaterialStatusHistoryCount,
      priceCorrectionSnapshotCount,
      rdProcurementSnapshotCount,
    });
  }

  return counts;
}

async function findReferenceBlockers(
  connection: MigrationConnectionLike,
  plannedRenumbers: readonly PlannedRenumber[],
): Promise<string[]> {
  const blockers: string[] = [];

  for (const item of plannedRenumbers) {
    const targetMainConflictCount = await countOne(
      connection,
      `
        SELECT COUNT(*) AS count
        FROM ${escapeSqlIdentifier(item.tableName)}
        WHERE document_no = ?
          AND id <> ?
      `,
      [item.newDocumentNo, item.orderId],
    );
    if (targetMainConflictCount > 0) {
      blockers.push(
        `目标编号 ${item.newDocumentNo} 已被 ${item.tableName} 其他行使用，orderId=${item.orderId}`,
      );
    }

    const inventoryMismatchCount = await countOne(
      connection,
      `
        SELECT COUNT(*) AS count
        FROM inventory_log
        WHERE business_document_type = ?
          AND business_document_id = ?
          AND business_document_number NOT IN (?, ?)
      `,
      [item.documentType, item.orderId, item.oldDocumentNo, item.newDocumentNo],
    );
    if (inventoryMismatchCount > 0) {
      blockers.push(
        `库存流水存在第三种单据号: ${item.documentType}:${item.orderId}, count=${inventoryMismatchCount}`,
      );
    }

    const approvalMismatchCount = await countOne(
      connection,
      `
        SELECT COUNT(*) AS count
        FROM approval_document
        WHERE document_type = ?
          AND document_id = ?
          AND document_number NOT IN (?, ?)
      `,
      [item.documentType, item.orderId, item.oldDocumentNo, item.newDocumentNo],
    );
    if (approvalMismatchCount > 0) {
      blockers.push(
        `审批单存在第三种单据号: ${item.documentType}:${item.orderId}, count=${approvalMismatchCount}`,
      );
    }

    const targetInventoryConflictCount = await countOne(
      connection,
      `
        SELECT COUNT(*) AS count
        FROM inventory_log
        WHERE business_document_type = ?
          AND business_document_number = ?
          AND business_document_id <> ?
      `,
      [item.documentType, item.newDocumentNo, item.orderId],
    );
    if (targetInventoryConflictCount > 0) {
      blockers.push(
        `目标编号 ${item.newDocumentNo} 已被其他 ${item.documentType} 库存流水使用，orderId=${item.orderId}`,
      );
    }
  }

  return blockers;
}

async function applyOne(
  connection: MigrationConnectionLike,
  item: PlannedRenumber,
): Promise<AppliedCount> {
  const priceCorrectionSnapshotResult = await connection.query(
    `
      UPDATE stock_in_price_correction_order_line line
      JOIN inventory_log log ON log.id = line.source_inventory_log_id
      SET
        line.source_document_no_snapshot = ?,
        line.updated_by = ?,
        line.updated_at = NOW()
      WHERE log.business_document_type = ?
        AND log.business_document_id = ?
        AND line.source_document_no_snapshot = ?
    `,
    [
      item.newDocumentNo,
      UPDATED_BY,
      item.documentType,
      item.orderId,
      item.oldDocumentNo,
    ],
  );
  const rdProcurementSnapshotResult =
    item.documentType === "RdProcurementRequest"
      ? await connection.query(
          `
            UPDATE stock_in_order
            SET
              rd_procurement_request_no_snapshot = ?,
              updated_by = ?,
              updated_at = NOW()
            WHERE rd_procurement_request_id = ?
              AND rd_procurement_request_no_snapshot = ?
          `,
          [item.newDocumentNo, UPDATED_BY, item.orderId, item.oldDocumentNo],
        )
      : { affectedRows: 0 };
  const rdMaterialStatusHistoryResult = await connection.query(
    `
      UPDATE rd_material_status_history
      SET source_document_number = ?
      WHERE source_document_type = ?
        AND source_document_id = ?
        AND source_document_number = ?
    `,
    [item.newDocumentNo, item.documentType, item.orderId, item.oldDocumentNo],
  );
  const inventoryLogResult = await connection.query(
    `
      UPDATE inventory_log
      SET business_document_number = ?
      WHERE business_document_type = ?
        AND business_document_id = ?
        AND business_document_number = ?
    `,
    [item.newDocumentNo, item.documentType, item.orderId, item.oldDocumentNo],
  );
  const approvalDocumentResult = await connection.query(
    `
      UPDATE approval_document
      SET
        document_number = ?,
        updated_by = ?,
        updated_at = NOW()
      WHERE document_type = ?
        AND document_id = ?
        AND document_number = ?
    `,
    [
      item.newDocumentNo,
      UPDATED_BY,
      item.documentType,
      item.orderId,
      item.oldDocumentNo,
    ],
  );
  const sourceTableResult = await connection.query(
    `
      UPDATE ${escapeSqlIdentifier(item.tableName)}
      SET
        document_no = ?,
        updated_by = ?,
        updated_at = NOW()
      WHERE id = ?
        AND document_no = ?
    `,
    [item.newDocumentNo, UPDATED_BY, item.orderId, item.oldDocumentNo],
  );

  return {
    documentType: item.documentType,
    orderId: item.orderId,
    oldDocumentNo: item.oldDocumentNo,
    newDocumentNo: item.newDocumentNo,
    sourceTableRows: affectedRowsValue(sourceTableResult),
    inventoryLogRows: affectedRowsValue(inventoryLogResult),
    approvalDocumentRows: affectedRowsValue(approvalDocumentResult),
    rdMaterialStatusHistoryRows: affectedRowsValue(
      rdMaterialStatusHistoryResult,
    ),
    priceCorrectionSnapshotRows: affectedRowsValue(
      priceCorrectionSnapshotResult,
    ),
    rdProcurementSnapshotRows: affectedRowsValue(rdProcurementSnapshotResult),
  };
}

async function countRemainingLongMainRows(
  connection: MigrationConnectionLike,
): Promise<number> {
  let count = 0;
  for (const config of DOCUMENT_CONFIGS) {
    count += await countOne(
      connection,
      `
        SELECT COUNT(*) AS count
        FROM ${escapeSqlIdentifier(config.tableName)}
        WHERE document_no REGEXP ?
      `,
      [COMPACT_LONG_DOCUMENT_NO_REGEXP],
    );
  }
  return count;
}

async function countRemainingLongReferences(
  connection: MigrationConnectionLike,
): Promise<number> {
  return (
    (await countOne(
      connection,
      `
        SELECT COUNT(*) AS count
        FROM inventory_log
        WHERE business_document_number REGEXP ?
      `,
      [COMPACT_LONG_DOCUMENT_NO_REGEXP],
    )) +
    (await countOne(
      connection,
      `
        SELECT COUNT(*) AS count
        FROM approval_document
        WHERE document_number REGEXP ?
      `,
      [COMPACT_LONG_DOCUMENT_NO_REGEXP],
    )) +
    (await countOne(
      connection,
      `
        SELECT COUNT(*) AS count
        FROM rd_material_status_history
        WHERE source_document_number REGEXP ?
      `,
      [COMPACT_LONG_DOCUMENT_NO_REGEXP],
    )) +
    (await countOne(
      connection,
      `
        SELECT COUNT(*) AS count
        FROM stock_in_price_correction_order_line
        WHERE source_document_no_snapshot REGEXP ?
      `,
      [COMPACT_LONG_DOCUMENT_NO_REGEXP],
    )) +
    (await countOne(
      connection,
      `
        SELECT COUNT(*) AS count
        FROM stock_in_order
        WHERE rd_procurement_request_no_snapshot REGEXP ?
      `,
      [COMPACT_LONG_DOCUMENT_NO_REGEXP],
    ))
  );
}

async function countRemainingOldReferences(
  connection: MigrationConnectionLike,
  oldDocumentNos: readonly string[],
): Promise<number> {
  if (oldDocumentNos.length === 0) {
    return 0;
  }
  const placeholders = oldDocumentNos.map(() => "?").join(",");
  return (
    (await countOne(
      connection,
      `
        SELECT COUNT(*) AS count
        FROM inventory_log
        WHERE business_document_number IN (${placeholders})
      `,
      oldDocumentNos,
    )) +
    (await countOne(
      connection,
      `
        SELECT COUNT(*) AS count
        FROM approval_document
        WHERE document_number IN (${placeholders})
      `,
      oldDocumentNos,
    )) +
    (await countOne(
      connection,
      `
        SELECT COUNT(*) AS count
        FROM rd_material_status_history
        WHERE source_document_number IN (${placeholders})
      `,
      oldDocumentNos,
    )) +
    (await countOne(
      connection,
      `
        SELECT COUNT(*) AS count
        FROM stock_in_price_correction_order_line
        WHERE source_document_no_snapshot IN (${placeholders})
      `,
      oldDocumentNos,
    )) +
    (await countOne(
      connection,
      `
        SELECT COUNT(*) AS count
        FROM stock_in_order
        WHERE rd_procurement_request_no_snapshot IN (${placeholders})
      `,
      oldDocumentNos,
    ))
  );
}

async function countMismatchedNewMainRows(
  connection: MigrationConnectionLike,
  plannedRenumbers: readonly PlannedRenumber[],
): Promise<number> {
  let count = 0;
  for (const item of plannedRenumbers) {
    count += await countOne(
      connection,
      `
        SELECT COUNT(*) AS count
        FROM ${escapeSqlIdentifier(item.tableName)}
        WHERE id = ?
          AND document_no <> ?
      `,
      [item.orderId, item.newDocumentNo],
    );
  }
  return count;
}

async function validateAfterExecute(
  connection: MigrationConnectionLike,
  plannedRenumbers: readonly PlannedRenumber[],
): Promise<ValidationSummary> {
  const oldDocumentNos = plannedRenumbers.map((item) => item.oldDocumentNo);
  return {
    remainingCompactLongMainCount: await countRemainingLongMainRows(connection),
    remainingCompactLongReferenceCount:
      await countRemainingLongReferences(connection),
    remainingOldReferenceCount: await countRemainingOldReferences(
      connection,
      oldDocumentNos,
    ),
    mismatchedNewMainCount: await countMismatchedNewMainRows(
      connection,
      plannedRenumbers,
    ),
  };
}

async function buildReport(
  connection: MigrationConnectionLike,
  mode: "dry-run" | "execute",
  targetDatabase: string,
  lockRows = false,
): Promise<Report> {
  const longRows = await readAllLongDocumentRows(connection, lockRows);
  const existingDocumentNos = await readAllExistingDocumentNos(connection);
  const plan = buildPlan(longRows, existingDocumentNos);
  const referenceCounts = await readReferenceCounts(
    connection,
    plan.plannedRenumbers,
  );
  const referenceBlockers = await findReferenceBlockers(
    connection,
    plan.plannedRenumbers,
  );
  const blockers = [...plan.blockers, ...referenceBlockers];

  return {
    mode,
    targetDatabase,
    candidateCount: plan.plannedRenumbers.length,
    dateMismatchCount: plan.plannedRenumbers.filter(
      (item) => !item.dateMatchesBizDate,
    ).length,
    blockers,
    plannedRenumbers: plan.plannedRenumbers,
    referenceCounts,
  };
}

async function main() {
  const cliOptions = parseMigrationCliOptions();
  const env = loadMigrationEnvironment({ requireLegacyDatabaseUrl: false });
  const targetDatabase = assertExpectedDatabaseName(
    env.databaseUrl,
    EXPECTED_TARGET_DATABASE_NAME,
    "target",
  );
  const reportPath = resolveReportPath(
    cliOptions,
    cliOptions.execute ? EXECUTE_REPORT_FILE_NAME : DRY_RUN_REPORT_FILE_NAME,
  );
  const pool = createMariaDbPool(env.databaseUrl);

  try {
    const report = await withPoolConnection(pool, async (connection) => {
      if (!cliOptions.execute) {
        return buildReport(connection, "dry-run", targetDatabase);
      }

      await connection.beginTransaction();
      try {
        const executeReport = await buildReport(
          connection,
          "execute",
          targetDatabase,
          true,
        );
        if (executeReport.blockers.length > 0) {
          await connection.rollback();
          return executeReport;
        }

        const appliedCounts: AppliedCount[] = [];
        for (const item of executeReport.plannedRenumbers) {
          appliedCounts.push(await applyOne(connection, item));
        }

        executeReport.appliedCounts = appliedCounts;
        executeReport.validation = await validateAfterExecute(
          connection,
          executeReport.plannedRenumbers,
        );

        if (
          executeReport.validation.remainingCompactLongMainCount > 0 ||
          executeReport.validation.remainingCompactLongReferenceCount > 0 ||
          executeReport.validation.remainingOldReferenceCount > 0 ||
          executeReport.validation.mismatchedNewMainCount > 0
        ) {
          executeReport.blockers.push(
            `执行后验证失败: ${JSON.stringify(executeReport.validation)}`,
          );
          await connection.rollback();
          return executeReport;
        }

        await connection.commit();
        return executeReport;
      } catch (error) {
        await connection.rollback();
        throw error;
      }
    });

    writeStableReport(reportPath, report);
    console.log(JSON.stringify({ reportPath, ...report }, null, 2));
    if (report.blockers.length > 0) {
      process.exitCode = 1;
    }
  } finally {
    await closePools(pool);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
