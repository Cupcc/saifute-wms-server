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
            <div class="stat-label">在库物料数</div>
            <div class="stat-value">{{ summary.activeMaterialCount }}</div>
          </div>
        </el-col>
        <el-col :xs="24" :sm="12" :lg="6">
          <div class="stat-box">
            <div class="stat-label">库存记录数</div>
            <div class="stat-value">{{ summary.inventoryRecordCount }}</div>
          </div>
        </el-col>
        <el-col :xs="24" :sm="12" :lg="6">
          <div class="stat-box">
            <div class="stat-label">低库存项</div>
            <div class="stat-value">{{ summary.lowStockCount }}</div>
          </div>
        </el-col>
        <el-col :xs="24" :sm="12" :lg="6">
          <div class="stat-box">
            <div class="stat-label">库存货值</div>
            <div class="stat-value">{{ summary.totalInventoryValue }}</div>
          </div>
        </el-col>
      </el-row>

      <el-table :data="rows" stripe v-loading="loading">
        <el-table-column prop="materialCode" label="物料编码" min-width="140" />
        <el-table-column prop="materialName" label="物料名称" min-width="180" />
        <el-table-column prop="categoryName" label="分类" min-width="140" />
        <el-table-column prop="stockScopeName" label="库存范围" min-width="140" />
        <el-table-column prop="quantityOnHand" label="库存数量" min-width="120" />
        <el-table-column prop="unitCode" label="单位" min-width="90" />
        <el-table-column prop="inventoryValue" label="库存货值" min-width="120" />
        <el-table-column label="状态" min-width="110">
          <template #default="{ row }">
            <el-tag :type="row.isBelowMin ? 'danger' : 'success'">
              {{ row.isBelowMin ? "低库存" : "正常" }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="更新时间" min-width="180">
          <template #default="{ row }">
            {{ formatDateTime(row.updatedAt) }}
          </template>
        </el-table-column>
      </el-table>

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
  totalInventoryValue: "0.00",
});
const routeStockScope = computed(() =>
  route.path.startsWith("/rd/") ? "RD_SUB" : undefined,
);

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
