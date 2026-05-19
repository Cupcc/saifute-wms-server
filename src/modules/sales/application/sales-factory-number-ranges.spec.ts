import { Test } from "@nestjs/testing";
import { Prisma } from "../../../../generated/prisma/client";
import { InventoryService } from "../../inventory-core/application/inventory.service";
import { SalesRepository } from "../infrastructure/sales.repository";
import { parseFactoryNumberRanges } from "./factory-number-ranges";
import {
  buildSalesProviders,
  mockOutboundOrder,
} from "./sales.service.test-support";
import { SalesOutboundService } from "./sales-outbound.service";
import { SalesOutboundUpdateService } from "./sales-outbound-update.service";
import { SalesSnapshotsService } from "./sales-snapshots.service";
import { SalesTraceabilityService } from "./sales-traceability.service";

describe("sales factory number ranges", () => {
  it("parses comma-separated number ranges", () => {
    expect(parseFactoryNumberRanges("23676-23696,23776-23990,")).toEqual({
      ranges: [
        { startNumber: "23676", endNumber: "23696" },
        { startNumber: "23776", endNumber: "23990" },
      ],
      invalidSegments: [],
    });
  });

  it("creates one reservation for each segment in a single field", async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        SalesOutboundService,
        SalesSnapshotsService,
        SalesTraceabilityService,
        ...buildSalesProviders(),
      ],
    }).compile();
    const service = moduleRef.get(SalesOutboundService);
    const repository = moduleRef.get(SalesRepository);
    const inventoryService = moduleRef.get(InventoryService);
    (
      inventoryService.listPriceLayerAvailability as jest.Mock
    ).mockResolvedValue([
      {
        materialId: 100,
        unitCost: new Prisma.Decimal(10),
        availableQty: new Prisma.Decimal(300),
        sourceLogCount: 1,
      },
    ]);
    const orderWithFactoryNumbers = {
      ...mockOutboundOrder,
      totalQty: new Prisma.Decimal(236),
      lines: [
        {
          ...mockOutboundOrder.lines[0],
          quantity: new Prisma.Decimal(236),
          startNumber: "23676-23696,23776-23990",
          endNumber: null,
        },
      ],
    };
    (repository.findOrderByDocumentNo as jest.Mock).mockResolvedValue(null);
    (repository.createOrder as jest.Mock).mockResolvedValue(
      orderWithFactoryNumbers,
    );

    await service.createOrder(
      {
        documentNo: "OB-MULTI",
        bizDate: "2025-03-14",
        customerId: 10,
        handlerPersonnelId: 20,
        workshopId: 1,
        lines: [
          {
            materialId: 100,
            salesProjectId: 300,
            quantity: "236",
            selectedUnitCost: "10",
            unitPrice: "10",
            factoryNumber: "23676-23696,23776-23990",
          },
        ],
      },
      "1",
    );

    expect(repository.createOrder).toHaveBeenCalledWith(
      expect.anything(),
      expect.arrayContaining([
        expect.objectContaining({
          startNumber: "23676-23696,23776-23990",
          endNumber: null,
        }),
      ]),
      expect.anything(),
    );
    expect(inventoryService.reserveFactoryNumber).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ startNumber: "23676", endNumber: "23696" }),
      expect.anything(),
    );
    expect(inventoryService.reserveFactoryNumber).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ startNumber: "23776", endNumber: "23990" }),
      expect.anything(),
    );
  });

  it("rejects create when factory-number count differs from quantity", async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        SalesOutboundService,
        SalesSnapshotsService,
        SalesTraceabilityService,
        ...buildSalesProviders(),
      ],
    }).compile();
    const service = moduleRef.get(SalesOutboundService);
    const repository = moduleRef.get(SalesRepository);

    await expect(
      service.createOrder(
        {
          documentNo: "OB-MISMATCH",
          bizDate: "2025-03-14",
          customerId: 10,
          handlerPersonnelId: 20,
          workshopId: 1,
          lines: [
            {
              materialId: 100,
              salesProjectId: 300,
              quantity: "2",
              selectedUnitCost: "10",
              unitPrice: "10",
              factoryNumber: "24000-24002",
            },
          ],
        },
        "1",
      ),
    ).rejects.toThrow("编号数量与出库数量不一致");
    expect(repository.createOrder).not.toHaveBeenCalled();
  });

  it("releases and recreates reservations for single-field changes", async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        SalesOutboundUpdateService,
        SalesSnapshotsService,
        SalesTraceabilityService,
        ...buildSalesProviders(),
      ],
    }).compile();
    const service = moduleRef.get(SalesOutboundUpdateService);
    const repository = moduleRef.get(SalesRepository);
    const inventoryService = moduleRef.get(InventoryService);
    const existingOrder = {
      ...mockOutboundOrder,
      lines: [
        {
          ...mockOutboundOrder.lines[0],
          startNumber: "23676-23696,23776-23990",
          endNumber: null,
        },
      ],
    };
    const updatedLine = {
      ...existingOrder.lines[0],
      quantity: new Prisma.Decimal(3),
      amount: new Prisma.Decimal(30),
      startNumber: "24000-24002",
      endNumber: null,
    };
    const updatedOrder = {
      ...existingOrder,
      revisionNo: 2,
      lines: [updatedLine],
    };
    (repository.findOrderById as jest.Mock)
      .mockResolvedValueOnce(existingOrder)
      .mockResolvedValueOnce(existingOrder)
      .mockResolvedValueOnce(updatedOrder);
    (repository.updateOrderLine as jest.Mock).mockResolvedValue(updatedLine);
    (inventoryService.getLogsForDocument as jest.Mock).mockResolvedValue([
      { id: 11, businessDocumentLineId: 1 },
    ]);

    await service.updateOrder(
      1,
      {
        lines: [
          {
            id: 1,
            materialId: 100,
            salesProjectId: 300,
            quantity: "3",
            selectedUnitCost: "10",
            unitPrice: "10",
            factoryNumber: "24000-24002",
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
        businessDocumentLineId: 1,
        startNumber: "24000",
        endNumber: "24002",
      }),
      expect.anything(),
    );
  });

  it("rejects update when factory-number count differs from quantity", async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        SalesOutboundUpdateService,
        SalesSnapshotsService,
        SalesTraceabilityService,
        ...buildSalesProviders(),
      ],
    }).compile();
    const service = moduleRef.get(SalesOutboundUpdateService);
    const repository = moduleRef.get(SalesRepository);

    await expect(
      service.updateOrder(
        1,
        {
          lines: [
            {
              id: 1,
              materialId: 100,
              salesProjectId: 300,
              quantity: "2",
              selectedUnitCost: "10",
              unitPrice: "10",
              factoryNumber: "24000-24002",
            },
          ],
        },
        "1",
      ),
    ).rejects.toThrow("编号数量与出库数量不一致");
    expect(repository.updateOrder).not.toHaveBeenCalled();
  });
});
