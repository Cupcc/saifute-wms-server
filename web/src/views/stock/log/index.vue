<template>
  <div class="app-container">
    <el-form :model="queryParams" ref="queryRef" :inline="true" v-show="showSearch" label-width="68px">
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
          @change="handleQuery">
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
	    <el-form-item label="单据日期" style="width: 308px">
		    <el-date-picker
			    v-model="rangeRelatedOrderDate"
			    value-format="YYYY-MM-DD"
			    type="daterange"
			    range-separator="-"
			    start-placeholder="开始日期"
			    end-placeholder="结束日期"
		    ></el-date-picker>
	    </el-form-item>
      <el-form-item label="单据类型" prop="relatedOrderType">
        <el-select
          v-model="queryParams.relatedOrderType"
          placeholder="请选择单据类型"
          clearable
          style="width: 240px"
          @change="handleRelatedOrderTypeChange">
          <el-option
            v-for="dict in related_order_type"
            :key="dict.value"
            :label="dict.label"
            :value="dict.value"
          />
        </el-select>
      </el-form-item>
      <el-form-item label="单据编号" prop="relatedOrderNo">
        <el-input
          v-model="queryParams.relatedOrderNo"
          placeholder="请输入单据编号(支持模糊查询)"
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
      <right-toolbar v-model:showSearch="showSearch" @queryTable="getList" :columns="columns"></right-toolbar>
    </el-row>
    
    <adaptive-table border stripe v-loading="loading" :data="logList">
      <el-table-column type="index" width="50" align="center" />
      <el-table-column sortable show-overflow-tooltip label="物料编码" align="center" prop="materialCode" v-if="columns[0].visible">
        <template #default="scope">
          <el-button link type="primary" @click="handleViewMaterial(scope.row.materialId)">
            {{ scope.row.materialCode }}
          </el-button>
        </template>
      </el-table-column>
      <el-table-column sortable show-overflow-tooltip label="物料名称" align="center" prop="materialName" v-if="columns[1].visible">
        <template #default="scope">
          <el-button link type="primary" @click="handleViewMaterial(scope.row.materialId)">
            {{ scope.row.materialName }}
          </el-button>
        </template>
      </el-table-column>
      <el-table-column sortable show-overflow-tooltip label="物料规格" align="center" prop="materialSpecification" v-if="columns[2].visible">
	      <template #default="scope">
		      <el-button link type="primary" @click="handleViewMaterial(scope.row.materialId)">
			      {{ scope.row.materialSpecification }}
		      </el-button>
	      </template>
      </el-table-column>
      <el-table-column sortable show-overflow-tooltip label="变动前库存数量" align="center" prop="beforeQty" v-if="columns[3].visible" />
      <el-table-column sortable show-overflow-tooltip label="变动数量" align="center" prop="changeQty" v-if="columns[4].visible">
        <template #default="scope">
          <span :style="{ color: scope.row.changeQty > 0 ? '#67C23A' : scope.row.changeQty < 0 ? '#F56C6C' : '#606266' }">
            {{ scope.row.changeQty }}
          </span>
        </template>
      </el-table-column>
      <el-table-column sortable show-overflow-tooltip label="变动后库存数量" align="center" prop="afterQty" v-if="columns[5].visible" />
      <el-table-column sortable show-overflow-tooltip label="单据类型" align="center" prop="relatedOrderType" v-if="columns[6].visible" >
	      <template #default="scope">
		      <dict-tag :options="related_order_type" :value="scope.row.relatedOrderType"/>
	      </template>
      </el-table-column>
      <el-table-column sortable show-overflow-tooltip label="单据编号" align="center" prop="relatedOrderNo" width="180" v-if="columns[7].visible" />
	    <el-table-column sortable show-overflow-tooltip label="单据日期" align="center" prop="relatedOrderDate" width="180" v-if="columns[8].visible">
		    <template #default="scope">
			    <span>{{ parseTime(scope.row.relatedOrderDate, '{y}-{m}-{d}') }}</span>
		    </template>
	    </el-table-column>
      <el-table-column sortable show-overflow-tooltip label="操作人" align="center" prop="operatorBy" v-if="columns[9].visible" />
      <el-table-column sortable show-overflow-tooltip label="操作时间" align="center" prop="operateTime" width="180" v-if="columns[10].visible">
        <template #default="scope">
          <span>{{ parseTime(scope.row.operateTime, '{y}-{m}-{d} {h}:{i}:{s}') }}</span>
        </template>
      </el-table-column>
	    
	    <el-table-column sortable show-overflow-tooltip label="备注" align="center" prop="remark" width="180" v-if="columns[11].visible" />
    </adaptive-table>
    
    <pagination
      v-show="total>0"
      :total="total"
      v-model:page="queryParams.pageNum"
      v-model:limit="queryParams.pageSize"
      @pagination="getList"
    />

    <!-- 添加或修改库存变动日志对话框 -->
    <el-dialog :title="title" v-model="open" width="500px" append-to-body draggable v-loading="dialogLoading">
      <el-form ref="logRef" :model="form" :rules="rules" label-width="80px">
        <el-form-item label="物料" prop="materialId">
          <el-input v-model="form.materialId" placeholder="请输入物料" />
        </el-form-item>
        <el-form-item label="仓库" prop="warehouseId">
          <el-input v-model="form.warehouseId" placeholder="请输入仓库" />
        </el-form-item>
        <el-form-item label="库位" prop="locationId">
          <el-input v-model="form.locationId" placeholder="请输入库位" />
        </el-form-item>
        <el-form-item label="变动数量" prop="changeQty">
          <el-input v-model="form.changeQty" placeholder="请输入变动数量" />
        </el-form-item>
        <el-form-item label="单据编号" prop="relatedOrderId">
          <el-select v-model="form.relatedOrderId" placeholder="请选择单据编号">
            <el-option
              v-for="dict in related_order_type"
              :key="dict.value"
              :label="dict.label"
              :value="parseInt(dict.value)"
            ></el-option>
          </el-select>
        </el-form-item>
        <el-form-item label="变动前库存数量" prop="beforeQty">
          <el-input v-model="form.beforeQty" placeholder="请输入变动前库存数量" />
        </el-form-item>
        <el-form-item label="变动后库存数量" prop="afterQty">
          <el-input v-model="form.afterQty" placeholder="请输入变动后库存数量" />
        </el-form-item>
        <el-form-item label="单据日期" prop="relatedOrderDate">
          <el-input v-model="form.relatedOrderDate" placeholder="请输入单据日期" />
        </el-form-item>
        <el-form-item label="操作人" prop="operatorBy">
          <el-input v-model="form.operatorBy" placeholder="请输入操作人" />
        </el-form-item>
        <el-form-item label="操作时间" prop="operateTime">
          <el-date-picker clearable
            v-model="form.operateTime"
            type="date"
            value-format="YYYY-MM-DD"
            placeholder="请选择操作时间">
          </el-date-picker>
        </el-form-item>
        <el-form-item label="变动说明" prop="remark">
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

    <!-- 物料详情查看对话框 -->
    <el-dialog title="物料详情" v-model="materialViewOpen" width="700px" append-to-body>
      <el-descriptions :column="2" border>
        <el-descriptions-item label="物料编码">{{ materialViewForm.materialCode }}</el-descriptions-item>
        <el-descriptions-item label="物料名称">{{ materialViewForm.materialName }}</el-descriptions-item>
        <el-descriptions-item label="规格型号">{{ materialViewForm.specification }}</el-descriptions-item>
        <el-descriptions-item label="分类">{{ getCategoryLabel(materialViewForm.category) }}</el-descriptions-item>
        <el-descriptions-item label="单位">{{ materialViewForm.unit }}</el-descriptions-item>
        <el-descriptions-item label="安全库存">{{ materialViewForm.stockMin }}</el-descriptions-item>
      </el-descriptions>
      <template #footer>
        <div class="dialog-footer">
          <el-button @click="materialViewOpen = false">关 闭</el-button>
        </div>
      </template>
    </el-dialog>
  </div>
