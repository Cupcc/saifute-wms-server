import { Injectable } from "@nestjs/common";
import { Prisma } from "../../../../generated/prisma/client";
import { AppConfigService } from "../../../shared/config/app-config.service";
import { StockScopeCompatibilityService } from "../../inventory-core/application/stock-scope-compatibility.service";
import type { StockScopeCode } from "../../session/domain/user-session";
import {
  resolveDateRange,
  resolveTodayRange,
  toDateOnly,
} from "../domain/reporting-date.util";
import {
  ExportReportDto,
  type QueryInventorySummaryDto,
  type QueryMaterialCategorySummaryDto,
  type QueryTrendSeriesDto,
  ReportingExportType,
  ReportingTrendType,
} from "../dto/query-reporting.dto";
import { HomeMetricsRepository } from "../infrastructure/home-metrics.repository";
import {
  type InventoryBalanceSnapshot,
  InventoryReportingRepository,
} from "../infrastructure/inventory-reporting.repository";

export interface InventoryOverviewSummary {
  activeMaterialCount: number;
  inventoryRecordCount: number;
  lowStockCount: number;
  normalStockCount: number;
  aboveMaxStockCount: number;
  unconfiguredStockCount: number;
  totalInventoryValue: string;
}

export enum InventoryHealthStatus {
  LOW = "LOW",
  NORMAL = "NORMAL",
  ABOVE_MAX = "ABOVE_MAX",
  UNCONFIGURED = "UNCONFIGURED",
}

interface InventoryHealthCounts {
  lowStockCount: number;
  normalStockCount: number;
  aboveMaxStockCount: number;
  unconfiguredStockCount: number;
}

export interface InventorySummaryItem {
  materialId: number;
  materialCode: string;
  materialName: string;
  specModel: string | null;
  unitCode: string;
  categoryId: number | null;
  categoryCode: string | null;
  categoryName: string | null;
  stockScope: StockScopeCode | null;
  stockScopeName: string | null;
  quantityOnHand: string;
  inventoryValue: string;
  warningMinQty: string | null;
  warningMaxQty: string | null;
  inventoryStatus: InventoryHealthStatus;
  /** @deprecated 使用 inventoryStatus；仅为旧客户端兼容保留。 */
  isBelowMin?: boolean;
  updatedAt: string;
}

export interface ReportingExportResult {
  fileName: string;
  content: string;
  contentType: string;
}

@Injectable()
export class ReportingService {
  constructor(
    private readonly homeMetricsRepository: HomeMetricsRepository,
    private readonly repository: InventoryReportingRepository,
    private readonly appConfigService: AppConfigService,
    private readonly stockScopeCompatibilityService: StockScopeCompatibilityService,
  ) {}

