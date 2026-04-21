import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma } from "../../../../generated/prisma/client";
import type { CreateStockScopeDto } from "../dto/create-stock-scope.dto";
import type { QueryMasterDataDto } from "../dto/query-master-data.dto";
import type { UpdateStockScopeDto } from "../dto/update-stock-scope.dto";
import { MasterDataRepository } from "../infrastructure/master-data.repository";

@Injectable()
export class StockScopeService {
  constructor(private readonly repository: MasterDataRepository) {}

  async list(query: QueryMasterDataDto) {
    const limit = Math.min(query.limit ?? 50, 100);
    const offset = query.offset ?? 0;
    return this.repository.findStockScopes({
      keyword: query.keyword,
      limit,
      offset,
      status: query.includeDisabled ? undefined : "ACTIVE",
    });
  }

  async getById(id: number) {
    const stockScope = await this.repository.findStockScopeById(id);
    if (!stockScope) {
      throw new NotFoundException(`库存范围不存在: ${id}`);
    }
    return stockScope;
  }

  async getByCode(scopeCode: string) {
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

  async create(dto: CreateStockScopeDto, createdBy?: string) {
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
      this.throwCodeConflict(error, dto.scopeCode);
    }
  }

  async update(id: number, dto: UpdateStockScopeDto, updatedBy?: string) {
    await this.getById(id);

    return this.repository.updateStockScope(
      id,
      { scopeName: dto.scopeName },
      updatedBy,
    );
  }

  async deactivate(id: number, updatedBy?: string) {
    const existing = await this.getById(id);
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

  private throwCodeConflict(
    error: unknown,
    scopeCode: string | undefined,
  ): never {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      throw new ConflictException(`库存范围编码已存在: ${scopeCode ?? ""}`);
    }

    throw error;
  }
}
