import { BadRequestException, ConflictException } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import {
  AuditStatusSnapshot,
  DocumentLifecycleStatus,
  InventoryEffectStatus,
  Prisma,
  SalesStockOrderType,
} from "../../../../generated/prisma/client";
import { InventoryService } from "../../inventory-core/application/inventory.service";
import { MasterDataService } from "../../master-data/application/master-data.service";
import { SalesProjectRepository } from "../infrastructure/sales-project.repository";
import { SalesProjectService } from "./sales-project.service";
import { SalesProjectLifecycleService } from "./sales-project-lifecycle.service";
import { SalesProjectMaterialViewService } from "./sales-project-material-view.service";
import { SalesProjectOutboundDraftService } from "./sales-project-outbound-draft.service";
import { SalesProjectReferenceService } from "./sales-project-reference.service";

describe("SalesProjectService", () => {
  let service: SalesProjectService;
  let repository: jest.Mocked<SalesProjectRepository>;
  let inventoryService: jest.Mocked<InventoryService>;

  const stockScope = {
    id: 1,
    scopeCode: "MAIN",
    scopeName: "主仓",
    status: "ACTIVE",
    createdBy: null,
    createdAt: new Date(),
    updatedBy: null,
    updatedAt: new Date(),
  } as const;

  const baseProject = {
    id: 1,
    salesProjectCode: "SP-001",
    salesProjectName: "Sales Project A",
    bizDate: new Date("2026-04-10"),
    customerId: 10,
    managerPersonnelId: 20,
    stockScopeId: 1,
    workshopId: 1,
    projectTargetId: 5001,
    lifecycleStatus: DocumentLifecycleStatus.EFFECTIVE,
    auditStatusSnapshot: AuditStatusSnapshot.NOT_REQUIRED,
    inventoryEffectStatus: InventoryEffectStatus.POSTED,
    revisionNo: 1,
    customerCodeSnapshot: "CUST001",
    customerNameSnapshot: "Customer A",
    managerNameSnapshot: "Manager A",
    workshopNameSnapshot: "Workshop A",
    totalQty: new Prisma.Decimal(100),
    totalAmount: new Prisma.Decimal(1000),
    remark: "Project remark",
    voidReason: null,
    voidedBy: null,
    voidedAt: null,
    createdBy: "1",
    createdAt: new Date(),
    updatedBy: "1",
    updatedAt: new Date(),
    stockScope,
    materialLines: [
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
        remark: "Target line",
        createdBy: "1",
        createdAt: new Date(),
        updatedBy: "1",
        updatedAt: new Date(),
      },
    ],
  };

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        SalesProjectService,
        SalesProjectLifecycleService,
        SalesProjectMaterialViewService,
        SalesProjectOutboundDraftService,
        SalesProjectReferenceService,
        {
          provide: SalesProjectRepository,
          useValue: {
            runInTransaction: jest.fn(
              (handler: (tx: unknown) => Promise<unknown>) => handler({}),
            ),
            findProjects: jest.fn(),
            findProjectById: jest.fn(),
            findProjectByCode: jest.fn(),
            findProjectsByIds: jest.fn(),
            createProject: jest.fn(),
            updateProject: jest.fn(),
            replaceProjectMaterialLines: jest.fn(),
            findProjectTargetBySource: jest.fn(),
            createProjectTarget: jest.fn(),
            updateProjectTarget: jest.fn(),
            attachProjectTargetToProject: jest.fn(),
            findEffectiveShipmentLinesByProjectId: jest.fn(),
            findEffectiveAcceptanceLineLinksByProjectId: jest
              .fn()
              .mockResolvedValue([]),
            findMaterialSnapshotsByIds: jest.fn().mockResolvedValue([
              {
                id: 100,
                materialCode: "MAT-100",
                materialName: "Material 100",
                specModel: "Spec",
                unitCode: "PCS",
              },
            ]),
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
            getCustomerById: jest.fn().mockResolvedValue({
              id: 10,
              customerCode: "CUST001",
              customerName: "Customer A",
            }),
            getPersonnelById: jest.fn().mockResolvedValue({
              id: 20,
              personnelName: "Manager A",
            }),
            getWorkshopById: jest.fn().mockResolvedValue({
              id: 1,
              workshopName: "Workshop A",
            }),
            getStockScopeByCode: jest.fn().mockResolvedValue(stockScope),
          },
        },
        {
          provide: InventoryService,
          useValue: {
            listAttributedQuantitySnapshots: jest
              .fn()
              .mockResolvedValue(new Map([[100, new Prisma.Decimal(25)]])),
            listPriceLayerAvailability: jest.fn().mockResolvedValue([
              {
                materialId: 100,
                unitCost: new Prisma.Decimal(8),
                availableQty: new Prisma.Decimal(25),
                sourceLogCount: 1,
              },
            ]),
          },
        },
      ],
    }).compile();

    service = moduleRef.get(SalesProjectService);
    repository = moduleRef.get(SalesProjectRepository);
    inventoryService = moduleRef.get(InventoryService);
  });

  it("creates a sales project master with material scope and project target", async () => {
    repository.findProjectByCode.mockResolvedValue(null);
    repository.createProject.mockResolvedValue({
      ...baseProject,
      projectTargetId: null,
    } as never);
    repository.findProjectTargetBySource.mockResolvedValue(null);
    repository.createProjectTarget.mockResolvedValue({
      id: 5001,
      targetType: "SALES_PROJECT",
      targetCode: "SP-001",
      targetName: "Sales Project A",
      sourceDocumentType: "SalesProject",
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
    repository.findEffectiveShipmentLinesByProjectId.mockResolvedValue([]);
    inventoryService.listAttributedQuantitySnapshots.mockResolvedValue(
      new Map(),
    );
    inventoryService.listPriceLayerAvailability.mockResolvedValue([]);

    const result = await service.createProject(
      {
        salesProjectCode: "SP-001",
        salesProjectName: "Sales Project A",
        bizDate: "2026-04-10",
        customerId: 10,
        managerPersonnelId: 20,
        workshopId: 1,
        materialLines: [
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
    expect(repository.createProjectTarget).toHaveBeenCalled();
    expect(result.summary.materialLineCount).toBe(1);
    expect(result.summary.materialKindCount).toBe(1);
    expect(result.summary.totalCurrentInventoryQty.toString()).toBe("0");
  });

  it("derives project inventory, price layers and shipments from attributed facts", async () => {
    repository.findProjectById.mockResolvedValue(baseProject as never);
    repository.findEffectiveShipmentLinesByProjectId.mockResolvedValue([
      {
        id: 101,
        orderId: 201,
        lineNo: 1,
        materialId: 100,
        salesProjectId: 1,
        salesProjectCodeSnapshot: "SP-001",
        salesProjectNameSnapshot: "Sales Project A",
        materialCodeSnapshot: "MAT-100",
        materialNameSnapshot: "Material 100",
        materialSpecSnapshot: "Spec",
        unitCodeSnapshot: "PCS",
        quantity: new Prisma.Decimal(40),
        unitPrice: new Prisma.Decimal(10),
        amount: new Prisma.Decimal(400),
        selectedUnitCost: new Prisma.Decimal(8),
        costUnitPrice: new Prisma.Decimal(8),
        costAmount: new Prisma.Decimal(320),
        startNumber: null,
        endNumber: null,
        sourceDocumentType: null,
        sourceDocumentId: null,
        sourceDocumentLineId: null,
        remark: null,
        createdBy: "1",
        createdAt: new Date(),
        updatedBy: "1",
        updatedAt: new Date(),
        order: {
          id: 201,
          documentNo: "CK-001",
          bizDate: new Date("2026-04-11"),
          orderType: SalesStockOrderType.OUTBOUND,
        },
      },
      {
        id: 102,
        orderId: 202,
        lineNo: 1,
        materialId: 100,
        salesProjectId: 1,
        salesProjectCodeSnapshot: "SP-001",
        salesProjectNameSnapshot: "Sales Project A",
        materialCodeSnapshot: "MAT-100",
        materialNameSnapshot: "Material 100",
        materialSpecSnapshot: "Spec",
        unitCodeSnapshot: "PCS",
        quantity: new Prisma.Decimal(10),
        unitPrice: new Prisma.Decimal(10),
        amount: new Prisma.Decimal(100),
        selectedUnitCost: new Prisma.Decimal(8),
        costUnitPrice: new Prisma.Decimal(8),
        costAmount: new Prisma.Decimal(80),
        startNumber: null,
        endNumber: null,
        sourceDocumentType: "SalesStockOrder",
        sourceDocumentId: 201,
        sourceDocumentLineId: 101,
        remark: null,
        createdBy: "1",
        createdAt: new Date(),
        updatedBy: "1",
        updatedAt: new Date(),
        order: {
          id: 202,
          documentNo: "XSTH-001",
          bizDate: new Date("2026-04-12"),
          orderType: SalesStockOrderType.SALES_RETURN,
        },
      },
    ] as never);

    const result = await service.listMaterials(1);
    const firstItem = result.items[0];

    expect(firstItem.currentInventoryQty.toString()).toBe("25");
    expect(firstItem.selectedUnitCost?.toString()).toBe("8");
    expect(firstItem.priceLayerAvailableQty.toString()).toBe("25");
    expect(firstItem.linkedDocuments).toEqual([]);
    expect(firstItem.outboundQty.toString()).toBe("40");
    expect(firstItem.returnQty.toString()).toBe("10");
    expect(firstItem.netShipmentQty.toString()).toBe("30");
    expect(firstItem.pendingSupplyQty.toString()).toBe("0");
    expect(result.summary.totalCurrentInventoryQty.toString()).toBe("25");
    expect(result.summary.totalNetShipmentQty.toString()).toBe("30");
    expect(result.summary.totalPendingSupplyQty.toString()).toBe("0");
  });

  it("generates a sales outbound draft from project price-layer inventory", async () => {
    repository.findProjectById.mockResolvedValue(baseProject as never);
    repository.findEffectiveShipmentLinesByProjectId.mockResolvedValue([
      {
        id: 101,
        orderId: 201,
        lineNo: 1,
        materialId: 100,
        salesProjectId: 1,
        salesProjectCodeSnapshot: "SP-001",
        salesProjectNameSnapshot: "Sales Project A",
        materialCodeSnapshot: "MAT-100",
        materialNameSnapshot: "Material 100",
        materialSpecSnapshot: "Spec",
        unitCodeSnapshot: "PCS",
        quantity: new Prisma.Decimal(20),
        unitPrice: new Prisma.Decimal(10),
        amount: new Prisma.Decimal(200),
        selectedUnitCost: new Prisma.Decimal(8),
        costUnitPrice: new Prisma.Decimal(8),
        costAmount: new Prisma.Decimal(160),
        startNumber: null,
        endNumber: null,
        sourceDocumentType: null,
        sourceDocumentId: null,
        sourceDocumentLineId: null,
        remark: null,
        createdBy: "1",
        createdAt: new Date(),
        updatedBy: "1",
        updatedAt: new Date(),
        order: {
          id: 201,
          documentNo: "CK-001",
          bizDate: new Date("2026-04-11"),
          orderType: SalesStockOrderType.OUTBOUND,
        },
      },
    ] as never);

    const draft = await service.createSalesOutboundDraft(1, {});

    expect(draft.salesProjectId).toBe(1);
    expect(draft.customerId).toBe(10);
    expect(draft.lines).toHaveLength(1);
    expect(draft.lines[0]).toMatchObject({
      materialId: 100,
      quantity: "25",
      selectedUnitCost: "8",
      salesProjectCode: "SP-001",
      salesProjectName: "Sales Project A",
    });
  });

  it("keeps zero-cost project price layers draftable", async () => {
    repository.findProjectById.mockResolvedValue(baseProject as never);
    repository.findEffectiveShipmentLinesByProjectId.mockResolvedValue([]);
    inventoryService.listAttributedQuantitySnapshots.mockResolvedValue(
      new Map([[100, new Prisma.Decimal(5)]]),
    );
    inventoryService.listPriceLayerAvailability.mockResolvedValue([
      {
        materialId: 100,
        unitCost: new Prisma.Decimal(0),
        availableQty: new Prisma.Decimal(5),
        sourceLogCount: 1,
      },
    ]);

    const draft = await service.createSalesOutboundDraft(1, {});

    expect(draft.lines).toHaveLength(1);
    expect(draft.lines[0]).toMatchObject({
      materialId: 100,
      quantity: "5",
      selectedUnitCost: "0",
    });
  });

  it("counts only currently available project price layers in the summary card", async () => {
    repository.findProjectById.mockResolvedValue(baseProject as never);
    repository.findEffectiveShipmentLinesByProjectId.mockResolvedValue([
      {
        id: 202,
        orderId: 302,
        lineNo: 2,
        materialId: 100,
        materialCodeSnapshot: "MAT-100",
        materialNameSnapshot: "Material 100",
        materialSpecSnapshot: "Spec",
        unitCodeSnapshot: "PCS",
        quantity: new Prisma.Decimal(5),
        unitPrice: new Prisma.Decimal(10),
        amount: new Prisma.Decimal(50),
        selectedUnitCost: new Prisma.Decimal(9),
        costUnitPrice: new Prisma.Decimal(9),
        costAmount: new Prisma.Decimal(45),
        sourceDocumentType: null,
        sourceDocumentId: null,
        sourceDocumentLineId: null,
        remark: null,
        createdBy: "1",
        createdAt: new Date(),
        updatedBy: "1",
        updatedAt: new Date(),
        order: {
          id: 302,
          documentNo: "CK-002",
          bizDate: new Date("2026-04-12"),
          orderType: SalesStockOrderType.OUTBOUND,
        },
      },
    ] as never);
    inventoryService.listAttributedQuantitySnapshots.mockResolvedValue(
      new Map([[100, new Prisma.Decimal(25)]]),
    );
    inventoryService.listPriceLayerAvailability.mockResolvedValue([
      {
        materialId: 100,
        unitCost: new Prisma.Decimal(8),
        availableQty: new Prisma.Decimal(25),
        sourceLogCount: 1,
      },
    ]);

    const result = await service.listMaterials(1);

    expect(result.items).toHaveLength(2);
    expect(result.summary.totalPriceLayerCount).toBe(1);
    expect(
      result.items
        .find((item) => item.selectedUnitCost?.toString() === "9")
        ?.priceLayerAvailableQty.toString(),
    ).toBe("0");
  });

  it("rejects duplicate project codes", async () => {
    repository.findProjectByCode.mockResolvedValue(baseProject as never);

    await expect(
      service.createProject(
        {
          salesProjectCode: "SP-001",
          salesProjectName: "Duplicate",
          bizDate: "2026-04-10",
          workshopId: 1,
        },
        "1",
      ),
    ).rejects.toThrow(ConflictException);
  });

  it("rejects voided project references unless explicitly allowed", async () => {
    repository.findProjectsByIds.mockResolvedValue([
      {
        ...baseProject,
        lifecycleStatus: DocumentLifecycleStatus.VOIDED,
      },
    ] as never);

    await expect(service.getProjectReferenceById(1)).rejects.toThrow(
      BadRequestException,
    );
    await expect(
      service.getProjectReferenceById(1, { allowVoided: true }),
    ).resolves.toMatchObject({
      id: 1,
      projectTargetId: 5001,
    });
  });
});
