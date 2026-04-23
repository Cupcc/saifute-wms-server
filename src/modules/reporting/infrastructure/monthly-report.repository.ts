import { Injectable } from "@nestjs/common";
import {
  DocumentLifecycleStatus,
  Prisma,
  SalesStockOrderType,
  StockInOrderType,
  WorkshopMaterialOrderType,
} from "../../../../generated/prisma/client";
import { AppConfigService } from "../../../shared/config/app-config.service";
import { BusinessDocumentType } from "../../../shared/domain/business-document-type";
import { PrismaService } from "../../../shared/prisma/prisma.service";
import type { StockScopeCode } from "../../session/domain/user-session";
import {
  type MonthlyReportEntry,
  MonthlyReportingAbnormalFlag,
  MonthlyReportingDirection,
  MonthlyReportingTopicKey,
} from "../application/monthly-reporting.shared";
import {
  buildAbnormalFlags,
  collectDistinctNumbers,
  collectDistinctStrings,
  loadSalesOrderSourceMap,
  loadWorkshopOrderSourceMap,
  resolveSourceReference,
  sumNullableDecimals,
  toDecimal,
  toStockScopeCode,
  toWorkshopDocumentLabel,
  toWorkshopTopicKey,
} from "./reporting-repository.helpers";
import { MonthlyReportRdRepository } from "./monthly-report-rd.repository";
import { MonthlyReportAdjustmentRepository } from "./monthly-report-adjustment.repository";
export interface MonthlySalesProjectEntry {
  salesProjectId: number | null;
  salesProjectCode: string | null;
  salesProjectName: string | null;
  topicKey: MonthlyReportingTopicKey.SALES_OUTBOUND | MonthlyReportingTopicKey.SALES_RETURN;
  documentTypeLabel: string;
  documentId: number;
  documentNo: string;
  bizDate: Date;
  createdAt: Date;
  quantity: Prisma.Decimal;
  amount: Prisma.Decimal;
  cost: Prisma.Decimal;
  abnormalFlags: MonthlyReportingAbnormalFlag[];
}

@Injectable()
export class MonthlyReportRepository {
  private readonly rdRepo: MonthlyReportRdRepository;
  private readonly adjustmentRepo: MonthlyReportAdjustmentRepository;

  constructor(
    private readonly prisma: PrismaService,
    private readonly appConfigService: AppConfigService,
  ) {
    this.rdRepo = new MonthlyReportRdRepository(prisma, appConfigService);
    this.adjustmentRepo = new MonthlyReportAdjustmentRepository(prisma, appConfigService);
  }

  async findMonthlyReportEntries(params: {
    start: Date;
    end: Date;
    stockScope?: StockScopeCode;
    workshopId?: number;
  }): Promise<MonthlyReportEntry[]> {
    const [
      inboundEntries,
      salesEntries,
      workshopEntries,
      rdProjectEntries,
      rdHandoffEntries,
      rdStocktakeEntries,
      priceCorrectionEntries,
    ] = await Promise.all([
      this.findInboundMonthlyEntries(params),
      this.findSalesMonthlyEntries(params),
      this.findWorkshopMonthlyEntries(params),
      this.rdRepo.findRdProjectMonthlyEntries(params),
      this.rdRepo.findRdHandoffMonthlyEntries(params),
      this.adjustmentRepo.findRdStocktakeMonthlyEntries(params),
      this.adjustmentRepo.findPriceCorrectionMonthlyEntries(params),
    ]);

    return [
      ...inboundEntries,
      ...salesEntries,
      ...workshopEntries,
      ...rdProjectEntries,
      ...rdHandoffEntries,
      ...rdStocktakeEntries,
      ...priceCorrectionEntries,
    ];
  }

