import { Prisma } from "../../../../generated/prisma/client";
import {
  buildMonthlyMaterialCategoryNodeKey,
  resolveMonthlyMaterialCategoryLeaf,
} from "./monthly-reporting.formatters";
import {
  formatMoney,
  formatQuantity,
  type MonthlyMaterialCategoryBalanceSnapshot,
  type MonthlyMaterialCategoryEntry,
} from "./monthly-reporting.shared";

export interface MonthlyMaterialCategoryBalanceTotals {
  openingQuantity: string;
  openingAmount: string;
  netQuantity: string;
  netAmount: string;
  closingQuantity: string;
  closingAmount: string;
}

export interface MonthlyMaterialCategoryGroup {
  nodeKey: string;
  categoryId: number | null;
  categoryCode: string | null;
  categoryName: string;
  entries: MonthlyMaterialCategoryEntry[];
}

export interface MonthlyMaterialGroup {
  materialKey: string;
  categoryNodeKey: string;
  categoryId: number | null;
  categoryCode: string | null;
  categoryName: string;
  materialId: number;
  materialCode: string;
  materialName: string;
  materialSpec: string | null;
  unitCode: string;
  entries: MonthlyMaterialCategoryEntry[];
}

interface MonthlyMaterialCategoryBalanceFilter {
  categoryId?: number;
  categoryNodeKey?: string;
  keyword?: string;
}

export function createEmptyMonthlyMaterialCategoryBalanceTotals(): MonthlyMaterialCategoryBalanceTotals {
  return formatBalanceAccumulator(createEmptyBalanceAccumulator());
}

export function filterMonthlyMaterialCategoryBalanceSnapshots(
  snapshots: MonthlyMaterialCategoryBalanceSnapshot[],
  query: MonthlyMaterialCategoryBalanceFilter,
): MonthlyMaterialCategoryBalanceSnapshot[] {
  const categoryNodeKey = query.categoryNodeKey?.trim() || null;

  return snapshots
    .filter((snapshot) =>
      categoryNodeKey
        ? resolveBalanceCategoryNodeKey(snapshot) === categoryNodeKey
        : query.categoryId
          ? snapshot.categoryId === query.categoryId
          : true,
    )
    .filter((snapshot) => matchesBalanceKeyword(snapshot, query.keyword));
}

export function buildMonthlyMaterialCategoryBalanceTotals(
  snapshots: MonthlyMaterialCategoryBalanceSnapshot[],
): MonthlyMaterialCategoryBalanceTotals {
  const accumulator = createEmptyBalanceAccumulator();

  for (const snapshot of snapshots) {
    addBalanceSnapshot(accumulator, snapshot);
  }

  return formatBalanceAccumulator(accumulator);
}

export function buildMonthlyMaterialCategoryBalanceTotalsByKey(
  snapshots: MonthlyMaterialCategoryBalanceSnapshot[],
  resolveKey: (snapshot: MonthlyMaterialCategoryBalanceSnapshot) => string,
): Map<string, MonthlyMaterialCategoryBalanceTotals> {
  const grouped = new Map<
    string,
    ReturnType<typeof createEmptyBalanceAccumulator>
  >();

  for (const snapshot of snapshots) {
    const key = resolveKey(snapshot);
    const current = grouped.get(key) ?? createEmptyBalanceAccumulator();
    addBalanceSnapshot(current, snapshot);
    grouped.set(key, current);
  }

  return new Map(
    [...grouped.entries()].map(([key, accumulator]) => [
      key,
      formatBalanceAccumulator(accumulator),
    ]),
  );
}

