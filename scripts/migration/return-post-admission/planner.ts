import type {
  AdmittedLineRow,
  AdmittedOrderRow,
  AdmittedStockInLineRow,
  DocumentFamilyValue,
  DocumentLineRelationInsert,
  DocumentRelationInsert,
  InventoryLogInsert,
  InventoryReplayPlan,
  InventorySourceUsageInsert,
  PostAdmissionBaseline,
  PostAdmissionMigrationPlan,
  PostAdmissionPlanCounts,
  RelationClassification,
  RelationClassificationPlan,
  ReturnLineClassification,
  SourceBackfillPlan,
  SourceBackfillRecord,
  StaleClearRecord,
  UpstreamOutboundLineRow,
  UpstreamPickLineRow,
  WorkflowAuditDocumentInsert,
  WorkflowProjectionPlan,
} from "./types";
import { POST_ADMISSION_MIGRATION_BATCH } from "./types";

function buildBalanceKey(materialId: number, workshopId: number): string {
  return `${materialId}::${workshopId}`;
}

function buildIdempotencyKey(
  prefix: string,
  documentType: string,
  documentId: number,
  lineId: number,
): string {
  return `migration::${prefix}::${documentType}::${documentId}::${lineId}`;
}

function parseDecimalBigInt(s: string): bigint {
  const trimmed = s.trim();
  const isNegative = trimmed.startsWith("-");
  const abs = isNegative ? trimmed.slice(1) : trimmed;
  const dotIndex = abs.indexOf(".");
  const intPart = dotIndex === -1 ? abs : abs.slice(0, dotIndex);
  const fracRaw = dotIndex === -1 ? "" : abs.slice(dotIndex + 1);
  const fracPadded = fracRaw.padEnd(6, "0").slice(0, 6);
  const raw = BigInt(`${intPart}${fracPadded}`);

  return isNegative ? -raw : raw;
}

function formatDecimalBigInt(n: bigint): string {
  const isNeg = n < 0n;
  const abs = isNeg ? -n : n;
  const intPart = abs / 1_000_000n;
  const fracPart = abs % 1_000_000n;

  return `${isNeg ? "-" : ""}${intPart}.${String(fracPart).padStart(6, "0")}`;
}

function addDecimalStrings(a: string, b: string): string {
  return formatDecimalBigInt(parseDecimalBigInt(a) + parseDecimalBigInt(b));
}

function subtractDecimalStrings(a: string, b: string): string {
  return formatDecimalBigInt(parseDecimalBigInt(a) - parseDecimalBigInt(b));
}

function compareDecimalStrings(a: string, b: string): number {
  const diff = parseDecimalBigInt(a) - parseDecimalBigInt(b);

  return diff === 0n ? 0 : diff > 0n ? 1 : -1;
}

function classifySalesReturnLines(
  salesReturnLines: AdmittedLineRow[],
  outboundLines: UpstreamOutboundLineRow[],
): ReturnLineClassification[] {
  const outboundByMaterialId = new Map<number, UpstreamOutboundLineRow[]>();
  const outboundById = new Map<number, UpstreamOutboundLineRow>();

  for (const line of outboundLines) {
    outboundById.set(line.id, line);
    const existing = outboundByMaterialId.get(line.materialId) ?? [];
    existing.push(line);
    outboundByMaterialId.set(line.materialId, existing);
  }

  return salesReturnLines.map((returnLine): ReturnLineClassification => {
    if (
      returnLine.sourceDocumentId !== null &&
      returnLine.sourceDocumentLineId !== null
    ) {
      const referencedLine = outboundById.get(returnLine.sourceDocumentLineId);

      if (
        referencedLine !== undefined &&
        compareDecimalStrings(returnLine.quantity, referencedLine.quantity) ===
          0 &&
        referencedLine.bizDate <= returnLine.bizDate
      ) {
        return {
          lineId: returnLine.id,
          orderId: returnLine.orderId,
          lineNo: returnLine.lineNo,
          materialId: returnLine.materialId,
          documentNo: returnLine.documentNo,
          orderType: "SALES_RETURN",
          classification: "proven",
          currentSourceDocumentId: returnLine.sourceDocumentId,
          currentSourceDocumentLineId: returnLine.sourceDocumentLineId,
          provenUpstreamLineId: referencedLine.id,
          provenUpstreamOrderId: referencedLine.orderId,
          provenUpstreamDocumentNo: referencedLine.documentNo,
          candidateCount: 1,
          candidateSummary: [],
        };
      }
    }

    const candidates = (
      outboundByMaterialId.get(returnLine.materialId) ?? []
    ).filter((candidate) => {
      if (
        compareDecimalStrings(returnLine.quantity, candidate.quantity) !== 0
      ) {
        return false;
      }

      if (candidate.bizDate > returnLine.bizDate) {
        return false;
      }

      if (
        returnLine.customerId !== null &&
        candidate.customerId !== null &&
        returnLine.customerId !== candidate.customerId
      ) {
        return false;
      }

      if (
        returnLine.workshopId !== 0 &&
        candidate.workshopId !== 0 &&
        returnLine.workshopId !== candidate.workshopId
      ) {
        return false;
      }

      return true;
    });

    const classification: RelationClassification =
      candidates.length === 1
        ? "proven"
        : candidates.length === 0
          ? "unresolved"
          : "ambiguous";

    const provenCandidate = candidates.length === 1 ? candidates[0] : null;

    return {
      lineId: returnLine.id,
      orderId: returnLine.orderId,
      lineNo: returnLine.lineNo,
      materialId: returnLine.materialId,
      documentNo: returnLine.documentNo,
      orderType: "SALES_RETURN",
      classification,
      currentSourceDocumentId: returnLine.sourceDocumentId,
      currentSourceDocumentLineId: returnLine.sourceDocumentLineId,
      provenUpstreamLineId: provenCandidate?.id ?? null,
      provenUpstreamOrderId: provenCandidate?.orderId ?? null,
      provenUpstreamDocumentNo: provenCandidate?.documentNo ?? null,
      candidateCount: candidates.length,
      candidateSummary: candidates.slice(0, 10).map((c) => ({
        upstreamLineId: c.id,
        upstreamOrderId: c.orderId,
        upstreamDocumentNo: c.documentNo,
      })),
    };
  });
}

