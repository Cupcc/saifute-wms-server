<template>
  <div class="app-container">
    <el-card shadow="never">
      <template #header>
        <div class="page-header">
          <div>
            <div>主仓交接单</div>
            <div class="page-subtitle">交接确认后自动入库本仓</div>
          </div>
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
        <el-form-item label="状态">
          <el-select v-model="filters.lifecycleStatus" style="width: 120px">
            <el-option label="全部" value="" />
            <el-option label="有效" value="EFFECTIVE" />
            <el-option label="已作废" value="VOIDED" />
          </el-select>
        </el-form-item>
        <el-form-item>
          <el-button type="primary" @click="handleSearch">查询</el-button>
          <el-button @click="handleReset">重置</el-button>
        </el-form-item>
      </el-form>

      <div class="toolbar">
        <el-button
          type="primary"
          v-hasPermi="['rd:handoff-order:create']"
          @click="openCreateDialog"
        >
          新建交接
        </el-button>
      </div>

      <adaptive-table
        column-preferences
        :fit-viewport="false"
        :data="rows"
        stripe
        v-loading="loading"
      >
        <template #empty>
          <el-empty description="暂无主仓交接单，完成主仓交接后自动生成" />
        </template>
        <el-table-column prop="documentNo" label="单据编号" min-width="140">
          <template #default="{ row }">
            <el-button link type="primary" @click="openDetail(row.id)">
              {{ row.documentNo }}
            </el-button>
          </template>
        </el-table-column>
        <el-table-column label="业务日期" min-width="120">
          <template #default="{ row }">
            {{ formatDateValue(row.bizDate) }}
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
        <el-table-column label="研发项目" min-width="220" show-overflow-tooltip>
          <template #default="{ row }">
            {{ formatOrderProjectLabels(row.lines) }}
          </template>
        </el-table-column>
        <el-table-column label="总数量" min-width="130" class-name="numeric-column">
          <template #default="{ row }">
            {{ formatQty(row.totalQty) }}
          </template>
        </el-table-column>
        <el-table-column label="总金额（结算）" min-width="140" class-name="numeric-column">
          <template #default="{ row }">
            {{ formatAmount(row.totalAmount) }}
          </template>
        </el-table-column>
        <el-table-column label="明细数" min-width="100">
          <template #default="{ row }">
            {{ row.lines?.length || 0 }}
          </template>
        </el-table-column>
        <el-table-column label="状态" min-width="100">
          <template #default="{ row }">
            <el-tag :type="row.lifecycleStatus === 'VOIDED' ? 'info' : 'success'">
              {{ row.lifecycleStatus === "VOIDED" ? "已作废" : "有效" }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="remark" label="备注" min-width="180" />
        <el-table-column label="操作" width="140" fixed="right">
          <template #default="{ row }">
            <el-button link type="primary" @click="openDetail(row.id)">详情</el-button>
            <el-button
              v-if="row.lifecycleStatus === 'EFFECTIVE'"
              link
              type="danger"
              v-hasPermi="['rd:handoff-order:void']"
              @click="handleVoid(row.id)"
            >
              作废
            </el-button>
          </template>
        </el-table-column>
      </adaptive-table>

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
      title="新建主仓交接单"
      width="min(1100px, 92%)"
      :close-on-click-modal="false"
      :before-close="handleCreateDialogBeforeClose"
    >
      <el-form ref="createFormRef" :model="form" :rules="formRules" label-width="100px">
        <el-row :gutter="16">
          <el-col :span="12">
            <el-form-item label="单据编号">
              <el-input v-model="form.documentNo" disabled placeholder="保存后自动生成" />
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
                @focus="handlePersonnelFocus"
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
          <el-col :span="12">
            <el-form-item label="备注">
              <el-input v-model="form.remark" type="textarea" :rows="2" />
            </el-form-item>
          </el-col>
        </el-row>

        <div class="line-toolbar">
          <div class="section-title">交接明细</div>
          <el-button type="primary" plain @click="addLine">添加明细</el-button>
        </div>

        <el-alert
          v-if="unboundAcceptedSourceCount > 0"
          class="source-binding-alert"
          :title="`${unboundAcceptedSourceCount} 条已验收采购品项尚未绑定物料，需先回到采购需求登记验收并完成绑定。`"
          type="warning"
          :closable="false"
          show-icon
        />

        <el-table :data="form.lines" border stripe>
          <el-table-column min-width="340">
            <template #header>
              <span class="required-column-header">来源采购行</span>
            </template>
            <template #default="{ row }">
              <el-select
                v-model="row.sourceKey"
                filterable
                remote
                reserve-keyword
                clearable
                placeholder="请输入需求单号、项目或物料搜索"
                :remote-method="searchProcurementSources"
                :loading="procurementSourceLoading"
                style="width: 100%"
                @change="(value) => handleProcurementSourceChange(value, row)"
              >
                <el-option
                  v-for="item in procurementSourceSelectOptions"
                  :key="item.key"
                  :label="item.label"
                  :value="item.key"
                />
              </el-select>
            </template>
          </el-table-column>
          <el-table-column label="物料" min-width="220">
            <template #default="{ row }">
              {{ row.materialLabel || "-" }}
            </template>
          </el-table-column>
          <el-table-column label="待交接数量" min-width="130" class-name="numeric-column">
            <template #default="{ row }">
              {{ row.sourceDocumentLineId ? formatQty(row.maxQuantity) : "-" }}
            </template>
          </el-table-column>
          <el-table-column min-width="170" class-name="numeric-column">
            <template #header>
              <span class="required-column-header">交接数量</span>
            </template>
            <template #default="{ row }">
              <el-input-number
                v-model="row.quantity"
                :min="0.000001"
                :max="row.maxQuantity || undefined"
                :precision="2"
                controls-position="right"
                style="width: 100%"
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
              <el-button link type="danger" @click="removeLine($index)">删除</el-button>
            </template>
          </el-table-column>
        </el-table>
      </el-form>

      <template #footer>
        <el-button @click="handleCreateCancel">取消</el-button>
        <el-button type="primary" :loading="submitting" @click="submitCreate">
          提交
        </el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="detailOpen" title="主仓交接单详情" width="min(1100px, 92%)">
      <div v-loading="detailLoading" class="detail-body">
        <template v-if="detailRow">
          <el-descriptions :column="2" border class="detail-descriptions">
            <el-descriptions-item label="单据编号">
              {{ detailRow.documentNo }}
            </el-descriptions-item>
            <el-descriptions-item label="业务日期">
              {{ formatDateValue(detailRow.bizDate) }}
            </el-descriptions-item>
            <el-descriptions-item label="来源车间">
              {{ detailRow.sourceWorkshopNameSnapshot || "-" }}
            </el-descriptions-item>
            <el-descriptions-item label="目标车间">
              {{ detailRow.targetWorkshopNameSnapshot || "-" }}
            </el-descriptions-item>
            <el-descriptions-item label="经办人">
              {{ detailRow.handlerNameSnapshot || "-" }}
            </el-descriptions-item>
            <el-descriptions-item label="状态">
              <el-tag :type="detailRow.lifecycleStatus === 'VOIDED' ? 'info' : 'success'">
                {{ detailRow.lifecycleStatus === "VOIDED" ? "已作废" : "有效" }}
              </el-tag>
            </el-descriptions-item>
            <el-descriptions-item label="总数量">
              {{ formatQty(detailRow.totalQty) }}
            </el-descriptions-item>
            <el-descriptions-item label="总金额（结算）">
              {{ formatAmount(detailRow.totalAmount) }}
            </el-descriptions-item>
            <el-descriptions-item label="备注">
              {{ detailRow.remark || "-" }}
            </el-descriptions-item>
            <el-descriptions-item v-if="detailRow.lifecycleStatus === 'VOIDED'" label="作废原因">
              {{ detailRow.voidReason || "-" }}
            </el-descriptions-item>
          </el-descriptions>

          <el-table
            :data="detailRow.lines || []"
            stripe
            class="detail-table"
            show-summary
            :summary-method="getDetailSummaries"
          >
            <el-table-column prop="lineNo" label="行号" width="80" />
            <el-table-column label="来源采购行" min-width="200">
              <template #default="{ row }">
                {{ formatSourceLineRef(row) }}
              </template>
            </el-table-column>
            <el-table-column prop="rdProjectCodeSnapshot" label="研发项目编码" min-width="160" />
            <el-table-column prop="rdProjectNameSnapshot" label="研发项目名称" min-width="180" />
            <el-table-column prop="materialCodeSnapshot" label="物料编码" min-width="140" />
            <el-table-column prop="materialNameSnapshot" label="物料名称" min-width="180" />
            <el-table-column prop="materialSpecSnapshot" label="规格型号" min-width="140" />
            <el-table-column prop="quantity" label="数量" min-width="130" class-name="numeric-column">
              <template #default="{ row }">
                {{ formatQty(row.quantity) }}
              </template>
            </el-table-column>
            <el-table-column prop="unitPrice" label="单价（录入）" min-width="135" class-name="numeric-column">
              <template #default="{ row }">
                {{ formatAmount(row.unitPrice) }}
              </template>
            </el-table-column>
            <el-table-column prop="amount" label="金额（录入）" min-width="135" class-name="numeric-column">
              <template #default="{ row }">
                {{ formatAmount(row.amount) }}
              </template>
            </el-table-column>
            <el-table-column prop="costUnitPrice" label="结算单价" min-width="135" class-name="numeric-column">
              <template #default="{ row }">
                {{ formatAmount(row.costUnitPrice) }}
              </template>
            </el-table-column>
            <el-table-column prop="costAmount" label="结算金额" min-width="135" class-name="numeric-column">
              <template #default="{ row }">
                {{ formatAmount(row.costAmount) }}
              </template>
            </el-table-column>
            <el-table-column prop="remark" label="备注" min-width="160" />
          </el-table>
        </template>
      </div>
    </el-dialog>
  </div>
</template>

<script setup name="RdInboundResultsPage">
import { ElMessage, ElMessageBox } from "element-plus";
import { computed, onMounted, ref } from "vue";
import { useRoute } from "vue-router";
import { listPersonnel } from "@/api/base/personnel";
import {
  createRdHandoffOrder,
  getRdHandoffOrder,
  getRdProcurementRequest,
  listRdInboundResults,
  listRdProcurementRequests,
  voidRdHandoffOrder,
} from "@/api/rd-subwarehouse";
import useUserStore from "@/store/modules/user";
import { confirmDocumentSave } from "@/utils/documentConfirm";
import { formatAmount, formatQty } from "@/utils/format";
import { formatDateOnly, formatDateValue } from "@/utils/rd-documents";

const route = useRoute();
const userStore = useUserStore();
const loading = ref(false);
const submitting = ref(false);
const personnelLoading = ref(false);
const personnelPreloaded = ref(false);
const procurementSourceLoading = ref(false);
const unboundAcceptedSourceCount = ref(0);
const rows = ref([]);
const total = ref(0);
const pageNum = ref(1);
const pageSize = ref(10);
const personnelOptions = ref([]);
const procurementSourceOptions = ref([]);
const selectedSourceOptions = ref({});
const sourceDocumentRefCache = ref({});
const createOpen = ref(false);
const createFormRef = ref();
const createClientRequestId = ref("");
const createFormSnapshot = ref("");
const detailOpen = ref(false);
const detailLoading = ref(false);
const detailRow = ref(null);
const dateRange = ref(getDefaultBizDateRange());
const filters = ref({
  documentNo: "",
  lifecycleStatus: "",
});
const form = ref(createEmptyForm());

const workshopLabel = computed(
  () => userStore.stockScope?.stockScopeName || "研发小仓",
);
const formRules = {
  bizDate: [{ required: true, message: "请选择业务日期", trigger: "change" }],
};
const procurementSourceSelectOptions = computed(() => {
  const searchKeys = new Set(
    procurementSourceOptions.value.map((item) => item.key),
  );
  const cachedSelected = Object.values(selectedSourceOptions.value).filter(
    (item) => item && !searchKeys.has(item.key),
  );
  return [...cachedSelected, ...procurementSourceOptions.value];
});

function getDefaultBizDateRange() {
  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - 30);
  return [formatDateOnly(start), formatDateOnly(end)];
}

