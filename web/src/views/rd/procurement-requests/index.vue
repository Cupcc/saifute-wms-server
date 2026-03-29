<template>
  <div class="app-container">
    <el-card shadow="never">
      <template #header>
        <div class="page-header">
          <div>
            <div class="page-title">研发采购需求</div>
            <div class="page-subtitle">
              先形成 RD 采购真源，主仓验收只做关联并仍然先入主仓
            </div>
          </div>
          <el-tag type="success">{{ workshopLabel }}</el-tag>
        </div>
      </template>

      <el-form :inline="true" class="query-form">
        <el-form-item label="需求单号">
          <el-input
            v-model="filters.documentNo"
            clearable
            placeholder="请输入需求单号"
            style="width: 220px"
            @keyup.enter="handleSearch"
          />
        </el-form-item>
        <el-form-item label="项目编码">
          <el-input
            v-model="filters.projectCode"
            clearable
            placeholder="请输入项目编码"
            style="width: 220px"
            @keyup.enter="handleSearch"
          />
        </el-form-item>
        <el-form-item label="项目名称">
          <el-input
            v-model="filters.projectName"
            clearable
            placeholder="请输入项目名称或归集项"
            style="width: 220px"
            @keyup.enter="handleSearch"
          />
        </el-form-item>
        <el-form-item>
          <el-button type="primary" @click="handleSearch">查询</el-button>
          <el-button @click="handleReset">重置</el-button>
        </el-form-item>
      </el-form>

      <div class="toolbar">
        <el-button v-if="canCreate" type="primary" @click="openCreateDialog">
          新增采购需求
        </el-button>
      </div>

      <el-table :data="rows" stripe v-loading="loading">
        <el-table-column prop="documentNo" label="需求单号" min-width="180">
          <template #default="{ row }">
            <el-button link type="primary" @click="openDetail(row.id)">
              {{ row.documentNo }}
            </el-button>
          </template>
        </el-table-column>
        <el-table-column prop="projectCode" label="项目编码" min-width="140" />
        <el-table-column prop="projectName" label="项目名称" min-width="180" />
        <el-table-column label="业务日期" min-width="120">
          <template #default="{ row }">
            {{ formatDate(row.bizDate) }}
          </template>
        </el-table-column>
        <el-table-column prop="supplierNameSnapshot" label="供应商" min-width="180" />
        <el-table-column prop="totalQty" label="总数量" min-width="110" />
        <el-table-column prop="totalAmount" label="总金额" min-width="110" />
        <el-table-column label="已关联合格验收" min-width="140">
          <template #default="{ row }">
            {{ row.acceptanceOrders?.length || 0 }}
          </template>
        </el-table-column>
        <el-table-column prop="remark" label="备注" min-width="200" />
        <el-table-column v-if="canCreate" label="操作" width="120" fixed="right">
          <template #default="{ row }">
            <el-button link type="primary" @click="openDetail(row.id)">详情</el-button>
            <el-button link type="danger" @click="handleVoid(row.id)">作废</el-button>
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

    <el-dialog v-model="createOpen" title="新增研发采购需求" width="1100px">
      <el-form label-width="100px" class="create-form">
        <el-row :gutter="16">
          <el-col :span="12">
            <el-form-item label="需求单号">
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
            <el-form-item label="项目编码">
              <el-input v-model="form.projectCode" placeholder="请输入项目编码" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="项目名称">
              <el-input
                v-model="form.projectName"
                placeholder="请输入项目名称或项目式归集项"
              />
            </el-form-item>
          </el-col>
        </el-row>
        <el-row :gutter="16">
          <el-col :span="12">
            <el-form-item label="供应商">
              <el-select
                v-model="form.supplierId"
                filterable
                remote
                reserve-keyword
                clearable
                placeholder="请输入供应商名称或编码"
                :remote-method="searchSuppliers"
                :loading="supplierLoading"
                style="width: 100%"
              >
                <el-option
                  v-for="item in supplierOptions"
                  :key="item.supplierId"
                  :label="item.supplierName"
                  :value="item.supplierId"
                >
                  <span style="float: left">{{ item.supplierCode }}</span>
                  <span style="float: left; margin-left: 10px">
                    {{ item.supplierName }}
                  </span>
                </el-option>
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="经办人">
              <el-select
                v-model="form.handlerPersonnelId"
                filterable
                remote
                reserve-keyword
                clearable
                placeholder="请输入经办人姓名"
                :remote-method="searchPersonnelOptions"
                :loading="personnelLoading"
                style="width: 100%"
              >
                <el-option
                  v-for="item in personnelOptions"
                  :key="item.personnelId"
                  :label="item.name"
                  :value="item.personnelId"
                />
              </el-select>
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
          <div class="section-title">物料明细</div>
          <el-button type="primary" plain @click="addLine">添加明细</el-button>
        </div>

        <el-table :data="form.lines" border stripe>
          <el-table-column label="物料" min-width="280">
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
          <el-table-column label="需求数量" min-width="140">
            <template #default="{ row }">
              <el-input-number
                v-model="row.quantity"
                :min="0.000001"
                :precision="6"
                controls-position="right"
                style="width: 100%"
              />
            </template>
          </el-table-column>
          <el-table-column label="参考单价" min-width="140">
            <template #default="{ row }">
              <el-input-number
                v-model="row.unitPrice"
                :min="0"
                :precision="2"
                controls-position="right"
                style="width: 100%"
              />
            </template>
          </el-table-column>
          <el-table-column label="小计" min-width="140">
            <template #default="{ row }">
              {{ calculateLineAmount(row) }}
            </template>
          </el-table-column>
          <el-table-column label="备注" min-width="180">
            <template #default="{ row }">
              <el-input v-model="row.remark" />
            </template>
          </el-table-column>
          <el-table-column label="操作" width="90">
            <template #default="{ $index }">
              <el-button link type="danger" @click="removeLine($index)">删除</el-button>
            </template>
          </el-table-column>
        </el-table>
      </el-form>

      <template #footer>
        <el-button @click="createOpen = false">取消</el-button>
        <el-button type="primary" :loading="submitting" @click="submitCreate">
          提交
        </el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="detailOpen" title="研发采购需求详情" width="1100px">
      <template v-if="detailRow">
        <el-descriptions :column="2" border class="detail-descriptions">
          <el-descriptions-item label="需求单号">
            {{ detailRow.documentNo }}
          </el-descriptions-item>
          <el-descriptions-item label="业务日期">
            {{ formatDate(detailRow.bizDate) }}
          </el-descriptions-item>
          <el-descriptions-item label="项目编码">
            {{ detailRow.projectCode }}
          </el-descriptions-item>
          <el-descriptions-item label="项目名称">
            {{ detailRow.projectName }}
          </el-descriptions-item>
          <el-descriptions-item label="供应商">
            {{ detailRow.supplierNameSnapshot || "-" }}
          </el-descriptions-item>
          <el-descriptions-item label="经办人">
            {{ detailRow.handlerNameSnapshot || "-" }}
          </el-descriptions-item>
          <el-descriptions-item label="归属仓别">
            {{ detailRow.workshopNameSnapshot }}
          </el-descriptions-item>
          <el-descriptions-item label="总金额">
            {{ detailRow.totalAmount }}
          </el-descriptions-item>
          <el-descriptions-item label="总数量">
            {{ detailRow.totalQty }}
          </el-descriptions-item>
          <el-descriptions-item label="备注" :span="2">
            {{ detailRow.remark || "-" }}
          </el-descriptions-item>
        </el-descriptions>

        <div class="section-title detail-section">需求明细</div>
        <el-table :data="detailRow.lines || []" stripe>
          <el-table-column prop="lineNo" label="行号" width="80" />
          <el-table-column prop="materialCodeSnapshot" label="物料编码" min-width="140" />
          <el-table-column prop="materialNameSnapshot" label="物料名称" min-width="180" />
          <el-table-column prop="materialSpecSnapshot" label="规格型号" min-width="140" />
          <el-table-column prop="quantity" label="需求数量" min-width="100" />
          <el-table-column prop="unitPrice" label="参考单价" min-width="100" />
          <el-table-column prop="amount" label="金额" min-width="100" />
          <el-table-column prop="remark" label="备注" min-width="160" />
        </el-table>

        <div class="section-title detail-section">已关联主仓验收</div>
        <el-table :data="detailRow.acceptanceOrders || []" stripe>
          <el-table-column prop="documentNo" label="验收单号" min-width="160" />
          <el-table-column label="验收日期" min-width="120">
            <template #default="{ row }">
              {{ formatDate(row.bizDate) }}
            </template>
          </el-table-column>
          <el-table-column prop="supplierNameSnapshot" label="供应商" min-width="160" />
          <el-table-column prop="workshopNameSnapshot" label="入库仓别" min-width="120" />
          <el-table-column prop="totalQty" label="总数量" min-width="100" />
          <el-table-column prop="totalAmount" label="总金额" min-width="100" />
          <el-table-column label="关联行数" min-width="100">
            <template #default="{ row }">
              {{ row.lines?.length || 0 }}
            </template>
          </el-table-column>
          <el-table-column prop="rdProcurementRequestNoSnapshot" label="关联来源" min-width="160" />
        </el-table>
      </template>
    </el-dialog>
  </div>
