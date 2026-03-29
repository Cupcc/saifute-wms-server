import { ConflictException, NotFoundException } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import {
  AuditStatusSnapshot,
  DocumentFamily,
  DocumentLifecycleStatus,
  InventoryEffectStatus,
  Prisma,
  StockInOrderType,
} from "../../../generated/prisma/client";
import { PrismaService } from "../../../shared/prisma/prisma.service";
import { InventoryService } from "../../inventory-core/application/inventory.service";
import { MasterDataService } from "../../master-data/application/master-data.service";
import { RdProcurementRequestService } from "../../rd-subwarehouse/application/rd-procurement-request.service";
import { WorkflowService } from "../../workflow/application/workflow.service";
import { InboundRepository } from "../infrastructure/inbound.repository";
import { InboundService } from "./inbound.service";

describe("InboundService", () => {
  const mockOrder = {
    id: 1,
    documentNo: "SI-001",
    orderType: StockInOrderType.ACCEPTANCE,
    bizDate: new Date("2025-03-14"),
    supplierId: 10,
    handlerPersonnelId: 20,
    workshopId: 1,
    lifecycleStatus: DocumentLifecycleStatus.EFFECTIVE,
    auditStatusSnapshot: AuditStatusSnapshot.PENDING,
    inventoryEffectStatus: InventoryEffectStatus.POSTED,
    revisionNo: 1,
    supplierCodeSnapshot: "SUP001",
    supplierNameSnapshot: "Supplier A",
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

  const mockWorkshop = {
    id: 1,
    workshopCode: "MAIN",
    workshopName: "Workshop A",
  };
  const mockSupplier = {
    id: 10,
    supplierCode: "SUP001",
    supplierName: "Supplier A",
  };
  const mockPersonnel = { id: 20, personnelName: "Handler A" };
  const mockRdProcurementRequest = {
    id: 9,
    documentNo: "RDPUR-001",
    projectCode: "RD-PJT-001",
    projectName: "研发治具归集",
    supplierId: 10,
    lifecycleStatus: DocumentLifecycleStatus.EFFECTIVE,
    lines: [
      {
        id: 500,
        materialId: 100,
        quantity: new Prisma.Decimal(100),
      },
    ],
  };

  let service: InboundService;
  let repository: jest.Mocked<InboundRepository>;
  let masterDataService: jest.Mocked<MasterDataService>;
  let inventoryService: jest.Mocked<InventoryService>;
  let workflowService: jest.Mocked<WorkflowService>;
  let rdProcurementRequestService: jest.Mocked<RdProcurementRequestService>;
  let prisma: { runInTransaction: jest.Mock };

  beforeEach(async () => {
    prisma = {
      runInTransaction: jest.fn((handler: (tx: unknown) => Promise<unknown>) =>
        handler({}),
      ),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        InboundService,
        {
          provide: PrismaService,
          useValue: prisma,
        },
        {
          provide: InboundRepository,
          useValue: {
            findOrderByDocumentNo: jest.fn(),
            findOrderById: jest.fn(),
            findOrders: jest.fn(),
            createOrder: jest.fn(),
            updateOrder: jest.fn(),
            deleteOrderLines: jest.fn(),
            createOrderLines: jest.fn(),
            createOrderLine: jest.fn(),
            updateOrderLine: jest.fn(),
            deleteOrderLine: jest.fn(),
            sumEffectiveAcceptedQtyByRdProcurementLineIds: jest
              .fn()
              .mockResolvedValue(new Map()),
            hasActiveDownstreamDependencies: jest.fn().mockResolvedValue(false),
          },
        },
        {
          provide: MasterDataService,
          useValue: {
            getMaterialById: jest.fn(),
            getWorkshopById: jest.fn(),
            getSupplierById: jest.fn(),
            getPersonnelById: jest.fn(),
          },
        },
        {
          provide: InventoryService,
          useValue: {
            increaseStock: jest.fn().mockResolvedValue({ id: 1 }),
            reverseStock: jest.fn().mockResolvedValue({ id: 2 }),
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
        {
          provide: RdProcurementRequestService,
          useValue: {
            getRequestById: jest
              .fn()
              .mockResolvedValue(mockRdProcurementRequest),
          },
        },
      ],
    }).compile();

    service = moduleRef.get(InboundService);
    repository = moduleRef.get(InboundRepository);
    masterDataService = moduleRef.get(MasterDataService);
    inventoryService = moduleRef.get(InventoryService);
    workflowService = moduleRef.get(WorkflowService);
    rdProcurementRequestService = moduleRef.get(RdProcurementRequestService);

    (masterDataService.getMaterialById as jest.Mock).mockResolvedValue(
      mockMaterial,
    );
    (masterDataService.getWorkshopById as jest.Mock).mockResolvedValue(
      mockWorkshop,
    );
    (masterDataService.getSupplierById as jest.Mock).mockResolvedValue(
      mockSupplier,
    );
    (masterDataService.getPersonnelById as jest.Mock).mockResolvedValue(
      mockPersonnel,
    );
  });

  describe("createOrder", () => {
    it("should create order with inventory and audit", async () => {
      (repository.findOrderByDocumentNo as jest.Mock).mockResolvedValue(null);
      (repository.createOrder as jest.Mock).mockResolvedValue(mockOrder);

      const dto = {
        documentNo: "SI-001",
        orderType: StockInOrderType.ACCEPTANCE,
        bizDate: "2025-03-14",
        supplierId: 10,
        handlerPersonnelId: 20,
        workshopId: 1,
        lines: [{ materialId: 100, quantity: "100", unitPrice: "10" }],
      };

      const result = await service.createOrder(dto, "1");

      expect(result).toEqual(mockOrder);
      expect(repository.findOrderByDocumentNo).toHaveBeenCalledWith("SI-001");
      expect(repository.createOrder).toHaveBeenCalled();
      expect(inventoryService.increaseStock).toHaveBeenCalledWith(
        expect.objectContaining({
          materialId: 100,
          workshopId: 1,
          businessDocumentType: "StockInOrder",
          businessDocumentId: 1,
          businessDocumentNumber: "SI-001",
        }),
        expect.anything(),
      );
      expect(workflowService.createOrRefreshAuditDocument).toHaveBeenCalledWith(
        expect.objectContaining({
          documentFamily: DocumentFamily.STOCK_IN,
          documentType: "StockInOrder",
          documentId: 1,
          documentNumber: "SI-001",
        }),
        expect.anything(),
      );
    });

    it("should create linked acceptance without writing RD stock", async () => {
      (repository.findOrderByDocumentNo as jest.Mock).mockResolvedValue(null);
      (repository.createOrder as jest.Mock).mockResolvedValue(mockOrder);

      const dto = {
        documentNo: "SI-001",
        orderType: StockInOrderType.ACCEPTANCE,
        bizDate: "2025-03-14",
        workshopId: 1,
        rdProcurementRequestId: 9,
        lines: [
          {
            materialId: 100,
            rdProcurementRequestLineId: 500,
            quantity: "100",
            unitPrice: "10",
          },
        ],
      };

      await service.createOrder(dto, "1");

      expect(rdProcurementRequestService.getRequestById).toHaveBeenCalledWith(
        9,
      );
      expect(repository.createOrder).toHaveBeenCalledWith(
        expect.objectContaining({
          rdProcurementRequestId: 9,
          rdProcurementRequestNoSnapshot: "RDPUR-001",
          rdProcurementProjectCodeSnapshot: "RD-PJT-001",
          rdProcurementProjectNameSnapshot: "研发治具归集",
          workshopId: 1,
        }),
        expect.arrayContaining([
          expect.objectContaining({
            rdProcurementRequestLineId: 500,
          }),
        ]),
        expect.anything(),
      );
      expect(inventoryService.increaseStock).toHaveBeenCalledWith(
        expect.objectContaining({
          workshopId: 1,
        }),
        expect.anything(),
      );
    });

    it("should reject linked acceptance when workshop is not main", async () => {
      (repository.findOrderByDocumentNo as jest.Mock).mockResolvedValue(null);
      (masterDataService.getWorkshopById as jest.Mock).mockResolvedValueOnce({
        id: 6,
        workshopCode: "RD",
        workshopName: "研发小仓",
      });

      await expect(
        service.createOrder(
          {
            documentNo: "SI-002",
            orderType: StockInOrderType.ACCEPTANCE,
            bizDate: "2025-03-14",
            workshopId: 6,
            rdProcurementRequestId: 9,
            lines: [
              {
                materialId: 100,
                rdProcurementRequestLineId: 500,
                quantity: "10",
              },
            ],
          },
          "1",
        ),
      ).rejects.toThrow("关联 RD 采购需求的验收单必须先入主仓");
    });

    it("should reject linked acceptance when cumulative quantity exceeds request", async () => {
      (repository.findOrderByDocumentNo as jest.Mock).mockResolvedValue(null);
      (
        repository.sumEffectiveAcceptedQtyByRdProcurementLineIds as jest.Mock
      ).mockResolvedValue(new Map([[500, new Prisma.Decimal(95)]]));

      await expect(
        service.createOrder(
          {
            documentNo: "SI-003",
            orderType: StockInOrderType.ACCEPTANCE,
            bizDate: "2025-03-14",
            workshopId: 1,
            rdProcurementRequestId: 9,
            lines: [
              {
                materialId: 100,
                rdProcurementRequestLineId: 500,
                quantity: "10",
                unitPrice: "10",
              },
            ],
          },
          "1",
        ),
      ).rejects.toThrow("累计验收数量不能大于对应 RD 采购需求数量");
    });

    it("should throw ConflictException when documentNo exists", async () => {
      (repository.findOrderByDocumentNo as jest.Mock).mockResolvedValue(
        mockOrder,
      );

      const dto = {
        documentNo: "SI-001",
        orderType: StockInOrderType.ACCEPTANCE,
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
    it("should update order with line-aware inventory recalculation", async () => {
      (repository.findOrderById as jest.Mock)
        .mockResolvedValueOnce(mockOrder)
        .mockResolvedValueOnce(mockOrder)
        .mockResolvedValueOnce({ ...mockOrder, lines: [] });
      (inventoryService.getLogsForDocument as jest.Mock).mockResolvedValue([
        { id: 1, businessDocumentLineId: 1 },
      ]);

      const dto = {
        bizDate: "2025-03-15",
        lines: [{ materialId: 100, quantity: "150", unitPrice: "10" }],
      };

      const updatedOrder = { ...mockOrder, totalQty: new Prisma.Decimal(150) };
      (repository.updateOrder as jest.Mock).mockResolvedValue(updatedOrder);
      (repository.deleteOrderLine as jest.Mock).mockResolvedValue(undefined);
      (repository.createOrderLine as jest.Mock).mockResolvedValue({
        ...mockOrder.lines[0],
        id: 2,
        lineNo: 1,
        quantity: new Prisma.Decimal(150),
        amount: new Prisma.Decimal(1500),
      });

      await service.updateOrder(1, dto, "1");

      expect(inventoryService.reverseStock).toHaveBeenCalled();
      expect(inventoryService.increaseStock).toHaveBeenCalled();
      expect(workflowService.createOrRefreshAuditDocument).toHaveBeenCalled();
    });
  });

  describe("voidOrder", () => {
    it("should void order and reverse inventory", async () => {
      (repository.findOrderById as jest.Mock).mockResolvedValue(mockOrder);
      (
        repository.hasActiveDownstreamDependencies as jest.Mock
      ).mockResolvedValue(false);
      (inventoryService.getLogsForDocument as jest.Mock).mockResolvedValue([
        { id: 1 },
      ]);
      (repository.updateOrder as jest.Mock).mockResolvedValue({
        ...mockOrder,
        lifecycleStatus: DocumentLifecycleStatus.VOIDED,
      });
      (repository.findOrderById as jest.Mock)
        .mockResolvedValueOnce(mockOrder)
        .mockResolvedValueOnce({
          ...mockOrder,
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
        "StockInOrder",
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

    it("should block void when downstream dependencies exist", async () => {
      (repository.findOrderById as jest.Mock).mockResolvedValue(mockOrder);
      (
        repository.hasActiveDownstreamDependencies as jest.Mock
      ).mockResolvedValue(true);

      await expect(service.voidOrder(1, "blocked", "1")).rejects.toThrow(
        "存在下游依赖，不能作废",
      );
      expect(inventoryService.reverseStock).not.toHaveBeenCalled();
    });
  });

  describe("listOrders", () => {
    it("should return paginated orders", async () => {
      (repository.findOrders as jest.Mock).mockResolvedValue({
        items: [mockOrder],
        total: 1,
      });

      const result = await service.listOrders({ limit: 10, offset: 0 });

      expect(result.items).toHaveLength(1);
      expect(result.total).toBe(1);
      expect(repository.findOrders).toHaveBeenCalledWith(
        expect.objectContaining({ limit: 10, offset: 0 }),
      );
    });
  });

  describe("getOrderById", () => {
    it("should return order when found", async () => {
      (repository.findOrderById as jest.Mock).mockResolvedValue(mockOrder);

      const result = await service.getOrderById(1);

      expect(result).toEqual(mockOrder);
    });

    it("should throw NotFoundException when not found", async () => {
      (repository.findOrderById as jest.Mock).mockResolvedValue(null);

      await expect(service.getOrderById(999)).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
