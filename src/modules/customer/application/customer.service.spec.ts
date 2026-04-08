import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from "@nestjs/common";
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
import { ApprovalService } from "../../approval/application/approval.service";
import { InventoryService } from "../../inventory-core/application/inventory.service";
import { MasterDataService } from "../../master-data/application/master-data.service";
import { CustomerRepository } from "../infrastructure/customer.repository";
import { CustomerService } from "./customer.service";

describe("CustomerService", () => {
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
        selectedUnitCost: new Prisma.Decimal(10),
        costUnitPrice: null,
        costAmount: null,
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
        selectedUnitCost: new Prisma.Decimal(10),
        costUnitPrice: null,
        costAmount: null,
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

  let service: CustomerService;
  let repository: jest.Mocked<CustomerRepository>;
  let masterDataService: jest.Mocked<MasterDataService>;
  let inventoryService: jest.Mocked<InventoryService>;
  let approvalService: jest.Mocked<ApprovalService>;
  let prisma: {
    runInTransaction: jest.Mock;
    stockInPriceCorrectionOrderLine: { findMany: jest.Mock };
    stockInOrderLine: { findMany: jest.Mock };
  };

  beforeEach(async () => {
    prisma = {
      runInTransaction: jest.fn((handler: (tx: unknown) => Promise<unknown>) =>
        handler({}),
      ),
      stockInPriceCorrectionOrderLine: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      stockInOrderLine: {
        findMany: jest.fn().mockResolvedValue([]),
      },
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        CustomerService,
        {
          provide: PrismaService,
          useValue: prisma,
        },
        {
          provide: CustomerRepository,
          useValue: {
            findOrderByDocumentNo: jest.fn(),
            findOrderById: jest.fn().mockResolvedValue(mockOutboundOrder),
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
            sumActiveReturnedQtyByOutboundLine: jest
              .fn()
              .mockResolvedValue(new Map()),
          },
        },
        {
          provide: MasterDataService,
          useValue: {
            getMaterialById: jest.fn(),
            getWorkshopById: jest.fn(),
            getStockScopeByCode: jest.fn().mockResolvedValue({
              id: 1,
              scopeCode: "MAIN",
              scopeName: "主仓",
            }),
            getCustomerById: jest.fn(),
            getPersonnelById: jest.fn(),
          },
        },
        {
          provide: InventoryService,
          useValue: {
            decreaseStock: jest.fn().mockResolvedValue({ id: 1 }),
            settleConsumerOut: jest.fn().mockResolvedValue({
              outLog: { id: 1 },
              settledUnitCost: new Prisma.Decimal(10),
              settledCostAmount: new Prisma.Decimal(1000),
              allocations: [],
            }),
            increaseStock: jest.fn().mockResolvedValue({ id: 1 }),
            reverseStock: jest.fn().mockResolvedValue({ id: 2 }),
            reserveFactoryNumber: jest.fn().mockResolvedValue({ id: 1 }),
            releaseFactoryNumberReservations: jest.fn().mockResolvedValue({
              count: 1,
            }),
            releaseAllSourceUsagesForConsumer: jest
              .fn()
              .mockResolvedValue(undefined),
            releaseSourceUsagesForConsumerLine: jest
              .fn()
              .mockResolvedValue(undefined),
            releaseInventorySource: jest.fn().mockResolvedValue({}),
            listSourceUsages: jest
              .fn()
              .mockResolvedValue({ items: [], total: 0 }),
            listPriceLayerAvailability: jest.fn().mockResolvedValue([
              {
                materialId: 100,
                unitCost: new Prisma.Decimal(10),
                availableQty: new Prisma.Decimal(100),
                sourceLogCount: 1,
              },
            ]),
            listSourceUsagesForConsumerLine: jest.fn().mockResolvedValue([]),
            getLogsForDocument: jest.fn().mockResolvedValue([{ id: 1 }]),
          },
        },
        {
          provide: ApprovalService,
          useValue: {
            createOrRefreshApprovalDocument: jest.fn().mockResolvedValue({}),
            markApprovalNotRequired: jest.fn().mockResolvedValue({ count: 1 }),
          },
        },
      ],
    }).compile();

    service = moduleRef.get(CustomerService);
    repository = moduleRef.get(CustomerRepository);
    masterDataService = moduleRef.get(MasterDataService);
    inventoryService = moduleRef.get(InventoryService);
    approvalService = moduleRef.get(ApprovalService);

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
            selectedUnitCost: "10",
            unitPrice: "10",
            startNumber: "001",
            endNumber: "100",
          },
        ],
      };

      const result = await service.createOrder(dto, "1");

      expect(result).toMatchObject(mockOutboundOrder);
      expect(repository.findOrderByDocumentNo).toHaveBeenCalledWith("OB-001");
      expect(repository.createOrder).toHaveBeenCalled();
      expect(inventoryService.settleConsumerOut).toHaveBeenCalledWith(
        expect.objectContaining({
          materialId: 100,
          stockScope: "MAIN",
          selectedUnitCost: mockOutboundOrder.lines[0].selectedUnitCost,
          businessDocumentType: "CustomerStockOrder",
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
        lines: [{ materialId: 100, quantity: "100", selectedUnitCost: "10" }],
      };

      await expect(service.createOrder(dto, "1")).rejects.toThrow(
        ConflictException,
      );
      expect(repository.createOrder).not.toHaveBeenCalled();
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
              {
                materialId: 100,
                quantity: "10",
                selectedUnitCost: "10",
              },
              {
                materialId: 100,
                quantity: "20",
                selectedUnitCost: "10.00",
              },
            ],
          },
          "1",
        ),
      ).rejects.toThrow("同一单据内不允许重复的物料+价格层");
      expect(repository.createOrder).not.toHaveBeenCalled();
    });
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
          consumerDocumentType: "CustomerStockOrder",
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
          businessDocumentType: "CustomerStockOrder",
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
      expect(approvalService.markApprovalNotRequired).toHaveBeenCalledWith(
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
