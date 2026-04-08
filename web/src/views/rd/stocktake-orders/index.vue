<template>
  <div class="app-container">
    <el-card shadow="never">
      <template #header>
        <div class="page-header">
          <div>
            <div class="page-title">研发盘点调整</div>
            <div class="page-subtitle">
              账面数与实盘数同单闭环，库存写入仍统一走 inventory-core
            </div>
          </div>
          <el-tag type="success">{{ workshopLabel }}</el-tag>
        </div>
      </template>

      <el-form :inline="true" class="query-form">
        <el-form-item label="单据编号">
          <el-input
            v-model="filters.documentNo"
            clearable
            placeholder="请输入盘点单号"
            style="width: 240px"
            @keyup.enter="handleSearch"
          />
        </el-form-item>
        <el-form-item>
          <el-button type="primary" @click="handleSearch">查询</el-button>
          <el-button @click="handleReset">重置</el-button>
        </el-form-item>
      </el-form>

      <div class="toolbar">
        <el-button
          type="primary"
          v-hasPermi="['rd:stocktake-order:create']"
          @click="openCreateDialog"
        >
          新增盘点调整单
        </el-button>
      </div>

      <el-table :data="rows" stripe v-loading="loading">
        <el-table-column prop="documentNo" label="单据编号" min-width="180">
          <template #default="{ row }">
            <el-button link type="primary" @click="openDetail(row.id)">
              {{ row.documentNo }}
            </el-button>
          </template>
        </el-table-column>
        <el-table-column label="业务日期" min-width="120">
          <template #default="{ row }">
            {{ formatDate(row.bizDate) }}
          </template>
        </el-table-column>
        <el-table-column prop="totalBookQty" label="账面总数" min-width="120" />
        <el-table-column prop="totalCountQty" label="实盘总数" min-width="120" />
        <el-table-column
          prop="totalAdjustmentQty"
          label="调整差异"
          min-width="120"
        />
        <el-table-column label="明细数" min-width="100">
          <template #default="{ row }">
            {{ row.lines?.length || 0 }}
          </template>
        </el-table-column>
        <el-table-column prop="remark" label="备注" min-width="200" />
        <el-table-column label="操作" width="140" fixed="right">
          <template #default="{ row }">
            <el-button link type="primary" @click="openDetail(row.id)">
              详情
            </el-button>
            <el-button
              link
              type="danger"
              v-hasPermi="['rd:stocktake-order:void']"
              @click="handleVoid(row.id)"
            >
              作废
            </el-button>
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

    <el-dialog v-model="createOpen" title="新增研发盘点调整单" width="1080px">
      <el-form label-width="100px">
        <el-row :gutter="16">
          <el-col :span="12">
            <el-form-item label="单据编号">
              <el-input v-model="form.documentNo" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="业务日期">
              <el-date-picker
                v-model="form.bizDate"
                type="date"
                value-format="YYYY-MM-DD"
                style="width: 100%"
              />
            </el-form-item>
          </el-col>
        </el-row>
        <el-row :gutter="16">
          <el-col :span="12">
            <el-form-item label="盘点人">
              <el-input v-model="form.countedBy" placeholder="请输入盘点人" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="复核人">
              <el-input v-model="form.approvedBy" placeholder="请输入复核人" />
            </el-form-item>
          </el-col>
        </el-row>
        <el-row :gutter="16">
          <el-col :span="12">
            <el-form-item label="研发仓别">
              <el-input :model-value="workshopLabel" disabled />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="备注">
              <el-input v-model="form.remark" type="textarea" :rows="2" />
            </el-form-item>
          </el-col>
        </el-row>

        <div class="line-toolbar">
          <div class="section-title">盘点明细</div>
          <el-button
            type="primary"
            plain
            v-hasPermi="['rd:stocktake-order:create']"
            @click="addLine"
          >
            添加明细
          </el-button>
        </div>

        <el-table :data="form.lines" border stripe>
          <el-table-column label="物料" min-width="260">
            <template #default="{ row }">
              <el-select
                v-model="row.materialId"
                filterable
                remote
                reserve-keyword
                clearable
                placeholder="请输入物料编码或名称"
                :remote-method="searchMaterials"
                :loading="materialLoading"
                style="width: 100%"
                @change="() => syncBookQty(row)"
              >
                <el-option
                  v-for="item in materialOptions"
                  :key="item.id"
                  :label="`${item.materialCode} ${item.materialName}`"
                  :value="item.id"
                />
              </el-select>
            </template>
          </el-table-column>
          <el-table-column label="账面数" min-width="120">
            <template #default="{ row }">
              <span>{{ formatQty(row.bookQty) }}</span>
            </template>
          </el-table-column>
          <el-table-column label="实盘数" min-width="140">
            <template #default="{ row }">
              <el-input-number
                v-model="row.countedQty"
                :min="0"
                :precision="6"
                controls-position="right"
                style="width: 100%"
              />
            </template>
          </el-table-column>
          <el-table-column label="差异" min-width="120">
            <template #default="{ row }">
              <span :class="differenceClass(getAdjustmentQty(row))">
                {{ formatSignedQty(getAdjustmentQty(row)) }}
              </span>
            </template>
          </el-table-column>
          <el-table-column label="原因" min-width="220">
            <template #default="{ row }">
              <el-input
                v-model="row.reason"
                placeholder="请填写盘点调整原因"
              />
            </template>
          </el-table-column>
          <el-table-column label="备注" min-width="180">
            <template #default="{ row }">
              <el-input v-model="row.remark" />
            </template>
          </el-table-column>
          <el-table-column label="操作" width="90">
            <template #default="{ $index }">
              <el-button link type="danger" @click="removeLine($index)">
                删除
              </el-button>
            </template>
          </el-table-column>
        </el-table>
      </el-form>

      <template #footer>
        <el-button @click="createOpen = false">取消</el-button>
        <el-button
          type="primary"
          v-hasPermi="['rd:stocktake-order:create']"
          :loading="submitting"
          @click="submitCreate"
        >
          提交
        </el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="detailOpen" title="研发盘点调整详情" width="1080px">
      <template v-if="detailRow">
        <el-descriptions :column="2" border class="detail-descriptions">
          <el-descriptions-item label="单据编号">
            {{ detailRow.documentNo }}
          </el-descriptions-item>
          <el-descriptions-item label="业务日期">
            {{ formatDate(detailRow.bizDate) }}
          </el-descriptions-item>
          <el-descriptions-item label="账面总数">
            {{ detailRow.totalBookQty }}
          </el-descriptions-item>
          <el-descriptions-item label="实盘总数">
            {{ detailRow.totalCountQty }}
          </el-descriptions-item>
          <el-descriptions-item label="调整差异">
            {{ detailRow.totalAdjustmentQty }}
          </el-descriptions-item>
          <el-descriptions-item label="盘点人">
            {{ detailRow.countedBy || "-" }}
          </el-descriptions-item>
          <el-descriptions-item label="复核人">
            {{ detailRow.approvedBy || "-" }}
          </el-descriptions-item>
          <el-descriptions-item label="备注">
            {{ detailRow.remark || "-" }}
          </el-descriptions-item>
        </el-descriptions>

        <el-table :data="detailRow.lines || []" stripe class="detail-table">
          <el-table-column prop="lineNo" label="行号" width="80" />
          <el-table-column prop="materialCodeSnapshot" label="物料编码" min-width="140" />
          <el-table-column prop="materialNameSnapshot" label="物料名称" min-width="180" />
          <el-table-column prop="bookQty" label="账面数" min-width="110" />
          <el-table-column prop="countedQty" label="实盘数" min-width="110" />
          <el-table-column prop="adjustmentQty" label="差异" min-width="110" />
          <el-table-column label="库存前后" min-width="180">
            <template #default="{ row }">
              <span v-if="row.inventoryLog">
                {{ row.inventoryLog.beforeQty }} -> {{ row.inventoryLog.afterQty }}
              </span>
              <span v-else>一致，无调账</span>
            </template>
          </el-table-column>
          <el-table-column prop="reason" label="原因" min-width="180" />
          <el-table-column prop="remark" label="备注" min-width="160" />
        </el-table>
      </template>
    </el-dialog>
  </div>
