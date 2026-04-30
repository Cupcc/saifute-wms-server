<template>
  <div class="app-container">
    <el-form :model="queryParams" ref="queryRef" :inline="true" v-show="showSearch" label-width="68px">
      <el-form-item label="领料单号" prop="pickNo">
        <el-input
          v-model="queryParams.pickNo"
          placeholder="请输入领料单号"
          clearable
          style="width: 240px"
          @keyup.enter="handleQuery"
        />
      </el-form-item>
      <el-form-item label="领料日期" style="width: 308px">
        <el-date-picker
          v-model="daterangePickDate"
          value-format="YYYY-MM-DD"
          type="daterange"
          range-separator="-"
          start-placeholder="开始日期"
          end-placeholder="结束日期"
        ></el-date-picker>
      </el-form-item>
      <el-form-item label="领料人" prop="picker">
        <combo-input v-model="queryParams.picker" scope="personnel" field="personnelName" placeholder="请选择或输入领料人" width="240px" />
      </el-form-item>
	    <el-form-item label="车间" prop="workshopId">
		    <el-select v-model="queryParams.workshopId" filterable remote reserve-keyword placeholder="请输入车间名称搜索"
		               :remote-method="searchWorkshop" :loading="workshopLoading" style="width: 240px">
			    <el-option
				    v-for="item in workshopOptions"
				    :key="item.workshopId"
				    :label="item.workshopName"
				    :value="item.workshopId">
				    <span style="float: left">{{ item.workshopName }}</span>
			    </el-option>
		    </el-select>
	    </el-form-item>
	    <el-form-item label="物料" prop="materialId">
		    <el-select
			    v-model="queryParams.materialId"
			    filterable
			    remote
			    reserve-keyword
			    placeholder="请输入物料名称或规格型号搜索"
			    :remote-method="searchMaterialCodeOrName"
			    clearable
			    style="width: 240px">
			    <el-option
				    v-for="item in materialSerch"
				    :key="item.materialId"
				    :label="item.materialName + ' ' + item.specification"
				    :value="item.materialId">
				    <span style="float: left; color: #ff7171;">{{ item.materialCode }}</span>
				    <span style="float: left; color: #6985ff; margin-left: 10px;">{{ item.materialName }}</span>
				    <span style="float: right; color: #37a62c; font-size: 13px; margin-left: 20px;">{{ item.specification }}</span>
			    </el-option>
		    </el-select>
	    </el-form-item>
	    <el-form-item label="物料名称" prop="materialName">
		    <combo-input v-model="queryParams.materialName" scope="material" field="materialName" placeholder="请选择或输入物料名称" width="240px" />
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
          v-hasPermi="['workshop-material:pick-order:create']"
        >新增</el-button>
      </el-col>
      <el-col :span="1.5">
        <el-button
          type="success"
          plain
          icon="Edit"
          :disabled="single"
          @click="handleUpdate"
          v-hasPermi="['workshop-material:pick-order:update']"
        >修改</el-button>
      </el-col>
      <right-toolbar v-model:showSearch="showSearch" @queryTable="getList" :columns="columns"></right-toolbar>
    </el-row>

    <adaptive-table border stripe v-loading="loading" :data="pickOrderList" @selection-change="handleSelectionChange" @row-click="handleRowClick">
      <el-table-column type="selection" width="50" align="center" />
      <el-table-column type="index" width="50" align="center" />
      <el-table-column sortable show-overflow-tooltip label="领料单号" align="center" prop="pickNo" v-if="columns[0].visible">
        <template #default="scope">
          <el-button link type="primary" @click="handleDetail(scope.row)">
            {{ scope.row.pickNo }}
          </el-button>
        </template>
      </el-table-column>
      <el-table-column
        sortable
        show-overflow-tooltip
        label="领料日期"
        align="center"
        prop="pickDate"
        width="200"
        :sort-method="comparePickDateRows"
        v-if="columns[1].visible"
      >
        <template #default="scope">
          <el-button link type="primary" @click="handleDetail(scope.row)">
            <span style="display: inline-flex; flex-direction: column; align-items: center; line-height: 1.35;">
              <span>{{ formatDocumentDate(scope.row.pickDate) }}</span>
              <span style="font-size: 12px; color: #909399;">
                创建 {{ formatRecordDateTime(scope.row.createdAt) }}
              </span>
            </span>
          </el-button>
        </template>
      </el-table-column>
      <el-table-column sortable show-overflow-tooltip label="领料人" align="center" prop="picker" v-if="columns[2].visible">
        <template #default="scope">
          <el-button link type="primary" @click="handleDetail(scope.row)">
            {{ scope.row.picker }}
          </el-button>
        </template>
      </el-table-column>
      <el-table-column sortable show-overflow-tooltip label="创建人" align="center" prop="createBy" v-if="columns[3].visible">
        <template #default="scope">
          <el-button link type="primary" @click="handleDetail(scope.row)">
            {{ scope.row.createBy }}
          </el-button>
        </template>
      </el-table-column>
      <el-table-column sortable show-overflow-tooltip label="审核结果" align="center" prop="auditStatus" v-if="columns[4].visible">
        <template #default="scope">
          <el-button link type="primary" :underline="false" @click.stop="handleDetail(scope.row)">
            <span v-if="scope.row.auditStatus === '0' || scope.row.auditStatus === 0" style="color: #E6A23C;">未审核</span>
            <span v-else-if="scope.row.auditStatus === '1' || scope.row.auditStatus === 1" style="color: #67C23A;">审核通过</span>
            <span v-else-if="scope.row.auditStatus === '2' || scope.row.auditStatus === 2" style="color: #F56C6C;">审核不通过</span>
            <span v-else>{{ scope.row.auditStatus }}</span>
          </el-button>
        </template>
      </el-table-column>
      <el-table-column label="操作" align="center" class-name="small-padding fixed-width">
        <template #default="scope">
          <el-button link type="primary" icon="Edit" @click="handleUpdate(scope.row)" v-hasPermi="['workshop-material:pick-order:update']" v-if="scope.row.auditStatus !== '1' && (username === scope.row.createBy || username === 'admin')">修改</el-button>
          <el-button link type="primary" icon="Delete" @click="handleVoid(scope.row)" v-hasPermi="['workshop-material:pick-order:void']" v-if="username === scope.row.createBy || username === 'admin'">作废</el-button>
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

    <!-- 添加或修改领料单对话框 -->
    <el-dialog :title="title" v-model="open" width="1200px" append-to-body draggable>
      <el-form ref="pickOrderRef" :model="form" :rules="rules" label-width="96px" v-loading="dialogLoading">
        <el-row>
          <el-col :span="12">
            <el-form-item label="领料单号" prop="pickNo">
              <el-input v-model="form.pickNo" placeholder="请输入领料单号" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="领料日期" prop="pickDate">
              <el-date-picker clearable
                v-model="form.pickDate"
                type="date"
                value-format="YYYY-MM-DD"
                placeholder="请选择领料日期"
                @change="handlePickDateChange">
              </el-date-picker>
            </el-form-item>
          </el-col>
        </el-row>
        <el-row>
          <el-col :span="12">
            <el-form-item label="领料人" prop="picker">
              <combo-input v-model="form.picker" scope="personnel" field="personnelName" placeholder="请选择或输入领料人" />
            </el-form-item>
          </el-col>
        </el-row>
        <el-row>
          <el-col :span="12">
	          <el-form-item label="领料车间" prop="workshopId">
		          <el-select
			          v-model="form.workshopId"
			          filterable
			          remote
			          reserve-keyword
			          placeholder="请输入车间名称搜索"
			          :remote-method="searchWorkshopForForm"
			          :loading="workshopLoadingForForm"
			          style="width: 100%"
			          :disabled="form.intoId != null"
			          @change="handleWorkshopChange">
			          <el-option
				          v-for="item in workshopOptionsForForm"
				          :key="item.workshopId"
				          :label="item.workshopName"
				          :value="item.workshopId">
				          <span style="float: left">{{ item.workshopName }}</span>
			          </el-option>
		          </el-select>
	          </el-form-item>
          </el-col>
	        <el-col :span="24">
		        <el-form-item label="备注" prop="remark">
			        <el-input v-model="form.remark" type="textarea" placeholder="请输入内容" />
		        </el-form-item>
	        </el-col>
        </el-row>
        <!-- 明细列表 -->
        <div style="margin-top: 20px;">
          <el-table :data="form.details" border stripe v-loading="dialogLoading">
	          <el-table-column type="index" width="50" align="center" />
            <el-table-column label="物料" prop="materialId" width="220">
              <template #default="scope">
                <el-select
                  v-model="scope.row.materialId"
                  filterable
                  remote
                  reserve-keyword
                  placeholder="请输入物料名称或规格型号搜索"
                  :remote-method="(query) => searchMaterialForDetail(query, scope.$index)"
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
	                  <span style="float: right; color: #37a62c; font-size: 13px; margin-left: 20px;">{{ item.specification }}</span>
                  </el-option>
                </el-select>
              </template>
            </el-table-column>
            <el-table-column label="成本价层" prop="selectedUnitCost" width="170">
              <template #default="scope">
                <el-select
                  v-model="scope.row.selectedUnitCost"
                  filterable
                  clearable
                  placeholder="请选择"
                  :loading="scope.row.priceLayerLoading"
                  style="width: 100%"
                  @change="() => handlePriceLayerChange(scope.row)">
                  <el-option
                    v-for="item in scope.row.priceLayerOptions || []"
                    :key="item.unitCost"
                    :label="`${item.unitCost} / 可用 ${item.availableQty}`"
                    :value="item.unitCost"
                  />
                </el-select>
              </template>
            </el-table-column>
            <el-table-column label="单价" prop="unitPrice" width="120" align="right">
              <template #default="scope">
                <span>{{ formatMoneyDisplay(scope.row.unitPrice) }}</span>
              </template>
            </el-table-column>
            <el-table-column label="领料数量" prop="quantity" width="160">
              <template #default="scope">
                <el-input-number
                  v-model="scope.row.quantity"
                  placeholder="领料数量"
                  :min="0"
                  :max="form.pickId ? undefined : getMaxQuantity(scope.row)"
                  controls-position="right"
                  style="width: 100%"
                  @change="(val) => handleMaterialOrQuantityChange(undefined, val, scope.$index)" />
              </template>
            </el-table-column>
            <el-table-column label="金额" prop="amount" width="140" align="right">
              <template #default="scope">
                <span>{{ formatMoneyDisplay(scope.row.amount) }}</span>
              </template>
            </el-table-column>
            <el-table-column label="备注" prop="remark">
              <template #default="scope">
                <el-input v-model="scope.row.remark"
                          type="textarea" :autosize="{ minRows: 1 }" placeholder="请输入备注" />
              </template>
            </el-table-column>
            <el-table-column label="操作" align="center" class-name="small-padding fixed-width">
              <template #default="scope">
                <el-button link type="primary" icon="Delete" @click="handleDeleteDetail(scope.$index)">删除</el-button>
              </template>
            </el-table-column>
          </el-table>
        </div>
        <el-row>
          <el-col :span="24">
		          <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 10px; padding-right: 20px">
		            <el-button type="primary" plain icon="Plus" @click="handleAddDetail">添加明细</el-button>
              <span>合计金额: {{ formatMoneyDisplay(form.totalAmount) }}</span>
            </div>
          </el-col>
        </el-row>
      </el-form>
      <template #footer>
        <div class="dialog-footer">
          <el-button type="primary" @click="submitForm">确 定</el-button>
          <el-button @click="cancel">取 消</el-button>
        </div>
      </template>
    </el-dialog>
    
    <!-- 查看详情对话框 -->
    <el-dialog title="查看领料单详情" v-model="detailOpen" width="800px" append-to-body draggable>
      <el-row :gutter="10">
        <el-col :span="24">
          <el-card class="box-card">
            <template #header>
              <div class="card-header">
                <span>领料单信息</span>
              </div>
            </template>
            <el-descriptions :column="2" border>
              <el-descriptions-item label="领料单号">{{ detailData.pickNo }}</el-descriptions-item>
              <el-descriptions-item label="领料日期">{{ parseTime(detailData.pickDate, '{y}-{m}-{d}') }}</el-descriptions-item>
              <el-descriptions-item label="领料人">{{ detailData.picker }}</el-descriptions-item>
              <el-descriptions-item label="车间">{{ detailData.workshopName }}</el-descriptions-item>
              <el-descriptions-item label="总金额">{{ detailData.totalAmount }}</el-descriptions-item>
              <el-descriptions-item label="创建人">{{ detailData.createBy }}</el-descriptions-item>
              <el-descriptions-item label="创建时间">{{ parseTime(detailData.createdAt, '{y}-{m}-{d} {h}:{i}:{s}') }}</el-descriptions-item>
              <el-descriptions-item label="更新人">{{ detailData.updateBy }}</el-descriptions-item>
              <el-descriptions-item label="更新时间">{{ parseTime(detailData.updatedAt, '{y}-{m}-{d} {h}:{i}:{s}') }}</el-descriptions-item>
              <el-descriptions-item label="审核结果">
                <span v-if="detailData.auditStatus === '0' || detailData.auditStatus === 0" style="color: #E6A23C;">未审核</span>
                <span v-else-if="detailData.auditStatus === '1' || detailData.auditStatus === 1" style="color: #67C23A;">审核通过</span>
                <span v-else-if="detailData.auditStatus === '2' || detailData.auditStatus === 2" style="color: #F56C6C;">审核不通过</span>
                <span v-else>{{ detailData.auditStatus }}</span>
              </el-descriptions-item>
              <el-descriptions-item label="审核人" v-if="detailData.auditStatus === '1' || detailData.auditStatus === 1 || detailData.auditStatus === '2' || detailData.auditStatus === 2">{{ detailData.auditor }}</el-descriptions-item>
              <el-descriptions-item label="审核时间" v-if="detailData.auditStatus === '1' || detailData.auditStatus === 1 || detailData.auditStatus === '2' || detailData.auditStatus === 2">{{ parseTime(detailData.auditTime, '{y}-{m}-{d} {h}:{i}:{s}') }}</el-descriptions-item>
              <el-descriptions-item label="备注" :span="2">{{ detailData.remark }}</el-descriptions-item>
            </el-descriptions>
          </el-card>
        </el-col>
        
        <el-col :span="24" style="margin-top: 15px;">
          <el-card class="box-card">
            <template #header>
              <div class="card-header">
                <span>明细信息</span>
              </div>
            </template>
            <div style="margin-top: 20px;">
              <el-table :data="detailData.details" border stripe>
                <el-table-column label="物料编码" prop="materialCode" />
                <el-table-column label="物料名称" prop="materialName" />
                <el-table-column label="规格型号" prop="specification" />
                <el-table-column label="领料数量" prop="quantity" />
                <el-table-column label="单价" prop="rawUnitPrice" />
                <el-table-column label="金额" prop="amount" />
                <el-table-column label="备注" prop="remark" />
              </el-table>
            </div>
          </el-card>
        </el-col>
      </el-row>
      
      <template #footer>
        <div class="dialog-footer">
          <el-button
            type="success" v-hasPermi="['approval:document:approve']"
            v-if="(detailData.auditStatus === '0' || detailData.auditStatus === 0) && (username !== detailData.createBy || username === 'admin')"
            @click="handleAudit(1)"
          >
            通过
          </el-button>
          <el-button
            type="danger" v-hasPermi="['approval:document:reject']"
            v-if="(detailData.auditStatus === '0' || detailData.auditStatus === 0) && (username !== detailData.createBy || username === 'admin')"
            @click="handleAudit(2)"
          >
            不通过
          </el-button>
          <el-button @click="detailOpen = false">关 闭</el-button>
        </div>
      </template>
    </el-dialog>
    
    <!-- 作废对话框 -->
    <el-dialog title="作废领料单" v-model="abandonOpen" width="500px" append-to-body>
      <el-form ref="abandonRef" :model="abandonForm" :rules="abandonRules">
        <el-form-item label="作废说明" prop="voidDescription">
          <el-input type="textarea" v-model="abandonForm.voidDescription" placeholder="请输入作废说明" />
        </el-form-item>
      </el-form>
      <template #footer>
        <div class="dialog-footer">
          <el-button type="primary" @click="submitAbandonForm">确 定</el-button>
          <el-button @click="cancelAbandon">取 消</el-button>
        </div>
      </template>
    </el-dialog>
  </div>
