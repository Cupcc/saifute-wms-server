# 车间领料单操作日志与单据变更历史

## Metadata

- Scope: `workshop-material` 领料单 `create / update / void`、`audit-log` 操作日志、共享审计历史数据模型、领料单详情变更记录
- Related requirement: `docs/requirements/domain/workshop-material-module.md (F5)`
- Status: `planned`
- Review status: `not-reviewed`
- Delivery mode: `standard`
- Acceptance mode: `full`
- Acceptance status: `not-assessed`
- Complete test report required: `yes`
- Lifecycle disposition: `active`
- Planner: `/root`
- Coder: `未分配`
- Reviewer: `未分配`
- Acceptance QA: `未分配`
- Last updated: `2026-09-22`
- Related checklist: `-`
- Related acceptance spec: `待实现后创建或补齐 workshop-material acceptance spec`
- Related acceptance run: `-`
- Related files: `docs/requirements/domain/workshop-material-module.md`、`docs/architecture/modules/workshop-material.md`、`docs/architecture/modules/audit-log.md`、`prisma/schema.prisma`、`src/modules/workshop-material/**`、`src/modules/audit-log/**`、`web/src/**`

## Requirement Alignment

- Domain capability: `F5` 领料单操作审计与变更历史。
- User intent summary: 让每次领料单新增、修改、作废都能回答“谁、何时、改了什么、为什么改、库存发生了什么变化”，并防止旧页面覆盖新版本。
- Acceptance criteria carried into this task:
  - `[AC-1]` 成功和失败的新增、修改、作废接口都有真实操作账号、时间、IP、请求编号和结果的操作日志。
  - `[AC-2]` 每次新增、修改、作废都有不可变业务历史，保存完整前后快照、版本号、原因和逐字段差异；数量、单价、金额按固定小数精度比较。
  - `[AC-3]` 明细通过稳定 `lineKey` 和显式旧行到新行映射对齐；同一物料多行、新增行、删除行、数据库 ID 重建均能正确展示。
  - `[AC-4]` 修改历史能关联旧出库、冲回、新出库和来源使用流水，能解释“冲回 98、重新出库 93、库存净增加 5”。
  - `[AC-5]` `expectedRevisionNo` 过期时返回 409；关键字段变化缺少修改原因时拒绝保存。
  - `[AC-6]` 历史写入、库存逆操作或重新出库任一步失败，改单事务整体回滚；失败请求仍保留操作日志。
  - `[AC-7]` 详情页提供变更记录，可按操作人、时间、物料筛选并展开完整版本、差异和关联流水；没有修改、删除、清空历史入口。
- Requirement evidence expectations: API / application tests、Prisma migration / repository tests、前端变更记录交互证据、至少一条 `98 → 93` 数量和 `11,466 → 10,881` 金额的完整验收记录。
- Open questions requiring user confirmation: `-`（本计划采用现有登录会话作为操作账号来源，`X-Request-Id` 作为请求编号，历史详情沿用现有车间物料详情权限模型。）

## Progress Sync

- Phase progress: `0/6` implementation phases complete; requirement and architecture docs have been updated.
- Current state: `planned`，等待编码任务按本执行计划落地。
- Acceptance state: `not-assessed`。
- Blockers: 无；生产 DDL 执行、历史回建范围和浏览器环境在编码阶段确认。
- Next step: 先完成 schema / migration 和领域快照、差异、明细映射设计，再接入领料改单事务。

## Goal And Acceptance Criteria

- Goal: 在不改变 `inventory-core` 唯一库存写入口和现有领料业务口径的前提下，为领料单建立可查询、不可伪造、与库存结果同事务的一等变更历史，并补齐 create / update / void 操作日志和版本冲突保护。
- Acceptance criteria:
  - `[AC-1]` 领料单三类接口均有成功 / 失败操作日志；日志含 `operatorId`、`operatorName`、`occurredAt`、IP、`requestId`、动作和结果。
  - `[AC-2]` `document_change_log` 保存 `documentType`、单据 ID / 号、`fromRevision`、`toRevision`、操作类型、原因、前后完整 JSON 快照、规范化字段差异和操作者快照。
  - `[AC-3]` 明细 `lineKey` 在改单前后保持；历史映射区分 `UNCHANGED / UPDATED / ADDED / REMOVED`，同物料多行不会串行。
  - `[AC-4]` `document_change_inventory_link` 可从历史打开旧出库流水、逆流水、新出库流水和来源占用；库存数量与净变化可复核。
  - `[AC-5]` 过期版本和缺少关键字段修改原因分别返回可识别的 409 / 400 错误。
  - `[AC-6]` 变更历史与逆操作 / 重放同一事务；历史写入失败不会留下已变更单据。
  - `[AC-7]` 详情页默认显示中文差异，支持操作人、时间、物料筛选和版本展开；历史只读。

