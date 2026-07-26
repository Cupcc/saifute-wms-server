import { BadRequestException, NotFoundException } from "@nestjs/common";
import {
  DocumentLifecycleStatus,
  InventoryOperationType,
  Prisma,
  RdMaterialStatusEventType,
  StockDirection,
} from "../../../../generated/prisma/client";
import {
  applyManualAcceptanceStatus,
  applyManualReturnStatus,
  applyRequestVoidStatus,
  getStatusLedgerProjection,
  initializeRequestStatusTruth,
  reverseStatusHistory,
} from "./rd-material-status.helper";
import {
  buildStatusHistory,
  mockRequest,
  type RdProcurementRequestTestContext,
  setupRdProcurementRequestTestModule,
} from "./rd-procurement-request.spec-helpers";

jest.mock("./rd-material-status.helper", () => ({
  initializeRequestStatusTruth: jest.fn().mockResolvedValue(undefined),
  applyRequestVoidStatus: jest.fn().mockResolvedValue(undefined),
  applyProcurementStartedStatus: jest.fn().mockResolvedValue(undefined),
  applyManualAcceptanceStatus: jest.fn().mockResolvedValue(undefined),
  applyManualCancelStatus: jest.fn().mockResolvedValue(undefined),
  applyManualReturnStatus: jest.fn().mockResolvedValue([{ id: 901 }]),
  reverseStatusHistory: jest.fn().mockResolvedValue({ id: 902 }),
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
  let service: RdProcurementRequestTestContext["service"];
  let repository: RdProcurementRequestTestContext["repository"];
  let inventoryService: RdProcurementRequestTestContext["inventoryService"];

  beforeEach(async () => {
    jest.clearAllMocks();
    const context = await setupRdProcurementRequestTestModule();
    service = context.service;
    repository = context.repository;
    inventoryService = context.inventoryService;
  });

  it("creates a procurement request with RD workshop ownership", async () => {
    repository.findRequestByDocumentNo.mockResolvedValue(null);
    repository.createRequest.mockResolvedValue(mockRequest);

    const result = await service.createRequest(
      {
        bizDate: "2026-03-29",
        projectCode: "RD-PJT-001",
        supplierId: 10,
        handlerPersonnelId: 20,
        lines: [{ materialId: 100, quantity: "5", unitPrice: "10" }],
      },
      "5",
    );

    expect(result).toEqual(mockRequest);
    expect(repository.createRequest).toHaveBeenCalled();
    expect(initializeRequestStatusTruth).toHaveBeenCalled();
  });

  it("derives workshop and project snapshots from the linked RD project", async () => {
    repository.findRequestByDocumentNo.mockResolvedValue(null);
    repository.createRequest.mockResolvedValue(mockRequest);

    await service.createRequest({
      bizDate: "2026-03-29",
      projectCode: "RD-PJT-001",
      lines: [{ materialId: 100, quantity: "2" }],
    });

    expect(repository.createRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        stockScopeId: 2,
        projectCode: "RD-PJT-001",
        projectName: "研发治具项目",
        workshopId: 9,
        workshopNameSnapshot: "研发小仓",
      }),
      expect.anything(),
      expect.anything(),
    );
  });

  it("returns the same request for a duplicated clientRequestId instead of creating twice", async () => {
    repository.findRequestByClientRequestId
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(mockRequest);
    repository.createRequest.mockResolvedValue(mockRequest);

    const dto = {
      bizDate: "2026-03-29",
      projectCode: "RD-PJT-001",
      clientRequestId: "8f7f0d2e-9c3b-4c1a-8e5d-6a1b2c3d4e5f",
      lines: [{ materialId: 100, quantity: "5", unitPrice: "10" }],
    };

    const first = await service.createRequest(dto, "5");
    const second = await service.createRequest(dto, "5");

    expect(first).toEqual(mockRequest);
    expect(second).toEqual(mockRequest);
    expect(repository.createRequest).toHaveBeenCalledTimes(1);
    expect(repository.createRequest).toHaveBeenCalledWith(
      expect.objectContaining({ clientRequestId: dto.clientRequestId }),
      expect.anything(),
      expect.anything(),
    );
  });

  it("rejects creation when the project code has no effective RD project", async () => {
    const lookupService = (
      service as unknown as {
        rdProjectLookupService: {
          requireEffectiveProjectByCode: jest.Mock;
        };
      }
    ).rdProjectLookupService;
    lookupService.requireEffectiveProjectByCode.mockRejectedValueOnce(
      new BadRequestException("RD 采购需求项目编码未映射到研发项目: XXX"),
    );

    await expect(
      service.createRequest({
        bizDate: "2026-03-29",
        projectCode: "XXX",
        lines: [{ materialId: 100, quantity: "1" }],
      }),
    ).rejects.toThrow("RD 采购需求项目编码未映射到研发项目");
    expect(repository.createRequest).not.toHaveBeenCalled();
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

  it("computes missing status projections on the read path without a transaction", async () => {
    const lineWithoutLedger = { ...mockRequest.lines[0], statusLedger: null };
    (repository.findRequests as jest.Mock).mockResolvedValue({
      items: [{ ...mockRequest, lines: [lineWithoutLedger] }],
      total: 1,
    });

    const result = await service.listRequests({ limit: 10, offset: 0 });

    expect(result.items[0]?.lines[0]?.statusLedger).toMatchObject({
      requestLineId: 11,
    });
    expect(getStatusLedgerProjection).toHaveBeenCalledWith(
      11,
      repository.client,
    );
  });

  describe("MANUAL_RETURNED settlement", () => {
    const returnDto = {
      actionType: "MANUAL_RETURNED" as const,
      lineId: 11,
      quantity: "2",
      referenceNo: "RET-001",
      reason: "主仓退回",
    };

    it("settles RD_SUB out and bridges MAIN in with cost, linking the history", async () => {
      repository.findRequestById.mockResolvedValue(mockRequest);

      await service.applyStatusAction(1, returnDto, "5");

      expect(applyManualReturnStatus).toHaveBeenCalledWith(
        expect.objectContaining({
          requestId: 1,
          requestLineId: 11,
          quantity: "2",
          referenceNo: "RET-001",
          reason: "主仓退回",
          operatorId: "5",
        }),
        expect.anything(),
      );
      expect(inventoryService.settleConsumerOut).toHaveBeenCalledWith(
        expect.objectContaining({
          materialId: 100,
          stockScope: "RD_SUB",
          quantity: "2",
          operationType: InventoryOperationType.RD_RETURN_OUT,
          businessDocumentType: "RdProcurementRequest",
          businessDocumentId: 1,
          businessDocumentNumber: "RDPUR-001",
          businessDocumentLineId: 11,
          consumerLineId: 901,
          projectTargetId: 7001,
          sourceProjectTargetId: 7001,
          sourceOperationTypes: [InventoryOperationType.RD_HANDOFF_IN],
          idempotencyKey: "RdProcurementRequest:1:return-out:11:hist:901",
        }),
        expect.anything(),
      );
      expect(inventoryService.increaseStock).toHaveBeenCalledWith(
        expect.objectContaining({
          materialId: 100,
          stockScope: "MAIN",
          operationType: InventoryOperationType.RD_RETURN_IN,
          idempotencyKey:
            "RdProcurementRequest:1:return-in:11:hist:901:src:101",
          unitCost: new Prisma.Decimal(10),
          costAmount: new Prisma.Decimal(20),
        }),
        expect.anything(),
      );
      expect(repository.linkStatusHistoriesToInventoryLog).toHaveBeenCalledWith(
        [901],
        3001,
        expect.anything(),
      );
    });

    it("uses a distinct per-action source-usage identity for sequential partial returns", async () => {
      repository.findRequestById.mockResolvedValue(mockRequest);
      (applyManualReturnStatus as jest.Mock)
        .mockResolvedValueOnce([{ id: 901 }])
        .mockResolvedValueOnce([{ id: 902 }]);

      await service.applyStatusAction(1, returnDto, "5");
      await service.applyStatusAction(
        1,
        { ...returnDto, quantity: "1", referenceNo: "RET-002" },
        "5",
      );

      expect(inventoryService.settleConsumerOut).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({
          businessDocumentLineId: 11,
          consumerLineId: 901,
        }),
        expect.anything(),
      );
      expect(inventoryService.settleConsumerOut).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
          businessDocumentLineId: 11,
          consumerLineId: 902,
        }),
        expect.anything(),
      );
    });

    it("rejects when RD_SUB attributed stock is insufficient", async () => {
      repository.findRequestById.mockResolvedValue(mockRequest);
      (inventoryService.settleConsumerOut as jest.Mock).mockRejectedValueOnce(
        new BadRequestException(
          "FIFO 可用来源库存不足: 缺少 2 个来源层数量，请先确保有足够的入库记录",
        ),
      );

      await expect(
        service.applyStatusAction(1, returnDto, "5"),
      ).rejects.toThrow("第 1 行 物料 Material A: FIFO 可用来源库存不足");
    });

    it("rejects a return without a reference number", async () => {
      repository.findRequestById.mockResolvedValue(mockRequest);

      await expect(
        service.applyStatusAction(1, { ...returnDto, referenceNo: " " }, "5"),
      ).rejects.toThrow("第 1 行 物料 Material A: 退回必须填写关联单号");
      expect(applyManualReturnStatus).not.toHaveBeenCalled();
    });

    it("rejects a return without a reason", async () => {
      repository.findRequestById.mockResolvedValue(mockRequest);

      await expect(
        service.applyStatusAction(1, { ...returnDto, reason: undefined }, "5"),
      ).rejects.toThrow("第 1 行 物料 Material A: 退回必须填写退回原因");
      expect(applyManualReturnStatus).not.toHaveBeenCalled();
    });

    it("posts return inventory on the provided bizDate", async () => {
      repository.findRequestById.mockResolvedValue(mockRequest);

      await service.applyStatusAction(
        1,
        { ...returnDto, bizDate: "2026-07-01" },
        "5",
      );

      expect(inventoryService.settleConsumerOut).toHaveBeenCalledWith(
        expect.objectContaining({ bizDate: new Date("2026-07-01") }),
        expect.anything(),
      );
      expect(inventoryService.increaseStock).toHaveBeenCalledWith(
        expect.objectContaining({ bizDate: new Date("2026-07-01") }),
        expect.anything(),
      );
    });
  });

  describe("reverseStatusAction", () => {
    beforeEach(() => {
      repository.findRequestById.mockResolvedValue(mockRequest);
    });

    it("reverses a manual status-only history", async () => {
      (repository.findStatusHistoryById as jest.Mock).mockResolvedValue(
        buildStatusHistory(),
      );

      const result = await service.reverseStatusAction(1, 501, "误操作", "5");

      expect(reverseStatusHistory).toHaveBeenCalledWith(
        expect.objectContaining({
          historyId: 501,
          reason: "误操作",
          operatorId: "5",
        }),
        expect.anything(),
      );
      expect(inventoryService.reverseStock).not.toHaveBeenCalled();
      expect(result?.id).toBe(1);
    });

    it("rejects a history that belongs to another request", async () => {
      (repository.findStatusHistoryById as jest.Mock).mockResolvedValue(
        buildStatusHistory({
          requestLine: { id: 99, requestId: 999, materialId: 100 },
        }),
      );

      await expect(
        service.reverseStatusAction(1, 501, undefined, "5"),
      ).rejects.toThrow(NotFoundException);
      expect(reverseStatusHistory).not.toHaveBeenCalled();
    });

    it("rejects an already reversed history", async () => {
      (repository.findStatusHistoryById as jest.Mock).mockResolvedValue(
        buildStatusHistory({ isReversed: true }),
      );

      await expect(
        service.reverseStatusAction(1, 501, undefined, "5"),
      ).rejects.toThrow("该状态历史已被回滚");
    });

    it("rejects event types that are not manual actions", async () => {
      (repository.findStatusHistoryById as jest.Mock).mockResolvedValue(
        buildStatusHistory({
          eventType: RdMaterialStatusEventType.REQUEST_CREATED,
        }),
      );

      await expect(
        service.reverseStatusAction(1, 501, undefined, "5"),
      ).rejects.toThrow("该状态事件不支持手工回滚");
    });

    it("rejects histories produced by other business documents", async () => {
      (repository.findStatusHistoryById as jest.Mock).mockResolvedValue(
        buildStatusHistory({
          eventType: RdMaterialStatusEventType.HANDOFF_CONFIRMED,
          sourceDocumentType: "RdHandoffOrder",
        }),
      );

      await expect(
        service.reverseStatusAction(1, 501, undefined, "5"),
      ).rejects.toThrow("该状态历史由其它业务单据产生");
    });

    it("reverses inventory for a linked MANUAL_RETURNED history", async () => {
      (repository.findStatusHistoryById as jest.Mock).mockResolvedValue(
        buildStatusHistory({
          eventType: RdMaterialStatusEventType.MANUAL_RETURNED,
          fromStatus: "HANDED_OFF",
          toStatus: "RETURNED",
          relatedInventoryLogId: 3001,
        }),
      );
      (inventoryService.getLogsForDocument as jest.Mock).mockResolvedValue([
        {
          id: 3001,
          direction: StockDirection.OUT,
          idempotencyKey: "RdProcurementRequest:1:return-out:11:hist:501",
        },
        {
          id: 3002,
          direction: StockDirection.IN,
          idempotencyKey:
            "RdProcurementRequest:1:return-in:11:hist:501:src:101",
        },
        {
          id: 4000,
          direction: StockDirection.IN,
          idempotencyKey:
            "RdProcurementRequest:1:return-in:11:hist:5010:src:99",
        },
      ]);

      await service.reverseStatusAction(1, 501, "退回有误", "5");

      expect(
        inventoryService.releaseSourceUsagesForConsumerLine,
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          consumerDocumentType: "RdProcurementRequest",
          consumerDocumentId: 1,
          consumerLineId: 501,
        }),
        expect.anything(),
      );
      expect(inventoryService.reverseStock).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({ logIdToReverse: 3002 }),
        expect.anything(),
      );
      expect(inventoryService.reverseStock).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({ logIdToReverse: 3001 }),
        expect.anything(),
      );
      expect(inventoryService.reverseStock).toHaveBeenCalledTimes(2);
      expect(reverseStatusHistory).toHaveBeenCalledWith(
        expect.objectContaining({ historyId: 501 }),
        expect.anything(),
      );
    });

    it("releases only the reversed action's usages when multiple returns exist on one line", async () => {
      (repository.findStatusHistoryById as jest.Mock).mockResolvedValue(
        buildStatusHistory({
          id: 902,
          eventType: RdMaterialStatusEventType.MANUAL_RETURNED,
          fromStatus: "HANDED_OFF",
          toStatus: "RETURNED",
          relatedInventoryLogId: 3101,
        }),
      );
      (inventoryService.getLogsForDocument as jest.Mock).mockResolvedValue([
        {
          id: 3001,
          direction: StockDirection.OUT,
          idempotencyKey: "RdProcurementRequest:1:return-out:11:hist:901",
        },
        {
          id: 3002,
          direction: StockDirection.IN,
          idempotencyKey:
            "RdProcurementRequest:1:return-in:11:hist:901:src:101",
        },
        {
          id: 3101,
          direction: StockDirection.OUT,
          idempotencyKey: "RdProcurementRequest:1:return-out:11:hist:902",
        },
        {
          id: 3102,
          direction: StockDirection.IN,
          idempotencyKey:
            "RdProcurementRequest:1:return-in:11:hist:902:src:101",
        },
      ]);

      await service.reverseStatusAction(1, 902, "退回有误", "5");

      expect(
        inventoryService.releaseSourceUsagesForConsumerLine,
      ).toHaveBeenCalledTimes(1);
      expect(
        inventoryService.releaseSourceUsagesForConsumerLine,
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          consumerDocumentType: "RdProcurementRequest",
          consumerDocumentId: 1,
          consumerLineId: 902,
        }),
        expect.anything(),
      );
      expect(inventoryService.reverseStock).toHaveBeenCalledTimes(2);
      expect(inventoryService.reverseStock).not.toHaveBeenCalledWith(
        expect.objectContaining({ logIdToReverse: 3001 }),
        expect.anything(),
      );
      expect(inventoryService.reverseStock).not.toHaveBeenCalledWith(
        expect.objectContaining({ logIdToReverse: 3002 }),
        expect.anything(),
      );
    });

    it("reverses status only for MANUAL_RETURNED histories without inventory linkage", async () => {
      (repository.findStatusHistoryById as jest.Mock).mockResolvedValue(
        buildStatusHistory({
          eventType: RdMaterialStatusEventType.MANUAL_RETURNED,
          fromStatus: "HANDED_OFF",
          toStatus: "RETURNED",
          relatedInventoryLogId: null,
        }),
      );

      await service.reverseStatusAction(1, 501, undefined, "5");

      expect(inventoryService.getLogsForDocument).not.toHaveBeenCalled();
      expect(inventoryService.reverseStock).not.toHaveBeenCalled();
      expect(reverseStatusHistory).toHaveBeenCalled();
    });

    it("blocks reversal when the MAIN bridge layer was consumed downstream", async () => {
      (repository.findStatusHistoryById as jest.Mock).mockResolvedValue(
        buildStatusHistory({
          eventType: RdMaterialStatusEventType.MANUAL_RETURNED,
          fromStatus: "HANDED_OFF",
          toStatus: "RETURNED",
          relatedInventoryLogId: 3001,
        }),
      );
      (inventoryService.getLogsForDocument as jest.Mock).mockResolvedValue([
        {
          id: 3001,
          direction: StockDirection.OUT,
          idempotencyKey: "RdProcurementRequest:1:return-out:11:hist:501",
        },
        {
          id: 3002,
          direction: StockDirection.IN,
          idempotencyKey:
            "RdProcurementRequest:1:return-in:11:hist:501:src:101",
        },
      ]);
      (
        inventoryService.hasUnreleasedAllocations as jest.Mock
      ).mockImplementation(async (logId: number) => logId === 3002);

      await expect(
        service.reverseStatusAction(1, 501, undefined, "5"),
      ).rejects.toThrow(/已有下游消耗分配/);
      expect(inventoryService.reverseStock).not.toHaveBeenCalled();
      expect(reverseStatusHistory).not.toHaveBeenCalled();
    });
  });
});
