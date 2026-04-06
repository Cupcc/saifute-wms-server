import { Injectable, UnauthorizedException } from "@nestjs/common";
import { MasterDataService } from "../../master-data/application/master-data.service";
import {
  createAllSessionWorkshopScope,
  type SessionUserSnapshot,
  toSessionStockScopeSnapshotFromWorkshopScope,
} from "../../session/domain/user-session";
import type { RbacUserRecord, RouteNode } from "../domain/rbac.types";
import { InMemoryRbacRepository } from "../infrastructure/in-memory-rbac.repository";

const PERMISSION_ALIAS_MAP: Record<string, string[]> = {
  "workflow:audit:status": ["audit:document:status"],
  "workflow:audit:list": ["audit:document:list"],
  "workflow:audit:create": ["audit:document:create"],
  "workflow:audit:approve": ["audit:document:approve"],
  "workflow:audit:reject": ["audit:document:reject"],
  "workflow:audit:reset": ["audit:document:reset"],
  "audit:document:status": ["workflow:audit:status"],
  "audit:document:list": ["workflow:audit:list"],
  "audit:document:create": ["workflow:audit:create"],
  "audit:document:approve": ["workflow:audit:approve"],
  "audit:document:reject": ["workflow:audit:reject"],
  "audit:document:reset": ["workflow:audit:reset"],
};

@Injectable()
export class RbacService {
  constructor(
    private readonly inMemoryRbacRepository: InMemoryRbacRepository,
    private readonly masterDataService: MasterDataService,
  ) {}

  async findUserForLogin(username: string): Promise<RbacUserRecord> {
    const user = await this.inMemoryRbacRepository.findUserByUsername(username);
    if (!user || user.deleted || user.status !== "active") {
      throw new UnauthorizedException("用户名或密码错误");
    }

    return user;
  }

  verifyPassword(rawPassword: string, passwordHash: string): boolean {
    return this.inMemoryRbacRepository.verifyPassword(
      rawPassword,
      passwordHash,
    );
  }

  toSessionUser(user: RbacUserRecord): SessionUserSnapshot {
    const workshopScope = user.workshopScope
      ? { ...user.workshopScope }
      : createAllSessionWorkshopScope();
    const permissions = this.expandPermissionAliases(user.permissions);

    return {
      userId: user.userId,
      username: user.username,
      displayName: user.displayName,
      avatarUrl: user.avatarUrl ?? null,
      roles: [...user.roles],
      permissions,
      department: user.department ? { ...user.department } : null,
      consoleMode: user.consoleMode ?? "default",
      stockScope: user.stockScope
        ? { ...user.stockScope }
        : toSessionStockScopeSnapshotFromWorkshopScope(workshopScope),
      workshopScope,
    };
  }

  async getCurrentUser(userId: number): Promise<SessionUserSnapshot> {
    const user = await this.inMemoryRbacRepository.findUserById(userId);
    if (!user) {
      throw new UnauthorizedException("当前用户不存在");
    }

    return this.enrichSessionUser(this.toSessionUser(user));
  }

  async getRoutesForUser(userId: number): Promise<RouteNode[]> {
    const user = await this.inMemoryRbacRepository.findUserById(userId);
    if (!user) {
      throw new UnauthorizedException("当前用户不存在");
    }

    const allRoutes = await this.inMemoryRbacRepository.getRoutes();
    if (user.userId === 1) {
      return allRoutes;
    }

    const permissions = this.expandPermissionAliases(user.permissions);
    const filteredRoutes = this.filterRoutesByPermissions(
      allRoutes,
      permissions,
    );
    return this.filterRoutesByConsoleMode(
      filteredRoutes,
      user.consoleMode ?? "default",
    );
  }

