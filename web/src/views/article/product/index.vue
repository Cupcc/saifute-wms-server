<template>
  <div class="app-container">
    <el-form :model="queryParams" ref="queryRef" :inline="true" v-show="showSearch" label-width="68px">
      <el-form-item label="项目名称" prop="productName">
        <el-input
          v-model="queryParams.productName"
          placeholder="请输入项目名称"
          clearable
          style="width: 240px"
          @keyup.enter="handleQuery"
        />
      </el-form-item>
      <el-form-item label="客户" prop="customerId">
	      <el-select
		      v-model="queryParams.customerId"
		      :data="customerOptions"
		      placeholder="请选择客户"
		      filterable
		      style="width: 100%"
	      >
		      <el-option
			      v-for="item in customerOptions"
			      :key="item.customerId"
			      :label="`${item.customerCode || ''} ${item.customerName || ''} ${item.customerShortName || ''}`"
			      :value="item.customerId">
		      </el-option>
	      </el-select>
      </el-form-item>
      <el-form-item label="分类" prop="classification">
        <el-select
          v-model="queryParams.classification"
          placeholder="请选择分类"
          clearable
          style="width: 240px">
          <el-option
            v-for="item in classificationOptions"
            :key="item.value"
            :label="item.label"
            :value="item.value">
          </el-option>
        </el-select>
      </el-form-item>
      <el-form-item label="业务员" prop="salesman">
        <el-input
          v-model="queryParams.salesman"
          placeholder="请输入业务员"
          clearable
          style="width: 240px"
          @keyup.enter="handleQuery"
        />
      </el-form-item>
      <el-form-item label="下单日期" style="width: 308px">
        <el-date-picker
          v-model="dateRange"
          type="daterange"
          range-separator="-"
          start-placeholder="开始日期"
          end-placeholder="结束日期"
          value-format="YYYY-MM-DD"
        ></el-date-picker>
      </el-form-item>
      <el-form-item label="出库日期" style="width: 308px">
        <el-date-picker
          v-model="outDateRange"
          type="daterange"
          range-separator="-"
          start-placeholder="开始日期"
          end-placeholder="结束日期"
          value-format="YYYY-MM-DD"
        ></el-date-picker>
      </el-form-item>
      <el-form-item label="验收日期" style="width: 308px">
        <el-date-picker
          v-model="acceptanceDateRange"
          type="daterange"
          range-separator="-"
          start-placeholder="开始日期"
          end-placeholder="结束日期"
          value-format="YYYY-MM-DD"
        ></el-date-picker>
      </el-form-item>
      <el-form-item label="供应商" prop="supplierName">
        <el-select
          v-model="queryParams.supplierId"
          placeholder="请选择供应商"
          filterable
          remote
          reserve-keyword
          :remote-method="searchSupplier"
          :loading="supplierLoading"
          style="width: 240px">
          <el-option
            v-for="item in supplierOptions"
            :key="item.supplierId"
            :label="item.supplierName"
            :value="item.supplierId">
            <span style="float: left">{{ item.supplierCode }}</span>
            <span style="float: left; margin-left: 10px;">{{ item.supplierName }}</span>
          </el-option>
        </el-select>
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
          v-hasPermi="['article:product:add']"
        >新增</el-button>
      </el-col>
	    <el-col :span="1.5">
		    <el-button type="warning" plain icon="Download" @click="handleExport" v-hasPermi="['article:product:export']">导出</el-button>
	    </el-col>
      <right-toolbar v-model:showSearch="showSearch" @queryTable="getList" :columns="columns"></right-toolbar>
    </el-row>

    <adaptive-table border stripe v-loading="loading" :data="productList" @selection-change="handleSelectionChange">
	    <el-table-column type="selection" width="50" align="center" />
      <el-table-column type="index" width="50" align="center" />
      <el-table-column sortable show-overflow-tooltip label="项目名称" align="center" prop="productName" v-if="columns[0].visible">
        <template #default="scope">
          <el-button link type="primary" @click="handleView(scope.row)">{{ scope.row.productName }}</el-button>
        </template>
      </el-table-column>
      <el-table-column sortable show-overflow-tooltip label="客户" align="center" prop="customerName" v-if="columns[1].visible" />
      <el-table-column sortable show-overflow-tooltip label="业务员" align="center" prop="salesman" v-if="columns[2].visible" />
      <el-table-column sortable show-overflow-tooltip label="分类" align="center" prop="classification" v-if="columns[3].visible" />
      <el-table-column sortable show-overflow-tooltip label="下单日期" align="center" prop="orderDate" v-if="columns[4].visible" width="120" >
	      <template #default="scope">
	        <span>{{ parseTime(scope.row.orderDate, '{y}-{m}-{d}') }}</span>
	      </template>
      </el-table-column>
      <el-table-column sortable show-overflow-tooltip label="出库日期" align="center" prop="outBoundDate" v-if="columns[5].visible" width="120" >
	      <template #default="scope">
	        <span>{{ parseTime(scope.row.outBoundDate, '{y}-{m}-{d}') }}</span>
	      </template>
      </el-table-column>
      <el-table-column label="操作" align="center" class-name="small-padding fixed-width">
        <template #default="scope">
          <el-button link type="primary" icon="Edit" @click="handleUpdate(scope.row)" v-hasPermi="['article:product:edit']">修改</el-button>
          <el-button link type="primary" icon="Delete" @click="handleDelete(scope.row)" v-hasPermi="['article:product:remove']">删除</el-button>
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

    <!-- 项目详情对话框 -->
    <el-dialog title="项目详情" v-model="detailOpen" width="95%" v-loading="dialogLoading">
      <el-descriptions :column="2" border>
        <el-descriptions-item label="项目名称">{{ detailData.productName }}</el-descriptions-item>
        <el-descriptions-item label="客户">{{ detailData.customerName }}</el-descriptions-item>
        <el-descriptions-item label="业务员">{{ detailData.salesman }}</el-descriptions-item>
        <el-descriptions-item label="分类">{{ detailData.classification }}</el-descriptions-item>
        <el-descriptions-item label="下单日期">
          <span v-if="detailData.orderDate">{{ parseTime(detailData.orderDate, '{y}-{m}-{d}') }}</span>
          <span v-else>-</span>
        </el-descriptions-item>
        <el-descriptions-item label="出库日期">
          <span v-if="detailData.outBoundDate">{{ parseTime(detailData.outBoundDate, '{y}-{m}-{d}') }}</span>
          <span v-else>-</span>
        </el-descriptions-item>
        <el-descriptions-item label="总金额">{{ detailData.totalAmount }}</el-descriptions-item>
        <el-descriptions-item label="备注">{{ detailData.remark }}</el-descriptions-item>
      </el-descriptions>
      
      <el-divider content-position="left">物料明细信息</el-divider>
      <adaptive-table :data="detailData.materialList" border stripe v-loading="dialogLoading">
        <el-table-column label="验收日期" prop="acceptanceDate">
          <template #default="scope">
            <span v-if="scope.row.acceptanceDate">{{ parseTime(scope.row.acceptanceDate, '{y}-{m}-{d}') }}</span>
            <span v-else>-</span>
          </template>
        </el-table-column>
        <el-table-column label="物料名称" prop="materialName" />
        <el-table-column label="规格型号" prop="specification" />
        <el-table-column label="单位" prop="unit" />
        <el-table-column label="数量" prop="quantity" />
        <el-table-column label="单价" prop="unitPrice" />
        <el-table-column label="含税价" prop="taxIncludedPrice" />
        <el-table-column label="供应商" prop="supplierName" />
        <el-table-column label="说明" prop="instruction" />
        <el-table-column label="出厂编号" prop="interval" />
        <el-table-column label="备注" prop="remark" />
      </adaptive-table>
    </el-dialog>

    <!-- 添加或修改项目对话框 -->
    <el-dialog :title="title" v-model="open" width="95%" v-loading="dialogLoading">
      <el-form ref="productRef" :model="form" :rules="rules" label-width="80px">
        <el-form-item label="项目名称" prop="productName">
          <el-input v-model="form.productName" placeholder="请输入项目名称" />
        </el-form-item>
        <el-form-item label="客户" prop="customerId">
          <el-select
            v-model="form.customerId"
            :data="customerOptions"
            placeholder="请选择客户"
            filterable
            allow-create
            style="width: 100%"
          >
            <el-option
              v-for="item in customerOptions"
              :key="item.customerId"
              :label="`${item.customerCode || ''} ${item.customerName || ''} ${item.customerShortName || ''}`"
              :value="item.customerId">
            </el-option>
          </el-select>
        </el-form-item>
        <el-form-item label="分类" prop="classification">
          <el-select
            v-model="form.classification"
            placeholder="请选择分类"
            filterable
            allow-create
            default-first-option
            style="width: 100%">
            <el-option
              v-for="item in classificationOptions"
              :key="item.value"
              :label="item.label"
              :value="item.value">
            </el-option>
          </el-select>
        </el-form-item>
	      <el-form-item label="下单日期" prop="orderDate">
		      <el-date-picker
			      v-model="form.orderDate"
			      type="date"
			      value-format="YYYY-MM-DD"
			      placeholder="请选择下单日期"
			      style="width: 100%">
		      </el-date-picker>
	      </el-form-item>
	      <el-form-item label="出库日期" prop="outBoundDate">
		      <el-date-picker
			      v-model="form.outBoundDate"
			      type="date"
			      value-format="YYYY-MM-DD"
			      placeholder="请选择出库日期"
			      style="width: 100%">
		      </el-date-picker>
	      </el-form-item>
        <el-form-item label="业务员" prop="salesman">
          <el-select
            v-model="form.salesman"
            filterable
            remote
            reserve-keyword
            placeholder="请输入业务员姓名搜索"
            :remote-method="searchPersonnel"
            :loading="personnelLoading"
            allow-create
            default-first-option
            style="width: 100%">
            <el-option
              v-for="item in personnelOptions"
              :key="item.personnelId"
              :label="item.name"
              :value="item.name">
            </el-option>
          </el-select>
        </el-form-item>
        <el-form-item label="总金额" prop="totalAmount">
          <el-input v-model="form.totalAmount" placeholder="自动计算" disabled/>
        </el-form-item>
        <el-form-item label="备注" prop="remark">
          <el-input v-model="form.remark" type="textarea" placeholder="请输入内容" />
        </el-form-item>
        
        <!-- 子数据（物料）表格 -->
        <el-divider content-position="left">物料信息</el-divider>
        <adaptive-table :data="form.materialList" border stripe v-loading="dialogLoading">
	        <el-table-column label="验收日期" width="140">
		        <template #default="scope">
			        <el-date-picker
				        v-model="scope.row.acceptanceDate"
				        type="date"
				        value-format="YYYY-MM-DD"
				        placeholder="请选择验收日期"
				        style="width: 100%">
			        </el-date-picker>
		        </template>
	        </el-table-column>
          <el-table-column label="物料" prop="materialId" width="160">
            <template #default="scope">
              <el-select
                v-model="scope.row.materialId"
                filterable
                remote clearable
                reserve-keyword
                placeholder="请输入物料名称或规格型号搜索"
                :remote-method="searchMaterial"
                :loading="materialLoading"
                style="width: 100%"
                @change="(val) => handleMaterialSelect(val, scope.$index)">
                <el-option
                  v-for="item in materialOptions"
                  :key="item.materialId"
                  :label="item.materialName + ' ' + item.specification"
                  :value="item.materialId">
	                <span style="float: left; color: #ff7171;">{{ item.materialCode }}</span>
	                <span style="float: left; color: #6985ff; margin-left: 10px;">{{ item.materialName }}</span>
	                <span style="float: left; color: #37a62c; margin-left: 10px;">{{ item.specification }}</span>
	                <span style="float: right; color: #8492a6; font-size: 13px;margin-left: 10px;">{{ item.currentQty }}</span>
                </el-option>
              </el-select>
            </template>
          </el-table-column>
          <el-table-column label="物料名称" prop="materialName" width="160">
            <template #default="scope">
              <combo-input v-model="scope.row.materialName" scope="material" field="materialName" :placeholder="scope.row.materialId ? '自动填充' : '请选择或输入物料名称'" :disabled="!!scope.row.materialId" />
            </template>
          </el-table-column>
          <el-table-column label="规格型号" prop="specification" width="120">
            <template #default="scope">
              <combo-input v-model="scope.row.specification" scope="material" field="specModel" :placeholder="scope.row.materialId ? '自动填充' : '请选择或输入规格型号'" :disabled="!!scope.row.materialId" />
            </template>
          </el-table-column>
          <el-table-column label="单位" prop="unit" width="120">
            <template #default="scope">
              <combo-input v-model="scope.row.unit" scope="material" field="unitCode" placeholder="请选择或输入单位" />
            </template>
          </el-table-column>
          <el-table-column label="数量" prop="quantity" width="120">
            <template #default="scope">
              <el-input-number
                v-model="scope.row.quantity"
                placeholder="请输入数量"
                :min="0"
                controls-position="right"
                style="width: 100%"
                @change="(val) => handleMaterialOrQuantityChange(undefined, val, scope.$index)" />
            </template>
          </el-table-column>
          <el-table-column label="单价" prop="unitPrice" width="150">
            <template #default="scope">
              <el-input-number v-model="scope.row.unitPrice" :min="0" placeholder="单价" controls-position="right"
                               style="width: 100%" @change="(val) => handleUnitPriceChange(val, scope.$index)" />
            </template>
          </el-table-column>
	        <el-table-column label="含税价" prop="taxIncludedPrice" width="150">
		        <template #default="scope">
			        <el-input-number v-model="scope.row.taxIncludedPrice" :min="0" placeholder="含税价" controls-position="right"
			                         style="width: 100%" />
		        </template>
	        </el-table-column>
	        <el-table-column label="供应商" prop="supplierId" width="150">
		        <template #default="scope">
			        <el-select
				        v-model="scope.row.supplierId"
				        filterable
				        remote
				        reserve-keyword
				        placeholder="请输入供应商编码或名称搜索"
				        :remote-method="searchSupplier"
				        :loading="supplierLoading"
				        allow-create
				        default-first-option
				        style="width: 100%">
				        <el-option
					        v-for="item in supplierOptions"
					        :key="item.supplierId"
					        :label="item.supplierName"
					        :value="item.supplierId">
					        <span style="float: left">{{ item.supplierCode }}</span>
					        <span style="float: left; margin-left: 10px;">{{ item.supplierName }}</span>
				        </el-option>
			        </el-select>
		        </template>
	        </el-table-column>
          <el-table-column label="说明" prop="instruction" width="150">
            <template #default="scope">
              <el-input
                v-model="scope.row.instruction"
                type="textarea" :autosize="{ minRows: 1 }"
                placeholder="请输入说明"
              />
            </template>
          </el-table-column>
          <el-table-column label="出厂编号" prop="interval" width="120">
            <template #default="scope">
              <el-input v-model="scope.row.interval" placeholder="请输入出厂编号" />
            </template>
          </el-table-column>
          <el-table-column label="备注" prop="remark">
            <template #default="scope">
              <el-input v-model="scope.row.remark"
                        type="textarea" :autosize="{ minRows: 1 }" placeholder="请输入备注" />
            </template>
          </el-table-column>
          <el-table-column label="操作" align="center" width="80" class-name="small-padding fixed-width">
            <template #default="scope">
              <el-button link type="primary" icon="Delete" @click="removeMaterial(scope.$index)">删除</el-button>
            </template>
          </el-table-column>
        </adaptive-table>
        <div style="margin-top: 10px;">
          <el-button type="primary" plain icon="Plus" @click="addMaterial">添加物料</el-button>
        </div>
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

