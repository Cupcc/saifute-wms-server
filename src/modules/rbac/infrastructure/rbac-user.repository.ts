import { Injectable } from "@nestjs/common";
import {
  compareHash,
  hashText,
} from "../../../shared/common/security/hash.util";
import type {
  ManagedUserRecord,
  RbacUserRecord,
} from "../domain/rbac.types";
import { RbacState } from "./rbac-state";

@Injectable()
export class RbacUserRepository {
  constructor(private readonly state: RbacState) {}

  async findUserByUsername(username: string): Promise<RbacUserRecord | null> {
    const user = this.state.users.find((item) => item.userName === username);
    return user ? this.buildRbacUserRecord(user) : null;
  }

  async findUserById(userId: number): Promise<RbacUserRecord | null> {
    const user = this.state.users.find((item) => item.userId === userId);
    return user ? this.buildRbacUserRecord(user) : null;
  }

  async updateUserAvatar(
    userId: number,
    avatarUrl: string | null,
  ): Promise<{
    user: RbacUserRecord;
    previousAvatarUrl: string | null;
  }> {
    const user = this.state.users.find((item) => item.userId === userId);
    if (!user) {
      throw new Error(`User not found: ${userId}`);
    }

    const previousAvatarUrl = user.avatarUrl ?? null;
    user.avatarUrl = avatarUrl;

    return {
      user: this.buildRbacUserRecord(user),
      previousAvatarUrl,
    };
  }

  verifyPassword(rawPassword: string, passwordHash: string): boolean {
    return compareHash(rawPassword, passwordHash);
  }

  listUsers(query: Record<string, string | undefined>) {
    const deptId = this.state.toNumber(query.deptId);
    const rows = this.state.users
      .filter((user) => !user.deleted)
      .filter((user) => {
        if (query.userName && !user.userName.includes(query.userName)) {
          return false;
        }
        if (
          query.phonenumber &&
          !user.phonenumber.includes(query.phonenumber)
        ) {
          return false;
        }
        if (query.status && user.status !== query.status) {
          return false;
        }
        if (deptId !== null && !this.belongsToDept(user, deptId)) {
          return false;
        }
        return true;
      })
      .sort((left, right) => left.userId - right.userId)
      .map((user) => this.toUserRow(user));

    return this.state.paginate(rows, query);
  }

  getUserForm(userId: number | null) {
    return {
      data: userId ? this.toUserForm(this.requireUser(userId)) : undefined,
      posts: this.state.posts.map((post) => structuredClone(post)),
      roles: this.state.roles.map((role) => structuredClone(role)),
      postIds: userId ? [...this.requireUser(userId).postIds] : [],
      roleIds: userId ? [...this.requireUser(userId).roleIds] : [],
    };
  }

  createUser(data: Record<string, unknown>) {
    const userName = String(data.userName ?? "").trim();
    if (!userName) {
      throw new Error("用户名不能为空");
    }
    if (
      this.state.users.some((item) => !item.deleted && item.userName === userName)
    ) {
      throw new Error("用户名称已存在");
    }

    const user: ManagedUserRecord = {
      userId: this.state.nextId(this.state.users, "userId"),
      deptId: this.state.toNumber(data.deptId),
      userName,
      nickName: String(data.nickName ?? "").trim(),
      avatarUrl: null,
      email: String(data.email ?? "").trim(),
      phonenumber: String(data.phonenumber ?? "").trim(),
      sex: this.state.normalizeSex(data.sex),
      status: this.state.normalizeStatus(data.status),
      deleted: false,
      remark: String(data.remark ?? ""),
      createdAt: new Date().toISOString(),
      postIds: this.state.normalizeNumberList(data.postIds),
      roleIds: this.state.normalizeNumberList(data.roleIds),
      passwordHash: hashText(String(data.password ?? "ChangeMe123")),
      consoleMode: "default",
      stockScope: {
        mode: "ALL",
        stockScope: null,
        stockScopeName: null,
      },
      workshopScope: {
        mode: "ALL",
        workshopId: null,
        workshopName: null,
      },
      extraPermissions: [],
    };
    this.state.users.push(user);
    return this.toUserRow(user);
  }

