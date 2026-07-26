import { Injectable } from "@nestjs/common";
import {
  DocumentFamily,
  Prisma,
  ProjectTargetType,
  RdProjectMaterialActionType,
} from "../../../../generated/prisma/client";
import { BusinessDocumentType } from "../../../shared/domain/business-document-type";
import { PrismaService } from "../../../shared/prisma/prisma.service";
import type { StockScopeCode } from "../../session/domain/user-session";

type DbClient = Prisma.TransactionClient | PrismaService;

const RD_PROJECT_ACTION_DOCUMENT_TYPE =
  BusinessDocumentType.RdProjectMaterialAction;

@Injectable()
export class RdProjectRepository {
  constructor(private readonly prisma: PrismaService) {}

  private db(db?: DbClient) {
    return db ?? this.prisma;
  }

  runInTransaction<T>(handler: (db: Prisma.TransactionClient) => Promise<T>) {
    return this.prisma.runInTransaction(handler);
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
    const where: Prisma.RdProjectWhereInput = {
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
      client.rdProject.findMany({
        where,
        take: params.limit,
        skip: params.offset,
        orderBy: [{ bizDate: "desc" }, { id: "desc" }],
        include: {
          stockScope: true,
          bomLines: { orderBy: { lineNo: "asc" } },
        },
      }),
      client.rdProject.count({ where }),
    ]);

