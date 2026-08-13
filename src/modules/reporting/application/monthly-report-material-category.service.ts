import { Injectable } from "@nestjs/common";
import type { StockScopeCode } from "../../session/domain/user-session";
import {
  MonthlyReportCatalogService,
  type MonthlyReportDocumentTypeCatalogItem,
} from "./monthly-report-catalog.service";
import {
  MonthlyReportItemMapperService,
  type MonthlyReportMaterialCategoryDetailItem,
} from "./monthly-report-item-mapper.service";
import {
  buildBalanceMaterialKey,
  buildMonthlyMaterialCategoryBalanceTotals,
  buildMonthlyMaterialCategoryBalanceTotalsByKey,
  collectMonthlyMaterialCategoryGroups,
  collectMonthlyMaterialGroups,
  compareMaterialCategoryItems,
  compareMaterialItems,
  createEmptyMonthlyMaterialCategoryBalanceTotals,
  filterMonthlyMaterialCategoryBalanceSnapshots,
  filterMonthlyMaterialCategoryBalanceSnapshotsByEntries,
  type MonthlyMaterialCategoryBalanceTotals,
  resolveBalanceCategoryNodeKey,
} from "./monthly-report-material-category-balance.helper";
import {
  buildMonthlyMaterialCategoryWorkshopUsageItems,
  type MonthlyReportMaterialCategoryWorkshopSummaryItem,
} from "./monthly-report-material-category-workshop.helper";
import {
  type MonthlyReportQuery,
  MonthlyReportSourceService,
} from "./monthly-report-source.service";
import {
  formatMoney,
  formatQuantity,
  type MonthlyMaterialCategoryBalanceSnapshot,
  type MonthlyMaterialCategoryEntry,
  MonthlyReportingDirection,
  MonthlyReportingViewMode,
  sumDecimals,
} from "./monthly-reporting.shared";

export interface MonthlyReportMaterialCategoryAmountTotals {
  lineCount: number;
  documentCount: number;
  acceptanceInboundAmount: string;
  productionReceiptAmount: string;
  supplierReturnAmount: string;
  purchaseNetInboundAmount: string;
  workshopPickCostAmount: string;
  workshopReturnCostAmount: string;
  workshopScrapCostAmount: string;
  workshopNetConsumptionCostAmount: string;
  salesOutboundSalesAmount: string;
  salesOutboundCostAmount: string;
  salesReturnSalesAmount: string;
  salesReturnCostAmount: string;
  netSalesAmount: string;
  netSalesCostAmount: string;
  estimatedGrossProfitAmount: string;
  openingCostAmount: string;
  inboundAmount: string;
  outboundAmount: string;
  inventoryCostNetChangeAmount: string;
  closingCostAmount: string;
}

export interface MonthlyReportMaterialCategorySummaryTotals
  extends MonthlyReportMaterialCategoryAmountTotals {
  categoryCount: number;
}

export interface MonthlyReportMaterialCategorySummaryItem
  extends MonthlyReportMaterialCategoryAmountTotals {
  nodeKey: string;
  categoryId: number | null;
  categoryCode: string | null;
  categoryName: string;
}

export type MonthlyReportMaterialCategoryCatalogItem = Pick<
  MonthlyReportMaterialCategorySummaryItem,
  "nodeKey" | "categoryId" | "categoryCode" | "categoryName"
>;

export interface MonthlyReportMaterialSummaryItem
  extends MonthlyReportMaterialCategoryAmountTotals {
  materialKey: string;
  categoryNodeKey: string;
  categoryId: number | null;
  categoryCode: string | null;
  categoryName: string;
  materialId: number;
  materialCode: string;
  materialName: string;
  materialSpec: string | null;
  unitCode: string;
  inQuantity: string;
  outQuantity: string;
  inventoryNetChangeQuantity: string;
  openingQuantity: string;
  closingQuantity: string;
  acceptanceInboundQuantity: string;
  productionReceiptQuantity: string;
  supplierReturnQuantity: string;
  workshopPickQuantity: string;
  workshopReturnQuantity: string;
  workshopScrapQuantity: string;
  workshopNetConsumptionQuantity: string;
  salesOutboundQuantity: string;
  salesReturnQuantity: string;
  netSalesQuantity: string;
}

