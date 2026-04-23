import { Test } from "@nestjs/testing";
import { Prisma } from "../../../../generated/prisma/client";
import { AppConfigService } from "../../../shared/config/app-config.service";
import { MonthlyMaterialCategoryRepository } from "../infrastructure/monthly-material-category.repository";
import { MonthlyReportRepository } from "../infrastructure/monthly-report.repository";
import { MonthlyReportCatalogService } from "./monthly-report-catalog.service";
import { MonthlyReportDomainAggregatorService } from "./monthly-report-domain-aggregator.service";
import { MonthlyReportDomainSummaryService } from "./monthly-report-domain-summary.service";
import { MonthlyReportExportService } from "./monthly-report-export.service";
import { MonthlyReportItemMapperService } from "./monthly-report-item-mapper.service";
import { MonthlyReportMaterialCategoryService } from "./monthly-report-material-category.service";
import { MonthlyReportSourceService } from "./monthly-report-source.service";
import {
  type MaterialCategorySnapshotNode,
  type MonthlyMaterialCategoryEntry,
  type MonthlyReportEntry,
  MonthlyReportingAbnormalFlag,
  MonthlyReportingDirection,
  MonthlyReportingTopicKey,
  MonthlyReportingViewMode,
} from "./monthly-reporting.shared";

describe("MonthlyReportExportService", () => {
  let service: MonthlyReportExportService;
  let repository: jest.Mocked<MonthlyReportRepository>;
  let materialCategoryRepository: jest.Mocked<MonthlyMaterialCategoryRepository>;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        MonthlyReportExportService,
        MonthlyReportSourceService,
        MonthlyReportCatalogService,
        MonthlyReportItemMapperService,
        MonthlyReportDomainAggregatorService,
        MonthlyReportDomainSummaryService,
        MonthlyReportMaterialCategoryService,
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

    service = moduleRef.get(MonthlyReportExportService);
    repository = moduleRef.get(MonthlyReportRepository);
    materialCategoryRepository = moduleRef.get(MonthlyMaterialCategoryRepository);
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

  function createMaterialCategoryPath(
    nodes: Array<Partial<MaterialCategorySnapshotNode>>,
  ): MaterialCategorySnapshotNode[] {
    return nodes.map((node, index) => ({
      id: node.id ?? index + 1,
      categoryCode: node.categoryCode ?? `CAT-${index + 1}`,
      categoryName: node.categoryName ?? `分类${index + 1}`,
    }));
  }

  function createMaterialCategoryEntry(
    overrides: Partial<MonthlyMaterialCategoryEntry> = {},
  ): MonthlyMaterialCategoryEntry {
    const categoryPath = createMaterialCategoryPath([
      {
        id: 10,
        categoryCode: "RAW",
        categoryName: "原料",
      },
      {
        id: 11,
        categoryCode: "CHEM",
        categoryName: "化工",
      },
    ]);

    return {
      topicKey: MonthlyReportingTopicKey.ACCEPTANCE_INBOUND,
      direction: MonthlyReportingDirection.IN,
      documentType: "StockInOrder",
      documentTypeLabel: "验收单",
      documentId: 101,
      documentNo: "YS-001",
      documentLineId: 1001,
      lineNo: 1,
      bizDate: new Date("2026-03-05T02:00:00.000Z"),
      createdAt: new Date("2026-03-05T03:00:00.000Z"),
      stockScope: "MAIN",
      stockScopeName: "主仓",
      workshopId: 10,
      workshopName: "一车间",
      materialId: 501,
      materialCode: "M-RAW-001",
      materialName: "原料 A",
      materialSpec: "25kg",
      unitCode: "KG",
      categoryId: 11,
      categoryCode: "CHEM",
      categoryName: "化工",
      categoryPath,
      quantity: new Prisma.Decimal("3"),
      amount: new Prisma.Decimal("30"),
      cost: new Prisma.Decimal("30"),
      salesProjectId: null,
      salesProjectCode: null,
      salesProjectName: null,
      abnormalFlags: [],
      sourceBizDate: null,
      sourceDocumentNo: null,
      ...overrides,
    };
  }

  it("should export the material-category workbook", async () => {
    materialCategoryRepository.findMonthlyMaterialCategoryEntries.mockResolvedValue([
      createMaterialCategoryEntry({
        topicKey: MonthlyReportingTopicKey.SALES_RETURN,
        documentType: "SalesStockOrder",
        documentTypeLabel: "销售退货单",
        documentId: 202,
        documentNo: "XSTH-001",
        documentLineId: 2002,
        lineNo: 2,
        amount: new Prisma.Decimal("8"),
        cost: new Prisma.Decimal("6"),
        salesProjectId: 701,
        salesProjectCode: "SP-701",
        salesProjectName: "销售项目 A",
        abnormalFlags: [MonthlyReportingAbnormalFlag.CROSS_MONTH_REFERENCE],
        sourceBizDate: new Date("2026-02-27T02:00:00.000Z"),
        sourceDocumentNo: "CK-0009",
      }),
    ]);

    const exportResult = await service.exportMonthlyReport({
      yearMonth: "2026-03",
      viewMode: MonthlyReportingViewMode.MATERIAL_CATEGORY,
    });

    expect(exportResult.fileName).toBe(
      "monthly-reporting-material-category-2026-03.xls",
    );
    expect(exportResult.content).toContain('<Worksheet ss:Name="分类汇总">');
    expect(exportResult.content).toContain('<Worksheet ss:Name="单据行明细">');
    expect(exportResult.content).toContain("化工");
    expect(exportResult.content).not.toContain("分类路径");
    expect(exportResult.content).not.toContain("层级");
    expect(exportResult.content).toContain("XSTH-001");
  });

  it("should export excel content using the same filtered contract", async () => {
    repository.findMonthlyReportEntries.mockResolvedValue([
      createEntry(),
      createEntry({
        topicKey: MonthlyReportingTopicKey.RD_HANDOFF,
        direction: MonthlyReportingDirection.IN,
        documentType: "RdHandoffOrder",
        documentTypeLabel: "RD 交接单",
        documentId: 3,
        documentNo: "RDH-002",
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
        quantity: new Prisma.Decimal("1"),
        amount: new Prisma.Decimal("20"),
        cost: new Prisma.Decimal("18"),
        abnormalFlags: [MonthlyReportingAbnormalFlag.BACKFILL_IMPACT],
      }),
    ]);
    repository.findMonthlySalesProjectEntries.mockResolvedValue([]);

    const result = await service.exportMonthlyReport({
      yearMonth: "2026-03",
      keyword: "RDH-002",
    });

    expect(result.fileName).toBe("monthly-reporting-2026-03.xls");
    expect(result.contentType).toContain("application/vnd.ms-excel");
    expect(result.content).toContain('<Worksheet ss:Name="单据类型汇总">');
    expect(result.content).toContain("RD 交接单");
    expect(result.content).toContain("RDH-002");
    expect(result.content).not.toContain("交接金额");
    expect(result.content).not.toContain("主仓到RD交接汇总");
    expect(result.content).not.toContain("SO-001");
  });
});
