import { Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "../../../../generated/prisma/client";
import type { CreatePersonnelDto } from "../dto/create-personnel.dto";
import type { QueryMasterDataDto } from "../dto/query-master-data.dto";
import type { UpdatePersonnelDto } from "../dto/update-personnel.dto";
import { MasterDataRepository } from "../infrastructure/master-data.repository";

@Injectable()
export class PersonnelService {
  constructor(private readonly repository: MasterDataRepository) {}

  async list(query: QueryMasterDataDto) {
    const limit = Math.min(query.limit ?? 50, 100);
    const offset = query.offset ?? 0;
    return this.repository.findPersonnel({
      keyword: query.keyword,
      limit,
      offset,
      status: query.includeDisabled ? undefined : "ACTIVE",
    });
  }

  async getById(id: number) {
    const personnel = await this.repository.findPersonnelById(id);
    if (!personnel) {
      throw new NotFoundException(`人员不存在: ${id}`);
    }
    return personnel;
  }

  async create(dto: CreatePersonnelDto, createdBy?: string) {
    return this.repository.createPersonnel(
      {
        personnelName: dto.personnelName,
        contactPhone: this.normalizeOptionalText(dto.contactPhone),
      },
      createdBy,
    );
  }

  async update(id: number, dto: UpdatePersonnelDto, updatedBy?: string) {
    await this.getById(id);

    const payload: Prisma.PersonnelUncheckedUpdateInput = {
      personnelName: dto.personnelName,
    };
    if (Object.hasOwn(dto, "contactPhone")) {
      payload.contactPhone = this.normalizeOptionalText(dto.contactPhone);
    }

    return this.repository.updatePersonnel(id, payload, updatedBy);
  }

  async deactivate(id: number, updatedBy?: string) {
    const existing = await this.getById(id);
    if (existing.status === "DISABLED") {
      return existing;
    }

    return this.repository.updatePersonnel(
      id,
      { status: "DISABLED" },
      updatedBy,
    );
  }

  private normalizeOptionalText(value?: string | null): string | null {
    if (typeof value !== "string") {
      return null;
    }

    const normalized = value.trim();
    return normalized.length > 0 ? normalized : null;
  }
}
