<template>
  <div class="app-container">
    <el-form :model="queryParams" ref="queryRef" :inline="true" v-show="showSearch" label-width="68px">
      <el-form-item label="报废单号" prop="scrapNo">
        <el-input
          v-model="queryParams.scrapNo"
          placeholder="请输入报废单号"
          clearable
          style="width: 240px"
          @keyup.enter="handleQuery"
        />
      </el-form-item>
      <el-form-item label="报废日期" style="width: 308px">
        <el-date-picker
          v-model="daterangeScrapDate"
          value-format="YYYY-MM-DD"
          type="daterange"
          range-separator="-"
          start-placeholder="开始日期"
          end-placeholder="结束日期"
        ></el-date-picker>
      </el-form-item>
      <el-form-item label="处理方式" prop="disposalMethod">
        <el-select
          v-model="queryParams.disposalMethod"
          placeholder="请选择处理方式"
          clearable
          style="width: 240px">
          <el-option
            v-for="dict in saifute_disposal_method"
            :key="dict.value"
            :label="dict.label"
            :value="dict.value"
          />
        </el-select>
      </el-form-item>
      <el-form-item label="经办人" prop="attn">
        <combo-input v-model="queryParams.attn" scope="personnel" field="personnelName" placeholder="请选择或输入经办人" width="240px" />
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
          v-hasPermi="['workshop-material:scrap-order:create']"
        >新增</el-button>
      </el-col>
      <el-col :span="1.5">
        <el-button
          type="success"
          plain
          icon="Edit"
          :disabled="single"
          @click="handleUpdate"
          v-hasPermi="['workshop-material:scrap-order:update']"
        >修改</el-button>
      </el-col>
      <el-col :span="1.5">
        <el-button
          type="danger"
          plain
          icon="Delete"
          :disabled="multiple"
          @click="handleDelete"
          v-hasPermi="['workshop-material:scrap-order:void']"
        >作废</el-button>
      </el-col>
      <right-toolbar v-model:showSearch="showSearch" @queryTable="getList" :columns="columns"></right-toolbar>
    </el-row>

    <adaptive-table border stripe v-loading="loading" :data="scrapOrderList" @selection-change="handleSelectionChange" @row-click="handleRowClick">
      <el-table-column type="selection" width="50" align="center" />
      <el-table-column type="index" width="50" align="center" />
      <el-table-column sortable show-overflow-tooltip label="报废单号" align="center" prop="scrapNo" v-if="columns[0].visible">
        <template #default="scope">
          <el-button link type="primary" @click="handleDetail(scope.row)">{{ scope.row.scrapNo }}</el-button>
        </template>
      </el-table-column>
      <el-table-column
        sortable
        show-overflow-tooltip
        label="报废日期"
        align="center"
        prop="scrapDate"
        width="200"
        :sort-method="compareScrapDateRows"
        v-if="columns[1].visible"
      >
        <template #default="scope">
          <el-button link type="primary" @click="handleDetail(scope.row)">
            <span style="display: inline-flex; flex-direction: column; align-items: center; line-height: 1.35;">
              <span>{{ formatDocumentDate(scope.row.scrapDate) }}</span>
              <span style="font-size: 12px; color: #909399;">
                创建 {{ formatRecordDateTime(scope.row.createdAt) }}
              </span>
            </span>
          </el-button>
        </template>
      </el-table-column>
      <el-table-column sortable show-overflow-tooltip label="处理方式" align="center" prop="disposalMethod" v-if="columns[2].visible">
        <template #default="scope">
          <el-button link type="primary" @click="handleDetail(scope.row)">
            <dict-tag :options="saifute_disposal_method" :value="scope.row.disposalMethod"/>
          </el-button>
        </template>
      </el-table-column>
      <el-table-column sortable show-overflow-tooltip label="经办人" align="center" prop="attn" v-if="columns[3].visible">
        <template #default="scope">
          <el-button link type="primary" @click="handleDetail(scope.row)">{{ scope.row.attn }}</el-button>
        </template>
      </el-table-column>
      <el-table-column sortable show-overflow-tooltip label="创建人" align="center" prop="createBy" v-if="columns[4].visible">
        <template #default="scope">
          <el-button link type="primary" @click="handleDetail(scope.row)">{{ scope.row.createBy }}</el-button>
        </template>
      </el-table-column>
      <el-table-column label="操作" align="center" class-name="small-padding fixed-width">
        <template #default="scope">
          <el-button link type="primary" icon="Edit" @click="handleUpdate(scope.row)" v-hasPermi="['workshop-material:scrap-order:update']">修改</el-button>
          <el-button link type="primary" icon="Delete" @click="handleDelete(scope.row)" v-hasPermi="['workshop-material:scrap-order:void']">作废</el-button>
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

    <!-- 添加或修改报废单对话框 -->
    <el-dialog :title="title" v-model="open" width="1200px" append-to-body draggable v-loading="dialogLoading">
      <el-form ref="scrapOrderRef" :model="form" :rules="rules" label-width="80px">
        <el-row>
          <el-col :span="12">
            <el-form-item label="报废单号" prop="scrapNo">
              <el-input v-model="form.scrapNo" placeholder="保存后自动生成" disabled />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="报废日期" prop="scrapDate">
              <el-date-picker clearable
                v-model="form.scrapDate"
                type="date"
                value-format="YYYY-MM-DD"
                placeholder="请选择报废日期">
              </el-date-picker>
            </el-form-item>
          </el-col>
        </el-row>
        <el-row>
          <el-col :span="12">
            <el-form-item label="处理方式" prop="disposalMethod">
              <el-select v-model="form.disposalMethod" placeholder="请选择处理方式">
                <el-option
                  v-for="dict in saifute_disposal_method"
                  :key="dict.value"
                  :label="dict.label"
                  :value="parseInt(dict.value)"
                ></el-option>
              </el-select>
            </el-form-item>
          </el-col>
        </el-row>
        <el-row>
          <el-col :span="12">
            <el-form-item label="经办人" prop="attn">
              <combo-input v-model="form.attn" scope="personnel" field="personnelName" placeholder="请选择或输入经办人" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="车间" prop="workshopId">
              <el-select
                v-model="form.workshopId"
                filterable
                remote
                reserve-keyword
                placeholder="请输入车间名称搜索"
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
          <el-col :span="24">
            <el-form-item label="报废说明" prop="remark">
              <el-input v-model="form.remark" type="textarea" placeholder="请输入内容" />
            </el-form-item>
          </el-col>
        </el-row>
        
        <div style="margin-top: 20px;">
          <div style="margin-bottom: 10px;">
            <el-button type="primary" plain icon="Plus" @click="addDetailItem" :disabled="isView">添加明细</el-button>
          </div>
          <adaptive-table :data="detailList" border stripe v-loading="dialogLoading">
            <el-table-column label="物料" prop="materialId" width="220">
              <template #default="scope">
                <el-select
                  v-model="scope.row.materialId"
                  filterable
                  remote
                  reserve-keyword
                  placeholder="请输入物料名称或规格型号搜索"
                  :remote-method="searchMaterial"
                  :loading="materialLoading"
                  :disabled="isView"
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
            <el-table-column label="报废数量" prop="scrapQty">
              <template #default="scope">
                <el-input-number v-model="scope.row.scrapQty" placeholder="报废数量" :min="0" controls-position="right" style="width: 100%" :disabled="isView" />
              </template>
            </el-table-column>
            <el-table-column label="单位" prop="unit">
              <template #default="scope">
                <combo-input v-model="scope.row.unit" scope="material" field="unitCode" placeholder="请选择或输入单位" :disabled="isView" />
              </template>
            </el-table-column>
            <el-table-column label="报废原因" prop="scrapReason">
              <template #default="scope">
                <el-select v-model="scope.row.scrapReason" placeholder="请选择报废原因" :disabled="isView" style="width: 100%">
                  <el-option
                    v-for="dict in scrap_reason"
                    :key="dict.value"
                    :label="dict.label"
                    :value="dict.value">
                  </el-option>
                </el-select>
              </template>
            </el-table-column>
            <el-table-column label="预估损失" prop="estimatedLoss">
              <template #default="scope">
                <el-input-number v-model="scope.row.estimatedLoss" placeholder="预估损失" :min="0" controls-position="right" style="width: 100%" :disabled="isView" />
              </template>
            </el-table-column>
            <el-table-column label="备注" prop="remark">
              <template #default="scope">
                <el-input v-model="scope.row.remark" placeholder="请输入备注" :disabled="isView" />
              </template>
            </el-table-column>
            <el-table-column label="操作" width="80" v-if="!isView">
              <template #default="scope">
                <el-button link type="danger" icon="Delete" @click="removeDetailItem(scope.$index)">删除</el-button>
              </template>
            </el-table-column>
          </adaptive-table>
        </div>
      </el-form>
      <template #footer>
        <div class="dialog-footer">
          <el-button type="primary" @click="submitForm" v-if="!isView">确 定</el-button>
          <el-button @click="cancel">取 消</el-button>
        </div>
      </template>
    </el-dialog>
    
    <!-- 报废单详情对话框 -->
    <el-dialog title="报废单详情" v-model="detailOpen" width="800px" append-to-body>
      <el-tabs v-model="detailTabActive">
        <el-tab-pane label="报废单信息" name="main">
          <el-descriptions :column="2" border>
            <el-descriptions-item label="报废单号">{{ detailData.scrapNo }}</el-descriptions-item>
            <el-descriptions-item label="报废日期">{{ parseTime(detailData.scrapDate, '{y}-{m}-{d}') }}</el-descriptions-item>
            <el-descriptions-item label="处理方式">
              <dict-tag :options="saifute_disposal_method" :value="detailData.disposalMethod"/>
            </el-descriptions-item>
            <el-descriptions-item label="经办人">{{ detailData.attn }}</el-descriptions-item>
            <el-descriptions-item label="创建者">{{ detailData.createBy }}</el-descriptions-item>
            <el-descriptions-item label="创建时间">{{ parseTime(detailData.createdAt) }}</el-descriptions-item>
            <el-descriptions-item label="备注" :span="2">{{ detailData.remark }}</el-descriptions-item>
          </el-descriptions>
        </el-tab-pane>
        <el-tab-pane label="明细信息" name="details">
          <adaptive-table :data="detailData.details" border stripe>
            <el-table-column label="序号" type="index" width="50" align="center" />
            <el-table-column label="物料编码" prop="material.materialCode" />
            <el-table-column label="物料名称" prop="material.materialName" />
            <el-table-column label="规格型号" prop="material.specification" />
            <el-table-column label="报废数量" prop="scrapQty" />
            <el-table-column label="单位" prop="unit" />
            <el-table-column label="报废原因">
              <template #default="scope">
                <dict-tag :options="scrap_reason" :value="scope.row.scrapReason"/>
              </template>
            </el-table-column>
            <el-table-column label="预估损失" prop="estimatedLoss" />
            <el-table-column label="备注" prop="remark" />
          </adaptive-table>
        </el-tab-pane>
      </el-tabs>
      <template #footer>
        <div class="dialog-footer">
          <el-button @click="detailOpen = false">关 闭</el-button>
        </div>
      </template>
    </el-dialog>
    
    <!-- 作废对话框 -->
    <el-dialog title="作废报废单" v-model="abandonOpen" width="500px" append-to-body>
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

