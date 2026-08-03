import { Injectable } from "@nestjs/common";
import {
  DocumentLifecycleStatus,
  Prisma,
  SalesStockOrderType,
  StockInOrderType,
  WorkshopMaterialOrderType,
} from "../../../../generated/prisma/client";
import { BusinessDocumentType } from "../../../shared/domain/business-document-type";
import { PrismaService } from "../../../shared/prisma/prisma.service";
import type { StockScopeCode } from "../../session/domain/user-session";
import {
  buildMonthlyReportStockScopeWhere,
  loadEffectiveInventoryCostByDocumentId,
} from "./reporting-repository.helpers";

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
    const salesTodayWhere = this.buildSalesWhere(params.stockScope, {
      bizDate: { gte: todayStart, lte: todayEnd },
    });
    const workshopMaterialTodayWhere = this.buildWorkshopMaterialWhere(
      params.stockScope,
      {
        bizDate: { gte: todayStart, lte: todayEnd },
      },
    );
    const inboundAggregateWhere = this.buildInboundWhere(params.stockScope);
    const salesAggregateWhere = this.buildSalesWhere(params.stockScope);
    const workshopAggregateWhere = this.buildWorkshopMaterialWhere(
      params.stockScope,
    );

    const [
      inboundTodayGroups,
      salesTodayGroups,
      workshopTodayGroups,
      inboundAmountGroups,
      salesAmountGroups,
      workshopOrders,
    ] = await Promise.all([
      inboundTodayWhere
        ? this.prisma.stockInOrder.groupBy({
            by: ["orderType"],
            where: inboundTodayWhere,
            _count: { _all: true },
          })
        : Promise.resolve([]),
      salesTodayWhere
        ? this.prisma.salesStockOrder.groupBy({
            by: ["orderType"],
            where: salesTodayWhere,
            _count: { _all: true },
          })
        : Promise.resolve([]),
      workshopMaterialTodayWhere
        ? this.prisma.workshopMaterialOrder.groupBy({
            by: ["orderType"],
            where: workshopMaterialTodayWhere,
            _count: { _all: true },
          })
        : Promise.resolve([]),
      inboundAggregateWhere
        ? this.prisma.stockInOrder.groupBy({
            by: ["orderType"],
            where: inboundAggregateWhere,
            _sum: { totalAmount: true },
          })
        : Promise.resolve([]),
      salesAggregateWhere
        ? this.prisma.salesStockOrder.groupBy({
            by: ["orderType"],
            where: salesAggregateWhere,
            _sum: { totalAmount: true },
          })
        : Promise.resolve([]),
      workshopAggregateWhere
        ? this.prisma.workshopMaterialOrder.findMany({
            where: workshopAggregateWhere,
            select: { id: true, orderType: true },
          })
        : Promise.resolve([]),
    ]);
    const workshopCostByDocumentId =
      await loadEffectiveInventoryCostByDocumentId(
        this.prisma,
        BusinessDocumentType.WorkshopMaterialOrder,
        workshopOrders.map((order) => order.id),
      );
    const sumWorkshopCost = (orderType: WorkshopMaterialOrderType) =>
      workshopOrders
        .filter((order) => order.orderType === orderType)
        .reduce(
          (total, order) =>
            total.add(
              workshopCostByDocumentId.get(order.id) ?? new Prisma.Decimal(0),
            ),
          new Prisma.Decimal(0),
        );

    return {
      acceptanceTodayCount: this.resolveCount(
        inboundTodayGroups,
        StockInOrderType.ACCEPTANCE,
      ),
      productionReceiptTodayCount: this.resolveCount(
        inboundTodayGroups,
        StockInOrderType.PRODUCTION_RECEIPT,
      ),
      supplierReturnTodayCount: this.resolveCount(
        inboundTodayGroups,
        StockInOrderType.SUPPLIER_RETURN,
      ),
      salesOutboundTodayCount: this.resolveCount(
        salesTodayGroups,
        SalesStockOrderType.OUTBOUND,
      ),
      salesReturnTodayCount: this.resolveCount(
        salesTodayGroups,
        SalesStockOrderType.SALES_RETURN,
      ),
      workshopPickTodayCount: this.resolveCount(
        workshopTodayGroups,
        WorkshopMaterialOrderType.PICK,
      ),
      workshopReturnTodayCount: this.resolveCount(
        workshopTodayGroups,
        WorkshopMaterialOrderType.RETURN,
      ),
      workshopScrapTodayCount: this.resolveCount(
        workshopTodayGroups,
        WorkshopMaterialOrderType.SCRAP,
      ),
      acceptanceTotalAmount: this.resolveAmount(
        inboundAmountGroups,
        StockInOrderType.ACCEPTANCE,
      ),
      productionReceiptTotalAmount: this.resolveAmount(
        inboundAmountGroups,
        StockInOrderType.PRODUCTION_RECEIPT,
      ),
      supplierReturnTotalAmount: this.resolveAmount(
        inboundAmountGroups,
        StockInOrderType.SUPPLIER_RETURN,
      ),
      salesOutboundTotalAmount: this.resolveAmount(
        salesAmountGroups,
        SalesStockOrderType.OUTBOUND,
      ),
      salesReturnTotalAmount: this.resolveAmount(
        salesAmountGroups,
        SalesStockOrderType.SALES_RETURN,
      ),
      workshopPickCostAmount: sumWorkshopCost(WorkshopMaterialOrderType.PICK),
      workshopReturnCostAmount: sumWorkshopCost(
        WorkshopMaterialOrderType.RETURN,
      ),
      workshopScrapCostAmount: sumWorkshopCost(WorkshopMaterialOrderType.SCRAP),
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
      ...buildMonthlyReportStockScopeWhere(stockScope),
      ...extra,
    };
  }

  private buildSalesWhere(
    stockScope?: StockScopeCode,
    extra?: Omit<Prisma.SalesStockOrderWhereInput, "lifecycleStatus">,
  ): Prisma.SalesStockOrderWhereInput | null {
    if (stockScope === "RD_SUB") {
      return null;
    }

    return {
      lifecycleStatus: DocumentLifecycleStatus.EFFECTIVE,
      ...buildMonthlyReportStockScopeWhere(stockScope),
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
        ...buildMonthlyReportStockScopeWhere("MAIN"),
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

    return {
      lifecycleStatus: DocumentLifecycleStatus.EFFECTIVE,
      ...buildMonthlyReportStockScopeWhere(stockScope),
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

  private resolveCount<T extends string>(
    groups: Array<{ orderType: T; _count: { _all: number } }>,
    orderType: T,
  ): number {
    return (
      groups.find((item) => item.orderType === orderType)?._count._all ?? 0
    );
  }

  private resolveAmount<T extends string>(
    groups: Array<{
      orderType: T;
      _sum: { totalAmount: Prisma.Decimal | null };
    }>,
    orderType: T,
  ): Prisma.Decimal {
    return new Prisma.Decimal(
      groups.find((item) => item.orderType === orderType)?._sum.totalAmount ??
        0,
    );
  }
}
