import { listPersonnel } from "@/api/base/personnel";
import request from "@/utils/request";

const MODE_CONFIG = {
  order: {
    listUrl: "/api/customer/orders",
    itemUrl: "/api/customer/orders",
    voidUrl: "/api/customer/orders",
    idKey: "orderId",
    detailIdKey: "detailId",
  },
  salesReturn: {
    listUrl: "/api/customer/sales-returns",
    itemUrl: "/api/customer/sales-returns",
    voidUrl: "/api/customer/sales-returns",
    idKey: "orderId",
    detailIdKey: "detailId",
  },
};

const CUSTOMER_DOCUMENT_TYPE = "CustomerStockOrder";
const DETAIL_FETCH_LIMIT = 100;

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

function toAuditStatus(status) {
  if (status === "APPROVED") {
    return "1";
  }
  if (status === "REJECTED") {
    return "2";
  }
  return "0";
}

function toNumber(value) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function toDisplayString(value) {
  if (value === null || typeof value === "undefined") {
    return "";
  }
  return String(value);
}

function toDecimalString(value) {
  if (value === null || typeof value === "undefined" || value === "") {
    return undefined;
  }

  return String(value);
}

function mapOrderLine(line, order, audit = null) {
  return {
    detailId: line.id,
    orderId: order.id,
    documentNo: order.documentNo,
    bizDate: order.bizDate,
    customerId: order.customerId ?? null,
    customerCode: order.customerCodeSnapshot ?? "",
    customerName: order.customerNameSnapshot ?? "",
    workshopId: order.workshopId ?? null,
    workshopName: order.workshopNameSnapshot ?? "",
    handlerName: order.handlerNameSnapshot ?? "",
    materialId: line.materialId,
    materialCode: line.materialCodeSnapshot ?? "",
    materialName: line.materialNameSnapshot ?? "",
    specification: line.materialSpecSnapshot ?? "",
    unitCode: line.unitCodeSnapshot ?? "",
    quantity: toNumber(line.quantity),
    unitPrice: toNumber(line.unitPrice),
    amount: toNumber(line.amount),
    startNumber: line.startNumber ?? "",
    endNumber: line.endNumber ?? "",
    sourceDocumentId: line.sourceDocumentId ?? null,
    sourceDocumentLineId: line.sourceDocumentLineId ?? null,
    remark: line.remark ?? "",
    auditStatus: toAuditStatus(order.auditStatusSnapshot),
    auditor: audit?.decidedBy ?? null,
    auditTime: audit?.decidedAt ?? null,
  };
}

function mapCustomerOrder(order, audit = null) {
  const firstLine = order.lines?.[0];
  return {
    orderId: order.id,
    documentNo: order.documentNo,
    bizDate: order.bizDate,
    customerId: order.customerId ?? null,
    customerCode: order.customerCodeSnapshot ?? "",
    customerName: order.customerNameSnapshot ?? "",
    workshopId: order.workshopId ?? null,
    workshopName: order.workshopNameSnapshot ?? "",
    handlerPersonnelId: order.handlerPersonnelId ?? null,
    handlerName: order.handlerNameSnapshot ?? "",
    totalQty: toNumber(order.totalQty),
    totalAmount: toNumber(order.totalAmount),
    remark: order.remark ?? "",
    lifecycleStatus: order.lifecycleStatus ?? "",
    inventoryEffectStatus: order.inventoryEffectStatus ?? "",
    auditStatus: toAuditStatus(order.auditStatusSnapshot),
    auditor: audit?.decidedBy ?? null,
    auditTime: audit?.decidedAt ?? null,
    createBy: order.createdBy ?? "",
    createTime: order.createdAt ?? null,
    updateBy: order.updatedBy ?? "",
    updateTime: order.updatedAt ?? null,
    voidReason: order.voidReason ?? "",
    sourceOutboundOrderId: firstLine?.sourceDocumentId ?? null,
    details: Array.isArray(order.lines)
      ? order.lines.map((line) => mapOrderLine(line, order, audit))
      : [],
  };
}

async function fetchApprovalDocument(documentId) {
  const response = await request({
    url: "/api/approval/documents/detail",
    method: "get",
    params: {
      documentType: CUSTOMER_DOCUMENT_TYPE,
      documentId,
    },
  });

  return response.data ?? null;
}

async function resolveHandlerPersonnelId(personnel) {
  if (typeof personnel === "number") {
    return personnel;
  }

  if (!personnel) {
    return undefined;
  }

  const response = await listPersonnel({
    name: personnel,
    pageNum: 1,
    pageSize: 100,
  });
  const exactMatch = response.rows?.find((item) => item.name === personnel);
  return exactMatch?.personnelId ?? response.rows?.[0]?.personnelId;
}

