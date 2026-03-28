<template>
	<div class="app-container">
		<el-form :model="queryParams" ref="queryRef" :inline="true" v-show="showSearch" label-width="68px">
			<el-form-item label="退料单号" prop="returnNo">
				<el-input
					v-model="queryParams.returnNo"
					placeholder="请输入退料单号"
					clearable
					style="width: 240px"
					@keyup.enter="handleQuery"
				/>
			</el-form-item>
			<el-form-item label="退料日期" style="width: 308px">
				<el-date-picker
					v-model="daterangeReturnDate"
					value-format="YYYY-MM-DD"
					type="daterange"
					range-separator="-"
					start-placeholder="开始日期"
					end-placeholder="结束日期"
				></el-date-picker>
			</el-form-item>
			<el-form-item label="退料部门" prop="workshopId">
				<el-select
					v-model="queryParams.workshopId"
					filterable
					remote
					reserve-keyword
					placeholder="请输入部门名称搜索"
					:remote-method="searchWorkshop"
					:loading="workshopLoading"
					style="width: 240px">
					<el-option
						v-for="item in workshopOptions"
						:key="item.workshopId"
						:label="item.workshopName"
						:value="item.workshopId">
						<span style="float: left">{{ item.workshopName }}</span>
					</el-option>
				</el-select>
			</el-form-item>
			<el-form-item label="退料类型" prop="sourceType">
				<el-select
					v-model="queryParams.sourceType"
					placeholder="请选择退料类型"
					clearable
					style="width: 240px">
					<el-option
						v-for="dict in source_type"
						:key="dict.value"
						:label="dict.label"
						:value="dict.value"
					/>
				</el-select>
			</el-form-item>
			<el-form-item label="领料单号" prop="sourceId">
				<el-input
					v-model="pickOrderNo"
					placeholder="请选择领料单"
					clearable
					style="width: 240px"
					@keyup.enter="handleQuery"
				>
					<template #append>
						<el-button icon="Search" @click="handleSelectPickOrderForSearch" />
					</template>
				</el-input>
			</el-form-item>
			<el-form-item label="退料人" prop="returnBy">
				<el-select
					v-model="queryParams.returnBy"
					filterable
					remote
					reserve-keyword
					placeholder="请输入人员姓名搜索"
					:remote-method="searchPersonnelForQuery"
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
					v-hasPermi="['take:returnOrder:add']"
				>新增</el-button>
			</el-col>
			<el-col :span="1.5">
				<el-button
					type="success"
					plain
					icon="Edit"
					:disabled="single"
					@click="handleUpdate"
					v-hasPermi="['take:returnOrder:edit']"
				>修改</el-button>
			</el-col>
			<right-toolbar v-model:showSearch="showSearch" @queryTable="getList" :columns="columns"></right-toolbar>
		</el-row>
		
		<adaptive-table border stripe v-loading="loading" :data="returnOrderList" @row-click="handleRowClick">
			<el-table-column type="index" width="50" align="center" />
			<el-table-column sortable show-overflow-tooltip label="退料单号" align="center" prop="returnNo" v-if="columns[0].visible">
				<template #default="scope">
					<el-button link type="primary" :underline="false" @click.stop="handleDetail(scope.row)">
						{{ scope.row.returnNo }}
					</el-button>
				</template>
			</el-table-column>
			<el-table-column sortable show-overflow-tooltip label="退料日期" align="center" prop="returnDate" width="180" v-if="columns[1].visible">
				<template #default="scope">
					<el-button link type="primary" :underline="false" @click.stop="handleDetail(scope.row)">
						<span>{{ parseTime(scope.row.returnDate, '{y}-{m}-{d}') }}</span>
					</el-button>
				</template>
			</el-table-column>
			<el-table-column sortable show-overflow-tooltip label="退料部门" align="center" prop="workshopName" v-if="columns[2].visible" />
			<el-table-column sortable show-overflow-tooltip label="退料类型" align="center" prop="sourceType" v-if="columns[3].visible">
				<template #default="scope">
					<el-button link type="primary" :underline="false" @click.stop="handleDetail(scope.row)">
						<dict-tag :options="source_type" :value="scope.row.sourceType"/>
					</el-button>
				</template>
			</el-table-column>
			<el-table-column sortable show-overflow-tooltip label="领料单号" align="center" prop="pickNo" v-if="columns[4].visible" />
			<el-table-column sortable show-overflow-tooltip label="退料人" align="center" prop="returnBy" v-if="columns[5].visible" />
			<el-table-column sortable show-overflow-tooltip label="负责人" align="center" prop="chargeBy" v-if="columns[6].visible" />
			<el-table-column sortable show-overflow-tooltip label="创建人" align="center" prop="createBy" v-if="columns[7].visible" />
			<el-table-column sortable show-overflow-tooltip label="总金额" align="center" prop="totalAmount" v-if="columns[8].visible" />
			<el-table-column sortable show-overflow-tooltip label="审核结果" align="center" prop="auditStatus" v-if="columns[9].visible">
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
					<el-button link type="primary" icon="Edit" @click="handleUpdate(scope.row)" v-hasPermi="['take:returnOrder:edit']" v-if="scope.row.auditStatus !== '1' && (username === scope.row.createBy || username === 'admin')">修改</el-button>
					<el-button link type="primary" icon="Delete" @click.stop="handleDelete(scope.row)" v-hasPermi="['take:returnOrder:remove']" v-if="username === scope.row.createBy || username === 'admin'">作废</el-button>
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
		
		<!-- 添加或修改退料单对话框 -->
		<el-dialog :title="title" v-model="open" width="1200px" append-to-body draggable>
			<el-form ref="returnOrderRef" :model="form" :rules="rules" label-width="80px" v-loading="dialogLoading">
				<el-row>
					<el-col :span="8">
						<el-form-item label="退料单号" prop="returnNo">
							<el-input v-model="form.returnNo" placeholder="请输入退料单号" />
						</el-form-item>
					</el-col>
					<el-col :span="8">
						<el-form-item label="退料日期" prop="returnDate">
							<el-date-picker clearable
							                v-model="form.returnDate"
							                type="date"
							                value-format="YYYY-MM-DD"
							                placeholder="请选择退料日期"
							                @change="handleReturnDateChange">
							</el-date-picker>
						</el-form-item>
					</el-col>
					<el-col :span="8">
						<el-form-item label="退料部门" prop="workshopId">
							<el-select
								v-model="form.workshopId"
								filterable
								remote
								reserve-keyword
								placeholder="请输入部门名称搜索"
								:remote-method="searchWorkshop"
								:loading="workshopLoading"
								style="width: 100%">
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
				</el-row>
				<el-row>
					<el-col :span="8">
						<el-form-item label="退料类型" prop="sourceType">
							<el-select v-model="form.sourceType" placeholder="请选择退料类型">
								<el-option
									v-for="dict in source_type"
									:key="dict.value"
									:label="dict.label"
									:value="parseInt(dict.value)"
								></el-option>
							</el-select>
						</el-form-item>
					</el-col>
					<el-col :span="8">
						<el-form-item label="领料单" prop="sourceId">
							<el-input v-model="selectedPickOrderNo" placeholder="请选择领料单" readonly>
								<template #append>
									<el-button icon="Search" @click="handleSelectPickOrder" />
								</template>
							</el-input>
						</el-form-item>
					</el-col>
					<el-col :span="8">
						<el-form-item label="总金额" prop="totalAmount">
							<el-input v-model="form.totalAmount" placeholder="自动计算" disabled />
						</el-form-item>
					</el-col>
				</el-row>
				<el-row>
					<el-col :span="8">
						<el-form-item label="退料人" prop="returnBy">
							<el-select
								v-model="form.returnBy"
								filterable
								remote
								allow-create
								reserve-keyword
								placeholder="请输入人员姓名搜索"
								:remote-method="searchPersonnel"
								:loading="personnelLoading"
								clearable
								style="width: 100%">
								<el-option
									v-for="item in personnelOptions"
									:key="item.personnelId"
									:label="item.name"
									:value="item.name">
								</el-option>
							</el-select>
						</el-form-item>
					</el-col>
					<el-col :span="8">
						<el-form-item label="负责人" prop="chargeBy">
							<el-input v-model="form.chargeBy" placeholder="请输入负责人" />
						</el-form-item>
					</el-col>
				</el-row>
				<el-row>
					<el-col :span="24">
						<el-form-item label="备注" prop="remark">
							<el-input v-model="form.remark" type="textarea" placeholder="请输入内容" />
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
								style="width: 100%">
								<el-option
									v-for="item in getFilteredMaterialOptions(scope.$index)"
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
					<el-table-column label="退料数量" prop="returnQty">
						<template #default="scope">
							<el-input-number v-model="scope.row.returnQty" placeholder="退料数量" :min="0" controls-position="right" :disabled="isView" style="width: 100%" @change="calculateTotalAmount" />
						</template>
					</el-table-column>
					<el-table-column label="单价" prop="unitPrice">
						<template #default="scope">
							<el-input-number v-model="scope.row.unitPrice" :min="0" placeholder="单价" controls-position="right" :disabled="isView" style="width: 100%" @change="calculateTotalAmount" />
						</template>
					</el-table-column>
					<el-table-column label="备注" prop="remark">
						<template #default="scope">
							<el-input v-model="scope.row.remark"
							          type="textarea" :autosize="{ minRows: 1 }" placeholder="请输入备注" :disabled="isView" />
						</template>
					</el-table-column>
					<el-table-column label="操作" align="center" class-name="small-padding fixed-width">
						<template #default="scope">
							<el-button link type="primary" icon="Delete" @click="removeDetailItem(scope.$index)" :disabled="isView">删除</el-button>
						</template>
					</el-table-column>
				</el-table>
			</div>
			<div style="display: flex; justify-content: space-between; align-items: center; margin-top: 10px; padding-right: 20px">
				<el-button type="primary" plain icon="Plus" @click="addDetailItem" :disabled="isView">添加明细</el-button>
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
		
		<!-- 退料单详情对话框 -->
		<el-dialog title="退料单详情" v-model="detailOpen" width="800px" append-to-body draggable>
			<el-row :gutter="10">
				<el-col :span="24">
					<el-card class="box-card">
						<template #header>
							<div class="card-header">
								<span>退料单信息</span>
							</div>
						</template>
						<el-descriptions :column="2" border>
							<el-descriptions-item label="退料单号">{{ detailData.returnNo }}</el-descriptions-item>
							<el-descriptions-item label="退料日期">{{ parseTime(detailData.returnDate, '{y}-{m}-{d}') }}</el-descriptions-item>
							<el-descriptions-item label="退料部门">{{ detailData.workshopName }}</el-descriptions-item>
							<el-descriptions-item label="退料类型">
								<dict-tag :options="source_type" :value="detailData.sourceType"/>
							</el-descriptions-item>
							<el-descriptions-item label="领料单号">{{ detailData.pickNo }}</el-descriptions-item>
							<el-descriptions-item label="退料人">{{ detailData.returnBy }}</el-descriptions-item>
							<el-descriptions-item label="负责人">{{ detailData.chargeBy }}</el-descriptions-item>
							<el-descriptions-item label="创建人">{{ detailData.createBy }}</el-descriptions-item>
							<el-descriptions-item label="总金额">{{ detailData.totalAmount }}</el-descriptions-item>
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
								<el-table-column label="物料编码" prop="material.materialCode" />
								<el-table-column label="物料名称" prop="material.materialName" />
								<el-table-column label="规格型号" prop="material.specification" />
								<el-table-column label="退料数量" prop="returnQty" />
								<el-table-column label="单价" prop="unitPrice" />
								<el-table-column label="备注" prop="remark" />
							</el-table>
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
		<el-dialog title="作废退料单" v-model="abandonOpen" width="500px" append-to-body>
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
		
		<!-- 领料单选择对话框 -->
		<el-dialog title="选择领料单" v-model="pickOrderOpen" width="1000px" append-to-body>
			<el-form :model="pickOrderQueryParams" ref="pickOrderQueryRef" :inline="true" label-width="68px">
				<el-form-item label="领料单号" prop="pickNo">
					<el-input
						v-model="pickOrderQueryParams.pickNo"
						placeholder="请输入领料单号"
						clearable
						style="width: 200px"
						@keyup.enter="handlePickOrderQuery"
					/>
				</el-form-item>
				<el-form-item label="领料日期">
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
					<el-input
						v-model="pickOrderQueryParams.picker"
						placeholder="请输入领料人"
						clearable
						style="width: 200px"
						@keyup.enter="handlePickOrderQuery"
					/>
				</el-form-item>
				<el-form-item>
					<el-button type="primary" icon="Search" @click="handlePickOrderQuery">搜索</el-button>
					<el-button icon="Refresh" @click="resetPickOrderQuery">重置</el-button>
				</el-form-item>
			</el-form>
			
			<el-table border stripe v-loading="pickOrderLoading" :data="pickOrderList" @row-dblclick="handlePickOrderSelect">
				<el-table-column label="领料单号" align="center" prop="pickNo" />
				<el-table-column label="领料日期" align="center" prop="pickDate" width="180">
					<template #default="scope">
						<span>{{ parseTime(scope.row.pickDate, '{y}-{m}-{d}') }}</span>
					</template>
				</el-table-column>
				<el-table-column label="领料人" align="center" prop="picker" />
				<el-table-column label="操作" align="center" class-name="small-padding fixed-width">
					<template #default="scope">
						<el-button link type="primary" icon="Select" @click="handlePickOrderSelect(scope.row)">选择</el-button>
					</template>
				</el-table-column>
			</el-table>
			
			<pagination
				v-show="pickOrderTotal>0"
				:total="pickOrderTotal"
				v-model:page="pickOrderQueryParams.pageNum"
				v-model:limit="pickOrderQueryParams.pageSize"
				@pagination="getPickOrderList"
			/>
			
			<template #footer>
				<div class="dialog-footer">
					<el-button @click="pickOrderOpen = false">关 闭</el-button>
				</div>
			</template>
		</el-dialog>
	</div>
