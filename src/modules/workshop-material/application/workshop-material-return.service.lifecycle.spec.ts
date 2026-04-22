import {
  AuditStatusSnapshot,
  DocumentLifecycleStatus,
  InventoryEffectStatus,
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

describe("WorkshopMaterialReturnService / lifecycle", () => {
  const mockPickOrder = buildMockPickOrder();
  const mockReturnOrderWithSource = buildMockReturnOrderWithSource();

  let mocks: WorkshopMaterialMocks;
  let service: ReturnType<typeof createReturnService>;

  beforeEach(() => {
    mocks = createMocks();
    applyDefaultMasterDataResponses(mocks);
    service = createReturnService(mocks);
  });

  describe("voidReturnOrder", () => {
    const mockReturnOrderEffective = {
      ...mockReturnOrderWithSource,
      lifecycleStatus: DocumentLifecycleStatus.EFFECTIVE,
      inventoryEffectStatus: InventoryEffectStatus.POSTED,
    };

    it("should restore released source usages when voiding a return order", async () => {
      (mocks.repository.findOrderById as jest.Mock)
        .mockResolvedValueOnce(mockReturnOrderEffective)
        .mockResolvedValueOnce({
          ...mockReturnOrderEffective,
          lifecycleStatus: DocumentLifecycleStatus.VOIDED,
          inventoryEffectStatus: InventoryEffectStatus.REVERSED,
        });
      (
        mocks.inventoryService.listSourceUsagesForConsumerLine as jest.Mock
      ).mockResolvedValue([
        {
          sourceLogId: 10,
          consumerLineId: 1,
          allocatedQty: new Prisma.Decimal(50),
          releasedQty: new Prisma.Decimal(20),
        },
      ]);
      (
        mocks.inventoryService.getLogsForDocument as jest.Mock
      ).mockResolvedValue([{ id: 5 }]);
      (mocks.repository.updateOrder as jest.Mock).mockResolvedValue({});

      await service.voidReturnOrder(2, "void for re-return test", "1");

      expect(
        mocks.inventoryService.releaseInventorySource,
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          sourceLogId: 10,
          consumerDocumentId: 1,
          consumerLineId: 1,
          targetReleasedQty: new Prisma.Decimal(0),
        }),
        expect.anything(),
      );
      expect(
        mocks.repository.deactivateDocumentRelationsForReturn,
      ).toHaveBeenCalledWith(2, expect.anything());
    });

    it("should restore partial usages across multiple records and reverse inventory", async () => {
      (mocks.repository.findOrderById as jest.Mock)
        .mockResolvedValueOnce(mockReturnOrderEffective)
        .mockResolvedValueOnce({
          ...mockReturnOrderEffective,
          lifecycleStatus: DocumentLifecycleStatus.VOIDED,
        });
      (
        mocks.inventoryService.listSourceUsagesForConsumerLine as jest.Mock
      ).mockResolvedValue([
        {
          sourceLogId: 10,
          consumerLineId: 1,
          allocatedQty: new Prisma.Decimal(15),
          releasedQty: new Prisma.Decimal(15),
        },
        {
          sourceLogId: 11,
          consumerLineId: 1,
          allocatedQty: new Prisma.Decimal(35),
          releasedQty: new Prisma.Decimal(5),
        },
      ]);
      (
        mocks.inventoryService.getLogsForDocument as jest.Mock
      ).mockResolvedValue([{ id: 5 }]);
      (mocks.repository.updateOrder as jest.Mock).mockResolvedValue({});

      await service.voidReturnOrder(2, "Test void", "1");

      expect(
        mocks.inventoryService.releaseInventorySource,
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          sourceLogId: 11,
          targetReleasedQty: new Prisma.Decimal(0),
        }),
        expect.anything(),
      );
      expect(
        mocks.inventoryService.releaseInventorySource,
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          sourceLogId: 10,
          targetReleasedQty: new Prisma.Decimal(0),
        }),
        expect.anything(),
      );
      expect(mocks.inventoryService.reverseStock).toHaveBeenCalledWith(
        expect.objectContaining({ logIdToReverse: 5 }),
        expect.anything(),
      );
    });
  });

  describe("updateReturnOrder", () => {
    it("should restore old return usages, replace lines, and replay return linkage", async () => {
      const existingReturnOrder = mockReturnOrderWithSource;
      const createdReturnLine = {
        ...existingReturnOrder.lines[0],
        id: 20,
        quantity: new Prisma.Decimal(15),
        amount: new Prisma.Decimal(150),
      };
      const revisedReturnOrder = {
        ...existingReturnOrder,
        bizDate: new Date("2025-03-15"),
        revisionNo: 2,
        totalQty: new Prisma.Decimal(15),
        totalAmount: new Prisma.Decimal(150),
        lines: [createdReturnLine],
      };

      (mocks.repository.findOrderById as jest.Mock)
        .mockResolvedValueOnce(existingReturnOrder)
        .mockResolvedValueOnce(existingReturnOrder)
        .mockResolvedValueOnce(mockPickOrder)
        .mockResolvedValueOnce(mockPickOrder)
        .mockResolvedValueOnce(revisedReturnOrder);
      (mocks.repository.createOrderLine as jest.Mock).mockResolvedValue(
        createdReturnLine,
      );
      (mocks.repository.updateOrder as jest.Mock).mockResolvedValue(
        revisedReturnOrder,
      );
      (
        mocks.inventoryService.getLogsForDocument as jest.Mock
      ).mockResolvedValue([{ id: 5, businessDocumentLineId: 10 }]);
      (
        mocks.inventoryService.listSourceUsagesForConsumerLine as jest.Mock
      )
        .mockResolvedValueOnce([
          {
            sourceLogId: 10,
            consumerLineId: 1,
            allocatedQty: new Prisma.Decimal(50),
            releasedQty: new Prisma.Decimal(20),
          },
        ])
        .mockResolvedValueOnce([
          {
            sourceLogId: 10,
            consumerLineId: 1,
            allocatedQty: new Prisma.Decimal(50),
            releasedQty: new Prisma.Decimal(0),
          },
        ]);

      const result = await service.updateReturnOrder(
        2,
        {
          documentNo: "WM-RETURN-001",
          orderType: WorkshopMaterialOrderType.RETURN,
          bizDate: "2025-03-15",
          workshopId: 1,
          lines: [
            {
              materialId: 100,
              quantity: "15",
              unitPrice: "10",
              sourceDocumentType: "WorkshopMaterialOrder",
              sourceDocumentId: 1,
              sourceDocumentLineId: 1,
            },
          ],
        },
        "1",
      );

      expect(mocks.inventoryService.reverseStock).toHaveBeenCalledWith(
        expect.objectContaining({ logIdToReverse: 5 }),
        expect.anything(),
      );
      expect(
        mocks.repository.deactivateDocumentRelationsForReturn,
      ).toHaveBeenCalledWith(2, expect.anything());
      expect(
        mocks.repository.deleteDocumentLineRelationsForReturn,
      ).toHaveBeenCalledWith(2, expect.anything());
      expect(mocks.repository.deleteOrderLinesByOrderId).toHaveBeenCalledWith(
        2,
        expect.anything(),
      );
      expect(mocks.inventoryService.increaseStock).toHaveBeenCalledWith(
        expect.objectContaining({
          businessDocumentId: 2,
          businessDocumentLineId: 20,
          quantity: new Prisma.Decimal(15),
          operationType: "RETURN_IN",
        }),
        expect.anything(),
      );
      expect(
        mocks.inventoryService.releaseInventorySource,
      ).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({
          sourceLogId: 10,
          targetReleasedQty: new Prisma.Decimal(0),
        }),
        expect.anything(),
      );
      expect(
        mocks.inventoryService.releaseInventorySource,
      ).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
          sourceLogId: 10,
          targetReleasedQty: new Prisma.Decimal(15),
        }),
        expect.anything(),
      );
      expect(mocks.repository.updateOrder).toHaveBeenCalledWith(
        2,
        expect.objectContaining({
          revisionNo: { increment: 1 },
          totalQty: new Prisma.Decimal(15),
          totalAmount: new Prisma.Decimal(150),
          auditStatusSnapshot: AuditStatusSnapshot.PENDING,
        }),
        expect.anything(),
      );
      expect(
        mocks.approvalService.createOrRefreshApprovalDocument,
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          documentType: "WorkshopMaterialOrder",
          documentId: 2,
          documentNumber: "WM-RETURN-001",
        }),
        expect.anything(),
      );
      expect(result).toEqual(revisedReturnOrder);
    });
  });
});