function createEmptyLine() {
  return {
    sourceKey: "",
    sourceDocumentType: "RdProcurementRequest",
    sourceDocumentId: "",
    sourceDocumentLineId: "",
    materialId: null,
    materialLabel: "",
    maxQuantity: 0,
    quantity: null,
    remark: "",
  };
}

function createEmptyForm() {
  return {
    documentNo: "",
    bizDate: formatDateOnly(),
    handlerPersonnelId: null,
    remark: "",
    lines: [createEmptyLine()],
  };
}

function formatOrderProjectLabels(lines) {
  const labels = [...new Set(
    (lines || [])
      .map((line) => {
        if (line.rdProjectCodeSnapshot && line.rdProjectNameSnapshot) {
          return `${line.rdProjectCodeSnapshot} ${line.rdProjectNameSnapshot}`;
        }
        return line.rdProjectNameSnapshot || line.rdProjectCodeSnapshot || null;
      })
      .filter(Boolean),
  )];
  return labels.length > 0 ? labels.join("、") : "-";
}

function formatSourceLineRef(row) {
  if (!row.sourceDocumentId || !row.sourceDocumentLineId) {
    return "-";
  }
  const cached =
    row.sourceDocumentType === "RdProcurementRequest"
      ? sourceDocumentRefCache.value[row.sourceDocumentId]
      : null;
  if (cached?.documentNo) {
    const lineNo = cached.lineNoById?.[row.sourceDocumentLineId];
    return lineNo ? `${cached.documentNo} / 行${lineNo}` : cached.documentNo;
  }
  return `需求 ${row.sourceDocumentId} / 行 ${row.sourceDocumentLineId}`;
}