  async getHomeDashboard(stockScope?: StockScopeCode) {
    const { start, end } = resolveTodayRange(this.tz);
    const inventoryProjection = await this.loadInventoryProjection({
      stockScope,
    });
    const metrics = await this.homeMetricsRepository.getHomeMetrics(
      start,
      end,
      {
        stockScope,
      },
    );
    const acceptanceAmount = new Prisma.Decimal(metrics.acceptanceTotalAmount);
    const supplierReturnAmount = new Prisma.Decimal(
      metrics.supplierReturnTotalAmount,
    );
    const salesOutboundAmount = new Prisma.Decimal(
      metrics.salesOutboundTotalAmount,
    );
    const salesReturnAmount = new Prisma.Decimal(
      metrics.salesReturnTotalAmount,
    );
    const workshopPickCost = new Prisma.Decimal(metrics.workshopPickCostAmount);
    const workshopReturnCost = new Prisma.Decimal(
      metrics.workshopReturnCostAmount,
    );
    const workshopScrapCost = new Prisma.Decimal(
      metrics.workshopScrapCostAmount,
    );

    return {
      generatedAt: new Date().toISOString(),
      inventory: inventoryProjection.summary,
      todayDocuments: {
        acceptanceCount: metrics.acceptanceTodayCount,
        productionReceiptCount: metrics.productionReceiptTodayCount,
        supplierReturnCount: metrics.supplierReturnTodayCount,
        salesOutboundCount: metrics.salesOutboundTodayCount,
        salesReturnCount: metrics.salesReturnTodayCount,
        workshopPickCount: metrics.workshopPickTodayCount,
        workshopReturnCount: metrics.workshopReturnTodayCount,
        workshopScrapCount: metrics.workshopScrapTodayCount,
      },
      cumulativeAmounts: {
        inbound: {
          acceptanceAmount: this.toMoneyString(acceptanceAmount),
          productionReceiptAmount: this.toMoneyString(
            metrics.productionReceiptTotalAmount,
          ),
          supplierReturnAmount: this.toMoneyString(supplierReturnAmount),
          procurementNetInboundAmount: this.toMoneyString(
            acceptanceAmount.sub(supplierReturnAmount),
          ),
        },
        sales: {
          outboundAmount: this.toMoneyString(salesOutboundAmount),
          returnAmount: this.toMoneyString(salesReturnAmount),
          netAmount: this.toMoneyString(
            salesOutboundAmount.sub(salesReturnAmount),
          ),
        },
        workshop: {
          pickCost: this.toMoneyString(workshopPickCost),
          returnCost: this.toMoneyString(workshopReturnCost),
          scrapCost: this.toMoneyString(workshopScrapCost),
          netConsumptionCost: this.toMoneyString(
            workshopPickCost.sub(workshopReturnCost).add(workshopScrapCost),
          ),
        },
      },
    };
  }

  async getInventorySummary(
    query: QueryInventorySummaryDto & { stockScope?: StockScopeCode },
  ) {
    const inventoryProjection = await this.loadInventoryProjection({
      stockScope: query.stockScope,
      keyword: query.keyword,
      categoryId: query.categoryId,
    });
    const items = inventoryProjection.snapshots.map((item) =>
      this.toInventorySummaryItem(
        item,
        inventoryProjection.valuationByBalanceKey.get(
          this.toBalanceKey(item.material.id, item.stockScope?.id),
        ),
      ),
    );
    const offset = query.offset ?? 0;
    const limit = Math.min(query.limit ?? 50, 100);
    const pagedItems = items.slice(offset, offset + limit);

    return {
      total: items.length,
      items: pagedItems,
      summary: inventoryProjection.summary,
    };
  }

  async getMaterialCategorySummary(
    query: QueryMaterialCategorySummaryDto & { stockScope?: StockScopeCode },
  ) {
    const inventoryProjection = await this.loadInventoryProjection({
      stockScope: query.stockScope,
      keyword: query.keyword,
    });
    const grouped = new Map<
      string,
      {
        categoryId: number | null;
        categoryCode: string | null;
        categoryName: string | null;
        materialIds: Set<number>;
        inventoryRecordCount: number;
        lowStockCount: number;
        normalStockCount: number;
        aboveMaxStockCount: number;
        unconfiguredStockCount: number;
        totalInventoryValue: Prisma.Decimal;
      }
    >();

    for (const snapshot of inventoryProjection.snapshots) {
      const key = snapshot.material.category
        ? String(snapshot.material.category.id)
        : "uncategorized";
      const current = grouped.get(key) ?? {
        categoryId: snapshot.material.category?.id ?? null,
        categoryCode: snapshot.material.category?.categoryCode ?? null,
        categoryName: snapshot.material.category?.categoryName ?? "未分类",
        materialIds: new Set<number>(),
        inventoryRecordCount: 0,
        lowStockCount: 0,
        normalStockCount: 0,
        aboveMaxStockCount: 0,
        unconfiguredStockCount: 0,
        totalInventoryValue: new Prisma.Decimal(0),
      };

      current.materialIds.add(snapshot.material.id);
      current.inventoryRecordCount += 1;
      this.incrementInventoryHealthCount(
        current,
        this.classifyInventoryHealth(snapshot),
      );
      current.totalInventoryValue = current.totalInventoryValue.add(
        inventoryProjection.valuationByBalanceKey.get(
          this.toBalanceKey(snapshot.material.id, snapshot.stockScope?.id),
        ) ?? new Prisma.Decimal(0),
      );
      grouped.set(key, current);
    }

    const rows = [...grouped.values()]
      .map((item) => ({
        categoryId: item.categoryId,
        categoryCode: item.categoryCode,
        categoryName: item.categoryName,
        materialCount: item.materialIds.size,
        inventoryRecordCount: item.inventoryRecordCount,
        lowStockCount: item.lowStockCount,
        normalStockCount: item.normalStockCount,
        aboveMaxStockCount: item.aboveMaxStockCount,
        unconfiguredStockCount: item.unconfiguredStockCount,
        totalInventoryValue: item.totalInventoryValue.toFixed(4),
      }))
      .sort((left, right) =>
        new Prisma.Decimal(right.totalInventoryValue).cmp(
          left.totalInventoryValue,
        ),
      );

    const offset = query.offset ?? 0;
    const limit = Math.min(query.limit ?? 50, 100);

    return {
      total: rows.length,
      items: rows.slice(offset, offset + limit),
      summary: inventoryProjection.summary,
    };
  }