export type MonthlyReportMaterialCatalogItem = Pick<
  MonthlyReportMaterialSummaryItem,
  "materialId" | "materialCode" | "materialName" | "materialSpec" | "unitCode"
>;

export interface MonthlyReportMaterialCategoryFilters {
  viewMode: MonthlyReportingViewMode.MATERIAL_CATEGORY;
  stockScope: StockScopeCode | null;
  workshopId: number | null;
  documentTypeLabel: string | null;
  materialId: number | null;
  categoryId: number | null;
  categoryNodeKey: string | null;
  keyword: string | null;
}

export interface MonthlyReportMaterialCategorySummaryResult {
  yearMonth: string;
  filters: MonthlyReportMaterialCategoryFilters;
  viewMode: MonthlyReportingViewMode.MATERIAL_CATEGORY;
  documentTypeCatalog: MonthlyReportDocumentTypeCatalogItem[];
  categoryCatalog: MonthlyReportMaterialCategoryCatalogItem[];
  materialCatalog: MonthlyReportMaterialCatalogItem[];
  categories: MonthlyReportMaterialCategorySummaryItem[];
  materials: MonthlyReportMaterialSummaryItem[];
  workshops: MonthlyReportMaterialCategoryWorkshopSummaryItem[];
  summary: MonthlyReportMaterialCategorySummaryTotals;
}

export interface MonthlyReportMaterialCategoryDocumentsResult {
  yearMonth: string;
  viewMode: MonthlyReportingViewMode.MATERIAL_CATEGORY;
  total: number;
  items: MonthlyReportMaterialCategoryDetailItem[];
  summary: MonthlyReportMaterialCategoryAmountTotals;
}

@Injectable()
export class MonthlyReportMaterialCategoryService {
  constructor(
    private readonly sourceService: MonthlyReportSourceService,
    private readonly catalogService: MonthlyReportCatalogService,
    private readonly itemMapperService: MonthlyReportItemMapperService,
  ) {}

  async getMaterialCategorySummary(
    query: MonthlyReportQuery,
  ): Promise<MonthlyReportMaterialCategorySummaryResult> {
    const [entries, balanceSnapshots] = await Promise.all([
      this.sourceService.loadMaterialCategorySourceData(query),
      this.sourceService.loadMaterialCategoryBalanceSnapshots(query),
    ]);
    const filteredEntries = this.sourceService.filterMaterialCategoryEntries(
      entries,
      query,
    );
    const filteredBalanceSnapshots =
      filterMonthlyMaterialCategoryBalanceSnapshots(balanceSnapshots, query);
    const categoryItems = this.buildMaterialCategoryItems(
      filteredEntries,
      filteredBalanceSnapshots,
    );
    const materialItems = this.buildMaterialItems(
      filteredEntries,
      filteredBalanceSnapshots,
    );
    const workshopItems =
      buildMonthlyMaterialCategoryWorkshopUsageItems(filteredEntries);

    return {
      yearMonth: query.yearMonth,
      viewMode: MonthlyReportingViewMode.MATERIAL_CATEGORY,
      filters: {
        viewMode: MonthlyReportingViewMode.MATERIAL_CATEGORY,
        stockScope: query.stockScope ?? null,
        workshopId: query.workshopId ?? null,
        documentTypeLabel: query.documentTypeLabel?.trim() || null,
        materialId: query.materialId ?? null,
        categoryId: query.categoryId ?? null,
        categoryNodeKey: query.categoryNodeKey?.trim() || null,
        keyword: query.keyword?.trim() || null,
      },
      documentTypeCatalog:
        this.catalogService.buildMaterialCategoryDocumentTypeCatalog(entries),
      categoryCatalog: this.buildMaterialCategoryCatalog(entries),
      materialCatalog: this.buildMaterialCatalog(entries),
      categories: categoryItems,
      materials: materialItems,
      workshops: workshopItems,
      summary: {
        categoryCount: categoryItems.length,
        ...this.buildMaterialCategoryTotals(
          filteredEntries,
          filteredBalanceSnapshots,
        ),
      },
    };
  }

