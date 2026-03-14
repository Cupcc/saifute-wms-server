import { Injectable } from "@nestjs/common";
import {
  compareHash,
  hashText,
} from "../../../shared/common/security/hash.util";
import type { RbacUserRecord, RouteNode } from "../domain/rbac.types";

@Injectable()
export class InMemoryRbacRepository {
  private readonly users: RbacUserRecord[] = [
    {
      userId: 1,
      username: "admin",
      displayName: "系统管理员",
      roles: ["admin"],
      department: {
        departmentId: 100,
        departmentName: "系统管理部",
      },
      permissions: [
        "dashboard:view",
        "monitor:online:list",
        "monitor:online:forceLogout",
      ],
      passwordHash: hashText("admin123"),
      status: "active",
      deleted: false,
    },
    {
      userId: 2,
      username: "operator",
      displayName: "仓库操作员",
      roles: ["operator"],
      department: {
        departmentId: 200,
        departmentName: "仓储作业部",
      },
      permissions: ["dashboard:view"],
      passwordHash: hashText("operator123"),
      status: "active",
      deleted: false,
    },
    {
      userId: 3,
      username: "disabled-user",
      displayName: "停用用户",
      roles: ["operator"],
      department: {
        departmentId: 200,
        departmentName: "仓储作业部",
      },
      permissions: ["dashboard:view"],
      passwordHash: hashText("disabled123"),
      status: "disabled",
      deleted: false,
    },
  ];

  private readonly routes: RouteNode[] = [
    {
      name: "Dashboard",
      path: "/dashboard",
      component: "dashboard/index",
      permissions: ["dashboard:view"],
    },
    {
      name: "System",
      path: "/system",
      component: "layout/index",
      permissions: [],
      children: [
        {
          name: "OnlineUsers",
          path: "/system/online",
          component: "monitor/online/index",
          permissions: ["monitor:online:list"],
        },
      ],
    },
  ];

  async findUserByUsername(username: string): Promise<RbacUserRecord | null> {
    return this.users.find((user) => user.username === username) ?? null;
  }

  async findUserById(userId: number): Promise<RbacUserRecord | null> {
    return this.users.find((user) => user.userId === userId) ?? null;
  }

  async getRoutes(): Promise<RouteNode[]> {
    return structuredClone(this.routes);
  }

  verifyPassword(rawPassword: string, passwordHash: string): boolean {
    return compareHash(rawPassword, passwordHash);
  }
}
