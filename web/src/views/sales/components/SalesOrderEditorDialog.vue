<template>
  <el-dialog
    :model-value="modelValue"
    :title="dialogTitle"
    width="1180px"
    append-to-body
    draggable
    class="document-dialog"
    @update:model-value="handleVisibleChange"
  >
    <div v-loading="dialogLoading || submitting" class="document-form-shell">
      <el-form
        ref="formRef"
        :model="form"
        :rules="formRules"
        label-width="96px"
        class="document-dialog-form"
      >
        <el-row :gutter="16">
          <el-col :span="12">
            <el-form-item :label="documentLabel">
              <el-input
                v-model="form.documentNo"
                disabled
                placeholder="保存后自动生成"
              />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="业务日期" prop="bizDate">
              <el-date-picker
                v-model="form.bizDate"
                type="date"
                value-format="YYYY-MM-DD"
                placeholder="请选择业务日期"
                style="width: 100%"
              />
            </el-form-item>
          </el-col>
        </el-row>

        <el-row v-if="isSalesReturnMode" :gutter="16">
          <el-col :span="12">
            <el-form-item label="来源出库单" prop="sourceOutboundOrderId">
              <el-select
                v-model="form.sourceOutboundOrderId"
                filterable
                remote
                reserve-keyword
                :clearable="!isSourceOutboundLocked"
                :disabled="isSourceOutboundLocked"
                placeholder="请输入出库单号搜索"
                style="width: 100%"
                :remote-method="searchSourceOrders"
                :loading="sourceOrderLoading"
                @change="handleSourceOrderChange"
              >
                <el-option
                  v-for="item in sourceOrderOptions"
                  :key="item.orderId"
                  :label="`${item.documentNo} / ${item.customerName || '未绑定客户'}`"
                  :value="item.orderId"
                />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="客户">
              <template v-if="isLinkedSalesReturnMode">
                <el-input :model-value="form.customerName || '-'" disabled />
              </template>
              <template v-else>
                <el-select
                  v-model="form.customerId"
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
                    <span style="float: right; color: #909399">{{ item.customerCode }}</span>
                  </el-option>
                </el-select>
              </template>
            </el-form-item>
          </el-col>
        </el-row>

        <el-row :gutter="16">
          <el-col v-if="!isSalesReturnMode" :span="12">
            <el-form-item label="客户">
              <el-select
                v-model="form.customerId"
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
                  <span style="float: right; color: #909399">{{ item.customerCode }}</span>
                </el-option>
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="经手人">
              <el-select
                v-model="form.handlerPersonnelId"
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

        <el-row :gutter="16">
          <el-col :span="12">
            <el-form-item label="车间" prop="workshopId">
              <template v-if="isLinkedSalesReturnMode">
                <el-input :model-value="form.workshopName || '-'" disabled />
              </template>
              <template v-else>
                <el-select
                  v-model="form.workshopId"
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
              </template>
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="备注">
              <el-input
                v-model="form.remark"
                type="textarea"
                :rows="2"
                maxlength="500"
                show-word-limit
                placeholder="请输入备注"
              />
            </el-form-item>
          </el-col>
        </el-row>

        <el-divider content-position="left">单据明细</el-divider>

        <div class="document-lines-section">
        <el-table :data="form.details" border stripe class="document-lines-table">
          <el-table-column type="index" width="56" align="center" />

          <el-table-column
            v-if="isLinkedSalesReturnMode"
            label="来源出库明细"
            min-width="240"
          >
            <template #default="{ row }">
              <el-select
                v-model="row.sourceOutboundLineId"
                filterable
                clearable
                placeholder="请选择来源出库明细"
                style="width: 100%"
                @change="handleSourceLineChange(row)"
              >
                <el-option
                  v-for="item in sourceLineOptions"
                  :key="item.detailId"
                  :label="buildSourceLineLabel(item)"
                  :value="item.detailId"
                />
              </el-select>
            </template>
          </el-table-column>

          <el-table-column
            v-if="!isSalesReturnMode || isStandaloneSalesReturnMode"
            label="物料"
            min-width="250"
          >
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

          <el-table-column label="销售项目" min-width="220">
            <template #default="{ row }">
              <template v-if="isSalesReturnMode">
                {{ row.salesProjectName || row.salesProjectCode || "-" }}
              </template>
              <template v-else>
                <el-select
                  v-model="row.salesProjectId"
                  filterable
                  remote
                  reserve-keyword
                  clearable
                  placeholder="请输入项目名称或编码"
                  style="width: 100%"
                  :remote-method="searchSalesProjectOptions"
                  :loading="salesProjectLoading"
                  @change="handleSalesProjectChange(row)"
                >
                  <el-option
                    v-for="item in salesProjectOptions"
                    :key="item.projectId"
                    :label="`${item.salesProjectCode} / ${item.salesProjectName}`"
                    :value="item.projectId"
                  />
                </el-select>
              </template>
            </template>
          </el-table-column>

          <el-table-column
            v-if="!isSalesReturnMode"
            label="成本价层"
            width="200"
          >
            <template #default="{ row }">
              <el-select
                v-model="row.selectedUnitCost"
                filterable
                clearable
                placeholder="请选择成本价层"
                style="width: 100%"
              >
                <el-option
                  v-for="item in row.priceLayerOptions"
                  :key="item.unitCost"
                  :label="formatPriceLayerLabel(item)"
                  :value="item.unitCost"
                />
              </el-select>
            </template>
          </el-table-column>
          <el-table-column
            v-else-if="isStandaloneSalesReturnMode"
            label="成本价"
            width="130"
          >
            <template #default="{ row }">
              <el-input
                v-model="row.selectedUnitCost"
                placeholder="成本价"
                @input="normalizeDecimalField(row, 'selectedUnitCost', 4)"
              />
            </template>
          </el-table-column>

          <el-table-column label="数量" width="150">
            <template #default="{ row }">
              <el-input-number
                v-model="row.quantity"
                placeholder="数量"
                :min="0.01"
                :max="getLineQuantityMax(row)"
                :precision="2"
                :step="1"
                controls-position="right"
                style="width: 100%"
                :disabled="isFactoryNumberQuantityLocked(row)"
                @change="handleQuantityChange(row)"
              />
            </template>
          </el-table-column>

          <el-table-column label="销售单价" width="130">
            <template #default="{ row }">
              <el-input
                v-model="row.unitPrice"
                placeholder="销售单价"
                @input="normalizeDecimalField(row, 'unitPrice', 4)"
              />
            </template>
          </el-table-column>

          <el-table-column
            v-if="!isSalesReturnMode"
            label="编号"
            min-width="220"
          >
            <template #default="{ row }">
              <el-input
                v-model="row.factoryNumber"
                placeholder="如 23676-23696,23776-23990"
                @input="handleFactoryNumberInput(row)"
              />
            </template>
          </el-table-column>

          <el-table-column label="金额" width="120" align="right">
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
                @click="handleRemoveLine($index)"
              >
                删除
              </el-button>
            </template>
          </el-table-column>
        </el-table>
          <div class="document-lines-actions">
            <div class="document-lines-actions__left">
              <el-button
                v-if="isLinkedSalesReturnMode"
                type="primary"
                plain
                icon="Plus"
                :disabled="!hasAvailableSourceLine"
                @click="handleAddLine"
              >
                添加来源明细
              </el-button>
              <el-button
                v-else
                type="primary"
                plain
                icon="Plus"
                @click="handleAddLine"
              >
                新增明细
              </el-button>
              <span v-if="isSalesReturnMode" class="detail-tip">
                {{ salesReturnDetailTip }}
              </span>
            </div>
            <span>合计金额: {{ lineTotalAmount }}</span>
          </div>
        </div>
      </el-form>
    </div>

    <template #footer>
      <div class="dialog-footer">
        <el-button @click="handleVisibleChange(false)">取 消</el-button>
        <el-button type="primary" :loading="submitting" @click="submitForm">
          保 存
        </el-button>
      </div>
    </template>
  </el-dialog>
