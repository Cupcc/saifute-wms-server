import { PrismaService } from "../../../shared/prisma/prisma.service";
import { SystemManagementBootstrapService } from "../bootstrap/system-management-bootstrap.service";
import type {
  ManagedMenuRecord,
  ManagedRoleRecord,
} from "../domain/rbac.types";
import { InMemoryRbacRepository } from "./in-memory-rbac.repository";
import { RbacDictConfigRepository } from "./rbac-dict-config.repository";
import { RbacPersistenceRepository } from "./rbac-persistence.repository";
import { RbacResourceRepository } from "./rbac-resource.repository";
import { RbacRoutesRepository } from "./rbac-routes.repository";
import { RbacSeedRepairRepository } from "./rbac-seed-repair.repository";
import { RbacState } from "./rbac-state";
import { RbacUserRepository } from "./rbac-user.repository";

function createFullRepository(prisma?: PrismaService): InMemoryRbacRepository {
  const state = new RbacState();
  const routesRepo = new RbacRoutesRepository();
  const userRepo = new RbacUserRepository(state);
  const resourceRepo = new RbacResourceRepository(state);
  const dictConfigRepo = new RbacDictConfigRepository(state);
  const persistenceRepo = new RbacPersistenceRepository(state, prisma as PrismaService);
  const seedRepairRepo = new RbacSeedRepairRepository(state);
  return new InMemoryRbacRepository(userRepo, resourceRepo, dictConfigRepo, routesRepo, persistenceRepo, seedRepairRepo);
}

function createFullRepositoryWithState(prisma?: PrismaService): { repository: InMemoryRbacRepository; state: RbacState } {
  const state = new RbacState();
  const routesRepo = new RbacRoutesRepository();
  const userRepo = new RbacUserRepository(state);
  const resourceRepo = new RbacResourceRepository(state);
  const dictConfigRepo = new RbacDictConfigRepository(state);
  const persistenceRepo = new RbacPersistenceRepository(state, prisma as PrismaService);
  const seedRepairRepo = new RbacSeedRepairRepository(state);
  const repository = new InMemoryRbacRepository(userRepo, resourceRepo, dictConfigRepo, routesRepo, persistenceRepo, seedRepairRepo);
  return { repository, state };
}

