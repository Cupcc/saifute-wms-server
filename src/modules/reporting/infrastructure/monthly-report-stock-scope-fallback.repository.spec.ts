import { Prisma } from "../../../../generated/prisma/client";
import { MonthlyMaterialCategoryRepository } from "./monthly-material-category.repository";
import { MonthlyReportRepository } from "./monthly-report.repository";

describe("monthly report stock-scope fallback", () => {
  function createMockPrisma() {
    return {
      stockInOrder: { findMany: jest.fn().mockResolvedValue([]) },
      stockInOrderLine: { findMany: jest.fn().mockResolvedValue([]) },
      salesStockOrder: { findMany: jest.fn().mockResolvedValue([]) },
      salesStockOrderLine: { findMany: jest.fn().mockResolvedValue([]) },
      inventoryLog: { groupBy: jest.fn().mockResolvedValue([]) },
      workshopMaterialOrder: { findMany: jest.fn().mockResolvedValue([]) },
      rdProjectMaterialAction: { findMany: jest.fn().mockResolvedValue([]) },
      rdHandoffOrder: { findMany: jest.fn().mockResolvedValue([]) },
      rdStocktakeOrder: { findMany: jest.fn().mockResolvedValue([]) },
      stockInPriceCorrectionOrder: {
        findMany: jest.fn().mockResolvedValue([]),
      },
    };
  }

  function createAppConfig() {
    return { businessTimezone: "Asia/Shanghai" } as never;
  }

  it("treats legacy null stock scope as main in monthly domain filters", async () => {
    const prisma = createMockPrisma();
    const repository = new MonthlyReportRepository(
      prisma as never,
      createAppConfig(),
    );
    prisma.stockInOrder.findMany.mockResolvedValue([
      {
        id: 1001,
        documentNo: "YS-LEGACY-MAIN",
        bizDate: new Date("2026-04-10T00:00:00.000Z"),
        createdAt: new Date("2026-04-10T08:00:00.000Z"),
        orderType: "ACCEPTANCE",
        stockScope: null,
        workshopId: 192,
        workshopNameSnapshot: "装备车间",
        workshop: { workshopName: "装备车间" },
        totalQty: new Prisma.Decimal("3"),
        totalAmount: new Prisma.Decimal("30"),
      },
    ] as never);

    const result = await repository.findMonthlyReportEntries({
      start: new Date("2026-04-01T00:00:00.000Z"),
      end: new Date("2026-04-30T23:59:59.999Z"),
      stockScope: "MAIN",
    });

    expect(prisma.stockInOrder.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          OR: expect.arrayContaining([
            { stockScopeId: null },
            { stockScope: { is: { scopeCode: "MAIN" } } },
          ]),
        }),
      }),
    );
    expect(result).toEqual([
      expect.objectContaining({
        documentNo: "YS-LEGACY-MAIN",
        stockScope: "MAIN",
        stockScopeName: "主仓",
      }),
    ]);
  });

  it("treats legacy null stock scope as main in material-category filters", async () => {
    const prisma = createMockPrisma();
    const repository = new MonthlyMaterialCategoryRepository(
      prisma as never,
      createAppConfig(),
    );
    prisma.stockInOrderLine.findMany.mockResolvedValue([
      {
        id: 2001,
        lineNo: 1,
        materialId: 501,
        materialCodeSnapshot: "M-LEGACY",
        materialNameSnapshot: "历史物料",
        materialSpecSnapshot: null,
        unitCodeSnapshot: "PCS",
        quantity: new Prisma.Decimal("2"),
        unitPrice: new Prisma.Decimal("5"),
        amount: new Prisma.Decimal("10"),
        materialCategoryIdSnapshot: 11,
        materialCategoryCodeSnapshot: "CHEM",
        materialCategoryNameSnapshot: "化工",
        materialCategoryPathSnapshot: null,
        order: {
          id: 1001,
          documentNo: "YS-LEGACY-MATERIAL",
          bizDate: new Date("2026-04-10T00:00:00.000Z"),
          createdAt: new Date("2026-04-10T08:00:00.000Z"),
          orderType: "ACCEPTANCE",
          stockScope: null,
          workshopId: 192,
          workshopNameSnapshot: "装备车间",
          workshop: { workshopName: "装备车间" },
        },
      },
    ] as never);

    const result = await repository.findMonthlyMaterialCategoryEntries({
      start: new Date("2026-04-01T00:00:00.000Z"),
      end: new Date("2026-04-30T23:59:59.999Z"),
      stockScope: "MAIN",
    });

    expect(prisma.stockInOrderLine.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          order: expect.objectContaining({
            OR: expect.arrayContaining([
              { stockScopeId: null },
              { stockScope: { is: { scopeCode: "MAIN" } } },
            ]),
          }),
        }),
      }),
    );
    expect(result).toEqual([
      expect.objectContaining({
        documentNo: "YS-LEGACY-MATERIAL",
        stockScope: "MAIN",
        stockScopeName: "主仓",
      }),
    ]);
  });

  it("treats legacy null stock scope as main in RD and adjustment reporting filters", async () => {
    const prisma = createMockPrisma();
    const repository = new MonthlyReportRepository(
      prisma as never,
      createAppConfig(),
    );

    await repository.findMonthlyReportEntries({
      start: new Date("2026-04-01T00:00:00.000Z"),
      end: new Date("2026-04-30T23:59:59.999Z"),
      stockScope: "MAIN",
    });

    expect(prisma.rdProjectMaterialAction.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          OR: expect.arrayContaining([
            { stockScopeId: null },
            { stockScope: { is: { scopeCode: "MAIN" } } },
          ]),
        }),
      }),
    );
    expect(prisma.rdStocktakeOrder.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          OR: expect.arrayContaining([
            { stockScopeId: null },
            { stockScope: { is: { scopeCode: "MAIN" } } },
          ]),
        }),
      }),
    );
    expect(prisma.stockInPriceCorrectionOrder.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          OR: expect.arrayContaining([
            { stockScopeId: null },
            { stockScope: { is: { scopeCode: "MAIN" } } },
          ]),
        }),
      }),
    );
    expect(prisma.rdHandoffOrder.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          AND: expect.arrayContaining([
            {
              OR: expect.arrayContaining([
                { sourceStockScopeId: null },
                { targetStockScopeId: null },
                { sourceStockScope: { is: { scopeCode: "MAIN" } } },
                { targetStockScope: { is: { scopeCode: "MAIN" } } },
              ]),
            },
          ]),
        }),
      }),
    );
  });
});
