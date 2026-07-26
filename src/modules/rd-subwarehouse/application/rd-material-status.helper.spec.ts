import {
  Prisma,
  RdMaterialStatus,
  RdMaterialStatusEventType,
} from "../../../../generated/prisma/client";
import {
  RD_PROCUREMENT_REQUEST_DOCUMENT_TYPE,
  reverseStatusHistory,
  transferStatusQuantity,
} from "./rd-material-status.helper";

describe("rd-material-status.helper", () => {
  it("moves quantity between ledger buckets and records history", async () => {
    const ledger = {
      id: 1,
      requestLineId: 11,
      pendingQty: new Prisma.Decimal(10),
      inProcurementQty: new Prisma.Decimal(0),
      canceledQty: new Prisma.Decimal(0),
      acceptedQty: new Prisma.Decimal(0),
      handedOffQty: new Prisma.Decimal(0),
      scrappedQty: new Prisma.Decimal(0),
      returnedQty: new Prisma.Decimal(0),
      lastEventAt: null,
    };

    const db = {
      rdMaterialStatusLedger: {
        findUnique: jest.fn().mockResolvedValue(ledger),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      rdMaterialStatusHistory: {
        create: jest.fn().mockImplementation(async ({ data }) => ({
          id: 101,
          ...data,
        })),
      },
    } as unknown as Parameters<typeof transferStatusQuantity>[1];

    await transferStatusQuantity(
      {
        requestLineId: 11,
        eventType: RdMaterialStatusEventType.PROCUREMENT_STARTED,
        toStatus: RdMaterialStatus.IN_PROCUREMENT,
        quantity: "4",
        fromStatuses: [RdMaterialStatus.PENDING_PROCUREMENT],
        sourceDocumentType: RD_PROCUREMENT_REQUEST_DOCUMENT_TYPE,
        sourceDocumentId: 1,
        sourceDocumentLineId: 11,
        sourceDocumentNumber: "RDPUR-001",
        operatorId: "5",
      },
      db,
    );

    expect(db.rdMaterialStatusLedger.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: 1,
          pendingQty: ledger.pendingQty,
          inProcurementQty: ledger.inProcurementQty,
        }),
        data: expect.objectContaining({
          pendingQty: expect.any(Prisma.Decimal),
          inProcurementQty: expect.any(Prisma.Decimal),
        }),
      }),
    );
    const updateCall = (db.rdMaterialStatusLedger.updateMany as jest.Mock).mock
      .calls[0]?.[0];
    expect(updateCall.data.pendingQty.toString()).toBe("6");
    expect(updateCall.data.inProcurementQty.toString()).toBe("4");
    expect(db.rdMaterialStatusHistory.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          requestLineId: 11,
          eventType: RdMaterialStatusEventType.PROCUREMENT_STARTED,
          fromStatus: RdMaterialStatus.PENDING_PROCUREMENT,
          toStatus: RdMaterialStatus.IN_PROCUREMENT,
          quantity: expect.any(Prisma.Decimal),
        }),
      }),
    );
  });

  it("reverses a status history back into the source bucket", async () => {
    const history = {
      id: 201,
      requestLineId: 11,
      eventType: RdMaterialStatusEventType.PROCUREMENT_STARTED,
      fromStatus: RdMaterialStatus.PENDING_PROCUREMENT,
      toStatus: RdMaterialStatus.IN_PROCUREMENT,
      quantity: new Prisma.Decimal(4),
      sourceDocumentType: RD_PROCUREMENT_REQUEST_DOCUMENT_TYPE,
      sourceDocumentId: 1,
      sourceDocumentLineId: 11,
      sourceDocumentNumber: "RDPUR-001",
      referenceNo: null,
      reason: null,
      note: null,
      relatedInventoryLogId: null,
      reversalOfHistoryId: null,
      isReversed: false,
    };
    const ledger = {
      id: 1,
      requestLineId: 11,
      pendingQty: new Prisma.Decimal(6),
      inProcurementQty: new Prisma.Decimal(4),
      canceledQty: new Prisma.Decimal(0),
      acceptedQty: new Prisma.Decimal(0),
      handedOffQty: new Prisma.Decimal(0),
      scrappedQty: new Prisma.Decimal(0),
      returnedQty: new Prisma.Decimal(0),
      lastEventAt: null,
    };

    const db = {
      rdMaterialStatusHistory: {
        findUnique: jest.fn().mockResolvedValue(history),
        update: jest.fn().mockResolvedValue(undefined),
        create: jest.fn().mockImplementation(async ({ data }) => ({
          id: 202,
          ...data,
        })),
      },
      rdMaterialStatusLedger: {
        findUnique: jest.fn().mockResolvedValue(ledger),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    } as unknown as Parameters<typeof reverseStatusHistory>[1];

    await reverseStatusHistory(
      {
        historyId: 201,
        operatorId: "5",
      },
      db,
    );

    const updateCall = (db.rdMaterialStatusLedger.updateMany as jest.Mock).mock
      .calls[0]?.[0];
    expect(updateCall.where).toEqual(
      expect.objectContaining({
        id: 1,
        pendingQty: ledger.pendingQty,
        inProcurementQty: ledger.inProcurementQty,
      }),
    );
    expect(updateCall.data.pendingQty.toString()).toBe("10");
    expect(updateCall.data.inProcurementQty.toString()).toBe("0");
    expect(db.rdMaterialStatusHistory.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 201 },
        data: expect.objectContaining({
          isReversed: true,
          reversedBy: "5",
        }),
      }),
    );
    expect(db.rdMaterialStatusHistory.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          eventType: RdMaterialStatusEventType.FACT_ROLLBACK,
          fromStatus: RdMaterialStatus.IN_PROCUREMENT,
          toStatus: RdMaterialStatus.PENDING_PROCUREMENT,
          reversalOfHistoryId: 201,
        }),
      }),
    );
  });

  it("reports insufficient quantity with material and Chinese status label", async () => {
    const ledger = {
      id: 1,
      requestLineId: 11,
      pendingQty: new Prisma.Decimal(0),
      inProcurementQty: new Prisma.Decimal(0),
      canceledQty: new Prisma.Decimal(0),
      acceptedQty: new Prisma.Decimal("1.500000"),
      handedOffQty: new Prisma.Decimal(0),
      scrappedQty: new Prisma.Decimal(0),
      returnedQty: new Prisma.Decimal(0),
      lastEventAt: null,
    };
    const db = {
      rdMaterialStatusLedger: {
        findUnique: jest.fn().mockResolvedValue(ledger),
        updateMany: jest.fn(),
      },
      rdMaterialStatusHistory: {
        create: jest.fn(),
      },
      rdProcurementRequestLine: {
        findUnique: jest.fn().mockResolvedValue({
          materialCodeSnapshot: "MAT001",
          materialNameSnapshot: "Material A",
        }),
      },
    } as unknown as Parameters<typeof transferStatusQuantity>[1];

    await expect(
      transferStatusQuantity(
        {
          requestLineId: 11,
          eventType: RdMaterialStatusEventType.HANDOFF_CONFIRMED,
          toStatus: RdMaterialStatus.HANDED_OFF,
          quantity: "3.500000",
          fromStatuses: [RdMaterialStatus.ACCEPTED],
          operatorId: "5",
        },
        db,
      ),
    ).rejects.toThrow("物料 Material A 可转为「已领取」的数量不足，还缺 2");
    expect(db.rdMaterialStatusLedger.updateMany).not.toHaveBeenCalled();
    expect(db.rdMaterialStatusHistory.create).not.toHaveBeenCalled();
  });

  it("throws a conflict when the transfer races a concurrent ledger write", async () => {
    const ledger = {
      id: 1,
      requestLineId: 11,
      pendingQty: new Prisma.Decimal(10),
      inProcurementQty: new Prisma.Decimal(0),
      canceledQty: new Prisma.Decimal(0),
      acceptedQty: new Prisma.Decimal(0),
      handedOffQty: new Prisma.Decimal(0),
      scrappedQty: new Prisma.Decimal(0),
      returnedQty: new Prisma.Decimal(0),
      lastEventAt: null,
    };
    const db = {
      rdMaterialStatusLedger: {
        findUnique: jest.fn().mockResolvedValue(ledger),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      rdMaterialStatusHistory: {
        create: jest.fn(),
      },
    } as unknown as Parameters<typeof transferStatusQuantity>[1];

    await expect(
      transferStatusQuantity(
        {
          requestLineId: 11,
          eventType: RdMaterialStatusEventType.PROCUREMENT_STARTED,
          toStatus: RdMaterialStatus.IN_PROCUREMENT,
          quantity: "4",
          fromStatuses: [RdMaterialStatus.PENDING_PROCUREMENT],
          operatorId: "5",
        },
        db,
      ),
    ).rejects.toThrow("RD 状态台账并发冲突，请重试");
    expect(db.rdMaterialStatusHistory.create).not.toHaveBeenCalled();
  });

  it("throws a conflict when the reversal races a concurrent ledger write", async () => {
    const history = {
      id: 201,
      requestLineId: 11,
      eventType: RdMaterialStatusEventType.PROCUREMENT_STARTED,
      fromStatus: RdMaterialStatus.PENDING_PROCUREMENT,
      toStatus: RdMaterialStatus.IN_PROCUREMENT,
      quantity: new Prisma.Decimal(4),
      sourceDocumentType: RD_PROCUREMENT_REQUEST_DOCUMENT_TYPE,
      sourceDocumentId: 1,
      sourceDocumentLineId: 11,
      sourceDocumentNumber: "RDPUR-001",
      referenceNo: null,
      reason: null,
      note: null,
      relatedInventoryLogId: null,
      reversalOfHistoryId: null,
      isReversed: false,
    };
    const ledger = {
      id: 1,
      requestLineId: 11,
      pendingQty: new Prisma.Decimal(6),
      inProcurementQty: new Prisma.Decimal(4),
      canceledQty: new Prisma.Decimal(0),
      acceptedQty: new Prisma.Decimal(0),
      handedOffQty: new Prisma.Decimal(0),
      scrappedQty: new Prisma.Decimal(0),
      returnedQty: new Prisma.Decimal(0),
      lastEventAt: null,
    };
    const db = {
      rdMaterialStatusHistory: {
        findUnique: jest.fn().mockResolvedValue(history),
        update: jest.fn(),
        create: jest.fn(),
      },
      rdMaterialStatusLedger: {
        findUnique: jest.fn().mockResolvedValue(ledger),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
    } as unknown as Parameters<typeof reverseStatusHistory>[1];

    await expect(
      reverseStatusHistory({ historyId: 201, operatorId: "5" }, db),
    ).rejects.toThrow("RD 状态台账并发冲突，请重试");
    expect(db.rdMaterialStatusHistory.update).not.toHaveBeenCalled();
    expect(db.rdMaterialStatusHistory.create).not.toHaveBeenCalled();
  });
});
