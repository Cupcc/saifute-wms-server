import {
  DEFAULT_WORKSHOP_CODE,
  DEFAULT_WORKSHOP_NAME,
  normalizeOptionalText,
} from "../shared/deterministic";
import type {
  ArchivedFieldPayloadRecord,
  DocumentLifecycleStatusValue,
  ExcludedProjectPlanRecord,
  LegacyProjectLineRow,
  LegacyProjectRow,
  LegacyProjectSnapshot,
  MaterialResolutionEvidence,
  MaterialResolutionRuleId,
  PendingLinePlanRecord,
  PendingProjectPlanRecord,
  ProjectAutoCreatedMaterialPlanRecord,
  ProjectDependencySnapshot,
  ProjectGlobalBlocker,
  ProjectLinePlanRecord,
  ProjectMigrationPlan,
  ProjectPlanCounts,
  ProjectPlanRecord,
  ProjectTargetInsert,
  ProjectWarning,
  ResolvedCustomerDependency,
  ResolvedMaterialDependency,
  ResolvedPersonnelDependency,
  ResolvedWorkshopDependency,
} from "./types";
import {
  PROJECT_AUTO_CREATED_MATERIAL_SOURCE_DOCUMENT_TYPE,
  PROJECT_MIGRATION_BATCH,
} from "./types";

interface ParsedDecimal {
  sign: 1 | -1;
  digits: string;
  scale: number;
}

interface PreparedLine {
  source: LegacyProjectLineRow;
  material: ResolvedMaterialDependency;
  materialNameSnapshot: string;
  materialSpecSnapshot: string | null;
  unitCodeSnapshot: string;
  quantity: string;
  unitPrice: string;
  amount: string;
}

interface PreparedHeaderDependencies {
  customer: ResolvedCustomerDependency | null;
  customerCodeSnapshot: string | null;
  customerNameSnapshot: string | null;
  manager: ResolvedPersonnelDependency | null;
  managerNameSnapshot: string | null;
  workshop: ResolvedWorkshopDependency;
}

interface PreparedStructuredLine {
  quantity: string;
  unitCodeSnapshot: string;
  unitPrice: string;
  amount: string;
}

interface AutoCreatedMaterialGroup {
  normalizedKey: string;
  representativeLine: LegacyProjectLineRow;
  sourceLines: LegacyProjectLineRow[];
}

type LineClassification =
  | { kind: "resolved"; preparedLine: PreparedLine }
  | { kind: "pending"; record: PendingLinePlanRecord }
  | { kind: "structural"; reason: string };

const MATERIAL_CODE_MAX_LENGTH = 64;

function buildLegacyKey(legacyTable: string, legacyId: number): string {
  return `${legacyTable}::${legacyId}`;
}

function buildProjectKey(
  project: Pick<LegacyProjectRow, "legacyTable" | "legacyId">,
): string {
  return buildLegacyKey(project.legacyTable, project.legacyId);
}

function normalizePersonnelLookupName(
  value: string | null | undefined,
): string | null {
  const normalized = normalizeOptionalText(value);
  return normalized ? normalized.replace(/\s+/gu, " ") : null;
}

function parseDecimalInput(
  value: string | number | null | undefined,
): ParsedDecimal | null {
  const normalized = normalizeOptionalText(value);

  if (!normalized) {
    return null;
  }

  const match = normalized.match(/^([+-])?(\d+)(?:\.(\d+))?$/u);

  if (!match) {
    return null;
  }

  const [, signSymbol, integerPartRaw, fractionalPartRaw = ""] = match;
  const digits = `${integerPartRaw}${fractionalPartRaw}`.replace(
    /^0+(?=\d)/u,
    "",
  );
  const normalizedDigits = digits.length > 0 ? digits : "0";
  const sign =
    signSymbol === "-" && normalizedDigits !== "0"
      ? (-1 as const)
      : (1 as const);

  return {
    sign,
    digits: normalizedDigits,
    scale: fractionalPartRaw.length,
  };
}

function pow10(power: number): bigint {
  return 10n ** BigInt(power);
}

function roundScaledInteger(
  value: bigint,
  currentScale: number,
  targetScale: number,
): bigint {
  if (currentScale <= targetScale) {
    return value * pow10(targetScale - currentScale);
  }

  const divisor = pow10(currentScale - targetScale);
  const quotient = value / divisor;
  const remainder = value % divisor;
  const absoluteRemainder = remainder < 0n ? -remainder : remainder;

  if (absoluteRemainder * 2n >= divisor && remainder !== 0n) {
    return quotient + (value >= 0n ? 1n : -1n);
  }

  return quotient;
}

function toScaledInteger(
  value: string | number | null | undefined,
  scale: number,
): bigint | null {
  const parsed = parseDecimalInput(value);

  if (!parsed) {
    return null;
  }

  const signedInteger = BigInt(parsed.digits) * BigInt(parsed.sign);
  return roundScaledInteger(signedInteger, parsed.scale, scale);
}

function formatScaledInteger(value: bigint, scale: number): string {
  const isNegative = value < 0n;
  const absoluteValue = isNegative ? -value : value;
  const rawDigits = absoluteValue.toString().padStart(scale + 1, "0");

  if (scale === 0) {
    return `${isNegative ? "-" : ""}${rawDigits}`;
  }

  const integerPart = rawDigits.slice(0, -scale) || "0";
  const fractionalPart = rawDigits.slice(-scale);
  return `${isNegative ? "-" : ""}${integerPart}.${fractionalPart}`;
}

function normalizeDecimalToScale(
  value: string | number | null | undefined,
  scale: number,
): string | null {
  const scaledInteger = toScaledInteger(value, scale);
  return scaledInteger === null
    ? null
    : formatScaledInteger(scaledInteger, scale);
}

function sumDecimalValues(
  values: Array<string | number | null | undefined>,
  scale: number,
): string {
  const total = values.reduce<bigint>((runningTotal, value) => {
    const scaledInteger = toScaledInteger(value, scale);
    return runningTotal + (scaledInteger ?? 0n);
  }, 0n);

  return formatScaledInteger(total, scale);
}

