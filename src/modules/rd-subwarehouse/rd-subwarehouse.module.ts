import { Module } from "@nestjs/common";
import { InventoryCoreModule } from "../inventory-core/inventory-core.module";
import { MasterDataModule } from "../master-data/master-data.module";
import { RbacModule } from "../rbac/rbac.module";
import { RdHandoffService } from "./application/rd-handoff.service";
import { RdProcurementRequestService } from "./application/rd-procurement-request.service";
import { RdStocktakeOrderService } from "./application/rd-stocktake-order.service";
import { RdHandoffController } from "./controllers/rd-handoff.controller";
import { RdProcurementRequestController } from "./controllers/rd-procurement-request.controller";
import { RdStocktakeOrderController } from "./controllers/rd-stocktake-order.controller";
import { RdHandoffRepository } from "./infrastructure/rd-handoff.repository";
import { RdProcurementRequestRepository } from "./infrastructure/rd-procurement-request.repository";
import { RdStocktakeOrderRepository } from "./infrastructure/rd-stocktake-order.repository";

@Module({
  imports: [MasterDataModule, InventoryCoreModule, RbacModule],
  controllers: [
    RdHandoffController,
    RdProcurementRequestController,
    RdStocktakeOrderController,
  ],
  providers: [
    RdHandoffService,
    RdHandoffRepository,
    RdProcurementRequestService,
    RdProcurementRequestRepository,
    RdStocktakeOrderService,
    RdStocktakeOrderRepository,
  ],
  exports: [
    RdHandoffService,
    RdProcurementRequestService,
    RdStocktakeOrderService,
  ],
})
export class RdSubwarehouseModule {}
