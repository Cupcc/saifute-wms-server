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

export interface MonthlyReportMaterialCategorySummaryTotals {
  categoryCount: number;
  lineCount: number;
  documentCount: number;
  abnormalDocumentCount: number;
  acceptanceInboundQuantity: string;
  acceptanceInboundAmount: string;
  productionReceiptQuantity: string;
  productionReceiptAmount: string;
  supplierReturnQuantity: string;
  supplierReturnAmount: string;
  workshopPickQuantity: string;
  workshopPickAmount: string;
  workshopReturnQuantity: string;
  workshopReturnAmount: string;
  workshopNetUsedQuantity: string;
  workshopNetUsedAmount: string;
  salesOutboundQuantity: string;
  salesOutboundAmount: string;
  salesOutboundSalesAmount: string;
  salesOutboundCostAmount: string;
  salesReturnQuantity: string;
  salesReturnAmount: string;
  salesReturnSalesAmount: string;
  salesReturnCostAmount: string;
  netQuantity: string;
  netAmount: string;
  openingQuantity: string;
  openingAmount: string;
  closingQuantity: string;
  closingAmount: string;
}

export interface MonthlyReportMaterialCategorySummaryItem {
  nodeKey: string;
  categoryId: number | null;
  categoryCode: string | null;
  categoryName: string;
  lineCount: number;
  documentCount: number;
  abnormalDocumentCount: number;
  acceptanceInboundQuantity: string;
  acceptanceInboundAmount: string;
  productionReceiptQuantity: string;
  productionReceiptAmount: string;
  supplierReturnQuantity: string;
  supplierReturnAmount: string;
  workshopPickQuantity: string;
  workshopPickAmount: string;
  workshopReturnQuantity: string;
  workshopReturnAmount: string;
  workshopNetUsedQuantity: string;
  workshopNetUsedAmount: string;
  salesOutboundQuantity: string;
  salesOutboundAmount: string;
  salesOutboundSalesAmount: string;
  salesOutboundCostAmount: string;
  salesReturnQuantity: string;
  salesReturnAmount: string;
  salesReturnSalesAmount: string;
  salesReturnCostAmount: string;
  netQuantity: string;
  netAmount: string;
  openingQuantity: string;
  openingAmount: string;
  closingQuantity: string;
  closingAmount: string;
}

export type MonthlyReportMaterialCategoryCatalogItem = Pick<
  MonthlyReportMaterialCategorySummaryItem,
  "nodeKey" | "categoryId" | "categoryCode" | "categoryName"
>;

export interface MonthlyReportMaterialSummaryItem {
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
  lineCount: number;
  documentCount: number;
  abnormalDocumentCount: number;
  inQuantity: string;
  outQuantity: string;
  netQuantity: string;
  openingQuantity: string;
  openingAmount: string;
  closingQuantity: string;
  closingAmount: string;
  acceptanceInboundQuantity: string;
  acceptanceInboundAmount: string;
  productionReceiptQuantity: string;
  productionReceiptAmount: string;
  supplierReturnQuantity: string;
  supplierReturnAmount: string;
  workshopPickQuantity: string;
  workshopPickAmount: string;
  workshopReturnQuantity: string;
  workshopReturnAmount: string;
  workshopNetUsedQuantity: string;
  workshopNetUsedAmount: string;
  salesOutboundQuantity: string;
  salesOutboundAmount: string;
  salesOutboundSalesAmount: string;
  salesOutboundCostAmount: string;
  salesReturnQuantity: string;
  salesReturnAmount: string;
  salesReturnSalesAmount: string;
  salesReturnCostAmount: string;
  netAmount: string;
}

export interface MonthlyReportMaterialCategoryFilters {
  viewMode: MonthlyReportingViewMode.MATERIAL_CATEGORY;
  stockScope: StockScopeCode | null;
  workshopId: number | null;
  documentTypeLabel: string | null;
  categoryId: number | null;
  categoryNodeKey: string | null;
  abnormalOnly: boolean;
  keyword: string | null;
}

