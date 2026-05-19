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
    const filteredRows = this.sourceService.filterRows(rows, query);
    const filteredSalesProjectEntries =
      this.sourceService.filterSalesProjectEntries(salesProjectEntries, query);
    const totals = this.domainSummaryService.buildTotals(filteredRows);
    const domainItems =
      this.domainSummaryService.buildDomainItems(filteredRows);
    const documentTypeItems =
      this.domainSummaryService.buildDocumentTypeItems(filteredRows);
    const workshopItems =
      this.aggregatorService.buildWorkshopItems(filteredRows);
    const salesProjectItems = this.aggregatorService.buildSalesProjectItems(
      filteredSalesProjectEntries,
    );
    const rdProjectItems =
      this.aggregatorService.buildRdProjectItems(filteredRows);

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
    totals: Omit<MonthlyReportSummaryTotals, "domainCount">,
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
          ["总入数量", totals.totalInQuantity],
          ["总入金额", totals.totalInAmount],
          ["总出数量", totals.totalOutQuantity],
          ["总出金额", totals.totalOutAmount],
          ["净发生数量", totals.netQuantity],
          ["净发生金额", totals.netAmount],
          ["单据数", totals.documentCount],
          ["异常单据数", totals.abnormalDocumentCount],
          ["总成本", totals.totalCost],
        ] as Array<Array<string | number>>,
      },
      {
        name: "领域汇总",
        title: `${reportTitle} - 领域汇总`,
        columns: [
          "领域",
          "单据数",
          "异常单据数",
          "总入数量",
          "总入金额",
          "总出数量",
          "总出金额",
          "净发生数量",
          "净发生金额",
          "总成本",
        ],
        rows: domainItems.map((item) => [
          item.domainLabel,
          item.documentCount,
          item.abnormalDocumentCount,
          item.totalInQuantity,
          item.totalInAmount,
          item.totalOutQuantity,
          item.totalOutAmount,
          item.netQuantity,
          item.netAmount,
          item.totalCost,
        ]) as Array<Array<string | number>>,
      },
      {
        name: "单据类型汇总",
        title: `${reportTitle} - 单据类型汇总`,
        columns: [
          "领域",
          "单据类型",
          "单据数",
          "异常单据数",
          "总入数量",
          "总入金额",
          "总出数量",
          "总出金额",
          "净发生数量",
          "净发生金额",
          "总成本",
        ],
        rows: documentTypeItems.map((item) => [
          item.domainLabel,
          item.documentTypeLabel,
          item.documentCount,
          item.abnormalDocumentCount,
          item.totalInQuantity,
          item.totalInAmount,
          item.totalOutQuantity,
          item.totalOutAmount,
          item.netQuantity,
          item.netAmount,
          item.totalCost,
        ]) as Array<Array<string | number>>,
      },
      {
        name: "车间汇总",
        title: `${reportTitle} - 车间汇总`,
        columns: [
          "车间",
          "单据数",
          "异常单据数",
          "领料数量",
          "领料金额",
          "退料数量",
          "退料金额",
          "报废数量",
          "报废金额",
          "净发生数量",
          "净发生金额",
          "总成本",
        ],
        rows: workshopItems.map((item) => [
          item.workshopName,
          item.documentCount,
          item.abnormalDocumentCount,
          item.pickQuantity,
          item.pickAmount,
          item.returnQuantity,
          item.returnAmount,
          item.scrapQuantity,
          item.scrapAmount,
          item.netQuantity,
          item.netAmount,
          item.totalCost,
        ]) as Array<Array<string | number>>,
      },
      {
        name: "销售项目汇总",
        title: `${reportTitle} - 销售项目汇总`,
        columns: [
          "销售项目编码",
          "销售项目名称",
          "单据数",
          "异常单据数",
          "销售出库数量",
          "销售出库金额",
          "销售退货数量",
          "销售退货金额",
          "净发生数量",
          "净发生金额",
          "总成本",
        ],
        rows: salesProjectItems.map((item) => [
          item.salesProjectCode ?? "",
          item.salesProjectName,
          item.documentCount,
          item.abnormalDocumentCount,
          item.salesOutboundQuantity,
          item.salesOutboundAmount,
          item.salesReturnQuantity,
          item.salesReturnAmount,
          item.netQuantity,
          item.netAmount,
          item.totalCost,
        ]) as Array<Array<string | number>>,
      },
      {
        name: "研发项目汇总",
        title: `${reportTitle} - 研发项目汇总`,
        columns: [
          "研发项目编码",
          "研发项目名称",
          "单据数",
          "异常单据数",
          "项目交接入数量",
          "项目交接入金额",
          "项目领用数量",
          "项目领用金额",
          "项目退回数量",
          "项目退回金额",
          "项目报废数量",
          "项目报废金额",
          "净发生数量",
          "净发生金额",
          "总成本",
        ],
        rows: rdProjectItems.map((item) => [
          item.rdProjectCode ?? "",
          item.rdProjectName,
          item.documentCount,
          item.abnormalDocumentCount,
          item.handoffInQuantity,
          item.handoffInAmount,
          item.pickQuantity,
          item.pickAmount,
          item.returnQuantity,
          item.returnAmount,
          item.scrapQuantity,
          item.scrapAmount,
          item.netQuantity,
          item.netAmount,
          item.totalCost,
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
          "数量",
          "金额",
          "成本",
          "异常标识",
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
            item.quantity,
            item.amount,
            item.cost,
            item.abnormalLabels.join("、"),
            item.sourceBizMonth ?? "",
            item.sourceDocumentNo ?? "",
          ];
        }) as Array<Array<string | number>>,
      },
    ];
  }
}
