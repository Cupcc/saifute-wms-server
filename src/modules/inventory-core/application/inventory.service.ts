import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  FactoryNumberReservationStatus,
  InventoryOperationType,
  type InventoryOperationType as InventoryOperationTypeEnum,
  Prisma,
  SourceUsageStatus,
  StockDirection,
} from "../../../generated/prisma/client";
import { PrismaService } from "../../../shared/prisma/prisma.service";
import { MasterDataService } from "../../master-data/application/master-data.service";
import {
  resolveStockScopeFromWorkshopIdentity,
  type StockScopeCode,
} from "../../session/domain/user-session";
import { InventoryRepository } from "../infrastructure/inventory.repository";
import { StockScopeCompatibilityService } from "./stock-scope-compatibility.service";

/** Operation types that produce real source-layer IN logs eligible for FIFO consumption. */
export const FIFO_SOURCE_OPERATION_TYPES: InventoryOperationTypeEnum[] = [
  InventoryOperationType.ACCEPTANCE_IN,
  InventoryOperationType.PRODUCTION_RECEIPT_IN,
  InventoryOperationType.PRICE_CORRECTION_IN,
  InventoryOperationType.RD_HANDOFF_IN,
];

export interface IncreaseStockCommand {
  materialId: number;
  stockScope?: StockScopeCode;
  workshopId?: number;
  allocationTargetId?: number;
  quantity: Prisma.Decimal | number | string;
  operationType: InventoryOperationTypeEnum;
  businessModule: string;
  businessDocumentType: string;
  businessDocumentId: number;
  businessDocumentNumber: string;
  businessDocumentLineId?: number;
  operatorId?: string;
  idempotencyKey: string;
  note?: string;
  /** Immutable cost snapshot for source-layer IN logs. */
  unitCost?: Prisma.Decimal | number | string | null;
  /** Immutable cost amount snapshot for source-layer IN logs. */
  costAmount?: Prisma.Decimal | number | string | null;
}

export interface DecreaseStockCommand {
  materialId: number;
  stockScope?: StockScopeCode;
  workshopId?: number;
  allocationTargetId?: number;
  quantity: Prisma.Decimal | number | string;
  operationType: InventoryOperationTypeEnum;
  businessModule: string;
  businessDocumentType: string;
  businessDocumentId: number;
  businessDocumentNumber: string;
  businessDocumentLineId?: number;
  operatorId?: string;
  idempotencyKey: string;
  note?: string;
}

/**
 * Command to post an OUT log and simultaneously allocate FIFO (or manual) source
 * layers, returning the settled cost snapshot for the caller to persist on the
 * consumer document line.
 */
export interface SettleConsumerOutCommand extends DecreaseStockCommand {
  /** The consumer document line this OUT log belongs to (for source usage records). */
  consumerLineId: number;
  /** Explicit source log override; when provided FIFO is skipped. */
  sourceLogId?: number;
  /** Restricts allocation to a single cost layer. */
  selectedUnitCost?: Prisma.Decimal | number | string;
  /**
   * Operation types eligible as FIFO source layers. Defaults to the repo-wide
   * FIFO_SOURCE_OPERATION_TYPES constant. Pass a narrower list for scopes where
   * only a subset of IN types should be eligible (e.g. RD_SUB only uses RD_HANDOFF_IN).
   */
  sourceOperationTypes?: InventoryOperationTypeEnum[];
}

export interface FifoAllocationPiece {
  sourceLogId: number;
  allocatedQty: Prisma.Decimal;
  unitCost: Prisma.Decimal;
  costAmount: Prisma.Decimal;
}

export interface SettleConsumerOutResult {
  outLog: Awaited<ReturnType<InventoryRepository["findLogById"]>> & object;
  settledUnitCost: Prisma.Decimal;
  settledCostAmount: Prisma.Decimal;
  allocations: FifoAllocationPiece[];
}

export interface PriceLayerAvailabilityItem {
  materialId: number;
  unitCost: Prisma.Decimal;
  availableQty: Prisma.Decimal;
  sourceLogCount: number;
}

export interface ReverseStockCommand {
  logIdToReverse: number;
  idempotencyKey: string;
  note?: string;
}

export interface AllocateInventorySourceCommand {
  sourceLogId: number;
  consumerDocumentType: string;
  consumerDocumentId: number;
  consumerLineId: number;
  targetAllocatedQty: Prisma.Decimal | number | string;
  operatorId?: string;
}

export interface ReleaseInventorySourceCommand {
  sourceLogId: number;
  consumerDocumentType: string;
  consumerDocumentId: number;
  consumerLineId: number;
  targetReleasedQty: Prisma.Decimal | number | string;
  operatorId?: string;
}

export interface ReserveFactoryNumberCommand {
  materialId: number;
  stockScope?: StockScopeCode;
  workshopId?: number;
  businessDocumentType: string;
  businessDocumentId: number;
  businessDocumentLineId: number;
  startNumber: string;
  endNumber: string;
  operatorId?: string;
}

export interface ReleaseFactoryNumberReservationsCommand {
  businessDocumentType: string;
  businessDocumentId: number;
  businessDocumentLineId?: number;
  operatorId?: string;
}

@Injectable()
export class InventoryService {
  constructor(
    private readonly masterDataService: MasterDataService,
    private readonly prisma: PrismaService,
    private readonly repository: InventoryRepository,
    private readonly stockScopeCompatibilityService: StockScopeCompatibilityService,
  ) {}

