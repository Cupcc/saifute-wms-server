<template>
  <div class="app-container">
    <el-form :model="queryParams" ref="queryRef" :inline="true" v-show="showSearch" label-width="68px">
      <el-form-item label="关联报废单主表的scrap_id" prop="scrapId">
        <el-input
          v-model="queryParams.scrapId"
          placeholder="请输入关联报废单主表的scrap_id"
          clearable
          style="width: 240px"
          @keyup.enter="handleQuery"
        />
      </el-form-item>
      <el-form-item label="物料ID" prop="materialId">
        <el-input
          v-model="queryParams.materialId"
          placeholder="请输入物料ID"
          clearable
          style="width: 240px"
          @keyup.enter="handleQuery"
        />
      </el-form-item>
      <el-form-item label="库位ID" prop="locationId">
        <el-input
          v-model="queryParams.locationId"
          placeholder="请输入库位ID"
          clearable
          style="width: 240px"
          @keyup.enter="handleQuery"
        />
      </el-form-item>
      <el-form-item label="申请报废数量" prop="scrapQty">
        <el-input
          v-model="queryParams.scrapQty"
          placeholder="请输入申请报废数量"
          clearable
          style="width: 240px"
          @keyup.enter="handleQuery"
        />
      </el-form-item>
      <el-form-item label="报废原因：1-过期 2-损坏 3-不合格 4-呆滞料 5-其他" prop="scrapReason">
        <el-input
          v-model="queryParams.scrapReason"
          placeholder="请输入报废原因：1-过期 2-损坏 3-不合格 4-呆滞料 5-其他"
          clearable
          style="width: 240px"
          @keyup.enter="handleQuery"
        />
      </el-form-item>
      <el-form-item label="单位" prop="unit">
        <combo-input v-model="queryParams.unit" scope="material" field="unitCode" placeholder="请选择或输入单位" width="240px" />
      </el-form-item>
      <el-form-item label="预估损失金额" prop="estimatedLoss">
        <el-input
          v-model="queryParams.estimatedLoss"
          placeholder="请输入预估损失金额"
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
      <right-toolbar v-model:showSearch="showSearch" @queryTable="getList" :columns="columns"></right-toolbar>
    </el-row>

    <adaptive-table border stripe v-loading="loading" :data="scrapDetailList">
      <el-table-column type="index" width="50" align="center" />
      <el-table-column sortable show-overflow-tooltip label="明细ID" align="center" prop="detailId" key="detailId" v-if="columns[0].visible"/>
      <el-table-column sortable show-overflow-tooltip label="关联报废单主表的scrap_id" align="center" prop="scrapId" v-if="columns[1].visible" />
      <el-table-column sortable show-overflow-tooltip label="物料ID" align="center" prop="materialId" v-if="columns[2].visible" />
      <el-table-column sortable show-overflow-tooltip label="库位ID" align="center" prop="locationId" v-if="columns[3].visible" />
      <el-table-column sortable show-overflow-tooltip label="申请报废数量" align="center" prop="scrapQty" v-if="columns[4].visible" />
      <el-table-column sortable show-overflow-tooltip label="报废原因：1-过期 2-损坏 3-不合格 4-呆滞料 5-其他" align="center" prop="scrapReason" v-if="columns[5].visible" />
      <el-table-column sortable show-overflow-tooltip label="单位" align="center" prop="unit" v-if="columns[6].visible" />
      <el-table-column sortable show-overflow-tooltip label="预估损失金额" align="center" prop="estimatedLoss" v-if="columns[7].visible" />
      <el-table-column sortable show-overflow-tooltip label="明细备注" align="center" prop="remark" v-if="columns[8].visible" />
    </adaptive-table>
    
    <pagination
      v-show="total>0"
      :total="total"
      v-model:page="queryParams.pageNum"
      v-model:limit="queryParams.pageSize"
      @pagination="getList"
    />

    <!-- 添加或修改报废单明细对话框 -->
    <el-dialog :title="title" v-model="open" width="500px" append-to-body draggable v-loading="dialogLoading">
      <el-form ref="scrapDetailRef" :model="form" :rules="rules" label-width="80px">
        <el-form-item label="关联报废单主表的scrap_id" prop="scrapId">
          <el-input v-model="form.scrapId" placeholder="请输入关联报废单主表的scrap_id" />
        </el-form-item>
        <el-form-item label="物料ID" prop="materialId">
          <el-input v-model="form.materialId" placeholder="请输入物料ID" />
        </el-form-item>
        <el-form-item label="库位ID" prop="locationId">
          <el-input v-model="form.locationId" placeholder="请输入库位ID" />
        </el-form-item>
        <el-form-item label="申请报废数量" prop="scrapQty">
          <el-input v-model="form.scrapQty" placeholder="请输入申请报废数量" />
        </el-form-item>
        <el-form-item label="报废原因：1-过期 2-损坏 3-不合格 4-呆滞料 5-其他" prop="scrapReason">
          <el-input v-model="form.scrapReason" placeholder="请输入报废原因：1-过期 2-损坏 3-不合格 4-呆滞料 5-其他" />
        </el-form-item>
        <el-form-item label="单位" prop="unit">
          <combo-input v-model="form.unit" scope="material" field="unitCode" placeholder="请选择或输入单位" />
        </el-form-item>
        <el-form-item label="预估损失金额" prop="estimatedLoss">
          <el-input v-model="form.estimatedLoss" placeholder="请输入预估损失金额" />
        </el-form-item>
        <el-form-item label="明细备注" prop="remark">
          <el-input v-model="form.remark" placeholder="请输入明细备注" />
        </el-form-item>
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

