import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  type OnModuleInit,
} from "@nestjs/common";
import { Prisma } from "../../../generated/prisma/client";
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

type FieldSuggestionScope =
  | "material"
  | "customer"
  | "supplier"
  | "workshop"
  | "personnel";

const FIELD_SUGGESTION_SCOPE_CONFIG = {
  material: {
    permission: "master:material:list",
    fields: new Set(["unitCode", "specModel", "materialName", "materialCode"]),
  },
  customer: {
    permission: "master:customer:list",
    fields: new Set(["customerCode", "customerName"]),
  },
  supplier: {
    permission: "master:supplier:list",
    fields: new Set(["supplierCode", "supplierName"]),
  },
  workshop: {
    permission: "master:workshop:list",
    fields: new Set(["workshopCode", "workshopName"]),
  },
  personnel: {
    permission: "master:personnel:list",
    fields: new Set(["personnelCode", "personnelName"]),
  },
} as const;

@Injectable()
export class MasterDataService implements OnModuleInit {
  private static readonly FIELD_SUGGESTION_LIMIT = 200;

  constructor(private readonly repository: MasterDataRepository) {}

  async onModuleInit(): Promise<void> {
    await this.repository.ensureCanonicalWorkshops();
    await this.repository.ensureCanonicalStockScopes();
  }

  // ─── Field Suggestions ──────────────────────────────────────────────────────

  getFieldSuggestionsRequiredPermission(scope: string): string {
    return this.resolveFieldSuggestionScopeConfig(scope).permission;
  }

  async getFieldSuggestions(scope: string, field: string): Promise<string[]> {
    const config = this.resolveFieldSuggestionScopeConfig(scope);
    if (!config.fields.has(field)) {
      throw new BadRequestException(`不支持的建议字段: ${field}`);
    }

    switch (scope as FieldSuggestionScope) {
      case "material":
        return this.repository.findMaterialSuggestionValues(
          field as "unitCode" | "specModel" | "materialName" | "materialCode",
          MasterDataService.FIELD_SUGGESTION_LIMIT,
        );
      case "customer":
        return this.repository.findCustomerSuggestionValues(
          field as "customerCode" | "customerName",
          MasterDataService.FIELD_SUGGESTION_LIMIT,
        );
      case "supplier":
        return this.repository.findSupplierSuggestionValues(
          field as "supplierCode" | "supplierName",
          MasterDataService.FIELD_SUGGESTION_LIMIT,
        );
      case "workshop":
        return this.repository.findWorkshopSuggestionValues(
          field as "workshopCode" | "workshopName",
          MasterDataService.FIELD_SUGGESTION_LIMIT,
        );
      case "personnel":
        return this.repository.findPersonnelSuggestionValues(
          field as "personnelCode" | "personnelName",
          MasterDataService.FIELD_SUGGESTION_LIMIT,
        );
    }
  }

  private resolveFieldSuggestionScopeConfig(scope: string) {
    const config =
      FIELD_SUGGESTION_SCOPE_CONFIG[
        scope as keyof typeof FIELD_SUGGESTION_SCOPE_CONFIG
      ];
    if (!config) {
      throw new BadRequestException(`不支持的建议范围: ${scope}`);
    }
    return config;
  }

  // ─── MaterialCategory (F1) ──────────────────────────────────────────────────

  async listMaterialCategories(query: QueryMasterDataDto) {
    const limit = Math.min(query.limit ?? 50, 100);
    const offset = query.offset ?? 0;
    return this.repository.findMaterialCategories({
      keyword: query.keyword,
      limit,
      offset,
      status: query.includeDisabled ? undefined : "ACTIVE",
    });
  }

  async getMaterialCategoryById(id: number) {
    const category = await this.repository.findMaterialCategoryById(id);
    if (!category) {
      throw new NotFoundException(`物料分类不存在: ${id}`);
    }
    return category;
  }

  async createMaterialCategory(
    dto: CreateMaterialCategoryDto,
    createdBy?: string,
  ) {
    const existing = await this.repository.findMaterialCategoryByCode(
      dto.categoryCode,
    );
    if (existing) {
      throw new ConflictException(`物料分类编码已存在: ${dto.categoryCode}`);
    }

    return this.repository.createMaterialCategory(
      {
        categoryCode: dto.categoryCode,
        categoryName: dto.categoryName,
        parentId: dto.parentId,
        sortOrder: dto.sortOrder ?? 0,
      },
      createdBy,
    );
  }

