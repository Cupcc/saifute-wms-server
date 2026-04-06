import { ConflictException, NotFoundException } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import {
  AuditStatusSnapshot,
  DocumentLifecycleStatus,
  InventoryEffectStatus,
  Prisma,
} from "../../../generated/prisma/client";
import { PrismaService } from "../../../shared/prisma/prisma.service";
import { InventoryService } from "../../inventory-core/application/inventory.service";
import { MasterDataService } from "../../master-data/application/master-data.service";
import { ProjectRepository } from "../infrastructure/project.repository";
import { ProjectService } from "./project.service";

describe("ProjectService", () => {
  const mockProject = {
    id: 1,
    projectCode: "PRJ-001",
    projectName: "Project A",
    bizDate: new Date("2025-03-14"),
    customerId: 10,
    supplierId: 20,
    managerPersonnelId: 30,
    workshopId: 1,
    allocationTargetId: null,
    lifecycleStatus: DocumentLifecycleStatus.EFFECTIVE,
    auditStatusSnapshot: AuditStatusSnapshot.NOT_REQUIRED,
    inventoryEffectStatus: InventoryEffectStatus.POSTED,
    revisionNo: 1,
    customerCodeSnapshot: "CUST001",
    customerNameSnapshot: "Customer A",
    supplierCodeSnapshot: "SUP001",
    supplierNameSnapshot: "Supplier A",
    managerNameSnapshot: "Manager A",
    workshopNameSnapshot: "Workshop A",
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
    materialLines: [
      {
        id: 1,
        projectId: 1,
        lineNo: 1,
        materialId: 100,
        materialCodeSnapshot: "MAT001",
        materialNameSnapshot: "Material A",
        materialSpecSnapshot: "Spec",
        unitCodeSnapshot: "PCS",
        quantity: new Prisma.Decimal(100),
        unitPrice: new Prisma.Decimal(10),
        amount: new Prisma.Decimal(1000),
        costUnitPrice: null,
        costAmount: null,
        remark: null,
        createdBy: "1",
        createdAt: new Date(),
        updatedBy: "1",
        updatedAt: new Date(),
      },
    ],
  };

  const mockMaterial = {
    id: 100,
    materialCode: "MAT001",
    materialName: "Material A",
    specModel: "Spec",
    unitCode: "PCS",
  };

  const mockWorkshop = { id: 1, workshopName: "Workshop A" };
  const mockCustomer = {
    id: 10,
    customerCode: "CUST001",
    customerName: "Customer A",
  };
  const mockSupplier = {
    id: 20,
    supplierCode: "SUP001",
    supplierName: "Supplier A",
  };
  const mockPersonnel = { id: 30, personnelName: "Manager A" };

  let service: ProjectService;
  let repository: jest.Mocked<ProjectRepository>;
  let masterDataService: jest.Mocked<MasterDataService>;
  let inventoryService: jest.Mocked<InventoryService>;
  let prisma: { runInTransaction: jest.Mock };

  beforeEach(async () => {
    prisma = {
      runInTransaction: jest.fn((handler: (tx: unknown) => Promise<unknown>) =>
        handler({}),
      ),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        ProjectService,
        {
          provide: PrismaService,
          useValue: prisma,
        },
        {
          provide: ProjectRepository,
          useValue: {
            findProjectByCode: jest.fn(),
            findProjectById: jest.fn(),
            findProjects: jest.fn(),
            createProject: jest.fn(),
            updateProject: jest.fn(),
            createProjectLine: jest.fn(),
            updateProjectLine: jest.fn(),
            deleteProjectLine: jest.fn(),
            findAllocationTargetBySource: jest.fn().mockResolvedValue(null),
            createAllocationTarget: jest.fn().mockResolvedValue({
              id: 5001,
              targetType: "RD_PROJECT",
              targetCode: "PRJ-001",
              targetName: "Project A",
            }),
            updateAllocationTarget: jest.fn(),
            attachAllocationTargetToProject: jest.fn().mockResolvedValue({}),
            hasActiveDownstreamDependencies: jest.fn().mockResolvedValue(false),
          },
        },
        {
          provide: MasterDataService,
          useValue: {
            getMaterialById: jest.fn(),
            getWorkshopById: jest.fn(),
            getStockScopeByCode: jest.fn().mockResolvedValue({
              id: 1,
              scopeCode: "MAIN",
              scopeName: "主仓",
            }),
            getCustomerById: jest.fn(),
            getSupplierById: jest.fn(),
            getPersonnelById: jest.fn(),
          },
        },
        {
          provide: InventoryService,
          useValue: {
            decreaseStock: jest.fn().mockResolvedValue({ id: 1 }),
            settleConsumerOut: jest.fn().mockResolvedValue({
              outLog: { id: 1 },
              settledUnitCost: new Prisma.Decimal(10),
              settledCostAmount: new Prisma.Decimal(1000),
              allocations: [],
            }),
            reverseStock: jest.fn().mockResolvedValue({ id: 2 }),
            getLogsForDocument: jest.fn().mockResolvedValue([{ id: 1 }]),
            releaseAllSourceUsagesForConsumer: jest
              .fn()
              .mockResolvedValue(undefined),
            releaseSourceUsagesForConsumerLine: jest
              .fn()
              .mockResolvedValue(undefined),
          },
        },
      ],
    }).compile();

    service = moduleRef.get(ProjectService);
    repository = moduleRef.get(ProjectRepository);
    masterDataService = moduleRef.get(MasterDataService);
    inventoryService = moduleRef.get(InventoryService);

    (masterDataService.getMaterialById as jest.Mock).mockResolvedValue(
      mockMaterial,
    );
    (masterDataService.getWorkshopById as jest.Mock).mockResolvedValue(
      mockWorkshop,
    );
    (masterDataService.getCustomerById as jest.Mock).mockResolvedValue(
      mockCustomer,
    );
    (masterDataService.getSupplierById as jest.Mock).mockResolvedValue(
      mockSupplier,
    );
    (masterDataService.getPersonnelById as jest.Mock).mockResolvedValue(
      mockPersonnel,
    );
  });

  describe("createProject", () => {
    it("should create project with inventory decrease (consumption)", async () => {
      (repository.findProjectByCode as jest.Mock).mockResolvedValue(null);
      (repository.createProject as jest.Mock).mockResolvedValue(mockProject);
      (repository.findProjectById as jest.Mock).mockResolvedValue({
        ...mockProject,
        allocationTargetId: 5001,
      });

      const dto = {
        projectCode: "PRJ-001",
        projectName: "Project A",
        bizDate: "2025-03-14",
        customerId: 10,
        supplierId: 20,
        managerPersonnelId: 30,
        workshopId: 1,
        lines: [{ materialId: 100, quantity: "100", unitPrice: "10" }],
      };

      const result = await service.createProject(dto, "1");

      expect(result).toEqual({
        ...mockProject,
        allocationTargetId: 5001,
      });
      expect(repository.findProjectByCode).toHaveBeenCalledWith("PRJ-001");
      expect(repository.createProject).toHaveBeenCalled();
      expect(inventoryService.settleConsumerOut).toHaveBeenCalledWith(
        expect.objectContaining({
          allocationTargetId: 5001,
          materialId: 100,
          stockScope: "MAIN",
          operationType: "PROJECT_CONSUMPTION_OUT",
          businessDocumentType: "Project",
          businessDocumentId: 1,
          businessDocumentNumber: "PRJ-001",
        }),
        expect.anything(),
      );
    });

    it("should throw ConflictException when projectCode exists", async () => {
      (repository.findProjectByCode as jest.Mock).mockResolvedValue(
        mockProject,
      );

      const dto = {
        projectCode: "PRJ-001",
        projectName: "Project A",
        bizDate: "2025-03-14",
        workshopId: 1,
        lines: [{ materialId: 100, quantity: "100" }],
      };

      await expect(service.createProject(dto, "1")).rejects.toThrow(
        ConflictException,
      );
      expect(repository.createProject).not.toHaveBeenCalled();
    });
  });

  describe("updateProject", () => {
    it("should release source usages for removed line before reversal", async () => {
      // Project has one line; update with empty lines → line deleted
      (repository.findProjectById as jest.Mock)
        .mockResolvedValueOnce(mockProject)
        .mockResolvedValueOnce(mockProject)
        .mockResolvedValueOnce({ ...mockProject, materialLines: [] });
      (inventoryService.getLogsForDocument as jest.Mock).mockResolvedValue([
        { id: 1, businessDocumentLineId: 1 },
      ]);
      (repository.updateProject as jest.Mock).mockResolvedValue({
        ...mockProject,
        materialLines: [],
      });

      await service.updateProject(1, { bizDate: "2025-03-15", lines: [] }, "1");

      // Release must be called before reverseStock
      const releaseCalls = (
        inventoryService.releaseSourceUsagesForConsumerLine as jest.Mock
      ).mock.invocationCallOrder;
      const reverseCalls = (inventoryService.reverseStock as jest.Mock).mock
        .invocationCallOrder;
      expect(releaseCalls.length).toBeGreaterThan(0);
      expect(reverseCalls.length).toBeGreaterThan(0);
      expect(releaseCalls[0]).toBeLessThan(reverseCalls[0]);

      expect(
        inventoryService.releaseSourceUsagesForConsumerLine,
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          consumerDocumentType: "Project",
          consumerDocumentId: 1,
          consumerLineId: 1,
        }),
        expect.anything(),
      );
    });

    it("should update project with line-aware inventory recalculation", async () => {
      (repository.findProjectById as jest.Mock)
        .mockResolvedValueOnce(mockProject)
        .mockResolvedValueOnce(mockProject)
        .mockResolvedValueOnce({ ...mockProject, materialLines: [] });
      (inventoryService.getLogsForDocument as jest.Mock).mockResolvedValue([
        { id: 1, businessDocumentLineId: 1 },
      ]);

      const dto = {
        bizDate: "2025-03-15",
        lines: [{ id: 1, materialId: 100, quantity: "150", unitPrice: "10" }],
      };

      const updatedProject = {
        ...mockProject,
        totalQty: new Prisma.Decimal(150),
      };
      (repository.updateProject as jest.Mock).mockResolvedValue(updatedProject);
      (repository.updateProjectLine as jest.Mock).mockResolvedValue({
        ...mockProject.materialLines[0],
        id: 1,
        lineNo: 1,
        quantity: new Prisma.Decimal(150),
        amount: new Prisma.Decimal(1500),
      });

      await service.updateProject(1, dto, "1");

      expect(inventoryService.reverseStock).toHaveBeenCalled();
      expect(inventoryService.settleConsumerOut).toHaveBeenCalled();
    });
  });

  describe("voidProject", () => {
    it("should void project and reverse inventory", async () => {
      (repository.findProjectById as jest.Mock).mockResolvedValue(mockProject);
      (
        repository.hasActiveDownstreamDependencies as jest.Mock
      ).mockResolvedValue(false);
      (inventoryService.getLogsForDocument as jest.Mock).mockResolvedValue([
        { id: 1 },
      ]);
      (repository.updateProject as jest.Mock).mockResolvedValue({
        ...mockProject,
        lifecycleStatus: DocumentLifecycleStatus.VOIDED,
      });
      (repository.findProjectById as jest.Mock)
        .mockResolvedValueOnce(mockProject)
        .mockResolvedValueOnce({
          ...mockProject,
          lifecycleStatus: DocumentLifecycleStatus.VOIDED,
          inventoryEffectStatus: InventoryEffectStatus.REVERSED,
        });

      const result = await service.voidProject(1, "Test void", "1");

      expect(inventoryService.reverseStock).toHaveBeenCalledWith(
        expect.objectContaining({
          logIdToReverse: 1,
          idempotencyKey: expect.stringContaining("void"),
        }),
        expect.anything(),
      );
      expect(repository.updateProject).toHaveBeenCalledWith(
        1,
        expect.objectContaining({
          lifecycleStatus: DocumentLifecycleStatus.VOIDED,
          inventoryEffectStatus: InventoryEffectStatus.REVERSED,
          voidReason: "Test void",
        }),
        expect.anything(),
      );
      expect(result).not.toBeNull();
      if (result) {
        expect(result.lifecycleStatus).toBe(DocumentLifecycleStatus.VOIDED);
      }
    });

    it("should throw when project not found", async () => {
      (repository.findProjectById as jest.Mock).mockResolvedValue(null);

      await expect(service.voidProject(999, undefined, "1")).rejects.toThrow(
        NotFoundException,
      );
    });

    it("should block void when downstream dependencies exist", async () => {
      (repository.findProjectById as jest.Mock).mockResolvedValue(mockProject);
      (
        repository.hasActiveDownstreamDependencies as jest.Mock
      ).mockResolvedValue(true);

      await expect(service.voidProject(1, "blocked", "1")).rejects.toThrow(
        "存在下游依赖，不能作废",
      );
      expect(inventoryService.reverseStock).not.toHaveBeenCalled();
    });
  });

  describe("listProjects", () => {
    it("should return paginated projects", async () => {
      (repository.findProjects as jest.Mock).mockResolvedValue({
        items: [mockProject],
        total: 1,
      });

      const result = await service.listProjects({ limit: 10, offset: 0 });

      expect(result.items).toHaveLength(1);
      expect(result.total).toBe(1);
      expect(repository.findProjects).toHaveBeenCalledWith(
        expect.objectContaining({ limit: 10, offset: 0 }),
      );
    });
  });

  describe("getProjectById", () => {
    it("should return project when found", async () => {
      (repository.findProjectById as jest.Mock).mockResolvedValue(mockProject);

      const result = await service.getProjectById(1);

      expect(result).toEqual(mockProject);
    });

    it("should throw NotFoundException when not found", async () => {
      (repository.findProjectById as jest.Mock).mockResolvedValue(null);

      await expect(service.getProjectById(999)).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
