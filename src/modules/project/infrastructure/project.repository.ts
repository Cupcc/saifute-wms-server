import { Injectable } from "@nestjs/common";
import { DocumentFamily, type Prisma } from "../../../generated/prisma/client";
import { PrismaService } from "../../../shared/prisma/prisma.service";

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

    const client = this.db(db);
    const [items, total] = await Promise.all([
      client.project.findMany({
        where,
        take: params.limit,
        skip: params.offset,
        orderBy: { bizDate: "desc" },
        include: { materialLines: { orderBy: { lineNo: "asc" } } },
      }),
      client.project.count({ where }),
    ]);

    return { items, total };
  }

  async findProjectById(id: number, db?: DbClient) {
    return this.db(db).project.findUnique({
      where: { id },
      include: { materialLines: { orderBy: { lineNo: "asc" } } },
    });
  }

  async findProjectByCode(projectCode: string, db?: DbClient) {
    return this.db(db).project.findUnique({
      where: { projectCode },
      include: { materialLines: true },
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
      include: { materialLines: { orderBy: { lineNo: "asc" } } },
    });
    if (!result) throw new Error("Project creation failed");
    return result;
  }

  async updateProject(
    id: number,
    data: Prisma.ProjectUncheckedUpdateInput,
    db?: DbClient,
  ) {
    return this.db(db).project.update({
      where: { id },
      data,
      include: { materialLines: { orderBy: { lineNo: "asc" } } },
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
