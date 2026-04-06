import {
  buildDownstreamConsumerBlockers,
  buildExistingCollisionBlockers,
  buildLineBackfillDriftBlockers,
  buildMapConsistencyBlockers,
  buildMissingMapTargetBlockers,
  buildSliceDirtyTargetBlockers,
} from "../../scripts/migration/customer-reservation/execute-guard";

describe("outbound reservation execute guard", () => {
  it("should allow a clean first run", () => {
    expect(
      buildSliceDirtyTargetBlockers({
        targetTable: "factory_number_reservation",
        batchOwnedTargetRows: 0,
        batchMapRows: 0,
      }),
    ).toEqual([]);
  });

  it("should allow a clean rerun when reservation rows match batch map rows", () => {
    expect(
      buildSliceDirtyTargetBlockers({
        targetTable: "factory_number_reservation",
        batchOwnedTargetRows: 4,
        batchMapRows: 4,
      }),
    ).toEqual([]);
  });

  it("should block execute when dirty reservation target rows exist", () => {
    expect(
      buildSliceDirtyTargetBlockers({
        targetTable: "factory_number_reservation",
        batchOwnedTargetRows: 5,
        batchMapRows: 4,
      }),
    ).toEqual([
      expect.objectContaining({
        targetTable: "factory_number_reservation",
        batchOwnedTargetRows: 5,
        batchMapRows: 4,
      }),
    ]);
  });

  it("should block execute when reservation map rows point at missing targets", () => {
    expect(
      buildMissingMapTargetBlockers({
        targetTable: "factory_number_reservation",
        missingMappedTargets: 2,
      }),
    ).toEqual([
      expect.objectContaining({
        targetTable: "factory_number_reservation",
        missingMappedTargets: 2,
      }),
    ]);
  });

  it("should allow execute when all reservation map targets still exist", () => {
    expect(
      buildMissingMapTargetBlockers({
        targetTable: "factory_number_reservation",
        missingMappedTargets: 0,
      }),
    ).toEqual([]);
  });

  it("should block execute when reservation map rows drift from the deterministic plan", () => {
    expect(
      buildMapConsistencyBlockers({
        targetTable: "factory_number_reservation",
        missingExpectedMapRows: 1,
        unexpectedMapRows: 0,
        mismatchedTargetCodes: 1,
        mismatchedActualTargetCodes: 1,
      }),
    ).toEqual([
      expect.objectContaining({
        targetTable: "factory_number_reservation",
        missingExpectedMapRows: 1,
        mismatchedTargetCodes: 1,
        mismatchedActualTargetCodes: 1,
      }),
    ]);
  });

  it("should allow execute when reservation map rows exactly match the deterministic plan", () => {
    expect(
      buildMapConsistencyBlockers({
        targetTable: "factory_number_reservation",
        missingExpectedMapRows: 0,
        unexpectedMapRows: 0,
        mismatchedTargetCodes: 0,
        mismatchedActualTargetCodes: 0,
      }),
    ).toEqual([]);
  });

  it("should block rerun when already-owned line backfills drift from the deterministic plan", () => {
    expect(
      buildLineBackfillDriftBlockers({
        isRerun: true,
        missingTargetLines: 1,
        mismatchedStartNumbers: 1,
        mismatchedEndNumbers: 0,
      }),
    ).toEqual([
      expect.objectContaining({
        missingTargetLines: 1,
        mismatchedStartNumbers: 1,
        mismatchedEndNumbers: 0,
      }),
    ]);
  });

  it("should allow first execute before any line backfills exist", () => {
    expect(
      buildLineBackfillDriftBlockers({
        isRerun: false,
        missingTargetLines: 0,
        mismatchedStartNumbers: 2,
        mismatchedEndNumbers: 2,
      }),
    ).toEqual([]);
  });

  it("should block rerun when downstream consumers already exist", () => {
    expect(
      buildDownstreamConsumerBlockers({
        hasBatchOwnership: true,
        consumerCounts: {
          document_relation: 1,
          document_line_relation: 0,
          audit_document: 0,
          inventory_balance: 0,
          inventory_log: 0,
          inventory_source_usage: 0,
        },
      }),
    ).toEqual([
      expect.objectContaining({
        reason: expect.stringContaining("rerun"),
        downstreamConsumers: {
          document_relation: 1,
        },
      }),
    ]);
  });

  it("should block late first execute when downstream consumers already exist", () => {
    expect(
      buildDownstreamConsumerBlockers({
        hasBatchOwnership: false,
        consumerCounts: {
          document_relation: 0,
          document_line_relation: 0,
          audit_document: 0,
          inventory_balance: 0,
          inventory_log: 1,
          inventory_source_usage: 0,
        },
      }),
    ).toEqual([
      expect.objectContaining({
        reason: expect.stringContaining(
          "before this batch owned any reservation rows",
        ),
        downstreamConsumers: {
          inventory_log: 1,
        },
      }),
    ]);
  });

  it("should allow execute when no downstream consumers exist", () => {
    expect(
      buildDownstreamConsumerBlockers({
        hasBatchOwnership: false,
        consumerCounts: {
          document_relation: 0,
          document_line_relation: 0,
          audit_document: 0,
          inventory_balance: 0,
          inventory_log: 0,
          inventory_source_usage: 0,
        },
      }),
    ).toEqual([]);
  });

  it("should block execute when deterministic reservation keys already exist without batch ownership", () => {
    expect(
      buildExistingCollisionBlockers({
        targetTable: "factory_number_reservation",
        existingUnownedCollisions: 2,
      }),
    ).toEqual([
      expect.objectContaining({
        targetTable: "factory_number_reservation",
        existingUnownedCollisions: 2,
      }),
    ]);
  });

  it("should allow execute when no unowned reservation-key collisions exist", () => {
    expect(
      buildExistingCollisionBlockers({
        targetTable: "factory_number_reservation",
        existingUnownedCollisions: 0,
      }),
    ).toEqual([]);
  });
});
