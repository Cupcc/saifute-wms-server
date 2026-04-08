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
        <el-table-column label="当前状态链" min-width="260">
          <template #default="{ row }">
            <div class="status-tag-wrap">
              <el-tag
                v-for="item in buildStatusTags(row.lines || [])"
                :key="`${row.id}-${item.key}`"
                :type="item.type"
                effect="plain"
              >
                {{ item.label }} {{ item.value }}
              </el-tag>
              <span v-if="buildStatusTags(row.lines || []).length === 0">-</span>
            </div>
          </template>
        </el-table-column>
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
          <el-descriptions-item label="关联车间">
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
          <el-table-column label="状态分布" min-width="320">
            <template #default="{ row }">
              <div class="status-tag-wrap">
                <el-tag
                  v-for="item in buildStatusTags([row])"
                  :key="`${row.id}-${item.key}`"
                  :type="item.type"
                  effect="plain"
                >
                  {{ item.label }} {{ item.value }}
                </el-tag>
                <span v-if="buildStatusTags([row]).length === 0">-</span>
              </div>
            </template>
          </el-table-column>
          <el-table-column prop="remark" label="备注" min-width="160" />
          <el-table-column label="状态动作" min-width="220">
            <template #default="{ row }">
              <el-button
                link
                type="primary"
                v-hasPermi="['rd:procurement-request:status-action']"
                :disabled="Number(row.statusLedger?.pendingQty || 0) <= 0"
                @click="openStatusAction(row, 'PROCUREMENT_STARTED')"
              >
                采购中
              </el-button>
              <el-button
                link
                type="warning"
                v-hasPermi="['rd:procurement-request:status-action']"
                :disabled="getCancelableQty(row) <= 0"
                @click="openStatusAction(row, 'MANUAL_CANCELLED')"
              >
                取消
              </el-button>
              <el-button
                link
                type="danger"
                v-hasPermi="['rd:procurement-request:return-action']"
                :disabled="Number(row.statusLedger?.handedOffQty || 0) <= 0"
                @click="openStatusAction(row, 'MANUAL_RETURNED')"
              >
                退回
              </el-button>
            </template>
          </el-table-column>
        </el-table>

        <div class="section-title detail-section">状态历史</div>
        <el-table :data="flattenStatusHistories(detailRow)" stripe>
          <el-table-column prop="lineNo" label="行号" width="80" />
          <el-table-column prop="materialName" label="物料" min-width="180" />
          <el-table-column prop="eventLabel" label="事件" min-width="140" />
          <el-table-column label="状态迁移" min-width="180">
            <template #default="{ row }">
              {{ row.fromStatusLabel || "起点" }} -> {{ row.toStatusLabel }}
            </template>
          </el-table-column>
          <el-table-column prop="quantity" label="数量" min-width="100" />
          <el-table-column prop="referenceNo" label="Reference" min-width="140" />
          <el-table-column prop="reason" label="原因" min-width="180" />
          <el-table-column prop="sourceDocumentNumber" label="来源单号" min-width="160" />
          <el-table-column label="发生时间" min-width="180">
            <template #default="{ row }">
              {{ formatDateTime(row.createdAt) }}
            </template>
          </el-table-column>
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
          <el-table-column prop="workshopNameSnapshot" label="入库关联部门" min-width="120" />
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

    <el-dialog
      v-model="statusActionOpen"
      :title="statusActionTitle"
      width="520px"
    >
      <el-form label-width="100px">
        <el-form-item label="物料">
          <el-input :model-value="statusActionForm.materialName" disabled />
        </el-form-item>
        <el-form-item label="可用数量">
          <el-input :model-value="formatQty(statusActionForm.availableQty)" disabled />
        </el-form-item>
        <el-form-item label="动作数量">
          <el-input-number
            v-model="statusActionForm.quantity"
            :min="0.000001"
            :max="statusActionForm.availableQty || undefined"
            :precision="6"
            controls-position="right"
            style="width: 100%"
          />
        </el-form-item>
        <el-form-item
          v-if="statusActionForm.actionType === 'MANUAL_RETURNED'"
          label="Reference"
        >
          <el-input
            v-model="statusActionForm.referenceNo"
            placeholder="请输入真实 reference"
          />
        </el-form-item>
        <el-form-item
          :label="statusActionForm.actionType === 'MANUAL_RETURNED' ? '原因' : '说明'"
        >
          <el-input
            v-model="statusActionForm.reason"
            type="textarea"
            :rows="3"
            :placeholder="
              statusActionForm.actionType === 'MANUAL_RETURNED'
                ? '退回必须填写 reason'
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
import { computed, onMounted, ref } from "vue";
import { listPersonnel } from "@/api/base/personnel";
import { listSupplierByKeyword } from "@/api/base/supplier";
import {
  applyRdProcurementStatusAction,
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
const statusActionOpen = ref(false);
const statusActionSubmitting = ref(false);
const statusActionForm = ref(createEmptyStatusActionForm());
const filters = ref({
  documentNo: "",
  projectCode: "",
  projectName: "",
});
const form = ref(createEmptyForm());

const workshopLabel = computed(
  () => userStore.stockScope?.stockScopeName || "未绑定研发小仓",
);
const canCreate = computed(
  () =>
    Boolean(userStore.stockScope?.stockScope) &&
    Boolean(userStore.workshopScope?.workshopId),
);
const statusActionTitle = computed(() => {
  switch (statusActionForm.value.actionType) {
    case "PROCUREMENT_STARTED":
      return "推进到采购中";
    case "MANUAL_CANCELLED":
      return "回写取消";
    case "MANUAL_RETURNED":
      return "回写退回";
    default:
      return "状态动作";
  }
});

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

function createEmptyStatusActionForm() {
  return {
    requestId: null,
    lineId: null,
    actionType: "PROCUREMENT_STARTED",
    materialName: "",
    availableQty: 0,
    quantity: 0,
    referenceNo: "",
    reason: "",
    note: "",
  };
}

function formatDate(value) {
  if (!value) {
    return "-";
  }
  return new Date(value).toLocaleDateString("zh-CN");
}

function formatDateTime(value) {
  if (!value) {
    return "-";
  }
  return new Date(value).toLocaleString("zh-CN", { hour12: false });
}

function formatQty(value) {
  return Number(value || 0).toFixed(6);
}

function mapStatusLabel(status) {
  const labels = {
    PENDING_PROCUREMENT: "待采购",
    IN_PROCUREMENT: "采购中",
    CANCELLED: "取消",
    ACCEPTED: "验收",
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

function mapEventLabel(eventType) {
  const labels = {
    REQUEST_CREATED: "需求创建",
    PROCUREMENT_STARTED: "推进采购中",
    MANUAL_CANCELLED: "手工取消",
    ACCEPTANCE_CONFIRMED: "主仓验收",
    HANDOFF_CONFIRMED: "主仓交接",
    SCRAP_CONFIRMED: "本仓报废",
    MANUAL_RETURNED: "手工退回",
    FACT_ROLLBACK: "事实回滚",
    REQUEST_VOIDED: "需求作废",
  };
  return labels[eventType] || eventType;
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
      value: value.toFixed(6),
      type: mapStatusTagType(status),
    }));
}

