<template>
  <div class="app-container">
    <el-form :model="queryParams" ref="queryRef" :inline="true" v-show="showSearch" label-width="68px">
      <el-form-item label="验收单号" prop="inboundNo">
        <el-input
          v-model="queryParams.inboundNo"
          placeholder="请输入验收单号"
          clearable
          style="width: 240px"
          @keyup.enter="handleQuery"
        />
      </el-form-item>
      <el-form-item label="验收日期" style="width: 308px">
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
      <el-form-item label="供应商" prop="supplierId">
        <el-select v-model="queryParams.supplierId" filterable remote reserve-keyword placeholder="请输入供应商编码、名称或简称搜索"
                 :remote-method="searchSupplier" :loading="supplierLoading" style="width: 240px">
          <el-option
            v-for="item in supplierOptions"
            :key="item.supplierId"
            :label="item.supplierName"
            :value="item.supplierId">
            <span style="float: left">{{ item.supplierCode }}</span>
            <span style="float: left; margin-left: 10px;">{{ item.supplierName }}</span>
            <span style="float: right; color: #8492a6; font-size: 13px; margin-left: 20px;">{{ item.supplierShortName }}</span>
          </el-option>
        </el-select>
      </el-form-item>
	    <el-form-item label="关联部门" prop="workshopId">
		    <el-select v-model="queryParams.workshopId" filterable remote reserve-keyword placeholder="请输入关联部门名称搜索"
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
        <el-select
          v-model="queryParams.attn"
          filterable
          remote
          reserve-keyword
          placeholder="请输入经办人姓名搜索"
          :remote-method="searchPersonnel"
          :loading="personnelLoading"
          clearable
          style="width: 240px">
          <el-option
            v-for="item in personnelOptions"
            :key="item.personnelId"
            :label="item.name"
            :value="item.name">
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
		    <el-input
			    v-model="queryParams.materialName"
			    placeholder="请输入物料名称"
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
          v-hasPermi="['entry:order:add']"
        >新增</el-button>
      </el-col>
      <right-toolbar v-model:showSearch="showSearch" @queryTable="getList" :columns="columns"></right-toolbar>
    </el-row>

    <adaptive-table border stripe v-loading="loading" :data="orderList">
      <el-table-column type="index" width="50" align="center" />
      <el-table-column sortable show-overflow-tooltip label="验收单号" align="center" prop="inboundNo" v-if="columns[0].visible">
        <template #default="scope">
          <el-button link type="primary" :underline="false" @click.stop="handleDetail(scope.row)">
            {{ scope.row.inboundNo }}
          </el-button>
        </template>
      </el-table-column>
      <el-table-column sortable show-overflow-tooltip label="验收日期" align="center" prop="inboundDate" width="180" v-if="columns[1].visible">
        <template #default="scope">
          <el-button link type="primary" :underline="false" @click.stop="handleDetail(scope.row)">
            {{ parseTime(scope.row.inboundDate, '{y}-{m}-{d}') }}
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
	    <el-table-column sortable show-overflow-tooltip label="供应商" align="center" prop="supplierName" v-if="columns[3].visible">
		    <template #default="scope">
			    <el-button link type="primary" :underline="false" @click="handleViewSupplier(scope.row.supplierId)">
				    {{ scope.row.supplierName }}
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
	    <el-table-column sortable show-overflow-tooltip label="关联部门" align="center" prop="workshopName" v-if="columns[6].visible">
		    <template #default="scope">
			    <el-button link type="primary" :underline="false" @click="handleDetail(scope.row)">
				    {{ scope.row.workshopName }}
			    </el-button>
		    </template>
	    </el-table-column>
      <el-table-column sortable show-overflow-tooltip label="创建人" align="center" prop="createBy" v-if="columns[7].visible">
        <template #default="scope">
          <el-button link type="primary" :underline="false" @click.stop="handleDetail(scope.row)">
            {{ scope.row.createBy }}
          </el-button>
        </template>
      </el-table-column>
      <el-table-column sortable show-overflow-tooltip label="审核结果" align="center" prop="auditStatus" v-if="columns[8].visible">
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
	        <el-button link type="primary" icon="Edit" @click="handleUpdate(scope.row)" v-hasPermi="['entry:order:edit']" v-if="scope.row.auditStatus !== '1' && (username === scope.row.createBy || username === 'admin')">修改</el-button>
	        <el-button link type="primary" icon="Delete" @click.stop="handleDelete(scope.row)" v-hasPermi="['entry:order:remove']" v-if="username === scope.row.createBy || username === 'admin'">作废</el-button>
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

    <!-- 添加或修改验收单对话框 -->
    <el-dialog :title="title" v-model="open" width="1200px" append-to-body draggable>
      <el-form ref="orderRef" :model="form" :rules="rules" label-width="80px" v-loading="dialogLoading">
        <el-row>
          <el-col :span="12">
            <el-form-item label="验收单号" prop="inboundNo">
              <el-input v-model="form.inboundNo" placeholder="请输入验收单号" :disabled="form.inboundId != null"/>
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="验收日期" prop="inboundDate">
              <el-date-picker clearable
                v-model="form.inboundDate"
                type="date"
                value-format="YYYY-MM-DD"
                placeholder="请选择验收日期"
                @change="handleDateChange"
                :disabled="form.inboundId != null">
              </el-date-picker>
            </el-form-item>
          </el-col>
        </el-row>
        <el-row>
          <el-col :span="12">
	          <el-form-item label="经办人" prop="attn">
		          <el-select
			          v-model="form.attn"
			          filterable
			          remote
			          reserve-keyword
			          placeholder="请输入经办人姓名搜索"
			          :remote-method="searchPersonnel"
			          :loading="personnelLoading"
			          allow-create
			          default-first-option
			          style="width: 100%"
			          :disabled="form.inboundId != null">
			          <el-option
				          v-for="item in personnelOptions"
				          :key="item.personnelId"
				          :label="item.name"
				          :value="item.name">
			          </el-option>
		          </el-select>
	          </el-form-item>
          </el-col>
          <el-col :span="12">
	          <el-form-item label="关联部门" prop="workshopId">
		          <el-select
			          v-model="form.workshopId"
			          filterable
			          remote
			          reserve-keyword
			          placeholder="请输入关联部门名称搜索"
			          :remote-method="searchWorkshopForForm"
			          :loading="workshopLoadingForForm"
			          style="width: 100%"
			          :disabled="form.intoId != null">
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
        </el-row>
        <el-row>
          <el-col :span="12">
	          <el-form-item label="负责人" prop="chargeBy">
		          <el-input v-model="form.chargeBy" placeholder="请输入负责人" :disabled="form.inboundId != null"/>
	          </el-form-item>
          </el-col>
          <el-col :span="12">
	          <el-form-item label="供应商" prop="supplierId">
		          <el-select
			          v-model="form.supplierId"
			          filterable
			          remote
			          reserve-keyword
			          allow-create
			          placeholder="请输入供应商编码或名称或简称搜索"
			          :remote-method="searchSupplierForForm"
			          :loading="supplierLoadingForForm"
			          style="width: 100%"
			          >
			          <el-option
				          v-for="item in supplierOptionsForForm"
				          :key="item.supplierId"
				          :label="item.supplierName"
				          :value="item.supplierId">
				          <span style="float: left">{{ item.supplierCode }}</span>
				          <span style="float: left; margin-left: 10px;">{{ item.supplierName }}</span>
				          <span style="float: right; color: #8492a6; font-size: 13px; margin-left: 20px;">{{ item.supplierShortName }}</span>
			          </el-option>
		          </el-select>
	          </el-form-item>
          </el-col>
        </el-row>
	      <el-row>
		      <el-col :span="12">
			      <el-form-item label="总金额" prop="totalAmount">
				      <el-input v-model="form.totalAmount" placeholder="自动计算" disabled />
			      </el-form-item>
		      </el-col>
		      <el-col :span="12">
			      <el-form-item label="备注" prop="remark">
				      <el-input v-model="form.remark" type="textarea" placeholder="请输入内容" :disabled="form.inboundId != null"/>
			      </el-form-item>
		      </el-col>
	      </el-row>
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
                :disabled="form.inboundId != null"
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
          <el-table-column label="验收数量" prop="quantity">
            <template #default="scope">
              <el-input-number v-model="scope.row.quantity" placeholder="验收数量" controls-position="right" :disabled="form.inboundId != null" style="width: 100%" @change="calculateTotalAmount" />
            </template>
          </el-table-column>
          <el-table-column label="单价" prop="unitPrice">
            <template #default="scope">
              <el-input-number v-model="scope.row.unitPrice" :min="0" placeholder="单价" controls-position="right" style="width: 100%" @change="calculateTotalAmount" />
            </template>
          </el-table-column>
          <el-table-column label="含税价" prop="taxPrice">
            <template #default="scope">
              <el-input-number v-model="scope.row.taxPrice" :min="0" placeholder="含税价" controls-position="right" style="width: 100%" @change="calculateTotalAmount" />
            </template>
          </el-table-column>
          <el-table-column label="备注" prop="remark">
            <template #default="scope">
              <el-input v-model="scope.row.remark"
                        type="textarea" :autosize="{ minRows: 1 }" placeholder="请输入备注" :disabled="form.inboundId != null" />
            </template>
          </el-table-column>
          <el-table-column label="操作" align="center" class-name="small-padding fixed-width">
            <template #default="scope">
              <el-button link type="primary" icon="Delete" @click="removeDetailItem(scope.$index)" :disabled="form.inboundId != null">删除</el-button>
            </template>
          </el-table-column>
        </el-table>
      </div>
	    <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 10px; padding-right: 20px">
		    <el-button type="primary" plain icon="Plus" @click="addDetailItem" :disabled="form.inboundId != null">添加明细</el-button>
		    <span>合计金额: {{ form.totalAmount }}</span>
	    </div>
      
      <template #footer>
        <div class="dialog-footer">
          <el-button type="primary" @click="cancel" v-if="isView">返回</el-button>
          <el-button type="primary" @click="submitForm" v-else>确 定</el-button>
          <el-button @click="cancel">取 消</el-button>
        </div>
      </template>
    </el-dialog>
    
    <!-- 验收单详情对话框 -->
    <el-dialog title="验收单详情" v-model="detailOpen" width="800px" append-to-body>
      <el-row :gutter="10">
        <el-col :span="24">
          <el-card class="box-card">
            <template #header>
              <div class="card-header">
                <span>验收单信息</span>
              </div>
            </template>
            <el-descriptions :column="2" border>
              <el-descriptions-item label="验收单号">{{ detailData.inboundNo }}</el-descriptions-item>
              <el-descriptions-item label="验收日期">{{ parseTime(detailData.inboundDate, '{y}-{m}-{d}') }}</el-descriptions-item>
              <el-descriptions-item label="总金额">{{ detailData.totalAmount }}</el-descriptions-item>
              <el-descriptions-item label="供应商">{{ detailData.supplierName }}</el-descriptions-item>
              <el-descriptions-item label="负责人">{{ detailData.chargeBy }}</el-descriptions-item>
              <el-descriptions-item label="经办人">{{ detailData.attn }}</el-descriptions-item>
              <el-descriptions-item label="关联部门">{{ detailData.workshopName }}</el-descriptions-item>
              <el-descriptions-item label="创建人">{{ detailData.createBy }}</el-descriptions-item>
              <el-descriptions-item label="创建时间">{{ parseTime(detailData.createTime, '{y}-{m}-{d} {h}:{i}:{s}') }}</el-descriptions-item>
              <el-descriptions-item label="更新时间">{{ parseTime(detailData.updateTime, '{y}-{m}-{d} {h}:{i}:{s}') }}</el-descriptions-item>
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
              <el-table-column label="验收数量" prop="quantity" />
              <el-table-column label="单价" prop="unitPrice" />
              <el-table-column label="含税价" prop="taxPrice" />
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
		        type="success" v-hasPermi="['audit:document:add']"
		        v-if="(detailData.auditStatus === '0' || detailData.auditStatus === 0) && (username !== detailData.createBy || username === 'admin')"
		        @click="handleAudit(1)"
	        >
		        通过
	        </el-button>
	        <el-button
		        type="danger" v-hasPermi="['audit:document:add']"
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
    <el-dialog title="作废验收单" v-model="abandonOpen" width="500px" append-to-body>
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
	  
	  <!-- 供应商详情对话框 -->
	  <el-dialog title="供应商详情" v-model="supplierOpen" width="500px" append-to-body>
		  <el-descriptions :column="1" border>
			  <el-descriptions-item label="供应商编码">{{ supplierDetail.supplierCode }}</el-descriptions-item>
			  <el-descriptions-item label="供应商名称">{{ supplierDetail.supplierName }}</el-descriptions-item>
			  <el-descriptions-item label="简称">{{ supplierDetail.supplierShortName }}</el-descriptions-item>
			  <el-descriptions-item label="联系人">{{ supplierDetail.contactPerson }}</el-descriptions-item>
			  <el-descriptions-item label="联系方式">{{ supplierDetail.contactPhone }}</el-descriptions-item>
			  <el-descriptions-item label="地址">{{ supplierDetail.address }}</el-descriptions-item>
		  </el-descriptions>
		  <template #footer>
			  <div class="dialog-footer">
				  <el-button @click="supplierOpen = false">关 闭</el-button>
			  </div>
		  </template>
	  </el-dialog>
  </div>