function multiplyToAmount(
  left: string | number | null | undefined,
  right: string | number | null | undefined,
): string | null {
  const parsedLeft = parseDecimalInput(left);
  const parsedRight = parseDecimalInput(right);

  if (!parsedLeft || !parsedRight) {
    return null;
  }

  const sign =
    parsedLeft.sign * parsedRight.sign >= 0 ? (1 as const) : (-1 as const);
  const product =
    BigInt(parsedLeft.digits) * BigInt(parsedRight.digits) * BigInt(sign);
  return formatScaledInteger(
    roundScaledInteger(product, parsedLeft.scale + parsedRight.scale, 2),
    2,
  );
}

function normalizeDate(value: string | null | undefined): string | null {
  const normalized = normalizeOptionalText(value);

  if (!normalized) {
    return null;
  }

  const match = normalized.match(/^(\d{4}-\d{2}-\d{2})/u);
  return match?.[1] ?? null;
}

function normalizeDateTime(value: string | null | undefined): string | null {
  const normalized = normalizeOptionalText(value);

  if (!normalized) {
    return null;
  }

  return normalized.length >= 19 ? normalized.slice(0, 19) : normalized;
}

function normalizePositiveLegacyId(
  value: string | number | null | undefined,
): number | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const numericValue = Number(value);

  if (!Number.isFinite(numericValue) || numericValue <= 0) {
    return null;
  }

  return numericValue;
}

function buildProjectCode(legacyId: number): string {
  return `PRJ-LEGACY-${legacyId}`;
}

function resolveBizDate(project: LegacyProjectRow): string | null {
  return (
    normalizeDate(project.orderDate) ??
    normalizeDate(project.outBoundDate) ??
    normalizeDate(project.createdAt)
  );
}

function toLifecycleStatus(
  delFlag: string | number | null | undefined,
): DocumentLifecycleStatusValue {
  return String(delFlag ?? "0") === "2" ? "VOIDED" : "EFFECTIVE";
}

function buildLinesByProjectKey(
  lines: readonly LegacyProjectLineRow[],
): Map<string, LegacyProjectLineRow[]> {
  const linesByProjectKey = new Map<string, LegacyProjectLineRow[]>();

  for (const line of [...lines].sort(
    (left, right) =>
      left.parentLegacyTable.localeCompare(right.parentLegacyTable) ||
      left.parentLegacyId - right.parentLegacyId ||
      left.legacyId - right.legacyId,
  )) {
    const projectKey = buildLegacyKey(
      line.parentLegacyTable,
      line.parentLegacyId,
    );
    const existingLines = linesByProjectKey.get(projectKey) ?? [];
    existingLines.push(line);
    linesByProjectKey.set(projectKey, existingLines);
  }

  return linesByProjectKey;
}

function buildProjectArchivedPayload(
  project: LegacyProjectRow,
  targetProjectCode: string,
): ArchivedFieldPayloadRecord {
  return {
    legacyTable: project.legacyTable,
    legacyId: project.legacyId,
    targetTable: "project",
    targetCode: targetProjectCode,
    payloadKind: "legacy-unmapped-fields",
    archiveReason: "Archive source-only project header fields.",
    payload: {
      classification: normalizeOptionalText(project.classification),
      salesman: normalizeOptionalText(project.salesman),
      outBoundDate: normalizeDate(project.outBoundDate),
    },
  };
}

function buildLineArchivedPayload(
  line: LegacyProjectLineRow,
  targetCode: string,
): ArchivedFieldPayloadRecord {
  return {
    legacyTable: line.legacyTable,
    legacyId: line.legacyId,
    targetTable: "project_material_line",
    targetCode,
    payloadKind: "legacy-unmapped-fields",
    archiveReason: "Archive source-only project material line fields.",
    payload: {
      acceptanceDate: normalizeDate(line.acceptanceDate),
      instruction: normalizeOptionalText(line.instruction),
      interval: normalizeOptionalText(line.interval),
      supplierLegacyId: normalizePositiveLegacyId(line.supplierLegacyId),
      taxIncludedPrice: normalizeDecimalToScale(line.taxIncludedPrice, 2),
    },
  };
}

function buildExcludedProjectPlan(
  project: LegacyProjectRow,
  lines: readonly LegacyProjectLineRow[],
  targetProjectCodeCandidate: string,
  exclusionReasons: string[],
): ExcludedProjectPlanRecord {
  return {
    legacyTable: project.legacyTable,
    legacyId: project.legacyId,
    exclusionReason: exclusionReasons.join("; "),
    payload: {
      targetProjectCodeCandidate,
      projectName: normalizeOptionalText(project.projectName),
      customerLegacyId: normalizePositiveLegacyId(project.customerLegacyId),
      customerName: normalizeOptionalText(project.customerName),
      classification: normalizeOptionalText(project.classification),
      salesman: normalizeOptionalText(project.salesman),
      totalAmount: normalizeDecimalToScale(project.totalAmount, 2),
      orderDate: normalizeDate(project.orderDate),
      outBoundDate: normalizeDate(project.outBoundDate),
      bizDate: resolveBizDate(project),
      remark: normalizeOptionalText(project.remark),
      lifecycleStatus: toLifecycleStatus(project.delFlag),
      createdBy: normalizeOptionalText(project.createdBy),
      createdAt: normalizeDateTime(project.createdAt),
      updatedBy: normalizeOptionalText(project.updatedBy),
      updatedAt: normalizeDateTime(project.updatedAt),
      exclusionReasons,
      lines: lines.map((line) => ({
        legacyTable: line.legacyTable,
        legacyId: line.legacyId,
        materialLegacyId: normalizePositiveLegacyId(line.materialLegacyId),
        materialName: normalizeOptionalText(line.materialName),
        materialSpec: normalizeOptionalText(line.materialSpec),
        quantity: normalizeDecimalToScale(line.quantity, 6),
        unitPrice:
          normalizeDecimalToScale(line.unitPrice, 2) ??
          formatScaledInteger(0n, 2),
        remark: normalizeOptionalText(line.remark),
        unit: normalizeOptionalText(line.unit),
        acceptanceDate: normalizeDate(line.acceptanceDate),
        supplierLegacyId: normalizePositiveLegacyId(line.supplierLegacyId),
        taxIncludedPrice: normalizeDecimalToScale(line.taxIncludedPrice, 2),
        instruction: normalizeOptionalText(line.instruction),
        interval: normalizeOptionalText(line.interval),
      })),
    },
  };
}

