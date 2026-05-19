import { ConflictException, Injectable } from "@nestjs/common";
import {
  InventoryOperationType,
  Prisma,
  StockDirection,
} from "../../../../generated/prisma/client";
import { PrismaService } from "../../../shared/prisma/prisma.service";
import {
  type FindInventoryBalancesParams,
  InventoryBalanceQueryRepository,
} from "./inventory-balance-query.repository";
import {
  type FindInventoryLogsParams,
  type FindPriceLayerSnapshotLogsParams,
  InventoryLogQueryRepository,
} from "./inventory-log-query.repository";

type InventoryDbClient = Prisma.TransactionClient | PrismaService;

const HISTORICAL_REPLAY_RETURN_SOURCE_NOTE_PREFIXES = [
  "Standalone sales return source accepted",
  "Accepted standalone workshop return source",
  "Historical linked sales return had insufficient releasable source usage",
  "Historical linked workshop return had insufficient releasable source usage",
];

function historicalReplayReturnSourceWhere(): Prisma.InventoryLogWhereInput {
  return {
    operationType: {
      in: [
        InventoryOperationType.SALES_RETURN_IN,
        InventoryOperationType.RETURN_IN,
      ],
    },
    OR: HISTORICAL_REPLAY_RETURN_SOURCE_NOTE_PREFIXES.map((prefix) => ({
      note: { startsWith: prefix },
    })),
  };
}

@Injectable()
export class InventoryRepository {
  private readonly balanceQueries: InventoryBalanceQueryRepository;
  private readonly logQueries: InventoryLogQueryRepository;

  constructor(private readonly prisma: PrismaService) {
    this.balanceQueries = new InventoryBalanceQueryRepository(prisma);
    this.logQueries = new InventoryLogQueryRepository(prisma);
  }

  runInTransaction<T>(
    tx: Prisma.TransactionClient | undefined,
    handler: (db: Prisma.TransactionClient) => Promise<T>,
  ) {
    if (tx) {
      return handler(tx);
    }

    return this.prisma.runInTransaction(handler);
  }

  async updateBalanceOptimistically(
    params: {
      balanceId: number;
      expectedRowVersion: number;
      nextQuantityOnHand: Prisma.Decimal;
      updatedBy?: string;
    },
    db: InventoryDbClient = this.prisma,
  ) {
    const result = await db.inventoryBalance.updateMany({
      where: {
        id: params.balanceId,
        rowVersion: params.expectedRowVersion,
      },
      data: {
        quantityOnHand: params.nextQuantityOnHand,
        rowVersion: { increment: 1 },
        updatedBy: params.updatedBy,
      },
    });

    if (result.count !== 1) {
      throw new ConflictException("库存余额已被并发更新，请重试");
    }
  }

  async findBalances(params: FindInventoryBalancesParams) {
    return this.balanceQueries.findBalances(params);
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

  async findLogs(params: FindInventoryLogsParams) {
    return this.logQueries.findLogs(params);
  }

  async findPriceLayerSnapshotLogs(params: FindPriceLayerSnapshotLogsParams) {
    return this.logQueries.findPriceLayerSnapshotLogs(params);
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
      projectTargetId: number | null;
    },
    db: InventoryDbClient = this.prisma,
  ) {
    const logs = await db.inventoryLog.findMany({
      where: {
        materialId: params.materialId,
        stockScopeId: params.stockScopeId,
        direction: StockDirection.IN,
        OR: [
          { operationType: { in: params.sourceOperationTypes } },
          historicalReplayReturnSourceWhere(),
        ],
        projectTargetId: params.projectTargetId,
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