</template>

<script setup name="ReturnOrder">
import { auditDocument } from "@/api/audit/audit";
import { listMaterialByCodeOrName } from "@/api/base/material";
import { listPersonnel } from "@/api/base/personnel.js";
import { listByNameOrContact } from "@/api/base/workshop.js";
import { getPickOrder, listPickOrder } from "@/api/take/pickOrder";
import { listReturnDetail } from "@/api/take/returnDetail";
import {
  addReturnOrder,
  delReturnOrder,
  getReturnOrder,
  listReturnOrder,
  updateReturnOrder,
} from "@/api/take/returnOrder";
import useUserStore from "@/store/modules/user";
import { formatDateToYYYYMMDD, generateOrderNo } from "@/utils/orderNumber";

const { proxy } = getCurrentInstance();
const { source_type } = proxy.useDict("source_type");

const returnOrderList = ref([]);
const open = ref(false);
const loading = ref(true);
const showSearch = ref(true);
const ids = ref([]);
const single = ref(true);
const multiple = ref(true);
const total = ref(0);
const title = ref("");
const daterangeReturnDate = ref([]);
const detailOpen = ref(false);
const detailTabActive = ref("main");
const abandonOpen = ref(false);
const isView = ref(false);

const username = computed(() => useUserStore().name);