</template>

<script setup name="RdProcurementRequestsPage">
import { ElMessage, ElMessageBox } from "element-plus";
import { computed, onMounted, ref } from "vue";
import { listPersonnel } from "@/api/base/personnel";
import { listSupplierByKeyword } from "@/api/base/supplier";
import {
  createRdProcurementRequest,
  getRdProcurementRequest,
  listRdMaterials,
  listRdProcurementRequests,
  voidRdProcurementRequest,
} from "@/api/rd-subwarehouse";
import useUserStore from "@/store/modules/user";
import { formatDateOnly, generateRdDocumentNo } from "@/utils/rd-documents";

const userStore = useUserStore();
const loading = ref(false);
const submitting = ref(false);
const materialLoading = ref(false);
const supplierLoading = ref(false);
const personnelLoading = ref(false);
const rows = ref([]);
const total = ref(0);
const pageNum = ref(1);
const pageSize = ref(10);
const materialOptions = ref([]);
const supplierOptions = ref([]);
const personnelOptions = ref([]);
const createOpen = ref(false);
const detailOpen = ref(false);
const detailRow = ref(null);
const filters = ref({
  documentNo: "",
  projectCode: "",
  projectName: "",
});
const form = ref(createEmptyForm());

const workshopLabel = computed(
  () => userStore.workshopScope?.workshopName || "未绑定研发小仓",
);
const canCreate = computed(() => Boolean(userStore.workshopScope?.workshopId));

