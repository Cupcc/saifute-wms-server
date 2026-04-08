<template>
  <div class="app-container">
    <el-form :model="queryParams" ref="queryRef" :inline="true" v-show="showSearch" label-width="68px">
      <el-form-item label="退料单号" prop="returnNo">
        <el-input
          v-model="queryParams.returnNo"
          placeholder="请输入退料单号"
          clearable
          style="width: 240px"
          @keyup.enter="handleQuery"
        />
      </el-form-item>
      <el-form-item label="退料日期" style="width: 308px">
        <el-date-picker
          v-model="daterangeReturnDate"
          value-format="YYYY-MM-DD"
          type="daterange"
          range-separator="-"
          start-placeholder="开始日期"
          end-placeholder="结束日期"
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
        <combo-input v-model="queryParams.materialName" scope="material" field="materialName" placeholder="请选择或输入物料名称" width="240px" />
      </el-form-item>
      <el-form-item label="规格型号" prop="specification">
        <combo-input v-model="queryParams.specification" scope="material" field="specModel" placeholder="请选择或输入规格型号" width="240px" />
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
          @click="handleAdd"
          v-hasPermi="['take:returnDetail:add']"
        >新增</el-button>
      </el-col>
      <el-col :span="1.5">
        <el-button
          type="success"
          plain
          icon="Edit"
          :disabled="single"
          @click="handleUpdate"
          v-hasPermi="['take:returnDetail:edit']"
        >修改</el-button>
      </el-col>
      <el-col :span="1.5">
        <el-button
          type="danger"
          plain
          icon="Delete"
          :disabled="multiple"
          @click="handleDelete"
          v-hasPermi="['take:returnDetail:remove']"
        >作废</el-button>
      </el-col>
      <right-toolbar v-model:showSearch="showSearch" @queryTable="getList" :columns="columns"></right-toolbar>
    </el-row>

    <adaptive-table border stripe v-loading="loading" :data="returnDetailList">
      <el-table-column type="index" width="60" align="center" />
      <el-table-column sortable show-overflow-tooltip label="退料单号" align="center" prop="returnNo" v-if="columns[0].visible"/>
      <el-table-column sortable show-overflow-tooltip label="退料日期" align="center" prop="returnDate" v-if="columns[1].visible" />
      <el-table-column sortable show-overflow-tooltip label="部门" align="center" prop="workshopName" v-if="columns[2].visible" />
      <el-table-column sortable show-overflow-tooltip label="物料名称" align="center" prop="materialName" v-if="columns[3].visible" />
      <el-table-column sortable show-overflow-tooltip label="规格型号" align="center" prop="specification" v-if="columns[4].visible" />
      <el-table-column sortable show-overflow-tooltip label="单价" align="center" prop="unitPrice" v-if="columns[5].visible" />
      <el-table-column sortable show-overflow-tooltip label="数量" align="center" prop="returnQty" v-if="columns[6].visible" />
      <el-table-column sortable show-overflow-tooltip label="小计" align="center" v-if="columns[7].visible" prop="subtotal">
        <template #default="scope">
          {{ (scope.row.unitPrice * scope.row.returnQty).toFixed(2) }}
        </template>
      </el-table-column>
      <el-table-column sortable show-overflow-tooltip label="备注" align="center" prop="remark" v-if="columns[8].visible" />
    </adaptive-table>
    
    <!-- 添加或修改退料单明细对话框 -->
    <el-dialog :title="title" v-model="open" width="500px" append-to-body draggable v-loading="dialogLoading">
      <el-form ref="returnDetailRef" :model="form" :rules="rules" label-width="80px">
        <el-form-item label="关联退料单主表的return_id" prop="returnId">
          <el-input v-model="form.returnId" placeholder="请输入关联退料单主表的return_id" />
        </el-form-item>
        <el-form-item label="物料ID" prop="materialId">
          <el-input v-model="form.materialId" placeholder="请输入物料ID" />
        </el-form-item>
        <el-form-item label="退料数量" prop="returnQty">
          <el-input v-model="form.returnQty" placeholder="请输入退料数量" />
        </el-form-item>
        <el-form-item label="退料原因：1-质量问题 2-规格不符 3-多发退回 4-其他" prop="returnReason">
          <el-input v-model="form.returnReason" placeholder="请输入退料原因：1-质量问题 2-规格不符 3-多发退回 4-其他" />
        </el-form-item>
        <el-form-item label="单位" prop="unit">
          <combo-input v-model="form.unit" scope="material" field="unitCode" placeholder="请选择或输入单位" />
        </el-form-item>
        <el-form-item label="单价" prop="unitPrice">
          <el-input v-model="form.unitPrice" placeholder="请输入单价" />
        </el-form-item>
        <el-form-item label="明细备注" prop="remark">
          <el-input v-model="form.remark" placeholder="请输入明细备注" />
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

