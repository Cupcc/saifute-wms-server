import { Module } from "@nestjs/common";
import { InventoryCoreModule } from "../inventory-core/inventory-core.module";
import { MasterDataModule } from "../master-data/master-data.module";
import { WorkflowModule } from "../workflow/workflow.module";
import { OutboundService } from "./application/outbound.service";
import { OutboundController } from "./controllers/outbound.controller";
import { OutboundRepository } from "./infrastructure/outbound.repository";

@Module({
  imports: [MasterDataModule, InventoryCoreModule, WorkflowModule],
  controllers: [OutboundController],
  providers: [OutboundService, OutboundRepository],
  exports: [OutboundService],
})
export class OutboundModule {}
