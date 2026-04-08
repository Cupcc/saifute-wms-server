import { Test } from "@nestjs/testing";
import { WorkshopScopeService } from "../../rbac/application/workshop-scope.service";
import type { SessionUserSnapshot } from "../../session/domain/user-session";
import { RdStocktakeOrderService } from "../application/rd-stocktake-order.service";
import { RdStocktakeOrderController } from "./rd-stocktake-order.controller";

describe("RdStocktakeOrderController", () => {
  let controller: RdStocktakeOrderController;
  let rdStocktakeOrderService: jest.Mocked<RdStocktakeOrderService>;
  let workshopScopeService: jest.Mocked<WorkshopScopeService>;

  const rdUser: SessionUserSnapshot = {
    userId: 5,
    username: "rd-operator",
    displayName: "研发小仓管理员",
    roles: ["rd-operator"],
    permissions: [
      "rd:stocktake-order:list",
      "rd:stocktake-order:create",
      "rd:stocktake-order:void",
    ],
    department: null,
    consoleMode: "rd-subwarehouse",
    workshopScope: {
      mode: "FIXED",
      workshopId: 6,
      workshopName: "研发小仓",
    },
  };

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [RdStocktakeOrderController],
      providers: [
        {
          provide: RdStocktakeOrderService,
          useValue: {
            listOrders: jest.fn().mockResolvedValue({ items: [], total: 0 }),
            getOrderById: jest.fn().mockResolvedValue({
              id: 1,
              workshopId: 6,
            }),
            createOrder: jest.fn().mockResolvedValue({ id: 1 }),
            voidOrder: jest.fn().mockResolvedValue({ id: 1 }),
          },
        },
        {
          provide: WorkshopScopeService,
          useValue: {
            resolveQueryWorkshopId: jest.fn().mockResolvedValue(6),
            assertWorkshopAccess: jest.fn().mockResolvedValue(undefined),
            applyFixedWorkshopScope: jest.fn().mockResolvedValue({
              documentNo: "RDSTK-001",
              bizDate: "2026-03-30",
              workshopId: 6,
              lines: [{ materialId: 100, countedQty: "7", reason: "盘点" }],
            }),
          },
        },
      ],
    }).compile();

    controller = moduleRef.get(RdStocktakeOrderController);
    rdStocktakeOrderService = moduleRef.get(RdStocktakeOrderService);
    workshopScopeService = moduleRef.get(WorkshopScopeService);
  });

  it("resolves workshop scope when listing stocktake orders", async () => {
    await controller.listOrders(
      { workshopId: 999, limit: 10, offset: 0 },
      rdUser,
    );

    expect(workshopScopeService.resolveQueryWorkshopId).toHaveBeenCalledWith(
      rdUser,
      999,
    );
    expect(rdStocktakeOrderService.listOrders).toHaveBeenCalledWith(
      expect.objectContaining({
        workshopId: 6,
        limit: 10,
        offset: 0,
      }),
    );
  });

  it("applies fixed workshop scope when creating orders", async () => {
    await controller.createOrder(
      {
        documentNo: "RDSTK-001",
        bizDate: "2026-03-30",
        workshopId: 999,
        lines: [{ materialId: 100, countedQty: "7", reason: "盘点" }],
      },
      rdUser,
    );

    expect(workshopScopeService.applyFixedWorkshopScope).toHaveBeenCalledWith(
      rdUser,
      expect.objectContaining({
        workshopId: 999,
      }),
    );
    expect(rdStocktakeOrderService.createOrder).toHaveBeenCalledWith(
      expect.objectContaining({
        workshopId: 6,
      }),
      "5",
    );
  });

  it("asserts workshop scope when voiding orders", async () => {
    await controller.voidOrder(1, { voidReason: "盘点作废" }, rdUser);

    expect(workshopScopeService.assertWorkshopAccess).toHaveBeenCalledWith(
      rdUser,
      6,
    );
    expect(rdStocktakeOrderService.voidOrder).toHaveBeenCalledWith(
      1,
      "盘点作废",
      "5",
    );
  });
});
