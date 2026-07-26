# RD 完善切片（13 个已验证缺口收口）

## Metadata

- Scope:
  - 收口 2026-07 复核确认的 `13` 个已验证缺口（`GAP-1` 主仓→RD 交接 UI … `GAP-14` 文档同步），覆盖 RD 小仓回写退回库存结转、手工状态动作撤销、交接前端创建 / 作废、研发项目交接入 / 在库成本指标、报废 scope 显式化及配套清理。
- Related requirement:
  - `docs/requirements/domain/rd-subwarehouse.md (F2,F3,F4)`
  - `docs/requirements/domain/rd-project-management.md (F5)`
- Status: `in-progress`
- Review status: `in-review`
- Delivery mode: `standard`
- Acceptance mode: `full`
- Acceptance status: `not-assessed`
- Complete test report required: `yes`
- Lifecycle disposition: `active`
- Planner: `parent-orchestrator`
- Coder:
- Reviewer:
- Acceptance QA:
- Last updated: `2026-07-09`
- Related checklist: `-`
- Related acceptance spec:
  - `docs/acceptance-tests/specs/rd-subwarehouse.md`
- Related acceptance run: (optional)
- Related files:
  - `prisma/schema.prisma`
  - `src/modules/rd-subwarehouse/**`
  - `src/modules/rd-project/**`
  - `src/modules/workshop-material/**`
  - `web/src/views/rd/**`
  - `docs/architecture/modules/rd-subwarehouse.md`
  - `docs/requirements/domain/rd-subwarehouse.md`
  - `docs/requirements/domain/rd-project-management.md`

## Requirement Alignment

- Domain capability:
  - `rd-subwarehouse` 的物料状态链（`F4`）必须让 `退回` 具备真实库存结果，而不是只改状态；主仓到 RD 交接（`F2`）需要可用的前端创建 / 作废入口。
  - `rd-project` 的 `F5` 项目台账必须完整回答“交接入项目多少、项目当前在库多少（含成本）”。
- User intent summary:
  - 用户要求把 RD 小仓 / 研发项目链路上经复核确认的残留缺口一次性收口，而不是继续以“已完成”文档掩盖未落地的行为。
- Acceptance criteria carried into this task:
  - 见下方 `[AC-*]`。
- Requirement evidence expectations:
  - focused 自动化验证、typecheck、web build、对抗性 review 结论、live 验证与后续浏览器验收记录。
- Open questions requiring user confirmation:
  - 无。

## Progress Sync

- Phase progress:
  - `verified: 5 条实现轨道 + 对抗性 review 修复 + live 验证 + 浏览器 smoke 全部完成`
- Current state:
  - `2026-07-09` 实现完成，共 5 条轨道：
    1. schema / seed 共享改动（新枚举、权限种子等共享层）。
    2. `rd-subwarehouse`：回写退回（`MANUAL_RETURNED`）同事务库存结转（`RD_SUB` 按 `RD_HANDOFF_IN` 来源层 FIFO 出库 `RD_RETURN_OUT`，保成本回补 `MAIN` 入库 `RD_RETURN_IN`）；新增手工状态动作撤销端点 `POST /rd-subwarehouse/procurement-requests/:id/status-actions/:historyId/reverse`（含退回库存反冲，`MAIN` 回补层被下游占用时拒绝）；handoff 列表按会话库存范围过滤。
    3. `rd-project`：项目详情视图新增按物料的 `handoffInQty` / `handoffInCostAmount`（有效交接行聚合）与在库成本 `onHandCostAmount`（`RD_SUB` 可用来源层 × 单位成本）及汇总合计；补齐守卫与分页；清理死代码。
    4. 前端：『RD 交接结果』页面新增交接创建 / 作废（权限 `rd:handoff-order:create` / `rd:handoff-order:void`）；状态动作撤销入口；项目台账新增交接入 / 在库成本列；RD scope 固定；配套清理。
    5. `workshop-material`：报废 `stockScope` 显式化。
  - 验证现状：`bun run typecheck` clean；`894` 条单元测试通过（含 review 修复新增回归）；`web` 生产构建通过；biome 无新增告警（基线 19 个既有 error 均在未触及模块）。
  - 对抗性 review（5 视角 + 逐条反驳验证）确认 1 blocker + 9 项缺陷并已全部修复，核心为退回结算的来源占用标识需按动作（anchor history id）而非需求行，否则同行二次退回损坏来源层账；同步修复报废项目归属结算、handoff 列表 `lifecycleStatus` 过滤、创建对话框来源搜索参数 AND、视图 off-BOM 物料并入、状态台账乐观并发守卫、在库成本均价外推与批量层查询等。
  - `2026-07-09` live 验证（scratch 库 `saifute_wms_verify`，已销毁）：完整链路 验收入库→需求→手工验收→交接(成本桥 210)→领料→两次部分退回(阻断回归)→撤销退回#2(精确隔离 RD_SUB 3→7 / MAIN 92→88)→重复撤销 / 撤销验收 / 撤销交接均正确拒绝→显式 `RD_SUB` 报废(项目归属落账)→handoff 作废下游占用拒绝 / 干净作废回滚→lifecycle 过滤，全部断言通过。
