import { getRouters } from "@/api/menu";
import ParentView from "@/components/ParentView";
import InnerLink from "@/layout/components/InnerLink";
import Layout from "@/layout/index";
import auth from "@/plugins/auth";
import router, { constantRoutes, dynamicRoutes } from "@/router";
import useUserStore from "@/store/modules/user";

// 匹配views里面所有的.vue文件
const modules = import.meta.glob("./../../views/**/*.vue");

const CONSOLE_MODES = {
  DEFAULT: "default",
  RD: "rd-subwarehouse",
};

const SUPPORTED_BACKEND_ROUTE_GROUPS = [
  {
    key: "base",
    path: "/base",
    name: "Base",
    title: "基础数据",
    icon: "tree",
  },
  {
    key: "stock",
    path: "/stock",
    name: "Stock",
    title: "库存管理",
    icon: "build",
  },
  {
    key: "entry",
    path: "/entry",
    name: "Entry",
    title: "入库管理",
    icon: "edit",
  },
  {
    key: "sales",
    path: "/sales",
    name: "SalesBusiness",
    title: "销售管理",
    icon: "guide",
  },
  {
    key: "workshop",
    path: "/take",
    name: "WorkshopBusiness",
    title: "生产车间",
    icon: "guide",
  },
  {
    key: "rd",
    path: "/rd",
    name: "RdDomain",
    titleByMode: {
      [CONSOLE_MODES.DEFAULT]: "研发协同",
      [CONSOLE_MODES.RD]: "研发小仓",
    },
    icon: "dashboard",
  },
  {
    key: "system",
    path: "/system",
    name: "SystemManagement",
    title: "系统管理",
    icon: "system",
  },
  {
    key: "monitor",
    path: "/monitor",
    name: "Monitor",
    title: "系统监控",
    icon: "monitor",
  },
  {
    key: "reporting",
    path: "/reporting",
    name: "Reporting",
    title: "报表中心",
    icon: "chart",
  },
];

