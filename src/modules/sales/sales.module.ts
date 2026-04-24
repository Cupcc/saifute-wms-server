import { Module } from "@nestjs/common";
import { ApprovalModule } from "../approval/approval.module";
import { InventoryCoreModule } from "../inventory-core/inventory-core.module";
import { MasterDataModule } from "../master-data/master-data.module";
import { SalesProjectModule } from "../sales-project/sales-project.module";
import { SalesService } from "./application/sales.service";
import { SalesOutboundService } from "./application/sales-outbound.service";
import { SalesOutboundUpdateService } from "./application/sales-outbound-update.service";
import { SalesReturnService } from "./application/sales-return.service";
import { SalesReturnSourceService } from "./application/sales-return-source.service";
import { SalesSharedService } from "./application/sales-shared.service";
import { SalesSnapshotsService } from "./application/sales-snapshots.service";
import { SalesTraceabilityService } from "./application/sales-traceability.service";
import { SalesController } from "./controllers/sales.controller";
import { SalesRepository } from "./infrastructure/sales.repository";

@Module({
  imports: [
    MasterDataModule,
    InventoryCoreModule,
    ApprovalModule,
    SalesProjectModule,
  ],
  controllers: [SalesController],
  providers: [
    SalesService,
    SalesOutboundService,
    SalesOutboundUpdateService,
    SalesReturnService,
    SalesReturnSourceService,
    SalesSnapshotsService,
    SalesSharedService,
    SalesTraceabilityService,
    SalesRepository,
  ],
  exports: [SalesService],
})
export class SalesModule {}
