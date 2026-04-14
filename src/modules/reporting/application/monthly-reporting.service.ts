import { Injectable } from "@nestjs/common";
import { Prisma } from "../../../../generated/prisma/client";
import { AppConfigService } from "../../../shared/config/app-config.service";
import type { StockScopeCode } from "../../session/domain/user-session";
import {
  ReportingRepository,
  type MonthlySalesProjectEntry,
} from "../infrastructure/reporting.repository";
import {
  formatDecimal,
  formatMoney,
  formatYearMonth,
  getMonthlyReportingDomainMeta,
  getMonthlyReportingTopicMeta,
  MONTHLY_REPORTING_ABNORMAL_LABELS,
  MONTHLY_REPORTING_DOMAIN_META,
  MONTHLY_REPORTING_TOPIC_META,
  type MonthlyReportEntry,
  MonthlyReportingDirection,
  type MonthlyReportingDomainKey,
  type MonthlyReportingTopicKey,
  sortMonthlyReportingEntries,
  sumDecimals,
} from "./monthly-reporting.shared";

export interface MonthlyReportDomainCatalogItem {
  domainKey: MonthlyReportingDomainKey;
  domainLabel: string;
  sortOrder: number;
}

export interface MonthlyReportTopicCatalogItem {
  domainKey: MonthlyReportingDomainKey;
  domainLabel: string;
  topicKey: MonthlyReportingTopicKey;
  topicLabel: string;
  sortOrder: number;
}

export interface MonthlyReportSummaryTotals {
  domainCount: number;
  documentCount: number;
  abnormalDocumentCount: number;
  totalInQuantity: string;
  totalInAmount: string;
  totalOutQuantity: string;
  totalOutAmount: string;
  totalTransferQuantity: string;
  totalTransferAmount: string;
  netQuantity: string;
  netAmount: string;
  totalCost: string;
}

export interface MonthlyReportDomainSummaryItem
  extends Omit<MonthlyReportSummaryTotals, "domainCount"> {
  domainKey: MonthlyReportingDomainKey;
  domainLabel: string;
}

export interface MonthlyReportTopicSummaryItem
  extends Omit<MonthlyReportSummaryTotals, "domainCount"> {
  domainKey: MonthlyReportingDomainKey;
  domainLabel: string;
  topicKey: MonthlyReportingTopicKey;
  topicLabel: string;
}

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

export interface MonthlyReportRdHandoffSummaryItem {
  sourceStockScopeName: string;
  targetStockScopeName: string;
  sourceWorkshopName: string;
  targetWorkshopName: string;
  documentCount: number;
  abnormalDocumentCount: number;
  transferQuantity: string;
  transferAmount: string;
  totalCost: string;
}

export interface MonthlyReportDocumentItem {
  domainKey: MonthlyReportingDomainKey;
  domainLabel: string;
  topicKey: MonthlyReportingTopicKey;
  topicLabel: string;
  direction: MonthlyReportingDirection;
  documentType: string;
  documentTypeLabel: string;
  documentId: number;
  documentNo: string;
  bizDate: string;
  stockScope: StockScopeCode | null;
  stockScopeName: string | null;
  workshopId: number | null;
  workshopName: string | null;
  salesProjectLabel: string | null;
  rdProjectCode: string | null;
  rdProjectName: string | null;
  sourceStockScopeName: string | null;
  targetStockScopeName: string | null;
  sourceWorkshopName: string | null;
  targetWorkshopName: string | null;
  quantity: string;
  amount: string;
  cost: string;
  abnormalFlags: string[];
  abnormalLabels: string[];
  sourceBizMonth: string | null;
  sourceDocumentNo: string | null;
  createdAt: string;
}

export interface MonthlyReportExportResult {
  fileName: string;
  content: string;
  contentType: string;
}

interface MonthlyReportQuery {
  yearMonth: string;
  stockScope?: StockScopeCode;
  workshopId?: number;
  domainKey?: MonthlyReportingDomainKey;
  topicKey?: MonthlyReportingTopicKey;
  abnormalOnly?: boolean;
  keyword?: string;
  limit?: number;
  offset?: number;
}

