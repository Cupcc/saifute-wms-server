import {
  getWorkshopOrder,
  listWorkshopOrders,
  submitWorkshopOrder,
  voidWorkshopOrder,
} from "@/api/take/compat";

// 查询报废单列表
export function listScrapOrder(query) {
  return listWorkshopOrders(query, "scrapOrder");
}

// 查询报废单详细
export function getScrapOrder(scrapId) {
  return getWorkshopOrder(scrapId, "scrapOrder");
}

// 新增报废单
export function addScrapOrder(data) {
  return submitWorkshopOrder(data, "scrapOrder");
}

// 修改报废单
export function updateScrapOrder(data) {
  return submitWorkshopOrder(data, "scrapOrder");
}

// 删除报废单
export function delScrapOrder() {
  return Promise.reject(new Error("报废单仅支持作废，不支持删除"));
}

// 作废报废单
export function voidScrapOrder(data) {
  return voidWorkshopOrder(data, "scrapOrder");
}
