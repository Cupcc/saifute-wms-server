import { BadRequestException } from "@nestjs/common";

export type FactoryNumberRange = {
  startNumber: string;
  endNumber: string;
};

export type ParsedFactoryNumberRanges = {
  ranges: FactoryNumberRange[];
  invalidSegments: string[];
};

function splitFactoryNumberSegments(value: string) {
  return value
    .split(/[,，/、\\]+/)
    .map((segment) => segment.trim())
    .filter(Boolean);
}

function parseFactoryNumberSegment(segment: string): FactoryNumberRange | null {
  const parts = segment.split("-").map((part) => part.trim());

  if (parts.length === 1 && /^\d+$/.test(parts[0])) {
    return {
      startNumber: parts[0],
      endNumber: parts[0],
    };
  }

  if (parts.length === 2 && /^\d+$/.test(parts[0]) && /^\d+$/.test(parts[1])) {
    const start = Number(parts[0]);
    const end = Number(parts[1]);
    if (
      Number.isSafeInteger(start) &&
      Number.isSafeInteger(end) &&
      start <= end
    ) {
      return {
        startNumber: parts[0],
        endNumber: parts[1],
      };
    }
  }

  return null;
}

export function formatFactoryNumberExpression(
  startNumber?: string | null,
  endNumber?: string | null,
) {
  const start = startNumber?.trim() ?? "";
  const end = endNumber?.trim() ?? "";
  if (start && end) {
    return start === end ? start : `${start}-${end}`;
  }
  return start || end;
}

export function parseFactoryNumberRanges(
  startNumber?: string | null,
  endNumber?: string | null,
): ParsedFactoryNumberRanges {
  const expression = formatFactoryNumberExpression(startNumber, endNumber);
  const ranges: FactoryNumberRange[] = [];
  const invalidSegments: string[] = [];

  for (const segment of splitFactoryNumberSegments(expression)) {
    const parsed = parseFactoryNumberSegment(segment);
    if (parsed) {
      ranges.push(parsed);
    } else {
      invalidSegments.push(segment);
    }
  }

  return { ranges, invalidSegments };
}

export function hasFactoryNumberExpression(
  startNumber?: string | null,
  endNumber?: string | null,
) {
  return Boolean(formatFactoryNumberExpression(startNumber, endNumber));
}

function countFactoryNumberRanges(ranges: FactoryNumberRange[]) {
  return ranges.reduce(
    (sum, range) =>
      sum + Number(range.endNumber) - Number(range.startNumber) + 1,
    0,
  );
}

export function assertFactoryNumberQuantityMatches(line: {
  lineNo?: number;
  quantity: { toString(): string };
  startNumber?: string | null;
  endNumber?: string | null;
}) {
  const ranges = resolveFactoryNumberRangesOrThrow(line);
  if (ranges.length === 0) {
    return;
  }

  const expectedQuantity = countFactoryNumberRanges(ranges);
  const actualQuantity = Number(line.quantity.toString());
  if (!Number.isFinite(actualQuantity) || actualQuantity !== expectedQuantity) {
    throw new BadRequestException(
      `第 ${line.lineNo ?? "-"} 行编号数量与出库数量不一致: 编号数量=${expectedQuantity}, 出库数量=${line.quantity.toString()}`,
    );
  }
}

export function resolveFactoryNumberRangesOrThrow(line: {
  lineNo?: number;
  startNumber?: string | null;
  endNumber?: string | null;
}) {
  const { ranges, invalidSegments } = parseFactoryNumberRanges(
    line.startNumber,
    line.endNumber,
  );
  if (invalidSegments.length > 0) {
    throw new BadRequestException(
      `第 ${line.lineNo ?? "-"} 行编号格式不正确: ${invalidSegments.join(", ")}`,
    );
  }
  return ranges;
}
