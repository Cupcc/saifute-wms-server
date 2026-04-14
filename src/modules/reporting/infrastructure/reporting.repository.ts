import { Injectable } from "@nestjs/common";
import {
  DocumentLifecycleStatus,
  InventoryOperationType,
  MasterDataStatus,
  Prisma,
  RdProjectMaterialActionType,
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
  isSameYearMonth,
} from "../application/monthly-reporting.shared";

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
}

export interface InventoryValuationSnapshot {
  materialId: number;
  stockScopeId: number | null;
  inventoryValue: Prisma.Decimal;
}

export interface TrendDocumentSnapshot {
  sourceType: "INBOUND" | "SALES" | "WORKSHOP_MATERIAL" | "RD_PROJECT" | "RD";
  bizDate: Date;
  totalQty: Prisma.Decimal;
  totalAmount: Prisma.Decimal;
}

export interface MonthlySalesProjectEntry {
  salesProjectId: number | null;
  salesProjectCode: string | null;
  salesProjectName: string | null;
  topicKey: MonthlyReportingTopicKey.SALES_OUTBOUND | MonthlyReportingTopicKey.SALES_RETURN;
  documentId: number;
  documentNo: string;
  bizDate: Date;
  createdAt: Date;
  quantity: Prisma.Decimal;
  amount: Prisma.Decimal;
  cost: Prisma.Decimal;
  abnormalFlags: MonthlyReportingAbnormalFlag[];
}

interface InventoryLogTrendGroup {
  bizDate: Date;
  _sum: {
    changeQty: Prisma.Decimal | null;
    costAmount: Prisma.Decimal | null;
  } | null;
}

const INVENTORY_VALUE_SOURCE_OPERATION_TYPES = [
  InventoryOperationType.ACCEPTANCE_IN,
  InventoryOperationType.PRODUCTION_RECEIPT_IN,
  InventoryOperationType.PRICE_CORRECTION_IN,
  InventoryOperationType.RD_HANDOFF_IN,
];

