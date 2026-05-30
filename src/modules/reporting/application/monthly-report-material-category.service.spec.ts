import { Test } from "@nestjs/testing";
import { Prisma } from "../../../../generated/prisma/client";
import { AppConfigService } from "../../../shared/config/app-config.service";
import { MonthlyMaterialCategoryRepository } from "../infrastructure/monthly-material-category.repository";
import { MonthlyMaterialCategoryBalanceRepository } from "../infrastructure/monthly-material-category-balance.repository";
import { MonthlyReportRepository } from "../infrastructure/monthly-report.repository";
import { MonthlyReportCatalogService } from "./monthly-report-catalog.service";
import { MonthlyReportItemMapperService } from "./monthly-report-item-mapper.service";
import { MonthlyReportMaterialCategoryService } from "./monthly-report-material-category.service";
import { MonthlyReportSourceService } from "./monthly-report-source.service";
import {
  type MaterialCategorySnapshotNode,
  type MonthlyMaterialCategoryBalanceSnapshot,
  type MonthlyMaterialCategoryEntry,
  MonthlyReportingDirection,
  MonthlyReportingTopicKey,
  MonthlyReportingViewMode,
} from "./monthly-reporting.shared";

describe("MonthlyReportMaterialCategoryService", () => {
  let service: MonthlyReportMaterialCategoryService;
  let materialCategoryRepository: jest.Mocked<MonthlyMaterialCategoryRepository>;
  let materialCategoryBalanceRepository: jest.Mocked<MonthlyMaterialCategoryBalanceRepository>;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        MonthlyReportMaterialCategoryService,
        MonthlyReportSourceService,
        MonthlyReportCatalogService,
        MonthlyReportItemMapperService,
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

    service = moduleRef.get(MonthlyReportMaterialCategoryService);
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
      closingQuantity: new Prisma.Decimal("15"),
      closingAmount: new Prisma.Decimal("180"),
      ...overrides,
    };
  }

  it("should summarize material-category view from line facts into leaf-only buckets", async () => {
    materialCategoryRepository.findMonthlyMaterialCategoryEntries.mockResolvedValue(
      [
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
          sourceBizDate: new Date("2026-02-27T02:00:00.000Z"),
          sourceDocumentNo: "CK-0009",
        }),
      ],
    );
    materialCategoryBalanceRepository.findMonthlyMaterialCategoryBalanceSnapshots.mockResolvedValue(
      [
        createBalanceSnapshot(),
        createBalanceSnapshot({
          materialId: 601,
          materialCode: "M-RAW-002",
          materialName: "原料 B",
          materialSpec: "10kg",
          openingQuantity: new Prisma.Decimal("7"),
          openingAmount: new Prisma.Decimal("70"),
          closingQuantity: new Prisma.Decimal("7"),
          closingAmount: new Prisma.Decimal("36"),
        }),
      ],
    );

    const result = await service.getMaterialCategorySummary({
      yearMonth: "2026-03",
      viewMode: MonthlyReportingViewMode.MATERIAL_CATEGORY,
      categoryNodeKey: "11:CHEM:化工",
    });

    expect(
      materialCategoryRepository.findMonthlyMaterialCategoryEntries,
    ).toHaveBeenCalledWith({
      start: new Date("2026-03-01T00:00:00.000Z"),
      end: new Date("2026-03-31T00:00:00.000Z"),
      stockScope: undefined,
      workshopId: undefined,
    });
    expect(
      materialCategoryBalanceRepository.findMonthlyMaterialCategoryBalanceSnapshots,
    ).toHaveBeenCalledWith({
      start: new Date("2026-03-01T00:00:00.000Z"),
      end: new Date("2026-03-31T00:00:00.000Z"),
      stockScope: undefined,
    });
    expect(result.summary).toMatchObject({
      categoryCount: 1,
      lineCount: 4,
      openingAmount: "170.0000",
      closingAmount: "216.0000",
      netQuantity: "5.00",
      acceptanceInboundAmount: "30.0000",
      productionReceiptAmount: "50.0000",
      salesOutboundSalesAmount: "40.0000",
      salesOutboundCostAmount: "28.0000",
      salesReturnSalesAmount: "8.0000",
      salesReturnCostAmount: "6.0000",
      netAmount: "46.0000",
    });
    expect(result.summary).not.toHaveProperty("totalCost");
    expect(result.categories).toEqual([
      expect.objectContaining({
        nodeKey: "11:CHEM:化工",
        categoryName: "化工",
        acceptanceInboundAmount: "30.0000",
        productionReceiptAmount: "50.0000",
        salesOutboundSalesAmount: "40.0000",
        salesOutboundCostAmount: "28.0000",
        salesReturnSalesAmount: "8.0000",
        salesReturnCostAmount: "6.0000",
        netQuantity: "5.00",
        netAmount: "46.0000",
      }),
    ]);
    expect(result.materials).toEqual([
      expect.objectContaining({
        categoryNodeKey: "11:CHEM:化工",
        categoryCode: "CHEM",
        categoryName: "化工",
        materialCode: "M-RAW-001",
        materialName: "原料 A",
        materialSpec: "25kg",
        unitCode: "KG",
        lineCount: 2,
        documentCount: 2,
        openingQuantity: "10.00",
        openingAmount: "100.0000",
        closingQuantity: "15.00",
        closingAmount: "180.0000",
        inQuantity: "6.00",
        outQuantity: "0.00",
        netQuantity: "5.00",
        acceptanceInboundAmount: "30.0000",
        productionReceiptAmount: "50.0000",
        netAmount: "80.0000",
      }),
      expect.objectContaining({
        categoryNodeKey: "11:CHEM:化工",
        materialCode: "M-RAW-002",
        materialName: "原料 B",
        lineCount: 2,
        documentCount: 2,
        openingQuantity: "7.00",
        openingAmount: "70.0000",
        closingQuantity: "7.00",
        closingAmount: "36.0000",
        inQuantity: "3.00",
        outQuantity: "3.00",
        netQuantity: "0.00",
        salesOutboundSalesAmount: "40.0000",
        salesOutboundCostAmount: "28.0000",
        salesReturnSalesAmount: "8.0000",
        salesReturnCostAmount: "6.0000",
        netAmount: "-34.0000",
      }),
    ]);
    for (const item of [result.categories[0], ...result.materials])
      expect(item).not.toHaveProperty("totalCost");
  });

  it("should keep the category selector catalog stable when one category is filtered", async () => {
    materialCategoryRepository.findMonthlyMaterialCategoryEntries.mockResolvedValue(
      [
        createMaterialCategoryEntry({
          documentId: 301,
          documentNo: "YS-301",
          amount: new Prisma.Decimal("30"),
          cost: new Prisma.Decimal("30"),
        }),
        createMaterialCategoryEntry({
          documentId: 302,
          documentNo: "YS-302",
          documentLineId: 3002,
          amount: new Prisma.Decimal("45"),
          cost: new Prisma.Decimal("45"),
          categoryId: 22,
          categoryCode: "MET",
          categoryName: "金属",
          categoryPath: createMaterialCategoryPath([
            { id: 22, categoryCode: "MET", categoryName: "金属" },
          ]),
        }),
      ],
    );

    const result = await service.getMaterialCategorySummary({
      yearMonth: "2026-03",
      viewMode: MonthlyReportingViewMode.MATERIAL_CATEGORY,
      categoryNodeKey: "11:CHEM:化工",
    });

    expect(result.categories).toEqual([
      expect.objectContaining({
        nodeKey: "11:CHEM:化工",
        categoryName: "化工",
      }),
    ]);
    expect(result.categoryCatalog).toHaveLength(2);
    expect(result.categoryCatalog).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          nodeKey: "11:CHEM:化工",
          categoryName: "化工",
        }),
        expect.objectContaining({
          nodeKey: "22:MET:金属",
          categoryName: "金属",
        }),
      ]),
    );
  });

  it("should expose material-category line details filtered by keyword", async () => {
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

    const details = await service.getMaterialCategoryDocuments({
      yearMonth: "2026-03",
      viewMode: MonthlyReportingViewMode.MATERIAL_CATEGORY,
      keyword: "销售项目 A",
    });

    expect(details.total).toBe(1);
    expect(details.items[0]).toMatchObject({
      documentNo: "XSTH-001",
      lineNo: 2,
      documentTypeLabel: "销售退货单",
      categoryCode: "CHEM",
      categoryName: "化工",
      salesProjectCode: "SP-701",
      quantity: "3.00",
      unitPrice: "2.0000",
      amount: "6.0000",
      salesUnitPrice: "2.6667",
      salesAmount: "8.0000",
      sourceBizMonth: "2026-02",
      sourceDocumentNo: "CK-0009",
    });

    const hiddenSourceDetails = await service.getMaterialCategoryDocuments({
      yearMonth: "2026-03",
      viewMode: MonthlyReportingViewMode.MATERIAL_CATEGORY,
      keyword: "CK-0009",
    });

    expect(hiddenSourceDetails.total).toBe(0);
  });

  it("should treat material-category node key and category id as leaf-only filters", async () => {
    materialCategoryRepository.findMonthlyMaterialCategoryEntries.mockResolvedValue(
      [
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
      ],
    );

    const nodeKeyResult = await service.getMaterialCategorySummary({
      yearMonth: "2026-03",
      viewMode: MonthlyReportingViewMode.MATERIAL_CATEGORY,
      categoryNodeKey: "null::未分类",
      categoryId: 11,
    });
    const ancestorIdResult = await service.getMaterialCategorySummary({
      yearMonth: "2026-03",
      viewMode: MonthlyReportingViewMode.MATERIAL_CATEGORY,
      categoryId: 10,
    });
    const leafIdResult = await service.getMaterialCategorySummary({
      yearMonth: "2026-03",
      viewMode: MonthlyReportingViewMode.MATERIAL_CATEGORY,
      categoryId: 11,
    });

    expect(nodeKeyResult.summary).toMatchObject({
      categoryCount: 1,
      lineCount: 1,
      acceptanceInboundAmount: "45.0000",
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
      acceptanceInboundAmount: "0.0000",
    });
    expect(leafIdResult.summary).toMatchObject({
      categoryCount: 1,
      lineCount: 1,
      acceptanceInboundAmount: "30.0000",
    });
    expect(leafIdResult.categories).toEqual([
      expect.objectContaining({
        nodeKey: "11:CHEM:化工",
        categoryId: 11,
        categoryName: "化工",
      }),
    ]);
  });
});
