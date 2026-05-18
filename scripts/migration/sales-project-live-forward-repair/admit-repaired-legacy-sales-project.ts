import { BusinessDocumentType } from "../../../src/shared/domain/business-document-type";
import {
  assertDistinctSourceAndTargetDatabases,
  assertExpectedDatabaseName,
  EXPECTED_LEGACY_DATABASE_NAME,
  EXPECTED_TARGET_DATABASE_NAME,
  loadMigrationEnvironment,
  parseMigrationCliOptions,
  resolveReportPath,
} from "../config";
import {
  closePools,
  createMariaDbPool,
  type MigrationConnectionLike,
  type QueryResultWithInsertId,
  withPoolConnection,
} from "../db";
import {
  readLegacyRdProjectSnapshot,
  readRdProjectDependencySnapshot,
} from "../rd-project/legacy-reader";
import { buildRdProjectMigrationPlan } from "../rd-project/transformer";
import type {
  ArchivedFieldPayloadRecord,
  LegacyRdProjectLineRow,
  RdProjectAutoCreatedMaterialPlanRecord,
  RdProjectLinePlanRecord,
  RdProjectPlanRecord,
} from "../rd-project/types";
import { stableJsonStringify } from "../shared/deterministic";
import { writeStableReport } from "../shared/report-writer";

const LEGACY_PROJECT_ID = 16;
const EXPECTED_LINE_COUNT = 83;
const EXPECTED_ACCEPTED_LINE_COUNT = 36;
const EXPECTED_ALLOCATION_CANDIDATE_LINE_COUNT = 47;
const MIGRATION_BATCH = "sales-project-legacy16-admit";
const UPDATED_BY = "sales-project-legacy16-admit";
const DRY_RUN_REPORT_FILE_NAME =
  "sales-project-legacy16-admit-dry-run-report.json";
const EXECUTE_REPORT_FILE_NAME =
  "sales-project-legacy16-admit-execute-report.json";

interface ExistingMapRow {
  legacyTable: string;
  legacyId: number;
  targetTable: string;
  targetId: number;
  targetCode: string | null;
  migrationBatch: string;
}

interface ExistingMaterialRow {
  materialCode: string;
  materialName: string;
  specModel: string | null;
  unitCode: string;
  creationMode: string;
  sourceDocumentType: string | null;
  sourceDocumentId: number | null;
}

interface ExecuteResult {
  insertedOrUpdatedAutoCreatedMaterials: number;
  insertedSalesProjects: number;
  insertedSalesProjectMaterialLines: number;
  insertedProjectTargets: number;
  archivedPayloadCount: number;
}

interface MigrationBlocker {
  reason: string;
  details?: Record<string, unknown>;
}

interface ArchivePayload {
  legacyTable: string;
  legacyId: number;
  targetTable: string;
  targetCode: string;
  payloadKind: string;
  archiveReason: string;
  payload: Record<string, unknown>;
}

function numberValue(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "bigint") return Number(value);
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function escapeSqlPlaceholders(values: readonly unknown[]): string {
  return values.map(() => "?").join(", ");
}

async function runInsert(
  connection: MigrationConnectionLike,
  sql: string,
  values: readonly unknown[],
): Promise<number> {
  const result =
    (await connection.query<QueryResultWithInsertId>(sql, values)) ?? {};
  const insertId = Number(result.insertId ?? 0);
  if (!Number.isFinite(insertId) || insertId <= 0) {
    throw new Error("Insert did not yield a valid id.");
  }
  return insertId;
}

async function runUpsert(
  connection: MigrationConnectionLike,
  sql: string,
  values: readonly unknown[],
): Promise<number> {
  const result =
    (await connection.query<QueryResultWithInsertId>(sql, values)) ?? {};
  const insertId = Number(result.insertId ?? 0);
  if (!Number.isFinite(insertId) || insertId <= 0) {
    throw new Error("Upsert did not yield a valid target id.");
  }
  return insertId;
}

function payloadForTarget(
  payload: ArchivedFieldPayloadRecord,
  targetTable: "sales_project" | "sales_project_material_line",
  archiveReason: string,
): ArchivePayload {
  return {
    ...payload,
    targetTable,
    archiveReason,
  };
}

