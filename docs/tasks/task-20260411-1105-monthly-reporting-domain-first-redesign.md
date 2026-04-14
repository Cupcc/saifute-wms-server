# Monthly Reporting Domain-First Redesign

## Metadata

- Scope:
  - 在已 accepted 的 `monthly-reporting Phase 1` 基线上，把月度对账从“动作优先目录”重切为“领域优先目录”，先回答仓库总入 / 总出，再按领域展开操作汇总。
  - 保持 `reporting` 只读定位，不新增事务写模型，不进入 `F6/F7` 正式月报冻结、人工重算、日期范围报表语义。
  - 覆盖用户明确要求的四个领域视角：`车间领退报废`、`销售出退`、`销售项目维度统计`、`RD 小仓协同交接`。
- Related requirement: `docs/requirements/domain/monthly-reporting.md (F1,F2,F3,F4,F5)`; `docs/requirements/domain/sales-project-management.md (F4)`
- Status: `implemented`
- Review status: `in-review`
- Delivery mode: `autonomous`
- Acceptance mode: `full`
- Acceptance status: `in-progress`
- Complete test report required: `yes`
- Lifecycle disposition: `active`
- Planner: `saifute-planner`
- Coder: `parent-orchestrator`
- Reviewer: `saifute-code-reviewer`
- Acceptance QA: `saifute-acceptance-qa`
- Last updated: `2026-04-11`
- Related checklist: `-`
- Related acceptance spec: `docs/acceptance-tests/specs/monthly-reporting.md`
- Related acceptance run: `docs/acceptance-tests/runs/run-20260411-1200-monthly-reporting-domain-first.md`
- Related files:
  - `docs/tasks/archive/retained-completed/task-20260411-0301-monthly-reporting-phase1-delivery.md`
  - `docs/requirements/domain/monthly-reporting.md`
  - `docs/requirements/domain/sales-project-management.md`
  - `docs/requirements/REQUIREMENT_CENTER.md`
  - `docs/tasks/TASK_CENTER.md`
  - `docs/architecture/modules/reporting.md`
  - `docs/architecture/modules/workshop-material.md`
  - `src/modules/reporting/**`
  - `web/src/views/reporting/monthly-reporting/**`
  - `web/src/api/reporting.js`
  - related `test/**`

## Requirement Alignment

- Domain capability:
  - `docs/requirements/domain/monthly-reporting.md (F1,F2,F3,F4,F5)`
  - `docs/requirements/domain/sales-project-management.md (F4)`
  - accepted baseline: `docs/tasks/archive/retained-completed/task-20260411-0301-monthly-reporting-phase1-delivery.md`
  - 当前 accepted `Phase 1` 真源是“仓库侧本期发生金额月度对账”，但其一级目录采用动作优先；本 task 在同一能力边界内重定向为领域优先，不扩成 `F6/F7`。
- User intent summary:
  - 用户明确否定现有 `INBOUND / OUTBOUND / CONSUMPTION / ADJUSTMENT_COLLAB` 一级切法，要求先看一个仓库总的入了多少、出了多少，再按业务领域展开。
  - 用户要求的领域视图是：每个车间领 / 退 / 报废多少，销售卖出去多少，销售项目每个项目多少，研发领料到小仓多少。
- Acceptance criteria carried into this task:
  - 一级结构必须先回答仓库总入 / 总出，而不是先按动作目录切。
  - 车间域必须能按车间回答 `领料 / 退料 / 报废`。
  - 销售域必须能回答 `销售出库 / 销售退货 / 净发货` 或等价出退关系。
  - 销售项目域必须复用真实 `salesProjectId` / 项目快照事实，不允许在报表层猜项目归属。
  - RD 小仓协同域必须把 `主仓到 RD 交接` 从当前混合“调整 / 协同”桶中提升为独立领域视图。
  - 主题下钻、导出、异常标识和角色范围隔离不能在重切过程中丢失。
- Requirement evidence expectations:
  - shared truth 需更新：`monthly-reporting` domain 文档与 `REQUIREMENT_CENTER` 需从动作优先修正到领域优先。
  - focused 自动化验证需覆盖领域聚合、筛选、导出合同、销售项目维度统计、RD handoff 视图隔离。
  - full acceptance 需补浏览器 walkthrough，确认用户实际看到的是领域优先页面与正确下钻路径。
- Open questions requiring user confirmation:
  - `none`; 用户已明确确认当前理解正确并要求执行。

## Progress Sync

- Phase progress:
  - `implementation complete; review and browser acceptance pending`
