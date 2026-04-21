import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type { CreateMaterialCategoryDto } from "../dto/create-material-category.dto";
import type { QueryMasterDataDto } from "../dto/query-master-data.dto";
import type { UpdateMaterialCategoryDto } from "../dto/update-material-category.dto";
import {
  DEFAULT_MATERIAL_CATEGORY_CODE,
  DEFAULT_MATERIAL_CATEGORY_NAME,
  MasterDataRepository,
} from "../infrastructure/master-data.repository";

@Injectable()
export class MaterialCategoryService {
  constructor(private readonly repository: MasterDataRepository) {}

  async list(query: QueryMasterDataDto) {
    const limit = Math.min(query.limit ?? 50, 100);
    const offset = query.offset ?? 0;
    return this.repository.findMaterialCategories({
      keyword: query.keyword,
      limit,
      offset,
      status: query.includeDisabled ? undefined : "ACTIVE",
    });
  }

  async getById(id: number) {
    const category = await this.repository.findMaterialCategoryById(id);
    if (!category) {
      throw new NotFoundException(`物料分类不存在: ${id}`);
    }
    return category;
  }

  async create(dto: CreateMaterialCategoryDto, createdBy?: string) {
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
        sortOrder: dto.sortOrder ?? 0,
      },
      createdBy,
    );
  }

  async update(id: number, dto: UpdateMaterialCategoryDto, updatedBy?: string) {
    const existing = await this.getById(id);
    if (existing.categoryCode === DEFAULT_MATERIAL_CATEGORY_CODE) {
      if (
        dto.categoryName !== undefined &&
        dto.categoryName !== DEFAULT_MATERIAL_CATEGORY_NAME
      ) {
        throw new BadRequestException("系统默认分类“未分类”不允许修改名称");
      }
    }

    return this.repository.updateMaterialCategory(
      id,
      {
        categoryName: dto.categoryName,
        sortOrder: dto.sortOrder,
      },
      updatedBy,
    );
  }

  async deactivate(id: number, updatedBy?: string) {
    const existing = await this.getById(id);
    if (existing.categoryCode === DEFAULT_MATERIAL_CATEGORY_CODE) {
      throw new BadRequestException("系统默认分类“未分类”不能停用");
    }
    if (existing.status === "DISABLED") {
      return existing;
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
}