  async getTrendSeries(
    query: QueryTrendSeriesDto,
    stockScope?: StockScopeCode,
  ) {
    const { dateFrom, dateTo } = resolveDateRange(
      this.tz,
      query.dateFrom,
      query.dateTo,
    );
    const trendType = query.trendType ?? ReportingTrendType.ALL;
    const inventoryStockScopeIds =
      await this.resolveInventoryStockScopeIds(stockScope);
    const documents = await this.repository.findTrendDocuments({
      dateFrom,
      dateTo,
      inventoryStockScopeIds,
      workshopId: query.workshopId,
    });

    const filtered = documents.filter((item) =>
      this.matchesTrendType(item.sourceType, trendType),
    );
    const grouped = new Map<
      string,
      {
        date: string;
        trendType: string;
        documentKeys: Set<string>;
        totalAmount: Prisma.Decimal;
      }
    >();
    const summaryDocumentKeys = new Set<string>();
    let inventoryCostNetChange = new Prisma.Decimal(0);

    for (const item of filtered) {
      const date = toDateOnly(item.bizDate, this.tz);
      const key = `${date}:${item.sourceType}`;
      const documentKey = `${item.businessDocumentType}:${item.businessDocumentId}`;
      const current = grouped.get(key) ?? {
        date,
        trendType: item.sourceType,
        documentKeys: new Set<string>(),
        totalAmount: new Prisma.Decimal(0),
      };
      current.documentKeys.add(documentKey);
      current.totalAmount = current.totalAmount.add(item.totalAmount);
      grouped.set(key, current);
      summaryDocumentKeys.add(documentKey);
      inventoryCostNetChange = inventoryCostNetChange.add(
        item.inventoryCostDelta,
      );
    }

    return {
      dateFrom: toDateOnly(dateFrom, this.tz),
      dateTo: toDateOnly(dateTo, this.tz),
      summary: {
        documentCount: summaryDocumentKeys.size,
        inventoryCostNetChange: inventoryCostNetChange.toFixed(4),
      },
      items: [...grouped.values()]
        .sort((left, right) =>
          left.date === right.date
            ? left.trendType.localeCompare(right.trendType)
            : left.date.localeCompare(right.date),
        )
        .map((item) => ({
          date: item.date,
          trendType: item.trendType,
          documentCount: item.documentKeys.size,
          totalAmount: item.totalAmount.toFixed(4),
        })),
    };
  }

