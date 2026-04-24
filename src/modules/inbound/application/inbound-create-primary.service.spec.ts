import { Test } from "@nestjs/testing";
import {
  AuditStatusSnapshot,
  DocumentFamily,
  DocumentLifecycleStatus,
  InventoryEffectStatus,
  Prisma,
  StockInOrderType,
} from "../../../../generated/prisma/client";
import { PrismaService } from "../../../shared/prisma/prisma.service";
import { ApprovalService } from "../../approval/application/approval.service";
import { InventoryService } from "../../inventory-core/application/inventory.service";
import { MasterDataService } from "../../master-data/application/master-data.service";
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
    (repository.findMaterialCategoryByCode as jest.Mock).mockResolvedValue(
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

    expect(repository.findMaterialCategoryByCode).toHaveBeenCalledWith(
      "UNCATEGORIZED",
    );
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
});
