import request from "@/utils/request";
import { buildDataResponse, buildPageQuery, buildRowsResponse } from "./compat";

function mapMaterialCategory(item) {
  return {
    categoryId: item.id,
    categoryCode: item.categoryCode,
    categoryName: item.categoryName,
    sortOrder: Number(item.sortOrder ?? 0),
    status: item.status ?? "ACTIVE",
  };
}

export function listMaterialCategory(query = {}) {
  const { limit, offset } = buildPageQuery(query);
  return request({
    url: "/api/master-data/material-categories",
    method: "get",
    params: {
      keyword: query.keyword,
      includeDisabled: query.includeDisabled || undefined,
      limit,
      offset,
    },
  }).then((response) => buildRowsResponse(response.data, mapMaterialCategory));
}

export async function getMaterialCategory(categoryId) {
  const response = await request({
    url: `/api/master-data/material-categories/${categoryId}`,
    method: "get",
  });
  return buildDataResponse(response.data, mapMaterialCategory);
}

export function addMaterialCategory(data) {
  return request({
    url: "/api/master-data/material-categories",
    method: "post",
    data: {
      categoryCode: data.categoryCode,
      categoryName: data.categoryName,
      sortOrder: data.sortOrder ?? 0,
    },
  });
}

export function updateMaterialCategory(data) {
  return request({
    url: `/api/master-data/material-categories/${data.categoryId}`,
    method: "patch",
    data: {
      categoryName: data.categoryName,
      sortOrder: data.sortOrder ?? undefined,
    },
  });
}

export function deactivateMaterialCategory(data) {
  const categoryId =
    typeof data === "number" ? data : (data?.categoryId ?? data?.id);
  return request({
    url: `/api/master-data/material-categories/${categoryId}/deactivate`,
    method: "patch",
  });
}
