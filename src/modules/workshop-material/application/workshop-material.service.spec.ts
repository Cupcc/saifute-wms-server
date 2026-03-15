import { ConflictException, NotFoundException } from "@nestjs/common";
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
import { InventoryService } from "../../inventory-core/application/inventory.service";
import { MasterDataService } from "../../master-data/application/master-data.service";
import { WorkflowService } from "../../workflow/application/workflow.service";
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

  const mockWorkshop = { id: 1, workshopName: "Workshop A" };
  const mockPersonnel = { id: 20, personnelName: "Handler A" };

  let service: WorkshopMaterialService;
  let repository: jest.Mocked<WorkshopMaterialRepository>;
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
            updateOrder: jest.fn(),
            hasActiveReturnDownstream: jest.fn().mockResolvedValue(false),
            deactivateDocumentRelationsForReturn: jest
              .fn()
              .mockResolvedValue({ count: 0 }),
          },
        },
        {
          provide: MasterDataService,
          useValue: {
            getMaterialById: jest.fn(),
            getWorkshopById: jest.fn(),
            getPersonnelById: jest.fn(),
          },
        },
        {
          provide: InventoryService,
          useValue: {
            decreaseStock: jest.fn().mockResolvedValue({ id: 1 }),
            increaseStock: jest.fn().mockResolvedValue({ id: 1 }),
            reverseStock: jest.fn().mockResolvedValue({ id: 2 }),
            getLogsForDocument: jest.fn().mockResolvedValue([{ id: 1 }]),
            allocateInventorySource: jest.fn().mockResolvedValue({}),
            releaseInventorySource: jest.fn().mockResolvedValue({}),
            listSourceUsages: jest
              .fn()
              .mockResolvedValue({ items: [], total: 0 }),
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

    service = moduleRef.get(WorkshopMaterialService);
    repository = moduleRef.get(WorkshopMaterialRepository);
    masterDataService = moduleRef.get(MasterDataService);
    inventoryService = moduleRef.get(InventoryService);
    workflowService = moduleRef.get(WorkflowService);

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
      expect(inventoryService.decreaseStock).toHaveBeenCalledWith(
        expect.objectContaining({
          materialId: 100,
          workshopId: 1,
          operationType: "PICK_OUT",
          businessDocumentType: "WorkshopMaterialOrder",
          businessDocumentId: 1,
          businessDocumentNumber: "WM-PICK-001",
        }),
        expect.anything(),
      );
      expect(workflowService.createOrRefreshAuditDocument).toHaveBeenCalledWith(
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
      expect(inventoryService.decreaseStock).toHaveBeenCalledWith(
        expect.objectContaining({
          operationType: "SCRAP_OUT",
        }),
        expect.anything(),
      );
      expect(
        workflowService.createOrRefreshAuditDocument,
      ).not.toHaveBeenCalled();
    });
  });

  describe("createReturnOrder", () => {
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
          workshopId: 1,
          operationType: "RETURN_IN",
          quantity: expect.anything(),
        }),
        expect.anything(),
      );
    });
  });

  describe("voidPickOrder", () => {
    it("should void pick order, release source usage, and reverse inventory", async () => {
      (repository.findOrderById as jest.Mock).mockResolvedValue(mockPickOrder);
      (repository.hasActiveReturnDownstream as jest.Mock).mockResolvedValue(
        false,
      );
      (inventoryService.listSourceUsages as jest.Mock).mockResolvedValue({
        items: [
          {
            sourceLogId: 11,
            consumerLineId: 1,
            allocatedQty: new Prisma.Decimal(50),
            releasedQty: new Prisma.Decimal(0),
          },
        ],
        total: 1,
      });
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
      expect(inventoryService.releaseInventorySource).toHaveBeenCalledWith(
        expect.objectContaining({
          sourceLogId: 11,
          consumerDocumentType: "WorkshopMaterialOrder",
          consumerDocumentId: 1,
          consumerLineId: 1,
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