  async getMaterialCategoryDocuments(
    query: MonthlyReportQuery,
  ): Promise<MonthlyReportMaterialCategoryDocumentsResult> {
    const [entries, balanceSnapshots] = await Promise.all([
      this.sourceService.loadMaterialCategorySourceData(query),
      this.sourceService.loadMaterialCategoryBalanceSnapshots(query),
    ]);
    const filteredEntries = this.sourceService.filterMaterialCategoryEntries(
      entries,
      query,
    );
    const filteredBalanceSnapshots =
      filterMonthlyMaterialCategoryBalanceSnapshots(balanceSnapshots, query);
    const offset = query.offset ?? 0;
    const limit = Math.min(query.limit ?? 50, 200);

    return {
      yearMonth: query.yearMonth,
      viewMode: MonthlyReportingViewMode.MATERIAL_CATEGORY,
      total: filteredEntries.length,
      items: filteredEntries
        .slice(offset, offset + limit)
        .map((entry) =>
          this.itemMapperService.toMaterialCategoryDetailItem(entry),
        ),
      summary: this.buildMaterialCategoryTotals(
        filteredEntries,
        filteredBalanceSnapshots,
      ),
    };
  }

  buildMaterialCategoryCatalog(
    entries: MonthlyMaterialCategoryEntry[],
  ): MonthlyReportMaterialCategoryCatalogItem[] {
    return collectMonthlyMaterialCategoryGroups(entries)
      .map(({ entries: _entries, ...category }) => category)
      .sort(compareMaterialCategoryItems);
  }

  buildMaterialItems(
    entries: MonthlyMaterialCategoryEntry[],
    balanceSnapshots: MonthlyMaterialCategoryBalanceSnapshot[] = [],
  ): MonthlyReportMaterialSummaryItem[] {
    const eligibleBalanceSnapshots =
      filterMonthlyMaterialCategoryBalanceSnapshotsByEntries(
        balanceSnapshots,
        entries,
      );
    const balanceTotalsByMaterial =
      buildMonthlyMaterialCategoryBalanceTotalsByKey(
        eligibleBalanceSnapshots,
        buildBalanceMaterialKey,
      );

    return collectMonthlyMaterialGroups(entries)
      .map((item) => {
        const balanceTotals =
          balanceTotalsByMaterial.get(item.materialKey) ??
          createEmptyMonthlyMaterialCategoryBalanceTotals();

        return {
          materialKey: item.materialKey,
          categoryNodeKey: item.categoryNodeKey,
          categoryId: item.categoryId,
          categoryCode: item.categoryCode,
          categoryName: item.categoryName,
          materialId: item.materialId,
          materialCode: item.materialCode,
          materialName: item.materialName,
          materialSpec: item.materialSpec,
          unitCode: item.unitCode,
          ...this.buildMaterialCategoryAmountTotals(
            item.entries,
            balanceTotals,
          ),
          ...this.buildMaterialQuantityTotals(item.entries, balanceTotals),
        };
      })
      .sort(compareMaterialItems);
  }

  private buildMaterialCatalog(
    entries: MonthlyMaterialCategoryEntry[],
  ): MonthlyReportMaterialCatalogItem[] {
    const catalogByMaterialId = new Map<
      number,
      MonthlyReportMaterialCatalogItem
    >();
    const materialGroups =
      collectMonthlyMaterialGroups(entries).sort(compareMaterialItems);

    for (const item of materialGroups) {
      if (catalogByMaterialId.has(item.materialId)) {
        continue;
      }

      catalogByMaterialId.set(item.materialId, {
        materialId: item.materialId,
        materialCode: item.materialCode,
        materialName: item.materialName,
        materialSpec: item.materialSpec,
        unitCode: item.unitCode,
      });
    }

    return [...catalogByMaterialId.values()];
  }

  buildMaterialCategoryItems(
    entries: MonthlyMaterialCategoryEntry[],
    balanceSnapshots: MonthlyMaterialCategoryBalanceSnapshot[] = [],
  ): MonthlyReportMaterialCategorySummaryItem[] {
    const eligibleBalanceSnapshots =
      filterMonthlyMaterialCategoryBalanceSnapshotsByEntries(
        balanceSnapshots,
        entries,
      );
    const balanceTotalsByCategory =
      buildMonthlyMaterialCategoryBalanceTotalsByKey(
        eligibleBalanceSnapshots,
        resolveBalanceCategoryNodeKey,
      );

    return collectMonthlyMaterialCategoryGroups(entries)
      .map((item) => {
        return {
          nodeKey: item.nodeKey,
          categoryId: item.categoryId,
          categoryCode: item.categoryCode,
          categoryName: item.categoryName,
          ...this.buildMaterialCategoryAmountTotals(
            item.entries,
            balanceTotalsByCategory.get(item.nodeKey) ??
              createEmptyMonthlyMaterialCategoryBalanceTotals(),
          ),
        };
      })
      .sort(compareMaterialCategoryItems);
  }

