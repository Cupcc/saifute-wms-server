import { Injectable, type OnModuleInit } from "@nestjs/common";
import type { CreateCustomerDto } from "../dto/create-customer.dto";
import type { CreateMaterialDto } from "../dto/create-material.dto";
import type { CreateMaterialCategoryDto } from "../dto/create-material-category.dto";
import type { CreatePersonnelDto } from "../dto/create-personnel.dto";
import type { CreateStockScopeDto } from "../dto/create-stock-scope.dto";
import type { CreateSupplierDto } from "../dto/create-supplier.dto";
import type { CreateWorkshopDto } from "../dto/create-workshop.dto";
import type { QueryMasterDataDto } from "../dto/query-master-data.dto";
import type { UpdateCustomerDto } from "../dto/update-customer.dto";
import type { UpdateMaterialDto } from "../dto/update-material.dto";
import type { UpdateMaterialCategoryDto } from "../dto/update-material-category.dto";
import type { UpdatePersonnelDto } from "../dto/update-personnel.dto";
import type { UpdateStockScopeDto } from "../dto/update-stock-scope.dto";
import type { UpdateSupplierDto } from "../dto/update-supplier.dto";
import type { UpdateWorkshopDto } from "../dto/update-workshop.dto";
import { MasterDataRepository } from "../infrastructure/master-data.repository";
import { CustomerService } from "./customer.service";
import { FieldSuggestionsService } from "./field-suggestions.service";
import { MaterialService } from "./material.service";
import { MaterialCategoryService } from "./material-category.service";
import { PersonnelService } from "./personnel.service";
import { StockScopeService } from "./stock-scope.service";
import { SupplierService } from "./supplier.service";
import { WorkshopService } from "./workshop.service";

@Injectable()
export class MasterDataService implements OnModuleInit {
  constructor(
    private readonly repository: MasterDataRepository,
    private readonly fieldSuggestionsService: FieldSuggestionsService,
    private readonly materialCategoryService: MaterialCategoryService,
    private readonly materialService: MaterialService,
    private readonly customerService: CustomerService,
    private readonly supplierService: SupplierService,
    private readonly personnelService: PersonnelService,
    private readonly workshopService: WorkshopService,
    private readonly stockScopeService: StockScopeService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.repository.ensureCanonicalWorkshops();
    await this.repository.ensureCanonicalStockScopes();
    const defaultMaterialCategory =
      await this.repository.ensureDefaultMaterialCategory();
    await this.repository.assignDefaultCategoryToUncategorizedMaterials(
      defaultMaterialCategory.id,
    );
  }

  getFieldSuggestionsRequiredPermission(scope: string): string {
    return this.fieldSuggestionsService.getRequiredPermission(scope);
  }

  async getFieldSuggestions(scope: string, field: string): Promise<string[]> {
    return this.fieldSuggestionsService.getSuggestions(scope, field);
  }

  async listMaterialCategories(query: QueryMasterDataDto) {
    return this.materialCategoryService.list(query);
  }

  async getMaterialCategoryById(id: number) {
    return this.materialCategoryService.getById(id);
  }

  async createMaterialCategory(
    dto: CreateMaterialCategoryDto,
    createdBy?: string,
  ) {
    return this.materialCategoryService.create(dto, createdBy);
  }

  async updateMaterialCategory(
    id: number,
    dto: UpdateMaterialCategoryDto,
    updatedBy?: string,
  ) {
    return this.materialCategoryService.update(id, dto, updatedBy);
  }

  async deactivateMaterialCategory(id: number, updatedBy?: string) {
    return this.materialCategoryService.deactivate(id, updatedBy);
  }

  async listMaterials(query: QueryMasterDataDto) {
    return this.materialService.list(query);
  }

  async getMaterialById(id: number) {
    return this.materialService.getById(id);
  }

  async createMaterial(dto: CreateMaterialDto, createdBy?: string) {
    return this.materialService.create(dto, createdBy);
  }

  async updateMaterial(id: number, dto: UpdateMaterialDto, updatedBy?: string) {
    return this.materialService.update(id, dto, updatedBy);
  }

  async deactivateMaterial(id: number, updatedBy?: string) {
    return this.materialService.deactivate(id, updatedBy);
  }

