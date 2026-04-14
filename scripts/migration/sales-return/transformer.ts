import {
  DEFAULT_WORKSHOP_NAME,
  normalizeOptionalText,
} from "../shared/deterministic";
import { BusinessDocumentType } from "../shared/business-document-type";
import type {
  ArchivedFieldPayloadRecord,
  AuditStatusSnapshotValue,
  CurrentOutboundLineRecord,
  DocumentLifecycleStatusValue,
  ExcludedSalesReturnPlanRecord,
  InventoryEffectStatusValue,
  LegacyInventoryUsedRow,
  LegacySalesReturnAuditRow,
  LegacySalesReturnDetailRow,
  LegacySalesReturnOrderRow,
  LegacySalesReturnSnapshot,
  PendingRelationReasonCode,
  SalesReturnDependencySnapshot,
  SalesReturnLinePlanRecord,
  SalesReturnLineTargetInsert,
  SalesReturnMigrationPlan,
  SalesReturnOrderPlanRecord,
  SalesReturnPlanCounts,
  SalesStockOrderTargetInsert,
} from "./types";
import { SALES_RETURN_MIGRATION_BATCH } from "./types";

const DOCUMENT_NO_MAX_LENGTH = 64;
const SALES_STOCK_DOCUMENT_TYPE = BusinessDocumentType.SalesStockOrder;

interface ParsedDecimal {
  sign: 1 | -1;
  digits: string;
  scale: number;
}

interface PreparedDetail {
  source: LegacySalesReturnDetailRow;
  material: {
    targetId: number;
    materialCode: string;
    materialName: string;
    specModel: string | null;
    unitCode: string;
  };
  quantity: string;
  unitPrice: string;
  amount: string;
  resolvedOutboundLine: CurrentOutboundLineRecord | null;
  nullSourceDocumentReason: PendingRelationReasonCode | null;
  candidateWorkshopIds: number[];
}

type DetailResolution =
  | { kind: "admitted"; prepared: PreparedDetail }
  | {
      kind: "structural-invalid";
      reason: string;
      detail: LegacySalesReturnDetailRow;
    };

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

