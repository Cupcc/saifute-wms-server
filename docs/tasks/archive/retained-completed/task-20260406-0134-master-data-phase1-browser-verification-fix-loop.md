# Master Data Phase 1 Browser Verification Fix Loop

## Metadata

- Scope:
  - 继续对 `master-data` `Phase 1` 已交付能力 `F1`~`F8` 做真实浏览器验收，覆盖当前已交付的基础资料管理页与 `F8` 的代表性下拉 / 快照消费面；本 turn 内发现的所有 in-scope 缺陷都必须完成修复、复测、review 收口，并更新 `docs/acceptance-tests/**` 证据。
  - 明确排除 `F9` 物料库存预警配置与 `F10` 主数据批量导入；若浏览器过程中遇到这两项缺口，只记录为 out-of-scope，不实现。
- Related requirement: `docs/requirements/domain/master-data-management.md` (Phase 1: `F1`-`F8`)
- Status: `completed`
- Review status: `reviewed-clean`
- Delivery mode: `autonomous`
- Acceptance mode: `full`
- Acceptance status: `accepted`
- Complete test report required: `yes`
- Lifecycle disposition: `retained-completed`
- Planner: `saifute-planner`
- Coder: `saifute-subagent-orchestration`
- Reviewer: `saifute-code-reviewer`
- Acceptance QA: `saifute-acceptance-qa` + `agent-browser`
- Last updated: `2026-04-06 02:16`
- Related checklist: `None`
- Related acceptance spec: `docs/acceptance-tests/specs/master-data.md`
- Related acceptance run: `docs/acceptance-tests/runs/run-20260406-0134-master-data-f1-f8-browser-verification.md`
- Related files:
  - `docs/requirements/domain/master-data-management.md`
  - `docs/acceptance-tests/README.md`
  - `docs/acceptance-tests/specs/master-data.md`
  - `docs/acceptance-tests/cases/master-data.json`
  - `docs/tasks/archive/retained-completed/task-20260402-1802-master-data-phase1-completion.md`
  - `docs/tasks/archive/retained-completed/task-20260406-0106-master-data-material-category-alignment.md`
  - `docs/tasks/archive/retained-completed/task-20260402-1758-master-data-f4-supplier-crud.md`
  - `src/modules/master-data/**`
  - `src/modules/{inbound,customer,workshop-material,project,rd-subwarehouse,rbac}/**`
  - `web/src/api/base/**`
  - `web/src/views/base/**`
  - `web/src/views/{entry,customer,take,rd}/**`
  - `web/src/utils/permissionCompat.js`
  - `web/src/store/modules/permission.js`
  - `test/**`

## Requirement Alignment

- Domain capability:
  - `docs/requirements/domain/master-data-management.md`
  - 本 task 严格锁定 `F1`~`F8`，不把 `F9/F10` 静默并入。
- User intent summary:
  - 用户明确要求继续做 `master-data` `Phase 1` 的真实浏览器验收，不停在纸面签收；本 turn 内浏览器或补证过程中发现的所有 `F1`~`F8` 缺陷都要修完，并由 subagent 链路完成 fix loop、review 与 acceptance 证据更新。
  - 用户显式要求 subagents 与 browser testing，因此执行方式必须体现：orchestrator 统一调度，coder / reviewer / acceptance QA 分角色顺序收口，不允许多人并行写同一批共享文件。