function classifyWorkshopReturnLines(
  workshopReturnLines: AdmittedLineRow[],
  pickLines: UpstreamPickLineRow[],
): ReturnLineClassification[] {
  const pickByMaterialId = new Map<number, UpstreamPickLineRow[]>();
  const pickById = new Map<number, UpstreamPickLineRow>();

  for (const line of pickLines) {
    pickById.set(line.id, line);
    const existing = pickByMaterialId.get(line.materialId) ?? [];
    existing.push(line);
    pickByMaterialId.set(line.materialId, existing);
  }

  return workshopReturnLines.map((returnLine): ReturnLineClassification => {
    if (
      returnLine.sourceDocumentId !== null &&
      returnLine.sourceDocumentLineId !== null
    ) {
      const referencedLine = pickById.get(returnLine.sourceDocumentLineId);

      if (
        referencedLine !== undefined &&
        compareDecimalStrings(returnLine.quantity, referencedLine.quantity) ===
          0 &&
        referencedLine.bizDate <= returnLine.bizDate
      ) {
        return {
          lineId: returnLine.id,
          orderId: returnLine.orderId,
          lineNo: returnLine.lineNo,
          materialId: returnLine.materialId,
          documentNo: returnLine.documentNo,
          orderType: "RETURN",
          classification: "proven",
          currentSourceDocumentId: returnLine.sourceDocumentId,
          currentSourceDocumentLineId: returnLine.sourceDocumentLineId,
          provenUpstreamLineId: referencedLine.id,
          provenUpstreamOrderId: referencedLine.orderId,
          provenUpstreamDocumentNo: referencedLine.documentNo,
          candidateCount: 1,
          candidateSummary: [],
        };
      }
    }

    const candidates = (
      pickByMaterialId.get(returnLine.materialId) ?? []
    ).filter((candidate) => {
      if (
        compareDecimalStrings(returnLine.quantity, candidate.quantity) !== 0
      ) {
        return false;
      }

      if (candidate.bizDate > returnLine.bizDate) {
        return false;
      }

      if (
        returnLine.workshopId !== 0 &&
        candidate.workshopId !== 0 &&
        returnLine.workshopId !== candidate.workshopId
      ) {
        return false;
      }

      return true;
    });

    const classification: RelationClassification =
      candidates.length === 1
        ? "proven"
        : candidates.length === 0
          ? "unresolved"
          : "ambiguous";

    const provenCandidate = candidates.length === 1 ? candidates[0] : null;

    return {
      lineId: returnLine.id,
      orderId: returnLine.orderId,
      lineNo: returnLine.lineNo,
      materialId: returnLine.materialId,
      documentNo: returnLine.documentNo,
      orderType: "RETURN",
      classification,
      currentSourceDocumentId: returnLine.sourceDocumentId,
      currentSourceDocumentLineId: returnLine.sourceDocumentLineId,
      provenUpstreamLineId: provenCandidate?.id ?? null,
      provenUpstreamOrderId: provenCandidate?.orderId ?? null,
      provenUpstreamDocumentNo: provenCandidate?.documentNo ?? null,
      candidateCount: candidates.length,
      candidateSummary: candidates.slice(0, 10).map((c) => ({
        upstreamLineId: c.id,
        upstreamOrderId: c.orderId,
        upstreamDocumentNo: c.documentNo,
      })),
    };
  });
}

