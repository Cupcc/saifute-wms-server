import { listPersonnel } from "@/api/base/personnel";
import { listSupplierByKeywordIncludingDisabled } from "@/api/base/supplier";
import request from "@/utils/request";

const MODE_CONFIG = {
  order: {
    listUrl: "/api/inbound/orders",
    itemUrl: "/api/inbound/orders",
    voidUrl: "/api/inbound/orders",
    documentType: "StockInOrder",
    orderType: "ACCEPTANCE",
    idKey: "inboundId",
    noKey: "inboundNo",
    dateKey: "inboundDate",
    detailIdKey: "detailId",
  },
  intoOrder: {
    listUrl: "/api/inbound/into-orders",
    itemUrl: "/api/inbound/into-orders",
    voidUrl: "/api/inbound/into-orders",
    documentType: "StockInOrder",
    orderType: "PRODUCTION_RECEIPT",
    idKey: "intoId",
    noKey: "intoNo",
    dateKey: "intoDate",
    detailIdKey: "detailId",
  },
};

function buildPageQuery(query = {}) {
  const pageNum = Number(query.pageNum) > 0 ? Number(query.pageNum) : 1;
  const pageSize = Number(query.pageSize) > 0 ? Number(query.pageSize) : 30;

  return {
    limit: pageSize,
    offset: (pageNum - 1) * pageSize,
  };
}