function buildPendingLineSourcePayload(
  line: LegacyProjectLineRow,
): Record<string, unknown> {
  return {
    materialLegacyId: normalizePositiveLegacyId(line.materialLegacyId),
    materialName: normalizeOptionalText(line.materialName),
    materialSpec: normalizeOptionalText(line.materialSpec),
    quantity: normalizeDecimalToScale(line.quantity, 6),
    unitPrice:
      normalizeDecimalToScale(line.unitPrice, 2) ?? formatScaledInteger(0n, 2),
    unit: normalizeOptionalText(line.unit),
    supplierLegacyId: normalizePositiveLegacyId(line.supplierLegacyId),
    acceptanceDate: normalizeDate(line.acceptanceDate),
    instruction: normalizeOptionalText(line.instruction),
    interval: normalizeOptionalText(line.interval),
    remark: normalizeOptionalText(line.remark),
    taxIncludedPrice: normalizeDecimalToScale(line.taxIncludedPrice, 2),
  };
}

function buildPendingLinePlan(
  line: LegacyProjectLineRow,
  ruleId: MaterialResolutionRuleId,
  pendingReason: string,
  evidence: Omit<
    MaterialResolutionEvidence,
    "ruleId" | "resolved" | "pendingReason"
  >,
): PendingLinePlanRecord {
  return {
    legacyTable: line.legacyTable,
    legacyId: line.legacyId,
    parentLegacyTable: line.parentLegacyTable,
    parentLegacyId: line.parentLegacyId,
    pendingReason,
    resolutionEvidence: {
      ruleId,
      resolved: false,
      pendingReason,
      ...evidence,
    },
    sourcePayload: buildPendingLineSourcePayload(line),
  };
}

/**
 * Build a lookup key from normalized material name, spec, and unit.
 * All three components are required to be deterministic; null/empty values
 * are represented as empty strings so the key remains stable.
 */
function buildNormalizedNameSpecUnitKey(
  name: string | null | undefined,
  spec: string | null | undefined,
  unit: string | null | undefined,
): string {
  const normalizedName = normalizeOptionalText(name) ?? "";
  const normalizedSpec = normalizeOptionalText(spec) ?? "";
  const normalizedUnit = normalizeOptionalText(unit) ?? "";
  return `${normalizedName}|${normalizedSpec}|${normalizedUnit}`;
}

/**
 * Build an inverse index from the batch1 material map keyed by
 * normalized name+spec+unit. Used only for the deterministic fallback
 * when a line has no materialLegacyId but does have a material name.
 * All materials in the map are non-blocked (blocked materials are never
 * inserted into map_material).
 */
function buildMaterialNameSpecUnitIndex(
  materialByLegacyKey: Map<string, ResolvedMaterialDependency>,
): Map<string, ResolvedMaterialDependency[]> {
  const index = new Map<string, ResolvedMaterialDependency[]>();

  for (const material of materialByLegacyKey.values()) {
    const key = buildNormalizedNameSpecUnitKey(
      material.materialName,
      material.specModel,
      material.unitCode,
    );
    const existing = index.get(key) ?? [];
    existing.push(material);
    index.set(key, existing);
  }

  return index;
}

function buildStructuredLine(
  line: LegacyProjectLineRow,
):
  | { kind: "valid"; prepared: PreparedStructuredLine }
  | { kind: "structural"; reason: string } {
  const quantity = normalizeDecimalToScale(line.quantity, 6);
  if (!quantity) {
    return {
      kind: "structural",
      reason: `Line ${line.legacyTable}#${line.legacyId} quantity is required.`,
    };
  }

  const unitCodeSnapshot = normalizeOptionalText(line.unit);
  if (!unitCodeSnapshot) {
    return {
      kind: "structural",
      reason: `Line ${line.legacyTable}#${line.legacyId} unit is required for unitCodeSnapshot.`,
    };
  }

  const unitPrice =
    normalizeDecimalToScale(line.unitPrice, 2) ?? formatScaledInteger(0n, 2);
  const amount = multiplyToAmount(quantity, unitPrice);
  if (!amount) {
    return {
      kind: "structural",
      reason: `Line ${line.legacyTable}#${line.legacyId} amount could not be derived deterministically.`,
    };
  }

  return {
    kind: "valid",
    prepared: {
      quantity,
      unitCodeSnapshot,
      unitPrice,
      amount,
    },
  };
}

function createStableHexHash(value: string): string {
  let hash = 2166136261;

  for (const char of value) {
    const codePoint = char.codePointAt(0) ?? 0;
    hash ^= codePoint;
    hash = Math.imul(hash, 16777619) >>> 0;
  }

  return hash.toString(16).toUpperCase().padStart(8, "0");
}

function normalizeMaterialCodeKey(code: string): string {
  return (normalizeOptionalText(code) ?? "").toLocaleLowerCase("en-US");
}

function trimMaterialCodeWithSuffix(baseCode: string, suffix: string): string {
  const maxBaseLength = MATERIAL_CODE_MAX_LENGTH - suffix.length;

  if (maxBaseLength <= 0) {
    throw new Error(
      `Material code suffix ${suffix} exceeds the column length.`,
    );
  }

  return `${baseCode.slice(0, maxBaseLength)}${suffix}`;
}

function allocateProjectAutoCreatedMaterialCode(
  seedCode: string,
  reservedKeys: ReadonlySet<string>,
  assignedKeys: Set<string>,
): string {
  let attempt = 0;

  while (true) {
    const candidateCode =
      attempt === 0
        ? trimMaterialCodeWithSuffix(seedCode, "")
        : trimMaterialCodeWithSuffix(seedCode, `-DUP-${attempt}`);
    const candidateKey = normalizeMaterialCodeKey(candidateCode);

    if (!reservedKeys.has(candidateKey) && !assignedKeys.has(candidateKey)) {
      assignedKeys.add(candidateKey);
      return candidateCode;
    }

    attempt += 1;
  }
}

function buildProjectAutoCreatedMaterialCodeSeed(
  representativeLine: LegacyProjectLineRow,
  normalizedKey: string,
): string {
  return `MAT-PROJECT-AUTO-L${representativeLine.legacyId}-${createStableHexHash(normalizedKey)}`;
}

