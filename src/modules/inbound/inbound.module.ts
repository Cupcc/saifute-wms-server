import { Module } from "@nestjs/common";
import { ApprovalModule } from "../approval/approval.module";
import { InventoryCoreModule } from "../inventory-core/inventory-core.module";
import { MasterDataModule } from "../master-data/master-data.module";
import { RbacModule } from "../rbac/rbac.module";
import { RdSubwarehouseModule } from "../rd-subwarehouse/rd-subwarehouse.module";
import { InboundService } from "./application/inbound.service";
import { StockInPriceCorrectionService } from "./application/stock-in-price-correction.service";
import { InboundController } from "./controllers/inbound.controller";
import { InboundRepository } from "./infrastructure/inbound.repository";
import { StockInPriceCorrectionRepository } from "./infrastructure/stock-in-price-correction.repository";

@Module({
  imports: [
    MasterDataModule,
    InventoryCoreModule,
    ApprovalModule,
    RbacModule,
    RdSubwarehouseModule,
  ],
  controllers: [InboundController],
  providers: [
    InboundService,
    InboundRepository,
    StockInPriceCorrectionService,
    StockInPriceCorrectionRepository,
  ],
  exports: [InboundService, StockInPriceCorrectionService],
})
export class InboundModule {}