function buildRelationClassificationPlan(
  salesReturnClassifications: ReturnLineClassification[],
  workshopReturnClassifications: ReturnLineClassification[],
): RelationClassificationPlan {
  const all = [...salesReturnClassifications, ...workshopReturnClassifications];
  const alreadyLinkedCount = all.filter(
    (c) => c.classification === "proven" && c.currentSourceDocumentId !== null,
  ).length;
  const provenCount = all.filter((c) => c.classification === "proven").length;
  const unresolvedCount = all.filter(
    (c) => c.classification === "unresolved",
  ).length;
  const ambiguousCount = all.filter(
    (c) => c.classification === "ambiguous",
  ).length;

  return {
    salesReturnClassifications,
    workshopReturnClassifications,
    provenCount,
    unresolvedCount,
    ambiguousCount,
    alreadyLinkedCount,
  };
}

function buildSourceBackfillPlan(
  salesReturnClassifications: ReturnLineClassification[],
  workshopReturnClassifications: ReturnLineClassification[],
  salesReturnLines: AdmittedLineRow[],
  workshopReturnLines: AdmittedLineRow[],
  outboundLines: UpstreamOutboundLineRow[],
  pickLines: UpstreamPickLineRow[],
): SourceBackfillPlan {
  const backfillRecords: SourceBackfillRecord[] = [];
  const documentRelations: DocumentRelationInsert[] = [];
  const documentLineRelations: DocumentLineRelationInsert[] = [];
  const staleClearRecords: StaleClearRecord[] = [];

  const salesReturnLineById = new Map(
    salesReturnLines.map((line) => [line.id, line] as const),
  );
  const outboundLineById = new Map(
    outboundLines.map((line) => [line.id, line] as const),
  );
  const workshopReturnLineById = new Map(
    workshopReturnLines.map((line) => [line.id, line] as const),
  );
  const pickLineById = new Map(
    pickLines.map((line) => [line.id, line] as const),
  );

  const seenHeaderRelations = new Set<string>();

  for (const classification of salesReturnClassifications) {
    if (
      classification.classification !== "proven" ||
      classification.provenUpstreamLineId === null ||
      classification.provenUpstreamOrderId === null
    ) {
      continue;
    }

    const returnLine = salesReturnLineById.get(classification.lineId);
    const upstreamLine = outboundLineById.get(
      classification.provenUpstreamLineId,
    );

    if (!returnLine || !upstreamLine) {
      continue;
    }

    const srStalePrelinkDiffers =
      returnLine.sourceDocumentId !== null &&
      returnLine.sourceDocumentLineId !== classification.provenUpstreamLineId;

    if (srStalePrelinkDiffers) {
      staleClearRecords.push({
        lineId: classification.lineId,
        documentTable: "customer_stock_order_line",
      });
    }

    if (returnLine.sourceDocumentId === null || srStalePrelinkDiffers) {
      backfillRecords.push({
        lineId: classification.lineId,
        sourceDocumentType: "CustomerStockOrder",
        sourceDocumentId: classification.provenUpstreamOrderId,
        sourceDocumentLineId: classification.provenUpstreamLineId,
      });
    }

    const headerRelationKey = `CUSTOMER_STOCK::${upstreamLine.orderId}::${returnLine.orderId}`;

    if (!seenHeaderRelations.has(headerRelationKey)) {
      seenHeaderRelations.add(headerRelationKey);
      documentRelations.push({
        relationType: "SALES_RETURN_FROM_OUTBOUND",
        upstreamFamily: "CUSTOMER_STOCK",
        upstreamDocumentType: "CustomerStockOrder",
        upstreamDocumentId: upstreamLine.orderId,
        downstreamFamily: "CUSTOMER_STOCK",
        downstreamDocumentType: "CustomerStockOrder",
        downstreamDocumentId: returnLine.orderId,
        isActive: returnLine.lifecycleStatus === "EFFECTIVE",
      });
    }

    documentLineRelations.push({
      relationType: "SALES_RETURN_FROM_OUTBOUND",
      upstreamFamily: "CUSTOMER_STOCK",
      upstreamDocumentType: "CustomerStockOrder",
      upstreamDocumentId: upstreamLine.orderId,
      upstreamLineId: upstreamLine.id,
      downstreamFamily: "CUSTOMER_STOCK",
      downstreamDocumentType: "CustomerStockOrder",
      downstreamDocumentId: returnLine.orderId,
      downstreamLineId: returnLine.id,
      linkedQty: returnLine.quantity,
    });
  }

  for (const classification of workshopReturnClassifications) {
    if (
      classification.classification !== "proven" ||
      classification.provenUpstreamLineId === null ||
      classification.provenUpstreamOrderId === null
    ) {
      continue;
    }

    const returnLine = workshopReturnLineById.get(classification.lineId);
    const upstreamLine = pickLineById.get(classification.provenUpstreamLineId);

    if (!returnLine || !upstreamLine) {
      continue;
    }

    const wrStalePrelinkDiffers =
      returnLine.sourceDocumentId !== null &&
      returnLine.sourceDocumentLineId !== classification.provenUpstreamLineId;

    if (wrStalePrelinkDiffers) {
      staleClearRecords.push({
        lineId: classification.lineId,
        documentTable: "workshop_material_order_line",
      });
    }

    if (returnLine.sourceDocumentId === null || wrStalePrelinkDiffers) {
      backfillRecords.push({
        lineId: classification.lineId,
        sourceDocumentType: "WorkshopMaterialOrder",
        sourceDocumentId: classification.provenUpstreamOrderId,
        sourceDocumentLineId: classification.provenUpstreamLineId,
      });
    }

    const headerRelationKey = `WORKSHOP_MATERIAL::${upstreamLine.orderId}::${returnLine.orderId}`;

    if (!seenHeaderRelations.has(headerRelationKey)) {
      seenHeaderRelations.add(headerRelationKey);
      documentRelations.push({
        relationType: "WORKSHOP_RETURN_FROM_PICK",
        upstreamFamily: "WORKSHOP_MATERIAL",
        upstreamDocumentType: "WorkshopMaterialOrder",
        upstreamDocumentId: upstreamLine.orderId,
        downstreamFamily: "WORKSHOP_MATERIAL",
        downstreamDocumentType: "WorkshopMaterialOrder",
        downstreamDocumentId: returnLine.orderId,
        isActive: returnLine.lifecycleStatus === "EFFECTIVE",
      });
    }

    documentLineRelations.push({
      relationType: "WORKSHOP_RETURN_FROM_PICK",
      upstreamFamily: "WORKSHOP_MATERIAL",
      upstreamDocumentType: "WorkshopMaterialOrder",
      upstreamDocumentId: upstreamLine.orderId,
      upstreamLineId: upstreamLine.id,
      downstreamFamily: "WORKSHOP_MATERIAL",
      downstreamDocumentType: "WorkshopMaterialOrder",
      downstreamDocumentId: returnLine.orderId,
      downstreamLineId: returnLine.id,
      linkedQty: returnLine.quantity,
    });
  }

  for (const classification of salesReturnClassifications) {
    if (
      classification.currentSourceDocumentId !== null &&
      classification.classification !== "proven"
    ) {
      staleClearRecords.push({
        lineId: classification.lineId,
        documentTable: "customer_stock_order_line",
      });
    }
  }

  for (const classification of workshopReturnClassifications) {
    if (
      classification.currentSourceDocumentId !== null &&
      classification.classification !== "proven"
    ) {
      staleClearRecords.push({
        lineId: classification.lineId,
        documentTable: "workshop_material_order_line",
      });
    }
  }

  return {
    backfillRecords,
    documentRelations,
    documentLineRelations,
    staleClearRecords,
  };
}

