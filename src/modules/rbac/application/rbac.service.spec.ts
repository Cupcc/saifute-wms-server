import { Test } from "@nestjs/testing";
import { MasterDataService } from "../../master-data/application/master-data.service";
import type { RouteNode } from "../domain/rbac.types";
import { RbacDictConfigRepository } from "../infrastructure/rbac-dict-config.repository";
import { RbacPersistenceRepository } from "../infrastructure/rbac-persistence.repository";
import { RbacResourceRepository } from "../infrastructure/rbac-resource.repository";
import { RbacRoutesRepository } from "../infrastructure/rbac-routes.repository";
import { RbacRuntimeRepository } from "../infrastructure/rbac-runtime.repository";
import { RbacSeedRepairRepository } from "../infrastructure/rbac-seed-repair.repository";
import { RbacState } from "../infrastructure/rbac-state";
import { RbacUserRepository } from "../infrastructure/rbac-user.repository";
import { RbacService } from "./rbac.service";

describe("RbacService", () => {
  let rbacService: RbacService;
  let repository: RbacRuntimeRepository;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        RbacService,
        RbacState,
        RbacRoutesRepository,
        RbacUserRepository,
        RbacResourceRepository,
        RbacDictConfigRepository,
        RbacPersistenceRepository,
        RbacSeedRepairRepository,
        RbacRuntimeRepository,
        {
          provide: MasterDataService,
          useValue: {
            getStockScopeByCode: jest.fn().mockResolvedValue({
              id: 2,
              scopeCode: "RD_SUB",
              scopeName: "研发小仓",
            }),
            getWorkshopByCode: jest.fn().mockResolvedValue({
              id: 99,
              workshopCode: "RD",
              workshopName: "研发小仓",
            }),
            getWorkshopByName: jest.fn().mockResolvedValue({
              id: 99,
              workshopCode: "RD",
              workshopName: "研发小仓",
            }),
          },
        },
      ],
    }).compile();

    rbacService = moduleRef.get(RbacService);
    repository = moduleRef.get(RbacRuntimeRepository);
  });

  it("should return designed routes for warehouse manager", async () => {
    const routes = await rbacService.getRoutesForUser(2);
    expect(routes.map((route) => route.name)).toEqual([
      "Dashboard",
      "MasterData",
      "InventoryBusiness",
      "InboundBusiness",
      "SalesBusiness",
      "WorkshopMaterialBusiness",
      "RdSubwarehouse",
    ]);
    const rdRouteNames =
      routes
        .find((route) => route.name === "RdSubwarehouse")
        ?.children?.map((route) => route.name) ?? [];
    expect(rdRouteNames).toEqual(
      expect.arrayContaining([
        "RdProcurementRequests",
        "RdInventoryLogs",
        "RdInboundResults",
      ]),
    );
    expect(rdRouteNames).not.toEqual(
      expect.arrayContaining([
        "RdWorkbench",
        "RdProjectLedger",
        "RdStocktakeOrders",
      ]),
    );

    const masterDataRouteNames =
      routes
        .find((route) => route.name === "MasterData")
        ?.children?.map((route) => route.name) ?? [];
    expect(masterDataRouteNames).not.toContain("StockInventory");

    const inventoryRouteNames =
      routes
        .find((route) => route.name === "InventoryBusiness")
        ?.children?.map((route) => route.name) ?? [];
    expect(inventoryRouteNames).toContain("StockInventory");
    expect(inventoryRouteNames).not.toEqual(
      expect.arrayContaining(["StockScrapOrder", "StockScrapDetail"]),
    );

    const workshopRouteNames =
      routes
        .find((route) => route.name === "WorkshopMaterialBusiness")
        ?.children?.map((route) => route.name) ?? [];
    expect(workshopRouteNames).toEqual(
      expect.arrayContaining([
        "TakePickOrder",
        "TakePickDetail",
        "TakeReturnOrder",
        "TakeReturnDetail",
        "StockScrapOrder",
        "StockScrapDetail",
      ]),
    );
    expect(findRouteByName(routes, "EntryOrder")?.meta?.title).toBe("验收单");
  });

  it("should only return rd console routes for rd users", async () => {
    const routes = await rbacService.getRoutesForUser(5);
    expect(routes).toHaveLength(1);
    expect(routes[0]?.name).toBe("RdSubwarehouse");
    const rdRouteNames = routes[0]?.children?.map((route) => route.name) ?? [];
    expect(rdRouteNames).toEqual(
      expect.arrayContaining([
        "RdWorkbench",
        "RdInventorySummary",
        "RdMaterialCategorySummary",
        "RdMonthlyReporting",
      ]),
    );
  });

  it("should keep full routes for admin user", async () => {
    const routes = await rbacService.getRoutesForUser(1);
    const routeNames = JSON.stringify(routes);

    expect(routeNames).toContain("SystemManagement");
    expect(routeNames).toContain("SystemUser");
    expect(routeNames).toContain("RdWorkbench");
  });

  it("should only expose routes that have backend menu records", async () => {
    await repository.deleteMenus([3214]);

    const routes = await rbacService.getRoutesForUser(1);

    expect(findRouteByName(routes, "TakePickOrder")).toBeDefined();
    expect(findRouteByName(routes, "TakePickDetail")).toBeUndefined();
  });

  it("should expose menu-managed route title, icon, and order", async () => {
    repository.updateMenu({
      menuId: 3400,
      menuName: "客户业务",
      orderNum: 5,
      icon: "guide",
    });
    repository.updateMenu({
      menuId: 3310,
      menuName: "实时库存",
      orderNum: 9,
      icon: "search",
    });
    repository.updateMenu({
      menuId: 3430,
      menuName: "项目台账",
      orderNum: 0,
      icon: "education",
    });

    const routes = await rbacService.getRoutesForUser(1);
    const stockInventory = findRouteByName(routes, "StockInventory");
    const firstBusinessRoute = routes[1];
    const salesBusiness = findRouteByName(routes, "SalesBusiness");

    expect(stockInventory?.meta).toMatchObject({
      title: "实时库存",
      icon: "search",
      orderNum: 9,
    });
    expect(firstBusinessRoute).toMatchObject({
      name: "SalesBusiness",
      meta: {
        title: "客户业务",
        icon: "guide",
        orderNum: 5,
      },
    });
    expect(salesBusiness?.children?.[0]).toMatchObject({
      name: "SalesProjectLedger",
      meta: {
        title: "项目台账",
        icon: "education",
        orderNum: 0,
      },
    });
  });

  it("should avoid binding rd users to a pseudo workshop scope", async () => {
    const user = await rbacService.getCurrentUser(5);
    expect(user.consoleMode).toBe("rd-subwarehouse");
    expect(user.workshopScope).toEqual({
      mode: "ALL",
      workshopId: null,
      workshopName: null,
    });
    expect(user.stockScope).toEqual({
      mode: "FIXED",
      stockScope: "RD_SUB",
      stockScopeName: "研发小仓",
    });
  });

  it("should expose user login identity for auth state cleanup", async () => {
    await expect(rbacService.getUserLoginIdentity(2)).resolves.toEqual({
      userId: 2,
      username: "operator",
    });
    await expect(rbacService.getUserLoginIdentity(9999)).rejects.toThrow(
      "用户不存在",
    );
  });

  it("should keep canonical approval permissions only", async () => {
    const user = await rbacService.getCurrentUser(1);
    const documentPermissions = [
      ...new Set(
        user.permissions.filter((permission) =>
          permission.startsWith("approval:document:"),
        ),
      ),
    ].sort();

    expect(documentPermissions).toEqual(
      [
        "approval:document:status",
        "approval:document:list",
        "approval:document:create",
        "approval:document:approve",
        "approval:document:reject",
        "approval:document:reset",
      ].sort(),
    );
  });
});

function findRouteByName(
  routes: RouteNode[],
  routeName: string,
): RouteNode | undefined {
  for (const route of routes) {
    if (route.name === routeName) {
      return route;
    }
    const child = route.children
      ? findRouteByName(route.children, routeName)
      : undefined;
    if (child) {
      return child;
    }
  }
  return undefined;
}
