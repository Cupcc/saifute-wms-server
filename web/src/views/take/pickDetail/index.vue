<template>
  <div class="app-container">
    <el-form :model="queryParams" ref="queryRef" :inline="true" v-show="showSearch" label-width="68px">
      <el-form-item label="领料单号" prop="pickNo">
        <el-input
          v-model="queryParams.pickNo"
          placeholder="请输入领料单号"
          clearable
          style="width: 240px"
          @keyup.enter="handleQuery"
        />
      </el-form-item>
      <el-form-item label="物料分类" prop="category">
		    <el-select v-model="queryParams.category" placeholder="请选择类型" clearable multiple collapse-tags collapse-tags-tooltip style="width: 200px">
			    <el-option
				    v-for="dict in saifute_material_category"
				    :key="dict.value"
				    :label="dict.label"
				    :value="dict.value" />
		    </el-select>
	    </el-form-item>
      <el-form-item label="领料日期" style="width: 308px">
        <el-date-picker
          v-model="daterangePickDate"
          value-format="YYYY-MM-DD"
          type="daterange"
          range-separator="-"
          start-placeholder="开始日期"
          end-placeholder="结束日期"
        ></el-date-picker>
      </el-form-item>
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
			    style="width: 240px">
			    <el-option
				    v-for="item in materialOptions"
				    :key="item.materialId"
				    :label="item.materialName + ' ' + item.specification"
				    :value="item.materialId">
				    <span style="float: left; color: #ff7171;">{{ item.materialCode }}</span>
				    <span style="float: left; color: #6985ff; margin-left: 10px;">{{ item.materialName }}</span>
				    <span style="float: right; color: #37a62c; font-size: 13px; margin-left: 20px;">{{ item.specification }}</span>
			    </el-option>
		    </el-select>
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
      <el-form-item label="车间" prop="workshopId">
        <el-select
          v-model="queryParams.workshopId"
          filterable
          remote
          reserve-keyword
          placeholder="请输入车间名称搜索"
          :remote-method="searchWorkshop"
          :loading="workshopLoading"
          clearable
          style="width: 240px">
          <el-option
            v-for="item in workshopOptions"
            :key="item.workshopId"
            :label="item.workshopName"
            :value="item.workshopId">
            <span style="float: left">{{ item.workshopName }}</span>
          </el-option>
        </el-select>
      </el-form-item>
      <el-form-item>
        <el-button type="primary" icon="Search" @click="handleQuery">搜索</el-button>
        <el-button icon="Refresh" @click="resetQuery">重置</el-button>
      </el-form-item>
    </el-form>

    <el-row :gutter="10" class="mb8">
      <right-toolbar v-model:showSearch="showSearch" @queryTable="getList" :columns="columns"></right-toolbar>
    </el-row>

    <adaptive-table border stripe v-loading="loading" :data="pickDetailList">
      <el-table-column type="index" width="60" align="center" />
      <el-table-column sortable show-overflow-tooltip label="领料单号" align="center" prop="pickNo" min-width="140" v-if="columns[0].visible" />
      <el-table-column
        sortable
        show-overflow-tooltip
        label="领料日期"
        align="center"
        prop="pickDate"
        v-if="columns[1].visible"
        width="200"
        :sort-method="comparePickDateRows"
      >
        <template #default="scope">
          <span style="display: inline-flex; flex-direction: column; align-items: center; line-height: 1.35;">
            <span>{{ formatDocumentDate(scope.row.pickDate) }}</span>
            <span style="font-size: 12px; color: #909399;">
              创建 {{ formatRecordDateTime(scope.row.createdAt) }}
            </span>
          </span>
        </template>
      </el-table-column>
      <el-table-column sortable show-overflow-tooltip label="车间" align="center" prop="workshopName" v-if="columns[2].visible" />
      <el-table-column sortable show-overflow-tooltip label="物料名称" align="center" prop="materialName" v-if="columns[3].visible" />
      <el-table-column sortable show-overflow-tooltip label="规格型号" align="center" prop="specification" v-if="columns[4].visible" />
      <el-table-column sortable show-overflow-tooltip label="数量" align="center" prop="quantity" v-if="columns[5].visible">
        <template #default="scope">
          {{ formatQuantityDisplay(scope.row.quantity) }}
        </template>
      </el-table-column>
      <el-table-column sortable show-overflow-tooltip label="成本价层" align="center" prop="rawUnitPrice" v-if="columns[6].visible" />
      <el-table-column sortable show-overflow-tooltip label="金额" align="center" prop="amount" v-if="columns[7].visible" />
      <el-table-column sortable show-overflow-tooltip label="备注" align="center" prop="remark" v-if="columns[8].visible" />
    </adaptive-table>
    <span style="font-size: 16px; font-weight: bold; color: #f56c6c;text-align: right;">合计金额：{{ totalMoney }}</span>
    <pagination
      v-show="total > 0"
      :total="total"
      v-model:page="queryParams.pageNum"
      v-model:limit="queryParams.pageSize"
      @pagination="getList"
    />
  </div>
