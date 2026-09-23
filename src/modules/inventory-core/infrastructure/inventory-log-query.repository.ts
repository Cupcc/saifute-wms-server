import { Prisma } from "../../../../generated/prisma/client";
import { PrismaService } from "../../../shared/prisma/prisma.service";

export type FindInventoryLogsParams = {
  materialId?: number;
  stockScopeIds?: number[];
  workshopId?: number;
  businessDocumentId?: number;
  businessDocumentType?: string;
  businessDocumentNumber?: string;
  operationType?: string;
  bizDateFrom?: Date;
  bizDateTo?: Date;
  limit: number;
  offset: number;
};

export type PriceLayerSnapshotLogKey = {
  materialId: number;
  stockScopeId: number | null;
  projectTargetId: number | null;
  unitCost: Prisma.Decimal;
};

export type FindPriceLayerSnapshotLogsParams = {
  maxLogId: number;
  layerKeys: PriceLayerSnapshotLogKey[];
};

export class InventoryLogQueryRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findLogs(params: FindInventoryLogsParams) {
    const where = this.buildInventoryLogWhere(params);

    const [items, total] = await Promise.all([
      this.prisma.inventoryLog.findMany({
        where,
        take: params.limit,
        skip: params.offset,
        orderBy: { id: "desc" },
        include: { material: true, stockScope: true, workshop: true },
      }),
      this.prisma.inventoryLog.count({ where }),
    ]);

    return { items, total };
  }

  async findPriceLayerSnapshotLogs(params: FindPriceLayerSnapshotLogsParams) {
    if (params.layerKeys.length === 0) {
      return [];
    }

    const scopePredicates = this.uniqueScopePredicates(params.layerKeys);

    const logs = await this.prisma.inventoryLog.findMany({
      where: {
        id: { lte: params.maxLogId },
        OR: scopePredicates,
      },
      select: {
        id: true,
        materialId: true,
        stockScopeId: true,
        projectTargetId: true,
        direction: true,
        changeQty: true,
        unitCost: true,
        costAmount: true,
        operationType: true,
        reversalOfLogId: true,
        note: true,
        reversalOfLog: {
          select: {
            direction: true,
            operationType: true,
            note: true,
            costAllocations: {
              orderBy: { sourceLogId: "asc" },
              select: {
                sourceLogId: true,
                direction: true,
                quantity: true,
                unitCost: true,
                costAmount: true,
                sourceLog: {
                  select: {
                    materialId: true,
                    stockScopeId: true,
                    projectTargetId: true,
                    businessDocumentNumber: true,
                    businessDocumentLineId: true,
                  },
                },
              },
            },
          },
        },
        costAllocations: {
          orderBy: { sourceLogId: "asc" },
          select: {
            sourceLogId: true,
            direction: true,
            quantity: true,
            unitCost: true,
            costAmount: true,
            sourceLog: {
              select: {
                materialId: true,
                stockScopeId: true,
                projectTargetId: true,
                businessDocumentNumber: true,
                businessDocumentLineId: true,
              },
            },
          },
        },
      },
      orderBy: { id: "asc" },
    });

    return logs;
  }

  private buildInventoryLogWhere(
    params: FindInventoryLogsParams,
  ): Prisma.InventoryLogWhereInput {
    const where: Prisma.InventoryLogWhereInput = {};
    if (params.materialId) where.materialId = params.materialId;
    if (params.stockScopeIds?.length === 1) {
      where.stockScopeId = params.stockScopeIds[0];
    } else if (params.stockScopeIds?.length) {
      where.stockScopeId = { in: params.stockScopeIds };
    }
    if (params.workshopId) where.workshopId = params.workshopId;
    if (params.businessDocumentId) {
      where.businessDocumentId = params.businessDocumentId;
    }
    if (params.businessDocumentType) {
      where.businessDocumentType = params.businessDocumentType;
    }
    if (params.businessDocumentNumber) {
      where.businessDocumentNumber = {
        contains: params.businessDocumentNumber,
      };
    }
    if (params.operationType) {
      where.operationType =
        params.operationType as Prisma.EnumInventoryOperationTypeFilter;
    }
    if (params.bizDateFrom || params.bizDateTo) {
      where.bizDate = {};
      if (params.bizDateFrom) {
        where.bizDate.gte = params.bizDateFrom;
      }
      if (params.bizDateTo) {
        where.bizDate.lte = params.bizDateTo;
      }
    }

    return where;
  }

  private uniqueScopePredicates(
    layerKeys: PriceLayerSnapshotLogKey[],
  ): Prisma.InventoryLogWhereInput[] {
    return [
      ...new Map(
        layerKeys.map((key) => [
          [key.materialId, key.stockScopeId ?? "null"].join(":"),
          {
            materialId: key.materialId,
            stockScopeId: key.stockScopeId,
          },
        ]),
      ).values(),
    ];
  }
}