- Acceptance criteria carried into this task:
  - `[AC-1]` `F1`~`F7` 当前已交付的基础资料管理页或等价用户可达浏览器入口，均完成至少一轮真实新增 / 修改 / 停用 / active-only 复验；若某能力当前没有已交付浏览器入口，必须先以路由 / 菜单 / 现有 acceptance 基线确认其“未交付浏览器面”事实，再决定是否记为阻塞或 evidence gap，不能擅自扩 scope 发明新页面。
  - `[AC-2]` `F8` 必须通过真实消费者复验 `ACTIVE-only` 下拉与快照查询语义；消费者范围以当前已交付页面为准，至少覆盖入库、客户出库 / 退货、车间领退料、研发相关页面中实际依赖主数据的代表性路径。
  - `[AC-3]` 本 turn 中在 `F1`~`F8` 浏览器验收、联调、review 中发现的所有 in-scope 缺陷均已修复并复验通过；若有未关闭项，只允许是精确记录的环境阻塞，且需附绝对路径证据与下一步修复指引。
  - `[AC-4]` 三个已知 dirty 文件 `web/src/views/base/customer/index.vue`、`web/src/views/base/material/index.vue`、`web/src/views/base/personnel/index.vue` 若被触达，必须先读取现有改动并在其基础上做增量修复，不得覆盖、回退或重排用户既有修改。
  - `[AC-5]` review 必须对最终 diff 做独立检查；所有 actionable finding 关闭后才能进入 acceptance。
  - `[AC-6]` `docs/acceptance-tests/specs/master-data.md`、`docs/acceptance-tests/cases/master-data.json`（如新增 / 扩展 browser case）与本 turn 独立 `run` 文档均完成更新，形成完整测试报告。
- Requirement evidence expectations:
  - 浏览器证据：每个已交付 `F1`~`F8` 浏览器能力有明确页面路径、操作结果、关键网络结果或 UI 结果。
  - 代码证据：每个本 turn 修复的缺陷至少有 focused 自动化验证或可重复的 browser rerun 证据；高风险后端规则修复优先补 automated regression。
  - 文档证据：`spec` 维护 AC 结论矩阵，`cases` 维护未代码化 browser/manual case，`run` 冻结本次 full acceptance 的时间点与结果。
- Open questions requiring user confirmation:
  - None. 若执行中发现某个 `F1`~`F8` 能力实际上从未有浏览器交付面，先按 evidence gap / baseline mismatch 报告，不自行发明 requirement。

## Progress Sync

- Phase progress:
  - `master-data` `Phase 1` 已有历史 full acceptance，但当前浏览器证据只覆盖 `F1/F2/F4` 的局部复验；本 task 用于把 `F1`~`F8` 的真实浏览器证据、缺陷修复回环与 acceptance 文档同步到同一基线。
- Current state:
  - 已补齐 `F3/F5/F6/F7/F8` 的同 turn 浏览器验收闭环；本轮发现的 customer / personnel / workshop / stock-scope / menu 可见性缺陷已完成修复、review、focused 自动化验证与 acceptance 文档收口。
- Acceptance state:
  - `accepted`
- Blockers:
  - None.
- Next step:
  - 归档 task，并把本轮 run/spec/cases 作为 `master-data` `Phase 1` 的继续验收基线保留。

## Goal And Acceptance Criteria

- Goal:
  - 让 `master-data` `Phase 1` (`F1`~`F8`) 在当前仓库和 `.env.dev` 本地环境下重新达到可复验、可解释、可审计的 full browser acceptance 状态，并把本 turn 发现的所有 in-scope 缺陷闭环到代码、review 和 acceptance evidence。
- Acceptance criteria:
  - `[AC-1]` `F1`~`F7` 已交付浏览器管理面均通过真实操作复验，且结果与 requirement / 既有 accepted baseline 一致。
  - `[AC-2]` `F8` 的 active-only 下拉 / 快照消费在代表性真实业务页面通过浏览器复验，不仅停留在 unit / consumer test。
  - `[AC-3]` 本 turn 新发现的 `F1`~`F8` 缺陷全部完成修复、focused 自动化验证与浏览器复验。
  - `[AC-4]` 三个 pre-dirty 基础资料页面的既有修改被完整保留，无误覆盖或误回退。
  - `[AC-5]` 独立 review clean，且 reviewer 指出的 actionable findings 全部关闭。
  - `[AC-6]` `master-data` acceptance `spec/cases/run` 均完成更新，完整测试报告可支撑 `full` 结论。

## Scope And Ownership

