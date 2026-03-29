import { Injectable } from "@nestjs/common";
import type { Prisma } from "../../../generated/prisma/client";
import { PrismaService } from "../../../shared/prisma/prisma.service";

type DbClient = Prisma.TransactionClient | PrismaService;

@Injectable()
export class RdStocktakeOrderRepository {
  constructor(private readonly prisma: PrismaService) {}

  private db(db?: DbClient) {
    return db ?? this.prisma;
  }

  async findOrders(
    params: {
      documentNo?: string;
      bizDateFrom?: Date;
      bizDateTo?: Date;
      materialId?: number;
      workshopId?: number;
      limit: number;
      offset: number;
    },
    db?: DbClient,
  ) {
    const where: Prisma.RdStocktakeOrderWhereInput = {
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
    if (params.materialId) {
      where.lines = {
        some: { materialId: params.materialId },
      };
    }
    if (params.workshopId) {
      where.workshopId = params.workshopId;
    }

    const client = this.db(db);
    const [items, total] = await Promise.all([
      client.rdStocktakeOrder.findMany({
        where,
        take: params.limit,
        skip: params.offset,
        orderBy: [{ bizDate: "desc" }, { id: "desc" }],
        include: {
          lines: {
            orderBy: { lineNo: "asc" },
          },
        },
      }),
      client.rdStocktakeOrder.count({ where }),
    ]);

    return { items, total };
  }

  async findOrderById(id: number, db?: DbClient) {
    return this.db(db).rdStocktakeOrder.findUnique({
      where: { id },
      include: {
        lines: {
          orderBy: { lineNo: "asc" },
          include: {
            inventoryLog: true,
          },
        },
      },
    });
  }

  async findOrderByDocumentNo(documentNo: string, db?: DbClient) {
    return this.db(db).rdStocktakeOrder.findUnique({
      where: { documentNo },
      include: {
        lines: {
          orderBy: { lineNo: "asc" },
        },
      },
    });
  }

  async createOrder(
    data: Prisma.RdStocktakeOrderUncheckedCreateInput,
    lines: Omit<Prisma.RdStocktakeOrderLineUncheckedCreateInput, "orderId">[],
    db?: DbClient,
  ) {
    const client = this.db(db);
    const order = await client.rdStocktakeOrder.create({ data });
    await client.rdStocktakeOrderLine.createMany({
      data: lines.map((line) => ({ ...line, orderId: order.id })),
    });
    const result = await client.rdStocktakeOrder.findUnique({
      where: { id: order.id },
      include: {
        lines: {
          orderBy: { lineNo: "asc" },
        },
      },
    });
    if (!result) {
      throw new Error("RD stocktake order creation failed");
    }
    return result;
  }

  async updateOrder(
    id: number,
    data: Prisma.RdStocktakeOrderUncheckedUpdateInput,
    db?: DbClient,
  ) {
    return this.db(db).rdStocktakeOrder.update({
      where: { id },
      data,
      include: {
        lines: {
          orderBy: { lineNo: "asc" },
          include: {
            inventoryLog: true,
          },
        },
      },
    });
  }

  async updateOrderLine(
    id: number,
    data: Prisma.RdStocktakeOrderLineUncheckedUpdateInput,
    db?: DbClient,
  ) {
    return this.db(db).rdStocktakeOrderLine.update({
      where: { id },
      data,
      include: {
        inventoryLog: true,
      },
    });
  }
}
