import { Injectable } from "@nestjs/common";
import type {
  ManagedDeptRecord,
  ManagedMenuRecord,
  ManagedPostRecord,
  ManagedRoleRecord,
} from "../domain/rbac.types";
import { RbacState } from "./rbac-state";

@Injectable()
export class RbacResourceRepository {
  constructor(private readonly state: RbacState) {}

  listRoles(query: Record<string, string | undefined>) {
    const rows = this.state.roles
      .filter((role) => {
        if (query.roleName && !role.roleName.includes(query.roleName)) {
          return false;
        }
        if (query.roleKey && !role.roleKey.includes(query.roleKey)) {
          return false;
        }
        if (query.status && role.status !== query.status) {
          return false;
        }
        return true;
      })
      .sort((left, right) => left.roleSort - right.roleSort)
      .map((role) => structuredClone(role));

    return this.state.paginate(rows, query);
  }

  getRole(roleId: number) {
    return structuredClone(this.requireRole(roleId));
  }

  createRole(data: Record<string, unknown>) {
    const role: ManagedRoleRecord = {
      roleId: this.state.nextId(this.state.roles, "roleId"),
      roleName: String(data.roleName ?? "").trim(),
      roleKey: String(data.roleKey ?? "").trim(),
      roleSort: this.state.requireNumber(data.roleSort),
      status: this.state.normalizeStatus(data.status),
      dataScope: this.state.normalizeDataScope(data.dataScope),
      menuCheckStrictly: Boolean(data.menuCheckStrictly ?? true),
      deptCheckStrictly: Boolean(data.deptCheckStrictly ?? true),
      menuIds: this.state.normalizeNumberList(data.menuIds),
      deptIds: this.state.normalizeNumberList(data.deptIds),
      remark: String(data.remark ?? ""),
      createdAt: new Date().toISOString(),
    };
    this.state.roles.push(role);
    return structuredClone(role);
  }

  updateRole(data: Record<string, unknown>) {
    const role = this.requireRole(this.state.requireNumber(data.roleId));
    role.roleName = String(data.roleName ?? role.roleName).trim();
    role.roleKey = String(data.roleKey ?? role.roleKey).trim();
    role.roleSort = this.state.requireNumber(data.roleSort ?? role.roleSort);
    role.status = this.state.normalizeStatus(data.status ?? role.status);
    role.dataScope = this.state.normalizeDataScope(data.dataScope ?? role.dataScope);
    role.menuCheckStrictly = Boolean(
      data.menuCheckStrictly ?? role.menuCheckStrictly,
    );
    role.deptCheckStrictly = Boolean(
      data.deptCheckStrictly ?? role.deptCheckStrictly,
    );
    role.menuIds = this.state.normalizeNumberList(data.menuIds ?? role.menuIds);
    role.deptIds = this.state.normalizeNumberList(data.deptIds ?? role.deptIds);
    role.remark = String(data.remark ?? role.remark);
    return structuredClone(role);
  }

  updateRoleDataScope(data: Record<string, unknown>) {
    const role = this.requireRole(this.state.requireNumber(data.roleId));
    role.dataScope = this.state.normalizeDataScope(data.dataScope ?? role.dataScope);
    role.deptIds = this.state.normalizeNumberList(data.deptIds ?? role.deptIds);
  }

  changeRoleStatus(roleId: number, status: "0" | "1") {
    const role = this.requireRole(roleId);
    role.status = status;
  }

  deleteRoles(roleIds: number[]) {
    roleIds.forEach((roleId) => {
      if (roleId === 1) {
        return;
      }
      const assignedUsers = this.state.users.filter(
        (user) => !user.deleted && user.roleIds.includes(roleId),
      );
      if (assignedUsers.length > 0) {
        throw new Error("角色已分配给用户，无法删除");
      }
      const index = this.state.roles.findIndex((item) => item.roleId === roleId);
      if (index >= 0) {
        this.state.roles.splice(index, 1);
      }
    });
  }

  getRoleMenuTree(roleId: number) {
    const role = this.requireRole(roleId);
    return {
      menus: this.state.toTreeSelect(this.state.menus, "menuId", "parentId", "menuName"),
      checkedKeys: [...role.menuIds],
    };
  }

  listMenus(query: Record<string, string | undefined>) {
    return this.state.menus
      .filter((menu) => {
        if (query.menuName && !menu.menuName.includes(query.menuName)) {
          return false;
        }
        if (query.status && menu.status !== query.status) {
          return false;
        }
        return true;
      })
      .sort((left, right) =>
        left.parentId === right.parentId
          ? left.orderNum - right.orderNum
          : left.parentId - right.parentId,
      )
      .map((menu) => structuredClone(menu));
  }

  getMenu(menuId: number) {
    return structuredClone(this.requireMenu(menuId));
  }

  getMenuTreeSelect() {
    return this.state.toTreeSelect(this.state.menus, "menuId", "parentId", "menuName");
  }

