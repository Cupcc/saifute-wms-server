import { formatYearMonth, isSameYearMonth } from "./monthly-reporting.shared";

describe("monthly-reporting shared helpers", () => {
  it("formats yearMonth using the provided business timezone", () => {
    const boundary = new Date("2026-03-31T16:30:00.000Z");

    expect(formatYearMonth(boundary, "UTC")).toBe("2026-03");
    expect(formatYearMonth(boundary, "Asia/Shanghai")).toBe("2026-04");
  });

  it("compares yearMonth using the provided business timezone", () => {
    const beforeBoundary = new Date("2026-03-31T15:30:00.000Z");
    const afterBoundary = new Date("2026-03-31T16:30:00.000Z");

    expect(isSameYearMonth(beforeBoundary, afterBoundary, "UTC")).toBe(true);
    expect(
      isSameYearMonth(beforeBoundary, afterBoundary, "Asia/Shanghai"),
    ).toBe(false);
  });
});
