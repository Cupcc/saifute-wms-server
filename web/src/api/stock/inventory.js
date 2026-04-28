import request from "@/utils/request";
import { listInventoryGroupByMaterial } from "./compat";

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

  const categories = Array.isArray(category) ? category : [category];
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

// 查询库存列表
export function listInventory(query = {}) {
  const { limit, offset } = buildPageQuery(query);
  return request({
    url: "/api/inventory/balances",
    method: "get",
    params: {
      materialId: query?.materialId,
      keyword: query?.keyword,
      categoryIds: normalizeCategoryIds(query?.category),
      stockScope: query?.stockScope,
      limit,
      offset,
    },
  }).then((response) => {
    const items = Array.isArray(response.data?.items) ? response.data.items : [];
    return {
      rows: items.map(mapInventorySummaryItem),
      total: Number(response.data?.total || 0),
    };
  });
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
