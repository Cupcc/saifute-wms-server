import { Prisma } from "../../../../generated/prisma/client";
import { MonthlyMaterialCategoryRepository } from "./monthly-material-category.repository";

describe("MonthlyMaterialCategoryRepository amount fallback", () => {
  function createMockPrisma() {
    return {
      stockInOrderLine: { findMany: jest.fn().mockResolvedValue([]) },
      salesStockOrder: { findMany: jest.fn().mockResolvedValue([]) },
      salesStockOrderLine: { findMany: jest.fn().mockResolvedValue([]) },
      inventoryLog: { groupBy: jest.fn().mockResolvedValue([]) },
    };
  }

  function createRepository() {
    const prisma = createMockPrisma();
    return {
      ...prisma,
      repository: new MonthlyMaterialCategoryRepository(
        prisma as never,
        {
          businessTimezone: "Asia/Shanghai",
        } as never,
      ),
    };
  }

  it("derives imported line amounts and uses inventory-log sales cost", async () => {
    const { repository, stockInOrderLine, salesStockOrderLine, inventoryLog } =
      createRepository();

    stockInOrderLine.findMany.mockResolvedValue([
      {
        id: 102,
        lineNo: 1,
        materialId: 502,
        materialCodeSnapshot: "M-IMPORTED-IN",
        materialNameSnapshot: "导入入库物料",
        materialSpecSnapshot: null,
        unitCodeSnapshot: "PCS",
        quantity: new Prisma.Decimal("3"),
        unitPrice: new Prisma.Decimal("10"),
        amount: new Prisma.Decimal("0"),
        materialCategoryIdSnapshot: 11,
        materialCategoryCodeSnapshot: "CHEM",
        materialCategoryNameSnapshot: "化工",
        materialCategoryPathSnapshot: null,
        order: {
          id: 202,
          documentNo: "YS-IMPORTED",
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
        id: 302,
        lineNo: 1,
        materialId: 602,
        materialCodeSnapshot: "M-IMPORTED-SALE",
        materialNameSnapshot: "导入销售物料",
        materialSpecSnapshot: null,
        unitCodeSnapshot: "PCS",
        quantity: new Prisma.Decimal("2"),
        unitPrice: new Prisma.Decimal("8"),
        amount: new Prisma.Decimal("0"),
        selectedUnitCost: new Prisma.Decimal("5"),
        costAmount: null,
        salesProjectId: null,
        salesProjectCodeSnapshot: null,
        salesProjectNameSnapshot: null,
        sourceDocumentId: null,
        materialCategoryIdSnapshot: 11,
        materialCategoryCodeSnapshot: "CHEM",
        materialCategoryNameSnapshot: "化工",
        materialCategoryPathSnapshot: null,
        order: {
          id: 402,
          documentNo: "CK-IMPORTED",
          bizDate: new Date("2026-03-06T00:00:00.000Z"),
          createdAt: new Date("2026-03-06T08:00:00.000Z"),
          orderType: "OUTBOUND",
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
    inventoryLog.groupBy.mockResolvedValue([
      {
        businessDocumentLineId: 302,
        _sum: { costAmount: new Prisma.Decimal("12") },
      },
    ] as never);

    const result = await repository.findMonthlyMaterialCategoryEntries({
      start: new Date("2026-03-01T00:00:00.000Z"),
      end: new Date("2026-03-31T23:59:59.999Z"),
      stockScope: "MAIN",
      workshopId: 192,
    });

    expect(result).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          documentNo: "YS-IMPORTED",
          unitPrice: new Prisma.Decimal("10"),
          amount: new Prisma.Decimal("30"),
          cost: new Prisma.Decimal("30"),
          salesUnitPrice: null,
          salesAmount: null,
        }),
        expect.objectContaining({
          documentNo: "CK-IMPORTED",
          unitPrice: new Prisma.Decimal("6"),
          amount: new Prisma.Decimal("16"),
          cost: new Prisma.Decimal("12"),
          salesUnitPrice: new Prisma.Decimal("8"),
          salesAmount: new Prisma.Decimal("16"),
        }),
      ]),
    );
    expect(inventoryLog.groupBy).toHaveBeenCalledWith(
      expect.objectContaining({
        by: ["businessDocumentLineId"],
        where: expect.objectContaining({
          businessDocumentType: "SalesStockOrder",
          businessDocumentLineId: { in: [302] },
        }),
        _sum: { costAmount: true },
      }),
    );
  });
});