  async updateMaterialCategory(
    id: number,
    dto: UpdateMaterialCategoryDto,
    updatedBy?: string,
  ) {
    const existing = await this.repository.findMaterialCategoryById(id);
    if (!existing) {
      throw new NotFoundException(`物料分类不存在: ${id}`);
    }

    if (dto.parentId !== undefined && dto.parentId !== null) {
      if (dto.parentId === id) {
        throw new BadRequestException("物料分类不能将自身设为父分类");
      }
      const hasCycle = await this.wouldCreateMaterialCategoryCycle(
        id,
        dto.parentId,
      );
      if (hasCycle) {
        throw new BadRequestException(
          "不能将物料分类挂到其自身的后代节点下，否则会形成循环",
        );
      }
    }

    return this.repository.updateMaterialCategory(
      id,
      {
        categoryName: dto.categoryName,
        parentId: dto.parentId,
        sortOrder: dto.sortOrder,
      },
      updatedBy,
    );
  }

  async deactivateMaterialCategory(id: number, updatedBy?: string) {
    const existing = await this.repository.findMaterialCategoryById(id);
    if (!existing) {
      throw new NotFoundException(`物料分类不存在: ${id}`);
    }
    if (existing.status === "DISABLED") {
      return existing;
    }

    const activeChildCount =
      await this.repository.countActiveChildCategories(id);
    if (activeChildCount > 0) {
      throw new BadRequestException(
        `该分类下存在 ${activeChildCount} 个启用中的子分类，请先停用子分类`,
      );
    }

    const activeMaterialCount =
      await this.repository.countActiveMaterialsByCategory(id);
    if (activeMaterialCount > 0) {
      throw new BadRequestException(
        `该分类下存在 ${activeMaterialCount} 个启用中的物料，请先停用相关物料`,
      );
    }

    return this.repository.updateMaterialCategory(
      id,
      { status: "DISABLED" },
      updatedBy,
    );
  }

  // ─── Material (F2) ──────────────────────────────────────────────────────────

  async listMaterials(query: QueryMasterDataDto) {
    const limit = Math.min(query.limit ?? 50, 100);
    const offset = query.offset ?? 0;
    return this.repository.findMaterials({
      keyword: query.keyword,
      limit,
      offset,
      status: query.includeDisabled ? undefined : "ACTIVE",
    });
  }

  async getMaterialById(id: number) {
    const material = await this.repository.findMaterialById(id);
    if (!material) {
      throw new NotFoundException(`物料不存在: ${id}`);
    }
    return material;
  }

  async createMaterial(dto: CreateMaterialDto, createdBy?: string) {
    const existing = await this.repository.findMaterialByCode(dto.materialCode);
    if (existing) {
      throw new ConflictException(`物料编码已存在: ${dto.materialCode}`);
    }
    await this.assertCategoryIdIsActive(dto.categoryId);

    return this.repository.createMaterial(
      {
        materialCode: dto.materialCode,
        materialName: dto.materialName,
        specModel: dto.specModel,
        categoryId: dto.categoryId,
        unitCode: dto.unitCode,
        warningMinQty: dto.warningMinQty,
        warningMaxQty: dto.warningMaxQty,
      },
      createdBy,
    );
  }

  async updateMaterial(id: number, dto: UpdateMaterialDto, updatedBy?: string) {
    const existing = await this.repository.findMaterialById(id);
    if (!existing) {
      throw new NotFoundException(`物料不存在: ${id}`);
    }
    await this.assertCategoryIdIsActive(dto.categoryId);

    return this.repository.updateMaterial(
      id,
      {
        materialName: dto.materialName,
        specModel: dto.specModel,
        categoryId: dto.categoryId,
        unitCode: dto.unitCode,
        warningMinQty: dto.warningMinQty,
        warningMaxQty: dto.warningMaxQty,
      },
      updatedBy,
    );
  }

