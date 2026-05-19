# RD_SUB Project Attribution And Reporting Alignment

## Metadata

- Scope:
  - 以新确认业务规则为准，补齐 `MAIN -> RD_SUB` 交接、`RD_SUB` 在库归属、研发项目统计与月度报表之间的统一归因合同。
  - 本轮仅做 durable planning；不实现源码，不执行 migration/reset；shared truth 已由 parent 在同轮同步到 requirement / acceptance docs，本 task doc 继续冻结编码与 QA handoff。
  - 执行范围预期覆盖 `rd-subwarehouse`、`rd-project`、`inventory-core`、`reporting`、`prisma/schema.prisma`、migration/reset-seed strategy、focused tests 与 acceptance planning。
- Related requirement: `docs/requirements/domain/rd-subwarehouse.md (F6)`; `docs/requirements/domain/rd-project-management.md (F5)`; `docs/requirements/domain/inventory-core-module.md (F6)`; `docs/requirements/domain/monthly-reporting.md (F8)`
- Status: `planned`
- Review status: `not-reviewed`
- Delivery mode: `standard`
- Acceptance mode: `full`
- Acceptance status: `not-assessed`
- Complete test report required: `yes`
- Lifecycle disposition: `active`
- Planner: `saifute-planner`
- Coder: `parent-orchestrator`
- Reviewer: `saifute-code-reviewer`
- Acceptance QA: `saifute-acceptance-qa`
- Last updated: `2026-04-14`
- Related checklist: `-`
- Related acceptance spec: `docs/acceptance-tests/specs/monthly-reporting.md`; `docs/acceptance-tests/specs/rd-project.md`; `docs/acceptance-tests/specs/rd-subwarehouse.md`
- Related acceptance case: `docs/acceptance-tests/cases/rd-subwarehouse.json`
- Related acceptance run: (optional)
- Related files:
  - `docs/requirements/domain/monthly-reporting.md`
  - `docs/requirements/domain/rd-project-management.md`
  - `docs/requirements/domain/rd-subwarehouse.md`
  - `docs/requirements/domain/inventory-core-module.md`
  - `docs/acceptance-tests/specs/rd-subwarehouse.md`
  - `docs/acceptance-tests/cases/rd-subwarehouse.json`
  - `docs/architecture/20-wms-database-tables-and-schema.md`
  - `docs/architecture/30-java-to-nestjs-data-migration-reference.md`
  - `docs/architecture/modules/reporting.md`
  - `docs/architecture/modules/rd-project.md`
  - `docs/architecture/modules/rd-subwarehouse.md`
  - `docs/architecture/modules/inventory-core.md`
  - `docs/tasks/task-20260411-1105-monthly-reporting-domain-first-redesign.md`
  - `prisma/schema.prisma`
  - `src/modules/rd-subwarehouse/application/rd-handoff.service.ts`
  - `src/modules/rd-project/application/rd-project.service.ts`
  - `src/modules/reporting/application/monthly-reporting.service.ts`
  - `src/modules/reporting/infrastructure/reporting.repository.ts`
  - `src/modules/inventory-core/application/inventory.service.ts`

## Requirement Alignment

- Domain capability:
  - `docs/requirements/domain/rd-subwarehouse.md (F6)`
  - `docs/requirements/domain/rd-project-management.md (F5)`
  - `docs/requirements/domain/inventory-core-module.md (F6)`
  - `docs/requirements/domain/monthly-reporting.md (F8)`
- User intent summary:
  - 新确认规则是：每一笔 `MAIN -> RD_SUB` 交接都必须映射到一个 `RD project`；`RD project` 是 `RD_SUB` 内部二级归属维度；`RD_SUB` 内每一份物料都必须属于某个研发项目。
  - 这会推翻当前“`RD handoff` 可作为独立于 `rd-project` totals 的单独月报主题”这一实现假设。
  - 允许在 local/test 环境为对齐新模型执行受控数据清理与重灌；本轮只产出计划，不执行。
