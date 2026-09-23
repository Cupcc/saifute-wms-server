import { Prisma, StockDirection } from "../../../../generated/prisma/client";
import type { InventoryRepository } from "../infrastructure/inventory.repository";
import { inventoryPriceLayerRowKey } from "../infrastructure/inventory-price-layer-log-page.repository";

type DecimalInput = Prisma.Decimal | string | number;
type Log = {
  id: number;
  materialId: number;
  stockScopeId: number | null;
  projectTargetId?: number | null;
  direction: string;
  changeQty: DecimalInput;
  unitCost?: DecimalInput | null;
  costAmount?: DecimalInput | null;
  operationType?: string;
  note?: string | null;
  reversalOfLogId?: number | null;
  reversalOfLog?: {
    direction: string;
    operationType: string;
    note?: string | null;
    costAllocations?: Allocation[];
  } | null;
  costAllocations?: Allocation[];
};
type LayerSourceStatus = "VERIFIED" | "SOURCE_UNRESOLVED";
type Allocation = {
  sourceLogId: number;
  direction: string;
  quantity: DecimalInput;
  unitCost: DecimalInput;
  costAmount: DecimalInput;
  sourceLog?: {
    materialId?: number;
    stockScopeId?: number | null;
    projectTargetId: number | null;
    businessDocumentNumber?: string;
    businessDocumentLineId?: number | null;
  };
};
type Layer = {
  unitCost: Prisma.Decimal;
  changeQty: Prisma.Decimal;
  costAmount: Prisma.Decimal;
  projectTargetId: number | null;
  beforeQty: Prisma.Decimal | null;
  afterQty: Prisma.Decimal | null;
  sourceStatus: LayerSourceStatus;
  sources: {
    sourceLogId: number;
    quantity: Prisma.Decimal;
    documentNumber?: string;
    documentLineId?: number | null;
  }[];
};

// Linked returns restore original layers; their average is not a new layer.
function isSingleLayerReceipt(
  log: Pick<Log, "direction" | "operationType" | "note">,
) {
  if (log.direction !== StockDirection.IN) return false;
  if (
    [
      "ACCEPTANCE_IN",
      "PRODUCTION_RECEIPT_IN",
      "PRICE_CORRECTION_IN",
      "RD_HANDOFF_IN",
      "RD_STOCKTAKE_IN",
      "RD_RETURN_IN",
    ].includes(log.operationType ?? "")
  )
    return true;
  return [
    "Standalone sales return source accepted",
    "Accepted standalone workshop return source",
    "Historical linked sales return had insufficient releasable source usage",
    "Historical linked workshop return had insufficient releasable source usage",
    "人工确认",
  ].some((prefix) => log.note?.startsWith(prefix));
}

function layersFor(log: Log): Layer[] {
  const grouped = new Map<string, Layer>();
  // Older reversal rows were written before the allocation table existed.
  // Their original OUT row is still authoritative, so replay the original
  // split in the opposite direction instead of marking the reversal unknown.
  const ownAllocations = log.costAllocations ?? [];
  const allocations = ownAllocations.length
    ? ownAllocations
    : (log.reversalOfLog?.costAllocations ?? []).map((allocation) => ({
        ...allocation,
        direction: log.direction,
      }));
  if (!allocations.length) {
    // A legacy transaction can still have a reliable price/quantity snapshot
    // even when its source split was never persisted. Keep the quantity in
    // the price-layer replay and expose the missing source evidence as a
    // separate status instead of blocking the balance calculation.
    const known =
      isSingleLayerReceipt(log) ||
      (log.reversalOfLog && isSingleLayerReceipt(log.reversalOfLog));
    if (log.unitCost == null) return [];
    const quantity = new Prisma.Decimal(log.changeQty);
    const unitCost = new Prisma.Decimal(log.unitCost);
    return [
      {
        unitCost,
        changeQty: quantity,
        costAmount:
          log.costAmount == null
            ? quantity.mul(unitCost)
            : new Prisma.Decimal(log.costAmount),
        projectTargetId: log.projectTargetId ?? null,
        beforeQty: null,
        afterQty: null,
        sources: [],
        sourceStatus: known ? "VERIFIED" : "SOURCE_UNRESOLVED",
      },
    ];
  }
  const sumQty = allocations.reduce(
    (s, a) => s.add(a.quantity),
    new Prisma.Decimal(0),
  );
  const sumCost = allocations.reduce(
    (s, a) => s.add(a.costAmount),
    new Prisma.Decimal(0),
  );
  if (
    !sumQty.eq(log.changeQty) ||
    (log.costAmount != null && !sumCost.eq(log.costAmount))
  )
    return [];
  for (const a of allocations) {
    if (a.direction !== log.direction || new Prisma.Decimal(a.quantity).lte(0))
      return [];
    if (
      (a.sourceLog?.materialId != null &&
        a.sourceLog.materialId !== log.materialId) ||
      (a.sourceLog?.stockScopeId !== undefined &&
        a.sourceLog.stockScopeId !== log.stockScopeId)
    ) {
      return [];
    }
    const projectTargetId = a.sourceLog?.projectTargetId ?? null;
    const unitCost = new Prisma.Decimal(a.unitCost);
    const key = `${projectTargetId}:${unitCost}`;
    const layer = grouped.get(key) ?? {
      unitCost,
      changeQty: new Prisma.Decimal(0),
      costAmount: new Prisma.Decimal(0),
      projectTargetId,
      beforeQty: null,
      afterQty: null,
      sources: [],
      sourceStatus: "VERIFIED",
    };
    layer.changeQty = layer.changeQty.add(a.quantity);
    layer.costAmount = layer.costAmount.add(a.costAmount);
    layer.sources.push({
      sourceLogId: a.sourceLogId,
      quantity: new Prisma.Decimal(a.quantity),
      documentNumber: a.sourceLog?.businessDocumentNumber,
      documentLineId: a.sourceLog?.businessDocumentLineId,
    });
    grouped.set(key, layer);
  }
  return [...grouped.values()].sort((a, b) =>
    a.unitCost.comparedTo(b.unitCost),
  );
}

