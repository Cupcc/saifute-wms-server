<template>
  <div class="app-container monthly-reporting-page">
    <el-card shadow="never">
      <template #header>
        <div class="page-header">
          <div>
            <div class="page-title">月度对账报表</div>
            <div class="page-subtitle">
              先看仓库总入、总出和净发生，再按领域查看业务操作。研发项目表示 RD 内部项目领用，
              RD小仓表示主仓到研发小仓交接等仓务；销售项目在下方业务汇总中查看。
            </div>
          </div>
          <el-button
            v-hasPermi="['reporting:export']"
            type="success"
            :loading="exporting"
            @click="handleExport"
          >
            导出 Excel
          </el-button>
        </div>
      </template>

      <el-form :inline="true" :model="filters" class="query-form">
        <el-form-item label="月份">
          <el-date-picker
            v-model="filters.yearMonth"
            type="month"
            value-format="YYYY-MM"
            placeholder="选择月份"
            style="width: 180px"
          />
        </el-form-item>
        <el-form-item label="仓别">
          <el-select
            v-model="filters.stockScope"
            :disabled="isStockScopeLocked"
            :clearable="!isStockScopeLocked"
            placeholder="全部仓别"
            style="width: 180px"
          >
            <el-option
              v-for="item in stockScopeOptions"
              :key="item.value"
              :label="item.label"
              :value="item.value"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="车间">
          <el-select
            v-model="filters.workshopId"
            :disabled="isWorkshopLocked"
            :clearable="!isWorkshopLocked"
            filterable
            placeholder="全部车间"
            style="width: 220px"
          >
            <el-option
              v-for="item in workshopOptions"
              :key="item.workshopId"
              :label="item.workshopName"
              :value="item.workshopId"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="领域">
          <el-select
            v-model="filters.domainKey"
            clearable
            placeholder="全部领域"
            style="width: 180px"
            @change="handleDomainChange"
          >
            <el-option
              v-for="item in domainOptions"
              :key="item.domainKey"
              :label="item.domainLabel"
              :value="item.domainKey"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="操作">
          <el-select
            v-model="filters.topicKey"
            clearable
            filterable
            placeholder="全部操作"
            style="width: 220px"
          >
            <el-option
              v-for="item in filteredTopicOptions"
              :key="item.topicKey"
              :label="`${item.domainLabel} / ${item.topicLabel}`"
              :value="item.topicKey"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="异常单据">
          <el-switch v-model="filters.abnormalOnly" />
        </el-form-item>
        <el-form-item label="关键字">
          <el-input
            v-model="filters.keyword"
            clearable
            placeholder="单据号 / 操作 / 销售项目 / 来源单据"
            style="width: 280px"
            @keyup.enter="handleSearch"
          />
        </el-form-item>
        <el-form-item>
          <el-button type="primary" @click="handleSearch">查询</el-button>
          <el-button @click="handleReset">重置</el-button>
        </el-form-item>
      </el-form>

      <el-row :gutter="16" class="summary-row">
        <el-col :xs="24" :sm="12" :lg="4">
          <div class="stat-box">
            <div class="stat-label">总入金额</div>
            <div class="stat-value">{{ summary.totalInAmount }}</div>
          </div>
        </el-col>
        <el-col :xs="24" :sm="12" :lg="4">
          <div class="stat-box">
            <div class="stat-label">总出金额</div>
            <div class="stat-value">{{ summary.totalOutAmount }}</div>
          </div>
        </el-col>
        <el-col :xs="24" :sm="12" :lg="4">
          <div class="stat-box">
            <div class="stat-label">交接金额</div>
            <div class="stat-value">{{ summary.totalTransferAmount }}</div>
          </div>
        </el-col>
        <el-col :xs="24" :sm="12" :lg="4">
          <div class="stat-box">
            <div class="stat-label">净发生金额</div>
            <div class="stat-value">{{ summary.netAmount }}</div>
          </div>
        </el-col>
        <el-col :xs="24" :sm="12" :lg="4">
          <div class="stat-box danger-box">
            <div class="stat-label">异常单据数</div>
            <div class="stat-value">{{ summary.abnormalDocumentCount }}</div>
          </div>
        </el-col>
        <el-col :xs="24" :sm="12" :lg="4">
          <div class="stat-box">
            <div class="stat-label">单据数</div>
            <div class="stat-value">{{ summary.documentCount }}</div>
          </div>
        </el-col>
      </el-row>

      <el-card shadow="never" class="section-card">
        <template #header>
          <div class="section-header">
            <span>领域汇总</span>
            <span class="section-tip">
              先看当前筛选范围内各领域的总入、总出、交接和净发生。
            </span>
          </div>
        </template>
        <div class="domain-legend">
          <span class="legend-item">
            <strong>研发项目</strong>：查看 RD 内部项目领用、退回和报废。
          </span>
          <span class="legend-item">
            <strong>RD小仓</strong>：查看主仓到研发小仓交接，以及后续盘盈盘亏等小仓仓务。
          </span>
          <span class="legend-item">
            <strong>销售项目</strong>：属于销售域下的业务汇总，不单列为一级领域。
          </span>
        </div>
        <el-table :data="domainRows" stripe v-loading="summaryLoading">
          <el-table-column prop="domainLabel" label="领域" min-width="140" />
          <el-table-column prop="documentCount" label="单据数" min-width="100" />
          <el-table-column prop="abnormalDocumentCount" label="异常单据数" min-width="120" />
          <el-table-column prop="totalInAmount" label="总入金额" min-width="140" />
          <el-table-column prop="totalOutAmount" label="总出金额" min-width="140" />
          <el-table-column prop="totalTransferAmount" label="交接金额" min-width="140" />
          <el-table-column prop="netAmount" label="净发生金额" min-width="140" />
          <el-table-column prop="totalCost" label="总成本" min-width="140" />
        </el-table>
      </el-card>

      <el-card shadow="never" class="section-card">
        <template #header>
          <div class="section-header">
            <span>业务操作汇总</span>
            <div class="detail-actions">
              <span class="section-tip">{{ activeTopicLabel }}</span>
              <el-button v-if="filters.topicKey" text type="primary" @click="clearTopicFilter">
                查看全部操作
              </el-button>
            </div>
          </div>
        </template>
        <el-table
          :data="topicRows"
          stripe
          row-key="topicKey"
          v-loading="summaryLoading"
          :row-class-name="resolveTopicRowClassName"
          @row-click="handleTopicRowClick"
        >
          <el-table-column prop="domainLabel" label="领域" min-width="120" />
          <el-table-column prop="topicLabel" label="操作" min-width="160" />
          <el-table-column prop="documentCount" label="单据数" min-width="100" />
          <el-table-column prop="abnormalDocumentCount" label="异常单据数" min-width="120" />
          <el-table-column prop="totalInAmount" label="总入金额" min-width="140" />
          <el-table-column prop="totalOutAmount" label="总出金额" min-width="140" />
          <el-table-column prop="totalTransferAmount" label="交接金额" min-width="140" />
          <el-table-column prop="netAmount" label="净发生金额" min-width="140" />
          <el-table-column prop="totalCost" label="总成本" min-width="140" />
        </el-table>
      </el-card>

      <el-card v-if="businessSummaryTabs.length > 0" shadow="never" class="section-card">
        <template #header>
          <div class="section-header">
            <span>业务汇总</span>
            <span class="section-tip">{{ activeBusinessSummaryTip }}</span>
          </div>
        </template>
        <el-tabs v-model="activeBusinessSummaryTab" class="business-summary-tabs">
          <el-tab-pane
            v-if="workshopRows.length > 0"
            label="车间汇总"
            name="workshop"
          >
            <el-table :data="workshopRows" stripe v-loading="summaryLoading">
              <el-table-column prop="workshopName" label="车间" min-width="160" />
              <el-table-column prop="documentCount" label="单据数" min-width="100" />
              <el-table-column prop="abnormalDocumentCount" label="异常单据数" min-width="120" />
              <el-table-column prop="pickAmount" label="领料金额" min-width="140" />
              <el-table-column prop="returnAmount" label="退料金额" min-width="140" />
              <el-table-column prop="scrapAmount" label="报废金额" min-width="140" />
              <el-table-column prop="netAmount" label="净发生金额" min-width="140" />
              <el-table-column prop="totalCost" label="总成本" min-width="140" />
            </el-table>
          </el-tab-pane>
          <el-tab-pane
            v-if="salesProjectRows.length > 0"
            label="销售项目汇总"
            name="salesProject"
          >
            <el-table :data="salesProjectRows" stripe v-loading="summaryLoading">
              <el-table-column prop="salesProjectCode" label="销售项目编码" min-width="160" />
              <el-table-column prop="salesProjectName" label="销售项目名称" min-width="180" />
              <el-table-column prop="documentCount" label="单据数" min-width="100" />
              <el-table-column prop="abnormalDocumentCount" label="异常单据数" min-width="120" />
              <el-table-column prop="salesOutboundAmount" label="销售出库金额" min-width="140" />
              <el-table-column prop="salesReturnAmount" label="销售退货金额" min-width="140" />
              <el-table-column prop="netAmount" label="净发生金额" min-width="140" />
              <el-table-column prop="totalCost" label="总成本" min-width="140" />
            </el-table>
          </el-tab-pane>
          <el-tab-pane
            v-if="rdProjectRows.length > 0"
            label="研发项目汇总"
            name="rdProject"
          >
            <el-table :data="rdProjectRows" stripe v-loading="summaryLoading">
              <el-table-column prop="rdProjectCode" label="研发项目编码" min-width="160" />
              <el-table-column prop="rdProjectName" label="研发项目名称" min-width="180" />
              <el-table-column prop="documentCount" label="单据数" min-width="100" />
              <el-table-column prop="abnormalDocumentCount" label="异常单据数" min-width="120" />
              <el-table-column prop="pickAmount" label="项目领用金额" min-width="140" />
              <el-table-column prop="returnAmount" label="项目退回金额" min-width="140" />
              <el-table-column prop="scrapAmount" label="项目报废金额" min-width="140" />
              <el-table-column prop="netAmount" label="净发生金额" min-width="140" />
              <el-table-column prop="totalCost" label="总成本" min-width="140" />
            </el-table>
          </el-tab-pane>
          <el-tab-pane
            v-if="rdHandoffRows.length > 0"
            label="主仓到RD交接汇总"
            name="rdHandoff"
          >
            <el-table :data="rdHandoffRows" stripe v-loading="summaryLoading">
              <el-table-column prop="sourceStockScopeName" label="来源仓别" min-width="140" />
              <el-table-column prop="targetStockScopeName" label="目标仓别" min-width="140" />
              <el-table-column prop="sourceWorkshopName" label="来源车间" min-width="160" />
              <el-table-column prop="targetWorkshopName" label="目标车间" min-width="160" />
              <el-table-column prop="documentCount" label="单据数" min-width="100" />
              <el-table-column prop="abnormalDocumentCount" label="异常单据数" min-width="120" />
              <el-table-column prop="transferAmount" label="交接金额" min-width="140" />
              <el-table-column prop="totalCost" label="总成本" min-width="140" />
            </el-table>
          </el-tab-pane>
        </el-tabs>
      </el-card>

      <el-card shadow="never" class="section-card">
        <template #header>
          <div class="section-header">
            <span>单据头明细</span>
            <span class="section-tip">点击上面的业务操作可快速切到对应单据头明细。</span>
          </div>
        </template>
        <el-table :data="detailRows" stripe v-loading="detailLoading">
          <el-table-column prop="domainLabel" label="领域" min-width="120" />
          <el-table-column prop="topicLabel" label="操作" min-width="160" />
          <el-table-column prop="documentTypeLabel" label="单据类型" min-width="140" />
          <el-table-column prop="documentNo" label="单据编号" min-width="180" />
          <el-table-column prop="bizDate" label="业务日期" min-width="120" />
          <el-table-column prop="stockScopeName" label="仓别" min-width="140" />
          <el-table-column prop="workshopName" label="车间" min-width="140" />
          <el-table-column prop="salesProjectLabel" label="销售项目" min-width="180" show-overflow-tooltip />
          <el-table-column prop="rdProjectCode" label="研发项目编码" min-width="160" />
          <el-table-column prop="rdProjectName" label="研发项目名称" min-width="180" show-overflow-tooltip />
          <el-table-column prop="sourceStockScopeName" label="来源仓别" min-width="140" />
          <el-table-column prop="targetStockScopeName" label="目标仓别" min-width="140" />
          <el-table-column prop="sourceWorkshopName" label="来源车间" min-width="140" />
          <el-table-column prop="targetWorkshopName" label="目标车间" min-width="140" />
          <el-table-column prop="quantity" label="数量" min-width="120" />
          <el-table-column prop="amount" label="金额" min-width="120" />
          <el-table-column prop="cost" label="成本" min-width="120" />
          <el-table-column label="异常标识" min-width="220">
            <template #default="{ row }">
              <div v-if="row.abnormalLabels.length > 0" class="tag-wrap">
                <el-tag
                  v-for="tag in row.abnormalLabels"
                  :key="`${row.documentNo}-${tag}`"
                  size="small"
                  effect="plain"
                  type="danger"
                >
                  {{ tag }}
                </el-tag>
              </div>
              <span v-else>-</span>
            </template>
          </el-table-column>
          <el-table-column prop="sourceBizMonth" label="来源月份" min-width="120" />
          <el-table-column prop="sourceDocumentNo" label="来源单据" min-width="200" show-overflow-tooltip />
        </el-table>

        <div class="pagination-wrap">
          <el-pagination
            background
            layout="total, sizes, prev, pager, next"
            :current-page="pageNum"
            :page-size="pageSize"
            :page-sizes="[10, 20, 50]"
            :total="detailTotal"
            @current-change="handlePageChange"
            @size-change="handleSizeChange"
          />
        </div>
      </el-card>
    </el-card>
  </div>
