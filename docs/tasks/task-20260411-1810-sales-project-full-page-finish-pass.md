# Sales Project Full-Page Finish Pass

## Metadata

- Scope:
  - 在已 accepted 的 `sales-project Phase 1 / Phase 2` 基线上，完成一个重产品化的 heavy-lane finish pass，把销售项目详情从 `web/src/views/sales-project/index.vue` 内部 `el-drawer` 改为可直达、可刷新、可回退的全屏路由页面。
  - 保持 `docs/requirements/domain/sales-project-management.md` 已确认的 `F1/F2/F3/F4` 为边界，只补齐“成为可用产品”仍缺的体验和闭环缺口，不引入 `F5` 项目分配 / 预留，也不扩写新 requirement。
  - parent 明确保留实现 ownership；本 task 仅为本轮本地执行、review、acceptance 提供 durable handoff，不要求 planner 改动 `docs/tasks/TASK_CENTER.md`。
- Related requirement: `docs/requirements/domain/sales-project-management.md (REQ-SP-001 / F1,F2,F3,F4)`
- Status: `planned`
- Review status: `not-reviewed`
- Delivery mode: `autonomous`
- Acceptance mode: `full`
- Acceptance status: `not-assessed`
- Complete test report required: `yes`
- Lifecycle disposition: `active`
- Planner: `saifute-planner`
- Coder: `parent-orchestrator`
- Reviewer: `saifute-code-reviewer`
- Acceptance QA: `saifute-acceptance-qa`
- Last updated: `2026-04-11`
- Related checklist: `-`
- Related acceptance spec: `docs/acceptance-tests/specs/sales-project.md`
- Related acceptance run: `docs/acceptance-tests/runs/run-YYYYMMDD-HHMM-sales-project-full-page-finish-pass.md`
- Related files:
  - `docs/requirements/domain/sales-project-management.md`
  - `docs/architecture/modules/sales-project.md`
  - `docs/tasks/archive/retained-completed/task-20260410-1700-sales-project-phase1-phase2-delivery.md`
  - `web/src/views/sales-project/index.vue`
  - `web/src/store/modules/permission.js`
  - `web/src/api/sales-project.js`
  - related `src/modules/sales-project/**`
  - related `src/modules/sales/**`
  - related `test/**`

## Requirement Alignment

- Domain capability:
  - `docs/requirements/domain/sales-project-management.md (REQ-SP-001 / F1,F2,F3,F4)`
  - `docs/architecture/modules/sales-project.md`
  - accepted baseline: `docs/tasks/archive/retained-completed/task-20260410-1700-sales-project-phase1-phase2-delivery.md`
- User intent summary:
  - 用户明确要求继续完成 `sales-project` 到“可用产品”水平，并明确要求走 heavy-lane / subagent 心智。
  - 已确认问题是：当前打开项目详情仍在 `SalesProjectLedger -> sales-project/index` 页内使用 `el-drawer`；用户要的是全屏详情页，而不是侧边抽屉。
  - 本轮 planning 只收敛 finish-pass 的执行边界：以 accepted `F1-F4` 为真源，完成详情页面路由化，并识别和修复剩余的产品化缺口，但不改变 requirement scope。
- Acceptance criteria carried into this task:
  - `F1-F4` 仍视为已确认能力边界；本 task 只做 finish pass，不把 `F5` 或项目管理系统语义静默混入。
  - 销售项目详情必须从 drawer 状态切为 first-class route/page，支持直达、刷新、返回和权限可达。
  - 项目详情页仍需承接已有 `F2/F3/F4` 内容：项目摘要、项目物料读模型、项目维度统计、按项目上下文生成销售出库草稿。
  - “可用产品”所需的剩余 gap 只允许在当前 `F1-F4` 范围内收口，例如导航、深链接、刷新恢复、详情刷新、列表到详情闭环、草稿提交后的回流一致性；不得借机扩 scope。
- Requirement evidence expectations:
  - focused 自动化验证至少覆盖销售项目详情加载、项目草稿生成链路和受影响 shared surfaces。
  - `pnpm --dir web build:prod` 与浏览器 walkthrough 必须覆盖列表进入详情、URL 直达详情、返回列表、详情生成草稿及提交回流。
  - acceptance evidence 继续落在 `docs/acceptance-tests/specs/sales-project.md` 与本轮 run doc，不新建 requirement truth。
