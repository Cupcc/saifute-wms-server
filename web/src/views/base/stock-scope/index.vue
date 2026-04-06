<template>
  <div class="app-container">
    <el-form
      ref="queryRef"
      :model="queryParams"
      :inline="true"
      v-show="showSearch"
      label-width="84px"
    >
      <el-form-item label="范围编码" prop="scopeCode">
        <el-input
          v-model="queryParams.scopeCode"
          placeholder="请输入范围编码"
          clearable
          style="width: 240px"
          @keyup.enter="handleQuery"
        />
      </el-form-item>
      <el-form-item label="范围名称" prop="scopeName">
        <el-input
          v-model="queryParams.scopeName"
          placeholder="请输入范围名称"
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
      <el-col :span="1.5">
        <el-button
          type="primary"
          plain
          icon="Plus"
          @click="handleAdd"
          v-hasPermi="['base:stockScope:add']"
        >
          新增
        </el-button>
      </el-col>
      <right-toolbar
        v-model:showSearch="showSearch"
        :columns="columns"
        @queryTable="getList"
      />
    </el-row>

    <adaptive-table border stripe v-loading="loading" :data="stockScopeList">
      <el-table-column type="index" width="50" align="center" />
      <el-table-column
        v-if="columns[0].visible"
        sortable
        show-overflow-tooltip
        label="范围编码"
        align="center"
        prop="scopeCode"
      />
      <el-table-column
        v-if="columns[1].visible"
        sortable
        show-overflow-tooltip
        label="范围名称"
        align="center"
        prop="scopeName"
      />
      <el-table-column label="操作" align="center" class-name="small-padding fixed-width">
        <template #default="scope">
          <el-button
            link
            type="primary"
            icon="Edit"
            @click="handleUpdate(scope.row)"
            v-hasPermi="['base:stockScope:edit']"
          >
            修改
          </el-button>
          <el-button
            link
            type="primary"
            icon="Delete"
            @click="handleDelete(scope.row)"
            v-hasPermi="['base:stockScope:remove']"
          >
            停用
          </el-button>
        </template>
      </el-table-column>
    </adaptive-table>

    <pagination
      v-show="total > 0"
      v-model:page="queryParams.pageNum"
      v-model:limit="queryParams.pageSize"
      :total="total"
      @pagination="getList"
    />

    <el-dialog
      v-model="open"
      :title="title"
      width="420px"
      append-to-body
      draggable
      v-loading="dialogLoading"
    >
      <el-form
        ref="stockScopeRef"
        :model="form"
        :rules="rules"
        label-width="92px"
      >
        <el-form-item label="范围编码" prop="scopeCode">
          <el-input
            v-model="form.scopeCode"
            :disabled="Boolean(form.stockScopeId)"
            placeholder="请输入范围编码"
          />
        </el-form-item>
        <el-form-item label="范围名称" prop="scopeName">
          <el-input v-model="form.scopeName" placeholder="请输入范围名称" />
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

<script setup name="StockScope">
import {
  addStockScope,
  delStockScope,
  getStockScope,
  listStockScope,
  updateStockScope,
} from "@/api/base/stock-scope";

const { proxy } = getCurrentInstance();

const stockScopeRef = ref();
const stockScopeList = ref([]);
const open = ref(false);
const loading = ref(true);
const dialogLoading = ref(false);
const showSearch = ref(true);
const total = ref(0);
const title = ref("");

const data = reactive({
  form: {},
  queryParams: {
    pageNum: 1,
    pageSize: 30,
    scopeCode: null,
    scopeName: null,
  },
  rules: {
    scopeCode: [
      { required: true, message: "范围编码不能为空", trigger: "blur" },
    ],
    scopeName: [
      { required: true, message: "范围名称不能为空", trigger: "blur" },
    ],
  },
});

const { queryParams, form, rules } = toRefs(data);

const columns = ref([
  { key: 0, label: "范围编码", visible: true },
  { key: 1, label: "范围名称", visible: true },
]);

function getList() {
  loading.value = true;
  listStockScope(queryParams.value)
    .then((response) => {
      stockScopeList.value = response.rows;
      total.value = response.total;
    })
    .finally(() => {
      loading.value = false;
    });
}

function cancel() {
  open.value = false;
  reset();
}

function reset() {
  form.value = {
    stockScopeId: null,
    scopeCode: null,
    scopeName: null,
  };
  proxy.resetForm("stockScopeRef");
}

function handleQuery() {
  queryParams.value.pageNum = 1;
  getList();
}

function resetQuery() {
  proxy.resetForm("queryRef");
  handleQuery();
}

function handleAdd() {
  reset();
  title.value = "添加库存范围";
  open.value = true;
}

function handleUpdate(row) {
  reset();
  title.value = "修改库存范围";
  open.value = true;
  dialogLoading.value = true;
  getStockScope(row.stockScopeId)
    .then((response) => {
      form.value = response.data;
    })
    .finally(() => {
      dialogLoading.value = false;
    });
}

async function submitForm() {
  const valid = await stockScopeRef.value?.validate().catch(() => false);
  if (!valid) {
    return;
  }

  const request = form.value.stockScopeId
    ? updateStockScope(form.value)
    : addStockScope(form.value);

  await request;
  proxy.$modal.msgSuccess(form.value.stockScopeId ? "修改成功" : "新增成功");
  open.value = false;
  getList();
}

async function handleDelete(row) {
  try {
    await proxy.$modal.confirm(`确认停用库存范围「${row.scopeName}」吗？`);
    await delStockScope(row.stockScopeId);
    proxy.$modal.msgSuccess("停用成功");
    getList();
  } catch {
    // 用户取消确认或接口返回错误时保持页面静默。
  }
}

getList();
</script>
