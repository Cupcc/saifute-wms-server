import { listPersonnel } from "@/api/base/personnel";
import request from "@/utils/request";

const MODE_CONFIG = {
  pickOrder: {
    listUrl: "/api/workshop-material/pick-orders",
    itemUrl: "/api/workshop-material/pick-orders",
    voidUrl: "/api/workshop-material/pick-orders",
    documentType: "WorkshopMaterialOrder",
    orderType: "PICK",
    idKey: "pickId",
    noKey: "pickNo",
    dateKey: "pickDate",
    personKey: "picker",
  },
  returnOrder: {
    listUrl: "/api/workshop-material/return-orders",
    itemUrl: "/api/workshop-material/return-orders",
    voidUrl: "/api/workshop-material/return-orders",
    documentType: "WorkshopMaterialOrder",
    orderType: "RETURN",
    idKey: "returnId",
    noKey: "returnNo",
    dateKey: "returnDate",
    personKey: "returnBy",
  },
  scrapOrder: {
    listUrl: "/api/workshop-material/scrap-orders",
    itemUrl: "/api/workshop-material/scrap-orders",
    voidUrl: "/api/workshop-material/scrap-orders",
    documentType: "WorkshopMaterialOrder",
    orderType: "SCRAP",
    idKey: "scrapId",
    noKey: "scrapNo",
    dateKey: "scrapDate",
    personKey: "attn",
  },
};

const RETURN_SOURCE_TYPE = "1";
const CLIENT_FILTER_FETCH_LIMIT = 200;

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

function toNumber(value) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function toDecimalString(value) {
  if (value === null || typeof value === "undefined" || value === "") {
    return undefined;
  }

  return String(value);
}

function normalizeMoneyValue(value) {
  const parsed = toNumber(value);
  return Number(parsed.toFixed(2));
}

function toAuditStatus(status) {
  if (status === "APPROVED") {
    return "1";
  }
  if (status === "REJECTED") {
    return "2";
  }
  return "0";
}

function getDateRangeKeys(mode) {
  if (mode === "returnOrder") {
    return ["beginReturnDate", "endReturnDate"];
  }
  if (mode === "scrapOrder") {
    return ["beginScrapDate", "endScrapDate"];
  }
  return ["beginPickDate", "endPickDate"];
}

function resolveBizDateRange(query = {}, mode = "pickOrder") {
  const [legacyBeginKey, legacyEndKey] = getDateRangeKeys(mode);
  const params = query.params ?? {};

  return {
    bizDateFrom:
      params.beginTime ??
      params.bizDateFrom ??
      params[legacyBeginKey] ??
      query.beginTime ??
      query.bizDateFrom ??
      query[legacyBeginKey],
    bizDateTo:
      params.endTime ??
      params.bizDateTo ??
      params[legacyEndKey] ??
      query.endTime ??
      query.bizDateTo ??
      query[legacyEndKey],
  };
}

function hasClientSideFilter(query = {}, mode = "pickOrder") {
  if (mode === "returnOrder") {
    return Boolean(query.sourceId || query.sourceType);
  }
  if (mode === "scrapOrder") {
    return Boolean(query.disposalMethod);
  }
  return false;
}

function toMaterialSnapshot(line) {
  return {
    materialId: line.materialId,
    materialCode: line.materialCodeSnapshot ?? "",
    materialName: line.materialNameSnapshot ?? "",
    specification: line.materialSpecSnapshot ?? "",
    unit: line.unitCodeSnapshot ?? "",
  };
}

