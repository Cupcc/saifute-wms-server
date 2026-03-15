import { Injectable } from "@nestjs/common";
import {
  DocumentFamily,
  DocumentRelationType,
  type Prisma,
  WorkshopMaterialOrderType,
} from "../../../generated/prisma/client";
import { PrismaService } from "../../../shared/prisma/prisma.service";

type DbClient = Prisma.TransactionClient | PrismaService;

const DOCUMENT_TYPE = "WorkshopMaterialOrder";

@Injectable()
export class WorkshopMaterialRepository {
  constructor(private readonly prisma: PrismaService) {}

  private db(db?: DbClient) {
    return db ?? this.prisma;
  }

  async findOrders(
    params: {
      documentNo?: string;
      orderType?: WorkshopMaterialOrderType;
      bizDateFrom?: Date;
      bizDateTo?: Date;
      workshopId?: number;
      limit: number;
      offset: number;
    },
    db?: DbClient,
  ) {
    const where: Prisma.WorkshopMaterialOrderWhereInput = {
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
    if (params.workshopId) {
      where.workshopId = params.workshopId;
    }

    const client = this.db(db);
    const [items, total] = await Promise.all([
      client.workshopMaterialOrder.findMany({
        where,
        take: params.limit,
        skip: params.offset,
        orderBy: { bizDate: "desc" },
        include: { lines: { orderBy: { lineNo: "asc" } } },
      }),
      client.workshopMaterialOrder.count({ where }),
    ]);

    return { items, total };
  }

  async findOrderById(id: number, db?: DbClient) {
    return this.db(db).workshopMaterialOrder.findUnique({
      where: { id },
      include: { lines: { orderBy: { lineNo: "asc" } } },
    });
  }

  async findOrderByDocumentNo(documentNo: string, db?: DbClient) {
    return this.db(db).workshopMaterialOrder.findUnique({
      where: { documentNo },
      include: { lines: true },
    });
  }

  async createOrder(
    data: Prisma.WorkshopMaterialOrderUncheckedCreateInput,
    lines: Omit<
      Prisma.WorkshopMaterialOrderLineUncheckedCreateInput,
      "orderId"
    >[],
    db?: DbClient,
  ) {
    const client = this.db(db);
    const order = await client.workshopMaterialOrder.create({
      data,
    });
    const linesWithOrderId = lines.map((l) => ({ ...l, orderId: order.id }));
    await client.workshopMaterialOrderLine.createMany({
      data: linesWithOrderId,
    });
    const result = await client.workshopMaterialOrder.findUnique({
      where: { id: order.id },
      include: { lines: { orderBy: { lineNo: "asc" } } },
    });
    if (!result) throw new Error("Order creation failed");
    return result;
  }

  async updateOrder(
    id: number,
    data: Prisma.WorkshopMaterialOrderUncheckedUpdateInput,
    db?: DbClient,
  ) {
    return this.db(db).workshopMaterialOrder.update({
      where: { id },
      data,
      include: { lines: { orderBy: { lineNo: "asc" } } },
    });
  }

  async deleteOrderLine(id: number, db?: DbClient) {
    return this.db(db).workshopMaterialOrderLine.delete({
      where: { id },
    });
  }

  /** Check if pick order has active return orders downstream (blocks void). */
  async hasActiveReturnDownstream(pickOrderId: number, db?: DbClient) {
    const client = this.db(db);
    const count = await client.documentRelation.count({
      where: {
        relationType: DocumentRelationType.WORKSHOP_RETURN_FROM_PICK,
        upstreamFamily: DocumentFamily.WORKSHOP_MATERIAL,
        upstreamDocumentType: DOCUMENT_TYPE,
        upstreamDocumentId: pickOrderId,
        isActive: true,
      },
    });
    return count > 0;
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

  async deactivateDocumentRelationsForReturn(
    returnOrderId: number,
    db?: DbClient,
  ) {
    return this.db(db).documentRelation.updateMany({
      where: {
        downstreamFamily: DocumentFamily.WORKSHOP_MATERIAL,
        downstreamDocumentType: DOCUMENT_TYPE,
        downstreamDocumentId: returnOrderId,
        relationType: DocumentRelationType.WORKSHOP_RETURN_FROM_PICK,
      },
      data: { isActive: false },
    });
  }
}
