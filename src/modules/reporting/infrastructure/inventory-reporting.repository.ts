import { Injectable } from "@nestjs/common";
import {
  InventoryOperationType,
  MasterDataStatus,
  Prisma,
} from "../../../../generated/prisma/client";
import { BusinessDocumentType } from "../../../shared/domain/business-document-type";
import { PrismaService } from "../../../shared/prisma/prisma.service";

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
  sourceType:
    | "INBOUND"
    | "SALES"
    | "WORKSHOP_MATERIAL"
    | "RD_PROJECT"
    | "RD_HANDOFF"
    | "RD_STOCKTAKE_GAIN"
    | "RD_STOCKTAKE_LOSS";
  bizDate: Date;
  businessDocumentType: string;
  businessDocumentId: number;
  totalAmount: Prisma.Decimal;
  inventoryCostDelta: Prisma.Decimal;
}

interface InventoryLogTrendGroup {
  bizDate: Date;
  operationType: InventoryOperationType;
  businessDocumentType: string;
  businessDocumentId: number;
  _sum: {
    costAmount: Prisma.Decimal | null;
  } | null;
}

const INVENTORY_VALUE_SOURCE_OPERATION_TYPES = [
  InventoryOperationType.ACCEPTANCE_IN,
  InventoryOperationType.PRODUCTION_RECEIPT_IN,
  InventoryOperationType.PRICE_CORRECTION_IN,
  InventoryOperationType.RD_HANDOFF_IN,
];

const HISTORICAL_REPLAY_RETURN_SOURCE_NOTE_PREFIXES = [
  "Standalone sales return source accepted",
  "Accepted standalone workshop return source",
  "Historical linked sales return had insufficient releasable source usage",
  "Historical linked workshop return had insufficient releasable source usage",
];

@Injectable()
export class InventoryReportingRepository {
  constructor(private readonly prisma: PrismaService) {}

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
      ? Prisma.sql`AND src_log.material_id IN (${Prisma.join(params.materialIds)})`
      : Prisma.empty;
    const rows = await this.prisma.$queryRaw<
      Array<{
        materialId: number;
        stockScopeId: number | null;
        inventoryValue: Prisma.Decimal | string | number | null;
      }>
    >(Prisma.sql`
      SELECT
        src_log.material_id AS materialId,
        src_log.stock_scope_id AS stockScopeId,
        SUM(
          (src_log.change_qty - COALESCE(usage_summary.netAllocatedQty, 0)) * src_log.unit_cost
        ) AS inventoryValue
      FROM inventory_log src_log
      INNER JOIN material material ON material.id = src_log.material_id
      LEFT JOIN (
        SELECT
          source_log_id,
          SUM(allocated_qty - released_qty) AS netAllocatedQty
        FROM inventory_source_usage
        GROUP BY source_log_id
      ) usage_summary ON usage_summary.source_log_id = src_log.id
      WHERE src_log.stock_scope_id IN (${Prisma.join(params.inventoryStockScopeIds)})
        ${materialFilter}
        AND material.status = ${MasterDataStatus.ACTIVE}
        AND src_log.direction = ${"IN"}
        AND (
          src_log.operation_type IN (${Prisma.join(
            INVENTORY_VALUE_SOURCE_OPERATION_TYPES,
          )})
          OR (
            src_log.operation_type IN (${Prisma.join([
              InventoryOperationType.SALES_RETURN_IN,
              InventoryOperationType.RETURN_IN,
            ])})
            AND (
              ${Prisma.join(
                HISTORICAL_REPLAY_RETURN_SOURCE_NOTE_PREFIXES.map(
                  (prefix) => Prisma.sql`src_log.note LIKE ${`${prefix}%`}`,
                ),
                " OR ",
              )}
            )
          )
        )
        AND src_log.unit_cost IS NOT NULL
        AND src_log.reversal_of_log_id IS NULL
        AND NOT EXISTS (
          SELECT 1
          FROM inventory_log reversed
          WHERE reversed.reversal_of_log_id = src_log.id
        )
      GROUP BY src_log.material_id, src_log.stock_scope_id
      HAVING SUM(src_log.change_qty - COALESCE(usage_summary.netAllocatedQty, 0)) > 0
    `);

