import { Module } from "@nestjs/common";
import { InventoryCoreModule } from "../inventory-core/inventory-core.module";
import { MasterDataModule } from "../master-data/master-data.module";
import { WorkflowModule } from "../workflow/workflow.module";
import { CustomerService } from "./application/customer.service";
import { CustomerController } from "./controllers/customer.controller";
import { CustomerRepository } from "./infrastructure/customer.repository";

@Module({
  imports: [MasterDataModule, InventoryCoreModule, WorkflowModule],
  controllers: [CustomerController],
  providers: [CustomerService, CustomerRepository],
  exports: [CustomerService],
})
export class CustomerModule {}
