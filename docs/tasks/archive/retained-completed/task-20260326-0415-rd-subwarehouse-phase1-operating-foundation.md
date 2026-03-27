# RD Subwarehouse Phase 1 Operating Foundation

## Metadata

- Scope: establish a first usable `rd-subwarehouse` slice by reusing the current `workshop` inventory dimension as the constrained subwarehouse carrier, adding an RD-only workbench and workshop-scoped read/write flows, without widening into generic multi-warehouse, procurement-chain, or stocktake/adjustment work in the same slice
- Related requirement: `docs/requirements/req-20260326-0048-rd-subwarehouse.md`
- Status: `completed`
- Review status: `reviewed-no-findings`
- Lifecycle disposition: `retained-completed`
- Planner: `assistant`
- Coder: `assistant`
- Reviewer: `assistant`
- Last updated: `2026-03-26`
- Related checklist:
- Related files:
  - `docs/requirements/req-20260326-0048-rd-subwarehouse.md`
  - `docs/tasks/TASK_CENTER.md`
  - `docs/workspace/rd-subwarehouse/README.md`
  - `docs/architecture/00-architecture-overview.md`
  - `docs/architecture/20-wms-business-flow-and-optimized-schema.md`
  - `docs/architecture/modules/inventory-core.md`
  - `docs/architecture/modules/project.md`
  - `docs/architecture/modules/workshop-material.md`
  - `docs/architecture/modules/reporting.md`
  - `docs/architecture/modules/rbac.md`
  - `src/modules/rbac/**`
  - `src/modules/master-data/**`
  - `src/modules/inventory-core/**`
  - `src/modules/inbound/**`
  - `src/modules/project/**`
  - `src/modules/workshop-material/**`
  - `src/modules/reporting/**`
  - `web/src/router/index.js`
  - `web/src/store/modules/permission.js`
  - `web/src/api/**`
  - `web/src/views/**`

## Requirement Alignment

- Requirement doc: `docs/requirements/req-20260326-0048-rd-subwarehouse.md`
- User intent summary:
  - confirmed direction is a constrained "main warehouse + RD small warehouse" collaboration inside one platform, not a second system and not a mere project tag
  - first phase must give RD users an isolated working surface and real warehouse-like operations, while keeping company-level external inbound/outbound in the main warehouse
  - user asked to continue full-scope delivery planning without stopping at an intermediate milestone, but the first executable slice still must be something the current repo can safely deliver
- Acceptance criteria carried into this task:
  - RD users get an isolated workbench centered on one RD subwarehouse context rather than the main warehouse operating surface
  - RD inventory/query/report views are scoped to the RD side only
  - RD issue/领用 remains project-bound
  - local RD scrap is supported from the RD side
  - later slices still need to cover automatic main->RD handoff, procurement chain, material status tracking, and stocktake/adjustment
- Open questions requiring user confirmation:
  - None for planning. During coding, choose a single RD workshop carrier via config/convention instead of inventing a new schema in this slice.

## Requirement Sync

- Req-facing phase progress: slice 1 is now implemented and re-reviewed cleanly, with the RD-only route/menu surface, workshop-fixed read models, project-bound RD issue path, and local RD scrap path validated against the current repo architecture
- Req-facing current state: the first usable RD operating foundation is complete for this task; automatic handoff, procurement linkage, material-state tracking, and stocktake/adjustment remain later slices under the same requirement
- Req-facing blockers: None
- Req-facing next step: sync completion evidence back to the requirement and RD workspace, then open follow-up slices only for the deferred transfer/procurement/stocktake capabilities
- Requirement doc sync owner: `assistant`

## Goal And Acceptance Criteria

- Goal:
  - deliver the first usable RD subwarehouse operating foundation in the current repo by treating one existing `workshop` as the constrained RD subwarehouse carrier, then layering an RD-only workbench and workshop-locked flows on top of already implemented modules
- Acceptance criteria:
  - a dedicated RD route/menu surface exists and does not expose main-warehouse-only operations by default
  - RD inventory balances, inventory logs, inventory summary, and material-category summary are exposed through read models locked to the RD workshop context
  - RD "出库/领用" is implemented by reusing `project` as the project-bound consumption path, with workshop selection fixed to the RD workshop in the RD surface
  - RD local scrap is implemented by reusing `workshop-material` scrap orders with the same workshop lock
  - RD users can inspect inbound results into the RD workshop through a read-only list based on existing `inbound` query capability, even though automatic main->RD source generation is deferred
  - this slice does not introduce a generic `warehouse`/`subwarehouse` schema, procurement request/acceptance linkage, material-state machine, or stocktake/adjustment write flow