  async deactivateMaterial(id: number, updatedBy?: string) {
    const existing = await this.repository.findMaterialById(id);
    if (!existing) {
      throw new NotFoundException(`物料不存在: ${id}`);
    }
    if (existing.status === "DISABLED") {
      return existing;
    }

    const positiveBalanceRows =
      await this.repository.countPositiveInventoryBalanceRows(id);
    if (positiveBalanceRows > 0) {
      throw new BadRequestException(
        `该物料在 ${positiveBalanceRows} 个库存范围内有正余额，无法停用`,
      );
    }

    const effectiveDocCount =
      await this.repository.countEffectiveDocumentReferences(id);
    if (effectiveDocCount > 0) {
      throw new BadRequestException(
        `该物料存在 ${effectiveDocCount} 条生效中的单据引用，无法停用`,
      );
    }

    return this.repository.updateMaterial(
      id,
      { status: "DISABLED" },
      updatedBy,
    );
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
    const existing = await this.repository.findMaterialByCode(
      params.materialCode,
    );
    if (existing) {
      return existing;
    }

    if (!params.sourceDocumentType || !params.sourceDocumentId) {
      throw new BadRequestException(
        "自动补建物料必须提供来源单据类型和来源单据 ID",
      );
    }

    return this.repository.createAutoMaterial(
      {
        materialCode: params.materialCode,
        materialName: params.materialName,
        unitCode: params.unitCode,
        specModel: params.specModel,
        categoryId: params.categoryId,
        sourceDocumentType: params.sourceDocumentType,
        sourceDocumentId: params.sourceDocumentId,
      },
      createdBy,
    );
  }

  // ─── Customer (F3) ──────────────────────────────────────────────────────────

  async listCustomers(query: QueryMasterDataDto) {
    const limit = Math.min(query.limit ?? 50, 100);
    const offset = query.offset ?? 0;
    return this.repository.findCustomers({
      keyword: query.keyword,
      limit,
      offset,
      status: query.includeDisabled ? undefined : "ACTIVE",
    });
  }

  async getCustomerById(id: number) {
    const customer = await this.repository.findCustomerById(id);
    if (!customer) {
      throw new NotFoundException(`客户不存在: ${id}`);
    }
    return customer;
  }

  async createCustomer(dto: CreateCustomerDto, createdBy?: string) {
    const existing = await this.repository.findCustomerByCode(dto.customerCode);
    if (existing) {
      throw new ConflictException(`客户编码已存在: ${dto.customerCode}`);
    }

    try {
      return await this.repository.createCustomer(
        {
          customerCode: dto.customerCode,
          customerName: dto.customerName,
          parentId: dto.parentId,
        },
        createdBy,
      );
    } catch (error) {
      this.throwCodeConflict(error, "customer", dto.customerCode);
    }
  }

  async updateCustomer(id: number, dto: UpdateCustomerDto, updatedBy?: string) {
    const existing = await this.repository.findCustomerById(id);
    if (!existing) {
      throw new NotFoundException(`客户不存在: ${id}`);
    }

    if (dto.parentId !== undefined && dto.parentId !== null) {
      if (dto.parentId === id) {
        throw new BadRequestException("客户不能将自身设为父客户");
      }
      const hasCycle = await this.wouldCreateCustomerCycle(id, dto.parentId);
      if (hasCycle) {
        throw new BadRequestException(
          "不能将客户挂到其自身的子客户下，否则会形成循环",
        );
      }
    }

    return this.repository.updateCustomer(
      id,
      {
        customerName: dto.customerName,
        parentId: dto.parentId,
      },
      updatedBy,
    );
  }

  async deactivateCustomer(id: number, updatedBy?: string) {
    const existing = await this.repository.findCustomerById(id);
    if (!existing) {
      throw new NotFoundException(`客户不存在: ${id}`);
    }
    if (existing.status === "DISABLED") {
      return existing;
    }

    const activeChildCount =
      await this.repository.countActiveChildCustomers(id);
    if (activeChildCount > 0) {
      throw new BadRequestException(
        `该客户下存在 ${activeChildCount} 个启用中的子客户，请先停用子客户`,
      );
    }

    return this.repository.updateCustomer(
      id,
      { status: "DISABLED" },
      updatedBy,
    );
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
    const existing = await this.repository.findCustomerByCode(
      params.customerCode,
    );
    if (existing) {
      return existing;
    }

    if (!params.sourceDocumentType || !params.sourceDocumentId) {
      throw new BadRequestException(
        "自动补建客户必须提供来源单据类型和来源单据 ID",
      );
    }

    return this.repository.createAutoCustomer(
      {
        customerCode: params.customerCode,
        customerName: params.customerName,
        parentId: params.parentId,
        sourceDocumentType: params.sourceDocumentType,
        sourceDocumentId: params.sourceDocumentId,
      },
      createdBy,
    );
  }

  // ─── Supplier (F4) ──────────────────────────────────────────────────────────

