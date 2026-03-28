# RD Subwarehouse Main-To-RD Handoff Foundation

## Metadata

- Scope: turn the confirmed "main warehouse document completes -> RD subwarehouse auto-posts without secondary receipt confirmation" rule into a truthful active slice, so the current RD "自动入库结果" surface is backed by real handoff orchestration and stable read semantics instead of a Phase 1 placeholder
- Related requirement: `docs/requirements/req-20260326-0048-rd-subwarehouse.md`
- Status: `planned`
- Review status: `not-reviewed`
- Lifecycle disposition: `active`
- Planner: `assistant`
- Coder: `assistant`
- Reviewer: `assistant`
- Last updated: `2026-03-28`
- Related checklist:
- Related files:
  - `docs/requirements/req-20260326-0048-rd-subwarehouse.md`
  - `docs/tasks/TASK_CENTER.md`
  - `docs/workspace/rd-subwarehouse/README.md`
  - `docs/architecture/modules/rd-subwarehouse.md`
  - `docs/architecture/modules/inbound.md`
  - `docs/architecture/modules/inventory-core.md`
  - `docs/architecture/modules/rbac.md`
  - `docs/architecture/modules/reporting.md`
  - `docs/architecture/modules/session.md`
  - `src/modules/rd-subwarehouse/**`
  - `src/modules/inbound/**`
  - `src/modules/inventory-core/**`
  - `src/modules/rbac/**`
  - `src/modules/reporting/**`
  - `web/src/router/index.js`
  - `web/src/store/modules/permission.js`
  - `web/src/api/**`
  - `web/src/views/**`

## Requirement Alignment

- Requirement doc:
  - `docs/requirements/req-20260326-0048-rd-subwarehouse.md`
- User intent summary:
  - before further delivery, verify the requirement/task/architecture state is still clear and not drifting
  - after the clarity check, continue delivery from a fresh active slice instead of reusing the archived Phase 1 task
  - prioritize the most architecture-critical remaining gap first, so later procurement/state/stocktake slices build on a truthful RD handoff foundation
- Acceptance criteria carried into this task:
  - "主仓发料 / 调拨到小仓" becomes a real business fact with automatic posting semantics, not just wording in the requirement
  - RD users still do not perform a second receipt confirmation
  - stock mutations continue to go only through `inventory-core`
  - the current RD "自动入库结果" view reflects true handoff results/read models rather than implying a capability that is not yet implemented
  - RD procurement request linkage, independent material-state chain, and RD stocktake/adjustment remain explicitly deferred
- Open questions requiring user confirmation:
  - None for opening this planning slice. If implementation proves that a new persistence shape is unavoidable, surface that schema decision before changing any frozen baseline.

## Requirement Sync

- Req-facing phase progress:
  - Phase 1 has already closed cleanly; this new active task exists to continue the same confirmed requirement with the next bounded slice instead of treating the archived task as a fake resume anchor
- Req-facing current state:
  - requirement/task/workspace/architecture wording is aligned after a state-clarity check; the requirement remains `active`, but there was no active task before this doc
- Req-facing blockers:
  - None
- Req-facing next step:
  - implement the constrained main-to-RD auto-handoff orchestration and make the RD handoff result surface semantically truthful
- Requirement doc sync owner:
  - `assistant`

## Goal And Acceptance Criteria

- Goal:
  - deliver the next bounded RD slice by formalizing the main-warehouse-to-RD handoff as a real orchestration boundary, while preserving the confirmed "受限子仓模型" and avoiding premature expansion into generic multi-warehouse or procurement/status work
- Acceptance criteria:
  - one explicit main-side completion event or document fact is chosen as the only trigger for RD auto-posting
  - the resulting stock movement records `main warehouse - / RD workshop +` through `inventory-core`, with idempotent protection against duplicate posting
  - RD users do not need to acknowledge or receive the transfer manually
  - the RD "自动入库结果" list/query is backed by the new truthful handoff result source or stable read model
  - permission/routing/session constraints remain consistent with the existing RD isolation model
  - this slice does not silently absorb RD procurement request capture, main-warehouse acceptance linkage, independent material-state transitions, or RD stocktake/adjustment write flows

## Scope And Ownership

- Allowed code paths:
  - `docs/tasks/task-20260328-1640-rd-subwarehouse-main-to-rd-handoff-foundation.md`
  - `docs/tasks/TASK_CENTER.md`
  - `src/modules/rd-subwarehouse/**`
  - `src/modules/inbound/**`
  - `src/modules/inventory-core/**`
  - `src/modules/rbac/**`
  - `src/modules/reporting/**`
  - `web/src/router/index.js`
  - `web/src/store/modules/permission.js`
  - `web/src/api/**`
  - `web/src/views/**`
- Frozen or shared paths:
  - `docs/requirements/**`, `docs/workspace/**`, and `docs/architecture/**` stay parent-owned except for explicit progress sync in the same delivery
  - `prisma/**` and `src/generated/**` are shared/frozen unless the parent explicitly expands scope after a surfaced persistence decision
  - `src/modules/project/**` and `src/modules/workshop-material/**` are out of scope for this slice unless a real integration blocker appears