## Scope And Ownership

- Allowed code paths:
  - `docs/tasks/TASK_CENTER.md`
  - `src/modules/rbac/**`
  - `src/modules/master-data/**`
  - `src/modules/inventory-core/**`
  - `src/modules/inbound/**`
  - `src/modules/project/**`
  - `src/modules/workshop-material/**`
  - `src/modules/reporting/**`
  - `web/src/router/index.js`
  - `web/src/store/modules/permission.js`
  - `web/src/api/**` for touched RD/inventory/inbound/project/workshop-material/reporting flows
  - `web/src/views/**` for the RD workbench and reused RD-scoped pages
- Frozen or shared paths:
  - `prisma/**` and `src/generated/**` are frozen for this slice; no schema expansion into generic multi-warehouse
  - `docs/requirements/**`, `docs/workspace/**`, and `docs/architecture/**` remain parent-owned except for explicit sync requests outside this planning task
  - `src/modules/auth/**` and `src/modules/session/**` should remain unchanged unless a true blocker appears
- Task doc owner: `assistant`
- Contracts that must not change silently:
  - `inventory-core` remains the only stock write entry point
  - stock dimension in the current repo remains `materialId + workshopId`
  - `reporting` stays read-only
  - `rbac` remains permission-string + route-tree driven
  - `session` remains JWT ticket + Redis session
  - `ai-assistant` is not pulled into the RD workbench by default

## Implementation Plan

- [x] Slice 1: establish a single RD workshop carrier and RD-only route/permission surface so the user lands in an isolated subwarehouse workbench instead of the main warehouse operating tree
- [x] Slice 1: wire RD-scoped read models by reusing `inventory-core`, `reporting`, and `inbound` query endpoints with a fixed RD workshop context instead of free workshop switching
- [x] Slice 1: reuse `project` as the RD project-bound consumption path and ensure the RD surface does not allow non-project outbound semantics
- [x] Slice 1: reuse `workshop-material` scrap orders as the RD local scrap path with the same workshop scoping and permission isolation
- [x] Slice 1: validate backend/frontend behavior with focused tests, type/lint/build checks, and a smoke pass using an RD-scoped user
- [ ] Later slice: add constrained main->RD handoff orchestration so a main-warehouse transfer automatically generates RD inbound results without requiring RD receipt confirmation
- [ ] Later slice: add RD procurement request capture, main-warehouse acceptance linkage, and the independent RD material-state chain (`采购中` -> `到货` -> `验收` -> `领取/报废/退回`)
- [ ] Later slice: add RD stocktake/adjustment write flows and RD-specific report extensions once the foundational route/context and transfer/procurement paths are stable

## Coder Handoff

- Execution brief:
  - implement only the first usable RD subwarehouse slice, but do it in a way that does not block later transfer/procurement slices
  - prefer fixed RD workshop context, route/menu isolation, and reuse of existing document modules over new tables or a generic warehouse abstraction
- Required source docs or files:
  - `docs/requirements/req-20260326-0048-rd-subwarehouse.md`
  - `docs/workspace/rd-subwarehouse/README.md`
  - `docs/architecture/00-architecture-overview.md`
  - `docs/architecture/20-wms-business-flow-and-optimized-schema.md`
  - `docs/architecture/modules/inventory-core.md`
  - `docs/architecture/modules/project.md`
  - `docs/architecture/modules/workshop-material.md`
  - `docs/architecture/modules/reporting.md`
  - `docs/architecture/modules/rbac.md`
  - `src/modules/rbac/infrastructure/in-memory-rbac.repository.ts`
  - `src/modules/inventory-core/controllers/inventory.controller.ts`
  - `src/modules/project/application/project.service.ts`
  - `src/modules/workshop-material/application/workshop-material.service.ts`
  - `src/modules/inbound/application/inbound.service.ts`
  - `src/modules/reporting/application/reporting.service.ts`
- Owned paths:
  - same as Allowed code paths
- Forbidden shared files:
  - `prisma/**`
  - `src/generated/**`
  - `docs/requirements/**`
  - `docs/workspace/**`
  - unrelated active task docs
- Constraints and non-goals:
  - do not introduce a generic warehouse/subwarehouse schema or a new transfer family in this slice
  - do not fake-complete procurement, handoff automation, stocktake, or inventory-adjustment requirements
  - keep controllers thin; put workshop-lock and orchestration in application/services or frontend composition, not ad hoc controller branches
  - if RD users need a project-like "归集项" placeholder in UI copy, do not invent a new domain model here; use the existing `project` domain only if the existing flow can carry it honestly
  - any stock mutation must still go through `inventory-core`
  - `reporting` changes must stay read-only and workshop-filtered
