<template>
  <div class="app-container">
    <el-form :model="queryParams" ref="queryRef" :inline="true" v-show="showSearch" label-width="68px">
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
      <el-form-item label="分类" prop="category">
        <el-select
          v-model="queryParams.category"
          placeholder="请选择分类"
          clearable
          style="width: 240px">
          <el-option
            v-for="dict in saifute_material_category"
            :key="dict.value"
            :label="dict.label"
            :value="parseInt(dict.value)"
          />
        </el-select>
      </el-form-item>
      <el-form-item label="单位" prop="unit">
        <el-input
          v-model="queryParams.unit"
          placeholder="请输入单位"
          clearable
          style="width: 240px"
          @keyup.enter="handleQuery"
        />
      </el-form-item>
      <el-form-item label="安全库存" prop="stockMin">
        <el-input
          v-model="queryParams.stockMin"
          placeholder="请输入安全库存"
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
      <el-col :span="1.5">
        <el-button
          type="primary"
          plain
          icon="Plus"
          @click="handleAdd"
          v-hasPermi="['base:material:add']"
        >新增</el-button>
      </el-col>
      <right-toolbar v-model:showSearch="showSearch" @queryTable="getList" :columns="columns"></right-toolbar>
    </el-row>

    <adaptive-table border stripe v-loading="loading" :data="materialList">
      <el-table-column type="index" width="50" align="center" />
      <el-table-column sortable show-overflow-tooltip label="物料编码" align="center" prop="materialCode" v-if="columns[0].visible" />
      <el-table-column sortable show-overflow-tooltip label="物料名称" align="center" prop="materialName" v-if="columns[1].visible" />
      <el-table-column sortable show-overflow-tooltip label="规格型号" align="center" prop="specification" v-if="columns[2].visible" />
      <el-table-column sortable show-overflow-tooltip label="分类" align="center" prop="category" v-if="columns[3].visible">
        <template #default="scope">
          <dict-tag :options="saifute_material_category" :value="scope.row.category"/>
        </template>
      </el-table-column>
      <el-table-column sortable show-overflow-tooltip label="单位" align="center" prop="unit" v-if="columns[5].visible" />
      <el-table-column sortable show-overflow-tooltip label="安全库存" align="center" prop="stockMin" v-if="columns[6].visible" />
      <el-table-column label="操作" align="center" class-name="small-padding fixed-width">
        <template #default="scope">
          <el-button link type="primary" icon="Edit" @click="handleUpdate(scope.row)" v-hasPermi="['base:material:edit']">修改</el-button>
          <el-button link type="primary" icon="Delete" @click="handleDelete(scope.row)" v-hasPermi="['base:material:remove']">作废</el-button>
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

    <!-- 添加或修改物料对话框 -->
    <el-dialog :title="title" v-model="open" width="1150px" append-to-body draggable v-loading="dialogLoading">
      <div style="display: flex;">
        <!-- 左侧表单区域 -->
        <div style="flex: 1; margin-right: 20px;">
          <el-form ref="materialRef" :model="form" :rules="rules" label-width="80px">
            <el-form-item label="物料编码" prop="materialCode">
              <el-input v-model="form.materialCode" placeholder="请输入物料编码" />
            </el-form-item>
            <el-form-item label="物料名称" prop="materialName">
              <el-input v-model="form.materialName" placeholder="请输入物料名称" @input="searchMaterials" />
            </el-form-item>
            <el-form-item label="规格型号" prop="specification">
              <el-input v-model="form.specification" placeholder="请输入规格型号" @input="searchMaterials" />
            </el-form-item>
            <el-form-item label="分类" prop="category">
              <el-select v-model="form.category" placeholder="请选择分类" @change="searchMaterials">
                <el-option
                  v-for="dict in saifute_material_category"
                  :key="dict.value"
                  :label="dict.label"
                  :value="parseInt(dict.value)"
                ></el-option>
              </el-select>
            </el-form-item>
            <el-form-item label="单位" prop="unit">
              <el-input v-model="form.unit" placeholder="请输入单位" />
            </el-form-item>
            <el-form-item label="安全库存" prop="stockMin">
              <el-input v-model="form.stockMin" placeholder="请输入安全库存" />
            </el-form-item>
          </el-form>
        </div>
        
        <!-- 右侧查询结果列表 -->
        <div style="flex: 1; width: 400px; border-left: 1px solid #dcdfe6; padding-left: 15px;">
	        <h3><span style="color: red">根据左侧输入的物料名称、规格型号、分类查询已存在的数据</span></h3>
          <el-table
            :data="searchResults"
            height="370"
            highlight-current-row
            style="width: 100%; cursor: pointer;">
            <el-table-column prop="materialCode" label="物料编码" width="120" show-overflow-tooltip />
            <el-table-column prop="materialName" label="物料名称" width="120" show-overflow-tooltip>
              <template #default="scope">
                <span v-html="highlightText(scope.row.materialName, form.materialName)"></span>
              </template>
            </el-table-column>
            <el-table-column prop="specification" label="规格型号" width="120" show-overflow-tooltip>
              <template #default="scope">
                <span v-html="highlightText(scope.row.specification, form.specification)"></span>
              </template>
            </el-table-column>
	          <el-table-column show-overflow-tooltip label="分类" align="center" width="60" prop="category">
		          <template #default="scope">
			          <dict-tag :options="saifute_material_category" :value="scope.row.category"/>
		          </template>
	          </el-table-column>
            <el-table-column prop="unit" label="单位" width="80" show-overflow-tooltip />
          </el-table>
          <div style="text-align: right; margin-top: 10px;">
	          <pagination
		          v-show="searchTotal>0"
		          :total="searchTotal"
		          v-model:page="searchPageNum"
		          v-model:limit="searchPageSize"
		          @pagination="searchMaterials"
	          />
          </div>
        </div>
      </div>
      
      <template #footer>
        <div class="dialog-footer">
          <el-button type="primary" @click="submitForm">确 定</el-button>
          <el-button @click="cancel">取 消</el-button>
        </div>
      </template>
    </el-dialog>
	  
	  <!-- 作废物料对话框 -->
	  <el-dialog title="作废" v-model="cancelOpen" width="500px" append-to-body draggable>
		  <el-form ref="cancelRef" :model="cancelForm" :rules="cancelRules" label-width="80px">
			  <el-form-item label="作废理由" prop="voidDescription">
				  <el-input
					  v-model="cancelForm.voidDescription"
					  type="textarea"
					  placeholder="请输入作废理由"
					  maxlength="200"
					  show-word-limit
				  />
			  </el-form-item>
		  </el-form>
		  <template #footer>
			  <div class="dialog-footer">
				  <el-button
					  type="primary"
					  @click="confirmCancel"
					  :disabled="!cancelForm.voidDescription || cancelForm.voidDescription.trim() === ''">
					  确 定
				  </el-button>
				  <el-button @click="cancelOpen = false">取 消</el-button>
			  </div>
		  </template>
	  </el-dialog>
  </div>
