import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Query,
} from "@nestjs/common";
import { CurrentUser } from "../../../shared/decorators/current-user.decorator";
import { Permissions } from "../../../shared/decorators/permissions.decorator";
import { AuditLog } from "../../audit-log/decorators/audit-log.decorator";
import { WorkshopScopeService } from "../../rbac/application/workshop-scope.service";
import type { SessionUserSnapshot } from "../../session/domain/user-session";
import { RdHandoffService } from "../application/rd-handoff.service";
import { CreateRdHandoffOrderDto } from "../dto/create-rd-handoff-order.dto";
import { QueryRdHandoffOrderDto } from "../dto/query-rd-handoff-order.dto";
import { VoidRdHandoffOrderDto } from "../dto/void-rd-handoff-order.dto";

@Controller("rd-subwarehouse/handoff-orders")
export class RdHandoffController {
  constructor(
    private readonly rdHandoffService: RdHandoffService,
    private readonly workshopScopeService: WorkshopScopeService,
  ) {}

  @Permissions("rd:handoff-order:list")
  @Get()
  async listOrders(
    @Query() query: QueryRdHandoffOrderDto,
    @CurrentUser() user?: SessionUserSnapshot,
  ) {
    await this.workshopScopeService.getResolvedStockScope(user);
    return this.rdHandoffService.listOrders(query);
  }

  @Permissions("rd:handoff-order:list")
  @Get(":id")
  async getOrder(
    @Param("id", ParseIntPipe) id: number,
    @CurrentUser() user?: SessionUserSnapshot,
  ) {
    const order = await this.rdHandoffService.getOrderById(id);
    await this.workshopScopeService.assertInventoryStockScopeAccess(
      user,
      order.targetStockScopeId,
    );
    return order;
  }

  @Permissions("rd:handoff-order:create")
  @AuditLog({ title: "新增 RD 交接单", action: "CREATE_RD_HANDOFF_ORDER" })
  @Post()
  async createOrder(
    @Body() dto: CreateRdHandoffOrderDto,
    @CurrentUser() user?: SessionUserSnapshot,
  ) {
    return this.rdHandoffService.createOrder(dto, user?.userId?.toString());
  }

  @Permissions("rd:handoff-order:void")
  @AuditLog({ title: "作废 RD 交接单", action: "VOID_RD_HANDOFF_ORDER" })
  @Post(":id/void")
  async voidOrder(
    @Param("id", ParseIntPipe) id: number,
    @Body() dto: VoidRdHandoffOrderDto,
    @CurrentUser() user?: SessionUserSnapshot,
  ) {
    const order = await this.rdHandoffService.getOrderById(id);
    await this.workshopScopeService.assertInventoryStockScopeAccess(
      user,
      order.targetStockScopeId,
    );
    return this.rdHandoffService.voidOrder(
      id,
      dto.voidReason,
      user?.userId?.toString(),
    );
  }
}
