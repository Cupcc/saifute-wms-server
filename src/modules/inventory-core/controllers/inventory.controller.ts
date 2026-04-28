import { Controller, Get, Param, ParseIntPipe, Query } from "@nestjs/common";
import { CurrentUser } from "../../../shared/decorators/current-user.decorator";
import { Permissions } from "../../../shared/decorators/permissions.decorator";
import { WorkshopScopeService } from "../../rbac/application/workshop-scope.service";
import type { SessionUserSnapshot } from "../../session/domain/user-session";
import { InventoryService } from "../application/inventory.service";
import {
  QueryFactoryNumberReservationsDto,
  QueryInventoryBalancesDto,
  QueryInventoryLogsDto,
  QueryInventoryPriceLayersDto,
  QueryInventorySourceUsagesDto,
} from "../dto/query-inventory.dto";

@Controller("inventory")
export class InventoryController {
  constructor(
    private readonly inventoryService: InventoryService,
    private readonly workshopScopeService: WorkshopScopeService,
  ) {}

  @Permissions("inventory:balance:list")
  @Get("balances")
  async listBalances(
    @Query() query: QueryInventoryBalancesDto,
    @CurrentUser() user?: SessionUserSnapshot,
  ) {
    const inventoryScope =
      await this.workshopScopeService.resolveInventoryQueryScope(
        user,
        query.workshopId,
        query.stockScope,
      );
    return this.inventoryService.listBalances({
      materialId: query.materialId,
      stockScope: inventoryScope?.stockScope,
      keyword: query.keyword,
      categoryIds: query.categoryIds,
      limit: query.limit,
      offset: query.offset,
    });
  }

  @Permissions("inventory:log:list")
  @Get("logs")
  async listLogs(
    @Query() query: QueryInventoryLogsDto,
    @CurrentUser() user?: SessionUserSnapshot,
  ) {
    const inventoryScope =
      await this.workshopScopeService.resolveInventoryQueryScope(
        user,
        query.workshopId,
        query.stockScope,
      );
    const workshopId =
      await this.workshopScopeService.resolveInventoryQueryWorkshopId(
        user,
        query.workshopId,
      );
    return this.inventoryService.listLogs({
      materialId: query.materialId,
      stockScope: inventoryScope?.stockScope,
      workshopId,
      businessDocumentId: query.businessDocumentId,
      businessDocumentType: query.businessDocumentType,
      businessDocumentNumber: query.businessDocumentNumber,
      operationType: query.operationType,
      bizDateFrom: query.bizDateFrom,
      bizDateTo: query.bizDateTo,
      limit: query.limit,
      offset: query.offset,
    });
  }

  @Permissions("inventory:balance:list")
  @Get("price-layers")
  async listPriceLayers(
    @Query() query: QueryInventoryPriceLayersDto,
    @CurrentUser() user?: SessionUserSnapshot,
  ) {
    const inventoryScope =
      await this.workshopScopeService.resolveInventoryQueryScope(
        user,
        query.workshopId,
        query.stockScope,
      );
    return this.inventoryService.listPriceLayerAvailability({
      materialId: query.materialId,
      stockScope: inventoryScope?.stockScope,
    });
  }

  @Permissions("inventory:source-usage:list")
  @Get("source-usages")
  async listSourceUsages(
    @Query() query: QueryInventorySourceUsagesDto,
    @CurrentUser() user?: SessionUserSnapshot,
  ) {
    const inventoryScope =
      await this.workshopScopeService.resolveInventoryQueryScope(user);
    return this.inventoryService.listSourceUsages({
      materialId: query.materialId,
      stockScope: inventoryScope?.stockScope,
      consumerDocumentType: query.consumerDocumentType,
      consumerDocumentId: query.consumerDocumentId,
      limit: query.limit,
      offset: query.offset,
    });
  }

  @Permissions("inventory:factory-number:list")
  @Get("factory-number-reservations")
  async listFactoryNumberReservations(
    @Query() query: QueryFactoryNumberReservationsDto,
    @CurrentUser() user?: SessionUserSnapshot,
  ) {
    const inventoryScope =
      await this.workshopScopeService.resolveInventoryQueryScope(
        user,
        query.workshopId,
      );
    return this.inventoryService.listFactoryNumberReservations({
      stockScope: inventoryScope?.stockScope,
      businessDocumentType: query.businessDocumentType,
      businessDocumentLineId: query.businessDocumentLineId,
      startNumber: query.startNumber,
      endNumber: query.endNumber,
      limit: query.limit,
      offset: query.offset,
    });
  }

  @Permissions("inventory:factory-number:list")
  @Get("factory-number-reservations/:id")
  async getFactoryNumberReservation(
    @Param("id", ParseIntPipe) id: number,
    @CurrentUser() user?: SessionUserSnapshot,
  ) {
    const reservation =
      await this.inventoryService.getFactoryNumberReservationById(id);
    await this.workshopScopeService.assertInventoryStockScopeAccess(
      user,
      reservation.stockScopeId,
    );
    await this.workshopScopeService.assertInventoryWorkshopAccess(
      user,
      reservation.workshopId,
    );
    return reservation;
  }
}
