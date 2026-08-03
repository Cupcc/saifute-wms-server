<template>
  <div class="app-container procurement-page">
    <el-card class="procurement-card" shadow="never">
      <template #header>
        <div class="page-header">
          <div>
            <div class="page-title">研发采购需求</div>
            <div class="page-subtitle">
              先形成 RD
              采购真源，研发验收在研发协同内确认，主仓验收单仅记录主仓入库
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
            placeholder="请输入项目名称"
            style="width: 220px"
            @keyup.enter="handleSearch"
          />
        </el-form-item>
        <el-form-item label="业务日期">
          <el-date-picker
            v-model="filters.bizDateRange"
            type="daterange"
            value-format="YYYY-MM-DD"
            start-placeholder="开始日期"
            end-placeholder="结束日期"
            style="width: 260px"
          />
        </el-form-item>
        <el-form-item label="关键字">
          <el-input
            v-model="filters.keyword"
            clearable
            placeholder="单号/项目/物料名称"
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

      <div ref="tableWrapRef" class="procurement-table-wrap">
        <adaptive-table
          column-preferences
          :data="rows"
          row-key="id"
          height="100%"
          stripe
          v-loading="loading"
          :expand-row-keys="expandedRowKeys"
          @expand-change="handleExpandChange"
        >
          <el-table-column type="expand" width="48">
            <template #default="{ row }">
              <div
                class="expanded-detail"
                :style="detailViewportStyle"
                v-loading="detailLoadingId === row.id"
              >
                <template v-if="detailRows[row.id]">
                  <el-table
                    class="detail-table"
                    :data="detailRows[row.id].lines || []"
                    stripe
                    border
                  >
                    <el-table-column prop="lineNo" label="行号" width="60" />
                    <el-table-column label="原始编码" min-width="110">
                      <template #default="{ row: line }">
                        {{ line.materialCodeSnapshot || "-" }}
                      </template>
                    </el-table-column>
                    <el-table-column
                      prop="materialNameSnapshot"
                      label="物料名称"
                      min-width="140"
                    />
                    <el-table-column
                      prop="materialSpecSnapshot"
                      label="规格型号"
                      min-width="120"
                    />
                    <el-table-column label="品项/绑定状态" min-width="170">
                      <template #default="{ row: line }">
                        <div class="binding-tag-wrap">
                          <el-tag
                            :type="bindingStatusMeta(line).type"
                            effect="plain"
                          >
                            {{ bindingStatusMeta(line).label }}
                          </el-tag>
                          <span>{{ bindingSourceLabel(line) }}</span>
                        </div>
                      </template>
                    </el-table-column>
                    <el-table-column label="最终绑定物料" min-width="210">
                      <template #default="{ row: line }">
                        {{ formatBoundMaterial(line) }}
                      </template>
                    </el-table-column>
                    <el-table-column label="需求数量" min-width="90">
                      <template #default="{ row: line }">
                        {{ formatQty(line.quantity) }}
                      </template>
                    </el-table-column>
                    <el-table-column label="当前状态" min-width="280">
                      <template #default="{ row: line }">
                        <template
                          v-for="tags in [buildStatusTags([line])]"
                          :key="`${line.id}-status-tags`"
                        >
                          <div class="status-tag-wrap">
                            <el-tag
                              v-for="item in tags"
                              :key="`${line.id}-${item.key}`"
                              :type="item.type"
                              effect="plain"
                            >
                              {{ item.label }} {{ item.value }}
                            </el-tag>
                            <span v-if="tags.length === 0">-</span>
                          </div>
                        </template>
                      </template>
                    </el-table-column>
                    <el-table-column
                      label="状态操作"
                      width="320"
                      fixed="right"
                      align="right"
                      header-align="right"
                    >
                      <template #default="{ row: line }">
                        <div class="status-action-wrap">
                          <el-button
                            link
                            type="primary"
                            v-hasPermi="['rd:procurement-request:status-action']"
                            :disabled="
                              Number(line.statusLedger?.pendingQty || 0) <= 0
                            "
                            @click="
                              openStatusAction(
                                detailRows[row.id],
                                line,
                                'PROCUREMENT_STARTED',
                              )
                            "
                          >
                            执行采购
                          </el-button>
                          <el-button
                            link
                            type="primary"
                            v-hasPermi="['rd:procurement-request:status-action']"
                            :loading="
                              reversingHistoryId ===
                              getReversibleProcurementHistory(line)?.id
                            "
                            :disabled="!getReversibleProcurementHistory(line)"
                            @click="
                              handleReverseProcurement(detailRows[row.id], line)
                            "
                          >
                            取消采购
                          </el-button>
                          <el-button
                            link
                            type="success"
                            v-hasPermi="['rd:procurement-request:status-action']"
                            :disabled="getAcceptableQty(line) <= 0"
                            @click="
                              openStatusAction(
                                detailRows[row.id],
                                line,
                                'ACCEPTANCE_CONFIRMED',
                              )
                            "
                          >
                            验收
                          </el-button>
                          <el-button
                            link
                            type="warning"
                            v-hasPermi="['rd:procurement-request:status-action']"
                            :disabled="getCancelableQty(line) <= 0"
                            @click="
                              openStatusAction(
                                detailRows[row.id],
                                line,
                                'MANUAL_CANCELLED',
                              )
                            "
                          >
                            取消需求
                          </el-button>
                          <el-button
                            link
                            type="danger"
                            v-hasPermi="['rd:procurement-request:return-action']"
                            :disabled="
                              Number(line.statusLedger?.handedOffQty || 0) <= 0
                            "
                            @click="
                              openStatusAction(
                                detailRows[row.id],
                                line,
                                'MANUAL_RETURNED',
                              )
                            "
                          >
                            退回
                          </el-button>
                        </div>
                      </template>
                    </el-table-column>
                  </el-table>
                </template>
              </div>
            </template>
          </el-table-column>
          <el-table-column prop="documentNo" label="需求单号" min-width="140">
            <template #default="{ row }">
              <el-button
                link
                type="primary"
                :loading="detailLoadingId === row.id"
                @click="toggleDetail(row)"
              >
                {{ row.documentNo }}
              </el-button>
            </template>
          </el-table-column>
          <el-table-column
            prop="projectCode"
            label="项目编码"
            min-width="140"
          />
          <el-table-column
            prop="projectName"
            label="项目名称"
            min-width="180"
          />
          <el-table-column
            prop="handlerNameSnapshot"
            label="经办人"
            min-width="120"
          >
            <template #default="{ row }">
              {{ row.handlerNameSnapshot || "-" }}
            </template>
          </el-table-column>
          <el-table-column label="业务日期" min-width="120">
            <template #default="{ row }">
              {{ formatDateValue(row.bizDate) }}
            </template>
          </el-table-column>
          <el-table-column
            prop="supplierNameSnapshot"
            label="供应商"
            min-width="180"
          />
          <el-table-column label="总数量" min-width="110">
            <template #default="{ row }">
              {{ formatQty(row.totalQty) }}
            </template>
          </el-table-column>
          <el-table-column label="总金额" min-width="110">
            <template #default="{ row }">
              {{ formatAmount(row.totalAmount) }}
            </template>
          </el-table-column>
          <el-table-column label="当前状态链" min-width="260">
            <template #default="{ row }">
              <template
                v-for="tags in [buildStatusTags(row.lines || [])]"
                :key="`${row.id}-status-tags`"
              >
                <div class="status-tag-wrap">
                  <el-tag
                    v-for="item in tags"
                    :key="`${row.id}-${item.key}`"
                    :type="item.type"
                    effect="plain"
                  >
                    {{ item.label }} {{ item.value }}
                  </el-tag>
                  <span v-if="tags.length === 0">-</span>
                </div>
              </template>
            </template>
          </el-table-column>
          <el-table-column prop="remark" label="备注" min-width="200" />
          <el-table-column label="操作" width="120" fixed="right">
            <template #default="{ row }">
              <el-button
                link
                type="primary"
                :loading="detailLoadingId === row.id"
                @click="toggleDetail(row)"
              >
                {{ expandedRowKeys.includes(row.id) ? "收起" : "展开" }}
              </el-button>
              <el-button
                v-if="canCreate"
                link
                type="danger"
                @click="handleVoid(row.id)"
              >
                作废
              </el-button>
            </template>
          </el-table-column>
        </adaptive-table>
      </div>

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

    <el-dialog
      v-model="createOpen"
      title="新增研发采购需求"
      width="min(1180px, 96vw)"
      :close-on-click-modal="false"
      :close-on-press-escape="!submitting"
      :before-close="handleCreateDialogBeforeClose"
    >
      <el-form
        ref="createFormRef"
        :model="form"
        :rules="formRules"
        label-width="100px"
        class="create-form"
      >
        <el-row :gutter="16">
          <el-col :span="12">
            <el-form-item label="需求单号">
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
                style="width: 100%"
              />
            </el-form-item>
          </el-col>
        </el-row>
        <el-row :gutter="16">
          <el-col :span="12">
            <el-form-item label="研发项目" prop="projectCode">
              <el-select
                v-model="form.projectCode"
                filterable
                remote
                reserve-keyword
                clearable
                placeholder="请输入项目编码或名称"
                :remote-method="searchProjects"
                :loading="projectLoading"
                style="width: 100%"
                @change="handleProjectChange"
              >
                <el-option
                  v-for="item in projectSelectOptions"
                  :key="item.id"
                  :label="`${item.projectCode} ${item.projectName}`"
                  :value="item.projectCode"
                />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="项目名称">
              <el-input
                :model-value="form.projectName"
                disabled
                placeholder="选择研发项目后自动带出"
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

        <RdProcurementItemLinesEditor
          v-model="form.lines"
          :project-code="form.projectCode"
        />
      </el-form>

      <template #footer>
        <el-button :disabled="submitting" @click="handleCreateCancel">
          取消
        </el-button>
        <el-button type="primary" :loading="submitting" @click="submitCreate">
          提交
        </el-button>
      </template>
    </el-dialog>

    <el-dialog
      v-model="statusActionOpen"
      :title="statusActionTitle"
      width="520px"
      :close-on-click-modal="false"
    >
      <el-form
        ref="statusActionFormRef"
        :model="statusActionForm"
        :rules="statusActionRules"
        label-width="100px"
      >
        <el-form-item label="物料">
          <el-input :model-value="statusActionForm.materialName" disabled />
        </el-form-item>
        <el-form-item
          v-if="statusActionForm.actionType === 'ACCEPTANCE_CONFIRMED'"
          label="实际物料"
          prop="materialId"
        >
          <RdProcurementAcceptanceBinding
            v-model="statusActionForm.materialId"
            :requires-binding="statusActionForm.requiresMaterialBinding"
            :bound-material="statusActionForm.boundMaterial"
            :material-code-snapshot="statusActionForm.materialCodeSnapshot"
            :material-name-snapshot="statusActionForm.materialNameSnapshot"
            :binding-source="statusActionForm.materialBindingSource"
          />
        </el-form-item>
        <el-form-item label="可用数量">
          <el-input
            :model-value="formatQty(statusActionForm.availableQty)"
            disabled
          />
        </el-form-item>
        <el-form-item
          v-if="statusActionForm.actionType === 'ACCEPTANCE_CONFIRMED'"
          label="数量构成"
        >
          <span>
            待采购 {{ formatQty(statusActionForm.pendingQty) }} + 采购中
            {{ formatQty(statusActionForm.inProcurementQty) }}
          </span>
        </el-form-item>
        <el-form-item label="业务日期" prop="bizDate">
          <el-date-picker
            v-model="statusActionForm.bizDate"
            type="date"
            value-format="YYYY-MM-DD"
            style="width: 100%"
          />
        </el-form-item>
        <el-form-item label="动作数量">
          <el-input-number
            v-model="statusActionForm.quantity"
            :min="0"
            :max="statusActionForm.availableQty || undefined"
            :precision="2"
            controls-position="right"
            style="width: 100%"
          />
        </el-form-item>
        <el-form-item
          v-if="requiresReference"
          label="关联单号"
          prop="referenceNo"
        >
          <el-input
            v-model="statusActionForm.referenceNo"
            :placeholder="
              statusActionForm.actionType === 'ACCEPTANCE_CONFIRMED'
                ? '可选填写主仓验收单号或追溯单号'
                : '请输入关联单号'
            "
          />
        </el-form-item>
        <el-form-item
          :label="
            statusActionForm.actionType === 'MANUAL_RETURNED'
              ? '退回原因'
              : '说明'
          "
          prop="reason"
        >
          <el-input
            v-model="statusActionForm.reason"
            type="textarea"
            :rows="3"
            :placeholder="
              statusActionForm.actionType === 'MANUAL_RETURNED'
                ? '请输入退回原因'
                : '可选填写'
            "
          />
        </el-form-item>
        <el-form-item label="备注">
          <el-input
            v-model="statusActionForm.note"
            type="textarea"
            :rows="2"
            placeholder="可选备注"
          />
        </el-form-item>
      </el-form>

      <template #footer>
        <el-button @click="statusActionOpen = false">取消</el-button>
        <el-button
          type="primary"
          :loading="statusActionSubmitting"
          @click="submitStatusAction"
        >
          提交
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup name="RdProcurementRequestsPage">
import { ElMessage, ElMessageBox } from "element-plus";
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import { listPersonnel } from "@/api/base/personnel";
import { listSupplierByKeyword } from "@/api/base/supplier";
import {
  applyRdProcurementStatusAction,
  createRdProcurementRequest,
  getRdProcurementRequest,
  listRdProcurementRequests,
  listRdProjects,
  reverseRdProcurementStatusAction,
  voidRdProcurementRequest,
} from "@/api/rd-subwarehouse";
import useUserStore from "@/store/modules/user";
import { confirmDocumentSave } from "@/utils/documentConfirm";
import { checkPermi } from "@/utils/permission";
import { formatAmount, formatQty } from "@/utils/format";
import { formatDateOnly, formatDateValue } from "@/utils/rd-documents";
import RdProcurementAcceptanceBinding from "./components/RdProcurementAcceptanceBinding.vue";
import RdProcurementItemLinesEditor from "./components/RdProcurementItemLinesEditor.vue";

