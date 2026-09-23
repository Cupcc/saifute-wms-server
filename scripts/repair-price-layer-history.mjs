/** Read-only global historical price-layer audit. Pass --apply only with a backup. */
import mariadb from "mariadb";
import {
  assertPlanDirections,
  copyReversalPlan,
} from "./lib/price-layer-reversal-plan.mjs";

const executionId =
  process.env.PRICE_LAYER_REPAIR_EXECUTION_ID ??
  `price-layer-history-${new Date().toISOString().replace(/[-:.TZ]/g, "")}`;
const apply = process.argv.includes("--apply");
const url = process.env.DATABASE_URL;
if (!url) throw Error("DATABASE_URL required");
const qScale = 1000000n,
  cScale = 10000n;
function scaled(v, scale, digits) {
  const m = /^(-?)(\d+)(?:\.(\d+))?$/.exec(String(v ?? ""));
  if (!m) throw Error(`invalid decimal ${v}`);
  const f = (m[3] ?? "").padEnd(digits, "0");
  if (f.length > digits) throw Error(`decimal precision ${v}`);
  return (m[1] ? -1n : 1n) * (BigInt(m[2]) * scale + BigInt(f || "0"));
}
const q6 = (v) => scaled(v, qScale, 6),
  c4 = (v) => scaled(v, cScale, 4);
const amount = (q, c) => {
  const x = q * c,
    sign = x < 0n ? -1n : 1n,
    a = x < 0n ? -x : x;
  return sign * ((a + qScale / 2n) / qScale);
};
const fmt = (v, d) => {
  const n = v < 0n ? -v : v,
    s = 10n ** BigInt(d);
  return `${v < 0n ? "-" : ""}${n / s}.${(n % s).toString().padStart(d, "0")}`;
};
const conn = await mariadb.createConnection(url.replace(/^mysql:/, "mariadb:"));
const query = (sql, p = []) => conn.query(sql, p);
const [logs, allocs, usages] = await Promise.all([
  query(`SELECT l.* FROM inventory_log l ORDER BY l.id`),
  query(
    `SELECT a.*,s.material_id source_material_id,s.stock_scope_id source_scope_id,s.project_target_id source_project_target_id FROM inventory_log_cost_allocation a JOIN inventory_log s ON s.id=a.source_log_id ORDER BY a.id`,
  ),
  query(
    `SELECT u.*,s.unit_cost source_unit_cost,s.material_id source_material_id,s.stock_scope_id source_scope_id FROM inventory_source_usage u JOIN inventory_log s ON s.id=u.source_log_id`,
  ),
]);
const logBy = new Map(logs.map((x) => [x.id, x])),
  allocBy = new Map(),
  usageBy = new Map();
for (const x of allocs) {
  const a = allocBy.get(x.inventory_log_id) ?? [];
  a.push(x);
  allocBy.set(x.inventory_log_id, a);
}
for (const x of usages) {
  const k = `${x.consumer_document_type}:${x.consumer_document_id}:${x.consumer_line_id}`,
    a = usageBy.get(k) ?? [];
  a.push(x);
  usageBy.set(k, a);
}
const plans = new Map(),
  unresolved = [];