</template>

<script setup name="PickOrder">
import { approvalDocument } from "@/api/approval/approval";
import { listMaterialByCodeOrName } from "@/api/base/material.js";
import { listPersonnel } from "@/api/base/personnel";
import { clearSuggestionsCache } from "@/api/base/suggestions";
import { listByNameOrContact } from "@/api/base/workshop.js";
import { selectSaifuteInventoryListGroupByMaterial } from "@/api/stock/inventory.js";
import {
  addPickOrder,
  getPickOrder,
  listPickOrder,
  updatePickOrder,
  voidPickOrder,
} from "@/api/take/pickOrder";
import useAiActionStore from "@/store/modules/aiAction";
import useUserStore from "@/store/modules/user";
import {
  materialOptionsFromDocumentSnapshots,
  mergeMaterialOptions,
} from "@/utils/materialOptions";
import { formatDateToYYYYMMDD, generateOrderNo } from "@/utils/orderNumber";
import request from "@/utils/request";

const { proxy } = getCurrentInstance();

const pickOrderList = ref([]);
const open = ref(false);
const loading = ref(true);
const showSearch = ref(true);
const ids = ref([]);
const single = ref(true);
const multiple = ref(true);
const total = ref(0);
const title = ref("");
const daterangePickDate = ref([]);
const materialOptions = ref([]);
const materialLoading = ref(false);
const detailOpen = ref(false);
const materialSerch = ref([]);
const abandonOpen = ref(false);