function buildProjectAutoCreatedMaterialArchivedPayload(
  group: AutoCreatedMaterialGroup,
  targetCode: string,
): ArchivedFieldPayloadRecord {
  const representativeLine = group.representativeLine;

  return {
    legacyTable: representativeLine.legacyTable,
    legacyId: representativeLine.legacyId,
    targetTable: "material",
    targetCode,
    payloadKind: "project-auto-created-material",
    archiveReason:
      "Auto-create deterministic project material because no existing target material matches normalized name/spec/unit.",
    payload: {
      normalizedKey: group.normalizedKey,
      representativeLineLegacyId: representativeLine.legacyId,
      representativeProjectLegacyId: representativeLine.parentLegacyId,
      sourceLineCount: group.sourceLines.length,
      sourceLines: [...group.sourceLines]
        .sort((left, right) => left.legacyId - right.legacyId)
        .map((line) => ({
          projectLegacyId: line.parentLegacyId,
          lineLegacyId: line.legacyId,
          resolutionRuleId: "auto-created-project-material",
          ...buildPendingLineSourcePayload(line),
        })),
    },
  };
}

function buildAutoCreatedMaterialGroups(
  lines: readonly LegacyProjectLineRow[],
  dependencies: ProjectDependencySnapshot,
  materialNameSpecUnitIndex: Map<string, ResolvedMaterialDependency[]>,
): AutoCreatedMaterialGroup[] {
  const groupedMaterials = new Map<string, AutoCreatedMaterialGroup>();

  for (const line of [...lines].sort(
    (left, right) => left.legacyId - right.legacyId,
  )) {
    const structuredLine = buildStructuredLine(line);
    if (structuredLine.kind === "structural") {
      continue;
    }

    const materialLegacyId = normalizePositiveLegacyId(line.materialLegacyId);
    if (materialLegacyId !== null) {
      continue;
    }

    const lineName = normalizeOptionalText(line.materialName);
    if (!lineName) {
      continue;
    }

    const normalizedKey = buildNormalizedNameSpecUnitKey(
      lineName,
      line.materialSpec,
      structuredLine.prepared.unitCodeSnapshot,
    );
    const existingAutoCreatedMaterial =
      dependencies.autoCreatedMaterialByNormalizedKey.get(normalizedKey) ??
      null;
    const candidates = materialNameSpecUnitIndex.get(normalizedKey) ?? [];
    if (!existingAutoCreatedMaterial && candidates.length !== 0) {
      continue;
    }

    const existingGroup = groupedMaterials.get(normalizedKey);
    if (existingGroup) {
      existingGroup.sourceLines.push(line);
      continue;
    }

    groupedMaterials.set(normalizedKey, {
      normalizedKey,
      representativeLine: line,
      sourceLines: [line],
    });
  }

  return [...groupedMaterials.values()].sort(
    (left, right) =>
      left.representativeLine.legacyId - right.representativeLine.legacyId ||
      left.normalizedKey.localeCompare(right.normalizedKey),
  );
}

function buildProjectAutoCreatedMaterialPlans(
  snapshot: LegacyProjectSnapshot,
  dependencies: ProjectDependencySnapshot,
  materialNameSpecUnitIndex: Map<string, ResolvedMaterialDependency[]>,
): {
  autoCreatedMaterials: ProjectAutoCreatedMaterialPlanRecord[];
  autoCreatedMaterialByNormalizedKey: Map<string, ResolvedMaterialDependency>;
} {
  const groups = buildAutoCreatedMaterialGroups(
    snapshot.lines,
    dependencies,
    materialNameSpecUnitIndex,
  );
  const reservedKeys = new Set(
    [...dependencies.existingMaterialCodes].map((code) =>
      normalizeMaterialCodeKey(code),
    ),
  );
  const assignedKeys = new Set<string>();
  const autoCreatedMaterialByNormalizedKey = new Map(
    dependencies.autoCreatedMaterialByNormalizedKey,
  );
  const autoCreatedMaterials = groups.map((group) => {
    const representativeLine = group.representativeLine;
    const existingAutoCreatedMaterial =
      dependencies.autoCreatedMaterialByNormalizedKey.get(
        group.normalizedKey,
      ) ?? null;
    const materialName = normalizeOptionalText(representativeLine.materialName);
    const unitCode = normalizeOptionalText(representativeLine.unit);

    if (!materialName || !unitCode) {
      throw new Error(
        `Auto-created project material ${representativeLine.legacyTable}#${representativeLine.legacyId} is missing materialName or unit.`,
      );
    }

    const targetCode =
      existingAutoCreatedMaterial?.materialCode ??
      allocateProjectAutoCreatedMaterialCode(
        buildProjectAutoCreatedMaterialCodeSeed(
          representativeLine,
          group.normalizedKey,
        ),
        reservedKeys,
        assignedKeys,
      );
    const record: ProjectAutoCreatedMaterialPlanRecord = {
      normalizedKey: group.normalizedKey,
      representativeLineLegacyId: representativeLine.legacyId,
      targetTable: "material",
      targetCode,
      target: {
        materialCode: targetCode,
        materialName,
        specModel: normalizeOptionalText(representativeLine.materialSpec),
        unitCode,
        warningMinQty: null,
        warningMaxQty: null,
        status: "ACTIVE",
        creationMode: "AUTO_CREATED",
        sourceDocumentType: PROJECT_AUTO_CREATED_MATERIAL_SOURCE_DOCUMENT_TYPE,
        sourceDocumentId: representativeLine.legacyId,
        createdBy: PROJECT_MIGRATION_BATCH,
        createdAt: null,
        updatedBy: PROJECT_MIGRATION_BATCH,
        updatedAt: null,
      },
      archivedPayload: buildProjectAutoCreatedMaterialArchivedPayload(
        group,
        targetCode,
      ),
    };

    autoCreatedMaterialByNormalizedKey.set(group.normalizedKey, {
      targetId: existingAutoCreatedMaterial?.targetId ?? null,
      materialCode: targetCode,
      materialName,
      specModel: record.target.specModel,
      unitCode,
    });

    return record;
  });

  return {
    autoCreatedMaterials,
    autoCreatedMaterialByNormalizedKey,
  };
}

