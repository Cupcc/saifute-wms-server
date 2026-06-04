import { Prisma } from "../../../generated/prisma/client";

export const SALES_PROJECT_CODE_PREFIX = "XMBH";
export const RD_PROJECT_CODE_PREFIX = "YFXMBH";
let pendingProjectCodeSequence = 0;

function buildProjectCode(sequenceId: number, prefix: string): string {
  if (!Number.isInteger(sequenceId) || sequenceId <= 0) {
    throw new Error(`Invalid project sequence id: ${sequenceId}`);
  }
  return `${prefix}-${sequenceId}`;
}

export function buildSalesProjectCode(sequenceId: number): string {
  return buildProjectCode(sequenceId, SALES_PROJECT_CODE_PREFIX);
}

export function buildRdProjectCode(sequenceId: number): string {
  return buildProjectCode(sequenceId, RD_PROJECT_CODE_PREFIX);
}

export function buildPendingProjectCode(scope: string): string {
  pendingProjectCodeSequence = (pendingProjectCodeSequence % 1_000_000) + 1;
  return `__PENDING_${scope}_${Date.now()}_${pendingProjectCodeSequence}`;
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

function includesProjectCodeTarget(target: string) {
  const normalized = target.toLowerCase();
  return (
    normalized.includes("salesprojectcode") ||
    normalized.includes("sales_project_code") ||
    normalized.includes("projectcode") ||
    normalized.includes("project_code") ||
    normalized.includes("target_code")
  );
}

export function isProjectCodeUniqueConflict(error: unknown) {
  if (
    !(error instanceof Prisma.PrismaClientKnownRequestError) ||
    error.code !== "P2002"
  ) {
    return false;
  }

  return collectUniqueConflictTargets(error).some(includesProjectCodeTarget);
}
