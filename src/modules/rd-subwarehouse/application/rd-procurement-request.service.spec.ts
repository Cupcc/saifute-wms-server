import { NotFoundException } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import {
  AuditStatusSnapshot,
  DocumentLifecycleStatus,
  Prisma,
} from "../../../../generated/prisma/client";
import { MasterDataService } from "../../master-data/application/master-data.service";
import { RdProcurementRequestRepository } from "../infrastructure/rd-procurement-request.repository";
import {
  applyManualAcceptanceStatus,
  applyRequestVoidStatus,
  getStatusLedgerProjection,
  initializeRequestStatusTruth,
} from "./rd-material-status.helper";
import { RdProcurementRequestService } from "./rd-procurement-request.service";

jest.mock("./rd-material-status.helper", () => ({
  initializeRequestStatusTruth: jest.fn().mockResolvedValue(undefined),
  applyRequestVoidStatus: jest.fn().mockResolvedValue(undefined),
  applyProcurementStartedStatus: jest.fn().mockResolvedValue(undefined),
  applyManualAcceptanceStatus: jest.fn().mockResolvedValue(undefined),
  applyManualCancelStatus: jest.fn().mockResolvedValue(undefined),
  applyManualReturnStatus: jest.fn().mockResolvedValue(undefined),
  getStatusLedgerProjection: jest.fn().mockResolvedValue({
    requestLineId: 11,
    pendingQty: "5",
    inProcurementQty: "0",
    canceledQty: "0",
    acceptedQty: "0",
    handedOffQty: "0",
    scrappedQty: "0",
    returnedQty: "0",
    lastEventAt: null,
  }),
}));

