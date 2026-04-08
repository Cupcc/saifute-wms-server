<template>
  <div class="app-container">
    <el-card shadow="never">
      <template #header>
        <div class="page-header">
          <div>研发项目领用</div>
          <el-tag type="success">{{ workshopLabel }}</el-tag>
        </div>
      </template>

      <el-form :inline="true" class="query-form">
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
            placeholder="请输入项目名称"
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
        <el-button type="primary" @click="openCreateDialog">新增项目领用</el-button>
      </div>

      <el-table :data="rows" stripe v-loading="loading">
        <el-table-column prop="projectCode" label="项目编码" min-width="170">
          <template #default="{ row }">
            <el-button link type="primary" @click="openDetail(row.id)">
              {{ row.projectCode }}
            </el-button>
          </template>
        </el-table-column>
        <el-table-column prop="projectName" label="项目名称" min-width="180" />
        <el-table-column label="业务日期" min-width="120">
          <template #default="{ row }">
            {{ formatDate(row.bizDate) }}
          </template>
        </el-table-column>
        <el-table-column prop="totalQty" label="总数量" min-width="120" />
        <el-table-column prop="totalAmount" label="总金额" min-width="120" />
        <el-table-column label="物料行数" min-width="100">
          <template #default="{ row }">
            {{ row.materialLines?.length || 0 }}
          </template>
        </el-table-column>
        <el-table-column prop="remark" label="备注" min-width="180" />
        <el-table-column label="操作" width="140" fixed="right">
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

    <el-dialog v-model="createOpen" title="新增项目领用" width="1000px">
      <el-form label-width="100px" class="create-form">
        <el-row :gutter="16">
          <el-col :span="12">
            <el-form-item label="项目编码">
              <el-input v-model="form.projectCode" />
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
            <el-form-item label="项目名称">
              <el-input v-model="form.projectName" placeholder="请输入项目名称或归集项名称" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="研发仓别">
              <el-input :model-value="workshopLabel" disabled />
            </el-form-item>
          </el-col>
        </el-row>
        <el-form-item label="备注">
          <el-input v-model="form.remark" type="textarea" :rows="3" />
        </el-form-item>

        <div class="line-toolbar">
          <div class="section-title">物料明细</div>
          <el-button type="primary" plain @click="addLine">添加明细</el-button>
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
          <el-table-column label="数量" min-width="140">
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
          <el-table-column label="单价" min-width="140">
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

    <el-dialog v-model="detailOpen" title="项目领用详情" width="1000px">
      <template v-if="detailRow">
        <el-descriptions :column="2" border class="detail-descriptions">
          <el-descriptions-item label="项目编码">
            {{ detailRow.projectCode }}
          </el-descriptions-item>
          <el-descriptions-item label="项目名称">
            {{ detailRow.projectName }}
          </el-descriptions-item>
          <el-descriptions-item label="业务日期">
            {{ formatDate(detailRow.bizDate) }}
          </el-descriptions-item>
          <el-descriptions-item label="关联车间">
            {{ detailRow.workshopNameSnapshot }}
          </el-descriptions-item>
          <el-descriptions-item label="总数量">
            {{ detailRow.totalQty }}
          </el-descriptions-item>
          <el-descriptions-item label="总金额">
            {{ detailRow.totalAmount }}
          </el-descriptions-item>
          <el-descriptions-item label="备注" :span="2">
            {{ detailRow.remark || "-" }}
          </el-descriptions-item>
        </el-descriptions>

        <el-table :data="detailRow.materialLines || []" stripe class="detail-table">
          <el-table-column prop="lineNo" label="行号" width="80" />
          <el-table-column prop="materialCodeSnapshot" label="物料编码" min-width="140" />
          <el-table-column prop="materialNameSnapshot" label="物料名称" min-width="180" />
          <el-table-column prop="materialSpecSnapshot" label="规格型号" min-width="140" />
          <el-table-column prop="quantity" label="数量" min-width="100" />
          <el-table-column prop="unitPrice" label="单价" min-width="100" />
          <el-table-column prop="amount" label="金额" min-width="100" />
          <el-table-column prop="remark" label="备注" min-width="160" />
        </el-table>
      </template>
    </el-dialog>
  </div>
</template>

<script setup name="RdProjectConsumptionPage">
import { ElMessage, ElMessageBox } from "element-plus";
import { computed, onMounted, ref } from "vue";
import {
  createRdProject,
  getRdProject,
  listRdMaterials,
  listRdProjects,
  voidRdProject,
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
  projectCode: "",
  projectName: "",
});
const form = ref(createEmptyForm());

const workshopLabel = computed(
  () => userStore.stockScope?.stockScopeName || "未绑定研发小仓",
);

function createEmptyForm() {
  return {
    projectCode: generateRdDocumentNo("RDPRJ"),
    projectName: "",
    bizDate: formatDateOnly(),
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

async function loadRows() {
  loading.value = true;
  try {
    const response = await listRdProjects({
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
  if (!userStore.stockScope?.stockScope) {
    ElMessage.error("当前账号未绑定研发库存范围，无法创建领用单");
    return;
  }
  if (!userStore.workshopScope?.workshopId) {
    ElMessage.error("当前账号未绑定业务车间，无法创建领用单");
    return;
  }
  form.value = createEmptyForm();
  createOpen.value = true;
}

async function openDetail(projectId) {
  const response = await getRdProject(projectId);
  detailRow.value = response.data || null;
  detailOpen.value = true;
}

function validateForm() {
  if (
    !form.value.projectCode ||
    !form.value.projectName ||
    !form.value.bizDate
  ) {
    ElMessage.error("请先填写完整的项目头信息");
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
    await createRdProject({
      projectCode: form.value.projectCode,
      projectName: form.value.projectName,
      bizDate: form.value.bizDate,
      workshopId: userStore.workshopScope.workshopId,
      remark: form.value.remark || undefined,
      lines: form.value.lines.map((line) => ({
        materialId: line.materialId,
        quantity: String(line.quantity),
        unitPrice: String(line.unitPrice || 0),
        remark: line.remark || undefined,
      })),
    });
    ElMessage.success("项目领用已创建");
    createOpen.value = false;
    loadRows();
  } finally {
    submitting.value = false;
  }
}

async function handleVoid(projectId) {
  try {
    const result = await ElMessageBox.prompt("请输入作废原因", "作废项目领用", {
      confirmButtonText: "确认",
      cancelButtonText: "取消",
      inputValue: "研发小仓作废",
    });
    await voidRdProject(projectId, {
      voidReason: result.value,
    });
    ElMessage.success("项目领用已作废");
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
</style>
