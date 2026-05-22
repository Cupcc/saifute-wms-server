import { PrismaService } from "../../../shared/prisma/prisma.service";
import { InventoryRepository } from "./inventory.repository";

describe("InventoryRepository", () => {
  it("lists logs by newest ledger event first so stock-log reads as reverse chronological history", async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const count = jest.fn().mockResolvedValue(0);
    const repository = new InventoryRepository({
      inventoryLog: {
        findMany,
        count,
      },
    } as unknown as PrismaService);

    await repository.findLogs({
      materialId: 277,
      limit: 20,
      offset: 0,
    });

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: { id: "desc" },
      }),
    );
  });

  it("returns only original document logs that have not been reversed", async () => {
    const activeLog = { id: 30 };
    const findMany = jest
      .fn()
      .mockResolvedValueOnce([{ id: 10 }, { id: 20 }, activeLog])
      .mockResolvedValueOnce([
        { reversalOfLogId: 10 },
        { reversalOfLogId: 20 },
      ]);
    const repository = new InventoryRepository({
      inventoryLog: {
        findMany,
      },
    } as unknown as PrismaService);

    const logs = await repository.findOriginalLogsByBusinessDocument({
      businessDocumentType: "WorkshopMaterialOrder",
      businessDocumentId: 538,
    });

    expect(logs).toEqual([activeLog]);
    expect(findMany).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        where: expect.objectContaining({
          businessDocumentType: "WorkshopMaterialOrder",
          businessDocumentId: 538,
          reversalOfLogId: null,
        }),
      }),
    );
    expect(findMany).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        where: expect.objectContaining({
          businessDocumentType: "WorkshopMaterialOrder",
          businessDocumentId: 538,
          reversalOfLogId: { not: null },
        }),
      }),
    );
  });
});
