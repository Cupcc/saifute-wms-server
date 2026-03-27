# Frontend Home Legacy Chart Restore

## Metadata

- Scope: restore `/index` to a legacy-style chart homepage on top of current NestJS contracts, without reusing the `reporting/home` container, while preserving RD landing and low-permission safe fallback
- Related requirement: `docs/requirements/req-20260326-1900-frontend-old-style-adaptation.md`
- Status: `planned`
- Review status: `not-reviewed`
- Lifecycle disposition: `active`
- Planner: `planner`
- Coder: `coder`
- Reviewer: `code-reviewer`
- Last updated: `2026-03-27`
- Related checklist:
- Related files:
  - `docs/requirements/req-20260326-1900-frontend-old-style-adaptation.md`
  - `docs/tasks/TASK_CENTER.md`
  - `web/src/views/home/index.vue`
  - `web/src/views/index.vue`
  - `web/src/views/reporting/home/index.vue`
  - `web/src/api/system/home.js`
  - `web/src/api/reporting.js`
  - `web/src/views/login.vue`
  - `web/src/store/modules/user.js`

## Requirement Alignment

- Requirement doc: `docs/requirements/req-20260326-1900-frontend-old-style-adaptation.md`
- User intent summary:
  - `/index` 要回到旧项目那种“欢迎语 + 统计卡 + 图表”富首页，而不是继续直接复用 `reporting/home` 容器。
  - `rd-subwarehouse` 用户仍应直达 `/rd/workbench`，不走普通首页。
  - 普通低权限用户访问 `/index` 时必须继续安全降级，不能因为首页图表接口权限不足重新出现 `403` 白屏。
- Acceptance criteria carried into this task:
  - `/index` 的主呈现改为旧风格图表首页；`web/src/views/home/index.vue` 不再直接挂载 `ReportingHomeDashboard` 作为默认富首页。
  - `报表中心 -> 报表首页` 仍保留为独立 `reporting/home` 页面，不因首页回归而被破坏。
  - `rd-operator` 登录与访问 `/index` 时继续直接进入 `/rd/workbench`，不引入 `/index` 标签残留回归。
  - `operator` 这类缺少完整 reporting 权限的账号仍只看到安全降级视图，且首页不发起会触发 `403` 的受限请求。
  - 首页数据继续基于当前 NestJS contract 适配，不隐式依赖旧工程 `/home/statistics*` 后端接口。
- Open questions requiring user confirmation:
  - None.

## Requirement Sync

- Req-facing phase progress: 已新开“首页旧图表回归” active task，准备把 `/index` 从 `reporting/home` 容器切回旧项目图表节奏，并把 RD 直达与低权限降级固化为强约束。
- Req-facing current state: 规划已完成；当前仓库存在未接线的旧首页图表实现 `web/src/views/index.vue`，但后端并不存在旧 `/home/statistics*` 接口，需要在当前 reporting contract 上做前端适配。
- Req-facing blockers: None.
- Req-facing next step: 进入 coder 实施，完成 `/index` 图表首页回归并做 admin/operator/rd 三角色首屏验证。
- Requirement doc sync owner: `parent`

## Goal And Acceptance Criteria

- Goal: 在不回退当前权限、菜单、会话和 RD console 契约的前提下，把 `/index` 恢复为旧项目风格的图表型首页。
- Acceptance criteria:
  - admin 类完整权限账号进入 `/index` 后看到旧风格欢迎区、统计卡与图表区，而不是当前 `reporting/home` 的指标卡 + 表格布局。
  - `reporting/home` 路由仍保持当前报表页角色，不被 `/index` 的实现重新绑死。
  - RD 用户始终直达 `/rd/workbench`，不先落到普通首页，也不残留 `首页` 标签。
  - 普通低权限用户进入 `/index` 时不会触发 `403`、空白页或控制台异常；若缺少完整报表权限，则只显示本地安全降级视图。
  - 前端构建通过，并完成 admin/operator/rd 三类账号首屏冒烟。

## Scope And Ownership

- Allowed code paths:
  - `web/src/views/home/index.vue`
  - `web/src/views/home/**`
  - `web/src/views/index.vue`
  - `web/src/api/system/home.js`
  - `web/src/api/reporting.js`
- Frozen or shared paths:
  - `web/src/store/modules/permission.js`
  - `web/src/views/login.vue`
  - `web/src/layout/components/TagsView/index.vue`
  - `web/src/views/reporting/home/index.vue`
  - `src/modules/reporting/**`
  - `src/modules/rbac/**`
- Task doc owner: `planner`
- Contracts that must not change silently:
  - `/index` route path/name/meta affix semantics stay compatible with the current shell.
  - `consoleMode === "rd-subwarehouse"` still bypasses generic home to `/rd/workbench`.
  - Existing permission strings remain `reporting:home:view`, `reporting:trends:view`, `reporting:material-category-summary:view`; do not invent legacy permission aliases.
  - `reporting/home` stays an explicit report-center route, not the implementation detail of `/index`.
  - No new backend dependency on legacy `/home/statistics*` unless separately approved.

## Implementation Plan

