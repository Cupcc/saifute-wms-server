import { resolveDateRange, resolveTodayRange } from "./reporting-date.util";

describe("reporting date ranges", () => {
  it("queries database DATE columns without shifting the requested business day", () => {
    const result = resolveDateRange(
      "Asia/Shanghai",
      "2026-07-01",
      "2026-07-31",
    );

    expect(result.dateFrom.toISOString()).toBe("2026-07-01T00:00:00.000Z");
    expect(result.dateTo.toISOString()).toBe("2026-07-31T00:00:00.000Z");
  });

  it("maps the current business day directly to a database DATE value", () => {
    jest.useFakeTimers().setSystemTime(new Date("2026-07-29T16:30:00.000Z"));

    try {
      const result = resolveTodayRange("Asia/Shanghai");

      expect(result.start.toISOString()).toBe("2026-07-30T00:00:00.000Z");
      expect(result.end.toISOString()).toBe("2026-07-30T00:00:00.000Z");
    } finally {
      jest.useRealTimers();
    }
  });
});
