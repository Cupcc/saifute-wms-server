import {
  Prisma,
  SourceUsageStatus,
  StockDirection,
} from "../../../../generated/prisma/client";
import { InventoryRepository } from "../infrastructure/inventory.repository";
import { InventorySourceUsageService } from "./inventory-source-usage.service";

describe("InventorySourceUsageService repost recovery", () => {
  it("restores a released usage when reposting the same allocation", async () => {
    const updateSourceUsage = jest.fn().mockResolvedValue({
      id: 22505,
      materialId: 10,
      sourceLogId: 41700,
      consumerDocumentType: "SalesStockOrder",
      consumerDocumentId: 308,
      consumerLineId: 2,
      allocatedQty: new Prisma.Decimal(5),
      releasedQty: new Prisma.Decimal(0),
      status: SourceUsageStatus.ALLOCATED,
    });
    const repository = {
      runInTransaction: jest.fn((_tx, handler) => handler({})),
      lockSourceLog: jest.fn().mockResolvedValue(undefined),
      findLogById: jest.fn().mockResolvedValue({
        id: 41700,
        materialId: 10,
        direction: StockDirection.IN,
        changeQty: new Prisma.Decimal(50),
      }),
      findReversalLogBySourceLogId: jest.fn().mockResolvedValue(null),
      findSourceUsage: jest.fn().mockResolvedValue({
        id: 22505,
        materialId: 10,
        sourceLogId: 41700,
        consumerDocumentType: "SalesStockOrder",
        consumerDocumentId: 308,
        consumerLineId: 2,
        allocatedQty: new Prisma.Decimal(5),
        releasedQty: new Prisma.Decimal(5),
        status: SourceUsageStatus.RELEASED,
      }),
      getSourceUsageTotals: jest.fn().mockResolvedValue({
        allocatedQty: new Prisma.Decimal(5),
        releasedQty: new Prisma.Decimal(5),
      }),
      updateSourceUsage,
    };

    const service = new InventorySourceUsageService(
      repository as unknown as InventoryRepository,
    );
    const result = await service.allocateInventorySource({
      sourceLogId: 41700,
      consumerDocumentType: "SalesStockOrder",
      consumerDocumentId: 308,
      consumerLineId: 2,
      targetAllocatedQty: 5,
      operatorId: "1",
    });

    expect(updateSourceUsage).toHaveBeenCalledWith(
      22505,
      {
        allocatedQty: new Prisma.Decimal(5),
        releasedQty: new Prisma.Decimal(0),
        status: SourceUsageStatus.ALLOCATED,
        updatedBy: "1",
      },
      expect.anything(),
    );
    expect(result.releasedQty).toEqual(new Prisma.Decimal(0));
    expect(result.status).toBe(SourceUsageStatus.ALLOCATED);
  });
});