interface ReplayLineInput {
  lineId: number;
  orderId: number;
  lineNo: number;
  materialId: number;
  workshopId: number;
  quantity: string;
  documentType: string;
  documentId: number;
  documentNumber: string;
  businessModule: string;
  direction: "IN" | "OUT";
  operationType: string;
  lifecycleStatus: string;
  inventoryEffectStatus: string;
  bizDate: string;
}

function buildInventoryReplayPlan(
  stockInLines: AdmittedStockInLineRow[],
  outboundLines: UpstreamOutboundLineRow[],
  salesReturnLines: AdmittedLineRow[],
  pickLines: UpstreamPickLineRow[],
  workshopReturnLines: AdmittedLineRow[],
  salesReturnClassifications: ReturnLineClassification[],
  workshopReturnClassifications: ReturnLineClassification[],
): InventoryReplayPlan {
  const logInserts: InventoryLogInsert[] = [];
  const sourceUsageInserts: InventorySourceUsageInsert[] = [];
  const unresolvedSourceUsageGaps: InventoryReplayPlan["unresolvedSourceUsageGaps"] =
    [];

  const balanceMap = new Map<string, string>();

  const allLines: ReplayLineInput[] = [
    ...stockInLines.map((line) => ({
      lineId: line.id,
      orderId: line.orderId,
      lineNo: line.lineNo,
      materialId: line.materialId,
      workshopId: line.workshopId,
      quantity: line.quantity,
      documentType: "StockInOrder",
      documentId: line.orderId,
      documentNumber: line.documentNo,
      businessModule: "inbound",
      direction: "IN" as const,
      operationType:
        line.orderType === "ACCEPTANCE"
          ? "ACCEPTANCE_IN"
          : "PRODUCTION_RECEIPT_IN",
      lifecycleStatus: line.lifecycleStatus,
      inventoryEffectStatus: line.inventoryEffectStatus,
      bizDate: line.bizDate,
    })),
    ...outboundLines.map((line) => ({
      lineId: line.id,
      orderId: line.orderId,
      lineNo: line.lineNo,
      materialId: line.materialId,
      workshopId: line.workshopId,
      quantity: line.quantity,
      documentType: "CustomerStockOrder",
      documentId: line.orderId,
      documentNumber: line.documentNo,
      businessModule: "customer",
      direction: "OUT" as const,
      operationType: "OUTBOUND_OUT",
      lifecycleStatus: line.lifecycleStatus,
      inventoryEffectStatus: line.inventoryEffectStatus,
      bizDate: line.bizDate,
    })),
    ...salesReturnLines.map((line) => ({
      lineId: line.id,
      orderId: line.orderId,
      lineNo: line.lineNo,
      materialId: line.materialId,
      workshopId: line.workshopId,
      quantity: line.quantity,
      documentType: "CustomerStockOrder",
      documentId: line.orderId,
      documentNumber: line.documentNo,
      businessModule: "customer",
      direction: "IN" as const,
      operationType: "SALES_RETURN_IN",
      lifecycleStatus: line.lifecycleStatus,
      inventoryEffectStatus: line.inventoryEffectStatus,
      bizDate: line.bizDate,
    })),
    ...pickLines.map((line) => ({
      lineId: line.id,
      orderId: line.orderId,
      lineNo: line.lineNo,
      materialId: line.materialId,
      workshopId: line.workshopId,
      quantity: line.quantity,
      documentType: "WorkshopMaterialOrder",
      documentId: line.orderId,
      documentNumber: line.documentNo,
      businessModule: "workshop-material",
      direction: "OUT" as const,
      operationType: "PICK_OUT",
      lifecycleStatus: line.lifecycleStatus,
      inventoryEffectStatus: line.inventoryEffectStatus,
      bizDate: line.bizDate,
    })),
    ...workshopReturnLines.map((line) => ({
      lineId: line.id,
      orderId: line.orderId,
      lineNo: line.lineNo,
      materialId: line.materialId,
      workshopId: line.workshopId,
      quantity: line.quantity,
      documentType: "WorkshopMaterialOrder",
      documentId: line.orderId,
      documentNumber: line.documentNo,
      businessModule: "workshop-material",
      direction: "IN" as const,
      operationType: "RETURN_IN",
      lifecycleStatus: line.lifecycleStatus,
      inventoryEffectStatus: line.inventoryEffectStatus,
      bizDate: line.bizDate,
    })),
  ];

  allLines.sort((a, b) => {
    const dateCompare = a.bizDate.localeCompare(b.bizDate);

    if (dateCompare !== 0) {
      return dateCompare;
    }

    const docNumCompare = a.documentNumber.localeCompare(b.documentNumber);

    if (docNumCompare !== 0) {
      return docNumCompare;
    }

    return a.lineNo - b.lineNo;
  });

  for (const line of allLines) {
    const balanceKey = buildBalanceKey(line.materialId, line.workshopId);
    const currentBalance = balanceMap.get(balanceKey) ?? "0.000000";

    const primaryKey = buildIdempotencyKey(
      "replay",
      line.documentType,
      line.documentId,
      line.lineId,
    );

    if (line.inventoryEffectStatus === "POSTED") {
      let afterQty: string;

      if (line.direction === "IN") {
        afterQty = addDecimalStrings(currentBalance, line.quantity);
      } else {
        afterQty = subtractDecimalStrings(currentBalance, line.quantity);
      }

      logInserts.push({
        idempotencyKey: primaryKey,
        balanceKey,
        materialId: line.materialId,
        workshopId: line.workshopId,
        direction: line.direction,
        operationType:
          line.operationType as InventoryLogInsert["operationType"],
        businessModule: line.businessModule,
        businessDocumentType: line.documentType,
        businessDocumentId: line.documentId,
        businessDocumentNumber: line.documentNumber,
        businessDocumentLineId: line.lineId,
        changeQty: line.quantity,
        note: null,
        isReversal: false,
        primaryIdempotencyKey: null,
      });

      balanceMap.set(balanceKey, afterQty);
    } else if (line.inventoryEffectStatus === "REVERSED") {
      const beforeQty = currentBalance;

      logInserts.push({
        idempotencyKey: primaryKey,
        balanceKey,
        materialId: line.materialId,
        workshopId: line.workshopId,
        direction: line.direction,
        operationType:
          line.operationType as InventoryLogInsert["operationType"],
        businessModule: line.businessModule,
        businessDocumentType: line.documentType,
        businessDocumentId: line.documentId,
        businessDocumentNumber: line.documentNumber,
        businessDocumentLineId: line.lineId,
        changeQty: line.quantity,
        note: "original-pre-reversal",
        isReversal: false,
        primaryIdempotencyKey: null,
      });

      const reversalDirection: "IN" | "OUT" =
        line.direction === "IN" ? "OUT" : "IN";
      const reversalOperation: InventoryLogInsert["operationType"] =
        line.direction === "IN" ? "REVERSAL_OUT" : "REVERSAL_IN";
      const reversalKey = buildIdempotencyKey(
        "reversal",
        line.documentType,
        line.documentId,
        line.lineId,
      );

      logInserts.push({
        idempotencyKey: reversalKey,
        balanceKey,
        materialId: line.materialId,
        workshopId: line.workshopId,
        direction: reversalDirection,
        operationType: reversalOperation,
        businessModule: line.businessModule,
        businessDocumentType: line.documentType,
        businessDocumentId: line.documentId,
        businessDocumentNumber: line.documentNumber,
        businessDocumentLineId: line.lineId,
        changeQty: line.quantity,
        note: "reversal",
        isReversal: true,
        primaryIdempotencyKey: primaryKey,
      });

      balanceMap.set(balanceKey, beforeQty);
    }
  }

  const salesReturnClassificationByLineId = new Map(
    salesReturnClassifications.map((c) => [c.lineId, c] as const),
  );
  const workshopReturnClassificationByLineId = new Map(
    workshopReturnClassifications.map((c) => [c.lineId, c] as const),
  );

  for (const line of salesReturnLines) {
    const classification = salesReturnClassificationByLineId.get(line.id);

    if (!classification || classification.classification !== "proven") {
      if (line.inventoryEffectStatus === "POSTED") {
        unresolvedSourceUsageGaps.push({
          returnLineId: line.id,
          returnDocumentNo: line.documentNo,
          orderType: "SALES_RETURN",
          reason:
            classification?.classification === "ambiguous"
              ? "ambiguous-upstream"
              : "unresolved-upstream",
        });
      }

      continue;
    }

    if (
      classification.provenUpstreamLineId === null ||
      line.inventoryEffectStatus !== "POSTED"
    ) {
      continue;
    }

    const upstreamLine = outboundLines.find(
      (l) => l.id === classification.provenUpstreamLineId,
    );

    if (!upstreamLine || upstreamLine.inventoryEffectStatus !== "POSTED") {
      unresolvedSourceUsageGaps.push({
        returnLineId: line.id,
        returnDocumentNo: line.documentNo,
        orderType: "SALES_RETURN",
        reason: "upstream-line-not-posted",
      });
      continue;
    }

    const sourceIdempotencyKey = buildIdempotencyKey(
      "replay",
      "CustomerStockOrder",
      upstreamLine.orderId,
      upstreamLine.id,
    );

    if (compareDecimalStrings(line.quantity, upstreamLine.quantity) !== 0) {
      unresolvedSourceUsageGaps.push({
        returnLineId: line.id,
        returnDocumentNo: line.documentNo,
        orderType: "SALES_RETURN",
        reason: `quantity-mismatch: return=${line.quantity} upstream=${upstreamLine.quantity}`,
      });
      continue;
    }

    sourceUsageInserts.push({
      materialId: line.materialId,
      sourceLogIdempotencyKey: sourceIdempotencyKey,
      consumerDocumentType: "CustomerStockOrder",
      consumerDocumentId: line.orderId,
      consumerLineId: line.id,
      allocatedQty: line.quantity,
      status: "RELEASED",
    });
  }

  for (const line of workshopReturnLines) {
    const classification = workshopReturnClassificationByLineId.get(line.id);

    if (!classification || classification.classification !== "proven") {
      if (line.inventoryEffectStatus === "POSTED") {
        unresolvedSourceUsageGaps.push({
          returnLineId: line.id,
          returnDocumentNo: line.documentNo,
          orderType: "RETURN",
          reason:
            classification?.classification === "ambiguous"
              ? "ambiguous-upstream"
              : "unresolved-upstream",
        });
      }

      continue;
    }

    if (
      classification.provenUpstreamLineId === null ||
      line.inventoryEffectStatus !== "POSTED"
    ) {
      continue;
    }

    const upstreamLine = pickLines.find(
      (l) => l.id === classification.provenUpstreamLineId,
    );

    if (!upstreamLine || upstreamLine.inventoryEffectStatus !== "POSTED") {
      unresolvedSourceUsageGaps.push({
        returnLineId: line.id,
        returnDocumentNo: line.documentNo,
        orderType: "RETURN",
        reason: "upstream-line-not-posted",
      });
      continue;
    }

    const sourceIdempotencyKey = buildIdempotencyKey(
      "replay",
      "WorkshopMaterialOrder",
      upstreamLine.orderId,
      upstreamLine.id,
    );

    if (compareDecimalStrings(line.quantity, upstreamLine.quantity) !== 0) {
      unresolvedSourceUsageGaps.push({
        returnLineId: line.id,
        returnDocumentNo: line.documentNo,
        orderType: "RETURN",
        reason: `quantity-mismatch: return=${line.quantity} upstream=${upstreamLine.quantity}`,
      });
      continue;
    }

    sourceUsageInserts.push({
      materialId: line.materialId,
      sourceLogIdempotencyKey: sourceIdempotencyKey,
      consumerDocumentType: "WorkshopMaterialOrder",
      consumerDocumentId: line.orderId,
      consumerLineId: line.id,
      allocatedQty: line.quantity,
      status: "RELEASED",
    });
  }

  return {
    logInserts,
    sourceUsageInserts,
    unresolvedSourceUsageGaps,
  };
}

