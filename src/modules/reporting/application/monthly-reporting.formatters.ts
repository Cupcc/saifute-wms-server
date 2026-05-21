import type {
  MaterialCategorySnapshotNode,
  MonthlyMaterialCategoryEntry,
} from "./monthly-reporting.shared";

const RESERVED_STOCK_SCOPE_WORKSHOP_NAMES = new Set(["主仓", "研发小仓"]);
const MATERIAL_CATEGORY_DEFAULT_LABEL = "未分类";

export interface NormalizedWorkshopRef {
  workshopId: number | null;
  workshopName: string | null;
}

export function normalizeMonthlyReportWorkshopName(
  workshopName: string | null,
): string | null {
  const normalized = workshopName?.trim() || null;
  if (!normalized) {
    return null;
  }

  return RESERVED_STOCK_SCOPE_WORKSHOP_NAMES.has(normalized)
    ? null
    : normalized;
}

export function normalizeMonthlyReportWorkshopRef(
  workshopId: number | null,
  workshopName: string | null,
): NormalizedWorkshopRef {
  const normalizedWorkshopName =
    normalizeMonthlyReportWorkshopName(workshopName);

  return {
    workshopId: normalizedWorkshopName ? workshopId : null,
    workshopName: normalizedWorkshopName,
  };
}

export function formatMonthlyReportSalesProjectLabel(
  salesProjectCodes: string[],
  salesProjectNames: string[],
): string | null {
  if (salesProjectNames.length === 0 && salesProjectCodes.length === 0) {
    return null;
  }

  const pairs = salesProjectNames.map((name, index) => {
    const code = salesProjectCodes[index];
    return code ? `${code} / ${name}` : name;
  });
  const extraCodes = salesProjectCodes
    .slice(salesProjectNames.length)
    .filter((code) => !pairs.includes(code));
  return [...pairs, ...extraCodes].join("、");
}

export function resolveMonthlyMaterialCategoryPath(
  entry: MonthlyMaterialCategoryEntry,
): MaterialCategorySnapshotNode[] {
  if (entry.categoryPath.length > 0) {
    return entry.categoryPath;
  }

  return [
    {
      id: entry.categoryId,
      categoryCode: entry.categoryCode,
      categoryName: entry.categoryName || MATERIAL_CATEGORY_DEFAULT_LABEL,
    },
  ];
}

export function resolveMonthlyMaterialCategoryLeaf(
  entry: MonthlyMaterialCategoryEntry,
): MaterialCategorySnapshotNode {
  const categoryPath = resolveMonthlyMaterialCategoryPath(entry);
  return categoryPath[categoryPath.length - 1];
}

export function buildMonthlyMaterialCategoryNodeKey(node: {
  id: number | null;
  categoryCode: string | null;
  categoryName: string;
}): string {
  return `${node.id ?? "null"}:${node.categoryCode ?? ""}:${node.categoryName}`;
}

export function resolveMonthlyMaterialCategoryNodeKey(
  entry: MonthlyMaterialCategoryEntry,
): string {
  return buildMonthlyMaterialCategoryNodeKey(
    resolveMonthlyMaterialCategoryLeaf(entry),
  );
}

export interface MonthlyReportMonthRange {
  start: Date;
  end: Date;
}

export function resolveMonthlyReportMonthRange(
  yearMonth: string,
  _timeZone: string,
): MonthlyReportMonthRange {
  const [year, month] = yearMonth.split("-").map((item) => Number(item));
  const start = new Date(Date.UTC(year, month - 1, 1));
  const end = new Date(Date.UTC(year, month, 0));
  return { start, end };
}

export function formatMonthlyReportDateOnly(
  value: Date,
  timeZone: string,
): string {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return formatter.format(value);
}

type MonthlyReportExcelRowStyleId = "Total";

type MonthlyReportExcelCellValue = string | number;

export interface MonthlyReportExcelStyledRow {
  values: MonthlyReportExcelCellValue[];
  styleId?: MonthlyReportExcelRowStyleId;
}

export type MonthlyReportExcelRow =
  | MonthlyReportExcelCellValue[]
  | MonthlyReportExcelStyledRow;

export interface MonthlyReportExcelSheet {
  name: string;
  title?: string;
  columnWidths?: number[];
  columns: string[];
  rows: MonthlyReportExcelRow[];
}

const MONTHLY_REPORT_NUMERIC_COLUMN_SUFFIXES = [
  "数量",
  "单价",
  "销售价",
  "金额",
  "成本",
  "单据数",
  "单据行数",
] as const;

const MONTHLY_REPORT_EXACT_NUMERIC_COLUMNS = new Set(["值", "行号"]);

const MONTHLY_REPORT_NUMBER_PATTERN = /^-?\d+(?:\.\d+)?$/;