</template>

<script setup name="MonthlyReportingPage">
import { computed, onMounted, ref } from "vue";
import { listWorkshop } from "@/api/base/workshop";
import {
  exportMonthlyReporting,
  getMonthlyReportingDetails,
  getMonthlyReportingSummary,
} from "@/api/reporting";
import useUserStore from "@/store/modules/user";

const userStore = useUserStore();

const summaryLoading = ref(false);
const detailLoading = ref(false);
const exporting = ref(false);
const pageNum = ref(1);
const pageSize = ref(10);
const workshopOptions = ref([]);
const domainCatalog = ref([]);
const topicCatalog = ref([]);
const domainRows = ref([]);
const topicRows = ref([]);
const workshopRows = ref([]);
const salesProjectRows = ref([]);
const rdProjectRows = ref([]);
const rdHandoffRows = ref([]);
const detailRows = ref([]);
const detailTotal = ref(0);
const summary = ref(createEmptySummary());
const activeBusinessSummaryTab = ref("workshop");

const fixedStockScope = computed(() =>
  userStore.stockScope?.mode === "FIXED"
    ? userStore.stockScope.stockScope
    : undefined,
);
const fixedWorkshopId = computed(() =>
  userStore.workshopScope?.mode === "FIXED"
    ? userStore.workshopScope.workshopId
    : undefined,
);
const isStockScopeLocked = computed(() => Boolean(fixedStockScope.value));
const isWorkshopLocked = computed(
  () => typeof fixedWorkshopId.value === "number",
);
const stockScopeOptions = computed(() => {
  const allOptions = [
    { label: "主仓", value: "MAIN" },
    { label: "研发小仓", value: "RD_SUB" },
  ];

  if (!fixedStockScope.value) {
    return allOptions;
  }

  return allOptions.filter((item) => item.value === fixedStockScope.value);
});
const domainOptions = computed(() => domainCatalog.value);
const filteredTopicOptions = computed(() => {
  if (!filters.value.domainKey) {
    return topicCatalog.value;
  }

  return topicCatalog.value.filter(
    (item) => item.domainKey === filters.value.domainKey,
  );
});
const filters = ref(createDefaultFilters());

