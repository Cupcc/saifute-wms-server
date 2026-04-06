import {
  Prisma,
  RdMaterialStatus,
  RdMaterialStatusEventType,
} from "../../../generated/prisma/client";
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
        update: jest.fn().mockResolvedValue(undefined),
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

    expect(db.rdMaterialStatusLedger.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 1 },
        data: expect.objectContaining({
          pendingQty: expect.any(Prisma.Decimal),
          inProcurementQty: expect.any(Prisma.Decimal),
        }),
      }),
    );
    const updateCall = (db.rdMaterialStatusLedger.update as jest.Mock).mock
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
        update: jest.fn().mockResolvedValue(undefined),
      },
    } as unknown as Parameters<typeof reverseStatusHistory>[1];

    await reverseStatusHistory(
      {
        historyId: 201,
        operatorId: "5",
      },
      db,
    );

    const updateCall = (db.rdMaterialStatusLedger.update as jest.Mock).mock
      .calls[0]?.[0];
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
});
