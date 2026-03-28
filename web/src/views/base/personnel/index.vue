<template>
  <div class="app-container">
    <el-form :model="queryParams" ref="queryRef" :inline="true" v-show="showSearch" label-width="68px">
      <el-form-item label="类型" prop="type">
        <el-select
          v-model="queryParams.type"
          placeholder="请选择类型"
          clearable
          style="width: 240px">
          <el-option
            v-for="dict in related_order_type"
            :key="dict.value"
            :label="dict.label"
            :value="dict.value"
          />
        </el-select>
      </el-form-item>
      <el-form-item label="编码" prop="code">
        <el-input
          v-model="queryParams.code"
          placeholder="请输入编码"
          clearable
          style="width: 240px"
          @keyup.enter="handleQuery"
        />
      </el-form-item>
      <el-form-item label="姓名" prop="name">
        <el-input
          v-model="queryParams.name"
          placeholder="请输入姓名"
          clearable
          style="width: 240px"
          @keyup.enter="handleQuery"
        />
      </el-form-item>
      <el-form-item label="联系电话" prop="contactPhone">
        <el-input
          v-model="queryParams.contactPhone"
          placeholder="请输入联系电话"
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
      <el-table-column sortable show-overflow-tooltip label="类型" align="center" prop="type" v-if="columns[0].visible">
        <template #default="scope">
          <dict-tag :options="related_order_type" :value="scope.row.type"/>
        </template>
      </el-table-column>
      <el-table-column sortable show-overflow-tooltip label="编码" align="center" prop="code" v-if="columns[1].visible" />
      <el-table-column sortable show-overflow-tooltip label="姓名" align="center" prop="name" v-if="columns[2].visible" />
      <el-table-column sortable show-overflow-tooltip label="联系电话" align="center" prop="contactPhone" v-if="columns[3].visible" />
      <el-table-column label="操作" align="center" class-name="small-padding fixed-width">
        <template #default="scope">
          <el-button link type="primary" icon="Edit" @click="handleUpdate(scope.row)" v-hasPermi="['base:personnel:edit']">修改</el-button>
          <el-button link type="primary" icon="Delete" @click="handleDelete(scope.row)" v-hasPermi="['base:personnel:remove']">作废</el-button>
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
        <el-form-item label="类型" prop="type">
          <el-select v-model="form.type" placeholder="请选择类型">
            <el-option
              v-for="dict in related_order_type"
              :key="dict.value"
              :label="dict.label"
              :value="parseInt(dict.value)"
            ></el-option>
          </el-select>
        </el-form-item>
        <el-form-item label="编码" prop="code">
          <el-input v-model="form.code" placeholder="请输入编码" />
        </el-form-item>
        <el-form-item label="姓名" prop="name">
          <el-input v-model="form.name" placeholder="请输入姓名" />
        </el-form-item>
        <el-form-item label="联系电话" prop="contactPhone">
          <el-input v-model="form.contactPhone" placeholder="请输入联系电话" />
        </el-form-item>
        <!-- 删除标志和作废说明字段只在作废时显示 -->
      </el-form>
      <template #footer>
        <div class="dialog-footer">
          <el-button type="primary" @click="submitForm">确 定</el-button>
          <el-button @click="cancel">取 消</el-button>
        </div>
      </template>
    </el-dialog>
	
	<!-- 作废人员信息对话框 -->
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

<script setup name="Personnel">
import {
  addPersonnel,
  delPersonnel,
  getPersonnel,
  listPersonnel,
  updatePersonnel,
} from "@/api/base/personnel";

const { proxy } = getCurrentInstance();
const { related_order_type } = proxy.useDict("related_order_type");

const personnelList = ref([]);
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
    type: null,
    code: null,
    name: null,
    contactPhone: null,
  },
  rules: {
    type: [{ required: true, message: "类型不能为空", trigger: "change" }],
    name: [{ required: true, message: "姓名不能为空", trigger: "blur" }],
  },
});

// 添加作废表单规则
const cancelRules = ref({
  voidDescription: [
    { required: true, message: "作废理由不能为空", trigger: "blur" },
  ],
});

const { queryParams, form, rules } = toRefs(data);
const { cancelForm } = toRefs(data); // 添加对cancelForm的引用

// 添加columns数组定义（已删除 personnelId 列）
const columns = ref([
  { key: 0, label: related_order_type.label, visible: true },
  { key: 1, label: `编码`, visible: true },
  { key: 2, label: `姓名`, visible: true },
  { key: 3, label: `联系电话`, visible: true },
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
    type: null,
    code: null,
    name: null,
    contactPhone: null,
    delFlag: null,
    voidDescription: null,
    createBy: null,
    createTime: null,
    updateBy: null,
    updateTime: null,
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

/** 作废按钮操作 */
function handleDelete(row) {
  // 重置作废表单
  cancelForm.value = {
    voidDescription: "",
    personnelId: null,
  };
  // 打开作废对话框
  cancelOpen.value = true;
  // 保存当前要作废的人员ID
  const _personnelId = row.personnelId || ids.value;
  cancelForm.value.personnelId = _personnelId;
}

/** 确认作废操作 */
function confirmCancel() {
  proxy.$refs["cancelRef"].validate((valid) => {
    if (valid) {
      // 构造作废数据
      const updateData = {
        personnelId: cancelForm.value.personnelId,
        voidDescription: cancelForm.value.voidDescription,
        delFlag: 2,
      };
      // 调用作废接口
      updatePersonnel(updateData)
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

getList();
</script>
