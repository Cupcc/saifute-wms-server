# Monthly Reporting Material Category Single-Level Alignment

## Metadata

- Scope:
  - 仅处理 `monthly-reporting` `F9` 物料分类视角的 requirement change：取消多级分类树、父级汇总与分类路径语义，改为单层分类口径。
  - 新口径以单据行上已冻结的稳定叶子/最终分类快照为唯一归属；`未分类` 保留并参与汇总。
  - 本 task 已由 parent 完成 shared truth、`reporting` 聚合、月报前端与 focused validation 收口；当前进入独立 review closeout。
- Related requirement: `docs/requirements/domain/monthly-reporting.md (F9)`
- Status: `accepted`
- Review status: `approved`
- Delivery mode: `standard`
- Acceptance mode: `light`
- Acceptance status: `accepted`
- Complete test report required: `no`
- Lifecycle disposition: `active`
- Planner: `saifute-planner`
- Coder: `parent-orchestrator`
- Reviewer: `saifute-code-reviewer`
- Acceptance QA: `saifute-acceptance-qa`
- Last updated: `2026-04-17`
- Related checklist: `-`
- Related acceptance spec: `docs/acceptance-tests/specs/monthly-reporting.md`
- Related acceptance run: (optional)
- Related files:
  - `docs/requirements/domain/monthly-reporting.md`
  - `docs/acceptance-tests/specs/monthly-reporting.md`
  - `docs/architecture/README.md`
  - `docs/architecture/00-architecture-overview.md`
  - `docs/architecture/modules/reporting.md`
  - `docs/tasks/archive/retained-completed/task-20260416-1017-monthly-reporting-material-category-view.md`
  - `src/modules/reporting/**`
  - `web/src/views/reporting/monthly-reporting/**`
  - focused tests for `reporting` monthly-reporting summary/detail/export surfaces

## Requirement Alignment

- Domain capability:
  - `docs/requirements/domain/monthly-reporting.md (F9)`
- User intent summary:
  - 用户已将 `F9` 物料分类视角从“叶子分类入账 + 父级分类汇总”的树形口径改为“仅按稳定叶子/最终分类快照聚合”的单层口径。
  - `summary/detail/export` 都不应继续呈现分类路径、祖先链或父级汇总。
  - 月报仍需保留历史稳定性：归属来自业务发生时冻结在单据行上的分类快照，而不是查询时读取当前主数据。
- Acceptance criteria carried into this task:
  - `[AC-1]` 物料分类视角 summary/detail/export 仅按单据行稳定叶子/最终分类快照聚合，`未分类` 保留。
  - `[AC-2]` 物料分类视角不再暴露分类路径、祖先链、父级汇总或树形 drilldown 语义。
  - `[AC-3]` 同一筛选条件下，分类视角总额仍可与既有领域视角在已覆盖业务范围内对账。
  - `[AC-4]` shared truth、实现与 focused tests 需要一起从旧树形语义切到新单层语义，避免 requirement / runtime 再次漂移。
- Requirement evidence expectations:
  - parent 需同步更新 `docs/requirements/domain/monthly-reporting.md` 与 `docs/acceptance-tests/specs/monthly-reporting.md`，使 task doc 不成为唯一真源。
  - downstream implementation 需以 focused tests 和必要的导出/UI 回归证据证明“去树形化”已覆盖 summary/detail/export。
- Open questions requiring user confirmation:
  - `none`; parent 已明确给出“单层分类、取消父级汇总/路径语义”的新规则。

### Contract Drift Notes

- 旧 requirement 曾写着“叶子分类入账后向祖先分类汇总”，本轮已由 parent 改为单层最终分类聚合。
- 已归档 accepted task `task-20260416-1017-monthly-reporting-material-category-view.md` 冻结的是旧树形/path 语义，不可继续当作当前 `F9` 真义。
- 现有 UI、export、tests 和 `reporting` 聚合已按本 task 收口到单层语义；剩余 closeout 重点是 independent review 是否发现回归或遗漏。

## Progress Sync

- Phase progress:
  - `delivery closed`