- [ ] Step 1: Inspect `web/src/views/index.vue` and current `web/src/views/home/index.vue`, then choose the smallest refactor that makes `/index` render a dedicated legacy-style chart component instead of `ReportingHomeDashboard`.
- [ ] Step 2: Rebuild the old homepage presentation with Composition API and template refs for ECharts; prefer migrating the existing dead `web/src/views/index.vue` implementation into `web/src/views/home/**` rather than cloning `reporting/home`.
- [ ] Step 3: Replace dead legacy API assumptions. Either map current `getReportingHome()` / `getTrendSeries()` / `getMaterialCategorySummary()` responses into the old card + chart view, or rewrite `web/src/api/system/home.js` as a thin frontend adapter over those endpoints. Do not ship calls to nonexistent `/home/statistics*`.
- [ ] Step 4: Keep `web/src/views/home/index.vue` as the route shell for `consoleMode` redirect and permission gating. Full-permission users render the rich chart homepage; users lacking the full reporting trio render a local safe fallback that performs no protected reporting requests.
- [ ] Step 5: Keep `reporting/home` available as a separate report-center page and avoid new coupling that would make `/index` depend on it again.
- [ ] Step 6: Validate `admin`, `operator`, and `rd-operator` first-screen behavior, then record results in this task and hand requirement sync lines back to parent.

## Coder Handoff

- Execution brief:
  - 让 `/index` 拥有独立的旧风格图表首页实现，而不是继续复用 `reporting/home` 页面容器。
  - 优先做前端适配，把当前 reporting API 映射到旧首页表现层；不要为了旧页面命名去倒推新增后端 legacy 接口。
  - 把 RD 直达和低权限无 `403` 视为硬性回归门，而不是“顺带保持”的软要求。
- Required source docs or files:
  - `docs/requirements/req-20260326-1900-frontend-old-style-adaptation.md`
  - `docs/tasks/archive/retained-completed/task-20260326-1940-frontend-old-style-phase1-shell-integration.md`
  - `web/src/views/home/index.vue`
  - `web/src/views/index.vue`
  - `web/src/views/reporting/home/index.vue`
  - `web/src/api/system/home.js`
  - `web/src/api/reporting.js`
  - `web/src/store/modules/user.js`
- Owned paths:
  - `web/src/views/home/index.vue`
  - `web/src/views/home/**`
  - `web/src/views/index.vue`
  - `web/src/api/system/home.js`
  - `web/src/api/reporting.js`
- Forbidden shared files:
  - `web/src/store/modules/permission.js`
  - `web/src/views/login.vue`
  - `web/src/layout/components/TagsView/index.vue`
  - `web/src/views/reporting/home/index.vue`
  - `src/modules/reporting/**`
  - `src/modules/rbac/**`
- Constraints and non-goals:
  - Do not change menu grouping, login landing rules, or RD-only sidebar behavior unless a regression is directly proven by this slice.
  - Do not repoint `/index` back to `reporting/home`, and do not make `reporting/home` the shared source of truth for the homepage again.
  - Do not add backend legacy endpoints just to satisfy old frontend naming; prefer adapter or mapping logic inside `web/`.
  - Keep `reporting/home` usable as a separate page under `报表中心`.
- Validation command for this scope:
  - `pnpm --dir web build:prod`
  - fresh browser smoke with `admin/admin123`, `operator/operator123`, `rd-operator/rd123456`

## Reviewer Handoff

- Review focus:
  - `/index` 是否真正脱离 `reporting/home` 容器，而不是换皮复用。
  - 是否存在任一低权限路径仍会在首页触发 reporting `403` / blank screen。
  - `rd-subwarehouse` 是否继续直达 `/rd/workbench`，且不残留 `/index` affix/tag。
  - 是否引入了对不存在的 `/home/statistics*` API 的运行时依赖。
  - ECharts / resize / interval 清理是否完整，避免 keep-alive 或重复挂载泄漏。
- Requirement alignment check:
  - 验证实现仍符合“旧壳新核”而非回退旧权限/旧接口；确认 `customer` / RD / monitoring / reporting 现有分域并未受这次首页切片破坏。
- Final validation gate:
  - `pnpm --dir web build:prod`
  - fresh browser smoke for `admin`, `operator`, `rd-operator`
- Required doc updates:
  - 将实际验证结果回填本 task，并给 parent 提供可直接同步到 requirement 的简短进展行。

## Parallelization Safety

- Status: `not safe`
- If safe, list the exact disjoint writable scopes:
- If not safe, list the shared files or contracts that require a single writer:
  - `web/src/views/home/index.vue` 是唯一首页路由壳层，同时承载 RD redirect 与低权限 gating。
  - 图表数据适配方案与 fallback 行为共同决定 `/index` 的单一运行时合约，无法安全拆给多个 writer 并行落地。
  - `login` / `tags` / `permission` 在本 slice 中只应作为回归验证面，不能并行改写。

## Review Log

- Validation results: planning only; not run.
- Findings: None yet.
- Follow-up action: hand off to `coder` for implementation, then `code-reviewer` for scoped review.

## Final Status

- Outcome: active plan created; execution not started.
- Requirement alignment: aligned with the confirmed requirement and the archived phase1 shell-integration baseline.
- Residual risks or testing gaps:
  - `web/src/views/index.vue` 仍指向不存在的 legacy `/home/statistics*` 接口，若直接启用会在运行时失败。
  - 若 coder 移除或绕过当前首页 permission gate，`operator` 会重新遇到 `403` 与白屏。
  - 若继续使用基于 DOM id 的图表挂载方式，keep-alive/重复进入首页时更容易出现实例泄漏；实现时应优先使用 template refs 与显式清理。
- Directory disposition after completion: keep `active` until coder and reviewer close the slice, then archive and sync `docs/tasks/TASK_CENTER.md`.
- Next action: coder implements the scoped `/index` homepage recovery and records validation evidence.
