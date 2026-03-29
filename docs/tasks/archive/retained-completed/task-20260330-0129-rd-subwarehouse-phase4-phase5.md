# RD 小仓 Phase 4/5 状态链与盘点调整

## Metadata

- Scope: 在“主仓 + RD 小仓受限协同”边界内，连续完成 `F4` RD 物料独立状态链与 `F5` RD 小仓盘点 / 库存调整，不在中间 slice 停下
- Related requirement: `docs/requirements/archive/retained-completed/req-20260330-0127-rd-subwarehouse-phase4-phase5.md`
- Status: `completed`
- Review status: `reviewed-no-findings`
- Lifecycle disposition: `retained-completed`
- Planner: `planner`
- Coder: `coder`
- Reviewer: `code-reviewer`
- Last updated: `2026-03-30`
- Related checklist: `None`
- Related files: `docs/requirements/archive/retained-completed/req-20260330-0127-rd-subwarehouse-phase4-phase5.md`, `docs/requirements/topics/rd-subwarehouse.md`, `docs/architecture/00-architecture-overview.md`, `docs/architecture/20-wms-business-flow-and-optimized-schema.md`, `docs/architecture/modules/rd-subwarehouse.md`, `prisma/schema.prisma`, `src/modules/rd-subwarehouse/**`, `src/modules/inbound/application/inbound.service.ts`, `src/modules/workshop-material/application/workshop-material.service.ts`, `src/modules/inventory-core/**`, `src/modules/reporting/**`, `src/modules/rbac/infrastructure/in-memory-rbac.repository.ts`, `web/src/store/modules/permission.js`, `web/src/api/rd-subwarehouse.js`, `web/src/views/rd/**`, `web/src/views/entry/order/index.vue`

## Requirement Alignment

- Requirement doc: `docs/requirements/archive/retained-completed/req-20260330-0127-rd-subwarehouse-phase4-phase5.md`
- User intent summary:
  - 在当前 `主仓 + RD 小仓受限协同` 架构内连续完成 `F4` 和 `F5`，不扩成通用多仓 / 通用库存平台。
  - 库存写入继续统一走 `inventory-core`，查询继续复用 `reporting` 与 `inventory` 读面。
  - 本次是完整交付链路，不以“先做完状态链”或“先做完盘点页”作为停点。
- Acceptance criteria carried into this task:
  - `F4` 状态链必须覆盖 `待采购 / 采购中 / 取消 / 验收 / 领取 / 报废 / 退回`，且语义独立于单据审核状态。
  - 当前 active truth 已冻结为：`验收 = 主仓验收完成`，`领取 = 主仓到 RD 交接完成`；归档文档中的 `到货 -> 验收 -> 领取` 仅作 provenance，不再作为实现口径。
  - `F4` 必须是 quantity-aware 的状态真源，不能把 partial acceptance / handoff / scrap 压扁成整张单据或整条采购明细的单一状态字段。
  - `F5` 必须提供 RD 小仓可执行的盘点 / 调整闭环：账面数、实盘数、差异、原因、操作人、前后库存、逆操作与追溯全部可落地。
  - `F4` 与 `F5` 必须在同一 task 内连续完成并统一验证。
- Open questions requiring user confirmation:
  - `None`

## Requirement Sync

- Req-facing phase progress: `F4 + F5` closing review 已完成，进入最终收口 / 提交阶段。
- Req-facing current state: 上一轮 `F5` 重复物料错账与 `MANUAL_RETURNED` 越权问题均已修复并复审通过；当前代码、focused tests、全量测试、web build 与 browser smoke 均满足本次风险面。
- Req-facing blockers: `None`
- Req-facing next step: `parent` 回写 requirement 四行并完成最终提交收口，随后归档对应 task / requirement 记录。
- Requirement doc sync owner: `parent`

## Goal And Acceptance Criteria