- Acceptance state:
  - `smoke-accepted`：新增 UI 面已完成浏览器 smoke（交接列表状态列 / 新建交接来源搜索 / 详情成本快照 / 项目台账交接入·在库成本列与汇总卡 / 状态历史撤销按钮与已撤销标记）；正式浏览器验收记录冻结仍待按 `docs/acceptance-tests/specs/rd-subwarehouse.md` 2026-07-09 残余补记补齐。
- Blockers:
  - 无。
- Next step:
  - 用户确认后冻结验收记录；如需，补 F6-BROWSER 可重复脚本化。

## Goal And Acceptance Criteria

- Goal:
  - 把 RD 小仓 / 研发项目链路上经复核确认的 `13` 个缺口（`GAP-1` 主仓→RD 交接 UI … `GAP-14` 文档同步）一次性收口，使文档口径、代码行为与 live 数据一致。
- Acceptance criteria:
  - `[AC-1]` 回写退回（`MANUAL_RETURNED`）在同一事务内完成 `RD_SUB` → `MAIN` 库存结转（`RD_RETURN_OUT` / `RD_RETURN_IN`），成本随来源层保真，回补层可被主仓后续消耗。
  - `[AC-2]` 手工状态动作（`PROCUREMENT_STARTED` / `ACCEPTANCE_CONFIRMED` / `MANUAL_CANCELLED` / `MANUAL_RETURNED`）可撤销；撤销退回含库存反冲，`MAIN` 回补层被下游占用时拒绝。
  - `[AC-3]` 主仓→RD 交接单可在前端『RD 交接结果』页面创建 / 作废，handoff 列表按会话库存范围过滤。
  - `[AC-4]` 研发项目详情按物料暴露交接入项目数量 / 成本与在库成本，并提供汇总合计。
  - `[AC-5]` `workshop-material` 报废的库存范围（`stockScope`）显式化，不再依赖隐式推断。
  - `[AC-6]` 相关 requirements / architecture / acceptance / task / dashboard 文档与实现口径同步（`GAP-14`）。

## Scope And Ownership

- Allowed code paths:
  - `prisma/schema.prisma`（含 seed 共享改动）
  - `src/modules/rd-subwarehouse/**`
  - `src/modules/rd-project/**`
  - `src/modules/workshop-material/**`
  - `web/src/views/rd/**` 及配套前端 API / 权限声明
  - `docs/**`（本切片文档同步）
- Frozen or shared paths:
  - `inventory-core` 唯一库存写入口约束不变；不得旁路记账。
  - `sales-project` / `sales` 在途改动不并入本切片。
- Task doc owner:
  - `parent-orchestrator`
- Contracts that must not change silently:
  - `rd:handoff-order:*` 独立权限点；状态动作撤销必须留审计痕迹；`RD_SUB` 项目强归属（`C10`）不放松。

## Implementation Plan

- [x] Step 1: schema / seed 共享改动（新库存操作类型与权限种子）。
- [x] Step 2: `rd-subwarehouse` 回写退回库存结转 + 状态动作撤销端点 + handoff 会话范围过滤。
- [x] Step 3: `rd-project` 视图指标（交接入 / 在库成本）+ 守卫 + 分页 + 死代码清理。
- [x] Step 4: 前端交接创建 / 作废 UI + 撤销入口 + 台账新列 + RD scope 固定 + 配套清理。
- [x] Step 5: `workshop-material` 报废 `stockScope` 显式化。
- [x] Step 6: 对抗性 review 与 live 验证收口。
- [x] Step 7: 新增 UI 面浏览器 smoke（正式验收记录冻结待用户确认）。

## Coder Handoff

- Execution brief:
  - 实现已完成（见 Progress Sync 5 条轨道）；剩余工作是 review 收口与验收证据补齐。
- Required source docs or files:
  - `docs/requirements/domain/rd-subwarehouse.md`
  - `docs/requirements/domain/rd-project-management.md`
  - `docs/architecture/modules/rd-subwarehouse.md`
- Owned paths:
  - 同 `Allowed code paths`。
- Forbidden shared files:
  - `.env*`；与本切片无关的在途改动。
- Constraints and non-goals:
  - 不扩展通用多仓 / 库位 / 批次；不在本切片完成 `workshopScope` → `stockScope` 全量命名收敛（保留为后续重构）。
- Validation command for this scope:
  - `bun run typecheck`
  - `bun run test`
  - `pnpm --dir web build:prod`
- If parallel work is approved, add one subsection per writer with the same fields:
  - 不适用。

## Reviewer Handoff

- Review focus:
  - 回写退回结转与撤销反冲的事务一致性、来源层占用判断；handoff 会话范围过滤是否可被绕过；项目指标聚合口径与 `F5` 合同一致性。
