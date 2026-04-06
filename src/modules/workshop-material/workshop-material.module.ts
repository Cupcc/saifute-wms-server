import { Module } from "@nestjs/common";
import { AuditModule } from "../audit/audit.module";
import { InventoryCoreModule } from "../inventory-core/inventory-core.module";
import { MasterDataModule } from "../master-data/master-data.module";
import { RbacModule } from "../rbac/rbac.module";
import { WorkshopMaterialService } from "./application/workshop-material.service";
import { WorkshopMaterialController } from "./controllers/workshop-material.controller";
import { WorkshopMaterialRepository } from "./infrastructure/workshop-material.repository";

@Module({
  imports: [MasterDataModule, InventoryCoreModule, AuditModule, RbacModule],
  controllers: [WorkshopMaterialController],
  providers: [WorkshopMaterialService, WorkshopMaterialRepository],
  exports: [WorkshopMaterialService],
})
export class WorkshopMaterialModule {}
