# Monthly Reporting Phase 1 Delivery

## Metadata

- Scope:
  - 完成 `docs/requirements/domain/monthly-reporting.md` 的 `Phase 1`，只交付仓库侧“本期发生金额”月度对账能力，不提前实现正式月报冻结、人工重算、日期范围报表等后续阶段语义。
  - 在现有 `reporting` 只读模块内扩展月度对账汇总、主题下钻、异常标识和 `Excel` 导出，复用既有 `inventory_log`、业务单据主表和前端报表中心壳层。
  - 覆盖 requirement 中已冻结的 `F1/F2/F3/F4/F5`，并保持 `reporting` 只读定位，不新增事务写模型。
- Related requirement: `docs/requirements/domain/monthly-reporting.md (F1,F2,F3,F4,F5)`
- Status: `completed`
- Review status: `reviewed`
- Delivery mode: `autonomous`
- Acceptance mode: `full`
- Acceptance status: `accepted`
- Complete test report required: `yes`
- Lifecycle disposition: `retained-completed`
- Planner: `saifute-planner`
- Coder: `coder`
- Reviewer: `code-reviewer`
- Acceptance QA: `acceptance-qa`
- Last updated: `2026-04-11`
- Related checklist: `-`
- Related acceptance spec: `docs/acceptance-tests/specs/monthly-reporting.md`
- Related acceptance run: `docs/acceptance-tests/runs/run-20260411-0904-monthly-reporting-phase1.md`
- Related files:
  - `docs/requirements/domain/monthly-reporting.md`
  - `docs/requirements/REQUIREMENT_CENTER.md`
  - `docs/architecture/00-architecture-overview.md`
  - `docs/architecture/modules/reporting.md`
  - `docs/architecture/20-wms-database-tables-and-schema.md`
  - `docs/workspace/notes/reporting-requirements-deep-interview.md`
  - `prisma/system-management.seed.ts`
  - `src/modules/reporting/**`
  - `src/modules/rbac/**`（仅权限 / 菜单 / fallback 需要时）
  - `web/src/api/reporting.js`
  - `web/src/views/reporting/**`
  - `web/src/store/modules/permission.js`
  - `test/**`
  - `docs/acceptance-tests/**`

## Requirement Alignment

- Domain capability:
  - `docs/requirements/domain/monthly-reporting.md (F1,F2,F3,F4,F5)`
  - 当前 requirement 已明确 `Phase 1` 真源是“仓库侧本期发生金额月度对账”，不是旧版“月报总纲”。
- User intent summary:
  - 用户要求直接完成 `monthly-reporting` 文档中的 `Phase 1`，不能停在计划或半成品。
  - 当前仓库已有 `reporting` 只读模块、导出能力和报表前端骨架，但缺少月度对账切面、主题映射、单据头下钻和 `Excel` 导出。
- Acceptance criteria carried into this task:
  - `F1` 口径固定为 `bizDate + 自然月 + 本期发生金额`，并能按仓别 / 车间维度稳定统计。
  - `F2` 主题范围必须覆盖 domain 文档冻结的第一阶段业务主题家族与动作清单，且按两层目录组织，技术逆操作不作为独立主题出现。
  - `F3` 用户可从主题汇总下钻到单据头清单，并看到数量、金额、成本与可用于定位差异的证据字段。
  - `F4` 调价、跨月修正、盘点调整等异常 / 纠偏金额仍归属原业务主题，但必须保留异常标识或异常列；`REVERSAL_*` 只能作为解释痕迹，不得污染主题目录。
  - `F5` 系统内提供查看界面与 `Excel` 导出，结果可供仓库与外部财务离线核对使用。
- Requirement evidence expectations:
  - focused 自动化验证覆盖主题映射、月度聚合、下钻、异常标识、权限 / 导出合同。
  - 前端至少完成构建验证；完整 acceptance 需补浏览器 walkthrough，覆盖查询、主题下钻和导出。
  - 最终需要 `docs/acceptance-tests/specs/monthly-reporting.md` 与对应 run 证据。
- Open questions requiring user confirmation:
  - `none for Phase 1 execution`; requirement 已足够进入实现。
  - 仍存在后续阶段问题但不阻断本 task：财务侧最终第一层栏目中文命名、第二层统一字段合同、哪些主题将来扩展到单据行级追溯。
  - 执行启动时 `docs/requirements/REQUIREMENT_CENTER.md` 曾保留旧版月报拆解；本 task 归档前已同步回写，当前 requirement center 已与 domain 真源对齐。

## Progress Sync