- Acceptance criteria carried into this task:
  - `[AC-1]` 新计划必须保持 `inventory-core` 为唯一库存写入口，不允许 `rd-project` 或 `reporting` 旁路写库存。
  - `[AC-2]` 新计划必须保持真实库存范围只有 `MAIN` / `RD_SUB`；不得把 `rd-project` 偷偷升级成新的 `stockScope`。
  - `[AC-3]` 交接必须在 line / inventory fact 级别带上项目归属，不能只在报表时推测或回填。
  - `[AC-4]` 报表必须按 viewpoint 重算 `RD` totals，不能继续把 `RD handoff` 硬编码为与 `rd-project` totals 平行且互不对齐的固定桶。
  - `[AC-5]` 计划必须覆盖 schema/model、service、reporting、migration/reset/backfill、frontend/reporting、focused tests、browser acceptance 与 docs impact。
- Requirement evidence expectations:
  - 同轮 shared truth 已回写到 requirement / acceptance docs；当前 task 继续冻结 execution handoff、编码边界与 QA 计划。
  - downstream coder 必须以代码和测试证明“交接归因”和“报表口径”同步收口，而不是单边修 UI 或单边修 SQL。
- Open questions requiring user confirmation:
  - `none`; parent 已给出确认后的新业务规则与本轮边界。

### Contract Drift Notes

- 当前 `monthly-reporting` 实现仍把 `研发项目` 和 `RD小仓 -> 主仓到RD交接` 作为并列领域查看，这与“所有 `RD_SUB` 物料都属于研发项目”的新规则发生口径漂移。
- 共享 requirement docs 已把“每条 handoff line 必绑 `RD project`”“`RD_SUB` 存量必须全部项目归属”“月报按 viewpoint 重算”写成后续能力合同，但 runtime 仍停留在旧模型。
- 当前 schema / service 已提供正确落点的一半：`inventory_balance` 仍以 `materialId + stockScopeId` 唯一，`inventory_log` 已有 `projectTargetId`，`rd-project` 动作也会把 `projectTargetId` 写入库存事实；但 `rd-handoff` 还未在交接入库事实里显式承接项目归属。
- 当前月报实现有 `rdProjectItems` 与 `rdHandoffItems` 两套并列汇总，这符合旧视图，不符合新确认规则下的 viewpoint 汇总。
- 当前仓库已新增 `docs/acceptance-tests/specs/rd-subwarehouse.md` 作为 follow-on spec，但仍只有 planning evidence，后续实现必须把自动化、browser 与 reset/reseed 证据回填进去。

## Progress Sync

- Phase progress:
  - `planning package complete; ready for downstream single-writer implementation`
- Current state:
  - 现有代码已具备 `RD_SUB` 固定仓别、`projectTargetId` 事实字段、`rd-project` 项目动作写库存等基础，但 `RD handoff` 与月报口径尚未按新规则对齐。
  - 本轮已同步 requirement docs、requirement center、acceptance specs、active task doc 与 knowledge catalog；尚未开始 runtime implementation、migration/backfill 或 acceptance run。
- Acceptance state:
  - `planning only; implementation acceptance not started`
- Blockers:
  - `none for planning`; implementation blockers move to data-model and runtime alignment
- Next step:
  - 按本 handoff 进入单写者实现，再由 reviewer / acceptance-qa 补执行证据。

## Goal And Acceptance Criteria

- Goal:
  - 把 `RD_SUB` 从“只有仓别、项目另算”的弱归属模型，收口为“仓别在 `stockScope`，项目在 `project attribution`，两者同时成立”的统一执行与报表合同，并为后续单写者实现提供小范围、可验证的编码计划。
