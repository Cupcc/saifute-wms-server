<template>
  <div class="app-container">
    <!-- 内容区域 -->
    <div class="dashboard-container">
      <!-- 欢迎信息 -->
      <el-row :gutter="20" class="mb-4">
        <el-col :span="16">
          <div class="welcome-section">
            <span class="welcome-title">欢迎回来，{{ userStore.nickName }}</span>
            <p class="welcome-subtitle">
              今天是 <span class="current-date">{{ currentDate }}</span
              >，祝您工作愉快！
            </p>
          </div>
        </el-col>
        <el-col :span="8" class="text-right welcome-buttons">
        </el-col>
      </el-row>

      <!-- 统计卡片 -->
      <el-row :gutter="20" class="mb-4">
        <el-col :xs="24" :sm="12" :lg="6" class="mb-4">
          <el-card class="stat-card stat-card-primary" shadow="always">
            <div class="stat-content">
              <div class="stat-info">
                <p class="stat-label">今日入库域单据</p>
                <p class="stat-value stat-value--compact">
                  {{ statisticsData.todayDocuments.acceptanceCount }} /
                  {{ statisticsData.todayDocuments.productionReceiptCount }} /
                  {{ statisticsData.todayDocuments.supplierReturnCount }}
                </p>
                <p class="stat-breakdown">验收 / 生产入库 / 退厂</p>
              </div>
              <div class="stat-icon bg-primary-light">
                <el-icon :size="24" color="#409EFF"><Box /></el-icon>
              </div>
            </div>
          </el-card>
        </el-col>

        <el-col :xs="24" :sm="12" :lg="6" class="mb-4">
          <el-card class="stat-card stat-card-success" shadow="always">
            <div class="stat-content">
              <div class="stat-info">
                <p class="stat-label">今日销售单据</p>
                <p class="stat-value stat-value--compact">
                  {{ statisticsData.todayDocuments.salesOutboundCount }} /
                  {{ statisticsData.todayDocuments.salesReturnCount }}
                </p>
                <p class="stat-breakdown">销售出库 / 销售退货</p>
              </div>
              <div class="stat-icon bg-success-light">
                <el-icon :size="24" color="#67C23A"><HomeFilled /></el-icon>
              </div>
            </div>
          </el-card>
        </el-col>

        <el-col :xs="24" :sm="12" :lg="6" class="mb-4">
          <el-card class="stat-card stat-card-warning" shadow="always">
            <div class="stat-content">
              <div class="stat-info">
                <p class="stat-label">今日车间用料单据</p>
                <p class="stat-value stat-value--compact">
                  {{ statisticsData.todayDocuments.workshopPickCount }} /
                  {{ statisticsData.todayDocuments.workshopReturnCount }} /
                  {{ statisticsData.todayDocuments.workshopScrapCount }}
                </p>
                <p class="stat-breakdown">领料 / 退料 / 报废</p>
              </div>
              <div class="stat-icon bg-warning-light">
                <el-icon :size="24" color="#E6A23C"><Promotion /></el-icon>
              </div>
            </div>
          </el-card>
        </el-col>
        <el-col :xs="24" :sm="12" :lg="6" class="mb-4">
          <el-card class="stat-card stat-card-error" shadow="always">
            <div class="stat-content">
              <div class="stat-info">
                <p class="stat-label">在库物料品种数</p>
                <p class="stat-value">
                  {{ statisticsData.inventory.activeMaterialCount }}
                </p>
                <p class="stat-breakdown">
                  物料-仓别：正常
                  {{ statisticsData.inventory.normalStockCount }} · 低库存
                  {{ statisticsData.inventory.lowStockCount }} · 超上限
                  {{ statisticsData.inventory.aboveMaxStockCount }} · 未配置
                  {{ statisticsData.inventory.unconfiguredStockCount }}
                </p>
              </div>
              <div class="stat-icon bg-error-light">
                <el-icon :size="24" color="#F56C6C"><Finished /></el-icon>
              </div>
            </div>
          </el-card>
        </el-col>
      </el-row>

      <!-- 图表区域 -->
      <el-row :gutter="20" class="mb-4">
        <el-col :xs="24" :lg="12" class="mb-4">
          <el-card class="chart-card">
            <template #header>
              <div class="chart-header">
                <span class="chart-title">最近 7 日库存成本趋势</span>
                <span class="chart-summary">
                  业务单据 {{ trendSummary.documentCount }} 张 · 库存成本净变动
                  {{ trendSummary.inventoryCostNetChange }}
                </span>
              </div>
            </template>
            <div ref="trendChartRef" class="chart-container"></div>
          </el-card>
        </el-col>

        <el-col :xs="24" :lg="12" class="mb-4">
          <el-card class="chart-card">
            <template #header>
              <div class="chart-header">
                <span class="chart-title">可追溯来源库存成本 Top 8</span>
                <span class="chart-summary">占比仅以当前 Top 8 为分母</span>
              </div>
            </template>
            <div ref="distributionChartRef" class="chart-container"></div>
          </el-card>
        </el-col>
      </el-row>


    </div>
  </div>
