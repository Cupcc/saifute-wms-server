import { Injectable } from "@nestjs/common";
import { AppConfigService } from "../../../shared/config/app-config.service";
import type { StockScopeCode } from "../../session/domain/user-session";
import {
  type MonthlySalesProjectEntry,
  ReportingRepository,
} from "../infrastructure/reporting.repository";
import {
  formatMonthlyReportSalesProjectLabel,
  normalizeMonthlyReportWorkshopName,
  resolveMonthlyMaterialCategoryLeaf,
  resolveMonthlyMaterialCategoryNodeKey,
  resolveMonthlyReportMonthRange,
} from "./monthly-reporting.formatters";
import {
  formatYearMonth,
  getMonthlyReportingDomainMeta,
  getMonthlyReportingTopicMeta,
  MONTHLY_REPORTING_ABNORMAL_LABELS,
  MONTHLY_REPORTING_MATERIAL_CATEGORY_TOPIC_OPTIONS,
  type MonthlyMaterialCategoryEntry,
  type MonthlyReportEntry,
  type MonthlyReportingDomainKey,
  type MonthlyReportingTopicKey,
  MonthlyReportingViewMode,
} from "./monthly-reporting.shared";

export interface MonthlyReportQuery {
  yearMonth: string;
  viewMode?: MonthlyReportingViewMode;
  stockScope?: StockScopeCode;
  workshopId?: number;
  domainKey?: MonthlyReportingDomainKey;
  documentTypeLabel?: string;
  topicKey?: MonthlyReportingTopicKey;
  abnormalOnly?: boolean;
  keyword?: string;
  categoryId?: number;
  categoryNodeKey?: string;
  limit?: number;
  offset?: number;
}

export interface MonthlyReportSourceData {
  rows: MonthlyReportEntry[];
  salesProjectEntries: MonthlySalesProjectEntry[];
}

@Injectable()
export class MonthlyReportSourceService {
  constructor(
    private readonly repository: ReportingRepository,
    private readonly appConfigService: AppConfigService,
  ) {}

  async loadSourceData(
    query: MonthlyReportQuery,
  ): Promise<MonthlyReportSourceData> {
    const { start, end } = resolveMonthlyReportMonthRange(
      query.yearMonth,
      this.appConfigService.businessTimezone,
    );
    const [rows, salesProjectEntries] = await Promise.all([
      this.repository.findMonthlyReportEntries({
        start,
        end,
        stockScope: query.stockScope,
        workshopId: query.workshopId,
      }),
      this.repository.findMonthlySalesProjectEntries({
        start,
        end,
        stockScope: query.stockScope,
        workshopId: query.workshopId,
      }),
    ]);

    return {
      rows,
      salesProjectEntries,
    };
  }

  async loadMaterialCategorySourceData(
    query: MonthlyReportQuery,
  ): Promise<MonthlyMaterialCategoryEntry[]> {
    const { start, end } = resolveMonthlyReportMonthRange(
      query.yearMonth,
      this.appConfigService.businessTimezone,
    );
    return this.repository.findMonthlyMaterialCategoryEntries({
      start,
      end,
      stockScope: query.stockScope,
      workshopId: query.workshopId,
    });
  }

  filterRows(
    rows: MonthlyReportEntry[],
    query: MonthlyReportQuery,
    options: {
      ignoreDocumentTypeLabel?: boolean;
    } = {},
  ): MonthlyReportEntry[] {
    const documentTypeLabel = query.documentTypeLabel?.trim() || null;

    return [...rows]
      .filter((row) =>
        query.domainKey
          ? getMonthlyReportingTopicMeta(row.topicKey).domainKey ===
            query.domainKey
          : true,
      )
      .filter((row) =>
        query.topicKey ? row.topicKey === query.topicKey : true,
      )
      .filter((row) =>
        options.ignoreDocumentTypeLabel || !documentTypeLabel
          ? true
          : row.documentTypeLabel === documentTypeLabel,
      )
      .filter((row) =>
        query.abnormalOnly ? row.abnormalFlags.length > 0 : true,
      )
      .filter((row) => this.matchesKeyword(row, query.keyword))
      .sort((left, right) => this.compareRows(left, right));
  }

