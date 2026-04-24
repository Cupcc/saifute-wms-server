import { Injectable } from "@nestjs/common";
import type { CreateInboundOrderDto } from "../dto/create-inbound-order.dto";
import type { QueryInboundOrderDto } from "../dto/query-inbound-order.dto";
import type { UpdateInboundOrderDto } from "../dto/update-inbound-order.dto";
import { InboundAcceptanceCreationService } from "./inbound-acceptance-creation.service";
import { InboundAcceptanceUpdateService } from "./inbound-acceptance-update.service";
import { InboundProductionReceiptCreationService } from "./inbound-production-receipt-creation.service";
import { InboundProductionReceiptUpdateService } from "./inbound-production-receipt-update.service";

@Injectable()
export class InboundService {
  constructor(
    private readonly acceptanceCreation: InboundAcceptanceCreationService,
    private readonly acceptanceUpdate: InboundAcceptanceUpdateService,
    private readonly productionCreation: InboundProductionReceiptCreationService,
    private readonly productionUpdate: InboundProductionReceiptUpdateService,
  ) {}

  listOrders(query: QueryInboundOrderDto & { stockScopeId?: number }) {
    return this.acceptanceCreation.listOrders({
      ...query,
      limit: query.limit ?? 50,
      offset: query.offset ?? 0,
      bizDateFrom: query.bizDateFrom ? new Date(query.bizDateFrom) : undefined,
      bizDateTo: query.bizDateTo ? new Date(query.bizDateTo) : undefined,
    });
  }

  listIntoOrders(query: QueryInboundOrderDto & { stockScopeId?: number }) {
    return this.productionCreation.listOrders({
      ...query,
      limit: query.limit ?? 50,
      offset: query.offset ?? 0,
      bizDateFrom: query.bizDateFrom ? new Date(query.bizDateFrom) : undefined,
      bizDateTo: query.bizDateTo ? new Date(query.bizDateTo) : undefined,
    });
  }

  getOrderById(id: number) {
    return this.acceptanceCreation.getOrderById(id);
  }

  createOrder(dto: CreateInboundOrderDto, createdBy?: string) {
    if (dto.orderType === "PRODUCTION_RECEIPT") {
      return this.productionCreation.createOrder(dto, createdBy);
    }
    return this.acceptanceCreation.createOrder(dto, createdBy);
  }

  createIntoOrder(dto: CreateInboundOrderDto, createdBy?: string) {
    return this.productionCreation.createOrder(dto, createdBy);
  }

  updateOrder(
    id: number,
    dto: UpdateInboundOrderDto & { orderType?: string },
    updatedBy?: string,
  ) {
    if (dto.orderType === "PRODUCTION_RECEIPT") {
      return this.productionUpdate.updateOrder(id, dto, updatedBy);
    }
    return this.acceptanceUpdate.updateOrder(id, dto, updatedBy);
  }

  voidOrder(id: number, voidReason?: string, voidedBy?: string) {
    return this.acceptanceUpdate.voidOrder(id, voidReason, voidedBy);
  }
}
