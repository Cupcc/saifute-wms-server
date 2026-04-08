# Master Data F6 Workshop Runtime Compatibility

## Metadata

- Scope:
  - 修复当前 `.env.dev` 环境下 `Workshop` 运行时模式漂移导致的 `F6` 回归：`/base/workshop` 首屏列表请求 `GET /api/master-data/workshops?limit=30&offset=0` 不能再返回 `500`。
  - 以既有 `F6/F8` 已验收基线与 live `.env.dev` 数据库真相为准，恢复 `Workshop` 运行时兼容，并完成 targeted review + QA 回环。
  - 明确排除其他主数据实体、`F1`~`F5` / `F7` 全量复验、以及任何借机进行的 `master-data` 重构。
- Related requirement: `docs/requirements/domain/master-data-management.md (F6, F8)`
- Status: `in-progress`
- Review status: `pending`
- Delivery mode: `standard`
- Acceptance mode: `light`
- Acceptance status: `pending`
- Complete test report required: `yes`
- Lifecycle disposition: `active`
- Planner: `saifute-planner`
- Coder: `parent orchestrator`
- Reviewer: `saifute-code-reviewer`
- Acceptance QA: `saifute-acceptance-qa`
- Last updated: `2026-04-08 18:49`
- Related checklist: `None`
- Related acceptance spec: `docs/acceptance-tests/specs/master-data.md`
- Related acceptance run: `docs/acceptance-tests/runs/run-20260406-0134-master-data-f1-f8-browser-verification.md`
- Related files:
  - `docs/requirements/domain/master-data-management.md`
  - `docs/architecture/modules/master-data.md`
  - `docs/acceptance-tests/README.md`
  - `docs/acceptance-tests/specs/master-data.md`
  - `docs/acceptance-tests/runs/run-20260406-0134-master-data-f1-f8-browser-verification.md`
  - `docs/tasks/archive/retained-completed/task-20260402-1802-master-data-phase1-completion.md`
  - `docs/tasks/archive/retained-completed/task-20260406-0134-master-data-phase1-browser-verification-fix-loop.md`
  - `src/modules/master-data/**`
  - `prisma/**`
  - `test/**`
  - `web/src/api/base/workshop.js`
  - `web/src/views/base/workshop/index.vue`
  - `web/src/views/entry/order/**`

## Requirement Alignment

- Domain capability:
  - `docs/requirements/domain/master-data-management.md (F6, F8)`
  - `F6` 要求车间 CRUD 与列表查询稳定可用；`F8` 要求消费者读取 active-only 的车间下拉 / 查询结果。
- User intent summary:
  - 用户报告 `/base/workshop` 当前访问即命中服务端 `500`；parent 已定位到根因是 live `.env.dev` 数据库与当前 `Workshop` 源码 / schema 不一致：库里仍保留 `workshopCode`，缺少 `handlerPersonnelId`。
  - `2026-04-08` 当前修复已按 `2026-04-06` 的 accepted baseline 回退运行时契约：后端 / Prisma / 前端重新使用 `workshopCode + workshopName`，去掉导致列表查询崩溃的 `handlerPersonnelId` 假设，并补上最小兼容类型修复以通过 typecheck。
  - 本 task 剩余工作是基于上述真实修复结果做独立 review、实际运行验证与 targeted QA，不扩展成新的主数据专项。
- Acceptance criteria carried into this task:
  - `[AC-1]` 在当前仓库源码与 `.env.dev` 环境下，`GET /api/master-data/workshops?limit=30&offset=0` 返回 `200`，`/base/workshop` 页面可完成首屏加载，不再出现 `500`。
  - `[AC-2]` 修复必须与既有已验收 `F6/F8` 基线及 live DB 真相一致：`Workshop` 恢复 `workshopCode + workshopName` 合同，且不再要求不存在于 `.env.dev` 的 `handlerPersonnelId`。
  - `[AC-3]` `F6` 管理页与一个既有 `F8` 车间消费者路径完成 targeted rerun，结果与 `2026-04-06` 已验收 baseline 一致。
  - `[AC-4]` review 必须对最终差异做独立检查；所有 actionable findings 关闭后，方可更新 acceptance evidence。
