import { Test } from "@nestjs/testing";
import { Prisma } from "../../../../generated/prisma/client";
import { InventoryService } from "../../inventory-core/application/inventory.service";
import { SalesRepository } from "../infrastructure/sales.repository";
import {
  buildSalesProviders,
  mockOutboundOrder,
} from "./sales.service.test-support";
import { SalesOutboundUpdateService } from "./sales-outbound-update.service";
import { SalesSnapshotsService } from "./sales-snapshots.service";
import { SalesTraceabilityService } from "./sales-traceability.service";

describe("SalesOutboundUpdateService", () => {
  let service: SalesOutboundUpdateService;
  let repository: jest.Mocked<SalesRepository>;
  let inventoryService: jest.Mocked<InventoryService>;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        SalesOutboundUpdateService,
        SalesSnapshotsService,
        SalesTraceabilityService,
        ...buildSalesProviders(),
      ],
    }).compile();

    service = moduleRef.get(SalesOutboundUpdateService);
    repository = moduleRef.get(SalesRepository);
    inventoryService = moduleRef.get(InventoryService);
  });

  describe("updateOrder", () => {
    it("should release source usages for deleted line before reversal", async () => {
      const updatedOrder = {
        ...mockOutboundOrder,
        revisionNo: 2,
        totalQty: new Prisma.Decimal(0),
        totalAmount: new Prisma.Decimal(0),
        lines: [],
      };
      (repository.findOrderById as jest.Mock)
        .mockResolvedValueOnce(mockOutboundOrder)
        .mockResolvedValueOnce(mockOutboundOrder)
        .mockResolvedValueOnce(updatedOrder);
      (inventoryService.getLogsForDocument as jest.Mock).mockResolvedValue([
        { id: 11, businessDocumentLineId: 1 },
      ]);

      await service.updateOrder(1, { bizDate: "2025-03-15", lines: [] }, "1");

      // releaseSourceUsagesForConsumerLine must be called BEFORE reverseStock
      const releaseCalls = (
        inventoryService.releaseSourceUsagesForConsumerLine as jest.Mock
      ).mock.invocationCallOrder;
      const reverseCalls = (inventoryService.reverseStock as jest.Mock).mock
        .invocationCallOrder;
      expect(releaseCalls.length).toBeGreaterThan(0);
      expect(reverseCalls.length).toBeGreaterThan(0);
      expect(releaseCalls[0]).toBeLessThan(reverseCalls[0]);

      expect(
        inventoryService.releaseSourceUsagesForConsumerLine,
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          consumerDocumentType: "SalesStockOrder",
          consumerDocumentId: 1,
          consumerLineId: 1,
        }),
        expect.anything(),
      );
    });

    it("should release line reservations when deleting outbound lines", async () => {
      const updatedOrder = {
        ...mockOutboundOrder,
        revisionNo: 2,
        totalQty: new Prisma.Decimal(0),
        totalAmount: new Prisma.Decimal(0),
        lines: [],
      };
      (repository.findOrderById as jest.Mock)
        .mockResolvedValueOnce(mockOutboundOrder)
        .mockResolvedValueOnce(mockOutboundOrder)
        .mockResolvedValueOnce(updatedOrder);
      (inventoryService.getLogsForDocument as jest.Mock).mockResolvedValue([
        {
          id: 11,
          businessDocumentLineId: 1,
        },
      ]);

      const result = await service.updateOrder(
        1,
        {
          bizDate: "2025-03-15",
          lines: [],
        },
        "1",
      );

      expect(inventoryService.reverseStock).toHaveBeenCalledWith(
        expect.objectContaining({
          logIdToReverse: 11,
        }),
        expect.anything(),
      );
      expect(
        inventoryService.releaseFactoryNumberReservations,
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          businessDocumentType: "SalesStockOrder",
          businessDocumentId: 1,
          businessDocumentLineId: 1,
        }),
        expect.anything(),
      );
      expect(repository.deleteOrderLine).toHaveBeenCalledWith(
        1,
        expect.anything(),
      );
      expect(result).toMatchObject(updatedOrder);
    });

    it("should replace line reservations when factory numbers change", async () => {
      const updatedLine = {
        ...mockOutboundOrder.lines[0],
        startNumber: "101",
        endNumber: "200",
      };
      const updatedOrder = {
        ...mockOutboundOrder,
        revisionNo: 2,
        lines: [updatedLine],
      };
      (repository.findOrderById as jest.Mock)
        .mockResolvedValueOnce(mockOutboundOrder)
        .mockResolvedValueOnce(mockOutboundOrder)
        .mockResolvedValueOnce(updatedOrder);
      (repository.updateOrderLine as jest.Mock).mockResolvedValue(updatedLine);
      (inventoryService.getLogsForDocument as jest.Mock).mockResolvedValue([
        {
          id: 11,
          businessDocumentLineId: 1,
        },
      ]);

      const result = await service.updateOrder(
        1,
        {
          lines: [
            {
              id: 1,
              materialId: 100,
              quantity: "100",
              selectedUnitCost: "10",
              unitPrice: "10",
              startNumber: "101",
              endNumber: "200",
            },
          ],
        },
        "1",
      );

      expect(
        inventoryService.releaseFactoryNumberReservations,
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          businessDocumentType: "SalesStockOrder",
          businessDocumentId: 1,
          businessDocumentLineId: 1,
        }),
        expect.anything(),
      );
      expect(inventoryService.reserveFactoryNumber).toHaveBeenCalledWith(
        expect.objectContaining({
          materialId: 100,
          stockScope: "MAIN",
          businessDocumentLineId: 1,
          startNumber: "101",
          endNumber: "200",
        }),
        expect.anything(),
      );
      expect(repository.updateOrderLine).toHaveBeenCalledWith(
        1,
        expect.objectContaining({
          materialCategoryIdSnapshot: 99,
          materialCategoryCodeSnapshot: "RESISTOR",
          materialCategoryNameSnapshot: "电阻",
          materialCategoryPathSnapshot: [
            { id: 99, categoryCode: "RESISTOR", categoryName: "电阻" },
          ],
        }),
        expect.anything(),
      );
      expect(result).toMatchObject(updatedOrder);
    });

    it("should reject duplicate material and selected-unit-cost combinations on update", async () => {
      (repository.findOrderById as jest.Mock).mockResolvedValue(
        mockOutboundOrder,
      );

      await expect(
        service.updateOrder(
          1,
          {
            lines: [
              {
                id: 1,
                materialId: 100,
                quantity: "10",
                selectedUnitCost: "10",
              },
              {
                materialId: 100,
                quantity: "5",
                selectedUnitCost: "10.00",
              },
            ],
          },
          "1",
        ),
      ).rejects.toThrow("同一单据内不允许重复的物料+价格层");
      expect(repository.updateOrder).not.toHaveBeenCalled();
    });
  });
});
