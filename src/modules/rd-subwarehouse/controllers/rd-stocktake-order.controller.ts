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
import { RdStocktakeOrderService } from "../application/rd-stocktake-order.service";
import { CreateRdStocktakeOrderDto } from "../dto/create-rd-stocktake-order.dto";
import { QueryRdStocktakeOrderDto } from "../dto/query-rd-stocktake-order.dto";
import { VoidRdStocktakeOrderDto } from "../dto/void-rd-stocktake-order.dto";

@Controller("rd-subwarehouse/stocktake-orders")
export class RdStocktakeOrderController {
  constructor(
    private readonly rdStocktakeOrderService: RdStocktakeOrderService,
    private readonly workshopScopeService: WorkshopScopeService,
  ) {}

  @Permissions("rd:stocktake-order:list")
  @Get()
  async listOrders(
    @Query() query: QueryRdStocktakeOrderDto,
    @CurrentUser() user?: SessionUserSnapshot,
  ) {
    const workshopId = await this.workshopScopeService.resolveQueryWorkshopId(
      user,
      query.workshopId,
    );
    return this.rdStocktakeOrderService.listOrders({
      ...query,
      workshopId,
    });
  }

  @Permissions("rd:stocktake-order:list")
  @Get(":id")
  async getOrder(
    @Param("id", ParseIntPipe) id: number,
    @CurrentUser() user?: SessionUserSnapshot,
  ) {
    const order = await this.rdStocktakeOrderService.getOrderById(id);
    await this.workshopScopeService.assertWorkshopAccess(
      user,
      order.workshopId,
    );
    return order;
  }

  @Permissions("rd:stocktake-order:create")
  @AuditLog({
    title: "新增 RD 盘点调整单",
    action: "CREATE_RD_STOCKTAKE_ORDER",
  })
  @Post()
  async createOrder(
    @Body() dto: CreateRdStocktakeOrderDto,
    @CurrentUser() user?: SessionUserSnapshot,
  ) {
    const scopedDto = await this.workshopScopeService.applyFixedWorkshopScope(
      user,
      dto,
    );
    return this.rdStocktakeOrderService.createOrder(
      scopedDto,
      user?.userId?.toString(),
    );
  }

  @Permissions("rd:stocktake-order:void")
  @AuditLog({
    title: "作废 RD 盘点调整单",
    action: "VOID_RD_STOCKTAKE_ORDER",
  })
  @Post(":id/void")
  async voidOrder(
    @Param("id", ParseIntPipe) id: number,
    @Body() dto: VoidRdStocktakeOrderDto,
    @CurrentUser() user?: SessionUserSnapshot,
  ) {
    const order = await this.rdStocktakeOrderService.getOrderById(id);
    await this.workshopScopeService.assertWorkshopAccess(
      user,
      order.workshopId,
    );
    return this.rdStocktakeOrderService.voidOrder(
      id,
      dto.voidReason,
      user?.userId?.toString(),
    );
  }
}
