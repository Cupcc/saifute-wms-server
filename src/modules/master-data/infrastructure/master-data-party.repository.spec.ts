import { Prisma } from "../../../../generated/prisma/client";
import { PrismaService } from "../../../shared/prisma/prisma.service";
import { MasterDataRepository } from "./master-data.repository";

describe("MasterDataPartyRepository", () => {
  it("finds customers with keyword and ACTIVE status filters", async () => {
    const $queryRaw = jest.fn().mockResolvedValue([{ id: 11 }, { id: 109 }]);
    const findMany = jest.fn().mockResolvedValue([{ id: 109 }, { id: 11 }]);
    const count = jest.fn().mockResolvedValue(2);
    const repository = new MasterDataRepository({
      $queryRaw,
      customer: {
        findMany,
        count,
      },
    } as unknown as PrismaService);

    await repository.findCustomers({
      keyword: "赛福特",
      limit: 20,
      offset: 5,
      status: "ACTIVE",
    });

    const expectedWhere = {
      status: "ACTIVE",
      OR: [
        { customerCode: { contains: "赛福特" } },
        { customerName: { contains: "赛福特" } },
        { contactPerson: { contains: "赛福特" } },
        { contactPhone: { contains: "赛福特" } },
        { address: { contains: "赛福特" } },
      ],
    };
    const [query] = $queryRaw.mock.calls[0] as [Prisma.Sql];
    expect(query.sql).toContain("REGEXP_REPLACE(customer_code");
    expect(query.sql).toContain("REGEXP_SUBSTR(customer_code");
    expect(query.sql).toContain("ORDER BY");
    expect(findMany).toHaveBeenCalledWith({
      where: { id: { in: [11, 109] } },
    });
    expect(count).toHaveBeenCalledWith({ where: expectedWhere });
  });

  it("keeps the natural customer-code order returned by the database", async () => {
    const repository = new MasterDataRepository({
      $queryRaw: jest.fn().mockResolvedValue([{ id: 11 }, { id: 109 }]),
      customer: {
        findMany: jest.fn().mockResolvedValue([
          { id: 109, customerCode: "109" },
          { id: 11, customerCode: "11" },
        ]),
        count: jest.fn().mockResolvedValue(2),
      },
    } as unknown as PrismaService);

    const result = await repository.findCustomers({
      limit: 20,
      offset: 0,
      status: "ACTIVE",
    });

    expect(result.items.map((item) => item.customerCode)).toEqual([
      "11",
      "109",
    ]);
  });

  it("creates customers with contact fields and explicit runtime defaults", async () => {
    const create = jest.fn().mockResolvedValue({ id: 1 });
    const repository = new MasterDataRepository({
      customer: {
        create,
      },
    } as unknown as PrismaService);

    await repository.createCustomer(
      {
        customerCode: "CUS-001",
        customerName: "测试客户",
        contactPerson: "张三",
        contactPhone: "13800000000",
        address: "苏州工业园区",
        parentId: undefined,
      },
      "1",
    );

    expect(create).toHaveBeenCalledWith({
      data: {
        customerCode: "CUS-001",
        customerName: "测试客户",
        contactPerson: "张三",
        contactPhone: "13800000000",
        address: "苏州工业园区",
        parentId: undefined,
        status: "ACTIVE",
        creationMode: "MANUAL",
        createdBy: "1",
        updatedBy: "1",
      },
    });
  });

  it("finds active personnel by identity and treats empty phone as null", async () => {
    const findFirst = jest.fn().mockResolvedValue({ id: 1 });
    const repository = new MasterDataRepository({
      personnel: {
        findFirst,
      },
    } as unknown as PrismaService);

    await repository.findActivePersonnelByIdentity({
      personnelName: "张三",
      contactPhone: null,
      workshopId: null,
      excludeId: 9,
    });

    expect(findFirst).toHaveBeenCalledWith({
      where: {
        personnelName: "张三",
        status: "ACTIVE",
        workshopId: null,
        OR: [{ contactPhone: null }, { contactPhone: "" }],
        id: { not: 9 },
      },
      include: {
        workshop: {
          select: {
            id: true,
            workshopName: true,
          },
        },
      },
      orderBy: { id: "asc" },
    });
  });
});