  async increaseStock(
    cmd: IncreaseStockCommand,
    tx?: Prisma.TransactionClient,
  ) {
    const existing = await this.repository.findLogByIdempotencyKey(
      cmd.idempotencyKey,
      tx,
    );
    if (existing) {
      return existing;
    }

    const changeQty = this.toPositiveQuantityDecimal(cmd.quantity);
    const scope = await this.stockScopeCompatibilityService.resolveRequired({
      stockScope: cmd.stockScope,
      workshopId: cmd.workshopId,
    });
    await this.ensureMasterDataExists(cmd.materialId, scope.workshopId);

    try {
      return await this.withTransaction(tx, async (db) => {
        let balance = await db.inventoryBalance.findUnique({
          where: {
            materialId_stockScopeId: {
              materialId: cmd.materialId,
              stockScopeId: scope.stockScopeId,
            },
          },
        });

        if (!balance) {
          balance = await db.inventoryBalance.create({
            data: {
              materialId: cmd.materialId,
              stockScopeId: scope.stockScopeId,
              workshopId: scope.workshopId,
              quantityOnHand: 0,
              createdBy: cmd.operatorId,
              updatedBy: cmd.operatorId,
            },
          });
        }

        const beforeQty = new Prisma.Decimal(balance.quantityOnHand);
        const afterQty = beforeQty.add(changeQty);

        const unitCost =
          cmd.unitCost != null ? new Prisma.Decimal(cmd.unitCost) : null;
        const logCostAmount =
          cmd.costAmount != null ? new Prisma.Decimal(cmd.costAmount) : null;

        const [, log] = await Promise.all([
          db.inventoryBalance.update({
            where: { id: balance.id },
            data: {
              quantityOnHand: afterQty,
              rowVersion: { increment: 1 },
              updatedBy: cmd.operatorId,
            },
          }),
          db.inventoryLog.create({
            data: {
              balanceId: balance.id,
              materialId: cmd.materialId,
              stockScopeId: scope.stockScopeId,
              workshopId: scope.workshopId,
              allocationTargetId: cmd.allocationTargetId,
              direction: StockDirection.IN,
              operationType: cmd.operationType,
              businessModule: cmd.businessModule,
              businessDocumentType: cmd.businessDocumentType,
              businessDocumentId: cmd.businessDocumentId,
              businessDocumentNumber: cmd.businessDocumentNumber,
              businessDocumentLineId: cmd.businessDocumentLineId,
              changeQty,
              beforeQty,
              afterQty,
              unitCost,
              costAmount: logCostAmount,
              operatorId: cmd.operatorId,
              idempotencyKey: cmd.idempotencyKey,
              note: cmd.note,
            },
          }),
        ]);

        return log;
      });
    } catch (error) {
      return this.resolveIdempotentLogConflict(error, cmd.idempotencyKey);
    }
  }

  async decreaseStock(
    cmd: DecreaseStockCommand,
    tx?: Prisma.TransactionClient,
  ) {
    const existing = await this.repository.findLogByIdempotencyKey(
      cmd.idempotencyKey,
      tx,
    );
    if (existing) {
      return existing;
    }

    const changeQty = this.toPositiveQuantityDecimal(cmd.quantity);
    const scope = await this.stockScopeCompatibilityService.resolveRequired({
      stockScope: cmd.stockScope,
      workshopId: cmd.workshopId,
    });
    await this.ensureMasterDataExists(cmd.materialId, scope.workshopId);

    try {
      return await this.withTransaction(tx, async (db) => {
        const balance = await db.inventoryBalance.findUnique({
          where: {
            materialId_stockScopeId: {
              materialId: cmd.materialId,
              stockScopeId: scope.stockScopeId,
            },
          },
        });

        if (!balance) {
          throw new BadRequestException(
            `库存余额不存在: materialId=${cmd.materialId}, workshopId=${scope.workshopId}`,
          );
        }

        const beforeQty = new Prisma.Decimal(balance.quantityOnHand);
        const afterQty = beforeQty.sub(changeQty);

        if (afterQty.lt(0)) {
          throw new BadRequestException(
            `库存不足: 当前=${beforeQty.toString()}, 需求=${changeQty.toString()}`,
          );
        }

        const log = await db.inventoryLog.create({
          data: {
            balanceId: balance.id,
            materialId: cmd.materialId,
            stockScopeId: scope.stockScopeId,
            workshopId: scope.workshopId,
            allocationTargetId: cmd.allocationTargetId,
            direction: StockDirection.OUT,
            operationType: cmd.operationType,
            businessModule: cmd.businessModule,
            businessDocumentType: cmd.businessDocumentType,
            businessDocumentId: cmd.businessDocumentId,
            businessDocumentNumber: cmd.businessDocumentNumber,
            businessDocumentLineId: cmd.businessDocumentLineId,
            changeQty,
            beforeQty,
            afterQty,
            operatorId: cmd.operatorId,
            idempotencyKey: cmd.idempotencyKey,
            note: cmd.note,
          },
        });

        await db.inventoryBalance.update({
          where: { id: balance.id },
          data: {
            quantityOnHand: afterQty,
            rowVersion: { increment: 1 },
            updatedBy: cmd.operatorId,
          },
        });

        return log;
      });
    } catch (error) {
      return this.resolveIdempotentLogConflict(error, cmd.idempotencyKey);
    }
  }

