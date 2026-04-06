import request from "@/utils/request";
import {
  buildDataResponse,
  buildPageQuery,
  buildRowsResponse,
  mapWorkshop,
  pickKeyword,
} from "./compat";

// 查询部门列表
export function listWorkshop(query = {}) {
  const { limit, offset } = buildPageQuery(query);
  return request({
    url: "/api/master-data/workshops",
    method: "get",
    params: {
      keyword: pickKeyword(query, ["workshopCode", "workshopName"]),
      includeDisabled: query.includeDisabled || undefined,
      limit,
      offset,
    },
  }).then((response) => buildRowsResponse(response.data, mapWorkshop));
}
export function listByNameOrContact(query) {
  return listWorkshop({ ...query, pageNum: 1, pageSize: 100 });
}

// 查询部门详细
export async function getWorkshop(workshopId) {
  const response = await request({
    url: `/api/master-data/workshops/${workshopId}`,
    method: "get",
  });
  return buildDataResponse(response.data, mapWorkshop);
}

// 新增部门
export function addWorkshop(data) {
  return request({
    url: "/api/master-data/workshops",
    method: "post",
    data: {
      workshopCode: data.workshopCode,
      workshopName: data.workshopName,
    },
  });
}

// 修改部门
export function updateWorkshop(data) {
  const workshopId = data.workshopId ?? data.id;
  return request({
    url: `/api/master-data/workshops/${workshopId}`,
    method: "patch",
    data: {
      workshopName: data.workshopName,
    },
  });
}

// 删除部门（逻辑停用）
export function delWorkshop(data) {
  const workshopId =
    typeof data === "number" ? data : (data?.workshopId ?? data?.id);
  return request({
    url: `/api/master-data/workshops/${workshopId}/deactivate`,
    method: "patch",
  });
}
