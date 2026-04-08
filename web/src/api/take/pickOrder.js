import {
  getWorkshopOrder,
  listWorkshopOrders,
  submitWorkshopOrder,
  voidWorkshopOrder,
} from "./compat";

// 查询领料单列表
export function listPickOrder(query) {
  return listWorkshopOrders(query, "pickOrder");
}

// 查询领料单详细
export function getPickOrder(pickId) {
  return getWorkshopOrder(pickId, "pickOrder");
}

// 新增领料单
export function addPickOrder(data) {
  return submitWorkshopOrder(data, "pickOrder");
}

// 修改领料单
export function updatePickOrder(data) {
  return submitWorkshopOrder(data, "pickOrder");
}

// 作废领料单
export function voidPickOrder(pickId, data) {
  return voidWorkshopOrder(
    {
      pickId,
      ...data,
    },
    "pickOrder",
  );
}

// 删除领料单
export function delPickOrder() {
  return Promise.reject(new Error("领料单仅支持作废，不支持删除"));
}
