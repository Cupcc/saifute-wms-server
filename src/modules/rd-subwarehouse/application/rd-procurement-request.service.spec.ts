import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from "@nestjs/common";
import { Test } from "@nestjs/testing";
import {
  AuditStatusSnapshot,
  DocumentLifecycleStatus,
  Prisma,
} from "../../../generated/prisma/client";
import { PrismaService } from "../../../shared/prisma/prisma.service";
import { MasterDataService } from "../../master-data/application/master-data.service";
import { RdProcurementRequestRepository } from "../infrastructure/rd-procurement-request.repository";
import { RdProcurementRequestService } from "./rd-procurement-request.service";

describe("RdProcurementRequestService", () => {
  const mockRequest = {
    id: 1,
    documentNo: "RDPUR-001",
    bizDate: new Date("2026-03-29"),
    projectCode: "RD-PJT-001",
    projectName: "研发治具归集",
    supplierId: 10,
    handlerPersonnelId: 20,
    workshopId: 9,
    lifecycleStatus: DocumentLifecycleStatus.EFFECTIVE,
    auditStatusSnapshot: AuditStatusSnapshot.NOT_REQUIRED,
    revisionNo: 1,
    supplierCodeSnapshot: "SUP001",
    supplierNameSnapshot: "Supplier A",
    handlerNameSnapshot: "Handler A",
    workshopNameSnapshot: "研发小仓",
    totalQty: new Prisma.Decimal(5),
    totalAmount: new Prisma.Decimal(50),
    remark: "rd procurement",
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
        requestId: 1,
        lineNo: 1,
        materialId: 100,
        materialCodeSnapshot: "MAT001",
        materialNameSnapshot: "Material A",
        materialSpecSnapshot: "Spec",
        unitCodeSnapshot: "PCS",
        quantity: new Prisma.Decimal(5),
        unitPrice: new Prisma.Decimal(10),
        amount: new Prisma.Decimal(50),
        remark: null,
        createdBy: "5",
        createdAt: new Date(),
        updatedBy: "5",
        updatedAt: new Date(),
      },
    ],
    acceptanceOrders: [],
  };

  let service: RdProcurementRequestService;
  let repository: jest.Mocked<RdProcurementRequestRepository>;
  let masterDataService: jest.Mocked<MasterDataService>;
  let prisma: { runInTransaction: jest.Mock };

  beforeEach(async () => {
    prisma = {
      runInTransaction: jest.fn((handler: (tx: unknown) => Promise<unknown>) =>
        handler({}),
      ),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        RdProcurementRequestService,
        {
          provide: PrismaService,
          useValue: prisma,
        },
        {
          provide: RdProcurementRequestRepository,
          useValue: {
            findRequests: jest.fn(),
            findRequestById: jest.fn(),
            findRequestByDocumentNo: jest.fn(),
            createRequest: jest.fn(),
            updateRequest: jest.fn(),
            hasActiveAcceptanceOrders: jest.fn(),
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
              id: 9,
              workshopCode: "RD",
              workshopName: "研发小仓",
            }),
            getSupplierById: jest.fn().mockResolvedValue({
              id: 10,
              supplierCode: "SUP001",
              supplierName: "Supplier A",
            }),
            getPersonnelById: jest.fn().mockResolvedValue({
              id: 20,
              personnelName: "Handler A",
            }),
          },
        },
      ],
    }).compile();

    service = moduleRef.get(RdProcurementRequestService);
    repository = moduleRef.get(RdProcurementRequestRepository);
    masterDataService = moduleRef.get(MasterDataService);
  });

  it("creates a procurement request with RD workshop ownership", async () => {
    repository.findRequestByDocumentNo.mockResolvedValue(null);
    repository.createRequest.mockResolvedValue(mockRequest);

    const result = await service.createRequest(
      {
        documentNo: "RDPUR-001",
        bizDate: "2026-03-29",
        projectCode: "RD-PJT-001",
        projectName: "研发治具归集",
        supplierId: 10,
        handlerPersonnelId: 20,
        workshopId: 9,
        lines: [{ materialId: 100, quantity: "5", unitPrice: "10" }],
      },
      "5",
    );

    expect(result).toEqual(mockRequest);
    expect(repository.createRequest).toHaveBeenCalled();
  });

  it("throws when documentNo already exists", async () => {
    repository.findRequestByDocumentNo.mockResolvedValue(mockRequest);

    await expect(
      service.createRequest({
        documentNo: "RDPUR-001",
        bizDate: "2026-03-29",
        projectCode: "RD-PJT-001",
        projectName: "研发治具归集",
        workshopId: 9,
        lines: [{ materialId: 100, quantity: "5" }],
      }),
    ).rejects.toThrow(ConflictException);
  });

  it("rejects non-RD workshops", async () => {
    repository.findRequestByDocumentNo.mockResolvedValue(null);
    masterDataService.getWorkshopById.mockResolvedValueOnce({
      id: 1,
      workshopCode: "MAIN",
      workshopName: "主仓",
    } as Awaited<ReturnType<MasterDataService["getWorkshopById"]>>);

    await expect(
      service.createRequest({
        documentNo: "RDPUR-002",
        bizDate: "2026-03-29",
        projectCode: "RD-PJT-002",
        projectName: "研发夹具归集",
        workshopId: 1,
        lines: [{ materialId: 100, quantity: "2" }],
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it("blocks void when active acceptance orders exist", async () => {
    repository.findRequestById.mockResolvedValue(mockRequest);
    repository.hasActiveAcceptanceOrders.mockResolvedValue(true);

    await expect(service.voidRequest(1, "blocked", "5")).rejects.toThrow(
      "该采购需求已关联有效验收单，不能作废",
    );
  });

  it("voids request when no active acceptance order exists", async () => {
    repository.findRequestById
      .mockResolvedValueOnce(mockRequest)
      .mockResolvedValueOnce({
        ...mockRequest,
        lifecycleStatus: DocumentLifecycleStatus.VOIDED,
      });
    repository.hasActiveAcceptanceOrders.mockResolvedValue(false);

    const result = await service.voidRequest(1, "cancel", "5");

    expect(repository.updateRequest).toHaveBeenCalledWith(
      1,
      expect.objectContaining({
        lifecycleStatus: DocumentLifecycleStatus.VOIDED,
        voidReason: "cancel",
      }),
      expect.anything(),
    );
    expect(result?.lifecycleStatus).toBe(DocumentLifecycleStatus.VOIDED);
  });

  it("throws when request does not exist", async () => {
    repository.findRequestById.mockResolvedValue(null);

    await expect(service.getRequestById(999)).rejects.toThrow(
      NotFoundException,
    );
  });
});