  async updateAvatar(
    userId: number,
    avatarUrl: string | null,
  ): Promise<{
    currentUser: SessionUserSnapshot;
    previousAvatarUrl: string | null;
  }> {
    const result = await this.inMemoryRbacRepository.updateUserAvatar(
      userId,
      avatarUrl,
    );
    await this.inMemoryRbacRepository.flushPersistence();

    return {
      currentUser: await this.enrichSessionUser(
        this.toSessionUser(result.user),
      ),
      previousAvatarUrl: result.previousAvatarUrl,
    };
  }

  async enrichSessionUser(
    user: SessionUserSnapshot,
  ): Promise<SessionUserSnapshot> {
    const normalizedWorkshopScope =
      user.workshopScope ?? createAllSessionWorkshopScope();
    const normalizedStockScope =
      user.stockScope ??
      toSessionStockScopeSnapshotFromWorkshopScope(normalizedWorkshopScope);

    if (
      normalizedWorkshopScope.mode !== "FIXED" ||
      normalizedWorkshopScope.workshopId ||
      !normalizedWorkshopScope.workshopCode
    ) {
      return {
        ...user,
        stockScope: normalizedStockScope,
        workshopScope: normalizedWorkshopScope,
      };
    }

    try {
      const workshop = await this.masterDataService.getWorkshopByCode(
        normalizedWorkshopScope.workshopCode,
      );
      return this.withResolvedWorkshop(user, workshop);
    } catch {
      if (!normalizedWorkshopScope.workshopName) {
        return {
          ...user,
          stockScope: normalizedStockScope,
          workshopScope: normalizedWorkshopScope,
        };
      }

      try {
        const workshop = await this.masterDataService.getWorkshopByName(
          normalizedWorkshopScope.workshopName,
        );
        return this.withResolvedWorkshop(user, workshop);
      } catch {
        return {
          ...user,
          stockScope: normalizedStockScope,
          workshopScope: normalizedWorkshopScope,
        };
      }
    }
  }

  private withResolvedWorkshop(
    user: SessionUserSnapshot,
    workshop: {
      id: number;
      workshopCode: string;
      workshopName: string;
    },
  ): SessionUserSnapshot {
    const workshopScope = {
      mode: "FIXED" as const,
      workshopId: workshop.id,
      workshopCode: workshop.workshopCode,
      workshopName: workshop.workshopName,
    };

    return {
      ...user,
      stockScope: toSessionStockScopeSnapshotFromWorkshopScope(workshopScope),
      workshopScope,
    };
  }

  private filterRoutesByPermissions(
    routes: RouteNode[],
    permissions: string[],
  ): RouteNode[] {
    return routes.reduce<RouteNode[]>((result, route) => {
      const children = route.children
        ? this.filterRoutesByPermissions(route.children, permissions)
        : undefined;
      const hasOwnPermission =
        route.permissions.length === 0
          ? !route.children || route.children.length === 0
          : route.permissions.some((permission) =>
              permissions.includes(permission),
            );

      if (!hasOwnPermission && (!children || children.length === 0)) {
        return result;
      }

      result.push({
        ...route,
        ...(children ? { children } : {}),
      });
      return result;
    }, []);
  }

  private expandPermissionAliases(permissions: string[]): string[] {
    const expanded = new Set(permissions.filter(Boolean));
    const queue = [...expanded];

    while (queue.length > 0) {
      const permission = queue.shift();
      if (!permission) {
        continue;
      }

      const aliases = PERMISSION_ALIAS_MAP[permission] ?? [];
      for (const alias of aliases) {
        if (expanded.has(alias)) {
          continue;
        }

        expanded.add(alias);
        queue.push(alias);
      }
    }

    return [...expanded];
  }

  private filterRoutesByConsoleMode(
    routes: RouteNode[],
    consoleMode: SessionUserSnapshot["consoleMode"],
  ): RouteNode[] {
    if (consoleMode !== "rd-subwarehouse") {
      return routes;
    }

    return routes.filter((route) => route.name === "RdSubwarehouse");
  }
}