// 领料单相关
const pickOrderOpen = ref(false);
const pickOrderList = ref([]);
const pickOrderLoading = ref(false);
const pickOrderTotal = ref(0);
const daterangePickDate = ref([]);
const selectedPickOrder = ref({});
const selectedPickOrderNo = ref("");
const pickOrderNo = ref("");

// 明细相关
const detailList = ref([]);
const materialOptions = ref([]);
const materialLoading = ref(false);
const materialSerch = ref([]);

// 人员相关
const personnelOptions = ref([]);
const personnelLoading = ref(false);

// 部门相关
const workshopOptions = ref([]);
const workshopLoading = ref(false);

// 详情数据
const detailData = ref({});
const dialogLoading = ref(false);

const data = reactive({
  form: {},
  queryParams: {
    pageNum: 1,
    pageSize: 30,
    returnNo: null,
    returnDate: null,
    workshopId: null,
    sourceType: null,
    sourceId: null,
    returnBy: null,
    materialId: null,
    materialName: null,
  },
  rules: {
    returnNo: [
      { required: true, message: "退料单号不能为空", trigger: "blur" },
    ],
    returnDate: [
      { required: true, message: "退料日期不能为空", trigger: "change" },
    ],
    returnBy: [
      { required: true, message: "退料人不能为空", trigger: "change" },
    ],
  },
  abandonForm: {},
  abandonRules: {
    voidDescription: [
      { required: true, message: "作废说明不能为空", trigger: "blur" },
    ],
  },
  pickOrderQueryParams: {
    pageNum: 1,
    pageSize: 30,
    pickNo: null,
    pickDate: null,
    picker: null,
  },
});

