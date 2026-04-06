import { Module } from "@nestjs/common";
import { AuditModule } from "../audit/audit.module";
import { InventoryCoreModule } from "../inventory-core/inventory-core.module";
import { MasterDataModule } from "../master-data/master-data.module";
import { CustomerService } from "./application/customer.service";
import { CustomerController } from "./controllers/customer.controller";
import { CustomerRepository } from "./infrastructure/customer.repository";

@Module({
  imports: [MasterDataModule, InventoryCoreModule, AuditModule],
  controllers: [CustomerController],
  providers: [CustomerService, CustomerRepository],
  exports: [CustomerService],
})
export class CustomerModule {}
