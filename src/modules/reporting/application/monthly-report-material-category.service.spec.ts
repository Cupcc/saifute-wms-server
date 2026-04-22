import { Test } from "@nestjs/testing";
import { Prisma } from "../../../../generated/prisma/client";
import { AppConfigService } from "../../../shared/config/app-config.service";
import { ReportingRepository } from "../infrastructure/reporting.repository";
import { MonthlyReportCatalogService } from "./monthly-report-catalog.service";
import { MonthlyReportItemMapperService } from "./monthly-report-item-mapper.service";
import { MonthlyReportMaterialCategoryService } from "./monthly-report-material-category.service";
import { MonthlyReportSourceService } from "./monthly-report-source.service";
import {
  type MaterialCategorySnapshotNode,
  type MonthlyMaterialCategoryEntry,
  MonthlyReportingAbnormalFlag,
  MonthlyReportingDirection,
  MonthlyReportingTopicKey,
  MonthlyReportingViewMode,
} from "./monthly-reporting.shared";

describe("MonthlyReportMaterialCategoryService", () => {
  let service: MonthlyReportMaterialCategoryService;
  let repository: jest.Mocked<ReportingRepository>;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        MonthlyReportMaterialCategoryService,
        MonthlyReportSourceService,
        MonthlyReportCatalogService,
        MonthlyReportItemMapperService,
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

    service = moduleRef.get(MonthlyReportMaterialCategoryService);
    repository = moduleRef.get(ReportingRepository);
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

    const result = await service.getMaterialCategorySummary({
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

  it("should expose material-category line details filtered by keyword", async () => {
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
      abnormalLabels: ["跨月修正"],
      sourceBizMonth: "2026-02",
      sourceDocumentNo: "CK-0009",
    });
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
});