  async reverseStock(cmd: ReverseStockCommand, tx?: Prisma.TransactionClient) {
    const existing = await this.repository.findLogByIdempotencyKey(
      cmd.idempotencyKey,
      tx,
    );
    if (existing) {
      return existing;
    }

    const sourceLog = await this.repository.findLogById(cmd.logIdToReverse, tx);
    if (!sourceLog) {
      throw new NotFoundException(`库存流水不存在: ${cmd.logIdToReverse}`);
    }

    const existingReverseLog =
      await this.repository.findReversalLogBySourceLogId(sourceLog.id, tx);
    if (existingReverseLog) {
      return existingReverseLog;
    }

    const isIn = sourceLog.direction === StockDirection.IN;
    const reverseDirection = isIn ? StockDirection.OUT : StockDirection.IN;
    const changeQty = new Prisma.Decimal(sourceLog.changeQty);

    try {
      return await this.withTransaction(tx, async (db) => {
        const balance = await db.inventoryBalance.findUnique({
          where: { id: sourceLog.balanceId },
        });
        if (!balance) {
          throw new BadRequestException("关联库存余额不存在");
        }

        const beforeQty = new Prisma.Decimal(balance.quantityOnHand);
        const afterQty = isIn
          ? beforeQty.sub(changeQty)
          : beforeQty.add(changeQty);

        if (afterQty.lt(0)) {
          throw new BadRequestException(
            `逆操作后库存不足: 当前=${beforeQty.toString()}, 逆操作数量=${changeQty.toString()}`,
          );
        }

        const log = await db.inventoryLog.create({
          data: {
            balanceId: balance.id,
            materialId: sourceLog.materialId,
            stockScopeId: sourceLog.stockScopeId,
            workshopId: sourceLog.workshopId,
            allocationTargetId: sourceLog.allocationTargetId,
            direction: reverseDirection,
            operationType: isIn
              ? InventoryOperationType.REVERSAL_OUT
              : InventoryOperationType.REVERSAL_IN,
            businessModule: sourceLog.businessModule,
            businessDocumentType: sourceLog.businessDocumentType,
            businessDocumentId: sourceLog.businessDocumentId,
            businessDocumentNumber: sourceLog.businessDocumentNumber,
            businessDocumentLineId: sourceLog.businessDocumentLineId,
            changeQty,
            beforeQty,
            afterQty,
            operatorId: sourceLog.operatorId,
            reversalOfLogId: sourceLog.id,
            idempotencyKey: cmd.idempotencyKey,
            note: cmd.note ?? `逆操作: 原流水 ${sourceLog.id}`,
          },
        });

        await db.inventoryBalance.update({
          where: { id: balance.id },
          data: {
            quantityOnHand: afterQty,
            rowVersion: { increment: 1 },
            updatedBy: sourceLog.operatorId ?? undefined,
          },
        });

        return log;
      });
    } catch (error) {
      return this.resolveReverseConflict(
        error,
        cmd.idempotencyKey,
        sourceLog.id,
      );
    }
  }

  async allocateInventorySource(
    cmd: AllocateInventorySourceCommand,
    tx?: Prisma.TransactionClient,
  ) {
    const targetAllocatedQty = this.toPositiveQuantityDecimal(
      cmd.targetAllocatedQty,
    );

    return this.withTransaction(tx, async (db) => {
      await this.repository.lockSourceLog(cmd.sourceLogId, db);

      const [sourceLog, reversalLog, existingUsage, totals] = await Promise.all(
        [
          this.repository.findLogById(cmd.sourceLogId, db),
          this.repository.findReversalLogBySourceLogId(cmd.sourceLogId, db),
          this.repository.findSourceUsage(
            {
              sourceLogId: cmd.sourceLogId,
              consumerDocumentType: cmd.consumerDocumentType,
              consumerDocumentId: cmd.consumerDocumentId,
              consumerLineId: cmd.consumerLineId,
            },
            db,
          ),
          this.repository.getSourceUsageTotals(cmd.sourceLogId, db),
        ],
      );

      if (!sourceLog) {
        throw new NotFoundException(`库存流水不存在: ${cmd.sourceLogId}`);
      }

      if (sourceLog.direction !== StockDirection.IN) {
        throw new BadRequestException("来源流水必须是入库方向");
      }

      if (reversalLog) {
        throw new BadRequestException("来源流水已逆操作，不能再分配来源占用");
      }

      const availableQty = new Prisma.Decimal(sourceLog.changeQty).sub(
        totals.allocatedQty.sub(totals.releasedQty),
      );

      const currentAllocatedQty = existingUsage
        ? new Prisma.Decimal(existingUsage.allocatedQty)
        : new Prisma.Decimal(0);
      const releasedQty = existingUsage
        ? new Prisma.Decimal(existingUsage.releasedQty)
        : new Prisma.Decimal(0);

      if (targetAllocatedQty.lt(currentAllocatedQty)) {
        throw new BadRequestException(
          `目标分配数量不能小于当前已分配总量: 当前=${currentAllocatedQty.toString()}, 目标=${targetAllocatedQty.toString()}`,
        );
      }

      const deltaQty = targetAllocatedQty.sub(currentAllocatedQty);
      if (deltaQty.eq(0) && existingUsage) {
        return existingUsage;
      }

      if (deltaQty.gt(availableQty)) {
        throw new BadRequestException(
          `来源库存不足: 可分配=${availableQty.toString()}, 新增需求=${deltaQty.toString()}`,
        );
      }

      if (!existingUsage) {
        return this.repository.createSourceUsage(
          {
            materialId: sourceLog.materialId,
            sourceLogId: cmd.sourceLogId,
            consumerDocumentType: cmd.consumerDocumentType,
            consumerDocumentId: cmd.consumerDocumentId,
            consumerLineId: cmd.consumerLineId,
            allocatedQty: targetAllocatedQty,
            releasedQty: 0,
            status: SourceUsageStatus.ALLOCATED,
            createdBy: cmd.operatorId,
            updatedBy: cmd.operatorId,
          },
          db,
        );
      }

      return this.repository.updateSourceUsage(
        existingUsage.id,
        {
          allocatedQty: targetAllocatedQty,
          status: this.toSourceUsageStatus(targetAllocatedQty, releasedQty),
          updatedBy: cmd.operatorId,
        },
        db,
      );
    });
  }

