import { Test } from "@nestjs/testing";
import { WorkshopScopeService } from "../../rbac/application/workshop-scope.service";
import { RdHandoffService } from "../application/rd-handoff.service";
import { RdHandoffController } from "./rd-handoff.controller";

describe("RdHandoffController", () => {
  let controller: RdHandoffController;
  let rdHandoffService: jest.Mocked<RdHandoffService>;
  let workshopScopeService: jest.Mocked<WorkshopScopeService>;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [RdHandoffController],
      providers: [
        {
          provide: RdHandoffService,
          useValue: {
            listOrders: jest.fn().mockResolvedValue({ items: [], total: 0 }),
            getOrderById: jest.fn().mockResolvedValue({
              id: 1,
              targetStockScopeId: 2,
            }),
            createOrder: jest.fn().mockResolvedValue({ id: 1 }),
            voidOrder: jest.fn().mockResolvedValue({ id: 1 }),
          },
        },
        {
          provide: WorkshopScopeService,
          useValue: {
            getResolvedStockScope: jest.fn().mockResolvedValue({
              stockScopeId: 2,
              stockScope: "RD_SUB",
              stockScopeName: "研发小仓",
            }),
            assertInventoryStockScopeAccess: jest
              .fn()
              .mockResolvedValue(undefined),
          },
        },
      ],
    }).compile();

    controller = moduleRef.get(RdHandoffController);
    rdHandoffService = moduleRef.get(RdHandoffService);
    workshopScopeService = moduleRef.get(WorkshopScopeService);
  });

  it("resolves the RD workshop scope when listing orders", async () => {
    await controller.listOrders(
      { targetWorkshopId: 999, limit: 10, offset: 0 },
      undefined,
    );

    expect(workshopScopeService.getResolvedStockScope).toHaveBeenCalledWith(
      undefined,
    );
    expect(rdHandoffService.listOrders).toHaveBeenCalledWith(
      expect.objectContaining({
        targetWorkshopId: 999,
        limit: 10,
        offset: 0,
      }),
    );
  });

  it("asserts RD workshop access when reading order detail", async () => {
    await controller.getOrder(1, undefined);

    expect(rdHandoffService.getOrderById).toHaveBeenCalledWith(1);
    expect(
      workshopScopeService.assertInventoryStockScopeAccess,
    ).toHaveBeenCalledWith(undefined, 2);
  });
});
