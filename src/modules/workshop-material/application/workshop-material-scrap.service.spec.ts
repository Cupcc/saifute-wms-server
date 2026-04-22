import {
  AuditStatusSnapshot,
  DocumentLifecycleStatus,
  InventoryEffectStatus,
  Prisma,
  WorkshopMaterialOrderType,
} from "../../../../generated/prisma/client";
import {
  applyDefaultMasterDataResponses,
  createMocks,
  createScrapService,
  type WorkshopMaterialMocks,
} from "./workshop-material.service.test-support";

describe("WorkshopMaterialScrapService", () => {
  const mockPickOrder = {
    id: 1,
    documentNo: "WM-PICK-001",
    orderType: WorkshopMaterialOrderType.PICK,
    bizDate: new Date("2025-03-14"),
    handlerPersonnelId: 20,
    workshopId: 1,
    lifecycleStatus: DocumentLifecycleStatus.EFFECTIVE,
    auditStatusSnapshot: AuditStatusSnapshot.PENDING,
    inventoryEffectStatus: InventoryEffectStatus.POSTED,
    revisionNo: 1,
    handlerNameSnapshot: "Handler A",
    workshopNameSnapshot: "Workshop A",
    totalQty: new Prisma.Decimal(50),
    totalAmount: new Prisma.Decimal(500),
    remark: null,
    voidReason: null,
    voidedBy: null,
    voidedAt: null,
    createdBy: "1",
    createdAt: new Date(),
    updatedBy: "1",
    updatedAt: new Date(),
    lines: [
      {
        id: 1,
        orderId: 1,
        lineNo: 1,
        materialId: 100,
        materialCodeSnapshot: "MAT001",
        materialNameSnapshot: "Material A",
        materialSpecSnapshot: "Spec",
        unitCodeSnapshot: "PCS",
        quantity: new Prisma.Decimal(50),
        unitPrice: new Prisma.Decimal(10),
        amount: new Prisma.Decimal(500),
        costUnitPrice: null,
        costAmount: null,
        sourceDocumentType: null,
        sourceDocumentId: null,
        sourceDocumentLineId: null,
        remark: null,
        createdBy: "1",
        createdAt: new Date(),
        updatedBy: "1",
        updatedAt: new Date(),
      },
    ],
  };

  let mocks: WorkshopMaterialMocks;
  let service: ReturnType<typeof createScrapService>;

  beforeEach(() => {
    mocks = createMocks();
    applyDefaultMasterDataResponses(mocks);
    service = createScrapService(mocks);
  });

  describe("createScrapOrder", () => {
    it("should create scrap order with settleConsumerOut and NOT_REQUIRED audit", async () => {
      const mockScrapOrder = {
        ...mockPickOrder,
        id: 2,
        documentNo: "WM-SCRAP-001",
        orderType: WorkshopMaterialOrderType.SCRAP,
      };
      (mocks.repository.findOrderByDocumentNo as jest.Mock).mockResolvedValue(
        null,
      );
      (mocks.repository.createOrder as jest.Mock).mockResolvedValue(
        mockScrapOrder,
      );

      const dto = {
        documentNo: "WM-SCRAP-001",
        orderType: WorkshopMaterialOrderType.SCRAP,
        bizDate: "2025-03-14",
        workshopId: 1,
        lines: [{ materialId: 100, quantity: "10" }],
      };

      const result = await service.createScrapOrder(dto, "1");

      expect(result.orderType).toBe(WorkshopMaterialOrderType.SCRAP);
      expect(mocks.inventoryService.settleConsumerOut).toHaveBeenCalledWith(
        expect.objectContaining({
          operationType: "SCRAP_OUT",
        }),
        expect.anything(),
      );
      expect(
        mocks.approvalService.createOrRefreshApprovalDocument,
      ).not.toHaveBeenCalled();
    });
  });

  describe("updateScrapOrder", () => {
    it("should reverse and replay scrap inventory effects while resetting approval snapshot", async () => {
      const existingScrapOrder = {
        ...mockPickOrder,
        id: 3,
        documentNo: "WM-SCRAP-001",
        orderType: WorkshopMaterialOrderType.SCRAP,
        auditStatusSnapshot: AuditStatusSnapshot.NOT_REQUIRED,
      };
      const recreatedScrapLine = {
        ...existingScrapOrder.lines[0],
        id: 30,
        orderId: 3,
        quantity: new Prisma.Decimal(6),
        amount: new Prisma.Decimal(60),
      };
      const revisedScrapOrder = {
        ...existingScrapOrder,
        bizDate: new Date("2025-03-15"),
        revisionNo: 2,
        totalQty: new Prisma.Decimal(6),
        totalAmount: new Prisma.Decimal(60),
        lines: [recreatedScrapLine],
      };

      (mocks.repository.findOrderById as jest.Mock)
        .mockResolvedValueOnce(existingScrapOrder)
        .mockResolvedValueOnce(existingScrapOrder)
        .mockResolvedValueOnce(revisedScrapOrder);
      (mocks.repository.createOrderLine as jest.Mock).mockResolvedValue(
        recreatedScrapLine,
      );
      (mocks.repository.updateOrder as jest.Mock).mockResolvedValue(
        revisedScrapOrder,
      );
      (
        mocks.inventoryService.getLogsForDocument as jest.Mock
      ).mockResolvedValue([{ id: 7, businessDocumentLineId: 1 }]);

      const result = await service.updateScrapOrder(
        3,
        {
          documentNo: "WM-SCRAP-001",
          orderType: WorkshopMaterialOrderType.SCRAP,
          bizDate: "2025-03-15",
          workshopId: 1,
          lines: [{ materialId: 100, quantity: "6", unitPrice: "10" }],
        },
        "1",
      );

      expect(
        mocks.inventoryService.releaseAllSourceUsagesForConsumer,
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          consumerDocumentType: "WorkshopMaterialOrder",
          consumerDocumentId: 3,
          operatorId: "1",
        }),
        expect.anything(),
      );
      expect(mocks.inventoryService.reverseStock).toHaveBeenCalledWith(
        expect.objectContaining({
          logIdToReverse: 7,
          idempotencyKey: "WorkshopMaterialOrder:rev:3:r2:log:7",
        }),
        expect.anything(),
      );
      expect(mocks.inventoryService.settleConsumerOut).toHaveBeenCalledWith(
        expect.objectContaining({
          businessDocumentId: 3,
          businessDocumentLineId: 30,
          quantity: new Prisma.Decimal(6),
          operationType: "SCRAP_OUT",
          idempotencyKey: "WorkshopMaterialOrder:3:rev:2:line:30",
        }),
        expect.anything(),
      );
      expect(mocks.repository.updateOrder).toHaveBeenCalledWith(
        3,
        expect.objectContaining({
          revisionNo: { increment: 1 },
          totalQty: new Prisma.Decimal(6),
          totalAmount: new Prisma.Decimal(60),
          auditStatusSnapshot: AuditStatusSnapshot.NOT_REQUIRED,
        }),
        expect.anything(),
      );
      expect(
        mocks.approvalService.markApprovalNotRequired,
      ).toHaveBeenCalledWith(
        "WorkshopMaterialOrder",
        3,
        "1",
        expect.anything(),
      );
      expect(
        mocks.approvalService.createOrRefreshApprovalDocument,
      ).not.toHaveBeenCalled();
      expect(result).toEqual(revisedScrapOrder);
    });
  });

  describe("voidScrapOrder", () => {
    it("should void scrap order, release source usage, and reverse inventory", async () => {
      const scrapOrder = {
        ...mockPickOrder,
        id: 3,
        documentNo: "WM-SCRAP-001",
        orderType: WorkshopMaterialOrderType.SCRAP,
        auditStatusSnapshot: AuditStatusSnapshot.NOT_REQUIRED,
      };

      (mocks.repository.findOrderById as jest.Mock)
        .mockResolvedValueOnce(scrapOrder)
        .mockResolvedValueOnce({
          ...scrapOrder,
          lifecycleStatus: DocumentLifecycleStatus.VOIDED,
          inventoryEffectStatus: InventoryEffectStatus.REVERSED,
        });
      (
        mocks.inventoryService.getLogsForDocument as jest.Mock
      ).mockResolvedValue([{ id: 9 }]);
      (mocks.repository.updateOrder as jest.Mock).mockResolvedValue({
        ...scrapOrder,
        lifecycleStatus: DocumentLifecycleStatus.VOIDED,
      });

      const result = await service.voidScrapOrder(3, "scrap void", "1");

      expect(
        mocks.inventoryService.releaseAllSourceUsagesForConsumer,
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          consumerDocumentType: "WorkshopMaterialOrder",
          consumerDocumentId: 3,
          operatorId: "1",
        }),
        expect.anything(),
      );
      expect(mocks.inventoryService.reverseStock).toHaveBeenCalledWith(
        expect.objectContaining({
          logIdToReverse: 9,
          idempotencyKey: "WorkshopMaterialOrder:void:3:log:9",
        }),
        expect.anything(),
      );
      expect(mocks.repository.updateOrder).toHaveBeenCalledWith(
        3,
        expect.objectContaining({
          lifecycleStatus: DocumentLifecycleStatus.VOIDED,
          inventoryEffectStatus: InventoryEffectStatus.REVERSED,
          auditStatusSnapshot: AuditStatusSnapshot.NOT_REQUIRED,
          voidReason: "scrap void",
        }),
        expect.anything(),
      );
      expect(
        mocks.approvalService.markApprovalNotRequired,
      ).toHaveBeenCalledWith(
        "WorkshopMaterialOrder",
        3,
        "1",
        expect.anything(),
      );
      expect(result).not.toBeNull();
      if (result) {
        expect(result.lifecycleStatus).toBe(DocumentLifecycleStatus.VOIDED);
      }
    });
  });
});
