import {
  DocumentLifecycleStatus,
  Prisma,
  RdProjectMaterialActionType,
} from "../../../../generated/prisma/client";
import type { AppConfigService } from "../../../shared/config/app-config.service";
import { BusinessDocumentType } from "../../../shared/domain/business-document-type";
import type { PrismaService } from "../../../shared/prisma/prisma.service";
import type { StockScopeCode } from "../../session/domain/user-session";
import {
  type MonthlyReportEntry,
  MonthlyReportingDirection,
  MonthlyReportingTopicKey,
} from "../application/monthly-reporting.shared";
import {
  buildAbnormalFlags,
  joinArrowLabels,
  loadRdProjectActionSourceMap,
  resolveSourceReference,
  sumNullableDecimals,
  toRdProjectDocumentLabel,
  toRdProjectTopicKey,
  toStockScopeCode,
} from "./reporting-repository.helpers";

export class MonthlyReportRdRepository {
  constructor(
    private readonly prisma: PrismaService,
    private readonly appConfigService: AppConfigService,
  ) {}

  async findRdProjectMonthlyEntries(params: {
    start: Date;
    end: Date;
    stockScope?: StockScopeCode;
    workshopId?: number;
  }): Promise<MonthlyReportEntry[]> {
    const actions = await this.prisma.rdProjectMaterialAction.findMany({
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
        rdProject: {
          select: {
            projectCode: true,
            projectName: true,
          },
        },
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

    const sourceActionIds = [
      ...new Set(
        actions.flatMap((action) =>
          action.lines
            .filter(
              (line) =>
                line.sourceDocumentType ===
                BusinessDocumentType.RdProjectMaterialAction,
            )
            .map((line) => line.sourceDocumentId)
            .filter((value): value is number => typeof value === "number"),
        ),
      ),
    ];
    const sourceActionMap =
      await loadRdProjectActionSourceMap(this.prisma, sourceActionIds);

    return actions.map((action) => {
      const sourceReference = resolveSourceReference(
        action.bizDate,
        action.lines
          .filter(
            (line) =>
              line.sourceDocumentType ===
              BusinessDocumentType.RdProjectMaterialAction,
          )
          .map((line) =>
            typeof line.sourceDocumentId === "number"
              ? sourceActionMap.get(line.sourceDocumentId) ?? null
              : null,
          )
          .filter((value): value is { bizDate: Date; documentNo: string } =>
            value !== null,
          ),
        this.appConfigService.businessTimezone,
      );

      return {
        topicKey: toRdProjectTopicKey(action.actionType),
        direction:
          action.actionType === RdProjectMaterialActionType.RETURN
            ? MonthlyReportingDirection.IN
            : MonthlyReportingDirection.OUT,
        documentType: BusinessDocumentType.RdProjectMaterialAction,
        documentTypeLabel: toRdProjectDocumentLabel(action.actionType),
        documentId: action.id,
        documentNo: action.documentNo,
        bizDate: action.bizDate,
        createdAt: action.createdAt,
        stockScope: toStockScopeCode(action.stockScope?.scopeCode),
        stockScopeName: action.stockScope?.scopeName ?? null,
        workshopId: action.workshopId,
        workshopName: action.workshop.workshopName,
        salesProjectIds: [],
        salesProjectCodes: [],
        salesProjectNames: [],
        rdProjectId: action.projectId,
        rdProjectCode: action.rdProject.projectCode,
        rdProjectName: action.rdProject.projectName,
        sourceStockScopeName: null,
        targetStockScopeName: null,
        sourceWorkshopName: null,
        targetWorkshopName: null,
        quantity: action.totalQty,
        amount: action.totalAmount,
        cost: sumNullableDecimals(action.lines.map((line) => line.costAmount)),
        abnormalFlags: buildAbnormalFlags({
          bizDate: action.bizDate,
          createdAt: action.createdAt,
          sourceBizDate: sourceReference.sourceBizDate,
        }, this.appConfigService.businessTimezone),
        sourceBizDate: sourceReference.sourceBizDate,
        sourceDocumentNo: sourceReference.sourceDocumentNo,
      };
    });
  }

  async findRdHandoffMonthlyEntries(params: {
    start: Date;
    end: Date;
    stockScope?: StockScopeCode;
    workshopId?: number;
  }): Promise<MonthlyReportEntry[]> {
    const andFilters: Prisma.RdHandoffOrderWhereInput[] = [];
    if (params.stockScope) {
      andFilters.push({
        OR: [
          {
            sourceStockScope: {
              is: {
                scopeCode: params.stockScope,
              },
            },
          },
          {
            targetStockScope: {
              is: {
                scopeCode: params.stockScope,
              },
            },
          },
        ],
      });
    }
    if (params.workshopId) {
      andFilters.push({
        OR: [
          { sourceWorkshopId: params.workshopId },
          { targetWorkshopId: params.workshopId },
          {
            lines: {
              some: {
                rdProject: {
                  is: {
                    workshopId: params.workshopId,
                  },
                },
              },
            },
          },
        ],
      });
    }
    const orders = await this.prisma.rdHandoffOrder.findMany({
      where: {
        lifecycleStatus: DocumentLifecycleStatus.EFFECTIVE,
        bizDate: { gte: params.start, lte: params.end },
        ...(andFilters.length > 0 ? { AND: andFilters } : {}),
      },
      include: {
        sourceStockScope: true,
        targetStockScope: true,
        sourceWorkshop: true,
        targetWorkshop: true,
        lines: {
          select: {
            quantity: true,
            amount: true,
            costAmount: true,
            rdProjectId: true,
            rdProjectCodeSnapshot: true,
            rdProjectNameSnapshot: true,
            rdProject: {
              select: {
                workshopId: true,
                workshopNameSnapshot: true,
              },
            },
          },
        },
      },
      orderBy: [{ bizDate: "asc" }, { id: "asc" }],
    });

    const direction =
      params.stockScope === "MAIN"
        ? MonthlyReportingDirection.OUT
        : MonthlyReportingDirection.IN;

    return orders.flatMap((order) => {
      const sourceStockScopeName = order.sourceStockScope?.scopeName ?? null;
      const targetStockScopeName = order.targetStockScope?.scopeName ?? null;
      const sourceWorkshopName =
        order.sourceWorkshop?.workshopName ??
        order.sourceWorkshopNameSnapshot ??
        null;
      const targetWorkshopName =
        order.targetWorkshop?.workshopName ??
        order.targetWorkshopNameSnapshot ??
        null;
      const grouped = new Map<
        string,
        {
          rdProjectId: number | null;
          rdProjectCode: string | null;
          rdProjectName: string | null;
          workshopId: number | null;
          workshopName: string | null;
          quantity: Prisma.Decimal;
          amount: Prisma.Decimal;
          cost: Prisma.Decimal;
        }
      >();

      const filteredLines = order.lines.filter((line) => {
        if (!params.workshopId) {
          return true;
        }
        return (
          line.rdProject?.workshopId ??
          order.targetWorkshopId ??
          null
        ) === params.workshopId;
      });

      for (const line of filteredLines) {
        const lineWorkshopId = line.rdProject?.workshopId ?? order.targetWorkshopId;
        const lineWorkshopName =
          line.rdProject?.workshopNameSnapshot ??
          targetWorkshopName;
        const key = [
          line.rdProjectId ?? "null",
          line.rdProjectCodeSnapshot ?? "",
          line.rdProjectNameSnapshot ?? "",
          lineWorkshopId ?? "null",
          lineWorkshopName ?? "",
        ].join(":");
        const current = grouped.get(key) ?? {
          rdProjectId: line.rdProjectId ?? null,
          rdProjectCode: line.rdProjectCodeSnapshot ?? null,
          rdProjectName: line.rdProjectNameSnapshot ?? null,
          workshopId: lineWorkshopId ?? null,
          workshopName: lineWorkshopName ?? null,
          quantity: new Prisma.Decimal(0),
          amount: new Prisma.Decimal(0),
          cost: new Prisma.Decimal(0),
        };
        current.quantity = current.quantity.add(line.quantity);
        current.amount = current.amount.add(line.amount);
        current.cost = current.cost.add(line.costAmount ?? 0);
        grouped.set(key, current);
      }

      return [...grouped.values()].map((item) => ({
        topicKey: MonthlyReportingTopicKey.RD_HANDOFF,
        direction,
        documentType: BusinessDocumentType.RdHandoffOrder,
        documentTypeLabel: "RD 交接单",
        documentId: order.id,
        documentNo: order.documentNo,
        bizDate: order.bizDate,
        createdAt: order.createdAt,
        stockScope:
          params.stockScope === "MAIN"
            ? "MAIN"
            : params.stockScope === "RD_SUB"
              ? "RD_SUB"
              : null,
          stockScopeName:
            params.stockScope === "MAIN"
              ? sourceStockScopeName
              : params.stockScope === "RD_SUB"
                ? targetStockScopeName
                : joinArrowLabels(sourceStockScopeName, targetStockScopeName),
        workshopId: item.workshopId,
        workshopName:
          params.stockScope === "MAIN" || params.stockScope === "RD_SUB"
            ? item.workshopName
            : joinArrowLabels(sourceWorkshopName, item.workshopName),
        salesProjectIds: [],
        salesProjectCodes: [],
        salesProjectNames: [],
        rdProjectId: item.rdProjectId,
        rdProjectCode: item.rdProjectCode,
        rdProjectName: item.rdProjectName,
        sourceStockScopeName,
        targetStockScopeName,
        sourceWorkshopName,
        targetWorkshopName: item.workshopName ?? targetWorkshopName,
        quantity: item.quantity,
        amount: item.amount,
        cost: item.cost,
        abnormalFlags: buildAbnormalFlags({
          bizDate: order.bizDate,
          createdAt: order.createdAt,
        }, this.appConfigService.businessTimezone),
        sourceBizDate: null,
        sourceDocumentNo: null,
      }));
    });
  }
}