  async findMonthlySalesProjectEntries(params: {
    start: Date;
    end: Date;
    stockScope?: StockScopeCode;
    workshopId?: number;
  }): Promise<MonthlySalesProjectEntry[]> {
    const lines = await this.prisma.salesStockOrderLine.findMany({
      where: {
        order: {
          lifecycleStatus: DocumentLifecycleStatus.EFFECTIVE,
          bizDate: { gte: params.start, lte: params.end },
          ...(params.stockScope
            ? {
                stockScope: {
                  is: {
                    scopeCode: params.stockScope,
                  },
                },
              }
            : {}),
          ...(params.workshopId ? { workshopId: params.workshopId } : {}),
        },
      },
      include: {
        order: {
          select: {
            id: true,
            documentNo: true,
            bizDate: true,
            createdAt: true,
            orderType: true,
          },
        },
      },
      orderBy: [{ orderId: "asc" }, { lineNo: "asc" }],
    });

    const sourceOrderIds = [
      ...new Set(
        lines
          .filter(
            (line) =>
              line.order.orderType === SalesStockOrderType.SALES_RETURN &&
              typeof line.sourceDocumentId === "number",
          )
          .map((line) => line.sourceDocumentId as number),
      ),
    ];
    const sourceOrderMap = await loadSalesOrderSourceMap(this.prisma, sourceOrderIds);
    const sourceRefsByOrder = new Map<
      number,
      Array<{ bizDate: Date; documentNo: string }>
    >();

    for (const line of lines) {
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

      const current = sourceRefsByOrder.get(line.orderId) ?? [];
      current.push(source);
      sourceRefsByOrder.set(line.orderId, current);
    }

    return lines.map((line) => {
      const sourceReference = resolveSourceReference(
        line.order.bizDate,
        sourceRefsByOrder.get(line.orderId) ?? [],
        this.appConfigService.businessTimezone,
      );

      return {
        salesProjectId: line.salesProjectId ?? null,
        salesProjectCode: line.salesProjectCodeSnapshot ?? null,
        salesProjectName: line.salesProjectNameSnapshot ?? null,
        topicKey:
          line.order.orderType === SalesStockOrderType.OUTBOUND
            ? MonthlyReportingTopicKey.SALES_OUTBOUND
            : MonthlyReportingTopicKey.SALES_RETURN,
        documentTypeLabel:
          line.order.orderType === SalesStockOrderType.OUTBOUND
            ? "销售出库单"
            : "销售退货单",
        documentId: line.order.id,
        documentNo: line.order.documentNo,
        bizDate: line.order.bizDate,
        createdAt: line.order.createdAt,
        quantity: line.quantity,
        amount: line.amount,
        cost: toDecimal(line.costAmount),
        abnormalFlags: buildAbnormalFlags({
          bizDate: line.order.bizDate,
          createdAt: line.order.createdAt,
          sourceBizDate: sourceReference.sourceBizDate,
        }, this.appConfigService.businessTimezone),
      };
    });
  }

  private async findInboundMonthlyEntries(params: {
    start: Date;
    end: Date;
    stockScope?: StockScopeCode;
    workshopId?: number;
  }): Promise<MonthlyReportEntry[]> {
    const orders = await this.prisma.stockInOrder.findMany({
      where: {
        lifecycleStatus: DocumentLifecycleStatus.EFFECTIVE,
        bizDate: { gte: params.start, lte: params.end },
        ...(params.stockScope
          ? {
              stockScope: {
                is: {
                  scopeCode: params.stockScope,
                },
              },
            }
          : {}),
        ...(params.workshopId ? { workshopId: params.workshopId } : {}),
      },
      include: {
        stockScope: true,
        workshop: true,
      },
      orderBy: [{ bizDate: "asc" }, { id: "asc" }],
    });

    return orders.map((order) => ({
      topicKey:
        order.orderType === StockInOrderType.ACCEPTANCE
          ? MonthlyReportingTopicKey.ACCEPTANCE_INBOUND
          : MonthlyReportingTopicKey.PRODUCTION_RECEIPT,
      direction: MonthlyReportingDirection.IN,
      documentType: BusinessDocumentType.StockInOrder,
      documentTypeLabel:
        order.orderType === StockInOrderType.ACCEPTANCE ? "验收单" : "生产入库单",
      documentId: order.id,
      documentNo: order.documentNo,
      bizDate: order.bizDate,
      createdAt: order.createdAt,
      stockScope: toStockScopeCode(order.stockScope?.scopeCode),
      stockScopeName: order.stockScope?.scopeName ?? null,
      workshopId: order.workshopId ?? null,
      workshopName: order.workshop?.workshopName ?? order.workshopNameSnapshot,
      salesProjectIds: [],
      salesProjectCodes: [],
      salesProjectNames: [],
      rdProjectId: null,
      rdProjectCode: null,
      rdProjectName: null,
      sourceStockScopeName: null,
      targetStockScopeName: null,
      sourceWorkshopName: null,
      targetWorkshopName: null,
      quantity: order.totalQty,
      amount: order.totalAmount,
      cost: order.totalAmount,
      abnormalFlags: buildAbnormalFlags({
        bizDate: order.bizDate,
        createdAt: order.createdAt,
      }, this.appConfigService.businessTimezone),
      sourceBizDate: null,
      sourceDocumentNo: null,
    }));
  }

