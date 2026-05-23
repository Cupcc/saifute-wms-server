import request from "@/utils/request";
import {
  buildDataResponse,
  buildPageQuery,
  buildRowsResponse,
  fetchMaterialInventoryMap,
  mapMaterial,
  pickKeyword,
} from "./compat";

function optionalString(value) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function optionalValue(value) {
  return value === "" || value === null || typeof value === "undefined"
    ? undefined
    : value;
}

function buildMaterialFilterParams(query, limit, offset) {
  return {
    keyword: optionalString(query.keyword),
    materialCode: optionalString(query.materialCode),
    materialName: optionalString(query.materialName),
    specModel: optionalString(query.specModel ?? query.specification),
    categoryId: optionalValue(query.categoryId ?? query.category),
    unitCode: optionalString(query.unitCode ?? query.unit),
    warningMinQty: optionalValue(query.warningMinQty ?? query.stockMin),
    includeDisabled: query.includeDisabled || undefined,
    limit,
    offset,
  };
}

// 查询物料列表
export function listMaterial(query = {}) {
  const { limit, offset } = buildPageQuery(query);
  return request({
    url: "/api/master-data/materials",
    method: "get",
    params: buildMaterialFilterParams(query, limit, offset),
  }).then((response) => buildRowsResponse(response.data, mapMaterial));
}

// 查询物料列表（支持按编码或名称模糊搜索）
export async function listMaterialByCodeOrName(query = {}) {
  const { limit, offset } = buildPageQuery(query);
  const keyword = pickKeyword(query, [
    "keyword",
    "materialCode",
    "materialName",
    "specification",
    "specModel",
  ]);
  const [materialResponse, inventoryMap] = await Promise.all([
    request({
      url: "/api/master-data/materials",
      method: "get",
      params: {
        keyword,
        limit,
        offset,
      },
    }),
    fetchMaterialInventoryMap(query, limit).catch(() => new Map()),
  ]);

  return buildRowsResponse(materialResponse.data, (item) =>
    mapMaterial(item, { currentQty: inventoryMap.get(item.id) }),
  );
}

// 查询物料详细
export async function getMaterial(materialId) {
  const response = await request({
    url: `/api/master-data/materials/${materialId}`,
    method: "get",
  });
  return buildDataResponse(response.data, mapMaterial);
}

// 新增物料
export function addMaterial(data) {
  const categoryId =
    data.category === null || typeof data.category === "undefined"
      ? undefined
      : data.category;
  return request({
    url: "/api/master-data/materials",
    method: "post",
    data: {
      materialCode: data.materialCode,
      materialName: data.materialName,
      specModel: data.specification,
      categoryId,
      unitCode: data.unit,
      warningMinQty: data.stockMin,
      warningMaxQty: data.stockMax,
    },
  });
}

// 修改物料
export function updateMaterial(data) {
  const categoryId =
    data.category === null || typeof data.category === "undefined"
      ? undefined
      : data.category;
  return request({
    url: `/api/master-data/materials/${data.materialId}`,
    method: "patch",
    data: {
      materialName: data.materialName,
      specModel: data.specification,
      categoryId,
      unitCode: data.unit,
      warningMinQty: data.stockMin,
      warningMaxQty: data.stockMax,
    },
  });
}

// 删除物料（逻辑停用）
export function delMaterial(data) {
  const materialId =
    typeof data === "number" ? data : (data?.materialId ?? data?.id);
  return request({
    url: `/api/master-data/materials/${materialId}/deactivate`,
    method: "patch",
  });
}