export function collectMonthlyMaterialCategoryGroups(
  entries: MonthlyMaterialCategoryEntry[],
  balanceSnapshots: MonthlyMaterialCategoryBalanceSnapshot[] = [],
): MonthlyMaterialCategoryGroup[] {
  const grouped = new Map<string, MonthlyMaterialCategoryGroup>();

  for (const entry of entries) {
    const leafCategory = resolveMonthlyMaterialCategoryLeaf(entry);
    const nodeKey = buildMonthlyMaterialCategoryNodeKey(leafCategory);
    const current = grouped.get(nodeKey) ?? {
      nodeKey,
      categoryId: leafCategory.id,
      categoryCode: leafCategory.categoryCode,
      categoryName: leafCategory.categoryName,
      entries: [],
    };
    current.entries.push(entry);
    grouped.set(nodeKey, current);
  }

  for (const snapshot of balanceSnapshots) {
    const nodeKey = resolveBalanceCategoryNodeKey(snapshot);
    if (grouped.has(nodeKey)) {
      continue;
    }

    grouped.set(nodeKey, {
      nodeKey,
      categoryId: snapshot.categoryId,
      categoryCode: snapshot.categoryCode,
      categoryName: snapshot.categoryName,
      entries: [],
    });
  }

  return [...grouped.values()];
}

export function collectMonthlyMaterialGroups(
  entries: MonthlyMaterialCategoryEntry[],
  balanceSnapshots: MonthlyMaterialCategoryBalanceSnapshot[] = [],
): MonthlyMaterialGroup[] {
  const grouped = new Map<string, MonthlyMaterialGroup>();

  for (const entry of entries) {
    const leafCategory = resolveMonthlyMaterialCategoryLeaf(entry);
    const categoryNodeKey = buildMonthlyMaterialCategoryNodeKey(leafCategory);
    const materialKey = buildEntryMaterialKey(entry);
    const current = grouped.get(materialKey) ?? {
      materialKey,
      categoryNodeKey,
      categoryId: leafCategory.id,
      categoryCode: leafCategory.categoryCode,
      categoryName: leafCategory.categoryName,
      materialId: entry.materialId,
      materialCode: entry.materialCode,
      materialName: entry.materialName,
      materialSpec: entry.materialSpec,
      unitCode: entry.unitCode,
      entries: [],
    };
    current.entries.push(entry);
    grouped.set(materialKey, current);
  }

  for (const snapshot of balanceSnapshots) {
    const categoryNodeKey = resolveBalanceCategoryNodeKey(snapshot);
    const materialKey = buildBalanceMaterialKey(snapshot);
    if (grouped.has(materialKey)) {
      continue;
    }

    grouped.set(materialKey, {
      materialKey,
      categoryNodeKey,
      categoryId: snapshot.categoryId,
      categoryCode: snapshot.categoryCode,
      categoryName: snapshot.categoryName,
      materialId: snapshot.materialId,
      materialCode: snapshot.materialCode,
      materialName: snapshot.materialName,
      materialSpec: snapshot.materialSpec,
      unitCode: snapshot.unitCode,
      entries: [],
    });
  }

  return [...grouped.values()];
}

export function compareMaterialCategoryItems(
  left: {
    nodeKey: string;
    categoryCode: string | null;
    categoryName: string;
  },
  right: {
    nodeKey: string;
    categoryCode: string | null;
    categoryName: string;
  },
): number {
  if (left.categoryName !== right.categoryName) {
    return left.categoryName.localeCompare(right.categoryName, "zh-Hans-CN");
  }

  if ((left.categoryCode ?? "") !== (right.categoryCode ?? "")) {
    return (left.categoryCode ?? "").localeCompare(
      right.categoryCode ?? "",
      "zh-Hans-CN",
    );
  }

  return left.nodeKey.localeCompare(right.nodeKey, "zh-Hans-CN");
}

export function compareMaterialItems(
  left: {
    materialKey: string;
    categoryNodeKey: string;
    categoryId: number | null;
    categoryCode: string | null;
    categoryName: string;
    materialCode: string;
    materialName: string;
    materialSpec: string | null;
    unitCode: string;
  },
  right: {
    materialKey: string;
    categoryNodeKey: string;
    categoryId: number | null;
    categoryCode: string | null;
    categoryName: string;
    materialCode: string;
    materialName: string;
    materialSpec: string | null;
    unitCode: string;
  },
): number {
  const categoryCompare = compareMaterialCategoryItems(
    {
      nodeKey: left.categoryNodeKey,
      categoryCode: left.categoryCode,
      categoryName: left.categoryName,
    },
    {
      nodeKey: right.categoryNodeKey,
      categoryCode: right.categoryCode,
      categoryName: right.categoryName,
    },
  );

  if (categoryCompare !== 0) {
    return categoryCompare;
  }

  const leftMaterialLabel =
    `${left.materialCode} ${left.materialName} ${left.materialSpec ?? ""} ${left.unitCode}`.trim();
  const rightMaterialLabel =
    `${right.materialCode} ${right.materialName} ${right.materialSpec ?? ""} ${right.unitCode}`.trim();

  if (leftMaterialLabel !== rightMaterialLabel) {
    return leftMaterialLabel.localeCompare(rightMaterialLabel, "zh-Hans-CN");
  }

  return left.materialKey.localeCompare(right.materialKey, "zh-Hans-CN");
}