const activeTopicLabel = computed(() => {
  if (!filters.value.topicKey) {
    return "当前显示全部操作明细";
  }

  const current = topicCatalog.value.find(
    (item) => item.topicKey === filters.value.topicKey,
  );

  return current
    ? `当前显示 ${current.domainLabel} / ${current.topicLabel} 明细`
    : "当前显示操作明细";
});
const businessSummaryTabs = computed(() => {
  const tabs = [];

  if (workshopRows.value.length > 0) {
    tabs.push({
      key: "workshop",
      tip: "按车间查看领料、退料和报废。",
    });
  }

  if (salesProjectRows.value.length > 0) {
    tabs.push({
      key: "salesProject",
      tip: "按销售项目查看销售出库和销售退货。",
    });
  }

  if (rdProjectRows.value.length > 0) {
    tabs.push({
      key: "rdProject",
      tip: "按研发项目查看项目领用、项目退回和项目报废。",
    });
  }

  if (rdHandoffRows.value.length > 0) {
    tabs.push({
      key: "rdHandoff",
      tip: "按来源仓别、目标仓别和来源目标车间查看交接。",
    });
  }

  return tabs;
});
const activeBusinessSummaryTip = computed(
  () =>
    businessSummaryTabs.value.find(
      (item) => item.key === activeBusinessSummaryTab.value,
    )?.tip || "切换查看不同业务锚点的汇总。",
);

