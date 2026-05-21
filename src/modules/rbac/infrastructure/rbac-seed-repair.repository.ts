import { Injectable } from "@nestjs/common";
import { createSystemManagementSeedState } from "../../../../prisma/system-management.seed";
import type {
  ManagedMenuRecord,
  ManagedRoleRecord,
} from "../domain/rbac.types";
import { RbacState } from "./rbac-state";

const LEGACY_ROUTE_NAME_RENAMES = new Map([
  ["PlatformCapabilities", "Reporting"],
  ["MasterDataPermissions", "MasterData"],
  ["InboundPermissions", "InboundBusiness"],
  ["WorkshopMaterialPermissions", "WorkshopMaterialBusiness"],
  ["InventoryPermissions", "InventoryBusiness"],
  ["SalesPermissions", "SalesBusiness"],
  ["RdPermissions", "RdSubwarehouse"],
  ["SchedulerPermissions", "Monitor"],
]);

const SEEDED_DISPLAY_ROUTE_NAMES = [
  "SystemManagement",
  "Reporting",
  "MasterData",
  "InboundBusiness",
  "WorkshopMaterialBusiness",
  "InventoryBusiness",
  "SalesBusiness",
  "RdSubwarehouse",
  "Monitor",
  "OnlineUsers",
  "LoginLogs",
  "OperLogs",
  "EntryOrder",
  "EntryDetail",
  "EntryIntoOrder",
  "EntryIntoDetail",
  "EntryReturnOrder",
  "EntryReturnDetail",
  "SalesOrder",
  "SalesDetail",
  "SalesReturnOrder",
  "SalesReturnDetail",
  "SalesProjectLedger",
  "TakePickOrder",
  "TakePickDetail",
  "TakeReturnOrder",
  "TakeReturnDetail",
  "StockScrapOrder",
  "StockScrapDetail",
  "MonthlyReportingMaterialCategory",
  "RdInventorySummary",
  "RdInventoryLogs",
  "RdScrapOrders",
  "RdMaterialCategorySummary",
  "RdMonthlyReporting",
  "RdMonthlyReportingMaterialCategory",
] as const;

const LEGACY_MENU_NAMES_BY_ROUTE_NAME = new Map<string, Set<string>>([
  ["EntryOrder", new Set(["普通入库"])],
  ["EntryIntoOrder", new Set(["生产入库"])],
]);

const LEGACY_MENU_NAMES_BY_MENU_ID = new Map<number, Set<string>>([
  [3111, new Set(["普通入库新增"])],
  [3112, new Set(["普通入库修改"])],
  [3113, new Set(["普通入库作废"])],
  [3121, new Set(["生产入库新增"])],
  [3122, new Set(["生产入库修改"])],
  [3123, new Set(["生产入库作废"])],
]);

const LEGACY_PARENT_BY_ROUTE_NAME = new Map<string, number>([
  ["OnlineUsers", 2900],
  ["LoginLogs", 2900],
  ["OperLogs", 2900],
]);

const LEGACY_ORDER_BY_ROUTE_NAME = new Map<string, number>([
  ["SystemManagement", 1],
  ["SalesOrder", 1],
  ["SalesReturnOrder", 2],
  ["SalesProjectLedger", 3],
  ["TakePickOrder", 1],
  ["TakeReturnOrder", 2],
  ["StockScrapOrder", 3],
]);

@Injectable()
export class RbacSeedRepairRepository {
  constructor(private readonly state: RbacState) {}

  ensureSeedRoles(roleKeys: string[]): boolean {
    const seedState = createSystemManagementSeedState();
    const requiredRoleKeys = new Set(roleKeys.filter(Boolean));
    if (requiredRoleKeys.size === 0) {
      return false;
    }

    const currentMenuIds = new Set(this.state.menus.map((menu) => menu.menuId));
    let changed = false;
    for (const seedRole of seedState.roles) {
      if (!requiredRoleKeys.has(seedRole.roleKey)) {
        continue;
      }

      const currentRole = this.state.roles.find(
        (role) => role.roleKey === seedRole.roleKey,
      );
      if (currentRole) {
        // Existing role definitions are runtime-managed system data; startup
        // repair must not reset administrator customizations back to seed.
        continue;
      }

      this.state.roles.push(
        this.createRoleDefinitionForCurrentMenus(
          seedRole,
          this.resolveSeedRoleId(seedRole.roleId),
          currentMenuIds,
        ),
      );
      changed = true;
    }

    return changed;
  }

