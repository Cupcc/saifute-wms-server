import request from "@/utils/request";
import {
  buildDataResponse,
  buildPageQuery,
  buildRowsResponse,
  mapPersonnel,
  pickKeyword,
} from "./compat";

function normalizeOptionalText(value) {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

// 查询人员信息列表
export function listPersonnel(query = {}) {
  const { limit, offset } = buildPageQuery(query);
  return request({
    url: "/api/master-data/personnel",
    method: "get",
    params: {
      keyword: pickKeyword(query, ["name"]),
      workshopId: query.workshopId || undefined,
      includeDisabled: query.includeDisabled || undefined,
      limit,
      offset,
    },
  }).then((response) =>
    buildRowsResponse(response.data, (item) => mapPersonnel(item)),
  );
}

// 查询人员信息详细
export async function getPersonnel(personnelId) {
  const response = await request({
    url: `/api/master-data/personnel/${personnelId}`,
    method: "get",
  });
  return buildDataResponse(response.data, (item) => mapPersonnel(item));
}

// 新增人员信息
export function addPersonnel(data) {
  return request({
    url: "/api/master-data/personnel",
    method: "post",
    data: {
      personnelName: data.name || data.personnelName,
      contactPhone: normalizeOptionalText(data.contactPhone),
      workshopId: data.workshopId ?? null,
    },
  });
}

// 修改人员信息
export function updatePersonnel(data) {
  const personnelId = data.personnelId ?? data.id;
  const payload = {
    personnelName: data.name || data.personnelName,
    contactPhone: normalizeOptionalText(data.contactPhone),
  };
  if (Object.hasOwn(data, "workshopId")) {
    payload.workshopId = data.workshopId ?? null;
  }

  return request({
    url: `/api/master-data/personnel/${personnelId}`,
    method: "patch",
    data: payload,
  });
}

// 删除人员信息（逻辑停用）
export function delPersonnel(data) {
  const personnelId =
    typeof data === "number" ? data : (data?.personnelId ?? data?.id);
  return request({
    url: `/api/master-data/personnel/${personnelId}/deactivate`,
    method: "patch",
  });
}
