import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
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
      workshopId: query.workshopId,
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
    const personnelName = this.normalizeRequiredText(
      dto.personnelName,
      "姓名不能为空",
    );
    const contactPhone = this.normalizeOptionalText(dto.contactPhone);
    const workshopId = dto.workshopId ?? null;

    if (workshopId) {
      await this.requireWorkshop(workshopId);
    }
    await this.requireUniqueActiveIdentity({
      personnelName,
      contactPhone,
      workshopId,
    });

    return this.repository.createPersonnel(
      {
        personnelName,
        contactPhone,
        workshopId,
      },
      createdBy,
    );
  }

  async update(id: number, dto: UpdatePersonnelDto, updatedBy?: string) {
    const existing = await this.getById(id);

    const payload: Prisma.PersonnelUncheckedUpdateInput = {};
    const personnelName = Object.hasOwn(dto, "personnelName")
      ? this.normalizeRequiredText(dto.personnelName, "姓名不能为空")
      : existing.personnelName;
    if (Object.hasOwn(dto, "contactPhone")) {
      payload.contactPhone = this.normalizeOptionalText(dto.contactPhone);
    }
    const contactPhone = Object.hasOwn(dto, "contactPhone")
      ? (payload.contactPhone as string | null)
      : (existing.contactPhone ?? null);
    if (Object.hasOwn(dto, "workshopId")) {
      if (dto.workshopId) {
        await this.requireWorkshop(dto.workshopId);
      }
      payload.workshopId = dto.workshopId ?? null;
    }
    const workshopId = Object.hasOwn(dto, "workshopId")
      ? (payload.workshopId as number | null)
      : (existing.workshopId ?? null);

    await this.requireUniqueActiveIdentity({
      personnelName,
      contactPhone,
      workshopId,
      excludeId: id,
    });

    if (Object.hasOwn(dto, "personnelName")) {
      payload.personnelName = personnelName;
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

  private normalizeRequiredText(value: string | undefined, message: string) {
    if (typeof value !== "string") {
      throw new BadRequestException(message);
    }

    const normalized = value.trim();
    if (normalized.length === 0) {
      throw new BadRequestException(message);
    }

    return normalized;
  }

  private normalizeOptionalText(value?: string | null): string | null {
    if (typeof value !== "string") {
      return null;
    }

    const normalized = value.trim();
    return normalized.length > 0 ? normalized : null;
  }

  private async requireWorkshop(id: number) {
    const workshop = await this.repository.findWorkshopById(id);
    if (!workshop) {
      throw new NotFoundException(`车间不存在: ${id}`);
    }
    return workshop;
  }

  private async requireUniqueActiveIdentity(params: {
    contactPhone: string | null;
    excludeId?: number;
    personnelName: string;
    workshopId: number | null;
  }) {
    const existing =
      await this.repository.findActivePersonnelByIdentity(params);
    if (existing) {
      throw new ConflictException(`人员已存在: ${params.personnelName}`);
    }
  }
}