- Goal: 在不扩大为通用多仓 / 通用库存框架的前提下，为 `RD procurement -> main acceptance -> RD handoff -> RD scrap / return` 这条链建立 quantity-aware 独立状态真源，并补齐 RD 小仓盘点 / 库存调整闭环。
- Acceptance criteria:
  - [ ] `rd-subwarehouse` 或等价 RD 真源能按数量跟踪每条 RD 采购明细的当前业务状态与历史，不与单据审核状态混用。
  - [ ] `待采购` 在 RD procurement create 后生成；`采购中` / `取消` / `退回` 通过受限显式动作或真实 downstream fact 推进；`验收` / `领取` / `报废` 由真实业务事实推进并支持 reverse / void rollback。
  - [ ] 主仓验收仍先入 `MAIN`；`RD handoff` 仍保持 `main - / rd +` 且是唯一真实交接库存事实；验收时不得直接写 RD 库存。
  - [ ] RD 小仓有可用的盘点 / 调整单据入口，记录账面数、实盘数、差异、原因、操作人、前后库存，并通过 `inventory-core` 落日志与逆操作。
  - [ ] RD `小仓库存`、`库存流水`、`分类分布`、`本仓报废` 查询在 `workshopScope` 约束下继续可用，并能看到调整后的库存结果与新操作类型。
  - [ ] 交付不以 `F4` 或 `F5` 任一半程完成为结束条件；只有两者同时完成并通过验证后才允许进入最终 review。

## Scope And Ownership

- Allowed code paths:
  - `prisma/schema.prisma`
  - `src/generated/prisma/**`
  - `src/modules/rd-subwarehouse/**`
  - `src/modules/inbound/application/inbound.service.ts`
  - `src/modules/inbound/application/inbound.service.spec.ts`
  - `src/modules/workshop-material/application/workshop-material.service.ts`
  - `src/modules/workshop-material/**/*.dto.ts`
  - `src/modules/workshop-material/application/workshop-material.service.spec.ts`
  - `src/modules/inventory-core/**`
  - `src/modules/reporting/**`
  - `src/modules/rbac/infrastructure/in-memory-rbac.repository.ts`
  - `src/swagger-metadata.ts`
  - `web/src/api/rd-subwarehouse.js`
  - `web/src/api/reporting.js`
  - `web/src/api/stock/compat.js`
  - `web/src/store/modules/permission.js`
  - `web/src/views/rd/**`
  - `web/src/views/entry/order/index.vue`
  - `web/src/views/reporting/{inventory-summary,material-category-summary}/index.vue`
- Frozen or shared paths:
  - `docs/requirements/**`, `docs/architecture/**`, active `docs/tasks/*.md`（本 task 由 planner / reviewer 维护）
  - `src/main.ts`, `src/shared/**`, `package.json`, `.cursor/**` unless parent explicitly re-opens ownership
  - 与 `RD F4/F5` 无关的 generic main-warehouse routes / pages
- Task doc owner: `planner` 创建并维护 planning truth；`coder` 只读此文档，不回写 board；`code-reviewer` 只更新 review / final status
- Contracts that must not change silently:
  - `inventory-core` 仍是唯一库存写入口
  - `workflow` 不拥有 RD material-state semantics
  - `reporting` 只做只读聚合
  - `WorkshopScopeService` / session `workshopScope` 仍是 RD 车间范围真源
  - `rd procurement` 仍是项目 / 项目式归集绑定，不演进成通用采购单体系
  - 当前 active truth uses `验收 = 主仓验收完成`, `领取 = 主仓到 RD 交接完成`；归档 `到货 -> 验收 -> 领取` 口径不得回流

## Implementation Plan

