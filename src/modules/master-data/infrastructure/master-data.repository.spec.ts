import { PrismaService } from "../../../shared/prisma/prisma.service";
import { MasterDataRepository } from "./master-data.repository";

describe("MasterDataRepository", () => {
  it("creates canonical workshops with duplicate-safe bootstrap", async () => {
    const createMany = jest.fn().mockResolvedValue({ count: 2 });
    const repository = new MasterDataRepository({
      workshop: {
        createMany,
      },
    } as unknown as PrismaService);

    await repository.ensureCanonicalWorkshops();

    expect(createMany).toHaveBeenCalledWith({
      data: [
        {
          workshopCode: "MAIN",
          workshopName: "主仓",
          status: "ACTIVE",
          createdBy: "system-bootstrap",
          updatedBy: "system-bootstrap",
        },
        {
          workshopCode: "RD",
          workshopName: "研发小仓",
          status: "ACTIVE",
          createdBy: "system-bootstrap",
          updatedBy: "system-bootstrap",
        },
      ],
      skipDuplicates: true,
    });
  });

  it("creates canonical stock scopes with duplicate-safe bootstrap", async () => {
    const createMany = jest.fn().mockResolvedValue({ count: 2 });
    const repository = new MasterDataRepository({
      stockScope: {
        createMany,
      },
    } as unknown as PrismaService);

    await repository.ensureCanonicalStockScopes();

    expect(createMany).toHaveBeenCalledWith({
      data: [
        {
          scopeCode: "MAIN",
          scopeName: "主仓",
          status: "ACTIVE",
          createdBy: "system-bootstrap",
          updatedBy: "system-bootstrap",
        },
        {
          scopeCode: "RD_SUB",
          scopeName: "研发小仓",
          status: "ACTIVE",
          createdBy: "system-bootstrap",
          updatedBy: "system-bootstrap",
        },
      ],
      skipDuplicates: true,
    });
  });
});