</template>

<script setup>
import { computed, getCurrentInstance, reactive, ref, watch } from "vue";
import { listCustomerByKeyword } from "@/api/base/customer";
import { listMaterialByCodeOrName } from "@/api/base/material";
import { listPersonnel } from "@/api/base/personnel";
import { listSalesProjects } from "@/api/sales-project";
import { listByNameOrContact } from "@/api/base/workshop";
import {
  addOrder,
  getOrder,
  listOrder,
  updateOrder,
} from "@/api/sales/order";
import {
  addSalesReturnOrder,
} from "@/api/sales/salesReturnOrder";
import { confirmDocumentSave } from "@/utils/documentConfirm";
import { mergeMaterialOptions } from "@/utils/materialOptions";
import request from "@/utils/request";
import { formatDateToYYYYMMDD } from "@/utils/orderNumber";

const props = defineProps({
  modelValue: {
    type: Boolean,
    default: false,
  },
  mode: {
    type: String,
    default: "order",
  },
  orderId: {
    type: Number,
    default: null,
  },
  draftPayload: {
    type: Object,
    default: null,
  },
});

const emit = defineEmits(["update:modelValue", "submitted"]);

const { proxy } = getCurrentInstance();
const formRef = ref();
const dialogLoading = ref(false);
const submitting = ref(false);

const customerOptions = ref([]);
const personnelOptions = ref([]);
const workshopOptions = ref([]);
const materialOptions = ref([]);
const salesProjectOptions = ref([]);
const sourceOrderOptions = ref([]);
const sourceLineOptions = ref([]);

const customerLoading = ref(false);
const personnelLoading = ref(false);
const workshopLoading = ref(false);
const materialLoading = ref(false);
const salesProjectLoading = ref(false);
const sourceOrderLoading = ref(false);

const form = reactive(buildEmptyForm());
const lockedSourceOutboundOrderId = ref(null);

