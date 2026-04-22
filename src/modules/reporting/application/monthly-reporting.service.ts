import { Injectable } from "@nestjs/common";
import {
  type MonthlyReportDomainDocumentsResult,
  type MonthlyReportDomainSummaryResult,
  MonthlyReportDomainSummaryService,
} from "./monthly-report-domain-summary.service";
import {
  type MonthlyReportExportResult,
  MonthlyReportExportService,
} from "./monthly-report-export.service";
import {
  type MonthlyReportMaterialCategoryDocumentsResult,
  type MonthlyReportMaterialCategorySummaryResult,
  MonthlyReportMaterialCategoryService,
} from "./monthly-report-material-category.service";
import type { MonthlyReportQuery } from "./monthly-report-source.service";
import { MonthlyReportingViewMode } from "./monthly-reporting.shared";

export type {
  MonthlyReportDomainCatalogItem,
  MonthlyReportDocumentTypeCatalogItem,
} from "./monthly-report-catalog.service";
export type {
  MonthlyReportRdProjectSummaryItem,
  MonthlyReportSalesProjectSummaryItem,
  MonthlyReportWorkshopSummaryItem,
} from "./monthly-report-domain-aggregator.service";
export type {
  MonthlyReportDocumentTypeSummaryItem,
  MonthlyReportDomainDocumentsResult,
  MonthlyReportDomainFilters,
  MonthlyReportDomainSummaryItem,
  MonthlyReportDomainSummaryResult,
  MonthlyReportSummaryTotals,
} from "./monthly-report-domain-summary.service";
export type { MonthlyReportExportResult } from "./monthly-report-export.service";
export type {
  MonthlyReportDocumentItem,
  MonthlyReportMaterialCategoryDetailItem,
} from "./monthly-report-item-mapper.service";
export type {
  MonthlyReportMaterialCategoryDocumentsResult,
  MonthlyReportMaterialCategoryFilters,
  MonthlyReportMaterialCategorySummaryItem,
  MonthlyReportMaterialCategorySummaryResult,
  MonthlyReportMaterialCategorySummaryTotals,
} from "./monthly-report-material-category.service";
export type { MonthlyReportQuery } from "./monthly-report-source.service";

@Injectable()
export class MonthlyReportingService {
  constructor(
    private readonly domainSummaryService: MonthlyReportDomainSummaryService,
    private readonly materialCategoryService: MonthlyReportMaterialCategoryService,
    private readonly exportService: MonthlyReportExportService,
  ) {}

  async getMonthlyReportSummary(
    query: MonthlyReportQuery & {
      viewMode: MonthlyReportingViewMode.MATERIAL_CATEGORY;
    },
  ): Promise<MonthlyReportMaterialCategorySummaryResult>;
  async getMonthlyReportSummary(
    query: MonthlyReportQuery & {
      viewMode?: MonthlyReportingViewMode.DOMAIN;
    },
  ): Promise<MonthlyReportDomainSummaryResult>;
  async getMonthlyReportSummary(
    query: MonthlyReportQuery,
  ): Promise<
    | MonthlyReportDomainSummaryResult
    | MonthlyReportMaterialCategorySummaryResult
  >;
  async getMonthlyReportSummary(
    query: MonthlyReportQuery,
  ): Promise<
    | MonthlyReportDomainSummaryResult
    | MonthlyReportMaterialCategorySummaryResult
  > {
    if (query.viewMode === MonthlyReportingViewMode.MATERIAL_CATEGORY) {
      return this.materialCategoryService.getMaterialCategorySummary(query);
    }

    return this.domainSummaryService.getDomainSummary(query);
  }

  async getMonthlyReportDocuments(
    query: MonthlyReportQuery & {
      viewMode: MonthlyReportingViewMode.MATERIAL_CATEGORY;
    },
  ): Promise<MonthlyReportMaterialCategoryDocumentsResult>;
  async getMonthlyReportDocuments(
    query: MonthlyReportQuery & {
      viewMode?: MonthlyReportingViewMode.DOMAIN;
    },
  ): Promise<MonthlyReportDomainDocumentsResult>;
  async getMonthlyReportDocuments(
    query: MonthlyReportQuery,
  ): Promise<
    | MonthlyReportDomainDocumentsResult
    | MonthlyReportMaterialCategoryDocumentsResult
  >;
  async getMonthlyReportDocuments(
    query: MonthlyReportQuery,
  ): Promise<
    | MonthlyReportDomainDocumentsResult
    | MonthlyReportMaterialCategoryDocumentsResult
  > {
    if (query.viewMode === MonthlyReportingViewMode.MATERIAL_CATEGORY) {
      return this.materialCategoryService.getMaterialCategoryDocuments(query);
    }

    return this.domainSummaryService.getDomainDocuments(query);
  }

  async exportMonthlyReport(
    query: MonthlyReportQuery,
  ): Promise<MonthlyReportExportResult> {
    return this.exportService.exportMonthlyReport(query);
  }
}
