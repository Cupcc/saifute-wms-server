import { ConflictException } from "@nestjs/common";
import {
  DocumentLifecycleStatus,
  InventoryEffectStatus,
  Prisma,
  RdProjectMaterialActionType,
} from "../../../../generated/prisma/client";
import { InventoryService } from "../../inventory-core/application/inventory.service";
import { MasterDataService } from "../../master-data/application/master-data.service";
import { RdProcurementRequestService } from "../../rd-subwarehouse/application/rd-procurement-request.service";
import type { CreateRdProjectDto } from "../dto/create-rd-project.dto";
import { RdProjectRepository } from "../infrastructure/rd-project.repository";
import { RdProjectService } from "./rd-project.service";
import {
  baseProject,
  setupRdProjectTestModule,
  sourcePickAction,
  stockScope,
} from "./rd-project.spec-helpers";

describe("RdProjectService — project master", () => {
  let service: RdProjectService;
  let repository: jest.Mocked<RdProjectRepository>;
  let masterDataService: jest.Mocked<MasterDataService>;
  let inventoryService: jest.Mocked<InventoryService>;
  let rdProcurementRequestService: jest.Mocked<RdProcurementRequestService>;

  beforeEach(async () => {
    const ctx = await setupRdProjectTestModule();
    service = ctx.service;
    repository = ctx.repository;
    masterDataService = ctx.masterDataService;
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
      targetCode: "__PENDING_rd_project",
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
    repository.findProjectById.mockResolvedValue({
      ...baseProject,
      projectCode: "YFXMBH-5001",
      projectTargetId: 5001,
    } as never);

    const result = await service.createProject(
      {
        projectName: "RD Project A",
        bizDate: "2026-04-01",
        bomLines: [
          {
            materialId: 100,
            quantity: "100",
            unitPrice: "10",
            manufacturer: "Acme 厂家",
            productLink: "https://example.com/p/100",
          },
        ],
      },
      "1",
    );

    expect(repository.createProject).toHaveBeenCalledWith(
      expect.objectContaining({
        projectCode: expect.stringMatching(/^__PENDING_rd_project_/),
        workshopId: 1,
        workshopNameSnapshot: "研发技术",
      }),
      [
        expect.objectContaining({
          materialId: 100,
          materialNameSnapshot: "Material 100",
          materialSpecSnapshot: "Spec",
          unitCodeSnapshot: "PCS",
          manufacturer: "Acme 厂家",
          productLink: "https://example.com/p/100",
        }),
      ],
      expect.anything(),
    );
    expect(repository.updateProject).toHaveBeenCalledWith(
      1,
      expect.objectContaining({
        projectCode: "YFXMBH-5001",
      }),
      expect.anything(),
    );
    expect(repository.updateProjectTarget).toHaveBeenCalledWith(
      5001,
      expect.objectContaining({
        targetCode: "YFXMBH-5001",
      }),
      expect.anything(),
    );
    expect(inventoryService.settleConsumerOut).not.toHaveBeenCalled();
    expect(result.projectCode).toBe("YFXMBH-5001");
    expect(result.summary.plannedQty.toString()).toBe("100");
    expect(result.summary.plannedAmount.toString()).toBe("1000");
  });

  it("ignores client-submitted project codes when creating", async () => {
    repository.findProjectByCode.mockResolvedValue(baseProject as never);
    repository.createProject.mockResolvedValue({
      ...baseProject,
      projectTargetId: null,
    } as never);
    repository.findProjectTargetBySource.mockResolvedValue(null);
    repository.createProjectTarget.mockResolvedValue({
      id: 5001,
      targetType: "RD_PROJECT",
      targetCode: "__PENDING_rd_project",
      targetName: "Duplicate",
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
    repository.findProjectById.mockResolvedValue({
      ...baseProject,
      projectCode: "YFXMBH-5001",
      projectName: "Duplicate",
      projectTargetId: 5001,
    } as never);

    const result = await service.createProject(
      {
        projectCode: "PRJ-001",
        projectName: "Duplicate",
        bizDate: "2026-04-01",
        workshopId: 1,
      } as CreateRdProjectDto,
      "1",
    );

    expect(repository.findProjectByCode).not.toHaveBeenCalled();
    expect(repository.createProject).toHaveBeenCalledWith(
      expect.objectContaining({
        projectCode: expect.stringMatching(/^__PENDING_rd_project_/),
      }),
      expect.any(Array),
      expect.anything(),
    );
    expect(result.projectCode).toBe("YFXMBH-5001");
  });

  it("maps generated project code unique conflicts to a conflict error on create", async () => {
    repository.createProject.mockResolvedValue({
      ...baseProject,
      projectTargetId: null,
    } as never);
    repository.findProjectTargetBySource.mockResolvedValue(null);
    repository.createProjectTarget.mockResolvedValue({ id: 5001 } as never);
    repository.attachProjectTargetToProject.mockResolvedValue({} as never);
    repository.updateProject.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError("duplicate", {
        code: "P2002",
        clientVersion: "test",
        meta: { target: ["project_code"] },
      }),
    );

    await expect(
      service.createProject(
        { projectName: "RD Project A", bizDate: "2026-04-01" },
        "1",
      ),
    ).rejects.toThrow(ConflictException);
    await expect(
      service.createProject(
        { projectName: "RD Project A", bizDate: "2026-04-01" },
        "1",
      ),
    ).rejects.toThrow("研发项目编码已存在: YFXMBH-5001");
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
    rdProcurementRequestService.getProjectProcurementProjection.mockResolvedValue(
      [
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
      ] as never,
    );

    const result = await service.getProjectById(1);
    const row = result.materialLedger[0];

    expect(row.netUsedQty.toString()).toBe("35");
    expect(row.shortageQty.toString()).toBe("15");
    expect(row.netUsedCostAmount.toString()).toBe("350");
    expect(result.hasShortage).toBe(true);
  });

  it("exposes handoff-in and on-hand cost metrics in the project view", async () => {
    repository.findProjectById.mockResolvedValue(baseProject as never);
    repository.sumEffectiveHandoffInByMaterial.mockResolvedValue(
      new Map([
        [
          100,
          {
            handoffInQty: new Prisma.Decimal(60),
            handoffInCostAmount: new Prisma.Decimal(600),
            materialCodeSnapshot: "MAT-100",
            materialNameSnapshot: "Material 100",
            materialSpecSnapshot: "Spec",
            unitCodeSnapshot: "PCS",
          },
        ],
      ]),
    );
    inventoryService.summarizeAttributedQuantities.mockResolvedValue(
      new Map([[100, new Prisma.Decimal(20)]]) as never,
    );
    inventoryService.listPriceLayerAvailabilityByMaterial.mockResolvedValue(
      new Map([
        [
          100,
          [
            {
              materialId: 100,
              unitCost: new Prisma.Decimal(10),
              availableQty: new Prisma.Decimal(15),
              sourceLogCount: 1,
            },
            {
              materialId: 100,
              unitCost: new Prisma.Decimal(12),
              availableQty: new Prisma.Decimal(5),
              sourceLogCount: 1,
            },
          ],
        ],
      ]),
    );

    const result = await service.getProjectById(1);
    const row = result.materialLedger[0];

    expect(
      inventoryService.listPriceLayerAvailabilityByMaterial,
    ).toHaveBeenCalledWith(
      {
        materialIds: [100],
        stockScope: "RD_SUB",
        projectTargetId: 5001,
      },
      undefined,
    );
    expect(row.handoffInQty.toString()).toBe("60");
    expect(row.handoffInCostAmount.toString()).toBe("600");
    expect(row.onHandCostAmount.toString()).toBe("210");
    expect(result.summary.totalHandoffInQty.toString()).toBe("60");
    expect(result.summary.totalHandoffInCostAmount.toString()).toBe("600");
    expect(result.summary.totalOnHandCostAmount.toString()).toBe("210");
  });

  it("extrapolates on-hand cost from layer average when stocktake inflates the balance", async () => {
    repository.findProjectById.mockResolvedValue(baseProject as never);
    // Balance truth includes stocktake adjustments that never entered layers.
    inventoryService.summarizeAttributedQuantities.mockResolvedValue(
      new Map([[100, new Prisma.Decimal(30)]]) as never,
    );
    inventoryService.listPriceLayerAvailabilityByMaterial.mockResolvedValue(
      new Map([
        [
          100,
          [
            {
              materialId: 100,
              unitCost: new Prisma.Decimal(10),
              availableQty: new Prisma.Decimal(15),
              sourceLogCount: 1,
            },
            {
              materialId: 100,
              unitCost: new Prisma.Decimal(12),
              availableQty: new Prisma.Decimal(5),
              sourceLogCount: 1,
            },
          ],
        ],
      ]),
    );

    const result = await service.getProjectById(1);
    const row = result.materialLedger[0];

    // avg layer cost = 210 / 20 = 10.5; extrapolated over balance 30 = 315.
    expect(row.onHandCostAmount.toString()).toBe("315");
  });

  it("reports zero on-hand cost when no layers are available", async () => {
    repository.findProjectById.mockResolvedValue(baseProject as never);
    inventoryService.summarizeAttributedQuantities.mockResolvedValue(
      new Map([[100, new Prisma.Decimal(30)]]) as never,
    );
    inventoryService.listPriceLayerAvailabilityByMaterial.mockResolvedValue(
      new Map(),
    );

    const result = await service.getProjectById(1);
    const row = result.materialLedger[0];

    expect(row.onHandCostAmount.toString()).toBe("0");
  });

  it("issues one batched price-layer query for all ledger materials", async () => {
    repository.findProjectById.mockResolvedValue({
      ...baseProject,
      bomLines: [
        ...baseProject.bomLines,
        {
          ...baseProject.bomLines[0],
          id: 12,
          lineNo: 2,
          materialId: 200,
          materialCodeSnapshot: "MAT-200",
          materialNameSnapshot: "Material 200",
        },
      ],
    } as never);

    await service.getProjectById(1);

    expect(
      inventoryService.listPriceLayerAvailabilityByMaterial,
    ).toHaveBeenCalledTimes(1);
    expect(
      inventoryService.listPriceLayerAvailabilityByMaterial,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        materialIds: expect.arrayContaining([100, 200]),
      }),
      undefined,
    );
    expect(inventoryService.listPriceLayerAvailability).not.toHaveBeenCalled();
  });

  it("includes off-BOM handoff materials in the ledger as zero-planned rows", async () => {
    repository.findProjectById.mockResolvedValue(baseProject as never);
    repository.sumEffectiveHandoffInByMaterial.mockResolvedValue(
      new Map([
        [
          200,
          {
            handoffInQty: new Prisma.Decimal(7),
            handoffInCostAmount: new Prisma.Decimal(70),
            materialCodeSnapshot: "MAT-200",
            materialNameSnapshot: "Material 200",
            materialSpecSnapshot: "Spec-200",
            unitCodeSnapshot: "PCS",
          },
        ],
      ]),
    );

    const result = await service.getProjectById(1);
    const offBomRow = result.materialLedger.find(
      (row) => row.materialId === 200,
    );

    expect(offBomRow).toBeDefined();
    expect(offBomRow?.plannedQty.toString()).toBe("0");
    expect(offBomRow?.handoffInQty.toString()).toBe("7");
    expect(offBomRow?.handoffInCostAmount.toString()).toBe("70");
    expect(offBomRow?.materialCodeSnapshot).toBe("MAT-200");
    // Off-BOM materials are part of availability/on-hand computation.
    expect(inventoryService.summarizeAttributedQuantities).toHaveBeenCalledWith(
      expect.objectContaining({
        materialIds: expect.arrayContaining([100, 200]),
      }),
      undefined,
    );
    expect(
      inventoryService.listPriceLayerAvailabilityByMaterial,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        materialIds: expect.arrayContaining([100, 200]),
      }),
      undefined,
    );
    expect(result.summary.totalHandoffInQty.toString()).toBe("7");
  });

  it("blocks workshop normalization when active procurement requests exist", async () => {
    repository.findProjectById.mockResolvedValue({
      ...baseProject,
      workshopId: 2,
    } as never);
    rdProcurementRequestService.listRequests.mockResolvedValue({
      total: 1,
      items: [],
    } as never);

    await expect(service.updateProject(1, {}, "1")).rejects.toThrow(
      "已有采购补货关联，不能修改研发项目所属车间",
    );
    expect(repository.updateProject).not.toHaveBeenCalled();
  });

  it("blocks workshop normalization when effective material actions exist", async () => {
    repository.findProjectById.mockResolvedValue({
      ...baseProject,
      workshopId: 2,
    } as never);
    repository.hasEffectiveMaterialActions.mockResolvedValue(true);

    await expect(service.updateProject(1, {}, "1")).rejects.toThrow(
      "已有研发项目物料动作，不能修改研发项目所属车间",
    );
    expect(repository.updateProject).not.toHaveBeenCalled();
  });

  it("normalizes the workshop to the fixed RD workshop on update", async () => {
    repository.findProjectById.mockResolvedValue({
      ...baseProject,
      workshopId: 2,
    } as never);

    await service.updateProject(1, {}, "1");

    expect(repository.updateProject).toHaveBeenCalledWith(
      1,
      expect.objectContaining({ workshopId: 1 }),
      expect.anything(),
    );
  });

  it("guards with exact project code so YFXMBH-1 is not blocked by YFXMBH-10", async () => {
    repository.findProjectById.mockResolvedValue({
      ...baseProject,
      projectCode: "YFXMBH-1",
    } as never);

    await service.voidProject(1, undefined, "1");

    expect(rdProcurementRequestService.listRequests).toHaveBeenCalledWith({
      projectCodeExact: "YFXMBH-1",
      workshopId: 1,
      limit: 1,
      offset: 0,
    });
  });

  it("clears customer and remark when null is submitted on update", async () => {
    repository.findProjectById.mockResolvedValue({
      ...baseProject,
      customerId: 9,
      customerCodeSnapshot: "CUST-9",
      customerNameSnapshot: "Customer 9",
      remark: "old remark",
    } as never);

    await service.updateProject(1, { customerId: null, remark: null }, "1");

    expect(masterDataService.getCustomerById).not.toHaveBeenCalled();
    expect(repository.updateProject).toHaveBeenCalledWith(
      1,
      expect.objectContaining({
        customerId: null,
        customerCodeSnapshot: null,
        customerNameSnapshot: null,
        remark: null,
      }),
      expect.anything(),
    );
  });

  it("maps project code unique conflicts to a conflict error when changing the code", async () => {
    repository.findProjectById.mockResolvedValue(baseProject as never);
    repository.findProjectByCode.mockResolvedValue(null);
    repository.updateProject.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError("duplicate", {
        code: "P2002",
        clientVersion: "test",
        meta: { target: ["project_code"] },
      }),
    );

    await expect(
      service.updateProject(1, { projectCode: "YFXMBH-9" }, "1"),
    ).rejects.toThrow(ConflictException);
    await expect(
      service.updateProject(1, { projectCode: "YFXMBH-9" }, "1"),
    ).rejects.toThrow("研发项目编码已存在: YFXMBH-9");
  });

  it("blocks BOM replace when planned quantity drops below net picked", async () => {
    repository.findProjectById.mockResolvedValue({
      ...baseProject,
      materialActions: [sourcePickAction],
    } as never);

    await expect(
      service.updateProject(
        1,
        {
          bomLines: [{ materialId: 100, quantity: "5", unitPrice: "10" }],
        },
        "1",
      ),
    ).rejects.toThrow("BOM计划数量不能低于已领用净数量");
    await expect(
      service.updateProject(
        1,
        {
          bomLines: [{ materialId: 100, quantity: "5", unitPrice: "10" }],
        },
        "1",
      ),
    ).rejects.toThrow("MAT-100");
    expect(repository.replaceProjectBomLines).not.toHaveBeenCalled();
  });

  it("allows BOM replace when planned quantity covers net picked", async () => {
    repository.findProjectById.mockResolvedValue({
      ...baseProject,
      materialActions: [sourcePickAction],
    } as never);

    await service.updateProject(
      1,
      {
        bomLines: [{ materialId: 100, quantity: "10", unitPrice: "10" }],
      },
      "1",
    );

    expect(repository.replaceProjectBomLines).toHaveBeenCalled();
  });

  it("voids a project without touching inventoryEffectStatus", async () => {
    repository.findProjectById.mockResolvedValue(baseProject as never);

    await service.voidProject(1, "not needed", "1");

    const [, data] = repository.updateProject.mock.calls[0];
    expect(data.lifecycleStatus).toBe(DocumentLifecycleStatus.VOIDED);
    expect(data).not.toHaveProperty("inventoryEffectStatus");
  });
});
