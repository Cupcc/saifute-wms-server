export interface SliceTargetState {
  targetTable: string;
  targetRows: number;
  batchMapRows: number;
}

export interface SliceMapIntegrityState {
  targetTable: string;
  missingMappedTargets: number;
}

export interface DownstreamConsumerState {
  isRerun: boolean;
  consumerCounts: Record<string, number>;
}

/**
 * Pending relation state used to verify that batch-owned pending_relations
 * were properly cleaned and re-written after a rerun.
 */
export interface PendingRelationCleanupState {
  expectedPendingRelationCount: number;
  actualPendingRelationCount: number;
}

export function buildSliceDirtyTargetBlockers(
  state: SliceTargetState,
): Array<Record<string, unknown>> {
  if (state.targetRows === 0 && state.batchMapRows === 0) {
    return [];
  }

  if (state.targetRows === state.batchMapRows) {
    return [];
  }

  return [
    {
      reason:
        "Target table rows and this batch's staging map rows differ, so execute would run against a dirty slice target.",
      targetTable: state.targetTable,
      targetRows: state.targetRows,
      batchMapRows: state.batchMapRows,
    },
  ];
}

export function buildMissingMapTargetBlockers(
  state: SliceMapIntegrityState,
): Array<Record<string, unknown>> {
  if (state.missingMappedTargets === 0) {
    return [];
  }

  return [
    {
      reason:
        "This batch's staging map rows point at missing target rows, so execute would run against an inconsistent slice baseline.",
      targetTable: state.targetTable,
      missingMappedTargets: state.missingMappedTargets,
    },
  ];
}

export function buildDownstreamConsumerBlockers(
  state: DownstreamConsumerState,
): Array<Record<string, unknown>> {
  if (!state.isRerun) {
    return [];
  }

  const activeConsumers = Object.entries(state.consumerCounts).filter(
    ([, count]) => count > 0,
  );

  if (activeConsumers.length === 0) {
    return [];
  }

  return [
    {
      reason:
        "Project rerun is blocked because downstream tables already reference Project rows or line ids.",
      downstreamConsumers: Object.fromEntries(activeConsumers),
    },
  ];
}

/**
 * After execute, pending_relations count must match the plan's expected pending
 * line count.  A mismatch indicates an incomplete rerun cleanup or write failure.
 */
export function buildPendingRelationCountBlockers(
  state: PendingRelationCleanupState,
): Array<Record<string, unknown>> {
  if (state.actualPendingRelationCount === state.expectedPendingRelationCount) {
    return [];
  }

  return [
    {
      reason:
        "pending_relations count does not match the deterministic plan's expected pending line count.",
      expectedPendingRelationCount: state.expectedPendingRelationCount,
      actualPendingRelationCount: state.actualPendingRelationCount,
    },
  ];
}
