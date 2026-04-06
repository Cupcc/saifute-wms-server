import { Injectable, Optional } from "@nestjs/common";
import { createSystemManagementSeedState } from "../../../../prisma/system-management.seed";
import type { Prisma } from "../../../generated/prisma/client";
import {
  compareHash,
  hashText,
} from "../../../shared/common/security/hash.util";
import { PrismaService } from "../../../shared/prisma/prisma.service";
import type {
  SessionConsoleMode,
  SessionWorkshopScopeSnapshot,
} from "../../session/domain/user-session";
import type {
  ManagedConfigRecord,
  ManagedDeptRecord,
  ManagedDictDataRecord,
  ManagedDictTypeRecord,
  ManagedMenuRecord,
  ManagedNoticeRecord,
  ManagedPostRecord,
  ManagedRoleRecord,
  ManagedUserRecord,
  RbacUserRecord,
  RouteNode,
} from "../domain/rbac.types";

@Injectable()
export class InMemoryRbacRepository {
  private readonly routes: RouteNode[] = [
    {
      name: "Dashboard",
      path: "/dashboard",
      component: "dashboard/index",
      permissions: ["dashboard:view"],
    },
    {
      name: "SystemManagement",
      path: "/system",
      component: "layout/index",
      permissions: [],
      children: [
        {
          name: "SystemUser",
          path: "/system/user",
          component: "system/user/index",
          permissions: ["system:user:list"],
        },
        {
          name: "SystemRole",
          path: "/system/role",
          component: "system/role/index",
          permissions: ["system:role:list"],
        },
        {
          name: "SystemDept",
          path: "/system/dept",
          component: "system/dept/index",
          permissions: ["system:dept:list"],
        },
        {
          name: "SystemMenu",
          path: "/system/menu",
          component: "system/menu/index",
          permissions: ["system:menu:list"],
        },
        {
          name: "SystemPost",
          path: "/system/post",
          component: "system/post/index",
          permissions: ["system:post:list"],
        },
        {
          name: "SystemDict",
          path: "/system/dict",
          component: "system/dict/index",
          permissions: ["system:dict:list"],
        },
        {
          name: "SystemConfig",
          path: "/system/config",
          component: "system/config/index",
          permissions: ["system:config:list"],
        },
        {
          name: "SystemNotice",
          path: "/system/notice",
          component: "system/notice/index",
          permissions: ["system:notice:list"],
        },
      ],
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
        {
          name: "LoginLogs",
          path: "/system/logininfor",
          component: "monitor/logininfor/index",
          permissions: ["audit:login-log:list"],
        },
        {
          name: "OperLogs",
          path: "/system/operlog",
          component: "monitor/operlog/index",
          permissions: ["audit:oper-log:list"],
        },
        {
          name: "ReportingHome",
          path: "/system/reporting/home",
          component: "reporting/home/index",
          permissions: ["reporting:home:view"],
        },
        {
          name: "InventorySummary",
          path: "/system/reporting/inventory-summary",
          component: "reporting/inventory-summary/index",
          permissions: ["reporting:inventory-summary:view"],
        },
        {
          name: "MaterialCategorySummary",
          path: "/system/reporting/material-category-summary",
          component: "reporting/material-category-summary/index",
          permissions: ["reporting:material-category-summary:view"],
        },
        {
          name: "ReportingTrends",
          path: "/system/reporting/trends",
          component: "reporting/trends/index",
          permissions: ["reporting:trends:view"],
        },
        {
          name: "SchedulerJobs",
          path: "/system/scheduler/jobs",
          component: "scheduler/jobs/index",
          permissions: ["scheduler:job:list"],
        },
        {
          name: "SchedulerLogs",
          path: "/system/scheduler/job-logs",
          component: "scheduler/job-logs/index",
          permissions: ["scheduler:job:log:list"],
        },
        {
          name: "AiAssistant",
          path: "/system/ai-assistant",
          component: "ai/assistant/index",
          permissions: ["ai:chat"],
        },
      ],
    },
    {
      name: "MasterData",
      path: "/base",
      component: "layout/index",
      permissions: [],
      children: [
        {
          name: "BaseMaterial",
          path: "/base/material",
          component: "base/material/index",
          permissions: ["master:material:list"],
        },
        {
          name: "BaseCustomer",
          path: "/base/customer",
          component: "base/customer/index",
          permissions: ["master:customer:list"],
        },
        {
          name: "BaseSupplier",
          path: "/base/supplier",
          component: "base/supplier/index",
          permissions: ["master:supplier:list"],
        },
        {
          name: "BasePersonnel",
          path: "/base/personnel",
          component: "base/personnel/index",
          permissions: ["master:personnel:list"],
        },
        {
          name: "BaseWorkshop",
          path: "/base/workshop",
          component: "base/workshop/index",
          permissions: ["master:workshop:list"],
        },
        {
          name: "BaseMaterialCategory",
          path: "/base/material-category",
          component: "base/material-category/index",
          permissions: ["master:material-category:list"],
        },
        {
          name: "BaseStockScope",
          path: "/base/stock-scope",
          component: "base/stock-scope/index",
          permissions: ["master:stock-scope:list"],
        },
      ],
    },
    {
      name: "InboundBusiness",
      path: "/entry",
      component: "layout/index",
      permissions: [],
      children: [
        {
          name: "EntryOrder",
          path: "/entry/order",
          component: "entry/order/index",
          permissions: ["inbound:order:list"],
        },
        {
          name: "EntryDetail",
          path: "/entry/detail",
          component: "entry/detail/index",
          permissions: ["inbound:order:list"],
        },
        {
          name: "EntryIntoOrder",
          path: "/entry/intoOrder",
          component: "entry/intoOrder/index",
          permissions: ["inbound:into-order:list"],
        },
        {
          name: "EntryIntoDetail",
          path: "/entry/intoDetail",
          component: "entry/intoDetail/index",
          permissions: ["inbound:into-order:list"],
        },
      ],
    },
    {
      name: "WorkshopMaterialBusiness",
      path: "/take",
      component: "layout/index",
      permissions: [],
      children: [
        {
          name: "TakePickOrder",
          path: "/take/pickOrder",
          component: "take/pickOrder/index",
          permissions: ["workshop-material:pick-order:list"],
        },
        {
          name: "TakePickDetail",
          path: "/take/pickDetail",
          component: "take/pickDetail/index",
          permissions: ["workshop-material:pick-order:list"],
        },
        {
          name: "TakeReturnOrder",
          path: "/take/returnOrder",
          component: "take/returnOrder/index",
          permissions: ["workshop-material:return-order:list"],
        },
        {
          name: "TakeReturnDetail",
          path: "/take/returnDetail",
          component: "take/returnDetail/index",
          permissions: ["workshop-material:return-order:list"],
        },
      ],
    },
    {
      name: "InventoryBusiness",
      path: "/stock",
      component: "layout/index",
      permissions: [],
      children: [
        {
          name: "StockInventory",
          path: "/stock/inventory",
          component: "stock/inventory/index",
          permissions: ["inventory:balance:list"],
        },
        {
          name: "StockLog",
          path: "/stock/log",
          component: "stock/log/index",
          permissions: ["inventory:log:list"],
        },
        {
          name: "StockUsed",
          path: "/stock/used",
          component: "stock/used/index",
          permissions: ["inventory:source-usage:list"],
        },
        {
          name: "StockScrapOrder",
          path: "/stock/scrapOrder",
          component: "stock/scrapOrder/index",
          permissions: ["workshop-material:scrap-order:list"],
        },
        {
          name: "StockScrapDetail",
          path: "/stock/scrapDetail",
          component: "stock/scrapDetail/index",
          permissions: ["workshop-material:scrap-order:list"],
        },
        {
          name: "StockInterval",
          path: "/stock/interval",
          component: "stock/interval/index",
          permissions: ["inventory:factory-number:list"],
        },
      ],
    },
    {
      name: "CustomerBusiness",
      path: "/customer",
      component: "layout/index",
      permissions: [],
      children: [
        {
          name: "CustomerOrder",
          path: "/customer/order",
          component: "customer/order/index",
          permissions: ["customer:order:list"],
        },
        {
          name: "CustomerDetail",
          path: "/customer/detail",
          component: "customer/detail/index",
          permissions: ["customer:order:list"],
        },
        {
          name: "CustomerSalesReturnOrder",
          path: "/customer/salesReturnOrder",
          component: "customer/salesReturnOrder/index",
          permissions: ["customer:sales-return:list"],
        },
        {
          name: "CustomerSalesReturnDetail",
          path: "/customer/salesReturnDetail",
          component: "customer/salesReturnDetail/index",
          permissions: ["customer:sales-return:list"],
        },
      ],
    },
    {
      name: "RdSubwarehouse",
      path: "/rd",
      component: "layout/index",
      permissions: [],
      children: [
        {
          name: "RdWorkbench",
          path: "/rd/workbench",
          component: "rd/workbench/index",
          permissions: ["rd:workbench:view"],
        },
        {
          name: "RdProcurementRequests",
          path: "/rd/procurement-requests",
          component: "rd/procurement-requests/index",
          permissions: ["rd:procurement-request:list"],
        },
        {
          name: "RdInventorySummary",
          path: "/rd/inventory-summary",
          component: "reporting/inventory-summary/index",
          permissions: ["reporting:inventory-summary:view"],
        },
        {
          name: "RdInventoryLogs",
          path: "/rd/inventory-logs",
          component: "rd/inventory-logs/index",
          permissions: ["inventory:log:list"],
        },
        {
          name: "RdInboundResults",
          path: "/rd/inbound-results",
          component: "rd/inbound-results/index",
          permissions: ["rd:handoff-order:list"],
        },
        {
          name: "RdProjectConsumption",
          path: "/rd/project-consumption",
          component: "rd/project-consumption/index",
          permissions: ["project:list"],
        },
        {
          name: "RdScrapOrders",
          path: "/rd/scrap-orders",
          component: "rd/scrap-orders/index",
          permissions: ["workshop-material:scrap-order:list"],
        },
        {
          name: "RdStocktakeOrders",
          path: "/rd/stocktake-orders",
          component: "rd/stocktake-orders/index",
          permissions: ["rd:stocktake-order:list"],
        },
        {
          name: "RdMaterialCategorySummary",
          path: "/rd/material-category-summary",
          component: "reporting/material-category-summary/index",
          permissions: ["reporting:material-category-summary:view"],
        },
      ],
    },
  ];

  private depts: ManagedDeptRecord[];
  private posts: ManagedPostRecord[];
  private menus: ManagedMenuRecord[];
  private roles: ManagedRoleRecord[];
  private dictTypes: ManagedDictTypeRecord[];
  private dictData: ManagedDictDataRecord[];
  private configs: ManagedConfigRecord[];
  private notices: ManagedNoticeRecord[];
  private users: ManagedUserRecord[];

  private persistenceQueue: Promise<void> = Promise.resolve();

  constructor(@Optional() private readonly prisma?: PrismaService) {
    const seedState = createSystemManagementSeedState();
    this.depts = seedState.depts;
    this.posts = seedState.posts;
    this.menus = seedState.menus;
    this.roles = seedState.roles;
    this.dictTypes = seedState.dictTypes;
    this.dictData = seedState.dictData;
    this.configs = seedState.configs;
    this.notices = seedState.notices;
    this.users = seedState.users;
  }

  hasPersistenceAdapter(): boolean {
    return Boolean(this.prisma);
  }

  async flushPersistence(): Promise<void> {
    await this.persistenceQueue;
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

    this.depts = dbDepts.map((d) => ({
      deptId: d.deptId,
      parentId: d.parentId,
      ancestors: d.ancestors,
      deptName: d.deptName,
      orderNum: d.orderNum,
      leader: d.leader,
      phone: d.phone,
      email: d.email,
      status: d.status as "0" | "1",
      createTime: d.createdAt.toISOString(),
    }));

    this.posts = dbPosts.map((p) => ({
      postId: p.postId,
      postCode: p.postCode,
      postName: p.postName,
      postSort: p.postSort,
      status: p.status as "0" | "1",
      remark: p.remark,
      createTime: p.createdAt.toISOString(),
    }));

    this.menus = dbMenus.map((m) => ({
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

    this.roles = dbRoles.map((r) => ({
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
      createTime: r.createdAt.toISOString(),
    }));

    this.dictTypes = dbDictTypes.map((dt) => ({
      dictId: dt.dictId,
      dictName: dt.dictName,
      dictType: dt.dictType,
      status: dt.status as "0" | "1",
      remark: dt.remark,
      createTime: dt.createdAt.toISOString(),
    }));

    this.dictData = dbDictData.map((dd) => ({
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
      createTime: dd.createdAt.toISOString(),
    }));

    this.configs = dbConfigs.map((c) => ({
      configId: c.configId,
      configName: c.configName,
      configKey: c.configKey,
      configValue: c.configValue,
      configType: c.configType as "Y" | "N",
      remark: c.remark,
      createTime: c.createdAt.toISOString(),
    }));

    this.notices = dbNotices.map((n) => ({
      noticeId: n.noticeId,
      noticeTitle: n.noticeTitle,
      noticeType: n.noticeType as "1" | "2",
      noticeContent: n.noticeContent,
      status: n.status as "0" | "1",
      remark: n.remark,
      createTime: n.createdAt.toISOString(),
    }));

    this.users = dbUsers.map((u) => ({
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
      createTime: u.createdAt.toISOString(),
      postIds: dbUserPosts
        .filter((up) => up.userId === u.userId)
        .map((up) => up.postId),
      roleIds: dbUserRoles
        .filter((ur) => ur.userId === u.userId)
        .map((ur) => ur.roleId),
      passwordHash: u.passwordHash,
      consoleMode: (u.consoleMode ?? "default") as SessionConsoleMode,
      workshopScope:
        (u.workshopScope as unknown as SessionWorkshopScopeSnapshot) ?? {
          mode: "ALL",
          workshopId: null,
          workshopCode: null,
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

      if (this.depts.length) {
        await tx.sysDept.createMany({
          data: this.depts.map((d) => ({
            deptId: d.deptId,
            parentId: d.parentId,
            ancestors: d.ancestors,
            deptName: d.deptName,
            orderNum: d.orderNum,
            leader: d.leader,
            phone: d.phone,
            email: d.email,
            status: d.status,
            createdAt: new Date(d.createTime),
            updatedAt: now,
          })),
        });
      }

      if (this.posts.length) {
        await tx.sysPost.createMany({
          data: this.posts.map((p) => ({
            postId: p.postId,
            postCode: p.postCode,
            postName: p.postName,
            postSort: p.postSort,
            status: p.status,
            remark: p.remark,
            createdAt: new Date(p.createTime),
            updatedAt: now,
          })),
        });
      }

      if (this.menus.length) {
        await tx.sysMenu.createMany({
          data: this.menus.map((m) => ({
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

      if (this.roles.length) {
        await tx.sysRole.createMany({
          data: this.roles.map((r) => ({
            roleId: r.roleId,
            roleName: r.roleName,
            roleKey: r.roleKey,
            roleSort: r.roleSort,
            status: r.status,
            dataScope: r.dataScope,
            menuCheckStrictly: r.menuCheckStrictly,
            deptCheckStrictly: r.deptCheckStrictly,
            remark: r.remark,
            createdAt: new Date(r.createTime),
            updatedAt: now,
          })),
        });
      }

      if (this.dictTypes.length) {
        await tx.sysDictType.createMany({
          data: this.dictTypes.map((dt) => ({
            dictId: dt.dictId,
            dictName: dt.dictName,
            dictType: dt.dictType,
            status: dt.status,
            remark: dt.remark,
            createdAt: new Date(dt.createTime),
            updatedAt: now,
          })),
        });
      }

      if (this.dictData.length) {
        await tx.sysDictData.createMany({
          data: this.dictData.map((dd) => ({
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
            createdAt: new Date(dd.createTime),
            updatedAt: now,
          })),
        });
      }

      if (this.configs.length) {
        await tx.sysConfig.createMany({
          data: this.configs.map((c) => ({
            configId: c.configId,
            configName: c.configName,
            configKey: c.configKey,
            configValue: c.configValue,
            configType: c.configType,
            remark: c.remark,
            createdAt: new Date(c.createTime),
            updatedAt: now,
          })),
        });
      }

      if (this.notices.length) {
        await tx.sysNotice.createMany({
          data: this.notices.map((n) => ({
            noticeId: n.noticeId,
            noticeTitle: n.noticeTitle,
            noticeType: n.noticeType,
            noticeContent: n.noticeContent,
            status: n.status,
            remark: n.remark,
            createdAt: new Date(n.createTime),
            updatedAt: now,
          })),
        });
      }

      if (this.users.length) {
        await tx.sysUser.createMany({
          data: this.users.map((u) => ({
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
            workshopScope: u.workshopScope as unknown as Prisma.InputJsonValue,
            extraPermissions:
              u.extraPermissions as unknown as Prisma.InputJsonValue,
            createdAt: new Date(u.createTime),
            updatedAt: now,
          })),
        });
      }

      const userRoleData = this.users.flatMap((u) =>
        u.roleIds.map((roleId) => ({ userId: u.userId, roleId })),
      );
      if (userRoleData.length) {
        await tx.sysUserRole.createMany({ data: userRoleData });
      }

      const userPostData = this.users.flatMap((u) =>
        u.postIds.map((postId) => ({ userId: u.userId, postId })),
      );
      if (userPostData.length) {
        await tx.sysUserPost.createMany({ data: userPostData });
      }

      const roleMenuData = this.roles.flatMap((r) =>
        r.menuIds.map((menuId) => ({ roleId: r.roleId, menuId })),
      );
      if (roleMenuData.length) {
        await tx.sysRoleMenu.createMany({ data: roleMenuData });
      }

      const roleDeptData = this.roles.flatMap((r) =>
        r.deptIds.map((deptId) => ({ roleId: r.roleId, deptId })),
      );
      if (roleDeptData.length) {
        await tx.sysRoleDept.createMany({ data: roleDeptData });
      }
    });
  }

  private queuePersistence(): void {
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

  async findUserByUsername(username: string): Promise<RbacUserRecord | null> {
    const user = this.users.find((item) => item.userName === username);
    return user ? this.buildRbacUserRecord(user) : null;
  }

  async findUserById(userId: number): Promise<RbacUserRecord | null> {
    const user = this.users.find((item) => item.userId === userId);
    return user ? this.buildRbacUserRecord(user) : null;
  }

  async getRoutes(): Promise<RouteNode[]> {
    return structuredClone(this.routes);
  }

  async updateUserAvatar(
    userId: number,
    avatarUrl: string | null,
  ): Promise<{
    user: RbacUserRecord;
    previousAvatarUrl: string | null;
  }> {
    const user = this.users.find((item) => item.userId === userId);
    if (!user) {
      throw new Error(`User not found: ${userId}`);
    }

    const previousAvatarUrl = user.avatarUrl ?? null;
    user.avatarUrl = avatarUrl;
    this.queuePersistence();

    return {
      user: this.buildRbacUserRecord(user),
      previousAvatarUrl,
    };
  }

  verifyPassword(rawPassword: string, passwordHash: string): boolean {
    return compareHash(rawPassword, passwordHash);
  }

  listUsers(query: Record<string, string | undefined>) {
    const deptId = this.toNumber(query.deptId);
    const rows = this.users
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

    return this.paginate(rows, query);
  }

  getUserForm(userId: number | null) {
    return {
      data: userId ? this.toUserForm(this.requireUser(userId)) : undefined,
      posts: this.posts.map((post) => structuredClone(post)),
      roles: this.roles.map((role) => structuredClone(role)),
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
      this.users.some((item) => !item.deleted && item.userName === userName)
    ) {
      throw new Error("用户名称已存在");
    }

    const user: ManagedUserRecord = {
      userId: this.nextId(this.users, "userId"),
      deptId: this.toNumber(data.deptId),
      userName,
      nickName: String(data.nickName ?? "").trim(),
      avatarUrl: null,
      email: String(data.email ?? "").trim(),
      phonenumber: String(data.phonenumber ?? "").trim(),
      sex: this.normalizeSex(data.sex),
      status: this.normalizeStatus(data.status),
      deleted: false,
      remark: String(data.remark ?? ""),
      createTime: new Date().toISOString(),
      postIds: this.normalizeNumberList(data.postIds),
      roleIds: this.normalizeNumberList(data.roleIds),
      passwordHash: hashText(String(data.password ?? "ChangeMe123")),
      consoleMode: "default",
      workshopScope: {
        mode: "ALL",
        workshopId: null,
        workshopCode: null,
        workshopName: null,
      },
      extraPermissions: [],
    };
    this.users.push(user);
    this.queuePersistence();
    return this.toUserRow(user);
  }

  updateUser(data: Record<string, unknown>) {
    const userId = this.requireNumber(data.userId);
    const user = this.requireUser(userId);
    const nextUserName = String(data.userName ?? user.userName).trim();
    const conflict = this.users.find(
      (item) =>
        item.userId !== userId &&
        !item.deleted &&
        item.userName === nextUserName,
    );
    if (conflict) {
      throw new Error("用户名称已存在");
    }

    user.deptId = this.toNumber(data.deptId);
    user.userName = nextUserName;
    user.nickName = String(data.nickName ?? user.nickName).trim();
    user.email = String(data.email ?? user.email).trim();
    user.phonenumber = String(data.phonenumber ?? user.phonenumber).trim();
    user.sex = this.normalizeSex(data.sex ?? user.sex);
    user.status = this.normalizeStatus(data.status ?? user.status);
    user.remark = String(data.remark ?? user.remark);
    user.postIds = this.normalizeNumberList(data.postIds);
    user.roleIds = this.normalizeNumberList(data.roleIds);
    this.queuePersistence();
    return this.toUserRow(user);
  }

  deleteUsers(userIds: number[]) {
    userIds.forEach((userId) => {
      if (userId === 1) {
        return;
      }
      const user = this.users.find((item) => item.userId === userId);
      if (user) {
        user.deleted = true;
      }
    });
    this.queuePersistence();
  }

  resetUserPassword(userId: number, password: string) {
    const user = this.requireUser(userId);
    user.passwordHash = hashText(password);
    this.queuePersistence();
  }

  changeUserStatus(userId: number, status: "0" | "1") {
    const user = this.requireUser(userId);
    user.status = status;
    this.queuePersistence();
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
            this.roles.find((role) => role.roleKey === roleKey)?.roleName,
        )
        .filter(Boolean)
        .join(" / "),
      postGroup: this.posts
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
    user.sex = this.normalizeSex(data.sex ?? user.sex);
    this.queuePersistence();
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
    this.queuePersistence();
  }

  getAuthRole(userId: number) {
    const user = this.requireUser(userId);
    return {
      user: {
        userId: user.userId,
        userName: user.userName,
        nickName: user.nickName,
      },
      roles: this.roles.map((role) => ({
        ...structuredClone(role),
        flag: user.roleIds.includes(role.roleId),
      })),
    };
  }

  updateUserRoles(userId: number, roleIds: number[]) {
    const user = this.requireUser(userId);
    user.roleIds = [...new Set(roleIds)];
    this.queuePersistence();
  }

  findUserIdsByRoleIds(roleIds: number[]) {
    const roleIdSet = new Set(roleIds);
    return this.users
      .filter(
        (user) =>
          !user.deleted && user.roleIds.some((roleId) => roleIdSet.has(roleId)),
      )
      .map((user) => user.userId);
  }

  listRoles(query: Record<string, string | undefined>) {
    const rows = this.roles
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

    return this.paginate(rows, query);
  }

  getRole(roleId: number) {
    return structuredClone(this.requireRole(roleId));
  }

  createRole(data: Record<string, unknown>) {
    const role: ManagedRoleRecord = {
      roleId: this.nextId(this.roles, "roleId"),
      roleName: String(data.roleName ?? "").trim(),
      roleKey: String(data.roleKey ?? "").trim(),
      roleSort: this.requireNumber(data.roleSort),
      status: this.normalizeStatus(data.status),
      dataScope: this.normalizeDataScope(data.dataScope),
      menuCheckStrictly: Boolean(data.menuCheckStrictly ?? true),
      deptCheckStrictly: Boolean(data.deptCheckStrictly ?? true),
      menuIds: this.normalizeNumberList(data.menuIds),
      deptIds: this.normalizeNumberList(data.deptIds),
      remark: String(data.remark ?? ""),
      createTime: new Date().toISOString(),
    };
    this.roles.push(role);
    this.queuePersistence();
    return structuredClone(role);
  }

  updateRole(data: Record<string, unknown>) {
    const role = this.requireRole(this.requireNumber(data.roleId));
    role.roleName = String(data.roleName ?? role.roleName).trim();
    role.roleKey = String(data.roleKey ?? role.roleKey).trim();
    role.roleSort = this.requireNumber(data.roleSort ?? role.roleSort);
    role.status = this.normalizeStatus(data.status ?? role.status);
    role.dataScope = this.normalizeDataScope(data.dataScope ?? role.dataScope);
    role.menuCheckStrictly = Boolean(
      data.menuCheckStrictly ?? role.menuCheckStrictly,
    );
    role.deptCheckStrictly = Boolean(
      data.deptCheckStrictly ?? role.deptCheckStrictly,
    );
    role.menuIds = this.normalizeNumberList(data.menuIds ?? role.menuIds);
    role.deptIds = this.normalizeNumberList(data.deptIds ?? role.deptIds);
    role.remark = String(data.remark ?? role.remark);
    this.queuePersistence();
    return structuredClone(role);
  }

  updateRoleDataScope(data: Record<string, unknown>) {
    const role = this.requireRole(this.requireNumber(data.roleId));
    role.dataScope = this.normalizeDataScope(data.dataScope ?? role.dataScope);
    role.deptIds = this.normalizeNumberList(data.deptIds ?? role.deptIds);
    this.queuePersistence();
  }

  changeRoleStatus(roleId: number, status: "0" | "1") {
    const role = this.requireRole(roleId);
    role.status = status;
    this.queuePersistence();
  }

  deleteRoles(roleIds: number[]) {
    roleIds.forEach((roleId) => {
      if (roleId === 1) {
        return;
      }
      const assignedUsers = this.users.filter(
        (user) => !user.deleted && user.roleIds.includes(roleId),
      );
      if (assignedUsers.length > 0) {
        throw new Error("角色已分配给用户，无法删除");
      }
      const index = this.roles.findIndex((item) => item.roleId === roleId);
      if (index >= 0) {
        this.roles.splice(index, 1);
      }
    });
    this.queuePersistence();
  }

  listAllocatedUsers(query: Record<string, string | undefined>) {
    const roleId = this.requireNumber(query.roleId);
    const rows = this.users
      .filter((user) => !user.deleted && user.roleIds.includes(roleId))
      .filter((user) => this.matchesUserQuery(user, query))
      .map((user) => this.toUserRow(user));
    return this.paginate(rows, query);
  }

  listUnallocatedUsers(query: Record<string, string | undefined>) {
    const roleId = this.requireNumber(query.roleId);
    const rows = this.users
      .filter((user) => !user.deleted && !user.roleIds.includes(roleId))
      .filter((user) => this.matchesUserQuery(user, query))
      .map((user) => this.toUserRow(user));
    return this.paginate(rows, query);
  }

  cancelAuthUsers(roleId: number, userIds: number[]) {
    userIds.forEach((userId) => {
      const user = this.requireUser(userId);
      user.roleIds = user.roleIds.filter((item) => item !== roleId);
    });
    this.queuePersistence();
  }

  assignUsersToRole(roleId: number, userIds: number[]) {
    userIds.forEach((userId) => {
      const user = this.requireUser(userId);
      if (!user.roleIds.includes(roleId)) {
        user.roleIds.push(roleId);
      }
    });
    this.queuePersistence();
  }

  listMenus(query: Record<string, string | undefined>) {
    return this.menus
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

  createMenu(data: Record<string, unknown>) {
    const menu: ManagedMenuRecord = {
      menuId: this.nextId(this.menus, "menuId"),
      parentId: this.requireNumber(data.parentId ?? 0),
      menuName: String(data.menuName ?? "").trim(),
      orderNum: this.requireNumber(data.orderNum ?? 0),
      path: String(data.path ?? ""),
      component: String(data.component ?? ""),
      routeName: String(data.routeName ?? ""),
      menuType: this.normalizeMenuType(data.menuType),
      visible: this.normalizeStatus(data.visible),
      status: this.normalizeStatus(data.status),
      perms: String(data.perms ?? ""),
      icon: String(data.icon ?? ""),
      query: String(data.query ?? ""),
      isFrame: this.normalizeYesNoFlag(data.isFrame, "1"),
      isCache: this.normalizeYesNoFlag(data.isCache, "0"),
    };
    this.menus.push(menu);
    this.queuePersistence();
    return structuredClone(menu);
  }

  updateMenu(data: Record<string, unknown>) {
    const menu = this.requireMenu(this.requireNumber(data.menuId));
    menu.parentId = this.requireNumber(data.parentId ?? menu.parentId);
    menu.menuName = String(data.menuName ?? menu.menuName).trim();
    menu.orderNum = this.requireNumber(data.orderNum ?? menu.orderNum);
    menu.path = String(data.path ?? menu.path);
    menu.component = String(data.component ?? menu.component);
    menu.routeName = String(data.routeName ?? menu.routeName);
    menu.menuType = this.normalizeMenuType(data.menuType ?? menu.menuType);
    menu.visible = this.normalizeStatus(data.visible ?? menu.visible);
    menu.status = this.normalizeStatus(data.status ?? menu.status);
    menu.perms = String(data.perms ?? menu.perms);
    menu.icon = String(data.icon ?? menu.icon);
    menu.query = String(data.query ?? menu.query);
    menu.isFrame = this.normalizeYesNoFlag(data.isFrame ?? menu.isFrame, "1");
    menu.isCache = this.normalizeYesNoFlag(data.isCache ?? menu.isCache, "0");
    this.queuePersistence();
    return structuredClone(menu);
  }

  deleteMenus(menuIds: number[]) {
    menuIds.forEach((menuId) => {
      const hasChildren = this.menus.some((item) => item.parentId === menuId);
      if (hasChildren) {
        throw new Error("存在子菜单，不允许删除");
      }
      this.roles.forEach((role) => {
        role.menuIds = role.menuIds.filter((item) => item !== menuId);
      });
      const index = this.menus.findIndex((item) => item.menuId === menuId);
      if (index >= 0) {
        this.menus.splice(index, 1);
      }
    });
    this.queuePersistence();
  }

  getRoleMenuTree(roleId: number) {
    const role = this.requireRole(roleId);
    return {
      menus: this.toTreeSelect(this.menus, "menuId", "parentId", "menuName"),
      checkedKeys: [...role.menuIds],
    };
  }

  getMenuTreeSelect() {
    return this.toTreeSelect(this.menus, "menuId", "parentId", "menuName");
  }

  listDepts(query: Record<string, string | undefined>) {
    return this.depts
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
    const excluded = new Set(this.getDeptAndDescendants(deptId));
    return this.depts
      .filter((dept) => !excluded.has(dept.deptId))
      .map((dept) => structuredClone(dept));
  }

  getDept(deptId: number) {
    return structuredClone(this.requireDept(deptId));
  }

  createDept(data: Record<string, unknown>) {
    const parentId = this.requireNumber(data.parentId ?? 0);
    const parent = parentId === 0 ? null : this.requireDept(parentId);
    const dept: ManagedDeptRecord = {
      deptId: this.nextId(this.depts, "deptId"),
      parentId,
      ancestors: parent ? `${parent.ancestors},${parent.deptId}` : "0",
      deptName: String(data.deptName ?? "").trim(),
      orderNum: this.requireNumber(data.orderNum ?? 0),
      leader: String(data.leader ?? ""),
      phone: String(data.phone ?? ""),
      email: String(data.email ?? ""),
      status: this.normalizeStatus(data.status),
      createTime: new Date().toISOString(),
    };
    this.depts.push(dept);
    this.queuePersistence();
    return structuredClone(dept);
  }

  updateDept(data: Record<string, unknown>) {
    const dept = this.requireDept(this.requireNumber(data.deptId));
    const previousAncestors = dept.ancestors;
    dept.parentId = this.requireNumber(data.parentId ?? dept.parentId);
    dept.deptName = String(data.deptName ?? dept.deptName).trim();
    dept.orderNum = this.requireNumber(data.orderNum ?? dept.orderNum);
    dept.leader = String(data.leader ?? dept.leader);
    dept.phone = String(data.phone ?? dept.phone);
    dept.email = String(data.email ?? dept.email);
    dept.status = this.normalizeStatus(data.status ?? dept.status);
    const parent = dept.parentId === 0 ? null : this.requireDept(dept.parentId);
    const nextAncestors = parent ? `${parent.ancestors},${parent.deptId}` : "0";
    const previousSelfPath = `${previousAncestors},${dept.deptId}`;
    const nextSelfPath = `${nextAncestors},${dept.deptId}`;
    dept.ancestors = nextAncestors;

    this.depts.forEach((candidate) => {
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

    this.queuePersistence();
    return structuredClone(dept);
  }

  deleteDepts(deptIds: number[]) {
    deptIds.forEach((deptId) => {
      const hasChildren = this.depts.some((item) => item.parentId === deptId);
      if (hasChildren) {
        throw new Error("存在下级部门，不允许删除");
      }
      const hasUsers = this.users.some(
        (user) => !user.deleted && user.deptId === deptId,
      );
      if (hasUsers) {
        throw new Error("部门下存在用户，不允许删除");
      }
      const index = this.depts.findIndex((item) => item.deptId === deptId);
      if (index >= 0) {
        this.depts.splice(index, 1);
      }
    });
    this.queuePersistence();
  }

  getDeptTree(roleId?: number) {
    const checkedKeys = roleId ? [...this.requireRole(roleId).deptIds] : [];
    return {
      depts: this.toTreeSelect(this.depts, "deptId", "parentId", "deptName"),
      checkedKeys,
    };
  }

  getDeptTreeSelect() {
    return this.toTreeSelect(this.depts, "deptId", "parentId", "deptName", {
      disabledKey: "status",
      disabledValue: "1",
    });
  }

  listPosts(query: Record<string, string | undefined>) {
    const rows = this.posts
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
    return this.paginate(rows, query);
  }

  getPost(postId: number) {
    return structuredClone(this.requirePost(postId));
  }

  createPost(data: Record<string, unknown>) {
    const post: ManagedPostRecord = {
      postId: this.nextId(this.posts, "postId"),
      postCode: String(data.postCode ?? "").trim(),
      postName: String(data.postName ?? "").trim(),
      postSort: this.requireNumber(data.postSort ?? 0),
      status: this.normalizeStatus(data.status),
      remark: String(data.remark ?? ""),
      createTime: new Date().toISOString(),
    };
    this.posts.push(post);
    this.queuePersistence();
    return structuredClone(post);
  }

  updatePost(data: Record<string, unknown>) {
    const post = this.requirePost(this.requireNumber(data.postId));
    post.postCode = String(data.postCode ?? post.postCode).trim();
    post.postName = String(data.postName ?? post.postName).trim();
    post.postSort = this.requireNumber(data.postSort ?? post.postSort);
    post.status = this.normalizeStatus(data.status ?? post.status);
    post.remark = String(data.remark ?? post.remark);
    this.queuePersistence();
    return structuredClone(post);
  }

  deletePosts(postIds: number[]) {
    postIds.forEach((postId) => {
      const used = this.users.some(
        (user) => !user.deleted && user.postIds.includes(postId),
      );
      if (used) {
        throw new Error("岗位已分配给用户，无法删除");
      }
      const index = this.posts.findIndex((item) => item.postId === postId);
      if (index >= 0) {
        this.posts.splice(index, 1);
      }
    });
    this.queuePersistence();
  }

  listDictTypes(query: Record<string, string | undefined>) {
    const rows = this.dictTypes
      .filter((item) => {
        if (query.dictName && !item.dictName.includes(query.dictName)) {
          return false;
        }
        if (query.dictType && !item.dictType.includes(query.dictType)) {
          return false;
        }
        if (query.status && item.status !== query.status) {
          return false;
        }
        return true;
      })
      .map((item) => structuredClone(item));
    return this.paginate(rows, query);
  }

  getDictType(dictId: number) {
    return structuredClone(this.requireDictType(dictId));
  }

  createDictType(data: Record<string, unknown>) {
    const record: ManagedDictTypeRecord = {
      dictId: this.nextId(this.dictTypes, "dictId"),
      dictName: String(data.dictName ?? "").trim(),
      dictType: String(data.dictType ?? "").trim(),
      status: this.normalizeStatus(data.status),
      remark: String(data.remark ?? ""),
      createTime: new Date().toISOString(),
    };
    this.dictTypes.push(record);
    this.queuePersistence();
    return structuredClone(record);
  }

  updateDictType(data: Record<string, unknown>) {
    const record = this.requireDictType(this.requireNumber(data.dictId));
    const previousType = record.dictType;
    record.dictName = String(data.dictName ?? record.dictName).trim();
    record.dictType = String(data.dictType ?? record.dictType).trim();
    record.status = this.normalizeStatus(data.status ?? record.status);
    record.remark = String(data.remark ?? record.remark);
    if (previousType !== record.dictType) {
      this.dictData.forEach((item) => {
        if (item.dictType === previousType) {
          item.dictType = record.dictType;
        }
      });
    }
    this.queuePersistence();
    return structuredClone(record);
  }

  deleteDictTypes(dictIds: number[]) {
    const dictIdSet = new Set(dictIds);
    const dictTypeSet = new Set(
      dictIds.map((dictId) => this.requireDictType(dictId).dictType),
    );

    for (let index = this.dictData.length - 1; index >= 0; index -= 1) {
      const current = this.dictData[index];
      if (current && dictTypeSet.has(current.dictType)) {
        this.dictData.splice(index, 1);
      }
    }

    for (let index = this.dictTypes.length - 1; index >= 0; index -= 1) {
      const current = this.dictTypes[index];
      if (current && dictIdSet.has(current.dictId)) {
        this.dictTypes.splice(index, 1);
      }
    }
    this.queuePersistence();
  }

  listDictTypeOptions() {
    return this.dictTypes
      .filter((item) => item.status === "0")
      .map((item) => structuredClone(item));
  }

  listDictData(query: Record<string, string | undefined>) {
    const rows = this.dictData
      .filter((item) => {
        if (query.dictType && item.dictType !== query.dictType) {
          return false;
        }
        if (query.dictLabel && !item.dictLabel.includes(query.dictLabel)) {
          return false;
        }
        if (query.status && item.status !== query.status) {
          return false;
        }
        return true;
      })
      .sort((left, right) => left.dictSort - right.dictSort)
      .map((item) => structuredClone(item));
    return this.paginate(rows, query);
  }

  getDictData(dictCode: number) {
    return structuredClone(this.requireDictData(dictCode));
  }

  getDictDataByType(dictType: string) {
    return this.dictData
      .filter((item) => item.dictType === dictType && item.status === "0")
      .sort((left, right) => left.dictSort - right.dictSort)
      .map((item) => structuredClone(item));
  }

  createDictData(data: Record<string, unknown>) {
    const record: ManagedDictDataRecord = {
      dictCode: this.nextId(this.dictData, "dictCode"),
      dictSort: this.requireNumber(data.dictSort ?? 0),
      dictLabel: String(data.dictLabel ?? "").trim(),
      dictValue: String(data.dictValue ?? "").trim(),
      dictType: String(data.dictType ?? "").trim(),
      cssClass: String(data.cssClass ?? ""),
      listClass: String(data.listClass ?? ""),
      isDefault: this.normalizeYesNoFlag(data.isDefault, "N"),
      status: this.normalizeStatus(data.status),
      remark: String(data.remark ?? ""),
      createTime: new Date().toISOString(),
    };
    this.dictData.push(record);
    this.queuePersistence();
    return structuredClone(record);
  }

  updateDictData(data: Record<string, unknown>) {
    const record = this.requireDictData(this.requireNumber(data.dictCode));
    record.dictSort = this.requireNumber(data.dictSort ?? record.dictSort);
    record.dictLabel = String(data.dictLabel ?? record.dictLabel).trim();
    record.dictValue = String(data.dictValue ?? record.dictValue).trim();
    record.dictType = String(data.dictType ?? record.dictType).trim();
    record.cssClass = String(data.cssClass ?? record.cssClass);
    record.listClass = String(data.listClass ?? record.listClass);
    record.isDefault = this.normalizeYesNoFlag(
      data.isDefault ?? record.isDefault,
      "N",
    );
    record.status = this.normalizeStatus(data.status ?? record.status);
    record.remark = String(data.remark ?? record.remark);
    this.queuePersistence();
    return structuredClone(record);
  }

  deleteDictData(dictCodes: number[]) {
    dictCodes.forEach((dictCode) => {
      const index = this.dictData.findIndex(
        (item) => item.dictCode === dictCode,
      );
      if (index >= 0) {
        this.dictData.splice(index, 1);
      }
    });
    this.queuePersistence();
  }

  listConfigs(query: Record<string, string | undefined>) {
    const rows = this.configs
      .filter((item) => {
        if (query.configName && !item.configName.includes(query.configName)) {
          return false;
        }
        if (query.configKey && !item.configKey.includes(query.configKey)) {
          return false;
        }
        if (query.configType && item.configType !== query.configType) {
          return false;
        }
        return true;
      })
      .map((item) => structuredClone(item));
    return this.paginate(rows, query);
  }

  getConfig(configId: number) {
    return structuredClone(this.requireConfig(configId));
  }

  getConfigByKey(configKey: string) {
    return structuredClone(
      this.configs.find((item) => item.configKey === configKey) ?? null,
    );
  }

  createConfig(data: Record<string, unknown>) {
    const record: ManagedConfigRecord = {
      configId: this.nextId(this.configs, "configId"),
      configName: String(data.configName ?? "").trim(),
      configKey: String(data.configKey ?? "").trim(),
      configValue: String(data.configValue ?? ""),
      configType: this.normalizeYesNoFlag(data.configType, "N"),
      remark: String(data.remark ?? ""),
      createTime: new Date().toISOString(),
    };
    this.configs.push(record);
    this.queuePersistence();
    return structuredClone(record);
  }

  updateConfig(data: Record<string, unknown>) {
    const record = this.requireConfig(this.requireNumber(data.configId));
    record.configName = String(data.configName ?? record.configName).trim();
    record.configKey = String(data.configKey ?? record.configKey).trim();
    record.configValue = String(data.configValue ?? record.configValue);
    record.configType = this.normalizeYesNoFlag(
      data.configType ?? record.configType,
      "N",
    );
    record.remark = String(data.remark ?? record.remark);
    this.queuePersistence();
    return structuredClone(record);
  }

  deleteConfigs(configIds: number[]) {
    configIds.forEach((configId) => {
      const index = this.configs.findIndex(
        (item) => item.configId === configId,
      );
      if (index >= 0) {
        this.configs.splice(index, 1);
      }
    });
    this.queuePersistence();
  }

  listNotices(query: Record<string, string | undefined>) {
    const rows = this.notices
      .filter((item) => {
        if (
          query.noticeTitle &&
          !item.noticeTitle.includes(query.noticeTitle)
        ) {
          return false;
        }
        if (query.noticeType && item.noticeType !== query.noticeType) {
          return false;
        }
        if (query.status && item.status !== query.status) {
          return false;
        }
        return true;
      })
      .map((item) => structuredClone(item));
    return this.paginate(rows, query);
  }

  getNotice(noticeId: number) {
    return structuredClone(this.requireNotice(noticeId));
  }

  createNotice(data: Record<string, unknown>) {
    const record: ManagedNoticeRecord = {
      noticeId: this.nextId(this.notices, "noticeId"),
      noticeTitle: String(data.noticeTitle ?? "").trim(),
      noticeType: this.normalizeNoticeType(data.noticeType),
      noticeContent: String(data.noticeContent ?? ""),
      status: this.normalizeStatus(data.status),
      remark: String(data.remark ?? ""),
      createTime: new Date().toISOString(),
    };
    this.notices.push(record);
    this.queuePersistence();
    return structuredClone(record);
  }

  updateNotice(data: Record<string, unknown>) {
    const record = this.requireNotice(this.requireNumber(data.noticeId));
    record.noticeTitle = String(data.noticeTitle ?? record.noticeTitle).trim();
    record.noticeType = this.normalizeNoticeType(
      data.noticeType ?? record.noticeType,
    );
    record.noticeContent = String(data.noticeContent ?? record.noticeContent);
    record.status = this.normalizeStatus(data.status ?? record.status);
    record.remark = String(data.remark ?? record.remark);
    this.queuePersistence();
    return structuredClone(record);
  }

  deleteNotices(noticeIds: number[]) {
    noticeIds.forEach((noticeId) => {
      const index = this.notices.findIndex(
        (item) => item.noticeId === noticeId,
      );
      if (index >= 0) {
        this.notices.splice(index, 1);
      }
    });
    this.queuePersistence();
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
      workshopScope: structuredClone(user.workshopScope),
      passwordHash: user.passwordHash,
      status: user.status === "0" ? "active" : "disabled",
      deleted: user.deleted,
    };
  }

  private getRoleKeys(roleIds: number[]) {
    return roleIds
      .map(
        (roleId) => this.roles.find((role) => role.roleId === roleId)?.roleKey,
      )
      .filter((roleKey): roleKey is string => Boolean(roleKey));
  }

  private getUserPermissions(user: ManagedUserRecord) {
    if (user.userId === 1) {
      return [
        ...new Set([
          ...this.menus
            .map((menu) => menu.perms)
            .filter((permission): permission is string => Boolean(permission)),
          ...user.extraPermissions,
        ]),
      ];
    }

    const rolePermissions = user.roleIds.flatMap((roleId) => {
      const role = this.roles.find((item) => item.roleId === roleId);
      if (!role) {
        return [];
      }
      return role.menuIds
        .map(
          (menuId) => this.menus.find((menu) => menu.menuId === menuId)?.perms,
        )
        .filter((permission): permission is string => Boolean(permission));
    });

    return [...new Set([...user.extraPermissions, ...rolePermissions])];
  }

  private requireUser(userId: number) {
    const user = this.users.find(
      (item) => item.userId === userId && !item.deleted,
    );
    if (!user) {
      throw new Error(`用户不存在: ${userId}`);
    }
    return user;
  }

  private requireRole(roleId: number) {
    const role = this.roles.find((item) => item.roleId === roleId);
    if (!role) {
      throw new Error(`角色不存在: ${roleId}`);
    }
    return role;
  }

  private requireMenu(menuId: number) {
    const menu = this.menus.find((item) => item.menuId === menuId);
    if (!menu) {
      throw new Error(`菜单不存在: ${menuId}`);
    }
    return menu;
  }

  private requireDept(deptId: number) {
    const dept = this.depts.find((item) => item.deptId === deptId);
    if (!dept) {
      throw new Error(`部门不存在: ${deptId}`);
    }
    return dept;
  }

  private requirePost(postId: number) {
    const post = this.posts.find((item) => item.postId === postId);
    if (!post) {
      throw new Error(`岗位不存在: ${postId}`);
    }
    return post;
  }

  private requireDictType(dictId: number) {
    const record = this.dictTypes.find((item) => item.dictId === dictId);
    if (!record) {
      throw new Error(`字典类型不存在: ${dictId}`);
    }
    return record;
  }

  private requireDictData(dictCode: number) {
    const record = this.dictData.find((item) => item.dictCode === dictCode);
    if (!record) {
      throw new Error(`字典数据不存在: ${dictCode}`);
    }
    return record;
  }

  private requireConfig(configId: number) {
    const record = this.configs.find((item) => item.configId === configId);
    if (!record) {
      throw new Error(`参数不存在: ${configId}`);
    }
    return record;
  }

  private requireNotice(noticeId: number) {
    const record = this.notices.find((item) => item.noticeId === noticeId);
    if (!record) {
      throw new Error(`公告不存在: ${noticeId}`);
    }
    return record;
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
      createTime: user.createTime,
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
      workshopScope: structuredClone(user.workshopScope),
    };
  }

  private toDeptReference(deptId: number) {
    const dept = this.requireDept(deptId);
    return {
      deptId: dept.deptId,
      deptName: dept.deptName,
    };
  }

  private toSessionDepartmentReference(deptId: number) {
    const dept = this.requireDept(deptId);
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
    const descendants = this.getDeptAndDescendants(deptId);
    return descendants.includes(user.deptId);
  }

  private getDeptAndDescendants(deptId: number) {
    return this.depts
      .filter(
        (dept) =>
          dept.deptId === deptId ||
          dept.ancestors.split(",").map(Number).includes(deptId),
      )
      .map((dept) => dept.deptId);
  }

  private toTreeSelect<
    T extends object,
    TIdKey extends keyof T,
    TParentKey extends keyof T,
    TLabelKey extends keyof T,
  >(
    rows: T[],
    idKey: TIdKey,
    parentKey: TParentKey,
    labelKey: TLabelKey,
    options?: {
      disabledKey?: keyof T;
      disabledValue?: string;
    },
  ) {
    const idToNode = new Map<
      number,
      {
        id: number;
        label: string;
        children: Array<{ id: number; label: string; children?: unknown[] }>;
        disabled?: boolean;
      }
    >();

    rows.forEach((row) => {
      const id = Number(row[idKey] as number | string);
      const disabled =
        options?.disabledKey &&
        String(row[options.disabledKey] as string | number | boolean) ===
          options.disabledValue;
      idToNode.set(id, {
        id,
        label: String(row[labelKey] as string | number),
        children: [],
        ...(disabled ? { disabled: true } : {}),
      });
    });

    const roots: Array<{
      id: number;
      label: string;
      children?: unknown[];
      disabled?: boolean;
    }> = [];

    rows.forEach((row) => {
      const id = Number(row[idKey] as number | string);
      const parentId = Number(row[parentKey] as number | string);
      const node = idToNode.get(id);
      if (!node) {
        return;
      }

      if (!parentId || !idToNode.has(parentId)) {
        roots.push(node);
        return;
      }

      idToNode.get(parentId)?.children.push(node);
    });

    return roots;
  }

  private paginate<T>(rows: T[], query: Record<string, string | undefined>) {
    const pageNum = this.toNumber(query.pageNum) ?? 1;
    const pageSize = this.toNumber(query.pageSize) ?? (rows.length || 1);
    const start = (pageNum - 1) * pageSize;
    return {
      rows: rows.slice(start, start + pageSize),
      total: rows.length,
    };
  }

  private toNumber(value: unknown) {
    if (value === undefined || value === null || value === "") {
      return null;
    }
    const result = Number(value);
    return Number.isFinite(result) ? result : null;
  }

  private requireNumber(value: unknown) {
    const result = this.toNumber(value);
    if (result === null) {
      throw new Error("缺少必要的数字参数");
    }
    return result;
  }

  private normalizeNumberList(value: unknown) {
    if (Array.isArray(value)) {
      return [...new Set(value.map((item) => this.requireNumber(item)))];
    }
    if (typeof value === "string") {
      return value
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean)
        .map((item) => this.requireNumber(item))
        .filter((item, index, list) => list.indexOf(item) === index);
    }
    return [];
  }

  private normalizeStatus(value: unknown): "0" | "1" {
    return String(value ?? "0") === "1" ? "1" : "0";
  }

  private normalizeSex(value: unknown): "0" | "1" | "2" {
    const sex = String(value ?? "2");
    return sex === "0" || sex === "1" ? sex : "2";
  }

  private normalizeDataScope(value: unknown) {
    const scope = String(value ?? "1");
    return ["1", "2", "3", "4", "5"].includes(scope) ? scope : "1";
  }

  private normalizeMenuType(value: unknown): "M" | "C" | "F" {
    const menuType = String(value ?? "M");
    return menuType === "C" || menuType === "F" ? menuType : "M";
  }

  private normalizeNoticeType(value: unknown): "1" | "2" {
    return String(value ?? "1") === "2" ? "2" : "1";
  }

  private normalizeYesNoFlag(value: unknown, fallback: "0" | "1"): "0" | "1";
  private normalizeYesNoFlag(value: unknown, fallback: "Y" | "N"): "Y" | "N";
  private normalizeYesNoFlag(value: unknown, fallback: "0" | "1" | "Y" | "N") {
    const normalized = String(value ?? fallback);
    if (
      (fallback === "0" || fallback === "1") &&
      (normalized === "0" || normalized === "1")
    ) {
      return normalized;
    }
    if (
      (fallback === "Y" || fallback === "N") &&
      (normalized === "Y" || normalized === "N")
    ) {
      return normalized;
    }
    return fallback;
  }

  private nextId<T extends Record<TKey, number>, TKey extends keyof T>(
    rows: T[],
    key: TKey,
  ) {
    return rows.reduce((max, row) => Math.max(max, row[key]), 0) + 1;
  }
}
