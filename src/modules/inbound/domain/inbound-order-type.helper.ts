import { BadRequestException } from "@nestjs/common";
import {
  InventoryOperationType,
  StockInOrderType,
} from "../../../../generated/prisma/client";

export function toOperationType(
  orderType: StockInOrderType,
): InventoryOperationType {
  switch (orderType) {
    case StockInOrderType.ACCEPTANCE:
      return InventoryOperationType.ACCEPTANCE_IN;
    case StockInOrderType.PRODUCTION_RECEIPT:
      return InventoryOperationType.PRODUCTION_RECEIPT_IN;
    case StockInOrderType.SUPPLIER_RETURN:
      return InventoryOperationType.SUPPLIER_RETURN_OUT;
    default:
      throw new BadRequestException(`Unsupported orderType: ${orderType}`);
  }
}

export function toCreateDocumentPrefix(
  orderType: StockInOrderType,
): "YS" | "RK" | "TG" {
  switch (orderType) {
    case StockInOrderType.ACCEPTANCE:
      return "YS";
    case StockInOrderType.PRODUCTION_RECEIPT:
      return "RK";
    case StockInOrderType.SUPPLIER_RETURN:
      return "TG";
    default:
      throw new BadRequestException(`Unsupported orderType: ${orderType}`);
  }
}
