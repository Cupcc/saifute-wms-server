import { Module } from "@nestjs/common";
import { InventoryCoreModule } from "../inventory-core/inventory-core.module";
import { MasterDataModule } from "../master-data/master-data.module";
import { WorkflowModule } from "../workflow/workflow.module";
import { WorkshopMaterialService } from "./application/workshop-material.service";
import { WorkshopMaterialController } from "./controllers/workshop-material.controller";
import { WorkshopMaterialRepository } from "./infrastructure/workshop-material.repository";

@Module({
  imports: [MasterDataModule, InventoryCoreModule, WorkflowModule],
  controllers: [WorkshopMaterialController],
  providers: [WorkshopMaterialService, WorkshopMaterialRepository],
  exports: [WorkshopMaterialService],
})
export class WorkshopMaterialModule {}