- Allowed code paths:
  - `src/modules/master-data/**`
  - `web/src/api/base/{material-category,material,customer,supplier,personnel,workshop}.js`
  - `web/src/api/base/{compat}.js`
  - `web/src/views/base/{material-category,material,customer,supplier,personnel,workshop}/index.vue`
  - `web/src/utils/permissionCompat.js`
  - `web/src/store/modules/permission.js`
  - `test/**` 中与 master-data 或其直接消费者相关的 focused regression
  - 仅当 `F8` 浏览器复验明确证明消费侧缺陷时，才允许最小化触达：
    - `src/modules/{inbound,customer,workshop-material,project,rd-subwarehouse,rbac}/**`
    - `web/src/views/{entry,customer,take,rd}/**`
- Frozen or shared paths:
  - `docs/tasks/**` 仅 parent / planner 更新
  - `docs/requirements/**`
  - `docs/architecture/**`
  - `docs/acceptance-tests/**` 仅 acceptance QA 在最终证据收口阶段更新
  - `prisma/schema.prisma` 与迁移文件默认冻结；除非 browser defect 证明现有 `F1`~`F8` 交付无法在不改 schema 的前提下修复，否则不得触碰
  - `src/shared/**`
  - `src/modules/inventory-core/**`
  - `src/modules/workflow/**`
  - `web/src/router/**`
  - `web/src/layout/**`
  - `web/src/views/base/customer/index.vue`、`web/src/views/base/material/index.vue`、`web/src/views/base/personnel/index.vue` 为 pre-dirty shared surfaces；如需编辑，先读现状并保留既有修改
- Task doc owner:
  - `saifute-planner` / parent orchestrator
- Contracts that must not change silently:
  - `master-data` 继续拥有 `F1`~`F8` 的主数据真源与写路径
  - `F8` 的对外语义仍是 active-only 下拉与稳定快照 DTO，不允许消费者直接反查内部表结构
  - `Workshop` 不得被改造成独立库存池
  - 停用仍采用逻辑停用
  - `F9/F10` 继续保持 out-of-scope

## Implementation Plan

- [ ] Step 1
  - 基于 `docs/acceptance-tests/specs/master-data.md`、`docs/acceptance-tests/cases/master-data.json` 与当前菜单 / 路由，列出本 turn 需要复验的 `F1`~`F8` 浏览器页面与代表性消费面，明确每项的页面路径、前置数据、预期结果与 evidence target。
- [ ] Step 2
  - 使用 `.env.dev` 启动标准本地环境，通过真实登录和浏览器操作执行 `F1`~`F8` 复验；对每一个失败点记录精确页面、请求、响应、控制台 / UI 现象与复现步骤。
- [ ] Step 3
  - 对本 turn 发现的每个 in-scope 缺陷实施最小修复；优先在 `master-data` 自身收口，只有当 `F8` 消费者链路明确失配时才扩到消费侧。
- [ ] Step 4
  - 为每个修复补 focused regression：能写 automated test 的优先写 test；不适合自动化的至少完成浏览器 rerun，并把证据写进 acceptance run。
- [ ] Step 5
  - 由 `saifute-code-reviewer` 对最终 diff 做独立 review；关闭所有 actionable finding 后，重新执行受影响自动化验证与浏览器关键路径。
- [ ] Step 6
  - 由 `saifute-acceptance-qa` 更新 `docs/acceptance-tests/specs/master-data.md`、必要时扩充 `docs/acceptance-tests/cases/master-data.json`，并新增 / 更新 `run-20260406-0134-master-data-f1-f8-browser-verification.md` 作为本 turn 冻结报告。

## Coder Handoff

- Execution brief:
  - 这是一个 orchestration 型 task。由 `saifute-subagent-orchestration` 统一调度 `coder -> reviewer -> acceptance-qa` 的顺序链路；允许多角色 subagent，但不允许并行写同一批共享路径。
  - 先完成浏览器盘点，再修缺陷，不要先入为主改代码；每一处代码修改都必须能回指到本 turn 真实失败证据。
  - 若发现某个能力只有 API 已验收、没有当前浏览器交付面，先记录为 baseline/evidence 问题并升级给 parent，不擅自补 UI。