<script setup name="Product">
import {
  abandonProduct,
  addProduct,
  delProduct,
  getProduct,
  listClassifications,
  listProduct,
  updateProduct,
} from "@/api/article/product";
import "splitpanes/dist/splitpanes.css";
import { listCustomer } from "@/api/base/customer";
import { listMaterialByCodeOrName } from "@/api/base/material.js";
import { listPersonnel } from "@/api/base/personnel";
import { listSupplier, listSupplierByKeyword } from "@/api/base/supplier";
import { listNoPage } from "@/api/entry/detail.js";
import { selectSaifuteInventoryListGroupByMaterial } from "@/api/stock/inventory.js";
import { getUsedByMaterialIdAndQuantity } from "@/api/stock/used.js";

const { proxy } = getCurrentInstance();

const productList = ref([]);
const open = ref(false);
const loading = ref(true);
const showSearch = ref(true);
const ids = ref([]);
const single = ref(true);
const multiple = ref(true);
const total = ref(0);
const title = ref("");
const dateRange = ref([]);
const outDateRange = ref([]);
const acceptanceDateRange = ref([]);

// 物料相关
const materialOptions = ref([]);
const materialLoading = ref(false);

// 供应商相关
const supplierOptions = ref([]);
const supplierLoading = ref(false);

