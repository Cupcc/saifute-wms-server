import { Module } from "@nestjs/common";
import { ApprovalModule } from "../approval/approval.module";
import { InventoryCoreModule } from "../inventory-core/inventory-core.module";
import { MasterDataModule } from "../master-data/master-data.module";
import { RbacModule } from "../rbac/rbac.module";
import { RdSubwarehouseModule } from "../rd-subwarehouse/rd-subwarehouse.module";
import { InboundAcceptanceCreationService } from "./application/inbound-acceptance-creation.service";
import { InboundAcceptanceUpdateService } from "./application/inbound-acceptance-update.service";
import { InboundProductionReceiptCreationService } from "./application/inbound-production-receipt-creation.service";
import { InboundProductionReceiptUpdateService } from "./application/inbound-production-receipt-update.service";
import { InboundSharedService } from "./application/inbound-shared.service";
import { InboundService } from "./application/inbound.service";
import { InboundController } from "./controllers/inbound.controller";
import { InboundRepository } from "./infrastructure/inbound.repository";
import { StockInPriceCorrectionRepository } from "./infrastructure/stock-in-price-correction.repository";
import { StockInPriceCorrectionService } from "./application/stock-in-price-correction.service";

@Module({
  imports: [MasterDataModule, InventoryCoreModule, ApprovalModule, RbacModule, RdSubwarehouseModule],
  controllers: [InboundController],
  providers: [
    InboundService,
    InboundAcceptanceCreationService,
    InboundAcceptanceUpdateService,
    InboundProductionReceiptCreationService,
    InboundProductionReceiptUpdateService,
    InboundSharedService,
    InboundRepository,
    StockInPriceCorrectionService,
    StockInPriceCorrectionRepository,
  ],
  exports: [InboundService, StockInPriceCorrectionService],
})
export class InboundModule {}
