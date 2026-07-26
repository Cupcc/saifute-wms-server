import { BadRequestException, NotFoundException } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import {
  AuditStatusSnapshot,
  DocumentLifecycleStatus,
  InventoryEffectStatus,
  InventoryOperationType,
  Prisma,
  StockDirection,
} from "../../../../generated/prisma/client";
import { InventoryService } from "../../inventory-core/application/inventory.service";
import { MasterDataService } from "../../master-data/application/master-data.service";
import { RdProjectLookupService } from "../../rd-project/application/rd-project-lookup.service";
import { RdHandoffRepository } from "../infrastructure/rd-handoff.repository";
import { RdProcurementRequestRepository } from "../infrastructure/rd-procurement-request.repository";
import { RdHandoffService } from "./rd-handoff.service";
import {
  applyHandoffStatusesForOrder,
  reverseHandoffStatusesForOrder,
} from "./rd-material-status.helper";

jest.mock("./rd-material-status.helper", () => ({
  RD_PROCUREMENT_REQUEST_DOCUMENT_TYPE: "RdProcurementRequest",
  applyHandoffStatusesForOrder: jest.fn().mockResolvedValue(undefined),
  reverseHandoffStatusesForOrder: jest.fn().mockResolvedValue(0),
}));

describe("RdHandoffService", () => {
  const mockRdProject = {
    id: 701,
    projectCode: "TEST-RDP-001",
    projectName: "测试研发项目",
    projectTargetId: 7001,
    workshopId: 9,
    lifecycleStatus: DocumentLifecycleStatus.EFFECTIVE,
  };
  const mockRequest = {
    id: 5,
    lifecycleStatus: DocumentLifecycleStatus.EFFECTIVE,
    projectCode: "TEST-RDP-001",
    projectName: "测试研发项目",
    workshopId: 9,
    lines: [
      {
        id: 501,
        materialId: 100,
        quantity: new Prisma.Decimal(8),
      },
    ],
  };
  const mockOrder = {
    id: 1,
    documentNo: "RDH-001",
    bizDate: new Date("2026-03-28"),
    handlerPersonnelId: 20,
    sourceStockScopeId: 1,
    targetStockScopeId: 2,
    sourceWorkshopId: 1,
    targetWorkshopId: 9,
    lifecycleStatus: DocumentLifecycleStatus.EFFECTIVE,
    auditStatusSnapshot: AuditStatusSnapshot.NOT_REQUIRED,
    inventoryEffectStatus: InventoryEffectStatus.POSTED,
    revisionNo: 1,
    handlerNameSnapshot: "Handler A",
    sourceWorkshopNameSnapshot: "主仓",
    targetWorkshopNameSnapshot: "研发小仓",
    totalQty: new Prisma.Decimal(8),
    totalAmount: new Prisma.Decimal(80),
    remark: "main to rd",
    voidReason: null,
    voidedBy: null,
    voidedAt: null,
    createdBy: "1",
    createdAt: new Date(),
    updatedBy: "1",
    updatedAt: new Date(),
    clientRequestId: null,
    lines: [
      {
        id: 1,
        orderId: 1,
        lineNo: 1,
        materialId: 100,
        materialCodeSnapshot: "MAT001",
        materialNameSnapshot: "Material A",
        materialSpecSnapshot: "Spec",
        unitCodeSnapshot: "PCS",
        rdProjectId: 701,
        rdProjectCodeSnapshot: "TEST-RDP-001",
        rdProjectNameSnapshot: "测试研发项目",
        quantity: new Prisma.Decimal(8),
        unitPrice: new Prisma.Decimal(10),
        amount: new Prisma.Decimal(80),
        costUnitPrice: null,
        costAmount: null,
        sourceDocumentType: "RdProcurementRequest",
        sourceDocumentId: 5,
        sourceDocumentLineId: 501,
        remark: null,
        createdBy: "1",
        createdAt: new Date(),
        updatedBy: "1",
        updatedAt: new Date(),
      },
    ],
  };

  let service: RdHandoffService;
  let repository: jest.Mocked<RdHandoffRepository>;
  let rdProcurementRequestRepository: jest.Mocked<RdProcurementRequestRepository>;
  let masterDataService: jest.Mocked<MasterDataService>;
  let inventoryService: jest.Mocked<InventoryService>;
  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        RdHandoffService,
        {
          provide: RdHandoffRepository,
          useValue: {
            runInTransaction: jest.fn(
              (handler: (tx: unknown) => Promise<unknown>) => handler({}),
            ),
            findOrders: jest.fn(),
            findOrderById: jest.fn(),
            findOrderByDocumentNo: jest.fn(),
            findOrderByClientRequestId: jest.fn(),
            findDocumentNosByPrefix: jest.fn().mockResolvedValue([]),
            createOrder: jest.fn(),
            updateOrder: jest.fn(),
            updateOrderLineCost: jest.fn().mockResolvedValue({}),
          },
        },
        {
          provide: RdProcurementRequestRepository,
          useValue: {
            findRequestById: jest.fn().mockResolvedValue(mockRequest),
          },
        },
        {
          provide: RdProjectLookupService,
          useValue: {
            requireEffectiveProjectByCode: jest
              .fn()
              .mockResolvedValue(mockRdProject),
            requireEffectiveProjectById: jest
              .fn()
              .mockResolvedValue(mockRdProject),
            ensureProjectTarget: jest.fn().mockResolvedValue(7001),
          },
        },
        {
          provide: MasterDataService,
          useValue: {
            getStockScopeByCode: jest
              .fn()
              .mockImplementation(async (scopeCode: string) => ({
                id: scopeCode === "RD_SUB" ? 2 : 1,
                scopeCode,
                scopeName: scopeCode === "RD_SUB" ? "研发小仓" : "主仓",
              })),
            getMaterialById: jest.fn().mockResolvedValue({
              id: 100,
              materialCode: "MAT001",
              materialName: "Material A",
              specModel: "Spec",
              unitCode: "PCS",
            }),
            getWorkshopById: jest.fn().mockResolvedValue({
              id: 1,
              workshopName: "主仓",
              defaultHandlerPersonnelId: null,
              defaultHandlerPersonnel: null,
              status: "ACTIVE",
              createdBy: null,
              createdAt: new Date("2026-03-29T00:00:00.000Z"),
              updatedBy: null,
              updatedAt: new Date("2026-03-29T00:00:00.000Z"),
            }),
            getPersonnelById: jest.fn().mockResolvedValue({
              id: 20,
              personnelName: "Handler A",
            }),
          },
        },
        {
          provide: InventoryService,
          useValue: {
            decreaseStock: jest.fn().mockResolvedValue({ id: 11 }),
            settleConsumerOut: jest.fn().mockResolvedValue({
              outLog: { id: 11 },
              settledUnitCost: new Prisma.Decimal(10),
              settledCostAmount: new Prisma.Decimal(80),
              allocations: [],
            }),
            increaseStock: jest.fn().mockResolvedValue({ id: 12 }),
            reverseStock: jest.fn().mockResolvedValue({ id: 21 }),
            releaseAllSourceUsagesForConsumer: jest
              .fn()
              .mockResolvedValue(undefined),
            hasUnreleasedAllocations: jest.fn().mockResolvedValue(false),
            getLogsForDocument: jest.fn().mockResolvedValue([
              { id: 1, direction: StockDirection.OUT },
              { id: 2, direction: StockDirection.IN },
            ]),
          },
        },
      ],
    }).compile();

    service = moduleRef.get(RdHandoffService);
    repository = moduleRef.get(RdHandoffRepository);
    rdProcurementRequestRepository = moduleRef.get(
      RdProcurementRequestRepository,
    );
    masterDataService = moduleRef.get(MasterDataService);
    inventoryService = moduleRef.get(InventoryService);
  });

  it("creates a handoff order and posts source/target inventory", async () => {
    repository.findOrderByDocumentNo.mockResolvedValue(null);
    repository.createOrder.mockResolvedValue(mockOrder);
    repository.updateOrder.mockResolvedValue(mockOrder);

    const result = await service.createOrder(
      {
        bizDate: "2026-03-28",
        handlerPersonnelId: 20,
        lines: [
          {
            materialId: 100,
            quantity: "8",
            unitPrice: "10",
            sourceDocumentId: 5,
            sourceDocumentLineId: 501,
          },
        ],
      },
      "1",
    );

    expect(result).toEqual(mockOrder);
    expect(repository.createOrder).toHaveBeenCalled();
    expect(repository.updateOrder).toHaveBeenCalledWith(
      mockOrder.id,
      expect.objectContaining({
        totalAmount: new Prisma.Decimal(80),
      }),
      expect.anything(),
    );
    expect(inventoryService.settleConsumerOut).toHaveBeenCalledWith(
      expect.objectContaining({
        stockScope: "MAIN",
        operationType: InventoryOperationType.RD_HANDOFF_OUT,
        businessDocumentType: "RdHandoffOrder",
        projectTargetId: 7001,
      }),
      expect.anything(),
    );
    expect(inventoryService.increaseStock).toHaveBeenCalledWith(
      expect.objectContaining({
        stockScope: "RD_SUB",
        operationType: InventoryOperationType.RD_HANDOFF_IN,
        businessDocumentType: "RdHandoffOrder",
        projectTargetId: 7001,
      }),
      expect.anything(),
    );
    expect(rdProcurementRequestRepository.findRequestById).toHaveBeenCalledWith(
      5,
    );
    expect(applyHandoffStatusesForOrder).toHaveBeenCalled();
    expect(masterDataService.getStockScopeByCode).toHaveBeenCalledWith("MAIN");
    expect(masterDataService.getStockScopeByCode).toHaveBeenCalledWith(
      "RD_SUB",
    );
  });

  it("returns the same order for a duplicated clientRequestId without re-posting inventory", async () => {
    repository.findOrderByClientRequestId
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(mockOrder);
    repository.createOrder.mockResolvedValue(mockOrder);
    repository.updateOrder.mockResolvedValue(mockOrder);

    const dto = {
      bizDate: "2026-03-28",
      handlerPersonnelId: 20,
      clientRequestId: "2c4a6e8f-1b3d-4f5a-9c7e-0d2f4a6b8c1e",
      lines: [
        {
          materialId: 100,
          quantity: "8",
          unitPrice: "10",
          sourceDocumentId: 5,
          sourceDocumentLineId: 501,
        },
      ],
    };

    const first = await service.createOrder(dto, "1");
    const second = await service.createOrder(dto, "1");

    expect(first).toEqual(mockOrder);
    expect(second).toEqual(mockOrder);
    expect(repository.createOrder).toHaveBeenCalledTimes(1);
    expect(repository.createOrder).toHaveBeenCalledWith(
      expect.objectContaining({ clientRequestId: dto.clientRequestId }),
      expect.anything(),
      expect.anything(),
    );
    expect(inventoryService.settleConsumerOut).toHaveBeenCalledTimes(1);
    expect(inventoryService.increaseStock).toHaveBeenCalledTimes(1);
  });

  it("persists a null source workshop and bridges MAIN to RD_SUB stock", async () => {
    repository.findOrderByDocumentNo.mockResolvedValue(null);
    repository.createOrder.mockResolvedValue(mockOrder);

    await service.createOrder({
      bizDate: "2026-03-28",
      lines: [
        {
          materialId: 100,
          quantity: "2",
          sourceDocumentId: 5,
          sourceDocumentLineId: 501,
        },
      ],
    });

    expect(repository.createOrder).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceWorkshopId: null,
        targetWorkshopId: 9,
        sourceWorkshopNameSnapshot: "主仓",
        targetWorkshopNameSnapshot: "研发小仓",
      }),
      expect.anything(),
      expect.anything(),
    );
    expect(inventoryService.settleConsumerOut).toHaveBeenCalledWith(
      expect.objectContaining({
        stockScope: "MAIN",
        projectTargetId: 7001,
      }),
      expect.anything(),
    );
    expect(inventoryService.increaseStock).toHaveBeenCalledWith(
      expect.objectContaining({
        stockScope: "RD_SUB",
        projectTargetId: 7001,
      }),
      expect.anything(),
    );
  });

  it("voids a handoff order and reverses RD-side stock first", async () => {
    (reverseHandoffStatusesForOrder as jest.Mock).mockResolvedValueOnce(1);
    repository.findOrderById
      .mockResolvedValueOnce(mockOrder)
      .mockResolvedValueOnce({
        ...mockOrder,
        lifecycleStatus: DocumentLifecycleStatus.VOIDED,
        inventoryEffectStatus: InventoryEffectStatus.REVERSED,
      });

    const result = await service.voidOrder(1, "rollback", "1");

    expect(inventoryService.reverseStock).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ logIdToReverse: 2 }),
      expect.anything(),
    );
    expect(inventoryService.reverseStock).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ logIdToReverse: 1 }),
      expect.anything(),
    );
    expect(repository.updateOrder).toHaveBeenCalledWith(
      1,
      expect.objectContaining({
        lifecycleStatus: DocumentLifecycleStatus.VOIDED,
        inventoryEffectStatus: InventoryEffectStatus.REVERSED,
        voidReason: "rollback",
      }),
      expect.anything(),
    );
    expect(reverseHandoffStatusesForOrder).toHaveBeenCalledWith(
      expect.objectContaining({
        orderId: 1,
      }),
      expect.anything(),
    );
    expect(result?.lifecycleStatus).toBe(DocumentLifecycleStatus.VOIDED);
  });

  it("lists orders with pagination", async () => {
    repository.findOrders.mockResolvedValue({ items: [mockOrder], total: 1 });

    const result = await service.listOrders({
      targetWorkshopId: 9,
      limit: 10,
      offset: 0,
    });

    expect(result.total).toBe(1);
    expect(repository.findOrders).toHaveBeenCalledWith(
      expect.objectContaining({
        targetWorkshopId: 9,
        boundStockScopeId: undefined,
        limit: 10,
        offset: 0,
      }),
    );
  });

  it("threads the lifecycleStatus filter down to the repository", async () => {
    repository.findOrders.mockResolvedValue({ items: [], total: 0 });

    await service.listOrders({
      lifecycleStatus: "VOIDED",
      limit: 10,
      offset: 0,
    });

    expect(repository.findOrders).toHaveBeenCalledWith(
      expect.objectContaining({ lifecycleStatus: "VOIDED" }),
    );
  });

  it("omits the lifecycle filter when lifecycleStatus is absent", async () => {
    repository.findOrders.mockResolvedValue({ items: [], total: 0 });

    await service.listOrders({ limit: 10, offset: 0 });

    expect(repository.findOrders).toHaveBeenCalledWith(
      expect.objectContaining({ lifecycleStatus: undefined }),
    );
  });

  it("passes the bound stock scope filter down to the repository", async () => {
    repository.findOrders.mockResolvedValue({ items: [], total: 0 });

    await service.listOrders({ limit: 10, offset: 0 }, 2);

    expect(repository.findOrders).toHaveBeenCalledWith(
      expect.objectContaining({
        boundStockScopeId: 2,
        limit: 10,
        offset: 0,
      }),
    );
  });

  it("throws when order does not exist", async () => {
    repository.findOrderById.mockResolvedValue(null);

    await expect(service.getOrderById(999)).rejects.toThrow(NotFoundException);
  });

  it("creates one RD_SUB IN log per FIFO allocation piece for multi-layer bridge", async () => {
    // Simulate two MAIN source layers in the FIFO allocation result
    (inventoryService.settleConsumerOut as jest.Mock).mockResolvedValueOnce({
      outLog: { id: 11 },
      settledUnitCost: new Prisma.Decimal(9),
      settledCostAmount: new Prisma.Decimal(72),
      allocations: [
        {
          sourceLogId: 101,
          allocatedQty: new Prisma.Decimal(4),
          unitCost: new Prisma.Decimal(8),
          costAmount: new Prisma.Decimal(32),
        },
        {
          sourceLogId: 102,
          allocatedQty: new Prisma.Decimal(4),
          unitCost: new Prisma.Decimal(10),
          costAmount: new Prisma.Decimal(40),
        },
      ],
    });
    repository.findOrderByDocumentNo.mockResolvedValue(null);
    repository.createOrder.mockResolvedValue(mockOrder);

    await service.createOrder(
      {
        bizDate: "2026-03-28",
        lines: [
          {
            materialId: 100,
            quantity: "8",
            sourceDocumentId: 5,
            sourceDocumentLineId: 501,
          },
        ],
      },
      "1",
    );

    // increaseStock should be called twice (once per allocation piece)
    const increaseStockCalls = (inventoryService.increaseStock as jest.Mock)
      .mock.calls;
    expect(increaseStockCalls.length).toBe(2);

    // First call: piece from source layer 101
    expect(increaseStockCalls[0][0]).toMatchObject(
      expect.objectContaining({
        stockScope: "RD_SUB",
        operationType: InventoryOperationType.RD_HANDOFF_IN,
        idempotencyKey: expect.stringContaining(":src:101"),
        projectTargetId: 7001,
        unitCost: expect.objectContaining({}), // Prisma.Decimal
        costAmount: expect.objectContaining({}),
      }),
    );

    // Second call: piece from source layer 102
    expect(increaseStockCalls[1][0]).toMatchObject(
      expect.objectContaining({
        stockScope: "RD_SUB",
        operationType: InventoryOperationType.RD_HANDOFF_IN,
        idempotencyKey: expect.stringContaining(":src:102"),
        projectTargetId: 7001,
      }),
    );
  });

  it("wraps settlement failures with the line number and material", async () => {
    repository.findOrderByDocumentNo.mockResolvedValue(null);
    repository.createOrder.mockResolvedValue(mockOrder);
    (inventoryService.settleConsumerOut as jest.Mock).mockRejectedValueOnce(
      new BadRequestException(
        "FIFO 可用来源库存不足: 缺少 2 个来源层数量，请先确保有足够的入库记录",
      ),
    );

    await expect(
      service.createOrder(
        {
          bizDate: "2026-03-28",
          lines: [
            {
              materialId: 100,
              quantity: "8",
              sourceDocumentId: 5,
              sourceDocumentLineId: 501,
            },
          ],
        },
        "1",
      ),
    ).rejects.toThrow("第 1 行 物料 Material A: FIFO 可用来源库存不足");
  });

  it("wraps source-line mismatches with the line number and material", async () => {
    (
      rdProcurementRequestRepository.findRequestById as jest.Mock
    ).mockResolvedValueOnce({
      ...mockRequest,
      lines: [{ ...mockRequest.lines[0], materialId: 999 }],
    });

    await expect(
      service.createOrder(
        {
          bizDate: "2026-03-28",
          lines: [
            {
              materialId: 100,
              quantity: "8",
              sourceDocumentId: 5,
              sourceDocumentLineId: 501,
            },
          ],
        },
        "1",
      ),
    ).rejects.toThrow("第 1 行 物料 Material A: 交接物料必须与采购需求行一致");
    expect(repository.createOrder).not.toHaveBeenCalled();
  });

  it("blocks void when an RD_SUB IN log has unreleased downstream allocations", async () => {
    (reverseHandoffStatusesForOrder as jest.Mock).mockResolvedValueOnce(1);
    repository.findOrderById.mockResolvedValueOnce(mockOrder);

    // Simulate the IN log (id=2) having downstream allocations
    (inventoryService.hasUnreleasedAllocations as jest.Mock).mockImplementation(
      async (logId: number) => logId === 2,
    );

    await expect(service.voidOrder(1, "rollback", "1")).rejects.toThrow(
      /已有下游消耗分配/,
    );

    // Should NOT have called reverseStock
    expect(inventoryService.reverseStock).not.toHaveBeenCalled();
  });
});
