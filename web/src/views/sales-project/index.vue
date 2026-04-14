<template>
  <div class="app-container sales-project-page">
    <el-alert
      title="销售项目页面用于维护项目主档、查看项目供货读模型，并按项目上下文生成销售出库草稿。"
      type="info"
      :closable="false"
      show-icon
      style="margin-bottom: 16px"
    />

    <el-form
      ref="queryRef"
      :model="queryParams"
      :inline="true"
      v-show="showSearch"
      label-width="96px"
    >
      <el-form-item label="项目编码" prop="salesProjectCode">
        <el-input
          v-model="queryParams.salesProjectCode"
          placeholder="请输入项目编码"
          clearable
          style="width: 220px"
          @keyup.enter="handleQuery"
        />
      </el-form-item>
      <el-form-item label="项目名称" prop="salesProjectName">
        <el-input
          v-model="queryParams.salesProjectName"
          placeholder="请输入项目名称"
          clearable
          style="width: 220px"
          @keyup.enter="handleQuery"
        />
      </el-form-item>
      <el-form-item label="客户">
        <el-select
          v-model="queryParams.customerId"
          filterable
          remote
          reserve-keyword
          clearable
          placeholder="请输入客户名称搜索"
          style="width: 220px"
          :remote-method="searchCustomers"
          :loading="customerLoading"
        >
          <el-option
            v-for="item in customerOptions"
            :key="item.customerId"
            :label="item.customerName"
            :value="item.customerId"
          >
            <span style="float: left">{{ item.customerName }}</span>
            <span style="float: right; color: #909399">{{ item.customerCode }}</span>
          </el-option>
        </el-select>
      </el-form-item>
      <el-form-item label="车间">
        <el-select
          v-model="queryParams.workshopId"
          filterable
          remote
          reserve-keyword
          clearable
          placeholder="请输入车间名称搜索"
          style="width: 220px"
          :remote-method="searchWorkshops"
          :loading="workshopLoading"
        >
          <el-option
            v-for="item in workshopOptions"
            :key="item.workshopId"
            :label="item.workshopName"
            :value="item.workshopId"
          />
        </el-select>
      </el-form-item>
      <el-form-item label="业务日期">
        <el-date-picker
          v-model="daterangeBizDate"
          value-format="YYYY-MM-DD"
          type="daterange"
          range-separator="-"
          start-placeholder="开始日期"
          end-placeholder="结束日期"
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
          v-hasPermi="['sales:project:create']"
          @click="handleAdd"
        >
          新增项目
        </el-button>
      </el-col>
      <right-toolbar
        v-model:showSearch="showSearch"
        :columns="columns"
        @queryTable="getList"
      />
    </el-row>

    <adaptive-table border stripe v-loading="loading" :data="rows">
      <el-table-column
        v-if="columns[0].visible"
        label="项目编码"
        prop="salesProjectCode"
        min-width="160"
        show-overflow-tooltip
      >
        <template #default="{ row }">
          <el-button
            link
            type="primary"
            v-hasPermi="['sales:project:get']"
            @click="handleOpenDetail(row)"
          >
            {{ row.salesProjectCode }}
          </el-button>
        </template>
      </el-table-column>
      <el-table-column
        v-if="columns[1].visible"
        label="项目名称"
        prop="salesProjectName"
        min-width="200"
        show-overflow-tooltip
      />
      <el-table-column
        v-if="columns[2].visible"
        label="业务日期"
        prop="bizDate"
        width="120"
      >
        <template #default="{ row }">
          {{ formatDate(row.bizDate) }}
        </template>
      </el-table-column>
      <el-table-column
        v-if="columns[3].visible"
        label="客户"
        prop="customerName"
        min-width="180"
        show-overflow-tooltip
      />
      <el-table-column
        v-if="columns[4].visible"
        label="负责人"
        prop="managerName"
        min-width="140"
        show-overflow-tooltip
      />
      <el-table-column
        v-if="columns[5].visible"
        label="车间"
        prop="workshopName"
        min-width="140"
        show-overflow-tooltip
      />
      <el-table-column
        v-if="columns[6].visible"
        label="目标数量"
        width="110"
        align="right"
      >
        <template #default="{ row }">
          {{ formatNumber(row.summary?.totalTargetQty) }}
        </template>
      </el-table-column>
      <el-table-column
        v-if="columns[7].visible"
        label="净发货"
        width="110"
        align="right"
      >
        <template #default="{ row }">
          {{ formatNumber(row.summary?.totalNetShipmentQty) }}
        </template>
      </el-table-column>
      <el-table-column
        v-if="columns[8].visible"
        label="待供货"
        width="110"
        align="right"
      >
        <template #default="{ row }">
          {{ formatNumber(row.summary?.totalPendingSupplyQty) }}
        </template>
      </el-table-column>
      <el-table-column
        v-if="columns[9].visible"
        label="备注"
        prop="remark"
        min-width="180"
        show-overflow-tooltip
      />
      <el-table-column label="操作" width="260" align="center" fixed="right">
        <template #default="{ row }">
          <el-button
            link
            type="primary"
            v-hasPermi="['sales:project:get']"
            @click="handleOpenDetail(row)"
          >
            详情
          </el-button>
          <el-button
            link
            type="primary"
            v-hasPermi="['sales:project:update']"
            @click="handleEdit(row)"
          >
            修改
          </el-button>
          <el-button
            link
            type="danger"
            v-hasPermi="['sales:project:void']"
            @click="handleVoid(row)"
          >
            作废
          </el-button>
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

    <sales-project-form-dialog
      v-model="projectFormOpen"
      :project-id="editingProjectId"
      @submitted="handleProjectSubmitted"
    />
  </div>
