import { Prisma, StockDirection } from "../../../../generated/prisma/client";
import { withPriceLayerSnapshotFields } from "./inventory-log-layer-snapshot";

describe("withPriceLayerSnapshotFields", () => {
  it("adds total quantity and price-layer before/change/after quantities", async () => {
    const repository = {
      findPriceLayerSnapshotLogs: jest.fn().mockResolvedValue([
        {
          id: 1,
          operationType: "PRODUCTION_RECEIPT_IN",
          materialId: 10,
          stockScopeId: 1,
          projectTargetId: null,
          direction: StockDirection.IN,
          changeQty: new Prisma.Decimal(5),
          beforeQty: new Prisma.Decimal(0),
          afterQty: new Prisma.Decimal(5),
          unitCost: new Prisma.Decimal(10),
        },
        {
          id: 2,
          operationType: "PRODUCTION_RECEIPT_IN",
          materialId: 10,
          stockScopeId: 1,
          projectTargetId: null,
          direction: StockDirection.IN,
          changeQty: new Prisma.Decimal(4),
          beforeQty: new Prisma.Decimal(5),
          afterQty: new Prisma.Decimal(9),
          unitCost: new Prisma.Decimal(12),
        },
        {
          id: 3,
          operationType: "OUTBOUND_OUT",
          costAllocations: [
            {
              sourceLogId: 1,
              quantity: "2",
              unitCost: "10",
              costAmount: "20",
              direction: "OUT",
              sourceLog: { projectTargetId: null },
            },
          ],
          materialId: 10,
          stockScopeId: 1,
          projectTargetId: null,
          direction: StockDirection.OUT,
          changeQty: new Prisma.Decimal(2),
          beforeQty: new Prisma.Decimal(9),
          afterQty: new Prisma.Decimal(7),
          unitCost: new Prisma.Decimal(10),
        },
      ]),
    };

    const rows = await withPriceLayerSnapshotFields(
      [
        {
          id: 3,
          materialId: 10,
          stockScopeId: 1,
          projectTargetId: null,
          direction: StockDirection.OUT,
          changeQty: new Prisma.Decimal(2),
          beforeQty: new Prisma.Decimal(9),
          afterQty: new Prisma.Decimal(7),
          unitCost: new Prisma.Decimal(10),
        },
        {
          id: 2,
          materialId: 10,
          stockScopeId: 1,
          projectTargetId: null,
          direction: StockDirection.IN,
          changeQty: new Prisma.Decimal(4),
          beforeQty: new Prisma.Decimal(5),
          afterQty: new Prisma.Decimal(9),
          unitCost: new Prisma.Decimal(12),
        },
      ],
      repository,
    );

    expect(repository.findPriceLayerSnapshotLogs).toHaveBeenCalledWith({
      maxLogId: 3,
      layerKeys: [
        {
          materialId: 10,
          stockScopeId: 1,
          projectTargetId: null,
          unitCost: new Prisma.Decimal(10),
        },
        {
          materialId: 10,
          stockScopeId: 1,
          projectTargetId: null,
          unitCost: new Prisma.Decimal(12),
        },
      ],
    });
    expect(rows).toHaveLength(2);
    const [outRow, inRow] = rows;
    if (!outRow || !inRow) {
      throw new Error("Expected two inventory log rows");
    }
    expect(outRow.totalQty.toString()).toBe("9");
    expect(outRow.priceLayerBeforeQty?.toString()).toBe("5");
    expect(outRow.priceLayerChangeQty?.toString()).toBe("2");
    expect(outRow.priceLayerAfterQty?.toString()).toBe("3");
    expect(inRow.totalQty.toString()).toBe("5");
    expect(inRow.priceLayerBeforeQty?.toString()).toBe("0");
    expect(inRow.priceLayerChangeQty?.toString()).toBe("4");
    expect(inRow.priceLayerAfterQty?.toString()).toBe("4");
  });

  it("treats manually confirmed standalone returns as a verified single layer", async () => {
    const log = {
      id: 40,
      materialId: 10,
      stockScopeId: 1,
      direction: StockDirection.IN,
      operationType: "SALES_RETURN_IN",
      changeQty: new Prisma.Decimal(2),
      beforeQty: new Prisma.Decimal(0),
      afterQty: new Prisma.Decimal(2),
      unitCost: new Prisma.Decimal(12),
      costAmount: new Prisma.Decimal(24),
      note: "人工确认：库存成本 12 元。",
    };
    const repository = {
      findPriceLayerSnapshotLogs: jest.fn().mockResolvedValue([log]),
    };
    const [row] = await withPriceLayerSnapshotFields([log], repository);
    expect(row?.priceLayerAfterQty?.toString()).toBe("2");
    expect(row?.priceLayerStatus).toBe("VERIFIED");
  });

  it("keeps layer quantities empty when a log has no unit cost", async () => {
    const repository = {
      findPriceLayerSnapshotLogs: jest.fn().mockResolvedValue([]),
    };

    const rows = await withPriceLayerSnapshotFields(
      [
        {
          id: 4,
          materialId: 10,
          stockScopeId: 1,
          direction: StockDirection.OUT,
          changeQty: new Prisma.Decimal(1),
          beforeQty: new Prisma.Decimal(7),
          afterQty: new Prisma.Decimal(6),
          unitCost: null,
        },
      ],
      repository,
    );

    expect(repository.findPriceLayerSnapshotLogs).toHaveBeenCalledTimes(1);
    expect(rows).toHaveLength(1);
    const [row] = rows;
    if (!row) {
      throw new Error("Expected one inventory log row");
    }
    expect(row.totalQty.toString()).toBe("7");
    expect(row.priceLayerBeforeQty).toBeNull();
    expect(row.priceLayerChangeQty).toBeNull();
    expect(row.priceLayerAfterQty).toBeNull();
  });

  it("computes a known transaction price layer while marking its source trace unresolved", async () => {
    const unknownSourceOut = {
      ...base,
      id: 4,
      direction: "OUT",
      operationType: "OUTBOUND_OUT",
      changeQty: "1",
      unitCost: "116.5",
      costAmount: "116.5",
    };
    const repository = {
      findPriceLayerSnapshotLogs: jest
        .fn()
        .mockResolvedValue([receipt(1, "5", "116.5"), unknownSourceOut]),
    };

    const [row] = await withPriceLayerSnapshotFields(
      [unknownSourceOut],
      repository,
    );

    expect(row?.priceLayerChangeQty?.toString()).toBe("1");
    expect(row?.priceLayerAfterQty?.toString()).toBe("4");
    expect(row?.priceLayerStatus).toBe("SOURCE_UNRESOLVED");
    expect(row?.sourceTraceStatus).toBe("SOURCE_UNRESOLVED");
  });

  const base = {
    materialId: 2,
    stockScopeId: 1,
    projectTargetId: null,
    beforeQty: "0",
    afterQty: "0",
  };
  const receipt = (id: number, qty: string, price: string) => ({
    ...base,
    id,
    direction: "IN",
    operationType: "PRODUCTION_RECEIPT_IN",
    changeQty: qty,
    unitCost: price,
  });
  const splitOut = {
    ...base,
    id: 10,
    direction: "OUT",
    operationType: "OUTBOUND_OUT",
    changeQty: "997",
    beforeQty: "1005",
    afterQty: "8",
    unitCost: "116.98",
    costAmount: "116627",
    costAllocations: [
      {
        sourceLogId: 1,
        direction: "OUT",
        quantity: "20",
        unitCost: "116",
        costAmount: "2320",
        sourceLog: { projectTargetId: null },
      },
      {
        sourceLogId: 2,
        direction: "OUT",
        quantity: "2",
        unitCost: "116",
        costAmount: "232",
        sourceLog: { projectTargetId: null },
      },
      {
        sourceLogId: 3,
        direction: "OUT",
        quantity: "975",
        unitCost: "117",
        costAmount: "114075",
        sourceLog: { projectTargetId: null },
      },
    ],
  };

  it("expands three sources into two price rows, with exact amounts and independent closing quantities", async () => {
    const repository = {
      findPriceLayerSnapshotLogs: jest
        .fn()
        .mockResolvedValue([
          receipt(1, "20", "116"),
          receipt(2, "10", "116"),
          receipt(3, "975", "117"),
          splitOut,
        ]),
    };
    const rows = await withPriceLayerSnapshotFields([splitOut], repository);
    expect(
      rows.map((row) => [
        row.unitCost?.toString(),
        row.changeQty.toString(),
        row.costAmount?.toString(),
        row.priceLayerBeforeQty?.toString(),
        row.priceLayerAfterQty?.toString(),
      ]),
    ).toEqual([
      ["116", "22", "2552", "30", "8"],
      ["117", "975", "114075", "975", "0"],
    ]);
    expect(rows.map((row) => row.rowKey)).toEqual([
      "10:none:116",
      "10:none:117",
    ]);
    expect(rows[0].layerSources).toHaveLength(2);
    expect(rows[1].layerSources).toHaveLength(1);
    expect(rows.every((row) => row.afterQty === "8")).toBe(true);
    expect(
      rows
        .reduce((sum, row) => sum.add(row.changeQty), new Prisma.Decimal(0))
        .toString(),
    ).toBe("997");
    expect(
      rows
        .reduce(
          (sum, row) => sum.add(row.costAmount ?? 0),
          new Prisma.Decimal(0),
        )
        .toString(),
    ).toBe("116627");
    expect(rows[0]).not.toHaveProperty("priceLayerBreakdown");
  });

  it("restores both layers on a reversal and retains their identities", async () => {
    const reverse = {
      ...splitOut,
      id: 11,
      direction: "IN",
      operationType: "REVERSAL_IN",
      reversalOfLogId: 10,
      beforeQty: "8",
      afterQty: "1005",
      costAllocations: splitOut.costAllocations.map((a) => ({
        ...a,
        direction: "IN",
      })),
    };
    const repository = {
      findPriceLayerSnapshotLogs: jest
        .fn()
        .mockResolvedValue([
          receipt(1, "30", "116"),
          receipt(3, "975", "117"),
          splitOut,
          reverse,
        ]),
    };
    const rows = await withPriceLayerSnapshotFields([reverse], repository);
    expect(rows.map((row) => row.priceLayerAfterQty?.toString())).toEqual([
      "30",
      "975",
    ]);
    expect(rows.map((row) => row.priceLayerBeforeQty?.toString())).toEqual([
      "8",
      "0",
    ]);
  });

  it("replays historical reversal layers stored only on the original outbound", async () => {
    const original = {
      ...splitOut,
      id: 10,
    };
    const reversal = {
      ...original,
      id: 11,
      direction: "IN",
      operationType: "REVERSAL_IN",
      reversalOfLogId: 10,
      beforeQty: "8",
      afterQty: "1005",
      costAllocations: [],
      reversalOfLog: {
        direction: "OUT",
        operationType: "OUTBOUND_OUT",
        note: null,
        costAllocations: splitOut.costAllocations,
      },
    };
    const repository = {
      findPriceLayerSnapshotLogs: jest
        .fn()
        .mockResolvedValue([
          receipt(1, "30", "116"),
          receipt(3, "975", "117"),
          original,
          reversal,
        ]),
    };

    const rows = await withPriceLayerSnapshotFields([reversal], repository);

    expect(
      rows.map((row) => [row.unitCost?.toString(), row.changeQty.toString()]),
    ).toEqual([
      ["116", "22"],
      ["117", "975"],
    ]);
    expect(rows.map((row) => row.priceLayerAfterQty?.toString())).toEqual([
      "30",
      "975",
    ]);
  });

  it("does not collapse zero-cost layers or distinct project ownership", async () => {
    const log = {
      ...splitOut,
      changeQty: "3",
      costAmount: "0",
      unitCost: "0",
      costAllocations: [
        {
          sourceLogId: 1,
          direction: "OUT",
          quantity: "1",
          unitCost: "0",
          costAmount: "0",
          sourceLog: { projectTargetId: null },
        },
        {
          sourceLogId: 2,
          direction: "OUT",
          quantity: "2",
          unitCost: "0",
          costAmount: "0",
          sourceLog: { projectTargetId: 9 },
        },
      ],
    };
    const repository = {
      findPriceLayerSnapshotLogs: jest
        .fn()
        .mockResolvedValue([
          receipt(1, "5", "0"),
          { ...receipt(2, "3", "0"), projectTargetId: 9 },
          log,
        ]),
    };
    const rows = await withPriceLayerSnapshotFields([log], repository);
    expect(
      rows.map((row) => [row.rowKey, row.priceLayerAfterQty?.toString()]),
    ).toEqual([
      ["10:none:0", "4"],
      ["10:9:0", "1"],
    ]);
  });

  it("preserves a real negative historical balance instead of zeroing or hiding it", async () => {
    const repository = {
      findPriceLayerSnapshotLogs: jest
        .fn()
        .mockResolvedValue([
          receipt(1, "38", "116"),
          receipt(3, "967", "117"),
          splitOut,
        ]),
    };
    const rows = await withPriceLayerSnapshotFields([splitOut], repository);
    expect(rows.map((row) => row.priceLayerAfterQty?.toString())).toEqual([
      "16",
      "-8",
    ]);
  });

  it("keeps known split rows when prior history is unknown, but never invents their balances", async () => {
    const missing = {
      ...base,
      id: 4,
      direction: "OUT",
      operationType: "PICK_OUT",
      changeQty: "1",
      unitCost: null,
    };
    const repository = {
      findPriceLayerSnapshotLogs: jest
        .fn()
        .mockResolvedValue([missing, splitOut]),
    };
    const rows = await withPriceLayerSnapshotFields([splitOut], repository);
    expect(rows).toHaveLength(2);
    expect(rows.every((row) => row.priceLayerAfterQty === null)).toBe(true);
    expect(rows.map((row) => row.priceLayerChangeQty?.toString())).toEqual([
      "22",
      "975",
    ]);
  });

  it("reads stored splits even when the historical parent average is null", async () => {
    const log = { ...splitOut, unitCost: null };
    const repository = {
      findPriceLayerSnapshotLogs: jest
        .fn()
        .mockResolvedValue([
          receipt(1, "30", "116"),
          receipt(3, "975", "117"),
          log,
        ]),
    };
    expect(await withPriceLayerSnapshotFields([log], repository)).toHaveLength(
      2,
    );
  });
});
