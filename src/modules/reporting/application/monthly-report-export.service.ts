import { Injectable } from "@nestjs/common";
import {
  MonthlyReportDomainAggregatorService,
  type MonthlyReportRdProjectSummaryItem,
  type MonthlyReportSalesProjectSummaryItem,
  type MonthlyReportWorkshopSummaryItem,
} from "./monthly-report-domain-aggregator.service";
import {
  type MonthlyReportDocumentTypeSummaryItem,
  type MonthlyReportDomainSummaryItem,
  MonthlyReportDomainSummaryService,
  type MonthlyReportSummaryTotals,
} from "./monthly-report-domain-summary.service";
import { buildMaterialCategoryExportSheets } from "./monthly-report-export-material-category.helper";
import { MonthlyReportItemMapperService } from "./monthly-report-item-mapper.service";
import { MonthlyReportMaterialCategoryService } from "./monthly-report-material-category.service";
import { filterMonthlyMaterialCategoryBalanceSnapshots } from "./monthly-report-material-category-balance.helper";
import { buildMonthlyMaterialCategoryWorkshopUsageItems } from "./monthly-report-material-category-workshop.helper";
import {
  type MonthlyReportQuery,
  MonthlyReportSourceService,
} from "./monthly-report-source.service";
import { buildMonthlyReportExcelXmlWorkbook } from "./monthly-reporting.formatters";
import {
  type MonthlyReportEntry,
  MonthlyReportingTopicKey,
  MonthlyReportingViewMode,
} from "./monthly-reporting.shared";

export interface MonthlyReportExportResult {
  fileName: string;
  fallbackFileName: string;
  content: string;
  contentType: string;
}

@Injectable()
export class MonthlyReportExportService {
  constructor(
    private readonly sourceService: MonthlyReportSourceService,
    private readonly itemMapperService: MonthlyReportItemMapperService,
    private readonly domainSummaryService: MonthlyReportDomainSummaryService,
    private readonly aggregatorService: MonthlyReportDomainAggregatorService,
    private readonly materialCategoryService: MonthlyReportMaterialCategoryService,
  ) {}

  async exportMonthlyReport(
    query: MonthlyReportQuery,
  ): Promise<MonthlyReportExportResult> {
    if (query.viewMode === MonthlyReportingViewMode.MATERIAL_CATEGORY) {
      return this.exportMaterialCategoryMonthlyReport(query);
    }

    const { rows, salesProjectEntries } =
      await this.sourceService.loadSourceData(query);
    const rowsBeforeDocumentTypeFilter = this.sourceService.filterRows(
      rows,
      query,
      {
        ignoreDocumentTypeLabel: true,
        ignoreTopicKey: true,
      },
    );
    const filteredRows = this.sourceService.filterRows(
      rowsBeforeDocumentTypeFilter,
      query,
    );
    const filteredSalesProjectEntries =
      this.sourceService.filterSalesProjectEntries(salesProjectEntries, query);
    const domainItems = this.domainSummaryService.buildDomainItems(
      filteredRows,
      {
        stockScope: query.stockScope,
      },
    );
    const documentTypeItems = this.domainSummaryService.buildDocumentTypeItems(
      filteredRows,
      {
        includeMissingSalesTopics: !query.topicKey,
        missingSalesTopicKeys: resolveSelectedSalesTopicKeys(query.topicKey),
        salesReferenceRows: rowsBeforeDocumentTypeFilter,
        stockScope: query.stockScope,
      },
    );
    const workshopItems =
      this.aggregatorService.buildWorkshopItems(filteredRows);
    const salesProjectItems = this.aggregatorService.buildSalesProjectItems(
      filteredSalesProjectEntries,
    );
    const rdProjectItems =
      this.aggregatorService.buildRdProjectItems(filteredRows);
    const totals = this.domainSummaryService.buildSummaryTotals(
      filteredRows,
      domainItems.length,
      {
        stockScope: query.stockScope,
      },
    );

    return {
      fileName: `月度对账报表-${query.yearMonth}.xls`,
      fallbackFileName: `monthly-reporting-${query.yearMonth}.xls`,
      content: buildMonthlyReportExcelXmlWorkbook(
        this.buildDomainSheets(
          query.yearMonth,
          totals,
          domainItems,
          documentTypeItems,
          workshopItems,
          salesProjectItems,
          rdProjectItems,
          filteredRows,
        ),
      ),
      contentType: "application/vnd.ms-excel; charset=utf-8",
    };
  }

