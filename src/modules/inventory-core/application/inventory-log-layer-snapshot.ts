import { Prisma, StockDirection } from "../../../../generated/prisma/client";
import { InventoryRepository } from "../infrastructure/inventory.repository";

type InventoryLogForPriceLayerSnapshot = {
  id: number;
  materialId: number;
  stockScopeId: number | null;
  projectTargetId?: number | null;
  direction: StockDirection | string;
  changeQty: Prisma.Decimal | number | string;
  beforeQty: Prisma.Decimal | number | string;
  afterQty: Prisma.Decimal | number | string;
  unitCost?: Prisma.Decimal | number | string | null;
};

type InventoryLogTraceForPriceLayerSnapshot = Omit<
  InventoryLogForPriceLayerSnapshot,
  "beforeQty" | "afterQty"
>;

type PriceLayerSnapshot = {
  beforeQty: Prisma.Decimal;
  changeQty: Prisma.Decimal;
  afterQty: Prisma.Decimal;
};

type PriceLayerKey = {
  materialId: number;
  stockScopeId: number | null;
  projectTargetId: number | null;
  unitCost: Prisma.Decimal;
};

export async function withPriceLayerSnapshotFields<
  T extends InventoryLogForPriceLayerSnapshot,
>(
  items: T[],
  repository: Pick<InventoryRepository, "findPriceLayerSnapshotLogs">,
) {
  const layerKeys = buildPriceLayerSnapshotKeys(items);
  if (layerKeys.length === 0) {
    return items.map((item) => withEmptySnapshot(item));
  }

  const maxLogId = Math.max(...items.map((item) => item.id));
  const traceLogs = await repository.findPriceLayerSnapshotLogs({
    maxLogId,
    layerKeys,
  });
  const targetLogIds = new Set(items.map((item) => item.id));
  const snapshots = buildPriceLayerSnapshots(traceLogs, targetLogIds);

  return items.map((item) => {
    const snapshot = snapshots.get(item.id);
    return {
      ...item,
      totalQty: item.beforeQty,
      priceLayerBeforeQty: snapshot?.beforeQty ?? null,
      priceLayerChangeQty: snapshot?.changeQty ?? null,
      priceLayerAfterQty: snapshot?.afterQty ?? null,
    };
  });
}

function withEmptySnapshot<T extends InventoryLogForPriceLayerSnapshot>(
  item: T,
) {
  return {
    ...item,
    totalQty: item.beforeQty,
    priceLayerBeforeQty: null,
    priceLayerChangeQty: null,
    priceLayerAfterQty: null,
  };
}

function buildPriceLayerSnapshotKeys(
  items: InventoryLogForPriceLayerSnapshot[],
) {
  const entries = items
    .map((item) => {
      const unitCost = toOptionalDecimal(item.unitCost);
      if (!unitCost) {
        return null;
      }
      const key = {
        materialId: item.materialId,
        stockScopeId: item.stockScopeId ?? null,
        projectTargetId: item.projectTargetId ?? null,
        unitCost,
      };
      return [priceLayerKey(key), key] as const;
    })
    .filter((item): item is readonly [string, PriceLayerKey] => item !== null);

  return [...new Map(entries).values()];
}

function buildPriceLayerSnapshots(
  traceLogs: InventoryLogTraceForPriceLayerSnapshot[],
  targetLogIds: Set<number>,
) {
  const runningQtyByLayer = new Map<string, Prisma.Decimal>();
  const snapshots = new Map<number, PriceLayerSnapshot>();

  for (const log of traceLogs) {
    const unitCost = toOptionalDecimal(log.unitCost);
    if (!unitCost) {
      continue;
    }

    const key = priceLayerKey({
      materialId: log.materialId,
      stockScopeId: log.stockScopeId ?? null,
      projectTargetId: log.projectTargetId ?? null,
      unitCost,
    });
    const beforeQty = runningQtyByLayer.get(key) ?? new Prisma.Decimal(0);
    const changeQty = new Prisma.Decimal(log.changeQty);
    const afterQty =
      log.direction === StockDirection.OUT
        ? beforeQty.sub(changeQty)
        : beforeQty.add(changeQty);

    if (targetLogIds.has(log.id)) {
      snapshots.set(log.id, { beforeQty, changeQty, afterQty });
    }
    runningQtyByLayer.set(key, afterQty);
  }

  return snapshots;
}

function priceLayerKey(params: PriceLayerKey) {
  return [
    params.materialId,
    params.stockScopeId ?? "null",
    params.projectTargetId ?? "null",
    params.unitCost.toString(),
  ].join(":");
}

function toOptionalDecimal(value: unknown): Prisma.Decimal | null {
  if (value === null || typeof value === "undefined" || value === "") {
    return null;
  }
  return new Prisma.Decimal(value as Prisma.Decimal | number | string);
}
