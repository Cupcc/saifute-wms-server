import { Injectable, type OnModuleInit, Optional } from "@nestjs/common";
import type { Prisma } from "../../../generated/prisma/client";
import {
  compareHash,
  hashText,
} from "../../../shared/common/security/hash.util";
import { PrismaService } from "../../../shared/prisma/prisma.service";
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
  SystemManagementStateSnapshot,
} from "../domain/rbac.types";

const ALL_PERMISSION = "*:*:*";
const SYSTEM_MANAGEMENT_SNAPSHOT_KEY = "default";

const WAREHOUSE_MANAGER_PERMISSION_PRESET = [
  "dashboard:view",
  "master:material:list",
  "master:customer:list",
  "master:supplier:list",
  "master:personnel:list",
  "master:workshop:list",
  "inbound:order:list",
  "inbound:order:create",
  "inbound:order:update",
  "inbound:order:void",
  "inbound:into-order:list",
  "inbound:into-order:create",
  "inbound:into-order:update",
  "inbound:into-order:void",
  "workshop-material:pick-order:list",
  "workshop-material:pick-order:create",
  "workshop-material:pick-order:void",
  "workshop-material:return-order:list",
  "workshop-material:return-order:create",
  "workshop-material:return-order:void",
  "workshop-material:scrap-order:list",
  "workshop-material:scrap-order:create",
  "workshop-material:scrap-order:void",
  "inventory:balance:list",
  "inventory:factory-number:list",
  "inventory:log:list",
  "inventory:source-usage:list",
  "customer:order:list",
  "customer:order:create",
  "customer:order:update",
  "customer:order:void",
  "customer:sales-return:list",
  "customer:sales-return:create",
  "customer:sales-return:void",
  "rd:procurement-request:list",
  "rd:procurement-request:return-action",
  "rd:handoff-order:list",
];

const RD_OPERATOR_PERMISSION_PRESET = [
  "dashboard:view",
  "rd:procurement-request:list",
  "rd:procurement-request:create",
  "rd:procurement-request:void",
  "rd:procurement-request:status-action",
  "rd:workbench:view",
  "reporting:home:view",
  "reporting:inventory-summary:view",
  "reporting:material-category-summary:view",
  "inventory:balance:list",
  "inventory:log:list",
  "rd:handoff-order:list",
  "rd:stocktake-order:list",
  "rd:stocktake-order:create",
  "rd:stocktake-order:void",
  "project:list",
  "project:get",
  "project:create",
  "project:void",
  "workshop-material:scrap-order:list",
  "workshop-material:scrap-order:create",
  "workshop-material:scrap-order:void",
  "master:material:list",
];

const PROCUREMENT_PERMISSION_PRESET = [
  "dashboard:view",
  "ai:chat",
  "ai:tools:list",
  "rd:procurement-request:list",
  "rd:procurement-request:status-action",
  "master:supplier:list",
  "inbound:order:list",
];

// 这些只用于首次初始化默认角色授权；运行态权限真源仍由角色菜单关系承接。
const DEFAULT_ROLE_PERMISSION_ASSIGNMENTS: Record<string, string[]> = {
  "warehouse-manager": WAREHOUSE_MANAGER_PERMISSION_PRESET,
  "rd-operator": RD_OPERATOR_PERMISSION_PRESET,
  procurement: PROCUREMENT_PERMISSION_PRESET,
};

@Injectable()
export class InMemoryRbacRepository implements OnModuleInit {
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

  private depts: ManagedDeptRecord[] = [
    {
      deptId: 100,
      parentId: 0,
      ancestors: "0",
      deptName: "研发部",
      orderNum: 1,
      leader: "研发负责人",
      phone: "13800000001",
      email: "rd@saifute.local",
      status: "0",
      createTime: "2026-03-01T09:00:00.000Z",
    },
    {
      deptId: 200,
      parentId: 0,
      ancestors: "0",
      deptName: "采购部",
      orderNum: 2,
      leader: "采购负责人",
      phone: "13800000002",
      email: "procurement@saifute.local",
      status: "0",
      createTime: "2026-03-01T09:00:00.000Z",
    },
    {
      deptId: 300,
      parentId: 0,
      ancestors: "0",
      deptName: "仓库",
      orderNum: 3,
      leader: "仓库负责人",
      phone: "13800000003",
      email: "warehouse@saifute.local",
      status: "0",
      createTime: "2026-03-01T09:00:00.000Z",
    },
  ];

  private posts: ManagedPostRecord[] = [
    {
      postId: 1,
      postCode: "SYS_ADMIN",
      postName: "系统管理员",
      postSort: 1,
      status: "0",
      remark: "超级管理员岗位",
      createTime: "2026-03-01T09:00:00.000Z",
    },
    {
      postId: 2,
      postCode: "WAREHOUSE_MANAGER",
      postName: "仓库管理员",
      postSort: 2,
      status: "0",
      remark: "主仓与公司级实物流转岗位",
      createTime: "2026-03-01T09:00:00.000Z",
    },
    {
      postId: 3,
      postCode: "PROCUREMENT_STAFF",
      postName: "采购人员",
      postSort: 3,
      status: "0",
      remark: "采购执行岗位",
      createTime: "2026-03-01T09:00:00.000Z",
    },
    {
      postId: 4,
      postCode: "RD_SUBWAREHOUSE",
      postName: "研发小仓管理员",
      postSort: 4,
      status: "0",
      remark: "研发小仓专属岗位",
      createTime: "2026-03-01T09:00:00.000Z",
    },
  ];

