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
        <el-col :xs="24" :sm="8">
          <div class="stat-box">
            <div class="stat-label">记录数</div>
            <div class="stat-value">{{ rows.length }}</div>
          </div>
        </el-col>
        <el-col :xs="24" :sm="8">
          <div class="stat-box">
            <div class="stat-label">总数量</div>
            <div class="stat-value">{{ summary.totalQty }}</div>
          </div>
        </el-col>
        <el-col :xs="24" :sm="8">
          <div class="stat-box">
            <div class="stat-label">总金额</div>
            <div class="stat-value">{{ summary.totalAmount }}</div>
          </div>
        </el-col>
      </el-row>

      <el-table :data="rows" stripe v-loading="loading">
        <el-table-column prop="date" label="日期" min-width="120" />
        <el-table-column label="类型" min-width="140">
          <template #default="{ row }">
            {{ formatTrendType(row.trendType) }}
          </template>
        </el-table-column>
        <el-table-column prop="documentCount" label="单据数" min-width="100" />
        <el-table-column prop="totalQty" label="总数量" min-width="140" />
        <el-table-column prop="totalAmount" label="总金额" min-width="140" />
      </el-table>
    </el-card>
  </div>
</template>

<script setup name="ReportingTrendsPage">
import { computed, onMounted, ref } from "vue";
import { getTrendSeries } from "@/api/reporting";

const loading = ref(false);
const rows = ref([]);
const trendOptions = [
  { label: "全部", value: "ALL" },
  { label: "入库", value: "INBOUND" },
  { label: "销售出库", value: "SALES" },
  { label: "领退料", value: "WORKSHOP_MATERIAL" },
  { label: "研发项目", value: "RD_PROJECT" },
  { label: "研发协同", value: "RD" },
];

const filters = ref({
  trendType: "ALL",
  dateRange: getDefaultRange(),
});

const summary = computed(() =>
  rows.value.reduce(
    (accumulator, item) => ({
      totalQty: (
        Number(accumulator.totalQty) + Number(item.totalQty || 0)
      ).toFixed(6),
      totalAmount: (
        Number(accumulator.totalAmount) + Number(item.totalAmount || 0)
      ).toFixed(4),
    }),
    {
      totalQty: "0.000000",
      totalAmount: "0.0000",
    },
  ),
);

function getDefaultRange() {
  const end = new Date();
  const start = new Date();
  start.setDate(end.getDate() - 6);
  return [start.toISOString().slice(0, 10), end.toISOString().slice(0, 10)];
}

function formatTrendType(value) {
  const labelMap = {
    ALL: "全部",
    INBOUND: "入库",
    SALES: "销售出库",
    WORKSHOP_MATERIAL: "领退料",
    RD_PROJECT: "研发项目",
    RD: "研发协同",
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