export interface MonthlyReportMaterialCategorySummaryResult {
  yearMonth: string;
  filters: MonthlyReportMaterialCategoryFilters;
  viewMode: MonthlyReportingViewMode.MATERIAL_CATEGORY;
  documentTypeCatalog: MonthlyReportDocumentTypeCatalogItem[];
  categoryCatalog: MonthlyReportMaterialCategoryCatalogItem[];
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
  summary: Omit<MonthlyReportMaterialCategorySummaryTotals, "categoryCount">;
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
        categoryId: query.categoryId ?? null,
        categoryNodeKey: query.categoryNodeKey?.trim() || null,
        abnormalOnly: query.abnormalOnly ?? false,
        keyword: query.keyword?.trim() || null,
      },
      documentTypeCatalog:
        this.catalogService.buildMaterialCategoryDocumentTypeCatalog(entries),
      categoryCatalog: this.buildMaterialCategoryCatalog(
        entries,
        balanceSnapshots,
      ),
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
    balanceSnapshots: MonthlyMaterialCategoryBalanceSnapshot[] = [],
  ): MonthlyReportMaterialCategoryCatalogItem[] {
    return collectMonthlyMaterialCategoryGroups(entries, balanceSnapshots)
      .map(({ entries: _entries, ...category }) => category)
      .sort(compareMaterialCategoryItems);
  }

  buildMaterialItems(
    entries: MonthlyMaterialCategoryEntry[],
    balanceSnapshots: MonthlyMaterialCategoryBalanceSnapshot[] = [],
  ): MonthlyReportMaterialSummaryItem[] {
    const balanceTotalsByMaterial =
      buildMonthlyMaterialCategoryBalanceTotalsByKey(
        balanceSnapshots,
        buildBalanceMaterialKey,
      );

    return collectMonthlyMaterialGroups(entries, balanceSnapshots)
      .map((item) => {
        const commonTotals = this.buildCommonMaterialCategoryTotals(
          item.entries,
        );
        const inQuantity = sumDecimals(
          item.entries
            .filter((entry) => entry.direction === MonthlyReportingDirection.IN)
            .map((entry) => entry.quantity),
        );
        const outQuantity = sumDecimals(
          item.entries
            .filter(
              (entry) => entry.direction === MonthlyReportingDirection.OUT,
            )
            .map((entry) => entry.quantity),
        );

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
          ...commonTotals,
          ...(balanceTotalsByMaterial.get(item.materialKey) ??
            createEmptyMonthlyMaterialCategoryBalanceTotals()),
          inQuantity: formatQuantity(inQuantity),
          outQuantity: formatQuantity(outQuantity),
        };
      })
      .sort(compareMaterialItems);
  }

  buildMaterialCategoryItems(
    entries: MonthlyMaterialCategoryEntry[],
    balanceSnapshots: MonthlyMaterialCategoryBalanceSnapshot[] = [],
  ): MonthlyReportMaterialCategorySummaryItem[] {
    const balanceTotalsByCategory =
      buildMonthlyMaterialCategoryBalanceTotalsByKey(
        balanceSnapshots,
        resolveBalanceCategoryNodeKey,
      );

    return collectMonthlyMaterialCategoryGroups(entries, balanceSnapshots)
      .map((item) => {
        return {
          nodeKey: item.nodeKey,
          categoryId: item.categoryId,
          categoryCode: item.categoryCode,
          categoryName: item.categoryName,
          ...this.buildCommonMaterialCategoryTotals(item.entries),
          ...(balanceTotalsByCategory.get(item.nodeKey) ??
            createEmptyMonthlyMaterialCategoryBalanceTotals()),
        };
      })
      .sort(compareMaterialCategoryItems);
  }

  buildMaterialCategoryTotals(
    entries: MonthlyMaterialCategoryEntry[],
    balanceSnapshots: MonthlyMaterialCategoryBalanceSnapshot[] = [],
  ): Omit<MonthlyReportMaterialCategorySummaryTotals, "categoryCount"> {
    return this.buildCommonMaterialCategoryTotals(entries, balanceSnapshots);
  }

  private buildCommonMaterialCategoryTotals(
    entries: MonthlyMaterialCategoryEntry[],
    balanceSnapshots: MonthlyMaterialCategoryBalanceSnapshot[] = [],
  ): Omit<MonthlyReportMaterialCategorySummaryTotals, "categoryCount"> {
    const documentKeys = new Set(
      entries.map((entry) => `${entry.documentType}:${entry.documentId}`),
    );
    const abnormalDocumentKeys = new Set(
      entries
        .filter((entry) => entry.abnormalFlags.length > 0)
        .map((entry) => `${entry.documentType}:${entry.documentId}`),
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
    const salesOutboundEntries = entries.filter(
      (entry) => entry.topicKey === "SALES_OUTBOUND",
    );
    const salesReturnEntries = entries.filter(
      (entry) => entry.topicKey === "SALES_RETURN",
    );
    const acceptanceInboundQuantity = sumDecimals(
      acceptanceInboundEntries.map((entry) => entry.quantity),
    );
    const acceptanceInboundAmount = sumDecimals(
      acceptanceInboundEntries.map((entry) => entry.amount),
    );
    const productionReceiptQuantity = sumDecimals(
      productionReceiptEntries.map((entry) => entry.quantity),
    );
    const productionReceiptAmount = sumDecimals(
      productionReceiptEntries.map((entry) => entry.amount),
    );
    const supplierReturnQuantity = sumDecimals(
      supplierReturnEntries.map((entry) => entry.quantity),
    );
    const supplierReturnAmount = sumDecimals(
      supplierReturnEntries.map((entry) => entry.amount),
    );
    const workshopPickQuantity = sumDecimals(
      workshopPickEntries.map((entry) => entry.quantity),
    );
    const workshopPickAmount = sumDecimals(
      workshopPickEntries.map((entry) => entry.amount),
    );
    const workshopReturnQuantity = sumDecimals(
      workshopReturnEntries.map((entry) => entry.quantity),
    );
    const workshopReturnAmount = sumDecimals(
      workshopReturnEntries.map((entry) => entry.amount),
    );
    const salesOutboundQuantity = sumDecimals(
      salesOutboundEntries.map((entry) => entry.quantity),
    );
    const salesOutboundAmount = sumDecimals(
      salesOutboundEntries.map((entry) => entry.amount),
    );
    const salesOutboundCostAmount = sumDecimals(
      salesOutboundEntries.map((entry) => entry.cost),
    );
    const salesReturnQuantity = sumDecimals(
      salesReturnEntries.map((entry) => entry.quantity),
    );
    const salesReturnAmount = sumDecimals(
      salesReturnEntries.map((entry) => entry.amount),
    );
    const salesReturnCostAmount = sumDecimals(
      salesReturnEntries.map((entry) => entry.cost),
    );
    return {
      lineCount: entries.length,
      documentCount: documentKeys.size,
      abnormalDocumentCount: abnormalDocumentKeys.size,
      acceptanceInboundQuantity: formatQuantity(acceptanceInboundQuantity),
      acceptanceInboundAmount: formatMoney(acceptanceInboundAmount),
      productionReceiptQuantity: formatQuantity(productionReceiptQuantity),
      productionReceiptAmount: formatMoney(productionReceiptAmount),
      supplierReturnQuantity: formatQuantity(supplierReturnQuantity),
      supplierReturnAmount: formatMoney(supplierReturnAmount),
      workshopPickQuantity: formatQuantity(workshopPickQuantity),
      workshopPickAmount: formatMoney(workshopPickAmount),
      workshopReturnQuantity: formatQuantity(workshopReturnQuantity),
      workshopReturnAmount: formatMoney(workshopReturnAmount),
      workshopNetUsedQuantity: formatQuantity(
        workshopPickQuantity.sub(workshopReturnQuantity),
      ),
      workshopNetUsedAmount: formatMoney(
        workshopPickAmount.sub(workshopReturnAmount),
      ),
      salesOutboundQuantity: formatQuantity(salesOutboundQuantity),
      salesOutboundAmount: formatMoney(salesOutboundAmount),
      salesOutboundSalesAmount: formatMoney(salesOutboundAmount),
      salesOutboundCostAmount: formatMoney(salesOutboundCostAmount),
      salesReturnQuantity: formatQuantity(salesReturnQuantity),
      salesReturnAmount: formatMoney(salesReturnAmount),
      salesReturnSalesAmount: formatMoney(salesReturnAmount),
      salesReturnCostAmount: formatMoney(salesReturnCostAmount),
      ...buildMonthlyMaterialCategoryBalanceTotals(balanceSnapshots),
    };
  }
}