- Acceptance criteria:
  - `[AC-1]` schema / model 计划明确：`inventory_balance` 继续保持 `materialId + stockScopeId` 唯一键；`RD project` 作为 `RD_SUB` 内的二级归属维度，不新增 `stockScope`。
  - `[AC-2]` write-path 计划明确：`MAIN -> RD_SUB` handoff line 在创建时即解析并写入项目归属，后续 `RD_SUB` 相关库存事实可追到同一 `projectTarget`。
  - `[AC-3]` reporting 计划明确：月报与相关 `RD` 统计从“独立 handoff 桶”切到“按 viewpoint 统计 handoff、在库、项目动作和项目净耗用”的一致口径。
  - `[AC-4]` migration / reset strategy 明确：生产候选环境走受控 backfill / validation；local/test 如现有数据不满足新模型，可清空受影响数据并按新规则重灌 fixtures。
  - `[AC-5]` QA 计划明确：focused automated tests、browser/user-flow coverage、acceptance doc impact 与 data reset allowance 均被写清。

## Scope And Ownership

- Allowed code paths:
  - `prisma/schema.prisma`
  - `src/modules/rd-subwarehouse/**`
  - `src/modules/rd-project/**`
  - `src/modules/inventory-core/**`
  - `src/modules/reporting/**`
  - `web/src/views/reporting/monthly-reporting/**`
  - `web/src/api/reporting.js`
  - related `test/**`
  - migration/reset/backfill scripts or seed surfaces that already belong to implementation owner
- Frozen or shared paths:
  - parent-owned shared docs outside `docs/tasks/**` are frozen for downstream coder in this slice:
    - `docs/requirements/domain/monthly-reporting.md`
    - `docs/requirements/domain/rd-project-management.md`
    - `docs/requirements/domain/rd-subwarehouse.md`
    - `docs/requirements/domain/inventory-core-module.md`
    - `docs/requirements/REQUIREMENT_CENTER.md`
    - `docs/architecture/modules/reporting.md`
    - `docs/architecture/modules/rd-project.md`
    - `docs/architecture/modules/rd-subwarehouse.md`
    - `docs/architecture/modules/inventory-core.md`
    - `docs/acceptance-tests/README.md`
    - `docs/acceptance-tests/specs/monthly-reporting.md`
    - `docs/acceptance-tests/specs/rd-project.md`
    - `docs/acceptance-tests/specs/rd-subwarehouse.md`
  - current active monthly-reporting task doc is shared historical context, not this task's writable scope:
    - `docs/tasks/task-20260411-1105-monthly-reporting-domain-first-redesign.md`
- Task doc owner:
  - `parent orchestrator`
- Contracts that must not change silently:
  - `inventory-core` remains the only stock write entry point.
  - `rd-project` remains a project attribution dimension under `RD_SUB`, not a new physical warehouse or balance dimension.
  - handoff attribution must be recorded at create/post time, not inferred later by report-time joins alone.
  - reporting remains read-only and must consume attributed facts instead of inventing a parallel `RD` ledger.
  - local/test reset or reseed is allowed only as a controlled validation aid for conflicting fixtures, not as a silent production migration strategy.

## Implementation Plan

- [ ] Step 1: Freeze the target contract before coding.
  - Restate in implementation notes that every effective `MAIN -> RD_SUB` handoff line needs one required `rdProjectId` or equivalent `projectTargetId` mapping.
  - Restate that every effective `RD_SUB` material fact must remain attributable to one `RD project`, while the balance axis stays `materialId + stockScopeId`.
- [ ] Step 2: Adjust schema/model surfaces without changing stock-scope semantics.
  - Extend `rd_handoff_order_line` or equivalent handoff line persistence to store required `rdProjectId` / `projectTargetId` reference and snapshots needed for reporting/export.
  - Keep `inventory_balance` unique key unchanged at `materialId + stockScopeId`.
  - Reuse `project_target` / `inventory_log.projectTargetId` as the canonical cross-module attribution key for `RD_SUB` facts.
- [ ] Step 3: Refactor `rd-subwarehouse` write path to post project-attributed facts.
  - Validate every handoff line against an effective RD project.
  - During `RD_HANDOFF_IN` posting, pass the resolved `projectTargetId` into `inventoryService.increaseStock(...)`.
  - For `RD_HANDOFF_OUT`, decide whether the same `projectTargetId` should also be recorded for traceability on the transfer fact; do not bypass `inventory-core`.
  - Add void / reverse logic and status rollback checks so attribution stays consistent after reversal.
