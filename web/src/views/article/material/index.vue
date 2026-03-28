<template>
  <div class="app-container">
    <el-form :model="queryParams" ref="queryRef" :inline="true" v-show="showSearch" label-width="68px">
      <el-form-item label="关联项目id" prop="productId">
        <el-input
          v-model="queryParams.productId"
          placeholder="请输入关联项目id"
          clearable
          style="width: 240px"
          @keyup.enter="handleQuery"
        />
      </el-form-item>
      <el-form-item label="关联物料id" prop="materialId">
        <el-input
          v-model="queryParams.materialId"
          placeholder="请输入关联物料id"
          clearable
          style="width: 240px"
          @keyup.enter="handleQuery"
        />
      </el-form-item>
      <el-form-item label="数量" prop="quantity">
        <el-input
          v-model="queryParams.quantity"
          placeholder="请输入数量"
          clearable
          style="width: 240px"
          @keyup.enter="handleQuery"
        />
      </el-form-item>
      <el-form-item label="出厂编号" prop="interval">
        <el-input
          v-model="queryParams.interval"
          placeholder="请输入出厂编号"
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
          v-hasPermi="['article:material:add']"
        >新增</el-button>
      </el-col>
      <el-col :span="1.5">
        <el-button
          type="success"
          plain
          icon="Edit"
          :disabled="single"
          @click="handleUpdate"
          v-hasPermi="['article:material:edit']"
        >修改</el-button>
      </el-col>
      <el-col :span="1.5">
        <el-button
          type="danger"
          plain
          icon="Delete"
          :disabled="multiple"
          @click="handleDelete"
          v-hasPermi="['article:material:remove']"
        >作废</el-button>
      </el-col>
      <right-toolbar v-model:showSearch="showSearch" @queryTable="getList" :columns="columns"></right-toolbar>
    </el-row>

    <adaptive-table border stripe v-loading="loading" :data="materialList">
      <el-table-column type="index" width="50" align="center" />
      <el-table-column sortable show-overflow-tooltip label="关联ID" align="center" prop="id" key="id" v-if="columns[0].visible"/>
      <el-table-column sortable show-overflow-tooltip label="关联项目id" align="center" prop="productId" v-if="columns[1].visible" />
      <el-table-column sortable show-overflow-tooltip label="关联物料id" align="center" prop="materialId" v-if="columns[2].visible" />
      <el-table-column sortable show-overflow-tooltip label="数量" align="center" prop="quantity" v-if="columns[3].visible" />
      <el-table-column sortable show-overflow-tooltip label="出厂编号" align="center" prop="interval" v-if="columns[4].visible" />
      <el-table-column sortable show-overflow-tooltip label="备注" align="center" prop="remark" v-if="columns[5].visible" />
      <el-table-column label="操作" align="center" class-name="small-padding fixed-width">
        <template #default="scope">
          <el-button link type="primary" icon="Edit" @click="handleUpdate(scope.row)" v-hasPermi="['article:material:edit']">修改</el-button>
          <el-button link type="primary" icon="Delete" @click="handleDelete(scope.row)" v-hasPermi="['article:material:remove']">作废</el-button>
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

    <!-- 添加或修改复合产品物料关联对话框 -->
    <el-dialog :title="title" v-model="open" width="500px" append-to-body draggable>
      <el-form ref="materialRef" :model="form" :rules="rules" label-width="80px">
        <el-form-item label="关联项目id" prop="productId">
          <el-input v-model="form.productId" placeholder="请输入关联项目id" />
        </el-form-item>
        <el-form-item label="关联物料id" prop="materialId">
          <el-input v-model="form.materialId" placeholder="请输入关联物料id" />
        </el-form-item>
        <el-form-item label="数量" prop="quantity">
          <el-input v-model="form.quantity" placeholder="请输入数量" />
        </el-form-item>
        <el-form-item label="出厂编号" prop="interval">
          <el-input v-model="form.interval" placeholder="请输入出厂编号" />
        </el-form-item>
        <el-form-item label="备注" prop="remark">
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

<script setup name="Material">
import {
  addMaterial,
  delMaterial,
  getMaterial,
  listMaterial,
  updateMaterial,
} from "@/api/article/material";

const { proxy } = getCurrentInstance();

const materialList = ref([]);
const open = ref(false);
const loading = ref(true);
const showSearch = ref(true);
const ids = ref([]);
const single = ref(true);
const multiple = ref(true);
const total = ref(0);
const title = ref("");

const data = reactive({
  form: {},
  queryParams: {
    pageNum: 1,
    pageSize: 30,
    productId: null,
    materialId: null,
    quantity: null,
    interval: null,
  },
  rules: {},
});

const { queryParams, form, rules } = toRefs(data);

// 添加columns数组定义
const columns = ref([
  { key: 0, label: `关联ID`, visible: true },
  { key: 1, label: `关联项目id`, visible: true },
  { key: 2, label: `关联物料id`, visible: true },
  { key: 3, label: `数量`, visible: true },
  { key: 4, label: `出厂编号`, visible: true },
  { key: 5, label: `备注`, visible: true },
]);

/** 查询复合产品物料关联列表 */
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
    id: null,
    productId: null,
    materialId: null,
    quantity: null,
    interval: null,
    remark: null,
  };
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
  ids.value = selection.map((item) => item.id);
  single.value = selection.length !== 1;
  multiple.value = !selection.length;
}

/** 新增按钮操作 */
function handleAdd() {
  reset();
  open.value = true;
  title.value = "添加复合产品物料关联";
}

/** 修改按钮操作 */
function handleUpdate(row) {
  reset();
  const _id = row.id || ids.value;
  getMaterial(_id).then((response) => {
    form.value = response.data;
    open.value = true;
    title.value = "修改复合产品物料关联";
  });
}

/** 提交按钮 */
function submitForm() {
  proxy.$refs["materialRef"].validate((valid) => {
    if (valid) {
      if (form.value.id != null) {
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
  const _ids = row.id || ids.value;
  proxy.$modal
    .confirm("是否确认作废复合产品物料关联？")
    .then(() => delMaterial(_ids))
    .then(() => {
      getList();
      proxy.$modal.msgSuccess("作废成功");
    })
    .catch(() => {});
}

/** 导出按钮操作 */
function handleExport() {
  proxy.download(
    "article/material/export",
    {
      ...queryParams.value,
    },
    `material_${new Date().getTime()}.xlsx`,
  );
}

getList();
</script>
