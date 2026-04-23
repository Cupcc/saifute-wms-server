import { Injectable, Optional } from "@nestjs/common";
import type { Prisma } from "../../../../generated/prisma/client";
import { PrismaService } from "../../../shared/prisma/prisma.service";
import type {
  SessionConsoleMode,
  SessionStockScopeSnapshot,
  SessionWorkshopScopeSnapshot,
} from "../../session/domain/user-session";
import { RbacState } from "./rbac-state";

@Injectable()
export class RbacPersistenceRepository {
  private persistenceQueue: Promise<void> = Promise.resolve();

  constructor(
    private readonly state: RbacState,
    @Optional() private readonly prisma?: PrismaService,
  ) {}

  hasPersistenceAdapter(): boolean {
    return Boolean(this.prisma);
  }

  async flushPersistence(): Promise<void> {
    await this.persistenceQueue;
  }

  queuePersistence(): void {
    if (!this.prisma) {
      return;
    }

    const persistOperation = async () => {
      await this.persistState();
    };
    this.persistenceQueue = this.persistenceQueue.then(
      persistOperation,
      persistOperation,
    );
  }

  async getNormalizedBaseCounts(): Promise<{
    depts: number;
    posts: number;
    menus: number;
    roles: number;
    users: number;
    dictTypes: number;
    dictData: number;
    configs: number;
    notices: number;
  }> {
    if (!this.prisma) {
      return {
        depts: 0,
        posts: 0,
        menus: 0,
        roles: 0,
        users: 0,
        dictTypes: 0,
        dictData: 0,
        configs: 0,
        notices: 0,
      };
    }

    const [
      depts,
      posts,
      menus,
      roles,
      users,
      dictTypes,
      dictData,
      configs,
      notices,
    ] = await Promise.all([
      this.prisma.sysDept.count(),
      this.prisma.sysPost.count(),
      this.prisma.sysMenu.count(),
      this.prisma.sysRole.count(),
      this.prisma.sysUser.count(),
      this.prisma.sysDictType.count(),
      this.prisma.sysDictData.count(),
      this.prisma.sysConfig.count(),
      this.prisma.sysNotice.count(),
    ]);

    return {
      depts,
      posts,
      menus,
      roles,
      users,
      dictTypes,
      dictData,
      configs,
      notices,
    };
  }

