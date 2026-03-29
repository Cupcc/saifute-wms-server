import { Injectable } from "@nestjs/common";
import { DocumentFamily, Prisma } from "../../../generated/prisma/client";
import { PrismaService } from "../../../shared/prisma/prisma.service";

type DbClient = Prisma.TransactionClient | PrismaService;

@Injectable()
export class InboundRepository {
  constructor(private readonly prisma: PrismaService) {}

  private db(db?: DbClient) {
    return db ?? this.prisma;
  }

  async findOrders(
    params: {
      documentNo?: string;
      orderType?: Prisma.StockInOrderWhereInput["orderType"];
      bizDateFrom?: Date;
      bizDateTo?: Date;
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
    const where: Prisma.StockInOrderWhereInput = {
      lifecycleStatus: "EFFECTIVE",
    };
    if (params.documentNo) {
      where.documentNo = { contains: params.documentNo };
    }
    if (params.orderType) {
      where.orderType = params.orderType;
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
      client.stockInOrder.findMany({
        where,
        take: params.limit,
        skip: params.offset,
        orderBy: { bizDate: "desc" },
        include: { lines: true },
      }),
      client.stockInOrder.count({ where }),
    ]);

    return { items, total };
  }

  async findOrderById(id: number, db?: DbClient) {
    return this.db(db).stockInOrder.findUnique({
      where: { id },
      include: { lines: { orderBy: { lineNo: "asc" } } },
    });
  }

  async findOrderByDocumentNo(documentNo: string, db?: DbClient) {
    return this.db(db).stockInOrder.findUnique({
      where: { documentNo },
      include: { lines: true },
    });
  }

  async createOrder(
    data: Prisma.StockInOrderUncheckedCreateInput,
    lines: Omit<Prisma.StockInOrderLineUncheckedCreateInput, "orderId">[],
    db?: DbClient,
  ) {
    const client = this.db(db);
    const order = await client.stockInOrder.create({
      data,
    });
    const linesWithOrderId = lines.map((l) => ({ ...l, orderId: order.id }));
    await client.stockInOrderLine.createMany({ data: linesWithOrderId });
    const result = await client.stockInOrder.findUnique({
      where: { id: order.id },
      include: { lines: { orderBy: { lineNo: "asc" } } },
    });
    if (!result) throw new Error("Order creation failed");
    return result;
  }

  async updateOrder(
    id: number,
    data: Prisma.StockInOrderUncheckedUpdateInput,
    db?: DbClient,
  ) {
    return this.db(db).stockInOrder.update({
      where: { id },
      data,
      include: { lines: { orderBy: { lineNo: "asc" } } },
    });
  }

  async deleteOrderLines(orderId: number, db?: DbClient) {
    return this.db(db).stockInOrderLine.deleteMany({
      where: { orderId },
    });
  }

  async createOrderLines(
    lines: Prisma.StockInOrderLineUncheckedCreateInput[],
    db?: DbClient,
  ) {
    if (lines.length === 0) return [];
    const client = this.db(db);
    await client.stockInOrderLine.createMany({ data: lines });
    const orderId = lines[0]?.orderId;
    if (!orderId) return [];
    return client.stockInOrderLine.findMany({
      where: { orderId },
      orderBy: { lineNo: "asc" },
    });
  }

  async createOrderLine(
    data: Prisma.StockInOrderLineUncheckedCreateInput,
    db?: DbClient,
  ) {
    return this.db(db).stockInOrderLine.create({
      data,
    });
  }

  async updateOrderLine(
    id: number,
    data: Prisma.StockInOrderLineUncheckedUpdateInput,
    db?: DbClient,
  ) {
    return this.db(db).stockInOrderLine.update({
      where: { id },
      data,
    });
  }

  async deleteOrderLine(id: number, db?: DbClient) {
    return this.db(db).stockInOrderLine.delete({
      where: { id },
    });
  }

  async hasActiveDownstreamDependencies(orderId: number, db?: DbClient) {
    const client = this.db(db);
    const [documentCount, lineCount] = await Promise.all([
      client.documentRelation.count({
        where: {
          upstreamFamily: DocumentFamily.STOCK_IN,
          upstreamDocumentId: orderId,
          isActive: true,
        },
      }),
      client.documentLineRelation.count({
        where: {
          upstreamFamily: DocumentFamily.STOCK_IN,
          upstreamDocumentId: orderId,
        },
      }),
    ]);

    return documentCount > 0 || lineCount > 0;
  }

  async sumEffectiveAcceptedQtyByRdProcurementLineIds(
    lineIds: number[],
    excludeOrderId?: number,
    db?: DbClient,
  ) {
    if (lineIds.length === 0) {
      return new Map<number, Prisma.Decimal>();
    }

    const rows = await this.db(db).stockInOrderLine.findMany({
      where: {
        rdProcurementRequestLineId: { in: lineIds },
        order: {
          lifecycleStatus: "EFFECTIVE",
          ...(excludeOrderId ? { id: { not: excludeOrderId } } : {}),
        },
      },
      select: {
        rdProcurementRequestLineId: true,
        quantity: true,
      },
    });

    const totals = new Map<number, Prisma.Decimal>();
    rows.forEach((row) => {
      if (!row.rdProcurementRequestLineId) {
        return;
      }
      const current =
        totals.get(row.rdProcurementRequestLineId) ?? new Prisma.Decimal(0);
      totals.set(
        row.rdProcurementRequestLineId,
        current.add(new Prisma.Decimal(row.quantity)),
      );
    });
    return totals;
  }
}
