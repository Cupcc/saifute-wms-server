# Master Data Phase 1 Completion

> Reopened from `docs/tasks/archive/cleanup-candidate/task-20260402-1802-master-data-phase1-completion.md` by explicit user instruction on `2026-04-04`, then completed and re-archived in the same turn.

## Metadata

- Scope:
  - 完成 `master-data` `Phase 1` 的剩余能力 `F1/F2/F3/F5/F6/F7/F8`，以已验收的 `F4` 供应商 CRUD 为上游基线，收口 CRUD、停用守卫、active-only 查询、统一主数据查询能力与最小前端兼容层；明确排除 `F9` 物料库存预警与 `F10` 批量导入。
- Related requirement: `docs/requirements/domain/master-data-management.md (Phase 1: F1-F8)`
- Status: `accepted`
- Review status: `reviewed-clean`
- Delivery mode: `autonomous`
- Acceptance mode: `full`
- Acceptance status: `accepted`
- Complete test report required: `yes`
- Lifecycle disposition: `retained-completed`
- Planner: `planner`
- Coder: `coder`
- Reviewer: `code-reviewer`
- Acceptance QA: `acceptance-qa`
- Last updated: `2026-04-06`
- Related checklist: `None`
- Related acceptance spec: `docs/acceptance-tests/specs/master-data.md`
- Related acceptance run: `docs/acceptance-tests/runs/run-20260406-0043-master-data-f2-browser-qa.md`
- Related files:
  - `docs/requirements/domain/master-data-management.md`
  - `docs/architecture/modules/master-data.md`
  - `docs/acceptance-tests/specs/master-data.md`
  - `docs/tasks/archive/retained-completed/task-20260402-1758-master-data-f4-supplier-crud.md`
  - `prisma/schema.prisma`
  - `src/modules/master-data/**`
  - `src/modules/rbac/infrastructure/in-memory-rbac.repository.ts`
  - `web/src/api/base/**`
  - `web/src/utils/permissionCompat.js`
  - `test/**`

## Requirement Alignment

- Domain capability:
  - `docs/requirements/domain/master-data-management.md`
  - 本 task 只完成 `Phase 1` 的 `F1`~`F8`，不把 `F9/F10` 拉入本轮。
  - `F4` 供应商 CRUD 继续沿用 `docs/tasks/archive/retained-completed/task-20260402-1758-master-data-f4-supplier-crud.md` 的已验收基线，不重置设计口径。
- User intent summary:
  - 用户明确要求“这个 task 已经写好了，按照 task 完成就行”，因此本轮将归档草案恢复为 active handoff，并持续推进直到 review 与 acceptance 收口。
- Acceptance criteria carried into this task:
  - `[AC-1]` `MaterialCategory` 树形 CRUD 与停用前子分类 / 物料守卫。
  - `[AC-2]` `Material` 新增、修改、停用、正余额 / 生效单据守卫与受控自动补建。
  - `[AC-3]` `Customer / Supplier / Personnel / Workshop / StockScope` CRUD、停用后 active-only 行为可用，且 `Supplier` 无回归。
  - `[AC-4]` `master-data` 对外提供稳定的 active-only 查询 / 快照能力，不要求重写消费模块仓储。
  - `[AC-5]` 前端基础资料 API 兼容层与权限映射完成，不再依赖 `unsupportedBaseAction`。
  - `[AC-6]` 完整测试报告写回 `docs/acceptance-tests/specs/master-data.md`。

## Progress Sync

- Phase progress:
  - `master-data` `Phase 1` 的剩余能力已在本 task 中完成实现、review、修复回环与 full-mode acceptance。
- Current state:
  - `F1/F2/F3/F5/F6/F7/F8` 已完成并与 `F4` 基线一起收口为完整的 `Phase 1`。
- Acceptance state:
  - `accepted`
- Blockers:
  - None.
- Next step:
  - None. 已完成并归档。

## Goal And Acceptance Criteria

- Goal:
  - 在不扩写 domain 路线图的前提下，完成 `master-data` `Phase 1` 运行态交付：让主数据实体的 CRUD、active-only 查询、统一下拉 / 快照读取和最小前端兼容层全部达到可签收状态，并保持既有 `F4` 已验收行为不回归。
- Acceptance criteria:
  - `[AC-1]` `MaterialCategory` 完成树形 CRUD 与停用守卫。
  - `[AC-2]` `Material` 完成停用守卫与受控自动补建。
  - `[AC-3]` `Customer / Supplier / Personnel / Workshop / StockScope` CRUD 与 active-only 下拉行为可用。
  - `[AC-4]` `master-data` 对业务模块输出稳定的查询 / 快照能力。
  - `[AC-5]` 前端 API 适配层与权限兼容层收口完成。
  - `[AC-6]` 完整测试报告可逐条支撑 `Phase 1` 完成结论。

## Scope And Ownership

- Implemented code paths:
  - `src/modules/master-data/**`
  - `src/modules/rbac/**`（仅最小主数据权限兼容）
  - `web/src/api/base/**`
  - `web/src/utils/permissionCompat.js`
  - `test/**`
- Frozen or shared paths respected:
  - `docs/requirements/**`
  - `docs/architecture/**`
  - `docs/acceptance-tests/**`（仅由 acceptance 写入）
  - `src/shared/**`
  - `src/modules/inventory-core/**`
  - `src/modules/audit/**`
  - `web/src/views/**`
- Contracts preserved:
  - `inventory-core` 仍是唯一库存写入口。
  - `Workshop` 不被改造成独立库存池。
  - 持久化状态仍为 `ACTIVE | DISABLED`。
  - 自动补建仅保留在具备 provenance 字段的实体。

