# Workshop Material F1-F3 Autonomous Delivery

## Metadata

- Scope:
  - 完成 `docs/requirements/domain/workshop-material-module.md` 的 `F1/F2/F3`：在现有统一后端模型与三个既有前端业务页面基础上，补齐车间领料 / 退料 / 报废的录单、查询、改单、作废、主仓库存联动、来源追溯、回冲关系与审核快照协同。
  - 本 task 是真实端到端交付，不是再做一轮方案讨论；用户已明确要求继续执行直到测试与验收通过。
  - 明确排除 `F4` 车间维度查询 / 净耗用汇总 / 导出，以及任何“统一 workbench”式前端重建。
- Related requirement: `docs/requirements/domain/workshop-material-module.md (F1,F2,F3)`
- Status: `planned`
- Review status: `not-reviewed`
- Delivery mode: `autonomous`
- Acceptance mode: `full`
- Acceptance status: `not-assessed`
- Complete test report required: `yes`
- Lifecycle disposition: `active`
- Planner: `planner`
- Coder: `coder`
- Reviewer: `code-reviewer`
- Acceptance QA: `acceptance-qa`
- Last updated: `2026-04-07`
- Related checklist: `None`
- Related acceptance spec: `docs/acceptance-tests/specs/workshop-material.md`
- Related acceptance run: `-`
- Related files:
  - `docs/requirements/domain/workshop-material-module.md`
  - `docs/architecture/00-architecture-overview.md`
  - `docs/architecture/modules/workshop-material.md`
  - `docs/architecture/20-wms-database-tables-and-schema.md`
  - `prisma/schema.prisma`
  - `src/modules/workshop-material/**`
  - `src/modules/inventory-core/**`
  - `src/modules/approval/**`
  - `web/src/views/take/pickOrder/index.vue`
  - `web/src/views/take/returnOrder/index.vue`
  - `web/src/views/stock/scrapOrder/index.vue`
  - `web/src/api/take/pickOrder.js`
  - `web/src/api/take/returnOrder.js`
  - `web/src/api/stock/scrapOrder.js`
  - `test/**`

## Requirement Alignment

- Domain capability:
  - `docs/requirements/domain/workshop-material-module.md (F1,F2,F3)`
  - 本 task 只承接 `F1/F2/F3`；`F4` 报表 / 净耗用 / 导出明确不在本轮范围内。
- User intent summary:
  - 用户先提出“完成车间物料管理需求”，随后明确收敛到 `F1/F2/F3`，并进一步明确“继续，不要停，直到测试验收通过”。
  - 已确定延续当前架构：后端继续使用统一 `workshop-material` 家族建模，前端继续沿用 `pickOrder` / `returnOrder` / `scrapOrder` 三个既有业务页面，不重建统一工作台。
- Acceptance criteria carried into this task:
  - 三类车间物料事务继续收敛在同一后端模型 / 路由家族中完成 `create/list/get/void/update` 闭环，不拆回三套分散实现。
  - 所有库存副作用与来源使用回放都必须经由 `inventory-core`，不能直接更新库存底表。
  - `F3` 改单采用“整单重提 + 确定性补偿”语义：先逆转旧副作用，再重放新副作用；领料改单若存在有效下游退料必须阻断，退料 / 报废改单允许 restore + replay。
  - 前端必须接通既有页面的真实创建 / 修改 / 作废 / 查询能力，并修正 DTO 字段映射、日期筛选 key 以及退料来源 `sourceDocumentId/sourceDocumentLineId` 透传。
  - 审核仍是轻审核追溯协作；改单 / 作废后的审核快照必须按 requirement 语义刷新或重置，但不得把审核变成阻断业务的重流程。
- Requirement evidence expectations:
  - focused 后端自动化验证覆盖 unified family、库存补偿、来源回放、下游依赖阻断与审核快照刷新。
  - 前端至少完成构建校验与真实页面浏览器验收，覆盖领料 / 退料 / 报废三页的关键录单、改单、作废和查询路径。
  - `docs/acceptance-tests/specs/workshop-material.md`、`docs/acceptance-tests/cases/workshop-material.json`、`docs/acceptance-tests/runs/run-YYYYMMDD-HHMM-workshop-material-f1-f3.md` 形成 full-mode 验收证据包。