- Phase progress:
  - `implementation, review, acceptance complete`
- Current state:
  - `reporting` 已补齐月度对账汇总 API、单据头下钻 API、异常标识、`Excel` 导出与前端月度对账页面，Phase 1 的 `F1-F5` 运行时闭环已经形成。
  - review fix loop 已修复四个关键问题：`rdHandoff` 条件组合错误、前端异常字段名漂移、异常归月误用 `UTC`、以及 live `.env.dev` 中 `RD_SUB` 菜单 / 权限与 seed 漂移。
  - `monthly-reporting` domain 文档与 `REQUIREMENT_CENTER` 中的月报条目已同步，shared truth 已与当前 accepted 基线对齐。
- Acceptance state:
  - `accepted`
- Blockers:
  - `none`
- Next step:
  - `Phase 1` 已完成，保持归档基线；后续如继续推进，仅进入 `F6/F7` 的新 task。

## Goal And Acceptance Criteria

- Goal:
  - 在不新增事务写模型、不改坏现有业务模块边界的前提下，交付一套可在系统内查看、可按月导出、可从主题汇总下钻到单据头的仓库侧月度对账报表，满足 `monthly-reporting` `Phase 1` 的 `F1-F5`。
- Acceptance criteria:
  - `[F1/AC-1]` 月度口径成立：系统按 `bizDate + 自然月` 统计仓库侧本期发生金额，查询至少支持按月、仓别、车间 / 归属维度、业务主题过滤。
  - `[F2/AC-2]` 两层目录成立：第一层稳定总类、第二层覆盖 domain 文档冻结的 Phase 1 业务主题家族；`REVERSAL_IN / REVERSAL_OUT` 不得作为独立主题暴露。
  - `[F3/AC-3]` 追溯成立：用户可从主题汇总下钻到单据头清单，默认能看到数量、金额、成本及定位差异所需的单据头证据字段。
  - `[F4/AC-4]` 异常规则成立：调价、补录影响、跨月修正、盘点调整等金额仍归原业务主题，但在第二层或异常列中可识别。
  - `[F5/AC-5]` 查看与导出成立：系统内可查看月度对账结果，并支持 `Excel` 导出；导出结果与页面查询口径一致，可用于仓库与外部财务离线核对。
  - `[AC-6]` 验证闭环成立：focused 自动化验证、前端构建、独立 review 和 full acceptance 至少覆盖 `AC-1`~`AC-5` 的主要风险面。

## Phase 1 Execution Brief

- Frozen delivery slice:
  - 只做 `F1-F5`，只交付仓库侧本期发生金额月度对账，不扩到 `F6/F7`、财务导入 / 回填、自动差异比对、正式月报冻结或人工重算。
- Backend surfaces:
  - `src/modules/reporting/**`：月度对账 DTO、service、repository、controller、导出合同。
  - `src/modules/rbac/**`、`prisma/system-management.seed.ts`：仅在权限点、菜单、fallback 路由确有缺口时最小化补齐。
- Frontend surfaces:
  - `web/src/api/reporting.js`
  - `web/src/views/reporting/**`
  - `web/src/store/modules/permission.js`
- Shared-file ownership boundaries:
  - `docs/tasks/**`、`docs/requirements/**`、`docs/architecture/**`、`docs/workspace/**` 由 parent/shared truth 持有，coder 不得顺手改写。
  - `src/modules/inventory-core/**`、`src/modules/inbound/**`、`src/modules/sales/**`、`src/modules/workshop-material/**`、`src/modules/rd-project/**`、`src/modules/rd-subwarehouse/**` 默认冻结，除非 parent 重新授权。
- Validation expectations:
  - focused 自动化验证至少覆盖月度聚合、主题映射、单据头下钻、异常标识、导出合同。
  - `pnpm typecheck`
  - `pnpm --dir web build:prod`
  - full acceptance 需补浏览器 walkthrough 与导出证据。

## Scope And Ownership

- Allowed code paths:
  - `src/modules/reporting/**`
  - `src/modules/rbac/**`（仅必要权限 / fallback）
  - `prisma/system-management.seed.ts`
  - `web/src/api/reporting.js`
  - `web/src/views/reporting/**`
  - `web/src/store/modules/permission.js`
  - 与本 task 直接相关的 `test/**`
  - `docs/acceptance-tests/specs/monthly-reporting.md`
  - `docs/acceptance-tests/runs/run-YYYYMMDD-HHMM-monthly-reporting-phase1.md`