function projectAcceptedStats(
  project: RdProjectPlanRecord,
  sourceLines: readonly LegacyRdProjectLineRow[],
): { acceptedLineCount: number; allocationCandidateLineCount: number } {
  const projectLineIds = new Set(project.lines.map((line) => line.legacyId));
  const projectSourceLines = sourceLines.filter((line) =>
    projectLineIds.has(line.legacyId),
  );
  const acceptedLineCount = projectSourceLines.filter(
    (line) => line.acceptanceDate !== null,
  ).length;

  return {
    acceptedLineCount,
    allocationCandidateLineCount: projectSourceLines.length - acceptedLineCount,
  };
}

function autoCreatedMaterialsForProject(
  project: RdProjectPlanRecord,
  autoCreatedMaterials: readonly RdProjectAutoCreatedMaterialPlanRecord[],
): RdProjectAutoCreatedMaterialPlanRecord[] {
  const projectMaterialCodes = new Set(
    project.lines.map((line) => line.target.materialCodeSnapshot),
  );
  return autoCreatedMaterials.filter((material) =>
    projectMaterialCodes.has(material.target.materialCode),
  );
}

async function loadExistingProjectMaps(
  connection: MigrationConnectionLike,
): Promise<ExistingMapRow[]> {
  return connection.query<ExistingMapRow[]>(
    `
      SELECT
        legacy_table AS legacyTable,
        legacy_id AS legacyId,
        target_table AS targetTable,
        target_id AS targetId,
        target_code AS targetCode,
        migration_batch AS migrationBatch
      FROM migration_staging.map_project
      WHERE legacy_table = 'saifute_composite_product'
        AND legacy_id = ?
      ORDER BY target_table ASC
    `,
    [LEGACY_PROJECT_ID],
  );
}

async function loadExistingLineMapCount(
  connection: MigrationConnectionLike,
  lineLegacyIds: readonly number[],
): Promise<number> {
  if (lineLegacyIds.length === 0) return 0;
  const rows = await connection.query<Array<{ total: number }>>(
    `
      SELECT COUNT(*) AS total
      FROM migration_staging.map_project_material_line
      WHERE legacy_table = 'saifute_product_material'
        AND legacy_id IN (${escapeSqlPlaceholders(lineLegacyIds)})
    `,
    lineLegacyIds,
  );
  return numberValue(rows[0]?.total);
}

async function loadExistingSalesProjectCodes(
  connection: MigrationConnectionLike,
  projectCode: string,
): Promise<Array<{ id: number; salesProjectCode: string }>> {
  return connection.query<Array<{ id: number; salesProjectCode: string }>>(
    `
      SELECT id, sales_project_code AS salesProjectCode
      FROM sales_project
      WHERE sales_project_code = ?
    `,
    [projectCode],
  );
}

async function loadExistingProjectTargets(
  connection: MigrationConnectionLike,
  projectCode: string,
): Promise<Array<{ id: number; targetType: string; targetCode: string }>> {
  return connection.query<
    Array<{ id: number; targetType: string; targetCode: string }>
  >(
    `
      SELECT id, target_type AS targetType, target_code AS targetCode
      FROM project_target
      WHERE target_type = 'SALES_PROJECT'
        AND target_code = ?
    `,
    [projectCode],
  );
}

async function loadExistingMaterialsByCode(
  connection: MigrationConnectionLike,
  materialCodes: readonly string[],
): Promise<ExistingMaterialRow[]> {
  if (materialCodes.length === 0) return [];
  return connection.query<ExistingMaterialRow[]>(
    `
      SELECT
        material_code AS materialCode,
        material_name AS materialName,
        spec_model AS specModel,
        unit_code AS unitCode,
        creation_mode AS creationMode,
        source_document_type AS sourceDocumentType,
        source_document_id AS sourceDocumentId
      FROM material
      WHERE material_code IN (${escapeSqlPlaceholders(materialCodes)})
      ORDER BY material_code ASC
    `,
    materialCodes,
  );
}

