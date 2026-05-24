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
                :disabled="!projectForm.projectId"
                placeholder="保存后自动生成: XMBH-顺序ID"
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

        <el-alert
          title="项目主档不再维护目标物料清单。项目实际库存来自项目验收入库、销售退货或库存归属调整。"
          type="info"
          :closable="false"
          show-icon
        />
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
import { listPersonnel } from "@/api/base/personnel";
import { listByNameOrContact } from "@/api/base/workshop";
import {
  createSalesProject,
  getSalesProject,
  updateSalesProject,
} from "@/api/sales-project";
import { formatDateToYYYYMMDD } from "@/utils/orderNumber";
import { toDateInputValue } from "../shared";

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

const customerLoading = ref(false);
const workshopLoading = ref(false);
const personnelLoading = ref(false);

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
  salesProjectName: [
    { required: true, message: "项目名称不能为空", trigger: "blur" },
  ],
  bizDate: [{ required: true, message: "业务日期不能为空", trigger: "change" }],
  workshopId: [{ required: true, message: "车间不能为空", trigger: "change" }],
};

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
  };
}

function resetProjectFormState() {
  Object.assign(projectForm, buildEmptyProjectForm());
  projectFormRef.value?.clearValidate();
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

async function validateProjectForm() {
  const valid = await projectFormRef.value?.validate().catch(() => false);
  if (!valid) {
    return false;
  }
  return true;
}

function buildProjectPayload() {
  const payload = {
    salesProjectName: projectForm.salesProjectName,
    bizDate: projectForm.bizDate,
    customerId: projectForm.customerId,
    managerPersonnelId: projectForm.managerPersonnelId,
    workshopId: projectForm.workshopId,
    remark: projectForm.remark,
  };
  if (projectForm.projectId) {
    payload.salesProjectCode = projectForm.salesProjectCode;
  }
  return payload;
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
  :deep(.el-alert) {
    margin-top: 8px;
  }
}
</style>
