import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Put,
  Query,
} from "@nestjs/common";
import { CurrentUser } from "../../../shared/decorators/current-user.decorator";
import { Permissions } from "../../../shared/decorators/permissions.decorator";
import { WorkshopScopeService } from "../../rbac/application/workshop-scope.service";
import type { SessionUserSnapshot } from "../../session/domain/user-session";
import { WorkshopMaterialService } from "../application/workshop-material.service";
import { CreateWorkshopMaterialOrderDto } from "../dto/create-workshop-material-order.dto";
import { QueryWorkshopMaterialOrderDto } from "../dto/query-workshop-material-order.dto";
import { UpdateWorkshopMaterialOrderDto } from "../dto/update-workshop-material-order.dto";
import { VoidWorkshopMaterialOrderDto } from "../dto/void-workshop-material-order.dto";

@Controller("workshop-material")
export class WorkshopMaterialController {
  constructor(
    private readonly workshopMaterialService: WorkshopMaterialService,
    private readonly workshopScopeService: WorkshopScopeService,
  ) {}

  @Permissions("workshop-material:pick-order:list")
  @Get("pick-orders")
  async listPickOrders(
    @Query() query: QueryWorkshopMaterialOrderDto,
    @CurrentUser() user?: SessionUserSnapshot,
  ) {
    const workshopId = await this.workshopScopeService.resolveQueryWorkshopId(
      user,
      query.workshopId,
    );
    return this.workshopMaterialService.listPickOrders({
      ...query,
      workshopId,
    });
  }

  @Permissions("workshop-material:pick-order:list")
  @Get("pick-orders/:id")
  async getPickOrder(
    @Param("id", ParseIntPipe) id: number,
    @CurrentUser() user?: SessionUserSnapshot,
  ) {
    const order = await this.workshopMaterialService.getPickOrderById(id);
    await this.workshopScopeService.assertWorkshopAccess(
      user,
      order.workshopId,
    );
    return order;
  }

  @Permissions("workshop-material:pick-order:create")
  @Post("pick-orders")
  async createPickOrder(
    @Body() dto: CreateWorkshopMaterialOrderDto,
    @CurrentUser() user?: SessionUserSnapshot,
  ) {
    const scopedDto = await this.workshopScopeService.applyFixedWorkshopScope(
      user,
      dto,
    );
    return this.workshopMaterialService.createPickOrder(
      scopedDto,
      user?.userId?.toString(),
    );
  }

