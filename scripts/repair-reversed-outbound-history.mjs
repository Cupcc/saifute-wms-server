/** One-off, evidence-backed repair. Default is read-only; see the task record. */
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import mariadb from "mariadb";
import {
  assertPlanDirections,
  copyReversalPlan,
} from "./lib/price-layer-reversal-plan.mjs";

const evidence = [
  {
    id: 41718,
    reversalId: 41746,
    mode: "released",
    pieces: [
      [36649, "5"],
      [38378, "2"],
    ],
  },
  {
    id: 41733,
    reversalId: 46541,
    mode: "released",
    pieces: [
      [41549, "10"],
      [41711, "25"],
    ],
  },
  // The pre-recovery audit records these original 2-unit usages; current
  // usages are cumulative 6-unit replacements and are not historical totals.
  {
    id: 43184,
    reversalId: 43234,
    mode: "recovery-audit",
    pieces: [[42005, "2"]],
  },
  {
    id: 43185,
    reversalId: 43236,
    mode: "recovery-audit",
    pieces: [[42004, "2"]],
  },
  { id: 44846, reversalId: 45158, mode: "released", pieces: [[43963, "20"]] },
  {
    id: 47113,
    reversalId: 47445,
    mode: "released",
    pieces: [
      [46296, "1"],
      [47111, "3"],
    ],
  },
  { id: 48081, reversalId: 48101, mode: "released", pieces: [[47545, "100"]] },
  // Approved 2026-09-22: reconstruct the pre-revision FIFO split.
  {
    id: 43980,
    reversalId: 43981,
    mode: "approved-fifo",
    pieces: [
      [43262, "5"],
      [43257, "29"],
    ],
  },
  {
    id: 43984,
    reversalId: 44441,
    mode: "approved-fifo",
    pieces: [[43904, "90"]],
  },
];
const apply = process.argv.includes("--apply");
const executionId = `reversed-outbound-history-${new Date().toISOString().replace(/[-:.TZ]/g, "")}`;
const json = (value) =>
  JSON.stringify(value, (_, x) => (typeof x === "bigint" ? String(x) : x), 2);
const scaled = (value, digits) => {
  const match = /^(\d+)(?:\.(\d+))?$/.exec(String(value));
  if (!match || (match[2] ?? "").length > digits)
    throw Error(`Invalid decimal: ${value}`);
  return BigInt(match[1] + (match[2] ?? "").padEnd(digits, "0"));
};
const format = (value, digits) => {
  const text = value.toString().padStart(digits + 1, "0");
  return `${text.slice(0, -digits)}.${text.slice(-digits)}`;
};
const q6 = (v) => scaled(v, 6);
const c4 = (v) => scaled(v, 4);
const check = (condition, message) => {
  if (!condition) throw Error(message);
};
let auditDirectory;
let backup;
if (apply) {
  const file = process.env.PRICE_LAYER_REPAIR_BACKUP_PATH;
  const expectedHash = process.env.PRICE_LAYER_REPAIR_BACKUP_SHA256;
  check(file && expectedHash, "Apply requires a backup path and SHA-256");
  const bytes = await readFile(file);
  const hash = createHash("sha256").update(bytes).digest("hex");
  check(bytes.length > 0 && hash === expectedHash, "Backup checksum mismatch");
  backup = { file, sha256: hash };
  auditDirectory = path.join(path.dirname(file), executionId);
  await mkdir(auditDirectory, { mode: 0o700 });
}
const conn = await mariadb.createConnection(
  process.env.DATABASE_URL.replace(/^mysql:/, "mariadb:"),
);
const selectIds = (table, ids, lock = false) =>
  conn.query(
    `SELECT * FROM ${table} WHERE id IN (${ids.map(() => "?").join(",")}) ORDER BY id${lock ? " FOR UPDATE" : ""}`,
    ids,
  );
