<template>
  <div class="app-container">
    <el-form :model="queryParams" ref="queryRef" :inline="true" v-show="showSearch" label-width="68px">
      <el-form-item label="客户编码" prop="customerCode">
        <combo-input v-model="queryParams.customerCode" scope="customer" field="customerCode" placeholder="请选择或输入客户编码" width="240px" />
      </el-form-item>
      <el-form-item label="客户名称" prop="customerName">
        <combo-input v-model="queryParams.customerName" scope="customer" field="customerName" placeholder="请选择或输入客户名称" width="240px" />
      </el-form-item>
      <el-form-item label="客户简称" prop="customerShortName">
        <el-input
          v-model="queryParams.customerShortName"
          placeholder="请输入客户简称"
          clearable
          style="width: 240px"
          @keyup.enter="handleQuery"
        />
      </el-form-item>
      <el-form-item label="客户类型" prop="customerType">
        <el-select
          v-model="queryParams.customerType"
          placeholder="请选择客户类型"
          clearable
          style="width: 240px">
          <el-option
            v-for="dict in saifute_customer_type"
            :key="dict.value"
            :label="dict.label"
            :value="dict.value"
          />
        </el-select>
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
      <el-form-item label="客户地址" prop="address">
        <el-input
          v-model="queryParams.address"
          placeholder="请输入客户地址"
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
          v-hasPermi="['master:customer:create']"
        >新增</el-button>
      </el-col>
      <el-col :span="1.5">
        <el-button
          type="info"
          plain
          icon="Sort"
          @click="toggleExpandAll"
        >展开/折叠</el-button>
      </el-col>
      <right-toolbar v-model:showSearch="showSearch" @queryTable="getList" :columns="columns"></right-toolbar>
    </el-row>

    <adaptive-table
      v-if="refreshTable"
      border
      stripe
      v-loading="loading"
      :data="customerList"
      row-key="customerId"
      :default-expand-all="isExpandAll"
      :tree-props="{ children: 'children', hasChildren: 'hasChildren' }"
    >
      <el-table-column type="index" width="50" align="center" />
	    <el-table-column sortable show-overflow-tooltip label="客户名称" align="center" prop="customerName" v-if="columns[1].visible">
		    <template #default="scope">
			    <el-button link type="primary" @click="handleView(scope.row)">{{ scope.row.customerName }}</el-button>
		    </template>
	    </el-table-column>
      <el-table-column sortable show-overflow-tooltip label="客户编码" align="center" prop="customerCode" v-if="columns[0].visible">
	      <template #default="scope">
		      <el-button link type="primary" @click="handleView(scope.row)">{{ scope.row.customerCode }}</el-button>
	      </template>
      </el-table-column>
      <el-table-column sortable show-overflow-tooltip label="客户简称" align="center" prop="customerShortName" v-if="columns[2].visible" />
      <el-table-column sortable show-overflow-tooltip label="客户类型" align="center" prop="customerType" v-if="columns[3].visible">
        <template #default="scope">
          <dict-tag :options="saifute_customer_type" :value="scope.row.customerType"/>
        </template>
      </el-table-column>
      <el-table-column sortable show-overflow-tooltip label="联系人" align="center" prop="contactPerson" v-if="columns[4].visible" />
      <el-table-column sortable show-overflow-tooltip label="联系方式" align="center" prop="contactPhone" v-if="columns[5].visible" />
      <el-table-column sortable show-overflow-tooltip label="客户地址" align="center" prop="address" v-if="columns[6].visible" />
      <el-table-column label="操作" align="center" class-name="small-padding fixed-width">
        <template #default="scope">
          <el-button link type="primary" icon="Edit" @click="handleUpdate(scope.row)" v-hasPermi="['master:customer:update']">修改</el-button>
          <el-button link type="primary" icon="Delete" @click="handleDelete(scope.row)" v-hasPermi="['master:customer:deactivate']" v-if="!scope.row.children || scope.row.children.length === 0">停用</el-button>
        </template>
      </el-table-column>
    </adaptive-table>

    <pagination
      v-show="total > 0"
      :total="total"
      v-model:page="queryParams.pageNum"
      v-model:limit="queryParams.pageSize"
      @pagination="getList"
    />


    <!-- 添加或修改客户对话框 -->
    <el-dialog :title="title" v-model="open" width="500px" append-to-body draggable>
      <el-form ref="customerRef" :model="form" :rules="rules" label-width="80px">
        <el-form-item label="客户编码" prop="customerCode">
          <combo-input v-model="form.customerCode" scope="customer" field="customerCode" :disabled="Boolean(form.customerId)" placeholder="请选择或输入客户编码" />
        </el-form-item>
        <el-form-item label="客户名称" prop="customerName">
          <combo-input v-model="form.customerName" scope="customer" field="customerName" placeholder="请选择或输入客户名称" />
        </el-form-item>
        <el-form-item label="客户简称" prop="customerShortName">
          <el-input v-model="form.customerShortName" placeholder="请输入客户简称" />
        </el-form-item>
        <el-form-item label="客户类型" prop="customerType">
          <el-select v-model="form.customerType" placeholder="请选择客户类型" @change="handleCustomerTypeChange">
            <el-option
              v-for="dict in saifute_customer_type"
              :key="dict.value"
              :label="dict.label"
              :value="dict.value"
            ></el-option>
          </el-select>
        </el-form-item>
        <el-form-item label="上级客户" prop="parentId">
	        <el-tree-select
		        v-model="form.parentId"
		        :data="customerOptions"
		        :props="{ value: 'customerId', label: 'customerName', children: 'children' }"
		        value-key="customerId"
		        placeholder="请选择上级客户"
		        check-strictly
	        />
        </el-form-item>
        <el-form-item label="联系人" prop="contactPerson">
          <el-input v-model="form.contactPerson" placeholder="请输入联系人" maxlength="128" />
        </el-form-item>
        <el-form-item label="联系方式" prop="contactPhone">
          <el-input v-model="form.contactPhone" placeholder="请输入联系方式" maxlength="32" />
        </el-form-item>
        <el-form-item label="客户地址" prop="address">
          <el-input v-model="form.address" placeholder="请输入客户地址" maxlength="255" />
        </el-form-item>
        <el-form-item label="备注" prop="remark">
          <el-input v-model="form.remark" type="textarea" placeholder="请输入内容" />
        </el-form-item>
      </el-form>
      <template #footer>
        <div class="dialog-footer">
          <el-button type="primary" @click="submitForm" v-if="!isView">确 定</el-button>
          <el-button @click="cancel">取 消</el-button>
        </div>
      </template>
    </el-dialog>
  </div>
