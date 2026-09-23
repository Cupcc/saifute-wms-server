import { Prisma } from "../../../../generated/prisma/client";
import type { PrismaService } from "../../../shared/prisma/prisma.service";
import { findInventoryPriceLayerLogPage } from "./inventory-price-layer-log-page.repository";

describe("price-layer log pagination", () => {
  it("counts and pages price rows while loading their parent once", async () => {
    const keys = [
      { id: 10, projectTargetId: null, unitCost: new Prisma.Decimal(116) },
      { id: 10, projectTargetId: null, unitCost: new Prisma.Decimal(117) },
    ];
    const db = {
      $queryRaw: jest
        .fn()
        .mockResolvedValueOnce([{ total: 2n }])
        .mockResolvedValueOnce(keys),
      inventoryLog: { findMany: jest.fn().mockResolvedValue([{ id: 10 }]) },
    };
    const prisma = { runInTransaction: jest.fn((handler) => handler(db)) };
    const result = await findInventoryPriceLayerLogPage(
      prisma as unknown as PrismaService,
      {
        businessDocumentNumber: "CK20260401001",
        stockScopeIds: [1],
        limit: 2,
        offset: 0,
      },
    );
    expect(result).toEqual({
      total: 2,
      rowKeys: ["10:none:116", "10:none:117"],
      items: [{ id: 10 }],
    });
    expect(db.inventoryLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: { in: [10] } } }),
    );
  });

  it("retains total when an offset is beyond the last split row", async () => {
    const db = {
      $queryRaw: jest
        .fn()
        .mockResolvedValueOnce([{ total: 2n }])
        .mockResolvedValueOnce([]),
      inventoryLog: { findMany: jest.fn() },
    };
    const result = await findInventoryPriceLayerLogPage(
      {
        runInTransaction: (handler: (tx: typeof db) => Promise<unknown>) =>
          handler(db),
      } as unknown as PrismaService,
      { limit: 1, offset: 2 },
    );
    expect(result).toEqual({ total: 2, items: [], rowKeys: [] });
    expect(db.inventoryLog.findMany).not.toHaveBeenCalled();
  });
});