try {
  await conn.query(apply ? "START TRANSACTION" : "START TRANSACTION READ ONLY");
  const ids = evidence.flatMap((e) => [e.id, e.reversalId]);
  const sourceIds = evidence.flatMap((e) => e.pieces.map((p) => p[0]));
  const logs = await selectIds(
    "inventory_log",
    [...new Set([...ids, ...sourceIds])],
    apply,
  );
  const logBy = new Map(logs.map((l) => [l.id, l]));
  const balanceIds = [...new Set(logs.map((l) => l.balance_id))];
  const balances = await selectIds("inventory_balance", balanceIds, apply);
  const allocations = await conn.query(
    `SELECT * FROM inventory_log_cost_allocation WHERE inventory_log_id IN (${ids.map(() => "?").join(",")}) ORDER BY id${apply ? " FOR UPDATE" : ""}`,
    ids,
  );
  const plans = new Map();
  const usages = [];
  for (const e of evidence) {
    const log = logBy.get(e.id);
    const reversal = logBy.get(e.reversalId);
    check(
      log &&
        reversal &&
        log.direction === "OUT" &&
        log.operation_type === "OUTBOUND_OUT",
      `Unexpected log ${e.id}`,
    );
    check(
      log.business_document_type === reversal.business_document_type &&
        log.business_document_id === reversal.business_document_id &&
        log.business_document_line_id === reversal.business_document_line_id,
      `Document mismatch ${e.id}`,
    );
    check(
      log.cost_amount === reversal.cost_amount,
      `Reversal cost mismatch ${e.id}`,
    );
    const pieces = [];
    for (const [sourceId, quantity] of e.pieces) {
      const source = logBy.get(sourceId);
      check(
        source &&
          source.direction === "IN" &&
          source.material_id === log.material_id &&
          source.stock_scope_id === log.stock_scope_id &&
          source.id < log.id,
        `Source mismatch ${e.id}/${sourceId}`,
      );
      const usageRows = await conn.query(
        `SELECT * FROM inventory_source_usage WHERE source_log_id=? AND consumer_document_type=? AND consumer_document_id=? AND consumer_line_id=?${apply ? " FOR UPDATE" : ""}`,
        [
          sourceId,
          log.business_document_type,
          log.business_document_id,
          log.business_document_line_id,
        ],
      );
      check(usageRows.length === 1, `Usage is not unique ${e.id}/${sourceId}`);
      const usage = usageRows[0];
      check(
        q6(usage.allocated_qty) >= q6(quantity),
        `Insufficient evidence ${e.id}/${sourceId}`,
      );
      check(
        e.mode !== "released" || q6(usage.released_qty) === q6(quantity),
        `Released history changed ${e.id}/${sourceId}`,
      );
      check(
        e.mode !== "recovery-audit" ||
          (q6(usage.allocated_qty) === q6("6") &&
            q6(usage.released_qty) === 0n),
        `Recovery evidence changed ${e.id}/${sourceId}`,
      );
      check(
        e.mode !== "approved-fifo" || source.biz_date <= log.biz_date,
        `Approved FIFO source is later than outbound ${e.id}/${sourceId}`,
      );
      check(
        c4(source.unit_cost) === c4(log.unit_cost),
        `Historical cost conflict ${e.id}/${sourceId}`,
      );
      usages.push(...usageRows);
      pieces.push({
        sourceLogId: sourceId,
        direction: "OUT",
        quantity: format(q6(quantity), 6),
        unitCost: source.unit_cost,
        costAmount: format(
          (q6(quantity) * c4(source.unit_cost) + 500000n) / 1000000n,
          4,
        ),
      });
    }
    check(
      pieces.reduce((sum, p) => sum + q6(p.quantity), 0n) ===
        q6(log.change_qty),
      `Quantity mismatch ${e.id}`,
    );
    check(
      pieces.reduce((sum, p) => sum + c4(p.costAmount), 0n) ===
        c4(log.cost_amount),
      `Cost mismatch ${e.id}`,
    );
    plans.set(e.id, pieces);
    plans.set(e.reversalId, copyReversalPlan(log, reversal, pieces));
  }
  assertPlanDirections(logBy, plans);
  const missing = [];
  for (const [id, pieces] of plans) {
    const existing = allocations.filter((a) => a.inventory_log_id === id);
    check(
      existing.length === 0 || existing.length === pieces.length,
      `Partial allocation exists ${id}`,
    );
    for (const p of pieces) {
      if (!existing.length) {
        missing.push({ inventoryLogId: id, ...p });
        continue;
      }
      const found = existing.find((a) => a.source_log_id === p.sourceLogId);
      check(
        found &&
          found.direction === p.direction &&
          q6(found.quantity) === q6(p.quantity) &&
          c4(found.unit_cost) === c4(p.unitCost) &&
          c4(found.cost_amount) === c4(p.costAmount),
        `Conflicting allocation ${id}/${p.sourceLogId}`,
      );
    }
  }
  const report = {
    executionId,
    mode: apply ? "apply" : "dry-run",
    backup,
    plannedLogs: plans.size,
    missingAllocationRows: missing.length,
    planned: missing,
  };
  console.log(json(report));
  if (apply) {
    await writeFile(
      path.join(auditDirectory, "before.json"),
      json({ ...report, logs, allocations, usages, balances }),
      { flag: "wx", mode: 0o600 },
    );
    for (const p of missing) {
      await conn.query(
        "INSERT INTO inventory_log_cost_allocation (inventory_log_id,source_log_id,direction,quantity,unit_cost,cost_amount) VALUES (?,?,?,?,?,?)",
        [
          p.inventoryLogId,
          p.sourceLogId,
          p.direction,
          p.quantity,
          p.unitCost,
          p.costAmount,
        ],
      );
    }
    check(
      json(await selectIds("inventory_balance", balanceIds)) === json(balances),
      "Inventory balance changed",
    );
    check(
      json(
        await selectIds("inventory_log", [...new Set([...ids, ...sourceIds])]),
      ) === json(logs),
      "Inventory log changed",
    );
    const after = await conn.query(
      `SELECT * FROM inventory_log_cost_allocation WHERE inventory_log_id IN (${ids.map(() => "?").join(",")}) ORDER BY id`,
      ids,
    );
    check(
      after.length ===
        [...plans.values()].reduce((sum, p) => sum + p.length, 0),
      "Incomplete repair",
    );
    await writeFile(
      path.join(auditDirectory, "validated.json"),
      json({
        ...report,
        allocations: after,
        balancesUnchanged: true,
        logsUnchanged: true,
      }),
      { flag: "wx", mode: 0o600 },
    );
    await conn.commit();
    await writeFile(
      path.join(auditDirectory, "committed.json"),
      json({ executionId, committed: true, insertedRows: missing.length }),
      { flag: "wx", mode: 0o600 },
    );
    console.log(
      json({
        applied: true,
        executionId,
        insertedRows: missing.length,
        auditDirectory,
      }),
    );
  } else {
    await conn.rollback();
  }
} catch (error) {
  await conn.rollback();
  throw error;
} finally {
  await conn.end();
}