  private async findSalesMonthlyEntries(params: {
    start: Date;
    end: Date;
    stockScope?: StockScopeCode;
    workshopId?: number;
  }): Promise<MonthlyReportEntry[]> {
    const orders = await this.prisma.salesStockOrder.findMany({
      where: {
        lifecycleStatus: DocumentLifecycleStatus.EFFECTIVE,
        bizDate: { gte: params.start, lte: params.end },
        ...(params.stockScope
          ? {
              stockScope: {
                is: {
                  scopeCode: params.stockScope,
                },
              },
            }
          : {}),
        ...(params.workshopId ? { workshopId: params.workshopId } : {}),
      },
      include: {
        stockScope: true,
        workshop: true,
        lines: {
          select: {
            costAmount: true,
            sourceDocumentId: true,
            salesProjectId: true,
            salesProjectCodeSnapshot: true,
            salesProjectNameSnapshot: true,
          },
        },
      },
      orderBy: [{ bizDate: "asc" }, { id: "asc" }],
    });

    const sourceOrderIds = [
      ...new Set(
        orders.flatMap((order) =>
          order.orderType === SalesStockOrderType.SALES_RETURN
            ? order.lines
                .map((line) => line.sourceDocumentId)
                .filter((value): value is number => typeof value === "number")
            : [],
        ),
      ),
    ];
    const sourceOrderMap = await loadSalesOrderSourceMap(this.prisma, sourceOrderIds);

    return orders.map((order) => {
      const sourceReference = resolveSourceReference(
        order.bizDate,
        order.lines
          .map((line) =>
            typeof line.sourceDocumentId === "number"
              ? sourceOrderMap.get(line.sourceDocumentId) ?? null
              : null,
          )
          .filter((value): value is { bizDate: Date; documentNo: string } =>
            value !== null,
          ),
        this.appConfigService.businessTimezone,
      );

      return {
        topicKey:
          order.orderType === SalesStockOrderType.OUTBOUND
            ? MonthlyReportingTopicKey.SALES_OUTBOUND
            : MonthlyReportingTopicKey.SALES_RETURN,
        direction:
          order.orderType === SalesStockOrderType.OUTBOUND
            ? MonthlyReportingDirection.OUT
            : MonthlyReportingDirection.IN,
        documentType: BusinessDocumentType.SalesStockOrder,
        documentTypeLabel:
          order.orderType === SalesStockOrderType.OUTBOUND
            ? "销售出库单"
            : "销售退货单",
        documentId: order.id,
        documentNo: order.documentNo,
        bizDate: order.bizDate,
        createdAt: order.createdAt,
        stockScope: toStockScopeCode(order.stockScope?.scopeCode),
        stockScopeName: order.stockScope?.scopeName ?? null,
        workshopId: order.workshopId,
        workshopName: order.workshop.workshopName,
        salesProjectIds: collectDistinctNumbers(
          order.lines.map((line) => line.salesProjectId),
        ),
        salesProjectCodes: collectDistinctStrings(
          order.lines.map((line) => line.salesProjectCodeSnapshot),
        ),
        salesProjectNames: collectDistinctStrings(
          order.lines.map((line) => line.salesProjectNameSnapshot),
        ),
        rdProjectId: null,
        rdProjectCode: null,
        rdProjectName: null,
        sourceStockScopeName: null,
        targetStockScopeName: null,
        sourceWorkshopName: null,
        targetWorkshopName: null,
        quantity: order.totalQty,
        amount: order.totalAmount,
        cost: sumNullableDecimals(order.lines.map((line) => line.costAmount)),
        abnormalFlags: buildAbnormalFlags({
          bizDate: order.bizDate,
          createdAt: order.createdAt,
          sourceBizDate: sourceReference.sourceBizDate,
        }, this.appConfigService.businessTimezone),
        sourceBizDate: sourceReference.sourceBizDate,
        sourceDocumentNo: sourceReference.sourceDocumentNo,
      };
    });
  }