async function loadMainStockScopeId(
  connection: MigrationConnectionLike,
): Promise<number | null> {
  const rows = await connection.query<Array<{ id: number }>>(
    `
      SELECT id
      FROM stock_scope
      WHERE scope_code = 'MAIN'
      LIMIT 1
    `,
  );
  const id = rows[0]?.id;
  return typeof id === "number" ? id : null;
}

function buildMaterialConflictBlockers(
  autoCreatedMaterials: readonly RdProjectAutoCreatedMaterialPlanRecord[],
  existingMaterials: readonly ExistingMaterialRow[],
): MigrationBlocker[] {
  const autoCreatedMaterialByCode = new Map(
    autoCreatedMaterials.map((material) => [
      material.target.materialCode,
      material,
    ]),
  );
  const conflicts = existingMaterials.filter((existingMaterial) => {
    const plannedMaterial = autoCreatedMaterialByCode.get(
      existingMaterial.materialCode,
    );
    if (!plannedMaterial) return false;

    return (
      existingMaterial.creationMode !== plannedMaterial.target.creationMode ||
      existingMaterial.sourceDocumentType !==
        plannedMaterial.target.sourceDocumentType ||
      existingMaterial.sourceDocumentId !==
        plannedMaterial.target.sourceDocumentId ||
      existingMaterial.materialName !== plannedMaterial.target.materialName ||
      (existingMaterial.specModel ?? null) !==
        (plannedMaterial.target.specModel ?? null) ||
      existingMaterial.unitCode !== plannedMaterial.target.unitCode
    );
  });

  if (conflicts.length === 0) return [];
  return [
    {
      reason: "auto-created-material-code-conflict",
      details: {
        materialCodes: conflicts.map((conflict) => conflict.materialCode),
      },
    },
  ];
}

async function buildBlockers(params: {
  connection: MigrationConnectionLike;
  project: RdProjectPlanRecord | null;
  autoCreatedMaterials: readonly RdProjectAutoCreatedMaterialPlanRecord[];
  sourceLines: readonly LegacyRdProjectLineRow[];
  mainStockScopeId: number | null;
}): Promise<MigrationBlocker[]> {
  const blockers: MigrationBlocker[] = [];
  if (!params.project) {
    return [{ reason: "legacy-project-16-not-migratable" }];
  }

  const stats = projectAcceptedStats(params.project, params.sourceLines);
  if (params.project.lines.length !== EXPECTED_LINE_COUNT) {
    blockers.push({
      reason: "legacy-project-16-line-count-drift",
      details: {
        expected: EXPECTED_LINE_COUNT,
        actual: params.project.lines.length,
      },
    });
  }
  if (stats.acceptedLineCount !== EXPECTED_ACCEPTED_LINE_COUNT) {
    blockers.push({
      reason: "legacy-project-16-accepted-line-count-drift",
      details: {
        expected: EXPECTED_ACCEPTED_LINE_COUNT,
        actual: stats.acceptedLineCount,
      },
    });
  }
  if (
    stats.allocationCandidateLineCount !==
    EXPECTED_ALLOCATION_CANDIDATE_LINE_COUNT
  ) {
    blockers.push({
      reason: "legacy-project-16-allocation-candidate-line-count-drift",
      details: {
        expected: EXPECTED_ALLOCATION_CANDIDATE_LINE_COUNT,
        actual: stats.allocationCandidateLineCount,
      },
    });
  }
  if (params.mainStockScopeId === null) {
    blockers.push({ reason: "main-stock-scope-missing" });
  }

  const [
    existingProjectMaps,
    existingLineMapCount,
    existingSalesProjectCodes,
    existingProjectTargets,
    existingMaterials,
  ] = await Promise.all([
    loadExistingProjectMaps(params.connection),
    loadExistingLineMapCount(
      params.connection,
      params.project.lines.map((line) => line.legacyId),
    ),
    loadExistingSalesProjectCodes(
      params.connection,
      params.project.target.projectCode,
    ),
    loadExistingProjectTargets(
      params.connection,
      params.project.target.projectCode,
    ),
    loadExistingMaterialsByCode(
      params.connection,
      params.autoCreatedMaterials.map(
        (material) => material.target.materialCode,
      ),
    ),
  ]);

  if (existingProjectMaps.length > 0) {
    blockers.push({
      reason: "legacy-project-16-map-already-exists",
      details: { existingProjectMaps },
    });
  }
  if (existingLineMapCount > 0) {
    blockers.push({
      reason: "legacy-project-16-line-map-already-exists",
      details: { existingLineMapCount },
    });
  }
  if (existingSalesProjectCodes.length > 0) {
    blockers.push({
      reason: "sales-project-code-already-exists",
      details: { existingSalesProjectCodes },
    });
  }
  if (existingProjectTargets.length > 0) {
    blockers.push({
      reason: "sales-project-target-already-exists",
      details: { existingProjectTargets },
    });
  }

  blockers.push(
    ...buildMaterialConflictBlockers(
      params.autoCreatedMaterials,
      existingMaterials,
    ),
  );

  return blockers;
}

