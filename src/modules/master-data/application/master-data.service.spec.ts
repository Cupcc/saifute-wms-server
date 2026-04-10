import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from "@nestjs/common";
import { MasterDataRepository } from "../infrastructure/master-data.repository";
import { MasterDataService } from "./master-data.service";

describe("MasterDataService", () => {
  function createRepositoryMock() {
    return {
      ensureCanonicalWorkshops: jest.fn().mockResolvedValue(undefined),
      ensureCanonicalStockScopes: jest.fn().mockResolvedValue(undefined),
      // Field suggestions
      findMaterialSuggestionValues: jest.fn(),
      findCustomerSuggestionValues: jest.fn(),
      findSupplierSuggestionValues: jest.fn(),
      findWorkshopSuggestionValues: jest.fn(),
      findPersonnelSuggestionValues: jest.fn(),
      // MaterialCategory
      findMaterialCategoryById: jest.fn(),
      findMaterialCategoryByCode: jest.fn(),
      findMaterialCategories: jest.fn(),
      createMaterialCategory: jest.fn(),
      updateMaterialCategory: jest.fn(),
      countActiveChildCategories: jest.fn(),
      countActiveMaterialsByCategory: jest.fn(),
      // Material
      findMaterialById: jest.fn(),
      findMaterialByCode: jest.fn(),
      findMaterials: jest.fn(),
      createMaterial: jest.fn(),
      createAutoMaterial: jest.fn(),
      updateMaterial: jest.fn(),
      countPositiveInventoryBalanceRows: jest.fn(),
      countEffectiveDocumentReferences: jest.fn(),
      // Customer
      findCustomerById: jest.fn(),
      findCustomerByCode: jest.fn(),
      findCustomers: jest.fn(),
      createCustomer: jest.fn(),
      createAutoCustomer: jest.fn(),
      updateCustomer: jest.fn(),
      countActiveChildCustomers: jest.fn(),
      // Supplier
      findSupplierByCode: jest.fn(),
      createSupplier: jest.fn(),
      findSupplierById: jest.fn(),
      updateSupplier: jest.fn(),
      createAutoSupplier: jest.fn(),
      findSuppliers: jest.fn(),
      // Personnel
      findPersonnelById: jest.fn(),
      findPersonnel: jest.fn(),
      createPersonnel: jest.fn(),
      updatePersonnel: jest.fn(),
      // Workshop
      findWorkshopById: jest.fn(),
      findWorkshopByName: jest.fn(),
      findWorkshops: jest.fn(),
      createWorkshop: jest.fn(),
      updateWorkshop: jest.fn(),
      // StockScope
      findStockScopeById: jest.fn(),
      findStockScopeByCode: jest.fn(),
      findStockScopes: jest.fn(),
      createStockScope: jest.fn(),
      updateStockScope: jest.fn(),
      countPositiveStockScopeBalanceRows: jest.fn(),
    };
  }

  it("ensures canonical workshops and stock scopes on module init", async () => {
    const repository = createRepositoryMock();
    const service = new MasterDataService(
      repository as unknown as MasterDataRepository,
    );

    await service.onModuleInit();

    expect(repository.ensureCanonicalWorkshops).toHaveBeenCalledTimes(1);
    expect(repository.ensureCanonicalStockScopes).toHaveBeenCalledTimes(1);
  });

  describe("FieldSuggestions", () => {
    it("returns required permission by scope", () => {
      const repository = createRepositoryMock();
      const service = new MasterDataService(
        repository as unknown as MasterDataRepository,
      );

      expect(service.getFieldSuggestionsRequiredPermission("material")).toBe(
        "master:material:list",
      );
      expect(service.getFieldSuggestionsRequiredPermission("personnel")).toBe(
        "master:personnel:list",
      );
    });

    it("returns material suggestions from repository", async () => {
      const repository = createRepositoryMock();
      repository.findMaterialSuggestionValues.mockResolvedValue(["PCS", "套"]);
      const service = new MasterDataService(
        repository as unknown as MasterDataRepository,
      );

      await expect(
        service.getFieldSuggestions("material", "unitCode"),
      ).resolves.toEqual(["PCS", "套"]);

      expect(repository.findMaterialSuggestionValues).toHaveBeenCalledWith(
        "unitCode",
        200,
      );
    });

    it("returns personnel suggestions from repository", async () => {
      const repository = createRepositoryMock();
      repository.findPersonnelSuggestionValues.mockResolvedValue(["张三"]);
      const service = new MasterDataService(
        repository as unknown as MasterDataRepository,
      );

      await expect(
        service.getFieldSuggestions("personnel", "personnelName"),
      ).resolves.toEqual(["张三"]);

      expect(repository.findPersonnelSuggestionValues).toHaveBeenCalledWith(
        "personnelName",
        200,
      );
    });

    it("rejects unsupported suggestion fields", async () => {
      const repository = createRepositoryMock();
      const service = new MasterDataService(
        repository as unknown as MasterDataRepository,
      );

      await expect(
        service.getFieldSuggestions("material", "supplierName"),
      ).rejects.toThrow(BadRequestException);
    });

    it("rejects unsupported suggestion scopes", async () => {
      const repository = createRepositoryMock();
      const service = new MasterDataService(
        repository as unknown as MasterDataRepository,
      );

      expect(() =>
        service.getFieldSuggestionsRequiredPermission("unknown"),
      ).toThrow(BadRequestException);
      await expect(
        service.getFieldSuggestions("unknown", "value"),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // ─── MaterialCategory (F1) ──────────────────────────────────────────────────

  describe("MaterialCategory", () => {
    it("lists material categories with active-only filter by default", async () => {
      const repository = createRepositoryMock();
      repository.findMaterialCategories.mockResolvedValue({
        items: [],
        total: 0,
      });
      const service = new MasterDataService(
        repository as unknown as MasterDataRepository,
      );

      await service.listMaterialCategories({
        keyword: "电子",
        limit: 20,
        offset: 0,
      });

      expect(repository.findMaterialCategories).toHaveBeenCalledWith(
        expect.objectContaining({ status: "ACTIVE" }),
      );
    });

    it("includes disabled categories when opt-in", async () => {
      const repository = createRepositoryMock();
      repository.findMaterialCategories.mockResolvedValue({
        items: [],
        total: 0,
      });
      const service = new MasterDataService(
        repository as unknown as MasterDataRepository,
      );

      await service.listMaterialCategories({
        includeDisabled: true,
        limit: 10,
        offset: 0,
      });

      expect(repository.findMaterialCategories).toHaveBeenCalledWith(
        expect.objectContaining({ status: undefined }),
      );
    });

    it("creates a material category after unique-code check", async () => {
      const repository = createRepositoryMock();
      repository.findMaterialCategoryByCode.mockResolvedValue(null);
      repository.createMaterialCategory.mockResolvedValue({
        id: 1,
        categoryCode: "ELEC",
        categoryName: "电子元器件",
        status: "ACTIVE",
      });
      const service = new MasterDataService(
        repository as unknown as MasterDataRepository,
      );

      const result = await service.createMaterialCategory(
        { categoryCode: "ELEC", categoryName: "电子元器件" },
        "1",
      );

      expect(repository.findMaterialCategoryByCode).toHaveBeenCalledWith(
        "ELEC",
      );
      expect(repository.createMaterialCategory).toHaveBeenCalledWith(
        expect.objectContaining({
          categoryCode: "ELEC",
          categoryName: "电子元器件",
        }),
        "1",
      );
      expect(result).toEqual(expect.objectContaining({ categoryCode: "ELEC" }));
    });

    it("rejects duplicate category codes on create", async () => {
      const repository = createRepositoryMock();
      repository.findMaterialCategoryByCode.mockResolvedValue({
        id: 1,
        categoryCode: "ELEC",
      });
      const service = new MasterDataService(
        repository as unknown as MasterDataRepository,
      );

      await expect(
        service.createMaterialCategory({
          categoryCode: "ELEC",
          categoryName: "重复",
        }),
      ).rejects.toThrow(ConflictException);
    });

    it("blocks deactivation when active child categories exist", async () => {
      const repository = createRepositoryMock();
      repository.findMaterialCategoryById.mockResolvedValue({
        id: 1,
        categoryCode: "ELEC",
        status: "ACTIVE",
        children: [],
      });
      repository.countActiveChildCategories.mockResolvedValue(2);
      const service = new MasterDataService(
        repository as unknown as MasterDataRepository,
      );

      await expect(service.deactivateMaterialCategory(1, "1")).rejects.toThrow(
        BadRequestException,
      );
      expect(repository.updateMaterialCategory).not.toHaveBeenCalled();
    });

    it("blocks deactivation when active materials reference the category", async () => {
      const repository = createRepositoryMock();
      repository.findMaterialCategoryById.mockResolvedValue({
        id: 1,
        categoryCode: "ELEC",
        status: "ACTIVE",
        children: [],
      });
      repository.countActiveChildCategories.mockResolvedValue(0);
      repository.countActiveMaterialsByCategory.mockResolvedValue(5);
      const service = new MasterDataService(
        repository as unknown as MasterDataRepository,
      );

      await expect(service.deactivateMaterialCategory(1, "1")).rejects.toThrow(
        BadRequestException,
      );
      expect(repository.updateMaterialCategory).not.toHaveBeenCalled();
    });

    it("deactivates a material category when guards pass", async () => {
      const repository = createRepositoryMock();
      repository.findMaterialCategoryById.mockResolvedValue({
        id: 1,
        categoryCode: "ELEC",
        status: "ACTIVE",
        children: [],
      });
      repository.countActiveChildCategories.mockResolvedValue(0);
      repository.countActiveMaterialsByCategory.mockResolvedValue(0);
      repository.updateMaterialCategory.mockResolvedValue({
        id: 1,
        status: "DISABLED",
      });
      const service = new MasterDataService(
        repository as unknown as MasterDataRepository,
      );

      const result = await service.deactivateMaterialCategory(1, "1");

      expect(repository.updateMaterialCategory).toHaveBeenCalledWith(
        1,
        { status: "DISABLED" },
        "1",
      );
      expect(result).toEqual(expect.objectContaining({ status: "DISABLED" }));
    });
  });

  // ─── Material (F2) ──────────────────────────────────────────────────────────

  describe("Material", () => {
    it("lists materials with active-only filter by default", async () => {
      const repository = createRepositoryMock();
      repository.findMaterials.mockResolvedValue({ items: [], total: 0 });
      const service = new MasterDataService(
        repository as unknown as MasterDataRepository,
      );

      await service.listMaterials({ keyword: "电阻", limit: 20, offset: 0 });

      expect(repository.findMaterials).toHaveBeenCalledWith(
        expect.objectContaining({ status: "ACTIVE" }),
      );
    });

    it("blocks material deactivation when any positive balance row exists", async () => {
      const repository = createRepositoryMock();
      repository.findMaterialById.mockResolvedValue({
        id: 1,
        materialCode: "M-001",
        status: "ACTIVE",
      });
      repository.countPositiveInventoryBalanceRows.mockResolvedValue(1);
      const service = new MasterDataService(
        repository as unknown as MasterDataRepository,
      );

      await expect(service.deactivateMaterial(1, "1")).rejects.toThrow(
        BadRequestException,
      );
      expect(repository.updateMaterial).not.toHaveBeenCalled();
    });

    it("blocks deactivation even when positive and negative rows offset to zero net", async () => {
      const repository = createRepositoryMock();
      repository.findMaterialById.mockResolvedValue({
        id: 1,
        materialCode: "M-001",
        status: "ACTIVE",
      });
      // scope A = +50, scope B = -50 → net sum = 0 but per-row positive count = 1
      repository.countPositiveInventoryBalanceRows.mockResolvedValue(1);
      const service = new MasterDataService(
        repository as unknown as MasterDataRepository,
      );

      await expect(service.deactivateMaterial(1, "1")).rejects.toThrow(
        BadRequestException,
      );
      expect(repository.updateMaterial).not.toHaveBeenCalled();
    });

    it("blocks material deactivation when effective document references exist", async () => {
      const repository = createRepositoryMock();
      repository.findMaterialById.mockResolvedValue({
        id: 1,
        materialCode: "M-001",
        status: "ACTIVE",
      });
      repository.countPositiveInventoryBalanceRows.mockResolvedValue(0);
      repository.countEffectiveDocumentReferences.mockResolvedValue(3);
      const service = new MasterDataService(
        repository as unknown as MasterDataRepository,
      );

      await expect(service.deactivateMaterial(1, "1")).rejects.toThrow(
        BadRequestException,
      );
      expect(repository.updateMaterial).not.toHaveBeenCalled();
    });

    it("deactivates material when all guards pass", async () => {
      const repository = createRepositoryMock();
      repository.findMaterialById.mockResolvedValue({
        id: 1,
        materialCode: "M-001",
        status: "ACTIVE",
      });
      repository.countPositiveInventoryBalanceRows.mockResolvedValue(0);
      repository.countEffectiveDocumentReferences.mockResolvedValue(0);
      repository.updateMaterial.mockResolvedValue({
        id: 1,
        status: "DISABLED",
      });
      const service = new MasterDataService(
        repository as unknown as MasterDataRepository,
      );

      const result = await service.deactivateMaterial(1, "1");

      expect(repository.updateMaterial).toHaveBeenCalledWith(
        1,
        { status: "DISABLED" },
        "1",
      );
      expect(result).toEqual(expect.objectContaining({ status: "DISABLED" }));
    });

    it("rejects material creation when category does not exist", async () => {
      const repository = createRepositoryMock();
      repository.findMaterialByCode.mockResolvedValue(null);
      repository.findMaterialCategoryById.mockResolvedValue(null);
      const service = new MasterDataService(
        repository as unknown as MasterDataRepository,
      );

      await expect(
        service.createMaterial({
          materialCode: "MAT-404",
          materialName: "不存在分类物料",
          unitCode: "个",
          categoryId: 999,
        }),
      ).rejects.toThrow(BadRequestException);
      expect(repository.createMaterial).not.toHaveBeenCalled();
    });

    it("rejects material creation when category is disabled", async () => {
      const repository = createRepositoryMock();
      repository.findMaterialByCode.mockResolvedValue(null);
      repository.findMaterialCategoryById.mockResolvedValue({
        id: 3,
        categoryCode: "CAT-3",
        categoryName: "停用分类",
        status: "DISABLED",
      });
      const service = new MasterDataService(
        repository as unknown as MasterDataRepository,
      );

      await expect(
        service.createMaterial({
          materialCode: "MAT-DISABLED-CAT",
          materialName: "停用分类物料",
          unitCode: "个",
          categoryId: 3,
        }),
      ).rejects.toThrow(BadRequestException);
      expect(repository.createMaterial).not.toHaveBeenCalled();
    });

    it("rejects material updates when category does not exist", async () => {
      const repository = createRepositoryMock();
      repository.findMaterialById.mockResolvedValue({
        id: 1,
        materialCode: "MAT-001",
        materialName: "测试物料",
        status: "ACTIVE",
      });
      repository.findMaterialCategoryById.mockResolvedValue(null);
      const service = new MasterDataService(
        repository as unknown as MasterDataRepository,
      );

      await expect(
        service.updateMaterial(1, { categoryId: 777 }, "1"),
      ).rejects.toThrow(BadRequestException);
      expect(repository.updateMaterial).not.toHaveBeenCalled();
    });

    it("allows material create without category", async () => {
      const repository = createRepositoryMock();
      repository.findMaterialByCode.mockResolvedValue(null);
      repository.createMaterial.mockResolvedValue({
        id: 1,
        materialCode: "MAT-OPTIONAL-CAT",
        materialName: "可空分类物料",
        categoryId: null,
        status: "ACTIVE",
      });
      const service = new MasterDataService(
        repository as unknown as MasterDataRepository,
      );

      await service.createMaterial({
        materialCode: "MAT-OPTIONAL-CAT",
        materialName: "可空分类物料",
        unitCode: "个",
      });

      expect(repository.findMaterialCategoryById).not.toHaveBeenCalled();
      expect(repository.createMaterial).toHaveBeenCalled();
    });

    it("creates AUTO_CREATED materials only when provenance is complete", async () => {
      const repository = createRepositoryMock();
      repository.findMaterialByCode.mockResolvedValue(null);
      repository.createAutoMaterial.mockResolvedValue({
        id: 9,
        materialCode: "M-AUTO",
        status: "ACTIVE",
        creationMode: "AUTO_CREATED",
        sourceDocumentType: "StockInOrder",
        sourceDocumentId: 5,
      });
      const service = new MasterDataService(
        repository as unknown as MasterDataRepository,
      );

      const result = await service.ensureMaterial(
        {
          materialCode: "M-AUTO",
          materialName: "自动补建物料",
          unitCode: "个",
          sourceDocumentType: "StockInOrder",
          sourceDocumentId: 5,
        },
        "1",
      );

      expect(repository.createAutoMaterial).toHaveBeenCalledWith(
        expect.objectContaining({
          materialCode: "M-AUTO",
          sourceDocumentType: "StockInOrder",
          sourceDocumentId: 5,
        }),
        "1",
      );
      expect(result).toEqual(
        expect.objectContaining({ creationMode: "AUTO_CREATED" }),
      );
    });

    it("rejects AUTO_CREATED materials without provenance", async () => {
      const repository = createRepositoryMock();
      repository.findMaterialByCode.mockResolvedValue(null);
      const service = new MasterDataService(
        repository as unknown as MasterDataRepository,
      );

      await expect(
        service.ensureMaterial({
          materialCode: "M-AUTO",
          materialName: "自动补建物料",
          unitCode: "个",
        }),
      ).rejects.toThrow(BadRequestException);
      expect(repository.createAutoMaterial).not.toHaveBeenCalled();
    });
  });

  // ─── Customer (F3) ──────────────────────────────────────────────────────────

  describe("Customer", () => {
    it("lists customers with active-only filter by default", async () => {
      const repository = createRepositoryMock();
      repository.findCustomers.mockResolvedValue({ items: [], total: 0 });
      const service = new MasterDataService(
        repository as unknown as MasterDataRepository,
      );

      await service.listCustomers({ keyword: "集团", limit: 20, offset: 0 });

      expect(repository.findCustomers).toHaveBeenCalledWith(
        expect.objectContaining({ status: "ACTIVE" }),
      );
    });

    it("creates a customer after unique-code check", async () => {
      const repository = createRepositoryMock();
      repository.findCustomerByCode.mockResolvedValue(null);
      repository.createCustomer.mockResolvedValue({
        id: 1,
        customerCode: "CUS-001",
        customerName: "测试客户",
        status: "ACTIVE",
      });
      const service = new MasterDataService(
        repository as unknown as MasterDataRepository,
      );

      const result = await service.createCustomer(
        { customerCode: "CUS-001", customerName: "测试客户" },
        "1",
      );

      expect(repository.createCustomer).toHaveBeenCalled();
      expect(result).toEqual(
        expect.objectContaining({ customerCode: "CUS-001" }),
      );
    });

    it("rejects duplicate customer codes on create", async () => {
      const repository = createRepositoryMock();
      repository.findCustomerByCode.mockResolvedValue({
        id: 1,
        customerCode: "CUS-001",
      });
      const service = new MasterDataService(
        repository as unknown as MasterDataRepository,
      );

      await expect(
        service.createCustomer({
          customerCode: "CUS-001",
          customerName: "重复",
        }),
      ).rejects.toThrow(ConflictException);
    });

    it("blocks customer deactivation when active child customers exist", async () => {
      const repository = createRepositoryMock();
      repository.findCustomerById.mockResolvedValue({
        id: 1,
        customerCode: "CUS-001",
        status: "ACTIVE",
      });
      repository.countActiveChildCustomers.mockResolvedValue(3);
      const service = new MasterDataService(
        repository as unknown as MasterDataRepository,
      );

      await expect(service.deactivateCustomer(1, "1")).rejects.toThrow(
        BadRequestException,
      );
      expect(repository.updateCustomer).not.toHaveBeenCalled();
    });

    it("deactivates customer when no active children", async () => {
      const repository = createRepositoryMock();
      repository.findCustomerById.mockResolvedValue({
        id: 1,
        customerCode: "CUS-001",
        status: "ACTIVE",
      });
      repository.countActiveChildCustomers.mockResolvedValue(0);
      repository.updateCustomer.mockResolvedValue({
        id: 1,
        status: "DISABLED",
      });
      const service = new MasterDataService(
        repository as unknown as MasterDataRepository,
      );

      const result = await service.deactivateCustomer(1, "1");

      expect(repository.updateCustomer).toHaveBeenCalledWith(
        1,
        { status: "DISABLED" },
        "1",
      );
      expect(result).toEqual(expect.objectContaining({ status: "DISABLED" }));
    });

    it("creates AUTO_CREATED customers only when provenance is complete", async () => {
      const repository = createRepositoryMock();
      repository.findCustomerByCode.mockResolvedValue(null);
      repository.createAutoCustomer.mockResolvedValue({
        id: 5,
        customerCode: "CUS-AUTO",
        status: "ACTIVE",
        creationMode: "AUTO_CREATED",
        sourceDocumentType: "SalesStockOrder",
        sourceDocumentId: 10,
      });
      const service = new MasterDataService(
        repository as unknown as MasterDataRepository,
      );

      const result = await service.ensureCustomer(
        {
          customerCode: "CUS-AUTO",
          customerName: "自动补建客户",
          sourceDocumentType: "SalesStockOrder",
          sourceDocumentId: 10,
        },
        "1",
      );

      expect(result).toEqual(
        expect.objectContaining({ creationMode: "AUTO_CREATED" }),
      );
    });
  });

  // ─── Supplier (F4) ──────────────────────────────────────────────────────────

  it("creates a supplier after passing the unique-code check", async () => {
    const repository = createRepositoryMock();
    repository.findSupplierByCode.mockResolvedValue(null);
    repository.createSupplier.mockResolvedValue({
      id: 1,
      supplierCode: "SUP-001",
      supplierName: "赛福特供应商",
      contactPerson: "张三",
      contactPhone: "13800000000",
      address: "苏州工业园区",
      status: "ACTIVE",
    });
    const service = new MasterDataService(
      repository as unknown as MasterDataRepository,
    );

    const result = await service.createSupplier(
      {
        supplierCode: "SUP-001",
        supplierName: "赛福特供应商",
        contactPerson: "张三",
        contactPhone: "13800000000",
        address: "苏州工业园区",
      },
      "1",
    );

    expect(repository.findSupplierByCode).toHaveBeenCalledWith("SUP-001");
    expect(repository.createSupplier).toHaveBeenCalledWith(
      {
        supplierCode: "SUP-001",
        supplierName: "赛福特供应商",
        contactPerson: "张三",
        contactPhone: "13800000000",
        address: "苏州工业园区",
      },
      "1",
    );
    expect(result).toEqual(
      expect.objectContaining({
        supplierCode: "SUP-001",
        supplierName: "赛福特供应商",
        contactPerson: "张三",
      }),
    );
  });

  it("rejects duplicate supplier codes on create", async () => {
    const repository = createRepositoryMock();
    repository.findSupplierByCode.mockResolvedValue({
      id: 1,
      supplierCode: "SUP-001",
      supplierName: "已存在供应商",
    });
    const service = new MasterDataService(
      repository as unknown as MasterDataRepository,
    );

    await expect(
      service.createSupplier({
        supplierCode: "SUP-001",
        supplierName: "重复供应商",
      }),
    ).rejects.toThrow(ConflictException);
    expect(repository.createSupplier).not.toHaveBeenCalled();
  });

  it("updates supplier code and contacts after checking for conflicts", async () => {
    const repository = createRepositoryMock();
    repository.findSupplierById.mockResolvedValue({
      id: 1,
      supplierCode: "SUP-001",
      supplierName: "旧供应商",
      contactPerson: "旧联系人",
      contactPhone: "13900000000",
      address: "旧地址",
      status: "ACTIVE",
    });
    repository.findSupplierByCode.mockResolvedValue(null);
    repository.updateSupplier.mockResolvedValue({
      id: 1,
      supplierCode: "SUP-002",
      supplierName: "新供应商",
      contactPerson: "新联系人",
      contactPhone: "13800000000",
      address: "新地址",
      status: "ACTIVE",
    });
    const service = new MasterDataService(
      repository as unknown as MasterDataRepository,
    );

    const result = await service.updateSupplier(
      1,
      {
        supplierCode: "SUP-002",
        supplierName: "新供应商",
        contactPerson: "新联系人",
        contactPhone: "13800000000",
        address: "新地址",
      },
      "2",
    );

    expect(repository.findSupplierById).toHaveBeenCalledWith(1);
    expect(repository.findSupplierByCode).toHaveBeenCalledWith("SUP-002");
    expect(repository.updateSupplier).toHaveBeenCalledWith(
      1,
      {
        supplierCode: "SUP-002",
        supplierName: "新供应商",
        contactPerson: "新联系人",
        contactPhone: "13800000000",
        address: "新地址",
      },
      "2",
    );
    expect(result).toEqual(
      expect.objectContaining({
        supplierCode: "SUP-002",
      }),
    );
  });

  it("rejects supplier updates when the target record does not exist", async () => {
    const repository = createRepositoryMock();
    repository.findSupplierById.mockResolvedValue(null);
    const service = new MasterDataService(
      repository as unknown as MasterDataRepository,
    );

    await expect(
      service.updateSupplier(404, {
        supplierName: "不存在供应商",
      }),
    ).rejects.toThrow(NotFoundException);
    expect(repository.updateSupplier).not.toHaveBeenCalled();
  });

  it("deactivates active suppliers and keeps detail reads status agnostic", async () => {
    const repository = createRepositoryMock();
    repository.findSupplierById.mockResolvedValue({
      id: 1,
      supplierCode: "SUP-001",
      supplierName: "赛福特供应商",
      status: "ACTIVE",
    });
    repository.updateSupplier.mockResolvedValue({
      id: 1,
      supplierCode: "SUP-001",
      supplierName: "赛福特供应商",
      status: "DISABLED",
    });
    const service = new MasterDataService(
      repository as unknown as MasterDataRepository,
    );

    const result = await service.deactivateSupplier(1, "3");

    expect(repository.findSupplierById).toHaveBeenCalledWith(1);
    expect(repository.updateSupplier).toHaveBeenCalledWith(
      1,
      {
        status: "DISABLED",
      },
      "3",
    );
    expect(result).toEqual(
      expect.objectContaining({
        status: "DISABLED",
      }),
    );
  });

  it("returns disabled suppliers directly when deactivation is requested twice", async () => {
    const repository = createRepositoryMock();
    repository.findSupplierById.mockResolvedValue({
      id: 1,
      supplierCode: "SUP-001",
      supplierName: "赛福特供应商",
      status: "DISABLED",
    });
    const service = new MasterDataService(
      repository as unknown as MasterDataRepository,
    );

    const result = await service.deactivateSupplier(1, "3");

    expect(repository.updateSupplier).not.toHaveBeenCalled();
    expect(result).toEqual(
      expect.objectContaining({
        status: "DISABLED",
      }),
    );
  });

  it("lists suppliers with ACTIVE-only filtering by default", async () => {
    const repository = createRepositoryMock();
    repository.findSuppliers.mockResolvedValue({
      items: [],
      total: 0,
    });
    const service = new MasterDataService(
      repository as unknown as MasterDataRepository,
    );

    await service.listSuppliers({
      keyword: "赛福特",
      limit: 20,
      offset: 5,
    });

    expect(repository.findSuppliers).toHaveBeenCalledWith({
      keyword: "赛福特",
      limit: 20,
      offset: 5,
      status: "ACTIVE",
    });
  });

  it("allows opt-in supplier queries to include disabled records", async () => {
    const repository = createRepositoryMock();
    repository.findSuppliers.mockResolvedValue({
      items: [],
      total: 0,
    });
    const service = new MasterDataService(
      repository as unknown as MasterDataRepository,
    );

    await service.listSuppliers({
      keyword: "历史供应商",
      limit: 10,
      offset: 0,
      includeDisabled: true,
    });

    expect(repository.findSuppliers).toHaveBeenCalledWith({
      keyword: "历史供应商",
      limit: 10,
      offset: 0,
      status: undefined,
    });
  });

  it("creates AUTO_CREATED suppliers only when provenance is complete", async () => {
    const repository = createRepositoryMock();
    repository.findSupplierByCode.mockResolvedValue(null);
    repository.createAutoSupplier.mockResolvedValue({
      id: 9,
      supplierCode: "SUP-AUTO",
      supplierName: "自动补建供应商",
      status: "ACTIVE",
      creationMode: "AUTO_CREATED",
      sourceDocumentType: "StockInOrder",
      sourceDocumentId: 88,
    });
    const service = new MasterDataService(
      repository as unknown as MasterDataRepository,
    );

    const result = await service.ensureSupplier(
      {
        supplierCode: "SUP-AUTO",
        supplierName: "自动补建供应商",
        sourceDocumentType: "StockInOrder",
        sourceDocumentId: 88,
      },
      "1",
    );

    expect(repository.createAutoSupplier).toHaveBeenCalledWith(
      {
        supplierCode: "SUP-AUTO",
        supplierName: "自动补建供应商",
        sourceDocumentType: "StockInOrder",
        sourceDocumentId: 88,
      },
      "1",
    );
    expect(result).toEqual(
      expect.objectContaining({
        creationMode: "AUTO_CREATED",
      }),
    );
  });

  it("rejects AUTO_CREATED suppliers without provenance", async () => {
    const repository = createRepositoryMock();
    repository.findSupplierByCode.mockResolvedValue(null);
    const service = new MasterDataService(
      repository as unknown as MasterDataRepository,
    );

    await expect(
      service.ensureSupplier({
        supplierCode: "SUP-AUTO",
        supplierName: "自动补建供应商",
        sourceDocumentType: "StockInOrder",
      }),
    ).rejects.toThrow(BadRequestException);
    expect(repository.createAutoSupplier).not.toHaveBeenCalled();
  });

  // ─── Personnel (F5) ─────────────────────────────────────────────────────────

  describe("Personnel", () => {
    it("lists personnel with active-only filter by default", async () => {
      const repository = createRepositoryMock();
      repository.findPersonnel.mockResolvedValue({ items: [], total: 0 });
      const service = new MasterDataService(
        repository as unknown as MasterDataRepository,
      );

      await service.listPersonnel({ keyword: "张", limit: 20, offset: 0 });

      expect(repository.findPersonnel).toHaveBeenCalledWith(
        expect.objectContaining({ status: "ACTIVE" }),
      );
    });

    it("creates a personnel record", async () => {
      const repository = createRepositoryMock();
      repository.createPersonnel.mockResolvedValue({
        id: 1,
        personnelName: "张三",
        contactPhone: "13800000000",
        status: "ACTIVE",
      });
      const service = new MasterDataService(
        repository as unknown as MasterDataRepository,
      );

      const result = await service.createPersonnel(
        { personnelName: "张三", contactPhone: "13800000000" },
        "1",
      );

      expect(repository.createPersonnel).toHaveBeenCalledWith(
        { personnelName: "张三", contactPhone: "13800000000" },
        "1",
      );
      expect(result).toEqual(
        expect.objectContaining({
          personnelName: "张三",
          contactPhone: "13800000000",
        }),
      );
    });

    it("updates personnel and allows clearing contactPhone", async () => {
      const repository = createRepositoryMock();
      repository.findPersonnelById.mockResolvedValue({
        id: 1,
        personnelName: "张三",
        contactPhone: "13800000000",
        status: "ACTIVE",
      });
      repository.updatePersonnel.mockResolvedValue({
        id: 1,
        personnelName: "张三",
        contactPhone: null,
        status: "ACTIVE",
      });
      const service = new MasterDataService(
        repository as unknown as MasterDataRepository,
      );

      const result = await service.updatePersonnel(
        1,
        { contactPhone: null },
        "1",
      );

      expect(repository.updatePersonnel).toHaveBeenCalledWith(
        1,
        { personnelName: undefined, contactPhone: null },
        "1",
      );
      expect(result).toEqual(
        expect.objectContaining({
          personnelName: "张三",
          contactPhone: null,
        }),
      );
    });

    it("deactivates active personnel", async () => {
      const repository = createRepositoryMock();
      repository.findPersonnelById.mockResolvedValue({
        id: 1,
        status: "ACTIVE",
      });
      repository.updatePersonnel.mockResolvedValue({
        id: 1,
        status: "DISABLED",
      });
      const service = new MasterDataService(
        repository as unknown as MasterDataRepository,
      );

      const result = await service.deactivatePersonnel(1, "1");

      expect(repository.updatePersonnel).toHaveBeenCalledWith(
        1,
        { status: "DISABLED" },
        "1",
      );
      expect(result).toEqual(expect.objectContaining({ status: "DISABLED" }));
    });

    it("returns already-disabled personnel without extra update", async () => {
      const repository = createRepositoryMock();
      repository.findPersonnelById.mockResolvedValue({
        id: 1,
        status: "DISABLED",
      });
      const service = new MasterDataService(
        repository as unknown as MasterDataRepository,
      );

      await service.deactivatePersonnel(1, "1");

      expect(repository.updatePersonnel).not.toHaveBeenCalled();
    });
  });

  // ─── Workshop (F6) ──────────────────────────────────────────────────────────

  describe("Workshop", () => {
    it("lists workshops with active-only filter by default", async () => {
      const repository = createRepositoryMock();
      repository.findWorkshops.mockResolvedValue({ items: [], total: 0 });
      const service = new MasterDataService(
        repository as unknown as MasterDataRepository,
      );

      await service.listWorkshops({ keyword: "车间", limit: 20, offset: 0 });

      expect(repository.findWorkshops).toHaveBeenCalledWith(
        expect.objectContaining({ status: "ACTIVE" }),
      );
    });

    it("creates a workshop with an optional default handler", async () => {
      const repository = createRepositoryMock();
      repository.findWorkshopByName.mockResolvedValue(null);
      repository.createWorkshop.mockResolvedValue({
        id: 1,
        workshopName: "装配车间",
        defaultHandlerPersonnelId: 20,
        status: "ACTIVE",
      });
      repository.findPersonnelById.mockResolvedValue({
        id: 20,
        personnelName: "张三",
        status: "ACTIVE",
      });
      const service = new MasterDataService(
        repository as unknown as MasterDataRepository,
      );

      const result = await service.createWorkshop(
        { workshopName: "装配车间", defaultHandlerPersonnelId: 20 },
        "1",
      );

      expect(repository.createWorkshop).toHaveBeenCalledWith(
        {
          workshopName: "装配车间",
          defaultHandlerPersonnelId: 20,
        },
        "1",
      );
      expect(result).toEqual(
        expect.objectContaining({
          workshopName: "装配车间",
          defaultHandlerPersonnelId: 20,
        }),
      );
    });

    it("updates workshop default handler when explicitly cleared", async () => {
      const repository = createRepositoryMock();
      repository.findWorkshopById.mockResolvedValue({
        id: 1,
        workshopName: "装配车间",
        defaultHandlerPersonnelId: 20,
        status: "ACTIVE",
      });
      repository.updateWorkshop.mockResolvedValue({
        id: 1,
        workshopName: "装配车间",
        defaultHandlerPersonnelId: null,
        status: "ACTIVE",
      });
      const service = new MasterDataService(
        repository as unknown as MasterDataRepository,
      );

      await service.updateWorkshop(1, { defaultHandlerPersonnelId: null }, "1");

      expect(repository.updateWorkshop).toHaveBeenCalledWith(
        1,
        { workshopName: undefined, defaultHandlerPersonnelId: null },
        "1",
      );
    });

    it("deactivates active workshops", async () => {
      const repository = createRepositoryMock();
      repository.findWorkshopById.mockResolvedValue({
        id: 1,
        workshopName: "装配车间",
        status: "ACTIVE",
      });
      repository.updateWorkshop.mockResolvedValue({
        id: 1,
        status: "DISABLED",
      });
      const service = new MasterDataService(
        repository as unknown as MasterDataRepository,
      );

      const result = await service.deactivateWorkshop(1, "1");

      expect(repository.updateWorkshop).toHaveBeenCalledWith(
        1,
        { status: "DISABLED" },
        "1",
      );
      expect(result).toEqual(expect.objectContaining({ status: "DISABLED" }));
    });
  });

  // ─── StockScope (F7) ────────────────────────────────────────────────────────

  describe("StockScope", () => {
    it("lists stock scopes with active-only filter by default", async () => {
      const repository = createRepositoryMock();
      repository.findStockScopes.mockResolvedValue({ items: [], total: 0 });
      const service = new MasterDataService(
        repository as unknown as MasterDataRepository,
      );

      await service.listStockScopes({ limit: 20, offset: 0 });

      expect(repository.findStockScopes).toHaveBeenCalledWith(
        expect.objectContaining({ status: "ACTIVE" }),
      );
    });

    it("creates a stock scope after unique-code check", async () => {
      const repository = createRepositoryMock();
      repository.findStockScopeByCode.mockResolvedValue(null);
      repository.createStockScope.mockResolvedValue({
        id: 1,
        scopeCode: "TEST",
        scopeName: "测试仓",
        status: "ACTIVE",
      });
      const service = new MasterDataService(
        repository as unknown as MasterDataRepository,
      );

      const result = await service.createStockScope(
        { scopeCode: "TEST", scopeName: "测试仓" },
        "1",
      );

      expect(repository.createStockScope).toHaveBeenCalled();
      expect(result).toEqual(expect.objectContaining({ scopeCode: "TEST" }));
    });

    it("rejects duplicate scope codes on create", async () => {
      const repository = createRepositoryMock();
      repository.findStockScopeByCode.mockResolvedValue({
        id: 1,
        scopeCode: "MAIN",
      });
      const service = new MasterDataService(
        repository as unknown as MasterDataRepository,
      );

      await expect(
        service.createStockScope({ scopeCode: "MAIN", scopeName: "重复" }),
      ).rejects.toThrow(ConflictException);
    });

    it("blocks stock scope deactivation when any positive balance row exists", async () => {
      const repository = createRepositoryMock();
      repository.findStockScopeById.mockResolvedValue({
        id: 1,
        scopeCode: "TEST",
        status: "ACTIVE",
      });
      repository.countPositiveStockScopeBalanceRows.mockResolvedValue(2);
      const service = new MasterDataService(
        repository as unknown as MasterDataRepository,
      );

      await expect(service.deactivateStockScope(1, "1")).rejects.toThrow(
        BadRequestException,
      );
      expect(repository.updateStockScope).not.toHaveBeenCalled();
    });

    it("deactivates stock scope when balance is zero", async () => {
      const repository = createRepositoryMock();
      repository.findStockScopeById.mockResolvedValue({
        id: 1,
        scopeCode: "TEST",
        status: "ACTIVE",
      });
      repository.countPositiveStockScopeBalanceRows.mockResolvedValue(0);
      repository.updateStockScope.mockResolvedValue({
        id: 1,
        status: "DISABLED",
      });
      const service = new MasterDataService(
        repository as unknown as MasterDataRepository,
      );

      const result = await service.deactivateStockScope(1, "1");

      expect(repository.updateStockScope).toHaveBeenCalledWith(
        1,
        { status: "DISABLED" },
        "1",
      );
      expect(result).toEqual(expect.objectContaining({ status: "DISABLED" }));
    });
  });

  // ─── Fix 2: canonical DISABLED record lookup guard ───────────────────────────

  describe("disabled canonical record guard", () => {
    it("rejects getStockScopeByCode when the record is DISABLED", async () => {
      const repository = createRepositoryMock();
      repository.findStockScopeByCode.mockResolvedValue({
        id: 1,
        scopeCode: "MAIN",
        status: "DISABLED",
      });
      const service = new MasterDataService(
        repository as unknown as MasterDataRepository,
      );

      await expect(service.getStockScopeByCode("MAIN")).rejects.toThrow(
        BadRequestException,
      );
    });

    it("returns scope when it is ACTIVE", async () => {
      const repository = createRepositoryMock();
      repository.findStockScopeByCode.mockResolvedValue({
        id: 1,
        scopeCode: "MAIN",
        status: "ACTIVE",
      });
      const service = new MasterDataService(
        repository as unknown as MasterDataRepository,
      );

      const result = await service.getStockScopeByCode("MAIN");
      expect(result).toEqual(expect.objectContaining({ scopeCode: "MAIN" }));
    });

    it("rejects getWorkshopByName when the matching record is DISABLED", async () => {
      const repository = createRepositoryMock();
      repository.findWorkshopByName.mockResolvedValue({
        id: 2,
        workshopName: "研发小仓",
        status: "DISABLED",
      });
      const service = new MasterDataService(
        repository as unknown as MasterDataRepository,
      );

      await expect(service.getWorkshopByName("研发小仓")).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  // ─── Fix 3: tree self-parent and cycle guard ─────────────────────────────────

  describe("tree parent validation", () => {
    it("rejects self-parent on MaterialCategory update", async () => {
      const repository = createRepositoryMock();
      repository.findMaterialCategoryById.mockResolvedValue({
        id: 5,
        categoryCode: "ELEC",
        status: "ACTIVE",
        parentId: null,
        children: [],
      });
      const service = new MasterDataService(
        repository as unknown as MasterDataRepository,
      );

      await expect(
        service.updateMaterialCategory(5, { parentId: 5 }, "1"),
      ).rejects.toThrow(BadRequestException);
      expect(repository.updateMaterialCategory).not.toHaveBeenCalled();
    });

    it("rejects cycle on MaterialCategory update (child becoming parent of its own ancestor)", async () => {
      const repository = createRepositoryMock();
      // Node 5 is the node being updated; candidate parentId = 10
      // Walking up from 10: 10 → parentId=5 → hits nodeId, cycle detected
      repository.findMaterialCategoryById
        .mockResolvedValueOnce({
          id: 5,
          categoryCode: "ELEC",
          status: "ACTIVE",
          parentId: null,
          children: [],
        })
        .mockResolvedValueOnce({
          id: 10,
          categoryCode: "RESISTOR",
          parentId: 5,
        });
      const service = new MasterDataService(
        repository as unknown as MasterDataRepository,
      );

      await expect(
        service.updateMaterialCategory(5, { parentId: 10 }, "1"),
      ).rejects.toThrow(BadRequestException);
      expect(repository.updateMaterialCategory).not.toHaveBeenCalled();
    });

    it("accepts a valid non-cycle parent on MaterialCategory update", async () => {
      const repository = createRepositoryMock();
      // Node 5; candidate parentId = 3; 3's parent = null → no cycle
      repository.findMaterialCategoryById
        .mockResolvedValueOnce({
          id: 5,
          categoryCode: "ELEC",
          status: "ACTIVE",
          parentId: null,
          children: [],
        })
        .mockResolvedValueOnce({
          id: 3,
          categoryCode: "COMPONENT",
          parentId: null,
        });
      repository.updateMaterialCategory.mockResolvedValue({
        id: 5,
        parentId: 3,
      });
      const service = new MasterDataService(
        repository as unknown as MasterDataRepository,
      );

      await expect(
        service.updateMaterialCategory(5, { parentId: 3 }, "1"),
      ).resolves.toBeDefined();
      expect(repository.updateMaterialCategory).toHaveBeenCalled();
    });

    it("rejects self-parent on Customer update", async () => {
      const repository = createRepositoryMock();
      repository.findCustomerById.mockResolvedValue({
        id: 7,
        customerCode: "CUS-001",
        status: "ACTIVE",
        parentId: null,
      });
      const service = new MasterDataService(
        repository as unknown as MasterDataRepository,
      );

      await expect(
        service.updateCustomer(7, { parentId: 7 }, "1"),
      ).rejects.toThrow(BadRequestException);
      expect(repository.updateCustomer).not.toHaveBeenCalled();
    });

    it("rejects cycle on Customer update", async () => {
      const repository = createRepositoryMock();
      // Customer 7 updated to parentId=20; 20's parent = 7 → cycle
      repository.findCustomerById
        .mockResolvedValueOnce({
          id: 7,
          customerCode: "CUS-001",
          status: "ACTIVE",
          parentId: null,
        })
        .mockResolvedValueOnce({
          id: 20,
          customerCode: "CUS-CHILD",
          parentId: 7,
        });
      const service = new MasterDataService(
        repository as unknown as MasterDataRepository,
      );

      await expect(
        service.updateCustomer(7, { parentId: 20 }, "1"),
      ).rejects.toThrow(BadRequestException);
      expect(repository.updateCustomer).not.toHaveBeenCalled();
    });

    it("accepts a valid non-cycle parent on Customer update", async () => {
      const repository = createRepositoryMock();
      repository.findCustomerById
        .mockResolvedValueOnce({
          id: 7,
          customerCode: "CUS-001",
          status: "ACTIVE",
          parentId: null,
        })
        .mockResolvedValueOnce({
          id: 2,
          customerCode: "CUS-GROUP",
          parentId: null,
        });
      repository.updateCustomer.mockResolvedValue({ id: 7, parentId: 2 });
      const service = new MasterDataService(
        repository as unknown as MasterDataRepository,
      );

      await expect(
        service.updateCustomer(7, { parentId: 2 }, "1"),
      ).resolves.toBeDefined();
      expect(repository.updateCustomer).toHaveBeenCalled();
    });
  });
});
