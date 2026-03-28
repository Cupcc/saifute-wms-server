import { BadRequestException, NotFoundException } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import {
  InventoryOperationType,
  Prisma,
  SourceUsageStatus,
  StockDirection,
} from "../../../generated/prisma/client";
import { PrismaService } from "../../../shared/prisma/prisma.service";
import { MasterDataService } from "../../master-data/application/master-data.service";
import { InventoryRepository } from "../infrastructure/inventory.repository";
import { InventoryService } from "./inventory.service";

describe("InventoryService", () => {
  const mockBalance = {
    id: 1,
    materialId: 10,
    workshopId: 20,
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

  it("should create inventory log on increaseStock", async () => {
    const mockTx = {
      inventoryBalance: {
        findUnique: jest.fn().mockResolvedValue(mockBalance),
        create: jest.fn().mockResolvedValue(mockBalance),
        update: jest
          .fn()
          .mockResolvedValue({ ...mockBalance, quantityOnHand: 150 }),
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
      ],
    }).compile();

    const service = moduleRef.get(InventoryService);
    const log = await service.increaseStock({
      materialId: 10,
      workshopId: 20,
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
      ],
    }).compile();

    const service = moduleRef.get(InventoryService);
    const log = await service.increaseStock({
      materialId: 10,
      workshopId: 20,
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
        update: jest.fn(),
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
      ],
    }).compile();

    const service = moduleRef.get(InventoryService);
    await expect(
      service.decreaseStock({
        materialId: 10,
        workshopId: 20,
        quantity: 50,
        operationType: InventoryOperationType.OUTBOUND_OUT,
        businessModule: "customer",
        businessDocumentType: "CustomerStockOrder",
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
        update: jest
          .fn()
          .mockResolvedValue({ ...mockBalance, quantityOnHand: 100 }),
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
});