</template>

<script setup name="Log">
import { getMaterial, listMaterialByCodeOrName } from "@/api/base/material";
import { addLog, delLog, getLog, listLogVo, updateLog } from "@/api/stock/log";
import { useDict } from "@/utils/dict";

const { proxy } = getCurrentInstance();
const { related_order_type } = proxy.useDict("related_order_type");

const logList = ref([]);
const open = ref(false);
const loading = ref(true);
const showSearch = ref(true);
const ids = ref([]);
const single = ref(true);
const multiple = ref(true);
const total = ref(0);
const title = ref("");
const dialogLoading = ref(false);
const materialViewOpen = ref(false);
const materialViewForm = ref({});
const rangeRelatedOrderDate = ref([]);

const data = reactive({
  form: {},
  queryParams: {
    pageNum: 1,
    pageSize: 30,
    materialId: null,
    warehouseId: null,
    locationId: null,
    relatedOrderType: null,
    relatedOrderId: null,
    relatedOrderNo: null,
  },
  rules: {},
});

const { queryParams, form, rules } = toRefs(data);

// 添加columns数组定义
const columns = ref([
  { key: 0, label: `物料编码`, visible: false },
  { key: 1, label: `物料名称`, visible: true },
  { key: 2, label: `物料规格`, visible: true },
  { key: 3, label: `变动前库存数量`, visible: true },
  { key: 4, label: `变动数量`, visible: true },
  { key: 5, label: `变动后库存数量`, visible: true },
  { key: 6, label: `单据类型`, visible: true },
  { key: 7, label: `单据编号`, visible: true },
  { key: 8, label: `单据编号`, visible: true },
  { key: 9, label: `操作人`, visible: true },
  { key: 10, label: `操作时间`, visible: false },
  { key: 11, label: `备注`, visible: false },
]);

