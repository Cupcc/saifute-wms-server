import { PrismaService } from "../../../shared/prisma/prisma.service";
import { InMemoryRbacRepository } from "./in-memory-rbac.repository";

describe("InMemoryRbacRepository", () => {
  let repository: InMemoryRbacRepository;

  beforeEach(() => {
    repository = new InMemoryRbacRepository();
  });

  it("cascades descendant ancestors when moving a department", () => {
    const parent = repository.createDept({
      parentId: 100,
      deptName: "临时研发组",
      orderNum: 98,
      leader: "测试负责人",
      phone: "13800001233",
      email: "parent@saifute.local",
      status: "0",
    });

    const descendant = repository.createDept({
      parentId: parent.deptId,
      deptName: "临时二级组",
      orderNum: 99,
      leader: "测试负责人",
      phone: "13800001234",
      email: "test@saifute.local",
      status: "0",
    });

    repository.updateDept({
      deptId: parent.deptId,
      parentId: 300,
    });

    const updatedDept = repository.getDept(parent.deptId);
    const updatedDescendant = repository.getDept(descendant.deptId);
    const expectedPrefix = `${updatedDept.ancestors},${updatedDept.deptId}`;

    expect(
      updatedDescendant.ancestors === expectedPrefix ||
        updatedDescendant.ancestors.startsWith(`${expectedPrefix},`),
    ).toBe(true);
  });

  it("removes all dict data rows when deleting a dict type", () => {
    const type = repository
      .listDictTypes({})
      .rows.find(
        (item) =>
          repository.listDictData({ dictType: item.dictType }).rows.length > 1,
      );

    expect(type).toBeDefined();

    repository.deleteDictTypes([type?.dictId ?? 0]);

    expect(() => repository.getDictType(type?.dictId ?? 0)).toThrow();
    expect(
      repository.listDictData({ dictType: type?.dictType }).rows,
    ).toHaveLength(0);
  });

  it("derives seeded business permissions from assigned role menus", async () => {
    const created = repository.createUser({
      userName: "warehouse-smoke",
      nickName: "仓库冒烟账号",
      deptId: 300,
      postIds: [2],
      roleIds: [2],
      status: "0",
    });

    const user = await repository.findUserById(created.userId);

    expect(user?.permissions).toEqual(
      expect.arrayContaining([
        "dashboard:view",
        "inbound:order:list",
        "workshop-material:pick-order:create",
        "customer:order:list",
        "rd:procurement-request:list",
      ]),
    );
    expect(user?.permissions).not.toEqual(
      expect.arrayContaining(["system:user:list", "rd:workbench:view"]),
    );
  });

  it("recomputes role permissions from menu assignments", async () => {
    repository.updateRole({
      roleId: 2,
      roleSort: 2,
      menuIds: [1900, 3520],
    });

    const user = await repository.findUserById(2);

    expect(user?.permissions).toEqual(
      expect.arrayContaining(["dashboard:view", "rd:procurement-request:list"]),
    );
    expect(user?.permissions).not.toEqual(
      expect.arrayContaining(["inbound:order:list", "customer:order:list"]),
    );
  });

  it("bootstraps snapshot storage before restoring persisted state", async () => {
    const findUnique = jest.fn().mockResolvedValue(null);
    const upsert = jest.fn().mockResolvedValue({
      snapshotKey: "default",
    });
    const executeRawUnsafe = jest.fn().mockResolvedValue(0);
    const persistentRepository = new InMemoryRbacRepository({
      systemManagementSnapshot: {
        findUnique,
        upsert,
      },
      $executeRawUnsafe: executeRawUnsafe,
    } as unknown as PrismaService);

    await persistentRepository.onModuleInit();

    expect(executeRawUnsafe).toHaveBeenCalledWith(
      expect.stringContaining(
        "CREATE TABLE IF NOT EXISTS `system_management_snapshot`",
      ),
    );
    expect(executeRawUnsafe.mock.invocationCallOrder[0]).toBeLessThan(
      findUnique.mock.invocationCallOrder[0],
    );
    expect(upsert).toHaveBeenCalledTimes(1);
  });
});
