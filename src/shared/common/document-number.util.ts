import { ConflictException } from "@nestjs/common";
import { Prisma } from "../../../generated/prisma/client";

const DEFAULT_MAX_ATTEMPTS = 999;
const DAILY_SEQUENCE_MAX = 999;

const FIXED_PREFIX_BY_LEGACY_PREFIX: Record<string, string> = {
  TGC: "TG",
  XSTH: "XT",
  RDPUR: "RQ",
  RDH: "RH",
  RDST: "RP",
  RAP: "RL",
  RAR: "RR",
  RAS: "RS",
};

function padTwo(value: number) {
  return String(value).padStart(2, "0");
}

function datePart(date: Date) {
  return `${date.getFullYear()}${padTwo(date.getMonth() + 1)}${padTwo(
    date.getDate(),
  )}`;
}

function normalizeDocumentPrefix(prefix: string) {
  const normalizedPrefix = prefix.trim().toUpperCase();
  const fixedPrefix =
    FIXED_PREFIX_BY_LEGACY_PREFIX[normalizedPrefix] ?? normalizedPrefix;
  return fixedPrefix.slice(0, 2).padEnd(2, "X");
}

export function buildDailyDocumentNoStem(prefix: string, bizDate: Date) {
  return `${normalizeDocumentPrefix(prefix)}${datePart(bizDate)}`;
}

export function buildDailySequenceDocumentNo(
  prefix: string,
  bizDate: Date,
  sequence: number,
) {
  if (
    !Number.isInteger(sequence) ||
    sequence < 1 ||
    sequence > DAILY_SEQUENCE_MAX
  ) {
    throw new ConflictException("单据编号当日流水已满");
  }
  return `${buildDailyDocumentNoStem(prefix, bizDate)}${String(
    sequence,
  ).padStart(3, "0")}`;
}

export function buildCompactDocumentNo(
  prefix: string,
  bizDate: Date,
  attempt = 0,
) {
  return buildDailySequenceDocumentNo(prefix, bizDate, attempt + 1);
}

export function buildDashedTimestampDocumentNo(
  prefix: string,
  bizDate: Date,
  attempt = 0,
) {
  return buildDailySequenceDocumentNo(prefix, bizDate, attempt + 1);
}

function includesDocumentNoTarget(target: string) {
  const normalized = target.toLowerCase();
  return (
    normalized.includes("documentno") ||
    normalized.includes("document_no") ||
    (normalized.includes("document") && normalized.includes("no"))
  );
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : null;
}

function appendTargetValues(targets: string[], value: unknown): void {
  if (Array.isArray(value)) {
    for (const item of value) {
      appendTargetValues(targets, item);
    }
    return;
  }
  if (typeof value === "string" && value.length > 0) {
    targets.push(value);
  }
}

function collectUniqueConflictTargets(
  error: Prisma.PrismaClientKnownRequestError,
) {
  const targets: string[] = [];
  const meta = asRecord(error.meta);
  appendTargetValues(targets, meta?.target);

  const driverAdapterError = asRecord(meta?.driverAdapterError);
  const driverCause = asRecord(driverAdapterError?.cause);
  const constraint = asRecord(driverCause?.constraint);
  appendTargetValues(targets, constraint?.index);
  appendTargetValues(targets, constraint?.fields);
  appendTargetValues(targets, driverCause?.originalMessage);
  appendTargetValues(targets, error.message);

  return targets;
}

export function isDocumentNoUniqueConflict(error: unknown) {
  if (
    !(error instanceof Prisma.PrismaClientKnownRequestError) ||
    error.code !== "P2002"
  ) {
    return false;
  }

  return collectUniqueConflictTargets(error).some(includesDocumentNoTarget);
}

export async function createWithGeneratedDocumentNo<T>(
  create: (attempt: number) => Promise<T>,
  maxAttempts = DEFAULT_MAX_ATTEMPTS,
) {
  let documentNoConflict = false;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      return await create(attempt);
    } catch (error) {
      if (!isDocumentNoUniqueConflict(error)) {
        throw error;
      }
      documentNoConflict = true;
    }
  }
  if (documentNoConflict) {
    throw new ConflictException("单据编号冲突，请稍后重试");
  }
  throw new ConflictException("单据创建失败，请稍后重试");
}
