import type { MonthlyReportMaterialCategoryDetailItem } from "./monthly-report-item-mapper.service";
import type {
  MonthlyReportMaterialCategorySummaryItem,
  MonthlyReportMaterialCategorySummaryTotals,
  MonthlyReportMaterialSummaryItem,
} from "./monthly-report-material-category.service";
import type { MonthlyReportMaterialCategoryWorkshopSummaryItem } from "./monthly-report-material-category-workshop.helper";
import type {
  MonthlyReportExcelRow,
  MonthlyReportExcelSheet,
} from "./monthly-reporting.formatters";
import { formatQuantity } from "./monthly-reporting.shared";

function buildTotalRow(values: Array<string | number>): MonthlyReportExcelRow {
  return {
    values,
    styleId: "Total",
  };
}

function parseExportNumber(value: string | number | null | undefined): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function sumWorkshopUsageItems(
  items: MonthlyReportMaterialCategoryWorkshopSummaryItem[],
  property: keyof MonthlyReportMaterialCategoryWorkshopSummaryItem,
): number {
  return items.reduce(
    (sum, item) => sum + parseExportNumber(item[property]),
    0,
  );
}

function buildCategorySummaryTotalRow(
  totals: Omit<MonthlyReportMaterialCategorySummaryTotals, "categoryCount">,
): MonthlyReportExcelRow {
  return buildTotalRow([
    "总计",
    "",
    totals.openingQuantity,
    totals.openingAmount,
    totals.netProductionQuantity,
    totals.netProductionAmount,
    totals.netSalesQuantity,
    totals.netSalesAmount,
    totals.closingQuantity,
    totals.closingAmount,
  ]);
}

function buildWorkshopUsageTotalRow(
  items: MonthlyReportMaterialCategoryWorkshopSummaryItem[],
): MonthlyReportExcelRow {
  return buildTotalRow([
    "总计",
    sumWorkshopUsageItems(items, "lineCount"),
    sumWorkshopUsageItems(items, "documentCount"),
    formatQuantity(sumWorkshopUsageItems(items, "pickQuantity")),
    sumWorkshopUsageItems(items, "pickAmount").toFixed(4),
    formatQuantity(sumWorkshopUsageItems(items, "returnQuantity")),
    sumWorkshopUsageItems(items, "returnAmount").toFixed(4),
    formatQuantity(sumWorkshopUsageItems(items, "netUsedQuantity")),
    sumWorkshopUsageItems(items, "netUsedAmount").toFixed(4),
  ]);
}

