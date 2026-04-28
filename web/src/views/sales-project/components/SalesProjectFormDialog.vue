<template>
  <el-dialog
    v-model="dialogVisible"
    :title="dialogTitle"
    width="1180px"
    append-to-body
    draggable
  >
    <div v-loading="projectFormLoading || projectFormSubmitting" class="sales-project-form-dialog">
      <el-form
        ref="projectFormRef"
        :model="projectForm"
        :rules="projectFormRules"
        label-width="96px"
      >
        <el-row :gutter="16">
          <el-col :span="12">
            <el-form-item label="项目编码" prop="salesProjectCode">
              <el-input
                v-model="projectForm.salesProjectCode"
                maxlength="64"
                placeholder="请输入项目编码"
              />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="项目名称" prop="salesProjectName">
              <el-input
                v-model="projectForm.salesProjectName"
                maxlength="128"
                placeholder="请输入项目名称"
              />
            </el-form-item>
          </el-col>
        </el-row>

        <el-row :gutter="16">
          <el-col :span="12">
            <el-form-item label="业务日期" prop="bizDate">
              <el-date-picker
                v-model="projectForm.bizDate"
                type="date"
                value-format="YYYY-MM-DD"
                placeholder="请选择业务日期"
                style="width: 100%"
              />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="车间" prop="workshopId">
              <el-select
                v-model="projectForm.workshopId"
                filterable
                remote
                reserve-keyword
                clearable
                placeholder="请输入车间名称搜索"
                style="width: 100%"
                :remote-method="searchWorkshops"
                :loading="workshopLoading"
              >
                <el-option
                  v-for="item in workshopOptions"
                  :key="item.workshopId"
                  :label="item.workshopName"
                  :value="item.workshopId"
                />
              </el-select>
            </el-form-item>
          </el-col>
        </el-row>

        <el-row :gutter="16">
          <el-col :span="12">
            <el-form-item label="客户">
              <el-select
                v-model="projectForm.customerId"
                filterable
                remote
                reserve-keyword
                clearable
                placeholder="请输入客户名称搜索"
                style="width: 100%"
                :remote-method="searchCustomers"
                :loading="customerLoading"
              >
                <el-option
                  v-for="item in customerOptions"
                  :key="item.customerId"
                  :label="item.customerName"
                  :value="item.customerId"
                >
                  <span style="float: left">{{ item.customerName }}</span>
                  <span style="float: right; color: #909399">
                    {{ item.customerCode }}
                  </span>
                </el-option>
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="负责人">
              <el-select
                v-model="projectForm.managerPersonnelId"
                filterable
                remote
                reserve-keyword
                clearable
                placeholder="请输入人员姓名搜索"
                style="width: 100%"
                :remote-method="searchPersonnelOptions"
                :loading="personnelLoading"
              >
                <el-option
                  v-for="item in personnelOptions"
                  :key="item.personnelId"
                  :label="item.name"
                  :value="item.personnelId"
                >
                  <span style="float: left">{{ item.name }}</span>
                  <span style="float: right; color: #909399">{{ item.code }}</span>
                </el-option>
              </el-select>
            </el-form-item>
          </el-col>
        </el-row>

        <el-form-item label="备注">
          <el-input
            v-model="projectForm.remark"
            type="textarea"
            :rows="2"
            maxlength="500"
            show-word-limit
            placeholder="请输入备注"
          />
        </el-form-item>

        <el-divider content-position="left">项目物料</el-divider>

        <div class="detail-toolbar">
          <el-button type="primary" plain icon="Plus" @click="handleAddMaterialLine">
            新增物料
          </el-button>
          <span class="detail-tip">
            项目物料目标量是 Phase 1 的稳定上下文，用来解释待供货与项目统计。
          </span>
        </div>

        <el-table :data="projectForm.materialLines" border stripe max-height="360">
          <el-table-column type="index" width="56" align="center" />
          <el-table-column label="物料" min-width="260">
            <template #default="{ row }">
              <el-select
                v-model="row.materialId"
                filterable
                remote
                reserve-keyword
                clearable
                placeholder="请输入物料名称或编码"
                style="width: 100%"
                :remote-method="searchMaterials"
                :loading="materialLoading"
                @change="handleMaterialChange(row)"
              >
                <el-option
                  v-for="item in materialOptions"
                  :key="item.materialId"
                  :label="`${item.materialCode} / ${item.materialName}`"
                  :value="item.materialId"
                >
                  <span style="float: left; color: #ff7171">{{ item.materialCode }}</span>
                  <span style="float: left; margin-left: 10px">{{ item.materialName }}</span>
                  <span style="float: right; color: #909399">{{ item.specification }}</span>
                </el-option>
              </el-select>
            </template>
          </el-table-column>
          <el-table-column label="物料编码" min-width="120">
            <template #default="{ row }">
              {{ row.materialCode || "-" }}
            </template>
          </el-table-column>
          <el-table-column label="物料名称" min-width="160">
            <template #default="{ row }">
              {{ row.materialName || "-" }}
            </template>
          </el-table-column>
          <el-table-column label="规格型号" min-width="140">
            <template #default="{ row }">
              {{ row.specification || "-" }}
            </template>
          </el-table-column>
          <el-table-column label="目标数量" width="140">
            <template #default="{ row }">
              <el-input
                v-model="row.quantity"
                placeholder="数量"
                @input="normalizeDecimalField(row, 'quantity', 6)"
              />
            </template>
          </el-table-column>
          <el-table-column label="参考单价" width="140">
            <template #default="{ row }">
              <el-input
                v-model="row.unitPrice"
                placeholder="单价"
                @input="normalizeDecimalField(row, 'unitPrice', 2)"
              />
            </template>
          </el-table-column>
          <el-table-column label="目标金额" width="120" align="right">
            <template #default="{ row }">
              {{ formatAmount(computeLineAmount(row)) }}
            </template>
          </el-table-column>
          <el-table-column label="备注" min-width="160">
            <template #default="{ row }">
              <el-input v-model="row.remark" placeholder="备注" />
            </template>
          </el-table-column>
          <el-table-column label="操作" width="96" align="center" fixed="right">
            <template #default="{ $index }">
              <el-button
                link
                type="danger"
                icon="Delete"
                @click="handleRemoveMaterialLine($index)"
              >
                删除
              </el-button>
            </template>
          </el-table-column>
        </el-table>
      </el-form>
    </div>

    <template #footer>
      <div class="dialog-footer">
        <el-button @click="dialogVisible = false">取 消</el-button>
        <el-button
          type="primary"
          :loading="projectFormSubmitting"
          @click="submitProjectForm"
        >
          保 存
        </el-button>
      </div>
    </template>
  </el-dialog>
