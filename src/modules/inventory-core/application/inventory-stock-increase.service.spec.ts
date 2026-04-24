import { ConflictException } from "@nestjs/common";
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
  it("should create inventory log on increaseStock", async () => {
    const mockTx = {
      inventoryBalance: {
        findUnique: jest.fn().mockResolvedValue(mockBalance),
        create: jest.fn().mockResolvedValue(mockBalance),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      inventoryLog: {
        create: jest.fn().mockResolvedValue(mockLog),
        findFirst: jest.fn().mockResolvedValue(null),
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
            runInTransaction: jest.fn((_tx, handler) => handler(mockTx)),
          },
        },
        {
          provide: InventoryRepository,
          useValue: {
            runInTransaction: jest.fn((_tx, handler) => handler(mockTx)),
            findLogByIdempotencyKey: jest.fn().mockResolvedValue(null),
            findLogById: jest.fn(),
            findReversalLogBySourceLogId: jest.fn(),
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
      idempotencyKey: "test-key-1",
      operatorId: "1",
    });

    expect(log).toBeDefined();
    expect(log.direction).toBe(StockDirection.IN);
    expect(Number(log.changeQty)).toBe(50);
    expect(Number(log.beforeQty)).toBe(100);
    expect(Number(log.afterQty)).toBe(150);
  });

  it("should throw when increaseStock loses optimistic lock on balance update", async () => {
    const mockTx = {
      inventoryBalance: {
        findUnique: jest.fn().mockResolvedValue(mockBalance),
        create: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      inventoryLog: {
        create: jest.fn().mockResolvedValue(mockLog),
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
            runInTransaction: jest.fn((_tx, handler) => handler(mockTx)),
          },
        },
        {
          provide: InventoryRepository,
          useValue: {
            runInTransaction: jest.fn((_tx, handler) => handler(mockTx)),
            findLogByIdempotencyKey: jest.fn().mockResolvedValue(null),
            findLogById: jest.fn(),
            findReversalLogBySourceLogId: jest.fn(),
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

    await expect(
      service.increaseStock({
        materialId: 10,
        workshopId: 20,
        bizDate: new Date("2026-04-09"),
        quantity: 50,
        operationType: InventoryOperationType.ACCEPTANCE_IN,
        businessModule: "inbound",
        businessDocumentType: "StockInOrder",
        businessDocumentId: 100,
        businessDocumentNumber: "SI-001",
        idempotencyKey: "optimistic-lock-fail-1",
        operatorId: "1",
      }),
    ).rejects.toThrow(ConflictException);
  });

  it("should recover from concurrent first-balance creation before applying optimistic update", async () => {
    const duplicateBalanceError = new Prisma.PrismaClientKnownRequestError(
      "duplicate",
      {
        code: "P2002",
        clientVersion: "test",
      },
    );
    const zeroBalance = {
      ...mockBalance,
      quantityOnHand: new Prisma.Decimal(0),
      rowVersion: 0,
    };
    const createdLog = {
      ...mockLog,
      beforeQty: new Prisma.Decimal(0),
      afterQty: new Prisma.Decimal(50),
    };
    const mockTx = {
      inventoryBalance: {
        findUnique: jest
          .fn()
          .mockResolvedValueOnce(null)
          .mockResolvedValueOnce(zeroBalance),
        create: jest.fn().mockRejectedValueOnce(duplicateBalanceError),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      inventoryLog: {
        create: jest.fn().mockResolvedValue(createdLog),
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
            runInTransaction: jest.fn((_tx, handler) => handler(mockTx)),
          },
        },
        {
          provide: InventoryRepository,
          useValue: {
            runInTransaction: jest.fn((_tx, handler) => handler(mockTx)),
            findLogByIdempotencyKey: jest.fn().mockResolvedValue(null),
            findLogById: jest.fn(),
            findReversalLogBySourceLogId: jest.fn(),
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
      idempotencyKey: "optimistic-lock-create-race-1",
      operatorId: "1",
    });

    expect(log).toEqual(createdLog);
    expect(mockTx.inventoryBalance.findUnique).toHaveBeenCalledTimes(2);
    expect(mockTx.inventoryBalance.create).toHaveBeenCalledTimes(1);
    expect(mockTx.inventoryBalance.updateMany).toHaveBeenCalledWith({
      where: { id: zeroBalance.id, rowVersion: zeroBalance.rowVersion },
      data: {
        quantityOnHand: new Prisma.Decimal(50),
        rowVersion: { increment: 1 },
        updatedBy: "1",
      },
    });
  });

  it("should return existing log when idempotencyKey is duplicated", async () => {
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
          useValue: { runInTransaction: jest.fn() },
        },
        {
          provide: InventoryRepository,
          useValue: {
            runInTransaction: jest.fn((_tx, handler) => handler({})),
            findLogByIdempotencyKey: jest.fn().mockResolvedValue(mockLog),
            findLogById: jest.fn(),
            findReversalLogBySourceLogId: jest.fn(),
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
      idempotencyKey: "dup-key",
      operatorId: "1",
    });

    expect(log).toEqual(mockLog);
  });
});