<script setup name="ScrapOrder">
import { listMaterialByCodeOrName } from "@/api/base/material";
import { listPersonnel } from "@/api/base/personnel";
import { clearSuggestionsCache } from "@/api/base/suggestions";
import { listByNameOrContact } from "@/api/base/workshop";
import {
  addScrapOrder,
  getScrapOrder,
  listScrapOrder,
  updateScrapOrder,
  voidScrapOrder,
} from "@/api/stock/scrapOrder";
import {
  materialOptionsFromDocumentSnapshots,
  mergeMaterialOptions,
} from "@/utils/materialOptions";
import { formatDateToYYYYMMDD } from "@/utils/orderNumber";

const { proxy } = getCurrentInstance();
const { saifute_disposal_method, scrap_reason } = proxy.useDict(
  "saifute_disposal_method",
  "scrap_reason",
);

const scrapOrderList = ref([]);
const open = ref(false);
const loading = ref(true);
const showSearch = ref(true);
const ids = ref([]);
const single = ref(true);
const multiple = ref(true);
const total = ref(0);
const title = ref("");
const daterangeScrapDate = ref([]);
const isView = ref(false);
const abandonOpen = ref(false);
const detailOpen = ref(false);
const detailTabActive = ref("main");

// 明细相关数据
const detailList = ref([]);
const materialOptions = ref([]);
const materialLoading = ref(false);

