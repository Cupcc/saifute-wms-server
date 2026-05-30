import { Test } from "@nestjs/testing";
import { Prisma } from "../../../../generated/prisma/client";
import { AppConfigService } from "../../../shared/config/app-config.service";
import { MonthlyMaterialCategoryRepository } from "../infrastructure/monthly-material-category.repository";
import { MonthlyMaterialCategoryBalanceRepository } from "../infrastructure/monthly-material-category-balance.repository";
import {
  MonthlyReportRepository,
  type MonthlySalesProjectEntry,
} from "../infrastructure/monthly-report.repository";
import { MonthlyReportCatalogService } from "./monthly-report-catalog.service";
import { MonthlyReportDomainAggregatorService } from "./monthly-report-domain-aggregator.service";
import { MonthlyReportDomainSummaryService } from "./monthly-report-domain-summary.service";
import { MonthlyReportItemMapperService } from "./monthly-report-item-mapper.service";
import { MonthlyReportSourceService } from "./monthly-report-source.service";
import {
  type MonthlyReportEntry,
  MonthlyReportingDirection,
  MonthlyReportingDomainKey,
  MonthlyReportingTopicKey,
} from "./monthly-reporting.shared";

describe("Monthly report document type contract", () => {
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
          provide: MonthlyMaterialCategoryBalanceRepository,
          useValue: {
            findMonthlyMaterialCategoryBalanceSnapshots: jest.fn(),
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

  it("keeps both sales topics when sales return has no rows", async () => {
    repository.findMonthlyReportEntries.mockResolvedValue([createEntry()]);
    repository.findMonthlySalesProjectEntries.mockResolvedValue([
      createSalesProjectEntry(),
    ]);

    const result = await service.getDomainSummary({
      yearMonth: "2026-03",
      domainKey: MonthlyReportingDomainKey.SALES,
    });
    const salesReturnResult = await service.getDomainSummary({
      yearMonth: "2026-03",
      domainKey: MonthlyReportingDomainKey.SALES,
      topicKey: MonthlyReportingTopicKey.SALES_RETURN,
    });

    expect(result.documentTypeCatalog).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          topicKey: MonthlyReportingTopicKey.SALES_OUTBOUND,
          documentTypeLabel: "销售出库单",
        }),
        expect.objectContaining({
          topicKey: MonthlyReportingTopicKey.SALES_RETURN,
          documentTypeLabel: "销售退货单",
        }),
      ]),
    );
    expect(result.documentTypes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          topicKey: MonthlyReportingTopicKey.SALES_OUTBOUND,
          documentCount: 1,
          totalOutQuantity: "10",
        }),
        expect.objectContaining({
          topicKey: MonthlyReportingTopicKey.SALES_RETURN,
          documentCount: 0,
          totalInQuantity: "0",
          totalOutQuantity: "0",
        }),
      ]),
    );
    expect(salesReturnResult.documentTypes).toEqual([
      expect.objectContaining({
        topicKey: MonthlyReportingTopicKey.SALES_RETURN,
        documentTypeLabel: "销售退货单",
        documentCount: 0,
        totalInAmount: "0.0000",
      }),
    ]);
  });

  it("prefers topicKey over legacy documentTypeLabel filters", async () => {
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
      }),
    ]);
    repository.findMonthlySalesProjectEntries.mockResolvedValue([
      createSalesProjectEntry(),
      createSalesProjectEntry({
        topicKey: MonthlyReportingTopicKey.SALES_RETURN,
        documentTypeLabel: "销售退货单",
        documentId: 2,
        documentNo: "SR-001",
        quantity: new Prisma.Decimal("2"),
        amount: new Prisma.Decimal("20"),
        cost: new Prisma.Decimal("14"),
      }),
    ]);

    const query = {
      yearMonth: "2026-03",
      domainKey: MonthlyReportingDomainKey.SALES,
      topicKey: MonthlyReportingTopicKey.SALES_RETURN,
      documentTypeLabel: "销售出库单",
    };
    const summary = await service.getDomainSummary(query);
    const documents = await service.getDomainDocuments(query);

    expect(summary.documentTypes).toEqual([
      expect.objectContaining({
        topicKey: MonthlyReportingTopicKey.SALES_RETURN,
        documentTypeLabel: "销售退货单",
        totalInAmount: "20.0000",
      }),
    ]);
    expect(summary.salesProjectItems).toEqual([
      expect.objectContaining({
        salesReturnSalesAmount: "20.0000",
        salesReturnCostAmount: "14.0000",
        salesOutboundSalesAmount: "0.0000",
        salesOutboundCostAmount: "0.0000",
      }),
    ]);
    expect(documents.items).toEqual([
      expect.objectContaining({
        documentNo: "SR-001",
        documentTypeLabel: "销售退货单",
      }),
    ]);
  });
});
