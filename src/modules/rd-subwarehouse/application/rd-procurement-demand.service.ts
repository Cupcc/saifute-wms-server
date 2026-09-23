import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma } from "../../../../generated/prisma/client";
import { RdProjectLookupService } from "../../rd-project/application/rd-project-lookup.service";
import type { SessionUserSnapshot } from "../../session/domain/user-session";
import type { CreateRdProcurementDemandDto } from "../dto/create-rd-procurement-demand.dto";
import type { QueryRdProcurementDemandDto } from "../dto/query-rd-procurement-demand.dto";
import type { UpdateRdProcurementDemandDto } from "../dto/update-rd-procurement-demand.dto";
import { RdProcurementDemandRepository } from "../infrastructure/rd-procurement-demand.repository";

export const RD_PROCUREMENT_DEMAND_MANAGE_PERMISSION =
  "rd:procurement-demand:manage";

function toDate(value: string) {
  return new Date(`${value}T00:00:00.000Z`);
}

@Injectable()
export class RdProcurementDemandService {
  constructor(
    private readonly repository: RdProcurementDemandRepository,
    private readonly rdProjectLookupService: RdProjectLookupService,
  ) {}

  async list(query: QueryRdProcurementDemandDto) {
    const limit = Math.min(query.limit ?? 50, 100);
    const offset = query.offset ?? 0;
    return this.repository.findPage({
      keyword: query.keyword,
      needDateFrom: query.needDateFrom ? toDate(query.needDateFrom) : undefined,
      needDateTo: query.needDateTo ? toDate(query.needDateTo) : undefined,
      rdProjectId: query.rdProjectId,
      projectCode: query.projectCode,
      applicantUserId: query.applicantUserId,
      limit,
      offset,
    });
  }

  async get(id: number) {
    const demand = await this.repository.findById(id);
    if (!demand || demand.deletedAt) {
      throw new NotFoundException(`研发采购需求不存在: ${id}`);
    }
    return demand;
  }

  async create(dto: CreateRdProcurementDemandDto, user: SessionUserSnapshot) {
    const existing = dto.clientRequestId
      ? await this.repository.findByClientRequestId(dto.clientRequestId)
      : [];
    if (existing.length > 0) return existing;

    const needDate = toDate(dto.needDate);
    try {
      return await this.repository.runInTransaction(async (tx) => {
        const created = [];
        for (const [index, line] of dto.lines.entries()) {
          const project =
            await this.rdProjectLookupService.requireEffectiveProjectById(
              line.rdProjectId,
              tx,
            );
          if (!Number.isFinite(line.quantity) || line.quantity <= 0) {
            throw new BadRequestException(`第${index + 1}行数量必须为正数`);
          }
          created.push(
            await this.repository.create(
              {
                applicantUserId: user.userId,
                applicantUsername: user.username,
                applicantName: user.displayName,
                departmentId: user.department?.departmentId ?? null,
                departmentName: user.department?.departmentName ?? null,
                needDate,
                rdProjectId: project.id,
                projectCodeSnapshot: project.projectCode,
                projectNameSnapshot: project.projectName,
                materialName: line.materialName,
                specification: line.specification,
                unit: line.unit,
                quantity: new Prisma.Decimal(line.quantity),
                supplierText: line.supplierText ?? null,
                purchaseUrl: line.purchaseUrl ?? null,
                noteText: line.noteText ?? null,
                imageMetadata: line.imageMetadata ?? Prisma.JsonNull,
                lineNo: index + 1,
                clientRequestId: dto.clientRequestId ?? null,
                createdBy: user.username,
                updatedBy: user.username,
              },
              tx,
            ),
          );
        }
        return created;
      });
    } catch (error) {
      if (dto.clientRequestId && isUniqueConstraintError(error)) {
        const retry = await this.repository.findByClientRequestId(
          dto.clientRequestId,
        );
        if (retry.length > 0) return retry;
      }
      throw error;
    }
  }

  async update(
    id: number,
    dto: UpdateRdProcurementDemandDto,
    user: SessionUserSnapshot,
  ) {
    const existing = await this.get(id);
    this.assertCanMutate(existing.applicantUserId, user);
    const data: Prisma.RdProcurementDemandUncheckedUpdateInput = {
      ...(dto.materialName !== undefined && { materialName: dto.materialName }),
      ...(dto.specification !== undefined && {
        specification: dto.specification,
      }),
      ...(dto.unit !== undefined && { unit: dto.unit }),
      ...(dto.quantity !== undefined && {
        quantity: new Prisma.Decimal(dto.quantity),
      }),
      ...(dto.supplierText !== undefined && { supplierText: dto.supplierText }),
      ...(dto.purchaseUrl !== undefined && { purchaseUrl: dto.purchaseUrl }),
      ...(dto.noteText !== undefined && { noteText: dto.noteText }),
      ...(dto.imageMetadata !== undefined && {
        imageMetadata: dto.imageMetadata as Prisma.InputJsonValue,
      }),
      updatedBy: user.username,
    };
    if (
      dto.rdProjectId !== undefined &&
      dto.rdProjectId !== existing.rdProjectId
    ) {
      const project =
        await this.rdProjectLookupService.requireEffectiveProjectById(
          dto.rdProjectId,
        );
      Object.assign(data, {
        rdProjectId: project.id,
        projectCodeSnapshot: project.projectCode,
        projectNameSnapshot: project.projectName,
      });
    }
    return this.repository.update(id, data);
  }

  async remove(id: number, user: SessionUserSnapshot) {
    const existing = await this.get(id);
    this.assertCanMutate(existing.applicantUserId, user);
    return this.repository.update(id, {
      deletedAt: new Date(),
      deletedBy: user.username,
      updatedBy: user.username,
    });
  }

  private assertCanMutate(applicantUserId: number, user: SessionUserSnapshot) {
    if (
      applicantUserId !== user.userId &&
      !user.permissions.includes(RD_PROCUREMENT_DEMAND_MANAGE_PERMISSION) &&
      !user.permissions.includes("*:*:*")
    ) {
      throw new ForbiddenException("只能维护本人填报的研发采购需求");
    }
  }
}

function isUniqueConstraintError(
  error: unknown,
): error is Prisma.PrismaClientKnownRequestError {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  );
}
