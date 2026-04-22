import { Module } from "@nestjs/common";
import { InventoryCoreModule } from "../inventory-core/inventory-core.module";
import { RbacModule } from "../rbac/rbac.module";
import { MonthlyReportCatalogService } from "./application/monthly-report-catalog.service";
import { MonthlyReportDomainAggregatorService } from "./application/monthly-report-domain-aggregator.service";
import { MonthlyReportDomainSummaryService } from "./application/monthly-report-domain-summary.service";
import { MonthlyReportExportService } from "./application/monthly-report-export.service";
import { MonthlyReportItemMapperService } from "./application/monthly-report-item-mapper.service";
import { MonthlyReportMaterialCategoryService } from "./application/monthly-report-material-category.service";
import { MonthlyReportSourceService } from "./application/monthly-report-source.service";
import { MonthlyReportingService } from "./application/monthly-reporting.service";
import { ReportingService } from "./application/reporting.service";
import { ReportingController } from "./controllers/reporting.controller";
import { ReportingRepository } from "./infrastructure/reporting.repository";

@Module({
  imports: [RbacModule, InventoryCoreModule],
  controllers: [ReportingController],
  providers: [
    ReportingService,
    ReportingRepository,
    MonthlyReportCatalogService,
    MonthlyReportSourceService,
    MonthlyReportItemMapperService,
    MonthlyReportDomainAggregatorService,
    MonthlyReportDomainSummaryService,
    MonthlyReportMaterialCategoryService,
    MonthlyReportExportService,
    MonthlyReportingService,
  ],
  exports: [ReportingService, MonthlyReportingService],
})
export class ReportingModule {}
