import { Injectable } from "@nestjs/common";
import {
  DocumentLifecycleStatus,
  Prisma,
  SalesStockOrderType,
  StockInOrderType,
} from "../../../../generated/prisma/client";
import { AppConfigService } from "../../../shared/config/app-config.service";
import { BusinessDocumentType } from "../../../shared/domain/business-document-type";
import { PrismaService } from "../../../shared/prisma/prisma.service";
import type { StockScopeCode } from "../../session/domain/user-session";
import {
  type MonthlyMaterialCategoryEntry,
  MonthlyReportingDirection,
  MonthlyReportingTopicKey,
} from "../application/monthly-reporting.shared";
import {
  parseMaterialCategoryPathSnapshot,
  resolveMaterialCategoryLineAmount,
  resolveMaterialCategorySalesCostAmount,
} from "./monthly-material-category.helpers";
import { MonthlyMaterialCategoryWorkshopRepository } from "./monthly-material-category-workshop.repository";
import {
  buildAbnormalFlags,
  buildMonthlyReportStockScopeWhere,
  loadSalesOrderSourceMap,
  resolveMonthlyReportStockScopeCode,
  resolveMonthlyReportStockScopeName,
  resolveSourceReference,
  toDecimal,
} from "./reporting-repository.helpers";

@Injectable()
export class MonthlyMaterialCategoryRepository {
  constructor(
    private readonly prisma: PrismaService,
    private readonly appConfigService: AppConfigService,
    private readonly workshopRepository?: MonthlyMaterialCategoryWorkshopRepository,
  ) {}