function buildWorkflowProjectionPlan(
  stockInOrders: AdmittedOrderRow[],
  outboundOrders: AdmittedOrderRow[],
  salesReturnOrders: AdmittedOrderRow[],
  pickOrders: AdmittedOrderRow[],
  workshopReturnOrders: AdmittedOrderRow[],
): WorkflowProjectionPlan {
  const workflowDocumentInserts: WorkflowAuditDocumentInsert[] = [];

  function addWorkflowRows(
    orders: AdmittedOrderRow[],
    documentFamily: DocumentFamilyValue,
    documentType: string,
  ): void {
    for (const order of orders) {
      if (order.auditStatusSnapshot === "NOT_REQUIRED") {
        continue;
      }

      if (order.lifecycleStatus !== "EFFECTIVE") {
        continue;
      }

      workflowDocumentInserts.push({
        documentFamily,
        documentType,
        documentId: order.id,
        documentNumber: order.documentNo,
        auditStatus: order.auditStatusSnapshot,
      });
    }
  }

  addWorkflowRows(stockInOrders, "STOCK_IN", "StockInOrder");
  addWorkflowRows(outboundOrders, "CUSTOMER_STOCK", "CustomerStockOrder");
  addWorkflowRows(salesReturnOrders, "CUSTOMER_STOCK", "CustomerStockOrder");
  addWorkflowRows(pickOrders, "WORKSHOP_MATERIAL", "WorkshopMaterialOrder");
  addWorkflowRows(
    workshopReturnOrders,
    "WORKSHOP_MATERIAL",
    "WorkshopMaterialOrder",
  );

  workflowDocumentInserts.sort((a, b) => {
    const familyCompare = a.documentFamily.localeCompare(b.documentFamily);

    if (familyCompare !== 0) {
      return familyCompare;
    }

    return a.documentId - b.documentId;
  });

  return {
    workflowDocumentInserts,
  };
}

