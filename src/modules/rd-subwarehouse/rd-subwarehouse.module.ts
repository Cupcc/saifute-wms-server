import { Module } from "@nestjs/common";
import { InventoryCoreModule } from "../inventory-core/inventory-core.module";
import { MasterDataModule } from "../master-data/master-data.module";
import { RbacModule } from "../rbac/rbac.module";
import { RdHandoffService } from "./application/rd-handoff.service";
import { RdProcurementRequestService } from "./application/rd-procurement-request.service";
import { RdHandoffController } from "./controllers/rd-handoff.controller";
import { RdProcurementRequestController } from "./controllers/rd-procurement-request.controller";
import { RdHandoffRepository } from "./infrastructure/rd-handoff.repository";
import { RdProcurementRequestRepository } from "./infrastructure/rd-procurement-request.repository";

@Module({
  imports: [MasterDataModule, InventoryCoreModule, RbacModule],
  controllers: [RdHandoffController, RdProcurementRequestController],
  providers: [
    RdHandoffService,
    RdHandoffRepository,
    RdProcurementRequestService,
    RdProcurementRequestRepository,
  ],
  exports: [RdHandoffService, RdProcurementRequestService],
})
export class RdSubwarehouseModule {}
