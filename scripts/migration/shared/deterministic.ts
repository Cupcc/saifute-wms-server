export const DEFAULT_WORKSHOP_CODE = "WS-LEGACY-DEFAULT";
export const DEFAULT_WORKSHOP_NAME = "默认车间";

export interface DeterministicCodeCandidate {
  legacyId: number;
  isActive: boolean;
  sourceCode: string | null | undefined;
}

export interface DeterministicRewrite {
  originalCode: string;
  keptLegacyId: number;
  rewritten: Array<{
    legacyId: number;
    rewrittenCode: string;
  }>;
}

export interface DeterministicCodeResolution {
  codeByLegacyId: Map<number, string>;
  rewrites: DeterministicRewrite[];
}

const MAX_TARGET_CODE_LENGTH = 64;

export function buildLegacyWorkshopCode(legacyId: number): string {
  return `WS-LEGACY-${legacyId}`;
}

export function buildFallbackCode(prefix: string, legacyId: number): string {
  return `${prefix}-${legacyId}`;
}

export function normalizeOptionalText(
  value: string | number | null | undefined,
): string | null {
  if (value === null || value === undefined) {
    return null;
  }

  const normalized = String(value).trim();
  return normalized.length > 0 ? normalized : null;
}

export function hasMeaningfulText(
  value: string | number | null | undefined,
): boolean {
  return normalizeOptionalText(value) !== null;
}

export function sortByActiveFirstThenLegacyId(
  left: Pick<DeterministicCodeCandidate, "isActive" | "legacyId">,
  right: Pick<DeterministicCodeCandidate, "isActive" | "legacyId">,
): number {
  const leftRank = left.isActive ? 0 : 1;
  const rightRank = right.isActive ? 0 : 1;

  if (leftRank !== rightRank) {
    return leftRank - rightRank;
  }

  return left.legacyId - right.legacyId;
}

function normalizeCodeForUniqueConstraint(code: string): string {
  return code
    .trim()
    .normalize("NFKD")
    .replace(/\p{Mark}/gu, "")
    .toLocaleLowerCase("en-US");
}

function buildTrimmedCodeWithSuffix(baseCode: string, suffix: string): string {
  const maxBaseLength = MAX_TARGET_CODE_LENGTH - suffix.length;

  if (maxBaseLength <= 0) {
    throw new Error(
      `Deterministic suffix ${suffix} exceeds target code length.`,
    );
  }

  return `${baseCode.slice(0, maxBaseLength)}${suffix}`;
}

function allocateUniqueCode(
  seedCode: string,
  reservedKeys: ReadonlySet<string>,
  assignedKeys: Set<string>,
): string {
  let attempt = 0;

  while (true) {
    const candidateCode =
      attempt === 0
        ? seedCode
        : buildTrimmedCodeWithSuffix(seedCode, `-DUP-${attempt}`);
    const candidateKey = normalizeCodeForUniqueConstraint(candidateCode);

    if (!reservedKeys.has(candidateKey) && !assignedKeys.has(candidateKey)) {
      assignedKeys.add(candidateKey);
      return candidateCode;
    }

    attempt += 1;
  }
}

export function resolveDeterministicCodes(
  candidates: readonly DeterministicCodeCandidate[],
  fallbackPrefix: string,
): DeterministicCodeResolution {
  const groupedCandidates = new Map<
    string,
    Array<DeterministicCodeCandidate & { preferredCode: string }>
  >();

  for (const candidate of candidates) {
    const preferredCode =
      normalizeOptionalText(candidate.sourceCode) ??
      buildFallbackCode(fallbackPrefix, candidate.legacyId);
    const uniqueKey = normalizeCodeForUniqueConstraint(preferredCode);
    const existingGroup = groupedCandidates.get(uniqueKey) ?? [];
    existingGroup.push({
      ...candidate,
      preferredCode,
    });
    groupedCandidates.set(uniqueKey, existingGroup);
  }

  const reservedSourceKeys = new Set(groupedCandidates.keys());
  const sortedGroupKeys = Array.from(groupedCandidates.keys()).sort(
    (left, right) => left.localeCompare(right),
  );
  const codeByLegacyId = new Map<number, string>();
  const rewrites: DeterministicRewrite[] = [];
  const assignedKeys = new Set<string>();

  for (const groupKey of sortedGroupKeys) {
    const group = [...(groupedCandidates.get(groupKey) ?? [])].sort(
      sortByActiveFirstThenLegacyId,
    );
    const [keeper, ...duplicates] = group;

    if (!keeper) {
      continue;
    }

    codeByLegacyId.set(keeper.legacyId, keeper.preferredCode);
    assignedKeys.add(groupKey);

    if (duplicates.length === 0) {
      continue;
    }

    const rewritten = duplicates.map((duplicate) => {
      const rewrittenCode = allocateUniqueCode(
        buildTrimmedCodeWithSuffix(
          keeper.preferredCode,
          `-LEGACY-${duplicate.legacyId}`,
        ),
        reservedSourceKeys,
        assignedKeys,
      );
      codeByLegacyId.set(duplicate.legacyId, rewrittenCode);
      return {
        legacyId: duplicate.legacyId,
        rewrittenCode,
      };
    });

    rewrites.push({
      originalCode: keeper.preferredCode,
      keptLegacyId: keeper.legacyId,
      rewritten,
    });
  }

  return {
    codeByLegacyId,
    rewrites,
  };
}

function sortObjectKeys(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((entry) => sortObjectKeys(entry));
  }

  if (value && typeof value === "object") {
    const sortedEntries = Object.entries(value as Record<string, unknown>)
      .filter(([, entryValue]) => entryValue !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entryValue]) => [key, sortObjectKeys(entryValue)] as const);

    return Object.fromEntries(sortedEntries);
  }

  return value;
}

export function stableJsonStringify(value: unknown): string {
  return JSON.stringify(sortObjectKeys(value), null, 2);
}
