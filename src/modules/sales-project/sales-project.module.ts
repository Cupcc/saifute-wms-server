import { Module } from "@nestjs/common";
import { InventoryCoreModule } from "../inventory-core/inventory-core.module";
import { MasterDataModule } from "../master-data/master-data.module";
import { RbacModule } from "../rbac/rbac.module";
import { SalesProjectLifecycleService } from "./application/sales-project-lifecycle.service";
import { SalesProjectMaterialViewService } from "./application/sales-project-material-view.service";
import { SalesProjectOutboundDraftService } from "./application/sales-project-outbound-draft.service";
import { SalesProjectReferenceService } from "./application/sales-project-reference.service";
import { SalesProjectService } from "./application/sales-project.service";
import { SalesProjectController } from "./controllers/sales-project.controller";
import { SalesProjectRepository } from "./infrastructure/sales-project.repository";

@Module({
  imports: [MasterDataModule, InventoryCoreModule, RbacModule],
  controllers: [SalesProjectController],
  providers: [
    SalesProjectService,
    SalesProjectLifecycleService,
    SalesProjectMaterialViewService,
    SalesProjectOutboundDraftService,
    SalesProjectReferenceService,
    SalesProjectRepository,
  ],
  exports: [SalesProjectService],
})
export class SalesProjectModule {}
