import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type { CreateMaterialDto } from "../dto/create-material.dto";
import type { QueryMasterDataDto } from "../dto/query-master-data.dto";
import type { UpdateMaterialDto } from "../dto/update-material.dto";
import { MasterDataRepository } from "../infrastructure/master-data.repository";

@Injectable()
export class MaterialService {
  constructor(private readonly repository: MasterDataRepository) {}

  async list(query: QueryMasterDataDto) {
    const limit = Math.min(query.limit ?? 50, 100);
    const offset = query.offset ?? 0;
    return this.repository.findMaterials({
      keyword: query.keyword,
      limit,
      offset,
      status: query.includeDisabled ? undefined : "ACTIVE",
    });
  }

  async getById(id: number) {
    const material = await this.repository.findMaterialById(id);
    if (!material) {
      throw new NotFoundException(`物料不存在: ${id}`);
    }
    return material;
  }

  async create(dto: CreateMaterialDto, createdBy?: string) {
    const existing = await this.repository.findMaterialByCode(dto.materialCode);
    if (existing) {
      throw new ConflictException(`物料编码已存在: ${dto.materialCode}`);
    }
    const categoryId = await this.resolveCategoryId(dto.categoryId);

    return this.repository.createMaterial(
      {
        materialCode: dto.materialCode,
        materialName: dto.materialName,
        specModel: dto.specModel,
        categoryId,
        unitCode: dto.unitCode,
        warningMinQty: dto.warningMinQty,
        warningMaxQty: dto.warningMaxQty,
      },
      createdBy,
    );
  }

  async update(id: number, dto: UpdateMaterialDto, updatedBy?: string) {
    await this.getById(id);
    const categoryId = await this.resolveCategoryIdForUpdate(dto);

    return this.repository.updateMaterial(
      id,
      {
        materialName: dto.materialName,
        specModel: dto.specModel,
        categoryId,
        unitCode: dto.unitCode,
        warningMinQty: dto.warningMinQty,
        warningMaxQty: dto.warningMaxQty,
      },
      updatedBy,
    );
  }

  async deactivate(id: number, updatedBy?: string) {
    const existing = await this.getById(id);
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

  async ensure(
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
    const categoryId = await this.resolveCategoryId(params.categoryId);

    return this.repository.createAutoMaterial(
      {
        materialCode: params.materialCode,
        materialName: params.materialName,
        unitCode: params.unitCode,
        specModel: params.specModel,
        categoryId,
        sourceDocumentType: params.sourceDocumentType,
        sourceDocumentId: params.sourceDocumentId,
      },
      createdBy,
    );
  }

  private async resolveCategoryId(categoryId?: number | null) {
    if (typeof categoryId === "number") {
      await this.assertCategoryIdIsActive(categoryId);
      return categoryId;
    }

    const defaultCategory =
      await this.repository.ensureDefaultMaterialCategory();
    return defaultCategory.id;
  }

  private async resolveCategoryIdForUpdate(dto: UpdateMaterialDto) {
    if (!Object.hasOwn(dto, "categoryId")) {
      return undefined;
    }

    return this.resolveCategoryId(dto.categoryId);
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
}