</template>

<script setup name="LegacyHomeDashboard">
import * as echarts from "echarts";
import {
  nextTick,
  onActivated,
  onBeforeUnmount,
  onDeactivated,
  onMounted,
  ref,
} from "vue";
import {
  getDocumentDateStatistics,
  getHomeStatistics,
  getInventoryCategoryStatistics,
} from "@/api/system/home";
import useUserStore from "@/store/modules/user";

// biome-ignore lint/correctness/noUnusedVariables: 模板欢迎语绑定 userStore.nickName
const userStore = useUserStore();

// 当前日期
const currentDate = ref("");

// 设置当前日期
function setCurrentDate() {
  const now = new Date();
  const options = {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "long",
  };
  currentDate.value = now.toLocaleDateString("zh-CN", options);
}

// 统计数据
const statisticsData = ref({
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
  inventory: {
    activeMaterialCount: 0,
    inventoryRecordCount: 0,
    lowStockCount: 0,
    normalStockCount: 0,
    aboveMaxStockCount: 0,
    unconfiguredStockCount: 0,
    totalInventoryValue: "0.0000",
  },
});
const trendSummary = ref({
  documentCount: 0,
  inventoryCostNetChange: "0.0000",
});

let trendChart = null;
let distributionChart = null;
let intervalId = null;
const trendChartRef = ref(null);
const distributionChartRef = ref(null);
const isDashboardActive = ref(false);
let activationSequence = 0;

// 初始化图表
function initCharts() {
  if (trendChartRef.value) {
    trendChart = echarts.init(trendChartRef.value);
    const trendOption = {
      tooltip: {
        trigger: "axis",
      },
      legend: {
        bottom: 0,
      },
      grid: {
        left: "3%",
        right: "4%",
        bottom: "15%",
        top: "10%",
        containLabel: true,
      },
      xAxis: {
        type: "category",
        data: [],
      },
      yAxis: {
        type: "value",
        name: "库存成本金额",
      },
      series: [],
    };
    trendChart.setOption(trendOption);
  }

  if (distributionChartRef.value) {
    distributionChart = echarts.init(distributionChartRef.value);
    // 初始使用空数据，稍后会被真实数据替换
    const distributionOption = {
      tooltip: {
        trigger: "item",
        formatter: "{a} <br/>{b}: {c} ({d}%)",
      },
      legend: {
        orient: "vertical",
        left: "left",
        bottom: 0,
        top: "center",
      },
      series: [
        {
          name: "可追溯来源库存成本",
          type: "pie",
          radius: ["40%", "70%"],
          center: ["65%", "50%"],
          avoidLabelOverlap: false,
          itemStyle: {
            borderRadius: 10,
            borderColor: "#fff",
            borderWidth: 2,
          },
          label: {
            show: false,
            position: "center",
          },
          emphasis: {
            label: {
              show: true,
              fontSize: "18",
              fontWeight: "bold",
            },
          },
          labelLine: {
            show: false,
          },
          data: [],
        },
      ],
    };
    distributionChart.setOption(distributionOption);
  }

  // 响应式处理
  window.addEventListener("resize", handleResize);
}

function disposeCharts() {
  if (trendChart) {
    trendChart.dispose();
    trendChart = null;
  }
  if (distributionChart) {
    distributionChart.dispose();
    distributionChart = null;
  }
}

// 处理窗口大小变化
function handleResize() {
  if (trendChart) {
    trendChart.resize();
  }
  if (distributionChart) {
    distributionChart.resize();
  }
}

