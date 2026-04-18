<template>
  <div class="app-container monthly-reporting-page">
    <el-card shadow="never">
      <template #header>
        <div class="page-header">
          <div>
            <div class="page-title">{{ pageTitle }}</div>
            <div class="page-subtitle">
              {{ reportingSubtitle }}
            </div>
          </div>
          <div class="page-actions">
            <el-button plain @click="handleNavigateToSiblingView">
              {{ siblingViewActionText }}
            </el-button>
            <el-button
              v-hasPermi="['reporting:export']"
              type="success"
              :loading="exporting"
              @click="handleExport"
            >
              导出 Excel
            </el-button>
          </div>
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
        <el-form-item v-if="!isMaterialCategoryView" label="领域">
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
        <el-form-item v-else label="分类">
          <el-select
            v-model="filters.categoryNodeKey"
            clearable
            filterable
            placeholder="全部分类"
            style="width: 280px"
          >
            <el-option
              v-for="item in categoryOptions"
              :key="item.nodeKey"
              :label="item.categoryLabel"
              :value="item.nodeKey"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="单据类型">
          <el-select
            v-model="filters.documentTypeLabel"
            clearable
            filterable
            placeholder="全部单据类型"
            style="width: 240px"
          >
            <el-option
              v-for="item in filteredDocumentTypeOptions"
              :key="`${item.domainKey}-${item.documentTypeLabel}`"
              :label="formatDocumentTypeOptionLabel(item)"
              :value="item.documentTypeLabel"
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
            :placeholder="keywordPlaceholder"
            style="width: 320px"
            @keyup.enter="handleSearch"
          />
        </el-form-item>
        <el-form-item>
          <el-button type="primary" @click="handleSearch">查询</el-button>
          <el-button @click="handleReset">重置</el-button>
        </el-form-item>
      </el-form>

      <el-row v-if="!isMaterialCategoryView" :gutter="16" class="summary-row">
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

      <el-row v-else :gutter="16" class="summary-row">
        <el-col :xs="24" :sm="12" :lg="4">
          <div class="stat-box">
            <div class="stat-label">验收入库金额</div>
            <div class="stat-value">{{ summary.acceptanceInboundAmount }}</div>
          </div>
        </el-col>
        <el-col :xs="24" :sm="12" :lg="4">
          <div class="stat-box">
            <div class="stat-label">生产入库金额</div>
            <div class="stat-value">{{ summary.productionReceiptAmount }}</div>
          </div>
        </el-col>
        <el-col :xs="24" :sm="12" :lg="4">
          <div class="stat-box">
            <div class="stat-label">销售出库金额</div>
            <div class="stat-value">{{ summary.salesOutboundAmount }}</div>
          </div>
        </el-col>
        <el-col :xs="24" :sm="12" :lg="4">
          <div class="stat-box">
            <div class="stat-label">销售退货金额</div>
            <div class="stat-value">{{ summary.salesReturnAmount }}</div>
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
            <div class="stat-label">单据行数</div>
            <div class="stat-value">{{ summary.lineCount }}</div>
          </div>
        </el-col>
      </el-row>

      <el-card v-if="!isMaterialCategoryView" shadow="never" class="section-card">
        <template #header>
          <div class="section-header">
            <span>领域汇总</span>
            <span class="section-tip">
              {{ domainSummaryTip }}
            </span>
          </div>
        </template>
        <div class="domain-legend">
          <span class="legend-item">
            <strong>研发项目</strong>：{{ rdProjectLegendText }}
          </span>
          <span class="legend-item">
            <strong>RD小仓</strong>：{{ rdSubLegendText }}
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
          <el-table-column prop="netAmount" label="净发生金额" min-width="140" />
          <el-table-column prop="totalCost" label="总成本" min-width="140" />
        </el-table>
      </el-card>

      <el-card v-if="!isMaterialCategoryView" shadow="never" class="section-card">
        <template #header>
          <div class="section-header">
            <span>单据类型汇总</span>
            <div class="detail-actions">
              <span class="section-tip">{{ activeDocumentTypeLabel }}</span>
              <el-button
                v-if="filters.documentTypeLabel"
                text
                type="primary"
                @click="clearDocumentTypeFilter"
              >
                查看全部单据类型
              </el-button>
            </div>
          </div>
        </template>
        <el-table
          :data="documentTypeRows"
          stripe
          :row-key="resolveDocumentTypeRowKey"
          v-loading="summaryLoading"
          :row-class-name="resolveDocumentTypeRowClassName"
          @row-click="handleDocumentTypeRowClick"
        >
          <el-table-column prop="domainLabel" label="领域" min-width="120" />
          <el-table-column prop="documentTypeLabel" label="单据类型" min-width="180" />
          <el-table-column prop="documentCount" label="单据数" min-width="100" />
          <el-table-column prop="abnormalDocumentCount" label="异常单据数" min-width="120" />
          <el-table-column prop="totalInAmount" label="总入金额" min-width="140" />
          <el-table-column prop="totalOutAmount" label="总出金额" min-width="140" />
          <el-table-column prop="netAmount" label="净发生金额" min-width="140" />
          <el-table-column prop="totalCost" label="总成本" min-width="140" />
        </el-table>
      </el-card>

      <el-card
        v-if="!isMaterialCategoryView && businessSummaryTabs.length > 0"
        shadow="never"
        class="section-card"
      >
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
              <el-table-column prop="handoffInAmount" label="项目交接入金额" min-width="140" />
              <el-table-column prop="pickAmount" label="项目领用金额" min-width="140" />
              <el-table-column prop="returnAmount" label="项目退回金额" min-width="140" />
              <el-table-column prop="scrapAmount" label="项目报废金额" min-width="140" />
              <el-table-column prop="netAmount" label="净发生金额" min-width="140" />
              <el-table-column prop="totalCost" label="总成本" min-width="140" />
            </el-table>
          </el-tab-pane>
        </el-tabs>
      </el-card>

      <el-card v-if="isMaterialCategoryView" shadow="never" class="section-card">
        <template #header>
          <div class="section-header">
            <span>分类汇总</span>
            <div class="detail-actions">
              <span class="section-tip">{{ activeCategoryLabel }}</span>
              <el-button
                v-if="showCategoryAction"
                text
                type="primary"
                @click="handleCategoryAction"
              >
                {{ categoryActionText }}
              </el-button>
            </div>
          </div>
        </template>
        <el-table
          :data="categoryRows"
          stripe
          row-key="nodeKey"
          v-loading="summaryLoading"
          :row-class-name="resolveCategoryRowClassName"
          @row-click="handleCategoryRowClick"
        >
          <el-table-column prop="categoryCode" label="分类编码" min-width="140" />
          <el-table-column prop="categoryName" label="分类名称" min-width="160" />
          <el-table-column prop="lineCount" label="单据行数" min-width="100" />
          <el-table-column prop="documentCount" label="单据数" min-width="100" />
          <el-table-column prop="abnormalDocumentCount" label="异常单据数" min-width="120" />
          <el-table-column prop="acceptanceInboundAmount" label="验收入库金额" min-width="140" />
          <el-table-column prop="productionReceiptAmount" label="生产入库金额" min-width="140" />
          <el-table-column prop="salesOutboundAmount" label="销售出库金额" min-width="140" />
          <el-table-column prop="salesReturnAmount" label="销售退货金额" min-width="140" />
          <el-table-column prop="netAmount" label="净发生金额" min-width="140" />
          <el-table-column prop="totalCost" label="总成本" min-width="140" />
        </el-table>
      </el-card>

      <el-card shadow="never" class="section-card">
        <template #header>
          <div class="section-header">
            <span>{{ detailSectionTitle }}</span>
            <span class="section-tip">{{ detailSectionTip }}</span>
          </div>
        </template>

        <el-table v-if="!isMaterialCategoryView" :data="detailRows" stripe v-loading="detailLoading">
          <el-table-column prop="domainLabel" label="领域" min-width="120" />
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

        <el-table v-else :data="detailRows" stripe v-loading="detailLoading">
          <el-table-column prop="categoryCode" label="分类编码" min-width="140" />
          <el-table-column prop="categoryName" label="分类名称" min-width="160" show-overflow-tooltip />
          <el-table-column prop="documentTypeLabel" label="单据类型" min-width="140" />
          <el-table-column prop="documentNo" label="单据编号" min-width="180" />
          <el-table-column prop="lineNo" label="行号" min-width="90" />
          <el-table-column prop="bizDate" label="业务日期" min-width="120" />
          <el-table-column prop="stockScopeName" label="仓别" min-width="140" />
          <el-table-column prop="workshopName" label="车间" min-width="140" />
          <el-table-column prop="materialCode" label="物料编码" min-width="160" />
          <el-table-column prop="materialName" label="物料名称" min-width="180" show-overflow-tooltip />
          <el-table-column prop="materialSpec" label="规格型号" min-width="160" show-overflow-tooltip />
          <el-table-column prop="unitCode" label="单位" min-width="100" />
          <el-table-column prop="salesProjectCode" label="销售项目编码" min-width="160" />
          <el-table-column prop="salesProjectName" label="销售项目名称" min-width="180" show-overflow-tooltip />
          <el-table-column prop="quantity" label="数量" min-width="120" />
          <el-table-column prop="amount" label="金额" min-width="120" />
          <el-table-column prop="cost" label="成本" min-width="120" />
          <el-table-column label="异常标识" min-width="220">
            <template #default="{ row }">
              <div v-if="row.abnormalLabels.length > 0" class="tag-wrap">
                <el-tag
                  v-for="tag in row.abnormalLabels"
                  :key="`${row.documentNo}-${row.lineNo}-${tag}`"
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
import { computed, onMounted, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { listWorkshop } from "@/api/base/workshop";
import {
  exportMonthlyReporting,
  getMonthlyReportingDetails,
  getMonthlyReportingSummary,
} from "@/api/reporting";
import useUserStore from "@/store/modules/user";

const DOMAIN_VIEW = "DOMAIN";
const MATERIAL_CATEGORY_VIEW = "MATERIAL_CATEGORY";
const MATERIAL_CATEGORY_ROUTE_NAMES = new Set([
  "MonthlyReportingMaterialCategory",
  "RdMonthlyReportingMaterialCategory",
]);

const userStore = useUserStore();
const route = useRoute();
const router = useRouter();

const summaryLoading = ref(false);
const detailLoading = ref(false);
const exporting = ref(false);
const pageNum = ref(1);
const pageSize = ref(10);
const selectedCategoryNodeKey = ref(undefined);
const workshopOptions = ref([]);
const domainCatalog = ref([]);
const documentTypeCatalog = ref([]);
const domainRows = ref([]);
const documentTypeRows = ref([]);
const workshopRows = ref([]);
const salesProjectRows = ref([]);
const rdProjectRows = ref([]);
const categoryRows = ref([]);
const detailRows = ref([]);
const detailTotal = ref(0);
const summary = ref(createEmptySummary(DOMAIN_VIEW));
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
const filters = ref(createDefaultFilters(resolveRouteViewMode()));
const isMaterialCategoryView = computed(
  () => filters.value.viewMode === MATERIAL_CATEGORY_VIEW,
);
const pageTitle = computed(() =>
  isMaterialCategoryView.value ? "物料分类月报" : "月度对账报表",
);
const siblingViewRouteName = computed(() => {
  if (isMaterialCategoryView.value) {
    return route.name?.toString().startsWith("Rd")
      ? "RdMonthlyReporting"
      : "MonthlyReporting";
  }

  return route.name?.toString().startsWith("Rd")
    ? "RdMonthlyReportingMaterialCategory"
    : "MonthlyReportingMaterialCategory";
});
const siblingViewActionText = computed(() =>
  isMaterialCategoryView.value ? "查看领域月报" : "查看物料分类月报",
);
const activeCategoryNodeKey = computed(
  () => selectedCategoryNodeKey.value || filters.value.categoryNodeKey,
);
const hasCategorySelection = computed(() =>
  Boolean(selectedCategoryNodeKey.value),
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
const filteredDocumentTypeOptions = computed(() => {
  if (isMaterialCategoryView.value) {
    return documentTypeCatalog.value;
  }

  if (!filters.value.domainKey) {
    return documentTypeCatalog.value;
  }

  return documentTypeCatalog.value.filter(
    (item) => item.domainKey === filters.value.domainKey,
  );
});
const categoryOptions = computed(() => {
  return [...categoryRows.value]
    .map((row) => ({
      nodeKey: row.nodeKey,
      categoryId: row.categoryId,
      categoryCode: row.categoryCode,
      categoryName: row.categoryName,
      categoryLabel: formatMaterialCategoryLabel(row),
    }))
    .sort((left, right) =>
      left.categoryLabel.localeCompare(right.categoryLabel, "zh-Hans-CN"),
  );
});
const reportingSubtitle = computed(() => {
  if (isMaterialCategoryView.value) {
    return "物料分类视角按单据行事实统计验收入库、生产入库、销售出库和销售退货金额，分类归属使用业务发生时快照并按单层最终分类聚合。";
  }

  if (filters.value.stockScope === "MAIN") {
    return "当前是主仓视角，发往研发项目的项目交接已计入总出金额；销售项目在下方业务汇总中查看。";
  }
  if (filters.value.stockScope === "RD_SUB") {
    return "当前是 RD 小仓视角，项目交接已直接计入研发项目总入，RD小仓只保留盘盈盘亏等仓务；销售项目在下方业务汇总中查看。";
  }
  return "先看当前月份各领域的总入、总出和净发生，再按领域查看单据类型。研发项目包含项目交接、领用、退回和报废；RD小仓只保留盘盈盘亏等仓务；销售项目在下方业务汇总中查看。";
});
const domainSummaryTip = computed(
  () => "先看当前筛选范围内各领域的总入、总出和净发生。",
);
const rdProjectLegendText = computed(
  () => "查看项目交接、项目领用、项目退回和项目报废。",
);
const rdSubLegendText = computed(() =>
  filters.value.stockScope === "RD_SUB"
    ? "查看当前 RD 小仓视角下的盘盈盘亏等仓务调整。"
    : "查看 RD 小仓盘盈盘亏等仓务调整，不再承接项目交接金额。",
);
const keywordPlaceholder = computed(() =>
  isMaterialCategoryView.value
    ? "单据号 / 物料 / 分类 / 销售项目 / 来源单据"
    : "单据号 / 单据类型 / 销售项目 / 来源单据",
);
const activeDocumentTypeLabel = computed(() => {
  if (!filters.value.documentTypeLabel) {
    return "当前显示全部单据类型明细";
  }

  const current = documentTypeCatalog.value.find(
    (item) => item.documentTypeLabel === filters.value.documentTypeLabel,
  );

  return current
    ? isMaterialCategoryView.value
      ? `当前显示 ${current.documentTypeLabel} 明细`
      : `当前显示 ${current.domainLabel} / ${current.documentTypeLabel} 明细`
    : "当前显示单据类型明细";
});
const activeCategoryLabel = computed(() => {
  if (!activeCategoryNodeKey.value) {
    return "当前显示全部分类汇总";
  }

  const current = categoryOptions.value.find(
    (item) => item.nodeKey === activeCategoryNodeKey.value,
  );

  if (hasCategorySelection.value) {
    return current
      ? `当前选中 ${current.categoryLabel}`
      : "当前选中分类";
  }

  return current ? `当前筛选 ${current.categoryLabel}` : "当前显示分类汇总";
});
const showCategoryAction = computed(
  () => hasCategorySelection.value || Boolean(filters.value.categoryNodeKey),
);
const categoryActionText = computed(() =>
  hasCategorySelection.value ? "取消选中" : "查看全部分类",
);
const detailSectionTitle = computed(() =>
  isMaterialCategoryView.value ? "单据行明细" : "单据头明细",
);
const detailSectionTip = computed(() =>
  isMaterialCategoryView.value
    ? "当前为物料分类视角，明细按单据行展示分类、物料、销售项目与来源追溯信息。"
    : "点击上面的单据类型可快速切到对应单据头明细。",
);
const businessSummaryTabs = computed(() => {
  if (isMaterialCategoryView.value) {
    return [];
  }

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
      tip: "按研发项目查看项目交接、项目领用、项目退回和项目报废。",
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

function createEmptyDomainSummary() {
  return {
    domainCount: 0,
    documentCount: 0,
    abnormalDocumentCount: 0,
    totalInQuantity: "0.000000",
    totalInAmount: "0.00",
    totalOutQuantity: "0.000000",
    totalOutAmount: "0.00",
    netQuantity: "0.000000",
    netAmount: "0.00",
    totalCost: "0.00",
  };
}

function createEmptyMaterialCategorySummary() {
  return {
    categoryCount: 0,
    lineCount: 0,
    documentCount: 0,
    abnormalDocumentCount: 0,
    acceptanceInboundAmount: "0.00",
    productionReceiptAmount: "0.00",
    salesOutboundAmount: "0.00",
    salesReturnAmount: "0.00",
    netAmount: "0.00",
    totalCost: "0.00",
  };
}

function createEmptySummary(viewMode = DOMAIN_VIEW) {
  return viewMode === MATERIAL_CATEGORY_VIEW
    ? createEmptyMaterialCategorySummary()
    : createEmptyDomainSummary();
}

function getDefaultMonth() {
  return new Date().toISOString().slice(0, 7);
}

function resolveRouteViewMode(routeName = route.name) {
  return MATERIAL_CATEGORY_ROUTE_NAMES.has(routeName?.toString() || "")
    ? MATERIAL_CATEGORY_VIEW
    : DOMAIN_VIEW;
}

function createDefaultFilters(viewMode = DOMAIN_VIEW) {
  return {
    yearMonth: getDefaultMonth(),
    viewMode,
    stockScope: fixedStockScope.value,
    workshopId: fixedWorkshopId.value,
    domainKey: undefined,
    documentTypeLabel: undefined,
    categoryNodeKey: undefined,
    abnormalOnly: false,
    keyword: "",
  };
}

function resolveDetailCategoryNodeKey() {
  return selectedCategoryNodeKey.value || filters.value.categoryNodeKey;
}

function buildBaseQuery({ useSelectedCategory = false } = {}) {
  return {
    yearMonth: filters.value.yearMonth,
    viewMode: filters.value.viewMode,
    stockScope: filters.value.stockScope || undefined,
    workshopId: filters.value.workshopId,
    domainKey: isMaterialCategoryView.value
      ? undefined
      : filters.value.domainKey,
    documentTypeLabel: filters.value.documentTypeLabel?.trim() || undefined,
    categoryNodeKey: isMaterialCategoryView.value
      ? useSelectedCategory
        ? resolveDetailCategoryNodeKey()
        : filters.value.categoryNodeKey
      : undefined,
    abnormalOnly: filters.value.abnormalOnly || undefined,
    keyword: filters.value.keyword?.trim() || undefined,
  };
}

function formatDocumentTypeOptionLabel(item) {
  if (isMaterialCategoryView.value) {
    return item.documentTypeLabel;
  }

  return `${item.domainLabel} / ${item.documentTypeLabel}`;
}

function formatMaterialCategoryLabel(category) {
  return category.categoryCode
    ? `${category.categoryCode} ${category.categoryName}`
    : category.categoryName;
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

    documentTypeCatalog.value = data.documentTypeCatalog || [];
    summary.value = data.summary || createEmptySummary(filters.value.viewMode);

    if (isMaterialCategoryView.value) {
      domainCatalog.value = [];
      domainRows.value = [];
      documentTypeRows.value = [];
      workshopRows.value = [];
      salesProjectRows.value = [];
      rdProjectRows.value = [];
      categoryRows.value = data.categories || [];
      activeBusinessSummaryTab.value = "";
      return;
    }

    domainCatalog.value = data.domainCatalog || [];
    categoryRows.value = [];
    domainRows.value = data.domains || [];
    documentTypeRows.value = data.documentTypes || [];
    workshopRows.value = data.workshopItems || [];
    salesProjectRows.value = data.salesProjectItems || [];
    rdProjectRows.value = data.rdProjectItems || [];
    syncBusinessSummaryTab();
  } finally {
    summaryLoading.value = false;
  }
}

async function loadDetails() {
  detailLoading.value = true;
  try {
    const response = await getMonthlyReportingDetails({
      ...buildBaseQuery({ useSelectedCategory: true }),
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
  selectedCategoryNodeKey.value = undefined;
  pageNum.value = 1;
  loadPage();
}

function handleReset() {
  filters.value = createDefaultFilters(resolveRouteViewMode());
  selectedCategoryNodeKey.value = undefined;
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

function handleDocumentTypeRowClick(row) {
  if (isMaterialCategoryView.value) {
    return;
  }

  filters.value.documentTypeLabel = row.documentTypeLabel;
  pageNum.value = 1;
  loadDetails();
}

function handleCategoryRowClick(row) {
  if (!isMaterialCategoryView.value || !row.nodeKey) {
    return;
  }

  selectedCategoryNodeKey.value =
    selectedCategoryNodeKey.value === row.nodeKey ? undefined : row.nodeKey;
  pageNum.value = 1;
  loadDetails();
}

function handleDomainChange() {
  if (isMaterialCategoryView.value) {
    return;
  }

  if (
    filters.value.documentTypeLabel &&
    !filteredDocumentTypeOptions.value.some(
      (item) => item.documentTypeLabel === filters.value.documentTypeLabel,
    )
  ) {
    filters.value.documentTypeLabel = undefined;
  }

  syncBusinessSummaryTab();
}

function clearDocumentTypeFilter() {
  filters.value.documentTypeLabel = undefined;
  pageNum.value = 1;
  loadDetails();
}

function clearCategorySelection() {
  selectedCategoryNodeKey.value = undefined;
  pageNum.value = 1;
  loadDetails();
}

function clearCategoryFilter() {
  filters.value.categoryNodeKey = undefined;
  pageNum.value = 1;
  loadPage();
}

function handleCategoryAction() {
  if (hasCategorySelection.value) {
    clearCategorySelection();
    return;
  }

  clearCategoryFilter();
}

function resolvePreferredBusinessSummaryTab() {
  switch (filters.value.domainKey) {
    case "WORKSHOP":
      return workshopRows.value.length > 0 ? "workshop" : null;
    case "SALES":
      return salesProjectRows.value.length > 0 ? "salesProject" : null;
    case "RD_PROJECT":
      return rdProjectRows.value.length > 0 ? "rdProject" : null;
    default:
      return null;
  }
}

function syncBusinessSummaryTab() {
  if (isMaterialCategoryView.value) {
    activeBusinessSummaryTab.value = "";
    return;
  }

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

function resolveDocumentTypeRowClassName({ row }) {
  return row.documentTypeLabel === filters.value.documentTypeLabel
    ? "is-active-row"
    : "";
}

function resolveDocumentTypeRowKey(row) {
  return `${row.domainKey || "ALL"}:${row.documentTypeLabel}`;
}

function resolveCategoryRowClassName({ row }) {
  return Boolean(selectedCategoryNodeKey.value) &&
    row.nodeKey === selectedCategoryNodeKey.value
    ? "is-active-row"
    : "";
}

async function handleExport() {
  exporting.value = true;
  try {
    await exportMonthlyReporting(buildBaseQuery());
  } finally {
    exporting.value = false;
  }
}

function resetFiltersForCurrentRoute() {
  filters.value = createDefaultFilters(resolveRouteViewMode());
  selectedCategoryNodeKey.value = undefined;
  pageNum.value = 1;
}

function handleNavigateToSiblingView() {
  router.push({ name: siblingViewRouteName.value });
}

onMounted(async () => {
  await loadWorkshopOptions();
  resetFiltersForCurrentRoute();
  await loadPage();
});

watch(
  () => route.name,
  async (nextRouteName, previousRouteName) => {
    if (!previousRouteName || nextRouteName === previousRouteName) {
      return;
    }

    resetFiltersForCurrentRoute();
    await loadPage();
  },
);
</script>

<style scoped lang="scss">
.monthly-reporting-page {
  .page-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
  }

  .page-actions {
    display: flex;
    align-items: center;
    gap: 12px;
    flex-wrap: wrap;
    justify-content: flex-end;
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
    line-height: 1.5;
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

:deep(.el-table .is-active-row > td.el-table__cell) {
  background-color: #f0f9eb !important;
}
</style>
