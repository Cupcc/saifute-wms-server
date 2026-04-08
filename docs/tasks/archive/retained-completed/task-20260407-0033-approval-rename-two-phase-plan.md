# approval semantic rename two-phase plan

## Metadata

- Scope: `audit` 业务审核域向 `approval` 语义收敛，拆分为代码命名切换与数据库持久化切换两个可独立运行阶段
- Related requirement: `docs/requirements/domain/approval-module.md (F1,F2,F3)`
- Status: `completed`
- Review status: `reviewed-clean`
- Delivery mode: `standard`
- Acceptance mode: `light`
- Acceptance status: `accepted`
- Complete test report required: `no`
- Lifecycle disposition: `retained-completed`
- Planner: `Codex`
- Coder: `Codex`
- Reviewer: `Codex`
- Acceptance QA: `waived-by-user`
- Last updated: `2026-04-07`
- Related checklist: `-`
- Related acceptance spec: `-`
- Related acceptance run: `-`
- Related files:
  - `docs/architecture/00-architecture-overview.md`
  - `docs/architecture/modules/approval.md`
  - `docs/architecture/modules/audit-log.md`
  - `docs/architecture/20-wms-database-tables-and-schema.md`
  - `docs/requirements/domain/approval-module.md`
  - `prisma/schema.prisma`
  - `src/modules/audit/**`
  - `src/modules/audit-log/**`
  - `src/modules/rbac/application/rbac.service.ts`
  - `src/app.module.ts`

## Requirement Alignment

- Domain capability: `docs/requirements/domain/approval-module.md (F1,F2,F3)`
- User intent summary: 以低风险方式把当前承载“单据审核/审批”语义的 `audit` 模块收敛为 `approval`，避免与系统审计日志 `audit-log` 混淆，并把代码侧与数据库侧变更拆成两个都可完整运行的阶段。
- Acceptance criteria carried into this task:
  - 在不改变审核业务规则的前提下，明确 `approval` 为业务审核域的规范命名，`audit-log` 继续保留为系统审计日志真源。
  - 第一阶段只完成代码 / API / 文档 / 权限的规范命名与兼容层，不要求数据库物理改名。
  - 第二阶段完成数据库持久化改名与切换，但不得要求回滚到“大爆炸式”同日重构。
  - 每个阶段都必须给出独立可运行理由、验证门槛与回退边界。
- Requirement evidence expectations: 代码命名切换前后的 focused 自动化验证、路由/权限兼容证据、Prisma schema 验证、数据库切换 rehearsal 或 backfill 校验记录。
- Open questions requiring user confirmation:
  - 本两阶段方案默认不重命名单据主表分散存在的 `auditStatusSnapshot` 字段和 `AuditStatusSnapshot` enum，只处理专属审核域模块与专属审核表；如果要一并重命名，这会显著扩大范围并不再属于低风险切换。

## Progress Sync