// 更新库存分类分布图表
function updateDistributionChart(categoryData) {
  if (!distributionChart || !categoryData) return;

  // 准备图表数据
  const chartData = categoryData.map((item) => ({
    value: item.totalValue,
    name: item.categoryName,
  }));

  // 定义颜色列表
  const colors = [
    "#409EFF",
    "#67C23A",
    "#E6A23C",
    "#F56C6C",
    "#909399",
    "#722ED1",
  ];

  // 为每个数据项分配颜色
  chartData.forEach((item, index) => {
    item.itemStyle = {
      color: colors[index % colors.length],
    };
  });

  // 更新图表配置
  const distributionOption = {
    tooltip: {
      trigger: "item",
      formatter: "{a} <br/>{b}: {c} ({d}%)",
    },
    legend: {
      orient: "vertical",
      left: "left",
      bottom: 0,
      top: "center",
    },
    series: [
      {
        name: "可追溯来源库存成本",
        type: "pie",
        radius: ["40%", "70%"],
        center: ["65%", "50%"],
        avoidLabelOverlap: false,
        itemStyle: {
          borderRadius: 10,
          borderColor: "#fff",
          borderWidth: 2,
        },
        label: {
          show: false,
          position: "center",
        },
        emphasis: {
          label: {
            show: true,
            fontSize: "18",
            fontWeight: "bold",
          },
        },
        labelLine: {
          show: false,
        },
        data: chartData,
      },
    ],
  };

  distributionChart.setOption(distributionOption, true);
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

// 更新最近七日库存成本趋势图表；Number 仅用于图形坐标，不参与权威合计。
function updateTrendChart(data) {
  if (!trendChart || !data) return;

  const rows = data.items || [];
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
    INBOUND: "#409EFF",
    SALES: "#F56C6C",
    WORKSHOP_MATERIAL: "#E6A23C",
    RD_PROJECT: "#8B5CF6",
    RD_HANDOFF: "#EF4444",
    RD_STOCKTAKE_GAIN: "#16A34A",
    RD_STOCKTAKE_LOSS: "#DC2626",
  };
  const rowsByDate = new Map();

  rows.forEach((item) => {
    const current = rowsByDate.get(item.date) || {};
    current[item.trendType] = Number(item.totalAmount || 0);
    rowsByDate.set(item.date, current);
  });

  const dates = [...rowsByDate.keys()].sort();
  const activeTrendTypes = trendTypes.filter((trendType) =>
    dates.some((date) => Number(rowsByDate.get(date)?.[trendType] || 0) !== 0),
  );
  const trendOption = {
    color: activeTrendTypes.map((trendType) => colorMap[trendType]),
    tooltip: {
      trigger: "axis",
      valueFormatter: (value) =>
        `${Number(value || 0).toLocaleString("zh-CN", {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        })} 元`,
    },
    legend: {
      data: activeTrendTypes.map(formatTrendType),
      bottom: 0,
    },
    grid: {
      left: "3%",
      right: "4%",
      bottom: "15%",
      top: "10%",
      containLabel: true,
    },
    xAxis: {
      type: "category",
      boundaryGap: false,
      data: dates.map((date) => date.slice(5)),
    },
    yAxis: {
      type: "value",
      name: "库存成本金额",
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
              fill: "#9CA3AF",
              fontSize: 14,
            },
          },
        ],
    series: activeTrendTypes.map((trendType) => ({
      name: formatTrendType(trendType),
      type: "line",
      smooth: true,
      showSymbol: false,
      data: dates.map((date) => Number(rowsByDate.get(date)?.[trendType] || 0)),
    })),
  };

  trendChart.setOption(trendOption, true);
}

// 组件挂载时执行
onMounted(() => {
  setCurrentDate();
  void activateDashboard();
});

// 统一的数据加载函数（expectedSequence 防止 await 期间已失活仍写回图表）
async function loadData(expectedSequence) {
  try {
    const [statisticsResponse, categoryResponse, trendResponse] =
      await Promise.all([
        getHomeStatistics(),
        getInventoryCategoryStatistics(),
        getDocumentDateStatistics(),
      ]);

    if (expectedSequence !== activationSequence || !isDashboardActive.value) {
      return;
    }

    const statistics = statisticsResponse.data;
    if (statistics) {
      statisticsData.value = statistics;
    }

    updateDistributionChart(categoryResponse.data || []);
    trendSummary.value = trendResponse.data?.summary || {
      documentCount: 0,
      inventoryCostNetChange: "0.0000",
    };
    updateTrendChart(trendResponse.data || {});
  } catch (error) {
    console.error("首页图表数据加载失败:", error);
  }
}

