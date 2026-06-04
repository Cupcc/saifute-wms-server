import { Injectable } from "@nestjs/common";
import {
  DocumentLifecycleStatus,
  Prisma,
  ProjectTargetType,
  SalesStockOrderType,
  StockInOrderType,
} from "../../../../generated/prisma/client";
import { SALES_PROJECT_CODE_PREFIX } from "../../../shared/common/project-code.util";
import { PrismaService } from "../../../shared/prisma/prisma.service";

type DbClient = Prisma.TransactionClient | PrismaService;
type MaxSequenceRow = { maxSequence: bigint | number | string | null };

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

  async findMaxSalesProjectCodeSequence(db?: DbClient) {
    const prefix = `${SALES_PROJECT_CODE_PREFIX}-`;
    const pattern = `^${prefix}[0-9]+$`;
    const sequenceStart = prefix.length + 1;
    const rows = await this.db(db).$queryRaw<MaxSequenceRow[]>`
      SELECT COALESCE(MAX(sequence_no), 0) AS maxSequence
      FROM (
        SELECT CAST(SUBSTRING(sales_project_code, ${sequenceStart}) AS UNSIGNED) AS sequence_no
        FROM sales_project
        WHERE sales_project_code REGEXP ${pattern}
        UNION ALL
        SELECT CAST(SUBSTRING(target_code, ${sequenceStart}) AS UNSIGNED) AS sequence_no
        FROM project_target
        WHERE target_code REGEXP ${pattern}
      ) AS project_codes
    `;

    return Number(rows[0]?.maxSequence ?? 0);
  }

  async findProjectsByIds(projectIds: number[], db?: DbClient) {
    return this.db(db).salesProject.findMany({
      where: { id: { in: projectIds } },
      include: {
        stockScope: true,
      },
    });
  }

  async findMaterialSnapshotsByIds(materialIds: number[], db?: DbClient) {
    const distinctIds = [...new Set(materialIds.filter(Boolean))];
    if (distinctIds.length === 0) {
      return [];
    }

    return this.db(db).material.findMany({
      where: { id: { in: distinctIds } },
      select: {
        id: true,
        materialCode: true,
        materialName: true,
        specModel: true,
        unitCode: true,
      },
    });
  }

  async findEffectiveAcceptanceLineLinksByProjectId(
    projectId: number,
    materialIds: number[],
    db?: DbClient,
  ) {
    const distinctIds = [...new Set(materialIds.filter(Boolean))];
    if (distinctIds.length === 0) {
      return [];
    }

    return this.db(db).stockInOrderLine.findMany({
      where: {
        materialId: { in: distinctIds },
        order: {
          salesProjectId: projectId,
          orderType: StockInOrderType.ACCEPTANCE,
          lifecycleStatus: DocumentLifecycleStatus.EFFECTIVE,
        },
      },
      select: {
        id: true,
        lineNo: true,
        materialId: true,
        unitPrice: true,
        quantity: true,
        order: {
          select: {
            id: true,
            documentNo: true,
            bizDate: true,
            orderType: true,
          },
        },
      },
      orderBy: [
        { order: { bizDate: "desc" } },
        { order: { id: "desc" } },
        { lineNo: "asc" },
      ],
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
