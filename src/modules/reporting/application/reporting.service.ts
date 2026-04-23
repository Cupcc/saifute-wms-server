import { Injectable } from "@nestjs/common";
import { Prisma } from "../../../../generated/prisma/client";
import { AppConfigService } from "../../../shared/config/app-config.service";
import { StockScopeCompatibilityService } from "../../inventory-core/application/stock-scope-compatibility.service";
import type { StockScopeCode } from "../../session/domain/user-session";
import {
  ExportReportDto,
  type QueryInventorySummaryDto,
  type QueryMaterialCategorySummaryDto,
  type QueryTrendSeriesDto,
  ReportingExportType,
  ReportingTrendType,
} from "../dto/query-reporting.dto";
import {
  resolveDateRange,
  resolveTodayRange,
  toDateOnly,
} from "../domain/reporting-date.util";
import { HomeMetricsRepository } from "../infrastructure/home-metrics.repository";
import {
  type InventoryBalanceSnapshot,
  InventoryReportingRepository,
} from "../infrastructure/inventory-reporting.repository";

export interface InventoryOverviewSummary {
  activeMaterialCount: number;
  inventoryRecordCount: number;
  lowStockCount: number;
  totalInventoryValue: string;
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
  isBelowMin: boolean;
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
    const metrics = await this.homeMetricsRepository.getHomeMetrics(start, end, {
      stockScope,
    });

    return {
      generatedAt: new Date().toISOString(),
      inventory: inventoryProjection.summary,
      todayDocuments: {
        inboundCount: metrics.inboundTodayCount,
        outboundCount: metrics.outboundTodayCount,
        workshopMaterialCount: metrics.workshopMaterialTodayCount,
      },
      cumulativeDocuments: {
        inbound: {
          totalQty: this.toDecimalString(metrics.inboundTotalQty),
          totalAmount: this.toMoneyString(metrics.inboundTotalAmount),
        },
        outbound: {
          totalQty: this.toDecimalString(metrics.outboundTotalQty),
          totalAmount: this.toMoneyString(metrics.outboundTotalAmount),
        },
        workshopMaterial: {
          totalQty: this.toDecimalString(metrics.workshopMaterialTotalQty),
          totalAmount: this.toMoneyString(metrics.workshopMaterialTotalAmount),
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
        totalInventoryValue: new Prisma.Decimal(0),
      };

      current.materialIds.add(snapshot.material.id);
      current.inventoryRecordCount += 1;
      if (
        snapshot.material.warningMinQty &&
        snapshot.quantityOnHand.lt(snapshot.material.warningMinQty)
      ) {
        current.lowStockCount += 1;
      }
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
        totalInventoryValue: item.totalInventoryValue.toFixed(2),
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

    const filtered = documents.filter(
      (item) =>
        trendType === ReportingTrendType.ALL || item.sourceType === trendType,
    );
    const grouped = new Map<
      string,
      {
        date: string;
        trendType: string;
        documentCount: number;
        totalQty: Prisma.Decimal;
        totalAmount: Prisma.Decimal;
      }
    >();

    for (const item of filtered) {
      const date = toDateOnly(item.bizDate, this.tz);
      const key = `${date}:${item.sourceType}`;
      const current = grouped.get(key) ?? {
        date,
        trendType: item.sourceType,
        documentCount: 0,
        totalQty: new Prisma.Decimal(0),
        totalAmount: new Prisma.Decimal(0),
      };
      current.documentCount += 1;
      current.totalQty = current.totalQty.add(item.totalQty);
      current.totalAmount = current.totalAmount.add(item.totalAmount);
      grouped.set(key, current);
    }

    return {
      dateFrom: toDateOnly(dateFrom, this.tz),
      dateTo: toDateOnly(dateTo, this.tz),
      items: [...grouped.values()]
        .sort((left, right) =>
          left.date === right.date
            ? left.trendType.localeCompare(right.trendType)
            : left.date.localeCompare(right.date),
        )
        .map((item) => ({
          date: item.date,
          trendType: item.trendType,
          documentCount: item.documentCount,
          totalQty: item.totalQty.toFixed(6),
          totalAmount: item.totalAmount.toFixed(2),
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
          },
          stockScope,
        );
        return this.buildCsvExport(
          dto.reportType,
          ["date", "trendType", "documentCount", "totalQty", "totalAmount"],
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
      isBelowMin: warningMinQty
        ? new Prisma.Decimal(item.quantityOnHand).lt(warningMinQty)
        : false,
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
    let lowStockCount = 0;
    let totalInventoryValue = new Prisma.Decimal(0);

    for (const snapshot of snapshots) {
      if (snapshot.quantityOnHand.gt(0)) {
        materialIdsWithStock.add(snapshot.material.id);
      }
      if (
        snapshot.material.warningMinQty &&
        snapshot.quantityOnHand.lt(snapshot.material.warningMinQty)
      ) {
        lowStockCount += 1;
      }
      totalInventoryValue = totalInventoryValue.add(
        valuationByBalanceKey.get(
          this.toBalanceKey(snapshot.material.id, snapshot.stockScope?.id),
        ) ?? new Prisma.Decimal(0),
      );
    }

    return {
      activeMaterialCount: materialIdsWithStock.size,
      inventoryRecordCount: snapshots.length,
      lowStockCount,
      totalInventoryValue: totalInventoryValue.toFixed(2),
    };
  }

  private toBalanceKey(materialId: number, stockScopeId?: number | null) {
    return `${materialId}:${stockScopeId ?? "null"}`;
  }

  private toDecimalString(value: Prisma.Decimal | null | undefined) {
    return new Prisma.Decimal(value ?? 0).toFixed(6);
  }

  private toMoneyString(value: Prisma.Decimal | null | undefined) {
    return new Prisma.Decimal(value ?? 0).toFixed(2);
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
