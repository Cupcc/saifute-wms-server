import { PrismaService } from "../../../shared/prisma/prisma.service";
import { RedisStoreService } from "../../../shared/redis/redis-store.service";
import { SystemManagementBootstrapService } from "../bootstrap/system-management-bootstrap.service";
import { RbacDictConfigRepository } from "./rbac-dict-config.repository";
import { RbacPersistenceRepository } from "./rbac-persistence.repository";
import { RbacResourceRepository } from "./rbac-resource.repository";
import { RbacRoutesRepository } from "./rbac-routes.repository";
import { RbacRuntimeRepository } from "./rbac-runtime.repository";
import { RbacSeedRepairRepository } from "./rbac-seed-repair.repository";
import { RbacState } from "./rbac-state";
import { RbacUserRepository } from "./rbac-user.repository";

class RedisStoreMemoryStub {
  private readonly values = new Map<string, unknown>();

  async get<T>(key: string): Promise<T | null> {
    if (!this.values.has(key)) {
      return null;
    }
    return structuredClone(this.values.get(key)) as T;
  }

  async set<T>(key: string, value: T): Promise<void> {
    this.values.set(key, structuredClone(value));
  }
}

function createFullRepository(
  prisma?: PrismaService,
  redisStore?: RedisStoreService,
): RbacRuntimeRepository {
  const state = new RbacState();
  const routesRepo = new RbacRoutesRepository();
  const userRepo = new RbacUserRepository(state);
  const resourceRepo = new RbacResourceRepository(state);
  const dictConfigRepo = new RbacDictConfigRepository(state);
  const persistenceRepo = new RbacPersistenceRepository(
    state,
    prisma as PrismaService,
    redisStore,
  );
  const seedRepairRepo = new RbacSeedRepairRepository(state);
  return new RbacRuntimeRepository(
    userRepo,
    resourceRepo,
    dictConfigRepo,
    routesRepo,
    persistenceRepo,
    seedRepairRepo,
  );
}

function createFullRepositoryWithState(
  prisma?: PrismaService,
  redisStore?: RedisStoreService,
): { repository: RbacRuntimeRepository; state: RbacState } {
  const state = new RbacState();
  const routesRepo = new RbacRoutesRepository();
  const userRepo = new RbacUserRepository(state);
  const resourceRepo = new RbacResourceRepository(state);
  const dictConfigRepo = new RbacDictConfigRepository(state);
  const persistenceRepo = new RbacPersistenceRepository(
    state,
    prisma as PrismaService,
    redisStore,
  );
  const seedRepairRepo = new RbacSeedRepairRepository(state);
  const repository = new RbacRuntimeRepository(
    userRepo,
    resourceRepo,
    dictConfigRepo,
    routesRepo,
    persistenceRepo,
    seedRepairRepo,
  );
  return { repository, state };
}

