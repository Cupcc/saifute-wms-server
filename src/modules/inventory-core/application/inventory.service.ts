import { Injectable, Optional } from "@nestjs/common";
import { Prisma } from "../../../../generated/prisma/client";
import { MasterDataService } from "../../master-data/application/master-data.service";
import { FactoryNumberRepository } from "../infrastructure/factory-number.repository";
import { InventoryRepository } from "../infrastructure/inventory.repository";
import type {
  AllocateInventorySourceCommand,
  DecreaseStockCommand,
  IncreaseStockCommand,
  ReleaseFactoryNumberReservationsCommand,
  ReleaseInventorySourceCommand,
  ReserveFactoryNumberCommand,
  ReverseStockCommand,
  SettleConsumerOutCommand,
} from "./inventory.types";
import { InventoryQueryService } from "./inventory-query.service";
import { InventorySettlementService } from "./inventory-settlement.service";
import { InventorySourceUsageService } from "./inventory-source-usage.service";
import { InventoryStockMutationService } from "./inventory-stock-mutation.service";
import { StockScopeCompatibilityService } from "./stock-scope-compatibility.service";

export { FIFO_SOURCE_OPERATION_TYPES } from "./inventory.constants";
export type {
  AllocateInventorySourceCommand,
  DecreaseStockCommand,
  FifoAllocationPiece,
  IncreaseStockCommand,
  PriceLayerAvailabilityItem,
  ReleaseFactoryNumberReservationsCommand,
  ReleaseInventorySourceCommand,
  ReserveFactoryNumberCommand,
  ReverseStockCommand,
  SettleConsumerOutCommand,
  SettleConsumerOutResult,
} from "./inventory.types";

@Injectable()
export class InventoryService {
  private readonly stockMutations: InventoryStockMutationService;
  private readonly sourceUsages: InventorySourceUsageService;
  private readonly settlements: InventorySettlementService;
  private readonly queries: InventoryQueryService;

  constructor(
    masterDataService: MasterDataService,
    repository: InventoryRepository,
    factoryNumberRepository: FactoryNumberRepository,
    stockScopeCompatibilityService: StockScopeCompatibilityService,
    @Optional() stockMutations?: InventoryStockMutationService,
    @Optional() sourceUsages?: InventorySourceUsageService,
    @Optional() settlements?: InventorySettlementService,
    @Optional() queries?: InventoryQueryService,
  ) {
    this.sourceUsages =
      sourceUsages ?? new InventorySourceUsageService(repository);
    this.stockMutations =
      stockMutations ??
      new InventoryStockMutationService(
        masterDataService,
        repository,
        stockScopeCompatibilityService,
      );
    this.settlements =
      settlements ??
      new InventorySettlementService(
        masterDataService,
        repository,
        this.sourceUsages,
        stockScopeCompatibilityService,
      );
    this.queries =
      queries ??
      new InventoryQueryService(
        masterDataService,
        repository,
        factoryNumberRepository,
        stockScopeCompatibilityService,
      );
  }

  increaseStock(cmd: IncreaseStockCommand, tx?: Prisma.TransactionClient) {
    return this.stockMutations.increaseStock(cmd, tx);
  }

  decreaseStock(cmd: DecreaseStockCommand, tx?: Prisma.TransactionClient) {
    return this.stockMutations.decreaseStock(cmd, tx);
  }

  reverseStock(cmd: ReverseStockCommand, tx?: Prisma.TransactionClient) {
    return this.stockMutations.reverseStock(cmd, tx);
  }

  allocateInventorySource(
    cmd: AllocateInventorySourceCommand,
    tx?: Prisma.TransactionClient,
  ) {
    return this.sourceUsages.allocateInventorySource(cmd, tx);
  }

  releaseInventorySource(
    cmd: ReleaseInventorySourceCommand,
    tx?: Prisma.TransactionClient,
  ) {
    return this.sourceUsages.releaseInventorySource(cmd, tx);
  }

