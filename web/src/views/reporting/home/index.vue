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
          <div class="metric-label">
            <reporting-metric-label :label="card.label" :content="card.help" />
          </div>
          <div class="metric-value">{{ card.value }}</div>
        </el-card>
      </el-col>
    </el-row>

    <el-row :gutter="16" class="section-row">
      <el-col :xs="24" :lg="12">
        <el-card shadow="never" class="detail-card">
          <template #header>
            <div class="card-title">
              <reporting-metric-label
                label="今日单据"
                content="按业务时区当天的业务日期统计当前可见库存范围内已生效的业务单据，并按真实业务类型分列。"
              />
            </div>
          </template>
          <el-descriptions :column="1" border>
            <el-descriptions-item>
              <template #label>
                <reporting-metric-label
                  label="今日验收单"
                  content="业务日期为今天且已生效的验收入库单数量。"
                />
              </template>
              {{ dashboard.todayDocuments.acceptanceCount }}
            </el-descriptions-item>
            <el-descriptions-item>
              <template #label>
                <reporting-metric-label
                  label="今日生产入库单"
                  content="业务日期为今天且已生效的生产入库单数量。"
                />
              </template>
              {{ dashboard.todayDocuments.productionReceiptCount }}
            </el-descriptions-item>
            <el-descriptions-item>
              <template #label>
                <reporting-metric-label
                  label="今日退厂单"
                  content="业务日期为今天且已生效的退厂/供应商退货单数量，不计为正向入库。"
                />
              </template>
              {{ dashboard.todayDocuments.supplierReturnCount }}
            </el-descriptions-item>
            <el-descriptions-item>
              <template #label>今日销售出库单</template>
              {{ dashboard.todayDocuments.salesOutboundCount }}
            </el-descriptions-item>
            <el-descriptions-item>
              <template #label>今日销售退货单</template>
              {{ dashboard.todayDocuments.salesReturnCount }}
            </el-descriptions-item>
            <el-descriptions-item>
              <template #label>今日车间领料单</template>
              {{ dashboard.todayDocuments.workshopPickCount }}
            </el-descriptions-item>
            <el-descriptions-item>
              <template #label>今日车间退料单</template>
              {{ dashboard.todayDocuments.workshopReturnCount }}
            </el-descriptions-item>
            <el-descriptions-item>
              <template #label>今日车间报废单</template>
              {{ dashboard.todayDocuments.workshopScrapCount }}
            </el-descriptions-item>
          </el-descriptions>
        </el-card>
      </el-col>

      <el-col :xs="24" :lg="12">
        <el-card shadow="never" class="detail-card">
          <template #header>
            <div class="card-title">
              <reporting-metric-label
                label="累计业务金额"
                content="汇总当前可见库存范围内已生效事实，并明确区分入库计价、WMS销售价和实际库存成本。"
              />
            </div>
          </template>
          <el-descriptions :column="1" border>
            <el-descriptions-item>
              <template #label>
                验收入库计价金额
              </template>
              {{ dashboard.cumulativeAmounts.inbound.acceptanceAmount }}
            </el-descriptions-item>
            <el-descriptions-item>
              <template #label>
                生产入库计价金额
              </template>
              {{ dashboard.cumulativeAmounts.inbound.productionReceiptAmount }}
            </el-descriptions-item>
            <el-descriptions-item>
              <template #label>
                退厂计价金额
              </template>
              {{ dashboard.cumulativeAmounts.inbound.supplierReturnAmount }}
            </el-descriptions-item>
            <el-descriptions-item>
              <template #label>采购净入库金额</template>
              {{ dashboard.cumulativeAmounts.inbound.procurementNetInboundAmount }}
            </el-descriptions-item>
            <el-descriptions-item>
              <template #label>销售出库额（WMS销售价）</template>
              {{ dashboard.cumulativeAmounts.sales.outboundAmount }}
            </el-descriptions-item>
            <el-descriptions-item>
              <template #label>销售退货额（WMS销售价）</template>
              {{ dashboard.cumulativeAmounts.sales.returnAmount }}
            </el-descriptions-item>
            <el-descriptions-item>
              <template #label>销售净额（WMS销售价）</template>
              {{ dashboard.cumulativeAmounts.sales.netAmount }}
            </el-descriptions-item>
            <el-descriptions-item>
              <template #label>车间领料成本</template>
              {{ dashboard.cumulativeAmounts.workshop.pickCost }}
            </el-descriptions-item>
            <el-descriptions-item>
              <template #label>车间退料冲回成本</template>
              {{ dashboard.cumulativeAmounts.workshop.returnCost }}
            </el-descriptions-item>
            <el-descriptions-item>
              <template #label>车间报废成本</template>
              {{ dashboard.cumulativeAmounts.workshop.scrapCost }}
            </el-descriptions-item>
            <el-descriptions-item>
              <template #label>车间净耗用成本</template>
              {{ dashboard.cumulativeAmounts.workshop.netConsumptionCost }}
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
              <div class="card-title">
                <reporting-metric-label
                  label="库存健康"
                  content="按物料与仓别形成的库存余额记录互斥划分为正常、低库存、超上限和未配置四种状态。"
                />
              </div>
              <span class="card-tip">按物料 × 仓别汇总</span>
            </div>
          </template>
          <div ref="inventoryHealthChartRef" class="chart-container chart-container--compact"></div>
          <div class="chart-summary">
            <div class="summary-pill">
              <reporting-metric-label
                label="正常的物料-仓别数"
                content="已配置至少一个库存阈值，且当前数量未低于下限、未超过上限的物料-仓别项数。"
              />
              <strong>{{ dashboard.inventory.normalStockCount }}</strong>
            </div>
            <div class="summary-pill warning">
              <reporting-metric-label
                label="低于下限的物料-仓别数"
                content="已配置安全库存下限，且当前库存数量低于该下限的库存余额记录数。"
              />
              <strong>{{ dashboard.inventory.lowStockCount }}</strong>
            </div>
            <div class="summary-pill above-max">
              <reporting-metric-label
                label="高于上限的物料-仓别数"
                content="已配置库存上限，且当前数量严格超过该上限的物料-仓别项数。"
              />
              <strong>{{ dashboard.inventory.aboveMaxStockCount }}</strong>
            </div>
            <div class="summary-pill unconfigured">
              <reporting-metric-label
                label="未配置阈值的物料-仓别数"
                content="库存下限和上限均未配置的物料-仓别项数，不归入正常库存。"
              />
              <strong>{{ dashboard.inventory.unconfiguredStockCount }}</strong>
            </div>
          </div>
        </el-card>
      </el-col>

      <el-col :xs="24" :lg="16">
        <el-card shadow="never" class="chart-card">
          <template #header>
            <div class="chart-title-block">
              <div class="card-title">
                <reporting-metric-label
                  label="最近 7 日业务趋势"
                  content="按最近 7 个自然日的库存流水分业务类型汇总；金额采用实际库存成本，并保留各业务类型定义的正负方向。"
                />
              </div>
              <span class="card-tip">按库存成本金额观察业务波动</span>
            </div>
          </template>
          <div ref="trendChartRef" class="chart-container"></div>
          <div class="trend-summary-row">
            <div class="summary-pill">
              <reporting-metric-label
                label="业务单据数"
                content="最近 7 日按业务单据类型和单据 ID 去重后的真实业务单据数；同一单据多条库存流水只计一张。"
              />
              <strong>{{ trendSummary.documentCount }}</strong>
            </div>
            <div class="summary-pill">
              <reporting-metric-label
                label="库存成本净变动"
                content="最近 7 日所有纳入趋势的库存流水按入为正、出为负计算的库存成本净变动，由后端精确汇总。"
              />
              <strong>{{ trendSummary.inventoryCostNetChange }}</strong>
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
              <div class="card-title">
                <reporting-metric-label
                  label="分类来源库存成本分布"
                  content="按物料分类汇总可追溯来源库存成本后取金额最高的 8 个分类，饼图百分比仅以这 8 个分类的合计为分母。"
                />
              </div>
              <span class="card-tip">Top 8 分类按来源库存成本展示</span>
            </div>
          </template>
          <div ref="categoryDistributionChartRef" class="chart-container"></div>
        </el-card>
      </el-col>

      <el-col :xs="24" :lg="12">
        <el-card shadow="never" class="chart-card">
          <template #header>
            <div class="chart-title-block">
              <div class="card-title">
                <reporting-metric-label
                  label="分类来源库存成本 Top 8"
                  content="按各物料分类的可追溯来源库存成本从高到低取前 8 名；不等同于正式财务账面余额。"
                />
              </div>
              <span class="card-tip">按来源库存成本排序</span>
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
import ReportingMetricLabel from "../components/ReportingMetricLabel.vue";
const loading = ref(false);