- Current state:
  - 已存在 accepted 基线：`docs/tasks/archive/retained-completed/task-20260411-0301-monthly-reporting-phase1-delivery.md`；本 task 在该基线上完成了“领域优先”重切，不回写 archive 结论。
  - 已完成 shared truth、reporting read model、monthly reporting UI 与导出工作表的领域优先改造，并已通过 focused tests、e2e、typecheck 与 web build。
  - 当前工作区含未提交月报相关改动；收尾阶段以 parent orchestrator 持续持有。
- Acceptance state:
  - `automated evidence recorded; browser walkthrough pending`
- Blockers:
  - `independent code review result pending`
  - `current redesign browser walkthrough pending`
- Next step:
  - parent 整合独立 review 结论，并决定是否继续补 browser acceptance 后归档。

## Goal And Acceptance Criteria

- Goal:
  - 在不破坏 accepted `Phase 1` 读查询闭环和权限隔离的前提下，把月度对账改造成“总览先看仓库总入 / 总出、再按领域展开、再在领域内看操作与单据追溯”的页面和读模型。
- Acceptance criteria:
  - `[AC-1]` 总览成立：月度对账顶部能直接回答当前筛选范围内的 `总入 / 总出 / 净发生`，而不是只给单一总金额。
  - `[AC-2]` 领域一级目录成立：页面与导出以业务领域组织，而不是以 `INBOUND / OUTBOUND / CONSUMPTION / ADJUSTMENT_COLLAB` 作为主导航。
  - `[AC-3]` 车间域成立：系统可按车间展示 `领料 / 退料 / 报废` 汇总，并保留下钻到单据头的能力。
  - `[AC-4]` 销售域成立：系统可展示 `销售出库 / 销售退货 / 净发货` 或等价销售出退汇总，并保留下钻能力。
  - `[AC-5]` 销售项目域成立：系统可按销售项目展示项目维度统计，且统计来源明确复用 `sales` 真实项目绑定事实，不新建平行项目发货账。
  - `[AC-6]` RD 小仓协同域成立：系统可独立展示 `主仓到 RD 交接` 结果，不再与 `RD 盘盈 / 盘亏 / 调价` 混成同一主领域视图。
  - `[AC-7]` 读模型合同成立：领域优先重切后，导出、筛选、权限隔离、异常标识、明细下钻仍保持同口径。
  - `[AC-8]` 验证闭环成立：focused 自动化验证、web build、review 与 full acceptance 至少覆盖 `AC-1`~`AC-7` 的主要风险面。

## Scope And Ownership

- Allowed code paths:
  - `docs/requirements/domain/monthly-reporting.md`
  - `docs/requirements/REQUIREMENT_CENTER.md`
  - `docs/tasks/TASK_CENTER.md`
  - `src/modules/reporting/**`
  - `web/src/views/reporting/monthly-reporting/**`
  - `web/src/api/reporting.js`
  - 与本 task 直接相关的 `test/**`
  - `docs/acceptance-tests/specs/monthly-reporting.md`
  - `docs/acceptance-tests/runs/run-YYYYMMDD-HHMM-monthly-reporting-domain-first.md`
- Frozen or shared paths:
  - `docs/tasks/**` 由 parent orchestrator 持有；实现阶段不得让 coder 子代理擅自回写。
  - `docs/requirements/domain/sales-project-management.md`、`docs/architecture/modules/reporting.md`、`docs/architecture/modules/workshop-material.md` 属于 shared truth / reference，只读引用为主。
  - `src/modules/sales/**`、`src/modules/sales-project/**`、`src/modules/workshop-material/**`、`src/modules/rd-project/**`、`src/modules/rd-subwarehouse/**` 默认冻结；除非读模型无法成立，否则不要扩成跨模块写改。
- Task doc owner:
  - `parent orchestrator`
- Contracts that must not change silently:
  - `reporting` 继续保持只读聚合定位，不拥有事务写模型。
  - `inventory-core` 仍是库存唯一写入口；本 task 不得为报表需求旁路改库存事实。
  - 销售项目统计必须基于真实 `salesProjectId` / 项目快照事实，不能在报表层用车间、客户或单据号启发式猜归属。
  - RD 小仓协同视图只能重组读模型，不能偷偷修改 `RD handoff`、盘点或调价的事务语义。
  - 当前 accepted `Phase 1` 归档结论视为基线；本 task 是重切与升级，不是回滚、覆盖或重写 `docs/tasks/archive/retained-completed/task-20260411-0301-monthly-reporting-phase1-delivery.md`。

## Implementation Plan

- [ ] Step 1: 修正 `monthly-reporting` shared truth，把 requirement 文档从动作优先改成领域优先，并同步 `REQUIREMENT_CENTER` / `TASK_CENTER`。
- [ ] Step 2: 梳理现有月报读模型与 dirty worktree 差异，确认在 accepted 基线之上增量重切的安全边界。
- [ ] Step 3: 在 `src/modules/reporting/**` 内引入领域优先聚合模型，补齐仓库总入 / 总出总览、车间域、销售域、销售项目域、RD 协同域。
- [ ] Step 4: 重构 `web/src/views/reporting/monthly-reporting/**` 页面结构与导出交互，使 UI 先展示总览再按领域展开，并保持下钻 / 筛选 / 权限隔离一致。
- [ ] Step 5: 运行 focused tests、typecheck、web build、review 与 full acceptance，记录证据并更新 acceptance spec / run。

