import { Test } from "@nestjs/testing";
import { Prisma } from "../../../../generated/prisma/client";
import { AppConfigService } from "../../../shared/config/app-config.service";
import { StockScopeCompatibilityService } from "../../inventory-core/application/stock-scope-compatibility.service";
import {
  ReportingExportType,
  ReportingTrendType,
} from "../dto/query-reporting.dto";
import { HomeMetricsRepository } from "../infrastructure/home-metrics.repository";
import { InventoryReportingRepository } from "../infrastructure/inventory-reporting.repository";
import { ReportingService } from "./reporting.service";

describe("ReportingService", () => {
  let service: ReportingService;
  let repository: jest.Mocked<InventoryReportingRepository>;
  let homeMetricsRepository: jest.Mocked<HomeMetricsRepository>;
  let stockScopeCompatibilityService: jest.Mocked<StockScopeCompatibilityService>;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        ReportingService,
        {
          provide: HomeMetricsRepository,
          useValue: {
            getHomeMetrics: jest.fn(),
          },
        },
        {
          provide: InventoryReportingRepository,
          useValue: {
            findInventoryBalanceSnapshots: jest.fn(),
            summarizeInventoryValueByBalance: jest.fn(),
            findTrendDocuments: jest.fn(),
          },
        },
        {
          provide: AppConfigService,
          useValue: {
            businessTimezone: "Asia/Shanghai",
          },
        },
        {
          provide: StockScopeCompatibilityService,
          useValue: {
            resolveByStockScope: jest
              .fn()
              .mockImplementation(async (stockScope) => ({
                stockScopeId: stockScope === "RD_SUB" ? 2 : 1,
                stockScope,
                workshopId: stockScope === "RD_SUB" ? 9 : 1,
                workshopCode: stockScope === "RD_SUB" ? "RD" : "MAIN",
                workshopName: stockScope === "RD_SUB" ? "研发小仓" : "主仓",
              })),
            listRealStockScopeIds: jest.fn().mockResolvedValue([1, 2]),
          },
        },
      ],
    }).compile();

    service = moduleRef.get(ReportingService);
    homeMetricsRepository = moduleRef.get(HomeMetricsRepository);
    repository = moduleRef.get(InventoryReportingRepository);
    stockScopeCompatibilityService = moduleRef.get(
      StockScopeCompatibilityService,
    );
  });

  it("should build the home dashboard metrics", async () => {
    homeMetricsRepository.getHomeMetrics.mockResolvedValue({
      acceptanceTodayCount: 2,
      productionReceiptTodayCount: 1,
      supplierReturnTodayCount: 1,
      salesOutboundTodayCount: 1,
      salesReturnTodayCount: 1,
      workshopPickTodayCount: 2,
      workshopReturnTodayCount: 1,
      workshopScrapTodayCount: 1,
      acceptanceTotalAmount: new Prisma.Decimal("1200.50"),
      productionReceiptTotalAmount: new Prisma.Decimal("400.00"),
      supplierReturnTotalAmount: new Prisma.Decimal("200.25"),
      salesOutboundTotalAmount: new Prisma.Decimal("500.00"),
      salesReturnTotalAmount: new Prisma.Decimal("125.00"),
      workshopPickCostAmount: new Prisma.Decimal("90.00"),
      workshopReturnCostAmount: new Prisma.Decimal("20.00"),
      workshopScrapCostAmount: new Prisma.Decimal("10.00"),
    });
    repository.findInventoryBalanceSnapshots.mockResolvedValue([
      {
        id: 1,
        quantityOnHand: new Prisma.Decimal("8"),
        updatedAt: new Date("2026-03-15T00:00:00Z"),
        stockScope: {
          id: 1,
          scopeCode: "MAIN",
          scopeName: "主仓",
        },
        material: {
          id: 11,
          materialCode: "MAT-01",
          materialName: "A",
          specModel: null,
          unitCode: "PCS",
          warningMinQty: new Prisma.Decimal("10"),
          warningMaxQty: null,
          category: null,
        },
      },
      {
        id: 2,
        quantityOnHand: new Prisma.Decimal("5"),
        updatedAt: new Date("2026-03-15T00:00:00Z"),
        stockScope: {
          id: 2,
          scopeCode: "RD_SUB",
          scopeName: "研发小仓",
        },
        material: {
          id: 12,
          materialCode: "MAT-02",
          materialName: "B",
          specModel: null,
          unitCode: "PCS",
          warningMinQty: null,
          warningMaxQty: null,
          category: null,
        },
      },
    ]);
    repository.summarizeInventoryValueByBalance.mockResolvedValue([
      {
        materialId: 11,
        stockScopeId: 1,
        inventoryValue: new Prisma.Decimal("88.50"),
      },
      {
        materialId: 12,
        stockScopeId: 2,
        inventoryValue: new Prisma.Decimal("12.00"),
      },
    ]);

    const result = await service.getHomeDashboard();

    expect(result.inventory.activeMaterialCount).toBe(2);
    expect(result.inventory.inventoryRecordCount).toBe(2);
    expect(result.inventory.lowStockCount).toBe(1);
    expect(result.inventory.unconfiguredStockCount).toBe(1);
    expect(result.inventory.totalInventoryValue).toBe("100.5000");
    expect(result.todayDocuments).toMatchObject({
      acceptanceCount: 2,
      productionReceiptCount: 1,
      supplierReturnCount: 1,
      salesOutboundCount: 1,
      salesReturnCount: 1,
      workshopPickCount: 2,
      workshopReturnCount: 1,
      workshopScrapCount: 1,
    });
    expect(result.cumulativeAmounts).toEqual({
      inbound: {
        acceptanceAmount: "1200.5000",
        productionReceiptAmount: "400.0000",
        supplierReturnAmount: "200.2500",
        procurementNetInboundAmount: "1000.2500",
      },
      sales: {
        outboundAmount: "500.0000",
        returnAmount: "125.0000",
        netAmount: "375.0000",
      },
      workshop: {
        pickCost: "90.0000",
        returnCost: "20.0000",
        scrapCost: "10.0000",
        netConsumptionCost: "80.0000",
      },
    });
    expect(result).not.toHaveProperty("cumulativeDocuments");
    expect(homeMetricsRepository.getHomeMetrics).toHaveBeenCalledWith(
      expect.any(Date),
      expect.any(Date),
      {
        stockScope: undefined,
      },
    );
    expect(
      stockScopeCompatibilityService.listRealStockScopeIds,
    ).toHaveBeenCalled();
  });

  it("should summarize inventory by material category", async () => {
    repository.findInventoryBalanceSnapshots.mockResolvedValue([
      {
        id: 1,
        quantityOnHand: new Prisma.Decimal("10"),
        updatedAt: new Date("2026-03-15T00:00:00Z"),
        stockScope: {
          id: 1,
          scopeCode: "MAIN",
          scopeName: "主仓",
        },
        material: {
          id: 11,
          materialCode: "MAT-01",
          materialName: "A",
          specModel: null,
          unitCode: "PCS",
          warningMinQty: new Prisma.Decimal("20"),
          warningMaxQty: null,
          category: {
            id: 100,
            categoryCode: "CAT-A",
            categoryName: "类别A",
          },
        },
      },
      {
        id: 2,
        quantityOnHand: new Prisma.Decimal("5"),
        updatedAt: new Date("2026-03-15T00:00:00Z"),
        stockScope: {
          id: 1,
          scopeCode: "MAIN",
          scopeName: "主仓",
        },
        material: {
          id: 12,
          materialCode: "MAT-02",
          materialName: "B",
          specModel: null,
          unitCode: "PCS",
          warningMinQty: null,
          warningMaxQty: null,
          category: {
            id: 100,
            categoryCode: "CAT-A",
            categoryName: "类别A",
          },
        },
      },
    ]);
    repository.summarizeInventoryValueByBalance.mockResolvedValue([
      {
        materialId: 11,
        stockScopeId: 1,
        inventoryValue: new Prisma.Decimal("100.00"),
      },
      {
        materialId: 12,
        stockScopeId: 1,
        inventoryValue: new Prisma.Decimal("50.00"),
      },
    ]);

    const result = await service.getMaterialCategorySummary({});

    expect(result.total).toBe(1);
    expect(result.items[0]?.categoryName).toBe("类别A");
    expect(result.items[0]?.materialCount).toBe(2);
    expect(result.items[0]?.inventoryRecordCount).toBe(2);
    expect(result.items[0]?.lowStockCount).toBe(1);
    expect(result.items[0]?.normalStockCount).toBe(0);
    expect(result.items[0]?.aboveMaxStockCount).toBe(0);
    expect(result.items[0]?.unconfiguredStockCount).toBe(1);
    expect(result.items[0]?.totalInventoryValue).toBe("150.0000");
    expect(result.summary.totalInventoryValue).toBe("150.0000");
  });

  it("classifies inventory health at the material and stock-scope grain", async () => {
    const updatedAt = new Date("2026-03-15T00:00:00Z");
    const material = {
      id: 11,
      materialCode: "MAT-01",
      materialName: "A",
      specModel: null,
      unitCode: "PCS",
      warningMinQty: new Prisma.Decimal("3"),
      warningMaxQty: new Prisma.Decimal("10"),
      category: null,
    };
    repository.findInventoryBalanceSnapshots.mockResolvedValue([
      {
        id: 1,
        quantityOnHand: new Prisma.Decimal("2"),
        updatedAt,
        stockScope: { id: 1, scopeCode: "MAIN", scopeName: "主仓" },
        material,
      },
      {
        id: 2,
        quantityOnHand: new Prisma.Decimal("5"),
        updatedAt,
        stockScope: { id: 2, scopeCode: "RD_SUB", scopeName: "研发小仓" },
        material,
      },
      {
        id: 3,
        quantityOnHand: new Prisma.Decimal("11"),
        updatedAt,
        stockScope: { id: 1, scopeCode: "MAIN", scopeName: "主仓" },
        material: { ...material, id: 12, materialCode: "MAT-02" },
      },
      {
        id: 4,
        quantityOnHand: new Prisma.Decimal("1"),
        updatedAt,
        stockScope: { id: 1, scopeCode: "MAIN", scopeName: "主仓" },
        material: {
          ...material,
          id: 13,
          materialCode: "MAT-03",
          warningMinQty: null,
          warningMaxQty: null,
        },
      },
    ]);
    repository.summarizeInventoryValueByBalance.mockResolvedValue([]);

    const result = await service.getInventorySummary({ limit: 10 });

    expect(result.summary).toMatchObject({
      activeMaterialCount: 3,
      inventoryRecordCount: 4,
      lowStockCount: 1,
      normalStockCount: 1,
      aboveMaxStockCount: 1,
      unconfiguredStockCount: 1,
    });
    expect(result.items.map((item) => item.inventoryStatus)).toEqual([
      "LOW",
      "NORMAL",
      "ABOVE_MAX",
      "UNCONFIGURED",
    ]);
    expect(result.items.map((item) => item.isBelowMin)).toEqual([
      true,
      false,
      false,
      false,
    ]);
  });

  it("should honor trend time boundaries and filters", async () => {
    repository.findTrendDocuments.mockResolvedValue([
      {
        sourceType: "INBOUND",
        bizDate: new Date("2026-03-01T00:00:00Z"),
        businessDocumentType: "StockInOrder",
        businessDocumentId: 1,
        totalAmount: new Prisma.Decimal("100"),
        inventoryCostDelta: new Prisma.Decimal("100"),
      },
      {
        sourceType: "SALES",
        bizDate: new Date("2026-03-02T00:00:00Z"),
        businessDocumentType: "SalesStockOrder",
        businessDocumentId: 2,
        totalAmount: new Prisma.Decimal("80"),
        inventoryCostDelta: new Prisma.Decimal("-80"),
      },
    ]);

    const result = await service.getTrendSeries({
      trendType: ReportingTrendType.SALES,
      dateFrom: "2026-03-01",
      dateTo: "2026-03-02",
    });

    expect(repository.findTrendDocuments).toHaveBeenCalledWith({
      dateFrom: new Date("2026-03-01T00:00:00.000Z"),
      dateTo: new Date("2026-03-02T00:00:00.000Z"),
      inventoryStockScopeIds: [1, 2],
      workshopId: undefined,
    });
    expect(
      stockScopeCompatibilityService.listRealStockScopeIds,
    ).toHaveBeenCalled();
    expect(result.items).toHaveLength(1);
    expect(result.items[0]?.trendType).toBe("SALES");
    expect(result.items[0]?.date).toBe("2026-03-02");
    expect(result.items[0]).not.toHaveProperty("totalQty");
    expect(result.summary).toEqual({
      documentCount: 1,
      inventoryCostNetChange: "-80.0000",
    });
  });

  it("should return RD_PROJECT trend queries without aliases", async () => {
    repository.findTrendDocuments.mockResolvedValue([
      {
        sourceType: "RD_PROJECT",
        bizDate: new Date("2026-03-02T00:00:00Z"),
        businessDocumentType: "RdProjectMaterialAction",
        businessDocumentId: 3,
        totalAmount: new Prisma.Decimal("30"),
        inventoryCostDelta: new Prisma.Decimal("-30"),
      },
    ]);

    const result = await service.getTrendSeries({
      trendType: ReportingTrendType.RD_PROJECT,
      dateFrom: "2026-03-01",
      dateTo: "2026-03-02",
    });

    expect(result.items).toHaveLength(1);
    expect(result.items[0]?.trendType).toBe("RD_PROJECT");
    expect(result.items[0]?.date).toBe("2026-03-02");
  });

  it("deduplicates trend documents and expands the legacy RD filter", async () => {
    repository.findTrendDocuments.mockResolvedValue([
      {
        sourceType: "RD_HANDOFF",
        bizDate: new Date("2026-03-02T00:00:00Z"),
        businessDocumentType: "RdHandoffOrder",
        businessDocumentId: 10,
        totalAmount: new Prisma.Decimal("-50"),
        inventoryCostDelta: new Prisma.Decimal("-50"),
      },
      {
        sourceType: "RD_HANDOFF",
        bizDate: new Date("2026-03-02T00:00:00Z"),
        businessDocumentType: "RdHandoffOrder",
        businessDocumentId: 10,
        totalAmount: new Prisma.Decimal("50"),
        inventoryCostDelta: new Prisma.Decimal("50"),
      },
      {
        sourceType: "RD_STOCKTAKE_GAIN",
        bizDate: new Date("2026-03-02T00:00:00Z"),
        businessDocumentType: "RdStocktakeOrder",
        businessDocumentId: 10,
        totalAmount: new Prisma.Decimal("3"),
        inventoryCostDelta: new Prisma.Decimal("3"),
      },
    ]);

    const result = await service.getTrendSeries({
      trendType: ReportingTrendType.RD,
      dateFrom: "2026-03-02",
      dateTo: "2026-03-02",
    });

    expect(result.items).toEqual([
      {
        date: "2026-03-02",
        trendType: "RD_HANDOFF",
        documentCount: 1,
        totalAmount: "0.0000",
      },
      {
        date: "2026-03-02",
        trendType: "RD_STOCKTAKE_GAIN",
        documentCount: 1,
        totalAmount: "3.0000",
      },
    ]);
    expect(result.summary).toEqual({
      documentCount: 2,
      inventoryCostNetChange: "3.0000",
    });
  });

  it("keeps trend financial summaries exact beyond JavaScript Number precision", async () => {
    repository.findTrendDocuments.mockResolvedValue([
      {
        sourceType: "INBOUND",
        bizDate: new Date("2026-03-02T00:00:00Z"),
        businessDocumentType: "StockInOrder",
        businessDocumentId: 1,
        totalAmount: new Prisma.Decimal("99999999999999.9900"),
        inventoryCostDelta: new Prisma.Decimal("99999999999999.9900"),
      },
      {
        sourceType: "INBOUND",
        bizDate: new Date("2026-03-02T00:00:00Z"),
        businessDocumentType: "StockInOrder",
        businessDocumentId: 2,
        totalAmount: new Prisma.Decimal("0.0001"),
        inventoryCostDelta: new Prisma.Decimal("0.0001"),
      },
    ]);

    const result = await service.getTrendSeries({
      dateFrom: "2026-03-02",
      dateTo: "2026-03-02",
    });

    expect(result.items[0]?.totalAmount).toBe("99999999999999.9901");
    expect(result.summary.inventoryCostNetChange).toBe("99999999999999.9901");
  });

  it("should build export payload structure", async () => {
    repository.findInventoryBalanceSnapshots.mockResolvedValue([
      {
        id: 1,
        quantityOnHand: new Prisma.Decimal("12"),
        updatedAt: new Date("2026-03-15T00:00:00Z"),
        stockScope: {
          id: 1,
          scopeCode: "MAIN",
          scopeName: "主仓",
        },
        material: {
          id: 11,
          materialCode: "MAT-01",
          materialName: "A",
          specModel: null,
          unitCode: "PCS",
          warningMinQty: null,
          warningMaxQty: null,
          category: null,
        },
      },
    ]);
    repository.summarizeInventoryValueByBalance.mockResolvedValue([
      {
        materialId: 11,
        stockScopeId: 1,
        inventoryValue: new Prisma.Decimal("96.00"),
      },
    ]);

    const result = await service.exportReport({
      reportType: ReportingExportType.INVENTORY_SUMMARY,
    });

    expect(result.fileName).toContain("inventory_summary");
    expect(result.contentType).toContain("text/csv");
    expect(result.content).toContain("materialCode");
    expect(result.content).toContain("MAT-01");
    expect(result.content).toContain("inventoryValue");
    expect(result.content).toContain("inventoryStatus");
    expect(result.content).toContain("UNCONFIGURED");
    expect(result.content).toContain("96.00");
  });

  it("exports trend CSV without cross-material quantities", async () => {
    repository.findTrendDocuments.mockResolvedValue([
      {
        sourceType: "WORKSHOP_MATERIAL",
        bizDate: new Date("2026-03-02T00:00:00Z"),
        businessDocumentType: "WorkshopMaterialOrder",
        businessDocumentId: 21,
        totalAmount: new Prisma.Decimal("12.34"),
        inventoryCostDelta: new Prisma.Decimal("-12.34"),
      },
    ]);

    const result = await service.exportReport({
      reportType: ReportingExportType.TRENDS,
      workshopId: 9,
      dateFrom: "2026-03-02",
      dateTo: "2026-03-02",
    });

    expect(result.content).toContain(
      "date,trendType,documentCount,totalAmount",
    );
    expect(result.content).not.toContain("totalQty");
    expect(repository.findTrendDocuments).toHaveBeenCalledWith(
      expect.objectContaining({ workshopId: 9 }),
    );
  });
});
