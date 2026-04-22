import { NotFoundException } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import {
  DocumentFamily,
  DocumentLifecycleStatus,
  InventoryEffectStatus,
  Prisma,
  SalesStockOrderType,
} from "../../../../generated/prisma/client";
import { ApprovalService } from "../../approval/application/approval.service";
import { InventoryService } from "../../inventory-core/application/inventory.service";
import { MasterDataService } from "../../master-data/application/master-data.service";
import { SalesProjectService } from "../../sales-project/application/sales-project.service";
import { SalesRepository } from "../infrastructure/sales.repository";
import {
  buildSalesProviders,
  createSalesPrismaMock,
  mockMaterial,
  mockOutboundOrder,
  mockUncategorizedCategory,
  type SalesPrismaMock,
} from "./sales.service.test-support";
import { SalesOutboundService } from "./sales-outbound.service";
import { SalesSnapshotsService } from "./sales-snapshots.service";
import { SalesTraceabilityService } from "./sales-traceability.service";

describe("SalesOutboundService", () => {
  let service: SalesOutboundService;
  let repository: jest.Mocked<SalesRepository>;
  let masterDataService: jest.Mocked<MasterDataService>;
  let inventoryService: jest.Mocked<InventoryService>;
  let approvalService: jest.Mocked<ApprovalService>;
  let salesProjectService: jest.Mocked<SalesProjectService>;
  let prisma: SalesPrismaMock;

  beforeEach(async () => {
    prisma = createSalesPrismaMock();
    const moduleRef = await Test.createTestingModule({
      providers: [
        SalesOutboundService,
        SalesSnapshotsService,
        SalesTraceabilityService,
        ...buildSalesProviders(prisma),
      ],
    }).compile();

    service = moduleRef.get(SalesOutboundService);
    repository = moduleRef.get(SalesRepository);
    masterDataService = moduleRef.get(MasterDataService);
    inventoryService = moduleRef.get(InventoryService);
    approvalService = moduleRef.get(ApprovalService);
    salesProjectService = moduleRef.get(SalesProjectService);
  });

  describe("createOrder", () => {
    it("should create outbound order with inventory decrease and audit", async () => {
      (repository.findOrderByDocumentNo as jest.Mock).mockResolvedValue(null);
      (repository.createOrder as jest.Mock).mockResolvedValue(
        mockOutboundOrder,
      );

      const dto = {
        documentNo: "OB-001",
        bizDate: "2025-03-14",
        customerId: 10,
        handlerPersonnelId: 20,
        workshopId: 1,
        lines: [
          {
            materialId: 100,
            salesProjectId: 300,
            quantity: "100",
            selectedUnitCost: "10",
            unitPrice: "10",
            startNumber: "001",
            endNumber: "100",
          },
        ],
      };

      const result = await service.createOrder(dto, "1");

      expect(result).toMatchObject(mockOutboundOrder);
      expect(repository.createOrder).toHaveBeenCalled();
      expect(inventoryService.settleConsumerOut).toHaveBeenCalledWith(
        expect.objectContaining({
          materialId: 100,
          stockScope: "MAIN",
          projectTargetId: 7001,
          selectedUnitCost: mockOutboundOrder.lines[0].selectedUnitCost,
          businessDocumentType: "SalesStockOrder",
          businessDocumentId: 1,
          businessDocumentNumber: "OB-001",
        }),
        expect.anything(),
      );
      expect(inventoryService.reserveFactoryNumber).toHaveBeenCalledWith(
        expect.objectContaining({
          materialId: 100,
          stockScope: "MAIN",
          startNumber: "001",
          endNumber: "100",
        }),
        expect.anything(),
      );
      expect(
        approvalService.createOrRefreshApprovalDocument,
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          documentFamily: DocumentFamily.SALES_STOCK,
          documentType: "SalesStockOrder",
          documentId: 1,
          documentNumber: "OB-001",
        }),
        expect.anything(),
      );
      expect(
        salesProjectService.listProjectReferencesByIds,
      ).toHaveBeenCalledWith([300], undefined);
      expect(repository.createOrder).toHaveBeenCalledWith(
        expect.anything(),
        expect.arrayContaining([
          expect.objectContaining({
            materialCategoryIdSnapshot: 99,
            materialCategoryCodeSnapshot: "RESISTOR",
            materialCategoryNameSnapshot: "电阻",
            materialCategoryPathSnapshot: [
              { id: 99, categoryCode: "RESISTOR", categoryName: "电阻" },
            ],
          }),
        ]),
        expect.anything(),
      );
    });

    it("should reject duplicate material and selected-unit-cost combinations", async () => {
      (repository.findOrderByDocumentNo as jest.Mock).mockResolvedValue(null);

      await expect(
        service.createOrder(
          {
            documentNo: "OB-DUP",
            bizDate: "2025-03-14",
            workshopId: 1,
            lines: [
              { materialId: 100, quantity: "10", selectedUnitCost: "10" },
              { materialId: 100, quantity: "20", selectedUnitCost: "10.00" },
            ],
          },
          "1",
        ),
      ).rejects.toThrow("同一单据内不允许重复的物料+价格层");
      expect(repository.createOrder).not.toHaveBeenCalled();
    });

    it("should fall back to uncategorized snapshot when material category is missing", async () => {
      (repository.findOrderByDocumentNo as jest.Mock).mockResolvedValue(null);
      (repository.createOrder as jest.Mock).mockResolvedValue(
        mockOutboundOrder,
      );
      (masterDataService.getMaterialById as jest.Mock).mockResolvedValue({
        ...mockMaterial,
        category: null,
      });
      (prisma.materialCategory.findUnique as jest.Mock).mockResolvedValue(
        mockUncategorizedCategory,
      );

      await service.createOrder(
        {
          documentNo: "OB-UNCAT",
          bizDate: "2025-03-14",
          customerId: 10,
          workshopId: 1,
          lines: [
            {
              materialId: 100,
              quantity: "10",
              selectedUnitCost: "10",
              unitPrice: "10",
            },
          ],
        },
        "1",
      );

      expect(prisma.materialCategory.findUnique).toHaveBeenCalledWith({
        where: { categoryCode: "UNCATEGORIZED" },
        select: {
          id: true,
          categoryCode: true,
          categoryName: true,
        },
      });
      expect(repository.createOrder).toHaveBeenCalledWith(
        expect.anything(),
        expect.arrayContaining([
          expect.objectContaining({
            materialCategoryIdSnapshot: 1,
            materialCategoryCodeSnapshot: "UNCATEGORIZED",
            materialCategoryNameSnapshot: "未分类",
            materialCategoryPathSnapshot: [
              {
                id: 1,
                categoryCode: "UNCATEGORIZED",
                categoryName: "未分类",
              },
            ],
          }),
        ]),
        expect.anything(),
      );
    });
  });

  describe("voidOrder", () => {
    it("should void order and reverse inventory and release factory reservations", async () => {
      (repository.findOrderById as jest.Mock).mockResolvedValue(
        mockOutboundOrder,
      );
      (
        repository.hasActiveDownstreamSalesReturns as jest.Mock
      ).mockResolvedValue(false);
      (inventoryService.getLogsForDocument as jest.Mock).mockResolvedValue([
        { id: 1 },
      ]);
      (repository.updateOrder as jest.Mock).mockResolvedValue({
        ...mockOutboundOrder,
        lifecycleStatus: DocumentLifecycleStatus.VOIDED,
      });
      (repository.findOrderById as jest.Mock)
        .mockResolvedValueOnce(mockOutboundOrder)
        .mockResolvedValueOnce({
          ...mockOutboundOrder,
          lifecycleStatus: DocumentLifecycleStatus.VOIDED,
          inventoryEffectStatus: InventoryEffectStatus.REVERSED,
        });

      const result = await service.voidOrder(1, "Test void", "1");

      expect(inventoryService.reverseStock).toHaveBeenCalledWith(
        expect.objectContaining({
          logIdToReverse: 1,
          idempotencyKey: expect.stringContaining("void"),
        }),
        expect.anything(),
      );
      expect(
        inventoryService.releaseFactoryNumberReservations,
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          businessDocumentType: "SalesStockOrder",
          businessDocumentId: 1,
        }),
        expect.anything(),
      );
      expect(repository.updateOrder).toHaveBeenCalledWith(
        1,
        expect.objectContaining({
          lifecycleStatus: DocumentLifecycleStatus.VOIDED,
          inventoryEffectStatus: InventoryEffectStatus.REVERSED,
          voidReason: "Test void",
        }),
        expect.anything(),
      );
      expect(approvalService.markApprovalNotRequired).toHaveBeenCalledWith(
        "SalesStockOrder",
        1,
        "1",
        expect.anything(),
      );
      expect(result).not.toBeNull();
      if (result) {
        expect(result.lifecycleStatus).toBe(DocumentLifecycleStatus.VOIDED);
      }
    });

    it("should throw when order not found", async () => {
      (repository.findOrderById as jest.Mock).mockResolvedValue(null);

      await expect(service.voidOrder(999, undefined, "1")).rejects.toThrow(
        NotFoundException,
      );
    });

    it("should block void when active sales return downstream exists", async () => {
      (repository.findOrderById as jest.Mock).mockResolvedValue(
        mockOutboundOrder,
      );
      (
        repository.hasActiveDownstreamSalesReturns as jest.Mock
      ).mockResolvedValue(true);

      await expect(service.voidOrder(1, "blocked", "1")).rejects.toThrow(
        "存在未作废的销售退货下游，不能作废出库单",
      );
      expect(inventoryService.reverseStock).not.toHaveBeenCalled();
    });
  });

  describe("listOrders", () => {
    it("should return paginated outbound orders", async () => {
      (repository.findOrders as jest.Mock).mockResolvedValue({
        items: [mockOutboundOrder],
        total: 1,
      });

      const result = await service.listOrders({ limit: 10, offset: 0 });

      expect(result.items).toHaveLength(1);
      expect(result.total).toBe(1);
      expect(repository.findOrders).toHaveBeenCalledWith(
        expect.objectContaining({
          orderType: SalesStockOrderType.OUTBOUND,
          limit: 10,
          offset: 0,
        }),
      );
    });
  });

  describe("getOrderById", () => {
    it("should return order when found", async () => {
      (repository.findOrderById as jest.Mock).mockResolvedValue(
        mockOutboundOrder,
      );

      const result = await service.getOrderById(1);

      expect(result).toMatchObject(mockOutboundOrder);
      expect(result.lines[0]?.sourceUsages).toEqual([]);
    });

    it("should trace corrected source usages back to the correction that created the current source layer", async () => {
      const correctionSourceBizDate = new Date("2026-04-01");
      (repository.findOrderById as jest.Mock).mockResolvedValue(
        mockOutboundOrder,
      );
      (
        inventoryService.listSourceUsagesForConsumerLine as jest.Mock
      ).mockResolvedValue([
        {
          sourceLogId: 701,
          consumerLineId: 1,
          allocatedQty: new Prisma.Decimal(20),
          releasedQty: new Prisma.Decimal(0),
          sourceLog: {
            id: 701,
            businessDocumentType: "StockInPriceCorrectionOrder",
            businessDocumentLineId: null,
            unitCost: new Prisma.Decimal(10),
          },
        },
      ]);
      prisma.stockInPriceCorrectionOrderLine.findMany.mockResolvedValue([
        {
          id: 11,
          orderId: 1001,
          sourceInventoryLogId: 500,
          generatedInLogId: 701,
          generatedOutLogId: 700,
          wrongUnitCost: new Prisma.Decimal(8),
          correctUnitCost: new Prisma.Decimal(10),
          historicalDiffAmount: new Prisma.Decimal(80),
          order: {
            id: 1001,
            documentNo: "PC-001",
            bizDate: new Date("2026-04-05"),
          },
          sourceStockInOrder: {
            id: 900,
            documentNo: "SI-900",
            bizDate: correctionSourceBizDate,
          },
          sourceStockInOrderLine: {
            id: 901,
            lineNo: 1,
            materialId: 100,
            materialCodeSnapshot: "MAT001",
            materialNameSnapshot: "Material A",
            quantity: new Prisma.Decimal(100),
            unitPrice: new Prisma.Decimal(8),
          },
        },
        {
          id: 12,
          orderId: 1002,
          sourceInventoryLogId: 701,
          generatedInLogId: 702,
          generatedOutLogId: 703,
          wrongUnitCost: new Prisma.Decimal(10),
          correctUnitCost: new Prisma.Decimal(12),
          historicalDiffAmount: new Prisma.Decimal(40),
          order: {
            id: 1002,
            documentNo: "PC-002",
            bizDate: new Date("2026-04-06"),
          },
          sourceStockInOrder: {
            id: 901,
            documentNo: "SI-901",
            bizDate: new Date("2026-04-02"),
          },
          sourceStockInOrderLine: {
            id: 902,
            lineNo: 1,
            materialId: 100,
            materialCodeSnapshot: "MAT001",
            materialNameSnapshot: "Material A",
            quantity: new Prisma.Decimal(60),
            unitPrice: new Prisma.Decimal(10),
          },
        },
      ]);

      const result = await service.getOrderById(1);

      expect(result.lines[0]?.sourceUsages).toHaveLength(1);
      expect(result.lines[0]?.sourceUsages[0]).toMatchObject({
        sourceLogId: 701,
        priceCorrection: expect.objectContaining({
          id: 11,
          documentNo: "PC-001",
          sourceInventoryLogId: 500,
          generatedInLogId: 701,
        }),
        originalInboundOrder: expect.objectContaining({
          id: 900,
          documentNo: "SI-900",
          bizDate: correctionSourceBizDate,
        }),
        originalInboundLine: expect.objectContaining({
          id: 901,
          lineNo: 1,
          unitPrice: new Prisma.Decimal(8),
        }),
      });
    });

    it("should throw NotFoundException when not found", async () => {
      (repository.findOrderById as jest.Mock).mockResolvedValue(null);

      await expect(service.getOrderById(999)).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
