import { Module } from "@nestjs/common";
import { PrismaModule } from "../../shared/prisma/prisma.module";
import { CustomerService } from "./application/customer.service";
import { FieldSuggestionsService } from "./application/field-suggestions.service";
import { MasterDataService } from "./application/master-data.service";
import { MaterialService } from "./application/material.service";
import { MaterialCategoryService } from "./application/material-category.service";
import { PersonnelService } from "./application/personnel.service";
import { StockScopeService } from "./application/stock-scope.service";
import { SupplierService } from "./application/supplier.service";
import { WorkshopService } from "./application/workshop.service";
import { MasterDataController } from "./controllers/master-data.controller";
import { MasterDataRepository } from "./infrastructure/master-data.repository";

@Module({
  imports: [PrismaModule],
  controllers: [MasterDataController],
  providers: [
    MasterDataRepository,
    FieldSuggestionsService,
    MaterialCategoryService,
    MaterialService,
    CustomerService,
    SupplierService,
    PersonnelService,
    WorkshopService,
    StockScopeService,
    MasterDataService,
  ],
  exports: [MasterDataService],
})
export class MasterDataModule {}