function createEmptySummary() {
  return {
    domainCount: 0,
    documentCount: 0,
    abnormalDocumentCount: 0,
    totalInQuantity: "0.000000",
    totalInAmount: "0.00",
    totalOutQuantity: "0.000000",
    totalOutAmount: "0.00",
    totalTransferQuantity: "0.000000",
    totalTransferAmount: "0.00",
    netQuantity: "0.000000",
    netAmount: "0.00",
    totalCost: "0.00",
  };
}

function getDefaultMonth() {
  return new Date().toISOString().slice(0, 7);
}

function createDefaultFilters() {
  return {
    yearMonth: getDefaultMonth(),
    stockScope: fixedStockScope.value,
    workshopId: fixedWorkshopId.value,
    domainKey: undefined,
    topicKey: undefined,
    abnormalOnly: false,
    keyword: "",
  };
}

function buildBaseQuery() {
  return {
    yearMonth: filters.value.yearMonth,
    stockScope: filters.value.stockScope || undefined,
    workshopId: filters.value.workshopId,
    domainKey: filters.value.domainKey,
    topicKey: filters.value.topicKey,
    abnormalOnly: filters.value.abnormalOnly || undefined,
    keyword: filters.value.keyword?.trim() || undefined,
  };
}

async function loadWorkshopOptions() {
  const response = await listWorkshop({
    pageNum: 1,
    pageSize: 100,
    limit: 100,
    offset: 0,
  });
  const rows = response.rows || [];

  if (!isWorkshopLocked.value) {
    workshopOptions.value = rows;
    return;
  }

  const matched = rows.find(
    (item) => item.workshopId === fixedWorkshopId.value,
  );

  workshopOptions.value = matched
    ? [matched]
    : [
        {
          workshopId: fixedWorkshopId.value,
          workshopName: userStore.workshopScope?.workshopName || "当前车间",
        },
      ];
}

