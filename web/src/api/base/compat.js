import request from "@/utils/request";

const DEFAULT_PAGE_NUM = 1;
const DEFAULT_PAGE_SIZE = 30;

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
    categoryName: item.category?.categoryName ?? "",
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
    contactPerson: "",
    contactPhone: "",
    address: "",
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
    supplierShortName: item.supplierName,
    status: item.status ?? "ACTIVE",
    contactPerson: "",
    contactPhone: "",
    address: "",
    remark: "",
  };
}

export function mapPersonnel(item, query = {}) {
  return {
    personnelId: item.id,
    type:
      typeof query.type === "undefined" || query.type === null
        ? 1
        : Number(query.type),
    code: item.personnelCode,
    name: item.personnelName,
    contactPhone: "",
  };
}

export function mapWorkshop(item) {
  return {
    workshopId: item.id,
    workshopCode: item.workshopCode,
    workshopName: item.workshopName,
    status: item.status ?? "ACTIVE",
    contactPerson: "",
    chargeBy: "",
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
