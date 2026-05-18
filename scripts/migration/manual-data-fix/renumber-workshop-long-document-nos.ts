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

const UPDATED_BY = "manual-renumber-workshop-long-document-nos-20260517";
const LONG_WORKSHOP_DOCUMENT_NO_REGEXP = "^(LL|TL|BF)[0-9]{17}$";
const SHORT_WORKSHOP_DOCUMENT_NO_REGEXP = "^(LL|TL|BF)[0-9]{11}$";
const DRY_RUN_REPORT_FILE_NAME =
  "renumber-workshop-long-document-nos-dry-run-report.json";
const EXECUTE_REPORT_FILE_NAME =
  "renumber-workshop-long-document-nos-execute-report.json";

type WorkshopOrderType = "PICK" | "RETURN" | "SCRAP";

interface WorkshopOrderRow {
  orderId: number;
  orderType: WorkshopOrderType;
  oldDocumentNo: string;
  bizDate: string;
  createdAt: string;
}

interface ExistingDocumentNoRow {
  orderId: number;
  orderType: WorkshopOrderType;
  documentNo: string;
  bizDate: string;
}

interface PlannedRenumber {
  orderId: number;
  orderType: WorkshopOrderType;
  bizDate: string;
  createdAt: string;
  oldDocumentNo: string;
  newDocumentNo: string;
}

interface ReferenceCount {
  orderId: number;
  oldDocumentNo: string;
  inventoryLogCount: number;
  approvalDocumentCount: number;
  rdMaterialStatusHistoryCount: number;
  priceCorrectionSnapshotCount: number;
}

interface AppliedCount {
  orderId: number;
  oldDocumentNo: string;
  newDocumentNo: string;
  workshopOrderRows: number;
  inventoryLogRows: number;
  approvalDocumentRows: number;
  rdMaterialStatusHistoryRows: number;
  priceCorrectionSnapshotRows: number;
}

interface ValidationSummary {
  remainingLongOrderCount: number;
  remainingOldReferenceCount: number;
  mismatchedNewReferenceCount: number;
}

interface Report {
  mode: "dry-run" | "execute";
  targetDatabase: string;
  candidateCount: number;
  blockers: string[];
  plannedRenumbers: PlannedRenumber[];
  referenceCounts: ReferenceCount[];
  appliedCounts?: AppliedCount[];
  validation?: ValidationSummary;
}

function prefixForOrderType(orderType: WorkshopOrderType): string {
  switch (orderType) {
    case "PICK":
      return "LL";
    case "RETURN":
      return "TL";
    case "SCRAP":
      return "BF";
  }
}

function compactDate(dateText: string): string {
  return dateText.replaceAll("-", "");
}

function buildStem(orderType: WorkshopOrderType, bizDate: string): string {
  return `${prefixForOrderType(orderType)}${compactDate(bizDate)}`;
}

function parseShortSequence(documentNo: string, stem: string): number | null {
  if (!documentNo.startsWith(stem)) {
    return null;
  }
  const suffix = documentNo.slice(stem.length);
  if (!/^\d{3}$/u.test(suffix)) {
    return null;
  }
  return Number(suffix);
}

function nextSequence(usedSequences: Set<number>): number {
  for (let sequence = 1; sequence <= 999; sequence += 1) {
    if (!usedSequences.has(sequence)) {
      return sequence;
    }
  }
  throw new Error("单据编号当日流水已满");
}