const userStore = useUserStore();
const loading = ref(false);
const submitting = ref(false);
const supplierLoading = ref(false);
const personnelLoading = ref(false);
const rows = ref([]);
const total = ref(0);
const pageNum = ref(1);
const pageSize = ref(10);
const tableWrapRef = ref(null);
const detailViewportWidth = ref(0);
let tableWrapResizeObserver;
const supplierOptions = ref([]);
const personnelOptions = ref([]);
const projectSearchResults = ref([]);
const selectedProjectCache = ref([]);
const projectLoading = ref(false);
const createOpen = ref(false);
const createFormRef = ref();
const createFormSnapshot = ref("");
const detailRow = ref(null);
const detailRows = ref({});
const detailLoadingId = ref(null);
const expandedRowKeys = ref([]);
const reversingHistoryId = ref(null);
const statusActionOpen = ref(false);
const statusActionSubmitting = ref(false);
const statusActionFormRef = ref();
const statusActionForm = ref(createEmptyStatusActionForm());
const filters = ref({
  documentNo: "",
  projectCode: "",
  projectName: "",
  bizDateRange: [],
  keyword: "",
});
const form = ref(createEmptyForm());

const workshopLabel = computed(
  () => userStore.stockScope?.stockScopeName || "研发小仓",
);
const canCreate = computed(() => checkPermi(["rd:procurement-request:create"]));
const detailViewportStyle = computed(() => {
  if (!detailViewportWidth.value) {
    return undefined;
  }

  return {
    width: `${detailViewportWidth.value}px`,
  };
});
const formRules = {
  bizDate: [{ required: true, message: "请选择业务日期", trigger: "change" }],
  projectCode: [
    { required: true, message: "请选择研发项目", trigger: "change" },
  ],
};
const statusActionTitle = computed(() => {
  switch (statusActionForm.value.actionType) {
    case "PROCUREMENT_STARTED":
      return "执行采购";
    case "ACCEPTANCE_CONFIRMED":
      return "登记验收";
    case "MANUAL_CANCELLED":
      return "取消需求";
    case "MANUAL_RETURNED":
      return "回写退回";
    default:
      return "状态动作";
  }
});
const requiresReference = computed(() =>
  ["ACCEPTANCE_CONFIRMED", "MANUAL_RETURNED"].includes(
    statusActionForm.value.actionType,
  ),
);
const statusActionRules = computed(() => {
  const isReturn = statusActionForm.value.actionType === "MANUAL_RETURNED";
  const requiresMaterialBinding =
    statusActionForm.value.actionType === "ACCEPTANCE_CONFIRMED" &&
    statusActionForm.value.requiresMaterialBinding;
  return {
    materialId: requiresMaterialBinding
      ? [{ required: true, message: "请选择验收后的实际物料", trigger: "change" }]
      : [],
    referenceNo: isReturn
      ? [{ required: true, message: "请输入关联单号", trigger: "blur" }]
      : [],
    reason: isReturn
      ? [{ required: true, message: "请输入退回原因", trigger: "blur" }]
      : [],
  };
});
const projectSelectOptions = computed(() =>
  mergeOptionsById(selectedProjectCache.value, projectSearchResults.value),
);

