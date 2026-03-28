<template>
  <div class="app-container">
    <el-form :model="queryParams" ref="queryRef" :inline="true" v-show="showSearch" label-width="68px">
      <el-form-item label="部门名称" prop="workshopName">
        <el-input
          v-model="queryParams.workshopName"
          placeholder="请输入部门名称"
          clearable
          style="width: 240px"
          @keyup.enter="handleQuery"
        />
      </el-form-item>
      <el-form-item label="经办人" prop="contactPerson">
        <el-input
          v-model="queryParams.contactPerson"
          placeholder="请输入经办人"
          clearable
          style="width: 240px"
          @keyup.enter="handleQuery"
        />
      </el-form-item>
      <el-form-item label="负责人" prop="chargeBy">
        <el-input
          v-model="queryParams.chargeBy"
          placeholder="请输入负责人"
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
          v-hasPermi="['base:workshop:add']"
        >新增</el-button>
      </el-col>
      <right-toolbar v-model:showSearch="showSearch" @queryTable="getList" :columns="columns"></right-toolbar>
    </el-row>

    <adaptive-table border stripe v-loading="loading" :data="workshopList">
      <el-table-column type="index" width="50" align="center" />
      <el-table-column sortable show-overflow-tooltip label="部门名称" align="center" prop="workshopName" v-if="columns[0].visible" />
      <el-table-column sortable show-overflow-tooltip label="经办人" align="center" prop="contactPerson" v-if="columns[1].visible" />
      <el-table-column sortable show-overflow-tooltip label="负责人" align="center" prop="chargeBy" v-if="columns[2].visible" />
      <el-table-column label="操作" align="center" class-name="small-padding fixed-width">
        <template #default="scope">
          <el-button link type="primary" icon="Edit" @click="handleUpdate(scope.row)" v-hasPermi="['base:workshop:edit']">修改</el-button>
          <el-button link type="primary" icon="Delete" @click="handleDelete(scope.row)" v-hasPermi="['base:workshop:remove']">作废</el-button>
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

    <!-- 添加或修改部门对话框 -->
    <el-dialog :title="title" v-model="open" width="500px" append-to-body draggable v-loading="dialogLoading">
      <el-form ref="workshopRef" :model="form" :rules="rules" label-width="80px">
        <el-form-item label="部门名称" prop="workshopName">
          <el-input v-model="form.workshopName" placeholder="请输入部门名称" />
        </el-form-item>
        <el-form-item label="经办人" prop="contactPerson">
          <el-input v-model="form.contactPerson" placeholder="请输入经办人" />
        </el-form-item>
        <el-form-item label="负责人" prop="chargeBy">
          <el-input v-model="form.chargeBy" placeholder="请输入负责人" />
        </el-form-item>
      </el-form>
      <template #footer>
        <div class="dialog-footer">
          <el-button type="primary" @click="submitForm">确 定</el-button>
          <el-button @click="cancel">取 消</el-button>
        </div>
      </template>
    </el-dialog>
	
	<!-- 作废部门对话框 -->
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

<script setup name="Workshop">
import {
  addWorkshop,
  delWorkshop,
  getWorkshop,
  listWorkshop,
  updateWorkshop,
} from "@/api/base/workshop";

const { proxy } = getCurrentInstance();

const workshopList = ref([]);
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
    workshopName: null,
    contactPerson: null,
    chargeBy: null,
  },
  rules: {
    workshopName: [
      { required: true, message: "部门名称不能为空", trigger: "blur" },
    ],
    contactPerson: [
      { required: true, message: "经办人不能为空", trigger: "blur" },
    ],
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

// 添加columns数组定义
const columns = ref([
  { key: 0, label: `部门名称`, visible: true },
  { key: 1, label: `经办人`, visible: true },
  { key: 2, label: `负责人`, visible: true },
]);

/** 查询部门列表 */
function getList() {
  loading.value = true;
  listWorkshop(queryParams.value).then((response) => {
    workshopList.value = response.rows;
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
    workshopId: null,
    workshopName: null,
    contactPerson: null,
    chargeBy: null,
    delFlag: null,
    voidDescription: null,
    createBy: null,
    createTime: null,
    updateBy: null,
    updateTime: null,
  };
  proxy.resetForm("workshopRef");
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
  ids.value = selection.map((item) => item.workshopId);
  single.value = selection.length !== 1;
  multiple.value = !selection.length;
}

/** 新增按钮操作 */
function handleAdd() {
  reset();
  open.value = true;
  title.value = "添加部门";
}

/** 修改按钮操作 */
function handleUpdate(row) {
  reset();
  const _workshopId = row.workshopId || ids.value;
  title.value = "修改部门";
  open.value = true;
  dialogLoading.value = true;
  getWorkshop(_workshopId)
    .then((response) => {
      form.value = response.data;
    })
    .finally(() => {
      dialogLoading.value = false;
    });
}

/** 提交按钮 */
function submitForm() {
  proxy.$refs["workshopRef"].validate((valid) => {
    if (valid) {
      if (form.value.workshopId != null) {
        updateWorkshop(form.value).then((response) => {
          proxy.$modal.msgSuccess("修改成功");
          open.value = false;
          getList();
        });
      } else {
        addWorkshop(form.value).then((response) => {
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
    workshopId: null,
  };
  // 打开作废对话框
  cancelOpen.value = true;
  // 保存当前要作废的部门ID
  const _workshopId = row.workshopId || ids.value;
  cancelForm.value.workshopId = _workshopId;
}

/** 确认作废操作 */
function confirmCancel() {
  proxy.$refs["cancelRef"].validate((valid) => {
    if (valid) {
      // 构造作废数据
      const updateData = {
        workshopId: cancelForm.value.workshopId,
        voidDescription: cancelForm.value.voidDescription,
      };
      // 调用作废接口
      delWorkshop(updateData)
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