</template>

<script setup name="Customer">
import {
  addCustomer,
  delCustomer,
  getCustomer,
  listCustomer,
  listTree,
  updateCustomer,
} from "@/api/base/customer";
import { clearSuggestionsCache } from "@/api/base/suggestions";

const { proxy } = getCurrentInstance();
const { saifute_customer_type } = proxy.useDict("saifute_customer_type");

const customerList = ref([]);
const customerRef = ref();
const open = ref(false);
const loading = ref(true);
const showSearch = ref(true);
const ids = ref([]);
const single = ref(true);
const multiple = ref(true);
const title = ref("");
const customerOptions = ref([]);
const refreshTable = ref(true);
const isExpandAll = ref(false);
const isView = ref(false);
const total = ref(0);

const data = reactive({
  form: {},
  queryParams: {
    pageNum: 1,
    pageSize: 30,
    customerCode: null,
    customerName: null,
    parentId: null,
    customerShortName: null,
    customerType: null,
    contactPerson: null,
    contactPhone: null,
    address: null,
  },
  rules: {
    customerCode: [
      { required: true, message: "客户编码不能为空", trigger: "blur" },
    ],
    customerName: [
      { required: true, message: "客户名称不能为空", trigger: "blur" },
    ],
  },
});

const { queryParams, form, rules } = toRefs(data);

// 添加columns数组定义
const columns = ref([
  { key: 0, label: `客户编码`, visible: true },
  { key: 1, label: `客户名称`, visible: true },
  { key: 2, label: `客户简称`, visible: true },
  { key: 3, label: `客户类型`, visible: true },
  { key: 4, label: `联系人`, visible: true },
  { key: 5, label: `联系方式`, visible: true },
  { key: 6, label: `客户地址`, visible: true },
]);

/** 查询客户列表 */
function getList() {
  loading.value = true;
  listCustomer(queryParams.value).then((response) => {
    const customers = response.rows;
    total.value = response.total || 0;
    // 构造树形结构
    customerList.value = proxy.handleTree(customers, "customerId");
    loading.value = false;
  });
}

/** 查询客户树形列表 */
function getCustomerTree() {
  loading.value = true;
  let customerTypeValue = null;
  if (form.value.customerType == null || form.value.customerType === 1) {
    customerTypeValue = 11111;
  } else if (form.value.customerType === 2) {
    customerTypeValue = 1;
  } else if (form.value.customerType === 3) {
    customerTypeValue = 2;
  }
  listCustomer({ customerType: customerTypeValue }).then((response) => {
    const customers = response.rows;
    // 直接构造树形结构，不添加"主类目"根节点
    let treeData = proxy.handleTree(customers, "customerId");

    // 如果是修改模式，需要过滤掉当前客户及其子客户
    if (form.value.customerId && !isView.value) {
      treeData = filterCustomerTree(treeData, form.value.customerId);
      treeData = filterCustomerWithParent(treeData);
    }

    /*  // 根据当前客户类型过滤上级客户选项
    if (form.value.customerType) {
      treeData = filterCustomerByType(treeData, form.value.customerType)
    }
 */
    customerOptions.value = treeData;
    loading.value = false;
  });
}