// 人员信息相关
const personnelOptions = ref([]);
const personnelLoading = ref(false);
const workshopOptions = ref([]);
const workshopOptionsForForm = ref([]);
const workshopLoading = ref(false);
const workshopLoadingForForm = ref(false);

// 详情数据
const detailData = ref({});
const dialogLoading = ref(false);

const data = reactive({
  form: {
    details: [],
  },
  queryParams: {
    pageNum: 1,
    pageSize: 30,
    pickNo: null,
    pickDate: null,
    picker: null,
    workshopId: null,
    materialId: null,
    materialName: null,
  },
  rules: {
    pickNo: [{ required: true, message: "领料单号不能为空", trigger: "blur" }],
    pickDate: [
      { required: true, message: "领料日期不能为空", trigger: "change" },
    ],
    picker: [{ required: true, message: "领料人不能为空", trigger: "blur" }],
  },
  abandonForm: {},
  abandonRules: {
    voidDescription: [
      { required: true, message: "作废说明不能为空", trigger: "blur" },
    ],
  },
});

const { queryParams, form, rules, abandonForm, abandonRules } = toRefs(data);

const username = computed(() => useUserStore().name);

// 添加columns数组定义
const columns = ref([
  { key: 0, label: `领料单号`, visible: true },
  { key: 1, label: `领料日期`, visible: true },
  { key: 2, label: `领料人`, visible: true },
  { key: 3, label: `创建人`, visible: false },
  { key: 4, label: `审核结果`, visible: true },
]);

function formatDocumentDate(value) {
  if (!value) {
    return "-";
  }
  return String(value).slice(0, 10);
}

function formatRecordDateTime(value) {
  if (!value) {
    return "-";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    const text = String(value);
    const monthDay = text.slice(5, 10);
    const time = text.slice(11, 19);
    if (monthDay && time) {
      return `${monthDay} ${time}`;
    }
    return text;
  }

  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hour = String(date.getHours()).padStart(2, "0");
  const minute = String(date.getMinutes()).padStart(2, "0");
  const second = String(date.getSeconds()).padStart(2, "0");
  return `${month}-${day} ${hour}:${minute}:${second}`;
}

function toTimestamp(value) {
  if (!value) {
    return 0;
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 0 : date.getTime();
}

function comparePickDateRows(left, right) {
  const dateCompare = formatDocumentDate(left?.pickDate).localeCompare(
    formatDocumentDate(right?.pickDate),
  );
  if (dateCompare !== 0) {
    return dateCompare;
  }

  const createdAtCompare =
    toTimestamp(left?.createdAt) - toTimestamp(right?.createdAt);
  if (createdAtCompare !== 0) {
    return createdAtCompare;
  }

  return Number(left?.pickId ?? 0) - Number(right?.pickId ?? 0);
}

/** 查询领料单列表 */
function getList() {
  loading.value = true;
  listPickOrder(
    proxy.addDateRange(queryParams.value, daterangePickDate.value),
  ).then((response) => {
    pickOrderList.value = response.rows;
    total.value = response.total;
    loading.value = false;
  });
}

/** 重置查询表单 */
function resetQuery() {
  daterangePickDate.value = [];
  proxy.resetForm("queryRef");
  handleQuery();
}

/** 搜索按钮操作 */
function handleQuery() {
  queryParams.value.pageNum = 1;
  getList();
}

/** 重置表单 */
function reset() {
  form.value = {
    pickId: null,
    pickNo: null,
    projectId: null,
    pickDate: null,
    picker: null,
    workshopId: null,
    remark: null,
    delFlag: null,
    voidDescription: null,
    createBy: null,
    createdAt: null,
    updateBy: null,
    updatedAt: null,
    totalAmount: "0.00",
    details: [],
  };
  proxy.resetForm("pickOrderRef");
}

/** 新增按钮操作 */
function handleAdd() {
  reset();
  const today = new Date();
  form.value.pickDate = formatDateToYYYYMMDD(today);
  title.value = "添加领料单";
  open.value = true;
  dialogLoading.value = true;
  generatePickNo(today)
    .then((pickNo) => {
      form.value.pickNo = pickNo;
      form.value.details = [
        {
          detailId: null,
          materialId: null,
          selectedUnitCost: "",
          priceLayerOptions: [],
          priceLayerLoading: false,
          unitPrice: null,
          quantity: null,
          amount: null,
          remark: null,
        },
      ];
    })
    .finally(() => {
      dialogLoading.value = false;
    });
}

/** 搜索物料 */
function searchMaterialCodeOrName(query) {
  listMaterialByCodeOrName({
    materialCode: query,
  }).then((response) => {
    materialSerch.value = response.rows;
  });
}

/**
 * 生成领料单号
 */
async function generatePickNo(date) {
  // 查询当天已有的领料单号，找出最大流水号
  const params = {
    params: {
      beginTime: formatDateToYYYYMMDD(date),
      endTime: formatDateToYYYYMMDD(date),
    },
  };

  return generateOrderNo(date, "LL", listPickOrder, params, "pickNo");
}

/**
 * 处理领料日期更改事件，重新生成领料单号
 */
async function handlePickDateChange(val) {
  if (val && !form.value.pickId) {
    const newDate = new Date(val);
    const newPickNo = await generatePickNo(newDate);
    form.value.pickNo = newPickNo;
  }
}

/** 修改按钮操作 */
function handleUpdate(row) {
  const pickId = resolveSelectedPickId(row);
  if (!pickId) {
    return;
  }
  reset();
  title.value = "修改领料单";
  open.value = true;
  dialogLoading.value = true;
  getPickOrder(pickId)
    .then((response) => {
      const orderData = response.data;
      form.value = {
        pickId: orderData.pickId,
        pickNo: orderData.pickNo,
        projectId: orderData.projectId,
        pickDate: orderData.pickDate,
        picker: orderData.picker,
        workshopId: orderData.workshopId,
        remark: orderData.remark,
        delFlag: orderData.delFlag,
        voidDescription: orderData.voidDescription,
        createBy: orderData.createBy,
        createdAt: orderData.createdAt,
        updateBy: orderData.updateBy,
        updatedAt: orderData.updatedAt,
        totalAmount: orderData.totalAmount,
        details: [],
      };
      workshopOptionsForForm.value = orderData.workshopId
        ? [
            {
              workshopId: orderData.workshopId,
              workshopName: orderData.workshopName,
            },
          ]
        : [];
      if (orderData.details && orderData.details.length > 0) {
        form.value.details = orderData.details.map((detail) => ({
          detailId: detail.detailId,
          materialId: detail.materialId,
          selectedUnitCost: detail.selectedUnitCost ?? detail.rawUnitPrice ?? "",
          priceLayerOptions: [],
          priceLayerLoading: false,
          unitPrice: detail.rawUnitPrice,
          quantity: detail.quantity,
          amount: detail.amount,
          remark: detail.remark,
        }));
        materialOptions.value = mergeMaterialOptions(
          materialOptions.value,
          materialOptionsFromDocumentSnapshots(orderData.details),
        );
        form.value.details.forEach((detail) => {
          loadPriceLayerOptions(detail);
        });
        const materialIds = orderData.details
          .filter((detail) => detail.materialId)
          .map((detail) => detail.materialId);
        if (materialIds.length > 0) {
          selectSaifuteInventoryListGroupByMaterial({
            materialIds: materialIds,
          })
            .then((response) => {
              materialOptions.value = mergeMaterialOptions(
                materialOptions.value,
                response.rows || [],
              );
            })
            .catch((error) => {
              console.error("预加载物料数据失败:", error);
            });
        }
      } else {
        handleAddDetail();
      }
    })
    .finally(() => {
      dialogLoading.value = false;
    });
}

/** 提交按钮 */
function submitForm() {
  proxy.$refs["pickOrderRef"].validate((valid) => {
    if (valid) {
      if (!form.value.details || form.value.details.length === 0) {
        proxy.$modal.msgError("至少需要添加一条明细");
        return;
      }
      // 如果存在pickId，则为修改操作
      if (form.value.pickId != null) {
        // 修改操作需要验证所有字段
        for (let i = 0; i < form.value.details.length; i++) {
          const detail = form.value.details[i];
          if (!detail.materialId) {
            proxy.$modal.msgError("第" + (i + 1) + "行物料不能为空");
            return;
          }
          if (!detail.quantity || detail.quantity <= 0) {
            proxy.$modal.msgError("第" + (i + 1) + "行领料数量必须大于0");
            return;
          }
          if (!detail.selectedUnitCost) {
            proxy.$modal.msgError("第" + (i + 1) + "行成本价层不能为空");
            return;
          }
        }

        // 调用修改接口（包含明细数据）
        updatePickOrder(form.value).then((response) => {
          clearSuggestionsCache();
          proxy.$modal.msgSuccess("修改成功");
          open.value = false;
          getList();
        });
      } else {
        // 新增操作
        // 验证明细必填项
        for (let i = 0; i < form.value.details.length; i++) {
          const detail = form.value.details[i];
          if (!detail.materialId) {
            proxy.$modal.msgError("第" + (i + 1) + "行物料不能为空");
            return;
          }
          if (!detail.quantity || detail.quantity <= 0) {
            proxy.$modal.msgError("第" + (i + 1) + "行领料数量必须大于0");
            return;
          }
          if (!detail.selectedUnitCost) {
            proxy.$modal.msgError("第" + (i + 1) + "行成本价层不能为空");
            return;
          }
        }

        addPickOrder(form.value).then((response) => {
          clearSuggestionsCache();
          proxy.$modal.msgSuccess("新增成功");
          open.value = false;
          getList();
        });
      }
    }
  });
}

/** 取消按钮 */
function cancel() {
  open.value = false;
  reset();
}

/** 选择条数 */
function handleSelectionChange(selection) {
  ids.value = selection.map((item) => item.pickId);
  single.value = selection.length !== 1;
  multiple.value = !selection.length;
}

/** 点击行时同步工具栏状态 */
function handleRowClick(row) {
  if (!row?.pickId) {
    return;
  }
  ids.value = [row.pickId];
  single.value = false;
  multiple.value = false;
}

/** 详情按钮操作 */
function handleDetail(row) {
  getPickOrder(row.pickId).then((response) => {
    detailData.value = response.data;
    detailOpen.value = true;
  });
}

/** 添加明细 */
function handleAddDetail() {
  form.value.details.push({
    detailId: null,
    materialId: null,
    selectedUnitCost: "",
    priceLayerOptions: [],
    priceLayerLoading: false,
    unitPrice: null,
    quantity: null,
    amount: null,
    remark: null,
  });
}

/** 删除明细 */
function handleDeleteDetail(index) {
  form.value.details.splice(index, 1);
}

/** 作废按钮操作 */
function handleVoid(row) {
  const pickId = resolveSelectedPickId(row);
  if (!pickId) {
    return;
  }
  abandonForm.value = {
    pickId,
    voidDescription: "",
  };
  abandonOpen.value = true;
  proxy.resetForm("abandonRef");
}

function resolveSelectedPickId(row) {
  const pickId = row?.pickId ?? ids.value[0];
  if (!pickId) {
    proxy.$modal.msgError("请选择一条领料单记录");
    return null;
  }
  return pickId;
}

/** 取消作废操作 */
function cancelAbandon() {
  abandonOpen.value = false;
  proxy.resetForm("abandonRef");
}

/** 提交作废表单 */
function submitAbandonForm() {
  proxy.$refs["abandonRef"].validate((valid) => {
    if (valid) {
      const abandonData = {
        pickId: abandonForm.value.pickId,
        voidDescription: abandonForm.value.voidDescription,
      };
      voidPickOrder(abandonData.pickId, abandonData).then(() => {
        getList();
        abandonOpen.value = false;
        proxy.$modal.msgSuccess("作废成功");
      });
    }
  });
}

/**
 * 为明细行查询物料（支持过滤已选项）
 */
function searchMaterialForDetail(query, rowIndex) {
  materialLoading.value = true;
  selectSaifuteInventoryListGroupByMaterial({
    materialCode: query,
    currentQty: 0,
  })
    .then((response) => {
      materialOptions.value = mergeMaterialOptions(
        response.rows || [],
        materialOptions.value,
      );
      materialLoading.value = false;
    })
    .catch(() => {
      materialLoading.value = false;
    });
}

/** 人员搜索 */
function searchPersonnel(query) {
  personnelLoading.value = true;
  listPersonnel({
    type: 3,
    name: query,
  })
    .then((response) => {
      personnelOptions.value = response.rows || [];
      personnelLoading.value = false;
    })
    .catch(() => {
      personnelOptions.value = [];
      personnelLoading.value = false;
    });
}

/** 人员搜索 */
function searchPersonnelForQuery(query) {
  personnelLoading.value = true;
  listPersonnel({
    type: 3,
    name: query,
  })
    .then((response) => {
      personnelOptions.value = response.rows || [];
      personnelLoading.value = false;
    })
    .catch(() => {
      personnelOptions.value = [];
      personnelLoading.value = false;
    });
}

/** 搜索车间（用于查询条件） */
function searchWorkshop(query) {
  workshopLoading.value = true;
  listByNameOrContact({ workshopName: query })
    .then((response) => {
      workshopOptions.value = response.rows;
      workshopLoading.value = false;
    })
    .catch(() => {
      workshopLoading.value = false;
    });
}

/** 搜索车间（用于表单） */
function searchWorkshopForForm(query) {
  workshopLoadingForForm.value = true;
  listByNameOrContact({ workshopName: query })
    .then((response) => {
      workshopOptionsForForm.value = response.rows;
      workshopLoadingForForm.value = false;
    })
    .catch(() => {
      workshopLoadingForForm.value = false;
    });
}

function handleWorkshopChange(workshopId) {
  const selectedWorkshop = workshopOptionsForForm.value.find(
    (item) => item.workshopId === workshopId,
  );
  const defaultHandlerName =
    selectedWorkshop?.defaultHandlerPersonnelName || null;

  form.value.picker = defaultHandlerName;
}

/**
 * 处理物料选择事件
 */
async function handleMaterialSelect(val, index) {
  const material = materialOptions.value.find(
    (item) => item.materialId === val,
  );
  const detail = form.value.details[index];
  if (detail) {
    detail.selectedUnitCost = "";
    detail.priceLayerOptions = [];
    detail.unitPrice = null;
    detail.amount = null;
  }
  if (material) {
    // 设置领料数量为当前库存量
    form.value.details[index].quantity = material.currentQty;
    form.value.details[index].remark = null;
    // 调用统一处理方法
    handleMaterialOrQuantityChange(val, material.currentQty, index);
  } else {
    // 如果没有找到物料，仍然调用统一处理方法
    handleMaterialOrQuantityChange(val, undefined, index);
  }
  await loadPriceLayerOptions(form.value.details[index]);
}

/**
 * 处理物料或数量变化的统一方法
 */
function handleMaterialOrQuantityChange(materialId, quantity, index) {
  // 更新表单数据
  if (materialId !== undefined) {
    form.value.details[index].materialId = materialId;
  }
  if (quantity !== undefined) {
    form.value.details[index].quantity = quantity;
  }
  updateLineAmount(form.value.details[index]);
}

function formatMoneyDisplay(value) {
  if (value === null || value === undefined || value === "") {
    return "-";
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed.toFixed(2) : "-";
}

function toInputString(value) {
  if (value === null || value === undefined || value === "") {
    return "";
  }
  return String(value);
}

function updateLineAmount(row) {
  if (!row) {
    return;
  }
  row.unitPrice = row.selectedUnitCost || null;
  const quantity = Number(row.quantity ?? 0);
  const unitPrice = Number(row.unitPrice ?? 0);
  row.amount =
    row.selectedUnitCost && quantity > 0 && Number.isFinite(unitPrice)
      ? Number((quantity * unitPrice).toFixed(2))
      : null;
}

function handlePriceLayerChange(row) {
  updateLineAmount(row);
}

async function loadPriceLayerOptions(row) {
  if (!row?.materialId) {
    if (row) {
      row.priceLayerOptions = [];
      row.selectedUnitCost = "";
      updateLineAmount(row);
    }
    return;
  }

  row.priceLayerLoading = true;
  try {
    const response = await request({
      url: "/api/inventory/price-layers",
      method: "get",
      params: {
        materialId: row.materialId,
        stockScope: "MAIN",
      },
    });
    const layers = Array.isArray(response.data) ? response.data : [];
    row.priceLayerOptions = layers.map((item) => ({
      unitCost: toInputString(item.unitCost),
      availableQty: toInputString(item.availableQty),
    }));
    const selectedUnitCost = toInputString(row.selectedUnitCost);
    const hasSelectedLayer =
      selectedUnitCost &&
      row.priceLayerOptions.some((item) => item.unitCost === selectedUnitCost);
    if (selectedUnitCost && !hasSelectedLayer) {
      row.priceLayerOptions.unshift({
        unitCost: selectedUnitCost,
        availableQty: "-",
      });
    } else if (!selectedUnitCost && row.priceLayerOptions.length === 1) {
      row.selectedUnitCost = row.priceLayerOptions[0].unitCost;
    }
    updateLineAmount(row);
  } catch (error) {
    row.priceLayerOptions = [];
    console.error("加载成本价层失败:", error);
  } finally {
    row.priceLayerLoading = false;
  }
}

/**
 * 获取物料最大可领料数量
 */
function getMaxQuantity(row) {
  // 如果没有选择物料，返回默认最大值
  if (!row.materialId) {
    return 0;
  }

  // 查找所选物料的当前库存
  const selectedMaterial = materialOptions.value.find(
    (item) => item.materialId === row.materialId,
  );

  // 如果找到物料且有库存信息，返回库存量，否则返回默认最大值
  return selectedMaterial && selectedMaterial.currentQty !== undefined
    ? selectedMaterial.currentQty
    : 0;
}

/**
 * 审核操作
 */
function handleAudit(status) {
  const auditData = {
    documentType: 3,
    documentId: detailData.value.pickId,
    auditStatus: status,
  };

  approvalDocument(auditData)
    .then((response) => {
      proxy.$modal.msgSuccess(status === 1 ? "审核通过" : "审核不通过");
      detailOpen.value = false;
      getList();
    })
    .catch((error) => {
      console.error("审核操作失败:", error);
      proxy.$modal.msgError("审核操作失败");
    });
}

getList();

/** ========== AI 助手预填充 ========== */
const aiActionStore = useAiActionStore();
const route = useRoute();

async function handleAiPrefill(formData) {
  await handleAdd();
  await nextTick();

  if (formData.remark) form.value.remark = formData.remark;

  // 领料人
  if (formData.picker) {
    try {
      const res = await listPersonnel({ type: 3, name: formData.picker });
      personnelOptions.value = res.rows || [];
      form.value.picker =
        res.rows?.length > 0 ? res.rows[0].name : formData.picker;
    } catch {
      form.value.picker = formData.picker;
    }
  }

  // 车间
  if (formData.workshopName) {
    try {
      const res = await listByNameOrContact({
        workshopName: formData.workshopName,
      });
      workshopOptionsForForm.value = res.rows || [];
      if (res.rows?.length > 0) {
        form.value.workshopId = res.rows[0].workshopId;
        if (!formData.picker) {
          handleWorkshopChange(res.rows[0].workshopId);
        }
      }
    } catch {
      /* 静默处理 */
    }
  }

  // 物料明细（兼容单条物料的扁平字段）
  const normalizedDetails =
    Array.isArray(formData.details) && formData.details.length > 0
      ? formData.details
      : formData.materialName || formData.materialCode
        ? [
            {
              materialName: formData.materialName || formData.materialCode,
              quantity:
                formData.quantity ?? formData.qty ?? formData.count ?? null,
              remark: formData.detailRemark || "",
            },
          ]
        : [];

  if (normalizedDetails.length > 0) {
    form.value.details = [];
    for (const item of normalizedDetails) {
      let quantity = null;
      if (item.quantity === 0 || item.quantity === "0") {
        quantity = 0;
      } else if (item.quantity) {
        const num = Number(item.quantity);
        quantity = Number.isNaN(num) ? null : num;
      }
      const row = {
        detailId: null,
        materialId: null,
        selectedUnitCost: "",
        priceLayerOptions: [],
        priceLayerLoading: false,
        unitPrice: null,
        quantity,
        amount: null,
        remark: item.remark || null,
      };
      if (item.materialName) {
        try {
          const matRes = await selectSaifuteInventoryListGroupByMaterial({
            materialCode: item.materialName,
            currentQty: 0,
          });
          materialOptions.value = mergeMaterialOptions(
            matRes.rows || [],
            materialOptions.value,
          );
          if (matRes.rows?.length > 0) {
            row.materialId = matRes.rows[0].materialId;
          }
        } catch {
          /* 静默处理 */
        }
      }
      form.value.details.push(row);
      if (row.materialId) {
        await loadPriceLayerOptions(row);
      }
    }
    // 同步物料和数量
    for (let i = 0; i < form.value.details.length; i++) {
      const d = form.value.details[i];
      if (d.materialId && d.quantity) {
        handleMaterialOrQuantityChange(d.materialId, d.quantity, i);
      }
    }
  }
}

function checkAiAction() {
  const action = aiActionStore.pendingAction;
  if (!action || action.type !== "openForm" || !action.formData) return;
  if (action.path && action.path !== route.path) return;
  const consumed = aiActionStore.consumeAction();
  if (consumed?.formData) handleAiPrefill(consumed.formData);
}
onMounted(() => checkAiAction());
onActivated(() => checkAiAction());
watch(
  () => aiActionStore.pendingAction,
  () => checkAiAction(),
);
</script>