  updateUser(data: Record<string, unknown>) {
    const userId = this.state.requireNumber(data.userId);
    const user = this.requireUser(userId);
    const nextUserName = String(data.userName ?? user.userName).trim();
    const conflict = this.state.users.find(
      (item) =>
        item.userId !== userId &&
        !item.deleted &&
        item.userName === nextUserName,
    );
    if (conflict) {
      throw new Error("用户名称已存在");
    }

    user.deptId = this.state.toNumber(data.deptId);
    user.userName = nextUserName;
    user.nickName = String(data.nickName ?? user.nickName).trim();
    user.email = String(data.email ?? user.email).trim();
    user.phonenumber = String(data.phonenumber ?? user.phonenumber).trim();
    user.sex = this.state.normalizeSex(data.sex ?? user.sex);
    user.status = this.state.normalizeStatus(data.status ?? user.status);
    user.remark = String(data.remark ?? user.remark);
    user.postIds = this.state.normalizeNumberList(data.postIds);
    user.roleIds = this.state.normalizeNumberList(data.roleIds);
    return this.toUserRow(user);
  }

  deleteUsers(userIds: number[]) {
    userIds.forEach((userId) => {
      if (userId === 1) {
        return;
      }
      const user = this.state.users.find((item) => item.userId === userId);
      if (user) {
        user.deleted = true;
      }
    });
  }

  resetUserPassword(userId: number, password: string) {
    const user = this.requireUser(userId);
    user.passwordHash = hashText(password);
  }

  changeUserStatus(userId: number, status: "0" | "1") {
    const user = this.requireUser(userId);
    user.status = status;
  }

  getCurrentUserProfile(userId: number) {
    const user = this.requireUser(userId);
    return {
      data: {
        ...this.toUserRow(user),
        dept: user.deptId ? this.toDeptReference(user.deptId) : null,
      },
      roleGroup: this.getRoleKeys(user.roleIds)
        .map(
          (roleKey) =>
            this.state.roles.find((role) => role.roleKey === roleKey)?.roleName,
        )
        .filter(Boolean)
        .join(" / "),
      postGroup: this.state.posts
        .filter((post) => user.postIds.includes(post.postId))
        .map((post) => post.postName)
        .join(" / "),
    };
  }

  updateCurrentUserProfile(
    userId: number,
    data: Pick<ManagedUserRecord, "nickName" | "phonenumber" | "email" | "sex">,
  ) {
    const user = this.requireUser(userId);
    user.nickName = String(data.nickName ?? user.nickName).trim();
    user.phonenumber = String(data.phonenumber ?? user.phonenumber).trim();
    user.email = String(data.email ?? user.email).trim();
    user.sex = this.state.normalizeSex(data.sex ?? user.sex);
    return this.toUserRow(user);
  }

  updateCurrentUserPassword(
    userId: number,
    oldPassword: string,
    newPassword: string,
  ) {
    const user = this.requireUser(userId);
    if (!compareHash(oldPassword, user.passwordHash)) {
      throw new Error("旧密码错误");
    }
    user.passwordHash = hashText(newPassword);
  }

  getAuthRole(userId: number) {
    const user = this.requireUser(userId);
    return {
      user: {
        userId: user.userId,
        userName: user.userName,
        nickName: user.nickName,
      },
      roles: this.state.roles.map((role) => ({
        ...structuredClone(role),
        flag: user.roleIds.includes(role.roleId),
      })),
    };
  }

  updateUserRoles(userId: number, roleIds: number[]) {
    const user = this.requireUser(userId);
    user.roleIds = [...new Set(roleIds)];
  }

  findUserIdsByRoleIds(roleIds: number[]) {
    const roleIdSet = new Set(roleIds);
    return this.state.users
      .filter(
        (user) =>
          !user.deleted && user.roleIds.some((roleId) => roleIdSet.has(roleId)),
      )
      .map((user) => user.userId);
  }

  listAllocatedUsers(query: Record<string, string | undefined>) {
    const roleId = this.state.requireNumber(query.roleId);
    const rows = this.state.users
      .filter((user) => !user.deleted && user.roleIds.includes(roleId))
      .filter((user) => this.matchesUserQuery(user, query))
      .map((user) => this.toUserRow(user));
    return this.state.paginate(rows, query);
  }

  listUnallocatedUsers(query: Record<string, string | undefined>) {
    const roleId = this.state.requireNumber(query.roleId);
    const rows = this.state.users
      .filter((user) => !user.deleted && !user.roleIds.includes(roleId))
      .filter((user) => this.matchesUserQuery(user, query))
      .map((user) => this.toUserRow(user));
    return this.state.paginate(rows, query);
  }

