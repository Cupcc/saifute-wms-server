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
  type MaterialCategorySnapshotNode,
  type MonthlyMaterialCategoryEntry,
  MonthlyReportingAbnormalFlag,
  MonthlyReportingDirection,
  MonthlyReportingTopicKey,
} from "../application/monthly-reporting.shared";
import {
  buildAbnormalFlags,
  loadSalesOrderSourceMap,
  resolveSourceReference,
  toDecimal,
  toStockScopeCode,
} from "./reporting-repository.helpers";

@Injectable()
export class MonthlyMaterialCategoryRepository {
  constructor(
    private readonly prisma: PrismaService,
    private readonly appConfigService: AppConfigService,
  ) {}

  async findMonthlyMaterialCategoryEntries(params: {
    start: Date;
    end: Date;
    stockScope?: StockScopeCode;
    workshopId?: number;
  }): Promise<MonthlyMaterialCategoryEntry[]> {
    const [inboundLines, salesLines] = await Promise.all([
      this.prisma.stockInOrderLine.findMany({
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
        select: {
          id: true,
          lineNo: true,
          materialId: true,
          materialCodeSnapshot: true,
          materialNameSnapshot: true,
          materialSpecSnapshot: true,
          unitCodeSnapshot: true,
          quantity: true,
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
        select: {
          id: true,
          lineNo: true,
          materialId: true,
          materialCodeSnapshot: true,
          materialNameSnapshot: true,
          materialSpecSnapshot: true,
          unitCodeSnapshot: true,
          quantity: true,
          amount: true,
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
    const sourceOrderMap = await loadSalesOrderSourceMap(this.prisma, sourceOrderIds);
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
      const categoryPath = this.parseMaterialCategoryPathSnapshot(
        line.materialCategoryPathSnapshot,
        {
          id: line.materialCategoryIdSnapshot ?? null,
          categoryCode: line.materialCategoryCodeSnapshot ?? null,
          categoryName:
            line.materialCategoryNameSnapshot?.trim() || "未分类",
        },
      );
      const leafCategory = categoryPath.at(-1) ?? {
        id: line.materialCategoryIdSnapshot ?? null,
        categoryCode: line.materialCategoryCodeSnapshot ?? null,
        categoryName:
          line.materialCategoryNameSnapshot?.trim() || "未分类",
      };

      return {
        topicKey:
          line.order.orderType === StockInOrderType.ACCEPTANCE
            ? MonthlyReportingTopicKey.ACCEPTANCE_INBOUND
            : MonthlyReportingTopicKey.PRODUCTION_RECEIPT,
        direction: MonthlyReportingDirection.IN,
        documentType: BusinessDocumentType.StockInOrder,
        documentTypeLabel:
          line.order.orderType === StockInOrderType.ACCEPTANCE
            ? "验收单"
            : "生产入库单",
        documentId: line.order.id,
        documentNo: line.order.documentNo,
        documentLineId: line.id,
        lineNo: line.lineNo,
        bizDate: line.order.bizDate,
        createdAt: line.order.createdAt,
        stockScope: toStockScopeCode(line.order.stockScope?.scopeCode),
        stockScopeName: line.order.stockScope?.scopeName ?? null,
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
        amount: line.amount,
        cost: line.amount,
        salesProjectId: null,
        salesProjectCode: null,
        salesProjectName: null,
        abnormalFlags: buildAbnormalFlags({
          bizDate: line.order.bizDate,
          createdAt: line.order.createdAt,
        }, this.appConfigService.businessTimezone),
        sourceBizDate: null,
        sourceDocumentNo: null,
      } satisfies MonthlyMaterialCategoryEntry;
    });

    const salesEntries = salesLines.map((line) => {
      const sourceReference = resolveSourceReference(
        line.order.bizDate,
        sourceRefsByOrder.get(line.order.id) ?? [],
        this.appConfigService.businessTimezone,
      );
      const categoryPath = this.parseMaterialCategoryPathSnapshot(
        line.materialCategoryPathSnapshot,
        {
          id: line.materialCategoryIdSnapshot ?? null,
          categoryCode: line.materialCategoryCodeSnapshot ?? null,
          categoryName:
            line.materialCategoryNameSnapshot?.trim() || "未分类",
        },
      );
      const leafCategory = categoryPath.at(-1) ?? {
        id: line.materialCategoryIdSnapshot ?? null,
        categoryCode: line.materialCategoryCodeSnapshot ?? null,
        categoryName:
          line.materialCategoryNameSnapshot?.trim() || "未分类",
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
        stockScope: toStockScopeCode(line.order.stockScope?.scopeCode),
        stockScopeName: line.order.stockScope?.scopeName ?? null,
        workshopId: line.order.workshopId,
        workshopName: line.order.workshop.workshopName,
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
        amount: line.amount,
        cost: toDecimal(line.costAmount),
        salesProjectId: line.salesProjectId ?? null,
        salesProjectCode: line.salesProjectCodeSnapshot ?? null,
        salesProjectName: line.salesProjectNameSnapshot ?? null,
        abnormalFlags: buildAbnormalFlags({
          bizDate: line.order.bizDate,
          createdAt: line.order.createdAt,
          sourceBizDate: sourceReference.sourceBizDate,
        }, this.appConfigService.businessTimezone),
        sourceBizDate: sourceReference.sourceBizDate,
        sourceDocumentNo: sourceReference.sourceDocumentNo,
      } satisfies MonthlyMaterialCategoryEntry;
    });

    return [...inboundEntries, ...salesEntries];
  }

  private parseMaterialCategoryPathSnapshot(
    snapshot: Prisma.JsonValue | string | null | undefined,
    fallbackLeaf: MaterialCategorySnapshotNode,
  ): MaterialCategorySnapshotNode[] {
    const fallbackPath = [fallbackLeaf].filter(
      (node) => node.categoryName.trim().length > 0,
    );

    if (!snapshot) {
      return fallbackPath.length > 0
        ? fallbackPath
        : [
            {
              id: null,
              categoryCode: null,
              categoryName: "未分类",
            },
          ];
    }

    const parsedSnapshot =
      typeof snapshot === "string"
        ? this.tryParseJsonSnapshot(snapshot)
        : snapshot;
    if (!Array.isArray(parsedSnapshot)) {
      return fallbackPath.length > 0
        ? fallbackPath
        : [
            {
              id: null,
              categoryCode: null,
              categoryName: "未分类",
            },
          ];
    }

    const nodes = parsedSnapshot
      .map((value) => this.normalizeMaterialCategoryPathNode(value))
      .filter(
        (node): node is MaterialCategorySnapshotNode =>
          node != null && node.categoryName.trim().length > 0,
      );

    if (nodes.length > 0) {
      return nodes;
    }

    return fallbackPath.length > 0
      ? fallbackPath
      : [
          {
            id: null,
            categoryCode: null,
            categoryName: "未分类",
          },
        ];
  }

  private tryParseJsonSnapshot(value: string) {
    try {
      return JSON.parse(value) as unknown;
    } catch {
      return null;
    }
  }

  private normalizeMaterialCategoryPathNode(value: unknown) {
    if (!value || typeof value !== "object") {
      return null;
    }

    const candidate = value as {
      id?: unknown;
      categoryCode?: unknown;
      categoryName?: unknown;
      code?: unknown;
      name?: unknown;
    };
    const rawCategoryName =
      typeof candidate.categoryName === "string"
        ? candidate.categoryName
        : typeof candidate.name === "string"
          ? candidate.name
          : "";
    const categoryName =
      typeof rawCategoryName === "string" ? rawCategoryName.trim() : "";

    if (categoryName.length === 0) {
      return null;
    }

    return {
      id: typeof candidate.id === "number" ? candidate.id : null,
      categoryCode:
        typeof candidate.categoryCode === "string" &&
        candidate.categoryCode.trim().length > 0
          ? candidate.categoryCode.trim()
          : typeof candidate.code === "string" &&
              candidate.code.trim().length > 0
            ? candidate.code.trim()
          : null,
      categoryName,
    } satisfies MaterialCategorySnapshotNode;
  }
}