</template>

<script setup name="Order">
import { auditDocument } from "@/api/audit/audit.js";
import { listMaterialByCodeOrName } from "@/api/base/material";
import { listPersonnel } from "@/api/base/personnel";
import { getSupplier, listSupplierByKeyword } from "@/api/base/supplier";
import { listByNameOrContact } from "@/api/base/workshop.js";
import { getLatestDetailByMaterialId, listDetail } from "@/api/entry/detail";
import {
  abandonOrder,
  addOrder,
  getOrder,
  listOrder,
  updateOrder,
} from "@/api/entry/order";
import useAiActionStore from "@/store/modules/aiAction";
import useUserStore from "@/store/modules/user";
import { formatDateToYYYYMMDD, generateOrderNo } from "@/utils/orderNumber";

const username = computed(() => useUserStore().name);

const { proxy } = getCurrentInstance();

const orderList = ref([]);
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
const supplierOptions = ref([]);
const supplierOptionsForForm = ref([]);
const supplierLoading = ref(false);
const supplierLoadingForForm = ref(false);

// 人员信息相关
const personnelOptions = ref([]);
const personnelLoading = ref(false);

// 明细相关
const detailList = ref([]);
const materialOptions = ref([]);
const materialLoading = ref(false);

const supplierDetail = ref({});
const supplierOpen = ref(false);
const dialogLoading = ref(false);