interface MonthlyReportSourceData {
  rows: MonthlyReportEntry[];
  salesProjectEntries: MonthlySalesProjectEntry[];
}

const RESERVED_STOCK_SCOPE_WORKSHOP_NAMES = new Set(["主仓", "研发小仓"]);

@Injectable()
export class MonthlyReportingService {
  constructor(
    private readonly repository: ReportingRepository,
    private readonly appConfigService: AppConfigService,
  ) {}

  async getMonthlyReportSummary(query: MonthlyReportQuery) {
    const { rows, salesProjectEntries } = await this.loadSourceData(query);
    const filteredRows = this.filterRows(rows, query);
    const filteredSalesProjectEntries = this.filterSalesProjectEntries(
      salesProjectEntries,
      query,
    );
    const domainItems = this.buildDomainItems(filteredRows);

    return {
      yearMonth: query.yearMonth,
      filters: {
        stockScope: query.stockScope ?? null,
        workshopId: query.workshopId ?? null,
        domainKey: query.domainKey ?? null,
        topicKey: query.topicKey ?? null,
        abnormalOnly: query.abnormalOnly ?? false,
        keyword: query.keyword?.trim() || null,
      },
      domainCatalog: this.buildDomainCatalog(),
      topicCatalog: this.buildTopicCatalog(),
      domains: domainItems,
      topics: this.buildTopicItems(filteredRows),
      workshopItems: this.buildWorkshopItems(filteredRows),
      salesProjectItems: this.buildSalesProjectItems(filteredSalesProjectEntries),
      rdProjectItems: this.buildRdProjectItems(filteredRows),
      rdHandoffItems: this.buildRdHandoffItems(filteredRows),
      summary: {
        domainCount: domainItems.length,
        ...this.buildTotals(filteredRows),
      },
    };
  }

  async getMonthlyReportDocuments(query: MonthlyReportQuery) {
    const { rows } = await this.loadSourceData(query);
    const filteredRows = this.filterRows(rows, query);
    const offset = query.offset ?? 0;
    const limit = Math.min(query.limit ?? 50, 200);

    return {
      yearMonth: query.yearMonth,
      total: filteredRows.length,
      items: filteredRows
        .slice(offset, offset + limit)
        .map((row) => this.toDocumentItem(row)),
      summary: this.buildTotals(filteredRows),
    };
  }

