import { Test } from "@nestjs/testing";
import {
  InventoryOperationType,
  Prisma,
  SourceUsageStatus,
  StockDirection,
} from "../../../../generated/prisma/client";
import { PrismaService } from "../../../shared/prisma/prisma.service";
import { MasterDataService } from "../../master-data/application/master-data.service";
import { FactoryNumberRepository } from "../infrastructure/factory-number.repository";
import { InventoryRepository } from "../infrastructure/inventory.repository";
import { InventoryService } from "./inventory.service";
import { StockScopeCompatibilityService } from "./stock-scope-compatibility.service";

describe("InventoryService", () => {
  const mockBalance = {
    id: 1,
    materialId: 10,
    quantityOnHand: 100,
    rowVersion: 0,
    createdBy: null,
    createdAt: new Date(),
    updatedBy: null,
    updatedAt: new Date(),
  };

  const mockLog = {
    id: 1,
    balanceId: 1,
    materialId: 10,
    workshopId: 20,
    bizDate: new Date("2026-04-09"),
    direction: StockDirection.IN,
    operationType: InventoryOperationType.ACCEPTANCE_IN,
    businessModule: "inbound",
    businessDocumentType: "StockInOrder",
    businessDocumentId: 100,
    businessDocumentNumber: "SI-001",
    businessDocumentLineId: null,
    changeQty: 50,
    beforeQty: 100,
    afterQty: 150,
    operatorId: "1",
    occurredAt: new Date(),
    reversalOfLogId: null,
    idempotencyKey: "test-key-1",
    note: null,
  };

  const _mockSourceUsage = {
    id: 10,
    materialId: 10,
    sourceLogId: 1,
    consumerDocumentType: "WorkshopMaterialOrder",
    consumerDocumentId: 300,
    consumerLineId: 1,
    allocatedQty: 30,
    releasedQty: 0,
    status: SourceUsageStatus.ALLOCATED,
    createdBy: "1",
    createdAt: new Date(),
    updatedBy: "1",
    updatedAt: new Date(),
  };

  const createStockScopeCompatibilityServiceMock = () => ({
    resolveRequired: jest
      .fn()
      .mockImplementation(async ({ stockScope, workshopId }) => ({
        stockScope: stockScope ?? "MAIN",
        stockScopeId: 1,
        workshopId: workshopId ?? 20,
        workshopCode: stockScope === "RD_SUB" ? "RD" : "MAIN",
        workshopName: stockScope === "RD_SUB" ? "研发小仓" : "主仓",
      })),
    resolveOptional: jest
      .fn()
      .mockImplementation(async ({ stockScope, workshopId }) => {
        if (!stockScope && !workshopId) {
          return null;
        }

        return {
          stockScope: stockScope ?? "MAIN",
          stockScopeId: 1,
          workshopId: workshopId ?? 20,
          workshopCode: stockScope === "RD_SUB" ? "RD" : "MAIN",
          workshopName: stockScope === "RD_SUB" ? "研发小仓" : "主仓",
        };
      }),
    listRealStockWorkshopIds: jest.fn().mockResolvedValue([20]),
    resolveByStockScope: jest.fn(),
    resolveByWorkshopId: jest.fn(),
  });
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

  // ─── increaseStock with cost fields ─────────────────────────────────────

  it("should persist unitCost and costAmount on IN log when provided", async () => {
    const mockTx = {
      inventoryBalance: {
        findUnique: jest.fn().mockResolvedValue(mockBalance),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      inventoryLog: {
        create: jest
          .fn()
          .mockImplementation(
            (args: {
              data: { unitCost?: Prisma.Decimal; costAmount?: Prisma.Decimal };
            }) => ({
              ...mockLog,
              id: 2,
              unitCost: args.data.unitCost ?? null,
              costAmount: args.data.costAmount ?? null,
            }),
          ),
      },
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        InventoryService,
        {
          provide: MasterDataService,
          useValue: {
            getMaterialById: jest.fn().mockResolvedValue({ id: 10 }),
            getWorkshopById: jest.fn().mockResolvedValue({ id: 20 }),
          },
        },
        {
          provide: PrismaService,
          useValue: {
            runInTransaction: jest.fn(
              (handler: (tx: unknown) => Promise<unknown>) => handler(mockTx),
            ),
          },
        },
        {
          provide: InventoryRepository,
          useValue: {
            runInTransaction: jest.fn((_tx, handler) => handler(mockTx)),
            findLogByIdempotencyKey: jest.fn().mockResolvedValue(null),
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
    const log = await service.increaseStock({
      materialId: 10,
      workshopId: 20,
      bizDate: new Date("2026-04-09"),
      quantity: 50,
      operationType: InventoryOperationType.ACCEPTANCE_IN,
      businessModule: "inbound",
      businessDocumentType: "StockInOrder",
      businessDocumentId: 100,
      businessDocumentNumber: "SI-001",
      idempotencyKey: "cost-test-1",
      unitCost: 10,
      costAmount: 500,
    });

    expect(log.unitCost).toBeDefined();
    expect(Number(log.unitCost)).toBe(10);
    expect(Number(log.costAmount)).toBe(500);
  });

  // ─── hasUnreleasedAllocations ────────────────────────────────────────────

  it("should return true when source log has unreleased allocations", async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        InventoryService,
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
            runInTransaction: jest.fn((_tx, handler) => handler({})),
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
            runInTransaction: jest.fn((_tx, handler) => handler({})),
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
            runInTransaction: jest.fn((_tx, handler) => handler({})),
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
});