</template>

<script setup name="RdStocktakeOrdersPage">
import { ElMessage, ElMessageBox } from "element-plus";
import { computed, onMounted, ref } from "vue";
import {
  createRdStocktakeOrder,
  getRdStocktakeOrder,
  listRdInventoryBalances,
  listRdMaterials,
  listRdStocktakeOrders,
  voidRdStocktakeOrder,
} from "@/api/rd-subwarehouse";
import useUserStore from "@/store/modules/user";
import { formatDateOnly, generateRdDocumentNo } from "@/utils/rd-documents";

const userStore = useUserStore();
const loading = ref(false);
const submitting = ref(false);
const materialLoading = ref(false);
const rows = ref([]);
const total = ref(0);
const pageNum = ref(1);
const pageSize = ref(10);
const materialOptions = ref([]);
const createOpen = ref(false);
const detailOpen = ref(false);
const detailRow = ref(null);
const filters = ref({
  documentNo: "",
});
const form = ref(createEmptyForm());

const workshopLabel = computed(
  () => userStore.stockScope?.stockScopeName || "未绑定研发小仓",
);

function createEmptyLine() {
  return {
    materialId: null,
    bookQty: 0,
    countedQty: 0,
    reason: "盘点调整",
    remark: "",
  };
}

function createEmptyForm() {
  return {
    documentNo: generateRdDocumentNo("RDST"),
    bizDate: formatDateOnly(),
    countedBy: "",
    approvedBy: "",
    remark: "",
    lines: [createEmptyLine()],
  };
}

function formatDate(value) {
  if (!value) {
    return "-";
  }
  return new Date(value).toLocaleDateString("zh-CN");
}

function formatQty(value) {
  return Number(value || 0).toFixed(6);
}

