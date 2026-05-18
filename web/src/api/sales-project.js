import request from "@/utils/request";

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

function mapProject(project = {}) {
  const materialLines = Array.isArray(project.materialLines)
    ? project.materialLines.map((line) => ({
        lineId: line.id,
        materialId: line.materialId,
        materialCode: line.materialCodeSnapshot ?? "",
        materialName: line.materialNameSnapshot ?? "",
        specification: line.materialSpecSnapshot ?? "",
        unitCode: line.unitCodeSnapshot ?? "",
        quantity: Number(line.quantity ?? 0),
        unitPrice: Number(line.unitPrice ?? 0),
        amount: Number(line.amount ?? 0),
        remark: line.remark ?? "",
      }))
    : [];

  return {
    projectId: project.id,
    salesProjectCode: project.salesProjectCode ?? "",
    salesProjectName: project.salesProjectName ?? "",
    bizDate: project.bizDate ?? "",
    customerId: project.customerId ?? undefined,
    customerCode: project.customerCodeSnapshot ?? "",
    customerName: project.customerNameSnapshot ?? "",
    managerPersonnelId: project.managerPersonnelId ?? undefined,
    managerName: project.managerNameSnapshot ?? "",
    workshopId: project.workshopId ?? undefined,
    workshopName: project.workshopNameSnapshot ?? "",
    stockScopeId: project.stockScopeId ?? undefined,
    stockScopeName: project.stockScope?.scopeName ?? "",
    projectTargetId: project.projectTargetId ?? undefined,
    remark: project.remark ?? "",
    lifecycleStatus: project.lifecycleStatus ?? "",
    materialLines,
    summary: project.summary ? mapMaterialSummary(project.summary) : null,
  };
}

function toNumber(value) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function mapMaterialSummary(summary = {}) {
  return {
    materialLineCount: toNumber(summary.materialLineCount),
    materialKindCount: toNumber(
      summary.materialKindCount ?? summary.materialLineCount,
    ),
    totalTargetQty: toNumber(summary.totalTargetQty ?? summary.totalPlannedQty),
    totalTargetAmount: toNumber(
      summary.totalTargetAmount ?? summary.totalPlannedAmount,
    ),
    totalPriceLayerCount: toNumber(summary.totalPriceLayerCount),
    totalCurrentInventoryQty: toNumber(
      summary.totalCurrentInventoryQty ?? summary.totalAvailableQty,
    ),
    totalOutboundQty: toNumber(summary.totalOutboundQty),
    totalOutboundAmount: toNumber(summary.totalOutboundAmount),
    totalOutboundCostAmount: toNumber(summary.totalOutboundCostAmount),
    totalReturnQty: toNumber(summary.totalReturnQty),
    totalReturnAmount: toNumber(summary.totalReturnAmount),
    totalReturnCostAmount: toNumber(summary.totalReturnCostAmount),
    totalNetShipmentQty: toNumber(
      summary.totalNetShipmentQty ?? summary.totalNetShippedQty,
    ),
    totalNetShipmentAmount: toNumber(
      summary.totalNetShipmentAmount ?? summary.totalNetShippedAmount,
    ),
    totalNetShipmentCostAmount: toNumber(
      summary.totalNetShipmentCostAmount ?? summary.totalNetShippedCostAmount,
    ),
    totalPendingSupplyQty: toNumber(
      summary.totalPendingSupplyQty ?? summary.totalPendingQty,
    ),
  };
}