## Scope And Ownership

- Allowed code paths:
  - `prisma/schema.prisma`、`prisma/migrations/**`
  - `src/modules/audit-log/**`
  - `src/modules/workshop-material/controllers/**`
  - `src/modules/workshop-material/application/**`
  - `src/modules/workshop-material/domain/**`
  - `src/modules/workshop-material/infrastructure/**`
  - `src/modules/workshop-material/dto/**`
  - 相关 `src/shared/**` request ID / actor context 适配
  - 领料单详情对应的 `web/src/views/**`、`web/src/api/**`
  - 对应单测、集成测试、验收 spec / run
- Frozen or shared paths: `inventory-core` 既有库存命令语义、`inventory_log` / `inventory_source_usage` 事实表、`approval` 轻审核口径、`workshop_material_order` 的业务单号和库存范围规则。
- Task doc owner: planner / parent；编码阶段 task 文档按 review / acceptance 结果更新。
- Contracts that must not change silently: 车间不是库存池；领料为主仓 `OUT`；`inventory-core` 是唯一库存写入口；领料存在有效退料下游时原有阻断规则继续生效；历史字段 `auditStatusSnapshot` 不与系统审计日志混淆。

## Implementation Plan

### Phase 1 — 数据模型与迁移

- [ ] 为 `workshop_material_order_line` 增加稳定 `lineKey`（已有数据按行生成并回填，新增行由服务端生成），保留 `lineNo` 展示和排序语义。
- [ ] 新增 `document_change_log`：单据族 / 类型、单据 ID / 号、操作类型、前后版本、原因、操作者 ID / 账号、时间、IP、`requestId`、`beforeSnapshot`、`afterSnapshot`、`fieldDiff`、来源标记。
- [ ] 新增 `document_change_line_map`：变更历史 ID、旧 / 新行数据库 ID、旧 / 新 `lineKey`、旧 / 新物料快照、映射类型、旧 / 新数量和金额快照；允许 `ADDED` / `REMOVED` 一侧为空。
- [ ] 新增 `document_change_inventory_link`：变更历史 ID、可空 `inventoryLogId`、可空 `sourceUsageId`、关联角色（`OLD_OUTBOUND`、`REVERSAL`、`NEW_OUTBOUND`、`SOURCE_USAGE`）、行映射键和 `reversalOfLogId` 快照；同一行只能指向一种事实对象，避免把来源使用记录 ID 误当库存流水 ID。
- [ ] 为历史查询建立 `(documentType, documentId, occurredAt)`、`operatorId / occurredAt`、物料映射和流水关联索引；历史表不设置普通更新 / 删除业务接口。
- [ ] 为 `sys_oper_log` 增加可检索 `requestId`（如当前实现没有通用请求编号字段），保持已有载荷脱敏和长度限制。

### Phase 2 — 快照、差异和映射领域服务

- [ ] 把领料单表头和明细规范化为可序列化业务快照；Decimal 按数量 6 位、金额 / 单价 4 位 canonicalize 后比较，避免 `93` 与 `93.000000` 产生假差异。
- [ ] 首选 `lineKey` 对齐新旧明细；旧数据无 `lineKey` 时只允许唯一候选匹配，出现同物料多行歧义则拒绝静默推断并记录可诊断错误。
- [ ] 生成中文字段元数据与机器可读 `fieldDiff`：表头（日期、车间、经办人、备注等）、明细（物料、数量、单价、金额、单位、明细备注）以及 `ADDED / REMOVED` 行。
- [ ] 建立 create `null → v1`、update `vN → vN+1`、void `vN → VOID` 的统一历史命令；快照写入完整嵌套数据，不依赖 `sys_oper_log` 的深度截断序列化。

### Phase 3 — 领料单事务与乐观锁

- [ ] 扩展 update DTO：`expectedRevisionNo` 必填，`changeReason` 条件必填；扩展 void DTO：`expectedRevisionNo` 和 `voidReason` 必填。
- [ ] 控制器把 `SessionUserSnapshot`、请求 IP 和 `requestId` 组成 actor context 传入 application；业务上的 handler / 经办人继续单独保存。
- [ ] 在同一事务中按顺序执行：读取并锁定当前版本 → 检查期望版本和有效退料下游 → 保存旧快照 / 旧行 → 逆转旧出库并释放来源 → 写入新主从数据和稳定 `lineKey` → 重新出库 / 分配来源 → 生成行映射和逐字段差异 → 写入历史及库存关联 → 提交 revision。
- [ ] 任何历史写入、逆操作、来源释放或重新出库异常都回滚整个改单；作废沿用逆操作语义并写 `VOID` 历史。
- [ ] 以数据库条件更新或行锁保证版本检查原子性，冲突映射为 HTTP 409，响应要求前端刷新。

