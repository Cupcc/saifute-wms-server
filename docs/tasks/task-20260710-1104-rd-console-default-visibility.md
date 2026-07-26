# RD 工作台 / RD 盘点单在默认控制台的可见性放开

## Metadata

- Scope:
  - 承接 `task-20260709-1700` 遗留观察项：采购人员角色拥有 `rd:workbench:view` / `rd:stocktake-order:*` 权限、后端也已下发对应路由，但前端 `visibleInModes` 把 `RdWorkbench` / `RdStocktakeOrders` 标记为仅 RD 控制台可见，默认控制台用户直接访问得 404。
  - 用户已拍板：**保留权限**，让这两个页面在默认控制台对「有该权限的用户」露出。
  - 本文档只做方案与计划 handoff，不含实现（实现留待在新 dev 库 `saifute-wms-dev` 上执行）。
- Related requirement: `docs/requirements/domain/rd-subwarehouse.md` (RD 控制台协同可见性)
- Status: `completed`
- Review status: `reviewed`
- Delivery mode: `standard`
- Acceptance mode: `light`
- Acceptance status: `accepted`
- Complete test report required: `no`
- Lifecycle disposition: `retained-completed`
- Planner: `parent-orchestrator`
- Coder: `claude-code`
- Reviewer: `claude-code`
- Acceptance QA: `claude-code`
- Last updated: `2026-07-10`
- Related checklist:
- Related acceptance spec:
- Related acceptance run: (optional)
- Related files:
  - `web/src/store/modules/permission.js` (`SUPPORTED_BACKEND_ROUTE_META`, `isRouteVisibleInConsoleMode`)
  - `src/modules/rbac/application/rbac.service.ts` (`filterRoutesByConsoleMode`，上下文，不改)
  - `docs/tasks/task-20260709-1700-rd-procurement-flow-walkthrough-and-fixes.md` (观察项来源)

## Requirement Alignment

- Domain capability:
  - 采购人员是默认控制台角色，需在默认控制台内使用其被授予的 RD 工作台 / RD 盘点单能力。
- User intent summary:
  - 权限授予是有意的，应保留；矛盾出在前端模式闸门把「有权限」的页面藏了，且 `consoleMode` 是账号级固定字段、用户不能自行切换，导致该权限永久不可达（直连 URL 得前端 404）。
- Acceptance criteria carried into this task:
  - `[AC-1]` 默认控制台下，拥有 `rd:workbench:view` 的用户能在菜单看到并打开 RD 工作台，不再 404。
  - `[AC-2]` 默认控制台下，拥有 `rd:stocktake-order:*` 的用户能在菜单看到并打开 RD 盘点单，不再 404。
  - `[AC-3]` 默认控制台下，**没有**上述权限的用户仍看不到这两个页面（可见性仍受权限约束，不是对所有人放开）。
  - `[AC-4]` RD 控制台（`consoleMode = rd-subwarehouse`）用户行为不变。
- Requirement evidence expectations:
  - 采购人员账号在默认控制台的浏览器验收截图 / 录屏（菜单出现 + 页面加载成功）。
  - 一个无 RD 权限的默认控制台账号的负向验证（仍不可见）。
- Open questions requiring user confirmation:
  - 无。方案 A（最小改动）为默认执行路径；方案 B（结构性收敛）为可选后续，须用户单独确认再排期。

## Progress Sync

- Phase progress: 编码、构建、浏览器验收全部完成（2026-07-10）。
- Current state: 方案 A 已落地并通过 `[AC-1..4]` 浏览器验收。
- Acceptance state: `accepted`（light 路径，浏览器实测 3 账号）。
- Blockers: 无。
- Next step: 无（方案 B 结构性收敛留作可选后续）。

## Goal And Acceptance Criteria

- Goal: 让采购人员在默认控制台可达其已授予的 RD 工作台 / RD 盘点单，消除「有权限却 404」的死权限。
- Acceptance criteria: 见 `[AC-1..4]`。

## Scope And Ownership

- Allowed code paths:
  - `web/src/store/modules/permission.js`（仅 `RdWorkbench` / `RdStocktakeOrders` 的 `visibleInModes`）