const SUPPORTED_BACKEND_ROUTE_META = {
  RdWorkbench: {
    group: "rd",
    path: "workbench",
    component: "rd/workbench/index",
    title: "研发工作台",
    icon: "dashboard",
    visibleInModes: [CONSOLE_MODES.RD],
    affixInModes: [CONSOLE_MODES.RD],
  },
  RdProcurementRequests: {
    group: "rd",
    path: "procurement-requests",
    component: "rd/procurement-requests/index",
    title: "采购需求",
    icon: "tickets",
    visibleInModes: [CONSOLE_MODES.DEFAULT, CONSOLE_MODES.RD],
  },
  RdInventorySummary: {
    group: "rd",
    path: "inventory-summary",
    component: "reporting/inventory-summary/index",
    title: "小仓库存",
    icon: "table",
    visibleInModes: [CONSOLE_MODES.RD],
  },
  RdInventoryLogs: {
    group: "rd",
    path: "inventory-logs",
    component: "rd/inventory-logs/index",
    title: "库存流水",
    icon: "time",
    visibleInModes: [CONSOLE_MODES.DEFAULT, CONSOLE_MODES.RD],
  },
  RdInboundResults: {
    group: "rd",
    path: "inbound-results",
    component: "rd/inbound-results/index",
    title: "自动入库结果",
    icon: "form",
    visibleInModes: [CONSOLE_MODES.DEFAULT, CONSOLE_MODES.RD],
  },
  RdProjectLedger: {
    group: "rd",
    path: "projects",
    component: "rd/projects/index",
    title: "研发项目",
    icon: "education",
    visibleInModes: [CONSOLE_MODES.DEFAULT, CONSOLE_MODES.RD],
  },
  RdScrapOrders: {
    group: "rd",
    path: "scrap-orders",
    component: "rd/scrap-orders/index",
    title: "本仓报废",
    icon: "bug",
    visibleInModes: [CONSOLE_MODES.RD],
  },
  RdStocktakeOrders: {
    group: "rd",
    path: "stocktake-orders",
    component: "rd/stocktake-orders/index",
    title: "盘点调整",
    icon: "edit",
    visibleInModes: [CONSOLE_MODES.RD],
  },
  RdMaterialCategorySummary: {
    group: "rd",
    path: "material-category-summary",
    component: "reporting/material-category-summary/index",
    title: "分类分布",
    icon: "tree-table",
    visibleInModes: [CONSOLE_MODES.RD],
  },
  RdMonthlyReporting: {
    group: "rd",
    path: "monthly-reporting",
    component: "reporting/monthly-reporting/index",
    title: "月度对账",
    icon: "table",
    visibleInModes: [CONSOLE_MODES.RD],
  },
  BaseMaterial: {
    group: "base",
    path: "material",
    component: "base/material/index",
    title: "物料管理",
    icon: "list",
  },
  BaseMaterialCategory: {
    group: "base",
    path: "material-category",
    component: "base/material-category/index",
    title: "物料分类管理",
    icon: "tree-table",
  },
  BaseCustomer: {
    group: "base",
    path: "customer",
    component: "base/customer/index",
    title: "客户管理",
    icon: "peoples",
  },
  BaseSupplier: {
    group: "base",
    path: "supplier",
    component: "base/supplier/index",
    title: "供应商管理",
    icon: "tree-table",
  },
  BasePersonnel: {
    group: "base",
    path: "personnel",
    component: "base/personnel/index",
    title: "人员管理",
    icon: "user",
  },
  BaseWorkshop: {
    group: "base",
    path: "workshop",
    component: "base/workshop/index",
    title: "车间管理",
    icon: "education",
  },
  BaseStockScope: {
    group: "base",
    path: "stock-scope",
    component: "base/stock-scope/index",
    title: "库存范围管理",
    icon: "guide",
  },
  EntryOrder: {
    group: "entry",
    path: "order",
    component: "entry/order/index",
    title: "验收单",
    icon: "form",
  },
  EntryDetail: {
    group: "entry",
    path: "detail",
    component: "entry/detail/index",
    title: "验收明细",
    icon: "list",
  },
  EntryIntoOrder: {
    group: "entry",
    path: "intoOrder",
    component: "entry/intoOrder/index",
    title: "入库单",
    icon: "clipboard",
  },
  EntryIntoDetail: {
    group: "entry",
    path: "intoDetail",
    component: "entry/intoDetail/index",
    title: "入库明细",
    icon: "list",
  },
  TakePickOrder: {
    group: "workshop",
    path: "pickOrder",
    component: "take/pickOrder/index",
    title: "生产领料单",
    icon: "guide",
  },
  TakePickDetail: {
    group: "workshop",
    path: "pickDetail",
    component: "take/pickDetail/index",
    title: "生产领料明细",
    icon: "list",
  },
  TakeReturnOrder: {
    group: "workshop",
    path: "returnOrder",
    component: "take/returnOrder/index",
    title: "生产退料单",
    icon: "refresh",
  },
  TakeReturnDetail: {
    group: "workshop",
    path: "returnDetail",
    component: "take/returnDetail/index",
    title: "生产退料明细",
    icon: "list",
  },
  StockScrapOrder: {
    group: "workshop",
    path: "scrapOrder",
    component: "stock/scrapOrder/index",
    title: "生产报废单",
    icon: "bug",
  },
  StockScrapDetail: {
    group: "workshop",
    path: "scrapDetail",
    component: "stock/scrapDetail/index",
    title: "生产报废明细",
    icon: "list",
  },
  StockInventory: {
    group: "stock",
    path: "inventory",
    component: "stock/inventory/index",
    title: "库存查询",
    icon: "search",
  },
  StockLog: {
    group: "stock",
    path: "log",
    component: "stock/log/index",
    title: "库存日志",
    icon: "log",
  },
  StockUsed: {
    group: "stock",
    path: "used",
    component: "stock/used/index",
    title: "已使用物料",
    icon: "skill",
  },
  StockInterval: {
    group: "stock",
    path: "interval",
    component: "stock/interval/index",
    title: "编号区间",
    icon: "number",
  },
  SalesOrder: {
    group: "sales",
    path: "order",
    component: "sales/order/index",
    title: "出库单",
    icon: "form",
  },
  SalesDetail: {
    group: "sales",
    path: "detail",
    component: "sales/detail/index",
    title: "出库明细",
    icon: "list",
  },
  SalesReturnOrder: {
    group: "sales",
    path: "salesReturnOrder",
    component: "sales/salesReturnOrder/index",
    title: "销售退货单",
    icon: "refresh",
  },
  SalesReturnDetail: {
    group: "sales",
    path: "salesReturnDetail",
    component: "sales/salesReturnDetail/index",
    title: "销售退货明细",
    icon: "list",
  },
  SalesProjectLedger: {
    group: "sales",
    path: "project",
    component: "sales-project/index",
    title: "销售项目",
    icon: "education",
  },
  SystemUser: {
    group: "system",
    path: "user",
    component: "system/user/index",
    title: "用户管理",
    icon: "user",
  },
  SystemRole: {
    group: "system",
    path: "role",
    component: "system/role/index",
    title: "角色管理",
    icon: "peoples",
  },
  SystemDept: {
    group: "system",
    path: "dept",
    component: "system/dept/index",
    title: "部门管理",
    icon: "tree",
  },
  SystemMenu: {
    group: "system",
    path: "menu",
    component: "system/menu/index",
    title: "菜单管理",
    icon: "tree-table",
  },
  SystemPost: {
    group: "system",
    path: "post",
    component: "system/post/index",
    title: "岗位管理",
    icon: "post",
  },
  SystemDict: {
    group: "system",
    path: "dict",
    component: "system/dict/index",
    title: "字典管理",
    icon: "dict",
  },
  SystemConfig: {
    group: "system",
    path: "config",
    component: "system/config/index",
    title: "参数设置",
    icon: "edit",
  },
  SystemNotice: {
    group: "system",
    path: "notice",
    component: "system/notice/index",
    title: "通知公告",
    icon: "message",
  },
  OnlineUsers: {
    group: "system",
    path: "online",
    component: "monitor/online/index",
    title: "在线用户",
    icon: "user",
  },
  LoginLogs: {
    group: "system",
    path: "logininfor",
    component: "monitor/logininfor/index",
    title: "登录日志",
    icon: "form",
  },
  OperLogs: {
    group: "system",
    path: "operlog",
    component: "monitor/operlog/index",
    title: "操作日志",
    icon: "form",
  },
  SchedulerJobs: {
    group: "monitor",
    path: "job",
    component: "monitor/job/index",
    title: "定时任务",
    icon: "job",
  },
  ReportingHome: {
    group: "reporting",
    path: "home",
    component: "reporting/home/index",
    title: "报表首页",
    icon: "dashboard",
  },
  InventorySummary: {
    group: "reporting",
    path: "inventory-summary",
    component: "reporting/inventory-summary/index",
    title: "库存汇总",
    icon: "table",
  },
  MaterialCategorySummary: {
    group: "reporting",
    path: "material-category-summary",
    component: "reporting/material-category-summary/index",
    title: "分类分布",
    icon: "tree-table",
  },
  ReportingTrends: {
    group: "reporting",
    path: "trends",
    component: "reporting/trends/index",
    title: "趋势分析",
    icon: "time",
  },
  MonthlyReporting: {
    group: "reporting",
    path: "monthly-reporting",
    component: "reporting/monthly-reporting/index",
    title: "月度对账",
    icon: "table",
  },
};

