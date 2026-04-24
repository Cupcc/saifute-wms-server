import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  InventoryOperationType,
  Prisma,
  StockDirection,
} from "../../../../generated/prisma/client";
import { MasterDataService } from "../../master-data/application/master-data.service";
import { InventoryRepository } from "../infrastructure/inventory.repository";
import type {
  DecreaseStockCommand,
  IncreaseStockCommand,
  ReverseStockCommand,
} from "./inventory.types";
import { StockScopeCompatibilityService } from "./stock-scope-compatibility.service";

const INVENTORY_BALANCE_CONFLICT_MESSAGE = "库存余额已被并发更新，请重试";

@Injectable()
export class InventoryStockMutationService {
  constructor(
    private readonly masterDataService: MasterDataService,
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
    await this.ensureMasterDataExists(cmd.materialId, cmd.workshopId);

    try {
      return await this.withTransaction(tx, async (db) => {
        const balance = await this.findOrCreateBalance(
          cmd.materialId,
          scope.stockScopeId,
          cmd.operatorId,
          db,
        );

        const beforeQty = new Prisma.Decimal(balance.quantityOnHand);
        const afterQty = beforeQty.add(changeQty);

        const unitCost =
          cmd.unitCost != null ? new Prisma.Decimal(cmd.unitCost) : null;
        const logCostAmount =
          cmd.costAmount != null ? new Prisma.Decimal(cmd.costAmount) : null;

        const [, log] = await Promise.all([
          this.updateBalanceOptimistically(
            {
              balanceId: balance.id,
              expectedRowVersion: balance.rowVersion,
              nextQuantityOnHand: afterQty,
              updatedBy: cmd.operatorId,
            },
            db,
          ),
          db.inventoryLog.create({
            data: {
              balanceId: balance.id,
              materialId: cmd.materialId,
              stockScopeId: scope.stockScopeId,
              workshopId: cmd.workshopId ?? null,
              projectTargetId: cmd.projectTargetId,
              bizDate: cmd.bizDate,
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
    await this.ensureMasterDataExists(cmd.materialId, cmd.workshopId);

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
            `库存余额不存在: materialId=${cmd.materialId}, stockScope=${scope.stockScope}`,
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
            workshopId: cmd.workshopId ?? null,
            projectTargetId: cmd.projectTargetId,
            bizDate: cmd.bizDate,
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

        await this.updateBalanceOptimistically(
          {
            balanceId: balance.id,
            expectedRowVersion: balance.rowVersion,
            nextQuantityOnHand: afterQty,
            updatedBy: cmd.operatorId,
          },
          db,
        );

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
            projectTargetId: sourceLog.projectTargetId,
            bizDate: sourceLog.bizDate,
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

        await this.updateBalanceOptimistically(
          {
            balanceId: balance.id,
            expectedRowVersion: balance.rowVersion,
            nextQuantityOnHand: afterQty,
            updatedBy: sourceLog.operatorId ?? undefined,
          },
          db,
        );

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

  private withTransaction<T>(
    tx: Prisma.TransactionClient | undefined,
    handler: (db: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    if (tx) {
      return handler(tx);
    }

    return this.repository.runInTransaction(undefined, handler);
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

  private async findOrCreateBalance(
    materialId: number,
    stockScopeId: number,
    operatorId: string | undefined,
    db: Prisma.TransactionClient,
  ) {
    const existing = await db.inventoryBalance.findUnique({
      where: {
        materialId_stockScopeId: {
          materialId,
          stockScopeId,
        },
      },
    });
    if (existing) {
      return existing;
    }

    try {
      return await db.inventoryBalance.create({
        data: {
          materialId,
          stockScopeId,
          quantityOnHand: 0,
          createdBy: operatorId,
          updatedBy: operatorId,
        },
      });
    } catch (error) {
      if (this.isUniqueConstraintError(error)) {
        const concurrent = await db.inventoryBalance.findUnique({
          where: {
            materialId_stockScopeId: {
              materialId,
              stockScopeId,
            },
          },
        });
        if (concurrent) {
          return concurrent;
        }
      }

      throw error;
    }
  }

  private isUniqueConstraintError(error: unknown) {
    return (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    );
  }

  private async updateBalanceOptimistically(
    params: {
      balanceId: number;
      expectedRowVersion: number;
      nextQuantityOnHand: Prisma.Decimal;
      updatedBy?: string;
    },
    db: Prisma.TransactionClient,
  ) {
    if ("updateBalanceOptimistically" in this.repository) {
      return this.repository.updateBalanceOptimistically(params, db);
    }
    const result = await db.inventoryBalance.updateMany({
      where: { id: params.balanceId, rowVersion: params.expectedRowVersion },
      data: {
        quantityOnHand: params.nextQuantityOnHand,
        rowVersion: { increment: 1 },
        updatedBy: params.updatedBy,
      },
    });
    if (result.count !== 1) {
      throw new ConflictException(INVENTORY_BALANCE_CONFLICT_MESSAGE);
    }
  }

  private async ensureMasterDataExists(
    materialId: number,
    workshopId?: number | null,
  ) {
    await this.masterDataService.getMaterialById(materialId);
    if (workshopId) {
      await this.masterDataService.getWorkshopById(workshopId);
    }
  }
}