const directionMismatches = [];
for (const allocation of allocs) {
  const log = logBy.get(allocation.inventory_log_id);
  if (log && allocation.direction !== log.direction) {
    directionMismatches.push({
      allocationId: allocation.id,
      inventoryLogId: allocation.inventory_log_id,
      expected: log.direction,
      actual: allocation.direction,
    });
  }
}
for (const l of logs) {
  if (
    l.direction !== "OUT" ||
    !["OUTBOUND_OUT", "PICK_OUT"].includes(l.operation_type) ||
    l.reversal_of_log_id != null ||
    allocBy.has(l.id)
  )
    continue;
  const rows =
      usageBy.get(
        `${l.business_document_type}:${l.business_document_id}:${l.business_document_line_id}`,
      ) ?? [],
    target = q6(l.change_qty),
    alloc = rows.reduce((s, x) => s + q6(x.allocated_qty), 0n),
    net = rows.reduce(
      (s, x) => s + q6(x.allocated_qty) - q6(x.released_qty),
      0n,
    ),
    mode = alloc === target ? "allocated" : net === target ? "net" : null;
  if (!mode) {
    unresolved.push({
      id: l.id,
      doc: l.business_document_number,
      reason: "outbound usage is not uniquely attributable",
    });
    continue;
  }
  const p = [];
  for (const x of rows) {
    const n =
      mode === "allocated"
        ? q6(x.allocated_qty)
        : q6(x.allocated_qty) - q6(x.released_qty);
    if (n <= 0n) continue;
    if (
      x.source_material_id !== l.material_id ||
      x.source_scope_id !== l.stock_scope_id ||
      x.source_unit_cost == null
    ) {
      p.length = 0;
      break;
    }
    const uc = c4(x.source_unit_cost);
    p.push({
      sourceLogId: x.source_log_id,
      direction: "OUT",
      quantity: n,
      unitCost: uc,
      costAmount: amount(n, uc),
    });
  }
  if (p.length) plans.set(l.id, p);
  else
    unresolved.push({
      id: l.id,
      doc: l.business_document_number,
      reason: "source material/scope/cost mismatch",
    });
}
// Reversals copy the plan of the original effective OUT when an older row lacks allocations.
for (const l of logs) {
  if (l.reversal_of_log_id == null || allocBy.has(l.id)) continue;
  const p =
    plans.get(l.reversal_of_log_id) ??
    (allocBy.get(l.reversal_of_log_id) ?? []).map((x) => ({
      sourceLogId: x.source_log_id,
      direction: x.direction,
      quantity: q6(x.quantity),
      unitCost: c4(x.unit_cost),
      costAmount: c4(x.cost_amount),
    }));
  if (p.length) {
    plans.set(l.id, copyReversalPlan(logBy.get(l.reversal_of_log_id), l, p));
  }
}
assertPlanDirections(logBy, plans);
const conflicts = [];
for (const [id, p] of plans) {
  const l = logBy.get(id),
    amt = p.reduce((s, x) => s + x.costAmount, 0n);
  if (c4(l.cost_amount ?? 0) !== amt)
    conflicts.push({
      id,
      oldUnitCost: l.unit_cost,
      oldCostAmount: l.cost_amount,
      newUnitCost: fmt(
        (amt * qScale + q6(l.change_qty) / 2n) / q6(l.change_qty),
        4,
      ),
      newCostAmount: fmt(amt, 4),
      sourceLogId: p.length === 1 ? p[0].sourceLogId : null,
    });
}
console.log(
  JSON.stringify(
    {
      executionId,
      mode: apply ? "apply" : "dry-run",
      totalLogs: logs.length,
      existingAllocationRows: allocs.length,
      plannedLogs: plans.size,
      plannedAllocationRows: [...plans.values()].reduce(
        (s, p) => s + p.length,
        0,
      ),
      directionMismatches,
      costReclassifications: conflicts.length,
      conflicts,
      planned: [...plans].map(([id, p]) => ({
        id,
        pieces: p.map((x) => ({
          sourceLogId: x.sourceLogId,
          direction: x.direction,
          quantity: fmt(x.quantity, 6),
          unitCost: fmt(x.unitCost, 4),
          costAmount: fmt(x.costAmount, 4),
        })),
      })),
      skippedLogs: unresolved.length,
      skipped: unresolved,
    },
    null,
    2,
  ),
);
if (!apply) {
  await conn.end();
  process.exit(0);
}
if (directionMismatches.length) {
  await conn.end();
  throw Error(
    "Existing allocation directions require an evidence-backed repair before applying",
  );
}
await conn.beginTransaction();
try {
  await query(
    `CREATE TABLE IF NOT EXISTS inventory_log_cost_reclassification (id BIGINT NOT NULL AUTO_INCREMENT,inventory_log_id INT NOT NULL,business_document_type VARCHAR(64) NULL,business_document_id INT NULL,business_document_line_id INT NULL,old_unit_cost DECIMAL(18,4) NOT NULL,old_cost_amount DECIMAL(18,4) NOT NULL,new_unit_cost DECIMAL(18,4) NOT NULL,new_cost_amount DECIMAL(18,4) NOT NULL,source_log_id INT NULL,reason VARCHAR(500) NOT NULL,execution_id VARCHAR(128) NOT NULL,created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),PRIMARY KEY(id),UNIQUE KEY uq_cost_reclass_execution_log(execution_id,inventory_log_id)) ENGINE=InnoDB`,
  );
  for (const [id, p] of plans)
    for (const x of p)
      if (x.sourceLogId != null)
        await query(
          `INSERT IGNORE INTO inventory_log_cost_allocation(inventory_log_id,source_log_id,direction,quantity,unit_cost,cost_amount) VALUES (?,?,?,?,?,?)`,
          [
            id,
            x.sourceLogId,
            x.direction,
            fmt(x.quantity, 6),
            fmt(x.unitCost, 4),
            fmt(x.costAmount, 4),
          ],
        );
  for (const x of conflicts) {
    const l = logBy.get(x.id);
    await query(
      `INSERT IGNORE INTO inventory_log_cost_reclassification(inventory_log_id,business_document_type,business_document_id,business_document_line_id,old_unit_cost,old_cost_amount,new_unit_cost,new_cost_amount,source_log_id,reason,execution_id) VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
      [
        x.id,
        l.business_document_type,
        l.business_document_id,
        l.business_document_line_id,
        l.unit_cost,
        l.cost_amount,
        x.newUnitCost,
        x.newCostAmount,
        x.sourceLogId,
        "historical source-backed cost reclassification",
        executionId,
      ],
    );
    await query(
      `UPDATE inventory_log SET unit_cost=?,cost_amount=? WHERE id=?`,
      [x.newUnitCost, x.newCostAmount, x.id],
    );
    if (l.business_document_type === "SalesStockOrder")
      await query(
        `UPDATE sales_stock_order_line SET cost_unit_price=?,cost_amount=? WHERE id=?`,
        [x.newUnitCost, x.newCostAmount, l.business_document_line_id],
      );
    if (l.business_document_type === "WorkshopMaterialOrder")
      await query(
        `UPDATE workshop_material_order_line SET cost_unit_price=?,cost_amount=? WHERE id=?`,
        [x.newUnitCost, x.newCostAmount, l.business_document_line_id],
      );
  }
  await conn.commit();
  console.log(JSON.stringify({ applied: true, executionId }));
} catch (e) {
  await conn.rollback();
  throw e;
} finally {
  await conn.end();
}