- Open questions requiring user confirmation:
  - None.

## Progress Sync

- Phase progress: `planning complete; ready for autonomous implementation`
- Current state:
  - 后端已存在 `src/modules/workshop-material/**` 统一模型与 `create/list/get/void` 基础路径，且 `prisma` 已有 `workshop_material_order` / `workshop_material_line` 与 `revisionNo` 字段，但 revise/update 流程尚未真正落地。
  - 前端已存在 `pickOrder` / `returnOrder` / `scrapOrder` 三个页面，但 `web/src/api/take/pickOrder.js`、`web/src/api/take/returnOrder.js`、`web/src/api/stock/scrapOrder.js` 仍有 stub，且 DTO 映射与日期筛选 key 与后端现状不完全匹配。
- Acceptance state: `not-assessed`
- Blockers: `none for planning`
- Next step: `coder` 先补齐后端 revise/update + compensation 语义，再完成前端接线、focused validation、browser acceptance、review 与收口

## Goal And Acceptance Criteria

- Goal:
  - 在不扩展到 `F4`、不重建新 UI 架构的前提下，完成 `workshop-material` 的 `F1/F2/F3` 端到端交付：三类车间物料单据在统一家族模型下实现真实可用的创建、查询、改单、作废、主仓库存联动、来源追溯、回冲补偿与审核快照协同，并通过 full acceptance。
- Acceptance criteria:
  - `[AC-1]` 领料单、退料单、报废单继续使用统一后端家族模型承接；当前三个前端页面可完成真实的创建、查询、详情、修改、作废闭环，不再依赖 stub 或手工绕过。
  - `[AC-2]` 三类单据的 create / revise / void 全部通过 `inventory-core` 产生库存副作用与来源使用记录；不会出现直接改库存底表、来源回放丢失或 `sourceDocumentId/sourceDocumentLineId` 断链。
  - `[AC-3]` 改单采用“逆转旧副作用 -> 重放新副作用”的确定性补偿语义；领料改单在存在有效下游退料时会被明确阻断，退料 / 报废改单可完成 restore + replay 且结果可追溯。
  - `[AC-4]` 改单 / 作废后，`revisionNo`、来源关系、返回链与审核快照状态符合 requirement 约束，不会出现旧审核快照残留、新旧来源关系混杂或部分副作用未回滚。
  - `[AC-5]` full acceptance 证据完整：focused 自动化验证通过、前端构建通过、三张真实业务页面的浏览器 walkthrough 通过，并形成完整 test report 与 acceptance spec/cases/run 记录。

## Scope And Ownership

- Allowed code paths:
  - `prisma/schema.prisma`（仅当 revise / relation / snapshot 合同确实需要补字段或约束时）
  - `src/modules/workshop-material/**`
  - `src/modules/inventory-core/**`
  - `src/modules/approval/**`（仅当改单 / 作废后审核快照刷新或重置必须接入该域合同）
  - `web/src/views/take/pickOrder/index.vue`
  - `web/src/views/take/returnOrder/index.vue`
  - `web/src/views/stock/scrapOrder/index.vue`
  - `web/src/api/take/pickOrder.js`
  - `web/src/api/take/returnOrder.js`
  - `web/src/api/stock/scrapOrder.js`
  - 与上述页面/API 直接耦合的前端共享组件 / utils
  - `test/**`
  - `docs/acceptance-tests/**`（仅 reviewer / acceptance 在证据阶段写入）
- Frozen or shared paths:
  - `docs/tasks/**` 由 parent orchestrator 持有。
  - `docs/workspace/**` 不作为本 task 的执行面。
  - `docs/requirements/**` 与 `docs/architecture/**` 默认视为 shared truth；除非 reviewer / acceptance 在收口阶段必须同步真实进展，否则 implementation 不得顺手扩写。
  - `src/modules/reporting/**`、`monthly-reporting` 相关导出 / 汇总面冻结，避免把 `F4` 偷带入本 task。