  async releaseInventorySource(
    cmd: ReleaseInventorySourceCommand,
    tx?: Prisma.TransactionClient,
  ) {
    const targetReleasedQty = this.toNonNegativeQuantityDecimal(
      cmd.targetReleasedQty,
    );

    return this.withTransaction(tx, async (db) => {
      await this.repository.lockSourceLog(cmd.sourceLogId, db);

      const usage = await this.repository.findSourceUsage(
        {
          sourceLogId: cmd.sourceLogId,
          consumerDocumentType: cmd.consumerDocumentType,
          consumerDocumentId: cmd.consumerDocumentId,
          consumerLineId: cmd.consumerLineId,
        },
        db,
      );

      if (!usage) {
        throw new NotFoundException(
          `来源占用不存在: sourceLogId=${cmd.sourceLogId}, consumerDocumentType=${cmd.consumerDocumentType}, consumerDocumentId=${cmd.consumerDocumentId}, consumerLineId=${cmd.consumerLineId}`,
        );
      }

      const allocatedQty = new Prisma.Decimal(usage.allocatedQty);
      const currentReleasedQty = new Prisma.Decimal(usage.releasedQty);

      if (targetReleasedQty.gt(allocatedQty)) {
        throw new BadRequestException(
          `释放数量超过累计分配: 已分配=${allocatedQty.toString()}, 目标释放=${targetReleasedQty.toString()}`,
        );
      }

      if (targetReleasedQty.eq(currentReleasedQty)) {
        return usage;
      }

      return this.repository.updateSourceUsage(
        usage.id,
        {
          releasedQty: targetReleasedQty,
          status: this.toSourceUsageStatus(allocatedQty, targetReleasedQty),
          updatedBy: cmd.operatorId,
        },
        db,
      );
    });
  }