async function upsertAutoCreatedMaterial(
  connection: MigrationConnectionLike,
  record: RdProjectAutoCreatedMaterialPlanRecord,
): Promise<number> {
  return runUpsert(
    connection,
    `
      INSERT INTO material (
        material_code,
        material_name,
        spec_model,
        category_id,
        unit_code,
        warning_min_qty,
        warning_max_qty,
        status,
        creation_mode,
        source_document_type,
        source_document_id,
        created_by,
        created_at,
        updated_by,
        updated_at
      ) VALUES (
        ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, COALESCE(?, CURRENT_TIMESTAMP), ?, COALESCE(?, CURRENT_TIMESTAMP)
      )
      ON DUPLICATE KEY UPDATE
        material_name = VALUES(material_name),
        spec_model = VALUES(spec_model),
        category_id = VALUES(category_id),
        unit_code = VALUES(unit_code),
        warning_min_qty = VALUES(warning_min_qty),
        warning_max_qty = VALUES(warning_max_qty),
        status = VALUES(status),
        creation_mode = VALUES(creation_mode),
        source_document_type = VALUES(source_document_type),
        source_document_id = VALUES(source_document_id),
        created_by = VALUES(created_by),
        created_at = COALESCE(VALUES(created_at), created_at),
        updated_by = VALUES(updated_by),
        updated_at = COALESCE(VALUES(updated_at), updated_at),
        id = LAST_INSERT_ID(id)
    `,
    [
      record.target.materialCode,
      record.target.materialName,
      record.target.specModel,
      null,
      record.target.unitCode,
      record.target.warningMinQty,
      record.target.warningMaxQty,
      record.target.status,
      record.target.creationMode,
      record.target.sourceDocumentType,
      record.target.sourceDocumentId,
      record.target.createdBy,
      record.target.createdAt,
      record.target.updatedBy,
      record.target.updatedAt,
    ],
  );
}

async function insertSalesProject(
  connection: MigrationConnectionLike,
  record: RdProjectPlanRecord,
  mainStockScopeId: number,
): Promise<number> {
  return runInsert(
    connection,
    `
      INSERT INTO sales_project (
        sales_project_code,
        sales_project_name,
        biz_date,
        customer_id,
        manager_personnel_id,
        workshop_id,
        stock_scope_id,
        lifecycle_status,
        audit_status_snapshot,
        inventory_effect_status,
        revision_no,
        customer_code_snapshot,
        customer_name_snapshot,
        manager_name_snapshot,
        workshop_name_snapshot,
        total_qty,
        total_amount,
        remark,
        void_reason,
        voided_by,
        voided_at,
        created_by,
        created_at,
        updated_by,
        updated_at
      ) VALUES (
        ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, COALESCE(?, CURRENT_TIMESTAMP), ?, COALESCE(?, CURRENT_TIMESTAMP)
      )
    `,
    [
      record.target.projectCode,
      record.target.projectName,
      record.target.bizDate,
      record.target.customerId,
      record.target.managerPersonnelId,
      record.target.workshopId,
      mainStockScopeId,
      record.target.lifecycleStatus,
      record.target.auditStatusSnapshot,
      record.target.inventoryEffectStatus,
      record.target.revisionNo,
      record.target.customerCodeSnapshot,
      record.target.customerNameSnapshot,
      record.target.managerNameSnapshot,
      record.target.workshopNameSnapshot,
      record.target.totalQty,
      record.target.totalAmount,
      record.target.remark,
      record.target.voidReason,
      record.target.voidedBy,
      record.target.voidedAt,
      record.target.createdBy,
      record.target.createdAt,
      UPDATED_BY,
      record.target.updatedAt ?? record.target.createdAt,
    ],
  );
}