### Phase 4 — 操作日志接入与请求关联

- [ ] 为 `POST /workshop-material/pick-orders`、`PUT /workshop-material/pick-orders/:id`、`POST /workshop-material/pick-orders/:id/void` 增加 `@AuditLog` 标题和稳定 action code。
- [ ] 引入 `X-Request-Id`：客户端传入则校验并复用，缺失则服务端生成并回写响应；操作日志和业务变更历史使用同一编号。
- [ ] 成功路径由 interceptor 记录结果；业务异常记录失败原因、接口动作和 actor；不把完整明细依赖放大的操作日志载荷，完整内容以业务历史查询为准。
- [ ] 失败发生在 DTO 校验或控制器之前时，确认全局异常 / 请求日志链路仍能留下失败操作记录；若现有 interceptor 覆盖不到，补最小范围的请求审计适配。

### Phase 5 — 查询 API 与详情页

- [ ] 增加 `GET /workshop-material/pick-orders/:id/change-history`，支持 `operatorId / operatorName`、时间范围、物料 ID / 编码、分页；返回版本头、中文差异、快照摘要和流水链接。
- [ ] 增加历史详情查询，按需展开完整前后快照、行映射和库存关联；默认列表不加载大 JSON，避免页面性能退化。
- [ ] 领料单详情增加“变更记录”入口，显示“第 2 版 → 第 3 版”、操作账号、时间、修改原因、数量 / 金额差异和“冲回 / 重新出库 / 净变化”；业务领料人 / 经办人单独展示。
- [ ] 版本冲突返回后保留用户编辑内容，提示刷新并允许重新基于最新版本提交，避免旧页面整单覆盖。
- [ ] 仅提供查询权限；不提供历史修改、删除、清空按钮或后端路由。

### Phase 6 — 历史数据、验证和发布

- [ ] 先备份目标库，盘点现有领料单、`inventory_log`、`inventory_source_usage` 和有效退料下游；历史回建脚本只生成“依据库存流水重建”记录，不虚构操作账号 / 原因。
- [ ] 为快照 canonicalization、重复物料行映射、版本冲突、事务回滚、操作日志成功 / 失败、流水关联和权限查询补 focused tests。
- [ ] 执行 `bun run prisma:validate`、`bun run prisma:generate`、相关 Jest、`bun run typecheck`、`bun run lint`、后端构建和前端构建。
- [ ] 在 dev / staging 浏览器完成新增 → 修改 `98 → 93` → 查看历史 → 作废 / 失败冲突路径；确认数量差 `-5`、金额差 `-585`、库存净变化 `+5` 与流水一致。
- [ ] 生产 DDL、部署产物和回滚快照按现有发布门禁执行；发布后做 API 健康检查和真实单据只读核对。

## Coder Handoff

- Execution brief: 按上述六个阶段先完成可迁移的数据模型和领域服务，再接入领料改单事务、操作日志、查询 API 和详情页；不要把完整快照塞进现有 `sys_oper_log` 的截断载荷。
- Required source docs or files: `docs/requirements/domain/workshop-material-module.md (F5)`、`docs/architecture/modules/workshop-material.md`、`docs/architecture/modules/audit-log.md`、`docs/architecture/20-wms-database-tables-and-schema.md`、`src/modules/workshop-material/application/workshop-material-pick.service.ts`、`src/modules/audit-log/interceptors/operation-log.interceptor.ts`。
- Owned paths: 本 task 的 allowed code paths；schema 与 migration 由单一 coder 负责，避免 Prisma 关系冲突。
- Forbidden shared files: 不得改写 `inventory-core` 库存事实语义、删除现有 `sys_oper_log` 脱敏限制、改变 `approval` 状态含义或绕过现有 `WorkshopScopeService`。
- Constraints and non-goals: 首期只做领料单；不扩展退料 / 报废 / 入库 / 销售出库，不提供历史删除接口，不以物料编码单独匹配重复明细。
- Validation command for this scope: `bun run prisma:validate && bun run prisma:generate && bun run typecheck && bun run lint`，另加 workshop-material / audit-log focused Jest、web workspace build 和 full acceptance。

## Reviewer Handoff

