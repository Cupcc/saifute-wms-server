import { Injectable } from "@nestjs/common";
import {
  DocumentFamily,
  DocumentRelationType,
  Prisma,
  SalesStockOrderType,
} from "../../../../generated/prisma/client";
import { BusinessDocumentType } from "../../../shared/domain/business-document-type";
import { PrismaService } from "../../../shared/prisma/prisma.service";

const DOCUMENT_TYPE = BusinessDocumentType.SalesStockOrder;
type DbClient = Prisma.TransactionClient | PrismaService;

@Injectable()
export class SalesRepository {
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
      orderType?: SalesStockOrderType;
      bizDateFrom?: Date;
      bizDateTo?: Date;
      customerId?: number;
      workshopId?: number;
      limit: number;
      offset: number;
    },
    db?: DbClient,
  ) {
    const where: Prisma.SalesStockOrderWhereInput = {
      orderType: SalesStockOrderType.OUTBOUND,
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
    if (params.customerId) {
      where.customerId = params.customerId;
    }
    if (params.workshopId) {
      where.workshopId = params.workshopId;
    }

    const client = this.db(db);
    const [items, total] = await Promise.all([
      client.salesStockOrder.findMany({
        where,
        take: params.limit,
        skip: params.offset,
        orderBy: [{ bizDate: "desc" }, { createdAt: "desc" }, { id: "desc" }],
        include: { lines: { orderBy: { lineNo: "asc" } } },
      }),
      client.salesStockOrder.count({ where }),
    ]);

    return { items, total };
  }

  async findSalesReturns(
    params: {
      documentNo?: string;
      bizDateFrom?: Date;
      bizDateTo?: Date;
      customerId?: number;
      sourceOutboundOrderId?: number;
      workshopId?: number;
      limit: number;
      offset: number;
    },
    db?: DbClient,
  ) {
    const where: Prisma.SalesStockOrderWhereInput = {
      orderType: SalesStockOrderType.SALES_RETURN,
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
    if (params.customerId) {
      where.customerId = params.customerId;
    }
    if (params.workshopId) {
      where.workshopId = params.workshopId;
    }
    if (params.sourceOutboundOrderId) {
      const relations = await this.db(db).documentRelation.findMany({
        where: {
          relationType: DocumentRelationType.SALES_RETURN_FROM_OUTBOUND,
          upstreamFamily: DocumentFamily.SALES_STOCK,
          upstreamDocumentType: DOCUMENT_TYPE,
          upstreamDocumentId: params.sourceOutboundOrderId,
          isActive: true,
        },
        select: { downstreamDocumentId: true },
      });
      const downstreamIds = relations.map((r) => r.downstreamDocumentId);
      if (downstreamIds.length === 0) {
        where.id = -1;
      } else {
        where.id = { in: downstreamIds };
      }
    }

    const client = this.db(db);
    const [items, total] = await Promise.all([
      client.salesStockOrder.findMany({
        where,
        take: params.limit,
        skip: params.offset,
        orderBy: [{ bizDate: "desc" }, { createdAt: "desc" }, { id: "desc" }],
        include: { lines: { orderBy: { lineNo: "asc" } } },
      }),
      client.salesStockOrder.count({ where }),
    ]);

    return { items, total };
  }

  async findOrderById(id: number, db?: DbClient) {
    return this.db(db).salesStockOrder.findUnique({
      where: { id },
      include: { lines: { orderBy: { lineNo: "asc" } } },
    });
  }

  async findOrderByDocumentNo(documentNo: string, db?: DbClient) {
    return this.db(db).salesStockOrder.findUnique({
      where: { documentNo },
      include: { lines: true },
    });
  }

  async createOrder(
    data: Prisma.SalesStockOrderUncheckedCreateInput,
    lines: Omit<Prisma.SalesStockOrderLineUncheckedCreateInput, "orderId">[],
    db?: DbClient,
  ) {
    const client = this.db(db);
    const order = await client.salesStockOrder.create({
      data,
    });
    const linesWithOrderId = lines.map((l) => ({ ...l, orderId: order.id }));
    await client.salesStockOrderLine.createMany({ data: linesWithOrderId });
    const result = await client.salesStockOrder.findUnique({
      where: { id: order.id },
      include: { lines: { orderBy: { lineNo: "asc" } } },
    });
    if (!result) throw new Error("Order creation failed");
    return result;
  }

  async updateOrder(
    id: number,
    data: Prisma.SalesStockOrderUncheckedUpdateInput,
    db?: DbClient,
  ) {
    return this.db(db).salesStockOrder.update({
      where: { id },
      data,
      include: { lines: { orderBy: { lineNo: "asc" } } },
    });
  }

  async createOrderLine(
    data: Prisma.SalesStockOrderLineUncheckedCreateInput,
    db?: DbClient,
  ) {
    return this.db(db).salesStockOrderLine.create({
      data,
    });
  }

  async updateOrderLine(
    id: number,
    data: Prisma.SalesStockOrderLineUncheckedUpdateInput,
    db?: DbClient,
  ) {
    return this.db(db).salesStockOrderLine.update({
      where: { id },
      data,
    });
  }

  async deleteOrderLine(id: number, db?: DbClient) {
    return this.db(db).salesStockOrderLine.delete({
      where: { id },
    });
  }

  async hasActiveDownstreamSalesReturns(
    outboundOrderId: number,
    db?: DbClient,
  ) {
    const client = this.db(db);
    const relations = await client.documentRelation.findMany({
      where: {
        relationType: DocumentRelationType.SALES_RETURN_FROM_OUTBOUND,
        upstreamFamily: DocumentFamily.SALES_STOCK,
        upstreamDocumentType: DOCUMENT_TYPE,
        upstreamDocumentId: outboundOrderId,
        isActive: true,
      },
    });

    if (relations.length === 0) return false;

    const downstreamIds = relations.map((r) => r.downstreamDocumentId);
    const effectiveCount = await client.salesStockOrder.count({
      where: {
        id: { in: downstreamIds },
        lifecycleStatus: "EFFECTIVE",
      },
    });
    return effectiveCount > 0;
  }

  async createDocumentRelation(
    data: Prisma.DocumentRelationUncheckedCreateInput,
    db?: DbClient,
  ) {
    return this.db(db).documentRelation.create({ data });
  }

  async createDocumentLineRelation(
    data: Prisma.DocumentLineRelationUncheckedCreateInput,
    db?: DbClient,
  ) {
    return this.db(db).documentLineRelation.create({ data });
  }

  async deactivateDocumentRelationsForOrder(
    documentId: number,
    documentType: string,
    db?: DbClient,
  ) {
    return this.db(db).documentRelation.updateMany({
      where: {
        downstreamDocumentType: documentType,
        downstreamDocumentId: documentId,
        isActive: true,
      },
      data: { isActive: false },
    });
  }

  /**
   * Returns a map of sourceOutboundLineId → sum of linkedQty across all active
   * (non-voided) downstream sales-return line relations for the given outbound order.
   * Used to enforce cumulative return-quantity limits before creating a new sales return.
   */
  async sumActiveReturnedQtyByOutboundLine(
    outboundOrderId: number,
    db?: DbClient,
  ): Promise<Map<number, Prisma.Decimal>> {
    const client = this.db(db);
    const lineRelations = await client.documentLineRelation.findMany({
      where: {
        relationType: DocumentRelationType.SALES_RETURN_FROM_OUTBOUND,
        upstreamFamily: DocumentFamily.SALES_STOCK,
        upstreamDocumentType: DOCUMENT_TYPE,
        upstreamDocumentId: outboundOrderId,
      },
      select: {
        upstreamLineId: true,
        downstreamDocumentId: true,
        linkedQty: true,
      },
    });

    if (lineRelations.length === 0) return new Map();

    const downstreamIds = [
      ...new Set(lineRelations.map((r) => r.downstreamDocumentId)),
    ];
    const voidedOrders = await client.salesStockOrder.findMany({
      where: { id: { in: downstreamIds }, lifecycleStatus: "VOIDED" },
      select: { id: true },
    });
    const voidedIds = new Set(voidedOrders.map((o) => o.id));

    const result = new Map<number, Prisma.Decimal>();
    for (const rel of lineRelations) {
      if (voidedIds.has(rel.downstreamDocumentId)) continue;
      const prev = result.get(rel.upstreamLineId) ?? new Prisma.Decimal(0);
      result.set(
        rel.upstreamLineId,
        prev.add(new Prisma.Decimal(rel.linkedQty)),
      );
    }
    return result;
  }

  async findMaterialCategoryByCode(categoryCode: string, db?: DbClient) {
    return this.db(db).materialCategory.findUnique({
      where: { categoryCode },
      select: {
        id: true,
        categoryCode: true,
        categoryName: true,
      },
    });
  }

  async findPriceCorrectionLinesBySourceLogIds(
    sourceLogIds: number[],
    db?: DbClient,
  ) {
    if (sourceLogIds.length === 0) {
      return [];
    }

    return this.db(db).stockInPriceCorrectionOrderLine.findMany({
      where: {
        OR: [
          { sourceInventoryLogId: { in: sourceLogIds } },
          { generatedInLogId: { in: sourceLogIds } },
        ],
      },
      include: {
        order: {
          select: {
            id: true,
            documentNo: true,
            bizDate: true,
          },
        },
        sourceStockInOrder: {
          select: {
            id: true,
            documentNo: true,
            bizDate: true,
          },
        },
        sourceStockInOrderLine: {
          select: {
            id: true,
            lineNo: true,
            materialId: true,
            materialCodeSnapshot: true,
            materialNameSnapshot: true,
            quantity: true,
            unitPrice: true,
          },
        },
      },
    });
  }

  async findStockInLinesByIds(lineIds: number[], db?: DbClient) {
    if (lineIds.length === 0) {
      return [];
    }

    return this.db(db).stockInOrderLine.findMany({
      where: { id: { in: lineIds } },
      include: {
        order: {
          select: {
            id: true,
            documentNo: true,
            bizDate: true,
          },
        },
      },
    });
  }
}
