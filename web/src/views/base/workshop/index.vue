<template>
  <div class="app-container">
    <el-form
      ref="queryRef"
      :model="queryParams"
      :inline="true"
      v-show="showSearch"
      label-width="84px"
    >
      <el-form-item label="车间名称" prop="workshopName">
        <el-input
          v-model="queryParams.workshopName"
          placeholder="请输入车间名称"
          clearable
          style="width: 240px"
          @keyup.enter="handleQuery"
        />
      </el-form-item>
      <el-form-item label="默认经办人" prop="defaultHandlerPersonnelName">
        <el-input
          v-model="queryParams.defaultHandlerPersonnelName"
          placeholder="请输入默认经办人"
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
          v-hasPermi="['base:workshop:add']"
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

    <adaptive-table border stripe v-loading="loading" :data="workshopList">
      <el-table-column type="index" width="50" align="center" />
      <el-table-column
        v-if="columns[0].visible"
        sortable
        show-overflow-tooltip
        label="车间名称"
        align="center"
        prop="workshopName"
      />
      <el-table-column
        v-if="columns[1].visible"
        sortable
        show-overflow-tooltip
        label="默认经办人"
        align="center"
        prop="defaultHandlerPersonnelName"
      >
        <template #default="scope">
          {{ scope.row.defaultHandlerPersonnelName || "-" }}
        </template>
      </el-table-column>
      <el-table-column label="操作" align="center" class-name="small-padding fixed-width">
        <template #default="scope">
          <el-button
            link
            type="primary"
            icon="Edit"
            @click="handleUpdate(scope.row)"
            v-hasPermi="['base:workshop:edit']"
          >
            修改
          </el-button>
          <el-button
            link
            type="primary"
            icon="Delete"
            @click="handleDelete(scope.row)"
            v-hasPermi="['base:workshop:remove']"
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
      <el-form ref="workshopRef" :model="form" :rules="rules" label-width="92px">
        <el-form-item label="车间名称" prop="workshopName">
          <el-input v-model="form.workshopName" placeholder="请输入车间名称" />
        </el-form-item>
        <el-form-item label="默认经办人" prop="defaultHandlerPersonnelId">
          <el-select
            v-model="form.defaultHandlerPersonnelId"
            filterable
            remote
            clearable
            reserve-keyword
            placeholder="请输入经办人名称搜索"
            :remote-method="searchPersonnel"
            :loading="personnelLoading"
            style="width: 100%"
          >
            <el-option
              v-for="item in personnelOptions"
              :key="item.personnelId"
              :label="item.name"
              :value="item.personnelId"
            />
          </el-select>
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

<script setup name="Workshop">
import {
  addWorkshop,
  delWorkshop,
  getWorkshop,
  listWorkshop,
  updateWorkshop,
} from "@/api/base/workshop";
import { listPersonnel } from "@/api/base/personnel";

const { proxy } = getCurrentInstance();

const workshopRef = ref();
const workshopList = ref([]);
const open = ref(false);
const loading = ref(true);
const dialogLoading = ref(false);
const showSearch = ref(true);
const total = ref(0);
const title = ref("");
const personnelLoading = ref(false);
const personnelOptions = ref([]);

const data = reactive({
  form: {},
  queryParams: {
    pageNum: 1,
    pageSize: 30,
    workshopName: null,
    defaultHandlerPersonnelName: null,
  },
  rules: {
    workshopName: [
      { required: true, message: "车间名称不能为空", trigger: "blur" },
    ],
  },
});

const { queryParams, form, rules } = toRefs(data);

const columns = ref([
  { key: 0, label: "车间名称", visible: true },
  { key: 1, label: "默认经办人", visible: true },
]);

function getList() {
  loading.value = true;
  listWorkshop(queryParams.value)
    .then((response) => {
      workshopList.value = response.rows;
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
    workshopId: null,
    workshopName: null,
    defaultHandlerPersonnelId: null,
    defaultHandlerPersonnelName: "",
  };
  personnelOptions.value = [];
  proxy.resetForm("workshopRef");
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
  title.value = "添加车间";
  open.value = true;
}

function handleUpdate(row) {
  reset();
  title.value = "修改车间";
  open.value = true;
  dialogLoading.value = true;
  getWorkshop(row.workshopId)
    .then((response) => {
      form.value = response.data;
      ensurePersonnelOption(response.data);
    })
    .finally(() => {
      dialogLoading.value = false;
    });
}

function ensurePersonnelOption(item) {
  if (!item?.defaultHandlerPersonnelId || !item?.defaultHandlerPersonnelName) {
    return;
  }

  const exists = personnelOptions.value.some(
    (option) => option.personnelId === item.defaultHandlerPersonnelId,
  );
  if (exists) {
    return;
  }

  personnelOptions.value = [
    ...personnelOptions.value,
    {
      personnelId: item.defaultHandlerPersonnelId,
      name: item.defaultHandlerPersonnelName,
    },
  ];
}

function searchPersonnel(keyword) {
  personnelLoading.value = true;
  listPersonnel({
    name: keyword,
    pageNum: 1,
    pageSize: 100,
  })
    .then((response) => {
      personnelOptions.value = response.rows || [];
    })
    .finally(() => {
      personnelLoading.value = false;
    });
}

async function submitForm() {
  const valid = await workshopRef.value?.validate().catch(() => false);
  if (!valid) {
    return;
  }

  const request = form.value.workshopId
    ? updateWorkshop(form.value)
    : addWorkshop(form.value);

  await request;
  proxy.$modal.msgSuccess(form.value.workshopId ? "修改成功" : "新增成功");
  open.value = false;
  getList();
}

async function handleDelete(row) {
  try {
    await proxy.$modal.confirm(`确认停用车间「${row.workshopName}」吗？`);
    await delWorkshop(row.workshopId);
    proxy.$modal.msgSuccess("停用成功");
    getList();
  } catch {
    // 用户取消确认时保持页面静默。
  }
}

getList();
</script>