  buildMaterialCategoryTotals(
    entries: MonthlyMaterialCategoryEntry[],
    balanceSnapshots: MonthlyMaterialCategoryBalanceSnapshot[] = [],
  ): MonthlyReportMaterialCategoryAmountTotals {
    return this.buildMaterialCategoryAmountTotals(
      entries,
      buildMonthlyMaterialCategoryBalanceTotals(
        filterMonthlyMaterialCategoryBalanceSnapshotsByEntries(
          balanceSnapshots,
          entries,
        ),
      ),
    );
  }

  private buildMaterialCategoryAmountTotals(
    entries: MonthlyMaterialCategoryEntry[],
    balanceTotals: MonthlyMaterialCategoryBalanceTotals,
  ): MonthlyReportMaterialCategoryAmountTotals {
    const documentKeys = new Set(
      entries.map((entry) => `${entry.documentType}:${entry.documentId}`),
    );
    const acceptanceInboundEntries = entries.filter(
      (entry) => entry.topicKey === "ACCEPTANCE_INBOUND",
    );
    const productionReceiptEntries = entries.filter(
      (entry) => entry.topicKey === "PRODUCTION_RECEIPT",
    );
    const supplierReturnEntries = entries.filter(
      (entry) => entry.topicKey === "SUPPLIER_RETURN",
    );
    const workshopPickEntries = entries.filter(
      (entry) => entry.topicKey === "WORKSHOP_PICK",
    );
    const workshopReturnEntries = entries.filter(
      (entry) => entry.topicKey === "WORKSHOP_RETURN",
    );
    const workshopScrapEntries = entries.filter(
      (entry) => entry.topicKey === "WORKSHOP_SCRAP",
    );
    const salesOutboundEntries = entries.filter(
      (entry) => entry.topicKey === "SALES_OUTBOUND",
    );
    const salesReturnEntries = entries.filter(
      (entry) => entry.topicKey === "SALES_RETURN",
    );
    const acceptanceInboundAmount = sumDecimals(
      acceptanceInboundEntries.map((entry) => entry.amount),
    );
    const productionReceiptAmount = sumDecimals(
      productionReceiptEntries.map((entry) => entry.amount),
    );
    const supplierReturnAmount = sumDecimals(
      supplierReturnEntries.map((entry) => entry.amount),
    );
    const workshopPickCostAmount = sumDecimals(
      workshopPickEntries.map((entry) => entry.cost),
    );
    const workshopReturnCostAmount = sumDecimals(
      workshopReturnEntries.map((entry) => entry.cost),
    );
    const workshopScrapCostAmount = sumDecimals(
      workshopScrapEntries.map((entry) => entry.cost),
    );
    const salesOutboundAmount = sumDecimals(
      salesOutboundEntries.map((entry) => entry.amount),
    );
    const salesOutboundCostAmount = sumDecimals(
      salesOutboundEntries.map((entry) => entry.cost),
    );
    const salesReturnAmount = sumDecimals(
      salesReturnEntries.map((entry) => entry.amount),
    );
    const salesReturnCostAmount = sumDecimals(
      salesReturnEntries.map((entry) => entry.cost),
    );
    const netSalesAmount = salesOutboundAmount.sub(salesReturnAmount);
    const netSalesCostAmount = salesOutboundCostAmount.sub(
      salesReturnCostAmount,
    );
    return {
      lineCount: entries.length,
      documentCount: documentKeys.size,
      acceptanceInboundAmount: formatMoney(acceptanceInboundAmount),
      productionReceiptAmount: formatMoney(productionReceiptAmount),
      supplierReturnAmount: formatMoney(supplierReturnAmount),
      purchaseNetInboundAmount: formatMoney(
        acceptanceInboundAmount.sub(supplierReturnAmount),
      ),
      workshopPickCostAmount: formatMoney(workshopPickCostAmount),
      workshopReturnCostAmount: formatMoney(workshopReturnCostAmount),
      workshopScrapCostAmount: formatMoney(workshopScrapCostAmount),
      workshopNetConsumptionCostAmount: formatMoney(
        workshopPickCostAmount
          .sub(workshopReturnCostAmount)
          .add(workshopScrapCostAmount),
      ),
      salesOutboundSalesAmount: formatMoney(salesOutboundAmount),
      salesOutboundCostAmount: formatMoney(salesOutboundCostAmount),
      salesReturnSalesAmount: formatMoney(salesReturnAmount),
      salesReturnCostAmount: formatMoney(salesReturnCostAmount),
      netSalesAmount: formatMoney(netSalesAmount),
      netSalesCostAmount: formatMoney(netSalesCostAmount),
      estimatedGrossProfitAmount: formatMoney(
        netSalesAmount.sub(netSalesCostAmount),
      ),
      openingCostAmount: balanceTotals.openingAmount,
      inboundAmount: balanceTotals.inboundAmount,
      outboundAmount: balanceTotals.outboundAmount,
      inventoryCostNetChangeAmount: balanceTotals.netAmount,
      closingCostAmount: balanceTotals.closingAmount,
    };
  }