/** 过滤客户树形结构，排除当前客户及其子客户 */
function filterCustomerTree(treeData, excludeId) {
  return treeData.filter((item) => {
    // 如果当前节点是要排除的节点，直接过滤掉
    if (item.customerId === excludeId) {
      return false;
    }

    // 递归处理子节点
    if (item.children && item.children.length > 0) {
      item.children = filterCustomerTree(item.children, excludeId);
    }

    return true;
  });
}

/** 过滤已有上级客户的客户 */
function filterCustomerWithParent(treeData) {
  return treeData.filter((item) => {
    // 如果当前客户已有上级(parentId存在且不为0)，则过滤掉
    if (item.parentId) {
      return false;
    }

    // 递归处理子节点
    if (item.children && item.children.length > 0) {
      item.children = filterCustomerWithParent(item.children);
    }

    return true;
  });
}

/** 根据当前客户类型过滤上级客户选项 */
function filterCustomerByType(treeData, currentType) {
  // 根据当前客户类型确定允许的上级客户类型
  let allowedTypes = [];

  // 如果当前客户类型为2，上级客户类型必须为1
  if (currentType === 2) {
    allowedTypes = [1];
  }
  // 如果当前客户类型为3，上级客户类型必须为2
  else if (currentType === 3) {
    allowedTypes = [2];
  }
  // 如果当前客户类型为其他值，上级客户类型必须为2或3
  else {
    allowedTypes = [2, 3];
  }

  return treeData.filter((item) => {
    // 检查当前节点类型是否在允许的类型列表中
    if (!allowedTypes.includes(item.customerType)) {
      return false;
    }

    // 递归处理子节点
    if (item.children && item.children.length > 0) {
      item.children = filterCustomerByType(item.children, currentType);
    }

    return true;
  });
}

// 客户类型改变时重新获取上级客户选项
function handleCustomerTypeChange() {
  // 清空已选择的上级客户
  form.value.parentId = null;
  // 重新获取客户树形列表
  getCustomerTree();
}

// 取消按钮
function cancel() {
  open.value = false;
  reset();
}

// 表单重置
function reset() {
  form.value = {
    customerId: null,
    customerCode: null,
    customerName: null,
    customerShortName: null,
    customerType: null,
    contactPerson: null,
    contactPhone: null,
    address: null,
    remark: null,
    delFlag: null,
    voidDescription: null,
    createBy: null,
    createdAt: null,
    updateBy: null,
    updatedAt: null,
  };
  proxy.resetForm("customerRef");
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
  ids.value = selection.map((item) => item.customerId);
  single.value = selection.length !== 1;
  multiple.value = !selection.length;
}

/** 查看按钮操作 */
function handleView(row) {
  reset();
  const _customerId = row.customerId;
  getCustomer(_customerId).then((response) => {
    form.value = response.data;
    getCustomerTree();
    open.value = true;
    title.value = "查看客户";
    isView.value = true;
  });
}

/** 新增按钮操作 */
function handleAdd() {
  reset();
  getCustomerTree();
  open.value = true;
  title.value = "添加客户";
  isView.value = false;
}

/** 修改按钮操作 */
function handleUpdate(row) {
  reset();
  const _customerId = row.customerId || ids.value;
  getCustomer(_customerId).then((response) => {
    form.value = response.data;
    getCustomerTree();
    open.value = true;
    title.value = "修改客户";
    isView.value = false;
  });
}

/** 提交按钮 */
async function submitForm() {
  const valid = await customerRef.value?.validate().catch(() => false);
  if (!valid) {
    return;
  }

  const request = form.value.customerId
    ? updateCustomer(form.value)
    : addCustomer(form.value);

  await request;
  clearSuggestionsCache();
  proxy.$modal.msgSuccess(form.value.customerId ? "修改成功" : "新增成功");
  open.value = false;
  getList();
}

/** 作废按钮操作 */
async function handleDelete(row) {
  const customerId = row.customerId || ids.value;

  try {
    await proxy.$modal.confirm(`确认停用客户「${row.customerName}」吗？`);
    await delCustomer(customerId);
    proxy.$modal.msgSuccess("停用成功");
    getList();
  } catch {
    // 用户取消确认时保持页面静默。
  }
}

/** 展开/折叠操作 */
function toggleExpandAll() {
  refreshTable.value = false;
  isExpandAll.value = !isExpandAll.value;
  nextTick(() => {
    refreshTable.value = true;
  });
}

/** 导出按钮操作 */
function handleExport() {
  proxy.download(
    "base/customer/export",
    {
      ...queryParams.value,
    },
    `customer_${new Date().getTime()}.xlsx`,
  );
}

getList();
</script>
