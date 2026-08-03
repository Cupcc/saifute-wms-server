import {
  Prisma,
  RdProjectMaterialActionType,
} from "../../../../generated/prisma/client";
import { BusinessDocumentType } from "../../../shared/domain/business-document-type";
import { MonthlyReportRdRepository } from "./monthly-report-rd.repository";

describe("MonthlyReportRdRepository", () => {
  function createRepository() {
    const prisma = {
      rdProjectMaterialAction: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      inventoryLog: {
        groupBy: jest.fn().mockResolvedValue([]),
      },
    };

    return {
      ...prisma,
      repository: new MonthlyReportRdRepository(
        prisma as never,
        {
          businessTimezone: "Asia/Shanghai",
        } as never,
      ),
    };
  }

  it("prefers effective inventory-log cost and falls back to stored line cost", async () => {
    const { repository, rdProjectMaterialAction, inventoryLog } =
      createRepository();
    rdProjectMaterialAction.findMany.mockResolvedValue([
      {
        id: 21,
        actionType: RdProjectMaterialActionType.PICK,
        documentNo: "RD-PICK-001",
        bizDate: new Date("2026-07-08T00:00:00.000Z"),
        createdAt: new Date("2026-07-08T08:00:00.000Z"),
        stockScope: { scopeCode: "RD_SUB", scopeName: "研发小仓" },
        workshopId: 192,
        workshop: { workshopName: "研发技术" },
        totalQty: new Prisma.Decimal("2"),
        totalAmount: new Prisma.Decimal("900"),
        projectId: 7,
        rdProject: { projectCode: "RD-007", projectName: "项目七" },
        lines: [
          {
            id: 101,
            costAmount: new Prisma.Decimal("40"),
            sourceDocumentId: null,
            sourceDocumentType: null,
          },
          {
            id: 102,
            costAmount: new Prisma.Decimal("30"),
            sourceDocumentId: null,
            sourceDocumentType: null,
          },
        ],
      },
    ] as never);
    inventoryLog.groupBy.mockResolvedValue([
      {
        businessDocumentLineId: 101,
        _sum: { costAmount: new Prisma.Decimal("55") },
      },
    ] as never);

    const result = await repository.findRdProjectMonthlyEntries({
      start: new Date("2026-07-01T00:00:00.000Z"),
      end: new Date("2026-07-31T00:00:00.000Z"),
      stockScope: "RD_SUB",
    });

    expect(result).toEqual([
      expect.objectContaining({
        documentNo: "RD-PICK-001",
        amount: new Prisma.Decimal("900"),
        cost: new Prisma.Decimal("85"),
      }),
    ]);
    expect(inventoryLog.groupBy).toHaveBeenCalledWith({
      by: ["businessDocumentLineId"],
      where: {
        businessDocumentType: BusinessDocumentType.RdProjectMaterialAction,
        businessDocumentLineId: { in: [101, 102] },
        reversalOfLogId: null,
        reversedByLogs: { none: {} },
      },
      _sum: { costAmount: true },
    });
  });
});
