import { ForbiddenException } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { WorkshopMaterialOrderType } from "../../../../generated/prisma/client";
import { MasterDataService } from "../../master-data/application/master-data.service";
import { WorkshopScopeService } from "../../rbac/application/workshop-scope.service";
import type { SessionUserSnapshot } from "../../session/domain/user-session";
import { WorkshopMaterialService } from "../application/workshop-material.service";
import { WorkshopMaterialController } from "./workshop-material.controller";

function buildUser(
  overrides: Partial<SessionUserSnapshot> = {},
): SessionUserSnapshot {
  return {
    userId: 1,
    username: "admin",
    displayName: "Admin",
    roles: [],
    permissions: [],
    department: null,
    consoleMode: "default",
    workshopScope: { mode: "ALL", workshopId: null, workshopName: null },
    stockScope: { mode: "ALL", stockScope: null, stockScopeName: null },
    ...overrides,
  };
}

describe("WorkshopMaterialController (scrap-order stock scope)", () => {
  const unboundUser = buildUser();
  const mainBoundUser = buildUser({
    username: "main-op",
    stockScope: { mode: "FIXED", stockScope: "MAIN", stockScopeName: "主仓" },
  });
  const rdBoundUser = buildUser({
    username: "rd-op",
    stockScope: {
      mode: "FIXED",
      stockScope: "RD_SUB",
      stockScopeName: "研发小仓",
    },
  });

  const baseCreateDto = {
    orderType: WorkshopMaterialOrderType.SCRAP,
    bizDate: "2026-07-01",
    workshopId: 1,
    lines: [{ materialId: 100, quantity: "10" }],
  };

  let controller: WorkshopMaterialController;
  let workshopMaterialService: jest.Mocked<WorkshopMaterialService>;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [WorkshopMaterialController],
      providers: [
        WorkshopScopeService,
        {
          provide: MasterDataService,
          useValue: {
            getStockScopeByCode: jest
              .fn()
              .mockImplementation(async (code: "MAIN" | "RD_SUB") => ({
                id: code === "MAIN" ? 1 : 2,
                scopeCode: code,
                scopeName: code === "MAIN" ? "主仓" : "研发小仓",
              })),
          },
        },
        {
          provide: WorkshopMaterialService,
          useValue: {
            listScrapOrders: jest.fn().mockResolvedValue({
              items: [],
              total: 0,
            }),
            listScrapOrderLines: jest.fn().mockResolvedValue({
              items: [],
              total: 0,
            }),
            createScrapOrder: jest.fn().mockResolvedValue({ id: 1 }),
          },
        },
      ],
    }).compile();

    controller = moduleRef.get(WorkshopMaterialController);
    workshopMaterialService = moduleRef.get(WorkshopMaterialService);
  });

  describe("listScrapOrders", () => {
    it("narrows an unbound user to the explicitly requested RD_SUB scope", async () => {
      await controller.listScrapOrders({ stockScope: "RD_SUB" }, unboundUser);

      expect(workshopMaterialService.listScrapOrders).toHaveBeenCalledWith(
        expect.objectContaining({ stockScope: "RD_SUB" }),
      );
    });

    it("keeps the unscoped query when an unbound user omits stockScope", async () => {
      await controller.listScrapOrders({}, unboundUser);

      expect(workshopMaterialService.listScrapOrders).toHaveBeenCalledWith(
        expect.objectContaining({ stockScope: undefined }),
      );
    });

    it("rejects a bound user requesting a mismatched stockScope", async () => {
      await expect(
        controller.listScrapOrders({ stockScope: "RD_SUB" }, mainBoundUser),
      ).rejects.toThrow(ForbiddenException);
      expect(workshopMaterialService.listScrapOrders).not.toHaveBeenCalled();
    });

    it("keeps the session scope when a bound user omits stockScope", async () => {
      await controller.listScrapOrders({}, mainBoundUser);

      expect(workshopMaterialService.listScrapOrders).toHaveBeenCalledWith(
        expect.objectContaining({ stockScope: "MAIN" }),
      );
    });
  });

  describe("listScrapOrderLines", () => {
    it("narrows an unbound user to the explicitly requested RD_SUB scope", async () => {
      await controller.listScrapOrderLines(
        { stockScope: "RD_SUB" },
        unboundUser,
      );

      expect(workshopMaterialService.listScrapOrderLines).toHaveBeenCalledWith(
        expect.objectContaining({ stockScope: "RD_SUB" }),
      );
    });

    it("rejects a bound user requesting a mismatched stockScope", async () => {
      await expect(
        controller.listScrapOrderLines({ stockScope: "RD_SUB" }, mainBoundUser),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe("createScrapOrder", () => {
    it("uses the requested RD_SUB scope for an unbound user", async () => {
      await controller.createScrapOrder(
        { ...baseCreateDto, stockScope: "RD_SUB" },
        unboundUser,
      );

      expect(workshopMaterialService.createScrapOrder).toHaveBeenCalledWith(
        expect.objectContaining({ stockScope: "RD_SUB", workshopId: 1 }),
        "admin",
      );
    });

    it("rejects a bound user whose dto stockScope conflicts with the session scope", async () => {
      await expect(
        controller.createScrapOrder(
          { ...baseCreateDto, stockScope: "RD_SUB" },
          mainBoundUser,
        ),
      ).rejects.toThrow("当前用户只能访问绑定库存范围数据");
      expect(workshopMaterialService.createScrapOrder).not.toHaveBeenCalled();
    });

    it("keeps the session scope when a bound user omits stockScope", async () => {
      await controller.createScrapOrder(baseCreateDto, rdBoundUser);

      expect(workshopMaterialService.createScrapOrder).toHaveBeenCalledWith(
        expect.objectContaining({ stockScope: "RD_SUB" }),
        "rd-op",
      );
    });

    it("keeps the default behavior when an unbound user omits stockScope", async () => {
      await controller.createScrapOrder(baseCreateDto, unboundUser);

      expect(workshopMaterialService.createScrapOrder).toHaveBeenCalledWith(
        expect.objectContaining({ stockScope: undefined }),
        "admin",
      );
    });
  });
});
