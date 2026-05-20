import { Injectable } from "@nestjs/common";
import {
  getMonthlyReportingDomainMeta,
  getMonthlyReportingTopicMeta,
  MONTHLY_REPORTING_DOMAIN_META,
  type MonthlyMaterialCategoryEntry,
  type MonthlyReportEntry,
  type MonthlyReportingDomainKey,
  MonthlyReportingTopicKey,
} from "./monthly-reporting.shared";

export interface MonthlyReportDomainCatalogItem {
  domainKey: MonthlyReportingDomainKey;
  domainLabel: string;
  sortOrder: number;
}

export interface MonthlyReportDocumentTypeCatalogItem {
  domainKey: MonthlyReportingDomainKey;
  domainLabel: string;
  topicKey: MonthlyReportingTopicKey;
  documentTypeLabel: string;
  sortOrder: number;
}

const SALES_TOPIC_KEYS = [
  MonthlyReportingTopicKey.SALES_OUTBOUND,
  MonthlyReportingTopicKey.SALES_RETURN,
] as const;

const SALES_DOCUMENT_TYPE_LABELS: Record<
  (typeof SALES_TOPIC_KEYS)[number],
  string
> = {
  [MonthlyReportingTopicKey.SALES_OUTBOUND]: "销售出库单",
  [MonthlyReportingTopicKey.SALES_RETURN]: "销售退货单",
};

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
        topicKey: MonthlyReportingTopicKey;
        documentTypeLabel: string;
        sortOrder: number;
      }
    >();

    for (const row of rows) {
      const topicMeta = getMonthlyReportingTopicMeta(row.topicKey);
      const domainMeta = getMonthlyReportingDomainMeta(topicMeta.domainKey);
      const mapKey = row.topicKey;
      const current = grouped.get(mapKey);

      if (!current) {
        grouped.set(mapKey, {
          domainKey: topicMeta.domainKey,
          domainLabel: domainMeta.label,
          topicKey: row.topicKey,
          documentTypeLabel: row.documentTypeLabel,
          sortOrder: topicMeta.order,
        });
        continue;
      }

      current.sortOrder = Math.min(current.sortOrder, topicMeta.order);
    }

    this.addMissingSalesCatalogItems(grouped);

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
        topicKey: MonthlyReportingTopicKey;
        documentTypeLabel: string;
        sortOrder: number;
      }
    >();

    for (const entry of entries) {
      const topicMeta = getMonthlyReportingTopicMeta(entry.topicKey);
      const domainMeta = getMonthlyReportingDomainMeta(topicMeta.domainKey);
      const current = grouped.get(entry.topicKey);

      if (!current) {
        grouped.set(entry.topicKey, {
          domainKey: topicMeta.domainKey,
          domainLabel: domainMeta.label,
          topicKey: entry.topicKey,
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

  private addMissingSalesCatalogItems(
    grouped: Map<
      string,
      {
        domainKey: MonthlyReportingDomainKey;
        domainLabel: string;
        topicKey: MonthlyReportingTopicKey;
        documentTypeLabel: string;
        sortOrder: number;
      }
    >,
  ): void {
    const hasSalesFact = SALES_TOPIC_KEYS.some((topicKey) =>
      grouped.has(topicKey),
    );
    if (!hasSalesFact) {
      return;
    }

    const domainMeta = getMonthlyReportingDomainMeta(
      getMonthlyReportingTopicMeta(MonthlyReportingTopicKey.SALES_OUTBOUND)
        .domainKey,
    );

    for (const topicKey of SALES_TOPIC_KEYS) {
      if (grouped.has(topicKey)) {
        continue;
      }

      const topicMeta = getMonthlyReportingTopicMeta(topicKey);
      grouped.set(topicKey, {
        domainKey: topicMeta.domainKey,
        domainLabel: domainMeta.label,
        topicKey,
        documentTypeLabel: SALES_DOCUMENT_TYPE_LABELS[topicKey],
        sortOrder: topicMeta.order,
      });
    }
  }
}
