import { Transform, Type } from "class-transformer";
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
} from "class-validator";
import type { StockScopeCode } from "../../session/domain/user-session";
import {
  MonthlyReportingDomainKey,
  MonthlyReportingTopicKey,
  MonthlyReportingViewMode,
} from "../application/monthly-reporting.shared";

export enum ReportingTrendType {
  ALL = "ALL",
  INBOUND = "INBOUND",
  SALES = "SALES",
  WORKSHOP_MATERIAL = "WORKSHOP_MATERIAL",
  RD_PROJECT = "RD_PROJECT",
  RD = "RD",
}

export enum ReportingExportType {
  INVENTORY_SUMMARY = "INVENTORY_SUMMARY",
  MATERIAL_CATEGORY_SUMMARY = "MATERIAL_CATEGORY_SUMMARY",
  TRENDS = "TRENDS",
  MONTHLY_REPORTING = "MONTHLY_REPORTING",
}

export enum ReportingStockScope {
  MAIN = "MAIN",
  RD_SUB = "RD_SUB",
}

export class QueryReportingHomeDto {
  /** 库存范围；RD 小仓入口应显式传 RD_SUB，默认后台可留空看全局视角 */
  @IsOptional()
  @IsEnum(ReportingStockScope)
  stockScope?: StockScopeCode;
}

export class QueryInventorySummaryDto {
  /** 物料编码或名称关键字 */
  @IsOptional()
  @IsString()
  @MaxLength(128)
  keyword?: string;

  /** 物料分类 ID */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  categoryId?: number;

  /** 车间 ID */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  workshopId?: number;

  /** 库存范围；用于区分主仓与研发小仓 */
  @IsOptional()
  @IsEnum(ReportingStockScope)
  stockScope?: StockScopeCode;

  /** 每页条数，默认 50 */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number = 50;

  /** 分页偏移量，从 0 开始 */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset?: number = 0;
}

export class QueryMaterialCategorySummaryDto {
  /** 分类名称关键字 */
  @IsOptional()
  @IsString()
  @MaxLength(128)
  keyword?: string;

  /** 车间 ID */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  workshopId?: number;

  /** 库存范围；用于区分主仓与研发小仓 */
  @IsOptional()
  @IsEnum(ReportingStockScope)
  stockScope?: StockScopeCode;

  /** 每页条数，默认 50 */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number = 50;

  /** 分页偏移量，从 0 开始 */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset?: number = 0;
}

export class QueryTrendSeriesDto {
  /** 趋势图统计类型 */
  @IsOptional()
  @IsEnum(ReportingTrendType)
  trendType?: ReportingTrendType = ReportingTrendType.ALL;

  /** 按车间/部门筛选 */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  workshopId?: number;

  /** 库存范围；用于区分主仓与研发小仓 */
  @IsOptional()
  @IsEnum(ReportingStockScope)
  stockScope?: StockScopeCode;

  /** 开始日期，格式为 YYYY-MM-DD */
  @IsOptional()
  @IsDateString()
  dateFrom?: string;

  /** 结束日期，格式为 YYYY-MM-DD */
  @IsOptional()
  @IsDateString()
  dateTo?: string;
}

export class ExportReportDto {
  /** 导出的报表类型 */
  @IsEnum(ReportingExportType)
  reportType!: ReportingExportType;

  /** 导出关键字 */
  @IsOptional()
  @IsString()
  @MaxLength(128)
  keyword?: string;

  /** 物料分类 ID */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  categoryId?: number;

  /** 车间 ID */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  workshopId?: number;

  /** 库存范围；用于区分主仓与研发小仓 */
  @IsOptional()
  @IsEnum(ReportingStockScope)
  stockScope?: StockScopeCode;

  /** 趋势图统计类型 */
  @IsOptional()
  @IsEnum(ReportingTrendType)
  trendType?: ReportingTrendType = ReportingTrendType.ALL;

  /** 开始日期，格式为 YYYY-MM-DD */
  @IsOptional()
  @IsDateString()
  dateFrom?: string;

  /** 结束日期，格式为 YYYY-MM-DD */
  @IsOptional()
  @IsDateString()
  dateTo?: string;
}

export class QueryMonthlyReportingDto {
  @Matches(/^\d{4}-(0[1-9]|1[0-2])$/)
  yearMonth!: string;

  @IsOptional()
  @IsEnum(MonthlyReportingViewMode)
  viewMode?: MonthlyReportingViewMode = MonthlyReportingViewMode.DOMAIN;

  @IsOptional()
  @IsEnum(ReportingStockScope)
  stockScope?: StockScopeCode;

  @IsOptional()
  @IsEnum(MonthlyReportingDomainKey)
  domainKey?: MonthlyReportingDomainKey;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  documentTypeLabel?: string;

  @IsOptional()
  @IsEnum(MonthlyReportingTopicKey)
  topicKey?: MonthlyReportingTopicKey;

  @IsOptional()
  @Transform(({ value }) => value === true || value === "true")
  @IsBoolean()
  abnormalOnly?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  workshopId?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  categoryId?: number;

  @IsOptional()
  @IsString()
  @MaxLength(512)
  categoryNodeKey?: string;
}

export class QueryMonthlyReportingDetailDto extends QueryMonthlyReportingDto {
  @IsOptional()
  @IsString()
  @MaxLength(128)
  keyword?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number = 50;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset?: number = 0;
}

export class ExportMonthlyReportingDto extends QueryMonthlyReportingDto {
  @IsOptional()
  @IsString()
  @MaxLength(128)
  keyword?: string;
}