- Review focus: 事务是否覆盖“逆转旧库存 → 重放新库存 → 历史写入”；版本检查是否原子；明细映射是否能处理同物料多行；操作账号是否与业务经办人分离；历史数据是否不可变；是否仍保留敏感数据保护。
- Requirement alignment check: 逐条对照 F5 `[TC-1..7]` 与本 task `[AC-1..7]`，检查新增、修改、作废三条接口和成功 / 失败路径。
- Final validation gate: Prisma schema / migration、focused tests、typecheck、lint、后端构建、web build、浏览器 full acceptance 和一条真实或可复现的 `98 → 93` 证据。
- Required doc updates: 回写本 task 的 Progress / Review / Acceptance；实现后更新领域 F5 状态、需求中心、架构表设计和 acceptance spec。

### Acceptance Evidence Package

- Covered criteria: `[AC-1..7]`。
- Evidence pointers: 待实现后填写 migration、API / service tests、UI 截图或浏览器 run、流水关联查询和版本冲突响应。
- Evidence gaps, if any: 当前仅完成规划，尚无实现证据。
- Complete test report requirement: `yes`

### Acceptance Test Expectations

- Acceptance mode: `full`
- User-visible flow affected: `yes`
- Cross-module write path: `yes`（workshop-material → inventory-core → audit-log / shared request context）
- Irreversible or high-cost business effect: `yes`（库存逆操作、来源释放、生产 DDL）
- Existing automated user-flow coverage: `partial`（已有领料生命周期单测，无变更历史和浏览器审计流）
- Browser test required: `yes`
- Browser waiver reason: `-`
- Related acceptance cases: `待创建`，至少覆盖新增、改单差异、作废、409 冲突、失败回滚和历史筛选。
- Related acceptance spec: `待创建或扩展 docs/acceptance-tests/specs/workshop-material.md`
- Separate acceptance run required: `optional`（若生产数据回建或发布需要独立证据则创建）
- Complete test report required: `yes`
- Required regression / high-risk tags: `workshop-material`, `inventory-side-effect`, `audit-history`, `optimistic-lock`, `decimal-diff`, `browser`
- Suggested environment / accounts: dev / staging 领料权限账号、可访问详情和审计历史权限的管理员账号、包含重复物料行和有效退料下游的测试单据。
- Environment owner / setup source: 项目 dev / staging 环境；由验收阶段确认数据准备。

## Parallelization Safety

- Status: `not-safe-for-multiple-writers`
- If safe, list the exact disjoint writable scopes: `-`
- If not safe, list the shared files or contracts that require a single writer: `prisma/schema.prisma`、migration、`workshop-material` 事务服务、request ID / actor context、前端详情合同；这些路径共享模型和 API 契约，应由单一 coder 顺序落地。

## Review Log

- Validation results: docs-only planning pass；已读取现有 workshop-material / audit-log / schema 基线，未运行代码测试。
- Findings: 待编码后 review；当前已知高风险为明细 ID 重建、旧库存逆操作与历史写入事务边界、操作日志截断误用。
- Follow-up action: 编码完成后进入 code-reviewer，再按 blocking / important findings 修复并重跑 full acceptance。

## Acceptance

- Acceptance status: `not-assessed`
- Acceptance QA: `未开始`
- Acceptance date: `-`
- Complete test report: `待实现`

### Acceptance Checklist

- [ ] `[AC-1]` criterion text — Evidence: 待实现 — Verdict: `not-assessed`
- [ ] `[AC-2]` criterion text — Evidence: 待实现 — Verdict: `not-assessed`
- [ ] `[AC-3]` criterion text — Evidence: 待实现 — Verdict: `not-assessed`
- [ ] `[AC-4]` criterion text — Evidence: 待实现 — Verdict: `not-assessed`
- [ ] `[AC-5]` criterion text — Evidence: 待实现 — Verdict: `not-assessed`
- [ ] `[AC-6]` criterion text — Evidence: 待实现 — Verdict: `not-assessed`
- [ ] `[AC-7]` criterion text — Evidence: 待实现 — Verdict: `not-assessed`

### Acceptance Notes

- Acceptance path used: `full`
- Acceptance summary: 规划阶段未验收。
- Report completeness check: 尚无实现和测试证据。
- If rejected or blocked: `-`
- If conditionally accepted: `-`

## Final Status

- Outcome: `planned`，文档和执行计划已落地，等待编码。
- Requirement alignment: 已绑定 `workshop-material F5`，并同步领域 / 架构 / 看板入口。
- Residual risks or testing gaps: schema migration、生产历史回建、请求编号覆盖范围、浏览器数据准备和全链路回滚测试仍待完成。
- Directory disposition after completion: `active`，实现、review、acceptance 完成后再按 task 生命周期归档。
- Next action: 分配单一 coder 开始 Phase 1，完成 schema / migration 评审后继续 Phase 2。