const isSalesReturnMode = computed(() => props.mode === "salesReturn");
const isSourceOutboundLocked = computed(
  () => isSalesReturnMode.value && Boolean(lockedSourceOutboundOrderId.value),
);
const isLinkedSalesReturnMode = computed(
  () => isSalesReturnMode.value && Boolean(form.sourceOutboundOrderId),
);
const isStandaloneSalesReturnMode = computed(
  () => isSalesReturnMode.value && !form.sourceOutboundOrderId,
);
const isOrderEditMode = computed(
  () => props.mode === "order" && Number.isInteger(props.orderId),
);
const documentLabel = computed(() =>
  isSalesReturnMode.value ? "销售退货单号" : "出库单号",
);
const formRules = computed(() => ({
  bizDate: [{ required: true, message: "业务日期不能为空", trigger: "change" }],
}));
const dialogTitle = computed(() => {
  if (isSalesReturnMode.value) {
    return "新增销售退货单";
  }
  return isOrderEditMode.value ? "修改出库单" : "新增出库单";
});
const salesReturnDetailTip = computed(() =>
  isLinkedSalesReturnMode.value
    ? "只能从来源出库单补回明细，不能添加其他物料。"
    : "来源出库单可不选；未选择来源时可手动新增明细。",
);
const selectedSourceLineIds = computed(
  () =>
    new Set(
      form.details
        .map((line) => line.sourceOutboundLineId)
        .filter((value) => Number.isInteger(value)),
    ),
);
const nextAvailableSourceLine = computed(
  () =>
    sourceLineOptions.value.find(
      (line) => !selectedSourceLineIds.value.has(line.detailId),
    ) ?? null,
);
const hasAvailableSourceLine = computed(
  () => Boolean(nextAvailableSourceLine.value),
);
const lineTotalAmount = computed(() =>
  formatAmount(
    form.details.reduce((total, detail) => total + computeLineAmount(detail), 0),
  ),
);

watch(
  () => props.modelValue,
  async (visible) => {
    if (!visible) {
      return;
    }
    await initializeDialog();
  },
);

watch(
  () => form.workshopId,
  async (workshopId, previousWorkshopId) => {
    if (
      isSalesReturnMode.value ||
      !workshopId ||
      workshopId === previousWorkshopId
    ) {
      return;
    }
    await Promise.all(form.details.map((detail) => loadPriceLayerOptions(detail)));
  },
);

function buildEmptyLine() {
  return {
    detailId: undefined,
    materialId: undefined,
    materialCode: "",
    materialName: "",
    specification: "",
    salesProjectId: undefined,
    salesProjectCode: "",
    salesProjectName: "",
    projectTargetId: undefined,
    sourceProjectTargetId: undefined,
    quantity: undefined,
    selectedUnitCost: "",
    unitPrice: "",
    factoryNumber: "",
    priceLayerOptions: [],
    sourceOutboundLineId: undefined,
    remark: "",
  };
}

function buildEmptyForm() {
  return {
    orderId: undefined,
    documentNo: "",
    bizDate: formatDateToYYYYMMDD(new Date()),
    customerId: undefined,
    customerName: "",
    handlerPersonnelId: undefined,
    handlerName: "",
    workshopId: undefined,
    workshopName: "",
    sourceOutboundOrderId: undefined,
    remark: "",
    details: [buildEmptyLine()],
  };
}

function resetFormState() {
  Object.assign(form, buildEmptyForm());
  lockedSourceOutboundOrderId.value = null;
  customerOptions.value = [];
  personnelOptions.value = [];
  workshopOptions.value = [];
  materialOptions.value = [];
  salesProjectOptions.value = [];
  sourceOrderOptions.value = [];
  sourceLineOptions.value = [];
  formRef.value?.clearValidate();
}

async function initializeDialog() {
  resetFormState();
  dialogLoading.value = true;
  try {
    if (isOrderEditMode.value) {
      await loadOrderForEdit(props.orderId);
      return;
    }
    if (props.draftPayload) {
      await applyDraftPayload(props.draftPayload);
    }
  } finally {
    dialogLoading.value = false;
  }
}

async function loadOrderForEdit(orderId) {
  const response = await getOrder(orderId);
  const data = response.data || {};

  form.orderId = data.orderId;
  form.documentNo = data.documentNo || "";
  form.bizDate = formatDateToYYYYMMDD(new Date(data.bizDate || Date.now()));
  form.customerId = data.customerId ?? undefined;
  form.customerName = data.customerName || "";
  form.handlerName = data.handlerName || "";
  form.workshopId = data.workshopId ?? undefined;
  form.workshopName = data.workshopName || "";
  form.remark = data.remark || "";
  form.details =
    Array.isArray(data.details) && data.details.length > 0
      ? data.details.map((detail) => mapOrderDetailToLine(detail))
      : [buildEmptyLine()];

  ensureCustomerOption({
    customerId: form.customerId,
    customerName: form.customerName,
    customerCode: data.customerCode,
  });
  ensureWorkshopOption({
    workshopId: form.workshopId,
    workshopName: form.workshopName,
  });
  ensurePersonnelOption({
    personnelId: data.handlerPersonnelId,
    name: form.handlerName,
    code: "",
  });
  form.handlerPersonnelId = data.handlerPersonnelId ?? undefined;

  for (const detail of form.details) {
    ensureMaterialOption(detail);
    ensureSalesProjectOption(detail);
    if (!isSalesReturnMode.value) {
      await loadPriceLayerOptions(detail);
    }
  }
}

