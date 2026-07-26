import { ConflictException } from "@nestjs/common";
import { Prisma } from "../../../generated/prisma/client";
import {
  buildCompactDocumentNo,
  buildDailyDocumentNoStem,
  buildDailySequenceDocumentNo,
  buildDashedTimestampDocumentNo,
  createWithGeneratedDocumentNo,
  isDocumentNoUniqueConflict,
  resolveDailyStartAttempt,
} from "./document-number.util";

describe("document-number.util", () => {
  const bizDate = new Date("2026-05-18T00:00:00.000Z");

  it("builds fixed-length daily sequence document numbers", () => {
    expect(buildDailyDocumentNoStem("RK", bizDate)).toBe("RK20260518");
    expect(buildDailySequenceDocumentNo("RK", bizDate, 7)).toBe(
      "RK20260518007",
    );
  });

  it("normalizes legacy long prefixes to two characters", () => {
    expect(buildCompactDocumentNo("TGC", bizDate, 0)).toBe("TG20260518001");
    expect(buildCompactDocumentNo("XSTH", bizDate, 1)).toBe("XT20260518002");
    expect(buildDashedTimestampDocumentNo("RDPUR", bizDate, 2)).toBe(
      "RQ20260518003",
    );
  });

  it("throws a readable error when the daily sequence is exhausted", () => {
    expect(() => buildDailySequenceDocumentNo("RK", bizDate, 1000)).toThrow(
      ConflictException,
    );
    expect(() => buildDailySequenceDocumentNo("RK", bizDate, 1000)).toThrow(
      "单据编号当日流水已满",
    );
  });

  it("resolves the daily start attempt from existing document numbers", () => {
    expect(
      resolveDailyStartAttempt(
        [
          "RQ20260518001",
          "RQ20260518007",
          "RQ20260518X07",
          "RQ202605180010",
          "RH20260518009",
        ],
        "RQ20260518",
      ),
    ).toBe(7);
    expect(resolveDailyStartAttempt([], "RQ20260518")).toBe(0);
  });

  it("recognizes Prisma target-based document number unique conflicts", () => {
    const error = new Prisma.PrismaClientKnownRequestError("duplicate", {
      code: "P2002",
      clientVersion: "test",
      meta: { target: ["documentNo"] },
    });

    expect(isDocumentNoUniqueConflict(error)).toBe(true);
  });

  it("recognizes MariaDB adapter document number unique conflicts", () => {
    const error = new Prisma.PrismaClientKnownRequestError(
      "Unique constraint failed on the constraint: `stock_in_order_document_no_key`",
      {
        code: "P2002",
        clientVersion: "test",
        meta: {
          modelName: "StockInOrder",
          driverAdapterError: {
            name: "DriverAdapterError",
            cause: {
              originalCode: "1062",
              originalMessage:
                "Duplicate entry 'RK20260519001' for key 'stock_in_order.stock_in_order_document_no_key'",
              kind: "UniqueConstraintViolation",
              constraint: {
                index: "stock_in_order_document_no_key",
              },
            },
          },
        },
      },
    );

    expect(isDocumentNoUniqueConflict(error)).toBe(true);
  });

  it("does not treat unrelated unique conflicts as document number conflicts", () => {
    const error = new Prisma.PrismaClientKnownRequestError(
      "Unique constraint failed on the constraint: `inventory_log_idempotency_key_key`",
      {
        code: "P2002",
        clientVersion: "test",
        meta: {
          driverAdapterError: {
            cause: {
              constraint: {
                index: "inventory_log_idempotency_key_key",
              },
            },
          },
        },
      },
    );

    expect(isDocumentNoUniqueConflict(error)).toBe(false);
  });

  it("retries generated document numbers after MariaDB adapter duplicate errors", async () => {
    const duplicateDocumentNoError = new Prisma.PrismaClientKnownRequestError(
      "duplicate",
      {
        code: "P2002",
        clientVersion: "test",
        meta: {
          driverAdapterError: {
            cause: {
              constraint: {
                index: "stock_in_order_document_no_key",
              },
            },
          },
        },
      },
    );
    const create = jest
      .fn()
      .mockRejectedValueOnce(duplicateDocumentNoError)
      .mockResolvedValueOnce("created");

    await expect(createWithGeneratedDocumentNo(create)).resolves.toBe(
      "created",
    );
    expect(create).toHaveBeenNthCalledWith(1, 0);
    expect(create).toHaveBeenNthCalledWith(2, 1);
  });

  it("starts attempts from the resolved daily start attempt", async () => {
    const create = jest.fn().mockResolvedValueOnce("created");

    await expect(
      createWithGeneratedDocumentNo(create, {
        resolveStartAttempt: () =>
          resolveDailyStartAttempt(
            ["RQ20260518003", "RQ20260518001"],
            "RQ20260518",
          ),
      }),
    ).resolves.toBe("created");
    expect(create).toHaveBeenCalledTimes(1);
    expect(create).toHaveBeenCalledWith(3);
  });

  it("keeps conflict retry as fallback after the resolved start attempt", async () => {
    const duplicateDocumentNoError = new Prisma.PrismaClientKnownRequestError(
      "duplicate",
      {
        code: "P2002",
        clientVersion: "test",
        meta: { target: ["documentNo"] },
      },
    );
    const create = jest
      .fn()
      .mockRejectedValueOnce(duplicateDocumentNoError)
      .mockResolvedValueOnce("created");

    await expect(
      createWithGeneratedDocumentNo(create, {
        resolveStartAttempt: async () => 2,
      }),
    ).resolves.toBe("created");
    expect(create).toHaveBeenNthCalledWith(1, 2);
    expect(create).toHaveBeenNthCalledWith(2, 3);
  });
});
