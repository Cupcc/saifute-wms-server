import { Injectable, UnauthorizedException } from "@nestjs/common";
import type { SessionUserSnapshot } from "../../session/domain/user-session";
import type { RbacUserRecord, RouteNode } from "../domain/rbac.types";
import { InMemoryRbacRepository } from "../infrastructure/in-memory-rbac.repository";

@Injectable()
export class RbacService {
  constructor(
    private readonly inMemoryRbacRepository: InMemoryRbacRepository,
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
    return {
      userId: user.userId,
      username: user.username,
      displayName: user.displayName,
      roles: [...user.roles],
      permissions: [...user.permissions],
      department: user.department ? { ...user.department } : null,
    };
  }

  async getCurrentUser(userId: number): Promise<SessionUserSnapshot> {
    const user = await this.inMemoryRbacRepository.findUserById(userId);
    if (!user) {
      throw new UnauthorizedException("当前用户不存在");
    }

    return this.toSessionUser(user);
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

    return this.filterRoutesByPermissions(allRoutes, user.permissions);
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
}
