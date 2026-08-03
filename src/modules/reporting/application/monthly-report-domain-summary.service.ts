import { Injectable } from "@nestjs/common";
import type { StockScopeCode } from "../../session/domain/user-session";
import {
  MonthlyReportCatalogService,
  type MonthlyReportDocumentTypeCatalogItem,
  type MonthlyReportDomainCatalogItem,
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
  formatMoney,
  getMonthlyReportingBusinessAmountLabel,
  getMonthlyReportingDomainMeta,
  getMonthlyReportingTopicMeta,
  type MonthlyReportEntry,
  MonthlyReportingDirection,
  MonthlyReportingDomainKey,
  MonthlyReportingTopicKey,
  MonthlyReportingViewMode,
  sumDecimals,
} from "./monthly-reporting.shared";

export interface MonthlyReportCostTotals {
  documentCount: number;
  inventoryCostInAmount: string;
  inventoryCostOutAmount: string;
  inventoryCostNetChangeAmount: string;
}

export interface MonthlyReportSummaryTotals extends MonthlyReportCostTotals {
  domainCount: number;
  acceptanceInboundAmount: string;
  productionReceiptAmount: string;
  supplierReturnAmount: string;
  purchaseNetInboundAmount: string;
  salesNetAmount: string;
  salesNetCostAmount: string;
  workshopNetConsumptionCostAmount: string;
  rdProjectNetConsumptionCostAmount: string;
}

export interface MonthlyReportDomainSummaryItem
  extends MonthlyReportCostTotals,
    MonthlyReportSalesFixedColumns {
  domainKey: MonthlyReportingDomainKey;
  domainLabel: string;
}

export interface MonthlyReportSalesFixedColumns {
  salesOutboundSalesAmount: string | null;
  salesOutboundCostAmount: string | null;
  salesReturnSalesAmount: string | null;
  salesReturnCostAmount: string | null;
  netSalesAmount: string | null;
  netCostAmount: string | null;
  salesGrossProfitAmount: string | null;
}

export interface MonthlyReportDocumentTypeSummaryItem
  extends MonthlyReportCostTotals {
  domainKey: MonthlyReportingDomainKey;
  domainLabel: string;
  topicKey: MonthlyReportingTopicKey;
  documentTypeLabel: string;
  businessAmountLabel: string;
  businessAmount: string;
}