- [ ] Step 4: Align `rd-project` and `inventory-core` read/write behavior.
  - Audit `rd-project` actions to ensure subsequent `PICK / RETURN / SCRAP` only consume or replenish project-attributed `RD_SUB` facts in a way that remains explainable.
  - Review whether FIFO allocation / source usage queries for `RD_SUB` need project-aware validation or filtering, while leaving shared inventory quantities at stock-scope level.
  - Do not introduce project into `inventory_balance` lookup keys or `StockScopeType`.
- [ ] Step 5: Rebuild reporting by viewpoint instead of fixed buckets.
  - Update reporting repository and service so `RD` monthly totals can answer at least:
    - handoff into `RD_SUB` by RD project
    - RD project activity / net usage by RD project
    - optional aggregate project viewpoint across handoff + downstream project actions, depending on final UI naming chosen by parent
  - Remove or demote the old assumption that `rdHandoffItems` is a standalone total that does not need alignment with `rdProjectItems`.
  - Preserve read-only reporting behavior and keep abnormal / drilldown evidence aligned.
- [ ] Step 6: Update frontend/reporting presentation after backend contract lands.
  - Rework monthly-reporting UI and export wording to show project-attributed `RD` viewpoint instead of a detached handoff-only total.
  - Ensure filters, drilldowns, export sheets, and `RD_SUB` scoped views still work when project attribution becomes required.
- [ ] Step 7: Prepare migration / backfill / reset strategy.
  - Persistent environments: add a guarded migration/backfill path that identifies unmapped historical `RD handoff` lines and `RD_SUB` facts, blocks silent rollout when a project cannot be resolved, and records any required operator action.
  - Local/test environments: when old fixtures violate the new model, allow controlled clearing of affected `rd_handoff*`, `rd_project*`, `inventory_log`, `inventory_source_usage`, `inventory_balance`, reporting snapshots, and related seed data before reinjection of coherent fixtures.
  - Prefer clear-and-reinject for local acceptance over brittle ad hoc patching when old data cannot be trusted.
- [ ] Step 8: Validate with focused tests and acceptance evidence.
  - Add/extend focused service/repository tests first, then run cross-module e2e and browser acceptance on the updated monthly-reporting / RD flows.
  - Parent updates shared acceptance docs after implementation evidence is available.

## Coder Handoff

- Execution brief:
  - Treat this as one cross-module attribution alignment slice, not as isolated `reporting` polish.
  - Start from write-time truth: a handoff line must know its RD project before `RD_HANDOFF_IN` is posted.
  - Keep the stock ledger physically scoped by warehouse and semantically attributed by project.
  - If old local/test fixtures block that model, clear and reseed them in a controlled way instead of introducing compatibility hacks into runtime logic.
- Required source docs or files:
  - `docs/requirements/domain/monthly-reporting.md`
  - `docs/requirements/domain/rd-project-management.md`
  - `docs/requirements/domain/rd-subwarehouse.md`
  - `docs/requirements/domain/inventory-core-module.md`
  - `docs/architecture/20-wms-database-tables-and-schema.md`
  - `docs/architecture/30-java-to-nestjs-data-migration-reference.md`
  - `prisma/schema.prisma`
  - `src/modules/rd-subwarehouse/application/rd-handoff.service.ts`
  - `src/modules/rd-project/application/rd-project.service.ts`
  - `src/modules/inventory-core/application/inventory.service.ts`
  - `src/modules/reporting/application/monthly-reporting.service.ts`
  - `src/modules/reporting/infrastructure/reporting.repository.ts`
  - this task doc
- Owned paths:
  - `prisma/schema.prisma`
  - `src/modules/rd-subwarehouse/**`
  - `src/modules/rd-project/**`
  - `src/modules/inventory-core/**`
  - `src/modules/reporting/**`
  - `web/src/views/reporting/monthly-reporting/**`
  - `web/src/api/reporting.js`
  - related `test/**`
  - migration/reset/backfill implementation surfaces selected by parent
