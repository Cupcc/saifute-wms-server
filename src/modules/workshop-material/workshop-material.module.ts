import { Module } from "@nestjs/common";
import { ApprovalModule } from "../approval/approval.module";
import { InventoryCoreModule } from "../inventory-core/inventory-core.module";
import { MasterDataModule } from "../master-data/master-data.module";
import { RbacModule } from "../rbac/rbac.module";
import { WorkshopMaterialPickService } from "./application/workshop-material-pick.service";
import { WorkshopMaterialReturnService } from "./application/workshop-material-return.service";
import { WorkshopMaterialReturnHelpersService } from "./application/workshop-material-return-helpers.service";
import { WorkshopMaterialScrapService } from "./application/workshop-material-scrap.service";
import { WorkshopMaterialService } from "./application/workshop-material.service";
import { WorkshopMaterialSharedService } from "./application/workshop-material-shared.service";
import { WorkshopMaterialController } from "./controllers/workshop-material.controller";
import { WorkshopMaterialRepository } from "./infrastructure/workshop-material.repository";

@Module({
  imports: [MasterDataModule, InventoryCoreModule, ApprovalModule, RbacModule],
  controllers: [WorkshopMaterialController],
  providers: [
    WorkshopMaterialService,
    WorkshopMaterialPickService,
    WorkshopMaterialReturnService,
    WorkshopMaterialScrapService,
    WorkshopMaterialSharedService,
    WorkshopMaterialReturnHelpersService,
    WorkshopMaterialRepository,
  ],
  exports: [WorkshopMaterialService],
})
export class WorkshopMaterialModule {}
