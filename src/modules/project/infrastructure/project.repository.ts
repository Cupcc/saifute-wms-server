import { Injectable } from "@nestjs/common";
import {
  AllocationTargetType,
  DocumentFamily,
  type Prisma,
} from "../../../generated/prisma/client";
import { PrismaService } from "../../../shared/prisma/prisma.service";
import type { StockScopeCode } from "../../session/domain/user-session";

type DbClient = Prisma.TransactionClient | PrismaService;

@Injectable()
export class ProjectRepository {
  constructor(private readonly prisma: PrismaService) {}

  private db(db?: DbClient) {
    return db ?? this.prisma;
  }

  async findProjects(
    params: {
      projectCode?: string;
      projectName?: string;
      bizDateFrom?: Date;
      bizDateTo?: Date;
      customerId?: number;
      supplierId?: number;
      workshopId?: number;
      stockScope?: StockScopeCode;
      limit: number;
      offset: number;
    },
    db?: DbClient,
  ) {
    const where: Prisma.ProjectWhereInput = {
      lifecycleStatus: "EFFECTIVE",
    };
    if (params.projectCode) {
      where.projectCode = { contains: params.projectCode };
    }
    if (params.projectName) {
      where.projectName = { contains: params.projectName };
    }
    if (params.bizDateFrom || params.bizDateTo) {
      where.bizDate = {};
      if (params.bizDateFrom) {
        where.bizDate.gte = params.bizDateFrom;
      }
      if (params.bizDateTo) {
        where.bizDate.lte = params.bizDateTo;
      }
    }
    if (params.customerId) {
      where.customerId = params.customerId;
    }
    if (params.supplierId) {
      where.supplierId = params.supplierId;
    }
    if (params.workshopId) {
      where.workshopId = params.workshopId;
    }
    if (params.stockScope) {
      where.stockScope = {
        is: {
          scopeCode: params.stockScope,
        },
      };
    }

    const client = this.db(db);
    const [items, total] = await Promise.all([
      client.project.findMany({
        where,
        take: params.limit,
        skip: params.offset,
        orderBy: { bizDate: "desc" },
        include: {
          stockScope: true,
          materialLines: { orderBy: { lineNo: "asc" } },
        },
      }),
      client.project.count({ where }),
    ]);

    return { items, total };
  }

  async findProjectById(id: number, db?: DbClient) {
    return this.db(db).project.findUnique({
      where: { id },
      include: {
        stockScope: true,
        materialLines: { orderBy: { lineNo: "asc" } },
      },
    });
  }

  async findProjectByCode(projectCode: string, db?: DbClient) {
    return this.db(db).project.findUnique({
      where: { projectCode },
      include: { stockScope: true, materialLines: true },
    });
  }

  async createProject(
    data: Prisma.ProjectUncheckedCreateInput,
    lines: Omit<Prisma.ProjectMaterialLineUncheckedCreateInput, "projectId">[],
    db?: DbClient,
  ) {
    const client = this.db(db);
    const project = await client.project.create({
      data,
    });
    const linesWithProjectId = lines.map((l) => ({
      ...l,
      projectId: project.id,
    }));
    await client.projectMaterialLine.createMany({ data: linesWithProjectId });
    const result = await client.project.findUnique({
      where: { id: project.id },
      include: {
        stockScope: true,
        materialLines: { orderBy: { lineNo: "asc" } },
      },
    });
    if (!result) throw new Error("Project creation failed");
    return result;
  }

  async findAllocationTargetBySource(
    params: {
      targetType: AllocationTargetType;
      sourceDocumentType: string;
      sourceDocumentId: number;
    },
    db?: DbClient,
  ) {
    return this.db(db).allocationTarget.findFirst({
      where: {
        targetType: params.targetType,
        sourceDocumentType: params.sourceDocumentType,
        sourceDocumentId: params.sourceDocumentId,
      },
    });
  }

  async createAllocationTarget(
    data: Prisma.AllocationTargetUncheckedCreateInput,
    db?: DbClient,
  ) {
    return this.db(db).allocationTarget.create({ data });
  }

  async updateAllocationTarget(
    id: number,
    data: Prisma.AllocationTargetUncheckedUpdateInput,
    db?: DbClient,
  ) {
    return this.db(db).allocationTarget.update({
      where: { id },
      data,
    });
  }

  async attachAllocationTargetToProject(
    projectId: number,
    allocationTargetId: number,
    updatedBy?: string,
    db?: DbClient,
  ) {
    return this.db(db).project.update({
      where: { id: projectId },
      data: {
        allocationTargetId,
        updatedBy,
      },
    });
  }

  async updateProject(
    id: number,
    data: Prisma.ProjectUncheckedUpdateInput,
    db?: DbClient,
  ) {
    return this.db(db).project.update({
      where: { id },
      data,
      include: {
        stockScope: true,
        materialLines: { orderBy: { lineNo: "asc" } },
      },
    });
  }

  async createProjectLine(
    data: Prisma.ProjectMaterialLineUncheckedCreateInput,
    db?: DbClient,
  ) {
    return this.db(db).projectMaterialLine.create({
      data,
    });
  }

  async updateProjectLine(
    id: number,
    data: Prisma.ProjectMaterialLineUncheckedUpdateInput,
    db?: DbClient,
  ) {
    return this.db(db).projectMaterialLine.update({
      where: { id },
      data,
    });
  }

  async deleteProjectLine(id: number, db?: DbClient) {
    return this.db(db).projectMaterialLine.delete({
      where: { id },
    });
  }

  async hasActiveDownstreamDependencies(projectId: number, db?: DbClient) {
    const client = this.db(db);
    const documentCount = await client.documentRelation.count({
      where: {
        upstreamFamily: DocumentFamily.PROJECT,
        upstreamDocumentId: projectId,
        isActive: true,
      },
    });
    return documentCount > 0;
  }
}
