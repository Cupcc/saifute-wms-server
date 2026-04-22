import { Injectable } from "@nestjs/common";
import type { StockScopeCode } from "../../session/domain/user-session";
import {
  type MonthlyReportDocumentTypeCatalogItem,
  type MonthlyReportDomainCatalogItem,
  MonthlyReportCatalogService,
} from "./monthly-report-catalog.service";
import {
  MonthlyReportDomainAggregatorService,
  type MonthlyReportRdProjectSummaryItem,
  type MonthlyReportSalesProjectSummaryItem,
  type MonthlyReportWorkshopSummaryItem,
} from "./monthly-report-domain-aggregator.service";
import {
  type MonthlyReportDocumentItem,
  MonthlyReportItemMapperService,
} from "./monthly-report-item-mapper.service";
import {
  type MonthlyReportQuery,
  MonthlyReportSourceService,
} from "./monthly-report-source.service";
import {
  formatDecimal,
  formatMoney,
  getMonthlyReportingDomainMeta,
  getMonthlyReportingTopicMeta,
  type MonthlyReportEntry,
  MonthlyReportingDirection,
  type MonthlyReportingDomainKey,
  MonthlyReportingViewMode,
  sumDecimals,
} from "./monthly-reporting.shared";

export interface MonthlyReportSummaryTotals {
  domainCount: number;
  documentCount: number;
  abnormalDocumentCount: number;
  totalInQuantity: string;
  totalInAmount: string;
  totalOutQuantity: string;
  totalOutAmount: string;
  netQuantity: string;
  netAmount: string;
  totalCost: string;
}

export interface MonthlyReportDomainSummaryItem
  extends Omit<MonthlyReportSummaryTotals, "domainCount"> {
  domainKey: MonthlyReportingDomainKey;
  domainLabel: string;
}

export interface MonthlyReportDocumentTypeSummaryItem
  extends Omit<MonthlyReportSummaryTotals, "domainCount"> {
  domainKey: MonthlyReportingDomainKey;
  domainLabel: string;
  documentTypeLabel: string;
}

export interface MonthlyReportDomainFilters {
  viewMode: MonthlyReportingViewMode.DOMAIN;
  stockScope: StockScopeCode | null;
  workshopId: number | null;
  domainKey: MonthlyReportingDomainKey | null;
  documentTypeLabel: string | null;
  abnormalOnly: boolean;
  keyword: string | null;
}

export interface MonthlyReportDomainSummaryResult {
  yearMonth: string;
  filters: MonthlyReportDomainFilters;
  viewMode: MonthlyReportingViewMode.DOMAIN;
  domainCatalog: MonthlyReportDomainCatalogItem[];
  documentTypeCatalog: MonthlyReportDocumentTypeCatalogItem[];
  domains: MonthlyReportDomainSummaryItem[];
  documentTypes: MonthlyReportDocumentTypeSummaryItem[];
  workshopItems: MonthlyReportWorkshopSummaryItem[];
  salesProjectItems: MonthlyReportSalesProjectSummaryItem[];
  rdProjectItems: MonthlyReportRdProjectSummaryItem[];
  summary: MonthlyReportSummaryTotals;
}

export interface MonthlyReportDomainDocumentsResult {
  yearMonth: string;
  viewMode: MonthlyReportingViewMode.DOMAIN;
  total: number;
  items: MonthlyReportDocumentItem[];
  summary: Omit<MonthlyReportSummaryTotals, "domainCount">;
}

@Injectable()
export class MonthlyReportDomainSummaryService {
  constructor(
    private readonly sourceService: MonthlyReportSourceService,
    private readonly catalogService: MonthlyReportCatalogService,
    private readonly itemMapperService: MonthlyReportItemMapperService,
    private readonly aggregatorService: MonthlyReportDomainAggregatorService,
  ) {}

  async getDomainSummary(
    query: MonthlyReportQuery,
  ): Promise<MonthlyReportDomainSummaryResult> {
    const { rows, salesProjectEntries } =
      await this.sourceService.loadSourceData(query);
    const rowsBeforeDocumentTypeFilter = this.sourceService.filterRows(
      rows,
      query,
      {
        ignoreDocumentTypeLabel: true,
      },
    );
    const filteredRows = this.sourceService.filterRows(
      rowsBeforeDocumentTypeFilter,
      query,
    );
    const filteredSalesProjectEntries =
      this.sourceService.filterSalesProjectEntries(salesProjectEntries, query);
    const domainItems = this.buildDomainItems(filteredRows);

    return {
      yearMonth: query.yearMonth,
      filters: {
        viewMode: MonthlyReportingViewMode.DOMAIN,
        stockScope: query.stockScope ?? null,
        workshopId: query.workshopId ?? null,
        domainKey: query.domainKey ?? null,
        documentTypeLabel: query.documentTypeLabel?.trim() || null,
        abnormalOnly: query.abnormalOnly ?? false,
        keyword: query.keyword?.trim() || null,
      },
      viewMode: MonthlyReportingViewMode.DOMAIN,
      domainCatalog: this.catalogService.buildDomainCatalog(),
      documentTypeCatalog: this.catalogService.buildDocumentTypeCatalog(
        rowsBeforeDocumentTypeFilter,
      ),
      domains: domainItems,
      documentTypes: this.buildDocumentTypeItems(filteredRows),
      workshopItems: this.aggregatorService.buildWorkshopItems(filteredRows),
      salesProjectItems: this.aggregatorService.buildSalesProjectItems(
        filteredSalesProjectEntries,
      ),
      rdProjectItems: this.aggregatorService.buildRdProjectItems(filteredRows),
      summary: {
        domainCount: domainItems.length,
        ...this.buildTotals(filteredRows),
      },
    };
  }

