import { Injectable } from "@nestjs/common";
import {
  DocumentLifecycleStatus,
  type Prisma,
  SalesStockOrderType,
  WorkshopMaterialOrderType,
} from "../../../../generated/prisma/client";
import { PrismaService } from "../../../shared/prisma/prisma.service";
import type { StockScopeCode } from "../../session/domain/user-session";

@Injectable()
export class HomeMetricsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async getHomeMetrics(
    todayStart: Date,
    todayEnd: Date,
    params: {
      stockScope?: StockScopeCode;
    },
  ) {
    const inboundTodayWhere = this.buildInboundWhere(params.stockScope, {
      bizDate: { gte: todayStart, lte: todayEnd },
    });
    const outboundTodayWhere = this.buildOutboundWhere(params.stockScope, {
      bizDate: { gte: todayStart, lte: todayEnd },
    });
    const workshopMaterialTodayWhere = this.buildWorkshopMaterialWhere(
      params.stockScope,
      {
        bizDate: { gte: todayStart, lte: todayEnd },
      },
    );
    const inboundAggregateWhere = this.buildInboundWhere(params.stockScope);
    const outboundAggregateWhere = this.buildOutboundWhere(params.stockScope);
    const workshopMaterialAggregateWhere = this.buildWorkshopMaterialWhere(
      params.stockScope,
    );
    const emptyDocumentAggregate = {
      _sum: {
        totalQty: null,
        totalAmount: null,
      },
    };

    const [
      inboundTodayCount,
      outboundTodayCount,
      workshopMaterialTodayCount,
      inboundAggregate,
      outboundAggregate,
      workshopMaterialAggregate,
    ] = await Promise.all([
      inboundTodayWhere
        ? this.prisma.stockInOrder.count({
            where: inboundTodayWhere,
          })
        : Promise.resolve(0),
      outboundTodayWhere
        ? this.prisma.salesStockOrder.count({
            where: outboundTodayWhere,
          })
        : Promise.resolve(0),
      workshopMaterialTodayWhere
        ? this.prisma.workshopMaterialOrder.count({
            where: workshopMaterialTodayWhere,
          })
        : Promise.resolve(0),
      inboundAggregateWhere
        ? this.prisma.stockInOrder.aggregate({
            where: inboundAggregateWhere,
            _sum: { totalQty: true, totalAmount: true },
          })
        : Promise.resolve(emptyDocumentAggregate),
      outboundAggregateWhere
        ? this.prisma.salesStockOrder.aggregate({
            where: outboundAggregateWhere,
            _sum: { totalQty: true, totalAmount: true },
          })
        : Promise.resolve(emptyDocumentAggregate),
      workshopMaterialAggregateWhere
        ? this.prisma.workshopMaterialOrder.aggregate({
            where: workshopMaterialAggregateWhere,
            _sum: { totalQty: true, totalAmount: true },
          })
        : Promise.resolve(emptyDocumentAggregate),
    ]);

    return {
      inboundTodayCount,
      outboundTodayCount,
      workshopMaterialTodayCount,
      inboundTotalQty: inboundAggregate._sum.totalQty,
      inboundTotalAmount: inboundAggregate._sum.totalAmount,
      outboundTotalQty: outboundAggregate._sum.totalQty,
      outboundTotalAmount: outboundAggregate._sum.totalAmount,
      workshopMaterialTotalQty: workshopMaterialAggregate._sum.totalQty,
      workshopMaterialTotalAmount: workshopMaterialAggregate._sum.totalAmount,
    };
  }

  private buildInboundWhere(
    stockScope?: StockScopeCode,
    extra?: Omit<Prisma.StockInOrderWhereInput, "lifecycleStatus">,
  ): Prisma.StockInOrderWhereInput | null {
    if (stockScope === "RD_SUB") {
      return null;
    }

    return {
      lifecycleStatus: DocumentLifecycleStatus.EFFECTIVE,
      ...(stockScope
        ? {
            stockScope: {
              is: {
                scopeCode: stockScope,
              },
            },
          }
        : {}),
      ...extra,
    };
  }

  private buildOutboundWhere(
    stockScope?: StockScopeCode,
    extra?: Omit<
      Prisma.SalesStockOrderWhereInput,
      "lifecycleStatus" | "orderType"
    >,
  ): Prisma.SalesStockOrderWhereInput | null {
    if (stockScope === "RD_SUB") {
      return null;
    }

    return {
      orderType: SalesStockOrderType.OUTBOUND,
      lifecycleStatus: DocumentLifecycleStatus.EFFECTIVE,
      ...(stockScope
        ? {
            stockScope: {
              is: {
                scopeCode: stockScope,
              },
            },
          }
        : {}),
      ...extra,
    };
  }

  private buildWorkshopMaterialWhere(
    stockScope?: StockScopeCode,
    extra?: Omit<
      Prisma.WorkshopMaterialOrderWhereInput,
      "lifecycleStatus" | "OR" | "orderType" | "workshop"
    >,
  ): Prisma.WorkshopMaterialOrderWhereInput | null {
    if (stockScope === "RD_SUB") {
      return {
        lifecycleStatus: DocumentLifecycleStatus.EFFECTIVE,
        orderType: WorkshopMaterialOrderType.SCRAP,
        stockScope: {
          is: {
            scopeCode: "RD_SUB",
          },
        },
        ...extra,
      };
    }

    if (stockScope === "MAIN") {
      return {
        lifecycleStatus: DocumentLifecycleStatus.EFFECTIVE,
        OR: [
          {
            orderType: {
              in: [
                WorkshopMaterialOrderType.PICK,
                WorkshopMaterialOrderType.RETURN,
              ],
            },
          },
          {
            orderType: WorkshopMaterialOrderType.SCRAP,
            stockScope: {
              is: {
                scopeCode: "MAIN",
              },
            },
          },
        ],
        stockScope: {
          is: {
            scopeCode: "MAIN",
          },
        },
        ...extra,
      };
    }

    return {
      lifecycleStatus: DocumentLifecycleStatus.EFFECTIVE,
      ...(stockScope
        ? {
            stockScope: {
              is: {
                scopeCode: stockScope,
              },
            },
          }
        : {}),
      orderType: {
        in: [
          WorkshopMaterialOrderType.PICK,
          WorkshopMaterialOrderType.RETURN,
          WorkshopMaterialOrderType.SCRAP,
        ],
      },
      ...extra,
    };
  }
}
