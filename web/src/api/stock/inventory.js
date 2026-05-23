import request from "@/utils/request";

const DEFAULT_PAGE_NUM = 1;
const DEFAULT_PAGE_SIZE = 30;
const STOCK_SCOPE_LABELS = {
  MAIN: "主仓",
  RD_SUB: "研发小仓",
};

function toPositiveNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function buildPageQuery(query = {}) {
  const pageNum = toPositiveNumber(query.pageNum, DEFAULT_PAGE_NUM);
  const pageSize = toPositiveNumber(query.pageSize, DEFAULT_PAGE_SIZE);

  return {
    pageNum,
    pageSize,
    limit: pageSize,
    offset: (pageNum - 1) * pageSize,
  };
}

function normalizeCategoryIds(category) {
  if (category === null || typeof category === "undefined" || category === "") {
    return undefined;
  }

  const categories = Array.isArray(category)
    ? category
    : String(category).split(",");
  const categoryIds = categories
    .map((item) => Number(item))
    .filter((item) => Number.isInteger(item) && item > 0);

  return categoryIds.length > 0 ? categoryIds.join(",") : undefined;
}

function mapInventorySummaryItem(item) {
  const material = item.material ?? {};
  const stockScope = item.stockScope ?? null;

  return {
    inventoryId: item.id ?? `${item.materialId}-${stockScope ?? "ALL"}`,
    materialId: item.materialId,
    materialCode: material.materialCode ?? item.materialCode,
    materialName: material.materialName ?? item.materialName,
    specification: material.specModel ?? item.specModel ?? "",
    category:
      material.categoryId !== undefined && material.categoryId !== null
        ? String(material.categoryId)
        : item.categoryId
          ? String(item.categoryId)
          : null,
    stockScope,
    stockScopeName: stockScope
      ? STOCK_SCOPE_LABELS[stockScope] ?? stockScope
      : "未指定",
    currentQty: Number(item.quantityOnHand ?? 0),
    warningMinQty: material.warningMinQty ?? item.warningMinQty,
    warningMaxQty: material.warningMaxQty ?? item.warningMaxQty,
  };
}

function resolveInventoryKeyword(query = {}) {
  return (
    query.keyword ||
    query.query ||
    query.materialCode ||
    query.materialCode2 ||
    query.materialName ||
    query.specification ||
    undefined
  );
}

function toQueryText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function matchesTextField(value, keyword) {
  return String(value || "").includes(keyword);
}

function splitSearchTokens(keyword) {
  return String(keyword || "")
    .trim()
    .split(/\s+/)
    .filter((token) => token.length > 0);
}

function matchesMaterialKeyword(row, keyword) {
  return splitSearchTokens(keyword).every(
    (token) =>
      matchesTextField(row.materialCode, token) ||
      matchesTextField(row.materialName, token) ||
      matchesTextField(row.specification, token),
  );
}

function matchesInventoryQuery(row, query = {}) {
  if (
    Array.isArray(query.materialIds) &&
    query.materialIds.length > 0 &&
    !new Set(query.materialIds.map((id) => String(id))).has(
      String(row.materialId),
    )
  ) {
    return false;
  }
  if (query.materialId && String(row.materialId) !== String(query.materialId)) {
    return false;
  }
  const keyword = toQueryText(query.keyword);
  if (keyword && !matchesMaterialKeyword(row, keyword)) {
    return false;
  }
  if (
    query.materialCode2 &&
    !String(row.materialCode || "").includes(query.materialCode2)
  ) {
    return false;
  }
  if (
    query.materialName &&
    !String(row.materialName || "").includes(query.materialName)
  ) {
    return false;
  }
  if (
    query.specification &&
    !String(row.specification || "").includes(query.specification)
  ) {
    return false;
  }
  if (Array.isArray(query.category) && query.category.length > 0) {
    return query.category.includes(row.category);
  }
  if (
    query.stockScope &&
    Object.hasOwn(row, "stockScope") &&
    row.stockScope !== query.stockScope
  ) {
    return false;
  }

  return true;
}

async function fetchInventoryBalancePage(query = {}) {
  const { limit, offset } = buildPageQuery(query);
  const response = await request({
    url: "/api/inventory/balances",
    method: "get",
    params: {
      materialId: query.materialId,
      workshopId: query.workshopId,
      keyword: resolveInventoryKeyword(query),
      categoryIds: normalizeCategoryIds(query.category),
      stockScope: query.stockScope,
      limit,
      offset,
    },
  });

  return {
    items: Array.isArray(response.data?.items) ? response.data.items : [],
    total: Number(response.data?.total ?? 0),
  };
}

function buildInventoryRows(items, query = {}) {
  const grouped = new Map();

  for (const item of items) {
    const material = item.material ?? {};
    const current = grouped.get(item.materialId) ?? {
      inventoryId: item.materialId,
      materialId: item.materialId,
      materialCode: material.materialCode ?? item.materialCode,
      materialName: material.materialName ?? item.materialName,
      specification: material.specModel ?? item.specModel ?? "",
      category:
        material.categoryId !== undefined && material.categoryId !== null
          ? String(material.categoryId)
          : item.categoryId
            ? String(item.categoryId)
            : null,
      currentQty: 0,
      warningMinQty: material.warningMinQty ?? item.warningMinQty,
      warningMaxQty: material.warningMaxQty ?? item.warningMaxQty,
    };
    current.currentQty += Number(item.quantityOnHand ?? 0);
    grouped.set(item.materialId, current);
  }

  return [...grouped.values()].filter((row) =>
    matchesInventoryQuery(row, query),
  );
}

function mapPriceLayerItem(item) {
  const unitCost = String(item.unitCost ?? "");
  const availableQty = String(item.availableQty ?? "");

  return {
    materialId: item.materialId,
    unitCost,
    availableQty,
    sourceLogCount: Number(item.sourceLogCount ?? 0),
  };
}

// 查询库存列表
export async function listInventory(query = {}) {
  const { items, total } = await fetchInventoryBalancePage(query);
  return {
    rows: items.map(mapInventorySummaryItem),
    total,
  };
}

export async function listInventoryGroupByMaterial(query = {}) {
  const { items, total } = await fetchInventoryBalancePage(query);
  const rows = buildInventoryRows(items, query);
  return {
    rows,
    data: rows,
    total,
  };
}

export function listDetails(query) {
  return listInventoryGroupByMaterial(query);
}

// 查询库存列表
export function selectSaifuteInventoryListGroupByMaterial(query) {
  return listInventoryGroupByMaterial(query);
}

// 查询库存详细
export async function getInventory(inventoryId) {
  const response = await listInventory({
    materialId: inventoryId,
    pageNum: 1,
    pageSize: 1,
  });

  return {
    data: response.rows[0] ?? null,
  };
}

export function listInventoryPriceLayers(query = {}) {
  return request({
    url: "/api/inventory/price-layers",
    method: "get",
    params: {
      materialId: query.materialId,
      stockScope: query.stockScope,
      workshopId: query.workshopId,
    },
  }).then((response) => ({
    rows: Array.isArray(response.data)
      ? response.data.map(mapPriceLayerItem)
      : [],
  }));
}
