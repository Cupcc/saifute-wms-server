import request from "@/utils/request";

const DEFAULT_PAGE_NUM = 1;
const DEFAULT_PAGE_SIZE = 30;
const DEFAULT_UNCATEGORIZED_LABEL = "未分类";

function toPositiveNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function buildPageQuery(query = {}) {
  const pageNum = toPositiveNumber(query.pageNum, DEFAULT_PAGE_NUM);
  const pageSize = toPositiveNumber(query.pageSize, DEFAULT_PAGE_SIZE);

  return {
    pageNum,
    pageSize,
    limit: pageSize,
    offset: (pageNum - 1) * pageSize,
  };
}

export function pickKeyword(query = {}, keys = []) {
  for (const key of keys) {
    const value = query[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }

  if (typeof query.keyword === "string" && query.keyword.trim()) {
    return query.keyword.trim();
  }

  return undefined;
}

export function buildRowsResponse(data, mapper) {
  const items = Array.isArray(data?.items) ? data.items : [];
  return {
    rows: items.map((item) => mapper(item)),
    total: Number(data?.total || 0),
  };
}

export function buildDataResponse(data, mapper) {
  return {
    data: mapper(data),
  };
}

export function normalizeOptionalId(value, { allowNull = false } = {}) {
  if (value === "" || typeof value === "undefined") {
    return allowNull ? null : undefined;
  }

  if (value === null) {
    return allowNull ? null : undefined;
  }

  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return allowNull ? null : undefined;
  }

  return parsed;
}

function toNumberOrNull(value) {
  if (value === null || typeof value === "undefined" || value === "") {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function mapMaterial(item, extras = {}) {
  return {
    materialId: item.id,
    materialCode: item.materialCode,
    materialName: item.materialName,
    specification: item.specModel ?? "",
    category: item.category?.id ?? item.categoryId ?? null,
    categoryName: item.category?.categoryName ?? DEFAULT_UNCATEGORIZED_LABEL,
    unit: item.unitCode ?? "",
    stockMin: toNumberOrNull(item.warningMinQty),
    stockMax: toNumberOrNull(item.warningMaxQty),
    currentQty:
      typeof extras.currentQty === "number" ? extras.currentQty : undefined,
  };
}

export function mapCustomer(item) {
  return {
    customerId: item.id,
    customerCode: item.customerCode,
    customerName: item.customerName,
    customerShortName: item.customerName,
    customerType: item.parentId ? 2 : 1,
    parentId: item.parentId ?? null,
    contactPerson: item.contactPerson ?? "",
    contactPhone: item.contactPhone ?? "",
    address: item.address ?? "",
    remark: "",
    status: item.status ?? "ACTIVE",
    children: [],
  };
}

export function mapSupplier(item) {
  return {
    supplierId: item.id,
    supplierCode: item.supplierCode,
    supplierName: item.supplierName,
    status: item.status ?? "ACTIVE",
    contactPerson: item.contactPerson ?? "",
    contactPhone: item.contactPhone ?? "",
    address: item.address ?? "",
    remark: "",
  };
}

export function mapPersonnel(item) {
  const workshop =
    item.workshop && typeof item.workshop === "object" ? item.workshop : null;

  return {
    personnelId: item.id,
    name: item.personnelName,
    contactPhone: item.contactPhone ?? "",
    workshopId: workshop?.id ?? item.workshopId ?? null,
    workshopName: workshop?.workshopName ?? item.workshopName ?? "",
    status: item.status ?? "ACTIVE",
  };
}

export function mapWorkshop(item) {
  const defaultHandler =
    item.defaultHandlerPersonnel && typeof item.defaultHandlerPersonnel === "object"
      ? item.defaultHandlerPersonnel
      : null;
  const defaultHandlerPersonnelName =
    defaultHandler?.personnelName ?? item.defaultHandlerPersonnelName ?? "";

  return {
    workshopId: item.id,
    workshopName: item.workshopName,
    defaultHandlerPersonnelId:
      defaultHandler?.id ?? item.defaultHandlerPersonnelId ?? null,
    defaultHandlerPersonnelName,
    status: item.status ?? "ACTIVE",
  };
}

export function mapStockScope(item) {
  return {
    stockScopeId: item.id,
    scopeCode: item.scopeCode,
    scopeName: item.scopeName,
    status: item.status ?? "ACTIVE",
  };
}

export async function fetchMaterialInventoryMap(query = {}, limit = 50) {
  const keyword = pickKeyword(query, ["materialCode", "materialName"]);
  const response = await request({
    url: "/api/reporting/inventory-summary",
    method: "get",
    params: {
      keyword,
      categoryId: query.category ?? undefined,
      workshopId: query.workshopId ?? undefined,
      limit: Math.min(limit, 100),
      offset: 0,
    },
  });

  const inventoryMap = new Map();
  const items = Array.isArray(response.data?.items) ? response.data.items : [];
  for (const item of items) {
    const currentQty = Number(item.quantityOnHand || 0);
    inventoryMap.set(
      item.materialId,
      (inventoryMap.get(item.materialId) || 0) + currentQty,
    );
  }

  return inventoryMap;
}

export function unsupportedBaseAction(message) {
  return Promise.reject(new Error(message));
}
