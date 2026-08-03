<template>
  <div class="app-container">
    <el-card shadow="never">
      <template #header>
        <div class="page-header">库存汇总</div>
      </template>

      <el-form :inline="true" :model="filters" class="query-form">
        <el-form-item label="关键字">
          <el-input
            v-model="filters.keyword"
            clearable
            placeholder="物料编码或名称"
            style="width: 260px"
            @keyup.enter="handleSearch"
          />
        </el-form-item>
        <el-form-item>
          <el-button type="primary" @click="handleSearch">查询</el-button>
          <el-button @click="handleReset">重置</el-button>
        </el-form-item>
      </el-form>

      <el-row :gutter="16" class="summary-row">
        <el-col :xs="24" :sm="12" :lg="6">
          <div class="stat-box">
            <div class="stat-label">
              <reporting-metric-label
                label="在库物料品种数"
                :content="inventoryMetricHelp.activeMaterialCount"
              />
            </div>
            <div class="stat-value">{{ summary.activeMaterialCount }}</div>
          </div>
        </el-col>
        <el-col :xs="24" :sm="12" :lg="6">
          <div class="stat-box">
            <div class="stat-label">
              <reporting-metric-label
                label="库存余额记录数（含零余额）"
                :content="inventoryMetricHelp.inventoryRecordCount"
              />
            </div>
            <div class="stat-value">{{ summary.inventoryRecordCount }}</div>
          </div>
        </el-col>
        <el-col :xs="24" :sm="12" :lg="6">
          <div class="stat-box">
            <div class="stat-label">
              <reporting-metric-label
                label="可追溯来源库存成本"
                :content="inventoryMetricHelp.totalInventoryValue"
              />
            </div>
            <div class="stat-value">{{ summary.totalInventoryValue }}</div>
          </div>
        </el-col>
        <el-col :xs="24" :sm="12" :lg="6">
          <div class="stat-box">
            <div class="stat-label">
              <reporting-metric-label
                label="低于下限的物料-仓别数"
                :content="inventoryMetricHelp.lowStockCount"
              />
            </div>
            <div class="stat-value">{{ summary.lowStockCount }}</div>
          </div>
        </el-col>
        <el-col :xs="24" :sm="12" :lg="6">
          <div class="stat-box">
            <div class="stat-label">
              <reporting-metric-label
                label="正常的物料-仓别数"
                :content="inventoryMetricHelp.normalStockCount"
              />
            </div>
            <div class="stat-value">{{ summary.normalStockCount }}</div>
          </div>
        </el-col>
        <el-col :xs="24" :sm="12" :lg="6">
          <div class="stat-box">
            <div class="stat-label">
              <reporting-metric-label
                label="高于上限的物料-仓别数"
                :content="inventoryMetricHelp.aboveMaxStockCount"
              />
            </div>
            <div class="stat-value">{{ summary.aboveMaxStockCount }}</div>
          </div>
        </el-col>
        <el-col :xs="24" :sm="12" :lg="6">
          <div class="stat-box">
            <div class="stat-label">
              <reporting-metric-label
                label="未配置阈值的物料-仓别数"
                :content="inventoryMetricHelp.unconfiguredStockCount"
              />
            </div>
            <div class="stat-value">{{ summary.unconfiguredStockCount }}</div>
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
        <reporting-column prop="materialCode" label="物料编码" />
        <reporting-column prop="materialName" label="物料名称" />
        <reporting-column prop="categoryName" label="分类" />
        <reporting-column prop="stockScopeName" label="库存范围" />
        <reporting-metric-column
          prop="quantityOnHand"
          label="库存数量"
          :content="inventoryMetricHelp.quantityOnHand"
        />
        <reporting-column prop="unitCode" label="单位" />
        <reporting-metric-column
          prop="inventoryValue"
          label="可追溯来源库存成本"
          :content="inventoryMetricHelp.inventoryValue"
        />
        <reporting-metric-column
          label="状态"
          :content="inventoryMetricHelp.inventoryStatus"
        >
          <template #default="{ row }">
            <el-tag :type="getInventoryStatusMeta(row.inventoryStatus).type">
              {{ getInventoryStatusMeta(row.inventoryStatus).label }}
            </el-tag>
          </template>
        </reporting-metric-column>
        <reporting-column label="更新时间">
          <template #default="{ row }">
            {{ formatDateTime(row.updatedAt) }}
          </template>
        </reporting-column>
      </adaptive-table>

      <div class="pagination-wrap">
        <el-pagination
          background
          layout="total, sizes, prev, pager, next"
          :current-page="pageNum"
          :page-size="pageSize"
          :page-sizes="[10, 20, 50]"
          :total="total"
          @current-change="handlePageChange"
          @size-change="handleSizeChange"
        />
      </div>
    </el-card>
  </div>
</template>

<script setup name="InventorySummaryPage">
import { computed, onMounted, ref } from "vue";
import { useRoute } from "vue-router";
import { getInventorySummary } from "@/api/reporting";
import ReportingColumn from "../components/ReportingColumn.vue";
import ReportingMetricColumn from "../components/ReportingMetricColumn.vue";
import ReportingMetricLabel from "../components/ReportingMetricLabel.vue";
import { inventoryMetricHelp } from "../reportingMetricHelp";

const route = useRoute();
const loading = ref(false);
const rows = ref([]);
const total = ref(0);
const pageNum = ref(1);
const pageSize = ref(10);
const filters = ref({
  keyword: "",
});
const summary = ref({
  activeMaterialCount: 0,
  inventoryRecordCount: 0,
  lowStockCount: 0,
  normalStockCount: 0,
  aboveMaxStockCount: 0,
  unconfiguredStockCount: 0,
  totalInventoryValue: "0.00",
});
const inventoryStatusMeta = Object.freeze({
  LOW: { label: "低于下限", type: "danger" },
  NORMAL: { label: "正常", type: "success" },
  ABOVE_MAX: { label: "高于上限", type: "warning" },
  UNCONFIGURED: { label: "未配置阈值", type: "info" },
});
const routeStockScope = computed(() =>
  route.path.startsWith("/rd/") ? "RD_SUB" : undefined,
);

function getInventoryStatusMeta(status) {
  return inventoryStatusMeta[status] ?? { label: "未知", type: "info" };
}

function formatDateTime(value) {
  if (!value) {
    return "-";
  }
  return new Date(value).toLocaleString("zh-CN", { hour12: false });
}

async function loadRows() {
  loading.value = true;
  try {
    const response = await getInventorySummary({
      keyword: filters.value.keyword || undefined,
      stockScope: routeStockScope.value,
      limit: pageSize.value,
      offset: (pageNum.value - 1) * pageSize.value,
    });
    rows.value = response.data?.items || [];
    total.value = response.data?.total || 0;
    summary.value = response.data?.summary || summary.value;
  } finally {
    loading.value = false;
  }
}

function handleSearch() {
  pageNum.value = 1;
  loadRows();
}

function handleReset() {
  filters.value.keyword = "";
  handleSearch();
}

function handlePageChange(value) {
  pageNum.value = value;
  loadRows();
}

function handleSizeChange(value) {
  pageSize.value = value;
  pageNum.value = 1;
  loadRows();
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

.pagination-wrap {
  display: flex;
  justify-content: flex-end;
  margin-top: 16px;
}
</style>