- [ ] Step 1. 固定 `F4` 状态口径与数据粒度：以 RD procurement line 为 upstream anchor，设计 quantity-aware 的 status ledger / history / projection，禁止把 `F4` 简化成 `RdProcurementRequest` 或整行单一状态字段。
- [ ] Step 2. 扩展 Prisma 与 generated client：补 RD material status truth 所需表 / 枚举 / 关系；为 `F5` 增加 RD 盘点调整单据及新 `InventoryOperationType`；保持所有库存变动仍由 `inventory-core` 记账。
- [ ] Step 3. 实现 `F4` upstream / explicit actions：RD procurement create -> `待采购`；新增受限 action 推进 `采购中`；void / cancel -> `取消`；为缺少真实上游单据的 `退回` 设计窄化显式回写面，必须带 reference / reason 且不越权写库存。
- [ ] Step 4. 实现 `F4` downstream fact hooks：`inbound` 验收联动推进 `验收`；`rd handoff` 通过显式 upstream link / quantity guard 推进 `领取`；`workshop-material` RD scrap 推进 `报废` 并支持 void rollback；所有 rollback 都必须同步回滚库存与 status quantities。
- [ ] Step 5. 实现 `F5` RD 盘点 / 库存调整：在 `rd-subwarehouse` 内新增 RD-scoped stocktake / adjustment controller / service / repository / DTO，支持 create / list / detail / void；提交时记录账面数、实盘数、差异、原因，并调用 `inventory-core.increaseStock()` / `decreaseStock()`；作废时走 `reverseStock()`.
- [ ] Step 6. 补 RBAC / route / frontend：为 `F4` status actions 与 `F5` stocktake page 定义独立权限点；更新 `in-memory-rbac`、`permission.js`、`web/src/api/rd-subwarehouse.js`、RD 相关页面；`F4` 优先复用现有 `rd/procurement-requests` 页面呈现状态链与历史，`F5` 新增 RD 盘点调整页及必要入口，不在 `F4` 完成后停下。
- [ ] Step 7. 保障读面与追溯：确认 `reporting` 与 `inventory` 读接口在 `workshopScope` 下能反映调整后的余额与新操作类型；只在确有展示缺口时窄化改动 `reporting` / compat 映射，不重做报表框架。
- [ ] Step 8. 增加 focused tests + final gate：覆盖 create / update / void / reverse、partial acceptance / handoff / scrap、quantity overflow guards、`workshopScope` guards、`F5` adjust reversal；`F4` / `F5` 全部完成后再跑 full test / build / review。

## Coder Handoff

- Execution brief:
  - 以一个连续 implementation bundle 完成 `F4 + F5`。先落 quantity-aware status truth，再把 acceptance / handoff / scrap hooks 接上，随后补 `F5` adjustment doc 和前端入口，最后统一验证。不要做“先把状态列显示出来”或“先做只读 adjustment list”这种半成品停点。
- Required source docs or files:
  - `docs/requirements/archive/retained-completed/req-20260330-0127-rd-subwarehouse-phase4-phase5.md`
  - `docs/requirements/topics/rd-subwarehouse.md`
  - `docs/architecture/00-architecture-overview.md`
  - `docs/architecture/20-wms-business-flow-and-optimized-schema.md`
  - `docs/architecture/modules/rd-subwarehouse.md`
  - `docs/tasks/archive/retained-completed/task-20260328-1640-rd-subwarehouse-main-to-rd-handoff-foundation.md`
  - `docs/tasks/archive/retained-completed/task-20260328-1831-rd-procurement-main-acceptance-linkage.md`
  - `src/modules/rd-subwarehouse/**`
  - `src/modules/inbound/application/inbound.service.ts`
  - `src/modules/rd-subwarehouse/application/rd-handoff.service.ts`
  - `src/modules/workshop-material/application/workshop-material.service.ts`
  - `src/modules/inventory-core/application/inventory.service.ts`
  - `src/modules/reporting/{application,infrastructure,controllers}/**`
  - `src/modules/rbac/application/workshop-scope.service.ts`
  - `web/src/store/modules/permission.js`
  - `web/src/api/rd-subwarehouse.js`
  - `web/src/views/rd/procurement-requests/index.vue`
  - `web/src/views/rd/inventory-logs/index.vue`
  - `web/src/views/reporting/{inventory-summary,material-category-summary}/index.vue`
- Owned paths:
  - `prisma/schema.prisma`
  - `src/generated/prisma/**`
  - `src/modules/rd-subwarehouse/**`
  - `src/modules/inbound/application/inbound.service.ts`
  - `src/modules/inbound/application/inbound.service.spec.ts`
  - `src/modules/workshop-material/application/workshop-material.service.ts`
  - `src/modules/workshop-material/dto/**`
  - `src/modules/workshop-material/application/workshop-material.service.spec.ts`
  - `src/modules/inventory-core/**`
  - `src/modules/reporting/**`
  - `src/modules/rbac/infrastructure/in-memory-rbac.repository.ts`
  - `src/swagger-metadata.ts`
  - `web/src/api/{rd-subwarehouse,reporting}.js`
  - `web/src/api/stock/compat.js`
  - `web/src/store/modules/permission.js`
  - `web/src/views/rd/**`
  - `web/src/views/entry/order/index.vue`
  - `web/src/views/reporting/**`