  async exportReport(dto: ExportReportDto, stockScope?: StockScopeCode) {
    switch (dto.reportType) {
      case ReportingExportType.INVENTORY_SUMMARY: {
        const result = await this.getInventorySummary({
          keyword: dto.keyword,
          categoryId: dto.categoryId,
          stockScope,
          limit: 10000,
          offset: 0,
        });
        return this.buildCsvExport(
          dto.reportType,
          [
            "materialCode",
            "materialName",
            "categoryName",
            "stockScopeName",
            "quantityOnHand",
            "unitCode",
            "inventoryValue",
            "inventoryStatus",
          ],
          result.items,
        );
      }
      case ReportingExportType.MATERIAL_CATEGORY_SUMMARY: {
        const result = await this.getMaterialCategorySummary({
          keyword: dto.keyword,
          stockScope,
          limit: 10000,
          offset: 0,
        });
        return this.buildCsvExport(
          dto.reportType,
          [
            "categoryCode",
            "categoryName",
            "materialCount",
            "inventoryRecordCount",
            "lowStockCount",
            "normalStockCount",
            "aboveMaxStockCount",
            "unconfiguredStockCount",
            "totalInventoryValue",
          ],
          result.items,
        );
      }
      case ReportingExportType.TRENDS: {
        const result = await this.getTrendSeries(
          {
            trendType: dto.trendType,
            dateFrom: dto.dateFrom,
            dateTo: dto.dateTo,
            workshopId: dto.workshopId,
          },
          stockScope,
        );
        return this.buildCsvExport(
          dto.reportType,
          ["date", "trendType", "documentCount", "totalAmount"],
          result.items,
        );
      }
      default:
        return this.buildCsvExport(dto.reportType, [], []);
    }
  }

  private get tz() {
    return this.appConfigService.businessTimezone;
  }

  private toInventorySummaryItem(
    item: InventoryBalanceSnapshot,
    inventoryValue?: Prisma.Decimal,
  ): InventorySummaryItem {
    const warningMinQty = item.material.warningMinQty;
    const warningMaxQty = item.material.warningMaxQty;
    const inventoryStatus = this.classifyInventoryHealth(item);
    return {
      materialId: item.material.id,
      materialCode: item.material.materialCode,
      materialName: item.material.materialName,
      specModel: item.material.specModel,
      unitCode: item.material.unitCode,
      categoryId: item.material.category?.id ?? null,
      categoryCode: item.material.category?.categoryCode ?? null,
      categoryName: item.material.category?.categoryName ?? null,
      stockScope:
        (item.stockScope?.scopeCode as StockScopeCode | undefined) ?? null,
      stockScopeName: item.stockScope?.scopeName ?? null,
      quantityOnHand: item.quantityOnHand.toFixed(6),
      inventoryValue: this.toMoneyString(inventoryValue),
      warningMinQty: warningMinQty ? warningMinQty.toFixed(6) : null,
      warningMaxQty: warningMaxQty ? warningMaxQty.toFixed(6) : null,
      inventoryStatus,
      isBelowMin: inventoryStatus === InventoryHealthStatus.LOW,
      updatedAt: item.updatedAt.toISOString(),
    };
  }

  private async loadInventoryProjection(params: {
    stockScope?: StockScopeCode;
    keyword?: string;
    categoryId?: number;
  }) {
    const inventoryStockScopeIds = await this.resolveInventoryStockScopeIds(
      params.stockScope,
    );
    const snapshots = await this.repository.findInventoryBalanceSnapshots({
      keyword: params.keyword,
      categoryId: params.categoryId,
      inventoryStockScopeIds,
    });
    const valuationRows =
      await this.repository.summarizeInventoryValueByBalance({
        inventoryStockScopeIds,
        materialIds: [...new Set(snapshots.map((item) => item.material.id))],
      });
    const valuationByBalanceKey = new Map<string, Prisma.Decimal>(
      valuationRows.map((row) => [
        this.toBalanceKey(row.materialId, row.stockScopeId),
        row.inventoryValue,
      ]),
    );

    return {
      inventoryStockScopeIds,
      snapshots,
      valuationByBalanceKey,
      summary: this.buildInventoryOverviewSummary(
        snapshots,
        valuationByBalanceKey,
      ),
    };
  }

