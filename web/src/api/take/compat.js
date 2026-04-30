import { listPersonnel } from "@/api/base/personnel";
import request from "@/utils/request";

const MODE_CONFIG = {
  pickOrder: {
    listUrl: "/api/workshop-material/pick-orders",
    detailUrl: "/api/workshop-material/pick-orders/details",
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
    detailUrl: "/api/workshop-material/return-orders/details",
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
    detailUrl: "/api/workshop-material/scrap-orders/details",
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

function isUnsupportedServerFilter(query = {}, mode = "pickOrder") {
  if (mode === "returnOrder") {
    return Boolean(query.sourceType && String(query.sourceType) !== RETURN_SOURCE_TYPE);
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
  const rawUnitPrice = toNumber(line.unitPrice);
  const rawAmount = toNumber(line.amount ?? quantity * rawUnitPrice);
  const unitPrice =
    config.idKey === "pickId"
      ? toNumber(line.costUnitPrice ?? line.unitPrice)
      : rawUnitPrice;
  const amount =
    config.idKey === "pickId"
      ? toNumber(line.costAmount ?? line.amount ?? quantity * unitPrice)
      : rawAmount;
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
    selectedUnitCost:
      config.idKey === "pickId" ? toDecimalString(unitPrice) : undefined,
    amount,
    remark: line.remark ?? "",
    sourceDocumentType: line.sourceDocumentType ?? null,
    sourceDocumentId: line.sourceDocumentId ?? null,
    sourceDocumentLineId: line.sourceDocumentLineId ?? null,
    auditStatus: toAuditStatus(order.auditStatusSnapshot),
    auditor: audit?.decidedBy ?? null,
    auditTime: audit?.decidedAt ?? null,
    createBy: order.createdBy ?? "",
    createdAt: order.createdAt ?? null,
    updatedAt: order.updatedAt ?? null,
    material,
  };

  if (config.idKey === "returnId") {
    return {
      ...mapped,
      returnQty: quantity,
      sourceType: line.sourceDocumentId ? RETURN_SOURCE_TYPE : null,
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
    unitPrice,
    rawUnitPrice: unitPrice,
    amount,
  };
}

function mapOrder(
  order,
  config,
  audit = null,
  pickOrderSnapshotMap = new Map(),
) {
  const lines = Array.isArray(order.lines)
    ? order.lines.map((line) => mapOrderLine(line, config, order, audit))
    : [];
  const sourceId =
    lines.find((line) => line.sourceDocumentId)?.sourceDocumentId ?? null;
  const sourceSnapshot = sourceId
    ? pickOrderSnapshotMap.get(Number(sourceId))
    : null;
  const workshopId =
    config.idKey === "returnId" && sourceSnapshot?.workshopId
      ? sourceSnapshot.workshopId
      : order.workshopId;
  const workshopName =
    config.idKey === "returnId" && sourceSnapshot?.workshopName
      ? sourceSnapshot.workshopName
      : (order.workshopNameSnapshot ?? "");
  const mappedOrder = {
    [config.idKey]: order.id,
    [config.noKey]: order.documentNo,
    [config.dateKey]: order.bizDate,
    workshopId,
    workshopName,
    [config.personKey]: order.handlerNameSnapshot ?? "",
    attn: order.handlerNameSnapshot ?? "",
    createBy: order.createdBy ?? "",
    updateBy: order.updatedBy ?? "",
    createdAt: order.createdAt,
    updatedAt: order.updatedAt,
    totalAmount: toNumber(order.totalAmount).toFixed(2),
    totalQty: toNumber(order.totalQty),
    auditStatus: toAuditStatus(order.auditStatusSnapshot),
    auditor: audit?.decidedBy ?? null,
    auditTime: audit?.decidedAt ?? null,
    remark: order.remark ?? "",
    voidDescription: order.voidReason ?? "",
    details: lines,
    sourceType:
      config.idKey === "returnId" && sourceId ? RETURN_SOURCE_TYPE : null,
    sourceId,
    disposalMethod: config.idKey === "scrapId" ? order.disposalMethod ?? null : null,
  };

  if (config.idKey === "returnId") {
    mappedOrder.pickId = sourceId;
    mappedOrder.pickNo = sourceId
      ? (sourceSnapshot?.documentNo ?? String(sourceId))
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

async function fetchPickOrderSnapshotMap(sourceDocumentIds = []) {
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
      return [
        id,
        {
          documentNo: response.data?.documentNo ?? String(id),
          workshopId: response.data?.workshopId ?? null,
          workshopName: response.data?.workshopNameSnapshot ?? "",
        },
      ];
    }),
  );

  return new Map(resolved);
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
  if (mode === "scrapOrder") {
    unitPrice =
      numericQuantity > 0
        ? toNumber(line.estimatedLoss ?? line.unitPrice) / numericQuantity
        : 0;
  } else {
    unitPrice = toNumber(line.unitPrice);
  }

  const payload = {
    ...(line.detailId ? { id: line.detailId } : {}),
    materialId: line.materialId,
    quantity: toDecimalString(quantity),
    remark: line.remark,
  };
  if (mode === "pickOrder") {
    payload.selectedUnitCost = toDecimalString(line.selectedUnitCost);
  }
  if (mode !== "pickOrder") {
    payload.unitPrice = toDecimalString(normalizeMoneyValue(unitPrice));
  }

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
  const handlerName = data[config.personKey] ?? data.attn ?? undefined;
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
  const { limit, offset } = buildPageQuery(query);
  const { bizDateFrom, bizDateTo } = resolveBizDateRange(query, mode);
  if (isUnsupportedServerFilter(query, mode)) {
    return { rows: [], total: 0 };
  }
  const baseParams = {
    documentNo: query[config.noKey],
    handlerName: query[config.personKey],
    materialId: query.materialId,
    materialCode: query.materialCode,
    materialName: query.materialName,
    specification: query.specification,
    sourceId: query.sourceId,
    sourceType: query.sourceType,
    workshopId: query.workshopId,
    bizDateFrom,
    bizDateTo,
  };
  const response = await request({
    url: config.listUrl,
    method: "get",
    params: {
      ...baseParams,
      limit,
      offset,
    },
  });

  const items = Array.isArray(response.data?.items) ? response.data.items : [];
  const pickOrderSnapshotMap =
    mode === "returnOrder"
      ? await fetchPickOrderSnapshotMap(
          items.flatMap((item) =>
            Array.isArray(item.lines)
              ? item.lines.map((line) => line.sourceDocumentId)
              : [],
          ),
        ).catch(() => new Map())
      : new Map();
  const mappedRows = items.map((item) =>
    mapOrder(item, config, null, pickOrderSnapshotMap),
  );

  return {
    rows: mappedRows,
    total: Number(response.data?.total ?? mappedRows.length),
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
  const pickOrderSnapshotMap =
    mode === "returnOrder"
      ? await fetchPickOrderSnapshotMap(
          Array.isArray(response.data?.lines)
            ? response.data.lines.map((line) => line.sourceDocumentId)
            : [],
        ).catch(() => new Map())
      : new Map();

  return {
    data: mapOrder(response.data, config, audit, pickOrderSnapshotMap),
  };
}

export async function submitWorkshopOrder(data, mode = "pickOrder") {
  const config = MODE_CONFIG[mode];
  const handlerPersonnelId = await resolveHandlerPersonnelId(
    data[config.personKey] ?? data.attn,
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
  const { limit, offset } = buildPageQuery(query);
  const { bizDateFrom, bizDateTo } = resolveBizDateRange(query, mode);
  if (isUnsupportedServerFilter(query, mode)) {
    return { rows: [], total: 0 };
  }

  const response = await request({
    url: config.detailUrl,
    method: "get",
    params: {
      documentNo: query[config.noKey],
      detailId: query.detailId,
      handlerName: query[config.personKey],
      materialId: query.materialId,
      materialCode: query.materialCode,
      materialName: query.materialName,
      specification: query.specification,
      sourceId: query.sourceId,
      sourceType: query.sourceType,
      workshopId: query.workshopId,
      bizDateFrom,
      bizDateTo,
      limit,
      offset,
    },
  });

  const items = Array.isArray(response.data?.items) ? response.data.items : [];
  const pickOrderSnapshotMap =
    mode === "returnOrder"
      ? await fetchPickOrderSnapshotMap(
          items.map((item) => item.sourceDocumentId),
        ).catch(() => new Map())
      : new Map();
  const rows = items.map((item) => {
    const order = item.order ?? {};
    const detail = mapOrderLine(item, config, order);
    return {
      ...detail,
      [config.noKey]: order.documentNo,
      [config.dateKey]: order.bizDate,
      workshopName:
        mode === "returnOrder" && detail.sourceDocumentId
          ? (pickOrderSnapshotMap.get(detail.sourceDocumentId)?.workshopName ??
            order.workshopNameSnapshot ??
            "")
          : (order.workshopNameSnapshot ?? ""),
      [config.personKey]: order.handlerNameSnapshot ?? "",
      createBy: order.createdBy ?? "",
      disposalMethod: mode === "scrapOrder" ? order.disposalMethod ?? null : null,
      pickNo:
        mode === "returnOrder" && detail.sourceDocumentId
          ? (pickOrderSnapshotMap.get(detail.sourceDocumentId)?.documentNo ??
            String(detail.sourceDocumentId))
          : "",
      sourceId: detail.sourceDocumentId ?? null,
    };
  });

  return {
    rows,
    total: Number(response.data?.total ?? rows.length),
  };
}

export async function getWorkshopOrderDetail(detailId, mode = "pickOrder") {
  const details = await listWorkshopOrderDetails(
    {
      detailId,
      pageNum: 1,
      pageSize: 1,
    },
    mode,
  );

  return {
    data:
      details.rows.find(
        (item) => Number(item.detailId) === Number(detailId),
      ) ?? null,
  };
}

export function unsupportedWorkshopOrderAction(message) {
  return Promise.reject(new Error(message));
}