describe("RdProcurementRequestService", () => {
  const mockRequest = {
    id: 1,
    documentNo: "RDPUR-001",
    bizDate: new Date("2026-03-29"),
    projectCode: "RD-PJT-001",
    projectName: "研发治具项目",
    supplierId: 10,
    handlerPersonnelId: 20,
    stockScopeId: 2,
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
        statusLedger: {
          id: 101,
          requestLineId: 11,
          pendingQty: new Prisma.Decimal(5),
          inProcurementQty: new Prisma.Decimal(0),
          canceledQty: new Prisma.Decimal(0),
          acceptedQty: new Prisma.Decimal(0),
          handedOffQty: new Prisma.Decimal(0),
          scrappedQty: new Prisma.Decimal(0),
          returnedQty: new Prisma.Decimal(0),
          lastEventAt: null,
          createdBy: "5",
          createdAt: new Date(),
          updatedBy: "5",
          updatedAt: new Date(),
        },
        statusHistories: [],
        remark: null,
        createdBy: "5",
        createdAt: new Date(),
        updatedBy: "5",
        updatedAt: new Date(),
      },
    ],
  };

  let service: RdProcurementRequestService;
  let repository: jest.Mocked<RdProcurementRequestRepository>;
  let masterDataService: jest.Mocked<MasterDataService>;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        RdProcurementRequestService,
        {
          provide: RdProcurementRequestRepository,
          useValue: {
            runInTransaction: jest.fn(
              (handler: (tx: unknown) => Promise<unknown>) => handler({}),
            ),
            findRequests: jest.fn(),
            findRequestById: jest.fn(),
            findRequestByDocumentNo: jest.fn(),
            createRequest: jest.fn(),
            updateRequest: jest.fn(),
          },
        },
        {
          provide: MasterDataService,
          useValue: {
            getStockScopeByCode: jest.fn().mockResolvedValue({
              id: 2,
              scopeCode: "RD_SUB",
              scopeName: "研发小仓",
            }),
            getMaterialById: jest.fn().mockResolvedValue({
              id: 100,
              materialCode: "MAT001",
              materialName: "Material A",
              specModel: "Spec",
              unitCode: "PCS",
            }),
            getWorkshopById: jest.fn().mockResolvedValue({
              id: 9,
              workshopName: "研发小仓",
              defaultHandlerPersonnelId: null,
              defaultHandlerPersonnel: null,
              status: "ACTIVE",
              createdBy: null,
              createdAt: new Date("2026-03-29T00:00:00.000Z"),
              updatedBy: null,
              updatedAt: new Date("2026-03-29T00:00:00.000Z"),
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
        projectName: "研发治具项目",
        supplierId: 10,
        handlerPersonnelId: 20,
        workshopId: 9,
        lines: [{ materialId: 100, quantity: "5", unitPrice: "10" }],
      },
      "5",
    );

    expect(result).toEqual(mockRequest);
    expect(repository.createRequest).toHaveBeenCalled();
    expect(initializeRequestStatusTruth).toHaveBeenCalled();
  });

  it("allows any workshop id while keeping RD_SUB ownership", async () => {
    repository.findRequestByDocumentNo.mockResolvedValue(null);
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
    repository.createRequest.mockResolvedValue({
      ...mockRequest,
      id: 2,
      documentNo: "RDPUR-002",
      workshopId: 1,
      workshopNameSnapshot: "主仓",
    });

    await service.createRequest({
      documentNo: "RDPUR-002",
      bizDate: "2026-03-29",
      projectCode: "RD-PJT-002",
      projectName: "研发夹具项目",
      workshopId: 1,
      lines: [{ materialId: 100, quantity: "2" }],
    });

    expect(repository.createRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        stockScopeId: 2,
        workshopId: 1,
        workshopNameSnapshot: "主仓",
      }),
      expect.anything(),
      expect.anything(),
    );
  });

  it("blocks void when accepted facts already exist", async () => {
    repository.findRequestById.mockResolvedValue(mockRequest);
    (getStatusLedgerProjection as jest.Mock).mockResolvedValueOnce({
      requestLineId: 11,
      pendingQty: new Prisma.Decimal(0),
      inProcurementQty: new Prisma.Decimal(0),
      canceledQty: new Prisma.Decimal(0),
      acceptedQty: new Prisma.Decimal(1),
      handedOffQty: new Prisma.Decimal(0),
      scrappedQty: new Prisma.Decimal(0),
      returnedQty: new Prisma.Decimal(0),
      lastEventAt: null,
    });

    await expect(service.voidRequest(1, "blocked", "5")).rejects.toThrow(
      "该采购需求已存在验收/交接/报废/退回事实，不能作废",
    );
  });

  it("voids request when only open quantities remain", async () => {
    repository.findRequestById
      .mockResolvedValueOnce(mockRequest)
      .mockResolvedValueOnce({
        ...mockRequest,
        lifecycleStatus: DocumentLifecycleStatus.VOIDED,
      });
    (getStatusLedgerProjection as jest.Mock).mockResolvedValueOnce({
      requestLineId: 11,
      pendingQty: new Prisma.Decimal(5),
      inProcurementQty: new Prisma.Decimal(0),
      canceledQty: new Prisma.Decimal(0),
      acceptedQty: new Prisma.Decimal(0),
      handedOffQty: new Prisma.Decimal(0),
      scrappedQty: new Prisma.Decimal(0),
      returnedQty: new Prisma.Decimal(0),
      lastEventAt: null,
    });

    const result = await service.voidRequest(1, "cancel", "5");

    expect(repository.updateRequest).toHaveBeenCalledWith(
      1,
      expect.objectContaining({
        lifecycleStatus: DocumentLifecycleStatus.VOIDED,
        voidReason: "cancel",
      }),
      expect.anything(),
    );
    expect(applyRequestVoidStatus).toHaveBeenCalled();
    expect(result?.lifecycleStatus).toBe(DocumentLifecycleStatus.VOIDED);
  });

  it("applies acceptance confirmation inside RD collaboration", async () => {
    repository.findRequestById
      .mockResolvedValueOnce(mockRequest)
      .mockResolvedValueOnce(mockRequest);

    await service.applyStatusAction(
      1,
      {
        actionType: "ACCEPTANCE_CONFIRMED",
        lineId: 11,
        quantity: "2",
        referenceNo: "YS-20260410-001",
        reason: "研发协同确认到货",
      },
      "5",
    );

    expect(applyManualAcceptanceStatus).toHaveBeenCalledWith(
      expect.objectContaining({
        requestId: 1,
        requestLineId: 11,
        quantity: "2",
        referenceNo: "YS-20260410-001",
        reason: "研发协同确认到货",
        operatorId: "5",
      }),
      expect.anything(),
    );
  });

  it("throws when request does not exist", async () => {
    repository.findRequestById.mockResolvedValue(null);

    await expect(service.getRequestById(999)).rejects.toThrow(
      NotFoundException,
    );
  });
});
