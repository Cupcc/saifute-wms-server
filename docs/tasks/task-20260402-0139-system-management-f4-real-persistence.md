# 系统管理 F4 规范化真实落库

## Metadata

- Scope: 将 `用户 / 角色 / 部门 / 菜单 / 岗位 / 字典 / 参数 / 通知` 从 `InMemoryRbacRepository + system_management_snapshot` 切换为规范化数据库表真源，并保持 `auth/me`、`auth/routes`、权限判定、会话失效与代表账号边界不回归。
- Related requirement: `docs/requirements/topics/system-management-module.md` (F4)
- Status: `accepted`
- Review status: `reviewed-clean`
- Delivery mode: `autonomous`
- Acceptance mode: `full`
- Acceptance status: `accepted`
- Complete test report required: `yes`
- Lifecycle disposition: `retained-completed`
- Planner: `assistant`
- Coder: `assistant`
- Reviewer: `code-reviewer`
- Acceptance QA: `acceptance-qa`
- Last updated: `2026-04-02`
- Related checklist: `None`
- Related acceptance spec: `docs/acceptance-tests/specs/system-management.md`
- Related acceptance run: `None`
- Related files:
  - `docs/requirements/topics/system-management-module.md`
  - `docs/architecture/00-architecture-overview.md`
  - `docs/architecture/modules/system-management.md`
  - `docs/acceptance-tests/README.md`
  - `task-20260331-0934-system-management-f4-persistence`（历史 F4 先行任务，已归档，见 git log）
  - `prisma/schema.prisma`
  - `src/modules/rbac/domain/rbac.types.ts`
  - `src/modules/rbac/infrastructure/in-memory-rbac.repository.ts`
  - `src/modules/rbac/application/system-management.service.ts`
  - `src/modules/rbac/application/rbac.service.ts`
  - `src/modules/session/application/session.service.ts`
  - `src/modules/auth/application/auth.service.ts`
  - `test/app.e2e-spec.ts`
  - `test/batch-d-slice.e2e-spec.ts`
  - `test/redis-real-integration.e2e-spec.ts`

## Requirement Alignment

- Topic capability:
  - `docs/requirements/topics/system-management-module.md` (F4)
- User intent summary:
  - 继续完成 `system-management` 当前唯一未完成能力 `F4`，把八类系统管理主数据从 JSON 快照桥接切到规范化数据库表真实落库。
  - 在不改写 topic 长期边界的前提下，保持 `/api/auth/me`、`/api/auth/routes`、角色菜单关系、权限判定、动态菜单与会话失效策略语义一致。
  - 采用 AI 自主交付路径，最终以 `full` 模式 acceptance spec 作为默认完整测试报告载体；必要时再追加独立 `run`。
- Acceptance criteria carried into this task:
  - `[AC-1]` `用户 / 角色 / 部门 / 菜单 / 岗位 / 字典类型 / 字典数据 / 参数 / 通知` 均以规范化数据库表作为长期真源，不再以 `system_management_snapshot` 单行 JSON 作为完成态。
  - `[AC-2]` 当前 `/api/system/*` 管理面支持上述对象的标准查询与写入，并能在服务重启后保持状态，不依赖进程内初始数组恢复。
  - `[AC-3]` `/api/auth/me`、`/api/auth/routes`、权限判定、动态菜单与角色菜单关系仍来自同一套系统管理真源，`admin / operator / rd-operator / procurement` 的角色边界不回归。
  - `[AC-4]` 用户、角色、菜单、授权关系等关键变更后，会话刷新或失效策略仍正确工作，不出现长期 stale permissions。
  - `[AC-5]` 交付附带完整测试报告，覆盖 schema / service / API / 会话权限回归与代表账号验证，并能说明剩余风险。
- Requirement evidence expectations:
  - 数据模型与迁移证据：规范化 Prisma schema、client generate、必要的 schema apply 或迁移 / backfill 证据。
  - 运行态证据：repository / service / API 行为验证，不再把 `system_management_snapshot` 视为运行态真源。
  - 权限与会话证据：`/api/auth/me`、`/api/auth/routes`、角色菜单关系、菜单变更后的会话失效或刷新验证。
  - 代表账号证据：`admin / operator / rd-operator / procurement` 的代表性边界回归。
  - 完整测试报告：`full` 模式 acceptance spec（必要时附 acceptance run）。
