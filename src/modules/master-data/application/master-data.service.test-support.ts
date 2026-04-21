import { MasterDataRepository } from "../infrastructure/master-data.repository";
import { CustomerService } from "./customer.service";
import { FieldSuggestionsService } from "./field-suggestions.service";
import { MasterDataService } from "./master-data.service";
import { MaterialService } from "./material.service";
import { MaterialCategoryService } from "./material-category.service";
import { PersonnelService } from "./personnel.service";
import { StockScopeService } from "./stock-scope.service";
import { SupplierService } from "./supplier.service";
import { WorkshopService } from "./workshop.service";

export function createRepositoryMock() {
  return {
    ensureCanonicalWorkshops: jest.fn().mockResolvedValue(undefined),
    ensureCanonicalStockScopes: jest.fn().mockResolvedValue(undefined),
    ensureDefaultMaterialCategory: jest.fn().mockResolvedValue({
      id: 99,
      categoryCode: "UNCATEGORIZED",
      categoryName: "未分类",
      status: "ACTIVE",
    }),
    assignDefaultCategoryToUncategorizedMaterials: jest
      .fn()
      .mockResolvedValue({ count: 0 }),
    findMaterialSuggestionValues: jest.fn(),
    findCustomerSuggestionValues: jest.fn(),
    findSupplierSuggestionValues: jest.fn(),
    findWorkshopSuggestionValues: jest.fn(),
    findPersonnelSuggestionValues: jest.fn(),
    findMaterialCategoryById: jest.fn(),
    findMaterialCategoryByCode: jest.fn(),
    findMaterialCategories: jest.fn(),
    createMaterialCategory: jest.fn(),
    updateMaterialCategory: jest.fn(),
    countActiveMaterialsByCategory: jest.fn(),
    findMaterialById: jest.fn(),
    findMaterialByCode: jest.fn(),
    findMaterials: jest.fn(),
    createMaterial: jest.fn(),
    createAutoMaterial: jest.fn(),
    updateMaterial: jest.fn(),
    countPositiveInventoryBalanceRows: jest.fn(),
    countEffectiveDocumentReferences: jest.fn(),
    findCustomerById: jest.fn(),
    findCustomerByCode: jest.fn(),
    findCustomers: jest.fn(),
    createCustomer: jest.fn(),
    createAutoCustomer: jest.fn(),
    updateCustomer: jest.fn(),
    countActiveChildCustomers: jest.fn(),
    findSupplierByCode: jest.fn(),
    createSupplier: jest.fn(),
    findSupplierById: jest.fn(),
    updateSupplier: jest.fn(),
    createAutoSupplier: jest.fn(),
    findSuppliers: jest.fn(),
    findPersonnelById: jest.fn(),
    findPersonnel: jest.fn(),
    createPersonnel: jest.fn(),
    updatePersonnel: jest.fn(),
    findWorkshopById: jest.fn(),
    findWorkshopByName: jest.fn(),
    findWorkshops: jest.fn(),
    createWorkshop: jest.fn(),
    updateWorkshop: jest.fn(),
    findStockScopeById: jest.fn(),
    findStockScopeByCode: jest.fn(),
    findStockScopes: jest.fn(),
    createStockScope: jest.fn(),
    updateStockScope: jest.fn(),
    countPositiveStockScopeBalanceRows: jest.fn(),
  };
}

export function createMasterDataService(repository = createRepositoryMock()) {
  return new MasterDataService(
    repository as unknown as MasterDataRepository,
    new FieldSuggestionsService(repository as unknown as MasterDataRepository),
    new MaterialCategoryService(repository as unknown as MasterDataRepository),
    new MaterialService(repository as unknown as MasterDataRepository),
    new CustomerService(repository as unknown as MasterDataRepository),
    new SupplierService(repository as unknown as MasterDataRepository),
    new PersonnelService(repository as unknown as MasterDataRepository),
    new WorkshopService(repository as unknown as MasterDataRepository),
    new StockScopeService(repository as unknown as MasterDataRepository),
  );
}
