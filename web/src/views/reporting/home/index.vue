<template>
  <div class="app-container reporting-home">
    <div class="page-header">
      <div>
        <h2>报表首页</h2>
        <p>库存汇总、分类分布、趋势分析已合并为首页图表概览。</p>
      </div>
      <el-button :loading="loading" type="primary" @click="loadDashboardData">
        刷新数据
      </el-button>
    </div>

    <el-row :gutter="16" class="section-row">
      <el-col v-for="card in metricCards" :key="card.label" :xs="24" :sm="12" :lg="6">
        <el-card shadow="hover" class="metric-card">
          <div class="metric-label">{{ card.label }}</div>
          <div class="metric-value">{{ card.value }}</div>
        </el-card>
      </el-col>
    </el-row>

    <el-row :gutter="16" class="section-row">
      <el-col :xs="24" :lg="12">
        <el-card shadow="never" class="detail-card">
          <template #header>
            <div class="card-title">今日单据</div>
          </template>
          <el-descriptions :column="1" border>
            <el-descriptions-item label="入库单据">
              {{ dashboard.todayDocuments.inboundCount }}
            </el-descriptions-item>
            <el-descriptions-item label="出库单据">
              {{ dashboard.todayDocuments.outboundCount }}
            </el-descriptions-item>
            <el-descriptions-item label="领退料单据">
              {{ dashboard.todayDocuments.workshopMaterialCount }}
            </el-descriptions-item>
          </el-descriptions>
        </el-card>
      </el-col>

      <el-col :xs="24" :lg="12">
        <el-card shadow="never" class="detail-card">
          <template #header>
            <div class="card-title">累计金额</div>
          </template>
          <el-descriptions :column="1" border>
            <el-descriptions-item label="累计入库金额">
              {{ dashboard.cumulativeDocuments.inbound.totalAmount }}
            </el-descriptions-item>
            <el-descriptions-item label="累计出库金额">
              {{ dashboard.cumulativeDocuments.outbound.totalAmount }}
            </el-descriptions-item>
            <el-descriptions-item label="累计领退料金额">
              {{ dashboard.cumulativeDocuments.workshopMaterial.totalAmount }}
            </el-descriptions-item>
          </el-descriptions>
        </el-card>
      </el-col>
    </el-row>

    <el-row :gutter="16" class="section-row">
      <el-col :xs="24" :lg="8">
        <el-card shadow="never" class="chart-card">
          <template #header>
            <div class="chart-title-block">
              <div class="card-title">库存健康</div>
              <span class="card-tip">按在库物料与低库存项汇总</span>
            </div>
          </template>
          <div ref="inventoryHealthChartRef" class="chart-container chart-container--compact"></div>
          <div class="chart-summary">
            <div class="summary-pill">
              <span>正常库存项</span>
              <strong>{{ healthyMaterialCount }}</strong>
            </div>
            <div class="summary-pill warning">
              <span>低库存项</span>
              <strong>{{ dashboard.inventory.lowStockCount }}</strong>
            </div>
          </div>
        </el-card>
      </el-col>

      <el-col :xs="24" :lg="16">
        <el-card shadow="never" class="chart-card">
          <template #header>
            <div class="chart-title-block">
              <div class="card-title">最近 7 日业务趋势</div>
              <span class="card-tip">按总金额观察各业务类型波动</span>
            </div>
          </template>
          <div ref="trendChartRef" class="chart-container"></div>
          <div class="trend-summary-row">
            <div class="summary-pill">
              <span>单据数</span>
              <strong>{{ trendSummary.documentCount }}</strong>
            </div>
            <div class="summary-pill">
              <span>总数量</span>
              <strong>{{ trendSummary.totalQty }}</strong>
            </div>
            <div class="summary-pill">
              <span>总金额</span>
              <strong>{{ trendSummary.totalAmount }}</strong>
            </div>
          </div>
        </el-card>
      </el-col>
    </el-row>

    <el-row :gutter="16" class="section-row">
      <el-col :xs="24" :lg="12">
        <el-card shadow="never" class="chart-card">
          <template #header>
            <div class="chart-title-block">
              <div class="card-title">库存分类货值分布</div>
              <span class="card-tip">Top 8 分类按库存货值展示</span>
            </div>
          </template>
          <div ref="categoryDistributionChartRef" class="chart-container"></div>
        </el-card>
      </el-col>

      <el-col :xs="24" :lg="12">
        <el-card shadow="never" class="chart-card">
          <template #header>
            <div class="chart-title-block">
              <div class="card-title">库存分类 Top 8</div>
              <span class="card-tip">按库存货值排序</span>
            </div>
          </template>
          <div ref="categoryTopChartRef" class="chart-container"></div>
        </el-card>
      </el-col>
    </el-row>
  </div>