function buildCustomerPayload(data, mode, handlerPersonnelId) {
  const lines = Array.isArray(data.details) ? data.details : [];
  const basePayload = {
    bizDate: data.bizDate,
    customerId: data.customerId,
    handlerPersonnelId,
    workshopId: data.workshopId,
    remark: data.remark,
  };

  if (mode === "salesReturn") {
    return {
      ...basePayload,
      documentNo: data.documentNo,
      sourceOutboundOrderId: data.sourceOutboundOrderId,
      lines: lines.map((line) => ({
        materialId: line.materialId,
        quantity: toDecimalString(line.quantity),
        sourceOutboundLineId: line.sourceOutboundLineId,
        unitPrice: toDecimalString(line.unitPrice),
        remark: line.remark,
      })),
    };
  }

  return {
    ...basePayload,
    ...(data.orderId ? {} : { documentNo: data.documentNo }),
    lines: lines.map((line) => ({
      ...(line.detailId ? { id: line.detailId } : {}),
      materialId: line.materialId,
      quantity: toDecimalString(line.quantity),
      unitPrice: toDecimalString(line.unitPrice),
      startNumber: line.startNumber,
      endNumber: line.endNumber,
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
      documentNo: query.documentNo,
      customerId: query.customerId,
      workshopId: query.workshopId,
      sourceOutboundOrderId: query.sourceOutboundOrderId,
      bizDateFrom: query.params?.beginTime,
      bizDateTo: query.params?.endTime,
      limit,
      offset,
    },
  });

  const items = Array.isArray(response.data?.items) ? response.data.items : [];
  const rows = items.map((item) => mapCustomerOrder(item));
  return {
    rows,
    total: Number(response.data?.total ?? rows.length),
  };
}

function applyDetailFilters(rows, query = {}) {
  return rows.filter((row) => {
    if (query.materialId && row.materialId !== Number(query.materialId)) {
      return false;
    }
    if (
      query.materialCode &&
      !toDisplayString(row.materialCode).includes(
        toDisplayString(query.materialCode),
      )
    ) {
      return false;
    }
    if (
      query.materialName &&
      !toDisplayString(row.materialName).includes(
        toDisplayString(query.materialName),
      )
    ) {
      return false;
    }
    if (
      query.specification &&
      !toDisplayString(row.specification).includes(
        toDisplayString(query.specification),
      )
    ) {
      return false;
    }
    return true;
  });
}

export function listCustomerOrders(query = {}, mode = "order") {
  return listOrdersInternal(query, mode);
}

export async function getCustomerOrder(id, mode = "order") {
  const config = MODE_CONFIG[mode];
  const [response, audit] = await Promise.all([
    request({
      url: `${config.itemUrl}/${id}`,
      method: "get",
    }),
    fetchApprovalDocument(id).catch(() => null),
  ]);

  return {
    data: mapCustomerOrder(response.data, audit),
  };
}

export async function submitCustomerOrder(data, mode = "order") {
  const config = MODE_CONFIG[mode];
  const handlerPersonnelId = await resolveHandlerPersonnelId(
    data.handlerPersonnelId ?? data.handlerName,
  ).catch(() => undefined);
  const payload = buildCustomerPayload(data, mode, handlerPersonnelId);
  const orderId = data[config.idKey];

  return request({
    url: orderId ? `${config.itemUrl}/${orderId}` : config.itemUrl,
    method: orderId ? "patch" : "post",
    data: payload,
  });
}

export function voidCustomerOrder(data, mode = "order") {
  const config = MODE_CONFIG[mode];
  const orderId = data[config.idKey];

  return request({
    url: `${config.voidUrl}/${orderId}/void`,
    method: "post",
    data: {
      voidReason: data.voidReason,
    },
  });
}

export async function listCustomerOrderDetails(query = {}, mode = "order") {
  const { pageNum, pageSize } = buildPageQuery(query);
  const orders = await listOrdersInternal(
    {
      ...query,
      pageNum: 1,
      pageSize: DETAIL_FETCH_LIMIT,
    },
    mode,
  );

  const rows = applyDetailFilters(
    orders.rows.flatMap((row) =>
      row.details.map((detail) => ({
        ...detail,
        sourceOutboundOrderId: row.sourceOutboundOrderId,
      })),
    ),
    query,
  );

  return {
    rows: rows.slice((pageNum - 1) * pageSize, pageNum * pageSize),
    total: rows.length,
  };
}

export async function getCustomerOrderDetail(detailId, mode = "order") {
  const details = await listCustomerOrderDetails(
    {
      pageNum: 1,
      pageSize: DETAIL_FETCH_LIMIT,
    },
    mode,
  );

  return {
    data: details.rows.find((item) => item.detailId === detailId) ?? null,
  };
}

export function unsupportedCustomerAction(message) {
  return Promise.reject(new Error(message));
}
