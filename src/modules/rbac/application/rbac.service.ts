import { Injectable, UnauthorizedException } from "@nestjs/common";
import { MasterDataService } from "../../master-data/application/master-data.service";
import {
  createAllSessionStockScope,
  createAllSessionWorkshopScope,
  type SessionUserSnapshot,
} from "../../session/domain/user-session";
import type { RbacUserRecord, RouteNode } from "../domain/rbac.types";
import { InMemoryRbacRepository } from "../infrastructure/in-memory-rbac.repository";

const DOCUMENT_PERMISSION_ACTIONS = [
  "status",
  "list",
  "create",
  "approve",
  "reject",
  "reset",
] as const;

const DOCUMENT_PERMISSION_NAMESPACES = ["approval:document"] as const;

const PERMISSION_ALIAS_MAP = Object.fromEntries(
  DOCUMENT_PERMISSION_NAMESPACES.flatMap((namespace) =>
    DOCUMENT_PERMISSION_ACTIONS.map((action) => {
      const key = `${namespace}:${action}`;
      const aliases = DOCUMENT_PERMISSION_NAMESPACES.filter(
        (candidate) => candidate !== namespace,
      ).map((candidate) => `${candidate}:${action}`);

      return [key, aliases];
    }),
  ),
) as Record<string, string[]>;

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
    const stockScope = user.stockScope
      ? { ...user.stockScope }
      : createAllSessionStockScope();
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
      stockScope,
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
      user.stockScope ?? createAllSessionStockScope();

    const resolvedWorkshopScope = await this.resolveWorkshopScopeByName(
      normalizedWorkshopScope,
    );
    const resolvedStockScope =
      await this.resolveStockScopeByCode(normalizedStockScope);

    return {
      ...user,
      stockScope: resolvedStockScope,
      workshopScope: resolvedWorkshopScope,
    };
  }

  private async resolveWorkshopScopeByName(
    scope: SessionUserSnapshot["workshopScope"],
  ) {
    if (
      !scope ||
      scope.mode !== "FIXED" ||
      scope.workshopId ||
      !scope.workshopName
    ) {
      return scope ?? createAllSessionWorkshopScope();
    }

    try {
      const workshop = await this.masterDataService.getWorkshopByName(
        scope.workshopName,
      );
      return {
        mode: "FIXED" as const,
        workshopId: workshop.id,
        workshopName: workshop.workshopName,
      };
    } catch {
      return scope;
    }
  }

  private async resolveStockScopeByCode(
    scope: SessionUserSnapshot["stockScope"],
  ) {
    if (!scope || scope.mode !== "FIXED" || !scope.stockScope) {
      return scope ?? createAllSessionStockScope();
    }

    try {
      const stockScope = await this.masterDataService.getStockScopeByCode(
        scope.stockScope,
      );
      return {
        mode: "FIXED" as const,
        stockScope: stockScope.scopeCode as typeof scope.stockScope,
        stockScopeName: stockScope.scopeName,
      };
    } catch {
      return scope;
    }
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
