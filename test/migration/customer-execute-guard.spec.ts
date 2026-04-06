import {
  buildDownstreamConsumerBlockers,
  buildMapConsistencyBlockers,
  buildMissingMapTargetBlockers,
  buildSliceDirtyTargetBlockers,
} from "../../scripts/migration/customer/execute-guard";

describe("outbound execute guard", () => {
  it("should allow a clean first run", () => {
    expect(
      buildSliceDirtyTargetBlockers({
        targetTable: "customer_stock_order",
        targetRows: 0,
        batchMapRows: 0,
      }),
    ).toEqual([]);
  });

  it("should allow a clean rerun when target rows match batch map rows", () => {
    expect(
      buildSliceDirtyTargetBlockers({
        targetTable: "customer_stock_order_line",
        targetRows: 12,
        batchMapRows: 12,
      }),
    ).toEqual([]);
  });

  it("should block execute when extra target rows exist", () => {
    expect(
      buildSliceDirtyTargetBlockers({
        targetTable: "customer_stock_order",
        targetRows: 5,
        batchMapRows: 4,
      }),
    ).toEqual([
      expect.objectContaining({
        targetTable: "customer_stock_order",
        targetRows: 5,
        batchMapRows: 4,
      }),
    ]);
  });

  it("should block execute when stale batch maps remain without matching target rows", () => {
    expect(
      buildSliceDirtyTargetBlockers({
        targetTable: "customer_stock_order_line",
        targetRows: 0,
        batchMapRows: 3,
      }),
    ).toEqual([
      expect.objectContaining({
        targetTable: "customer_stock_order_line",
        targetRows: 0,
        batchMapRows: 3,
      }),
    ]);
  });

  it("should block execute when staging maps point at missing target rows", () => {
    expect(
      buildMissingMapTargetBlockers({
        targetTable: "customer_stock_order",
        missingMappedTargets: 2,
      }),
    ).toEqual([
      expect.objectContaining({
        targetTable: "customer_stock_order",
        missingMappedTargets: 2,
      }),
    ]);
  });

  it("should allow execute when all staging map targets still exist", () => {
    expect(
      buildMissingMapTargetBlockers({
        targetTable: "customer_stock_order_line",
        missingMappedTargets: 0,
      }),
    ).toEqual([]);
  });

  it("should block execute when batch map rows drift from the deterministic plan", () => {
    expect(
      buildMapConsistencyBlockers({
        targetTable: "customer_stock_order",
        missingExpectedMapRows: 1,
        unexpectedMapRows: 0,
        mismatchedTargetCodes: 1,
        mismatchedActualTargetCodes: 0,
      }),
    ).toEqual([
      expect.objectContaining({
        targetTable: "customer_stock_order",
        missingExpectedMapRows: 1,
        mismatchedTargetCodes: 1,
      }),
    ]);
  });

  it("should allow execute when batch map rows exactly match the deterministic plan", () => {
    expect(
      buildMapConsistencyBlockers({
        targetTable: "customer_stock_order_line",
        missingExpectedMapRows: 0,
        unexpectedMapRows: 0,
        mismatchedTargetCodes: 0,
        mismatchedActualTargetCodes: 0,
      }),
    ).toEqual([]);
  });

  it("should block rerun when downstream outbound consumers already exist", () => {
    expect(
      buildDownstreamConsumerBlockers({
        isRerun: true,
        consumerCounts: {
          document_relation: 1,
          document_line_relation: 0,
          factory_number_reservation: 0,
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

  it("should allow first execute before downstream consumers exist", () => {
    expect(
      buildDownstreamConsumerBlockers({
        isRerun: false,
        consumerCounts: {
          document_relation: 3,
        },
      }),
    ).toEqual([]);
  });
});
