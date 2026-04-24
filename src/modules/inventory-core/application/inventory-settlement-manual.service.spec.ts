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
      const { service, mockTx, repositoryMock } = await buildServiceForFifo({
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
      repositoryMock.findLogByIdempotencyKey
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

      expect(
        repositoryMock.findSourceUsagesForConsumerLine,
      ).toHaveBeenCalledWith(
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
});