  async exportMonthlyReport(
    query: MonthlyReportQuery,
  ): Promise<MonthlyReportExportResult> {
    const { rows, salesProjectEntries } = await this.loadSourceData(query);
    const filteredRows = this.filterRows(rows, query);
    const filteredSalesProjectEntries = this.filterSalesProjectEntries(
      salesProjectEntries,
      query,
    );
    const totals = this.buildTotals(filteredRows);
    const domainItems = this.buildDomainItems(filteredRows);
    const topicItems = this.buildTopicItems(filteredRows);
    const workshopItems = this.buildWorkshopItems(filteredRows);
    const salesProjectItems = this.buildSalesProjectItems(
      filteredSalesProjectEntries,
    );
    const rdProjectItems = this.buildRdProjectItems(filteredRows);
    const rdHandoffItems = this.buildRdHandoffItems(filteredRows);

    return {
      fileName: `monthly-reporting-${query.yearMonth}.xls`,
      content: this.buildExcelXmlWorkbook([
        {
          name: "总览",
          columns: ["指标", "值"],
          rows: [
            ["总入数量", totals.totalInQuantity],
            ["总入金额", totals.totalInAmount],
            ["总出数量", totals.totalOutQuantity],
            ["总出金额", totals.totalOutAmount],
            ["交接数量", totals.totalTransferQuantity],
            ["交接金额", totals.totalTransferAmount],
            ["净发生数量", totals.netQuantity],
            ["净发生金额", totals.netAmount],
            ["单据数", totals.documentCount],
            ["异常单据数", totals.abnormalDocumentCount],
            ["总成本", totals.totalCost],
          ],
        },
        {
          name: "领域汇总",
          columns: [
            "领域",
            "单据数",
            "异常单据数",
            "总入金额",
            "总出金额",
            "交接金额",
            "净发生金额",
            "总成本",
          ],
          rows: domainItems.map((item) => [
            item.domainLabel,
            item.documentCount,
            item.abnormalDocumentCount,
            item.totalInAmount,
            item.totalOutAmount,
            item.totalTransferAmount,
            item.netAmount,
            item.totalCost,
          ]),
        },
        {
          name: "业务操作汇总",
          columns: [
            "领域",
            "操作",
            "单据数",
            "异常单据数",
            "总入金额",
            "总出金额",
            "交接金额",
            "净发生金额",
            "总成本",
          ],
          rows: topicItems.map((item) => [
            item.domainLabel,
            item.topicLabel,
            item.documentCount,
            item.abnormalDocumentCount,
            item.totalInAmount,
            item.totalOutAmount,
            item.totalTransferAmount,
            item.netAmount,
            item.totalCost,
          ]),
        },
        {
          name: "车间汇总",
          columns: [
            "车间",
            "单据数",
            "异常单据数",
            "领料金额",
            "退料金额",
            "报废金额",
            "净发生金额",
            "总成本",
          ],
          rows: workshopItems.map((item) => [
            item.workshopName,
            item.documentCount,
            item.abnormalDocumentCount,
            item.pickAmount,
            item.returnAmount,
            item.scrapAmount,
            item.netAmount,
            item.totalCost,
          ]),
        },
        {
          name: "销售项目汇总",
          columns: [
            "销售项目编码",
            "销售项目名称",
            "单据数",
            "异常单据数",
            "销售出库金额",
            "销售退货金额",
            "净发生金额",
            "总成本",
          ],
          rows: salesProjectItems.map((item) => [
            item.salesProjectCode ?? "",
            item.salesProjectName,
            item.documentCount,
            item.abnormalDocumentCount,
            item.salesOutboundAmount,
            item.salesReturnAmount,
            item.netAmount,
            item.totalCost,
          ]),
        },
        {
          name: "研发项目汇总",
          columns: [
            "研发项目编码",
            "研发项目名称",
            "单据数",
            "异常单据数",
            "项目领用金额",
            "项目退回金额",
            "项目报废金额",
            "净发生金额",
            "总成本",
          ],
          rows: rdProjectItems.map((item) => [
            item.rdProjectCode ?? "",
            item.rdProjectName,
            item.documentCount,
            item.abnormalDocumentCount,
            item.pickAmount,
            item.returnAmount,
            item.scrapAmount,
            item.netAmount,
            item.totalCost,
          ]),
        },
        {
          name: "主仓到RD交接汇总",
          columns: [
            "来源仓别",
            "目标仓别",
            "来源车间",
            "目标车间",
            "单据数",
            "异常单据数",
            "交接金额",
            "总成本",
          ],
          rows: rdHandoffItems.map((item) => [
            item.sourceStockScopeName,
            item.targetStockScopeName,
            item.sourceWorkshopName,
            item.targetWorkshopName,
            item.documentCount,
            item.abnormalDocumentCount,
            item.transferAmount,
            item.totalCost,
          ]),
        },
        {
          name: "单据头明细",
          columns: [
            "领域",
            "操作",
            "单据类型",
            "单据编号",
            "业务日期",
            "仓别",
            "车间",
            "销售项目",
            "研发项目编码",
            "研发项目名称",
            "来源仓别",
            "目标仓别",
            "来源车间",
            "目标车间",
            "数量",
            "金额",
            "成本",
            "异常标识",
            "来源月份",
            "来源单据",
          ],
          rows: filteredRows.map((row) => {
            const item = this.toDocumentItem(row);
            return [
              item.domainLabel,
              item.topicLabel,
              item.documentTypeLabel,
              item.documentNo,
              item.bizDate,
              item.stockScopeName ?? "",
              item.workshopName ?? "",
              item.salesProjectLabel ?? "",
              item.rdProjectCode ?? "",
              item.rdProjectName ?? "",
              item.sourceStockScopeName ?? "",
              item.targetStockScopeName ?? "",
              item.sourceWorkshopName ?? "",
              item.targetWorkshopName ?? "",
              item.quantity,
              item.amount,
              item.cost,
              item.abnormalLabels.join("、"),
              item.sourceBizMonth ?? "",
              item.sourceDocumentNo ?? "",
            ];
          }),
        },
      ]),
      contentType: "application/vnd.ms-excel; charset=utf-8",
    };
  }