  private async exportMaterialCategoryMonthlyReport(
    query: MonthlyReportQuery,
  ): Promise<MonthlyReportExportResult> {
    const [entries, balanceSnapshots] = await Promise.all([
      this.sourceService.loadMaterialCategorySourceData(query),
      this.sourceService.loadMaterialCategoryBalanceSnapshots(query),
    ]);
    const filteredEntries = this.sourceService.filterMaterialCategoryEntries(
      entries,
      query,
    );
    const filteredBalanceSnapshots =
      filterMonthlyMaterialCategoryBalanceSnapshots(balanceSnapshots, query);
    const categoryItems =
      this.materialCategoryService.buildMaterialCategoryItems(
        filteredEntries,
        filteredBalanceSnapshots,
      );
    const materialItems = this.materialCategoryService.buildMaterialItems(
      filteredEntries,
      filteredBalanceSnapshots,
    );
    const workshopItems =
      buildMonthlyMaterialCategoryWorkshopUsageItems(filteredEntries);
    const totals = this.materialCategoryService.buildMaterialCategoryTotals(
      filteredEntries,
      filteredBalanceSnapshots,
    );

    return {
      fileName: `物料分类月报-${query.yearMonth}.xls`,
      fallbackFileName: `monthly-reporting-material-category-${query.yearMonth}.xls`,
      content: buildMonthlyReportExcelXmlWorkbook(
        buildMaterialCategoryExportSheets({
          yearMonth: query.yearMonth,
          totals,
          categoryItems,
          materialItems,
          workshopItems,
          detailItems: filteredEntries.map((entry) =>
            this.itemMapperService.toMaterialCategoryDetailItem(entry),
          ),
        }),
      ),
      contentType: "application/vnd.ms-excel; charset=utf-8",
    };
  }

