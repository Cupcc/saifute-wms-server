import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma } from "../../../../generated/prisma/client";
import type { CreateCustomerDto } from "../dto/create-customer.dto";
import type { QueryMasterDataDto } from "../dto/query-master-data.dto";
import type { UpdateCustomerDto } from "../dto/update-customer.dto";
import { MasterDataRepository } from "../infrastructure/master-data.repository";

@Injectable()
export class CustomerService {
  constructor(private readonly repository: MasterDataRepository) {}

  async list(query: QueryMasterDataDto) {
    const limit = Math.min(query.limit ?? 50, 100);
    const offset = query.offset ?? 0;
    return this.repository.findCustomers({
      keyword: query.keyword,
      limit,
      offset,
      status: query.includeDisabled ? undefined : "ACTIVE",
    });
  }

  async getById(id: number) {
    const customer = await this.repository.findCustomerById(id);
    if (!customer) {
      throw new NotFoundException(`客户不存在: ${id}`);
    }
    return customer;
  }

  async create(dto: CreateCustomerDto, createdBy?: string) {
    const existing = await this.repository.findCustomerByCode(dto.customerCode);
    if (existing) {
      throw new ConflictException(`客户编码已存在: ${dto.customerCode}`);
    }

    try {
      return await this.repository.createCustomer(
        {
          customerCode: dto.customerCode,
          customerName: dto.customerName,
          contactPerson: this.normalizeOptionalText(dto.contactPerson),
          contactPhone: this.normalizeOptionalText(dto.contactPhone),
          address: this.normalizeOptionalText(dto.address),
          parentId: dto.parentId,
        },
        createdBy,
      );
    } catch (error) {
      this.throwCodeConflict(error, dto.customerCode);
    }
  }

  async update(id: number, dto: UpdateCustomerDto, updatedBy?: string) {
    const existing = await this.repository.findCustomerById(id);
    if (!existing) {
      throw new NotFoundException(`客户不存在: ${id}`);
    }

    if (dto.parentId !== undefined && dto.parentId !== null) {
      if (dto.parentId === id) {
        throw new BadRequestException("客户不能将自身设为父客户");
      }
      const hasCycle = await this.wouldCreateCycle(id, dto.parentId);
      if (hasCycle) {
        throw new BadRequestException(
          "不能将客户挂到其自身的子客户下，否则会形成循环",
        );
      }
    }

    const payload: Prisma.CustomerUncheckedUpdateInput = {
      customerName: dto.customerName,
      parentId: dto.parentId,
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

    return this.repository.updateCustomer(id, payload, updatedBy);
  }

  async deactivate(id: number, updatedBy?: string) {
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

  async ensure(
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

  private throwCodeConflict(error: unknown, code: string | undefined): never {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      throw new ConflictException(`客户编码已存在: ${code ?? ""}`);
    }

    throw error;
  }

  private async wouldCreateCycle(
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

  private normalizeOptionalText(value?: string | null): string | null {
    if (typeof value !== "string") {
      return null;
    }

    const normalized = value.trim();
    return normalized.length > 0 ? normalized : null;
  }
}
