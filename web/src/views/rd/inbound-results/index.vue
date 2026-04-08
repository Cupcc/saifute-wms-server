<template>
  <div class="app-container">
    <el-card shadow="never">
      <template #header>
        <div class="page-header">
          <div>自动入库结果</div>
          <el-tag type="success">{{ workshopLabel }}</el-tag>
        </div>
      </template>

      <el-form :inline="true" class="query-form">
        <el-form-item label="单据编号">
          <el-input
            v-model="filters.documentNo"
            clearable
            placeholder="请输入单据编号"
            style="width: 240px"
            @keyup.enter="handleSearch"
          />
        </el-form-item>
        <el-form-item label="业务日期">
          <el-date-picker
            v-model="dateRange"
            type="daterange"
            range-separator="-"
            start-placeholder="开始日期"
            end-placeholder="结束日期"
            value-format="YYYY-MM-DD"
          />
        </el-form-item>
        <el-form-item>
          <el-button type="primary" @click="handleSearch">查询</el-button>
          <el-button @click="handleReset">重置</el-button>
        </el-form-item>
      </el-form>

      <el-table :data="rows" stripe v-loading="loading">
        <el-table-column prop="documentNo" label="单据编号" min-width="180">
          <template #default="{ row }">
            <el-button link type="primary" @click="openDetail(row)">
              {{ row.documentNo }}
            </el-button>
          </template>
        </el-table-column>
        <el-table-column label="业务日期" min-width="120">
          <template #default="{ row }">
            {{ formatDate(row.bizDate) }}
          </template>
        </el-table-column>
        <el-table-column
          prop="sourceWorkshopNameSnapshot"
          label="来源车间"
          min-width="140"
        />
        <el-table-column
          prop="targetWorkshopNameSnapshot"
          label="目标车间"
          min-width="140"
        />
        <el-table-column prop="totalQty" label="总数量" min-width="120" />
        <el-table-column prop="totalAmount" label="总金额" min-width="120" />
        <el-table-column label="明细数" min-width="100">
          <template #default="{ row }">
            {{ row.lines?.length || 0 }}
          </template>
        </el-table-column>
        <el-table-column prop="remark" label="备注" min-width="180" />
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

    <el-dialog v-model="detailOpen" title="自动入库结果详情" width="900px">
      <template v-if="detailRow">
        <el-descriptions :column="2" border class="detail-descriptions">
          <el-descriptions-item label="单据编号">
            {{ detailRow.documentNo }}
          </el-descriptions-item>
          <el-descriptions-item label="业务日期">
            {{ formatDate(detailRow.bizDate) }}
          </el-descriptions-item>
          <el-descriptions-item label="来源车间">
            {{ detailRow.sourceWorkshopNameSnapshot || "-" }}
          </el-descriptions-item>
          <el-descriptions-item label="目标车间">
            {{ detailRow.targetWorkshopNameSnapshot || "-" }}
          </el-descriptions-item>
          <el-descriptions-item label="总数量">
            {{ detailRow.totalQty }}
          </el-descriptions-item>
          <el-descriptions-item label="总金额">
            {{ detailRow.totalAmount }}
          </el-descriptions-item>
          <el-descriptions-item label="备注">
            {{ detailRow.remark || "-" }}
          </el-descriptions-item>
        </el-descriptions>

        <el-table :data="detailRow.lines || []" stripe class="detail-table">
          <el-table-column prop="lineNo" label="行号" width="80" />
          <el-table-column prop="materialCodeSnapshot" label="物料编码" min-width="140" />
          <el-table-column prop="materialNameSnapshot" label="物料名称" min-width="180" />
          <el-table-column prop="materialSpecSnapshot" label="规格型号" min-width="140" />
          <el-table-column prop="quantity" label="数量" min-width="100" />
          <el-table-column prop="unitPrice" label="单价" min-width="100" />
          <el-table-column prop="amount" label="金额" min-width="100" />
        </el-table>
      </template>
    </el-dialog>
  </div>
</template>

<script setup name="RdInboundResultsPage">
import { computed, onMounted, ref } from "vue";
import { listRdInboundResults } from "@/api/rd-subwarehouse";
import useUserStore from "@/store/modules/user";

const userStore = useUserStore();
const loading = ref(false);
const rows = ref([]);
const total = ref(0);
const pageNum = ref(1);
const pageSize = ref(10);
const detailOpen = ref(false);
const detailRow = ref(null);
const dateRange = ref([]);
const filters = ref({
  documentNo: "",
});

const workshopLabel = computed(
  () => userStore.stockScope?.stockScopeName || "未绑定研发小仓",
);

function formatDate(value) {
  if (!value) {
    return "-";
  }
  return new Date(value).toLocaleDateString("zh-CN");
}

async function loadRows() {
  loading.value = true;
  try {
    const response = await listRdInboundResults({
      documentNo: filters.value.documentNo || undefined,
      bizDateFrom: dateRange.value?.[0] || undefined,
      bizDateTo: dateRange.value?.[1] || undefined,
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
  filters.value.documentNo = "";
  dateRange.value = [];
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

function openDetail(row) {
  detailRow.value = row;
  detailOpen.value = true;
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

.detail-descriptions {
  margin-bottom: 16px;
}
</style>