  async getSupplierById(id: number) {
    const supplier = await this.repository.findSupplierById(id);
    if (!supplier) {
      throw new NotFoundException(`供应商不存在: ${id}`);
    }
    return supplier;
  }

  async createSupplier(dto: CreateSupplierDto, createdBy?: string) {
    const existing = await this.repository.findSupplierByCode(dto.supplierCode);
    if (existing) {
      throw new ConflictException(`供应商编码已存在: ${dto.supplierCode}`);
    }

    try {
      return await this.repository.createSupplier(
        {
          supplierCode: dto.supplierCode,
          supplierName: dto.supplierName,
        },
        createdBy,
      );
    } catch (error) {
      this.throwSupplierCodeConflict(error, dto.supplierCode);
    }
  }

  async updateSupplier(id: number, dto: UpdateSupplierDto, updatedBy?: string) {
    const existing = await this.repository.findSupplierById(id);
    if (!existing) {
      throw new NotFoundException(`供应商不存在: ${id}`);
    }

    if (dto.supplierCode && dto.supplierCode !== existing.supplierCode) {
      const duplicated = await this.repository.findSupplierByCode(
        dto.supplierCode,
      );
      if (duplicated) {
        throw new ConflictException(`供应商编码已存在: ${dto.supplierCode}`);
      }
    }

    try {
      return await this.repository.updateSupplier(
        id,
        {
          supplierCode: dto.supplierCode,
          supplierName: dto.supplierName,
        },
        updatedBy,
      );
    } catch (error) {
      this.throwSupplierCodeConflict(error, dto.supplierCode);
    }
  }

  async deactivateSupplier(id: number, updatedBy?: string) {
    const existing = await this.repository.findSupplierById(id);
    if (!existing) {
      throw new NotFoundException(`供应商不存在: ${id}`);
    }
    if (existing.status === "DISABLED") {
      return existing;
    }

    return this.repository.updateSupplier(
      id,
      {
        status: "DISABLED",
      },
      updatedBy,
    );
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
    const existing = await this.repository.findSupplierByCode(
      params.supplierCode,
    );
    if (existing) {
      return existing;
    }

    if (!params.sourceDocumentType || !params.sourceDocumentId) {
      throw new BadRequestException(
        "自动补建供应商必须提供来源单据类型和来源单据 ID",
      );
    }

    try {
      return await this.repository.createAutoSupplier(
        {
          supplierCode: params.supplierCode,
          supplierName: params.supplierName,
          sourceDocumentType: params.sourceDocumentType,
          sourceDocumentId: params.sourceDocumentId,
        },
        createdBy,
      );
    } catch (error) {
      this.throwSupplierCodeConflict(error, params.supplierCode);
    }
  }

  async listSuppliers(query: QueryMasterDataDto) {
    const limit = Math.min(query.limit ?? 50, 100);
    const offset = query.offset ?? 0;
    return this.repository.findSuppliers({
      keyword: query.keyword,
      limit,
      offset,
      status: query.includeDisabled ? undefined : "ACTIVE",
    });
  }

  // ─── Personnel (F5) ─────────────────────────────────────────────────────────

  async listPersonnel(query: QueryMasterDataDto) {
    const limit = Math.min(query.limit ?? 50, 100);
    const offset = query.offset ?? 0;
    return this.repository.findPersonnel({
      keyword: query.keyword,
      limit,
      offset,
      status: query.includeDisabled ? undefined : "ACTIVE",
    });
  }

  async getPersonnelById(id: number) {
    const personnel = await this.repository.findPersonnelById(id);
    if (!personnel) {
      throw new NotFoundException(`人员不存在: ${id}`);
    }
    return personnel;
  }

  async createPersonnel(dto: CreatePersonnelDto, createdBy?: string) {
    const existing = await this.repository.findPersonnelByCode(
      dto.personnelCode,
    );
    if (existing) {
      throw new ConflictException(`人员编码已存在: ${dto.personnelCode}`);
    }

    try {
      return await this.repository.createPersonnel(
        {
          personnelCode: dto.personnelCode,
          personnelName: dto.personnelName,
        },
        createdBy,
      );
    } catch (error) {
      this.throwCodeConflict(error, "personnel", dto.personnelCode);
    }
  }