const FRONTEND_ROUTE_PERMISSION_FALLBACK = {
  BaseMaterialCategory: ["master:material-category:list"],
  SalesOrder: ["sales:order:list"],
  SalesDetail: ["sales:order:list"],
  SalesReturnOrder: ["sales:return:list"],
  SalesReturnDetail: ["sales:return:list"],
};

function collectBackendRouteNames(routes, routeNames = new Set()) {
  routes.forEach((route) => {
    if (!route || typeof route !== "object") {
      return;
    }

    if (route.name) {
      routeNames.add(route.name);
    }

    if (Array.isArray(route.children) && route.children.length > 0) {
      collectBackendRouteNames(route.children, routeNames);
    }
  });

  return routeNames;
}

function resolveGroupTitle(groupMeta, currentConsoleMode) {
  if (typeof groupMeta.title === "string") {
    return groupMeta.title;
  }
  return (
    groupMeta.titleByMode?.[currentConsoleMode] ??
    groupMeta.titleByMode?.[CONSOLE_MODES.DEFAULT] ??
    ""
  );
}

function isAdminUser() {
  return auth.hasRole("admin");
}

function isRouteVisibleInConsoleMode(
  routeMeta,
  currentConsoleMode,
  currentIsAdminUser,
) {
  if (currentIsAdminUser) {
    return true;
  }
  if (!routeMeta.visibleInModes?.length) {
    return true;
  }
  return routeMeta.visibleInModes.includes(currentConsoleMode);
}