/**
 * Classify a single line as resolved, pending (material issue), or structural
 * (non-material issue that blocks the whole project).
 *
 * Structural field checks (quantity, unit, amount) always take precedence.
 * A line that fails structural validation is returned as "structural" regardless
 * of whether material resolution would also fail, preventing mixed-invalid rows
 * from entering the recoverable pending backlog.
 *
 * Resolution order once structural checks pass:
 *   1. Primary: materialLegacyId → batch1 map (blocked → pending-blocked-material;
 *      absent → pending-missing-from-map; present → resolved via legacy-material-id)
 *   2. Deterministic fallback (only when materialLegacyId is null and materialName present):
 *      normalised name+spec+unit against batch1 map.
 *      - exactly 1 candidate → resolved via unique-normalized-name-spec-unit
 *      - 0 candidates        → pending-no-candidate
 *      - >1 candidates       → pending-ambiguous-candidate (with candidateSummary)
 *   3. No-evidence fallback: materialId null AND materialName absent → pending-null-material-id
 */
function classifyLine(
  line: LegacyProjectLineRow,
  dependencies: ProjectDependencySnapshot,
  materialNameSpecUnitIndex: Map<string, ResolvedMaterialDependency[]>,
  autoCreatedMaterialByNormalizedKey: Map<string, ResolvedMaterialDependency>,
): LineClassification {
  const structuredLine = buildStructuredLine(line);
  if (structuredLine.kind === "structural") {
    return structuredLine;
  }

  // Material resolution follows after structural validity is confirmed.
  const materialLegacyId = normalizePositiveLegacyId(line.materialLegacyId);
  let material: ResolvedMaterialDependency | null = null;

  if (materialLegacyId !== null) {
    if (dependencies.blockedMaterialLegacyIds.has(materialLegacyId)) {
      return {
        kind: "pending",
        record: buildPendingLinePlan(
          line,
          "pending-blocked-material",
          `pending-blocked-material: material ${materialLegacyId} is a blocked batch1 material`,
          {
            materialLegacyId,
            targetMaterialId: null,
            targetMaterialCode: null,
          },
        ),
      };
    }

    material =
      dependencies.materialByLegacyKey.get(
        buildLegacyKey("saifute_material", materialLegacyId),
      ) ?? null;

    if (!material) {
      return {
        kind: "pending",
        record: buildPendingLinePlan(
          line,
          "pending-missing-from-map",
          `pending-missing-from-map: material ${materialLegacyId} is absent from the batch1 material map`,
          {
            materialLegacyId,
            targetMaterialId: null,
            targetMaterialCode: null,
          },
        ),
      };
    }
  } else {
    const lineName = normalizeOptionalText(line.materialName);

    if (!lineName) {
      return {
        kind: "pending",
        record: buildPendingLinePlan(
          line,
          "pending-null-material-id",
          "pending-null-material-id: material_id is null; no legacy key or name evidence to recover target material",
          {
            materialLegacyId: null,
            targetMaterialId: null,
            targetMaterialCode: null,
          },
        ),
      };
    }

    const lineSpec = normalizeOptionalText(line.materialSpec);
    const key = buildNormalizedNameSpecUnitKey(
      lineName,
      lineSpec,
      structuredLine.prepared.unitCodeSnapshot,
    );
    material = autoCreatedMaterialByNormalizedKey.get(key) ?? null;

    if (!material) {
      const candidates = materialNameSpecUnitIndex.get(key) ?? [];

      if (candidates.length === 0) {
        return {
          kind: "pending",
          record: buildPendingLinePlan(
            line,
            "pending-no-candidate",
            `pending-no-candidate: no material in batch1 map matches name=${lineName} spec=${lineSpec ?? ""} unit=${structuredLine.prepared.unitCodeSnapshot}`,
            {
              materialLegacyId: null,
              targetMaterialId: null,
              targetMaterialCode: null,
              candidateSummary: [],
            },
          ),
        };
      }

      if (candidates.length > 1) {
        const candidateSummary = candidates.map((m) => ({
          materialCode: m.materialCode,
          materialName: m.materialName,
          specModel: m.specModel,
          unitCode: m.unitCode,
        }));
        return {
          kind: "pending",
          record: buildPendingLinePlan(
            line,
            "pending-ambiguous-candidate",
            `pending-ambiguous-candidate: ${candidates.length} materials in batch1 map match name=${lineName} spec=${lineSpec ?? ""} unit=${structuredLine.prepared.unitCodeSnapshot}`,
            {
              materialLegacyId: null,
              targetMaterialId: null,
              targetMaterialCode: null,
              candidateSummary,
            },
          ),
        };
      }

      const [singleCandidate] = candidates;
      if (!singleCandidate) {
        throw new Error(
          `Expected a single batch1 material candidate for ${line.legacyTable}#${line.legacyId}, but none was available.`,
        );
      }

      material = singleCandidate;
    }
  }

  return {
    kind: "resolved",
    preparedLine: {
      source: line,
      material,
      materialNameSnapshot:
        normalizeOptionalText(line.materialName) ?? material.materialName,
      materialSpecSnapshot:
        normalizeOptionalText(line.materialSpec) ?? material.specModel,
      unitCodeSnapshot: structuredLine.prepared.unitCodeSnapshot,
      quantity: structuredLine.prepared.quantity,
      unitPrice: structuredLine.prepared.unitPrice,
      amount: structuredLine.prepared.amount,
    },
  };
}

