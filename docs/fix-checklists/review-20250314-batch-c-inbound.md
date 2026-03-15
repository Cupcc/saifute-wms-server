# Batch C Inbound Code Review

## Review Scope

- **Branch/context**: Uncommitted Batch C inbound implementation
- **Modules**: `inbound` (new), shared changes in `workflow`, `master-data`, `inventory-core`, `app.module`
- **Files reviewed**:
  - `src/modules/inbound/**`
  - `src/modules/workflow/application/workflow.service.ts`
  - `src/modules/master-data/application/master-data.service.ts`
  - `src/modules/master-data/infrastructure/master-data.repository.ts`
  - `src/modules/inventory-core/application/inventory.service.ts`
  - `src/modules/inventory-core/infrastructure/inventory.repository.ts`
  - `src/app.module.ts`
- **Source of truth**: `docs/00-architecture-overview.md`, `docs/10-subagent-build-batches.md`, `docs/20-wms-business-flow-and-optimized-schema.md`, `docs/modules/inbound.md`, `docs/modules/workflow.md`

---

## Fix Checklist

- [x] [blocking] **WorkflowService.createOrRefreshAuditDocument does not reset audit status on modification**: Fixed. `workflow.service.ts` upsert `update` block now sets `auditStatus: PENDING`, `decidedBy: null`, `decidedAt: null`, `rejectReason: null`, `resetCount: { increment: 1 }`, `lastResetAt: new Date()` when an existing audit document is refreshed. Inbound `updateOrder` calls `createOrRefreshAuditDocument` in the same transaction, so order snapshot and workflow record stay consistent per "单据修改后默认重置为待审".

- [x] [important] **Workflow audit document not updated on void**: Fixed. `voidOrder` now calls `workflowService.markAuditNotRequired(DOCUMENT_TYPE, id, voidedBy, tx)` after updating the order. The workflow record is set to `NOT_REQUIRED`, matching the order's `auditStatusSnapshot`.

- [ ] [suggestion] **Add DB-backed integration tests for inbound document flow**: `docs/modules/inbound.md` lists "验收单创建与库存增加测试, 修改单据后审核重置测试, 作废冲回库存测试, 明细差异更新测试". Current tests are unit tests with mocks. Batch C requires "单据流一致性测试" (`docs/10-subagent-build-batches.md` §6). Add integration tests that hit a real DB (or test DB) for: create order → verify inventory increase; update order → verify audit reset; void order → verify inventory reversal; line add/delete/update → verify inventory delta.

- [x] [suggestion] **hasActiveDownstreamDependencies uses string literals**: Fixed. `inbound.repository.ts` uses `DocumentFamily.STOCK_IN` for both `documentRelation` and `documentLineRelation` (lines 165, 172).

---

## Integration Test Results

- **Commands run by parent**: `pnpm lint && pnpm test`
- **Result**: All passed (validation evidence)
- **Inbound unit tests**: 9 passed (`inbound.service.spec.ts`)
- **Batch C gate**: `pnpm lint && pnpm test` — **satisfied** for this scope

---

## Open Questions

- None.

---

## Residual Risks Or Testing Gaps

- **No DB-backed integration tests** for inbound document flow. Inventory, workflow, and audit consistency are covered only by unit tests with mocks.
- **Production receipt (into-order)** route: `GET /inbound/into-orders`
- **Production receipt** has no `GET /inbound/into-orders/:id`; clients use `GET /inbound/orders/:id` for both. Documented as acceptable.
- **Audit log** integration: inbound doc mentions "操作审计" but audit-log module is Batch D; not implemented yet.

---

## Short Summary

Batch C inbound implementation: atomic orchestration with inventory-core and workflow in the same transaction, proper use of `increaseStock`/`reverseStock` via inventory-core, line-aware update with delta-based inventory recalculation, and downstream dependency check before void. **Blocking and important fixes applied**: (1) `createOrRefreshAuditDocument` upsert update block now resets audit status to PENDING on modification; (2) `voidOrder` calls `markAuditNotRequired` so workflow audit document stays consistent with order. Batch C gate (`pnpm lint && pnpm test`) satisfied. Main remaining gap: DB-backed integration tests for document-flow consistency.
