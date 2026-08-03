import { Injectable } from "@nestjs/common";
import { Prisma } from "../../../../generated/prisma/client";
import type { MonthlySalesProjectEntry } from "../infrastructure/monthly-report.repository";
import { normalizeMonthlyReportWorkshopRef } from "./monthly-reporting.formatters";
import {
  formatMoney,
  getMonthlyReportingTopicMeta,
  type MonthlyReportEntry,
  MonthlyReportingDirection,
  sumDecimals,
} from "./monthly-reporting.shared";

function compareDecimalStringsDesc(left: string, right: string): number {
  return new Prisma.Decimal(right).cmp(new Prisma.Decimal(left));
}

export interface MonthlyReportWorkshopSummaryItem {
  workshopId: number | null;
  workshopName: string;
  documentCount: number;
  pickCostAmount: string;
  returnCostAmount: string;
  scrapCostAmount: string;
  netConsumptionCostAmount: string;
}

export interface MonthlyReportSalesProjectSummaryItem {
  salesProjectId: number | null;
  salesProjectCode: string | null;
  salesProjectName: string;
  documentCount: number;
  salesOutboundSalesAmount: string;
  salesOutboundCostAmount: string;
  salesReturnSalesAmount: string;
  salesReturnCostAmount: string;
  netSalesAmount: string;
  netCostAmount: string;
  estimatedGrossProfitAmount: string;
}

export interface MonthlyReportRdProjectSummaryItem {
  rdProjectId: number | null;
  rdProjectCode: string | null;
  rdProjectName: string;
  documentCount: number;
  handoffInCostAmount: string;
  pickCostAmount: string;
  returnCostAmount: string;
  scrapCostAmount: string;
  netConsumptionCostAmount: string;
  attributedInventoryCostNetChangeAmount: string;
}

@Injectable()
export class MonthlyReportDomainAggregatorService {
  buildWorkshopItems(
    rows: MonthlyReportEntry[],
  ): MonthlyReportWorkshopSummaryItem[] {
    const workshopRows = rows.filter(
      (row) =>
        getMonthlyReportingTopicMeta(row.topicKey).domainKey === "WORKSHOP",
    );
    const grouped = new Map<
      string,
      {
        workshopId: number | null;
        workshopName: string;
        rows: MonthlyReportEntry[];
      }
    >();

    for (const row of workshopRows) {
      const workshopRef = normalizeMonthlyReportWorkshopRef(
        row.workshopId,
        row.workshopName,
      );
      const workshopId = workshopRef.workshopId;
      const workshopName = workshopRef.workshopName ?? "未区分车间";
      const mapKey = `${workshopId ?? "null"}:${workshopName}`;
      const current = grouped.get(mapKey) ?? {
        workshopId,
        workshopName,
        rows: [],
      };
      current.rows.push(row);
      grouped.set(mapKey, current);
    }

    return [...grouped.values()]
      .map((item) => {
        const pickRows = item.rows.filter(
          (row) => row.topicKey === "WORKSHOP_PICK",
        );
        const returnRows = item.rows.filter(
          (row) => row.topicKey === "WORKSHOP_RETURN",
        );
        const scrapRows = item.rows.filter(
          (row) => row.topicKey === "WORKSHOP_SCRAP",
        );
        const pickCostAmount = sumDecimals(pickRows.map((row) => row.cost));
        const returnCostAmount = sumDecimals(returnRows.map((row) => row.cost));
        const scrapCostAmount = sumDecimals(scrapRows.map((row) => row.cost));
        const documentKeys = new Set(
          item.rows.map((row) => `${row.documentType}:${row.documentId}`),
        );
        return {
          workshopId: item.workshopId,
          workshopName: item.workshopName,
          documentCount: documentKeys.size,
          pickCostAmount: formatMoney(pickCostAmount),
          returnCostAmount: formatMoney(returnCostAmount),
          scrapCostAmount: formatMoney(scrapCostAmount),
          netConsumptionCostAmount: formatMoney(
            pickCostAmount.sub(returnCostAmount).add(scrapCostAmount),
          ),
        };
      })
      .sort((left, right) =>
        compareDecimalStringsDesc(
          left.netConsumptionCostAmount,
          right.netConsumptionCostAmount,
        ),
      );
  }

  buildSalesProjectItems(
    entries: MonthlySalesProjectEntry[],
  ): MonthlyReportSalesProjectSummaryItem[] {
    const grouped = new Map<
      string,
      {
        salesProjectId: number | null;
        salesProjectCode: string | null;
        salesProjectName: string;
        entries: MonthlySalesProjectEntry[];
      }
    >();

    for (const entry of entries) {
      const salesProjectName = entry.salesProjectName ?? "未关联销售项目";
      const mapKey = [
        entry.salesProjectId ?? "null",
        entry.salesProjectCode ?? "",
        salesProjectName,
      ].join(":");
      const current = grouped.get(mapKey) ?? {
        salesProjectId: entry.salesProjectId,
        salesProjectCode: entry.salesProjectCode,
        salesProjectName,
        entries: [],
      };
      current.entries.push(entry);
      grouped.set(mapKey, current);
    }

    return [...grouped.values()]
      .map((item) => {
        const outboundEntries = item.entries.filter(
          (entry) => entry.topicKey === "SALES_OUTBOUND",
        );
        const returnEntries = item.entries.filter(
          (entry) => entry.topicKey === "SALES_RETURN",
        );
        const documentKeys = new Set(
          item.entries.map((entry) => `SalesStockOrder:${entry.documentId}`),
        );
        const outboundAmount = sumDecimals(
          outboundEntries.map((entry) => entry.amount),
        );
        const returnAmount = sumDecimals(
          returnEntries.map((entry) => entry.amount),
        );
        const outboundCostAmount = sumDecimals(
          outboundEntries.map((entry) => entry.cost),
        );
        const returnCostAmount = sumDecimals(
          returnEntries.map((entry) => entry.cost),
        );
        const netSalesAmount = outboundAmount.sub(returnAmount);
        const netCostAmount = outboundCostAmount.sub(returnCostAmount);

        return {
          salesProjectId: item.salesProjectId,
          salesProjectCode: item.salesProjectCode,
          salesProjectName: item.salesProjectName,
          documentCount: documentKeys.size,
          salesOutboundSalesAmount: formatMoney(outboundAmount),
          salesOutboundCostAmount: formatMoney(outboundCostAmount),
          salesReturnSalesAmount: formatMoney(returnAmount),
          salesReturnCostAmount: formatMoney(returnCostAmount),
          netSalesAmount: formatMoney(netSalesAmount),
          netCostAmount: formatMoney(netCostAmount),
          estimatedGrossProfitAmount: formatMoney(
            netSalesAmount.sub(netCostAmount),
          ),
        };
      })
      .sort((left, right) =>
        compareDecimalStringsDesc(left.netSalesAmount, right.netSalesAmount),
      );
  }