function buildPendingProjectPlan(
  project: LegacyProjectRow,
  allLines: readonly LegacyProjectLineRow[],
  resolvedLines: readonly PreparedLine[],
  pendingLines: readonly PendingLinePlanRecord[],
  projectCode: string,
): PendingProjectPlanRecord {
  const ruleBreakdown: Record<string, number> = {};
  for (const pendingLine of pendingLines) {
    const ruleId = pendingLine.resolutionEvidence.ruleId;
    ruleBreakdown[ruleId] = (ruleBreakdown[ruleId] ?? 0) + 1;
  }

  const summaryPayload: Record<string, unknown> = {
    targetProjectCodeCandidate: projectCode,
    projectName: normalizeOptionalText(project.projectName),
    totalLineCount: allLines.length,
    resolvedLineCount: resolvedLines.length,
    pendingLineCount: pendingLines.length,
    pendingRuleBreakdown: Object.fromEntries(
      Object.entries(ruleBreakdown).sort(([a], [b]) => a.localeCompare(b)),
    ),
    pendingLinesEvidence: pendingLines.map((pl) => ({
      legacyLineId: pl.legacyId,
      ruleId: pl.resolutionEvidence.ruleId,
      materialLegacyId: pl.resolutionEvidence.materialLegacyId,
      pendingReason: pl.pendingReason,
    })),
  };

  return {
    legacyTable: project.legacyTable,
    legacyId: project.legacyId,
    targetProjectCodeCandidate: projectCode,
    resolvedLineCount: resolvedLines.length,
    pendingLineCount: pendingLines.length,
    pendingLines: [...pendingLines],
    summaryArchivedPayload: {
      legacyTable: project.legacyTable,
      legacyId: project.legacyId,
      targetTable: "project",
      targetCode: projectCode,
      payloadKind: "pending-material-resolution-summary",
      archiveReason:
        "Pending project — at least one line lacks a uniquely provable material mapping.",
      payload: summaryPayload,
    },
  };
}

function pushGlobalBlockers(
  globalBlockers: ProjectGlobalBlocker[],
  dependencies: ProjectDependencySnapshot,
): void {
  for (const issue of dependencies.batch1Baseline.issues) {
    globalBlockers.push({
      reason: issue,
    });
  }

  if (!dependencies.defaultWorkshop) {
    globalBlockers.push({
      reason:
        "Frozen default workshop is missing from the migrated workshop staging map.",
      details: {
        expectedWorkshopCode: DEFAULT_WORKSHOP_CODE,
        expectedWorkshopName: DEFAULT_WORKSHOP_NAME,
      },
    });
  }

  for (const conflict of dependencies.autoCreatedMaterialConflicts) {
    globalBlockers.push({
      reason:
        "Project auto-created material baseline is ambiguous: multiple AUTO_CREATED target materials share the same normalized name/spec/unit key.",
      details: {
        normalizedKey: conflict.normalizedKey,
        materialCodes: conflict.materialCodes,
      },
    });
  }
}

function pushDependencyWarnings(
  warnings: ProjectWarning[],
  dependencies: ProjectDependencySnapshot,
): void {
  for (const ambiguousName of Array.from(
    dependencies.ambiguousPersonnelNames,
  ).sort((left, right) => left.localeCompare(right))) {
    warnings.push({
      legacyTable: "personnel",
      legacyId: null,
      reason:
        "Target personnel snapshot contains ambiguous names; manager matches will preserve managerNameSnapshot without managerPersonnelId.",
      details: {
        personnelName: ambiguousName,
      },
    });
  }
}

function resolveHeaderDependencies(
  project: LegacyProjectRow,
  dependencies: ProjectDependencySnapshot,
  exclusionReasons: string[],
  warnings: ProjectWarning[],
): PreparedHeaderDependencies | null {
  const customerLegacyId = normalizePositiveLegacyId(project.customerLegacyId);
  const legacyCustomerName = normalizeOptionalText(project.customerName);
  const normalizedSalesman = normalizePersonnelLookupName(project.salesman);
  const workshop = dependencies.defaultWorkshop;

  if (!workshop) {
    exclusionReasons.push(
      "Frozen default workshop is unavailable in the migrated workshop staging map.",
    );
    return null;
  }

  let customer: ResolvedCustomerDependency | null = null;
  let customerCodeSnapshot: string | null = null;
  let customerNameSnapshot: string | null = legacyCustomerName;

  if (customerLegacyId !== null) {
    customer =
      dependencies.customerByLegacyKey.get(
        buildLegacyKey("saifute_customer", customerLegacyId),
      ) ?? null;

    if (!customer) {
      warnings.push({
        legacyTable: project.legacyTable,
        legacyId: project.legacyId,
        reason:
          "Customer dependency is missing from the batch1 customer map; preserving customer snapshot without customerId.",
        details: {
          customerLegacyId,
          customerName: legacyCustomerName,
        },
      });
    } else {
      customerCodeSnapshot = customer.customerCode;
      customerNameSnapshot = customer.customerName;
    }
  }

  let manager: ResolvedPersonnelDependency | null = null;
  let managerNameSnapshot: string | null = normalizeOptionalText(
    project.salesman,
  );

  if (normalizedSalesman !== null) {
    if (dependencies.ambiguousPersonnelNames.has(normalizedSalesman)) {
      warnings.push({
        legacyTable: project.legacyTable,
        legacyId: project.legacyId,
        reason:
          "Manager personnel name is ambiguous in the migrated personnel snapshot; preserving managerNameSnapshot without managerPersonnelId.",
        details: {
          salesman: normalizedSalesman,
        },
      });
    } else {
      manager =
        dependencies.personnelByNormalizedName.get(normalizedSalesman) ?? null;

      if (!manager) {
        warnings.push({
          legacyTable: project.legacyTable,
          legacyId: project.legacyId,
          reason:
            "Manager personnel name is missing from the migrated personnel snapshot; preserving managerNameSnapshot without managerPersonnelId.",
          details: {
            salesman: normalizedSalesman,
          },
        });
      } else {
        managerNameSnapshot = manager.personnelName;
      }
    }
  }

  return {
    customer,
    customerCodeSnapshot,
    customerNameSnapshot,
    manager,
    managerNameSnapshot,
    workshop,
  };
}

function buildCounts(
  snapshot: LegacyProjectSnapshot,
  migratedProjects: readonly ProjectPlanRecord[],
  pendingProjects: readonly PendingProjectPlanRecord[],
  excludedProjects: readonly ExcludedProjectPlanRecord[],
): ProjectPlanCounts {
  return {
    projects: {
      source: snapshot.projects.length,
      migrated: migratedProjects.length,
      pending: pendingProjects.length,
      excluded: excludedProjects.length,
    },
    lines: {
      source: snapshot.lines.length,
      migrated: migratedProjects.reduce(
        (total, project) => total + project.lines.length,
        0,
      ),
      pending: pendingProjects.reduce(
        (total, project) =>
          total + project.pendingLineCount + project.resolvedLineCount,
        0,
      ),
      excluded: excludedProjects.reduce((total, project) => {
        const lines = project.payload.lines;
        return total + (Array.isArray(lines) ? lines.length : 0);
      }, 0),
    },
    sourceProjectTables: {
      saifute_composite_product: snapshot.projects.length,
    },
    sourceLineTables: {
      saifute_product_material: snapshot.lines.length,
    },
  };
}

