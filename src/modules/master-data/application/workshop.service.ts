import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma } from "../../../../generated/prisma/client";
import type { CreateWorkshopDto } from "../dto/create-workshop.dto";
import type { QueryMasterDataDto } from "../dto/query-master-data.dto";
import type { UpdateWorkshopDto } from "../dto/update-workshop.dto";
import { MasterDataRepository } from "../infrastructure/master-data.repository";

@Injectable()
export class WorkshopService {
  constructor(private readonly repository: MasterDataRepository) {}

  async list(query: QueryMasterDataDto) {
    const limit = Math.min(query.limit ?? 50, 100);
    const offset = query.offset ?? 0;
    return this.repository.findWorkshops({
      keyword: query.keyword,
      limit,
      offset,
      status: query.includeDisabled ? undefined : "ACTIVE",
    });
  }

  async getById(id: number) {
    const workshop = await this.repository.findWorkshopById(id);
    if (!workshop) {
      throw new NotFoundException(`车间不存在: ${id}`);
    }
    return workshop;
  }

  async getByName(workshopName: string) {
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

  async create(dto: CreateWorkshopDto, createdBy?: string) {
    const existing = await this.repository.findWorkshopByName(dto.workshopName);
    if (existing) {
      throw new ConflictException(`车间名称已存在: ${dto.workshopName}`);
    }

    if (dto.defaultHandlerPersonnelId) {
      await this.requirePersonnel(dto.defaultHandlerPersonnelId);
    }

    return this.repository.createWorkshop(
      {
        workshopName: dto.workshopName,
        defaultHandlerPersonnelId: dto.defaultHandlerPersonnelId ?? null,
      },
      createdBy,
    );
  }

  async update(id: number, dto: UpdateWorkshopDto, updatedBy?: string) {
    const existing = await this.getById(id);

    if (
      dto.workshopName &&
      dto.workshopName !== existing.workshopName &&
      (await this.repository.findWorkshopByName(dto.workshopName))
    ) {
      throw new ConflictException(`车间名称已存在: ${dto.workshopName}`);
    }

    if (dto.defaultHandlerPersonnelId) {
      await this.requirePersonnel(dto.defaultHandlerPersonnelId);
    }

    const payload: Prisma.WorkshopUncheckedUpdateInput = {
      workshopName: dto.workshopName,
    };
    if (Object.hasOwn(dto, "defaultHandlerPersonnelId")) {
      payload.defaultHandlerPersonnelId = dto.defaultHandlerPersonnelId ?? null;
    }

    return this.repository.updateWorkshop(id, payload, updatedBy);
  }

  async deactivate(id: number, updatedBy?: string) {
    const existing = await this.getById(id);
    if (existing.status === "DISABLED") {
      return existing;
    }

    return this.repository.updateWorkshop(
      id,
      { status: "DISABLED" },
      updatedBy,
    );
  }

  private async requirePersonnel(id: number) {
    const personnel = await this.repository.findPersonnelById(id);
    if (!personnel) {
      throw new NotFoundException(`人员不存在: ${id}`);
    }
    return personnel;
  }
}
