import { BadRequestException } from "@nestjs/common";
import {
  InventoryOperationType,
  WorkshopMaterialOrderType,
} from "../../../../generated/prisma/client";

/**
 * Maps a workshop-material order type to the inventory operation type that the
 * inventory-core service expects. Centralised here so PICK / RETURN / SCRAP
 * application services do not duplicate the switch.
 */
export function toOperationType(
  orderType: WorkshopMaterialOrderType,
): InventoryOperationType {
  switch (orderType) {
    case WorkshopMaterialOrderType.PICK:
      return InventoryOperationType.PICK_OUT;
    case WorkshopMaterialOrderType.RETURN:
      return InventoryOperationType.RETURN_IN;
    case WorkshopMaterialOrderType.SCRAP:
      return InventoryOperationType.SCRAP_OUT;
    default:
      throw new BadRequestException(`Unsupported orderType: ${orderType}`);
  }
}

/**
 * Document-number prefix per order type. PICK uses 领料 (LL), RETURN 退料 (TL),
 * SCRAP 报废 (BF).
 */
export function toCreateDocumentPrefix(orderType: WorkshopMaterialOrderType) {
  switch (orderType) {
    case WorkshopMaterialOrderType.PICK:
      return "LL";
    case WorkshopMaterialOrderType.RETURN:
      return "TL";
    case WorkshopMaterialOrderType.SCRAP:
      return "BF";
    default:
      throw new BadRequestException(`Unsupported orderType: ${orderType}`);
  }
}
