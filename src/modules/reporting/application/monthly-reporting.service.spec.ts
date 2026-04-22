import { Test } from "@nestjs/testing";
import {
  type MonthlyReportDomainDocumentsResult,
  type MonthlyReportDomainSummaryResult,
  MonthlyReportDomainSummaryService,
} from "./monthly-report-domain-summary.service";
import {
  type MonthlyReportExportResult,
  MonthlyReportExportService,
} from "./monthly-report-export.service";
import {
  type MonthlyReportMaterialCategoryDocumentsResult,
  type MonthlyReportMaterialCategorySummaryResult,
  MonthlyReportMaterialCategoryService,
} from "./monthly-report-material-category.service";
import { MonthlyReportingService } from "./monthly-reporting.service";
import { MonthlyReportingViewMode } from "./monthly-reporting.shared";

describe("MonthlyReportingService (facade)", () => {
  let service: MonthlyReportingService;
  let domainSummaryService: {
    getDomainSummary: jest.Mock;
    getDomainDocuments: jest.Mock;
  };
  let materialCategoryService: {
    getMaterialCategorySummary: jest.Mock;
    getMaterialCategoryDocuments: jest.Mock;
  };
  let exportService: {
    exportMonthlyReport: jest.Mock;
  };

  beforeEach(async () => {
    domainSummaryService = {
      getDomainSummary: jest
        .fn()
        .mockResolvedValue({} as MonthlyReportDomainSummaryResult),
      getDomainDocuments: jest
        .fn()
        .mockResolvedValue({} as MonthlyReportDomainDocumentsResult),
    };
    materialCategoryService = {
      getMaterialCategorySummary: jest
        .fn()
        .mockResolvedValue({} as MonthlyReportMaterialCategorySummaryResult),
      getMaterialCategoryDocuments: jest
        .fn()
        .mockResolvedValue({} as MonthlyReportMaterialCategoryDocumentsResult),
    };
    exportService = {
      exportMonthlyReport: jest
        .fn()
        .mockResolvedValue({} as MonthlyReportExportResult),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        MonthlyReportingService,
        { provide: MonthlyReportDomainSummaryService, useValue: domainSummaryService },
        {
          provide: MonthlyReportMaterialCategoryService,
          useValue: materialCategoryService,
        },
        { provide: MonthlyReportExportService, useValue: exportService },
      ],
    }).compile();

    service = moduleRef.get(MonthlyReportingService);
  });

  it("delegates summary in DOMAIN mode to domainSummaryService", async () => {
    await service.getMonthlyReportSummary({ yearMonth: "2026-03" });
    expect(domainSummaryService.getDomainSummary).toHaveBeenCalledWith({
      yearMonth: "2026-03",
    });
    expect(
      materialCategoryService.getMaterialCategorySummary,
    ).not.toHaveBeenCalled();
  });

  it("delegates summary in MATERIAL_CATEGORY mode to materialCategoryService", async () => {
    await service.getMonthlyReportSummary({
      yearMonth: "2026-03",
      viewMode: MonthlyReportingViewMode.MATERIAL_CATEGORY,
    });
    expect(
      materialCategoryService.getMaterialCategorySummary,
    ).toHaveBeenCalled();
    expect(domainSummaryService.getDomainSummary).not.toHaveBeenCalled();
  });

  it("delegates documents by viewMode", async () => {
    await service.getMonthlyReportDocuments({ yearMonth: "2026-03" });
    expect(domainSummaryService.getDomainDocuments).toHaveBeenCalled();

    await service.getMonthlyReportDocuments({
      yearMonth: "2026-03",
      viewMode: MonthlyReportingViewMode.MATERIAL_CATEGORY,
    });
    expect(
      materialCategoryService.getMaterialCategoryDocuments,
    ).toHaveBeenCalled();
  });

  it("delegates export to exportService", async () => {
    await service.exportMonthlyReport({ yearMonth: "2026-03" });
    expect(exportService.exportMonthlyReport).toHaveBeenCalledWith({
      yearMonth: "2026-03",
    });
  });
});