- Open questions requiring user confirmation:
  - None.

## Progress Sync

- Phase progress:
  - `F4` 真实落库、full acceptance 与浏览器 smoke 已全部完成；task 可归档为 `retained-completed`。
- Current state:
  - 规划已对齐 topic、架构与当前仓库实现；当前真实现状仍是 `InMemoryRbacRepository + system_management_snapshot`，本 task 已明确其只可作为迁移来源，不再作为完成态。
- Acceptance state:
  - `待验收`；需由 `acceptance-qa` 产出或更新 spec，并在其中记录 `Latest Verification` 作为完整测试报告。
- Blockers:
  - None.
- Next step:
  - `coder` 先完成 schema / repository / backfill / regression 实现，随后由 `code-reviewer` 与 `acceptance-qa` 收口 full-mode 验收。

## Goal And Acceptance Criteria

- Goal:
  - 用最小安全且可长期维护的方式完成 `system-management` `F4`：让八类系统管理主数据改由规范化数据库表承接，同时保持现有 RBAC、动态路由、代表账号边界和会话失效语义稳定。
- Acceptance criteria:
  - `[AC-1]` `用户 / 角色 / 部门 / 菜单 / 岗位 / 字典类型 / 字典数据 / 参数 / 通知` 均以规范化数据库表作为长期真源，不再以 `system_management_snapshot` 单行 JSON 作为完成态。
  - `[AC-2]` 当前 `/api/system/*` 管理面支持上述对象的标准查询与写入，并能在服务重启后保持状态，不依赖进程内初始数组恢复。
  - `[AC-3]` `/api/auth/me`、`/api/auth/routes`、权限判定、动态菜单与角色菜单关系仍来自同一套系统管理真源，`admin / operator / rd-operator / procurement` 的角色边界不回归。
  - `[AC-4]` 用户、角色、菜单、授权关系等关键变更后，会话刷新或失效策略仍正确工作，不出现长期 stale permissions。
  - `[AC-5]` 交付附带完整测试报告，覆盖 schema / service / API / 会话权限回归与代表账号验证，并能说明剩余风险。

## Acceptance Planning

- Acceptance mode: `full`
- Why this mode is proportionate:
  - 该切片会改写系统管理主数据真源、权限与菜单关系读写路径、重启后持久化语义，以及会话失效闭环；它是 `system-management` `V1` 唯一剩余交付项，属于高风险、跨对象、跨模块边界的 runtime 变更。
- Separate acceptance spec expected: `yes`
- Separate acceptance run expected: `optional`
- Complete test report required: `yes`
- Existing acceptance spec:
  - `None`；由 `acceptance-qa` 先创建 `docs/acceptance-tests/specs/system-management.md`
- Existing acceptance run:
  - `None`；仅在需要独立冻结报告时由 `acceptance-qa` 额外创建

## Scope And Ownership

- Allowed code paths:
  - `prisma/schema.prisma`
  - `src/generated/prisma/**`
  - `src/modules/rbac/**`
  - `test/app.e2e-spec.ts`
  - `test/batch-d-slice.e2e-spec.ts`
  - `test/redis-real-integration.e2e-spec.ts`
- Frozen or shared paths:
  - `docs/requirements/topics/system-management-module.md`
  - `docs/architecture/**`
  - `docs/playbooks/**`
  - `docs/tasks/archive/retained-completed/task-20260402-0139-system-management-f4-real-persistence.md`
  - `docs/tasks/TASK_CENTER.md`
  - `docs/acceptance-tests/**`
  - `src/modules/session/**`
  - `src/modules/auth/**`
  - `src/shared/guards/permissions.guard.ts`
  - `src/modules/audit-log/**`
  - `src/modules/master-data/**`
  - `src/modules/scheduler/**`
  - `src/modules/ai-assistant/**`
  - `web/**`
- Task doc owner:
  - `assistant`
