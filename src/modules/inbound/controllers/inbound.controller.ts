import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
} from "@nestjs/common";
import { CurrentUser } from "../../../shared/decorators/current-user.decorator";
import { Permissions } from "../../../shared/decorators/permissions.decorator";
import type { SessionUserSnapshot } from "../../session/domain/user-session";
import { InboundService } from "../application/inbound.service";
import { CreateInboundOrderDto } from "../dto/create-inbound-order.dto";
import { QueryInboundOrderDto } from "../dto/query-inbound-order.dto";
import { UpdateInboundOrderDto } from "../dto/update-inbound-order.dto";
import { VoidInboundOrderDto } from "../dto/void-inbound-order.dto";

@Controller("inbound")
export class InboundController {
  constructor(private readonly inboundService: InboundService) {}

  @Permissions("inbound:order:list")
  @Get("orders")
  async listOrders(@Query() query: QueryInboundOrderDto) {
    return this.inboundService.listOrders(query);
  }

  @Permissions("inbound:order:list")
  @Get("orders/:id")
  async getOrder(@Param("id", ParseIntPipe) id: number) {
    return this.inboundService.getOrderById(id);
  }

  @Permissions("inbound:order:create")
  @Post("orders")
  async createOrder(
    @Body() dto: CreateInboundOrderDto,
    @CurrentUser() user?: SessionUserSnapshot,
  ) {
    return this.inboundService.createOrder(dto, user?.userId?.toString());
  }

  @Permissions("inbound:order:update")
  @Patch("orders/:id")
  async updateOrder(
    @Param("id", ParseIntPipe) id: number,
    @Body() dto: UpdateInboundOrderDto,
    @CurrentUser() user?: SessionUserSnapshot,
  ) {
    return this.inboundService.updateOrder(id, dto, user?.userId?.toString());
  }

  @Permissions("inbound:order:void")
  @Post("orders/:id/void")
  async voidOrder(
    @Param("id", ParseIntPipe) id: number,
    @Body() dto: VoidInboundOrderDto,
    @CurrentUser() user?: SessionUserSnapshot,
  ) {
    return this.inboundService.voidOrder(
      id,
      dto.voidReason,
      user?.userId?.toString(),
    );
  }

  @Permissions("inbound:into-order:list")
  @Get("into-orders")
  async listIntoOrders(@Query() query: QueryInboundOrderDto) {
    return this.inboundService.listIntoOrders(query);
  }

  @Permissions("inbound:into-order:create")
  @Post("into-orders")
  async createIntoOrder(
    @Body() dto: CreateInboundOrderDto,
    @CurrentUser() user?: SessionUserSnapshot,
  ) {
    return this.inboundService.createIntoOrder(dto, user?.userId?.toString());
  }
}