- Task doc owner:
  - `assistant`
- Contracts that must not change silently:
  - `inventory-core` remains the only stock write entry point
  - `inbound` still owns "货到主仓 / 验收入主仓" facts rather than directly becoming RD inbound
  - `consoleMode` remains a view-shell selector, not a permissions substitute
  - RD handoff semantics stay constrained to "主仓 + 一个研发小仓" and must not widen into a generic warehouse framework
  - `reporting` remains read-only

## Implementation Plan

- [ ] Reconfirm the truthful handoff trigger: identify which current main-side completion fact should produce the RD auto-posting event/result
- [ ] Define the handoff orchestration contract, idempotency boundary, and read-model shape without widening the system into generic multi-warehouse
- [ ] Implement backend orchestration and `inventory-core` integration for `main - / RD +`
- [ ] Align the RD "自动入库结果" query/UI to the truthful handoff result source
- [ ] Add focused validation for duplicate-trigger safety, stock correctness, and RD visibility/isolation

## Coder Handoff

- Execution brief:
  - implement only the main-to-RD auto-handoff foundation for the confirmed RD requirement
  - prefer one explicit, honest orchestration path over scattered implicit behavior in multiple modules
  - keep deferred procurement/state/stocktake work clearly deferred; do not fake completeness
- Required source docs or files:
  - `docs/requirements/req-20260326-0048-rd-subwarehouse.md`
  - `docs/workspace/rd-subwarehouse/README.md`
  - `docs/architecture/modules/rd-subwarehouse.md`
  - `docs/architecture/modules/inbound.md`
  - `docs/architecture/modules/inventory-core.md`
  - `docs/architecture/modules/rbac.md`
  - `docs/architecture/modules/reporting.md`
  - `docs/architecture/modules/session.md`
- Owned paths:
  - same as Allowed code paths
- Forbidden shared files:
  - `docs/requirements/**`
  - `docs/workspace/**`
  - `docs/architecture/**`
  - `src/modules/project/**`
  - `src/modules/workshop-material/**`
  - archived task docs
- Constraints and non-goals:
  - do not convert this into generic multi-warehouse, transfer-family, or warehouse-master-data work
  - do not let `inbound` collapse "到主仓" and "转入 RD" into one fact
  - do not bypass `inventory-core` for any stock mutation
  - do not claim RD procurement linkage, material-state transitions, or RD stocktake/adjustment as complete in this slice
  - if a new persistence artifact is truly required, keep it narrow to this handoff contract and surface the decision clearly
- Validation command for this scope:
  - `pnpm swagger:metadata && pnpm typecheck`
  - `pnpm test -- --runInBand`
  - `pnpm --dir web build:prod`
  - manual smoke: RD user can see truthful handoff results without gaining a manual receipt flow or leaking main-warehouse menus

## Reviewer Handoff

- Review focus:
  - the handoff trigger is singular and truthful, not duplicated across multiple document paths
  - duplicate execution cannot double-post stock
  - `inbound` / `inventory-core` / RD read model responsibilities stay separated correctly
  - RD UI/result wording stays honest after the slice
  - no hidden drift toward generic multi-warehouse
- Requirement alignment check:
  - confirm this slice materially closes the already-confirmed "主仓自动交接到 RD" gap
  - confirm deferred procurement/state/stocktake items remain explicitly open
- Final validation gate:
  - `pnpm swagger:metadata && pnpm typecheck`
  - `pnpm test -- --runInBand`
  - `pnpm --dir web build:prod`
  - focused/manual RD smoke on the handoff result path
- Required doc updates:
  - keep this task doc current
  - sync concise progress back to the requirement and RD workspace at meaningful milestones

## Parallelization Safety

- Status: `not-safe`
- If not safe, list the shared files or contracts that require a single writer:
  - the handoff contract spans `inbound`, `inventory-core`, RD read semantics, and route/permission presentation, so one writer should preserve a single truth source
  - idempotency and stock correctness depend on shared document/result semantics that are easy to drift if split across multiple writers

## Review Log

- Validation results:
  - None yet
- Findings:
  - None yet
- Follow-up action:
  - start execution against this task doc when the user wants the next RD slice implemented

## Final Status

- Outcome:
  - planning only; active handoff-foundation task opened
- Requirement alignment:
  - the task continues the active RD requirement without pretending the archived Phase 1 slice is still open
- Residual risks or testing gaps:
  - code implementation has not started yet
  - procurement linkage, material-state chain, and RD stocktake/adjustment remain separate follow-up scopes
- Directory disposition after completion: keep `active` until this handoff slice is implemented/reviewed/closed, then archive to `retained-completed` or `cleanup-candidate` with `docs/tasks/TASK_CENTER.md` synced in the same turn
- Next action:
  - execute the handoff slice from this doc, then sync milestone progress back to the requirement and RD workspace
