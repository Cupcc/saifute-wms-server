import request from "@/utils/request";

export function listLog(params = {}) {
  return request({
    url: "/api/inventory/logs",
    method: "get",
    params,
  });
}
