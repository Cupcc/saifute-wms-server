import {
  buildMonthlyReportExcelXmlWorkbook,
  resolveMonthlyReportMonthRange,
} from "./monthly-reporting.formatters";

describe("monthly-reporting formatters", () => {
  it("resolves month ranges as date-only boundaries for database DATE columns", () => {
    const { start, end } = resolveMonthlyReportMonthRange(
      "2026-03",
      "Asia/Shanghai",
    );

    expect(start.toISOString()).toBe("2026-03-01T00:00:00.000Z");
    expect(end.toISOString()).toBe("2026-03-31T00:00:00.000Z");
  });

  it("writes report numeric columns as Excel numbers without converting business codes", () => {
    const workbook = buildMonthlyReportExcelXmlWorkbook([
      {
        name: "分类汇总",
        columns: [
          "分类编码",
          "销售项目编码",
          "数量",
          "单价",
          "金额",
          "销售价",
          "单据数",
          "值",
          "业务日期",
        ],
        rows: [
          [
            "001",
            "1002",
            "3.00",
            "4.17",
            "12.50",
            "5.20",
            2,
            "8.000000",
            "2026-03-01",
          ],
        ],
      },
    ]);

    expect(workbook).toContain('<Data ss:Type="String">001</Data>');
    expect(workbook).toContain('<Data ss:Type="String">1002</Data>');
    expect(workbook).toContain(
      '<Cell ss:StyleID="NumberDecimal2"><Data ss:Type="Number">3.00</Data></Cell>',
    );
    expect(workbook).toContain(
      '<Cell ss:StyleID="NumberDecimal2"><Data ss:Type="Number">12.50</Data></Cell>',
    );
    expect(workbook).toContain(
      '<Cell ss:StyleID="NumberDecimal2"><Data ss:Type="Number">4.17</Data></Cell>',
    );
    expect(workbook).toContain(
      '<Cell ss:StyleID="NumberDecimal2"><Data ss:Type="Number">5.20</Data></Cell>',
    );
    expect(workbook).toContain(
      '<Cell ss:StyleID="NumberInteger"><Data ss:Type="Number">2</Data></Cell>',
    );
    expect(workbook).toContain(
      '<Cell ss:StyleID="NumberDecimal6"><Data ss:Type="Number">8.000000</Data></Cell>',
    );
    expect(workbook).toContain('<Data ss:Type="String">2026-03-01</Data>');
  });

  it("writes styled total rows as bold while preserving numeric formats", () => {
    const workbook = buildMonthlyReportExcelXmlWorkbook([
      {
        name: "分类汇总",
        columns: ["分类编码", "单据行数", "金额"],
        rows: [
          ["001", 2, "12.50"],
          {
            values: ["总计", 2, "12.50"],
            styleId: "Total",
          },
        ],
      },
    ]);

    expect(workbook).toContain('<Style ss:ID="Total">');
    expect(workbook).toContain('<Style ss:ID="TotalNumberInteger">');
    expect(workbook).toContain('<Style ss:ID="TotalNumberDecimal2">');
    expect(workbook).toContain(
      '<Cell ss:StyleID="Total"><Data ss:Type="String">总计</Data></Cell>',
    );
    expect(workbook).toContain(
      '<Cell ss:StyleID="TotalNumberInteger"><Data ss:Type="Number">2</Data></Cell>',
    );
    expect(workbook).toContain(
      '<Cell ss:StyleID="TotalNumberDecimal2"><Data ss:Type="Number">12.50</Data></Cell>',
    );
  });
});