  async findMonthlyMaterialCategoryEntries(params: {
    start: Date;
    end: Date;
    stockScope?: StockScopeCode;
    workshopId?: number;
  }): Promise<MonthlyMaterialCategoryEntry[]> {
    const [inboundLines, salesLines, workshopEntries] = await Promise.all([
      this.prisma.stockInOrderLine.findMany({
        where: {
          order: {
            lifecycleStatus: DocumentLifecycleStatus.EFFECTIVE,
            orderType: {
              in: [
                StockInOrderType.ACCEPTANCE,
                StockInOrderType.PRODUCTION_RECEIPT,
                StockInOrderType.SUPPLIER_RETURN,
              ],
            },
            bizDate: { gte: params.start, lte: params.end },
            ...buildMonthlyReportStockScopeWhere(params.stockScope),
            ...(params.workshopId ? { workshopId: params.workshopId } : {}),
          },
        },
        select: {
          id: true,
          lineNo: true,
          materialId: true,
          materialCodeSnapshot: true,
          materialNameSnapshot: true,
          materialSpecSnapshot: true,
          unitCodeSnapshot: true,
          quantity: true,
          unitPrice: true,
          amount: true,
          materialCategoryIdSnapshot: true,
          materialCategoryCodeSnapshot: true,
          materialCategoryNameSnapshot: true,
          materialCategoryPathSnapshot: true,
          order: {
            select: {
              id: true,
              documentNo: true,
              bizDate: true,
              createdAt: true,
              orderType: true,
              stockScope: {
                select: {
                  scopeCode: true,
                  scopeName: true,
                },
              },
              workshopId: true,
              workshopNameSnapshot: true,
              workshop: {
                select: {
                  workshopName: true,
                },
              },
            },
          },
        },
        orderBy: [{ orderId: "asc" }, { lineNo: "asc" }],
      }),
      this.prisma.salesStockOrderLine.findMany({
        where: {
          order: {
            lifecycleStatus: DocumentLifecycleStatus.EFFECTIVE,
            bizDate: { gte: params.start, lte: params.end },
            ...buildMonthlyReportStockScopeWhere(params.stockScope),
            ...(params.workshopId ? { workshopId: params.workshopId } : {}),
          },
        },
        select: {
          id: true,
          lineNo: true,
          materialId: true,
          materialCodeSnapshot: true,
          materialNameSnapshot: true,
          materialSpecSnapshot: true,
          unitCodeSnapshot: true,
          quantity: true,
          unitPrice: true,
          amount: true,
          selectedUnitCost: true,
          costAmount: true,
          salesProjectId: true,
          salesProjectCodeSnapshot: true,
          salesProjectNameSnapshot: true,
          sourceDocumentId: true,
          materialCategoryIdSnapshot: true,
          materialCategoryCodeSnapshot: true,
          materialCategoryNameSnapshot: true,
          materialCategoryPathSnapshot: true,
          order: {
            select: {
              id: true,
              documentNo: true,
              bizDate: true,
              createdAt: true,
              orderType: true,
              stockScope: {
                select: {
                  scopeCode: true,
                  scopeName: true,
                },
              },
              workshopId: true,
              workshopNameSnapshot: true,
              workshop: {
                select: {
                  workshopName: true,
                },
              },
            },
          },
        },
        orderBy: [{ orderId: "asc" }, { lineNo: "asc" }],
      }),
      this.canLoadWorkshopMaterialOrderLines() && this.workshopRepository
        ? this.workshopRepository.findWorkshopMaterialCategoryEntries(params)
        : Promise.resolve([]),
    ]);

    const sourceOrderIds = [
      ...new Set(
        salesLines
          .filter(
            (line) =>
              line.order.orderType === SalesStockOrderType.SALES_RETURN &&
              typeof line.sourceDocumentId === "number",
          )
          .map((line) => line.sourceDocumentId as number),
      ),
    ];
    const sourceOrderMap = await loadSalesOrderSourceMap(
      this.prisma,
      sourceOrderIds,
    );
    const salesCostAmountByLineId = await this.loadSalesCostAmountByLineId(
      salesLines.map((line) => line.id),
    );
    const sourceRefsByOrder = new Map<
      number,
      Array<{ bizDate: Date; documentNo: string }>
    >();

    for (const line of salesLines) {
      if (
        line.order.orderType !== SalesStockOrderType.SALES_RETURN ||
        typeof line.sourceDocumentId !== "number"
      ) {
        continue;
      }

      const source = sourceOrderMap.get(line.sourceDocumentId);
      if (!source) {
        continue;
      }

      const current = sourceRefsByOrder.get(line.order.id) ?? [];
      current.push(source);
      sourceRefsByOrder.set(line.order.id, current);
    }

    const inboundEntries = inboundLines.map((line) => {
      const lineAmount = resolveMaterialCategoryLineAmount(
        line.amount,
        line.quantity,
        line.unitPrice,
      );
      const categoryPath = parseMaterialCategoryPathSnapshot(
        line.materialCategoryPathSnapshot,
        {
          id: line.materialCategoryIdSnapshot ?? null,
          categoryCode: line.materialCategoryCodeSnapshot ?? null,
          categoryName: line.materialCategoryNameSnapshot?.trim() || "未分类",
        },
      );
      const leafCategory = categoryPath.at(-1) ?? {
        id: line.materialCategoryIdSnapshot ?? null,
        categoryCode: line.materialCategoryCodeSnapshot ?? null,
        categoryName: line.materialCategoryNameSnapshot?.trim() || "未分类",
      };

      return {
        topicKey: this.resolveStockInTopicKey(line.order.orderType),
        direction:
          line.order.orderType === StockInOrderType.SUPPLIER_RETURN
            ? MonthlyReportingDirection.OUT
            : MonthlyReportingDirection.IN,
        documentType: BusinessDocumentType.StockInOrder,
        documentTypeLabel: this.resolveStockInDocumentTypeLabel(
          line.order.orderType,
        ),
        documentId: line.order.id,
        documentNo: line.order.documentNo,
        documentLineId: line.id,
        lineNo: line.lineNo,
        bizDate: line.order.bizDate,
        createdAt: line.order.createdAt,
        stockScope: resolveMonthlyReportStockScopeCode(
          line.order.stockScope?.scopeCode,
        ),
        stockScopeName: resolveMonthlyReportStockScopeName(
          line.order.stockScope?.scopeName,
        ),
        workshopId: line.order.workshopId ?? null,
        workshopName:
          line.order.workshop?.workshopName ??
          line.order.workshopNameSnapshot ??
          null,
        materialId: line.materialId,
        materialCode: line.materialCodeSnapshot,
        materialName: line.materialNameSnapshot,
        materialSpec: line.materialSpecSnapshot,
        unitCode: line.unitCodeSnapshot,
        categoryId: leafCategory.id,
        categoryCode: leafCategory.categoryCode,
        categoryName: leafCategory.categoryName,
        categoryPath,
        quantity: line.quantity,
        amount: lineAmount,
        cost: lineAmount,
        salesProjectId: null,
        salesProjectCode: null,
        salesProjectName: null,
        abnormalFlags: buildAbnormalFlags(
          {
            bizDate: line.order.bizDate,
            createdAt: line.order.createdAt,
          },
          this.appConfigService.businessTimezone,
        ),
        sourceBizDate: null,
        sourceDocumentNo: null,
      } satisfies MonthlyMaterialCategoryEntry;
    });

    const salesEntries = salesLines.map((line) => {
      const lineAmount = resolveMaterialCategoryLineAmount(
        line.amount,
        line.quantity,
        line.unitPrice,
      );
      const lineCost = resolveMaterialCategorySalesCostAmount({
        lineCostAmount: line.costAmount,
        inventoryCostAmount: salesCostAmountByLineId.get(line.id),
        quantity: line.quantity,
        selectedUnitCost: line.selectedUnitCost,
      });
      const sourceReference = resolveSourceReference(
        line.order.bizDate,
        sourceRefsByOrder.get(line.order.id) ?? [],
        this.appConfigService.businessTimezone,
      );
      const categoryPath = parseMaterialCategoryPathSnapshot(
        line.materialCategoryPathSnapshot,
        {
          id: line.materialCategoryIdSnapshot ?? null,
          categoryCode: line.materialCategoryCodeSnapshot ?? null,
          categoryName: line.materialCategoryNameSnapshot?.trim() || "未分类",
        },
      );
      const leafCategory = categoryPath.at(-1) ?? {
        id: line.materialCategoryIdSnapshot ?? null,
        categoryCode: line.materialCategoryCodeSnapshot ?? null,
        categoryName: line.materialCategoryNameSnapshot?.trim() || "未分类",
      };

      return {
        topicKey:
          line.order.orderType === SalesStockOrderType.OUTBOUND
            ? MonthlyReportingTopicKey.SALES_OUTBOUND
            : MonthlyReportingTopicKey.SALES_RETURN,
        direction:
          line.order.orderType === SalesStockOrderType.OUTBOUND
            ? MonthlyReportingDirection.OUT
            : MonthlyReportingDirection.IN,
        documentType: BusinessDocumentType.SalesStockOrder,
        documentTypeLabel:
          line.order.orderType === SalesStockOrderType.OUTBOUND
            ? "销售出库单"
            : "销售退货单",
        documentId: line.order.id,
        documentNo: line.order.documentNo,
        documentLineId: line.id,
        lineNo: line.lineNo,
        bizDate: line.order.bizDate,
        createdAt: line.order.createdAt,
        stockScope: resolveMonthlyReportStockScopeCode(
          line.order.stockScope?.scopeCode,
        ),
        stockScopeName: resolveMonthlyReportStockScopeName(
          line.order.stockScope?.scopeName,
        ),
        workshopId: line.order.workshopId,
        workshopName:
          line.order.workshop?.workshopName?.trim() ||
          line.order.workshopNameSnapshot?.trim() ||
          null,
        materialId: line.materialId,
        materialCode: line.materialCodeSnapshot,
        materialName: line.materialNameSnapshot,
        materialSpec: line.materialSpecSnapshot,
        unitCode: line.unitCodeSnapshot,
        categoryId: leafCategory.id,
        categoryCode: leafCategory.categoryCode,
        categoryName: leafCategory.categoryName,
        categoryPath,
        quantity: line.quantity,
        amount: lineAmount,
        cost: lineCost,
        salesProjectId: line.salesProjectId ?? null,
        salesProjectCode: line.salesProjectCodeSnapshot ?? null,
        salesProjectName: line.salesProjectNameSnapshot ?? null,
        abnormalFlags: buildAbnormalFlags(
          {
            bizDate: line.order.bizDate,
            createdAt: line.order.createdAt,
            sourceBizDate: sourceReference.sourceBizDate,
          },
          this.appConfigService.businessTimezone,
        ),
        sourceBizDate: sourceReference.sourceBizDate,
        sourceDocumentNo: sourceReference.sourceDocumentNo,
      } satisfies MonthlyMaterialCategoryEntry;
    });

    return [...inboundEntries, ...salesEntries, ...workshopEntries];
  }

