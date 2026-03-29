import request from "@/utils/request";

const REPORTING_PAGE_LIMIT = 100;
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

function buildInventorySummaryParams(query = {}, limit, offset) {
  const singleCategoryId =
    Array.isArray(query.category) && query.category.length === 1
      ? Number(query.category[0])
      : undefined;

  return {
    keyword: query.materialCode2 || query.materialName || undefined,
    categoryId: Number.isInteger(singleCategoryId)
      ? singleCategoryId
      : undefined,
    workshopId: query.workshopId,
    limit,
    offset,
  };
}

async function fetchAllInventorySummaryItems(query = {}) {
  let offset = 0;
  let total = 0;
  const items = [];

  do {
    const response = await request({
      url: "/api/reporting/inventory-summary",
      method: "get",
      params: buildInventorySummaryParams(query, REPORTING_PAGE_LIMIT, offset),
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

function buildInventoryRows(items, query = {}) {
  const grouped = new Map();

  for (const item of items) {
    const current = grouped.get(item.materialId) ?? {
      inventoryId: item.materialId,
      materialId: item.materialId,
      materialCode: item.materialCode,
      materialName: item.materialName,
      specification: item.specModel ?? "",
      category: item.categoryId ? String(item.categoryId) : null,
      currentQty: 0,
      warningMinQty: item.warningMinQty,
      warningMaxQty: item.warningMaxQty,
    };
    current.currentQty += Number(item.quantityOnHand || 0);
    grouped.set(item.materialId, current);
  }

  return [...grouped.values()].filter((row) => {
    if (query.materialId && row.materialId !== query.materialId) {
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
    return true;
  });
}

export async function listInventorySummary(query = {}) {
  const { pageNum, pageSize } = buildPageQuery(query);
  const items = await fetchAllInventorySummaryItems(query);
  const rows = buildInventoryRows(items, query);

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
    data: rows,
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