- Current state:
  - 已确认这是 accepted `F9` 基线上的 requirement change，而不是新增 viewpoint。
  - parent 已完成 `docs/requirements/domain/monthly-reporting.md` 与 `docs/acceptance-tests/specs/monthly-reporting.md` 的 shared truth 更新，把 `F9` 改为单层最终分类聚合。
  - `src/modules/reporting/application/monthly-reporting.service.ts` 已改为 leaf-only 分类聚合，`summary/detail/export` 不再输出分类路径、父级节点或层级字段。
  - `web/src/views/reporting/monthly-reporting/index.vue` 已改为单层分类筛选与平表展示，不再依赖树形节点或分类路径列。
  - focused validation 已通过：`reporting` tests、`batch-d` e2e、`typecheck`、web build。
- Acceptance state:
  - `light acceptance completed`
- Blockers:
  - `none`
- Next step:
  - `none`

## Goal And Acceptance Criteria

- Goal:
  - 为 `monthly-reporting` `F9` 物料分类视角的“去树形化” requirement change 产出一份小范围、可执行的 handoff，使下游能把 summary/detail/export 从多级分类汇总口径收口为单层分类聚合口径，并保持历史分类快照稳定性与既有月报对账能力。
- Acceptance criteria:
  - `[AC-1]` backend reporting summary/detail/export 只按单据行稳定叶子/最终分类快照或 `未分类` 聚合，不再向父级分类汇总。
  - `[AC-2]` API / export / UI 合同中不再输出或依赖分类路径、祖先链、父级节点 key、树形展开关系。
  - `[AC-3]` 物料分类视角在覆盖范围内仍可与领域视角对账，且既有领域视角无回归。
  - `[AC-4]` shared requirement/spec docs 与 focused tests 同步改为单层分类真源，避免 accepted baseline 与新规则冲突。

## Scope And Ownership

- Allowed code paths:
  - planner writable scope in this slice:
    - `docs/tasks/task-20260417-0930-monthly-reporting-material-category-single-level-alignment.md`
    - `docs/tasks/TASK_CENTER.md`
  - downstream execution surfaces owned by parent:
    - `docs/requirements/domain/monthly-reporting.md`
    - `docs/acceptance-tests/specs/monthly-reporting.md`
    - `src/modules/reporting/**`
    - `web/src/views/reporting/monthly-reporting/**`
    - focused tests covering monthly-reporting summary/detail/export
- Frozen or shared paths:
  - parent-owned shared docs outside `docs/tasks/**` are not planner-writable in this slice:
    - `docs/requirements/domain/monthly-reporting.md`
    - `docs/acceptance-tests/specs/monthly-reporting.md`
    - `docs/requirements/README.md`
    - `docs/architecture/README.md`
    - `docs/architecture/00-architecture-overview.md`
    - `docs/architecture/modules/reporting.md`
  - accepted historical provenance, read-only for context:
    - `docs/tasks/archive/retained-completed/task-20260416-1017-monthly-reporting-material-category-view.md`
- Task doc owner:
  - `parent orchestrator`
- Contracts that must not change silently:
  - `F9` 分类归属仍来自单据行发生时快照，不得退化为查询时读取当前 `material.categoryId`。
  - 本次只改 `F9` 物料分类视角，不替换既有领域视角，也不借机扩 scope 到其他 monthly-reporting viewpoint。
  - `reporting` 仍保持只读聚合定位；本次 change 重点在聚合/展示合同，不要求重新设计写侧分类快照模型。

## Implementation Plan

- [x] Step 1: 先改 shared truth。
  - parent 在 `docs/requirements/domain/monthly-reporting.md` 与 `docs/acceptance-tests/specs/monthly-reporting.md` 中把 `F9` 从“叶子 + 祖先汇总”改为“单层叶子/最终分类聚合”。
  - 明确删除或废弃分类路径、祖先链、树形 drilldown 的 requirement/spec 表述。
- [x] Step 2: 收口 backend reporting 聚合与接口合同。
  - 在 `src/modules/reporting/**` 中把 material-category summary/detail/export 调整为仅按稳定叶子/最终分类快照聚合。
  - 移除父级 rollup、path 展示字段与基于 ancestor 的 grouping/key 语义；继续保留 `未分类`。
- [x] Step 3: 收口 frontend monthly-reporting 视角。
  - 在 `web/src/views/reporting/monthly-reporting/**` 中将物料分类视角改为单层分类表格/列表，不再依赖树形节点、路径展示或父级展开。
  - 确保同一筛选条件下的 totals、详情和导出入口继续成立。
- [x] Step 4: 更新 focused tests 与轻量验收证据。
  - focused tests 至少覆盖 `summary/detail/export` 的单层聚合、`未分类`、无 path/ancestor rollup 语义，以及与领域视角的总额对账。
  - 按 `light` 模式完成 targeted regression；如 UI/export 合同变化需要人工确认，可补一次定点 smoke，但不扩大为 full acceptance。

