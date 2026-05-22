import { getRouters } from "@/api/menu";
import ParentView from "@/components/ParentView";
import InnerLink from "@/layout/components/InnerLink";
import Layout from "@/layout/index";
import auth from "@/plugins/auth";
import router, { constantRoutes, dynamicRoutes } from "@/router";
import useUserStore from "@/store/modules/user";
import { defineComponent, h } from "vue";

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
    name: "MasterData",
  },
  {
    key: "stock",
    path: "/stock",
    name: "InventoryBusiness",
  },
  {
    key: "entry",
    path: "/entry",
    name: "InboundBusiness",
  },
  {
    key: "sales",
    path: "/sales",
    name: "SalesBusiness",
  },
  {
    key: "workshop",
    path: "/take",
    name: "WorkshopMaterialBusiness",
  },
  {
    key: "rd",
    path: "/rd",
    name: "RdSubwarehouse",
  },
  {
    key: "system",
    path: "/system",
    name: "SystemManagement",
  },
  {
    key: "monitor",
    path: "/monitor",
    name: "Monitor",
  },
  {
    key: "reporting",
    path: "/reporting",
    name: "Reporting",
  },
];

const SUPPORTED_BACKEND_ROUTE_META = {
  RdWorkbench: {
    group: "rd",
    path: "workbench",
    component: "rd/workbench/index",
    visibleInModes: [CONSOLE_MODES.RD],
    affixInModes: [CONSOLE_MODES.RD],
  },
  RdProcurementRequests: {
    group: "rd",
    path: "procurement-requests",
    component: "rd/procurement-requests/index",
    visibleInModes: [CONSOLE_MODES.DEFAULT, CONSOLE_MODES.RD],
  },
  RdInventorySummary: {
    group: "rd",
    path: "inventory-summary",
    component: "reporting/inventory-summary/index",
    visibleInModes: [CONSOLE_MODES.RD],
  },
  RdInventoryLogs: {
    group: "rd",
    path: "inventory-logs",
    component: "rd/inventory-logs/index",
    visibleInModes: [CONSOLE_MODES.DEFAULT, CONSOLE_MODES.RD],
  },
  RdInboundResults: {
    group: "rd",
    path: "inbound-results",
    component: "rd/inbound-results/index",
    visibleInModes: [CONSOLE_MODES.DEFAULT, CONSOLE_MODES.RD],
  },
  RdProjectLedger: {
    group: "rd",
    path: "projects",
    component: "rd/projects/index",
    visibleInModes: [CONSOLE_MODES.DEFAULT, CONSOLE_MODES.RD],
  },
  RdScrapOrders: {
    group: "rd",
    path: "scrap-orders",
    component: "rd/scrap-orders/index",
    visibleInModes: [CONSOLE_MODES.RD],
  },
  RdStocktakeOrders: {
    group: "rd",
    path: "stocktake-orders",
    component: "rd/stocktake-orders/index",
    visibleInModes: [CONSOLE_MODES.RD],
  },
  RdMaterialCategorySummary: {
    group: "rd",
    path: "material-category-summary",
    component: "reporting/material-category-summary/index",
    visibleInModes: [CONSOLE_MODES.RD],
  },
  RdMonthlyReporting: {
    group: "rd",
    path: "monthly-reporting",
    component: "reporting/monthly-reporting/index",
    visibleInModes: [CONSOLE_MODES.RD],
  },
  RdMonthlyReportingMaterialCategory: {
    group: "rd",
    path: "monthly-reporting-material-category",
    component: "reporting/monthly-reporting/index",
    visibleInModes: [CONSOLE_MODES.RD],
  },
  BaseMaterial: {
    group: "base",
    path: "material",
    component: "base/material/index",
  },
  BaseMaterialCategory: {
    group: "base",
    path: "material-category",
    component: "base/material-category/index",
  },
  BaseCustomer: {
    group: "base",
    path: "customer",
    component: "base/customer/index",
  },
  BaseSupplier: {
    group: "base",
    path: "supplier",
    component: "base/supplier/index",
  },
  BasePersonnel: {
    group: "base",
    path: "personnel",
    component: "base/personnel/index",
  },
  BaseWorkshop: {
    group: "base",
    path: "workshop",
    component: "base/workshop/index",
  },
  BaseStockScope: {
    group: "base",
    path: "stock-scope",
    component: "base/stock-scope/index",
  },
  EntryOrder: {
    group: "entry",
    path: "order",
    component: "entry/order/index",
  },
  EntryDetail: {
    group: "entry",
    path: "detail",
    component: "entry/detail/index",
  },
  EntryIntoOrder: {
    group: "entry",
    path: "intoOrder",
    component: "entry/intoOrder/index",
  },
  EntryIntoDetail: {
    group: "entry",
    path: "intoDetail",
    component: "entry/intoDetail/index",
  },
  EntryReturnOrder: {
    group: "entry",
    path: "returnOrder",
    component: "entry/returnOrder/index",
  },
  EntryReturnDetail: {
    group: "entry",
    path: "returnDetail",
    component: "entry/returnDetail/index",
  },
  TakePickOrder: {
    group: "workshop",
    path: "pickOrder",
    component: "take/pickOrder/index",
  },
  TakePickDetail: {
    group: "workshop",
    path: "pickDetail",
    component: "take/pickDetail/index",
  },
  TakeReturnOrder: {
    group: "workshop",
    path: "returnOrder",
    component: "take/returnOrder/index",
  },
  TakeReturnDetail: {
    group: "workshop",
    path: "returnDetail",
    component: "take/returnDetail/index",
  },
  StockScrapOrder: {
    group: "workshop",
    path: "scrapOrder",
    component: "stock/scrapOrder/index",
  },
  StockScrapDetail: {
    group: "workshop",
    path: "scrapDetail",
    component: "stock/scrapDetail/index",
  },
  StockInventory: {
    group: "stock",
    path: "inventory",
    component: "stock/inventory/index",
  },
  StockLog: {
    group: "stock",
    path: "log",
    component: "stock/log/index",
  },
  StockUsed: {
    group: "stock",
    path: "used",
    component: "stock/used/index",
  },
  StockInterval: {
    group: "stock",
    path: "interval",
    component: "stock/interval/index",
  },
  SalesOrder: {
    group: "sales",
    path: "order",
    component: "sales/order/index",
  },
  SalesDetail: {
    group: "sales",
    path: "detail",
    component: "sales/detail/index",
  },
  SalesReturnOrder: {
    group: "sales",
    path: "salesReturnOrder",
    component: "sales/salesReturnOrder/index",
  },
  SalesReturnDetail: {
    group: "sales",
    path: "salesReturnDetail",
    component: "sales/salesReturnDetail/index",
  },
  SalesProjectLedger: {
    group: "sales",
    path: "project",
    component: "sales-project/index",
  },
  SystemUser: {
    group: "system",
    path: "user",
    component: "system/user/index",
  },
  SystemRole: {
    group: "system",
    path: "role",
    component: "system/role/index",
  },
  SystemDept: {
    group: "system",
    path: "dept",
    component: "system/dept/index",
  },
  SystemMenu: {
    group: "system",
    path: "menu",
    component: "system/menu/index",
  },
  SystemPost: {
    group: "system",
    path: "post",
    component: "system/post/index",
  },
  SystemDict: {
    group: "system",
    path: "dict",
    component: "system/dict/index",
  },
  SystemConfig: {
    group: "system",
    path: "config",
    component: "system/config/index",
  },
  SystemNotice: {
    group: "system",
    path: "notice",
    component: "system/notice/index",
  },
  OnlineUsers: {
    group: "system",
    path: "online",
    component: "monitor/online/index",
  },
  LoginLogs: {
    group: "system",
    path: "logininfor",
    component: "monitor/logininfor/index",
  },
  OperLogs: {
    group: "system",
    path: "operlog",
    component: "monitor/operlog/index",
  },
  SchedulerJobs: {
    group: "monitor",
    path: "job",
    component: "monitor/job/index",
  },
  ReportingHome: {
    group: "reporting",
    path: "home",
    component: "reporting/home/index",
  },
  MonthlyReporting: {
    group: "reporting",
    path: "monthly-reporting",
    component: "reporting/monthly-reporting/index",
  },
  MonthlyReportingMaterialCategory: {
    group: "reporting",
    path: "monthly-reporting-material-category",
    component: "reporting/monthly-reporting/index",
  },
};