// 详情数据
const detailData = ref({});
const workshopOptions = ref([]);
const workshopOptionsForForm = ref([]);
const workshopLoading = ref(false);
const workshopLoadingForForm = ref(false);

const data = reactive({
  form: {},
  queryParams: {
    pageNum: 1,
    pageSize: 30,
    inboundNo: null,
    inboundDate: null,
    supplierId: null,
    workshopId: null,
    materialId: null,
    materialName: null,
  },
  rules: {
    inboundNo: [
      { required: true, message: "验收单号不能为空", trigger: "blur" },
    ],
    inboundDate: [
      { required: true, message: "验收日期不能为空", trigger: "change" },
    ],
  },
  abandonForm: {},
  abandonRules: {
    voidDescription: [
      { required: true, message: "作废说明不能为空", trigger: "blur" },
    ],
  },
});

const { queryParams, form, rules, abandonForm, abandonRules } = toRefs(data);

// 添加columns数组定义
const columns = ref([
  { key: 0, label: `验收单号`, visible: true },
  { key: 1, label: `验收日期`, visible: true },
  { key: 2, label: `总金额`, visible: true },
  { key: 3, label: `供应商`, visible: true },
  { key: 4, label: `负责人`, visible: false },
  { key: 5, label: `经办人`, visible: true },
  { key: 6, label: `关联部门`, visible: true },
  { key: 7, label: `创建人`, visible: false },
  { key: 8, label: `审核结果`, visible: true },
]);