// 人员信息相关
// 人员信息相关
// 人员信息相关
const personnelOptions = ref([]);
const personnelLoading = ref(false);

// 客户相关
const customerOptions = ref([]);
const customerLoading = ref(false);

// 分类相关
const classificationOptions = ref([]);

const data = reactive({
  form: {},
  queryParams: {
    pageNum: 1,
    pageSize: 30,
    productName: null,
    customerId: null,
    salesman: null,
    classification: null,
    orderDate: null,
    acceptanceDateStart: null,
    acceptanceDateEnd: null,
    supplierId: null,
  },
  rules: {
    productName: [
      { required: true, message: "项目名称不能为空", trigger: "blur" },
    ],
    classification: [
      { required: true, message: "分类不能为空", trigger: "blur" },
    ],
  },
});

const { queryParams, form, rules } = toRefs(data);

const detailData = ref({});
const detailOpen = ref(false);
const dialogLoading = ref(false);

// 添加columns数组定义
const columns = ref([
  { key: 0, label: `项目名称`, visible: true },
  { key: 1, label: `客户`, visible: true },
  { key: 2, label: `业务员`, visible: true },
  { key: 3, label: `分类`, visible: true },
  { key: 4, label: `下单日期`, visible: true },
  { key: 5, label: `出库日期`, visible: true },
]);

