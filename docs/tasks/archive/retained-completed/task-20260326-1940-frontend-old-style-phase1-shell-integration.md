# Frontend Old Style Phase 1 Shell Integration

## Metadata

- Scope: deliver phase 1 of `frontend-old-style-adaptation` by restoring the legacy-style login/layout/home/menu shell on top of current NestJS contracts, then run fresh frontend/backend integration debugging for the first-screen paths
- Related requirement: `docs/requirements/req-20260326-1900-frontend-old-style-adaptation.md`
- Status: `completed`
- Review status: `reviewed-clean`
- Lifecycle disposition: `retained-completed`
- Planner: `planner`
- Coder: `parent`
- Reviewer: `code-reviewer`
- Last updated: `2026-03-26`
- Related checklist:
- Related files:
  - `docs/requirements/req-20260326-1900-frontend-old-style-adaptation.md`
  - `docs/tasks/TASK_CENTER.md`
  - `web/src/views/login.vue`
  - `web/src/views/home/index.vue`
  - `web/src/store/modules/permission.js`
  - `web/src/store/modules/user.js`
  - `web/src/layout/components/TagsView/index.vue`
  - `web/src/components/AiAssistant/index.vue`
  - `web/src/api/ai/chat.js`
  - `src/modules/rbac/infrastructure/in-memory-rbac.repository.ts`
  - `src/modules/rbac/application/rbac.service.spec.ts`

## Requirement Alignment

- Requirement doc: `docs/requirements/req-20260326-1900-frontend-old-style-adaptation.md`
- User intent summary:
  - 第一阶段先把登录页、首页、一级菜单分组、RD 专属首页与标签页行为收口到“旧壳新核”口径。
  - 保留当前 NestJS 权限、菜单、会话和 RD / workshop scope 契约，只做前端适配与最少量 blocker-driven 后端兼容。
  - `customer` 保留为“销售管理”一级组；泛化 `领料管理` 不再对外暴露，改为“生产车间”与“研发协同 / 研发小仓”双视角。
- Acceptance criteria result:
  - 已达成：默认用户可进入 `/index`，不再显示“首页工作台 + 快捷入口卡片”。
  - 已达成：RD 用户直接落到 `/rd/workbench`，且不再残留 `/index` 标签。
  - 已达成：一级菜单按 `基础数据 / 入库管理 / 销售管理 / 生产车间 / 库存管理 / 研发协同 / 系统监控 / 报表中心` 收口；RD console 仅显示 `研发小仓` 组。
  - 已达成：fresh browser smoke 通过 admin、operator、rd-operator 三类用户的首屏与关键高频入口验证。

## What Changed

- Frontend shell and grouping:
  - 在 `web/src/store/modules/permission.js` 重建前端一级分组映射，把 `customer` 固化为“销售管理”，把 `take` + `stock` 的报废页重组为“生产车间”，并把 RD 分成默认用户可见的“研发协同”与 RD console 专属“研发小仓”。
  - 保留现有后端 route names 与 permission strings，不回退旧权限逻辑，只在前端 meta/title/group 层做适配。
- Home and landing behavior:
  - `web/src/views/home/index.vue` 改为默认 dashboard 容器；对缺少完整 reporting 权限的普通账号降级为基础概览，避免 `/index` 触发 403。
  - `web/src/views/login.vue` 在登录成功后先拉取 `getInfo()`，再按 `consoleMode` 决定落地页；对 RD 用户优先进入 `/rd/workbench`，不再先经过 `/index`。
- Tags and navigation cleanup:
  - `web/src/layout/components/TagsView/index.vue` 对 RD console 排除 `/index` affix/home tag，并保留 `Index` 的 close-all fallback 兼容。
  - `web/src/store/modules/user.js` 在退出登录时重置 tags store，减少跨会话标签污染。