/** 查询验收单列表 */
function getList() {
  loading.value = true;
  listOrder(proxy.addDateRange(queryParams.value, dateRange.value)).then(
    (response) => {
      orderList.value = response.rows;
      total.value = response.total;
      loading.value = false;
    },
  );
}

/** 搜索供应商（用于查询条件） */
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

/** 搜索供应商（用于表单） */
function searchSupplierForForm(query) {
  supplierLoadingForForm.value = true;
  listSupplierByKeyword(query)
    .then((response) => {
      supplierOptionsForForm.value = response.rows;
      supplierLoadingForForm.value = false;
    })
    .catch(() => {
      supplierLoadingForForm.value = false;
    });
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
      workshopOptionsForForm.value = response.rows;
      workshopLoadingForForm.value = false;
    })
    .catch(() => {
      workshopLoadingForForm.value = false;
    });
}

/** 搜索人员信息 */
function searchPersonnel(query) {
  personnelLoading.value = true;
  // 查询类型为1（内部员工）的人员信息
  listPersonnel({
    type: 1,
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
 * 为明细行查询物料
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
    inboundId: null,
    inboundNo: null,
    inboundDate: null,
    supplierId: null,
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
      taxPrice: null,
      remark: "",
      subtotal: "0.00",
    },
  ];
  materialOptions.value = [];
  materialLoading.value = false;
  proxy.resetForm("orderRef");
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
    taxPrice: null,
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
    getLatestDetailByMaterialId(val)
      .then((response) => {
        if (response.data) {
          // 将获取到的单价设置到当前行
          detailList.value[index].unitPrice = response.data.unitPrice;
          // 如果有含税价也一并设置
          if (response.data.taxPrice) {
            detailList.value[index].taxPrice = response.data.taxPrice;
          }
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
  ids.value = selection.map((item) => item.inboundId);
  single.value = selection.length !== 1;
  multiple.value = !selection.length;
}

/** 查看详情 */
function handleDetail(row) {
  getOrder(row.inboundId).then((response) => {
    detailData.value = response.data;
    // 确保明细数据被正确加载
    if (response.data.details) {
      detailData.value.details = response.data.details;
    } else {
      // 如果主表数据中没有明细，则通过API获取明细数据
      listDetail({ inboundId: row.inboundId }).then((res) => {
        detailData.value.details = res.rows;
      });
    }
    detailOpen.value = true;
  });
}

/** 查看供应商详情 */
function handleViewSupplier(supplierId) {
  if (!supplierId) return;
  getSupplier(supplierId).then((response) => {
    supplierDetail.value = response.data;
    supplierOpen.value = true;
  });
}

/** 新增按钮操作 */
function handleAdd() {
  reset();
  const today = new Date();
  form.value.inboundDate = formatDateToYYYYMMDD(today);
  isView.value = false;
  title.value = "添加验收单";
  open.value = true;
  dialogLoading.value = true;
  generateInboundNo(today)
    .then((inboundNo) => {
      form.value.inboundNo = inboundNo;
    })
    .finally(() => {
      dialogLoading.value = false;
    });
}

/**
 * 生成验收单号
 */
async function generateInboundNo(date) {
  // 查询当天已有的验收单号，找出最大流水号
  const params = {
    params: {
      beginTime: formatDateToYYYYMMDD(date),
      endTime: formatDateToYYYYMMDD(date),
    },
  };

  return generateOrderNo(date, "YS", listOrder, params, "inboundNo");
}

/**
 * 处理日期更改事件，重新生成验收单号
 */
async function handleDateChange(val) {
  if (val) {
    const newDate = new Date(val);
    const newInboundNo = await generateInboundNo(newDate);
    form.value.inboundNo = newInboundNo;
  }
}

/** 修改按钮操作 */
function handleUpdate(row) {
  reset();
  isView.value = false;
  title.value = "修改验收单";
  open.value = true;
  dialogLoading.value = true;
  searchWorkshopForForm();
  searchSupplierForForm();
  listMaterialByCodeOrName().then((response) => {
    materialOptions.value = response.rows;
  });
  const inboundId = row.inboundId || ids.value[0];
  getOrder(inboundId)
    .then((response) => {
      const orderData = response.data;
      form.value = {
        inboundId: orderData.inboundId,
        inboundNo: orderData.inboundNo,
        inboundDate: orderData.inboundDate,
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
          taxPrice: detail.taxPrice,
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
  proxy.$refs["orderRef"].validate((valid) => {
    if (valid) {
      // 验证明细至少有一条记录
      if (!detailList.value || detailList.value.length === 0) {
        proxy.$modal.msgError("至少需要添加一条明细");
        return;
      }

      // 验证每条明细的必填字段
      for (let i = 0; i < detailList.value.length; i++) {
        const item = detailList.value[i];
        if (!item.materialId) {
          proxy.$modal.msgError(`第${i + 1}行物料编码不能为空`);
          return;
        }
        if (!item.quantity) {
          proxy.$modal.msgError(`第${i + 1}行验收数量不能为空`);
          return;
        }
      }

      // 将明细数据添加到表单中
      form.value.details = detailList.value;

      // 检查当前选择的供应商是否存在于选项中
      const selectedSupplier = supplierOptionsForForm.value.find(
        (item) => String(item.supplierId) === String(form.value.supplierId),
      );
      // 如果不存在于现有选项中，且value不为空
      if (!selectedSupplier) {
        // 将value值赋给supplierName
        form.value.supplierName = form.value.supplierId;
        // 将supplierId置空
        form.value.supplierId = null;
      }

      // 直接提交表单，后端会处理经办人创建逻辑
      if (form.value.inboundId != null) {
        updateOrder(form.value).then((response) => {
          proxy.$modal.msgSuccess("修改成功");
          open.value = false;
          getList();
        });
      } else {
        addOrder(form.value).then((response) => {
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
  abandonForm.value = {
    inboundIds: row.inboundId || ids.value,
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
        inboundId: abandonForm.value.inboundIds,
        voidDescription: abandonForm.value.voidDescription,
      };
      abandonOrder(abandonData).then(() => {
        getList();
        abandonOpen.value = false;
        proxy.$modal.msgSuccess("作废成功");
      });
    }
  });
}

/** 导出按钮操作 */
function handleExport() {
  proxy.download(
    "entry/order/export",
    {
      ...queryParams.value,
    },
    `order_${new Date().getTime()}.xlsx`,
  );
}

/** 处理审核操作 */
function handleAudit(status) {
  const auditData = {
    documentType: 1,
    documentId: detailData.value.inboundId,
    auditStatus: status,
  };

  proxy.$modal
    .confirm(`确定要${status === 1 ? "审核通过" : "审核不通过"}该验收单吗？`)
    .then(() => {
      return auditDocument(auditData);
    })
    .then(() => {
      proxy.$modal.msgSuccess(status === 1 ? "审核通过成功" : "审核不通过成功");
      detailOpen.value = false;
      getList();
    })
    .catch(() => {});
}
getList();

/** ========== AI 助手预填充 ========== */
const aiActionStore = useAiActionStore();
const route = useRoute();

/**
 * 处理 AI 助手的表单预填充
 * 支持预填: supplierName, workshopName, attn, chargeBy, remark, details[{materialName, quantity, unitPrice, taxPrice, remark}]
 */
async function handleAiPrefill(formData) {
  // 1. 打开新增表单
  await handleAdd();
  await nextTick();

  // 2. 填入简单文本字段
  if (formData.chargeBy) form.value.chargeBy = formData.chargeBy;
  if (formData.remark) form.value.remark = formData.remark;

  // 3. 经办人 — 远程搜索并选中
  if (formData.attn) {
    try {
      const res = await listPersonnel({ type: 1, name: formData.attn });
      personnelOptions.value = res.rows || [];
      if (res.rows && res.rows.length > 0) {
        form.value.attn = res.rows[0].name;
      } else {
        form.value.attn = formData.attn;
      }
    } catch {
      form.value.attn = formData.attn;
    }
  }

  // 4. 供应商 — 远程搜索并选中
  if (formData.supplierName) {
    try {
      const res = await listSupplierByKeyword(formData.supplierName);
      supplierOptionsForForm.value = res.rows || [];
      if (res.rows && res.rows.length > 0) {
        form.value.supplierId = res.rows[0].supplierId;
      }
    } catch {
      /* 搜索失败静默处理 */
    }
  }

  // 5. 关联部门 — 远程搜索并选中
  if (formData.workshopName) {
    try {
      const res = await listByNameOrContact({
        workshopName: formData.workshopName,
      });
      workshopOptionsForForm.value = res.rows || [];
      if (res.rows && res.rows.length > 0) {
        form.value.workshopId = res.rows[0].workshopId;
      }
    } catch {
      /* 搜索失败静默处理 */
    }
  }

  // 6. 物料明细（兼容单条物料的扁平字段）
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
              taxPrice: formData.taxPrice ?? null,
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
        taxPrice: item.taxPrice || null,
        remark: item.remark || "",
        subtotal: "0.00",
      };
      if (item.materialName) {
        try {
          const matRes = await listMaterialByCodeOrName({
            materialCode: item.materialName,
          });
          materialOptions.value = matRes.rows || [];
          if (matRes.rows && matRes.rows.length > 0) {
            row.materialId = matRes.rows[0].materialId;
            if (!row.unitPrice) {
              try {
                const priceRes = await getLatestDetailByMaterialId(
                  matRes.rows[0].materialId,
                );
                if (priceRes.data) {
                  row.unitPrice = priceRes.data.unitPrice;
                  row.taxPrice = priceRes.data.taxPrice || row.taxPrice;
                }
              } catch {
                /* 获取单价失败静默处理 */
              }
            }
          }
        } catch {
          /* 搜索失败静默处理 */
        }
      }
      detailList.value.push(row);
    }
    calculateTotalAmount();
  }
}

// 检查并执行 AI 预填充
function checkAiAction() {
  const action = aiActionStore.pendingAction;
  if (!action || action.type !== "openForm" || !action.formData) return;
  if (action.path && action.path !== route.path) return;
  const consumed = aiActionStore.consumeAction();
  if (consumed && consumed.formData) handleAiPrefill(consumed.formData);
}
// 首次访问（onMounted）和缓存后再次访问（onActivated）都需要检查
onMounted(() => checkAiAction());
onActivated(() => checkAiAction());
watch(
  () => aiActionStore.pendingAction,
  () => checkAiAction(),
);
</script>