- Forbidden shared files:
  - active `docs/tasks/*.md` including this file and `docs/tasks/TASK_CENTER.md`
  - `docs/requirements/**`
  - `docs/architecture/**`
  - `src/main.ts`
  - `src/shared/**` unless existing `inventory-core` / module APIs demonstrably cannot satisfy scope
  - `package.json` / new dependencies unless unavoidable and explicitly justified
  - any generic multi-warehouse / company-level return framework files beyond the narrow `F4/F5` contract
- Constraints and non-goals:
  - do not expand into open multi-warehouse, batch management, or generic stocktake platform
  - do not let acceptance write RD stock directly
  - do not reinterpret `workflow` / audit status as RD material status
  - do not revive archived `到货 -> 验收 -> 领取` wording; active truth is `验收 -> 领取`
  - if `退回` lacks a truthful company-level document in current code, keep it as a narrow status action with mandatory reference fields rather than inventing a new broad return subsystem
  - `F5` adjustment is an inventory correction fact, not an `F4` lifecycle transition
- Validation command for this scope:
  - Iteration:
    - `pnpm prisma:generate`
    - `pnpm prisma:validate`
    - `pnpm swagger:metadata`
    - `pnpm typecheck`
    - `pnpm test -- src/modules/rd-subwarehouse src/modules/inbound/application/inbound.service.spec.ts src/modules/workshop-material/application/workshop-material.service.spec.ts src/modules/inventory-core/application/inventory.service.spec.ts src/modules/reporting/application/reporting.service.spec.ts`
    - `pnpm --dir web build:prod`
  - Final gate:
    - `pnpm prisma:generate && pnpm prisma:validate`
    - `pnpm swagger:metadata && pnpm typecheck`
    - `pnpm test`
    - `pnpm --dir web build:prod`
    - browser smoke on RD and main touchpoints: `admin` / `rd-operator` for `rd/procurement-requests`, new `F5` page, `rd/inventory-summary`, `rd/inventory-logs`, and main `entry/order` linkage / status display
- If parallel work is approved, add one subsection per writer with the same fields:
  - `not approved in this task`

## Reviewer Handoff

- Review focus:
  - `F4` 是否 quantity-aware 而非单字段假状态
  - `验收` / `领取` 口径是否严格对齐 active truth
  - acceptance / handoff / scrap / adjustment 的 rollback 是否同时回滚库存与 status quantities
  - `inventory-core` 是否仍为唯一库存写入口
  - `WorkshopScopeService` / permission / route visibility 是否仍只允许本 RD 仓操作
  - `F5` 是否是 RD-scoped correction doc 而非 generic stock maintenance hack
- Requirement alignment check:
  - 确认本次交付同时完成 `F4 + F5`；没有把 task 停在“只有状态链”或“只有盘点单壳子”
  - 确认没有把 `project` 误当作当前 active truth 的 `领取` 触发器
  - 确认没有把 `退回` 扩展成新的公司级退货系统
- Final validation gate:
  - `pnpm test`
  - `pnpm --dir web build:prod`
  - focused browser smoke on RD status chain + RD stocktake / adjustment + main acceptance linkage
- Required doc updates:
  - 仅 `code-reviewer` 回写本 task 的 `Review status` / `Review Log` / `Final Status`
  - requirement 四行同步由 `parent` 按本 task 的 sync lines 回写

## Parallelization Safety

- Status: `not safe`
- If safe, list the exact disjoint writable scopes:
  - `N/A`
- If not safe, list the shared files or contracts that require a single writer:
  - `prisma/schema.prisma` 同时承载 `F4` 与 `F5` 的 schema / enum / relation
  - `src/modules/rd-subwarehouse/**` 既承载 `F4` status truth 也承载 `F5` adjustment doc
  - `src/modules/inbound/application/inbound.service.ts`, `src/modules/workshop-material/application/workshop-material.service.ts`, `src/modules/inventory-core/**` 会同时参与 status / adjustment side effects
  - `src/modules/rbac/infrastructure/in-memory-rbac.repository.ts`, `web/src/store/modules/permission.js`, `web/src/api/rd-subwarehouse.js`, `web/src/views/rd/**` 是共同的 route / permission / UI 真源
  - `F4/F5` 之间共享 `验收 -> 领取` 语义、`workshopScope` 约束和 inventory log / reporting read surface；拆 writers 容易造成 contract drift 与中途半成品