</template>

<script setup name="Material">
import {
  addMaterial,
  delMaterial,
  getMaterial,
  listMaterial,
  listMaterialByCodeOrName,
  updateMaterial,
} from "@/api/base/material";

const { proxy } = getCurrentInstance();
const { sys_yes_no, saifute_material_category } = proxy.useDict(
  "sys_yes_no",
  "saifute_material_category",
);

const materialList = ref([]);
const open = ref(false);
const cancelOpen = ref(false); // 添加作废对话框控制变量
const loading = ref(true);
const dialogLoading = ref(false);
const showSearch = ref(true);
const ids = ref([]);
const single = ref(true);
const multiple = ref(true);
const total = ref(0);
const title = ref("");

const data = reactive({
  form: {},
  cancelForm: {}, // 添加作废表单数据
  queryParams: {
    pageNum: 1,
    pageSize: 30,
    materialCode: null,
    materialName: null,
    specification: null,
    category: null,
    unit: null,
    stockMin: null,
  },
  rules: {
    materialCode: [
      { required: true, message: "物料编码不能为空", trigger: "blur" },
    ],
    materialName: [
      { required: true, message: "物料名称不能为空", trigger: "blur" },
    ],
    specification: [
      { required: true, message: "规格型号不能为空", trigger: "blur" },
    ],
    category: [{ required: true, message: "分类不能为空", trigger: "change" }],
  },
});

// 添加作废表单规则
const cancelRules = ref({
  voidDescription: [
    { required: true, message: "作废理由不能为空", trigger: "blur" },
    { validator: validatevoidDescription, trigger: "blur" },
  ],
});

