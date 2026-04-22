import {
  AuditStatusSnapshot,
  DocumentLifecycleStatus,
  InventoryEffectStatus,
  Prisma,
  SalesStockOrderType,
} from "../../../../generated/prisma/client";
import { PrismaService } from "../../../shared/prisma/prisma.service";
import { ApprovalService } from "../../approval/application/approval.service";
import { InventoryService } from "../../inventory-core/application/inventory.service";
import { MasterDataService } from "../../master-data/application/master-data.service";
import { SalesProjectService } from "../../sales-project/application/sales-project.service";
import { SalesRepository } from "../infrastructure/sales.repository";

export const mockMaterialCategoryLeaf = {
  id: 99,
  categoryCode: "RESISTOR",
  categoryName: "电阻",
  parentId: null,
};

export const mockUncategorizedCategory = {
  id: 1,
  categoryCode: "UNCATEGORIZED",
  categoryName: "未分类",
  parentId: null,
};

export const mockMaterial = {
  id: 100,
  materialCode: "MAT001",
  materialName: "Material A",
  specModel: "Spec",
  unitCode: "PCS",
  category: mockMaterialCategoryLeaf,
};

export const mockWorkshop = { id: 1, workshopName: "Workshop A" };

export const mockCustomer = {
  id: 10,
  customerCode: "CUST001",
  customerName: "Customer A",
};

export const mockPersonnel = { id: 20, personnelName: "Handler A" };

export const mockSalesProjectReference = {
  id: 300,
  salesProjectCode: "SP-001",
  salesProjectName: "Sales Project A",
  customerId: 10,
  workshopId: 1,
  projectTargetId: 7001,
  lifecycleStatus: DocumentLifecycleStatus.EFFECTIVE,
};

export const mockOutboundOrder = {
  id: 1,
  documentNo: "OB-001",
  orderType: SalesStockOrderType.OUTBOUND,
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
      salesProjectId: 300,
      salesProjectCodeSnapshot: "SP-001",
      salesProjectNameSnapshot: "Sales Project A",
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

export const mockSalesReturnOrder = {
  ...mockOutboundOrder,
  id: 2,
  documentNo: "SR-001",
  orderType: SalesStockOrderType.SALES_RETURN,
  lines: [
    {
      id: 2,
      orderId: 2,
      lineNo: 1,
      materialId: 100,
      salesProjectId: 300,
      salesProjectCodeSnapshot: "SP-001",
      salesProjectNameSnapshot: "Sales Project A",
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
      sourceDocumentType: "SalesStockOrder",
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

export type SalesPrismaMock = {
  runInTransaction: jest.Mock;
  materialCategory: { findUnique: jest.Mock };
  stockInPriceCorrectionOrderLine: { findMany: jest.Mock };
  stockInOrderLine: { findMany: jest.Mock };
};

export function createSalesPrismaMock(): SalesPrismaMock {
  return {
    runInTransaction: jest.fn((handler: (tx: unknown) => Promise<unknown>) =>
      handler({}),
    ),
    materialCategory: {
      findUnique: jest.fn().mockResolvedValue(mockMaterialCategoryLeaf),
    },
    stockInPriceCorrectionOrderLine: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    stockInOrderLine: {
      findMany: jest.fn().mockResolvedValue([]),
    },
  };
}

export function buildSalesProviders(prismaMock: SalesPrismaMock) {
  return [
    { provide: PrismaService, useValue: prismaMock },
    {
      provide: SalesRepository,
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
        getMaterialById: jest.fn().mockResolvedValue(mockMaterial),
        getMaterialCategoryById: jest.fn(),
        getWorkshopById: jest.fn().mockResolvedValue(mockWorkshop),
        getStockScopeByCode: jest.fn().mockResolvedValue({
          id: 1,
          scopeCode: "MAIN",
          scopeName: "主仓",
        }),
        getCustomerById: jest.fn().mockResolvedValue(mockCustomer),
        getPersonnelById: jest.fn().mockResolvedValue(mockPersonnel),
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
        listSourceUsages: jest.fn().mockResolvedValue({ items: [], total: 0 }),
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
      provide: SalesProjectService,
      useValue: {
        listProjectReferencesByIds: jest
          .fn()
          .mockResolvedValue(new Map([[300, mockSalesProjectReference]])),
      },
    },
    {
      provide: ApprovalService,
      useValue: {
        createOrRefreshApprovalDocument: jest.fn().mockResolvedValue({}),
        markApprovalNotRequired: jest.fn().mockResolvedValue({ count: 1 }),
      },
    },
  ];
}