  createMenu(data: Record<string, unknown>) {
    const menu: ManagedMenuRecord = {
      menuId: this.state.nextId(this.state.menus, "menuId"),
      parentId: this.state.requireNumber(data.parentId ?? 0),
      menuName: String(data.menuName ?? "").trim(),
      orderNum: this.state.requireNumber(data.orderNum ?? 0),
      path: String(data.path ?? ""),
      component: String(data.component ?? ""),
      routeName: String(data.routeName ?? ""),
      menuType: this.state.normalizeMenuType(data.menuType),
      visible: this.state.normalizeStatus(data.visible),
      status: this.state.normalizeStatus(data.status),
      perms: String(data.perms ?? ""),
      icon: String(data.icon ?? ""),
      query: String(data.query ?? ""),
      isFrame: this.state.normalizeYesNoFlag(data.isFrame, "1"),
      isCache: this.state.normalizeYesNoFlag(data.isCache, "0"),
    };
    this.state.menus.push(menu);
    return structuredClone(menu);
  }

  updateMenu(data: Record<string, unknown>) {
    const menu = this.requireMenu(this.state.requireNumber(data.menuId));
    menu.parentId = this.state.requireNumber(data.parentId ?? menu.parentId);
    menu.menuName = String(data.menuName ?? menu.menuName).trim();
    menu.orderNum = this.state.requireNumber(data.orderNum ?? menu.orderNum);
    menu.path = String(data.path ?? menu.path);
    menu.component = String(data.component ?? menu.component);
    menu.routeName = String(data.routeName ?? menu.routeName);
    menu.menuType = this.state.normalizeMenuType(data.menuType ?? menu.menuType);
    menu.visible = this.state.normalizeStatus(data.visible ?? menu.visible);
    menu.status = this.state.normalizeStatus(data.status ?? menu.status);
    menu.perms = String(data.perms ?? menu.perms);
    menu.icon = String(data.icon ?? menu.icon);
    menu.query = String(data.query ?? menu.query);
    menu.isFrame = this.state.normalizeYesNoFlag(data.isFrame ?? menu.isFrame, "1");
    menu.isCache = this.state.normalizeYesNoFlag(data.isCache ?? menu.isCache, "0");
    return structuredClone(menu);
  }

  deleteMenus(menuIds: number[]) {
    menuIds.forEach((menuId) => {
      const hasChildren = this.state.menus.some((item) => item.parentId === menuId);
      if (hasChildren) {
        throw new Error("存在子菜单，不允许删除");
      }
      this.state.roles.forEach((role) => {
        role.menuIds = role.menuIds.filter((item) => item !== menuId);
      });
      const index = this.state.menus.findIndex((item) => item.menuId === menuId);
      if (index >= 0) {
        this.state.menus.splice(index, 1);
      }
    });
  }

  listDepts(query: Record<string, string | undefined>) {
    return this.state.depts
      .filter((dept) => {
        if (query.deptName && !dept.deptName.includes(query.deptName)) {
          return false;
        }
        if (query.status && dept.status !== query.status) {
          return false;
        }
        return true;
      })
      .sort((left, right) =>
        left.parentId === right.parentId
          ? left.orderNum - right.orderNum
          : left.parentId - right.parentId,
      )
      .map((dept) => structuredClone(dept));
  }

  listDeptExcludeChild(deptId: number) {
    const excluded = new Set(this.state.getDeptAndDescendants(deptId));
    return this.state.depts
      .filter((dept) => !excluded.has(dept.deptId))
      .map((dept) => structuredClone(dept));
  }

  getDept(deptId: number) {
    return structuredClone(this.requireDept(deptId));
  }

  createDept(data: Record<string, unknown>) {
    const parentId = this.state.requireNumber(data.parentId ?? 0);
    const parent = parentId === 0 ? null : this.requireDept(parentId);
    const dept: ManagedDeptRecord = {
      deptId: this.state.nextId(this.state.depts, "deptId"),
      parentId,
      ancestors: parent ? `${parent.ancestors},${parent.deptId}` : "0",
      deptName: String(data.deptName ?? "").trim(),
      orderNum: this.state.requireNumber(data.orderNum ?? 0),
      leader: String(data.leader ?? ""),
      phone: String(data.phone ?? ""),
      email: String(data.email ?? ""),
      status: this.state.normalizeStatus(data.status),
      createdAt: new Date().toISOString(),
    };
    this.state.depts.push(dept);
    return structuredClone(dept);
  }

