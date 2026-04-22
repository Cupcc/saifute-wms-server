import { BadRequestException, ConflictException } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import {
  AuditStatusSnapshot,
  DocumentLifecycleStatus,
  InventoryEffectStatus,
  Prisma,
  SalesStockOrderType,
} from "../../../../generated/prisma/client";
import { PrismaService } from "../../../shared/prisma/prisma.service";
import { InventoryService } from "../../inventory-core/application/inventory.service";
import { MasterDataService } from "../../master-data/application/master-data.service";
import { SalesProjectRepository } from "../infrastructure/sales-project.repository";
import { SalesProjectLifecycleService } from "./sales-project-lifecycle.service";
import { SalesProjectMaterialViewService } from "./sales-project-material-view.service";
import { SalesProjectOutboundDraftService } from "./sales-project-outbound-draft.service";
import { SalesProjectReferenceService } from "./sales-project-reference.service";
import { SalesProjectService } from "./sales-project.service";

describe("SalesProjectService", () => {
  let service: SalesProjectService;
  let repository: jest.Mocked<SalesProjectRepository>;
  let masterDataService: jest.Mocked<MasterDataService>;
  let inventoryService: jest.Mocked<InventoryService>;
  let prisma: { runInTransaction: jest.Mock };

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
    prisma = {
      runInTransaction: jest.fn((handler: (tx: unknown) => Promise<unknown>) =>
        handler({}),
      ),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        SalesProjectService,
        SalesProjectLifecycleService,
        SalesProjectMaterialViewService,
        SalesProjectOutboundDraftService,
        SalesProjectReferenceService,
        {
          provide: PrismaService,
          useValue: prisma,
        },
        {
          provide: SalesProjectRepository,
          useValue: {
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
            getBalanceSnapshot: jest.fn().mockResolvedValue({
              quantityOnHand: new Prisma.Decimal(25),
            }),
          },
        },
      ],
    }).compile();

    service = moduleRef.get(SalesProjectService);
    repository = moduleRef.get(SalesProjectRepository);
    masterDataService = moduleRef.get(MasterDataService);
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
    expect(result.summary.totalTargetQty.toString()).toBe("100");
    expect(result.summary.totalPendingSupplyQty.toString()).toBe("100");
  });

  it("derives inventory, shipment and pending supply from material scope and sales facts", async () => {
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
    expect(firstItem.outboundQty.toString()).toBe("40");
    expect(firstItem.returnQty.toString()).toBe("10");
    expect(firstItem.netShipmentQty.toString()).toBe("30");
    expect(firstItem.pendingSupplyQty.toString()).toBe("70");
    expect(result.summary.totalNetShipmentQty.toString()).toBe("30");
    expect(result.summary.totalPendingSupplyQty.toString()).toBe("70");
  });

  it("generates a sales outbound draft from pending project supply", async () => {
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
      quantity: "80",
      salesProjectCode: "SP-001",
      salesProjectName: "Sales Project A",
    });
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