- Contracts that must not change silently:
  - `rbac` 仍拥有权限字符串、角色菜单关系、数据权限与动态路由真源。
  - `session` 仍以 `JWT ticket + Redis session` 为真源，不改为无状态 JWT。
  - `consoleMode` 只负责壳层 / 默认入口体验，不替代真实授权。
  - `stockScope / workshopScope` 仍是库存访问与 RD 固定视角的既有语义，不得被部门树替代。
  - `admin` 超级管理员判定必须在数据库、后端鉴权、会话快照与前端识别上保持一致。
  - `scheduler / ai-assistant` 继续作为 topic 外邻接能力，不并入当前实现。

## Implementation Plan

- [ ] Step 1: 固定规范化落库的数据模型与迁移边界。
  - 为 `用户 / 角色 / 部门 / 菜单 / 岗位 / 字典类型 / 字典数据 / 参数 / 通知` 设计 Prisma model。
  - 为 `用户-角色 / 用户-岗位 / 角色-菜单 / 角色-部门` 建立关系表；仅当现有权限库存无法被菜单权限完整表示时，才补最小兼容的直接权限关系，不得重新开放“任意新增权限字符串”语义。
  - `system_management_snapshot` 只保留为过渡 backfill 来源；完成态不再依赖它承接运行时读写。
- [ ] Step 2: 保持当前 `SystemManagementService` / `RbacService` / controller API 形状不变，替换底层持久化真源。
  - 优先维持现有 `src/modules/rbac/**` 的上层调用面与返回结构稳定。
  - 将 `InMemoryRbacRepository` 重构为“从规范化表加载 + 向规范化表事务写回”的适配层，而不是继续整包序列化整个状态快照。
- [ ] Step 3: 实现启动恢复与安全落地路径。
  - 启动顺序固定为：优先加载规范化表；若规范化表为空且存在历史 `system_management_snapshot`，执行一次性幂等 backfill；若两者都为空，则落标准 canonical seed。
  - backfill / seed 完成后，后续 CRUD 只写规范化表，不再回写 snapshot。
- [ ] Step 4: 收口权限、菜单、代表账号与会话失效语义。
  - 继续让 `/api/auth/me`、`/api/auth/routes`、`PermissionsGuard`、角色菜单关系和动态菜单来自同一套规范化真源。
  - 保持 `admin / operator / rd-operator / procurement` 的角色边界、`consoleMode`、`workshopScope` 与 `stockScope` 语义稳定。
  - 用户、角色、菜单、授权关系变更后，沿现有 `SystemManagementService` 会话失效链路验证 stale permission 不残留。
- [ ] Step 5: 补 focused 自动化验证。
  - repository 级：规范化表加载、snapshot backfill、CRUD 写回、删除时关系清理、重启后状态保留。
  - service / auth 级：`/api/auth/me`、`/api/auth/routes`、角色菜单联动、代表账号边界、菜单变更后路由与权限刷新。
  - e2e 级：关键登录 / 会话 / 持久化回归保持可重复。
- [ ] Step 6: 完成 review 与 full-mode acceptance。
  - `code-reviewer` 重点检查 schema 归一化、模块边界、权限 / 会话回归与 migration / backfill 安全性。
  - `acceptance-qa` 更新 spec 及其 `Latest Verification`，形成完整测试报告并逐条判定 `[AC-1]` ~ `[AC-5]`；仅在需要独立留档时再追加 `run`。

## Coder Handoff

- Execution brief:
  - 实现 `F4` 的最小安全路径是“保上层 API 契约，替换底层真源”，不要在同一切片里顺手拆模块、重写前端或扩大 topic 范围。
  - `system_management_snapshot` 只能作为 backfill 输入或迁移期兼容资产，不能继续作为运行时主写路径或验收完成态。
- Required source docs or files:
  - `docs/requirements/topics/system-management-module.md`
  - `docs/architecture/00-architecture-overview.md`
  - `docs/architecture/modules/system-management.md`
  - `docs/acceptance-tests/README.md`
  - `task-20260331-0934-system-management-f4-persistence`（历史 F4 先行任务，已归档，见 git log）
  - 本 task doc
