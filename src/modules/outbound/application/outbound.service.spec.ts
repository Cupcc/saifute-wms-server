import { ConflictException, NotFoundException } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import {
  AuditStatusSnapshot,
  CustomerStockOrderType,
  DocumentFamily,
  DocumentLifecycleStatus,
  DocumentRelationType,
  InventoryEffectStatus,
  Prisma,
} from "../../../generated/prisma/client";
import { PrismaService } from "../../../shared/prisma/prisma.service";
import { InventoryService } from "../../inventory-core/application/inventory.service";
import { MasterDataService } from "../../master-data/application/master-data.service";
import { WorkflowService } from "../../workflow/application/workflow.service";
import { OutboundRepository } from "../infrastructure/outbound.repository";
import { OutboundService } from "./outbound.service";

describe("OutboundService", () => {
  const mockOutboundOrder = {
    id: 1,
    documentNo: "OB-001",
    orderType: CustomerStockOrderType.OUTBOUND,
    bizDate: new Date("2025-03-14"),
    customerId: 10,
    handlerPersonnelId: 20,
    workshopId: 1,
    lifecycleStatus: DocumentLifecycleStatus.EFFECTIVE,
    auditStatusSnapshot: AuditStatusSnapshot.PENDING,
    inventoryEffectStatus: InventoryEffectStatus.POSTED,
    revisionNo: 1,
    customerCodeSnapshot: "CUST001",
    customerNameSnapshot: "Customer A",
    handlerNameSnapshot: "Handler A",
    workshopNameSnapshot: "Workshop A",
    totalQty: new Prisma.Decimal(100),
    totalAmount: new Prisma.Decimal(1000),
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
        quantity: new Prisma.Decimal(100),
        unitPrice: new Prisma.Decimal(10),
        amount: new Prisma.Decimal(1000),
        startNumber: "001",
        endNumber: "100",
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

  const mockSalesReturnOrder = {
    ...mockOutboundOrder,
    id: 2,
    documentNo: "SR-001",
    orderType: CustomerStockOrderType.SALES_RETURN,
    lines: [
      {
        id: 2,
        orderId: 2,
        lineNo: 1,
        materialId: 100,
        materialCodeSnapshot: "MAT001",
        materialNameSnapshot: "Material A",
        materialSpecSnapshot: "Spec",
        unitCodeSnapshot: "PCS",
        quantity: new Prisma.Decimal(50),
        unitPrice: new Prisma.Decimal(10),
        amount: new Prisma.Decimal(500),
        startNumber: null,
        endNumber: null,
        sourceDocumentType: "CustomerStockOrder",
        sourceDocumentId: 1,
        sourceDocumentLineId: 1,
        remark: null,
        createdBy: "1",
        createdAt: new Date(),
        updatedBy: "1",
        updatedAt: new Date(),
      },
    ],
  };

  const mockMaterial = {
    id: 100,
    materialCode: "MAT001",
    materialName: "Material A",
    specModel: "Spec",
    unitCode: "PCS",
  };
  const mockWorkshop = { id: 1, workshopName: "Workshop A" };
  const mockCustomer = {
    id: 10,
    customerCode: "CUST001",
    customerName: "Customer A",
  };
  const mockPersonnel = { id: 20, personnelName: "Handler A" };

  let service: OutboundService;
  let repository: jest.Mocked<OutboundRepository>;
  let masterDataService: jest.Mocked<MasterDataService>;
  let inventoryService: jest.Mocked<InventoryService>;
  let workflowService: jest.Mocked<WorkflowService>;
  let prisma: { runInTransaction: jest.Mock };

  beforeEach(async () => {
    prisma = {
      runInTransaction: jest.fn((handler: (tx: unknown) => Promise<unknown>) =>
        handler({}),
      ),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        OutboundService,
        {
          provide: PrismaService,
          useValue: prisma,
        },
        {
          provide: OutboundRepository,
          useValue: {
            findOrderByDocumentNo: jest.fn(),
            findOrderById: jest.fn(),
            findOrders: jest.fn(),
            findSalesReturns: jest.fn(),
            createOrder: jest.fn(),
            updateOrder: jest.fn(),
            createOrderLine: jest.fn(),
            updateOrderLine: jest.fn(),
            deleteOrderLine: jest.fn(),
            createDocumentRelation: jest.fn(),
            createDocumentLineRelation: jest.fn(),
            deactivateDocumentRelationsForOrder: jest.fn(),
            hasActiveDownstreamSalesReturns: jest.fn().mockResolvedValue(false),
          },
        },
        {
          provide: MasterDataService,
          useValue: {
            getMaterialById: jest.fn(),
            getWorkshopById: jest.fn(),
            getCustomerById: jest.fn(),
            getPersonnelById: jest.fn(),
          },
        },
        {
          provide: InventoryService,
          useValue: {
            decreaseStock: jest.fn().mockResolvedValue({ id: 1 }),
            increaseStock: jest.fn().mockResolvedValue({ id: 1 }),
            reverseStock: jest.fn().mockResolvedValue({ id: 2 }),
            reserveFactoryNumber: jest.fn().mockResolvedValue({ id: 1 }),
            releaseFactoryNumberReservations: jest.fn().mockResolvedValue({
              count: 1,
            }),
            getLogsForDocument: jest.fn().mockResolvedValue([{ id: 1 }]),
          },
        },
        {
          provide: WorkflowService,
          useValue: {
            createOrRefreshAuditDocument: jest.fn().mockResolvedValue({}),
            markAuditNotRequired: jest.fn().mockResolvedValue({ count: 1 }),
          },
        },
      ],
    }).compile();

    service = moduleRef.get(OutboundService);
    repository = moduleRef.get(OutboundRepository);
    masterDataService = moduleRef.get(MasterDataService);
    inventoryService = moduleRef.get(InventoryService);
    workflowService = moduleRef.get(WorkflowService);

    (masterDataService.getMaterialById as jest.Mock).mockResolvedValue(
      mockMaterial,
    );
    (masterDataService.getWorkshopById as jest.Mock).mockResolvedValue(
      mockWorkshop,
    );
    (masterDataService.getCustomerById as jest.Mock).mockResolvedValue(
      mockCustomer,
    );
    (masterDataService.getPersonnelById as jest.Mock).mockResolvedValue(
      mockPersonnel,
    );
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
            quantity: "100",
            unitPrice: "10",
            startNumber: "001",
            endNumber: "100",
          },
        ],
      };

      const result = await service.createOrder(dto, "1");

      expect(result).toEqual(mockOutboundOrder);
      expect(repository.findOrderByDocumentNo).toHaveBeenCalledWith("OB-001");
      expect(repository.createOrder).toHaveBeenCalled();
      expect(inventoryService.decreaseStock).toHaveBeenCalledWith(
        expect.objectContaining({
          materialId: 100,
          workshopId: 1,
          businessDocumentType: "CustomerStockOrder",
          businessDocumentId: 1,
          businessDocumentNumber: "OB-001",
        }),
        expect.anything(),
      );
      expect(inventoryService.reserveFactoryNumber).toHaveBeenCalledWith(
        expect.objectContaining({
          materialId: 100,
          workshopId: 1,
          startNumber: "001",
          endNumber: "100",
        }),
        expect.anything(),
      );
      expect(workflowService.createOrRefreshAuditDocument).toHaveBeenCalledWith(
        expect.objectContaining({
          documentFamily: DocumentFamily.CUSTOMER_STOCK,
          documentType: "CustomerStockOrder",
          documentId: 1,
          documentNumber: "OB-001",
        }),
        expect.anything(),
      );
    });

    it("should throw ConflictException when documentNo exists", async () => {
      (repository.findOrderByDocumentNo as jest.Mock).mockResolvedValue(
        mockOutboundOrder,
      );

      const dto = {
        documentNo: "OB-001",
        bizDate: "2025-03-14",
        workshopId: 1,
        lines: [{ materialId: 100, quantity: "100" }],
      };

      await expect(service.createOrder(dto, "1")).rejects.toThrow(
        ConflictException,
      );
      expect(repository.createOrder).not.toHaveBeenCalled();
    });
  });

  describe("updateOrder", () => {
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
          businessDocumentType: "CustomerStockOrder",
          businessDocumentId: 1,
          businessDocumentLineId: 1,
        }),
        expect.anything(),
      );
      expect(repository.deleteOrderLine).toHaveBeenCalledWith(
        1,
        expect.anything(),
      );
      expect(result).toEqual(updatedOrder);
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
          businessDocumentType: "CustomerStockOrder",
          businessDocumentId: 1,
          businessDocumentLineId: 1,
        }),
        expect.anything(),
      );
      expect(inventoryService.reserveFactoryNumber).toHaveBeenCalledWith(
        expect.objectContaining({
          materialId: 100,
          workshopId: 1,
          businessDocumentLineId: 1,
          startNumber: "101",
          endNumber: "200",
        }),
        expect.anything(),
      );
      expect(result).toEqual(updatedOrder);
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
          businessDocumentType: "CustomerStockOrder",
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
      expect(workflowService.markAuditNotRequired).toHaveBeenCalledWith(
        "CustomerStockOrder",
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

  describe("createSalesReturn", () => {
    it("should create sales return with inventory increase and document relations", async () => {
      (repository.findOrderByDocumentNo as jest.Mock).mockResolvedValue(null);
      (repository.findOrderById as jest.Mock).mockResolvedValue(
        mockOutboundOrder,
      );
      (repository.createOrder as jest.Mock).mockResolvedValue(
        mockSalesReturnOrder,
      );

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
          workshopId: 1,
          businessDocumentType: "CustomerStockOrder",
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
          orderType: CustomerStockOrderType.OUTBOUND,
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

      expect(result).toEqual(mockOutboundOrder);
    });

    it("should throw NotFoundException when not found", async () => {
      (repository.findOrderById as jest.Mock).mockResolvedValue(null);

      await expect(service.getOrderById(999)).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
