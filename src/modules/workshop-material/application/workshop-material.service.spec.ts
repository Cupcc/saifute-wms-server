import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from "@nestjs/common";
import { Test } from "@nestjs/testing";
import {
  AuditStatusSnapshot,
  DocumentFamily,
  DocumentLifecycleStatus,
  InventoryEffectStatus,
  Prisma,
  WorkshopMaterialOrderType,
} from "../../../generated/prisma/client";
import { PrismaService } from "../../../shared/prisma/prisma.service";
import { ApprovalService } from "../../approval/application/approval.service";
import { InventoryService } from "../../inventory-core/application/inventory.service";
import { MasterDataService } from "../../master-data/application/master-data.service";
import { WorkshopMaterialRepository } from "../infrastructure/workshop-material.repository";
import { WorkshopMaterialService } from "./workshop-material.service";

describe("WorkshopMaterialService", () => {
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

  const mockMaterial = {
    id: 100,
    materialCode: "MAT001",
    materialName: "Material A",
    specModel: "Spec",
    unitCode: "PCS",
  };

  const mockWorkshop = {
    id: 1,
    workshopCode: "WS-A",
    workshopName: "Workshop A",
  };
  const mockPersonnel = { id: 20, personnelName: "Handler A" };

  let service: WorkshopMaterialService;
  let repository: jest.Mocked<WorkshopMaterialRepository>;
  let masterDataService: jest.Mocked<MasterDataService>;
  let inventoryService: jest.Mocked<InventoryService>;
  let approvalService: jest.Mocked<ApprovalService>;
  let prisma: { runInTransaction: jest.Mock };

  beforeEach(async () => {
    prisma = {
      runInTransaction: jest.fn((handler: (tx: unknown) => Promise<unknown>) =>
        handler({
          documentRelation: { upsert: jest.fn().mockResolvedValue({}) },
          documentLineRelation: { upsert: jest.fn().mockResolvedValue({}) },
          rdMaterialStatusHistory: {
            findMany: jest.fn().mockResolvedValue([]),
          },
        }),
      ),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        WorkshopMaterialService,
        {
          provide: PrismaService,
          useValue: prisma,
        },
        {
          provide: WorkshopMaterialRepository,
          useValue: {
            findOrderByDocumentNo: jest.fn(),
            findOrderById: jest.fn(),
            findOrders: jest.fn(),
            createOrder: jest.fn(),
            createOrderLine: jest.fn(),
            updateOrder: jest.fn(),
            deleteOrderLinesByOrderId: jest
              .fn()
              .mockResolvedValue({ count: 0 }),
            updateOrderLineCost: jest.fn().mockResolvedValue({}),
            hasActiveReturnDownstream: jest.fn().mockResolvedValue(false),
            deactivateDocumentRelationsForReturn: jest
              .fn()
              .mockResolvedValue({ count: 0 }),
            deleteDocumentLineRelationsForReturn: jest
              .fn()
              .mockResolvedValue({ count: 0 }),
            sumActiveReturnedQtyByPickLine: jest
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
            getLogsForDocument: jest.fn().mockResolvedValue([{ id: 1 }]),
            allocateInventorySource: jest.fn().mockResolvedValue({}),
            releaseInventorySource: jest.fn().mockResolvedValue({}),
            releaseAllSourceUsagesForConsumer: jest
              .fn()
              .mockResolvedValue(undefined),
            listSourceUsages: jest
              .fn()
              .mockResolvedValue({ items: [], total: 0 }),
            listSourceUsagesForConsumerLine: jest.fn().mockResolvedValue([]),
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

    service = moduleRef.get(WorkshopMaterialService);
    repository = moduleRef.get(WorkshopMaterialRepository);
    masterDataService = moduleRef.get(MasterDataService);
    inventoryService = moduleRef.get(InventoryService);
    approvalService = moduleRef.get(ApprovalService);

    (masterDataService.getMaterialById as jest.Mock).mockResolvedValue(
      mockMaterial,
    );
    (masterDataService.getWorkshopById as jest.Mock).mockResolvedValue(
      mockWorkshop,
    );
    (masterDataService.getPersonnelById as jest.Mock).mockResolvedValue(
      mockPersonnel,
    );
  });

  describe("createPickOrder", () => {
    it("should create pick order with decreaseStock", async () => {
      (repository.findOrderByDocumentNo as jest.Mock).mockResolvedValue(null);
      (repository.createOrder as jest.Mock).mockResolvedValue(mockPickOrder);

      const dto = {
        documentNo: "WM-PICK-001",
        orderType: WorkshopMaterialOrderType.PICK,
        bizDate: "2025-03-14",
        handlerPersonnelId: 20,
        workshopId: 1,
        lines: [{ materialId: 100, quantity: "50", unitPrice: "10" }],
      };

      const result = await service.createPickOrder(dto, "1");

      expect(result).toEqual(mockPickOrder);
      expect(repository.findOrderByDocumentNo).toHaveBeenCalledWith(
        "WM-PICK-001",
      );
      expect(inventoryService.settleConsumerOut).toHaveBeenCalledWith(
        expect.objectContaining({
          materialId: 100,
          stockScope: "MAIN",
          operationType: "PICK_OUT",
          businessDocumentType: "WorkshopMaterialOrder",
          businessDocumentId: 1,
          businessDocumentNumber: "WM-PICK-001",
        }),
        expect.anything(),
      );
      expect(
        approvalService.createOrRefreshApprovalDocument,
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

    it("should throw ConflictException when documentNo exists", async () => {
      (repository.findOrderByDocumentNo as jest.Mock).mockResolvedValue(
        mockPickOrder,
      );

      const dto = {
        documentNo: "WM-PICK-001",
        orderType: WorkshopMaterialOrderType.PICK,
        bizDate: "2025-03-14",
        workshopId: 1,
        lines: [{ materialId: 100, quantity: "50" }],
      };

      await expect(service.createPickOrder(dto, "1")).rejects.toThrow(
        ConflictException,
      );
      expect(repository.createOrder).not.toHaveBeenCalled();
    });
  });

  describe("createScrapOrder", () => {
    it("should create scrap order with decreaseStock and NOT_REQUIRED audit", async () => {
      const mockScrapOrder = {
        ...mockPickOrder,
        id: 2,
        documentNo: "WM-SCRAP-001",
        orderType: WorkshopMaterialOrderType.SCRAP,
      };
      (repository.findOrderByDocumentNo as jest.Mock).mockResolvedValue(null);
      (repository.createOrder as jest.Mock).mockResolvedValue(mockScrapOrder);

      const dto = {
        documentNo: "WM-SCRAP-001",
        orderType: WorkshopMaterialOrderType.SCRAP,
        bizDate: "2025-03-14",
        workshopId: 1,
        lines: [{ materialId: 100, quantity: "10" }],
      };

      const result = await service.createScrapOrder(dto, "1");

      expect(result.orderType).toBe(WorkshopMaterialOrderType.SCRAP);
      expect(inventoryService.settleConsumerOut).toHaveBeenCalledWith(
        expect.objectContaining({
          operationType: "SCRAP_OUT",
        }),
        expect.anything(),
      );
      expect(
        approvalService.createOrRefreshApprovalDocument,
      ).not.toHaveBeenCalled();
    });
  });

  describe("createReturnOrder", () => {
    const mockReturnOrderWithSource = {
      ...mockPickOrder,
      id: 2,
      documentNo: "WM-RETURN-001",
      orderType: WorkshopMaterialOrderType.RETURN,
      lines: [
        {
          id: 10,
          orderId: 2,
          lineNo: 1,
          materialId: 100,
          materialCodeSnapshot: "MAT001",
          materialNameSnapshot: "Material A",
          materialSpecSnapshot: "Spec",
          unitCodeSnapshot: "PCS",
          quantity: new Prisma.Decimal(20),
          unitPrice: new Prisma.Decimal(10),
          amount: new Prisma.Decimal(200),
          costUnitPrice: null,
          costAmount: null,
          sourceDocumentType: "WorkshopMaterialOrder",
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

    it("should create return order with increaseStock", async () => {
      const mockReturnOrder = {
        ...mockPickOrder,
        id: 2,
        documentNo: "WM-RETURN-001",
        orderType: WorkshopMaterialOrderType.RETURN,
      };
      (repository.findOrderByDocumentNo as jest.Mock).mockResolvedValue(null);
      (repository.createOrder as jest.Mock).mockResolvedValue(mockReturnOrder);

      const dto = {
        documentNo: "WM-RETURN-001",
        orderType: WorkshopMaterialOrderType.RETURN,
        bizDate: "2025-03-14",
        workshopId: 1,
        lines: [{ materialId: 100, quantity: "20" }],
      };

      const result = await service.createReturnOrder(dto, "1");

      expect(result.orderType).toBe(WorkshopMaterialOrderType.RETURN);
      expect(inventoryService.increaseStock).toHaveBeenCalledWith(
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
      (repository.findOrderByDocumentNo as jest.Mock).mockResolvedValue(null);
      (repository.createOrder as jest.Mock).mockResolvedValue(
        returnOrderWithTwoLines,
      );
      // Pick order line qty is 50; no prior returns
      (repository.findOrderById as jest.Mock).mockResolvedValue(mockPickOrder);
      (
        repository.sumActiveReturnedQtyByPickLine as jest.Mock
      ).mockResolvedValue(new Map());

      const dto = {
        documentNo: "WM-RETURN-002",
        orderType: WorkshopMaterialOrderType.RETURN,
        bizDate: "2025-03-14",
        workshopId: 1,
        lines: [
          // 30 + 30 = 60 > 50 (pick line qty)
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
      (repository.findOrderByDocumentNo as jest.Mock).mockResolvedValue(null);
      (repository.createOrder as jest.Mock).mockResolvedValue(
        mockReturnOrderWithSource,
      );
      // 40 of 50 already returned in active documents
      (repository.findOrderById as jest.Mock).mockResolvedValue(mockPickOrder);
      (
        repository.sumActiveReturnedQtyByPickLine as jest.Mock
      ).mockResolvedValue(new Map([[1, new Prisma.Decimal("40")]]));

      const dto = {
        documentNo: "WM-RETURN-002",
        orderType: WorkshopMaterialOrderType.RETURN,
        bizDate: "2025-03-14",
        workshopId: 1,
        lines: [
          // 40 already returned; adding 20 = 60 > 50
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

    it("should allow return when prior returns were voided, using restored source usages", async () => {
      (repository.findOrderByDocumentNo as jest.Mock).mockResolvedValue(null);
      (repository.createOrder as jest.Mock).mockResolvedValue(
        mockReturnOrderWithSource,
      );
      // All prior returns voided → active returned qty is 0
      (repository.findOrderById as jest.Mock).mockResolvedValue(mockPickOrder);
      (
        repository.sumActiveReturnedQtyByPickLine as jest.Mock
      ).mockResolvedValue(new Map());
      // Source usage has been restored after prior void: releasedQty=0, full 50 available
      (
        inventoryService.listSourceUsagesForConsumerLine as jest.Mock
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

      const result = await service.createReturnOrder(dto, "1");

      expect(result).toBeDefined();
      // Verify release is applied against the restored usage row
      expect(inventoryService.releaseInventorySource).toHaveBeenCalledWith(
        expect.objectContaining({
          sourceLogId: 10,
          targetReleasedQty: new Prisma.Decimal(20),
        }),
        expect.anything(),
      );
    });

    it("should release source usage only up to the returned quantity, not the full allocation", async () => {
      (repository.findOrderByDocumentNo as jest.Mock).mockResolvedValue(null);
      (repository.createOrder as jest.Mock).mockResolvedValue(
        mockReturnOrderWithSource,
      );
      (repository.findOrderById as jest.Mock).mockResolvedValue(mockPickOrder);
      (
        repository.sumActiveReturnedQtyByPickLine as jest.Mock
      ).mockResolvedValue(new Map());
      // Single usage: allocated 50, released 0 — returning only 20
      (
        inventoryService.listSourceUsagesForConsumerLine as jest.Mock
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

      // Must release only 20, not the full 50
      expect(inventoryService.releaseInventorySource).toHaveBeenCalledWith(
        expect.objectContaining({
          sourceLogId: 10,
          targetReleasedQty: new Prisma.Decimal(20),
        }),
        expect.anything(),
      );
      // Must not release the full allocated qty (50)
      expect(inventoryService.releaseInventorySource).not.toHaveBeenCalledWith(
        expect.objectContaining({
          targetReleasedQty: new Prisma.Decimal(50),
        }),
        expect.anything(),
      );
    });

    it("should release incrementally across multiple usage records, stopping when returned qty is exhausted", async () => {
      (repository.findOrderByDocumentNo as jest.Mock).mockResolvedValue(null);
      (repository.createOrder as jest.Mock).mockResolvedValue(
        mockReturnOrderWithSource,
      );
      (repository.findOrderById as jest.Mock).mockResolvedValue(mockPickOrder);
      (
        repository.sumActiveReturnedQtyByPickLine as jest.Mock
      ).mockResolvedValue(new Map());
      // Two usages for the pick line: 30 + 20 = 50 allocated; returning 20
      (
        inventoryService.listSourceUsagesForConsumerLine as jest.Mock
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

      // Oldest usage (sourceLogId=10) absorbs the full 20-unit return
      expect(inventoryService.releaseInventorySource).toHaveBeenCalledTimes(1);
      expect(inventoryService.releaseInventorySource).toHaveBeenCalledWith(
        expect.objectContaining({
          sourceLogId: 10,
          targetReleasedQty: new Prisma.Decimal(20),
        }),
        expect.anything(),
      );
    });

    it("should reject return creation when source usages cannot cover the full linked quantity", async () => {
      (repository.findOrderByDocumentNo as jest.Mock).mockResolvedValue(null);
      // Return order qty=20, pick line qty=50 — cumulative cap passes
      (repository.createOrder as jest.Mock).mockResolvedValue(
        mockReturnOrderWithSource,
      );
      (repository.findOrderById as jest.Mock).mockResolvedValue(mockPickOrder);
      (
        repository.sumActiveReturnedQtyByPickLine as jest.Mock
      ).mockResolvedValue(new Map());
      // Only 10 unreleased available (allocated=20, released=10)
      (
        inventoryService.listSourceUsagesForConsumerLine as jest.Mock
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

      // Guard must reject: linkedQty=20 but only 10 unreleased available
      await expect(service.createReturnOrder(dto, "1")).rejects.toThrow(
        BadRequestException,
      );
    });

    it("full sequence: re-return after void releases correctly from restored usages", async () => {
      // Proves the return -> void return -> partial re-return story.
      // After R1 (qty=20) is voided, source usage is restored to releasedQty=0.
      // R2 (qty=30) must then be able to release 30 from that restored usage.
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
      (repository.findOrderByDocumentNo as jest.Mock).mockResolvedValue(null);
      (repository.createOrder as jest.Mock).mockResolvedValue(mockReReturn);
      (repository.findOrderById as jest.Mock).mockResolvedValue(mockPickOrder);
      // Prior return R1 was voided → active qty is 0 again
      (
        repository.sumActiveReturnedQtyByPickLine as jest.Mock
      ).mockResolvedValue(new Map());
      // R1 void restored releasedQty to 0; R2 sees the full allocation available
      (
        inventoryService.listSourceUsagesForConsumerLine as jest.Mock
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

      // R2 releases exactly 30 from the restored usage (0 + 30 = 30)
      expect(inventoryService.releaseInventorySource).toHaveBeenCalledWith(
        expect.objectContaining({
          sourceLogId: 10,
          targetReleasedQty: new Prisma.Decimal(30),
        }),
        expect.anything(),
      );
    });
  });

  describe("voidReturnOrder", () => {
    const mockReturnOrderEffective = {
      ...mockPickOrder,
      id: 2,
      documentNo: "WM-RETURN-001",
      orderType: WorkshopMaterialOrderType.RETURN,
      lifecycleStatus: DocumentLifecycleStatus.EFFECTIVE,
      inventoryEffectStatus: InventoryEffectStatus.POSTED,
      lines: [
        {
          id: 10,
          orderId: 2,
          lineNo: 1,
          materialId: 100,
          materialCodeSnapshot: "MAT001",
          materialNameSnapshot: "Material A",
          materialSpecSnapshot: "Spec",
          unitCodeSnapshot: "PCS",
          quantity: new Prisma.Decimal(20),
          unitPrice: new Prisma.Decimal(10),
          amount: new Prisma.Decimal(200),
          costUnitPrice: null,
          costAmount: null,
          sourceDocumentType: "WorkshopMaterialOrder",
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

    it("should restore released source usages when voiding a return order", async () => {
      (repository.findOrderById as jest.Mock)
        .mockResolvedValueOnce(mockReturnOrderEffective)
        .mockResolvedValueOnce({
          ...mockReturnOrderEffective,
          lifecycleStatus: DocumentLifecycleStatus.VOIDED,
          inventoryEffectStatus: InventoryEffectStatus.REVERSED,
        });
      // Usage: 20 of 50 was released by this return order when it was created
      (
        inventoryService.listSourceUsagesForConsumerLine as jest.Mock
      ).mockResolvedValue([
        {
          sourceLogId: 10,
          consumerLineId: 1,
          allocatedQty: new Prisma.Decimal(50),
          releasedQty: new Prisma.Decimal(20),
        },
      ]);
      (inventoryService.getLogsForDocument as jest.Mock).mockResolvedValue([
        { id: 5 },
      ]);
      (repository.updateOrder as jest.Mock).mockResolvedValue({});

      await service.voidReturnOrder(2, "void for re-return test", "1");

      // Must restore the 20 that was released: targetReleasedQty = 20 - 20 = 0
      expect(inventoryService.releaseInventorySource).toHaveBeenCalledWith(
        expect.objectContaining({
          sourceLogId: 10,
          consumerDocumentId: 1,
          consumerLineId: 1,
          targetReleasedQty: new Prisma.Decimal(0),
        }),
        expect.anything(),
      );
      expect(
        repository.deactivateDocumentRelationsForReturn,
      ).toHaveBeenCalledWith(2, expect.anything());
    });

    it("should void return order, restore partial usages across multiple records, and reverse inventory", async () => {
      // Two usage records: return released 15 from record A and 5 from record B (total 20)
      const returnOrderWith20 = mockReturnOrderEffective;
      (repository.findOrderById as jest.Mock)
        .mockResolvedValueOnce(returnOrderWith20)
        .mockResolvedValueOnce({
          ...returnOrderWith20,
          lifecycleStatus: DocumentLifecycleStatus.VOIDED,
        });
      (
        inventoryService.listSourceUsagesForConsumerLine as jest.Mock
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
      (inventoryService.getLogsForDocument as jest.Mock).mockResolvedValue([
        { id: 5 },
      ]);
      (repository.updateOrder as jest.Mock).mockResolvedValue({});

      await service.voidReturnOrder(2, "Test void", "1");

      // Reverse order: newer record (11) is processed first → restore 5, then record (10) → restore 15
      expect(inventoryService.releaseInventorySource).toHaveBeenCalledWith(
        expect.objectContaining({
          sourceLogId: 11,
          targetReleasedQty: new Prisma.Decimal(0),
        }),
        expect.anything(),
      );
      expect(inventoryService.releaseInventorySource).toHaveBeenCalledWith(
        expect.objectContaining({
          sourceLogId: 10,
          targetReleasedQty: new Prisma.Decimal(0),
        }),
        expect.anything(),
      );
      expect(inventoryService.reverseStock).toHaveBeenCalledWith(
        expect.objectContaining({ logIdToReverse: 5 }),
        expect.anything(),
      );
    });
  });

  describe("updateOrder", () => {
    it("should block pick-order revise when active return downstream exists", async () => {
      (repository.findOrderById as jest.Mock).mockResolvedValue(mockPickOrder);
      (repository.hasActiveReturnDownstream as jest.Mock).mockResolvedValue(
        true,
      );

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

      expect(inventoryService.reverseStock).not.toHaveBeenCalled();
    });

    it("should reverse and replay pick inventory effects on revise", async () => {
      const existingPickOrder = mockPickOrder;
      const recreatedPickLine = {
        ...existingPickOrder.lines[0],
        id: 12,
        quantity: new Prisma.Decimal(40),
        amount: new Prisma.Decimal(400),
      };
      const revisedPickOrder = {
        ...existingPickOrder,
        bizDate: new Date("2025-03-15"),
        revisionNo: 2,
        totalQty: new Prisma.Decimal(40),
        totalAmount: new Prisma.Decimal(400),
        lines: [recreatedPickLine],
      };

      (repository.findOrderById as jest.Mock)
        .mockResolvedValueOnce(existingPickOrder)
        .mockResolvedValueOnce(existingPickOrder)
        .mockResolvedValueOnce(revisedPickOrder);
      (repository.createOrderLine as jest.Mock).mockResolvedValue(
        recreatedPickLine,
      );
      (repository.updateOrder as jest.Mock).mockResolvedValue(revisedPickOrder);
      (inventoryService.getLogsForDocument as jest.Mock).mockResolvedValue([
        { id: 5, businessDocumentLineId: 1 },
      ]);

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
        inventoryService.releaseAllSourceUsagesForConsumer,
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          consumerDocumentType: "WorkshopMaterialOrder",
          consumerDocumentId: 1,
          operatorId: "1",
        }),
        expect.anything(),
      );
      expect(inventoryService.reverseStock).toHaveBeenCalledWith(
        expect.objectContaining({
          logIdToReverse: 5,
          idempotencyKey: "WorkshopMaterialOrder:rev:1:r2:log:5",
        }),
        expect.anything(),
      );
      expect(repository.deleteOrderLinesByOrderId).toHaveBeenCalledWith(
        1,
        expect.anything(),
      );
      expect(inventoryService.settleConsumerOut).toHaveBeenCalledWith(
        expect.objectContaining({
          businessDocumentId: 1,
          businessDocumentLineId: 12,
          quantity: new Prisma.Decimal(40),
          operationType: "PICK_OUT",
          idempotencyKey: "WorkshopMaterialOrder:1:rev:2:line:12",
        }),
        expect.anything(),
      );
      expect(repository.updateOrder).toHaveBeenCalledWith(
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
        approvalService.createOrRefreshApprovalDocument,
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          documentType: "WorkshopMaterialOrder",
          documentId: 1,
          documentNumber: "WM-PICK-001",
        }),
        expect.anything(),
      );
      expect(approvalService.markApprovalNotRequired).not.toHaveBeenCalled();
      expect(result).toEqual(revisedPickOrder);
    });

    it("should restore old return usages, replace lines, and replay return linkage", async () => {
      const existingReturnOrder = {
        ...mockPickOrder,
        id: 2,
        documentNo: "WM-RETURN-001",
        orderType: WorkshopMaterialOrderType.RETURN,
        lines: [
          {
            ...mockPickOrder.lines[0],
            id: 10,
            orderId: 2,
            quantity: new Prisma.Decimal(20),
            amount: new Prisma.Decimal(200),
            sourceDocumentType: "WorkshopMaterialOrder",
            sourceDocumentId: 1,
            sourceDocumentLineId: 1,
          },
        ],
      };
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

      (repository.findOrderById as jest.Mock)
        .mockResolvedValueOnce(existingReturnOrder)
        .mockResolvedValueOnce(existingReturnOrder)
        .mockResolvedValueOnce(mockPickOrder)
        .mockResolvedValueOnce(mockPickOrder)
        .mockResolvedValueOnce(revisedReturnOrder);
      (repository.createOrderLine as jest.Mock).mockResolvedValue(
        createdReturnLine,
      );
      (repository.updateOrder as jest.Mock).mockResolvedValue(
        revisedReturnOrder,
      );
      (inventoryService.getLogsForDocument as jest.Mock).mockResolvedValue([
        { id: 5, businessDocumentLineId: 10 },
      ]);
      (
        inventoryService.listSourceUsagesForConsumerLine as jest.Mock
      ).mockResolvedValueOnce([
        {
          sourceLogId: 10,
          consumerLineId: 1,
          allocatedQty: new Prisma.Decimal(50),
          releasedQty: new Prisma.Decimal(20),
        },
      ]);
      (
        inventoryService.listSourceUsagesForConsumerLine as jest.Mock
      ).mockResolvedValueOnce([
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

      expect(inventoryService.reverseStock).toHaveBeenCalledWith(
        expect.objectContaining({
          logIdToReverse: 5,
        }),
        expect.anything(),
      );
      expect(
        repository.deactivateDocumentRelationsForReturn,
      ).toHaveBeenCalledWith(2, expect.anything());
      expect(
        repository.deleteDocumentLineRelationsForReturn,
      ).toHaveBeenCalledWith(2, expect.anything());
      expect(repository.deleteOrderLinesByOrderId).toHaveBeenCalledWith(
        2,
        expect.anything(),
      );
      expect(inventoryService.increaseStock).toHaveBeenCalledWith(
        expect.objectContaining({
          businessDocumentId: 2,
          businessDocumentLineId: 20,
          quantity: new Prisma.Decimal(15),
          operationType: "RETURN_IN",
        }),
        expect.anything(),
      );
      expect(inventoryService.releaseInventorySource).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({
          sourceLogId: 10,
          targetReleasedQty: new Prisma.Decimal(0),
        }),
        expect.anything(),
      );
      expect(inventoryService.releaseInventorySource).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
          sourceLogId: 10,
          targetReleasedQty: new Prisma.Decimal(15),
        }),
        expect.anything(),
      );
      expect(repository.updateOrder).toHaveBeenCalledWith(
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
        approvalService.createOrRefreshApprovalDocument,
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

      (repository.findOrderById as jest.Mock)
        .mockResolvedValueOnce(existingScrapOrder)
        .mockResolvedValueOnce(existingScrapOrder)
        .mockResolvedValueOnce(revisedScrapOrder);
      (repository.createOrderLine as jest.Mock).mockResolvedValue(
        recreatedScrapLine,
      );
      (repository.updateOrder as jest.Mock).mockResolvedValue(
        revisedScrapOrder,
      );
      (inventoryService.getLogsForDocument as jest.Mock).mockResolvedValue([
        { id: 7, businessDocumentLineId: 1 },
      ]);

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
        inventoryService.releaseAllSourceUsagesForConsumer,
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          consumerDocumentType: "WorkshopMaterialOrder",
          consumerDocumentId: 3,
          operatorId: "1",
        }),
        expect.anything(),
      );
      expect(inventoryService.reverseStock).toHaveBeenCalledWith(
        expect.objectContaining({
          logIdToReverse: 7,
          idempotencyKey: "WorkshopMaterialOrder:rev:3:r2:log:7",
        }),
        expect.anything(),
      );
      expect(inventoryService.settleConsumerOut).toHaveBeenCalledWith(
        expect.objectContaining({
          businessDocumentId: 3,
          businessDocumentLineId: 30,
          quantity: new Prisma.Decimal(6),
          operationType: "SCRAP_OUT",
          idempotencyKey: "WorkshopMaterialOrder:3:rev:2:line:30",
        }),
        expect.anything(),
      );
      expect(repository.updateOrder).toHaveBeenCalledWith(
        3,
        expect.objectContaining({
          revisionNo: { increment: 1 },
          totalQty: new Prisma.Decimal(6),
          totalAmount: new Prisma.Decimal(60),
          auditStatusSnapshot: AuditStatusSnapshot.NOT_REQUIRED,
        }),
        expect.anything(),
      );
      expect(approvalService.markApprovalNotRequired).toHaveBeenCalledWith(
        "WorkshopMaterialOrder",
        3,
        "1",
        expect.anything(),
      );
      expect(
        approvalService.createOrRefreshApprovalDocument,
      ).not.toHaveBeenCalled();
      expect(result).toEqual(revisedScrapOrder);
    });
  });

  describe("voidPickOrder", () => {
    it("should void pick order, release source usage, and reverse inventory", async () => {
      (repository.findOrderById as jest.Mock).mockResolvedValue(mockPickOrder);
      (repository.hasActiveReturnDownstream as jest.Mock).mockResolvedValue(
        false,
      );
      (inventoryService.getLogsForDocument as jest.Mock).mockResolvedValue([
        { id: 1 },
      ]);
      (repository.updateOrder as jest.Mock).mockResolvedValue({
        ...mockPickOrder,
        lifecycleStatus: DocumentLifecycleStatus.VOIDED,
      });
      (repository.findOrderById as jest.Mock)
        .mockResolvedValueOnce(mockPickOrder)
        .mockResolvedValueOnce({
          ...mockPickOrder,
          lifecycleStatus: DocumentLifecycleStatus.VOIDED,
          inventoryEffectStatus: InventoryEffectStatus.REVERSED,
        });

      const result = await service.voidPickOrder(1, "Test void", "1");

      expect(inventoryService.reverseStock).toHaveBeenCalledWith(
        expect.objectContaining({
          logIdToReverse: 1,
          idempotencyKey: expect.stringContaining("void"),
        }),
        expect.anything(),
      );
      expect(
        inventoryService.releaseAllSourceUsagesForConsumer,
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          consumerDocumentType: "WorkshopMaterialOrder",
          consumerDocumentId: 1,
          operatorId: "1",
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
      (repository.findOrderById as jest.Mock).mockResolvedValue(null);

      await expect(service.voidPickOrder(999, undefined, "1")).rejects.toThrow(
        NotFoundException,
      );
    });

    it("should block void when active return downstream exists", async () => {
      (repository.findOrderById as jest.Mock).mockResolvedValue(mockPickOrder);
      (repository.hasActiveReturnDownstream as jest.Mock).mockResolvedValue(
        true,
      );

      await expect(service.voidPickOrder(1, "blocked", "1")).rejects.toThrow(
        "存在未作废的退料单下游，不能作废领料单",
      );
      expect(inventoryService.reverseStock).not.toHaveBeenCalled();
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

      (repository.findOrderById as jest.Mock)
        .mockResolvedValueOnce(scrapOrder)
        .mockResolvedValueOnce({
          ...scrapOrder,
          lifecycleStatus: DocumentLifecycleStatus.VOIDED,
          inventoryEffectStatus: InventoryEffectStatus.REVERSED,
        });
      (inventoryService.getLogsForDocument as jest.Mock).mockResolvedValue([
        { id: 9 },
      ]);
      (repository.updateOrder as jest.Mock).mockResolvedValue({
        ...scrapOrder,
        lifecycleStatus: DocumentLifecycleStatus.VOIDED,
      });

      const result = await service.voidScrapOrder(3, "scrap void", "1");

      expect(
        inventoryService.releaseAllSourceUsagesForConsumer,
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          consumerDocumentType: "WorkshopMaterialOrder",
          consumerDocumentId: 3,
          operatorId: "1",
        }),
        expect.anything(),
      );
      expect(inventoryService.reverseStock).toHaveBeenCalledWith(
        expect.objectContaining({
          logIdToReverse: 9,
          idempotencyKey: "WorkshopMaterialOrder:void:3:log:9",
        }),
        expect.anything(),
      );
      expect(repository.updateOrder).toHaveBeenCalledWith(
        3,
        expect.objectContaining({
          lifecycleStatus: DocumentLifecycleStatus.VOIDED,
          inventoryEffectStatus: InventoryEffectStatus.REVERSED,
          auditStatusSnapshot: AuditStatusSnapshot.NOT_REQUIRED,
          voidReason: "scrap void",
        }),
        expect.anything(),
      );
      expect(approvalService.markApprovalNotRequired).toHaveBeenCalledWith(
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

  describe("listPickOrders", () => {
    it("should return paginated pick orders", async () => {
      (repository.findOrders as jest.Mock).mockResolvedValue({
        items: [mockPickOrder],
        total: 1,
      });

      const result = await service.listPickOrders({ limit: 10, offset: 0 });

      expect(result.items).toHaveLength(1);
      expect(result.total).toBe(1);
      expect(repository.findOrders).toHaveBeenCalledWith(
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
      (repository.findOrderById as jest.Mock).mockResolvedValue(mockPickOrder);

      const result = await service.getPickOrderById(1);

      expect(result).toEqual(mockPickOrder);
    });

    it("should throw NotFoundException when not found", async () => {
      (repository.findOrderById as jest.Mock).mockResolvedValue(null);

      await expect(service.getPickOrderById(999)).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
