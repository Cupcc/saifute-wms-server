import {
  DEFAULT_WORKSHOP_NAME,
  normalizeOptionalText,
} from "../shared/deterministic";
import { BusinessDocumentType } from "../shared/business-document-type";
import type {
  ArchivedFieldPayloadRecord,
  AuditStatusSnapshotValue,
  CurrentPickOrderLineRecord,
  DocumentLifecycleStatusValue,
  ExcludedWorkshopReturnPlanRecord,
  InventoryEffectStatusValue,
  LegacyInventoryUsedRow,
  LegacyReturnAuditRow,
  LegacyReturnDetailRow,
  LegacyReturnOrderRow,
  LegacyWorkshopReturnSnapshot,
  PendingRelationReasonCode,
  PendingRelationRecord,
  ResolvedMaterialDependency,
  ResolvedPersonnelDependency,
  WorkshopMaterialOrderLineTargetInsert,
  WorkshopMaterialOrderTargetInsert,
  WorkshopReturnDependencySnapshot,
  WorkshopReturnLinePlanRecord,
  WorkshopReturnMigrationPlan,
  WorkshopReturnOrderPlanRecord,
  WorkshopReturnPlanCounts,
} from "./types";
import { WORKSHOP_RETURN_MIGRATION_BATCH } from "./types";

const DOCUMENT_NO_MAX_LENGTH = 64;
const WORKSHOP_MATERIAL_DOCUMENT_TYPE =
  BusinessDocumentType.WorkshopMaterialOrder;

/**
 * An admitted detail has a valid material and quantity.
 * resolvedPickLine is null when the upstream pick relation could not be proven;
 * in that case sourceDocument* fields will be null on the admitted target row.
 */
interface AdmittedDetail {
  source: LegacyReturnDetailRow;
  material: ResolvedMaterialDependency;
  quantity: string;
  unitPrice: string;
  amount: string;
  resolvedPickLine: CurrentPickOrderLineRecord | null;
  pendingReason: PendingRelationReasonCode | null;
  pendingCandidates: CurrentPickOrderLineRecord[];
}

/** A detail that cannot be admitted due to a structural issue (missing/blocked material). */
interface ExcludedDetail {
  source: LegacyReturnDetailRow;
  exclusionReason: string;
}

type DetailResolution =
  | { kind: "admitted"; admitted: AdmittedDetail }
  | { kind: "excluded"; excluded: ExcludedDetail };

function buildLegacyKey(legacyTable: string, legacyId: number): string {
  return `${legacyTable}::${legacyId}`;
}

function normalizePersonnelLookupName(
  value: string | null | undefined,
): string | null {
  const normalized = normalizeOptionalText(value);
  return normalized ? normalized.replace(/\s+/gu, " ") : null;
}

function normalizeDocumentKey(value: string): string {
  return value
    .trim()
    .normalize("NFKD")
    .replace(/\p{Mark}/gu, "")
    .toLocaleLowerCase("en-US");
}

function buildTrimmedDocumentNoWithSuffix(
  baseDocumentNo: string,
  suffix: string,
): string {
  const maxBaseLength = DOCUMENT_NO_MAX_LENGTH - suffix.length;

  if (maxBaseLength <= 0) {
    throw new Error(
      `Document number suffix ${suffix} exceeds the target length limit.`,
    );
  }

  return `${baseDocumentNo.slice(0, maxBaseLength)}${suffix}`;
}

function allocateUniqueDocumentNo(
  seedDocumentNo: string,
  reservedKeys: ReadonlySet<string>,
  assignedKeys: Set<string>,
): string {
  let attempt = 0;

  while (true) {
    const candidate =
      attempt === 0
        ? seedDocumentNo
        : buildTrimmedDocumentNoWithSuffix(seedDocumentNo, `-DUP-${attempt}`);
    const candidateKey = normalizeDocumentKey(candidate);

    if (!reservedKeys.has(candidateKey) && !assignedKeys.has(candidateKey)) {
      assignedKeys.add(candidateKey);
      return candidate;
    }

    attempt += 1;
  }
}

interface ParsedDecimalResult {
  sign: 1 | -1;
  digits: string;
  scale: number;
}

