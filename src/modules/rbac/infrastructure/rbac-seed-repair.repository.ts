import { Injectable } from "@nestjs/common";
import { createSystemManagementSeedState } from "../../../../prisma/system-management.seed";
import type { ManagedMenuRecord } from "../domain/rbac.types";
import { RbacState } from "./rbac-state";

@Injectable()
export class RbacSeedRepairRepository {
  constructor(private readonly state: RbacState) {}

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
      const currentMenu = this.state.menus.find((menu) => menu.perms === seedMenu.perms);
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
        menuIds.forEach((menuId) => mergedMenuIds.add(menuId));
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
    return normalizedLeft.every((value, index) => value === normalizedRight[index]);
  }
}
