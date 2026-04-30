import type { SessionUserSnapshot } from "../../session/domain/user-session";
import { ReportingController } from "./reporting.controller";

describe("ReportingController stock scope routing", () => {
  const user = {
    userId: 2,
    username: "warehouse",
    displayName: "仓库管理员",
    roles: ["warehouse-manager"],
    permissions: [],
    department: null,
    consoleMode: "default",
    stockScope: {
      mode: "ALL",
      stockScope: null,
      stockScopeName: null,
    },
    workshopScope: {
      mode: "ALL",
      workshopId: null,
      workshopName: null,
    },
  } satisfies SessionUserSnapshot;

  const buildController = () => {
    const reportingService = {
      getHomeDashboard: jest.fn().mockResolvedValue({}),
      getInventorySummary: jest.fn().mockResolvedValue({ items: [], total: 0 }),
      getMaterialCategorySummary: jest
        .fn()
        .mockResolvedValue({ items: [], total: 0 }),
      getTrendSeries: jest.fn(),
      exportReport: jest.fn(),
    };
    const monthlyReportingService = {
      getMonthlyReportSummary: jest.fn(),
      getMonthlyReportDocuments: jest.fn(),
      exportMonthlyReport: jest.fn(),
    };
    const workshopScopeService = {
      resolveInventoryQueryScope: jest.fn().mockResolvedValue({
        stockScopeId: 2,
        stockScope: "RD_SUB",
        stockScopeName: "研发小仓",
      }),
      resolveInventoryQueryWorkshopId: jest.fn(),
    };

    return {
      controller: new ReportingController(
        reportingService as never,
        monthlyReportingService as never,
        workshopScopeService as never,
      ),
      reportingService,
      workshopScopeService,
    };
  };

  it("passes explicit RD_SUB scope to the home dashboard", async () => {
    const { controller, reportingService, workshopScopeService } =
      buildController();

    await controller.getHomeDashboard({ stockScope: "RD_SUB" }, user);

    expect(
      workshopScopeService.resolveInventoryQueryScope,
    ).toHaveBeenCalledWith(user, undefined, "RD_SUB");
    expect(reportingService.getHomeDashboard).toHaveBeenCalledWith("RD_SUB");
  });

  it("passes explicit RD_SUB scope to inventory summary", async () => {
    const { controller, reportingService, workshopScopeService } =
      buildController();

    await controller.getInventorySummary({ stockScope: "RD_SUB" }, user);

    expect(
      workshopScopeService.resolveInventoryQueryScope,
    ).toHaveBeenCalledWith(user, undefined, "RD_SUB");
    expect(reportingService.getInventorySummary).toHaveBeenCalledWith({
      stockScope: "RD_SUB",
    });
  });

  it("passes explicit RD_SUB scope to material category summary", async () => {
    const { controller, reportingService, workshopScopeService } =
      buildController();

    await controller.getMaterialCategorySummary({ stockScope: "RD_SUB" }, user);

    expect(
      workshopScopeService.resolveInventoryQueryScope,
    ).toHaveBeenCalledWith(user, undefined, "RD_SUB");
    expect(reportingService.getMaterialCategorySummary).toHaveBeenCalledWith({
      stockScope: "RD_SUB",
    });
  });
});
