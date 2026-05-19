<template>
  <div class="app-container">
    <el-form :model="queryParams" ref="queryRef" :inline="true" v-show="showSearch" label-width="78px">
      <el-form-item label="退货单号" prop="inboundNo">
        <el-input
          v-model="queryParams.inboundNo"
          placeholder="请输入退货单号"
          clearable
          style="width: 240px"
          @keyup.enter="handleQuery"
        />
      </el-form-item>
      <el-form-item label="退货日期" style="width: 308px">
        <el-date-picker
          v-model="dateRange"
          type="daterange"
          range-separator="-"
          start-placeholder="开始日期"
          end-placeholder="结束日期"
          value-format="YYYY-MM-DD"
          clearable
        />
      </el-form-item>
      <el-form-item label="供应商" prop="supplierName">
        <el-input
          v-model="queryParams.supplierName"
          placeholder="请输入供应商名称"
          clearable
          style="width: 240px"
          @keyup.enter="handleQuery"
        />
      </el-form-item>
      <el-form-item label="物料编码" prop="materialCode">
        <el-input
          v-model="queryParams.materialCode"
          placeholder="请输入物料编码"
          clearable
          style="width: 240px"
          @keyup.enter="handleQuery"
        />
      </el-form-item>
      <el-form-item label="物料名称" prop="materialName">
        <combo-input v-model="queryParams.materialName" scope="material" field="materialName" placeholder="请选择或输入物料名称" width="240px" />
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
      <right-toolbar v-model:showSearch="showSearch" @queryTable="getList" :columns="columns" />
    </el-row>

    <adaptive-table border stripe v-loading="loading" :data="returnDetailList">
      <el-table-column type="index" width="60" align="center" />
      <el-table-column sortable show-overflow-tooltip label="退货单号" align="center" prop="inboundNo" min-width="140" v-if="columns[0].visible" />
      <el-table-column sortable show-overflow-tooltip label="退货日期" align="center" prop="inboundDate" width="140" v-if="columns[1].visible">
        <template #default="scope">
          {{ formatDocumentDate(scope.row.inboundDate) }}
        </template>
      </el-table-column>
      <el-table-column sortable show-overflow-tooltip label="物料编码" align="center" prop="material.materialCode" min-width="120" v-if="columns[2].visible" />
      <el-table-column sortable show-overflow-tooltip label="物料名称" align="center" prop="material.materialName" min-width="160" v-if="columns[3].visible" />
      <el-table-column sortable show-overflow-tooltip label="规格型号" align="center" prop="material.specification" min-width="140" v-if="columns[4].visible" />
      <el-table-column sortable show-overflow-tooltip label="来源单价" align="right" prop="unitPrice" width="110" v-if="columns[5].visible" />
      <el-table-column sortable show-overflow-tooltip label="退货数量" align="right" prop="quantity" width="110" v-if="columns[6].visible" />
      <el-table-column sortable show-overflow-tooltip label="金额" align="right" prop="amount" width="120" v-if="columns[7].visible" />
      <el-table-column sortable show-overflow-tooltip label="供应商" align="center" prop="supplierName" min-width="160" v-if="columns[8].visible" />
      <el-table-column sortable show-overflow-tooltip label="关联部门" align="center" prop="workshopName" width="130" v-if="columns[9].visible" />
      <el-table-column show-overflow-tooltip label="备注" align="center" prop="remark" min-width="180" v-if="columns[10].visible" />
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

<script setup name="EntryReturnDetail">
import { listReturnDetail } from "@/api/entry/returnDetail";

const { proxy } = getCurrentInstance();

const returnDetailList = ref([]);
const loading = ref(true);
const showSearch = ref(true);
const total = ref(0);
const dateRange = ref([]);

const queryParams = reactive({
  pageNum: 1,
  pageSize: 30,
  inboundNo: proxy.$route.query.inboundNo || null,
  supplierName: null,
  materialCode: null,
  materialName: null,
  specification: null,
});

const columns = ref([
  { key: 0, label: "退货单号", visible: true },
  { key: 1, label: "退货日期", visible: true },
  { key: 2, label: "物料编码", visible: true },
  { key: 3, label: "物料名称", visible: true },
  { key: 4, label: "规格型号", visible: true },
  { key: 5, label: "来源单价", visible: true },
  { key: 6, label: "退货数量", visible: true },
  { key: 7, label: "金额", visible: true },
  { key: 8, label: "供应商", visible: true },
  { key: 9, label: "关联部门", visible: true },
  { key: 10, label: "备注", visible: true },
]);

function formatDocumentDate(value) {
  return value ? String(value).slice(0, 10) : "-";
}

function buildQuery() {
  return {
    ...queryParams,
    bizDateFrom: dateRange.value?.[0],
    bizDateTo: dateRange.value?.[1],
  };
}

function getList() {
  loading.value = true;
  listReturnDetail(buildQuery())
    .then((response) => {
      returnDetailList.value = response.rows || [];
      total.value = response.total || 0;
    })
    .finally(() => {
      loading.value = false;
    });
}

function handleQuery() {
  queryParams.pageNum = 1;
  getList();
}

function resetQuery() {
  dateRange.value = [];
  queryParams.inboundNo = null;
  queryParams.supplierName = null;
  queryParams.materialCode = null;
  queryParams.materialName = null;
  queryParams.specification = null;
  proxy.resetForm("queryRef");
  handleQuery();
}

getList();
</script>
