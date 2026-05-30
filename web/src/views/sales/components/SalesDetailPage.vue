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
      label-width="92px"
    >
      <el-form-item :label="documentLabel" prop="documentNo">
        <el-input
          v-model="queryParams.documentNo"
          :placeholder="documentPlaceholder"
          clearable
          style="width: 220px"
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
          style="width: 220px"
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
          style="width: 220px"
        >
          <el-option
            v-for="item in workshopOptions"
            :key="item.workshopId"
            :label="item.workshopName"
            :value="item.workshopId"
          />
        </el-select>
      </el-form-item>
      <el-form-item label="物料" prop="materialId">
        <el-select
          v-model="queryParams.materialId"
          filterable
          remote
          reserve-keyword
          clearable
          placeholder="请输入物料名称或编码"
          :remote-method="searchMaterial"
          :loading="materialLoading"
          style="width: 240px"
        >
          <el-option
            v-for="item in materialOptions"
            :key="item.materialId"
            :label="`${item.materialName} ${item.specification || ''}`"
            :value="item.materialId"
          >
            <span style="float: left; color: #ff7171">{{ item.materialCode }}</span>
            <span style="float: left; margin-left: 10px">{{ item.materialName }}</span>
            <span style="float: right; color: #909399">{{ item.specification }}</span>
          </el-option>
        </el-select>
      </el-form-item>
      <el-form-item label="物料名称" prop="materialName">
        <el-input
          v-model="queryParams.materialName"
          placeholder="请输入物料名称"
          clearable
          style="width: 220px"
          @keyup.enter="handleQuery"
        />
      </el-form-item>
      <el-form-item label="规格型号" prop="specification">
        <el-input
          v-model="queryParams.specification"
          placeholder="请输入规格型号"
          clearable
          style="width: 220px"
          @keyup.enter="handleQuery"
        />
      </el-form-item>
      <el-form-item v-if="showSourceOutbound" label="来源出库 ID" prop="sourceOutboundOrderId">
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
      <right-toolbar
        v-model:showSearch="showSearch"
        :columns="columns"
        @queryTable="getList"
      />
    </el-row>

    <adaptive-table border stripe v-loading="loading" :data="rows">
      <el-table-column
        v-if="columns[0].visible"
        label="单号"
        prop="documentNo"
        min-width="140"
        show-overflow-tooltip
      >
        <template #default="scope">
          <el-button link type="primary" @click="handleOpenDetail(scope.row)">
            {{ scope.row.documentNo }}
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
        <template #default="scope">
          <span style="display: inline-flex; flex-direction: column; line-height: 1.35;">
            <span>{{ formatDate(scope.row.bizDate) }}</span>
            <span style="font-size: 12px; color: #909399;">
              创建 {{ formatRecordDateTime(scope.row.createdAt) }}
            </span>
          </span>
        </template>
      </el-table-column>
      <el-table-column
        v-if="columns[2].visible"
        label="客户"
        prop="customerName"
        min-width="150"
        show-overflow-tooltip
      />
      <el-table-column
        v-if="columns[3].visible"
        label="车间"
        prop="workshopName"
        min-width="140"
        show-overflow-tooltip
      />
      <el-table-column
        v-if="showSourceOutbound && columns[4].visible"
        label="来源出库 ID"
        prop="sourceOutboundOrderId"
        width="120"
        align="center"
      />
      <el-table-column
        v-if="columns[materialCodeColumnIndex].visible"
        label="物料编码"
        prop="materialCode"
        min-width="120"
        show-overflow-tooltip
      />
      <el-table-column
        v-if="columns[materialNameColumnIndex].visible"
        label="物料名称"
        prop="materialName"
        min-width="160"
        show-overflow-tooltip
      />
      <el-table-column
        v-if="columns[specificationColumnIndex].visible"
        label="规格型号"
        prop="specification"
        min-width="140"
        show-overflow-tooltip
      />
      <el-table-column
        v-if="columns[quantityColumnIndex].visible"
        label="数量"
        prop="quantity"
        width="90"
        align="right"
      >
        <template #default="scope">
          {{ formatNumber(scope.row.quantity) }}
        </template>
      </el-table-column>
      <el-table-column
        v-if="columns[amountColumnIndex].visible"
        label="金额"
        prop="amount"
        width="110"
        align="right"
      >
        <template #default="scope">
          {{ formatAmount(scope.row.amount) }}
        </template>
      </el-table-column>
      <el-table-column
        v-if="columns[remarkColumnIndex].visible"
        label="备注"
        prop="remark"
        min-width="160"
        show-overflow-tooltip
      />
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
  </div>
</template>

