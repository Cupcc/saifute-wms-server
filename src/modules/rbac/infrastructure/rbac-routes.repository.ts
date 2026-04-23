import { Injectable } from "@nestjs/common";
import type { RouteNode } from "../domain/rbac.types";

@Injectable()
export class RbacRoutesRepository {
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
          name: "MonthlyReporting",
          path: "/system/reporting/monthly-reporting",
          component: "reporting/monthly-reporting/index",
          permissions: ["reporting:monthly-reporting:view"],
        },
        {
          name: "MonthlyReportingMaterialCategory",
          path: "/system/reporting/monthly-reporting-material-category",
          component: "reporting/monthly-reporting/index",
          permissions: ["reporting:monthly-reporting:view"],
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
        {
          name: "StockInventory",
          path: "/stock/inventory",
          component: "stock/inventory/index",
          permissions: ["inventory:balance:list"],
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
      name: "SalesBusiness",
      path: "/sales",
      component: "layout/index",
      permissions: [],
      children: [
        {
          name: "SalesOrder",
          path: "/sales/order",
          component: "sales/order/index",
          permissions: ["sales:order:list"],
        },
        {
          name: "SalesDetail",
          path: "/sales/detail",
          component: "sales/detail/index",
          permissions: ["sales:order:list"],
        },
        {
          name: "SalesReturnOrder",
          path: "/sales/salesReturnOrder",
          component: "sales/salesReturnOrder/index",
          permissions: ["sales:return:list"],
        },
        {
          name: "SalesReturnDetail",
          path: "/sales/salesReturnDetail",
          component: "sales/salesReturnDetail/index",
          permissions: ["sales:return:list"],
        },
        {
          name: "SalesProjectLedger",
          path: "/sales/project",
          component: "sales-project/index",
          permissions: ["sales:project:list"],
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
          name: "RdProjectLedger",
          path: "/rd/projects",
          component: "rd/projects/index",
          permissions: ["rd:project:list"],
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
        {
          name: "RdMonthlyReporting",
          path: "/rd/monthly-reporting",
          component: "reporting/monthly-reporting/index",
          permissions: ["reporting:monthly-reporting:view"],
        },
        {
          name: "RdMonthlyReportingMaterialCategory",
          path: "/rd/monthly-reporting-material-category",
          component: "reporting/monthly-reporting/index",
          permissions: ["reporting:monthly-reporting:view"],
        },
      ],
    },
  ];

  async getRoutes(): Promise<RouteNode[]> {
    return structuredClone(this.routes);
  }
}