function hasAffixInConsoleMode(routeMeta, currentConsoleMode) {
  return routeMeta.affixInModes?.includes(currentConsoleMode) ?? false;
}

function isHomeConstantRoute(route) {
  return route.children?.some((child) => child.name === "Index");
}

function buildPermissionBaseRoutes(currentConsoleMode) {
  if (currentConsoleMode !== CONSOLE_MODES.RD) {
    return constantRoutes;
  }
  return constantRoutes.filter((route) => !isHomeConstantRoute(route));
}

function buildSidebarBaseRoutes(currentConsoleMode) {
  if (currentConsoleMode === CONSOLE_MODES.RD) {
    return [];
  }
  return constantRoutes.filter((route) => isHomeConstantRoute(route));
}

function buildFrontendRoutes(
  backendRoutes,
  currentConsoleMode = CONSOLE_MODES.DEFAULT,
  currentIsAdminUser = false,
) {
  const routeNames = collectBackendRouteNames(backendRoutes);
  return SUPPORTED_BACKEND_ROUTE_GROUPS.map((groupMeta) => {
    const children = Object.entries(SUPPORTED_BACKEND_ROUTE_META)
      .filter(([routeName, routeMeta]) => {
        if (routeMeta.group !== groupMeta.key) {
          return false;
        }

        if (
          !isRouteVisibleInConsoleMode(
            routeMeta,
            currentConsoleMode,
            currentIsAdminUser,
          )
        ) {
          return false;
        }

        return (
          routeNames.has(routeName) ||
          auth.hasPermiOr(FRONTEND_ROUTE_PERMISSION_FALLBACK[routeName] || [])
        );
      })
      .map(([routeName, routeMeta]) => ({
        path: routeMeta.path,
        component: routeMeta.component,
        name: routeName,
        meta: {
          title: routeMeta.title,
          icon: routeMeta.icon,
          ...(hasAffixInConsoleMode(routeMeta, currentConsoleMode)
            ? { affix: true }
            : {}),
        },
      }));

    if (children.length === 0) {
      return null;
    }

    const redirectPath = children[0]?.path.startsWith("/")
      ? children[0].path
      : `${groupMeta.path}/${children[0]?.path}`;
    const groupTitle = resolveGroupTitle(groupMeta, currentConsoleMode);

    return {
      path: groupMeta.path,
      component: "Layout",
      redirect: redirectPath,
      alwaysShow: true,
      name: groupMeta.name,
      meta: {
        title: groupTitle,
        icon: groupMeta.icon,
      },
      children,
    };
  }).filter(Boolean);
}

