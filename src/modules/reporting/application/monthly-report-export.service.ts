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
import { MonthlyReportItemMapperService } from "./monthly-report-item-mapper.service";
import {
  type MonthlyReportMaterialCategorySummaryItem,
  type MonthlyReportMaterialCategorySummaryTotals,
  MonthlyReportMaterialCategoryService,
} from "./monthly-report-material-category.service";
import {
  type MonthlyReportQuery,
  MonthlyReportSourceService,
} from "./monthly-report-source.service";
import { buildMonthlyReportExcelXmlWorkbook } from "./monthly-reporting.formatters";
import {
  type MonthlyMaterialCategoryEntry,
  type MonthlyReportEntry,
  MonthlyReportingViewMode,
} from "./monthly-reporting.shared";

export interface MonthlyReportExportResult {
  fileName: string;
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
    const domainItems = this.domainSummaryService.buildDomainItems(
      filteredRows,
    );
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
      fileName: `monthly-reporting-${query.yearMonth}.xls`,
      content: buildMonthlyReportExcelXmlWorkbook(
        this.buildDomainSheets(
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
    const entries =
      await this.sourceService.loadMaterialCategorySourceData(query);
    const filteredEntries = this.sourceService.filterMaterialCategoryEntries(
      entries,
      query,
    );
    const categoryItems =
      this.materialCategoryService.buildMaterialCategoryItems(filteredEntries);
    const totals =
      this.materialCategoryService.buildMaterialCategoryTotals(filteredEntries);

    return {
      fileName: `monthly-reporting-material-category-${query.yearMonth}.xls`,
      content: buildMonthlyReportExcelXmlWorkbook(
        this.buildMaterialCategorySheets(totals, categoryItems, filteredEntries),
      ),
      contentType: "application/vnd.ms-excel; charset=utf-8",
    };
  }

  private buildDomainSheets(
    totals: Omit<MonthlyReportSummaryTotals, "domainCount">,
    domainItems: MonthlyReportDomainSummaryItem[],
    documentTypeItems: MonthlyReportDocumentTypeSummaryItem[],
    workshopItems: MonthlyReportWorkshopSummaryItem[],
    salesProjectItems: MonthlyReportSalesProjectSummaryItem[],
    rdProjectItems: MonthlyReportRdProjectSummaryItem[],
    filteredRows: MonthlyReportEntry[],
  ) {
    return [
      {
        name: "总览",
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
        columns: [
          "领域",
          "单据数",
          "异常单据数",
          "总入金额",
          "总出金额",
          "净发生金额",
          "总成本",
        ],
        rows: domainItems.map((item) => [
          item.domainLabel,
          item.documentCount,
          item.abnormalDocumentCount,
          item.totalInAmount,
          item.totalOutAmount,
          item.netAmount,
          item.totalCost,
        ]) as Array<Array<string | number>>,
      },
      {
        name: "单据类型汇总",
        columns: [
          "领域",
          "单据类型",
          "单据数",
          "异常单据数",
          "总入金额",
          "总出金额",
          "净发生金额",
          "总成本",
        ],
        rows: documentTypeItems.map((item) => [
          item.domainLabel,
          item.documentTypeLabel,
          item.documentCount,
          item.abnormalDocumentCount,
          item.totalInAmount,
          item.totalOutAmount,
          item.netAmount,
          item.totalCost,
        ]) as Array<Array<string | number>>,
      },
      {
        name: "车间汇总",
        columns: [
          "车间",
          "单据数",
          "异常单据数",
          "领料金额",
          "退料金额",
          "报废金额",
          "净发生金额",
          "总成本",
        ],
        rows: workshopItems.map((item) => [
          item.workshopName,
          item.documentCount,
          item.abnormalDocumentCount,
          item.pickAmount,
          item.returnAmount,
          item.scrapAmount,
          item.netAmount,
          item.totalCost,
        ]) as Array<Array<string | number>>,
      },
      {
        name: "销售项目汇总",
        columns: [
          "销售项目编码",
          "销售项目名称",
          "单据数",
          "异常单据数",
          "销售出库金额",
          "销售退货金额",
          "净发生金额",
          "总成本",
        ],
        rows: salesProjectItems.map((item) => [
          item.salesProjectCode ?? "",
          item.salesProjectName,
          item.documentCount,
          item.abnormalDocumentCount,
          item.salesOutboundAmount,
          item.salesReturnAmount,
          item.netAmount,
          item.totalCost,
        ]) as Array<Array<string | number>>,
      },
      {
        name: "研发项目汇总",
        columns: [
          "研发项目编码",
          "研发项目名称",
          "单据数",
          "异常单据数",
          "项目交接入金额",
          "项目领用金额",
          "项目退回金额",
          "项目报废金额",
          "净发生金额",
          "总成本",
        ],
        rows: rdProjectItems.map((item) => [
          item.rdProjectCode ?? "",
          item.rdProjectName,
          item.documentCount,
          item.abnormalDocumentCount,
          item.handoffInAmount,
          item.pickAmount,
          item.returnAmount,
          item.scrapAmount,
          item.netAmount,
          item.totalCost,
        ]) as Array<Array<string | number>>,
      },
      {
        name: "单据头明细",
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

  private buildMaterialCategorySheets(
    totals: Omit<MonthlyReportMaterialCategorySummaryTotals, "categoryCount">,
    categoryItems: MonthlyReportMaterialCategorySummaryItem[],
    filteredEntries: MonthlyMaterialCategoryEntry[],
  ) {
    return [
      {
        name: "总览",
        columns: ["指标", "值"],
        rows: [
          ["验收入库金额", totals.acceptanceInboundAmount],
          ["生产入库金额", totals.productionReceiptAmount],
          ["销售出库金额", totals.salesOutboundAmount],
          ["销售退货金额", totals.salesReturnAmount],
          ["净发生金额", totals.netAmount],
          ["单据行数", totals.lineCount],
          ["单据数", totals.documentCount],
          ["异常单据数", totals.abnormalDocumentCount],
          ["总成本", totals.totalCost],
        ] as Array<Array<string | number>>,
      },
      {
        name: "分类汇总",
        columns: [
          "分类编码",
          "分类名称",
          "单据行数",
          "单据数",
          "异常单据数",
          "验收入库金额",
          "生产入库金额",
          "销售出库金额",
          "销售退货金额",
          "净发生金额",
          "总成本",
        ],
        rows: categoryItems.map((item) => [
          item.categoryCode ?? "",
          item.categoryName,
          item.lineCount,
          item.documentCount,
          item.abnormalDocumentCount,
          item.acceptanceInboundAmount,
          item.productionReceiptAmount,
          item.salesOutboundAmount,
          item.salesReturnAmount,
          item.netAmount,
          item.totalCost,
        ]) as Array<Array<string | number>>,
      },
      {
        name: "单据行明细",
        columns: [
          "分类编码",
          "分类名称",
          "单据类型",
          "单据编号",
          "行号",
          "业务日期",
          "仓别",
          "车间",
          "物料编码",
          "物料名称",
          "规格型号",
          "单位",
          "销售项目编码",
          "销售项目名称",
          "数量",
          "金额",
          "成本",
          "异常标识",
          "来源月份",
          "来源单据",
        ],
        rows: filteredEntries.map((entry) => {
          const item = this.itemMapperService.toMaterialCategoryDetailItem(entry);
          return [
            item.categoryCode ?? "",
            item.categoryName,
            item.documentTypeLabel,
            item.documentNo,
            item.lineNo,
            item.bizDate,
            item.stockScopeName ?? "",
            item.workshopName ?? "",
            item.materialCode,
            item.materialName,
            item.materialSpec ?? "",
            item.unitCode,
            item.salesProjectCode ?? "",
            item.salesProjectName ?? "",
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
