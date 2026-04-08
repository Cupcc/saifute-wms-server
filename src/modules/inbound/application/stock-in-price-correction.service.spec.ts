import { Test } from "@nestjs/testing";
import {
  AuditStatusSnapshot,
  DocumentLifecycleStatus,
  InventoryEffectStatus,
  InventoryOperationType,
  Prisma,
} from "../../../generated/prisma/client";
import { PrismaService } from "../../../shared/prisma/prisma.service";
import { ApprovalService } from "../../approval/application/approval.service";
import { InventoryService } from "../../inventory-core/application/inventory.service";
import { MasterDataService } from "../../master-data/application/master-data.service";
import { StockInPriceCorrectionRepository } from "../infrastructure/stock-in-price-correction.repository";
import { StockInPriceCorrectionService } from "./stock-in-price-correction.service";

describe("StockInPriceCorrectionService", () => {
  const mockWorkshop = {
    id: 1,
    workshopCode: "MAIN",
    workshopName: "主仓",
  };
  const mockOrder = {
    id: 1,
    documentNo: "PC-001",
    bizDate: new Date("2026-04-05"),
    stockScopeId: 1,
    workshopId: 1,
    lifecycleStatus: DocumentLifecycleStatus.EFFECTIVE,
    auditStatusSnapshot: AuditStatusSnapshot.PENDING,
    inventoryEffectStatus: InventoryEffectStatus.POSTED,
    totalLineCount: 1,
    totalHistoricalDiffAmount: new Prisma.Decimal(80),
    remark: null,
    createdBy: "1",
    createdAt: new Date(),
    updatedBy: "1",
    updatedAt: new Date(),
    lines: [],
  };
  const mockSourceLog = {
    id: 500,
    balanceId: 1,
    materialId: 100,
    stockScopeId: 1,
    workshopId: 1,
    direction: "IN",
    operationType: InventoryOperationType.ACCEPTANCE_IN,
    businessModule: "inbound",
    businessDocumentType: "StockInOrder",
    businessDocumentId: 900,
    businessDocumentNumber: "SI-900",
    businessDocumentLineId: 901,
    changeQty: new Prisma.Decimal(100),
    beforeQty: new Prisma.Decimal(0),
    afterQty: new Prisma.Decimal(100),
    unitCost: new Prisma.Decimal(8),
    costAmount: new Prisma.Decimal(800),
    operatorId: "1",
    occurredAt: new Date(),
    reversalOfLogId: null,
    idempotencyKey: "stock-in-900",
    note: null,
  };

  let service: StockInPriceCorrectionService;
  let repository: jest.Mocked<StockInPriceCorrectionRepository>;
  let inventoryService: jest.Mocked<InventoryService>;
  let approvalService: jest.Mocked<ApprovalService>;

  beforeEach(async () => {
    const prisma = {
      runInTransaction: jest.fn((handler: (tx: unknown) => Promise<unknown>) =>
        handler({
          $queryRaw: jest.fn().mockResolvedValue([]),
          inventoryLog: {
            findUnique: jest.fn().mockResolvedValue(mockSourceLog),
            findFirst: jest.fn().mockResolvedValue(null),
          },
          inventorySourceUsage: {
            findMany: jest.fn().mockResolvedValue([
              {
                allocatedQty: new Prisma.Decimal(40),
                releasedQty: new Prisma.Decimal(0),
              },
            ]),
          },
          stockInOrder: {
            findUnique: jest.fn().mockResolvedValue({
              id: 900,
              documentNo: "SI-900",
              bizDate: new Date("2026-04-01"),
            }),
          },
          stockInOrderLine: {
            findUnique: jest.fn().mockResolvedValue({ id: 901 }),
          },
        }),
      ),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        StockInPriceCorrectionService,
        {
          provide: PrismaService,
          useValue: prisma,
        },
        {
          provide: StockInPriceCorrectionRepository,
          useValue: {
            findOrders: jest.fn(),
            findOrderById: jest.fn().mockResolvedValue({
              ...mockOrder,
              lines: [
                {
                  id: 11,
                  orderId: 1,
                  lineNo: 1,
                  materialId: 100,
                  sourceInventoryLogId: 500,
                  sourceStockInOrderId: 900,
                  sourceStockInOrderLineId: 901,
                  sourceDocumentNoSnapshot: "SI-900",
                  sourceBizDateSnapshot: new Date("2026-04-01"),
                  wrongUnitCost: new Prisma.Decimal(8),
                  correctUnitCost: new Prisma.Decimal(10),
                  sourceInQty: new Prisma.Decimal(100),
                  consumedQtyAtCorrection: new Prisma.Decimal(40),
                  remainingQtyAtCorrection: new Prisma.Decimal(60),
                  historicalDiffAmount: new Prisma.Decimal(80),
                  generatedOutLogId: 700,
                  generatedInLogId: 701,
                  createdBy: "1",
                  createdAt: new Date(),
                  updatedBy: "1",
                  updatedAt: new Date(),
                },
              ],
            }),
            findOrderByDocumentNo: jest.fn().mockResolvedValue(null),
            findLineBySourceInventoryLogId: jest.fn().mockResolvedValue(null),
            findLineByGeneratedInLogId: jest.fn().mockResolvedValue(null),
            createOrder: jest.fn().mockResolvedValue({
              id: 1,
              documentNo: "PC-001",
            }),
            createOrderLine: jest.fn().mockResolvedValue({
              id: 11,
              orderId: 1,
            }),
            updateOrder: jest.fn().mockResolvedValue(undefined),
            updateOrderLine: jest.fn().mockResolvedValue(undefined),
          },
        },
        {
          provide: MasterDataService,
          useValue: {
            getWorkshopById: jest.fn().mockResolvedValue(mockWorkshop),
            getStockScopeByCode: jest.fn().mockResolvedValue({
              id: 1,
              scopeCode: "MAIN",
              scopeName: "主仓",
            }),
          },
        },
        {
          provide: InventoryService,
          useValue: {
            settleConsumerOut: jest.fn().mockResolvedValue({
              outLog: { id: 700 },
              settledUnitCost: new Prisma.Decimal(8),
              settledCostAmount: new Prisma.Decimal(480),
              allocations: [],
            }),
            increaseStock: jest.fn().mockResolvedValue({ id: 701 }),
          },
        },
        {
          provide: ApprovalService,
          useValue: {
            createOrRefreshApprovalDocument: jest.fn().mockResolvedValue({}),
          },
        },
      ],
    }).compile();

    service = moduleRef.get(StockInPriceCorrectionService);
    repository = moduleRef.get(StockInPriceCorrectionRepository);
    inventoryService = moduleRef.get(InventoryService);
    approvalService = moduleRef.get(ApprovalService);
  });

  it("should transfer remaining quantity into correction out/in logs for partial consumption", async () => {
    const result = await service.createOrder(
      {
        documentNo: "PC-001",
        bizDate: "2026-04-05",
        workshopId: 1,
        lines: [
          {
            materialId: 100,
            sourceInventoryLogId: 500,
            correctUnitCost: "10",
          },
        ],
      },
      "1",
    );

    expect(repository.createOrderLine).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceInventoryLogId: 500,
        wrongUnitCost: new Prisma.Decimal(8),
        correctUnitCost: new Prisma.Decimal(10),
        consumedQtyAtCorrection: new Prisma.Decimal(40),
        remainingQtyAtCorrection: new Prisma.Decimal(60),
        historicalDiffAmount: new Prisma.Decimal(80),
      }),
      expect.anything(),
    );
    expect(inventoryService.settleConsumerOut).toHaveBeenCalledWith(
      expect.objectContaining({
        operationType: InventoryOperationType.PRICE_CORRECTION_OUT,
        sourceLogId: 500,
        quantity: new Prisma.Decimal(60),
      }),
      expect.anything(),
    );
    expect(inventoryService.increaseStock).toHaveBeenCalledWith(
      expect.objectContaining({
        operationType: InventoryOperationType.PRICE_CORRECTION_IN,
        unitCost: new Prisma.Decimal(10),
        costAmount: new Prisma.Decimal(600),
      }),
      expect.anything(),
    );
    expect(repository.updateOrderLine).toHaveBeenCalledWith(
      11,
      expect.objectContaining({
        generatedOutLogId: 700,
        generatedInLogId: 701,
      }),
      expect.anything(),
    );
    expect(repository.updateOrder).toHaveBeenCalledWith(
      1,
      expect.objectContaining({
        totalHistoricalDiffAmount: new Prisma.Decimal(80),
      }),
      expect.anything(),
    );
    expect(approvalService.createOrRefreshApprovalDocument).toHaveBeenCalled();
    expect(result.id).toBe(1);
  });

  it("should only record historical diff when the source is already fully consumed", async () => {
    const prisma = (service as unknown as { prisma: PrismaService }).prisma;
    (prisma.runInTransaction as jest.Mock).mockImplementation(
      (handler: (tx: unknown) => Promise<unknown>) =>
        handler({
          $queryRaw: jest.fn().mockResolvedValue([]),
          inventoryLog: {
            findUnique: jest.fn().mockResolvedValue(mockSourceLog),
            findFirst: jest.fn().mockResolvedValue(null),
          },
          inventorySourceUsage: {
            findMany: jest.fn().mockResolvedValue([
              {
                allocatedQty: new Prisma.Decimal(100),
                releasedQty: new Prisma.Decimal(0),
              },
            ]),
          },
          stockInOrder: {
            findUnique: jest.fn().mockResolvedValue({
              id: 900,
              documentNo: "SI-900",
              bizDate: new Date("2026-04-01"),
            }),
          },
          stockInOrderLine: {
            findUnique: jest.fn().mockResolvedValue({ id: 901 }),
          },
        }),
    );

    await service.createOrder(
      {
        documentNo: "PC-002",
        bizDate: "2026-04-05",
        workshopId: 1,
        lines: [
          {
            materialId: 100,
            sourceInventoryLogId: 500,
            correctUnitCost: "10",
          },
        ],
      },
      "1",
    );

    expect(inventoryService.settleConsumerOut).not.toHaveBeenCalled();
    expect(inventoryService.increaseStock).not.toHaveBeenCalled();
    expect(repository.updateOrderLine).not.toHaveBeenCalled();
    expect(repository.updateOrder).toHaveBeenCalledWith(
      1,
      expect.objectContaining({
        totalHistoricalDiffAmount: new Prisma.Decimal(200),
      }),
      expect.anything(),
    );
  });

  it("should keep tracing back to the original stock-in line when correcting a prior correction-in source", async () => {
    const prisma = (service as unknown as { prisma: PrismaService }).prisma;
    (repository.findLineByGeneratedInLogId as jest.Mock).mockResolvedValue({
      id: 11,
      sourceStockInOrderId: 900,
      sourceStockInOrderLineId: 901,
      sourceDocumentNoSnapshot: "SI-900",
      sourceBizDateSnapshot: new Date("2026-04-01"),
      sourceStockInOrder: {
        id: 900,
        documentNo: "SI-900",
        bizDate: new Date("2026-04-01"),
      },
    });
    (prisma.runInTransaction as jest.Mock).mockImplementation(
      (handler: (tx: unknown) => Promise<unknown>) =>
        handler({
          $queryRaw: jest.fn().mockResolvedValue([]),
          inventoryLog: {
            findUnique: jest.fn().mockResolvedValue({
              ...mockSourceLog,
              id: 701,
              operationType: InventoryOperationType.PRICE_CORRECTION_IN,
              businessDocumentType: "StockInPriceCorrectionOrder",
              businessDocumentId: 1,
              businessDocumentNumber: "PC-001",
              businessDocumentLineId: 11,
              unitCost: new Prisma.Decimal(10),
              costAmount: new Prisma.Decimal(600),
            }),
            findFirst: jest.fn().mockResolvedValue(null),
          },
          inventorySourceUsage: {
            findMany: jest.fn().mockResolvedValue([
              {
                allocatedQty: new Prisma.Decimal(40),
                releasedQty: new Prisma.Decimal(0),
              },
            ]),
          },
          stockInOrder: {
            findUnique: jest.fn().mockResolvedValue(null),
          },
          stockInOrderLine: {
            findUnique: jest.fn().mockResolvedValue(null),
          },
        }),
    );

    await service.createOrder(
      {
        documentNo: "PC-003",
        bizDate: "2026-04-07",
        workshopId: 1,
        lines: [
          {
            materialId: 100,
            sourceInventoryLogId: 701,
            correctUnitCost: "12",
          },
        ],
      },
      "1",
    );

    expect(repository.findLineByGeneratedInLogId).toHaveBeenCalledWith(
      701,
      expect.anything(),
    );
    expect(repository.createOrderLine).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceInventoryLogId: 701,
        sourceStockInOrderId: 900,
        sourceStockInOrderLineId: 901,
        sourceDocumentNoSnapshot: "SI-900",
        sourceBizDateSnapshot: new Date("2026-04-01"),
      }),
      expect.anything(),
    );
  });
});
