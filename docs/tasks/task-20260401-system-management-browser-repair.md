# System Management Browser Repair

## Metadata

- Scope: 修复 `system-management` 主题在 Chrome 实测里暴露出的实现缺口：后端本地启动对快照表的依赖、首页部门展示合同漂移，以及 canonical `stock_scope / workshop` 基础数据缺失导致的页面告警。
- Related requirement: `docs/requirements/topics/system-management-module.md`
- Status: `completed`
- Review status: `reviewed`
- Lifecycle disposition: `retained-completed`
- Planner: `assistant`
- Coder: `Ohm`, `Bohr`
- Reviewer: `Mencius`
- Last updated: `2026-04-01`
- Related checklist: `None`
- Related files:
  - `docs/requirements/topics/system-management-module.md`
  - `docs/architecture/00-architecture-overview.md`
  - `docs/architecture/modules/system-management.md`
  - `src/modules/rbac/infrastructure/in-memory-rbac.repository.ts`
  - `src/modules/master-data/application/master-data.service.ts`
  - `web/src/store/modules/user.js`
  - `web/src/views/home/index.vue`
  - `prisma/schema.prisma`
  - `scripts/**` if bootstrap/seed support is needed

## Requirement Alignment

- Requirement doc: `docs/requirements/topics/system-management-module.md`
- User intent summary:
  - 用 subagent 编排修复 Chrome 实测里验证出来的系统管理缺口，不做大范围重构。
  - 优先修复能直接影响真实浏览器体验的断点：启动、首页展示、基础数据初始化。
  - 如果 `stock_scope` 问题本质上是环境/数据初始化问题，优先采用 repo-owned bootstrap/seed 方案，而不是在权限或业务逻辑里加静默兜底。
- Acceptance criteria carried into this task:
  - 本地 dev 启动路径在标准初始化后能稳定完成，不再因为 `system_management_snapshot` 缺表在初始化阶段直接崩掉。
  - `operator / procurement / admin` 登录后，首页“所属部门”显示真实部门，不再落到 `未绑定部门`。
  - `MAIN` / `RD_SUB` 对应的基础库存范围数据在标准本地初始化后可用，浏览器实测不再持续弹 `库存范围不存在`。
  - 角色可见页面与不可访问页面的收口语义保持不变，尤其是 `system/*` 对非系统管理员仍应保持 404 / 不可达。
- Open questions requiring user confirmation:
  - None. 这里的优先级和修复边界已经足够清晰，直接按最小安全改动推进即可。

## Requirement Sync

- Req-facing phase progress:
  - 已按 subagent 编排把主题级系统管理口径落到真实 Chrome 回归，修的是实现缺口，不是重新定义主题边界。
- Req-facing current state:
  - `rbac / session / system-management` 的主链路已经通过真实登录与路由收口回归；`system_management_snapshot` 缺表自愈、canonical `stock_scope` 初始化、canonical `workshop` 初始化都已补齐。
  - 前端首页基础概览已能从 `/api/auth/me` 正确承接 `department`，`operator / procurement` 的首页“所属部门”已在 Chrome 中显示真实部门。
- Req-facing blockers:
  - 没有当前任务范围内的 blocker。
- Req-facing next step:
  - 若后续继续扩真实业务流，可再观察是否还有其他 master-data baseline 需要同类 bootstrap。
- Requirement doc sync owner:
  - `assistant`

## Goal And Acceptance Criteria

- Goal:
  - 用最小安全改动修复 `system-management` 在浏览器实测里暴露的真实断点，让本地开发、登录后首页、系统管理页面与 RD 页面都回到可验证状态。
- Acceptance criteria:
  - 后端本地 dev 启动在标准初始化后可完成，`/api/health` 返回 `200`，且系统管理初始化不再因缺少快照表而崩溃。
  - 首页部门信息与 `/api/auth/me` 返回一致，`operator / procurement / admin` 在 Chrome 中能看到真实部门名称。
  - 标准本地初始化下，`stock_scope` 至少具备 `MAIN` 和 `RD_SUB`，`workshop` 至少具备 `MAIN` 和 `RD` 的最小可用数据，避免首页和 RD 页面持续报初始化缺失错误。
  - `admin` 仍可进入系统管理与在线治理页面；`operator / rd-operator / procurement` 仍保持既有页面收口，不扩大权限面。
  - 必要的 focused tests、构建或浏览器冒烟补齐并通过。

