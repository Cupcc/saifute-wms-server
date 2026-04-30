import { listPersonnel } from "@/api/base/personnel";
import request from "@/utils/request";

const MODE_CONFIG = {
  order: {
    listUrl: "/api/sales/orders",
    detailUrl: "/api/sales/orders/details",
    itemUrl: "/api/sales/orders",
    voidUrl: "/api/sales/orders",
    idKey: "orderId",
    detailIdKey: "detailId",
  },
  salesReturn: {
    listUrl: "/api/sales/sales-returns",
    detailUrl: "/api/sales/sales-returns/details",
    itemUrl: "/api/sales/sales-returns",
    voidUrl: "/api/sales/sales-returns",
    idKey: "orderId",
    detailIdKey: "detailId",
  },
};

const CUSTOMER_DOCUMENT_TYPE = "SalesStockOrder";

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

function toDecimalString(value) {
  if (value === null || typeof value === "undefined" || value === "") {
    return undefined;
  }

  return String(value);
}

function mapOrderLine(line, order, audit = null) {
  const quantity = toNumber(line.quantity);
  const unitPrice = toNumber(line.unitPrice);
  const amount = toNumber(line.amount ?? quantity * unitPrice);
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
    quantity,
    unitPrice,
    amount,
    selectedUnitCost: toNumber(line.selectedUnitCost),
    costUnitPrice: toNumber(line.costUnitPrice),
    costAmount: toNumber(line.costAmount),
    salesProjectId: line.salesProjectId ?? null,
    salesProjectCode: line.salesProjectCodeSnapshot ?? "",
    salesProjectName: line.salesProjectNameSnapshot ?? "",
    startNumber: line.startNumber ?? "",
    endNumber: line.endNumber ?? "",
    sourceDocumentId: line.sourceDocumentId ?? null,
    sourceDocumentLineId: line.sourceDocumentLineId ?? null,
    remark: line.remark ?? "",
    auditStatus: toAuditStatus(order.auditStatusSnapshot),
    auditor: audit?.decidedBy ?? null,
    auditTime: audit?.decidedAt ?? null,
    createBy: order.createdBy ?? "",
    createdAt: order.createdAt ?? null,
    updatedAt: order.updatedAt ?? null,
  };
}

function mapSalesOrder(order, audit = null) {
  const firstLine = order.lines?.[0];
  const details = Array.isArray(order.lines)
    ? order.lines.map((line) => mapOrderLine(line, order, audit))
    : [];
  const totalAmount =
    order.totalAmount ??
    details.reduce((sum, line) => sum + Number(line.amount || 0), 0);
  const projectSnapshots = [
    ...new Set(
      (order.lines ?? [])
        .map(
          (line) =>
            line.salesProjectNameSnapshot || line.salesProjectCodeSnapshot || "",
        )
        .filter(Boolean),
    ),
  ];
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
    totalAmount: toNumber(totalAmount),
    remark: order.remark ?? "",
    lifecycleStatus: order.lifecycleStatus ?? "",
    inventoryEffectStatus: order.inventoryEffectStatus ?? "",
    auditStatus: toAuditStatus(order.auditStatusSnapshot),
    auditor: audit?.decidedBy ?? null,
    auditTime: audit?.decidedAt ?? null,
    createBy: order.createdBy ?? "",
    createdAt: order.createdAt ?? null,
    updateBy: order.updatedBy ?? "",
    updatedAt: order.updatedAt ?? null,
    voidReason: order.voidReason ?? "",
    sourceOutboundOrderId: firstLine?.sourceDocumentId ?? null,
    salesProjectSummary: projectSnapshots.join(" / "),
    details,
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
      ...(data.orderId ? { documentNo: data.documentNo } : {}),
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
    ...(data.orderId ? { documentNo: data.documentNo } : {}),
    lines: lines.map((line) => ({
      ...(line.detailId ? { id: line.detailId } : {}),
      materialId: line.materialId,
      quantity: toDecimalString(line.quantity),
      selectedUnitCost: toDecimalString(line.selectedUnitCost),
      unitPrice: toDecimalString(line.unitPrice),
      salesProjectId: line.salesProjectId,
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
  const rows = items.map((item) => mapSalesOrder(item));
  return {
    rows,
    total: Number(response.data?.total ?? rows.length),
  };
}

export function listSalesOrders(query = {}, mode = "order") {
  return listOrdersInternal(query, mode);
}

export async function getSalesOrder(id, mode = "order") {
  const config = MODE_CONFIG[mode];
  const [response, audit] = await Promise.all([
    request({
      url: `${config.itemUrl}/${id}`,
      method: "get",
    }),
    fetchApprovalDocument(id).catch(() => null),
  ]);

  return {
    data: mapSalesOrder(response.data, audit),
  };
}

export async function submitSalesOrder(data, mode = "order") {
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

export function voidSalesOrder(data, mode = "order") {
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

export async function listSalesOrderDetails(query = {}, mode = "order") {
  const config = MODE_CONFIG[mode];
  const { limit, offset } = buildPageQuery(query);
  const response = await request({
    url: config.detailUrl,
    method: "get",
    params: {
      documentNo: query.documentNo,
      detailId: query.detailId,
      customerId: query.customerId,
      workshopId: query.workshopId,
      materialId: query.materialId,
      materialCode: query.materialCode,
      materialName: query.materialName,
      specification: query.specification,
      sourceOutboundOrderId: query.sourceOutboundOrderId,
      bizDateFrom: query.params?.beginTime,
      bizDateTo: query.params?.endTime,
      limit,
      offset,
    },
  });

  const items = Array.isArray(response.data?.items) ? response.data.items : [];
  const rows = items.map((item) => ({
    ...mapOrderLine(item, item.order ?? {}),
    sourceOutboundOrderId: item.sourceDocumentId ?? null,
  }));

  return {
    rows,
    total: Number(response.data?.total ?? rows.length),
  };
}

export async function getSalesOrderDetail(detailId, mode = "order") {
  const details = await listSalesOrderDetails(
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

export function unsupportedSalesAction(message) {
  return Promise.reject(new Error(message));
}
