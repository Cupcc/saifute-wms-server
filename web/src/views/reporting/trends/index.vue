<template>
  <div class="app-container">
    <el-card shadow="never">
      <template #header>
        <div class="page-header">趋势分析</div>
      </template>

      <el-form :inline="true" :model="filters" class="query-form">
        <el-form-item label="业务类型">
          <el-select v-model="filters.trendType" style="width: 180px">
            <el-option
              v-for="option in trendOptions"
              :key="option.value"
              :label="option.label"
              :value="option.value"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="日期范围">
          <el-date-picker
            v-model="filters.dateRange"
            type="daterange"
            value-format="YYYY-MM-DD"
            start-placeholder="开始日期"
            end-placeholder="结束日期"
            range-separator="至"
          />
        </el-form-item>
        <el-form-item>
          <el-button type="primary" @click="loadRows">查询</el-button>
        </el-form-item>
      </el-form>

      <el-row :gutter="16" class="summary-row">
        <el-col :xs="24" :sm="12">
          <div class="stat-box">
            <div class="stat-label">
              <reporting-metric-label
                label="业务单据数"
                :content="trendMetricHelp.documentCount"
              />
            </div>
            <div class="stat-value">{{ summary.documentCount }}</div>
          </div>
        </el-col>
        <el-col :xs="24" :sm="12">
          <div class="stat-box">
            <div class="stat-label">
              <reporting-metric-label
                label="库存成本净变动"
                :content="trendMetricHelp.inventoryCostNetChange"
              />
            </div>
            <div class="stat-value">{{ summary.inventoryCostNetChange }}</div>
          </div>
        </el-col>
      </el-row>

      <adaptive-table
        column-preferences
        :fit-viewport="false"
        :data="rows"
        stripe
        v-loading="loading"
      >
        <reporting-metric-column
          prop="date"
          label="日期"
          :content="trendMetricHelp.date"
        />
        <reporting-metric-column
          label="类型"
          :content="trendMetricHelp.trendType"
        >
          <template #default="{ row }">
            {{ formatTrendType(row.trendType) }}
          </template>
        </reporting-metric-column>
        <reporting-metric-column
          prop="documentCount"
          label="业务单据数"
          :content="trendMetricHelp.documentCount"
        />
        <reporting-metric-column
          prop="totalAmount"
          label="库存成本金额"
          :content="trendMetricHelp.totalAmount"
        />
      </adaptive-table>
    </el-card>
  </div>
</template>

<script setup name="ReportingTrendsPage">
import { onMounted, ref } from "vue";
import { getTrendSeries } from "@/api/reporting";
import ReportingMetricColumn from "../components/ReportingMetricColumn.vue";
import ReportingMetricLabel from "../components/ReportingMetricLabel.vue";
import { trendMetricHelp } from "../reportingMetricHelp";

const loading = ref(false);
const rows = ref([]);
const trendOptions = [
  { label: "全部", value: "ALL" },
  { label: "入库域净成本流量", value: "INBOUND" },
  { label: "销售出库成本", value: "SALES" },
  { label: "车间净耗用成本", value: "WORKSHOP_MATERIAL" },
  { label: "研发项目净耗用成本", value: "RD_PROJECT" },
  { label: "RD交接", value: "RD_HANDOFF" },
  { label: "RD盘盈", value: "RD_STOCKTAKE_GAIN" },
  { label: "RD盘亏", value: "RD_STOCKTAKE_LOSS" },
];

const filters = ref({
  trendType: "ALL",
  dateRange: getDefaultRange(),
});

const summary = ref({
  documentCount: 0,
  inventoryCostNetChange: "0.0000",
});

function getDefaultRange() {
  const end = new Date();
  const start = new Date();
  start.setDate(end.getDate() - 6);
  return [start.toISOString().slice(0, 10), end.toISOString().slice(0, 10)];
}

function formatTrendType(value) {
  const labelMap = {
    ALL: "全部",
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

async function loadRows() {
  loading.value = true;
  try {
    const [dateFrom, dateTo] = filters.value.dateRange || [];
    const response = await getTrendSeries({
      trendType: filters.value.trendType,
      dateFrom,
      dateTo,
    });
    rows.value = response.data?.items || [];
    summary.value = response.data?.summary || summary.value;
  } finally {
    loading.value = false;
  }
}

onMounted(() => {
  loadRows();
});
</script>

<style scoped lang="scss">
.page-header {
  font-size: 18px;
  font-weight: 600;
}

.query-form {
  margin-bottom: 16px;
}

.summary-row {
  margin-bottom: 16px;
}

.stat-box {
  border: 1px solid #ebeef5;
  border-radius: 4px;
  padding: 12px 16px;
  background: #fff;
}

.stat-label {
  color: #909399;
  font-size: 14px;
  margin-bottom: 6px;
}

.stat-value {
  color: #303133;
  font-size: 26px;
  font-weight: 600;
  line-height: 1.2;
}
</style>