function toDecimalString(value) {
  if (value === null || typeof value === "undefined" || value === "") {
    return undefined;
  }

  return String(value);
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

function mapInboundLine(line, config, order, audit = null) {
  const quantity = Number(line.quantity ?? 0);
  const unitPrice = Number(line.unitPrice ?? 0);
  const taxPrice = unitPrice;

  return {
    [config.detailIdKey]: line.id,
    [config.idKey]: order.id,
    [config.noKey]: order.documentNo,
    [config.dateKey]: order.bizDate,
    materialId: line.materialId,
    rdProcurementRequestLineId: line.rdProcurementRequestLineId ?? null,
    materialCode: line.materialCodeSnapshot,
    quantity,
    unitPrice,
    taxPrice,
    subtotal: (quantity * unitPrice).toFixed(2),
    supplierId: order.supplierId,
    supplierName: order.supplierNameSnapshot ?? "",
    workshopId: order.workshopId,
    workshopName: order.workshopNameSnapshot ?? "",
    interval: "",
    remark: line.remark ?? "",
    auditStatus: toAuditStatus(order.auditStatusSnapshot),
    auditor: audit?.decidedBy ?? null,
    auditTime: audit?.decidedAt ?? null,
    material: {
      materialId: line.materialId,
      materialCode: line.materialCodeSnapshot,
      materialName: line.materialNameSnapshot,
      specification: line.materialSpecSnapshot ?? "",
    },
  };
}

function mapInboundOrder(order, config, audit = null) {
  return {
    [config.idKey]: order.id,
    [config.noKey]: order.documentNo,
    [config.dateKey]: order.bizDate,
    supplierId: order.supplierId,
    supplierName: order.supplierNameSnapshot ?? "",
    workshopId: order.workshopId,
    workshopName: order.workshopNameSnapshot ?? "",
    rdProcurementRequestId: order.rdProcurementRequestId ?? null,
    rdProcurementRequestNo: order.rdProcurementRequestNoSnapshot ?? "",
    rdProcurementProjectCode: order.rdProcurementProjectCodeSnapshot ?? "",
    rdProcurementProjectName: order.rdProcurementProjectNameSnapshot ?? "",
    chargeBy: order.handlerNameSnapshot ?? "",
    attn: order.handlerNameSnapshot ?? "",
    totalAmount: Number(order.totalAmount ?? 0).toFixed(2),
    totalQty: Number(order.totalQty ?? 0),
    remark: order.remark ?? "",
    createBy: order.createdBy ?? "",
    auditStatus: toAuditStatus(order.auditStatusSnapshot),
    auditor: audit?.decidedBy ?? null,
    auditTime: audit?.decidedAt ?? null,
    details: Array.isArray(order.lines)
      ? order.lines.map((line) => mapInboundLine(line, config, order, audit))
      : [],
  };
}

async function fetchAuditDocument(config, documentId) {
  const response = await request({
    url: "/api/audit/documents/detail",
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

  const response = await listPersonnel({ name, pageNum: 1, pageSize: 100 });
  const exactMatch = response.rows?.find((item) => item.name === name);
  return exactMatch?.personnelId ?? response.rows?.[0]?.personnelId;
}

async function resolveSupplierId(data) {
  if (typeof data.supplierId === "number") {
    return data.supplierId;
  }

  if (!data.supplierName) {
    return undefined;
  }

  const response = await listSupplierByKeywordIncludingDisabled(
    data.supplierName,
  );
  return response.rows?.[0]?.supplierId;
}

function buildInboundPayload(data, config, handlerPersonnelId, supplierId) {
  const lines = Array.isArray(data.details) ? data.details : [];
  return {
    documentNo: data[config.noKey],
    orderType: config.orderType,
    bizDate: data[config.dateKey],
    supplierId,
    handlerPersonnelId,
    workshopId: data.workshopId,
    rdProcurementRequestId: data.rdProcurementRequestId ?? undefined,
    remark: data.remark,
    lines: lines.map((line) => ({
      ...(line[config.detailIdKey] ? { id: line[config.detailIdKey] } : {}),
      materialId: line.materialId,
      ...(line.rdProcurementRequestLineId
        ? { rdProcurementRequestLineId: line.rdProcurementRequestLineId }
        : {}),
      quantity: toDecimalString(line.quantity),
      unitPrice: toDecimalString(line.unitPrice),
      remark: line.remark,
    })),
  };
}

async function listOrdersInternal(query = {}, mode = "order") {
  const config = MODE_CONFIG[mode];
  const { limit, offset } = buildPageQuery(query);
  const response = await request({
    url: config.listUrl,
    method: "get",
    params: {
      documentNo: query[config.noKey],
      supplierId: query.supplierId,
      handlerName: query.attn,
      materialId: query.materialId,
      materialName: query.materialName,
      workshopId: query.workshopId,
      bizDateFrom: query.params?.beginTime,
      bizDateTo: query.params?.endTime,
      limit,
      offset,
    },
  });

  const items = Array.isArray(response.data?.items) ? response.data.items : [];
  const rows = items.map((item) => mapInboundOrder(item, config));
  return {
    rows,
    total: Number(response.data?.total ?? rows.length),
  };
}

export function listInboundOrders(query = {}, mode = "order") {
  return listOrdersInternal(query, mode);
}

export async function getInboundOrder(id, mode = "order") {
  const config = MODE_CONFIG[mode];
  const [response, audit] = await Promise.all([
    request({
      url: `${config.itemUrl}/${id}`,
      method: "get",
    }),
    fetchAuditDocument(config, id).catch(() => null),
  ]);

  return {
    data: mapInboundOrder(response.data, config, audit),
  };
}

export async function submitInboundOrder(data, mode = "order") {
  const config = MODE_CONFIG[mode];
  const [handlerPersonnelId, supplierId] = await Promise.all([
    resolveHandlerPersonnelId(data.attn).catch(() => undefined),
    mode === "order"
      ? resolveSupplierId(data).catch(() => undefined)
      : Promise.resolve(undefined),
  ]);

  const payload = buildInboundPayload(
    data,
    config,
    handlerPersonnelId,
    supplierId,
  );
  const orderId = data[config.idKey];

  return request({
    url: orderId ? `${config.itemUrl}/${orderId}` : config.itemUrl,
    method: orderId ? "patch" : "post",
    data: payload,
  });
}

export function voidInboundOrder(data, mode = "order") {
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

export async function listInboundDetails(query = {}, mode = "order") {
  const config = MODE_CONFIG[mode];
  const orders = await listOrdersInternal(
    {
      ...query,
      pageNum: 1,
      pageSize: 100,
    },
    mode,
  );

  const rows = orders.rows.flatMap((row) =>
    row.details.map((detail) => ({
      ...detail,
      [config.noKey]: row[config.noKey],
      [config.dateKey]: row[config.dateKey],
      supplierName: row.supplierName,
      workshopName: row.workshopName,
    })),
  );

  return {
    rows,
    total: rows.length,
  };
}

export async function getLatestInboundDetailByMaterialId(
  materialId,
  mode = "order",
) {
  const orders = await listOrdersInternal(
    {
      materialId,
      pageNum: 1,
      pageSize: 100,
    },
    mode,
  );

  const latest = orders.rows
    .flatMap((row) => row.details)
    .find((detail) => detail.materialId === materialId);

  return {
    data: latest
      ? {
          unitPrice: latest.unitPrice,
          taxPrice: latest.taxPrice,
        }
      : null,
  };
}

export function unsupportedInboundDetailAction(message) {
  return Promise.reject(new Error(message));
}