function formatSignedQty(value) {
  const amount = Number(value || 0);
  return `${amount > 0 ? "+" : ""}${amount.toFixed(6)}`;
}

function getAdjustmentQty(row) {
  return Number(row.countedQty || 0) - Number(row.bookQty || 0);
}

function differenceClass(value) {
  if (Number(value || 0) > 0) {
    return "qty-positive";
  }
  if (Number(value || 0) < 0) {
    return "qty-negative";
  }
  return "qty-neutral";
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

async function fetchBookQty(materialId) {
  if (!materialId) {
    return 0;
  }
  const response = await listRdInventoryBalances({
    materialId,
    limit: 1,
    offset: 0,
  });
  const row = response.data?.items?.[0];
  return Number(row?.quantityOnHand || 0);
}

async function syncBookQty(row) {
  row.bookQty = await fetchBookQty(row.materialId);
}

async function loadRows() {
  loading.value = true;
  try {
    const response = await listRdStocktakeOrders({
      documentNo: filters.value.documentNo || undefined,
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

function addLine() {
  form.value.lines.push(createEmptyLine());
}

function removeLine(index) {
  form.value.lines.splice(index, 1);
  if (form.value.lines.length === 0) {
    form.value.lines.push(createEmptyLine());
  }
}

function openCreateDialog() {
  if (!userStore.stockScope?.stockScope) {
    ElMessage.error("当前账号未绑定研发库存范围，无法创建盘点调整单");
    return;
  }
  if (!userStore.workshopScope?.workshopId) {
    ElMessage.error("当前账号未绑定业务车间，无法创建盘点调整单");
    return;
  }
  form.value = createEmptyForm();
  createOpen.value = true;
}

async function openDetail(orderId) {
  const response = await getRdStocktakeOrder(orderId);
  detailRow.value = response.data || null;
  detailOpen.value = true;
}

function validateForm() {
  if (!form.value.documentNo || !form.value.bizDate) {
    ElMessage.error("请先填写完整的盘点单头信息");
    return false;
  }
  if (!Array.isArray(form.value.lines) || form.value.lines.length === 0) {
    ElMessage.error("至少需要一条盘点明细");
    return false;
  }
  const seenMaterialIds = new Set();

  for (let index = 0; index < form.value.lines.length; index += 1) {
    const line = form.value.lines[index];
    if (!line.materialId) {
      ElMessage.error(`第 ${index + 1} 行物料不能为空`);
      return false;
    }
    if (seenMaterialIds.has(line.materialId)) {
      ElMessage.error(`第 ${index + 1} 行物料重复，请同一物料只保留一行`);
      return false;
    }
    seenMaterialIds.add(line.materialId);
    if (Number(line.countedQty) < 0) {
      ElMessage.error(`第 ${index + 1} 行实盘数不能小于 0`);
      return false;
    }
    if (!String(line.reason || "").trim()) {
      ElMessage.error(`第 ${index + 1} 行必须填写调整原因`);
      return false;
    }
  }

  return true;
}

async function submitCreate() {
  if (!validateForm()) {
    return;
  }

  submitting.value = true;
  try {
    await createRdStocktakeOrder({
      documentNo: form.value.documentNo,
      bizDate: form.value.bizDate,
      workshopId: userStore.workshopScope.workshopId,
      countedBy: form.value.countedBy || undefined,
      approvedBy: form.value.approvedBy || undefined,
      remark: form.value.remark || undefined,
      lines: form.value.lines.map((line) => ({
        materialId: line.materialId,
        countedQty: String(line.countedQty || 0),
        reason: line.reason,
        remark: line.remark || undefined,
      })),
    });
    ElMessage.success("研发盘点调整单已创建");
    createOpen.value = false;
    loadRows();
  } finally {
    submitting.value = false;
  }
}

async function handleVoid(orderId) {
  try {
    const result = await ElMessageBox.prompt(
      "请输入作废原因",
      "作废研发盘点调整单",
      {
        confirmButtonText: "确认",
        cancelButtonText: "取消",
        inputValue: "研发盘点调整作废",
      },
    );
    await voidRdStocktakeOrder(orderId, {
      voidReason: result.value,
    });
    ElMessage.success("研发盘点调整单已作废");
    loadRows();
  } catch {
    // User cancelled.
  }
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
  gap: 12px;
}

.page-title {
  font-size: 20px;
  font-weight: 600;
}

.page-subtitle {
  margin-top: 6px;
  color: #909399;
  font-size: 13px;
}

.query-form {
  margin-bottom: 16px;
}

.toolbar {
  margin-bottom: 16px;
}

.line-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin: 8px 0 12px;
}

.section-title {
  font-size: 15px;
  font-weight: 600;
}

.pagination-wrap {
  display: flex;
  justify-content: flex-end;
  margin-top: 16px;
}

.detail-descriptions {
  margin-bottom: 16px;
}

.qty-positive {
  color: #67c23a;
  font-weight: 600;
}

.qty-negative {
  color: #f56c6c;
  font-weight: 600;
}

.qty-neutral {
  color: #909399;
}
</style>