- Frozen or shared paths:
  - `docs/tasks/**` 由 parent/orchestrator 持有。
  - `docs/requirements/**` 与 `docs/architecture/**` 是 shared truth；执行阶段不得顺手改写需求定义。
  - `src/modules/inventory-core/**`、`src/modules/inbound/**`、`src/modules/sales/**`、`src/modules/workshop-material/**`、`src/modules/rd-project/**`、`src/modules/rd-subwarehouse/**` 默认冻结；除非查询合同无法成立，否则不要扩成跨模块写改。
  - `web/src/store/modules/permission.js` 与 `src/modules/rbac/infrastructure/in-memory-rbac.repository.ts` 是共享路径，若进入需最小化处理。
- Task doc owner:
  - `parent orchestrator`
- Contracts that must not change silently:
  - `reporting` 保持只读聚合定位，不拥有事务写模型。
  - `inventory-core` 仍是库存唯一写入口；月报只读查询不得旁路改库存事实。
  - `monthly-reporting` `Phase 1` 只做仓库侧本期发生金额对账，不引入财务导入、系统内自动差异比对、正式月报冻结或人工重算。
  - 异常 / 纠偏金额归属原业务主题，技术逆操作不单列成业务主题。

## Implementation Plan

- [x] Step 1: 在 `reporting` 后端完成月度汇总、单据头下钻、异常标识和导出读模型，口径只对齐 `F1-F4`。
- [x] Step 2: 在报表中心接通月度对账页面与导出入口，保证查询、列表、下钻、导出同口径。
- [x] Step 3: 最小化补齐权限 / 菜单 / fallback，并完成 focused tests、`typecheck`、web build。
- [x] Step 4: 通过 review 与 full acceptance 冻结证据，并同步修复 `REQUIREMENT_CENTER` 中的月报条目漂移。

## Coder Handoff

- Execution brief:
  - 在 `reporting` 模块内完成 `Phase 1`；不要新建平行“monthly-reporting”事务模块。
  - 优先用统一事实层完成主题归类和月度聚合，再补单据头可读字段；不要按每个业务模块各写一套统计口径。
  - 如果某类异常 / 纠偏无法在当前数据上稳定识别，允许先在第二层保留保守异常标识，但不得伪造 domain 没有确认的新业务主题。
- Required source docs or files:
  - `docs/requirements/domain/monthly-reporting.md`
  - `docs/architecture/modules/reporting.md`
  - `docs/architecture/20-wms-database-tables-and-schema.md`
  - `docs/workspace/notes/reporting-requirements-deep-interview.md`
  - `src/modules/reporting/**`
  - 本 task doc
- Owned paths:
  - `src/modules/reporting/**`
  - `prisma/system-management.seed.ts`
  - `src/modules/rbac/**`（仅必要权限 / fallback）
  - `web/src/api/reporting.js`
  - `web/src/views/reporting/**`
  - `web/src/store/modules/permission.js`
  - 与本 task 直接相关的 `test/**`
  - `docs/acceptance-tests/**`
- Forbidden shared files:
  - `docs/tasks/**`
  - `docs/requirements/**`
  - `docs/architecture/**`
  - `docs/workspace/**`
  - 事务业务模块的写服务和 schema，除非 parent 明确重新授权
- Constraints and non-goals:
  - 不实现 `F6/F7`，不做正式月报、人工重算、日期范围语义分离。
  - 不在系统内导入或录入财务侧数字。
  - 不把 `REVERSAL_*` 作为独立主题，不新增平行库存账。
  - 不 silently 改写 domain 文档里尚未冻结的第二层统一字段合同。
- Validation command for this scope:
  - `pnpm test -- src/modules/reporting/**/*.spec.ts test/app.e2e-spec.ts test/batch-d-slice.e2e-spec.ts`
  - `pnpm typecheck`
  - `pnpm --dir web build:prod`
  - acceptance 阶段基于 `.env.dev` 做浏览器 walkthrough 与导出校验

## Reviewer Handoff

- Review focus:
  - 主题映射是否真实对齐 `monthly-reporting` domain 文档，而不是复用旧趋势报表语义。
  - 月度汇总、单据头下钻、异常标识和导出是否使用一致口径。
  - 是否误把技术逆操作、调价补偿流水或 RD 协同桥接当作独立业务主题暴露。
  - 是否出现跨模块边界漂移，例如把写逻辑塞进 `reporting` 或为报表引入新事务表。
- Requirement alignment check:
  - 按 `[AC-1]`~`[AC-6]` 对照 `docs/requirements/domain/monthly-reporting.md` 的 `F1-F5`。
  - 重点检查 `REQUIREMENT_CENTER` 漂移没有反向污染实现范围。