- Open questions requiring user confirmation:
  - `none`; 详情路由的具体路径结构可在执行中选定，但必须保持“销售项目详情是独立页面”这一用户确认目标。

## Progress Sync

- Phase progress:
  - `planning complete; implementation not started`
- Current state:
  - accepted baseline 已完成 `F1/F2/F3/F4` 并形成前后端闭环，但当前前端详情仍内嵌在 `web/src/views/sales-project/index.vue` 的 `el-drawer` 中。
  - 当前菜单 / 路由入口仍为 `SalesProjectLedger -> sales-project/index`，详情打开逻辑和详情刷新都耦合在列表页局部状态内。
- Acceptance state:
  - `not-assessed`
- Blockers:
  - `none`
- Next step:
  - parent 按本 task 先做 sales-project finish-pass 审计，再执行路由化改造和必要的 F1-F4 产品化补缺。

## Goal And Acceptance Criteria

- Goal:
  - 在不改变销售项目 `F1-F4` requirement scope 的前提下，把销售项目详情收敛为独立全屏页面，并完成使 `sales-project` 成为可用产品所需的剩余产品化补缺。
- Acceptance criteria:
  - `[AC-1]` 销售项目详情从 `sales-project/index` 的 `el-drawer` 迁移为独立可路由页面；列表页不再承担主详情展示容器。
  - `[AC-2]` 用户可从列表进入详情，也可通过直达 URL / 刷新后稳定加载同一项目详情；返回列表与权限受控行为清晰可用。
  - `[AC-3]` 全屏详情页完整承接当前 `F2/F3/F4` 已有内容：项目主档摘要、项目物料读模型、项目维度统计、按项目上下文生成销售出库草稿，以及草稿提交后的可预期回流刷新。
  - `[AC-4]` 执行中补齐的其余缺口仅限当前 `F1-F4` 成为“可用产品”所必需的 gap，并在交付中显式说明；不得引入 `F5`、项目生命周期管理、平行库存账或旁路库存写入。
  - `[AC-5]` full validation 成立：受影响自动化验证、`web build`、review 与浏览器验收能覆盖列表、详情、直达、回退、草稿生成回流这条主用户流。

## Scope And Ownership

- Allowed code paths:
  - `web/src/views/sales-project/**`
  - `web/src/api/sales-project.js`
  - `web/src/store/modules/permission.js`
  - `web/src/views/sales/components/**`（仅项目草稿生成共享交互需要时）
  - `src/modules/sales-project/**`（仅当详情页 / 草稿回流暴露出当前 API 合同缺口时）
  - `src/modules/sales/**`（仅当项目草稿 / 项目绑定合同需最小兼容修复时）
  - 与本 task 直接相关的 `test/**`
  - `docs/acceptance-tests/specs/sales-project.md`
  - `docs/acceptance-tests/runs/run-YYYYMMDD-HHMM-sales-project-full-page-finish-pass.md`
- Frozen or shared paths:
  - `docs/tasks/**` 由 parent 持有；本轮 planner 已完成建档，执行阶段不要求改 `docs/tasks/TASK_CENTER.md`。
  - `docs/requirements/**` 与 `docs/architecture/**` 为 shared truth，只读引用，不因 finish-pass 顺手改写。
  - `src/modules/inventory-core/**` 继续视为库存唯一写入口共享域，不得因详情页改造扩大改动。
  - `src/modules/rd-project/**`、`src/modules/rd-subwarehouse/**` 保持冻结，不得借由 finish-pass 回退复用。
- Task doc owner:
  - `parent orchestrator`
- Contracts that must not change silently:
  - `sales-project` 不是项目管理系统，不引入阶段、审批流、任务协同或新状态机。
  - 真实库存变化继续只走 `sales` / `inventory-core`，项目详情页不能变相直接扣库存。
  - 项目维度事实继续依赖已有 `salesProjectId` 与项目快照，不允许为详情页 / 统计页额外建平行发货账。
  - `F5` 项目分配 / 预留明确不在本 task 范围内。

## Implementation Plan

