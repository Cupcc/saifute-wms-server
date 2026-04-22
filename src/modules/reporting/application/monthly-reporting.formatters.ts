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

function getTimeZoneOffsetMilliseconds(value: Date, timeZone: string): number {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const parts = formatter.formatToParts(value);
  const year = Number(parts.find((part) => part.type === "year")?.value);
  const month = Number(parts.find((part) => part.type === "month")?.value);
  const day = Number(parts.find((part) => part.type === "day")?.value);
  const hour = Number(parts.find((part) => part.type === "hour")?.value);
  const minute = Number(parts.find((part) => part.type === "minute")?.value);
  const second = Number(parts.find((part) => part.type === "second")?.value);
  return (
    Date.UTC(year, month - 1, day, hour, minute, second) -
    value.getTime() +
    value.getMilliseconds()
  );
}

function createDateInBusinessTimezone(
  year: number,
  month: number,
  day: number,
  timeZone: string,
  hour = 0,
  minute = 0,
  second = 0,
  millisecond = 0,
): Date {
  const utcGuess = Date.UTC(
    year,
    month - 1,
    day,
    hour,
    minute,
    second,
    millisecond,
  );
  const offset = getTimeZoneOffsetMilliseconds(new Date(utcGuess), timeZone);
  return new Date(utcGuess - offset);
}

export function resolveMonthlyReportMonthRange(
  yearMonth: string,
  timeZone: string,
): MonthlyReportMonthRange {
  const [year, month] = yearMonth.split("-").map((item) => Number(item));
  const start = createDateInBusinessTimezone(year, month, 1, timeZone);
  const end = createDateInBusinessTimezone(
    year,
    month + 1,
    0,
    timeZone,
    23,
    59,
    59,
    999,
  );
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

export interface MonthlyReportExcelSheet {
  name: string;
  columns: string[];
  rows: Array<Array<string | number>>;
}

function escapeMonthlyReportXml(value: string | number): string {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function buildMonthlyReportExcelRow(
  values: Array<string | number>,
  isHeader = false,
): string {
  return `<Row>${values
    .map((value) => {
      const dataType = typeof value === "number" ? "Number" : "String";
      const styleId = isHeader ? ' ss:StyleID="Header"' : "";
      return `<Cell${styleId}><Data ss:Type="${dataType}">${escapeMonthlyReportXml(
        value,
      )}</Data></Cell>`;
    })
    .join("")}</Row>`;
}

export function buildMonthlyReportExcelXmlWorkbook(
  sheets: MonthlyReportExcelSheet[],
): string {
  const worksheetXml = sheets
    .map(
      (sheet) => `
    <Worksheet ss:Name="${escapeMonthlyReportXml(sheet.name)}">
      <Table>
        ${buildMonthlyReportExcelRow(sheet.columns, true)}
        ${sheet.rows.map((row) => buildMonthlyReportExcelRow(row)).join("")}
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
    <Style ss:ID="Header">
      <Font ss:Bold="1" />
    </Style>
  </Styles>
  ${worksheetXml}
</Workbook>`;
}
