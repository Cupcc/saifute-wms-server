import { Prisma } from "../../../../generated/prisma/client";
import type { StockScopeCode } from "../../session/domain/user-session";

export enum MonthlyReportingDomainKey {
  INBOUND = "INBOUND",
  WORKSHOP = "WORKSHOP",
  SALES = "SALES",
  RD_PROJECT = "RD_PROJECT",
  RD_SUB = "RD_SUB",
}

export enum MonthlyReportingDirection {
  IN = "IN",
  OUT = "OUT",
  TRANSFER = "TRANSFER",
}

export enum MonthlyReportingTopicKey {
  ACCEPTANCE_INBOUND = "ACCEPTANCE_INBOUND",
  PRODUCTION_RECEIPT = "PRODUCTION_RECEIPT",
  SALES_OUTBOUND = "SALES_OUTBOUND",
  SALES_RETURN = "SALES_RETURN",
  WORKSHOP_PICK = "WORKSHOP_PICK",
  WORKSHOP_RETURN = "WORKSHOP_RETURN",
  WORKSHOP_SCRAP = "WORKSHOP_SCRAP",
  RD_PROJECT_PICK = "RD_PROJECT_PICK",
  RD_PROJECT_RETURN = "RD_PROJECT_RETURN",
  RD_PROJECT_SCRAP = "RD_PROJECT_SCRAP",
  RD_HANDOFF = "RD_HANDOFF",
  RD_STOCKTAKE_GAIN = "RD_STOCKTAKE_GAIN",
  RD_STOCKTAKE_LOSS = "RD_STOCKTAKE_LOSS",
  PRICE_CORRECTION_IN = "PRICE_CORRECTION_IN",
  PRICE_CORRECTION_OUT = "PRICE_CORRECTION_OUT",
}

export enum MonthlyReportingAbnormalFlag {
  PRICE_CORRECTION = "PRICE_CORRECTION",
  BACKFILL_IMPACT = "BACKFILL_IMPACT",
  CROSS_MONTH_REFERENCE = "CROSS_MONTH_REFERENCE",
  STOCKTAKE_ADJUSTMENT = "STOCKTAKE_ADJUSTMENT",
}

export interface MonthlyReportingDomainMeta {
  order: number;
  label: string;
}

export interface MonthlyReportingTopicMeta {
  order: number;
  domainKey: MonthlyReportingDomainKey;
  label: string;
}

export const MONTHLY_REPORTING_DOMAIN_META: Record<
  MonthlyReportingDomainKey,
  MonthlyReportingDomainMeta
> = {
  [MonthlyReportingDomainKey.INBOUND]: {
    order: 10,
    label: "入库",
  },
  [MonthlyReportingDomainKey.WORKSHOP]: {
    order: 20,
    label: "车间",
  },
  [MonthlyReportingDomainKey.SALES]: {
    order: 30,
    label: "销售",
  },
  [MonthlyReportingDomainKey.RD_PROJECT]: {
    order: 40,
    label: "研发项目",
  },
  [MonthlyReportingDomainKey.RD_SUB]: {
    order: 50,
    label: "RD小仓",
  },
};

export const MONTHLY_REPORTING_TOPIC_META: Record<
  MonthlyReportingTopicKey,
  MonthlyReportingTopicMeta
> = {
  [MonthlyReportingTopicKey.ACCEPTANCE_INBOUND]: {
    order: 10,
    domainKey: MonthlyReportingDomainKey.INBOUND,
    label: "验收入库",
  },
  [MonthlyReportingTopicKey.PRODUCTION_RECEIPT]: {
    order: 20,
    domainKey: MonthlyReportingDomainKey.INBOUND,
    label: "生产入库",
  },
  [MonthlyReportingTopicKey.PRICE_CORRECTION_IN]: {
    order: 30,
    domainKey: MonthlyReportingDomainKey.INBOUND,
    label: "调价转入",
  },
  [MonthlyReportingTopicKey.PRICE_CORRECTION_OUT]: {
    order: 40,
    domainKey: MonthlyReportingDomainKey.INBOUND,
    label: "调价转出",
  },
  [MonthlyReportingTopicKey.WORKSHOP_PICK]: {
    order: 50,
    domainKey: MonthlyReportingDomainKey.WORKSHOP,
    label: "领料",
  },
  [MonthlyReportingTopicKey.WORKSHOP_RETURN]: {
    order: 60,
    domainKey: MonthlyReportingDomainKey.WORKSHOP,
    label: "退料",
  },
  [MonthlyReportingTopicKey.WORKSHOP_SCRAP]: {
    order: 70,
    domainKey: MonthlyReportingDomainKey.WORKSHOP,
    label: "报废",
  },
  [MonthlyReportingTopicKey.SALES_OUTBOUND]: {
    order: 80,
    domainKey: MonthlyReportingDomainKey.SALES,
    label: "销售出库",
  },
  [MonthlyReportingTopicKey.SALES_RETURN]: {
    order: 90,
    domainKey: MonthlyReportingDomainKey.SALES,
    label: "销售退货",
  },
  [MonthlyReportingTopicKey.RD_PROJECT_PICK]: {
    order: 100,
    domainKey: MonthlyReportingDomainKey.RD_PROJECT,
    label: "项目领用",
  },
  [MonthlyReportingTopicKey.RD_PROJECT_RETURN]: {
    order: 110,
    domainKey: MonthlyReportingDomainKey.RD_PROJECT,
    label: "项目退回",
  },
  [MonthlyReportingTopicKey.RD_PROJECT_SCRAP]: {
    order: 120,
    domainKey: MonthlyReportingDomainKey.RD_PROJECT,
    label: "项目报废",
  },
  [MonthlyReportingTopicKey.RD_HANDOFF]: {
    order: 130,
    domainKey: MonthlyReportingDomainKey.RD_SUB,
    label: "主仓到RD交接",
  },
  [MonthlyReportingTopicKey.RD_STOCKTAKE_GAIN]: {
    order: 140,
    domainKey: MonthlyReportingDomainKey.RD_SUB,
    label: "RD盘盈",
  },
  [MonthlyReportingTopicKey.RD_STOCKTAKE_LOSS]: {
    order: 150,
    domainKey: MonthlyReportingDomainKey.RD_SUB,
    label: "RD盘亏",
  },
};