const {
  queryParams,
  form,
  rules,
  abandonForm,
  abandonRules,
  pickOrderQueryParams,
} = toRefs(data);

// 添加columns数组定义
const columns = ref([
  { key: 0, label: `退料单号`, visible: true },
  { key: 1, label: `退料日期`, visible: true },
  { key: 2, label: `退料部门`, visible: true },
  { key: 3, label: `退料类型`, visible: true },
  { key: 4, label: `领料单号`, visible: true },
  { key: 5, label: `退料人`, visible: true },
  { key: 6, label: `负责人`, visible: false },
  { key: 7, label: `创建人`, visible: false },
  { key: 8, label: `总金额`, visible: true },
  { key: 9, label: `审核结果`, visible: true },
]);

/** 查询退料单列表 */
function getList() {
  loading.value = true;
  queryParams.value.params = {};
  if (
    Array.isArray(daterangeReturnDate.value) &&
    daterangeReturnDate.value.length === 2
  ) {
    queryParams.value.params["beginReturnDate"] = daterangeReturnDate.value[0];
    queryParams.value.params["endReturnDate"] = daterangeReturnDate.value[1];
  }
  listReturnOrder(queryParams.value).then((response) => {
    returnOrderList.value = response.rows;
    total.value = response.total;
    loading.value = false;
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
      // 更新当前行的物料选项，排除其他行已选择的物料
      updateMaterialOptionsForRowIndex(rowIndex, response.rows);
      materialLoading.value = false;
    })
    .catch(() => {
      materialLoading.value = false;
    });
}