function buildPendingRuleBreakdown(
  pendingProjects: readonly PendingProjectPlanRecord[],
): Record<string, number> {
  const breakdown = new Map<string, number>();
  for (const project of pendingProjects) {
    for (const line of project.pendingLines) {
      const ruleId = line.resolutionEvidence.ruleId;
      breakdown.set(ruleId, (breakdown.get(ruleId) ?? 0) + 1);
    }
  }
  return Object.fromEntries(
    [...breakdown.entries()].sort(([a], [b]) => a.localeCompare(b)),
  );
}

export function buildProjectMigrationPlan(
  snapshot: LegacyProjectSnapshot,
  dependencies: ProjectDependencySnapshot,
): ProjectMigrationPlan {
  const warnings: ProjectWarning[] = [];
  const globalBlockers: ProjectGlobalBlocker[] = [];
  const migratedProjects: ProjectPlanRecord[] = [];
  const pendingProjects: PendingProjectPlanRecord[] = [];
  const excludedProjects: ExcludedProjectPlanRecord[] = [];
  const linesByProjectKey = buildLinesByProjectKey(snapshot.lines);
  const materialNameSpecUnitIndex = buildMaterialNameSpecUnitIndex(
    dependencies.materialByLegacyKey,
  );
  const { autoCreatedMaterials, autoCreatedMaterialByNormalizedKey } =
    buildProjectAutoCreatedMaterialPlans(
      snapshot,
      dependencies,
      materialNameSpecUnitIndex,
    );

  pushGlobalBlockers(globalBlockers, dependencies);
  pushDependencyWarnings(warnings, dependencies);

  for (const project of [...snapshot.projects].sort(
    (left, right) =>
      left.legacyTable.localeCompare(right.legacyTable) ||
      left.legacyId - right.legacyId,
  )) {
    const projectCode = buildProjectCode(project.legacyId);
    const projectKey = buildProjectKey(project);
    const lines = linesByProjectKey.get(projectKey) ?? [];

    const headerStructuralReasons: string[] = [];

    const projectName = normalizeOptionalText(project.projectName);
    if (!projectName) {
      headerStructuralReasons.push("Project name is required.");
    }

    const bizDate = resolveBizDate(project);
    if (!bizDate) {
      headerStructuralReasons.push(
        "Business date is required from order_date, out_bound_date, or create_time.",
      );
    }

    if (lines.length === 0) {
      headerStructuralReasons.push(
        "No legacy line rows were found for this project.",
      );
    }

    const resolvedDependencies = resolveHeaderDependencies(
      project,
      dependencies,
      headerStructuralReasons,
      warnings,
    );

    const sortedLines = [...lines].sort(
      (left, right) => left.legacyId - right.legacyId,
    );

    const lineClassifications = sortedLines.map((line) =>
      classifyLine(
        line,
        dependencies,
        materialNameSpecUnitIndex,
        autoCreatedMaterialByNormalizedKey,
      ),
    );

    const lineStructuralReasons: string[] = [];
    const pendingLinePlans: PendingLinePlanRecord[] = [];
    const resolvedPreparedLines: PreparedLine[] = [];

    for (const classification of lineClassifications) {
      if (classification.kind === "structural") {
        lineStructuralReasons.push(classification.reason);
      } else if (classification.kind === "pending") {
        pendingLinePlans.push(classification.record);
      } else {
        resolvedPreparedLines.push(classification.preparedLine);
      }
    }

    const allStructuralReasons = [
      ...headerStructuralReasons,
      ...lineStructuralReasons,
    ];

    if (allStructuralReasons.length > 0 || !resolvedDependencies) {
      excludedProjects.push(
        buildExcludedProjectPlan(
          project,
          lines,
          projectCode,
          allStructuralReasons,
        ),
      );
      continue;
    }

    if (pendingLinePlans.length > 0) {
      pendingProjects.push(
        buildPendingProjectPlan(
          project,
          lines,
          resolvedPreparedLines,
          pendingLinePlans,
          projectCode,
        ),
      );
      continue;
    }

    const lifecycleStatus = toLifecycleStatus(project.delFlag);
    const createdAt = normalizeDateTime(project.createdAt);
    const updatedAt = normalizeDateTime(project.updatedAt) ?? createdAt;

    if (!projectName || !bizDate) {
      throw new Error(
        `Project ${project.legacyTable}#${project.legacyId} passed structural validation without projectName or bizDate.`,
      );
    }

    const target: ProjectTargetInsert = {
      projectCode,
      projectName,
      bizDate,
      customerId: resolvedDependencies.customer?.targetId ?? null,
      supplierId: null,
      managerPersonnelId: resolvedDependencies.manager?.targetId ?? null,
      workshopId: resolvedDependencies.workshop.targetId,
      lifecycleStatus,
      auditStatusSnapshot: "NOT_REQUIRED",
      inventoryEffectStatus:
        lifecycleStatus === "VOIDED" ? "REVERSED" : "POSTED",
      revisionNo: 1,
      customerCodeSnapshot: resolvedDependencies.customerCodeSnapshot,
      customerNameSnapshot: resolvedDependencies.customerNameSnapshot,
      supplierCodeSnapshot: null,
      supplierNameSnapshot: null,
      managerNameSnapshot: resolvedDependencies.managerNameSnapshot,
      workshopNameSnapshot: resolvedDependencies.workshop.workshopName,
      totalQty: sumDecimalValues(
        resolvedPreparedLines.map((line) => line.quantity),
        6,
      ),
      totalAmount:
        normalizeDecimalToScale(project.totalAmount, 2) ??
        sumDecimalValues(
          resolvedPreparedLines.map((line) => line.amount),
          2,
        ),
      remark: normalizeOptionalText(project.remark),
      voidReason: null,
      voidedBy:
        lifecycleStatus === "VOIDED"
          ? normalizeOptionalText(project.updatedBy)
          : null,
      voidedAt:
        lifecycleStatus === "VOIDED"
          ? normalizeDateTime(project.updatedAt)
          : null,
      createdBy: normalizeOptionalText(project.createdBy),
      createdAt,
      updatedBy: normalizeOptionalText(project.updatedBy),
      updatedAt,
    };
    const linePlans: ProjectLinePlanRecord[] = resolvedPreparedLines.map(
      (preparedLine, index) => {
        const lineNo = index + 1;
        const targetCode = `${projectCode}#${lineNo}`;

        return {
          legacyTable: preparedLine.source.legacyTable,
          legacyId: preparedLine.source.legacyId,
          parentLegacyTable: preparedLine.source.parentLegacyTable,
          parentLegacyId: preparedLine.source.parentLegacyId,
          targetTable: "project_material_line",
          targetCode,
          target: {
            lineNo,
            materialId: preparedLine.material.targetId,
            materialCodeSnapshot: preparedLine.material.materialCode,
            materialNameSnapshot: preparedLine.materialNameSnapshot,
            materialSpecSnapshot: preparedLine.materialSpecSnapshot,
            unitCodeSnapshot: preparedLine.unitCodeSnapshot,
            quantity: preparedLine.quantity,
            unitPrice: preparedLine.unitPrice,
            amount: preparedLine.amount,
            remark: normalizeOptionalText(preparedLine.source.remark),
            createdBy: normalizeOptionalText(project.createdBy),
            createdAt,
            updatedBy: normalizeOptionalText(project.updatedBy),
            updatedAt,
          },
          archivedPayload: buildLineArchivedPayload(
            preparedLine.source,
            targetCode,
          ),
        };
      },
    );

    migratedProjects.push({
      legacyTable: project.legacyTable,
      legacyId: project.legacyId,
      targetTable: "project",
      targetCode: projectCode,
      target,
      lines: linePlans,
      archivedPayload: buildProjectArchivedPayload(project, projectCode),
    });
  }

  const counts = buildCounts(
    snapshot,
    migratedProjects,
    pendingProjects,
    excludedProjects,
  );

  return {
    migrationBatch: PROJECT_MIGRATION_BATCH,
    autoCreatedMaterials: autoCreatedMaterials.sort(
      (left, right) =>
        left.representativeLineLegacyId - right.representativeLineLegacyId ||
        left.targetCode.localeCompare(right.targetCode),
    ),
    migratedProjects: migratedProjects.sort(
      (left, right) =>
        left.legacyTable.localeCompare(right.legacyTable) ||
        left.legacyId - right.legacyId,
    ),
    pendingProjects: pendingProjects.sort(
      (left, right) =>
        left.legacyTable.localeCompare(right.legacyTable) ||
        left.legacyId - right.legacyId,
    ),
    excludedProjects: excludedProjects.sort(
      (left, right) =>
        left.legacyTable.localeCompare(right.legacyTable) ||
        left.legacyId - right.legacyId,
    ),
    warnings: warnings.sort(
      (left, right) =>
        left.legacyTable.localeCompare(right.legacyTable) ||
        (left.legacyId ?? 0) - (right.legacyId ?? 0) ||
        left.reason.localeCompare(right.reason),
    ),
    globalBlockers,
    counts,
    context: {
      defaultWorkshopCode:
        dependencies.defaultWorkshop?.workshopCode ?? DEFAULT_WORKSHOP_CODE,
      defaultWorkshopName:
        dependencies.defaultWorkshop?.workshopName ?? DEFAULT_WORKSHOP_NAME,
      blockedMaterialLegacyIds: Array.from(
        dependencies.blockedMaterialLegacyIds,
      ).sort((left, right) => left - right),
      batch1Baseline: dependencies.batch1Baseline,
    },
  };
}

