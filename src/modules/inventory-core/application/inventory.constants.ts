import {
  InventoryOperationType,
  type InventoryOperationType as InventoryOperationTypeEnum,
} from "../../../../generated/prisma/client";

/** Operation types that produce real source-layer IN logs eligible for FIFO consumption. */
export const FIFO_SOURCE_OPERATION_TYPES: InventoryOperationTypeEnum[] = [
  InventoryOperationType.ACCEPTANCE_IN,
  InventoryOperationType.PRODUCTION_RECEIPT_IN,
  InventoryOperationType.PRICE_CORRECTION_IN,
  InventoryOperationType.RD_HANDOFF_IN,
];
