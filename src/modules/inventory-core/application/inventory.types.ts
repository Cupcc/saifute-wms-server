import {
  type InventoryOperationType as InventoryOperationTypeEnum,
  Prisma,
} from "../../../../generated/prisma/client";
import { type StockScopeCode } from "../../session/domain/user-session";
import { InventoryRepository } from "../infrastructure/inventory.repository";

export interface IncreaseStockCommand {
  materialId: number;
  stockScope?: StockScopeCode;
  workshopId?: number;
  projectTargetId?: number;
  bizDate: Date;
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
  unitCost?: Prisma.Decimal | number | string | null;
  costAmount?: Prisma.Decimal | number | string | null;
}

export interface DecreaseStockCommand {
  materialId: number;
  stockScope?: StockScopeCode;
  workshopId?: number;
  projectTargetId?: number;
  bizDate: Date;
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

export interface SettleConsumerOutCommand extends DecreaseStockCommand {
  consumerLineId: number;
  sourceLogId?: number;
  selectedUnitCost?: Prisma.Decimal | number | string;
  sourceOperationTypes?: InventoryOperationTypeEnum[];
  sourceProjectTargetId?: number;
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
