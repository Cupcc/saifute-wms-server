import { Test } from "@nestjs/testing";
import { DocumentLifecycleStatus } from "../../../../generated/prisma/client";
import { PrismaService } from "../../../shared/prisma/prisma.service";
import { InventoryService } from "../../inventory-core/application/inventory.service";
import { MasterDataService } from "../../master-data/application/master-data.service";
import { RdProjectRepository } from "../../rd-project/infrastructure/rd-project.repository";
import { RdStocktakeOrderRepository } from "../infrastructure/rd-stocktake-order.repository";
import { RdStocktakeOrderService } from "./rd-stocktake-order.service";

export const mockRdProject = {
  id: 701,
  projectCode: "TEST-RDP-001",
  projectName: "测试研发项目",
  projectTargetId: 7001,
  workshopId: 6,
  lifecycleStatus: DocumentLifecycleStatus.EFFECTIVE,
};

export interface RdStocktakeOrderTestContext {
  service: RdStocktakeOrderService;
  repository: jest.Mocked<RdStocktakeOrderRepository>;
  masterDataService: jest.Mocked<MasterDataService>;
  rdProjectRepository: jest.Mocked<RdProjectRepository>;
  inventoryService: jest.Mocked<InventoryService>;
  prisma: { runInTransaction: jest.Mock };
}

export async function setupRdStocktakeOrderTestModule(): Promise<RdStocktakeOrderTestContext> {
  const prisma = {
    runInTransaction: jest.fn((handler: (tx: unknown) => Promise<unknown>) =>
      handler({}),
    ),
  };

  const moduleRef = await Test.createTestingModule({
    providers: [
      RdStocktakeOrderService,
      {
        provide: PrismaService,
        useValue: prisma,
      },
      {
        provide: RdStocktakeOrderRepository,
        useValue: {
          findOrders: jest.fn(),
          findOrderById: jest.fn(),
          findOrderByDocumentNo: jest.fn(),
          createOrder: jest.fn(),
          updateOrder: jest.fn(),
          updateOrderLine: jest.fn(),
        },
      },
      {
        provide: MasterDataService,
        useValue: {
          getWorkshopById: jest.fn(),
          getStockScopeByCode: jest.fn().mockResolvedValue({
            id: 2,
            scopeCode: "RD_SUB",
            scopeName: "研发小仓",
          }),
          getMaterialById: jest.fn(),
        },
      },
      {
        provide: RdProjectRepository,
        useValue: {
          findProjects: jest.fn().mockResolvedValue({
            items: [mockRdProject],
            total: 1,
          }),
          findProjectById: jest.fn().mockResolvedValue(mockRdProject),
          findProjectTargetBySource: jest.fn(),
          updateProjectTarget: jest.fn(),
          attachProjectTargetToProject: jest.fn(),
          createProjectTarget: jest.fn(),
        },
      },
      {
        provide: InventoryService,
        useValue: {
          getAttributedQuantitySnapshot: jest.fn(),
          increaseStock: jest.fn(),
          decreaseStock: jest.fn(),
          reverseStock: jest.fn(),
        },
      },
    ],
  }).compile();

  const service = moduleRef.get(RdStocktakeOrderService);
  const repository: jest.Mocked<RdStocktakeOrderRepository> =
    moduleRef.get(RdStocktakeOrderRepository);
  const masterDataService: jest.Mocked<MasterDataService> =
    moduleRef.get(MasterDataService);
  const rdProjectRepository: jest.Mocked<RdProjectRepository> =
    moduleRef.get(RdProjectRepository);
  const inventoryService: jest.Mocked<InventoryService> =
    moduleRef.get(InventoryService);

  repository.findOrderByDocumentNo.mockResolvedValue(null);
  masterDataService.getWorkshopById.mockResolvedValue({
    id: 6,
    workshopName: "研发小仓",
    defaultHandlerPersonnelId: null,
    defaultHandlerPersonnel: null,
    status: "ACTIVE",
    createdBy: null,
    createdAt: new Date("2026-03-29T00:00:00.000Z"),
    updatedBy: null,
    updatedAt: new Date("2026-03-29T00:00:00.000Z"),
  } as Awaited<ReturnType<MasterDataService["getWorkshopById"]>>);

  return {
    service,
    repository,
    masterDataService,
    rdProjectRepository,
    inventoryService,
    prisma,
  };
}
