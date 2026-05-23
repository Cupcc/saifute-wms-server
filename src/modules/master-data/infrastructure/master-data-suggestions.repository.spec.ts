import { PrismaService } from "../../../shared/prisma/prisma.service";
import { MasterDataSuggestionsRepository } from "./master-data-suggestions.repository";

describe("MasterDataSuggestionsRepository", () => {
  it("filters disabled personnel out of field suggestions", async () => {
    const personnelFindMany = jest
      .fn()
      .mockResolvedValue([{ personnelName: "张三" }]);
    const emptySource = { findMany: jest.fn().mockResolvedValue([]) };
    const repository = new MasterDataSuggestionsRepository({
      personnel: { findMany: personnelFindMany },
      stockInOrder: emptySource,
      salesStockOrder: emptySource,
      workshopMaterialOrder: emptySource,
      rdHandoffOrder: emptySource,
      rdProcurementRequest: emptySource,
    } as unknown as PrismaService);

    await expect(
      repository.findPersonnelSuggestionValues("personnelName", 10),
    ).resolves.toEqual(["张三"]);

    expect(personnelFindMany).toHaveBeenCalledWith({
      where: { status: "ACTIVE" },
      select: { personnelName: true },
      distinct: ["personnelName"],
      orderBy: { personnelName: "asc" },
      take: 10,
    });
  });
});
