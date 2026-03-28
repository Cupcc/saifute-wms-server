<template>
  <div class="app-container">
    <el-form :model="queryParams" ref="queryRef" :inline="true" v-show="showSearch" label-width="84px">
      <el-form-item label="供应商编码" prop="supplierCode">
        <el-input
          v-model="queryParams.supplierCode"
          placeholder="请输入供应商编码"
          clearable
          style="width: 240px"
          @keyup.enter="handleQuery"
        />
      </el-form-item>
      <el-form-item label="供应商名称" prop="supplierName">
        <el-input
          v-model="queryParams.supplierName"
          placeholder="请输入供应商名称"
          clearable
          style="width: 240px"
          @keyup.enter="handleQuery"
        />
      </el-form-item>
      <el-form-item label="简称" prop="supplierShortName">
        <el-input
          v-model="queryParams.supplierShortName"
          placeholder="请输入简称"
          clearable
          style="width: 240px"
          @keyup.enter="handleQuery"
        />
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
          v-hasPermi="['base:supplier:add']"
        >新增</el-button>
      </el-col>
      <right-toolbar v-model:showSearch="showSearch" @queryTable="getList" :columns="columns"></right-toolbar>
    </el-row>

    <adaptive-table border stripe v-loading="loading" :data="supplierList">
      <el-table-column type="index" width="50" align="center" />
      <el-table-column sortable show-overflow-tooltip label="供应商编码" align="center" prop="supplierCode" v-if="columns[0].visible" />
      <el-table-column sortable show-overflow-tooltip label="供应商名称" align="center" prop="supplierName" v-if="columns[1].visible" />
      <el-table-column sortable show-overflow-tooltip label="简称" align="center" prop="supplierShortName" v-if="columns[2].visible" />
      <el-table-column sortable show-overflow-tooltip label="联系人" align="center" prop="contactPerson" v-if="columns[3].visible" />
      <el-table-column sortable show-overflow-tooltip label="联系方式" align="center" prop="contactPhone" v-if="columns[4].visible" />
      <el-table-column sortable show-overflow-tooltip label="供应商地址" align="center" prop="address" v-if="columns[5].visible" />
      <el-table-column label="操作" align="center" class-name="small-padding fixed-width">
        <template #default="scope">
          <el-button link type="primary" icon="Edit" @click="handleUpdate(scope.row)" v-hasPermi="['base:supplier:edit']">修改</el-button>
          <el-button link type="primary" icon="Delete" @click="handleDelete(scope.row)" v-hasPermi="['base:supplier:remove']">作废</el-button>
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

    <!-- 添加或修改供应商对话框 -->
    <el-dialog :title="title" v-model="open" width="500px" append-to-body draggable v-loading="dialogLoading">
      <el-form ref="supplierRef" :model="form" :rules="rules" label-width="92px">
        <el-form-item label="供应商编码" prop="supplierCode">
          <el-input v-model="form.supplierCode" placeholder="请输入供应商编码" />
        </el-form-item>
        <el-form-item label="供应商名称" prop="supplierName">
          <el-input v-model="form.supplierName" placeholder="请输入供应商名称" />
        </el-form-item>
        <el-form-item label="简称" prop="supplierShortName">
          <el-input v-model="form.supplierShortName" placeholder="请输入简称" />
        </el-form-item>
        <el-form-item label="联系人" prop="contactPerson">
          <el-input v-model="form.contactPerson" placeholder="请输入联系人" />
        </el-form-item>
        <el-form-item label="联系方式" prop="contactPhone">
          <el-input v-model="form.contactPhone" placeholder="请输入联系方式" />
        </el-form-item>
        <el-form-item label="供应商地址" prop="address">
          <el-input v-model="form.address" placeholder="请输入供应商地址" />
        </el-form-item>
      </el-form>
      <template #footer>
        <div class="dialog-footer">
          <el-button type="primary" @click="submitForm">确 定</el-button>
          <el-button @click="cancel">取 消</el-button>
        </div>
      </template>
    </el-dialog>
	
	<!-- 作废供应商对话框 -->
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

<script setup name="Supplier">
import {
  abandonSupplier,
  addSupplier,
  delSupplier,
  getSupplier,
  listSupplier,
  updateSupplier,
} from "@/api/base/supplier";

const { proxy } = getCurrentInstance();

const supplierList = ref([]);
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
    supplierCode: null,
    supplierName: null,
    supplierShortName: null,
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

// 添加作废表单规则
const cancelRules = ref({
  voidDescription: [
    { required: true, message: "作废理由不能为空", trigger: "blur" },
  ],
});

const { queryParams, form, rules } = toRefs(data);

// 添加columns数组定义
const columns = ref([
  { key: 0, label: `供应商编码`, visible: true },
  { key: 1, label: `供应商名称`, visible: true },
  { key: 2, label: `简称`, visible: true },
  { key: 3, label: `联系人`, visible: true },
  { key: 4, label: `联系方式`, visible: true },
  { key: 5, label: `供应商地址`, visible: true },
]);

/** 查询供应商列表 */
function getList() {
  loading.value = true;
  listSupplier(queryParams.value).then((response) => {
    supplierList.value = response.rows;
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
    supplierId: null,
    supplierCode: null,
    supplierName: null,
    supplierShortName: null,
    contactPerson: null,
    contactPhone: null,
    address: null,
    delFlag: null,
    voidDescription: null,
    createBy: null,
    createTime: null,
    updateBy: null,
    updateTime: null,
  };
  proxy.resetForm("supplierRef");
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
  ids.value = selection.map((item) => item.supplierId);
  single.value = selection.length !== 1;
  multiple.value = !selection.length;
}

/** 新增按钮操作 */
function handleAdd() {
  reset();
  open.value = true;
  title.value = "添加供应商";
}

/** 修改按钮操作 */
function handleUpdate(row) {
  reset();
  const _supplierId = row.supplierId || ids.value;
  title.value = "修改供应商";
  open.value = true;
  dialogLoading.value = true;
  getSupplier(_supplierId)
    .then((response) => {
      form.value = response.data;
    })
    .finally(() => {
      dialogLoading.value = false;
    });
}

/** 提交按钮 */
function submitForm() {
  proxy.$refs["supplierRef"].validate((valid) => {
    if (valid) {
      if (form.value.supplierId != null) {
        updateSupplier(form.value).then((response) => {
          proxy.$modal.msgSuccess("修改成功");
          open.value = false;
          getList();
        });
      } else {
        addSupplier(form.value).then((response) => {
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
    supplierId: null,
  };
  // 打开作废对话框
  cancelOpen.value = true;
  // 保存当前要作废的供应商ID
  const _supplierId = row.supplierId || ids.value;
  cancelForm.value.supplierId = _supplierId;
}

/** 确认作废操作 */
function confirmCancel() {
  proxy.$refs["cancelRef"].validate((valid) => {
    if (valid) {
      // 构造作废数据
      const updateData = {
        supplierId: cancelForm.value.supplierId,
        voidDescription: cancelForm.value.voidDescription,
      };
      // 调用作废接口
      abandonSupplier(updateData)
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
getList();
</script>
