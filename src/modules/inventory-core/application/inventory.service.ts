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
import { InventoryRepository } from "../infrastructure/inventory.repository";

export interface IncreaseStockCommand {
  materialId: number;
  workshopId: number;
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

export interface DecreaseStockCommand {
  materialId: number;
  workshopId: number;
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
  workshopId: number;
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
    await this.ensureMasterDataExists(cmd.materialId, cmd.workshopId);

    try {
      return await this.withTransaction(tx, async (db) => {
        let balance = await db.inventoryBalance.findUnique({
          where: {
            materialId_workshopId: {
              materialId: cmd.materialId,
              workshopId: cmd.workshopId,
            },
          },
        });

        if (!balance) {
          balance = await db.inventoryBalance.create({
            data: {
              materialId: cmd.materialId,
              workshopId: cmd.workshopId,
              quantityOnHand: 0,
              createdBy: cmd.operatorId,
              updatedBy: cmd.operatorId,
            },
          });
        }

        const beforeQty = new Prisma.Decimal(balance.quantityOnHand);
        const afterQty = beforeQty.add(changeQty);

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
              workshopId: cmd.workshopId,
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
    await this.ensureMasterDataExists(cmd.materialId, cmd.workshopId);

    try {
      return await this.withTransaction(tx, async (db) => {
        const balance = await db.inventoryBalance.findUnique({
          where: {
            materialId_workshopId: {
              materialId: cmd.materialId,
              workshopId: cmd.workshopId,
            },
          },
        });

        if (!balance) {
          throw new BadRequestException(
            `库存余额不存在: materialId=${cmd.materialId}, workshopId=${cmd.workshopId}`,
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
            workshopId: cmd.workshopId,
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
            workshopId: sourceLog.workshopId,
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
    const targetReleasedQty = this.toPositiveQuantityDecimal(
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

      if (targetReleasedQty.lt(currentReleasedQty)) {
        throw new BadRequestException(
          `目标释放数量不能小于当前已释放总量: 当前=${currentReleasedQty.toString()}, 目标=${targetReleasedQty.toString()}`,
        );
      }

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

  async listBalances(params: {
    materialId?: number;
    workshopId?: number;
    limit?: number;
    offset?: number;
  }) {
    const limit = Math.min(params.limit ?? 50, 100);
    const offset = params.offset ?? 0;
    return this.repository.findBalances({
      materialId: params.materialId,
      workshopId: params.workshopId,
      limit,
      offset,
    });
  }

  async listLogs(params: {
    materialId?: number;
    workshopId?: number;
    businessDocumentId?: number;
    businessDocumentType?: string;
    limit?: number;
    offset?: number;
  }) {
    const limit = Math.min(params.limit ?? 50, 100);
    const offset = params.offset ?? 0;
    return this.repository.findLogs({
      materialId: params.materialId,
      workshopId: params.workshopId,
      businessDocumentId: params.businessDocumentId,
      businessDocumentType: params.businessDocumentType,
      limit,
      offset,
    });
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
    await this.ensureMasterDataExists(cmd.materialId, cmd.workshopId);
    return this.withTransaction(tx, async (db) => {
      return this.repository.createFactoryNumberReservation(
        {
          materialId: cmd.materialId,
          workshopId: cmd.workshopId,
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

  private toPositiveQuantityDecimal(
    quantity: Prisma.Decimal | number | string,
  ): Prisma.Decimal {
    let parsedQuantity: Prisma.Decimal;
    try {
      parsedQuantity = new Prisma.Decimal(quantity);
    } catch {
      throw new BadRequestException("库存变更数量格式无效");
    }

    if (parsedQuantity.lte(0)) {
      throw new BadRequestException("库存变更数量必须大于 0");
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

  private async ensureMasterDataExists(materialId: number, workshopId: number) {
    await Promise.all([
      this.masterDataService.getMaterialById(materialId),
      this.masterDataService.getWorkshopById(workshopId),
    ]);
  }
}