function createEmptyForm() {
  return {
    documentNo: generateRdDocumentNo("RDPUR"),
    bizDate: formatDateOnly(),
    projectCode: "",
    projectName: "",
    supplierId: null,
    handlerPersonnelId: null,
    remark: "",
    lines: [createEmptyLine()],
  };
}

function createEmptyLine() {
  return {
    materialId: null,
    quantity: 1,
    unitPrice: 0,
    remark: "",
  };
}

function formatDate(value) {
  if (!value) {
    return "-";
  }
  return new Date(value).toLocaleDateString("zh-CN");
}

function calculateLineAmount(row) {
  const quantity = Number(row.quantity || 0);
  const unitPrice = Number(row.unitPrice || 0);
  return (quantity * unitPrice).toFixed(2);
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

async function searchSuppliers(keyword) {
  supplierLoading.value = true;
  try {
    const response = await listSupplierByKeyword(keyword || "");
    supplierOptions.value = response.rows || [];
  } finally {
    supplierLoading.value = false;
  }
}

async function searchPersonnelOptions(keyword) {
  personnelLoading.value = true;
  try {
    const response = await listPersonnel({
      type: 1,
      name: keyword || "",
      pageNum: 1,
      pageSize: 50,
    });
    personnelOptions.value = response.rows || [];
  } finally {
    personnelLoading.value = false;
  }
}

async function loadRows() {
  loading.value = true;
  try {
    const response = await listRdProcurementRequests({
      documentNo: filters.value.documentNo || undefined,
      projectCode: filters.value.projectCode || undefined,
      projectName: filters.value.projectName || undefined,
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
  filters.value.projectCode = "";
  filters.value.projectName = "";
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
  if (!canCreate.value) {
    ElMessage.error("当前账号未绑定研发小仓，无法录入采购需求");
    return;
  }
  form.value = createEmptyForm();
  createOpen.value = true;
}

async function openDetail(requestId) {
  const response = await getRdProcurementRequest(requestId);
  detailRow.value = response.data || null;
  detailOpen.value = true;
}

function validateForm() {
  if (!form.value.documentNo || !form.value.bizDate) {
    ElMessage.error("请先填写完整的需求单头信息");
    return false;
  }
  if (!form.value.projectCode || !form.value.projectName) {
    ElMessage.error("请填写项目编码和项目名称");
    return false;
  }
  if (!Array.isArray(form.value.lines) || form.value.lines.length === 0) {
    ElMessage.error("至少需要一条物料明细");
    return false;
  }

  for (let index = 0; index < form.value.lines.length; index += 1) {
    const line = form.value.lines[index];
    if (!line.materialId) {
      ElMessage.error(`第 ${index + 1} 行物料不能为空`);
      return false;
    }
    if (!line.quantity || Number(line.quantity) <= 0) {
      ElMessage.error(`第 ${index + 1} 行数量必须大于 0`);
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
    await createRdProcurementRequest({
      documentNo: form.value.documentNo,
      bizDate: form.value.bizDate,
      projectCode: form.value.projectCode,
      projectName: form.value.projectName,
      supplierId: form.value.supplierId || undefined,
      handlerPersonnelId: form.value.handlerPersonnelId || undefined,
      workshopId: userStore.workshopScope.workshopId,
      remark: form.value.remark || undefined,
      lines: form.value.lines.map((line) => ({
        materialId: line.materialId,
        quantity: String(line.quantity),
        unitPrice: String(line.unitPrice || 0),
        remark: line.remark || undefined,
      })),
    });
    ElMessage.success("研发采购需求已创建");
    createOpen.value = false;
    loadRows();
  } finally {
    submitting.value = false;
  }
}

async function handleVoid(requestId) {
  try {
    const result = await ElMessageBox.prompt(
      "请输入作废原因",
      "作废研发采购需求",
      {
        confirmButtonText: "确认",
        cancelButtonText: "取消",
        inputValue: "研发采购需求作废",
      },
    );
    await voidRdProcurementRequest(requestId, {
      voidReason: result.value,
    });
    ElMessage.success("研发采购需求已作废");
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

.detail-section {
  margin: 18px 0 10px;
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