- Owned paths:
  - `prisma/schema.prisma`
  - `src/generated/prisma/**`
  - `src/modules/rbac/**`
  - `test/app.e2e-spec.ts`
  - `test/batch-d-slice.e2e-spec.ts`
  - `test/redis-real-integration.e2e-spec.ts`
- Forbidden shared files:
  - `docs/requirements/topics/system-management-module.md`
  - `docs/architecture/**`
  - `docs/playbooks/**`
  - `docs/tasks/archive/retained-completed/task-20260402-0139-system-management-f4-real-persistence.md`
  - `docs/tasks/TASK_CENTER.md`
  - `docs/acceptance-tests/**`
  - `src/modules/session/**`
  - `src/modules/auth/**`
  - `src/shared/guards/permissions.guard.ts`
  - `src/modules/audit-log/**`
  - `src/modules/master-data/**`
  - `src/modules/scheduler/**`
  - `src/modules/ai-assistant/**`
  - `web/**`
- Constraints and non-goals:
  - 不改写 `PermissionsGuard` 语义，不改前端权限判断逻辑，不新增新的权限目录治理模型。
  - 不把组织树直接变成库存边界，不把 `workshopScope` 真源迁到业务模块。
  - 不把 `scheduler / ai-assistant` 的菜单或权限重构混入本轮。
  - 若实现过程中发现必须同时改 `src/modules/session/**`、`src/modules/auth/**` 或 `web/**` 才能成立，先停下并让 parent 重新确认 scope。
- Validation command for this scope:
  - Iteration / schema:
    - `pnpm prisma:validate`
    - `pnpm prisma:generate`
    - `set -a && source .env.dev && set +a && pnpm prisma db push --schema prisma/schema.prisma`
  - Iteration / type + focused tests:
    - `pnpm typecheck`
    - `pnpm test -- src/modules/rbac/infrastructure/in-memory-rbac.repository.spec.ts src/modules/rbac/application/rbac.service.spec.ts src/modules/rbac/controllers/system-config.controller.spec.ts`
  - API / session regression:
    - `pnpm test:e2e -- test/app.e2e-spec.ts test/batch-d-slice.e2e-spec.ts test/redis-real-integration.e2e-spec.ts`

## Reviewer Handoff

- Review focus:
  - 是否真的把长期真源切到规范化表，而不是把 snapshot 换个包装继续留在运行时中心。
  - 是否保持 `auth/me`、`auth/routes`、角色菜单关系、代表账号边界与会话失效语义不回归。
  - 是否把关系表、删除清理、backfill 幂等性和重启后持久化证据补齐。
  - 是否把风险控制在 `rbac + prisma` 范围内，没有无证据地外溢到 `session / auth / web / business modules`。
- Requirement alignment check:
  - 对照 `[AC-1]` ~ `[AC-5]` 检查完成度，不接受“schema 改了 / 单测过了”就算完成。
  - 明确 `system_management_snapshot` 在完成态中的位置只能是历史兼容或迁移来源，不可仍是主真源。
- Final validation gate:
  - `pnpm prisma:validate`
  - `pnpm prisma:generate`
  - `set -a && source .env.dev && set +a && pnpm prisma db push --schema prisma/schema.prisma`
  - `pnpm typecheck`
  - `pnpm test -- src/modules/rbac/infrastructure/in-memory-rbac.repository.spec.ts src/modules/rbac/application/rbac.service.spec.ts src/modules/rbac/controllers/system-config.controller.spec.ts`
  - `pnpm test:e2e -- test/app.e2e-spec.ts test/batch-d-slice.e2e-spec.ts test/redis-real-integration.e2e-spec.ts`
- Required doc updates:
  - reviewer 只更新本 task doc 的 `Review status`、`Review Log`、`Acceptance-ready evidence` 交接结论。
  - task doc 的进展同步由 parent 执行。

### Acceptance Evidence Package

- Covered criteria:
  - `[AC-1]` 规范化表真源
  - `[AC-2]` 标准 CRUD + 重启保留
  - `[AC-3]` `auth/me`、`auth/routes`、权限 / 菜单 / 角色边界一致性
  - `[AC-4]` 会话失效或刷新策略
  - `[AC-5]` 完整测试报告