describe("InMemoryRbacRepository", () => {
  let repository: InMemoryRbacRepository;

  beforeEach(() => {
    repository = createFullRepository();
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
        "sales:order:list",
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
      expect.arrayContaining(["inbound:order:list", "sales:order:list"]),
    );
  });

  it("repairs seeded monthly reporting permission menus for rd users", async () => {
    repository.deleteMenus([2914]);

    const before = await repository.findUserById(5);
    expect(before?.permissions).not.toContain("reporting:monthly-reporting:view");

    const changed = repository.ensureSeedPermissionMenus(
      ["rd-operator"],
      ["reporting:monthly-reporting:view"],
    );

    const after = await repository.findUserById(5);
    expect(changed).toBe(true);
    expect(repository.listMenus({}).some((menu) => menu.menuId === 2914)).toBe(
      true,
    );
    expect(after?.permissions).toContain("reporting:monthly-reporting:view");
  });

  it("realigns conflicting reporting menu ids and seed role menus for rd users", async () => {
    const { repository: repo, state } = createFullRepositoryWithState();
    const exportMenu = state.menus.find((menu) => menu.menuId === 2915);
    const staleMonthlyMenu = state.menus.find(
      (menu) => menu.menuId === 2914,
    );
    const rdRole = state.roles.find((role) => role.roleKey === "rd-operator");

    expect(exportMenu).toBeDefined();
    expect(staleMonthlyMenu).toBeDefined();
    expect(rdRole).toBeDefined();

    Object.assign(staleMonthlyMenu!, {
      ...exportMenu!,
      menuId: 2914,
    });
    state.menus = state.menus.filter(
      (menu) => menu.menuId !== 2915,
    );
    rdRole!.menuIds = rdRole!.menuIds.filter((menuId) => menuId !== 2914);

    const before = await repo.findUserById(5);
    expect(before?.permissions).not.toContain("reporting:monthly-reporting:view");

    const repairedMenus = repo.ensureSeedPermissionMenus(
      ["rd-operator"],
      ["reporting:monthly-reporting:view", "reporting:export"],
    );
    const syncedRoles = repo.syncSeedRoleMenus(["rd-operator"]);

    const after = await repo.findUserById(5);
    expect(repairedMenus).toBe(true);
    expect(syncedRoles).toBe(true);
    expect(repo.listMenus({}).some((menu) => menu.menuId === 2914)).toBe(
      true,
    );
    expect(repo.listMenus({}).some((menu) => menu.menuId === 2915)).toBe(
      true,
    );
    expect(after?.permissions).toContain("reporting:monthly-reporting:view");
    expect(after?.permissions).not.toContain("reporting:export");
  });

  it("seeds supplier CRUD function permissions under the supplier menu", () => {
    const supplierFunctionMenus = repository
      .listMenus({})
      .filter((menu) => menu.parentId === 3030 && menu.menuType === "F");

    expect(supplierFunctionMenus.map((menu) => menu.perms)).toEqual(
      expect.arrayContaining([
        "master:supplier:create",
        "master:supplier:update",
        "master:supplier:deactivate",
      ]),
    );
  });

  it("seeds normalized tables when no data exists on init", async () => {
    const count = jest.fn().mockResolvedValue(0);
    const findMany = jest.fn().mockResolvedValue([]);
    const createMany = jest.fn().mockResolvedValue({ count: 0 });
    const deleteMany = jest.fn().mockResolvedValue({ count: 0 });
    const modelStub = { count, findMany, createMany, deleteMany };
    const txHandler = jest
      .fn()
      .mockImplementation(async (fn) => fn(mockPrisma));
    const mockPrisma = {
      sysUser: modelStub,
      sysDept: modelStub,
      sysPost: modelStub,
      sysMenu: modelStub,
      sysRole: modelStub,
      sysDictType: modelStub,
      sysDictData: modelStub,
      sysConfig: modelStub,
      sysNotice: modelStub,
      sysUserRole: modelStub,
      sysUserPost: modelStub,
      sysRoleMenu: modelStub,
      sysRoleDept: modelStub,
      $transaction: txHandler,
    };
    const persistentRepository = createFullRepository(
      mockPrisma as unknown as PrismaService,
    );
    const bootstrapService = new SystemManagementBootstrapService(
      persistentRepository,
    );

    await bootstrapService.onApplicationBootstrap();

    expect(count).toHaveBeenCalled();
    expect(txHandler).toHaveBeenCalledTimes(1);
  });

  it("loads from normalized tables when data exists", async () => {
    const dbDept = {
      deptId: 300,
      parentId: 0,
      ancestors: "0",
      deptName: "仓库",
      orderNum: 1,
      leader: "",
      phone: "",
      email: "",
      status: "0",
      createdAt: new Date("2026-03-01T09:00:00.000Z"),
      updatedAt: new Date(),
    };
    const dbUser = {
      userId: 1,
      deptId: 300,
      userName: "admin",
      nickName: "管理员",
      avatarUrl: null,
      email: "admin@test.local",
      phonenumber: "13800000001",
      sex: "0",
      status: "0",
      deleted: false,
      remark: "",
      passwordHash: "hash",
      consoleMode: "default",
      workshopScope: {
        mode: "ALL",
        workshopId: null,
        workshopCode: null,
        workshopName: null,
      },
      extraPermissions: ["*:*:*"],
      createdAt: new Date("2026-03-01T09:00:00.000Z"),
      updatedAt: new Date(),
    };
    const count = jest.fn().mockResolvedValue(1);
    const emptyFindMany = jest.fn().mockResolvedValue([]);
    const modelStub = {
      count,
      findMany: emptyFindMany,
      createMany: jest.fn(),
      deleteMany: jest.fn(),
    };
    const mockPrisma = {
      sysUser: {
        ...modelStub,
        count,
        findMany: jest.fn().mockResolvedValue([dbUser]),
      },
      sysDept: {
        ...modelStub,
        findMany: jest.fn().mockResolvedValue([dbDept]),
      },
      sysPost: modelStub,
      sysMenu: modelStub,
      sysRole: modelStub,
      sysDictType: modelStub,
      sysDictData: modelStub,
      sysConfig: modelStub,
      sysNotice: modelStub,
      sysUserRole: modelStub,
      sysUserPost: modelStub,
      sysRoleMenu: modelStub,
      sysRoleDept: modelStub,
      $transaction: jest.fn(),
    };
    const persistentRepository = createFullRepository(
      mockPrisma as unknown as PrismaService,
    );
    const bootstrapService = new SystemManagementBootstrapService(
      persistentRepository,
    );

    await bootstrapService.onApplicationBootstrap();

    const user = await persistentRepository.findUserByUsername("admin");
    expect(user).toBeDefined();
    expect(user?.userId).toBe(1);
  });

  it("does not reseed when non-user normalized tables already contain data", async () => {
    const dbDept = {
      deptId: 300,
      parentId: 0,
      ancestors: "0",
      deptName: "仓库",
      orderNum: 1,
      leader: "",
      phone: "",
      email: "",
      status: "0",
      createdAt: new Date("2026-03-01T09:00:00.000Z"),
      updatedAt: new Date(),
    };
    const zeroCount = jest.fn().mockResolvedValue(0);
    const oneCount = jest.fn().mockResolvedValue(1);
    const emptyFindMany = jest.fn().mockResolvedValue([]);
    const modelStub = {
      count: zeroCount,
      findMany: emptyFindMany,
      createMany: jest.fn(),
      deleteMany: jest.fn(),
    };
    const txHandler = jest.fn();
    const mockPrisma = {
      sysUser: {
        ...modelStub,
        count: zeroCount,
      },
      sysDept: {
        ...modelStub,
        count: oneCount,
        findMany: jest.fn().mockResolvedValue([dbDept]),
      },
      sysPost: modelStub,
      sysMenu: modelStub,
      sysRole: modelStub,
      sysDictType: modelStub,
      sysDictData: modelStub,
      sysConfig: modelStub,
      sysNotice: modelStub,
      sysUserRole: modelStub,
      sysUserPost: modelStub,
      sysRoleMenu: modelStub,
      sysRoleDept: modelStub,
      $transaction: txHandler,
    };
    const persistentRepository = createFullRepository(
      mockPrisma as unknown as PrismaService,
    );
    const bootstrapService = new SystemManagementBootstrapService(
      persistentRepository,
    );

    await bootstrapService.onApplicationBootstrap();

    expect(persistentRepository.getDept(300).deptName).toBe("仓库");
    expect(txHandler).not.toHaveBeenCalled();
  });
});