function escapeMonthlyReportXml(value: string | number): string {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function isMonthlyReportNumericColumn(columnName: string): boolean {
  const normalizedColumnName = columnName.trim();
  if (MONTHLY_REPORT_EXACT_NUMERIC_COLUMNS.has(normalizedColumnName)) {
    return true;
  }

  return MONTHLY_REPORT_NUMERIC_COLUMN_SUFFIXES.some((suffix) =>
    normalizedColumnName.endsWith(suffix),
  );
}

function isMonthlyReportNumberCellValue(value: string | number): boolean {
  if (typeof value === "number") {
    return Number.isFinite(value);
  }

  return MONTHLY_REPORT_NUMBER_PATTERN.test(value.trim());
}

function resolveMonthlyReportNumberStyleId(value: string | number): string {
  const textValue = String(value);
  const fractionLength = textValue.includes(".")
    ? (textValue.split(".").at(1)?.length ?? 0)
    : 0;

  if (fractionLength >= 6) {
    return "NumberDecimal6";
  }

  return fractionLength > 0 ? "NumberDecimal2" : "NumberInteger";
}

function normalizeMonthlyReportExcelRow(
  row: MonthlyReportExcelRow,
): MonthlyReportExcelStyledRow {
  return Array.isArray(row) ? { values: row } : row;
}

function resolveMonthlyReportCellStyleId(
  value: string | number,
  isHeader: boolean,
  shouldWriteAsNumber: boolean,
  rowStyleId?: MonthlyReportExcelRowStyleId,
): string | null {
  if (isHeader) {
    return "Header";
  }

  if (rowStyleId === "Total") {
    return shouldWriteAsNumber
      ? `Total${resolveMonthlyReportNumberStyleId(value)}`
      : "Total";
  }

  return shouldWriteAsNumber ? resolveMonthlyReportNumberStyleId(value) : null;
}

function buildMonthlyReportExcelRow(
  row: MonthlyReportExcelRow,
  columns: string[] = [],
  isHeader = false,
): string {
  const { values, styleId: rowStyleId } = normalizeMonthlyReportExcelRow(row);

  return `<Row>${values
    .map((value, columnIndex) => {
      const shouldWriteAsNumber =
        !isHeader &&
        isMonthlyReportNumericColumn(columns[columnIndex] ?? "") &&
        isMonthlyReportNumberCellValue(value);
      const dataType = shouldWriteAsNumber ? "Number" : "String";
      const cellValue =
        shouldWriteAsNumber && typeof value === "string" ? value.trim() : value;
      const styleId = resolveMonthlyReportCellStyleId(
        value,
        isHeader,
        shouldWriteAsNumber,
        rowStyleId,
      );
      const styleAttribute = styleId ? ` ss:StyleID="${styleId}"` : "";
      return `<Cell${styleAttribute}><Data ss:Type="${dataType}">${escapeMonthlyReportXml(
        cellValue,
      )}</Data></Cell>`;
    })
    .join("")}</Row>`;
}

function buildMonthlyReportExcelTitleRow(
  title: string,
  columnCount: number,
): string {
  const mergeAcross = Math.max(columnCount - 1, 0);
  const mergeAcrossAttribute =
    mergeAcross > 0 ? ` ss:MergeAcross="${mergeAcross}"` : "";
  return `<Row><Cell${mergeAcrossAttribute} ss:StyleID="Title"><Data ss:Type="String">${escapeMonthlyReportXml(
    title,
  )}</Data></Cell></Row>`;
}

function buildMonthlyReportExcelColumns(widths?: number[]): string {
  return (
    widths?.map((width) => `<Column ss:Width="${width}" />`).join("") ?? ""
  );
}

export function buildMonthlyReportExcelXmlWorkbook(
  sheets: MonthlyReportExcelSheet[],
): string {
  const worksheetXml = sheets
    .map(
      (sheet) => `
    <Worksheet ss:Name="${escapeMonthlyReportXml(sheet.name)}">
      <Table>
        ${buildMonthlyReportExcelColumns(sheet.columnWidths)}
        ${sheet.title ? buildMonthlyReportExcelTitleRow(sheet.title, sheet.columns.length) : ""}
        ${buildMonthlyReportExcelRow(sheet.columns, [], true)}
        ${sheet.rows
          .map((row) => buildMonthlyReportExcelRow(row, sheet.columns))
          .join("")}
      </Table>
    </Worksheet>`,
    )
    .join("");

  return `<?xml version="1.0"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:o="urn:schemas-microsoft-com:office:office"
 xmlns:x="urn:schemas-microsoft-com:office:excel"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:html="http://www.w3.org/TR/REC-html40">
  <Styles>
    <Style ss:ID="Title">
      <Alignment ss:Horizontal="Center" />
      <Font ss:Bold="1" ss:Size="14" />
    </Style>
    <Style ss:ID="Header">
      <Font ss:Bold="1" />
    </Style>
    <Style ss:ID="Total">
      <Font ss:Bold="1" />
    </Style>
    <Style ss:ID="NumberInteger">
      <NumberFormat ss:Format="0" />
    </Style>
    <Style ss:ID="NumberDecimal2">
      <NumberFormat ss:Format="0.00" />
    </Style>
    <Style ss:ID="NumberDecimal6">
      <NumberFormat ss:Format="0.000000" />
    </Style>
    <Style ss:ID="TotalNumberInteger">
      <Font ss:Bold="1" />
      <NumberFormat ss:Format="0" />
    </Style>
    <Style ss:ID="TotalNumberDecimal2">
      <Font ss:Bold="1" />
      <NumberFormat ss:Format="0.00" />
    </Style>
    <Style ss:ID="TotalNumberDecimal6">
      <Font ss:Bold="1" />
      <NumberFormat ss:Format="0.000000" />
    </Style>
  </Styles>
  ${worksheetXml}
</Workbook>`;
}