## Coder Handoff

- Execution brief:
  - 在 accepted `Phase 1` 月度对账基线上，把页面与读模型从“主题目录账”升级为“领域账”。
  - 优先修正 shared truth，再重构 service / repository / view；不要只改前端文案或只调换展示顺序。
  - 销售项目维度若当前月报读模型未带出项目锚点，需通过现有真实 `sales` 项目绑定事实补齐，不得在报表层猜。
- Required source docs or files:
  - `docs/requirements/domain/monthly-reporting.md`
  - `docs/requirements/domain/sales-project-management.md`
  - `docs/architecture/modules/reporting.md`
  - `docs/architecture/modules/workshop-material.md`
  - `src/modules/reporting/**`
  - `web/src/views/reporting/monthly-reporting/**`
  - 本 task doc
- Owned paths:
  - `docs/requirements/domain/monthly-reporting.md`
  - `docs/requirements/REQUIREMENT_CENTER.md`
  - `docs/tasks/TASK_CENTER.md`
  - `src/modules/reporting/**`
  - `web/src/views/reporting/monthly-reporting/**`
  - `web/src/api/reporting.js`
  - 与本 task 直接相关的 `test/**`
  - `docs/acceptance-tests/**`
- Forbidden shared files:
  - `docs/architecture/**`
  - `src/modules/inventory-core/**`
  - `src/modules/sales/**`
  - `src/modules/sales-project/**`
  - `src/modules/workshop-material/**`
  - `src/modules/rd-project/**`
  - `src/modules/rd-subwarehouse/**`
- Constraints and non-goals:
  - 不进入 `F6/F7`，不做正式月报冻结、人工重算、日期范围报表。
  - 不引入财务导入 / 回填，不在系统内自动比对财务数据。
  - 不为了项目统计新建平行项目发货账或临时猜测项目归属。
  - 不把 `RD 盘盈 / 盘亏 / 调价` 混同为“研发领到小仓”。
- Validation command for this scope:
  - `bun run test -- src/modules/reporting/application/monthly-reporting.shared.spec.ts src/modules/reporting/application/monthly-reporting.service.spec.ts src/modules/reporting/infrastructure/reporting.repository.spec.ts`
  - `bun run test:e2e -- test/batch-d-slice.e2e-spec.ts`
  - `bun run typecheck`
  - `pnpm --dir web build:prod`
  - browser walkthrough for `/reporting/monthly-reporting`

## Reviewer Handoff

- Review focus:
  - requirement / implementation 是否都从动作优先改成了领域优先，而不只是页面换标题。
  - 仓库总入 / 总出是否真正来自读模型聚合，而不是前端拼字段。
  - 车间域、销售域、销售项目域、RD 协同域是否互不串口径。
  - 销售项目统计是否复用真实项目锚点；RD 协同是否只展示交接而未混入盘点 / 调价主视图。
  - 导出、筛选、权限隔离与异常标识是否在重构后仍同口径。
- Requirement alignment check:
  - 对照 `docs/requirements/domain/monthly-reporting.md` 的更新后 shared truth。
  - 对照 `docs/requirements/domain/sales-project-management.md (F4)` 的项目统计边界，确认没有报表层猜测归属。
- Final validation gate:
  - focused unit / integration tests for `src/modules/reporting/**`
  - `bun run test:e2e -- test/batch-d-slice.e2e-spec.ts`
  - `bun run typecheck`
  - `pnpm --dir web build:prod`
  - browser walkthrough with export evidence
- Required doc updates:
  - `docs/requirements/domain/monthly-reporting.md`
  - `docs/requirements/REQUIREMENT_CENTER.md`
  - `docs/tasks/TASK_CENTER.md`
  - `docs/acceptance-tests/specs/monthly-reporting.md`
  - `docs/acceptance-tests/runs/run-YYYYMMDD-HHMM-monthly-reporting-domain-first.md`

### Acceptance Evidence Package

- Covered criteria:
  - `[AC-1]` 仓库总览
  - `[AC-2]` 领域一级目录
  - `[AC-3]` 车间域
  - `[AC-4]` 销售域
  - `[AC-5]` 销售项目域
  - `[AC-6]` RD 小仓协同域
  - `[AC-7]` 筛选 / 导出 / 下钻 / 权限一致性
  - `[AC-8]` 验证闭环