async function loadSummary() {
  summaryLoading.value = true;
  try {
    const response = await getMonthlyReportingSummary(buildBaseQuery());
    const data = response.data || {};
    domainCatalog.value = data.domainCatalog || [];
    topicCatalog.value = data.topicCatalog || [];
    summary.value = data.summary || createEmptySummary();
    domainRows.value = data.domains || [];
    topicRows.value = data.topics || [];
    workshopRows.value = data.workshopItems || [];
    salesProjectRows.value = data.salesProjectItems || [];
    rdProjectRows.value = data.rdProjectItems || [];
    rdHandoffRows.value = data.rdHandoffItems || [];
    syncBusinessSummaryTab();
  } finally {
    summaryLoading.value = false;
  }
}

async function loadDetails() {
  detailLoading.value = true;
  try {
    const response = await getMonthlyReportingDetails({
      ...buildBaseQuery(),
      limit: pageSize.value,
      offset: (pageNum.value - 1) * pageSize.value,
    });
    detailRows.value = response.data?.items || [];
    detailTotal.value = response.data?.total || 0;
  } finally {
    detailLoading.value = false;
  }
}

async function loadPage() {
  await Promise.all([loadSummary(), loadDetails()]);
}

function handleSearch() {
  pageNum.value = 1;
  loadPage();
}

function handleReset() {
  filters.value = createDefaultFilters();
  pageNum.value = 1;
  loadPage();
}

