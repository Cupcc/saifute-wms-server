import { Test } from "@nestjs/testing";
import {
  AuditStatusSnapshot,
  DocumentLifecycleStatus,
  InventoryEffectStatus,
  Prisma,
  RdProjectMaterialActionType,
} from "../../../../generated/prisma/client";
import { PrismaService } from "../../../shared/prisma/prisma.service";
import { InventoryService } from "../../inventory-core/application/inventory.service";
import { MasterDataService } from "../../master-data/application/master-data.service";
import { RdProcurementRequestService } from "../../rd-subwarehouse/application/rd-procurement-request.service";
import { RdProjectRepository } from "../infrastructure/rd-project.repository";
import { RdProjectService } from "./rd-project.service";
import { RdProjectMasterService } from "./rd-project-master.service";
import { RdProjectMaterialActionService } from "./rd-project-material-action.service";
import { RdProjectMaterialActionHelperService } from "./rd-project-material-action-helper.service";
import { RdProjectViewService } from "./rd-project-view.service";

export const stockScope = {
  id: 2,
  scopeCode: "RD_SUB",
  scopeName: "研发小仓",
  status: "ACTIVE",
  createdBy: null,
  createdAt: new Date(),
  updatedBy: null,
  updatedAt: new Date(),
} as const;

export const baseProject = {
  id: 1,
  projectCode: "PRJ-001",
  projectName: "RD Project A",
  bizDate: new Date("2026-04-01"),
  customerId: null,
  supplierId: null,
  managerPersonnelId: null,
  stockScopeId: 2,
  workshopId: 1,
  projectTargetId: 5001,
  lifecycleStatus: DocumentLifecycleStatus.EFFECTIVE,
  auditStatusSnapshot: AuditStatusSnapshot.NOT_REQUIRED,
  inventoryEffectStatus: InventoryEffectStatus.POSTED,
  revisionNo: 1,
  customerCodeSnapshot: null,
  customerNameSnapshot: null,
  supplierCodeSnapshot: null,
  supplierNameSnapshot: null,
  managerNameSnapshot: null,
  workshopNameSnapshot: "RD Workshop",
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
  stockScope,
  bomLines: [
    {
      id: 11,
      projectId: 1,
      lineNo: 1,
      materialId: 100,
      materialCodeSnapshot: "MAT-100",
      materialNameSnapshot: "Material 100",
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
  materialLines: [],
  materialActions: [],
};

export const sourcePickAction = {
  id: 41,
  documentNo: "PJPK202604010001",
  projectId: 1,
  actionType: RdProjectMaterialActionType.PICK,
  bizDate: new Date("2026-04-01"),
  stockScopeId: 2,
  workshopId: 1,
  lifecycleStatus: DocumentLifecycleStatus.EFFECTIVE,
  inventoryEffectStatus: InventoryEffectStatus.POSTED,
  totalQty: new Prisma.Decimal(10),
  totalAmount: new Prisma.Decimal(100),
  remark: null,
  voidReason: null,
  voidedBy: null,
  voidedAt: null,
  createdBy: "1",
  createdAt: new Date(),
  updatedBy: "1",
  updatedAt: new Date(),
  stockScope,
  rdProject: {
    id: 1,
    stockScopeId: 2,
    workshopId: 1,
  },
  lines: [
    {
      id: 42,
      actionId: 41,
      lineNo: 1,
      materialId: 100,
      materialCodeSnapshot: "MAT-100",
      materialNameSnapshot: "Material 100",
      materialSpecSnapshot: "Spec",
      unitCodeSnapshot: "PCS",
      quantity: new Prisma.Decimal(10),
      unitPrice: new Prisma.Decimal(10),
      amount: new Prisma.Decimal(100),
      costUnitPrice: new Prisma.Decimal(10),
      costAmount: new Prisma.Decimal(100),
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

export interface RdProjectTestContext {
  service: RdProjectService;
  repository: jest.Mocked<RdProjectRepository>;
  masterDataService: jest.Mocked<MasterDataService>;
  inventoryService: jest.Mocked<InventoryService>;
  rdProcurementRequestService: jest.Mocked<RdProcurementRequestService>;
  prisma: { runInTransaction: jest.Mock };
}

export async function setupRdProjectTestModule(): Promise<RdProjectTestContext> {
  const prisma = {
    runInTransaction: jest.fn((handler: (tx: unknown) => Promise<unknown>) =>
      handler({}),
    ),
  };

  const moduleRef = await Test.createTestingModule({
    providers: [
      RdProjectService,
      RdProjectMasterService,
      RdProjectViewService,
      RdProjectMaterialActionService,
      RdProjectMaterialActionHelperService,
      {
        provide: PrismaService,
        useValue: prisma,
      },
      {
        provide: RdProjectRepository,
        useValue: {
          runInTransaction: jest.fn(
            (handler: (tx: unknown) => Promise<unknown>) => handler({}),
          ),
          findProjectByCode: jest.fn(),
          findProjectById: jest.fn(),
          findProjects: jest.fn(),
          createProject: jest.fn(),
          updateProject: jest.fn(),
          replaceProjectBomLines: jest.fn(),
          findProjectTargetBySource: jest.fn(),
          createProjectTarget: jest.fn(),
          updateProjectTarget: jest.fn(),
          attachProjectTargetToProject: jest.fn(),
          hasActiveDownstreamDependencies: jest.fn().mockResolvedValue(false),
          hasEffectiveMaterialActions: jest.fn().mockResolvedValue(false),
          findMaterialActionsByProjectId: jest.fn().mockResolvedValue([]),
          findMaterialActionById: jest.fn(),
          createMaterialAction: jest.fn(),
          updateMaterialAction: jest.fn(),
          updateMaterialActionLineCost: jest.fn(),
          hasActiveReturnDownstream: jest.fn().mockResolvedValue(false),
          sumActiveReturnedQtyBySourceLine: jest
            .fn()
            .mockResolvedValue(new Map()),
        },
      },
      {
        provide: MasterDataService,
        useValue: {
          getMaterialById: jest.fn().mockResolvedValue({
            id: 100,
            materialCode: "MAT-100",
            materialName: "Material 100",
            specModel: "Spec",
            unitCode: "PCS",
          }),
          getWorkshopById: jest.fn().mockResolvedValue({
            id: 1,
            workshopName: "RD Workshop",
          }),
          getStockScopeByCode: jest.fn().mockResolvedValue(stockScope),
          getCustomerById: jest.fn(),
          getSupplierById: jest.fn(),
          getPersonnelById: jest.fn(),
        },
      },
      {
        provide: InventoryService,
        useValue: {
          settleConsumerOut: jest.fn(),
          increaseStock: jest.fn(),
          releaseAllSourceUsagesForConsumer: jest.fn(),
          releaseInventorySource: jest.fn(),
          reverseStock: jest.fn(),
          getLogsForDocument: jest.fn().mockResolvedValue([]),
          summarizeAttributedQuantities: jest.fn().mockResolvedValue(new Map()),
          getBalanceSnapshot: jest.fn().mockResolvedValue({
            quantityOnHand: new Prisma.Decimal(0),
          }),
          listSourceUsagesForConsumerLine: jest.fn().mockResolvedValue([]),
        },
      },
      {
        provide: RdProcurementRequestService,
        useValue: {
          listRequests: jest.fn().mockResolvedValue({
            total: 0,
            items: [],
          }),
        },
      },
    ],
  }).compile();

  return {
    service: moduleRef.get(RdProjectService),
    repository: moduleRef.get(RdProjectRepository),
    masterDataService: moduleRef.get(MasterDataService),
    inventoryService: moduleRef.get(InventoryService),
    rdProcurementRequestService: moduleRef.get(RdProcurementRequestService),
    prisma,
  };
}
