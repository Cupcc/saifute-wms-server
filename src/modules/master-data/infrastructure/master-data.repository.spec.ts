import { PrismaService } from "../../../shared/prisma/prisma.service";
import { MasterDataRepository } from "./master-data.repository";

describe("MasterDataRepository", () => {
  it("reconciles canonical workshops and disables legacy pseudo-workshops", async () => {
    const findFirst = jest
      .fn()
      .mockResolvedValueOnce({
        id: 192,
        workshopName: "装备车间",
        status: "ACTIVE",
      })
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null);
    const update = jest.fn().mockResolvedValue({});
    const create = jest.fn().mockResolvedValue({});
    const updateMany = jest.fn().mockResolvedValue({ count: 2 });
    const $transaction = jest
      .fn()
      .mockImplementation(async (handler: (tx: unknown) => Promise<unknown>) =>
        handler({
          workshop: {
            findFirst,
            update,
            create,
            updateMany,
          },
        }),
      );
    const repository = new MasterDataRepository({
      $transaction,
    } as unknown as PrismaService);

    await repository.ensureCanonicalWorkshops();

    expect(update).toHaveBeenCalledWith({
      where: { id: 192 },
      data: {
        workshopName: "装备车间",
        status: "ACTIVE",
        updatedBy: "system-bootstrap",
      },
    });
    expect(create).toHaveBeenCalledTimes(3);
    expect(create).toHaveBeenNthCalledWith(1, {
      data: {
        workshopName: "硐室车间",
        status: "ACTIVE",
        createdBy: "system-bootstrap",
        updatedBy: "system-bootstrap",
      },
    });
    expect(create).toHaveBeenNthCalledWith(2, {
      data: {
        workshopName: "配件车间",
        status: "ACTIVE",
        createdBy: "system-bootstrap",
        updatedBy: "system-bootstrap",
      },
    });
    expect(create).toHaveBeenNthCalledWith(3, {
      data: {
        workshopName: "电子车间",
        status: "ACTIVE",
        createdBy: "system-bootstrap",
        updatedBy: "system-bootstrap",
      },
    });
    expect(updateMany).toHaveBeenCalledWith({
      where: {
        workshopName: { in: ["主仓", "研发小仓"] },
        createdBy: "system-bootstrap",
        status: "ACTIVE",
      },
      data: {
        status: "DISABLED",
        updatedBy: "system-bootstrap",
      },
    });
  });

  it("updates an existing canonical workshop matched by name", async () => {
    const findFirst = jest
      .fn()
      .mockResolvedValueOnce({
        id: 9,
        workshopName: "装备车间",
        status: "DISABLED",
      })
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null);
    const update = jest.fn().mockResolvedValue({});
    const create = jest.fn().mockResolvedValue({});
    const updateMany = jest.fn().mockResolvedValue({ count: 0 });
    const $transaction = jest
      .fn()
      .mockImplementation(async (handler: (tx: unknown) => Promise<unknown>) =>
        handler({
          workshop: {
            findFirst,
            update,
            create,
            updateMany,
          },
        }),
      );
    const repository = new MasterDataRepository({
      $transaction,
    } as unknown as PrismaService);

    await repository.ensureCanonicalWorkshops();

    expect(findFirst).toHaveBeenCalledTimes(4);
    expect(update).toHaveBeenCalledWith({
      where: { id: 9 },
      data: {
        workshopName: "装备车间",
        status: "ACTIVE",
        updatedBy: "system-bootstrap",
      },
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

  it("finds suppliers with keyword and ACTIVE status filters", async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const count = jest.fn().mockResolvedValue(0);
    const repository = new MasterDataRepository({
      supplier: {
        findMany,
        count,
      },
    } as unknown as PrismaService);

    await repository.findSuppliers({
      keyword: "赛福特",
      limit: 20,
      offset: 5,
      status: "ACTIVE",
    });

    expect(findMany).toHaveBeenCalledWith({
      where: {
        status: "ACTIVE",
        OR: [
          { supplierCode: { contains: "赛福特" } },
          { supplierName: { contains: "赛福特" } },
        ],
      },
      take: 20,
      skip: 5,
      orderBy: { supplierCode: "asc" },
    });
    expect(count).toHaveBeenCalledWith({
      where: {
        status: "ACTIVE",
        OR: [
          { supplierCode: { contains: "赛福特" } },
          { supplierName: { contains: "赛福特" } },
        ],
      },
    });
  });

  it("creates suppliers with explicit runtime defaults", async () => {
    const create = jest.fn().mockResolvedValue({ id: 1 });
    const repository = new MasterDataRepository({
      supplier: {
        create,
      },
    } as unknown as PrismaService);

    await repository.createSupplier(
      {
        supplierCode: "SUP-001",
        supplierName: "赛福特供应商",
      },
      "1",
    );

    expect(create).toHaveBeenCalledWith({
      data: {
        supplierCode: "SUP-001",
        supplierName: "赛福特供应商",
        status: "ACTIVE",
        creationMode: "MANUAL",
        createdBy: "1",
        updatedBy: "1",
      },
    });
  });

  it("creates AUTO_CREATED suppliers with provenance", async () => {
    const create = jest.fn().mockResolvedValue({ id: 2 });
    const repository = new MasterDataRepository({
      supplier: {
        create,
      },
    } as unknown as PrismaService);

    await repository.createAutoSupplier(
      {
        supplierCode: "SUP-AUTO",
        supplierName: "自动补建供应商",
        sourceDocumentType: "StockInOrder",
        sourceDocumentId: 88,
      },
      "2",
    );

    expect(create).toHaveBeenCalledWith({
      data: {
        supplierCode: "SUP-AUTO",
        supplierName: "自动补建供应商",
        sourceDocumentType: "StockInOrder",
        sourceDocumentId: 88,
        status: "ACTIVE",
        creationMode: "AUTO_CREATED",
        createdBy: "2",
        updatedBy: "2",
      },
    });
  });

  it("updates suppliers with the latest operator", async () => {
    const update = jest.fn().mockResolvedValue({ id: 1 });
    const repository = new MasterDataRepository({
      supplier: {
        update,
      },
    } as unknown as PrismaService);

    await repository.updateSupplier(
      1,
      {
        supplierName: "已更新供应商",
        status: "DISABLED",
      },
      "9",
    );

    expect(update).toHaveBeenCalledWith({
      where: { id: 1 },
      data: {
        supplierName: "已更新供应商",
        status: "DISABLED",
        updatedBy: "9",
      },
    });
  });
});
