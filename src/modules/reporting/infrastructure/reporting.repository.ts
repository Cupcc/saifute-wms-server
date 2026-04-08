import { Injectable } from "@nestjs/common";
import {
  CustomerStockOrderType,
  DocumentLifecycleStatus,
  MasterDataStatus,
  Prisma,
  WorkshopMaterialOrderType,
} from "../../../generated/prisma/client";
import { PrismaService } from "../../../shared/prisma/prisma.service";
import type { StockScopeCode } from "../../session/domain/user-session";

export interface InventoryBalanceSnapshot {
  id: number;
  quantityOnHand: Prisma.Decimal;
  updatedAt: Date;
  stockScope: {
    id: number;
    scopeCode: string;
    scopeName: string;
  } | null;
  material: {
    id: number;
    materialCode: string;
    materialName: string;
    specModel: string | null;
    unitCode: string;
    warningMinQty: Prisma.Decimal | null;
    warningMaxQty: Prisma.Decimal | null;
    category: {
      id: number;
      categoryCode: string;
      categoryName: string;
    } | null;
  };
  workshop: {
    id: number;
    workshopName: string;
  } | null;
}

export interface TrendDocumentSnapshot {
  sourceType: "INBOUND" | "OUTBOUND" | "WORKSHOP_MATERIAL";
  bizDate: Date;
  totalQty: Prisma.Decimal;
  totalAmount: Prisma.Decimal;
}

@Injectable()
export class ReportingRepository {
  constructor(private readonly prisma: PrismaService) {}

  async getHomeMetrics(
    todayStart: Date,
    todayEnd: Date,
    params: {
      stockScope?: StockScopeCode;
      inventoryStockScopeIds: number[];
    },
  ) {
    const inventoryStockScopeFilter = this.buildInventoryStockScopeFilter(
      params.inventoryStockScopeIds,
    );
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
      activeMaterialCount,
      activeWorkshopCount,
      totalInventoryAggregate,
      inventoryBalances,
      inboundTodayCount,
      outboundTodayCount,
      workshopMaterialTodayCount,
      inboundAggregate,
      outboundAggregate,
      workshopMaterialAggregate,
    ] = await Promise.all([
      this.prisma.inventoryBalance
        .findMany({
          where: {
            stockScopeId: inventoryStockScopeFilter,
            material: {
              status: MasterDataStatus.ACTIVE,
            },
          },
          distinct: ["materialId"],
          select: {
            materialId: true,
          },
        })
        .then((items) => items.length),
      this.prisma.stockScope.count({
        where: {
          status: MasterDataStatus.ACTIVE,
          id: inventoryStockScopeFilter,
        },
      }),
      this.prisma.inventoryBalance.aggregate({
        where: { stockScopeId: inventoryStockScopeFilter },
        _sum: { quantityOnHand: true },
      }),
      this.prisma.inventoryBalance.findMany({
        where: { stockScopeId: inventoryStockScopeFilter },
        include: {
          stockScope: true,
          material: {
            select: {
              warningMinQty: true,
            },
          },
        },
      }),
      inboundTodayWhere
        ? this.prisma.stockInOrder.count({
            where: inboundTodayWhere,
          })
        : Promise.resolve(0),
      outboundTodayWhere
        ? this.prisma.customerStockOrder.count({
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
        ? this.prisma.customerStockOrder.aggregate({
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
      activeMaterialCount,
      activeWorkshopCount,
      totalInventoryQty: totalInventoryAggregate._sum.quantityOnHand,
      lowStockCount: inventoryBalances.filter((item) => {
        if (!item.material.warningMinQty) {
          return false;
        }

        return new Prisma.Decimal(item.quantityOnHand).lt(
          item.material.warningMinQty,
        );
      }).length,
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

  async findInventoryBalanceSnapshots(params: {
    keyword?: string;
    categoryId?: number;
    inventoryStockScopeIds: number[];
  }): Promise<InventoryBalanceSnapshot[]> {
    return this.prisma.inventoryBalance.findMany({
      where: {
        stockScopeId: this.buildInventoryStockScopeFilter(
          params.inventoryStockScopeIds,
        ),
        material: {
          status: MasterDataStatus.ACTIVE,
          categoryId: params.categoryId,
          OR: params.keyword
            ? [
                { materialCode: { contains: params.keyword } },
                { materialName: { contains: params.keyword } },
              ]
            : undefined,
        },
      },
      include: {
        stockScope: true,
        material: {
          include: {
            category: true,
          },
        },
        workshop: true,
      },
      orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
    });
  }

  async findTrendDocuments(params: {
    dateFrom: Date;
    dateTo: Date;
    stockScope?: StockScopeCode;
  }): Promise<TrendDocumentSnapshot[]> {
    const inboundWhere = this.buildInboundWhere(params.stockScope, {
      bizDate: { gte: params.dateFrom, lte: params.dateTo },
    });
    const outboundWhere = this.buildOutboundWhere(params.stockScope, {
      bizDate: { gte: params.dateFrom, lte: params.dateTo },
    });
    const workshopMaterialWhere = this.buildWorkshopMaterialWhere(
      params.stockScope,
      {
        bizDate: { gte: params.dateFrom, lte: params.dateTo },
      },
    );
    const [inbound, outbound, workshopMaterial] = await Promise.all([
      inboundWhere
        ? this.prisma.stockInOrder.findMany({
            where: inboundWhere,
            select: {
              bizDate: true,
              totalQty: true,
              totalAmount: true,
            },
          })
        : Promise.resolve([]),
      outboundWhere
        ? this.prisma.customerStockOrder.findMany({
            where: outboundWhere,
            select: {
              bizDate: true,
              totalQty: true,
              totalAmount: true,
            },
          })
        : Promise.resolve([]),
      workshopMaterialWhere
        ? this.prisma.workshopMaterialOrder.findMany({
            where: workshopMaterialWhere,
            select: {
              bizDate: true,
              totalQty: true,
              totalAmount: true,
            },
          })
        : Promise.resolve([]),
    ]);

    return [
      ...inbound.map((item) => ({
        sourceType: "INBOUND" as const,
        bizDate: item.bizDate,
        totalQty: item.totalQty,
        totalAmount: item.totalAmount,
      })),
      ...outbound.map((item) => ({
        sourceType: "OUTBOUND" as const,
        bizDate: item.bizDate,
        totalQty: item.totalQty,
        totalAmount: item.totalAmount,
      })),
      ...workshopMaterial.map((item) => ({
        sourceType: "WORKSHOP_MATERIAL" as const,
        bizDate: item.bizDate,
        totalQty: item.totalQty,
        totalAmount: item.totalAmount,
      })),
    ];
  }

  private buildInventoryStockScopeFilter(stockScopeIds: number[]) {
    return stockScopeIds.length === 1
      ? stockScopeIds[0]
      : { in: stockScopeIds };
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
      Prisma.CustomerStockOrderWhereInput,
      "lifecycleStatus" | "orderType"
    >,
  ): Prisma.CustomerStockOrderWhereInput | null {
    if (stockScope === "RD_SUB") {
      return null;
    }

    return {
      orderType: CustomerStockOrderType.OUTBOUND,
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
