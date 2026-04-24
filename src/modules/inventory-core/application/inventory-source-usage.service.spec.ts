import { BadRequestException } from "@nestjs/common";
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
  const _mockBalance = {
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
            runInTransaction: jest.fn((_tx, handler) => handler({})),
          },
        },
        {
          provide: InventoryRepository,
          useValue: {
            runInTransaction: jest.fn((_tx, handler) => handler({})),
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
            runInTransaction: jest.fn((_tx, handler) => handler({})),
          },
        },
        {
          provide: InventoryRepository,
          useValue: {
            runInTransaction: jest.fn((_tx, handler) => handler({})),
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
            runInTransaction: jest.fn((_tx, handler) => handler({})),
          },
        },
        {
          provide: InventoryRepository,
          useValue: {
            runInTransaction: jest.fn((_tx, handler) => handler({})),
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
            runInTransaction: jest.fn((_tx, handler) => handler({})),
          },
        },
        {
          provide: InventoryRepository,
          useValue: {
            runInTransaction: jest.fn((_tx, handler) => handler({})),
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
            runInTransaction: jest.fn((_tx, handler) => handler({})),
          },
        },
        {
          provide: InventoryRepository,
          useValue: {
            runInTransaction: jest.fn((_tx, handler) => handler({})),
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
            runInTransaction: jest.fn((_tx, handler) => handler({})),
          },
        },
        {
          provide: InventoryRepository,
          useValue: {
            runInTransaction: jest.fn((_tx, handler) => handler({})),
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
});