async function insertProjectTarget(
  connection: MigrationConnectionLike,
  record: RdProjectPlanRecord,
  salesProjectId: number,
): Promise<number> {
  return runInsert(
    connection,
    `
      INSERT INTO project_target (
        target_type,
        target_code,
        target_name,
        source_document_type,
        source_document_id,
        is_system_default,
        remark,
        created_by,
        created_at,
        updated_by,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, FALSE, ?, ?, NOW(3), ?, NOW(3))
    `,
    [
      "SALES_PROJECT",
      record.target.projectCode,
      record.target.projectName,
      BusinessDocumentType.SalesProject,
      salesProjectId,
      `Admit repaired legacy sales project ${LEGACY_PROJECT_ID}.`,
      UPDATED_BY,
      UPDATED_BY,
    ],
  );
}

async function attachProjectTarget(
  connection: MigrationConnectionLike,
  salesProjectId: number,
  projectTargetId: number,
): Promise<void> {
  await connection.query(
    `
      UPDATE sales_project
      SET
        project_target_id = ?,
        updated_by = ?,
        updated_at = NOW(3)
      WHERE id = ?
    `,
    [projectTargetId, UPDATED_BY, salesProjectId],
  );
}

async function insertSalesProjectMaterialLine(
  connection: MigrationConnectionLike,
  salesProjectId: number,
  lineRecord: RdProjectLinePlanRecord,
  materialId: number,
): Promise<number> {
  return runInsert(
    connection,
    `
      INSERT INTO sales_project_material_line (
        project_id,
        line_no,
        material_id,
        material_code_snapshot,
        material_name_snapshot,
        material_spec_snapshot,
        unit_code_snapshot,
        quantity,
        unit_price,
        amount,
        remark,
        created_by,
        created_at,
        updated_by,
        updated_at
      ) VALUES (
        ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, COALESCE(?, CURRENT_TIMESTAMP), ?, COALESCE(?, CURRENT_TIMESTAMP)
      )
    `,
    [
      salesProjectId,
      lineRecord.target.lineNo,
      materialId,
      lineRecord.target.materialCodeSnapshot,
      lineRecord.target.materialNameSnapshot,
      lineRecord.target.materialSpecSnapshot,
      lineRecord.target.unitCodeSnapshot,
      lineRecord.target.quantity,
      lineRecord.target.unitPrice,
      lineRecord.target.amount,
      lineRecord.target.remark,
      lineRecord.target.createdBy,
      lineRecord.target.createdAt,
      lineRecord.target.updatedBy,
      lineRecord.target.updatedAt,
    ],
  );
}

async function upsertMapRow(
  connection: MigrationConnectionLike,
  mapTable: "map_project" | "map_project_material_line",
  record: {
    legacyTable: string;
    legacyId: number;
    targetCode: string;
  },
  targetTable: "sales_project" | "sales_project_material_line",
  targetId: number,
): Promise<void> {
  await connection.query(
    `
      INSERT INTO migration_staging.${mapTable} (
        legacy_table,
        legacy_id,
        target_table,
        target_id,
        target_code,
        migration_batch
      ) VALUES (?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        target_table = VALUES(target_table),
        target_id = VALUES(target_id),
        target_code = VALUES(target_code),
        migration_batch = VALUES(migration_batch)
    `,
    [
      record.legacyTable,
      record.legacyId,
      targetTable,
      targetId,
      record.targetCode,
      MIGRATION_BATCH,
    ],
  );
}

