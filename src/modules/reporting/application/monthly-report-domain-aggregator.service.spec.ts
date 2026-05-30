import { Prisma } from "../../../../generated/prisma/client";
import type { MonthlySalesProjectEntry } from "../infrastructure/monthly-report.repository";
import { MonthlyReportDomainAggregatorService } from "./monthly-report-domain-aggregator.service";
import {
  type MonthlyReportEntry,
  MonthlyReportingDirection,
  MonthlyReportingTopicKey,
} from "./monthly-reporting.shared";

describe("MonthlyReportDomainAggregatorService", () => {
  let service: MonthlyReportDomainAggregatorService;

  beforeEach(() => {
    service = new MonthlyReportDomainAggregatorService();
  });

  function createEntry(
    overrides: Partial<MonthlyReportEntry> = {},
  ): MonthlyReportEntry {
    return {
      topicKey: MonthlyReportingTopicKey.WORKSHOP_RETURN,
      direction: MonthlyReportingDirection.IN,
      documentType: "WorkshopMaterialOrder",
      documentTypeLabel: "退料单",
      documentId: 1,
      documentNo: "WM-001",
      bizDate: new Date("2026-03-05T02:00:00.000Z"),
      createdAt: new Date("2026-03-05T03:00:00.000Z"),
      stockScope: "MAIN",
      stockScopeName: "主仓",
      workshopId: 1,
      workshopName: "一车间",
      salesProjectIds: [],
      salesProjectCodes: [],
      salesProjectNames: [],
      rdProjectId: null,
      rdProjectCode: null,
      rdProjectName: null,
      sourceStockScopeName: null,
      targetStockScopeName: null,
      sourceWorkshopName: null,
      targetWorkshopName: null,
      quantity: new Prisma.Decimal("10"),
      amount: new Prisma.Decimal("100"),
      cost: new Prisma.Decimal("70"),
      sourceBizDate: null,
      sourceDocumentNo: null,
      ...overrides,
    };
  }

  function createSalesProjectEntry(
    overrides: Partial<MonthlySalesProjectEntry> = {},
  ): MonthlySalesProjectEntry {
    return {
      salesProjectId: 101,
      salesProjectCode: "SP-101",
      salesProjectName: "项目A",
      topicKey: MonthlyReportingTopicKey.SALES_OUTBOUND,
      documentTypeLabel: "销售出库单",
      documentId: 1,
      documentNo: "SO-001",
      bizDate: new Date("2026-03-05T02:00:00.000Z"),
      createdAt: new Date("2026-03-05T03:00:00.000Z"),
      quantity: new Prisma.Decimal("10"),
      amount: new Prisma.Decimal("100"),
      cost: new Prisma.Decimal("70"),
      ...overrides,
    };
  }

  it("sorts business summaries by numeric amount instead of formatted string", () => {
    const salesProjectItems = service.buildSalesProjectItems([
      createSalesProjectEntry({
        salesProjectId: 1,
        salesProjectCode: "SP-900",
        salesProjectName: "九百项目",
        amount: new Prisma.Decimal("900"),
        cost: new Prisma.Decimal("630"),
      }),
      createSalesProjectEntry({
        salesProjectId: 2,
        salesProjectCode: "SP-1000",
        salesProjectName: "一千项目",
        amount: new Prisma.Decimal("1000"),
        cost: new Prisma.Decimal("700"),
      }),
    ]);

    expect(salesProjectItems.map((item) => item.salesProjectCode)).toEqual([
      "SP-1000",
      "SP-900",
    ]);
    expect(salesProjectItems[0]).toMatchObject({
      salesOutboundSalesAmount: "1000.0000",
      salesOutboundCostAmount: "700.0000",
      netSalesAmount: "1000.0000",
      netCostAmount: "700.0000",
    });
  });

  it("formats ordinary monthly report aggregate quantities with two decimals", () => {
    const workshopItems = service.buildWorkshopItems([
      createEntry({
        topicKey: MonthlyReportingTopicKey.WORKSHOP_PICK,
        direction: MonthlyReportingDirection.OUT,
        quantity: new Prisma.Decimal("3"),
        amount: new Prisma.Decimal("30"),
      }),
      createEntry({
        topicKey: MonthlyReportingTopicKey.WORKSHOP_RETURN,
        direction: MonthlyReportingDirection.IN,
        quantity: new Prisma.Decimal("1.2"),
        amount: new Prisma.Decimal("8"),
      }),
    ]);
    const rdProjectItems = service.buildRdProjectItems([
      createEntry({
        topicKey: MonthlyReportingTopicKey.RD_HANDOFF,
        direction: MonthlyReportingDirection.IN,
        documentType: "RdHandoffOrder",
        documentTypeLabel: "RD 交接单",
        rdProjectId: 701,
        rdProjectCode: "RDP-701",
        rdProjectName: "研发项目",
        quantity: new Prisma.Decimal("1.234"),
        amount: new Prisma.Decimal("100"),
      }),
    ]);

    expect(workshopItems[0]).toMatchObject({
      pickQuantity: "3.00",
      returnQuantity: "1.20",
      netQuantity: "-1.80",
    });
    expect(rdProjectItems[0]).toMatchObject({
      handoffInQuantity: "1.23",
      netQuantity: "1.23",
    });
  });
});