<script setup name="ScrapDetail">
import {
  addScrapDetail,
  delScrapDetail,
  getScrapDetail,
  listScrapDetail,
  updateScrapDetail,
} from "@/api/stock/scrapDetail";

const { proxy } = getCurrentInstance();

const scrapDetailList = ref([]);
const open = ref(false);
const loading = ref(true);
const showSearch = ref(true);
const ids = ref([]);
const single = ref(true);
const multiple = ref(true);
const total = ref(0);
const title = ref("");
const dialogLoading = ref(false);

const data = reactive({
  form: {},
  queryParams: {
    pageNum: 1,
    pageSize: 30,
    scrapId: null,
    materialId: null,
    locationId: null,
    scrapQty: null,
    scrapReason: null,
    unit: null,
    estimatedLoss: null,
  },
  rules: {},
});

const { queryParams, form, rules } = toRefs(data);

// 添加columns数组定义
const columns = ref([
  { key: 0, label: `明细ID`, visible: true },
  { key: 1, label: `关联报废单主表的scrap_id`, visible: true },
  { key: 2, label: `物料ID`, visible: true },
  { key: 3, label: `库位ID`, visible: true },
  { key: 4, label: `申请报废数量`, visible: true },
  {
    key: 5,
    label: `报废原因：1-过期 2-损坏 3-不合格 4-呆滞料 5-其他`,
    visible: true,
  },
  { key: 6, label: `单位`, visible: true },
  { key: 7, label: `预估损失金额`, visible: true },
  { key: 8, label: `明细备注`, visible: true },
]);

/** 查询报废单明细列表 */
function getList() {
  loading.value = true;
  listScrapDetail(queryParams.value).then((response) => {
    scrapDetailList.value = response.rows;
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
    detailId: null,
    scrapId: null,
    materialId: null,
    locationId: null,
    scrapQty: null,
    scrapReason: null,
    unit: null,
    estimatedLoss: null,
    remark: null,
  };
  proxy.resetForm("scrapDetailRef");
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
  ids.value = selection.map((item) => item.detailId);
  single.value = selection.length !== 1;
  multiple.value = !selection.length;
}

/** 新增按钮操作 */
function handleAdd() {
  reset();
  open.value = true;
  title.value = "添加报废单明细";
}

/** 修改按钮操作 */
function handleUpdate(row) {
  reset();
  const _detailId = row.detailId || ids.value;
  open.value = true;
  title.value = "修改报废单明细";
  dialogLoading.value = true;
  getScrapDetail(_detailId)
    .then((response) => {
      form.value = response.data;
    })
    .finally(() => {
      dialogLoading.value = false;
    });
}

/** 提交按钮 */
function submitForm() {
  proxy.$refs["scrapDetailRef"].validate((valid) => {
    if (valid) {
      if (form.value.detailId != null) {
        updateScrapDetail(form.value).then((response) => {
          proxy.$modal.msgSuccess("修改成功");
          open.value = false;
          getList();
        });
      } else {
        addScrapDetail(form.value).then((response) => {
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
  const _detailIds = row.detailId || ids.value;
  proxy.$modal
    .confirm("是否确认作废报废单明细？")
    .then(() => delScrapDetail(_detailIds))
    .then(() => {
      getList();
      proxy.$modal.msgSuccess("作废成功");
    })
    .catch(() => {});
}

/** 导出按钮操作 */
function handleExport() {
  proxy.download(
    "stock/scrapDetail/export",
    {
      ...queryParams.value,
    },
    `scrapDetail_${new Date().getTime()}.xlsx`,
  );
}

getList();
</script>