  @Permissions("workshop-material:pick-order:update")
  @Put("pick-orders/:id")
  async updatePickOrder(
    @Param("id", ParseIntPipe) id: number,
    @Body() dto: UpdateWorkshopMaterialOrderDto,
    @CurrentUser() user?: SessionUserSnapshot,
  ) {
    const order = await this.workshopMaterialService.getPickOrderById(id);
    await this.workshopScopeService.assertWorkshopAccess(
      user,
      order.workshopId,
    );
    const scopedDto = await this.workshopScopeService.applyFixedWorkshopScope(
      user,
      dto,
    );
    return this.workshopMaterialService.updatePickOrder(
      id,
      scopedDto,
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
    const order = await this.workshopMaterialService.getPickOrderById(id);
    await this.workshopScopeService.assertWorkshopAccess(
      user,
      order.workshopId,
    );
    return this.workshopMaterialService.voidPickOrder(
      id,
      dto.voidReason,
      user?.userId?.toString(),
    );
  }

  @Permissions("workshop-material:return-order:list")
  @Get("return-orders")
  async listReturnOrders(
    @Query() query: QueryWorkshopMaterialOrderDto,
    @CurrentUser() user?: SessionUserSnapshot,
  ) {
    const workshopId = await this.workshopScopeService.resolveQueryWorkshopId(
      user,
      query.workshopId,
    );
    return this.workshopMaterialService.listReturnOrders({
      ...query,
      workshopId,
    });
  }

  @Permissions("workshop-material:return-order:list")
  @Get("return-orders/:id")
  async getReturnOrder(
    @Param("id", ParseIntPipe) id: number,
    @CurrentUser() user?: SessionUserSnapshot,
  ) {
    const order = await this.workshopMaterialService.getReturnOrderById(id);
    await this.workshopScopeService.assertWorkshopAccess(
      user,
      order.workshopId,
    );
    return order;
  }

  @Permissions("workshop-material:return-order:create")
  @Post("return-orders")
  async createReturnOrder(
    @Body() dto: CreateWorkshopMaterialOrderDto,
    @CurrentUser() user?: SessionUserSnapshot,
  ) {
    const scopedDto = await this.workshopScopeService.applyFixedWorkshopScope(
      user,
      dto,
    );
    return this.workshopMaterialService.createReturnOrder(
      scopedDto,
      user?.userId?.toString(),
    );
  }

  @Permissions("workshop-material:return-order:update")
  @Put("return-orders/:id")
  async updateReturnOrder(
    @Param("id", ParseIntPipe) id: number,
    @Body() dto: UpdateWorkshopMaterialOrderDto,
    @CurrentUser() user?: SessionUserSnapshot,
  ) {
    const order = await this.workshopMaterialService.getReturnOrderById(id);
    await this.workshopScopeService.assertWorkshopAccess(
      user,
      order.workshopId,
    );
    const scopedDto = await this.workshopScopeService.applyFixedWorkshopScope(
      user,
      dto,
    );
    return this.workshopMaterialService.updateReturnOrder(
      id,
      scopedDto,
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
    const order = await this.workshopMaterialService.getReturnOrderById(id);
    await this.workshopScopeService.assertWorkshopAccess(
      user,
      order.workshopId,
    );
    return this.workshopMaterialService.voidReturnOrder(
      id,
      dto.voidReason,
      user?.userId?.toString(),
    );
  }

  @Permissions("workshop-material:scrap-order:list")
  @Get("scrap-orders")
  async listScrapOrders(
    @Query() query: QueryWorkshopMaterialOrderDto,
    @CurrentUser() user?: SessionUserSnapshot,
  ) {
    const workshopId = await this.workshopScopeService.resolveQueryWorkshopId(
      user,
      query.workshopId,
    );
    const inventoryScope =
      await this.workshopScopeService.resolveInventoryQueryScope(
        user,
        query.workshopId,
      );
    return this.workshopMaterialService.listScrapOrders({
      ...query,
      workshopId,
      stockScope: inventoryScope?.stockScope,
    });
  }

  @Permissions("workshop-material:scrap-order:list")
  @Get("scrap-orders/:id")
  async getScrapOrder(
    @Param("id", ParseIntPipe) id: number,
    @CurrentUser() user?: SessionUserSnapshot,
  ) {
    const order = await this.workshopMaterialService.getScrapOrderById(id);
    await this.workshopScopeService.assertWorkshopAccess(
      user,
      order.workshopId,
    );
    await this.workshopScopeService.assertInventoryStockScopeAccess(
      user,
      order.stockScopeId,
    );
    return order;
  }

  @Permissions("workshop-material:scrap-order:create")
  @Post("scrap-orders")
  async createScrapOrder(
    @Body() dto: CreateWorkshopMaterialOrderDto,
    @CurrentUser() user?: SessionUserSnapshot,
  ) {
    const scopedDto = await this.workshopScopeService.applyFixedWorkshopScope(
      user,
      dto,
    );
    const inventoryScope =
      await this.workshopScopeService.getResolvedStockScope(user);
    return this.workshopMaterialService.createScrapOrder(
      {
        ...scopedDto,
        stockScope: inventoryScope?.stockScope,
      },
      user?.userId?.toString(),
    );
  }

  @Permissions("workshop-material:scrap-order:update")
  @Put("scrap-orders/:id")
  async updateScrapOrder(
    @Param("id", ParseIntPipe) id: number,
    @Body() dto: UpdateWorkshopMaterialOrderDto,
    @CurrentUser() user?: SessionUserSnapshot,
  ) {
    const order = await this.workshopMaterialService.getScrapOrderById(id);
    await this.workshopScopeService.assertWorkshopAccess(
      user,
      order.workshopId,
    );
    await this.workshopScopeService.assertInventoryStockScopeAccess(
      user,
      order.stockScopeId,
    );
    const scopedDto = await this.workshopScopeService.applyFixedWorkshopScope(
      user,
      dto,
    );
    const inventoryScope =
      await this.workshopScopeService.getResolvedStockScope(user);
    return this.workshopMaterialService.updateScrapOrder(
      id,
      {
        ...scopedDto,
        stockScope: inventoryScope?.stockScope,
      },
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
    const order = await this.workshopMaterialService.getScrapOrderById(id);
    await this.workshopScopeService.assertWorkshopAccess(
      user,
      order.workshopId,
    );
    await this.workshopScopeService.assertInventoryStockScopeAccess(
      user,
      order.stockScopeId,
    );
    return this.workshopMaterialService.voidScrapOrder(
      id,
      dto.voidReason,
      user?.userId?.toString(),
    );
  }
}
