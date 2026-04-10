import request from "@/utils/request";
import {
  buildDataResponse,
  buildPageQuery,
  buildRowsResponse,
  mapSupplier,
  pickKeyword,
} from "./compat";

function normalizeOptionalText(value) {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

// 查询供应商列表
export function listSupplier(query = {}, options = {}) {
  const { limit, offset } = buildPageQuery(query);
  return request({
    url: "/api/master-data/suppliers",
    method: "get",
    params: {
      keyword: pickKeyword(query, [
        "supplierCode",
        "supplierName",
        "contactPerson",
        "contactPhone",
        "address",
      ]),
      includeDisabled: options.includeDisabled || undefined,
      limit,
      offset,
    },
  }).then((response) => buildRowsResponse(response.data, mapSupplier));
}

// 根据关键字查询供应商列表（根据编号、名称搜索）
export function listSupplierByKeyword(keyword, options = {}) {
  return listSupplier({ keyword, pageNum: 1, pageSize: 100 }, options);
}

export function listSupplierByKeywordIncludingDisabled(keyword) {
  return listSupplierByKeyword(keyword, { includeDisabled: true });
}

// 查询供应商详细
export async function getSupplier(supplierId) {
  const response = await request({
    url: `/api/master-data/suppliers/${supplierId}`,
    method: "get",
  });
  return buildDataResponse(response.data, mapSupplier);
}

// 新增供应商
export function addSupplier(data) {
  return request({
    url: "/api/master-data/suppliers",
    method: "post",
    data: {
      supplierCode: data.supplierCode,
      supplierName: data.supplierName,
      contactPerson: normalizeOptionalText(data.contactPerson),
      contactPhone: normalizeOptionalText(data.contactPhone),
      address: normalizeOptionalText(data.address),
    },
  });
}

// 修改供应商
export function updateSupplier(data) {
  return request({
    url: `/api/master-data/suppliers/${data.supplierId}`,
    method: "patch",
    data: {
      supplierCode: data.supplierCode,
      supplierName: data.supplierName,
      contactPerson: normalizeOptionalText(data.contactPerson),
      contactPhone: normalizeOptionalText(data.contactPhone),
      address: normalizeOptionalText(data.address),
    },
  });
}

// 删除供应商
export function delSupplier(data) {
  return abandonSupplier(data);
}

// 作废供应商
export function abandonSupplier(data) {
  const supplierId =
    typeof data === "number" ? data : (data?.supplierId ?? data?.id);
  return request({
    url: `/api/master-data/suppliers/${supplierId}/deactivate`,
    method: "patch",
  });
}
