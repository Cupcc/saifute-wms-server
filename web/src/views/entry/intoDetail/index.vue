<template>
  <div class="app-container">
    <el-form :model="queryParams" ref="queryRef" :inline="true" v-show="showSearch" label-width="68px">
      <el-form-item label="入库单号" prop="intoNo">
        <el-input
          v-model="queryParams.intoNo"
          placeholder="请输入入库单号"
          clearable
          style="width: 240px"
          @keyup.enter="handleQuery"
        />
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
      <el-form-item label="入库日期" style="width: 308px">
        <el-date-picker
          v-model="dateRange"
          type="daterange"
          range-separator="-"
          start-placeholder="开始日期"
          end-placeholder="结束日期"
          value-format="YYYY-MM-DD"
        ></el-date-picker>
      </el-form-item>
      <el-form-item label="部门" prop="workshopId">
        <el-select
          v-model="queryParams.workshopId"
          filterable
          remote
          reserve-keyword
          placeholder="请输入部门名称搜索"
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
      <el-form-item label="生产编号" prop="interval">
        <el-input
          v-model="queryParams.interval"
          placeholder="请输入生产编号(只能输入数字和-)"
          clearable
          style="width: 240px"
          @keyup.enter="handleQuery"
          @input="handleIntervalInputQuery"
        />
      </el-form-item>
      <el-form-item>
        <el-button type="primary" icon="Search" @click="handleQuery">搜索</el-button>
        <el-button icon="Refresh" @click="resetQuery">重置</el-button>
      </el-form-item>
    </el-form>

    <el-row :gutter="10" class="mb8">
      <right-toolbar v-model:showSearch="showSearch" @queryTable="getList" :columns="columns"></right-toolbar>
    </el-row>

    <adaptive-table border stripe v-loading="loading" :data="intoDetailList">
      <el-table-column type="index" width="60" align="center" />
      <el-table-column sortable show-overflow-tooltip label="入库单号" align="center" prop="intoNo" key="intoNo" v-if="columns[0].visible"/>
      <el-table-column sortable show-overflow-tooltip label="入库日期" align="center" prop="intoDate" v-if="columns[1].visible" />
      <el-table-column sortable show-overflow-tooltip label="部门" align="center" prop="workshopName" v-if="columns[2].visible" />
      <el-table-column sortable show-overflow-tooltip label="物料名称" align="center" prop="material.materialName" v-if="columns[3].visible" />
      <el-table-column sortable show-overflow-tooltip label="规格型号" align="center" prop="material.specification" v-if="columns[4].visible" />
      <el-table-column sortable show-overflow-tooltip label="生产编号" align="center" prop="interval" v-if="columns[5].visible" />
      <el-table-column sortable show-overflow-tooltip label="单价" align="center" prop="unitPrice" v-if="columns[6].visible" />
      <el-table-column sortable show-overflow-tooltip label="入库数量" align="center" prop="quantity" v-if="columns[7].visible" />
      <el-table-column sortable show-overflow-tooltip label="小计" align="center" prop="subtotal" v-if="columns[8].visible" />
      <el-table-column sortable show-overflow-tooltip label="备注" align="center" prop="remark" v-if="columns[9].visible" />
    </adaptive-table>
    
    <!-- 添加或修改明细对话框 -->
    <el-dialog :title="title" v-model="open" width="500px" append-to-body draggable>
      <el-form ref="intoDetailRef" :model="form" :rules="rules" label-width="80px">
        <el-form-item label="入库id" prop="intoId">
          <el-input v-model="form.intoId" placeholder="请输入入库id" />
        </el-form-item>
        <el-form-item label="物料id" prop="materialId">
          <el-input v-model="form.materialId" placeholder="请输入物料id" />
        </el-form-item>
        <el-form-item label="入库数量" prop="quantity">
          <el-input v-model="form.quantity" placeholder="请输入入库数量" />
        </el-form-item>
        <el-form-item label="单价" prop="unitPrice">
          <el-input v-model="form.unitPrice" placeholder="请输入单价" />
        </el-form-item>
        <el-form-item label="含税价" prop="taxPrice">
          <el-input v-model="form.taxPrice" placeholder="请输入含税价" />
        </el-form-item>
        <el-form-item label="出厂编号" prop="interval">
          <el-input
            v-model="form.interval"
            placeholder="请输入出厂编号"
            @input="handleIntervalInput"
          />
        </el-form-item>
        <el-form-item label="明细备注" prop="remark">
          <el-input v-model="form.remark" type="textarea" placeholder="请输入内容" />
        </el-form-item>
      </el-form>
      <template #footer>
        <div class="dialog-footer">
          <el-button type="primary" @click="submitForm">确 定</el-button>
          <el-button @click="cancel">取 消</el-button>
        </div>
      </template>
    </el-dialog>
  </div>
</template>

<script setup name="IntoDetail">
import { listByNameOrContact } from "@/api/base/workshop.js";
import {
  addIntoDetail,
  delIntoDetail,
  getIntoDetail,
  listNoPage,
  updateIntoDetail,
} from "@/api/entry/intoDetail";
import { selectSaifuteInventoryListGroupByMaterial } from "@/api/stock/inventory.js";

const { proxy } = getCurrentInstance();

