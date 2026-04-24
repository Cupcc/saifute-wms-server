import { BadRequestException, NotFoundException } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import {
  InventoryOperationType,
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
            runInTransaction: jest.fn((_tx, handler) => handler({})),
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
            runInTransaction: jest.fn((_tx, handler) => handler(mockTx)),
          },
        },
        {
          provide: InventoryRepository,
          useValue: {
            runInTransaction: jest.fn((_tx, handler) => handler(mockTx)),
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
});
