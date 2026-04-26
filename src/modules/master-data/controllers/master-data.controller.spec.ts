import { ForbiddenException, UnauthorizedException } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import type { SessionUserSnapshot } from "../../session/domain/user-session";
import { MasterDataService } from "../application/master-data.service";
import { MasterDataController } from "./master-data.controller";

describe("MasterDataController", () => {
  let controller: MasterDataController;
  let masterDataService: jest.Mocked<Partial<MasterDataService>>;

  const adminUser: SessionUserSnapshot = {
    userId: 1,
    username: "admin",
    displayName: "管理员",
    roles: ["admin"],
    permissions: ["*:*:*"],
    department: null,
    consoleMode: "default",
    workshopScope: {
      mode: "ALL",
      workshopId: null,
      workshopName: null,
    },
  };

  beforeEach(async () => {
    masterDataService = {
      // Field suggestions
      getFieldSuggestionsRequiredPermission: jest
        .fn()
        .mockReturnValue("master:material:list"),
      getFieldSuggestions: jest.fn().mockResolvedValue(["PCS"]),
      // Supplier
      listSuppliers: jest.fn().mockResolvedValue({ items: [], total: 0 }),
      createSupplier: jest.fn().mockResolvedValue({ id: 1 }),
      updateSupplier: jest.fn().mockResolvedValue({ id: 1 }),
      deactivateSupplier: jest.fn().mockResolvedValue({ id: 1 }),
      // MaterialCategory
      listMaterialCategories: jest
        .fn()
        .mockResolvedValue({ items: [], total: 0 }),
      getMaterialCategoryById: jest.fn().mockResolvedValue({ id: 1 }),
      createMaterialCategory: jest.fn().mockResolvedValue({ id: 1 }),
      updateMaterialCategory: jest.fn().mockResolvedValue({ id: 1 }),
      deactivateMaterialCategory: jest
        .fn()
        .mockResolvedValue({ id: 1, status: "DISABLED" }),
      // Material
      listMaterials: jest.fn().mockResolvedValue({ items: [], total: 0 }),
      getMaterialById: jest.fn().mockResolvedValue({ id: 1 }),
      createMaterial: jest.fn().mockResolvedValue({ id: 1 }),
      updateMaterial: jest.fn().mockResolvedValue({ id: 1 }),
      deactivateMaterial: jest
        .fn()
        .mockResolvedValue({ id: 1, status: "DISABLED" }),
      // Customer
      listCustomers: jest.fn().mockResolvedValue({ items: [], total: 0 }),
      getCustomerById: jest.fn().mockResolvedValue({ id: 1 }),
      createCustomer: jest.fn().mockResolvedValue({ id: 1 }),
      updateCustomer: jest.fn().mockResolvedValue({ id: 1 }),
      deactivateCustomer: jest
        .fn()
        .mockResolvedValue({ id: 1, status: "DISABLED" }),
      // Personnel
      listPersonnel: jest.fn().mockResolvedValue({ items: [], total: 0 }),
      getPersonnelById: jest.fn().mockResolvedValue({ id: 1 }),
      createPersonnel: jest.fn().mockResolvedValue({ id: 1 }),
      updatePersonnel: jest.fn().mockResolvedValue({ id: 1 }),
      deactivatePersonnel: jest
        .fn()
        .mockResolvedValue({ id: 1, status: "DISABLED" }),
      // Workshop
      listWorkshops: jest.fn().mockResolvedValue({ items: [], total: 0 }),
      getWorkshopById: jest.fn().mockResolvedValue({ id: 1 }),
      createWorkshop: jest.fn().mockResolvedValue({ id: 1 }),
      updateWorkshop: jest.fn().mockResolvedValue({ id: 1 }),
      deactivateWorkshop: jest
        .fn()
        .mockResolvedValue({ id: 1, status: "DISABLED" }),
      // StockScope
      listStockScopes: jest.fn().mockResolvedValue({ items: [], total: 0 }),
      getStockScopeById: jest.fn().mockResolvedValue({ id: 1 }),
      createStockScope: jest.fn().mockResolvedValue({ id: 1 }),
      updateStockScope: jest.fn().mockResolvedValue({ id: 1 }),
      deactivateStockScope: jest
        .fn()
        .mockResolvedValue({ id: 1, status: "DISABLED" }),
    };

    const moduleRef = await Test.createTestingModule({
      controllers: [MasterDataController],
      providers: [
        {
          provide: MasterDataService,
          useValue: masterDataService,
        },
      ],
    }).compile();

    controller = moduleRef.get(MasterDataController);
  });

  it("forwards field suggestions after permission check", async () => {
    await expect(
      controller.getFieldSuggestions("material", "unitCode", adminUser),
    ).resolves.toEqual(["PCS"]);

    expect(
      masterDataService.getFieldSuggestionsRequiredPermission,
    ).toHaveBeenCalledWith("material");
    expect(masterDataService.getFieldSuggestions).toHaveBeenCalledWith(
      "material",
      "unitCode",
    );
  });

  it("rejects field suggestions when user is missing", async () => {
    await expect(
      controller.getFieldSuggestions("material", "unitCode", undefined),
    ).rejects.toThrow(UnauthorizedException);
  });

  it("rejects field suggestions when user lacks scope permission", async () => {
    const limitedUser: SessionUserSnapshot = {
      ...adminUser,
      userId: 2,
      permissions: ["master:supplier:list"],
    };

    await expect(
      controller.getFieldSuggestions("material", "unitCode", limitedUser),
    ).rejects.toThrow(ForbiddenException);
  });

  // ─── Supplier (F4) ──────────────────────────────────────────────────────────

  it("forwards supplier list queries to the service", async () => {
    await controller.listSuppliers({
      keyword: "赛福特",
      limit: 20,
      offset: 10,
    });

    expect(masterDataService.listSuppliers).toHaveBeenCalledWith({
      keyword: "赛福特",
      limit: 20,
      offset: 10,
    });
  });

  it("creates suppliers with the current user id", async () => {
    await controller.createSupplier(
      {
        supplierCode: "SUP-001",
        supplierName: "赛福特供应商",
        contactPerson: "张三",
        contactPhone: "13800000000",
        address: "苏州工业园区",
      },
      adminUser,
    );

    expect(masterDataService.createSupplier).toHaveBeenCalledWith(
      {
        supplierCode: "SUP-001",
        supplierName: "赛福特供应商",
        contactPerson: "张三",
        contactPhone: "13800000000",
        address: "苏州工业园区",
      },
      "1",
    );
  });

  it("updates suppliers with the current user id", async () => {
    await controller.updateSupplier(
      9,
      {
        supplierCode: "SUP-002",
        supplierName: "已更新供应商",
        contactPerson: "李四",
        contactPhone: "13900000000",
      },
      adminUser,
    );

    expect(masterDataService.updateSupplier).toHaveBeenCalledWith(
      9,
      {
        supplierCode: "SUP-002",
        supplierName: "已更新供应商",
        contactPerson: "李四",
        contactPhone: "13900000000",
      },
      "1",
    );
  });

  it("deactivates suppliers with the current user id", async () => {
    await controller.deactivateSupplier(9, adminUser);

    expect(masterDataService.deactivateSupplier).toHaveBeenCalledWith(9, "1");
  });

  // ─── MaterialCategory (F1) ──────────────────────────────────────────────────

  it("creates material categories with the current user id", async () => {
    await controller.createMaterialCategory(
      { categoryCode: "ELEC", categoryName: "电子元器件" },
      adminUser,
    );

    expect(masterDataService.createMaterialCategory).toHaveBeenCalledWith(
      { categoryCode: "ELEC", categoryName: "电子元器件" },
      "1",
    );
  });

  it("deactivates material categories with the current user id", async () => {
    await controller.deactivateMaterialCategory(5, adminUser);

    expect(masterDataService.deactivateMaterialCategory).toHaveBeenCalledWith(
      5,
      "1",
    );
  });

  // ─── Material (F2) ──────────────────────────────────────────────────────────

  it("deactivates materials with the current user id", async () => {
    await controller.deactivateMaterial(3, adminUser);

    expect(masterDataService.deactivateMaterial).toHaveBeenCalledWith(3, "1");
  });

  // ─── Customer (F3) ──────────────────────────────────────────────────────────

  it("creates customers with the current user id", async () => {
    await controller.createCustomer(
      {
        customerCode: "CUS-001",
        customerName: "测试客户",
        contactPerson: "张三",
        contactPhone: "13800000000",
        address: "苏州工业园区",
      },
      adminUser,
    );

    expect(masterDataService.createCustomer).toHaveBeenCalledWith(
      {
        customerCode: "CUS-001",
        customerName: "测试客户",
        contactPerson: "张三",
        contactPhone: "13800000000",
        address: "苏州工业园区",
      },
      "1",
    );
  });

  it("updates customers with contact fields and the current user id", async () => {
    await controller.updateCustomer(
      7,
      {
        customerName: "已更新客户",
        contactPerson: "李四",
        contactPhone: "13900000000",
        address: "上海市",
      },
      adminUser,
    );

    expect(masterDataService.updateCustomer).toHaveBeenCalledWith(
      7,
      {
        customerName: "已更新客户",
        contactPerson: "李四",
        contactPhone: "13900000000",
        address: "上海市",
      },
      "1",
    );
  });

  it("deactivates customers with the current user id", async () => {
    await controller.deactivateCustomer(7, adminUser);

    expect(masterDataService.deactivateCustomer).toHaveBeenCalledWith(7, "1");
  });

  // ─── Personnel (F5) ─────────────────────────────────────────────────────────

  it("creates personnel with the current user id", async () => {
    await controller.createPersonnel(
      { personnelName: "张三", contactPhone: "13800000000" },
      adminUser,
    );

    expect(masterDataService.createPersonnel).toHaveBeenCalledWith(
      { personnelName: "张三", contactPhone: "13800000000" },
      "1",
    );
  });

  it("deactivates personnel with the current user id", async () => {
    await controller.deactivatePersonnel(4, adminUser);

    expect(masterDataService.deactivatePersonnel).toHaveBeenCalledWith(4, "1");
  });

  // ─── Workshop (F6) ──────────────────────────────────────────────────────────

  it("creates workshops with the current user id", async () => {
    await controller.createWorkshop(
      { workshopName: "装配车间", defaultHandlerPersonnelId: 20 },
      adminUser,
    );

    expect(masterDataService.createWorkshop).toHaveBeenCalledWith(
      { workshopName: "装配车间", defaultHandlerPersonnelId: 20 },
      "1",
    );
  });

  it("deactivates workshops with the current user id", async () => {
    await controller.deactivateWorkshop(2, adminUser);

    expect(masterDataService.deactivateWorkshop).toHaveBeenCalledWith(2, "1");
  });

  // ─── StockScope (F7) ────────────────────────────────────────────────────────

  it("lists stock scopes", async () => {
    await controller.listStockScopes({ limit: 10, offset: 0 });

    expect(masterDataService.listStockScopes).toHaveBeenCalledWith({
      limit: 10,
      offset: 0,
    });
  });

  it("creates stock scopes with the current user id", async () => {
    await controller.createStockScope(
      { scopeCode: "TEST", scopeName: "测试仓" },
      adminUser,
    );

    expect(masterDataService.createStockScope).toHaveBeenCalledWith(
      { scopeCode: "TEST", scopeName: "测试仓" },
      "1",
    );
  });

  it("deactivates stock scopes with the current user id", async () => {
    await controller.deactivateStockScope(8, adminUser);

    expect(masterDataService.deactivateStockScope).toHaveBeenCalledWith(8, "1");
  });
});
