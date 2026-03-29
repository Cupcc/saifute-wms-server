import { Module } from "@nestjs/common";
import { InventoryCoreModule } from "../inventory-core/inventory-core.module";
import { MasterDataModule } from "../master-data/master-data.module";
import { RbacModule } from "../rbac/rbac.module";
import { RdSubwarehouseModule } from "../rd-subwarehouse/rd-subwarehouse.module";
import { WorkflowModule } from "../workflow/workflow.module";
import { InboundService } from "./application/inbound.service";
import { InboundController } from "./controllers/inbound.controller";
import { InboundRepository } from "./infrastructure/inbound.repository";

@Module({
  imports: [
    MasterDataModule,
    InventoryCoreModule,
    WorkflowModule,
    RbacModule,
    RdSubwarehouseModule,
  ],
  controllers: [InboundController],
  providers: [InboundService, InboundRepository],
  exports: [InboundService],
})
export class InboundModule {}