- Evidence pointers:
  - `prisma/schema.prisma`
  - `src/modules/rbac/**`
  - `src/generated/prisma/**`
  - `src/modules/rbac/infrastructure/in-memory-rbac.repository.spec.ts`
  - `src/modules/rbac/application/rbac.service.spec.ts`
  - `test/app.e2e-spec.ts`
  - `test/batch-d-slice.e2e-spec.ts`
  - `test/redis-real-integration.e2e-spec.ts`
  - `docs/acceptance-tests/specs/system-management.md`
- Evidence gaps, if any:
  - review 阶段无阻塞性证据缺口；schema relation/FK、mixed-state 启动保护、legacy snapshot backfill 覆盖已补齐。`[AC-5]` 的完整测试报告仍待 `acceptance-qa` 在 `spec` 的 `Latest Verification` 中收口，必要时再附 `run`。
- Complete test report requirement: `yes`

### Acceptance Test Expectations

- Acceptance mode: `full`
- Browser test required: `yes`
- Related acceptance spec:
  - `docs/acceptance-tests/specs/system-management.md`
- Separate acceptance run required: `optional`
- Complete test report required: `yes`
- Required regression / high-risk tags:
  - `regression-critical`
  - `system-management-f4`
  - `auth-rbac`
  - `session-invalidation`
  - `restart-persistence`
  - `representative-accounts`
- Suggested environment / accounts:
  - backend: local `.env.dev` + MySQL + Redis
  - accounts: `admin / operator / rd-operator / procurement`
  - browser: use the `agent-browser` skill; if unavailable in the current runtime, run `agent-browser` CLI for smoke / acceptance flow
- Environment owner / setup source:
  - `docs/acceptance-tests/README.md`
  - `agent-browser` skill

## Architecture And Repository Considerations

- 保持 controller 薄、service 编排稳定：优先保留现有 `/api/system/*`、`/api/auth/*` 契约，不把接口重写和真源切换绑在一起。
- 以 `rbac` 为唯一权限真源：角色菜单关系、权限字符串、动态路由过滤继续从 `rbac` 出口给 `auth` / `session` / `PermissionsGuard` 使用。
- 简单 CRUD 优先 Prisma；只有菜单树或权限联查在 Prisma 上明显失真时，才在 `rbac` 基础设施内使用最小 raw SQL。
- 继续将 `consoleMode`、`workshopScope` 视为平台授权快照的一部分；若需持久化，优先用明确字段或最小兼容关系，不把 `master-data` 变成系统管理主数据的从属库。
- 保持 `session` 模块只消费最新用户快照或失效结果，不让 `session` 反向拥有 RBAC 主数据。
- 不在此 task 顺手拆 `system-management` 新模块；当前最小安全路线是保现有 `src/modules/rbac/**` 适配层，对内完成真源切换。

## Risks And Contract-Sensitive Areas

- `prisma/schema.prisma` 是高冲突共享面：对象表、关系表和生成 client 必须一次性成组收口。
- `InMemoryRbacRepository` 目前同时承接样例种子、权限解析、CRUD、重启恢复，改造时最容易把 snapshot 语义偷偷带回完成态。
- `admin` 超级管理员语义、`ALL_PERMISSION`、代表账号默认角色分配和菜单可见性高度耦合，任何 cutover 都要防止边界放宽或误裁剪。
- 菜单变更后的 `invalidateAllRoleSessions()`、角色 / 用户变更后的定向失效必须保持有效，避免 stale permissions。
- `role.deptIds`、`user.roleIds`、`user.postIds`、`role.menuIds` 等当前数组字段必须被真正规范化，而不是继续落成单列 JSON。
- backfill 必须幂等，且在“已有 snapshot / 无规范化表 / 服务重启再次初始化”这些路径下都不能重复造数或覆盖人工修改。

## Validation Plan

- Narrow iteration commands:
  - `pnpm prisma:validate`
  - `pnpm prisma:generate`
  - `set -a && source .env.dev && set +a && pnpm prisma db push --schema prisma/schema.prisma`
  - `pnpm typecheck`
  - `pnpm test -- src/modules/rbac/infrastructure/in-memory-rbac.repository.spec.ts src/modules/rbac/application/rbac.service.spec.ts src/modules/rbac/controllers/system-config.controller.spec.ts`
