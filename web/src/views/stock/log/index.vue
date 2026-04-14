<template>
  <div class="app-container">
    <el-card shadow="never">
      <template #header>
        <div class="page-header">
          <div>
            <div class="page-title">库存日志</div>
            <div class="page-subtitle">只展示真实库存流水，不再兼容旧库存日志字段</div>
          </div>
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
              :key="item.materialId"
              :label="formatMaterialOption(item)"
              :value="item.materialId"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="库存范围">
          <el-select
            v-model="filters.stockScope"
            clearable
            filterable
            placeholder="请选择库存范围"
            style="width: 180px"
          >
            <el-option
              v-for="item in stockScopeOptions"
              :key="item.value"
              :label="item.label"
              :value="item.value"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="车间">
          <el-select
            v-model="filters.workshopId"
            filterable
            remote
            reserve-keyword
            clearable
            placeholder="请输入车间名称"
            :remote-method="searchWorkshops"
            :loading="workshopLoading"
            style="width: 220px"
          >
            <el-option
              v-for="item in workshopOptions"
              :key="item.workshopId"
              :label="item.workshopName"
              :value="item.workshopId"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="单据类型">
          <el-select
            v-model="filters.businessDocumentType"
            clearable
            filterable
            placeholder="请选择单据类型"
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
        <el-table-column prop="occurredAt" label="发生时间" min-width="180">
          <template #default="{ row }">
            {{ formatDateTime(row.occurredAt) }}
          </template>
        </el-table-column>
        <el-table-column prop="bizDate" label="业务日期" min-width="120">
          <template #default="{ row }">
            {{ formatDate(row.bizDate) }}
          </template>
        </el-table-column>
        <el-table-column label="物料" min-width="240">
          <template #default="{ row }">
            <div>{{ row.material?.materialCode }} {{ row.material?.materialName }}</div>
            <div class="subtext">{{ row.material?.specModel || "-" }}</div>
          </template>
        </el-table-column>
        <el-table-column label="库存范围" min-width="120">
          <template #default="{ row }">
            {{ getStockScopeLabel(row.stockScope) }}
          </template>
        </el-table-column>
        <el-table-column label="车间" min-width="140">
          <template #default="{ row }">
            {{ row.workshop?.workshopName || "-" }}
          </template>
        </el-table-column>
        <el-table-column prop="direction" label="方向" min-width="100">
          <template #default="{ row }">
            <el-tag :type="row.direction === 'IN' ? 'success' : 'danger'">
              {{ row.direction === "IN" ? "入库" : "出库" }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="beforeQty" label="变动前" min-width="120" />
        <el-table-column prop="changeQty" label="变动数量" min-width="120">
          <template #default="{ row }">
            <span :class="row.direction === 'IN' ? 'qty-in' : 'qty-out'">
              {{ formatChangeQty(row) }}
            </span>
          </template>
        </el-table-column>
        <el-table-column prop="afterQty" label="变动后" min-width="120" />
        <el-table-column label="操作类型" min-width="180">
          <template #default="{ row }">
            <div>{{ getOperationTypeLabel(row.operationType) }}</div>
            <div class="subtext">{{ row.operationType || "-" }}</div>
          </template>
        </el-table-column>
        <el-table-column
          label="单据类型"
          min-width="180"
        >
          <template #default="{ row }">
            <div>{{ getDocumentTypeLabel(row) }}</div>
            <div class="subtext">{{ row.businessDocumentType || "-" }}</div>
          </template>
        </el-table-column>
        <el-table-column label="单据编号" min-width="200">
          <template #default="{ row }">
            <div>{{ row.businessDocumentNumber || "-" }}</div>
          </template>
        </el-table-column>
        <el-table-column label="业务模块" min-width="140">
          <template #default="{ row }">
            {{ getBusinessModuleLabel(row.businessModule) }}
          </template>
        </el-table-column>
        <el-table-column prop="operatorId" label="操作人" min-width="140" />
        <el-table-column prop="note" label="备注" min-width="220" show-overflow-tooltip />
      </el-table>

      <div class="pagination-wrap">
        <el-pagination
          background
          layout="total, sizes, prev, pager, next"
          :current-page="pageNum"
          :page-size="pageSize"
          :page-sizes="[10, 20, 50, 100]"
          :total="total"
          @current-change="handlePageChange"
          @size-change="handleSizeChange"
        />
      </div>
    </el-card>
  </div>
</template>

<script setup name="StockLogPage">
import { onMounted, ref } from "vue";
import { listMaterialByCodeOrName } from "@/api/base/material";
import { listWorkshop } from "@/api/base/workshop";
import { listLog } from "@/api/stock/log";

const stockScopeOptions = [
  { value: "MAIN", label: "主仓" },
  { value: "RD_SUB", label: "研发小仓" },
];
const documentTypeOptions = [
  { value: "StockInOrder", label: "入库单据（验收 / 生产）" },
  { value: "SalesStockOrder", label: "销售单据（出库 / 退货）" },
  { value: "WorkshopMaterialOrder", label: "车间物料单据（领料 / 退料 / 报废）" },
  { value: "RdProjectMaterialAction", label: "项目物料单据（领用 / 退回 / 报废）" },
  { value: "RdHandoffOrder", label: "RD 交接单" },
  { value: "RdStocktakeOrder", label: "RD 盘点调整单" },
  { value: "StockInPriceCorrectionOrder", label: "入库调价单" },
];
const businessModuleLabels = {
  inbound: "入库",
  sales: "销售",
  "workshop-material": "车间物料",
  "rd-project": "研发项目",
  "rd-subwarehouse": "研发小仓",
};
const operationTypeOptions = [
  { value: "ACCEPTANCE_IN", label: "验收入库" },
  { value: "PRODUCTION_RECEIPT_IN", label: "生产入库" },
  { value: "PRICE_CORRECTION_IN", label: "调价入库" },
  { value: "OUTBOUND_OUT", label: "销售出库" },
  { value: "PRICE_CORRECTION_OUT", label: "调价出库" },
  { value: "SALES_RETURN_IN", label: "销售退货入库" },
  { value: "PICK_OUT", label: "领料出库" },
  { value: "RETURN_IN", label: "退料入库" },
  { value: "SCRAP_OUT", label: "报废出库" },
  { value: "RD_PROJECT_OUT", label: "项目领用出库" },
  { value: "RD_HANDOFF_OUT", label: "RD 交接出库" },
  { value: "RD_HANDOFF_IN", label: "RD 交接入库" },
  { value: "RD_STOCKTAKE_IN", label: "RD 盘点入库" },
  { value: "RD_STOCKTAKE_OUT", label: "RD 盘点出库" },
  { value: "REVERSAL_IN", label: "逆操作入库" },
  { value: "REVERSAL_OUT", label: "逆操作出库" },
];

const loading = ref(false);
const materialLoading = ref(false);
const workshopLoading = ref(false);
const rows = ref([]);
const total = ref(0);
const pageNum = ref(1);
const pageSize = ref(20);
const materialOptions = ref([]);
const workshopOptions = ref([]);
const bizDateRange = ref([]);
const filters = ref({
  materialId: null,
  stockScope: "",
  workshopId: null,
  businessDocumentType: "",
  businessDocumentNumber: "",
});

function formatMaterialOption(item) {
  return [
    item.materialCode,
    item.materialName,
    item.specification || item.specModel || "",
  ]
    .filter(Boolean)
    .join(" ");
}

function formatDateTime(value) {
  if (!value) {
    return "-";
  }
  return new Date(value).toLocaleString("zh-CN", { hour12: false });
}

function formatDate(value) {
  if (!value) {
    return "-";
  }
  return String(value).slice(0, 10);
}

function getStockScopeLabel(value) {
  return (
    stockScopeOptions.find((item) => item.value === value)?.label || value || "-"
  );
}

function getOperationTypeLabel(value) {
  return (
    operationTypeOptions.find((item) => item.value === value)?.label ||
    value ||
    "-"
  );
}

function getBusinessModuleLabel(value) {
  return businessModuleLabels[value] || value || "-";
}

function getDocumentTypeLabel(row) {
  switch (row.businessDocumentType) {
    case "StockInOrder":
      return row.operationType === "PRODUCTION_RECEIPT_IN"
        ? "生产入库单"
        : "验收单";
    case "SalesStockOrder":
      return row.operationType === "SALES_RETURN_IN"
        ? "销售退货单"
        : "销售出库单";
    case "WorkshopMaterialOrder":
      if (row.operationType === "RETURN_IN") {
        return "退料单";
      }
      if (row.operationType === "SCRAP_OUT") {
        return "报废单";
      }
      return "领料单";
    case "RdProjectMaterialAction":
      if (row.operationType === "RETURN_IN") {
        return "项目退回单";
      }
      if (row.operationType === "SCRAP_OUT") {
        return "项目报废单";
      }
      return "项目领用单";
    case "RdHandoffOrder":
      return "RD 交接单";
    case "RdStocktakeOrder":
      return "RD 盘点调整单";
    case "StockInPriceCorrectionOrder":
      return "入库调价单";
    default:
      return row.businessDocumentType || "-";
  }
}

function formatChangeQty(row) {
  const quantity = String(row.changeQty ?? "0");
  return row.direction === "OUT" && !quantity.startsWith("-")
    ? `-${quantity}`
    : quantity;
}

function mergeWorkshopOptions(items) {
  const next = new Map(
    workshopOptions.value.map((item) => [item.workshopId, item]),
  );
  for (const item of items) {
    if (!item?.workshopId || !item?.workshopName) {
      continue;
    }
    next.set(item.workshopId, item);
  }
  workshopOptions.value = Array.from(next.values()).sort((left, right) =>
    String(left.workshopName).localeCompare(String(right.workshopName), "zh-CN"),
  );
}

async function searchMaterials(keyword) {
  materialLoading.value = true;
  try {
    const response = await listMaterialByCodeOrName({
      materialCode: keyword || undefined,
      workshopId: filters.value.workshopId || undefined,
      pageSize: 20,
      pageNum: 1,
    });
    materialOptions.value = response.rows || [];
  } finally {
    materialLoading.value = false;
  }
}

async function searchWorkshops(keyword) {
  workshopLoading.value = true;
  try {
    const response = await listWorkshop({
      workshopName: keyword || undefined,
      pageNum: 1,
      pageSize: 100,
    });
    mergeWorkshopOptions(response.rows || []);
  } catch {
    // Ignore workshop option preload failures; the log query itself remains usable.
  } finally {
    workshopLoading.value = false;
  }
}

async function loadRows() {
  loading.value = true;
  try {
    const response = await listLog({
      materialId: filters.value.materialId || undefined,
      stockScope: filters.value.stockScope || undefined,
      workshopId: filters.value.workshopId || undefined,
      businessDocumentType: filters.value.businessDocumentType || undefined,
      businessDocumentNumber:
        filters.value.businessDocumentNumber.trim() || undefined,
      bizDateFrom: bizDateRange.value[0] || undefined,
      bizDateTo: bizDateRange.value[1] || undefined,
      limit: pageSize.value,
      offset: (pageNum.value - 1) * pageSize.value,
    });
    rows.value = response.data?.items || [];
    total.value = Number(response.data?.total || 0);
    mergeWorkshopOptions(
      rows.value.map((row) => ({
        workshopId: row.workshop?.id,
        workshopName: row.workshop?.workshopName,
      })),
    );
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
    stockScope: "",
    workshopId: null,
    businessDocumentType: "",
    businessDocumentNumber: "",
  };
  bizDateRange.value = [];
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
  searchWorkshops("");
  loadRows();
});
</script>

<style scoped lang="scss">
.page-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.page-title {
  font-size: 16px;
  font-weight: 600;
}

.page-subtitle {
  margin-top: 4px;
  color: var(--el-text-color-secondary);
  font-size: 12px;
}

.query-form {
  margin-bottom: 16px;
}

.subtext {
  color: var(--el-text-color-secondary);
  font-size: 12px;
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