  async loadFromNormalizedTables(): Promise<void> {
    if (!this.prisma) {
      return;
    }

    const [
      dbDepts,
      dbPosts,
      dbMenus,
      dbRoles,
      dbDictTypes,
      dbDictData,
      dbConfigs,
      dbNotices,
      dbUsers,
      dbUserRoles,
      dbUserPosts,
      dbRoleMenus,
      dbRoleDepts,
    ] = await Promise.all([
      this.prisma.sysDept.findMany(),
      this.prisma.sysPost.findMany(),
      this.prisma.sysMenu.findMany(),
      this.prisma.sysRole.findMany(),
      this.prisma.sysDictType.findMany(),
      this.prisma.sysDictData.findMany(),
      this.prisma.sysConfig.findMany(),
      this.prisma.sysNotice.findMany(),
      this.prisma.sysUser.findMany(),
      this.prisma.sysUserRole.findMany(),
      this.prisma.sysUserPost.findMany(),
      this.prisma.sysRoleMenu.findMany(),
      this.prisma.sysRoleDept.findMany(),
    ]);

    this.state.depts = dbDepts.map((d) => ({
      deptId: d.deptId,
      parentId: d.parentId,
      ancestors: d.ancestors,
      deptName: d.deptName,
      orderNum: d.orderNum,
      leader: d.leader,
      phone: d.phone,
      email: d.email,
      status: d.status as "0" | "1",
      createdAt: d.createdAt.toISOString(),
    }));

    this.state.posts = dbPosts.map((p) => ({
      postId: p.postId,
      postCode: p.postCode,
      postName: p.postName,
      postSort: p.postSort,
      status: p.status as "0" | "1",
      remark: p.remark,
      createdAt: p.createdAt.toISOString(),
    }));

    this.state.menus = dbMenus.map((m) => ({
      menuId: m.menuId,
      parentId: m.parentId,
      menuName: m.menuName,
      orderNum: m.orderNum,
      path: m.path,
      component: m.component,
      routeName: m.routeName,
      menuType: m.menuType as "M" | "C" | "F",
      visible: m.visible as "0" | "1",
      status: m.status as "0" | "1",
      perms: m.perms,
      icon: m.icon,
      query: m.query,
      isFrame: m.isFrame as "0" | "1",
      isCache: m.isCache as "0" | "1",
    }));

    this.state.roles = dbRoles.map((r) => ({
      roleId: r.roleId,
      roleName: r.roleName,
      roleKey: r.roleKey,
      roleSort: r.roleSort,
      status: r.status as "0" | "1",
      dataScope: r.dataScope,
      menuCheckStrictly: r.menuCheckStrictly,
      deptCheckStrictly: r.deptCheckStrictly,
      menuIds: dbRoleMenus
        .filter((rm) => rm.roleId === r.roleId)
        .map((rm) => rm.menuId),
      deptIds: dbRoleDepts
        .filter((rd) => rd.roleId === r.roleId)
        .map((rd) => rd.deptId),
      remark: r.remark,
      createdAt: r.createdAt.toISOString(),
    }));

    this.state.dictTypes = dbDictTypes.map((dt) => ({
      dictId: dt.dictId,
      dictName: dt.dictName,
      dictType: dt.dictType,
      status: dt.status as "0" | "1",
      remark: dt.remark,
      createdAt: dt.createdAt.toISOString(),
    }));

    this.state.dictData = dbDictData.map((dd) => ({
      dictCode: dd.dictCode,
      dictSort: dd.dictSort,
      dictLabel: dd.dictLabel,
      dictValue: dd.dictValue,
      dictType: dd.dictType,
      cssClass: dd.cssClass,
      listClass: dd.listClass,
      isDefault: dd.isDefault as "Y" | "N",
      status: dd.status as "0" | "1",
      remark: dd.remark,
      createdAt: dd.createdAt.toISOString(),
    }));

    this.state.configs = dbConfigs.map((c) => ({
      configId: c.configId,
      configName: c.configName,
      configKey: c.configKey,
      configValue: c.configValue,
      configType: c.configType as "Y" | "N",
      remark: c.remark,
      createdAt: c.createdAt.toISOString(),
    }));

    this.state.notices = dbNotices.map((n) => ({
      noticeId: n.noticeId,
      noticeTitle: n.noticeTitle,
      noticeType: n.noticeType as "1" | "2",
      noticeContent: n.noticeContent,
      status: n.status as "0" | "1",
      remark: n.remark,
      createdAt: n.createdAt.toISOString(),
    }));

    this.state.users = dbUsers.map((u) => ({
      userId: u.userId,
      deptId: u.deptId,
      userName: u.userName,
      nickName: u.nickName,
      avatarUrl: u.avatarUrl,
      email: u.email,
      phonenumber: u.phonenumber,
      sex: u.sex as "0" | "1" | "2",
      status: u.status as "0" | "1",
      deleted: u.deleted,
      remark: u.remark,
      createdAt: u.createdAt.toISOString(),
      postIds: dbUserPosts
        .filter((up) => up.userId === u.userId)
        .map((up) => up.postId),
      roleIds: dbUserRoles
        .filter((ur) => ur.userId === u.userId)
        .map((ur) => ur.roleId),
      passwordHash: u.passwordHash,
      consoleMode: (u.consoleMode ?? "default") as SessionConsoleMode,
      stockScope: (u.stockScope as unknown as SessionStockScopeSnapshot) ?? {
        mode: "ALL",
        stockScope: null,
        stockScopeName: null,
      },
      workshopScope:
        (u.workshopScope as unknown as SessionWorkshopScopeSnapshot) ?? {
          mode: "ALL",
          workshopId: null,
          workshopName: null,
        },
      extraPermissions: (u.extraPermissions as unknown as string[]) ?? [],
    }));
  }