  async getDomainDocuments(
    query: MonthlyReportQuery,
  ): Promise<MonthlyReportDomainDocumentsResult> {
    const { rows } = await this.sourceService.loadSourceData(query);
    const filteredRows = this.sourceService.filterRows(rows, query);
    const offset = query.offset ?? 0;
    const limit = Math.min(query.limit ?? 50, 200);

    return {
      yearMonth: query.yearMonth,
      viewMode: MonthlyReportingViewMode.DOMAIN,
      total: filteredRows.length,
      items: filteredRows
        .slice(offset, offset + limit)
        .map((row) => this.itemMapperService.toDocumentItem(row)),
      summary: this.buildTotals(filteredRows),
    };
  }

  buildTotals(
    rows: MonthlyReportEntry[],
  ): Omit<MonthlyReportSummaryTotals, "domainCount"> {
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
    const totalInQuantity = sumDecimals(inRows.map((row) => row.quantity));
    const totalOutQuantity = sumDecimals(outRows.map((row) => row.quantity));
    const totalInAmount = sumDecimals(inRows.map((row) => row.amount));
    const totalOutAmount = sumDecimals(outRows.map((row) => row.amount));

    return {
      documentCount: documentKeys.size,
      abnormalDocumentCount: abnormalDocumentKeys.size,
      totalInQuantity: formatDecimal(totalInQuantity),
      totalInAmount: formatMoney(totalInAmount),
      totalOutQuantity: formatDecimal(totalOutQuantity),
      totalOutAmount: formatMoney(totalOutAmount),
      netQuantity: formatDecimal(totalInQuantity.sub(totalOutQuantity)),
      netAmount: formatMoney(totalInAmount.sub(totalOutAmount)),
      totalCost: formatMoney(sumDecimals(rows.map((row) => row.cost))),
    };
  }

  buildDomainItems(
    rows: MonthlyReportEntry[],
  ): MonthlyReportDomainSummaryItem[] {
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

  buildDocumentTypeItems(
    rows: MonthlyReportEntry[],
  ): MonthlyReportDocumentTypeSummaryItem[] {
    const grouped = new Map<
      string,
      {
        domainKey: MonthlyReportingDomainKey;
        documentTypeLabel: string;
        sortOrder: number;
        rows: MonthlyReportEntry[];
      }
    >();

    for (const row of rows) {
      const topicMeta = getMonthlyReportingTopicMeta(row.topicKey);
      const mapKey = `${topicMeta.domainKey}:${row.documentTypeLabel}`;
      const current = grouped.get(mapKey) ?? {
        domainKey: topicMeta.domainKey,
        documentTypeLabel: row.documentTypeLabel,
        sortOrder: topicMeta.order,
        rows: [],
      };
      current.sortOrder = Math.min(current.sortOrder, topicMeta.order);
      current.rows.push(row);
      grouped.set(mapKey, current);
    }

    return [...grouped.values()]
      .map((item) => ({
        domainKey: item.domainKey,
        domainLabel: getMonthlyReportingDomainMeta(item.domainKey).label,
        documentTypeLabel: item.documentTypeLabel,
        sortOrder: item.sortOrder,
        ...this.buildTotals(item.rows),
      }))
      .sort((left, right) => {
        const leftDomainOrder = getMonthlyReportingDomainMeta(
          left.domainKey,
        ).order;
        const rightDomainOrder = getMonthlyReportingDomainMeta(
          right.domainKey,
        ).order;
        if (leftDomainOrder !== rightDomainOrder) {
          return leftDomainOrder - rightDomainOrder;
        }

        if (left.sortOrder !== right.sortOrder) {
          return left.sortOrder - right.sortOrder;
        }

        return left.documentTypeLabel.localeCompare(
          right.documentTypeLabel,
          "zh-Hans-CN",
        );
      })
      .map(({ sortOrder: _sortOrder, ...item }) => item);
  }
}
