import { Injectable } from "@nestjs/common";
import type { CreateOutboundOrderDto } from "../dto/create-outbound-order.dto";
import type { CreateSalesReturnDto } from "../dto/create-sales-return.dto";
import type { QueryOutboundOrderDto } from "../dto/query-outbound-order.dto";
import type { QuerySalesReturnDto } from "../dto/query-sales-return.dto";
import type { UpdateOutboundOrderDto } from "../dto/update-outbound-order.dto";
import { SalesOutboundService } from "./sales-outbound.service";
import { SalesOutboundUpdateService } from "./sales-outbound-update.service";
import { SalesReturnService } from "./sales-return.service";

@Injectable()
export class SalesService {
  constructor(
    private readonly outboundService: SalesOutboundService,
    private readonly outboundUpdateService: SalesOutboundUpdateService,
    private readonly returnService: SalesReturnService,
  ) {}

  async listOrders(query: QueryOutboundOrderDto) {
    return this.outboundService.listOrders(query);
  }

  async getOrderById(id: number) {
    return this.outboundService.getOrderById(id);
  }

  async createOrder(dto: CreateOutboundOrderDto, createdBy?: string) {
    return this.outboundService.createOrder(dto, createdBy);
  }

  async updateOrder(
    id: number,
    dto: UpdateOutboundOrderDto,
    updatedBy?: string,
  ) {
    return this.outboundUpdateService.updateOrder(id, dto, updatedBy);
  }

  async voidOrder(id: number, voidReason?: string, voidedBy?: string) {
    return this.outboundService.voidOrder(id, voidReason, voidedBy);
  }

  async listSalesReturns(query: QuerySalesReturnDto) {
    return this.returnService.listSalesReturns(query);
  }

  async getSalesReturnById(id: number) {
    return this.returnService.getSalesReturnById(id);
  }

  async createSalesReturn(dto: CreateSalesReturnDto, createdBy?: string) {
    return this.returnService.createSalesReturn(dto, createdBy);
  }

  async voidSalesReturn(id: number, voidReason?: string, voidedBy?: string) {
    return this.returnService.voidSalesReturn(id, voidReason, voidedBy);
  }
}
