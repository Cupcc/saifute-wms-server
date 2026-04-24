import { Injectable } from "@nestjs/common";
import { Prisma } from "../../../../generated/prisma/client";
import { PrismaService } from "../../../shared/prisma/prisma.service";

type DbClient = Prisma.TransactionClient | PrismaService;

@Injectable()
export class StockInPriceCorrectionRepository {
  constructor(private readonly prisma: PrismaService) {}

  runInTransaction<T>(handler: (tx: Prisma.TransactionClient) => Promise<T>) {
    return this.prisma.runInTransaction(handler);
  }

  private db(db?: DbClient) {
    return db ?? this.prisma;
  }

  async findOrders(
    params: {
      documentNo?: string;
      bizDateFrom?: Date;
      bizDateTo?: Date;
      materialId?: number;
      sourceInventoryLogId?: number;
      stockScopeId?: number;
      workshopId?: number;
      limit: number;
      offset: number;
    },
    db?: DbClient,
  ) {
    const where: Prisma.StockInPriceCorrectionOrderWhereInput = {
      lifecycleStatus: "EFFECTIVE",
    };

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
    if (params.stockScopeId) {
      where.stockScopeId = params.stockScopeId;
    }
    if (params.workshopId) {
      where.workshopId = params.workshopId;
    }
    if (params.materialId || params.sourceInventoryLogId) {
      where.lines = {
        some: {
          ...(params.materialId ? { materialId: params.materialId } : {}),
          ...(params.sourceInventoryLogId
            ? { sourceInventoryLogId: params.sourceInventoryLogId }
            : {}),
        },
      };
    }

    const client = this.db(db);
    const include = {
      lines: {
        orderBy: { lineNo: "asc" as const },
        include: {
          material: true,
          sourceInventoryLog: true,
          generatedOutLog: true,
          generatedInLog: true,
          sourceStockInOrder: true,
          sourceStockInOrderLine: true,
        },
      },
    };

    const [items, total] = await Promise.all([
      client.stockInPriceCorrectionOrder.findMany({
        where,
        take: params.limit,
        skip: params.offset,
        orderBy: { bizDate: "desc" },
        include,
      }),
      client.stockInPriceCorrectionOrder.count({ where }),
    ]);

    return { items, total };
  }

  async findOrderById(id: number, db?: DbClient) {
    return this.db(db).stockInPriceCorrectionOrder.findUnique({
      where: { id },
      include: {
        lines: {
          orderBy: { lineNo: "asc" },
          include: {
            material: true,
            sourceInventoryLog: true,
            generatedOutLog: true,
            generatedInLog: true,
            sourceStockInOrder: true,
            sourceStockInOrderLine: true,
          },
        },
      },
    });
  }

  async findOrderByDocumentNo(documentNo: string, db?: DbClient) {
    return this.db(db).stockInPriceCorrectionOrder.findUnique({
      where: { documentNo },
      include: {
        lines: {
          orderBy: { lineNo: "asc" },
        },
      },
    });
  }

  async findLineBySourceInventoryLogId(
    sourceInventoryLogId: number,
    db?: DbClient,
  ) {
    return this.db(db).stockInPriceCorrectionOrderLine.findUnique({
      where: { sourceInventoryLogId },
      include: {
        order: true,
      },
    });
  }

  async findLineByGeneratedInLogId(generatedInLogId: number, db?: DbClient) {
    return this.db(db).stockInPriceCorrectionOrderLine.findUnique({
      where: { generatedInLogId },
      include: {
        order: true,
        sourceStockInOrder: true,
        sourceStockInOrderLine: true,
      },
    });
  }

  async createOrder(
    data: Prisma.StockInPriceCorrectionOrderUncheckedCreateInput,
    db?: DbClient,
  ) {
    return this.db(db).stockInPriceCorrectionOrder.create({ data });
  }

  async createOrderLine(
    data: Prisma.StockInPriceCorrectionOrderLineUncheckedCreateInput,
    db?: DbClient,
  ) {
    return this.db(db).stockInPriceCorrectionOrderLine.create({ data });
  }

  async updateOrder(
    id: number,
    data: Prisma.StockInPriceCorrectionOrderUncheckedUpdateInput,
    db?: DbClient,
  ) {
    return this.db(db).stockInPriceCorrectionOrder.update({
      where: { id },
      data,
    });
  }

  async updateOrderLine(
    id: number,
    data: Prisma.StockInPriceCorrectionOrderLineUncheckedUpdateInput,
    db?: DbClient,
  ) {
    return this.db(db).stockInPriceCorrectionOrderLine.update({
      where: { id },
      data,
    });
  }
}