describe("RbacRuntimeRepository", () => {
  let repository: RbacRuntimeRepository;

  beforeEach(() => {
    repository = createFullRepository();
  });

  it("cascades descendant ancestors when moving a department", async () => {
    const parent = await repository.createDept({
      parentId: 100,
      deptName: "临时研发组",
      orderNum: 98,
      leader: "测试负责人",
      phone: "13800001233",
      email: "parent@saifute.local",
      status: "0",
    });

    const descendant = await repository.createDept({
      parentId: parent.deptId,
      deptName: "临时二级组",
      orderNum: 99,
      leader: "测试负责人",
      phone: "13800001234",
      email: "test@saifute.local",
      status: "0",
    });

    await repository.updateDept({
      deptId: parent.deptId,
      parentId: 300,
    });

    const updatedDept = await repository.getDept(parent.deptId);
    const updatedDescendant = await repository.getDept(descendant.deptId);
    const expectedPrefix = `${updatedDept.ancestors},${updatedDept.deptId}`;

    expect(
      updatedDescendant.ancestors === expectedPrefix ||
        updatedDescendant.ancestors.startsWith(`${expectedPrefix},`),
    ).toBe(true);
  });

  it("removes all dict data rows when deleting a dict type", async () => {
    const dictTypes = await repository.listDictTypes({});
    let type = dictTypes.rows[0];
    for (const item of dictTypes.rows) {
      if (
        (await repository.listDictData({ dictType: item.dictType })).rows
          .length > 1
      ) {
        type = item;
        break;
      }
    }

    expect(type).toBeDefined();

    await repository.deleteDictTypes([type?.dictId ?? 0]);

    await expect(repository.getDictType(type?.dictId ?? 0)).rejects.toThrow();
    expect(
      (await repository.listDictData({ dictType: type?.dictType })).rows,
    ).toHaveLength(0);
  });

  it("derives seeded business permissions from assigned role menus", async () => {
    const created = await repository.createUser({
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

  it("binds manually created RD operators to the RD subwarehouse console", async () => {
    const created = await repository.createUser({
      userName: "rd-manual",
      nickName: "手动研发小仓账号",
      deptId: 100,
      postIds: [],
      roleIds: [3],
      status: "0",
    });

    const user = await repository.findUserById(created.userId);

    expect(user).toMatchObject({
      consoleMode: "rd-subwarehouse",
      stockScope: {
        mode: "FIXED",
        stockScope: "RD_SUB",
        stockScopeName: "研发小仓",
      },
    });
    expect(user?.permissions).toContain("rd:workbench:view");
  });

  it("does not bind RD console scope from non-RD role assignment", async () => {
    const created = await repository.createUser({
      userName: "rd-no-role",
      nickName: "未授权研发小仓账号",
      deptId: 100,
      postIds: [],
      roleIds: [2],
      status: "0",
    });

    const user = await repository.findUserById(created.userId);

    expect(user?.consoleMode).toBe("default");
    expect(user?.stockScope).toMatchObject({
      mode: "ALL",
      stockScope: null,
      stockScopeName: null,
    });
  });

  it("updates console scope when admin grants or removes the RD operator role", async () => {
    const created = await repository.createUser({
      userName: "rd-auth-manual",
      nickName: "授权研发小仓账号",
      deptId: 300,
      postIds: [2],
      roleIds: [2],
      status: "0",
    });

    await repository.updateUserRoles(created.userId, [3]);

    const rdUser = await repository.findUserById(created.userId);
    expect(rdUser?.consoleMode).toBe("rd-subwarehouse");
    expect(rdUser?.stockScope).toMatchObject({
      mode: "FIXED",
      stockScope: "RD_SUB",
      stockScopeName: "研发小仓",
    });

    await repository.updateUserRoles(created.userId, [2]);

    const warehouseUser = await repository.findUserById(created.userId);
    expect(warehouseUser?.consoleMode).toBe("default");
    expect(warehouseUser?.stockScope).toMatchObject({
      mode: "ALL",
      stockScope: null,
      stockScopeName: null,
    });
  });

  it("recomputes role permissions from menu assignments", async () => {
    await repository.updateRole({
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
    await repository.deleteMenus([2914, 2916, 3580, 3590]);

    const before = await repository.findUserById(5);
    expect(before?.permissions).not.toContain(
      "reporting:monthly-reporting:view",
    );

    const changed = await repository.ensureSeedPermissionMenus(
      ["rd-operator"],
      ["reporting:monthly-reporting:view"],
    );

    const after = await repository.findUserById(5);
    expect(changed).toBe(true);
    expect(
      (await repository.listMenus({})).some((menu) => menu.menuId === 2914),
    ).toBe(true);
    expect(
      (await repository.listMenus({})).some((menu) => menu.menuId === 3580),
    ).toBe(true);
    expect(after?.permissions).toContain("reporting:monthly-reporting:view");
  });

  it("realigns conflicting reporting menu ids and seed role menus for rd users", async () => {
    const { repository: repo, state } = createFullRepositoryWithState();
    const exportMenu = state.menus.find((menu) => menu.menuId === 2915);
    const staleMonthlyMenu = state.menus.find((menu) => menu.menuId === 2914);
    const rdRole = state.roles.find((role) => role.roleKey === "rd-operator");
    const monthlyMenuIds = [2914, 2916, 3580, 3590];

    if (!exportMenu || !staleMonthlyMenu || !rdRole) {
      throw new Error("Expected reporting seed fixtures to exist");
    }

    Object.assign(staleMonthlyMenu, {
      ...exportMenu,
      menuId: 2914,
    });
    state.menus = state.menus.filter(
      (menu) => ![2915, 2916, 3580, 3590].includes(menu.menuId),
    );
    rdRole.menuIds = rdRole.menuIds.filter(
      (menuId) => !monthlyMenuIds.includes(menuId),
    );

    const before = await repo.findUserById(5);
    expect(before?.permissions).not.toContain(
      "reporting:monthly-reporting:view",
    );

    const repairedMenus = await repo.ensureSeedPermissionMenus(
      ["rd-operator"],
      ["reporting:monthly-reporting:view", "reporting:export"],
    );
    const syncedRoles = await repo.syncSeedRoleMenus(["rd-operator"]);

    const after = await repo.findUserById(5);
    expect(repairedMenus).toBe(true);
    expect(syncedRoles).toBe(true);
    expect(
      (await repo.listMenus({})).some((menu) => menu.menuId === 2914),
    ).toBe(true);
    expect(
      (await repo.listMenus({})).some((menu) => menu.menuId === 2915),
    ).toBe(true);
    expect(
      (await repo.listMenus({})).some((menu) => menu.menuId === 3590),
    ).toBe(true);
    expect(after?.permissions).toContain("reporting:monthly-reporting:view");
    expect(after?.permissions).not.toContain("reporting:export");
  });

  it("seeds supplier CRUD function permissions under the supplier menu", async () => {
    const supplierFunctionMenus = (await repository.listMenus({})).filter(
      (menu) => menu.parentId === 3030 && menu.menuType === "F",
    );

    expect(supplierFunctionMenus.map((menu) => menu.perms)).toEqual(
      expect.arrayContaining([
        "master:supplier:create",
        "master:supplier:update",
        "master:supplier:deactivate",
      ]),
    );
  });

  it("reloads runtime state from Redis instead of stale process state", async () => {
    const redisStore =
      new RedisStoreMemoryStub() as unknown as RedisStoreService;
    const { repository: repo, state } = createFullRepositoryWithState(
      undefined,
      redisStore,
    );

    await repo.persistState();
    state.users = [];

    const user = await repo.findUserByUsername("admin");

    expect(user?.username).toBe("admin");
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

    expect((await persistentRepository.getDept(300)).deptName).toBe("仓库");
    expect(txHandler).not.toHaveBeenCalled();
  });
});