- Forbidden shared files:
  - parent-owned docs outside `docs/tasks/**`, including requirement, architecture, acceptance, and center docs listed above
- Constraints and non-goals:
  - do not create a new `StockScopeType` for RD project.
  - do not change `inventory_balance` unique semantics away from `materialId + stockScopeId`.
  - do not solve this only in reporting SQL or only in frontend labels.
  - do not allow `RD handoff` without project attribution once the new model is active.
  - do not silently coerce historical unmapped `RD_SUB` facts into fake default projects without explicit migration/backfill rules.
  - do not weaken `inventory-core` single-writer rules.
- Validation command for this scope:
  - `bun run test -- src/modules/rd-subwarehouse/application/rd-handoff.service.spec.ts src/modules/rd-project/application/rd-project.service.spec.ts src/modules/rd-project/application/rd-project-material-action.service.spec.ts src/modules/reporting/application/monthly-reporting.shared.spec.ts src/modules/reporting/application/monthly-reporting.service.spec.ts src/modules/reporting/infrastructure/reporting.repository.spec.ts src/modules/inventory-core/application/inventory.service.spec.ts`
  - `bun run test:e2e -- test/batch-d-slice.e2e-spec.ts`
  - `bun run typecheck`
  - `pnpm --dir web build:prod`
  - browser walkthrough for `monthly-reporting` and RD handoff / RD project flows after fixture alignment

## Reviewer Handoff

- Review focus:
  - handoff line attribution is required and enforced before posting, not patched later in reporting.
  - `inventory_balance` remains stock-scope keyed, while `inventory_log.projectTargetId` or equivalent becomes the fact-level attribution anchor.
  - `RD_SUB` reporting no longer double-counts or drifts between `handoff` and `rd-project` viewpoints.
  - reverse / void flows preserve attribution integrity.
  - migration/backfill logic fails loudly on unmappable persisted data and does not hide data quality gaps.
- Requirement alignment check:
  - confirm implementation matches the new confirmed business rule and the frozen constraints in this task doc.
  - confirm no new `stockScope` semantics were introduced.
  - confirm current drift against `monthly-reporting`, `rd-subwarehouse`, and acceptance docs is consciously addressed rather than ignored.
- Final validation gate:
  - focused unit / integration suites listed above
  - targeted e2e for cross-module regression
  - `bun run typecheck`
  - `pnpm --dir web build:prod`
  - browser/user-flow evidence for project-attributed RD reporting
- Required doc updates:
  - parent-owned shared docs only:
    - `docs/requirements/domain/monthly-reporting.md`
    - `docs/requirements/domain/rd-project-management.md`
    - `docs/requirements/domain/rd-subwarehouse.md`
    - `docs/requirements/domain/inventory-core-module.md`
    - `docs/requirements/REQUIREMENT_CENTER.md`
    - `docs/acceptance-tests/specs/monthly-reporting.md`
    - `docs/acceptance-tests/specs/rd-project.md`
    - new or expanded `rd-subwarehouse` acceptance spec

### Acceptance Evidence Package

- Covered criteria:
  - `[AC-1]` stock-scope vs project-attribution model stays aligned
  - `[AC-2]` handoff write-path attribution is required
  - `[AC-3]` reporting viewpoint is recalculated from attributed facts
  - `[AC-4]` migration/reset strategy is explicit and safe
  - `[AC-5]` QA and acceptance coverage is complete
- Evidence pointers:
  - focused specs:
    - `src/modules/rd-subwarehouse/application/rd-handoff.service.spec.ts`
    - `src/modules/rd-project/application/rd-project.service.spec.ts`
    - `src/modules/rd-project/application/rd-project-material-action.service.spec.ts`
    - `src/modules/reporting/application/monthly-reporting.shared.spec.ts`
    - `src/modules/reporting/application/monthly-reporting.service.spec.ts`
    - `src/modules/reporting/infrastructure/reporting.repository.spec.ts`
    - `src/modules/inventory-core/application/inventory.service.spec.ts`
  - cross-module e2e:
    - `test/batch-d-slice.e2e-spec.ts`
  - browser evidence:
    - monthly-reporting RD project attributed totals
    - RD handoff create / view / reverse path
    - RD project drilldown and `RD_SUB` scoped read views