export function buildPostAdmissionMigrationPlan(
  baseline: PostAdmissionBaseline,
): PostAdmissionMigrationPlan {
  const salesReturnClassifications = classifySalesReturnLines(
    baseline.salesReturnLines,
    baseline.outboundLines,
  );

  const workshopReturnClassifications = classifyWorkshopReturnLines(
    baseline.workshopReturnLines,
    baseline.pickLines,
  );

  const relation = buildRelationClassificationPlan(
    salesReturnClassifications,
    workshopReturnClassifications,
  );

  const backfill = buildSourceBackfillPlan(
    salesReturnClassifications,
    workshopReturnClassifications,
    baseline.salesReturnLines,
    baseline.workshopReturnLines,
    baseline.outboundLines,
    baseline.pickLines,
  );

  const outboundLinesForReplay =
    baseline.outboundLines as UpstreamOutboundLineRow[];
  const pickLinesForReplay = baseline.pickLines as UpstreamPickLineRow[];

  const replay = buildInventoryReplayPlan(
    baseline.stockInLines,
    outboundLinesForReplay,
    baseline.salesReturnLines,
    pickLinesForReplay,
    baseline.workshopReturnLines,
    salesReturnClassifications,
    workshopReturnClassifications,
  );

  const workflow = buildWorkflowProjectionPlan(
    baseline.stockInOrders,
    baseline.outboundOrders,
    baseline.salesReturnOrders,
    baseline.pickOrders,
    baseline.workshopReturnOrders,
  );

  const counts: PostAdmissionPlanCounts = {
    admittedSalesReturnOrders: baseline.salesReturnOrders.length,
    admittedSalesReturnLines: baseline.salesReturnLines.length,
    admittedWorkshopReturnOrders: baseline.workshopReturnOrders.length,
    admittedWorkshopReturnLines: baseline.workshopReturnLines.length,
    provenRelations: relation.provenCount,
    unresolvedRelations: relation.unresolvedCount,
    ambiguousRelations: relation.ambiguousCount,
    alreadyLinkedLines: relation.alreadyLinkedCount,
    staleSourceFieldsToClean: backfill.staleClearRecords.length,
    documentRelationsToInsert: backfill.documentRelations.length,
    documentLineRelationsToInsert: backfill.documentLineRelations.length,
    sourceBackfillsToApply: backfill.backfillRecords.length,
    inventoryLogInserts: replay.logInserts.length,
    sourceUsageInserts: replay.sourceUsageInserts.length,
    sourceUsageGaps: replay.unresolvedSourceUsageGaps.length,
    workflowDocumentInserts: workflow.workflowDocumentInserts.length,
  };

  const globalBlockers: PostAdmissionMigrationPlan["globalBlockers"] = [];

  if (
    counts.admittedSalesReturnOrders !== 9 ||
    counts.admittedSalesReturnLines !== 13
  ) {
    globalBlockers.push({
      reason:
        "Admitted sales-return baseline does not match the reviewed-no-findings expectation of 9 orders and 13 lines.",
      details: {
        expectedOrders: 9,
        expectedLines: 13,
        actualOrders: counts.admittedSalesReturnOrders,
        actualLines: counts.admittedSalesReturnLines,
      },
    });
  }

  if (
    counts.admittedWorkshopReturnOrders !== 3 ||
    counts.admittedWorkshopReturnLines !== 4
  ) {
    globalBlockers.push({
      reason:
        "Admitted workshop-return baseline does not match the reviewed-no-findings expectation of 3 orders and 4 lines.",
      details: {
        expectedOrders: 3,
        expectedLines: 4,
        actualOrders: counts.admittedWorkshopReturnOrders,
        actualLines: counts.admittedWorkshopReturnLines,
      },
    });
  }

  return {
    migrationBatch: POST_ADMISSION_MIGRATION_BATCH,
    relation,
    backfill,
    replay,
    workflow,
    globalBlockers,
    warnings: [],
    counts,
  };
}

