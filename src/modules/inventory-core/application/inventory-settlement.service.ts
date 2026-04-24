import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  type InventoryOperationType as InventoryOperationTypeEnum,
  Prisma,
  StockDirection,
} from "../../../../generated/prisma/client";
import { MasterDataService } from "../../master-data/application/master-data.service";
import { InventoryRepository } from "../infrastructure/inventory.repository";
import { FIFO_SOURCE_OPERATION_TYPES } from "./inventory.constants";
import type {
  FifoAllocationPiece,
  SettleConsumerOutCommand,
  SettleConsumerOutResult,
} from "./inventory.types";
import { InventorySourceUsageService } from "./inventory-source-usage.service";
import { StockScopeCompatibilityService } from "./stock-scope-compatibility.service";

const INVENTORY_BALANCE_CONFLICT_MESSAGE = "库存余额已被并发更新，请重试";
@Injectable()
export class InventorySettlementService {
  constructor(
    private readonly masterDataService: MasterDataService,
    private readonly repository: InventoryRepository,
    private readonly sourceUsageService: InventorySourceUsageService,
    private readonly stockScopeCompatibilityService: StockScopeCompatibilityService,
  ) {}
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
    await this.ensureMasterDataExists(cmd.materialId, cmd.workshopId);
    try {
      return await this.withTransaction(tx, async (db) => {
        let allocations: FifoAllocationPiece[];
        if (cmd.sourceLogId != null) {
          allocations = await this.allocateManualSource(
            cmd.sourceLogId,
            changeQty,
            cmd.materialId,
            scope.stockScopeId,
            sourceTypes,
            selectedUnitCost,
            cmd.sourceProjectTargetId,
            cmd.businessDocumentType,
            cmd.businessDocumentId,
            cmd.consumerLineId,
            cmd.operatorId,
            db,
          );
        } else {
          allocations = await this.allocateByFifo(
            cmd.materialId,
            scope.stockScopeId,
            changeQty,
            sourceTypes,
            selectedUnitCost,
            cmd.sourceProjectTargetId,
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
        const outLog = await db.inventoryLog.create({
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
            unitCost: settledUnitCost,
            costAmount: settledCostAmount,
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
  private async allocateManualSource(
    sourceLogId: number,
    qty: Prisma.Decimal,
    materialId: number,
    stockScopeId: number,
    allowedOperationTypes: InventoryOperationTypeEnum[],
    selectedUnitCost: Prisma.Decimal | null,
    sourceProjectTargetId: number | undefined,
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
      typeof sourceProjectTargetId === "number" &&
      sourceLog.projectTargetId !== sourceProjectTargetId
    ) {
      throw new BadRequestException("手动来源流水不属于当前项目归属");
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
    await this.sourceUsageService.allocateInventorySource(
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
    sourceProjectTargetId: number | undefined,
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
        projectTargetId: sourceProjectTargetId,
      },
      db,
    );
    let remaining = new Prisma.Decimal(qty);
    const allocations: FifoAllocationPiece[] = [];
    for (const candidate of candidates) {
      if (remaining.lte(0)) break;
      await this.repository.lockSourceLog(candidate.id, db);
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
      await this.sourceUsageService.allocateInventorySource(
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
  private withTransaction<T>(
    tx: Prisma.TransactionClient | undefined,
    handler: (db: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    if (tx) {
      return handler(tx);
    }
    return this.repository.runInTransaction(undefined, handler);
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