  filterSalesProjectEntries(
    entries: MonthlySalesProjectEntry[],
    query: MonthlyReportQuery,
  ): MonthlySalesProjectEntry[] {
    const documentTypeLabel = query.documentTypeLabel?.trim() || null;

    if (query.domainKey && query.domainKey !== "SALES") {
      return [];
    }

    if (
      query.topicKey &&
      query.topicKey !== "SALES_OUTBOUND" &&
      query.topicKey !== "SALES_RETURN"
    ) {
      return [];
    }

    return entries
      .filter((entry) =>
        query.topicKey ? entry.topicKey === query.topicKey : true,
      )
      .filter((entry) =>
        documentTypeLabel
          ? entry.documentTypeLabel === documentTypeLabel
          : true,
      )
      .filter((entry) =>
        query.abnormalOnly ? entry.abnormalFlags.length > 0 : true,
      )
      .filter((entry) => this.matchesSalesProjectKeyword(entry, query.keyword));
  }

  filterMaterialCategoryEntries(
    entries: MonthlyMaterialCategoryEntry[],
    query: MonthlyReportQuery,
    options: {
      ignoreDocumentTypeLabel?: boolean;
    } = {},
  ): MonthlyMaterialCategoryEntry[] {
    const documentTypeLabel = query.documentTypeLabel?.trim() || null;

    if (
      query.topicKey &&
      !MONTHLY_REPORTING_MATERIAL_CATEGORY_TOPIC_OPTIONS.includes(
        query.topicKey,
      )
    ) {
      return [];
    }
    const categoryNodeKey = query.categoryNodeKey?.trim() || null;

    return [...entries]
      .filter((entry) =>
        query.topicKey ? entry.topicKey === query.topicKey : true,
      )
      .filter((entry) =>
        options.ignoreDocumentTypeLabel || !documentTypeLabel
          ? true
          : entry.documentTypeLabel === documentTypeLabel,
      )
      .filter((entry) =>
        categoryNodeKey
          ? resolveMonthlyMaterialCategoryNodeKey(entry) === categoryNodeKey
          : query.categoryId
            ? resolveMonthlyMaterialCategoryLeaf(entry).id === query.categoryId
            : true,
      )
      .filter((entry) =>
        query.abnormalOnly ? entry.abnormalFlags.length > 0 : true,
      )
      .filter((entry) =>
        this.matchesMaterialCategoryKeyword(entry, query.keyword),
      )
      .sort((left, right) => this.compareMaterialCategoryEntries(left, right));
  }

  private compareRows(
    left: MonthlyReportEntry,
    right: MonthlyReportEntry,
  ): number {
    const leftDomainKey = getMonthlyReportingTopicMeta(left.topicKey).domainKey;
    const rightDomainKey = getMonthlyReportingTopicMeta(
      right.topicKey,
    ).domainKey;
    const leftDomainOrder = getMonthlyReportingDomainMeta(leftDomainKey).order;
    const rightDomainOrder =
      getMonthlyReportingDomainMeta(rightDomainKey).order;

    if (leftDomainOrder !== rightDomainOrder) {
      return leftDomainOrder - rightDomainOrder;
    }

    const leftTopicOrder = getMonthlyReportingTopicMeta(left.topicKey).order;
    const rightTopicOrder = getMonthlyReportingTopicMeta(right.topicKey).order;
    if (leftTopicOrder !== rightTopicOrder) {
      return leftTopicOrder - rightTopicOrder;
    }

    const leftBizName = this.resolveRowBusinessName(left);
    const rightBizName = this.resolveRowBusinessName(right);
    if (leftBizName !== rightBizName) {
      return leftBizName.localeCompare(rightBizName, "zh-Hans-CN");
    }

    if (left.bizDate.getTime() !== right.bizDate.getTime()) {
      return left.bizDate.getTime() - right.bizDate.getTime();
    }

    return left.documentNo.localeCompare(right.documentNo);
  }

  private compareMaterialCategoryEntries(
    left: MonthlyMaterialCategoryEntry,
    right: MonthlyMaterialCategoryEntry,
  ): number {
    const leftCategory = resolveMonthlyMaterialCategoryLeaf(left);
    const rightCategory = resolveMonthlyMaterialCategoryLeaf(right);
    if (leftCategory.categoryName !== rightCategory.categoryName) {
      return leftCategory.categoryName.localeCompare(
        rightCategory.categoryName,
        "zh-Hans-CN",
      );
    }

    if (
      (leftCategory.categoryCode ?? "") !== (rightCategory.categoryCode ?? "")
    ) {
      return (leftCategory.categoryCode ?? "").localeCompare(
        rightCategory.categoryCode ?? "",
        "zh-Hans-CN",
      );
    }

    const leftTopicOrder = getMonthlyReportingTopicMeta(left.topicKey).order;
    const rightTopicOrder = getMonthlyReportingTopicMeta(right.topicKey).order;
    if (leftTopicOrder !== rightTopicOrder) {
      return leftTopicOrder - rightTopicOrder;
    }

    if (left.bizDate.getTime() !== right.bizDate.getTime()) {
      return left.bizDate.getTime() - right.bizDate.getTime();
    }

    if (left.documentNo !== right.documentNo) {
      return left.documentNo.localeCompare(right.documentNo);
    }

    return left.lineNo - right.lineNo;
  }