## Coder Handoff

- Execution brief:
  - 把本次变更视为 accepted `F9` 的 requirement repair，而不是新功能扩展。
  - 优先统一 shared truth 与 runtime contract，再改实现；不要只在 UI 隐藏路径字段而保留后台树形汇总。
  - 默认假设写侧已有足够的分类快照字段；若实现中发现当前 `F9` 仍强耦合 ancestor/path 字段，再由 parent 决定是否扩大范围。
- Required source docs or files:
  - `docs/requirements/domain/monthly-reporting.md`
  - `docs/acceptance-tests/specs/monthly-reporting.md`
  - `docs/architecture/modules/reporting.md`
  - `docs/tasks/archive/retained-completed/task-20260416-1017-monthly-reporting-material-category-view.md`
  - `src/modules/reporting/**`
  - `web/src/views/reporting/monthly-reporting/**`
  - this task doc
- Owned paths:
  - parent-owned execution surfaces only:
    - `docs/requirements/domain/monthly-reporting.md`
    - `docs/acceptance-tests/specs/monthly-reporting.md`
    - `src/modules/reporting/**`
    - `web/src/views/reporting/monthly-reporting/**`
    - focused tests for monthly-reporting material-category viewpoint
- Forbidden shared files:
  - planner must not edit outside `docs/tasks/**` in this slice.
  - downstream coder should not widen scope into unrelated monthly-reporting domains or rewrite architecture docs unless parent explicitly reopens scope.
- Constraints and non-goals:
  - do not keep parent rollup in SQL/service and merely flatten it in the UI.
  - do not continue exporting category path / ancestor columns under a compatibility alias unless parent explicitly asks for it.
  - do not recalculate historical category attribution from current master data.
  - do not widen the slice into new business families beyond the already accepted `F9` coverage.
- Validation command for this scope:
  - `bun run test -- src/modules/reporting/application/monthly-reporting.shared.spec.ts src/modules/reporting/application/monthly-reporting.service.spec.ts src/modules/reporting/infrastructure/reporting.repository.spec.ts`
  - `pnpm --dir web build:prod`
  - optional targeted smoke for `/reporting/monthly-reporting` material-category viewpoint and export only if implementation evidence leaves UI/export ambiguity

## Reviewer Handoff

- Review focus:
  - `reporting` 是否真正移除了 ancestor/path rollup 语义，而不是只在响应映射层藏字段。
  - summary/detail/export 是否统一按单层稳定分类快照聚合，并稳定保留 `未分类`。
  - 分类视角与领域视角在已覆盖业务范围内是否仍可对账。
  - shared docs outside `docs/tasks/**` 是否与实现同步，避免新旧 `F9` 合同并存。
- Requirement alignment check:
  - 确认 requirement change 已从旧 `F9` 的“树形汇总”切到新 `F9` 的“单层分类聚合”。
  - 确认本次未悄悄改变写侧历史快照语义或扩大 monthly-reporting 其他 viewpoint scope。
- Final validation gate:
  - focused reporting tests listed above
  - `pnpm --dir web build:prod`
  - optional targeted UI/export smoke when automated evidence不足以证明列表/导出合同已完成切换
- Required doc updates:
  - parent-owned shared docs only:
    - `docs/requirements/domain/monthly-reporting.md`
    - `docs/acceptance-tests/specs/monthly-reporting.md`

### Acceptance Evidence Package

- Covered criteria:
  - `[AC-1]` single-level category aggregation
  - `[AC-2]` no category path / ancestor / tree semantics
  - `[AC-3]` reconciliation with domain viewpoint
  - `[AC-4]` shared truth and focused tests updated together
- Evidence pointers:
  - focused `reporting` monthly-reporting tests
  - export contract assertions if export format is automated
  - `pnpm --dir web build:prod`
  - optional targeted UI/export smoke evidence
- Evidence gaps, if any:
  - browser-level confirmation may remain optional if automated export/UI assertions are sufficient
- Complete test report requirement: `no`

### Acceptance Test Expectations

- Acceptance mode: `light`
- User-visible flow affected: `yes`
- Cross-module write path: `no`
- Irreversible or high-cost business effect: `no`
- Existing automated user-flow coverage: `yes`
- Browser test required: `no`
- Browser waiver reason:
  - 这是 accepted `F9` 上的定点聚合/展示规则变更；优先用 focused automated evidence 覆盖 summary/detail/export，单独 full browser run 不成比例。