function mapMaterialLedgerRow(item = {}) {
  return {
    materialId: item.materialId,
    materialSourceType: item.materialSourceType ?? "PROJECT_STOCK",
    sourceProjectTargetId: item.sourceProjectTargetId ?? null,
    selectedUnitCost:
      item.selectedUnitCost === null || typeof item.selectedUnitCost === "undefined"
        ? ""
        : String(item.selectedUnitCost),
    priceLayerAvailableQty: toNumber(item.priceLayerAvailableQty),
    priceLayerSourceLogCount: toNumber(item.priceLayerSourceLogCount),
    materialCode: item.materialCode ?? item.materialCodeSnapshot ?? "",
    materialName: item.materialName ?? item.materialNameSnapshot ?? "",
    specification:
      item.specification ?? item.materialSpecSnapshot ?? item.specModel ?? "",
    unitCode: item.unitCode ?? item.unitCodeSnapshot ?? "",
    targetQty: toNumber(item.targetQty ?? item.plannedQty ?? item.quantity),
    targetUnitPrice: toNumber(
      item.targetUnitPrice ?? item.plannedUnitPrice ?? item.unitPrice,
    ),
    targetAmount: toNumber(item.targetAmount ?? item.plannedAmount ?? item.amount),
    currentInventoryQty: toNumber(
      item.currentInventoryQty ?? item.availableQty ?? item.currentQty,
    ),
    outboundQty: toNumber(item.outboundQty ?? item.shippedQty),
    outboundAmount: toNumber(item.outboundAmount ?? item.shippedAmount),
    outboundCostAmount: toNumber(
      item.outboundCostAmount ?? item.shippedCostAmount,
    ),
    returnQty: toNumber(item.returnQty),
    returnAmount: toNumber(item.returnAmount),
    returnCostAmount: toNumber(item.returnCostAmount),
    netShipmentQty: toNumber(item.netShipmentQty ?? item.netShippedQty),
    netShipmentAmount: toNumber(
      item.netShipmentAmount ?? item.netShippedAmount,
    ),
    netShipmentCostAmount: toNumber(
      item.netShipmentCostAmount ?? item.netShippedCostAmount,
    ),
    pendingSupplyQty: toNumber(item.pendingSupplyQty ?? item.pendingQty),
    remark: item.remark ?? "",
    linkedDocuments: Array.isArray(item.linkedDocuments)
      ? item.linkedDocuments.map((document) => ({
          documentType: document.documentType ?? "",
          documentId: document.documentId,
          documentNo: document.documentNo ?? "",
          documentDate: document.documentDate ?? "",
          documentLabel: document.documentLabel ?? "关联表单",
          lineId: document.lineId,
          lineNo: document.lineNo,
          quantity: toNumber(document.quantity),
          unitPrice: toNumber(document.unitPrice),
        }))
      : [],
  };
}

export async function listSalesProjects(query = {}) {
  const { limit, offset, pageNum, pageSize } = buildPageQuery(query);
  const response = await request({
    url: "/api/sales-projects",
    method: "get",
    params: {
      salesProjectCode: query.salesProjectCode,
      salesProjectName: query.salesProjectName,
      customerId: query.customerId,
      workshopId: query.workshopId,
      bizDateFrom: query.params?.beginTime,
      bizDateTo: query.params?.endTime,
      limit,
      offset,
    },
  });

  const items = Array.isArray(response.data?.items) ? response.data.items : [];
  const rows = items.map((item) => mapProject(item));
  return {
    rows: rows.slice(0, pageSize),
    total: Number(response.data?.total ?? rows.length),
    pageNum,
    pageSize,
  };
}

export async function getSalesProject(projectId) {
  const response = await request({
    url: `/api/sales-projects/${projectId}`,
    method: "get",
  });

  return {
    data: mapProject(response.data),
  };
}

export function createSalesProject(data) {
  return request({
    url: "/api/sales-projects",
    method: "post",
    data,
  });
}

export function updateSalesProject(projectId, data) {
  return request({
    url: `/api/sales-projects/${projectId}`,
    method: "patch",
    data,
  });
}

export function voidSalesProject(projectId, data = {}) {
  return request({
    url: `/api/sales-projects/${projectId}/void`,
    method: "post",
    data,
  });
}

export async function getSalesProjectMaterials(projectId) {
  const response = await request({
    url: `/api/sales-projects/${projectId}/materials`,
    method: "get",
  });

  return {
    data: {
      summary: mapMaterialSummary(response.data?.summary ?? {}),
      materials: Array.isArray(response.data?.materials)
        ? response.data.materials.map((item) => mapMaterialLedgerRow(item))
        : Array.isArray(response.data?.items)
          ? response.data.items.map((item) => mapMaterialLedgerRow(item))
          : [],
    },
  };
}

export async function createSalesProjectOutboundDraft(projectId, data = {}) {
  const response = await request({
    url: `/api/sales-projects/${projectId}/sales-outbound-draft`,
    method: "post",
    data,
  });

  return {
    data: response.data ?? {},
  };
}