const usePermissionStore = defineStore("permission", {
  state: () => ({
    routes: [],
    addRoutes: [],
    defaultRoutes: [],
    topbarRouters: [],
    sidebarRouters: [],
  }),
  actions: {
    setRoutes(routes, baseRoutes = constantRoutes) {
      this.addRoutes = routes;
      this.routes = baseRoutes.concat(routes);
    },
    setDefaultRoutes(routes, baseRoutes = constantRoutes) {
      this.defaultRoutes = baseRoutes.concat(routes);
    },
    setTopbarRoutes(routes) {
      this.topbarRouters = routes;
    },
    setSidebarRouters(routes) {
      this.sidebarRouters = routes;
    },
    generateRoutes() {
      return new Promise((resolve) => {
        // 向后端请求路由数据
        getRouters().then((res) => {
          const currentConsoleMode =
            useUserStore().consoleMode || CONSOLE_MODES.DEFAULT;
          const currentIsAdminUser = isAdminUser();
          const backendRoutes = Array.isArray(res.data) ? res.data : [];
          const frontendRoutes = buildFrontendRoutes(
            backendRoutes,
            currentConsoleMode,
            currentIsAdminUser,
          );
          const sdata = JSON.parse(JSON.stringify(frontendRoutes));
          const rdata = JSON.parse(JSON.stringify(frontendRoutes));
          const defaultData = JSON.parse(JSON.stringify(frontendRoutes));
          const sidebarRoutes = filterAsyncRouter(sdata);
          const rewriteRoutes = filterAsyncRouter(rdata, false, true);
          const defaultRoutes = filterAsyncRouter(defaultData);
          const asyncRoutes = filterDynamicRoutes(dynamicRoutes);
          const permissionBaseRoutes =
            buildPermissionBaseRoutes(currentConsoleMode);
          const sidebarBaseRoutes = buildSidebarBaseRoutes(currentConsoleMode);
          asyncRoutes.forEach((route) => {
            router.addRoute(route);
          });
          this.setRoutes(rewriteRoutes, permissionBaseRoutes);
          this.setSidebarRouters(sidebarBaseRoutes.concat(sidebarRoutes));
          this.setDefaultRoutes(sidebarRoutes, sidebarBaseRoutes);
          this.setTopbarRoutes(sidebarBaseRoutes.concat(defaultRoutes));
          resolve(rewriteRoutes);
        });
      });
    },
  },
});

// 遍历后台传来的路由字符串，转换为组件对象
function filterAsyncRouter(asyncRouterMap, _lastRouter = false, type = false) {
  return asyncRouterMap.filter((route) => {
    if (type && route.children) {
      route.children = filterChildren(route.children);
    }
    if (route.component) {
      // Layout ParentView 组件特殊处理
      if (route.component === "Layout") {
        route.component = Layout;
      } else if (route.component === "ParentView") {
        route.component = ParentView;
      } else if (route.component === "InnerLink") {
        route.component = InnerLink;
      } else {
        route.component = loadView(route.component);
      }
    }
    if (route.children?.length) {
      route.children = filterAsyncRouter(route.children, route, type);
    } else {
      delete route.children;
      delete route.redirect;
    }
    return true;
  });
}

function filterChildren(childrenMap, lastRouter = false) {
  var children = [];
  childrenMap.forEach((el) => {
    el.path = lastRouter ? `${lastRouter.path}/${el.path}` : el.path;
    if (el.children?.length && el.component === "ParentView") {
      children = children.concat(filterChildren(el.children, el));
    } else {
      children.push(el);
    }
  });
  return children;
}

// 动态路由遍历，验证是否具备权限
export function filterDynamicRoutes(routes) {
  const res = [];
  routes.forEach((route) => {
    if (route.permissions) {
      if (auth.hasPermiOr(route.permissions)) {
        res.push(route);
      }
    } else if (route.roles) {
      if (auth.hasRoleOr(route.roles)) {
        res.push(route);
      }
    }
  });
  return res;
}

export const loadView = (view) => {
  let res;
  for (const path in modules) {
    const dir = path.split("views/")[1].split(".vue")[0];
    if (dir === view) {
      res = () => modules[path]();
    }
  }
  return res;
};

export default usePermissionStore;
