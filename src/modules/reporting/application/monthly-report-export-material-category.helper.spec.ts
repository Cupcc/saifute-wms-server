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
    acceptanceInboundQuantity: "0",
    acceptanceInboundAmount: "0.00",
    productionReceiptQuantity: "0",
    productionReceiptAmount: "0.00",
    supplierReturnQuantity: "0",
    supplierReturnAmount: "0.00",
    netProductionQuantity: "0",
    netProductionAmount: "0.00",
    workshopPickQuantity: "8",
    workshopPickAmount: "80.00",
    workshopReturnQuantity: "3",
    workshopReturnAmount: "30.00",
    workshopNetUsedQuantity: "5",
    workshopNetUsedAmount: "50.00",
    salesOutboundQuantity: "0",
    salesOutboundAmount: "0.00",
    salesOutboundSalesAmount: "0.00",
    salesOutboundCostAmount: "0.00",
    salesReturnQuantity: "0",
    salesReturnAmount: "0.00",
    salesReturnSalesAmount: "0.00",
    salesReturnCostAmount: "0.00",
    netSalesQuantity: "0",
    netSalesAmount: "0.00",
    netQuantity: "5",
    netAmount: "50.00",
    openingQuantity: "10",
    openingAmount: "100.00",
    closingQuantity: "15",
    closingAmount: "150.00",
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
      pickQuantity: "5",
      pickAmount: "50.00",
      returnQuantity: "1",
      returnAmount: "10.00",
      netUsedQuantity: "4",
      netUsedAmount: "40.00",
    },
    {
      workshopId: 2,
      workshopName: "二车间",
      lineCount: 1,
      documentCount: 1,
      pickQuantity: "3",
      pickAmount: "30.00",
      returnQuantity: "2",
      returnAmount: "20.00",
      netUsedQuantity: "1",
      netUsedAmount: "10.00",
    },
  ];

  it("appends bold total rows to category and workshop export sheets", () => {
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
    expect(workshopSheet.lastIndexOf("总计")).toBeGreaterThan(
      workshopSheet.indexOf("二车间"),
    );
    expect(categorySheet).toContain(
      '<Cell ss:StyleID="Total"><Data ss:Type="String">总计</Data></Cell>',
    );
    expect(categorySheet).toContain(
      '<Cell ss:StyleID="TotalNumberInteger"><Data ss:Type="Number">10</Data></Cell>',
    );
    expect(categorySheet).toContain(
      '<Cell ss:StyleID="TotalNumberDecimal2"><Data ss:Type="Number">150.00</Data></Cell>',
    );
    expect(categorySheet).toContain("净生产数量");
    expect(categorySheet).toContain("净销售数量");
    expect(categorySheet).not.toContain("单据行数");
    expect(categorySheet).not.toContain("验收入库数量");
    expect(categorySheet).not.toContain("销售出库数量");
    expect(categorySheet).not.toContain("车间领料数量");
    expect(categorySheet).not.toContain("车间退料数量");
    expect(categorySheet).not.toContain("车间净使用数量");
    expect(workshopSheet).toContain(
      '<Cell ss:StyleID="Total"><Data ss:Type="String">总计</Data></Cell>',
    );
    expect(workshopSheet).toContain("领料数量");
    expect(workshopSheet).toContain("退料数量");
    expect(workshopSheet).toContain("净使用数量");
    expect(workshopSheet).toContain(
      '<Cell ss:StyleID="TotalNumberInteger"><Data ss:Type="Number">3</Data></Cell>',
    );
    expect(workshopSheet).toContain(
      '<Cell ss:StyleID="TotalNumberInteger"><Data ss:Type="Number">8</Data></Cell>',
    );
    expect(workshopSheet).toContain(
      '<Cell ss:StyleID="TotalNumberInteger"><Data ss:Type="Number">3</Data></Cell>',
    );
    expect(workshopSheet).toContain(
      '<Cell ss:StyleID="TotalNumberInteger"><Data ss:Type="Number">5</Data></Cell>',
    );
  });
});