  repairSeedMenuDisplayMetadata(): boolean {
    const seedState = createSystemManagementSeedState();
    const seedMenusByRouteName = new Map(
      seedState.menus
        .filter((menu) => menu.routeName)
        .map((menu) => [menu.routeName, menu]),
    );
    const seedMenusByMenuId = new Map(
      seedState.menus.map((menu) => [menu.menuId, menu]),
    );
    let changed = false;

    for (const [legacyRouteName, routeName] of LEGACY_ROUTE_NAME_RENAMES) {
      const currentMenu = this.state.menus.find(
        (menu) => menu.routeName === legacyRouteName,
      );
      const seedMenu = seedMenusByRouteName.get(routeName);
      if (!currentMenu || !seedMenu) {
        continue;
      }

      this.replaceMenuDefinition(currentMenu, seedMenu);
      changed = true;
    }

    for (const routeName of SEEDED_DISPLAY_ROUTE_NAMES) {
      const seedMenu = seedMenusByRouteName.get(routeName);
      if (!seedMenu) {
        continue;
      }

      const currentMenu = this.state.menus.find(
        (menu) => menu.routeName === routeName,
      );
      if (!currentMenu) {
        this.upsertMissingSeedMenu(seedMenu);
        changed =
          this.ensureRolesWithMatchingPermissionHaveMenu(seedMenu) || changed;
        changed = true;
        continue;
      }

      if (this.shouldRepairDisplayMenu(currentMenu, seedMenu)) {
        this.replaceMenuDefinition(currentMenu, seedMenu);
        changed = true;
      }
      changed =
        this.ensureRolesWithMatchingPermissionHaveMenu(seedMenu) || changed;
    }

    for (const [menuId, legacyNames] of LEGACY_MENU_NAMES_BY_MENU_ID) {
      const currentMenu = this.state.menus.find(
        (menu) => menu.menuId === menuId,
      );
      const seedMenu = seedMenusByMenuId.get(menuId);
      if (!currentMenu || !seedMenu || !legacyNames.has(currentMenu.menuName)) {
        continue;
      }

      this.replaceMenuDefinition(currentMenu, seedMenu);
      changed = true;
    }

    return changed;
  }

  ensureSeedPermissionMenus(
    roleKeys: string[],
    permissionKeys: string[],
  ): boolean {
    const seedState = createSystemManagementSeedState();
    const requiredPermissions = new Set(permissionKeys.filter(Boolean));
    if (requiredPermissions.size === 0) {
      return false;
    }

    let changed = false;
    const existingPermissions = new Set(
      this.state.menus.map((menu) => menu.perms).filter(Boolean),
    );
    const requiredSeedMenus = seedState.menus.filter((menu) =>
      requiredPermissions.has(menu.perms),
    );

    for (const seedMenu of requiredSeedMenus) {
      const currentMenu = this.findSeedMenu(seedMenu);
      if (currentMenu) {
        if (!this.hasSameMenuDefinition(currentMenu, seedMenu)) {
          this.replaceMenuDefinition(currentMenu, seedMenu);
          changed = true;
        }
        continue;
      }

      const conflictingMenu = this.state.menus.find(
        (menu) =>
          menu.menuId === seedMenu.menuId ||
          (seedMenu.path && menu.path === seedMenu.path) ||
          (seedMenu.routeName && menu.routeName === seedMenu.routeName),
      );
      if (conflictingMenu) {
        this.replaceMenuDefinition(conflictingMenu, seedMenu);
        existingPermissions.add(seedMenu.perms);
        changed = true;
        continue;
      }
      this.state.menus.push({ ...seedMenu });
      existingPermissions.add(seedMenu.perms);
      changed = true;
    }

    const currentMenuIdsByPermission = new Map<string, number[]>();
    for (const menu of this.state.menus) {
      if (!menu.perms || !requiredPermissions.has(menu.perms)) {
        continue;
      }
      const menuIds = currentMenuIdsByPermission.get(menu.perms) ?? [];
      menuIds.push(menu.menuId);
      currentMenuIdsByPermission.set(menu.perms, menuIds);
    }

    for (const roleKey of roleKeys) {
      const role = this.state.roles.find((item) => item.roleKey === roleKey);
      if (!role) {
        continue;
      }

      const mergedMenuIds = new Set(role.menuIds);
      for (const permissionKey of requiredPermissions) {
        const menuIds = currentMenuIdsByPermission.get(permissionKey) ?? [];
        for (const menuId of menuIds) {
          mergedMenuIds.add(menuId);
        }
      }

      if (mergedMenuIds.size !== role.menuIds.length) {
        role.menuIds = [...mergedMenuIds];
        changed = true;
      }
    }

    return changed;
  }

  syncSeedRoleMenus(roleKeys: string[]): boolean {
    const seedState = createSystemManagementSeedState();
    const currentMenuIds = new Set(this.state.menus.map((menu) => menu.menuId));
    let changed = false;

    for (const roleKey of roleKeys) {
      const role = this.state.roles.find((item) => item.roleKey === roleKey);
      const seedRole = seedState.roles.find((item) => item.roleKey === roleKey);
      if (!role || !seedRole) {
        continue;
      }

      const expectedMenuIds = seedRole.menuIds.filter((menuId) =>
        currentMenuIds.has(menuId),
      );
      if (!this.hasSameNumberSet(role.menuIds, expectedMenuIds)) {
        role.menuIds = [...expectedMenuIds];
        changed = true;
      }
    }

    return changed;
  }

  private createRoleDefinitionForCurrentMenus(
    seedRole: ManagedRoleRecord,
    roleId: number,
    currentMenuIds: Set<number>,
  ): ManagedRoleRecord {
    return {
      ...seedRole,
      roleId,
      menuIds: seedRole.menuIds.filter((menuId) => currentMenuIds.has(menuId)),
    };
  }

