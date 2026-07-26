import request from "@/utils/request";

const RD_STOCK_SCOPE = "RD_SUB";

function withRdStockScope(params = {}) {
  return {
    ...params,
    stockScope: RD_STOCK_SCOPE,
  };
}

export function listRdMaterials(params = {}) {
  return request({
    url: "/api/master-data/materials",
    method: "get",
    params,
  });
}

export function listRdInventoryLogs(params = {}) {
  return request({
    url: "/api/inventory/logs",
    method: "get",
    params: withRdStockScope(params),
  });
}

export function listRdInboundResults(params = {}) {
  return request({
    url: "/api/rd-subwarehouse/handoff-orders",
    method: "get",
    params,
  });
}

export function getRdHandoffOrder(orderId) {
  return request({
    url: `/api/rd-subwarehouse/handoff-orders/${orderId}`,
    method: "get",
  });
}

export function createRdHandoffOrder(data) {
  return request({
    url: "/api/rd-subwarehouse/handoff-orders",
    method: "post",
    data,
  });
}

export function voidRdHandoffOrder(orderId, data) {
  return request({
    url: `/api/rd-subwarehouse/handoff-orders/${orderId}/void`,
    method: "post",
    data,
  });
}

export function listRdProcurementRequests(params = {}) {
  return request({
    url: "/api/rd-subwarehouse/procurement-requests",
    method: "get",
    params,
  });
}

export function listRdProcurementMaterialSuggestions(params = {}) {
  return request({
    url: "/api/rd-subwarehouse/procurement-requests/material-suggestions",
    method: "get",
    params,
  });
}

export function listRdAcceptanceMaterialOptions(params = {}) {
  return request({
    url: "/api/rd-subwarehouse/procurement-requests/acceptance-material-options",
    method: "get",
    params,
  });
}

export function getRdProcurementRequest(requestId) {
  return request({
    url: `/api/rd-subwarehouse/procurement-requests/${requestId}`,
    method: "get",
  });
}

export function createRdProcurementRequest(data) {
  return request({
    url: "/api/rd-subwarehouse/procurement-requests",
    method: "post",
    data,
  });
}

export function voidRdProcurementRequest(requestId, data) {
  return request({
    url: `/api/rd-subwarehouse/procurement-requests/${requestId}/void`,
    method: "post",
    data,
  });
}

export function applyRdProcurementStatusAction(requestId, data) {
  return request({
    url: `/api/rd-subwarehouse/procurement-requests/${requestId}/status-actions`,
    method: "post",
    data,
  });
}

export function reverseRdProcurementStatusAction(requestId, historyId, data) {
  return request({
    url: `/api/rd-subwarehouse/procurement-requests/${requestId}/status-actions/${historyId}/reverse`,
    method: "post",
    data,
  });
}

export function listRdProjects(params = {}) {
  return request({
    url: "/api/rd-projects",
    method: "get",
    params,
  });
}

export function getRdProject(projectId) {
  return request({
    url: `/api/rd-projects/${projectId}`,
    method: "get",
  });
}

export function createRdProject(data) {
  return request({
    url: "/api/rd-projects",
    method: "post",
    data,
  });
}

export function updateRdProject(projectId, data) {
  return request({
    url: `/api/rd-projects/${projectId}`,
    method: "patch",
    data,
  });
}

export function voidRdProject(projectId, data) {
  return request({
    url: `/api/rd-projects/${projectId}/void`,
    method: "post",
    data,
  });
}

export function listRdProjectChangeLogs(projectId) {
  return request({
    url: `/api/rd-projects/${projectId}/change-logs`,
    method: "get",
  });
}

export function listRdProjectMaterialActions(projectId, params = {}) {
  return request({
    url: `/api/rd-projects/${projectId}/material-actions`,
    method: "get",
    params,
  });
}

export function getRdProjectMaterialAction(actionId) {
  return request({
    url: `/api/rd-projects/material-actions/${actionId}`,
    method: "get",
  });
}

export function createRdProjectMaterialAction(projectId, data) {
  return request({
    url: `/api/rd-projects/${projectId}/material-actions`,
    method: "post",
    data,
  });
}

export function voidRdProjectMaterialAction(actionId, data) {
  return request({
    url: `/api/rd-projects/material-actions/${actionId}/void`,
    method: "post",
    data,
  });
}

export function listRdScrapOrders(params = {}) {
  return request({
    url: "/api/workshop-material/scrap-orders",
    method: "get",
    params: withRdStockScope(params),
  });
}

export function getRdScrapOrder(orderId) {
  return request({
    url: `/api/workshop-material/scrap-orders/${orderId}`,
    method: "get",
  });
}

export function createRdScrapOrder(data) {
  return request({
    url: "/api/workshop-material/scrap-orders",
    method: "post",
    data: {
      ...data,
      stockScope: RD_STOCK_SCOPE,
    },
  });
}

export function voidRdScrapOrder(orderId, data) {
  return request({
    url: `/api/workshop-material/scrap-orders/${orderId}/void`,
    method: "post",
    data,
  });
}

export function listRdStocktakeOrders(params = {}) {
  return request({
    url: "/api/rd-subwarehouse/stocktake-orders",
    method: "get",
    params,
  });
}

export function getRdStocktakeOrder(orderId) {
  return request({
    url: `/api/rd-subwarehouse/stocktake-orders/${orderId}`,
    method: "get",
  });
}

export function listRdStocktakeProjectOptions(params = {}) {
  return request({
    url: "/api/rd-subwarehouse/stocktake-orders/project-options",
    method: "get",
    params,
  });
}

export function getRdStocktakeBookQty(params = {}) {
  return request({
    url: "/api/rd-subwarehouse/stocktake-orders/book-qty",
    method: "get",
    params,
  });
}

export function createRdStocktakeOrder(data) {
  return request({
    url: "/api/rd-subwarehouse/stocktake-orders",
    method: "post",
    data,
  });
}

export function voidRdStocktakeOrder(orderId, data) {
  return request({
    url: `/api/rd-subwarehouse/stocktake-orders/${orderId}/void`,
    method: "post",
    data,
  });
}
