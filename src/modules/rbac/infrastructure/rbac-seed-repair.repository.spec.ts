import {
  DATABASE_BACKUP_COMMAND_CONFIG_KEY,
  DATABASE_BACKUP_DIRECTORY_CONFIG_KEY,
  DATABASE_BACKUP_RETENTION_FULL_COUNT_CONFIG_KEY,
  FINANCE_ACCOUNTANT_ROLE_KEY,
} from "../../../../prisma/system-management.seed";
import { RbacSeedRepairRepository } from "./rbac-seed-repair.repository";
import { RbacState } from "./rbac-state";

describe("RbacSeedRepairRepository", () => {
  it("repairs legacy sidebar menu metadata while preserving sys_menu as the display source", () => {
    const state = new RbacState();
    const repository = new RbacSeedRepairRepository(state);
    const inboundGroup = requireMenuFixture(state, 3100);
    const entryOrder = requireMenuFixture(state, 3110);
    const pickOrder = requireMenuFixture(state, 3210);
    const returnOrder = requireMenuFixture(state, 3220);
    const scrapOrder = requireMenuFixture(state, 3230);
    const onlineUsers = requireMenuFixture(state, 2920);
    const adminRole = state.roles.find((role) => role.roleKey === "admin");

    if (!adminRole) {
      throw new Error("Expected admin role seed fixture to exist");
    }

    Object.assign(inboundGroup, {
      menuName: "入库业务权限",
      path: "/entry-auth",
      routeName: "InboundPermissions",
    });
    entryOrder.menuName = "验收入库";
    requireMenuFixture(state, 3111).menuName = "验收入库新增";
    requireMenuFixture(state, 3112).menuName = "验收入库修改";
    requireMenuFixture(state, 3113).menuName = "验收入库作废";
    onlineUsers.parentId = 2900;
    pickOrder.orderNum = 1;
    returnOrder.orderNum = 2;
    scrapOrder.orderNum = 3;
    state.menus = state.menus.filter(
      (menu) =>
        ![3114, 3124, 3130, 3131, 3214, 3224, 3234].includes(menu.menuId),
    );
    adminRole.menuIds = adminRole.menuIds.filter(
      (menuId) => ![3114, 3214, 3224, 3234].includes(menuId),
    );

    expect(repository.repairSeedMenuDisplayMetadata()).toBe(true);
    expect(requireMenuFixture(state, 3100)).toMatchObject({
      menuName: "入库管理",
      path: "/entry",
      routeName: "InboundBusiness",
    });
    expect(requireMenuFixture(state, 3110).menuName).toBe("验收单");
    expect(requireMenuFixture(state, 3111).menuName).toBe("验收单新增");
    expect(requireMenuFixture(state, 3112).menuName).toBe("验收单修改");
    expect(requireMenuFixture(state, 3113).menuName).toBe("验收单作废");
    expect(requireMenuFixture(state, 3210).orderNum).toBe(10);
    expect(requireMenuFixture(state, 3220).orderNum).toBe(30);
    expect(requireMenuFixture(state, 3230).orderNum).toBe(50);
    expect(requireMenuFixture(state, 2920).parentId).toBe(2000);
    expect(state.menus.map((menu) => menu.routeName)).toEqual(
      expect.arrayContaining([
        "EntryDetail",
        "EntryIntoDetail",
        "EntryReturnOrder",
        "EntryReturnDetail",
        "TakePickDetail",
        "TakeReturnDetail",
        "StockScrapDetail",
      ]),
    );
    expect(adminRole.menuIds).toEqual(
      expect.arrayContaining([3114, 3214, 3224, 3234]),
    );
  });

  it("recreates a missing seeded finance role without reusing an occupied role id", () => {
    const state = new RbacState();
    const repository = new RbacSeedRepairRepository(state);
    const seedRole = state.roles.find(
      (role) => role.roleKey === FINANCE_ACCOUNTANT_ROLE_KEY,
    );
    if (!seedRole) {
      throw new Error("Expected finance accountant role seed fixture to exist");
    }

    state.roles = state.roles.filter(
      (role) => role.roleKey !== FINANCE_ACCOUNTANT_ROLE_KEY,
    );
    state.roles.push({
      ...seedRole,
      roleKey: "custom-role",
      roleName: "自定义角色",
      menuIds: [],
    });

    expect(repository.ensureSeedRoles([FINANCE_ACCOUNTANT_ROLE_KEY])).toBe(
      true,
    );

    const repairedRole = state.roles.find(
      (role) => role.roleKey === FINANCE_ACCOUNTANT_ROLE_KEY,
    );
    expect(repairedRole).toMatchObject({
      roleName: "财务会计",
      roleKey: FINANCE_ACCOUNTANT_ROLE_KEY,
      dataScope: "1",
    });
    expect(repairedRole?.roleId).not.toBe(seedRole.roleId);
    expect(repairedRole?.menuIds.length).toBeGreaterThan(0);
  });

  it("preserves an existing seeded finance role as runtime-managed data", () => {
    const state = new RbacState();
    const repository = new RbacSeedRepairRepository(state);
    const financeRole = state.roles.find(
      (role) => role.roleKey === FINANCE_ACCOUNTANT_ROLE_KEY,
    );
    const customMenu = state.menus.find(
      (menu) => menu.perms === "system:user:list",
    );
    if (!financeRole || !customMenu) {
      throw new Error(
        "Expected finance role and custom menu fixtures to exist",
      );
    }

    Object.assign(financeRole, {
      roleName: "自定义财务角色",
      status: "1",
      dataScope: "5",
      deptIds: [200],
      remark: "管理员已调整",
      createdAt: "2026-05-21T00:00:00.000Z",
      menuIds: [customMenu.menuId],
    });

    expect(repository.ensureSeedRoles([FINANCE_ACCOUNTANT_ROLE_KEY])).toBe(
      false,
    );
    expect(financeRole).toMatchObject({
      roleName: "自定义财务角色",
      status: "1",
      dataScope: "5",
      deptIds: [200],
      remark: "管理员已调整",
      createdAt: "2026-05-21T00:00:00.000Z",
      menuIds: [customMenu.menuId],
    });
  });

  it("recreates missing seeded backup configs without overwriting existing values", () => {
    const state = new RbacState();
    const repository = new RbacSeedRepairRepository(state);
    const existingDirectoryConfig = state.configs.find(
      (config) => config.configKey === DATABASE_BACKUP_DIRECTORY_CONFIG_KEY,
    );

    if (!existingDirectoryConfig) {
      throw new Error("Expected backup directory config seed fixture to exist");
    }

    const expectedRetentionValue = state.configs.find(
      (config) =>
        config.configKey === DATABASE_BACKUP_RETENTION_FULL_COUNT_CONFIG_KEY,
    )?.configValue;
    if (!expectedRetentionValue) {
      throw new Error("Expected backup retention config seed fixture to exist");
    }

    existingDirectoryConfig.configValue = "/custom/backup-dir";
    state.configs = state.configs.filter(
      (config) =>
        config.configKey !== DATABASE_BACKUP_COMMAND_CONFIG_KEY &&
        config.configKey !== DATABASE_BACKUP_RETENTION_FULL_COUNT_CONFIG_KEY,
    );

    expect(
      repository.ensureSeedConfigs([
        DATABASE_BACKUP_DIRECTORY_CONFIG_KEY,
        DATABASE_BACKUP_COMMAND_CONFIG_KEY,
        DATABASE_BACKUP_RETENTION_FULL_COUNT_CONFIG_KEY,
      ]),
    ).toBe(true);

    expect(existingDirectoryConfig.configValue).toBe("/custom/backup-dir");
    expect(
      state.configs.find(
        (config) => config.configKey === DATABASE_BACKUP_COMMAND_CONFIG_KEY,
      ),
    ).toMatchObject({
      configName: "数据库全量备份命令",
    });
    expect(
      state.configs.find(
        (config) =>
          config.configKey === DATABASE_BACKUP_RETENTION_FULL_COUNT_CONFIG_KEY,
      ),
    ).toMatchObject({
      configValue: expectedRetentionValue,
    });
  });
});

function requireMenuFixture(state: RbacState, menuId: number) {
  const menu = state.menus.find((item) => item.menuId === menuId);
  if (!menu) {
    throw new Error(`Expected menu seed fixture ${menuId} to exist`);
  }
  return menu;
}