</template>

<script setup name="SalesProjectLedgerPage">
import { getCurrentInstance, reactive, ref, watch } from "vue";
import { useRouter } from "vue-router";
import { listCustomerByKeyword } from "@/api/base/customer";
import { listByNameOrContact } from "@/api/base/workshop";
import {
  listSalesProjects,
  voidSalesProject,
} from "@/api/sales-project";
import SalesProjectFormDialog from "./components/SalesProjectFormDialog.vue";
import {
  buildSalesProjectDetailPath,
  formatDate,
  formatNumber,
} from "./shared";

const router = useRouter();
const { proxy } = getCurrentInstance();

const showSearch = ref(true);
const loading = ref(false);
const rows = ref([]);
const total = ref(0);
const daterangeBizDate = ref([]);

const customerOptions = ref([]);
const workshopOptions = ref([]);

const customerLoading = ref(false);
const workshopLoading = ref(false);

const projectFormOpen = ref(false);
const editingProjectId = ref(undefined);

const queryParams = reactive({
  pageNum: 1,
  pageSize: 30,
  salesProjectCode: "",
  salesProjectName: "",
  customerId: undefined,
  workshopId: undefined,
});

const columns = ref([
  { key: 0, label: "项目编码", visible: true },
  { key: 1, label: "项目名称", visible: true },
  { key: 2, label: "业务日期", visible: true },
  { key: 3, label: "客户", visible: true },
  { key: 4, label: "负责人", visible: true },
  { key: 5, label: "车间", visible: true },
  { key: 6, label: "目标数量", visible: true },
  { key: 7, label: "净发货", visible: true },
  { key: 8, label: "待供货", visible: true },
  { key: 9, label: "备注", visible: true },
]);

async function searchCustomers(keyword) {
  customerLoading.value = true;
  try {
    const response = await listCustomerByKeyword(keyword);
    customerOptions.value = response.rows || [];
  } finally {
    customerLoading.value = false;
  }
}

async function searchWorkshops(keyword) {
  workshopLoading.value = true;
  try {
    const response = await listByNameOrContact({
      workshopName: keyword,
    });
    workshopOptions.value = response.rows || [];
  } finally {
    workshopLoading.value = false;
  }
}

function buildQuery() {
  return {
    ...queryParams,
    params:
      daterangeBizDate.value.length === 2
        ? {
            beginTime: daterangeBizDate.value[0],
            endTime: daterangeBizDate.value[1],
          }
        : undefined,
  };
}

async function getList() {
  loading.value = true;
  try {
    const response = await listSalesProjects(buildQuery());
    rows.value = response.rows || [];
    total.value = response.total || 0;
  } finally {
    loading.value = false;
  }
}

function handleQuery() {
  queryParams.pageNum = 1;
  void getList();
}

function resetQuery() {
  daterangeBizDate.value = [];
  proxy.resetForm("queryRef");
  queryParams.pageNum = 1;
  queryParams.pageSize = 30;
  handleQuery();
}

function handleAdd() {
  editingProjectId.value = undefined;
  projectFormOpen.value = true;
}

function handleEdit(row) {
  editingProjectId.value = row.projectId;
  projectFormOpen.value = true;
}

async function handleVoid(row) {
  try {
    const { value } = await proxy.$modal.prompt("请输入作废说明（可选）");
    await voidSalesProject(row.projectId, {
      voidReason: value,
    });
    proxy.$modal.msgSuccess("销售项目作废成功");
    void getList();
  } catch {}
}

function handleOpenDetail(row) {
  router.push(buildSalesProjectDetailPath(row.projectId));
}

function handleProjectSubmitted() {
  projectFormOpen.value = false;
  void getList();
}

watch(projectFormOpen, (open) => {
  if (!open) {
    editingProjectId.value = undefined;
  }
});

void getList();
</script>
