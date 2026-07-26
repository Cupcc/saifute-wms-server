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
  let masterDataService: jest.Mocked<MasterDataService>;
  let inventoryService: jest.Mocked<InventoryService>;
  let prisma: { runInTransaction: jest.Mock };
  let txMock: { inventorySourceUsage: { aggregate: jest.Mock } };

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
    txMock = {
      inventorySourceUsage: {
        aggregate: jest.fn().mockResolvedValue({
          _sum: { allocatedQty: null, releasedQty: null },
        }),
      },
    };
    prisma = {
      runInTransaction: jest.fn((handler: (tx: unknown) => Promise<unknown>) =>
        handler(txMock),
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
              (handler: (tx: unknown) => Promise<unknown>) => handler(txMock),
            ),
            findProjectById: jest.fn().mockResolvedValue(project),
            findMaterialActionsByProjectId: jest
              .fn()
              .mockResolvedValue({ items: [], total: 0 }),
            findMaterialActionById: jest.fn(),
            findMaterialActionByClientRequestId: jest.fn(),
            findMaterialActionDocumentNosByPrefix: jest
              .fn()
              .mockResolvedValue([]),
            createMaterialAction: jest.fn(),
            updateMaterialAction: jest.fn(),
            updateMaterialActionLineCost: jest.fn(),
            sumActiveReturnedQtyBySourceLine: jest
              .fn()
              .mockResolvedValue(new Map()),
            sumActiveReturnedQtyForSourceActions: jest
              .fn()
              .mockResolvedValue(new Map()),
            hasActiveReturnDownstream: jest.fn(),
            findProjectTargetBySource: jest.fn(),
            createProjectTarget: jest.fn(),
            updateProjectTarget: jest.fn(),
            attachProjectTargetToProject: jest.fn(),
            appendProjectChangeLog: jest.fn(),
            findProjectChangeLogs: jest.fn().mockResolvedValue([]),
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
    masterDataService = moduleRef.get(MasterDataService);
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

  it("returns the same action for a duplicated clientRequestId instead of creating twice", async () => {
    const actionDetail = {
      id: 51,
      documentNo: "RL202604010001",
      projectId: 1,
      actionType: RdProjectMaterialActionType.PICK,
      lifecycleStatus: DocumentLifecycleStatus.EFFECTIVE,
      inventoryEffectStatus: InventoryEffectStatus.POSTED,
      lines: [],
    };
    repository.findMaterialActionByClientRequestId
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(actionDetail as never);
    repository.createMaterialAction.mockResolvedValue(actionDetail as never);
    repository.findMaterialActionById.mockResolvedValue(actionDetail as never);

    const dto = {
      actionType: RdProjectMaterialActionType.PICK,
      bizDate: "2026-04-01",
      clientRequestId: "6a1b3c5d-7e9f-4a2b-8c4d-0e2f4a6b8c0d",
      lines: [{ materialId: 100, quantity: "10", unitPrice: "5" }],
    };

    const first = await service.createMaterialAction(1, dto, "1");
    const second = await service.createMaterialAction(1, dto, "1");

    expect(first).toMatchObject({ id: 51, documentNo: "RL202604010001" });
    expect(second).toEqual(actionDetail);
    expect(repository.createMaterialAction).toHaveBeenCalledTimes(1);
    expect(repository.createMaterialAction).toHaveBeenCalledWith(
      expect.objectContaining({ clientRequestId: dto.clientRequestId }),
      expect.anything(),
      expect.anything(),
    );
    expect(inventoryService.settleConsumerOut).toHaveBeenCalledTimes(0);
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
    expect(repository.findMaterialActionById).toHaveBeenCalledWith(21, txMock);
    expect(repository.sumActiveReturnedQtyBySourceLine).toHaveBeenCalledWith(
      21,
      txMock,
    );
  });

  it("rejects a return exceeding the source line's returnable quantity with line context", async () => {
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
    repository.sumActiveReturnedQtyBySourceLine.mockResolvedValue(
      new Map([[22, new Prisma.Decimal(8)]]),
    );

    await expect(
      service.createMaterialAction(
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
      ),
    ).rejects.toThrow(
      "第 1 行（物料 Material 100）：累计退料数量超过来源领料行可退数量，当前最多还可退 2",
    );
    expect(repository.createMaterialAction).not.toHaveBeenCalled();
  });

  it("filters, paginates, and batches returned-qty aggregation when listing actions", async () => {
    repository.findMaterialActionsByProjectId.mockResolvedValue({
      items: [
        {
          id: 41,
          actionType: RdProjectMaterialActionType.PICK,
          lines: [{ id: 42, quantity: new Prisma.Decimal(10) }],
        },
        {
          id: 43,
          actionType: RdProjectMaterialActionType.RETURN,
          lines: [{ id: 44, quantity: new Prisma.Decimal(4) }],
        },
      ],
      total: 7,
    } as never);
    repository.sumActiveReturnedQtyForSourceActions.mockResolvedValue(
      new Map([[42, new Prisma.Decimal(4)]]),
    );

    const result = await service.listMaterialActions(1, {
      materialId: 100,
      actionType: RdProjectMaterialActionType.PICK,
      limit: 2,
      offset: 4,
    });

    expect(repository.findMaterialActionsByProjectId).toHaveBeenCalledWith({
      projectId: 1,
      materialId: 100,
      actionType: RdProjectMaterialActionType.PICK,
      limit: 2,
      offset: 4,
    });
    expect(
      repository.sumActiveReturnedQtyForSourceActions,
    ).toHaveBeenCalledTimes(1);
    expect(
      repository.sumActiveReturnedQtyForSourceActions,
    ).toHaveBeenCalledWith([41]);
    expect(repository.sumActiveReturnedQtyBySourceLine).not.toHaveBeenCalled();
    expect(result.total).toBe(7);
    expect(result.items[0].lines[0].availableReturnQty?.toString()).toBe("6");
    expect(result.items[1].lines[0].availableReturnQty).toBeUndefined();
  });

  it("clamps the list limit to a maximum of 100 and defaults to 50", async () => {
    await service.listMaterialActions(1);
    expect(repository.findMaterialActionsByProjectId).toHaveBeenLastCalledWith(
      expect.objectContaining({ limit: 50 }),
    );

    await service.listMaterialActions(1, { limit: 999 });
    expect(repository.findMaterialActionsByProjectId).toHaveBeenLastCalledWith(
      expect.objectContaining({ limit: 100 }),
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

  it("returns warnings when pick lines are outside or exceed the BOM plan", async () => {
    repository.findProjectById.mockResolvedValue({
      ...(project as Record<string, unknown>),
      bomLines: [
        {
          materialId: 100,
          quantity: new Prisma.Decimal(8),
        },
      ],
    } as never);
    masterDataService.getMaterialById.mockImplementation(
      async (id: number) =>
        ({
          id,
          materialCode: `MAT-${id}`,
          materialName: `Material ${id}`,
          specModel: "Spec",
          unitCode: "PCS",
        }) as never,
    );
    repository.createMaterialAction.mockResolvedValue({
      id: 71,
      documentNo: "PJP202604010002",
      projectId: 1,
      actionType: RdProjectMaterialActionType.PICK,
      lines: [
        {
          id: 72,
          lineNo: 1,
          materialId: 100,
          materialNameSnapshot: "Material 100",
          quantity: new Prisma.Decimal(10),
        },
        {
          id: 73,
          lineNo: 2,
          materialId: 200,
          materialNameSnapshot: "Material 200",
          quantity: new Prisma.Decimal(3),
        },
      ],
    } as never);
    repository.findMaterialActionById.mockResolvedValue({
      id: 71,
      documentNo: "PJP202604010002",
      projectId: 1,
      actionType: RdProjectMaterialActionType.PICK,
      lines: [],
    } as never);

    const result = (await service.createMaterialAction(
      1,
      {
        actionType: RdProjectMaterialActionType.PICK,
        bizDate: "2026-04-01",
        lines: [
          { materialId: 100, quantity: "10", unitPrice: "5" },
          { materialId: 200, quantity: "3", unitPrice: "2" },
        ],
      },
      "1",
    )) as { warnings?: string[] };

    expect(result.warnings).toEqual([
      "第 1 行：物料 Material 100 累计净领用 10 已超过 BOM 计划数量 8，请及时调整 BOM",
      "第 2 行：物料 Material 200 不在项目 BOM 计划内，请及时调整 BOM",
    ]);
  });

  it("blocks voiding a return when the released stock was re-picked", async () => {
    repository.findMaterialActionById.mockResolvedValue({
      id: 31,
      documentNo: "PJR202604020001",
      projectId: 1,
      actionType: RdProjectMaterialActionType.RETURN,
      bizDate: new Date("2026-04-02"),
      lifecycleStatus: DocumentLifecycleStatus.EFFECTIVE,
      inventoryEffectStatus: InventoryEffectStatus.POSTED,
      lines: [
        {
          id: 32,
          lineNo: 1,
          materialId: 100,
          materialNameSnapshot: "Material 100",
          quantity: new Prisma.Decimal(5),
          sourceDocumentType: "RdProjectMaterialAction",
          sourceDocumentId: 21,
          sourceDocumentLineId: 22,
        },
      ],
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
        releasedQty: new Prisma.Decimal(5),
        status: "PARTIALLY_RELEASED",
        createdBy: "1",
        createdAt: new Date(),
        updatedBy: "1",
        updatedAt: new Date(),
        material: {} as never,
        sourceLog: { changeQty: new Prisma.Decimal(10) } as never,
      },
    ]);
    txMock.inventorySourceUsage.aggregate.mockResolvedValue({
      _sum: {
        allocatedQty: new Prisma.Decimal(12),
        releasedQty: new Prisma.Decimal(0),
      },
    });

    await expect(service.voidMaterialAction(31, "undo", "1")).rejects.toThrow(
      "第 1 行（物料 Material 100）：退料释放的库存已被再次领用，请先撤销后续领料后再作废退料",
    );
    expect(repository.updateMaterialAction).not.toHaveBeenCalled();
  });

  it("voids a return and restores the source usage when the layer still has room", async () => {
    repository.findMaterialActionById.mockResolvedValue({
      id: 31,
      documentNo: "PJR202604020001",
      projectId: 1,
      actionType: RdProjectMaterialActionType.RETURN,
      bizDate: new Date("2026-04-02"),
      lifecycleStatus: DocumentLifecycleStatus.EFFECTIVE,
      inventoryEffectStatus: InventoryEffectStatus.POSTED,
      rdProject: { id: 1, revisionNo: 1 },
      lines: [
        {
          id: 32,
          lineNo: 1,
          materialId: 100,
          materialNameSnapshot: "Material 100",
          quantity: new Prisma.Decimal(5),
          sourceDocumentType: "RdProjectMaterialAction",
          sourceDocumentId: 21,
          sourceDocumentLineId: 22,
        },
      ],
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
        releasedQty: new Prisma.Decimal(5),
        status: "PARTIALLY_RELEASED",
        createdBy: "1",
        createdAt: new Date(),
        updatedBy: "1",
        updatedAt: new Date(),
        material: {} as never,
        sourceLog: { changeQty: new Prisma.Decimal(10) } as never,
      },
    ]);
    txMock.inventorySourceUsage.aggregate.mockResolvedValue({
      _sum: {
        allocatedQty: new Prisma.Decimal(10),
        releasedQty: new Prisma.Decimal(0),
      },
    });

    await service.voidMaterialAction(31, "undo", "1");

    expect(inventoryService.releaseInventorySource).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceLogId: 601,
        consumerDocumentId: 21,
        consumerLineId: 22,
        targetReleasedQty: new Prisma.Decimal(0),
      }),
      txMock,
    );
    expect(repository.updateMaterialAction).toHaveBeenCalledWith(
      31,
      expect.objectContaining({
        lifecycleStatus: DocumentLifecycleStatus.VOIDED,
      }),
      txMock,
    );
  });
});
