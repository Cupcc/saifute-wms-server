import { InboundController } from "./inbound.controller";

describe("InboundController", () => {
  const user = { userId: 7 };
  const productionOrder = { id: 3, stockScopeId: 8 };

  let controller: InboundController;
  let inboundService: {
    getOrderById: jest.Mock;
    getIntoOrderById: jest.Mock;
    updateOrder: jest.Mock;
    updateIntoOrder: jest.Mock;
    voidOrder: jest.Mock;
    voidIntoOrder: jest.Mock;
  };
  let workshopScopeService: {
    assertInventoryStockScopeAccess: jest.Mock;
    applyFixedWorkshopScope: jest.Mock;
  };

  beforeEach(() => {
    inboundService = {
      getOrderById: jest.fn(),
      getIntoOrderById: jest.fn().mockResolvedValue(productionOrder),
      updateOrder: jest.fn(),
      updateIntoOrder: jest.fn().mockResolvedValue(productionOrder),
      voidOrder: jest.fn(),
      voidIntoOrder: jest.fn().mockResolvedValue(productionOrder),
    };
    workshopScopeService = {
      assertInventoryStockScopeAccess: jest.fn().mockResolvedValue(undefined),
      applyFixedWorkshopScope: jest.fn((_, dto) => dto),
    };

    controller = new InboundController(
      inboundService as never,
      {} as never,
      workshopScopeService as never,
    );
  });

  it("gets production receipt details through the into-order service path", async () => {
    const result = await controller.getIntoOrder(3, user as never);

    expect(result).toBe(productionOrder);
    expect(inboundService.getIntoOrderById).toHaveBeenCalledWith(3);
    expect(inboundService.getOrderById).not.toHaveBeenCalled();
    expect(
      workshopScopeService.assertInventoryStockScopeAccess,
    ).toHaveBeenCalledWith(user, productionOrder.stockScopeId);
  });

  it("updates production receipt orders through the into-order service path", async () => {
    const dto = { remark: "调整生产入库备注" };
    const scopedDto = { ...dto, workshopId: 2 };
    workshopScopeService.applyFixedWorkshopScope.mockResolvedValue(scopedDto);

    const result = await controller.updateIntoOrder(
      3,
      dto as never,
      user as never,
    );

    expect(result).toBe(productionOrder);
    expect(inboundService.getIntoOrderById).toHaveBeenCalledWith(3);
    expect(inboundService.updateIntoOrder).toHaveBeenCalledWith(
      3,
      scopedDto,
      "7",
    );
    expect(inboundService.updateOrder).not.toHaveBeenCalled();
  });

  it("voids production receipt orders through the into-order service path", async () => {
    const result = await controller.voidIntoOrder(
      3,
      { voidReason: "录入错误" },
      user as never,
    );

    expect(result).toBe(productionOrder);
    expect(inboundService.getIntoOrderById).toHaveBeenCalledWith(3);
    expect(inboundService.voidIntoOrder).toHaveBeenCalledWith(
      3,
      "录入错误",
      "7",
    );
    expect(inboundService.voidOrder).not.toHaveBeenCalled();
  });
});