function mapOrderLine(line, config, order, audit = null) {
  const quantity = toNumber(line.quantity);
  const unitPrice = toNumber(line.unitPrice);
  const amount = toNumber(line.amount ?? quantity * unitPrice);
  const material = toMaterialSnapshot(line);
  const mapped = {
    detailId: line.id,
    [config.idKey]: order.id,
    [config.noKey]: order.documentNo,
    [config.dateKey]: order.bizDate,
    materialId: line.materialId,
    materialCode: material.materialCode,
    materialName: material.materialName,
    specification: material.specification,
    quantity,
    unitPrice,
    subtotal: amount.toFixed(2),
    remark: line.remark ?? "",
    sourceDocumentType: line.sourceDocumentType ?? null,
    sourceDocumentId: line.sourceDocumentId ?? null,
    sourceDocumentLineId: line.sourceDocumentLineId ?? null,
    auditStatus: toAuditStatus(order.auditStatusSnapshot),
    auditor: audit?.decidedBy ?? null,
    auditTime: audit?.decidedAt ?? null,
    material,
  };

  if (config.idKey === "returnId") {
    return {
      ...mapped,
      returnQty: quantity,
      sourceType: RETURN_SOURCE_TYPE,
    };
  }

  if (config.idKey === "scrapId") {
    return {
      ...mapped,
      scrapQty: quantity,
      unit: material.unit,
      scrapReason: "",
      estimatedLoss: amount,
      disposalMethod: order.disposalMethod ?? null,
    };
  }

  return {
    ...mapped,
    unitPrice: amount,
    rawUnitPrice: unitPrice,
    amount,
    instruction: "",
  };
}

function mapOrder(
  order,
  config,
  audit = null,
  pickOrderNoMap = new Map(),
) {
  const lines = Array.isArray(order.lines)
    ? order.lines.map((line) => mapOrderLine(line, config, order, audit))
    : [];
  const firstLine = lines[0];
  const sourceId = firstLine?.sourceDocumentId ?? null;
  const mappedOrder = {
    [config.idKey]: order.id,
    [config.noKey]: order.documentNo,
    [config.dateKey]: order.bizDate,
    workshopId: order.workshopId,
    workshopName: order.workshopNameSnapshot ?? "",
    [config.personKey]: order.handlerNameSnapshot ?? "",
    attn: order.handlerNameSnapshot ?? "",
    chargeBy: order.handlerNameSnapshot ?? "",
    createBy: order.createdBy ?? "",
    updateBy: order.updatedBy ?? "",
    createTime: order.createdAt,
    updateTime: order.updatedAt,
    totalAmount: toNumber(order.totalAmount).toFixed(2),
    totalQty: toNumber(order.totalQty),
    auditStatus: toAuditStatus(order.auditStatusSnapshot),
    auditor: audit?.decidedBy ?? null,
    auditTime: audit?.decidedAt ?? null,
    remark: order.remark ?? "",
    voidDescription: order.voidReason ?? "",
    details: lines,
    sourceType: config.idKey === "returnId" ? RETURN_SOURCE_TYPE : null,
    sourceId,
    disposalMethod: config.idKey === "scrapId" ? order.disposalMethod ?? null : null,
  };

  if (config.idKey === "returnId") {
    mappedOrder.pickId = sourceId;
    mappedOrder.pickNo = sourceId
      ? (pickOrderNoMap.get(sourceId) ?? String(sourceId))
      : "";
  }

  return mappedOrder;
}

async function fetchApprovalDocument(config, documentId) {
  const response = await request({
    url: "/api/approval/documents/detail",
    method: "get",
    params: {
      documentType: config.documentType,
      documentId,
    },
  });

  return response.data ?? null;
}

async function resolveHandlerPersonnelId(name) {
  if (!name) {
    return undefined;
  }

  const response = await listPersonnel({
    name,
    pageNum: 1,
    pageSize: 100,
  });
  const exactMatch = response.rows?.find((item) => item.name === name);
  return exactMatch?.personnelId ?? response.rows?.[0]?.personnelId;
}

async function fetchPickOrderNoMap(sourceDocumentIds = []) {
  const uniqueIds = [...new Set(sourceDocumentIds.filter(Boolean).map(Number))];

  if (!uniqueIds.length) {
    return new Map();
  }

  const resolved = await Promise.all(
    uniqueIds.map(async (id) => {
      const response = await request({
        url: `/api/workshop-material/pick-orders/${id}`,
        method: "get",
      });
      return [id, response.data?.documentNo ?? String(id)];
    }),
  );

  return new Map(resolved);
}

