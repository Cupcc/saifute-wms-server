<template>
  <div class="app-container">
    <el-form :model="queryParams" ref="queryRef" :inline="true" v-show="showSearch" label-width="68px">
	    <el-form-item label="物料分类" prop="category">
		    <el-select v-model="queryParams.category" placeholder="请选择类型" clearable multiple collapse-tags collapse-tags-tooltip style="width: 200px">
			    <el-option
				    v-for="dict in saifute_material_category"
				    :key="dict.value"
				    :label="dict.label"
				    :value="dict.value" />
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
	    
	    <el-form-item label="物料编码" prop="materialCode2">
		    <el-input v-model="queryParams.materialCode2" placeholder="请输入物料编码" clearable style="width: 200px" @keyup.enter="handleQuery" />
	    </el-form-item>
	    
	    <el-form-item label="物料名称" prop="materialName">
		    <el-input v-model="queryParams.materialName" placeholder="请输入物料名称" clearable style="width: 200px" @keyup.enter="handleQuery" />
	    </el-form-item>
	    
	    <el-form-item label="规格型号" prop="specification">
		    <el-input v-model="queryParams.specification" placeholder="请输入规格型号" clearable style="width: 200px" @keyup.enter="handleQuery" />
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
          v-hasPermi="['stock:inventory:add']"
        >新增</el-button>
      </el-col>
      <right-toolbar v-model:showSearch="showSearch" @queryTable="getList" :columns="columns"></right-toolbar>
    </el-row>

    <adaptive-table border stripe v-loading="loading" :data="inventoryList">
      <el-table-column type="index" width="50" align="center" />
      <el-table-column sortable show-overflow-tooltip label="物料编码" align="center" v-if="columns[0].visible">
        <template #default="scope">
          <el-button link type="primary" @click="handleViewDetail(scope.row.materialId)">
            {{ scope.row.materialCode }}
          </el-button>
        </template>
      </el-table-column>
      <el-table-column sortable show-overflow-tooltip label="物料名称" align="center" v-if="columns[1].visible">
        <template #default="scope">
          <el-button link type="primary" @click="handleViewDetail(scope.row.materialId)">
            {{ scope.row.materialName }}
          </el-button>
        </template>
      </el-table-column>
      <el-table-column sortable show-overflow-tooltip label="规格型号" align="center" prop="specification" v-if="columns[2].visible">
	      <template #default="scope">
		      <el-button link type="primary" @click="handleViewDetail(scope.row.materialId)">
			      {{ scope.row.specification }}
		      </el-button>
	      </template>
      </el-table-column>
      <el-table-column sortable show-overflow-tooltip label="当前库存" align="center" prop="currentQty" v-if="columns[3].visible">
        <template #default="scope">
          <el-button
            link
            type="primary"
            @click="handleViewDetail(scope.row.materialId)"
            :style="{ color: scope.row.currentQty < 0 ? 'red' : '' }"
          >
            {{ scope.row.currentQty }}
          </el-button>
        </template>
      </el-table-column>
    </adaptive-table>
    
    <pagination
      v-show="total>0"
      :total="total"
      v-model:page="queryParams.pageNum"
      v-model:limit="queryParams.pageSize"
      @pagination="getList"
    />

    <!-- 添加或修改库存对话框 -->
    <el-dialog :title="title" v-model="open" width="500px" append-to-body draggable v-loading="dialogLoading">
      <el-form ref="inventoryRef" :model="form" :rules="rules" label-width="80px">
        <el-form-item label="物料编码" prop="materialId">
          <el-select
            v-model="form.materialId"
            filterable
            remote
            reserve-keyword
            placeholder="请输入物料名称或规格型号搜索"
            :remote-method="searchMaterial"
            :loading="materialLoading"
            @change="handleMaterialChange">
            <el-option
              v-for="item in materialOptions"
              :key="item.materialId"
              :label="item.materialName + ' ' + item.specification"
              :value="item.materialId">
              <span style="float: left">{{ item.materialCode }}</span>
              <span style="float: left; margin-left: 10px;">{{ item.materialName }}</span>
              <span style="float: right; color: #8492a6; font-size: 13px; margin-left: 20px;">{{ item.specification }}</span>
            </el-option>
          </el-select>
        </el-form-item>
        <el-form-item label="当前库存" prop="currentQty">
          <el-input v-model="form.currentQty" placeholder="请输入当前库存" />
        </el-form-item>
        <el-form-item label="盘点时间" prop="lastStocktake">
          <el-date-picker clearable
            v-model="form.lastStocktake"
            type="date"
            value-format="YYYY-MM-DD"
            placeholder="请选择上次盘点时间">
          </el-date-picker>
        </el-form-item>
        
      </el-form>
      <template #footer>
        <div class="dialog-footer">
          <el-button v-if="!isView" type="primary" @click="submitForm">确 定</el-button>
          <el-button @click="cancel">取 消</el-button>
        </div>
      </template>
    </el-dialog>

    <!-- 详情查看对话框 -->
    <el-dialog title="详情" v-model="materialViewOpen" width="500px" append-to-body>
	    <el-row :gutter="10">
		    <el-col :span="24">
			    <el-card class="box-card">
				    <template #header>
					    <div class="card-header">
						    <span>物料信息</span>
					    </div>
				    </template>
			      <el-descriptions :column="1" border>
			        <el-descriptions-item label="物料编码">{{ materialViewForm.materialCode }}</el-descriptions-item>
			        <el-descriptions-item label="物料名称">{{ materialViewForm.materialName }}</el-descriptions-item>
			        <el-descriptions-item label="规格型号">{{ materialViewForm.specification }}</el-descriptions-item>
			        <el-descriptions-item label="分类">
			          {{ getCategoryLabel(materialViewForm.category) }}
			        </el-descriptions-item>
			        <el-descriptions-item label="单位">{{ materialViewForm.unit }}</el-descriptions-item>
			      </el-descriptions>
			    </el-card>
		    </el-col>
	    </el-row>
      <template #footer>
        <div class="dialog-footer">
          <el-button @click="materialViewOpen = false">关 闭</el-button>
        </div>
      </template>
    </el-dialog>
  </div>