  async updatePersonnel(
    id: number,
    dto: UpdatePersonnelDto,
    updatedBy?: string,
  ) {
    const existing = await this.repository.findPersonnelById(id);
    if (!existing) {
      throw new NotFoundException(`人员不存在: ${id}`);
    }

    return this.repository.updatePersonnel(
      id,
      { personnelName: dto.personnelName },
      updatedBy,
    );
  }

  async deactivatePersonnel(id: number, updatedBy?: string) {
    const existing = await this.repository.findPersonnelById(id);
    if (!existing) {
      throw new NotFoundException(`人员不存在: ${id}`);
    }
    if (existing.status === "DISABLED") {
      return existing;
    }

    return this.repository.updatePersonnel(
      id,
      { status: "DISABLED" },
      updatedBy,
    );
  }

  async ensurePersonnel(
    params: {
      personnelCode: string;
      personnelName: string;
      sourceDocumentType?: string;
      sourceDocumentId?: number;
    },
    createdBy?: string,
  ) {
    const existing = await this.repository.findPersonnelByCode(
      params.personnelCode,
    );
    if (existing) {
      return existing;
    }

    if (!params.sourceDocumentType || !params.sourceDocumentId) {
      throw new BadRequestException(
        "自动补建人员必须提供来源单据类型和来源单据 ID",
      );
    }

    return this.repository.createAutoPersonnel(
      {
        personnelCode: params.personnelCode,
        personnelName: params.personnelName,
        sourceDocumentType: params.sourceDocumentType,
        sourceDocumentId: params.sourceDocumentId,
      },
      createdBy,
    );
  }

  // ─── Workshop (F6) ──────────────────────────────────────────────────────────

  async listWorkshops(query: QueryMasterDataDto) {
    const limit = Math.min(query.limit ?? 50, 100);
    const offset = query.offset ?? 0;
    return this.repository.findWorkshops({
      keyword: query.keyword,
      limit,
      offset,
      status: query.includeDisabled ? undefined : "ACTIVE",
    });
  }

  async getWorkshopById(id: number) {
    const workshop = await this.repository.findWorkshopById(id);
    if (!workshop) {
      throw new NotFoundException(`车间不存在: ${id}`);
    }
    return workshop;
  }

  async getWorkshopByCode(workshopCode: string) {
    const workshop = await this.repository.findWorkshopByCode(workshopCode);
    if (!workshop) {
      throw new NotFoundException(`车间不存在: ${workshopCode}`);
    }
    if (workshop.status === "DISABLED") {
      throw new BadRequestException(
        `车间已停用，无法用于新单据: ${workshopCode}`,
      );
    }
    return workshop;
  }

  async getWorkshopByName(workshopName: string) {
    const workshop = await this.repository.findWorkshopByName(workshopName);
    if (!workshop) {
      throw new NotFoundException(`车间不存在: ${workshopName}`);
    }
    if (workshop.status === "DISABLED") {
      throw new BadRequestException(
        `车间已停用，无法用于新单据: ${workshopName}`,
      );
    }
    return workshop;
  }

  async createWorkshop(dto: CreateWorkshopDto, createdBy?: string) {
    const existing = await this.repository.findWorkshopByCode(dto.workshopCode);
    if (existing) {
      throw new ConflictException(`车间编码已存在: ${dto.workshopCode}`);
    }

    try {
      return await this.repository.createWorkshop(
        {
          workshopCode: dto.workshopCode,
          workshopName: dto.workshopName,
        },
        createdBy,
      );
    } catch (error) {
      this.throwCodeConflict(error, "workshop", dto.workshopCode);
    }
  }

  async updateWorkshop(id: number, dto: UpdateWorkshopDto, updatedBy?: string) {
    const existing = await this.repository.findWorkshopById(id);
    if (!existing) {
      throw new NotFoundException(`车间不存在: ${id}`);
    }

    return this.repository.updateWorkshop(
      id,
      {
        workshopName: dto.workshopName,
      },
      updatedBy,
    );
  }

  async deactivateWorkshop(id: number, updatedBy?: string) {
    const existing = await this.repository.findWorkshopById(id);
    if (!existing) {
      throw new NotFoundException(`车间不存在: ${id}`);
    }
    if (existing.status === "DISABLED") {
      return existing;
    }

    return this.repository.updateWorkshop(
      id,
      { status: "DISABLED" },
      updatedBy,
    );
  }

  // ─── StockScope (F7) ────────────────────────────────────────────────────────