## Scope And Ownership

- Allowed code paths:
  - `src/modules/rbac/**`
  - `src/modules/master-data/**`
  - `web/src/store/modules/user.js`
  - `web/src/views/home/index.vue`
  - `prisma/**` if a deterministic bootstrap/seed or schema touch is needed
  - `scripts/**` if a repo-owned bootstrap path is the safest fix for stock scope initialization
  - related focused tests under `src/**` / `web/**` / `test/**`
- Frozen or shared paths:
  - `src/modules/session/**`
  - `src/shared/guards/permissions.guard.ts`
  - `src/modules/auth/**` unless a response-contract adjustment is unavoidable
  - `inventory-core` write paths
  - `docs/requirements/**`
- Task doc owner:
  - `assistant`
- Contracts that must not change silently:
  - `rbac` 继续拥有权限字符串、路由树和数据权限策略的真源。
  - `JWT` 只是会话票据，`Redis session` 仍是真正的会话状态真源。
  - `inventory-core` 仍是唯一库存写入口。
  - `/api/auth/me` 的现有返回语义不应被破坏，frontend 以此为准补齐用户态。
  - `stockScope / workshopScope` 的 canonical 运行态语义不应被改写成新的授权模型。

## Implementation Plan

- [x] Step 1: 先确认 `system_management_snapshot` 缺表的最小安全修复路径。
  - 优先判断是否应通过 repo-owned bootstrap / seed / dev 初始化流程补齐，而不是在运行时吞掉持久化失败。
  - 若需要触碰 `prisma` 或 `scripts`，确保是确定性的初始化，不改变系统管理的业务语义。
- [x] Step 2: 修复首页部门展示的 store contract。
  - 让登录后的用户态真正承接 `/api/auth/me` 返回的 `department`。
  - 让首页继续沿既有样式与布局展示真实部门，而不是固定回退为 `未绑定部门`。
- [x] Step 3: 补齐 `stock_scope` 的最小本地初始化数据。
  - 明确这是环境/数据初始化问题，不是权限口径重设计。
  - 让 `MAIN` 与 `RD_SUB` 的基础数据在标准 dev 初始化后可用，避免 Chrome smoke 继续出现缺失告警。
- [x] Step 4: 补 focused tests / build / Chrome smoke，并把验证结果写回 task doc。

## Coder Handoff

- Execution brief:
  - 实现最小安全改动，修掉 Chrome smoke 里已经确认的 3 个缺口。
  - 不扩权限矩阵，不重做系统管理页面，不把库存范围问题伪装成授权问题。
- Required source docs or files:
  - `docs/requirements/topics/system-management-module.md`
  - `docs/architecture/00-architecture-overview.md`
  - `docs/architecture/modules/system-management.md`
  - 本 task doc
- Owned paths:
  - Backend / data-init writer:
    - `src/modules/rbac/**`
    - `src/modules/master-data/**`
    - `prisma/**`
    - `scripts/**`
    - backend focused tests
  - Frontend writer:
    - `web/src/store/modules/user.js`
    - `web/src/views/home/index.vue`
    - frontend build or smoke-related assets/tests
- Forbidden shared files:
  - `src/modules/session/**`
  - `src/shared/guards/permissions.guard.ts`
  - `inventory-core` 写路径
  - `docs/requirements/**`
- Constraints and non-goals:
  - 不新增一套独立的系统管理授权真源。
  - 不把 `stock_scope` 问题处理成运行时静默降级。
  - 不改变 `admin`、`operator`、`rd-operator`、`procurement` 的既有角色边界。
- Validation command for this scope:
  - Backend/data-init scope:
    - `set -a && source .env.dev && set +a && pnpm prisma db push --schema prisma/schema.prisma`
    - `pnpm test -- src/modules/rbac/application/rbac.service.spec.ts src/modules/rbac/infrastructure/in-memory-rbac.repository.spec.ts`
  - Frontend scope:
    - `pnpm --dir web build:prod`
  - Parent smoke after both scopes land:
    - `pnpm dev` + Chrome login smoke for `admin / operator / rd-operator / procurement`