</template>

<script setup name="ReportingHome">
import * as echarts from "echarts";
import {
  computed,
  nextTick,
  onActivated,
  onBeforeUnmount,
  onMounted,
  ref,
} from "vue";
import {
  getMaterialCategorySummary,
  getReportingHome,
  getTrendSeries,
} from "@/api/reporting";
const loading = ref(false);

const dashboard = ref({
  inventory: {
    activeMaterialCount: 0,
    inventoryRecordCount: 0,
    lowStockCount: 0,
    totalInventoryValue: "0.00",
  },
  todayDocuments: {
    inboundCount: 0,
    outboundCount: 0,
    workshopMaterialCount: 0,
  },
  cumulativeDocuments: {
    inbound: { totalAmount: "0.00" },
    outbound: { totalAmount: "0.00" },
    workshopMaterial: { totalAmount: "0.00" },
  },
});

const trendRows = ref([]);
const categoryRows = ref([]);

const inventoryHealthChartRef = ref(null);
const trendChartRef = ref(null);
const categoryDistributionChartRef = ref(null);
const categoryTopChartRef = ref(null);

let inventoryHealthChart = null;
let trendChart = null;
let categoryDistributionChart = null;
let categoryTopChart = null;

const metricCards = computed(() => [
  {
    label: "在库物料数",
    value: dashboard.value.inventory.activeMaterialCount,
  },
  {
    label: "库存记录数",
    value: dashboard.value.inventory.inventoryRecordCount,
  },
  {
    label: "低库存项",
    value: dashboard.value.inventory.lowStockCount,
  },
  {
    label: "库存货值",
    value: dashboard.value.inventory.totalInventoryValue,
  },
]);

const healthyMaterialCount = computed(() =>
  Math.max(
    Number(dashboard.value.inventory.activeMaterialCount || 0) -
      Number(dashboard.value.inventory.lowStockCount || 0),
    0,
  ),
);

const trendSummary = computed(() => {
  let documentCount = 0;
  let totalQty = 0;
  let totalAmount = 0;

  trendRows.value.forEach((item) => {
    documentCount += Number(item.documentCount || 0);
    totalQty += Number(item.totalQty || 0);
    totalAmount += Number(item.totalAmount || 0);
  });

  return {
    documentCount,
    totalQty: totalQty.toFixed(6),
    totalAmount: totalAmount.toFixed(4),
  };
});

const categoryChartRows = computed(() =>
  (categoryRows.value || []).map((item) => ({
    ...item,
    categoryLabel: item.categoryName || "未分类",
    totalInventoryValueNumber: Number(item.totalInventoryValue || 0),
  })),
);

