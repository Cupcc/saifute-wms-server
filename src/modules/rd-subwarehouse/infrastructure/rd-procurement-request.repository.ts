import { Injectable } from "@nestjs/common";
import type { Prisma } from "../../../../generated/prisma/client";
import { PrismaService } from "../../../shared/prisma/prisma.service";

type DbClient = Prisma.TransactionClient | PrismaService;

@Injectable()
export class RdProcurementRequestRepository {
  constructor(private readonly prisma: PrismaService) {}

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
    if (params.projectCode) {
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
            include: { statusLedger: true },
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
          include: { statusLedger: true },
        },
      },
    });
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
          include: { statusLedger: true },
        },
      },
    });
    if (!result) {
      throw new Error("RD procurement request creation failed");
    }
    return result;
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
          include: { statusLedger: true },
        },
      },
    });
  }
}