const dashboard = ref({
  inventory: {
    activeMaterialCount: 0,
    inventoryRecordCount: 0,
    lowStockCount: 0,
    normalStockCount: 0,
    aboveMaxStockCount: 0,
    unconfiguredStockCount: 0,
    totalInventoryValue: "0.00",
  },
  todayDocuments: {
    acceptanceCount: 0,
    productionReceiptCount: 0,
    supplierReturnCount: 0,
    salesOutboundCount: 0,
    salesReturnCount: 0,
    workshopPickCount: 0,
    workshopReturnCount: 0,
    workshopScrapCount: 0,
  },
  cumulativeAmounts: {
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
});

const trendRows = ref([]);
const trendSummary = ref({
  documentCount: 0,
  inventoryCostNetChange: "0.0000",
});
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
    label: "在库物料品种数",
    help: "当前可见库存范围内库存数量大于 0 的有效物料去重数；同一物料存在多个库存记录时只计 1 个。",
    value: dashboard.value.inventory.activeMaterialCount,
  },
  {
    label: "未配置阈值的物料-仓别数",
    help: "库存下限和上限均未配置的物料-仓别项数；它们不再被误计为正常库存。",
    value: dashboard.value.inventory.unconfiguredStockCount,
  },
  {
    label: "低库存项",
    help: "已配置安全库存下限，且当前库存数量低于该下限的库存余额记录数。",
    value: dashboard.value.inventory.lowStockCount,
  },
  {
    label: "可追溯来源库存成本",
    help: "按当前尚未耗用的入库来源数量乘以对应单位成本后汇总，不是销售价或正式财务账面余额。",
    value: dashboard.value.inventory.totalInventoryValue,
  },
]);

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
    INBOUND: "入库域净成本流量",
    SALES: "销售出库成本",
    WORKSHOP_MATERIAL: "车间净耗用成本",
    RD_PROJECT: "研发项目净耗用成本",
    RD_HANDOFF: "RD交接",
    RD_STOCKTAKE_GAIN: "RD盘盈",
    RD_STOCKTAKE_LOSS: "RD盘亏",
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

  const total = Number(dashboard.value.inventory.inventoryRecordCount || 0);
  const lowStockCount = Number(dashboard.value.inventory.lowStockCount || 0);
  const normalCount = Number(dashboard.value.inventory.normalStockCount || 0);
  const aboveMaxStockCount = Number(
    dashboard.value.inventory.aboveMaxStockCount || 0,
  );
  const unconfiguredStockCount = Number(
    dashboard.value.inventory.unconfiguredStockCount || 0,
  );
  const hasData = total > 0;

  inventoryHealthChart.setOption(
    {
      color: ["#3c8f58", "#d66a5f", "#7c3aed", "#9ca3af"],
      title: {
        text: `${total}`,
        subtext: "物料-仓别项",
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
                { value: aboveMaxStockCount, name: "超上限项" },
                { value: unconfiguredStockCount, name: "未配置项" },
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
    "RD_HANDOFF",
    "RD_STOCKTAKE_GAIN",
    "RD_STOCKTAKE_LOSS",
  ];
  const colorMap = {
    INBOUND: "#2f6fed",
    SALES: "#f97316",
    WORKSHOP_MATERIAL: "#14b8a6",
    RD_PROJECT: "#8b5cf6",
    RD_HANDOFF: "#ef4444",
    RD_STOCKTAKE_GAIN: "#16a34a",
    RD_STOCKTAKE_LOSS: "#dc2626",
  };
  const rowsByDate = new Map();

  trendRows.value.forEach((item) => {
    const current = rowsByDate.get(item.date) ?? {};
    current[item.trendType] = Number(item.totalAmount || 0);
    rowsByDate.set(item.date, current);
  });

  const dates = [...rowsByDate.keys()].sort();
  const activeTrendTypes = trendTypes.filter((trendType) =>
    dates.some((date) => Number(rowsByDate.get(date)?.[trendType] || 0) !== 0),
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
        name: "库存成本金额",
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
        subtext: "按来源库存成本",
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
          name: "可追溯来源库存成本",
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
          return `${item.name}<br/>可追溯来源库存成本：${formatNumber(item.value)} 元`;
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
    trendSummary.value = trendResponse.data?.summary || {
      documentCount: 0,
      inventoryCostNetChange: "0.0000",
    };
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

    &.above-max {
      background: #f5f3ff;

      strong {
        color: #7c3aed;
      }
    }

    &.unconfigured {
      background: #f3f4f6;

      strong {
        color: #6b7280;
      }
    }
  }
}
</style>