function mapOrderDetailToLine(detail) {
  return {
    detailId: detail.detailId,
    materialId: detail.materialId,
    originalMaterialId: detail.materialId,
    materialCode: detail.materialCode || "",
    materialName: detail.materialName || "",
    specification: detail.specification || "",
    salesProjectId: detail.salesProjectId ?? undefined,
    salesProjectCode: detail.salesProjectCode || "",
    salesProjectName: detail.salesProjectName || "",
    projectTargetId: detail.projectTargetId ?? undefined,
    sourceProjectTargetId: detail.sourceProjectTargetId ?? undefined,
    quantity: toInputNumber(detail.quantity),
    originalQuantity: toInputString(detail.quantity),
    selectedUnitCost: toInputString(detail.selectedUnitCost),
    originalSelectedUnitCost: toInputString(detail.selectedUnitCost),
    unitPrice: toInputString(detail.unitPrice),
    factoryNumber: formatFactoryNumber(detail),
    priceLayerOptions: [],
    sourceOutboundLineId: detail.sourceDocumentLineId ?? undefined,
    remark: detail.remark || "",
  };
}

function toInputString(value) {
  if (value === null || typeof value === "undefined") {
    return "";
  }
  return String(value);
}

function toInputNumber(value) {
  if (value === null || typeof value === "undefined" || value === "") {
    return undefined;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function ensureCustomerOption(item) {
  if (!item?.customerId) {
    return;
  }

  if (
    customerOptions.value.some(
      (option) => option.customerId === item.customerId,
    )
  ) {
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

  if (
    workshopOptions.value.some(
      (option) => option.workshopId === item.workshopId,
    )
  ) {
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
    personnelOptions.value.some(
      (option) => option.personnelId === item.personnelId,
    )
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

  if (
    materialOptions.value.some(
      (option) => option.materialId === item.materialId,
    )
  ) {
    return;
  }

  materialOptions.value.unshift({
    materialId: item.materialId,
    materialCode: item.materialCode || "",
    materialName: item.materialName || "",
    specification: item.specification || "",
  });
}

function ensureSalesProjectOption(item) {
  if (!item?.salesProjectId) {
    return;
  }

  if (
    salesProjectOptions.value.some(
      (option) => option.projectId === item.salesProjectId,
    )
  ) {
    return;
  }

  salesProjectOptions.value.unshift({
    projectId: item.salesProjectId,
    salesProjectCode: item.salesProjectCode || "",
    salesProjectName: item.salesProjectName || "",
    projectTargetId: item.projectTargetId,
  });
}

async function applyDraftPayload(draft) {
  if (isSalesReturnMode.value && draft.sourceOutboundOrderId) {
    form.sourceOutboundOrderId = draft.sourceOutboundOrderId;
    lockedSourceOutboundOrderId.value = draft.lockSourceOutbound
      ? draft.sourceOutboundOrderId
      : null;
    ensureSourceOrderOption(draft);
    await handleSourceOrderChange(draft.sourceOutboundOrderId);
    return;
  }

  form.bizDate = draft.bizDate || form.bizDate;
  form.customerId = draft.customerId ?? undefined;
  form.customerName = draft.customerName || "";
  form.handlerPersonnelId = draft.handlerPersonnelId ?? undefined;
  form.handlerName = draft.handlerName || "";
  form.workshopId = draft.workshopId ?? undefined;
  form.workshopName = draft.workshopName || "";
  form.remark = draft.remark || "";
  form.details =
    Array.isArray(draft.lines) && draft.lines.length > 0
      ? draft.lines.map((line) => ({
          ...buildEmptyLine(),
          materialId: line.materialId,
          materialCode: line.materialCode || "",
          materialName: line.materialName || "",
          specification: line.specification || "",
          salesProjectId: line.salesProjectId ?? draft.salesProjectId ?? undefined,
          salesProjectCode:
            line.salesProjectCode || draft.salesProjectCode || "",
          salesProjectName:
            line.salesProjectName || draft.salesProjectName || "",
          projectTargetId:
            line.projectTargetId ?? draft.projectTargetId ?? undefined,
          sourceProjectTargetId:
            Object.hasOwn(line, "sourceProjectTargetId")
              ? line.sourceProjectTargetId
              : (line.projectTargetId ?? draft.projectTargetId ?? undefined),
          quantity: toInputNumber(line.quantity),
          selectedUnitCost: toInputString(line.selectedUnitCost),
          unitPrice: toInputString(line.unitPrice),
          remark: line.remark || "",
        }))
      : [buildEmptyLine()];

  ensureCustomerOption({
    customerId: form.customerId,
    customerName: form.customerName,
    customerCode: draft.customerCode,
  });
  ensureWorkshopOption({
    workshopId: form.workshopId,
    workshopName: form.workshopName,
  });
  ensurePersonnelOption({
    personnelId: form.handlerPersonnelId,
    name: form.handlerName,
    code: "",
  });

  for (const detail of form.details) {
    ensureMaterialOption(detail);
    ensureSalesProjectOption(detail);
    await loadPriceLayerOptions(detail);
  }
}

function ensureSourceOrderOption(item) {
  const orderId = item?.sourceOutboundOrderId ?? item?.orderId;
  if (!orderId) {
    return;
  }

  if (sourceOrderOptions.value.some((option) => option.orderId === orderId)) {
    return;
  }

  sourceOrderOptions.value.unshift({
    orderId,
    documentNo:
      item.sourceOutboundDocumentNo || item.documentNo || `出库单 ${orderId}`,
    customerName: item.customerName || "",
  });
}

function handleVisibleChange(value) {
  emit("update:modelValue", value);
}

function handleAddLine() {
  if (isLinkedSalesReturnMode.value) {
    const sourceLine = nextAvailableSourceLine.value;
    if (!sourceLine) {
      proxy.$modal.msgWarning("当前来源出库单明细已全部带出");
      return;
    }
    const line = mapSourceLineToReturnLine(sourceLine);
    form.details.push(line);
    ensureSalesProjectOption(line);
    return;
  }

  form.details.push(buildEmptyLine());
}

function handleRemoveLine(index) {
  form.details.splice(index, 1);
  if (!isLinkedSalesReturnMode.value && form.details.length === 0) {
    form.details.push(buildEmptyLine());
  }
}

async function handleMaterialChange(row) {
  const material = materialOptions.value.find(
    (item) => item.materialId === row.materialId,
  );
  if (!material) {
    return;
  }

  row.materialCode = material.materialCode || "";
  row.materialName = material.materialName || "";
  row.specification = material.specification || "";
  row.selectedUnitCost = "";
  if (!isSalesReturnMode.value) {
    await loadPriceLayerOptions(row);
  }
}

function buildSourceLineLabel(item) {
  return `${item.materialCode || "-"} / ${item.materialName || "-"} / 原出库 ${toInputString(item.quantity)}`;
}

async function handleSourceOrderChange(orderId) {
  if (
    isSourceOutboundLocked.value &&
    orderId !== lockedSourceOutboundOrderId.value
  ) {
    form.sourceOutboundOrderId = lockedSourceOutboundOrderId.value;
    proxy.$modal.msgWarning("从出库单发起的退货不能切换来源出库单");
    return;
  }

  if (!orderId) {
    form.customerId = undefined;
    form.customerName = "";
    form.workshopId = undefined;
    form.workshopName = "";
    sourceLineOptions.value = [];
    form.details = [buildEmptyLine()];
    return;
  }

  dialogLoading.value = true;
  try {
    const response = await getOrder(orderId);
    const order = response.data || {};

    ensureCustomerOption({
      customerId: order.customerId,
      customerName: order.customerName,
      customerCode: order.customerCode,
    });
    ensureWorkshopOption({
      workshopId: order.workshopId,
      workshopName: order.workshopName,
    });

    form.customerId = order.customerId ?? undefined;
    form.customerName = order.customerName || "";
    form.workshopId = order.workshopId ?? undefined;
    form.workshopName = order.workshopName || "";
    sourceLineOptions.value = Array.isArray(order.details) ? order.details : [];
    form.details =
      sourceLineOptions.value.length > 0
        ? sourceLineOptions.value.map((detail) =>
            mapSourceLineToReturnLine(detail),
          )
        : [buildEmptyLine()];
    for (const detail of form.details) {
      ensureSalesProjectOption(detail);
    }
  } finally {
    dialogLoading.value = false;
  }
}

function mapSourceLineToReturnLine(detail) {
  return {
    detailId: undefined,
    materialId: detail.materialId,
    materialCode: detail.materialCode || "",
    materialName: detail.materialName || "",
    specification: detail.specification || "",
    salesProjectId: detail.salesProjectId ?? undefined,
    salesProjectCode: detail.salesProjectCode || "",
    salesProjectName: detail.salesProjectName || "",
    projectTargetId: detail.projectTargetId ?? undefined,
    sourceProjectTargetId: detail.sourceProjectTargetId ?? undefined,
    quantity: toInputNumber(detail.quantity),
    selectedUnitCost: toInputString(detail.selectedUnitCost),
    unitPrice: toInputString(detail.unitPrice),
    factoryNumber: "",
    priceLayerOptions: [],
    sourceOutboundLineId: detail.detailId,
    remark: "",
  };
}

function handleSourceLineChange(row) {
  const sourceLine = sourceLineOptions.value.find(
    (item) => item.detailId === row.sourceOutboundLineId,
  );
  if (!sourceLine) {
    return;
  }

  row.materialId = sourceLine.materialId;
  row.materialCode = sourceLine.materialCode || "";
  row.materialName = sourceLine.materialName || "";
  row.specification = sourceLine.specification || "";
  row.salesProjectId = sourceLine.salesProjectId ?? undefined;
  row.salesProjectCode = sourceLine.salesProjectCode || "";
  row.salesProjectName = sourceLine.salesProjectName || "";
  row.projectTargetId = sourceLine.projectTargetId ?? undefined;
  row.sourceProjectTargetId = sourceLine.sourceProjectTargetId ?? undefined;
  row.selectedUnitCost = toInputString(sourceLine.selectedUnitCost);
  ensureSalesProjectOption(row);
  if (!row.quantity) {
    row.quantity = toInputNumber(sourceLine.quantity);
  }
  if (!row.unitPrice) {
    row.unitPrice = toInputString(sourceLine.unitPrice);
  }
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

function splitFactoryNumberSegments(value) {
  return String(value || "")
    .split(/[,，/、\\]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseFactoryNumberSegment(segment) {
  const rangeParts = segment.split("-").map((item) => item.trim());
  if (rangeParts.length === 1 && /^\d+$/.test(rangeParts[0])) {
    return {
      startNumber: rangeParts[0],
      endNumber: rangeParts[0],
      count: 1,
    };
  }

  if (
    rangeParts.length === 2 &&
    /^\d+$/.test(rangeParts[0]) &&
    /^\d+$/.test(rangeParts[1])
  ) {
    const start = Number(rangeParts[0]);
    const end = Number(rangeParts[1]);
    if (Number.isSafeInteger(start) && Number.isSafeInteger(end) && start <= end) {
      return {
        startNumber: rangeParts[0],
        endNumber: rangeParts[1],
        count: end - start + 1,
      };
    }
  }

  return null;
}

function calculateFactoryNumberCount(value) {
  return splitFactoryNumberSegments(value).reduce((sum, segment) => {
    const parsed = parseFactoryNumberSegment(segment);
    return parsed ? sum + parsed.count : sum;
  }, 0);
}

function isValidFactoryNumber(value) {
  const segments = splitFactoryNumberSegments(value);
  return segments.every((segment) => parseFactoryNumberSegment(segment));
}

function normalizeFactoryNumber(value) {
  return String(value || "")
    .replace(/[^\d,\-，/、\\\s]/g, "")
    .replace(/\s+/g, "");
}

function formatFactoryNumber(row) {
  const startNumber = row.startNumber || "";
  const endNumber = row.endNumber || "";
  if (startNumber && endNumber) {
    return startNumber === endNumber ? startNumber : `${startNumber}-${endNumber}`;
  }
  return startNumber || endNumber || "";
}

function handleFactoryNumberInput(row) {
  row.factoryNumber = normalizeFactoryNumber(row.factoryNumber);
  const count = getFactoryNumberCount(row);
  if (count !== null) {
    row.quantity = count;
  }
}

function getFactoryNumberCount(row) {
  const factoryNumber = toInputString(row?.factoryNumber);
  if (!factoryNumber || !isValidFactoryNumber(factoryNumber)) {
    return null;
  }
  const count = calculateFactoryNumberCount(factoryNumber);
  return count > 0 ? count : null;
}

function isFactoryNumberQuantityLocked(row) {
  return !isSalesReturnMode.value && getFactoryNumberCount(row) !== null;
}

function getLineQuantityMax(row) {
  if (isSalesReturnMode.value) {
    return undefined;
  }
  const factoryNumberCount = getFactoryNumberCount(row);
  if (factoryNumberCount !== null) {
    return factoryNumberCount;
  }
  const availableQty = getSelectedPriceLayerAvailableQty(row);
  return availableQty !== null && availableQty >= 0.01 ? availableQty : undefined;
}

function handleQuantityChange(row) {
  const factoryNumberCount = getFactoryNumberCount(row);
  if (factoryNumberCount !== null) {
    row.quantity = factoryNumberCount;
    return;
  }
  if (row.quantity === null || typeof row.quantity === "undefined") {
    row.quantity = undefined;
    return;
  }
  row.quantity = toInputNumber(row.quantity);
}

function computeLineAmount(row) {
  const quantity = Number(row.quantity || 0);
  const unitPrice = Number(row.unitPrice || 0);
  if (!Number.isFinite(quantity) || !Number.isFinite(unitPrice)) {
    return 0;
  }
  return quantity * unitPrice;
}

function formatAmount(value) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed.toFixed(4) : "0.0000";
}

function formatCostAmount(value) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed.toFixed(4) : "0.0000";
}

function getSelectedPriceLayer(row) {
  const selectedUnitCost = toInputString(row?.selectedUnitCost);
  if (!selectedUnitCost) {
    return null;
  }
  return (
    row?.priceLayerOptions?.find((item) => item.unitCost === selectedUnitCost) ??
    null
  );
}

function getOriginalSelectedPriceLayerQuantity(row) {
  if (!row?.detailId) {
    return 0;
  }
  const sameMaterial = row.originalMaterialId === row.materialId;
  const samePriceLayer =
    toInputString(row.originalSelectedUnitCost) ===
    toInputString(row.selectedUnitCost);
  const originalQuantity = Number(row.originalQuantity);
  if (!sameMaterial || !samePriceLayer || !Number.isFinite(originalQuantity)) {
    return 0;
  }
  return originalQuantity > 0 ? originalQuantity : 0;
}

function getSelectedPriceLayerAvailableQty(row) {
  const selectedLayer = getSelectedPriceLayer(row);
  if (!selectedLayer) {
    return null;
  }
  const originalQuantity = getOriginalSelectedPriceLayerQuantity(row);
  const layerAvailableQty = Number(selectedLayer.availableQty);
  if (Number.isFinite(layerAvailableQty)) {
    return layerAvailableQty + originalQuantity;
  }
  return originalQuantity > 0 ? originalQuantity : null;
}

function formatQuantityDisplay(value) {
  const quantity = Number(value);
  if (!Number.isFinite(quantity)) {
    return "-";
  }
  return quantity.toFixed(2);
}

function formatPriceLayerLabel(item) {
  const unitCost = formatCostAmount(item?.unitCost);
  const availableQty = formatQuantityDisplay(item?.availableQty);
  return `${unitCost} / 可用 ${availableQty}`;
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

async function searchSalesProjectOptions(keyword) {
  salesProjectLoading.value = true;
  try {
    const response = await listSalesProjects({
      salesProjectCode: keyword,
      salesProjectName: keyword,
      pageNum: 1,
      pageSize: 100,
    });
    salesProjectOptions.value = response.rows || [];
  } finally {
    salesProjectLoading.value = false;
  }
}

function handleSalesProjectChange(row) {
  const project = salesProjectOptions.value.find(
    (item) => item.projectId === row.salesProjectId,
  );
  if (!project) {
    row.salesProjectCode = "";
    row.salesProjectName = "";
    row.projectTargetId = undefined;
    row.sourceProjectTargetId = undefined;
    row.selectedUnitCost = "";
    row.priceLayerOptions = [];
    return;
  }

  row.salesProjectCode = project.salesProjectCode || "";
  row.salesProjectName = project.salesProjectName || "";
  row.projectTargetId = project.projectTargetId;
  row.sourceProjectTargetId = project.projectTargetId;
  row.selectedUnitCost = "";
  void loadPriceLayerOptions(row);
}

async function loadPriceLayerOptions(row) {
  if (!row.materialId) {
    row.priceLayerOptions = [];
    row.selectedUnitCost = "";
    return;
  }

  const response = await request({
    url: "/api/inventory/price-layers",
    method: "get",
    params: {
      materialId: row.materialId,
      stockScope: "MAIN",
      ...(typeof row.sourceProjectTargetId === "number"
        ? { projectTargetId: row.sourceProjectTargetId }
        : row.sourceProjectTargetId === null
          ? { projectTargetMode: "UNATTRIBUTED" }
          : row.projectTargetId
            ? { projectTargetId: row.projectTargetId }
            : {}),
    },
  }).catch(() => ({ data: [] }));

  const layers = Array.isArray(response.data) ? response.data : [];
  row.priceLayerOptions = layers.map((item) => ({
    unitCost: toInputString(item.unitCost),
    availableQty: toInputString(item.availableQty),
  }));
  const selectedUnitCost = toInputString(row.selectedUnitCost);
  const hasSelectedLayer =
    selectedUnitCost &&
    row.priceLayerOptions.some((item) => item.unitCost === selectedUnitCost);
  if (hasSelectedLayer) {
    row.selectedUnitCost = selectedUnitCost;
    return;
  }
  if (selectedUnitCost && getOriginalSelectedPriceLayerQuantity(row) > 0) {
    row.priceLayerOptions.unshift({
      unitCost: selectedUnitCost,
      availableQty: "-",
    });
    row.selectedUnitCost = selectedUnitCost;
    return;
  }

  row.selectedUnitCost =
    row.priceLayerOptions.length === 1 ? row.priceLayerOptions[0].unitCost : "";
}

async function searchSourceOrders(keyword) {
  sourceOrderLoading.value = true;
  try {
    const response = await listOrder({
      documentNo: keyword,
      pageNum: 1,
      pageSize: 100,
    });
    sourceOrderOptions.value = response.rows || [];
  } finally {
    sourceOrderLoading.value = false;
  }
}

async function validateForm() {
  const valid = await formRef.value.validate().catch(() => false);
  if (!valid) {
    return false;
  }
  if (!Array.isArray(form.details) || form.details.length === 0) {
    proxy.$modal.msgError("至少需要一条明细");
    return false;
  }

  const selectedSourceOutboundLineIds = new Set();
  for (let index = 0; index < form.details.length; index++) {
    const line = form.details[index];
    if (isLinkedSalesReturnMode.value) {
      if (!line.sourceOutboundLineId) {
        proxy.$modal.msgError(`第 ${index + 1} 行来源出库明细不能为空`);
        return false;
      }
      if (selectedSourceOutboundLineIds.has(line.sourceOutboundLineId)) {
        proxy.$modal.msgError(
          `第 ${index + 1} 行来源出库明细重复，不能重复添加同一条出库明细`,
        );
        return false;
      }
      selectedSourceOutboundLineIds.add(line.sourceOutboundLineId);

      const sourceLine = sourceLineOptions.value.find(
        (item) => item.detailId === line.sourceOutboundLineId,
      );
      if (!sourceLine) {
        proxy.$modal.msgError(`第 ${index + 1} 行来源出库明细不存在`);
        return false;
      }
      if (sourceLine.materialId !== line.materialId) {
        proxy.$modal.msgError(`第 ${index + 1} 行物料必须与来源出库明细一致`);
        return false;
      }
    }
    if (!line.materialId) {
      proxy.$modal.msgError(`第 ${index + 1} 行物料不能为空`);
      return false;
    }
    if (!line.quantity) {
      proxy.$modal.msgError(`第 ${index + 1} 行数量不能为空`);
      return false;
    }
    const quantity = Number(line.quantity);
    if (!Number.isFinite(quantity) || quantity <= 0) {
      proxy.$modal.msgError(`第 ${index + 1} 行数量必须大于0`);
      return false;
    }
    if (
      !isSalesReturnMode.value &&
      line.factoryNumber &&
      !isValidFactoryNumber(line.factoryNumber)
    ) {
      proxy.$modal.msgError(
        `第 ${index + 1} 行编号格式不正确，请使用 23676-23696,23776-23990 这类格式`,
      );
      return false;
    }
    const factoryNumberCount = getFactoryNumberCount(line);
    if (
      !isSalesReturnMode.value &&
      factoryNumberCount !== null &&
      quantity !== factoryNumberCount
    ) {
      proxy.$modal.msgError(
        `第 ${index + 1} 行编号数量与出库数量不一致：编号数量${factoryNumberCount}，输入${formatQuantityDisplay(quantity)}`,
      );
      return false;
    }
    if (!isSalesReturnMode.value && !line.selectedUnitCost) {
      proxy.$modal.msgError(`第 ${index + 1} 行成本价层不能为空`);
      return false;
    }
    if (isStandaloneSalesReturnMode.value && !line.selectedUnitCost) {
      proxy.$modal.msgError(`第 ${index + 1} 行成本价不能为空`);
      return false;
    }
    if (!isSalesReturnMode.value) {
      const availableQty = getSelectedPriceLayerAvailableQty(line);
      if (availableQty !== null && quantity > availableQty) {
        proxy.$modal.msgError(
          `第 ${index + 1} 行所选成本价层可用数量不足：可用${formatQuantityDisplay(availableQty)}，输入${formatQuantityDisplay(quantity)}`,
        );
        return false;
      }
    }
  }

  return true;
}

function buildSubmitPayload() {
  return {
    orderId: form.orderId,
    ...(form.orderId ? { documentNo: form.documentNo } : {}),
    bizDate: form.bizDate,
    customerId: form.customerId,
    handlerPersonnelId: form.handlerPersonnelId,
    workshopId: form.workshopId ?? null,
    sourceOutboundOrderId:
      lockedSourceOutboundOrderId.value ?? form.sourceOutboundOrderId,
    remark: form.remark,
    details: form.details.map((line) => ({
      detailId: line.detailId,
      materialId: line.materialId,
      quantity: line.quantity,
      selectedUnitCost: line.selectedUnitCost,
      sourceProjectTargetId:
        Object.hasOwn(line, "sourceProjectTargetId")
          ? line.sourceProjectTargetId
          : line.projectTargetId,
      unitPrice: line.unitPrice,
      salesProjectId: line.salesProjectId,
      factoryNumber: line.factoryNumber,
      sourceOutboundLineId: line.sourceOutboundLineId,
      remark: line.remark,
    })),
  };
}

async function submitForm() {
  if (!(await validateForm())) {
    return;
  }

  const documentName = isSalesReturnMode.value ? "销售退货单" : "出库单";
  if (
    !(await confirmDocumentSave({
      documentName,
      isUpdate: isOrderEditMode.value,
    }))
  ) {
    return;
  }

  submitting.value = true;
  try {
    const payload = buildSubmitPayload();
    if (isSalesReturnMode.value) {
      await addSalesReturnOrder(payload);
      proxy.$modal.msgSuccess("销售退货单新增成功");
    } else if (isOrderEditMode.value) {
      await updateOrder(payload);
      proxy.$modal.msgSuccess("出库单修改成功");
    } else {
      await addOrder(payload);
      proxy.$modal.msgSuccess("出库单新增成功");
    }

    emit("submitted");
    handleVisibleChange(false);
  } finally {
    submitting.value = false;
  }
}

void [
  formRef,
  dialogTitle,
  documentLabel,
  form,
  customerOptions,
  personnelOptions,
  workshopOptions,
  materialOptions,
  salesProjectOptions,
  sourceOrderOptions,
  sourceLineOptions,
  customerLoading,
  personnelLoading,
  workshopLoading,
  materialLoading,
  salesProjectLoading,
  sourceOrderLoading,
  handleVisibleChange,
  handleAddLine,
  handleRemoveLine,
  handleMaterialChange,
  buildSourceLineLabel,
  handleSourceOrderChange,
  handleSourceLineChange,
  normalizeDecimalField,
  computeLineAmount,
  formatAmount,
  formatCostAmount,
  searchCustomers,
  searchPersonnelOptions,
  searchWorkshops,
  searchMaterials,
  searchSalesProjectOptions,
  searchSourceOrders,
  handleSalesProjectChange,
  submitForm,
];
</script>

<style scoped lang="scss">
.document-lines-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 10px;
}

.document-lines-actions__left {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 12px;
}

.detail-tip {
  color: #909399;
  font-size: 13px;
}
</style>
