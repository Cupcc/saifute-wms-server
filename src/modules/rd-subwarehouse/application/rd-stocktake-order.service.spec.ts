import { BadRequestException } from "@nestjs/common";
import {
  AuditStatusSnapshot,
  DocumentLifecycleStatus,
  InventoryEffectStatus,
  InventoryOperationType,
  Prisma,
} from "../../../../generated/prisma/client";
import { InventoryService } from "../../inventory-core/application/inventory.service";
import { MasterDataService } from "../../master-data/application/master-data.service";
import { RdProjectRepository } from "../../rd-project/infrastructure/rd-project.repository";
import { RdStocktakeOrderRepository } from "../infrastructure/rd-stocktake-order.repository";
import { RdStocktakeOrderService } from "./rd-stocktake-order.service";
import {
  mockRdProject,
  setupRdStocktakeOrderTestModule,
} from "./rd-stocktake-order.spec-helpers";

describe("RdStocktakeOrderService", () => {
  let service: RdStocktakeOrderService;
  let repository: jest.Mocked<RdStocktakeOrderRepository>;
  let masterDataService: jest.Mocked<MasterDataService>;
  let rdProjectRepository: jest.Mocked<RdProjectRepository>;
  let inventoryService: jest.Mocked<InventoryService>;

  beforeEach(async () => {
    const ctx = await setupRdStocktakeOrderTestModule();
    service = ctx.service;
    repository = ctx.repository;
    masterDataService = ctx.masterDataService;
    rdProjectRepository = ctx.rdProjectRepository;
    inventoryService = ctx.inventoryService;
  });

  it("creates a stocktake order and posts both in/out adjustments", async () => {
    masterDataService.getMaterialById
      .mockResolvedValueOnce({
        id: 100,
        materialCode: "MAT001",
        materialName: "Material A",
        specModel: "Spec-A",
        unitCode: "PCS",
      } as Awaited<ReturnType<MasterDataService["getMaterialById"]>>)
      .mockResolvedValueOnce({
        id: 101,
        materialCode: "MAT002",
        materialName: "Material B",
        specModel: "Spec-B",
        unitCode: "PCS",
      } as Awaited<ReturnType<MasterDataService["getMaterialById"]>>);

    inventoryService.getAttributedQuantitySnapshot
      .mockResolvedValueOnce(new Prisma.Decimal(5) as never)
      .mockResolvedValueOnce(new Prisma.Decimal(10) as never);
    inventoryService.increaseStock.mockResolvedValue({ id: 9001 } as never);
    inventoryService.decreaseStock.mockResolvedValue({ id: 9002 } as never);

    const createdOrder = {
      id: 1,
      documentNo: "RDSTK-001",
      bizDate: new Date("2026-03-30"),
      stockScopeId: 2,
      workshopId: 6,
      workshopNameSnapshot: "研发小仓",
      lifecycleStatus: DocumentLifecycleStatus.EFFECTIVE,
      inventoryEffectStatus: InventoryEffectStatus.POSTED,
      auditStatusSnapshot: AuditStatusSnapshot.NOT_REQUIRED,
      totalBookQty: new Prisma.Decimal(15),
      totalCountQty: new Prisma.Decimal(14),
      totalAdjustmentQty: new Prisma.Decimal(-1),
      countedBy: "张三",
      approvedBy: "李四",
      remark: "月末盘点",
      voidReason: null,
      voidedBy: null,
      voidedAt: null,
      createdBy: "5",
      createdAt: new Date(),
      updatedBy: "5",
      updatedAt: new Date(),
      lines: [
        {
          id: 11,
          orderId: 1,
          lineNo: 1,
          materialId: 100,
          rdProjectId: 701,
          rdProjectCodeSnapshot: "TEST-RDP-001",
          rdProjectNameSnapshot: "测试研发项目",
          materialCodeSnapshot: "MAT001",
          materialNameSnapshot: "Material A",
          materialSpecSnapshot: "Spec-A",
          unitCodeSnapshot: "PCS",
          bookQty: new Prisma.Decimal(5),
          countedQty: new Prisma.Decimal(7),
          adjustmentQty: new Prisma.Decimal(2),
          inventoryLogId: null,
          reason: "补录",
          remark: null,
          createdBy: "5",
          createdAt: new Date(),
          updatedBy: "5",
          updatedAt: new Date(),
        },
        {
          id: 12,
          orderId: 1,
          lineNo: 2,
          materialId: 101,
          rdProjectId: 701,
          rdProjectCodeSnapshot: "TEST-RDP-001",
          rdProjectNameSnapshot: "测试研发项目",
          materialCodeSnapshot: "MAT002",
          materialNameSnapshot: "Material B",
          materialSpecSnapshot: "Spec-B",
          unitCodeSnapshot: "PCS",
          bookQty: new Prisma.Decimal(10),
          countedQty: new Prisma.Decimal(7),
          adjustmentQty: new Prisma.Decimal(-3),
          inventoryLogId: null,
          reason: "报废后未及时过账",
          remark: null,
          createdBy: "5",
          createdAt: new Date(),
          updatedBy: "5",
          updatedAt: new Date(),
        },
      ],
    };
    const finalOrder = {
      ...createdOrder,
      lines: [
        {
          ...createdOrder.lines[0],
          inventoryLogId: 9001,
        },
        {
          ...createdOrder.lines[1],
          inventoryLogId: 9002,
        },
      ],
    };

    repository.createOrder.mockResolvedValue(createdOrder as never);
    repository.findOrderById.mockResolvedValue(finalOrder as never);

    const result = await service.createOrder(
      {
        documentNo: "RDSTK-001",
        bizDate: "2026-03-30",
        workshopId: 6,
        countedBy: "张三",
        approvedBy: "李四",
        remark: "月末盘点",
        lines: [
          {
            rdProjectId: 701,
            materialId: 100,
            countedQty: "7",
            reason: "补录",
          },
          {
            rdProjectId: 701,
            materialId: 101,
            countedQty: "7",
            reason: "报废后未及时过账",
          },
        ],
      },
      "5",
    );

    expect(result).toEqual(finalOrder);
    const [header, lines] = repository.createOrder.mock.calls[0];
    expect(header.documentNo).toMatch(/^RDST-\d{14}-\d{3}$/);
    expect(header.totalBookQty?.toString()).toBe("15");
    expect(header.totalCountQty?.toString()).toBe("14");
    expect(header.totalAdjustmentQty?.toString()).toBe("-1");
    expect(lines[0]?.adjustmentQty.toString()).toBe("2");
    expect(lines[1]?.adjustmentQty.toString()).toBe("-3");

    expect(inventoryService.increaseStock).toHaveBeenCalledWith(
      expect.objectContaining({
        operationType: InventoryOperationType.RD_STOCKTAKE_IN,
        businessDocumentId: 1,
        businessDocumentLineId: 11,
        projectTargetId: 7001,
        idempotencyKey: "RdStocktakeOrder:1:in:11",
      }),
      expect.anything(),
    );
    expect(inventoryService.decreaseStock).toHaveBeenCalledWith(
      expect.objectContaining({
        operationType: InventoryOperationType.RD_STOCKTAKE_OUT,
        businessDocumentId: 1,
        businessDocumentLineId: 12,
        projectTargetId: 7001,
        idempotencyKey: "RdStocktakeOrder:1:out:12",
      }),
      expect.anything(),
    );
    expect(repository.updateOrderLine).toHaveBeenNthCalledWith(
      1,
      11,
      expect.objectContaining({ inventoryLogId: 9001, updatedBy: "5" }),
      expect.anything(),
    );
    expect(repository.updateOrderLine).toHaveBeenNthCalledWith(
      2,
      12,
      expect.objectContaining({ inventoryLogId: 9002, updatedBy: "5" }),
      expect.anything(),
    );
  });

  it("lists project options within the requested workshop scope", async () => {
    const result = await service.listProjectOptions(6);

    expect(rdProjectRepository.findProjects).toHaveBeenCalledWith({
      workshopId: 6,
      stockScope: "RD_SUB",
      limit: 200,
      offset: 0,
    });
    expect(result).toEqual({
      items: [
        {
          id: 701,
          projectCode: "TEST-RDP-001",
          projectName: "测试研发项目",
          workshopId: 6,
          workshopNameSnapshot: undefined,
        },
      ],
      total: 1,
    });
  });

  it("reads project material book qty from attributed inventory", async () => {
    inventoryService.getAttributedQuantitySnapshot.mockResolvedValueOnce(
      new Prisma.Decimal(5) as never,
    );
    masterDataService.getMaterialById.mockResolvedValueOnce({
      id: 100,
      materialCode: "MAT001",
      materialName: "Material A",
      specModel: "Spec-A",
      unitCode: "PCS",
    } as Awaited<ReturnType<MasterDataService["getMaterialById"]>>);

    const result = await service.getProjectMaterialBookQty({
      workshopId: 6,
      rdProjectId: 701,
      materialId: 100,
    });

    expect(inventoryService.getAttributedQuantitySnapshot).toHaveBeenCalledWith({
      materialId: 100,
      stockScope: "RD_SUB",
      projectTargetId: 7001,
    });
    expect(result).toEqual({
      workshopId: 6,
      rdProjectId: 701,
      rdProjectCode: "TEST-RDP-001",
      rdProjectName: "测试研发项目",
      materialId: 100,
      bookQty: "5",
    });
  });

  it("keeps RD_SUB as the stock scope when workshop and project ownership match", async () => {
    masterDataService.getWorkshopById.mockResolvedValueOnce({
      id: 1,
      workshopName: "主仓",
      defaultHandlerPersonnelId: null,
      defaultHandlerPersonnel: null,
      status: "ACTIVE",
      createdBy: null,
      createdAt: new Date("2026-03-29T00:00:00.000Z"),
      updatedBy: null,
      updatedAt: new Date("2026-03-29T00:00:00.000Z"),
    } as Awaited<ReturnType<MasterDataService["getWorkshopById"]>>);
    rdProjectRepository.findProjectById.mockResolvedValueOnce({
      ...mockRdProject,
      workshopId: 1,
    } as never);

    masterDataService.getMaterialById.mockResolvedValueOnce({
      id: 100,
      materialCode: "MAT001",
      materialName: "Material A",
      specModel: "Spec-A",
      unitCode: "PCS",
    } as Awaited<ReturnType<MasterDataService["getMaterialById"]>>);
    inventoryService.getAttributedQuantitySnapshot.mockResolvedValueOnce(
      new Prisma.Decimal(0) as never,
    );
    inventoryService.increaseStock.mockResolvedValueOnce({ id: 9003 } as never);

    repository.createOrder.mockResolvedValue({
      id: 2,
      documentNo: "RDSTK-002",
      lines: [
        {
          id: 21,
          materialId: 100,
          rdProjectId: 701,
          rdProjectCodeSnapshot: "TEST-RDP-001",
          rdProjectNameSnapshot: "测试研发项目",
          adjustmentQty: new Prisma.Decimal(1),
          bookQty: new Prisma.Decimal(0),
          countedQty: new Prisma.Decimal(1),
        },
      ],
    } as never);
    repository.findOrderById.mockResolvedValue({
      id: 2,
      documentNo: "RDSTK-002",
      stockScopeId: 2,
      workshopId: 1,
      lines: [],
    } as never);

    await service.createOrder({
      documentNo: "RDSTK-002",
      bizDate: "2026-03-30",
      workshopId: 1,
      lines: [
        {
          rdProjectId: 701,
          materialId: 100,
          countedQty: "1",
          reason: "误建单",
        },
      ],
    });

    expect(repository.createOrder).toHaveBeenCalledWith(
      expect.objectContaining({
        stockScopeId: 2,
        workshopId: 1,
      }),
      expect.anything(),
      expect.anything(),
    );
    expect(inventoryService.getAttributedQuantitySnapshot).toHaveBeenCalledWith(
      expect.objectContaining({
        materialId: 100,
        stockScope: "RD_SUB",
        projectTargetId: 7001,
      }),
      expect.anything(),
    );
  });

  it("voids a posted stocktake order by reversing inventory logs", async () => {
    const existingOrder = {
      id: 1,
      documentNo: "RDSTK-001",
      lifecycleStatus: DocumentLifecycleStatus.EFFECTIVE,
      inventoryEffectStatus: InventoryEffectStatus.POSTED,
      lines: [
        {
          id: 11,
          inventoryLogId: 9001,
        },
        {
          id: 12,
          inventoryLogId: null,
        },
      ],
    };
    const voidedOrder = {
      ...existingOrder,
      lifecycleStatus: DocumentLifecycleStatus.VOIDED,
      inventoryEffectStatus: InventoryEffectStatus.REVERSED,
      voidReason: "盘点作废",
    };

    repository.findOrderById
      .mockResolvedValueOnce(existingOrder as never)
      .mockResolvedValueOnce(voidedOrder as never);

    const result = await service.voidOrder(1, "盘点作废", "5");

    expect(result).toEqual(voidedOrder);
    expect(inventoryService.reverseStock).toHaveBeenCalledWith(
      {
        logIdToReverse: 9001,
        idempotencyKey: "RdStocktakeOrder:void:1:line:11",
        note: "作废 RD 盘点调整单: RDSTK-001",
      },
      expect.anything(),
    );
    expect(repository.updateOrder).toHaveBeenCalledWith(
      1,
      expect.objectContaining({
        lifecycleStatus: DocumentLifecycleStatus.VOIDED,
        inventoryEffectStatus: InventoryEffectStatus.REVERSED,
        voidReason: "盘点作废",
        voidedBy: "5",
      }),
      expect.anything(),
    );
  });

  it("rejects duplicate materials in a single stocktake order", async () => {
    await expect(
      service.createOrder({
        documentNo: "RDSTK-003",
        bizDate: "2026-03-30",
        workshopId: 6,
        lines: [
          {
            rdProjectId: 701,
            materialId: 100,
            countedQty: "8",
            reason: "首次盘点",
          },
          {
            rdProjectId: 701,
            materialId: 100,
            countedQty: "7",
            reason: "重复物料",
          },
        ],
      }),
    ).rejects.toThrow(BadRequestException);

    expect(masterDataService.getWorkshopById).not.toHaveBeenCalled();
    expect(inventoryService.getAttributedQuantitySnapshot).not.toHaveBeenCalled();
  });
});