- Task doc owner:
  - `parent orchestrator`
- Contracts that must not change silently:
  - `inventory-core` 仍是唯一库存写入口；车间物料域不得直接更新库存事实表。
  - `workshop-material` 仍是统一后端模型 + 三个既有前端页面的架构，不新增“统一 workbench”作为替代方案。
  - 领料下游退料依赖约束必须保留：存在有效退料时，领料改单不能静默放行。
  - 退料来源关系必须优先回指真实领料行；若页面已有来源字段，不能在接线时丢失。
  - 审核继续保持轻审核语义，不把改单 / 作废重构成“先审核后生效”流程。

## Implementation Plan

- [ ] Step 1: 冻结统一后端 contract，梳理现有 `create/list/get/void` 与 `revisionNo` / 审核快照 / 来源使用现状，补齐 `update` 路由、DTO 与服务入口，但不扩 scope 到 `F4`。
- [ ] Step 2: 在 `src/modules/workshop-material/**` 落地共享 revise orchestration，采用“逆转旧副作用 -> 重放新副作用”的整单重提语义，并把库存回滚 / 重放、来源释放 / 恢复、返回关系与审核快照刷新统一纳入一个事务性流程。
- [ ] Step 3: 实现关键业务保护：领料改单若存在有效下游退料则阻断；退料 / 报废改单允许 restore + replay；作废继续遵守上下游依赖校验与补偿要求。
- [ ] Step 4: 修复前端 API 层与页面映射，接通三个既有页面的 create / update / void / list / get，修正 DTO 与日期筛选 key，确保退料保留 `sourceDocumentId/sourceDocumentLineId`。
- [ ] Step 5: 补齐 focused automated tests 与必要的 integration / e2e 覆盖，重点锁定 revise compensation、来源追溯、依赖阻断、审核快照刷新与前端映射不回归。
- [ ] Step 6: 以 full acceptance 收口，执行真实页面 browser walkthrough，沉淀 `spec/cases/run` 证据，完成 review 修复回环后再退出任务。

## Coder Handoff

- Execution brief:
  - 用户已经批准“直接做完并验收”，所以本 task 默认从实现一直推进到 review 与 acceptance，不在 coder 完成局部功能后中途停下。
  - 以后端统一家族 + 三个既有前端页面为唯一允许架构，优先补齐 revise/update 和前端接线，不新开 `F4` 范围页面或报表。
  - revise 必须走共享确定性补偿流；不要分别在领料 / 退料 / 报废三类上复制三套互相漂移的逆操作实现。
  - 若执行中发现必须大幅修改共享库存合同、审核合同或引入新 UI 范式，先回到 planning 重新定 scope，不得静默扩面。
- Required source docs or files:
  - `docs/requirements/domain/workshop-material-module.md`
  - `docs/architecture/00-architecture-overview.md`
  - `docs/architecture/modules/workshop-material.md`
  - `docs/architecture/20-wms-database-tables-and-schema.md`
  - `prisma/schema.prisma`
  - `src/modules/workshop-material/**`
  - `src/modules/inventory-core/**`
  - `src/modules/approval/**`
  - `web/src/views/take/pickOrder/index.vue`
  - `web/src/views/take/returnOrder/index.vue`
  - `web/src/views/stock/scrapOrder/index.vue`
  - `web/src/api/take/pickOrder.js`
  - `web/src/api/take/returnOrder.js`
  - `web/src/api/stock/scrapOrder.js`
- Owned paths:
  - `src/modules/workshop-material/**`
  - `src/modules/inventory-core/**`
  - `src/modules/approval/**`（仅在审核快照 contract 必需时）
  - `prisma/schema.prisma`（仅在合同不足时）
  - `web/src/views/take/pickOrder/index.vue`
  - `web/src/views/take/returnOrder/index.vue`
  - `web/src/views/stock/scrapOrder/index.vue`
  - `web/src/api/take/pickOrder.js`
  - `web/src/api/take/returnOrder.js`
  - `web/src/api/stock/scrapOrder.js`
  - 与本范围直接相关的 `test/**`
  - `docs/acceptance-tests/specs/workshop-material.md`
  - `docs/acceptance-tests/cases/workshop-material.json`
  - `docs/acceptance-tests/runs/run-YYYYMMDD-HHMM-workshop-material-f1-f3.md`