- Frozen or shared paths:
  - `src/modules/rbac/**`（后端无需改：默认控制台已下发全部有权限路由；页面仍受 `Boolean(backendRoute)` 权限门控）
  - `prisma/schema.prisma`（无 schema 改动）
- Task doc owner: `parent-orchestrator`
- Contracts that must not change silently: 权限模型（RBAC）仍是访问唯一真源；不得借本次改动给无权限用户放开页面。

## Implementation Plan

### 方案 A — 最小改动（本次执行）

- [x] 在 `web/src/store/modules/permission.js` 中，把 `RdWorkbench.visibleInModes` 与 `RdStocktakeOrders.visibleInModes` 从 `[CONSOLE_MODES.RD]` 改为 `[CONSOLE_MODES.DEFAULT, CONSOLE_MODES.RD]`。
  - `RdWorkbench.affixInModes` 保持 `[CONSOLE_MODES.RD]`（仅管标签固定，未动）。
- [x] 前端构建通过（`bun run build:prod`，web workspace 无 `build` 脚本，等价命令）。
- [x] 浏览器验收 `[AC-1..4]`（连本机 91 端口 dev 服务 / `saifute-wms-dev` 库，见 Acceptance Checklist）。

说明：后端 `filterRoutesByConsoleMode`（`rbac.service.ts:267`）在默认模式下本就返回全部有权限路由，故**无需后端改动**；前端渲染仍以 `isRouteVisibleInConsoleMode && Boolean(backendRoute)` 双条件为准，`backendRoute` 由用户权限决定，因此只有「有该权限」的默认控制台用户才会看到——`[AC-3]` 天然成立。

### 方案 B — 结构性收敛（可选后续，须单独确认）

根因是「控制台模式」被当成了第二道访问闸门（前端 `visibleInModes`），与 RBAC 各写各的、手维护必然漂移。彻底解法：让**访问只有一个真源 = RBAC 权限**，控制台模式退化为纯展示（决定落地页 / 菜单分组 / 品牌外观 / 标签固定），不再独立决定页面能否到达。

- [ ] 删除前端 `visibleInModes` 作为访问过滤的职责，前端只渲染后端下发的路由；控制台粗粒度隔离由后端 `filterRoutesByConsoleMode` 单点负责（RD 账号锁死在 RD 组，服务端强制）。
- [ ] 规则约束：不给某角色发它所在控制台永远看不到的权限。

方案 B 是跨前后端的清理，收益是「消除此类漂移 bug 的整个类别」，但不属于本次「保留权限」诉求的必要项，默认不做，待用户确认后另排 task。

## Coder Handoff

- Execution brief: 执行方案 A，两处 `visibleInModes` 加 `CONSOLE_MODES.DEFAULT`。
- Required source docs or files: 本文档 + `web/src/store/modules/permission.js`。
- Owned paths: `web/src/store/modules/permission.js`。
- Forbidden shared files: `src/modules/rbac/**`、`prisma/schema.prisma`。
- Constraints and non-goals: 不改后端；不给无权限用户放开；不做方案 B。
- Validation command for this scope: `bun --cwd web build`（前端构建通过）+ 浏览器验收。

## Reviewer Handoff

- Review focus: 确认改动只放开可见性、不绕过权限门控；`affixInModes` 未被误改；无后端 / schema 连带改动。
- Requirement alignment check: `[AC-1..4]`。
- Final validation gate: `bun --cwd web build` 通过 + 浏览器验收 4 条。
- Required doc updates: 完成后在本文档 `## Acceptance` 记录证据，并同步 `docs/tasks/TASK_CENTER.md` 生命周期。

### Acceptance Evidence Package

- Covered criteria: `[AC-1]` `[AC-2]` `[AC-3]` `[AC-4]`
- Evidence pointers: 2026-07-10 浏览器实测（agent-browser，连本机 `:91` dev 服务 / `saifute-wms-dev` 库），账号矩阵：`procurement`（默认控制台 + RD 权限）、`operator`（默认控制台无 RD 权限）、`rd-operator`（RD 控制台）；截图已随验收过程核对（临时目录，不入库），关键事实同时用 `/api/auth/me` 与 `/api/auth/routes` 接口核验。
- Evidence gaps, if any: 无。
- Complete test report requirement: `no`