- Supporting compatibility:
  - `web/src/components/AiAssistant/index.vue` 与 `web/src/api/ai/chat.js` 同步新业务分组文案，避免 AI 上下文仍使用“领料管理”旧口径。
  - `src/modules/rbac/infrastructure/in-memory-rbac.repository.ts` 为内置 `rd-operator` 直接补齐有效 `workshopId=6`，让 RD smoke 使用的内置账号能够命中固定仓别，不再因解析失败导致 `400 当前用户绑定的研发小仓不存在`。
  - `src/modules/rbac/application/rbac.service.spec.ts` 同步更新内置 RD 账号快照断言。

## Validation Evidence

- Dev server smoke:
  - backend: `SCHEDULER_ENABLED=false PORT=8112 pnpm dev`
  - frontend: existing Vite dev server on `http://127.0.0.1:90`
- Browser smoke:
  - `admin/admin123`:
    - 默认进入 `/index`
    - 一级菜单顺序为 `基础数据 -> 入库管理 -> 销售管理 -> 生产车间 -> 库存管理 -> 研发协同 -> 系统监控 -> 报表中心`
    - `生产车间` 下可见并打开 `生产报废单`
    - `customer/order`、`entry/intoOrder`、`stock/scrapOrder` 可达
  - `operator/operator123`:
    - 默认进入 `/index`
    - 首页显示基础概览，不触发 reporting 403，不白屏
    - 侧边菜单只显示其权限内入口
  - `rd-operator/rd123456`:
    - 默认直接进入 `/rd/workbench`
    - 侧边栏仅显示 `研发小仓`
    - 标签栏只保留 `研发工作台` 与后续 RD 页签，不再残留 `首页`
    - `小仓库存`、`项目领用`、`本仓报废` 正常加载
- Command validation:
  - `pnpm swagger:metadata && pnpm typecheck` -> passed
  - `pnpm test -- --runTestsByPath src/modules/rbac/application/rbac.service.spec.ts src/modules/rbac/application/workshop-scope.service.spec.ts` -> passed
  - `pnpm --dir web build:prod` -> passed
- Additional expanded test note:
  - `pnpm test -- --runTestsByPath src/modules/rbac/application/rbac.service.spec.ts src/modules/rbac/application/workshop-scope.service.spec.ts src/modules/reporting/application/reporting.service.spec.ts src/modules/audit-log/application/auth-audit.listener.spec.ts`
  - 结果：前三个相关 suite 通过，`src/modules/audit-log/application/auth-audit.listener.spec.ts` 失败于登录审计 listener 断言；本轮未改动 audit listener / auth-audit 逻辑，故作为仓库现存独立失败保留在 residual risk 中，未纳入本切片修复范围。

## Review Log

- Independent review:
  - `code-reviewer` 复审结论：未发现仍然成立的 `[blocking]` 或 `[important]` finding。
- Closed findings from review loop:
  - 普通无 reporting 权限用户访问 `/index` 失败 -> 已通过首页降级概览收口。
  - RD 首次登录残留 `/index` 标签 -> 已通过登录落地与 TagsView 初始化约束收口。

## Residual Risks Or Testing Gaps

- `web/src/layout/components/Navbar.vue` 的 websocket 通知仍沿用旧逻辑，当前只表现为噪音，不阻塞本轮 shell/landing/menu 验证。
- `auth-audit.listener.spec.ts` 在扩大测试命令下仍失败；当前没有证据表明由本切片引入，但它仍是仓库里的独立测试红点。
- 首页“旧风格”回归在第一阶段主要落实为 dashboard 节奏、菜单分域与首屏行为；更深的业务列表页视觉细化仍待后续切片继续推进。

## Final Status

- Outcome:
  - 第一阶段 shell integration 已完成并通过 browser smoke + type/build + scoped backend tests。
- Requirement alignment:
  - 与 `frontend-old-style-adaptation` 当前确认口径一致；本切片已闭环，后续应以新的前端细化切片继续推进。
- Directory disposition after completion:
  - archived to `docs/tasks/archive/retained-completed/` as implementation provenance for the active requirement.
- Next action:
  - 若继续该 requirement，建议新开后续切片，聚焦各业务列表页与编辑流的旧风格节奏细化，而不是继续复用本 shell slice。
