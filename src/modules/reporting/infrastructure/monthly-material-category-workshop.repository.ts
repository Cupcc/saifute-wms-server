import { Injectable } from "@nestjs/common";
import {
  DocumentLifecycleStatus,
  WorkshopMaterialOrderType,
} from "../../../../generated/prisma/client";
import { AppConfigService } from "../../../shared/config/app-config.service";
import { BusinessDocumentType } from "../../../shared/domain/business-document-type";
import { PrismaService } from "../../../shared/prisma/prisma.service";
import type { StockScopeCode } from "../../session/domain/user-session";
import {
  type MaterialCategorySnapshotNode,
  type MonthlyMaterialCategoryEntry,
  MonthlyReportingDirection,
} from "../application/monthly-reporting.shared";
import { resolveMaterialCategoryLineAmount } from "./monthly-material-category.helpers";
import {
  buildAbnormalFlags,
  buildMonthlyReportStockScopeWhere,
  loadWorkshopOrderSourceMap,
  resolveMonthlyReportStockScopeCode,
  resolveMonthlyReportStockScopeName,
  resolveSourceReference,
  toDecimal,
  toWorkshopDocumentLabel,
  toWorkshopTopicKey,
} from "./reporting-repository.helpers";

@Injectable()
export class MonthlyMaterialCategoryWorkshopRepository {
  constructor(
    private readonly prisma: PrismaService,
    private readonly appConfigService: AppConfigService,
  ) {}

  async findWorkshopMaterialCategoryEntries(params: {
    start: Date;
    end: Date;
    stockScope?: StockScopeCode;
    workshopId?: number;
  }): Promise<MonthlyMaterialCategoryEntry[]> {
    const lines = await this.prisma.workshopMaterialOrderLine.findMany({
      where: {
        order: {
          lifecycleStatus: DocumentLifecycleStatus.EFFECTIVE,
          orderType: {
            in: [
              WorkshopMaterialOrderType.PICK,
              WorkshopMaterialOrderType.RETURN,
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
        costAmount: true,
        sourceDocumentType: true,
        sourceDocumentId: true,
        material: {
          select: {
            category: {
              select: {
                id: true,
                categoryCode: true,
                categoryName: true,
              },
            },
          },
        },
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
    });
    const sourceOrderIds = [
      ...new Set(
        lines
          .filter(
            (line) =>
              line.sourceDocumentType ===
                BusinessDocumentType.WorkshopMaterialOrder &&
              typeof line.sourceDocumentId === "number",
          )
          .map((line) => line.sourceDocumentId as number),
      ),
    ];
    const sourceOrderMap = await loadWorkshopOrderSourceMap(
      this.prisma,
      sourceOrderIds,
    );

    return lines.map((line) => {
      const lineAmount = resolveMaterialCategoryLineAmount(
        line.amount,
        line.quantity,
        line.unitPrice,
      );
      const currentCost = toDecimal(line.costAmount);
      const lineCost =
        currentCost.isZero() && !lineAmount.isZero() ? lineAmount : currentCost;
      const categoryPath = this.resolveMaterialCategoryPath(
        line.material.category,
      );
      const leafCategory = categoryPath.at(-1) ?? {
        id: null,
        categoryCode: null,
        categoryName: "未分类",
      };
      const sourceReference = resolveSourceReference(
        line.order.bizDate,
        typeof line.sourceDocumentId === "number"
          ? [sourceOrderMap.get(line.sourceDocumentId)].filter(
              (value): value is { bizDate: Date; documentNo: string } =>
                Boolean(value),
            )
          : [],
        this.appConfigService.businessTimezone,
      );

      return {
        topicKey: toWorkshopTopicKey(line.order.orderType),
        direction:
          line.order.orderType === WorkshopMaterialOrderType.RETURN
            ? MonthlyReportingDirection.IN
            : MonthlyReportingDirection.OUT,
        documentType: BusinessDocumentType.WorkshopMaterialOrder,
        documentTypeLabel: toWorkshopDocumentLabel(line.order.orderType),
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
        salesProjectId: null,
        salesProjectCode: null,
        salesProjectName: null,
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
  }

  private resolveMaterialCategoryPath(
    category: {
      id: number;
      categoryCode: string;
      categoryName: string;
    } | null,
  ): MaterialCategorySnapshotNode[] {
    if (!category) {
      return [];
    }

    return [
      {
        id: category.id,
        categoryCode: category.categoryCode,
        categoryName: category.categoryName,
      },
    ];
  }
}