function collectBackendRoutes(routes, routeMap = new Map()) {
  routes.forEach((route) => {
    if (!route || typeof route !== "object") {
      return;
    }

    if (route.name) {
      routeMap.set(route.name, route);
    }

    if (Array.isArray(route.children) && route.children.length > 0) {
      collectBackendRoutes(route.children, routeMap);
    }
  });

  return routeMap;
}

function resolveRouteOrder(backendRoute, declarationIndex) {
  const orderNum = backendRoute?.meta?.orderNum;
  return typeof orderNum === "number" ? orderNum : 100000 + declarationIndex;
}

function resolveGroupOrder(backendRoute, declarationIndex) {
  const orderNum = backendRoute?.meta?.orderNum;
  return typeof orderNum === "number" ? orderNum : 100000 + declarationIndex;
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
  const backendRoutesByName = collectBackendRoutes(backendRoutes);
  return SUPPORTED_BACKEND_ROUTE_GROUPS.map((groupMeta, groupIndex) => {
    const backendGroupRoute = backendRoutesByName.get(groupMeta.name);
    if (!backendGroupRoute) {
      return null;
    }

    const backendGroupMeta = backendGroupRoute?.meta ?? {};
    const children = Object.entries(SUPPORTED_BACKEND_ROUTE_META)
      .map(([routeName, routeMeta], declarationIndex) => ({
        routeName,
        routeMeta,
        backendRoute: backendRoutesByName.get(routeName),
        declarationIndex,
      }))
      .filter(({ routeName, routeMeta, backendRoute }) => {
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

        return Boolean(backendRoute);
      })
      .sort(
        (left, right) =>
          resolveRouteOrder(left.backendRoute, left.declarationIndex) -
          resolveRouteOrder(right.backendRoute, right.declarationIndex),
      )
      .map(({ routeName, routeMeta, backendRoute }) => {
        const backendMeta = backendRoute?.meta ?? {};
        const displayOrder = backendMeta.orderNum;
        return {
          path: routeMeta.path,
          component: routeMeta.component,
          name: routeName,
          ...(backendRoute?.hidden ? { hidden: true } : {}),
          ...(backendRoute?.query ? { query: backendRoute.query } : {}),
          meta: {
            ...(backendMeta.title ? { title: backendMeta.title } : {}),
            ...(backendMeta.icon ? { icon: backendMeta.icon } : {}),
            ...(typeof displayOrder === "number"
              ? { orderNum: displayOrder }
              : {}),
            ...(hasAffixInConsoleMode(routeMeta, currentConsoleMode)
              ? { affix: true }
              : {}),
          },
        };
      });

    if (children.length === 0) {
      return null;
    }

    const redirectPath = children[0]?.path.startsWith("/")
      ? children[0].path
      : `${groupMeta.path}/${children[0]?.path}`;

    return {
      backendGroupRoute,
      groupIndex,
      route: {
        path: groupMeta.path,
        component: "Layout",
        redirect: redirectPath,
        alwaysShow: true,
        name: groupMeta.name,
        meta: {
          ...(backendGroupMeta.title ? { title: backendGroupMeta.title } : {}),
          ...(backendGroupMeta.icon ? { icon: backendGroupMeta.icon } : {}),
          ...(typeof backendGroupMeta.orderNum === "number"
            ? { orderNum: backendGroupMeta.orderNum }
            : {}),
        },
        children,
      },
    };
  })
    .filter(Boolean)
    .sort(
      (left, right) =>
        resolveGroupOrder(left.backendGroupRoute, left.groupIndex) -
        resolveGroupOrder(
          right.backendGroupRoute,
          right.groupIndex,
        ),
    )
    .map(({ route }) => route);
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
        route.component = loadView(route.component, route.name);
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

function createNamedRouteComponent(routeName, component) {
  return defineComponent({
    name: routeName,
    setup(_props, { attrs, slots }) {
      return () => h(component, attrs, slots);
    },
  });
}

export const loadView = (view, routeName) => {
  let res;
  for (const path in modules) {
    const dir = path.split("views/")[1].split(".vue")[0];
    if (dir === view) {
      res = () =>
        modules[path]().then((module) => {
          const component = module.default || module;
          if (!routeName) {
            return component;
          }
          return createNamedRouteComponent(routeName, component);
        });
    }
  }
  return res;
};

export default usePermissionStore;
