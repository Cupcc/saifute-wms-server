export interface SliceTargetState {
  targetTable: string;
  batchOwnedTargetRows: number;
  batchMapRows: number;
}

export interface SliceMapIntegrityState {
  targetTable: string;
  missingMappedTargets: number;
}

export interface SliceMapConsistencyState {
  targetTable: string;
  missingExpectedMapRows: number;
  unexpectedMapRows: number;
  mismatchedTargetCodes: number;
  mismatchedActualTargetCodes: number;
}

export interface LineBackfillDriftState {
  isRerun: boolean;
  missingTargetLines: number;
  mismatchedStartNumbers: number;
  mismatchedEndNumbers: number;
}

export interface DownstreamConsumerState {
  hasBatchOwnership: boolean;
  consumerCounts: Record<string, number>;
}

export interface ExistingCollisionState {
  targetTable: string;
  existingUnownedCollisions: number;
}

export function buildSliceDirtyTargetBlockers(
  state: SliceTargetState,
): Array<Record<string, unknown>> {
  if (state.batchOwnedTargetRows === 0 && state.batchMapRows === 0) {
    return [];
  }

  if (state.batchOwnedTargetRows === state.batchMapRows) {
    return [];
  }

  return [
    {
      reason:
        "Batch-owned reservation target rows and this batch's staging map rows differ, so execute would run against a dirty slice baseline.",
      targetTable: state.targetTable,
      batchOwnedTargetRows: state.batchOwnedTargetRows,
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
        "This batch's reservation map rows point at missing target rows, so execute would run against an inconsistent slice baseline.",
      targetTable: state.targetTable,
      missingMappedTargets: state.missingMappedTargets,
    },
  ];
}

export function buildMapConsistencyBlockers(
  state: SliceMapConsistencyState,
): Array<Record<string, unknown>> {
  if (
    state.missingExpectedMapRows === 0 &&
    state.unexpectedMapRows === 0 &&
    state.mismatchedTargetCodes === 0 &&
    state.mismatchedActualTargetCodes === 0
  ) {
    return [];
  }

  return [
    {
      reason:
        "This batch's reservation staging map rows do not match the deterministic plan, so rerun cleanup would be unsafe.",
      targetTable: state.targetTable,
      missingExpectedMapRows: state.missingExpectedMapRows,
      unexpectedMapRows: state.unexpectedMapRows,
      mismatchedTargetCodes: state.mismatchedTargetCodes,
      mismatchedActualTargetCodes: state.mismatchedActualTargetCodes,
    },
  ];
}

export function buildLineBackfillDriftBlockers(
  state: LineBackfillDriftState,
): Array<Record<string, unknown>> {
  if (!state.isRerun) {
    return [];
  }

  if (
    state.missingTargetLines === 0 &&
    state.mismatchedStartNumbers === 0 &&
    state.mismatchedEndNumbers === 0
  ) {
    return [];
  }

  return [
    {
      reason:
        "Already-owned outbound line start/end values drift from the deterministic reservation plan, so rerun cleanup would overwrite non-matching line state.",
      missingTargetLines: state.missingTargetLines,
      mismatchedStartNumbers: state.mismatchedStartNumbers,
      mismatchedEndNumbers: state.mismatchedEndNumbers,
    },
  ];
}

export function buildDownstreamConsumerBlockers(
  state: DownstreamConsumerState,
): Array<Record<string, unknown>> {
  const activeConsumers = Object.entries(state.consumerCounts).filter(
    ([, count]) => count > 0,
  );

  if (activeConsumers.length === 0) {
    return [];
  }

  return [
    {
      reason: state.hasBatchOwnership
        ? "Outbound reservation rerun is blocked because downstream tables already exist for later relation, audit, or inventory slices."
        : "Outbound reservation execute is blocked because downstream relation, audit, or inventory slices already observed the current outbound baseline before this batch owned any reservation rows.",
      downstreamConsumers: Object.fromEntries(activeConsumers),
    },
  ];
}

export function buildExistingCollisionBlockers(
  state: ExistingCollisionState,
): Array<Record<string, unknown>> {
  if (state.existingUnownedCollisions === 0) {
    return [];
  }

  return [
    {
      reason:
        "This slice's deterministic reservation keys already exist in factory_number_reservation without current batch ownership.",
      targetTable: state.targetTable,
      existingUnownedCollisions: state.existingUnownedCollisions,
    },
  ];
}