function flattenStatusHistories(request) {
  return (request?.lines || []).flatMap((line) =>
    (line.statusHistories || []).map((history) => ({
      id: history.id,
      lineNo: line.lineNo,
      materialName: line.materialNameSnapshot,
      eventLabel: mapEventLabel(history.eventType),
      fromStatusLabel: history.fromStatus
        ? mapStatusLabel(history.fromStatus)
        : "",
      toStatusLabel: mapStatusLabel(history.toStatus),
      quantity: history.quantity,
      referenceNo: history.referenceNo || "-",
      reason: history.reason || "-",
      sourceDocumentNumber: history.sourceDocumentNumber || "-",
      createdAt: history.createdAt,
    })),
  );
}

function getCancelableQty(line) {
  return (
    Number(line?.statusLedger?.pendingQty || 0) +
    Number(line?.statusLedger?.inProcurementQty || 0)
  );
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
    ElMessage.error("当前账号未完成研发库存范围或业务车间绑定，无法录入采购需求");
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

function openStatusAction(line, actionType) {
  const availableQty =
    actionType === "PROCUREMENT_STARTED"
      ? Number(line.statusLedger?.pendingQty || 0)
      : actionType === "MANUAL_CANCELLED"
        ? getCancelableQty(line)
        : Number(line.statusLedger?.handedOffQty || 0);

  statusActionForm.value = {
    requestId: detailRow.value?.id || null,
    lineId: line.id,
    actionType,
    materialName: `${line.materialCodeSnapshot} ${line.materialNameSnapshot}`,
    availableQty,
    quantity: availableQty,
    referenceNo: "",
    reason: "",
    note: "",
  };
  statusActionOpen.value = true;
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

async function submitStatusAction() {
  const quantity = Number(statusActionForm.value.quantity || 0);
  if (!statusActionForm.value.requestId || !statusActionForm.value.lineId) {
    ElMessage.error("状态动作上下文丢失，请重新打开详情");
    return;
  }
  if (
    quantity <= 0 ||
    quantity > Number(statusActionForm.value.availableQty || 0)
  ) {
    ElMessage.error("动作数量必须大于 0 且不能超过可用数量");
    return;
  }
  if (
    statusActionForm.value.actionType === "MANUAL_RETURNED" &&
    (!statusActionForm.value.referenceNo.trim() ||
      !statusActionForm.value.reason.trim())
  ) {
    ElMessage.error("退回动作必须填写 reference 和原因");
    return;
  }

  statusActionSubmitting.value = true;
  try {
    const response = await applyRdProcurementStatusAction(
      statusActionForm.value.requestId,
      {
        actionType: statusActionForm.value.actionType,
        lineId: statusActionForm.value.lineId,
        quantity: String(quantity),
        referenceNo: statusActionForm.value.referenceNo || undefined,
        reason: statusActionForm.value.reason || undefined,
        note: statusActionForm.value.note || undefined,
      },
    );
    detailRow.value = response.data || detailRow.value;
    statusActionOpen.value = false;
    ElMessage.success("状态已更新");
    loadRows();
  } finally {
    statusActionSubmitting.value = false;
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

.status-tag-wrap {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
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
