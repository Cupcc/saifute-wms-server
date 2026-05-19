import { PrismaService } from "../../../shared/prisma/prisma.service";
import { InventoryRepository } from "./inventory.repository";

describe("InventoryRepository", () => {
  it("lists logs by ledger order so before and after quantities remain readable", async () => {
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
});
