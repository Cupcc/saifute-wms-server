import { Injectable } from "@nestjs/common";
import {
  DocumentLifecycleStatus,
  Prisma,
  ProjectTargetType,
  SalesStockOrderType,
} from "../../../../generated/prisma/client";
import { PrismaService } from "../../../shared/prisma/prisma.service";

type DbClient = Prisma.TransactionClient | PrismaService;

@Injectable()
export class SalesProjectRepository {
  constructor(private readonly prisma: PrismaService) {}

  runInTransaction<T>(handler: (tx: Prisma.TransactionClient) => Promise<T>) {
    return this.prisma.runInTransaction(handler);
  }

  private db(db?: DbClient) {
    return db ?? this.prisma;
  }

  async findProjects(
    params: {
      salesProjectCode?: string;
      salesProjectName?: string;
      bizDateFrom?: Date;
      bizDateTo?: Date;
      customerId?: number;
      workshopId?: number;
      limit: number;
      offset: number;
    },
    db?: DbClient,
  ) {
    const where: Prisma.SalesProjectWhereInput = {
      lifecycleStatus: DocumentLifecycleStatus.EFFECTIVE,
    };
    if (params.salesProjectCode) {
      where.salesProjectCode = { contains: params.salesProjectCode };
    }
    if (params.salesProjectName) {
      where.salesProjectName = { contains: params.salesProjectName };
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
    if (params.workshopId) {
      where.workshopId = params.workshopId;
    }

    const client = this.db(db);
    const [items, total] = await Promise.all([
      client.salesProject.findMany({
        where,
        take: params.limit,
        skip: params.offset,
        orderBy: [{ bizDate: "desc" }, { id: "desc" }],
        include: {
          stockScope: true,
          materialLines: { orderBy: { lineNo: "asc" } },
        },
      }),
      client.salesProject.count({ where }),
    ]);

    return { items, total };
  }

  async findProjectById(id: number, db?: DbClient) {
    return this.db(db).salesProject.findUnique({
      where: { id },
      include: {
        stockScope: true,
        materialLines: { orderBy: { lineNo: "asc" } },
      },
    });
  }

  async findProjectByCode(salesProjectCode: string, db?: DbClient) {
    return this.db(db).salesProject.findUnique({
      where: { salesProjectCode },
      include: {
        stockScope: true,
        materialLines: { orderBy: { lineNo: "asc" } },
      },
    });
  }

  async findProjectsByIds(projectIds: number[], db?: DbClient) {
    return this.db(db).salesProject.findMany({
      where: { id: { in: projectIds } },
      include: {
        stockScope: true,
      },
    });
  }

  async createProject(
    data: Prisma.SalesProjectUncheckedCreateInput,
    materialLines: Omit<
      Prisma.SalesProjectMaterialLineUncheckedCreateInput,
      "projectId"
    >[],
    db?: DbClient,
  ) {
    const client = this.db(db);
    const project = await client.salesProject.create({ data });
    if (materialLines.length > 0) {
      await client.salesProjectMaterialLine.createMany({
        data: materialLines.map((line) => ({
          ...line,
          projectId: project.id,
        })),
      });
    }

    const result = await this.findProjectById(project.id, client);
    if (!result) {
      throw new Error("Sales project creation failed");
    }
    return result;
  }

  async updateProject(
    id: number,
    data: Prisma.SalesProjectUncheckedUpdateInput,
    db?: DbClient,
  ) {
    return this.db(db).salesProject.update({
      where: { id },
      data,
      include: {
        stockScope: true,
        materialLines: { orderBy: { lineNo: "asc" } },
      },
    });
  }

  async replaceProjectMaterialLines(
    projectId: number,
    lines: Omit<
      Prisma.SalesProjectMaterialLineUncheckedCreateInput,
      "projectId"
    >[],
    db?: DbClient,
  ) {
    const client = this.db(db);
    await client.salesProjectMaterialLine.deleteMany({
      where: { projectId },
    });
    if (lines.length > 0) {
      await client.salesProjectMaterialLine.createMany({
        data: lines.map((line) => ({
          ...line,
          projectId,
        })),
      });
    }
    return client.salesProjectMaterialLine.findMany({
      where: { projectId },
      orderBy: { lineNo: "asc" },
    });
  }

  async findProjectTargetBySource(
    params: {
      targetType: ProjectTargetType;
      sourceDocumentType: string;
      sourceDocumentId: number;
    },
    db?: DbClient,
  ) {
    return this.db(db).projectTarget.findFirst({
      where: {
        targetType: params.targetType,
        sourceDocumentType: params.sourceDocumentType,
        sourceDocumentId: params.sourceDocumentId,
      },
    });
  }

  async createProjectTarget(
    data: Prisma.ProjectTargetUncheckedCreateInput,
    db?: DbClient,
  ) {
    return this.db(db).projectTarget.create({ data });
  }

  async updateProjectTarget(
    id: number,
    data: Prisma.ProjectTargetUncheckedUpdateInput,
    db?: DbClient,
  ) {
    return this.db(db).projectTarget.update({
      where: { id },
      data,
    });
  }

  async attachProjectTargetToProject(
    projectId: number,
    projectTargetId: number,
    updatedBy?: string,
    db?: DbClient,
  ) {
    return this.db(db).salesProject.update({
      where: { id: projectId },
      data: {
        projectTargetId,
        updatedBy,
      },
    });
  }

  async findEffectiveShipmentLinesByProjectId(
    projectId: number,
    db?: DbClient,
  ) {
    return this.db(db).salesStockOrderLine.findMany({
      where: {
        salesProjectId: projectId,
        order: {
          lifecycleStatus: DocumentLifecycleStatus.EFFECTIVE,
          orderType: {
            in: [
              SalesStockOrderType.OUTBOUND,
              SalesStockOrderType.SALES_RETURN,
            ],
          },
        },
      },
      include: {
        order: {
          select: {
            id: true,
            documentNo: true,
            bizDate: true,
            orderType: true,
          },
        },
      },
      orderBy: [{ order: { bizDate: "asc" } }, { lineNo: "asc" }],
    });
  }
}
