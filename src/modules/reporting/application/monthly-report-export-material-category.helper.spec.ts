import { buildMaterialCategoryExportSheets } from "./monthly-report-export-material-category.helper";
import type {
  MonthlyReportMaterialCategorySummaryItem,
  MonthlyReportMaterialCategorySummaryTotals,
} from "./monthly-report-material-category.service";
import type { MonthlyReportMaterialCategoryWorkshopSummaryItem } from "./monthly-report-material-category-workshop.helper";
import { buildMonthlyReportExcelXmlWorkbook } from "./monthly-reporting.formatters";

function extractWorksheet(content: string, sheetName: string): string {
  const startIndex = content.indexOf(`<Worksheet ss:Name="${sheetName}">`);
  expect(startIndex).toBeGreaterThanOrEqual(0);

  const worksheetContent = content.slice(startIndex);
  const nextWorksheetIndex = worksheetContent.indexOf(
    '<Worksheet ss:Name="',
    1,
  );

  return nextWorksheetIndex === -1
    ? worksheetContent
    : worksheetContent.slice(0, nextWorksheetIndex);
}

describe("buildMaterialCategoryExportSheets", () => {
  const totals: Omit<
    MonthlyReportMaterialCategorySummaryTotals,
    "categoryCount"
  > = {
    lineCount: 3,
    documentCount: 3,
    acceptanceInboundAmount: "0.00",
    productionReceiptAmount: "0.00",
    supplierReturnAmount: "0.00",
    purchaseNetInboundAmount: "0.00",
    workshopPickCostAmount: "80.00",
    workshopReturnCostAmount: "30.00",
    workshopScrapCostAmount: "5.00",
    workshopNetConsumptionCostAmount: "55.00",
    salesOutboundSalesAmount: "0.00",
    salesOutboundCostAmount: "0.00",
    salesReturnSalesAmount: "0.00",
    salesReturnCostAmount: "0.00",
    netSalesAmount: "0.00",
    netSalesCostAmount: "0.00",
    estimatedGrossProfitAmount: "0.00",
    openingCostAmount: "100.00",
    inventoryCostNetChangeAmount: "50.00",
    closingCostAmount: "150.00",
  };

  const categoryItem: MonthlyReportMaterialCategorySummaryItem = {
    nodeKey: "category:1",
    categoryId: 1,
    categoryCode: "001",
    categoryName: "原料",
    ...totals,
  };

  const workshopItems: MonthlyReportMaterialCategoryWorkshopSummaryItem[] = [
    {
      workshopId: 1,
      workshopName: "一车间",
      lineCount: 2,
      documentCount: 2,
      pickCostAmount: "50.00",
      returnCostAmount: "10.00",
      scrapCostAmount: "5.00",
      netConsumptionCostAmount: "45.00",
    },
    {
      workshopId: 2,
      workshopName: "二车间",
      lineCount: 1,
      documentCount: 1,
      pickCostAmount: "30.00",
      returnCostAmount: "20.00",
      scrapCostAmount: "0.00",
      netConsumptionCostAmount: "10.00",
    },
  ];

  it("keeps only backend totals and amount-only cross-material sheets", () => {
    const workbook = buildMonthlyReportExcelXmlWorkbook(
      buildMaterialCategoryExportSheets({
        yearMonth: "2026-03",
        totals,
        categoryItems: [categoryItem],
        materialItems: [],
        workshopItems,
        detailItems: [],
      }),
    );
    const categorySheet = extractWorksheet(workbook, "分类汇总");
    const workshopSheet = extractWorksheet(workbook, "车间使用汇总");

    expect(categorySheet.lastIndexOf("总计")).toBeGreaterThan(
      categorySheet.indexOf("原料"),
    );
    expect(workshopSheet).not.toContain("总计");
    expect(categorySheet).toContain(
      '<Cell ss:StyleID="Total"><Data ss:Type="String">总计</Data></Cell>',
    );
    expect(categorySheet).toContain(
      '<Cell ss:StyleID="TotalNumberDecimal2"><Data ss:Type="Number">150.00</Data></Cell>',
    );
    expect(categorySheet).not.toContain("净生产");
    expect(categorySheet).not.toContain("数量");
    expect(categorySheet).toContain("采购净入库金额");
    expect(categorySheet).toContain("销售净成本");
    expect(categorySheet).not.toContain("单据行数");
    expect(categorySheet).not.toContain("验收入库数量");
    expect(categorySheet).not.toContain("销售出库数量");
    expect(categorySheet).not.toContain("车间领料数量");
    expect(categorySheet).not.toContain("车间退料数量");
    expect(categorySheet).not.toContain("车间净使用数量");
    expect(workshopSheet).not.toContain("领料数量");
    expect(workshopSheet).not.toContain("退料数量");
    expect(workshopSheet).not.toContain("净使用");
    expect(workshopSheet).toContain("车间净耗用成本");
    expect(workshopSheet).toContain("45.00");
  });
});
