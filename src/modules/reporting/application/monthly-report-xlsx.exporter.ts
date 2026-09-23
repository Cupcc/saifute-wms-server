import { Workbook } from "exceljs";
import type {
  MonthlyReportExcelRow,
  MonthlyReportExcelSheet,
} from "./monthly-reporting.formatters";

/** MIME type for an OOXML workbook (`.xlsx`). */
export const MONTHLY_REPORT_XLSX_CONTENT_TYPE =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

const DEFAULT_COLUMN_WIDTH = 12;
const MONTHLY_REPORT_NUMERIC_COLUMN_SUFFIXES = [
  "数量",
  "单价",
  "销售价",
  "金额",
  "成本",
  "单据数",
  "单据行数",
] as const;
const MONTHLY_REPORT_EXACT_NUMERIC_COLUMNS = new Set([
  "值",
  "行号",
  "库存成本流入",
  "库存成本流出",
  "库存成本净变动",
  "项目归属库存成本净变动",
  "销售净额（WMS 销售价口径）",
  "WMS 商品毛利估算",
]);

function normalizeExcelColumnWidth(width: number | undefined): number {
  if (!width || !Number.isFinite(width)) {
    return DEFAULT_COLUMN_WIDTH;
  }

  // SpreadsheetML widths are pixel-like values while ExcelJS uses character
  // widths. Keep the existing report layout approximately equivalent.
  return Math.max(8, Math.round(width / 7));
}

function normalizeRow(row: MonthlyReportExcelRow) {
  return Array.isArray(row) ? { values: row } : row;
}

function isNumericColumn(columnName: string): boolean {
  const normalized = columnName.trim();

  return (
    MONTHLY_REPORT_EXACT_NUMERIC_COLUMNS.has(normalized) ||
    MONTHLY_REPORT_NUMERIC_COLUMN_SUFFIXES.some((suffix) =>
      normalized.endsWith(suffix),
    )
  );
}

function isNumericValue(value: string | number): boolean {
  if (typeof value === "number") {
    return Number.isFinite(value);
  }

  return /^-?\d+(?:\.\d+)?$/.test(value.trim());
}

function resolveNumberFormat(value: string | number): string {
  const text = String(value);
  const fractionLength = text.includes(".")
    ? (text.split(".").at(1)?.length ?? 0)
    : 0;

  if (fractionLength >= 6) {
    return "0.000000";
  }

  return fractionLength > 0 ? "0.00" : "0";
}

function toCellValue(
  value: string | number,
  columnName: string | undefined,
): string | number {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : String(value);
  }

  if (columnName && isNumericColumn(columnName) && isNumericValue(value)) {
    return Number(value);
  }

  return value;
}

/**
 * Builds a standards-compliant OOXML workbook. Unlike the former
 * SpreadsheetML text output, the returned bytes are a ZIP package and can be
 * opened directly as `.xlsx` without an Excel format/extension warning.
 */
export async function buildMonthlyReportXlsxWorkbook(
  sheets: MonthlyReportExcelSheet[],
): Promise<Buffer> {
  const workbook = new Workbook();
  workbook.creator = "Saifute WMS";
  workbook.lastModifiedBy = "Saifute WMS";
  workbook.created = new Date();
  workbook.modified = workbook.created;

  for (const sheet of sheets) {
    const worksheet = workbook.addWorksheet(sheet.name);

    for (const [index, width] of (sheet.columnWidths ?? []).entries()) {
      worksheet.getColumn(index + 1).width = normalizeExcelColumnWidth(width);
    }

    if (sheet.title) {
      const titleRow = worksheet.addRow([sheet.title]);
      titleRow.font = { bold: true, size: 14 };
      titleRow.alignment = { horizontal: "center" };
      worksheet.mergeCells(
        titleRow.number,
        1,
        titleRow.number,
        Math.max(sheet.columns.length, 1),
      );
    }

    const headerRow = worksheet.addRow(sheet.columns);
    headerRow.font = { bold: true };

    for (const row of sheet.rows) {
      const { values, styleId } = normalizeRow(row);
      const excelRow = worksheet.addRow(
        values.map((value, columnIndex) =>
          toCellValue(value, sheet.columns[columnIndex]),
        ),
      );

      if (styleId === "Total") {
        excelRow.font = { bold: true };
      }

      values.forEach((value, columnIndex) => {
        if (
          isNumericColumn(sheet.columns[columnIndex] ?? "") &&
          isNumericValue(value)
        ) {
          excelRow.getCell(columnIndex + 1).numFmt = resolveNumberFormat(value);
        }
      });
    }
  }

  return Buffer.from(
    await workbook.xlsx.writeBuffer({
      zip: { compression: "DEFLATE" },
    }),
  );
}
