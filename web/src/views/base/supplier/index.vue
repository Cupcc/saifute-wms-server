<template>
  <div class="app-container">
    <el-form
      ref="queryRef"
      :model="queryParams"
      :inline="true"
      v-show="showSearch"
      label-width="84px"
    >
      <el-form-item label="供应商编码" prop="supplierCode">
        <combo-input v-model="queryParams.supplierCode" scope="supplier" field="supplierCode" placeholder="请选择或输入供应商编码" width="240px" />
      </el-form-item>
      <el-form-item label="供应商名称" prop="supplierName">
        <combo-input v-model="queryParams.supplierName" scope="supplier" field="supplierName" placeholder="请选择或输入供应商名称" width="240px" />
      </el-form-item>
      <el-form-item label="联系人" prop="contactPerson">
        <el-input
          v-model="queryParams.contactPerson"
          placeholder="请输入联系人"
          clearable
          style="width: 240px"
          @keyup.enter="handleQuery"
        />
      </el-form-item>
      <el-form-item label="联系方式" prop="contactPhone">
        <el-input
          v-model="queryParams.contactPhone"
          placeholder="请输入联系方式"
          clearable
          style="width: 240px"
          @keyup.enter="handleQuery"
        />
      </el-form-item>
      <el-form-item label="供应商地址" prop="address">
        <el-input
          v-model="queryParams.address"
          placeholder="请输入供应商地址"
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
          v-hasPermi="['base:supplier:add']"
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

    <adaptive-table border stripe v-loading="loading" :data="supplierList">
      <el-table-column type="index" width="50" align="center" />
      <el-table-column
        v-if="columns[0].visible"
        sortable
        show-overflow-tooltip
        label="供应商编码"
        align="center"
        prop="supplierCode"
      />
      <el-table-column
        v-if="columns[1].visible"
        sortable
        show-overflow-tooltip
        label="供应商名称"
        align="center"
        prop="supplierName"
      />
      <el-table-column
        v-if="columns[2].visible"
        sortable
        show-overflow-tooltip
        label="联系人"
        align="center"
        prop="contactPerson"
      />
      <el-table-column
        v-if="columns[3].visible"
        sortable
        show-overflow-tooltip
        label="联系方式"
        align="center"
        prop="contactPhone"
      />
      <el-table-column
        v-if="columns[4].visible"
        sortable
        show-overflow-tooltip
        label="供应商地址"
        align="center"
        prop="address"
      />
      <el-table-column label="操作" align="center" class-name="small-padding fixed-width">
        <template #default="scope">
          <el-button
            link
            type="primary"
            icon="Edit"
            @click="handleUpdate(scope.row)"
            v-hasPermi="['base:supplier:edit']"
          >
            修改
          </el-button>
          <el-button
            link
            type="primary"
            icon="Delete"
            @click="handleDelete(scope.row)"
            v-hasPermi="['base:supplier:remove']"
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
      width="520px"
      append-to-body
      draggable
      v-loading="dialogLoading"
    >
      <el-form ref="supplierRef" :model="form" :rules="rules" label-width="92px">
        <el-form-item label="供应商编码" prop="supplierCode">
          <combo-input v-model="form.supplierCode" scope="supplier" field="supplierCode" placeholder="请选择或输入供应商编码" />
        </el-form-item>
        <el-form-item label="供应商名称" prop="supplierName">
          <combo-input v-model="form.supplierName" scope="supplier" field="supplierName" placeholder="请选择或输入供应商名称" />
        </el-form-item>
        <el-form-item label="联系人" prop="contactPerson">
          <el-input v-model="form.contactPerson" placeholder="请输入联系人" maxlength="128" />
        </el-form-item>
        <el-form-item label="联系方式" prop="contactPhone">
          <el-input v-model="form.contactPhone" placeholder="请输入联系方式" maxlength="32" />
        </el-form-item>
        <el-form-item label="供应商地址" prop="address">
          <el-input v-model="form.address" placeholder="请输入供应商地址" maxlength="255" />
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

<script setup name="Supplier">
import {
  abandonSupplier,
  addSupplier,
  getSupplier,
  listSupplier,
  updateSupplier,
} from "@/api/base/supplier";
import { clearSuggestionsCache } from "@/api/base/suggestions";

const { proxy } = getCurrentInstance();

const supplierList = ref([]);
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
    supplierCode: null,
    supplierName: null,
    contactPerson: null,
    contactPhone: null,
    address: null,
  },
  rules: {
    supplierCode: [
      { required: true, message: "供应商编码不能为空", trigger: "blur" },
    ],
    supplierName: [
      { required: true, message: "供应商名称不能为空", trigger: "blur" },
    ],
  },
});

const { queryParams, form, rules } = toRefs(data);

const columns = ref([
  { key: 0, label: "供应商编码", visible: true },
  { key: 1, label: "供应商名称", visible: true },
  { key: 2, label: "联系人", visible: true },
  { key: 3, label: "联系方式", visible: true },
  { key: 4, label: "供应商地址", visible: true },
]);

function getList() {
  loading.value = true;
  listSupplier(queryParams.value)
    .then((response) => {
      supplierList.value = response.rows;
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
    supplierId: null,
    supplierCode: null,
    supplierName: null,
    contactPerson: "",
    contactPhone: "",
    address: "",
  };
  proxy.resetForm("supplierRef");
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
  title.value = "添加供应商";
  open.value = true;
}

function handleUpdate(row) {
  reset();
  title.value = "修改供应商";
  open.value = true;
  dialogLoading.value = true;
  getSupplier(row.supplierId)
    .then((response) => {
      form.value = response.data;
    })
    .finally(() => {
      dialogLoading.value = false;
    });
}

function submitForm() {
  proxy.$refs.supplierRef.validate((valid) => {
    if (!valid) {
      return;
    }

    const request = form.value.supplierId
      ? updateSupplier(form.value)
      : addSupplier(form.value);

    request.then(() => {
      clearSuggestionsCache();
      proxy.$modal.msgSuccess(form.value.supplierId ? "修改成功" : "新增成功");
      open.value = false;
      getList();
    });
  });
}

async function handleDelete(row) {
  try {
    await proxy.$modal.confirm(`确认停用供应商「${row.supplierName}」吗？`);
    await abandonSupplier(row.supplierId);
    proxy.$modal.msgSuccess("停用成功");
    getList();
  } catch {
    // 用户取消确认时保持页面静默。
  }
}

getList();
</script>
