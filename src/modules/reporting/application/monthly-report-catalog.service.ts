import { Injectable } from "@nestjs/common";
import {
  getMonthlyReportingDomainMeta,
  getMonthlyReportingTopicMeta,
  MONTHLY_REPORTING_DOMAIN_META,
  type MonthlyMaterialCategoryEntry,
  type MonthlyReportEntry,
  type MonthlyReportingDomainKey,
} from "./monthly-reporting.shared";

export interface MonthlyReportDomainCatalogItem {
  domainKey: MonthlyReportingDomainKey;
  domainLabel: string;
  sortOrder: number;
}

export interface MonthlyReportDocumentTypeCatalogItem {
  domainKey: MonthlyReportingDomainKey;
  domainLabel: string;
  documentTypeLabel: string;
  sortOrder: number;
}

@Injectable()
export class MonthlyReportCatalogService {
  buildDomainCatalog(): MonthlyReportDomainCatalogItem[] {
    return Object.entries(MONTHLY_REPORTING_DOMAIN_META)
      .map(([domainKey, meta]) => ({
        domainKey: domainKey as MonthlyReportingDomainKey,
        domainLabel: meta.label,
        sortOrder: meta.order,
      }))
      .sort((left, right) => left.sortOrder - right.sortOrder);
  }

  buildDocumentTypeCatalog(
    rows: MonthlyReportEntry[],
  ): MonthlyReportDocumentTypeCatalogItem[] {
    const grouped = new Map<
      string,
      {
        domainKey: MonthlyReportingDomainKey;
        domainLabel: string;
        documentTypeLabel: string;
        sortOrder: number;
      }
    >();

    for (const row of rows) {
      const topicMeta = getMonthlyReportingTopicMeta(row.topicKey);
      const domainMeta = getMonthlyReportingDomainMeta(topicMeta.domainKey);
      const mapKey = `${topicMeta.domainKey}:${row.documentTypeLabel}`;
      const current = grouped.get(mapKey);

      if (!current) {
        grouped.set(mapKey, {
          domainKey: topicMeta.domainKey,
          domainLabel: domainMeta.label,
          documentTypeLabel: row.documentTypeLabel,
          sortOrder: topicMeta.order,
        });
        continue;
      }

      current.sortOrder = Math.min(current.sortOrder, topicMeta.order);
    }

    return [...grouped.values()].sort((left, right) => {
      const leftDomainOrder = getMonthlyReportingDomainMeta(
        left.domainKey,
      ).order;
      const rightDomainOrder = getMonthlyReportingDomainMeta(
        right.domainKey,
      ).order;
      if (leftDomainOrder !== rightDomainOrder) {
        return leftDomainOrder - rightDomainOrder;
      }

      if (left.sortOrder !== right.sortOrder) {
        return left.sortOrder - right.sortOrder;
      }

      return left.documentTypeLabel.localeCompare(
        right.documentTypeLabel,
        "zh-Hans-CN",
      );
    });
  }

  buildMaterialCategoryDocumentTypeCatalog(
    entries: MonthlyMaterialCategoryEntry[],
  ): MonthlyReportDocumentTypeCatalogItem[] {
    const grouped = new Map<
      string,
      {
        domainKey: MonthlyReportingDomainKey;
        domainLabel: string;
        documentTypeLabel: string;
        sortOrder: number;
      }
    >();

    for (const entry of entries) {
      const topicMeta = getMonthlyReportingTopicMeta(entry.topicKey);
      const domainMeta = getMonthlyReportingDomainMeta(topicMeta.domainKey);
      const current = grouped.get(entry.documentTypeLabel);

      if (!current) {
        grouped.set(entry.documentTypeLabel, {
          domainKey: topicMeta.domainKey,
          domainLabel: domainMeta.label,
          documentTypeLabel: entry.documentTypeLabel,
          sortOrder: topicMeta.order,
        });
        continue;
      }

      current.sortOrder = Math.min(current.sortOrder, topicMeta.order);
    }

    return [...grouped.values()].sort((left, right) => {
      if (left.sortOrder !== right.sortOrder) {
        return left.sortOrder - right.sortOrder;
      }

      return left.documentTypeLabel.localeCompare(
        right.documentTypeLabel,
        "zh-Hans-CN",
      );
    });
  }
}