async function resolveSourceDocumentRefs(lines) {
  const pendingIds = [
    ...new Set(
      (lines || [])
        .filter(
          (line) =>
            line.sourceDocumentType === "RdProcurementRequest" &&
            line.sourceDocumentId,
        )
        .map((line) => line.sourceDocumentId),
    ),
  ].filter((id) => !sourceDocumentRefCache.value[id]);
  await Promise.all(
    pendingIds.map(async (id) => {
      try {
        const response = await getRdProcurementRequest(id);
        const detail = response.data;
        if (!detail?.documentNo) {
          return;
        }
        sourceDocumentRefCache.value[id] = {
          documentNo: detail.documentNo,
          lineNoById: Object.fromEntries(
            (detail.lines || []).map((line) => [line.id, line.lineNo]),
          ),
        };
      } catch {
        // Fall back to raw IDs when the source request lookup fails.
      }
    }),
  );
}

function getDetailSummaries({ columns, data }) {
  return columns.map((column, index) => {
    if (index === 0) {
      return "合计";
    }
    if (column.property === "quantity") {
      return formatQty(
        data.reduce((sum, row) => sum + Number(row.quantity || 0), 0),
      );
    }
    if (column.property === "costAmount") {
      const hasCost = data.some(
        (row) =>
          row.costAmount !== null &&
          row.costAmount !== undefined &&
          row.costAmount !== "",
      );
      if (!hasCost) {
        return "-";
      }
      return formatAmount(
        data.reduce((sum, row) => sum + Number(row.costAmount || 0), 0),
      );
    }
    return "";
  });
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
    // Interceptor already toasts the error.
  } finally {
    personnelLoading.value = false;
  }
}