function applyClientSideFilters(rows, query = {}, mode = "pickOrder") {
  if (mode === "returnOrder") {
    return rows.filter((row) => {
      if (
        query.sourceId &&
        Number(row.sourceId ?? row.pickId ?? 0) !== Number(query.sourceId)
      ) {
        return false;
      }
      if (
        query.sourceType &&
        String(row.sourceType ?? "") !== String(query.sourceType)
      ) {
        return false;
      }
      return true;
    });
  }

  if (mode === "scrapOrder") {
    return rows.filter((row) => {
      if (
        query.disposalMethod &&
        String(row.disposalMethod ?? "") !== String(query.disposalMethod)
      ) {
        return false;
      }
      return true;
    });
  }

  return rows;
}

function buildLinePayload(line, mode = "pickOrder", parentData = {}) {
  const quantity =
    mode === "returnOrder"
      ? line.returnQty
      : mode === "scrapOrder"
        ? line.scrapQty
        : line.quantity;
  const numericQuantity = toNumber(quantity);

  let unitPrice;
  if (mode === "pickOrder") {
    unitPrice =
      numericQuantity > 0 ? toNumber(line.unitPrice) / numericQuantity : 0;
  } else if (mode === "scrapOrder") {
    unitPrice =
      numericQuantity > 0
        ? toNumber(line.estimatedLoss ?? line.unitPrice) / numericQuantity
        : 0;
  } else {
    unitPrice = toNumber(line.unitPrice);
  }
  unitPrice = normalizeMoneyValue(unitPrice);

  const payload = {
    ...(line.detailId ? { id: line.detailId } : {}),
    materialId: line.materialId,
    quantity: toDecimalString(quantity),
    unitPrice: toDecimalString(unitPrice),
    remark: line.remark,
  };

  if (mode === "returnOrder") {
    const sourceDocumentId =
      line.sourceDocumentId ?? parentData.sourceId ?? parentData.pickId;
    const sourceDocumentLineId = line.sourceDocumentLineId;
    if (sourceDocumentId && sourceDocumentLineId) {
      payload.sourceDocumentType =
        line.sourceDocumentType ?? "WorkshopMaterialOrder";
      payload.sourceDocumentId = Number(sourceDocumentId);
      payload.sourceDocumentLineId = Number(sourceDocumentLineId);
    }
  }

  return payload;
}

function buildWorkshopPayload(data, mode = "pickOrder", handlerPersonnelId) {
  const config = MODE_CONFIG[mode];
  const handlerName =
    data[config.personKey] ?? data.attn ?? data.chargeBy ?? undefined;
  const lines = Array.isArray(data.details) ? data.details : [];
  const isUpdate = Boolean(data[config.idKey]);

  return {
    ...(isUpdate ? { documentNo: data[config.noKey] } : {}),
    orderType: config.orderType,
    bizDate: data[config.dateKey],
    handlerPersonnelId,
    ...(isUpdate ? {} : { handlerName }),
    workshopId: data.workshopId,
    remark: data.remark,
    lines: lines.map((line) => buildLinePayload(line, mode, data)),
  };
}

async function listOrdersInternal(query = {}, mode = "pickOrder") {
  const config = MODE_CONFIG[mode];
  const { pageNum, pageSize, limit, offset } = buildPageQuery(query);
  const { bizDateFrom, bizDateTo } = resolveBizDateRange(query, mode);
  const useClientSideFilter = hasClientSideFilter(query, mode);
  const baseParams = {
    documentNo: query[config.noKey],
    handlerName: query[config.personKey],
    materialId: query.materialId,
    materialName: query.materialName,
    workshopId: query.workshopId,
    bizDateFrom,
    bizDateTo,
  };
  const firstResponse = await request({
    url: config.listUrl,
    method: "get",
    params: {
      ...baseParams,
      limit: useClientSideFilter ? CLIENT_FILTER_FETCH_LIMIT : limit,
      offset: useClientSideFilter ? 0 : offset,
    },
  });

  let items = Array.isArray(firstResponse.data?.items)
    ? [...firstResponse.data.items]
    : [];
  if (useClientSideFilter) {
    const total = Number(firstResponse.data?.total ?? items.length);
    for (let nextOffset = items.length; nextOffset < total; nextOffset += CLIENT_FILTER_FETCH_LIMIT) {
      const response = await request({
        url: config.listUrl,
        method: "get",
        params: {
          ...baseParams,
          limit: CLIENT_FILTER_FETCH_LIMIT,
          offset: nextOffset,
        },
      });
      const nextItems = Array.isArray(response.data?.items) ? response.data.items : [];
      if (!nextItems.length) {
        break;
      }
      items = items.concat(nextItems);
    }
  }
  const pickOrderNoMap =
    mode === "returnOrder"
      ? await fetchPickOrderNoMap(
          items.flatMap((item) =>
            Array.isArray(item.lines)
              ? item.lines.map((line) => line.sourceDocumentId)
              : [],
          ),
        ).catch(() => new Map())
      : new Map();
  const mappedRows = items.map((item) =>
    mapOrder(item, config, null, pickOrderNoMap),
  );
  const filteredRows = applyClientSideFilters(mappedRows, query, mode);

  if (!useClientSideFilter) {
    return {
      rows: filteredRows,
      total: Number(firstResponse.data?.total ?? filteredRows.length),
    };
  }

  return {
    rows: filteredRows.slice((pageNum - 1) * pageSize, pageNum * pageSize),
    total: filteredRows.length,
  };
}

