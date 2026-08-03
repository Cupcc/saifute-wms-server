import { normalizeMonthlyReportWorkshopRef } from "./monthly-reporting.formatters";
import {
  formatMoney,
  type MonthlyMaterialCategoryEntry,
  sumDecimals,
} from "./monthly-reporting.shared";

export interface MonthlyReportMaterialCategoryWorkshopSummaryItem {
  workshopId: number | null;
  workshopName: string;
  lineCount: number;
  documentCount: number;
  pickCostAmount: string;
  returnCostAmount: string;
  scrapCostAmount: string;
  netConsumptionCostAmount: string;
}

export function buildMonthlyMaterialCategoryWorkshopUsageItems(
  entries: MonthlyMaterialCategoryEntry[],
): MonthlyReportMaterialCategoryWorkshopSummaryItem[] {
  const grouped = new Map<
    string,
    {
      workshopId: number | null;
      workshopName: string;
      entries: MonthlyMaterialCategoryEntry[];
    }
  >();

  for (const entry of entries) {
    if (
      entry.topicKey !== "WORKSHOP_PICK" &&
      entry.topicKey !== "WORKSHOP_RETURN" &&
      entry.topicKey !== "WORKSHOP_SCRAP"
    ) {
      continue;
    }

    const workshopRef = normalizeMonthlyReportWorkshopRef(
      entry.workshopId,
      entry.workshopName,
    );
    const workshopId = workshopRef.workshopId;
    const workshopName = workshopRef.workshopName ?? "未区分车间";
    const mapKey = `${workshopId ?? "null"}:${workshopName}`;
    const current = grouped.get(mapKey) ?? {
      workshopId,
      workshopName,
      entries: [],
    };
    current.entries.push(entry);
    grouped.set(mapKey, current);
  }

  return [...grouped.values()]
    .map((item) => {
      const pickEntries = item.entries.filter(
        (entry) => entry.topicKey === "WORKSHOP_PICK",
      );
      const returnEntries = item.entries.filter(
        (entry) => entry.topicKey === "WORKSHOP_RETURN",
      );
      const scrapEntries = item.entries.filter(
        (entry) => entry.topicKey === "WORKSHOP_SCRAP",
      );
      const pickCostAmount = sumDecimals(
        pickEntries.map((entry) => entry.cost),
      );
      const returnCostAmount = sumDecimals(
        returnEntries.map((entry) => entry.cost),
      );
      const scrapCostAmount = sumDecimals(
        scrapEntries.map((entry) => entry.cost),
      );
      const documentKeys = new Set(
        item.entries.map(
          (entry) => `${entry.documentType}:${entry.documentId}`,
        ),
      );
      return {
        workshopId: item.workshopId,
        workshopName: item.workshopName,
        lineCount: item.entries.length,
        documentCount: documentKeys.size,
        pickCostAmount: formatMoney(pickCostAmount),
        returnCostAmount: formatMoney(returnCostAmount),
        scrapCostAmount: formatMoney(scrapCostAmount),
        netConsumptionCostAmount: formatMoney(
          pickCostAmount.sub(returnCostAmount).add(scrapCostAmount),
        ),
      };
    })
    .sort((left, right) =>
      left.workshopName.localeCompare(right.workshopName, "zh-Hans-CN"),
    );
}
