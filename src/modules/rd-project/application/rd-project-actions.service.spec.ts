import {
  Prisma,
  RdProjectMaterialActionType,
  DocumentLifecycleStatus,
  InventoryEffectStatus,
} from "../../../../generated/prisma/client";
import { RdProjectRepository } from "../infrastructure/rd-project.repository";
import { RdProjectService } from "./rd-project.service";
import { InventoryService } from "../../inventory-core/application/inventory.service";
import {
  baseProject,
  stockScope,
  sourcePickAction,
  setupRdProjectTestModule,
} from "./rd-project.spec-helpers";

describe("RdProjectService — material actions", () => {
  let service: RdProjectService;
  let repository: jest.Mocked<RdProjectRepository>;
  let inventoryService: jest.Mocked<InventoryService>;

  beforeEach(async () => {
    const ctx = await setupRdProjectTestModule();
    service = ctx.service;
    repository = ctx.repository;
    inventoryService = ctx.inventoryService;
  });

  it("creates a pick action through inventory-core and persists settled cost", async () => {
    repository.findProjectById.mockResolvedValue(baseProject as never);
    repository.createMaterialAction.mockResolvedValue({
      id: 51,
      documentNo: "PJPK202604010001",
      projectId: 1,
      actionType: RdProjectMaterialActionType.PICK,
      bizDate: new Date("2026-04-01"),
      stockScopeId: 2,
      workshopId: 1,
      lifecycleStatus: DocumentLifecycleStatus.EFFECTIVE,
      inventoryEffectStatus: InventoryEffectStatus.POSTED,
      totalQty: new Prisma.Decimal(10),
      totalAmount: new Prisma.Decimal(90),
      remark: null,
      voidReason: null,
      voidedBy: null,
      voidedAt: null,
      createdBy: "1",
      createdAt: new Date(),
      updatedBy: "1",
      updatedAt: new Date(),
      stockScope,
      rdProject: { id: 1, stockScopeId: 2, workshopId: 1 },
      lines: [
        {
          id: 52,
          actionId: 51,
          lineNo: 1,
          materialId: 100,
          materialCodeSnapshot: "MAT-100",
          materialNameSnapshot: "Material 100",
          materialSpecSnapshot: "Spec",
          unitCodeSnapshot: "PCS",
          quantity: new Prisma.Decimal(10),
          unitPrice: new Prisma.Decimal(9),
          amount: new Prisma.Decimal(90),
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
      id: 51,
      documentNo: "PJPK202604010001",
      projectId: 1,
      actionType: RdProjectMaterialActionType.PICK,
      bizDate: new Date("2026-04-01"),
      stockScopeId: 2,
      workshopId: 1,
      lifecycleStatus: DocumentLifecycleStatus.EFFECTIVE,
      inventoryEffectStatus: InventoryEffectStatus.POSTED,
      totalQty: new Prisma.Decimal(10),
      totalAmount: new Prisma.Decimal(90),
      remark: null,
      voidReason: null,
      voidedBy: null,
      voidedAt: null,
      createdBy: "1",
      createdAt: new Date(),
      updatedBy: "1",
      updatedAt: new Date(),
      stockScope,
      rdProject: { id: 1, stockScopeId: 2, workshopId: 1 },
      lines: [
        {
          id: 52,
          actionId: 51,
          lineNo: 1,
          materialId: 100,
          materialCodeSnapshot: "MAT-100",
          materialNameSnapshot: "Material 100",
          materialSpecSnapshot: "Spec",
          unitCodeSnapshot: "PCS",
          quantity: new Prisma.Decimal(10),
          unitPrice: new Prisma.Decimal(9),
          amount: new Prisma.Decimal(90),
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
    inventoryService.settleConsumerOut.mockResolvedValue({
      outLog: { id: 901 },
      settledUnitCost: new Prisma.Decimal(10),
      settledCostAmount: new Prisma.Decimal(100),
      allocations: [],
    } as never);

    const result = await service.createMaterialAction(
      1,
      {
        actionType: RdProjectMaterialActionType.PICK,
        bizDate: "2026-04-01",
        lines: [
          {
            materialId: 100,
            quantity: "10",
            unitPrice: "9",
          },
        ],
      },
      "1",
    );

    expect(inventoryService.settleConsumerOut).toHaveBeenCalledWith(
      expect.objectContaining({
        stockScope: "RD_SUB",
        operationType: "RD_PROJECT_OUT",
        businessDocumentType: "RdProjectMaterialAction",
        businessDocumentId: 51,
      }),
      expect.anything(),
    );
    expect(repository.updateMaterialActionLineCost).toHaveBeenCalledWith(
      52,
      {
        costUnitPrice: new Prisma.Decimal(10),
        costAmount: new Prisma.Decimal(100),
      },
      expect.anything(),
    );
    expect(repository.findMaterialActionById).toHaveBeenCalledWith(
      51,
      expect.anything(),
    );
  });

  it("creates a return action by releasing source usages and increasing stock", async () => {
    repository.findProjectById.mockResolvedValue(baseProject as never);
    repository.findMaterialActionById.mockImplementation(async (id: number) => {
      if (id === 41) {
        return sourcePickAction as never;
      }
      return {
        id: 61,
        documentNo: "PJRT202604020001",
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
        stockScope,
        rdProject: { id: 1, stockScopeId: 2, workshopId: 1 },
        lines: [
          {
            id: 62,
            actionId: 61,
            lineNo: 1,
            materialId: 100,
            materialCodeSnapshot: "MAT-100",
            materialNameSnapshot: "Material 100",
            materialSpecSnapshot: "Spec",
            unitCodeSnapshot: "PCS",
            quantity: new Prisma.Decimal(5),
            unitPrice: new Prisma.Decimal(10),
            amount: new Prisma.Decimal(50),
            costUnitPrice: new Prisma.Decimal(10),
            costAmount: new Prisma.Decimal(50),
            sourceDocumentType: "RdProjectMaterialAction",
            sourceDocumentId: 41,
            sourceDocumentLineId: 42,
            remark: null,
            createdBy: "1",
            createdAt: new Date(),
            updatedBy: "1",
            updatedAt: new Date(),
          },
        ],
      } as never;
    });
    repository.createMaterialAction.mockResolvedValue({
      id: 61,
      documentNo: "PJRT202604020001",
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
      stockScope,
      rdProject: { id: 1, stockScopeId: 2, workshopId: 1 },
      lines: [
        {
          id: 62,
          actionId: 61,
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
          sourceDocumentId: 41,
          sourceDocumentLineId: 42,
          remark: null,
          createdBy: "1",
          createdAt: new Date(),
          updatedBy: "1",
          updatedAt: new Date(),
        },
      ],
    } as never);
    inventoryService.listSourceUsagesForConsumerLine.mockResolvedValue([
      {
        sourceLogId: 1001,
        allocatedQty: new Prisma.Decimal(10),
        releasedQty: new Prisma.Decimal(0),
        sourceLog: {
          unitCost: new Prisma.Decimal(10),
        },
      },
    ] as never);
    inventoryService.increaseStock.mockResolvedValue({ id: 1002 } as never);

    const result = await service.createMaterialAction(
      1,
      {
        actionType: RdProjectMaterialActionType.RETURN,
        bizDate: "2026-04-02",
        lines: [
          {
            materialId: 100,
            quantity: "5",
            unitPrice: "10",
            sourceDocumentType: "RdProjectMaterialAction",
            sourceDocumentId: 41,
            sourceDocumentLineId: 42,
          },
        ],
      },
      "1",
    );

    expect(inventoryService.releaseInventorySource).toHaveBeenCalledWith(
      expect.objectContaining({
        consumerDocumentType: "RdProjectMaterialAction",
        consumerDocumentId: 41,
        consumerLineId: 42,
        targetReleasedQty: new Prisma.Decimal(5),
      }),
      expect.anything(),
    );
    expect(inventoryService.increaseStock).toHaveBeenCalledWith(
      expect.objectContaining({
        stockScope: "RD_SUB",
        operationType: "RETURN_IN",
        businessDocumentType: "RdProjectMaterialAction",
        businessDocumentId: 61,
        unitCost: new Prisma.Decimal(10),
        costAmount: new Prisma.Decimal(50),
      }),
      expect.anything(),
    );
    expect(repository.findMaterialActionById).toHaveBeenCalledWith(
      61,
      expect.anything(),
    );
  });
});
