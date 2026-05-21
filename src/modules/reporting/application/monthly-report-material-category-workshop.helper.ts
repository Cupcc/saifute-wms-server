import { normalizeMonthlyReportWorkshopRef } from "./monthly-reporting.formatters";
import {
  formatMoney,
  formatQuantity,
  type MonthlyMaterialCategoryEntry,
  sumDecimals,
} from "./monthly-reporting.shared";

export interface MonthlyReportMaterialCategoryWorkshopSummaryItem {
  workshopId: number | null;
  workshopName: string;
  lineCount: number;
  documentCount: number;
  pickQuantity: string;
  pickAmount: string;
  returnQuantity: string;
  returnAmount: string;
  netUsedQuantity: string;
  netUsedAmount: string;
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
      entry.topicKey !== "WORKSHOP_RETURN"
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
      const pickQuantity = sumDecimals(
        pickEntries.map((entry) => entry.quantity),
      );
      const returnQuantity = sumDecimals(
        returnEntries.map((entry) => entry.quantity),
      );
      const pickAmount = sumDecimals(pickEntries.map((entry) => entry.amount));
      const returnAmount = sumDecimals(
        returnEntries.map((entry) => entry.amount),
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
        pickQuantity: formatQuantity(pickQuantity),
        pickAmount: formatMoney(pickAmount),
        returnQuantity: formatQuantity(returnQuantity),
        returnAmount: formatMoney(returnAmount),
        netUsedQuantity: formatQuantity(pickQuantity.sub(returnQuantity)),
        netUsedAmount: formatMoney(pickAmount.sub(returnAmount)),
      };
    })
    .sort((left, right) =>
      left.workshopName.localeCompare(right.workshopName, "zh-Hans-CN"),
    );
}