    return rows.map((row) => ({
      materialId: Number(row.materialId),
      stockScopeId: row.stockScopeId === null ? null : Number(row.stockScopeId),
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
      reversalOfLogId: null,
      reversedByLogs: { none: {} },
      ...(params.workshopId ? { workshopId: params.workshopId } : {}),
    };

    const inboundTypes = [
      InventoryOperationType.ACCEPTANCE_IN,
      InventoryOperationType.PRODUCTION_RECEIPT_IN,
    ];
    const inboundReturnTypes = [InventoryOperationType.SUPPLIER_RETURN_OUT];
    const salesTypes = [
      InventoryOperationType.OUTBOUND_OUT,
      InventoryOperationType.SALES_RETURN_IN,
    ];
    const workshopMaterialTypes = [
      InventoryOperationType.PICK_OUT,
      InventoryOperationType.RETURN_IN,
      InventoryOperationType.SCRAP_OUT,
    ];
    const rdProjectTypes = [
      InventoryOperationType.RD_PROJECT_OUT,
      InventoryOperationType.RETURN_IN,
      InventoryOperationType.SCRAP_OUT,
    ];
    const rdHandoffTypes = [
      InventoryOperationType.RD_HANDOFF_OUT,
      InventoryOperationType.RD_HANDOFF_IN,
    ];
    const rdStocktakeTypes = [
      InventoryOperationType.RD_STOCKTAKE_IN,
      InventoryOperationType.RD_STOCKTAKE_OUT,
    ];

    const groupByBusinessDocument = (where: Prisma.InventoryLogWhereInput) =>
      this.prisma.inventoryLog.groupBy({
        by: [
          "bizDate",
          "operationType",
          "businessDocumentType",
          "businessDocumentId",
        ],
        where,
        _sum: { costAmount: true },
      });

    const [
      inbound,
      inboundReturns,
      sales,
      workshopMaterial,
      rdProject,
      rdHandoff,
      rdStocktake,
    ] = await Promise.all([
      groupByBusinessDocument({
        ...baseWhere,
        businessDocumentType: BusinessDocumentType.StockInOrder,
        operationType: { in: inboundTypes },
      }),
      groupByBusinessDocument({
        ...baseWhere,
        businessDocumentType: BusinessDocumentType.StockInOrder,
        operationType: { in: inboundReturnTypes },
      }),
      groupByBusinessDocument({
        ...baseWhere,
        businessDocumentType: BusinessDocumentType.SalesStockOrder,
        operationType: { in: salesTypes },
      }),
      groupByBusinessDocument({
        ...baseWhere,
        businessDocumentType: BusinessDocumentType.WorkshopMaterialOrder,
        operationType: { in: workshopMaterialTypes },
      }),
      groupByBusinessDocument({
        ...baseWhere,
        businessDocumentType: BusinessDocumentType.RdProjectMaterialAction,
        operationType: { in: rdProjectTypes },
      }),
      groupByBusinessDocument({
        ...baseWhere,
        businessDocumentType: BusinessDocumentType.RdHandoffOrder,
        operationType: { in: rdHandoffTypes },
      }),
      groupByBusinessDocument({
        ...baseWhere,
        businessDocumentType: BusinessDocumentType.RdStocktakeOrder,
        operationType: { in: rdStocktakeTypes },
      }),
    ]);

    return [
      ...inbound.map((item) =>
        this.mapLogGroupToSnapshot(item, "INBOUND", 1, 1),
      ),
      ...inboundReturns.map((item) =>
        this.mapLogGroupToSnapshot(item, "INBOUND", -1, -1),
      ),
      ...sales.map((item) => this.mapConsumptionLogGroup(item, "SALES")),
      ...workshopMaterial.map((item) =>
        this.mapConsumptionLogGroup(item, "WORKSHOP_MATERIAL"),
      ),
      ...rdProject.map((item) =>
        this.mapConsumptionLogGroup(item, "RD_PROJECT"),
      ),
      ...rdHandoff.map((item) => {
        const sign =
          item.operationType === InventoryOperationType.RD_HANDOFF_IN ? 1 : -1;
        return this.mapLogGroupToSnapshot(item, "RD_HANDOFF", sign, sign);
      }),
      ...rdStocktake.map((item) => {
        const isGain =
          item.operationType === InventoryOperationType.RD_STOCKTAKE_IN;
        const sign = isGain ? 1 : -1;
        return this.mapLogGroupToSnapshot(
          item,
          isGain ? "RD_STOCKTAKE_GAIN" : "RD_STOCKTAKE_LOSS",
          sign,
          sign,
        );
      }),
    ];
  }

  private mapConsumptionLogGroup(
    group: InventoryLogTrendGroup,
    sourceType: "SALES" | "WORKSHOP_MATERIAL" | "RD_PROJECT",
  ): TrendDocumentSnapshot {
    const isReturn =
      group.operationType === InventoryOperationType.RETURN_IN ||
      group.operationType === InventoryOperationType.SALES_RETURN_IN;
    const consumptionSign: 1 | -1 = isReturn ? -1 : 1;
    const inventorySign: 1 | -1 = isReturn ? 1 : -1;
    return this.mapLogGroupToSnapshot(
      group,
      sourceType,
      consumptionSign,
      inventorySign,
    );
  }

  private mapLogGroupToSnapshot(
    group: InventoryLogTrendGroup,
    sourceType: TrendDocumentSnapshot["sourceType"],
    displaySign: 1 | -1,
    inventorySign: 1 | -1,
  ): TrendDocumentSnapshot {
    const totalAmount = group._sum?.costAmount ?? new Prisma.Decimal(0);
    return {
      sourceType,
      bizDate: group.bizDate,
      businessDocumentType: group.businessDocumentType,
      businessDocumentId: group.businessDocumentId,
      totalAmount: displaySign < 0 ? totalAmount.neg() : totalAmount,
      inventoryCostDelta: inventorySign < 0 ? totalAmount.neg() : totalAmount,
    };
  }

  private buildInventoryStockScopeFilter(stockScopeIds: number[]) {
    return stockScopeIds.length === 1
      ? stockScopeIds[0]
      : { in: stockScopeIds };
  }
}
