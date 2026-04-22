import { Injectable } from "@nestjs/common";
import { AppConfigService } from "../../../shared/config/app-config.service";
import type { StockScopeCode } from "../../session/domain/user-session";
import {
  formatMonthlyReportDateOnly,
  formatMonthlyReportSalesProjectLabel,
  normalizeMonthlyReportWorkshopName,
  normalizeMonthlyReportWorkshopRef,
} from "./monthly-reporting.formatters";
import {
  formatDecimal,
  formatMoney,
  formatYearMonth,
  getMonthlyReportingDomainMeta,
  getMonthlyReportingTopicMeta,
  MONTHLY_REPORTING_ABNORMAL_LABELS,
  type MonthlyMaterialCategoryEntry,
  type MonthlyReportEntry,
  MonthlyReportingDirection,
  type MonthlyReportingDomainKey,
} from "./monthly-reporting.shared";

export interface MonthlyReportDocumentItem {
  domainKey: MonthlyReportingDomainKey;
  domainLabel: string;
  direction: MonthlyReportingDirection;
  documentType: string;
  documentTypeLabel: string;
  documentId: number;
  documentNo: string;
  bizDate: string;
  stockScope: StockScopeCode | null;
  stockScopeName: string | null;
  workshopId: number | null;
  workshopName: string | null;
  salesProjectLabel: string | null;
  rdProjectCode: string | null;
  rdProjectName: string | null;
  sourceStockScopeName: string | null;
  targetStockScopeName: string | null;
  sourceWorkshopName: string | null;
  targetWorkshopName: string | null;
  quantity: string;
  amount: string;
  cost: string;
  abnormalFlags: string[];
  abnormalLabels: string[];
  sourceBizMonth: string | null;
  sourceDocumentNo: string | null;
  createdAt: string;
}

export interface MonthlyReportMaterialCategoryDetailItem {
  direction: MonthlyReportingDirection;
  documentType: string;
  documentTypeLabel: string;
  documentId: number;
  documentNo: string;
  documentLineId: number;
  lineNo: number;
  bizDate: string;
  stockScope: StockScopeCode | null;
  stockScopeName: string | null;
  workshopId: number | null;
  workshopName: string | null;
  materialId: number;
  materialCode: string;
  materialName: string;
  materialSpec: string | null;
  unitCode: string;
  categoryId: number | null;
  categoryCode: string | null;
  categoryName: string;
  salesProjectCode: string | null;
  salesProjectName: string | null;
  quantity: string;
  amount: string;
  cost: string;
  abnormalFlags: string[];
  abnormalLabels: string[];
  sourceBizMonth: string | null;
  sourceDocumentNo: string | null;
  createdAt: string;
}

@Injectable()
export class MonthlyReportItemMapperService {
  constructor(private readonly appConfigService: AppConfigService) {}

  toDocumentItem(row: MonthlyReportEntry): MonthlyReportDocumentItem {
    const topicMeta = getMonthlyReportingTopicMeta(row.topicKey);
    const domainMeta = getMonthlyReportingDomainMeta(topicMeta.domainKey);
    const workshopRef = normalizeMonthlyReportWorkshopRef(
      row.workshopId,
      row.workshopName,
    );

    return {
      domainKey: topicMeta.domainKey,
      domainLabel: domainMeta.label,
      direction: row.direction,
      documentType: row.documentType,
      documentTypeLabel: row.documentTypeLabel,
      documentId: row.documentId,
      documentNo: row.documentNo,
      bizDate: formatMonthlyReportDateOnly(
        row.bizDate,
        this.appConfigService.businessTimezone,
      ),
      stockScope: row.stockScope,
      stockScopeName: row.stockScopeName,
      workshopId: workshopRef.workshopId,
      workshopName: workshopRef.workshopName,
      salesProjectLabel: formatMonthlyReportSalesProjectLabel(
        row.salesProjectCodes,
        row.salesProjectNames,
      ),
      rdProjectCode: row.rdProjectCode,
      rdProjectName: row.rdProjectName,
      sourceStockScopeName: row.sourceStockScopeName,
      targetStockScopeName: row.targetStockScopeName,
      sourceWorkshopName: normalizeMonthlyReportWorkshopName(
        row.sourceWorkshopName,
      ),
      targetWorkshopName: normalizeMonthlyReportWorkshopName(
        row.targetWorkshopName,
      ),
      quantity: formatDecimal(row.quantity),
      amount: formatMoney(row.amount),
      cost: formatMoney(row.cost),
      abnormalFlags: row.abnormalFlags,
      abnormalLabels: row.abnormalFlags.map(
        (flag) => MONTHLY_REPORTING_ABNORMAL_LABELS[flag],
      ),
      sourceBizMonth: row.sourceBizDate
        ? formatYearMonth(
            row.sourceBizDate,
            this.appConfigService.businessTimezone,
          )
        : null,
      sourceDocumentNo: row.sourceDocumentNo,
      createdAt: row.createdAt.toISOString(),
    };
  }

  toMaterialCategoryDetailItem(
    entry: MonthlyMaterialCategoryEntry,
  ): MonthlyReportMaterialCategoryDetailItem {
    const workshopRef = normalizeMonthlyReportWorkshopRef(
      entry.workshopId,
      entry.workshopName,
    );

    return {
      direction: entry.direction,
      documentType: entry.documentType,
      documentTypeLabel: entry.documentTypeLabel,
      documentId: entry.documentId,
      documentNo: entry.documentNo,
      documentLineId: entry.documentLineId,
      lineNo: entry.lineNo,
      bizDate: formatMonthlyReportDateOnly(
        entry.bizDate,
        this.appConfigService.businessTimezone,
      ),
      stockScope: entry.stockScope,
      stockScopeName: entry.stockScopeName,
      workshopId: workshopRef.workshopId,
      workshopName: workshopRef.workshopName,
      materialId: entry.materialId,
      materialCode: entry.materialCode,
      materialName: entry.materialName,
      materialSpec: entry.materialSpec,
      unitCode: entry.unitCode,
      categoryId: entry.categoryId,
      categoryCode: entry.categoryCode,
      categoryName: entry.categoryName,
      salesProjectCode: entry.salesProjectCode,
      salesProjectName: entry.salesProjectName,
      quantity: formatDecimal(entry.quantity),
      amount: formatMoney(entry.amount),
      cost: formatMoney(entry.cost),
      abnormalFlags: entry.abnormalFlags,
      abnormalLabels: entry.abnormalFlags.map(
        (flag) => MONTHLY_REPORTING_ABNORMAL_LABELS[flag],
      ),
      sourceBizMonth: entry.sourceBizDate
        ? formatYearMonth(
            entry.sourceBizDate,
            this.appConfigService.businessTimezone,
          )
        : null,
      sourceDocumentNo: entry.sourceDocumentNo,
      createdAt: entry.createdAt.toISOString(),
    };
  }
}