  private async findWorkshopMonthlyEntries(params: {
    start: Date;
    end: Date;
    stockScope?: StockScopeCode;
    workshopId?: number;
  }): Promise<MonthlyReportEntry[]> {
    const orders = await this.prisma.workshopMaterialOrder.findMany({
      where: {
        lifecycleStatus: DocumentLifecycleStatus.EFFECTIVE,
        bizDate: { gte: params.start, lte: params.end },
        ...(params.stockScope
          ? {
              stockScope: {
                is: {
                  scopeCode: params.stockScope,
                },
              },
            }
          : {}),
        ...(params.workshopId ? { workshopId: params.workshopId } : {}),
      },
      include: {
        stockScope: true,
        workshop: true,
        lines: {
          select: {
            costAmount: true,
            sourceDocumentId: true,
            sourceDocumentType: true,
          },
        },
      },
      orderBy: [{ bizDate: "asc" }, { id: "asc" }],
    });

    const sourceOrderIds = [
      ...new Set(
        orders.flatMap((order) =>
          order.lines
            .filter(
              (line) =>
                line.sourceDocumentType ===
                BusinessDocumentType.WorkshopMaterialOrder,
            )
            .map((line) => line.sourceDocumentId)
            .filter((value): value is number => typeof value === "number"),
        ),
      ),
    ];
    const sourceOrderMap =
      await loadWorkshopOrderSourceMap(this.prisma, sourceOrderIds);

    return orders.map((order) => {
      const sourceReference = resolveSourceReference(
        order.bizDate,
        order.lines
          .filter(
            (line) =>
              line.sourceDocumentType ===
              BusinessDocumentType.WorkshopMaterialOrder,
          )
          .map((line) =>
            typeof line.sourceDocumentId === "number"
              ? sourceOrderMap.get(line.sourceDocumentId) ?? null
              : null,
          )
          .filter((value): value is { bizDate: Date; documentNo: string } =>
            value !== null,
          ),
        this.appConfigService.businessTimezone,
      );

      return {
        topicKey: toWorkshopTopicKey(order.orderType),
        direction:
          order.orderType === WorkshopMaterialOrderType.RETURN
            ? MonthlyReportingDirection.IN
            : MonthlyReportingDirection.OUT,
        documentType: BusinessDocumentType.WorkshopMaterialOrder,
        documentTypeLabel: toWorkshopDocumentLabel(order.orderType),
        documentId: order.id,
        documentNo: order.documentNo,
        bizDate: order.bizDate,
        createdAt: order.createdAt,
        stockScope: toStockScopeCode(order.stockScope?.scopeCode),
        stockScopeName: order.stockScope?.scopeName ?? null,
        workshopId: order.workshopId,
        workshopName: order.workshop.workshopName,
        salesProjectIds: [],
        salesProjectCodes: [],
        salesProjectNames: [],
        rdProjectId: null,
        rdProjectCode: null,
        rdProjectName: null,
        sourceStockScopeName: null,
        targetStockScopeName: null,
        sourceWorkshopName: null,
        targetWorkshopName: null,
        quantity: order.totalQty,
        amount: order.totalAmount,
        cost: sumNullableDecimals(order.lines.map((line) => line.costAmount)),
        abnormalFlags: buildAbnormalFlags({
          bizDate: order.bizDate,
          createdAt: order.createdAt,
          sourceBizDate: sourceReference.sourceBizDate,
        }, this.appConfigService.businessTimezone),
        sourceBizDate: sourceReference.sourceBizDate,
        sourceDocumentNo: sourceReference.sourceDocumentNo,
      };
    });
  }
}
