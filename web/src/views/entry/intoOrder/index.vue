<template>
  <div class="app-container">
    <el-form :model="queryParams" ref="queryRef" :inline="true" v-show="showSearch" label-width="68px">
      <el-form-item label="入库单号" prop="intoNo">
        <el-input
          v-model="queryParams.intoNo"
          placeholder="请输入入库单号"
          clearable
          style="width: 240px"
          @keyup.enter="handleQuery"
        />
      </el-form-item>
      <el-form-item label="入库日期" style="width: 308px">
        <el-date-picker
          v-model="dateRange"
          type="daterange"
          range-separator="-"
          start-placeholder="开始日期"
          end-placeholder="结束日期"
          value-format="YYYY-MM-DD"
          clearable
        ></el-date-picker>
      </el-form-item>
      <el-form-item label="部门" prop="workshopId">
        <el-select v-model="queryParams.workshopId" filterable remote reserve-keyword placeholder="请输入部门名称搜索"
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
      <el-form-item label="经办人" prop="attn">
        <combo-input v-model="queryParams.attn" scope="personnel" field="personnelName" placeholder="请选择或输入经办人" width="240px" />
      </el-form-item>
	    <el-form-item label="物料" prop="materialId">
		    <el-select
			    v-model="queryParams.materialId"
			    filterable
			    remote
			    reserve-keyword
			    placeholder="请输入物料名称或规格型号搜索"
			    :remote-method="searchMaterial"
			    clearable
			    style="width: 240px">
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
	    </el-form-item>
	    <el-form-item label="物料名称" prop="materialName">
		    <combo-input v-model="queryParams.materialName" scope="material" field="materialName" placeholder="请选择或输入物料名称" width="240px" />
	    </el-form-item>
	    <el-form-item label="生产编号" prop="interval">
		    <el-input
			    v-model="queryParams.interval"
			    placeholder="请输入生产编号(只能输入数字和-)"
			    clearable
			    style="width: 240px"
			    @keyup.enter="handleQuery"
			    @input="handleIntervalInputQuery"
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
          v-hasPermi="['entry:intoOrder:add']"
        >新增</el-button>
      </el-col>
      <right-toolbar v-model:showSearch="showSearch" @queryTable="getList" :columns="columns"></right-toolbar>
    </el-row>

    <adaptive-table border stripe v-loading="loading" :data="intoOrderList" @row-click="handleRowClick">
      <el-table-column type="index" width="50" align="center" />
      <el-table-column sortable show-overflow-tooltip label="入库单号" align="center" prop="intoNo" v-if="columns[0].visible">
        <template #default="scope">
          <el-button link type="primary" :underline="false" @click.stop="handleDetail(scope.row)">
            {{ scope.row.intoNo }}
          </el-button>
        </template>
      </el-table-column>
      <el-table-column sortable show-overflow-tooltip label="入库日期" align="center" prop="intoDate" width="180" v-if="columns[1].visible">
        <template #default="scope">
          <el-button link type="primary" :underline="false" @click.stop="handleDetail(scope.row)">
            {{ parseTime(scope.row.intoDate, '{y}-{m}-{d}') }}
          </el-button>
        </template>
      </el-table-column>
      <el-table-column sortable show-overflow-tooltip label="总金额" align="center" prop="totalAmount" v-if="columns[2].visible" >
	      <template #default="scope">
		      <el-button link type="primary" :underline="false" @click.stop="handleDetail(scope.row)">
			      {{ scope.row.totalAmount }}
		      </el-button>
	      </template>
      </el-table-column>
	    <el-table-column sortable show-overflow-tooltip label="部门" align="center" prop="workshopName" v-if="columns[3].visible">
		    <template #default="scope">
			    <el-button link type="primary" :underline="false" @click="handleViewWorkshop(scope.row.workshopId)">
				    {{ scope.row.workshopName }}
			    </el-button>
		    </template>
	    </el-table-column>
      <el-table-column sortable show-overflow-tooltip label="负责人" align="center" prop="chargeBy" v-if="columns[4].visible">
        <template #default="scope">
          <el-button link type="primary" :underline="false" @click.stop="handleDetail(scope.row)">
            {{ scope.row.chargeBy }}
          </el-button>
        </template>
      </el-table-column>
      <el-table-column sortable show-overflow-tooltip label="经办人" align="center" prop="attn" v-if="columns[5].visible">
        <template #default="scope">
          <el-button link type="primary" :underline="false" @click.stop="handleDetail(scope.row)">
            {{ scope.row.attn }}
          </el-button>
        </template>
      </el-table-column>
      <el-table-column sortable show-overflow-tooltip label="创建人" align="center" prop="createBy" v-if="columns[6].visible">
        <template #default="scope">
          <el-button link type="primary" :underline="false" @click.stop="handleDetail(scope.row)">
            {{ scope.row.createBy }}
          </el-button>
        </template>
      </el-table-column>
      <el-table-column sortable show-overflow-tooltip label="审核结果" align="center" prop="auditStatus" v-if="columns[7].visible">
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
          <el-button link type="primary" icon="Edit" @click="handleUpdate(scope.row)" v-hasPermi="['entry:intoOrder:edit']" v-if="scope.row.auditStatus !== '1' && (username === scope.row.createBy || username === 'admin')">修改</el-button>
          <el-button link type="primary" icon="Delete" @click.stop="handleDelete(scope.row)" v-hasPermi="['entry:intoOrder:remove']" v-if="username === scope.row.createBy || username === 'admin'">作废</el-button>
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

    <!-- 添加或修改入库单对话框 -->
    <el-dialog :title="title" v-model="open" width="1200px" append-to-body draggable>
      <el-form ref="intoOrderRef" :model="form" :rules="rules" label-width="80px" v-loading="dialogLoading">
        <el-row>
          <el-col :span="12">
            <el-form-item label="入库单号" prop="intoNo">
              <el-input v-model="form.intoNo" placeholder="请输入入库单号" :disabled="form.intoId != null"/>
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="入库日期" prop="intoDate">
              <el-date-picker clearable
                v-model="form.intoDate"
                type="date"
                value-format="YYYY-MM-DD"
                placeholder="请选择入库日期"
                @change="handleDateChange"
                :disabled="form.intoId != null">
              </el-date-picker>
            </el-form-item>
          </el-col>
        </el-row>
        <el-row>
          <el-col :span="12">
	          <el-form-item label="部门" prop="workshopId">
		          <el-select
			          v-model="form.workshopId"
			          filterable
			          remote
			          reserve-keyword
			          placeholder="请输入部门名称搜索"
			          :remote-method="searchWorkshopForForm"
			          :loading="workshopLoadingForForm"
			          style="width: 100%"
			          :disabled="form.intoId != null"
			          @change="handleWorkshopChange">
			          <el-option
				          v-for="item in workshopOptions"
				          :key="item.workshopId"
				          :label="item.workshopName"
				          :value="item.workshopId">
				          <span style="float: left">{{ item.workshopName }}</span>
			          </el-option>
		          </el-select>
	          </el-form-item>
          </el-col>
          <el-col :span="12">
	          <el-form-item label="经办人" prop="attn">
		          <combo-input v-model="form.attn" scope="personnel" field="personnelName" placeholder="请选择或输入经办人" :disabled="form.intoId != null" />
	          </el-form-item>
          </el-col>
        </el-row>
        <el-row>
          <el-col :span="12">
	          <el-form-item label="负责人" prop="chargeBy">
		          <combo-input v-model="form.chargeBy" scope="personnel" field="personnelName" placeholder="请选择或输入负责人" :disabled="form.intoId != null" />
	          </el-form-item>
          </el-col>
          <el-col :span="12">
	          <el-form-item label="总金额" prop="totalAmount">
		          <el-input v-model="form.totalAmount" placeholder="自动计算" disabled />
	          </el-form-item>
          </el-col>
        </el-row>
        <el-form-item label="备注" prop="remark">
          <el-input v-model="form.remark" type="textarea" placeholder="请输入内容" :disabled="form.intoId != null"/>
        </el-form-item>
      </el-form>
      
      <!-- 明细列表 -->
      <div style="margin-top: 20px;">
        <el-table :data="detailList" border stripe v-loading="dialogLoading">
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
                :disabled="form.intoId != null"
                @change="(val) => handleMaterialChange(val, scope.$index)">
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
	        <el-table-column label="生产编号" prop="interval">
		        <template #default="scope">
			        <el-input
				        v-model="scope.row.interval"
				        type="textarea" :autosize="{ minRows: 1 }"
				        placeholder="请输入生产编号"
				        :disabled="form.intoId != null"
				        @change="handleIntervalInput(scope.row)"
			        />
		        </template>
	        </el-table-column>
          <el-table-column label="入库数量" prop="quantity">
            <template #default="scope">
              <el-input-number v-model="scope.row.quantity" placeholder="入库数量" controls-position="right" :disabled="form.intoId != null" style="width: 100%" @change="calculateTotalAmount" />
            </template>
          </el-table-column>
          <el-table-column label="单价" prop="unitPrice">
            <template #default="scope">
              <el-input-number v-model="scope.row.unitPrice" :min="0" placeholder="单价" controls-position="right" style="width: 100%" @change="calculateTotalAmount" />
            </template>
          </el-table-column>
          <el-table-column label="备注" prop="remark">
            <template #default="scope">
              <el-input v-model="scope.row.remark"
                        type="textarea" :autosize="{ minRows: 1 }" placeholder="请输入备注" :disabled="form.intoId != null" />
            </template>
          </el-table-column>
          <el-table-column label="操作" align="center" class-name="small-padding fixed-width">
            <template #default="scope">
              <el-button link type="primary" icon="Delete" @click="removeDetailItem(scope.$index)" :disabled="form.intoId != null">删除</el-button>
            </template>
          </el-table-column>
        </el-table>
      </div>
	    <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 10px; padding-right: 20px">
	      <el-button type="primary" plain icon="Plus" @click="addDetailItem" :disabled="form.intoId != null">添加明细</el-button>
        <span>合计金额: {{ form.totalAmount }}</span>
      </div>
      
      <template #footer>
        <div class="dialog-footer">
          <el-button type="primary" @click="cancel" v-if="isView">返回</el-button>
          <el-button type="primary" @click="submitForm" v-else :loading="submitLoading">确 定</el-button>
          <el-button @click="cancel">取 消</el-button>
        </div>
      </template>
    </el-dialog>
    
    <!-- 入库单详情对话框 -->
    <el-dialog title="入库单详情" v-model="detailOpen" width="800px" append-to-body>
      <el-row :gutter="10">
        <el-col :span="24">
          <el-card class="box-card">
            <template #header>
              <div class="card-header">
                <span>入库单信息</span>
              </div>
            </template>
            <el-descriptions :column="2" border>
              <el-descriptions-item label="入库单号">{{ detailData.intoNo }}</el-descriptions-item>
              <el-descriptions-item label="入库日期">{{ parseTime(detailData.intoDate, '{y}-{m}-{d}') }}</el-descriptions-item>
              <el-descriptions-item label="总金额">{{ detailData.totalAmount }}</el-descriptions-item>
              <el-descriptions-item label="部门">{{ detailData.workshopName }}</el-descriptions-item>
              <el-descriptions-item label="负责人">{{ detailData.chargeBy }}</el-descriptions-item>
              <el-descriptions-item label="经办人">{{ detailData.attn }}</el-descriptions-item>
              <el-descriptions-item label="创建人">{{ detailData.createBy }}</el-descriptions-item>
              <el-descriptions-item label="创建时间">{{ parseTime(detailData.createTime, '{y}-{m}-{d} {h}:{i}:{s}') }}</el-descriptions-item>
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
			      <el-table :data="detailData.details" border stripe>
				      <el-table-column label="物料编码" prop="material.materialCode" />
				      <el-table-column label="物料名称" prop="material.materialName" />
				      <el-table-column label="规格型号" prop="material.specification" />
				      <el-table-column label="入库数量" prop="quantity" />
				      <el-table-column label="单价" prop="unitPrice" />
				      <el-table-column show-overflow-tooltip label="生产编号" prop="interval" />
				      <el-table-column label="备注" prop="remark" />
			      </el-table>
			      <div style="margin-top: 10px; text-align: right; padding-right: 20px">
				      <span>合计金额: {{ detailData.totalAmount }}</span>
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
            :loading="submitLoading"
          >
            通过
          </el-button>
          <el-button
            type="danger" v-hasPermi="['approval:document:reject']"
            v-if="(detailData.auditStatus === '0' || detailData.auditStatus === 0) && (username !== detailData.createBy || username === 'admin')"
            @click="handleAudit(2)"
            :loading="submitLoading"
          >
            不通过
          </el-button>
          <el-button @click="detailOpen = false">关 闭</el-button>
        </div>
      </template>
    </el-dialog>
    
    <!-- 作废对话框 -->
    <el-dialog title="作废入库单" v-model="abandonOpen" width="500px" append-to-body>
      <el-form ref="abandonRef" :model="abandonForm" :rules="abandonRules">
        <el-form-item label="作废说明" prop="voidDescription">
          <el-input type="textarea" v-model="abandonForm.voidDescription" placeholder="请输入作废说明" />
        </el-form-item>
      </el-form>
      <template #footer>
        <div class="dialog-footer">
          <el-button type="primary" @click="submitAbandonForm" :loading="submitLoading">确 定</el-button>
          <el-button @click="cancelAbandon">取 消</el-button>
        </div>
      </template>
    </el-dialog>
	  
	  <!-- 部门详情对话框 -->
	  <el-dialog title="部门详情" v-model="workshopOpen" width="500px" append-to-body>
		  <el-descriptions :column="1" border>
			  <el-descriptions-item label="部门名称">{{ workshopDetail.workshopName }}</el-descriptions-item>
			  <el-descriptions-item label="经办人">{{ workshopDetail.contactPerson }}</el-descriptions-item>
			  <el-descriptions-item label="负责人">{{ workshopDetail.chargeBy }}</el-descriptions-item>
		  </el-descriptions>
		  <template #footer>
			  <div class="dialog-footer">
				  <el-button @click="workshopOpen = false">关 闭</el-button>
			  </div>
		  </template>
	  </el-dialog>
  </div>