// 人员信息相关
const personnelOptions = ref([]);
const personnelLoading = ref(false);
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
    scrapNo: null,
    scrapDate: null,
    disposalMethod: null,
    attn: null,
  },
  rules: {
    scrapDate: [
      { required: true, message: "报废日期不能为空", trigger: "blur" },
    ],
    workshopId: [{ required: true, message: "车间不能为空", trigger: "change" }],
    disposalMethod: [
      { required: true, message: "处理方式不能为空", trigger: "change" },
    ],
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

// 添加columns数组定义
const columns = ref([
  { key: 0, label: `报废单号`, visible: true },
  { key: 1, label: `报废日期`, visible: true },
  { key: 2, label: `处理方式`, visible: true },
  { key: 3, label: `经办人`, visible: true },
  { key: 4, label: `创建者`, visible: false },
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

function compareScrapDateRows(left, right) {
  const dateCompare = formatDocumentDate(left?.scrapDate).localeCompare(
    formatDocumentDate(right?.scrapDate),
  );
  if (dateCompare !== 0) {
    return dateCompare;
  }

  const createdAtCompare =
    toTimestamp(left?.createdAt) - toTimestamp(right?.createdAt);
  if (createdAtCompare !== 0) {
    return createdAtCompare;
  }

  return Number(left?.scrapId ?? 0) - Number(right?.scrapId ?? 0);
}

/** 查询报废单列表 */
function getList() {
  loading.value = true;
  queryParams.value.params = {};
  if (
    Array.isArray(daterangeScrapDate.value) &&
    daterangeScrapDate.value.length === 2
  ) {
    queryParams.value.params["beginScrapDate"] = daterangeScrapDate.value[0];
    queryParams.value.params["endScrapDate"] = daterangeScrapDate.value[1];
  }
  listScrapOrder(queryParams.value).then((response) => {
    scrapOrderList.value = response.rows;
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
    scrapId: null,
    scrapNo: "",
    scrapDate: null,
    workshopId: null,
    disposalMethod: 1,
    attn: null,
    remark: null,
    delFlag: null,
    voidDescription: null,
    createBy: null,
    createdAt: null,
    updatedAt: null,
  };
  detailList.value = [
    {
      materialId: null,
      scrapQty: null,
      scrapReason: "",
      unit: "",
      estimatedLoss: null,
      remark: "",
    },
  ];
  materialOptions.value = [];
  materialLoading.value = false;
  workshopOptions.value = [];
  workshopLoading.value = false;
  proxy.resetForm("scrapOrderRef");
}

/** 搜索按钮操作 */
function handleQuery() {
  queryParams.value.pageNum = 1;
  getList();
}

/** 重置按钮操作 */
function resetQuery() {
  daterangeScrapDate.value = [];
  proxy.resetForm("queryRef");
  handleQuery();
}

// 多选框选中数据
function handleSelectionChange(selection) {
  ids.value = selection.map((item) => item.scrapId);
  single.value = selection.length !== 1;
  multiple.value = !selection.length;
}

/** 查询物料 */
function searchMaterial(query) {
  materialLoading.value = true;
  listMaterialByCodeOrName({
    materialCode: query,
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

/** 搜索人员信息 */
function searchPersonnel(query) {
  personnelLoading.value = true;
  listPersonnel({
    type: 6,
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

/** 搜索车间 */
function searchWorkshop(query) {
  workshopLoading.value = true;
  listByNameOrContact({
    workshopName: query,
  })
    .then((response) => {
      workshopOptions.value = response.rows || [];
      workshopLoading.value = false;
    })
    .catch(() => {
      workshopLoading.value = false;
    });
}

/** 添加明细项 */
function addDetailItem() {
  detailList.value.push({
    materialId: null,
    scrapQty: null,
    scrapReason: "",
    unit: "",
    estimatedLoss: null,
    remark: "",
  });
}

/** 删除明细项 */
function removeDetailItem(index) {
  detailList.value.splice(index, 1);
}

/**
 * 获取过滤后的物料选项，避免在不同行中选择相同物料
 */
function getFilteredMaterialOptions(rowIndex) {
  // 收集其他行已选择的物料ID
  const selectedMaterialIds = new Set();
  detailList.value.forEach((item, index) => {
    if (index !== rowIndex && item.materialId) {
      selectedMaterialIds.add(item.materialId);
    }
  });

  // 如果当前行已经选择了物料，则将其加入选项中以避免被过滤掉
  const currentRowMaterialId = detailList.value[rowIndex].materialId;
  if (currentRowMaterialId) {
    selectedMaterialIds.delete(currentRowMaterialId);
  }

  // 过滤掉其他行已选择的物料
  return materialOptions.value.filter(
    (item) => !selectedMaterialIds.has(item.materialId),
  );
}

/** 新增按钮操作 */
function handleAdd() {
  reset();
  const today = new Date();
  form.value.scrapDate = formatDateToYYYYMMDD(today);
  form.value.disposalMethod = 1;
  title.value = "添加报废单";
  isView.value = false;
  open.value = true;
  dialogLoading.value = true;
  Promise.resolve()
    .then(() => {
      searchWorkshop("");
      loadMaterialOptions();
    })
    .finally(() => {
      dialogLoading.value = false;
    });
}

/** 修改按钮操作 */
function handleUpdate(row) {
  const scrapId = resolveSelectedScrapId(row);
  if (!scrapId) {
    return;
  }
  reset();
  title.value = "修改报废单";
  isView.value = false;
  open.value = true;
  dialogLoading.value = true;
  getScrapOrder(scrapId)
    .then((response) => {
      form.value = response.data;
      searchWorkshop(response.data.workshopName ?? "");
      if (response.data.details && response.data.details.length > 0) {
        detailList.value = response.data.details;
        materialOptions.value = mergeMaterialOptions(
          materialOptions.value,
          materialOptionsFromDocumentSnapshots(response.data.details),
        );
      }
      loadMaterialOptions();
    })
    .finally(() => {
      dialogLoading.value = false;
    });
}

/** 加载物料选项数据 */
function loadMaterialOptions() {
  materialLoading.value = true;
  listMaterialByCodeOrName({ materialCode: "" })
    .then((response) => {
      materialOptions.value = mergeMaterialOptions(
        response.rows || [],
        materialOptions.value,
      );
      materialLoading.value = false;
    })
    .catch(() => {
      materialOptions.value = [];
      materialLoading.value = false;
    });
}

/** 查看详情 */
function handleDetail(row) {
  getScrapOrder(row.scrapId).then((response) => {
    detailData.value = response.data;
    detailOpen.value = true;
  });
}

/** 点击行时同步工具栏状态 */
function handleRowClick(row) {
  if (!row?.scrapId) {
    return;
  }
  ids.value = [row.scrapId];
  single.value = false;
  multiple.value = false;
}

/** 提交按钮 */
function submitForm() {
  proxy.$refs["scrapOrderRef"].validate((valid) => {
    if (valid) {
      // 验证明细必填项
      if (!detailList.value || detailList.value.length === 0) {
        proxy.$modal.msgError("至少需要添加一条明细");
        return;
      }

      for (let i = 0; i < detailList.value.length; i++) {
        const item = detailList.value[i];
        if (!item.materialId) {
          proxy.$modal.msgError(`第${i + 1}行物料不能为空`);
          return;
        }
        if (!item.scrapQty) {
          proxy.$modal.msgError(`第${i + 1}行报废数量不能为空`);
          return;
        }
        if (!item.unit) {
          proxy.$modal.msgError(`第${i + 1}行单位不能为空`);
          return;
        }
      }

      // 将明细数据添加到表单中
      form.value.details = detailList.value;

      if (form.value.scrapId != null) {
        updateScrapOrder(form.value).then((response) => {
          clearSuggestionsCache();
          proxy.$modal.msgSuccess("修改成功");
          open.value = false;
          getList();
        });
      } else {
        addScrapOrder(form.value).then((response) => {
          clearSuggestionsCache();
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
  const scrapId = resolveSelectedScrapId(row);
  if (!scrapId) {
    return;
  }
  abandonForm.value = {
    scrapId,
    voidDescription: "",
  };
  abandonOpen.value = true;
  proxy.resetForm("abandonRef");
}

function resolveSelectedScrapId(row) {
  const scrapId = row?.scrapId ?? ids.value[0];
  if (!scrapId) {
    proxy.$modal.msgError("请选择一条报废单记录");
    return null;
  }
  return scrapId;
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
        scrapId: abandonForm.value.scrapId,
        voidDescription: abandonForm.value.voidDescription,
      };
      voidScrapOrder(abandonData).then(() => {
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
    "stock/scrapOrder/export",
    {
      ...queryParams.value,
    },
    `scrapOrder_${new Date().getTime()}.xlsx`,
  );
}

getList();
</script>