  private buildMaterialQuantityTotals(
    entries: MonthlyMaterialCategoryEntry[],
    balanceTotals: MonthlyMaterialCategoryBalanceTotals,
  ): Pick<
    MonthlyReportMaterialSummaryItem,
    | "inQuantity"
    | "outQuantity"
    | "inventoryNetChangeQuantity"
    | "openingQuantity"
    | "closingQuantity"
    | "acceptanceInboundQuantity"
    | "productionReceiptQuantity"
    | "supplierReturnQuantity"
    | "workshopPickQuantity"
    | "workshopReturnQuantity"
    | "workshopScrapQuantity"
    | "workshopNetConsumptionQuantity"
    | "salesOutboundQuantity"
    | "salesReturnQuantity"
    | "netSalesQuantity"
  > {
    const sumTopicQuantity = (topicKey: string) =>
      sumDecimals(
        entries
          .filter((entry) => entry.topicKey === topicKey)
          .map((entry) => entry.quantity),
      );
    const inQuantity = sumDecimals(
      entries
        .filter((entry) => entry.direction === MonthlyReportingDirection.IN)
        .map((entry) => entry.quantity),
    );
    const outQuantity = sumDecimals(
      entries
        .filter((entry) => entry.direction === MonthlyReportingDirection.OUT)
        .map((entry) => entry.quantity),
    );
    const acceptanceInboundQuantity = sumTopicQuantity("ACCEPTANCE_INBOUND");
    const productionReceiptQuantity = sumTopicQuantity("PRODUCTION_RECEIPT");
    const supplierReturnQuantity = sumTopicQuantity("SUPPLIER_RETURN");
    const workshopPickQuantity = sumTopicQuantity("WORKSHOP_PICK");
    const workshopReturnQuantity = sumTopicQuantity("WORKSHOP_RETURN");
    const workshopScrapQuantity = sumTopicQuantity("WORKSHOP_SCRAP");
    const salesOutboundQuantity = sumTopicQuantity("SALES_OUTBOUND");
    const salesReturnQuantity = sumTopicQuantity("SALES_RETURN");

    return {
      inQuantity: formatQuantity(inQuantity),
      outQuantity: formatQuantity(outQuantity),
      inventoryNetChangeQuantity: balanceTotals.netQuantity,
      openingQuantity: balanceTotals.openingQuantity,
      closingQuantity: balanceTotals.closingQuantity,
      acceptanceInboundQuantity: formatQuantity(acceptanceInboundQuantity),
      productionReceiptQuantity: formatQuantity(productionReceiptQuantity),
      supplierReturnQuantity: formatQuantity(supplierReturnQuantity),
      workshopPickQuantity: formatQuantity(workshopPickQuantity),
      workshopReturnQuantity: formatQuantity(workshopReturnQuantity),
      workshopScrapQuantity: formatQuantity(workshopScrapQuantity),
      workshopNetConsumptionQuantity: formatQuantity(
        workshopPickQuantity
          .sub(workshopReturnQuantity)
          .add(workshopScrapQuantity),
      ),
      salesOutboundQuantity: formatQuantity(salesOutboundQuantity),
      salesReturnQuantity: formatQuantity(salesReturnQuantity),
      netSalesQuantity: formatQuantity(
        salesOutboundQuantity.sub(salesReturnQuantity),
      ),
    };
  }
}