export interface MonthlyReportDomainFilters {
  viewMode: MonthlyReportingViewMode.DOMAIN;
  stockScope: StockScopeCode | null;
  workshopId: number | null;
  domainKey: MonthlyReportingDomainKey | null;
  topicKey: MonthlyReportingTopicKey | null;
  documentTypeLabel: string | null;
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
  summary: MonthlyReportCostTotals;
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
        ignoreTopicKey: true,
      },
    );
    const filteredRows = this.sourceService.filterRows(
      rowsBeforeDocumentTypeFilter,
      query,
    );
    const filteredSalesProjectEntries =
      this.sourceService.filterSalesProjectEntries(salesProjectEntries, query);
    const domainItems = this.buildDomainItems(filteredRows, {
      stockScope: query.stockScope,
    });

    return {
      yearMonth: query.yearMonth,
      filters: {
        viewMode: MonthlyReportingViewMode.DOMAIN,
        stockScope: query.stockScope ?? null,
        workshopId: query.workshopId ?? null,
        domainKey: query.domainKey ?? null,
        topicKey: query.topicKey ?? null,
        documentTypeLabel: query.documentTypeLabel?.trim() || null,
        keyword: query.keyword?.trim() || null,
      },
      viewMode: MonthlyReportingViewMode.DOMAIN,
      domainCatalog: this.catalogService.buildDomainCatalog(),
      documentTypeCatalog: this.catalogService.buildDocumentTypeCatalog(
        rowsBeforeDocumentTypeFilter,
      ),
      domains: domainItems,
      documentTypes: this.buildDocumentTypeItems(filteredRows, {
        includeMissingSalesTopics: !query.topicKey,
        missingSalesTopicKeys: this.resolveSelectedSalesTopicKeys(
          query.topicKey,
        ),
        salesReferenceRows: rowsBeforeDocumentTypeFilter,
        stockScope: query.stockScope,
      }),
      workshopItems: this.aggregatorService.buildWorkshopItems(filteredRows),
      salesProjectItems: this.aggregatorService.buildSalesProjectItems(
        filteredSalesProjectEntries,
      ),
      rdProjectItems: this.aggregatorService.buildRdProjectItems(filteredRows),
      summary: this.buildSummaryTotals(filteredRows, domainItems.length, {
        stockScope: query.stockScope,
      }),
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
      summary: this.buildTotals(filteredRows, {
        stockScope: query.stockScope,
      }),
    };
  }

  buildTotals(
    rows: MonthlyReportEntry[],
    options: {
      stockScope?: StockScopeCode;
    } = {},
  ): MonthlyReportCostTotals {
    const documentKeys = new Set(
      rows.map((row) => `${row.documentType}:${row.documentId}`),
    );
    const transferExcludedRows = this.excludeAllStockInternalTransfers(
      rows,
      options.stockScope,
    );
    const inRows = transferExcludedRows.filter(
      (row) => row.direction === MonthlyReportingDirection.IN,
    );
    const outRows = transferExcludedRows.filter(
      (row) => row.direction === MonthlyReportingDirection.OUT,
    );
    const inventoryCostInAmount = sumDecimals(inRows.map((row) => row.cost));
    const inventoryCostOutAmount = sumDecimals(outRows.map((row) => row.cost));

    return {
      documentCount: documentKeys.size,
      inventoryCostInAmount: formatMoney(inventoryCostInAmount),
      inventoryCostOutAmount: formatMoney(inventoryCostOutAmount),
      inventoryCostNetChangeAmount: formatMoney(
        inventoryCostInAmount.sub(inventoryCostOutAmount),
      ),
    };
  }

  buildSummaryTotals(
    rows: MonthlyReportEntry[],
    domainCount: number,
    options: {
      stockScope?: StockScopeCode;
    } = {},
  ): MonthlyReportSummaryTotals {
    const sumAmountByTopic = (
      topicKey: MonthlyReportingTopicKey,
      field: "amount" | "cost",
    ) =>
      sumDecimals(
        rows
          .filter((row) => row.topicKey === topicKey)
          .map((row) => row[field]),
      );
    const acceptanceInboundAmount = sumAmountByTopic(
      MonthlyReportingTopicKey.ACCEPTANCE_INBOUND,
      "amount",
    );
    const productionReceiptAmount = sumAmountByTopic(
      MonthlyReportingTopicKey.PRODUCTION_RECEIPT,
      "amount",
    );
    const supplierReturnAmount = sumAmountByTopic(
      MonthlyReportingTopicKey.SUPPLIER_RETURN,
      "amount",
    );
    const salesOutboundAmount = sumAmountByTopic(
      MonthlyReportingTopicKey.SALES_OUTBOUND,
      "amount",
    );
    const salesReturnAmount = sumAmountByTopic(
      MonthlyReportingTopicKey.SALES_RETURN,
      "amount",
    );
    const salesOutboundCostAmount = sumAmountByTopic(
      MonthlyReportingTopicKey.SALES_OUTBOUND,
      "cost",
    );
    const salesReturnCostAmount = sumAmountByTopic(
      MonthlyReportingTopicKey.SALES_RETURN,
      "cost",
    );
    const workshopPickCostAmount = sumAmountByTopic(
      MonthlyReportingTopicKey.WORKSHOP_PICK,
      "cost",
    );
    const workshopReturnCostAmount = sumAmountByTopic(
      MonthlyReportingTopicKey.WORKSHOP_RETURN,
      "cost",
    );
    const workshopScrapCostAmount = sumAmountByTopic(
      MonthlyReportingTopicKey.WORKSHOP_SCRAP,
      "cost",
    );
    const rdProjectPickCostAmount = sumAmountByTopic(
      MonthlyReportingTopicKey.RD_PROJECT_PICK,
      "cost",
    );
    const rdProjectReturnCostAmount = sumAmountByTopic(
      MonthlyReportingTopicKey.RD_PROJECT_RETURN,
      "cost",
    );
    const rdProjectScrapCostAmount = sumAmountByTopic(
      MonthlyReportingTopicKey.RD_PROJECT_SCRAP,
      "cost",
    );

    return {
      domainCount,
      ...this.buildTotals(rows, options),
      acceptanceInboundAmount: formatMoney(acceptanceInboundAmount),
      productionReceiptAmount: formatMoney(productionReceiptAmount),
      supplierReturnAmount: formatMoney(supplierReturnAmount),
      purchaseNetInboundAmount: formatMoney(
        acceptanceInboundAmount.sub(supplierReturnAmount),
      ),
      salesNetAmount: formatMoney(salesOutboundAmount.sub(salesReturnAmount)),
      salesNetCostAmount: formatMoney(
        salesOutboundCostAmount.sub(salesReturnCostAmount),
      ),
      workshopNetConsumptionCostAmount: formatMoney(
        workshopPickCostAmount
          .sub(workshopReturnCostAmount)
          .add(workshopScrapCostAmount),
      ),
      rdProjectNetConsumptionCostAmount: formatMoney(
        rdProjectPickCostAmount
          .sub(rdProjectReturnCostAmount)
          .add(rdProjectScrapCostAmount),
      ),
    };
  }

  buildDomainItems(
    rows: MonthlyReportEntry[],
    options: {
      stockScope?: StockScopeCode;
    } = {},
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
        ...this.buildTotals(domainRows, options),
        ...this.buildSalesFixedColumns(domainKey, domainRows),
      }))
      .sort(
        (left, right) =>
          getMonthlyReportingDomainMeta(left.domainKey).order -
          getMonthlyReportingDomainMeta(right.domainKey).order,
      );
  }

  private buildSalesFixedColumns(
    domainKey: MonthlyReportingDomainKey,
    rows: MonthlyReportEntry[],
  ): MonthlyReportSalesFixedColumns {
    if (domainKey !== MonthlyReportingDomainKey.SALES) {
      return {
        salesOutboundSalesAmount: null,
        salesOutboundCostAmount: null,
        salesReturnSalesAmount: null,
        salesReturnCostAmount: null,
        netSalesAmount: null,
        netCostAmount: null,
        salesGrossProfitAmount: null,
      };
    }

    const outboundRows = rows.filter(
      (row) => row.topicKey === MonthlyReportingTopicKey.SALES_OUTBOUND,
    );
    const returnRows = rows.filter(
      (row) => row.topicKey === MonthlyReportingTopicKey.SALES_RETURN,
    );
    const outboundSalesAmount = sumDecimals(
      outboundRows.map((row) => row.amount),
    );
    const returnSalesAmount = sumDecimals(returnRows.map((row) => row.amount));
    const outboundCostAmount = sumDecimals(outboundRows.map((row) => row.cost));
    const returnCostAmount = sumDecimals(returnRows.map((row) => row.cost));

    const netSalesAmount = outboundSalesAmount.sub(returnSalesAmount);
    const netCostAmount = outboundCostAmount.sub(returnCostAmount);

    return {
      salesOutboundSalesAmount: formatMoney(outboundSalesAmount),
      salesOutboundCostAmount: formatMoney(outboundCostAmount),
      salesReturnSalesAmount: formatMoney(returnSalesAmount),
      salesReturnCostAmount: formatMoney(returnCostAmount),
      netSalesAmount: formatMoney(netSalesAmount),
      netCostAmount: formatMoney(netCostAmount),
      salesGrossProfitAmount: formatMoney(netSalesAmount.sub(netCostAmount)),
    };
  }

  buildDocumentTypeItems(
    rows: MonthlyReportEntry[],
    options: {
      includeMissingSalesTopics?: boolean;
      missingSalesTopicKeys?: ReadonlyArray<
        | MonthlyReportingTopicKey.SALES_OUTBOUND
        | MonthlyReportingTopicKey.SALES_RETURN
      >;
      salesReferenceRows?: MonthlyReportEntry[];
      stockScope?: StockScopeCode;
    } = {},
  ): MonthlyReportDocumentTypeSummaryItem[] {
    const grouped = new Map<
      MonthlyReportingTopicKey,
      {
        domainKey: MonthlyReportingDomainKey;
        topicKey: MonthlyReportingTopicKey;
        documentTypeLabel: string;
        sortOrder: number;
        rows: MonthlyReportEntry[];
      }
    >();

    for (const row of rows) {
      const topicMeta = getMonthlyReportingTopicMeta(row.topicKey);
      const mapKey = row.topicKey;
      const current = grouped.get(mapKey) ?? {
        domainKey: topicMeta.domainKey,
        topicKey: row.topicKey,
        documentTypeLabel: row.documentTypeLabel,
        sortOrder: topicMeta.order,
        rows: [],
      };
      current.sortOrder = Math.min(current.sortOrder, topicMeta.order);
      current.rows.push(row);
      grouped.set(mapKey, current);
    }

    const missingSalesTopicKeys =
      options.missingSalesTopicKeys ??
      ((options.includeMissingSalesTopics ?? true)
        ? [
            MonthlyReportingTopicKey.SALES_OUTBOUND,
            MonthlyReportingTopicKey.SALES_RETURN,
          ]
        : []);

    if (missingSalesTopicKeys.length > 0) {
      this.addMissingSalesDocumentTypeItems(grouped, {
        referenceRows: options.salesReferenceRows ?? rows,
        topicKeys: missingSalesTopicKeys,
      });
    }

    return [...grouped.values()]
      .map((item) => ({
        domainKey: item.domainKey,
        domainLabel: getMonthlyReportingDomainMeta(item.domainKey).label,
        topicKey: item.topicKey,
        documentTypeLabel: item.documentTypeLabel,
        businessAmountLabel: getMonthlyReportingBusinessAmountLabel(
          item.topicKey,
        ),
        businessAmount: formatMoney(
          sumDecimals(item.rows.map((row) => row.amount)),
        ),
        sortOrder: item.sortOrder,
        ...this.buildTotals(item.rows, {
          stockScope: options.stockScope,
        }),
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

  private addMissingSalesDocumentTypeItems(
    grouped: Map<
      MonthlyReportingTopicKey,
      {
        domainKey: MonthlyReportingDomainKey;
        topicKey: MonthlyReportingTopicKey;
        documentTypeLabel: string;
        sortOrder: number;
        rows: MonthlyReportEntry[];
      }
    >,
    options: {
      referenceRows: MonthlyReportEntry[];
      topicKeys: ReadonlyArray<
        | MonthlyReportingTopicKey.SALES_OUTBOUND
        | MonthlyReportingTopicKey.SALES_RETURN
      >;
    },
  ): void {
    const salesTopicKeys = [
      MonthlyReportingTopicKey.SALES_OUTBOUND,
      MonthlyReportingTopicKey.SALES_RETURN,
    ] as const;
    const hasGroupedSalesFact = salesTopicKeys.some((topicKey) =>
      grouped.has(topicKey),
    );
    const hasReferenceSalesFact = options.referenceRows.some(
      (row) =>
        row.topicKey === MonthlyReportingTopicKey.SALES_OUTBOUND ||
        row.topicKey === MonthlyReportingTopicKey.SALES_RETURN,
    );
    if (!hasGroupedSalesFact && !hasReferenceSalesFact) {
      return;
    }

    const documentTypeLabels: Record<(typeof salesTopicKeys)[number], string> =
      {
        [MonthlyReportingTopicKey.SALES_OUTBOUND]: "销售出库单",
        [MonthlyReportingTopicKey.SALES_RETURN]: "销售退货单",
      };

    for (const topicKey of options.topicKeys) {
      if (grouped.has(topicKey)) {
        continue;
      }

      const topicMeta = getMonthlyReportingTopicMeta(topicKey);
      grouped.set(topicKey, {
        domainKey: topicMeta.domainKey,
        topicKey,
        documentTypeLabel: documentTypeLabels[topicKey],
        sortOrder: topicMeta.order,
        rows: [],
      });
    }
  }

  private resolveSelectedSalesTopicKeys(
    topicKey: MonthlyReportingTopicKey | undefined,
  ):
    | ReadonlyArray<
        | MonthlyReportingTopicKey.SALES_OUTBOUND
        | MonthlyReportingTopicKey.SALES_RETURN
      >
    | undefined {
    if (
      topicKey === MonthlyReportingTopicKey.SALES_OUTBOUND ||
      topicKey === MonthlyReportingTopicKey.SALES_RETURN
    ) {
      return [topicKey];
    }

    return undefined;
  }

  private excludeAllStockInternalTransfers(
    rows: MonthlyReportEntry[],
    stockScope: StockScopeCode | undefined,
  ): MonthlyReportEntry[] {
    if (stockScope) {
      return rows;
    }

    return rows.filter(
      (row) => row.topicKey !== MonthlyReportingTopicKey.RD_HANDOFF,
    );
  }
}