async function upsertArchivedPayload(
  connection: MigrationConnectionLike,
  payload: ArchivePayload,
  targetId: number | null,
): Promise<void> {
  await connection.query(
    `
      INSERT INTO migration_staging.archived_field_payload (
        legacy_table,
        legacy_id,
        target_table,
        target_id,
        target_code,
        payload_kind,
        archive_reason,
        payload_json,
        migration_batch
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        target_id = VALUES(target_id),
        target_code = VALUES(target_code),
        payload_kind = VALUES(payload_kind),
        archive_reason = VALUES(archive_reason),
        payload_json = VALUES(payload_json),
        migration_batch = VALUES(migration_batch)
    `,
    [
      payload.legacyTable,
      payload.legacyId,
      payload.targetTable,
      targetId,
      payload.targetCode,
      payload.payloadKind,
      payload.archiveReason,
      stableJsonStringify(payload.payload),
      MIGRATION_BATCH,
    ],
  );
}

function resolveLineMaterialId(
  lineRecord: RdProjectLinePlanRecord,
  autoCreatedMaterialIdsByCode: ReadonlyMap<string, number>,
): number {
  const autoCreatedMaterialId = autoCreatedMaterialIdsByCode.get(
    lineRecord.target.materialCodeSnapshot,
  );
  if (autoCreatedMaterialId !== undefined) return autoCreatedMaterialId;
  if (lineRecord.target.materialId !== null)
    return lineRecord.target.materialId;

  throw new Error(
    `Sales project line ${lineRecord.legacyTable}#${lineRecord.legacyId} references auto-created material ${lineRecord.target.materialCodeSnapshot}, but no material id was available.`,
  );
}

async function executeAdmission(params: {
  connection: MigrationConnectionLike;
  project: RdProjectPlanRecord;
  autoCreatedMaterials: readonly RdProjectAutoCreatedMaterialPlanRecord[];
  mainStockScopeId: number;
}): Promise<ExecuteResult> {
  const autoCreatedMaterialIdsByCode = new Map<string, number>();
  const result: ExecuteResult = {
    insertedOrUpdatedAutoCreatedMaterials: 0,
    insertedSalesProjects: 0,
    insertedSalesProjectMaterialLines: 0,
    insertedProjectTargets: 0,
    archivedPayloadCount: 0,
  };

  await params.connection.beginTransaction();
  try {
    for (const material of params.autoCreatedMaterials) {
      const materialId = await upsertAutoCreatedMaterial(
        params.connection,
        material,
      );
      autoCreatedMaterialIdsByCode.set(
        material.target.materialCode,
        materialId,
      );
      result.insertedOrUpdatedAutoCreatedMaterials += 1;
      await upsertArchivedPayload(
        params.connection,
        material.archivedPayload,
        materialId,
      );
      result.archivedPayloadCount += 1;
    }

    const salesProjectId = await insertSalesProject(
      params.connection,
      params.project,
      params.mainStockScopeId,
    );
    result.insertedSalesProjects += 1;
    const projectTargetId = await insertProjectTarget(
      params.connection,
      params.project,
      salesProjectId,
    );
    result.insertedProjectTargets += 1;
    await attachProjectTarget(
      params.connection,
      salesProjectId,
      projectTargetId,
    );
    await upsertMapRow(
      params.connection,
      "map_project",
      params.project,
      "sales_project",
      salesProjectId,
    );
    await upsertArchivedPayload(
      params.connection,
      payloadForTarget(
        params.project.archivedPayload,
        "sales_project",
        "Archive source-only sales project header fields.",
      ),
      salesProjectId,
    );
    result.archivedPayloadCount += 1;

    for (const line of params.project.lines) {
      const materialId = resolveLineMaterialId(
        line,
        autoCreatedMaterialIdsByCode,
      );
      const lineId = await insertSalesProjectMaterialLine(
        params.connection,
        salesProjectId,
        line,
        materialId,
      );
      result.insertedSalesProjectMaterialLines += 1;
      await upsertMapRow(
        params.connection,
        "map_project_material_line",
        line,
        "sales_project_material_line",
        lineId,
      );
      await upsertArchivedPayload(
        params.connection,
        payloadForTarget(
          line.archivedPayload,
          "sales_project_material_line",
          "Archive source-only sales project material line fields.",
        ),
        lineId,
      );
      result.archivedPayloadCount += 1;
    }

    await params.connection.commit();
  } catch (error) {
    await params.connection.rollback();
    throw error;
  }

  return result;
}