- Evidence pointers:
  - `src/modules/reporting/**` focused tests
  - `test/batch-d-slice.e2e-spec.ts`
  - `pnpm --dir web build:prod`
  - browser walkthrough of `/reporting/monthly-reporting`
  - updated `docs/acceptance-tests/specs/monthly-reporting.md`
  - acceptance run doc for this redesign
- Evidence gaps, if any:
  - 若销售项目维度没有真实项目锚点证据、或 RD 协同仍与盘点 / 调价混显，不得签收。
- Complete test report requirement: `yes`

### Acceptance Test Expectations

- Acceptance mode: `full`
- User-visible flow affected: `yes`
- Cross-module write path: `no`
- Irreversible or high-cost business effect: `no`
- Existing automated user-flow coverage: `partial`
- Browser test required: `yes`
- Browser waiver reason:
- Related acceptance cases:
  - `monthly-reporting` domain-first overview and drilldown
  - `sales-project`-backed project statistics in monthly reporting
  - `RD handoff` domain view isolation
- Related acceptance spec:
  - `docs/acceptance-tests/specs/monthly-reporting.md`
- Separate acceptance run required: `yes`
- Complete test report required: `yes`
- Required regression / high-risk tags:
  - `reporting`
  - `monthly-reporting`
  - `sales-project`
  - `rd-subwarehouse`
  - `export`
- Suggested environment / accounts:
  - `.env.dev`
  - `admin / admin123`
  - one `RD_SUB` scoped account if available
- Environment owner / setup source:
  - parent orchestrator / local dev environment

## Parallelization Safety

- Status: `not safe`
- If safe, list the exact disjoint writable scopes:
- If not safe, list the shared files or contracts that require a single writer:
  - `docs/requirements/domain/monthly-reporting.md`
  - `docs/requirements/REQUIREMENT_CENTER.md`
  - `docs/tasks/TASK_CENTER.md`
  - `src/modules/reporting/**`
  - `web/src/views/reporting/monthly-reporting/**`
  - dirty worktree already contains monthly-reporting implementation files; a single parent-owned writer should keep ownership to avoid merge confusion.

## Review Log

- Validation results:
  - `bun run test -- src/modules/reporting/application/monthly-reporting.shared.spec.ts src/modules/reporting/application/monthly-reporting.service.spec.ts src/modules/reporting/infrastructure/reporting.repository.spec.ts` => `pass`
  - `bun run test:e2e -- test/batch-d-slice.e2e-spec.ts` => `pass`
  - `bun run typecheck` => `pass`
  - `pnpm --dir web build:prod` => `pass`
- Findings:
  - `independent review pending`
- Follow-up action:
  - implement

## Acceptance

- Acceptance status: `not-assessed`
- Acceptance QA:
- Acceptance date:
- Complete test report:

### Acceptance Checklist

> Acceptance QA 在验收时逐条填写。每条应对应 domain capability 的用户需求或 task doc 的 `[AC-*]` 条目。

- [ ] `[AC-1]` 仓库总览成立 — Evidence: ... — Verdict: `✓ met` | `✗ not met` | `△ partially met`
- [ ] `[AC-2]` 领域一级目录成立 — Evidence: ... — Verdict: `✓ met` | `✗ not met` | `△ partially met`
- [ ] `[AC-3]` 车间域成立 — Evidence: ... — Verdict: `✓ met` | `✗ not met` | `△ partially met`
- [ ] `[AC-4]` 销售域成立 — Evidence: ... — Verdict: `✓ met` | `✗ not met` | `△ partially met`
- [ ] `[AC-5]` 销售项目域成立 — Evidence: ... — Verdict: `✓ met` | `✗ not met` | `△ partially met`
- [ ] `[AC-6]` RD 小仓协同域成立 — Evidence: ... — Verdict: `✓ met` | `✗ not met` | `△ partially met`
- [ ] `[AC-7]` 筛选 / 导出 / 下钻 / 权限一致性成立 — Evidence: ... — Verdict: `✓ met` | `✗ not met` | `△ partially met`
- [ ] `[AC-8]` 验证闭环成立 — Evidence: ... — Verdict: `✓ met` | `✗ not met` | `△ partially met`

### Acceptance Notes

- Acceptance path used: `full`
- Acceptance summary:
- Report completeness check:
- If rejected or blocked: root cause（`requirement-misunderstanding` | `implementation-gap` | `evidence-gap` | `environment-gap`）+ precise fix guidance
- If conditionally accepted: follow-up requirement / task:

## Final Status

- Outcome:
- Requirement alignment:
- Residual risks or testing gaps:
- Directory disposition after completion: keep `active` while the task is still open; once it is no longer active, set this to `retained-completed` or `cleanup-candidate`, then sync `docs/tasks/TASK_CENTER.md`
- Next action:
