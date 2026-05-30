import { Prisma } from "../../../../generated/prisma/client";
import { buildMonthlyMaterialCategoryWorkshopUsageItems } from "./monthly-report-material-category-workshop.helper";
import {
  type MonthlyMaterialCategoryEntry,
  MonthlyReportingDirection,
  MonthlyReportingTopicKey,
} from "./monthly-reporting.shared";

describe("buildMonthlyMaterialCategoryWorkshopUsageItems", () => {
  function createEntry(
    overrides: Partial<MonthlyMaterialCategoryEntry> = {},
  ): MonthlyMaterialCategoryEntry {
    return {
      topicKey: MonthlyReportingTopicKey.WORKSHOP_PICK,
      direction: MonthlyReportingDirection.OUT,
      documentType: "WorkshopMaterialOrder",
      documentTypeLabel: "领料单",
      documentId: 101,
      documentNo: "LL-001",
      documentLineId: 1001,
      lineNo: 1,
      bizDate: new Date("2026-05-10T00:00:00.000Z"),
      createdAt: new Date("2026-05-10T08:00:00.000Z"),
      stockScope: "MAIN",
      stockScopeName: "主仓",
      workshopId: 192,
      workshopName: "装备车间",
      materialId: 501,
      materialCode: "M-001",
      materialName: "物料 A",
      materialSpec: null,
      unitCode: "KG",
      categoryId: 11,
      categoryCode: "CHEM",
      categoryName: "化工",
      categoryPath: [{ id: 11, categoryCode: "CHEM", categoryName: "化工" }],
      quantity: new Prisma.Decimal("2"),
      unitPrice: new Prisma.Decimal("10"),
      amount: new Prisma.Decimal("20"),
      cost: new Prisma.Decimal("20"),
      salesUnitPrice: null,
      salesAmount: null,
      salesProjectId: null,
      salesProjectCode: null,
      salesProjectName: null,
      sourceBizDate: null,
      sourceDocumentNo: null,
      ...overrides,
    };
  }

  it("summarizes workshop usage as pick minus return", () => {
    const result = buildMonthlyMaterialCategoryWorkshopUsageItems([
      createEntry(),
      createEntry({
        topicKey: MonthlyReportingTopicKey.WORKSHOP_RETURN,
        direction: MonthlyReportingDirection.IN,
        documentTypeLabel: "退料单",
        documentId: 102,
        documentNo: "TL-001",
        documentLineId: 1002,
        quantity: new Prisma.Decimal("0.5"),
        amount: new Prisma.Decimal("5"),
        cost: new Prisma.Decimal("5"),
      }),
      createEntry({
        topicKey: MonthlyReportingTopicKey.SALES_OUTBOUND,
        documentId: 201,
        documentNo: "CK-001",
      }),
    ]);

    expect(result).toEqual([
      expect.objectContaining({
        workshopId: 192,
        workshopName: "装备车间",
        lineCount: 2,
        documentCount: 2,
        pickQuantity: "2.00",
        pickAmount: "20.0000",
        returnQuantity: "0.50",
        returnAmount: "5.0000",
        netUsedQuantity: "1.50",
        netUsedAmount: "15.0000",
      }),
    ]);
  });
});
