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
      <el-form-item label="经办人" prop="attn">
        <combo-input v-model="queryParams.attn" scope="personnel" field="personnelName" placeholder="请选择或输入经办人" width="240px" />
      </el-form-item>
      <el-form-item label="物料名称" prop="materialName">
        <combo-input v-model="queryParams.materialName" scope="material" field="materialName" placeholder="请选择或输入物料名称" width="240px" />
      </el-form-item>
      <el-form-item>
        <el-button type="primary" icon="Search" @click="handleQuery">搜索</el-button>
        <el-button icon="Refresh" @click="resetQuery">重置</el-button>
      </el-form-item>
    </el-form>

    <el-row :gutter="10" class="mb8">
      <right-toolbar v-model:showSearch="showSearch" @queryTable="getList" :columns="columns" />
    </el-row>

    <adaptive-table border stripe v-loading="loading" :data="returnOrderList">
      <el-table-column type="index" width="50" align="center" />
      <el-table-column sortable show-overflow-tooltip label="退货单号" align="center" prop="inboundNo" min-width="140" v-if="columns[0].visible">
        <template #default="scope">
          <el-button link type="primary" :underline="false" @click.stop="goToDetail(scope.row)">
            {{ scope.row.inboundNo }}
          </el-button>
        </template>
      </el-table-column>
      <el-table-column sortable show-overflow-tooltip label="退货日期" align="center" prop="inboundDate" width="150" v-if="columns[1].visible">
        <template #default="scope">
          {{ formatDocumentDate(scope.row.inboundDate) }}
        </template>
      </el-table-column>
      <el-table-column sortable show-overflow-tooltip label="供应商" align="center" prop="supplierName" min-width="160" v-if="columns[2].visible" />
      <el-table-column sortable show-overflow-tooltip label="经办人" align="center" prop="attn" width="120" v-if="columns[3].visible" />
      <el-table-column sortable show-overflow-tooltip label="关联部门" align="center" prop="workshopName" width="130" v-if="columns[4].visible" />
      <el-table-column sortable show-overflow-tooltip label="总数量" align="right" prop="totalQty" width="110" v-if="columns[5].visible" />
      <el-table-column sortable show-overflow-tooltip label="总金额" align="right" prop="totalAmount" width="120" v-if="columns[6].visible" />
      <el-table-column sortable show-overflow-tooltip label="库存状态" align="center" prop="inventoryEffectStatus" width="120" v-if="columns[7].visible">
        <template #default="scope">
          <el-tag :type="inventoryStatusTag(scope.row.inventoryEffectStatus)" effect="plain">
            {{ scope.row.inventoryEffectStatus || "-" }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column sortable show-overflow-tooltip label="单据状态" align="center" prop="lifecycleStatus" width="120" v-if="columns[8].visible">
        <template #default="scope">
          <el-tag :type="lifecycleStatusTag(scope.row.lifecycleStatus)" effect="plain">
            {{ scope.row.lifecycleStatus || "-" }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column show-overflow-tooltip label="备注" align="center" prop="remark" min-width="180" v-if="columns[9].visible" />
      <el-table-column label="操作" align="center" fixed="right" width="140">
        <template #default="scope">
          <el-button link type="primary" @click.stop="goToDetail(scope.row)">明细</el-button>
          <el-button
            link
            type="danger"
            @click.stop="handleVoid(scope.row)"
            v-if="scope.row.lifecycleStatus !== 'VOIDED'"
            v-hasPermi="['inbound:order:void']"
          >作废</el-button>
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
  </div>
</template>

<script setup name="EntryReturnOrder">
import { abandonReturnOrder, listReturnOrder } from "@/api/entry/returnOrder";

const { proxy } = getCurrentInstance();

const returnOrderList = ref([]);
const loading = ref(true);
const showSearch = ref(true);
const total = ref(0);
const dateRange = ref([]);

const queryParams = reactive({
  pageNum: 1,
  pageSize: 30,
  inboundNo: null,
  supplierName: null,
  attn: null,
  materialName: null,
});

const columns = ref([
  { key: 0, label: "退货单号", visible: true },
  { key: 1, label: "退货日期", visible: true },
  { key: 2, label: "供应商", visible: true },
  { key: 3, label: "经办人", visible: true },
  { key: 4, label: "关联部门", visible: true },
  { key: 5, label: "总数量", visible: true },
  { key: 6, label: "总金额", visible: true },
  { key: 7, label: "库存状态", visible: true },
  { key: 8, label: "单据状态", visible: true },
  { key: 9, label: "备注", visible: true },
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

function inventoryStatusTag(status) {
  if (status === "POSTED") {
    return "success";
  }
  if (status === "REVERSED") {
    return "info";
  }
  return "warning";
}

function lifecycleStatusTag(status) {
  if (status === "EFFECTIVE") {
    return "success";
  }
  if (status === "VOIDED") {
    return "info";
  }
  return "warning";
}

function getList() {
  loading.value = true;
  listReturnOrder(buildQuery())
    .then((response) => {
      returnOrderList.value = response.rows || [];
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
  queryParams.attn = null;
  queryParams.materialName = null;
  proxy.resetForm("queryRef");
  handleQuery();
}

function goToDetail(row) {
  proxy.$router.push({
    name: "EntryReturnDetail",
    query: { inboundNo: row.inboundNo },
  });
}

function handleVoid(row) {
  proxy.$modal
    .confirm(`是否确认作废退货单"${row.inboundNo}"？`)
    .then(() => abandonReturnOrder(row.inboundId, "页面作废退货单"))
    .then(() => {
      proxy.$modal.msgSuccess("作废成功");
      getList();
    });
}

getList();
</script>
