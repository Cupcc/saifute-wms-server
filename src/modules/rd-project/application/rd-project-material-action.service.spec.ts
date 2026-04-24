import { BadRequestException } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import {
  DocumentLifecycleStatus,
  InventoryEffectStatus,
  Prisma,
  RdProjectMaterialActionType,
} from "../../../../generated/prisma/client";
import { PrismaService } from "../../../shared/prisma/prisma.service";
import { InventoryService } from "../../inventory-core/application/inventory.service";
import { MasterDataService } from "../../master-data/application/master-data.service";
import { RdProjectRepository } from "../infrastructure/rd-project.repository";
import { RdProjectMaterialActionService } from "./rd-project-material-action.service";
import { RdProjectMaterialActionHelperService } from "./rd-project-material-action-helper.service";

describe("RdProjectMaterialActionService", () => {
  let service: RdProjectMaterialActionService;
  let repository: jest.Mocked<RdProjectRepository>;
  let inventoryService: jest.Mocked<InventoryService>;
  let prisma: { runInTransaction: jest.Mock };

  const project = {
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
    auditStatusSnapshot: "NOT_REQUIRED",
    inventoryEffectStatus: InventoryEffectStatus.POSTED,
    revisionNo: 1,
    customerCodeSnapshot: null,
    customerNameSnapshot: null,
    supplierCodeSnapshot: null,
    supplierNameSnapshot: null,
    managerNameSnapshot: null,
    workshopNameSnapshot: "RD Workshop",
    totalQty: new Prisma.Decimal(0),
    totalAmount: new Prisma.Decimal(0),
    remark: null,
    voidReason: null,
    voidedBy: null,
    voidedAt: null,
    createdBy: "1",
    createdAt: new Date(),
    updatedBy: "1",
    updatedAt: new Date(),
    stockScope: { id: 2, scopeCode: "RD_SUB", scopeName: "研发小仓" },
    bomLines: [],
    materialLines: [],
    materialActions: [],
  } as never;

  beforeEach(async () => {
    prisma = {
      runInTransaction: jest.fn((handler: (tx: unknown) => Promise<unknown>) =>
        handler({}),
      ),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
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
            findProjectById: jest.fn().mockResolvedValue(project),
            findMaterialActionsByProjectId: jest.fn().mockResolvedValue([]),
            findMaterialActionById: jest.fn(),
            createMaterialAction: jest.fn(),
            updateMaterialAction: jest.fn(),
            updateMaterialActionLineCost: jest.fn(),
            sumActiveReturnedQtyBySourceLine: jest
              .fn()
              .mockResolvedValue(new Map()),
            hasActiveReturnDownstream: jest.fn(),
            findProjectTargetBySource: jest.fn(),
            createProjectTarget: jest.fn(),
            updateProjectTarget: jest.fn(),
            attachProjectTargetToProject: jest.fn(),
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
            getStockScopeByCode: jest.fn().mockResolvedValue({
              id: 2,
              scopeCode: "RD_SUB",
              scopeName: "研发小仓",
            }),
          },
        },
        {
          provide: InventoryService,
          useValue: {
            settleConsumerOut: jest.fn().mockResolvedValue({
              outLog: { id: 901 },
              settledUnitCost: new Prisma.Decimal(10),
              settledCostAmount: new Prisma.Decimal(100),
              allocations: [],
            }),
            increaseStock: jest.fn().mockResolvedValue({ id: 902 }),
            listSourceUsagesForConsumerLine: jest.fn().mockResolvedValue([]),
            releaseInventorySource: jest.fn(),
            releaseAllSourceUsagesForConsumer: jest.fn(),
            getLogsForDocument: jest.fn().mockResolvedValue([{ id: 901 }]),
            reverseStock: jest.fn(),
          },
        },
      ],
    }).compile();

    service = moduleRef.get(RdProjectMaterialActionService);
    repository = moduleRef.get(RdProjectRepository);
    inventoryService = moduleRef.get(InventoryService);
  });

  it("creates a pick action through inventory-core with rd-project target", async () => {
    repository.createMaterialAction.mockResolvedValue({
      id: 11,
      documentNo: "PJP202604010001",
      projectId: 1,
      actionType: RdProjectMaterialActionType.PICK,
      bizDate: new Date("2026-04-01"),
      stockScopeId: 2,
      workshopId: 1,
      lifecycleStatus: DocumentLifecycleStatus.EFFECTIVE,
      inventoryEffectStatus: InventoryEffectStatus.POSTED,
      totalQty: new Prisma.Decimal(10),
      totalAmount: new Prisma.Decimal(50),
      remark: null,
      voidReason: null,
      voidedBy: null,
      voidedAt: null,
      createdBy: "1",
      createdAt: new Date(),
      updatedBy: "1",
      updatedAt: new Date(),
      project,
      stockScope: { id: 2, scopeCode: "RD_SUB", scopeName: "研发小仓" },
      lines: [
        {
          id: 12,
          actionId: 11,
          lineNo: 1,
          materialId: 100,
          materialCodeSnapshot: "MAT-100",
          materialNameSnapshot: "Material 100",
          materialSpecSnapshot: "Spec",
          unitCodeSnapshot: "PCS",
          quantity: new Prisma.Decimal(10),
          unitPrice: new Prisma.Decimal(5),
          amount: new Prisma.Decimal(50),
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
    } as never);
    repository.findMaterialActionById.mockResolvedValue({
      id: 11,
      documentNo: "PJP202604010001",
      projectId: 1,
      actionType: RdProjectMaterialActionType.PICK,
      bizDate: new Date("2026-04-01"),
      stockScopeId: 2,
      workshopId: 1,
      lifecycleStatus: DocumentLifecycleStatus.EFFECTIVE,
      inventoryEffectStatus: InventoryEffectStatus.POSTED,
      totalQty: new Prisma.Decimal(10),
      totalAmount: new Prisma.Decimal(50),
      remark: null,
      voidReason: null,
      voidedBy: null,
      voidedAt: null,
      createdBy: "1",
      createdAt: new Date(),
      updatedBy: "1",
      updatedAt: new Date(),
      project,
      stockScope: { id: 2, scopeCode: "RD_SUB", scopeName: "研发小仓" },
      lines: [],
    } as never);

    await service.createMaterialAction(
      1,
      {
        actionType: RdProjectMaterialActionType.PICK,
        bizDate: "2026-04-01",
        lines: [
          {
            materialId: 100,
            quantity: "10",
            unitPrice: "5",
          },
        ],
      },
      "1",
    );

    expect(inventoryService.settleConsumerOut).toHaveBeenCalledWith(
      expect.objectContaining({
        projectTargetId: 5001,
        businessDocumentType: "RdProjectMaterialAction",
        operationType: "RD_PROJECT_OUT",
        stockScope: "RD_SUB",
      }),
      expect.anything(),
    );
    expect(inventoryService.increaseStock).not.toHaveBeenCalled();
  });

  it("creates a return action by restocking and releasing the source pick usage", async () => {
    repository.findMaterialActionById.mockResolvedValueOnce({
      id: 21,
      documentNo: "PJP202604010010",
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
      project,
      stockScope: { id: 2, scopeCode: "RD_SUB", scopeName: "研发小仓" },
      lines: [
        {
          id: 22,
          actionId: 21,
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
    } as never);
    repository.createMaterialAction.mockResolvedValue({
      id: 31,
      documentNo: "PJR202604020001",
      projectId: 1,
      actionType: RdProjectMaterialActionType.RETURN,
      bizDate: new Date("2026-04-02"),
      stockScopeId: 2,
      workshopId: 1,
      lifecycleStatus: DocumentLifecycleStatus.EFFECTIVE,
      inventoryEffectStatus: InventoryEffectStatus.POSTED,
      totalQty: new Prisma.Decimal(5),
      totalAmount: new Prisma.Decimal(50),
      remark: null,
      voidReason: null,
      voidedBy: null,
      voidedAt: null,
      createdBy: "1",
      createdAt: new Date(),
      updatedBy: "1",
      updatedAt: new Date(),
      project,
      stockScope: { id: 2, scopeCode: "RD_SUB", scopeName: "研发小仓" },
      lines: [
        {
          id: 32,
          actionId: 31,
          lineNo: 1,
          materialId: 100,
          materialCodeSnapshot: "MAT-100",
          materialNameSnapshot: "Material 100",
          materialSpecSnapshot: "Spec",
          unitCodeSnapshot: "PCS",
          quantity: new Prisma.Decimal(5),
          unitPrice: new Prisma.Decimal(10),
          amount: new Prisma.Decimal(50),
          costUnitPrice: null,
          costAmount: null,
          sourceDocumentType: "RdProjectMaterialAction",
          sourceDocumentId: 21,
          sourceDocumentLineId: 22,
          remark: null,
          createdBy: "1",
          createdAt: new Date(),
          updatedBy: "1",
          updatedAt: new Date(),
        },
      ],
    } as never);
    repository.findMaterialActionById.mockResolvedValueOnce({
      id: 31,
      documentNo: "PJR202604020001",
      projectId: 1,
      actionType: RdProjectMaterialActionType.RETURN,
      bizDate: new Date("2026-04-02"),
      stockScopeId: 2,
      workshopId: 1,
      lifecycleStatus: DocumentLifecycleStatus.EFFECTIVE,
      inventoryEffectStatus: InventoryEffectStatus.POSTED,
      totalQty: new Prisma.Decimal(5),
      totalAmount: new Prisma.Decimal(50),
      remark: null,
      voidReason: null,
      voidedBy: null,
      voidedAt: null,
      createdBy: "1",
      createdAt: new Date(),
      updatedBy: "1",
      updatedAt: new Date(),
      project,
      stockScope: { id: 2, scopeCode: "RD_SUB", scopeName: "研发小仓" },
      lines: [],
    } as never);
    inventoryService.listSourceUsagesForConsumerLine.mockResolvedValue([
      {
        id: 501,
        materialId: 100,
        sourceLogId: 601,
        consumerDocumentType: "RdProjectMaterialAction",
        consumerDocumentId: 21,
        consumerLineId: 22,
        allocatedQty: new Prisma.Decimal(10),
        releasedQty: new Prisma.Decimal(0),
        status: "ALLOCATED",
        createdBy: "1",
        createdAt: new Date(),
        updatedBy: "1",
        updatedAt: new Date(),
        material: {} as never,
        sourceLog: {} as never,
      },
    ]);

    await service.createMaterialAction(
      1,
      {
        actionType: RdProjectMaterialActionType.RETURN,
        bizDate: "2026-04-02",
        lines: [
          {
            materialId: 100,
            quantity: "5",
            sourceDocumentType: "RdProjectMaterialAction",
            sourceDocumentId: 21,
            sourceDocumentLineId: 22,
          },
        ],
      },
      "1",
    );

    expect(inventoryService.increaseStock).toHaveBeenCalledWith(
      expect.objectContaining({
        projectTargetId: 5001,
        unitCost: new Prisma.Decimal(10),
        costAmount: new Prisma.Decimal(50),
      }),
      expect.anything(),
    );
    expect(inventoryService.releaseInventorySource).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceLogId: 601,
        targetReleasedQty: new Prisma.Decimal(5),
      }),
      expect.anything(),
    );
  });

  it("blocks voiding a pick action when active returns exist", async () => {
    repository.findMaterialActionById.mockResolvedValue({
      id: 41,
      documentNo: "PJP202604030001",
      projectId: 1,
      actionType: RdProjectMaterialActionType.PICK,
      bizDate: new Date("2026-04-03"),
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
      project,
      stockScope: { id: 2, scopeCode: "RD_SUB", scopeName: "研发小仓" },
      lines: [],
    } as never);
    repository.hasActiveReturnDownstream.mockResolvedValue(true);

    await expect(
      service.voidMaterialAction(41, "blocked", "1"),
    ).rejects.toThrow(BadRequestException);
    expect(inventoryService.reverseStock).not.toHaveBeenCalled();
  });
});