- Evidence gaps, if any:
  - `docs/acceptance-tests/specs/rd-subwarehouse.md` now exists, but current evidence仍停留在 planning；真正的 acceptance 仍缺 focused tests、browser run 与 reset/reseed执行记录。
- Complete test report requirement: `yes`

### Acceptance Test Expectations

- Acceptance mode: `full`
- User-visible flow affected: `yes`
- Cross-module write path: `yes`
- Irreversible or high-cost business effect: `yes`
- Existing automated user-flow coverage: `partial`
- Browser test required: `yes`
- Browser waiver reason:
- Related acceptance cases:
  - `docs/acceptance-tests/cases/rd-subwarehouse.json`
  - `monthly-reporting` RD viewpoint uses project-attributed totals
  - `rd-handoff` create / void enforces project attribution
  - `rd-project` ledger and drilldown align with handoff-attributed stock
  - `RD_SUB` scoped user sees only scoped project-attributed results
- Related acceptance spec:
  - `docs/acceptance-tests/specs/monthly-reporting.md`
  - `docs/acceptance-tests/specs/rd-project.md`
  - `docs/acceptance-tests/specs/rd-subwarehouse.md`
- Separate acceptance run required: `yes`
- Complete test report required: `yes`
- Required regression / high-risk tags:
  - `rd-subwarehouse`
  - `rd-project`
  - `inventory-core`
  - `reporting`
  - `monthly-reporting`
  - `migration`
  - `reset-reseed`
- Suggested environment / accounts:
  - `.env.dev`
  - `admin / admin123`
  - one `RD_SUB` scoped operator account if available
- Environment owner / setup source:
  - parent orchestrator / local dev environment
- Local acceptance data policy:
  - if existing local/test fixtures violate the new project-attributed `RD_SUB` model, acceptance may clear conflicting data and reseed a coherent dataset before browser verification.
  - reset/reseed must be controlled, documented in the acceptance run, and limited to local/test environments.
  - if fixture reset is used, the run must record which tables or seed domains were cleared and why ad hoc repair was rejected.

## Parallelization Safety

- Status: `not safe`
- If safe, list the exact disjoint writable scopes:
- If not safe, list the shared files or contracts that require a single writer:
  - `prisma/schema.prisma`
  - `src/modules/rd-subwarehouse/**`
  - `src/modules/rd-project/**`
  - `src/modules/inventory-core/**`
  - `src/modules/reporting/**`
  - `web/src/views/reporting/monthly-reporting/**`
  - project attribution and monthly-reporting contracts span shared facts and should remain single-writer for implementation

## Review Log

- Validation results:
  - `planning only`
- Findings:
  - current repo already exposes the central drift:
    - `inventory_balance` unique key is still `materialId + stockScopeId`
    - `inventory_log` already has `projectTargetId`
    - `rd-project` writes project-attributed inventory facts
    - `rd-handoff` and `monthly-reporting` still reflect the older split model
- Follow-up action:
  - downstream coder executes this plan as one slice against the updated shared truth

## Acceptance

- Acceptance status: `accepted`
- Acceptance QA: `saifute-acceptance-qa`
- Acceptance date: `2026-04-14`
- Complete test report: `docs/acceptance-tests/runs/run-20260414-1620-rd-sub-project-attribution-and-reporting-alignment.md`

### Acceptance Checklist

> Acceptance QA 在验收时逐条填写。每条应对应 domain capability 的用户需求或 task doc 的 `[AC-*]` 条目。

