import { Prisma } from "../../../../generated/prisma/client";
import { BusinessDocumentType } from "../../../shared/domain/business-document-type";
import {
  MonthlyReportingDirection,
  MonthlyReportingTopicKey,
} from "../application/monthly-reporting.shared";
import { HomeMetricsRepository } from "./home-metrics.repository";
import { InventoryReportingRepository } from "./inventory-reporting.repository";
import { MonthlyMaterialCategoryRepository } from "./monthly-material-category.repository";
import { MonthlyReportRepository } from "./monthly-report.repository";

describe("ReportingRepository", () => {
  function createMockPrisma() {
    const $queryRaw = jest.fn().mockResolvedValue([]);
    const stockInOrder = {
      findMany: jest.fn().mockResolvedValue([]),
      groupBy: jest.fn().mockResolvedValue([]),
    };
    const stockInOrderLine = { findMany: jest.fn().mockResolvedValue([]) };
    const salesStockOrder = {
      findMany: jest.fn().mockResolvedValue([]),
      groupBy: jest.fn().mockResolvedValue([]),
    };
    const salesStockOrderLine = { findMany: jest.fn().mockResolvedValue([]) };
    const inventoryLog = { groupBy: jest.fn().mockResolvedValue([]) };
    const workshopMaterialOrder = {
      findMany: jest.fn().mockResolvedValue([]),
      groupBy: jest.fn().mockResolvedValue([]),
    };
    const workshopMaterialOrderLine = {
      aggregate: jest.fn().mockResolvedValue({ _sum: { costAmount: null } }),
    };
    const rdProjectMaterialAction = {
      findMany: jest.fn().mockResolvedValue([]),
    };
    const rdHandoffOrder = { findMany: jest.fn().mockResolvedValue([]) };
    const rdStocktakeOrder = { findMany: jest.fn().mockResolvedValue([]) };
    const stockInPriceCorrectionOrder = {
      findMany: jest.fn().mockResolvedValue([]),
    };

    return {
      $queryRaw,
      stockInOrder,
      stockInOrderLine,
      salesStockOrder,
      salesStockOrderLine,
      inventoryLog,
      workshopMaterialOrder,
      workshopMaterialOrderLine,
      rdProjectMaterialAction,
      rdHandoffOrder,
      rdStocktakeOrder,
      stockInPriceCorrectionOrder,
    };
  }

  function createAppConfig() {
    return {
      businessTimezone: "Asia/Shanghai",
    } as never;
  }

  function createMonthlyReportRepository() {
    const prisma = createMockPrisma();
    const repository = new MonthlyReportRepository(
      prisma as never,
      createAppConfig(),
    );

    return {
      ...prisma,
      repository,
    };
  }

  function createMaterialCategoryRepository() {
    const prisma = createMockPrisma();
    const repository = new MonthlyMaterialCategoryRepository(
      prisma as never,
      createAppConfig(),
    );

    return {
      ...prisma,
      repository,
    };
  }

  function createInventoryReportingRepository() {
    const prisma = createMockPrisma();
    const repository = new InventoryReportingRepository(prisma as never);

    return {
      ...prisma,
      repository,
    };
  }

  function createHomeMetricsRepository() {
    const prisma = createMockPrisma();
    const repository = new HomeMetricsRepository(prisma as never);

    return {
      ...prisma,
      repository,
    };
  }

  it("keeps stock scope and workshop filters together for rd handoff queries", async () => {
    const { repository, rdHandoffOrder } = createMonthlyReportRepository();

    await repository.findMonthlyReportEntries({
      start: new Date("2026-04-01T00:00:00.000Z"),
      end: new Date("2026-04-30T23:59:59.999Z"),
      stockScope: "RD_SUB",
      workshopId: 192,
    });

    expect(rdHandoffOrder.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          lifecycleStatus: "EFFECTIVE",
          AND: [
            {
              OR: [
                {
                  sourceStockScope: {
                    is: {
                      scopeCode: "RD_SUB",
                    },
                  },
                },
                {
                  targetStockScope: {
                    is: {
                      scopeCode: "RD_SUB",
                    },
                  },
                },
              ],
            },
            {
              OR: [
                { sourceWorkshopId: 192 },
                { targetWorkshopId: 192 },
                {
                  lines: {
                    some: {
                      rdProject: {
                        is: {
                          workshopId: 192,
                        },
                      },
                    },
                  },
                },
              ],
            },
          ],
        }),
      }),
    );
  });

  it("maps supplier returns as inbound-domain outbound rows instead of production receipts", async () => {
    const { repository, stockInOrder, inventoryLog } =
      createMonthlyReportRepository();
    stockInOrder.findMany.mockResolvedValue([
      {
        id: 88,
        documentNo: "TGC20260508001",
        bizDate: new Date("2026-05-08T00:00:00.000Z"),
        createdAt: new Date("2026-05-08T09:00:00.000Z"),
        orderType: "SUPPLIER_RETURN",
        totalQty: new Prisma.Decimal(3),
        totalAmount: new Prisma.Decimal(36),
        stockScope: { scopeCode: "MAIN", scopeName: "主仓" },
        workshopId: 192,
        workshopNameSnapshot: "装备车间",
        workshop: null,
      },
    ] as never);
    inventoryLog.groupBy.mockResolvedValue([
      {
        businessDocumentId: 88,
        _sum: { costAmount: new Prisma.Decimal(40) },
      },
    ] as never);

    const result = await repository.findMonthlyReportEntries({
      start: new Date("2026-05-01T00:00:00.000Z"),
      end: new Date("2026-05-31T23:59:59.999Z"),
      stockScope: "MAIN",
      workshopId: 192,
    });

    expect(result).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          topicKey: MonthlyReportingTopicKey.SUPPLIER_RETURN,
          direction: MonthlyReportingDirection.OUT,
          documentTypeLabel: "退厂单",
          documentNo: "TGC20260508001",
          amount: new Prisma.Decimal(36),
          cost: new Prisma.Decimal(40),
        }),
      ]),
    );
    expect(inventoryLog.groupBy).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          reversalOfLogId: null,
          reversedByLogs: { none: {} },
        }),
      }),
    );
  });

  it("keeps historical price-correction differences out of inventory cost flow", async () => {
    const { repository, stockInPriceCorrectionOrder } =
      createMonthlyReportRepository();
    stockInPriceCorrectionOrder.findMany.mockResolvedValue([
      {
        id: 98,
        documentNo: "TJ-001",
        bizDate: new Date("2026-05-10T00:00:00.000Z"),
        createdAt: new Date("2026-05-10T09:00:00.000Z"),
        stockScope: { scopeCode: "MAIN", scopeName: "主仓" },
        workshopId: 192,
        workshop: { workshopName: "装备车间" },
        lines: [
          {
            sourceBizDateSnapshot: new Date("2026-04-01T00:00:00.000Z"),
            sourceDocumentNoSnapshot: "YS-001",
            remainingQtyAtCorrection: new Prisma.Decimal(2),
            wrongUnitCost: new Prisma.Decimal(10),
            correctUnitCost: new Prisma.Decimal(12),
            historicalDiffAmount: new Prisma.Decimal(3),
            generatedOutLog: { costAmount: new Prisma.Decimal(20) },
            generatedInLog: { costAmount: new Prisma.Decimal(24) },
          },
        ],
      },
    ] as never);

    const result = await repository.findMonthlyReportEntries({
      start: new Date("2026-05-01T00:00:00.000Z"),
      end: new Date("2026-05-31T23:59:59.999Z"),
    });
    const correctionIn = result.find(
      (item) => item.topicKey === MonthlyReportingTopicKey.PRICE_CORRECTION_IN,
    );

    expect(correctionIn).toMatchObject({
      amount: new Prisma.Decimal(27),
      cost: new Prisma.Decimal(24),
    });
  });

  it("filters rd handoff rows by line project workshop when one order spans multiple workshops", async () => {
    const { repository, rdHandoffOrder } = createMonthlyReportRepository();
    rdHandoffOrder.findMany.mockResolvedValue([
      {
        id: 12,
        documentNo: "RDH-001",
        bizDate: new Date("2026-04-10T00:00:00.000Z"),
        createdAt: new Date("2026-04-10T09:00:00.000Z"),
        sourceWorkshopId: null,
        targetWorkshopId: null,
        sourceWorkshopNameSnapshot: "主仓",
        targetWorkshopNameSnapshot: "研发小仓",
        sourceStockScope: { scopeName: "主仓" },
        targetStockScope: { scopeName: "研发小仓" },
        sourceWorkshop: null,
        targetWorkshop: null,
        lines: [
          {
            quantity: new Prisma.Decimal(2),
            amount: new Prisma.Decimal(200),
            costAmount: new Prisma.Decimal(200),
            rdProjectId: 701,
            rdProjectCodeSnapshot: "P-701",
            rdProjectNameSnapshot: "项目 A",
            rdProject: {
              workshopId: 192,
              workshopNameSnapshot: "研发一车间",
            },
          },
          {
            quantity: new Prisma.Decimal(3),
            amount: new Prisma.Decimal(300),
            costAmount: new Prisma.Decimal(300),
            rdProjectId: 702,
            rdProjectCodeSnapshot: "P-702",
            rdProjectNameSnapshot: "项目 B",
            rdProject: {
              workshopId: 193,
              workshopNameSnapshot: "研发二车间",
            },
          },
        ],
      },
    ] as never);

    const result = await repository.findMonthlyReportEntries({
      start: new Date("2026-04-01T00:00:00.000Z"),
      end: new Date("2026-04-30T23:59:59.999Z"),
      stockScope: "RD_SUB",
      workshopId: 192,
    });

    const handoffRows = result.filter((item) => item.topicKey === "RD_HANDOFF");
    expect(handoffRows).toHaveLength(1);
    expect(handoffRows[0]).toMatchObject({
      rdProjectId: 701,
      rdProjectCode: "P-701",
      rdProjectName: "项目 A",
      workshopId: 192,
      workshopName: "研发一车间",
      targetWorkshopName: "研发一车间",
    });
    expect(handoffRows[0]?.amount.toString()).toBe("200");
  });

  it("keeps rd handoff visible without treating all-stock view as a scoped warehouse viewpoint", async () => {
    const { repository, rdHandoffOrder } = createMonthlyReportRepository();
    rdHandoffOrder.findMany.mockResolvedValue([
      {
        id: 15,
        documentNo: "RDH-ALL-001",
        bizDate: new Date("2026-04-10T00:00:00.000Z"),
        createdAt: new Date("2026-04-10T09:00:00.000Z"),
        sourceWorkshopId: null,
        targetWorkshopId: 192,
        sourceWorkshopNameSnapshot: "主仓",
        targetWorkshopNameSnapshot: "研发一车间",
        sourceStockScope: { scopeName: "主仓" },
        targetStockScope: { scopeName: "研发小仓" },
        sourceWorkshop: null,
        targetWorkshop: { workshopName: "研发一车间" },
        lines: [
          {
            quantity: new Prisma.Decimal(9),
            amount: new Prisma.Decimal(900),
            costAmount: new Prisma.Decimal(900),
            rdProjectId: 701,
            rdProjectCodeSnapshot: "TEST-RDP-001",
            rdProjectNameSnapshot: "测试研发项目",
            rdProject: {
              workshopId: 192,
              workshopNameSnapshot: "研发一车间",
            },
          },
        ],
      },
    ] as never);

    const result = await repository.findMonthlyReportEntries({
      start: new Date("2026-04-01T00:00:00.000Z"),
      end: new Date("2026-04-30T23:59:59.999Z"),
    });

    expect(result).toEqual([
      expect.objectContaining({
        topicKey: "RD_HANDOFF",
        direction: "IN",
        stockScope: null,
        stockScopeName: "主仓 -> 研发小仓",
        workshopName: "主仓 -> 研发一车间",
        rdProjectCode: "TEST-RDP-001",
        amount: new Prisma.Decimal(900),
      }),
    ]);
  });

  it("keeps sales project summary rows bound to stored sales-project facts only", async () => {
    const { repository, salesStockOrderLine } = createMonthlyReportRepository();

    salesStockOrderLine.findMany.mockResolvedValue([
      {
        id: 301,
        orderId: 401,
        lineNo: 1,
        materialId: 501,
        salesProjectId: null,
        salesProjectCodeSnapshot: null,
        salesProjectNameSnapshot: null,
        sourceDocumentId: null,
        quantity: new Prisma.Decimal("4"),
        amount: new Prisma.Decimal("80"),
        costAmount: new Prisma.Decimal("50"),
        order: {
          id: 401,
          documentNo: "CK-001",
          bizDate: new Date("2026-05-04T00:00:00.000Z"),
          createdAt: new Date("2026-05-04T09:00:00.000Z"),
          orderType: "OUTBOUND",
        },
      },
      {
        id: 302,
        orderId: 402,
        lineNo: 1,
        materialId: 502,
        salesProjectId: 802,
        salesProjectCodeSnapshot: "SP-802",
        salesProjectNameSnapshot: "明确项目",
        sourceDocumentId: null,
        quantity: new Prisma.Decimal("2"),
        amount: new Prisma.Decimal("40"),
        costAmount: new Prisma.Decimal("30"),
        order: {
          id: 402,
          documentNo: "CK-002",
          bizDate: new Date("2026-05-05T00:00:00.000Z"),
          createdAt: new Date("2026-05-05T09:00:00.000Z"),
          orderType: "OUTBOUND",
        },
      },
    ] as never);

    const result = await repository.findMonthlySalesProjectEntries({
      start: new Date("2026-05-01T00:00:00.000Z"),
      end: new Date("2026-05-31T23:59:59.999Z"),
      stockScope: "MAIN",
    });

    expect(result).toEqual([
      expect.objectContaining({
        salesProjectId: null,
        salesProjectCode: null,
        salesProjectName: null,
        documentNo: "CK-001",
      }),
      expect.objectContaining({
        salesProjectId: 802,
        salesProjectCode: "SP-802",
        salesProjectName: "明确项目",
        documentNo: "CK-002",
      }),
    ]);
  });

  it("maps material-category monthly entries from line snapshots and keeps source-month evidence", async () => {
    const {
      repository,
      stockInOrderLine,
      salesStockOrder,
      salesStockOrderLine,
    } = createMaterialCategoryRepository();

    stockInOrderLine.findMany.mockResolvedValue([
      {
        id: 101,
        lineNo: 1,
        materialId: 501,
        materialCodeSnapshot: "M-RAW-001",
        materialNameSnapshot: "原料 A",
        materialSpecSnapshot: "25kg",
        unitCodeSnapshot: "KG",
        quantity: new Prisma.Decimal("3"),
        unitPrice: new Prisma.Decimal("10"),
        amount: new Prisma.Decimal("30"),
        materialCategoryIdSnapshot: 11,
        materialCategoryCodeSnapshot: "CHEM",
        materialCategoryNameSnapshot: "化工",
        materialCategoryPathSnapshot: [
          { id: 10, code: "RAW", name: "原料" },
          { id: 11, code: "CHEM", name: "化工" },
        ],
        order: {
          id: 201,
          documentNo: "YS-001",
          bizDate: new Date("2026-03-05T00:00:00.000Z"),
          createdAt: new Date("2026-03-05T08:00:00.000Z"),
          orderType: "ACCEPTANCE",
          stockScope: {
            scopeCode: "MAIN",
            scopeName: "主仓",
          },
          workshopId: 192,
          workshopNameSnapshot: "装备车间",
          workshop: {
            workshopName: "装备车间",
          },
        },
      },
    ] as never);
    salesStockOrderLine.findMany.mockResolvedValue([
      {
        id: 301,
        lineNo: 2,
        materialId: 601,
        materialCodeSnapshot: "M-RAW-002",
        materialNameSnapshot: "原料 B",
        materialSpecSnapshot: "10kg",
        unitCodeSnapshot: "KG",
        quantity: new Prisma.Decimal("1"),
        unitPrice: new Prisma.Decimal("8"),
        amount: new Prisma.Decimal("8"),
        selectedUnitCost: new Prisma.Decimal("6"),
        costAmount: new Prisma.Decimal("6"),
        salesProjectId: 701,
        salesProjectCodeSnapshot: "SP-701",
        salesProjectNameSnapshot: "销售项目 A",
        sourceDocumentId: 9001,
        materialCategoryIdSnapshot: 11,
        materialCategoryCodeSnapshot: "CHEM",
        materialCategoryNameSnapshot: "化工",
        materialCategoryPathSnapshot: JSON.stringify([
          { id: 10, categoryCode: "RAW", categoryName: "原料" },
          { id: 11, categoryCode: "CHEM", categoryName: "化工" },
        ]),
        order: {
          id: 401,
          documentNo: "XSTH-001",
          bizDate: new Date("2026-03-31T16:30:00.000Z"),
          createdAt: new Date("2026-04-30T16:30:00.000Z"),
          orderType: "SALES_RETURN",
          stockScope: {
            scopeCode: "MAIN",
            scopeName: "主仓",
          },
          workshopId: 192,
          workshop: {
            workshopName: "装备车间",
          },
        },
      },
    ] as never);
    salesStockOrder.findMany.mockResolvedValue([
      {
        id: 9001,
        bizDate: new Date("2026-03-31T15:30:00.000Z"),
        documentNo: "CK-BASE-001",
      },
    ] as never);

    const result = await repository.findMonthlyMaterialCategoryEntries({
      start: new Date("2026-04-01T00:00:00.000Z"),
      end: new Date("2026-04-30T23:59:59.999Z"),
      stockScope: "MAIN",
      workshopId: 192,
    });

    expect(result).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          topicKey: MonthlyReportingTopicKey.ACCEPTANCE_INBOUND,
          direction: MonthlyReportingDirection.IN,
          documentNo: "YS-001",
          categoryId: 11,
          categoryCode: "CHEM",
          categoryName: "化工",
          categoryPath: [
            { id: 10, categoryCode: "RAW", categoryName: "原料" },
            { id: 11, categoryCode: "CHEM", categoryName: "化工" },
          ],
          amount: new Prisma.Decimal("30"),
          cost: new Prisma.Decimal("30"),
        }),
        expect.objectContaining({
          topicKey: MonthlyReportingTopicKey.SALES_RETURN,
          direction: MonthlyReportingDirection.IN,
          documentNo: "XSTH-001",
          salesProjectCode: "SP-701",
          sourceBizDate: new Date("2026-03-31T15:30:00.000Z"),
          sourceDocumentNo: "CK-BASE-001",
        }),
      ]),
    );
  });

  it("maps supplier-return material-category rows as outbound deductions", async () => {
    const { repository, stockInOrderLine } = createMaterialCategoryRepository();
    stockInOrderLine.findMany.mockResolvedValue([
      {
        id: 990,
        lineNo: 1,
        materialId: 100,
        materialCodeSnapshot: "MAT-RET",
        materialNameSnapshot: "退厂物料",
        materialSpecSnapshot: "A",
        unitCodeSnapshot: "PCS",
        quantity: new Prisma.Decimal(2),
        unitPrice: new Prisma.Decimal(12),
        amount: new Prisma.Decimal(24),
        materialCategoryIdSnapshot: 11,
        materialCategoryCodeSnapshot: "CHEM",
        materialCategoryNameSnapshot: "化工",
        materialCategoryPathSnapshot: [
          { id: 11, categoryCode: "CHEM", categoryName: "化工" },
        ],
        order: {
          id: 88,
          documentNo: "TGC20260508001",
          bizDate: new Date("2026-05-08T00:00:00.000Z"),
          createdAt: new Date("2026-05-08T09:00:00.000Z"),
          orderType: "SUPPLIER_RETURN",
          stockScope: { scopeCode: "MAIN", scopeName: "主仓" },
          workshopId: 192,
          workshopNameSnapshot: "装备车间",
          workshop: null,
        },
      },
    ] as never);

    const result = await repository.findMonthlyMaterialCategoryEntries({
      start: new Date("2026-05-01T00:00:00.000Z"),
      end: new Date("2026-05-31T23:59:59.999Z"),
      stockScope: "MAIN",
      workshopId: 192,
    });

    expect(result).toEqual([
      expect.objectContaining({
        topicKey: MonthlyReportingTopicKey.SUPPLIER_RETURN,
        direction: MonthlyReportingDirection.OUT,
        documentTypeLabel: "退厂单",
        documentNo: "TGC20260508001",
        amount: new Prisma.Decimal(24),
      }),
    ]);
  });

  it("nets supplier-return out logs into inbound inventory trends", async () => {
    const { repository, inventoryLog } = createInventoryReportingRepository();
    inventoryLog.groupBy
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          bizDate: new Date("2026-05-08T00:00:00.000Z"),
          operationType: "SUPPLIER_RETURN_OUT",
          businessDocumentType: "StockInOrder",
          businessDocumentId: 88,
          _sum: {
            costAmount: new Prisma.Decimal(24),
          },
        },
      ])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    const result = await repository.findTrendDocuments({
      dateFrom: new Date("2026-05-01T00:00:00.000Z"),
      dateTo: new Date("2026-05-31T23:59:59.999Z"),
      inventoryStockScopeIds: [1],
      workshopId: 192,
    });

    expect(result).toEqual([
      expect.objectContaining({
        sourceType: "INBOUND",
        businessDocumentType: "StockInOrder",
        businessDocumentId: 88,
        totalAmount: new Prisma.Decimal(-24),
        inventoryCostDelta: new Prisma.Decimal(-24),
      }),
    ]);
    expect(inventoryLog.groupBy).toHaveBeenCalledTimes(7);
    expect(inventoryLog.groupBy.mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({
        by: [
          "bizDate",
          "operationType",
          "businessDocumentType",
          "businessDocumentId",
        ],
        where: expect.objectContaining({
          reversalOfLogId: null,
          reversedByLogs: { none: {} },
        }),
      }),
    );
  });

  it("maps workshop, RD project, handoff, and stocktake cost directions", async () => {
    const { repository, inventoryLog } = createInventoryReportingRepository();
    const group = (
      operationType: string,
      businessDocumentType: string,
      businessDocumentId: number,
      costAmount: string,
    ) => ({
      bizDate: new Date("2026-05-08T00:00:00.000Z"),
      operationType,
      businessDocumentType,
      businessDocumentId,
      _sum: { costAmount: new Prisma.Decimal(costAmount) },
    });
    inventoryLog.groupBy
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        group("OUTBOUND_OUT", "SalesStockOrder", 10, "70"),
        group("SALES_RETURN_IN", "SalesStockOrder", 11, "15"),
      ])
      .mockResolvedValueOnce([
        group("PICK_OUT", "WorkshopMaterialOrder", 1, "100"),
        group("RETURN_IN", "WorkshopMaterialOrder", 2, "30"),
        group("SCRAP_OUT", "WorkshopMaterialOrder", 3, "20"),
      ])
      .mockResolvedValueOnce([
        group("RD_PROJECT_OUT", "RdProjectMaterialAction", 4, "80"),
        group("RETURN_IN", "RdProjectMaterialAction", 5, "10"),
        group("SCRAP_OUT", "RdProjectMaterialAction", 6, "5"),
      ])
      .mockResolvedValueOnce([
        group("RD_HANDOFF_OUT", "RdHandoffOrder", 7, "40"),
        group("RD_HANDOFF_IN", "RdHandoffOrder", 7, "40"),
      ])
      .mockResolvedValueOnce([
        group("RD_STOCKTAKE_IN", "RdStocktakeOrder", 8, "12"),
        group("RD_STOCKTAKE_OUT", "RdStocktakeOrder", 9, "7"),
      ]);

    const result = await repository.findTrendDocuments({
      dateFrom: new Date("2026-05-01T00:00:00.000Z"),
      dateTo: new Date("2026-05-31T23:59:59.999Z"),
      inventoryStockScopeIds: [1, 2],
    });

    expect(
      result
        .filter((item) => item.sourceType === "SALES")
        .map((item) => [
          item.totalAmount.toString(),
          item.inventoryCostDelta.toString(),
        ]),
    ).toEqual([
      ["70", "-70"],
      ["-15", "15"],
    ]);
    expect(
      result
        .filter((item) => item.sourceType === "WORKSHOP_MATERIAL")
        .map((item) => [
          item.totalAmount.toString(),
          item.inventoryCostDelta.toString(),
        ]),
    ).toEqual([
      ["100", "-100"],
      ["-30", "30"],
      ["20", "-20"],
    ]);
    expect(
      result
        .filter((item) => item.sourceType === "RD_PROJECT")
        .map((item) => [
          item.totalAmount.toString(),
          item.inventoryCostDelta.toString(),
        ]),
    ).toEqual([
      ["80", "-80"],
      ["-10", "10"],
      ["5", "-5"],
    ]);
    expect(
      result
        .filter((item) => item.sourceType === "RD_HANDOFF")
        .map((item) => item.totalAmount.toString()),
    ).toEqual(["-40", "40"]);
    expect(
      result
        .filter((item) => item.sourceType.startsWith("RD_STOCKTAKE"))
        .map((item) => [item.sourceType, item.totalAmount.toString()]),
    ).toEqual([
      ["RD_STOCKTAKE_GAIN", "12"],
      ["RD_STOCKTAKE_LOSS", "-7"],
    ]);
  });

  it("splits home document counts and cumulative financial bases", async () => {
    const {
      repository,
      stockInOrder,
      salesStockOrder,
      workshopMaterialOrder,
      inventoryLog,
    } = createHomeMetricsRepository();
    stockInOrder.groupBy
      .mockResolvedValueOnce([
        { orderType: "ACCEPTANCE", _count: { _all: 2 } },
        { orderType: "PRODUCTION_RECEIPT", _count: { _all: 1 } },
        { orderType: "SUPPLIER_RETURN", _count: { _all: 3 } },
      ])
      .mockResolvedValueOnce([
        {
          orderType: "ACCEPTANCE",
          _sum: { totalAmount: new Prisma.Decimal(100) },
        },
        {
          orderType: "PRODUCTION_RECEIPT",
          _sum: { totalAmount: new Prisma.Decimal(40) },
        },
        {
          orderType: "SUPPLIER_RETURN",
          _sum: { totalAmount: new Prisma.Decimal(25) },
        },
      ]);
    salesStockOrder.groupBy
      .mockResolvedValueOnce([
        { orderType: "OUTBOUND", _count: { _all: 4 } },
        { orderType: "SALES_RETURN", _count: { _all: 1 } },
      ])
      .mockResolvedValueOnce([
        {
          orderType: "OUTBOUND",
          _sum: { totalAmount: new Prisma.Decimal(80) },
        },
        {
          orderType: "SALES_RETURN",
          _sum: { totalAmount: new Prisma.Decimal(10) },
        },
      ]);
    workshopMaterialOrder.groupBy.mockResolvedValueOnce([
      { orderType: "PICK", _count: { _all: 5 } },
      { orderType: "RETURN", _count: { _all: 2 } },
      { orderType: "SCRAP", _count: { _all: 1 } },
    ]);
    workshopMaterialOrder.findMany.mockResolvedValueOnce([
      { id: 501, orderType: "PICK" },
      { id: 502, orderType: "RETURN" },
      { id: 503, orderType: "SCRAP" },
    ] as never);
    inventoryLog.groupBy.mockResolvedValueOnce([
      {
        businessDocumentId: 501,
        _sum: { costAmount: new Prisma.Decimal(60) },
      },
      {
        businessDocumentId: 502,
        _sum: { costAmount: new Prisma.Decimal(15) },
      },
      {
        businessDocumentId: 503,
        _sum: { costAmount: new Prisma.Decimal(8) },
      },
    ] as never);

    const result = await repository.getHomeMetrics(
      new Date("2026-05-08T00:00:00.000Z"),
      new Date("2026-05-08T23:59:59.999Z"),
      { stockScope: "MAIN" },
    );

    expect(result).toMatchObject({
      acceptanceTodayCount: 2,
      productionReceiptTodayCount: 1,
      supplierReturnTodayCount: 3,
      salesOutboundTodayCount: 4,
      salesReturnTodayCount: 1,
      workshopPickTodayCount: 5,
      workshopReturnTodayCount: 2,
      workshopScrapTodayCount: 1,
      acceptanceTotalAmount: new Prisma.Decimal(100),
      productionReceiptTotalAmount: new Prisma.Decimal(40),
      supplierReturnTotalAmount: new Prisma.Decimal(25),
      salesOutboundTotalAmount: new Prisma.Decimal(80),
      salesReturnTotalAmount: new Prisma.Decimal(10),
      workshopPickCostAmount: new Prisma.Decimal(60),
      workshopReturnCostAmount: new Prisma.Decimal(15),
      workshopScrapCostAmount: new Prisma.Decimal(8),
    });
    expect(inventoryLog.groupBy).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          businessDocumentType: BusinessDocumentType.WorkshopMaterialOrder,
          reversalOfLogId: null,
          reversedByLogs: { none: {} },
        }),
      }),
    );
  });

  it("avoids reserved keywords in inventory valuation raw SQL aliases", async () => {
    const { repository, $queryRaw } = createInventoryReportingRepository();

    await repository.summarizeInventoryValueByBalance({
      inventoryStockScopeIds: [1, 2],
      materialIds: [101],
    });

    expect($queryRaw).toHaveBeenCalledTimes(1);
    const [query] = $queryRaw.mock.calls[0] as [Prisma.Sql];
    expect(query.sql).toContain("usage_summary");
    expect(query.sql).toContain("source_log_id");
    expect(query.sql).toContain("change_qty");
    expect(query.sql).toContain("stock_scope_id");
    expect(query.sql).toContain("AS materialId");
    expect(query.sql).toContain("AS stockScopeId");
    expect(query.sql).toContain("AS netAllocatedQty");
    expect(query.sql).not.toContain(") usage ON");
    expect(query.sql).not.toContain("usage.net_allocated_qty");
    expect(query.sql).not.toContain("source.material_id");
  });
});