  private menus: ManagedMenuRecord[] = [
    {
      menuId: 1900,
      parentId: 0,
      menuName: "首页",
      orderNum: 0,
      path: "/dashboard",
      component: "dashboard/index",
      routeName: "Dashboard",
      menuType: "C",
      visible: "0",
      status: "0",
      perms: "dashboard:view",
      icon: "dashboard",
      query: "",
      isFrame: "1",
      isCache: "0",
    },
    {
      menuId: 2000,
      parentId: 0,
      menuName: "系统管理",
      orderNum: 1,
      path: "/system",
      component: "Layout",
      routeName: "SystemManagement",
      menuType: "M",
      visible: "0",
      status: "0",
      perms: "",
      icon: "system",
      query: "",
      isFrame: "1",
      isCache: "0",
    },
    {
      menuId: 2100,
      parentId: 2000,
      menuName: "用户管理",
      orderNum: 1,
      path: "user",
      component: "system/user/index",
      routeName: "SystemUser",
      menuType: "C",
      visible: "0",
      status: "0",
      perms: "system:user:list",
      icon: "user",
      query: "",
      isFrame: "1",
      isCache: "0",
    },
    {
      menuId: 2110,
      parentId: 2100,
      menuName: "用户新增",
      orderNum: 1,
      path: "",
      component: "",
      routeName: "",
      menuType: "F",
      visible: "0",
      status: "0",
      perms: "system:user:add",
      icon: "",
      query: "",
      isFrame: "1",
      isCache: "0",
    },
    {
      menuId: 2120,
      parentId: 2100,
      menuName: "用户修改",
      orderNum: 2,
      path: "",
      component: "",
      routeName: "",
      menuType: "F",
      visible: "0",
      status: "0",
      perms: "system:user:edit",
      icon: "",
      query: "",
      isFrame: "1",
      isCache: "0",
    },
    {
      menuId: 2130,
      parentId: 2100,
      menuName: "用户删除",
      orderNum: 3,
      path: "",
      component: "",
      routeName: "",
      menuType: "F",
      visible: "0",
      status: "0",
      perms: "system:user:remove",
      icon: "",
      query: "",
      isFrame: "1",
      isCache: "0",
    },
    {
      menuId: 2140,
      parentId: 2100,
      menuName: "重置密码",
      orderNum: 4,
      path: "",
      component: "",
      routeName: "",
      menuType: "F",
      visible: "0",
      status: "0",
      perms: "system:user:resetPwd",
      icon: "",
      query: "",
      isFrame: "1",
      isCache: "0",
    },
    {
      menuId: 2200,
      parentId: 2000,
      menuName: "角色管理",
      orderNum: 2,
      path: "role",
      component: "system/role/index",
      routeName: "SystemRole",
      menuType: "C",
      visible: "0",
      status: "0",
      perms: "system:role:list",
      icon: "peoples",
      query: "",
      isFrame: "1",
      isCache: "0",
    },
    {
      menuId: 2210,
      parentId: 2200,
      menuName: "角色新增",
      orderNum: 1,
      path: "",
      component: "",
      routeName: "",
      menuType: "F",
      visible: "0",
      status: "0",
      perms: "system:role:add",
      icon: "",
      query: "",
      isFrame: "1",
      isCache: "0",
    },
    {
      menuId: 2220,
      parentId: 2200,
      menuName: "角色修改",
      orderNum: 2,
      path: "",
      component: "",
      routeName: "",
      menuType: "F",
      visible: "0",
      status: "0",
      perms: "system:role:edit",
      icon: "",
      query: "",
      isFrame: "1",
      isCache: "0",
    },
    {
      menuId: 2230,
      parentId: 2200,
      menuName: "角色删除",
      orderNum: 3,
      path: "",
      component: "",
      routeName: "",
      menuType: "F",
      visible: "0",
      status: "0",
      perms: "system:role:remove",
      icon: "",
      query: "",
      isFrame: "1",
      isCache: "0",
    },
    {
      menuId: 2300,
      parentId: 2000,
      menuName: "部门管理",
      orderNum: 3,
      path: "dept",
      component: "system/dept/index",
      routeName: "SystemDept",
      menuType: "C",
      visible: "0",
      status: "0",
      perms: "system:dept:list",
      icon: "tree",
      query: "",
      isFrame: "1",
      isCache: "0",
    },
    {
      menuId: 2310,
      parentId: 2300,
      menuName: "部门新增",
      orderNum: 1,
      path: "",
      component: "",
      routeName: "",
      menuType: "F",
      visible: "0",
      status: "0",
      perms: "system:dept:add",
      icon: "",
      query: "",
      isFrame: "1",
      isCache: "0",
    },
    {
      menuId: 2320,
      parentId: 2300,
      menuName: "部门修改",
      orderNum: 2,
      path: "",
      component: "",
      routeName: "",
      menuType: "F",
      visible: "0",
      status: "0",
      perms: "system:dept:edit",
      icon: "",
      query: "",
      isFrame: "1",
      isCache: "0",
    },
    {
      menuId: 2330,
      parentId: 2300,
      menuName: "部门删除",
      orderNum: 3,
      path: "",
      component: "",
      routeName: "",
      menuType: "F",
      visible: "0",
      status: "0",
      perms: "system:dept:remove",
      icon: "",
      query: "",
      isFrame: "1",
      isCache: "0",
    },
    {
      menuId: 2400,
      parentId: 2000,
      menuName: "菜单管理",
      orderNum: 4,
      path: "menu",
      component: "system/menu/index",
      routeName: "SystemMenu",
      menuType: "C",
      visible: "0",
      status: "0",
      perms: "system:menu:list",
      icon: "tree-table",
      query: "",
      isFrame: "1",
      isCache: "0",
    },
    {
      menuId: 2410,
      parentId: 2400,
      menuName: "菜单新增",
      orderNum: 1,
      path: "",
      component: "",
      routeName: "",
      menuType: "F",
      visible: "0",
      status: "0",
      perms: "system:menu:add",
      icon: "",
      query: "",
      isFrame: "1",
      isCache: "0",
    },
    {
      menuId: 2420,
      parentId: 2400,
      menuName: "菜单修改",
      orderNum: 2,
      path: "",
      component: "",
      routeName: "",
      menuType: "F",
      visible: "0",
      status: "0",
      perms: "system:menu:edit",
      icon: "",
      query: "",
      isFrame: "1",
      isCache: "0",
    },
    {
      menuId: 2430,
      parentId: 2400,
      menuName: "菜单删除",
      orderNum: 3,
      path: "",
      component: "",
      routeName: "",
      menuType: "F",
      visible: "0",
      status: "0",
      perms: "system:menu:remove",
      icon: "",
      query: "",
      isFrame: "1",
      isCache: "0",
    },
    {
      menuId: 2500,
      parentId: 2000,
      menuName: "岗位管理",
      orderNum: 5,
      path: "post",
      component: "system/post/index",
      routeName: "SystemPost",
      menuType: "C",
      visible: "0",
      status: "0",
      perms: "system:post:list",
      icon: "post",
      query: "",
      isFrame: "1",
      isCache: "0",
    },
    {
      menuId: 2510,
      parentId: 2500,
      menuName: "岗位新增",
      orderNum: 1,
      path: "",
      component: "",
      routeName: "",
      menuType: "F",
      visible: "0",
      status: "0",
      perms: "system:post:add",
      icon: "",
      query: "",
      isFrame: "1",
      isCache: "0",
    },
    {
      menuId: 2520,
      parentId: 2500,
      menuName: "岗位修改",
      orderNum: 2,
      path: "",
      component: "",
      routeName: "",
      menuType: "F",
      visible: "0",
      status: "0",
      perms: "system:post:edit",
      icon: "",
      query: "",
      isFrame: "1",
      isCache: "0",
    },
    {
      menuId: 2530,
      parentId: 2500,
      menuName: "岗位删除",
      orderNum: 3,
      path: "",
      component: "",
      routeName: "",
      menuType: "F",
      visible: "0",
      status: "0",
      perms: "system:post:remove",
      icon: "",
      query: "",
      isFrame: "1",
      isCache: "0",
    },
    {
      menuId: 2600,
      parentId: 2000,
      menuName: "字典管理",
      orderNum: 6,
      path: "dict",
      component: "system/dict/index",
      routeName: "SystemDict",
      menuType: "C",
      visible: "0",
      status: "0",
      perms: "system:dict:list",
      icon: "dict",
      query: "",
      isFrame: "1",
      isCache: "0",
    },
    {
      menuId: 2610,
      parentId: 2600,
      menuName: "字典新增",
      orderNum: 1,
      path: "",
      component: "",
      routeName: "",
      menuType: "F",
      visible: "0",
      status: "0",
      perms: "system:dict:add",
      icon: "",
      query: "",
      isFrame: "1",
      isCache: "0",
    },
    {
      menuId: 2620,
      parentId: 2600,
      menuName: "字典修改",
      orderNum: 2,
      path: "",
      component: "",
      routeName: "",
      menuType: "F",
      visible: "0",
      status: "0",
      perms: "system:dict:edit",
      icon: "",
      query: "",
      isFrame: "1",
      isCache: "0",
    },
    {
      menuId: 2630,
      parentId: 2600,
      menuName: "字典删除",
      orderNum: 3,
      path: "",
      component: "",
      routeName: "",
      menuType: "F",
      visible: "0",
      status: "0",
      perms: "system:dict:remove",
      icon: "",
      query: "",
      isFrame: "1",
      isCache: "0",
    },
    {
      menuId: 2700,
      parentId: 2000,
      menuName: "参数配置",
      orderNum: 7,
      path: "config",
      component: "system/config/index",
      routeName: "SystemConfig",
      menuType: "C",
      visible: "0",
      status: "0",
      perms: "system:config:list",
      icon: "edit",
      query: "",
      isFrame: "1",
      isCache: "0",
    },
    {
      menuId: 2710,
      parentId: 2700,
      menuName: "参数新增",
      orderNum: 1,
      path: "",
      component: "",
      routeName: "",
      menuType: "F",
      visible: "0",
      status: "0",
      perms: "system:config:add",
      icon: "",
      query: "",
      isFrame: "1",
      isCache: "0",
    },
    {
      menuId: 2720,
      parentId: 2700,
      menuName: "参数修改",
      orderNum: 2,
      path: "",
      component: "",
      routeName: "",
      menuType: "F",
      visible: "0",
      status: "0",
      perms: "system:config:edit",
      icon: "",
      query: "",
      isFrame: "1",
      isCache: "0",
    },
    {
      menuId: 2730,
      parentId: 2700,
      menuName: "参数删除",
      orderNum: 3,
      path: "",
      component: "",
      routeName: "",
      menuType: "F",
      visible: "0",
      status: "0",
      perms: "system:config:remove",
      icon: "",
      query: "",
      isFrame: "1",
      isCache: "0",
    },
    {
      menuId: 2800,
      parentId: 2000,
      menuName: "通知公告",
      orderNum: 8,
      path: "notice",
      component: "system/notice/index",
      routeName: "SystemNotice",
      menuType: "C",
      visible: "0",
      status: "0",
      perms: "system:notice:list",
      icon: "message",
      query: "",
      isFrame: "1",
      isCache: "0",
    },
    {
      menuId: 2810,
      parentId: 2800,
      menuName: "公告新增",
      orderNum: 1,
      path: "",
      component: "",
      routeName: "",
      menuType: "F",
      visible: "0",
      status: "0",
      perms: "system:notice:add",
      icon: "",
      query: "",
      isFrame: "1",
      isCache: "0",
    },
    {
      menuId: 2820,
      parentId: 2800,
      menuName: "公告修改",
      orderNum: 2,
      path: "",
      component: "",
      routeName: "",
      menuType: "F",
      visible: "0",
      status: "0",
      perms: "system:notice:edit",
      icon: "",
      query: "",
      isFrame: "1",
      isCache: "0",
    },
    {
      menuId: 2830,
      parentId: 2800,
      menuName: "公告删除",
      orderNum: 3,
      path: "",
      component: "",
      routeName: "",
      menuType: "F",
      visible: "0",
      status: "0",
      perms: "system:notice:remove",
      icon: "",
      query: "",
      isFrame: "1",
      isCache: "0",
    },
    {
      menuId: 2145,
      parentId: 2100,
      menuName: "用户导出",
      orderNum: 5,
      path: "",
      component: "",
      routeName: "",
      menuType: "F",
      visible: "0",
      status: "0",
      perms: "system:user:export",
      icon: "",
      query: "",
      isFrame: "1",
      isCache: "0",
    },
    {
      menuId: 2235,
      parentId: 2200,
      menuName: "角色导出",
      orderNum: 4,
      path: "",
      component: "",
      routeName: "",
      menuType: "F",
      visible: "0",
      status: "0",
      perms: "system:role:export",
      icon: "",
      query: "",
      isFrame: "1",
      isCache: "0",
    },
    {
      menuId: 2535,
      parentId: 2500,
      menuName: "岗位导出",
      orderNum: 4,
      path: "",
      component: "",
      routeName: "",
      menuType: "F",
      visible: "0",
      status: "0",
      perms: "system:post:export",
      icon: "",
      query: "",
      isFrame: "1",
      isCache: "0",
    },
    {
      menuId: 2635,
      parentId: 2600,
      menuName: "字典导出",
      orderNum: 4,
      path: "",
      component: "",
      routeName: "",
      menuType: "F",
      visible: "0",
      status: "0",
      perms: "system:dict:export",
      icon: "",
      query: "",
      isFrame: "1",
      isCache: "0",
    },
    {
      menuId: 2735,
      parentId: 2700,
      menuName: "参数导出",
      orderNum: 4,
      path: "",
      component: "",
      routeName: "",
      menuType: "F",
      visible: "0",
      status: "0",
      perms: "system:config:export",
      icon: "",
      query: "",
      isFrame: "1",
      isCache: "0",
    },
    {
      menuId: 2900,
      parentId: 0,
      menuName: "平台能力",
      orderNum: 9,
      path: "/platform",
      component: "Layout",
      routeName: "PlatformCapabilities",
      menuType: "M",
      visible: "0",
      status: "0",
      perms: "",
      icon: "monitor",
      query: "",
      isFrame: "1",
      isCache: "0",
    },
    {
      menuId: 2910,
      parentId: 2900,
      menuName: "首页报表",
      orderNum: 1,
      path: "reporting/home",
      component: "reporting/home/index",
      routeName: "ReportingHome",
      menuType: "C",
      visible: "0",
      status: "0",
      perms: "reporting:home:view",
      icon: "dashboard",
      query: "",
      isFrame: "1",
      isCache: "0",
    },
    {
      menuId: 2911,
      parentId: 2900,
      menuName: "库存汇总报表",
      orderNum: 2,
      path: "reporting/inventory-summary",
      component: "reporting/inventory-summary/index",
      routeName: "InventorySummary",
      menuType: "C",
      visible: "0",
      status: "0",
      perms: "reporting:inventory-summary:view",
      icon: "chart",
      query: "",
      isFrame: "1",
      isCache: "0",
    },
    {
      menuId: 2912,
      parentId: 2900,
      menuName: "物料类别汇总",
      orderNum: 3,
      path: "reporting/material-category-summary",
      component: "reporting/material-category-summary/index",
      routeName: "MaterialCategorySummary",
      menuType: "C",
      visible: "0",
      status: "0",
      perms: "reporting:material-category-summary:view",
      icon: "chart",
      query: "",
      isFrame: "1",
      isCache: "0",
    },
    {
      menuId: 2913,
      parentId: 2900,
      menuName: "趋势报表",
      orderNum: 4,
      path: "reporting/trends",
      component: "reporting/trends/index",
      routeName: "ReportingTrends",
      menuType: "C",
      visible: "0",
      status: "0",
      perms: "reporting:trends:view",
      icon: "chart",
      query: "",
      isFrame: "1",
      isCache: "0",
    },
    {
      menuId: 2914,
      parentId: 2900,
      menuName: "报表导出",
      orderNum: 5,
      path: "",
      component: "",
      routeName: "",
      menuType: "F",
      visible: "0",
      status: "0",
      perms: "reporting:export",
      icon: "",
      query: "",
      isFrame: "1",
      isCache: "0",
    },
    {
      menuId: 2920,
      parentId: 2900,
      menuName: "在线用户",
      orderNum: 6,
      path: "online",
      component: "monitor/online/index",
      routeName: "OnlineUsers",
      menuType: "C",
      visible: "0",
      status: "0",
      perms: "monitor:online:list",
      icon: "user",
      query: "",
      isFrame: "1",
      isCache: "0",
    },
    {
      menuId: 2921,
      parentId: 2920,
      menuName: "强退在线用户",
      orderNum: 1,
      path: "",
      component: "",
      routeName: "",
      menuType: "F",
      visible: "0",
      status: "0",
      perms: "monitor:online:forceLogout",
      icon: "",
      query: "",
      isFrame: "1",
      isCache: "0",
    },
    {
      menuId: 2930,
      parentId: 2900,
      menuName: "登录日志",
      orderNum: 7,
      path: "logininfor",
      component: "monitor/logininfor/index",
      routeName: "LoginLogs",
      menuType: "C",
      visible: "0",
      status: "0",
      perms: "audit:login-log:list",
      icon: "form",
      query: "",
      isFrame: "1",
      isCache: "0",
    },
    {
      menuId: 2931,
      parentId: 2930,
      menuName: "删除登录日志",
      orderNum: 1,
      path: "",
      component: "",
      routeName: "",
      menuType: "F",
      visible: "0",
      status: "0",
      perms: "audit:login-log:delete",
      icon: "",
      query: "",
      isFrame: "1",
      isCache: "0",
    },
    {
      menuId: 2940,
      parentId: 2900,
      menuName: "操作日志",
      orderNum: 8,
      path: "operlog",
      component: "monitor/operlog/index",
      routeName: "OperLogs",
      menuType: "C",
      visible: "0",
      status: "0",
      perms: "audit:oper-log:list",
      icon: "form",
      query: "",
      isFrame: "1",
      isCache: "0",
    },
    {
      menuId: 2941,
      parentId: 2940,
      menuName: "删除操作日志",
      orderNum: 1,
      path: "",
      component: "",
      routeName: "",
      menuType: "F",
      visible: "0",
      status: "0",
      perms: "audit:oper-log:delete",
      icon: "",
      query: "",
      isFrame: "1",
      isCache: "0",
    },
    {
      menuId: 3000,
      parentId: 0,
      menuName: "基础资料权限",
      orderNum: 10,
      path: "/base-auth",
      component: "Layout",
      routeName: "MasterDataPermissions",
      menuType: "M",
      visible: "0",
      status: "0",
      perms: "",
      icon: "tree-table",
      query: "",
      isFrame: "1",
      isCache: "0",
    },
    {
      menuId: 3010,
      parentId: 3000,
      menuName: "物料资料",
      orderNum: 1,
      path: "material",
      component: "base/material/index",
      routeName: "BaseMaterial",
      menuType: "C",
      visible: "0",
      status: "0",
      perms: "master:material:list",
      icon: "list",
      query: "",
      isFrame: "1",
      isCache: "0",
    },
    {
      menuId: 3011,
      parentId: 3010,
      menuName: "物料新增",
      orderNum: 1,
      path: "",
      component: "",
      routeName: "",
      menuType: "F",
      visible: "0",
      status: "0",
      perms: "master:material:create",
      icon: "",
      query: "",
      isFrame: "1",
      isCache: "0",
    },
    {
      menuId: 3012,
      parentId: 3010,
      menuName: "物料修改",
      orderNum: 2,
      path: "",
      component: "",
      routeName: "",
      menuType: "F",
      visible: "0",
      status: "0",
      perms: "master:material:update",
      icon: "",
      query: "",
      isFrame: "1",
      isCache: "0",
    },
    {
      menuId: 3020,
      parentId: 3000,
      menuName: "客户资料",
      orderNum: 2,
      path: "customer",
      component: "base/customer/index",
      routeName: "BaseCustomer",
      menuType: "C",
      visible: "0",
      status: "0",
      perms: "master:customer:list",
      icon: "peoples",
      query: "",
      isFrame: "1",
      isCache: "0",
    },
    {
      menuId: 3030,
      parentId: 3000,
      menuName: "供应商资料",
      orderNum: 3,
      path: "supplier",
      component: "base/supplier/index",
      routeName: "BaseSupplier",
      menuType: "C",
      visible: "0",
      status: "0",
      perms: "master:supplier:list",
      icon: "peoples",
      query: "",
      isFrame: "1",
      isCache: "0",
    },
    {
      menuId: 3040,
      parentId: 3000,
      menuName: "人员资料",
      orderNum: 4,
      path: "personnel",
      component: "base/personnel/index",
      routeName: "BasePersonnel",
      menuType: "C",
      visible: "0",
      status: "0",
      perms: "master:personnel:list",
      icon: "user",
      query: "",
      isFrame: "1",
      isCache: "0",
    },
    {
      menuId: 3050,
      parentId: 3000,
      menuName: "车间资料",
      orderNum: 5,
      path: "workshop",
      component: "base/workshop/index",
      routeName: "BaseWorkshop",
      menuType: "C",
      visible: "0",
      status: "0",
      perms: "master:workshop:list",
      icon: "tree",
      query: "",
      isFrame: "1",
      isCache: "0",
    },
    {
      menuId: 3100,
      parentId: 0,
      menuName: "入库业务权限",
      orderNum: 11,
      path: "/entry-auth",
      component: "Layout",
      routeName: "InboundPermissions",
      menuType: "M",
      visible: "0",
      status: "0",
      perms: "",
      icon: "edit",
      query: "",
      isFrame: "1",
      isCache: "0",
    },
    {
      menuId: 3110,
      parentId: 3100,
      menuName: "普通入库",
      orderNum: 1,
      path: "order",
      component: "entry/order/index",
      routeName: "EntryOrder",
      menuType: "C",
      visible: "0",
      status: "0",
      perms: "inbound:order:list",
      icon: "edit",
      query: "",
      isFrame: "1",
      isCache: "0",
    },
    {
      menuId: 3111,
      parentId: 3110,
      menuName: "普通入库新增",
      orderNum: 1,
      path: "",
      component: "",
      routeName: "",
      menuType: "F",
      visible: "0",
      status: "0",
      perms: "inbound:order:create",
      icon: "",
      query: "",
      isFrame: "1",
      isCache: "0",
    },
    {
      menuId: 3112,
      parentId: 3110,
      menuName: "普通入库修改",
      orderNum: 2,
      path: "",
      component: "",
      routeName: "",
      menuType: "F",
      visible: "0",
      status: "0",
      perms: "inbound:order:update",
      icon: "",
      query: "",
      isFrame: "1",
      isCache: "0",
    },
    {
      menuId: 3113,
      parentId: 3110,
      menuName: "普通入库作废",
      orderNum: 3,
      path: "",
      component: "",
      routeName: "",
      menuType: "F",
      visible: "0",
      status: "0",
      perms: "inbound:order:void",
      icon: "",
      query: "",
      isFrame: "1",
      isCache: "0",
    },
    {
      menuId: 3120,
      parentId: 3100,
      menuName: "生产入库",
      orderNum: 2,
      path: "intoOrder",
      component: "entry/intoOrder/index",
      routeName: "EntryIntoOrder",
      menuType: "C",
      visible: "0",
      status: "0",
      perms: "inbound:into-order:list",
      icon: "edit",
      query: "",
      isFrame: "1",
      isCache: "0",
    },
    {
      menuId: 3121,
      parentId: 3120,
      menuName: "生产入库新增",
      orderNum: 1,
      path: "",
      component: "",
      routeName: "",
      menuType: "F",
      visible: "0",
      status: "0",
      perms: "inbound:into-order:create",
      icon: "",
      query: "",
      isFrame: "1",
      isCache: "0",
    },
    {
      menuId: 3122,
      parentId: 3120,
      menuName: "生产入库修改",
      orderNum: 2,
      path: "",
      component: "",
      routeName: "",
      menuType: "F",
      visible: "0",
      status: "0",
      perms: "inbound:into-order:update",
      icon: "",
      query: "",
      isFrame: "1",
      isCache: "0",
    },
    {
      menuId: 3123,
      parentId: 3120,
      menuName: "生产入库作废",
      orderNum: 3,
      path: "",
      component: "",
      routeName: "",
      menuType: "F",
      visible: "0",
      status: "0",
      perms: "inbound:into-order:void",
      icon: "",
      query: "",
      isFrame: "1",
      isCache: "0",
    },
    {
      menuId: 3200,
      parentId: 0,
      menuName: "车间物料权限",
      orderNum: 12,
      path: "/take-auth",
      component: "Layout",
      routeName: "WorkshopMaterialPermissions",
      menuType: "M",
      visible: "0",
      status: "0",
      perms: "",
      icon: "list",
      query: "",
      isFrame: "1",
      isCache: "0",
    },
    {
      menuId: 3210,
      parentId: 3200,
      menuName: "领料单",
      orderNum: 1,
      path: "pickOrder",
      component: "take/pickOrder/index",
      routeName: "TakePickOrder",
      menuType: "C",
      visible: "0",
      status: "0",
      perms: "workshop-material:pick-order:list",
      icon: "list",
      query: "",
      isFrame: "1",
      isCache: "0",
    },
    {
      menuId: 3211,
      parentId: 3210,
      menuName: "领料单新增",
      orderNum: 1,
      path: "",
      component: "",
      routeName: "",
      menuType: "F",
      visible: "0",
      status: "0",
      perms: "workshop-material:pick-order:create",
      icon: "",
      query: "",
      isFrame: "1",
      isCache: "0",
    },
    {
      menuId: 3212,
      parentId: 3210,
      menuName: "领料单作废",
      orderNum: 2,
      path: "",
      component: "",
      routeName: "",
      menuType: "F",
      visible: "0",
      status: "0",
      perms: "workshop-material:pick-order:void",
      icon: "",
      query: "",
      isFrame: "1",
      isCache: "0",
    },
    {
      menuId: 3220,
      parentId: 3200,
      menuName: "退料单",
      orderNum: 2,
      path: "returnOrder",
      component: "take/returnOrder/index",
      routeName: "TakeReturnOrder",
      menuType: "C",
      visible: "0",
      status: "0",
      perms: "workshop-material:return-order:list",
      icon: "list",
      query: "",
      isFrame: "1",
      isCache: "0",
    },
    {
      menuId: 3221,
      parentId: 3220,
      menuName: "退料单新增",
      orderNum: 1,
      path: "",
      component: "",
      routeName: "",
      menuType: "F",
      visible: "0",
      status: "0",
      perms: "workshop-material:return-order:create",
      icon: "",
      query: "",
      isFrame: "1",
      isCache: "0",
    },
    {
      menuId: 3222,
      parentId: 3220,
      menuName: "退料单作废",
      orderNum: 2,
      path: "",
      component: "",
      routeName: "",
      menuType: "F",
      visible: "0",
      status: "0",
      perms: "workshop-material:return-order:void",
      icon: "",
      query: "",
      isFrame: "1",
      isCache: "0",
    },
    {
      menuId: 3230,
      parentId: 3200,
      menuName: "报废单",
      orderNum: 3,
      path: "scrapOrder",
      component: "stock/scrapOrder/index",
      routeName: "StockScrapOrder",
      menuType: "C",
      visible: "0",
      status: "0",
      perms: "workshop-material:scrap-order:list",
      icon: "list",
      query: "",
      isFrame: "1",
      isCache: "0",
    },
    {
      menuId: 3231,
      parentId: 3230,
      menuName: "报废单新增",
      orderNum: 1,
      path: "",
      component: "",
      routeName: "",
      menuType: "F",
      visible: "0",
      status: "0",
      perms: "workshop-material:scrap-order:create",
      icon: "",
      query: "",
      isFrame: "1",
      isCache: "0",
    },
    {
      menuId: 3232,
      parentId: 3230,
      menuName: "报废单作废",
      orderNum: 2,
      path: "",
      component: "",
      routeName: "",
      menuType: "F",
      visible: "0",
      status: "0",
      perms: "workshop-material:scrap-order:void",
      icon: "",
      query: "",
      isFrame: "1",
      isCache: "0",
    },
    {
      menuId: 3300,
      parentId: 0,
      menuName: "库存管理权限",
      orderNum: 13,
      path: "/stock-auth",
      component: "Layout",
      routeName: "InventoryPermissions",
      menuType: "M",
      visible: "0",
      status: "0",
      perms: "",
      icon: "chart",
      query: "",
      isFrame: "1",
      isCache: "0",
    },
    {
      menuId: 3310,
      parentId: 3300,
      menuName: "库存余额",
      orderNum: 1,
      path: "inventory",
      component: "stock/inventory/index",
      routeName: "StockInventory",
      menuType: "C",
      visible: "0",
      status: "0",
      perms: "inventory:balance:list",
      icon: "chart",
      query: "",
      isFrame: "1",
      isCache: "0",
    },
    {
      menuId: 3320,
      parentId: 3300,
      menuName: "库存流水",
      orderNum: 2,
      path: "log",
      component: "stock/log/index",
      routeName: "StockLog",
      menuType: "C",
      visible: "0",
      status: "0",
      perms: "inventory:log:list",
      icon: "chart",
      query: "",
      isFrame: "1",
      isCache: "0",
    },
    {
      menuId: 3330,
      parentId: 3300,
      menuName: "来源追踪",
      orderNum: 3,
      path: "used",
      component: "stock/used/index",
      routeName: "StockUsed",
      menuType: "C",
      visible: "0",
      status: "0",
      perms: "inventory:source-usage:list",
      icon: "chart",
      query: "",
      isFrame: "1",
      isCache: "0",
    },
    {
      menuId: 3340,
      parentId: 3300,
      menuName: "厂编区间",
      orderNum: 4,
      path: "interval",
      component: "stock/interval/index",
      routeName: "StockInterval",
      menuType: "C",
      visible: "0",
      status: "0",
      perms: "inventory:factory-number:list",
      icon: "chart",
      query: "",
      isFrame: "1",
      isCache: "0",
    },
    {
      menuId: 3400,
      parentId: 0,
      menuName: "销售管理权限",
      orderNum: 14,
      path: "/customer-auth",
      component: "Layout",
      routeName: "CustomerPermissions",
      menuType: "M",
      visible: "0",
      status: "0",
      perms: "",
      icon: "peoples",
      query: "",
      isFrame: "1",
      isCache: "0",
    },
    {
      menuId: 3410,
      parentId: 3400,
      menuName: "客户出库",
      orderNum: 1,
      path: "order",
      component: "customer/order/index",
      routeName: "CustomerOrder",
      menuType: "C",
      visible: "0",
      status: "0",
      perms: "customer:order:list",
      icon: "peoples",
      query: "",
      isFrame: "1",
      isCache: "0",
    },
    {
      menuId: 3411,
      parentId: 3410,
      menuName: "客户出库新增",
      orderNum: 1,
      path: "",
      component: "",
      routeName: "",
      menuType: "F",
      visible: "0",
      status: "0",
      perms: "customer:order:create",
      icon: "",
      query: "",
      isFrame: "1",
      isCache: "0",
    },
    {
      menuId: 3412,
      parentId: 3410,
      menuName: "客户出库修改",
      orderNum: 2,
      path: "",
      component: "",
      routeName: "",
      menuType: "F",
      visible: "0",
      status: "0",
      perms: "customer:order:update",
      icon: "",
      query: "",
      isFrame: "1",
      isCache: "0",
    },
    {
      menuId: 3413,
      parentId: 3410,
      menuName: "客户出库作废",
      orderNum: 3,
      path: "",
      component: "",
      routeName: "",
      menuType: "F",
      visible: "0",
      status: "0",
      perms: "customer:order:void",
      icon: "",
      query: "",
      isFrame: "1",
      isCache: "0",
    },
    {
      menuId: 3420,
      parentId: 3400,
      menuName: "销售退货",
      orderNum: 2,
      path: "salesReturnOrder",
      component: "customer/salesReturnOrder/index",
      routeName: "CustomerSalesReturnOrder",
      menuType: "C",
      visible: "0",
      status: "0",
      perms: "customer:sales-return:list",
      icon: "peoples",
      query: "",
      isFrame: "1",
      isCache: "0",
    },
    {
      menuId: 3421,
      parentId: 3420,
      menuName: "销售退货新增",
      orderNum: 1,
      path: "",
      component: "",
      routeName: "",
      menuType: "F",
      visible: "0",
      status: "0",
      perms: "customer:sales-return:create",
      icon: "",
      query: "",
      isFrame: "1",
      isCache: "0",
    },
    {
      menuId: 3422,
      parentId: 3420,
      menuName: "销售退货作废",
      orderNum: 2,
      path: "",
      component: "",
      routeName: "",
      menuType: "F",
      visible: "0",
      status: "0",
      perms: "customer:sales-return:void",
      icon: "",
      query: "",
      isFrame: "1",
      isCache: "0",
    },
    {
      menuId: 3500,
      parentId: 0,
      menuName: "研发协同权限",
      orderNum: 15,
      path: "/rd-auth",
      component: "Layout",
      routeName: "RdPermissions",
      menuType: "M",
      visible: "0",
      status: "0",
      perms: "",
      icon: "list",
      query: "",
      isFrame: "1",
      isCache: "0",
    },
    {
      menuId: 3510,
      parentId: 3500,
      menuName: "RD 工作台",
      orderNum: 1,
      path: "workbench",
      component: "rd/workbench/index",
      routeName: "RdWorkbench",
      menuType: "C",
      visible: "0",
      status: "0",
      perms: "rd:workbench:view",
      icon: "dashboard",
      query: "",
      isFrame: "1",
      isCache: "0",
    },
    {
      menuId: 3520,
      parentId: 3500,
      menuName: "RD 采购需求",
      orderNum: 2,
      path: "procurement-requests",
      component: "rd/procurement-requests/index",
      routeName: "RdProcurementRequests",
      menuType: "C",
      visible: "0",
      status: "0",
      perms: "rd:procurement-request:list",
      icon: "edit",
      query: "",
      isFrame: "1",
      isCache: "0",
    },
    {
      menuId: 3521,
      parentId: 3520,
      menuName: "RD 采购需求新增",
      orderNum: 1,
      path: "",
      component: "",
      routeName: "",
      menuType: "F",
      visible: "0",
      status: "0",
      perms: "rd:procurement-request:create",
      icon: "",
      query: "",
      isFrame: "1",
      isCache: "0",
    },
    {
      menuId: 3522,
      parentId: 3520,
      menuName: "RD 采购需求作废",
      orderNum: 2,
      path: "",
      component: "",
      routeName: "",
      menuType: "F",
      visible: "0",
      status: "0",
      perms: "rd:procurement-request:void",
      icon: "",
      query: "",
      isFrame: "1",
      isCache: "0",
    },
    {
      menuId: 3523,
      parentId: 3520,
      menuName: "RD 采购状态动作",
      orderNum: 3,
      path: "",
      component: "",
      routeName: "",
      menuType: "F",
      visible: "0",
      status: "0",
      perms: "rd:procurement-request:status-action",
      icon: "",
      query: "",
      isFrame: "1",
      isCache: "0",
    },
    {
      menuId: 3524,
      parentId: 3520,
      menuName: "RD 采购退回动作",
      orderNum: 4,
      path: "",
      component: "",
      routeName: "",
      menuType: "F",
      visible: "0",
      status: "0",
      perms: "rd:procurement-request:return-action",
      icon: "",
      query: "",
      isFrame: "1",
      isCache: "0",
    },
    {
      menuId: 3530,
      parentId: 3500,
      menuName: "RD 交接结果",
      orderNum: 3,
      path: "handoff-results",
      component: "rd/inbound-results/index",
      routeName: "RdInboundResults",
      menuType: "C",
      visible: "0",
      status: "0",
      perms: "rd:handoff-order:list",
      icon: "list",
      query: "",
      isFrame: "1",
      isCache: "0",
    },
    {
      menuId: 3531,
      parentId: 3530,
      menuName: "RD 交接新增",
      orderNum: 1,
      path: "",
      component: "",
      routeName: "",
      menuType: "F",
      visible: "0",
      status: "0",
      perms: "rd:handoff-order:create",
      icon: "",
      query: "",
      isFrame: "1",
      isCache: "0",
    },
    {
      menuId: 3532,
      parentId: 3530,
      menuName: "RD 交接作废",
      orderNum: 2,
      path: "",
      component: "",
      routeName: "",
      menuType: "F",
      visible: "0",
      status: "0",
      perms: "rd:handoff-order:void",
      icon: "",
      query: "",
      isFrame: "1",
      isCache: "0",
    },
    {
      menuId: 3540,
      parentId: 3500,
      menuName: "RD 盘点单",
      orderNum: 4,
      path: "stocktake-orders",
      component: "rd/stocktake-orders/index",
      routeName: "RdStocktakeOrders",
      menuType: "C",
      visible: "0",
      status: "0",
      perms: "rd:stocktake-order:list",
      icon: "list",
      query: "",
      isFrame: "1",
      isCache: "0",
    },
    {
      menuId: 3541,
      parentId: 3540,
      menuName: "RD 盘点单新增",
      orderNum: 1,
      path: "",
      component: "",
      routeName: "",
      menuType: "F",
      visible: "0",
      status: "0",
      perms: "rd:stocktake-order:create",
      icon: "",
      query: "",
      isFrame: "1",
      isCache: "0",
    },
    {
      menuId: 3542,
      parentId: 3540,
      menuName: "RD 盘点单作废",
      orderNum: 2,
      path: "",
      component: "",
      routeName: "",
      menuType: "F",
      visible: "0",
      status: "0",
      perms: "rd:stocktake-order:void",
      icon: "",
      query: "",
      isFrame: "1",
      isCache: "0",
    },
    {
      menuId: 3600,
      parentId: 0,
      menuName: "项目管理权限",
      orderNum: 16,
      path: "/project-auth",
      component: "Layout",
      routeName: "ProjectPermissions",
      menuType: "M",
      visible: "0",
      status: "0",
      perms: "",
      icon: "tree-table",
      query: "",
      isFrame: "1",
      isCache: "0",
    },
    {
      menuId: 3610,
      parentId: 3600,
      menuName: "项目台账",
      orderNum: 1,
      path: "projects",
      component: "rd/project-consumption/index",
      routeName: "RdProjectConsumption",
      menuType: "C",
      visible: "0",
      status: "0",
      perms: "project:list",
      icon: "tree-table",
      query: "",
      isFrame: "1",
      isCache: "0",
    },
    {
      menuId: 3611,
      parentId: 3610,
      menuName: "项目详情",
      orderNum: 1,
      path: "",
      component: "",
      routeName: "",
      menuType: "F",
      visible: "0",
      status: "0",
      perms: "project:get",
      icon: "",
      query: "",
      isFrame: "1",
      isCache: "0",
    },
    {
      menuId: 3612,
      parentId: 3610,
      menuName: "项目新增",
      orderNum: 2,
      path: "",
      component: "",
      routeName: "",
      menuType: "F",
      visible: "0",
      status: "0",
      perms: "project:create",
      icon: "",
      query: "",
      isFrame: "1",
      isCache: "0",
    },
    {
      menuId: 3613,
      parentId: 3610,
      menuName: "项目修改",
      orderNum: 3,
      path: "",
      component: "",
      routeName: "",
      menuType: "F",
      visible: "0",
      status: "0",
      perms: "project:update",
      icon: "",
      query: "",
      isFrame: "1",
      isCache: "0",
    },
    {
      menuId: 3614,
      parentId: 3610,
      menuName: "项目作废",
      orderNum: 4,
      path: "",
      component: "",
      routeName: "",
      menuType: "F",
      visible: "0",
      status: "0",
      perms: "project:void",
      icon: "",
      query: "",
      isFrame: "1",
      isCache: "0",
    },
    {
      menuId: 3700,
      parentId: 0,
      menuName: "工作流权限",
      orderNum: 17,
      path: "/workflow-auth",
      component: "Layout",
      routeName: "WorkflowPermissions",
      menuType: "M",
      visible: "0",
      status: "0",
      perms: "",
      icon: "edit",
      query: "",
      isFrame: "1",
      isCache: "0",
    },
    {
      menuId: 3710,
      parentId: 3700,
      menuName: "审核状态",
      orderNum: 1,
      path: "audit-status",
      component: "",
      routeName: "",
      menuType: "C",
      visible: "0",
      status: "0",
      perms: "workflow:audit:status",
      icon: "edit",
      query: "",
      isFrame: "1",
      isCache: "0",
    },
    {
      menuId: 3711,
      parentId: 3700,
      menuName: "审核列表",
      orderNum: 2,
      path: "audits",
      component: "",
      routeName: "",
      menuType: "C",
      visible: "0",
      status: "0",
      perms: "workflow:audit:list",
      icon: "edit",
      query: "",
      isFrame: "1",
      isCache: "0",
    },
    {
      menuId: 3712,
      parentId: 3711,
      menuName: "发起审核",
      orderNum: 1,
      path: "",
      component: "",
      routeName: "",
      menuType: "F",
      visible: "0",
      status: "0",
      perms: "workflow:audit:create",
      icon: "",
      query: "",
      isFrame: "1",
      isCache: "0",
    },
    {
      menuId: 3713,
      parentId: 3711,
      menuName: "审核通过",
      orderNum: 2,
      path: "",
      component: "",
      routeName: "",
      menuType: "F",
      visible: "0",
      status: "0",
      perms: "workflow:audit:approve",
      icon: "",
      query: "",
      isFrame: "1",
      isCache: "0",
    },
    {
      menuId: 3714,
      parentId: 3711,
      menuName: "审核驳回",
      orderNum: 3,
      path: "",
      component: "",
      routeName: "",
      menuType: "F",
      visible: "0",
      status: "0",
      perms: "workflow:audit:reject",
      icon: "",
      query: "",
      isFrame: "1",
      isCache: "0",
    },
    {
      menuId: 3715,
      parentId: 3711,
      menuName: "审核重置",
      orderNum: 4,
      path: "",
      component: "",
      routeName: "",
      menuType: "F",
      visible: "0",
      status: "0",
      perms: "workflow:audit:reset",
      icon: "",
      query: "",
      isFrame: "1",
      isCache: "0",
    },
    {
      menuId: 3900,
      parentId: 0,
      menuName: "调度中心权限",
      orderNum: 18,
      path: "/scheduler-auth",
      component: "Layout",
      routeName: "SchedulerPermissions",
      menuType: "M",
      visible: "0",
      status: "0",
      perms: "",
      icon: "clock",
      query: "",
      isFrame: "1",
      isCache: "0",
    },
    {
      menuId: 3910,
      parentId: 3900,
      menuName: "调度任务",
      orderNum: 1,
      path: "jobs",
      component: "scheduler/jobs/index",
      routeName: "SchedulerJobs",
      menuType: "C",
      visible: "0",
      status: "0",
      perms: "scheduler:job:list",
      icon: "clock",
      query: "",
      isFrame: "1",
      isCache: "0",
    },
    {
      menuId: 3911,
      parentId: 3910,
      menuName: "新增任务",
      orderNum: 1,
      path: "",
      component: "",
      routeName: "",
      menuType: "F",
      visible: "0",
      status: "0",
      perms: "scheduler:job:create",
      icon: "",
      query: "",
      isFrame: "1",
      isCache: "0",
    },
    {
      menuId: 3912,
      parentId: 3910,
      menuName: "修改任务",
      orderNum: 2,
      path: "",
      component: "",
      routeName: "",
      menuType: "F",
      visible: "0",
      status: "0",
      perms: "scheduler:job:update",
      icon: "",
      query: "",
      isFrame: "1",
      isCache: "0",
    },
    {
      menuId: 3913,
      parentId: 3910,
      menuName: "立即执行",
      orderNum: 3,
      path: "",
      component: "",
      routeName: "",
      menuType: "F",
      visible: "0",
      status: "0",
      perms: "scheduler:job:run",
      icon: "",
      query: "",
      isFrame: "1",
      isCache: "0",
    },
    {
      menuId: 3914,
      parentId: 3910,
      menuName: "暂停恢复",
      orderNum: 4,
      path: "",
      component: "",
      routeName: "",
      menuType: "F",
      visible: "0",
      status: "0",
      perms: "scheduler:job:pause",
      icon: "",
      query: "",
      isFrame: "1",
      isCache: "0",
    },
    {
      menuId: 3915,
      parentId: 3900,
      menuName: "调度日志",
      orderNum: 2,
      path: "job-logs",
      component: "scheduler/job-logs/index",
      routeName: "SchedulerLogs",
      menuType: "C",
      visible: "0",
      status: "0",
      perms: "scheduler:job:log:list",
      icon: "clock",
      query: "",
      isFrame: "1",
      isCache: "0",
    },
    {
      menuId: 3950,
      parentId: 0,
      menuName: "AI 助手权限",
      orderNum: 19,
      path: "/ai-auth",
      component: "Layout",
      routeName: "AiPermissions",
      menuType: "M",
      visible: "0",
      status: "0",
      perms: "",
      icon: "message",
      query: "",
      isFrame: "1",
      isCache: "0",
    },
    {
      menuId: 3951,
      parentId: 3950,
      menuName: "AI 对话",
      orderNum: 1,
      path: "chat",
      component: "ai/assistant/index",
      routeName: "AiAssistant",
      menuType: "C",
      visible: "0",
      status: "0",
      perms: "ai:chat",
      icon: "message",
      query: "",
      isFrame: "1",
      isCache: "0",
    },
    {
      menuId: 3952,
      parentId: 3951,
      menuName: "AI 工具列表",
      orderNum: 1,
      path: "",
      component: "",
      routeName: "",
      menuType: "F",
      visible: "0",
      status: "0",
      perms: "ai:tools:list",
      icon: "",
      query: "",
      isFrame: "1",
      isCache: "0",
    },
  ];

