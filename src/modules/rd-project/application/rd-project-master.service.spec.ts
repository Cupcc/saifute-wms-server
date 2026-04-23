import { ConflictException } from "@nestjs/common";
import {
  Prisma,
  RdProjectMaterialActionType,
  DocumentLifecycleStatus,
  InventoryEffectStatus,
} from "../../../../generated/prisma/client";
import { RdProjectRepository } from "../infrastructure/rd-project.repository";
import { RdProjectService } from "./rd-project.service";
import { InventoryService } from "../../inventory-core/application/inventory.service";
import { RdProcurementRequestService } from "../../rd-subwarehouse/application/rd-procurement-request.service";
import {
  baseProject,
  stockScope,
  setupRdProjectTestModule,
} from "./rd-project.spec-helpers";

describe("RdProjectService — project master", () => {
  let service: RdProjectService;
  let repository: jest.Mocked<RdProjectRepository>;
  let inventoryService: jest.Mocked<InventoryService>;
  let rdProcurementRequestService: jest.Mocked<RdProcurementRequestService>;

  beforeEach(async () => {
    const ctx = await setupRdProjectTestModule();
    service = ctx.service;
    repository = ctx.repository;
    inventoryService = ctx.inventoryService;
    rdProcurementRequestService = ctx.rdProcurementRequestService;
  });

  it("creates a project master with BOM without posting inventory", async () => {
    repository.findProjectByCode.mockResolvedValue(null);
    repository.createProject.mockResolvedValue({
      ...baseProject,
      projectTargetId: null,
    } as never);
    repository.findProjectTargetBySource.mockResolvedValue(null);
    repository.createProjectTarget.mockResolvedValue({
      id: 5001,
      targetType: "RD_PROJECT",
      targetCode: "PRJ-001",
      targetName: "RD Project A",
      sourceDocumentType: "RdProject",
      sourceDocumentId: 1,
      isSystemDefault: false,
      remark: null,
      createdBy: "1",
      createdAt: new Date(),
      updatedBy: "1",
      updatedAt: new Date(),
    } as never);
    repository.attachProjectTargetToProject.mockResolvedValue({} as never);
    repository.findProjectById.mockResolvedValue(baseProject as never);

    const result = await service.createProject(
      {
        projectCode: "PRJ-001",
        projectName: "RD Project A",
        bizDate: "2026-04-01",
        workshopId: 1,
        bomLines: [
          {
            materialId: 100,
            quantity: "100",
            unitPrice: "10",
          },
        ],
      },
      "1",
    );

    expect(repository.createProject).toHaveBeenCalled();
    expect(inventoryService.settleConsumerOut).not.toHaveBeenCalled();
    expect(result.summary.plannedQty.toString()).toBe("100");
    expect(result.summary.plannedAmount.toString()).toBe("1000");
  });

  it("rejects duplicate project codes", async () => {
    repository.findProjectByCode.mockResolvedValue(baseProject as never);

    await expect(
      service.createProject(
        {
          projectCode: "PRJ-001",
          projectName: "Duplicate",
          bizDate: "2026-04-01",
          workshopId: 1,
        },
        "1",
      ),
    ).rejects.toThrow(ConflictException);
  });

  it("builds ledger using BOM, legacy consumption, actions, stock, and replenishment", async () => {
    repository.findProjectById.mockResolvedValue({
      ...baseProject,
      materialLines: [
        {
          id: 21,
          projectId: 1,
          lineNo: 1,
          materialId: 100,
          materialCodeSnapshot: "MAT-100",
          materialNameSnapshot: "Material 100",
          materialSpecSnapshot: "Spec",
          unitCodeSnapshot: "PCS",
          quantity: new Prisma.Decimal(40),
          unitPrice: new Prisma.Decimal(10),
          amount: new Prisma.Decimal(400),
          costUnitPrice: new Prisma.Decimal(10),
          costAmount: new Prisma.Decimal(400),
          remark: null,
          createdBy: "1",
          createdAt: new Date(),
          updatedBy: "1",
          updatedAt: new Date(),
        },
      ],
      materialActions: [
        {
          id: 31,
          documentNo: "PJRT202604020001",
          projectId: 1,
          actionType: RdProjectMaterialActionType.RETURN,
          bizDate: new Date("2026-04-02"),
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
              quantity: new Prisma.Decimal(10),
              unitPrice: new Prisma.Decimal(10),
              amount: new Prisma.Decimal(100),
              costUnitPrice: new Prisma.Decimal(10),
              costAmount: new Prisma.Decimal(100),
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
        },
        {
          id: 33,
          documentNo: "PJSC202604030001",
          projectId: 1,
          actionType: RdProjectMaterialActionType.SCRAP,
          bizDate: new Date("2026-04-03"),
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
          lines: [
            {
              id: 34,
              actionId: 33,
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
        },
      ],
    } as never);
    inventoryService.summarizeAttributedQuantities.mockResolvedValue(
      new Map([[100, new Prisma.Decimal(20)]]) as never,
    );
    rdProcurementRequestService.listRequests.mockResolvedValue({
      total: 1,
      items: [
        {
          id: 88,
          lines: [
            {
              materialId: 100,
              statusLedger: {
                pendingQty: new Prisma.Decimal(30),
                inProcurementQty: new Prisma.Decimal(0),
                acceptedQty: new Prisma.Decimal(0),
                handedOffQty: new Prisma.Decimal(0),
              },
            },
          ],
        },
      ],
    } as never);

    const result = await service.getProjectById(1);
    const row = result.materialLedger[0];

    expect(row.netUsedQty.toString()).toBe("35");
    expect(row.shortageQty.toString()).toBe("15");
    expect(row.netUsedCostAmount.toString()).toBe("350");
    expect(result.hasShortage).toBe(true);
  });
});