  private async loadSourceData(
    query: MonthlyReportQuery,
  ): Promise<MonthlyReportSourceData> {
    const { start, end } = this.resolveMonthRange(query.yearMonth);
    const [rows, salesProjectEntries] = await Promise.all([
      this.repository.findMonthlyReportEntries({
        start,
        end,
        stockScope: query.stockScope,
        workshopId: query.workshopId,
      }),
      this.repository.findMonthlySalesProjectEntries({
        start,
        end,
        stockScope: query.stockScope,
        workshopId: query.workshopId,
      }),
    ]);

    return {
      rows,
      salesProjectEntries,
    };
  }

  private filterRows(rows: MonthlyReportEntry[], query: MonthlyReportQuery) {
    return [...rows]
      .filter((row) =>
        query.domainKey
          ? getMonthlyReportingTopicMeta(row.topicKey).domainKey ===
            query.domainKey
          : true,
      )
      .filter((row) => (query.topicKey ? row.topicKey === query.topicKey : true))
      .filter((row) =>
        query.abnormalOnly ? row.abnormalFlags.length > 0 : true,
      )
      .filter((row) => this.matchesKeyword(row, query.keyword))
      .sort((left, right) => {
        const leftDomainKey = getMonthlyReportingTopicMeta(left.topicKey).domainKey;
        const rightDomainKey = getMonthlyReportingTopicMeta(right.topicKey).domainKey;
        const leftDomainOrder = getMonthlyReportingDomainMeta(leftDomainKey).order;
        const rightDomainOrder = getMonthlyReportingDomainMeta(
          rightDomainKey,
        ).order;

        if (leftDomainOrder !== rightDomainOrder) {
          return leftDomainOrder - rightDomainOrder;
        }

        const leftTopicOrder = getMonthlyReportingTopicMeta(left.topicKey).order;
        const rightTopicOrder = getMonthlyReportingTopicMeta(right.topicKey).order;
        if (leftTopicOrder !== rightTopicOrder) {
          return leftTopicOrder - rightTopicOrder;
        }

        const leftBizName = this.resolveRowBusinessName(left);
        const rightBizName = this.resolveRowBusinessName(right);
        if (leftBizName !== rightBizName) {
          return leftBizName.localeCompare(rightBizName, "zh-Hans-CN");
        }

        if (left.bizDate.getTime() !== right.bizDate.getTime()) {
          return left.bizDate.getTime() - right.bizDate.getTime();
        }

        return left.documentNo.localeCompare(right.documentNo);
      });
  }

  private filterSalesProjectEntries(
    entries: MonthlySalesProjectEntry[],
    query: MonthlyReportQuery,
  ) {
    if (query.domainKey && query.domainKey !== "SALES") {
      return [];
    }

    if (
      query.topicKey &&
      query.topicKey !== "SALES_OUTBOUND" &&
      query.topicKey !== "SALES_RETURN"
    ) {
      return [];
    }

    return entries
      .filter((entry) => (query.topicKey ? entry.topicKey === query.topicKey : true))
      .filter((entry) =>
        query.abnormalOnly ? entry.abnormalFlags.length > 0 : true,
      )
      .filter((entry) => this.matchesSalesProjectKeyword(entry, query.keyword));
  }