function formatLocalDate(date) {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getRecentDateRange() {
  const end = new Date();
  const start = new Date();
  start.setDate(end.getDate() - 6);
  return {
    dateFrom: formatLocalDate(start),
    dateTo: formatLocalDate(end),
  };
}

function formatShortDate(value) {
  if (!value) {
    return "";
  }
  const [, month = "", day = ""] = value.split("-");
  return `${month}-${day}`;
}

function formatTrendType(value) {
  const labelMap = {
    INBOUND: "入库",
    SALES: "销售出库",
    WORKSHOP_MATERIAL: "领退料",
    RD_PROJECT: "研发项目",
    RD: "研发协同",
  };
  return labelMap[value] || value;
}

function formatNumber(value, digits = 2) {
  return Number(value || 0).toLocaleString("zh-CN", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

function ensureCharts() {
  if (inventoryHealthChartRef.value && !inventoryHealthChart) {
    inventoryHealthChart = echarts.init(inventoryHealthChartRef.value);
  }
  if (trendChartRef.value && !trendChart) {
    trendChart = echarts.init(trendChartRef.value);
  }
  if (categoryDistributionChartRef.value && !categoryDistributionChart) {
    categoryDistributionChart = echarts.init(categoryDistributionChartRef.value);
  }
  if (categoryTopChartRef.value && !categoryTopChart) {
    categoryTopChart = echarts.init(categoryTopChartRef.value);
  }
}

function renderInventoryHealthChart() {
  if (!inventoryHealthChart) {
    return;
  }

  const total = Number(dashboard.value.inventory.activeMaterialCount || 0);
  const lowStockCount = Number(dashboard.value.inventory.lowStockCount || 0);
  const normalCount = healthyMaterialCount.value;
  const hasData = total > 0;

  inventoryHealthChart.setOption(
    {
      color: ["#3c8f58", "#d66a5f"],
      title: {
        text: `${total}`,
        subtext: "在库物料",
        left: "center",
        top: "38%",
        textStyle: {
          color: "#1f2937",
          fontSize: 28,
          fontWeight: 700,
        },
        subtextStyle: {
          color: "#6b7280",
          fontSize: 12,
        },
      },
      tooltip: {
        trigger: "item",
        formatter: ({ name, value, percent }) =>
          `${name}<br/>${value} 项${hasData ? ` (${percent}%)` : ""}`,
      },
      legend: {
        bottom: 0,
        icon: "circle",
      },
      series: [
        {
          name: "库存健康",
          type: "pie",
          radius: ["58%", "78%"],
          center: ["50%", "42%"],
          label: {
            formatter: "{b}\n{d}%",
            color: "#4b5563",
            fontSize: 12,
          },
          labelLine: {
            length: 12,
            length2: 10,
          },
          data: hasData
            ? [
                { value: normalCount, name: "正常库存项" },
                { value: lowStockCount, name: "低库存项" },
              ]
            : [
                {
                  value: 1,
                  name: "暂无数据",
                  itemStyle: { color: "#d1d5db" },
                },
              ],
        },
      ],
    },
    true,
  );
}

function renderTrendChart() {
  if (!trendChart) {
    return;
  }

  const trendTypes = [
    "INBOUND",
    "SALES",
    "WORKSHOP_MATERIAL",
    "RD_PROJECT",
    "RD",
  ];
  const colorMap = {
    INBOUND: "#2f6fed",
    SALES: "#f97316",
    WORKSHOP_MATERIAL: "#14b8a6",
    RD_PROJECT: "#8b5cf6",
    RD: "#ef4444",
  };
  const rowsByDate = new Map();

  trendRows.value.forEach((item) => {
    const current = rowsByDate.get(item.date) ?? {};
    current[item.trendType] = Number(item.totalAmount || 0);
    rowsByDate.set(item.date, current);
  });

  const dates = [...rowsByDate.keys()].sort();
  const activeTrendTypes = trendTypes.filter((trendType) =>
    dates.some((date) => Number(rowsByDate.get(date)?.[trendType] || 0) > 0),
  );

  trendChart.setOption(
    {
      color: activeTrendTypes.map((trendType) => colorMap[trendType]),
      tooltip: {
        trigger: "axis",
        valueFormatter: (value) => `${formatNumber(value)} 元`,
      },
      legend: {
        top: 0,
        itemWidth: 10,
        itemHeight: 10,
        data: activeTrendTypes.map((trendType) => formatTrendType(trendType)),
      },
      grid: {
        left: 56,
        right: 24,
        top: 48,
        bottom: 30,
      },
      xAxis: {
        type: "category",
        boundaryGap: false,
        data: dates.map(formatShortDate),
        axisLine: {
          lineStyle: { color: "#d1d5db" },
        },
      },
      yAxis: {
        type: "value",
        name: "金额",
        axisLabel: {
          formatter: (value) => formatNumber(value, 0),
        },
        splitLine: {
          lineStyle: { color: "#e5e7eb" },
        },
      },
      graphic: dates.length
        ? []
        : [
            {
              type: "text",
              left: "center",
              top: "middle",
              style: {
                text: "暂无趋势数据",
                fill: "#9ca3af",
                fontSize: 14,
              },
            },
          ],
      series: activeTrendTypes.map((trendType) => ({
        name: formatTrendType(trendType),
        type: "line",
        smooth: true,
        showSymbol: false,
        lineStyle: {
          width: 3,
        },
        areaStyle: {
          opacity: 0.08,
        },
        data: dates.map((date) => Number(rowsByDate.get(date)?.[trendType] || 0)),
      })),
    },
    true,
  );
}

function renderCategoryDistributionChart() {
  if (!categoryDistributionChart) {
    return;
  }

  const rows = categoryChartRows.value;
  const hasData = rows.length > 0;

  categoryDistributionChart.setOption(
    {
      color: [
        "#2563eb",
        "#0f766e",
        "#f59e0b",
        "#dc2626",
        "#7c3aed",
        "#059669",
        "#db2777",
        "#4b5563",
      ],
      title: {
        text: "Top 8",
        subtext: "按库存货值",
        left: "center",
        top: "40%",
        textStyle: {
          color: "#1f2937",
          fontSize: 24,
          fontWeight: 700,
        },
        subtextStyle: {
          color: "#6b7280",
          fontSize: 12,
        },
      },
      tooltip: {
        trigger: "item",
        formatter: ({ name, value, percent }) =>
          `${name}<br/>${formatNumber(value)} 元${hasData ? ` (${percent}%)` : ""}`,
      },
      legend: {
        bottom: 0,
        type: "scroll",
      },
      series: [
        {
          name: "库存货值",
          type: "pie",
          radius: ["50%", "74%"],
          center: ["50%", "42%"],
          itemStyle: {
            borderColor: "#fff",
            borderWidth: 3,
            borderRadius: 8,
          },
          label: {
            formatter: "{b}\n{d}%",
            color: "#4b5563",
          },
          data: hasData
            ? rows.map((item) => ({
                value: item.totalInventoryValueNumber,
                name: item.categoryLabel,
              }))
            : [
                {
                  value: 1,
                  name: "暂无数据",
                  itemStyle: { color: "#d1d5db" },
                },
              ],
        },
      ],
    },
    true,
  );
}

function renderCategoryTopChart() {
  if (!categoryTopChart) {
    return;
  }

  const rows = [...categoryChartRows.value]
    .sort(
      (left, right) =>
        left.totalInventoryValueNumber - right.totalInventoryValueNumber,
    )
    .slice(-8);

  categoryTopChart.setOption(
    {
      tooltip: {
        trigger: "axis",
        axisPointer: {
          type: "shadow",
        },
        formatter: (params) => {
          const item = params[0];
          if (!item) {
            return "";
          }
          return `${item.name}<br/>库存货值：${formatNumber(item.value)} 元`;
        },
      },
      grid: {
        left: 112,
        right: 32,
        top: 20,
        bottom: 12,
      },
      xAxis: {
        type: "value",
        axisLabel: {
          formatter: (value) => formatNumber(value, 0),
        },
        splitLine: {
          lineStyle: { color: "#e5e7eb" },
        },
      },
      yAxis: {
        type: "category",
        data: rows.map((item) => item.categoryLabel),
        axisTick: { show: false },
        axisLine: { show: false },
      },
      graphic: rows.length
        ? []
        : [
            {
              type: "text",
              left: "center",
              top: "middle",
              style: {
                text: "暂无分类数据",
                fill: "#9ca3af",
                fontSize: 14,
              },
            },
          ],
      series: [
        {
          type: "bar",
          data: rows.map((item) => item.totalInventoryValueNumber),
          barWidth: 18,
          label: {
            show: true,
            position: "right",
            formatter: ({ value }) => formatNumber(value),
            color: "#374151",
          },
          itemStyle: {
            borderRadius: [0, 8, 8, 0],
            color: new echarts.graphic.LinearGradient(1, 0, 0, 0, [
              { offset: 0, color: "#1d4ed8" },
              { offset: 1, color: "#60a5fa" },
            ]),
          },
        },
      ],
    },
    true,
  );
}

function renderCharts() {
  ensureCharts();
  renderInventoryHealthChart();
  renderTrendChart();
  renderCategoryDistributionChart();
  renderCategoryTopChart();
}

function resizeCharts() {
  inventoryHealthChart?.resize();
  trendChart?.resize();
  categoryDistributionChart?.resize();
  categoryTopChart?.resize();
}

function disposeCharts() {
  inventoryHealthChart?.dispose();
  trendChart?.dispose();
  categoryDistributionChart?.dispose();
  categoryTopChart?.dispose();

  inventoryHealthChart = null;
  trendChart = null;
  categoryDistributionChart = null;
  categoryTopChart = null;
}

async function loadDashboardData() {
  loading.value = true;
  try {
    const { dateFrom, dateTo } = getRecentDateRange();
    const [homeResponse, trendResponse, categoryResponse] = await Promise.all([
      getReportingHome(),
      getTrendSeries({ dateFrom, dateTo }),
      getMaterialCategorySummary({ limit: 8, offset: 0 }),
    ]);

    dashboard.value = homeResponse.data || dashboard.value;
    trendRows.value = trendResponse.data?.items || [];
    categoryRows.value = categoryResponse.data?.items || [];

    await nextTick();
    renderCharts();
  } finally {
    loading.value = false;
  }
}

onMounted(() => {
  window.addEventListener("resize", resizeCharts);
  loadDashboardData();
});

onActivated(() => {
  nextTick(() => {
    resizeCharts();
  });
});

onBeforeUnmount(() => {
  window.removeEventListener("resize", resizeCharts);
  disposeCharts();
});
</script>

<style scoped lang="scss">
.reporting-home {
  .page-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    margin-bottom: 16px;

    h2 {
      margin: 0 0 4px;
      font-size: 24px;
      font-weight: 600;
    }

    p {
      margin: 0;
      color: #606266;
    }
  }

  .section-row {
    margin-bottom: 16px;
  }

  .metric-card,
  .detail-card,
  .chart-card {
    height: 100%;
  }

  .metric-card {
    .metric-label {
      color: #909399;
      font-size: 14px;
      margin-bottom: 8px;
    }

    .metric-value {
      color: #303133;
      font-size: 28px;
      font-weight: 600;
      line-height: 1.2;
      word-break: break-word;
    }
  }

  .card-title {
    font-weight: 600;
    color: #303133;
  }

  .card-tip {
    color: #909399;
    font-size: 12px;
  }

  .chart-title-block {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 12px;
  }

  .chart-container {
    height: 320px;
  }

  .chart-container--compact {
    height: 260px;
  }

  .chart-summary,
  .trend-summary-row {
    display: flex;
    flex-wrap: wrap;
    gap: 12px;
    margin-top: 12px;
  }

  .summary-pill {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    min-width: 160px;
    padding: 10px 14px;
    border-radius: 10px;
    background: #f3f6fb;
    color: #4b5563;

    strong {
      color: #111827;
      font-size: 18px;
      font-weight: 600;
    }

    &.warning {
      background: #fff4ef;

      strong {
        color: #b45309;
      }
    }
  }
}
</style>