// 验证作废理由是否为空或空格
function validatevoidDescription(rule, value, callback) {
  if (!value || value.trim() === "") {
    callback(new Error("作废理由不能为空或只包含空格"));
  } else {
    callback();
  }
}

const { queryParams, form, rules } = toRefs(data);

// 添加columns数组定义
const columns = ref([
  { key: 0, label: `物料编码`, visible: true },
  { key: 1, label: `物料名称`, visible: true },
  { key: 2, label: `规格型号`, visible: true },
  { key: 3, label: `分类`, visible: true },
  { key: 4, label: `附件`, visible: true },
  { key: 5, label: `单位`, visible: true },
  { key: 6, label: `安全库存`, visible: true },
]);

/** 查询物料列表 */
function getList() {
  loading.value = true;
  listMaterial(queryParams.value).then((response) => {
    materialList.value = response.rows;
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
    materialId: null,
    materialCode: null,
    materialName: null,
    specification: null,
    category: 1,
    unit: null,
    stockMin: null,
  };
  searchResults.value = [];
  proxy.resetForm("materialRef");
}

/** 搜索按钮操作 */
function handleQuery() {
  queryParams.value.pageNum = 1;
  getList();
}

/** 重置按钮操作 */
function resetQuery() {
  proxy.resetForm("queryRef");
  handleQuery();
}

// 多选框选中数据
function handleSelectionChange(selection) {
  ids.value = selection.map((item) => item.materialId);
  single.value = selection.length !== 1;
  multiple.value = !selection.length;
}

/** 新增按钮操作 */
function handleAdd() {
  reset();
  open.value = true;
  title.value = "添加物料";
}

/** 修改按钮操作 */
function handleUpdate(row) {
  reset();
  const _materialId = row.materialId || ids.value;
  title.value = "修改物料";
  open.value = true;
  dialogLoading.value = true;
  getMaterial(_materialId)
    .then((response) => {
      form.value = response.data;
    })
    .finally(() => {
      dialogLoading.value = false;
    });
}

/** 提交按钮 */
function submitForm() {
  proxy.$refs["materialRef"].validate((valid) => {
    if (valid) {
      if (form.value.materialId != null) {
        updateMaterial(form.value).then((response) => {
          proxy.$modal.msgSuccess("修改成功");
          open.value = false;
          getList();
        });
      } else {
        addMaterial(form.value).then((response) => {
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
  // 重置作废表单
  cancelForm.value = {
    voidDescription: "",
    materialId: null,
  };
  // 打开作废对话框
  cancelOpen.value = true;
  // 保存当前要作废的物料ID
  const _materialId = row.materialId || ids.value;
  cancelForm.value.materialId = _materialId;
}

/** 确认作废操作 */
function confirmCancel() {
  proxy.$refs["cancelRef"].validate((valid) => {
    if (valid) {
      const updateData = {
        materialId: cancelForm.value.materialId,
        voidDescription: cancelForm.value.voidDescription,
      };
      delMaterial(updateData)
        .then(() => {
          getList();
          cancelOpen.value = false;
          proxy.$modal.msgSuccess("作废成功");
        })
        .catch(() => {
          cancelOpen.value = false;
        });
    }
  });
}
// 添加对cancelForm的引用
const { cancelForm } = toRefs(data);

// 右侧查询列表相关数据
const searchResults = ref([]);
const searchLoading = ref(false);
const searchTotal = ref(0);
const searchPageNum = ref(1);
const searchPageSize = ref(10);

// 搜索物料的方法
async function searchMaterials() {
  const queryParams = {
    pageNum: searchPageNum.value,
    pageSize: searchPageSize.value,
    materialName: form.value.materialName,
    specification: form.value.specification,
    category: form.value.category,
  };
  listMaterial(queryParams).then((response) => {
    searchResults.value = response.rows;
    searchTotal.value = response.total;
    searchLoading.value = false;
  });
}

// 高亮显示文本
function highlightText(text, keyword) {
  if (!text || !keyword) return text;
  // 转义正则特殊字符
  const escapedKeyword = keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  // 使用正则替换，添加高亮样式
  const regex = new RegExp(`(${escapedKeyword})`, "gi");
  return text.replace(
    regex,
    '<span style="color: red; font-weight: bold;">$1</span>',
  );
}

getList();
</script>
