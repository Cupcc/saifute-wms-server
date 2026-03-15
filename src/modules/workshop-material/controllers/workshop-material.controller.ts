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
import type { SessionUserSnapshot } from "../../session/domain/user-session";
import { WorkshopMaterialService } from "../application/workshop-material.service";
import { CreateWorkshopMaterialOrderDto } from "../dto/create-workshop-material-order.dto";
import { QueryWorkshopMaterialOrderDto } from "../dto/query-workshop-material-order.dto";
import { VoidWorkshopMaterialOrderDto } from "../dto/void-workshop-material-order.dto";

@Controller("workshop-material")
export class WorkshopMaterialController {
  constructor(
    private readonly workshopMaterialService: WorkshopMaterialService,
  ) {}

  @Permissions("workshop-material:pick-order:list")
  @Get("pick-orders")
  async listPickOrders(@Query() query: QueryWorkshopMaterialOrderDto) {
    return this.workshopMaterialService.listPickOrders(query);
  }

  @Permissions("workshop-material:pick-order:list")
  @Get("pick-orders/:id")
  async getPickOrder(@Param("id", ParseIntPipe) id: number) {
    return this.workshopMaterialService.getPickOrderById(id);
  }

  @Permissions("workshop-material:pick-order:create")
  @Post("pick-orders")
  async createPickOrder(
    @Body() dto: CreateWorkshopMaterialOrderDto,
    @CurrentUser() user?: SessionUserSnapshot,
  ) {
    return this.workshopMaterialService.createPickOrder(
      dto,
      user?.userId?.toString(),
    );
  }

  @Permissions("workshop-material:pick-order:void")
  @Post("pick-orders/:id/void")
  async voidPickOrder(
    @Param("id", ParseIntPipe) id: number,
    @Body() dto: VoidWorkshopMaterialOrderDto,
    @CurrentUser() user?: SessionUserSnapshot,
  ) {
    return this.workshopMaterialService.voidPickOrder(
      id,
      dto.voidReason,
      user?.userId?.toString(),
    );
  }

  @Permissions("workshop-material:return-order:list")
  @Get("return-orders")
  async listReturnOrders(@Query() query: QueryWorkshopMaterialOrderDto) {
    return this.workshopMaterialService.listReturnOrders(query);
  }

  @Permissions("workshop-material:return-order:list")
  @Get("return-orders/:id")
  async getReturnOrder(@Param("id", ParseIntPipe) id: number) {
    return this.workshopMaterialService.getReturnOrderById(id);
  }

  @Permissions("workshop-material:return-order:create")
  @Post("return-orders")
  async createReturnOrder(
    @Body() dto: CreateWorkshopMaterialOrderDto,
    @CurrentUser() user?: SessionUserSnapshot,
  ) {
    return this.workshopMaterialService.createReturnOrder(
      dto,
      user?.userId?.toString(),
    );
  }

  @Permissions("workshop-material:return-order:void")
  @Post("return-orders/:id/void")
  async voidReturnOrder(
    @Param("id", ParseIntPipe) id: number,
    @Body() dto: VoidWorkshopMaterialOrderDto,
    @CurrentUser() user?: SessionUserSnapshot,
  ) {
    return this.workshopMaterialService.voidReturnOrder(
      id,
      dto.voidReason,
      user?.userId?.toString(),
    );
  }

  @Permissions("workshop-material:scrap-order:list")
  @Get("scrap-orders")
  async listScrapOrders(@Query() query: QueryWorkshopMaterialOrderDto) {
    return this.workshopMaterialService.listScrapOrders(query);
  }

  @Permissions("workshop-material:scrap-order:list")
  @Get("scrap-orders/:id")
  async getScrapOrder(@Param("id", ParseIntPipe) id: number) {
    return this.workshopMaterialService.getScrapOrderById(id);
  }

  @Permissions("workshop-material:scrap-order:create")
  @Post("scrap-orders")
  async createScrapOrder(
    @Body() dto: CreateWorkshopMaterialOrderDto,
    @CurrentUser() user?: SessionUserSnapshot,
  ) {
    return this.workshopMaterialService.createScrapOrder(
      dto,
      user?.userId?.toString(),
    );
  }

  @Permissions("workshop-material:scrap-order:void")
  @Post("scrap-orders/:id/void")
  async voidScrapOrder(
    @Param("id", ParseIntPipe) id: number,
    @Body() dto: VoidWorkshopMaterialOrderDto,
    @CurrentUser() user?: SessionUserSnapshot,
  ) {
    return this.workshopMaterialService.voidScrapOrder(
      id,
      dto.voidReason,
      user?.userId?.toString(),
    );
  }
}