- [x] `[AC-1]` stock-scope and project-attribution model stay aligned — Evidence: `inventory_balance` 仍保持仓别余额轴；live stocktake create/void 会写入 `rdProjectId + projectTargetId`，且 `GET /api/rd-projects/1` 的 `currentAvailableQty` 会随之 `1 -> 2 -> 1` 回滚；browser `/rd/projects` 详情显示 `当前可用 1`。 — Verdict: `✓ met`
- [x] `[AC-2]` handoff write-path attribution becomes required at fact level — Evidence: live `GET /api/rd-subwarehouse/handoff-orders` 返回 `RDH-20260413160305-282`，其行级已包含 `rdProjectId / rdProjectCodeSnapshot / rdProjectNameSnapshot`；browser `/rd/inbound-results` 详情显示 `研发项目编码 TEST-RDP-001 / 研发项目名称 测试研发项目`；focused `rd-handoff` evidence 已由 parent 通过。 — Verdict: `✓ met`
- [x] `[AC-3]` reporting totals are recalculated by viewpoint from attributed facts — Evidence: `GET /api/reporting/monthly-reporting/details?yearMonth=2026-04&stockScope=RD_SUB&keyword=RDH-20260413160305-282` 返回 handoff `direction = IN / amount = 900.00`；同单在 `stockScope=MAIN` 返回 `direction = OUT / amount = 900.00`；`keyword=TEST-RDP-001` 的 RD 视角 detail 同时包含 handoff `IN 900` 与项目领用 `OUT 600`，summary `netAmount = 300.00`。 — Verdict: `✓ met`
- [x] `[AC-4]` migration/reset strategy safely handles conflicting data — Evidence: parent 已在 `.env.dev` 上完成本地测试库重建、`prisma db push` 与 `bun --env-file .env.dev scripts/dev/reset-and-seed-test-data.ts`；本轮 live acceptance 产生的临时 stocktake fixture 已通过 `POST /api/rd-subwarehouse/stocktake-orders/2/void` 受控清理。 — Verdict: `✓ met`
- [x] `[AC-5]` focused automated tests and browser acceptance cover the changed risk surface — Evidence: parent automated evidence 已覆盖 `prisma generate / typecheck / focused specs / web build / batch-d-slice.e2e`；本轮独立 browser smoke 覆盖 `/reporting/monthly-reporting`、`/rd/inbound-results`、`/rd/stocktake-orders`、`/rd/projects`，并冻结到 acceptance run。 — Verdict: `✓ met`

### Acceptance Notes

- Acceptance path used: `full`
- Acceptance summary:
  - parent automated evidence 先证明 schema / service / repository / build / e2e 合同成立；
  - acceptance-qa 再用 `.env.dev` live API 证明 handoff、stocktake、rd-project ledger 与 monthly-reporting viewpoint 使用的是同一条项目归属事实链；
  - 最后用 headless Chrome CDP 走通 `monthly-reporting`、`inbound-results`、`rd-projects`、`rd-stocktake-orders` 的真实页面渲染与关键明细展示。
- Report completeness check:
  - complete test report exists at `docs/acceptance-tests/runs/run-20260414-1620-rd-sub-project-attribution-and-reporting-alignment.md`
  - env source explicitly recorded as `.env.dev`
  - parent e2e override `CAPTCHA_ENABLED=true` also recorded in run
- If rejected or blocked: root cause（`requirement-misunderstanding` | `implementation-gap` | `evidence-gap` | `environment-gap`）+ 精确修复指引 / 环境修复指引
- If conditionally accepted: follow-up requirement / task:

## Final Status

- Outcome:
  - `new active planning handoff created`
- Requirement alignment:
  - aligned to the new confirmed business rule and the synced shared truth across requirement / acceptance docs
- Residual risks or testing gaps:
  - acceptance structure已 formalize，但 still lacks implementation evidence, focused runs, and browser walkthrough
  - historical or dirty local data may block clean verification until reset/reseed or backfill is executed
- Directory disposition after completion: keep `active` while the task is still open; once it is no longer active, set this to `retained-completed` or `cleanup-candidate`, then sync `docs/tasks/TASK_CENTER.md`
- Next action:
  - assign single-writer implementation, then run reviewer and acceptance-qa against the execution evidence
