import { ForbiddenException } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { MasterDataService } from "../../master-data/application/master-data.service";
import type { SessionUserSnapshot } from "../../session/domain/user-session";
import { WorkshopScopeService } from "./workshop-scope.service";

describe("WorkshopScopeService", () => {
  let service: WorkshopScopeService;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        WorkshopScopeService,
        {
          provide: MasterDataService,
          useValue: {
            getStockScopeByCode: jest.fn().mockResolvedValue({
              id: 2,
              scopeCode: "RD_SUB",
              scopeName: "研发小仓",
            }),
            getWorkshopByName: jest.fn().mockResolvedValue({
              id: 88,
              workshopName: "研发小仓",
            }),
          },
        },
      ],
    }).compile();

    service = moduleRef.get(WorkshopScopeService);
  });

  const rdUser: SessionUserSnapshot = {
    userId: 5,
    username: "rd-operator",
    displayName: "研发小仓管理员",
    avatarUrl: null,
    roles: ["rd-operator"],
    permissions: [],
    department: null,
    consoleMode: "rd-subwarehouse",
    stockScope: {
      mode: "FIXED",
      stockScope: "RD_SUB",
      stockScopeName: "研发小仓",
    },
    workshopScope: {
      mode: "FIXED",
      workshopId: null,
      workshopName: "研发小仓",
    },
  };

  it("resolves fixed workshop id from user scope", async () => {
    await expect(
      service.resolveQueryWorkshopId(rdUser, undefined),
    ).resolves.toBe(88);
  });

  it("rejects access to another workshop", async () => {
    await expect(service.resolveQueryWorkshopId(rdUser, 1)).rejects.toThrow(
      ForbiddenException,
    );
  });

  it("rejects access to another inventory stock scope", async () => {
    await expect(
      service.assertInventoryStockScopeAccess(rdUser, 1),
    ).rejects.toThrow(ForbiddenException);
  });
});
