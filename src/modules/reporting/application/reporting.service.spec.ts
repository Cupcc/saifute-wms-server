import { Test } from "@nestjs/testing";
import { Prisma } from "../../../../generated/prisma/client";
import { AppConfigService } from "../../../shared/config/app-config.service";
import { StockScopeCompatibilityService } from "../../inventory-core/application/stock-scope-compatibility.service";
import {
  ReportingExportType,
  ReportingTrendType,
} from "../dto/query-reporting.dto";
import { ReportingRepository } from "../infrastructure/reporting.repository";
import { ReportingService } from "./reporting.service";

describe("ReportingService", () => {
  let service: ReportingService;
  let repository: jest.Mocked<ReportingRepository>;
  let stockScopeCompatibilityService: jest.Mocked<StockScopeCompatibilityService>;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        ReportingService,
        {
          provide: ReportingRepository,
          useValue: {
            getHomeMetrics: jest.fn(),
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
    repository = moduleRef.get(ReportingRepository);
    stockScopeCompatibilityService = moduleRef.get(
      StockScopeCompatibilityService,
    );
  });

  it("should build the home dashboard metrics", async () => {
    repository.getHomeMetrics.mockResolvedValue({
      inboundTodayCount: 4,
      outboundTodayCount: 1,
      workshopMaterialTodayCount: 2,
      inboundTotalQty: new Prisma.Decimal("200"),
      inboundTotalAmount: new Prisma.Decimal("1200.50"),
      outboundTotalQty: new Prisma.Decimal("50"),
      outboundTotalAmount: new Prisma.Decimal("500.00"),
      workshopMaterialTotalQty: new Prisma.Decimal("30"),
      workshopMaterialTotalAmount: new Prisma.Decimal("90.00"),
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
    expect(result.inventory.totalInventoryValue).toBe("100.50");
    expect(result.todayDocuments.inboundCount).toBe(4);
    expect(result.cumulativeDocuments.inbound.totalAmount).toBe("1200.50");
    expect(repository.getHomeMetrics).toHaveBeenCalledWith(
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
    expect(result.items[0]?.totalInventoryValue).toBe("150.00");
    expect(result.summary.totalInventoryValue).toBe("150.00");
  });

  it("should honor trend time boundaries and filters", async () => {
    repository.findTrendDocuments.mockResolvedValue([
      {
        sourceType: "INBOUND",
        bizDate: new Date("2026-03-01T00:00:00Z"),
        totalQty: new Prisma.Decimal("10"),
        totalAmount: new Prisma.Decimal("100"),
      },
      {
        sourceType: "SALES",
        bizDate: new Date("2026-03-02T00:00:00Z"),
        totalQty: new Prisma.Decimal("8"),
        totalAmount: new Prisma.Decimal("80"),
      },
    ]);

    const result = await service.getTrendSeries({
      trendType: ReportingTrendType.SALES,
      dateFrom: "2026-03-01",
      dateTo: "2026-03-02",
    });

    expect(repository.findTrendDocuments).toHaveBeenCalledWith({
      dateFrom: new Date("2026-02-28T16:00:00.000Z"),
      dateTo: new Date("2026-03-02T15:59:59.999Z"),
      inventoryStockScopeIds: [1, 2],
    });
    expect(
      stockScopeCompatibilityService.listRealStockScopeIds,
    ).toHaveBeenCalled();
    expect(result.items).toHaveLength(1);
    expect(result.items[0]?.trendType).toBe("SALES");
    expect(result.items[0]?.date).toBe("2026-03-02");
  });

  it("should return RD_PROJECT trend queries without aliases", async () => {
    repository.findTrendDocuments.mockResolvedValue([
      {
        sourceType: "RD_PROJECT",
        bizDate: new Date("2026-03-02T00:00:00Z"),
        totalQty: new Prisma.Decimal("3"),
        totalAmount: new Prisma.Decimal("30"),
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
    expect(result.content).toContain("96.00");
  });
});