- Requirement alignment check:
  - 对照 `[AC-1]` ~ `[AC-6]` 与 `rd-subwarehouse (F4)` / `rd-project-management (F5)` 能力合同。
- Final validation gate:
  - typecheck + 全量单测 + web build + 对抗性 review 结论 + live 验证记录。
- Required doc updates:
  - 本 task 的 `Progress Sync` / `Review Log` / `Acceptance`；`docs/acceptance-tests/specs/rd-subwarehouse.md` 浏览器验收补记。

### Acceptance Evidence Package

- Covered criteria:
  - `[AC-1]` ~ `[AC-6]`
- Evidence pointers:
  - typecheck clean、`894` 条单元测试通过、web 生产构建通过；对抗性 review（1 blocker + 9 缺陷确认并修复）；live 验证全链路断言通过（见 Progress Sync 2026-07-09 记录）；新增 UI 面浏览器 smoke 通过。
- Evidence gaps, if any:
  - 正式浏览器验收记录（acceptance run 文档）未冻结，待用户确认后补齐。
- Complete test report requirement: `yes`

### Acceptance Test Expectations

- Acceptance mode: `full`
- User-visible flow affected: `yes`
- Cross-module write path: `yes`
- Irreversible or high-cost business effect: `yes`
- Existing automated user-flow coverage: `no`
- Browser test required: `yes`
- Browser waiver reason:
- Related acceptance cases:
  - `rd-subwarehouse`
- Related acceptance spec:
  - `docs/acceptance-tests/specs/rd-subwarehouse.md`
- Separate acceptance run required: `yes`
- Complete test report required: `yes`
- Required regression / high-risk tags:
  - `rd-subwarehouse`
  - `rd-project`
  - `inventory-core`
- Suggested environment / accounts:
  - 本地 live 环境 + 大仓管理员 / 小仓管理员账号
- Environment owner / setup source:
  - 本地执行人 / `.env.dev` 维护者

## Parallelization Safety

- Status: `not-safe`
- If safe, list the exact disjoint writable scopes:
  - `-`
- If not safe, list the shared files or contracts that require a single writer:
  - `prisma/schema.prisma`、`inventory-core` 记账合同、`rd-subwarehouse` 状态动作合同为同一条共享链路，须单 writer 收口。

## Review Log

- Validation results:
  - `bun run typecheck`（clean）
  - `bun run test`（`894` 条单元测试通过，review 修复后多次全量重跑均绿）
  - `pnpm --dir web build:prod`（通过）
- Findings:
  - 对抗性 review 进行中，结论待回填。
- Follow-up action:
  - review 与 live 验证收口后回填本节，并推进浏览器验收。

## Acceptance

- Acceptance status: `not-assessed`
- Acceptance QA:
- Acceptance date:
- Complete test report:

### Acceptance Checklist

> Acceptance QA 在验收时逐条填写。每条应对应 domain capability 的用户需求或 task doc 的 `[AC-*]` 条目。

- [ ] `[AC-1]` 回写退回同事务库存结转 — Evidence: ... — Verdict: `✓ met` | `✗ not met` | `△ partially met`
- [ ] `[AC-2]` 手工状态动作可撤销且占用时拒绝 — Evidence: ... — Verdict: `✓ met` | `✗ not met` | `△ partially met`
- [ ] `[AC-3]` 交接前端创建 / 作废与会话范围过滤 — Evidence: ... — Verdict: `✓ met` | `✗ not met` | `△ partially met`
- [ ] `[AC-4]` 项目交接入 / 在库成本指标 — Evidence: ... — Verdict: `✓ met` | `✗ not met` | `△ partially met`
- [ ] `[AC-5]` 报废 `stockScope` 显式化 — Evidence: ... — Verdict: `✓ met` | `✗ not met` | `△ partially met`
- [ ] `[AC-6]` 文档口径同步 — Evidence: ... — Verdict: `✓ met` | `✗ not met` | `△ partially met`

### Acceptance Notes

- Acceptance path used: `full`
- Acceptance summary:
- Report completeness check:
- If rejected or blocked: root cause（`requirement-misunderstanding` | `implementation-gap` | `evidence-gap` | `environment-gap`）+ 精确修复指引 / 环境修复指引
- If conditionally accepted: follow-up requirement / task:

## Final Status

- Outcome:
  - `pending`
- Requirement alignment:
  - 让 RD 小仓 / 研发项目文档口径、代码行为与 live 数据在 `13` 个已验证缺口上重新一致。
- Residual risks or testing gaps:
  - 新增 UI 面浏览器验收未完成；`workshopScope` → `stockScope` 命名收敛保留为后续重构。
- Directory disposition after completion: keep `active` while the task is still open; once it is no longer active, set this to `retained-completed` or `cleanup-candidate`, then sync `docs/tasks/TASK_CENTER.md`
- Next action:
  - 完成对抗性 review 与 live 验证，补浏览器验收后收口归档。