  private toDocumentItem(row: MonthlyReportEntry): MonthlyReportDocumentItem {
    const topicMeta = getMonthlyReportingTopicMeta(row.topicKey);
    const domainMeta = getMonthlyReportingDomainMeta(topicMeta.domainKey);
    const workshopRef = this.normalizeWorkshopRef(row.workshopId, row.workshopName);

    return {
      domainKey: topicMeta.domainKey,
      domainLabel: domainMeta.label,
      topicKey: row.topicKey,
      topicLabel: topicMeta.label,
      direction: row.direction,
      documentType: row.documentType,
      documentTypeLabel: row.documentTypeLabel,
      documentId: row.documentId,
      documentNo: row.documentNo,
      bizDate: this.toDateOnly(row.bizDate),
      stockScope: row.stockScope,
      stockScopeName: row.stockScopeName,
      workshopId: workshopRef.workshopId,
      workshopName: workshopRef.workshopName,
      salesProjectLabel: this.formatSalesProjectLabel(
        row.salesProjectCodes,
        row.salesProjectNames,
      ),
      rdProjectCode: row.rdProjectCode,
      rdProjectName: row.rdProjectName,
      sourceStockScopeName: row.sourceStockScopeName,
      targetStockScopeName: row.targetStockScopeName,
      sourceWorkshopName: this.normalizeWorkshopName(row.sourceWorkshopName),
      targetWorkshopName: this.normalizeWorkshopName(row.targetWorkshopName),
      quantity: formatDecimal(row.quantity),
      amount: formatMoney(row.amount),
      cost: formatMoney(row.cost),
      abnormalFlags: row.abnormalFlags,
      abnormalLabels: row.abnormalFlags.map(
        (flag) => MONTHLY_REPORTING_ABNORMAL_LABELS[flag],
      ),
      sourceBizMonth: row.sourceBizDate
        ? formatYearMonth(
            row.sourceBizDate,
            this.appConfigService.businessTimezone,
          )
        : null,
      sourceDocumentNo: row.sourceDocumentNo,
      createdAt: row.createdAt.toISOString(),
    };
  }

  private buildDomainItems(rows: MonthlyReportEntry[]): MonthlyReportDomainSummaryItem[] {
    const grouped = new Map<MonthlyReportingDomainKey, MonthlyReportEntry[]>();

    for (const row of rows) {
      const domainKey = getMonthlyReportingTopicMeta(row.topicKey).domainKey;
      const current = grouped.get(domainKey) ?? [];
      current.push(row);
      grouped.set(domainKey, current);
    }

    return [...grouped.entries()]
      .map(([domainKey, domainRows]) => ({
        domainKey,
        domainLabel: getMonthlyReportingDomainMeta(domainKey).label,
        ...this.buildTotals(domainRows),
      }))
      .sort(
        (left, right) =>
          getMonthlyReportingDomainMeta(left.domainKey).order -
          getMonthlyReportingDomainMeta(right.domainKey).order,
      );
  }

  private buildTopicItems(rows: MonthlyReportEntry[]): MonthlyReportTopicSummaryItem[] {
    const grouped = new Map<MonthlyReportingTopicKey, MonthlyReportEntry[]>();

    for (const row of rows) {
      const current = grouped.get(row.topicKey) ?? [];
      current.push(row);
      grouped.set(row.topicKey, current);
    }

    return sortMonthlyReportingEntries(
      [...grouped.entries()].map(([topicKey, topicRows]) => {
        const topicMeta = getMonthlyReportingTopicMeta(topicKey);
        return {
          domainKey: topicMeta.domainKey,
          domainLabel: getMonthlyReportingDomainMeta(topicMeta.domainKey).label,
          topicKey,
          topicLabel: topicMeta.label,
          ...this.buildTotals(topicRows),
        };
      }),
    );
  }

