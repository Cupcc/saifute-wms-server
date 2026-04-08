import {
  getInboundOrder,
  listInboundOrders,
  submitInboundOrder,
  voidInboundOrder,
} from "./compat";

// 查询入库单列表
export function listOrder(query) {
  return listInboundOrders(query, "order");
}

// 查询入库单详细
export function getOrder(inboundId) {
  return getInboundOrder(inboundId, "order");
}

// 新增入库单
export function addOrder(data) {
  return submitInboundOrder(data, "order");
}

// 修改入库单
export function updateOrder(data) {
  return submitInboundOrder(data, "order");
}

// 作废入库单
export function abandonOrder(data) {
  return voidInboundOrder(data, "order");
}

// 删除入库单
export function delOrder(data) {
  return voidInboundOrder(data, "order");
}

// 审核单据
export function approvalOrder() {
  throw new Error("请改用 @/api/approval/approval 中的审批入口");
}
