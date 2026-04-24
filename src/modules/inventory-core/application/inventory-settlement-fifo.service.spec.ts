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
        runInTransaction: jest.fn((_tx, handler) => handler(mockTx)),
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
  });
});
