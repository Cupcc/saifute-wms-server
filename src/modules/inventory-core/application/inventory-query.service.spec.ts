import { Test } from "@nestjs/testing";
import { Prisma } from "../../../../generated/prisma/client";
import { PrismaService } from "../../../shared/prisma/prisma.service";
import { MasterDataService } from "../../master-data/application/master-data.service";
import { FactoryNumberRepository } from "../infrastructure/factory-number.repository";
import { InventoryRepository } from "../infrastructure/inventory.repository";
import { InventoryService } from "./inventory.service";
import { createStockScopeCompatibilityServiceMock } from "./inventory.spec-helpers";
import { InventoryQueryService } from "./inventory-query.service";
import { StockScopeCompatibilityService } from "./stock-scope-compatibility.service";

describe("InventoryService", () => {
  it("should aggregate available quantity by price layer", async () => {
    const repositoryMock = {
      findFifoSourceLogs: jest.fn().mockResolvedValue([
        {
          id: 50,
          changeQty: new Prisma.Decimal(10),
          occurredAt: new Date(),
          unitCost: new Prisma.Decimal(10),
          availableQty: new Prisma.Decimal(4),
        },
        {
          id: 51,
          changeQty: new Prisma.Decimal(10),
          occurredAt: new Date(),
          unitCost: new Prisma.Decimal(10),
          availableQty: new Prisma.Decimal(6),
        },
        {
          id: 52,
          changeQty: new Prisma.Decimal(10),
          occurredAt: new Date(),
          unitCost: new Prisma.Decimal(12),
          availableQty: new Prisma.Decimal(8),
        },
      ]),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        InventoryService,
        InventoryQueryService,
        {
          provide: MasterDataService,
          useValue: {
            getMaterialById: jest.fn().mockResolvedValue({ id: 10 }),
            getWorkshopById: jest.fn().mockResolvedValue({ id: 20 }),
          },
        },
        {
          provide: PrismaService,
          useValue: {},
        },
        {
          provide: InventoryRepository,
          useValue: repositoryMock,
        },
        {
          provide: FactoryNumberRepository,
          useValue: {},
        },
        {
          provide: StockScopeCompatibilityService,
          useFactory: createStockScopeCompatibilityServiceMock,
        },
      ],
    }).compile();

    const service = moduleRef.get(InventoryService);
    const result = await service.listPriceLayerAvailability({
      materialId: 10,
      workshopId: 20,
    });

    expect(result).toHaveLength(2);
    expect(result[0].unitCost.toString()).toBe("10");
    expect(result[0].availableQty.toString()).toBe("10");
    expect(result[0].sourceLogCount).toBe(2);
    expect(result[1].unitCost.toString()).toBe("12");
    expect(result[1].availableQty.toString()).toBe("8");
  });

  // ─── hasUnreleasedAllocations ────────────────────────────────────────────

  it("should return true when source log has unreleased allocations", async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        InventoryService,
        InventoryQueryService,
        {
          provide: MasterDataService,
          useValue: {},
        },
        {
          provide: PrismaService,
          useValue: {},
        },
        {
          provide: InventoryRepository,
          useValue: {
            getSourceUsageTotals: jest.fn().mockResolvedValue({
              allocatedQty: new Prisma.Decimal(30),
              releasedQty: new Prisma.Decimal(10),
            }),
          },
        },
        {
          provide: FactoryNumberRepository,
          useValue: {},
        },
        {
          provide: StockScopeCompatibilityService,
          useFactory: createStockScopeCompatibilityServiceMock,
        },
      ],
    }).compile();

    const service = moduleRef.get(InventoryService);
    const result = await service.hasUnreleasedAllocations(1);
    expect(result).toBe(true);
  });

  it("should return false when source log has no unreleased allocations", async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        InventoryService,
        InventoryQueryService,
        {
          provide: MasterDataService,
          useValue: {},
        },
        {
          provide: PrismaService,
          useValue: {},
        },
        {
          provide: InventoryRepository,
          useValue: {
            getSourceUsageTotals: jest.fn().mockResolvedValue({
              allocatedQty: new Prisma.Decimal(30),
              releasedQty: new Prisma.Decimal(30),
            }),
          },
        },
        {
          provide: FactoryNumberRepository,
          useValue: {},
        },
        {
          provide: StockScopeCompatibilityService,
          useFactory: createStockScopeCompatibilityServiceMock,
        },
      ],
    }).compile();

    const service = moduleRef.get(InventoryService);
    const result = await service.hasUnreleasedAllocations(1);
    expect(result).toBe(false);
  });

  it("should constrain source usages by resolved inventory stock scope", async () => {
    const findSourceUsages = jest
      .fn()
      .mockResolvedValue({ items: [], total: 0 });

    const moduleRef = await Test.createTestingModule({
      providers: [
        InventoryService,
        InventoryQueryService,
        {
          provide: MasterDataService,
          useValue: {},
        },
        {
          provide: PrismaService,
          useValue: {},
        },
        {
          provide: InventoryRepository,
          useValue: {
            findSourceUsages,
          },
        },
        {
          provide: FactoryNumberRepository,
          useValue: {},
        },
        {
          provide: StockScopeCompatibilityService,
          useValue: {
            ...createStockScopeCompatibilityServiceMock(),
            resolveOptional: jest.fn().mockResolvedValue({
              stockScope: "RD_SUB",
              stockScopeId: 2,
              stockScopeName: "研发小仓",
            }),
          },
        },
      ],
    }).compile();

    const service = moduleRef.get(InventoryService);

    await service.listSourceUsages({
      stockScope: "RD_SUB",
      materialId: 10,
      limit: 20,
      offset: 5,
    });

    expect(findSourceUsages).toHaveBeenCalledWith(
      {
        materialId: 10,
        stockScopeIds: [2],
        consumerDocumentType: undefined,
        consumerDocumentId: undefined,
        limit: 20,
        offset: 5,
      },
      undefined,
    );
  });

  it("should pass inventory balance filters to repository", async () => {
    const findBalances = jest.fn().mockResolvedValue({
      items: [
        {
          id: 1,
          materialId: 10,
          quantityOnHand: new Prisma.Decimal(5),
          stockScope: {
            id: 2,
            scopeCode: "RD_SUB",
            scopeName: "研发小仓",
          },
        },
      ],
      total: 1,
    });

    const moduleRef = await Test.createTestingModule({
      providers: [
        InventoryService,
        InventoryQueryService,
        {
          provide: MasterDataService,
          useValue: {},
        },
        {
          provide: PrismaService,
          useValue: {},
        },
        {
          provide: InventoryRepository,
          useValue: {
            findBalances,
          },
        },
        {
          provide: FactoryNumberRepository,
          useValue: {},
        },
        {
          provide: StockScopeCompatibilityService,
          useValue: {
            ...createStockScopeCompatibilityServiceMock(),
            resolveOptional: jest.fn().mockResolvedValue({
              stockScope: "RD_SUB",
              stockScopeId: 2,
              stockScopeName: "研发小仓",
            }),
          },
        },
      ],
    }).compile();

    const service = moduleRef.get(InventoryService);

    const result = await service.listBalances({
      stockScope: "RD_SUB",
      materialId: 10,
      keyword: "电阻",
      categoryIds: [3, 4],
      limit: 20,
      offset: 5,
    });

    expect(findBalances).toHaveBeenCalledWith({
      materialId: 10,
      stockScopeIds: [2],
      keyword: "电阻",
      categoryIds: [3, 4],
      limit: 20,
      offset: 5,
    });
    expect(result).toEqual({
      items: [
        expect.objectContaining({
          id: 1,
          stockScope: "RD_SUB",
        }),
      ],
      total: 1,
    });
  });
});