- [ ] Step 1: 基于 accepted baseline 做一次 finish-pass 审计，只记录当前 `F1-F4` 成为可用产品仍缺的 gap，至少覆盖详情入口、直达、刷新、返回、详情刷新、草稿回流和权限可达。
- [ ] Step 2: 拆分销售项目详情为独立路由页面 / 组件，解除 `web/src/views/sales-project/index.vue` 对详情展示与刷新状态的内聚耦合。
- [ ] Step 3: 调整列表页、菜单 / 路由注册与详情页导航合同，确保用户能从列表进入详情、从详情返回列表，并支持浏览器刷新与深链接直达。
- [ ] Step 4: 在不扩 scope 的前提下，补齐路由化过程中暴露出的其余 `F1-F4` 产品化缺口，仅限使主用户流可用所必需的前后端兼容修复。
- [ ] Step 5: 运行 focused tests、`pnpm --dir web build:prod`、independent review 与 full acceptance，并把本轮 finish-pass 的 gap closure 记录到 acceptance evidence。

## Coder Handoff

- Execution brief:
  - 先把“drawer detail”当成 confirmed blocker 处理，再围绕主用户流审计其它 finish-pass gap。
  - 详情页路由化必须是结构性调整，不接受只把 drawer 拉宽、伪全屏或继续依赖列表页局部状态充当详情真源。
  - 如果执行中发现后端 / API 需要修补，只允许做支撑当前 `F1-F4` 用户流的最小兼容修复，不得借机扩需求。
- Required source docs or files:
  - `docs/requirements/domain/sales-project-management.md`
  - `docs/architecture/modules/sales-project.md`
  - `docs/tasks/archive/retained-completed/task-20260410-1700-sales-project-phase1-phase2-delivery.md`
  - `web/src/views/sales-project/index.vue`
  - `web/src/store/modules/permission.js`
  - `web/src/api/sales-project.js`
  - 本 task doc
- Owned paths:
  - `web/src/views/sales-project/**`
  - `web/src/api/sales-project.js`
  - `web/src/store/modules/permission.js`
  - `web/src/views/sales/components/**`（仅共享项目草稿交互需要时）
  - `src/modules/sales-project/**`（仅必要 API 合同修补）
  - `src/modules/sales/**`（仅必要项目草稿 / 绑定兼容修补）
  - 与本 task 直接相关的 `test/**`
  - `docs/acceptance-tests/**`
- Forbidden shared files:
  - `docs/tasks/TASK_CENTER.md`
  - `docs/requirements/**`
  - `docs/architecture/**`
  - `src/modules/inventory-core/**`
  - `src/modules/rd-project/**`
  - `src/modules/rd-subwarehouse/**`
- Constraints and non-goals:
  - 不实现 `F5` 项目分配 / 预留。
  - 不新增项目状态系统、审批流或其他项目管理语义。
  - 不为详情页引入平行统计账、平行发货账或项目自有库存写模型。
  - 不把“可用产品”解释成 requirement 扩容；任何超出 `F1-F4` 的需求都要回到 planning。
- Validation command for this scope:
  - `pnpm test -- src/modules/sales-project/**/*.spec.ts src/modules/sales/**/*.spec.ts`
  - `pnpm typecheck`
  - `pnpm --dir web build:prod`
  - browser walkthrough for `/sales/project` and the new sales-project detail route

## Reviewer Handoff

- Review focus:
  - 详情是否真的从 drawer 切成独立 route/page，而不是保留旧状态结构换壳。
  - 列表 -> 详情 -> 草稿 -> 回流 这条主用户流是否在刷新、深链接、返回和权限场景下成立。
  - finish-pass 补缺是否仍严格停留在 `F1-F4`，没有夹带 `F5` 或 requirement 扩容。
  - 若触达后端 / shared sales surfaces，是否保持项目绑定合同和真实库存写路径不变。
- Requirement alignment check:
  - 对照 `docs/requirements/domain/sales-project-management.md (REQ-SP-001 / F1,F2,F3,F4)`。
  - 对照 `docs/architecture/modules/sales-project.md` 中“项目详情读模型 / 项目草稿生成 / 不直接写库存”的边界。
- Final validation gate:
  - focused tests for touched `sales-project` / `sales` surfaces
  - `pnpm typecheck`
  - `pnpm --dir web build:prod`
  - browser walkthrough covering list, detail deep-link, back navigation, draft generation, and post-submit refresh
- Required doc updates:
  - `docs/acceptance-tests/specs/sales-project.md`
  - `docs/acceptance-tests/runs/run-YYYYMMDD-HHMM-sales-project-full-page-finish-pass.md`