function buildShortDocumentNo(stem: string, sequence: number): string {
  return `${stem}${String(sequence).padStart(3, "0")}`;
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

async function readLongWorkshopOrders(
  connection: MigrationConnectionLike,
  lockRows: boolean,
): Promise<WorkshopOrderRow[]> {
  return connection.query<WorkshopOrderRow[]>(
    `
      SELECT
        id AS orderId,
        order_type AS orderType,
        document_no AS oldDocumentNo,
        DATE_FORMAT(biz_date, '%Y-%m-%d') AS bizDate,
        DATE_FORMAT(created_at, '%Y-%m-%d %H:%i:%s') AS createdAt
      FROM workshop_material_order
      WHERE document_no REGEXP ?
      ORDER BY biz_date ASC, created_at ASC, id ASC
      ${lockRows ? "FOR UPDATE" : ""}
    `,
    [LONG_WORKSHOP_DOCUMENT_NO_REGEXP],
  );
}

async function readExistingDocumentNos(
  connection: MigrationConnectionLike,
): Promise<ExistingDocumentNoRow[]> {
  return connection.query<ExistingDocumentNoRow[]>(
    `
      SELECT
        id AS orderId,
        order_type AS orderType,
        document_no AS documentNo,
        DATE_FORMAT(biz_date, '%Y-%m-%d') AS bizDate
      FROM workshop_material_order
      WHERE document_no REGEXP ?
         OR document_no REGEXP ?
      ORDER BY biz_date ASC, created_at ASC, id ASC
    `,
    [SHORT_WORKSHOP_DOCUMENT_NO_REGEXP, LONG_WORKSHOP_DOCUMENT_NO_REGEXP],
  );
}

function buildPlan(
  longOrders: readonly WorkshopOrderRow[],
  existingDocumentNos: readonly ExistingDocumentNoRow[],
) {
  const blockers: string[] = [];
  const plannedRenumbers: PlannedRenumber[] = [];
  const usedSequencesByStem = new Map<string, Set<number>>();
  const reservedDocumentNos = new Map<string, number>();

  for (const row of existingDocumentNos) {
    reservedDocumentNos.set(row.documentNo, row.orderId);
    const stem = buildStem(row.orderType, row.bizDate);
    const sequence = parseShortSequence(row.documentNo, stem);
    if (sequence === null) {
      continue;
    }
    const usedSequences = usedSequencesByStem.get(stem) ?? new Set<number>();
    usedSequences.add(sequence);
    usedSequencesByStem.set(stem, usedSequences);
  }

  for (const row of longOrders) {
    const expectedPrefix = prefixForOrderType(row.orderType);
    if (!row.oldDocumentNo.startsWith(expectedPrefix)) {
      blockers.push(
        `orderId=${row.orderId} 单据类型 ${row.orderType} 与编号前缀不匹配: ${row.oldDocumentNo}`,
      );
      continue;
    }

    const stem = buildStem(row.orderType, row.bizDate);
    if (row.oldDocumentNo.slice(0, stem.length) !== stem) {
      blockers.push(
        `orderId=${row.orderId} 编号日期与业务日期不匹配: old=${row.oldDocumentNo}, bizDate=${row.bizDate}`,
      );
      continue;
    }

    const usedSequences = usedSequencesByStem.get(stem) ?? new Set<number>();
    const sequence = nextSequence(usedSequences);
    const newDocumentNo = buildShortDocumentNo(stem, sequence);
    const reservedBy = reservedDocumentNos.get(newDocumentNo);

    if (reservedBy !== undefined && reservedBy !== row.orderId) {
      blockers.push(
        `目标编号冲突: ${newDocumentNo} 已被 orderId=${reservedBy} 使用，无法给 orderId=${row.orderId}`,
      );
      continue;
    }

    usedSequences.add(sequence);
    usedSequencesByStem.set(stem, usedSequences);
    reservedDocumentNos.set(newDocumentNo, row.orderId);
    plannedRenumbers.push({ ...row, newDocumentNo });
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
        WHERE business_document_type = 'WorkshopMaterialOrder'
          AND business_document_id = ?
          AND business_document_number = ?
      `,
      [item.orderId, item.oldDocumentNo],
    );
    const approvalDocumentCount = await countOne(
      connection,
      `
        SELECT COUNT(*) AS count
        FROM approval_document
        WHERE document_type = 'WorkshopMaterialOrder'
          AND document_id = ?
          AND document_number = ?
      `,
      [item.orderId, item.oldDocumentNo],
    );
    const rdMaterialStatusHistoryCount = await countOne(
      connection,
      `
        SELECT COUNT(*) AS count
        FROM rd_material_status_history
        WHERE source_document_type = 'WorkshopMaterialOrder'
          AND source_document_id = ?
          AND source_document_number = ?
      `,
      [item.orderId, item.oldDocumentNo],
    );
    const priceCorrectionSnapshotCount = await countOne(
      connection,
      `
        SELECT COUNT(*) AS count
        FROM stock_in_price_correction_order_line line
        JOIN inventory_log log ON log.id = line.source_inventory_log_id
        WHERE log.business_document_type = 'WorkshopMaterialOrder'
          AND log.business_document_id = ?
          AND line.source_document_no_snapshot = ?
      `,
      [item.orderId, item.oldDocumentNo],
    );

    counts.push({
      orderId: item.orderId,
      oldDocumentNo: item.oldDocumentNo,
      inventoryLogCount,
      approvalDocumentCount,
      rdMaterialStatusHistoryCount,
      priceCorrectionSnapshotCount,
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
    const targetOrderConflictCount = await countOne(
      connection,
      `
        SELECT COUNT(*) AS count
        FROM workshop_material_order
        WHERE document_no = ?
          AND id <> ?
      `,
      [item.newDocumentNo, item.orderId],
    );
    if (targetOrderConflictCount > 0) {
      blockers.push(
        `目标编号 ${item.newDocumentNo} 已被其他车间物料单使用，orderId=${item.orderId}`,
      );
    }

    const inventoryMismatchCount = await countOne(
      connection,
      `
        SELECT COUNT(*) AS count
        FROM inventory_log
        WHERE business_document_type = 'WorkshopMaterialOrder'
          AND business_document_id = ?
          AND business_document_number NOT IN (?, ?)
      `,
      [item.orderId, item.oldDocumentNo, item.newDocumentNo],
    );
    if (inventoryMismatchCount > 0) {
      blockers.push(
        `库存流水存在第三种单据号，orderId=${item.orderId}, count=${inventoryMismatchCount}`,
      );
    }

    const approvalMismatchCount = await countOne(
      connection,
      `
        SELECT COUNT(*) AS count
        FROM approval_document
        WHERE document_type = 'WorkshopMaterialOrder'
          AND document_id = ?
          AND document_number NOT IN (?, ?)
      `,
      [item.orderId, item.oldDocumentNo, item.newDocumentNo],
    );
    if (approvalMismatchCount > 0) {
      blockers.push(
        `审批单存在第三种单据号，orderId=${item.orderId}, count=${approvalMismatchCount}`,
      );
    }

    const targetInventoryConflictCount = await countOne(
      connection,
      `
        SELECT COUNT(*) AS count
        FROM inventory_log
        WHERE business_document_type = 'WorkshopMaterialOrder'
          AND business_document_number = ?
          AND business_document_id <> ?
      `,
      [item.newDocumentNo, item.orderId],
    );
    if (targetInventoryConflictCount > 0) {
      blockers.push(
        `目标编号 ${item.newDocumentNo} 已被其他车间物料库存流水使用，orderId=${item.orderId}`,
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
      WHERE log.business_document_type = 'WorkshopMaterialOrder'
        AND log.business_document_id = ?
        AND line.source_document_no_snapshot = ?
    `,
    [item.newDocumentNo, UPDATED_BY, item.orderId, item.oldDocumentNo],
  );
  const rdMaterialStatusHistoryResult = await connection.query(
    `
      UPDATE rd_material_status_history
      SET source_document_number = ?
      WHERE source_document_type = 'WorkshopMaterialOrder'
        AND source_document_id = ?
        AND source_document_number = ?
    `,
    [item.newDocumentNo, item.orderId, item.oldDocumentNo],
  );
  const inventoryLogResult = await connection.query(
    `
      UPDATE inventory_log
      SET business_document_number = ?
      WHERE business_document_type = 'WorkshopMaterialOrder'
        AND business_document_id = ?
        AND business_document_number = ?
    `,
    [item.newDocumentNo, item.orderId, item.oldDocumentNo],
  );
  const approvalDocumentResult = await connection.query(
    `
      UPDATE approval_document
      SET
        document_number = ?,
        updated_by = ?,
        updated_at = NOW()
      WHERE document_type = 'WorkshopMaterialOrder'
        AND document_id = ?
        AND document_number = ?
    `,
    [item.newDocumentNo, UPDATED_BY, item.orderId, item.oldDocumentNo],
  );
  const workshopOrderResult = await connection.query(
    `
      UPDATE workshop_material_order
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
    orderId: item.orderId,
    oldDocumentNo: item.oldDocumentNo,
    newDocumentNo: item.newDocumentNo,
    workshopOrderRows: affectedRowsValue(workshopOrderResult),
    inventoryLogRows: affectedRowsValue(inventoryLogResult),
    approvalDocumentRows: affectedRowsValue(approvalDocumentResult),
    rdMaterialStatusHistoryRows: affectedRowsValue(
      rdMaterialStatusHistoryResult,
    ),
    priceCorrectionSnapshotRows: affectedRowsValue(
      priceCorrectionSnapshotResult,
    ),
  };
}

async function validateAfterExecute(
  connection: MigrationConnectionLike,
  plannedRenumbers: readonly PlannedRenumber[],
) {
  const oldDocumentNos = plannedRenumbers.map((item) => item.oldDocumentNo);
  const newDocumentNos = plannedRenumbers.map((item) => item.newDocumentNo);
  if (plannedRenumbers.length === 0) {
    return {
      remainingLongOrderCount: 0,
      remainingOldReferenceCount: 0,
      mismatchedNewReferenceCount: 0,
    };
  }

  const remainingLongOrderCount = await countOne(
    connection,
    `
      SELECT COUNT(*) AS count
      FROM workshop_material_order
      WHERE id IN (${plannedRenumbers.map(() => "?").join(",")})
        AND document_no REGEXP ?
    `,
    [
      ...plannedRenumbers.map((item) => item.orderId),
      LONG_WORKSHOP_DOCUMENT_NO_REGEXP,
    ],
  );
  const remainingOldReferenceCount =
    (await countOne(
      connection,
      `
        SELECT COUNT(*) AS count
        FROM inventory_log
        WHERE business_document_type = 'WorkshopMaterialOrder'
          AND business_document_number IN (${oldDocumentNos.map(() => "?").join(",")})
      `,
      oldDocumentNos,
    )) +
    (await countOne(
      connection,
      `
        SELECT COUNT(*) AS count
        FROM approval_document
        WHERE document_type = 'WorkshopMaterialOrder'
          AND document_number IN (${oldDocumentNos.map(() => "?").join(",")})
      `,
      oldDocumentNos,
    )) +
    (await countOne(
      connection,
      `
        SELECT COUNT(*) AS count
        FROM rd_material_status_history
        WHERE source_document_type = 'WorkshopMaterialOrder'
          AND source_document_number IN (${oldDocumentNos.map(() => "?").join(",")})
      `,
      oldDocumentNos,
    )) +
    (await countOne(
      connection,
      `
        SELECT COUNT(*) AS count
        FROM stock_in_price_correction_order_line
        WHERE source_document_no_snapshot IN (${oldDocumentNos.map(() => "?").join(",")})
      `,
      oldDocumentNos,
    ));
  const mismatchedNewReferenceCount = await countOne(
    connection,
    `
      SELECT COUNT(*) AS count
      FROM workshop_material_order
      WHERE id IN (${plannedRenumbers.map(() => "?").join(",")})
        AND document_no NOT IN (${newDocumentNos.map(() => "?").join(",")})
    `,
    [...plannedRenumbers.map((item) => item.orderId), ...newDocumentNos],
  );

  return {
    remainingLongOrderCount,
    remainingOldReferenceCount,
    mismatchedNewReferenceCount,
  };
}

async function buildReport(
  connection: MigrationConnectionLike,
  mode: "dry-run" | "execute",
  targetDatabase: string,
  lockRows = false,
): Promise<Report> {
  const longOrders = await readLongWorkshopOrders(connection, lockRows);
  const existingDocumentNos = await readExistingDocumentNos(connection);
  const plan = buildPlan(longOrders, existingDocumentNos);
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
          executeReport.validation.remainingLongOrderCount > 0 ||
          executeReport.validation.remainingOldReferenceCount > 0 ||
          executeReport.validation.mismatchedNewReferenceCount > 0
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