- Forbidden shared files:
  - `docs/tasks/**`
  - `docs/workspace/**`
  - 与本 task 无关的 `docs/requirements/**` / `docs/architecture/**` 页面
  - `src/modules/reporting/**`、`monthly-reporting`、任何 `F4` 导出或净耗用汇总实现
  - 其他与 workshop-material revise 无直接关系的业务域页面 / API
- Constraints and non-goals:
  - 不扩展到 `F4`，不新增净耗用报表、月报、导出或统计工作台。
  - 不推翻现有 unified backend family + three-page frontend 的架构方向。
  - 不允许绕过 `inventory-core` 直写库存或伪造来源关系。
  - 不允许用“覆盖旧明细”代替真正的逆操作 + 重放补偿。
  - 领料改单在存在有效退料下游时必须失败；退料 / 报废改单允许继续，但要保留 restore + replay 的可追溯语义。
  - 前端接线必须保留 `sourceDocumentId/sourceDocumentLineId`，不能为了页面跑通而删除来源追溯能力。
- Validation command for this scope:
  - `pnpm prisma:validate`
  - `pnpm typecheck`
  - `pnpm test -- src/modules/workshop-material/application/workshop-material.service.spec.ts src/modules/inventory-core/application/inventory.service.spec.ts`
  - `pnpm test:e2e -- <focused workshop-material suites if added>`
  - `pnpm --dir web build:prod`
  - 基于 `.env.dev` 的本地联调与 browser acceptance：`pnpm dev` + `pnpm dev:web`
- If parallel work is approved, add one subsection per writer with the same fields:
  - `not approved`; 见下方 Parallelization Safety

## Reviewer Handoff

- Review focus:
  - revise 是否真正采用统一的“reverse old -> replay new”确定性补偿，而不是散落的局部覆盖式更新。
  - `inventory-core` 唯一写入口是否仍被遵守，来源使用与返回关系是否在 revise / void 后保持一致。
  - 领料改单下游退料阻断是否正确；退料 / 报废改单 restore + replay 是否不会破坏来源追溯。
  - 前端页面是否只是把 stub 替换成真实 API，同时保持 DTO 映射、日期筛选与来源字段一致；不得借机重构成新 UI。
  - `F4` 是否被严格排除，没有把 reporting/export/net-consumption 改动混入本 task。
- Requirement alignment check:
  - 对照 `[AC-1]` ~ `[AC-5]` 检查 unified family、库存联动、改单补偿、审核快照与 full acceptance 五个维度是否全部闭环。
  - 若实现只完成后端 revise 而前端仍停留在 stub，或只完成页面接线但缺少补偿 / 来源追溯 / browser evidence，均不得判定完成。
- Final validation gate:
  - `pnpm prisma:validate`
  - `pnpm typecheck`
  - `pnpm test -- src/modules/workshop-material/application/workshop-material.service.spec.ts src/modules/inventory-core/application/inventory.service.spec.ts`
  - `pnpm test:e2e -- <focused workshop-material suites if added>`
  - `pnpm --dir web build:prod`
  - browser acceptance 证据 + `docs/acceptance-tests/specs/workshop-material.md` + `docs/acceptance-tests/cases/workshop-material.json` + `docs/acceptance-tests/runs/run-YYYYMMDD-HHMM-workshop-material-f1-f3.md`
- Required doc updates:
  - `docs/acceptance-tests/specs/workshop-material.md`
  - `docs/acceptance-tests/cases/workshop-material.json`
  - `docs/acceptance-tests/runs/run-YYYYMMDD-HHMM-workshop-material-f1-f3.md`
  - 如实现结果与现有真源已有偏差，再由 parent/reviewer 评估是否同步 `docs/requirements/domain/workshop-material-module.md` 与 `docs/architecture/modules/workshop-material.md`

