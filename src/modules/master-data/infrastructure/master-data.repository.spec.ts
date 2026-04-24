import { Logger } from "@nestjs/common";
import { Prisma } from "../../../../generated/prisma/client";
import { PrismaService } from "../../../shared/prisma/prisma.service";
import { MasterDataRepository } from "./master-data.repository";

describe("MasterDataRepository", () => {
  it("reconciles canonical workshops and disables legacy pseudo-workshops", async () => {
    const findFirst = jest.fn().mockResolvedValue(null);
    const create = jest.fn().mockResolvedValue({});
    const update = jest.fn().mockResolvedValue({});
    const updateMany = jest.fn().mockResolvedValue({ count: 2 });
    const $transaction = jest
      .fn()
      .mockImplementation(async (handler: (tx: unknown) => Promise<unknown>) =>
        handler({
          workshop: {
            findFirst,
            create,
            update,
            updateMany,
          },
        }),
      );
    const repository = new MasterDataRepository({
      $transaction,
    } as unknown as PrismaService);

    await repository.ensureCanonicalWorkshops();

    const findFirstCalls = findFirst.mock.calls.map(([payload]) => payload);
    expect(findFirstCalls).toHaveLength(4);
    expect(
      new Set(findFirstCalls.map((payload) => payload.where.workshopName)).size,
    ).toBe(4);
    expect(create).toHaveBeenCalledTimes(4);
    expect(update).not.toHaveBeenCalled();
    for (const [payload] of create.mock.calls) {
      expect(payload.data).toEqual({
        workshopName: expect.any(String),
        status: "ACTIVE",
        createdBy: "system-bootstrap",
        updatedBy: "system-bootstrap",
      });
    }
    expect($transaction).toHaveBeenCalledTimes(1);
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

  it("reactivates canonical workshops through updates", async () => {
    const findFirst = jest.fn().mockResolvedValue({ id: 123 });
    const create = jest.fn().mockResolvedValue({});
    const update = jest.fn().mockResolvedValue({});
    const updateMany = jest.fn().mockResolvedValue({ count: 0 });
    const $transaction = jest
      .fn()
      .mockImplementation(async (handler: (tx: unknown) => Promise<unknown>) =>
        handler({
          workshop: {
            findFirst,
            create,
            update,
            updateMany,
          },
        }),
      );
    const repository = new MasterDataRepository({
      $transaction,
    } as unknown as PrismaService);

    await repository.ensureCanonicalWorkshops();

    expect($transaction).toHaveBeenCalledTimes(1);
    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          workshopName: expect.any(String),
        },
        orderBy: {
          id: "asc",
        },
      }),
    );
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: 123,
        },
        data: {
          workshopName: expect.any(String),
          status: "ACTIVE",
          updatedBy: "system-bootstrap",
        },
      }),
    );
    expect(create).not.toHaveBeenCalled();
  });

  it("reconciles canonical stock scopes by scopeCode", async () => {
    const upsert = jest.fn().mockResolvedValue({});
    const $transaction = jest
      .fn()
      .mockImplementation(async (handler: (tx: unknown) => Promise<unknown>) =>
        handler({
          stockScope: {
            upsert,
          },
        }),
      );
    const repository = new MasterDataRepository({
      $transaction,
    } as unknown as PrismaService);

    await repository.ensureCanonicalStockScopes();

    expect(upsert).toHaveBeenCalledTimes(2);
    expect($transaction).toHaveBeenCalledTimes(1);
    expect(upsert).toHaveBeenNthCalledWith(1, {
      where: { scopeCode: "MAIN" },
      update: {
        scopeName: "主仓",
        scopeType: "MAIN",
        status: "ACTIVE",
        updatedBy: "system-bootstrap",
      },
      create: {
        scopeCode: "MAIN",
        scopeName: "主仓",
        scopeType: "MAIN",
        status: "ACTIVE",
        createdBy: "system-bootstrap",
        updatedBy: "system-bootstrap",
      },
    });
    expect(upsert).toHaveBeenNthCalledWith(2, {
      where: { scopeCode: "RD_SUB" },
      update: {
        scopeName: "研发小仓",
        scopeType: "RD_SUB",
        status: "ACTIVE",
        updatedBy: "system-bootstrap",
      },
      create: {
        scopeCode: "RD_SUB",
        scopeName: "研发小仓",
        scopeType: "RD_SUB",
        status: "ACTIVE",
        createdBy: "system-bootstrap",
        updatedBy: "system-bootstrap",
      },
    });
  });

  it("lists material categories in single-level sort order", async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const count = jest.fn().mockResolvedValue(0);
    const repository = new MasterDataRepository({
      materialCategory: {
        findMany,
        count,
      },
    } as unknown as PrismaService);

    await repository.findMaterialCategories({
      keyword: "电子",
      limit: 20,
      offset: 5,
      status: "ACTIVE",
    });

    expect(findMany).toHaveBeenCalledWith({
      where: {
        status: "ACTIVE",
        OR: [
          { categoryCode: { contains: "电子" } },
          { categoryName: { contains: "电子" } },
        ],
      },
      take: 20,
      skip: 5,
      orderBy: [{ sortOrder: "asc" }, { categoryCode: "asc" }],
    });
    expect(count).toHaveBeenCalledWith({
      where: {
        status: "ACTIVE",
        OR: [
          { categoryCode: { contains: "电子" } },
          { categoryName: { contains: "电子" } },
        ],
      },
    });
  });

  it("creates material categories without any parent relation field", async () => {
    const create = jest.fn().mockResolvedValue({ id: 1 });
    const repository = new MasterDataRepository({
      materialCategory: {
        create,
      },
    } as unknown as PrismaService);

    await repository.createMaterialCategory(
      {
        categoryCode: "ELEC",
        categoryName: "电子元器件",
        sortOrder: 10,
      },
      "1",
    );

    expect(create).toHaveBeenCalledWith({
      data: {
        categoryCode: "ELEC",
        categoryName: "电子元器件",
        sortOrder: 10,
        status: "ACTIVE",
        createdBy: "1",
        updatedBy: "1",
      },
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
          { contactPerson: { contains: "赛福特" } },
          { contactPhone: { contains: "赛福特" } },
          { address: { contains: "赛福特" } },
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
          { contactPerson: { contains: "赛福特" } },
          { contactPhone: { contains: "赛福特" } },
          { address: { contains: "赛福特" } },
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
        contactPerson: "张三",
        contactPhone: "13800000000",
        address: "苏州工业园区",
      },
      "1",
    );

    expect(create).toHaveBeenCalledWith({
      data: {
        supplierCode: "SUP-001",
        supplierName: "赛福特供应商",
        contactPerson: "张三",
        contactPhone: "13800000000",
        address: "苏州工业园区",
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
        contactPhone: "13800000000",
        status: "DISABLED",
      },
      "9",
    );

    expect(update).toHaveBeenCalledWith({
      where: { id: 1 },
      data: {
        supplierName: "已更新供应商",
        contactPhone: "13800000000",
        status: "DISABLED",
        updatedBy: "9",
      },
    });
  });

  it("keeps material suggestions available when one source table is missing", async () => {
    const warnSpy = jest.spyOn(Logger.prototype, "warn").mockImplementation();
    const materialFindMany = jest
      .fn()
      .mockResolvedValue([{ unitCode: "个" }, { unitCode: "套" }]);
    const stockInFindMany = jest
      .fn()
      .mockResolvedValue([{ unitCodeSnapshot: "件" }]);
    const missingTableError = new Prisma.PrismaClientKnownRequestError(
      "Table `sales_stock_order_line` does not exist",
      {
        code: "P2021",
        clientVersion: "test",
      },
    );
    const salesFindMany = jest.fn().mockRejectedValue(missingTableError);
    const noopFindMany = jest.fn().mockResolvedValue([]);
    const repository = new MasterDataRepository({
      material: {
        findMany: materialFindMany,
      },
      stockInOrderLine: {
        findMany: stockInFindMany,
      },
      salesStockOrderLine: {
        findMany: salesFindMany,
      },
      workshopMaterialOrderLine: {
        findMany: noopFindMany,
      },
      rdProjectMaterialLine: {
        findMany: noopFindMany,
      },
      rdHandoffOrderLine: {
        findMany: noopFindMany,
      },
      rdProcurementRequestLine: {
        findMany: noopFindMany,
      },
      rdStocktakeOrderLine: {
        findMany: noopFindMany,
      },
    } as unknown as PrismaService);

    await expect(
      repository.findMaterialSuggestionValues("unitCode", 10),
    ).resolves.toEqual(["个", "件", "套"]);

    expect(salesFindMany).toHaveBeenCalledTimes(1);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining(
        'Skipping field suggestion source "unitCodeSnapshot"',
      ),
    );

    warnSpy.mockRestore();
  });

  it("rethrows unexpected material suggestion source errors", async () => {
    const databaseUnavailableError = new Prisma.PrismaClientKnownRequestError(
      "Database connection failed",
      {
        code: "P1001",
        clientVersion: "test",
      },
    );
    const repository = new MasterDataRepository({
      material: {
        findMany: jest.fn().mockRejectedValue(databaseUnavailableError),
      },
      stockInOrderLine: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      salesStockOrderLine: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      workshopMaterialOrderLine: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      rdProjectMaterialLine: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      rdHandoffOrderLine: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      rdProcurementRequestLine: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      rdStocktakeOrderLine: {
        findMany: jest.fn().mockResolvedValue([]),
      },
    } as unknown as PrismaService);

    await expect(
      repository.findMaterialSuggestionValues("unitCode", 10),
    ).rejects.toBe(databaseUnavailableError);
  });
});
