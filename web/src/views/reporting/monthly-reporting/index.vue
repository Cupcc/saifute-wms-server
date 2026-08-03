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
            @change="handleSearch"
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
        <el-form-item v-if="isMaterialCategoryView" label="物料">
          <el-select
            v-model="filters.materialId"
            clearable
            filterable
            placeholder="全部物料"
            style="width: 320px"
          >
            <el-option
              v-for="item in materialOptions"
              :key="item.materialId"
              :label="formatMaterialOptionLabel(item)"
              :value="item.materialId"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="单据类型">
          <el-select
            v-model="filters.documentTypeKey"
            clearable
            filterable
            placeholder="全部单据类型"
            style="width: 240px"
          >
            <el-option
              v-for="item in filteredDocumentTypeOptions"
              :key="resolveDocumentTypeOptionKey(item)"
              :label="formatDocumentTypeOptionLabel(item)"
              :value="resolveDocumentTypeFilterValue(item)"
            />
          </el-select>
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
        <el-col
          v-for="item in domainSummaryStats"
          :key="item.key"
          :xs="24"
          :sm="12"
          :lg="4"
        >
          <div class="stat-box">
            <div class="stat-label">
              <reporting-metric-label
                :label="item.label"
                :content="item.help"
              />
            </div>
            <div class="stat-value">{{ item.value }}</div>
          </div>
        </el-col>
      </el-row>

      <template v-else>
        <div class="summary-visibility-bar">
          <span class="summary-visibility-tip">汇总方块默认隐藏</span>
          <el-button
            text
            type="primary"
            :aria-expanded="materialCategorySummaryVisible"
            @click="toggleMaterialCategorySummary"
          >
            {{ materialCategorySummaryVisible ? "隐藏汇总数据" : "显示汇总数据" }}
          </el-button>
        </div>
        <el-row
          v-if="materialCategorySummaryVisible"
          :gutter="16"
          class="summary-row"
        >
          <el-col
            v-for="item in materialCategorySummaryStats"
            :key="item.key"
            :xs="24"
            :sm="12"
            :lg="4"
          >
            <div class="stat-box" :class="{ 'danger-box': item.danger }">
              <div class="stat-label">
                <reporting-metric-label
                  :label="item.label"
                  :content="item.help"
                />
              </div>
              <div class="stat-value">{{ item.value }}</div>
            </div>
          </el-col>
        </el-row>
      </template>

      <el-card
        v-if="!isMaterialCategoryView"
        shadow="never"
        class="section-card"
        :class="{ 'is-collapsed': !sectionExpanded.domainSummary }"
      >
        <template #header>
          <div class="section-header">
            <button
              type="button"
              class="section-toggle"
              :aria-expanded="sectionExpanded.domainSummary"
              aria-controls="domain-summary-content"
              @click="toggleSection('domainSummary')"
            >
              <el-icon
                class="section-toggle-icon"
                :class="{ 'is-expanded': sectionExpanded.domainSummary }"
              >
                <ArrowRight />
              </el-icon>
              <span>领域汇总</span>
            </button>
            <span class="section-tip">
              {{ domainSummaryTip }}
            </span>
          </div>
        </template>
        <div
          v-if="sectionExpanded.domainSummary"
          id="domain-summary-content"
        >
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
          <adaptive-table
            column-preferences
            :fit-viewport="false"
            :table-key="`${route.path}#domain-summary`"
            :data="domainRows"
            stripe
            v-loading="summaryLoading"
          >
            <reporting-column prop="domainLabel" label="领域" />
            <reporting-metric-column
              prop="documentCount"
              label="业务单据数"
              :content="monthlyMetricHelp.count.documentCount"
            />
            <reporting-metric-column
              prop="inventoryCostInAmount"
              label="库存成本流入"
              :content="monthlyMetricHelp.costFlow.inAmount"
            />
            <reporting-metric-column
              prop="inventoryCostOutAmount"
              label="库存成本流出"
              :content="monthlyMetricHelp.costFlow.outAmount"
            />
            <reporting-metric-column
              prop="inventoryCostNetChangeAmount"
              label="库存成本净变动"
              :content="monthlyMetricHelp.costFlow.netChangeAmount"
            />
            <reporting-metric-column
              v-if="hasSalesDomainRow"
              prop="netSalesAmount"
              label="销售净额（WMS销售价）"
              :content="monthlyMetricHelp.sales.netSalesAmount"
            />
            <reporting-metric-column
              v-if="hasSalesDomainRow"
              prop="netCostAmount"
              label="销售净成本"
              :content="monthlyMetricHelp.sales.netCostAmount"
            />
            <reporting-metric-column
              v-if="hasSalesDomainRow"
              prop="salesGrossProfitAmount"
              label="WMS商品毛利估算"
              :content="monthlyMetricHelp.sales.grossProfitAmount"
            />
          </adaptive-table>
        </div>
      </el-card>

      <el-card
        v-if="!isMaterialCategoryView"
        shadow="never"
        class="section-card"
        :class="{ 'is-collapsed': !sectionExpanded.documentTypeSummary }"
      >
        <template #header>
          <div class="section-header">
            <button
              type="button"
              class="section-toggle"
              :aria-expanded="sectionExpanded.documentTypeSummary"
              aria-controls="document-type-summary-content"
              @click="toggleSection('documentTypeSummary')"
            >
              <el-icon
                class="section-toggle-icon"
                :class="{ 'is-expanded': sectionExpanded.documentTypeSummary }"
              >
                <ArrowRight />
              </el-icon>
              <span>单据类型汇总</span>
            </button>
            <div class="detail-actions">
              <span class="section-tip">{{ activeDocumentTypeLabel }}</span>
              <el-button
                v-if="filters.documentTypeKey"
                text
                type="primary"
                @click="clearDocumentTypeFilter"
              >
                查看全部单据类型
              </el-button>
            </div>
          </div>
        </template>
        <adaptive-table
          v-if="sectionExpanded.documentTypeSummary"
          id="document-type-summary-content"
          column-preferences
          :fit-viewport="false"
          :table-key="`${route.path}#document-type-summary`"
          :data="documentTypeRows"
          stripe
          :row-key="resolveDocumentTypeRowKey"
          v-loading="summaryLoading"
          :row-class-name="resolveDocumentTypeRowClassName"
          @row-click="handleDocumentTypeRowClick"
        >
          <reporting-column prop="domainLabel" label="领域" />
          <reporting-column prop="documentTypeLabel" label="单据类型" />
          <reporting-metric-column prop="documentCount" label="业务单据数" :content="monthlyMetricHelp.count.documentCount" />
          <reporting-column prop="businessAmountLabel" label="业务金额口径" />
          <reporting-column prop="businessAmount" label="业务金额" />
          <reporting-metric-column prop="inventoryCostInAmount" label="库存成本流入" :content="monthlyMetricHelp.costFlow.inAmount" />
          <reporting-metric-column prop="inventoryCostOutAmount" label="库存成本流出" :content="monthlyMetricHelp.costFlow.outAmount" />
          <reporting-metric-column prop="inventoryCostNetChangeAmount" label="库存成本净变动" :content="monthlyMetricHelp.costFlow.netChangeAmount" />
        </adaptive-table>
      </el-card>

      <el-card
        v-if="!isMaterialCategoryView && businessSummaryTabs.length > 0"
        shadow="never"
        class="section-card"
        :class="{ 'is-collapsed': !sectionExpanded.businessSummary }"
      >
        <template #header>
          <div class="section-header">
            <button
              type="button"
              class="section-toggle"
              :aria-expanded="sectionExpanded.businessSummary"
              aria-controls="business-summary-content"
              @click="toggleSection('businessSummary')"
            >
              <el-icon
                class="section-toggle-icon"
                :class="{ 'is-expanded': sectionExpanded.businessSummary }"
              >
                <ArrowRight />
              </el-icon>
              <span>业务汇总</span>
            </button>
            <span class="section-tip">{{ activeBusinessSummaryTip }}</span>
          </div>
        </template>
        <el-tabs
          v-if="sectionExpanded.businessSummary"
          id="business-summary-content"
          v-model="activeBusinessSummaryTab"
          class="business-summary-tabs"
        >
          <el-tab-pane
            v-if="workshopRows.length > 0"
            label="车间汇总"
            name="workshop"
          >
            <adaptive-table
              column-preferences
              :fit-viewport="false"
              :table-key="`${route.path}#business-workshop-summary`"
              :data="workshopRows"
              stripe
              v-loading="summaryLoading"
            >
              <reporting-column prop="workshopName" label="车间" />
              <reporting-metric-column prop="documentCount" label="业务单据数" :content="monthlyMetricHelp.count.documentCount" />
              <reporting-metric-column prop="pickCostAmount" label="领料成本" :content="monthlyMetricHelp.workshop.pickCostAmount" />
              <reporting-metric-column prop="returnCostAmount" label="退料冲回成本" :content="monthlyMetricHelp.workshop.returnCostAmount" />
              <reporting-metric-column prop="scrapCostAmount" label="报废成本" :content="monthlyMetricHelp.workshop.scrapCostAmount" />
              <reporting-metric-column prop="netConsumptionCostAmount" label="车间净耗用成本" :content="monthlyMetricHelp.workshop.netConsumptionCostAmount" />
            </adaptive-table>
          </el-tab-pane>
          <el-tab-pane
            v-if="salesProjectRows.length > 0"
            label="销售项目汇总"
            name="salesProject"
          >
            <adaptive-table
              column-preferences
              :fit-viewport="false"
              :table-key="`${route.path}#business-sales-project-summary`"
              :data="salesProjectRows"
              stripe
              v-loading="summaryLoading"
            >
              <reporting-column prop="salesProjectCode" label="销售项目编码" />
              <reporting-column prop="salesProjectName" label="销售项目名称" />
              <reporting-metric-column prop="documentCount" label="业务单据数" :content="monthlyMetricHelp.count.documentCount" />
              <reporting-column prop="salesOutboundSalesAmount" label="销售出库销售价金额" />
              <reporting-metric-column prop="salesOutboundCostAmount" label="销售出库成本" :content="monthlyMetricHelp.sales.outboundCostAmount" />
              <reporting-column prop="salesReturnSalesAmount" label="销售退货销售价金额" />
              <reporting-metric-column prop="salesReturnCostAmount" label="销售退货成本" :content="monthlyMetricHelp.sales.returnCostAmount" />
              <reporting-metric-column prop="netSalesAmount" label="销售净额（WMS销售价）" :content="monthlyMetricHelp.sales.netSalesAmount" />
              <reporting-metric-column prop="netCostAmount" label="销售净成本" :content="monthlyMetricHelp.sales.netCostAmount" />
              <reporting-metric-column prop="estimatedGrossProfitAmount" label="WMS商品毛利估算" :content="monthlyMetricHelp.sales.grossProfitAmount" />
            </adaptive-table>
          </el-tab-pane>
          <el-tab-pane
            v-if="rdProjectRows.length > 0"
            label="研发项目汇总"
            name="rdProject"
          >
            <adaptive-table
              column-preferences
              :fit-viewport="false"
              :table-key="`${route.path}#business-rd-project-summary`"
              :data="rdProjectRows"
              stripe
              v-loading="summaryLoading"
            >
              <reporting-column prop="rdProjectCode" label="研发项目编码" />
              <reporting-column prop="rdProjectName" label="研发项目名称" />
              <reporting-metric-column prop="documentCount" label="业务单据数" :content="monthlyMetricHelp.count.documentCount" />
              <reporting-metric-column prop="handoffInCostAmount" label="项目交接入成本" :content="monthlyMetricHelp.rdProject.handoffInCostAmount" />
              <reporting-metric-column prop="pickCostAmount" label="项目领用成本" :content="monthlyMetricHelp.rdProject.pickCostAmount" />
              <reporting-metric-column prop="returnCostAmount" label="项目退回成本" :content="monthlyMetricHelp.rdProject.returnCostAmount" />
              <reporting-metric-column prop="scrapCostAmount" label="项目报废成本" :content="monthlyMetricHelp.rdProject.scrapCostAmount" />
              <reporting-metric-column prop="netConsumptionCostAmount" label="项目净耗用成本" :content="monthlyMetricHelp.rdProject.netConsumptionCostAmount" />
              <reporting-metric-column prop="attributedInventoryCostNetChangeAmount" label="项目归属库存成本净变动" :content="monthlyMetricHelp.rdProject.attributedInventoryCostNetChangeAmount" />
            </adaptive-table>
          </el-tab-pane>
        </el-tabs>
      </el-card>

      <el-card
        v-if="isMaterialCategoryView && workshopRows.length > 0"
        shadow="never"
        class="section-card"
        :class="{ 'is-collapsed': !sectionExpanded.workshopUsageSummary }"
      >
        <template #header>
          <div class="section-header">
            <button
              type="button"
              class="section-toggle"
              :aria-expanded="sectionExpanded.workshopUsageSummary"
              aria-controls="workshop-usage-summary-content"
              @click="toggleSection('workshopUsageSummary')"
            >
              <el-icon
                class="section-toggle-icon"
                :class="{ 'is-expanded': sectionExpanded.workshopUsageSummary }"
              >
                <ArrowRight />
              </el-icon>
              <span>车间使用汇总</span>
            </button>
            <span class="section-tip">按车间汇总领料、退料、报废和净耗用成本。</span>
          </div>
        </template>
        <adaptive-table
          v-if="sectionExpanded.workshopUsageSummary"
          id="workshop-usage-summary-content"
          column-preferences
          :fit-viewport="false"
          :table-key="`${route.path}#workshop-usage-summary`"
          :data="workshopRows"
          class="monthly-summary-table"
          stripe
          v-loading="summaryLoading"
        >
          <reporting-column prop="workshopName" label="车间" />
          <reporting-metric-column prop="lineCount" label="单据行数" :content="monthlyMetricHelp.count.lineCount" />
          <reporting-metric-column prop="documentCount" label="业务单据数" :content="monthlyMetricHelp.count.documentCount" />
          <reporting-metric-column prop="pickCostAmount" label="领料成本" :content="monthlyMetricHelp.workshop.pickCostAmount" />
          <reporting-metric-column prop="returnCostAmount" label="退料冲回成本" :content="monthlyMetricHelp.workshop.returnCostAmount" />
          <reporting-metric-column prop="scrapCostAmount" label="报废成本" :content="monthlyMetricHelp.workshop.scrapCostAmount" />
          <reporting-metric-column prop="netConsumptionCostAmount" label="车间净耗用成本" :content="monthlyMetricHelp.workshop.netConsumptionCostAmount" />
        </adaptive-table>
      </el-card>

      <el-card
        v-if="isMaterialCategoryView"
        shadow="never"
        class="section-card"
        :class="{ 'is-collapsed': !sectionExpanded.categorySummary }"
      >
        <template #header>
          <div class="section-header">
            <button
              type="button"
              class="section-toggle"
              :aria-expanded="sectionExpanded.categorySummary"
              aria-controls="category-summary-content"
              @click="toggleSection('categorySummary')"
            >
              <el-icon
                class="section-toggle-icon"
                :class="{ 'is-expanded': sectionExpanded.categorySummary }"
              >
                <ArrowRight />
              </el-icon>
              <span>分类汇总</span>
            </button>
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
        <adaptive-table
          v-if="sectionExpanded.categorySummary"
          id="category-summary-content"
          column-preferences
          :fit-viewport="false"
          :table-key="`${route.path}#material-category-summary`"
          :data="categoryRows"
          class="monthly-summary-table"
          stripe
          show-summary
          :summary-method="getCategorySummaries"
          row-key="nodeKey"
          v-loading="summaryLoading"
          :row-class-name="resolveCategoryRowClassName"
          @row-click="handleCategoryRowClick"
        >
          <reporting-column prop="categoryCode" label="分类编码" />
          <reporting-column prop="categoryName" label="分类名称" />
          <reporting-metric-column
            prop="openingCostAmount"
            label="月初库存成本"
            :content="monthlyMetricHelp.balance.openingCostAmount"
          />
          <reporting-column
            prop="acceptanceInboundAmount"
            label="验收入库计价金额"
          />
          <reporting-column
            prop="supplierReturnAmount"
            label="退厂计价金额"
          />
          <reporting-metric-column
            prop="purchaseNetInboundAmount"
            label="采购净入库金额"
            :content="monthlyMetricHelp.inbound.purchaseNetInboundAmount"
          />
          <reporting-column
            prop="productionReceiptAmount"
            label="生产入库计价金额"
          />
          <reporting-metric-column
            prop="netSalesAmount"
            label="销售净额（WMS销售价）"
            :content="monthlyMetricHelp.sales.netSalesAmount"
          />
          <reporting-metric-column
            prop="netSalesCostAmount"
            label="销售净成本"
            :content="monthlyMetricHelp.sales.netCostAmount"
          />
          <reporting-metric-column
            prop="workshopNetConsumptionCostAmount"
            label="车间净耗用成本"
            :content="monthlyMetricHelp.workshop.netConsumptionCostAmount"
          />
          <reporting-metric-column
            prop="inventoryCostNetChangeAmount"
            label="库存成本净变动"
            :content="monthlyMetricHelp.balance.inventoryCostNetChangeAmount"
          />
          <reporting-metric-column
            prop="closingCostAmount"
            label="月末库存成本"
            :content="monthlyMetricHelp.balance.closingCostAmount"
          />
        </adaptive-table>
      </el-card>

      <el-card
        v-if="isMaterialCategoryView"
        shadow="never"
        class="section-card"
        :class="{ 'is-collapsed': !sectionExpanded.materialSummary }"
      >
        <template #header>
          <div class="section-header">
            <button
              type="button"
              class="section-toggle"
              :aria-expanded="sectionExpanded.materialSummary"
              aria-controls="material-summary-content"
              @click="toggleSection('materialSummary')"
            >
              <el-icon
                class="section-toggle-icon"
                :class="{ 'is-expanded': sectionExpanded.materialSummary }"
              >
                <ArrowRight />
              </el-icon>
              <span>物料汇总</span>
            </button>
            <span class="section-tip">{{ materialSectionTip }}</span>
          </div>
        </template>
        <div
          v-if="sectionExpanded.materialSummary"
          id="material-summary-content"
        >
          <adaptive-table
            column-preferences
            :fit-viewport="false"
            :table-key="`${route.path}#material-summary`"
            :data="pagedMaterialRows"
            stripe
            row-key="materialKey"
            v-loading="summaryLoading"
          >
          <reporting-column prop="categoryCode" label="分类编码" />
          <reporting-column prop="categoryName" label="分类名称" show-overflow-tooltip />
          <reporting-column prop="materialCode" label="物料编码" />
          <reporting-column prop="materialName" label="物料名称" show-overflow-tooltip />
          <reporting-column prop="materialSpec" label="规格型号" show-overflow-tooltip />
          <reporting-column prop="unitCode" label="单位" />
          <reporting-metric-column prop="lineCount" label="单据行数" :content="monthlyMetricHelp.count.lineCount" />
          <reporting-metric-column prop="documentCount" label="业务单据数" :content="monthlyMetricHelp.count.documentCount" />
          <reporting-metric-column prop="openingQuantity" label="月初数量" :content="monthlyMetricHelp.balance.openingQuantity" />
          <reporting-metric-column prop="openingCostAmount" label="月初库存成本" :content="monthlyMetricHelp.balance.openingCostAmount" />
          <reporting-metric-column prop="inventoryNetChangeQuantity" label="库存净变动数量" :content="monthlyMetricHelp.balance.netQuantity" />
          <reporting-metric-column prop="inventoryCostNetChangeAmount" label="库存成本净变动" :content="monthlyMetricHelp.balance.inventoryCostNetChangeAmount" />
          <reporting-metric-column prop="closingQuantity" label="月末数量" :content="monthlyMetricHelp.balance.closingQuantity" />
          <reporting-metric-column prop="closingCostAmount" label="月末库存成本" :content="monthlyMetricHelp.balance.closingCostAmount" />
          <reporting-metric-column prop="inQuantity" label="库存流入数量" :content="monthlyMetricHelp.inbound.inQuantity" />
          <reporting-metric-column prop="outQuantity" label="库存流出数量" :content="monthlyMetricHelp.inbound.outQuantity" />
          <reporting-column prop="acceptanceInboundQuantity" label="验收入库数量" />
          <reporting-column prop="acceptanceInboundAmount" label="验收入库计价金额" />
          <reporting-column prop="productionReceiptQuantity" label="生产入库数量" />
          <reporting-column prop="productionReceiptAmount" label="生产入库计价金额" />
          <reporting-column prop="supplierReturnQuantity" label="退给厂家数量" />
          <reporting-column prop="supplierReturnAmount" label="退厂计价金额" />
          <reporting-metric-column prop="purchaseNetInboundAmount" label="采购净入库金额" :content="monthlyMetricHelp.inbound.purchaseNetInboundAmount" />
          <reporting-column prop="workshopPickQuantity" label="车间领料数量" />
          <reporting-metric-column prop="workshopPickCostAmount" label="车间领料成本" :content="monthlyMetricHelp.workshop.pickCostAmount" />
          <reporting-column prop="workshopReturnQuantity" label="车间退料数量" />
          <reporting-metric-column prop="workshopReturnCostAmount" label="车间退料冲回成本" :content="monthlyMetricHelp.workshop.returnCostAmount" />
          <reporting-column prop="workshopScrapQuantity" label="车间报废数量" />
          <reporting-metric-column prop="workshopScrapCostAmount" label="车间报废成本" :content="monthlyMetricHelp.workshop.scrapCostAmount" />
          <reporting-metric-column prop="workshopNetConsumptionQuantity" label="车间净耗用数量" :content="monthlyMetricHelp.workshop.netConsumptionQuantity" />
          <reporting-metric-column prop="workshopNetConsumptionCostAmount" label="车间净耗用成本" :content="monthlyMetricHelp.workshop.netConsumptionCostAmount" />
          <reporting-column prop="salesOutboundQuantity" label="销售出库数量" />
          <reporting-column prop="salesOutboundSalesAmount" label="销售出库销售价金额" />
          <reporting-metric-column prop="salesOutboundCostAmount" label="销售出库成本" :content="monthlyMetricHelp.sales.outboundCostAmount" />
          <reporting-column prop="salesReturnQuantity" label="销售退货数量" />
          <reporting-column prop="salesReturnSalesAmount" label="销售退货销售价金额" />
          <reporting-metric-column prop="salesReturnCostAmount" label="销售退货成本" :content="monthlyMetricHelp.sales.returnCostAmount" />
          <reporting-metric-column prop="netSalesQuantity" label="净销售数量" :content="monthlyMetricHelp.sales.netQuantity" />
          <reporting-metric-column prop="netSalesAmount" label="销售净额（WMS销售价）" :content="monthlyMetricHelp.sales.netSalesAmount" />
          <reporting-metric-column prop="netSalesCostAmount" label="销售净成本" :content="monthlyMetricHelp.sales.netCostAmount" />
          <reporting-metric-column prop="estimatedGrossProfitAmount" label="WMS商品毛利估算" :content="monthlyMetricHelp.sales.grossProfitAmount" />
          </adaptive-table>
          <div class="pagination-wrap">
            <el-pagination
              background
              layout="total, sizes, prev, pager, next"
              :current-page="materialPageNum"
              :page-size="materialPageSize"
              :page-sizes="[50, 100, 200]"
              :total="filteredMaterialTotal"
              @current-change="handleMaterialPageChange"
              @size-change="handleMaterialSizeChange"
            />
          </div>
        </div>
      </el-card>

      <el-card
        shadow="never"
        class="section-card"
        :class="{ 'is-collapsed': !sectionExpanded.details }"
      >
        <template #header>
          <div class="section-header">
            <button
              type="button"
              class="section-toggle"
              :aria-expanded="sectionExpanded.details"
              aria-controls="details-content"
              @click="toggleSection('details')"
            >
              <el-icon
                class="section-toggle-icon"
                :class="{ 'is-expanded': sectionExpanded.details }"
              >
                <ArrowRight />
              </el-icon>
              <span>{{ detailSectionTitle }}</span>
            </button>
            <span class="section-tip">{{ detailSectionTip }}</span>
          </div>
        </template>

        <div v-if="sectionExpanded.details" id="details-content">
          <adaptive-table
            v-if="!isMaterialCategoryView"
            column-preferences
            :fit-viewport="false"
            :table-key="`${route.path}#domain-details`"
            :data="detailRows"
            stripe
            v-loading="detailLoading"
          >
          <reporting-column prop="domainLabel" label="领域" />
          <reporting-column prop="documentTypeLabel" label="单据类型" />
          <reporting-column prop="documentNo" label="单据编号" />
          <reporting-column prop="bizDate" label="业务日期" />
          <reporting-column prop="stockScopeName" label="仓别" />
          <reporting-column prop="workshopName" label="车间" />
          <reporting-column prop="salesProjectLabel" label="销售项目" show-overflow-tooltip />
          <reporting-column prop="rdProjectCode" label="研发项目编码" />
          <reporting-column prop="rdProjectName" label="研发项目名称" show-overflow-tooltip />
          <reporting-column prop="sourceStockScopeName" label="来源仓别" />
          <reporting-column prop="targetStockScopeName" label="目标仓别" />
          <reporting-column prop="sourceWorkshopName" label="来源车间" />
          <reporting-column prop="targetWorkshopName" label="目标车间" />
          <reporting-column prop="businessAmountLabel" label="业务金额口径" />
          <reporting-column prop="amount" label="业务金额" />
          <reporting-metric-column prop="cost" label="库存成本" :content="monthlyMetricHelp.detail.documentCost" />
          <reporting-column prop="sourceBizMonth" label="来源月份" />
          <reporting-column prop="sourceDocumentNo" label="来源单据" show-overflow-tooltip />
          </adaptive-table>

          <adaptive-table
            v-else
            column-preferences
            :fit-viewport="false"
            :table-key="`${route.path}#material-category-details`"
            :data="detailRows"
            stripe
            v-loading="detailLoading"
          >
          <reporting-column prop="categoryCode" label="分类编码" />
          <reporting-column prop="categoryName" label="分类名称" show-overflow-tooltip />
          <reporting-column prop="documentTypeLabel" label="单据类型" />
          <reporting-column prop="documentNo" label="单据编号" />
          <reporting-column prop="lineNo" label="行号" />
          <reporting-column prop="bizDate" label="业务日期" />
          <reporting-column prop="stockScopeName" label="仓别" />
          <reporting-column prop="workshopName" label="车间" />
          <reporting-column prop="materialCode" label="物料编码" />
          <reporting-column prop="materialName" label="物料名称" show-overflow-tooltip />
          <reporting-column prop="materialSpec" label="规格型号" show-overflow-tooltip />
          <reporting-column prop="unitCode" label="单位" />
          <reporting-column prop="salesProjectCode" label="销售项目编码" />
          <reporting-column prop="salesProjectName" label="销售项目名称" show-overflow-tooltip />
          <reporting-column prop="quantity" label="数量" />
          <reporting-metric-column prop="unitPrice" label="成本单价" :content="monthlyMetricHelp.detail.unitPrice" />
          <reporting-metric-column prop="amount" label="成本金额" :content="monthlyMetricHelp.detail.amount" />
          <reporting-column prop="salesUnitPrice" label="销售价" />
          <reporting-column prop="salesAmount" label="销售金额" />
          <reporting-column prop="sourceBizMonth" label="来源月份" />
          <reporting-column prop="sourceDocumentNo" label="来源单据" show-overflow-tooltip />
          </adaptive-table>

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
import {
  applySectionExpansionPreference,
  createSectionExpansionPreference,
  getSectionExpansionPreferenceStorageKey,
  loadSectionExpansionPreference,
  saveSectionExpansionPreference,
} from "@/utils/sectionExpansionPreferences";
import ReportingColumn from "../components/ReportingColumn.vue";
import ReportingMetricColumn from "../components/ReportingMetricColumn.vue";
import ReportingMetricLabel from "../components/ReportingMetricLabel.vue";
import { monthlyMetricHelp } from "../reportingMetricHelp";