export function buildDryRunSummary(
  plan: PostAdmissionMigrationPlan,
): Record<string, unknown> {
  return {
    migrationBatch: plan.migrationBatch,
    globalBlockers: plan.globalBlockers,
    warnings: plan.warnings,
    counts: plan.counts,
    relationSummary: {
      salesReturn: {
        provenCount: plan.relation.salesReturnClassifications.filter(
          (c) => c.classification === "proven",
        ).length,
        unresolvedCount: plan.relation.salesReturnClassifications.filter(
          (c) => c.classification === "unresolved",
        ).length,
        ambiguousCount: plan.relation.salesReturnClassifications.filter(
          (c) => c.classification === "ambiguous",
        ).length,
        alreadyLinkedCount: plan.relation.salesReturnClassifications.filter(
          (c) =>
            c.classification === "proven" && c.currentSourceDocumentId !== null,
        ).length,
      },
      workshopReturn: {
        provenCount: plan.relation.workshopReturnClassifications.filter(
          (c) => c.classification === "proven",
        ).length,
        unresolvedCount: plan.relation.workshopReturnClassifications.filter(
          (c) => c.classification === "unresolved",
        ).length,
        ambiguousCount: plan.relation.workshopReturnClassifications.filter(
          (c) => c.classification === "ambiguous",
        ).length,
        alreadyLinkedCount: plan.relation.workshopReturnClassifications.filter(
          (c) =>
            c.classification === "proven" && c.currentSourceDocumentId !== null,
        ).length,
      },
    },
    unresolvedSourceUsageGaps: plan.replay.unresolvedSourceUsageGaps,
    classificationDetails: {
      salesReturn: plan.relation.salesReturnClassifications.map((c) => ({
        lineId: c.lineId,
        documentNo: c.documentNo,
        lineNo: c.lineNo,
        materialId: c.materialId,
        classification: c.classification,
        candidateCount: c.candidateCount,
        provenUpstreamDocumentNo: c.provenUpstreamDocumentNo,
      })),
      workshopReturn: plan.relation.workshopReturnClassifications.map((c) => ({
        lineId: c.lineId,
        documentNo: c.documentNo,
        lineNo: c.lineNo,
        materialId: c.materialId,
        classification: c.classification,
        candidateCount: c.candidateCount,
        provenUpstreamDocumentNo: c.provenUpstreamDocumentNo,
      })),
    },
  };
}

export function hasExecutionBlockers(
  plan: PostAdmissionMigrationPlan,
): boolean {
  return plan.globalBlockers.length > 0;
}