  cancelAuthUsers(roleId: number, userIds: number[]) {
    userIds.forEach((userId) => {
      const user = this.requireUser(userId);
      user.roleIds = user.roleIds.filter((item) => item !== roleId);
    });
  }

  assignUsersToRole(roleId: number, userIds: number[]) {
    userIds.forEach((userId) => {
      const user = this.requireUser(userId);
      if (!user.roleIds.includes(roleId)) {
        user.roleIds.push(roleId);
      }
    });
  }

  private buildRbacUserRecord(user: ManagedUserRecord): RbacUserRecord {
    return {
      userId: user.userId,
      username: user.userName,
      displayName: user.nickName,
      avatarUrl: user.avatarUrl,
      roles: this.getRoleKeys(user.roleIds),
      permissions: this.getUserPermissions(user),
      department: user.deptId
        ? this.toSessionDepartmentReference(user.deptId)
        : null,
      consoleMode: user.consoleMode,
      stockScope: structuredClone(user.stockScope),
      workshopScope: structuredClone(user.workshopScope),
      passwordHash: user.passwordHash,
      status: user.status === "0" ? "active" : "disabled",
      deleted: user.deleted,
    };
  }

  private getRoleKeys(roleIds: number[]) {
    return roleIds
      .map(
        (roleId) => this.state.roles.find((role) => role.roleId === roleId)?.roleKey,
      )
      .filter((roleKey): roleKey is string => Boolean(roleKey));
  }

  private getUserPermissions(user: ManagedUserRecord) {
    if (user.userId === 1) {
      return [
        ...new Set([
          ...this.state.menus
            .map((menu) => menu.perms)
            .filter((permission): permission is string => Boolean(permission)),
          ...user.extraPermissions,
        ]),
      ];
    }

    const rolePermissions = user.roleIds.flatMap((roleId) => {
      const role = this.state.roles.find((item) => item.roleId === roleId);
      if (!role) {
        return [];
      }
      return role.menuIds
        .map(
          (menuId) => this.state.menus.find((menu) => menu.menuId === menuId)?.perms,
        )
        .filter((permission): permission is string => Boolean(permission));
    });

    return [...new Set([...user.extraPermissions, ...rolePermissions])];
  }

  private requireUser(userId: number) {
    const user = this.state.users.find(
      (item) => item.userId === userId && !item.deleted,
    );
    if (!user) {
      throw new Error(`用户不存在: ${userId}`);
    }
    return user;
  }

  private toUserRow(user: ManagedUserRecord) {
    return {
      userId: user.userId,
      deptId: user.deptId,
      userName: user.userName,
      nickName: user.nickName,
      email: user.email,
      phonenumber: user.phonenumber,
      sex: user.sex,
      status: user.status,
      createdAt: user.createdAt,
      remark: user.remark,
      dept: user.deptId ? this.toDeptReference(user.deptId) : null,
      postIds: [...user.postIds],
      roleIds: [...user.roleIds],
    };
  }

  private toUserForm(user: ManagedUserRecord) {
    return {
      ...this.toUserRow(user),
      avatarUrl: user.avatarUrl,
      consoleMode: user.consoleMode,
      stockScope: structuredClone(user.stockScope),
      workshopScope: structuredClone(user.workshopScope),
    };
  }

  private toDeptReference(deptId: number) {
    const dept = this.state.depts.find((item) => item.deptId === deptId);
    if (!dept) {
      throw new Error(`部门不存在: ${deptId}`);
    }
    return {
      deptId: dept.deptId,
      deptName: dept.deptName,
    };
  }

  private toSessionDepartmentReference(deptId: number) {
    const dept = this.state.depts.find((item) => item.deptId === deptId);
    if (!dept) {
      throw new Error(`部门不存在: ${deptId}`);
    }
    return {
      departmentId: dept.deptId,
      departmentName: dept.deptName,
    };
  }

  private matchesUserQuery(
    user: ManagedUserRecord,
    query: Record<string, string | undefined>,
  ) {
    if (query.userName && !user.userName.includes(query.userName)) {
      return false;
    }
    if (query.phonenumber && !user.phonenumber.includes(query.phonenumber)) {
      return false;
    }
    return true;
  }

  private belongsToDept(user: ManagedUserRecord, deptId: number) {
    if (user.deptId === null) {
      return false;
    }
    if (user.deptId === deptId) {
      return true;
    }
    const descendants = this.state.getDeptAndDescendants(deptId);
    return descendants.includes(user.deptId);
  }
}