function handlePageChange(value) {
  pageNum.value = value;
  loadDetails();
}

function handleSizeChange(value) {
  pageSize.value = value;
  pageNum.value = 1;
  loadDetails();
}

function handleTopicRowClick(row) {
  filters.value.topicKey = row.topicKey;
  pageNum.value = 1;
  loadDetails();
}

function handleDomainChange() {
  if (
    filters.value.topicKey &&
    !filteredTopicOptions.value.some(
      (item) => item.topicKey === filters.value.topicKey,
    )
  ) {
    filters.value.topicKey = undefined;
  }

  syncBusinessSummaryTab();
}

function clearTopicFilter() {
  filters.value.topicKey = undefined;
  pageNum.value = 1;
  loadDetails();
}

function resolvePreferredBusinessSummaryTab() {
  switch (filters.value.domainKey) {
    case "WORKSHOP":
      return workshopRows.value.length > 0 ? "workshop" : null;
    case "SALES":
      return salesProjectRows.value.length > 0 ? "salesProject" : null;
    case "RD_PROJECT":
      return rdProjectRows.value.length > 0 ? "rdProject" : null;
    case "RD_SUB":
      return rdHandoffRows.value.length > 0 ? "rdHandoff" : null;
    default:
      return null;
  }
}

function syncBusinessSummaryTab() {
  const preferredTab = resolvePreferredBusinessSummaryTab();
  if (preferredTab) {
    activeBusinessSummaryTab.value = preferredTab;
    return;
  }

  const availableTabs = businessSummaryTabs.value.map((item) => item.key);
  if (availableTabs.length === 0) {
    activeBusinessSummaryTab.value = "";
    return;
  }

  if (!availableTabs.includes(activeBusinessSummaryTab.value)) {
    [activeBusinessSummaryTab.value] = availableTabs;
  }
}

function resolveTopicRowClassName({ row }) {
  return row.topicKey === filters.value.topicKey ? "is-active-topic" : "";
}

async function handleExport() {
  exporting.value = true;
  try {
    await exportMonthlyReporting(buildBaseQuery());
  } finally {
    exporting.value = false;
  }
}

onMounted(async () => {
  await loadWorkshopOptions();
  await loadPage();
});
</script>

<style scoped lang="scss">
.monthly-reporting-page {
  .page-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
  }

  .page-title {
    font-size: 20px;
    font-weight: 600;
    color: #303133;
  }

  .page-subtitle {
    margin-top: 6px;
    color: #909399;
    font-size: 13px;
  }

  .query-form {
    margin-bottom: 16px;
  }

  .summary-row {
    margin-bottom: 16px;
  }

  .section-card + .section-card {
    margin-top: 16px;
  }

  .domain-legend {
    display: flex;
    flex-wrap: wrap;
    gap: 12px;
    margin-bottom: 12px;
  }

  .legend-item {
    font-size: 12px;
    color: #606266;
    background: #f5f7fa;
    border: 1px solid #ebeef5;
    border-radius: 999px;
    padding: 6px 12px;
    line-height: 1.4;
  }

  .section-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    font-weight: 600;
  }

  .section-tip {
    color: #909399;
    font-size: 12px;
    font-weight: 400;
  }

  .detail-actions {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .business-summary-tabs {
    :deep(.el-tabs__header) {
      margin-bottom: 16px;
    }
  }

  .stat-box {
    border: 1px solid #ebeef5;
    border-radius: 6px;
    padding: 14px 16px;
    background: linear-gradient(180deg, #ffffff 0%, #fafcff 100%);
    height: 100%;
  }

  .danger-box {
    border-color: #fbc4c4;
    background: linear-gradient(180deg, #fff7f7 0%, #fffdfd 100%);
  }

  .stat-label {
    color: #909399;
    font-size: 13px;
    margin-bottom: 8px;
  }

  .stat-value {
    color: #303133;
    font-size: 26px;
    font-weight: 600;
    line-height: 1.1;
    word-break: break-word;
  }

  .tag-wrap {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }

  .pagination-wrap {
    display: flex;
    justify-content: flex-end;
    margin-top: 16px;
  }
}

:deep(.el-table .is-active-topic) {
  --el-table-tr-bg-color: #f0f9eb;
}
</style>
