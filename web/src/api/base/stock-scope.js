import request from "@/utils/request";
import {
  buildDataResponse,
  buildPageQuery,
  buildRowsResponse,
  mapStockScope,
  pickKeyword,
} from "./compat";

export function listStockScope(query = {}) {
  const { limit, offset } = buildPageQuery(query);
  return request({
    url: "/api/master-data/stock-scopes",
    method: "get",
    params: {
      keyword: pickKeyword(query, ["scopeCode", "scopeName"]),
      includeDisabled: query.includeDisabled || undefined,
      limit,
      offset,
    },
  }).then((response) => buildRowsResponse(response.data, mapStockScope));
}

export async function getStockScope(stockScopeId) {
  const response = await request({
    url: `/api/master-data/stock-scopes/${stockScopeId}`,
    method: "get",
  });
  return buildDataResponse(response.data, mapStockScope);
}

export function addStockScope(data) {
  return request({
    url: "/api/master-data/stock-scopes",
    method: "post",
    data: {
      scopeCode: data.scopeCode,
      scopeName: data.scopeName,
    },
  });
}

export function updateStockScope(data) {
  const stockScopeId = data.stockScopeId ?? data.id;
  return request({
    url: `/api/master-data/stock-scopes/${stockScopeId}`,
    method: "patch",
    data: {
      scopeName: data.scopeName,
    },
  });
}

export function delStockScope(data) {
  const stockScopeId =
    typeof data === "number" ? data : (data?.stockScopeId ?? data?.id);
  return request({
    url: `/api/master-data/stock-scopes/${stockScopeId}/deactivate`,
    method: "patch",
  });
}