  settleConsumerOut(
    cmd: SettleConsumerOutCommand,
    tx?: Prisma.TransactionClient,
  ) {
    return this.settlements.settleConsumerOut(cmd, tx);
  }

  releaseAllSourceUsagesForConsumer(
    params: Parameters<
      InventorySourceUsageService["releaseAllSourceUsagesForConsumer"]
    >[0],
    tx?: Prisma.TransactionClient,
  ) {
    return this.sourceUsages.releaseAllSourceUsagesForConsumer(params, tx);
  }

  releaseSourceUsagesForConsumerLine(
    params: Parameters<
      InventorySourceUsageService["releaseSourceUsagesForConsumerLine"]
    >[0],
    tx?: Prisma.TransactionClient,
  ) {
    return this.sourceUsages.releaseSourceUsagesForConsumerLine(params, tx);
  }

  hasUnreleasedAllocations(sourceLogId: number, tx?: Prisma.TransactionClient) {
    return this.sourceUsages.hasUnreleasedAllocations(sourceLogId, tx);
  }

  listBalances(params: Parameters<InventoryQueryService["listBalances"]>[0]) {
    return this.queries.listBalances(params);
  }

  getBalanceSnapshot(
    params: Parameters<InventoryQueryService["getBalanceSnapshot"]>[0],
    tx?: Prisma.TransactionClient,
  ) {
    return this.queries.getBalanceSnapshot(params, tx);
  }

  summarizeAttributedQuantities(
    params: Parameters<
      InventoryQueryService["summarizeAttributedQuantities"]
    >[0],
    tx?: Prisma.TransactionClient,
  ) {
    return this.queries.summarizeAttributedQuantities(params, tx);
  }

  getAttributedQuantitySnapshot(
    params: Parameters<
      InventoryQueryService["getAttributedQuantitySnapshot"]
    >[0],
    tx?: Prisma.TransactionClient,
  ) {
    return this.queries.getAttributedQuantitySnapshot(params, tx);
  }

  listLogs(params: Parameters<InventoryQueryService["listLogs"]>[0]) {
    return this.queries.listLogs(params);
  }

  getLogsForDocument(
    params: Parameters<InventoryQueryService["getLogsForDocument"]>[0],
    tx?: Prisma.TransactionClient,
  ) {
    return this.queries.getLogsForDocument(params, tx);
  }

  reserveFactoryNumber(
    cmd: ReserveFactoryNumberCommand,
    tx?: Prisma.TransactionClient,
  ) {
    return this.queries.reserveFactoryNumber(cmd, tx);
  }

  releaseFactoryNumberReservations(
    cmd: ReleaseFactoryNumberReservationsCommand,
    tx?: Prisma.TransactionClient,
  ) {
    return this.queries.releaseFactoryNumberReservations(cmd, tx);
  }

  listSourceUsages(
    params: Parameters<InventoryQueryService["listSourceUsages"]>[0],
    tx?: Prisma.TransactionClient,
  ) {
    return this.queries.listSourceUsages(params, tx);
  }

  listSourceUsagesForConsumerLine(
    params: Parameters<
      InventoryQueryService["listSourceUsagesForConsumerLine"]
    >[0],
    tx?: Prisma.TransactionClient,
  ) {
    return this.queries.listSourceUsagesForConsumerLine(params, tx);
  }

  listFactoryNumberReservations(
    params: Parameters<
      InventoryQueryService["listFactoryNumberReservations"]
    >[0],
  ) {
    return this.queries.listFactoryNumberReservations(params);
  }

  getFactoryNumberReservationById(id: number) {
    return this.queries.getFactoryNumberReservationById(id);
  }

  listPriceLayerAvailability(
    params: Parameters<InventoryQueryService["listPriceLayerAvailability"]>[0],
  ) {
    return this.queries.listPriceLayerAvailability(params);
  }
}