function handlePersonnelFocus() {
  if (personnelPreloaded.value) {
    return;
  }
  personnelPreloaded.value = true;
  searchPersonnelOptions("");
}

async function searchProcurementSources(keyword) {
  procurementSourceLoading.value = true;
  try {
    const response = await listRdProcurementRequests({
      keyword: keyword || undefined,
      limit: 20,
      offset: 0,
    });
    const requests = response.data?.items || [];
    unboundAcceptedSourceCount.value = requests.reduce(
      (count, request) =>
        count +
        (request.lines || []).filter(
          (line) =>
            Number(line.statusLedger?.acceptedQty || 0) > 0 &&
            line.materialId == null,
        ).length,
      0,
    );
    procurementSourceOptions.value = requests.flatMap((request) =>
      (request.lines || [])
        .filter(
          (line) =>
            Number(line.statusLedger?.acceptedQty || 0) > 0 &&
            line.materialId != null,
        )
        .map((line) => ({
          key: `${request.id}:${line.id}`,
          requestId: request.id,
          requestLineId: line.id,
          materialId: line.materialId,
          materialLabel: formatProcurementBoundMaterial(line),
          acceptedQty: Number(line.statusLedger?.acceptedQty || 0),
          label: `${request.documentNo} / 行${line.lineNo} / ${formatProcurementBoundMaterial(line)} / 待交接 ${formatQty(line.statusLedger?.acceptedQty)}`,
        })),
    );
  } catch {
    // Interceptor already toasts the error.
  } finally {
    procurementSourceLoading.value = false;
  }
}

