import request from "@/utils/request";

const BUSINESS_DOCUMENT_TYPE_MAP = {
  4: "SalesStockOrder",
};

function unsupportedStockAction(message) {
  return Promise.reject(new Error(message));
}

function isSupportedIntervalOrderType(orderType) {
  return (
    orderType === null ||
    typeof orderType === "undefined" ||
    orderType === "" ||
    BUSINESS_DOCUMENT_TYPE_MAP[orderType]
  );
}

function mapReservation(item) {
  return {
    intervalId: item.id,
    orderType: item.businessDocumentType === "SalesStockOrder" ? "4" : "",
    detailId: item.businessDocumentLineId,
    startNum: item.startNumber,
    endNum: item.endNumber,
  };
}

// 查询成品出厂编号区间列表
export function listInterval(query = {}) {
  if (!isSupportedIntervalOrderType(query.orderType)) {
    return Promise.resolve({
      rows: [],
      total: 0,
    });
  }

  return request({
    url: "/api/inventory/factory-number-reservations",
    method: "get",
    params: {
      businessDocumentType: query.orderType
        ? BUSINESS_DOCUMENT_TYPE_MAP[query.orderType]
        : undefined,
      businessDocumentLineId: query.detailId,
      startNumber: query.startNum,
      endNumber: query.endNum,
      limit: query.pageSize ?? 30,
      offset: ((query.pageNum ?? 1) - 1) * (query.pageSize ?? 30),
    },
  }).then((response) => ({
    rows: (response.data?.items || []).map(mapReservation),
    total: response.data?.total || 0,
  }));
}

// 查询成品出厂编号区间详细
export function getInterval(intervalId) {
  return request({
    url: `/api/inventory/factory-number-reservations/${intervalId}`,
    method: "get",
  }).then((response) => ({
    data: mapReservation(response.data),
  }));
}

// 新增成品出厂编号区间
export function addInterval() {
  return unsupportedStockAction("当前编号区间页仅开放只读查询");
}

// 修改成品出厂编号区间
export function updateInterval() {
  return unsupportedStockAction("当前编号区间页仅开放只读查询");
}

// 删除成品出厂编号区间
export function delInterval() {
  return unsupportedStockAction("当前编号区间页仅开放只读查询");
}
