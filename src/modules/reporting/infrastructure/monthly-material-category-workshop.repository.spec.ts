import { Prisma } from "../../../../generated/prisma/client";
import { BusinessDocumentType } from "../../../shared/domain/business-document-type";
import {
  MonthlyReportingDirection,
  MonthlyReportingTopicKey,
} from "../application/monthly-reporting.shared";
import { MonthlyMaterialCategoryWorkshopRepository } from "./monthly-material-category-workshop.repository";

describe("MonthlyMaterialCategoryWorkshopRepository", () => {
  function createRepository() {
    const prisma = {
      workshopMaterialOrderLine: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      workshopMaterialOrder: {
        findMany: jest.fn().mockResolvedValue([]),
      },
    };

    return {
      ...prisma,
      repository: new MonthlyMaterialCategoryWorkshopRepository(
        prisma as never,
        {
          businessTimezone: "Asia/Shanghai",
        } as never,
      ),
    };
  }

  it("maps workshop pick and return lines into material-category facts", async () => {
    const { repository, workshopMaterialOrderLine, workshopMaterialOrder } =
      createRepository();
    workshopMaterialOrderLine.findMany.mockResolvedValue([
      {
        id: 1001,
        lineNo: 1,
        materialId: 501,
        materialCodeSnapshot: "M-WK-001",
        materialNameSnapshot: "车间物料 A",
        materialSpecSnapshot: "10kg",
        unitCodeSnapshot: "KG",
        quantity: new Prisma.Decimal("2"),
        unitPrice: new Prisma.Decimal("10"),
        amount: new Prisma.Decimal("0"),
        costAmount: null,
        sourceDocumentType: null,
        sourceDocumentId: null,
        material: {
          category: {
            id: 11,
            categoryCode: "CHEM",
            categoryName: "化工",
          },
        },
        order: {
          id: 201,
          documentNo: "LL-001",
          bizDate: new Date("2026-05-10T00:00:00.000Z"),
          createdAt: new Date("2026-05-10T09:00:00.000Z"),
          orderType: "PICK",
          stockScope: {
            scopeCode: "MAIN",
            scopeName: "主仓",
          },
          workshopId: 192,
          workshopNameSnapshot: "装备车间",
          workshop: null,
        },
      },
      {
        id: 1002,
        lineNo: 1,
        materialId: 501,
        materialCodeSnapshot: "M-WK-001",
        materialNameSnapshot: "车间物料 A",
        materialSpecSnapshot: "10kg",
        unitCodeSnapshot: "KG",
        quantity: new Prisma.Decimal("0.5"),
        unitPrice: new Prisma.Decimal("10"),
        amount: new Prisma.Decimal("5"),
        costAmount: new Prisma.Decimal("5"),
        sourceDocumentType: BusinessDocumentType.WorkshopMaterialOrder,
        sourceDocumentId: 201,
        material: {
          category: {
            id: 11,
            categoryCode: "CHEM",
            categoryName: "化工",
          },
        },
        order: {
          id: 202,
          documentNo: "TL-001",
          bizDate: new Date("2026-05-12T00:00:00.000Z"),
          createdAt: new Date("2026-06-01T01:00:00.000Z"),
          orderType: "RETURN",
          stockScope: null,
          workshopId: 192,
          workshopNameSnapshot: "装备车间",
          workshop: {
            workshopName: "装备车间",
          },
        },
      },
    ] as never);
    workshopMaterialOrder.findMany.mockResolvedValue([
      {
        id: 201,
        documentNo: "LL-001",
        bizDate: new Date("2026-04-30T00:00:00.000Z"),
      },
    ] as never);

    const result = await repository.findWorkshopMaterialCategoryEntries({
      start: new Date("2026-05-01T00:00:00.000Z"),
      end: new Date("2026-05-31T23:59:59.999Z"),
      stockScope: "MAIN",
      workshopId: 192,
    });

    expect(workshopMaterialOrderLine.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          order: expect.objectContaining({
            orderType: { in: ["PICK", "RETURN"] },
            OR: expect.arrayContaining([{ stockScopeId: null }]),
            workshopId: 192,
          }),
        }),
      }),
    );
    expect(result).toEqual([
      expect.objectContaining({
        topicKey: MonthlyReportingTopicKey.WORKSHOP_PICK,
        direction: MonthlyReportingDirection.OUT,
        documentNo: "LL-001",
        documentTypeLabel: "领料单",
        categoryId: 11,
        categoryCode: "CHEM",
        categoryName: "化工",
        unitPrice: new Prisma.Decimal("10"),
        amount: new Prisma.Decimal("20"),
        cost: new Prisma.Decimal("20"),
        salesUnitPrice: null,
        salesAmount: null,
        workshopName: "装备车间",
      }),
      expect.objectContaining({
        topicKey: MonthlyReportingTopicKey.WORKSHOP_RETURN,
        direction: MonthlyReportingDirection.IN,
        documentNo: "TL-001",
        documentTypeLabel: "退料单",
        stockScope: "MAIN",
        sourceBizDate: new Date("2026-04-30T00:00:00.000Z"),
        sourceDocumentNo: "LL-001",
      }),
    ]);
  });
});