  private resolveRowBusinessName(row: MonthlyReportEntry): string {
    if (row.topicKey === "RD_HANDOFF") {
      return [
        row.sourceStockScopeName ?? "",
        row.targetStockScopeName ?? "",
        normalizeMonthlyReportWorkshopName(row.sourceWorkshopName) ?? "",
        normalizeMonthlyReportWorkshopName(row.targetWorkshopName) ?? "",
      ].join(" ");
    }

    if (row.rdProjectName) {
      return `${row.rdProjectCode ?? ""} ${row.rdProjectName}`.trim();
    }

    if (row.salesProjectNames.length > 0) {
      return row.salesProjectNames.join("、");
    }

    return normalizeMonthlyReportWorkshopName(row.workshopName) ?? "";
  }

  private matchesKeyword(row: MonthlyReportEntry, keyword?: string): boolean {
    const normalizedKeyword = keyword?.trim().toLowerCase();
    if (!normalizedKeyword) {
      return true;
    }

    const topicMeta = getMonthlyReportingTopicMeta(row.topicKey);
    const domainLabel = getMonthlyReportingDomainMeta(
      topicMeta.domainKey,
    ).label;
    const abnormalLabels = row.abnormalFlags.map(
      (flag) => MONTHLY_REPORTING_ABNORMAL_LABELS[flag],
    );

    return [
      row.documentNo,
      row.documentTypeLabel,
      domainLabel,
      row.stockScopeName,
      normalizeMonthlyReportWorkshopName(row.workshopName),
      row.sourceStockScopeName,
      row.targetStockScopeName,
      normalizeMonthlyReportWorkshopName(row.sourceWorkshopName),
      normalizeMonthlyReportWorkshopName(row.targetWorkshopName),
      row.rdProjectCode,
      row.rdProjectName,
      formatMonthlyReportSalesProjectLabel(
        row.salesProjectCodes,
        row.salesProjectNames,
      ),
      row.sourceDocumentNo,
      row.sourceBizDate
        ? formatYearMonth(
            row.sourceBizDate,
            this.appConfigService.businessTimezone,
          )
        : null,
      ...abnormalLabels,
    ]
      .filter(Boolean)
      .some((candidate) =>
        String(candidate).toLowerCase().includes(normalizedKeyword),
      );
  }

  private matchesMaterialCategoryKeyword(
    entry: MonthlyMaterialCategoryEntry,
    keyword?: string,
  ): boolean {
    const normalizedKeyword = keyword?.trim().toLowerCase();
    if (!normalizedKeyword) {
      return true;
    }

    const abnormalLabels = entry.abnormalFlags.map(
      (flag) => MONTHLY_REPORTING_ABNORMAL_LABELS[flag],
    );

    return [
      entry.documentNo,
      entry.documentTypeLabel,
      entry.stockScopeName,
      normalizeMonthlyReportWorkshopName(entry.workshopName),
      entry.materialCode,
      entry.materialName,
      entry.materialSpec,
      entry.categoryCode,
      entry.categoryName,
      entry.salesProjectCode,
      entry.salesProjectName,
      entry.sourceDocumentNo,
      entry.sourceBizDate
        ? formatYearMonth(
            entry.sourceBizDate,
            this.appConfigService.businessTimezone,
          )
        : null,
      ...abnormalLabels,
    ]
      .filter(Boolean)
      .some((candidate) =>
        String(candidate).toLowerCase().includes(normalizedKeyword),
      );
  }

  private matchesSalesProjectKeyword(
    entry: MonthlySalesProjectEntry,
    keyword?: string,
  ): boolean {
    const normalizedKeyword = keyword?.trim().toLowerCase();
    if (!normalizedKeyword) {
      return true;
    }

    const abnormalLabels = entry.abnormalFlags.map(
      (flag) => MONTHLY_REPORTING_ABNORMAL_LABELS[flag],
    );

    return [
      entry.documentNo,
      entry.documentTypeLabel,
      entry.salesProjectCode,
      entry.salesProjectName,
      ...abnormalLabels,
    ]
      .filter(Boolean)
      .some((candidate) =>
        String(candidate).toLowerCase().includes(normalizedKeyword),
      );
  }
}