export async function withPriceLayerSnapshotFields<
  T extends Log & { beforeQty: DecimalInput; afterQty: DecimalInput },
>(
  items: T[],
  repository: Pick<InventoryRepository, "findPriceLayerSnapshotLogs">,
) {
  if (!items.length) return [];
  const traceLogs: Log[] =
    (await repository.findPriceLayerSnapshotLogs({
      maxLogId: Math.max(...items.map((item) => item.id)),
      layerKeys: items.map((item) => ({
        materialId: item.materialId,
        stockScopeId: item.stockScopeId,
        projectTargetId: item.projectTargetId ?? null,
        unitCost: new Prisma.Decimal(item.unitCost ?? 0),
      })),
    })) ?? [];
  const quantities = new Map<string, Prisma.Decimal>();
  // Unknown history makes later layer balances unknown. A proven reversal
  // cancels that uncertainty without inventing a cost layer.
  const unresolved = new Map<string, Set<number>>();
  const wanted = new Set(items.map((item) => item.id));
  const snapshots = new Map<number, Layer[]>();
  const logsById = new Map(traceLogs.map((log) => [log.id, log]));
  for (const log of traceLogs) {
    const scope = `${log.materialId}:${log.stockScopeId}`;
    const pending = unresolved.get(scope) ?? new Set<number>();
    const original = log.reversalOfLogId
      ? logsById.get(log.reversalOfLogId)
      : undefined;
    const validReversal =
      original &&
      original.materialId === log.materialId &&
      original.stockScopeId === log.stockScopeId &&
      original.direction !== log.direction &&
      new Prisma.Decimal(original.changeQty).eq(log.changeQty);
    const layers = layersFor(log);
    if (!layers.length) {
      if (validReversal && pending.has(original.id)) {
        pending.delete(original.id);
      } else {
        pending.add(log.id);
      }
      unresolved.set(scope, pending);
      continue;
    }
    for (const layer of layers) {
      const key = `${scope}:${layer.projectTargetId}:${layer.unitCost}`;
      const before = quantities.get(key) ?? new Prisma.Decimal(0);
      const after =
        log.direction === StockDirection.OUT
          ? before.sub(layer.changeQty)
          : before.add(layer.changeQty);
      quantities.set(key, after);
      layer.beforeQty = pending.size ? null : before;
      layer.afterQty = pending.size ? null : after;
    }
    if (wanted.has(log.id)) snapshots.set(log.id, layers);
  }
  return items.flatMap((item) => {
    const layers = snapshots.get(item.id) ?? [];
    // Unknown legacy evidence remains one explicitly unresolved row. Never
    // count the aggregate average as a real layer or suppress valid layer rows.
    const rows: (Layer | null)[] = layers.length ? layers : [null];
    return rows.map((layer) => {
      const unitCost =
        layer?.unitCost ??
        (item.unitCost == null ? null : new Prisma.Decimal(item.unitCost));
      const projectTargetId = layer
        ? layer.projectTargetId
        : (item.projectTargetId ?? null);
      return {
        ...item,
        rowKey: inventoryPriceLayerRowKey({
          id: item.id,
          projectTargetId,
          unitCost,
        }),
        inventoryLogId: item.id,
        transactionChangeQty: item.changeQty,
        transactionCostAmount: item.costAmount ?? null,
        projectTargetId,
        unitCost,
        changeQty: layer?.changeQty ?? new Prisma.Decimal(item.changeQty),
        costAmount:
          layer?.costAmount ??
          (item.costAmount == null
            ? null
            : new Prisma.Decimal(item.costAmount)),
        totalQty: item.beforeQty,
        priceLayerBeforeQty: layer?.beforeQty ?? null,
        priceLayerChangeQty: layer?.changeQty ?? null,
        priceLayerAfterQty: layer?.afterQty ?? null,
        layerSources: layer?.sources ?? [],
        sourceTraceStatus: layer?.sourceStatus ?? "SOURCE_UNRESOLVED",
        priceLayerStatus: !layer
          ? "UNRESOLVED"
          : layer.afterQty == null
            ? "SNAPSHOT_UNRESOLVED"
            : layer.sourceStatus === "SOURCE_UNRESOLVED"
              ? "SOURCE_UNRESOLVED"
              : "VERIFIED",
      };
    });
  });
}