  updateDept(data: Record<string, unknown>) {
    const dept = this.requireDept(this.state.requireNumber(data.deptId));
    const previousAncestors = dept.ancestors;
    dept.parentId = this.state.requireNumber(data.parentId ?? dept.parentId);
    dept.deptName = String(data.deptName ?? dept.deptName).trim();
    dept.orderNum = this.state.requireNumber(data.orderNum ?? dept.orderNum);
    dept.leader = String(data.leader ?? dept.leader);
    dept.phone = String(data.phone ?? dept.phone);
    dept.email = String(data.email ?? dept.email);
    dept.status = this.state.normalizeStatus(data.status ?? dept.status);
    const parent = dept.parentId === 0 ? null : this.requireDept(dept.parentId);
    const nextAncestors = parent ? `${parent.ancestors},${parent.deptId}` : "0";
    const previousSelfPath = `${previousAncestors},${dept.deptId}`;
    const nextSelfPath = `${nextAncestors},${dept.deptId}`;
    dept.ancestors = nextAncestors;

    this.state.depts.forEach((candidate) => {
      if (candidate.deptId === dept.deptId) {
        return;
      }
      if (
        candidate.ancestors === previousSelfPath ||
        candidate.ancestors.startsWith(`${previousSelfPath},`)
      ) {
        candidate.ancestors = candidate.ancestors.replace(
          previousSelfPath,
          nextSelfPath,
        );
      }
    });

    return structuredClone(dept);
  }

  deleteDepts(deptIds: number[]) {
    deptIds.forEach((deptId) => {
      const hasChildren = this.state.depts.some((item) => item.parentId === deptId);
      if (hasChildren) {
        throw new Error("存在下级部门，不允许删除");
      }
      const hasUsers = this.state.users.some(
        (user) => !user.deleted && user.deptId === deptId,
      );
      if (hasUsers) {
        throw new Error("部门下存在用户，不允许删除");
      }
      const index = this.state.depts.findIndex((item) => item.deptId === deptId);
      if (index >= 0) {
        this.state.depts.splice(index, 1);
      }
    });
  }

  getDeptTree(roleId?: number) {
    const checkedKeys = roleId ? [...this.requireRole(roleId).deptIds] : [];
    return {
      depts: this.state.toTreeSelect(this.state.depts, "deptId", "parentId", "deptName"),
      checkedKeys,
    };
  }

  getDeptTreeSelect() {
    return this.state.toTreeSelect(this.state.depts, "deptId", "parentId", "deptName", {
      disabledKey: "status",
      disabledValue: "1",
    });
  }

  listPosts(query: Record<string, string | undefined>) {
    const rows = this.state.posts
      .filter((post) => {
        if (query.postCode && !post.postCode.includes(query.postCode)) {
          return false;
        }
        if (query.postName && !post.postName.includes(query.postName)) {
          return false;
        }
        if (query.status && post.status !== query.status) {
          return false;
        }
        return true;
      })
      .sort((left, right) => left.postSort - right.postSort)
      .map((post) => structuredClone(post));
    return this.state.paginate(rows, query);
  }

  getPost(postId: number) {
    return structuredClone(this.requirePost(postId));
  }

  createPost(data: Record<string, unknown>) {
    const post: ManagedPostRecord = {
      postId: this.state.nextId(this.state.posts, "postId"),
      postCode: String(data.postCode ?? "").trim(),
      postName: String(data.postName ?? "").trim(),
      postSort: this.state.requireNumber(data.postSort ?? 0),
      status: this.state.normalizeStatus(data.status),
      remark: String(data.remark ?? ""),
      createdAt: new Date().toISOString(),
    };
    this.state.posts.push(post);
    return structuredClone(post);
  }

  updatePost(data: Record<string, unknown>) {
    const post = this.requirePost(this.state.requireNumber(data.postId));
    post.postCode = String(data.postCode ?? post.postCode).trim();
    post.postName = String(data.postName ?? post.postName).trim();
    post.postSort = this.state.requireNumber(data.postSort ?? post.postSort);
    post.status = this.state.normalizeStatus(data.status ?? post.status);
    post.remark = String(data.remark ?? post.remark);
    return structuredClone(post);
  }

  deletePosts(postIds: number[]) {
    postIds.forEach((postId) => {
      const used = this.state.users.some(
        (user) => !user.deleted && user.postIds.includes(postId),
      );
      if (used) {
        throw new Error("岗位已分配给用户，无法删除");
      }
      const index = this.state.posts.findIndex((item) => item.postId === postId);
      if (index >= 0) {
        this.state.posts.splice(index, 1);
      }
    });
  }

  private requireRole(roleId: number) {
    const role = this.state.roles.find((item) => item.roleId === roleId);
    if (!role) {
      throw new Error(`角色不存在: ${roleId}`);
    }
    return role;
  }

  private requireMenu(menuId: number) {
    const menu = this.state.menus.find((item) => item.menuId === menuId);
    if (!menu) {
      throw new Error(`菜单不存在: ${menuId}`);
    }
    return menu;
  }

  private requireDept(deptId: number) {
    const dept = this.state.depts.find((item) => item.deptId === deptId);
    if (!dept) {
      throw new Error(`部门不存在: ${deptId}`);
    }
    return dept;
  }

  private requirePost(postId: number) {
    const post = this.state.posts.find((item) => item.postId === postId);
    if (!post) {
      throw new Error(`岗位不存在: ${postId}`);
    }
    return post;
  }
}
