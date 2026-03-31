# 系统管理 F4 持久化与初始化

## Metadata

- Scope: 将当前 `rbac / system-management` 样例状态迁到 Prisma 可持久化快照，并把业务权限从角色预设硬编码收敛为菜单/角色数据驱动的初始化配置。
- Related requirement: `docs/requirements/archive/retained-completed/req-20260331-0934-system-management-f4-persistence.md`
- Status: `completed`
- Review status: `validated-no-independent-review`
- Lifecycle disposition: `retained-completed`
- Planner: `assistant`
- Coder: `assistant`
- Reviewer: `assistant`
- Last updated: `2026-03-31`
- Related checklist: `None`
- Related files:
  - `docs/requirements/archive/retained-completed/req-20260331-0934-system-management-f4-persistence.md`
  - `docs/requirements/REQUIREMENT_CENTER.md`
  - `docs/tasks/TASK_CENTER.md`
  - `docs/requirements/topics/system-management-module.md`
  - `prisma/schema.prisma`
  - `src/modules/rbac/domain/rbac.types.ts`
  - `src/modules/rbac/infrastructure/in-memory-rbac.repository.ts`
  - `src/modules/rbac/application/system-management.service.ts`
  - `src/modules/rbac/application/rbac.service.ts`
  - `src/modules/rbac/infrastructure/in-memory-rbac.repository.spec.ts`
  - `src/generated/prisma/**`

## Requirement Alignment

- Requirement doc:
  - `docs/requirements/archive/retained-completed/req-20260331-0934-system-management-f4-persistence.md`
- User intent summary:
  - 继续完成 `system-management` 的 `F4`，真正落地平台初始化与持久化，不再把业务域权限主要写死在代码里。
  - 在不重新设计整套平台模块边界的前提下，优先收口当前 `rbac` 样例状态与权限初始化真源。
  - 完成后要跑验证并提交 commit。
- Acceptance criteria carried into this task:
  - `rbac / system-management` 当前样例状态可以持久化，不再在进程重启后丢失。
  - 业务域权限不再依赖 `ROLE_PERMISSION_PRESETS` 这类角色预设硬编码，而是由可持久化菜单/角色配置承接。
  - `admin / warehouse-manager / rd-operator / procurement` 的现有角色边界、`consoleMode` 语义与 `workshopScope` 约束不被放宽。
  - Focused tests、类型检查与必要的 Prisma 生成/校验通过。
- Open questions requiring user confirmation:
  - None.

## Requirement Sync

- Req-facing phase progress:
  - 已完成 F4 收口并归档。
- Req-facing current state:
  - 当前采用“Prisma 单行 JSON 快照 + 默认初始化种子 + 现有管理面复用”的方式承接平台初始化与持久化，避免在本轮引入大范围平台表重构。
- Req-facing blockers:
  - None.
- Req-facing next step:
  - None；若继续推进 `system-management` 主题 `F5` 或更细粒度平台表规范化，另开新切片。
- Requirement doc sync owner:
  - `assistant`

## Goal And Acceptance Criteria

- Goal:
  - 用最小安全改动完成 `system-management` `F4`：把当前系统管理/RBAC 初始化数据变成可持久化、可初始化、可通过现有管理面继续维护的真源。
- Acceptance criteria:
  - [x] Prisma schema 增加一套承接 `system-management` 初始化快照的持久化模型。
  - [x] `InMemoryRbacRepository` 在应用启动时能从持久化快照加载状态；首次无数据时能自动写入默认初始化状态。
  - [x] 菜单/角色数据能够直接承接业务域权限，`ROLE_PERMISSION_PRESETS` 不再作为普通角色业务权限真源。
  - [x] 受影响的用户/角色/菜单/部门/岗位/字典/参数/通知 CRUD 变更能够落盘到快照，而不仅停留在进程内。
  - [x] `admin` 兜底能力、`rd-operator` 的 RD 固定视角、`workshopScope` 限制和现有 routes/filter 语义保持不变。

## Scope And Ownership

- Allowed code paths:
  - `docs/requirements/req-20260331-0934-system-management-f4-persistence.md`
  - `docs/requirements/REQUIREMENT_CENTER.md`
  - `docs/tasks/task-20260331-0934-system-management-f4-persistence.md`
  - `docs/tasks/TASK_CENTER.md`
  - `docs/requirements/topics/system-management-module.md`
  - `prisma/schema.prisma`
  - `src/modules/rbac/**`
  - `src/shared/prisma/**`
- Frozen or shared paths:
  - `src/modules/session/**` 仅允许为现有失效会话接口做调用层适配，不改会话真源语义
  - `src/modules/auth/**`
  - `src/modules/rd-subwarehouse/**`
  - `src/modules/inventory-core/**`
  - `src/modules/workflow/**`
- Task doc owner:
  - `assistant`
- Contracts that must not change silently:
  - `system-management` 仍是平台治理主题，不替代业务模块真源。
  - `consoleMode` 只负责壳层裁切，不替代授权。
  - 真实库存访问仍沿 `stockScope / workshopScope` 收口。
  - `admin` 仍保留全量兜底能力；`rd-operator` 仍固定在 RD 专属视角。

## Implementation Plan

- [x] Step 1: 新增 F4 requirement/task 锚点并同步主题/看板状态，固定本轮 acceptance criteria。
- [x] Step 2: 为 `rbac / system-management` 增加 Prisma 持久化快照模型与默认初始化状态，包含菜单/角色对业务权限的正式承接。
- [x] Step 3: 改造 `InMemoryRbacRepository` 与相关服务，使启动加载、CRUD 落盘、权限计算与现有会话失效逻辑兼容。
- [x] Step 4: 补 focused tests / 调整现有断言，执行必要验证并收口 docs，然后完成 commit。

## Review Log

- Validation results:
  - `pnpm prisma:generate`
  - `pnpm prisma:validate`
  - `pnpm typecheck`
  - `pnpm test -- src/modules/rbac/application/rbac.service.spec.ts src/modules/rbac/infrastructure/in-memory-rbac.repository.spec.ts`
  - `ReadLints` 检查本轮改动文件，无新增诊断错误。
- Findings:
  - No findings.
- Follow-up action:
  - None.

## Final Status

- Outcome:
  - 已完成 `system-management` 主题 `F4` 的最小完整落地：系统管理初始化状态已可持久化，业务权限已改为菜单/角色数据驱动。
- Requirement alignment:
  - 已满足“平台初始化与持久化方案落地”的本轮 acceptance criteria，并将 topic F4 状态同步为已完成。
- Residual risks or testing gaps:
  - 当前持久化采用 `SystemManagementSnapshot` 单行 JSON 快照，以最小改动换取持久化与初始化能力；若后续需要对平台对象做更细粒度 SQL 查询、审计或迁移，可能仍需再拆为规范化表结构。
  - 支持的权限目录与业务 routes 仍由代码受控，当前完成的是“角色/菜单分配持久化 + 初始化真源”，不是运行时自由发明新权限字符串。
- Directory disposition after completion: `retained-completed`
- Next action:
  - None.
