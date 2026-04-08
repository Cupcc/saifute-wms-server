import { Test } from "@nestjs/testing";
import { MasterDataService } from "../../master-data/application/master-data.service";
import { InMemoryRbacRepository } from "../infrastructure/in-memory-rbac.repository";
import { RbacService } from "./rbac.service";

describe("RbacService", () => {
  let rbacService: RbacService;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        RbacService,
        InMemoryRbacRepository,
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
  });

  it("should return designed routes for warehouse manager", async () => {
    const routes = await rbacService.getRoutesForUser(2);
    expect(routes.map((route) => route.name)).toEqual([
      "Dashboard",
      "MasterData",
      "InboundBusiness",
      "WorkshopMaterialBusiness",
      "InventoryBusiness",
      "CustomerBusiness",
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
        "RdProjectConsumption",
        "RdStocktakeOrders",
      ]),
    );
  });

  it("should only return rd console routes for rd users", async () => {
    const routes = await rbacService.getRoutesForUser(5);
    expect(routes).toHaveLength(1);
    expect(routes[0]?.name).toBe("RdSubwarehouse");
  });

  it("should keep full routes for admin user", async () => {
    const routes = await rbacService.getRoutesForUser(1);
    const routeNames = JSON.stringify(routes);

    expect(routeNames).toContain("SystemManagement");
    expect(routeNames).toContain("SystemUser");
    expect(routeNames).toContain("RdWorkbench");
  });

  it("should keep fixed workshop scope for current user", async () => {
    const user = await rbacService.getCurrentUser(5);
    expect(user.consoleMode).toBe("rd-subwarehouse");
    expect(user.workshopScope).toEqual({
      mode: "FIXED",
      workshopId: 99,
      workshopName: "研发小仓",
    });
    expect(user.stockScope).toEqual({
      mode: "FIXED",
      stockScope: "RD_SUB",
      stockScopeName: "研发小仓",
    });
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