- Final validation gate:
  - `pnpm test -- src/modules/reporting/**/*.spec.ts test/app.e2e-spec.ts test/batch-d-slice.e2e-spec.ts`
  - `pnpm typecheck`
  - `pnpm --dir web build:prod`
  - 浏览器查询 / 下钻 / 导出证据
- Required doc updates:
  - `docs/acceptance-tests/specs/monthly-reporting.md`
  - `docs/acceptance-tests/runs/run-YYYYMMDD-HHMM-monthly-reporting-phase1.md`
  - `docs/requirements/REQUIREMENT_CENTER.md`

### Acceptance Evidence Package

- Covered criteria:
  - `[AC-1]` 月度口径与筛选
  - `[AC-2]` 两层主题目录
  - `[AC-3]` 单据头下钻
  - `[AC-4]` 异常 / 纠偏标识
  - `[AC-5]` 页面查看与 `Excel` 导出
  - `[AC-6]` review + acceptance 闭环
- Evidence pointers:
  - `src/modules/reporting/**` focused tests
  - 相关 e2e / controller 合同测试
  - 前端构建输出
  - 浏览器 walkthrough：筛选、汇总、下钻、导出
  - `docs/acceptance-tests/specs/monthly-reporting.md`
  - `docs/acceptance-tests/runs/run-YYYYMMDD-HHMM-monthly-reporting-phase1.md`
- Evidence gaps, if any:
  - 若没有导出证据、没有下钻证据、或没有异常标识证据，不得签收。
- Complete test report requirement: `yes`

### Acceptance Test Expectations

- Acceptance mode: `full`
- User-visible flow affected: `yes`
- Cross-module write path: `no`
- Irreversible or high-cost business effect: `no`
- Existing automated user-flow coverage: `no`
- Browser test required: `yes`
- Browser waiver reason:
  - `none`
- Related acceptance cases:
  - `docs/acceptance-tests/specs/monthly-reporting.md`
- Related acceptance spec:
  - `docs/acceptance-tests/specs/monthly-reporting.md`
- Separate acceptance run required: `yes`
- Complete test report required: `yes`
- Required regression / high-risk tags:
  - `reporting`
  - `monthly-reporting`
  - `export`
  - `topic-mapping`
- Suggested environment / accounts:
  - 本地 `.env.dev`
  - 具备报表中心访问权限的主仓用户
  - 可选 `RD_SUB` 用户用于范围隔离 spot-check
- Environment owner / setup source:
  - `repo root .env.dev`

## Parallelization Safety

- Status: `not safe`
- If safe, list the exact disjoint writable scopes:
  - `-`
- If not safe, list the shared files or contracts that require a single writer:
  - `src/modules/reporting/**` 是核心共享实现面。
  - `web/src/api/reporting.js`、`web/src/views/reporting/**`、`web/src/store/modules/permission.js`、`prisma/system-management.seed.ts` 都是单条用户流会共同触达的共享面。
  - 主题映射、导出合同和页面字段是一组共享合同，不适合多写者并行改动。
  - 执行期 `docs/requirements/REQUIREMENT_CENTER.md` 与 domain 真源曾存在漂移，多写者同时修文档容易反向污染本次 Phase 1 边界；当前归档前已完成同步。

## Review Log

- Validation results:
  - `bun run test -- src/modules/rbac/infrastructure/in-memory-rbac.repository.spec.ts src/modules/reporting/application/monthly-reporting.shared.spec.ts src/modules/reporting/application/monthly-reporting.service.spec.ts src/modules/reporting/infrastructure/reporting.repository.spec.ts` → `pass`
  - `bun run test:e2e -- test/batch-d-slice.e2e-spec.ts` → `pass`
  - `bun run typecheck` → `pass`
  - `pnpm --dir web build:prod` → `pass`
- Findings:
  - code-review fix loop 发现并修复 `rdHandoff` 查询在 `stockScope + workshopId` 同时存在时 `OR` 条件互相覆盖，导致 `RD_SUB` 月度数据会越界。
  - 前端汇总表使用了不存在的 `anomalyDocumentCount / anomalyAmount` 字段名，live 页面异常列会显示空白；已改回后端真实合同 `abnormalDocumentCount / abnormalAmount`。
  - 异常 / 来源月份逻辑曾使用 `UTC` 月边界，上海时区跨月会误判；已统一改为 `businessTimezone`。
  - live `.env.dev` 中 `rd-operator` 的月度对账权限、菜单和 fallback 路由存在 seed 漂移；已通过 RBAC bootstrap repair + seed role menu sync 修复，并重新验证 `RD_SUB` 页面入口与 API 可达。
