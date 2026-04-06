import request from "@/utils/request";

const MODE_CONFIG = {
  pickOrder: {
    listUrl: "/api/workshop-material/pick-orders",
    itemUrl: "/api/workshop-material/pick-orders",
    documentType: "WorkshopMaterialOrder",
    idKey: "pickId",
    noKey: "pickNo",
    dateKey: "pickDate",
    personKey: "picker",
  },
  returnOrder: {
    listUrl: "/api/workshop-material/return-orders",
    itemUrl: "/api/workshop-material/return-orders",
    documentType: "WorkshopMaterialOrder",
    idKey: "returnId",
    noKey: "returnNo",
    dateKey: "returnDate",
    personKey: "returnBy",
  },
  scrapOrder: {
    listUrl: "/api/workshop-material/scrap-orders",
    itemUrl: "/api/workshop-material/scrap-orders",
    documentType: "WorkshopMaterialOrder",
    idKey: "scrapId",
    noKey: "scrapNo",
    dateKey: "scrapDate",
    personKey: "attn",
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

function toAuditStatus(status) {
  if (status === "APPROVED") {
    return "1";
  }
  if (status === "REJECTED") {
    return "2";
  }
  return "0";
}

function mapOrderLine(line, config, order, audit = null) {
  const quantity = Number(line.quantity ?? 0);
  const unitPrice = Number(line.unitPrice ?? 0);

  return {
    detailId: line.id,
    [config.idKey]: order.id,
    [config.noKey]: order.documentNo,
    [config.dateKey]: order.bizDate,
    materialId: line.materialId,
    materialCode: line.materialCodeSnapshot,
    quantity,
    unitPrice,
    subtotal: (quantity * unitPrice).toFixed(2),
    interval: "",
    remark: line.remark ?? "",
    sourceDocumentId: line.sourceDocumentId ?? null,
    sourceDocumentLineId: line.sourceDocumentLineId ?? null,
    sourceType: config.idKey === "returnId" ? 1 : null,
    scrapReason: line.scrapReason ?? "",
    material: {
      materialId: line.materialId,
      materialCode: line.materialCodeSnapshot,
      materialName: line.materialNameSnapshot,
      specification: line.materialSpecSnapshot ?? "",
    },
    auditStatus: toAuditStatus(order.auditStatusSnapshot),
    auditor: audit?.decidedBy ?? null,
    auditTime: audit?.decidedAt ?? null,
  };
}

function mapOrder(order, config, audit = null) {
  const firstLine = order.lines?.[0];
  return {
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
    totalAmount: Number(order.totalAmount ?? 0).toFixed(2),
    totalQty: Number(order.totalQty ?? 0),
    auditStatus: toAuditStatus(order.auditStatusSnapshot),
    auditor: audit?.decidedBy ?? null,
    auditTime: audit?.decidedAt ?? null,
    remark: order.remark ?? "",
    sourceType: config.idKey === "returnId" ? 1 : null,
    pickId: firstLine?.sourceDocumentId ?? null,
    pickNo: firstLine?.sourceDocumentId
      ? String(firstLine.sourceDocumentId)
      : "",
    disposalMethod: config.idKey === "scrapId" ? "1" : null,
    details: Array.isArray(order.lines)
      ? order.lines.map((line) => mapOrderLine(line, config, order, audit))
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

async function listOrdersInternal(query = {}, mode = "pickOrder") {
  const config = MODE_CONFIG[mode];
  const { limit, offset } = buildPageQuery(query);
  const response = await request({
    url: config.listUrl,
    method: "get",
    params: {
      documentNo: query[config.noKey],
      handlerName: query[config.personKey],
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
  const rows = items.map((item) => mapOrder(item, config));
  return {
    rows,
    total: Number(response.data?.total ?? rows.length),
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
    fetchAuditDocument(config, id).catch(() => null),
  ]);

  return {
    data: mapOrder(response.data, config, audit),
  };
}

export async function listWorkshopOrderDetails(query = {}, mode = "pickOrder") {
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
      workshopName: row.workshopName,
      [config.personKey]: row[config.personKey],
      chargeBy: row.chargeBy,
      createBy: row.createBy,
      disposalMethod: row.disposalMethod,
      pickNo: row.pickNo,
    })),
  );

  return {
    rows,
    total: rows.length,
  };
}

export async function getWorkshopOrderDetail(detailId, mode = "pickOrder") {
  const details = await listWorkshopOrderDetails({}, mode);
  return {
    data: details.rows.find((item) => item.detailId === detailId) ?? null,
  };
}

export function unsupportedWorkshopOrderAction(message) {
  return Promise.reject(new Error(message));
}