- Runtime regression commands:
  - `pnpm test:e2e -- test/app.e2e-spec.ts test/batch-d-slice.e2e-spec.ts test/redis-real-integration.e2e-spec.ts`
- Full acceptance gate:
  - `acceptance-qa` 创建 / 更新 `docs/acceptance-tests/specs/system-management.md`
  - `acceptance-qa` 更新 spec 中的 `Latest Verification`
  - 如需独立冻结报告，再额外创建 `docs/acceptance-tests/runs/run-*.md`
  - 浏览器验收优先使用 Agent Browser skill；当前运行面若不可用则直接执行 `agent-browser` CLI，覆盖 `admin / operator / rd-operator / procurement` 的登录、菜单、`/api/auth/me`、`/api/auth/routes` 与系统管理页面 reachability 证据。

## Parallelization Safety

- Status: `not safe`
- If safe, list the exact disjoint writable scopes:
  - N/A
- If not safe, list the shared files or contracts that require a single writer:
  - `prisma/schema.prisma`
  - `src/generated/prisma/**`
  - `src/modules/rbac/infrastructure/in-memory-rbac.repository.ts`
  - `src/modules/rbac/domain/rbac.types.ts`
  - `src/modules/rbac/application/system-management.service.ts`
  - `auth/me` / `auth/routes` / 角色菜单 / 会话失效是一条共享契约链，拆多个 writer 容易出现 schema、repository、session invalidation 和 representative-account 边界漂移。

## Review Log

- Validation results:
  - 重新对照了 `docs/tasks/archive/retained-completed/task-20260402-0139-system-management-f4-real-persistence.md`、`docs/requirements/topics/system-management-module.md (F4)` 与 `docs/architecture/modules/system-management.md`，确认本轮 re-review 仍以”规范化表真源 + auth/rbac/session 语义不回归 + backfill / mixed-state 安全”为准。
  - 直接复核了 `prisma/schema.prisma`、`src/modules/rbac/infrastructure/in-memory-rbac.repository.ts`、`src/modules/rbac/infrastructure/in-memory-rbac.repository.spec.ts`，并结合 scoped diff 复核 `src/modules/rbac/application/rbac.service.spec.ts`、`src/modules/rbac/controllers/system-config.controller.spec.ts`、`test/app.e2e-spec.ts`、`test/batch-d-slice.e2e-spec.ts`、`test/redis-real-integration.e2e-spec.ts`。
  - 已确认 `restoreOrSeedState()` 现先统计各规范化 base table，只要任一 `sys_*` 真源已有数据就直接从规范化表加载，并在 `users === 0` 的 mixed-state 场景只告警不 reseed，消除了此前“仅看 `sys_user.count()` 导致破坏性重灌”的问题。
  - 已确认 `prisma/schema.prisma` 为 `sys_user.dept_id`、`sys_user_role`、`sys_user_post`、`sys_role_menu`、`sys_role_dept` 以及 `sys_dict_data -> sys_dict_type` 补齐了 relation / FK，当前 review 范围内未再发现“规范化真源缺少基础引用约束”的遗留问题。
  - 已确认 repository spec 新增了 legacy snapshot backfill 与 mixed-state 保护分支；结合既有 auth/rbac/session focused tests 与 e2e，当前变更风险面已有直接自动化证据。
  - Parent validation 已提供并通过：`pnpm prisma:validate`、`pnpm prisma:generate`、`set -a && source .env.dev && set +a && pnpm prisma db push --schema prisma/schema.prisma`、`pnpm typecheck`、`pnpm test -- src/modules/rbac/infrastructure/in-memory-rbac.repository.spec.ts src/modules/rbac/application/rbac.service.spec.ts src/modules/rbac/controllers/system-config.controller.spec.ts`、`env -u DATABASE_URL -u JWT_SECRET -u JWT_EXPIRES_IN_SECONDS -u SESSION_TTL_SECONDS -u SESSION_MAX_TTL_SECONDS -u SESSION_REFRESH_THRESHOLD_SECONDS -u CAPTCHA_TTL_SECONDS -u CAPTCHA_ENABLED -u PASSWORD_MAX_RETRIES -u PASSWORD_LOCK_MINUTES -u REDIS_HOST -u REDIS_PORT -u REDIS_PASSWORD -u REDIS_DB -u REDIS_CONNECT_TIMEOUT_MS pnpm test:e2e -- test/app.e2e-spec.ts test/batch-d-slice.e2e-spec.ts test/redis-real-integration.e2e-spec.ts`。
  - 对 `MaxListenersExceededWarning` / `Jest did not exit one second after the test run has completed` 未见与本 task 新增代码直接相关的恶化证据；本次仍按既有 test-runner hygiene warning 处理，不记为 scoped finding。
