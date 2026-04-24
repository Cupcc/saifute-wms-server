import { Module } from "@nestjs/common";
import { InventoryCoreModule } from "../inventory-core/inventory-core.module";
import { MasterDataModule } from "../master-data/master-data.module";
import { RbacModule } from "../rbac/rbac.module";
import { RdSubwarehouseModule } from "../rd-subwarehouse/rd-subwarehouse.module";
import { RdProjectMasterService } from "./application/rd-project-master.service";
import { RdProjectService } from "./application/rd-project.service";
import { RdProjectViewService } from "./application/rd-project-view.service";
import { RdProjectMaterialActionHelperService } from "./application/rd-project-material-action-helper.service";
import { RdProjectMaterialActionService } from "./application/rd-project-material-action.service";
import { RdProjectController } from "./controllers/rd-project.controller";
import { RdProjectRepository } from "./infrastructure/rd-project.repository";
import { RdProjectPersistenceService } from "./infrastructure/rd-project-persistence.service";
import { RdProjectSharedModule } from "./rd-project-shared.module";

@Module({
  imports: [
    MasterDataModule,
    InventoryCoreModule,
    RbacModule,
    RdSubwarehouseModule,
    RdProjectSharedModule,
  ],
  controllers: [RdProjectController],
  providers: [
    RdProjectService,
    RdProjectMasterService,
    RdProjectViewService,
    RdProjectMaterialActionService,
    RdProjectMaterialActionHelperService,
    { provide: RdProjectRepository, useExisting: RdProjectPersistenceService },
  ],
  exports: [RdProjectService, RdProjectMaterialActionService],
})
export class RdProjectModule {}