export function hasExecutionBlockers(plan: ProjectMigrationPlan): boolean {
  return plan.globalBlockers.length > 0;
}

export function buildDryRunSummary(
  plan: ProjectMigrationPlan,
): Record<string, unknown> {
  return {
    migrationBatch: plan.migrationBatch,
    counts: plan.counts,
    globalBlockers: plan.globalBlockers,
    warnings: plan.warnings,
    autoCreatedMaterials: plan.autoCreatedMaterials.map((material) => ({
      representativeLineLegacyId: material.representativeLineLegacyId,
      materialCode: material.target.materialCode,
      materialName: material.target.materialName,
      specModel: material.target.specModel,
      unitCode: material.target.unitCode,
      sourceLineCount:
        typeof material.archivedPayload.payload.sourceLineCount === "number"
          ? material.archivedPayload.payload.sourceLineCount
          : null,
    })),
    migratedProjects: plan.migratedProjects.map((project) => ({
      legacyTable: project.legacyTable,
      legacyId: project.legacyId,
      projectCode: project.target.projectCode,
      lineCount: project.lines.length,
      lifecycleStatus: project.target.lifecycleStatus,
      auditStatusSnapshot: project.target.auditStatusSnapshot,
      inventoryEffectStatus: project.target.inventoryEffectStatus,
    })),
    pendingProjects: plan.pendingProjects.map((project) => ({
      legacyTable: project.legacyTable,
      legacyId: project.legacyId,
      targetProjectCodeCandidate: project.targetProjectCodeCandidate,
      resolvedLineCount: project.resolvedLineCount,
      pendingLineCount: project.pendingLineCount,
      pendingRuleBreakdown:
        project.summaryArchivedPayload.payload.pendingRuleBreakdown,
    })),
    excludedProjects: plan.excludedProjects.map((project) => ({
      legacyTable: project.legacyTable,
      legacyId: project.legacyId,
      exclusionReason: project.exclusionReason,
      targetProjectCodeCandidate:
        typeof project.payload.targetProjectCodeCandidate === "string"
          ? project.payload.targetProjectCodeCandidate
          : null,
      excludedLineCount: Array.isArray(project.payload.lines)
        ? project.payload.lines.length
        : 0,
    })),
    pendingRuleBreakdown: buildPendingRuleBreakdown(plan.pendingProjects),
    context: plan.context,
  };
}
