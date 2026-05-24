const PROJECT_CODE_PREFIX = "XMBH";
let pendingProjectCodeSequence = 0;

export function buildProjectCode(sequenceId: number): string {
  if (!Number.isInteger(sequenceId) || sequenceId <= 0) {
    throw new Error(`Invalid project sequence id: ${sequenceId}`);
  }
  return `${PROJECT_CODE_PREFIX}-${sequenceId}`;
}

export function buildPendingProjectCode(scope: string): string {
  pendingProjectCodeSequence = (pendingProjectCodeSequence % 1_000_000) + 1;
  return `__PENDING_${scope}_${Date.now()}_${pendingProjectCodeSequence}`;
}