</template>

<script setup name="PickDetail">
import { listByNameOrContact } from "@/api/base/workshop.js";
import { selectSaifuteInventoryListGroupByMaterial } from "@/api/stock/inventory.js";
import { listNoPage } from "@/api/take/pickDetail";
import { useDict } from "@/utils/dict";

const { proxy } = getCurrentInstance();
// 获取物料分类字典数据
const { saifute_material_category } = useDict("saifute_material_category");
const pickDetailList = ref([]);
const loading = ref(true);
const showSearch = ref(true);
const total = ref(0);

const data = reactive({
  queryParams: {
    pageNum: 1,
    pageSize: 30,
    pickNo: null,
    category: null,
    materialName: null,
    specification: null,
    workshopId: null,
  },
});
const totalMoney = computed(() => {
  const total = pickDetailList.value.reduce(
    (sum, item) => sum + Number(item.amount),
    0,
  );
  // 浮点累加会产生 34249.2299999 等误差，按分取整再转回元并保留两位小数
  return (Math.round(total * 100) / 100).toFixed(2);
});
const { queryParams } = toRefs(data);

// 设置默认日期为当天
const today = new Date().toISOString().slice(0, 10);
// 添加日期范围和车间相关变量
const daterangePickDate = ref([today, today]);
const materialLoading = ref(false);
const materialOptions = ref([]);
const workshopOptions = ref([]);
const workshopLoading = ref(false);

// 添加columns数组定义
const columns = ref([
  { key: 0, label: `领料单号`, visible: false },
  { key: 1, label: `领料日期`, visible: true },
  { key: 2, label: `车间`, visible: true },
  { key: 3, label: `物料名称`, visible: true },
  { key: 4, label: `规格型号`, visible: true },
  { key: 5, label: `数量`, visible: true },
  { key: 6, label: `单价`, visible: true },
  { key: 7, label: `金额`, visible: true },
  { key: 8, label: `备注`, visible: true },
]);

/** 加载物料选项数据 */
function searchMaterial(query) {
  materialLoading.value = true;
  selectSaifuteInventoryListGroupByMaterial({
    materialCode: query,
  })
    .then((response) => {
      materialOptions.value = response.rows || [];
      materialLoading.value = false;
    })
    .catch(() => {
      materialOptions.value = [];
      materialLoading.value = false;
    });
}

/** 查询领料单明细列表 */
function getList() {
  loading.value = true;
  listNoPage(
    proxy.addDateRange(queryParams.value, daterangePickDate.value),
  ).then((response) => {
    pickDetailList.value = response.data;
    total.value = response.total || 0;
    loading.value = false;
  });
}

/** 搜索按钮操作 */
function handleQuery() {
  queryParams.value.pageNum = 1;
  getList();
}

/** 重置按钮操作 */
function resetQuery() {
  proxy.resetForm("queryRef");
  daterangePickDate.value = [today, today];
  handleQuery();
}

/**
 * 搜索车间
 */
function searchWorkshop(query) {
  workshopLoading.value = true;
  listByNameOrContact({ workshopName: query })
    .then((response) => {
      workshopOptions.value = response.rows;
      workshopLoading.value = false;
    })
    .catch(() => {
      workshopLoading.value = false;
    });
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

function comparePickDateRows(left, right) {
  const dateCompare = formatDocumentDate(left?.pickDate).localeCompare(
    formatDocumentDate(right?.pickDate),
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

function formatQuantityDisplay(value) {
  const quantity = Number(value);
  if (!Number.isFinite(quantity)) {
    return "-";
  }
  return quantity.toFixed(2);
}

/** 合计计算 */
function getSummaries(param) {
  const { columns, data } = param;
  const sums = [];
  columns.forEach((column, index) => {
    if (index === 0) {
      sums[index] = "合计";
      return;
    }
    if (column.property === "quantity") {
      const values = data.map((item) => Number(item.quantity));
      if (!values.every((value) => Number.isNaN(value))) {
        sums[index] = values
          .reduce((prev, curr) => {
            const value = Number(curr);
            if (!Number.isNaN(value)) {
              return prev + curr;
            } else {
              return prev;
            }
          }, 0)
          .toFixed(2);
      } else {
        sums[index] = "N/A";
      }
    } else if (column.property === "amount") {
      const values = data.map((item) => Number(item.amount));
      if (!values.every((value) => Number.isNaN(value))) {
        sums[index] = values
          .reduce((prev, curr) => {
            const value = Number(curr);
            if (!Number.isNaN(value)) {
              return prev + curr;
            } else {
              return prev;
            }
          }, 0)
          .toFixed(2);
      } else {
        sums[index] = "N/A";
      }
    } else {
      sums[index] = "";
    }
  });

  return sums;
}

getList();
searchWorkshop("");
</script>
