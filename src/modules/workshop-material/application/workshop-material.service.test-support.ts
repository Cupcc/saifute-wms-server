import { Prisma } from "../../../../generated/prisma/client";
import { PrismaService } from "../../../shared/prisma/prisma.service";
import { ApprovalService } from "../../approval/application/approval.service";
import { InventoryService } from "../../inventory-core/application/inventory.service";
import { MasterDataService } from "../../master-data/application/master-data.service";
import { WorkshopMaterialRepository } from "../infrastructure/workshop-material.repository";
import { WorkshopMaterialPickService } from "./workshop-material-pick.service";
import { WorkshopMaterialReturnService } from "./workshop-material-return.service";
import { WorkshopMaterialReturnHelpersService } from "./workshop-material-return-helpers.service";
import { WorkshopMaterialScrapService } from "./workshop-material-scrap.service";
import { WorkshopMaterialSharedService } from "./workshop-material-shared.service";

/**
 * Shared mock builders + service factories used by the per-orderType spec
 * files in this directory. Centralised so each spec can focus on the
 * orderType behaviour without re-declaring 200 lines of `jest.fn()` plumbing.
 */

export function createPrismaMock() {
  return {
    runInTransaction: jest.fn((handler: (tx: unknown) => Promise<unknown>) =>
      handler({
        documentRelation: { upsert: jest.fn().mockResolvedValue({}) },
        documentLineRelation: { upsert: jest.fn().mockResolvedValue({}) },
        rdMaterialStatusHistory: {
          findMany: jest.fn().mockResolvedValue([]),
        },
      }),
    ),
  } as unknown as PrismaService & { runInTransaction: jest.Mock };
}

export function createRepositoryMock() {
  return {
    findOrderByDocumentNo: jest.fn(),
    findOrderById: jest.fn(),
    findOrders: jest.fn(),
    createOrder: jest.fn(),
    createOrderLine: jest.fn(),
    updateOrder: jest.fn(),
    deleteOrderLinesByOrderId: jest.fn().mockResolvedValue({ count: 0 }),
    updateOrderLineCost: jest.fn().mockResolvedValue({}),
    hasActiveReturnDownstream: jest.fn().mockResolvedValue(false),
    deactivateDocumentRelationsForReturn: jest
      .fn()
      .mockResolvedValue({ count: 0 }),
    deleteDocumentLineRelationsForReturn: jest
      .fn()
      .mockResolvedValue({ count: 0 }),
    sumActiveReturnedQtyByPickLine: jest.fn().mockResolvedValue(new Map()),
    runInTransaction: jest.fn((handler: (tx: unknown) => Promise<unknown>) =>
      handler({
        documentRelation: { upsert: jest.fn().mockResolvedValue({}) },
        documentLineRelation: { upsert: jest.fn().mockResolvedValue({}) },
        rdMaterialStatusHistory: {
          findMany: jest.fn().mockResolvedValue([]),
        },
      }),
    ),
    upsertReturnFromPickRelation: jest.fn().mockResolvedValue(undefined),
    findRdProcurementRequestForScrapSource: jest.fn().mockResolvedValue(null),
  } as unknown as jest.Mocked<WorkshopMaterialRepository>;
}

export function createMasterDataServiceMock() {
  return {
    getMaterialById: jest.fn(),
    getWorkshopById: jest.fn(),
    getStockScopeByCode: jest.fn().mockResolvedValue({
      id: 1,
      scopeCode: "MAIN",
      scopeName: "主仓",
    }),
    getPersonnelById: jest.fn(),
  } as unknown as jest.Mocked<MasterDataService>;
}

export function createInventoryServiceMock() {
  return {
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
    releaseAllSourceUsagesForConsumer: jest.fn().mockResolvedValue(undefined),
    listSourceUsages: jest.fn().mockResolvedValue({ items: [], total: 0 }),
    listSourceUsagesForConsumerLine: jest.fn().mockResolvedValue([]),
  } as unknown as jest.Mocked<InventoryService>;
}

