import { NotFoundException } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import {
  AuditStatusSnapshot,
  DocumentLifecycleStatus,
  InventoryEffectStatus,
  Prisma,
  StockInOrderType,
} from "../../../../generated/prisma/client";
import { PrismaService } from "../../../shared/prisma/prisma.service";
import { ApprovalService } from "../../approval/application/approval.service";
import { InventoryService } from "../../inventory-core/application/inventory.service";
import { MasterDataService } from "../../master-data/application/master-data.service";
import { reverseAcceptanceStatusesForOrder } from "../../rd-subwarehouse/application/rd-material-status.helper";
import { RdProcurementRequestService } from "../../rd-subwarehouse/application/rd-procurement-request.service";
import { InboundRepository } from "../infrastructure/inbound.repository";
import { InboundService } from "./inbound.service";
import { InboundAcceptanceCreationService } from "./inbound-acceptance-creation.service";
import { InboundAcceptanceUpdateService } from "./inbound-acceptance-update.service";
import { InboundProductionReceiptCreationService } from "./inbound-production-receipt-creation.service";
import { InboundProductionReceiptUpdateService } from "./inbound-production-receipt-update.service";
import { InboundSharedService } from "./inbound-shared.service";

jest.mock(
  "../../rd-subwarehouse/application/rd-material-status.helper",
  () => ({
    applyAcceptanceStatusesForOrder: jest.fn().mockResolvedValue(undefined),
    reverseAcceptanceStatusesForOrder: jest.fn().mockResolvedValue(undefined),
  }),
);

describe("InboundService", () => {
  const mockOrder = {
    id: 1,
    documentNo: "SI-001",
    orderType: StockInOrderType.ACCEPTANCE,
    bizDate: new Date("2025-03-14"),
    supplierId: 10,
    handlerPersonnelId: 20,
    stockScopeId: 1,
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
  const mockProductionOrder = {
    ...mockOrder,
    id: 3,
    documentNo: "RK-003",
    orderType: StockInOrderType.PRODUCTION_RECEIPT,
  };
  const _mockOrderWithoutWorkshop = {
    ...mockOrder,
    workshopId: null,
    workshopNameSnapshot: null,
  };
  const mockMaterialCategoryLeaf = {
    id: 99,
    categoryCode: "RESISTOR",
    categoryName: "电阻",
    parentId: null,
  };
  const _mockUncategorizedCategory = {
    id: 1,
    categoryCode: "UNCATEGORIZED",
    categoryName: "未分类",
    parentId: null,
  };

  const mockMaterial = {
    id: 100,
    materialCode: "MAT001",
    materialName: "Material A",
    specModel: "Spec",
    unitCode: "PCS",
    category: mockMaterialCategoryLeaf,
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
    projectName: "研发治具项目",
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
  let approvalService: jest.Mocked<ApprovalService>;
  let _rdProcurementRequestService: jest.Mocked<RdProcurementRequestService>;
  let prisma: {
    runInTransaction: jest.Mock;
    materialCategory: { findUnique: jest.Mock };
  };

  beforeEach(async () => {
    prisma = {
      runInTransaction: jest.fn((handler: (tx: unknown) => Promise<unknown>) =>
        handler({}),
      ),
      materialCategory: {
        findUnique: jest.fn().mockResolvedValue(mockMaterialCategoryLeaf),
      },
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        InboundService,
        InboundAcceptanceCreationService,
        InboundAcceptanceUpdateService,
        InboundProductionReceiptCreationService,
        InboundProductionReceiptUpdateService,
        InboundSharedService,
        {
          provide: PrismaService,
          useValue: prisma,
        },
        {
          provide: InboundRepository,
          useValue: {
            runInTransaction: jest.fn(
              (handler: (tx: unknown) => Promise<unknown>) => handler({}),
            ),
            findMaterialCategoryByCode: jest.fn().mockResolvedValue({
              id: 99,
              categoryCode: "RESISTOR",
              categoryName: "电阻",
            }),
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
            getMaterialCategoryById: jest.fn(),
            getWorkshopById: jest.fn(),
            getStockScopeByCode: jest.fn().mockResolvedValue({
              id: 1,
              scopeCode: "MAIN",
              scopeName: "主仓",
            }),
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
            hasUnreleasedAllocations: jest.fn().mockResolvedValue(false),
          },
        },
        {
          provide: ApprovalService,
          useValue: {
            createOrRefreshApprovalDocument: jest.fn().mockResolvedValue({}),
            markApprovalNotRequired: jest.fn().mockResolvedValue({ count: 1 }),
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
    approvalService = moduleRef.get(ApprovalService);
    _rdProcurementRequestService = moduleRef.get(RdProcurementRequestService);

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
      expect(approvalService.markApprovalNotRequired).toHaveBeenCalledWith(
        "StockInOrder",
        1,
        "1",
        expect.anything(),
      );
      expect(reverseAcceptanceStatusesForOrder).toHaveBeenCalled();
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

    it("should return production receipt orders through getIntoOrderById", async () => {
      (repository.findOrderById as jest.Mock).mockResolvedValue(
        mockProductionOrder,
      );

      const result = await service.getIntoOrderById(3);

      expect(result).toEqual(mockProductionOrder);
    });

    it("should keep getOrderById scoped to acceptance orders", async () => {
      (repository.findOrderById as jest.Mock).mockResolvedValue(
        mockProductionOrder,
      );

      await expect(service.getOrderById(3)).rejects.toThrow("不是验收单：3");
    });
  });
});
