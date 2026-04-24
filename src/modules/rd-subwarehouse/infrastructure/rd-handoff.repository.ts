import { Injectable } from "@nestjs/common";
import { Prisma } from "../../../../generated/prisma/client";
import { PrismaService } from "../../../shared/prisma/prisma.service";

type DbClient = Prisma.TransactionClient | PrismaService;

@Injectable()
export class RdHandoffRepository {
  constructor(private readonly prisma: PrismaService) {}

  private db(db?: DbClient) {
    return db ?? this.prisma;
  }

  runInTransaction<T>(handler: (tx: Prisma.TransactionClient) => Promise<T>) {
    return this.prisma.runInTransaction(handler);
  }

  async findOrders(
    params: {
      documentNo?: string;
      bizDateFrom?: Date;
      bizDateTo?: Date;
      handlerName?: string;
      materialId?: number;
      materialName?: string;
      sourceWorkshopId?: number;
      targetWorkshopId?: number;
      limit: number;
      offset: number;
    },
    db?: DbClient,
  ) {
    const where: Prisma.RdHandoffOrderWhereInput = {
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
    if (params.sourceWorkshopId) {
      where.sourceWorkshopId = params.sourceWorkshopId;
    }
    if (params.targetWorkshopId) {
      where.targetWorkshopId = params.targetWorkshopId;
    }

    const client = this.db(db);
    const [items, total] = await Promise.all([
      client.rdHandoffOrder.findMany({
        where,
        take: params.limit,
        skip: params.offset,
        orderBy: [{ bizDate: "desc" }, { id: "desc" }],
        include: { lines: { orderBy: { lineNo: "asc" } } },
      }),
      client.rdHandoffOrder.count({ where }),
    ]);

    return { items, total };
  }

  async findOrderById(id: number, db?: DbClient) {
    return this.db(db).rdHandoffOrder.findUnique({
      where: { id },
      include: { lines: { orderBy: { lineNo: "asc" } } },
    });
  }

  async findOrderByDocumentNo(documentNo: string, db?: DbClient) {
    return this.db(db).rdHandoffOrder.findUnique({
      where: { documentNo },
      include: { lines: { orderBy: { lineNo: "asc" } } },
    });
  }

  async createOrder(
    data: Prisma.RdHandoffOrderUncheckedCreateInput,
    lines: Omit<Prisma.RdHandoffOrderLineUncheckedCreateInput, "orderId">[],
    db?: DbClient,
  ) {
    const client = this.db(db);
    const order = await client.rdHandoffOrder.create({ data });
    await client.rdHandoffOrderLine.createMany({
      data: lines.map((line) => ({ ...line, orderId: order.id })),
    });
    const result = await client.rdHandoffOrder.findUnique({
      where: { id: order.id },
      include: { lines: { orderBy: { lineNo: "asc" } } },
    });
    if (!result) {
      throw new Error("RD handoff order creation failed");
    }
    return result;
  }

  async updateOrder(
    id: number,
    data: Prisma.RdHandoffOrderUncheckedUpdateInput,
    db?: DbClient,
  ) {
    return this.db(db).rdHandoffOrder.update({
      where: { id },
      data,
      include: { lines: { orderBy: { lineNo: "asc" } } },
    });
  }

  async updateOrderLineCost(
    id: number,
    data: { costUnitPrice: Prisma.Decimal; costAmount: Prisma.Decimal },
    db?: DbClient,
  ) {
    return this.db(db).rdHandoffOrderLine.update({
      where: { id },
      data: {
        costUnitPrice: data.costUnitPrice,
        costAmount: data.costAmount,
      },
    });
  }
}
