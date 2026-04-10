<template>
  <div class="app-container">
    <el-form :model="queryParams" ref="queryRef" :inline="true" v-show="showSearch" label-width="68px">
      <el-form-item label="姓名" prop="name">
        <el-input
          v-model="queryParams.name"
          placeholder="请输入姓名"
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
          v-hasPermi="['base:personnel:add']"
        >新增</el-button>
      </el-col>
      <right-toolbar v-model:showSearch="showSearch" @queryTable="getList" :columns="columns"></right-toolbar>
    </el-row>

    <adaptive-table border stripe v-loading="loading" :data="personnelList">
      <el-table-column type="index" width="50" align="center" />
      <el-table-column sortable show-overflow-tooltip label="姓名" align="center" prop="name" v-if="columns[0].visible" />
      <el-table-column sortable show-overflow-tooltip label="手机号" align="center" prop="contactPhone" v-if="columns[1].visible" />
      <el-table-column label="操作" align="center" class-name="small-padding fixed-width">
        <template #default="scope">
          <el-button link type="primary" icon="Edit" @click="handleUpdate(scope.row)" v-hasPermi="['base:personnel:edit']">修改</el-button>
          <el-button link type="primary" icon="Delete" @click="handleDelete(scope.row)" v-hasPermi="['base:personnel:remove']">停用</el-button>
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

    <!-- 添加或修改人员信息对话框 -->
    <el-dialog :title="title" v-model="open" width="500px" append-to-body draggable v-loading="dialogLoading">
      <el-form ref="personnelRef" :model="form" :rules="rules" label-width="80px">
        <el-form-item label="姓名" prop="name">
          <el-input v-model="form.name" placeholder="请输入姓名" />
        </el-form-item>
        <el-form-item label="手机号" prop="contactPhone">
          <el-input v-model="form.contactPhone" placeholder="请输入手机号" maxlength="32" />
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

<script setup name="Personnel">
import {
  addPersonnel,
  delPersonnel,
  getPersonnel,
  listPersonnel,
  updatePersonnel,
} from "@/api/base/personnel";

const { proxy } = getCurrentInstance();

const personnelList = ref([]);
const open = ref(false);
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
  queryParams: {
    pageNum: 1,
    pageSize: 30,
    name: null,
  },
  rules: {
    name: [{ required: true, message: "姓名不能为空", trigger: "blur" }],
  },
});

const { queryParams, form, rules } = toRefs(data);

const columns = ref([
  { key: 0, label: `姓名`, visible: true },
  { key: 1, label: `手机号`, visible: true },
]);

/** 查询人员信息列表 */
function getList() {
  loading.value = true;
  listPersonnel(queryParams.value).then((response) => {
    personnelList.value = response.rows;
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
    personnelId: null,
    name: null,
    contactPhone: "",
  };
  proxy.resetForm("personnelRef");
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
  ids.value = selection.map((item) => item.personnelId);
  single.value = selection.length !== 1;
  multiple.value = !selection.length;
}

/** 新增按钮操作 */
function handleAdd() {
  reset();
  open.value = true;
  title.value = "添加人员信息";
}

/** 修改按钮操作 */
function handleUpdate(row) {
  reset();
  const _personnelId = row.personnelId || ids.value;
  title.value = "修改人员信息";
  open.value = true;
  dialogLoading.value = true;
  getPersonnel(_personnelId)
    .then((response) => {
      form.value = response.data;
    })
    .finally(() => {
      dialogLoading.value = false;
    });
}

/** 提交按钮 */
function submitForm() {
  proxy.$refs["personnelRef"].validate((valid) => {
    if (valid) {
      if (form.value.personnelId != null) {
        updatePersonnel(form.value).then((response) => {
          proxy.$modal.msgSuccess("修改成功");
          open.value = false;
          getList();
        });
      } else {
        addPersonnel(form.value).then((response) => {
          proxy.$modal.msgSuccess("新增成功");
          open.value = false;
          getList();
        });
      }
    }
  });
}

/** 停用按钮操作 */
async function handleDelete(row) {
  const personnelId = row.personnelId || ids.value;

  try {
    await proxy.$modal.confirm(`确认停用人员「${row.name}」吗？`);
    await delPersonnel(personnelId);
    proxy.$modal.msgSuccess("停用成功");
    getList();
  } catch {
    // 用户取消确认时保持页面静默。
  }
}

getList();
</script>
