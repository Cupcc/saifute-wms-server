<template>
  <div class="app-container">
    <el-alert
      :title="alertMessage"
      type="info"
      :closable="false"
      show-icon
      style="margin-bottom: 16px"
    />

    <el-form
      ref="queryRef"
      :model="queryParams"
      :inline="true"
      v-show="showSearch"
      label-width="84px"
    >
      <el-form-item :label="documentLabel" prop="documentNo">
        <el-input
          v-model="queryParams.documentNo"
          :placeholder="documentPlaceholder"
          clearable
          style="width: 240px"
          @keyup.enter="handleQuery"
        />
      </el-form-item>
      <el-form-item label="业务日期">
        <el-date-picker
          v-model="daterangeBizDate"
          value-format="YYYY-MM-DD"
          type="daterange"
          range-separator="-"
          start-placeholder="开始日期"
          end-placeholder="结束日期"
        />
      </el-form-item>
      <el-form-item label="客户" prop="customerId">
        <el-select
          v-model="queryParams.customerId"
          filterable
          remote
          reserve-keyword
          clearable
          placeholder="请输入客户名称搜索"
          :remote-method="searchCustomer"
          :loading="customerLoading"
          style="width: 240px"
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
      <el-form-item label="车间" prop="workshopId">
        <el-select
          v-model="queryParams.workshopId"
          filterable
          remote
          reserve-keyword
          clearable
          placeholder="请输入车间名称搜索"
          :remote-method="searchWorkshop"
          :loading="workshopLoading"
          style="width: 240px"
        >
          <el-option
            v-for="item in workshopOptions"
            :key="item.workshopId"
            :label="item.workshopName"
            :value="item.workshopId"
          />
        </el-select>
      </el-form-item>
      <el-form-item
        v-if="showSourceOutbound"
        label="来源出库 ID"
        prop="sourceOutboundOrderId"
      >
        <el-input
          v-model="queryParams.sourceOutboundOrderId"
          placeholder="请输入来源出库 ID"
          clearable
          style="width: 180px"
          @keyup.enter="handleQuery"
        />
      </el-form-item>
      <el-form-item>
        <el-button type="primary" icon="Search" @click="handleQuery">搜索</el-button>
        <el-button icon="Refresh" @click="resetQuery">重置</el-button>
      </el-form-item>
    </el-form>

    <el-row :gutter="10" class="mb8">
      <el-col :span="1.5">
        <el-button
          type="primary"
          plain
          icon="Plus"
          v-hasPermi="[createPermission]"
          @click="handleAdd"
        >
          新增
        </el-button>
      </el-col>
      <el-col v-if="isOrderMode" :span="1.5">
        <el-button
          type="success"
          plain
          icon="Edit"
          :disabled="single"
          v-hasPermi="[updatePermission]"
          @click="handleUpdate()"
        >
          修改
        </el-button>
      </el-col>
      <el-col :span="1.5">
        <el-button
          type="danger"
          plain
          icon="Delete"
          :disabled="multiple"
          v-hasPermi="[voidPermission]"
          @click="handleVoid()"
        >
          作废
        </el-button>
      </el-col>
      <right-toolbar
        v-model:showSearch="showSearch"
        :columns="columns"
        @queryTable="getList"
      />
    </el-row>

    <adaptive-table
      border
      stripe
      v-loading="loading"
      :data="rows"
      @selection-change="handleSelectionChange"
    >
      <el-table-column type="selection" width="55" align="center" />
      <el-table-column
        v-if="columns[0].visible"
        label="单号"
        prop="documentNo"
        min-width="140"
        show-overflow-tooltip
      >
        <template #default="{ row }">
          <el-button link type="primary" @click="handleOpenDetail(row)">
            {{ row.documentNo }}
          </el-button>
        </template>
      </el-table-column>
      <el-table-column
        v-if="columns[1].visible"
        label="业务日期"
        prop="bizDate"
        width="200"
        sortable
        :sort-method="compareBizDateRows"
      >
        <template #default="{ row }">
          <span style="display: inline-flex; flex-direction: column; line-height: 1.35;">
            <span>{{ formatDate(row.bizDate) }}</span>
            <span style="font-size: 12px; color: #909399;">
              创建 {{ formatRecordDateTime(row.createdAt) }}
            </span>
          </span>
        </template>
      </el-table-column>
      <el-table-column
        v-if="columns[2].visible"
        label="客户"
        prop="customerName"
        min-width="180"
        show-overflow-tooltip
      />
      <el-table-column
        v-if="columns[3].visible"
        label="车间"
        prop="workshopName"
        min-width="120"
        show-overflow-tooltip
      />
      <el-table-column
        v-if="columns[4].visible"
        label="经手人"
        prop="handlerName"
        min-width="80"
        show-overflow-tooltip
      />
      <el-table-column
        v-if="showSourceOutbound && columns[5].visible"
        label="来源出库 ID"
        prop="sourceOutboundOrderId"
        width="120"
        align="center"
      />
      <el-table-column
        v-if="columns[quantityColumnIndex].visible"
        label="总数量"
        prop="totalQty"
        width="70"
        align="right"
      >
        <template #default="{ row }">
          {{ formatNumber(row.totalQty) }}
        </template>
      </el-table-column>
      <el-table-column
        v-if="columns[amountColumnIndex].visible"
        label="总金额"
        prop="totalAmount"
        width="100"
        align="right"
      >
        <template #default="{ row }">
          {{ formatAmount(row.totalAmount) }}
        </template>
      </el-table-column>
      <el-table-column
        v-if="columns[statusColumnIndex].visible"
        label="审核状态"
        prop="auditStatus"
        width="110"
        align="center"
      >
        <template #default="{ row }">
          <el-tag :type="getAuditTagType(row.auditStatus)">
            {{ getAuditText(row.auditStatus) }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column
        v-if="columns[remarkColumnIndex].visible"
        label="备注"
        prop="remark"
        min-width="180"
        show-overflow-tooltip
      />
      <el-table-column label="操作" width="180" align="center" fixed="right">
        <template #default="{ row }">
          <el-button
            v-if="isOrderMode && row.lifecycleStatus !== 'VOIDED'"
            link
            type="primary"
            icon="Edit"
            v-hasPermi="[updatePermission]"
            @click="handleUpdate(row)"
          >
            修改
          </el-button>
          <el-button
            v-if="row.lifecycleStatus !== 'VOIDED'"
            link
            type="danger"
            icon="Delete"
            v-hasPermi="[voidPermission]"
            @click="handleVoid(row)"
          >
            作废
          </el-button>
        </template>
      </el-table-column>
    </adaptive-table>

    <pagination
      v-show="total > 0"
      :total="total"
      v-model:page="queryParams.pageNum"
      v-model:limit="queryParams.pageSize"
      @pagination="getList"
    />

    <sales-order-detail-dialog
      v-model="detailOpen"
      :loading="detailLoading"
      :detail-data="detailData"
      :title="detailTitle"
      :document-label="documentLabel"
      :show-source-outbound="showSourceOutbound"
    />

    <sales-order-editor-dialog
      v-model="editorOpen"
      :mode="mode"
      :order-id="editingOrderId"
      @submitted="handleEditorSubmitted"
    />
  </div>
</template>

<script setup>
import { computed, getCurrentInstance, reactive, ref } from "vue";
import { listCustomerByKeyword } from "@/api/base/customer";
import { listByNameOrContact } from "@/api/base/workshop";
import { getOrder, listOrder, voidOrder } from "@/api/sales/order";
import {
  getSalesReturnOrder,
  listSalesReturnOrder,
  voidSalesReturnOrder,
} from "@/api/sales/salesReturnOrder";
import SalesOrderDetailDialog from "./SalesOrderDetailDialog.vue";
import SalesOrderEditorDialog from "./SalesOrderEditorDialog.vue";

const props = defineProps({
  mode: {
    type: String,
    default: "order",
  },
  alertMessage: {
    type: String,
    default:
      "当前 customer 域页面已接到 NestJS 接口，关键按钮与写操作联调入口已恢复显示。",
  },
  detailTitle: {
    type: String,
    default: "查看详情",
  },
  documentLabel: {
    type: String,
    default: "单号",
  },
  documentPlaceholder: {
    type: String,
    default: "请输入单号",
  },
  showSourceOutbound: {
    type: Boolean,
    default: false,
  },
});

const { proxy } = getCurrentInstance();

const apiMap = {
  order: {
    list: listOrder,
    get: getOrder,
    void: voidOrder,
  },
  salesReturn: {
    list: listSalesReturnOrder,
    get: getSalesReturnOrder,
    void: voidSalesReturnOrder,
  },
};

const isOrderMode = computed(() => props.mode === "order");
const createPermission = computed(() =>
  isOrderMode.value ? "sales:order:create" : "sales:return:create",
);
const updatePermission = computed(() => "sales:order:update");
const voidPermission = computed(() =>
  isOrderMode.value ? "sales:order:void" : "sales:return:void",
);

const rows = ref([]);
const total = ref(0);
const loading = ref(false);
const showSearch = ref(true);
const daterangeBizDate = ref([]);
const customerOptions = ref([]);
const customerLoading = ref(false);
const workshopOptions = ref([]);
const workshopLoading = ref(false);
const detailOpen = ref(false);
const detailLoading = ref(false);
const detailData = ref({});
const editorOpen = ref(false);
const editingOrderId = ref(null);
const selectedIds = ref([]);
const single = ref(true);
const multiple = ref(true);

const queryParams = reactive({
  pageNum: 1,
  pageSize: 30,
  documentNo: "",
  customerId: undefined,
  workshopId: undefined,
  sourceOutboundOrderId: "",
});

const columns = ref(
  props.showSourceOutbound
    ? [
        { key: 0, label: "单号", visible: true },
        { key: 1, label: "业务日期", visible: true },
        { key: 2, label: "客户", visible: true },
        { key: 3, label: "车间", visible: true },
        { key: 4, label: "经手人", visible: true },
        { key: 5, label: "来源出库 ID", visible: true },
        { key: 6, label: "总数量", visible: true },
        { key: 7, label: "总金额", visible: true },
        { key: 8, label: "审核状态", visible: true },
        { key: 9, label: "备注", visible: true },
      ]
    : [
        { key: 0, label: "单号", visible: true },
        { key: 1, label: "业务日期", visible: true },
        { key: 2, label: "客户", visible: true },
        { key: 3, label: "车间", visible: true },
        { key: 4, label: "经手人", visible: true },
        { key: 5, label: "总数量", visible: true },
        { key: 6, label: "总金额", visible: true },
        { key: 7, label: "审核状态", visible: true },
        { key: 8, label: "备注", visible: true },
      ],
);

const quantityColumnIndex = computed(() => (props.showSourceOutbound ? 6 : 5));
const amountColumnIndex = computed(() => (props.showSourceOutbound ? 7 : 6));
const statusColumnIndex = computed(() => (props.showSourceOutbound ? 8 : 7));
const remarkColumnIndex = computed(() => (props.showSourceOutbound ? 9 : 8));

function buildQuery() {
  return {
    ...queryParams,
    sourceOutboundOrderId: queryParams.sourceOutboundOrderId || undefined,
    params:
      daterangeBizDate.value.length === 2
        ? {
            beginTime: daterangeBizDate.value[0],
            endTime: daterangeBizDate.value[1],
          }
        : undefined,
  };
}

async function getList() {
  loading.value = true;
  try {
    const response = await apiMap[props.mode].list(buildQuery());
    rows.value = response.rows || [];
    total.value = response.total || 0;
  } finally {
    loading.value = false;
  }
}

function handleQuery() {
  queryParams.pageNum = 1;
  getList();
}

function resetQuery() {
  daterangeBizDate.value = [];
  proxy.resetForm("queryRef");
  queryParams.pageNum = 1;
  queryParams.pageSize = 30;
  handleQuery();
}

function handleSelectionChange(selection) {
  selectedIds.value = selection.map((item) => item.orderId);
  single.value = selection.length !== 1;
  multiple.value = selection.length !== 1;
}

function handleAdd() {
  editingOrderId.value = null;
  editorOpen.value = true;
}

function handleUpdate(row) {
  const targetId = row?.orderId ?? selectedIds.value[0];
  if (!targetId) {
    proxy.$modal.msgWarning("请先选择一条出库单");
    return;
  }

  editingOrderId.value = targetId;
  editorOpen.value = true;
}

async function handleVoid(row) {
  const targetId = row?.orderId ?? selectedIds.value[0];
  if (!targetId) {
    proxy.$modal.msgWarning("请先选择一条单据");
    return;
  }

  try {
    const { value } = await proxy.$modal.prompt("请输入作废说明（可选）");
    await apiMap[props.mode].void({
      orderId: targetId,
      voidReason: value,
    });
    proxy.$modal.msgSuccess("作废成功");
    getList();
  } catch {}
}

function handleEditorSubmitted() {
  editorOpen.value = false;
  editingOrderId.value = null;
  getList();
}

async function handleOpenDetail(row) {
  detailLoading.value = true;
  detailOpen.value = true;
  try {
    const response = await apiMap[props.mode].get(row.orderId);
    detailData.value = response.data || {};
  } finally {
    detailLoading.value = false;
  }
}

function searchCustomer(keyword) {
  customerLoading.value = true;
  listCustomerByKeyword(keyword)
    .then((response) => {
      customerOptions.value = response.rows || [];
    })
    .finally(() => {
      customerLoading.value = false;
    });
}

function searchWorkshop(keyword) {
  workshopLoading.value = true;
  listByNameOrContact({ workshopName: keyword })
    .then((response) => {
      workshopOptions.value = response.rows || [];
    })
    .finally(() => {
      workshopLoading.value = false;
    });
}

function getAuditText(status) {
  if (status === "1" || status === 1) {
    return "审核通过";
  }
  if (status === "2" || status === 2) {
    return "审核不通过";
  }
  return "未审核";
}

function getAuditTagType(status) {
  if (status === "1" || status === 1) {
    return "success";
  }
  if (status === "2" || status === 2) {
    return "danger";
  }
  return "warning";
}

function formatDate(value) {
  if (!value) {
    return "-";
  }
  return String(value).slice(0, 10);
}

function formatRecordDateTime(value) {
  if (!value) {
    return "-";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    const text = String(value);
    const monthDay = text.slice(5, 10);
    const time = text.slice(11, 19);
    if (monthDay && time) {
      return `${monthDay} ${time}`;
    }
    return text;
  }

  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hour = String(date.getHours()).padStart(2, "0");
  const minute = String(date.getMinutes()).padStart(2, "0");
  const second = String(date.getSeconds()).padStart(2, "0");
  return `${month}-${day} ${hour}:${minute}:${second}`;
}

function toTimestamp(value) {
  if (!value) {
    return 0;
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 0 : date.getTime();
}

function compareBizDateRows(left, right) {
  const dateCompare = formatDate(left?.bizDate).localeCompare(
    formatDate(right?.bizDate),
  );
  if (dateCompare !== 0) {
    return dateCompare;
  }

  const createdAtCompare =
    toTimestamp(left?.createdAt) - toTimestamp(right?.createdAt);
  if (createdAtCompare !== 0) {
    return createdAtCompare;
  }

  return Number(left?.orderId ?? 0) - Number(right?.orderId ?? 0);
}

function formatNumber(value) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatAmount(value) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed.toFixed(2) : "0.00";
}

void [
  SalesOrderDetailDialog,
  SalesOrderEditorDialog,
  isOrderMode,
  createPermission,
  updatePermission,
  voidPermission,
  rows,
  total,
  loading,
  showSearch,
  daterangeBizDate,
  customerOptions,
  customerLoading,
  workshopOptions,
  workshopLoading,
  detailOpen,
  detailLoading,
  detailData,
  editorOpen,
  editingOrderId,
  selectedIds,
  single,
  multiple,
  queryParams,
  columns,
  quantityColumnIndex,
  amountColumnIndex,
  statusColumnIndex,
  remarkColumnIndex,
  resetQuery,
  handleSelectionChange,
  handleAdd,
  handleUpdate,
  handleVoid,
  handleEditorSubmitted,
  handleOpenDetail,
  searchCustomer,
  searchWorkshop,
  getAuditText,
  getAuditTagType,
  formatDate,
  formatNumber,
  formatAmount,
];

getList();
</script>