export function buildMaterialCategoryExportSheets(params: {
  yearMonth: string;
  totals: Omit<MonthlyReportMaterialCategorySummaryTotals, "categoryCount">;
  categoryItems: MonthlyReportMaterialCategorySummaryItem[];
  materialItems: MonthlyReportMaterialSummaryItem[];
  workshopItems: MonthlyReportMaterialCategoryWorkshopSummaryItem[];
  detailItems: MonthlyReportMaterialCategoryDetailItem[];
}): MonthlyReportExcelSheet[] {
  const reportTitle = `${params.yearMonth} 物料分类月报`;

  return [
    {
      name: "总览",
      title: `${reportTitle} - 总览`,
      columnWidths: [160, 100],
      columns: ["指标", "值"],
      rows: [
        ["验收入库数量", params.totals.acceptanceInboundQuantity],
        ["验收入库金额", params.totals.acceptanceInboundAmount],
        ["生产入库数量", params.totals.productionReceiptQuantity],
        ["生产入库金额", params.totals.productionReceiptAmount],
        ["退给厂家数量", params.totals.supplierReturnQuantity],
        ["退给厂家金额", params.totals.supplierReturnAmount],
        ["车间领料数量", params.totals.workshopPickQuantity],
        ["车间领料金额", params.totals.workshopPickAmount],
        ["车间退料数量", params.totals.workshopReturnQuantity],
        ["车间退料金额", params.totals.workshopReturnAmount],
        ["车间净使用数量", params.totals.workshopNetUsedQuantity],
        ["车间净使用金额", params.totals.workshopNetUsedAmount],
        ["销售出库数量", params.totals.salesOutboundQuantity],
        ["销售出库销售价金额", params.totals.salesOutboundSalesAmount],
        ["销售出库成本价金额", params.totals.salesOutboundCostAmount],
        ["销售退货数量", params.totals.salesReturnQuantity],
        ["销售退货销售价金额", params.totals.salesReturnSalesAmount],
        ["销售退货成本价金额", params.totals.salesReturnCostAmount],
        ["月初库存数量", params.totals.openingQuantity],
        ["月初库存金额", params.totals.openingAmount],
        ["库存净发生数量", params.totals.netQuantity],
        ["库存净发生金额", params.totals.netAmount],
        ["月末库存数量", params.totals.closingQuantity],
        ["月末库存金额", params.totals.closingAmount],
        ["单据行数", params.totals.lineCount],
        ["单据数", params.totals.documentCount],
      ] as Array<Array<string | number>>,
    },
    {
      name: "分类汇总",
      title: `${reportTitle} - 分类汇总`,
      columns: [
        "分类编码",
        "分类名称",
        "月初库存数量",
        "月初库存金额",
        "净生产数量",
        "净生产金额",
        "净销售数量",
        "净销售金额",
        "月末库存数量",
        "月末库存金额",
      ],
      rows: [
        ...params.categoryItems.map((item) => [
          item.categoryCode ?? "",
          item.categoryName,
          item.openingQuantity,
          item.openingAmount,
          item.netProductionQuantity,
          item.netProductionAmount,
          item.netSalesQuantity,
          item.netSalesAmount,
          item.closingQuantity,
          item.closingAmount,
        ]),
        buildCategorySummaryTotalRow(params.totals),
      ],
    },
    {
      name: "物料汇总",
      title: `${reportTitle} - 物料汇总`,
      columns: [
        "分类编码",
        "分类名称",
        "物料编码",
        "物料名称",
        "规格型号",
        "单位",
        "单据行数",
        "单据数",
        "月初数量",
        "月初金额",
        "库存净发生数量",
        "库存净发生金额",
        "月末数量",
        "月末金额",
        "入库数量",
        "出库数量",
        "验收入库数量",
        "验收入库金额",
        "生产入库数量",
        "生产入库金额",
        "退给厂家数量",
        "退给厂家金额",
        "车间领料数量",
        "车间领料金额",
        "车间退料数量",
        "车间退料金额",
        "车间净使用数量",
        "车间净使用金额",
        "销售出库数量",
        "销售出库销售价金额",
        "销售出库成本价金额",
        "销售退货数量",
        "销售退货销售价金额",
        "销售退货成本价金额",
      ],
      rows: params.materialItems.map((item) => [
        item.categoryCode ?? "",
        item.categoryName,
        item.materialCode,
        item.materialName,
        item.materialSpec ?? "",
        item.unitCode,
        item.lineCount,
        item.documentCount,
        item.openingQuantity,
        item.openingAmount,
        item.netQuantity,
        item.netAmount,
        item.closingQuantity,
        item.closingAmount,
        item.inQuantity,
        item.outQuantity,
        item.acceptanceInboundQuantity,
        item.acceptanceInboundAmount,
        item.productionReceiptQuantity,
        item.productionReceiptAmount,
        item.supplierReturnQuantity,
        item.supplierReturnAmount,
        item.workshopPickQuantity,
        item.workshopPickAmount,
        item.workshopReturnQuantity,
        item.workshopReturnAmount,
        item.workshopNetUsedQuantity,
        item.workshopNetUsedAmount,
        item.salesOutboundQuantity,
        item.salesOutboundSalesAmount,
        item.salesOutboundCostAmount,
        item.salesReturnQuantity,
        item.salesReturnSalesAmount,
        item.salesReturnCostAmount,
      ]) as Array<Array<string | number>>,
    },
    {
      name: "车间使用汇总",
      title: `${reportTitle} - 车间使用汇总`,
      columns: [
        "车间",
        "单据行数",
        "单据数",
        "领料数量",
        "领料金额",
        "退料数量",
        "退料金额",
        "净使用数量",
        "净使用金额",
      ],
      rows: [
        ...params.workshopItems.map((item) => [
          item.workshopName,
          item.lineCount,
          item.documentCount,
          item.pickQuantity,
          item.pickAmount,
          item.returnQuantity,
          item.returnAmount,
          item.netUsedQuantity,
          item.netUsedAmount,
        ]),
        buildWorkshopUsageTotalRow(params.workshopItems),
      ],
    },
    {
      name: "单据行明细",
      title: `${reportTitle} - 单据行明细`,
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
        "单价",
        "金额",
        "销售价",
        "销售金额",
      ],
      rows: params.detailItems.map((item) => [
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
        item.unitPrice,
        item.amount,
        item.salesUnitPrice ?? "",
        item.salesAmount ?? "",
      ]) as Array<Array<string | number>>,
    },
  ];
}