export const MONTHLY_REPORTING_DOMAIN_OPTIONS = Object.values(
  MonthlyReportingDomainKey,
);

export const MONTHLY_REPORTING_TOPIC_OPTIONS = Object.values(
  MonthlyReportingTopicKey,
);

export const MONTHLY_REPORTING_ABNORMAL_LABELS: Record<
  MonthlyReportingAbnormalFlag,
  string
> = {
  [MonthlyReportingAbnormalFlag.PRICE_CORRECTION]: "调价",
  [MonthlyReportingAbnormalFlag.BACKFILL_IMPACT]: "补录影响",
  [MonthlyReportingAbnormalFlag.CROSS_MONTH_REFERENCE]: "跨月修正",
  [MonthlyReportingAbnormalFlag.STOCKTAKE_ADJUSTMENT]: "盘点调整",
};

export interface MonthlyReportEntry {
  topicKey: MonthlyReportingTopicKey;
  direction: MonthlyReportingDirection;
  documentType: string;
  documentTypeLabel: string;
  documentId: number;
  documentNo: string;
  bizDate: Date;
  createdAt: Date;
  stockScope: StockScopeCode | null;
  stockScopeName: string | null;
  workshopId: number | null;
  workshopName: string | null;
  salesProjectIds: number[];
  salesProjectCodes: string[];
  salesProjectNames: string[];
  rdProjectId: number | null;
  rdProjectCode: string | null;
  rdProjectName: string | null;
  sourceStockScopeName: string | null;
  targetStockScopeName: string | null;
  sourceWorkshopName: string | null;
  targetWorkshopName: string | null;
  quantity: Prisma.Decimal;
  amount: Prisma.Decimal;
  cost: Prisma.Decimal;
  abnormalFlags: MonthlyReportingAbnormalFlag[];
  sourceBizDate: Date | null;
  sourceDocumentNo: string | null;
}

export function getMonthlyReportingDomainMeta(
  domainKey: MonthlyReportingDomainKey,
): MonthlyReportingDomainMeta {
  return MONTHLY_REPORTING_DOMAIN_META[domainKey];
}

export function getMonthlyReportingTopicMeta(
  topicKey: MonthlyReportingTopicKey,
): MonthlyReportingTopicMeta {
  return MONTHLY_REPORTING_TOPIC_META[topicKey];
}

const yearMonthFormatterCache = new Map<string, Intl.DateTimeFormat>();

function getYearMonthFormatter(timeZone: string) {
  const cached = yearMonthFormatterCache.get(timeZone);
  if (cached) {
    return cached;
  }

  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
  });
  yearMonthFormatterCache.set(timeZone, formatter);
  return formatter;
}

export function formatYearMonth(value: Date, timeZone = "UTC") {
  const parts = getYearMonthFormatter(timeZone).formatToParts(value);
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  return `${year}-${month}`;
}

export function isSameYearMonth(left: Date, right: Date, timeZone = "UTC") {
  return formatYearMonth(left, timeZone) === formatYearMonth(right, timeZone);
}

export function formatDecimal(value: Prisma.Decimal | string | number) {
  return new Prisma.Decimal(value).toFixed(6);
}

export function formatMoney(value: Prisma.Decimal | string | number) {
  return new Prisma.Decimal(value).toFixed(2);
}

export function sumDecimals(values: Array<Prisma.Decimal | string | number>) {
  return values.reduce<Prisma.Decimal>(
    (accumulator, current) => accumulator.add(new Prisma.Decimal(current)),
    new Prisma.Decimal(0),
  );
}

export function sortMonthlyReportingEntries<T extends { topicKey: string }>(
  items: T[],
) {
  return [...items].sort((left, right) => {
    const leftMeta =
      MONTHLY_REPORTING_TOPIC_META[left.topicKey as MonthlyReportingTopicKey];
    const rightMeta =
      MONTHLY_REPORTING_TOPIC_META[right.topicKey as MonthlyReportingTopicKey];
    return (leftMeta?.order ?? 9999) - (rightMeta?.order ?? 9999);
  });
}
