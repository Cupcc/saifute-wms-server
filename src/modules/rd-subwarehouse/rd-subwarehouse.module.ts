import { Module } from "@nestjs/common";
import { InventoryCoreModule } from "../inventory-core/inventory-core.module";
import { MasterDataModule } from "../master-data/master-data.module";
import { RbacModule } from "../rbac/rbac.module";
import { RdProjectSharedModule } from "../rd-project/rd-project-shared.module";
import { RdHandoffService } from "./application/rd-handoff.service";
import { RdProcurementDemandService } from "./application/rd-procurement-demand.service";
import { RdProcurementItemService } from "./application/rd-procurement-item.service";
import { RdProcurementRequestService } from "./application/rd-procurement-request.service";
import { RdStocktakeOrderService } from "./application/rd-stocktake-order.service";
import { RdHandoffController } from "./controllers/rd-handoff.controller";
import { RdProcurementDemandController } from "./controllers/rd-procurement-demand.controller";
import { RdProcurementRequestController } from "./controllers/rd-procurement-request.controller";
import { RdStocktakeOrderController } from "./controllers/rd-stocktake-order.controller";
import { RdHandoffRepository } from "./infrastructure/rd-handoff.repository";
import { RdProcurementDemandRepository } from "./infrastructure/rd-procurement-demand.repository";
import { RdProcurementRequestRepository } from "./infrastructure/rd-procurement-request.repository";
import { RdStocktakeOrderRepository } from "./infrastructure/rd-stocktake-order.repository";

@Module({
  imports: [
    MasterDataModule,
    InventoryCoreModule,
    RbacModule,
    RdProjectSharedModule,
  ],
  controllers: [
    RdHandoffController,
    RdProcurementRequestController,
    RdProcurementDemandController,
    RdStocktakeOrderController,
  ],
  providers: [
    RdHandoffService,
    RdHandoffRepository,
    RdProcurementItemService,
    RdProcurementRequestService,
    RdProcurementDemandService,
    RdProcurementRequestRepository,
    RdProcurementDemandRepository,
    RdStocktakeOrderService,
    RdStocktakeOrderRepository,
  ],
  exports: [
    RdHandoffService,
    RdProcurementRequestService,
    RdProcurementDemandService,
    RdStocktakeOrderService,
  ],
})
export class RdSubwarehouseModule {}