async function main(): Promise<void> {
  const cliOptions = parseMigrationCliOptions();
  const reportPath = resolveReportPath(
    cliOptions,
    cliOptions.execute ? EXECUTE_REPORT_FILE_NAME : DRY_RUN_REPORT_FILE_NAME,
  );
  const env = loadMigrationEnvironment({ requireLegacyDatabaseUrl: true });
  const targetDatabaseName = assertExpectedDatabaseName(
    env.databaseUrl,
    EXPECTED_TARGET_DATABASE_NAME,
    "Target",
  );
  const legacyDatabaseName = assertExpectedDatabaseName(
    env.legacyDatabaseUrl,
    EXPECTED_LEGACY_DATABASE_NAME,
    "Legacy",
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
        const snapshot = await readLegacyRdProjectSnapshot(legacyConnection);
        const dependencies = await withPoolConnection(
          targetPool,
          async (targetConnection) =>
            readRdProjectDependencySnapshot(targetConnection),
        );
        return {
          snapshot,
          plan: buildRdProjectMigrationPlan(snapshot, dependencies),
        };
      },
    );
    const project =
      plan.migratedProjects.find(
        (candidate) => candidate.legacyId === LEGACY_PROJECT_ID,
      ) ?? null;
    const autoCreatedMaterials = project
      ? autoCreatedMaterialsForProject(project, plan.autoCreatedMaterials)
      : [];
    const sourceStats = project
      ? projectAcceptedStats(project, snapshot.lines)
      : { acceptedLineCount: 0, allocationCandidateLineCount: 0 };

    const executionResult = await withPoolConnection(
      targetPool,
      async (connection) => {
        const mainStockScopeId = await loadMainStockScopeId(connection);
        const blockers = await buildBlockers({
          connection,
          project,
          autoCreatedMaterials,
          sourceLines: snapshot.lines,
          mainStockScopeId,
        });

        let executeResult: ExecuteResult | null = null;
        if (cliOptions.execute) {
          if (!cliOptions.allowBlockers && blockers.length > 0) {
            throw new Error(
              `sales-project legacy16 admission blocked: ${blockers
                .map((blocker) => blocker.reason)
                .join(", ")}`,
            );
          }
          if (!project || mainStockScopeId === null) {
            throw new Error(
              "Legacy project 16 admission prerequisites missing.",
            );
          }
          executeResult = await executeAdmission({
            connection,
            project,
            autoCreatedMaterials,
            mainStockScopeId,
          });
        }

        const report = {
          mode: cliOptions.execute ? "execute" : "dry-run",
          targetDatabaseName,
          legacyDatabaseName,
          generatedAt: new Date().toISOString(),
          migrationBatch: MIGRATION_BATCH,
          eligible: blockers.length === 0,
          blockers,
          summary: {
            legacyProjectId: LEGACY_PROJECT_ID,
            projectCode: project?.target.projectCode ?? null,
            projectName: project?.target.projectName ?? null,
            lineCount: project?.lines.length ?? 0,
            acceptedLineCount: sourceStats.acceptedLineCount,
            allocationCandidateLineCount:
              sourceStats.allocationCandidateLineCount,
            autoCreatedMaterialCount: autoCreatedMaterials.length,
            wouldCreateSalesProjects: project ? 1 : 0,
            wouldCreateSalesProjectMaterialLines: project?.lines.length ?? 0,
            wouldCreateProjectTargets: project ? 1 : 0,
          },
          autoCreatedMaterials: autoCreatedMaterials.map((material) => ({
            materialCode: material.target.materialCode,
            materialName: material.target.materialName,
            specModel: material.target.specModel,
            unitCode: material.target.unitCode,
            sourceDocumentType: material.target.sourceDocumentType,
            sourceDocumentId: material.target.sourceDocumentId,
          })),
          executionResult: executeResult,
        };
        writeStableReport(reportPath, report);
        return report;
      },
    );

    console.log(
      `Sales-project legacy16 admission ${executionResult.mode} completed. blockers=${executionResult.blockers.length}, lineCount=${executionResult.summary.lineCount}, report=${reportPath}`,
    );
    if (executionResult.blockers.length > 0) {
      process.exitCode = 1;
    }
  } finally {
    await closePools(legacyPool, targetPool);
  }
}

void main();
