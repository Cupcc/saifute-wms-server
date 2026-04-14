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

function getYesterdayAndTodayRange() {
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  return {
    dateFrom: formatDateOnly(yesterday),
    dateTo: formatDateOnly(today),
  };
}

function calculatePercentageChange(todayValue, yesterdayValue) {
  const today = Number(todayValue || 0);
  const yesterday = Number(yesterdayValue || 0);

  if (yesterday === 0) {
    return today === 0 ? 0 : 100;
  }

  return Number((((today - yesterday) / yesterday) * 100).toFixed(1));
}

function groupTrendRowsByDate(rows = []) {
  const grouped = new Map();

  rows.forEach((row) => {
    const dateKey = row.date;
    if (!grouped.has(dateKey)) {
      grouped.set(dateKey, {
        date: dateKey,
        inboundCount: 0,
        outboundCount: 0,
        workshopMaterialCount: 0,
      });
    }

    const target = grouped.get(dateKey);
    const documentCount = Number(row.documentCount || 0);

    if (row.trendType === "INBOUND") {
      target.inboundCount += documentCount;
    } else if (row.trendType === "SALES") {
      target.outboundCount += documentCount;
    } else if (row.trendType === "WORKSHOP_MATERIAL") {
      target.workshopMaterialCount += documentCount;
    }
  });

  return [...grouped.values()].sort((left, right) =>
    left.date.localeCompare(right.date),
  );
}

function getDocumentCountByType(rows = [], date, trendType) {
  return Number(
    rows.find((row) => row.date === date && row.trendType === trendType)
      ?.documentCount || 0,
  );
}

// 获取首页统计数据
export async function getHomeStatistics() {
  const { dateFrom, dateTo } = getYesterdayAndTodayRange();
  const [homeResponse, trendResponse] = await Promise.all([
    getReportingHome(),
    getTrendSeries({ dateFrom, dateTo }),
  ]);

  const home = homeResponse.data || {};
  const trendItems = trendResponse.data?.items || [];

  const inboundToday = getDocumentCountByType(trendItems, dateTo, "INBOUND");
  const inboundYesterday = getDocumentCountByType(
    trendItems,
    dateFrom,
    "INBOUND",
  );
  const outboundToday = getDocumentCountByType(trendItems, dateTo, "SALES");
  const outboundYesterday = getDocumentCountByType(
    trendItems,
    dateFrom,
    "SALES",
  );
  const workshopMaterialToday = getDocumentCountByType(
    trendItems,
    dateTo,
    "WORKSHOP_MATERIAL",
  );
  const workshopMaterialYesterday = getDocumentCountByType(
    trendItems,
    dateFrom,
    "WORKSHOP_MATERIAL",
  );

  return {
    code: 200,
    data: {
      inbound: {
        todayCount: home.todayDocuments?.inboundCount ?? inboundToday,
        percentageChange: calculatePercentageChange(
          inboundToday,
          inboundYesterday,
        ),
      },
      outbound: {
        todayCount: home.todayDocuments?.outboundCount ?? outboundToday,
        percentageChange: calculatePercentageChange(
          outboundToday,
          outboundYesterday,
        ),
      },
      workshopMaterial: {
        todayCount:
          home.todayDocuments?.workshopMaterialCount ?? workshopMaterialToday,
        percentageChange: calculatePercentageChange(
          workshopMaterialToday,
          workshopMaterialYesterday,
        ),
      },
      inventory: {
        activeMaterialCount: home.inventory?.activeMaterialCount ?? 0,
        inventoryRecordCount: home.inventory?.inventoryRecordCount ?? 0,
        lowStockCount: home.inventory?.lowStockCount ?? 0,
        totalInventoryValue: home.inventory?.totalInventoryValue ?? "0.00",
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
    data: groupTrendRowsByDate(response.data?.items || []),
  };
}
