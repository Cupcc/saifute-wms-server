import {
  getMaterialCategorySummary,
  getReportingHome,
  getTrendSeries,
} from "@/api/reporting";

function formatDateOnly(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getRecentDateRange(days = 7) {
  const end = new Date();
  const start = new Date();
  start.setDate(end.getDate() - (days - 1));
  return {
    dateFrom: formatDateOnly(start),
    dateTo: formatDateOnly(end),
  };
}

// 获取首页统计数据
export async function getHomeStatistics() {
  const homeResponse = await getReportingHome();
  const home = homeResponse.data || {};

  return {
    code: 200,
    data: {
      generatedAt: home.generatedAt,
      todayDocuments: {
        acceptanceCount: home.todayDocuments?.acceptanceCount ?? 0,
        productionReceiptCount:
          home.todayDocuments?.productionReceiptCount ?? 0,
        supplierReturnCount: home.todayDocuments?.supplierReturnCount ?? 0,
        salesOutboundCount: home.todayDocuments?.salesOutboundCount ?? 0,
        salesReturnCount: home.todayDocuments?.salesReturnCount ?? 0,
        workshopPickCount: home.todayDocuments?.workshopPickCount ?? 0,
        workshopReturnCount: home.todayDocuments?.workshopReturnCount ?? 0,
        workshopScrapCount: home.todayDocuments?.workshopScrapCount ?? 0,
      },
      inventory: {
        activeMaterialCount: home.inventory?.activeMaterialCount ?? 0,
        inventoryRecordCount: home.inventory?.inventoryRecordCount ?? 0,
        lowStockCount: home.inventory?.lowStockCount ?? 0,
        normalStockCount: home.inventory?.normalStockCount ?? 0,
        aboveMaxStockCount: home.inventory?.aboveMaxStockCount ?? 0,
        unconfiguredStockCount: home.inventory?.unconfiguredStockCount ?? 0,
        totalInventoryValue: home.inventory?.totalInventoryValue ?? "0.0000",
      },
      cumulativeAmounts: home.cumulativeAmounts ?? {
        inbound: {
          acceptanceAmount: "0.0000",
          productionReceiptAmount: "0.0000",
          supplierReturnAmount: "0.0000",
          procurementNetInboundAmount: "0.0000",
        },
        sales: {
          outboundAmount: "0.0000",
          returnAmount: "0.0000",
          netAmount: "0.0000",
        },
        workshop: {
          pickCost: "0.0000",
          returnCost: "0.0000",
          scrapCost: "0.0000",
          netConsumptionCost: "0.0000",
        },
      },
    },
  };
}

// 获取库存分类统计数据
export async function getInventoryCategoryStatistics() {
  const response = await getMaterialCategorySummary({ limit: 8, offset: 0 });

  return {
    code: 200,
    data: (response.data?.items || []).map((item) => ({
      ...item,
      totalValue: Number(item.totalInventoryValue || 0),
    })),
  };
}

// 获取单据日期统计数据
export async function getDocumentDateStatistics() {
  const { dateFrom, dateTo } = getRecentDateRange();
  const response = await getTrendSeries({ dateFrom, dateTo });

  return {
    code: 200,
    data: {
      items: response.data?.items || [],
      summary: response.data?.summary || {
        documentCount: 0,
        inventoryCostNetChange: "0.0000",
      },
    },
  };
}
