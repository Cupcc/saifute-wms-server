import { Module } from "@nestjs/common";
import { ApprovalModule } from "../approval/approval.module";
import { InventoryCoreModule } from "../inventory-core/inventory-core.module";
import { MasterDataModule } from "../master-data/master-data.module";
import { RbacModule } from "../rbac/rbac.module";
import { RdSubwarehouseModule } from "../rd-subwarehouse/rd-subwarehouse.module";
import { SalesProjectModule } from "../sales-project/sales-project.module";
import { InboundService } from "./application/inbound.service";
import { InboundAcceptanceCreationService } from "./application/inbound-acceptance-creation.service";
import { InboundAcceptanceLineSnapshotService } from "./application/inbound-acceptance-line-snapshot.service";
import { InboundAcceptanceUpdateService } from "./application/inbound-acceptance-update.service";
import { InboundProductionReceiptCreationService } from "./application/inbound-production-receipt-creation.service";
import { InboundProductionReceiptUpdateService } from "./application/inbound-production-receipt-update.service";
import { InboundSharedService } from "./application/inbound-shared.service";
import { InboundSupplierReturnService } from "./application/inbound-supplier-return.service";
import { StockInPriceCorrectionService } from "./application/stock-in-price-correction.service";
import { InboundController } from "./controllers/inbound.controller";
import { InboundRepository } from "./infrastructure/inbound.repository";
import { InboundAutoMaterialRepository } from "./infrastructure/inbound-auto-material.repository";
import { StockInPriceCorrectionRepository } from "./infrastructure/stock-in-price-correction.repository";

@Module({
  imports: [
    MasterDataModule,
    InventoryCoreModule,
    ApprovalModule,
    RbacModule,
    RdSubwarehouseModule,
    SalesProjectModule,
  ],
  controllers: [InboundController],
  providers: [
    InboundService,
    InboundAcceptanceCreationService,
    InboundAcceptanceLineSnapshotService,
    InboundAcceptanceUpdateService,
    InboundProductionReceiptCreationService,
    InboundProductionReceiptUpdateService,
    InboundSharedService,
    InboundSupplierReturnService,
    InboundAutoMaterialRepository,
    InboundRepository,
    StockInPriceCorrectionService,
    StockInPriceCorrectionRepository,
  ],
  exports: [
    InboundService,
    InboundSupplierReturnService,
    StockInPriceCorrectionService,
  ],
})
export class InboundModule {}
