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
            @focus="handleMaterialFocus"
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
          <el-select
            v-model="filters.businessDocumentType"
            clearable
            placeholder="全部"
            style="width: 220px"
          >
            <el-option
              v-for="item in documentTypeOptions"
              :key="item.value"
              :label="item.label"
              :value="item.value"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="单据编号">
          <el-input
            v-model="filters.businessDocumentNumber"
            clearable
            placeholder="支持模糊查询"
            style="width: 220px"
            @keyup.enter="handleSearch"
          />
        </el-form-item>
        <el-form-item label="业务日期">
          <el-date-picker
            v-model="bizDateRange"
            type="daterange"
            value-format="YYYY-MM-DD"
            range-separator="-"
            start-placeholder="开始日期"
            end-placeholder="结束日期"
            style="width: 260px"
          />
        </el-form-item>
        <el-form-item>
          <el-button type="primary" @click="handleSearch">查询</el-button>
          <el-button @click="handleReset">重置</el-button>
        </el-form-item>
      </el-form>

      <el-table :data="rows" stripe v-loading="loading">
        <el-table-column prop="bizDate" label="业务日期" min-width="120">
          <template #default="{ row }">
            {{ formatDateValue(row.bizDate) }}
          </template>
        </el-table-column>
        <el-table-column label="物料" min-width="220">
          <template #default="{ row }">
            {{ row.material?.materialCode }} {{ row.material?.materialName }}
          </template>
        </el-table-column>
        <el-table-column prop="operationType" label="操作类型" min-width="150">
          <template #default="{ row }">
            {{ getOperationTypeLabel(row.operationType) }}
          </template>
        </el-table-column>
        <el-table-column prop="direction" label="方向" min-width="100">
          <template #default="{ row }">
            <el-tag :type="row.direction === 'IN' ? 'success' : 'danger'">
              {{ row.direction === "IN" ? "入库" : "出库" }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="changeQty" label="变动数量" min-width="120">
          <template #default="{ row }">
            <span :class="row.direction === 'IN' ? 'qty-in' : 'qty-out'">
              {{ formatSignedChangeQty(row) }}
            </span>
          </template>
        </el-table-column>
        <el-table-column prop="beforeQty" label="变动前" min-width="120">
          <template #default="{ row }">
            {{ formatQty(row.beforeQty) }}
          </template>
        </el-table-column>
        <el-table-column prop="afterQty" label="变动后" min-width="120">
          <template #default="{ row }">
            {{ formatQty(row.afterQty) }}
          </template>
        </el-table-column>
        <el-table-column prop="businessDocumentNumber" label="单据编号" min-width="140">
          <template #default="{ row }">
            <el-link
              v-if="row.businessDocumentType === 'RdHandoffOrder' && row.businessDocumentNumber"
              type="primary"
              @click="goToInboundResult(row.businessDocumentNumber)"
            >
              {{ row.businessDocumentNumber }}
            </el-link>
            <span v-else>{{ row.businessDocumentNumber || "-" }}</span>
          </template>
        </el-table-column>
        <el-table-column prop="businessDocumentType" label="单据类型" min-width="140">
          <template #default="{ row }">
            {{ getDocumentTypeLabel(row.businessDocumentType) }}
          </template>
        </el-table-column>
        <el-table-column prop="note" label="备注" min-width="180" />
        <template #empty>
          <el-empty description="暂无库存流水，可调整物料、单据或业务日期筛选后再查询" />
        </template>
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
import router from "@/router";
import useUserStore from "@/store/modules/user";
import { formatQty } from "@/utils/format";
import { formatDateOnly, formatDateValue } from "@/utils/rd-documents";

const userStore = useUserStore();
const loading = ref(false);
const materialLoading = ref(false);
const rows = ref([]);
const total = ref(0);
const pageNum = ref(1);
const pageSize = ref(10);
const materialOptions = ref([]);
const bizDateRange = ref(getDefaultBizDateRange());
const filters = ref({
  materialId: null,
  businessDocumentType: "",
  businessDocumentNumber: "",
});
const documentTypeOptions = [
  { value: "RdProject", label: "研发项目" },
  { value: "RdProjectMaterialAction", label: "项目物料动作" },
  { value: "RdHandoffOrder", label: "主仓交接单" },
  { value: "RdStocktakeOrder", label: "RD盘点单" },
  { value: "RdProcurementRequest", label: "RD采购需求" },
  { value: "WorkshopMaterialOrder", label: "车间物料单" },
];
const operationTypeLabels = {
  ACCEPTANCE_IN: "验收入库",
  PRODUCTION_RECEIPT_IN: "生产入库",
  PRICE_CORRECTION_IN: "调价入库",
  OUTBOUND_OUT: "销售出库",
  PRICE_CORRECTION_OUT: "调价出库",
  SUPPLIER_RETURN_OUT: "供应商退货出库",
  SALES_RETURN_IN: "销售退货入库",
  PICK_OUT: "领料出库",
  RETURN_IN: "退料入库",
  SCRAP_OUT: "报废出库",
  RD_PROJECT_OUT: "项目领用出库",
  RD_HANDOFF_OUT: "RD 交接出库",
  RD_HANDOFF_IN: "RD 交接入库",
  RD_STOCKTAKE_IN: "RD 盘点入库",
  RD_STOCKTAKE_OUT: "RD 盘点出库",
  RD_RETURN_OUT: "退回主仓出库",
  RD_RETURN_IN: "退回主仓入库",
  REVERSAL_IN: "逆操作入库",
  REVERSAL_OUT: "逆操作出库",
};

const workshopLabel = computed(
  () => userStore.stockScope?.stockScopeName || "研发小仓",
);

function getDefaultBizDateRange() {
  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - 30);
  return [formatDateOnly(start), formatDateOnly(end)];
}

function getOperationTypeLabel(value) {
  return operationTypeLabels[value] || value || "-";
}

function getDocumentTypeLabel(value) {
  return (
    documentTypeOptions.find((item) => item.value === value)?.label ||
    value ||
    "-"
  );
}

function formatSignedChangeQty(row) {
  const quantity = formatQty(row.changeQty);
  if (quantity === "-" || quantity.startsWith("-")) {
    return quantity;
  }
  return row.direction === "OUT" ? `-${quantity}` : `+${quantity}`;
}

function goToInboundResult(documentNo) {
  router.push({ path: "/rd/inbound-results", query: { documentNo } });
}

function handleMaterialFocus() {
  if (materialOptions.value.length === 0 && !materialLoading.value) {
    searchMaterials("");
  }
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
  } catch {
    // Interceptor already toasts the error.
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
      businessDocumentNumber:
        filters.value.businessDocumentNumber.trim() || undefined,
      bizDateFrom: bizDateRange.value?.[0] || undefined,
      bizDateTo: bizDateRange.value?.[1] || undefined,
      limit: pageSize.value,
      offset: (pageNum.value - 1) * pageSize.value,
    });
    rows.value = response.data?.items || [];
    total.value = response.data?.total || 0;
  } catch {
    // Interceptor already toasts the error.
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
    businessDocumentNumber: "",
  };
  bizDateRange.value = getDefaultBizDateRange();
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

.qty-in {
  color: var(--el-color-success);
}

.qty-out {
  color: var(--el-color-danger);
}

.pagination-wrap {
  display: flex;
  justify-content: flex-end;
  margin-top: 16px;
}
</style>