### Acceptance Evidence Package

- Covered criteria:
  - `[AC-1]` 全屏详情路由化
  - `[AC-2]` 直达 / 刷新 / 返回 / 权限
  - `[AC-3]` 详情内容与草稿回流
  - `[AC-4]` finish-pass gap closure scope discipline
  - `[AC-5]` 验证闭环
- Evidence pointers:
  - touched `sales-project` / `sales` focused tests
  - `pnpm typecheck`
  - `pnpm --dir web build:prod`
  - browser walkthrough of `/sales/project` and the detail route
  - updated `docs/acceptance-tests/specs/sales-project.md`
  - acceptance run doc for this finish pass
- Evidence gaps, if any:
  - 若详情仍依赖列表页局部状态、无法通过 URL 直达 / 刷新恢复，或草稿提交流程在新详情页下断裂，不得签收。
- Complete test report requirement: `yes`

### Acceptance Test Expectations

- Acceptance mode: `full`
- User-visible flow affected: `yes`
- Cross-module write path: `yes`
- Irreversible or high-cost business effect: `no`
- Existing automated user-flow coverage: `partial`
- Browser test required: `yes`
- Browser waiver reason:
- Related acceptance cases:
  - `sales-project` list to detail full-page navigation
  - `sales-project` direct detail route load / refresh / back navigation
  - `sales-project` outbound draft generation from full-page detail
- Related acceptance spec:
  - `docs/acceptance-tests/specs/sales-project.md`
- Separate acceptance run required: `yes`
- Complete test report required: `yes`
- Required regression / high-risk tags:
  - `sales-project`
  - `sales`
  - `routing`
  - `frontend`
  - `draft-generation`
- Suggested environment / accounts:
  - `.env.dev`
  - `admin / admin123`
- Environment owner / setup source:
  - parent orchestrator / local dev environment

## Parallelization Safety

- Status: `not safe`
- If safe, list the exact disjoint writable scopes:
- If not safe, list the shared files or contracts that require a single writer:
  - `web/src/views/sales-project/index.vue` and the new detail route surface will be structurally split from one another.
  - `web/src/store/modules/permission.js` and sales-project route contracts are shared entry surfaces.
  - shared `sales` draft editor interactions and any supporting API contract fixes are tightly coupled to the same user flow.
  - parent already stated implementation stays local, so a single writer should retain ownership.

## Review Log

- Validation results:
  - `pending`
- Findings:
  - `pending`
- Follow-up action:
  - `pending`

## Acceptance

- Acceptance status: `not-assessed`
- Acceptance QA:
- Acceptance date:
- Complete test report:

### Acceptance Checklist

> Acceptance QA 在验收时逐条填写。每条应对应 domain capability 的用户需求或 task doc 的 `[AC-*]` 条目。

- [ ] `[AC-1]` sales-project detail is a full-page route — Evidence: ... — Verdict: `✓ met` | `✗ not met` | `△ partially met`
- [ ] `[AC-2]` detail supports direct URL, refresh, return, and permissioned access — Evidence: ... — Verdict: `✓ met` | `✗ not met` | `△ partially met`
- [ ] `[AC-3]` detail page still supports summary, materials, statistics, and draft flow — Evidence: ... — Verdict: `✓ met` | `✗ not met` | `△ partially met`
- [ ] `[AC-4]` additional fixes stay inside `F1-F4` usable-product scope only — Evidence: ... — Verdict: `✓ met` | `✗ not met` | `△ partially met`
- [ ] `[AC-5]` validation and browser evidence cover the main user flow — Evidence: ... — Verdict: `✓ met` | `✗ not met` | `△ partially met`

### Acceptance Notes

- Acceptance path used: `full`
- Acceptance summary:
- Report completeness check:
- If rejected or blocked: root cause（`requirement-misunderstanding` | `implementation-gap` | `evidence-gap` | `environment-gap`）+ 精确修复指引 / 环境修复指引
- If conditionally accepted: follow-up requirement / task:

## Final Status

- Outcome:
- Requirement alignment:
- Residual risks or testing gaps:
- Directory disposition after completion: keep `active` while the task is still open; once it is no longer active, set this to `retained-completed` or `cleanup-candidate`, then sync `docs/tasks/TASK_CENTER.md`
- Next action:
