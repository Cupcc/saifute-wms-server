import { Module } from "@nestjs/common";
import { InventoryCoreModule } from "../inventory-core/inventory-core.module";
import { RbacModule } from "../rbac/rbac.module";
import { MonthlyReportingService } from "./application/monthly-reporting.service";
import { ReportingService } from "./application/reporting.service";
import { ReportingController } from "./controllers/reporting.controller";
import { ReportingRepository } from "./infrastructure/reporting.repository";

@Module({
  imports: [RbacModule, InventoryCoreModule],
  controllers: [ReportingController],
  providers: [ReportingService, MonthlyReportingService, ReportingRepository],
  exports: [ReportingService, MonthlyReportingService],
})
export class ReportingModule {}
