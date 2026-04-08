import { ConflictException } from "@nestjs/common";
import { Prisma } from "../../generated/prisma/client";

const DEFAULT_MAX_ATTEMPTS = 8;

function padTwo(value: number) {
  return String(value).padStart(2, "0");
}

function datePart(date: Date) {
  return `${date.getFullYear()}${padTwo(date.getMonth() + 1)}${padTwo(
    date.getDate(),
  )}`;
}

function timePart(date: Date) {
  return `${padTwo(date.getHours())}${padTwo(date.getMinutes())}${padTwo(
    date.getSeconds(),
  )}`;
}

function randomPart(attempt: number, length = 3) {
  const upper = 10 ** length;
  const randomSeed = Math.floor(Math.random() * upper);
  return String((randomSeed + attempt) % upper).padStart(length, "0");
}

export function buildCompactDocumentNo(
  prefix: string,
  bizDate: Date,
  attempt = 0,
) {
  return `${prefix}${datePart(bizDate)}${timePart(new Date())}${randomPart(attempt)}`;
}

export function buildDashedTimestampDocumentNo(
  prefix: string,
  bizDate: Date,
  attempt = 0,
) {
  return `${prefix}-${datePart(bizDate)}${timePart(new Date())}-${randomPart(attempt)}`;
}

function includesDocumentNoTarget(target: string) {
  const normalized = target.toLowerCase();
  return (
    normalized.includes("documentno") ||
    normalized.includes("document_no") ||
    (normalized.includes("document") && normalized.includes("no"))
  );
}

export function isDocumentNoUniqueConflict(error: unknown) {
  if (
    !(error instanceof Prisma.PrismaClientKnownRequestError) ||
    error.code !== "P2002"
  ) {
    return false;
  }
  const target = (error.meta as { target?: unknown } | undefined)?.target;
  if (Array.isArray(target)) {
    return target.some(
      (item) => typeof item === "string" && includesDocumentNoTarget(item),
    );
  }
  if (typeof target === "string") {
    return includesDocumentNoTarget(target);
  }
  return false;
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