### Acceptance Evidence Package

- Covered criteria:
  - `[AC-1]` unified family + 三页面真实闭环
  - `[AC-2]` 主仓库存联动与来源追溯
  - `[AC-3]` 改单补偿与领料下游阻断
  - `[AC-4]` 审核快照 / revision / return relation 一致性
  - `[AC-5]` full acceptance 完整证据
- Evidence pointers:
  - focused backend unit / integration / e2e 输出
  - 关键 API 行为证据：create / revise / void / list / get
  - `pnpm --dir web build:prod` 输出
  - 浏览器 walkthrough 证据：`pickOrder` / `returnOrder` / `scrapOrder`
  - `docs/acceptance-tests/specs/workshop-material.md`
  - `docs/acceptance-tests/cases/workshop-material.json`
  - `docs/acceptance-tests/runs/run-YYYYMMDD-HHMM-workshop-material-f1-f3.md`
- Evidence gaps, if any:
  - 若缺少任一 revise compensation 证据、浏览器真实页面证据或完整 test report，则不得签收。
- Complete test report requirement: `yes`

### Acceptance Test Expectations

- Acceptance mode: `full`
- User-visible flow affected: `yes`
- Cross-module write path: `yes`
- Irreversible or high-cost business effect: `yes`
- Existing automated user-flow coverage: `no`
- Browser test required: `yes`
- Browser waiver reason:
  - `-`
- Related acceptance cases:
  - `pick-create-revise-blocked-by-active-return`
  - `return-create-revise-with-source-linkage`
  - `scrap-create-revise-with-compensation`
  - `void-and-list-query-regression`
- Related acceptance spec: `docs/acceptance-tests/specs/workshop-material.md`
- Separate acceptance run required: `yes`
- Complete test report required: `yes`
- Required regression / high-risk tags:
  - `workshop-material`
  - `inventory-core`
  - `revise`
  - `source-traceability`
  - `audit-snapshot`
  - `browser`
- Suggested environment / accounts:
  - 仓库根目录 `.env.dev`
  - 本地 `pnpm dev` 后端服务 + `pnpm dev:web` 前端服务
  - 具备车间物料录单 / 作废权限的测试账号
  - 可用于领料 / 退料 / 报废联调的 `MAIN` 主仓、车间、物料与来源单据测试数据
- Environment owner / setup source:
  - 本仓库本地开发环境与 `docs/acceptance-tests/README.md`

## Parallelization Safety

- Status: `not safe`
- If safe, list the exact disjoint writable scopes:
  - `N/A`
- If not safe, list the shared files or contracts that require a single writer:
  - `src/modules/workshop-material/**` 的统一 revise orchestration 与 controller / DTO 合同
  - `src/modules/inventory-core/**` 的共享库存写路径与来源释放 / 重放合同
  - 可能涉及的 `prisma/schema.prisma` 合同
  - 前后端之间共享的 workshop-material DTO / query key / source relation 契约
  - acceptance 证据需要基于最终集成后的单一真实行为录制，不能并行各自冻结

## Review Log

- Validation results: `not run; planning only`
- Findings: `-`
- Follow-up action: `assign coder to execute backend revise + frontend wiring + full acceptance loop`

## Acceptance

- Acceptance status: `rejected`
- Acceptance QA: `acceptance-qa`
- Acceptance date: `2026-04-07`
- Complete test report: `docs/acceptance-tests/specs/workshop-material.md`; `docs/acceptance-tests/cases/workshop-material.json`; `docs/acceptance-tests/runs/run-20260407-1707-workshop-material-f1-f3.md`

### Acceptance Checklist

> Acceptance QA 在验收时逐条填写。每条应对应 domain capability 的用户需求或 task doc 的 `[AC-*]` 条目。