export function createApprovalServiceMock() {
  return {
    createOrRefreshApprovalDocument: jest.fn().mockResolvedValue({}),
    markApprovalNotRequired: jest.fn().mockResolvedValue({ count: 1 }),
  } as unknown as jest.Mocked<ApprovalService>;
}

export type WorkshopMaterialMocks = {
  prisma: ReturnType<typeof createPrismaMock>;
  repository: jest.Mocked<WorkshopMaterialRepository>;
  masterDataService: jest.Mocked<MasterDataService>;
  inventoryService: jest.Mocked<InventoryService>;
  approvalService: jest.Mocked<ApprovalService>;
};

export function createMocks(): WorkshopMaterialMocks {
  return {
    prisma: createPrismaMock(),
    repository: createRepositoryMock(),
    masterDataService: createMasterDataServiceMock(),
    inventoryService: createInventoryServiceMock(),
    approvalService: createApprovalServiceMock(),
  };
}

export function createSharedService(mocks: WorkshopMaterialMocks) {
  return new WorkshopMaterialSharedService(
    mocks.repository,
    mocks.masterDataService,
    mocks.inventoryService,
    mocks.approvalService,
  );
}

export function createReturnHelpersService(mocks: WorkshopMaterialMocks) {
  return new WorkshopMaterialReturnHelpersService(
    mocks.repository,
    mocks.inventoryService,
  );
}

export function createPickService(mocks: WorkshopMaterialMocks) {
  return new WorkshopMaterialPickService(createSharedService(mocks));
}

export function createReturnService(mocks: WorkshopMaterialMocks) {
  return new WorkshopMaterialReturnService(
    createSharedService(mocks),
    createReturnHelpersService(mocks),
  );
}

export function createScrapService(mocks: WorkshopMaterialMocks) {
  return new WorkshopMaterialScrapService(createSharedService(mocks));
}

export function applyDefaultMasterDataResponses(mocks: WorkshopMaterialMocks) {
  (mocks.masterDataService.getMaterialById as jest.Mock).mockResolvedValue({
    id: 100,
    materialCode: "MAT001",
    materialName: "Material A",
    specModel: "Spec",
    unitCode: "PCS",
  });
  (mocks.masterDataService.getWorkshopById as jest.Mock).mockResolvedValue({
    id: 1,
    workshopCode: "WS-A",
    workshopName: "Workshop A",
  });
  (mocks.masterDataService.getPersonnelById as jest.Mock).mockResolvedValue({
    id: 20,
    personnelName: "Handler A",
  });
}

// ─── Shared order fixtures ────────────────────────────────────────────────

export function buildMockPickOrder() {
  return {
    id: 1,
    documentNo: "WM-PICK-001",
    orderType: "PICK" as const,
    bizDate: new Date("2025-03-14"),
    handlerPersonnelId: 20,
    workshopId: 1,
    lifecycleStatus: "EFFECTIVE" as const,
    auditStatusSnapshot: "PENDING" as const,
    inventoryEffectStatus: "POSTED" as const,
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
        sourceDocumentType: null as string | null,
        sourceDocumentId: null as number | null,
        sourceDocumentLineId: null as number | null,
        remark: null,
        createdBy: "1",
        createdAt: new Date(),
        updatedBy: "1",
        updatedAt: new Date(),
      },
    ],
  };
}

export function buildMockReturnOrderWithSource() {
  const pick = buildMockPickOrder();
  return {
    ...pick,
    id: 2,
    documentNo: "WM-RETURN-001",
    orderType: "RETURN" as const,
    lines: [
      {
        ...pick.lines[0],
        id: 10,
        orderId: 2,
        quantity: new Prisma.Decimal(20),
        amount: new Prisma.Decimal(200),
        sourceDocumentType: "WorkshopMaterialOrder" as string | null,
        sourceDocumentId: 1 as number | null,
        sourceDocumentLineId: 1 as number | null,
      },
    ],
  };
}
