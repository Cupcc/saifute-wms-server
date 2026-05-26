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
