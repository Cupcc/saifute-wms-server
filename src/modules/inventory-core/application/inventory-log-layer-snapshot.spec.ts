import { Prisma, StockDirection } from "../../../../generated/prisma/client";
import { withPriceLayerSnapshotFields } from "./inventory-log-layer-snapshot";

describe("withPriceLayerSnapshotFields", () => {
  it("adds total quantity and price-layer before/change/after quantities", async () => {
    const repository = {
      findPriceLayerSnapshotLogs: jest.fn().mockResolvedValue([
        {
          id: 1,
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

  it("keeps layer quantities empty when a log has no unit cost", async () => {
    const repository = {
      findPriceLayerSnapshotLogs: jest.fn(),
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

    expect(repository.findPriceLayerSnapshotLogs).not.toHaveBeenCalled();
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
});
