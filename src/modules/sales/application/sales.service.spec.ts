import { Test } from "@nestjs/testing";
import { SalesService } from "./sales.service";
import { SalesOutboundService } from "./sales-outbound.service";
import { SalesOutboundUpdateService } from "./sales-outbound-update.service";
import { SalesReturnService } from "./sales-return.service";

describe("SalesService (facade)", () => {
  let service: SalesService;
  let outbound: jest.Mocked<SalesOutboundService>;
  let outboundUpdate: jest.Mocked<SalesOutboundUpdateService>;
  let returnSvc: jest.Mocked<SalesReturnService>;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        SalesService,
        {
          provide: SalesOutboundService,
          useValue: {
            listOrders: jest.fn(),
            getOrderById: jest.fn(),
            createOrder: jest.fn(),
            voidOrder: jest.fn(),
          },
        },
        {
          provide: SalesOutboundUpdateService,
          useValue: { updateOrder: jest.fn() },
        },
        {
          provide: SalesReturnService,
          useValue: {
            listSalesReturns: jest.fn(),
            getSalesReturnById: jest.fn(),
            createSalesReturn: jest.fn(),
            voidSalesReturn: jest.fn(),
          },
        },
      ],
    }).compile();

    service = moduleRef.get(SalesService);
    outbound = moduleRef.get(SalesOutboundService);
    outboundUpdate = moduleRef.get(SalesOutboundUpdateService);
    returnSvc = moduleRef.get(SalesReturnService);
  });

  it("delegates outbound operations", async () => {
    await service.listOrders({});
    await service.getOrderById(1);
    await service.createOrder({} as never, "1");
    await service.updateOrder(1, {} as never, "1");
    await service.voidOrder(1, "r", "1");

    expect(outbound.listOrders).toHaveBeenCalled();
    expect(outbound.getOrderById).toHaveBeenCalledWith(1);
    expect(outbound.createOrder).toHaveBeenCalled();
    expect(outboundUpdate.updateOrder).toHaveBeenCalledWith(
      1,
      expect.anything(),
      "1",
    );
    expect(outbound.voidOrder).toHaveBeenCalledWith(1, "r", "1");
  });

  it("delegates return operations", async () => {
    await service.listSalesReturns({});
    await service.getSalesReturnById(2);
    await service.createSalesReturn({} as never, "1");
    await service.voidSalesReturn(2, "r", "1");

    expect(returnSvc.listSalesReturns).toHaveBeenCalled();
    expect(returnSvc.getSalesReturnById).toHaveBeenCalledWith(2);
    expect(returnSvc.createSalesReturn).toHaveBeenCalled();
    expect(returnSvc.voidSalesReturn).toHaveBeenCalledWith(2, "r", "1");
  });
});
