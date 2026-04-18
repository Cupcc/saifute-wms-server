import { Test } from "@nestjs/testing";
import { Prisma } from "../../../../generated/prisma/client";
import { AppConfigService } from "../../../shared/config/app-config.service";
import {
  type MonthlySalesProjectEntry,
  ReportingRepository,
} from "../infrastructure/reporting.repository";
import { MonthlyReportingService } from "./monthly-reporting.service";
import {
  type MaterialCategorySnapshotNode,
  type MonthlyMaterialCategoryEntry,
  type MonthlyReportEntry,
  MonthlyReportingAbnormalFlag,
  MonthlyReportingDirection,
  MonthlyReportingTopicKey,
  MonthlyReportingViewMode,
} from "./monthly-reporting.shared";

describe("MonthlyReportingService", () => {
  let service: MonthlyReportingService;
  let repository: jest.Mocked<ReportingRepository>;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        MonthlyReportingService,
        {
          provide: ReportingRepository,
          useValue: {
            findMonthlyReportEntries: jest.fn(),
            findMonthlySalesProjectEntries: jest.fn(),
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

    service = moduleRef.get(MonthlyReportingService);
    repository = moduleRef.get(ReportingRepository);
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

    const result = await service.getMonthlyReportSummary({
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

    const result = await service.getMonthlyReportSummary({
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

    const result = await service.getMonthlyReportDocuments({
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

  it("should summarize material-category view from line facts into leaf-only buckets", async () => {
    repository.findMonthlyMaterialCategoryEntries.mockResolvedValue([
      createMaterialCategoryEntry(),
      createMaterialCategoryEntry({
        topicKey: MonthlyReportingTopicKey.PRODUCTION_RECEIPT,
        documentId: 102,
        documentNo: "RK-001",
        documentLineId: 1002,
        lineNo: 1,
        amount: new Prisma.Decimal("50"),
        cost: new Prisma.Decimal("50"),
      }),
      createMaterialCategoryEntry({
        topicKey: MonthlyReportingTopicKey.SALES_OUTBOUND,
        direction: MonthlyReportingDirection.OUT,
        documentType: "SalesStockOrder",
        documentTypeLabel: "销售出库单",
        documentId: 201,
        documentNo: "CK-001",
        documentLineId: 2001,
        lineNo: 1,
        materialId: 601,
        materialCode: "M-RAW-002",
        materialName: "原料 B",
        amount: new Prisma.Decimal("40"),
        cost: new Prisma.Decimal("28"),
        salesProjectId: 701,
        salesProjectCode: "SP-701",
        salesProjectName: "销售项目 A",
      }),
      createMaterialCategoryEntry({
        topicKey: MonthlyReportingTopicKey.SALES_RETURN,
        documentType: "SalesStockOrder",
        documentTypeLabel: "销售退货单",
        documentId: 202,
        documentNo: "XSTH-001",
        documentLineId: 2002,
        lineNo: 1,
        materialId: 601,
        materialCode: "M-RAW-002",
        materialName: "原料 B",
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

    const result = await service.getMonthlyReportSummary({
      yearMonth: "2026-03",
      viewMode: MonthlyReportingViewMode.MATERIAL_CATEGORY,
      categoryNodeKey: "11:CHEM:化工",
    });

    expect(repository.findMonthlyMaterialCategoryEntries).toHaveBeenCalledWith({
      start: new Date("2026-02-28T16:00:00.000Z"),
      end: new Date("2026-03-31T15:59:59.999Z"),
      stockScope: undefined,
      workshopId: undefined,
    });
    expect(result.viewMode).toBe("MATERIAL_CATEGORY");
    expect(result.summary).toMatchObject({
      categoryCount: 1,
      lineCount: 4,
      acceptanceInboundAmount: "30.00",
      productionReceiptAmount: "50.00",
      salesOutboundAmount: "40.00",
      salesReturnAmount: "8.00",
      netAmount: "48.00",
      abnormalDocumentCount: 1,
    });
    expect(result.categories).toEqual([
      expect.objectContaining({
        nodeKey: "11:CHEM:化工",
        categoryId: 11,
        categoryName: "化工",
        acceptanceInboundAmount: "30.00",
        productionReceiptAmount: "50.00",
        salesOutboundAmount: "40.00",
        salesReturnAmount: "8.00",
        netAmount: "48.00",
      }),
    ]);
  });

  it("should expose material-category line details and export the category workbook", async () => {
    repository.findMonthlyMaterialCategoryEntries.mockResolvedValue([
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

    const details = await service.getMonthlyReportDocuments({
      yearMonth: "2026-03",
      viewMode: MonthlyReportingViewMode.MATERIAL_CATEGORY,
      keyword: "销售项目 A",
    });
    const exportResult = await service.exportMonthlyReport({
      yearMonth: "2026-03",
      viewMode: MonthlyReportingViewMode.MATERIAL_CATEGORY,
    });

    expect(details.total).toBe(1);
    expect(details.items[0]).toMatchObject({
      documentNo: "XSTH-001",
      lineNo: 2,
      documentTypeLabel: "销售退货单",
      categoryCode: "CHEM",
      categoryName: "化工",
      salesProjectCode: "SP-701",
      abnormalLabels: ["跨月修正"],
      sourceBizMonth: "2026-02",
      sourceDocumentNo: "CK-0009",
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

  it("should treat material-category node key and category id as leaf-only filters", async () => {
    repository.findMonthlyMaterialCategoryEntries.mockResolvedValue([
      createMaterialCategoryEntry({
        documentId: 301,
        documentNo: "YS-301",
        amount: new Prisma.Decimal("30"),
        cost: new Prisma.Decimal("30"),
        categoryId: 11,
        categoryCode: "CHEM",
        categoryName: "化工",
        categoryPath: createMaterialCategoryPath([
          { id: 10, categoryCode: "RAW", categoryName: "原料" },
          { id: 11, categoryCode: "CHEM", categoryName: "化工" },
        ]),
      }),
      createMaterialCategoryEntry({
        documentId: 302,
        documentNo: "YS-UNCAT-302",
        amount: new Prisma.Decimal("45"),
        cost: new Prisma.Decimal("45"),
        categoryId: null,
        categoryCode: null,
        categoryName: "未分类",
        categoryPath: [],
      }),
    ]);

    const nodeKeyResult = await service.getMonthlyReportSummary({
      yearMonth: "2026-03",
      viewMode: MonthlyReportingViewMode.MATERIAL_CATEGORY,
      categoryNodeKey: "null::未分类",
      categoryId: 11,
    });
    const ancestorIdResult = await service.getMonthlyReportSummary({
      yearMonth: "2026-03",
      viewMode: MonthlyReportingViewMode.MATERIAL_CATEGORY,
      categoryId: 10,
    });
    const leafIdResult = await service.getMonthlyReportSummary({
      yearMonth: "2026-03",
      viewMode: MonthlyReportingViewMode.MATERIAL_CATEGORY,
      categoryId: 11,
    });

    expect(nodeKeyResult.summary).toMatchObject({
      categoryCount: 1,
      lineCount: 1,
      acceptanceInboundAmount: "45.00",
    });
    expect(nodeKeyResult.categories).toEqual([
      expect.objectContaining({
        nodeKey: "null::未分类",
        categoryId: null,
        categoryCode: null,
        categoryName: "未分类",
      }),
    ]);
    expect(ancestorIdResult.summary).toMatchObject({
      categoryCount: 0,
      lineCount: 0,
      acceptanceInboundAmount: "0.00",
    });
    expect(leafIdResult.summary).toMatchObject({
      categoryCount: 1,
      lineCount: 1,
      acceptanceInboundAmount: "30.00",
    });
    expect(leafIdResult.categories).toEqual([
      expect.objectContaining({
        nodeKey: "11:CHEM:化工",
        categoryId: 11,
        categoryName: "化工",
      }),
    ]);
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

    const summary = await service.getMonthlyReportSummary({
      yearMonth: "2026-03",
    });
    const details = await service.getMonthlyReportDocuments({
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