- Follow-up action:
  - `accepted and archived`

## Acceptance

- Acceptance status: `accepted`
- Acceptance QA:
  - `acceptance-qa + parent live rerun`
- Acceptance date:
  - `2026-04-11`
- Complete test report:
  - `docs/acceptance-tests/specs/monthly-reporting.md`

### Acceptance Checklist

> Acceptance QA 在验收时逐条填写。每条应对应 domain capability 的用户需求或 task doc 的 `[AC-*]` 条目。

- [x] `[AC-1]` 月度口径按 `bizDate + 自然月 + 本期发生金额` 成立，并支持必要筛选 — Evidence: `GET /api/reporting/monthly-reporting?yearMonth=2026-04` 在 `admin` 与 `rd-operator` 下均返回 `200`；`rd-operator` 响应范围为 `RD_SUB` — Verdict: `✓ met`
- [x] `[AC-2]` 两层主题目录覆盖 requirement 冻结范围，且 `REVERSAL_*` 未作为独立主题展示 — Evidence: 页面与 live summary 输出 `入库 / 出库 / 消耗 / 调整 / 协同` 目录与 `15` 个 topic catalog；未暴露独立 `REVERSAL_*` 主题 — Verdict: `✓ met`
- [x] `[AC-3]` 主题汇总可下钻到单据头，且第二层显示数量 / 金额 / 成本与关键证据 — Evidence: `GET /api/reporting/monthly-reporting/details?yearMonth=2026-04&groupKey=OUTBOUND&keyword=XSTH` 返回 `sourceBizMonth / sourceDocumentNo / abnormalLabels`；页面明细表展示单据头证据列 — Verdict: `✓ met`
- [x] `[AC-4]` 异常 / 纠偏金额归属原主题且可识别，技术逆操作仅作解释痕迹 — Evidence: shared/service/repository tests 覆盖业务时区跨月判断与 `abnormalLabels` 合同；页面汇总 / 明细展示 `异常单据数 / 异常金额 / 异常标识 / 来源月份 / 来源单据` — Verdict: `✓ met`
- [x] `[AC-5]` 页面查看与 `Excel` 导出可用，导出口径与页面一致 — Evidence: `POST /api/reporting/monthly-reporting/export` 返回 `201` 和 `.xls` 内容；admin 页面显示导出按钮，`rd-operator` 页面可查看但无导出按钮，符合权限隔离 — Verdict: `✓ met`
- [x] `[AC-6]` focused tests、build、review、acceptance 证据齐全 — Evidence: review fix loop、unit/e2e/typecheck/build、管理员与 `RD_SUB` 浏览器 walkthrough、acceptance spec + failed/pass runs 均已冻结 — Verdict: `✓ met`

### Acceptance Notes

- Acceptance path used: `full`
- Acceptance summary:
  - 初次 `08:34` 验收因 live `.env.dev` 的 `RD_SUB` 权限 / 菜单 seed 漂移被拒绝；修复 RBAC bootstrap repair 后，于 `09:04` 重新执行 live API + browser 验收，`F1-F5` 全部满足，结论转为 `accepted`。
- Report completeness check:
  - `complete`
- If rejected or blocked: root cause（`requirement-misunderstanding` | `implementation-gap` | `evidence-gap` | `environment-gap`）+ 精确修复指引 / 环境修复指引
- If conditionally accepted: follow-up requirement / task:

## Final Status

- Outcome:
  - `docs/requirements/domain/monthly-reporting.md` 的 `F1/F2/F3/F4/F5` 已全部完成，仓库侧月度对账 Phase 1 已形成可运行、可导出、可追溯、可按角色隔离查看的 accepted 基线。
- Requirement alignment:
  - 与 `docs/requirements/domain/monthly-reporting.md` 对齐；本 task 明确未进入 `F6/F7`，正式月报冻结、人工重算、日期范围报表继续保留后续阶段。
- Residual risks or testing gaps:
  - live fixture 当前没有非空异常单据样本，异常展示的主要强证据仍来自 focused tests 与 e2e。
  - live 样本中“调整 / 协同”主题仍以零值为主，目录覆盖主要依赖 API 输出与 focused tests 证明。
- Directory disposition after completion: `retained-completed`
- Next action:
  - 同步 `TASK_CENTER` 与 requirement / acceptance 文档后，保留为归档基线。
