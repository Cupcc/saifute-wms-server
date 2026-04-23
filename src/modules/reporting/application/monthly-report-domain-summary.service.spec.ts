import { Test } from "@nestjs/testing";
import { Prisma } from "../../../../generated/prisma/client";
import { AppConfigService } from "../../../shared/config/app-config.service";
import { MonthlyMaterialCategoryRepository } from "../infrastructure/monthly-material-category.repository";
import {
  type MonthlySalesProjectEntry,
  MonthlyReportRepository,
} from "../infrastructure/monthly-report.repository";
import { MonthlyReportCatalogService } from "./monthly-report-catalog.service";
import { MonthlyReportDomainAggregatorService } from "./monthly-report-domain-aggregator.service";
import { MonthlyReportDomainSummaryService } from "./monthly-report-domain-summary.service";
import { MonthlyReportItemMapperService } from "./monthly-report-item-mapper.service";
import { MonthlyReportSourceService } from "./monthly-report-source.service";
import {
  type MonthlyReportEntry,
  MonthlyReportingAbnormalFlag,
  MonthlyReportingDirection,
  MonthlyReportingTopicKey,
} from "./monthly-reporting.shared";

describe("MonthlyReportDomainSummaryService", () => {
  let service: MonthlyReportDomainSummaryService;
  let repository: jest.Mocked<MonthlyReportRepository>;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        MonthlyReportDomainSummaryService,
        MonthlyReportSourceService,
        MonthlyReportCatalogService,
        MonthlyReportItemMapperService,
        MonthlyReportDomainAggregatorService,
        {
          provide: MonthlyReportRepository,
          useValue: {
            findMonthlyReportEntries: jest.fn(),
            findMonthlySalesProjectEntries: jest.fn(),
          },
        },
        {
          provide: MonthlyMaterialCategoryRepository,
          useValue: {
            findMonthlyMaterialCategoryEntries: jest.fn(),
          },
        },
        {
          provide: AppConfigService,
          useValue: {
            businessTimezone: "Asia/Shanghai",
          },
        },
      ],
    }).compile();

    service = moduleRef.get(MonthlyReportDomainSummaryService);
    repository = moduleRef.get(MonthlyReportRepository);
  });

  function createEntry(
    overrides: Partial<MonthlyReportEntry> = {},
  ): MonthlyReportEntry {
    return {
      topicKey: MonthlyReportingTopicKey.SALES_OUTBOUND,
      direction: MonthlyReportingDirection.OUT,
      documentType: "SalesStockOrder",
      documentTypeLabel: "销售出库单",
      documentId: 1,
      documentNo: "SO-001",
      bizDate: new Date("2026-03-05T02:00:00.000Z"),
      createdAt: new Date("2026-03-05T03:00:00.000Z"),
      stockScope: "MAIN",
      stockScopeName: "主仓",
      workshopId: 10,
      workshopName: "一车间",
      salesProjectIds: [101],
      salesProjectCodes: ["SP-101"],
      salesProjectNames: ["项目A"],
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
      abnormalFlags: [],
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
      abnormalFlags: [],
      ...overrides,
    };
  }

  it("should summarize monthly entries by domain and expose sales project data", async () => {
    repository.findMonthlyReportEntries.mockResolvedValue([
      createEntry(),
      createEntry({
        topicKey: MonthlyReportingTopicKey.SALES_RETURN,
        direction: MonthlyReportingDirection.IN,
        documentId: 2,
        documentNo: "SR-001",
        documentTypeLabel: "销售退货单",
        quantity: new Prisma.Decimal("2"),
        amount: new Prisma.Decimal("20"),
        cost: new Prisma.Decimal("14"),
        abnormalFlags: [MonthlyReportingAbnormalFlag.CROSS_MONTH_REFERENCE],
        sourceBizDate: new Date("2026-02-27T02:00:00.000Z"),
        sourceDocumentNo: "SO-099",
      }),
      createEntry({
        topicKey: MonthlyReportingTopicKey.RD_HANDOFF,
        direction: MonthlyReportingDirection.OUT,
        documentType: "RdHandoffOrder",
        documentTypeLabel: "RD 交接单",
        documentId: 3,
        documentNo: "RDH-002",
        stockScope: "MAIN",
        stockScopeName: "主仓",
        workshopId: 10,
        workshopName: "一车间",
        salesProjectIds: [],
        salesProjectCodes: [],
        salesProjectNames: [],
        rdProjectId: 701,
        rdProjectCode: "TEST-RDP-001",
        rdProjectName: "测试研发项目",
        sourceStockScopeName: "主仓",
        targetStockScopeName: "RD小仓",
        sourceWorkshopName: "一车间",
        targetWorkshopName: "研发车间",
        quantity: new Prisma.Decimal("1"),
        amount: new Prisma.Decimal("20"),
        cost: new Prisma.Decimal("18"),
        abnormalFlags: [MonthlyReportingAbnormalFlag.BACKFILL_IMPACT],
      }),
    ]);
    repository.findMonthlySalesProjectEntries.mockResolvedValue([
      createSalesProjectEntry(),
      createSalesProjectEntry({
        topicKey: MonthlyReportingTopicKey.SALES_RETURN,
        documentId: 2,
        documentNo: "SR-001",
        quantity: new Prisma.Decimal("2"),
        amount: new Prisma.Decimal("20"),
        cost: new Prisma.Decimal("14"),
        abnormalFlags: [MonthlyReportingAbnormalFlag.CROSS_MONTH_REFERENCE],
      }),
    ]);

    const result = await service.getDomainSummary({
      yearMonth: "2026-03",
      stockScope: "MAIN",
      workshopId: 10,
    });

    expect(repository.findMonthlyReportEntries).toHaveBeenCalledWith({
      start: new Date("2026-02-28T16:00:00.000Z"),
      end: new Date("2026-03-31T15:59:59.999Z"),
      stockScope: "MAIN",
      workshopId: 10,
    });
    expect(repository.findMonthlySalesProjectEntries).toHaveBeenCalledWith({
      start: new Date("2026-02-28T16:00:00.000Z"),
      end: new Date("2026-03-31T15:59:59.999Z"),
      stockScope: "MAIN",
      workshopId: 10,
    });
    expect(result.summary.documentCount).toBe(3);
    expect(result.summary.totalOutAmount).toBe("120.00");
    expect(result.summary.totalInAmount).toBe("20.00");
    expect(result.summary.totalCost).toBe("102.00");
    expect(result.domains.map((item) => item.domainLabel)).toEqual([
      "销售",
      "研发项目",
    ]);
    expect(result.documentTypes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          documentTypeLabel: "RD 交接单",
          totalOutAmount: "20.00",
        }),
        expect.objectContaining({
          documentTypeLabel: "销售出库单",
          totalOutAmount: "100.00",
        }),
      ]),
    );
    expect(result.salesProjectItems[0]).toMatchObject({
      salesProjectCode: "SP-101",
      salesProjectName: "项目A",
      salesOutboundAmount: "100.00",
      salesReturnAmount: "20.00",
      netAmount: "80.00",
    });
    expect(result.documentTypeCatalog).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          documentTypeLabel: "销售出库单",
        }),
        expect.objectContaining({
          domainLabel: "研发项目",
          documentTypeLabel: "RD 交接单",
        }),
      ]),
    );
  });

  it("should count project handoff as rd-project inbound in all-stock view", async () => {
    repository.findMonthlyReportEntries.mockResolvedValue([
      createEntry({
        topicKey: MonthlyReportingTopicKey.RD_HANDOFF,
        direction: MonthlyReportingDirection.IN,
        documentType: "RdHandoffOrder",
        documentTypeLabel: "RD 交接单",
        documentId: 3,
        documentNo: "RDH-003",
        stockScope: "RD_SUB",
        stockScopeName: "RD小仓",
        workshopId: 9,
        workshopName: "研发车间",
        salesProjectIds: [],
        salesProjectCodes: [],
        salesProjectNames: [],
        rdProjectId: 701,
        rdProjectCode: "TEST-RDP-001",
        rdProjectName: "测试研发项目",
        sourceStockScopeName: "主仓",
        targetStockScopeName: "RD小仓",
        sourceWorkshopName: "一车间",
        targetWorkshopName: "研发车间",
        quantity: new Prisma.Decimal("9"),
        amount: new Prisma.Decimal("900"),
        cost: new Prisma.Decimal("900"),
      }),
    ]);
    repository.findMonthlySalesProjectEntries.mockResolvedValue([]);

    const result = await service.getDomainSummary({
      yearMonth: "2026-03",
    });

    expect(result.summary.totalInAmount).toBe("900.00");
    expect(result.domains).toEqual([
      expect.objectContaining({
        domainLabel: "研发项目",
        totalInAmount: "900.00",
        totalOutAmount: "0.00",
      }),
    ]);
    expect(result.rdProjectItems).toEqual([
      expect.objectContaining({
        rdProjectCode: "TEST-RDP-001",
        handoffInAmount: "900.00",
        netAmount: "900.00",
      }),
    ]);
  });

  it("should apply abnormal and keyword filters to document drill-down", async () => {
    repository.findMonthlyReportEntries.mockResolvedValue([
      createEntry(),
      createEntry({
        topicKey: MonthlyReportingTopicKey.SALES_RETURN,
        direction: MonthlyReportingDirection.IN,
        documentId: 2,
        documentNo: "SR-001",
        documentTypeLabel: "销售退货单",
        quantity: new Prisma.Decimal("2"),
        amount: new Prisma.Decimal("20"),
        cost: new Prisma.Decimal("14"),
        abnormalFlags: [MonthlyReportingAbnormalFlag.CROSS_MONTH_REFERENCE],
        sourceBizDate: new Date("2026-02-27T02:00:00.000Z"),
        sourceDocumentNo: "SO-099",
      }),
    ]);
    repository.findMonthlySalesProjectEntries.mockResolvedValue([]);

    const result = await service.getDomainDocuments({
      yearMonth: "2026-03",
      abnormalOnly: true,
      keyword: "跨月",
    });

    expect(result.total).toBe(1);
    expect(result.items[0]).toMatchObject({
      documentNo: "SR-001",
      documentTypeLabel: "销售退货单",
      abnormalLabels: ["跨月修正"],
      sourceBizMonth: "2026-02",
      sourceDocumentNo: "SO-099",
    });
  });

  it("should not expose stock-scope names as workshop labels in workshop summaries or details", async () => {
    repository.findMonthlyReportEntries.mockResolvedValue([
      createEntry({
        topicKey: MonthlyReportingTopicKey.WORKSHOP_PICK,
        documentType: "WorkshopMaterialOrder",
        documentTypeLabel: "领料单",
        documentId: 11,
        documentNo: "WM-011",
        workshopId: 1,
        workshopName: "主仓",
        quantity: new Prisma.Decimal("3"),
        amount: new Prisma.Decimal("30"),
        cost: new Prisma.Decimal("21"),
      }),
      createEntry({
        topicKey: MonthlyReportingTopicKey.WORKSHOP_RETURN,
        direction: MonthlyReportingDirection.IN,
        documentType: "WorkshopMaterialOrder",
        documentTypeLabel: "退料单",
        documentId: 12,
        documentNo: "WM-012",
        workshopId: 2,
        workshopName: "研发小仓",
        quantity: new Prisma.Decimal("1"),
        amount: new Prisma.Decimal("8"),
        cost: new Prisma.Decimal("5"),
      }),
    ]);
    repository.findMonthlySalesProjectEntries.mockResolvedValue([]);

    const summary = await service.getDomainSummary({
      yearMonth: "2026-03",
    });
    const details = await service.getDomainDocuments({
      yearMonth: "2026-03",
    });

    expect(summary.workshopItems).toEqual([
      expect.objectContaining({
        workshopId: null,
        workshopName: "未区分车间",
        pickAmount: "30.00",
        returnAmount: "8.00",
        netAmount: "-22.00",
      }),
    ]);
    expect(details.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          documentNo: "WM-011",
          workshopId: null,
          workshopName: null,
        }),
        expect.objectContaining({
          documentNo: "WM-012",
          workshopId: null,
          workshopName: null,
        }),
      ]),
    );
  });
});
