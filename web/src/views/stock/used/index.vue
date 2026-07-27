<template>
  <div class="app-container">
    <el-form
      :model="queryParams"
      ref="queryRef"
      :inline="true"
      v-show="showSearch"
      label-width="68px"
    >
      <el-form-item label="物料" prop="materialId">
        <el-select
          v-model="queryParams.materialId"
          filterable
          remote
          reserve-keyword
          placeholder="请输入物料名称或规格型号搜索"
          :remote-method="searchMaterial"
          :loading="materialLoading"
          clearable
          style="width: 240px"
        >
          <el-option
            v-for="item in materialOptions"
            :key="item.materialId"
            :label="item.materialName + ' ' + item.specification"
            :value="item.materialId"
          >
            <span style="float: left; color: #ff7171">{{
              item.materialCode
            }}</span>
            <span style="float: left; margin-left: 10px">{{
              item.materialName
            }}</span>
            <span
              style="
                float: right;
                color: #37a62c;
                font-size: 13px;
                margin-left: 20px;
              "
            >
              {{ item.specification }}
            </span>
          </el-option>
        </el-select>
      </el-form-item>
      <el-form-item>
        <el-button type="primary" icon="Search" @click="handleQuery"
          >搜索</el-button
        >
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

    <adaptive-table border stripe v-loading="loading" :data="usedList" :column-config="columns">
      <el-table-column type="index" width="50" align="center" />
      <el-table-column
        sortable
        show-overflow-tooltip
        label="物料编码"
        align="center"
        prop="materialCode"
        v-if="columns[0].visible"
      />
      <el-table-column
        sortable
        show-overflow-tooltip
        label="物料名称"
        align="center"
        prop="materialName"
        v-if="columns[1].visible"
      />
      <el-table-column
        sortable
        show-overflow-tooltip
        label="规格型号"
        align="center"
        prop="specification"
        v-if="columns[2].visible"
      />
      <el-table-column
        sortable
        show-overflow-tooltip
        label="累计占用"
        align="center"
        prop="allocatedQty"
        v-if="columns[3].visible"
      />
      <el-table-column
        sortable
        show-overflow-tooltip
        label="已释放"
        align="center"
        prop="releasedQty"
        v-if="columns[4].visible"
      />
      <el-table-column
        sortable
        show-overflow-tooltip
        label="当前使用量"
        align="center"
        prop="useQty"
        v-if="columns[5].visible"
      />
      <el-table-column
        sortable
        show-overflow-tooltip
        label="消费单据类型"
        align="center"
        prop="consumerDocumentType"
        v-if="columns[6].visible"
      />
      <el-table-column
        sortable
        show-overflow-tooltip
        label="消费单据ID"
        align="center"
        prop="consumerDocumentId"
        v-if="columns[7].visible"
      />
      <el-table-column
        sortable
        show-overflow-tooltip
        label="状态"
        align="center"
        prop="status"
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

<script setup name="Used">
import { listMaterialByCodeOrName } from "@/api/base/material";
import { listUsed } from "@/api/stock/used";

const { proxy } = getCurrentInstance();

const usedList = ref([]);
const loading = ref(true);
const showSearch = ref(true);
const total = ref(0);
const materialLoading = ref(false);
const materialOptions = ref([]);

const data = reactive({
  queryParams: {
    pageNum: 1,
    pageSize: 30,
    materialId: null,
  },
});

const { queryParams } = toRefs(data);

const columns = ref([
  { key: 0, label: "物料编码", visible: true },
  { key: 1, label: "物料名称", visible: true },
  { key: 2, label: "规格型号", visible: true },
  { key: 3, label: "累计占用", visible: true },
  { key: 4, label: "已释放", visible: true },
  { key: 5, label: "当前使用量", visible: true },
  { key: 6, label: "消费单据类型", visible: true },
  { key: 7, label: "消费单据ID", visible: true },
  { key: 8, label: "状态", visible: true },
]);

function getList() {
  loading.value = true;
  listUsed(queryParams.value)
    .then((response) => {
      usedList.value = response.rows || [];
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

function searchMaterial(query) {
  if (!query) {
    materialOptions.value = [];
    return;
  }

  materialLoading.value = true;
  listMaterialByCodeOrName({
    materialCode: query,
    pageNum: 1,
    pageSize: 30,
  })
    .then((response) => {
      materialOptions.value = response.rows || [];
    })
    .finally(() => {
      materialLoading.value = false;
    });
}

getList();
</script>
