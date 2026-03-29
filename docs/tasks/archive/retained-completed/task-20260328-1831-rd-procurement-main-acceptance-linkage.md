# RD Procurement Main-Acceptance Linkage Foundation

## Metadata

- Scope: open the next bounded RD slice by making RD procurement requests a truthful upstream business fact and linking them to main-warehouse acceptance selection/autofill, while preserving the already-landed `RD handoff` stock boundary and explicitly deferring RD material-state chain, stocktake, and final smoke
- Related requirement: `docs/requirements/archive/retained-completed/req-20260328-1831-rd-procurement-main-acceptance-linkage.md`
- Status: `completed`
- Review status: `reviewed-no-findings`
- Lifecycle disposition: `retained-completed`
- Planner: `assistant`
- Coder: `assistant`
- Reviewer: `assistant`
- Last updated: `2026-03-29`

## Requirement Alignment

- Requirement doc:
  - `docs/requirements/archive/retained-completed/req-20260328-1831-rd-procurement-main-acceptance-linkage.md`
- User intent summary:
  - continue RD with a fresh slice instead of smoke-testing now
  - defer live smoke until the broader RD bundle is complete
  - prioritize the smallest upstream slice after `RD handoff foundation`
- Acceptance criteria carried into this task:
  - RD-side procurement request becomes a real, queryable upstream fact instead of requirement-only wording
  - main-warehouse acceptance can select/link the RD procurement request and auto-fill relevant content
  - stock still posts into main warehouse first; RD inventory is not written at acceptance time
  - this slice does not silently absorb RD material-state chain or RD stocktake/adjustment

## Requirement Sync

- Req-facing phase progress:
  - `RD handoff foundation` archive baseline has been extended with a completed procurement/acceptance linkage slice
- Req-facing current state:
  - RD procurement request is now a real persisted/readable source, and main-warehouse acceptance can select it, auto-fill content, and keep the “先入主仓” stock boundary intact
- Req-facing blockers:
  - None
- Req-facing next step:
  - archive this slice; future RD work should reopen under a new task for material-state chain or stocktake/adjustment
- Requirement doc sync owner:
  - `assistant`

## Goal And Acceptance Criteria

- Goal:
  - land the smallest safe RD follow-up slice after handoff foundation by introducing an honest procurement-request source and main-warehouse acceptance linkage, so later RD material-state and reporting slices can build on it
- Acceptance criteria:
  - [x] RD-side procurement request has an explicit persistence/read model and can be created/listed truthfully
  - [x] procurement request remains project-bound or project-style attributable, consistent with RD rules
  - [x] main-warehouse acceptance can reference the RD procurement request and auto-fill request-derived content without changing “先入主仓”的 inventory semantics
  - [x] the linkage is traceable and queryable from both sides where appropriate
  - [x] no stock write goes to RD at acceptance time; real RD stock movement still waits for the archived handoff capability
  - [x] live smoke is intentionally deferred and not treated as a blocker for this slice alone

## Delivered Changes

- Backend:
  - added `RdProcurementRequest` / `RdProcurementRequestLine` persistence models and Prisma relations for truthful RD procurement source data
  - added `rd-subwarehouse/procurement-requests` list/get/create/void controller, repository, service, DTOs, and focused service tests
  - extended `StockInOrder` / `StockInOrderLine` to persist RD procurement linkage snapshots and per-line source references
  - enforced linked-acceptance invariants inside `inbound`: only `ACCEPTANCE` may link RD procurement, linked acceptance must still post into `MAIN`, supplier must stay consistent, and cumulative accepted quantity may not exceed the linked RD request line quantity
- Frontend:
  - added `web/src/views/rd/procurement-requests/index.vue` and API bindings for RD procurement request create/query/detail/void
  - exposed the new page from RD navigation and workbench quick actions
  - extended the acceptance page so main-warehouse users can search RD procurement requests, select one, auto-fill supplier/material lines, persist the link, and view traceability in acceptance detail
- Permissions / routes:
  - added `rd:procurement-request:{list,create,void}` permissions plus route visibility so RD operators can record requests, main-warehouse operators can view/select requests, and system-level users keep visibility

## Validation And Review

- Validation results:
  - `pnpm prisma:generate`
  - `pnpm prisma:validate`
  - `pnpm swagger:metadata`
  - `pnpm typecheck`
  - `pnpm test -- src/modules/rd-subwarehouse/application/rd-procurement-request.service.spec.ts src/modules/inbound/application/inbound.service.spec.ts`
  - `pnpm test`
  - `pnpm --dir web build:prod`
- Review findings:
  - initial review found two blocking issues: cumulative over-acceptance on the same RD procurement line, and acceptance-page search semantics using AND filters under an OR-style UI promise
  - both blocking issues were fixed and re-reviewed; closing re-review reported no remaining blocking/important findings
- Residual risks:
  - app-layer cumulative acceptance protection now covers normal serial flows and tests, but future high-concurrency acceptance/update scenarios may still justify stronger locking or database-level constraints if this slice is expanded
  - live smoke remains intentionally deferred until the broader RD bundle is complete

## Final Status

- Outcome:
  - completed and archived as the retained-completed procurement/acceptance linkage baseline for the RD track
- Requirement alignment:
  - this task delivered only RD procurement request truth source plus main acceptance linkage foundation, and did not widen into material-state chain or stocktake/adjustment
- Directory disposition after completion:
  - archived to `docs/tasks/archive/retained-completed/`, paired with archived requirement and workspace records
- Next action:
  - if RD work continues, open the next bounded slice for independent material-state chain or RD stocktake/adjustment, while keeping final smoke deferred until the RD bundle is ready
