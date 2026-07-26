import { ValidationPipe } from "@nestjs/common";
import { QueryMonthlyReportingDto } from "./query-reporting.dto";

describe("QueryMonthlyReportingDto", () => {
  const pipe = new ValidationPipe({
    transform: true,
    whitelist: true,
    forbidNonWhitelisted: true,
  });

  it("accepts material filters on monthly reporting summary queries", async () => {
    const result = (await pipe.transform(
      {
        yearMonth: "2026-03",
        viewMode: "MATERIAL_CATEGORY",
        keyword: "化工",
        materialId: "501",
      },
      {
        type: "query",
        metatype: QueryMonthlyReportingDto,
      },
    )) as QueryMonthlyReportingDto;

    expect(result.keyword).toBe("化工");
    expect(result.materialId).toBe(501);
  });
});