export function listWorkshopOrders(query = {}, mode = "pickOrder") {
  return listOrdersInternal(query, mode);
}

export async function getWorkshopOrder(id, mode = "pickOrder") {
  const config = MODE_CONFIG[mode];
  const [response, audit] = await Promise.all([
    request({
      url: `${config.itemUrl}/${id}`,
      method: "get",
    }),
    fetchApprovalDocument(config, id).catch(() => null),
  ]);
  const pickOrderNoMap =
    mode === "returnOrder"
      ? await fetchPickOrderNoMap(
          Array.isArray(response.data?.lines)
            ? response.data.lines.map((line) => line.sourceDocumentId)
            : [],
        ).catch(() => new Map())
      : new Map();

  return {
    data: mapOrder(response.data, config, audit, pickOrderNoMap),
  };
}

export async function submitWorkshopOrder(data, mode = "pickOrder") {
  const config = MODE_CONFIG[mode];
  const handlerPersonnelId = await resolveHandlerPersonnelId(
    data[config.personKey] ?? data.attn ?? data.chargeBy,
  ).catch(() => undefined);
  const payload = buildWorkshopPayload(data, mode, handlerPersonnelId);
  const orderId = data[config.idKey];

  return request({
    url: orderId ? `${config.itemUrl}/${orderId}` : config.itemUrl,
    method: orderId ? "put" : "post",
    data: payload,
  });
}

export function voidWorkshopOrder(data, mode = "pickOrder") {
  const config = MODE_CONFIG[mode];
  const orderId = data[config.idKey];

  return request({
    url: `${config.voidUrl}/${orderId}/void`,
    method: "post",
    data: {
      voidReason: data.voidDescription,
    },
  });
}

export async function listWorkshopOrderDetails(query = {}, mode = "pickOrder") {
  const config = MODE_CONFIG[mode];
  const { pageNum, pageSize } = buildPageQuery(query);
  const orders = await listOrdersInternal(
    {
      ...query,
      pageNum: 1,
      pageSize: CLIENT_FILTER_FETCH_LIMIT,
    },
    mode,
  );

  const rows = orders.rows.flatMap((row) =>
    row.details.map((detail) => ({
      ...detail,
      [config.noKey]: row[config.noKey],
      [config.dateKey]: row[config.dateKey],
      workshopName: row.workshopName,
      [config.personKey]: row[config.personKey],
      chargeBy: row.chargeBy,
      createBy: row.createBy,
      disposalMethod: row.disposalMethod,
      pickNo: row.pickNo,
      sourceId: row.sourceId,
    })),
  );

  return {
    rows: rows.slice((pageNum - 1) * pageSize, pageNum * pageSize),
    total: rows.length,
  };
}

export async function getWorkshopOrderDetail(detailId, mode = "pickOrder") {
  const details = await listWorkshopOrderDetails(
    {
      pageNum: 1,
      pageSize: CLIENT_FILTER_FETCH_LIMIT,
    },
    mode,
  );

  return {
    data: details.rows.find((item) => item.detailId === detailId) ?? null,
  };
}

export function unsupportedWorkshopOrderAction(message) {
  return Promise.reject(new Error(message));
}
