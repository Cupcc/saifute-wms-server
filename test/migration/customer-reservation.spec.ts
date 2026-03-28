import { buildOutboundReservationMigrationPlan } from "../../scripts/migration/customer-reservation/transformer";
import type {
  LegacyIntervalSnapshot,
  OutboundReservationDependencySnapshot,
} from "../../scripts/migration/customer-reservation/types";

function buildDependencies(): OutboundReservationDependencySnapshot {
  return {
    orderMapByLegacyId: new Map([
      [
        10,
        {
          legacyTable: "saifute_outbound_order",
          legacyId: 10,
          targetTable: "customer_stock_order",
          targetId: 510,
          targetCode: "CK001",
          actualTargetCode: "CK001",
          lifecycleStatus: "EFFECTIVE",
          workshopId: 7000,
          bizDate: "2026-01-02",
          createdAt: "2026-01-02 08:00:00",
          updatedAt: "2026-01-02 09:00:00",
          voidedAt: null,
        },
      ],
      [
        11,
        {
          legacyTable: "saifute_outbound_order",
          legacyId: 11,
          targetTable: "customer_stock_order",
          targetId: 511,
          targetCode: "CK002",
          actualTargetCode: "CK002",
          lifecycleStatus: "VOIDED",
          workshopId: 7000,
          bizDate: "2026-01-03",
          createdAt: "2026-01-03 08:00:00",
          updatedAt: "2026-01-03 10:00:00",
          voidedAt: null,
        },
      ],
      [
        13,
        {
          legacyTable: "saifute_outbound_order",
          legacyId: 13,
          targetTable: "customer_stock_order",
          targetId: 513,
          targetCode: "CK003",
          actualTargetCode: "CK003-DRIFT",
          lifecycleStatus: "EFFECTIVE",
          workshopId: 7000,
          bizDate: "2026-01-05",
          createdAt: "2026-01-05 08:00:00",
          updatedAt: "2026-01-05 09:00:00",
          voidedAt: null,
        },
      ],
    ]),
    lineMapByLegacyId: new Map([
      [
        175,
        {
          legacyTable: "saifute_outbound_detail",
          legacyId: 175,
          targetTable: "customer_stock_order_line",
          targetId: 6101,
          targetCode: "CK001#1",
          actualTargetCode: "CK001#1",
          orderTargetId: 510,
          lineNo: 1,
          materialId: 1701,
          startNumber: null,
          endNumber: null,
          sourceDocumentType: null,
          sourceDocumentId: null,
          sourceDocumentLineId: null,
        },
      ],
      [
        176,
        {
          legacyTable: "saifute_outbound_detail",
          legacyId: 176,
          targetTable: "customer_stock_order_line",
          targetId: 6102,
          targetCode: "CK001#2",
          actualTargetCode: "CK001#2",
          orderTargetId: 510,
          lineNo: 2,
          materialId: 1702,
          startNumber: null,
          endNumber: null,
          sourceDocumentType: null,
          sourceDocumentId: null,
          sourceDocumentLineId: null,
        },
      ],
      [
        177,
        {
          legacyTable: "saifute_outbound_detail",
          legacyId: 177,
          targetTable: "customer_stock_order_line",
          targetId: 6103,
          targetCode: "CK002#1",
          actualTargetCode: "CK002#1",
          orderTargetId: 511,
          lineNo: 1,
          materialId: 1703,
          startNumber: null,
          endNumber: null,
          sourceDocumentType: "StockInOrder",
          sourceDocumentId: 910,
          sourceDocumentLineId: 911,
        },
      ],
      [
        179,
        {
          legacyTable: "saifute_outbound_detail",
          legacyId: 179,
          targetTable: "customer_stock_order_line",
          targetId: 6104,
          targetCode: "CK001#3",
          actualTargetCode: "CK001#3",
          orderTargetId: 510,
          lineNo: 3,
          materialId: 1704,
          startNumber: null,
          endNumber: null,
          sourceDocumentType: null,
          sourceDocumentId: null,
          sourceDocumentLineId: null,
        },
      ],
      [
        180,
        {
          legacyTable: "saifute_outbound_detail",
          legacyId: 180,
          targetTable: "customer_stock_order_line",
          targetId: 6105,
          targetCode: "CK003#1",
          actualTargetCode: "CK003#9",
          orderTargetId: 999,
          lineNo: 1,
          materialId: 1705,
          startNumber: null,
          endNumber: null,
          sourceDocumentType: null,
          sourceDocumentId: null,
          sourceDocumentLineId: null,
        },
      ],
    ]),
    excludedOrderByLegacyId: new Map([
      [
        12,
        {
          legacyTable: "saifute_outbound_order",
          legacyId: 12,
          exclusionReason: "batch2c excluded this outbound document",
          payloadJson: '{"legacyId":12}',
        },
      ],
    ]),
    outboundBaseBaseline: {
      expectedOrderMapCount: 108,
      actualOrderMapCount: 108,
      expectedLineMapCount: 137,
      actualLineMapCount: 137,
      expectedExcludedDocumentCount: 4,
      actualExcludedDocumentCount: 4,
      issues: [],
    },
  };
}