  private resolveStockInTopicKey(orderType: StockInOrderType) {
    switch (orderType) {
      case StockInOrderType.ACCEPTANCE:
        return MonthlyReportingTopicKey.ACCEPTANCE_INBOUND;
      case StockInOrderType.PRODUCTION_RECEIPT:
        return MonthlyReportingTopicKey.PRODUCTION_RECEIPT;
      case StockInOrderType.SUPPLIER_RETURN:
        return MonthlyReportingTopicKey.SUPPLIER_RETURN;
    }
  }

  private resolveStockInDocumentTypeLabel(orderType: StockInOrderType) {
    switch (orderType) {
      case StockInOrderType.ACCEPTANCE:
        return "验收单";
      case StockInOrderType.PRODUCTION_RECEIPT:
        return "生产入库单";
      case StockInOrderType.SUPPLIER_RETURN:
        return "退厂单";
    }
  }

  private canLoadWorkshopMaterialOrderLines() {
    return "workshopMaterialOrderLine" in this.prisma;
  }

  private async loadSalesCostAmountByLineId(lineIds: number[]) {
    if (lineIds.length === 0) {
      return new Map<number, Prisma.Decimal>();
    }

    const groups = await this.prisma.inventoryLog.groupBy({
      by: ["businessDocumentLineId"],
      where: {
        businessDocumentType: BusinessDocumentType.SalesStockOrder,
        businessDocumentLineId: { in: lineIds },
      },
      _sum: {
        costAmount: true,
      },
    });

    return new Map(
      groups
        .filter((group) => typeof group.businessDocumentLineId === "number")
        .map((group) => [
          group.businessDocumentLineId as number,
          toDecimal(group._sum.costAmount),
        ]),
    );
  }
}
