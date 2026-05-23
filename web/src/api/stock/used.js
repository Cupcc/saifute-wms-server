import request from "@/utils/request";

function buildPageQuery(query = {}) {
  const pageNum = Number(query.pageNum) > 0 ? Number(query.pageNum) : 1;
  const pageSize = Number(query.pageSize) > 0 ? Number(query.pageSize) : 30;
  return {
    limit: pageSize,
    offset: (pageNum - 1) * pageSize,
  };
}

async function listInventorySourceUsages(query = {}) {
  const { limit, offset } = buildPageQuery(query);
  const response = await request({
    url: "/api/inventory/source-usages",
    method: "get",
    params: {
      materialId: query.materialId,
      limit,
      offset,
    },
  });

  const items = Array.isArray(response.data?.items) ? response.data.items : [];
  const rows = items.map((item) => {
    const material = item.material ?? {};
    return {
      usedId: item.id,
      materialId: item.materialId,
      materialCode: material.materialCode,
      materialName: material.materialName,
      specification: material.specModel ?? "",
      sourceLogId: item.sourceLogId,
      useQty: Number(item.allocatedQty ?? 0),
      allocatedQty: Number(item.allocatedQty ?? 0),
      releasedQty: Number(item.releasedQty ?? 0),
      unitPrice: 0,
      consumerDocumentType: item.consumerDocumentType,
      consumerDocumentId: item.consumerDocumentId,
      consumerLineId: item.consumerLineId,
      status: item.status,
    };
  });

  return {
    rows,
    total: Number(response.data?.total || 0),
    data: rows,
  };
}

function unsupportedStockAction(message) {
  return Promise.reject(new Error(message));
}

// 查询库存使用情况列表
export function listUsed(query) {
  return listInventorySourceUsages(query);
}

// 查询库存使用情况详细信息
export async function getUsed(usedId) {
  const response = await listInventorySourceUsages({
    pageNum: 1,
    pageSize: 100,
  });
  return {
    data: response.rows.find((item) => item.usedId === usedId) ?? null,
  };
}

// 新增库存使用情况
export function addUsed() {
  return unsupportedStockAction("当前 NestJS 后端未提供库存使用情况新增接口");
}

// 修改库存使用情况
export function updateUsed() {
  return unsupportedStockAction("当前 NestJS 后端未提供库存使用情况修改接口");
}

// 删除库存使用情况
export function delUsed() {
  return unsupportedStockAction("当前 NestJS 后端未提供库存使用情况删除接口");
}

// 根据物料ID和数量查询库存使用情况
export async function getUsedByMaterialIdAndQuantity(materialId, quantity) {
  const response = await listInventorySourceUsages({
    materialId,
    pageNum: 1,
    pageSize: 100,
  });
  const targetQty = Number(quantity || 0);
  const selected = [];
  let accumulated = 0;

  for (const item of response.rows) {
    if (accumulated >= targetQty) {
      break;
    }

    const remaining = targetQty - accumulated;
    const useQty = Math.min(Number(item.allocatedQty || 0), remaining);
    if (useQty <= 0) {
      continue;
    }

    selected.push({
      ...item,
      useQty,
    });
    accumulated += useQty;
  }

  return {
    data: selected,
  };
}