  buildRdProjectItems(
    rows: MonthlyReportEntry[],
  ): MonthlyReportRdProjectSummaryItem[] {
    const rdProjectRows = rows.filter((row) => {
      if (
        row.topicKey === "RD_PROJECT_PICK" ||
        row.topicKey === "RD_PROJECT_RETURN" ||
        row.topicKey === "RD_PROJECT_SCRAP"
      ) {
        return true;
      }

      if (
        row.topicKey === "RD_STOCKTAKE_GAIN" ||
        row.topicKey === "RD_STOCKTAKE_LOSS"
      ) {
        return (
          row.rdProjectId != null ||
          Boolean(row.rdProjectCode) ||
          Boolean(row.rdProjectName)
        );
      }

      return (
        row.topicKey === "RD_HANDOFF" &&
        row.direction !== MonthlyReportingDirection.OUT &&
        (row.rdProjectId != null ||
          Boolean(row.rdProjectCode) ||
          Boolean(row.rdProjectName))
      );
    });
    const grouped = new Map<
      string,
      {
        rdProjectId: number | null;
        rdProjectCode: string | null;
        rdProjectName: string;
        rows: MonthlyReportEntry[];
      }
    >();

    for (const row of rdProjectRows) {
      const rdProjectName = row.rdProjectName ?? "未区分研发项目";
      const mapKey = [
        row.rdProjectId ?? "null",
        row.rdProjectCode ?? "",
        rdProjectName,
      ].join(":");
      const current = grouped.get(mapKey) ?? {
        rdProjectId: row.rdProjectId,
        rdProjectCode: row.rdProjectCode,
        rdProjectName,
        rows: [],
      };
      current.rows.push(row);
      grouped.set(mapKey, current);
    }

    return [...grouped.values()]
      .map((item) => {
        const handoffRows = item.rows.filter(
          (row) => row.topicKey === "RD_HANDOFF",
        );
        const pickRows = item.rows.filter(
          (row) => row.topicKey === "RD_PROJECT_PICK",
        );
        const returnRows = item.rows.filter(
          (row) => row.topicKey === "RD_PROJECT_RETURN",
        );
        const scrapRows = item.rows.filter(
          (row) => row.topicKey === "RD_PROJECT_SCRAP",
        );
        const stocktakeGainRows = item.rows.filter(
          (row) => row.topicKey === "RD_STOCKTAKE_GAIN",
        );
        const stocktakeLossRows = item.rows.filter(
          (row) => row.topicKey === "RD_STOCKTAKE_LOSS",
        );
        const documentKeys = new Set(
          item.rows.map((row) => `${row.documentType}:${row.documentId}`),
        );
        const handoffInCostAmount = sumDecimals(
          handoffRows.map((row) => row.cost),
        );
        const pickCostAmount = sumDecimals(pickRows.map((row) => row.cost));
        const returnCostAmount = sumDecimals(returnRows.map((row) => row.cost));
        const scrapCostAmount = sumDecimals(scrapRows.map((row) => row.cost));
        const stocktakeGainCostAmount = sumDecimals(
          stocktakeGainRows.map((row) => row.cost),
        );
        const stocktakeLossCostAmount = sumDecimals(
          stocktakeLossRows.map((row) => row.cost),
        );
        const netConsumptionCostAmount = pickCostAmount
          .sub(returnCostAmount)
          .add(scrapCostAmount);
        const attributedInventoryCostNetChangeAmount = handoffInCostAmount
          .add(returnCostAmount)
          .add(stocktakeGainCostAmount)
          .sub(pickCostAmount)
          .sub(scrapCostAmount)
          .sub(stocktakeLossCostAmount);

        return {
          rdProjectId: item.rdProjectId,
          rdProjectCode: item.rdProjectCode,
          rdProjectName: item.rdProjectName,
          documentCount: documentKeys.size,
          handoffInCostAmount: formatMoney(handoffInCostAmount),
          pickCostAmount: formatMoney(pickCostAmount),
          returnCostAmount: formatMoney(returnCostAmount),
          scrapCostAmount: formatMoney(scrapCostAmount),
          netConsumptionCostAmount: formatMoney(netConsumptionCostAmount),
          attributedInventoryCostNetChangeAmount: formatMoney(
            attributedInventoryCostNetChangeAmount,
          ),
        };
      })
      .sort((left, right) =>
        compareDecimalStringsDesc(
          left.netConsumptionCostAmount,
          right.netConsumptionCostAmount,
        ),
      );
  }
}
