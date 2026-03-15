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
import { OutboundService } from "../application/outbound.service";
import { CreateOutboundOrderDto } from "../dto/create-outbound-order.dto";
import { CreateSalesReturnDto } from "../dto/create-sales-return.dto";
import { QueryOutboundOrderDto } from "../dto/query-outbound-order.dto";
import { QuerySalesReturnDto } from "../dto/query-sales-return.dto";
import { UpdateOutboundOrderDto } from "../dto/update-outbound-order.dto";
import { VoidOutboundOrderDto } from "../dto/void-outbound-order.dto";
import { VoidSalesReturnDto } from "../dto/void-sales-return.dto";

@Controller("outbound")
export class OutboundController {
  constructor(private readonly outboundService: OutboundService) {}

  @Permissions("outbound:order:list")
  @Get("orders")
  async listOrders(@Query() query: QueryOutboundOrderDto) {
    return this.outboundService.listOrders(query);
  }

  @Permissions("outbound:order:list")
  @Get("orders/:id")
  async getOrder(@Param("id", ParseIntPipe) id: number) {
    return this.outboundService.getOrderById(id);
  }

  @Permissions("outbound:order:create")
  @Post("orders")
  async createOrder(
    @Body() dto: CreateOutboundOrderDto,
    @CurrentUser() user?: SessionUserSnapshot,
  ) {
    return this.outboundService.createOrder(dto, user?.userId?.toString());
  }

  @Permissions("outbound:order:update")
  @Patch("orders/:id")
  async updateOrder(
    @Param("id", ParseIntPipe) id: number,
    @Body() dto: UpdateOutboundOrderDto,
    @CurrentUser() user?: SessionUserSnapshot,
  ) {
    return this.outboundService.updateOrder(id, dto, user?.userId?.toString());
  }

  @Permissions("outbound:order:void")
  @Post("orders/:id/void")
  async voidOrder(
    @Param("id", ParseIntPipe) id: number,
    @Body() dto: VoidOutboundOrderDto,
    @CurrentUser() user?: SessionUserSnapshot,
  ) {
    return this.outboundService.voidOrder(
      id,
      dto.voidReason,
      user?.userId?.toString(),
    );
  }

  @Permissions("outbound:sales-return:list")
  @Get("sales-returns")
  async listSalesReturns(@Query() query: QuerySalesReturnDto) {
    return this.outboundService.listSalesReturns(query);
  }

  @Permissions("outbound:sales-return:list")
  @Get("sales-returns/:id")
  async getSalesReturn(@Param("id", ParseIntPipe) id: number) {
    return this.outboundService.getSalesReturnById(id);
  }

  @Permissions("outbound:sales-return:create")
  @Post("sales-returns")
  async createSalesReturn(
    @Body() dto: CreateSalesReturnDto,
    @CurrentUser() user?: SessionUserSnapshot,
  ) {
    return this.outboundService.createSalesReturn(
      dto,
      user?.userId?.toString(),
    );
  }

  @Permissions("outbound:sales-return:void")
  @Post("sales-returns/:id/void")
  async voidSalesReturn(
    @Param("id", ParseIntPipe) id: number,
    @Body() dto: VoidSalesReturnDto,
    @CurrentUser() user?: SessionUserSnapshot,
  ) {
    return this.outboundService.voidSalesReturn(
      id,
      dto.voidReason,
      user?.userId?.toString(),
    );
  }
}
