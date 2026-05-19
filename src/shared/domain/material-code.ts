const MATERIAL_CODE_WHITESPACE_PATTERN = /\s+/gu;
const SEQUENTIAL_MATERIAL_CODE_PATTERN =
  /^(?<prefix>[A-Za-z]+)(?<sequence>\d+)$/u;

interface SequentialMaterialCode {
  prefix: string;
  sequence: number;
}

export function normalizeMaterialCode(value: string): string {
  return value.trim().replace(MATERIAL_CODE_WHITESPACE_PATTERN, "");
}

export function normalizeOptionalMaterialCode(
  value: string | null | undefined,
): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = normalizeMaterialCode(value);
  return normalized.length > 0 ? normalized : null;
}

export function parseSequentialMaterialCode(
  value: string,
): SequentialMaterialCode | null {
  const match = SEQUENTIAL_MATERIAL_CODE_PATTERN.exec(
    normalizeMaterialCode(value),
  );
  const sequence = Number(match?.groups?.sequence ?? Number.NaN);

  if (!match?.groups?.prefix || !Number.isSafeInteger(sequence)) {
    return null;
  }

  return {
    prefix: match.groups.prefix,
    sequence,
  };
}

export function buildNextSequentialMaterialCode(
  seedCode: string,
  usedCodes: Iterable<string>,
): string | null {
  const seed = parseSequentialMaterialCode(seedCode);
  if (!seed) {
    return null;
  }

  let maxSequence = seed.sequence;
  const seedPrefixKey = seed.prefix.toLocaleLowerCase("en-US");
  for (const usedCode of usedCodes) {
    const used = parseSequentialMaterialCode(usedCode);
    if (
      used &&
      used.prefix.toLocaleLowerCase("en-US") === seedPrefixKey &&
      used.sequence > maxSequence
    ) {
      maxSequence = used.sequence;
    }
  }

  return `${seed.prefix}${maxSequence + 1}`;
}