@Injectable()
export class ReportingRepository {
  constructor(
    private readonly prisma: PrismaService,
    private readonly appConfigService: AppConfigService,
  ) {}

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
      },
      orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
    });
  }

  async summarizeInventoryValueByBalance(params: {
    inventoryStockScopeIds: number[];
    materialIds?: number[];
  }): Promise<InventoryValuationSnapshot[]> {
    if (params.inventoryStockScopeIds.length === 0) {
      return [];
    }

    if (params.materialIds && params.materialIds.length === 0) {
      return [];
    }

    const materialFilter = params.materialIds?.length
      ? Prisma.sql`AND src_log.materialId IN (${Prisma.join(params.materialIds)})`
      : Prisma.empty;
    const rows = await this.prisma.$queryRaw<
      Array<{
        materialId: number;
        stockScopeId: number | null;
        inventoryValue: Prisma.Decimal | string | number | null;
      }>
    >(Prisma.sql`
      SELECT
        src_log.materialId AS materialId,
        src_log.stockScopeId AS stockScopeId,
        SUM(
          (src_log.changeQty - COALESCE(usage_summary.netAllocatedQty, 0)) * src_log.unitCost
        ) AS inventoryValue
      FROM inventory_log src_log
      INNER JOIN material material ON material.id = src_log.materialId
      LEFT JOIN (
        SELECT
          sourceLogId,
          SUM(allocatedQty - releasedQty) AS netAllocatedQty
        FROM inventory_source_usage
        GROUP BY sourceLogId
      ) usage_summary ON usage_summary.sourceLogId = src_log.id
      WHERE src_log.stockScopeId IN (${Prisma.join(params.inventoryStockScopeIds)})
        ${materialFilter}
        AND material.status = ${MasterDataStatus.ACTIVE}
        AND src_log.direction = ${"IN"}
        AND src_log.operationType IN (${Prisma.join(
          INVENTORY_VALUE_SOURCE_OPERATION_TYPES,
        )})
        AND src_log.unitCost IS NOT NULL
        AND src_log.reversalOfLogId IS NULL
        AND NOT EXISTS (
          SELECT 1
          FROM inventory_log reversed
          WHERE reversed.reversalOfLogId = src_log.id
        )
      GROUP BY src_log.materialId, src_log.stockScopeId
      HAVING SUM(src_log.changeQty - COALESCE(usage_summary.netAllocatedQty, 0)) > 0
    `);

    return rows.map((row) => ({
      materialId: Number(row.materialId),
      stockScopeId:
        row.stockScopeId === null ? null : Number(row.stockScopeId),
      inventoryValue: new Prisma.Decimal(row.inventoryValue ?? 0),
    }));
  }

  async findTrendDocuments(params: {
    dateFrom: Date;
    dateTo: Date;
    inventoryStockScopeIds: number[];
    workshopId?: number;
  }): Promise<TrendDocumentSnapshot[]> {
    if (params.inventoryStockScopeIds.length === 0) {
      return [];
    }

    const baseWhere: Prisma.InventoryLogWhereInput = {
      bizDate: { gte: params.dateFrom, lte: params.dateTo },
      stockScopeId: { in: params.inventoryStockScopeIds },
      ...(params.workshopId ? { workshopId: params.workshopId } : {}),
    };

    const inboundTypes = [
      InventoryOperationType.ACCEPTANCE_IN,
      InventoryOperationType.PRODUCTION_RECEIPT_IN,
    ];
    const salesTypes = [InventoryOperationType.OUTBOUND_OUT];
    const workshopMaterialTypes = [
      InventoryOperationType.PICK_OUT,
      InventoryOperationType.RETURN_IN,
      InventoryOperationType.SCRAP_OUT,
    ];
    const rdProjectTypes = [InventoryOperationType.RD_PROJECT_OUT];
    const rdTypes = [
      InventoryOperationType.RD_HANDOFF_OUT,
      InventoryOperationType.RD_HANDOFF_IN,
      InventoryOperationType.RD_STOCKTAKE_IN,
      InventoryOperationType.RD_STOCKTAKE_OUT,
    ];

    const groupByBizDate = (where: Prisma.InventoryLogWhereInput) =>
      this.prisma.inventoryLog.groupBy({
        by: ["bizDate"],
        where,
        _sum: { changeQty: true, costAmount: true },
      });

    const [inbound, sales, workshopMaterial, rdProject, rd] = await Promise.all(
      [
        groupByBizDate({
          ...baseWhere,
          businessDocumentType: BusinessDocumentType.StockInOrder,
          operationType: { in: inboundTypes },
        }),
        groupByBizDate({
          ...baseWhere,
          businessDocumentType: BusinessDocumentType.SalesStockOrder,
          operationType: { in: salesTypes },
        }),
        groupByBizDate({
          ...baseWhere,
          businessDocumentType: BusinessDocumentType.WorkshopMaterialOrder,
          operationType: { in: workshopMaterialTypes },
        }),
        groupByBizDate({
          ...baseWhere,
          businessDocumentType: BusinessDocumentType.RdProjectMaterialAction,
          operationType: { in: rdProjectTypes },
        }),
        groupByBizDate({
          ...baseWhere,
          operationType: { in: rdTypes },
        }),
      ],
    );

    return [
      ...inbound.map((item) => this.mapLogGroupToSnapshot(item, "INBOUND")),
      ...sales.map((item) => this.mapLogGroupToSnapshot(item, "SALES")),
      ...workshopMaterial.map((item) =>
        this.mapLogGroupToSnapshot(item, "WORKSHOP_MATERIAL"),
      ),
      ...rdProject.map((item) =>
        this.mapLogGroupToSnapshot(item, "RD_PROJECT"),
      ),
      ...rd.map((item) => this.mapLogGroupToSnapshot(item, "RD")),
    ];
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
      this.findRdProjectMonthlyEntries(params),
      this.findRdHandoffMonthlyEntries(params),
      this.findRdStocktakeMonthlyEntries(params),
      this.findPriceCorrectionMonthlyEntries(params),
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
    const sourceOrderMap = await this.loadSalesOrderSourceMap(sourceOrderIds);
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
      const sourceReference = this.resolveSourceReference(
        line.order.bizDate,
        sourceRefsByOrder.get(line.orderId) ?? [],
      );

      return {
        salesProjectId: line.salesProjectId ?? null,
        salesProjectCode: line.salesProjectCodeSnapshot ?? null,
        salesProjectName: line.salesProjectNameSnapshot ?? null,
        topicKey:
          line.order.orderType === SalesStockOrderType.OUTBOUND
            ? MonthlyReportingTopicKey.SALES_OUTBOUND
            : MonthlyReportingTopicKey.SALES_RETURN,
        documentId: line.order.id,
        documentNo: line.order.documentNo,
        bizDate: line.order.bizDate,
        createdAt: line.order.createdAt,
        quantity: line.quantity,
        amount: line.amount,
        cost: this.toDecimal(line.costAmount),
        abnormalFlags: this.buildAbnormalFlags({
          bizDate: line.order.bizDate,
          createdAt: line.order.createdAt,
          sourceBizDate: sourceReference.sourceBizDate,
        }),
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
      stockScope: this.toStockScopeCode(order.stockScope?.scopeCode),
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
      abnormalFlags: this.buildAbnormalFlags({
        bizDate: order.bizDate,
        createdAt: order.createdAt,
      }),
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
    const sourceOrderMap = await this.loadSalesOrderSourceMap(sourceOrderIds);

    return orders.map((order) => {
      const sourceReference = this.resolveSourceReference(
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
        stockScope: this.toStockScopeCode(order.stockScope?.scopeCode),
        stockScopeName: order.stockScope?.scopeName ?? null,
        workshopId: order.workshopId,
        workshopName: order.workshop.workshopName,
        salesProjectIds: this.collectDistinctNumbers(
          order.lines.map((line) => line.salesProjectId),
        ),
        salesProjectCodes: this.collectDistinctStrings(
          order.lines.map((line) => line.salesProjectCodeSnapshot),
        ),
        salesProjectNames: this.collectDistinctStrings(
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
        cost: this.sumNullableDecimals(order.lines.map((line) => line.costAmount)),
        abnormalFlags: this.buildAbnormalFlags({
          bizDate: order.bizDate,
          createdAt: order.createdAt,
          sourceBizDate: sourceReference.sourceBizDate,
        }),
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
      await this.loadWorkshopOrderSourceMap(sourceOrderIds);

    return orders.map((order) => {
      const sourceReference = this.resolveSourceReference(
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
      );

      return {
        topicKey: this.toWorkshopTopicKey(order.orderType),
        direction:
          order.orderType === WorkshopMaterialOrderType.RETURN
            ? MonthlyReportingDirection.IN
            : MonthlyReportingDirection.OUT,
        documentType: BusinessDocumentType.WorkshopMaterialOrder,
        documentTypeLabel: this.toWorkshopDocumentLabel(order.orderType),
        documentId: order.id,
        documentNo: order.documentNo,
        bizDate: order.bizDate,
        createdAt: order.createdAt,
        stockScope: this.toStockScopeCode(order.stockScope?.scopeCode),
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
        cost: this.sumNullableDecimals(order.lines.map((line) => line.costAmount)),
        abnormalFlags: this.buildAbnormalFlags({
          bizDate: order.bizDate,
          createdAt: order.createdAt,
          sourceBizDate: sourceReference.sourceBizDate,
        }),
        sourceBizDate: sourceReference.sourceBizDate,
        sourceDocumentNo: sourceReference.sourceDocumentNo,
      };
    });
  }

  private async findRdProjectMonthlyEntries(params: {
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
      await this.loadRdProjectActionSourceMap(sourceActionIds);

    return actions.map((action) => {
      const sourceReference = this.resolveSourceReference(
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
      );

      return {
        topicKey: this.toRdProjectTopicKey(action.actionType),
        direction:
          action.actionType === RdProjectMaterialActionType.RETURN
            ? MonthlyReportingDirection.IN
            : MonthlyReportingDirection.OUT,
        documentType: BusinessDocumentType.RdProjectMaterialAction,
        documentTypeLabel: this.toRdProjectDocumentLabel(action.actionType),
        documentId: action.id,
        documentNo: action.documentNo,
        bizDate: action.bizDate,
        createdAt: action.createdAt,
        stockScope: this.toStockScopeCode(action.stockScope?.scopeCode),
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
        cost: this.sumNullableDecimals(action.lines.map((line) => line.costAmount)),
        abnormalFlags: this.buildAbnormalFlags({
          bizDate: action.bizDate,
          createdAt: action.createdAt,
          sourceBizDate: sourceReference.sourceBizDate,
        }),
        sourceBizDate: sourceReference.sourceBizDate,
        sourceDocumentNo: sourceReference.sourceDocumentNo,
      };
    });
  }

  private async findRdHandoffMonthlyEntries(params: {
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
            costAmount: true,
          },
        },
      },
      orderBy: [{ bizDate: "asc" }, { id: "asc" }],
    });

    return orders.map((order) => ({
      topicKey: MonthlyReportingTopicKey.RD_HANDOFF,
      direction: MonthlyReportingDirection.TRANSFER,
      documentType: BusinessDocumentType.RdHandoffOrder,
      documentTypeLabel: "RD 交接单",
      documentId: order.id,
      documentNo: order.documentNo,
      bizDate: order.bizDate,
      createdAt: order.createdAt,
      stockScope: null,
      stockScopeName: this.joinArrowLabels(
        order.sourceStockScope?.scopeName ?? null,
        order.targetStockScope?.scopeName ?? null,
      ),
      workshopId: null,
      workshopName: this.joinArrowLabels(
        order.sourceWorkshop?.workshopName ??
          order.sourceWorkshopNameSnapshot ??
          null,
        order.targetWorkshop?.workshopName ??
          order.targetWorkshopNameSnapshot ??
          null,
      ),
      salesProjectIds: [],
      salesProjectCodes: [],
      salesProjectNames: [],
      rdProjectId: null,
      rdProjectCode: null,
      rdProjectName: null,
      sourceStockScopeName: order.sourceStockScope?.scopeName ?? null,
      targetStockScopeName: order.targetStockScope?.scopeName ?? null,
      sourceWorkshopName:
        order.sourceWorkshop?.workshopName ??
        order.sourceWorkshopNameSnapshot ??
        null,
      targetWorkshopName:
        order.targetWorkshop?.workshopName ??
        order.targetWorkshopNameSnapshot ??
        null,
      quantity: order.totalQty,
      amount: order.totalAmount,
      cost: this.sumNullableDecimals(order.lines.map((line) => line.costAmount)),
      abnormalFlags: this.buildAbnormalFlags({
        bizDate: order.bizDate,
        createdAt: order.createdAt,
      }),
      sourceBizDate: null,
      sourceDocumentNo: null,
    }));
  }

  private async findRdStocktakeMonthlyEntries(params: {
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
          },
        },
      },
      orderBy: [{ bizDate: "asc" }, { id: "asc" }],
    });

    return orders.flatMap((order) => {
      const positiveLines = order.lines.filter((line) =>
        new Prisma.Decimal(line.adjustmentQty).gt(0),
      );
      const negativeLines = order.lines.filter((line) =>
        new Prisma.Decimal(line.adjustmentQty).lt(0),
      );
      const abnormalFlags = this.buildAbnormalFlags({
        bizDate: order.bizDate,
        createdAt: order.createdAt,
        extraFlags: [MonthlyReportingAbnormalFlag.STOCKTAKE_ADJUSTMENT],
      });

      const entries: MonthlyReportEntry[] = [];

      if (positiveLines.length > 0) {
        entries.push({
          topicKey: MonthlyReportingTopicKey.RD_STOCKTAKE_GAIN,
          direction: MonthlyReportingDirection.IN,
          documentType: BusinessDocumentType.RdStocktakeOrder,
          documentTypeLabel: "RD 盘点调整单",
          documentId: order.id,
          documentNo: order.documentNo,
          bizDate: order.bizDate,
          createdAt: order.createdAt,
          stockScope: this.toStockScopeCode(order.stockScope?.scopeCode),
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
          quantity: this.sumNullableDecimals(
            positiveLines.map((line) => line.adjustmentQty),
          ),
          amount: this.sumNullableDecimals(
            positiveLines.map((line) => line.inventoryLog?.costAmount),
          ),
          cost: this.sumNullableDecimals(
            positiveLines.map((line) => line.inventoryLog?.costAmount),
          ),
          abnormalFlags,
          sourceBizDate: null,
          sourceDocumentNo: null,
        });
      }

      if (negativeLines.length > 0) {
        entries.push({
          topicKey: MonthlyReportingTopicKey.RD_STOCKTAKE_LOSS,
          direction: MonthlyReportingDirection.OUT,
          documentType: BusinessDocumentType.RdStocktakeOrder,
          documentTypeLabel: "RD 盘点调整单",
          documentId: order.id,
          documentNo: order.documentNo,
          bizDate: order.bizDate,
          createdAt: order.createdAt,
          stockScope: this.toStockScopeCode(order.stockScope?.scopeCode),
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
          quantity: this.sumNullableDecimals(
            negativeLines.map((line) =>
              new Prisma.Decimal(line.adjustmentQty).abs(),
            ),
          ),
          amount: this.sumNullableDecimals(
            negativeLines.map((line) => line.inventoryLog?.costAmount),
          ),
          cost: this.sumNullableDecimals(
            negativeLines.map((line) => line.inventoryLog?.costAmount),
          ),
          abnormalFlags,
          sourceBizDate: null,
          sourceDocumentNo: null,
        });
      }

      return entries;
    });
  }

  private async findPriceCorrectionMonthlyEntries(params: {
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
      const sourceReference = this.resolveSourceReference(
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
      );
      const abnormalFlags = this.buildAbnormalFlags({
        bizDate: order.bizDate,
        createdAt: order.createdAt,
        sourceBizDate: sourceReference.sourceBizDate,
        extraFlags: [MonthlyReportingAbnormalFlag.PRICE_CORRECTION],
      });
      const totalOutQty = this.sumNullableDecimals(
        order.lines.map((line) => line.remainingQtyAtCorrection),
      );
      const totalOutAmount = this.sumNullableDecimals(
        order.lines.map(
          (line) =>
            line.generatedOutLog?.costAmount ??
            this.multiplyDecimals(
              line.remainingQtyAtCorrection,
              line.wrongUnitCost,
            ),
        ),
      );
      const totalInQty = this.sumNullableDecimals(
        order.lines.map((line) => line.remainingQtyAtCorrection),
      );
      const totalInAmount = this.sumNullableDecimals(
        order.lines.map((line) =>
          this.toDecimal(line.generatedInLog?.costAmount).add(
            this.toDecimal(line.historicalDiffAmount),
          ),
        ),
      );
      const entries: MonthlyReportEntry[] = [];

      if (!totalOutQty.eq(0) || !totalOutAmount.eq(0)) {
        entries.push({
          topicKey: MonthlyReportingTopicKey.PRICE_CORRECTION_OUT,
          direction: MonthlyReportingDirection.OUT,
          documentType: BusinessDocumentType.StockInPriceCorrectionOrder,
          documentTypeLabel: "入库调价单",
          documentId: order.id,
          documentNo: order.documentNo,
          bizDate: order.bizDate,
          createdAt: order.createdAt,
          stockScope: this.toStockScopeCode(order.stockScope?.scopeCode),
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
          documentTypeLabel: "入库调价单",
          documentId: order.id,
          documentNo: order.documentNo,
          bizDate: order.bizDate,
          createdAt: order.createdAt,
          stockScope: this.toStockScopeCode(order.stockScope?.scopeCode),
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

  private mapLogGroupToSnapshot(
    group: InventoryLogTrendGroup,
    sourceType: TrendDocumentSnapshot["sourceType"],
  ): TrendDocumentSnapshot {
    return {
      sourceType,
      bizDate: group.bizDate,
      totalQty: group._sum?.changeQty ?? new Prisma.Decimal(0),
      totalAmount: group._sum?.costAmount ?? new Prisma.Decimal(0),
    };
  }

  private async loadSalesOrderSourceMap(sourceIds: number[]) {
    if (sourceIds.length === 0) {
      return new Map<number, { bizDate: Date; documentNo: string }>();
    }

    const orders = await this.prisma.salesStockOrder.findMany({
      where: { id: { in: sourceIds } },
      select: {
        id: true,
        bizDate: true,
        documentNo: true,
      },
    });

    return new Map(
      orders.map((item) => [
        item.id,
        {
          bizDate: item.bizDate,
          documentNo: item.documentNo,
        },
      ]),
    );
  }

  private async loadWorkshopOrderSourceMap(sourceIds: number[]) {
    if (sourceIds.length === 0) {
      return new Map<number, { bizDate: Date; documentNo: string }>();
    }

    const orders = await this.prisma.workshopMaterialOrder.findMany({
      where: { id: { in: sourceIds } },
      select: {
        id: true,
        bizDate: true,
        documentNo: true,
      },
    });

    return new Map(
      orders.map((item) => [
        item.id,
        {
          bizDate: item.bizDate,
          documentNo: item.documentNo,
        },
      ]),
    );
  }

  private async loadRdProjectActionSourceMap(sourceIds: number[]) {
    if (sourceIds.length === 0) {
      return new Map<number, { bizDate: Date; documentNo: string }>();
    }

    const actions = await this.prisma.rdProjectMaterialAction.findMany({
      where: { id: { in: sourceIds } },
      select: {
        id: true,
        bizDate: true,
        documentNo: true,
      },
    });

    return new Map(
      actions.map((item) => [
        item.id,
        {
          bizDate: item.bizDate,
          documentNo: item.documentNo,
        },
      ]),
    );
  }

  private resolveSourceReference(
    currentBizDate: Date,
    sources: Array<{ bizDate: Date; documentNo: string }>,
  ) {
    const uniqueDocumentNos = [...new Set(sources.map((item) => item.documentNo))];
    const matchedSource =
      sources.find(
        (item) =>
          !isSameYearMonth(
            item.bizDate,
            currentBizDate,
            this.appConfigService.businessTimezone,
          ),
      ) ??
      sources[0] ??
      null;

    return {
      sourceBizDate: matchedSource?.bizDate ?? null,
      sourceDocumentNo:
        uniqueDocumentNos.length === 0
          ? null
          : uniqueDocumentNos.length === 1
            ? uniqueDocumentNos[0]
            : `${uniqueDocumentNos[0]} 等${uniqueDocumentNos.length}张`,
    };
  }

  private buildAbnormalFlags(params: {
    bizDate: Date;
    createdAt: Date;
    sourceBizDate?: Date | null;
    extraFlags?: MonthlyReportingAbnormalFlag[];
  }) {
    const flags = [...(params.extraFlags ?? [])];

    if (
      !isSameYearMonth(
        params.bizDate,
        params.createdAt,
        this.appConfigService.businessTimezone,
      )
    ) {
      flags.push(MonthlyReportingAbnormalFlag.BACKFILL_IMPACT);
    }

    if (
      params.sourceBizDate &&
      !isSameYearMonth(
        params.bizDate,
        params.sourceBizDate,
        this.appConfigService.businessTimezone,
      )
    ) {
      flags.push(MonthlyReportingAbnormalFlag.CROSS_MONTH_REFERENCE);
    }

    return [...new Set(flags)];
  }

  private toWorkshopTopicKey(orderType: WorkshopMaterialOrderType) {
    switch (orderType) {
      case WorkshopMaterialOrderType.PICK:
        return MonthlyReportingTopicKey.WORKSHOP_PICK;
      case WorkshopMaterialOrderType.RETURN:
        return MonthlyReportingTopicKey.WORKSHOP_RETURN;
      default:
        return MonthlyReportingTopicKey.WORKSHOP_SCRAP;
    }
  }

  private toWorkshopDocumentLabel(orderType: WorkshopMaterialOrderType) {
    switch (orderType) {
      case WorkshopMaterialOrderType.PICK:
        return "领料单";
      case WorkshopMaterialOrderType.RETURN:
        return "退料单";
      default:
        return "报废单";
    }
  }

  private toRdProjectTopicKey(actionType: RdProjectMaterialActionType) {
    switch (actionType) {
      case RdProjectMaterialActionType.PICK:
        return MonthlyReportingTopicKey.RD_PROJECT_PICK;
      case RdProjectMaterialActionType.RETURN:
        return MonthlyReportingTopicKey.RD_PROJECT_RETURN;
      default:
        return MonthlyReportingTopicKey.RD_PROJECT_SCRAP;
    }
  }

  private toRdProjectDocumentLabel(actionType: RdProjectMaterialActionType) {
    switch (actionType) {
      case RdProjectMaterialActionType.PICK:
        return "项目领用单";
      case RdProjectMaterialActionType.RETURN:
        return "项目退回单";
      default:
        return "项目报废单";
    }
  }

  private toStockScopeCode(scopeCode?: string | null): StockScopeCode | null {
    if (scopeCode === "MAIN" || scopeCode === "RD_SUB") {
      return scopeCode;
    }

    return null;
  }

  private sumNullableDecimals(
    values: Array<Prisma.Decimal | string | number | null | undefined>,
  ): Prisma.Decimal {
    return values.reduce<Prisma.Decimal>(
      (accumulator, current) => accumulator.add(this.toDecimal(current)),
      new Prisma.Decimal(0),
    );
  }

  private toDecimal(value: Prisma.Decimal | string | number | null | undefined) {
    return new Prisma.Decimal(value ?? 0);
  }

  private multiplyDecimals(
    left: Prisma.Decimal | string | number | null | undefined,
    right: Prisma.Decimal | string | number | null | undefined,
  ) {
    return this.toDecimal(left).mul(this.toDecimal(right));
  }

  private collectDistinctNumbers(
    values: Array<number | null | undefined>,
  ): number[] {
    return [...new Set(values.filter((value): value is number => typeof value === "number"))];
  }

  private collectDistinctStrings(
    values: Array<string | null | undefined>,
  ): string[] {
    return [
      ...new Set(
        values.filter(
          (value): value is string => typeof value === "string" && value.trim().length > 0,
        ),
      ),
    ];
  }

  private joinArrowLabels(left?: string | null, right?: string | null) {
    if (left && right) {
      return `${left} -> ${right}`;
    }

    return left ?? right ?? null;
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