  private roles: ManagedRoleRecord[] = [
    {
      roleId: 1,
      roleName: "系统管理员",
      roleKey: "admin",
      roleSort: 1,
      status: "0",
      dataScope: "1",
      menuCheckStrictly: true,
      deptCheckStrictly: true,
      menuIds: [],
      deptIds: [100, 200, 300],
      remark: "超级管理员角色",
      createTime: "2026-03-01T09:00:00.000Z",
    },
    {
      roleId: 2,
      roleName: "仓库管理员",
      roleKey: "warehouse-manager",
      roleSort: 2,
      status: "0",
      dataScope: "3",
      menuCheckStrictly: true,
      deptCheckStrictly: true,
      menuIds: [],
      deptIds: [300],
      remark: "主仓与公司级实物流转角色",
      createTime: "2026-03-01T09:00:00.000Z",
    },
    {
      roleId: 3,
      roleName: "研发小仓管理员",
      roleKey: "rd-operator",
      roleSort: 3,
      status: "0",
      dataScope: "3",
      menuCheckStrictly: true,
      deptCheckStrictly: true,
      menuIds: [],
      deptIds: [100],
      remark: "研发小仓专属角色",
      createTime: "2026-03-01T09:00:00.000Z",
    },
    {
      roleId: 4,
      roleName: "采购人员",
      roleKey: "procurement",
      roleSort: 4,
      status: "0",
      dataScope: "3",
      menuCheckStrictly: true,
      deptCheckStrictly: true,
      menuIds: [],
      deptIds: [200],
      remark: "采购执行与验收回看角色",
      createTime: "2026-03-01T09:00:00.000Z",
    },
  ];

