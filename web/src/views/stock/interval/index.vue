<template>
  <div class="app-container">
    <el-form
      ref="queryRef"
      :model="queryParams"
      :inline="true"
      v-show="showSearch"
      label-width="68px"
    >
      <el-form-item label="关联单据类型" prop="orderType">
        <el-select
          v-model="queryParams.orderType"
          placeholder="请选择关联单据类型"
          clearable
          style="width: 240px"
        >
          <el-option
            v-for="dict in supportedRelatedOrderTypes"
            :key="dict.value"
            :label="dict.label"
            :value="dict.value"
          />
        </el-select>
      </el-form-item>
      <el-form-item label="明细id" prop="detailId">
        <el-input
          v-model="queryParams.detailId"
          placeholder="请输入明细id"
          clearable
          style="width: 240px"
          @keyup.enter="handleQuery"
        />
      </el-form-item>
      <el-form-item label="区间起始编号" prop="startNum">
        <el-input
          v-model="queryParams.startNum"
          placeholder="请输入区间起始编号"
          clearable
          style="width: 240px"
          @keyup.enter="handleQuery"
        />
      </el-form-item>
      <el-form-item label="区间结束编号" prop="endNum">
        <el-input
          v-model="queryParams.endNum"
          placeholder="请输入区间结束编号"
          clearable
          style="width: 240px"
          @keyup.enter="handleQuery"
        />
      </el-form-item>
      <el-form-item>
        <el-button type="primary" icon="Search" @click="handleQuery">
          搜索
        </el-button>
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

    <adaptive-table border stripe v-loading="loading" :data="intervalList" :column-config="columns">
      <el-table-column type="index" width="50" align="center" />
      <el-table-column
        sortable
        show-overflow-tooltip
        label="主键"
        align="center"
        prop="intervalId"
        key="intervalId"
        v-if="columns[0].visible"
      />
      <el-table-column
        sortable
        show-overflow-tooltip
        label="关联单据类型"
        align="center"
        prop="orderType"
        v-if="columns[1].visible"
      >
        <template #default="scope">
          <dict-tag
            :options="supportedRelatedOrderTypes"
            :value="scope.row.orderType"
          />
        </template>
      </el-table-column>
      <el-table-column
        sortable
        show-overflow-tooltip
        label="明细id"
        align="center"
        prop="detailId"
        v-if="columns[2].visible"
      />
      <el-table-column
        sortable
        show-overflow-tooltip
        label="区间起始编号"
        align="center"
        prop="startNum"
        v-if="columns[3].visible"
      />
      <el-table-column
        sortable
        show-overflow-tooltip
        label="区间结束编号"
        align="center"
        prop="endNum"
        v-if="columns[4].visible"
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

<script setup name="Interval">
import { listInterval } from "@/api/stock/interval";

const { proxy } = getCurrentInstance();
const { related_order_type } = proxy.useDict("related_order_type");

const supportedRelatedOrderTypes = computed(() =>
  related_order_type.value.filter((dict) => String(dict.value) === "4"),
);

const intervalList = ref([]);
const loading = ref(true);
const showSearch = ref(true);
const total = ref(0);

const queryParams = ref({
  pageNum: 1,
  pageSize: 30,
  orderType: null,
  detailId: null,
  startNum: null,
  endNum: null,
});

const columns = ref([
  { key: 0, label: "主键", visible: true },
  { key: 1, label: "关联单据类型", visible: true },
  { key: 2, label: "明细id", visible: true },
  { key: 3, label: "区间起始编号", visible: true },
  { key: 4, label: "区间结束编号", visible: true },
]);

function getList() {
  loading.value = true;
  listInterval(queryParams.value)
    .then((response) => {
      intervalList.value = response.rows || [];
      total.value = response.total || 0;
    })
    .finally(() => {
      loading.value = false;
    });
}

function handleQuery() {
  queryParams.value.pageNum = 1;
  getList();
}

function resetQuery() {
  proxy.resetForm("queryRef");
  handleQuery();
}

getList();
</script>
