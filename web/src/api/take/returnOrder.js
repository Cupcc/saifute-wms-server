import {
  getWorkshopOrder,
  listWorkshopOrders,
  submitWorkshopOrder,
  voidWorkshopOrder,
} from "./compat";

// 查询退料单列表
export function listReturnOrder(query) {
  return listWorkshopOrders(query, "returnOrder");
}

// 查询退料单详细
export function getReturnOrder(returnId) {
  return getWorkshopOrder(returnId, "returnOrder");
}

// 新增退料单
export function addReturnOrder(data) {
  return submitWorkshopOrder(data, "returnOrder");
}

// 修改退料单
export function updateReturnOrder(data) {
  return submitWorkshopOrder(data, "returnOrder");
}

// 删除退料单（作废）
export function delReturnOrder(data) {
  return voidWorkshopOrder(data, "returnOrder");
}