  async persistState(): Promise<void> {
    if (!this.prisma) {
      return;
    }

    const now = new Date();
    await this.prisma.$transaction(async (tx) => {
      await tx.sysUserRole.deleteMany();
      await tx.sysUserPost.deleteMany();
      await tx.sysRoleMenu.deleteMany();
      await tx.sysRoleDept.deleteMany();
      await tx.sysUser.deleteMany();
      await tx.sysRole.deleteMany();
      await tx.sysMenu.deleteMany();
      await tx.sysDept.deleteMany();
      await tx.sysPost.deleteMany();
      await tx.sysDictType.deleteMany();
      await tx.sysDictData.deleteMany();
      await tx.sysConfig.deleteMany();
      await tx.sysNotice.deleteMany();

      if (this.state.depts.length) {
        await tx.sysDept.createMany({
          data: this.state.depts.map((d) => ({
            deptId: d.deptId,
            parentId: d.parentId,
            ancestors: d.ancestors,
            deptName: d.deptName,
            orderNum: d.orderNum,
            leader: d.leader,
            phone: d.phone,
            email: d.email,
            status: d.status,
            createdAt: new Date(d.createdAt),
            updatedAt: now,
          })),
        });
      }

      if (this.state.posts.length) {
        await tx.sysPost.createMany({
          data: this.state.posts.map((p) => ({
            postId: p.postId,
            postCode: p.postCode,
            postName: p.postName,
            postSort: p.postSort,
            status: p.status,
            remark: p.remark,
            createdAt: new Date(p.createdAt),
            updatedAt: now,
          })),
        });
      }

      if (this.state.menus.length) {
        await tx.sysMenu.createMany({
          data: this.state.menus.map((m) => ({
            menuId: m.menuId,
            parentId: m.parentId,
            menuName: m.menuName,
            orderNum: m.orderNum,
            path: m.path,
            component: m.component,
            routeName: m.routeName,
            menuType: m.menuType,
            visible: m.visible,
            status: m.status,
            perms: m.perms,
            icon: m.icon,
            query: m.query,
            isFrame: m.isFrame,
            isCache: m.isCache,
            updatedAt: now,
          })),
        });
      }

      if (this.state.roles.length) {
        await tx.sysRole.createMany({
          data: this.state.roles.map((r) => ({
            roleId: r.roleId,
            roleName: r.roleName,
            roleKey: r.roleKey,
            roleSort: r.roleSort,
            status: r.status,
            dataScope: r.dataScope,
            menuCheckStrictly: r.menuCheckStrictly,
            deptCheckStrictly: r.deptCheckStrictly,
            remark: r.remark,
            createdAt: new Date(r.createdAt),
            updatedAt: now,
          })),
        });
      }

      if (this.state.dictTypes.length) {
        await tx.sysDictType.createMany({
          data: this.state.dictTypes.map((dt) => ({
            dictId: dt.dictId,
            dictName: dt.dictName,
            dictType: dt.dictType,
            status: dt.status,
            remark: dt.remark,
            createdAt: new Date(dt.createdAt),
            updatedAt: now,
          })),
        });
      }

      if (this.state.dictData.length) {
        await tx.sysDictData.createMany({
          data: this.state.dictData.map((dd) => ({
            dictCode: dd.dictCode,
            dictSort: dd.dictSort,
            dictLabel: dd.dictLabel,
            dictValue: dd.dictValue,
            dictType: dd.dictType,
            cssClass: dd.cssClass,
            listClass: dd.listClass,
            isDefault: dd.isDefault,
            status: dd.status,
            remark: dd.remark,
            createdAt: new Date(dd.createdAt),
            updatedAt: now,
          })),
        });
      }

      if (this.state.configs.length) {
        await tx.sysConfig.createMany({
          data: this.state.configs.map((c) => ({
            configId: c.configId,
            configName: c.configName,
            configKey: c.configKey,
            configValue: c.configValue,
            configType: c.configType,
            remark: c.remark,
            createdAt: new Date(c.createdAt),
            updatedAt: now,
          })),
        });
      }

      if (this.state.notices.length) {
        await tx.sysNotice.createMany({
          data: this.state.notices.map((n) => ({
            noticeId: n.noticeId,
            noticeTitle: n.noticeTitle,
            noticeType: n.noticeType,
            noticeContent: n.noticeContent,
            status: n.status,
            remark: n.remark,
            createdAt: new Date(n.createdAt),
            updatedAt: now,
          })),
        });
      }

      if (this.state.users.length) {
        await tx.sysUser.createMany({
          data: this.state.users.map((u) => ({
            userId: u.userId,
            deptId: u.deptId,
            userName: u.userName,
            nickName: u.nickName,
            avatarUrl: u.avatarUrl,
            email: u.email,
            phonenumber: u.phonenumber,
            sex: u.sex,
            status: u.status,
            deleted: u.deleted,
            remark: u.remark,
            passwordHash: u.passwordHash,
            consoleMode: u.consoleMode,
            stockScope: u.stockScope as unknown as Prisma.InputJsonValue,
            workshopScope: u.workshopScope as unknown as Prisma.InputJsonValue,
            extraPermissions:
              u.extraPermissions as unknown as Prisma.InputJsonValue,
            createdAt: new Date(u.createdAt),
            updatedAt: now,
          })),
        });
      }

      const userRoleData = this.state.users.flatMap((u) =>
        u.roleIds.map((roleId) => ({ userId: u.userId, roleId })),
      );
      if (userRoleData.length) {
        await tx.sysUserRole.createMany({ data: userRoleData });
      }

      const userPostData = this.state.users.flatMap((u) =>
        u.postIds.map((postId) => ({ userId: u.userId, postId })),
      );
      if (userPostData.length) {
        await tx.sysUserPost.createMany({ data: userPostData });
      }

      const roleMenuData = this.state.roles.flatMap((r) =>
        r.menuIds.map((menuId) => ({ roleId: r.roleId, menuId })),
      );
      if (roleMenuData.length) {
        await tx.sysRoleMenu.createMany({ data: roleMenuData });
      }

      const roleDeptData = this.state.roles.flatMap((r) =>
        r.deptIds.map((deptId) => ({ roleId: r.roleId, deptId })),
      );
      if (roleDeptData.length) {
        await tx.sysRoleDept.createMany({ data: roleDeptData });
      }
    });
  }
}