### Acceptance Test Expectations

- Acceptance mode: `light`
- User-visible flow affected: `yes`
- Cross-module write path: `no`
- Irreversible or high-cost business effect: `no`
- Existing automated user-flow coverage: `no`
- Browser test required: `yes`
- Browser waiver reason: -
- Related acceptance cases: -
- Related acceptance spec: -
- Separate acceptance run required: `no`
- Complete test report required: `no`
- Required regression / high-risk tags: 前端菜单 / 路由可见性
- Suggested environment / accounts: 采购人员账号（有 RD 权限）+ 一个无 RD 权限的默认控制台账号；连 `saifute-wms-dev`。
- Environment owner / setup source: 本机 `saifute-wms-dev`（本任务前置已建库全量拷贝）。

## Parallelization Safety

- Status: `safe`
- If safe, list the exact disjoint writable scopes: 仅 `web/src/store/modules/permission.js` 单文件单写者。
- If not safe: -

## Review Log

- Validation results: `bun run build:prod`（web workspace）构建通过；diff 仅 `web/src/store/modules/permission.js` 两行 `visibleInModes`，`affixInModes` 未动，无后端 / schema 连带改动；`/api/auth/routes` 核验 `operator` 不下发 `RdWorkbench` / `RdStocktakeOrders`（`Boolean(backendRoute)` 权限门控未被绕过）。
- Findings: 无阻断项。
- Follow-up action: 方案 B 结构性收敛（可选，须用户单独确认再排期）。

## Acceptance

- Acceptance status: `accepted`
- Acceptance QA: `claude-code`
- Acceptance date: `2026-07-10`
- Complete test report: `no`

### Acceptance Checklist

- [x] `[AC-1]` 默认控制台有 `rd:workbench:view` 的用户可见并可打开 RD 工作台 — Evidence: `procurement` 登录默认控制台，「研发协同」菜单出现「RD 工作台」，打开 `/rd/workbench` 正常渲染（页头「研发小仓工作台」+「默认模式」徽标），无 404 — Verdict: `pass`
- [x] `[AC-2]` 默认控制台有 `rd:stocktake-order:*` 的用户可见并可打开 RD 盘点单 — Evidence: `procurement` 菜单出现「RD 盘点单」，打开 `/rd/stocktake-orders` 正常渲染（「研发盘点调整」列表 + 新增按钮），无 404 — Verdict: `pass`
- [x] `[AC-3]` 无该权限的默认控制台用户仍不可见 — Evidence: `operator`（warehouse-manager，无 `rd:workbench:view` / `rd:stocktake-order:*`）「研发协同」菜单仅含 RD 采购需求 / RD 交接结果 / 库存流水；直连 `/rd/workbench` 与 `/rd/stocktake-orders` 均前端 404；`/api/auth/routes` 不含这两条路由 — Verdict: `pass`
- [x] `[AC-4]` RD 控制台用户行为不变 — Evidence: `rd-operator`（`consoleMode=rd-subwarehouse`）登录后仍固定落地 RD 工作台（affix 生效，「研发小仓模式」徽标），菜单仅「研发协同」组且含全部 RD 页，RD 盘点单打开正常 — Verdict: `pass`

### Acceptance Notes

- Acceptance path used: `light`
- Acceptance summary: 三账号浏览器实测全过：有权限的默认控制台用户可达两页、无权限用户维持不可见与 404、RD 控制台行为不变；访问真源仍是 RBAC（前端 `Boolean(backendRoute)` 门控未被绕过）。

## Final Status

- Outcome: 完成。方案 A 两行改动落地，`[AC-1..4]` 浏览器验收全过，「有权限却 404」的死权限已消除。
- Requirement alignment: 保留采购人员 RD 权限并使其在默认控制台可达 — 已达成。
- Residual risks or testing gaps: 方案 A 只解此二页；其余仅 RD 可见的 RD 页（如报废单、库存汇总等）如后续也要放开，按同法处理或走方案 B 统一收敛。
- Directory disposition after completion: `retained-completed`，已同步 `TASK_CENTER.md`。
- Next action: 无（方案 B 待用户单独确认再排期）。
