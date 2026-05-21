import { Prisma } from "../../../../generated/prisma/client";
import type { MaterialCategorySnapshotNode } from "../application/monthly-reporting.shared";
import { toDecimal } from "./reporting-repository.helpers";

export function resolveMaterialCategoryLineAmount(
  amount: Prisma.Decimal | string | number,
  quantity: Prisma.Decimal | string | number,
  unitPrice: Prisma.Decimal | string | number,
) {
  const currentAmount = toDecimal(amount);
  const currentUnitPrice = toDecimal(unitPrice);

  if (!currentAmount.isZero() || currentUnitPrice.isZero()) {
    return currentAmount;
  }

  return toDecimal(quantity).mul(currentUnitPrice);
}

export function resolveMaterialCategoryUnitPrice(params: {
  amount: Prisma.Decimal | string | number | null | undefined;
  quantity: Prisma.Decimal | string | number | null | undefined;
  fallbackUnitPrice?: Prisma.Decimal | string | number | null;
}) {
  const amount = toDecimal(params.amount);
  const quantity = toDecimal(params.quantity);

  if (!quantity.isZero() && !amount.isZero()) {
    return amount.div(quantity);
  }

  return toDecimal(params.fallbackUnitPrice);
}

export function resolveMaterialCategorySalesCostAmount(params: {
  lineCostAmount: Prisma.Decimal | string | number | null | undefined;
  inventoryCostAmount: Prisma.Decimal | string | number | null | undefined;
  quantity: Prisma.Decimal | string | number;
  selectedUnitCost: Prisma.Decimal | string | number;
}) {
  if (params.inventoryCostAmount != null) {
    const inventoryCostAmount = toDecimal(params.inventoryCostAmount);
    if (!inventoryCostAmount.isZero() || params.lineCostAmount == null) {
      return inventoryCostAmount;
    }
  }

  if (params.lineCostAmount != null) {
    return toDecimal(params.lineCostAmount);
  }

  const selectedUnitCost = toDecimal(params.selectedUnitCost);
  if (selectedUnitCost.isZero()) {
    return new Prisma.Decimal(0);
  }

  return toDecimal(params.quantity).mul(selectedUnitCost);
}

export function parseMaterialCategoryPathSnapshot(
  snapshot: Prisma.JsonValue | string | null | undefined,
  fallbackLeaf: MaterialCategorySnapshotNode,
): MaterialCategorySnapshotNode[] {
  const fallbackPath = [fallbackLeaf].filter(
    (node) => node.categoryName.trim().length > 0,
  );

  if (!snapshot) {
    return resolveFallbackPath(fallbackPath);
  }

  const parsedSnapshot =
    typeof snapshot === "string" ? tryParseJsonSnapshot(snapshot) : snapshot;
  if (!Array.isArray(parsedSnapshot)) {
    return resolveFallbackPath(fallbackPath);
  }

  const nodes = parsedSnapshot
    .map((value) => normalizeMaterialCategoryPathNode(value))
    .filter(
      (node): node is MaterialCategorySnapshotNode =>
        node != null && node.categoryName.trim().length > 0,
    );

  return nodes.length > 0 ? nodes : resolveFallbackPath(fallbackPath);
}

function resolveFallbackPath(
  fallbackPath: MaterialCategorySnapshotNode[],
): MaterialCategorySnapshotNode[] {
  return fallbackPath.length > 0
    ? fallbackPath
    : [
        {
          id: null,
          categoryCode: null,
          categoryName: "未分类",
        },
      ];
}

function tryParseJsonSnapshot(value: string) {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return null;
  }
}

function normalizeMaterialCategoryPathNode(value: unknown) {
  if (!value || typeof value !== "object") {
    return null;
  }

  const candidate = value as {
    id?: unknown;
    categoryCode?: unknown;
    categoryName?: unknown;
    code?: unknown;
    name?: unknown;
  };
  const rawCategoryName =
    typeof candidate.categoryName === "string"
      ? candidate.categoryName
      : typeof candidate.name === "string"
        ? candidate.name
        : "";
  const categoryName =
    typeof rawCategoryName === "string" ? rawCategoryName.trim() : "";

  if (categoryName.length === 0) {
    return null;
  }

  return {
    id: typeof candidate.id === "number" ? candidate.id : null,
    categoryCode: resolveCategoryCode(candidate),
    categoryName,
  } satisfies MaterialCategorySnapshotNode;
}

function resolveCategoryCode(candidate: {
  categoryCode?: unknown;
  code?: unknown;
}) {
  if (
    typeof candidate.categoryCode === "string" &&
    candidate.categoryCode.trim().length > 0
  ) {
    return candidate.categoryCode.trim();
  }

  if (typeof candidate.code === "string" && candidate.code.trim().length > 0) {
    return candidate.code.trim();
  }

  return null;
}