  private resolveSeedRoleId(seedRoleId: number) {
    if (!this.state.roles.some((role) => role.roleId === seedRoleId)) {
      return seedRoleId;
    }

    const maxRoleId = this.state.roles.reduce(
      (max, role) => Math.max(max, role.roleId),
      0,
    );
    return maxRoleId + 1;
  }

  private replaceMenuDefinition(
    targetMenu: ManagedMenuRecord,
    seedMenu: ManagedMenuRecord,
  ) {
    const previousMenuId = targetMenu.menuId;
    Object.assign(targetMenu, { ...seedMenu });
    if (previousMenuId !== seedMenu.menuId) {
      for (const role of this.state.roles) {
        role.menuIds = role.menuIds.map((menuId) =>
          menuId === previousMenuId ? seedMenu.menuId : menuId,
        );
      }
    }
    this.ensureAdminRoleHasMenu(seedMenu.menuId);
  }

  private findSeedMenu(seedMenu: ManagedMenuRecord) {
    const matchedByIdentity = this.state.menus.find(
      (menu) =>
        menu.menuId === seedMenu.menuId ||
        (seedMenu.routeName && menu.routeName === seedMenu.routeName),
    );
    if (matchedByIdentity) {
      return matchedByIdentity;
    }

    if (!seedMenu.routeName && seedMenu.perms) {
      return this.state.menus.find((menu) => menu.perms === seedMenu.perms);
    }

    return undefined;
  }

  private upsertMissingSeedMenu(seedMenu: ManagedMenuRecord) {
    const conflictingMenu = this.state.menus.find(
      (menu) => menu.menuId === seedMenu.menuId,
    );
    if (conflictingMenu) {
      this.replaceMenuDefinition(conflictingMenu, seedMenu);
    } else {
      this.state.menus.push({ ...seedMenu });
      this.ensureAdminRoleHasMenu(seedMenu.menuId);
    }
  }

  private shouldRepairDisplayMenu(
    currentMenu: ManagedMenuRecord,
    seedMenu: ManagedMenuRecord,
  ) {
    const legacyNames = LEGACY_MENU_NAMES_BY_ROUTE_NAME.get(seedMenu.routeName);
    if (legacyNames?.has(currentMenu.menuName)) {
      return true;
    }
    if (
      LEGACY_PARENT_BY_ROUTE_NAME.get(seedMenu.routeName) ===
      currentMenu.parentId
    ) {
      return true;
    }
    if (
      LEGACY_ORDER_BY_ROUTE_NAME.get(seedMenu.routeName) ===
      currentMenu.orderNum
    ) {
      return true;
    }
    return false;
  }

  private ensureAdminRoleHasMenu(menuId: number) {
    const adminRole = this.state.roles.find((role) => role.roleKey === "admin");
    if (!adminRole || adminRole.menuIds.includes(menuId)) {
      return;
    }
    adminRole.menuIds = [...adminRole.menuIds, menuId];
  }

  private ensureRolesWithMatchingPermissionHaveMenu(
    seedMenu: ManagedMenuRecord,
  ) {
    if (!seedMenu.perms) {
      return false;
    }

    const menusById = new Map(
      this.state.menus.map((menu) => [menu.menuId, menu]),
    );
    let changed = false;
    for (const role of this.state.roles) {
      if (role.menuIds.includes(seedMenu.menuId)) {
        continue;
      }

      const alreadyHasPermission = role.menuIds.some(
        (menuId) => menusById.get(menuId)?.perms === seedMenu.perms,
      );
      if (!alreadyHasPermission) {
        continue;
      }

      role.menuIds = [...role.menuIds, seedMenu.menuId];
      changed = true;
    }

    return changed;
  }

  private hasSameMenuDefinition(
    currentMenu: ManagedMenuRecord,
    seedMenu: ManagedMenuRecord,
  ) {
    return (
      currentMenu.menuId === seedMenu.menuId &&
      currentMenu.parentId === seedMenu.parentId &&
      currentMenu.menuName === seedMenu.menuName &&
      currentMenu.orderNum === seedMenu.orderNum &&
      currentMenu.path === seedMenu.path &&
      currentMenu.component === seedMenu.component &&
      currentMenu.routeName === seedMenu.routeName &&
      currentMenu.menuType === seedMenu.menuType &&
      currentMenu.visible === seedMenu.visible &&
      currentMenu.status === seedMenu.status &&
      currentMenu.perms === seedMenu.perms &&
      currentMenu.icon === seedMenu.icon &&
      currentMenu.query === seedMenu.query &&
      currentMenu.isFrame === seedMenu.isFrame &&
      currentMenu.isCache === seedMenu.isCache
    );
  }

  private hasSameNumberSet(left: number[], right: number[]) {
    if (left.length !== right.length) {
      return false;
    }
    const normalizedLeft = [...new Set(left)].sort((a, b) => a - b);
    const normalizedRight = [...new Set(right)].sort((a, b) => a - b);
    return normalizedLeft.every(
      (value, index) => value === normalizedRight[index],
    );
  }
}