<script setup>
import { listCustomerByKeyword } from "@/api/base/customer";
import { listMaterialByCodeOrName } from "@/api/base/material";
import { listByNameOrContact } from "@/api/base/workshop";
import { listDetail } from "@/api/sales/detail";
import { getOrder } from "@/api/sales/order";
import { listSalesReturnDetail } from "@/api/sales/salesReturnDetail";
import { getSalesReturnOrder } from "@/api/sales/salesReturnOrder";
import SalesOrderDetailDialog from "./SalesOrderDetailDialog.vue";

const props = defineProps({
  mode: {
    type: String,
    default: "order",
  },
  alertMessage: {
    type: String,
    default: "当前 customer 域页面已接到 NestJS 接口，写操作暂未开放。",
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
    list: listDetail,
    getOrder,
  },
  salesReturn: {
    list: listSalesReturnDetail,
    getOrder: getSalesReturnOrder,
  },
};

const rows = ref([]);
const total = ref(0);
const loading = ref(false);
const showSearch = ref(true);
const daterangeBizDate = ref([]);
const customerOptions = ref([]);
const customerLoading = ref(false);
const workshopOptions = ref([]);
const workshopLoading = ref(false);
const materialOptions = ref([]);
const materialLoading = ref(false);
const detailOpen = ref(false);
const detailLoading = ref(false);
const detailData = ref({});

const queryParams = reactive({
  pageNum: 1,
  pageSize: 30,
  documentNo: "",
  customerId: undefined,
  workshopId: undefined,
  materialId: undefined,
  materialName: "",
  specification: "",
  sourceOutboundOrderId: "",
});

const columns = ref(
  props.showSourceOutbound
    ? [
        { key: 0, label: "单号", visible: true },
        { key: 1, label: "业务日期", visible: true },
        { key: 2, label: "客户", visible: true },
        { key: 3, label: "车间", visible: true },
        { key: 4, label: "来源出库 ID", visible: true },
        { key: 5, label: "物料编码", visible: true },
        { key: 6, label: "物料名称", visible: true },
        { key: 7, label: "规格型号", visible: true },
        { key: 8, label: "数量", visible: true },
        { key: 9, label: "金额", visible: true },
        { key: 10, label: "备注", visible: true },
      ]
    : [
        { key: 0, label: "单号", visible: true },
        { key: 1, label: "业务日期", visible: true },
        { key: 2, label: "客户", visible: true },
        { key: 3, label: "车间", visible: true },
        { key: 4, label: "物料编码", visible: true },
        { key: 5, label: "物料名称", visible: true },
        { key: 6, label: "规格型号", visible: true },
        { key: 7, label: "数量", visible: true },
        { key: 8, label: "金额", visible: true },
        { key: 9, label: "备注", visible: true },
      ],
);

const materialCodeColumnIndex = computed(() =>
  props.showSourceOutbound ? 5 : 4,
);
const materialNameColumnIndex = computed(() =>
  props.showSourceOutbound ? 6 : 5,
);
const specificationColumnIndex = computed(() =>
  props.showSourceOutbound ? 7 : 6,
);
const quantityColumnIndex = computed(() => (props.showSourceOutbound ? 8 : 7));
const amountColumnIndex = computed(() => (props.showSourceOutbound ? 9 : 8));
const remarkColumnIndex = computed(() => (props.showSourceOutbound ? 10 : 9));

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
    rows.value = response.rows;
    total.value = response.total;
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

async function handleOpenDetail(row) {
  detailLoading.value = true;
  detailOpen.value = true;
  try {
    const response = await apiMap[props.mode].getOrder(row.orderId);
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

function searchMaterial(keyword) {
  materialLoading.value = true;
  listMaterialByCodeOrName({ materialCode: keyword, pageNum: 1, pageSize: 100 })
    .then((response) => {
      materialOptions.value = response.rows || [];
    })
    .finally(() => {
      materialLoading.value = false;
    });
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

  return Number(left?.detailId ?? 0) - Number(right?.detailId ?? 0);
}

function formatNumber(value) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed.toFixed(2) : "0.00";
}

function formatAmount(value) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed.toFixed(4) : "0.0000";
}

void [
  SalesOrderDetailDialog,
  rows,
  total,
  loading,
  showSearch,
  daterangeBizDate,
  customerOptions,
  customerLoading,
  workshopOptions,
  workshopLoading,
  materialOptions,
  materialLoading,
  detailOpen,
  detailLoading,
  detailData,
  queryParams,
  columns,
  materialCodeColumnIndex,
  materialNameColumnIndex,
  specificationColumnIndex,
  quantityColumnIndex,
  amountColumnIndex,
  remarkColumnIndex,
  resetQuery,
  handleOpenDetail,
  searchCustomer,
  searchWorkshop,
  searchMaterial,
  formatDate,
  formatNumber,
  formatAmount,
];

getList();
</script>