  private dictTypes: ManagedDictTypeRecord[] = [
    {
      dictId: 1,
      dictName: "通用状态",
      dictType: "sys_normal_disable",
      status: "0",
      remark: "启用停用状态",
      createTime: "2026-03-01T09:00:00.000Z",
    },
    {
      dictId: 2,
      dictName: "用户性别",
      dictType: "sys_user_sex",
      status: "0",
      remark: "用户性别字典",
      createTime: "2026-03-01T09:00:00.000Z",
    },
    {
      dictId: 3,
      dictName: "系统内置",
      dictType: "sys_yes_no",
      status: "0",
      remark: "系统内置字典",
      createTime: "2026-03-01T09:00:00.000Z",
    },
    {
      dictId: 4,
      dictName: "公告类型",
      dictType: "sys_notice_type",
      status: "0",
      remark: "通知公告类型",
      createTime: "2026-03-01T09:00:00.000Z",
    },
    {
      dictId: 5,
      dictName: "公告状态",
      dictType: "sys_notice_status",
      status: "0",
      remark: "通知公告状态",
      createTime: "2026-03-01T09:00:00.000Z",
    },
  ];

  private dictData: ManagedDictDataRecord[] = [
    {
      dictCode: 1,
      dictSort: 1,
      dictLabel: "正常",
      dictValue: "0",
      dictType: "sys_normal_disable",
      cssClass: "",
      listClass: "success",
      isDefault: "Y",
      status: "0",
      remark: "默认启用",
      createTime: "2026-03-01T09:00:00.000Z",
    },
    {
      dictCode: 2,
      dictSort: 2,
      dictLabel: "停用",
      dictValue: "1",
      dictType: "sys_normal_disable",
      cssClass: "",
      listClass: "danger",
      isDefault: "N",
      status: "0",
      remark: "停用状态",
      createTime: "2026-03-01T09:00:00.000Z",
    },
    {
      dictCode: 3,
      dictSort: 1,
      dictLabel: "男",
      dictValue: "0",
      dictType: "sys_user_sex",
      cssClass: "",
      listClass: "",
      isDefault: "Y",
      status: "0",
      remark: "",
      createTime: "2026-03-01T09:00:00.000Z",
    },
    {
      dictCode: 4,
      dictSort: 2,
      dictLabel: "女",
      dictValue: "1",
      dictType: "sys_user_sex",
      cssClass: "",
      listClass: "",
      isDefault: "N",
      status: "0",
      remark: "",
      createTime: "2026-03-01T09:00:00.000Z",
    },
    {
      dictCode: 5,
      dictSort: 3,
      dictLabel: "未知",
      dictValue: "2",
      dictType: "sys_user_sex",
      cssClass: "",
      listClass: "info",
      isDefault: "N",
      status: "0",
      remark: "",
      createTime: "2026-03-01T09:00:00.000Z",
    },
    {
      dictCode: 6,
      dictSort: 1,
      dictLabel: "是",
      dictValue: "Y",
      dictType: "sys_yes_no",
      cssClass: "",
      listClass: "success",
      isDefault: "Y",
      status: "0",
      remark: "",
      createTime: "2026-03-01T09:00:00.000Z",
    },
    {
      dictCode: 7,
      dictSort: 2,
      dictLabel: "否",
      dictValue: "N",
      dictType: "sys_yes_no",
      cssClass: "",
      listClass: "warning",
      isDefault: "N",
      status: "0",
      remark: "",
      createTime: "2026-03-01T09:00:00.000Z",
    },
    {
      dictCode: 8,
      dictSort: 1,
      dictLabel: "通知",
      dictValue: "1",
      dictType: "sys_notice_type",
      cssClass: "",
      listClass: "primary",
      isDefault: "Y",
      status: "0",
      remark: "",
      createTime: "2026-03-01T09:00:00.000Z",
    },
    {
      dictCode: 9,
      dictSort: 2,
      dictLabel: "公告",
      dictValue: "2",
      dictType: "sys_notice_type",
      cssClass: "",
      listClass: "warning",
      isDefault: "N",
      status: "0",
      remark: "",
      createTime: "2026-03-01T09:00:00.000Z",
    },
    {
      dictCode: 10,
      dictSort: 1,
      dictLabel: "正常",
      dictValue: "0",
      dictType: "sys_notice_status",
      cssClass: "",
      listClass: "success",
      isDefault: "Y",
      status: "0",
      remark: "",
      createTime: "2026-03-01T09:00:00.000Z",
    },
    {
      dictCode: 11,
      dictSort: 2,
      dictLabel: "关闭",
      dictValue: "1",
      dictType: "sys_notice_status",
      cssClass: "",
      listClass: "info",
      isDefault: "N",
      status: "0",
      remark: "",
      createTime: "2026-03-01T09:00:00.000Z",
    },
  ];

