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
  sourceType: "INBOUND" | "SALES" | "WORKSHOP_MATERIAL" | "RD_PROJECT" | "RD";
  bizDate: Date;
  totalQty: Prisma.Decimal;
  totalAmount: Prisma.Decimal;
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
        AND src_log.operation_type IN (${Prisma.join(
          INVENTORY_VALUE_SOURCE_OPERATION_TYPES,
        )})
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

  private buildInventoryStockScopeFilter(stockScopeIds: number[]) {
    return stockScopeIds.length === 1
      ? stockScopeIds[0]
      : { in: stockScopeIds };
  }
}
