import { PrismaService } from "../../../shared/prisma/prisma.service";
import { MasterDataRepository } from "./master-data.repository";

describe("MasterDataPartyRepository", () => {
  it("finds customers with keyword and ACTIVE status filters", async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const count = jest.fn().mockResolvedValue(0);
    const repository = new MasterDataRepository({
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
    expect(findMany).toHaveBeenCalledWith({
      where: expectedWhere,
      take: 20,
      skip: 5,
      orderBy: { customerCode: "asc" },
    });
    expect(count).toHaveBeenCalledWith({ where: expectedWhere });
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
});
