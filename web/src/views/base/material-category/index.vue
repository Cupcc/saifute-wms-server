<template>
  <div class="app-container">
    <el-form
      ref="queryRef"
      :model="queryParams"
      :inline="true"
      v-show="showSearch"
      label-width="84px"
    >
      <el-form-item label="分类编码" prop="categoryCode">
        <el-input
          v-model="queryParams.categoryCode"
          placeholder="请输入分类编码"
          clearable
          style="width: 240px"
          @keyup.enter="handleQuery"
        />
      </el-form-item>
      <el-form-item label="分类名称" prop="categoryName">
        <el-input
          v-model="queryParams.categoryName"
          placeholder="请输入分类名称"
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
          v-hasPermi="['base:materialCategory:add']"
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

    <adaptive-table border stripe v-loading="loading" :data="categoryList">
      <el-table-column type="index" width="50" align="center" />
      <el-table-column
        v-if="columns[0].visible"
        sortable
        show-overflow-tooltip
        label="分类编码"
        align="center"
        prop="categoryCode"
      />
      <el-table-column
        v-if="columns[1].visible"
        sortable
        show-overflow-tooltip
        label="分类名称"
        align="center"
        prop="categoryName"
      />
      <el-table-column
        v-if="columns[2].visible"
        sortable
        show-overflow-tooltip
        label="排序"
        align="center"
        prop="sortOrder"
      />
      <el-table-column label="操作" align="center" class-name="small-padding fixed-width">
        <template #default="scope">
          <el-button
            v-if="scope.row.categoryCode !== 'UNCATEGORIZED'"
            link
            type="primary"
            icon="Edit"
            @click="handleUpdate(scope.row)"
            v-hasPermi="['base:materialCategory:edit']"
          >
            修改
          </el-button>
          <el-button
            v-if="scope.row.categoryCode !== 'UNCATEGORIZED'"
            link
            type="primary"
            icon="Delete"
            @click="handleDeactivate(scope.row)"
            v-hasPermi="['base:materialCategory:remove']"
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
      width="500px"
      append-to-body
      draggable
      v-loading="dialogLoading"
    >
      <el-form
        ref="categoryRef"
        :model="form"
        :rules="rules"
        label-width="88px"
      >
        <el-form-item label="分类编码" prop="categoryCode">
          <el-input
            v-model="form.categoryCode"
            :disabled="Boolean(form.categoryId)"
            placeholder="请输入分类编码"
          />
        </el-form-item>
        <el-form-item label="分类名称" prop="categoryName">
          <el-input v-model="form.categoryName" placeholder="请输入分类名称" />
        </el-form-item>
        <el-form-item label="排序" prop="sortOrder">
          <el-input-number v-model="form.sortOrder" :min="0" :max="9999" />
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

<script setup name="MaterialCategory">
import {
  addMaterialCategory,
  deactivateMaterialCategory,
  getMaterialCategory,
  listMaterialCategory,
  updateMaterialCategory,
} from "@/api/base/material-category";

const { proxy } = getCurrentInstance();

const categoryList = ref([]);
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
    categoryCode: null,
    categoryName: null,
  },
  rules: {
    categoryCode: [
      { required: true, message: "分类编码不能为空", trigger: "blur" },
    ],
    categoryName: [
      { required: true, message: "分类名称不能为空", trigger: "blur" },
    ],
  },
});

const { queryParams, form, rules } = toRefs(data);

const columns = ref([
  { key: 0, label: "分类编码", visible: true },
  { key: 1, label: "分类名称", visible: true },
  { key: 2, label: "排序", visible: true },
]);

function buildKeyword(query) {
  return query.categoryCode || query.categoryName || undefined;
}

function normalizeRows(rows) {
  categoryList.value = rows;
}

function reset() {
  form.value = {
    categoryId: null,
    categoryCode: null,
    categoryName: null,
    sortOrder: 0,
  };
  proxy.resetForm("categoryRef");
}

function cancel() {
  open.value = false;
  reset();
}

function handleQuery() {
  queryParams.value.pageNum = 1;
  getList();
}

function resetQuery() {
  proxy.resetForm("queryRef");
  handleQuery();
}

async function handleAdd() {
  reset();
  title.value = "添加物料分类";
  open.value = true;
}

async function handleUpdate(row) {
  reset();
  title.value = "修改物料分类";
  dialogLoading.value = true;
  open.value = true;
  try {
    const response = await getMaterialCategory(row.categoryId);
    form.value = {
      categoryId: response.data.categoryId,
      categoryCode: response.data.categoryCode,
      categoryName: response.data.categoryName,
      sortOrder: response.data.sortOrder ?? 0,
    };
  } finally {
    dialogLoading.value = false;
  }
}

function submitForm() {
  proxy.$refs.categoryRef.validate((valid) => {
    if (!valid) {
      return;
    }

    const request = form.value.categoryId
      ? updateMaterialCategory(form.value)
      : addMaterialCategory(form.value);

    request.then(() => {
      proxy.$modal.msgSuccess(form.value.categoryId ? "修改成功" : "新增成功");
      open.value = false;
      getList();
    });
  });
}

async function handleDeactivate(row) {
  try {
    await proxy.$modal.confirm(`确认停用分类「${row.categoryName}」吗？`);
    await deactivateMaterialCategory(row.categoryId);
    proxy.$modal.msgSuccess("停用成功");
    getList();
  } catch {
    // 用户取消确认时保持页面静默。
  }
}

function getList() {
  loading.value = true;
  listMaterialCategory({
    pageNum: queryParams.value.pageNum,
    pageSize: queryParams.value.pageSize,
    keyword: buildKeyword(queryParams.value),
  })
    .then((response) => {
      normalizeRows(response.rows);
      total.value = response.total;
    })
    .finally(() => {
      loading.value = false;
    });
}

getList();
</script>