<script setup name="ReturnDetail">
import { listByNameOrContact } from "@/api/base/workshop.js";
import { selectSaifuteInventoryListGroupByMaterial } from "@/api/stock/inventory.js";
import {
  addReturnDetail,
  delReturnDetail,
  getReturnDetail,
  listNoPage,
  listReturnDetail,
  updateReturnDetail,
} from "@/api/take/returnDetail";

const { proxy } = getCurrentInstance();

const returnDetailList = ref([]);
const open = ref(false);
const loading = ref(true);
const showSearch = ref(true);
const ids = ref([]);
const single = ref(true);
const multiple = ref(true);
const title = ref("");
const dialogLoading = ref(false);

// 设置默认日期为当天
const today = new Date().toISOString().slice(0, 10);
const daterangeReturnDate = ref([today, today]);

// 部门相关
const workshopOptions = ref([]);
const workshopLoading = ref(false);
const materialLoading = ref(false);
const materialOptions = ref([]);

const data = reactive({
  form: {},
  queryParams: {
    returnNo: null,
    workshopId: null,
    materialName: null,
    specification: null,
  },
  rules: {},
});

const { queryParams, form, rules } = toRefs(data);

// 添加columns数组定义
const columns = ref([
  { key: 0, label: `退料单号`, visible: false },
  { key: 1, label: `退料日期`, visible: true },
  { key: 2, label: `部门`, visible: true },
  { key: 3, label: `物料名称`, visible: true },
  { key: 4, label: `规格型号`, visible: true },
  { key: 5, label: `单价`, visible: true },
  { key: 6, label: `数量`, visible: true },
  { key: 7, label: `小计`, visible: true },
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

/** 查询退料单明细列表 */
function getList() {
  loading.value = true;
  queryParams.value.params = {};
  if (
    Array.isArray(daterangeReturnDate.value) &&
    daterangeReturnDate.value.length === 2
  ) {
    queryParams.value.params["beginReturnDate"] = daterangeReturnDate.value[0];
    queryParams.value.params["endReturnDate"] = daterangeReturnDate.value[1];
  }
  listNoPage(queryParams.value).then((response) => {
    returnDetailList.value = response.data;
    loading.value = false;
  });
}

/** 查询部门 */
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

/** 合计行计算 */
function getSummaries(param) {
  const { columns, data } = param;
  const sums = [];
  columns.forEach((column, index) => {
    if (index === 0) {
      sums[index] = "合计";
      return;
    }
    if (column.property === "returnQty") {
      const values = data.map((item) => Number(item.returnQty));
      sums[index] = values
        .reduce((prev, curr) => {
          const value = Number(curr);
          if (!isNaN(value)) {
            return prev + curr;
          } else {
            return prev;
          }
        }, 0)
        .toFixed(2);
    } else if (column.property === "unitPrice") {
      // 单价不计算合计
      sums[index] = "";
    } else if (column.property === "subtotal") {
      // 小计列合计
      const values = data.map(
        (item) => Number(item.unitPrice) * Number(item.returnQty),
      );
      sums[index] = values
        .reduce((prev, curr) => {
          const value = Number(curr);
          if (!isNaN(value)) {
            return prev + curr;
          } else {
            return prev;
          }
        }, 0)
        .toFixed(2);
    } else {
      sums[index] = "";
    }
  });

  return sums;
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
    returnId: null,
    materialId: null,
    returnQty: null,
    returnReason: null,
    unit: null,
    unitPrice: null,
    remark: null,
  };
  proxy.resetForm("returnDetailRef");
}

/** 搜索按钮操作 */
function handleQuery() {
  getList();
}

/** 重置按钮操作 */
function resetQuery() {
  daterangeReturnDate.value = [today, today];
  queryParams.value.returnNo = null;
  queryParams.value.workshopId = null;
  queryParams.value.materialName = null;
  queryParams.value.specification = null;
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
  title.value = "添加退料单明细";
}

/** 修改按钮操作 */
function handleUpdate(row) {
  reset();
  const _detailId = row.detailId || ids.value;
  open.value = true;
  title.value = "修改退料单明细";
  dialogLoading.value = true;
  getReturnDetail(_detailId)
    .then((response) => {
      form.value = response.data;
    })
    .finally(() => {
      dialogLoading.value = false;
    });
}

/** 提交按钮 */
function submitForm() {
  proxy.$refs["returnDetailRef"].validate((valid) => {
    if (valid) {
      if (form.value.detailId != null) {
        updateReturnDetail(form.value).then((response) => {
          proxy.$modal.msgSuccess("修改成功");
          open.value = false;
          getList();
        });
      } else {
        addReturnDetail(form.value).then((response) => {
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
    .confirm("是否确认作废退料单明细？")
    .then(() => delReturnDetail(_detailIds))
    .then(() => {
      getList();
      proxy.$modal.msgSuccess("作废成功");
    })
    .catch(() => {});
}

/** 导出按钮操作 */
function handleExport() {
  proxy.download(
    "take/returnDetail/export",
    {
      ...queryParams.value,
    },
    `returnDetail_${new Date().getTime()}.xlsx`,
  );
}

getList();
</script>