- Required source docs or files:
  - `docs/requirements/domain/master-data-management.md`
  - `docs/acceptance-tests/README.md`
  - `docs/acceptance-tests/specs/master-data.md`
  - `docs/acceptance-tests/cases/master-data.json`
  - `docs/tasks/archive/retained-completed/task-20260402-1802-master-data-phase1-completion.md`
  - `docs/tasks/archive/retained-completed/task-20260406-0106-master-data-material-category-alignment.md`
  - 本 task doc
- Owned paths:
  - `src/modules/master-data/**`
  - `web/src/api/base/**`
  - `web/src/views/base/**`
  - `web/src/utils/permissionCompat.js`
  - `web/src/store/modules/permission.js`
  - `test/**`（仅与本 task 缺陷直接相关的 regression）
- Forbidden shared files:
  - `docs/tasks/**`
  - `docs/requirements/**`
  - `docs/architecture/**`
  - `docs/acceptance-tests/**`（由 acceptance QA 收口）
  - `prisma/schema.prisma`（默认禁止）
  - `src/shared/**`
  - `src/modules/inventory-core/**`
  - `src/modules/workflow/**`
  - `web/src/router/**`
- Constraints and non-goals:
  - 不得把 `F9/F10` 混入实现。
  - 不得为“让浏览器过”而静默修改 requirement、权限语义或 accepted baseline。
  - 不得覆盖 pre-dirty 的 `customer/material/personnel` 三个基础资料页面既有改动。
  - 对 `F8` 消费侧修复必须是最小必要变更；不能借机重构整条消费者页面。
  - 若浏览器失败只是环境数据缺口，先用最小 fixture 或已存在管理页完成前置，不要把环境问题误改成产品逻辑。
- Validation command for this scope:
  - `pnpm test -- src/modules/master-data/application/master-data.service.spec.ts src/modules/master-data/infrastructure/master-data.repository.spec.ts src/modules/master-data/controllers/master-data.controller.spec.ts`
  - 受影响消费者的 focused tests（仅当实际触达对应模块时）
  - `env -u CAPTCHA_ENABLED pnpm verify`
  - `pnpm --dir web build:prod`
  - 浏览器复验：`.env.dev`、backend `:8112`、web `:90`
- Subagent sequencing:
  - `saifute-subagent-orchestration`: 盘点页面矩阵、串联执行、守住共享边界、整合 diff
  - `saifute-coder`: 实施修复与 focused regression
  - `saifute-code-reviewer`: 独立 review，优先找浏览器行为回归、契约漂移、漏测
  - `saifute-acceptance-qa` + `agent-browser`: 真实复验并更新 `spec/cases/run`

## Reviewer Handoff

- Review focus:
  - 真实浏览器失败是否都能在最终 diff 或 acceptance 证据中闭环；不能留下“已知但未处理”的 in-scope 缺陷。
  - `F8` 消费侧改动是否保持最小必要，不把 master-data 问题扩写成跨模块重构。
  - pre-dirty 的三个基础资料页面是否被安全保留原修改，没有误覆盖。
  - acceptance 文档更新是否与实际 browser / automated evidence 一致，没有把旧 run 冒充本 turn 结果。
- Requirement alignment check:
  - 对照 `F1`~`F8` 的 domain 合同，确认没有把 `F9/F10` 混入，也没有改变 `ACTIVE-only`、逻辑停用、快照隔离、车间与库存范围分离等冻结语义。
- Final validation gate:
  - `pnpm test -- src/modules/master-data/application/master-data.service.spec.ts src/modules/master-data/infrastructure/master-data.repository.spec.ts src/modules/master-data/controllers/master-data.controller.spec.ts`
  - 受影响消费者 focused tests
  - `env -u CAPTCHA_ENABLED pnpm verify`
  - `pnpm --dir web build:prod`
  - 由 acceptance QA 执行的 full browser rerun
