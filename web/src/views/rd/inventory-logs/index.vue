<template>
  <div class="app-container">
    <el-card shadow="never">
      <template #header>
        <div class="page-header">
          <div>研发库存流水</div>
          <el-tag type="success">{{ workshopLabel }}</el-tag>
        </div>
      </template>

      <el-form :inline="true" class="query-form">
        <el-form-item label="物料">
          <el-select
            v-model="filters.materialId"
            filterable
            remote
            reserve-keyword
            clearable
            placeholder="请输入物料编码或名称"
            :remote-method="searchMaterials"
            :loading="materialLoading"
            style="width: 280px"
          >
            <el-option
              v-for="item in materialOptions"
              :key="item.id"
              :label="`${item.materialCode} ${item.materialName}`"
              :value="item.id"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="单据类型">
          <el-input
            v-model="filters.businessDocumentType"
            clearable
            placeholder="如 Project / StockInOrder"
            style="width: 220px"
            @keyup.enter="handleSearch"
          />
        </el-form-item>
        <el-form-item label="单据 ID">
          <el-input-number
            v-model="filters.businessDocumentId"
            :min="1"
            controls-position="right"
            placeholder="单据 ID"
            style="width: 180px"
          />
        </el-form-item>
        <el-form-item>
          <el-button type="primary" @click="handleSearch">查询</el-button>
          <el-button @click="handleReset">重置</el-button>
        </el-form-item>
      </el-form>

      <el-table :data="rows" stripe v-loading="loading">
        <el-table-column prop="occurredAt" label="发生时间" min-width="180">
          <template #default="{ row }">
            {{ formatDateTime(row.occurredAt) }}
          </template>
        </el-table-column>
        <el-table-column label="物料" min-width="220">
          <template #default="{ row }">
            {{ row.material?.materialCode }} {{ row.material?.materialName }}
          </template>
        </el-table-column>
        <el-table-column prop="operationType" label="操作类型" min-width="150" />
        <el-table-column prop="direction" label="方向" min-width="100">
          <template #default="{ row }">
            <el-tag :type="row.direction === 'IN' ? 'success' : 'danger'">
              {{ row.direction }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="changeQty" label="变动数量" min-width="120" />
        <el-table-column prop="beforeQty" label="变动前" min-width="120" />
        <el-table-column prop="afterQty" label="变动后" min-width="120" />
        <el-table-column prop="businessDocumentNumber" label="单据编号" min-width="160" />
        <el-table-column prop="businessDocumentType" label="单据类型" min-width="140" />
        <el-table-column prop="note" label="备注" min-width="180" />
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

<script setup name="RdInventoryLogsPage">
import { computed, onMounted, ref } from "vue";
import { listRdInventoryLogs, listRdMaterials } from "@/api/rd-subwarehouse";
import useUserStore from "@/store/modules/user";

const userStore = useUserStore();
const loading = ref(false);
const materialLoading = ref(false);
const rows = ref([]);
const total = ref(0);
const pageNum = ref(1);
const pageSize = ref(10);
const materialOptions = ref([]);
const filters = ref({
  materialId: null,
  businessDocumentType: "",
  businessDocumentId: null,
});

const workshopLabel = computed(
  () => userStore.stockScope?.stockScopeName || "未绑定研发小仓",
);

function formatDateTime(value) {
  if (!value) {
    return "-";
  }
  return new Date(value).toLocaleString("zh-CN", { hour12: false });
}

async function searchMaterials(keyword) {
  materialLoading.value = true;
  try {
    const response = await listRdMaterials({
      keyword: keyword || undefined,
      limit: 20,
      offset: 0,
    });
    materialOptions.value = response.data?.items || [];
  } finally {
    materialLoading.value = false;
  }
}

async function loadRows() {
  loading.value = true;
  try {
    const response = await listRdInventoryLogs({
      materialId: filters.value.materialId || undefined,
      businessDocumentType: filters.value.businessDocumentType || undefined,
      businessDocumentId: filters.value.businessDocumentId || undefined,
      limit: pageSize.value,
      offset: (pageNum.value - 1) * pageSize.value,
    });
    rows.value = response.data?.items || [];
    total.value = response.data?.total || 0;
  } finally {
    loading.value = false;
  }
}

function handleSearch() {
  pageNum.value = 1;
  loadRows();
}

function handleReset() {
  filters.value = {
    materialId: null,
    businessDocumentType: "",
    businessDocumentId: null,
  };
  pageNum.value = 1;
  loadRows();
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
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.query-form {
  margin-bottom: 16px;
}

.pagination-wrap {
  display: flex;
  justify-content: flex-end;
  margin-top: 16px;
}
</style>
