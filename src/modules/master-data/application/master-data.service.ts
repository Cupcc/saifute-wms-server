import {
  ConflictException,
  Injectable,
  NotFoundException,
  type OnModuleInit,
} from "@nestjs/common";
import type { CreateMaterialDto } from "../dto/create-material.dto";
import type { QueryMasterDataDto } from "../dto/query-master-data.dto";
import type { UpdateMaterialDto } from "../dto/update-material.dto";
import { MasterDataRepository } from "../infrastructure/master-data.repository";

@Injectable()
export class MasterDataService implements OnModuleInit {
  constructor(private readonly repository: MasterDataRepository) {}

  async onModuleInit(): Promise<void> {
    await this.repository.ensureCanonicalWorkshops();
    await this.repository.ensureCanonicalStockScopes();
  }

  async listMaterials(query: QueryMasterDataDto) {
    const limit = Math.min(query.limit ?? 50, 100);
    const offset = query.offset ?? 0;
    return this.repository.findMaterials({
      keyword: query.keyword,
      limit,
      offset,
    });
  }

  async getMaterialById(id: number) {
    const material = await this.repository.findMaterialById(id);
    if (!material) {
      throw new NotFoundException(`物料不存在: ${id}`);
    }
    return material;
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
    return workshop;
  }

  async getWorkshopByName(workshopName: string) {
    const workshop = await this.repository.findWorkshopByName(workshopName);
    if (!workshop) {
      throw new NotFoundException(`车间不存在: ${workshopName}`);
    }
    return workshop;
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
    return stockScope;
  }

  async getSupplierById(id: number) {
    const supplier = await this.repository.findSupplierById(id);
    if (!supplier) {
      throw new NotFoundException(`供应商不存在: ${id}`);
    }
    return supplier;
  }

  async getCustomerById(id: number) {
    const customer = await this.repository.findCustomerById(id);
    if (!customer) {
      throw new NotFoundException(`客户不存在: ${id}`);
    }
    return customer;
  }

  async getPersonnelById(id: number) {
    const personnel = await this.repository.findPersonnelById(id);
    if (!personnel) {
      throw new NotFoundException(`人员不存在: ${id}`);
    }
    return personnel;
  }

  async createMaterial(dto: CreateMaterialDto, createdBy?: string) {
    const existing = await this.repository.findMaterialByCode(dto.materialCode);
    if (existing) {
      throw new ConflictException(`物料编码已存在: ${dto.materialCode}`);
    }

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

  async listCustomers(query: QueryMasterDataDto) {
    const limit = Math.min(query.limit ?? 50, 100);
    const offset = query.offset ?? 0;
    return this.repository.findCustomers({
      keyword: query.keyword,
      limit,
      offset,
    });
  }

  async listSuppliers(query: QueryMasterDataDto) {
    const limit = Math.min(query.limit ?? 50, 100);
    const offset = query.offset ?? 0;
    return this.repository.findSuppliers({
      keyword: query.keyword,
      limit,
      offset,
    });
  }

  async listPersonnel(query: QueryMasterDataDto) {
    const limit = Math.min(query.limit ?? 50, 100);
    const offset = query.offset ?? 0;
    return this.repository.findPersonnel({
      keyword: query.keyword,
      limit,
      offset,
    });
  }

  async listWorkshops(query: QueryMasterDataDto) {
    const limit = Math.min(query.limit ?? 50, 100);
    const offset = query.offset ?? 0;
    return this.repository.findWorkshops({
      keyword: query.keyword,
      limit,
      offset,
    });
  }
}
