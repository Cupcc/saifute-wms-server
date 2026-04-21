import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma } from "../../../../generated/prisma/client";
import type { CreateSupplierDto } from "../dto/create-supplier.dto";
import type { QueryMasterDataDto } from "../dto/query-master-data.dto";
import type { UpdateSupplierDto } from "../dto/update-supplier.dto";
import { MasterDataRepository } from "../infrastructure/master-data.repository";

@Injectable()
export class SupplierService {
  constructor(private readonly repository: MasterDataRepository) {}

  async list(query: QueryMasterDataDto) {
    const limit = Math.min(query.limit ?? 50, 100);
    const offset = query.offset ?? 0;
    return this.repository.findSuppliers({
      keyword: query.keyword,
      limit,
      offset,
      status: query.includeDisabled ? undefined : "ACTIVE",
    });
  }

  async getById(id: number) {
    const supplier = await this.repository.findSupplierById(id);
    if (!supplier) {
      throw new NotFoundException(`供应商不存在: ${id}`);
    }
    return supplier;
  }

  async create(dto: CreateSupplierDto, createdBy?: string) {
    const existing = await this.repository.findSupplierByCode(dto.supplierCode);
    if (existing) {
      throw new ConflictException(`供应商编码已存在: ${dto.supplierCode}`);
    }

    try {
      return await this.repository.createSupplier(
        {
          supplierCode: dto.supplierCode,
          supplierName: dto.supplierName,
          contactPerson: this.normalizeOptionalText(dto.contactPerson),
          contactPhone: this.normalizeOptionalText(dto.contactPhone),
          address: this.normalizeOptionalText(dto.address),
        },
        createdBy,
      );
    } catch (error) {
      this.throwCodeConflict(error, dto.supplierCode);
    }
  }

  async update(id: number, dto: UpdateSupplierDto, updatedBy?: string) {
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

    const payload: Prisma.SupplierUncheckedUpdateInput = {
      supplierCode: dto.supplierCode,
      supplierName: dto.supplierName,
    };

    if (Object.hasOwn(dto, "contactPerson")) {
      payload.contactPerson = this.normalizeOptionalText(dto.contactPerson);
    }
    if (Object.hasOwn(dto, "contactPhone")) {
      payload.contactPhone = this.normalizeOptionalText(dto.contactPhone);
    }
    if (Object.hasOwn(dto, "address")) {
      payload.address = this.normalizeOptionalText(dto.address);
    }

    try {
      return await this.repository.updateSupplier(id, payload, updatedBy);
    } catch (error) {
      this.throwCodeConflict(error, dto.supplierCode);
    }
  }

  async deactivate(id: number, updatedBy?: string) {
    const existing = await this.repository.findSupplierById(id);
    if (!existing) {
      throw new NotFoundException(`供应商不存在: ${id}`);
    }
    if (existing.status === "DISABLED") {
      return existing;
    }

    return this.repository.updateSupplier(
      id,
      { status: "DISABLED" },
      updatedBy,
    );
  }

  async ensure(
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
      this.throwCodeConflict(error, params.supplierCode);
    }
  }

  private throwCodeConflict(
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

  private normalizeOptionalText(value?: string | null): string | null {
    if (typeof value !== "string") {
      return null;
    }

    const normalized = value.trim();
    return normalized.length > 0 ? normalized : null;
  }
}