const DOMAIN_VIEW = "DOMAIN";
const MATERIAL_CATEGORY_VIEW = "MATERIAL_CATEGORY";
const MATERIAL_CATEGORY_ROUTE_NAMES = new Set([
  "MonthlyReportingMaterialCategory",
  "RdMonthlyReportingMaterialCategory",
]);
const DEFAULT_SECTION_EXPANDED = Object.freeze({
  domainSummary: true,
  documentTypeSummary: true,
  businessSummary: true,
  workshopUsageSummary: true,
  categorySummary: true,
  materialSummary: true,
  details: true,
});

const userStore = useUserStore();
const route = useRoute();
const router = useRouter();

const summaryLoading = ref(false);
const detailLoading = ref(false);
const exporting = ref(false);
const materialCategorySummaryVisible = ref(false);
const pageNum = ref(1);
const pageSize = ref(10);
const materialPageNum = ref(1);
const materialPageSize = ref(50);
const selectedCategoryNodeKey = ref(undefined);
const workshopOptions = ref([]);
const domainCatalog = ref([]);
const documentTypeCatalog = ref([]);
const categoryCatalog = ref([]);
const materialCatalog = ref([]);
const domainRows = ref([]);
const documentTypeRows = ref([]);
const workshopRows = ref([]);
const salesProjectRows = ref([]);
const rdProjectRows = ref([]);
const categoryRows = ref([]);
const materialRows = ref([]);
const detailRows = ref([]);
const detailTotal = ref(0);
const summary = ref(createEmptySummary(DOMAIN_VIEW));
const activeBusinessSummaryTab = ref("workshop");
const sectionExpanded = ref({ ...DEFAULT_SECTION_EXPANDED });