</template>

<script setup name="Inventory">
import { getMaterial, listMaterialByCodeOrName } from "@/api/base/material";
import {
  addInventory,
  delInventory,
  getInventory,
  listInventory,
  updateInventory,
} from "@/api/stock/inventory";
import { useDict } from "@/utils/dict";

const { proxy } = getCurrentInstance();

// 获取物料分类字典数据
const { saifute_material_category } = useDict("saifute_material_category");

const inventoryList = ref([]);
const open = ref(false);
const loading = ref(true);
const showSearch = ref(true);
const ids = ref([]);
const single = ref(true);
const multiple = ref(true);
const total = ref(0);
const title = ref("");
const dialogLoading = ref(false);
const materialLoading = ref(false);
const materialOptions = ref([]);
const materialViewOpen = ref(false);
const materialViewForm = ref([]);
const isView = ref(false); // 添加查看模式标识

const data = reactive({
  form: {},
  queryParams: {
    pageNum: 1,
    pageSize: 30,
    materialId: null,
    category: null,
    materialCode2: null,
    materialName: null,
    specification: null,
  },
  rules: {
    materialId: [{ required: true, message: "物料不能为空", trigger: "blur" }],
    currentQty: [
      { required: true, message: "当前库存不能为空", trigger: "blur" },
    ],
  },
});

const { queryParams, form, rules } = toRefs(data);

// 添加columns数组定义
const columns = ref([
  { key: 0, label: `物料编码`, visible: false },
  { key: 1, label: `物料名称`, visible: true },
  { key: 2, label: `规格型号`, visible: true },
  { key: 3, label: `当前库存`, visible: true },
]);

/** 查询库存列表 */
function getList() {
  loading.value = true;
  listInventory(queryParams.value).then((response) => {
    inventoryList.value = response.rows;
    total.value = response.total;
    loading.value = false;
  });
}

/** 重置按钮操作 */
function resetQuery() {
  proxy.resetForm("queryRef");
  handleQuery();
}

// 取消按钮
function cancel() {
  open.value = false;
  isView.value = false; // 重置查看模式标识
  reset();
}

// 表单重置
function reset() {
  form.value = {
    inventoryId: null,
    materialId: null,
    currentQty: null,
    updateTime: null,
    lastStocktake: null,
    updateBy: null,
    remark: null,
  };
  materialOptions.value = [];
  isView.value = false; // 重置查看模式标识
  proxy.resetForm("inventoryRef");
}

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

/** 物料选择变更 */
function handleMaterialChange(val) {
  // 可以在这里添加选择物料后的处理逻辑
}

/** 搜索按钮操作 */
function handleQuery() {
  queryParams.value.pageNum = 1;
  getList();
}

/** 查看物料详情 */
function handleViewDetail(materialId) {
  getMaterial(materialId).then((response) => {
    materialViewForm.value = response.data;
    materialViewOpen.value = true;
  });
}

/** 根据分类值获取分类标签 */
function getCategoryLabel(value) {
  if (!value) return "";
  const category = saifute_material_category.value.find(
    (item) => item.value === value.toString(),
  );
  return category ? category.label : value;
}

// 多选框选中数据
function handleSelectionChange(selection) {
  ids.value = selection.map((item) => item.inventoryId);
  single.value = selection.length !== 1;
  multiple.value = !selection.length;
}

/** 修改按钮操作 */
function handleUpdate(row) {
  reset();
  const _inventoryId = row.inventoryId || ids.value;
  open.value = true;
  title.value = "修改库存";
  dialogLoading.value = true;
  getInventory(_inventoryId)
    .then((response) => {
      form.value = response.data;
      form.value.materialCode = response.data.materialCode;
      isView.value = false;

      if (form.value.inventoryId != null) {
        rules.value.remark = [
          { required: true, message: "备注不能为空", trigger: "blur" },
        ];
      }
    })
    .finally(() => {
      dialogLoading.value = false;
    });
}

/** 新增按钮操作 */
function handleAdd() {
  reset();
  open.value = true;
  title.value = "添加库存";
  isView.value = false; // 设置为新增模式
  // 新增时移除备注验证规则
  delete rules.value.remark;
}

/** 提交按钮 */
function submitForm() {
  proxy.$refs["inventoryRef"].validate((valid) => {
    if (valid) {
      if (form.value.inventoryId != null) {
        // 修改时提交数量、盘点时间和备注
        const updateData = {
          inventoryId: form.value.inventoryId,
          currentQty: form.value.currentQty,
          lastStocktake: form.value.lastStocktake,
          remark: form.value.remark,
        };
        updateInventory(updateData).then((response) => {
          proxy.$modal.msgSuccess("修改成功");
          open.value = false;
          getList();
        });
      } else {
        // 新增时提交所有字段
        addInventory(form.value).then((response) => {
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
  const _inventoryIds = row.inventoryId || ids.value;
  proxy.$modal
    .confirm("是否确认作废库存？")
    .then(() => delInventory(_inventoryIds))
    .then(() => {
      getList();
      proxy.$modal.msgSuccess("作废成功");
    })
    .catch(() => {});
}

/** 导出按钮操作 */
function handleExport() {
  proxy.download(
    "stock/inventory/export",
    {
      ...queryParams.value,
    },
    `inventory_${new Date().getTime()}.xlsx`,
  );
}

getList();
</script>
