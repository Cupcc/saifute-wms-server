import { Prisma } from "../../../../generated/prisma/client";
import {
  MonthlyReportingAbnormalFlag,
} from "../application/monthly-reporting.shared";
import { ReportingRepository } from "./reporting.repository";

describe("ReportingRepository", () => {
  function createRepository() {
    const $queryRaw = jest.fn().mockResolvedValue([]);
    const stockInOrder = { findMany: jest.fn().mockResolvedValue([]) };
    const salesStockOrder = { findMany: jest.fn().mockResolvedValue([]) };
    const workshopMaterialOrder = { findMany: jest.fn().mockResolvedValue([]) };
    const rdProjectMaterialAction = { findMany: jest.fn().mockResolvedValue([]) };
    const rdHandoffOrder = { findMany: jest.fn().mockResolvedValue([]) };
    const rdStocktakeOrder = { findMany: jest.fn().mockResolvedValue([]) };
    const stockInPriceCorrectionOrder = {
      findMany: jest.fn().mockResolvedValue([]),
    };
    const repository = new ReportingRepository(
      {
        $queryRaw,
        stockInOrder,
        salesStockOrder,
        workshopMaterialOrder,
        rdProjectMaterialAction,
        rdHandoffOrder,
        rdStocktakeOrder,
        stockInPriceCorrectionOrder,
      } as never,
      {
        businessTimezone: "Asia/Shanghai",
      } as never,
    );

    return {
      $queryRaw,
      repository,
      rdHandoffOrder,
    };
  }

  it("keeps stock scope and workshop filters together for rd handoff queries", async () => {
    const { repository, rdHandoffOrder } = createRepository();

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
              OR: [{ sourceWorkshopId: 192 }, { targetWorkshopId: 192 }],
            },
          ],
        }),
      }),
    );
  });

  it("marks abnormal flags with the configured business timezone", () => {
    const { repository } = createRepository();

    const flags = (
      repository as unknown as {
        buildAbnormalFlags: (params: {
          bizDate: Date;
          createdAt: Date;
          sourceBizDate?: Date | null;
        }) => MonthlyReportingAbnormalFlag[];
      }
    ).buildAbnormalFlags({
      bizDate: new Date("2026-03-31T16:30:00.000Z"),
      createdAt: new Date("2026-04-30T16:30:00.000Z"),
      sourceBizDate: new Date("2026-03-31T15:30:00.000Z"),
    });

    expect(flags).toEqual(
      expect.arrayContaining([
        MonthlyReportingAbnormalFlag.BACKFILL_IMPACT,
        MonthlyReportingAbnormalFlag.CROSS_MONTH_REFERENCE,
      ]),
    );
  });

  it("avoids reserved keywords in inventory valuation raw SQL aliases", async () => {
    const { repository, $queryRaw } = createRepository();

    await repository.summarizeInventoryValueByBalance({
      inventoryStockScopeIds: [1, 2],
      materialIds: [101],
    });

    expect($queryRaw).toHaveBeenCalledTimes(1);
    const [query] = $queryRaw.mock.calls[0] as [Prisma.Sql];
    expect(query.sql).toContain("usage_summary");
    expect(query.sql).toContain("sourceLogId");
    expect(query.sql).toContain("changeQty");
    expect(query.sql).toContain("stockScopeId");
    expect(query.sql).not.toContain(") usage ON");
    expect(query.sql).not.toContain("usage.net_allocated_qty");
    expect(query.sql).not.toContain("source.material_id");
    expect(query.sql).not.toContain("source_log_id");
    expect(query.sql).not.toContain("change_qty");
    expect(query.sql).not.toContain("stock_scope_id");
  });
});