    return { items, total };
  }

  async findProjectById(id: number, db?: DbClient) {
    return this.db(db).rdProject.findUnique({
      where: { id },
      include: {
        stockScope: true,
        bomLines: { orderBy: { lineNo: "asc" } },
        materialLines: { orderBy: { lineNo: "asc" } },
        materialActions: {
          orderBy: [{ bizDate: "desc" }, { id: "desc" }],
          include: {
            stockScope: true,
            lines: { orderBy: { lineNo: "asc" } },
          },
        },
      },
    });
  }

  async findProjectByCode(projectCode: string, db?: DbClient) {
    return this.db(db).rdProject.findUnique({
      where: { projectCode },
      include: {
        stockScope: true,
        bomLines: { orderBy: { lineNo: "asc" } },
      },
    });
  }

  async createProject(
    data: Prisma.RdProjectUncheckedCreateInput,
    bomLines: Omit<Prisma.RdProjectBomLineUncheckedCreateInput, "projectId">[],
    db?: DbClient,
  ) {
    const client = this.db(db);
    const project = await client.rdProject.create({ data });
    if (bomLines.length > 0) {
      await client.rdProjectBomLine.createMany({
        data: bomLines.map((line) => ({
          ...line,
          projectId: project.id,
        })),
      });
    }

    const result = await this.findProjectById(project.id, client);
    if (!result) {
      throw new Error("Project creation failed");
    }
    return result;
  }

  async updateProject(
    id: number,
    data: Prisma.RdProjectUncheckedUpdateInput,
    db?: DbClient,
  ) {
    return this.db(db).rdProject.update({
      where: { id },
      data,
      include: {
        stockScope: true,
        bomLines: { orderBy: { lineNo: "asc" } },
        materialLines: { orderBy: { lineNo: "asc" } },
        materialActions: {
          orderBy: [{ bizDate: "desc" }, { id: "desc" }],
          include: {
            stockScope: true,
            lines: { orderBy: { lineNo: "asc" } },
          },
        },
      },
    });
  }

  async replaceProjectBomLines(
    projectId: number,
    lines: Omit<Prisma.RdProjectBomLineUncheckedCreateInput, "projectId">[],
    db?: DbClient,
  ) {
    const client = this.db(db);
    await client.rdProjectBomLine.deleteMany({
      where: { projectId },
    });
    if (lines.length > 0) {
      await client.rdProjectBomLine.createMany({
        data: lines.map((line) => ({
          ...line,
          projectId,
        })),
      });
    }
    return client.rdProjectBomLine.findMany({
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
    return this.db(db).rdProject.update({
      where: { id: projectId },
      data: {
        projectTargetId,
        updatedBy,
      },
    });
  }

  async findMaterialActionsByProjectId(
    params: {
      projectId: number;
      materialId?: number;
      actionType?: RdProjectMaterialActionType;
      limit?: number;
      offset?: number;
    },
    db?: DbClient,
  ) {
    const where: Prisma.RdProjectMaterialActionWhereInput = {
      projectId: params.projectId,
    };
    if (params.materialId) {
      where.lines = { some: { materialId: params.materialId } };
    }
    if (params.actionType) {
      where.actionType = params.actionType;
    }

    const client = this.db(db);
    const [items, total] = await Promise.all([
      client.rdProjectMaterialAction.findMany({
        where,
        ...(params.limit !== undefined ? { take: params.limit } : {}),
        ...(params.offset !== undefined ? { skip: params.offset } : {}),
        orderBy: [{ bizDate: "desc" }, { id: "desc" }],
        include: {
          stockScope: true,
          lines: { orderBy: { lineNo: "asc" } },
        },
      }),
      client.rdProjectMaterialAction.count({ where }),
    ]);

    return { items, total };
  }

  async findMaterialActionById(id: number, db?: DbClient) {
    return this.db(db).rdProjectMaterialAction.findUnique({
      where: { id },
      include: {
        rdProject: {
          include: {
            stockScope: true,
          },
        },
        stockScope: true,
        lines: { orderBy: { lineNo: "asc" } },
      },
    });
  }

  async findMaterialActionByClientRequestId(
    clientRequestId: string,
    db?: DbClient,
  ) {
    return this.db(db).rdProjectMaterialAction.findFirst({
      where: { clientRequestId, lifecycleStatus: "EFFECTIVE" },
      include: {
        rdProject: {
          include: {
            stockScope: true,
          },
        },
        stockScope: true,
        lines: { orderBy: { lineNo: "asc" } },
      },
    });
  }

  async findMaterialActionDocumentNosByPrefix(prefix: string, db?: DbClient) {
    const rows = await this.db(db).rdProjectMaterialAction.findMany({
      where: { documentNo: { startsWith: prefix } },
      select: { documentNo: true },
    });
    return rows.map((row) => row.documentNo);
  }

  async createMaterialAction(
    data: Prisma.RdProjectMaterialActionUncheckedCreateInput,
    lines: Omit<
      Prisma.RdProjectMaterialActionLineUncheckedCreateInput,
      "actionId"
    >[],
    db?: DbClient,
  ) {
    const client = this.db(db);
    const action = await client.rdProjectMaterialAction.create({ data });
    await client.rdProjectMaterialActionLine.createMany({
      data: lines.map((line) => ({
        ...line,
        actionId: action.id,
      })),
    });
    const result = await this.findMaterialActionById(action.id, client);
    if (!result) {
      throw new Error("RD project material action creation failed");
    }
    return result;
  }

  async updateMaterialAction(
    id: number,
    data: Prisma.RdProjectMaterialActionUncheckedUpdateInput,
    db?: DbClient,
  ) {
    return this.db(db).rdProjectMaterialAction.update({
      where: { id },
      data,
      include: {
        rdProject: {
          include: {
            stockScope: true,
          },
        },
        stockScope: true,
        lines: { orderBy: { lineNo: "asc" } },
      },
    });
  }

  async updateMaterialActionLineCost(
    id: number,
    data: {
      costUnitPrice: Prisma.Decimal;
      costAmount: Prisma.Decimal;
    },
    db?: DbClient,
  ) {
    return this.db(db).rdProjectMaterialActionLine.update({
      where: { id },
      data,
    });
  }

  async hasActiveReturnDownstream(actionId: number, db?: DbClient) {
    const count = await this.db(db).rdProjectMaterialActionLine.count({
      where: {
        sourceDocumentType: RD_PROJECT_ACTION_DOCUMENT_TYPE,
        sourceDocumentId: actionId,
        action: {
          lifecycleStatus: "EFFECTIVE",
          actionType: RdProjectMaterialActionType.RETURN,
        },
      },
    });
    return count > 0;
  }

  async sumActiveReturnedQtyBySourceLine(
    actionId: number,
    db?: DbClient,
  ): Promise<Map<number, Prisma.Decimal>> {
    const rows = await this.db(db).rdProjectMaterialActionLine.findMany({
      where: {
        sourceDocumentType: RD_PROJECT_ACTION_DOCUMENT_TYPE,
        sourceDocumentId: actionId,
        action: {
          lifecycleStatus: "EFFECTIVE",
          actionType: RdProjectMaterialActionType.RETURN,
        },
      },
      select: {
        sourceDocumentLineId: true,
        quantity: true,
      },
    });

    const totals = new Map<number, Prisma.Decimal>();
    for (const row of rows) {
      if (row.sourceDocumentLineId == null) {
        continue;
      }
      const current =
        totals.get(row.sourceDocumentLineId) ?? new Prisma.Decimal(0);
      totals.set(
        row.sourceDocumentLineId,
        current.add(new Prisma.Decimal(row.quantity)),
      );
    }
    return totals;
  }

  async sumActiveReturnedQtyForSourceActions(
    actionIds: number[],
    db?: DbClient,
  ): Promise<Map<number, Prisma.Decimal>> {
    if (actionIds.length === 0) {
      return new Map();
    }
    const rows = await this.db(db).rdProjectMaterialActionLine.groupBy({
      by: ["sourceDocumentLineId"],
      where: {
        sourceDocumentType: RD_PROJECT_ACTION_DOCUMENT_TYPE,
        sourceDocumentId: { in: actionIds },
        sourceDocumentLineId: { not: null },
        action: {
          lifecycleStatus: "EFFECTIVE",
          actionType: RdProjectMaterialActionType.RETURN,
        },
      },
      _sum: { quantity: true },
    });

    const totals = new Map<number, Prisma.Decimal>();
    for (const row of rows) {
      if (row.sourceDocumentLineId == null) {
        continue;
      }
      totals.set(
        row.sourceDocumentLineId,
        new Prisma.Decimal(row._sum.quantity ?? 0),
      );
    }
    return totals;
  }

  async sumEffectiveHandoffInByMaterial(
    rdProjectId: number,
    db?: DbClient,
  ): Promise<
    Map<
      number,
      {
        handoffInQty: Prisma.Decimal;
        handoffInCostAmount: Prisma.Decimal;
        materialCodeSnapshot: string;
        materialNameSnapshot: string;
        materialSpecSnapshot: string | null;
        unitCodeSnapshot: string;
      }
    >
  > {
    const rows = await this.db(db).rdHandoffOrderLine.findMany({
      where: {
        rdProjectId,
        order: { lifecycleStatus: "EFFECTIVE" },
      },
      select: {
        materialId: true,
        quantity: true,
        costAmount: true,
        materialCodeSnapshot: true,
        materialNameSnapshot: true,
        materialSpecSnapshot: true,
        unitCodeSnapshot: true,
      },
    });

    const totals = new Map<
      number,
      {
        handoffInQty: Prisma.Decimal;
        handoffInCostAmount: Prisma.Decimal;
        materialCodeSnapshot: string;
        materialNameSnapshot: string;
        materialSpecSnapshot: string | null;
        unitCodeSnapshot: string;
      }
    >();
    for (const row of rows) {
      const current = totals.get(row.materialId) ?? {
        handoffInQty: new Prisma.Decimal(0),
        handoffInCostAmount: new Prisma.Decimal(0),
        materialCodeSnapshot: row.materialCodeSnapshot,
        materialNameSnapshot: row.materialNameSnapshot,
        materialSpecSnapshot: row.materialSpecSnapshot,
        unitCodeSnapshot: row.unitCodeSnapshot,
      };
      current.handoffInQty = current.handoffInQty.add(
        new Prisma.Decimal(row.quantity),
      );
      current.handoffInCostAmount = current.handoffInCostAmount.add(
        new Prisma.Decimal(row.costAmount ?? 0),
      );
      totals.set(row.materialId, current);
    }
    return totals;
  }

  async hasActiveDownstreamDependencies(projectId: number, db?: DbClient) {
    const count = await this.db(db).documentRelation.count({
      where: {
        upstreamFamily: DocumentFamily.RD_PROJECT,
        upstreamDocumentId: projectId,
        isActive: true,
      },
    });
    return count > 0;
  }

  async hasEffectiveMaterialActions(projectId: number, db?: DbClient) {
    const count = await this.db(db).rdProjectMaterialAction.count({
      where: {
        projectId,
        lifecycleStatus: "EFFECTIVE",
      },
    });
    return count > 0;
  }

  async appendProjectChangeLog(
    data: Prisma.RdProjectChangeLogUncheckedCreateInput,
    db?: DbClient,
  ) {
    return this.db(db).rdProjectChangeLog.create({ data });
  }

  async findProjectChangeLogs(projectId: number, db?: DbClient) {
    // ponytail: 固定取最近 200 条，需要翻页时再加 limit/offset
    return this.db(db).rdProjectChangeLog.findMany({
      where: { projectId },
      orderBy: [{ changedAt: "desc" }, { id: "desc" }],
      take: 200,
    });
  }
}