- Requirement evidence expectations:
  - focused backend/runtime 证据：能解释并覆盖本次 `Workshop` 列表 `500` 根因的自动化验证或可重复运行证据。
  - browser 证据：`/base/workshop` 首屏恢复正常；`F8` 代表性消费者继续得到 active-only 车间结果。
  - 文档证据：`master-data` spec 保持与既有 `F6/F8` 基线一致；若本次需要冻结新回归修复快照，则新增 targeted run。
- Open questions requiring user confirmation:
  - None. 执行中若发现当前源码 / schema 本身也不一致，再升级给 parent，不自行扩 scope。

## Progress Sync

- Phase progress:
  - `master-data` `Phase 1` 已有 accepted baseline；当前仅 `F6` 在 live `.env.dev` 运行时出现回归。
- Current state:
  - parent 已确认 immediate mismatch：broken source/schema 移除了 `workshopCode`，新增 `handlerPersonnelId`；live `.env.dev` DB 仍停留在 accepted F6 结构，导致 `GET /api/master-data/workshops` 因查询不存在字段 / relation 返回 `500`。
  - 当前代码已恢复 `Workshop` 的 `workshopCode + workshopName` 契约，focused tests、`pnpm typecheck`、`pnpm build`、`pnpm --dir web build:prod` 均已通过；尚待 runtime API 与 browser QA 收口。
- Acceptance state:
  - `pending runtime verification + review + QA`
- Blockers:
  - None at planning time.
- Next step:
  - coder 先确认最小兼容修复路径，再补 focused regression，随后进入 review 与 targeted browser QA。

## Goal And Acceptance Criteria

- Goal:
  - 在不扩写主数据范围的前提下，把 `Workshop` 运行时契约恢复到已验收 `F6/F8` 基线和 live `.env.dev` 数据库真相，关闭 `.env.dev` 中 `F6` 车间管理页与其 `F8` 消费查询的回归，并重新建立可审计的 review / QA 证据。
- Acceptance criteria:
  - `[AC-1]` `.env.dev` 下 `GET /api/master-data/workshops?limit=30&offset=0` 返回 `200`，`/base/workshop` 首屏不再报 `500`。
  - `[AC-2]` 修复后的 `Workshop` 契约与 `2026-04-06` 已验收基线及 live `.env.dev` DB 一致：保留 `workshopCode`、`workshopName`，不再依赖不存在的 `handlerPersonnelId`。
  - `[AC-3]` targeted regression 覆盖本次根因，且 `/base/workshop` 与一个 `F8` 车间消费者页面完成 rerun。
  - `[AC-4]` review clean，acceptance 证据明确引用既有 `F6/F8` baseline 与本次修复结果。

## Scope And Ownership

- Allowed code paths:
  - `src/modules/master-data/**`
  - `test/**` 中与 `Workshop` 列表 / 查询 / runtime compatibility 直接相关的 focused regression
  - `prisma/schema.prisma`、`prisma/migrations/**`、或等价的最小兼容修复资产，但仅限把源码重新对齐到 accepted `Workshop` 合同
  - `web/src/api/base/workshop.js`、`web/src/views/base/workshop/index.vue`，但仅限恢复 accepted `F6` 页面契约
  - `web/src/views/entry/order/**`，但仅限 `F8` targeted rerun 暴露真实 consumer 失配时
  - `src/modules/session/**`、`src/modules/reporting/**` 中与 `workshopCode` 类型兼容直接相关的最小修复
- Frozen or shared paths:
  - `docs/tasks/**` 仅 planner / parent 更新
  - `docs/requirements/**`
  - `docs/architecture/**`
  - `docs/acceptance-tests/**` 仅 acceptance QA 在证据收口阶段更新
  - 其他 `master-data` 实体、无关 `web/src/views/base/**` 页面、以及 `src/shared/**` 默认为冻结
- Task doc owner:
  - `saifute-planner` / parent
