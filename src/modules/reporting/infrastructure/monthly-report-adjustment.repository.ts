import {
  DocumentLifecycleStatus,
  Prisma,
} from "../../../../generated/prisma/client";
import type { AppConfigService } from "../../../shared/config/app-config.service";
import { BusinessDocumentType } from "../../../shared/domain/business-document-type";
import type { PrismaService } from "../../../shared/prisma/prisma.service";
import type { StockScopeCode } from "../../session/domain/user-session";
import {
  type MonthlyReportEntry,
  MonthlyReportingAbnormalFlag,
  MonthlyReportingDirection,
  MonthlyReportingTopicKey,
} from "../application/monthly-reporting.shared";
import {
  buildAbnormalFlags,
  multiplyDecimals,
  resolveSourceReference,
  sumNullableDecimals,
  toDecimal,
  toStockScopeCode,
} from "./reporting-repository.helpers";

export class MonthlyReportAdjustmentRepository {
  constructor(
    private readonly prisma: PrismaService,
    private readonly appConfigService: AppConfigService,
  ) {}

  async findRdStocktakeMonthlyEntries(params: {
    start: Date;
    end: Date;
    stockScope?: StockScopeCode;
    workshopId?: number;
  }): Promise<MonthlyReportEntry[]> {
    const orders = await this.prisma.rdStocktakeOrder.findMany({
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
          include: {
            inventoryLog: true,
            rdProject: true,
          },
        },
      },
      orderBy: [{ bizDate: "asc" }, { id: "asc" }],
    });

    return orders.flatMap((order) => {
      const abnormalFlags = buildAbnormalFlags({
        bizDate: order.bizDate,
        createdAt: order.createdAt,
        extraFlags: [MonthlyReportingAbnormalFlag.STOCKTAKE_ADJUSTMENT],
      }, this.appConfigService.businessTimezone);
      const grouped = new Map<
        string,
        {
          topicKey: MonthlyReportingTopicKey;
          direction: MonthlyReportingDirection;
          rdProjectId: number | null;
          rdProjectCode: string | null;
          rdProjectName: string | null;
          quantity: Prisma.Decimal;
          amount: Prisma.Decimal;
          cost: Prisma.Decimal;
        }
      >();

      for (const line of order.lines) {
        const adjustmentQty = new Prisma.Decimal(line.adjustmentQty);
        if (adjustmentQty.eq(0)) {
          continue;
        }
        const isGain = adjustmentQty.gt(0);
        const key = [
          isGain ? "gain" : "loss",
          line.rdProjectId ?? "null",
          line.rdProjectCodeSnapshot ?? "",
          line.rdProjectNameSnapshot ?? "",
        ].join(":");
        const current = grouped.get(key) ?? {
          topicKey: isGain
            ? MonthlyReportingTopicKey.RD_STOCKTAKE_GAIN
            : MonthlyReportingTopicKey.RD_STOCKTAKE_LOSS,
          direction: isGain
            ? MonthlyReportingDirection.IN
            : MonthlyReportingDirection.OUT,
          rdProjectId: line.rdProjectId ?? null,
          rdProjectCode: line.rdProjectCodeSnapshot ?? null,
          rdProjectName: line.rdProjectNameSnapshot ?? null,
          quantity: new Prisma.Decimal(0),
          amount: new Prisma.Decimal(0),
          cost: new Prisma.Decimal(0),
        };
        current.quantity = current.quantity.add(
          isGain ? adjustmentQty : adjustmentQty.abs(),
        );
        current.amount = current.amount.add(line.inventoryLog?.costAmount ?? 0);
        current.cost = current.cost.add(line.inventoryLog?.costAmount ?? 0);
        grouped.set(key, current);
      }

      return [...grouped.values()].map((item) => ({
        topicKey: item.topicKey,
        direction: item.direction,
        documentType: BusinessDocumentType.RdStocktakeOrder,
        documentTypeLabel:
          item.topicKey === MonthlyReportingTopicKey.RD_STOCKTAKE_GAIN
            ? "RD盘盈调整单"
            : "RD盘亏调整单",
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
        rdProjectId: item.rdProjectId,
        rdProjectCode: item.rdProjectCode,
        rdProjectName: item.rdProjectName,
        sourceStockScopeName: null,
        targetStockScopeName: null,
        sourceWorkshopName: null,
        targetWorkshopName: null,
        quantity: item.quantity,
        amount: item.amount,
        cost: item.cost,
        abnormalFlags,
        sourceBizDate: null,
        sourceDocumentNo: null,
      }));
    });
  }

  async findPriceCorrectionMonthlyEntries(params: {
    start: Date;
    end: Date;
    stockScope?: StockScopeCode;
    workshopId?: number;
  }): Promise<MonthlyReportEntry[]> {
    const orders = await this.prisma.stockInPriceCorrectionOrder.findMany({
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
          include: {
            generatedOutLog: true,
            generatedInLog: true,
          },
        },
      },
      orderBy: [{ bizDate: "asc" }, { id: "asc" }],
    });

    return orders.flatMap((order) => {
      const sourceReference = resolveSourceReference(
        order.bizDate,
        order.lines
          .map((line) =>
            line.sourceBizDateSnapshot
              ? {
                  bizDate: line.sourceBizDateSnapshot,
                  documentNo: line.sourceDocumentNoSnapshot ?? "",
                }
              : null,
          )
          .filter((value): value is { bizDate: Date; documentNo: string } =>
            value !== null,
          ),
        this.appConfigService.businessTimezone,
      );
      const abnormalFlags = buildAbnormalFlags({
        bizDate: order.bizDate,
        createdAt: order.createdAt,
        sourceBizDate: sourceReference.sourceBizDate,
        extraFlags: [MonthlyReportingAbnormalFlag.PRICE_CORRECTION],
      }, this.appConfigService.businessTimezone);
      const totalOutQty = sumNullableDecimals(
        order.lines.map((line) => line.remainingQtyAtCorrection),
      );
      const totalOutAmount = sumNullableDecimals(
        order.lines.map(
          (line) =>
            line.generatedOutLog?.costAmount ??
            multiplyDecimals(
              line.remainingQtyAtCorrection,
              line.wrongUnitCost,
            ),
        ),
      );
      const totalInQty = sumNullableDecimals(
        order.lines.map((line) => line.remainingQtyAtCorrection),
      );
      const totalInAmount = sumNullableDecimals(
        order.lines.map((line) =>
          toDecimal(line.generatedInLog?.costAmount).add(
            toDecimal(line.historicalDiffAmount),
          ),
        ),
      );
      const entries: MonthlyReportEntry[] = [];

      if (!totalOutQty.eq(0) || !totalOutAmount.eq(0)) {
        entries.push({
          topicKey: MonthlyReportingTopicKey.PRICE_CORRECTION_OUT,
          direction: MonthlyReportingDirection.OUT,
          documentType: BusinessDocumentType.StockInPriceCorrectionOrder,
          documentTypeLabel: "入库调价转出单",
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
          quantity: totalOutQty,
          amount: totalOutAmount,
          cost: totalOutAmount,
          abnormalFlags,
          sourceBizDate: sourceReference.sourceBizDate,
          sourceDocumentNo: sourceReference.sourceDocumentNo,
        });
      }

      if (!totalInQty.eq(0) || !totalInAmount.eq(0)) {
        entries.push({
          topicKey: MonthlyReportingTopicKey.PRICE_CORRECTION_IN,
          direction: MonthlyReportingDirection.IN,
          documentType: BusinessDocumentType.StockInPriceCorrectionOrder,
          documentTypeLabel: "入库调价转入单",
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
          quantity: totalInQty,
          amount: totalInAmount,
          cost: totalInAmount,
          abnormalFlags,
          sourceBizDate: sourceReference.sourceBizDate,
          sourceDocumentNo: sourceReference.sourceDocumentNo,
        });
      }

      return entries;
    });
  }
}
