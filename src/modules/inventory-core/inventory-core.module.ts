import { Module } from "@nestjs/common";
import { MasterDataModule } from "../master-data/master-data.module";
import { RbacModule } from "../rbac/rbac.module";
import { InventoryService } from "./application/inventory.service";
import { StockScopeCompatibilityService } from "./application/stock-scope-compatibility.service";
import { InventoryController } from "./controllers/inventory.controller";
import { FactoryNumberRepository } from "./infrastructure/factory-number.repository";
import { InventoryRepository } from "./infrastructure/inventory.repository";

@Module({
  imports: [MasterDataModule, RbacModule],
  controllers: [InventoryController],
  providers: [
    InventoryService,
    InventoryRepository,
    FactoryNumberRepository,
    StockScopeCompatibilityService,
  ],
  exports: [InventoryService, StockScopeCompatibilityService],
})
export class InventoryCoreModule {}