export function buildEntryMaterialKey(entry: MonthlyMaterialCategoryEntry) {
  const leafCategory = resolveMonthlyMaterialCategoryLeaf(entry);
  return buildMonthlyMaterialCategoryMaterialKey({
    categoryNodeKey: buildMonthlyMaterialCategoryNodeKey(leafCategory),
    materialId: entry.materialId,
  });
}

export function buildBalanceMaterialKey(
  snapshot: MonthlyMaterialCategoryBalanceSnapshot,
) {
  return buildMonthlyMaterialCategoryMaterialKey({
    categoryNodeKey: resolveBalanceCategoryNodeKey(snapshot),
    materialId: snapshot.materialId,
  });
}

export function resolveBalanceCategoryNodeKey(
  snapshot: MonthlyMaterialCategoryBalanceSnapshot,
) {
  return buildMonthlyMaterialCategoryNodeKey({
    id: snapshot.categoryId,
    categoryCode: snapshot.categoryCode,
    categoryName: snapshot.categoryName,
  });
}

function buildMonthlyMaterialCategoryMaterialKey(params: {
  categoryNodeKey: string;
  materialId: number;
}) {
  return JSON.stringify([params.categoryNodeKey, params.materialId]);
}

function matchesBalanceKeyword(
  snapshot: MonthlyMaterialCategoryBalanceSnapshot,
  keyword?: string,
) {
  const normalizedKeyword = keyword?.trim().toLowerCase();
  if (!normalizedKeyword) {
    return true;
  }

  return [
    snapshot.materialCode,
    snapshot.materialName,
    snapshot.materialSpec,
    snapshot.categoryCode,
    snapshot.categoryName,
  ]
    .filter(Boolean)
    .some((candidate) =>
      String(candidate).toLowerCase().includes(normalizedKeyword),
    );
}

function createEmptyBalanceAccumulator() {
  return {
    openingQuantity: new Prisma.Decimal(0),
    openingAmount: new Prisma.Decimal(0),
    closingQuantity: new Prisma.Decimal(0),
    closingAmount: new Prisma.Decimal(0),
  };
}

function addBalanceSnapshot(
  accumulator: ReturnType<typeof createEmptyBalanceAccumulator>,
  snapshot: MonthlyMaterialCategoryBalanceSnapshot,
) {
  accumulator.openingQuantity = accumulator.openingQuantity.add(
    snapshot.openingQuantity,
  );
  accumulator.openingAmount = accumulator.openingAmount.add(
    snapshot.openingAmount,
  );
  accumulator.closingQuantity = accumulator.closingQuantity.add(
    snapshot.closingQuantity,
  );
  accumulator.closingAmount = accumulator.closingAmount.add(
    snapshot.closingAmount,
  );
}

function formatBalanceAccumulator(
  accumulator: ReturnType<typeof createEmptyBalanceAccumulator>,
): MonthlyMaterialCategoryBalanceTotals {
  return {
    openingQuantity: formatQuantity(accumulator.openingQuantity),
    openingAmount: formatMoney(accumulator.openingAmount),
    netQuantity: formatQuantity(
      accumulator.closingQuantity.sub(accumulator.openingQuantity),
    ),
    netAmount: formatMoney(
      accumulator.closingAmount.sub(accumulator.openingAmount),
    ),
    closingQuantity: formatQuantity(accumulator.closingQuantity),
    closingAmount: formatMoney(accumulator.closingAmount),
  };
}
