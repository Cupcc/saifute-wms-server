import {
  buildDownstreamConsumerBlockers,
  buildMapConsistencyBlockers,
  buildMissingMapTargetBlockers,
  buildSliceDirtyTargetBlockers,
} from "../../scripts/migration/workshop-pick/execute-guard";

describe("workshop-pick execute guard", () => {
  it("should allow a clean first run", () => {
    expect(
      buildSliceDirtyTargetBlockers({
        targetTable: "workshop_material_order",
        batchOwnedTargetRows: 0,
        batchMapRows: 0,
      }),
    ).toEqual([]);
  });

  it("should allow a clean rerun when target rows match batch map rows", () => {
    expect(
      buildSliceDirtyTargetBlockers({
        targetTable: "workshop_material_order_line",
        batchOwnedTargetRows: 12,
        batchMapRows: 12,
      }),
    ).toEqual([]);
  });

  it("should block execute when target rows and batch map rows differ", () => {
    expect(
      buildSliceDirtyTargetBlockers({
        targetTable: "workshop_material_order",
        batchOwnedTargetRows: 5,
        batchMapRows: 4,
      }),
    ).toEqual([
      expect.objectContaining({
        targetTable: "workshop_material_order",
        batchOwnedTargetRows: 5,
        batchMapRows: 4,
      }),
    ]);
  });

  it("should block execute when staging maps point at missing target rows", () => {
    expect(
      buildMissingMapTargetBlockers({
        targetTable: "workshop_material_order_line",
        missingMappedTargets: 2,
      }),
    ).toEqual([
      expect.objectContaining({
        targetTable: "workshop_material_order_line",
        missingMappedTargets: 2,
      }),
    ]);
  });

  it("should allow execute when all mapped targets still exist", () => {
    expect(
      buildMissingMapTargetBlockers({
        targetTable: "workshop_material_order",
        missingMappedTargets: 0,
      }),
    ).toEqual([]);
  });

  it("should block execute when batch map rows drift from the deterministic plan", () => {
    expect(
      buildMapConsistencyBlockers({
        targetTable: "workshop_material_order",
        missingExpectedMapRows: 1,
        unexpectedMapRows: 0,
        mismatchedTargetCodes: 1,
        mismatchedActualTargetCodes: 0,
      }),
    ).toEqual([
      expect.objectContaining({
        targetTable: "workshop_material_order",
        missingExpectedMapRows: 1,
        mismatchedTargetCodes: 1,
      }),
    ]);
  });

  it("should allow execute when batch map rows exactly match the deterministic plan", () => {
    expect(
      buildMapConsistencyBlockers({
        targetTable: "workshop_material_order_line",
        missingExpectedMapRows: 0,
        unexpectedMapRows: 0,
        mismatchedTargetCodes: 0,
        mismatchedActualTargetCodes: 0,
      }),
    ).toEqual([]);
  });

  it("should block late first execute when downstream workshop-material consumers already exist", () => {
    expect(
      buildDownstreamConsumerBlockers({
        hasBatchOwnership: false,
        consumerCounts: {
          document_relation: 1,
          document_line_relation: 0,
          factory_number_reservation: 0,
          inventory_balance: 0,
          inventory_log: 0,
          inventory_source_usage: 0,
          audit_document: 0,
        },
      }),
    ).toEqual([
      expect.objectContaining({
        downstreamConsumers: {
          document_relation: 1,
        },
      }),
    ]);
  });

  it("should block rerun when downstream workshop-material consumers already exist", () => {
    expect(
      buildDownstreamConsumerBlockers({
        hasBatchOwnership: true,
        consumerCounts: {
          document_relation: 0,
          document_line_relation: 1,
          factory_number_reservation: 0,
          inventory_balance: 0,
          inventory_log: 0,
          inventory_source_usage: 0,
          audit_document: 0,
        },
      }),
    ).toEqual([
      expect.objectContaining({
        downstreamConsumers: {
          document_line_relation: 1,
        },
      }),
    ]);
  });

  it("should allow execute when downstream workshop-material consumers do not exist", () => {
    expect(
      buildDownstreamConsumerBlockers({
        hasBatchOwnership: false,
        consumerCounts: {
          document_relation: 0,
          document_line_relation: 0,
          factory_number_reservation: 0,
          inventory_balance: 0,
          inventory_log: 0,
          inventory_source_usage: 0,
          audit_document: 0,
        },
      }),
    ).toEqual([]);
  });

  it("should block when inventory balance rows already exist for a late first execute", () => {
    expect(
      buildDownstreamConsumerBlockers({
        hasBatchOwnership: false,
        consumerCounts: {
          document_relation: 0,
          document_line_relation: 0,
          factory_number_reservation: 0,
          inventory_balance: 3,
          inventory_log: 0,
          inventory_source_usage: 0,
          audit_document: 0,
        },
      }),
    ).toEqual([
      expect.objectContaining({
        downstreamConsumers: {
          inventory_balance: 3,
        },
      }),
    ]);
  });
});