  private configs: ManagedConfigRecord[] = [
    {
      configId: 1,
      configName: "用户默认密码",
      configKey: "sys.user.initPassword",
      configValue: "ChangeMe123",
      configType: "Y",
      remark: "用户新增时的初始密码",
      createTime: "2026-03-01T09:00:00.000Z",
    },
    {
      configId: 2,
      configName: "系统标题",
      configKey: "sys.app.title",
      configValue: "Saifute WMS",
      configType: "N",
      remark: "前端展示标题",
      createTime: "2026-03-01T09:00:00.000Z",
    },
  ];

  private notices: ManagedNoticeRecord[] = [
    {
      noticeId: 1,
      noticeTitle: "RBAC 骨架已切换到新系统真源",
      noticeType: "1",
      noticeContent:
        "<p>系统管理菜单、接口和权限链路已由当前 NestJS + web 仓库承接。</p>",
      status: "0",
      remark: "Phase 2 骨架公告",
      createTime: "2026-03-27T09:00:00.000Z",
    },
    {
      noticeId: 2,
      noticeTitle: "研发小仓账号保持独立控制台",
      noticeType: "2",
      noticeContent:
        "<p><strong>rd-operator</strong> 仍只进入研发小仓控制台，admin 不再被额外裁掉相关页面。</p>",
      status: "0",
      remark: "Phase 1 验证公告",
      createTime: "2026-03-27T09:30:00.000Z",
    },
  ];

