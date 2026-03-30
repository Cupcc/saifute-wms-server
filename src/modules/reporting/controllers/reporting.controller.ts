import { Controller, Get, Query, StreamableFile } from "@nestjs/common";
import { SkipResponseEnvelope } from "../../../shared/common/interceptors/skip-response-envelope.decorator";
import { CurrentUser } from "../../../shared/decorators/current-user.decorator";
import { Permissions } from "../../../shared/decorators/permissions.decorator";
import { AuditLog } from "../../audit-log/decorators/audit-log.decorator";
import { WorkshopScopeService } from "../../rbac/application/workshop-scope.service";
import type { SessionUserSnapshot } from "../../session/domain/user-session";
import { ReportingService } from "../application/reporting.service";
import {
  ExportReportDto,
  QueryInventorySummaryDto,
  QueryMaterialCategorySummaryDto,
  QueryTrendSeriesDto,
} from "../dto/query-reporting.dto";

@Controller("reporting")
export class ReportingController {
  constructor(
    private readonly reportingService: ReportingService,
    private readonly workshopScopeService: WorkshopScopeService,
  ) {}

  @Permissions("reporting:home:view")
  @Get("home")
  async getHomeDashboard(@CurrentUser() user?: SessionUserSnapshot) {
    const inventoryScope =
      await this.workshopScopeService.getResolvedStockScope(user);
    return this.reportingService.getHomeDashboard(inventoryScope?.stockScope);
  }

  @Permissions("reporting:inventory-summary:view")
  @Get("inventory-summary")
  async getInventorySummary(
    @Query() query: QueryInventorySummaryDto,
    @CurrentUser() user?: SessionUserSnapshot,
  ) {
    const inventoryScope =
      await this.workshopScopeService.resolveInventoryQueryScope(
        user,
        query.workshopId,
      );
    return this.reportingService.getInventorySummary({
      ...query,
      stockScope: inventoryScope?.stockScope,
    });
  }

  @Permissions("reporting:material-category-summary:view")
  @Get("material-category-summary")
  async getMaterialCategorySummary(
    @Query() query: QueryMaterialCategorySummaryDto,
    @CurrentUser() user?: SessionUserSnapshot,
  ) {
    const inventoryScope =
      await this.workshopScopeService.resolveInventoryQueryScope(
        user,
        query.workshopId,
      );
    return this.reportingService.getMaterialCategorySummary({
      ...query,
      stockScope: inventoryScope?.stockScope,
    });
  }

  @Permissions("reporting:trends:view")
  @Get("trends")
  async getTrendSeries(
    @Query() query: QueryTrendSeriesDto,
    @CurrentUser() user?: SessionUserSnapshot,
  ) {
    const inventoryScope =
      await this.workshopScopeService.getResolvedStockScope(user);
    return this.reportingService.getTrendSeries(
      query,
      inventoryScope?.stockScope,
    );
  }

  @Permissions("reporting:export")
  @AuditLog({ title: "导出报表", action: "EXPORT_REPORT" })
  @SkipResponseEnvelope()
  @Get("export")
  async exportReport(
    @Query() query: ExportReportDto,
    @CurrentUser() user?: SessionUserSnapshot,
  ) {
    const inventoryScope =
      await this.workshopScopeService.resolveInventoryQueryScope(
        user,
        query.workshopId,
      );
    const exportResult = await this.reportingService.exportReport(
      {
        ...query,
      },
      inventoryScope?.stockScope,
    );
    return new StreamableFile(Buffer.from(exportResult.content, "utf8"), {
      disposition: `attachment; filename="${exportResult.fileName}"`,
      type: exportResult.contentType,
    });
  }
}