- Contracts that must not change silently:
  - `Workshop` 仍是主数据真源，承担归属与成本核算维度，不变成独立库存池。
  - `Workshop` 的 accepted 运行时合同是 `workshopCode + workshopName`；`workshopCode` 既是管理页查询 / 编辑主标识，也是多处旧快照与类型约定的兼容字段。
  - `F6` 继续是车间 CRUD / 列表能力，逻辑停用语义不变。
  - `F8` 继续输出 active-only 车间查询 / 下拉语义。
  - 本 task 不再把 `handlerPersonnelId` 强加为 `Workshop` 当前必备合同。

## Implementation Plan

- [x] Step 1
  - 在 `.env.dev` 环境确认 `Workshop` 列表 `500` 的精确触发点：当前代码假设 `handlerPersonnelId` / relation 存在，但 live DB 只有 `workshopCode` / `workshopName`，导致查询失败。
- [x] Step 2
  - 选择最小兼容修复路径：将源码 / Prisma / 前端恢复到 accepted `Workshop` 契约，而不是推动 live DB 追随错误中的新字段假设。
- [x] Step 3
  - focused regression 与构建校验已通过：`master-data` 相关 tests、`pnpm typecheck`、`pnpm build`、`pnpm --dir web build:prod` 均已完成。
- [ ] Step 4
  - 执行 runtime validation 与 browser rerun：`/base/workshop` 必测；另选一个既有 `F8` 车间消费者路径做 active-only smoke，默认沿用 `run-20260406-0134` 的入口。
- [ ] Step 5
  - reviewer 独立检查最终 diff、契约边界与验证充分性；全部 actionable findings 关闭后再进入 acceptance 收口。

## Coder Handoff

- Execution brief:
  - 这是一个 runtime compatibility fix，不是 `master-data` 设计重开。先解释清楚 drift 点，再做最小修复。
  - 本次实际真源是 `2026-04-06` 已验收 `F6/F8` 基线加 live `.env.dev` DB 真相；不要再把错误中的 `handlerPersonnelId` 设计假设当成当前交付合同。
  - 若需要兼容修复，优先恢复源码 / 前端 / 类型到 accepted `Workshop` 合同，不推动数据库去追随错误契约。
- Required source docs or files:
  - `docs/requirements/domain/master-data-management.md`
  - `docs/architecture/modules/master-data.md`
  - `docs/acceptance-tests/specs/master-data.md`
  - `docs/acceptance-tests/runs/run-20260406-0134-master-data-f1-f8-browser-verification.md`
  - 本 task doc
- Owned paths:
  - `src/modules/master-data/**`
  - `test/**`（仅 focused regression）
  - `prisma/**`（仅最小兼容修复所需）
  - `web/src/api/base/workshop.js`
  - `web/src/views/base/workshop/index.vue`
  - `web/src/views/entry/order/**`（仅必要时）
- Forbidden shared files:
  - `docs/tasks/**`
  - `docs/requirements/**`
  - `docs/architecture/**`
  - `docs/acceptance-tests/**`
  - 无关 `master-data` 页面或实体实现
- Constraints and non-goals:
  - 不扩写到 `F1`~`F5` / `F7` 的额外修复或全量复验。
  - 不把 `.env.dev` 数据问题包装成新的产品需求。
  - 不得重新把 `handlerPersonnelId` 等未上线字段硬推为 `Workshop` 当前契约。
  - `F8` consumer 侧只做最小必要修复，不借机改造页面。
- Validation command for this scope:
  - `pnpm test -- src/modules/master-data/application/master-data.service.spec.ts src/modules/master-data/infrastructure/master-data.repository.spec.ts src/modules/master-data/controllers/master-data.controller.spec.ts`
  - `pnpm typecheck`
  - `pnpm build`
  - `pnpm --dir web build:prod`
  - runtime smoke: `GET /api/master-data/workshops?limit=30&offset=0`
  - browser rerun：`.env.dev`；backend `:8112`；web `:90`

## Reviewer Handoff

- Review focus:
  - 修复是否真正关闭了 `.env.dev` 下的 `Workshop` 列表 `500`，而不是只让某个局部测试通过。
  - 是否把 `Workshop` 恢复到已验收 `F6/F8` 合同，并彻底去除了会访问不存在 `handlerPersonnelId` 的路径。
  - 若触达 `prisma/**` 或兼容类型，检查变更是否严格限定在 `Workshop` 运行时兼容范围。
  - targeted validation 与 browser evidence 是否足以支撑 `F6/F8` 回归已关闭。