## Review Log

- Validation results:
  - Re-read the scoped truth and review baseline from `docs/requirements/archive/retained-completed/req-20260330-0127-rd-subwarehouse-phase4-phase5.md`, `docs/requirements/topics/rd-subwarehouse.md`, `docs/architecture/00-architecture-overview.md`, `docs/architecture/20-wms-business-flow-and-optimized-schema.md`, `docs/architecture/modules/rd-subwarehouse.md`, and the NestJS review guidance skill.
  - Re-reviewed the current `F4/F5` code surfaces directly, with special focus on the prior findings and the new focused-validation files: `prisma/schema.prisma`, `src/modules/rd-subwarehouse/**`, `src/modules/rbac/infrastructure/in-memory-rbac.repository.ts`, `web/src/api/rd-subwarehouse.js`, `web/src/store/modules/permission.js`, `web/src/views/rd/procurement-requests/index.vue`, and `web/src/views/rd/stocktake-orders/index.vue`.
  - Re-read the new focused specs: `src/modules/rd-subwarehouse/application/rd-stocktake-order.service.spec.ts`, `src/modules/rd-subwarehouse/application/rd-material-status.helper.spec.ts`, `src/modules/rd-subwarehouse/controllers/rd-procurement-request.controller.spec.ts`, and `src/modules/rd-subwarehouse/controllers/rd-stocktake-order.controller.spec.ts`.
  - Parent reported `pnpm prisma:generate && pnpm swagger:metadata && pnpm typecheck` passed on the current workspace; reviewer additionally ran `pnpm prisma:validate`, which passed.
  - Parent reported `pnpm test -- --runTestsByPath src/modules/rd-subwarehouse/application/rd-stocktake-order.service.spec.ts src/modules/rd-subwarehouse/application/rd-material-status.helper.spec.ts src/modules/rd-subwarehouse/controllers/rd-procurement-request.controller.spec.ts src/modules/rd-subwarehouse/controllers/rd-stocktake-order.controller.spec.ts` passed with `14` tests.
  - Parent reported `pnpm --dir web build:prod` passed and final `pnpm test` passed with `49 suites / 467 tests`.
  - Parent reported focused browser smoke using local minimal dev-DB fixtures: `rd-operator` can see procurement and stocktake smoke records, can use `采购中` / `取消` but not `退回`, duplicate-material creation is front-end blocked, `admin` can see the `退回` action state and main `entry/order` RD procurement selector opens without obvious errors.
- Findings:
  - none; closing rereview confirms the prior `[blocking]` duplicate-material stocktake risk and `[important]` `MANUAL_RETURNED` permission drift are resolved in the current workspace, and no new open `[blocking]` or `[important]` findings were found in the scoped `RD F4/F5` surface.
- Follow-up action:
  - none for this scoped closing rereview; parent can proceed to final closeout / submit flow for this task bundle.

## Final Status

- Outcome: `retained-completed - F4/F5 delivered, validated, reviewed-no-findings`
- Requirement alignment: 本 task 当前实现满足 `F4 + F5` closing review 口径：`F4` 仍是以 procurement line 为锚点的 quantity-aware ledger / history，`验收 = 主仓验收完成`、`领取 = 主仓到 RD 交接完成` 未被破坏；`F5` 仍只通过 `inventory-core` 写库存，重复物料错账风险已在 schema / dto / service / frontend 四层收紧；`MANUAL_RETURNED` 也已收紧为独立动作权限，不再暴露给 RD 日常账号。
- Residual risks or testing gaps: no open material gap for submit in this scoped task. Browser smoke 使用的是本地临时最小 fixture，而不是仓库内固定 seed；这对本次 closing review 足够，但若后续继续扩展 RD 流程，仍可考虑把 fixture / smoke 自动化脚本化。
- Directory disposition after completion: archived to `docs/tasks/archive/retained-completed/task-20260330-0129-rd-subwarehouse-phase4-phase5.md`, paired with archived requirement and board sync.
- Next action: `None`