  private buildWorkshopItems(rows: MonthlyReportEntry[]): MonthlyReportWorkshopSummaryItem[] {
    const workshopRows = rows.filter(
      (row) => getMonthlyReportingTopicMeta(row.topicKey).domainKey === "WORKSHOP",
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
      const workshopRef = this.normalizeWorkshopRef(row.workshopId, row.workshopName);
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
        const pickRows = item.rows.filter((row) => row.topicKey === "WORKSHOP_PICK");
        const returnRows = item.rows.filter(
          (row) => row.topicKey === "WORKSHOP_RETURN",
        );
        const scrapRows = item.rows.filter((row) => row.topicKey === "WORKSHOP_SCRAP");
        const pickQuantity = sumDecimals(pickRows.map((row) => row.quantity));
        const returnQuantity = sumDecimals(returnRows.map((row) => row.quantity));
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

  private buildSalesProjectItems(
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

  private buildRdProjectItems(rows: MonthlyReportEntry[]): MonthlyReportRdProjectSummaryItem[] {
    const rdProjectRows = rows.filter(
      (row) => getMonthlyReportingTopicMeta(row.topicKey).domainKey === "RD_PROJECT",
    );
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
        const pickRows = item.rows.filter((row) => row.topicKey === "RD_PROJECT_PICK");
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
        const pickQuantity = sumDecimals(pickRows.map((row) => row.quantity));
        const returnQuantity = sumDecimals(returnRows.map((row) => row.quantity));
        const scrapQuantity = sumDecimals(scrapRows.map((row) => row.quantity));
        const pickAmount = sumDecimals(pickRows.map((row) => row.amount));
        const returnAmount = sumDecimals(returnRows.map((row) => row.amount));
        const scrapAmount = sumDecimals(scrapRows.map((row) => row.amount));

        return {
          rdProjectId: item.rdProjectId,
          rdProjectCode: item.rdProjectCode,
          rdProjectName: item.rdProjectName,
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

  private buildRdHandoffItems(rows: MonthlyReportEntry[]): MonthlyReportRdHandoffSummaryItem[] {
    const rdHandoffRows = rows.filter((row) => row.topicKey === "RD_HANDOFF");
    const grouped = new Map<
      string,
      {
        sourceStockScopeName: string;
        targetStockScopeName: string;
        sourceWorkshopName: string;
        targetWorkshopName: string;
        rows: MonthlyReportEntry[];
      }
    >();

    for (const row of rdHandoffRows) {
      const sourceStockScopeName = row.sourceStockScopeName ?? "未区分来源仓别";
      const targetStockScopeName = row.targetStockScopeName ?? "未区分目标仓别";
      const sourceWorkshopName =
        this.normalizeWorkshopName(row.sourceWorkshopName) ?? "未区分来源车间";
      const targetWorkshopName =
        this.normalizeWorkshopName(row.targetWorkshopName) ?? "未区分目标车间";
      const mapKey = [
        sourceStockScopeName,
        targetStockScopeName,
        sourceWorkshopName,
        targetWorkshopName,
      ].join(":");
      const current = grouped.get(mapKey) ?? {
        sourceStockScopeName,
        targetStockScopeName,
        sourceWorkshopName,
        targetWorkshopName,
        rows: [],
      };
      current.rows.push(row);
      grouped.set(mapKey, current);
    }

    return [...grouped.values()]
      .map((item) => {
        const documentKeys = new Set(
          item.rows.map((row) => `${row.documentType}:${row.documentId}`),
        );
        const abnormalDocumentKeys = new Set(
          item.rows
            .filter((row) => row.abnormalFlags.length > 0)
            .map((row) => `${row.documentType}:${row.documentId}`),
        );

        return {
          sourceStockScopeName: item.sourceStockScopeName,
          targetStockScopeName: item.targetStockScopeName,
          sourceWorkshopName: item.sourceWorkshopName,
          targetWorkshopName: item.targetWorkshopName,
          documentCount: documentKeys.size,
          abnormalDocumentCount: abnormalDocumentKeys.size,
          transferQuantity: formatDecimal(
            sumDecimals(item.rows.map((row) => row.quantity)),
          ),
          transferAmount: formatMoney(
            sumDecimals(item.rows.map((row) => row.amount)),
          ),
          totalCost: formatMoney(sumDecimals(item.rows.map((row) => row.cost))),
        };
      })
      .sort((left, right) =>
        right.transferAmount.localeCompare(left.transferAmount, "en"),
      );
  }

  private buildDomainCatalog(): MonthlyReportDomainCatalogItem[] {
    return Object.entries(MONTHLY_REPORTING_DOMAIN_META)
      .map(([domainKey, meta]) => ({
        domainKey: domainKey as MonthlyReportingDomainKey,
        domainLabel: meta.label,
        sortOrder: meta.order,
      }))
      .sort((left, right) => left.sortOrder - right.sortOrder);
  }

  private buildTopicCatalog(): MonthlyReportTopicCatalogItem[] {
    return Object.entries(MONTHLY_REPORTING_TOPIC_META)
      .map(([topicKey, meta]) => ({
        domainKey: meta.domainKey,
        domainLabel: getMonthlyReportingDomainMeta(meta.domainKey).label,
        topicKey: topicKey as MonthlyReportingTopicKey,
        topicLabel: meta.label,
        sortOrder: meta.order,
      }))
      .sort((left, right) => left.sortOrder - right.sortOrder);
  }

  private buildTotals(rows: MonthlyReportEntry[]): Omit<
    MonthlyReportSummaryTotals,
    "domainCount"
  > {
    const documentKeys = new Set(
      rows.map((row) => `${row.documentType}:${row.documentId}`),
    );
    const abnormalDocumentKeys = new Set(
      rows
        .filter((row) => row.abnormalFlags.length > 0)
        .map((row) => `${row.documentType}:${row.documentId}`),
    );
    const inRows = rows.filter(
      (row) => row.direction === MonthlyReportingDirection.IN,
    );
    const outRows = rows.filter(
      (row) => row.direction === MonthlyReportingDirection.OUT,
    );
    const transferRows = rows.filter(
      (row) => row.direction === MonthlyReportingDirection.TRANSFER,
    );
    const totalInQuantity = sumDecimals(inRows.map((row) => row.quantity));
    const totalOutQuantity = sumDecimals(outRows.map((row) => row.quantity));
    const totalTransferQuantity = sumDecimals(
      transferRows.map((row) => row.quantity),
    );
    const totalInAmount = sumDecimals(inRows.map((row) => row.amount));
    const totalOutAmount = sumDecimals(outRows.map((row) => row.amount));
    const totalTransferAmount = sumDecimals(
      transferRows.map((row) => row.amount),
    );

    return {
      documentCount: documentKeys.size,
      abnormalDocumentCount: abnormalDocumentKeys.size,
      totalInQuantity: formatDecimal(totalInQuantity),
      totalInAmount: formatMoney(totalInAmount),
      totalOutQuantity: formatDecimal(totalOutQuantity),
      totalOutAmount: formatMoney(totalOutAmount),
      totalTransferQuantity: formatDecimal(totalTransferQuantity),
      totalTransferAmount: formatMoney(totalTransferAmount),
      netQuantity: formatDecimal(totalInQuantity.sub(totalOutQuantity)),
      netAmount: formatMoney(totalInAmount.sub(totalOutAmount)),
      totalCost: formatMoney(sumDecimals(rows.map((row) => row.cost))),
    };
  }

  private matchesKeyword(row: MonthlyReportEntry, keyword?: string) {
    const normalizedKeyword = keyword?.trim().toLowerCase();
    if (!normalizedKeyword) {
      return true;
    }

    const topicMeta = getMonthlyReportingTopicMeta(row.topicKey);
    const domainLabel = getMonthlyReportingDomainMeta(topicMeta.domainKey).label;
    const abnormalLabels = row.abnormalFlags.map(
      (flag) => MONTHLY_REPORTING_ABNORMAL_LABELS[flag],
    );

    return [
      row.documentNo,
      row.documentTypeLabel,
      domainLabel,
      topicMeta.label,
      row.stockScopeName,
      this.normalizeWorkshopName(row.workshopName),
      row.sourceStockScopeName,
      row.targetStockScopeName,
      this.normalizeWorkshopName(row.sourceWorkshopName),
      this.normalizeWorkshopName(row.targetWorkshopName),
      row.rdProjectCode,
      row.rdProjectName,
      this.formatSalesProjectLabel(row.salesProjectCodes, row.salesProjectNames),
      row.sourceDocumentNo,
      row.sourceBizDate
        ? formatYearMonth(
            row.sourceBizDate,
            this.appConfigService.businessTimezone,
          )
        : null,
      ...abnormalLabels,
    ]
      .filter(Boolean)
      .some((candidate) =>
        String(candidate).toLowerCase().includes(normalizedKeyword),
      );
  }

  private matchesSalesProjectKeyword(
    entry: MonthlySalesProjectEntry,
    keyword?: string,
  ) {
    const normalizedKeyword = keyword?.trim().toLowerCase();
    if (!normalizedKeyword) {
      return true;
    }

    const abnormalLabels = entry.abnormalFlags.map(
      (flag) => MONTHLY_REPORTING_ABNORMAL_LABELS[flag],
    );

    return [
      entry.documentNo,
      entry.salesProjectCode,
      entry.salesProjectName,
      getMonthlyReportingTopicMeta(entry.topicKey).label,
      ...abnormalLabels,
    ]
      .filter(Boolean)
      .some((candidate) =>
        String(candidate).toLowerCase().includes(normalizedKeyword),
      );
  }

  private resolveRowBusinessName(row: MonthlyReportEntry) {
    if (row.topicKey === "RD_HANDOFF") {
      return [
        row.sourceStockScopeName ?? "",
        row.targetStockScopeName ?? "",
        this.normalizeWorkshopName(row.sourceWorkshopName) ?? "",
        this.normalizeWorkshopName(row.targetWorkshopName) ?? "",
      ].join(" ");
    }

    if (row.rdProjectName) {
      return `${row.rdProjectCode ?? ""} ${row.rdProjectName}`.trim();
    }

    if (row.salesProjectNames.length > 0) {
      return row.salesProjectNames.join("、");
    }

    return this.normalizeWorkshopName(row.workshopName) ?? "";
  }

  private normalizeWorkshopRef(
    workshopId: number | null,
    workshopName: string | null,
  ) {
    const normalizedWorkshopName = this.normalizeWorkshopName(workshopName);

    return {
      workshopId: normalizedWorkshopName ? workshopId : null,
      workshopName: normalizedWorkshopName,
    };
  }

  private normalizeWorkshopName(workshopName: string | null) {
    const normalizedWorkshopName = workshopName?.trim() || null;
    if (!normalizedWorkshopName) {
      return null;
    }

    return RESERVED_STOCK_SCOPE_WORKSHOP_NAMES.has(normalizedWorkshopName)
      ? null
      : normalizedWorkshopName;
  }

  private formatSalesProjectLabel(
    salesProjectCodes: string[],
    salesProjectNames: string[],
  ) {
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

  private resolveMonthRange(yearMonth: string) {
    const [year, month] = yearMonth.split("-").map((item) => Number(item));
    const start = this.createDateInBusinessTimezone(year, month, 1);
    const end = this.createDateInBusinessTimezone(
      year,
      month + 1,
      0,
      23,
      59,
      59,
      999,
    );
    return { start, end };
  }

  private toDateOnly(value: Date) {
    const formatter = new Intl.DateTimeFormat("en-CA", {
      timeZone: this.appConfigService.businessTimezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    return formatter.format(value);
  }

  private createDateInBusinessTimezone(
    year: number,
    month: number,
    day: number,
    hour = 0,
    minute = 0,
    second = 0,
    millisecond = 0,
  ) {
    const utcGuess = Date.UTC(
      year,
      month - 1,
      day,
      hour,
      minute,
      second,
      millisecond,
    );
    const offset = this.getTimeZoneOffsetMilliseconds(new Date(utcGuess));
    return new Date(utcGuess - offset);
  }

  private getTimeZoneOffsetMilliseconds(value: Date) {
    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: this.appConfigService.businessTimezone,
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

  private buildExcelXmlWorkbook(
    sheets: Array<{
      name: string;
      columns: string[];
      rows: Array<Array<string | number>>;
    }>,
  ) {
    const worksheetXml = sheets
      .map(
        (sheet) => `
    <Worksheet ss:Name="${this.escapeXml(sheet.name)}">
      <Table>
        ${this.buildExcelRow(sheet.columns, true)}
        ${sheet.rows.map((row) => this.buildExcelRow(row)).join("")}
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

  private buildExcelRow(values: Array<string | number>, isHeader = false) {
    return `<Row>${values
      .map((value) => {
        const dataType = typeof value === "number" ? "Number" : "String";
        const styleId = isHeader ? ' ss:StyleID="Header"' : "";
        return `<Cell${styleId}><Data ss:Type="${dataType}">${this.escapeXml(
          value,
        )}</Data></Cell>`;
      })
      .join("")}</Row>`;
  }

  private escapeXml(value: string | number) {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&apos;");
  }
}
