import { Injectable } from "@nestjs/common";
import type { MonthlySalesProjectEntry } from "../infrastructure/monthly-report.repository";
import { normalizeMonthlyReportWorkshopRef } from "./monthly-reporting.formatters";
import {
  formatDecimal,
  formatMoney,
  getMonthlyReportingTopicMeta,
  type MonthlyReportEntry,
  MonthlyReportingDirection,
  sumDecimals,
} from "./monthly-reporting.shared";

export interface MonthlyReportWorkshopSummaryItem {
  workshopId: number | null;
  workshopName: string;
  documentCount: number;
  abnormalDocumentCount: number;
  pickQuantity: string;
  pickAmount: string;
  returnQuantity: string;
  returnAmount: string;
  scrapQuantity: string;
  scrapAmount: string;
  netQuantity: string;
  netAmount: string;
  totalCost: string;
}

export interface MonthlyReportSalesProjectSummaryItem {
  salesProjectId: number | null;
  salesProjectCode: string | null;
  salesProjectName: string;
  documentCount: number;
  abnormalDocumentCount: number;
  salesOutboundQuantity: string;
  salesOutboundAmount: string;
  salesReturnQuantity: string;
  salesReturnAmount: string;
  netQuantity: string;
  netAmount: string;
  totalCost: string;
}

export interface MonthlyReportRdProjectSummaryItem {
  rdProjectId: number | null;
  rdProjectCode: string | null;
  rdProjectName: string;
  documentCount: number;
  abnormalDocumentCount: number;
  handoffInQuantity: string;
  handoffInAmount: string;
  pickQuantity: string;
  pickAmount: string;
  returnQuantity: string;
  returnAmount: string;
  scrapQuantity: string;
  scrapAmount: string;
  netQuantity: string;
  netAmount: string;
  totalCost: string;
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
        const pickQuantity = sumDecimals(pickRows.map((row) => row.quantity));
        const returnQuantity = sumDecimals(
          returnRows.map((row) => row.quantity),
        );
        const scrapQuantity = sumDecimals(scrapRows.map((row) => row.quantity));
        const pickAmount = sumDecimals(pickRows.map((row) => row.amount));
        const returnAmount = sumDecimals(returnRows.map((row) => row.amount));
        const scrapAmount = sumDecimals(scrapRows.map((row) => row.amount));
        const documentKeys = new Set(
          item.rows.map((row) => `${row.documentType}:${row.documentId}`),
        );
        const abnormalDocumentKeys = new Set(
          item.rows
            .filter((row) => row.abnormalFlags.length > 0)
            .map((row) => `${row.documentType}:${row.documentId}`),
        );

        return {
          workshopId: item.workshopId,
          workshopName: item.workshopName,
          documentCount: documentKeys.size,
          abnormalDocumentCount: abnormalDocumentKeys.size,
          pickQuantity: formatDecimal(pickQuantity),
          pickAmount: formatMoney(pickAmount),
          returnQuantity: formatDecimal(returnQuantity),
          returnAmount: formatMoney(returnAmount),
          scrapQuantity: formatDecimal(scrapQuantity),
          scrapAmount: formatMoney(scrapAmount),
          netQuantity: formatDecimal(
            returnQuantity.sub(pickQuantity).sub(scrapQuantity),
          ),
          netAmount: formatMoney(returnAmount.sub(pickAmount).sub(scrapAmount)),
          totalCost: formatMoney(sumDecimals(item.rows.map((row) => row.cost))),
        };
      })
      .sort((left, right) =>
        right.netAmount.localeCompare(left.netAmount, "en"),
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
        const abnormalDocumentKeys = new Set(
          item.entries
            .filter((entry) => entry.abnormalFlags.length > 0)
            .map((entry) => `SalesStockOrder:${entry.documentId}`),
        );
        const outboundQuantity = sumDecimals(
          outboundEntries.map((entry) => entry.quantity),
        );
        const returnQuantity = sumDecimals(
          returnEntries.map((entry) => entry.quantity),
        );
        const outboundAmount = sumDecimals(
          outboundEntries.map((entry) => entry.amount),
        );
        const returnAmount = sumDecimals(
          returnEntries.map((entry) => entry.amount),
        );

        return {
          salesProjectId: item.salesProjectId,
          salesProjectCode: item.salesProjectCode,
          salesProjectName: item.salesProjectName,
          documentCount: documentKeys.size,
          abnormalDocumentCount: abnormalDocumentKeys.size,
          salesOutboundQuantity: formatDecimal(outboundQuantity),
          salesOutboundAmount: formatMoney(outboundAmount),
          salesReturnQuantity: formatDecimal(returnQuantity),
          salesReturnAmount: formatMoney(returnAmount),
          netQuantity: formatDecimal(outboundQuantity.sub(returnQuantity)),
          netAmount: formatMoney(outboundAmount.sub(returnAmount)),
          totalCost: formatMoney(
            sumDecimals(item.entries.map((entry) => entry.cost)),
          ),
        };
      })
      .sort((left, right) =>
        right.netAmount.localeCompare(left.netAmount, "en"),
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
        const documentKeys = new Set(
          item.rows.map((row) => `${row.documentType}:${row.documentId}`),
        );
        const abnormalDocumentKeys = new Set(
          item.rows
            .filter((row) => row.abnormalFlags.length > 0)
            .map((row) => `${row.documentType}:${row.documentId}`),
        );
        const handoffInQuantity = sumDecimals(
          handoffRows.map((row) => row.quantity),
        );
        const pickQuantity = sumDecimals(pickRows.map((row) => row.quantity));
        const returnQuantity = sumDecimals(
          returnRows.map((row) => row.quantity),
        );
        const scrapQuantity = sumDecimals(scrapRows.map((row) => row.quantity));
        const handoffInAmount = sumDecimals(
          handoffRows.map((row) => row.amount),
        );
        const pickAmount = sumDecimals(pickRows.map((row) => row.amount));
        const returnAmount = sumDecimals(returnRows.map((row) => row.amount));
        const scrapAmount = sumDecimals(scrapRows.map((row) => row.amount));

        return {
          rdProjectId: item.rdProjectId,
          rdProjectCode: item.rdProjectCode,
          rdProjectName: item.rdProjectName,
          documentCount: documentKeys.size,
          abnormalDocumentCount: abnormalDocumentKeys.size,
          handoffInQuantity: formatDecimal(handoffInQuantity),
          handoffInAmount: formatMoney(handoffInAmount),
          pickQuantity: formatDecimal(pickQuantity),
          pickAmount: formatMoney(pickAmount),
          returnQuantity: formatDecimal(returnQuantity),
          returnAmount: formatMoney(returnAmount),
          scrapQuantity: formatDecimal(scrapQuantity),
          scrapAmount: formatMoney(scrapAmount),
          netQuantity: formatDecimal(
            handoffInQuantity
              .add(returnQuantity)
              .sub(pickQuantity)
              .sub(scrapQuantity),
          ),
          netAmount: formatMoney(
            handoffInAmount.add(returnAmount).sub(pickAmount).sub(scrapAmount),
          ),
          totalCost: formatMoney(sumDecimals(item.rows.map((row) => row.cost))),
        };
      })
      .sort((left, right) =>
        right.netAmount.localeCompare(left.netAmount, "en"),
      );
  }
}