- [ ] `[AC-1]` unified family 与三个既有页面完成真实 create / list / get / update / void 闭环 — Evidence: live API 家族路径通过，但 browser 验收中 `/take/pickOrder` 修改触发 `GET /api/workshop-material/pick-orders/undefined` `400` 与 audit detail `404`，`/take/returnOrder` 路由因 `GET /src/api/audit/audit.js` `404` 无法加载；详见 `docs/acceptance-tests/runs/run-20260407-1707-workshop-material-f1-f3.md` — Verdict: `✗ not met`
- [x] `[AC-2]` create / revise / void 全部通过 `inventory-core` 产生正确库存副作用与来源追溯记录 — Evidence: live API + MySQL 冻结显示 `inventory_log` 包含 `PICK_OUT / RETURN_IN / SCRAP_OUT / REVERSAL_*`，`inventory_source_usage` 与 `document_line_relation` 保持一致，详见 `docs/acceptance-tests/runs/run-20260407-1707-workshop-material-f1-f3.md` — Verdict: `✓ met`
- [x] `[AC-3]` 改单补偿语义正确，且领料改单在存在有效下游退料时被阻断，退料 / 报废改单可 restore + replay — Evidence: `PUT /api/workshop-material/pick-orders/1` 返回 `400`“存在未作废的退料单下游，不能修改领料单”；return / scrap revise 均出现 reversal + replay 与 `revisionNo` 递增 — Verdict: `✓ met`
- [x] `[AC-4]` `revisionNo`、来源关系、返回链与审核快照在改单 / 作废后保持一致，无旧状态残留 — Evidence: `workshop_material_order` / `approval_document` / `document_line_relation` / `inventory_source_usage` 冻结显示 return `revisionNo=2` 且 `resetCount=1`，void 后三单 `auditStatusSnapshot=NOT_REQUIRED`、source usage 全量 `RELEASED` — Verdict: `✓ met`
- [ ] `[AC-5]` focused 自动化验证、前端构建与真实浏览器 walkthrough 全部通过，并形成完整 test report — Evidence: parent 已提供 `service.spec`、`typecheck`、`web build:prod`、`prisma:validate` 通过；但真实 browser walkthrough 失败，full acceptance 未通过；test report 已补齐到 spec/cases/run — Verdict: `✗ not met`

### Acceptance Notes

- Acceptance path used: `full`
- Acceptance summary: `live API 与 DB 证据显示 unified family、inventory-core 副作用、revise 补偿、return linkage 与 void 回滚语义成立；但 shipped browser 面在 pick/return 两页存在真实集成缺陷，因此 full acceptance 拒绝签收。`
- Report completeness check: `spec/cases/run 已补齐；run 路径为 docs/acceptance-tests/runs/run-20260407-1707-workshop-material-f1-f3.md`
- If rejected or blocked: root cause（`requirement-misunderstanding` | `implementation-gap` | `evidence-gap` | `environment-gap`）+ 精确修复指引 / 环境修复指引
  - `implementation-gap`
  - 修复 `pickOrder` 修改流把 document id 传成 `undefined` 的前端接线问题，并修正错误的 audit detail 请求。
  - 修复 `returnOrder` 对不存在模块 `src/api/audit/audit.js` 的引用或打包路径错误，恢复页面正常加载。
  - 修复后重新执行三页面 browser walkthrough，再判断是否可从 `rejected` 提升为 `accepted`。
- If conditionally accepted: follow-up requirement / task:

## Final Status

- Outcome: `planned`
- Requirement alignment: `与 docs/requirements/domain/workshop-material-module.md (F1,F2,F3) 一致；严格排除 F4`
- Residual risks or testing gaps:
  - 当前前端缺少现成自动化 user-flow 脚本，browser acceptance 是本 task 的强制证据而不是可选项。
  - revise 补偿触达 `inventory-core`、来源追溯与审核快照共享合同，若测试覆盖不完整，容易留下隐性一致性回归。
- Directory disposition after completion: `keep active until implementation, review, and full acceptance finish`
- Next action: `start autonomous coder delivery for backend revise/update, frontend wiring, review, and full acceptance`