  private users: ManagedUserRecord[] = [
    {
      userId: 1,
      deptId: 300,
      userName: "admin",
      nickName: "系统管理员",
      avatarUrl: null,
      email: "admin@saifute.local",
      phonenumber: "13800000001",
      sex: "0",
      status: "0",
      deleted: false,
      remark: "超级管理员账号",
      createTime: "2026-03-01T09:00:00.000Z",
      postIds: [1],
      roleIds: [1],
      passwordHash: hashText("admin123"),
      consoleMode: "default",
      workshopScope: {
        mode: "ALL",
        workshopId: null,
        workshopCode: null,
        workshopName: null,
      },
      extraPermissions: [
        ALL_PERMISSION,
        "dashboard:view",
        "monitor:online:list",
        "monitor:online:forceLogout",
        "audit:login-log:list",
        "audit:login-log:delete",
        "audit:oper-log:list",
        "audit:oper-log:delete",
        "workflow:audit:status",
        "workflow:audit:list",
        "workflow:audit:create",
        "workflow:audit:approve",
        "workflow:audit:reject",
        "workflow:audit:reset",
        "reporting:home:view",
        "reporting:inventory-summary:view",
        "reporting:material-category-summary:view",
        "reporting:trends:view",
        "reporting:export",
        "scheduler:job:list",
        "scheduler:job:create",
        "scheduler:job:update",
        "scheduler:job:run",
        "scheduler:job:pause",
        "scheduler:job:log:list",
        "ai:chat",
        "ai:tools:list",
        "master:material:list",
        "master:material:create",
        "master:material:update",
        "master:customer:list",
        "master:supplier:list",
        "master:personnel:list",
        "master:workshop:list",
        "inbound:order:list",
        "inbound:order:create",
        "inbound:order:update",
        "inbound:order:void",
        "inbound:into-order:list",
        "inbound:into-order:create",
        "inbound:into-order:update",
        "inbound:into-order:void",
        "rd:procurement-request:list",
        "rd:procurement-request:create",
        "rd:procurement-request:void",
        "rd:procurement-request:status-action",
        "rd:handoff-order:list",
        "rd:handoff-order:create",
        "rd:handoff-order:void",
        "rd:stocktake-order:list",
        "rd:stocktake-order:create",
        "rd:stocktake-order:void",
        "workshop-material:pick-order:list",
        "workshop-material:pick-order:create",
        "workshop-material:pick-order:void",
        "workshop-material:return-order:list",
        "workshop-material:return-order:create",
        "workshop-material:return-order:void",
        "workshop-material:scrap-order:list",
        "workshop-material:scrap-order:create",
        "workshop-material:scrap-order:void",
        "project:list",
        "project:get",
        "project:create",
        "project:update",
        "project:void",
        "inventory:balance:list",
        "inventory:factory-number:list",
        "inventory:log:list",
        "inventory:source-usage:list",
        "customer:order:list",
        "customer:order:create",
        "customer:order:update",
        "customer:order:void",
        "customer:sales-return:list",
        "customer:sales-return:create",
        "customer:sales-return:void",
        "rd:workbench:view",
      ],
    },
    {
      userId: 2,
      deptId: 300,
      userName: "operator",
      nickName: "仓库管理员",
      avatarUrl: null,
      email: "warehouse-manager@saifute.local",
      phonenumber: "13800000006",
      sex: "0",
      status: "0",
      deleted: false,
      remark: "主仓与公司级实物流转代表账号",
      createTime: "2026-03-01T09:10:00.000Z",
      postIds: [2],
      roleIds: [2],
      passwordHash: hashText("operator123"),
      consoleMode: "default",
      workshopScope: {
        mode: "ALL",
        workshopId: null,
        workshopCode: null,
        workshopName: null,
      },
      extraPermissions: [],
    },
    {
      userId: 3,
      deptId: 300,
      userName: "disabled-user",
      nickName: "停用仓库账号",
      avatarUrl: null,
      email: "disabled@saifute.local",
      phonenumber: "13800000007",
      sex: "0",
      status: "1",
      deleted: false,
      remark: "用于停用态校验",
      createTime: "2026-03-01T09:20:00.000Z",
      postIds: [2],
      roleIds: [2],
      passwordHash: hashText("disabled123"),
      consoleMode: "default",
      workshopScope: {
        mode: "ALL",
        workshopId: null,
        workshopCode: null,
        workshopName: null,
      },
      extraPermissions: [],
    },
    {
      userId: 4,
      deptId: 200,
      userName: "procurement",
      nickName: "采购人员",
      avatarUrl: null,
      email: "procurement-user@saifute.local",
      phonenumber: "13800000008",
      sex: "1",
      status: "0",
      deleted: false,
      remark: "采购执行代表账号",
      createTime: "2026-03-01T09:30:00.000Z",
      postIds: [3],
      roleIds: [4],
      passwordHash: hashText("procurement123"),
      consoleMode: "default",
      workshopScope: {
        mode: "ALL",
        workshopId: null,
        workshopCode: null,
        workshopName: null,
      },
      extraPermissions: [],
    },
    {
      userId: 5,
      deptId: 100,
      userName: "rd-operator",
      nickName: "研发小仓管理员",
      avatarUrl: null,
      email: "rd@saifute.local",
      phonenumber: "13800000009",
      sex: "0",
      status: "0",
      deleted: false,
      remark: "研发小仓专属账号",
      createTime: "2026-03-01T09:40:00.000Z",
      postIds: [4],
      roleIds: [3],
      passwordHash: hashText("rd123456"),
      consoleMode: "rd-subwarehouse",
      workshopScope: {
        mode: "FIXED",
        workshopId: 6,
        workshopCode: "RD",
        workshopName: "研发小仓",
      },
      extraPermissions: [],
    },
  ];