- Validation command for this scope:
  - `pnpm swagger:metadata && pnpm typecheck`
  - `pnpm test -- --runTestsByPath src/modules/inventory-core/application/inventory.service.spec.ts src/modules/project/application/project.service.spec.ts src/modules/workshop-material/application/workshop-material.service.spec.ts`
  - `pnpm --dir web build:prod`
  - if an RD-scoped user/workbench is added, do one manual/browser smoke path for RD inventory, RD project consumption entry, and RD scrap entry

## Reviewer Handoff

- Review focus:
  - RD isolation is real: routes, menus, and request defaults must not leak main warehouse surfaces by accident
  - `project` reuse truly enforces project-bound RD issue instead of opening a free-form outbound shortcut
  - `workshop-material` reuse is limited to RD scrap in this slice and does not silently redefine broader transfer semantics
  - reporting/inventory/inbound views remain read-only and locked to the RD workshop context
  - no schema creep or hidden contract drift against `inventory-core`, `rbac`, `session`, or `reporting`
- Requirement alignment check:
  - confirm the slice gives the RD side a usable first operating surface, not just renamed menus
  - confirm deferred capabilities are clearly marked as follow-up slices rather than implicitly claimed complete
- Final validation gate:
  - `pnpm swagger:metadata && pnpm typecheck`
  - focused Jest paths for `inventory-core`, `project`, and `workshop-material`
  - `pnpm --dir web build:prod`
  - manual/browser smoke on the RD workbench's primary paths
- Required doc updates:
  - update this task doc with execution/review evidence
  - parent should sync concise progress to the linked requirement and RD workspace after execution

## Parallelization Safety

- Status: `not-safe`
- If not safe, list the shared files or contracts that require a single writer:
  - `src/modules/rbac/**` and `web/src/router/index.js` are shared route/permission chokepoints
  - the fixed RD workshop context must stay consistent across backend services and frontend workbench defaults
  - `project`, `workshop-material`, `inventory-core`, `inbound`, and `reporting` are coupled by the same workshop-scoped contract and cannot be safely split across multiple writers in this slice

## Review Log

- Validation results:
  - `pnpm swagger:metadata && pnpm typecheck` — passed
- `pnpm test -- --runTestsByPath src/modules/inventory-core/application/inventory.service.spec.ts src/modules/project/application/project.service.spec.ts src/modules/workshop-material/application/workshop-material.service.spec.ts src/modules/rbac/application/rbac.service.spec.ts src/modules/rbac/application/workshop-scope.service.spec.ts src/modules/reporting/application/reporting.service.spec.ts` — passed (`6/6` suites, `41/41` tests)
  - `pnpm --dir web build:prod` — passed
  - Recorded manual/browser smoke for the RD slice — passed: `rd-operator` login succeeded, landed on `/rd/workbench`, sidebar showed only `首页` + `研发小仓`, the RD group contained exactly `研发工作台 / 小仓库存 / 库存流水 / 自动入库结果 / 项目领用 / 本仓报废 / 分类分布`, no legacy main groups were exposed, no RD trend item remained, and the exposed RD pages rendered without obvious error
  - Combined with the controller-level fixed-workshop enforcement and the updated route/permission surface, the task's final validation gate is satisfied for this slice
- Findings:
  - No actionable findings in the re-reviewed RD slice
- Follow-up action:
  - parent should sync the completion state to the linked requirement and RD workspace, then archive or reclassify this task when appropriate

## Final Status

- Outcome:
  - Slice 1 is implemented and re-reviewed cleanly: the RD workbench metric leak is fixed, the semantically incorrect RD trend entry is removed from the RD surface, and the recorded RD-user browser smoke now closes the prior high-level isolation gap
- Requirement alignment:
  - route/menu isolation, fixed-workshop controller scoping, RD-only read models, `project` reuse for RD issue, and `workshop-material` scrap reuse all stay aligned with the confirmed "受限子仓模型" and avoid widening into generic multi-warehouse or customer-outbound write paths
- Residual risks or testing gaps:
  - no open defects were found within the completed Phase 1 foundation slice itself
  - automatic main->RD handoff, RD procurement, independent material-state tracking, and stocktake/adjustment remain intentional follow-up work outside this completed slice
- Directory disposition after completion: archived to `docs/tasks/archive/retained-completed/task-20260326-0415-rd-subwarehouse-phase1-operating-foundation.md` as the retained execution and review provenance for the completed RD Phase 1 foundation slice
- Next action:
  - sync concise completion progress to the linked requirement and RD workspace, and open a new follow-up slice only when starting the deferred handoff/procurement/stocktake work
