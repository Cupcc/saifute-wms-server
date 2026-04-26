import request from "@/utils/request";
import {
  buildDataResponse,
  buildPageQuery,
  buildRowsResponse,
  mapCustomer,
  normalizeOptionalId,
  pickKeyword,
} from "./compat";

function applyCustomerTypeFilter(rows, customerType) {
  if (!customerType || customerType === 11111 || customerType === "11111") {
    return rows;
  }

  return rows.filter(
    (item) => Number(item.customerType) === Number(customerType),
  );
}

function normalizeOptionalText(value) {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

// 查询客户列表
export function listCustomer(query = {}) {
  const { limit, offset } = buildPageQuery(query);
  return request({
    url: "/api/master-data/customers",
    method: "get",
    params: {
      keyword: pickKeyword(query, [
        "customerCode",
        "customerName",
        "customerShortName",
        "contactPerson",
        "contactPhone",
        "address",
      ]),
      includeDisabled: query.includeDisabled || undefined,
      limit,
      offset,
    },
  }).then((response) => {
    const result = buildRowsResponse(response.data, mapCustomer);
    if (
      query.customerType &&
      query.customerType !== 11111 &&
      query.customerType !== "11111"
    ) {
      result.rows = applyCustomerTypeFilter(result.rows, query.customerType);
      result.total = result.rows.length;
    }
    return result;
  });
}

// 查询客户列表
export function listTree(query = {}) {
  return listCustomer({ ...query, pageNum: 1, pageSize: 100 });
}

// 根据关键字查询客户列表（用于下拉搜索）
export function listCustomerByKeyword(keyword) {
  return listCustomer({ keyword, pageNum: 1, pageSize: 100 });
}

// 查询客户详细
export async function getCustomer(customerId) {
  const response = await request({
    url: `/api/master-data/customers/${customerId}`,
    method: "get",
  });
  return buildDataResponse(response.data, mapCustomer);
}

// 新增客户
export function addCustomer(data) {
  return request({
    url: "/api/master-data/customers",
    method: "post",
    data: {
      customerCode: data.customerCode,
      customerName: data.customerName,
      contactPerson: normalizeOptionalText(data.contactPerson),
      contactPhone: normalizeOptionalText(data.contactPhone),
      address: normalizeOptionalText(data.address),
      parentId: normalizeOptionalId(data.parentId),
    },
  });
}

// 修改客户
export function updateCustomer(data) {
  return request({
    url: `/api/master-data/customers/${data.customerId}`,
    method: "patch",
    data: {
      customerName: data.customerName,
      contactPerson: normalizeOptionalText(data.contactPerson),
      contactPhone: normalizeOptionalText(data.contactPhone),
      address: normalizeOptionalText(data.address),
      parentId: normalizeOptionalId(data.parentId, { allowNull: true }),
    },
  });
}

// 删除客户（逻辑停用）
export function delCustomer(data) {
  const customerId =
    typeof data === "number" ? data : (data?.customerId ?? data?.id);
  return request({
    url: `/api/master-data/customers/${customerId}/deactivate`,
    method: "patch",
  });
}
