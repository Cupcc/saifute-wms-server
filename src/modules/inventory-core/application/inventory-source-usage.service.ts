import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  Prisma,
  SourceUsageStatus,
  StockDirection,
} from "../../../../generated/prisma/client";
import { InventoryRepository } from "../infrastructure/inventory.repository";
import type {
  AllocateInventorySourceCommand,
  ReleaseInventorySourceCommand,
} from "./inventory.types";

@Injectable()
export class InventorySourceUsageService {
  constructor(private readonly repository: InventoryRepository) {}

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

  private toPositiveQuantityDecimal(
    quantity: Prisma.Decimal | number | string,
  ): Prisma.Decimal {
    const parsedQuantity = this.toDecimal(quantity, "库存变更数量格式无效");

    if (parsedQuantity.lte(0)) {
      throw new BadRequestException("库存变更数量必须大于 0");
    }

    return parsedQuantity;
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

  private withTransaction<T>(
    tx: Prisma.TransactionClient | undefined,
    handler: (db: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    if (tx) {
      return handler(tx);
    }

    return this.repository.runInTransaction(undefined, handler);
  }
}
