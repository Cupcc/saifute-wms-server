import { Injectable } from "@nestjs/common";
import {
  DocumentFamily,
  DocumentRelationType,
  Prisma,
  WorkshopMaterialOrderType,
} from "../../../../generated/prisma/client";
import { BusinessDocumentType } from "../../../shared/domain/business-document-type";
import { PrismaService } from "../../../shared/prisma/prisma.service";
import type { StockScopeCode } from "../../session/domain/user-session";

type DbClient = Prisma.TransactionClient | PrismaService;

const DOCUMENT_TYPE = BusinessDocumentType.WorkshopMaterialOrder;

@Injectable()
export class WorkshopMaterialRepository {
  constructor(private readonly prisma: PrismaService) {}

  runInTransaction<T>(handler: (tx: Prisma.TransactionClient) => Promise<T>) {
    return this.prisma.runInTransaction(handler);
  }

  private db(db?: DbClient) {
    return db ?? this.prisma;
  }

  private buildOrderWhere(params: {
    documentNo?: string;
    handlerName?: string;
    materialId?: number;
    materialCode?: string;
    materialName?: string;
    specification?: string;
    sourceId?: number;
    orderType?: WorkshopMaterialOrderType;
    bizDateFrom?: Date;
    bizDateTo?: Date;
    workshopId?: number;
    stockScope?: StockScopeCode;
  }): Prisma.WorkshopMaterialOrderWhereInput {
    const where: Prisma.WorkshopMaterialOrderWhereInput = {
      lifecycleStatus: "EFFECTIVE",
    };
    if (params.documentNo) {
      where.documentNo = { contains: params.documentNo };
    }
    if (params.handlerName) {
      where.handlerNameSnapshot = { contains: params.handlerName };
    }
    if (
      params.materialId ||
      params.materialCode ||
      params.materialName ||
      params.specification ||
      params.sourceId
    ) {
      where.lines = {
        some: {
          ...(params.materialId ? { materialId: params.materialId } : {}),
          ...(params.materialCode
            ? { materialCodeSnapshot: { contains: params.materialCode } }
            : {}),
          ...(params.materialName
            ? {
                materialNameSnapshot: {
                  contains: params.materialName,
                },
              }
            : {}),
          ...(params.specification
            ? { materialSpecSnapshot: { contains: params.specification } }
            : {}),
          ...(params.sourceId ? { sourceDocumentId: params.sourceId } : {}),
        },
      };
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
    if (params.stockScope) {
      where.stockScope = {
        is: {
          scopeCode: params.stockScope,
        },
      };
    }

    return where;
  }

  async findOrders(
    params: {
      documentNo?: string;
      handlerName?: string;
      materialId?: number;
      detailId?: number;
      materialCode?: string;
      materialName?: string;
      specification?: string;
      sourceId?: number;
      orderType?: WorkshopMaterialOrderType;
      bizDateFrom?: Date;
      bizDateTo?: Date;
      workshopId?: number;
      stockScope?: StockScopeCode;
      limit: number;
      offset: number;
    },
    db?: DbClient,
  ) {
    const where = this.buildOrderWhere(params);

    const client = this.db(db);
    const [items, total] = await Promise.all([
      client.workshopMaterialOrder.findMany({
        where,
        take: params.limit,
        skip: params.offset,
        orderBy: [{ bizDate: "desc" }, { createdAt: "desc" }, { id: "desc" }],
        include: {
          stockScope: true,
          lines: { orderBy: { lineNo: "asc" } },
        },
      }),
      client.workshopMaterialOrder.count({ where }),
    ]);

    return { items, total };
  }

  async findOrderLines(
    params: {
      documentNo?: string;
      handlerName?: string;
      materialId?: number;
      detailId?: number;
      materialCode?: string;
      materialName?: string;
      specification?: string;
      sourceId?: number;
      orderType?: WorkshopMaterialOrderType;
      bizDateFrom?: Date;
      bizDateTo?: Date;
      workshopId?: number;
      stockScope?: StockScopeCode;
      limit: number;
      offset: number;
    },
    db?: DbClient,
  ) {
    const where: Prisma.WorkshopMaterialOrderLineWhereInput = {
      order: this.buildOrderWhere(params),
    };
    if (params.detailId) {
      where.id = params.detailId;
    }
    if (params.materialId) {
      where.materialId = params.materialId;
    }
    if (params.materialCode) {
      where.materialCodeSnapshot = { contains: params.materialCode };
    }
    if (params.materialName) {
      where.materialNameSnapshot = { contains: params.materialName };
    }
    if (params.specification) {
      where.materialSpecSnapshot = { contains: params.specification };
    }
    if (params.sourceId) {
      where.sourceDocumentId = params.sourceId;
    }

    const client = this.db(db);
    const [items, total] = await Promise.all([
      client.workshopMaterialOrderLine.findMany({
        where,
        take: params.limit,
        skip: params.offset,
        orderBy: [
          { order: { bizDate: "desc" } },
          { order: { createdAt: "desc" } },
          { orderId: "desc" },
          { lineNo: "asc" },
        ],
        include: { order: { include: { stockScope: true } } },
      }),
      client.workshopMaterialOrderLine.count({ where }),
    ]);

    return { items, total };
  }

  async findOrderById(id: number, db?: DbClient) {
    return this.db(db).workshopMaterialOrder.findUnique({
      where: { id },
      include: {
        stockScope: true,
        lines: { orderBy: { lineNo: "asc" } },
      },
    });
  }

  async findOrderByDocumentNo(documentNo: string, db?: DbClient) {
    return this.db(db).workshopMaterialOrder.findUnique({
      where: { documentNo },
      include: { stockScope: true, lines: true },
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
      include: {
        stockScope: true,
        lines: { orderBy: { lineNo: "asc" } },
      },
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
      include: {
        stockScope: true,
        lines: { orderBy: { lineNo: "asc" } },
      },
    });
  }

  async createOrderLine(
    data: Prisma.WorkshopMaterialOrderLineUncheckedCreateInput,
    db?: DbClient,
  ) {
    return this.db(db).workshopMaterialOrderLine.create({
      data,
    });
  }

  async deleteOrderLinesByOrderId(orderId: number, db?: DbClient) {
    return this.db(db).workshopMaterialOrderLine.deleteMany({
      where: { orderId },
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

  async upsertReturnFromPickRelation(
    params: {
      returnOrderId: number;
      returnLineId: number;
      sourceDocumentId: number;
      sourceDocumentLineId: number;
      linkedQty: Prisma.Decimal;
      createdBy?: string;
    },
    db?: DbClient,
  ) {
    const client = this.db(db);
    await client.documentRelation.upsert({
      where: {
        relationType_upstreamFamily_upstreamDocumentId_downstreamFamily_downstreamDocumentId:
          {
            relationType: DocumentRelationType.WORKSHOP_RETURN_FROM_PICK,
            upstreamFamily: DocumentFamily.WORKSHOP_MATERIAL,
            upstreamDocumentId: params.sourceDocumentId,
            downstreamFamily: DocumentFamily.WORKSHOP_MATERIAL,
            downstreamDocumentId: params.returnOrderId,
          },
      },
      create: {
        relationType: DocumentRelationType.WORKSHOP_RETURN_FROM_PICK,
        upstreamFamily: DocumentFamily.WORKSHOP_MATERIAL,
        upstreamDocumentType: DOCUMENT_TYPE,
        upstreamDocumentId: params.sourceDocumentId,
        downstreamFamily: DocumentFamily.WORKSHOP_MATERIAL,
        downstreamDocumentType: DOCUMENT_TYPE,
        downstreamDocumentId: params.returnOrderId,
        isActive: true,
        createdBy: params.createdBy,
        updatedBy: params.createdBy,
      },
      update: { isActive: true, updatedBy: params.createdBy },
    });

    await client.documentLineRelation.upsert({
      where: {
        relationType_upstreamFamily_upstreamLineId_downstreamFamily_downstreamLineId:
          {
            relationType: DocumentRelationType.WORKSHOP_RETURN_FROM_PICK,
            upstreamFamily: DocumentFamily.WORKSHOP_MATERIAL,
            upstreamLineId: params.sourceDocumentLineId,
            downstreamFamily: DocumentFamily.WORKSHOP_MATERIAL,
            downstreamLineId: params.returnLineId,
          },
      },
      create: {
        relationType: DocumentRelationType.WORKSHOP_RETURN_FROM_PICK,
        upstreamFamily: DocumentFamily.WORKSHOP_MATERIAL,
        upstreamDocumentType: DOCUMENT_TYPE,
        upstreamDocumentId: params.sourceDocumentId,
        upstreamLineId: params.sourceDocumentLineId,
        downstreamFamily: DocumentFamily.WORKSHOP_MATERIAL,
        downstreamDocumentType: DOCUMENT_TYPE,
        downstreamDocumentId: params.returnOrderId,
        downstreamLineId: params.returnLineId,
        linkedQty: params.linkedQty,
        createdBy: params.createdBy,
        updatedBy: params.createdBy,
      },
      update: { linkedQty: params.linkedQty, updatedBy: params.createdBy },
    });
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

  async deleteDocumentLineRelationsForReturn(
    returnOrderId: number,
    db?: DbClient,
  ) {
    return this.db(db).documentLineRelation.deleteMany({
      where: {
        downstreamFamily: DocumentFamily.WORKSHOP_MATERIAL,
        downstreamDocumentType: DOCUMENT_TYPE,
        downstreamDocumentId: returnOrderId,
        relationType: DocumentRelationType.WORKSHOP_RETURN_FROM_PICK,
      },
    });
  }

  /**
   * Returns a map of sourcePickLineId → sum of linkedQty across all active
   * (non-voided) downstream return-order line relations for the given pick order.
   * Used to enforce cumulative return-quantity limits before creating a new return.
   */
  async updateOrderLineCost(
    id: number,
    data: {
      costUnitPrice: Prisma.Decimal;
      costAmount: Prisma.Decimal;
      unitPrice?: Prisma.Decimal;
      amount?: Prisma.Decimal;
    },
    db?: DbClient,
  ) {
    return this.db(db).workshopMaterialOrderLine.update({
      where: { id },
      data: {
        costUnitPrice: data.costUnitPrice,
        costAmount: data.costAmount,
        ...(typeof data.unitPrice === "undefined"
          ? {}
          : { unitPrice: data.unitPrice }),
        ...(typeof data.amount === "undefined" ? {} : { amount: data.amount }),
      },
    });
  }

  async sumActiveReturnedQtyByPickLine(
    pickOrderId: number,
    db?: DbClient,
  ): Promise<Map<number, Prisma.Decimal>> {
    const client = this.db(db);
    const lineRelations = await client.documentLineRelation.findMany({
      where: {
        relationType: DocumentRelationType.WORKSHOP_RETURN_FROM_PICK,
        upstreamFamily: DocumentFamily.WORKSHOP_MATERIAL,
        upstreamDocumentType: DOCUMENT_TYPE,
        upstreamDocumentId: pickOrderId,
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
    const voidedOrders = await client.workshopMaterialOrder.findMany({
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

  async findRdProcurementRequestForScrapSource(id: number, db?: DbClient) {
    return this.db(db).rdProcurementRequest.findUnique({
      where: { id },
      include: { lines: true },
    });
  }
}