function mergeOptionsById(cache, results) {
  const merged = [...cache];
  for (const item of results) {
    if (!merged.some((existing) => existing.id === item.id)) {
      merged.push(item);
    }
  }
  return merged;
}

function createEmptyForm() {
  return {
    documentNo: "",
    clientRequestId: createClientRequestId(),
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
    clientLineId: createClientRequestId(),
    materialId: null,
    materialCode: "",
    materialName: "",
    specModel: "",
    unitCode: "",
    sourceScope: null,
    sourceProjectCode: "",
    sourceProjectName: "",
    quantity: null,
    unitPrice: 0,
    remark: "",
  };
}

function createEmptyStatusActionForm() {
  return {
    requestId: null,
    lineId: null,
    actionType: "PROCUREMENT_STARTED",
    materialId: null,
    requiresMaterialBinding: false,
    boundMaterial: null,
    materialBindingSource: "",
    materialCodeSnapshot: "",
    materialNameSnapshot: "",
    materialName: "",
    availableQty: 0,
    pendingQty: 0,
    inProcurementQty: 0,
    quantity: 0,
    bizDate: formatDateOnly(),
    referenceNo: "",
    reason: "",
    note: "",
  };
}

function createClientRequestId() {
  if (globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID();
  }
  return `rd-procurement-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function bindingStatusMeta(line) {
  if (line.materialBindingSource === "BOM_CATALOG") {
    return { label: "BOM 物料 / 已绑定", type: "success" };
  }
  if (line.materialBindingSource === "ACCEPTANCE_CONFIRMED") {
    return { label: "自由品项 / 已绑定", type: "warning" };
  }
  if (line.materialBindingSource === "LEGACY") {
    return { label: "历史绑定", type: "info" };
  }
  return { label: "自由品项 / 未绑定", type: "danger" };
}

function bindingSourceLabel(line) {
  if (line.materialBindingSource === "BOM_CATALOG") {
    return "创建时选择 BOM";
  }
  if (line.materialBindingSource === "ACCEPTANCE_CONFIRMED") {
    return "验收时首次绑定";
  }
  if (line.materialBindingSource === "LEGACY") {
    return "存量采购行";
  }
  return "需登记验收后绑定";
}

function formatBoundMaterial(line) {
  if (!line.materialId) {
    return "未绑定";
  }
  if (line.material) {
    return `${line.material.materialCode} ${line.material.materialName}`;
  }
  return `${line.materialCodeSnapshot || ""} ${line.materialNameSnapshot || ""}`.trim();
}

function mapStatusLabel(status) {
  const labels = {
    PENDING_PROCUREMENT: "待采购",
    IN_PROCUREMENT: "采购中",
    CANCELLED: "取消",
    ACCEPTED: "已验收",
    HANDED_OFF: "领取",
    SCRAPPED: "报废",
    RETURNED: "退回",
  };
  return labels[status] || status;
}

function mapStatusTagType(status) {
  const types = {
    PENDING_PROCUREMENT: "info",
    IN_PROCUREMENT: "warning",
    CANCELLED: "danger",
    ACCEPTED: "success",
    HANDED_OFF: "",
    SCRAPPED: "danger",
    RETURNED: "warning",
  };
  return types[status] || "";
}

function buildStatusTags(lines) {
  const totals = {
    PENDING_PROCUREMENT: 0,
    IN_PROCUREMENT: 0,
    CANCELLED: 0,
    ACCEPTED: 0,
    HANDED_OFF: 0,
    SCRAPPED: 0,
    RETURNED: 0,
  };
  for (const line of lines) {
    if (!line?.statusLedger) {
      continue;
    }
    totals.PENDING_PROCUREMENT += Number(line.statusLedger.pendingQty || 0);
    totals.IN_PROCUREMENT += Number(line.statusLedger.inProcurementQty || 0);
    totals.CANCELLED += Number(line.statusLedger.canceledQty || 0);
    totals.ACCEPTED += Number(line.statusLedger.acceptedQty || 0);
    totals.HANDED_OFF += Number(line.statusLedger.handedOffQty || 0);
    totals.SCRAPPED += Number(line.statusLedger.scrappedQty || 0);
    totals.RETURNED += Number(line.statusLedger.returnedQty || 0);
  }

  return Object.entries(totals)
    .filter(([, value]) => value > 0)
    .map(([status, value]) => ({
      key: status,
      label: mapStatusLabel(status),
      value: formatQty(value),
      type: mapStatusTagType(status),
    }));
}

function getCancelableQty(line) {
  return (
    Number(line?.statusLedger?.pendingQty || 0) +
    Number(line?.statusLedger?.inProcurementQty || 0)
  );
}

function getAcceptableQty(line) {
  return getCancelableQty(line);
}

function getReversibleProcurementHistory(line) {
  const inProcurementQty = Number(line?.statusLedger?.inProcurementQty || 0);
  if (inProcurementQty <= 0) {
    return null;
  }

  return (
    (line.statusHistories || []).find(
      (history) =>
        history.eventType === "PROCUREMENT_STARTED" &&
        history.sourceDocumentType === "RdProcurementRequest" &&
        history.fromStatus === "PENDING_PROCUREMENT" &&
        history.toStatus === "IN_PROCUREMENT" &&
        !history.isReversed &&
        history.reversalOfHistoryId == null &&
        Number(history.quantity || 0) <= inProcurementQty,
    ) || null
  );
}

async function searchSuppliers(keyword) {
  supplierLoading.value = true;
  try {
    const response = await listSupplierByKeyword(keyword || "");
    supplierOptions.value = response.rows || [];
  } catch {
    // Interceptor toasts the error.
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
  } catch {
    // Interceptor toasts the error.
  } finally {
    personnelLoading.value = false;
  }
}

async function loadRows() {
  loading.value = true;
  try {
    const [bizDateFrom, bizDateTo] = filters.value.bizDateRange || [];
    const response = await listRdProcurementRequests({
      documentNo: filters.value.documentNo || undefined,
      projectCode: filters.value.projectCode || undefined,
      projectName: filters.value.projectName || undefined,
      bizDateFrom: bizDateFrom || undefined,
      bizDateTo: bizDateTo || undefined,
      keyword: filters.value.keyword || undefined,
      limit: pageSize.value,
      offset: (pageNum.value - 1) * pageSize.value,
    });
    rows.value = response.data?.items || [];
    total.value = response.data?.total || 0;
  } catch {
    // Interceptor toasts the error.
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
  filters.value.bizDateRange = [];
  filters.value.keyword = "";
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

function openCreateDialog() {
  if (!canCreate.value) {
    ElMessage.error("当前账号没有研发采购需求新增权限");
    return;
  }
  form.value = createEmptyForm();
  createFormSnapshot.value = JSON.stringify(form.value);
  selectedProjectCache.value = [];
  createFormRef.value?.clearValidate();
  searchProjects("");
  createOpen.value = true;
}

function isCreateFormDirty() {
  return JSON.stringify(form.value) !== createFormSnapshot.value;
}

async function confirmAbandonCreate() {
  if (!isCreateFormDirty()) {
    return true;
  }
  try {
    await ElMessageBox.confirm("表单内容尚未保存，确认关闭？", "关闭确认", {
      confirmButtonText: "放弃填写",
      cancelButtonText: "继续填写",
      type: "warning",
    });
    return true;
  } catch {
    // User chose to keep editing.
    return false;
  }
}

async function handleCreateDialogBeforeClose(done) {
  if (submitting.value) {
    return;
  }
  if (await confirmAbandonCreate()) {
    done();
  }
}

async function handleCreateCancel() {
  if (submitting.value) {
    return;
  }
  if (await confirmAbandonCreate()) {
    createOpen.value = false;
  }
}

async function searchProjects(keyword) {
  projectLoading.value = true;
  try {
    const trimmed = (keyword || "").trim();
    if (!trimmed) {
      const response = await listRdProjects({ limit: 20, offset: 0 });
      projectSearchResults.value = response.data?.items || [];
      return;
    }
    const [byCode, byName] = await Promise.all([
      listRdProjects({ projectCode: trimmed, limit: 20, offset: 0 }),
      listRdProjects({ projectName: trimmed, limit: 20, offset: 0 }),
    ]);
    projectSearchResults.value = mergeOptionsById(
      byCode.data?.items || [],
      byName.data?.items || [],
    );
  } catch {
    // Interceptor toasts the error.
  } finally {
    projectLoading.value = false;
  }
}

function handleProjectChange(projectCode) {
  const project = projectSelectOptions.value.find(
    (item) => item.projectCode === projectCode,
  );
  if (project) {
    selectedProjectCache.value = mergeOptionsById(selectedProjectCache.value, [
      project,
    ]);
  }
  form.value.projectName = project?.projectName || "";
  for (const line of form.value.lines) {
    if (line.materialId) {
      line.sourceScope =
        line.sourceProjectCode === projectCode
          ? "CURRENT_PROJECT"
          : "OTHER_RD_PROJECT";
    }
  }
}

async function loadDetail(requestId, force = false) {
  if (
    (!force && detailRows.value[requestId]) ||
    detailLoadingId.value === requestId
  ) {
    return;
  }
  detailLoadingId.value = requestId;
  try {
    const response = await getRdProcurementRequest(requestId);
    const detail = response.data || null;
    if (detail) {
      detailRows.value = {
        ...detailRows.value,
        [requestId]: detail,
      };
      detailRow.value = detail;
    }
  } catch {
    // Interceptor toasts the error.
  } finally {
    detailLoadingId.value = null;
  }
}

async function toggleDetail(row) {
  const isExpanded = expandedRowKeys.value.includes(row.id);
  expandedRowKeys.value = isExpanded ? [] : [row.id];
  if (!isExpanded) {
    await loadDetail(row.id, true);
  }
}

async function handleExpandChange(row, expandedRows) {
  const isExpanded = expandedRows.some((item) => item.id === row.id);
  expandedRowKeys.value = isExpanded ? [row.id] : [];
  if (isExpanded) {
    await loadDetail(row.id, true);
  }
}

function resolveActionAvailableQty(line, actionType) {
  switch (actionType) {
    case "PROCUREMENT_STARTED":
      return Number(line.statusLedger?.pendingQty || 0);
    case "ACCEPTANCE_CONFIRMED":
      return getAcceptableQty(line);
    case "MANUAL_CANCELLED":
      return getCancelableQty(line);
    case "MANUAL_RETURNED":
      return Number(line.statusLedger?.handedOffQty || 0);
    default:
      return 0;
  }
}

function openStatusAction(request, line, actionType) {
  const availableQty = resolveActionAvailableQty(line, actionType);
  detailRow.value = request;

  statusActionForm.value = {
    requestId: request.id,
    lineId: line.id,
    actionType,
    materialId: line.materialId,
    requiresMaterialBinding:
      actionType === "ACCEPTANCE_CONFIRMED" && line.materialId == null,
    boundMaterial: line.material || null,
    materialBindingSource: line.materialBindingSource || "",
    materialCodeSnapshot: line.materialCodeSnapshot || "",
    materialNameSnapshot: line.materialNameSnapshot || "",
    materialName: `${line.materialCodeSnapshot || ""} ${line.materialNameSnapshot}`.trim(),
    availableQty,
    pendingQty: Number(line.statusLedger?.pendingQty || 0),
    inProcurementQty: Number(line.statusLedger?.inProcurementQty || 0),
    quantity: availableQty,
    bizDate: formatDateOnly(),
    referenceNo: "",
    reason: "",
    note: "",
  };
  statusActionFormRef.value?.clearValidate();
  statusActionOpen.value = true;
}

async function validateForm() {
  const valid = await createFormRef.value?.validate().catch(() => false);
  if (!valid) {
    return false;
  }
  if (!Array.isArray(form.value.lines) || form.value.lines.length === 0) {
    ElMessage.error("至少需要一条物料明细");
    return false;
  }

  for (let index = 0; index < form.value.lines.length; index += 1) {
    const line = form.value.lines[index];
    if (!line.materialId && !line.materialName?.trim()) {
      ElMessage.error(`第 ${index + 1} 行品项名称不能为空`);
      return false;
    }
    if (!line.materialId && !line.unitCode?.trim()) {
      ElMessage.error(`第 ${index + 1} 行自由品项单位不能为空`);
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
  if (!(await validateForm())) {
    return;
  }

  if (!(await confirmDocumentSave({ documentName: "研发采购需求单" }))) {
    return;
  }
  submitting.value = true;
  try {
    await createRdProcurementRequest({
      clientRequestId: form.value.clientRequestId,
      bizDate: form.value.bizDate,
      projectCode: form.value.projectCode,
      supplierId: form.value.supplierId || undefined,
      handlerPersonnelId: form.value.handlerPersonnelId || undefined,
      remark: form.value.remark || undefined,
      lines: form.value.lines.map((line) => ({
        ...(line.materialId
          ? { materialId: line.materialId }
          : {
              materialName: line.materialName.trim(),
              specModel: line.specModel?.trim() || undefined,
              unitCode: line.unitCode.trim(),
            }),
        quantity: String(line.quantity),
        unitPrice: String(line.unitPrice || 0),
        remark: line.remark || undefined,
      })),
    });
    ElMessage.success("研发采购需求已创建");
    createOpen.value = false;
    loadRows();
  } catch {
    // Interceptor toasts the error; keep the dialog open for retry.
  } finally {
    submitting.value = false;
  }
}

async function handleVoid(requestId) {
  let voidReason = "";
  try {
    const result = await ElMessageBox.prompt(
      "请输入作废原因",
      "作废研发采购需求",
      {
        confirmButtonText: "确认",
        cancelButtonText: "取消",
        inputPlaceholder: "可选填写作废原因",
      },
    );
    voidReason = result.value || "";
  } catch {
    // User cancelled.
    return;
  }

  try {
    await voidRdProcurementRequest(requestId, {
      voidReason: voidReason.trim() || undefined,
    });
    ElMessage.success("研发采购需求已作废");
    loadRows();
  } catch {
    // Interceptor toasts the error.
  }
}

async function handleReverseProcurement(request, line) {
  const history = getReversibleProcurementHistory(line);
  if (!history) {
    ElMessage.warning("当前没有可取消的采购动作");
    return;
  }

  try {
    await ElMessageBox.confirm(
      `确认取消本次采购 ${formatQty(history.quantity)}，恢复为待采购状态？`,
      "取消采购",
      {
        confirmButtonText: "确认取消采购",
        cancelButtonText: "返回",
        type: "warning",
      },
    );
  } catch {
    return;
  }

  reversingHistoryId.value = history.id;
  try {
    await reverseRdProcurementStatusAction(request.id, history.id, {
      reason: "取消采购",
    });
    ElMessage.success("采购动作已取消");
    await Promise.all([loadDetail(request.id, true), loadRows()]);
  } catch {
    // Interceptor toasts the error.
  } finally {
    reversingHistoryId.value = null;
  }
}

async function submitStatusAction() {
  const quantity = Number(statusActionForm.value.quantity || 0);
  if (!statusActionForm.value.requestId || !statusActionForm.value.lineId) {
    ElMessage.error("状态动作上下文丢失，请重新打开详情");
    return;
  }
  const valid = await statusActionFormRef.value?.validate().catch(() => false);
  if (!valid) {
    return;
  }
  if (
    quantity <= 0 ||
    quantity > Number(statusActionForm.value.availableQty || 0)
  ) {
    ElMessage.error("动作数量必须大于 0 且不能超过可用数量");
    return;
  }

  statusActionSubmitting.value = true;
  try {
    const response = await applyRdProcurementStatusAction(
      statusActionForm.value.requestId,
      {
        actionType: statusActionForm.value.actionType,
        lineId: statusActionForm.value.lineId,
        ...(statusActionForm.value.actionType === "ACCEPTANCE_CONFIRMED" &&
        statusActionForm.value.requiresMaterialBinding
          ? { materialId: statusActionForm.value.materialId }
          : {}),
        quantity: String(quantity),
        bizDate: statusActionForm.value.bizDate || undefined,
        referenceNo: statusActionForm.value.referenceNo || undefined,
        reason: statusActionForm.value.reason || undefined,
        note: statusActionForm.value.note || undefined,
      },
    );
    const detail = response.data || detailRow.value;
    detailRow.value = detail;
    if (detail?.id) {
      detailRows.value = {
        ...detailRows.value,
        [detail.id]: detail,
      };
    }
    statusActionOpen.value = false;
    ElMessage.success("状态已更新");
    loadRows();
  } catch (error) {
    if (error?.response?.status === 409) {
      ElMessage.warning("该采购行已由其他操作绑定，请刷新后重试");
    }
  } finally {
    statusActionSubmitting.value = false;
  }
}

function syncDetailViewportWidth() {
  detailViewportWidth.value = tableWrapRef.value?.clientWidth || 0;
}

onMounted(() => {
  syncDetailViewportWidth();
  tableWrapResizeObserver = new ResizeObserver(syncDetailViewportWidth);
  if (tableWrapRef.value) {
    tableWrapResizeObserver.observe(tableWrapRef.value);
  }
  loadRows();
});

onBeforeUnmount(() => {
  tableWrapResizeObserver?.disconnect();
});
</script>

<style scoped lang="scss">
.procurement-page {
  box-sizing: border-box;
  display: flex;
  height: calc(100vh - 84px);
  overflow: hidden;
}

.procurement-card {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-height: 0;
}

.procurement-card :deep(> .el-card__header) {
  flex: none;
}

.procurement-card :deep(> .el-card__body) {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-height: 0;
}

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
  flex: none;
  margin-bottom: 16px;
}

.toolbar {
  flex: none;
  margin-bottom: 16px;
}

.procurement-table-wrap {
  flex: 1;
  min-height: 0;
}

.status-tag-wrap {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.status-action-wrap {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 10px;
  white-space: nowrap;
}

.status-action-wrap :deep(.el-button + .el-button) {
  margin-left: 0;
}

.binding-tag-wrap {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 4px;
  color: var(--el-text-color-secondary);
  font-size: 12px;
}

.line-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin: 8px 0 12px;
}

.required-column-header::before {
  content: "*";
  color: var(--el-color-danger);
  margin-right: 4px;
}

.section-title {
  font-size: 15px;
  font-weight: 600;
}

.pagination-wrap {
  display: flex;
  flex: none;
  justify-content: flex-end;
  margin-top: 16px;
}

.expanded-detail {
  position: sticky;
  left: 0;
  z-index: 1;
  box-sizing: border-box;
  min-width: 0;
  min-height: 72px;
  padding: 12px 0 16px 16px;
  background: var(--el-fill-color-lighter);
  overflow: hidden;
}

.detail-table {
  width: 100%;
}

.procurement-table-wrap :deep(.el-table__expanded-cell) {
  padding: 0;
}

</style>