const isRdRoute = computed(() => route.path.startsWith("/rd/"));
const fixedStockScope = computed(() =>
  userStore.stockScope?.mode === "FIXED"
    ? userStore.stockScope.stockScope
    : isRdRoute.value
      ? "RD_SUB"
      : undefined,
);
const fixedWorkshopId = computed(() =>
  userStore.workshopScope?.mode === "FIXED"
    ? userStore.workshopScope.workshopId
    : undefined,
);
const sectionExpansionPreferenceStorageKey = computed(() =>
  getSectionExpansionPreferenceStorageKey(
    userStore.id || userStore.name,
    route.path,
  ),
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
const domainSummaryStats = computed(() => [
  {
    key: "inventoryCostInAmount",
    label: "库存成本流入",
    value: summary.value.inventoryCostInAmount,
    help: monthlyMetricHelp.costFlow.inAmount,
  },
  {
    key: "inventoryCostOutAmount",
    label: "库存成本流出",
    value: summary.value.inventoryCostOutAmount,
    help: monthlyMetricHelp.costFlow.outAmount,
  },
  {
    key: "inventoryCostNetChangeAmount",
    label: "库存成本净变动",
    value: summary.value.inventoryCostNetChangeAmount,
    help: monthlyMetricHelp.costFlow.netChangeAmount,
  },
  {
    key: "purchaseNetInboundAmount",
    label: "采购净入库金额",
    value: summary.value.purchaseNetInboundAmount,
    help: monthlyMetricHelp.inbound.purchaseNetInboundAmount,
  },
  {
    key: "productionReceiptAmount",
    label: "生产入库计价金额",
    value: summary.value.productionReceiptAmount,
  },
  {
    key: "salesNetAmount",
    label: "销售净额（WMS销售价）",
    value: summary.value.salesNetAmount,
    help: monthlyMetricHelp.sales.netSalesAmount,
  },
  {
    key: "salesNetCostAmount",
    label: "销售净成本",
    value: summary.value.salesNetCostAmount,
    help: monthlyMetricHelp.sales.netCostAmount,
  },
  {
    key: "workshopNetConsumptionCostAmount",
    label: "车间净耗用成本",
    value: summary.value.workshopNetConsumptionCostAmount,
    help: monthlyMetricHelp.workshop.netConsumptionCostAmount,
  },
  {
    key: "rdProjectNetConsumptionCostAmount",
    label: "研发项目净耗用成本",
    value: summary.value.rdProjectNetConsumptionCostAmount,
    help: monthlyMetricHelp.rdProject.netConsumptionCostAmount,
  },
  {
    key: "documentCount",
    label: "业务单据数",
    value: summary.value.documentCount,
    help: monthlyMetricHelp.count.documentCount,
  },
]);
const materialCategorySummaryStats = computed(() => [
  {
    key: "openingCostAmount",
    label: "月初库存成本",
    value: summary.value.openingCostAmount,
    help: monthlyMetricHelp.balance.openingCostAmount,
  },
  {
    key: "inventoryCostNetChangeAmount",
    label: "库存成本净变动",
    value: summary.value.inventoryCostNetChangeAmount,
    help: monthlyMetricHelp.balance.inventoryCostNetChangeAmount,
  },
  {
    key: "closingCostAmount",
    label: "月末库存成本",
    value: summary.value.closingCostAmount,
    help: monthlyMetricHelp.balance.closingCostAmount,
  },
  {
    key: "acceptanceInboundAmount",
    label: "验收入库计价金额",
    value: summary.value.acceptanceInboundAmount,
  },
  {
    key: "productionReceiptAmount",
    label: "生产入库计价金额",
    value: summary.value.productionReceiptAmount,
  },
  {
    key: "supplierReturnAmount",
    label: "退厂计价金额",
    value: summary.value.supplierReturnAmount,
  },
  {
    key: "purchaseNetInboundAmount",
    label: "采购净入库金额",
    value: summary.value.purchaseNetInboundAmount,
    help: monthlyMetricHelp.inbound.purchaseNetInboundAmount,
  },
  {
    key: "workshopNetConsumptionCostAmount",
    label: "车间净耗用成本",
    value: summary.value.workshopNetConsumptionCostAmount,
    help: monthlyMetricHelp.workshop.netConsumptionCostAmount,
  },
  {
    key: "netSalesAmount",
    label: "销售净额（WMS销售价）",
    value: summary.value.netSalesAmount,
    help: monthlyMetricHelp.sales.netSalesAmount,
  },
  {
    key: "netSalesCostAmount",
    label: "销售净成本",
    value: summary.value.netSalesCostAmount,
    help: monthlyMetricHelp.sales.netCostAmount,
  },
  {
    key: "estimatedGrossProfitAmount",
    label: "WMS商品毛利估算",
    value: summary.value.estimatedGrossProfitAmount,
    help: monthlyMetricHelp.sales.grossProfitAmount,
  },
  {
    key: "lineCount",
    label: "单据行数",
    value: summary.value.lineCount,
    help: monthlyMetricHelp.count.lineCount,
  },
  {
    key: "documentCount",
    label: "业务单据数",
    value: summary.value.documentCount,
    help: monthlyMetricHelp.count.documentCount,
  },
]);
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
const hasSalesDomainRow = computed(() =>
  domainRows.value.some((row) => row.domainKey === "SALES"),
);
const categoryOptions = computed(() => {
  return [...categoryCatalog.value]
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
const materialOptions = computed(() => {
  const optionsByMaterialId = new Map();

  for (const item of materialCatalog.value) {
    if (!optionsByMaterialId.has(item.materialId)) {
      optionsByMaterialId.set(item.materialId, item);
    }
  }

  return [...optionsByMaterialId.values()].sort((left, right) =>
    formatMaterialOptionLabel(left).localeCompare(
      formatMaterialOptionLabel(right),
      "zh-Hans-CN",
    ),
  );
});
const filteredMaterialRows = computed(() => {
  if (!selectedCategoryNodeKey.value) {
    return materialRows.value;
  }

  return materialRows.value.filter(
    (row) => row.categoryNodeKey === selectedCategoryNodeKey.value,
  );
});
const filteredMaterialTotal = computed(
  () => filteredMaterialRows.value.length,
);
const pagedMaterialRows = computed(() => {
  const start = (materialPageNum.value - 1) * materialPageSize.value;
  return filteredMaterialRows.value.slice(
    start,
    start + materialPageSize.value,
  );
});
const reportingSubtitle = computed(() => {
  if (isMaterialCategoryView.value) {
    return "物料分类视角按单据行事实统计本月发生，并补充按库存流水回算的月初与月末库存。分类归属使用业务发生时快照，车间领退料按物料当前分类汇总。";
  }

  if (filters.value.stockScope === "MAIN") {
    return "当前是主仓视角；库存成本按入出方向展示，销售、车间和研发项目使用各自明确的金额口径。";
  }
  if (filters.value.stockScope === "RD_SUB") {
    return "当前是 RD 小仓视角；项目交接成本进入项目归属库存，盘盈盘亏等仓务在 RD 小仓领域查看。";
  }
  return "顶层仅展示可解释的库存成本流入/流出及业务专属金额；跨物料数量只在物料汇总和单据行明细中保留。";
});
const domainSummaryTip = computed(
  () => "按统一库存成本口径查看各领域流入、流出与净变动。",
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
    ? "单据号 / 物料 / 分类 / 车间 / 销售项目"
    : "单据号 / 单据类型 / 销售项目 / 来源单据",
);
const activeDocumentTypeLabel = computed(() => {
  if (!filters.value.documentTypeKey) {
    return "当前显示全部单据类型明细";
  }

  const current = findCurrentDocumentTypeOption();

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
const materialSectionTip = computed(() => {
  if (!selectedCategoryNodeKey.value) {
    return "当前显示筛选范围内每个物料的月初、发生、月末数量金额和成本。";
  }

  const current = categoryOptions.value.find(
    (item) => item.nodeKey === selectedCategoryNodeKey.value,
  );

  return current
    ? `当前显示 ${current.categoryLabel} 下的物料汇总`
    : "当前显示选中分类下的物料汇总";
});
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
const MATERIAL_CATEGORY_COUNT_TOTAL_KEYS = new Set([
  "lineCount",
  "documentCount",
]);
const MATERIAL_CATEGORY_TOTAL_KEYS = new Set([
  "lineCount",
  "documentCount",
  "openingCostAmount",
  "inventoryCostNetChangeAmount",
  "closingCostAmount",
  "netSalesAmount",
  "netSalesCostAmount",
  "estimatedGrossProfitAmount",
  "acceptanceInboundAmount",
  "productionReceiptAmount",
  "supplierReturnAmount",
  "purchaseNetInboundAmount",
  "workshopPickCostAmount",
  "workshopReturnCostAmount",
  "workshopScrapCostAmount",
  "workshopNetConsumptionCostAmount",
  "salesOutboundSalesAmount",
  "salesOutboundCostAmount",
  "salesReturnSalesAmount",
  "salesReturnCostAmount",
]);

function createEmptyDomainSummary() {
  return {
    domainCount: 0,
    documentCount: 0,
    inventoryCostInAmount: "0.0000",
    inventoryCostOutAmount: "0.0000",
    inventoryCostNetChangeAmount: "0.0000",
    acceptanceInboundAmount: "0.0000",
    productionReceiptAmount: "0.0000",
    supplierReturnAmount: "0.0000",
    purchaseNetInboundAmount: "0.0000",
    salesNetAmount: "0.0000",
    salesNetCostAmount: "0.0000",
    workshopNetConsumptionCostAmount: "0.0000",
    rdProjectNetConsumptionCostAmount: "0.0000",
  };
}

function createEmptyMaterialCategorySummary() {
  return {
    categoryCount: 0,
    lineCount: 0,
    documentCount: 0,
    acceptanceInboundAmount: "0.0000",
    productionReceiptAmount: "0.0000",
    supplierReturnAmount: "0.0000",
    purchaseNetInboundAmount: "0.0000",
    workshopPickCostAmount: "0.0000",
    workshopReturnCostAmount: "0.0000",
    workshopScrapCostAmount: "0.0000",
    workshopNetConsumptionCostAmount: "0.0000",
    salesOutboundSalesAmount: "0.0000",
    salesOutboundCostAmount: "0.0000",
    salesReturnSalesAmount: "0.0000",
    salesReturnCostAmount: "0.0000",
    netSalesAmount: "0.0000",
    netSalesCostAmount: "0.0000",
    estimatedGrossProfitAmount: "0.0000",
    openingCostAmount: "0.0000",
    inventoryCostNetChangeAmount: "0.0000",
    closingCostAmount: "0.0000",
  };
}

function createEmptySummary(viewMode = DOMAIN_VIEW) {
  return viewMode === MATERIAL_CATEGORY_VIEW
    ? createEmptyMaterialCategorySummary()
    : createEmptyDomainSummary();
}

function getDefaultMonth() {
  const now = new Date();
  const year = now.getFullYear();
  const month = `${now.getMonth() + 1}`.padStart(2, "0");
  return `${year}-${month}`;
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
    documentTypeKey: undefined,
    materialId: undefined,
    categoryNodeKey: undefined,
    keyword: "",
  };
}

function buildSummaryCells(columns, resolveValue) {
  return columns.map((column, index) => {
    if (index === 0) {
      return "总计";
    }

    if (!column.property) {
      return "";
    }

    return resolveValue(column.property);
  });
}

function getCategorySummaries({ columns }) {
  return buildSummaryCells(columns, (property) =>
    MATERIAL_CATEGORY_TOTAL_KEYS.has(property)
      ? (summary.value[property] ??
        (MATERIAL_CATEGORY_COUNT_TOTAL_KEYS.has(property) ? 0 : "0.0000"))
      : "",
  );
}

function resolveDetailCategoryNodeKey() {
  return selectedCategoryNodeKey.value || filters.value.categoryNodeKey;
}

function buildBaseQuery({ useSelectedCategory = false } = {}) {
  const documentTypeQuery = resolveDocumentTypeQuery();

  return {
    yearMonth: filters.value.yearMonth,
    viewMode: filters.value.viewMode,
    stockScope: filters.value.stockScope || undefined,
    workshopId: filters.value.workshopId,
    domainKey: isMaterialCategoryView.value
      ? undefined
      : filters.value.domainKey,
    ...documentTypeQuery,
    materialId: isMaterialCategoryView.value
      ? filters.value.materialId
      : undefined,
    categoryNodeKey: isMaterialCategoryView.value
      ? useSelectedCategory
        ? resolveDetailCategoryNodeKey()
        : filters.value.categoryNodeKey
      : undefined,
    keyword: filters.value.keyword?.trim() || undefined,
  };
}

function resolveDocumentTypeFilterValue(item) {
  if (isMaterialCategoryView.value) {
    return item.documentTypeLabel;
  }

  return item.topicKey || item.documentTypeLabel;
}

function resolveDocumentTypeOptionKey(item) {
  return `${item.domainKey || "ALL"}:${resolveDocumentTypeFilterValue(item)}`;
}

function findCurrentDocumentTypeOption() {
  const currentValue = filters.value.documentTypeKey;

  if (!currentValue) {
    return undefined;
  }

  return filteredDocumentTypeOptions.value.find(
    (item) => resolveDocumentTypeFilterValue(item) === currentValue,
  );
}

function resolveDocumentTypeQuery() {
  const currentValue = filters.value.documentTypeKey?.trim();

  if (!currentValue) {
    return {};
  }

  const current = findCurrentDocumentTypeOption();

  if (!isMaterialCategoryView.value && current?.topicKey) {
    return { topicKey: current.topicKey };
  }

  return {
    documentTypeLabel: current?.documentTypeLabel || currentValue,
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

function formatMaterialOptionLabel(material) {
  return [
    material.materialCode,
    material.materialName,
    material.materialSpec,
    material.unitCode,
  ]
    .filter(Boolean)
    .join(" / ");
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
      workshopRows.value = data.workshops || [];
      salesProjectRows.value = [];
      rdProjectRows.value = [];
      categoryCatalog.value = data.categoryCatalog || data.categories || [];
      materialCatalog.value = data.materialCatalog || data.materials || [];
      categoryRows.value = data.categories || [];
      materialRows.value = data.materials || [];
      activeBusinessSummaryTab.value = "";
      return;
    }

    domainCatalog.value = data.domainCatalog || [];
    categoryCatalog.value = [];
    materialCatalog.value = [];
    categoryRows.value = [];
    materialRows.value = [];
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
  resetMaterialPagination();
  loadPage();
}

function handleReset() {
  filters.value = createDefaultFilters(resolveRouteViewMode());
  materialCategorySummaryVisible.value = false;
  selectedCategoryNodeKey.value = undefined;
  pageNum.value = 1;
  resetMaterialPagination();
  loadPage();
}

function toggleMaterialCategorySummary() {
  materialCategorySummaryVisible.value =
    !materialCategorySummaryVisible.value;
}

function toggleSection(sectionKey) {
  sectionExpanded.value[sectionKey] = !sectionExpanded.value[sectionKey];
  saveSectionExpansionPreference(
    sectionExpansionPreferenceStorageKey.value,
    createSectionExpansionPreference(sectionExpanded.value),
  );
}

function restoreSectionExpansionPreferences() {
  sectionExpanded.value = applySectionExpansionPreference(
    DEFAULT_SECTION_EXPANDED,
    loadSectionExpansionPreference(sectionExpansionPreferenceStorageKey.value),
  );
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

function handleMaterialPageChange(value) {
  materialPageNum.value = value;
}

function handleMaterialSizeChange(value) {
  materialPageSize.value = value;
  resetMaterialPagination();
}

function resetMaterialPagination() {
  materialPageNum.value = 1;
}

function handleDocumentTypeRowClick(row) {
  if (isMaterialCategoryView.value) {
    return;
  }

  filters.value.documentTypeKey = resolveDocumentTypeFilterValue(row);
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
  resetMaterialPagination();
  loadDetails();
}

function handleDomainChange() {
  if (isMaterialCategoryView.value) {
    return;
  }

  if (
    filters.value.documentTypeKey &&
    !filteredDocumentTypeOptions.value.some(
      (item) =>
        resolveDocumentTypeFilterValue(item) === filters.value.documentTypeKey,
    )
  ) {
    filters.value.documentTypeKey = undefined;
  }

  syncBusinessSummaryTab();
}

function clearDocumentTypeFilter() {
  filters.value.documentTypeKey = undefined;
  pageNum.value = 1;
  loadDetails();
}

function clearCategorySelection() {
  selectedCategoryNodeKey.value = undefined;
  pageNum.value = 1;
  resetMaterialPagination();
  loadDetails();
}

function clearCategoryFilter() {
  filters.value.categoryNodeKey = undefined;
  pageNum.value = 1;
  resetMaterialPagination();
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
  return resolveDocumentTypeFilterValue(row) === filters.value.documentTypeKey
    ? "is-active-row"
    : "";
}

function resolveDocumentTypeRowKey(row) {
  return `${row.domainKey || "ALL"}:${resolveDocumentTypeFilterValue(row)}`;
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
  materialCategorySummaryVisible.value = false;
  selectedCategoryNodeKey.value = undefined;
  pageNum.value = 1;
  resetMaterialPagination();
}

watch(filteredMaterialTotal, (total) => {
  const maxPage = Math.max(1, Math.ceil(total / materialPageSize.value));
  if (materialPageNum.value > maxPage) {
    materialPageNum.value = maxPage;
  }
});

watch(
  sectionExpansionPreferenceStorageKey,
  restoreSectionExpansionPreferences,
  { immediate: true },
);

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

  .summary-visibility-bar {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 8px;
    min-height: 32px;
    margin-bottom: 8px;
  }

  .summary-visibility-tip {
    color: #909399;
    font-size: 12px;
  }

  .section-card + .section-card {
    margin-top: 16px;
  }

  .section-card.is-collapsed {
    :deep(.el-card__body) {
      display: none;
    }
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

  .section-toggle {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    flex: 0 0 auto;
    padding: 4px 0;
    border: 0;
    color: inherit;
    background: transparent;
    font: inherit;
    text-align: left;
    cursor: pointer;

    &:hover {
      color: var(--el-color-primary);
    }

    &:focus-visible {
      border-radius: 4px;
      outline: 2px solid var(--el-color-primary-light-5);
      outline-offset: 2px;
    }
  }

  .section-toggle-icon {
    color: #909399;
    transition: transform 0.2s ease;

    &.is-expanded {
      transform: rotate(90deg);
    }
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

  .monthly-summary-table {
    :deep(.el-table__footer-wrapper td.el-table__cell) {
      background: #fdf6ec;
      color: #9a5b00;
      font-weight: 700;
    }

    :deep(.el-table__footer-wrapper .cell) {
      font-weight: 700;
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
