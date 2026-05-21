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
  MonthlyReportingDirection,
  MonthlyReportingTopicKey,
} from "../application/monthly-reporting.shared";
import { MonthlyReportAdjustmentRepository } from "./monthly-report-adjustment.repository";
import { MonthlyReportRdRepository } from "./monthly-report-rd.repository";
import {
  buildMonthlyReportStockScopeWhere,
  collectDistinctNumbers,
  collectDistinctStrings,
  loadSalesOrderSourceMap,
  loadWorkshopOrderSourceMap,
  resolveMonthlyReportStockScopeCode,
  resolveMonthlyReportStockScopeName,
  resolveSourceReference,
  sumNullableDecimals,
  toDecimal,
  toWorkshopDocumentLabel,
  toWorkshopTopicKey,
} from "./reporting-repository.helpers";
export interface MonthlySalesProjectEntry {
  salesProjectId: number | null;
  salesProjectCode: string | null;
  salesProjectName: string | null;
  topicKey:
    | MonthlyReportingTopicKey.SALES_OUTBOUND
    | MonthlyReportingTopicKey.SALES_RETURN;
  documentTypeLabel: string;
  documentId: number;
  documentNo: string;
  bizDate: Date;
  createdAt: Date;
  quantity: Prisma.Decimal;
  amount: Prisma.Decimal;
  cost: Prisma.Decimal;
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
    this.adjustmentRepo = new MonthlyReportAdjustmentRepository(
      prisma,
      appConfigService,
    );
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
          ...buildMonthlyReportStockScopeWhere(params.stockScope),
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

    return lines.map((line) => {
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
      include: {
        stockScope: true,
        workshop: true,
      },
      orderBy: [{ bizDate: "asc" }, { id: "asc" }],
    });

    return orders.map((order) => ({
      topicKey: this.resolveStockInTopicKey(order.orderType),
      direction:
        order.orderType === StockInOrderType.SUPPLIER_RETURN
          ? MonthlyReportingDirection.OUT
          : MonthlyReportingDirection.IN,
      documentType: BusinessDocumentType.StockInOrder,
      documentTypeLabel: this.resolveStockInDocumentTypeLabel(order.orderType),
      documentId: order.id,
      documentNo: order.documentNo,
      bizDate: order.bizDate,
      createdAt: order.createdAt,
      stockScope: resolveMonthlyReportStockScopeCode(
        order.stockScope?.scopeCode,
      ),
      stockScopeName: resolveMonthlyReportStockScopeName(
        order.stockScope?.scopeName,
      ),
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
      sourceBizDate: null,
      sourceDocumentNo: null,
    }));
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
        ...buildMonthlyReportStockScopeWhere(params.stockScope),
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
    const sourceOrderMap = await loadSalesOrderSourceMap(
      this.prisma,
      sourceOrderIds,
    );

    return orders.map((order) => {
      const sourceReference = resolveSourceReference(
        order.bizDate,
        order.lines
          .map((line) =>
            typeof line.sourceDocumentId === "number"
              ? (sourceOrderMap.get(line.sourceDocumentId) ?? null)
              : null,
          )
          .filter(
            (value): value is { bizDate: Date; documentNo: string } =>
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
        stockScope: resolveMonthlyReportStockScopeCode(
          order.stockScope?.scopeCode,
        ),
        stockScopeName: resolveMonthlyReportStockScopeName(
          order.stockScope?.scopeName,
        ),
        workshopId: order.workshopId,
        workshopName:
          order.workshop?.workshopName?.trim() ||
          order.workshopNameSnapshot?.trim() ||
          null,
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
        ...buildMonthlyReportStockScopeWhere(params.stockScope),
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
    const sourceOrderMap = await loadWorkshopOrderSourceMap(
      this.prisma,
      sourceOrderIds,
    );

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
              ? (sourceOrderMap.get(line.sourceDocumentId) ?? null)
              : null,
          )
          .filter(
            (value): value is { bizDate: Date; documentNo: string } =>
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
        stockScope: resolveMonthlyReportStockScopeCode(
          order.stockScope?.scopeCode,
        ),
        stockScopeName: resolveMonthlyReportStockScopeName(
          order.stockScope?.scopeName,
        ),
        workshopId: order.workshopId,
        workshopName:
          order.workshop?.workshopName?.trim() ||
          order.workshopNameSnapshot?.trim() ||
          null,
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
        sourceBizDate: sourceReference.sourceBizDate,
        sourceDocumentNo: sourceReference.sourceDocumentNo,
      };
    });
  }
}