const intoDetailList = ref([]);
const open = ref(false);
const loading = ref(true);
const showSearch = ref(true);
const ids = ref([]);
const single = ref(true);
const multiple = ref(true);
const title = ref("");
// 设置默认日期为当天
const today = new Date().toISOString().slice(0, 10);
const dateRange = ref([today, today]);
const materialLoading = ref(false);
const materialOptions = ref([]);
const workshopOptions = ref([]);
const workshopLoading = ref(false);

const data = reactive({
  form: {},
  queryParams: {
    intoNo: null,
    materialId: null,
    materialName: null,
    specification: null,
    workshopId: null,
    interval: null,
  },
  rules: {
    quantity: [
      { required: true, message: "入库数量不能为空", trigger: "blur" },
    ],
    unitPrice: [{ required: true, message: "单价不能为空", trigger: "blur" }],
    taxPrice: [{ required: true, message: "含税价不能为空", trigger: "blur" }],
  },
});

const { queryParams, form, rules } = toRefs(data);

// 添加columns数组定义
const columns = ref([
  { key: 0, label: `入库单号`, visible: false },
  { key: 1, label: `入库日期`, visible: true },
  { key: 2, label: `部门`, visible: true },
  { key: 3, label: `物料名称`, visible: true },
  { key: 4, label: `规格型号`, visible: true },
  { key: 5, label: `生产编号`, visible: true },
  { key: 6, label: `单价`, visible: true },
  { key: 7, label: `入库数量`, visible: true },
  { key: 8, label: `小计`, visible: true },
  { key: 9, label: `备注`, visible: true },
]);

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
    } else if (column.property === "subtotal") {
      const values = data.map((item) => Number(item.subtotal));
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

/** 查询明细列表 */
function getList() {
  loading.value = true;
  // 添加日期范围参数
  const query = { ...queryParams.value };
  if (dateRange.value && dateRange.value.length === 2) {
    if (!query.params) {
      query.params = {};
    }
    query.params.beginTime = dateRange.value[0];
    query.params.endTime = dateRange.value[1];
  }
  listNoPage(query)
    .then((response) => {
      if (response.data && Array.isArray(response.data)) {
        intoDetailList.value = response.data.map((item) => {
          // 计算小计 = 数量 * 单价
          const subtotal =
            item.quantity && item.unitPrice
              ? (item.quantity * item.unitPrice).toFixed(2)
              : "0.00";
          return {
            ...item,
            subtotal: subtotal,
          };
        });
      } else {
        intoDetailList.value = [];
      }
      loading.value = false;
    })
    .catch((error) => {
      console.error("Error fetching detail list:", error);
      intoDetailList.value = [];
      loading.value = false;
    });
}

// 取消按钮
function cancel() {
  open.value = false;
  reset();
}

// 表单重置
function reset() {
  form.value = {
    detailId: null,
    intoId: null,
    materialId: null,
    quantity: null,
    unitPrice: null,
    taxPrice: null,
    interval: null,
    remark: null,
  };
  proxy.resetForm("intoDetailRef");
}

/** 搜索按钮操作 */
function handleQuery() {
  getList();
}

/** 重置按钮操作 */
function resetQuery() {
  dateRange.value = [today, today];
  proxy.resetForm("queryRef");
  handleQuery();
}

// 多选框选中数据
function handleSelectionChange(selection) {
  ids.value = selection.map((item) => item.detailId);
  single.value = selection.length !== 1;
  multiple.value = !selection.length;
}

/** 新增按钮操作 */
function handleAdd() {
  reset();
  open.value = true;
  title.value = "添加明细";
}

/** 修改按钮操作 */
function handleUpdate(row) {
  reset();
  const _detailId = row.detailId || ids.value;
  getIntoDetail(_detailId).then((response) => {
    form.value = response.data;
    open.value = true;
    title.value = "修改明细";
  });
}

/** 提交按钮 */
function submitForm() {
  proxy.$refs["intoDetailRef"].validate((valid) => {
    if (valid) {
      if (form.value.detailId != null) {
        updateIntoDetail(form.value).then((response) => {
          proxy.$modal.msgSuccess("修改成功");
          open.value = false;
          getList();
        });
      } else {
        addIntoDetail(form.value).then((response) => {
          proxy.$modal.msgSuccess("新增成功");
          open.value = false;
          getList();
        });
      }
    }
  });
}

/** 作废按钮操作 */
function handleDelete(row) {
  const _detailIds = row.detailId || ids.value;
  proxy.$modal
    .confirm("是否确认作废明细？")
    .then(() => delIntoDetail(_detailIds))
    .then(() => {
      getList();
      proxy.$modal.msgSuccess("作废成功");
    })
    .catch(() => {});
}

/** 导出按钮操作 */
function handleExport() {
  proxy.download(
    "entry/into/detail/export",
    {
      ...queryParams.value,
    },
    `intoDetail_${new Date().getTime()}.xlsx`,
  );
}

/** 处理出厂编号输入限制 */
function handleIntervalInput() {
  if (form.value.interval) {
    // 只允许输入数字、字母、斜杠(/)和连字符(-)
    form.value.interval = form.value.interval.replace(
      /[^0-9a-zA-Z/\-、\\]/g,
      "",
    );
  }
}

/** 处理查询中的出厂编号输入限制 */
function handleIntervalInputQuery(value) {
  // 只允许输入数字和连字符(-)
  const newValue = value.replace(/[^0-9-]/g, "");
  // 更新输入框的值
  queryParams.value.interval = newValue;
}

/** 搜索部门 */
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

getList();
</script>