/**
 * 更新指定行的物料选项，排除其他行已选择的物料
 */
function updateMaterialOptionsForRowIndex(rowIndex, allMaterials) {
  // 收集其他行已选择的物料ID
  const selectedMaterialIds = new Set();
  detailList.value.forEach((item, index) => {
    if (index !== rowIndex && item.materialId) {
      selectedMaterialIds.add(item.materialId);
    }
  });

  // 过滤掉其他行已选择的物料
  materialOptions.value = allMaterials.filter(
    (item) => !selectedMaterialIds.has(item.materialId),
  );
}

/**
 * 获取过滤后的物料选项
 */
function getFilteredMaterialOptions(rowIndex) {
  // 收集其他行已选择的物料ID
  const selectedMaterialIds = new Set();
  detailList.value.forEach((item, index) => {
    if (index !== rowIndex && item.materialId) {
      selectedMaterialIds.add(item.materialId);
    }
  });

  // 过滤掉其他行已选择的物料
  return materialOptions.value.filter(
    (item) => !selectedMaterialIds.has(item.materialId),
  );
}

/** 查询人员 */
function searchPersonnel(query) {
  personnelLoading.value = true;
  listPersonnel({
    type: 5,
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

/** 查询人员（用于搜索） */
function searchPersonnelForQuery(query) {
  personnelLoading.value = true;
  listPersonnel({
    name: query,
    type: 5,
  })
    .then((response) => {
      personnelOptions.value = response.rows;
      personnelLoading.value = false;
    })
    .catch(() => {
      personnelLoading.value = false;
    });
}

/** 查询部门（用于搜索和表单） */
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

// 取消按钮
function cancel() {
  open.value = false;
  reset();
}

// 表单重置
function reset() {
  form.value = {
    returnId: null,
    returnNo: null,
    returnDate: null,
    workshopId: null,
    sourceType: null,
    sourceId: null,
    returnBy: null,
    totalAmount: null,
    remark: null,
    delFlag: null,
    voidDescription: null,
    createBy: null,
    createTime: null,
    updateBy: null,
    updateTime: null,
    details: [],
  };
  detailList.value = [
    {
      materialId: null,
      returnQty: null,
      unitPrice: null,
      returnReason: "",
      remark: "",
      subtotal: "0.00",
    },
  ];
  selectedPickOrderNo.value = "";
  materialOptions.value = [];
  materialLoading.value = false;
  personnelOptions.value = [];
  workshopOptions.value = []; // 重置部门选项
  proxy.resetForm("returnOrderRef");
}

/** 搜索按钮操作 */
function handleQuery() {
  queryParams.value.pageNum = 1;
  getList();
}

/** 重置按钮操作 */
function resetQuery() {
  daterangeReturnDate.value = [];
  pickOrderNo.value = "";
  queryParams.value.workshopId = null;
  queryParams.value.sourceId = null;
  queryParams.value.returnBy = null;
  proxy.resetForm("queryRef");
  handleQuery();
}

// 多选框选中数据
function handleSelectionChange(selection) {
  ids.value = selection.map((item) => item.returnId);
  single.value = selection.length !== 1;
  multiple.value = !selection.length;
}

/** 添加明细项 */
function addDetailItem() {
  detailList.value.push({
    materialId: null,
    returnQty: null,
    unitPrice: null,
    returnReason: "",
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

/** 计算小计和总金额 */
function calculateTotalAmount() {
  let total = 0;
  detailList.value.forEach((item) => {
    if (item.returnQty && item.unitPrice) {
      item.subtotal = (item.returnQty * item.unitPrice).toFixed(2);
      total += parseFloat(item.subtotal);
    } else {
      item.subtotal = "0.00";
    }
  });
  form.value.totalAmount = total.toFixed(2);
}

/** 查看详情 */
function handleDetail(row) {
  getReturnOrder(row.returnId).then((response) => {
    detailData.value = response.data;
    // 确保明细数据被正确加载
    if (response.data.details) {
      detailData.value.details = response.data.details;
    } else {
      // 如果主表数据中没有明细，则通过API获取明细数据
      listReturnDetail({ returnId: row.returnId }).then((res) => {
        detailData.value.details = res.rows;
      });
    }
    detailOpen.value = true;
  });
}

/** 新增按钮操作 */
function handleAdd() {
  reset();
  const today = new Date();
  form.value.returnDate = formatDateToYYYYMMDD(today);
  isView.value = false;
  title.value = "添加退料单";
  open.value = true;
  dialogLoading.value = true;
  generateReturnNo(today)
    .then((returnNo) => {
      form.value.returnNo = returnNo;
      searchMaterial();
    })
    .finally(() => {
      dialogLoading.value = false;
    });
}

/**
 * 生成退料单号
 */
async function generateReturnNo(date) {
  // 查询当天已有的退料单号，找出最大流水号
  const params = {
    params: {
      beginReturnDate: formatDateToYYYYMMDD(date),
      endReturnDate: formatDateToYYYYMMDD(date),
    },
  };

  return generateOrderNo(date, "TL", listReturnOrder, params, "returnNo");
}

/**
 * 处理退料日期更改事件，重新生成退料单号
 */
async function handleReturnDateChange(val) {
  if (val && !form.value.returnId) {
    const newDate = new Date(val);
    const newReturnNo = await generateReturnNo(newDate);
    form.value.returnNo = newReturnNo;
  }
}

/**
 * 审核操作
 */
function handleAudit(status) {
  const auditData = {
    documentId: detailData.value.returnId,
    documentType: 5, // 退料单类型
    status: status,
    auditor: username.value,
  };

  auditDocument(auditData)
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

/** 修改按钮操作 */
function handleUpdate(row) {
  reset();
  isView.value = false;
  title.value = "修改退料单";
  open.value = true;
  dialogLoading.value = true;
  const _returnId = row.returnId || ids.value;
  getReturnOrder(_returnId)
    .then((response) => {
      const orderData = response.data;
      form.value = {
        returnId: orderData.returnId,
        returnNo: orderData.returnNo,
        returnDate: orderData.returnDate,
        workshopId: orderData.workshopId,
        sourceType: orderData.sourceType,
        sourceId: orderData.sourceId,
        returnBy: orderData.returnBy,
        chargeBy: orderData.chargeBy,
        totalAmount: orderData.totalAmount,
        remark: orderData.remark,
        delFlag: orderData.delFlag,
        voidDescription: orderData.voidDescription,
      };
      if (orderData.sourceId) {
        getPickOrder(orderData.sourceId).then((res) => {
          selectedPickOrderNo.value = res.data.pickNo;
        });
      }
      if (orderData.details && orderData.details.length > 0) {
        detailList.value = orderData.details.map((detail) => ({
          detailId: detail.detailId,
          materialId: detail.materialId,
          returnQty: detail.returnQty,
          unitPrice: detail.unitPrice,
          returnReason: detail.returnReason,
          remark: detail.remark,
          subtotal:
            detail.returnQty && detail.unitPrice
              ? (detail.returnQty * detail.unitPrice).toFixed(2)
              : "0.00",
        }));
      }
      searchMaterial();
    })
    .finally(() => {
      dialogLoading.value = false;
    });
}

/** 提交按钮 */
function submitForm() {
  proxy.$refs["returnOrderRef"].validate((valid) => {
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
        if (!item.returnQty) {
          proxy.$modal.msgError(`第${i + 1}行退料数量不能为空`);
          return;
        }
        if (!item.unitPrice) {
          proxy.$modal.msgError(`第${i + 1}行单价不能为空`);
          return;
        }
      }

      // 将明细数据添加到表单中
      form.value.details = detailList.value;

      if (form.value.returnId != null) {
        updateReturnOrder(form.value).then((response) => {
          proxy.$modal.msgSuccess("修改成功");
          open.value = false;
          getList();
        });
      } else {
        addReturnOrder(form.value).then((response) => {
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
    returnId: row.returnId || ids.value,
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
        returnId: abandonForm.value.returnId,
        voidDescription: abandonForm.value.voidDescription,
      };
      // 使用POST方法提交作废请求
      delReturnOrder(abandonData).then(() => {
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
    "take/returnOrder/export",
    {
      ...queryParams.value,
    },
    `returnOrder_${new Date().getTime()}.xlsx`,
  );
}

/** 处理行点击事件 */
function handleRowClick(row) {
  // 可以在这里添加行点击事件的处理逻辑
}

/** 打开选择领料单对话框（用于表单） */
function handleSelectPickOrder() {
  pickOrderOpen.value = true;
  getPickOrderList();
}

/** 打开选择领料单对话框（用于搜索） */
function handleSelectPickOrderForSearch() {
  pickOrderOpen.value = true;
  getPickOrderList();
}

/** 查询领料单列表 */
function getPickOrderList() {
  pickOrderLoading.value = true;
  pickOrderQueryParams.value.params = {};
  if (
    Array.isArray(daterangePickDate.value) &&
    daterangePickDate.value.length === 2
  ) {
    pickOrderQueryParams.value.params["beginPickDate"] =
      daterangePickDate.value[0];
    pickOrderQueryParams.value.params["endPickDate"] =
      daterangePickDate.value[1];
  }
  listPickOrder(pickOrderQueryParams.value).then((response) => {
    pickOrderList.value = response.rows;
    pickOrderTotal.value = response.total;
    pickOrderLoading.value = false;
  });
}

/** 搜索领料单 */
function handlePickOrderQuery() {
  pickOrderQueryParams.value.pageNum = 1;
  getPickOrderList();
}

/** 重置领料单查询条件 */
function resetPickOrderQuery() {
  daterangePickDate.value = [];
  proxy.resetForm("pickOrderQueryRef");
  handlePickOrderQuery();
}

/** 选择领料单 */
function handlePickOrderSelect(row) {
  // 获取领料单详情
  getPickOrder(row.pickId).then((response) => {
    selectedPickOrder.value = response.data;

    // 根据不同场景处理选择结果
    if (open.value) {
      // 在新增/修改表单中选择领料单
      form.value.sourceId = selectedPickOrder.value.pickId;
      selectedPickOrderNo.value = selectedPickOrder.value.pickNo;

      // 清空当前明细
      detailList.value = [];

      // 将领料单明细转换为退料单明细
      if (
        selectedPickOrder.value.details &&
        selectedPickOrder.value.details.length > 0
      ) {
        selectedPickOrder.value.details.forEach((pickDetail) => {
          // 为每个明细项预加载物料和库位选项
          const index = detailList.value.length;

          // 初始化选项数组
          if (!materialOptions.value[index]) {
            materialOptions.value[index] = [];
          }

          // 添加明细项
          detailList.value.push({
            materialId: pickDetail.materialId,
            returnQty: pickDetail.quantity, // 默认使用领料数量
            unitPrice: pickDetail.unitPrice,
            returnReason: "",
            remark: pickDetail.remark,
            subtotal:
              pickDetail.quantity && pickDetail.unitPrice
                ? (pickDetail.quantity * pickDetail.unitPrice).toFixed(2)
                : "0.00",
          });

          // 获取物料详细信息并添加到选项中
          if (pickDetail.materialId) {
            getMaterial(pickDetail.materialId)
              .then((materialResponse) => {
                // 将物料信息添加到选项中
                materialOptions.value[index] = [materialResponse.data];
                // 确保视图更新
                materialOptions.value = [...materialOptions.value];
              })
              .catch(() => {
                // 如果获取物料信息失败，不处理
              });
          }
        });
      }

      // 计算总金额
      calculateTotalAmount();
    } else {
      // 在搜索条件中选择领料单
      pickOrderNo.value = selectedPickOrder.value.pickNo;
      queryParams.value.sourceId = selectedPickOrder.value.pickId;
    }

    // 关闭领料单选择对话框
    pickOrderOpen.value = false;
  });
}

getList();
</script>
