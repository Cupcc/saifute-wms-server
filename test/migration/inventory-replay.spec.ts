import { buildInventoryReplayPlan } from "../../scripts/migration/inventory-replay/planner";
import { buildBestReturnSourceLinkBackfillPlan } from "../../scripts/migration/inventory-replay/return-source-link-backfill-planner";
import type {
  InventoryEvent,
  ReturnSourceLinkCandidateRow,
} from "../../scripts/migration/inventory-replay/types";

function event(overrides: Partial<InventoryEvent>): InventoryEvent {
  return {
    bizDate: "2026-01-01",
    direction: "IN",
    operationType: "ACCEPTANCE_IN",
    businessModule: "inbound",
    businessDocumentType: "StockInOrder",
    businessDocumentId: 1,
    businessDocumentNumber: "DOC-001",
    businessDocumentLineId: 1,
    materialId: 100,
    stockScopeId: 1,
    workshopId: null,
    changeQty: "1.000000",
    unitCost: "10.00",
    costAmount: null,
    selectedUnitCost: null,
    sourceDocumentType: null,
    sourceDocumentId: null,
    sourceDocumentLineId: null,
    transferInStockScopeId: null,
    transferInWorkshopId: null,
    idempotencyKey: "StockInOrder:1:line:1",
    operatorId: null,
    occurredAt: "2026-01-01 00:00:00",
    sortPriority: 0,
    ...overrides,
  };
}

function returnCandidateRow(
  overrides: Partial<ReturnSourceLinkCandidateRow>,
): ReturnSourceLinkCandidateRow {
  return {
    returnDocumentType: "SalesStockOrder",
    returnDocumentId: 1,
    returnDocumentNumber: "TH-001",
    returnLineId: 10,
    returnOperationType: "SALES_RETURN_IN",
    returnBizDate: "2026-01-02",
    materialId: 100,
    stockScopeId: 1,
    workshopId: 1,
    returnQty: "1.000000",
    returnUnitCost: null,
    returnRemark: null,
    remarkTargetDates: [],
    candidateCount: 1,
    coveringCandidateCount: 1,
    recommendedAction: "manual-review-multiple-covering-candidates",
    suggestedSourceDocumentType: null,
    suggestedSourceDocumentId: null,
    suggestedSourceDocumentNumber: null,
    suggestedSourceLineId: null,
    candidates: [
      {
        sourceDocumentType: "SalesStockOrder",
        sourceDocumentId: 2,
        sourceDocumentNumber: "CK-001",
        sourceLineId: 20,
        sourceOperationType: "OUTBOUND_OUT",
        sourceBizDate: "2026-01-01",
        sourceQty: "1.000000",
        alreadyLinkedReturnQty: "0.000000",
        remainingReturnableQty: "1.000000",
        sourceUnitCost: null,
        sourceRemark: null,
        daysBeforeReturn: 1,
        sameWorkshop: true,
        unitCostMatches: null,
      },
    ],
    ...overrides,
  };
}