- Required doc updates:
  - reviewer 不改 `docs/tasks/**`
  - 若发现 acceptance 证据缺口，明确指出应更新的 `spec/cases/run` 项，不自行代写最终验收结论

### Acceptance Evidence Package

- Covered criteria:
  - `[AC-1]` `F1`~`F7` 浏览器复验
  - `[AC-2]` `F8` 代表性消费者浏览器复验
  - `[AC-3]` 缺陷修复与 rerun
  - `[AC-4]` pre-dirty 页面保留
  - `[AC-5]` review clean
  - `[AC-6]` `spec/cases/run` 完整更新
- Evidence pointers:
  - `docs/acceptance-tests/specs/master-data.md`
  - `docs/acceptance-tests/cases/master-data.json`
  - `docs/acceptance-tests/runs/run-20260406-0134-master-data-f1-f8-browser-verification.md`
  - `src/modules/master-data/**`
  - `web/src/views/base/**`
  - `web/src/views/{entry,customer,take,rd}/**`
  - `test/**`
- Evidence gaps, if any:
  - Planning time none; execution中如发现某能力无当前浏览器交付面，必须在 run 中显式记为 `blocked` 或 `not-met`，不可省略。
- Complete test report requirement: `yes`

### Acceptance Test Expectations

- Acceptance mode: `full`
- User-visible flow affected: `yes`
- Cross-module write path: `yes`
- Irreversible or high-cost business effect: `no`
- Existing automated user-flow coverage: `partial`
- Browser test required: `yes`
- Browser waiver reason:
  - `N/A`
- Related acceptance cases:
  - `docs/acceptance-tests/cases/master-data.json`
- Related acceptance spec:
  - `docs/acceptance-tests/specs/master-data.md`
- Separate acceptance run required: `yes`
- Complete test report required: `yes`
- Required regression / high-risk tags:
  - `master-data-f1`
  - `master-data-f2`
  - `master-data-f3`
  - `master-data-f4`
  - `master-data-f5`
  - `master-data-f6`
  - `master-data-f7`
  - `master-data-f8`
  - `browser-full`
  - `acceptance-evidence-refresh`
- Suggested environment / accounts:
  - `.env.dev`
  - backend `http://localhost:8112`
  - web `http://localhost:90`
  - 具备 `master:*` 与相关消费者页面权限的 `admin` 或等价 acceptance 账号
- Environment owner / setup source:
  - 当前仓库本地标准开发环境，按 `docs/acceptance-tests/README.md` 与 `pnpm dev` 口径执行

## Parallelization Safety

- Status: `not_safe`
- If safe, list the exact disjoint writable scopes:
  - `N/A`
- If not safe, list the shared files or contracts that require a single writer:
  - `src/modules/master-data/application/master-data.service.ts`
  - `src/modules/master-data/infrastructure/master-data.repository.ts`
  - `web/src/views/base/customer/index.vue`
  - `web/src/views/base/material/index.vue`
  - `web/src/views/base/personnel/index.vue`
  - `web/src/views/base/supplier/index.vue`
  - `web/src/views/base/workshop/index.vue`
  - `web/src/utils/permissionCompat.js`
  - `web/src/store/modules/permission.js`
  - `docs/acceptance-tests/specs/master-data.md`
  - `docs/acceptance-tests/cases/master-data.json`
  - `F8` 的 active-only / snapshot 契约横跨 master-data 与多个消费模块，必须由单 orchestration writer 顺序收口

## Review Log

- Validation results:
  - `2026-04-06`: `pnpm --dir web build:prod` ✅
  - `2026-04-06`: `pnpm test -- src/modules/master-data/controllers/master-data.controller.spec.ts src/modules/master-data/application/master-data.service.spec.ts src/modules/master-data/infrastructure/master-data.repository.spec.ts` ✅ (`3` suites / `80` tests)
  - `2026-04-06`: `agent-browser` 真实页面复验 ✅；`/base/customer`、`/base/personnel`、`/base/workshop`、`/base/stock-scope` 与 `/entry/order` 关键路径均通过