</template>

<script setup name="SalesProjectFormDialog">
import { computed, getCurrentInstance, reactive, ref, watch } from "vue";
import { listCustomerByKeyword } from "@/api/base/customer";
import { listMaterialByCodeOrName } from "@/api/base/material";
import { listPersonnel } from "@/api/base/personnel";
import { listByNameOrContact } from "@/api/base/workshop";
import {
  createSalesProject,
  getSalesProject,
  updateSalesProject,
} from "@/api/sales-project";
import { mergeMaterialOptions } from "@/utils/materialOptions";
import { formatDateToYYYYMMDD } from "@/utils/orderNumber";
import {
  formatAmount,
  toDateInputValue,
  toInputString,
} from "../shared";

const props = defineProps({
  modelValue: {
    type: Boolean,
    default: false,
  },
  projectId: {
    type: [Number, String],
    default: undefined,
  },
});

const emit = defineEmits(["update:modelValue", "submitted"]);

const { proxy } = getCurrentInstance();

const projectFormRef = ref();

const customerOptions = ref([]);
const workshopOptions = ref([]);
const personnelOptions = ref([]);
const materialOptions = ref([]);

const customerLoading = ref(false);
const workshopLoading = ref(false);
const personnelLoading = ref(false);
const materialLoading = ref(false);

const projectFormLoading = ref(false);
const projectFormSubmitting = ref(false);

const resolvedProjectId = computed(() => {
  const parsed = Number(props.projectId);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
});

const dialogVisible = computed({
  get() {
    return props.modelValue;
  },
  set(value) {
    emit("update:modelValue", value);
  },
});

const dialogTitle = computed(() =>
  resolvedProjectId.value ? "修改销售项目" : "新增销售项目",
);

const projectForm = reactive(buildEmptyProjectForm());

const projectFormRules = {
  salesProjectCode: [
    { required: true, message: "项目编码不能为空", trigger: "blur" },
  ],
  salesProjectName: [
    { required: true, message: "项目名称不能为空", trigger: "blur" },
  ],
  bizDate: [{ required: true, message: "业务日期不能为空", trigger: "change" }],
  workshopId: [{ required: true, message: "车间不能为空", trigger: "change" }],
};

function buildEmptyMaterialLine() {
  return {
    lineId: undefined,
    materialId: undefined,
    materialCode: "",
    materialName: "",
    specification: "",
    unitCode: "",
    quantity: "",
    unitPrice: "",
    remark: "",
  };
}

function buildEmptyProjectForm() {
  return {
    projectId: undefined,
    salesProjectCode: "",
    salesProjectName: "",
    bizDate: formatDateToYYYYMMDD(new Date()),
    customerId: undefined,
    customerName: "",
    managerPersonnelId: undefined,
    managerName: "",
    workshopId: undefined,
    workshopName: "",
    remark: "",
    materialLines: [buildEmptyMaterialLine()],
  };
}

function resetProjectFormState() {
  Object.assign(projectForm, buildEmptyProjectForm());
  projectFormRef.value?.clearValidate();
}

function computeLineAmount(line) {
  return Number(line.quantity || 0) * Number(line.unitPrice || 0);
}

function normalizeDecimalField(row, key, scale) {
  const rawValue = row[key];
  if (typeof rawValue !== "string") {
    return;
  }

  row[key] = rawValue
    .replace(/[^\d.]/g, "")
    .replace(/^\./, "")
    .replace(/\.{2,}/g, ".")
    .replace(/^(\d+\.\d{0,})(\..*)$/, "$1")
    .replace(
      new RegExp(`^(\\d+)(\\.\\d{0,${scale}}).*?$`),
      (_match, integerPart, decimalPart) => `${integerPart}${decimalPart}`,
    );
}

function ensureCustomerOption(item) {
  if (!item?.customerId) {
    return;
  }
  if (customerOptions.value.some((option) => option.customerId === item.customerId)) {
    return;
  }
  customerOptions.value.unshift({
    customerId: item.customerId,
    customerName: item.customerName || `客户 ${item.customerId}`,
    customerCode: item.customerCode || "",
  });
}

function ensureWorkshopOption(item) {
  if (!item?.workshopId) {
    return;
  }
  if (workshopOptions.value.some((option) => option.workshopId === item.workshopId)) {
    return;
  }
  workshopOptions.value.unshift({
    workshopId: item.workshopId,
    workshopName: item.workshopName || `车间 ${item.workshopId}`,
  });
}

function ensurePersonnelOption(item) {
  if (!item?.personnelId && !item?.name) {
    return;
  }
  if (
    item.personnelId &&
    personnelOptions.value.some((option) => option.personnelId === item.personnelId)
  ) {
    return;
  }
  personnelOptions.value.unshift({
    personnelId: item.personnelId,
    name: item.name || "未命名人员",
    code: item.code || "",
  });
}

function ensureMaterialOption(item) {
  if (!item?.materialId) {
    return;
  }
  if (materialOptions.value.some((option) => option.materialId === item.materialId)) {
    return;
  }
  materialOptions.value.unshift({
    materialId: item.materialId,
    materialCode: item.materialCode || "",
    materialName: item.materialName || "",
    specification: item.specification || "",
  });
}

async function searchCustomers(keyword) {
  customerLoading.value = true;
  try {
    const response = await listCustomerByKeyword(keyword);
    customerOptions.value = response.rows || [];
  } finally {
    customerLoading.value = false;
  }
}

async function searchWorkshops(keyword) {
  workshopLoading.value = true;
  try {
    const response = await listByNameOrContact({
      workshopName: keyword,
    });
    workshopOptions.value = response.rows || [];
  } finally {
    workshopLoading.value = false;
  }
}

async function searchPersonnelOptions(keyword) {
  personnelLoading.value = true;
  try {
    const response = await listPersonnel({
      name: keyword,
      pageNum: 1,
      pageSize: 100,
    });
    personnelOptions.value = response.rows || [];
  } finally {
    personnelLoading.value = false;
  }
}

async function searchMaterials(keyword) {
  materialLoading.value = true;
  try {
    const response = await listMaterialByCodeOrName({
      materialCode: keyword,
      pageNum: 1,
      pageSize: 100,
    });
    materialOptions.value = mergeMaterialOptions(
      response.rows || [],
      materialOptions.value,
    );
  } finally {
    materialLoading.value = false;
  }
}

function handleAddMaterialLine() {
  projectForm.materialLines.push(buildEmptyMaterialLine());
}

function handleRemoveMaterialLine(index) {
  projectForm.materialLines.splice(index, 1);
  if (projectForm.materialLines.length === 0) {
    projectForm.materialLines.push(buildEmptyMaterialLine());
  }
}

function handleMaterialChange(row) {
  if (!row.materialId) {
    row.materialCode = "";
    row.materialName = "";
    row.specification = "";
    row.unitCode = "";
    return;
  }

  const material = materialOptions.value.find((item) => item.materialId === row.materialId);
  if (!material) {
    return;
  }
  row.materialCode = material.materialCode || "";
  row.materialName = material.materialName || "";
  row.specification = material.specification || "";
}

async function validateProjectForm() {
  const valid = await projectFormRef.value?.validate().catch(() => false);
  if (!valid) {
    return false;
  }

  if (
    !Array.isArray(projectForm.materialLines) ||
    projectForm.materialLines.length === 0
  ) {
    proxy.$modal.msgError("至少需要一条项目物料");
    return false;
  }

  for (let index = 0; index < projectForm.materialLines.length; index++) {
    const line = projectForm.materialLines[index];
    if (!line.materialId) {
      proxy.$modal.msgError(`第 ${index + 1} 行物料不能为空`);
      return false;
    }
    if (!line.quantity) {
      proxy.$modal.msgError(`第 ${index + 1} 行目标数量不能为空`);
      return false;
    }
  }
  return true;
}

function buildProjectPayload() {
  return {
    salesProjectCode: projectForm.salesProjectCode,
    salesProjectName: projectForm.salesProjectName,
    bizDate: projectForm.bizDate,
    customerId: projectForm.customerId,
    managerPersonnelId: projectForm.managerPersonnelId,
    workshopId: projectForm.workshopId,
    remark: projectForm.remark,
    materialLines: projectForm.materialLines.map((line) => ({
      ...(line.lineId ? { lineId: line.lineId } : {}),
      materialId: line.materialId,
      quantity: line.quantity,
      unitPrice: line.unitPrice,
      remark: line.remark,
    })),
  };
}

async function initializeDialog() {
  resetProjectFormState();
  if (!resolvedProjectId.value) {
    return;
  }

  projectFormLoading.value = true;
  try {
    const response = await getSalesProject(resolvedProjectId.value);
    const data = response.data || {};
    projectForm.projectId = data.projectId;
    projectForm.salesProjectCode = data.salesProjectCode || "";
    projectForm.salesProjectName = data.salesProjectName || "";
    projectForm.bizDate =
      toDateInputValue(data.bizDate) || projectForm.bizDate;
    projectForm.customerId = data.customerId ?? undefined;
    projectForm.customerName = data.customerName || "";
    projectForm.managerPersonnelId = data.managerPersonnelId ?? undefined;
    projectForm.managerName = data.managerName || "";
    projectForm.workshopId = data.workshopId ?? undefined;
    projectForm.workshopName = data.workshopName || "";
    projectForm.remark = data.remark || "";
    projectForm.materialLines =
      Array.isArray(data.materialLines) && data.materialLines.length > 0
        ? data.materialLines.map((line) => ({
            lineId: line.lineId,
            materialId: line.materialId,
            materialCode: line.materialCode || "",
            materialName: line.materialName || "",
            specification: line.specification || "",
            unitCode: line.unitCode || "",
            quantity: toInputString(line.quantity),
            unitPrice: toInputString(line.unitPrice),
            remark: line.remark || "",
          }))
        : [buildEmptyMaterialLine()];

    ensureCustomerOption({
      customerId: projectForm.customerId,
      customerName: projectForm.customerName,
      customerCode: data.customerCode,
    });
    ensureWorkshopOption({
      workshopId: projectForm.workshopId,
      workshopName: projectForm.workshopName,
    });
    ensurePersonnelOption({
      personnelId: projectForm.managerPersonnelId,
      name: projectForm.managerName,
      code: "",
    });
    for (const line of projectForm.materialLines) {
      ensureMaterialOption(line);
    }
  } finally {
    projectFormLoading.value = false;
  }
}

async function submitProjectForm() {
  if (!(await validateProjectForm())) {
    return;
  }

  projectFormSubmitting.value = true;
  try {
    const payload = buildProjectPayload();
    if (projectForm.projectId) {
      await updateSalesProject(projectForm.projectId, payload);
      proxy.$modal.msgSuccess("销售项目修改成功");
    } else {
      await createSalesProject(payload);
      proxy.$modal.msgSuccess("销售项目新增成功");
    }
    dialogVisible.value = false;
    emit("submitted");
  } finally {
    projectFormSubmitting.value = false;
  }
}

watch(
  () => [props.modelValue, resolvedProjectId.value],
  ([open]) => {
    if (!open) {
      resetProjectFormState();
      return;
    }
    void initializeDialog();
  },
  { immediate: true },
);
</script>

<style scoped lang="scss">
.sales-project-form-dialog {
  .detail-toolbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    margin: 12px 0;
  }

  .detail-tip {
    color: #909399;
    font-size: 13px;
  }
}
</style>