function parseDecimalInput(
  value: string | number | null | undefined,
): ParsedDecimalResult | null {
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

function toLifecycleStatus(
  delFlag: string | number | null | undefined,
): DocumentLifecycleStatusValue {
  return String(delFlag ?? "0") === "2" ? "VOIDED" : "EFFECTIVE";
}

function toAuditStatusSnapshot(
  lifecycleStatus: DocumentLifecycleStatusValue,
  auditRow: LegacyReturnAuditRow | null,
): AuditStatusSnapshotValue {
  if (lifecycleStatus === "VOIDED") {
    return "NOT_REQUIRED";
  }

  const auditStatus = normalizeOptionalText(auditRow?.auditStatus);

  switch (auditStatus) {
    case "1":
      return "APPROVED";
    case "2":
      return "REJECTED";
    default:
      return "PENDING";
  }
}

function toInventoryEffectStatus(
  lifecycleStatus: DocumentLifecycleStatusValue,
): InventoryEffectStatusValue {
  return lifecycleStatus === "VOIDED" ? "REVERSED" : "POSTED";
}

function buildAuditByDocumentKey(
  audits: readonly LegacyReturnAuditRow[],
): Map<string, LegacyReturnAuditRow> {
  const auditByDocumentKey = new Map<string, LegacyReturnAuditRow>();

  for (const audit of [...audits].sort(
    (left, right) =>
      left.documentId - right.documentId || left.legacyId - right.legacyId,
  )) {
    auditByDocumentKey.set(
      buildLegacyKey(String(audit.documentType), audit.documentId),
      audit,
    );
  }

  return auditByDocumentKey;
}

function buildDetailsByOrderKey(
  details: readonly LegacyReturnDetailRow[],
): Map<string, LegacyReturnDetailRow[]> {
  const detailsByOrderKey = new Map<string, LegacyReturnDetailRow[]>();

  for (const detail of [...details].sort(
    (left, right) =>
      left.parentLegacyId - right.parentLegacyId ||
      left.legacyId - right.legacyId,
  )) {
    const orderKey = buildLegacyKey(
      detail.parentLegacyTable,
      detail.parentLegacyId,
    );
    const existingDetails = detailsByOrderKey.get(orderKey) ?? [];
    existingDetails.push(detail);
    detailsByOrderKey.set(orderKey, existingDetails);
  }

  return detailsByOrderKey;
}

interface LineCandidateResult {
  resolved: CurrentPickOrderLineRecord | null;
  reason: PendingRelationReasonCode | null;
  candidates: CurrentPickOrderLineRecord[];
  targetMaterialId: number | null;
}

function resolveLineCandidates(
  detail: LegacyReturnDetailRow,
  returnDate: string,
  targetWorkshopId: number | null,
  pickLinesByMaterialId: Map<number, CurrentPickOrderLineRecord[]>,
  dependencies: WorkshopReturnDependencySnapshot,
  inventoryUsedRows: readonly LegacyInventoryUsedRow[],
): LineCandidateResult {
  const materialLegacyId = normalizePositiveLegacyId(detail.materialLegacyId);

  if (materialLegacyId === null) {
    return {
      resolved: null,
      reason: "missing-mapped-material",
      candidates: [],
      targetMaterialId: null,
    };
  }

  if (dependencies.blockedMaterialLegacyIds.has(materialLegacyId)) {
    return {
      resolved: null,
      reason: "missing-mapped-material",
      candidates: [],
      targetMaterialId: null,
    };
  }

  const material =
    dependencies.materialByLegacyKey.get(
      buildLegacyKey("saifute_material", materialLegacyId),
    ) ?? null;

  if (!material) {
    return {
      resolved: null,
      reason: "missing-mapped-material",
      candidates: [],
      targetMaterialId: null,
    };
  }

  const candidatesForMaterial =
    pickLinesByMaterialId.get(material.targetId) ?? [];

  // Step 1: Base filter — material + temporal ordering
  const baseCandidates = candidatesForMaterial
    .filter((candidate) => {
      if (!candidate.bizDate) {
        return false;
      }

      return candidate.bizDate <= returnDate;
    })
    .sort((left, right) => left.targetLineId - right.targetLineId);

  if (baseCandidates.length === 0) {
    return {
      resolved: null,
      reason: "no-upstream-pick-line-candidate",
      candidates: [],
      targetMaterialId: material.targetId,
    };
  }

  // Step 2: Quantity-compatibility gate — returnQty must be > 0
  const returnQtyScaled = toScaledInteger(detail.returnQty, 6);

  if (returnQtyScaled === null || returnQtyScaled <= 0n) {
    return {
      resolved: null,
      reason: "no-upstream-pick-line-candidate",
      candidates: [],
      targetMaterialId: material.targetId,
    };
  }

  const qtyCompatibleCandidates = baseCandidates.filter((candidate) => {
    const pickQtyScaled = toScaledInteger(candidate.quantity, 6);
    return pickQtyScaled !== null && returnQtyScaled <= pickQtyScaled;
  });

  if (qtyCompatibleCandidates.length === 0) {
    return {
      resolved: null,
      reason: "no-upstream-pick-line-candidate",
      candidates: [],
      targetMaterialId: material.targetId,
    };
  }

  let candidates = qtyCompatibleCandidates;

  // Step 3: Workshop compatibility — if header specifies target workshop, narrow to matching pick lines
  if (targetWorkshopId !== null) {
    const workshopFiltered = candidates.filter(
      (c) => c.workshopId === targetWorkshopId,
    );

    if (workshopFiltered.length > 0) {
      candidates = workshopFiltered;
    } else {
      return {
        resolved: null,
        reason: "upstream-workshop-mismatch",
        candidates,
        targetMaterialId: material.targetId,
      };
    }
  }

  // Step 4: saifute_inventory_used narrowing — supporting evidence only, never sole evidence
  if (candidates.length > 1 && inventoryUsedRows.length > 0) {
    const anchorTargetOrderIds = new Set<number>();

    for (const row of inventoryUsedRows) {
      if (row.afterOrderType === 5 && row.beforeOrderId !== null) {
        const mapped = dependencies.pickOrderMapByLegacyId.get(
          row.beforeOrderId,
        );

        if (mapped) {
          anchorTargetOrderIds.add(mapped.targetOrderId);
        }
      }
    }

    if (anchorTargetOrderIds.size > 0) {
      const narrowedByInventoryUsed = candidates.filter((c) =>
        anchorTargetOrderIds.has(c.targetOrderId),
      );

      if (narrowedByInventoryUsed.length > 0) {
        candidates = narrowedByInventoryUsed;
      }
    }
  }

  if (candidates.length === 1) {
    return {
      resolved: candidates[0] ?? null,
      reason: null,
      candidates,
      targetMaterialId: material.targetId,
    };
  }

  if (candidates.length === 0) {
    return {
      resolved: null,
      reason: "no-upstream-pick-line-candidate",
      candidates: [],
      targetMaterialId: material.targetId,
    };
  }

  return {
    resolved: null,
    reason: "multiple-upstream-pick-line-candidates",
    candidates,
    targetMaterialId: material.targetId,
  };
}

function resolveHandlerDependency(
  order: LegacyReturnOrderRow,
  dependencies: WorkshopReturnDependencySnapshot,
  warnings: Array<{
    legacyTable: string;
    legacyId: number | null;
    reason: string;
    details?: Record<string, unknown>;
  }>,
): {
  handler: ResolvedPersonnelDependency | null;
  handlerNameSnapshot: string | null;
} {
  const normalizedReturnBy = normalizePersonnelLookupName(order.returnBy);
  let handler: ResolvedPersonnelDependency | null = null;
  let handlerNameSnapshot: string | null = normalizeOptionalText(
    order.returnBy,
  );

  if (normalizedReturnBy !== null) {
    if (dependencies.ambiguousPersonnelNames.has(normalizedReturnBy)) {
      warnings.push({
        legacyTable: order.legacyTable,
        legacyId: order.legacyId,
        reason:
          "Handler personnel name (return_by) is ambiguous in the migrated personnel snapshot; preserving handlerNameSnapshot without handlerPersonnelId.",
        details: { returnBy: normalizedReturnBy },
      });
    } else {
      handler =
        dependencies.personnelByNormalizedName.get(normalizedReturnBy) ?? null;

      if (!handler) {
        warnings.push({
          legacyTable: order.legacyTable,
          legacyId: order.legacyId,
          reason:
            "Handler personnel name (return_by) is missing from the migrated personnel snapshot; preserving handlerNameSnapshot without handlerPersonnelId.",
          details: { returnBy: normalizedReturnBy },
        });
      } else {
        handlerNameSnapshot = handler.personnelName;
      }
    }
  }

  return { handler, handlerNameSnapshot };
}

function buildOrderArchivedPayload(
  order: LegacyReturnOrderRow,
  targetDocumentNo: string,
  auditRow: LegacyReturnAuditRow | null,
): ArchivedFieldPayloadRecord {
  return {
    legacyTable: order.legacyTable,
    legacyId: order.legacyId,
    targetTable: "workshop_material_order",
    targetCode: targetDocumentNo,
    payloadKind: "legacy-unmapped-fields",
    archiveReason:
      "Archive workshop-return source-only fields: source_type, source_id, charge_by, raw returnBy, audit detail, and original document number when rewritten.",
    payload: {
      chargeBy: normalizeOptionalText(order.chargeBy),
      legacyAudit: auditRow
        ? {
            auditOpinion: normalizeOptionalText(auditRow.auditOpinion),
            auditStatus: normalizeOptionalText(auditRow.auditStatus),
            auditTime: normalizeDateTime(auditRow.auditTime),
            auditor: normalizeOptionalText(auditRow.auditor),
          }
        : null,
      originalDocumentNo: normalizeOptionalText(order.returnNo),
      returnBy: normalizeOptionalText(order.returnBy),
      sourceId: normalizePositiveLegacyId(order.sourceId),
      sourceType: order.sourceType !== null ? Number(order.sourceType) : null,
      workshopLegacyId: normalizePositiveLegacyId(order.workshopLegacyId),
    },
  };
}

function buildLineArchivedPayload(
  detail: LegacyReturnDetailRow,
  targetCode: string,
  resolvedPickLine: CurrentPickOrderLineRecord | null,
): ArchivedFieldPayloadRecord {
  return {
    legacyTable: detail.legacyTable,
    legacyId: detail.legacyId,
    targetTable: "workshop_material_order_line",
    targetCode,
    payloadKind: "legacy-unmapped-fields",
    archiveReason:
      "Archive workshop-return line source-only fields and resolved upstream pick line evidence (null when unresolved; relation enrichment is a later step).",
    payload: {
      resolvedPickLineId: resolvedPickLine?.targetLineId ?? null,
      resolvedPickOrderId: resolvedPickLine?.targetOrderId ?? null,
      resolvedPickDocumentNo: resolvedPickLine?.documentNo ?? null,
    },
  };
}

function buildExcludedWorkshopReturnPlan(
  order: LegacyReturnOrderRow,
  auditRow: LegacyReturnAuditRow | null,
  details: readonly LegacyReturnDetailRow[],
  targetDocumentNoCandidate: string | null,
  exclusionReasons: string[],
  isHardBlocker: boolean,
): ExcludedWorkshopReturnPlanRecord {
  return {
    legacyTable: order.legacyTable,
    legacyId: order.legacyId,
    exclusionReason: exclusionReasons.join("; "),
    isHardBlocker,
    payload: {
      audit: auditRow
        ? {
            auditOpinion: normalizeOptionalText(auditRow.auditOpinion),
            auditStatus: normalizeOptionalText(auditRow.auditStatus),
            auditTime: normalizeDateTime(auditRow.auditTime),
            auditor: normalizeOptionalText(auditRow.auditor),
          }
        : null,
      chargeBy: normalizeOptionalText(order.chargeBy),
      exclusionReasons,
      isHardBlocker,
      lifecycleStatus: toLifecycleStatus(order.delFlag),
      returnDate: normalizeDate(order.returnDate),
      returnNo: normalizeOptionalText(order.returnNo),
      returnBy: normalizeOptionalText(order.returnBy),
      sourceId: normalizePositiveLegacyId(order.sourceId),
      sourceType: order.sourceType !== null ? Number(order.sourceType) : null,
      targetDocumentNoCandidate,
      workshopLegacyId: normalizePositiveLegacyId(order.workshopLegacyId),
      details: details.map((detail) => ({
        legacyId: detail.legacyId,
        materialLegacyId: normalizePositiveLegacyId(detail.materialLegacyId),
        remark: normalizeOptionalText(detail.remark),
        returnQty: normalizeDecimalToScale(detail.returnQty, 6),
        unitPrice:
          normalizeDecimalToScale(detail.unitPrice, 2) ??
          formatScaledInteger(0n, 2),
      })),
    },
  };
}

function buildPendingRelationRecord(
  order: LegacyReturnOrderRow,
  detail: LegacyReturnDetailRow,
  pendingReason: PendingRelationReasonCode,
  returnDate: string,
  targetWorkshopId: number | null,
  candidates: CurrentPickOrderLineRecord[],
): PendingRelationRecord {
  return {
    legacyTable: order.legacyTable,
    legacyId: order.legacyId,
    legacyLineId: detail.legacyId,
    pendingReason,
    payload: {
      materialLegacyId: normalizePositiveLegacyId(detail.materialLegacyId),
      targetMaterialId: null,
      returnQty: normalizeDecimalToScale(detail.returnQty, 6),
      returnDate,
      targetWorkshopId,
      candidateCount: candidates.length,
      candidateSummary: candidates.slice(0, 5).map((c) => ({
        targetLineId: c.targetLineId,
        targetOrderId: c.targetOrderId,
        documentNo: c.documentNo,
      })),
      remarkEvidence: normalizeOptionalText(detail.remark),
    },
  };
}

/**
 * Resolve a single detail row against pick candidates.
 * Returns either an admitted detail (material found, quantity valid) or an excluded detail
 * (structural issue: null/blocked/unmapped material or invalid quantity).
 * An admitted detail may have a null resolvedPickLine when the upstream pick cannot be proven;
 * that case produces a pending relation record for later source enrichment.
 */
function resolveDetailRow(
  detail: LegacyReturnDetailRow,
  returnDate: string,
  targetWorkshopId: number | null,
  dependencies: WorkshopReturnDependencySnapshot,
  inventoryUsedRows: readonly LegacyInventoryUsedRow[],
): DetailResolution {
  const materialLegacyId = normalizePositiveLegacyId(detail.materialLegacyId);

  if (materialLegacyId === null) {
    return {
      kind: "excluded",
      excluded: {
        source: detail,
        exclusionReason: "Detail line has null or invalid materialLegacyId.",
      },
    };
  }

  if (dependencies.blockedMaterialLegacyIds.has(materialLegacyId)) {
    return {
      kind: "excluded",
      excluded: {
        source: detail,
        exclusionReason: `Material legacy id ${materialLegacyId} is in the batch1 blocked-material set and cannot be admitted.`,
      },
    };
  }

  const material =
    dependencies.materialByLegacyKey.get(
      buildLegacyKey("saifute_material", materialLegacyId),
    ) ?? null;

  if (!material) {
    return {
      kind: "excluded",
      excluded: {
        source: detail,
        exclusionReason: `Material legacy id ${materialLegacyId} has no entry in the batch1 material map.`,
      },
    };
  }

  const quantity = normalizeDecimalToScale(detail.returnQty, 6);

  if (!quantity) {
    return {
      kind: "excluded",
      excluded: {
        source: detail,
        exclusionReason: "Detail line returnQty is null or invalid.",
      },
    };
  }

  const unitPrice =
    normalizeDecimalToScale(detail.unitPrice, 2) ?? formatScaledInteger(0n, 2);
  const amount = multiplyToAmount(quantity, unitPrice);

  if (!amount) {
    return {
      kind: "excluded",
      excluded: {
        source: detail,
        exclusionReason:
          "Detail line amount cannot be computed from returnQty and unitPrice.",
      },
    };
  }

  // Try to resolve upstream pick line as enrichment evidence.
  // Failure here is not a structural exclusion — the line is admitted with null source fields.
  const { resolved, reason, candidates } = resolveLineCandidates(
    detail,
    returnDate,
    targetWorkshopId,
    dependencies.pickLinesByMaterialId,
    dependencies,
    inventoryUsedRows,
  );

  return {
    kind: "admitted",
    admitted: {
      source: detail,
      material,
      quantity,
      unitPrice,
      amount,
      resolvedPickLine: resolved,
      pendingReason:
        resolved === null
          ? (reason ?? "no-upstream-pick-line-candidate")
          : null,
      pendingCandidates: resolved === null ? candidates : [],
    },
  };
}

export function buildWorkshopReturnMigrationPlan(
  snapshot: LegacyWorkshopReturnSnapshot,
  dependencies: WorkshopReturnDependencySnapshot,
): WorkshopReturnMigrationPlan {
  const warnings: Array<{
    legacyTable: string;
    legacyId: number | null;
    reason: string;
    details?: Record<string, unknown>;
  }> = [];
  const globalBlockers: Array<{
    reason: string;
    details?: Record<string, unknown>;
  }> = [];
  const admittedOrders: WorkshopReturnOrderPlanRecord[] = [];
  const pendingRelations: PendingRelationRecord[] = [];
  const excludedDocuments: ExcludedWorkshopReturnPlanRecord[] = [];
  const documentNoRewrites: Array<{
    originalDocumentNo: string;
    keptLegacyId: number;
    rewrittenDocumentNo: string;
  }> = [];

  for (const issue of dependencies.batch1Baseline.issues) {
    globalBlockers.push({ reason: issue });
  }

  for (const issue of dependencies.workshopPickBaseBaseline.issues) {
    globalBlockers.push({ reason: issue });
  }

  let sourceFieldBlocker = false;

  for (const order of snapshot.orders) {
    if (order.sourceId !== null || order.sourceType !== null) {
      globalBlockers.push({
        reason:
          "Legacy saifute_return_order has non-null source_id or source_type. The migration plan freezes these fields as all-null for the workshop-return dataset. Non-null values require re-planning before this slice can execute.",
        details: {
          legacyId: order.legacyId,
          returnNo: normalizeOptionalText(order.returnNo),
          sourceId: order.sourceId,
          sourceType: order.sourceType,
        },
      });
      sourceFieldBlocker = true;
    }
  }

  for (const ambiguousName of Array.from(
    dependencies.ambiguousPersonnelNames,
  ).sort((left, right) => left.localeCompare(right))) {
    warnings.push({
      legacyTable: "personnel",
      legacyId: null,
      reason:
        "Target personnel snapshot contains ambiguous names; handler matches will preserve handlerNameSnapshot without handlerPersonnelId.",
      details: { personnelName: ambiguousName },
    });
  }

  const auditByDocumentKey = buildAuditByDocumentKey(snapshot.audits);
  const detailsByOrderKey = buildDetailsByOrderKey(snapshot.details);

  const reservedDocumentNoKeys = new Set(
    [...dependencies.existingWorkshopMaterialDocumentNos].map((no) =>
      normalizeDocumentKey(no),
    ),
  );
  const assignedDocumentNoKeys = new Set<string>();

  function allocateDocumentNo(
    seedDocumentNo: string,
    legacyId: number,
  ): { documentNo: string; rewritten: boolean } {
    const seedKey = normalizeDocumentKey(seedDocumentNo);

    if (
      !reservedDocumentNoKeys.has(seedKey) &&
      !assignedDocumentNoKeys.has(seedKey)
    ) {
      assignedDocumentNoKeys.add(seedKey);
      return { documentNo: seedDocumentNo, rewritten: false };
    }

    const rewrittenDocumentNo = allocateUniqueDocumentNo(
      buildTrimmedDocumentNoWithSuffix(seedDocumentNo, `-LEGACY-${legacyId}`),
      reservedDocumentNoKeys,
      assignedDocumentNoKeys,
    );

    return { documentNo: rewrittenDocumentNo, rewritten: true };
  }

  for (const order of [...snapshot.orders].sort((left, right) => {
    // Active-first rule: EFFECTIVE orders claim canonical documentNo before VOIDED orders.
    const leftStatus = toLifecycleStatus(left.delFlag);
    const rightStatus = toLifecycleStatus(right.delFlag);
    const statusPriority =
      (leftStatus === "EFFECTIVE" ? 0 : 1) -
      (rightStatus === "EFFECTIVE" ? 0 : 1);
    if (statusPriority !== 0) return statusPriority;
    return left.legacyId - right.legacyId;
  })) {
    const orderKey = buildLegacyKey(order.legacyTable, order.legacyId);
    const auditRow =
      auditByDocumentKey.get(buildLegacyKey("5", order.legacyId)) ?? null;
    const details = detailsByOrderKey.get(orderKey) ?? [];
    const returnNo = normalizeOptionalText(order.returnNo);
    const returnDate = normalizeDate(order.returnDate);
    const exclusionReasons: string[] = [];

    // --- Structural gates (hard exclusions) ---
    if (!returnNo) {
      exclusionReasons.push("Return document number is required.");
    }

    if (!returnDate) {
      exclusionReasons.push("Return date is required.");
    }

    if (details.length === 0) {
      exclusionReasons.push(
        "No legacy detail rows were found for this workshop-return header.",
      );
    }

    if (exclusionReasons.length > 0) {
      excludedDocuments.push(
        buildExcludedWorkshopReturnPlan(
          order,
          auditRow,
          details,
          returnNo,
          exclusionReasons,
          true,
        ),
      );
      continue;
    }

    // --- Workshop resolution from header ---
    // The header workshopLegacyId is the canonical workshop source.
    // If the header has a workshopLegacyId that is not in the map → structural exclusion.
    // If the header has no workshopLegacyId, workshop is derived from resolved pick lines.
    const workshopLegacyId = normalizePositiveLegacyId(order.workshopLegacyId);
    let targetWorkshopId: number | null = null;

    if (workshopLegacyId !== null) {
      const resolvedWorkshop =
        dependencies.workshopByLegacyKey.get(
          buildLegacyKey("saifute_workshop", workshopLegacyId),
        ) ?? null;

      if (!resolvedWorkshop) {
        excludedDocuments.push(
          buildExcludedWorkshopReturnPlan(
            order,
            auditRow,
            details,
            returnNo,
            [
              `Legacy workshop_id ${workshopLegacyId} is not found in the batch1 workshop map; workshopId cannot be determined.`,
            ],
            true,
          ),
        );
        continue;
      }

      targetWorkshopId = resolvedWorkshop.targetId;
    }

    // --- Resolve each detail row ---
    const inventoryUsedRowsForOrder =
      snapshot.inventoryUsedByReturnOrderId.get(order.legacyId) ?? [];
    const detailResolutions: DetailResolution[] = [];

    for (const detail of [...details].sort(
      (left, right) => left.legacyId - right.legacyId,
    )) {
      // Scope inventory evidence to this specific detail only.
      const detailInventoryUsedRows = inventoryUsedRowsForOrder.filter(
        (row) =>
          (row.afterOrderType === 5 && row.afterDetailId === detail.legacyId) ||
          (row.afterOrderType === 5 &&
            row.afterDetailId === null &&
            row.materialId === detail.materialLegacyId),
      );

      detailResolutions.push(
        resolveDetailRow(
          detail,
          returnDate ?? "",
          targetWorkshopId,
          dependencies,
          detailInventoryUsedRows,
        ),
      );
    }

    const admittedDetails = detailResolutions.filter(
      (r): r is { kind: "admitted"; admitted: AdmittedDetail } =>
        r.kind === "admitted",
    );
    const excludedDetailCount =
      detailResolutions.length - admittedDetails.length;

    if (admittedDetails.length === 0) {
      // All lines are structurally invalid — exclude the header.
      excludedDocuments.push(
        buildExcludedWorkshopReturnPlan(
          order,
          auditRow,
          details,
          returnNo,
          [
            `All ${details.length} detail line(s) are structurally invalid (missing, blocked, or unmapped material, or invalid quantity). Header cannot be admitted without at least one valid line.`,
          ],
          true,
        ),
      );
      continue;
    }

    if (excludedDetailCount > 0) {
      excludedDocuments.push(
        buildExcludedWorkshopReturnPlan(
          order,
          auditRow,
          details,
          returnNo,
          [
            `${excludedDetailCount} of ${details.length} detail line(s) are structurally invalid. Under the formal-admission rule, structural invalidity remains a whole-header exclusion.`,
          ],
          true,
        ),
      );
      continue;
    }

    // --- Workshop fallback: use the frozen default workshop if no header workshop ---
    let workshopId: number;
    let workshopNameSnapshot: string;

    if (targetWorkshopId !== null) {
      workshopId = targetWorkshopId;
      const workshopSnap = dependencies.workshopByTargetId.get(workshopId);
      workshopNameSnapshot =
        workshopSnap?.workshopName ?? `workshop-${workshopId}`;
    } else {
      const defaultWorkshop =
        Array.from(dependencies.workshopByTargetId.values()).find(
          (workshop) => workshop.workshopName === DEFAULT_WORKSHOP_NAME,
        ) ?? null;

      if (!defaultWorkshop) {
        excludedDocuments.push(
          buildExcludedWorkshopReturnPlan(
            order,
            auditRow,
            details,
            returnNo,
            [
              "No legacy workshop_id on header and the frozen default workshop is unavailable; workshopId cannot be determined.",
            ],
            true,
          ),
        );
        continue;
      }

      workshopId = defaultWorkshop.targetId;
      workshopNameSnapshot = defaultWorkshop.workshopName;
      warnings.push({
        legacyTable: order.legacyTable,
        legacyId: order.legacyId,
        reason:
          "No legacy workshop_id on header; using the frozen default workshop for this historical workshop-return header.",
        details: { chosenWorkshopId: defaultWorkshop.targetId },
      });
    }

    // --- Allocate document number ---
    const { documentNo, rewritten } = allocateDocumentNo(
      returnNo ?? `TR-FALLBACK-${order.legacyId}`,
      order.legacyId,
    );

    if (rewritten && returnNo) {
      documentNoRewrites.push({
        originalDocumentNo: returnNo,
        keptLegacyId: order.legacyId,
        rewrittenDocumentNo: documentNo,
      });
    }

    const lifecycleStatus = toLifecycleStatus(order.delFlag);
    const auditStatusSnapshot = toAuditStatusSnapshot(
      lifecycleStatus,
      auditRow,
    );
    const inventoryEffectStatus = toInventoryEffectStatus(lifecycleStatus);
    const createdAt = normalizeDateTime(order.createdAt);
    const updatedAt = normalizeDateTime(order.updatedAt) ?? createdAt;

    const { handler, handlerNameSnapshot } = resolveHandlerDependency(
      order,
      dependencies,
      warnings,
    );

    // --- Build line plans ---
    const linePlans: WorkshopReturnLinePlanRecord[] = admittedDetails.map(
      ({ admitted }, index) => {
        const lineNo = index + 1;
        const targetCode = `${documentNo}#${lineNo}`;

        const lineTarget: WorkshopMaterialOrderLineTargetInsert = {
          lineNo,
          materialId: admitted.material.targetId,
          materialCodeSnapshot: admitted.material.materialCode,
          materialNameSnapshot: admitted.material.materialName,
          materialSpecSnapshot: admitted.material.specModel,
          unitCodeSnapshot: admitted.material.unitCode,
          quantity: admitted.quantity,
          unitPrice: admitted.unitPrice,
          amount: admitted.amount,
          // sourceDocument* fields are null when the upstream pick relation is unresolved.
          // Relation enrichment is a later step, not an admission gate.
          sourceDocumentType:
            admitted.resolvedPickLine !== null
              ? WORKSHOP_MATERIAL_DOCUMENT_TYPE
              : null,
          sourceDocumentId: admitted.resolvedPickLine?.targetOrderId ?? null,
          sourceDocumentLineId: admitted.resolvedPickLine?.targetLineId ?? null,
          remark: normalizeOptionalText(admitted.source.remark),
          createdBy: normalizeOptionalText(order.createdBy),
          createdAt,
          updatedBy: normalizeOptionalText(order.updatedBy),
          updatedAt,
        };

        return {
          legacyTable: admitted.source.legacyTable,
          legacyId: admitted.source.legacyId,
          parentLegacyTable: admitted.source.parentLegacyTable,
          parentLegacyId: admitted.source.parentLegacyId,
          targetTable: "workshop_material_order_line",
          targetCode,
          target: lineTarget,
          archivedPayload: buildLineArchivedPayload(
            admitted.source,
            targetCode,
            admitted.resolvedPickLine,
          ),
        };
      },
    );

    // Record pending relations for admitted lines whose pick source could not be resolved.
    for (const { admitted } of admittedDetails) {
      if (
        admitted.resolvedPickLine === null &&
        admitted.pendingReason !== null
      ) {
        pendingRelations.push(
          buildPendingRelationRecord(
            order,
            admitted.source,
            admitted.pendingReason,
            returnDate ?? "",
            targetWorkshopId,
            admitted.pendingCandidates,
          ),
        );
      }
    }

    const admittedReturnDate = returnDate ?? "";

    const orderTarget: WorkshopMaterialOrderTargetInsert = {
      documentNo,
      orderType: "RETURN",
      bizDate: admittedReturnDate,
      handlerPersonnelId: handler?.targetId ?? null,
      workshopId,
      lifecycleStatus,
      auditStatusSnapshot,
      inventoryEffectStatus,
      revisionNo: 1,
      handlerNameSnapshot,
      workshopNameSnapshot,
      totalQty: sumDecimalValues(
        linePlans.map((line) => line.target.quantity),
        6,
      ),
      totalAmount:
        normalizeDecimalToScale(order.totalAmount, 2) ??
        sumDecimalValues(
          linePlans.map((line) => line.target.amount),
          2,
        ),
      remark: normalizeOptionalText(order.remark),
      voidReason: normalizeOptionalText(order.voidDescription),
      voidedBy:
        lifecycleStatus === "VOIDED"
          ? normalizeOptionalText(order.updatedBy)
          : null,
      voidedAt:
        lifecycleStatus === "VOIDED"
          ? normalizeDateTime(order.updatedAt)
          : null,
      createdBy: normalizeOptionalText(order.createdBy),
      createdAt,
      updatedBy: normalizeOptionalText(order.updatedBy),
      updatedAt,
    };

    admittedOrders.push({
      legacyTable: order.legacyTable,
      legacyId: order.legacyId,
      sourceDocumentNo: returnNo ?? documentNo,
      targetTable: "workshop_material_order",
      targetCode: documentNo,
      target: orderTarget,
      lines: linePlans,
      archivedPayload: buildOrderArchivedPayload(order, documentNo, auditRow),
    });
  }

  const pendingReasonCounts: Partial<
    Record<PendingRelationReasonCode, number>
  > = {};

  for (const pending of pendingRelations) {
    const current = pendingReasonCounts[pending.pendingReason] ?? 0;
    pendingReasonCounts[pending.pendingReason] = current + 1;
  }

  const admittedLinesWithNullSource = admittedOrders.reduce(
    (total, order) =>
      total +
      order.lines.filter((line) => line.target.sourceDocumentType === null)
        .length,
    0,
  );

  const counts: WorkshopReturnPlanCounts = {
    sourceCounts: {
      orders: snapshot.orders.length,
      details: snapshot.details.length,
      audits: snapshot.audits.length,
    },
    admittedOrders: admittedOrders.length,
    admittedLines: admittedOrders.reduce(
      (total, order) => total + order.lines.length,
      0,
    ),
    admittedLinesWithNullSource,
    pendingRelationLines: pendingRelations.length,
    excludedHeaders: excludedDocuments.length,
    pendingReasonCounts,
  };

  return {
    migrationBatch: WORKSHOP_RETURN_MIGRATION_BATCH,
    admittedOrders: admittedOrders.sort(
      (left, right) => left.legacyId - right.legacyId,
    ),
    pendingRelations: pendingRelations.sort(
      (left, right) =>
        left.legacyId - right.legacyId ||
        left.legacyLineId - right.legacyLineId,
    ),
    excludedDocuments: excludedDocuments.sort(
      (left, right) => left.legacyId - right.legacyId,
    ),
    documentNoRewrites: documentNoRewrites.sort(
      (left, right) => left.keptLegacyId - right.keptLegacyId,
    ),
    globalBlockers,
    warnings: warnings.sort(
      (left, right) =>
        left.legacyTable.localeCompare(right.legacyTable) ||
        (left.legacyId ?? 0) - (right.legacyId ?? 0) ||
        left.reason.localeCompare(right.reason),
    ),
    counts,
    context: {
      batch1Baseline: dependencies.batch1Baseline,
      workshopPickBaseBaseline: dependencies.workshopPickBaseBaseline,
      blockedMaterialLegacyIds: Array.from(
        dependencies.blockedMaterialLegacyIds,
      ).sort((left, right) => left - right),
      sourceFieldBlocker,
    },
  };
}

export function hasExecutionBlockers(
  plan: WorkshopReturnMigrationPlan,
): boolean {
  return plan.globalBlockers.length > 0;
}

export function buildDryRunSummary(
  plan: WorkshopReturnMigrationPlan,
): Record<string, unknown> {
  return {
    migrationBatch: plan.migrationBatch,
    counts: plan.counts,
    documentNoRewrites: plan.documentNoRewrites,
    globalBlockers: plan.globalBlockers,
    warnings: plan.warnings,
    sourceFieldBlocker: plan.context.sourceFieldBlocker,
    pendingRelationSummary: plan.pendingRelations.map((pending) => ({
      legacyId: pending.legacyId,
      legacyLineId: pending.legacyLineId,
      pendingReason: pending.pendingReason,
      candidateCount: pending.payload.candidateCount,
    })),
    excludedDocumentSummary: plan.excludedDocuments.map((document) => ({
      legacyId: document.legacyId,
      exclusionReason: document.exclusionReason,
      isHardBlocker: document.isHardBlocker,
      returnNo:
        typeof document.payload.returnNo === "string"
          ? document.payload.returnNo
          : null,
      detailCount: Array.isArray(document.payload.details)
        ? (document.payload.details as unknown[]).length
        : 0,
    })),
    admittedDocumentSummary: plan.admittedOrders.map((order) => ({
      legacyId: order.legacyId,
      sourceDocumentNo: order.sourceDocumentNo,
      documentNo: order.target.documentNo,
      orderType: order.target.orderType,
      workshopId: order.target.workshopId,
      lineCount: order.lines.length,
      lifecycleStatus: order.target.lifecycleStatus,
      auditStatusSnapshot: order.target.auditStatusSnapshot,
      inventoryEffectStatus: order.target.inventoryEffectStatus,
      lines: order.lines.map((line) => ({
        lineNo: line.target.lineNo,
        materialId: line.target.materialId,
        quantity: line.target.quantity,
        sourceDocumentType: line.target.sourceDocumentType,
        sourceDocumentId: line.target.sourceDocumentId,
        sourceDocumentLineId: line.target.sourceDocumentLineId,
      })),
    })),
    context: plan.context,
  };
}