- Findings:
  - `2026-04-06`: reviewer 未保留源码层 actionable finding；仅指出 acceptance docs 与编辑流 browser evidence 缺口，已在本 turn 内补齐并关闭。
- Follow-up action:
  - `None.`

## Acceptance

- Acceptance status: `accepted`
- Acceptance QA:
  - `saifute-acceptance-qa`
- Acceptance date:
  - `2026-04-06`
- Complete test report:
  - `yes`

### Acceptance Checklist

> Acceptance QA 在验收时逐条填写。每条应对应 domain capability 的用户需求或 task doc 的 `[AC-*]` 条目。

- [x] `[AC-1]` `F1`~`F7` 已交付浏览器管理面均通过真实操作复验 — Evidence: `docs/acceptance-tests/runs/run-20260406-0134-master-data-f1-f8-browser-verification.md`; `docs/acceptance-tests/cases/master-data.json` 中 `F3-BROWSER-1` / `F5-BROWSER-1` / `F6-BROWSER-1` / `F7-BROWSER-1`，并保留既有 F1/F2/F4 browser baseline — Verdict: `✓ met`
- [x] `[AC-2]` `F8` 代表性消费者浏览器复验通过 — Evidence: `docs/acceptance-tests/runs/run-20260406-0134-master-data-f1-f8-browser-verification.md`; `docs/acceptance-tests/cases/master-data.json` 中 `F8-BROWSER-1`，`/entry/order` 搜索停用车间返回无数据 — Verdict: `✓ met`
- [x] `[AC-3]` 本 turn 新发现的 `F1`~`F8` 缺陷全部修复并完成 rerun — Evidence: 本轮 customer / workshop / stock-scope / personnel / supplier 修复均已复验；`pnpm --dir web build:prod` 通过；`pnpm test -- src/modules/master-data/controllers/master-data.controller.spec.ts src/modules/master-data/application/master-data.service.spec.ts src/modules/master-data/infrastructure/master-data.repository.spec.ts` 通过（3 suites, 80 tests） — Verdict: `✓ met`
- [x] `[AC-4]` pre-dirty 三个基础资料页面既有修改被保留 — Evidence: reviewer 确认 `web/src/views/base/customer/index.vue`、`web/src/views/base/material/index.vue`、`web/src/views/base/personnel/index.vue` 未被误覆盖或回退 — Verdict: `✓ met`
- [x] `[AC-5]` reviewer finding 全部关闭且 review clean — Evidence: reviewer 未保留 actionable finding；当前 diff 仅剩接受证据缺口已补齐 — Verdict: `✓ met`
- [x] `[AC-6]` `spec/cases/run` 更新完整并可支撑 full 结论 — Evidence: `docs/acceptance-tests/specs/master-data.md`、`docs/acceptance-tests/cases/master-data.json`、`docs/acceptance-tests/runs/run-20260406-0134-master-data-f1-f8-browser-verification.md` 已更新并冻结 — Verdict: `✓ met`

### Acceptance Notes

- Acceptance path used: `full`
- Acceptance summary:
  - `F3/F5/F6/F7` 浏览器收口、`F8` 代表性消费者复验、master-data 三层回归与 `web build:prod` 均已通过。
- Report completeness check:
  - `yes`
- If rejected or blocked: root cause（`requirement-misunderstanding` | `implementation-gap` | `evidence-gap` | `environment-gap`）+ 精确修复指引 / 环境修复指引
- If conditionally accepted: follow-up requirement / task:

## Final Status

- Outcome:
  - `accepted`
- Requirement alignment:
  - `F1`~`F8` browser / consumer evidence 已对齐，并与当前 acceptance spec/cases/run 一致
- Residual risks or testing gaps:
  - `browser smoke` 仍不替代既有 unit / service / consumer contract 证据；历史 baseline 继续保留
- Directory disposition after completion: keep `active` while the task is still open; once it is no longer active, set this to `retained-completed` or `cleanup-candidate`, then sync `docs/tasks/TASK_CENTER.md`
- Directory disposition after completion: `retained-completed`
- Next action:
  - `None.`