</template>

<script setup name="IntoOrder">
import { approvalDocument } from "@/api/approval/approval";
import { listMaterialByCodeOrName } from "@/api/base/material";
import { listPersonnel } from "@/api/base/personnel";
import { clearSuggestionsCache } from "@/api/base/suggestions";
import { getWorkshop, listByNameOrContact } from "@/api/base/workshop";
import { getLatestIntoDetailByMaterialId } from "@/api/entry/intoDetail";
import {
  abandonIntoOrder,
  addIntoOrder,
  getIntoOrder,
  listIntoOrder,
  updateIntoOrder,
} from "@/api/entry/intoOrder";
import useAiActionStore from "@/store/modules/aiAction";
import useUserStore from "@/store/modules/user";
import { formatDateToYYYYMMDD, generateOrderNo } from "@/utils/orderNumber";

const { proxy } = getCurrentInstance();

const intoOrderList = ref([]);
const detailOpen = ref(false);
const open = ref(false);
const loading = ref(true);
const showSearch = ref(true);
const ids = ref([]);
const single = ref(true);
const multiple = ref(true);
const total = ref(0);
const title = ref("");
const isView = ref(false);
const abandonOpen = ref(false);
const dateRange = ref([]);
const workshopOptions = ref([]);
const workshopLoading = ref(false);
const workshopLoadingForForm = ref(false);

// 人员信息相关
const personnelOptions = ref([]);
const personnelLoading = ref(false);

// 明细相关
const detailList = ref([]);
const materialOptions = ref([]);
const materialLoading = ref(false);

const workshopDetail = ref({});
const workshopOpen = ref(false);
const submitLoading = ref(false);
const dialogLoading = ref(false);

// 详情数据
const detailData = ref({});

const data = reactive({
  form: {},
  queryParams: {
    pageNum: 1,
    pageSize: 30,
    intoNo: null,
    intoDate: null,
    workshopId: null,
    materialId: null,
    materialName: null,
    interval: null,
  },
  rules: {
    intoNo: [{ required: true, message: "入库单号不能为空", trigger: "blur" }],
    intoDate: [
      { required: true, message: "入库日期不能为空", trigger: "change" },
    ],
    workshopId: [{ required: true, message: "部门不能为空", trigger: "blur" }],
    attn: [{ required: true, message: "经办人不能为空", trigger: "blur" }],
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
  { key: 0, label: `入库单号`, visible: true },
  { key: 1, label: `入库日期`, visible: true },
  { key: 2, label: `总金额`, visible: true },
  { key: 3, label: `部门`, visible: true },
  { key: 4, label: `负责人`, visible: false },
  { key: 5, label: `经办人`, visible: true },
  { key: 6, label: `创建人`, visible: false },
  { key: 7, label: `审核结果`, visible: true },
]);

/** 查询入库单列表 */
function getList() {
  loading.value = true;
  const params = { ...queryParams.value };
  listIntoOrder(proxy.addDateRange(queryParams.value, dateRange.value)).then(
    (response) => {
      intoOrderList.value = response.rows;
      total.value = response.total;
      loading.value = false;
    },
  );
}

/** 搜索部门（用于查询条件） */
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

/** 搜索部门（用于表单） */
function searchWorkshopForForm(query) {
  workshopLoadingForForm.value = true;
  listByNameOrContact({ workshopName: query })
    .then((response) => {
      workshopOptions.value = response.rows;
      workshopLoadingForForm.value = false;
    })
    .catch(() => {
      workshopLoadingForForm.value = false;
    });
}

/** 搜索人员信息 */
function searchPersonnel(query) {
  personnelLoading.value = true;
  listPersonnel({
    type: 2,
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

/** 查询物料 */
function searchMaterial(query) {
  materialLoading.value = true;
  listMaterialByCodeOrName({
    materialCode: query,
  })
    .then((response) => {
      materialOptions.value = response.rows;
      materialLoading.value = false;
    })
    .catch(() => {
      materialLoading.value = false;
    });
}

/**
 * 为明细行查询物料（支持过滤已选项）
 */
function searchMaterialForDetail(query, rowIndex) {
  materialLoading.value = true;
  listMaterialByCodeOrName({
    materialCode: query,
  })
    .then((response) => {
      materialOptions.value = response.rows;
      materialLoading.value = false;
    })
    .catch(() => {
      materialLoading.value = false;
    });
}

/** 取消按钮 */
function cancel() {
  open.value = false;
  reset();
}

/** 表单重置 */
function reset() {
  form.value = {
    intoId: null,
    intoNo: null,
    intoDate: null,
    workshopId: null,
    chargeBy: null,
    attn: null,
    totalAmount: null,
    remark: null,
    details: [],
  };
  detailList.value = [
    {
      materialId: null,
      quantity: null,
      unitPrice: null,
      remark: "",
      subtotal: "0.00",
    },
  ];
  materialOptions.value = [];
  materialLoading.value = false;
  proxy.resetForm("intoOrderRef");
}

/** 重置查询条件 */
function resetQuery() {
  dateRange.value = [];
  proxy.resetForm("queryRef");
  handleQuery();
}

/** 搜索按钮操作 */
function handleQuery() {
  queryParams.value.pageNum = 1;
  getList();
}

/** 添加明细项 */
function addDetailItem() {
  detailList.value.push({
    materialId: null,
    quantity: null,
    unitPrice: null,
    interval: null,
    remark: "",
    subtotal: "0.00",
  });
  calculateTotalAmount();
}

/** 删除明细项 */
function removeDetailItem(index) {
  detailList.value.splice(index, 1);
  calculateTotalAmount();
}

/** 处理物料变更 */
function handleMaterialChange(val, index) {
  if (val) {
    // 调用后端接口获取最新的验收单明细数据
    getLatestIntoDetailByMaterialId(val)
      .then((response) => {
        if (response.data) {
          // 将获取到的单价设置到当前行
          detailList.value[index].unitPrice = response.data.unitPrice;
          // 重新计算总金额
          calculateTotalAmount();
        }
      })
      .catch((error) => {
        console.error("获取物料最新单价失败:", error);
        proxy.$modal.msgError("获取物料最新单价失败");
      });
  }
}

/** 计算小计和总金额 */
function calculateTotalAmount() {
  let total = 0;
  detailList.value.forEach((item) => {
    if (item.quantity && item.unitPrice) {
      item.subtotal = (item.quantity * item.unitPrice).toFixed(2);
      total += parseFloat(item.subtotal);
    } else {
      item.subtotal = "0.00";
    }
  });
  form.value.totalAmount = total.toFixed(2);
}

// 多选框选中数据
function handleSelectionChange(selection) {
  ids.value = selection.map((item) => item.intoId);
  single.value = selection.length !== 1;
  multiple.value = !selection.length;
}

/** 查看详情 */
function handleDetail(row) {
  getIntoOrder(row.intoId).then((response) => {
    detailData.value = response.data;
    // 确保明细数据被正确加载
    if (response.data.details) {
      detailData.value.details = response.data.details;
    }
    detailOpen.value = true;
  });
}

/** 查看部门详情 */
function handleViewWorkshop(workshopId) {
  if (!workshopId) return;
  getWorkshop(workshopId).then((response) => {
    workshopDetail.value = response.data;
    workshopOpen.value = true;
  });
}

/** 新增按钮操作 */
function handleAdd() {
  reset();
  const today = new Date();
  form.value.intoDate = formatDateToYYYYMMDD(today);
  isView.value = false;
  title.value = "添加入库单";
  open.value = true;
  dialogLoading.value = true;
  generateIntoNo(today)
    .then((intoNo) => {
      form.value.intoNo = intoNo;
    })
    .finally(() => {
      dialogLoading.value = false;
    });
}

/**
 * 生成入库单号
 */
async function generateIntoNo(date) {
  // 查询当天已有的入库单号，找出最大流水号
  const params = {
    params: {
      beginTime: formatDateToYYYYMMDD(date),
      endTime: formatDateToYYYYMMDD(date),
    },
  };

  return generateOrderNo(date, "RK", listIntoOrder, params, "intoNo");
}

/**
 * 处理日期更改事件，重新生成入库单号
 */
async function handleDateChange(val) {
  if (val) {
    const newDate = new Date(val);
    const newIntoNo = await generateIntoNo(newDate);
    form.value.intoNo = newIntoNo;
  }
}

/** 修改按钮操作 */
function handleUpdate(row) {
  reset();
  isView.value = false;
  title.value = "修改入库单";
  open.value = true;
  dialogLoading.value = true;
  listMaterialByCodeOrName().then((response) => {
    materialOptions.value = response.rows;
  });
  searchWorkshopForForm();
  const intoId = row.intoId || ids.value[0];
  getIntoOrder(intoId)
    .then((response) => {
      const orderData = response.data;
      form.value = {
        intoId: orderData.intoId,
        intoNo: orderData.intoNo,
        intoDate: orderData.intoDate,
        supplierId: orderData.supplierId,
        workshopId: orderData.workshopId,
        chargeBy: orderData.chargeBy,
        attn: orderData.attn,
        totalAmount: orderData.totalAmount,
        remark: orderData.remark,
      };
      if (orderData.details && orderData.details.length > 0) {
        detailList.value = orderData.details.map((detail) => ({
          detailId: detail.detailId,
          materialId: detail.materialId,
          quantity: detail.quantity,
          unitPrice: detail.unitPrice,
          interval: detail.interval,
          subtotal:
            detail.quantity && detail.unitPrice
              ? (detail.quantity * detail.unitPrice).toFixed(2)
              : "0.00",
        }));
      }
    })
    .finally(() => {
      dialogLoading.value = false;
    });
}

/** 提交按钮 */
function submitForm() {
  proxy.$refs["intoOrderRef"].validate((valid) => {
    if (valid) {
      if (!detailList.value || detailList.value.length === 0) {
        proxy.$modal.msgError("至少需要添加一条明细");
        return;
      }

      for (let i = 0; i < detailList.value.length; i++) {
        const item = detailList.value[i];
        if (!item.materialId) {
          proxy.$modal.msgError(`第${i + 1}行物料编码不能为空`);
          return;
        }
        if (!item.quantity) {
          proxy.$modal.msgError(`第${i + 1}行入库数量不能为空`);
          return;
        }

        if (item.interval) {
          const illegalChars = item.interval.match(/[^0-9/\-、\\]/g);
          if (illegalChars) {
            proxy.$modal.msgError(
              `第${i + 1}行生产编号包含非法字符: ${[...new Set(illegalChars)].join(",")}。只允许输入数字、连字符(-)、斜杠(/)、顿号(、)和反斜杠(\\)`,
            );
            return;
          }
        }
      }

      form.value.details = detailList.value;
      submitLoading.value = true;

      if (form.value.intoId != null) {
        updateIntoOrder(form.value)
          .then((response) => {
            clearSuggestionsCache();
            proxy.$modal.msgSuccess("修改成功");
            open.value = false;
            getList();
          })
          .finally(() => {
            submitLoading.value = false;
          });
      } else {
        addIntoOrder(form.value)
          .then((response) => {
            clearSuggestionsCache();
            proxy.$modal.msgSuccess("新增成功");
            open.value = false;
            getList();
          })
          .finally(() => {
            submitLoading.value = false;
          });
      }
    }
  });
}

/** 作废按钮操作 */
function handleDelete(row) {
  abandonForm.value = {
    intoIds: row.intoId || ids.value,
    voidDescription: "",
  };
  abandonOpen.value = true;
  proxy.resetForm("abandonRef");
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
        intoId: abandonForm.value.intoIds,
        voidDescription: abandonForm.value.voidDescription,
      };
      submitLoading.value = true;
      abandonIntoOrder(abandonData)
        .then(() => {
          getList();
          abandonOpen.value = false;
          proxy.$modal.msgSuccess("作废成功");
        })
        .finally(() => {
          submitLoading.value = false;
        });
    }
  });
}

/** 处理审核操作 */
function handleAudit(status) {
  const auditData = {
    documentType: 2,
    documentId: detailData.value.intoId,
    auditStatus: status,
  };

  proxy.$modal
    .confirm(`确定要${status === 1 ? "审核通过" : "审核不通过"}该入库单吗？`)
    .then(() => {
      submitLoading.value = true;
      return approvalDocument(auditData);
    })
    .then(() => {
      proxy.$modal.msgSuccess(status === 1 ? "审核通过成功" : "审核不通过成功");
      detailOpen.value = false;
      getList();
    })
    .catch(() => {})
    .finally(() => {
      submitLoading.value = false;
    });
}

/** 导出按钮操作 */
function handleExport() {
  proxy.download(
    "entry/into/order/export",
    {
      ...queryParams.value,
    },
    `intoOrder_${new Date().getTime()}.xlsx`,
  );
}

/** 处理行点击事件 */
function handleRowClick(row) {
  // 可以在这里添加行点击事件的处理逻辑
}

/** 处理部门变更事件 */
function handleWorkshopChange(val) {
  if (val) {
    // 查找选中的部门信息
    const selectedWorkshop = workshopOptions.value.find(
      (item) => item.workshopId === val,
    );
    if (selectedWorkshop) {
      // 将部门的负责人赋值给负责人字段
      form.value.chargeBy = selectedWorkshop.chargeBy;
      // 将部门的经办人赋值给经办人字段
      form.value.attn = selectedWorkshop.contactPerson;
    }
  } else {
    // 清空部门时，也清空负责人和经办人
    form.value.chargeBy = "";
    form.value.attn = "";
  }
}

/** 处理生产编号输入限制 */
function handleIntervalInput(row) {
  if (row.interval) {
    // 检查是否有非法字符
    const illegalChars = row.interval.match(/[^0-9/\-、\\]/g);
    if (illegalChars) {
      // 提示用户
      proxy.$modal.msgWarning(
        `检测到非法字符: ${[...new Set(illegalChars)].join(",")}。只允许输入数字、斜杠(/)、连字符(-)、顿号(、)和反斜杠(\\)`,
      );
    }

    // 计算编号数量
    const count = calculateIntervalCount(row.interval);
    row.quantity = count;
    calculateTotalAmount();
    proxy.$modal.msgSuccess("入库数量已更新！");
  }
}

/** 处理生产编号输入限制 */
function handleIntervalInputQuery() {
  if (queryParams.value.interval) {
    // 检查是否有非法字符
    const illegalChars = queryParams.value.interval.match(/[^0-9/\-、\\]/g);
    if (illegalChars) {
      // 提示用户
      proxy.$modal.msgWarning(
        `检测到非法字符: ${[...new Set(illegalChars)].join(",")}。只允许输入数字、斜杠(/)、连字符(-)、顿号(、)和反斜杠(\\)`,
      );
    }
  }
}

/** 计算生产编号数量 */
function calculateIntervalCount(intervalStr) {
  if (!intervalStr) return 0;

  // 按照分隔符（斜杠、顿号、反斜杠）分割不同的编号段
  const segments = intervalStr.split(/[/、\\]/);
  let totalCount = 0;

  for (const segment of segments) {
    if (segment.includes("-")) {
      // 处理区间，如 53261-53270
      const [start, end] = segment.split("-").map(Number);
      if (!isNaN(start) && !isNaN(end) && start <= end) {
        totalCount += end - start + 1;
      }
    } else if (segment.trim()) {
      // 单个编号
      totalCount += 1;
    }
  }

  return totalCount;
}

getList();

/** ========== AI 助手预填充 ========== */
const aiActionStore = useAiActionStore();
const route = useRoute();

async function handleAiPrefill(formData) {
  await handleAdd();
  await nextTick();

  if (formData.chargeBy) form.value.chargeBy = formData.chargeBy;
  if (formData.remark) form.value.remark = formData.remark;

  // 经办人
  if (formData.attn) {
    try {
      const res = await listPersonnel({ type: 2, name: formData.attn });
      personnelOptions.value = res.rows || [];
      form.value.attn = res.rows?.length > 0 ? res.rows[0].name : formData.attn;
    } catch {
      form.value.attn = formData.attn;
    }
  }

  // 部门
  if (formData.workshopName) {
    try {
      const res = await listByNameOrContact({
        workshopName: formData.workshopName,
      });
      workshopOptionsForForm.value = res.rows || [];
      if (res.rows?.length > 0) form.value.workshopId = res.rows[0].workshopId;
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
              unitPrice: formData.unitPrice ?? null,
              interval: formData.interval ?? null,
              remark: formData.detailRemark || "",
            },
          ]
        : [];

  if (normalizedDetails.length > 0) {
    detailList.value = [];
    for (const item of normalizedDetails) {
      let quantity = null;
      if (item.quantity === 0 || item.quantity === "0") {
        quantity = 0;
      } else if (item.quantity) {
        const num = Number(item.quantity);
        quantity = Number.isNaN(num) ? null : num;
      }
      const row = {
        materialId: null,
        quantity,
        unitPrice: item.unitPrice || null,
        interval: item.interval || null,
        remark: item.remark || "",
        subtotal: "0.00",
      };
      if (item.materialName) {
        try {
          const matRes = await listMaterialByCodeOrName({
            materialCode: item.materialName,
          });
          materialOptions.value = matRes.rows || [];
          if (matRes.rows?.length > 0) {
            row.materialId = matRes.rows[0].materialId;
            if (!row.unitPrice) {
              try {
                const priceRes = await getLatestIntoDetailByMaterialId(
                  matRes.rows[0].materialId,
                );
                if (priceRes.data) row.unitPrice = priceRes.data.unitPrice;
              } catch {
                /* 静默处理 */
              }
            }
          }
        } catch {
          /* 静默处理 */
        }
      }
      detailList.value.push(row);
    }
    calculateTotalAmount();
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
