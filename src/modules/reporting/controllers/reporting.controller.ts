import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Post,
  Query,
  StreamableFile,
  UnauthorizedException,
} from "@nestjs/common";
import { ApiFileResponse } from "../../../shared/api-docs";
import { CurrentUser } from "../../../shared/decorators/current-user.decorator";
import { Permissions } from "../../../shared/decorators/permissions.decorator";
import { AuditLog } from "../../audit-log/decorators/audit-log.decorator";
import { WorkshopScopeService } from "../../rbac/application/workshop-scope.service";
import type { SessionUserSnapshot } from "../../session/domain/user-session";
import { MonthlyReportingService } from "../application/monthly-reporting.service";
import { ReportingService } from "../application/reporting.service";
import {
  ExportMonthlyReportingDto,
  ExportReportDto,
  QueryInventorySummaryDto,
  QueryMaterialCategorySummaryDto,
  QueryMonthlyReportingDetailDto,
  QueryMonthlyReportingDto,
  QueryReportingHomeDto,
  QueryTrendSeriesDto,
} from "../dto/query-reporting.dto";

const WAREHOUSE_MANAGER_ROLE = "warehouse-manager";

@Controller("reporting")
export class ReportingController {
  constructor(
    private readonly reportingService: ReportingService,
    private readonly monthlyReportingService: MonthlyReportingService,
    private readonly workshopScopeService: WorkshopScopeService,
  ) {}

  @Get("home")
  async getHomeDashboard(
    @Query() query: QueryReportingHomeDto,
    @CurrentUser() user?: SessionUserSnapshot,
  ) {
    this.assertReportingAccess(user, {
      permissions: ["reporting:home:view"],
      roles: [WAREHOUSE_MANAGER_ROLE],
    });
    const inventoryScope =
      await this.workshopScopeService.resolveInventoryQueryScope(
        user,
        undefined,
        query.stockScope,
      );
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
        query.stockScope,
      );
    return this.reportingService.getInventorySummary({
      ...query,
      stockScope: inventoryScope?.stockScope,
    });
  }

  @Get("material-category-summary")
  async getMaterialCategorySummary(
    @Query() query: QueryMaterialCategorySummaryDto,
    @CurrentUser() user?: SessionUserSnapshot,
  ) {
    this.assertReportingAccess(user, {
      permissions: ["reporting:material-category-summary:view"],
      roles: [WAREHOUSE_MANAGER_ROLE],
    });
    const inventoryScope =
      await this.workshopScopeService.resolveInventoryQueryScope(
        user,
        query.workshopId,
        query.stockScope,
      );
    return this.reportingService.getMaterialCategorySummary({
      ...query,
      stockScope: inventoryScope?.stockScope,
    });
  }

  @Get("trends")
  async getTrendSeries(
    @Query() query: QueryTrendSeriesDto,
    @CurrentUser() user?: SessionUserSnapshot,
  ) {
    this.assertReportingAccess(user, {
      permissions: ["reporting:trends:view"],
      roles: [WAREHOUSE_MANAGER_ROLE],
    });
    const inventoryScope =
      await this.workshopScopeService.resolveInventoryQueryScope(
        user,
        query.workshopId,
        query.stockScope,
      );
    return this.reportingService.getTrendSeries(
      query,
      inventoryScope?.stockScope,
    );
  }

  @Permissions("reporting:monthly-reporting:view")
  @Get("monthly-reporting")
  async getMonthlyReportingSummary(
    @Query() query: QueryMonthlyReportingDto,
    @CurrentUser() user?: SessionUserSnapshot,
  ) {
    const inventoryScope =
      await this.workshopScopeService.resolveInventoryQueryScope(
        user,
        query.workshopId,
        query.stockScope,
      );
    const workshopId =
      await this.workshopScopeService.resolveInventoryQueryWorkshopId(
        user,
        query.workshopId,
      );
    return this.monthlyReportingService.getMonthlyReportSummary({
      ...query,
      stockScope: inventoryScope?.stockScope,
      workshopId,
    });
  }

  @Permissions("reporting:monthly-reporting:view")
  @Get("monthly-reporting/details")
  async getMonthlyReportingDetails(
    @Query() query: QueryMonthlyReportingDetailDto,
    @CurrentUser() user?: SessionUserSnapshot,
  ) {
    const inventoryScope =
      await this.workshopScopeService.resolveInventoryQueryScope(
        user,
        query.workshopId,
        query.stockScope,
      );
    const workshopId =
      await this.workshopScopeService.resolveInventoryQueryWorkshopId(
        user,
        query.workshopId,
      );
    return this.monthlyReportingService.getMonthlyReportDocuments({
      ...query,
      stockScope: inventoryScope?.stockScope,
      workshopId,
    });
  }

  @Permissions("reporting:export")
  @AuditLog({ title: "导出月度对账报表", action: "EXPORT_MONTHLY_REPORTING" })
  @ApiFileResponse({ description: "导出月度对账报表文件" })
  @Post("monthly-reporting/export")
  async exportMonthlyReporting(
    @Body() query: ExportMonthlyReportingDto,
    @CurrentUser() user?: SessionUserSnapshot,
  ) {
    const inventoryScope =
      await this.workshopScopeService.resolveInventoryQueryScope(
        user,
        query.workshopId,
        query.stockScope,
      );
    const workshopId =
      await this.workshopScopeService.resolveInventoryQueryWorkshopId(
        user,
        query.workshopId,
      );
    const exportResult = await this.monthlyReportingService.exportMonthlyReport(
      {
        ...query,
        stockScope: inventoryScope?.stockScope,
        workshopId,
      },
    );
    return new StreamableFile(Buffer.from(exportResult.content, "utf8"), {
      disposition: `attachment; filename="${exportResult.fileName}"`,
      type: exportResult.contentType,
    });
  }

  @Permissions("reporting:export")
  @AuditLog({ title: "导出报表", action: "EXPORT_REPORT" })
  @ApiFileResponse({ description: "导出报表文件" })
  @Get("export")
  async exportReport(
    @Query() query: ExportReportDto,
    @CurrentUser() user?: SessionUserSnapshot,
  ) {
    const inventoryScope =
      await this.workshopScopeService.resolveInventoryQueryScope(
        user,
        query.workshopId,
        query.stockScope,
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

  private assertReportingAccess(
    user: SessionUserSnapshot | undefined,
    options: {
      permissions?: string[];
      roles?: string[];
    },
  ) {
    if (!user) {
      throw new UnauthorizedException("当前请求未携带用户上下文");
    }
    if (user.userId === 1) {
      return;
    }

    const hasPermission =
      options.permissions?.some((permission) =>
        user.permissions.includes(permission),
      ) ?? false;
    const hasRole =
      options.roles?.some((role) => user.roles.includes(role)) ?? false;

    if (hasPermission || hasRole) {
      return;
    }

    throw new ForbiddenException("当前用户缺少所需权限");
  }
}
