import { Injectable } from "@nestjs/common";
import { Prisma } from "../../../../generated/prisma/client";
import { PrismaService } from "../../../shared/prisma/prisma.service";

type DbClient = Prisma.TransactionClient | PrismaService;

@Injectable()
export class RdProcurementRequestRepository {
  constructor(private readonly prisma: PrismaService) {}

  runInTransaction<T>(handler: (tx: Prisma.TransactionClient) => Promise<T>) {
    return this.prisma.runInTransaction(handler);
  }

  get client(): Prisma.TransactionClient {
    return this.prisma;
  }

  private db(db?: DbClient) {
    return db ?? this.prisma;
  }

  async findRequests(
    params: {
      keyword?: string;
      documentNo?: string;
      bizDateFrom?: Date;
      bizDateTo?: Date;
      projectCode?: string;
      projectCodeExact?: string;
      projectName?: string;
      supplierId?: number;
      handlerName?: string;
      materialId?: number;
      materialName?: string;
      workshopId?: number;
      limit: number;
      offset: number;
    },
    db?: DbClient,
  ) {
    const where: Prisma.RdProcurementRequestWhereInput = {
      lifecycleStatus: "EFFECTIVE",
    };
    if (params.keyword) {
      where.OR = [
        { documentNo: { contains: params.keyword } },
        { projectCode: { contains: params.keyword } },
        { projectName: { contains: params.keyword } },
        {
          lines: {
            some: {
              materialNameSnapshot: { contains: params.keyword },
            },
          },
        },
      ];
    }
    if (params.documentNo) {
      where.documentNo = { contains: params.documentNo };
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
    if (params.projectCodeExact) {
      where.projectCode = params.projectCodeExact;
    } else if (params.projectCode) {
      where.projectCode = { contains: params.projectCode };
    }
    if (params.projectName) {
      where.projectName = { contains: params.projectName };
    }
    if (params.supplierId) {
      where.supplierId = params.supplierId;
    }
    if (params.handlerName) {
      where.handlerNameSnapshot = { contains: params.handlerName };
    }
    if (params.materialId || params.materialName) {
      where.lines = {
        some: {
          ...(params.materialId ? { materialId: params.materialId } : {}),
          ...(params.materialName
            ? {
                materialNameSnapshot: {
                  contains: params.materialName,
                },
              }
            : {}),
        },
      };
    }
    if (params.workshopId) {
      where.workshopId = params.workshopId;
    }

    const client = this.db(db);
    const [items, total] = await Promise.all([
      client.rdProcurementRequest.findMany({
        where,
        take: params.limit,
        skip: params.offset,
        orderBy: [{ bizDate: "desc" }, { id: "desc" }],
        include: {
          lines: {
            orderBy: { lineNo: "asc" },
            include: { material: true, statusLedger: true },
          },
        },
      }),
      client.rdProcurementRequest.count({ where }),
    ]);

    return { items, total };
  }

  async findRequestById(id: number, db?: DbClient) {
    return this.db(db).rdProcurementRequest.findUnique({
      where: { id },
      include: {
        lines: {
          orderBy: { lineNo: "asc" },
          include: {
            material: true,
            statusLedger: true,
            statusHistories: {
              orderBy: [{ createdAt: "desc" }, { id: "desc" }],
            },
          },
        },
      },
    });
  }

  async findRequestByDocumentNo(documentNo: string, db?: DbClient) {
    return this.db(db).rdProcurementRequest.findUnique({
      where: { documentNo },
      include: {
        lines: {
          orderBy: { lineNo: "asc" },
          include: { material: true, statusLedger: true },
        },
      },
    });
  }

  async findRequestByClientRequestId(clientRequestId: string, db?: DbClient) {
    return this.db(db).rdProcurementRequest.findFirst({
      where: { clientRequestId, lifecycleStatus: "EFFECTIVE" },
      include: {
        lines: {
          orderBy: { lineNo: "asc" },
          include: { material: true, statusLedger: true },
        },
      },
    });
  }

  async findEffectiveProjectProcurementProjection(
    params: { projectCode: string; workshopId: number },
    db?: DbClient,
  ) {
    return this.db(db).rdProcurementRequest.findMany({
      where: {
        lifecycleStatus: "EFFECTIVE",
        projectCode: params.projectCode,
        workshopId: params.workshopId,
      },
      orderBy: [{ bizDate: "asc" }, { id: "asc" }],
      select: {
        id: true,
        documentNo: true,
        projectCode: true,
        lines: {
          orderBy: { lineNo: "asc" },
          select: {
            id: true,
            lineNo: true,
            materialId: true,
            materialCodeSnapshot: true,
            materialNameSnapshot: true,
            materialSpecSnapshot: true,
            unitCodeSnapshot: true,
            materialBindingSource: true,
            materialBoundAt: true,
            materialBoundBy: true,
            statusLedger: true,
          },
        },
      },
    });
  }

  async findDocumentNosByPrefix(prefix: string, db?: DbClient) {
    const rows = await this.db(db).rdProcurementRequest.findMany({
      where: { documentNo: { startsWith: prefix } },
      select: { documentNo: true },
    });
    return rows.map((row) => row.documentNo);
  }

  async createRequest(
    data: Prisma.RdProcurementRequestUncheckedCreateInput,
    lines: Omit<
      Prisma.RdProcurementRequestLineUncheckedCreateInput,
      "requestId"
    >[],
    db?: DbClient,
  ) {
    const client = this.db(db);
    const request = await client.rdProcurementRequest.create({ data });
    await client.rdProcurementRequestLine.createMany({
      data: lines.map((line) => ({ ...line, requestId: request.id })),
    });
    const result = await client.rdProcurementRequest.findUnique({
      where: { id: request.id },
      include: {
        lines: {
          orderBy: { lineNo: "asc" },
          include: { material: true, statusLedger: true },
        },
      },
    });
    if (!result) {
      throw new Error("RD procurement request creation failed");
    }
    return result;
  }

  async findStatusHistoryById(id: number, db?: DbClient) {
    return this.db(db).rdMaterialStatusHistory.findUnique({
      where: { id },
      include: {
        requestLine: {
          select: { id: true, requestId: true, materialId: true },
        },
      },
    });
  }

  async lockRequestLineForUpdate(
    requestId: number,
    lineId: number,
    tx: Prisma.TransactionClient,
  ) {
    const lockedRows = await tx.$queryRaw<Array<{ id: number }>>(Prisma.sql`
      SELECT id
      FROM rd_procurement_request_line
      WHERE id = ${lineId}
        AND request_id = ${requestId}
      FOR UPDATE
    `);
    if (!lockedRows[0]) {
      return null;
    }
    return tx.rdProcurementRequestLine.findUnique({
      where: { id: lineId },
      include: {
        material: true,
        request: { select: { lifecycleStatus: true } },
        statusLedger: true,
      },
    });
  }

  async findRequestLineById(id: number, db?: DbClient) {
    return this.db(db).rdProcurementRequestLine.findUnique({
      where: { id },
      include: { material: true, statusLedger: true },
    });
  }

  async bindMaterialIfUnbound(
    params: {
      requestId: number;
      lineId: number;
      materialId: number;
      materialBoundAt: Date;
      materialBoundBy?: string;
    },
    tx: Prisma.TransactionClient,
  ) {
    return tx.rdProcurementRequestLine.updateMany({
      where: {
        id: params.lineId,
        requestId: params.requestId,
        materialId: null,
      },
      data: {
        materialId: params.materialId,
        materialBindingSource: "ACCEPTANCE_CONFIRMED",
        materialBoundAt: params.materialBoundAt,
        materialBoundBy: params.materialBoundBy ?? null,
        updatedBy: params.materialBoundBy,
      },
    });
  }

  async linkStatusHistoriesToInventoryLog(
    historyIds: number[],
    inventoryLogId: number,
    db?: DbClient,
  ) {
    return this.db(db).rdMaterialStatusHistory.updateMany({
      where: { id: { in: historyIds } },
      data: { relatedInventoryLogId: inventoryLogId },
    });
  }

  async updateRequest(
    id: number,
    data: Prisma.RdProcurementRequestUncheckedUpdateInput,
    db?: DbClient,
  ) {
    return this.db(db).rdProcurementRequest.update({
      where: { id },
      data,
      include: {
        lines: {
          orderBy: { lineNo: "asc" },
          include: { material: true, statusLedger: true },
        },
      },
    });
  }
}
