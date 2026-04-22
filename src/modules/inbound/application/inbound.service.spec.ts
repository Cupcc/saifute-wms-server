import { NotFoundException } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import {
  AuditStatusSnapshot,
  DocumentFamily,
  DocumentLifecycleStatus,
  InventoryEffectStatus,
  InventoryOperationType,
  Prisma,
  StockInOrderType,
} from "../../../../generated/prisma/client";
import { PrismaService } from "../../../shared/prisma/prisma.service";
import { ApprovalService } from "../../approval/application/approval.service";
import { InventoryService } from "../../inventory-core/application/inventory.service";
import { MasterDataService } from "../../master-data/application/master-data.service";
import {
  applyAcceptanceStatusesForOrder,
  reverseAcceptanceStatusesForOrder,
} from "../../rd-subwarehouse/application/rd-material-status.helper";
import { RdProcurementRequestService } from "../../rd-subwarehouse/application/rd-procurement-request.service";
import { InboundRepository } from "../infrastructure/inbound.repository";
import { InboundAcceptanceCreationService } from "./inbound-acceptance-creation.service";
import { InboundAcceptanceUpdateService } from "./inbound-acceptance-update.service";
import { InboundProductionReceiptCreationService } from "./inbound-production-receipt-creation.service";
import { InboundProductionReceiptUpdateService } from "./inbound-production-receipt-update.service";
import { InboundSharedService } from "./inbound-shared.service";
import { InboundService } from "./inbound.service";

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
  const mockOrderWithoutWorkshop = {
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
  const mockUncategorizedCategory = {
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
  let rdProcurementRequestService: jest.Mocked<RdProcurementRequestService>;
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
      expect(repository.createOrder).toHaveBeenCalled();
      expect(inventoryService.increaseStock).toHaveBeenCalledWith(
        expect.objectContaining({
          materialId: 100,
          stockScope: "MAIN",
          businessDocumentType: "StockInOrder",
          businessDocumentId: 1,
          businessDocumentNumber: "SI-001",
        }),
        expect.anything(),
      );
      expect(
        approvalService.createOrRefreshApprovalDocument,
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          documentFamily: DocumentFamily.STOCK_IN,
          documentType: "StockInOrder",
          documentId: 1,
          documentNumber: "SI-001",
        }),
        expect.anything(),
      );
      expect(repository.createOrder).toHaveBeenCalledWith(
        expect.anything(),
        expect.arrayContaining([
          expect.objectContaining({
            materialCategoryIdSnapshot: 99,
            materialCategoryCodeSnapshot: "RESISTOR",
            materialCategoryNameSnapshot: "电阻",
            materialCategoryPathSnapshot: [
              { id: 99, categoryCode: "RESISTOR", categoryName: "电阻" },
            ],
          }),
        ]),
        expect.anything(),
      );
    });

    it("should allow acceptance order without workshop", async () => {
      (repository.findOrderByDocumentNo as jest.Mock).mockResolvedValue(null);
      (repository.createOrder as jest.Mock).mockResolvedValue(
        mockOrderWithoutWorkshop,
      );

      const dto = {
        documentNo: "SI-NO-WS",
        orderType: StockInOrderType.ACCEPTANCE,
        bizDate: "2025-03-14",
        supplierId: 10,
        handlerPersonnelId: 20,
        lines: [{ materialId: 100, quantity: "100", unitPrice: "10" }],
      };

      const result = await service.createOrder(dto, "1");

      expect(result).toEqual(mockOrderWithoutWorkshop);
      expect(masterDataService.getWorkshopById).not.toHaveBeenCalled();
      expect(repository.createOrder).toHaveBeenCalledWith(
        expect.objectContaining({
          workshopId: null,
          workshopNameSnapshot: null,
        }),
        expect.anything(),
        expect.anything(),
      );
    });

    it("should persist handler name snapshot when no personnel id is provided", async () => {
      (repository.findOrderByDocumentNo as jest.Mock).mockResolvedValue(null);
      (repository.createOrder as jest.Mock).mockResolvedValue({
        ...mockOrder,
        handlerPersonnelId: null,
        handlerNameSnapshot: "当前账号昵称",
      });

      await service.createOrder(
        {
          documentNo: "SI-HANDLER-NAME",
          orderType: StockInOrderType.ACCEPTANCE,
          bizDate: "2025-03-14",
          supplierId: 10,
          handlerName: "当前账号昵称",
          lines: [{ materialId: 100, quantity: "100", unitPrice: "10" }],
        },
        "1",
      );

      expect(masterDataService.getPersonnelById).not.toHaveBeenCalled();
      expect(repository.createOrder).toHaveBeenCalledWith(
        expect.objectContaining({
          handlerPersonnelId: null,
          handlerNameSnapshot: "当前账号昵称",
        }),
        expect.anything(),
        expect.anything(),
      );
    });

    it("should pass unit cost snapshot from inbound line price to increaseStock", async () => {
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

      await service.createOrder(dto, "1");

      expect(inventoryService.increaseStock).toHaveBeenCalledWith(
        expect.objectContaining({
          unitCost: expect.any(Prisma.Decimal),
          costAmount: expect.any(Prisma.Decimal),
        }),
        expect.anything(),
      );
    });

    it("should fall back to uncategorized snapshot when material category is missing", async () => {
      (repository.findOrderByDocumentNo as jest.Mock).mockResolvedValue(null);
      (repository.createOrder as jest.Mock).mockResolvedValue(mockOrder);
      (masterDataService.getMaterialById as jest.Mock).mockResolvedValue({
        ...mockMaterial,
        category: null,
      });
      (prisma.materialCategory.findUnique as jest.Mock).mockResolvedValue(
        mockUncategorizedCategory,
      );

      await service.createOrder(
        {
          documentNo: "SI-UNCAT",
          orderType: StockInOrderType.ACCEPTANCE,
          bizDate: "2025-03-14",
          supplierId: 10,
          workshopId: 1,
          lines: [{ materialId: 100, quantity: "10", unitPrice: "10" }],
        },
        "1",
      );

      expect(prisma.materialCategory.findUnique).toHaveBeenCalledWith({
        where: { categoryCode: "UNCATEGORIZED" },
        select: {
          id: true,
          categoryCode: true,
          categoryName: true,
        },
      });
      expect(repository.createOrder).toHaveBeenCalledWith(
        expect.anything(),
        expect.arrayContaining([
          expect.objectContaining({
            materialCategoryIdSnapshot: 1,
            materialCategoryCodeSnapshot: "UNCATEGORIZED",
            materialCategoryNameSnapshot: "未分类",
            materialCategoryPathSnapshot: [
              {
                id: 1,
                categoryCode: "UNCATEGORIZED",
                categoryName: "未分类",
              },
            ],
          }),
        ]),
        expect.anything(),
      );
    });

    it("should block void when source log has unreleased allocations", async () => {
      (repository.findOrderById as jest.Mock).mockResolvedValue(mockOrder);
      (
        repository.hasActiveDownstreamDependencies as jest.Mock
      ).mockResolvedValue(false);
      (inventoryService.getLogsForDocument as jest.Mock).mockResolvedValue([
        { id: 1 },
      ]);
      (
        inventoryService.hasUnreleasedAllocations as jest.Mock
      ).mockResolvedValue(true);

      await expect(
        service.voidOrder(1, "test reason", "admin"),
      ).rejects.toThrow(/已有下游消耗分配/);
    });

    it("should create acceptance without creating new RD procurement linkage", async () => {
      (repository.findOrderByDocumentNo as jest.Mock).mockResolvedValue(null);
      (repository.createOrder as jest.Mock).mockResolvedValue(mockOrder);

      const dto = {
        documentNo: "SI-001",
        orderType: StockInOrderType.ACCEPTANCE,
        bizDate: "2025-03-14",
        supplierId: 10,
        workshopId: 1,
        lines: [{ materialId: 100, quantity: "100", unitPrice: "10" }],
      };

      await service.createOrder(dto, "1");

      expect(rdProcurementRequestService.getRequestById).not.toHaveBeenCalled();
      expect(repository.createOrder).toHaveBeenCalledWith(
        expect.objectContaining({
          rdProcurementRequestId: null,
          rdProcurementRequestNoSnapshot: null,
          rdProcurementProjectCodeSnapshot: null,
          rdProcurementProjectNameSnapshot: null,
          workshopId: 1,
        }),
        expect.arrayContaining([
          expect.objectContaining({
            rdProcurementRequestLineId: null,
          }),
        ]),
        expect.anything(),
      );
      expect(inventoryService.increaseStock).toHaveBeenCalledWith(
        expect.objectContaining({
          stockScope: "MAIN",
        }),
        expect.anything(),
      );
      expect(applyAcceptanceStatusesForOrder).toHaveBeenCalled();
    });

    it("should allow plain acceptance for non-main workshops while still posting to MAIN stock", async () => {
      (repository.findOrderByDocumentNo as jest.Mock).mockResolvedValue(null);
      (repository.createOrder as jest.Mock).mockResolvedValue({
        ...mockOrder,
        workshopId: 6,
        workshopNameSnapshot: "研发小仓",
      });
      (masterDataService.getWorkshopById as jest.Mock).mockResolvedValueOnce({
        id: 6,
        workshopCode: "RD",
        workshopName: "研发小仓",
      });

      await service.createOrder(
        {
          documentNo: "SI-PLAIN-RD",
          orderType: StockInOrderType.ACCEPTANCE,
          bizDate: "2025-03-14",
          workshopId: 6,
          supplierId: 10,
          lines: [{ materialId: 100, quantity: "10", unitPrice: "10" }],
        },
        "1",
      );

      expect(repository.createOrder).toHaveBeenCalledWith(
        expect.objectContaining({
          workshopId: 6,
          workshopNameSnapshot: "研发小仓",
        }),
        expect.anything(),
        expect.anything(),
      );
      expect(inventoryService.increaseStock).toHaveBeenCalledWith(
        expect.objectContaining({
          stockScope: "MAIN",
        }),
        expect.anything(),
      );
    });

    it("should allow production receipt for non-main workshops while still posting to MAIN stock", async () => {
      (repository.findOrderByDocumentNo as jest.Mock).mockResolvedValue(null);
      (repository.createOrder as jest.Mock).mockResolvedValue({
        ...mockOrder,
        workshopId: 6,
        workshopNameSnapshot: "研发小仓",
        orderType: StockInOrderType.PRODUCTION_RECEIPT,
      });
      (masterDataService.getWorkshopById as jest.Mock).mockResolvedValueOnce({
        id: 6,
        workshopCode: "RD",
        workshopName: "研发小仓",
      });

      await service.createIntoOrder(
        {
          documentNo: "INTO-RD-001",
          orderType: StockInOrderType.PRODUCTION_RECEIPT,
          bizDate: "2025-03-14",
          workshopId: 6,
          lines: [{ materialId: 100, quantity: "10", unitPrice: "10" }],
        },
        "1",
      );

      expect(repository.createOrder).toHaveBeenCalledWith(
        expect.objectContaining({
          workshopId: 6,
          workshopNameSnapshot: "研发小仓",
        }),
        expect.anything(),
        expect.anything(),
      );
      expect(inventoryService.increaseStock).toHaveBeenCalledWith(
        expect.objectContaining({
          stockScope: "MAIN",
          operationType: InventoryOperationType.PRODUCTION_RECEIPT_IN,
        }),
        expect.anything(),
      );
    });

    it("should reject production receipt without workshop", async () => {
      await expect(
        service.createIntoOrder(
          {
            documentNo: "INTO-NO-WS",
            orderType: StockInOrderType.PRODUCTION_RECEIPT,
            bizDate: "2025-03-14",
            lines: [{ materialId: 100, quantity: "10", unitPrice: "10" }],
          },
          "1",
        ),
      ).rejects.toThrow("生产入库单必须选择部门");
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
      expect(repository.createOrderLine).toHaveBeenCalledWith(
        expect.objectContaining({
          materialCategoryIdSnapshot: 99,
          materialCategoryCodeSnapshot: "RESISTOR",
          materialCategoryNameSnapshot: "电阻",
          materialCategoryPathSnapshot: [
            { id: 99, categoryCode: "RESISTOR", categoryName: "电阻" },
          ],
        }),
        expect.anything(),
      );
      expect(reverseAcceptanceStatusesForOrder).toHaveBeenCalled();
      expect(applyAcceptanceStatusesForOrder).toHaveBeenCalled();
      expect(
        approvalService.createOrRefreshApprovalDocument,
      ).toHaveBeenCalled();
    });

    it("should update acceptance order when workshop is empty", async () => {
      (repository.findOrderById as jest.Mock)
        .mockResolvedValueOnce(mockOrderWithoutWorkshop)
        .mockResolvedValueOnce(mockOrderWithoutWorkshop)
        .mockResolvedValueOnce({ ...mockOrderWithoutWorkshop, lines: [] });
      (inventoryService.getLogsForDocument as jest.Mock).mockResolvedValue([
        { id: 1, businessDocumentLineId: 1 },
      ]);

      const dto = {
        bizDate: "2025-03-15",
        lines: [{ materialId: 100, quantity: "150", unitPrice: "10" }],
      };

      (repository.updateOrder as jest.Mock).mockResolvedValue({
        ...mockOrderWithoutWorkshop,
        totalQty: new Prisma.Decimal(150),
      });
      (repository.deleteOrderLine as jest.Mock).mockResolvedValue(undefined);
      (repository.createOrderLine as jest.Mock).mockResolvedValue({
        ...mockOrder.lines[0],
        id: 2,
        lineNo: 1,
        quantity: new Prisma.Decimal(150),
        amount: new Prisma.Decimal(1500),
      });

      await service.updateOrder(1, dto, "1");

      expect(masterDataService.getWorkshopById).not.toHaveBeenCalled();
      expect(repository.updateOrder).toHaveBeenCalledWith(
        1,
        expect.objectContaining({
          workshopId: null,
          workshopNameSnapshot: null,
        }),
        expect.anything(),
      );
    });

    it("should allow updating handler by free-text snapshot", async () => {
      (repository.findOrderById as jest.Mock)
        .mockResolvedValueOnce(mockOrder)
        .mockResolvedValueOnce(mockOrder)
        .mockResolvedValueOnce({ ...mockOrder, lines: [] });
      (inventoryService.getLogsForDocument as jest.Mock).mockResolvedValue([
        { id: 1, businessDocumentLineId: 1 },
      ]);
      (repository.updateOrder as jest.Mock).mockResolvedValue({
        ...mockOrder,
        handlerPersonnelId: null,
        handlerNameSnapshot: "当前账号昵称",
      });
      (repository.deleteOrderLine as jest.Mock).mockResolvedValue(undefined);
      (repository.createOrderLine as jest.Mock).mockResolvedValue({
        ...mockOrder.lines[0],
        id: 2,
        lineNo: 1,
      });

      await service.updateOrder(
        1,
        {
          handlerPersonnelId: null,
          handlerName: "当前账号昵称",
          lines: [{ materialId: 100, quantity: "100", unitPrice: "10" }],
        },
        "1",
      );

      expect(repository.updateOrder).toHaveBeenCalledWith(
        1,
        expect.objectContaining({
          handlerPersonnelId: null,
          handlerNameSnapshot: "当前账号昵称",
        }),
        expect.anything(),
      );
    });

    it("should keep legacy RD linkage when editing historical linked acceptance orders", async () => {
      const legacyOrder = {
        ...mockOrder,
        rdProcurementRequestId: 9,
        rdProcurementRequestNoSnapshot: "RDPUR-001",
        rdProcurementProjectCodeSnapshot: "RD-PJT-001",
        rdProcurementProjectNameSnapshot: "研发治具项目",
        lines: [
          {
            ...mockOrder.lines[0],
            rdProcurementRequestLineId: 500,
          },
        ],
      };

      (repository.findOrderById as jest.Mock)
        .mockResolvedValueOnce(legacyOrder)
        .mockResolvedValueOnce(legacyOrder)
        .mockResolvedValueOnce(legacyOrder);
      (inventoryService.getLogsForDocument as jest.Mock).mockResolvedValue([
        { id: 1, businessDocumentLineId: 1 },
      ]);
      (repository.updateOrderLine as jest.Mock).mockResolvedValue({
        ...legacyOrder.lines[0],
      });
      (repository.updateOrder as jest.Mock).mockResolvedValue(legacyOrder);

      await service.updateOrder(
        1,
        {
          bizDate: "2025-03-15",
          supplierId: 10,
          lines: [
            {
              id: 1,
              materialId: 100,
              quantity: "100",
              unitPrice: "10",
            },
          ],
        },
        "1",
      );

      expect(rdProcurementRequestService.getRequestById).toHaveBeenCalledWith(
        9,
      );
      expect(repository.updateOrderLine).toHaveBeenCalledWith(
        1,
        expect.objectContaining({
          rdProcurementRequestLineId: 500,
          materialCategoryIdSnapshot: 99,
          materialCategoryCodeSnapshot: "RESISTOR",
          materialCategoryNameSnapshot: "电阻",
          materialCategoryPathSnapshot: [
            { id: 99, categoryCode: "RESISTOR", categoryName: "电阻" },
          ],
        }),
        expect.anything(),
      );
      expect(repository.updateOrder).toHaveBeenCalledWith(
        1,
        expect.objectContaining({
          rdProcurementRequestId: 9,
          rdProcurementRequestNoSnapshot: "RDPUR-001",
        }),
        expect.anything(),
      );
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
  });
});