  async ensureMaterial(
    params: {
      materialCode: string;
      materialName: string;
      unitCode: string;
      specModel?: string;
      categoryId?: number;
      sourceDocumentType?: string;
      sourceDocumentId?: number;
    },
    createdBy?: string,
  ) {
    return this.materialService.ensure(params, createdBy);
  }

  async listCustomers(query: QueryMasterDataDto) {
    return this.customerService.list(query);
  }

  async getCustomerById(id: number) {
    return this.customerService.getById(id);
  }

  async createCustomer(dto: CreateCustomerDto, createdBy?: string) {
    return this.customerService.create(dto, createdBy);
  }

  async updateCustomer(id: number, dto: UpdateCustomerDto, updatedBy?: string) {
    return this.customerService.update(id, dto, updatedBy);
  }

  async deactivateCustomer(id: number, updatedBy?: string) {
    return this.customerService.deactivate(id, updatedBy);
  }

  async ensureCustomer(
    params: {
      customerCode: string;
      customerName: string;
      parentId?: number;
      sourceDocumentType?: string;
      sourceDocumentId?: number;
    },
    createdBy?: string,
  ) {
    return this.customerService.ensure(params, createdBy);
  }

  async getSupplierById(id: number) {
    return this.supplierService.getById(id);
  }

  async createSupplier(dto: CreateSupplierDto, createdBy?: string) {
    return this.supplierService.create(dto, createdBy);
  }

  async updateSupplier(id: number, dto: UpdateSupplierDto, updatedBy?: string) {
    return this.supplierService.update(id, dto, updatedBy);
  }

  async deactivateSupplier(id: number, updatedBy?: string) {
    return this.supplierService.deactivate(id, updatedBy);
  }

  async ensureSupplier(
    params: {
      supplierCode: string;
      supplierName: string;
      sourceDocumentType?: string;
      sourceDocumentId?: number;
    },
    createdBy?: string,
  ) {
    return this.supplierService.ensure(params, createdBy);
  }

  async listSuppliers(query: QueryMasterDataDto) {
    return this.supplierService.list(query);
  }

  async listPersonnel(query: QueryMasterDataDto) {
    return this.personnelService.list(query);
  }

  async getPersonnelById(id: number) {
    return this.personnelService.getById(id);
  }

  async createPersonnel(dto: CreatePersonnelDto, createdBy?: string) {
    return this.personnelService.create(dto, createdBy);
  }

  async updatePersonnel(
    id: number,
    dto: UpdatePersonnelDto,
    updatedBy?: string,
  ) {
    return this.personnelService.update(id, dto, updatedBy);
  }

  async deactivatePersonnel(id: number, updatedBy?: string) {
    return this.personnelService.deactivate(id, updatedBy);
  }

  async listWorkshops(query: QueryMasterDataDto) {
    return this.workshopService.list(query);
  }

  async getWorkshopById(id: number) {
    return this.workshopService.getById(id);
  }

  async getWorkshopByName(workshopName: string) {
    return this.workshopService.getByName(workshopName);
  }

  async createWorkshop(dto: CreateWorkshopDto, createdBy?: string) {
    return this.workshopService.create(dto, createdBy);
  }

  async updateWorkshop(id: number, dto: UpdateWorkshopDto, updatedBy?: string) {
    return this.workshopService.update(id, dto, updatedBy);
  }

  async deactivateWorkshop(id: number, updatedBy?: string) {
    return this.workshopService.deactivate(id, updatedBy);
  }

  async listStockScopes(query: QueryMasterDataDto) {
    return this.stockScopeService.list(query);
  }

  async getStockScopeById(id: number) {
    return this.stockScopeService.getById(id);
  }

  async getStockScopeByCode(scopeCode: string) {
    return this.stockScopeService.getByCode(scopeCode);
  }

  async createStockScope(dto: CreateStockScopeDto, createdBy?: string) {
    return this.stockScopeService.create(dto, createdBy);
  }

  async updateStockScope(
    id: number,
    dto: UpdateStockScopeDto,
    updatedBy?: string,
  ) {
    return this.stockScopeService.update(id, dto, updatedBy);
  }

  async deactivateStockScope(id: number, updatedBy?: string) {
    return this.stockScopeService.deactivate(id, updatedBy);
  }
}
