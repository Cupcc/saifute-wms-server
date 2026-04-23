import {
  Prisma,
  RdProjectMaterialActionType,
  WorkshopMaterialOrderType,
} from "../../../../generated/prisma/client";
import type { PrismaService } from "../../../shared/prisma/prisma.service";
import type { StockScopeCode } from "../../session/domain/user-session";
import {
  MonthlyReportingAbnormalFlag,
  MonthlyReportingTopicKey,
  isSameYearMonth,
} from "../application/monthly-reporting.shared";

export function resolveSourceReference(
  currentBizDate: Date,
  sources: Array<{ bizDate: Date; documentNo: string }>,
  businessTimezone: string,
) {
  const uniqueDocumentNos = [
    ...new Set(sources.map((item) => item.documentNo)),
  ];
  const matchedSource =
    sources.find(
      (item) =>
        !isSameYearMonth(item.bizDate, currentBizDate, businessTimezone),
    ) ??
    sources[0] ??
    null;

  return {
    sourceBizDate: matchedSource?.bizDate ?? null,
    sourceDocumentNo:
      uniqueDocumentNos.length === 0
        ? null
        : uniqueDocumentNos.length === 1
          ? uniqueDocumentNos[0]
          : `${uniqueDocumentNos[0]} 等${uniqueDocumentNos.length}张`,
  };
}

export function buildAbnormalFlags(
  params: {
    bizDate: Date;
    createdAt: Date;
    sourceBizDate?: Date | null;
    extraFlags?: MonthlyReportingAbnormalFlag[];
  },
  businessTimezone: string,
) {
  const flags = [...(params.extraFlags ?? [])];

  if (
    !isSameYearMonth(params.bizDate, params.createdAt, businessTimezone)
  ) {
    flags.push(MonthlyReportingAbnormalFlag.BACKFILL_IMPACT);
  }

  if (
    params.sourceBizDate &&
    !isSameYearMonth(
      params.bizDate,
      params.sourceBizDate,
      businessTimezone,
    )
  ) {
    flags.push(MonthlyReportingAbnormalFlag.CROSS_MONTH_REFERENCE);
  }

  return [...new Set(flags)];
}

export function toStockScopeCode(
  scopeCode?: string | null,
): StockScopeCode | null {
  if (scopeCode === "MAIN" || scopeCode === "RD_SUB") {
    return scopeCode;
  }

  return null;
}

export function toDecimal(
  value: Prisma.Decimal | string | number | null | undefined,
) {
  return new Prisma.Decimal(value ?? 0);
}

export function sumNullableDecimals(
  values: Array<Prisma.Decimal | string | number | null | undefined>,
): Prisma.Decimal {
  return values.reduce<Prisma.Decimal>(
    (accumulator, current) => accumulator.add(toDecimal(current)),
    new Prisma.Decimal(0),
  );
}

export function multiplyDecimals(
  left: Prisma.Decimal | string | number | null | undefined,
  right: Prisma.Decimal | string | number | null | undefined,
) {
  return toDecimal(left).mul(toDecimal(right));
}

export function collectDistinctNumbers(
  values: Array<number | null | undefined>,
): number[] {
  return [
    ...new Set(
      values.filter(
        (value): value is number => typeof value === "number",
      ),
    ),
  ];
}

export function collectDistinctStrings(
  values: Array<string | null | undefined>,
): string[] {
  return [
    ...new Set(
      values.filter(
        (value): value is string =>
          typeof value === "string" && value.trim().length > 0,
      ),
    ),
  ];
}

export function joinArrowLabels(
  left?: string | null,
  right?: string | null,
) {
  if (left && right) {
    return `${left} -> ${right}`;
  }

  return left ?? right ?? null;
}

export function toWorkshopTopicKey(orderType: WorkshopMaterialOrderType) {
  switch (orderType) {
    case WorkshopMaterialOrderType.PICK:
      return MonthlyReportingTopicKey.WORKSHOP_PICK;
    case WorkshopMaterialOrderType.RETURN:
      return MonthlyReportingTopicKey.WORKSHOP_RETURN;
    default:
      return MonthlyReportingTopicKey.WORKSHOP_SCRAP;
  }
}

export function toWorkshopDocumentLabel(
  orderType: WorkshopMaterialOrderType,
) {
  switch (orderType) {
    case WorkshopMaterialOrderType.PICK:
      return "领料单";
    case WorkshopMaterialOrderType.RETURN:
      return "退料单";
    default:
      return "报废单";
  }
}

export function toRdProjectTopicKey(
  actionType: RdProjectMaterialActionType,
) {
  switch (actionType) {
    case RdProjectMaterialActionType.PICK:
      return MonthlyReportingTopicKey.RD_PROJECT_PICK;
    case RdProjectMaterialActionType.RETURN:
      return MonthlyReportingTopicKey.RD_PROJECT_RETURN;
    default:
      return MonthlyReportingTopicKey.RD_PROJECT_SCRAP;
  }
}

export function toRdProjectDocumentLabel(
  actionType: RdProjectMaterialActionType,
) {
  switch (actionType) {
    case RdProjectMaterialActionType.PICK:
      return "项目领用单";
    case RdProjectMaterialActionType.RETURN:
      return "项目退回单";
    default:
      return "项目报废单";
  }
}

export async function loadSalesOrderSourceMap(
  prisma: PrismaService,
  sourceIds: number[],
) {
  if (sourceIds.length === 0) {
    return new Map<number, { bizDate: Date; documentNo: string }>();
  }

  const orders = await prisma.salesStockOrder.findMany({
    where: { id: { in: sourceIds } },
    select: {
      id: true,
      bizDate: true,
      documentNo: true,
    },
  });

  return new Map(
    orders.map((item) => [
      item.id,
      {
        bizDate: item.bizDate,
        documentNo: item.documentNo,
      },
    ]),
  );
}

export async function loadWorkshopOrderSourceMap(
  prisma: PrismaService,
  sourceIds: number[],
) {
  if (sourceIds.length === 0) {
    return new Map<number, { bizDate: Date; documentNo: string }>();
  }

  const orders = await prisma.workshopMaterialOrder.findMany({
    where: { id: { in: sourceIds } },
    select: {
      id: true,
      bizDate: true,
      documentNo: true,
    },
  });

  return new Map(
    orders.map((item) => [
      item.id,
      {
        bizDate: item.bizDate,
        documentNo: item.documentNo,
      },
    ]),
  );
}

export async function loadRdProjectActionSourceMap(
  prisma: PrismaService,
  sourceIds: number[],
) {
  if (sourceIds.length === 0) {
    return new Map<number, { bizDate: Date; documentNo: string }>();
  }

  const actions = await prisma.rdProjectMaterialAction.findMany({
    where: { id: { in: sourceIds } },
    select: {
      id: true,
      bizDate: true,
      documentNo: true,
    },
  });

  return new Map(
    actions.map((item) => [
      item.id,
      {
        bizDate: item.bizDate,
        documentNo: item.documentNo,
      },
    ]),
  );
}