function startPolling(anchorSequence) {
  stopPolling();
  intervalId = setInterval(() => {
    void loadData(anchorSequence);
  }, 300000);
}

function stopPolling() {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
  }
}

async function activateDashboard() {
  if (isDashboardActive.value) {
    return;
  }

  const currentSequence = ++activationSequence;
  isDashboardActive.value = true;
  await nextTick();
  if (!isDashboardActive.value || activationSequence !== currentSequence) {
    return;
  }
  initCharts();
  handleResize();
  await loadData(currentSequence);
  if (!isDashboardActive.value || activationSequence !== currentSequence) {
    return;
  }
  startPolling(currentSequence);
}

function deactivateDashboard() {
  if (!isDashboardActive.value) {
    return;
  }

  activationSequence += 1;
  isDashboardActive.value = false;
  stopPolling();
  window.removeEventListener("resize", handleResize);
  disposeCharts();
}

// 组件卸载前清理
onActivated(() => {
  setCurrentDate();
  void activateDashboard();
});

onDeactivated(() => {
  deactivateDashboard();
});

onBeforeUnmount(() => {
  deactivateDashboard();
});
</script>

<style scoped lang="scss">
.app-container {
  overflow: hidden;
  height: 100%;
}

.dashboard-container {
  padding: 20px;
  min-height: 100%;
  height: 100%;
  overflow: hidden;
  box-sizing: border-box;
}

.welcome-section {
  .welcome-title {
    font-size: 24px;
    font-weight: 600;
    color: #303133;
    margin-bottom: 10px;
  }
  
  .welcome-subtitle {
    font-size: 14px;
    color: #606266;
    
    .current-date {
      color: #409EFF;
      font-weight: 500;
	    font-size: 20px;
    }
  }
}

.welcome-buttons {
  display: flex;
  justify-content: flex-end;
  align-items: center;
  height: 100%;
}

.stat-card {
  border-radius: 8px;
  border: none;
  border-left: 4px solid #CCCCCC; /* 默认边框颜色 */
  
  &.stat-card-primary {
    border-left-color: #409EFF; /* 蓝色边框 */
  }
  
  &.stat-card-success {
    border-left-color: #67C23A; /* 绿色边框 */
  }
  
  &.stat-card-warning {
    border-left-color: #E6A23C; /* 橙色边框 */
  }
	
  &.stat-card-error {
    border-left-color: #e1081a; /* 红色边框 */
  }
  
  .stat-content {
    display: flex;
    justify-content: space-between;
    align-items: center;
    
    .stat-info {
      flex: 1;
      
      .stat-label {
        font-size: 14px;
        color: #606266;
        margin-bottom: 8px;
      }
      
      .stat-value {
        font-size: 24px;
        font-weight: 600;
        color: #303133;
        margin-bottom: 8px;

        &.stat-value--compact {
          font-size: 21px;
        }
      }

      .stat-breakdown {
        min-height: 20px;
        margin: 0;
        color: #909399;
        font-size: 12px;
        line-height: 20px;
      }
    }
    
    .stat-icon {
      width: 50px;
      height: 50px;
      border-radius: 8px;
      display: flex;
      align-items: center;
      justify-content: center;
      
      &.bg-primary-light {
        background-color: #ecf5ff;
      }
      
      &.bg-success-light {
        background-color: #f0f9eb;
      }
      
      &.bg-warning-light {
        background-color: #fdf6ec;
      }
    }
  }
}

.chart-card {
  border-radius: 8px;
  
  .chart-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    
    .chart-title {
      font-size: 16px;
      font-weight: 600;
      color: #303133;
    }

    .chart-summary {
      color: #909399;
      font-size: 12px;
      text-align: right;
    }
    
    .chart-actions {
      .el-button {
        &.active {
          color: #409EFF;
        }
      }
    }
  }
  
  .chart-container {
    height: 300px;
    width: 100%;
  }
}

.records-card {
  border-radius: 8px;
  
  .records-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    
    .records-title {
      font-size: 16px;
      font-weight: 600;
      color: #303133;
    }
  }
}

.text-right {
  text-align: right;
}

.mb-4 {
  margin-bottom: 16px;
}
</style>