  /**
   * Posts an OUT inventory log and simultaneously performs FIFO (or manual)
   * source allocation, returning the settled cost summary for the caller to
   * persist on the consumer document line.
   *
   * The method is idempotent on the OUT log key; if the log already exists the
   * existing allocations are returned without re-running allocation.
   */
  async settleConsumerOut(
    cmd: SettleConsumerOutCommand,
    tx?: Prisma.TransactionClient,
  ): Promise<SettleConsumerOutResult> {
    const existing = await this.repository.findLogByIdempotencyKey(
      cmd.idempotencyKey,
      tx,
    );
    if (existing) {
      return this.buildSettlementResultFromExistingLog(
        existing as SettleConsumerOutResult["outLog"],
        cmd,
        tx,
      );
    }

    const changeQty = this.toPositiveQuantityDecimal(cmd.quantity);
    const sourceTypes = cmd.sourceOperationTypes ?? FIFO_SOURCE_OPERATION_TYPES;
    const selectedUnitCost =
      cmd.selectedUnitCost != null
        ? this.toPositiveDecimal(cmd.selectedUnitCost, "价格层单价")
        : null;
    const scope = await this.stockScopeCompatibilityService.resolveRequired({
      stockScope: cmd.stockScope,
      workshopId: cmd.workshopId,
    });
    await this.ensureMasterDataExists(cmd.materialId, scope.workshopId);

    try {
      return await this.withTransaction(tx, async (db) => {
        let allocations: FifoAllocationPiece[];

        if (cmd.sourceLogId != null) {
          // Manual source: validate material, scope, operation type, then allocate.
          allocations = await this.allocateManualSource(
            cmd.sourceLogId,
            changeQty,
            cmd.materialId,
            scope.stockScopeId,
            sourceTypes,
            selectedUnitCost,
            cmd.businessDocumentType,
            cmd.businessDocumentId,
            cmd.consumerLineId,
            cmd.operatorId,
            db,
          );
        } else {
          // Default FIFO: greedily allocate from oldest eligible source layers.
          allocations = await this.allocateByFifo(
            cmd.materialId,
            scope.stockScopeId,
            changeQty,
            sourceTypes,
            selectedUnitCost,
            cmd.businessDocumentType,
            cmd.businessDocumentId,
            cmd.consumerLineId,
            cmd.operatorId,
            db,
          );
        }

        const settledCostAmount = allocations.reduce(
          (s, a) => s.add(a.costAmount),
          new Prisma.Decimal(0),
        );
        const settledUnitCost = changeQty.gt(0)
          ? settledCostAmount.div(changeQty)
          : new Prisma.Decimal(0);

        const balance = await db.inventoryBalance.findUnique({
          where: {
            materialId_stockScopeId: {
              materialId: cmd.materialId,
              stockScopeId: scope.stockScopeId,
            },
          },
        });

        if (!balance) {
          throw new BadRequestException(
            `库存余额不存在: materialId=${cmd.materialId}, workshopId=${scope.workshopId}`,
          );
        }

        const beforeQty = new Prisma.Decimal(balance.quantityOnHand);
        const afterQty = beforeQty.sub(changeQty);

        if (afterQty.lt(0)) {
          throw new BadRequestException(
            `库存不足: 当前=${beforeQty.toString()}, 需求=${changeQty.toString()}`,
          );
        }

        const outLog = await db.inventoryLog.create({
          data: {
            balanceId: balance.id,
            materialId: cmd.materialId,
            stockScopeId: scope.stockScopeId,
            workshopId: scope.workshopId,
            allocationTargetId: cmd.allocationTargetId,
            direction: StockDirection.OUT,
            operationType: cmd.operationType,
            businessModule: cmd.businessModule,
            businessDocumentType: cmd.businessDocumentType,
            businessDocumentId: cmd.businessDocumentId,
            businessDocumentNumber: cmd.businessDocumentNumber,
            businessDocumentLineId: cmd.businessDocumentLineId,
            changeQty,
            beforeQty,
            afterQty,
            unitCost: settledUnitCost,
            costAmount: settledCostAmount,
            operatorId: cmd.operatorId,
            idempotencyKey: cmd.idempotencyKey,
            note: cmd.note,
          },
        });

        await db.inventoryBalance.update({
          where: { id: balance.id },
          data: {
            quantityOnHand: afterQty,
            rowVersion: { increment: 1 },
            updatedBy: cmd.operatorId,
          },
        });

        return {
          outLog: outLog as SettleConsumerOutResult["outLog"],
          settledUnitCost,
          settledCostAmount,
          allocations,
        };
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        const existingLog = await this.repository.findLogByIdempotencyKey(
          cmd.idempotencyKey,
        );
        if (existingLog) {
          return this.buildSettlementResultFromExistingLog(
            existingLog as SettleConsumerOutResult["outLog"],
            cmd,
          );
        }
      }
      throw error;
    }
  }

  private async buildSettlementResultFromExistingLog(
    outLog: SettleConsumerOutResult["outLog"],
    cmd: SettleConsumerOutCommand,
    tx?: Prisma.TransactionClient,
  ): Promise<SettleConsumerOutResult> {
    const lineUsages = await this.repository.findSourceUsagesForConsumerLine(
      {
        consumerDocumentType: cmd.businessDocumentType,
        consumerDocumentId: cmd.businessDocumentId,
        consumerLineId: cmd.consumerLineId,
      },
      tx,
    );
    const allocations: FifoAllocationPiece[] = lineUsages.map((u) => ({
      sourceLogId: u.sourceLogId,
      allocatedQty: new Prisma.Decimal(u.allocatedQty),
      unitCost: u.sourceLog.unitCost
        ? new Prisma.Decimal(u.sourceLog.unitCost)
        : new Prisma.Decimal(0),
      costAmount: u.sourceLog.unitCost
        ? new Prisma.Decimal(u.allocatedQty).mul(
            new Prisma.Decimal(u.sourceLog.unitCost),
          )
        : new Prisma.Decimal(0),
    }));
    const settledCostAmount = allocations.reduce(
      (s, a) => s.add(a.costAmount),
      new Prisma.Decimal(0),
    );
    const changeQty = this.toPositiveQuantityDecimal(cmd.quantity);
    const settledUnitCost = changeQty.gt(0)
      ? settledCostAmount.div(changeQty)
      : new Prisma.Decimal(0);

    return {
      outLog,
      settledUnitCost,
      settledCostAmount,
      allocations,
    };
  }

  /**
   * Releases all non-fully-released source usages for a consumer document. Call
   * this before reversing the consumer's OUT log(s) to ensure source layer
   * available quantities are correctly restored.
   */
  async releaseAllSourceUsagesForConsumer(
    params: {
      consumerDocumentType: string;
      consumerDocumentId: number;
      operatorId?: string;
    },
    tx?: Prisma.TransactionClient,
  ): Promise<void> {
    return this.withTransaction(tx, async (db) => {
      const usages = await this.repository.findActiveSourceUsagesForConsumer(
        params,
        db,
      );
      for (const usage of usages) {
        const allocatedQty = new Prisma.Decimal(usage.allocatedQty);
        const releasedQty = new Prisma.Decimal(usage.releasedQty);
        if (releasedQty.gte(allocatedQty)) {
          continue;
        }
        await this.releaseInventorySource(
          {
            sourceLogId: usage.sourceLogId,
            consumerDocumentType: usage.consumerDocumentType,
            consumerDocumentId: usage.consumerDocumentId,
            consumerLineId: usage.consumerLineId,
            targetReleasedQty: allocatedQty,
            operatorId: params.operatorId,
          },
          db,
        );
      }
    });
  }

  /**
   * Releases all non-fully-released source usages for a single consumer line
   * before its OUT log is reversed during an update (repost or delete).
   */
  async releaseSourceUsagesForConsumerLine(
    params: {
      consumerDocumentType: string;
      consumerDocumentId: number;
      consumerLineId: number;
      operatorId?: string;
    },
    tx?: Prisma.TransactionClient,
  ): Promise<void> {
    return this.withTransaction(tx, async (db) => {
      const usages =
        await this.repository.findActiveSourceUsagesForConsumerLine(params, db);
      for (const usage of usages) {
        const allocatedQty = new Prisma.Decimal(usage.allocatedQty);
        const releasedQty = new Prisma.Decimal(usage.releasedQty);
        if (releasedQty.gte(allocatedQty)) {
          continue;
        }
        await this.releaseInventorySource(
          {
            sourceLogId: usage.sourceLogId,
            consumerDocumentType: usage.consumerDocumentType,
            consumerDocumentId: usage.consumerDocumentId,
            consumerLineId: usage.consumerLineId,
            targetReleasedQty: allocatedQty,
            operatorId: params.operatorId,
          },
          db,
        );
      }
    });
  }

  /**
   * Checks whether a source IN log has any unreleased downstream allocations.
   * Used by the inbound service to prevent changing a source layer that has
   * already been consumed.
   */
  async hasUnreleasedAllocations(
    sourceLogId: number,
    tx?: Prisma.TransactionClient,
  ): Promise<boolean> {
    const totals = await this.repository.getSourceUsageTotals(sourceLogId, tx);
    return totals.allocatedQty.gt(totals.releasedQty);
  }

  private async allocateManualSource(
    sourceLogId: number,
    qty: Prisma.Decimal,
    materialId: number,
    stockScopeId: number,
    allowedOperationTypes: InventoryOperationTypeEnum[],
    selectedUnitCost: Prisma.Decimal | null,
    consumerDocumentType: string,
    consumerDocumentId: number,
    consumerLineId: number,
    operatorId: string | undefined,
    db: Prisma.TransactionClient,
  ): Promise<FifoAllocationPiece[]> {
    await this.repository.lockSourceLog(sourceLogId, db);

    const [sourceLog, reversalLog, totals] = await Promise.all([
      this.repository.findLogById(sourceLogId, db),
      this.repository.findReversalLogBySourceLogId(sourceLogId, db),
      this.repository.getSourceUsageTotals(sourceLogId, db),
    ]);

    if (!sourceLog) {
      throw new NotFoundException(`来源流水不存在: ${sourceLogId}`);
    }
    if (sourceLog.direction !== StockDirection.IN) {
      throw new BadRequestException("手动指定的来源流水必须是入库方向");
    }
    if (sourceLog.materialId !== materialId) {
      throw new BadRequestException(
        `手动来源流水物料不匹配: 流水物料=${sourceLog.materialId}, 当前物料=${materialId}`,
      );
    }
    if (sourceLog.stockScopeId !== stockScopeId) {
      throw new BadRequestException(
        `手动来源流水库存范围不匹配: 流水范围=${sourceLog.stockScopeId ?? "null"}, 当前范围=${stockScopeId}`,
      );
    }
    if (
      !allowedOperationTypes.includes(
        sourceLog.operationType as InventoryOperationTypeEnum,
      )
    ) {
      throw new BadRequestException(
        `手动来源流水操作类型不在允许列表中: ${sourceLog.operationType}`,
      );
    }
    if (reversalLog) {
      throw new BadRequestException("来源流水已逆操作，不能作为手动来源");
    }

    const availableQty = new Prisma.Decimal(sourceLog.changeQty).sub(
      totals.allocatedQty.sub(totals.releasedQty),
    );
    if (qty.gt(availableQty)) {
      throw new BadRequestException(
        `手动来源库存不足: 可用=${availableQty.toString()}, 需求=${qty.toString()}`,
      );
    }

    const unitCost = sourceLog.unitCost
      ? new Prisma.Decimal(sourceLog.unitCost)
      : new Prisma.Decimal(0);
    if (selectedUnitCost && !unitCost.eq(selectedUnitCost)) {
      throw new BadRequestException(
        `来源流水价格层不匹配: 目标=${selectedUnitCost.toString()}, 实际=${unitCost.toString()}`,
      );
    }
    const costAmount = unitCost.mul(qty);

    await this.allocateInventorySource(
      {
        sourceLogId,
        consumerDocumentType,
        consumerDocumentId,
        consumerLineId,
        targetAllocatedQty: qty,
        operatorId,
      },
      db,
    );

    return [{ sourceLogId, allocatedQty: qty, unitCost, costAmount }];
  }

  private async allocateByFifo(
    materialId: number,
    stockScopeId: number,
    qty: Prisma.Decimal,
    sourceTypes: InventoryOperationTypeEnum[],
    selectedUnitCost: Prisma.Decimal | null,
    consumerDocumentType: string,
    consumerDocumentId: number,
    consumerLineId: number,
    operatorId: string | undefined,
    db: Prisma.TransactionClient,
  ): Promise<FifoAllocationPiece[]> {
    const candidates = await this.repository.findFifoSourceLogs(
      {
        materialId,
        stockScopeId,
        sourceOperationTypes: sourceTypes,
        unitCost: selectedUnitCost ?? undefined,
      },
      db,
    );

    let remaining = new Prisma.Decimal(qty);
    const allocations: FifoAllocationPiece[] = [];

    for (const candidate of candidates) {
      if (remaining.lte(0)) break;

      // Lock the source log row for update to prevent concurrent over-allocation.
      await this.repository.lockSourceLog(candidate.id, db);

      // Re-fetch available qty under lock.
      const [sourceLog, reversalLog, totals] = await Promise.all([
        this.repository.findLogById(candidate.id, db),
        this.repository.findReversalLogBySourceLogId(candidate.id, db),
        this.repository.getSourceUsageTotals(candidate.id, db),
      ]);

      if (!sourceLog || reversalLog) continue;

      const freshAvailable = new Prisma.Decimal(sourceLog.changeQty).sub(
        totals.allocatedQty.sub(totals.releasedQty),
      );
      if (freshAvailable.lte(0)) continue;

      const toAllocate = remaining.gt(freshAvailable)
        ? freshAvailable
        : remaining;

      const unitCost = sourceLog.unitCost
        ? new Prisma.Decimal(sourceLog.unitCost)
        : new Prisma.Decimal(0);
      const pieceCost = unitCost.mul(toAllocate);

      await this.allocateInventorySource(
        {
          sourceLogId: candidate.id,
          consumerDocumentType,
          consumerDocumentId,
          consumerLineId,
          targetAllocatedQty: toAllocate,
          operatorId,
        },
        db,
      );

      allocations.push({
        sourceLogId: candidate.id,
        allocatedQty: toAllocate,
        unitCost,
        costAmount: pieceCost,
      });

      remaining = remaining.sub(toAllocate);
    }

    if (remaining.gt(0)) {
      throw new BadRequestException(
        `FIFO 可用来源库存不足: 缺少 ${remaining.toString()} 个来源层数量，请先确保有足够的入库记录`,
      );
    }

    return allocations;
  }

  async listBalances(params: {
    materialId?: number;
    stockScope?: StockScopeCode;
    workshopId?: number;
    limit?: number;
    offset?: number;
  }) {
    const limit = Math.min(params.limit ?? 50, 100);
    const offset = params.offset ?? 0;
    const stockScopeIds = await this.resolveInventoryStockScopeIds(params);
    const result = await this.repository.findBalances({
      materialId: params.materialId,
      stockScopeIds,
      limit,
      offset,
    });

    return {
      total: result.total,
      items: result.items.map((item) => this.withStockScope(item)),
    };
  }

  async getBalanceSnapshot(
    params: {
      materialId: number;
      stockScope?: StockScopeCode;
      workshopId?: number;
    },
    tx?: Prisma.TransactionClient,
  ) {
    const scope = await this.stockScopeCompatibilityService.resolveRequired({
      stockScope: params.stockScope,
      workshopId: params.workshopId,
    });
    await this.ensureMasterDataExists(params.materialId, scope.workshopId);
    return this.repository.findBalanceByMaterialAndStockScope(
      params.materialId,
      scope.stockScopeId,
      tx,
    );
  }

  async listLogs(params: {
    materialId?: number;
    stockScope?: StockScopeCode;
    workshopId?: number;
    businessDocumentId?: number;
    businessDocumentType?: string;
    businessDocumentNumber?: string;
    operationType?: string;
    occurredAtFrom?: string;
    occurredAtTo?: string;
    limit?: number;
    offset?: number;
  }) {
    const limit = Math.min(params.limit ?? 50, 100);
    const offset = params.offset ?? 0;
    const stockScopeIds = await this.resolveInventoryStockScopeIds(params);
    const result = await this.repository.findLogs({
      materialId: params.materialId,
      stockScopeIds,
      businessDocumentId: params.businessDocumentId,
      businessDocumentType: params.businessDocumentType,
      businessDocumentNumber: params.businessDocumentNumber,
      operationType: params.operationType,
      occurredAtFrom: params.occurredAtFrom
        ? new Date(params.occurredAtFrom)
        : undefined,
      occurredAtTo: params.occurredAtTo
        ? this.toInclusiveEndDate(params.occurredAtTo)
        : undefined,
      limit,
      offset,
    });

    return {
      total: result.total,
      items: result.items.map((item) => this.withStockScope(item)),
    };
  }

  async getLogsForDocument(
    params: {
      businessDocumentType: string;
      businessDocumentId: number;
    },
    tx?: Prisma.TransactionClient,
  ) {
    return this.repository.findOriginalLogsByBusinessDocument(params, tx);
  }

  async reserveFactoryNumber(
    cmd: ReserveFactoryNumberCommand,
    tx?: Prisma.TransactionClient,
  ) {
    const scope = await this.stockScopeCompatibilityService.resolveRequired({
      stockScope: cmd.stockScope,
      workshopId: cmd.workshopId,
    });
    await this.ensureMasterDataExists(cmd.materialId, scope.workshopId);
    return this.withTransaction(tx, async (db) => {
      return this.repository.createFactoryNumberReservation(
        {
          materialId: cmd.materialId,
          stockScopeId: scope.stockScopeId,
          workshopId: scope.workshopId,
          businessDocumentType: cmd.businessDocumentType,
          businessDocumentId: cmd.businessDocumentId,
          businessDocumentLineId: cmd.businessDocumentLineId,
          startNumber: cmd.startNumber,
          endNumber: cmd.endNumber,
          status: FactoryNumberReservationStatus.RESERVED,
          createdBy: cmd.operatorId,
          updatedBy: cmd.operatorId,
        },
        db,
      );
    });
  }

  async releaseFactoryNumberReservations(
    cmd: ReleaseFactoryNumberReservationsCommand,
    tx?: Prisma.TransactionClient,
  ) {
    return this.withTransaction(tx, async (db) => {
      return this.repository.releaseFactoryNumberReservations(
        {
          businessDocumentType: cmd.businessDocumentType,
          businessDocumentId: cmd.businessDocumentId,
          businessDocumentLineId: cmd.businessDocumentLineId,
          updatedBy: cmd.operatorId,
        },
        db,
      );
    });
  }

  async listSourceUsages(
    params: {
      materialId?: number;
      consumerDocumentType?: string;
      consumerDocumentId?: number;
      limit?: number;
      offset?: number;
    },
    tx?: Prisma.TransactionClient,
  ) {
    const limit = Math.min(params.limit ?? 50, 100);
    const offset = params.offset ?? 0;
    return this.repository.findSourceUsages(
      {
        materialId: params.materialId,
        consumerDocumentType: params.consumerDocumentType,
        consumerDocumentId: params.consumerDocumentId,
        limit,
        offset,
      },
      tx,
    );
  }

  async listSourceUsagesForConsumerLine(
    params: {
      consumerDocumentType: string;
      consumerDocumentId: number;
      consumerLineId: number;
    },
    tx?: Prisma.TransactionClient,
  ) {
    return this.repository.findSourceUsagesForConsumerLine(params, tx);
  }

  async listFactoryNumberReservations(params: {
    stockScope?: StockScopeCode;
    workshopId?: number;
    businessDocumentType?: string;
    businessDocumentLineId?: number;
    startNumber?: string;
    endNumber?: string;
    limit?: number;
    offset?: number;
  }) {
    const limit = Math.min(params.limit ?? 50, 100);
    const offset = params.offset ?? 0;
    const stockScopeIds = await this.resolveInventoryStockScopeIds(params);
    const result = await this.repository.findFactoryNumberReservations({
      stockScopeIds,
      businessDocumentType: params.businessDocumentType,
      businessDocumentLineId: params.businessDocumentLineId,
      startNumber: params.startNumber,
      endNumber: params.endNumber,
      limit,
      offset,
    });

    return {
      total: result.total,
      items: result.items.map((item) => this.withStockScope(item)),
    };
  }

  async getFactoryNumberReservationById(id: number) {
    const reservation =
      await this.repository.findFactoryNumberReservationById(id);
    if (!reservation) {
      throw new NotFoundException(`编号区间不存在: ${id}`);
    }
    return this.withStockScope(reservation);
  }

  async listPriceLayerAvailability(params: {
    materialId: number;
    stockScope?: StockScopeCode;
    workshopId?: number;
    sourceOperationTypes?: InventoryOperationTypeEnum[];
  }): Promise<PriceLayerAvailabilityItem[]> {
    const scope = await this.stockScopeCompatibilityService.resolveRequired({
      stockScope: params.stockScope,
      workshopId: params.workshopId,
    });
    await this.ensureMasterDataExists(params.materialId, scope.workshopId);

    const sourceLogs = await this.repository.findFifoSourceLogs({
      materialId: params.materialId,
      stockScopeId: scope.stockScopeId,
      sourceOperationTypes:
        params.sourceOperationTypes ?? FIFO_SOURCE_OPERATION_TYPES,
    });

    const grouped = new Map<
      string,
      {
        materialId: number;
        unitCost: Prisma.Decimal;
        availableQty: Prisma.Decimal;
        sourceLogCount: number;
      }
    >();

    for (const sourceLog of sourceLogs) {
      if (!sourceLog.unitCost) {
        continue;
      }

      const key = sourceLog.unitCost.toString();
      const current = grouped.get(key);
      if (current) {
        current.availableQty = current.availableQty.add(sourceLog.availableQty);
        current.sourceLogCount += 1;
        continue;
      }

      grouped.set(key, {
        materialId: params.materialId,
        unitCost: sourceLog.unitCost,
        availableQty: new Prisma.Decimal(sourceLog.availableQty),
        sourceLogCount: 1,
      });
    }

    return [...grouped.values()].sort((left, right) =>
      left.unitCost.comparedTo(right.unitCost),
    );
  }

  private toPositiveQuantityDecimal(
    quantity: Prisma.Decimal | number | string,
  ): Prisma.Decimal {
    const parsedQuantity = this.toDecimal(quantity, "库存变更数量格式无效");

    if (parsedQuantity.lte(0)) {
      throw new BadRequestException("库存变更数量必须大于 0");
    }

    return parsedQuantity;
  }

  private toPositiveDecimal(
    value: Prisma.Decimal | number | string,
    fieldLabel: string,
  ): Prisma.Decimal {
    const parsedValue = this.toDecimal(value, `${fieldLabel}格式无效`);
    if (parsedValue.lte(0)) {
      throw new BadRequestException(`${fieldLabel}必须大于 0`);
    }
    return parsedValue;
  }

  private toDecimal(
    value: Prisma.Decimal | number | string,
    invalidMessage: string,
  ): Prisma.Decimal {
    let parsedValue: Prisma.Decimal;
    try {
      parsedValue = new Prisma.Decimal(value);
    } catch {
      throw new BadRequestException(invalidMessage);
    }
    return parsedValue;
  }

  private toNonNegativeQuantityDecimal(
    quantity: Prisma.Decimal | number | string,
  ): Prisma.Decimal {
    const parsedQuantity = this.toDecimal(quantity, "库存变更数量格式无效");

    if (parsedQuantity.lt(0)) {
      throw new BadRequestException("库存变更数量不能小于 0");
    }

    return parsedQuantity;
  }

  private toSourceUsageStatus(
    allocatedQty: Prisma.Decimal,
    releasedQty: Prisma.Decimal,
  ): SourceUsageStatus {
    if (releasedQty.lte(0)) {
      return SourceUsageStatus.ALLOCATED;
    }

    if (releasedQty.gte(allocatedQty)) {
      return SourceUsageStatus.RELEASED;
    }

    return SourceUsageStatus.PARTIALLY_RELEASED;
  }

  private toInclusiveEndDate(dateText: string): Date {
    const date = new Date(dateText);
    date.setHours(23, 59, 59, 999);
    return date;
  }

  private withTransaction<T>(
    tx: Prisma.TransactionClient | undefined,
    handler: (db: Prisma.TransactionClient) => Promise<T>,
  ) {
    if (tx) {
      return handler(tx);
    }

    return this.prisma.runInTransaction(handler);
  }

  private async resolveIdempotentLogConflict(
    error: unknown,
    idempotencyKey: string,
  ) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      const existingLog =
        await this.repository.findLogByIdempotencyKey(idempotencyKey);
      if (existingLog) {
        return existingLog;
      }
    }

