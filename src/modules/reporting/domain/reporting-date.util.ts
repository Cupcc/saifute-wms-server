/**
 * Pure date/timezone utility functions for the reporting module.
 *
 * These are stateless helpers that operate on the business timezone
 * configured in AppConfigService. Extracted from ReportingService to
 * keep the application layer focused on orchestration.
 */

export function resolveTodayRange(businessTimezone: string) {
  const now = new Date();
  const parts = getTimeZoneDateParts(now, businessTimezone);
  const start = createDateInBusinessTimezone(
    businessTimezone,
    parts.year,
    parts.month,
    parts.day,
  );
  const end = createDateInBusinessTimezone(
    businessTimezone,
    parts.year,
    parts.month,
    parts.day,
    23,
    59,
    59,
    999,
  );
  return { start, end };
}

export function resolveDateRange(
  businessTimezone: string,
  dateFrom?: string,
  dateTo?: string,
) {
  const endParts = dateTo
    ? parseDateOnly(dateTo)
    : getTimeZoneDateParts(new Date(), businessTimezone);
  const end = createDateInBusinessTimezone(
    businessTimezone,
    endParts.year,
    endParts.month,
    endParts.day,
    23,
    59,
    59,
    999,
  );

  const startParts = dateFrom
    ? parseDateOnly(dateFrom)
    : getTimeZoneDateParts(
        new Date(end.getTime() - 6 * 24 * 60 * 60 * 1000),
        businessTimezone,
      );
  const start = createDateInBusinessTimezone(
    businessTimezone,
    startParts.year,
    startParts.month,
    startParts.day,
  );
  return { dateFrom: start, dateTo: end };
}

export function toDateOnly(value: Date, businessTimezone: string) {
  const parts = getTimeZoneDateParts(value, businessTimezone);
  return `${parts.year}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;
}

export function parseDateOnly(value: string): {
  year: number;
  month: number;
  day: number;
} {
  const [year, month, day] = value.split("-").map((item) => Number(item));
  return {
    year,
    month,
    day,
  };
}

export function getTimeZoneDateParts(
  value: Date,
  businessTimezone: string,
): {
  year: number;
  month: number;
  day: number;
} {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: businessTimezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = formatter.formatToParts(value);

  return {
    year: Number(parts.find((part) => part.type === "year")?.value),
    month: Number(parts.find((part) => part.type === "month")?.value),
    day: Number(parts.find((part) => part.type === "day")?.value),
  };
}

export function createDateInBusinessTimezone(
  businessTimezone: string,
  year: number,
  month: number,
  day: number,
  hour = 0,
  minute = 0,
  second = 0,
  millisecond = 0,
): Date {
  const utcGuess = Date.UTC(
    year,
    month - 1,
    day,
    hour,
    minute,
    second,
    millisecond,
  );
  const offset = getTimeZoneOffsetMilliseconds(
    new Date(utcGuess),
    businessTimezone,
  );
  return new Date(utcGuess - offset);
}

function getTimeZoneOffsetMilliseconds(
  value: Date,
  businessTimezone: string,
): number {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: businessTimezone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const parts = formatter.formatToParts(value);
  const year = Number(parts.find((part) => part.type === "year")?.value);
  const month = Number(parts.find((part) => part.type === "month")?.value);
  const day = Number(parts.find((part) => part.type === "day")?.value);
  const hour = Number(parts.find((part) => part.type === "hour")?.value);
  const minute = Number(parts.find((part) => part.type === "minute")?.value);
  const second = Number(parts.find((part) => part.type === "second")?.value);

  return (
    Date.UTC(year, month - 1, day, hour, minute, second) -
    value.getTime() +
    value.getMilliseconds()
  );
}