function formatProcurementBoundMaterial(line) {
  const materialCode =
    line.material?.materialCode || line.materialCodeSnapshot || "";
  const materialName =
    line.material?.materialName || line.materialNameSnapshot || "";
  return `${materialCode} ${materialName}`.trim();
}

function handleProcurementSourceChange(value, row) {
  if (!value) {
    row.sourceKey = "";
    row.sourceDocumentType = "RdProcurementRequest";
    row.sourceDocumentId = "";
    row.sourceDocumentLineId = "";
    row.materialId = null;
    row.materialLabel = "";
    row.maxQuantity = 0;
    return;
  }
  const selected = procurementSourceSelectOptions.value.find(
    (item) => item.key === value,
  );
  if (!selected) {
    return;
  }
  selectedSourceOptions.value[selected.key] = selected;
  row.sourceKey = selected.key;
  row.sourceDocumentType = "RdProcurementRequest";
  row.sourceDocumentId = selected.requestId;
  row.sourceDocumentLineId = selected.requestLineId;
  row.materialId = selected.materialId;
  row.materialLabel = selected.materialLabel;
  row.maxQuantity = selected.acceptedQty;
  if (
    Number(row.quantity || 0) <= 0 ||
    Number(row.quantity || 0) > selected.acceptedQty
  ) {
    row.quantity = selected.acceptedQty;
  }
}

