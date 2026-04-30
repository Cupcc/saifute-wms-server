import { NotFoundException } from "@nestjs/common";
import {
  AuditStatusSnapshot,
  DocumentFamily,
  DocumentLifecycleStatus,
  InventoryEffectStatus,
  Prisma,
  WorkshopMaterialOrderType,
} from "../../../../generated/prisma/client";
import {
  applyDefaultMasterDataResponses,
  createMocks,
  createPickService,
  type WorkshopMaterialMocks,
} from "./workshop-material.service.test-support";

describe("WorkshopMaterialPickService", () => {
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
  let service: ReturnType<typeof createPickService>;

  beforeEach(() => {
    mocks = createMocks();
    applyDefaultMasterDataResponses(mocks);
    service = createPickService(mocks);
  });

  describe("createPickOrder", () => {
    it("should create pick order with settleConsumerOut and pending approval", async () => {
      const settledPickOrder = {
        ...mockPickOrder,
        lines: [
          {
            ...mockPickOrder.lines[0],
            costUnitPrice: new Prisma.Decimal(10),
            costAmount: new Prisma.Decimal(500),
          },
        ],
      };
      (mocks.repository.findOrderByDocumentNo as jest.Mock).mockResolvedValue(
        null,
      );
      (mocks.repository.createOrder as jest.Mock).mockResolvedValue(
        mockPickOrder,
      );
      (mocks.repository.updateOrder as jest.Mock).mockResolvedValue(
        settledPickOrder,
      );
      (mocks.inventoryService.settleConsumerOut as jest.Mock).mockResolvedValue(
        {
          outLog: { id: 1 },
          settledUnitCost: new Prisma.Decimal(10),
          settledCostAmount: new Prisma.Decimal(500),
          allocations: [],
        },
      );

      const dto = {
        documentNo: "WM-PICK-001",
        orderType: WorkshopMaterialOrderType.PICK,
        bizDate: "2025-03-14",
        handlerPersonnelId: 20,
        workshopId: 1,
        lines: [
          {
            materialId: 100,
            quantity: "50",
            selectedUnitCost: "10",
            unitPrice: "999",
          },
        ],
      };

      const result = await service.createPickOrder(dto, "1");

      expect(result).toEqual(settledPickOrder);
      expect(mocks.repository.createOrder).toHaveBeenCalledWith(
        expect.objectContaining({
          totalAmount: new Prisma.Decimal(0),
        }),
        expect.arrayContaining([
          expect.objectContaining({
            unitPrice: new Prisma.Decimal(0),
            amount: new Prisma.Decimal(0),
          }),
        ]),
        expect.anything(),
      );
      expect(mocks.inventoryService.settleConsumerOut).toHaveBeenCalledWith(
        expect.objectContaining({
          materialId: 100,
          stockScope: "MAIN",
          operationType: "PICK_OUT",
          selectedUnitCost: "10",
          businessDocumentType: "WorkshopMaterialOrder",
          businessDocumentId: 1,
          businessDocumentNumber: "WM-PICK-001",
        }),
        expect.anything(),
      );
      expect(mocks.repository.updateOrderLineCost).toHaveBeenCalledWith(
        1,
        {
          costUnitPrice: new Prisma.Decimal(10),
          costAmount: new Prisma.Decimal(500),
          unitPrice: new Prisma.Decimal(10),
          amount: new Prisma.Decimal(500),
        },
        expect.anything(),
      );
      expect(mocks.repository.updateOrder).toHaveBeenCalledWith(
        1,
        expect.objectContaining({
          totalAmount: new Prisma.Decimal(500),
        }),
        expect.anything(),
      );
      expect(
        mocks.approvalService.createOrRefreshApprovalDocument,
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          documentFamily: DocumentFamily.WORKSHOP_MATERIAL,
          documentType: "WorkshopMaterialOrder",
          documentId: 1,
          documentNumber: "WM-PICK-001",
        }),
        expect.anything(),
      );
    });
  });

  describe("updatePickOrder", () => {
    it("should block pick-order revise when active return downstream exists", async () => {
      (mocks.repository.findOrderById as jest.Mock).mockResolvedValue(
        mockPickOrder,
      );
      (
        mocks.repository.hasActiveReturnDownstream as jest.Mock
      ).mockResolvedValue(true);

      await expect(
        service.updatePickOrder(
          1,
          {
            documentNo: "WM-PICK-001",
            orderType: WorkshopMaterialOrderType.PICK,
            bizDate: "2025-03-15",
            workshopId: 1,
            lines: [{ materialId: 100, quantity: "40", unitPrice: "10" }],
          },
          "1",
        ),
      ).rejects.toThrow("存在未作废的退料单下游，不能修改领料单");

      expect(mocks.inventoryService.reverseStock).not.toHaveBeenCalled();
    });

    it("should reverse and replay pick inventory effects on revise", async () => {
      const recreatedPickLine = {
        ...mockPickOrder.lines[0],
        id: 12,
        quantity: new Prisma.Decimal(40),
        amount: new Prisma.Decimal(400),
      };
      const revisedPickOrder = {
        ...mockPickOrder,
        bizDate: new Date("2025-03-15"),
        revisionNo: 2,
        totalQty: new Prisma.Decimal(40),
        totalAmount: new Prisma.Decimal(400),
        lines: [recreatedPickLine],
      };

      (mocks.repository.findOrderById as jest.Mock)
        .mockResolvedValueOnce(mockPickOrder)
        .mockResolvedValueOnce(mockPickOrder)
        .mockResolvedValueOnce(revisedPickOrder);
      (mocks.repository.createOrderLine as jest.Mock).mockResolvedValue(
        recreatedPickLine,
      );
      (mocks.repository.updateOrder as jest.Mock).mockResolvedValue(
        revisedPickOrder,
      );
      (
        mocks.inventoryService.getLogsForDocument as jest.Mock
      ).mockResolvedValue([{ id: 5, businessDocumentLineId: 1 }]);
      (mocks.inventoryService.settleConsumerOut as jest.Mock).mockResolvedValue(
        {
          outLog: { id: 1 },
          settledUnitCost: new Prisma.Decimal(10),
          settledCostAmount: new Prisma.Decimal(400),
          allocations: [],
        },
      );

      const result = await service.updatePickOrder(
        1,
        {
          documentNo: "WM-PICK-001",
          orderType: WorkshopMaterialOrderType.PICK,
          bizDate: "2025-03-15",
          workshopId: 1,
          lines: [{ materialId: 100, quantity: "40", unitPrice: "10" }],
        },
        "1",
      );

      expect(
        mocks.inventoryService.releaseAllSourceUsagesForConsumer,
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          consumerDocumentType: "WorkshopMaterialOrder",
          consumerDocumentId: 1,
          operatorId: "1",
        }),
        expect.anything(),
      );
      expect(mocks.inventoryService.reverseStock).toHaveBeenCalledWith(
        expect.objectContaining({
          logIdToReverse: 5,
          idempotencyKey: "WorkshopMaterialOrder:rev:1:r2:log:5",
        }),
        expect.anything(),
      );
      expect(mocks.repository.deleteOrderLinesByOrderId).toHaveBeenCalledWith(
        1,
        expect.anything(),
      );
      expect(mocks.inventoryService.settleConsumerOut).toHaveBeenCalledWith(
        expect.objectContaining({
          businessDocumentId: 1,
          businessDocumentLineId: 12,
          quantity: new Prisma.Decimal(40),
          operationType: "PICK_OUT",
          idempotencyKey: "WorkshopMaterialOrder:1:rev:2:line:12",
        }),
        expect.anything(),
      );
      expect(mocks.repository.updateOrder).toHaveBeenCalledWith(
        1,
        expect.objectContaining({
          revisionNo: { increment: 1 },
          totalQty: new Prisma.Decimal(40),
          totalAmount: new Prisma.Decimal(400),
          auditStatusSnapshot: AuditStatusSnapshot.PENDING,
        }),
        expect.anything(),
      );
      expect(
        mocks.approvalService.createOrRefreshApprovalDocument,
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          documentType: "WorkshopMaterialOrder",
          documentId: 1,
          documentNumber: "WM-PICK-001",
        }),
        expect.anything(),
      );
      expect(
        mocks.approvalService.markApprovalNotRequired,
      ).not.toHaveBeenCalled();
      expect(result).toEqual(revisedPickOrder);
    });
  });

  describe("voidPickOrder", () => {
    it("should void pick order, release source usage, and reverse inventory", async () => {
      (
        mocks.repository.hasActiveReturnDownstream as jest.Mock
      ).mockResolvedValue(false);
      (
        mocks.inventoryService.getLogsForDocument as jest.Mock
      ).mockResolvedValue([{ id: 1 }]);
      (mocks.repository.updateOrder as jest.Mock).mockResolvedValue({
        ...mockPickOrder,
        lifecycleStatus: DocumentLifecycleStatus.VOIDED,
      });
      (mocks.repository.findOrderById as jest.Mock)
        .mockResolvedValueOnce(mockPickOrder)
        .mockResolvedValueOnce({
          ...mockPickOrder,
          lifecycleStatus: DocumentLifecycleStatus.VOIDED,
          inventoryEffectStatus: InventoryEffectStatus.REVERSED,
        });

      const result = await service.voidPickOrder(1, "Test void", "1");

      expect(mocks.inventoryService.reverseStock).toHaveBeenCalledWith(
        expect.objectContaining({
          logIdToReverse: 1,
          idempotencyKey: expect.stringContaining("void"),
        }),
        expect.anything(),
      );
      expect(
        mocks.inventoryService.releaseAllSourceUsagesForConsumer,
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          consumerDocumentType: "WorkshopMaterialOrder",
          consumerDocumentId: 1,
          operatorId: "1",
        }),
        expect.anything(),
      );
      expect(mocks.repository.updateOrder).toHaveBeenCalledWith(
        1,
        expect.objectContaining({
          lifecycleStatus: DocumentLifecycleStatus.VOIDED,
          inventoryEffectStatus: InventoryEffectStatus.REVERSED,
          voidReason: "Test void",
        }),
        expect.anything(),
      );
      expect(
        mocks.approvalService.markApprovalNotRequired,
      ).toHaveBeenCalledWith(
        "WorkshopMaterialOrder",
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
      (mocks.repository.findOrderById as jest.Mock).mockResolvedValue(null);

      await expect(service.voidPickOrder(999, undefined, "1")).rejects.toThrow(
        NotFoundException,
      );
    });

    it("should block void when active return downstream exists", async () => {
      (mocks.repository.findOrderById as jest.Mock).mockResolvedValue(
        mockPickOrder,
      );
      (
        mocks.repository.hasActiveReturnDownstream as jest.Mock
      ).mockResolvedValue(true);

      await expect(service.voidPickOrder(1, "blocked", "1")).rejects.toThrow(
        "存在未作废的退料单下游，不能作废领料单",
      );
      expect(mocks.inventoryService.reverseStock).not.toHaveBeenCalled();
    });
  });

  describe("listPickOrders", () => {
    it("should return paginated pick orders", async () => {
      (mocks.repository.findOrders as jest.Mock).mockResolvedValue({
        items: [mockPickOrder],
        total: 1,
      });

      const result = await service.listPickOrders({ limit: 10, offset: 0 });

      expect(result.items).toHaveLength(1);
      expect(result.total).toBe(1);
      expect(mocks.repository.findOrders).toHaveBeenCalledWith(
        expect.objectContaining({
          orderType: WorkshopMaterialOrderType.PICK,
          limit: 10,
          offset: 0,
        }),
      );
    });
  });

  describe("getPickOrderById", () => {
    it("should return order when found", async () => {
      (mocks.repository.findOrderById as jest.Mock).mockResolvedValue(
        mockPickOrder,
      );

      const result = await service.getPickOrderById(1);

      expect(result).toEqual(mockPickOrder);
    });

    it("should throw NotFoundException when not found", async () => {
      (mocks.repository.findOrderById as jest.Mock).mockResolvedValue(null);

      await expect(service.getPickOrderById(999)).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