- Phase progress: `Phase 1 implemented; Phase 2 implemented, executed on target DB, and cleanup frozen`
- Current state: `approval` 已成为代码/API/Prisma canonical 命名；legacy /audit/documents/**、audit:document:* 与数据库 approval_document compatibility view 均已保留；schema/runtime 已切到 approval_document，并已清理 approval 内部的过渡 shim，仅在 src/modules/audit/** 保留显式 compatibility wrapper`
- Acceptance state: `accepted`
- Blockers: `None for this task; global typecheck noise remains in unrelated workshop-material / stock-scope-phase2 files`
- Next step: `None.`

## Goal And Acceptance Criteria

- Goal: 在不打断现有审核流程与审计日志能力的前提下，把业务审核域从 `audit` 语义低风险迁移到 `approval`，并将数据库专属持久化从 `approval_document` 收敛到 `approval_document`。
- Acceptance criteria:
  - `[AC-1]` Phase 1 完成后，业务审核域在代码、模块、文档与对外 canonical API 上统一以 `approval` 命名；`audit-log` 仍独立表示系统审计日志。
  - `[AC-2]` Phase 1 完成后，既有依赖 `audit:document:*` 权限码和 `/audit/documents/**` 路由的调用方仍可工作，数据库仍继续使用现有 `approval_document` 持久化，不需要数据迁移。
  - `[AC-3]` Phase 2 完成后，专属审核持久化完成到 `approval_document` / `ApprovalDocument` 的切换，应用在新 schema 上可独立运行，并有明确 rehearsal、backfill 校验和回退方案。
  - `[AC-4]` 两个阶段都提供 focused 自动化 gate；任一阶段完成后都可以单独构建、启动、运行主要审核协作链路，而不依赖另一阶段尚未完成的代码或 schema 改动。

## Scope And Ownership

- Allowed code paths:
  - Phase 1: `src/modules/audit/**`、新增或替代的 `src/modules/approval/**`、`src/app.module.ts`、`src/modules/rbac/application/rbac.service.ts`、直接依赖审核模块的业务模块、相关文档
  - Phase 2: 上述 Phase 1 代码面 + `prisma/schema.prisma`、Prisma generated client、必要的 migration / data-fix / rehearsal 脚本
- Frozen or shared paths:
  - `src/modules/audit-log/**` 语义不得改成 approval，也不得改坏现有日志路由
  - `inventory-core` 写路径与业务审核结果语义不得发生行为改变
  - `docs/tasks/**` 由父级/主代理持有；实施阶段只按 task doc 执行
- Task doc owner: `parent`
- Contracts that must not change silently:
  - 审核动作语义：`create / approve / reject / reset`
  - `audit-log` 的 `/audit/login-logs`、`/audit/oper-logs` 与日志权限码
  - 审核业务不直接写库存、不接管业务主状态的既有约束
  - 现有客户端若仍调用 `/audit/documents/**` 或 `audit:document:*`，在 Phase 1 不得无声失效

## Implementation Plan

- [x] Step 1: Phase 1 代码侧 canonical rename。引入 `approval` 作为业务审核域的规范命名，重命名模块/服务/DTO/文档/route tree/权限别名；同时保留 legacy `/audit/documents/**` 与 `audit:document:*` 兼容入口，底层继续绑定现有 `approval_document`。
- [x] Step 2: Phase 1 稳定化 gate。补足 focused 测试与兼容验证，确认依赖模块仍通过 `ApprovalService` 协作但不要求数据库改名，部署后可在现有 schema 上独立运行。
- [x] Step 3: Phase 2 持久化切换。将专属审核持久化改为 `approval_document` / `ApprovalDocument`，完成 schema 迁移、兼容 view、Prisma client 切换与回退脚本。
- [x] Step 4: Phase 2 清理冻结。移除内部对 `approval_document` 的专属持久化依赖，补充 cutover 文档与校验证据；legacy HTTP/permission alias 收敛为显式 compatibility layer，不再散落在 `approval` 主实现中。

## Coder Handoff

- Execution brief:
  - 先交付 Phase 1，不碰数据库物理名称，先把业务审核域的 canonical 入口统一到 `approval`。
  - Phase 1 合并并稳定后，再做 Phase 2 的数据库 rename/cutover；Phase 2 不与 Phase 1 并行。
  - 如果执行中发现必须连带重命名单据主表 `auditStatusSnapshot`、Prisma enum `AuditStatusSnapshot` 或大面积 migration projection 字段，必须先回到 planning 重新定 scope。
- Required source docs or files:
  - `docs/requirements/domain/approval-module.md`
  - `docs/architecture/modules/approval.md`
  - `docs/architecture/modules/audit-log.md`
  - `docs/architecture/20-wms-database-tables-and-schema.md`
  - `prisma/schema.prisma`
  - `src/modules/audit/**`
  - `src/modules/audit-log/**`
  - `src/modules/rbac/application/rbac.service.ts`
  - 直接依赖审核协作的业务模块与其 spec
- Owned paths:
  - Phase 1: `src/modules/audit/**`、新增 `src/modules/approval/**`、`src/app.module.ts`、`src/modules/rbac/application/rbac.service.ts`、相关业务模块 import 使用点、相关 architecture / requirement docs
  - Phase 2: Phase 1 owned paths + `prisma/schema.prisma`、Prisma generated output、必要 migration / rehearsal 脚本
- Forbidden shared files:
  - `docs/tasks/**`
  - 与本次 rename 无关的业务域实现
  - `src/modules/audit-log/**` 中审计日志语义本身
- Constraints and non-goals:
  - 不改变审核通过/拒绝/重置的业务行为与事务边界
  - 不把 `audit-log` 重命名为 `approval-log`
  - 不在本两阶段中重命名分散在各单据表的 `auditStatusSnapshot` 字段、enum 和历史 migration fixtures
  - 不在 Phase 1 直接删掉 legacy route / permission 入口
  - Phase 2 的数据库切换必须先有 rehearsal/backfill 校验，再做 cleanup
- Validation command for this scope:
  - Phase 1:
    - `pnpm prisma:validate`
    - `pnpm typecheck`
    - `pnpm test -- --runInBand src/modules/audit/application/audit.service.spec.ts src/modules/inbound/application/inbound.service.spec.ts src/modules/customer/application/customer.service.spec.ts src/modules/workshop-material/application/workshop-material.service.spec.ts src/modules/rbac/application/rbac.service.spec.ts`
    - 新增或更新针对 `/approval/documents/**` 与 legacy `/audit/documents/**` 双入口的 focused controller/e2e 覆盖
  - Phase 2:
    - `pnpm prisma:validate`
    - `pnpm prisma:generate`
    - `pnpm typecheck`
    - 复跑 Phase 1 focused suites
    - migration rehearsal / backfill verification（SQL 对账或脚本校验）必须留存结果
- If parallel work is approved, add one subsection per writer with the same fields:
  - `not approved`; 见下方 Parallelization Safety

## Reviewer Handoff

- Review focus:
  - `approval` 是否真正成为业务审核域 canonical 名称，而 `audit-log` 是否仍保持日志语义
  - Phase 1 是否保住 legacy 路由/权限兼容，不把兼容层遗漏到 controller、guard 或 route tree
  - Phase 2 是否只切专属持久化，而没有误伤分散业务表字段或 migration baseline
  - Prisma model/table rename 是否有回退边界，是否避免生成代码与 schema 脱节
- Requirement alignment check:
  - 只重命名语义与持久化，不改审核业务规则
  - 每个阶段都必须可在本阶段完成后独立启动和验证
- Final validation gate:
  - Phase 1 focused gate 全绿后才允许进入 Phase 2
  - Phase 2 必须同时通过应用验证与数据对账验证
- Required doc updates:
  - `docs/architecture/00-architecture-overview.md`
  - `docs/architecture/modules/approval.md`
  - `docs/architecture/modules/audit-log.md`（仅交叉引用，不改日志语义）
  - `docs/architecture/20-wms-database-tables-and-schema.md`
  - `docs/requirements/domain/approval-module.md` 或等价 requirement 真源中对 canonical 名称的说明

### Acceptance Evidence Package

- Covered criteria:
  - `[AC-1]` `approval` canonical 命名落地
  - `[AC-2]` Phase 1 兼容层仍工作
  - `[AC-3]` Phase 2 数据库切换完成且可回退
  - `[AC-4]` 两阶段均有独立运行证据
- Evidence pointers:
  - focused Jest / e2e 输出
  - Prisma validate / generate 输出
  - migration rehearsal / backfill verification 结果
  - 文档更新 diff
- Evidence gaps, if any:
  - Phase 2 如缺少 rehearsal 或对账结果，不得视为完成
- Complete test report requirement: `no`

### Acceptance Test Expectations

- Acceptance mode: `light`
- User-visible flow affected: `yes`
- Cross-module write path: `yes`
- Irreversible or high-cost business effect: `yes`
- Existing automated user-flow coverage: `partial`
- Browser test required: `no`
- Browser waiver reason: `本任务主要影响后端命名、路由兼容和数据库持久化切换，重点证据应来自 API/权限/Prisma/migration 验证，而非前端交互样式`
- Related acceptance cases:
  - `approval` canonical route 可用
  - legacy `audit` route 兼容可用
  - 权限 alias 生效
  - Phase 2 数据切换后 approval 查询与动作仍正常
- Related acceptance spec: `-`
- Separate acceptance run required: `optional`
- Complete test report required: `no`
- Required regression / high-risk tags: `approval-rename`, `route-compat`, `permission-alias`, `prisma-cutover`
- Suggested environment / accounts: `本地 dev DB + 具备审核权限的系统管理员账号`
- Environment owner / setup source: `repo local env`

## Parallelization Safety

- Status: `not_safe`
- If safe, list the exact disjoint writable scopes:
  - `-`
- If not safe, list the shared files or contracts that require a single writer:
  - `prisma/schema.prisma`
  - `src/app.module.ts`
  - `src/modules/rbac/application/rbac.service.ts`
  - `src/modules/audit/**` 与未来 `src/modules/approval/**` 的搬迁边界
  - 跨 `inbound` / `customer` / `workshop-material` 的 shared approval contract

## Review Log

- Validation results:
  - `pnpm exec jest --runInBand src/modules/audit/application/audit.service.spec.ts src/modules/approval/controllers/approval.controller.spec.ts src/modules/customer/application/customer.service.spec.ts src/modules/inbound/application/inbound.service.spec.ts src/modules/inbound/application/stock-in-price-correction.service.spec.ts src/modules/rbac/application/rbac.service.spec.ts` ✅ `6` suites / `53` tests passed
  - `pnpm exec biome check ...`（Phase 1 新增与兼容层文件）✅ passed
  - `DATABASE_URL='mysql://placeholder:placeholder@127.0.0.1:3306/saifute-wsm' pnpm prisma:generate` ✅ passed
  - `DATABASE_URL='mysql://placeholder:placeholder@127.0.0.1:3306/saifute-wsm' pnpm prisma:validate` ✅ schema valid
  - `pnpm exec biome check package.json prisma/schema.prisma src/modules/approval/application/approval.service.ts src/modules/approval/infrastructure/approval.repository.ts src/modules/audit/application/audit.service.spec.ts test/prisma-e2e-stub.ts scripts/migration/approval-document-phase2/*.ts` ✅ passed
  - `pnpm migration:approval-document-phase2:cutover` ✅ target DB `saifute-wsm` 已将 `approval_document` base table rename 到 `approval_document`，并创建 `approval_document` compatibility view；report=`scripts/migration/reports/approval-document-phase2-cutover-report.json`
  - `pnpm migration:approval-document-phase2:rehearsal` ✅ 通过 `approval_document` view 完成 insert/update/delete rehearsal，并在 rollback 后保持计数不变；report=`scripts/migration/reports/approval-document-phase2-rehearsal-report.json`
  - `pnpm migration:approval-document-phase2:validate` ✅ target DB 当前状态为 `approval_document` base table + `approval_document` view，列与行数一致；report=`scripts/migration/reports/approval-document-phase2-validate-report.json`
  - `pnpm typecheck` ⚠️ blocked by pre-existing `src/modules/workshop-material/application/workshop-material.service.spec.ts` compile errors
  - `pnpm exec tsc --noEmit --pretty false 2>&1 | rg -n "approval-document-phase2|approval\\.service|approval\\.repository|ApprovalDocument|audit\\.service\\.spec|prisma-e2e-stub"` ✅ no approval-rename diagnostics surfaced in full typecheck output
  - `pnpm exec tsc --noEmit --pretty false 2>&1 | rg -n "src/modules/(approval|audit)|test/prisma-e2e-stub"` ✅ no diagnostics surfaced for cleaned approval/audit modules or Prisma stub
  - `pnpm migration:typecheck` ⚠️ blocked by pre-existing `scripts/migration/stock-scope-phase2/migrate.ts:452` compile error
  - `pnpm exec tsc -p tsconfig.migration.json --noEmit --pretty false 2>&1 | rg -n "approval-document-phase2"` ✅ no approval-document-phase2 diagnostics surfaced in migration typecheck output
- Findings:
  - Phase 1 已完成 canonical `approval` 模块引入、legacy `audit` 导出兼容、legacy `/audit/documents/**` controller 兼容、RBAC 权限 alias 扩展和 seed canonical 权限切换
  - Phase 2 已完成 `ApprovalDocument` / `approval_document` schema 与 runtime 切换，并新增 `cutover / rehearsal / validate / rollback` 数据库脚本；legacy `approval_document` 通过 compatibility view 保住历史 SQL 合同
  - Step 4 已完成内部清理：`ApprovalService` / `ApprovalRepository` 不再承载旧 `audit*` 方法或 `auditDocument` delegate fallback；旧接口已收敛到 `src/modules/audit/**` 的显式 compatibility wrapper
  - 首次真实库 rehearsal 暴露出 MariaDB 通过 updatable view 写入时需要显式提供底表无默认值列；已修正 rehearsal 脚本为显式写入 `resetCount`、`createdAt`、`updatedAt`，随后重跑通过
  - `workshop-material` 全文件 spec 与 `stock-scope-phase2` migration 脚本现有断裂导致全量 gate 仍不能作为本 task 结论依据；本次 focused gate 已排除该既有噪音
- Follow-up action: `None.`

## Acceptance

- Acceptance status: `accepted`
- Acceptance QA:
  - `waived-by-user`
- Acceptance date:
  - `2026-04-07`
- Complete test report:
  - `2026-04-07`: focused Jest、Prisma generate/validate、target DB `cutover/rehearsal/validate`、cleanup freeze verification 已完成；未追加独立 browser acceptance。

### Acceptance Checklist

> Acceptance QA 在验收时逐条填写。每条应对应 domain capability 的用户需求或 task doc 的 `[AC-*]` 条目。

- [x] `[AC-1]` `approval` 成为业务审核域 canonical 命名 — Evidence: `src/modules/approval/**` canonical implementation + `docs/architecture/**` / `docs/requirements/**` terminology alignment — Verdict: `✓ met`
- [x] `[AC-2]` Phase 1 legacy route / permission 兼容仍成立 — Evidence: `src/modules/approval/controllers/audit-compatibility.controller.ts` + `src/modules/rbac/application/rbac.service.ts` + focused Jest `6` suites / `53` tests passed — Verdict: `✓ met`
- [x] `[AC-3]` Phase 2 `approval_document` 持久化切换完成且可回退 — Evidence: target DB reports `approval-document-phase2-cutover-report.json` / `rehearsal-report.json` / `validate-report.json` + rollback script in `scripts/migration/approval-document-phase2/rollback.ts` — Verdict: `✓ met`
- [x] `[AC-4]` 两阶段均有独立运行与验证证据 — Evidence: Phase 1 focused Jest gate + Phase 2 Prisma generate/validate + target DB cutover/rehearsal/validate + Step 4 cleanup verification — Verdict: `✓ met`

### Acceptance Notes

- Acceptance path used: `light`
- Acceptance summary: `approval` 已作为业务审核域 canonical 名称落地；`approval_document` 已成为 schema/runtime/target DB 真源；legacy audit HTTP / permission / SQL 兼容入口仍工作且已收敛为明确 wrapper / view 边界。
- Report completeness check: `complete`
- If rejected or blocked: root cause（`requirement-misunderstanding` | `implementation-gap` | `evidence-gap` | `environment-gap`）+ 精确修复指引 / 环境修复指引
- If conditionally accepted: follow-up requirement / task:
  - `None.`

## Final Status

- Outcome: `Phase 1 implemented; Phase 2 implemented in repo, executed on target DB, and cleanup-frozen with approval_document canonical persistence plus explicit audit compatibility wrappers`
- Requirement alignment: `approval 已成为业务审核域 canonical 语义，数据库 schema/runtime/target DB 均已切到 approval_document；audit HTTP / permission / SQL 兼容入口被保留为明确边界，而不是继续散落在主实现中；未改变审核业务规则`
- Residual risks or testing gaps:
  - 是否要继续追求全仓库级别的 `auditStatusSnapshot` / enum 全量改名仍待用户确认
  - 全量 `pnpm typecheck` / `workshop-material` spec 仍受既有断裂阻塞，需单独清理
  - `pnpm migration:typecheck` 仍受既有 `stock-scope-phase2` 编译错误阻塞，需单独清理
  - target DB 当前 `approval_document` / `approval_document` 行数均为 `0`；后续需要在产生真实审核投影数据后继续观察 compatibility view 下的日常写入表现
- Directory disposition after completion: `archive to retained-completed`
- Next action: `None.`