/** 查询库存变动日志列表 */
function getList() {
  loading.value = true;
  queryParams.value.params = {};
  if (
    Array.isArray(rangeRelatedOrderDate.value) &&
    rangeRelatedOrderDate.value.length === 2
  ) {
    queryParams.value.params["startRelatedOrderDate"] =
      rangeRelatedOrderDate.value[0];
    queryParams.value.params["endRelatedOrderDate"] =
      rangeRelatedOrderDate.value[1];
  }
  listLogVo(queryParams.value).then((response) => {
    logList.value = response.rows;
    total.value = response.total;
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
    logId: null,
    materialId: null,
    warehouseId: null,
    locationId: null,
    changeQty: null,
    relatedOrderType: null,
    relatedOrderId: null,
    beforeQty: null,
    afterQty: null,
    relatedOrderDate: null,
    operatorBy: null,
    operateTime: null,
    remark: null,
  };
  proxy.resetForm("logRef");
}

/** 搜索按钮操作 */
function handleQuery() {
  queryParams.value.pageNum = 1;
  getList();
}

/** 重置按钮操作 */
function resetQuery() {
  rangeRelatedOrderDate.value = [];
  proxy.resetForm("queryRef");
  handleQuery();
}

// 多选框选中数据
function handleSelectionChange(selection) {
  ids.value = selection.map((item) => item.logId);
  single.value = selection.length !== 1;
  multiple.value = !selection.length;
}

/** 新增按钮操作 */
function handleAdd() {
  reset();
  open.value = true;
  title.value = "添加库存变动日志";
}

/** 修改按钮操作 */
function handleUpdate(row) {
  reset();
  const _logId = row.logId || ids.value;
  open.value = true;
  title.value = "修改库存变动日志";
  dialogLoading.value = true;
  getLog(_logId)
    .then((response) => {
      form.value = response.data;
    })
    .finally(() => {
      dialogLoading.value = false;
    });
}

/** 提交按钮 */
function submitForm() {
  proxy.$refs["logRef"].validate((valid) => {
    if (valid) {
      if (form.value.logId != null) {
        updateLog(form.value).then((response) => {
          proxy.$modal.msgSuccess("修改成功");
          open.value = false;
          getList();
        });
      } else {
        addLog(form.value).then((response) => {
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
  const _logIds = row.logId || ids.value;
  proxy.$modal
    .confirm("是否确认作废库存变动日志？")
    .then(() => delLog(_logIds))
    .then(() => {
      getList();
      proxy.$modal.msgSuccess("作废成功");
    })
    .catch(() => {});
}

/** 查看物料详情 */
function handleViewMaterial(materialId) {
  getMaterial(materialId).then((response) => {
    materialViewForm.value = response.data;
    materialViewOpen.value = true;
  });
}

/** 导出按钮操作 */
function handleExport() {
  proxy.download(
    "stock/log/export",
    {
      ...queryParams.value,
    },
    `log_${new Date().getTime()}.xlsx`,
  );
}

/** 根据分类值获取分类标签 */
function getCategoryLabel(value) {
  if (!value) return "";
  const category = saifute_material_category.value.find(
    (item) => item.value === value.toString(),
  );
  return category ? category.label : value;
}

/** 获取物料分类字典数据 */
const { saifute_material_category, sys_yes_no } = useDict(
  "saifute_material_category",
  "sys_yes_no",
);

/** 搜索物料 */
function searchMaterial(query) {
  materialLoading.value = true;
  listMaterialByCodeOrName({
    materialCode: query,
  })
    .then((response) => {
      materialOptions.value = response.rows;
      materialLoading.value = false;
    })
    .catch(() => {
      materialLoading.value = false;
    });
}

/** 搜索库位 */
function searchLocation(query) {
  if (query !== "") {
    locationLoading.value = true;
    listLocation({ locationCode: query, pageSize: 20 })
      .then((response) => {
        locationOptions.value = response.rows;
        locationLoading.value = false;
      })
      .catch(() => {
        locationLoading.value = false;
      });
  } else {
    locationOptions.value = [];
  }
}

/** 处理单据类型变化 */
function handleRelatedOrderTypeChange() {
  // 清空单据编号输入框
  queryParams.value.relatedOrderNo = null;
}

const materialLoading = ref(false);
const locationLoading = ref(false);
const materialOptions = ref([]);
const locationOptions = ref([]);

getList();
</script>
