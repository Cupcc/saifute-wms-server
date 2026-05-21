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
import { MonthlyReportExportService } from "./monthly-report-export.service";
import { MonthlyReportItemMapperService } from "./monthly-report-item-mapper.service";
import { MonthlyReportMaterialCategoryService } from "./monthly-report-material-category.service";
import { MonthlyReportSourceService } from "./monthly-report-source.service";
import {
  type MaterialCategorySnapshotNode,
  type MonthlyMaterialCategoryBalanceSnapshot,
  type MonthlyMaterialCategoryEntry,
  type MonthlyReportEntry,
  MonthlyReportingDirection,
  MonthlyReportingDomainKey,
  MonthlyReportingTopicKey,
  MonthlyReportingViewMode,
} from "./monthly-reporting.shared";

describe("MonthlyReportExportService", () => {
  let service: MonthlyReportExportService;
  let repository: jest.Mocked<MonthlyReportRepository>;
  let materialCategoryRepository: jest.Mocked<MonthlyMaterialCategoryRepository>;
  let materialCategoryBalanceRepository: jest.Mocked<MonthlyMaterialCategoryBalanceRepository>;

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

    service = moduleRef.get(MonthlyReportExportService);
    repository = moduleRef.get(MonthlyReportRepository);
    materialCategoryRepository = moduleRef.get(
      MonthlyMaterialCategoryRepository,
    );
    materialCategoryBalanceRepository = moduleRef.get(
      MonthlyMaterialCategoryBalanceRepository,
    );
    materialCategoryBalanceRepository.findMonthlyMaterialCategoryBalanceSnapshots.mockResolvedValue(
      [],
    );
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
      salesProjectName: "销售项目 A",
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
      { id: 10, categoryCode: "RAW", categoryName: "原料" },
      { id: 11, categoryCode: "CHEM", categoryName: "化工" },
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
      unitPrice: new Prisma.Decimal("10"),
      amount: new Prisma.Decimal("30"),
      cost: new Prisma.Decimal("30"),
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

  function createBalanceSnapshot(
    overrides: Partial<MonthlyMaterialCategoryBalanceSnapshot> = {},
  ): MonthlyMaterialCategoryBalanceSnapshot {
    return {
      materialId: 501,
      materialCode: "M-RAW-001",
      materialName: "原料 A",
      materialSpec: "25kg",
      unitCode: "KG",
      categoryId: 11,
      categoryCode: "CHEM",
      categoryName: "化工",
      openingQuantity: new Prisma.Decimal("10"),
      openingAmount: new Prisma.Decimal("100"),
      closingQuantity: new Prisma.Decimal("13"),
      closingAmount: new Prisma.Decimal("108"),
      ...overrides,
    };
  }

  function extractWorksheet(content: string, sheetName: string): string {
    const startIndex = content.indexOf(`<Worksheet ss:Name="${sheetName}">`);
    expect(startIndex).toBeGreaterThanOrEqual(0);

    const worksheetContent = content.slice(startIndex);
    const nextWorksheetIndex = worksheetContent.indexOf(
      '<Worksheet ss:Name="',
      1,
    );

    return nextWorksheetIndex === -1
      ? worksheetContent
      : worksheetContent.slice(0, nextWorksheetIndex);
  }

  function expectLabelsInOrder(content: string, labels: string[]) {
    let previousIndex = -1;

    for (const label of labels) {
      const currentIndex = content.indexOf(
        `<Data ss:Type="String">${label}</Data>`,
        previousIndex + 1,
      );
      expect(currentIndex).toBeGreaterThan(previousIndex);
      previousIndex = currentIndex;
    }
  }

  it("should export the material-category workbook", async () => {
    materialCategoryRepository.findMonthlyMaterialCategoryEntries.mockResolvedValue(
      [
        createMaterialCategoryEntry({
          topicKey: MonthlyReportingTopicKey.SALES_RETURN,
          documentType: "SalesStockOrder",
          documentTypeLabel: "销售退货单",
          documentId: 202,
          documentNo: "XSTH-001",
          documentLineId: 2002,
          lineNo: 2,
          unitPrice: new Prisma.Decimal("2"),
          amount: new Prisma.Decimal("8"),
          cost: new Prisma.Decimal("6"),
          salesUnitPrice: new Prisma.Decimal("2.6667"),
          salesAmount: new Prisma.Decimal("8"),
          salesProjectId: 701,
          salesProjectCode: "SP-701",
          salesProjectName: "销售项目 A",
          sourceBizDate: new Date("2026-02-27T02:00:00.000Z"),
          sourceDocumentNo: "CK-0009",
        }),
      ],
    );
    materialCategoryBalanceRepository.findMonthlyMaterialCategoryBalanceSnapshots.mockResolvedValue(
      [createBalanceSnapshot()],
    );

    const exportResult = await service.exportMonthlyReport({
      yearMonth: "2026-03",
      viewMode: MonthlyReportingViewMode.MATERIAL_CATEGORY,
    });

    expect(exportResult.fileName).toBe("物料分类月报-2026-03.xls");
    expect(exportResult.fallbackFileName).toBe(
      "monthly-reporting-material-category-2026-03.xls",
    );
    expect(exportResult.content).toContain('<Worksheet ss:Name="分类汇总">');
    expect(exportResult.content).toContain('<Worksheet ss:Name="物料汇总">');
    expect(exportResult.content).toContain('<Worksheet ss:Name="单据行明细">');
    expect(exportResult.content).toContain("2026-03 物料分类月报 - 分类汇总");
    expect(exportResult.content).toContain("2026-03 物料分类月报 - 物料汇总");
    expect(exportResult.content).toContain(
      "2026-03 物料分类月报 - 车间使用汇总",
    );
    expect(exportResult.content).toContain("2026-03 物料分类月报 - 单据行明细");
    expect(exportResult.content).toContain('<Style ss:ID="Title">');
    expect(exportResult.content).toContain(
      'ss:MergeAcross="18" ss:StyleID="Title"><Data ss:Type="String">2026-03 物料分类月报 - 单据行明细',
    );
    expect(exportResult.content).toContain(
      '<Column ss:Width="160" /><Column ss:Width="100" />',
    );
    expect(exportResult.content).toContain("化工");
    expect(exportResult.content).toContain("原料 A");
    expect(exportResult.content).toContain("月初库存金额");
    expect(exportResult.content).toContain("月末金额");
    expect(exportResult.content).toContain("销售退货数量");
    expect(exportResult.content).toContain("销售出库销售价金额");
    expect(exportResult.content).toContain("销售出库成本价金额");
    expect(exportResult.content).toContain("销售退货销售价金额");
    expect(exportResult.content).toContain("销售退货成本价金额");
    expect(exportResult.content).toContain("销售金额");
    expect(exportResult.content).toContain("库存净发生数量");
    expect(exportResult.content).toContain("库存净发生金额");
    expect(exportResult.content).toContain("100.00");
    expect(exportResult.content).toContain("108.00");
    expect(exportResult.content).toContain("3.00");
    expect(exportResult.content).not.toContain("3.000000");
    expect(exportResult.content).not.toContain("总成本");
    expect(exportResult.content).not.toContain("分类路径");
    expect(exportResult.content).not.toContain("层级");
    expect(exportResult.content).not.toContain("来源月份");
    expect(exportResult.content).not.toContain("来源单据");
    expect(exportResult.content).not.toContain("异常单据数");
    expect(exportResult.content).not.toContain("异常标识");
    expect(exportResult.content).toContain("XSTH-001");

    expectLabelsInOrder(extractWorksheet(exportResult.content, "分类汇总"), [
      "单据数",
      "月初库存数量",
      "月初库存金额",
      "库存净发生数量",
      "库存净发生金额",
      "月末库存数量",
      "月末库存金额",
      "验收入库数量",
    ]);
    expectLabelsInOrder(extractWorksheet(exportResult.content, "物料汇总"), [
      "单据数",
      "月初数量",
      "月初金额",
      "库存净发生数量",
      "库存净发生金额",
      "月末数量",
      "月末金额",
      "入库数量",
    ]);
    expectLabelsInOrder(extractWorksheet(exportResult.content, "单据行明细"), [
      "数量",
      "单价",
      "金额",
      "销售价",
      "销售金额",
    ]);
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
      }),
    ]);
    repository.findMonthlySalesProjectEntries.mockResolvedValue([]);

    const result = await service.exportMonthlyReport({
      yearMonth: "2026-03",
      keyword: "RDH-002",
    });

    expect(result.fileName).toBe("月度对账报表-2026-03.xls");
    expect(result.fallbackFileName).toBe("monthly-reporting-2026-03.xls");
    expect(result.contentType).toContain("application/vnd.ms-excel");
    expect(result.content).toContain('<Worksheet ss:Name="单据类型汇总">');
    expect(result.content).toContain("2026-03 月度对账报表 - 总览");
    expect(result.content).toContain("2026-03 月度对账报表 - 单据类型汇总");
    expect(result.content).toContain("2026-03 月度对账报表 - 单据头明细");
    expect(result.content).toContain(
      'ss:MergeAcross="17" ss:StyleID="Title"><Data ss:Type="String">2026-03 月度对账报表 - 单据头明细',
    );
    expect(result.content).toContain(
      '<Column ss:Width="160" /><Column ss:Width="100" />',
    );
    expect(result.content).toContain("RD 交接单");
    expect(result.content).toContain("RDH-002");
    expect(result.content).toContain("项目交接入数量");
    expect(result.content).toContain("项目交接入金额");
    expect(result.content).toContain('<Data ss:Type="Number">1.00</Data>');
    expect(result.content).not.toContain("1.000000");
    expect(result.content).not.toContain("交接金额");
    expect(result.content).not.toContain("主仓到RD交接汇总");
    expect(result.content).not.toContain("异常单据数");
    expect(result.content).not.toContain("异常标识");
    expect(result.content).not.toContain("SO-001");
  });

  it("should export the selected sales return zero row when the month only has outbound rows", async () => {
    repository.findMonthlyReportEntries.mockResolvedValue([createEntry()]);
    repository.findMonthlySalesProjectEntries.mockResolvedValue([]);

    const result = await service.exportMonthlyReport({
      yearMonth: "2026-03",
      domainKey: MonthlyReportingDomainKey.SALES,
      topicKey: MonthlyReportingTopicKey.SALES_RETURN,
    });
    const documentTypeSheet = extractWorksheet(result.content, "单据类型汇总");

    expect(documentTypeSheet).toContain("销售退货单");
    expect(documentTypeSheet).toContain('<Data ss:Type="Number">0.00</Data>');
    expect(documentTypeSheet).not.toContain("销售出库单");
  });

  it("should split ordinary sales project sales-price and cost-price amounts", async () => {
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

    const result = await service.exportMonthlyReport({
      yearMonth: "2026-03",
      domainKey: MonthlyReportingDomainKey.SALES,
    });
    const domainSheet = extractWorksheet(result.content, "领域汇总");
    const salesProjectSheet = extractWorksheet(result.content, "销售项目汇总");

    expect(result.content).not.toContain("总成本");
    expectLabelsInOrder(domainSheet, [
      "销售净售出金额",
      "销售净成本金额",
      "销售毛利金额",
    ]);
    expect(domainSheet).not.toContain("销售出库数量");
    expect(domainSheet).not.toContain("销售退货数量");
    expect(domainSheet).not.toContain("净销售数量");
    expectLabelsInOrder(salesProjectSheet, [
      "销售出库数量",
      "销售出库销售价金额",
      "销售出库成本价金额",
      "销售退货数量",
      "销售退货销售价金额",
      "销售退货成本价金额",
      "净销售数量",
      "净销售价金额",
      "净成本价金额",
    ]);
    expect(salesProjectSheet).toContain("销售项目 A");
    expect(domainSheet).toContain('<Data ss:Type="Number">80.00</Data>');
    expect(domainSheet).toContain('<Data ss:Type="Number">56.00</Data>');
    expect(domainSheet).toContain('<Data ss:Type="Number">24.00</Data>');
    expect(salesProjectSheet).toContain('<Data ss:Type="Number">80.00</Data>');
    expect(salesProjectSheet).toContain('<Data ss:Type="Number">56.00</Data>');
  });
});