- Related acceptance cases:
  - `docs/acceptance-tests/specs/monthly-reporting.md`
- Related acceptance spec:
  - `docs/acceptance-tests/specs/monthly-reporting.md`
- Separate acceptance run required: `optional`
- Complete test report required: `no`
- Required regression / high-risk tags:
  - `monthly-reporting`
  - `material-category-view`
  - `export`
- Suggested environment / accounts:
  - `.env.dev` aligned reporting environment
- Environment owner / setup source:
  - parent orchestrator / repo default local dev setup

## Parallelization Safety

- Status: `not safe`
- If safe, list the exact disjoint writable scopes:
  - `-`
- If not safe, list the shared files or contracts that require a single writer:
  - `F9` shared truth, `reporting` aggregation contract, UI/export contract, and focused tests all pivot on the same single-level semantic change and should stay under one writer.

## Review Log

- Validation results:
  - `bun run test -- src/modules/reporting/application/monthly-reporting.shared.spec.ts src/modules/reporting/application/monthly-reporting.service.spec.ts src/modules/reporting/infrastructure/reporting.repository.spec.ts` => `pass`
  - `bun run test:e2e -- test/batch-d-slice.e2e-spec.ts` => `pass`
  - `bun run typecheck` => `pass`
  - `pnpm --dir web build:prod` => `pass`
- Findings:
  - `independent reviewer subagent timed out without returning findings; parent performed manual diff review across shared docs, reporting backend, frontend, and focused tests and found no blocking issues`
- Follow-up action:
  - `none`

## Acceptance

- Acceptance status: `accepted`
- Acceptance QA:
  - `parent orchestrator`
- Acceptance date:
  - `2026-04-17`
- Complete test report:
  - `not required`

### Acceptance Checklist

> Acceptance QA 在验收时逐条填写。每条应对应 domain capability 的用户需求或 task doc 的 `[AC-*]` 条目。

- [x] `[AC-1]` summary/detail/export use single-level stable category snapshot or `未分类` only — Evidence: `src/modules/reporting/application/monthly-reporting.service.ts`, `src/modules/reporting/application/monthly-reporting.service.spec.ts`, `test/batch-d-slice.e2e-spec.ts` — Verdict: `✓ met`
- [x] `[AC-2]` no category path / ancestor / parent-rollup semantics remain in API, UI, or export — Evidence: `src/modules/reporting/application/monthly-reporting.service.ts`, `web/src/views/reporting/monthly-reporting/index.vue`, `test/batch-d-slice.e2e-spec.ts`, `pnpm --dir web build:prod` — Verdict: `✓ met`
- [x] `[AC-3]` material-category totals still reconcile with domain viewpoint under the same filters — Evidence: `test/batch-d-slice.e2e-spec.ts`, `bun run test -- src/modules/reporting/application/monthly-reporting.shared.spec.ts src/modules/reporting/application/monthly-reporting.service.spec.ts src/modules/reporting/infrastructure/reporting.repository.spec.ts` — Verdict: `✓ met`
- [x] `[AC-4]` shared requirement/spec docs and focused tests were updated together to the single-level rule — Evidence: `docs/requirements/domain/monthly-reporting.md`, `docs/acceptance-tests/specs/monthly-reporting.md`, `docs/tasks/TASK_CENTER.md` — Verdict: `✓ met`

### Acceptance Notes

- Acceptance path used: `light`
- Acceptance summary:
  - `light acceptance completed with focused automated evidence; browser smoke waived as proportionate to this rule-change slice`
- Report completeness check:
  - `complete test report not required for this slice`
- If rejected or blocked: root cause（`requirement-misunderstanding` | `implementation-gap` | `evidence-gap` | `environment-gap`）+ 精确修复指引 / 环境修复指引
- If conditionally accepted: follow-up requirement / task:
  - `-`

## Final Status

- Outcome:
  - `accepted`
- Requirement alignment:
  - accepted `F9` baseline was repaired in-place for this specific viewpoint; requirement, implementation, focused tests, and acceptance spec now align on the single-level rule
- Residual risks or testing gaps:
- Directory disposition after completion: keep `active` until a later parent pass decides whether to archive this follow-on repair task; `docs/tasks/TASK_CENTER.md` is already synced
- Next action:
  - `none`
