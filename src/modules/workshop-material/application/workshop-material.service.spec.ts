import { WorkshopMaterialService } from "./workshop-material.service";
import { WorkshopMaterialPickService } from "./workshop-material-pick.service";
import { WorkshopMaterialReturnService } from "./workshop-material-return.service";
import { WorkshopMaterialScrapService } from "./workshop-material-scrap.service";

/**
 * The facade itself is a thin delegator — behavioural coverage lives in the
 * per-orderType spec files (pick / return / scrap). This suite only asserts
 * that each facade method forwards to the correct sub-service so refactors in
 * the delegation wiring fail fast.
 */
describe("WorkshopMaterialService (facade)", () => {
  function buildSubServiceMock<T>(methods: ReadonlyArray<keyof T>): T {
    const mock: Record<string, jest.Mock> = {};
    for (const method of methods) {
      mock[method as string] = jest.fn().mockResolvedValue("delegated");
    }
    return mock as unknown as T;
  }

  function createFacade() {
    const pickService = buildSubServiceMock<WorkshopMaterialPickService>([
      "listPickOrders",
      "getPickOrderById",
      "createPickOrder",
      "updatePickOrder",
      "voidPickOrder",
    ]);
    const returnService = buildSubServiceMock<WorkshopMaterialReturnService>([
      "listReturnOrders",
      "getReturnOrderById",
      "createReturnOrder",
      "updateReturnOrder",
      "voidReturnOrder",
    ]);
    const scrapService = buildSubServiceMock<WorkshopMaterialScrapService>([
      "listScrapOrders",
      "getScrapOrderById",
      "createScrapOrder",
      "updateScrapOrder",
      "voidScrapOrder",
    ]);
    const facade = new WorkshopMaterialService(
      pickService,
      returnService,
      scrapService,
    );
    return { facade, pickService, returnService, scrapService };
  }

  it("delegates PICK methods to WorkshopMaterialPickService", async () => {
    const { facade, pickService } = createFacade();

    await facade.listPickOrders({});
    await facade.getPickOrderById(1);
    await facade.createPickOrder({} as never, "1");
    await facade.updatePickOrder(1, {} as never, "1");
    await facade.voidPickOrder(1, "reason", "1");

    expect(pickService.listPickOrders).toHaveBeenCalledTimes(1);
    expect(pickService.getPickOrderById).toHaveBeenCalledWith(1);
    expect(pickService.createPickOrder).toHaveBeenCalledTimes(1);
    expect(pickService.updatePickOrder).toHaveBeenCalledTimes(1);
    expect(pickService.voidPickOrder).toHaveBeenCalledWith(1, "reason", "1");
  });

  it("delegates RETURN methods to WorkshopMaterialReturnService", async () => {
    const { facade, returnService } = createFacade();

    await facade.listReturnOrders({});
    await facade.getReturnOrderById(2);
    await facade.createReturnOrder({} as never, "1");
    await facade.updateReturnOrder(2, {} as never, "1");
    await facade.voidReturnOrder(2, "reason", "1");

    expect(returnService.listReturnOrders).toHaveBeenCalledTimes(1);
    expect(returnService.getReturnOrderById).toHaveBeenCalledWith(2);
    expect(returnService.createReturnOrder).toHaveBeenCalledTimes(1);
    expect(returnService.updateReturnOrder).toHaveBeenCalledTimes(1);
    expect(returnService.voidReturnOrder).toHaveBeenCalledWith(
      2,
      "reason",
      "1",
    );
  });

  it("delegates SCRAP methods to WorkshopMaterialScrapService", async () => {
    const { facade, scrapService } = createFacade();

    await facade.listScrapOrders({});
    await facade.getScrapOrderById(3);
    await facade.createScrapOrder({} as never, "1");
    await facade.updateScrapOrder(3, {} as never, "1");
    await facade.voidScrapOrder(3, "reason", "1");

    expect(scrapService.listScrapOrders).toHaveBeenCalledTimes(1);
    expect(scrapService.getScrapOrderById).toHaveBeenCalledWith(3);
    expect(scrapService.createScrapOrder).toHaveBeenCalledTimes(1);
    expect(scrapService.updateScrapOrder).toHaveBeenCalledTimes(1);
    expect(scrapService.voidScrapOrder).toHaveBeenCalledWith(3, "reason", "1");
  });
});