function buildSnapshot(): LegacyIntervalSnapshot {
  return {
    intervals: [
      {
        legacyTable: "saifute_interval",
        legacyId: 1,
        orderType: 4,
        detailLegacyId: 175,
        startNum: 100,
        endNum: 199,
      },
      {
        legacyTable: "saifute_interval",
        legacyId: 2,
        orderType: 4,
        detailLegacyId: 176,
        startNum: 200,
        endNum: 249,
      },
      {
        legacyTable: "saifute_interval",
        legacyId: 3,
        orderType: 4,
        detailLegacyId: 176,
        startNum: 250,
        endNum: 299,
      },
      {
        legacyTable: "saifute_interval",
        legacyId: 4,
        orderType: 4,
        detailLegacyId: 177,
        startNum: 300,
        endNum: 399,
      },
      {
        legacyTable: "saifute_interval",
        legacyId: 5,
        orderType: 2,
        detailLegacyId: 284,
        startNum: 400,
        endNum: 499,
      },
      {
        legacyTable: "saifute_interval",
        legacyId: 6,
        orderType: 7,
        detailLegacyId: 285,
        startNum: 500,
        endNum: 599,
      },
      {
        legacyTable: "saifute_interval",
        legacyId: 7,
        orderType: 4,
        detailLegacyId: 999,
        startNum: 600,
        endNum: 699,
      },
      {
        legacyTable: "saifute_interval",
        legacyId: 8,
        orderType: 4,
        detailLegacyId: 178,
        startNum: 700,
        endNum: 799,
      },
      {
        legacyTable: "saifute_interval",
        legacyId: 9,
        orderType: 4,
        detailLegacyId: 179,
        startNum: 900,
        endNum: 800,
      },
    ],
    outboundDetailReferences: [
      { legacyId: 175, parentLegacyId: 10 },
      { legacyId: 176, parentLegacyId: 10 },
      { legacyId: 177, parentLegacyId: 11 },
      { legacyId: 178, parentLegacyId: 12 },
      { legacyId: 179, parentLegacyId: 10 },
      { legacyId: 180, parentLegacyId: 13 },
    ],
  };
}