function getOnlyValue<T>(values: Set<T>): T | null {
  const iterator = values.values().next();
  return iterator.done ? null : iterator.value;
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

function toLifecycleStatus(
  delFlag: string | number | null | undefined,
): DocumentLifecycleStatusValue {
  return String(delFlag ?? "0") === "2" ? "VOIDED" : "EFFECTIVE";
}

function toAuditStatusSnapshot(
  lifecycleStatus: DocumentLifecycleStatusValue,
  auditRow: LegacySalesReturnAuditRow | null,
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
  audits: readonly LegacySalesReturnAuditRow[],
): Map<string, LegacySalesReturnAuditRow> {
  const auditByDocumentKey = new Map<string, LegacySalesReturnAuditRow>();

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
  details: readonly LegacySalesReturnDetailRow[],
): Map<string, LegacySalesReturnDetailRow[]> {
  const detailsByOrderKey = new Map<string, LegacySalesReturnDetailRow[]>();

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
  resolved: CurrentOutboundLineRecord | null;
  reason: PendingRelationReasonCode | null;
  candidates: CurrentOutboundLineRecord[];
  targetMaterialId: number | null;
  candidateWorkshopIds: number[];
}

function resolveLineCandidates(
  detail: LegacySalesReturnDetailRow,
  targetCustomerId: number | null,
  returnDate: string,
  outboundLinesByMaterialId: Map<number, CurrentOutboundLineRecord[]>,
  dependencies: SalesReturnDependencySnapshot,
  sourceAnchorTargetOrderId: number | null,
  inventoryUsedRows: readonly LegacyInventoryUsedRow[],
): LineCandidateResult {
  const materialLegacyId = normalizePositiveLegacyId(detail.materialLegacyId);

  if (materialLegacyId === null) {
    return {
      resolved: null,
      reason: "missing-mapped-material",
      candidates: [],
      targetMaterialId: null,
      candidateWorkshopIds: [],
    };
  }

  if (dependencies.blockedMaterialLegacyIds.has(materialLegacyId)) {
    return {
      resolved: null,
      reason: "missing-mapped-material",
      candidates: [],
      targetMaterialId: null,
      candidateWorkshopIds: [],
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
      candidateWorkshopIds: [],
    };
  }

  // Collect all outbound lines for this material for workshop derivation purposes.
  // This is computed before customer filtering so it covers all possible workshops.
  const allLinesForMaterial =
    outboundLinesByMaterialId.get(material.targetId) ?? [];
  const candidateWorkshopIds = [
    ...new Set(allLinesForMaterial.map((c) => c.workshopId)),
  ];

  if (targetCustomerId === null) {
    return {
      resolved: null,
      reason: "missing-mapped-customer",
      candidates: allLinesForMaterial.slice(0, 5),
      targetMaterialId: material.targetId,
      candidateWorkshopIds,
    };
  }

  // Step 1: Base filter — material + customer + temporal ordering
  const baseCandidates = allLinesForMaterial
    .filter((candidate) => {
      if (candidate.customerId !== targetCustomerId) {
        return false;
      }

      if (!candidate.bizDate) {
        return false;
      }

      return candidate.bizDate <= returnDate;
    })
    .sort((left, right) => left.targetLineId - right.targetLineId);

  if (baseCandidates.length === 0) {
    return {
      resolved: null,
      reason: "no-upstream-line-candidate",
      candidates: [],
      targetMaterialId: material.targetId,
      candidateWorkshopIds,
    };
  }

  // Step 2: Quantity-compatibility gate — returnQty must be > 0 and <= outbound line qty
  const returnQtyScaled = toScaledInteger(detail.returnQty, 6);

  if (returnQtyScaled === null || returnQtyScaled <= 0n) {
    return {
      resolved: null,
      reason: "no-upstream-line-candidate",
      candidates: [],
      targetMaterialId: material.targetId,
      candidateWorkshopIds,
    };
  }

  const qtyCompatibleCandidates = baseCandidates.filter((candidate) => {
    const outboundQtyScaled = toScaledInteger(candidate.quantity, 6);
    return outboundQtyScaled !== null && returnQtyScaled <= outboundQtyScaled;
  });

  if (qtyCompatibleCandidates.length === 0) {
    return {
      resolved: null,
      reason: "no-upstream-line-candidate",
      candidates: [],
      targetMaterialId: material.targetId,
      candidateWorkshopIds,
    };
  }

  let candidates = qtyCompatibleCandidates;

  // Step 3: source_id narrowing — strong header-level evidence anchors to specific outbound order
  if (sourceAnchorTargetOrderId !== null) {
    const anchoredBySourceId = candidates.filter(
      (c) => c.targetOrderId === sourceAnchorTargetOrderId,
    );

    if (anchoredBySourceId.length > 0) {
      candidates = anchoredBySourceId;
    }
    // If anchor yields no candidates, fall through — do not use missing anchor as a blocker
  }

  // Step 4: saifute_inventory_used narrowing — supporting evidence only, never sole evidence
  if (candidates.length > 1 && inventoryUsedRows.length > 0) {
    const anchorTargetOrderIds = new Set<number>();

    for (const row of inventoryUsedRows) {
      if (row.beforeOrderType === 7 && row.afterOrderId !== null) {
        const mapped = dependencies.outboundOrderMapByLegacyId.get(
          row.afterOrderId,
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

  // Step 5: interval/range narrowing — supporting evidence when detail has interval text
  // and at least one candidate has startNumber/endNumber populated
  if (candidates.length > 1) {
    const intervalText = normalizeOptionalText(detail.interval);

    if (intervalText) {
      const rangeNarrowed = candidates.filter(
        (c) =>
          c.startNumber !== null &&
          c.endNumber !== null &&
          intervalText.includes(c.startNumber) &&
          intervalText.includes(c.endNumber),
      );

      if (rangeNarrowed.length > 0) {
        candidates = rangeNarrowed;
      }
    }
  }

  if (candidates.length === 1) {
    return {
      resolved: candidates[0] ?? null,
      reason: null,
      candidates,
      targetMaterialId: material.targetId,
      candidateWorkshopIds,
    };
  }

  if (candidates.length === 0) {
    return {
      resolved: null,
      reason: "no-upstream-line-candidate",
      candidates: [],
      targetMaterialId: material.targetId,
      candidateWorkshopIds,
    };
  }

  return {
    resolved: null,
    reason: "multiple-upstream-line-candidates",
    candidates,
    targetMaterialId: material.targetId,
    candidateWorkshopIds,
  };
}

function resolveHandlerDependency(
  order: LegacySalesReturnOrderRow,
  dependencies: SalesReturnDependencySnapshot,
  warnings: Array<{
    legacyTable: string;
    legacyId: number | null;
    reason: string;
    details?: Record<string, unknown>;
  }>,
): {
  handler: {
    targetId: number;
    personnelName: string;
  } | null;
  handlerNameSnapshot: string | null;
} {
  const normalizedAttn = normalizePersonnelLookupName(order.attn);
  let handler: {
    targetId: number;
    personnelName: string;
  } | null = null;
  let handlerNameSnapshot: string | null = normalizeOptionalText(order.attn);

  if (normalizedAttn !== null) {
    if (dependencies.ambiguousPersonnelNames.has(normalizedAttn)) {
      warnings.push({
        legacyTable: order.legacyTable,
        legacyId: order.legacyId,
        reason:
          "Handler personnel name (attn) is ambiguous in the migrated personnel snapshot; preserving handlerNameSnapshot without handlerPersonnelId.",
        details: { attn: normalizedAttn },
      });
    } else {
      handler =
        dependencies.personnelByNormalizedName.get(normalizedAttn) ?? null;

      if (!handler) {
        warnings.push({
          legacyTable: order.legacyTable,
          legacyId: order.legacyId,
          reason:
            "Handler personnel name (attn) is missing from the migrated personnel snapshot; preserving handlerNameSnapshot without handlerPersonnelId.",
          details: { attn: normalizedAttn },
        });
      } else {
        handlerNameSnapshot = handler.personnelName;
      }
    }
  }

  return { handler, handlerNameSnapshot };
}

function buildOrderArchivedPayload(
  order: LegacySalesReturnOrderRow,
  targetDocumentNo: string,
  auditRow: LegacySalesReturnAuditRow | null,
  resolvedCustomerTargetId: number | null,
): ArchivedFieldPayloadRecord {
  return {
    legacyTable: order.legacyTable,
    legacyId: order.legacyId,
    targetTable: "sales_stock_order",
    targetCode: targetDocumentNo,
    payloadKind: "legacy-unmapped-fields",
    archiveReason:
      "Archive sales-return source-only fields: source_type, source_id, charge_by, raw customer evidence, audit detail, and original document number.",
    payload: {
      chargeBy: normalizeOptionalText(order.chargeBy),
      customerLegacyId: normalizePositiveLegacyId(order.customerLegacyId),
      legacyAudit: auditRow
        ? {
            auditOpinion: normalizeOptionalText(auditRow.auditOpinion),
            auditStatus: normalizeOptionalText(auditRow.auditStatus),
            auditTime: normalizeDateTime(auditRow.auditTime),
            auditor: normalizeOptionalText(auditRow.auditor),
          }
        : null,
      originalDocumentNo: normalizeOptionalText(order.returnNo),
      resolvedCustomerTargetId,
      sourceId: normalizePositiveLegacyId(order.sourceLegacyId),
      sourceType: order.sourceType !== null ? Number(order.sourceType) : null,
    },
  };
}

function buildLineArchivedPayload(
  detail: LegacySalesReturnDetailRow,
  targetCode: string,
  resolvedOutboundLine: CurrentOutboundLineRecord | null,
): ArchivedFieldPayloadRecord {
  return {
    legacyTable: detail.legacyTable,
    legacyId: detail.legacyId,
    targetTable: "sales_stock_order_line",
    targetCode,
    payloadKind: "legacy-unmapped-fields",
    archiveReason:
      "Archive sales-return line source-only fields: interval text (legacy factory number range) and resolved upstream outbound line evidence.",
    payload: {
      interval: normalizeOptionalText(detail.interval),
      legacyUnit: normalizeOptionalText(detail.unit),
      resolvedOutboundLineId: resolvedOutboundLine?.targetLineId ?? null,
      resolvedOutboundOrderId: resolvedOutboundLine?.targetOrderId ?? null,
      resolvedOutboundDocumentNo: resolvedOutboundLine?.documentNo ?? null,
    },
  };
}

function buildExcludedSalesReturnPlan(
  order: LegacySalesReturnOrderRow,
  auditRow: LegacySalesReturnAuditRow | null,
  details: readonly LegacySalesReturnDetailRow[],
  targetDocumentNoCandidate: string | null,
  exclusionReasons: string[],
  isHardBlocker: boolean,
): ExcludedSalesReturnPlanRecord {
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
      attn: normalizeOptionalText(order.attn),
      chargeBy: normalizeOptionalText(order.chargeBy),
      customerLegacyId: normalizePositiveLegacyId(order.customerLegacyId),
      exclusionReasons,
      isHardBlocker,
      lifecycleStatus: toLifecycleStatus(order.delFlag),
      returnDate: normalizeDate(order.returnDate),
      returnNo: normalizeOptionalText(order.returnNo),
      sourceId: normalizePositiveLegacyId(order.sourceLegacyId),
      sourceType: order.sourceType !== null ? Number(order.sourceType) : null,
      targetDocumentNoCandidate,
      details: details.map((detail) => ({
        interval: normalizeOptionalText(detail.interval),
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

/**
 * Derives the workshopId for an admitted order from the following priority chain:
 * 1. Resolved outbound lines (fully unambiguous lines only) — must be consistent.
 * 2. Candidate outbound workshop IDs collected across all admitted lines.
 * 3. First entry in workshopByTargetId (last-resort fallback for historical rows
 *    with no traceable upstream outbound data).
 *
 * Returns `conflict: true` only when fully-resolved outbound lines disagree on
 * workshop, which is still a hard structural blocker.
 */
function deriveWorkshopForOrder(
  admittedLines: PreparedDetail[],
  workshopByTargetId: Map<number, { targetId: number; workshopName: string }>,
  warnings: Array<{
    legacyTable: string;
    legacyId: number | null;
    reason: string;
    details?: Record<string, unknown>;
  }>,
  order: LegacySalesReturnOrderRow,
): { workshopId: number | null; conflict: boolean } {
  const defaultWorkshop =
    Array.from(workshopByTargetId.values()).find(
      (workshop) => workshop.workshopName === DEFAULT_WORKSHOP_NAME,
    ) ?? null;
  const resolvedWorkshopIds = new Set(
    admittedLines
      .filter(
        (
          d,
        ): d is PreparedDetail & {
          resolvedOutboundLine: CurrentOutboundLineRecord;
        } => d.resolvedOutboundLine !== null,
      )
      .map((d) => d.resolvedOutboundLine.workshopId),
  );

  if (resolvedWorkshopIds.size === 1) {
    return { workshopId: getOnlyValue(resolvedWorkshopIds), conflict: false };
  }

  if (resolvedWorkshopIds.size > 1) {
    return { workshopId: null, conflict: true };
  }

  // No fully-resolved lines — derive from candidate workshop IDs across all admitted lines.
  const allCandidateWorkshopIds = new Set(
    admittedLines.flatMap((d) => d.candidateWorkshopIds),
  );

  if (allCandidateWorkshopIds.size === 1) {
    return {
      workshopId: getOnlyValue(allCandidateWorkshopIds),
      conflict: false,
    };
  }

  if (allCandidateWorkshopIds.size > 1) {
    const sorted = Array.from(allCandidateWorkshopIds).sort((a, b) => a - b);
    warnings.push({
      legacyTable: order.legacyTable,
      legacyId: order.legacyId,
      reason:
        "Candidate upstream outbound lines span multiple workshops; using the frozen default workshop for this historical sales-return header.",
      details: {
        candidateWorkshopIds: sorted,
        chosenWorkshopId: defaultWorkshop?.targetId ?? null,
      },
    });
    return { workshopId: defaultWorkshop?.targetId ?? null, conflict: false };
  }

  if (defaultWorkshop !== null) {
    warnings.push({
      legacyTable: order.legacyTable,
      legacyId: order.legacyId,
      reason:
        "No upstream outbound line candidates exist for any admitted line; using the frozen default workshop as last-resort fallback for this historical sales-return header.",
      details: { chosenWorkshopId: defaultWorkshop.targetId },
    });
    return { workshopId: defaultWorkshop.targetId, conflict: false };
  }

  return { workshopId: null, conflict: false };
}

export function buildSalesReturnMigrationPlan(
  snapshot: LegacySalesReturnSnapshot,
  dependencies: SalesReturnDependencySnapshot,
): SalesReturnMigrationPlan {
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
  const admittedOrders: SalesReturnOrderPlanRecord[] = [];
  const excludedDocuments: ExcludedSalesReturnPlanRecord[] = [];
  const documentNoRewrites: Array<{
    originalDocumentNo: string;
    keptLegacyId: number;
    rewrittenDocumentNo: string;
  }> = [];

  for (const issue of dependencies.batch1Baseline.issues) {
    globalBlockers.push({ reason: issue });
  }

  for (const issue of dependencies.outboundBaseBaseline.issues) {
    globalBlockers.push({ reason: issue });
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
    [...dependencies.existingDocumentNos].map((no) => normalizeDocumentKey(no)),
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

  for (const order of [...snapshot.orders].sort(
    (left, right) => left.legacyId - right.legacyId,
  )) {
    const orderKey = buildLegacyKey(order.legacyTable, order.legacyId);
    const auditRow =
      auditByDocumentKey.get(buildLegacyKey("7", order.legacyId)) ?? null;
    const details = detailsByOrderKey.get(orderKey) ?? [];
    const returnNo = normalizeOptionalText(order.returnNo);
    const returnDate = normalizeDate(order.returnDate);
    const structuralExclusionReasons: string[] = [];

    // Structural validity gates — only these may prevent formal admission.
    if (!returnNo) {
      structuralExclusionReasons.push("Return document number is required.");
    }

    if (!returnDate) {
      structuralExclusionReasons.push("Return date is required.");
    }

    if (details.length === 0) {
      structuralExclusionReasons.push(
        "No legacy detail rows were found for this sales-return header.",
      );
    }

    if (structuralExclusionReasons.length > 0) {
      excludedDocuments.push(
        buildExcludedSalesReturnPlan(
          order,
          auditRow,
          details,
          returnNo,
          structuralExclusionReasons,
          true,
        ),
      );
      continue;
    }

    const customerLegacyId = normalizePositiveLegacyId(order.customerLegacyId);
    const resolvedCustomer =
      customerLegacyId !== null
        ? (dependencies.customerByLegacyKey.get(
            buildLegacyKey("saifute_customer", customerLegacyId),
          ) ?? null)
        : null;

    if (customerLegacyId === null) {
      excludedDocuments.push(
        buildExcludedSalesReturnPlan(
          order,
          auditRow,
          details,
          returnNo,
          [
            "Sales-return header is missing customer_id and cannot be admitted without a mapped customer.",
          ],
          true,
        ),
      );
      continue;
    }

    if (!resolvedCustomer) {
      excludedDocuments.push(
        buildExcludedSalesReturnPlan(
          order,
          auditRow,
          details,
          returnNo,
          [
            `Sales-return header customer_id=${customerLegacyId} is not present in the batch1 customer map and cannot be admitted without a mapped customer.`,
          ],
          true,
        ),
      );
      continue;
    }

    const targetCustomerId = resolvedCustomer.targetId;

    // Resolve source_id anchor for outbound order narrowing.
    const sourceLegacyId = normalizePositiveLegacyId(order.sourceLegacyId);
    const sourceAnchorTargetOrderId =
      sourceLegacyId !== null
        ? (dependencies.outboundOrderMapByLegacyId.get(sourceLegacyId)
            ?.targetOrderId ?? null)
        : null;

    // Process each detail line.
    // Structural invalidity (blocked/unmapped material, zero/missing qty) excludes the LINE.
    // Unresolved upstream lineage (no candidate, multiple candidates, missing customer)
    // admits the line with null sourceDocument* fields.
    const resolvedDetails: DetailResolution[] = [];

    for (const detail of [...details].sort(
      (left, right) => left.legacyId - right.legacyId,
    )) {
      const materialLegacyId = normalizePositiveLegacyId(
        detail.materialLegacyId,
      );

      if (materialLegacyId === null) {
        resolvedDetails.push({
          kind: "structural-invalid",
          reason: `Line ${detail.legacyTable}#${detail.legacyId} material_id is missing.`,
          detail,
        });
        continue;
      }

      if (dependencies.blockedMaterialLegacyIds.has(materialLegacyId)) {
        resolvedDetails.push({
          kind: "structural-invalid",
          reason: `Line ${detail.legacyTable}#${detail.legacyId} material is in the blocked-material set and cannot be admitted.`,
          detail,
        });
        continue;
      }

      const material =
        dependencies.materialByLegacyKey.get(
          buildLegacyKey("saifute_material", materialLegacyId),
        ) ?? null;

      if (!material) {
        resolvedDetails.push({
          kind: "structural-invalid",
          reason: `Line ${detail.legacyTable}#${detail.legacyId} material (legacyId=${materialLegacyId}) is not in the batch1 material map.`,
          detail,
        });
        continue;
      }

      // Structural quantity check: returnQty must be parseable and positive.
      const quantity = normalizeDecimalToScale(detail.returnQty, 6);
      const quantityScaled = toScaledInteger(detail.returnQty, 6);

      if (!quantity || quantityScaled === null || quantityScaled <= 0n) {
        resolvedDetails.push({
          kind: "structural-invalid",
          reason: `Line ${detail.legacyTable}#${detail.legacyId} return_qty is required and must be positive.`,
          detail,
        });
        continue;
      }

      const unitPrice =
        normalizeDecimalToScale(detail.unitPrice, 2) ??
        formatScaledInteger(0n, 2);
      const amount = multiplyToAmount(quantity, unitPrice);

      if (!amount) {
        resolvedDetails.push({
          kind: "structural-invalid",
          reason: `Line ${detail.legacyTable}#${detail.legacyId} amount could not be computed.`,
          detail,
        });
        continue;
      }

      // Try to resolve the upstream outbound line.
      // Failure here is NOT a structural blocker — the line is admitted with null sourceDoc*.
      const inventoryUsedRowsForDetail =
        snapshot.inventoryUsedByDetailId.get(detail.legacyId) ?? [];
      const lineResult = resolveLineCandidates(
        detail,
        targetCustomerId,
        returnDate ?? "",
        dependencies.outboundLinesByMaterialId,
        dependencies,
        sourceAnchorTargetOrderId,
        inventoryUsedRowsForDetail,
      );

      resolvedDetails.push({
        kind: "admitted",
        prepared: {
          source: detail,
          material,
          quantity,
          unitPrice,
          amount,
          resolvedOutboundLine: lineResult.resolved,
          nullSourceDocumentReason:
            lineResult.resolved !== null
              ? null
              : (lineResult.reason ?? "no-upstream-line-candidate"),
          candidateWorkshopIds: lineResult.candidateWorkshopIds,
        },
      });
    }

    const structurallyInvalidLines = resolvedDetails.filter(
      (
        d,
      ): d is {
        kind: "structural-invalid";
        reason: string;
        detail: LegacySalesReturnDetailRow;
      } => d.kind === "structural-invalid",
    );
    const admittedLines = resolvedDetails
      .filter(
        (d): d is { kind: "admitted"; prepared: PreparedDetail } =>
          d.kind === "admitted",
      )
      .map((d) => d.prepared);

    if (admittedLines.length === 0) {
      const lineReasons = structurallyInvalidLines.map((d) => d.reason);
      excludedDocuments.push(
        buildExcludedSalesReturnPlan(
          order,
          auditRow,
          details,
          returnNo,
          [
            `All ${details.length} detail line(s) are structurally invalid and cannot be admitted: ${lineReasons.join("; ")}`,
          ],
          true,
        ),
      );
      continue;
    }

    // Emit warnings for structurally invalid lines that did not block the header.
    for (const invalid of structurallyInvalidLines) {
      warnings.push({
        legacyTable: order.legacyTable,
        legacyId: order.legacyId,
        reason: `One detail line is structurally invalid and will be excluded while the header is admitted: ${invalid.reason}`,
        details: { lineId: invalid.detail.legacyId },
      });
    }

    // Derive workshop for the header from the admitted lines.
    const { workshopId, conflict } = deriveWorkshopForOrder(
      admittedLines,
      dependencies.workshopByTargetId,
      warnings,
      order,
    );

    if (conflict) {
      excludedDocuments.push(
        buildExcludedSalesReturnPlan(
          order,
          auditRow,
          details,
          returnNo,
          [
            "Resolved upstream outbound lines for admitted details span multiple workshopIds; header requires a single coherent workshop.",
          ],
          true,
        ),
      );
      continue;
    }

    if (workshopId === null) {
      excludedDocuments.push(
        buildExcludedSalesReturnPlan(
          order,
          auditRow,
          details,
          returnNo,
          [
            "Cannot determine a workshopId for this sales-return header: no upstream outbound candidates exist and no fallback workshops are available.",
          ],
          true,
        ),
      );
      continue;
    }

    const workshopSnap = dependencies.workshopByTargetId.get(workshopId);
    const workshopNameSnapshot =
      workshopSnap?.workshopName ?? `workshop-${workshopId}`;

    const { documentNo, rewritten } = allocateDocumentNo(
      returnNo ?? `TH-FALLBACK-${order.legacyId}`,
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

    const linePlans: SalesReturnLinePlanRecord[] = admittedLines.map(
      (prepared, index) => {
        const lineNo = index + 1;
        const targetCode = `${documentNo}#${lineNo}`;

        const lineTarget: SalesReturnLineTargetInsert = {
          lineNo,
          materialId: prepared.material.targetId,
          materialCodeSnapshot: prepared.material.materialCode,
          materialNameSnapshot: prepared.material.materialName,
          materialSpecSnapshot: prepared.material.specModel,
          unitCodeSnapshot: prepared.material.unitCode,
          quantity: prepared.quantity,
          unitPrice: prepared.unitPrice,
          amount: prepared.amount,
          startNumber: null,
          endNumber: null,
          sourceDocumentType:
            prepared.resolvedOutboundLine !== null
              ? SALES_STOCK_DOCUMENT_TYPE
              : null,
          sourceDocumentId:
            prepared.resolvedOutboundLine?.targetOrderId ?? null,
          sourceDocumentLineId:
            prepared.resolvedOutboundLine?.targetLineId ?? null,
          remark: normalizeOptionalText(prepared.source.remark),
          createdBy: normalizeOptionalText(order.createdBy),
          createdAt,
          updatedBy: normalizeOptionalText(order.updatedBy),
          updatedAt,
        };

        return {
          legacyTable: prepared.source.legacyTable,
          legacyId: prepared.source.legacyId,
          parentLegacyTable: prepared.source.parentLegacyTable,
          parentLegacyId: prepared.source.parentLegacyId,
          targetTable: "sales_stock_order_line",
          targetCode,
          target: lineTarget,
          archivedPayload: buildLineArchivedPayload(
            prepared.source,
            targetCode,
            prepared.resolvedOutboundLine,
          ),
          nullSourceDocumentReason: prepared.nullSourceDocumentReason,
        };
      },
    );

    const customerCodeSnapshot = resolvedCustomer?.customerCode ?? null;
    const customerNameSnapshot = resolvedCustomer?.customerName ?? null;
    const admittedReturnDate = returnDate ?? "";

    const orderTarget: SalesStockOrderTargetInsert = {
      documentNo,
      orderType: "SALES_RETURN",
      bizDate: admittedReturnDate,
      customerId: targetCustomerId,
      handlerPersonnelId: handler?.targetId ?? null,
      workshopId,
      lifecycleStatus,
      auditStatusSnapshot,
      inventoryEffectStatus,
      revisionNo: 1,
      customerCodeSnapshot,
      customerNameSnapshot,
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
      targetTable: "sales_stock_order",
      targetCode: documentNo,
      target: orderTarget,
      lines: linePlans,
      archivedPayload: buildOrderArchivedPayload(
        order,
        documentNo,
        auditRow,
        resolvedCustomer?.targetId ?? null,
      ),
    });
  }

  const counts: SalesReturnPlanCounts = {
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
    admittedLinesWithNullSourceDocument: admittedOrders.reduce(
      (total, order) =>
        total +
        order.lines.filter((l) => l.target.sourceDocumentType === null).length,
      0,
    ),
    pendingRelationLines: 0,
    excludedHeaders: excludedDocuments.length,
    pendingReasonCounts: {},
  };

  return {
    migrationBatch: SALES_RETURN_MIGRATION_BATCH,
    admittedOrders: admittedOrders.sort(
      (left, right) => left.legacyId - right.legacyId,
    ),
    pendingRelations: [],
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
      outboundBaseBaseline: dependencies.outboundBaseBaseline,
      blockedMaterialLegacyIds: Array.from(
        dependencies.blockedMaterialLegacyIds,
      ).sort((left, right) => left - right),
    },
  };
}

export function hasExecutionBlockers(plan: SalesReturnMigrationPlan): boolean {
  return plan.globalBlockers.length > 0;
}

export function buildDryRunSummary(
  plan: SalesReturnMigrationPlan,
): Record<string, unknown> {
  return {
    migrationBatch: plan.migrationBatch,
    counts: plan.counts,
    documentNoRewrites: plan.documentNoRewrites,
    globalBlockers: plan.globalBlockers,
    warnings: plan.warnings,
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
      customerId: order.target.customerId,
      workshopId: order.target.workshopId,
      lineCount: order.lines.length,
      lifecycleStatus: order.target.lifecycleStatus,
      auditStatusSnapshot: order.target.auditStatusSnapshot,
      inventoryEffectStatus: order.target.inventoryEffectStatus,
      lines: order.lines.map((line) => ({
        lineNo: line.target.lineNo,
        materialId: line.target.materialId,
        quantity: line.target.quantity,
        startNumber: line.target.startNumber,
        endNumber: line.target.endNumber,
        sourceDocumentType: line.target.sourceDocumentType,
        sourceDocumentId: line.target.sourceDocumentId,
        sourceDocumentLineId: line.target.sourceDocumentLineId,
        nullSourceDocumentReason: line.nullSourceDocumentReason,
      })),
    })),
    context: plan.context,
  };
}