## Implementation Plan

- [x] 以已验收 `F4` 为基线盘点 `Phase 1` 剩余缺口。
- [x] 收口 `MaterialCategory / Material / Customer / Personnel / Workshop / StockScope` 的 repository / service / controller / DTO。
- [x] 补齐停用守卫、active-only 查询、受控自动补建与树形校验。
- [x] 收口 `F8` 的统一主数据查询能力与最小前端兼容层。
- [x] 补齐 focused tests、review 修复回环与 full-mode acceptance 证据。

## Coder Handoff

- Execution summary:
  - 新增 `MaterialCategory / Customer / Personnel / Workshop / StockScope` 的缺失 CRUD 与 DTO。
  - 为 `Material`、`StockScope` 补齐逐行正余额停用守卫，为 `Material` 补齐生效单据引用守卫。
  - 为 `MaterialCategory / Customer` 补齐 self-parent / cycle 校验。
  - 阻断 disabled canonical `StockScope / Workshop` 被新单据继续按 code / name 静默使用。
  - 收口 `web/src/api/base/{customer,personnel,workshop,material}.js` 与 `permissionCompat.js`，移除 in-scope `unsupportedBaseAction`。
  - 对齐 `test/master-data-supplier.e2e-spec.ts` 的负向账号，改为 `rd-operator` 以匹配当前 RBAC 真相。

## Reviewer Handoff

- Review outcome:
  - 第一轮 review 识别出 3 条 `important` finding：净额守卫可被正负抵消绕过、disabled canonical lookup 仍可用于新单据、树形实体缺少防环校验。
  - 修复后 re-review 通过，`Review status` 收口为 `reviewed-clean`。
- Focused validation that passed:
  - `pnpm test -- src/modules/master-data/application/master-data.service.spec.ts src/modules/master-data/infrastructure/master-data.repository.spec.ts src/modules/master-data/controllers/master-data.controller.spec.ts`
  - `pnpm test -- src/modules/inbound/application/inbound.service.spec.ts src/modules/customer/application/customer.service.spec.ts src/modules/project/application/project.service.spec.ts src/modules/workshop-material/application/workshop-material.service.spec.ts src/modules/rd-subwarehouse/application/rd-procurement-request.service.spec.ts src/modules/rd-subwarehouse/application/rd-handoff.service.spec.ts src/modules/rbac/application/rbac.service.spec.ts src/modules/rbac/application/workshop-scope.service.spec.ts`

## Parallelization Safety

- Status: `not safe`
- Reason:
  - 本 scope 同时跨越 `src/modules/master-data/**`、RBAC 权限面、web compat、测试与 acceptance 证据链，采用单 writer 顺序执行更安全。

## Review Log

- Validation results:
  - `pnpm prisma:validate` passed
  - `pnpm prisma:generate` passed
  - `env -u CAPTCHA_ENABLED pnpm verify` passed
  - `pnpm test:e2e` passed (`4` suites / `23` tests)
  - `pnpm --dir web build:prod` passed
  - `pnpm lint` 仍报仓库既有前端 / 工具链文件问题；本轮改动路径未新增 lint 报告
- Findings:
  - 第一轮的 3 条 `important` finding 已在修复回环后关闭。
- Follow-up action:
  - `None`

## Acceptance

- Acceptance status: `accepted`
- Acceptance QA:
  - `acceptance-qa`
- Acceptance date:
  - `2026-04-04`
- Complete test report:
  - `docs/acceptance-tests/specs/master-data.md`

### Acceptance Checklist

- [x] `[AC-1]` `MaterialCategory` 树形 CRUD 与停用校验完成
- [x] `[AC-2]` `Material` 停用守卫与自动补建审计完成
- [x] `[AC-3]` `Customer / Supplier / Personnel / Workshop / StockScope` CRUD 完成，且 `Supplier` 无回归
- [x] `[AC-4]` active-only 查询 / 快照能力稳定输出
- [x] `[AC-5]` 前端 API 兼容层与权限映射完成
- [x] `[AC-6]` 已形成完整测试报告并支持签收

### Acceptance Notes

- Acceptance path used: `full`
- Acceptance summary:
  - **最终判定 `accepted`**。`Phase 1`（`F1`~`F8`）由 unit、consumer regression、`pnpm test:e2e` 全量、`pnpm verify` 与 `web build:prod` 共同覆盖；`F4` 既有基线保留。
  - `test/redis-real-integration.e2e-spec.ts` 已确认通过；相关 Redis 连接拒绝日志属于用例内预期探测，不构成环境阻塞。
  - 供应商负向权限 e2e 已改为 `rd-operator`，与当前 RBAC 真相一致。
  - 2026-04-06 已补充自动化 browser 证据：`F4` 供应商与 `F2` 物料两条 smoke 已冻结到 acceptance run；其中 `F2` 额外识别出“空 `material_category` 前置会导致新增 500”的环境缺口，并通过最小 fixture 完成复验。

## Final Status

- Outcome:
  - `master-data` `Phase 1`（`F1`~`F8`）已完成交付、复核与 full-mode 验收，本 task 归档为 `retained-completed`。
- Requirement alignment:
  - 交付范围严格锁定在 `Phase 1`；`F9/F10` 保持未开始，`F4` 继续作为已验收子切片基线保留。
- Residual risks or testing gaps:
  - 仓库级 `pnpm lint` 仍未净，但为既有前端 / 工具链债务，非本 scope 引入。
  - `F2/F4` browser 证据已补充；其余 `Phase 1` 能力仍主要依赖 unit / consumer regression / build 证据。
- Directory disposition after completion:
  - archived under `docs/tasks/archive/retained-completed/`
- Next action:
  - None.