- Requirement alignment check:
  - 对照 `docs/requirements/domain/master-data-management.md (F6, F8)`，确认车间 CRUD、active-only 查询与“车间非独立库存池”语义未漂移。
- Final validation gate:
  - focused `master-data` tests
  - `pnpm --dir web build:prod`
  - targeted browser rerun for `F6` + one `F8` workshop consumer
- Required doc updates:
  - reviewer 不改 `docs/tasks/**`
  - 如 evidence 不足，明确指出 acceptance QA 需要补的 `spec` / `run` 项

### Acceptance Evidence Package

- Covered criteria:
  - `[AC-1]` `F6` 列表 / 页面恢复
  - `[AC-2]` accepted `Workshop` 契约恢复
  - `[AC-3]` focused regression + `F6/F8` rerun
  - `[AC-4]` review clean + targeted acceptance evidence
- Evidence pointers:
  - `docs/acceptance-tests/specs/master-data.md`
  - 需要时新增的 targeted `docs/acceptance-tests/runs/run-YYYYMMDD-HHMM-master-data-f6-workshop-runtime-compatibility.md`
  - `docs/acceptance-tests/runs/run-20260406-0134-master-data-f1-f8-browser-verification.md`
  - `src/modules/master-data/**`
  - `prisma/**`
  - `test/**`
- Evidence gaps, if any:
  - Planning time none.
- Complete test report requirement: `yes`

### Acceptance Test Expectations

- Acceptance mode: `light`
- User-visible flow affected: `yes`
- Cross-module write path: `no`
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
  - `master-data-f6`
  - `master-data-f8`
  - `workshop-runtime-compat`
  - `browser-targeted`
- Suggested environment / accounts:
  - `.env.dev`
  - backend `http://127.0.0.1:8112`
  - web `http://localhost:90`
  - `admin / admin123` 或等价具备 `master:*` 权限的账号
- Environment owner / setup source:
  - 当前仓库本地标准开发环境；按 `docs/acceptance-tests/README.md` 与既有 `2026-04-06` baseline 环境执行

## Parallelization Safety

- Status: `not safe`
- If safe, list the exact disjoint writable scopes:
  - None.
- If not safe, list the shared files or contracts that require a single writer:
  - `src/modules/master-data/**`、`prisma/**`、targeted `test/**`、以及 `Workshop` 当前契约彼此强耦合；此修复以单 writer 顺序执行更安全。

## Review Log

- Validation results:
  - Pending.
- Findings:
  - Pending.
- Follow-up action:
  - Pending.

## Acceptance

- Acceptance status: `not-assessed`
- Acceptance QA:
- Acceptance date:
- Complete test report:

### Acceptance Checklist

> Acceptance QA 在验收时逐条填写。每条应对应 domain capability 的用户需求或 task doc 的 `[AC-*]` 条目。

- [ ] `[AC-1]` `.env.dev` 下 `GET /api/master-data/workshops?limit=30&offset=0` 返回 `200`，且 `/base/workshop` 首屏恢复 — Evidence: ... — Verdict: `✓ met` | `✗ not met` | `△ partially met`
- [ ] `[AC-2]` 修复保持当前 `Workshop` 契约，未回滚为旧字段 requirement — Evidence: ... — Verdict: `✓ met` | `✗ not met` | `△ partially met`
- [ ] `[AC-2]` 修复后的 `Workshop` 契约与 accepted `F6/F8` 基线及 live DB 一致：保留 `workshopCode`，不再依赖 `handlerPersonnelId` — Evidence: ... — Verdict: `✓ met` | `✗ not met` | `△ partially met`
- [ ] `[AC-3]` focused regression 与 `F6/F8` targeted rerun 均通过 — Evidence: ... — Verdict: `✓ met` | `✗ not met` | `△ partially met`
- [ ] `[AC-4]` review clean，acceptance evidence 与既有 baseline 对齐 — Evidence: ... — Verdict: `✓ met` | `✗ not met` | `△ partially met`

### Acceptance Notes

- Acceptance path used: `light`
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