describe("inventory replay planner", () => {
  it("allocates FIFO and reconciles remaining price layers", () => {
    const plan = buildInventoryReplayPlan([
      event({
        businessDocumentLineId: 1,
        changeQty: "100.000000",
        unitCost: "10.00",
        idempotencyKey: "StockInOrder:1:line:1",
      }),
      event({
        businessDocumentLineId: 2,
        changeQty: "50.000000",
        unitCost: "12.00",
        idempotencyKey: "StockInOrder:1:line:2",
      }),
      event({
        bizDate: "2026-01-02",
        direction: "OUT",
        operationType: "OUTBOUND_OUT",
        businessModule: "sales",
        businessDocumentType: "SalesStockOrder",
        businessDocumentId: 2,
        businessDocumentNumber: "SO-001",
        businessDocumentLineId: 20,
        changeQty: "80.000000",
        unitCost: null,
        idempotencyKey: "SalesStockOrder:2:line:20",
        sortPriority: 1,
      }),
    ]);

    expect(plan.blockers).toHaveLength(0);
    expect(plan.plannedSourceUsages).toHaveLength(1);
    expect(plan.plannedSourceUsages[0]).toMatchObject({
      sourceLogIdempotencyKey: "StockInOrder:1:line:1",
      allocatedQty: "80.000000",
      releasedQty: "0.000000",
      status: "ALLOCATED",
    });
    expect(plan.plannedPriceLayers).toEqual([
      {
        materialId: 100,
        stockScopeId: 1,
        unitCost: "10.00",
        availableQty: "20.000000",
        sourceLogCount: 1,
      },
      {
        materialId: 100,
        stockScopeId: 1,
        unitCost: "12.00",
        availableQty: "50.000000",
        sourceLogCount: 1,
      },
    ]);
  });

  it("restricts allocation to the selected unit-cost layer", () => {
    const plan = buildInventoryReplayPlan([
      event({
        businessDocumentLineId: 1,
        changeQty: "100.000000",
        unitCost: "10.00",
        idempotencyKey: "StockInOrder:1:line:1",
      }),
      event({
        businessDocumentLineId: 2,
        changeQty: "50.000000",
        unitCost: "12.00",
        idempotencyKey: "StockInOrder:1:line:2",
      }),
      event({
        bizDate: "2026-01-02",
        direction: "OUT",
        operationType: "OUTBOUND_OUT",
        businessModule: "sales",
        businessDocumentType: "SalesStockOrder",
        businessDocumentId: 2,
        businessDocumentNumber: "SO-001",
        businessDocumentLineId: 20,
        changeQty: "30.000000",
        unitCost: null,
        selectedUnitCost: "12.00",
        idempotencyKey: "SalesStockOrder:2:line:20",
        sortPriority: 1,
      }),
    ]);

    expect(plan.blockers).toHaveLength(0);
    expect(plan.plannedSourceUsages[0]).toMatchObject({
      sourceLogIdempotencyKey: "StockInOrder:1:line:2",
      allocatedQty: "30.000000",
    });
    expect(plan.plannedPriceLayers).toEqual([
      {
        materialId: 100,
        stockScopeId: 1,
        unitCost: "10.00",
        availableQty: "100.000000",
        sourceLogCount: 1,
      },
      {
        materialId: 100,
        stockScopeId: 1,
        unitCost: "12.00",
        availableQty: "20.000000",
        sourceLogCount: 1,
      },
    ]);
  });

  it("blocks when the selected layer is insufficient even if other layers exist", () => {
    const plan = buildInventoryReplayPlan([
      event({
        changeQty: "20.000000",
        unitCost: "10.00",
        idempotencyKey: "StockInOrder:1:line:1",
      }),
      event({
        businessDocumentLineId: 2,
        changeQty: "50.000000",
        unitCost: "12.00",
        idempotencyKey: "StockInOrder:1:line:2",
      }),
      event({
        bizDate: "2026-01-02",
        direction: "OUT",
        operationType: "OUTBOUND_OUT",
        businessModule: "sales",
        businessDocumentType: "SalesStockOrder",
        businessDocumentId: 2,
        businessDocumentNumber: "SO-001",
        businessDocumentLineId: 20,
        changeQty: "30.000000",
        unitCost: null,
        selectedUnitCost: "10.00",
        idempotencyKey: "SalesStockOrder:2:line:20",
        sortPriority: 1,
      }),
    ]);

    expect(
      plan.blockers.some((b) => b.reason === "fifo-source-insufficient"),
    ).toBe(true);
  });

  it("allocates inbound reversal rows as selected-cost consumers", () => {
    const plan = buildInventoryReplayPlan([
      event({
        businessDocumentLineId: 1,
        changeQty: "100.000000",
        unitCost: "10.00",
        idempotencyKey: "StockInOrder:1:line:1",
      }),
      event({
        businessDocumentLineId: 2,
        changeQty: "50.000000",
        unitCost: "12.00",
        idempotencyKey: "StockInOrder:1:line:2",
      }),
      event({
        bizDate: "2026-01-02",
        direction: "OUT",
        operationType: "REVERSAL_OUT",
        businessDocumentType: "StockInOrder",
        businessDocumentId: 2,
        businessDocumentNumber: "YS-OFFSET",
        businessDocumentLineId: 20,
        changeQty: "30.000000",
        unitCost: "12.00",
        selectedUnitCost: "12.00",
        idempotencyKey: "StockInOrder:2:line:20",
        sortPriority: 1,
      }),
    ]);

    expect(plan.blockers).toHaveLength(0);
    expect(plan.plannedSourceUsages[0]).toMatchObject({
      consumerDocumentType: "StockInOrder",
      consumerDocumentId: 2,
      consumerLineId: 20,
      sourceLogIdempotencyKey: "StockInOrder:1:line:2",
      allocatedQty: "30.000000",
    });
    expect(plan.plannedPriceLayers).toEqual([
      {
        materialId: 100,
        stockScopeId: 1,
        unitCost: "10.00",
        availableQty: "100.000000",
        sourceLogCount: 1,
      },
      {
        materialId: 100,
        stockScopeId: 1,
        unitCost: "12.00",
        availableQty: "20.000000",
        sourceLogCount: 1,
      },
    ]);
  });

  it("allows inbound reversal rows to consume matched future stock-in sources", () => {
    const plan = buildInventoryReplayPlan([
      event({
        bizDate: "2026-01-01",
        direction: "OUT",
        operationType: "REVERSAL_OUT",
        businessDocumentType: "StockInOrder",
        businessDocumentId: 1,
        businessDocumentNumber: "YS-OFFSET",
        businessDocumentLineId: 10,
        changeQty: "30.000000",
        unitCost: "12.00",
        selectedUnitCost: "12.00",
        idempotencyKey: "StockInOrder:1:line:10",
        sortPriority: 1,
      }),
      event({
        bizDate: "2026-01-02",
        businessDocumentId: 2,
        businessDocumentLineId: 20,
        changeQty: "50.000000",
        unitCost: "12.00",
        idempotencyKey: "StockInOrder:2:line:20",
      }),
    ]);

    expect(plan.blockers).toHaveLength(0);
    expect(plan.warnings).toEqual(
      expect.arrayContaining([
        expect.stringContaining(
          "consumed future source StockInOrder:2:line:20",
        ),
        expect.stringContaining("temporarily makes material=100"),
      ]),
    );
    expect(plan.plannedSourceUsages[0]).toMatchObject({
      consumerDocumentType: "StockInOrder",
      consumerDocumentId: 1,
      consumerLineId: 10,
      sourceLogIdempotencyKey: "StockInOrder:2:line:20",
      allocatedQty: "30.000000",
    });
    expect(plan.plannedPriceLayers).toEqual([
      {
        materialId: 100,
        stockScopeId: 1,
        unitCost: "12.00",
        availableQty: "20.000000",
        sourceLogCount: 1,
      },
    ]);
  });

  it("allows historical outbound rows to consume matched future stock-in sources", () => {
    const plan = buildInventoryReplayPlan([
      event({
        bizDate: "2026-01-01",
        direction: "OUT",
        operationType: "OUTBOUND_OUT",
        businessModule: "sales",
        businessDocumentType: "SalesStockOrder",
        businessDocumentId: 1,
        businessDocumentNumber: "SO-001",
        businessDocumentLineId: 10,
        changeQty: "30.000000",
        unitCost: null,
        selectedUnitCost: "12.00",
        idempotencyKey: "SalesStockOrder:1:line:10",
        sortPriority: 1,
      }),
      event({
        bizDate: "2026-01-02",
        businessDocumentId: 2,
        businessDocumentLineId: 20,
        changeQty: "50.000000",
        unitCost: "12.00",
        idempotencyKey: "StockInOrder:2:line:20",
      }),
    ]);

    expect(plan.blockers).toHaveLength(0);
    expect(plan.plannedSourceUsages).toHaveLength(1);
    expect(plan.plannedSourceUsages[0]).toMatchObject({
      sourceLogIdempotencyKey: "StockInOrder:2:line:20",
      consumerDocumentType: "SalesStockOrder",
      consumerDocumentId: 1,
      consumerLineId: 10,
      allocatedQty: "30.000000",
      releasedQty: "0.000000",
      status: "ALLOCATED",
    });
    expect(plan.plannedLogs[0]).toMatchObject({
      idempotencyKey: "SalesStockOrder:1:line:10",
      unitCost: "12.00",
      costAmount: "360.00",
      note: "Historical unordered stock movement matched future stock-in source(s): StockInOrder:2:line:20.",
    });
    expect(plan.warnings).toEqual(
      expect.arrayContaining([
        expect.stringContaining(
          "OUTBOUND_OUT SalesStockOrder:1:line:10 consumed future source StockInOrder:2:line:20",
        ),
        expect.stringContaining(
          "OUTBOUND_OUT SalesStockOrder:1:line:10 temporarily makes material=100, stockScope=1 negative",
        ),
      ]),
    );
  });

  it("keeps selected-cost outbound blocked when future stock-in cost differs", () => {
    const plan = buildInventoryReplayPlan([
      event({
        bizDate: "2026-01-01",
        direction: "OUT",
        operationType: "OUTBOUND_OUT",
        businessModule: "sales",
        businessDocumentType: "SalesStockOrder",
        businessDocumentId: 1,
        businessDocumentNumber: "SO-001",
        businessDocumentLineId: 10,
        changeQty: "30.000000",
        unitCost: null,
        selectedUnitCost: "12.00",
        idempotencyKey: "SalesStockOrder:1:line:10",
        sortPriority: 1,
      }),
      event({
        bizDate: "2026-01-02",
        businessDocumentId: 2,
        businessDocumentLineId: 20,
        changeQty: "50.000000",
        unitCost: "13.00",
        idempotencyKey: "StockInOrder:2:line:20",
      }),
    ]);

    expect(
      plan.blockers.some(
        (blocker) => blocker.reason === "fifo-source-insufficient",
      ),
    ).toBe(true);
    expect(
      plan.blockers.some(
        (blocker) => blocker.reason === "negative-balance-during-replay",
      ),
    ).toBe(true);
    expect(plan.plannedSourceUsages).toHaveLength(0);
  });

  it("marks fully unmatched inbound reversal rows as deferred blockers without stock facts", () => {
    const plan = buildInventoryReplayPlan([
      event({
        bizDate: "2026-01-01",
        direction: "OUT",
        operationType: "REVERSAL_OUT",
        businessDocumentType: "StockInOrder",
        businessDocumentId: 1,
        businessDocumentNumber: "RK-OFFSET",
        businessDocumentLineId: 10,
        changeQty: "4.000000",
        unitCost: "397.00",
        selectedUnitCost: "397.00",
        idempotencyKey: "StockInOrder:1:line:10",
        sortPriority: 1,
      }),
      event({
        bizDate: "2026-01-02",
        businessDocumentId: 2,
        businessDocumentLineId: 20,
        changeQty: "5.000000",
        unitCost: "424.78",
        idempotencyKey: "StockInOrder:2:line:20",
      }),
    ]);

    expect(plan.blockers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          reason: "stock-in-offset-source-unresolved",
          details: expect.objectContaining({
            documentNumber: "RK-OFFSET",
            unitCost: "397.00",
            disposition:
              "deferred-document-only-offset-no-matched-source-stock-fact-skipped",
          }),
        }),
      ]),
    );
    expect(
      plan.blockers.some(
        (blocker) => blocker.reason === "fifo-source-insufficient",
      ),
    ).toBe(false);
    expect(
      plan.blockers.some(
        (blocker) => blocker.reason === "negative-balance-during-replay",
      ),
    ).toBe(false);
    expect(plan.plannedLogs).toHaveLength(1);
    expect(plan.plannedLogs[0]).toMatchObject({
      idempotencyKey: "StockInOrder:2:line:20",
      operationType: "ACCEPTANCE_IN",
    });
    expect(plan.plannedSourceUsages).toHaveLength(0);
  });

  it("releases original source usage for linked returns", () => {
    const plan = buildInventoryReplayPlan([
      event({
        changeQty: "100.000000",
        unitCost: "10.00",
        idempotencyKey: "StockInOrder:1:line:1",
      }),
      event({
        bizDate: "2026-01-02",
        direction: "OUT",
        operationType: "OUTBOUND_OUT",
        businessModule: "sales",
        businessDocumentType: "SalesStockOrder",
        businessDocumentId: 2,
        businessDocumentNumber: "SO-001",
        businessDocumentLineId: 20,
        changeQty: "80.000000",
        unitCost: null,
        idempotencyKey: "SalesStockOrder:2:line:20",
        sortPriority: 1,
      }),
      event({
        bizDate: "2026-01-03",
        direction: "IN",
        operationType: "SALES_RETURN_IN",
        businessModule: "sales",
        businessDocumentType: "SalesStockOrder",
        businessDocumentId: 3,
        businessDocumentNumber: "SR-001",
        businessDocumentLineId: 30,
        changeQty: "30.000000",
        sourceDocumentType: "SalesStockOrder",
        sourceDocumentId: 2,
        sourceDocumentLineId: 20,
        unitCost: null,
        idempotencyKey: "SalesStockOrder:3:line:30",
      }),
    ]);

    expect(plan.blockers).toHaveLength(0);
    expect(plan.plannedSourceUsages[0]).toMatchObject({
      allocatedQty: "80.000000",
      releasedQty: "30.000000",
      status: "PARTIALLY_RELEASED",
    });
    expect(plan.plannedPriceLayers).toEqual([
      {
        materialId: 100,
        stockScopeId: 1,
        unitCost: "10.00",
        availableQty: "50.000000",
        sourceLogCount: 1,
      },
    ]);
  });

  it("accepts no-candidate workshop returns with positive cost as standalone sources", () => {
    const plan = buildInventoryReplayPlan([
      event({
        bizDate: "2026-01-03",
        direction: "IN",
        operationType: "RETURN_IN",
        businessModule: "workshop-material",
        businessDocumentType: "WorkshopMaterialOrder",
        businessDocumentId: 3,
        businessDocumentNumber: "TL-001",
        businessDocumentLineId: 30,
        workshopId: 10,
        changeQty: "20.000000",
        unitCost: "8.50",
        costAmount: null,
        idempotencyKey: "WorkshopMaterialOrder:3:line:30",
      }),
    ]);

    expect(plan.blockers).toHaveLength(0);
    expect(plan.returnSourceLinkCandidates).toHaveLength(0);
    expect(plan.plannedLogs).toEqual([
      expect.objectContaining({
        idempotencyKey: "WorkshopMaterialOrder:3:line:30",
        operationType: "RETURN_IN",
        direction: "IN",
        unitCost: "8.50",
        costAmount: "170.00",
        note: expect.stringContaining(
          "Accepted standalone workshop return source",
        ),
      }),
    ]);
    expect(plan.plannedPriceLayers).toEqual([
      {
        materialId: 100,
        stockScopeId: 1,
        unitCost: "8.50",
        availableQty: "20.000000",
        sourceLogCount: 1,
      },
    ]);
    expect(plan.warnings).toEqual(
      expect.arrayContaining([
        expect.stringContaining("STANDALONE_RETURN_SOURCE TL-001"),
      ]),
    );
  });

  it("keeps no-candidate workshop returns without cost blocked", () => {
    const plan = buildInventoryReplayPlan([
      event({
        bizDate: "2026-01-03",
        direction: "IN",
        operationType: "RETURN_IN",
        businessModule: "workshop-material",
        businessDocumentType: "WorkshopMaterialOrder",
        businessDocumentId: 3,
        businessDocumentNumber: "TL-NO-COST",
        businessDocumentLineId: 30,
        workshopId: 10,
        changeQty: "20.000000",
        unitCost: null,
        costAmount: null,
        idempotencyKey: "WorkshopMaterialOrder:3:line:30",
      }),
    ]);

    expect(plan.blockers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          reason: "return-source-link-missing",
          details: expect.objectContaining({
            documentType: "WorkshopMaterialOrder",
            documentId: 3,
            lineId: 30,
          }),
        }),
      ]),
    );
    expect(plan.returnSourceLinkCandidates).toEqual([
      expect.objectContaining({
        returnDocumentNumber: "TL-NO-COST",
        candidateCount: 0,
        recommendedAction: "manual-review-no-candidate",
      }),
    ]);
  });

  it("orders same-day linked returns after their source outbound line", () => {
    const plan = buildInventoryReplayPlan([
      event({
        bizDate: "2026-01-01",
        changeQty: "100.000000",
        unitCost: "10.00",
        idempotencyKey: "StockInOrder:1:line:1",
      }),
      event({
        bizDate: "2026-01-02",
        direction: "IN",
        operationType: "SALES_RETURN_IN",
        businessModule: "sales",
        businessDocumentType: "SalesStockOrder",
        businessDocumentId: 3,
        businessDocumentNumber: "SR-001",
        businessDocumentLineId: 30,
        changeQty: "30.000000",
        sourceDocumentType: "SalesStockOrder",
        sourceDocumentId: 20,
        sourceDocumentLineId: 200,
        unitCost: null,
        idempotencyKey: "SalesStockOrder:3:line:30",
        sortPriority: 0,
      }),
      event({
        bizDate: "2026-01-02",
        direction: "OUT",
        operationType: "OUTBOUND_OUT",
        businessModule: "sales",
        businessDocumentType: "SalesStockOrder",
        businessDocumentId: 20,
        businessDocumentNumber: "SO-001",
        businessDocumentLineId: 200,
        changeQty: "80.000000",
        unitCost: null,
        idempotencyKey: "SalesStockOrder:20:line:200",
        sortPriority: 1,
      }),
    ]);

    expect(
      plan.blockers.some(
        (blocker) => blocker.reason === "return-source-release-insufficient",
      ),
    ).toBe(false);
    expect(plan.plannedLogs.map((log) => log.idempotencyKey)).toEqual([
      "StockInOrder:1:line:1",
      "SalesStockOrder:20:line:200",
      "SalesStockOrder:3:line:30",
    ]);
    expect(plan.plannedSourceUsages[0]).toMatchObject({
      consumerDocumentId: 20,
      consumerLineId: 200,
      allocatedQty: "80.000000",
      releasedQty: "30.000000",
      status: "PARTIALLY_RELEASED",
    });
  });

  it("prefers return-source candidates whose date is referenced in the return remark", () => {
    const replayPlan = buildInventoryReplayPlan([
      event({
        bizDate: "2026-01-01",
        changeQty: "500.000000",
        unitCost: "124.00",
        idempotencyKey: "StockInOrder:1:line:1",
      }),
      event({
        bizDate: "2026-01-06",
        direction: "OUT",
        operationType: "OUTBOUND_OUT",
        businessModule: "sales",
        businessDocumentType: "SalesStockOrder",
        businessDocumentId: 161,
        businessDocumentNumber: "CK20260106015",
        businessDocumentLineId: 190,
        changeQty: "300.000000",
        unitCost: null,
        idempotencyKey: "SalesStockOrder:161:line:190",
        sortPriority: 1,
      }),
      event({
        bizDate: "2026-03-20",
        direction: "IN",
        operationType: "SALES_RETURN_IN",
        businessModule: "sales",
        businessDocumentType: "SalesStockOrder",
        businessDocumentId: 38,
        businessDocumentNumber: "TH20260320001",
        businessDocumentLineId: 53,
        changeQty: "100.000000",
        unitCost: null,
        remark: "冲红26.1.6",
        idempotencyKey: "SalesStockOrder:38:line:53",
      }),
      event({
        bizDate: "2026-03-20",
        direction: "OUT",
        operationType: "OUTBOUND_OUT",
        businessModule: "sales",
        businessDocumentType: "SalesStockOrder",
        businessDocumentId: 412,
        businessDocumentNumber: "CK20260320001",
        businessDocumentLineId: 512,
        changeQty: "100.000000",
        unitCost: null,
        idempotencyKey: "SalesStockOrder:412:line:512",
        sortPriority: 1,
      }),
    ]);
    const backfillPlan = buildBestReturnSourceLinkBackfillPlan(
      replayPlan.returnSourceLinkCandidates,
      { plannedSourceUsages: replayPlan.plannedSourceUsages },
    );

    expect(
      replayPlan.returnSourceLinkCandidates[0]?.candidates[0],
    ).toMatchObject({
      sourceDocumentNumber: "CK20260106015",
      sourceLineId: 190,
      remarkDateMatches: true,
      remarkMatchedDate: "2026-01-06",
    });
    expect(replayPlan.returnSourceLinkCandidates[0]).toMatchObject({
      returnRemark: "冲红26.1.6",
      remarkTargetDates: ["2026-01-06"],
    });
    expect(backfillPlan.selectedRows[0]).toMatchObject({
      returnDocumentNumber: "TH20260320001",
      returnRemark: "冲红26.1.6",
      remarkTargetDates: ["2026-01-06"],
      sourceDocumentNumber: "CK20260106015",
      sourceLineId: 190,
      selectedCandidateRank: 1,
    });
  });

  it("offsets fully returned unfunded outbound rows without stock facts", () => {
    const plan = buildInventoryReplayPlan([
      event({
        bizDate: "2026-01-02",
        direction: "OUT",
        operationType: "OUTBOUND_OUT",
        businessModule: "sales",
        businessDocumentType: "SalesStockOrder",
        businessDocumentId: 505,
        businessDocumentNumber: "CK20260403001",
        businessDocumentLineId: 623,
        materialId: 284,
        changeQty: "5.000000",
        unitCost: null,
        idempotencyKey: "SalesStockOrder:505:line:623",
        sortPriority: 1,
      }),
      event({
        bizDate: "2026-01-03",
        direction: "IN",
        operationType: "SALES_RETURN_IN",
        businessModule: "sales",
        businessDocumentType: "SalesStockOrder",
        businessDocumentId: 42,
        businessDocumentNumber: "TH20260403001",
        businessDocumentLineId: 58,
        materialId: 284,
        changeQty: "5.000000",
        sourceDocumentType: "SalesStockOrder",
        sourceDocumentId: 505,
        sourceDocumentLineId: 623,
        unitCost: null,
        idempotencyKey: "SalesStockOrder:42:line:58",
      }),
    ]);

    expect(plan.blockers).toHaveLength(0);
    expect(plan.plannedLogs).toHaveLength(0);
    expect(plan.plannedSourceUsages).toHaveLength(0);
    expect(plan.plannedBalances).toHaveLength(0);
    expect(plan.plannedPriceLayers).toHaveLength(0);
    expect(plan.warnings).toEqual(
      expect.arrayContaining([
        expect.stringContaining("UNFUNDED_RETURN_OFFSET"),
        expect.stringContaining("CK20260403001"),
      ]),
    );
  });

  it("keeps partially returned unfunded outbound rows blocked", () => {
    const plan = buildInventoryReplayPlan([
      event({
        bizDate: "2026-01-02",
        direction: "OUT",
        operationType: "OUTBOUND_OUT",
        businessModule: "sales",
        businessDocumentType: "SalesStockOrder",
        businessDocumentId: 505,
        businessDocumentNumber: "CK-PARTIAL",
        businessDocumentLineId: 623,
        materialId: 284,
        changeQty: "10.000000",
        unitCost: null,
        idempotencyKey: "SalesStockOrder:505:line:623",
        sortPriority: 1,
      }),
      event({
        bizDate: "2026-01-03",
        direction: "IN",
        operationType: "SALES_RETURN_IN",
        businessModule: "sales",
        businessDocumentType: "SalesStockOrder",
        businessDocumentId: 42,
        businessDocumentNumber: "TH-PARTIAL",
        businessDocumentLineId: 58,
        materialId: 284,
        changeQty: "5.000000",
        sourceDocumentType: "SalesStockOrder",
        sourceDocumentId: 505,
        sourceDocumentLineId: 623,
        unitCost: null,
        idempotencyKey: "SalesStockOrder:42:line:58",
      }),
    ]);

    expect(
      plan.blockers.some(
        (blocker) => blocker.reason === "fifo-source-insufficient",
      ),
    ).toBe(true);
    expect(
      plan.blockers.some(
        (blocker) => blocker.reason === "return-source-release-insufficient",
      ),
    ).toBe(true);
    expect(plan.plannedLogs.map((log) => log.idempotencyKey)).toEqual([
      "SalesStockOrder:505:line:623",
      "SalesStockOrder:42:line:58",
    ]);
  });

  it("reports candidate source lines for unlinked returns without auto-linking", () => {
    const plan = buildInventoryReplayPlan([
      event({
        changeQty: "100.000000",
        unitCost: "10.00",
        idempotencyKey: "StockInOrder:1:line:1",
      }),
      event({
        bizDate: "2026-01-02",
        direction: "OUT",
        operationType: "OUTBOUND_OUT",
        businessModule: "sales",
        businessDocumentType: "SalesStockOrder",
        businessDocumentId: 2,
        businessDocumentNumber: "SO-001",
        businessDocumentLineId: 20,
        changeQty: "80.000000",
        unitCost: null,
        selectedUnitCost: "10.00",
        idempotencyKey: "SalesStockOrder:2:line:20",
        sortPriority: 1,
      }),
      event({
        bizDate: "2026-01-03",
        direction: "IN",
        operationType: "SALES_RETURN_IN",
        businessModule: "sales",
        businessDocumentType: "SalesStockOrder",
        businessDocumentId: 3,
        businessDocumentNumber: "SR-001",
        businessDocumentLineId: 30,
        changeQty: "30.000000",
        unitCost: "10.00",
        idempotencyKey: "SalesStockOrder:3:line:30",
      }),
    ]);

    expect(
      plan.blockers.some(
        (blocker) => blocker.reason === "return-source-link-missing",
      ),
    ).toBe(true);
    expect(plan.returnSourceLinkCandidates).toEqual([
      expect.objectContaining({
        returnDocumentNumber: "SR-001",
        returnLineId: 30,
        candidateCount: 1,
        coveringCandidateCount: 1,
        recommendedAction: "review-and-link-unique-covering-candidate",
        suggestedSourceDocumentType: "SalesStockOrder",
        suggestedSourceDocumentId: 2,
        suggestedSourceDocumentNumber: "SO-001",
        suggestedSourceLineId: 20,
        candidates: [
          expect.objectContaining({
            sourceDocumentNumber: "SO-001",
            sourceLineId: 20,
            remainingReturnableQty: "80.000000",
            daysBeforeReturn: 1,
            unitCostMatches: true,
          }),
        ],
      }),
    ]);
  });

  it("does not reject return candidates only because document prices differ", () => {
    const plan = buildInventoryReplayPlan([
      event({
        changeQty: "100.000000",
        unitCost: "10.00",
        idempotencyKey: "StockInOrder:1:line:1",
      }),
      event({
        bizDate: "2026-01-02",
        direction: "OUT",
        operationType: "OUTBOUND_OUT",
        businessModule: "sales",
        businessDocumentType: "SalesStockOrder",
        businessDocumentId: 2,
        businessDocumentNumber: "SO-001",
        businessDocumentLineId: 20,
        changeQty: "80.000000",
        unitCost: null,
        selectedUnitCost: "10.00",
        idempotencyKey: "SalesStockOrder:2:line:20",
        sortPriority: 1,
      }),
      event({
        bizDate: "2026-01-03",
        direction: "IN",
        operationType: "SALES_RETURN_IN",
        businessModule: "sales",
        businessDocumentType: "SalesStockOrder",
        businessDocumentId: 3,
        businessDocumentNumber: "SR-001",
        businessDocumentLineId: 30,
        changeQty: "30.000000",
        unitCost: "9.00",
        idempotencyKey: "SalesStockOrder:3:line:30",
      }),
    ]);

    expect(plan.returnSourceLinkCandidates).toEqual([
      expect.objectContaining({
        candidateCount: 1,
        coveringCandidateCount: 1,
        recommendedAction: "review-and-link-unique-covering-candidate",
        suggestedSourceDocumentType: "SalesStockOrder",
        suggestedSourceDocumentId: 2,
        suggestedSourceDocumentNumber: "SO-001",
        suggestedSourceLineId: 20,
        candidates: [
          expect.objectContaining({
            sourceDocumentNumber: "SO-001",
            remainingReturnableQty: "80.000000",
            unitCostMatches: false,
          }),
        ],
      }),
    ]);
  });

  it("chooses best return-source backfills without overusing a candidate line", () => {
    const plan = buildBestReturnSourceLinkBackfillPlan([
      returnCandidateRow({
        returnDocumentId: 10,
        returnDocumentNumber: "TH-A",
        returnLineId: 101,
      }),
      returnCandidateRow({
        returnDocumentId: 11,
        returnDocumentNumber: "TH-B",
        returnLineId: 102,
        candidates: [
          {
            sourceDocumentType: "SalesStockOrder",
            sourceDocumentId: 2,
            sourceDocumentNumber: "CK-001",
            sourceLineId: 20,
            sourceOperationType: "OUTBOUND_OUT",
            sourceBizDate: "2026-01-01",
            sourceQty: "1.000000",
            alreadyLinkedReturnQty: "0.000000",
            remainingReturnableQty: "1.000000",
            sourceUnitCost: null,
            daysBeforeReturn: 1,
            sameWorkshop: true,
            unitCostMatches: null,
          },
          {
            sourceDocumentType: "SalesStockOrder",
            sourceDocumentId: 3,
            sourceDocumentNumber: "CK-002",
            sourceLineId: 30,
            sourceOperationType: "OUTBOUND_OUT",
            sourceBizDate: "2026-01-01",
            sourceQty: "1.000000",
            alreadyLinkedReturnQty: "0.000000",
            remainingReturnableQty: "1.000000",
            sourceUnitCost: null,
            daysBeforeReturn: 1,
            sameWorkshop: true,
            unitCostMatches: null,
          },
        ],
      }),
    ]);

    expect(plan.selectedRows).toHaveLength(2);
    expect(plan.selectedRows.map((row) => row.sourceLineId)).toEqual([20, 30]);
    expect(plan.selectedRows[1]).toMatchObject({
      returnDocumentNumber: "TH-B",
      selectedCandidateRank: 2,
      sourceRemainingAfter: "0.000000",
    });
  });

  it("accepts zero-cost source rows with audit markers", () => {
    const plan = buildInventoryReplayPlan([
      event({
        changeQty: "100.000000",
        unitCost: null,
        costAmount: null,
      }),
      event({
        bizDate: "2026-01-02",
        direction: "OUT",
        operationType: "OUTBOUND_OUT",
        businessModule: "sales",
        businessDocumentType: "SalesStockOrder",
        businessDocumentId: 2,
        businessDocumentNumber: "SO-001",
        businessDocumentLineId: 20,
        changeQty: "20.000000",
        unitCost: null,
        idempotencyKey: "SalesStockOrder:2:line:20",
        sortPriority: 1,
      }),
    ]);

    expect(plan.blockers).toHaveLength(0);
    expect(plan.warnings).toEqual(
      expect.arrayContaining([
        expect.stringContaining("Accepted zero-cost source"),
      ]),
    );
    expect(plan.plannedLogs[0]).toMatchObject({
      unitCost: "0.00",
      costAmount: "0.00",
      note: "Accepted zero-cost source: unknown price or gifted item.",
    });
    expect(plan.plannedLogs[1]).toMatchObject({
      unitCost: "0.00",
      costAmount: "0.00",
    });
    expect(plan.plannedSourceUsages[0]).toMatchObject({
      allocatedQty: "20.000000",
    });
    expect(plan.plannedPriceLayers).toEqual([
      {
        materialId: 100,
        stockScopeId: 1,
        unitCost: "0.00",
        availableQty: "80.000000",
        sourceLogCount: 1,
      },
    ]);
  });

  it("blocks duplicate log keys", () => {
    const plan = buildInventoryReplayPlan([
      event({
        changeQty: "100.000000",
        unitCost: "10.00",
        idempotencyKey: "dup-key",
      }),
      event({
        businessDocumentLineId: 2,
        changeQty: "50.000000",
        unitCost: "12.00",
        idempotencyKey: "dup-key",
      }),
    ]);

    expect(
      plan.blockers.some(
        (b) => b.reason === "duplicate-inventory-log-idempotency-key",
      ),
    ).toBe(true);
  });
});
