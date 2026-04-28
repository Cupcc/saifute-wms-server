import request from "@/utils/request";

const REPORTING_PAGE_LIMIT = 100;
const STOCK_SCOPE_LABELS = {
  MAIN: "主仓",
  RD_SUB: "研发小仓",
};
const LEGACY_OPERATION_TYPE_MAP = {
  1: "ACCEPTANCE_IN",
  2: "PRODUCTION_RECEIPT_IN",
  3: "PICK_OUT",
  4: "OUTBOUND_OUT",
  5: "RETURN_IN",
  6: "SCRAP_OUT",
  7: "RD_STOCKTAKE_IN",
  8: "RD_STOCKTAKE_OUT",
};

function buildPageQuery(query = {}) {
  const pageNum = Number(query.pageNum) > 0 ? Number(query.pageNum) : 1;
  const pageSize = Number(query.pageSize) > 0 ? Number(query.pageSize) : 30;
  return {
    pageNum,
    pageSize,
    limit: pageSize,
    offset: (pageNum - 1) * pageSize,
  };
}

function mapOperationTypeToLegacyType(operationType) {
  switch (operationType) {
    case "ACCEPTANCE_IN":
      return "1";
    case "PRODUCTION_RECEIPT_IN":
      return "2";
    case "PICK_OUT":
      return "3";
    case "OUTBOUND_OUT":
      return "4";
    case "RETURN_IN":
    case "SALES_RETURN_IN":
      return "5";
    case "SCRAP_OUT":
      return "6";
    case "RD_STOCKTAKE_IN":
      return "7";
    case "RD_STOCKTAKE_OUT":
      return "8";
    default:
      return "";
  }
}

async function fetchAllInventorySummaryItems(query = {}) {
  let offset = 0;
  let total = 0;
  const items = [];

  do {
    const response = await request({
      url: "/api/inventory/balances",
      method: "get",
      params: {
        materialId: query.materialId,
        workshopId: query.workshopId,
        limit: REPORTING_PAGE_LIMIT,
        offset,
      },
    });
    const batch = Array.isArray(response.data?.items)
      ? response.data.items
      : [];
    total = Number(response.data?.total ?? batch.length);
    items.push(...batch);
    offset += REPORTING_PAGE_LIMIT;
    if (batch.length === 0) {
      break;
    }
  } while (offset < total);

  return items;
}

function toQueryText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function matchesTextField(value, keyword) {
  return String(value || "").includes(keyword);
}

function matchesMaterialKeyword(row, keyword) {
  return (
    matchesTextField(row.materialCode, keyword) ||
    matchesTextField(row.materialName, keyword) ||
    matchesTextField(row.specification, keyword)
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

function buildInventorySummaryRows(items, query = {}) {
  return items
    .map((item) => {
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
    })
    .filter((row) => matchesInventoryQuery(row, query));
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

export async function listInventorySummary(query = {}) {
  const { pageNum, pageSize } = buildPageQuery(query);
  const items = await fetchAllInventorySummaryItems(query);
  const rows = buildInventorySummaryRows(items, query);

  return {
    rows: rows.slice((pageNum - 1) * pageSize, pageNum * pageSize),
    total: rows.length,
  };
}

export async function getInventorySummaryItem(materialId) {
  const response = await listInventorySummary({
    materialId,
    pageNum: 1,
    pageSize: 100,
  });
  return {
    data: response.rows.find((item) => item.materialId === materialId) ?? null,
  };
}

export async function listInventoryGroupByMaterial(query = {}) {
  const items = await fetchAllInventorySummaryItems({
    ...query,
    materialCode2: query.materialCode,
  });
  const rows = buildInventoryRows(items, query);
  return {
    rows,
    data: rows,
    total: rows.length,
  };
}

export async function listInventoryLogs(query = {}) {
  const { limit, offset } = buildPageQuery(query);
  const response = await request({
    url: "/api/inventory/logs",
    method: "get",
    params: {
      materialId: query.materialId,
      businessDocumentNumber: query.relatedOrderNo,
      operationType: query.relatedOrderType
        ? LEGACY_OPERATION_TYPE_MAP[Number(query.relatedOrderType)]
        : undefined,
      occurredAtFrom: query.params?.startRelatedOrderDate,
      occurredAtTo: query.params?.endRelatedOrderDate,
      limit,
      offset,
    },
  });

  const items = Array.isArray(response.data?.items) ? response.data.items : [];
  const rows = items.map((item) => ({
    logId: item.id,
    materialId: item.materialId,
    materialCode: item.material.materialCode,
    materialName: item.material.materialName,
    materialSpecification: item.material.specModel ?? "",
    beforeQty: Number(item.beforeQty ?? 0),
    changeQty:
      item.direction === "OUT"
        ? -Number(item.changeQty ?? 0)
        : Number(item.changeQty ?? 0),
    afterQty: Number(item.afterQty ?? 0),
    relatedOrderType: mapOperationTypeToLegacyType(item.operationType),
    relatedOrderNo: item.businessDocumentNumber,
    relatedOrderDate: item.occurredAt,
    operatorBy: item.operatorId ?? "",
    operateTime: item.occurredAt,
    remark: item.note ?? "",
  }));

  return {
    rows,
    total: Number(response.data?.total || 0),
  };
}

export async function getInventoryLog(logId) {
  const response = await listInventoryLogs({ pageNum: 1, pageSize: 100 });
  return {
    data: response.rows.find((item) => item.logId === logId) ?? null,
  };
}

export async function listInventorySourceUsages(query = {}) {
  const { limit, offset } = buildPageQuery(query);
  const response = await request({
    url: "/api/inventory/source-usages",
    method: "get",
    params: {
      materialId: query.materialId,
      limit,
      offset,
    },
  });

  const items = Array.isArray(response.data?.items) ? response.data.items : [];
  const rows = items.map((item) => ({
    usedId: item.id,
    materialId: item.materialId,
    materialCode: item.material.materialCode,
    materialName: item.material.materialName,
    specification: item.material.specModel ?? "",
    sourceLogId: item.sourceLogId,
    useQty: Number(item.allocatedQty ?? 0),
    allocatedQty: Number(item.allocatedQty ?? 0),
    releasedQty: Number(item.releasedQty ?? 0),
    unitPrice: 0,
    consumerDocumentType: item.consumerDocumentType,
    consumerDocumentId: item.consumerDocumentId,
    consumerLineId: item.consumerLineId,
    status: item.status,
  }));

  return {
    rows,
    total: Number(response.data?.total || 0),
    data: rows,
  };
}

export function unsupportedStockAction(message) {
  return Promise.reject(new Error(message));
}
