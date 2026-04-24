import { Injectable, NotFoundException } from "@nestjs/common";
import {
  FactoryNumberReservationStatus,
  type InventoryOperationType as InventoryOperationTypeEnum,
  Prisma,
  StockDirection,
} from "../../../../generated/prisma/client";
import { MasterDataService } from "../../master-data/application/master-data.service";
import { type StockScopeCode } from "../../session/domain/user-session";
import { FactoryNumberRepository } from "../infrastructure/factory-number.repository";
import { InventoryRepository } from "../infrastructure/inventory.repository";
import { FIFO_SOURCE_OPERATION_TYPES } from "./inventory.constants";
import type {
  PriceLayerAvailabilityItem,
  ReleaseFactoryNumberReservationsCommand,
  ReserveFactoryNumberCommand,
} from "./inventory.types";
import { StockScopeCompatibilityService } from "./stock-scope-compatibility.service";

@Injectable()
export class InventoryQueryService {
  constructor(
    private readonly masterDataService: MasterDataService,
    private readonly repository: InventoryRepository,
    private readonly factoryNumberRepository: FactoryNumberRepository,
    private readonly stockScopeCompatibilityService: StockScopeCompatibilityService,
  ) {}

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
    await this.ensureMasterDataExists(params.materialId, params.workshopId);
    return this.repository.findBalanceByMaterialAndStockScope(
      params.materialId,
      scope.stockScopeId,
      tx,
    );
  }

  async summarizeAttributedQuantities(
    params: {
      materialIds: number[];
      stockScope?: StockScopeCode;
      workshopId?: number;
      projectTargetId: number;
    },
    tx?: Prisma.TransactionClient,
  ) {
    const scope = await this.stockScopeCompatibilityService.resolveRequired({
      stockScope: params.stockScope,
      workshopId: params.workshopId,
    });
    const materialIds = [...new Set(params.materialIds)].filter(
      (value) => value > 0,
    );
    if (materialIds.length === 0) {
      return new Map<number, Prisma.Decimal>();
    }

    const logs = await this.repository.findEffectiveLogsByProjectTarget(
      {
        stockScopeId: scope.stockScopeId,
        projectTargetId: params.projectTargetId,
        materialIds,
      },
      tx,
    );

    const summary = new Map<number, Prisma.Decimal>();
    for (const materialId of materialIds) {
      summary.set(materialId, new Prisma.Decimal(0));
    }

    for (const log of logs) {
      const current = summary.get(log.materialId) ?? new Prisma.Decimal(0);
      const delta =
        log.direction === StockDirection.IN
          ? new Prisma.Decimal(log.changeQty)
          : new Prisma.Decimal(log.changeQty).neg();
      summary.set(log.materialId, current.add(delta));
    }

    return summary;
  }

  async getAttributedQuantitySnapshot(
    params: {
      materialId: number;
      stockScope?: StockScopeCode;
      workshopId?: number;
      projectTargetId: number;
    },
    tx?: Prisma.TransactionClient,
  ) {
    const summary = await this.summarizeAttributedQuantities(
      {
        materialIds: [params.materialId],
        stockScope: params.stockScope,
        workshopId: params.workshopId,
        projectTargetId: params.projectTargetId,
      },
      tx,
    );
    return summary.get(params.materialId) ?? new Prisma.Decimal(0);
  }

  async listLogs(params: {
    materialId?: number;
    stockScope?: StockScopeCode;
    workshopId?: number;
    businessDocumentId?: number;
    businessDocumentType?: string;
    businessDocumentNumber?: string;
    operationType?: string;
    bizDateFrom?: string;
    bizDateTo?: string;
    limit?: number;
    offset?: number;
  }) {
    const limit = Math.min(params.limit ?? 50, 100);
    const offset = params.offset ?? 0;
    const stockScopeIds = await this.resolveInventoryStockScopeIds(params);
    const result = await this.repository.findLogs({
      materialId: params.materialId,
      stockScopeIds,
      workshopId: params.workshopId,
      businessDocumentId: params.businessDocumentId,
      businessDocumentType: params.businessDocumentType,
      businessDocumentNumber: params.businessDocumentNumber,
      operationType: params.operationType,
      bizDateFrom: params.bizDateFrom
        ? new Date(params.bizDateFrom)
        : undefined,
      bizDateTo: params.bizDateTo
        ? this.toInclusiveEndDate(params.bizDateTo)
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
    await this.ensureMasterDataExists(cmd.materialId, cmd.workshopId);
    return this.factoryNumberRepository.runInTransaction(tx, async (db) => {
      return this.factoryNumberRepository.createFactoryNumberReservation(
        {
          materialId: cmd.materialId,
          stockScopeId: scope.stockScopeId,
          workshopId: cmd.workshopId ?? null,
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
    return this.factoryNumberRepository.runInTransaction(tx, async (db) => {
      return this.factoryNumberRepository.releaseFactoryNumberReservations(
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
      stockScope?: StockScopeCode;
      workshopId?: number;
      consumerDocumentType?: string;
      consumerDocumentId?: number;
      limit?: number;
      offset?: number;
    },
    tx?: Prisma.TransactionClient,
  ) {
    const limit = Math.min(params.limit ?? 50, 100);
    const offset = params.offset ?? 0;
    const stockScopeIds = await this.resolveInventoryStockScopeIds(params);
    return this.repository.findSourceUsages(
      {
        materialId: params.materialId,
        stockScopeIds,
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
    const result =
      await this.factoryNumberRepository.findFactoryNumberReservations({
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
      await this.factoryNumberRepository.findFactoryNumberReservationById(id);
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
    projectTargetId?: number;
  }): Promise<PriceLayerAvailabilityItem[]> {
    const scope = await this.stockScopeCompatibilityService.resolveRequired({
      stockScope: params.stockScope,
      workshopId: params.workshopId,
    });
    await this.ensureMasterDataExists(params.materialId, params.workshopId);

    const sourceLogs = await this.repository.findFifoSourceLogs({
      materialId: params.materialId,
      stockScopeId: scope.stockScopeId,
      sourceOperationTypes:
        params.sourceOperationTypes ?? FIFO_SOURCE_OPERATION_TYPES,
      projectTargetId: params.projectTargetId,
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
    },
  >(item: T): T & { stockScope: StockScopeCode | null } {
    return {
      ...item,
      stockScope: item.stockScope
        ? (item.stockScope.scopeCode as StockScopeCode)
        : null,
    };
  }

  private toInclusiveEndDate(dateText: string): Date {
    const date = new Date(dateText);
    date.setHours(23, 59, 59, 999);
    return date;
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