- If parallel work is approved, add one subsection per writer with the same fields:
  - `Backend/Data-Init Writer`
    - Owned paths: `src/modules/rbac/**`, `src/modules/master-data/**`, `prisma/**`, `scripts/**`
    - Validation: backend command set above
    - Non-goals: no frontend store/view edits
  - `Frontend Writer`
    - Owned paths: `web/src/store/modules/user.js`, `web/src/views/home/index.vue`
    - Validation: frontend build + browser smoke
    - Non-goals: no backend schema or seed changes

## Reviewer Handoff

- Review focus:
  - 检查是否真的修掉了 Chrome 实测缺口，而不是只让页面“看起来没报错”。
  - 确认 backend bootstrap / seed 改动没有偷偷放宽权限、吞掉 schema 问题或改变会话语义。
  - 确认 frontend 部门展示是基于既有 `auth/me` 合同修复，而不是引入新的临时接口。
- Requirement alignment check:
  - 仍然贴合 `system-management` 主题的长期边界，没有扩大到调度、AI 或业务域重设计。
  - `stock_scope` 修复被明确视为初始化 / 种子问题，而不是权限模型变更。
- Final validation gate:
  - backend / frontend 各自的 focused validation 通过后，再跑一轮 Chrome 实测。
- Required doc updates:
  - 把实际验证结果写回本 task doc。
  - 如需要，再由 parent 同步到 `docs/requirements/topics/system-management-module.md` 的简短进展行。

## Parallelization Safety

- Status: `safe`
- If safe, list the exact disjoint writable scopes:
  - Backend / data-init writer: `src/modules/rbac/**`, `src/modules/master-data/**`, `prisma/**`, `scripts/**`
  - Frontend writer: `web/src/store/modules/user.js`, `web/src/views/home/index.vue`
- If not safe, list the shared files or contracts that require a single writer:
  - Shared contract to watch is `/api/auth/me` and the `stockScope` canonical values, but当前不需要同时改它们的语义。

## Review Log

- Validation results:
  - 通过：`set -a && source .env.dev && set +a && pnpm prisma db push --schema prisma/schema.prisma`
  - 通过：`pnpm test -- src/modules/rbac/application/rbac.service.spec.ts src/modules/rbac/infrastructure/in-memory-rbac.repository.spec.ts src/modules/master-data/application/master-data.service.spec.ts src/modules/master-data/infrastructure/master-data.repository.spec.ts`
  - 通过：`pnpm --dir web build:prod`
  - 通过：真实 Chrome smoke，覆盖 `admin / operator / rd-operator / procurement`
- Findings:
  - reviewer 未发现阻断性代码问题。
  - 父级 Chrome smoke 先发现 `stock_scope` 修复后仍暴露 `车间不存在: MAIN`，已在同轮 follow-up 中补齐 canonical `workshop` bootstrap 后复测通过。
- Follow-up action:
  - 若后续继续放大真实业务流覆盖，观察是否还有其他 master-data baseline 需要 repo-owned bootstrap。

## Final Status

- Outcome:
  - 已完成。后端现在会自愈 `system_management_snapshot` 缺表，并在启动时幂等补齐 canonical `workshop` 与 `stock_scope`；前端首页已正确承接 `department`。
- Requirement alignment:
  - 保持在 `system-management` 主题边界内，只修初始化与前端合同漂移，没有扩权限、没有改会话真源、没有改库存写入口语义。
- Residual risks or testing gaps:
  - 当前自愈只覆盖“缺表”与“缺 baseline 记录”，不自动修复已经存在但结构或内容漂移的旧数据。
  - 本轮 smoke 覆盖了登录、首页、系统管理入口与 RD 入口；更深的业务写入流若后续要验，还应继续补场景。
- Directory disposition after completion: keep `active` while the task is still open; once it is no longer active, set this to `retained-completed` or `cleanup-candidate`, then sync `docs/tasks/TASK_CENTER.md`
- Next action:
  - 保留 task doc 作为已完成记录；`docs/requirements/topics/system-management-module.md` 本轮未同步，因为该文件已有用户侧未提交改动需要避免覆盖。