describe("outbound reservation migration transformer", () => {
  it("should partition intervals deterministically into live reservations, archived intervals, and line backfills", () => {
    const plan = buildOutboundReservationMigrationPlan(
      buildSnapshot(),
      buildDependencies(),
    );

    expect(plan.migrationBatch).toBe(
      "batch3a-outbound-order-type4-reservation",
    );
    expect(plan.globalBlockers).toHaveLength(0);
    expect(plan.counts).toEqual({
      sourceIntervalCount: 9,
      liveReservationCount: 4,
      archivedIntervalCount: 5,
      sourceByOrderType: {
        orderType2: 1,
        orderType4: 7,
        orderType7: 1,
        unexpected: 0,
      },
      liveOrderType4Count: 4,
      archivedOrderType4Count: 3,
      archivedOrderType2Count: 1,
      archivedOrderType7Count: 1,
      singleIntervalLineBackfillCount: 2,
      multiIntervalLiveLineCount: 1,
    });

    expect(plan.liveReservations.map((record) => record.legacyId)).toEqual([
      1, 2, 3, 4,
    ]);
    expect(plan.liveReservations.map((record) => record.targetCode)).toEqual([
      "CK001#1@100-199",
      "CK001#2@200-249",
      "CK001#2@250-299",
      "CK002#1@300-399",
    ]);
    expect(plan.liveReservations[0]?.target.status).toBe("RESERVED");
    expect(plan.liveReservations[0]?.target.reservedAt).toBe(
      "2026-01-02 08:00:00",
    );
    expect(plan.liveReservations[3]?.target.status).toBe("RELEASED");
    expect(plan.liveReservations[3]?.target.releasedAt).toBe(
      "2026-01-03 10:00:00",
    );
    expect(plan.liveReservations[3]?.target.businessDocumentType).toBe(
      "CustomerStockOrder",
    );

    expect(plan.archivedIntervals).toEqual([
      expect.objectContaining({
        legacyId: 5,
        archiveReason: "unsupported-order-type-2-production-in-interval",
      }),
      expect.objectContaining({
        legacyId: 6,
        archiveReason: "unsupported-order-type-7-sales-return-interval",
      }),
      expect.objectContaining({
        legacyId: 7,
        archiveReason: "order-type-4-missing-line-map",
      }),
      expect.objectContaining({
        legacyId: 8,
        archiveReason: "order-type-4-parent-document-excluded",
      }),
      expect.objectContaining({
        legacyId: 9,
        archiveReason: "order-type-4-invalid-range",
      }),
    ]);

    expect(plan.lineBackfills).toEqual([
      {
        targetLineId: 6101,
        targetLineCode: "CK001#1",
        startNumber: "100",
        endNumber: "199",
        liveSegmentCount: 1,
        preservedSourceDocumentType: null,
        preservedSourceDocumentId: null,
        preservedSourceDocumentLineId: null,
      },
      {
        targetLineId: 6102,
        targetLineCode: "CK001#2",
        startNumber: null,
        endNumber: null,
        liveSegmentCount: 2,
        preservedSourceDocumentType: null,
        preservedSourceDocumentId: null,
        preservedSourceDocumentLineId: null,
      },
      {
        targetLineId: 6103,
        targetLineCode: "CK002#1",
        startNumber: "300",
        endNumber: "399",
        liveSegmentCount: 1,
        preservedSourceDocumentType: "StockInOrder",
        preservedSourceDocumentId: 910,
        preservedSourceDocumentLineId: 911,
      },
    ]);

    expect(plan.context).toEqual({
      outboundBaseBaseline: buildDependencies().outboundBaseBaseline,
      excludedOrderIds: [12],
      touchedLineIds: [6101, 6102, 6103],
      unexpectedOrderTypes: [],
    });
  });

  it("should surface baseline, unexpected-order-type, and target-mismatch blockers", () => {
    const dependencies = buildDependencies();
    dependencies.outboundBaseBaseline.issues = [
      "batch2c outbound line map count mismatch: expected 137, received 136.",
    ];

    const snapshot = buildSnapshot();
    snapshot.intervals.push(
      {
        legacyTable: "saifute_interval",
        legacyId: 10,
        orderType: 9,
        detailLegacyId: 999,
        startNum: 1,
        endNum: 2,
      },
      {
        legacyTable: "saifute_interval",
        legacyId: 11,
        orderType: 4,
        detailLegacyId: 180,
        startNum: 1000,
        endNum: 1005,
      },
      {
        legacyTable: "saifute_interval",
        legacyId: 12,
        orderType: null,
        detailLegacyId: 181,
        startNum: 1006,
        endNum: 1010,
      },
    );

    const plan = buildOutboundReservationMigrationPlan(snapshot, dependencies);

    expect(plan.globalBlockers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          reason:
            "batch2c outbound line map count mismatch: expected 137, received 136.",
        }),
        expect.objectContaining({
          reason:
            "Legacy saifute_interval contains unexpected order_type values outside the frozen {2,4,7} distribution.",
          details: {
            unexpectedOrderTypes: [9],
          },
        }),
        expect.objectContaining({
          reason:
            "Legacy saifute_interval contains null or malformed order_type values outside the frozen {2,4,7} distribution.",
          details: {
            invalidOrderTypeIntervalIds: [12],
          },
        }),
        expect.objectContaining({
          reason:
            "One or more mapped order_type=4 intervals no longer match the batch2c outbound target state.",
          details: {
            affectedIntervalIds: [11],
          },
        }),
      ]),
    );
    expect(plan.archivedIntervals).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          legacyId: 10,
          archiveReason: "unexpected-order-type",
        }),
        expect.objectContaining({
          legacyId: 11,
          archiveReason: "order-type-4-target-row-mismatch",
        }),
        expect.objectContaining({
          legacyId: 12,
          archiveReason: "unexpected-order-type",
        }),
      ]),
    );
    expect(plan.context.unexpectedOrderTypes).toEqual([9]);
  });
});
