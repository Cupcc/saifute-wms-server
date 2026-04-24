import { BadRequestException } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import {
  DocumentRelationType,
  Prisma,
} from "../../../../generated/prisma/client";
import { InventoryService } from "../../inventory-core/application/inventory.service";
import { SalesRepository } from "../infrastructure/sales.repository";
import {
  buildSalesProviders,
  mockOutboundOrder,
  mockSalesReturnOrder,
} from "./sales.service.test-support";
import { SalesReturnService } from "./sales-return.service";
import { SalesReturnSourceService } from "./sales-return-source.service";
import { SalesSnapshotsService } from "./sales-snapshots.service";

describe("SalesReturnService", () => {
  let service: SalesReturnService;
  let repository: jest.Mocked<SalesRepository>;
  let inventoryService: jest.Mocked<InventoryService>;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        SalesReturnService,
        SalesReturnSourceService,
        SalesSnapshotsService,
        ...buildSalesProviders(),
      ],
    }).compile();

    service = moduleRef.get(SalesReturnService);
    repository = moduleRef.get(SalesRepository);
    inventoryService = moduleRef.get(InventoryService);
  });

  describe("createSalesReturn", () => {
    it("should create sales return with inventory increase and document relations", async () => {
      (repository.findOrderByDocumentNo as jest.Mock).mockResolvedValue(null);
      (repository.findOrderById as jest.Mock).mockResolvedValue(
        mockOutboundOrder,
      );
      (repository.createOrder as jest.Mock).mockResolvedValue(
        mockSalesReturnOrder,
      );
      (
        inventoryService.listSourceUsagesForConsumerLine as jest.Mock
      ).mockResolvedValue([
        {
          sourceLogId: 10,
          consumerLineId: 1,
          allocatedQty: new Prisma.Decimal(50),
          releasedQty: new Prisma.Decimal(0),
          sourceLog: { unitCost: new Prisma.Decimal(8) },
        },
      ]);

      const dto = {
        documentNo: "SR-001",
        bizDate: "2025-03-14",
        sourceOutboundOrderId: 1,
        customerId: 10,
        handlerPersonnelId: 20,
        workshopId: 1,
        lines: [
          {
            materialId: 100,
            quantity: "50",
            sourceOutboundLineId: 1,
            unitPrice: "10",
          },
        ],
      };

      const result = await service.createSalesReturn(dto, "1");

      expect(result).toEqual(mockSalesReturnOrder);
      expect(inventoryService.increaseStock).toHaveBeenCalledWith(
        expect.objectContaining({
          materialId: 100,
          stockScope: "MAIN",
          projectTargetId: 7001,
          businessDocumentType: "SalesStockOrder",
          businessDocumentId: 2,
          businessDocumentNumber: "SR-001",
        }),
        expect.anything(),
      );
      expect(repository.createDocumentRelation).toHaveBeenCalledWith(
        expect.objectContaining({
          relationType: DocumentRelationType.SALES_RETURN_FROM_OUTBOUND,
          upstreamDocumentId: 1,
          downstreamDocumentId: 2,
        }),
        expect.anything(),
      );
      expect(repository.createDocumentLineRelation).toHaveBeenCalledWith(
        expect.objectContaining({
          relationType: DocumentRelationType.SALES_RETURN_FROM_OUTBOUND,
          upstreamDocumentId: 1,
          upstreamLineId: 1,
          downstreamDocumentId: 2,
          downstreamLineId: 2,
        }),
        expect.anything(),
      );
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

    it("should reject when split lines in the same request cumulatively exceed source outbound line quantity", async () => {
      (repository.findOrderByDocumentNo as jest.Mock).mockResolvedValue(null);
      (repository.findOrderById as jest.Mock).mockResolvedValue(
        mockOutboundOrder,
      );
      (
        repository.sumActiveReturnedQtyByOutboundLine as jest.Mock
      ).mockResolvedValue(new Map());

      const dto = {
        documentNo: "SR-002",
        bizDate: "2025-03-14",
        sourceOutboundOrderId: 1,
        customerId: 10,
        workshopId: 1,
        lines: [
          // Two lines targeting the same source line: 60 + 60 = 120 > 100
          { materialId: 100, quantity: "60", sourceOutboundLineId: 1 },
          { materialId: 100, quantity: "60", sourceOutboundLineId: 1 },
        ],
      };

      await expect(service.createSalesReturn(dto, "1")).rejects.toThrow(
        BadRequestException,
      );
      expect(repository.createOrder).not.toHaveBeenCalled();
    });

    it("should reject when existing active returns plus new return exceed source outbound line quantity", async () => {
      (repository.findOrderByDocumentNo as jest.Mock).mockResolvedValue(null);
      (repository.findOrderById as jest.Mock).mockResolvedValue(
        mockOutboundOrder,
      );
      // Existing active returns already consumed 70 of 100
      (
        repository.sumActiveReturnedQtyByOutboundLine as jest.Mock
      ).mockResolvedValue(new Map([[1, new Prisma.Decimal("70")]]));

      const dto = {
        documentNo: "SR-002",
        bizDate: "2025-03-14",
        sourceOutboundOrderId: 1,
        customerId: 10,
        workshopId: 1,
        lines: [
          // 70 already returned; adding 40 would be 110 > 100
          { materialId: 100, quantity: "40", sourceOutboundLineId: 1 },
        ],
      };

      await expect(service.createSalesReturn(dto, "1")).rejects.toThrow(
        BadRequestException,
      );
      expect(repository.createOrder).not.toHaveBeenCalled();
    });

    it("should allow return up to full quantity when prior returns were voided", async () => {
      (repository.findOrderByDocumentNo as jest.Mock).mockResolvedValue(null);
      (repository.findOrderById as jest.Mock).mockResolvedValue(
        mockOutboundOrder,
      );
      // All prior returns voided → active returned qty is 0
      (
        repository.sumActiveReturnedQtyByOutboundLine as jest.Mock
      ).mockResolvedValue(new Map());
      (repository.createOrder as jest.Mock).mockResolvedValue(
        mockSalesReturnOrder,
      );
      (
        inventoryService.listSourceUsagesForConsumerLine as jest.Mock
      ).mockResolvedValue([
        {
          sourceLogId: 10,
          consumerLineId: 1,
          allocatedQty: new Prisma.Decimal(100),
          releasedQty: new Prisma.Decimal(0),
          sourceLog: { unitCost: new Prisma.Decimal(8) },
        },
      ]);

      const dto = {
        documentNo: "SR-002",
        bizDate: "2025-03-14",
        sourceOutboundOrderId: 1,
        customerId: 10,
        workshopId: 1,
        lines: [
          // Exact full quantity — should succeed because prior return was voided
          { materialId: 100, quantity: "100", sourceOutboundLineId: 1 },
        ],
      };

      const result = await service.createSalesReturn(dto, "1");

      expect(result).toBeDefined();
      expect(repository.createOrder).toHaveBeenCalled();
    });

    it("should reject sales return when line-scoped source usages cannot cover the full return quantity", async () => {
      (repository.findOrderByDocumentNo as jest.Mock).mockResolvedValue(null);
      (repository.findOrderById as jest.Mock).mockResolvedValue(
        mockOutboundOrder,
      );
      (
        repository.sumActiveReturnedQtyByOutboundLine as jest.Mock
      ).mockResolvedValue(new Map());
      (repository.createOrder as jest.Mock).mockResolvedValue(
        mockSalesReturnOrder,
      );
      (
        inventoryService.listSourceUsagesForConsumerLine as jest.Mock
      ).mockResolvedValue([
        {
          sourceLogId: 10,
          consumerLineId: 1,
          allocatedQty: new Prisma.Decimal(20),
          releasedQty: new Prisma.Decimal(10),
          sourceLog: { unitCost: new Prisma.Decimal(8) },
        },
      ]);

      const dto = {
        documentNo: "SR-003",
        bizDate: "2025-03-14",
        sourceOutboundOrderId: 1,
        customerId: 10,
        workshopId: 1,
        lines: [{ materialId: 100, quantity: "20", sourceOutboundLineId: 1 }],
      };

      await expect(service.createSalesReturn(dto, "1")).rejects.toThrow(
        "销售退货来源库存释放不足",
      );
    });
  });
});
