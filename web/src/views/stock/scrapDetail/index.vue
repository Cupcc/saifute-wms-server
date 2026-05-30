<template>
  <div class="app-container">
    <el-form
      :model="queryParams"
      ref="queryRef"
      :inline="true"
      v-show="showSearch"
      label-width="68px"
    >
      <el-form-item label="报废单号" prop="scrapNo">
        <el-input
          v-model="queryParams.scrapNo"
          placeholder="请输入报废单号"
          clearable
          style="width: 240px"
          @keyup.enter="handleQuery"
        />
      </el-form-item>
      <el-form-item label="报废日期" style="width: 308px">
        <el-date-picker
          v-model="daterangeScrapDate"
          value-format="YYYY-MM-DD"
          type="daterange"
          range-separator="-"
          start-placeholder="开始日期"
          end-placeholder="结束日期"
        />
      </el-form-item>
      <el-form-item label="物料名称" prop="materialName">
        <el-input
          v-model="queryParams.materialName"
          placeholder="请输入物料名称"
          clearable
          style="width: 240px"
          @keyup.enter="handleQuery"
        />
      </el-form-item>
      <el-form-item label="规格型号" prop="specification">
        <el-input
          v-model="queryParams.specification"
          placeholder="请输入规格型号"
          clearable
          style="width: 240px"
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
        @queryTable="getList"
        :columns="columns"
      />
    </el-row>

    <adaptive-table border stripe v-loading="loading" :data="scrapDetailList">
      <el-table-column type="index" width="60" align="center" />
      <el-table-column
        sortable
        show-overflow-tooltip
        label="报废单号"
        align="center"
        prop="scrapNo"
        min-width="140"
        v-if="columns[0].visible"
      />
      <el-table-column
        sortable
        show-overflow-tooltip
        label="报废日期"
        align="center"
        prop="scrapDate"
        width="200"
        :sort-method="compareScrapDateRows"
        v-if="columns[1].visible"
      >
        <template #default="scope">
          <span style="display: inline-flex; flex-direction: column; align-items: center; line-height: 1.35;">
            <span>{{ formatDocumentDate(scope.row.scrapDate) }}</span>
            <span style="font-size: 12px; color: #909399;">
              创建 {{ formatRecordDateTime(scope.row.createdAt) }}
            </span>
          </span>
        </template>
      </el-table-column>
      <el-table-column
        sortable
        show-overflow-tooltip
        label="车间"
        align="center"
        prop="workshopName"
        v-if="columns[2].visible"
      />
      <el-table-column
        sortable
        show-overflow-tooltip
        label="物料名称"
        align="center"
        prop="materialName"
        v-if="columns[3].visible"
      />
      <el-table-column
        sortable
        show-overflow-tooltip
        label="规格型号"
        align="center"
        prop="specification"
        v-if="columns[4].visible"
      />
      <el-table-column
        sortable
        show-overflow-tooltip
        label="数量"
        align="center"
        prop="scrapQty"
        v-if="columns[5].visible"
      />
      <el-table-column
        sortable
        show-overflow-tooltip
        label="单价"
        align="center"
        prop="unitPrice"
        v-if="columns[6].visible"
      />
      <el-table-column
        sortable
        show-overflow-tooltip
        label="金额"
        align="center"
        prop="estimatedLoss"
        v-if="columns[7].visible"
      >
        <template #default="scope">
          {{ formatLineAmount(scope.row) }}
        </template>
      </el-table-column>
      <el-table-column
        sortable
        show-overflow-tooltip
        label="备注"
        align="center"
        prop="remark"
        v-if="columns[8].visible"
      />
    </adaptive-table>

    <pagination
      v-show="total > 0"
      :total="total"
      v-model:page="queryParams.pageNum"
      v-model:limit="queryParams.pageSize"
      @pagination="getList"
    />
  </div>
</template>

<script setup name="ScrapDetail">
import { listScrapDetail } from "@/api/stock/scrapDetail";

const { proxy } = getCurrentInstance();

const scrapDetailList = ref([]);
const loading = ref(true);
const showSearch = ref(true);
const total = ref(0);
const today = new Date().toISOString().slice(0, 10);
const daterangeScrapDate = ref([today, today]);

const data = reactive({
  queryParams: {
    pageNum: 1,
    pageSize: 30,
    scrapNo: null,
    materialName: null,
    specification: null,
  },
});

const { queryParams } = toRefs(data);

const columns = ref([
  { key: 0, label: `报废单号`, visible: false },
  { key: 1, label: `报废日期`, visible: true },
  { key: 2, label: `车间`, visible: true },
  { key: 3, label: `物料名称`, visible: true },
  { key: 4, label: `规格型号`, visible: true },
  { key: 5, label: `数量`, visible: true },
  { key: 6, label: `单价`, visible: true },
  { key: 7, label: `金额`, visible: true },
  { key: 8, label: `备注`, visible: true },
]);

function getList() {
  loading.value = true;
  listScrapDetail(
    proxy.addDateRange(queryParams.value, daterangeScrapDate.value),
  ).then((response) => {
    scrapDetailList.value = response.rows;
    total.value = response.total || 0;
    loading.value = false;
  });
}

function handleQuery() {
  queryParams.value.pageNum = 1;
  getList();
}

function resetQuery() {
  daterangeScrapDate.value = [today, today];
  proxy.resetForm("queryRef");
  handleQuery();
}

function formatDocumentDate(value) {
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

function compareScrapDateRows(left, right) {
  const dateCompare = formatDocumentDate(left?.scrapDate).localeCompare(
    formatDocumentDate(right?.scrapDate),
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

const MONEY_PRECISION = 4;

function resolveLineAmount(row) {
  const quantity = Number(row?.scrapQty);
  const unitPrice = Number(row?.unitPrice);
  if (Number.isFinite(quantity) && Number.isFinite(unitPrice)) {
    return Number((quantity * unitPrice).toFixed(MONEY_PRECISION));
  }
  const amount = Number(row?.estimatedLoss ?? row?.amount);
  return Number.isFinite(amount) ? amount : 0;
}

function formatLineAmount(row) {
  return resolveLineAmount(row).toFixed(MONEY_PRECISION);
}

getList();
</script>
