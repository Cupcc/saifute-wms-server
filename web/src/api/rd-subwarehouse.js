import request from "@/utils/request";

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
    params,
  });
}

export function listRdInventoryBalances(params = {}) {
  return request({
    url: "/api/inventory/balances",
    method: "get",
    params,
  });
}

export function listRdInboundResults(params = {}) {
  return request({
    url: "/api/rd-subwarehouse/handoff-orders",
    method: "get",
    params,
  });
}

export function listRdProcurementRequests(params = {}) {
  return request({
    url: "/api/rd-subwarehouse/procurement-requests",
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

export function listRdProjects(params = {}) {
  return request({
    url: "/api/projects",
    method: "get",
    params,
  });
}

export function getRdProject(projectId) {
  return request({
    url: `/api/projects/${projectId}`,
    method: "get",
  });
}

export function createRdProject(data) {
  return request({
    url: "/api/projects",
    method: "post",
    data,
  });
}

export function voidRdProject(projectId, data) {
  return request({
    url: `/api/projects/${projectId}/void`,
    method: "post",
    data,
  });
}

export function listRdScrapOrders(params = {}) {
  return request({
    url: "/api/workshop-material/scrap-orders",
    method: "get",
    params,
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
    data,
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