/** 查询项目列表 */
function getList() {
  loading.value = true;

  // 处理验收日期范围
  if (acceptanceDateRange.value && acceptanceDateRange.value.length === 2) {
    queryParams.value.acceptanceDateStart = acceptanceDateRange.value[0];
    queryParams.value.acceptanceDateEnd = acceptanceDateRange.value[1];
  } else {
    queryParams.value.acceptanceDateStart = null;
    queryParams.value.acceptanceDateEnd = null;
  }
  // 处理出库日期范围
  if (outDateRange.value && outDateRange.value.length === 2) {
    queryParams.value.outDateStart = outDateRange.value[0];
    queryParams.value.outDateEnd = outDateRange.value[1];
  } else {
    queryParams.value.outDateStart = null;
    queryParams.value.outDateEnd = null;
  }

  listProduct(proxy.addDateRange(queryParams.value, dateRange.value)).then(
    (response) => {
      productList.value = response.rows;
      total.value = response.total;
      loading.value = false;
    },
  );
}

// 计算总金额
function calculateTotalAmount() {
  let total = 0;
  if (form.value.materialList && Array.isArray(form.value.materialList)) {
    form.value.materialList.forEach((item) => {
      total += item.unitPrice * item.quantity || 0;
    });
  }
  form.value.totalAmount = total.toFixed(2);
}