    throw error;
  }

  private async resolveReverseConflict(
    error: unknown,
    idempotencyKey: string,
    sourceLogId: number,
  ) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      const [existingByKey, existingBySourceLog] = await Promise.all([
        this.repository.findLogByIdempotencyKey(idempotencyKey),
        this.repository.findReversalLogBySourceLogId(sourceLogId),
      ]);
      if (existingByKey) {
        return existingByKey;
      }
      if (existingBySourceLog) {
        return existingBySourceLog;
      }
    }

    throw error;
  }

  private async resolveInventoryStockScopeIds(params: {
    stockScope?: StockScopeCode;
    workshopId?: number;
  }) {
    const scope = await this.stockScopeCompatibilityService.resolveOptional({
      stockScope: params.stockScope,
      workshopId: params.workshopId,
    });
    if (scope) {
      return [scope.stockScopeId];
    }

    return this.stockScopeCompatibilityService.listRealStockScopeIds();
  }

  private withStockScope<
    T extends {
      stockScope?: {
        id: number;
        scopeCode: string;
        scopeName: string;
      } | null;
      workshop?: {
        id: number;
        workshopCode: string;
        workshopName: string;
      } | null;
    },
  >(item: T): T & { stockScope: StockScopeCode | null } {
    return {
      ...item,
      stockScope: item.stockScope
        ? (item.stockScope.scopeCode as StockScopeCode)
        : item.workshop
          ? resolveStockScopeFromWorkshopIdentity({
              workshopCode: item.workshop.workshopCode,
              workshopName: item.workshop.workshopName,
            })
          : null,
    };
  }

  private async ensureMasterDataExists(materialId: number, workshopId: number) {
    await Promise.all([
      this.masterDataService.getMaterialById(materialId),
      this.masterDataService.getWorkshopById(workshopId),
    ]);
  }
}
