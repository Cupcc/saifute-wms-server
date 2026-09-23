import assert from "node:assert/strict";
import { test } from "node:test";
import {
  assertPlanDirections,
  copyReversalPlan,
} from "./price-layer-reversal-plan.mjs";

const original = {
  id: 10,
  material_id: 2,
  stock_scope_id: 1,
  direction: "OUT",
  change_qty: "7.000000",
};
const reversal = {
  ...original,
  id: 11,
  reversal_of_log_id: 10,
  direction: "IN",
};
const pieces = [
  {
    sourceLogId: 1,
    direction: "OUT",
    quantity: 5000000n,
    unitCost: 1160000n,
    costAmount: 5800000n,
  },
  {
    sourceLogId: 2,
    direction: "OUT",
    quantity: 2000000n,
    unitCost: 1160000n,
    costAmount: 2320000n,
  },
];

test("a newly planned outbound and its reversal have opposite directions without mutating the original", () => {
  const plans = new Map([[10, pieces]]);
  plans.set(11, copyReversalPlan(original, reversal, plans.get(10)));
  assert.deepEqual(
    plans.get(11),
    pieces.map((piece) => ({ ...piece, direction: "IN" })),
  );
  assert.ok(plans.get(10).every((piece) => piece.direction === "OUT"));
  assertPlanDirections(
    new Map([
      [10, original],
      [11, reversal],
    ]),
    plans,
  );
});

test("reversing a receipt preserves its costs and switches allocations to OUT", () => {
  const receipt = { ...original, direction: "IN" };
  const reverseOut = { ...reversal, direction: "OUT" };
  assert.deepEqual(
    copyReversalPlan(
      receipt,
      reverseOut,
      pieces.map((p) => ({ ...p, direction: "IN" })),
    ),
    pieces,
  );
});

test("mismatched material, scope, quantity, reference or direction cannot be copied", () => {
  for (const patch of [
    { material_id: 3 },
    { stock_scope_id: 2 },
    { change_qty: "8.000000" },
    { reversal_of_log_id: 9 },
    { direction: "OUT" },
    { direction: "UNKNOWN" },
  ]) {
    assert.throws(
      () => copyReversalPlan(original, { ...reversal, ...patch }, pieces),
      /Invalid reversal evidence/,
    );
  }
  assert.throws(
    () =>
      copyReversalPlan(
        original,
        reversal,
        pieces.map((p) => ({ ...p, direction: "IN" })),
      ),
    /Invalid reversal evidence/,
  );
});

test("plan validation rejects the original OUT pieces reused by an IN reversal", () => {
  assert.throws(
    () =>
      assertPlanDirections(new Map([[11, reversal]]), new Map([[11, pieces]])),
    /direction mismatch/,
  );
});
