import { Prisma } from "../../../../generated/prisma/client";
import { PrismaService } from "../../../shared/prisma/prisma.service";
import { MasterDataMaterialsRepository } from "./master-data-materials.repository";

describe("MasterDataMaterialsRepository", () => {
  it("lists materials with structured filters", async () => {
    const $queryRaw = jest.fn().mockResolvedValue([{ id: 3 }, { id: 24 }]);
    const findMany = jest.fn().mockResolvedValue([{ id: 24 }, { id: 3 }]);
    const count = jest.fn().mockResolvedValue(2);
    const repository = new MasterDataMaterialsRepository({
      $queryRaw,
      material: {
        findMany,
        count,
      },
    } as unknown as PrismaService);

    await repository.findMaterials({
      keyword: "通用",
      materialCode: "MAT",
      materialName: "轴承",
      specModel: "6205",
      categoryId: 3,
      unitCode: "PCS",
      warningMinQty: "5.5",
      limit: 20,
      offset: 5,
      status: "ACTIVE",
    });

    const where = count.mock.calls[0][0].where;
    expect(where).toEqual(
      expect.objectContaining({
        status: "ACTIVE",
        materialCode: { contains: "MAT" },
        materialName: { contains: "轴承" },
        specModel: { contains: "6205" },
        categoryId: 3,
        unitCode: { contains: "PCS" },
        AND: [
          {
            OR: [
              { materialCode: { contains: "通用" } },
              { materialName: { contains: "通用" } },
              { specModel: { contains: "通用" } },
            ],
          },
        ],
      }),
    );
    expect(where.warningMinQty).toBeInstanceOf(Prisma.Decimal);
    expect(where.warningMinQty.toString()).toBe("5.5");
    const [query] = $queryRaw.mock.calls[0] as [Prisma.Sql];
    expect(query.sql).toContain("REGEXP_REPLACE(material_code");
    expect(query.sql).toContain("REGEXP_SUBSTR(material_code");
    expect(query.sql).toContain("ORDER BY");
    expect(findMany).toHaveBeenCalledWith({
      where: { id: { in: [3, 24] } },
      include: { category: true },
    });
    expect(count).toHaveBeenCalledWith({ where });
  });

  it("keeps the natural material-code order returned by the database", async () => {
    const repository = new MasterDataMaterialsRepository({
      $queryRaw: jest.fn().mockResolvedValue([{ id: 3 }, { id: 24 }]),
      material: {
        findMany: jest.fn().mockResolvedValue([
          { id: 24, materialCode: "bg24" },
          { id: 3, materialCode: "bg3" },
        ]),
        count: jest.fn().mockResolvedValue(2),
      },
    } as unknown as PrismaService);

    const result = await repository.findMaterials({
      limit: 20,
      offset: 0,
      status: "ACTIVE",
    });

    expect(result.items.map((item) => item.materialCode)).toEqual([
      "bg3",
      "bg24",
    ]);
  });

  it("matches multi-token material keywords across code, name, and spec", async () => {
    const $queryRaw = jest.fn().mockResolvedValue([{ id: 951 }]);
    const findMany = jest.fn().mockResolvedValue([
      {
        id: 951,
        materialCode: "zjq176",
        materialName: "包装箱",
        specModel: "ZH30X(T)/ZH30X",
      },
    ]);
    const count = jest.fn().mockResolvedValue(1);
    const repository = new MasterDataMaterialsRepository({
      $queryRaw,
      material: {
        findMany,
        count,
      },
    } as unknown as PrismaService);

    const result = await repository.findMaterials({
      keyword: "zjq176 包装箱",
      limit: 20,
      offset: 0,
      status: "ACTIVE",
    });

    expect(count.mock.calls[0][0].where).toEqual({
      status: "ACTIVE",
      AND: [
        {
          OR: [
            { materialCode: { contains: "zjq176" } },
            { materialName: { contains: "zjq176" } },
            { specModel: { contains: "zjq176" } },
          ],
        },
        {
          OR: [
            { materialCode: { contains: "包装箱" } },
            { materialName: { contains: "包装箱" } },
            { specModel: { contains: "包装箱" } },
          ],
        },
      ],
    });

    const [query] = $queryRaw.mock.calls[0] as [Prisma.Sql];
    expect(query.values).toEqual([
      "ACTIVE",
      "%zjq176%",
      "%zjq176%",
      "%zjq176%",
      "%包装箱%",
      "%包装箱%",
      "%包装箱%",
      20,
      0,
    ]);
    expect(result.items[0].materialCode).toBe("zjq176");
  });
});
