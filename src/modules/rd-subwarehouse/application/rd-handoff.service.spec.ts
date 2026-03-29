import { ConflictException, NotFoundException } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import {
  AuditStatusSnapshot,
  DocumentLifecycleStatus,
  InventoryEffectStatus,
  InventoryOperationType,
  Prisma,
  StockDirection,
} from "../../../generated/prisma/client";
import { PrismaService } from "../../../shared/prisma/prisma.service";
import { InventoryService } from "../../inventory-core/application/inventory.service";
import { MasterDataService } from "../../master-data/application/master-data.service";
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
  const mockRequest = {
    id: 5,
    lifecycleStatus: DocumentLifecycleStatus.EFFECTIVE,
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
        quantity: new Prisma.Decimal(8),
        unitPrice: new Prisma.Decimal(10),
        amount: new Prisma.Decimal(80),
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
  let prisma: { runInTransaction: jest.Mock };

  beforeEach(async () => {
    prisma = {
      runInTransaction: jest.fn((handler: (tx: unknown) => Promise<unknown>) =>
        handler({}),
      ),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        RdHandoffService,
        {
          provide: PrismaService,
          useValue: prisma,
        },
        {
          provide: RdHandoffRepository,
          useValue: {
            findOrders: jest.fn(),
            findOrderById: jest.fn(),
            findOrderByDocumentNo: jest.fn(),
            createOrder: jest.fn(),
            updateOrder: jest.fn(),
          },
        },
        {
          provide: RdProcurementRequestRepository,
          useValue: {
            findRequestById: jest.fn().mockResolvedValue(mockRequest),
          },
        },
        {
          provide: MasterDataService,
          useValue: {
            getMaterialById: jest.fn().mockResolvedValue({
              id: 100,
              materialCode: "MAT001",
              materialName: "Material A",
              specModel: "Spec",
              unitCode: "PCS",
            }),
            getWorkshopById: jest.fn().mockResolvedValue({
              id: 1,
              workshopCode: "MAIN",
              workshopName: "主仓",
            }),
            getWorkshopByCode: jest.fn().mockResolvedValue({
              id: 9,
              workshopCode: "RD",
              workshopName: "研发小仓",
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
            increaseStock: jest.fn().mockResolvedValue({ id: 12 }),
            reverseStock: jest.fn().mockResolvedValue({ id: 21 }),
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

    const result = await service.createOrder(
      {
        documentNo: "RDH-001",
        bizDate: "2026-03-28",
        sourceWorkshopId: 1,
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
    expect(inventoryService.decreaseStock).toHaveBeenCalledWith(
      expect.objectContaining({
        workshopId: 1,
        operationType: InventoryOperationType.RD_HANDOFF_OUT,
        businessDocumentType: "RdHandoffOrder",
      }),
      expect.anything(),
    );
    expect(inventoryService.increaseStock).toHaveBeenCalledWith(
      expect.objectContaining({
        workshopId: 9,
        operationType: InventoryOperationType.RD_HANDOFF_IN,
        businessDocumentType: "RdHandoffOrder",
      }),
      expect.anything(),
    );
    expect(rdProcurementRequestRepository.findRequestById).toHaveBeenCalledWith(
      5,
    );
    expect(applyHandoffStatusesForOrder).toHaveBeenCalled();
    expect(masterDataService.getWorkshopByCode).toHaveBeenCalledWith("RD");
  });

  it("throws when documentNo already exists", async () => {
    repository.findOrderByDocumentNo.mockResolvedValue(mockOrder);

    await expect(
      service.createOrder({
        documentNo: "RDH-001",
        bizDate: "2026-03-28",
        sourceWorkshopId: 1,
        lines: [
          {
            materialId: 100,
            quantity: "8",
            sourceDocumentId: 5,
            sourceDocumentLineId: 501,
          },
        ],
      }),
    ).rejects.toThrow(ConflictException);
  });

  it("rejects non-main workshops as the handoff source", async () => {
    repository.findOrderByDocumentNo.mockResolvedValue(null);
    masterDataService.getWorkshopById.mockResolvedValueOnce({
      id: 2,
      workshopCode: "WIP",
      workshopName: "装配车间",
    } as Awaited<ReturnType<MasterDataService["getWorkshopById"]>>);

    await expect(
      service.createOrder({
        documentNo: "RDH-002",
        bizDate: "2026-03-28",
        sourceWorkshopId: 2,
        lines: [
          {
            materialId: 100,
            quantity: "2",
            sourceDocumentId: 5,
            sourceDocumentLineId: 501,
          },
        ],
      }),
    ).rejects.toThrow("当前切片只允许主仓发起到 RD 小仓的交接");
    expect(repository.createOrder).not.toHaveBeenCalled();
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
        limit: 10,
        offset: 0,
      }),
    );
  });

  it("throws when order does not exist", async () => {
    repository.findOrderById.mockResolvedValue(null);

    await expect(service.getOrderById(999)).rejects.toThrow(NotFoundException);
  });
});
