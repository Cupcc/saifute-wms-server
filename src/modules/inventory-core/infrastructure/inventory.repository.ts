import { Injectable } from "@nestjs/common";
import {
  InventoryOperationType,
  Prisma,
  StockDirection,
} from "../../../../generated/prisma/client";
import { PrismaService } from "../../../shared/prisma/prisma.service";

type InventoryDbClient = Prisma.TransactionClient | PrismaService;

@Injectable()
export class InventoryRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findBalances(params: {
    materialId?: number;
    stockScopeIds?: number[];
    limit: number;
    offset: number;
  }) {
    const where: Prisma.InventoryBalanceWhereInput = {};
    if (params.materialId) where.materialId = params.materialId;
    if (params.stockScopeIds?.length === 1) {
      where.stockScopeId = params.stockScopeIds[0];
    } else if (params.stockScopeIds?.length) {
      where.stockScopeId = { in: params.stockScopeIds };
    }

    const [items, total] = await Promise.all([
      this.prisma.inventoryBalance.findMany({
        where,
        take: params.limit,
        skip: params.offset,
        include: { material: true, stockScope: true },
      }),
      this.prisma.inventoryBalance.count({ where }),
    ]);

    return { items, total };
  }

  async findBalanceByMaterialAndStockScope(
    materialId: number,
    stockScopeId: number,
    db: InventoryDbClient = this.prisma,
  ) {
    return db.inventoryBalance.findUnique({
      where: {
        materialId_stockScopeId: {
          materialId,
          stockScopeId,
        },
      },
    });
  }

  async findLogs(params: {
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
  }) {
    const where: Prisma.InventoryLogWhereInput = {};
    if (params.materialId) where.materialId = params.materialId;
    if (params.stockScopeIds?.length === 1) {
      where.stockScopeId = params.stockScopeIds[0];
    } else if (params.stockScopeIds?.length) {
      where.stockScopeId = { in: params.stockScopeIds };
    }
    if (params.workshopId) where.workshopId = params.workshopId;
    if (params.businessDocumentId)
      where.businessDocumentId = params.businessDocumentId;
    if (params.businessDocumentType)
      where.businessDocumentType = params.businessDocumentType;
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

    const [items, total] = await Promise.all([
      this.prisma.inventoryLog.findMany({
        where,
        take: params.limit,
        skip: params.offset,
        orderBy: [{ bizDate: "desc" }, { occurredAt: "desc" }, { id: "desc" }],
        include: { material: true, stockScope: true, workshop: true },
      }),
      this.prisma.inventoryLog.count({ where }),
    ]);

    return { items, total };
  }

  async findSourceUsages(
    params: {
      materialId?: number;
      stockScopeIds?: number[];
      consumerDocumentType?: string;
      consumerDocumentId?: number;
      limit: number;
      offset: number;
    },
    db: InventoryDbClient = this.prisma,
  ) {
    const where: Prisma.InventorySourceUsageWhereInput = {};
    if (params.materialId) where.materialId = params.materialId;
    if (params.stockScopeIds?.length === 1) {
      where.sourceLog = { stockScopeId: params.stockScopeIds[0] };
    } else if (params.stockScopeIds?.length) {
      where.sourceLog = {
        stockScopeId: { in: params.stockScopeIds },
      };
    }
    if (params.consumerDocumentType)
      where.consumerDocumentType = params.consumerDocumentType;
    if (params.consumerDocumentId)
      where.consumerDocumentId = params.consumerDocumentId;

    const [items, total] = await Promise.all([
      db.inventorySourceUsage.findMany({
        where,
        take: params.limit,
        skip: params.offset,
        include: { material: true, sourceLog: true },
      }),
      db.inventorySourceUsage.count({ where }),
    ]);

    return { items, total };
  }

  async findSourceUsagesForConsumerLine(
    params: {
      consumerDocumentType: string;
      consumerDocumentId: number;
      consumerLineId: number;
    },
    db: InventoryDbClient = this.prisma,
  ) {
    return db.inventorySourceUsage.findMany({
      where: {
        consumerDocumentType: params.consumerDocumentType,
        consumerDocumentId: params.consumerDocumentId,
        consumerLineId: params.consumerLineId,
      },
      include: { material: true, sourceLog: true },
    });
  }

  async lockSourceLog(
    sourceLogId: number,
    db: InventoryDbClient = this.prisma,
  ) {
    await db.$queryRaw`
      SELECT id
      FROM inventory_log
      WHERE id = ${sourceLogId}
      FOR UPDATE
    `;
  }

  async findLogByIdempotencyKey(
    idempotencyKey: string,
    db: InventoryDbClient = this.prisma,
  ) {
    return db.inventoryLog.findUnique({
      where: { idempotencyKey },
    });
  }

  async findLogById(id: number, db: InventoryDbClient = this.prisma) {
    return db.inventoryLog.findUnique({
      where: { id },
      include: { balance: true },
    });
  }

  async findReversalLogBySourceLogId(
    sourceLogId: number,
    db: InventoryDbClient = this.prisma,
  ) {
    return db.inventoryLog.findUnique({
      where: { reversalOfLogId: sourceLogId },
    });
  }

  async findOriginalLogsByBusinessDocument(
    params: {
      businessDocumentType: string;
      businessDocumentId: number;
    },
    db: InventoryDbClient = this.prisma,
  ) {
    const [originalLogs, reversalLogs] = await Promise.all([
      db.inventoryLog.findMany({
        where: {
          businessDocumentType: params.businessDocumentType,
          businessDocumentId: params.businessDocumentId,
          reversalOfLogId: null,
        },
        orderBy: [{ bizDate: "asc" }, { occurredAt: "asc" }, { id: "asc" }],
      }),
      db.inventoryLog.findMany({
        where: {
          businessDocumentType: params.businessDocumentType,
          businessDocumentId: params.businessDocumentId,
          reversalOfLogId: { not: null },
        },
        select: { reversalOfLogId: true },
      }),
    ]);

    const reversedLogIds = new Set(
      reversalLogs
        .map((log) => log.reversalOfLogId)
        .filter((logId): logId is number => logId !== null),
    );

    return originalLogs.filter((log) => !reversedLogIds.has(log.id));
  }

  async findSourceUsage(
    params: {
      sourceLogId: number;
      consumerDocumentType: string;
      consumerDocumentId: number;
      consumerLineId: number;
    },
    db: InventoryDbClient = this.prisma,
  ) {
    return db.inventorySourceUsage.findFirst({
      where: {
        sourceLogId: params.sourceLogId,
        consumerDocumentType: params.consumerDocumentType,
        consumerDocumentId: params.consumerDocumentId,
        consumerLineId: params.consumerLineId,
      },
    });
  }

  async getSourceUsageTotals(
    sourceLogId: number,
    db: InventoryDbClient = this.prisma,
  ) {
    const usages = await db.inventorySourceUsage.findMany({
      where: { sourceLogId },
      select: { allocatedQty: true, releasedQty: true },
    });

    return usages.reduce(
      (totals, usage) => ({
        allocatedQty: totals.allocatedQty.add(usage.allocatedQty),
        releasedQty: totals.releasedQty.add(usage.releasedQty),
      }),
      {
        allocatedQty: new Prisma.Decimal(0),
        releasedQty: new Prisma.Decimal(0),
      },
    );
  }

  async createSourceUsage(
    data: Prisma.InventorySourceUsageUncheckedCreateInput,
    db: InventoryDbClient = this.prisma,
  ) {
    return db.inventorySourceUsage.create({ data });
  }

  async updateSourceUsage(
    id: number,
    data: Prisma.InventorySourceUsageUncheckedUpdateInput,
    db: InventoryDbClient = this.prisma,
  ) {
    return db.inventorySourceUsage.update({
      where: { id },
      data,
    });
  }

  /**
   * Returns IN logs eligible as FIFO source layers for the given material and
   * stock scope. Filters by operation type (only real inbound types), excludes
   * logs that have been reversed, and includes only logs with remaining available
   * quantity (changeQty minus net allocated). Results are ordered oldest-first so
   * callers can greedily consume from the front.
   */
  async findFifoSourceLogs(
    params: {
      materialId: number;
      stockScopeId: number;
      sourceOperationTypes: InventoryOperationType[];
      unitCost?: Prisma.Decimal;
      projectTargetId?: number;
    },
    db: InventoryDbClient = this.prisma,
  ) {
    const logs = await db.inventoryLog.findMany({
      where: {
        materialId: params.materialId,
        stockScopeId: params.stockScopeId,
        direction: StockDirection.IN,
        operationType: { in: params.sourceOperationTypes },
        ...(typeof params.projectTargetId === "number"
          ? { projectTargetId: params.projectTargetId }
          : {}),
        ...(params.unitCost ? { unitCost: params.unitCost } : {}),
        reversalOfLogId: null,
        reversedByLogs: { none: {} },
      },
      include: {
        allocatedSourceUsages: {
          select: { allocatedQty: true, releasedQty: true },
        },
      },
      orderBy: [{ bizDate: "asc" }, { occurredAt: "asc" }, { id: "asc" }],
    });

    return logs
      .map((log) => {
        const netAllocated = log.allocatedSourceUsages.reduce(
          (sum, u) =>
            sum
              .add(new Prisma.Decimal(u.allocatedQty))
              .sub(new Prisma.Decimal(u.releasedQty)),
          new Prisma.Decimal(0),
        );
        const availableQty = new Prisma.Decimal(log.changeQty).sub(
          netAllocated,
        );
        return {
          id: log.id,
          changeQty: new Prisma.Decimal(log.changeQty),
          occurredAt: log.occurredAt,
          unitCost: log.unitCost ? new Prisma.Decimal(log.unitCost) : null,
          availableQty,
        };
      })
      .filter((log) => log.availableQty.gt(0));
  }

  async findEffectiveLogsByProjectTarget(
    params: {
      stockScopeId: number;
      projectTargetId: number;
      materialIds?: number[];
    },
    db: InventoryDbClient = this.prisma,
  ) {
    return db.inventoryLog.findMany({
      where: {
        stockScopeId: params.stockScopeId,
        projectTargetId: params.projectTargetId,
        ...(params.materialIds?.length
          ? { materialId: { in: params.materialIds } }
          : {}),
        reversalOfLogId: null,
        reversedByLogs: { none: {} },
      },
      select: {
        materialId: true,
        direction: true,
        changeQty: true,
      },
      orderBy: [{ bizDate: "asc" }, { occurredAt: "asc" }, { id: "asc" }],
    });
  }

  /**
   * Finds all non-released source usages for a given consumer document, used to
   * bulk-release them when the consumer document is voided.
   */
  async findActiveSourceUsagesForConsumer(
    params: {
      consumerDocumentType: string;
      consumerDocumentId: number;
    },
    db: InventoryDbClient = this.prisma,
  ) {
    return db.inventorySourceUsage.findMany({
      where: {
        consumerDocumentType: params.consumerDocumentType,
        consumerDocumentId: params.consumerDocumentId,
        status: { not: "RELEASED" },
      },
    });
  }

  /**
   * Finds all non-released source usages for a single consumer document line.
   * Used to release allocations before reversing a specific OUT log during update.
   */
  async findActiveSourceUsagesForConsumerLine(
    params: {
      consumerDocumentType: string;
      consumerDocumentId: number;
      consumerLineId: number;
    },
    db: InventoryDbClient = this.prisma,
  ) {
    return db.inventorySourceUsage.findMany({
      where: {
        consumerDocumentType: params.consumerDocumentType,
        consumerDocumentId: params.consumerDocumentId,
        consumerLineId: params.consumerLineId,
        status: { not: "RELEASED" },
      },
    });
  }
}