- Findings:
  - No findings.
- Follow-up action:
  - `acceptance-qa` 可继续执行 `full` 模式 spec 收口，并按需要决定是否额外创建 `run`。

## Acceptance

- Acceptance status: `accepted`
- Acceptance QA: `acceptance-qa`
- Acceptance date: `2026-04-02`
- Complete test report:
  - `docs/acceptance-tests/specs/system-management.md`（`Latest Verification`）

### Acceptance Checklist

- [x] `[AC-1]` 八类系统管理对象已改为规范化数据库表真源，不再以 `system_management_snapshot` 作为完成态 — Evidence: prisma schema + db push + unit tests `[AC-CASE-1]~[AC-CASE-3]` — Verdict: `met`
- [x] `[AC-2]` `/api/system/*` 标准 CRUD 在服务重启后仍保持状态 — Evidence: unit tests `[AC-CASE-3][AC-CASE-4]`（loadFromNormalizedTables + mixed-state 保护）— Verdict: `met`
- [x] `[AC-3]` `/api/auth/me`、`/api/auth/routes`、权限判定、动态菜单与代表账号边界保持一致 — Evidence: e2e `[AC-CASE-5][AC-CASE-6]` + unit test `[AC-CASE-7]` + browser smoke `[AC-CASE-10]` — Verdict: `met`
- [x] `[AC-4]` 用户 / 角色 / 菜单 / 授权关系变更后的会话刷新或失效策略有效 — Evidence: e2e `[AC-CASE-8][AC-CASE-9]`（real Redis session lifecycle）— Verdict: `met`
- [x] `[AC-5]` 已产出完整测试报告，覆盖 schema / service / API / 会话权限回归与代表账号验证 — Evidence: acceptance spec 的 `Latest Verification` 已更新并补齐 browser smoke — Verdict: `met`

### Acceptance Notes

- Acceptance path used: `full`
- Acceptance summary:
  - F4 核心实现已达到 `accepted`。schema validate / generate / db push、typecheck、focused unit tests（7 cases）、e2e API + real-Redis session tests 全部 PASS；code review `reviewed-clean`；浏览器 smoke 已补跑通过。四代表账号在真实 UI 中均可登录成功，admin 可达 `system/user`，operator 直达 `system/user` 返回 404，rd-operator 默认进入 `rd/workbench`，procurement 可达采购需求、供应商与验收入库页面。
- Report completeness check:
  - 完整测试报告已收口到：`docs/acceptance-tests/specs/system-management.md` 的 `Latest Verification`
- If conditionally accepted:
  - None.

## Final Status

- Outcome:
  - 已完成 `F4` 真实落库实现、re-review 与 `full` 模式 acceptance spec 收口；浏览器 smoke 已补齐，task 达到 `accepted` 并可归档为 `retained-completed`。
- Requirement alignment:
  - 当前实现已把完成态持久化从单行 snapshot 切到 `sys_*` 规范化表；mixed-state 保护、关系 / FK 约束、legacy snapshot backfill、自动化验证与四代表账号浏览器回归均已补齐。当前与 requirement 的 `[AC-1]` ~ `[AC-5]` 全量对齐。
- Residual risks or testing gaps:
-  - 当前无新的实现级 blocking / important 风险；采购账号 AI 子路由未单独做页面点击，但 `/api/auth/routes` 与浏览器菜单边界保持一致，不影响本 task 签收。
- Directory disposition after completion: `retained-completed`
- Next action:
  - None.
