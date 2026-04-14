import { Test } from "@nestjs/testing";
import { WorkshopScopeService } from "../../rbac/application/workshop-scope.service";
import { InventoryService } from "../application/inventory.service";
import { InventoryController } from "./inventory.controller";

describe("InventoryController", () => {
  let controller: InventoryController;
  let inventoryService: jest.Mocked<InventoryService>;
  let workshopScopeService: jest.Mocked<WorkshopScopeService>;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [InventoryController],
      providers: [
        {
          provide: InventoryService,
          useValue: {
            listBalances: jest.fn(),
            listLogs: jest.fn(),
            listPriceLayerAvailability: jest.fn(),
            listSourceUsages: jest
              .fn()
              .mockResolvedValue({ items: [], total: 0 }),
            listFactoryNumberReservations: jest.fn(),
            getFactoryNumberReservationById: jest.fn().mockResolvedValue({
              id: 1,
              stockScopeId: 2,
              workshopId: 9,
            }),
          },
        },
        {
          provide: WorkshopScopeService,
          useValue: {
            resolveInventoryQueryScope: jest
              .fn()
              .mockImplementation(
                async (_user, _workshopId, stockScope = "RD_SUB") => ({
                  stockScopeId: stockScope === "MAIN" ? 1 : 2,
                  stockScope,
                  stockScopeName: stockScope === "MAIN" ? "主仓" : "研发小仓",
                }),
              ),
            resolveInventoryQueryWorkshopId: jest
              .fn()
              .mockImplementation(async (_user, workshopId) => workshopId),
            assertInventoryStockScopeAccess: jest
              .fn()
              .mockResolvedValue(undefined),
            assertInventoryWorkshopAccess: jest
              .fn()
              .mockResolvedValue(undefined),
          },
        },
      ],
    }).compile();

    controller = moduleRef.get(InventoryController);
    inventoryService = moduleRef.get(InventoryService);
    workshopScopeService = moduleRef.get(WorkshopScopeService);
  });

  it("applies inventory scope when listing source usages", async () => {
    await controller.listSourceUsages(
      {
        materialId: 10,
        consumerDocumentType: "WorkshopMaterialOrder",
        consumerDocumentId: 30,
        limit: 20,
        offset: 0,
      },
      undefined,
    );

    expect(
      workshopScopeService.resolveInventoryQueryScope,
    ).toHaveBeenCalledWith(undefined);
    expect(inventoryService.listSourceUsages).toHaveBeenCalledWith({
      materialId: 10,
      stockScope: "RD_SUB",
      consumerDocumentType: "WorkshopMaterialOrder",
      consumerDocumentId: 30,
      limit: 20,
      offset: 0,
    });
  });

  it("passes explicit stock scope when listing price layers", async () => {
    await controller.listPriceLayers(
      {
        materialId: 7,
        stockScope: "MAIN",
      },
      undefined,
    );

    expect(
      workshopScopeService.resolveInventoryQueryScope,
    ).toHaveBeenCalledWith(undefined, undefined, "MAIN");
    expect(inventoryService.listPriceLayerAvailability).toHaveBeenCalledWith({
      materialId: 7,
      stockScope: "MAIN",
    });
  });

  it("passes stock scope and workshop filters when listing logs", async () => {
    await controller.listLogs(
      {
        materialId: 7,
        stockScope: "MAIN",
        workshopId: 3,
        businessDocumentType: "RdHandoffOrder",
        businessDocumentNumber: "RDH",
        limit: 20,
        offset: 0,
      },
      undefined,
    );

    expect(
      workshopScopeService.resolveInventoryQueryScope,
    ).toHaveBeenCalledWith(undefined, 3, "MAIN");
    expect(
      workshopScopeService.resolveInventoryQueryWorkshopId,
    ).toHaveBeenCalledWith(undefined, 3);
    expect(inventoryService.listLogs).toHaveBeenCalledWith({
      materialId: 7,
      stockScope: "MAIN",
      workshopId: 3,
      businessDocumentId: undefined,
      businessDocumentType: "RdHandoffOrder",
      businessDocumentNumber: "RDH",
      operationType: undefined,
      bizDateFrom: undefined,
      bizDateTo: undefined,
      limit: 20,
      offset: 0,
    });
  });

  it("asserts both stock-scope and workshop access for factory number detail", async () => {
    await controller.getFactoryNumberReservation(1, undefined);

    expect(
      inventoryService.getFactoryNumberReservationById,
    ).toHaveBeenCalledWith(1);
    expect(
      workshopScopeService.assertInventoryStockScopeAccess,
    ).toHaveBeenCalledWith(undefined, 2);
    expect(
      workshopScopeService.assertInventoryWorkshopAccess,
    ).toHaveBeenCalledWith(undefined, 9);
  });
});