async function loadRows() {
  loading.value = true;
  try {
    const response = await listRdInboundResults({
      documentNo: filters.value.documentNo || undefined,
      lifecycleStatus: filters.value.lifecycleStatus || undefined,
      bizDateFrom: dateRange.value?.[0] || undefined,
      bizDateTo: dateRange.value?.[1] || undefined,
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
  filters.value.documentNo = "";
  filters.value.lifecycleStatus = "";
  dateRange.value = getDefaultBizDateRange();
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
  form.value = createEmptyForm();
  createClientRequestId.value = crypto.randomUUID();
  createFormSnapshot.value = JSON.stringify(form.value);
  createFormRef.value?.clearValidate();
  searchProcurementSources("");
  createOpen.value = true;
}

function isCreateFormDirty() {
  return JSON.stringify(form.value) !== createFormSnapshot.value;
}

async function handleCreateDialogBeforeClose(done) {
  if (submitting.value) {
    return;
  }
  if (!isCreateFormDirty()) {
    done();
    return;
  }
  try {
    await ElMessageBox.confirm(
      "关闭后已填写的内容将不会保存，确认关闭吗？",
      "系统提示",
      {
        confirmButtonText: "确认关闭",
        cancelButtonText: "继续编辑",
        type: "warning",
      },
    );
    done();
  } catch {
    // Keep editing.
  }
}

function handleCreateCancel() {
  handleCreateDialogBeforeClose(() => {
    createOpen.value = false;
  });
}

async function openDetail(orderId) {
  detailRow.value = null;
  detailOpen.value = true;
  detailLoading.value = true;
  try {
    const response = await getRdHandoffOrder(orderId);
    detailRow.value = response.data || null;
    await resolveSourceDocumentRefs(detailRow.value?.lines || []);
  } catch {
    // Interceptor already toasts the error.
  } finally {
    detailLoading.value = false;
  }
}

function isBlankLine(line) {
  return (
    !line.sourceDocumentLineId &&
    !line.materialId &&
    (line.quantity === null ||
      line.quantity === undefined ||
      line.quantity === "")
  );
}

function getEffectiveLines() {
  return form.value.lines.filter((line) => !isBlankLine(line));
}

async function validateForm() {
  const valid = await createFormRef.value?.validate().catch(() => false);
  if (!valid) {
    return false;
  }
  if (getEffectiveLines().length === 0) {
    ElMessage.error("至少需要一条交接明细");
    return false;
  }

  const totalsBySourceLine = new Map();
  for (let index = 0; index < form.value.lines.length; index += 1) {
    const line = form.value.lines[index];
    if (isBlankLine(line)) {
      continue;
    }
    if (!line.sourceDocumentId || !line.sourceDocumentLineId) {
      ElMessage.error(`第 ${index + 1} 行请选择来源采购行`);
      return false;
    }
    if (!line.materialId) {
      ElMessage.error(`第 ${index + 1} 行物料不能为空`);
      return false;
    }
    if (!line.quantity || Number(line.quantity) <= 0) {
      ElMessage.error(`第 ${index + 1} 行数量必须大于 0`);
      return false;
    }
    if (Number(line.quantity) > Number(line.maxQuantity || 0)) {
      ElMessage.error(
        `第 ${index + 1} 行数量不能超过待交接数量 ${formatQty(line.maxQuantity)}`,
      );
      return false;
    }
    const key = `${line.sourceDocumentType}:${line.sourceDocumentId}:${line.sourceDocumentLineId}`;
    const entry = totalsBySourceLine.get(key) || {
      total: 0,
      maxQuantity: Number(line.maxQuantity || 0),
      materialLabel: line.materialLabel,
    };
    entry.total += Number(line.quantity || 0);
    totalsBySourceLine.set(key, entry);
  }

  for (const entry of totalsBySourceLine.values()) {
    if (entry.total > entry.maxQuantity) {
      ElMessage.error(
        `物料 ${entry.materialLabel} 多行共用同一来源采购行，合计数量 ${formatQty(entry.total)} 超过待交接数量 ${formatQty(entry.maxQuantity)}`,
      );
      return false;
    }
  }

  return true;
}

async function submitCreate() {
  if (!(await validateForm())) {
    return;
  }

  if (!(await confirmDocumentSave({ documentName: "主仓交接单" }))) {
    return;
  }
  submitting.value = true;
  try {
    await createRdHandoffOrder({
      clientRequestId: createClientRequestId.value,
      bizDate: form.value.bizDate,
      handlerPersonnelId: form.value.handlerPersonnelId || undefined,
      remark: form.value.remark || undefined,
      lines: getEffectiveLines().map((line) => ({
        materialId: line.materialId,
        sourceDocumentType: line.sourceDocumentType,
        sourceDocumentId: line.sourceDocumentId,
        sourceDocumentLineId: line.sourceDocumentLineId,
        quantity: String(line.quantity),
        remark: line.remark || undefined,
      })),
    });
    ElMessage.success("主仓交接单已创建");
    createOpen.value = false;
    loadRows();
  } catch {
    // Interceptor already toasts the error.
  } finally {
    submitting.value = false;
  }
}

async function handleVoid(orderId) {
  let voidReason;
  try {
    const result = await ElMessageBox.prompt("请输入作废原因", "作废主仓交接单", {
      confirmButtonText: "确认",
      cancelButtonText: "取消",
    });
    voidReason = result.value;
  } catch {
    return;
  }
  try {
    await voidRdHandoffOrder(orderId, {
      voidReason: voidReason?.trim() || undefined,
    });
    ElMessage.success("主仓交接单已作废");
    loadRows();
  } catch {
    // Interceptor already toasts the error.
  }
}

onMounted(() => {
  const documentNo = route.query.documentNo;
  if (documentNo) {
    filters.value.documentNo = String(documentNo);
    dateRange.value = [];
  }
  loadRows();
});
</script>

<style scoped lang="scss">
.page-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.page-subtitle {
  margin-top: 2px;
  color: #909399;
  font-size: 13px;
  font-weight: 400;
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

.source-binding-alert {
  margin-bottom: 12px;
}

.section-title {
  font-size: 15px;
  font-weight: 600;
}

.required-column-header::before {
  content: "*";
  margin-right: 4px;
  color: var(--el-color-danger);
}

.pagination-wrap {
  display: flex;
  justify-content: flex-end;
  margin-top: 16px;
}

.detail-body {
  min-height: 160px;
}

.detail-descriptions {
  margin-bottom: 16px;
}
</style>