/** 搜索供应商 */
function searchSupplier(query) {
  supplierLoading.value = true;
  listSupplierByKeyword(query)
    .then((response) => {
      supplierOptions.value = response.rows;
      supplierLoading.value = false;
    })
    .catch(() => {
      supplierLoading.value = false;
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
    productId: null,
    productName: null,
    customerId: null,
    totalAmount: null,
    salesman: null,
    classification: null,
    orderDate: null,
    outBoundDate: null,
    acceptanceDate: null,
    supplierId: null,
    remark: null,
    materialList: [],
  };
  dateRange.value = [];
  acceptanceDateRange.value = [];
  materialOptions.value = [];
  materialLoading.value = false;
  personnelOptions.value = [];
  personnelLoading.value = false;
  customerOptions.value = [];
  customerLoading.value = false;
  supplierOptions.value = [];
  supplierLoading.value = false;
  proxy.resetForm("productRef");
}

/** 搜索按钮操作 */
function handleQuery() {
  queryParams.value.pageNum = 1;
  getList();
}

/** 重置按钮操作 */
function resetQuery() {
  dateRange.value = [];
  outDateRange.value = [];
  acceptanceDateRange.value = [];
  queryParams.value.supplierId = null;
  proxy.resetForm("queryRef");
  handleQuery();
}

// 多选框选中数据
function handleSelectionChange(selection) {
  ids.value = selection.map((item) => item.productId);
  single.value = selection.length !== 1;
  multiple.value = !selection.length;
}

/** 获取分类下拉数据 */
function getClassificationOptions() {
  listClassifications().then((response) => {
    classificationOptions.value = response.data.map((item) => {
      return { value: item, label: item };
    });
  });
}

/** 新增按钮操作 */
function handleAdd() {
  reset();
  getCustomerTree();
  getClassificationOptions();
  // 获取供应商选项
  listSupplier().then((response) => {
    if (response.rows) {
      supplierOptions.value = response.rows;
    }
  });
  // 添加默认物料数据
  addMaterial();
  open.value = true;
  title.value = "添加项目";
}

/** 修改按钮操作 */
function handleUpdate(row) {
  reset();
  title.value = "修改项目";
  open.value = true;
  dialogLoading.value = true;
  getClassificationOptions();
  listMaterialByCodeOrName().then((response) => {
    materialOptions.value = response.rows;
  });
  listSupplier().then((response) => {
    if (response.rows) {
      supplierOptions.value = response.rows;
    }
  });
  const _productId = row.productId || ids.value;
  getProduct(_productId)
    .then((response) => {
      form.value = response.data;
      if (!form.value.materialList) {
        form.value.materialList = [];
      }
      calculateTotalAmount();
      getCustomerTree();
    })
    .finally(() => {
      dialogLoading.value = false;
    });
}

/** 提交按钮 */
function submitForm() {
  // 先验证主表单
  proxy.$refs["productRef"].validate((valid) => {
    if (valid) {
      // 添加处理逻辑：如果customerId不是数字，则赋值给customerName
      if (typeof form.value.customerId !== "number") {
        form.value.customerName = form.value.customerId;
        form.value.customerId = null;
      }

      // 处理物料列表中的供应商选择
      if (form.value.materialList && Array.isArray(form.value.materialList)) {
        form.value.materialList.forEach((item) => {
          if (typeof item.supplierId !== "number") {
            item.supplierName = item.supplierId;
            item.supplierId = null;
          }
        });
      }

      // 验证物料明细
      let materialValid = true;
      for (let i = 0; i < form.value.materialList.length; i++) {
        const item = form.value.materialList[i];
        if (!item.materialName) {
          proxy.$modal.msgError(`第${i + 1}行物料不能为空`);
          materialValid = false;
          break;
        }
        if (item.quantity === null || item.quantity === undefined) {
          proxy.$modal.msgError(`第${i + 1}行数量不能为空`);
          materialValid = false;
          break;
        }
      }

      if (materialValid) {
        if (form.value.productId != null) {
          updateProduct(form.value).then((response) => {
            proxy.$modal.msgSuccess("修改成功");
            open.value = false;
            getList();
            getClassificationOptions();
          });
        } else {
          addProduct(form.value).then((response) => {
            proxy.$modal.msgSuccess("新增成功");
            open.value = false;
            getList();
            getClassificationOptions();
          });
        }
      }
    }
  });
}

/** 删除按钮操作 */
function handleDelete(row) {
  const _productIds = row.productId || ids.value;
  proxy.$modal
    .confirm("是否确认废弃项目？")
    .then(() => abandonProduct(_productIds))
    .then(() => {
      getList();
      proxy.$modal.msgSuccess("废弃成功");
    })
    .catch(() => {});
}

/** 导出按钮操作 */
function handleExport() {
  // 将ids添加到queryParams中
  const exportParams = {
    ...queryParams.value,
    ids: ids.value,
  };
  proxy.download(
    "article/product/exportWithDetails",
    exportParams,
    `项目_${new Date().getTime()}.xlsx`,
  );
}

/** 添加物料 */
function addMaterial() {
  if (!form.value.materialList) {
    form.value.materialList = [];
  }
  form.value.materialList.push({
    materialId: null,
    materialName: null,
    specification: null,
    unit: null,
    quantity: null,
    acceptanceDate: null,
    supplierId: null,
    taxIncludedPrice: null,
    unitPrice: null,
    instruction: null,
    interval: null,
    remark: null,
  });
}

/** 删除物料 */
function removeMaterial(index) {
  form.value.materialList.splice(index, 1);
  // 重新计算总金额
  calculateTotalAmount();
}

/** 处理单价字段变化 */
function handleUnitPriceChange(val, index) {
  // 清空对应行的说明字段
  form.value.materialList[index].instruction = "";
  // 重新计算总金额
  calculateTotalAmount();
}

/** 搜索物料 */
function searchMaterial(query) {
  materialLoading.value = true;
  selectSaifuteInventoryListGroupByMaterial({
    materialCode: query,
    currentQty: 0,
  }).then((response) => {
    materialOptions.value = response.rows;
    materialLoading.value = false;
  });
}

/**
 * 处理物料选择事件
 */
function handleMaterialSelect(val, index) {
  const material = materialOptions.value.find(
    (item) => item.materialId === val,
  );
  if (material) {
    // 设置领料数量为当前库存量
    form.value.materialList[index].quantity = material.currentQty;
    form.value.materialList[index].materialName = material.materialName;
    form.value.materialList[index].specification = material.specification;
    // 自动填充单位信息
    form.value.materialList[index].unit = material.unit;
    const query = { ...queryParams.value };
    if (dateRange.value && dateRange.value.length === 2) {
      if (!query.params) {
        query.params = {};
      }
      query.params.materialId = material.materialId;
    }
    listNoPage(query)
      .then((response) => {
        if (
          response.data &&
          Array.isArray(response.data) &&
          response.data.length > 0
        ) {
          form.value.materialList[index].supplierId =
            response.data[0].supplierId;
          form.value.materialList[index].acceptanceDate =
            response.data[0].inboundDate;
        } else {
          // 返回结果为空的处理
          console.log("No detail list data found");
        }
      })
      .catch((error) => {
        console.error("Error fetching detail list:", error);
      });
    // 调用统一处理方法
    handleMaterialOrQuantityChange(val, material.currentQty, index);
  } else {
    // 清空物料名称和规格型号
    form.value.materialList[index].materialName = null;
    form.value.materialList[index].specification = null;
    // 如果没有找到物料，仍然调用统一处理方法
    handleMaterialOrQuantityChange(val, undefined, index);
  }
}

/**
 * 处理物料或数量变化的统一方法
 */
function handleMaterialOrQuantityChange(materialId, quantity, index) {
  // 更新表单数据
  if (materialId !== undefined) {
    form.value.materialList[index].materialId = materialId;
  }
  if (quantity !== undefined) {
    form.value.materialList[index].quantity = quantity;
    calculateTotalAmount();
  }

  // 如果物料ID和数量都存在，则调用批次API
  const detail = form.value.materialList[index];
  const actualMaterialId =
    materialId !== undefined ? materialId : detail.materialId;
  const actualQuantity = quantity !== undefined ? quantity : detail.quantity;

  if (actualMaterialId && actualQuantity) {
    getUsedByMaterialIdAndQuantity(actualMaterialId, actualQuantity)
      .then((response) => {
        // 处理返回的库存使用情况，计算单价
        if (response.data && Array.isArray(response.data)) {
          // 只有当响应数据中只有一条记录时才赋值单价
          if (response.data.length === 1) {
            const singleItem = response.data[0];
            // 将计算出的单价赋值给对应行的unitPrice字段（表格中显示为"单价"）
            form.value.materialList[index].unitPrice = Number(
              (singleItem.useQty * singleItem.unitPrice).toFixed(2),
            );
          } else {
            // 如果有多条记录，按照原来的方式计算总和
            let totalSubtotal = 0;
            response.data.forEach((item) => {
              totalSubtotal += Number(
                (item.useQty * item.unitPrice).toFixed(2),
              );
            });
            form.value.materialList[index].unitPrice = totalSubtotal;
          }

          // 生成说明信息（包含库位编码、数量、价格），相同单价的合并显示
          let instructionInfo = "";
          // 按单价分组数据
          const groupedByUnitPrice = {};
          response.data.forEach((item) => {
            const unitPrice = item.unitPrice != null ? item.unitPrice : "";
            if (!groupedByUnitPrice[unitPrice]) {
              groupedByUnitPrice[unitPrice] = [];
            }
            groupedByUnitPrice[unitPrice].push(item);
          });

          let itemIndex = 1;
          for (const [unitPrice, items] of Object.entries(groupedByUnitPrice)) {
            if (items.length === 1) {
              // 只有一个项目时，显示单个项目信息
              instructionInfo += `${itemIndex}. 数量: ${items[0].useQty}, 单价: ${unitPrice}\n`;
              itemIndex++;
            } else {
              // 多个项目有相同单价时，合并显示
              const totalQty = items.reduce(
                (sum, item) => sum + item.useQty,
                0,
              );
              instructionInfo += `${itemIndex}. 数量: ${totalQty}, 单价: ${unitPrice}\n`;
              itemIndex++;
            }
          }
          form.value.materialList[index].instruction = instructionInfo;
          form.value.materialList[index].saifuteInventoryUsed = response.data;

          // 重新计算总金额
          calculateTotalAmount();
        }
      })
      .catch((error) => {
        console.error("获取库存使用情况失败:", error);
      });
  }
}

/** 搜索人员信息 */
function searchPersonnel(query) {
  personnelLoading.value = true;
  listPersonnel({
    type: 8,
    name: query,
  })
    .then((response) => {
      personnelOptions.value = response.rows;
      personnelLoading.value = false;
    })
    .catch(() => {
      personnelLoading.value = false;
    });
}

// 页面加载时获取人员信息
searchPersonnel("");

// 页面加载时获取供应商信息
listSupplier().then((response) => {
  if (response.rows) {
    supplierOptions.value = response.rows;
  }
});

// 获取分类选项
getClassificationOptions();

/** 查询客户下拉树 */
function getCustomerTree() {
  listCustomer()
    .then((response) => {
      customerOptions.value = response.rows;
    })
    .catch((error) => {
      console.error("获取客户数据失败:", error);
      customerOptions.value = [];
    });
}

// 查看项目详情
function handleView(row) {
  detailData.value = {};
  detailOpen.value = true;
  dialogLoading.value = true;
  const _productId = row.productId;
  getProduct(_productId)
    .then((response) => {
      detailData.value = response.data;
      if (!detailData.value.materialList) {
        detailData.value.materialList = [];
      }
    })
    .finally(() => {
      dialogLoading.value = false;
    });
}

getList();
getCustomerTree();
</script>