  private persistenceQueue: Promise<void> = Promise.resolve();

  constructor(@Optional() private readonly prisma?: PrismaService) {
    this.applyDefaultRoleMenuAssignments();
  }

  async onModuleInit(): Promise<void> {
    if (!this.prisma?.systemManagementSnapshot) {
      return;
    }

    await this.restoreOrSeedState();
  }

  async flushPersistence(): Promise<void> {
    await this.persistenceQueue;
  }

  private async restoreOrSeedState(): Promise<void> {
    const snapshotDelegate = this.prisma?.systemManagementSnapshot;
    if (!snapshotDelegate) {
      return;
    }

    const snapshot = await snapshotDelegate.findUnique({
      where: { snapshotKey: SYSTEM_MANAGEMENT_SNAPSHOT_KEY },
    });
    if (!snapshot) {
      await this.persistState();
      return;
    }

    this.applySnapshot(
      snapshot.payload as unknown as SystemManagementStateSnapshot,
    );
  }

  private async persistState(): Promise<void> {
    const snapshotDelegate = this.prisma?.systemManagementSnapshot;
    if (!snapshotDelegate) {
      return;
    }

    const payload =
      this.toSnapshotPayload() as unknown as Prisma.InputJsonValue;
    await snapshotDelegate.upsert({
      where: { snapshotKey: SYSTEM_MANAGEMENT_SNAPSHOT_KEY },
      update: { payload },
      create: {
        snapshotKey: SYSTEM_MANAGEMENT_SNAPSHOT_KEY,
        payload,
      },
    });
  }

