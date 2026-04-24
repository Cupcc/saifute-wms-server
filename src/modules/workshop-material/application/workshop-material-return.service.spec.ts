import { BadRequestException } from "@nestjs/common";
import {
  Prisma,
  WorkshopMaterialOrderType,
} from "../../../../generated/prisma/client";
import {
  applyDefaultMasterDataResponses,
  buildMockPickOrder,
  buildMockReturnOrderWithSource,
  createMocks,
  createReturnService,
  type WorkshopMaterialMocks,
} from "./workshop-material.service.test-support";

describe("WorkshopMaterialReturnService / createReturnOrder", () => {
  const mockPickOrder = buildMockPickOrder();
  const mockReturnOrderWithSource = buildMockReturnOrderWithSource();

  let mocks: WorkshopMaterialMocks;
  let service: ReturnType<typeof createReturnService>;

  beforeEach(() => {
    mocks = createMocks();
    applyDefaultMasterDataResponses(mocks);
    service = createReturnService(mocks);
  });

  it("should create return order with increaseStock", async () => {
    const mockReturnOrder = {
      ...mockPickOrder,
      id: 2,
      documentNo: "WM-RETURN-001",
      orderType: WorkshopMaterialOrderType.RETURN,
    };
    (mocks.repository.findOrderByDocumentNo as jest.Mock).mockResolvedValue(
      null,
    );
    (mocks.repository.createOrder as jest.Mock).mockResolvedValue(
      mockReturnOrder,
    );

    const dto = {
      documentNo: "WM-RETURN-001",
      orderType: WorkshopMaterialOrderType.RETURN,
      bizDate: "2025-03-14",
      workshopId: 1,
      lines: [{ materialId: 100, quantity: "20" }],
    };

    const result = await service.createReturnOrder(dto, "1");

    expect(result.orderType).toBe(WorkshopMaterialOrderType.RETURN);
    expect(mocks.inventoryService.increaseStock).toHaveBeenCalledWith(
      expect.objectContaining({
        materialId: 100,
        stockScope: "MAIN",
        operationType: "RETURN_IN",
        quantity: expect.anything(),
      }),
      expect.anything(),
    );
  });

  it("should reject when split lines in same request cumulatively exceed source pick line quantity", async () => {
    const returnOrderWithTwoLines = {
      ...mockReturnOrderWithSource,
      lines: [
        {
          ...mockReturnOrderWithSource.lines[0],
          id: 10,
          quantity: new Prisma.Decimal(30),
        },
        {
          ...mockReturnOrderWithSource.lines[0],
          id: 11,
          lineNo: 2,
          quantity: new Prisma.Decimal(30),
        },
      ],
    };
    (mocks.repository.findOrderByDocumentNo as jest.Mock).mockResolvedValue(
      null,
    );
    (mocks.repository.createOrder as jest.Mock).mockResolvedValue(
      returnOrderWithTwoLines,
    );
    (mocks.repository.findOrderById as jest.Mock).mockResolvedValue(
      mockPickOrder,
    );
    (
      mocks.repository.sumActiveReturnedQtyByPickLine as jest.Mock
    ).mockResolvedValue(new Map());

    const dto = {
      documentNo: "WM-RETURN-002",
      orderType: WorkshopMaterialOrderType.RETURN,
      bizDate: "2025-03-14",
      workshopId: 1,
      lines: [
        {
          materialId: 100,
          quantity: "30",
          sourceDocumentType: "WorkshopMaterialOrder",
          sourceDocumentId: 1,
          sourceDocumentLineId: 1,
        },
        {
          materialId: 100,
          quantity: "30",
          sourceDocumentType: "WorkshopMaterialOrder",
          sourceDocumentId: 1,
          sourceDocumentLineId: 1,
        },
      ],
    };

    await expect(service.createReturnOrder(dto, "1")).rejects.toThrow(
      BadRequestException,
    );
  });

  it("should reject when existing active returns plus new return exceed source pick line quantity", async () => {
    (mocks.repository.findOrderByDocumentNo as jest.Mock).mockResolvedValue(
      null,
    );
    (mocks.repository.createOrder as jest.Mock).mockResolvedValue(
      mockReturnOrderWithSource,
    );
    (mocks.repository.findOrderById as jest.Mock).mockResolvedValue(
      mockPickOrder,
    );
    (
      mocks.repository.sumActiveReturnedQtyByPickLine as jest.Mock
    ).mockResolvedValue(new Map([[1, new Prisma.Decimal("40")]]));

    const dto = {
      documentNo: "WM-RETURN-002",
      orderType: WorkshopMaterialOrderType.RETURN,
      bizDate: "2025-03-14",
      workshopId: 1,
      lines: [
        {
          materialId: 100,
          quantity: "20",
          sourceDocumentType: "WorkshopMaterialOrder",
          sourceDocumentId: 1,
          sourceDocumentLineId: 1,
        },
      ],
    };

    await expect(service.createReturnOrder(dto, "1")).rejects.toThrow(
      BadRequestException,
    );
  });

  it("should release source usage only up to the returned quantity", async () => {
    (mocks.repository.findOrderByDocumentNo as jest.Mock).mockResolvedValue(
      null,
    );
    (mocks.repository.createOrder as jest.Mock).mockResolvedValue(
      mockReturnOrderWithSource,
    );
    (mocks.repository.findOrderById as jest.Mock).mockResolvedValue(
      mockPickOrder,
    );
    (
      mocks.repository.sumActiveReturnedQtyByPickLine as jest.Mock
    ).mockResolvedValue(new Map());
    (
      mocks.inventoryService.listSourceUsagesForConsumerLine as jest.Mock
    ).mockResolvedValue([
      {
        sourceLogId: 10,
        consumerLineId: 1,
        allocatedQty: new Prisma.Decimal(50),
        releasedQty: new Prisma.Decimal(0),
      },
    ]);

    const dto = {
      documentNo: "WM-RETURN-002",
      orderType: WorkshopMaterialOrderType.RETURN,
      bizDate: "2025-03-14",
      workshopId: 1,
      lines: [
        {
          materialId: 100,
          quantity: "20",
          sourceDocumentType: "WorkshopMaterialOrder",
          sourceDocumentId: 1,
          sourceDocumentLineId: 1,
        },
      ],
    };

    await service.createReturnOrder(dto, "1");

    expect(mocks.inventoryService.releaseInventorySource).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceLogId: 10,
        targetReleasedQty: new Prisma.Decimal(20),
      }),
      expect.anything(),
    );
    expect(
      mocks.inventoryService.releaseInventorySource,
    ).not.toHaveBeenCalledWith(
      expect.objectContaining({
        targetReleasedQty: new Prisma.Decimal(50),
      }),
      expect.anything(),
    );
  });

  it("should release incrementally across multiple usage records", async () => {
    (mocks.repository.findOrderByDocumentNo as jest.Mock).mockResolvedValue(
      null,
    );
    (mocks.repository.createOrder as jest.Mock).mockResolvedValue(
      mockReturnOrderWithSource,
    );
    (mocks.repository.findOrderById as jest.Mock).mockResolvedValue(
      mockPickOrder,
    );
    (
      mocks.repository.sumActiveReturnedQtyByPickLine as jest.Mock
    ).mockResolvedValue(new Map());
    (
      mocks.inventoryService.listSourceUsagesForConsumerLine as jest.Mock
    ).mockResolvedValue([
      {
        sourceLogId: 10,
        consumerLineId: 1,
        allocatedQty: new Prisma.Decimal(30),
        releasedQty: new Prisma.Decimal(0),
      },
      {
        sourceLogId: 11,
        consumerLineId: 1,
        allocatedQty: new Prisma.Decimal(20),
        releasedQty: new Prisma.Decimal(0),
      },
    ]);

    const dto = {
      documentNo: "WM-RETURN-002",
      orderType: WorkshopMaterialOrderType.RETURN,
      bizDate: "2025-03-14",
      workshopId: 1,
      lines: [
        {
          materialId: 100,
          quantity: "20",
          sourceDocumentType: "WorkshopMaterialOrder",
          sourceDocumentId: 1,
          sourceDocumentLineId: 1,
        },
      ],
    };

    await service.createReturnOrder(dto, "1");

    expect(mocks.inventoryService.releaseInventorySource).toHaveBeenCalledTimes(
      1,
    );
    expect(mocks.inventoryService.releaseInventorySource).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceLogId: 10,
        targetReleasedQty: new Prisma.Decimal(20),
      }),
      expect.anything(),
    );
  });

  it("should reject when source usages cannot cover the full linked quantity", async () => {
    (mocks.repository.findOrderByDocumentNo as jest.Mock).mockResolvedValue(
      null,
    );
    (mocks.repository.createOrder as jest.Mock).mockResolvedValue(
      mockReturnOrderWithSource,
    );
    (mocks.repository.findOrderById as jest.Mock).mockResolvedValue(
      mockPickOrder,
    );
    (
      mocks.repository.sumActiveReturnedQtyByPickLine as jest.Mock
    ).mockResolvedValue(new Map());
    (
      mocks.inventoryService.listSourceUsagesForConsumerLine as jest.Mock
    ).mockResolvedValue([
      {
        sourceLogId: 10,
        consumerLineId: 1,
        allocatedQty: new Prisma.Decimal(20),
        releasedQty: new Prisma.Decimal(10),
      },
    ]);

    const dto = {
      documentNo: "WM-RETURN-002",
      orderType: WorkshopMaterialOrderType.RETURN,
      bizDate: "2025-03-14",
      workshopId: 1,
      lines: [
        {
          materialId: 100,
          quantity: "20",
          sourceDocumentType: "WorkshopMaterialOrder",
          sourceDocumentId: 1,
          sourceDocumentLineId: 1,
        },
      ],
    };

    await expect(service.createReturnOrder(dto, "1")).rejects.toThrow(
      BadRequestException,
    );
  });

  it("full sequence: re-return after void releases correctly from restored usages", async () => {
    const mockReReturn = {
      ...mockReturnOrderWithSource,
      documentNo: "WM-RETURN-003",
      lines: [
        {
          ...mockReturnOrderWithSource.lines[0],
          quantity: new Prisma.Decimal(30),
        },
      ],
    };
    (mocks.repository.findOrderByDocumentNo as jest.Mock).mockResolvedValue(
      null,
    );
    (mocks.repository.createOrder as jest.Mock).mockResolvedValue(mockReReturn);
    (mocks.repository.findOrderById as jest.Mock).mockResolvedValue(
      mockPickOrder,
    );
    (
      mocks.repository.sumActiveReturnedQtyByPickLine as jest.Mock
    ).mockResolvedValue(new Map());
    (
      mocks.inventoryService.listSourceUsagesForConsumerLine as jest.Mock
    ).mockResolvedValue([
      {
        sourceLogId: 10,
        consumerLineId: 1,
        allocatedQty: new Prisma.Decimal(50),
        releasedQty: new Prisma.Decimal(0),
      },
    ]);

    const dto = {
      documentNo: "WM-RETURN-003",
      orderType: WorkshopMaterialOrderType.RETURN,
      bizDate: "2025-03-14",
      workshopId: 1,
      lines: [
        {
          materialId: 100,
          quantity: "30",
          sourceDocumentType: "WorkshopMaterialOrder",
          sourceDocumentId: 1,
          sourceDocumentLineId: 1,
        },
      ],
    };

    await service.createReturnOrder(dto, "1");

    expect(mocks.inventoryService.releaseInventorySource).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceLogId: 10,
        targetReleasedQty: new Prisma.Decimal(30),
      }),
      expect.anything(),
    );
  });
});