  private buildDomainSheets(
    yearMonth: string,
    totals: MonthlyReportSummaryTotals,
    domainItems: MonthlyReportDomainSummaryItem[],
    documentTypeItems: MonthlyReportDocumentTypeSummaryItem[],
    workshopItems: MonthlyReportWorkshopSummaryItem[],
    salesProjectItems: MonthlyReportSalesProjectSummaryItem[],
    rdProjectItems: MonthlyReportRdProjectSummaryItem[],
    filteredRows: MonthlyReportEntry[],
  ) {
    const reportTitle = `${yearMonth} 月度对账报表`;

    return [
      {
        name: "总览",
        title: `${reportTitle} - 总览`,
        columnWidths: [160, 100],
        columns: ["指标", "值"],
        rows: [
          ["库存成本流入", totals.inventoryCostInAmount],
          ["库存成本流出", totals.inventoryCostOutAmount],
          ["库存成本净变动", totals.inventoryCostNetChangeAmount],
          ["验收入库计价金额", totals.acceptanceInboundAmount],
          ["生产入库计价金额", totals.productionReceiptAmount],
          ["退厂计价金额", totals.supplierReturnAmount],
          ["采购净入库金额", totals.purchaseNetInboundAmount],
          ["销售净额（WMS 销售价口径）", totals.salesNetAmount],
          ["销售净成本", totals.salesNetCostAmount],
          ["车间净耗用成本", totals.workshopNetConsumptionCostAmount],
          ["研发项目净耗用成本", totals.rdProjectNetConsumptionCostAmount],
          ["业务单据数", totals.documentCount],
        ] as Array<Array<string | number>>,
      },
      {
        name: "领域汇总",
        title: `${reportTitle} - 领域汇总`,
        columns: [
          "领域",
          "业务单据数",
          "库存成本流入",
          "库存成本流出",
          "库存成本净变动",
          "销售净额（WMS 销售价口径）",
          "销售净成本",
          "WMS 商品毛利估算",
        ],
        rows: domainItems.map((item) => [
          item.domainLabel,
          item.documentCount,
          item.inventoryCostInAmount,
          item.inventoryCostOutAmount,
          item.inventoryCostNetChangeAmount,
          item.netSalesAmount ?? "",
          item.netCostAmount ?? "",
          item.salesGrossProfitAmount ?? "",
        ]) as Array<Array<string | number>>,
      },
      {
        name: "单据类型汇总",
        title: `${reportTitle} - 单据类型汇总`,
        columns: [
          "领域",
          "单据类型",
          "业务单据数",
          "业务金额口径",
          "业务金额",
          "库存成本流入",
          "库存成本流出",
          "库存成本净变动",
        ],
        rows: documentTypeItems.map((item) => [
          item.domainLabel,
          item.documentTypeLabel,
          item.documentCount,
          item.businessAmountLabel,
          item.businessAmount,
          item.inventoryCostInAmount,
          item.inventoryCostOutAmount,
          item.inventoryCostNetChangeAmount,
        ]) as Array<Array<string | number>>,
      },
      {
        name: "车间汇总",
        title: `${reportTitle} - 车间汇总`,
        columns: [
          "车间",
          "业务单据数",
          "领料成本",
          "退料冲回成本",
          "报废成本",
          "车间净耗用成本",
        ],
        rows: workshopItems.map((item) => [
          item.workshopName,
          item.documentCount,
          item.pickCostAmount,
          item.returnCostAmount,
          item.scrapCostAmount,
          item.netConsumptionCostAmount,
        ]) as Array<Array<string | number>>,
      },
      {
        name: "销售项目汇总",
        title: `${reportTitle} - 销售项目汇总`,
        columns: [
          "销售项目编码",
          "销售项目名称",
          "业务单据数",
          "销售出库销售价金额",
          "销售出库成本",
          "销售退货销售价金额",
          "销售退货成本",
          "销售净额（WMS 销售价口径）",
          "销售净成本",
          "WMS 商品毛利估算",
        ],
        rows: salesProjectItems.map((item) => [
          item.salesProjectCode ?? "",
          item.salesProjectName,
          item.documentCount,
          item.salesOutboundSalesAmount,
          item.salesOutboundCostAmount,
          item.salesReturnSalesAmount,
          item.salesReturnCostAmount,
          item.netSalesAmount,
          item.netCostAmount,
          item.estimatedGrossProfitAmount,
        ]) as Array<Array<string | number>>,
      },
      {
        name: "研发项目汇总",
        title: `${reportTitle} - 研发项目汇总`,
        columns: [
          "研发项目编码",
          "研发项目名称",
          "业务单据数",
          "项目交接入成本",
          "项目领用成本",
          "项目退回成本",
          "项目报废成本",
          "项目净耗用成本",
          "项目归属库存成本净变动",
        ],
        rows: rdProjectItems.map((item) => [
          item.rdProjectCode ?? "",
          item.rdProjectName,
          item.documentCount,
          item.handoffInCostAmount,
          item.pickCostAmount,
          item.returnCostAmount,
          item.scrapCostAmount,
          item.netConsumptionCostAmount,
          item.attributedInventoryCostNetChangeAmount,
        ]) as Array<Array<string | number>>,
      },
      {
        name: "单据头明细",
        title: `${reportTitle} - 单据头明细`,
        columns: [
          "领域",
          "单据类型",
          "单据编号",
          "业务日期",
          "仓别",
          "车间",
          "销售项目",
          "研发项目编码",
          "研发项目名称",
          "来源仓别",
          "目标仓别",
          "来源车间",
          "目标车间",
          "业务金额口径",
          "业务金额",
          "库存成本",
          "来源月份",
          "来源单据",
        ],
        rows: filteredRows.map((row) => {
          const item = this.itemMapperService.toDocumentItem(row);
          return [
            item.domainLabel,
            item.documentTypeLabel,
            item.documentNo,
            item.bizDate,
            item.stockScopeName ?? "",
            item.workshopName ?? "",
            item.salesProjectLabel ?? "",
            item.rdProjectCode ?? "",
            item.rdProjectName ?? "",
            item.sourceStockScopeName ?? "",
            item.targetStockScopeName ?? "",
            item.sourceWorkshopName ?? "",
            item.targetWorkshopName ?? "",
            item.businessAmountLabel,
            item.amount,
            item.cost,
            item.sourceBizMonth ?? "",
            item.sourceDocumentNo ?? "",
          ];
        }) as Array<Array<string | number>>,
      },
    ];
  }
}

function resolveSelectedSalesTopicKeys(
  topicKey: MonthlyReportQuery["topicKey"],
):
  | ReadonlyArray<
      | MonthlyReportingTopicKey.SALES_OUTBOUND
      | MonthlyReportingTopicKey.SALES_RETURN
    >
  | undefined {
  if (
    topicKey === MonthlyReportingTopicKey.SALES_OUTBOUND ||
    topicKey === MonthlyReportingTopicKey.SALES_RETURN
  ) {
    return [topicKey];
  }

  return undefined;
}