  private queuePersistence(): void {
    if (!this.prisma?.systemManagementSnapshot) {
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

  private toSnapshotPayload(): SystemManagementStateSnapshot {
    return {
      depts: structuredClone(this.depts),
      posts: structuredClone(this.posts),
      menus: structuredClone(this.menus),
      roles: structuredClone(this.roles),
      dictTypes: structuredClone(this.dictTypes),
      dictData: structuredClone(this.dictData),
      configs: structuredClone(this.configs),
      notices: structuredClone(this.notices),
      users: structuredClone(this.users),
    };
  }

  private applySnapshot(snapshot: SystemManagementStateSnapshot): void {
    this.depts = this.cloneSnapshotRows(snapshot.depts, this.depts);
    this.posts = this.cloneSnapshotRows(snapshot.posts, this.posts);
    this.menus = this.cloneSnapshotRows(snapshot.menus, this.menus);
    this.roles = this.cloneSnapshotRows(snapshot.roles, this.roles);
    this.dictTypes = this.cloneSnapshotRows(snapshot.dictTypes, this.dictTypes);
    this.dictData = this.cloneSnapshotRows(snapshot.dictData, this.dictData);
    this.configs = this.cloneSnapshotRows(snapshot.configs, this.configs);
    this.notices = this.cloneSnapshotRows(snapshot.notices, this.notices);
    this.users = this.cloneSnapshotRows(snapshot.users, this.users);
  }

  private cloneSnapshotRows<T>(rows: unknown, fallback: T[]): T[] {
    return Array.isArray(rows)
      ? structuredClone(rows as T[])
      : structuredClone(fallback);
  }

  private applyDefaultRoleMenuAssignments(): void {
    const permissionToMenuIds = new Map<string, number[]>();
    this.menus.forEach((menu) => {
      if (!menu.perms) {
        return;
      }
      const menuIds = permissionToMenuIds.get(menu.perms) ?? [];
      menuIds.push(menu.menuId);
      permissionToMenuIds.set(menu.perms, menuIds);
    });

    this.roles = this.roles.map((role) => {
      if (role.roleKey === "admin") {
        return {
          ...role,
          menuIds: this.menus.map((menu) => menu.menuId),
        };
      }

      const permissionKeys = DEFAULT_ROLE_PERMISSION_ASSIGNMENTS[role.roleKey];
      if (!permissionKeys) {
        return role;
      }

      return {
        ...role,
        menuIds: [
          ...new Set(
            permissionKeys.flatMap(
              (permissionKey) => permissionToMenuIds.get(permissionKey) ?? [],
            ),
          ),
        ],
      };
    });
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
