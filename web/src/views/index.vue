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
                <p class="stat-label">今日入库单据</p>
                <p class="stat-value">{{ statisticsData.inbound.todayCount }}</p>
                <el-tag
                  :type="
                    statisticsData.inbound.percentageChange >= 0
                      ? 'success'
                      : 'danger'
                  "
                  size="small"
                >
                  <el-icon class="mr-1"
                    ><ArrowUp
                      v-if="statisticsData.inbound.percentageChange >= 0"
                    /><ArrowDown v-else
                  /></el-icon>
                  {{ statisticsData.inbound.percentageChange >= 0 ? "+" : ""
                  }}{{ statisticsData.inbound.percentageChange }}% 较昨天
                </el-tag>
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
                <p class="stat-label">今日出库单据</p>
                <p class="stat-value">{{ statisticsData.outbound.todayCount }}</p>
                <el-tag
                  :type="
                    statisticsData.outbound.percentageChange >= 0
                      ? 'success'
                      : 'danger'
                  "
                  size="small"
                >
                  <el-icon class="mr-1"
                    ><ArrowUp
                      v-if="statisticsData.outbound.percentageChange >= 0"
                    /><ArrowDown v-else
                  /></el-icon>
                  {{ statisticsData.outbound.percentageChange >= 0 ? "+" : ""
                  }}{{ statisticsData.outbound.percentageChange }}% 较昨日
                </el-tag>
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
                <p class="stat-label">今日领退料单据</p>
                <p class="stat-value">
                  {{ statisticsData.workshopMaterial.todayCount }}
                </p>
                <el-tag
                  :type="
                    statisticsData.workshopMaterial.percentageChange >= 0
                      ? 'success'
                      : 'danger'
                  "
                  size="small"
                >
                  <el-icon class="mr-1"
                    ><ArrowUp
                      v-if="
                        statisticsData.workshopMaterial.percentageChange >= 0
                      "
                    /><ArrowDown v-else
                  /></el-icon>
                  {{
                    statisticsData.workshopMaterial.percentageChange >= 0
                      ? "+"
                      : ""
                  }}{{ statisticsData.workshopMaterial.percentageChange }}%
                  较昨日
                </el-tag>
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
                <p class="stat-label">在库物料数</p>
                <p class="stat-value">
                  {{ statisticsData.inventory.activeMaterialCount }}
                </p>
                <el-tag type="info" size="small">
                  低库存 {{ statisticsData.inventory.lowStockCount }} 项
                </el-tag>
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
                <span class="chart-title">业务趋势</span>
              </div>
            </template>
            <div ref="trendChartRef" class="chart-container"></div>
          </el-card>
        </el-col>

        <el-col :xs="24" :lg="12" class="mb-4">
          <el-card class="chart-card">
            <template #header>
              <div class="chart-header">
                <span class="chart-title">库存分类分布</span>
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
  inbound: {
    todayCount: 0,
    percentageChange: 0,
  },
  outbound: {
    todayCount: 0,
    percentageChange: 0,
  },
  workshopMaterial: {
    todayCount: 0,
    percentageChange: 0,
  },
  inventory: {
    activeMaterialCount: 0,
    lowStockCount: 0,
  },
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
        axisPointer: {
          type: "shadow",
        },
      },
      legend: {
        data: ["入库单据", "出库单据", "领退料单据"],
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
      },
      series: [
        {
          name: "入库单据",
          type: "bar",
          data: [],
          itemStyle: {
            color: "#409EFF",
          },
        },
        {
          name: "出库单据",
          type: "bar",
          data: [],
          itemStyle: {
            color: "#F56C6C",
          },
        },
        {
          name: "领退料单据",
          type: "bar",
          data: [],
          itemStyle: {
            color: "#E6A23C",
          },
        },
      ],
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
          name: "库存分类",
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
    value: item.totalQuantity,
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
        name: "库存分类",
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

// 更新库存趋势图表
function updateTrendChart(data) {
  if (!trendChart || !data) return;

  // 提取日期作为X轴数据，格式化为MM-DD
  const dates = data.map((item) => {
    const date = new Date(item.date);
    const month = (date.getMonth() + 1).toString().padStart(2, "0");
    const day = date.getDate().toString().padStart(2, "0");
    return `${month}-${day}`;
  });

  // 更新图表配置
  const trendOption = {
    tooltip: {
      trigger: "axis",
      axisPointer: {
        type: "shadow",
      },
    },
    legend: {
      data: ["入库单据", "出库单据", "领退料单据"],
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
      data: dates,
    },
    yAxis: {
      type: "value",
    },
    series: [
      {
        name: "入库单据",
        type: "bar",
        data: data.map((item) => item.inboundCount),
        itemStyle: {
          color: "#409EFF",
        },
      },
      {
        name: "出库单据",
        type: "bar",
        data: data.map((item) => item.outboundCount),
        itemStyle: {
          color: "#67C23A",
        },
      },
      {
        name: "领退料单据",
        type: "bar",
        data: data.map((item) => item.workshopMaterialCount),
        itemStyle: {
          color: "#E6A23C",
        },
      },
    ],
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
    updateTrendChart(trendResponse.data || []);
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