  async listStockScopes(query: QueryMasterDataDto) {
    const limit = Math.min(query.limit ?? 50, 100);
    const offset = query.offset ?? 0;
    return this.repository.findStockScopes({
      keyword: query.keyword,
      limit,
      offset,
      status: query.includeDisabled ? undefined : "ACTIVE",
    });
  }

  async getStockScopeById(id: number) {
    const stockScope = await this.repository.findStockScopeById(id);
    if (!stockScope) {
      throw new NotFoundException(`库存范围不存在: ${id}`);
    }
    return stockScope;
  }

  async getStockScopeByCode(scopeCode: string) {
    const stockScope = await this.repository.findStockScopeByCode(scopeCode);
    if (!stockScope) {
      throw new NotFoundException(`库存范围不存在: ${scopeCode}`);
    }
    if (stockScope.status === "DISABLED") {
      throw new BadRequestException(
        `库存范围已停用，无法用于新单据: ${scopeCode}`,
      );
    }
    return stockScope;
  }

  async createStockScope(dto: CreateStockScopeDto, createdBy?: string) {
    const existing = await this.repository.findStockScopeByCode(dto.scopeCode);
    if (existing) {
      throw new ConflictException(`库存范围编码已存在: ${dto.scopeCode}`);
    }

    try {
      return await this.repository.createStockScope(
        {
          scopeCode: dto.scopeCode,
          scopeName: dto.scopeName,
        },
        createdBy,
      );
    } catch (error) {
      this.throwCodeConflict(error, "stockScope", dto.scopeCode);
    }
  }

  async updateStockScope(
    id: number,
    dto: UpdateStockScopeDto,
    updatedBy?: string,
  ) {
    const existing = await this.repository.findStockScopeById(id);
    if (!existing) {
      throw new NotFoundException(`库存范围不存在: ${id}`);
    }

    return this.repository.updateStockScope(
      id,
      { scopeName: dto.scopeName },
      updatedBy,
    );
  }

  async deactivateStockScope(id: number, updatedBy?: string) {
    const existing = await this.repository.findStockScopeById(id);
    if (!existing) {
      throw new NotFoundException(`库存范围不存在: ${id}`);
    }
    if (existing.status === "DISABLED") {
      return existing;
    }

    const positiveBalanceRows =
      await this.repository.countPositiveStockScopeBalanceRows(id);
    if (positiveBalanceRows > 0) {
      throw new BadRequestException(
        `该库存范围内有 ${positiveBalanceRows} 条正余额记录，停用前请先清空库存`,
      );
    }

    return this.repository.updateStockScope(
      id,
      { status: "DISABLED" },
      updatedBy,
    );
  }

  // ─── Private helpers ─────────────────────────────────────────────────────────

  private throwSupplierCodeConflict(
    error: unknown,
    supplierCode: string | undefined,
  ): never {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      throw new ConflictException(`供应商编码已存在: ${supplierCode ?? ""}`);
    }

    throw error;
  }

  private throwCodeConflict(
    error: unknown,
    entity: string,
    code: string | undefined,
  ): never {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      throw new ConflictException(`${entity} 编码已存在: ${code ?? ""}`);
    }

    throw error;
  }

  private async assertCategoryIdIsActive(categoryId?: number | null) {
    if (typeof categoryId === "undefined" || categoryId === null) {
      return;
    }

    const category = await this.repository.findMaterialCategoryById(categoryId);
    if (!category || category.status !== "ACTIVE") {
      throw new BadRequestException(`物料分类不存在或已停用: ${categoryId}`);
    }
  }

  private async wouldCreateMaterialCategoryCycle(
    nodeId: number,
    candidateParentId: number,
  ): Promise<boolean> {
    const visited = new Set<number>();
    let currentId: number | null | undefined = candidateParentId;
    while (currentId) {
      if (currentId === nodeId) return true;
      if (visited.has(currentId)) return false;
      visited.add(currentId);
      const record = await this.repository.findMaterialCategoryById(currentId);
      currentId = record?.parentId ?? null;
    }
    return false;
  }

  private async wouldCreateCustomerCycle(
    nodeId: number,
    candidateParentId: number,
  ): Promise<boolean> {
    const visited = new Set<number>();
    let currentId: number | null | undefined = candidateParentId;
    while (currentId) {
      if (currentId === nodeId) return true;
      if (visited.has(currentId)) return false;
      visited.add(currentId);
      const record = await this.repository.findCustomerById(currentId);
      currentId = record?.parentId ?? null;
    }
    return false;
  }
}
