import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from "@nestjs/common";
import { Test } from "@nestjs/testing";
import {
  InventoryOperationType,
  Prisma,
  SourceUsageStatus,
  StockDirection,
} from "../../../../generated/prisma/client";
import { PrismaService } from "../../../shared/prisma/prisma.service";
import { MasterDataService } from "../../master-data/application/master-data.service";
import { InventoryRepository } from "../infrastructure/inventory.repository";
import { FactoryNumberRepository } from "../infrastructure/factory-number.repository";
import {
  FIFO_SOURCE_OPERATION_TYPES,
  InventoryService,
} from "./inventory.service";
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

  const mockSourceUsage = {
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

  it("should treat PRICE_CORRECTION_IN as a FIFO source operation type", () => {
    expect(FIFO_SOURCE_OPERATION_TYPES).toContain(
      InventoryOperationType.PRICE_CORRECTION_IN,
    );
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
            runInTransaction: jest.fn((handler) => handler(mockTx)),
          },
        },
        {
          provide: InventoryRepository,
          useValue: {
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
            runInTransaction: jest.fn((handler) => handler(mockTx)),
          },
        },
        {
          provide: InventoryRepository,
          useValue: {
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
            runInTransaction: jest.fn((handler) => handler(mockTx)),
          },
        },
        {
          provide: InventoryRepository,
          useValue: {
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

  it("should throw when decreaseStock has insufficient balance", async () => {
    const mockTx = {
      inventoryBalance: {
        findUnique: jest.fn().mockResolvedValue({
          ...mockBalance,
          quantityOnHand: 10,
        }),
        updateMany: jest.fn(),
      },
      inventoryLog: {
        create: jest.fn(),
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
            runInTransaction: jest.fn((handler) => handler(mockTx)),
          },
        },
        {
          provide: InventoryRepository,
          useValue: {
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
      service.decreaseStock({
        materialId: 10,
        workshopId: 20,
        bizDate: new Date("2026-04-09"),
        quantity: 50,
        operationType: InventoryOperationType.OUTBOUND_OUT,
        businessModule: "sales",
        businessDocumentType: "SalesStockOrder",
        businessDocumentId: 200,
        businessDocumentNumber: "CS-001",
        idempotencyKey: "decrease-key",
        operatorId: "1",
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it("should throw when reverseStock log not found", async () => {
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
            findLogByIdempotencyKey: jest.fn().mockResolvedValue(null),
            findLogById: jest.fn().mockResolvedValue(null),
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
      service.reverseStock({
        logIdToReverse: 999,
        idempotencyKey: "reverse-key",
      }),
    ).rejects.toThrow(NotFoundException);
  });

  it("should create a reversal log on reverseStock", async () => {
    const reversedLog = {
      ...mockLog,
      id: 2,
      direction: StockDirection.OUT,
      operationType: InventoryOperationType.REVERSAL_OUT,
      beforeQty: 150,
      afterQty: 100,
      reversalOfLogId: 1,
      idempotencyKey: "reverse-key",
      note: "逆操作: 原流水 1",
    };
    const mockTx = {
      inventoryBalance: {
        findUnique: jest.fn().mockResolvedValue({
          ...mockBalance,
          quantityOnHand: 150,
        }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      inventoryLog: {
        create: jest.fn().mockResolvedValue(reversedLog),
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
            runInTransaction: jest.fn((handler) => handler(mockTx)),
          },
        },
        {
          provide: InventoryRepository,
          useValue: {
            lockSourceLog: jest.fn().mockResolvedValue(undefined),
            findLogByIdempotencyKey: jest.fn().mockResolvedValue(null),
            findLogById: jest.fn().mockResolvedValue(mockLog),
            findReversalLogBySourceLogId: jest.fn().mockResolvedValue(null),
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
    const result = await service.reverseStock({
      logIdToReverse: 1,
      idempotencyKey: "reverse-key",
    });

    expect(result.direction).toBe(StockDirection.OUT);
    expect(result.operationType).toBe(InventoryOperationType.REVERSAL_OUT);
    expect(Number(result.beforeQty)).toBe(150);
    expect(Number(result.afterQty)).toBe(100);
    expect(result.reversalOfLogId).toBe(1);
  });

  it("should allocate inventory source usage from an inbound log", async () => {
    const createdUsage = {
      ...mockSourceUsage,
      allocatedQty: 20,
      releasedQty: 0,
      status: SourceUsageStatus.ALLOCATED,
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
            runInTransaction: jest.fn((handler) => handler({})),
          },
        },
        {
          provide: InventoryRepository,
          useValue: {
            lockSourceLog: jest.fn().mockResolvedValue(undefined),
            findLogByIdempotencyKey: jest.fn().mockResolvedValue(null),
            findLogById: jest.fn().mockResolvedValue(mockLog),
            findReversalLogBySourceLogId: jest.fn().mockResolvedValue(null),
            findSourceUsage: jest.fn().mockResolvedValue(null),
            getSourceUsageTotals: jest.fn().mockResolvedValue({
              allocatedQty: new Prisma.Decimal(0),
              releasedQty: new Prisma.Decimal(0),
            }),
            createSourceUsage: jest.fn().mockResolvedValue(createdUsage),
            updateSourceUsage: jest.fn(),
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
    const result = await service.allocateInventorySource({
      sourceLogId: 1,
      consumerDocumentType: "WorkshopMaterialOrder",
      consumerDocumentId: 300,
      consumerLineId: 1,
      targetAllocatedQty: "20",
      operatorId: "1",
    });

    expect(result.status).toBe(SourceUsageStatus.ALLOCATED);
    expect(Number(result.allocatedQty)).toBe(20);
    expect(Number(result.releasedQty)).toBe(0);
  });

  it("should throw when allocated source quantity exceeds remaining available", async () => {
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
            runInTransaction: jest.fn((handler) => handler({})),
          },
        },
        {
          provide: InventoryRepository,
          useValue: {
            lockSourceLog: jest.fn().mockResolvedValue(undefined),
            findLogByIdempotencyKey: jest.fn().mockResolvedValue(null),
            findLogById: jest.fn().mockResolvedValue(mockLog),
            findReversalLogBySourceLogId: jest.fn().mockResolvedValue(null),
            findSourceUsage: jest.fn().mockResolvedValue(null),
            getSourceUsageTotals: jest.fn().mockResolvedValue({
              allocatedQty: new Prisma.Decimal(45),
              releasedQty: new Prisma.Decimal(5),
            }),
            createSourceUsage: jest.fn(),
            updateSourceUsage: jest.fn(),
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
      service.allocateInventorySource({
        sourceLogId: 1,
        consumerDocumentType: "WorkshopMaterialOrder",
        consumerDocumentId: 300,
        consumerLineId: 1,
        targetAllocatedQty: 15,
        operatorId: "1",
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it("should update an existing source usage to the requested total allocation", async () => {
    const updatedUsage = {
      ...mockSourceUsage,
      allocatedQty: 35,
      releasedQty: 5,
      status: SourceUsageStatus.PARTIALLY_RELEASED,
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
            runInTransaction: jest.fn((handler) => handler({})),
          },
        },
        {
          provide: InventoryRepository,
          useValue: {
            lockSourceLog: jest.fn().mockResolvedValue(undefined),
            findLogByIdempotencyKey: jest.fn().mockResolvedValue(null),
            findLogById: jest.fn().mockResolvedValue(mockLog),
            findReversalLogBySourceLogId: jest.fn().mockResolvedValue(null),
            findSourceUsage: jest.fn().mockResolvedValue({
              ...mockSourceUsage,
              releasedQty: 5,
              status: SourceUsageStatus.PARTIALLY_RELEASED,
            }),
            getSourceUsageTotals: jest.fn().mockResolvedValue({
              allocatedQty: new Prisma.Decimal(30),
              releasedQty: new Prisma.Decimal(5),
            }),
            createSourceUsage: jest.fn(),
            updateSourceUsage: jest.fn().mockResolvedValue(updatedUsage),
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
    const result = await service.allocateInventorySource({
      sourceLogId: 1,
      consumerDocumentType: "WorkshopMaterialOrder",
      consumerDocumentId: 300,
      consumerLineId: 1,
      targetAllocatedQty: 35,
      operatorId: "1",
    });

    expect(Number(result.allocatedQty)).toBe(35);
    expect(result.status).toBe(SourceUsageStatus.PARTIALLY_RELEASED);
  });

  it("should release allocated inventory source usage and update status", async () => {
    const partiallyReleasedUsage = {
      ...mockSourceUsage,
      releasedQty: 10,
      status: SourceUsageStatus.PARTIALLY_RELEASED,
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
            runInTransaction: jest.fn((handler) => handler({})),
          },
        },
        {
          provide: InventoryRepository,
          useValue: {
            lockSourceLog: jest.fn().mockResolvedValue(undefined),
            findLogByIdempotencyKey: jest.fn().mockResolvedValue(null),
            findLogById: jest.fn(),
            findReversalLogBySourceLogId: jest.fn(),
            findSourceUsage: jest.fn().mockResolvedValue(mockSourceUsage),
            getSourceUsageTotals: jest.fn(),
            createSourceUsage: jest.fn(),
            updateSourceUsage: jest
              .fn()
              .mockResolvedValue(partiallyReleasedUsage),
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
    const result = await service.releaseInventorySource({
      sourceLogId: 1,
      consumerDocumentType: "WorkshopMaterialOrder",
      consumerDocumentId: 300,
      consumerLineId: 1,
      targetReleasedQty: 10,
      operatorId: "1",
    });

    expect(result.status).toBe(SourceUsageStatus.PARTIALLY_RELEASED);
    expect(Number(result.releasedQty)).toBe(10);
  });

  it("should fully release allocated inventory source usage", async () => {
    const releasedUsage = {
      ...mockSourceUsage,
      releasedQty: 30,
      status: SourceUsageStatus.RELEASED,
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
            runInTransaction: jest.fn((handler) => handler({})),
          },
        },
        {
          provide: InventoryRepository,
          useValue: {
            lockSourceLog: jest.fn().mockResolvedValue(undefined),
            findLogByIdempotencyKey: jest.fn().mockResolvedValue(null),
            findLogById: jest.fn(),
            findReversalLogBySourceLogId: jest.fn(),
            findSourceUsage: jest.fn().mockResolvedValue(mockSourceUsage),
            getSourceUsageTotals: jest.fn(),
            createSourceUsage: jest.fn(),
            updateSourceUsage: jest.fn().mockResolvedValue(releasedUsage),
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
    const result = await service.releaseInventorySource({
      sourceLogId: 1,
      consumerDocumentType: "WorkshopMaterialOrder",
      consumerDocumentId: 300,
      consumerLineId: 1,
      targetReleasedQty: 30,
      operatorId: "1",
    });

    expect(result.status).toBe(SourceUsageStatus.RELEASED);
    expect(Number(result.releasedQty)).toBe(30);
  });

  it("should allow restoring released inventory source usage back to zero", async () => {
    const restoredUsage = {
      ...mockSourceUsage,
      releasedQty: 0,
      status: SourceUsageStatus.ALLOCATED,
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
            runInTransaction: jest.fn((handler) => handler({})),
          },
        },
        {
          provide: InventoryRepository,
          useValue: {
            lockSourceLog: jest.fn().mockResolvedValue(undefined),
            findLogByIdempotencyKey: jest.fn().mockResolvedValue(null),
            findLogById: jest.fn(),
            findReversalLogBySourceLogId: jest.fn(),
            findSourceUsage: jest.fn().mockResolvedValue({
              ...mockSourceUsage,
              releasedQty: 20,
              status: SourceUsageStatus.PARTIALLY_RELEASED,
            }),
            getSourceUsageTotals: jest.fn(),
            createSourceUsage: jest.fn(),
            updateSourceUsage: jest.fn().mockResolvedValue(restoredUsage),
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
    const result = await service.releaseInventorySource({
      sourceLogId: 1,
      consumerDocumentType: "WorkshopMaterialOrder",
      consumerDocumentId: 300,
      consumerLineId: 1,
      targetReleasedQty: 0,
      operatorId: "1",
    });

    expect(result.status).toBe(SourceUsageStatus.ALLOCATED);
    expect(Number(result.releasedQty)).toBe(0);
  });

  // ─── settleConsumerOut – FIFO & Manual Source ────────────────────────────

  describe("settleConsumerOut", () => {
    const mockSourceLog = {
      ...mockLog,
      id: 50,
      direction: StockDirection.IN,
      operationType: InventoryOperationType.ACCEPTANCE_IN,
      stockScopeId: 1,
      changeQty: new Prisma.Decimal(100),
      unitCost: new Prisma.Decimal(10),
      costAmount: new Prisma.Decimal(1000),
      balanceId: 1,
    };

    const mockOutBalance = {
      ...mockBalance,
      quantityOnHand: new Prisma.Decimal(100),
    };

    const buildServiceForFifo = async (
      overrides: {
        existingLog?: unknown | null;
        fifoLogs?: unknown[];
        sourceLog?: unknown;
        reversalLog?: unknown | null;
        totals?: { allocatedQty: Prisma.Decimal; releasedQty: Prisma.Decimal };
        existingUsage?: unknown | null;
        lineUsages?: unknown[];
        createUsageResult?: unknown;
      } = {},
    ) => {
      const mockTx = {
        inventoryBalance: {
          findUnique: jest.fn().mockResolvedValue(mockOutBalance),
          updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        },
        inventoryLog: {
          create: jest
            .fn()
            .mockImplementation(
              (args: {
                data: { direction: string; changeQty: Prisma.Decimal };
              }) => ({
                id: 99,
                direction: args.data.direction,
                changeQty: args.data.changeQty,
                unitCost: null,
                costAmount: null,
              }),
            ),
        },
        inventorySourceUsage: {
          create: jest.fn().mockResolvedValue({
            id: 200,
            allocatedQty: new Prisma.Decimal(20),
            releasedQty: new Prisma.Decimal(0),
            status: "ALLOCATED",
          }),
          findFirst: jest
            .fn()
            .mockResolvedValue(overrides.existingUsage ?? null),
          findMany: jest.fn().mockResolvedValue([]),
          update: jest.fn().mockResolvedValue({
            id: 200,
            allocatedQty: new Prisma.Decimal(20),
            releasedQty: new Prisma.Decimal(0),
            status: "ALLOCATED",
          }),
        },
        $queryRaw: jest.fn().mockResolvedValue([]),
      };
      const repositoryMock = {
        findLogByIdempotencyKey: jest
          .fn()
          .mockResolvedValue(overrides.existingLog ?? null),
        findLogById: jest
          .fn()
          .mockResolvedValue(overrides.sourceLog ?? mockSourceLog),
        findReversalLogBySourceLogId: jest
          .fn()
          .mockResolvedValue(overrides.reversalLog ?? null),
        getSourceUsageTotals: jest.fn().mockResolvedValue(
          overrides.totals ?? {
            allocatedQty: new Prisma.Decimal(0),
            releasedQty: new Prisma.Decimal(0),
          },
        ),
        findFifoSourceLogs: jest.fn().mockResolvedValue(
          overrides.fifoLogs ?? [
            {
              id: 50,
              changeQty: new Prisma.Decimal(100),
              occurredAt: new Date(),
              unitCost: new Prisma.Decimal(10),
              availableQty: new Prisma.Decimal(100),
            },
          ],
        ),
        findSourceUsage: jest
          .fn()
          .mockResolvedValue(overrides.existingUsage ?? null),
        createSourceUsage: jest.fn().mockResolvedValue({
          id: 200,
          allocatedQty: new Prisma.Decimal(20),
          releasedQty: new Prisma.Decimal(0),
          status: "ALLOCATED",
        }),
        updateSourceUsage: jest.fn().mockResolvedValue({
          id: 200,
          allocatedQty: new Prisma.Decimal(20),
          releasedQty: new Prisma.Decimal(0),
          status: "ALLOCATED",
        }),
        lockSourceLog: jest.fn().mockResolvedValue(undefined),
        findSourceUsages: jest.fn().mockResolvedValue({ items: [], total: 0 }),
        findSourceUsagesForConsumerLine: jest
          .fn()
          .mockResolvedValue(overrides.lineUsages ?? []),
        findActiveSourceUsagesForConsumer: jest.fn().mockResolvedValue([]),
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
      return { service, mockTx, repositoryMock };
    };

    it("should perform FIFO allocation and return settled cost", async () => {
      const { service } = await buildServiceForFifo({
        fifoLogs: [
          {
            id: 50,
            changeQty: new Prisma.Decimal(100),
            occurredAt: new Date(),
            unitCost: new Prisma.Decimal(10),
            availableQty: new Prisma.Decimal(100),
          },
        ],
      });

      const result = await service.settleConsumerOut({
        materialId: 10,
        workshopId: 20,
        bizDate: new Date("2026-04-09"),
        quantity: 20,
        operationType: InventoryOperationType.OUTBOUND_OUT,
        businessModule: "sales",
        businessDocumentType: "SalesStockOrder",
        businessDocumentId: 1,
        businessDocumentNumber: "OB-001",
        businessDocumentLineId: 1,
        consumerLineId: 1,
        idempotencyKey: "fifo-test-1",
        sourceOperationTypes: FIFO_SOURCE_OPERATION_TYPES,
      });

      expect(result).toBeDefined();
      expect(result.allocations).toHaveLength(1);
      expect(result.allocations[0].sourceLogId).toBe(50);
      expect(Number(result.settledUnitCost)).toBe(10);
      expect(Number(result.settledCostAmount)).toBe(200);
    });

    it("should use manual source when sourceLogId is provided", async () => {
      const { service } = await buildServiceForFifo();

      const result = await service.settleConsumerOut({
        materialId: 10,
        workshopId: 20,
        quantity: 20,
        operationType: InventoryOperationType.PICK_OUT,
        businessModule: "workshop",
        businessDocumentType: "WorkshopMaterialOrder",
        businessDocumentId: 5,
        businessDocumentNumber: "WM-001",
        businessDocumentLineId: 10,
        consumerLineId: 10,
        bizDate: new Date("2026-04-09"),
        idempotencyKey: "manual-test-1",
        sourceLogId: 50,
        sourceOperationTypes: FIFO_SOURCE_OPERATION_TYPES,
      });

      expect(result).toBeDefined();
      expect(result.allocations).toHaveLength(1);
      expect(result.allocations[0].sourceLogId).toBe(50);
    });

    it("should restrict FIFO allocation to the selected unit-cost layer", async () => {
      const { service, repositoryMock } = await buildServiceForFifo();

      const result = await service.settleConsumerOut({
        materialId: 10,
        workshopId: 20,
        quantity: 20,
        selectedUnitCost: "10.00",
        operationType: InventoryOperationType.OUTBOUND_OUT,
        businessModule: "sales",
        businessDocumentType: "SalesStockOrder",
        businessDocumentId: 1,
        businessDocumentNumber: "OB-001",
        businessDocumentLineId: 1,
        consumerLineId: 1,
        bizDate: new Date("2026-04-09"),
        idempotencyKey: "fifo-price-layer-1",
        sourceOperationTypes: FIFO_SOURCE_OPERATION_TYPES,
      });

      expect(result.allocations).toHaveLength(1);
      expect(repositoryMock.findFifoSourceLogs).toHaveBeenCalled();
      const fifoParams = repositoryMock.findFifoSourceLogs.mock.calls[0]?.[0];
      expect(fifoParams.unitCost.toString()).toBe("10");
    });

    it("should throw when FIFO candidates are insufficient", async () => {
      const { service } = await buildServiceForFifo({
        fifoLogs: [],
      });

      await expect(
        service.settleConsumerOut({
          materialId: 10,
          workshopId: 20,
          quantity: 50,
          operationType: InventoryOperationType.OUTBOUND_OUT,
          businessModule: "sales",
          businessDocumentType: "SalesStockOrder",
          businessDocumentId: 1,
          businessDocumentNumber: "OB-001",
          businessDocumentLineId: 1,
          consumerLineId: 1,
          bizDate: new Date("2026-04-09"),
          idempotencyKey: "fifo-fail-1",
          sourceOperationTypes: FIFO_SOURCE_OPERATION_TYPES,
        }),
      ).rejects.toThrow("FIFO 可用来源库存不足");
    });

    it("should throw when manual source log is already reversed", async () => {
      const { service } = await buildServiceForFifo({
        reversalLog: { id: 999 },
      });

      await expect(
        service.settleConsumerOut({
          materialId: 10,
          workshopId: 20,
          quantity: 20,
          operationType: InventoryOperationType.PICK_OUT,
          businessModule: "workshop",
          businessDocumentType: "WorkshopMaterialOrder",
          businessDocumentId: 5,
          businessDocumentNumber: "WM-001",
          businessDocumentLineId: 10,
          consumerLineId: 10,
          bizDate: new Date("2026-04-09"),
          idempotencyKey: "manual-reversed-1",
          sourceLogId: 50,
          sourceOperationTypes: FIFO_SOURCE_OPERATION_TYPES,
        }),
      ).rejects.toThrow("来源流水已逆操作");
    });

    it("should throw when manual source log has mismatched materialId", async () => {
      const wrongMaterialLog = {
        ...mockSourceLog,
        materialId: 999, // Different from cmd.materialId=10
      };
      const { service } = await buildServiceForFifo({
        sourceLog: wrongMaterialLog,
      });

      await expect(
        service.settleConsumerOut({
          materialId: 10,
          workshopId: 20,
          quantity: 20,
          operationType: InventoryOperationType.PICK_OUT,
          businessModule: "workshop",
          businessDocumentType: "WorkshopMaterialOrder",
          businessDocumentId: 5,
          businessDocumentNumber: "WM-001",
          businessDocumentLineId: 10,
          consumerLineId: 10,
          bizDate: new Date("2026-04-09"),
          idempotencyKey: "manual-material-mismatch-1",
          sourceLogId: 50,
          sourceOperationTypes: FIFO_SOURCE_OPERATION_TYPES,
        }),
      ).rejects.toThrow("手动来源流水物料不匹配");
    });

    it("should throw when manual source log has mismatched stockScopeId", async () => {
      const wrongScopeLog = {
        ...mockSourceLog,
        stockScopeId: 999, // Different from resolved MAIN scope id
      };
      const { service } = await buildServiceForFifo({
        sourceLog: wrongScopeLog,
      });

      await expect(
        service.settleConsumerOut({
          materialId: 10,
          workshopId: 20,
          quantity: 20,
          operationType: InventoryOperationType.PICK_OUT,
          businessModule: "workshop",
          businessDocumentType: "WorkshopMaterialOrder",
          businessDocumentId: 5,
          businessDocumentNumber: "WM-001",
          businessDocumentLineId: 10,
          consumerLineId: 10,
          bizDate: new Date("2026-04-09"),
          idempotencyKey: "manual-scope-mismatch-1",
          sourceLogId: 50,
          sourceOperationTypes: FIFO_SOURCE_OPERATION_TYPES,
        }),
      ).rejects.toThrow("手动来源流水库存范围不匹配");
    });

    it("should throw when manual source log operation type is not in allowed list", async () => {
      const returnInLog = {
        ...mockSourceLog,
        operationType: InventoryOperationType.SALES_RETURN_IN, // Not in FIFO source types
      };
      const { service } = await buildServiceForFifo({ sourceLog: returnInLog });

      await expect(
        service.settleConsumerOut({
          materialId: 10,
          workshopId: 20,
          quantity: 20,
          operationType: InventoryOperationType.OUTBOUND_OUT,
          businessModule: "sales",
          businessDocumentType: "SalesStockOrder",
          businessDocumentId: 1,
          businessDocumentNumber: "OB-001",
          businessDocumentLineId: 1,
          consumerLineId: 1,
          bizDate: new Date("2026-04-09"),
          idempotencyKey: "manual-optype-mismatch-1",
          sourceLogId: 50,
          sourceOperationTypes: FIFO_SOURCE_OPERATION_TYPES.filter(
            (t) => t !== "RD_HANDOFF_IN",
          ),
        }),
      ).rejects.toThrow("手动来源流水操作类型不在允许列表中");
    });

    it("should reject manual source when selected unit cost does not match", async () => {
      const { service } = await buildServiceForFifo();

      await expect(
        service.settleConsumerOut({
          materialId: 10,
          workshopId: 20,
          quantity: 20,
          selectedUnitCost: "11.00",
          operationType: InventoryOperationType.PRICE_CORRECTION_OUT,
          businessModule: "inbound",
          businessDocumentType: "StockInPriceCorrectionOrder",
          businessDocumentId: 5,
          businessDocumentNumber: "PC-001",
          businessDocumentLineId: 10,
          consumerLineId: 10,
          bizDate: new Date("2026-04-09"),
          idempotencyKey: "manual-price-layer-mismatch-1",
          sourceLogId: 50,
          sourceOperationTypes: FIFO_SOURCE_OPERATION_TYPES,
        }),
      ).rejects.toThrow("来源流水价格层不匹配");
    });

    it("should reload exact line allocations when idempotency race returns an existing log", async () => {
      const existingLog = {
        ...mockLog,
        id: 901,
        direction: StockDirection.OUT,
        businessDocumentId: 1,
        businessDocumentLineId: 1,
        idempotencyKey: "dup-out-1",
      };
      const lineUsages = [
        {
          sourceLogId: 50,
          allocatedQty: new Prisma.Decimal(20),
          sourceLog: {
            unitCost: new Prisma.Decimal(10),
          },
        },
      ];
      const { service, mockTx } = await buildServiceForFifo({
        lineUsages,
      });
      const duplicateError = new Prisma.PrismaClientKnownRequestError(
        "duplicate",
        {
          code: "P2002",
          clientVersion: "test",
        },
      );
      (mockTx.inventoryLog.create as jest.Mock).mockRejectedValueOnce(
        duplicateError,
      );
      const repository = (
        service as unknown as { repository: InventoryRepository }
      ).repository as unknown as {
        findLogByIdempotencyKey: jest.Mock;
        findSourceUsagesForConsumerLine: jest.Mock;
      };
      repository.findLogByIdempotencyKey
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(existingLog);

      const result = await service.settleConsumerOut({
        materialId: 10,
        workshopId: 20,
        quantity: 20,
        operationType: InventoryOperationType.OUTBOUND_OUT,
        businessModule: "sales",
        businessDocumentType: "SalesStockOrder",
        businessDocumentId: 1,
        businessDocumentNumber: "OB-001",
        businessDocumentLineId: 1,
        consumerLineId: 1,
        bizDate: new Date("2026-04-09"),
        idempotencyKey: "dup-out-1",
        sourceOperationTypes: FIFO_SOURCE_OPERATION_TYPES,
      });

      expect(repository.findSourceUsagesForConsumerLine).toHaveBeenCalledWith(
        {
          consumerDocumentType: "SalesStockOrder",
          consumerDocumentId: 1,
          consumerLineId: 1,
        },
        undefined,
      );
      expect(result.outLog.id).toBe(901);
      expect(result.allocations).toHaveLength(1);
      expect(Number(result.settledCostAmount)).toBe(200);
      expect(Number(result.settledUnitCost)).toBe(10);
    });
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
