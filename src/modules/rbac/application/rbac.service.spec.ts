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

  it("should filter routes for non-admin user", async () => {
    const routes = await rbacService.getRoutesForUser(2);
    expect(routes).toHaveLength(2);
    expect(routes[0]?.path).toBe("/dashboard");
    expect(routes[1]?.name).toBe("RdSubwarehouse");
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
      workshopId: 6,
      workshopCode: "RD",
      workshopName: "研发小仓",
    });
  });
});