  private buildInventoryOverviewSummary(
    snapshots: InventoryBalanceSnapshot[],
    valuationByBalanceKey: Map<string, Prisma.Decimal>,
  ): InventoryOverviewSummary {
    const materialIdsWithStock = new Set<number>();
    const healthCounts: InventoryHealthCounts = {
      lowStockCount: 0,
      normalStockCount: 0,
      aboveMaxStockCount: 0,
      unconfiguredStockCount: 0,
    };
    let totalInventoryValue = new Prisma.Decimal(0);

    for (const snapshot of snapshots) {
      if (snapshot.quantityOnHand.gt(0)) {
        materialIdsWithStock.add(snapshot.material.id);
      }
      this.incrementInventoryHealthCount(
        healthCounts,
        this.classifyInventoryHealth(snapshot),
      );
      totalInventoryValue = totalInventoryValue.add(
        valuationByBalanceKey.get(
          this.toBalanceKey(snapshot.material.id, snapshot.stockScope?.id),
        ) ?? new Prisma.Decimal(0),
      );
    }

    return {
      activeMaterialCount: materialIdsWithStock.size,
      inventoryRecordCount: snapshots.length,
      ...healthCounts,
      totalInventoryValue: totalInventoryValue.toFixed(4),
    };
  }

  private toBalanceKey(materialId: number, stockScopeId?: number | null) {
    return `${materialId}:${stockScopeId ?? "null"}`;
  }

  private toMoneyString(value: Prisma.Decimal | null | undefined) {
    return new Prisma.Decimal(value ?? 0).toFixed(4);
  }

  private classifyInventoryHealth(
    snapshot: Pick<InventoryBalanceSnapshot, "quantityOnHand" | "material">,
  ): InventoryHealthStatus {
    const { warningMinQty, warningMaxQty } = snapshot.material;
    if (warningMinQty === null && warningMaxQty === null) {
      return InventoryHealthStatus.UNCONFIGURED;
    }
    if (warningMinQty !== null && snapshot.quantityOnHand.lt(warningMinQty)) {
      return InventoryHealthStatus.LOW;
    }
    if (warningMaxQty !== null && snapshot.quantityOnHand.gt(warningMaxQty)) {
      return InventoryHealthStatus.ABOVE_MAX;
    }
    return InventoryHealthStatus.NORMAL;
  }

  private incrementInventoryHealthCount(
    counts: InventoryHealthCounts,
    status: InventoryHealthStatus,
  ) {
    switch (status) {
      case InventoryHealthStatus.LOW:
        counts.lowStockCount += 1;
        return;
      case InventoryHealthStatus.NORMAL:
        counts.normalStockCount += 1;
        return;
      case InventoryHealthStatus.ABOVE_MAX:
        counts.aboveMaxStockCount += 1;
        return;
      case InventoryHealthStatus.UNCONFIGURED:
        counts.unconfiguredStockCount += 1;
    }
  }

  private matchesTrendType(
    sourceType: string,
    trendType: ReportingTrendType,
  ): boolean {
    if (trendType === ReportingTrendType.ALL) {
      return true;
    }
    if (trendType === ReportingTrendType.RD) {
      return (
        sourceType === ReportingTrendType.RD_HANDOFF ||
        sourceType === ReportingTrendType.RD_STOCKTAKE_GAIN ||
        sourceType === ReportingTrendType.RD_STOCKTAKE_LOSS
      );
    }
    return sourceType === trendType;
  }

  private async resolveInventoryStockScopeIds(stockScope?: StockScopeCode) {
    if (stockScope) {
      const scope =
        await this.stockScopeCompatibilityService.resolveByStockScope(
          stockScope,
        );
      return [scope.stockScopeId];
    }

    return this.stockScopeCompatibilityService.listRealStockScopeIds();
  }

  private buildCsvExport(
    reportType: ReportingExportType,
    columns: string[],
    rows: object[],
  ): ReportingExportResult {
    const normalizedRows = rows.map((row) =>
      columns.map((column) =>
        this.escapeCsvValue((row as Record<string, unknown>)[column]),
      ),
    );
    const csvLines = [
      columns.join(","),
      ...normalizedRows.map((row) => row.join(",")),
    ];

    return {
      fileName: `${reportType.toLowerCase()}-${toDateOnly(new Date(), this.tz)}.csv`,
      content: `﻿${csvLines.join("\n")}`,
      contentType: "text/csv; charset=utf-8",
    };
  }

  private escapeCsvValue(value: unknown): string {
    const stringValue =
      value === null || typeof value === "undefined" ? "" : String(value);
    const escaped = stringValue.replace(/"/g, '""');
    return /[",\n]/.test(escaped) ? `"${escaped}"` : escaped;
  }
}
