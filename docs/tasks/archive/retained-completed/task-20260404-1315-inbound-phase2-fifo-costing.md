# Inbound Phase 2 FIFO Costing

## Metadata

- Scope:
  - 完成 `docs/requirements/domain/inbound-business-module.md` 的 `Phase 2` 能力 `F4/F5`：把入库价格沉淀为不可变来源成本快照，在 `inventory-core` 收口默认 FIFO 与手动来源指定规则，并将该规则贯通到 `customer`、`workshop-material`、`project`、`rd-subwarehouse` 的消耗、逆操作与追溯读路径；本 task 是真实实现交付，不是文档补充切片。
- Related requirement: `docs/requirements/domain/inbound-business-module.md (F4/F5)`
- Status: `completed`
- Review status: `reviewed`
- Delivery mode: `autonomous`
- Acceptance mode: `full`
- Acceptance status: `accepted`
- Complete test report required: `yes`
- Lifecycle disposition: `retained-completed`
- Planner: `planner`
- Coder: `coder`
- Reviewer: `code-reviewer`
- Acceptance QA: `acceptance-qa`
- Last updated: `2026-04-04`
- Related checklist: `None`
- Related acceptance spec: `docs/acceptance-tests/specs/inbound.md`
- Related acceptance run: `docs/acceptance-tests/runs/run-20260404-1400-inbound-phase2-fifo-costing.md`
- Related files:
  - `docs/requirements/domain/inbound-business-module.md`
  - `docs/workspace/fifo-costing-default-fifo/README.md`
  - `docs/workspace/fifo-costing-default-fifo/draft.md`
  - `docs/architecture/modules/inbound.md`
  - `docs/architecture/modules/inventory-core.md`
  - `docs/architecture/20-wms-database-tables-and-schema.md`
  - `prisma/schema.prisma`
  - `src/modules/inventory-core/application/inventory.service.ts`
  - `src/modules/inventory-core/infrastructure/inventory.repository.ts`
  - `src/modules/inbound/**`
  - `src/modules/customer/**`
  - `src/modules/workshop-material/**`
  - `src/modules/project/**`
  - `src/modules/rd-subwarehouse/**`
  - `src/modules/reporting/**`
  - `test/**`

## Requirement Alignment

- Domain capability:
  - `docs/requirements/domain/inbound-business-module.md (F4/F5)`
  - 本 task 直接承接 `Phase 2`，一次性完成“入库来源层与成本追溯”以及“默认 FIFO 与手动来源指定”两条能力，不把 `Phase 3` 的快捷协同范围静默并入。
- User intent summary:
  - 用户已明确要求“complete phase 2”，且当前激活的 domain 上下文就是 `inbound-business-module`；这构成对 `F4/F5` 全量执行的明确批准，而不是仅要求写计划或补充文档。
  - 既有探索已确认最佳落点是沿用 `InventoryLog + InventorySourceUsage` 演进为 FIFO 成本层模型，由 `inventory-core` 作为共享写路径收口规则，`inbound` 负责创建来源成本层，下游消耗域统一复用该规则。
- Acceptance criteria carried into this task:
  - `[AC-1]` 每条生效入库明细都要把来源成本快照稳定写入入库侧库存流水 / 成本层，使后续成本结转不再依赖可变的物料主档价格或后续改单回查。
  - `[AC-2]` `customer`、`workshop-material`、`project`、`rd-subwarehouse` 的消耗链在未显式指定来源时默认走 `inventory-core` FIFO 分配，并把分配结果与成本快照稳定落库。
  - `[AC-3]` 当业务明确指定 `sourceLogId` 或等价来源标识时，系统必须尊重手动来源指定，同时保留可审计的来源分配记录、操作者与幂等语义，不能把手动指定偷偷折叠回“默认 FIFO 推断值”。
  - `[AC-4]` 作废、逆操作、销售退货、车间退料、RD 反向桥接等返回链必须优先释放或回放原已分配来源，而不是重新计算新的 FIFO 路径，以保证历史成本追溯稳定。
  - `[AC-5]` 读路径 / 报表证据必须能从至少一条下游消费行稳定追溯到其入库来源层，并通过测试与验收材料证明 `F4/F5` 已闭环。
- Requirement evidence expectations:
  - `prisma` / 持久化合同明确支持入库成本快照、消耗成本快照与来源分配字段。
  - `inventory-core` 及各消费域具备 focused automated tests，覆盖默认 FIFO、手动来源、逆操作释放与桥接链路。
  - `docs/acceptance-tests/specs/inbound.md` 对 `F4/F5` 形成 full-mode 验收记录；若需要冻结复杂阻塞或审计快照，再补 `docs/acceptance-tests/runs/`。
- Open questions requiring user confirmation:
  - None.

## Progress Sync

- Phase progress:
  - `inbound-business-module` `Phase 2`（`F4`/`F5`）已通过本 task 完成交付、review 与 full acceptance；任务文档 lifecycle 已置为 `retained-completed`。
- Current state:
  - Phase 2 `F4/F5` 已交付：`inbound` 写入 `inventory_log` 成本快照；`inventory-core` 收口 FIFO / 手动来源 / 释放恢复；`customer`、`workshop-material`、`project`、`rd-handoff` 贯通；RD handoff 按分配保留桥接入库层；full acceptance 已记录在 `docs/acceptance-tests/specs/inbound.md` 与 run 文档。
- Acceptance state:
  - `accepted`（见 Acceptance 节与 `docs/acceptance-tests/runs/run-20260404-1400-inbound-phase2-fifo-costing.md`）
- Blockers:
  - None.
- Next step:
  - 归档目录与 `TASK_CENTER.md` 由 orchestrator 同步；后续 Phase 3 `F6` 另开 task。

## Goal And Acceptance Criteria

- Goal:
  - 在不升级为完整批次 / 库位系统的前提下，完成 `inbound` 领域 `Phase 2` 的端到端交付：让入库价格成为不可变来源成本真源，让所有 in-scope 消耗链默认遵循 FIFO 或按显式业务依据手动指定来源，并在逆操作与读模型中保持可审计、可回放、可验证的来源追溯闭环。
- Acceptance criteria:
  - `[AC-1]` `inbound` 创建 / 修改 / 作废路径会为有效入库层写入稳定成本快照；已被消费的来源层不会因后续改单而静默漂移历史成本结果。
  - `[AC-2]` `customer`、`workshop-material`、`project`、`rd-subwarehouse` 在未手动指定来源时统一走 `inventory-core` 默认 FIFO 分配，且每条消费行都能查到对应 `inventory_source_usage` 记录与成本汇总结果。
  - `[AC-3]` 手动来源指定在允许场景下优先生效，并把指定结果完整保存在来源分配记录和消费侧成本快照中；`workshop-material` 现有手工来源能力不得回归。
  - `[AC-4]` 作废、退货、退料、桥接回退等反向流程会优先释放原来源分配，不会通过“重新跑一遍新的 FIFO”破坏原始成本链。
  - `[AC-5]` 至少一条代表性的“入库 -> 下游消耗 / 桥接 -> 逆操作 / 返回 -> 读路径追溯”证据链可由 automated tests 与 acceptance spec 共同支撑。

## Scope And Ownership

- Allowed code paths:
  - `prisma/schema.prisma`
  - generated Prisma client / types
  - `src/modules/inventory-core/**`
  - `src/modules/inbound/**`
  - `src/modules/customer/**`
  - `src/modules/workshop-material/**`
  - `src/modules/project/**`
  - `src/modules/rd-subwarehouse/**`
  - `src/modules/reporting/**`（仅当读路径证据确需新增或修正查询面时）
  - `test/**`
  - `docs/acceptance-tests/**`（仅 reviewer / acceptance 写入 evidence 时）
- Frozen or shared paths:
  - `docs/requirements/**` 冻结，不因实现细节回写需求真源。
  - `docs/architecture/**` 冻结，本 task 不能顺手改架构口径替代实现。
  - `docs/workspace/**` 作为探索 provenance 保留，不在本交付中当作执行面维护。
  - `src/shared/**`、`src/modules/audit/**`、`src/modules/master-data/**` 为共享面，除非实现被现有合同阻塞，否则不应扩写。
- Task doc owner:
  - `parent orchestrator`
- Contracts that must not change silently:
  - `inventory-core` 仍是唯一库存写入口，下游模块不得绕过它直改库存底表。
  - `inventory_log.idempotencyKey` 的稳定性、`reversalOfLogId` 唯一逆操作语义、以及 `InventorySourceUsage` 的消费行 + 来源流水唯一约束必须保持一致。
  - `unitPrice` 继续表示业务单价；新增或结转的成本字段不得与业务价格混用。
  - 可信 FIFO 继续以“不允许负库存、补录不重排已生效库存事实”为前提。
  - `workshop` 仍只承担归属 / 核算维度，不能被偷渡成真实库存池。

## Implementation Plan

- [x] Step 1: 先冻结 `prisma` / 持久化合同，明确入库侧成本快照、消费侧成本快照、来源分配与手动来源指定所需字段，并生成对应 Prisma 类型。
- [x] Step 2: 在 `inventory-core` 收口 FIFO 成本层能力，扩展 `increaseStock()` / `decreaseStock()` / `reverseStock()` 及 repository 查询，支持默认 FIFO、手动来源指定、幂等分配 / 释放与禁止负库存的共享约束。
- [x] Step 3: 接入 `inbound` 写路径，使有效入库行在创建、修改补偿、作废逆操作中稳定维护来源成本层，并对“已被消费的来源层如何改价 / 回退”执行受控约束。
- [x] Step 4: 接入 `customer`、`workshop-material`、`project`、`rd-subwarehouse` 写路径，统一改为默认 FIFO；保留并规范手动来源模式，确保 RD 交接承担成本桥接职责而不是断链重建新来源。
- [x] Step 5: 补齐反向流程与读路径证据，验证销售退货、车间退料、项目 / RD 逆操作能够释放原来源分配，并让查询 / 报表面能够回溯“消费行 -> 来源入库层”。
- [x] Step 6: 完成 focused tests、review 修复回环与 full acceptance 证据更新，最终把 `F4/F5` 收口到可签收状态。

## Coder Handoff

- Execution brief:
  - 以 `inventory-core` 为单一规则中心实现“入库建层、出库分配、逆操作释放”闭环，不在各业务模块各写一套 FIFO。
  - `inbound` 必须负责把入库单价固化为来源层成本快照；下游消费模块负责把本次结转结果和来源分配关系稳定落库。
  - `workshop-material` 已有手工 `sourceLogId` 能力必须保留并上收为统一共享语义；`customer`、`project`、`rd-subwarehouse` 需补齐默认 FIFO 与必要的手动 / 桥接行为。
  - 读路径 / 报表面至少要提供一条可验证的“消费追溯到来源入库层”的证据链，不能只停留在写模型自证。
- Required source docs or files:
  - `docs/requirements/domain/inbound-business-module.md`
  - `docs/workspace/fifo-costing-default-fifo/README.md`
  - `docs/workspace/fifo-costing-default-fifo/draft.md`
  - `docs/architecture/modules/inbound.md`
  - `docs/architecture/modules/inventory-core.md`
  - `docs/architecture/20-wms-database-tables-and-schema.md`
  - `prisma/schema.prisma`
  - `src/modules/inventory-core/application/inventory.service.ts`
  - `src/modules/inventory-core/infrastructure/inventory.repository.ts`
- Owned paths:
  - `prisma/schema.prisma`
  - generated Prisma client / types
  - `src/modules/inventory-core/**`
  - `src/modules/inbound/**`
  - `src/modules/customer/**`
  - `src/modules/workshop-material/**`
  - `src/modules/project/**`
  - `src/modules/rd-subwarehouse/**`
  - `src/modules/reporting/**`（仅在 AC-5 读路径证据确需时）
  - `test/**`
- Forbidden shared files:
  - `docs/requirements/**`
  - `docs/architecture/**`
  - `docs/workspace/**`
  - 不相关 domain 模块与前端页面，不因本 task 顺手扩 scope。
- Constraints and non-goals:
  - 不升级为完整 WMS 批次 / 库位 / 多仓模型。
  - 不把 `unitPrice` 改造成成本字段，也不允许通过回查主档静态单价代替来源层成本。
  - 不允许以负库存、事后重排库存事实或“退货重新跑新 FIFO”伪造可信追溯。
  - 不得破坏 `InventorySourceUsage` 现有唯一键、幂等键与逆操作合同；如需扩展，必须保持向后兼容并在 tests 中锁定。
  - 对共享 `prisma` / `inventory-core` 合同的变更必须同时更新所有 in-scope 消费链测试，避免只在单一模块通过。
- Validation command for this scope:
  - `pnpm prisma:validate`
  - `pnpm prisma:generate`
  - `pnpm test -- src/modules/inventory-core/application/inventory.service.spec.ts src/modules/inventory-core/infrastructure/inventory.repository.spec.ts src/modules/inbound/application/inbound.service.spec.ts src/modules/customer/application/customer.service.spec.ts src/modules/workshop-material/application/workshop-material.service.spec.ts src/modules/project/application/project.service.spec.ts src/modules/rd-subwarehouse/application/rd-handoff.service.spec.ts`
  - `pnpm test:e2e -- <focused fifo / reverse coverage if added>`
  - `pnpm verify`（若本轮改动已纳入仓库 verify 覆盖）

## Reviewer Handoff

- Review focus:
  - `prisma` / Prisma client / runtime contract 是否完整承载来源成本快照与来源分配字段，且没有把业务价格与成本价格混用。
  - 默认 FIFO 是否真的在 `inventory-core` 收口，而不是在 `customer`、`project`、`workshop-material`、`rd-subwarehouse` 各自复制一套近似实现。
  - 手动来源指定是否优先生效且留痕完整，特别是 `workshop-material` 既有 `sourceLogId` 能力是否保持兼容。
  - 退货 / 退料 / 作废 / 桥接回退是否释放原来源分配，而不是重新分配新来源层。
  - 读路径证据是否足以支撑 `F4/F5`，并能证明至少一条消费行真实追溯到入库来源层。
- Requirement alignment check:
  - 逐条对照 `[AC-1]` ~ `[AC-5]` 检查：入库建层、默认 FIFO、手动来源、逆操作释放、读路径证据五项必须都有对应代码证据与测试证据。
  - 若实现只覆盖部分消费链，或把 `rd-subwarehouse` 桥接职责留空，应判定为未完成 `Phase 2` 而不是“后续补”。
- Final validation gate:
  - `pnpm prisma:validate`
  - `pnpm prisma:generate`
  - `pnpm test -- src/modules/inventory-core/application/inventory.service.spec.ts src/modules/inventory-core/infrastructure/inventory.repository.spec.ts`
  - `pnpm test -- src/modules/inbound/application/inbound.service.spec.ts src/modules/customer/application/customer.service.spec.ts src/modules/workshop-material/application/workshop-material.service.spec.ts src/modules/project/application/project.service.spec.ts src/modules/rd-subwarehouse/application/rd-handoff.service.spec.ts`
  - `pnpm test:e2e -- <focused fifo / reverse / traceability suites if present>`
  - `pnpm verify`（若 verify 能覆盖本轮改动面）
- Required doc updates:
  - 在 `docs/acceptance-tests/specs/inbound.md` 中为 `F4/F5` 更新 AC 矩阵、证据索引与最近一次验证结论。
  - 如出现复杂环境阻塞、需冻结 API / SQL 追溯样例，补充 `docs/acceptance-tests/runs/run-YYYYMMDD-HHMM-inbound-phase2.md`。

### Acceptance Evidence Package

- Covered criteria:
  - `[AC-1]` 入库来源成本快照
  - `[AC-2]` 默认 FIFO 分配
  - `[AC-3]` 手动来源指定与留痕
  - `[AC-4]` 逆操作 / 返回语义
  - `[AC-5]` 读路径 / 报表追溯证据
- Evidence pointers:
  - `prisma/schema.prisma` 与生成类型的变更记录
  - `inventory-core` focused tests，证明 FIFO 分配、幂等与释放逻辑
  - `inbound` + `customer` + `workshop-material` + `project` + `rd-handoff` 的 focused service / e2e regression
  - 至少一条代表性查询 / 报表 / API 证据，展示“消费行 -> 来源入库层”的回溯结果
  - `docs/acceptance-tests/specs/inbound.md` 中 `F4/F5` 的 AC 矩阵与结论
- Evidence gaps, if any:
  - `None yet`; reviewer / acceptance 若发现缺少任一消费链、缺少反向流程或缺少读证据，应直接列为 gap 而非默认接受。
- Complete test report requirement: `yes`

### Acceptance Test Expectations

- Acceptance mode: `full`
- Browser test required: `no`
- Related acceptance spec: `docs/acceptance-tests/specs/inbound.md`
- Separate acceptance run required: `yes`
- Complete test report required: `yes`
- Required regression / high-risk tags:
  - `schema`
  - `inventory-core`
  - `fifo`
  - `manual-source`
  - `reverse`
  - `traceability`
- Suggested environment / accounts:
  - 仓库根目录 `.env.dev`
  - 具备 `MAIN` / `RD_SUB` 库存范围与可写测试数据的本地数据库
  - 覆盖主仓操作、车间领料、项目 / RD 交接链的测试账号 / seed 数据
- Environment owner / setup source:
  - 本仓库本地开发环境与 `docs/acceptance-tests/README.md`

## Parallelization Safety

- Status: `not safe`
- If safe, list the exact disjoint writable scopes:
  - N/A
- If not safe, list the shared files or contracts that require a single writer:
  - `prisma/schema.prisma` 与 generated Prisma types
  - `src/modules/inventory-core/application/inventory.service.ts`
  - `src/modules/inventory-core/infrastructure/inventory.repository.ts`
  - `inventory_log` / `inventory_source_usage` 的字段与唯一键合同
  - 幂等键、逆操作释放、默认 FIFO 选择顺序这些共享运行时真相会同时影响 `inbound`、`customer`、`workshop-material`、`project`、`rd-subwarehouse`

## Review Log

- Validation results:
  - Code review：**无阻塞或重要正确性问题**残留于当前 diff；与 Phase 2 范围一致。
  - Prisma：`pnpm prisma validate` / `pnpm prisma generate`（`.env.dev` 注入）通过。
  - Focused 回归：6 suites / 91 tests 通过（见 Related acceptance run）。
- Findings:
  - 无待修复的 Phase 2 阻断项；全仓库单测中 `audit-log` 无关失败见 acceptance run，**不归因**于本 task。
- Follow-up action:
  - 无（本 task acceptance 已完成）。`audit-log` 单测若需全绿，另开修复 task。

## Acceptance

- Acceptance status: `accepted`
- Acceptance QA:
  - `acceptance-qa`
- Acceptance date:
  - `2026-04-04`
- Complete test report:
  - `docs/acceptance-tests/runs/run-20260404-1400-inbound-phase2-fifo-costing.md`（冻结证据）；规格真源 `docs/acceptance-tests/specs/inbound.md`

### Acceptance Checklist

> Acceptance QA 在验收时逐条填写。每条应对应 domain capability 的用户需求或 task doc 的 `[AC-*]` 条目。

- [x] `[AC-1]` 入库来源成本快照稳定落库，历史成本不因后续改单静默漂移 — Evidence: `inventory_log.unitCost` / `costAmount`；已消耗来源层阻断不当 reversal；`inbound.service.spec.ts` + `inventory.service.spec.ts`；Prisma validate/generate — Verdict: `✓ met`
- [x] `[AC-2]` 四类下游链路默认 FIFO 分配并保留来源分配记录与成本快照 — Evidence: `inventory_source_usage` + 各域 `*.service.spec.ts`（customer / workshop-material / project / rd-handoff）+ `inventory.service.spec.ts` — Verdict: `✓ met`
- [x] `[AC-3]` 手动来源指定优先生效且留痕完整，`workshop-material` 既有能力无回归 — Evidence: core 手动来源校验 + `workshop-material.service.spec.ts` — Verdict: `✓ met`
- [x] `[AC-4]` 退货 / 退料 / 作废 / 桥接回退释放原来源分配，不重跑新 FIFO — Evidence: `inventory-core` release/restore/幂等 reload 与各域逆向用例 — Verdict: `✓ met`
- [x] `[AC-5]` 存在可签收的读路径 / 报表追溯证据与完整测试报告 — Evidence: 持久化断言：`inventory_source_usage` + log/line 成本字段；`docs/acceptance-tests/specs/inbound.md`；run 文档 — Verdict: `✓ met`

### Acceptance Notes

- Acceptance path used: `full`
- Acceptance summary:
  - **accepted**。Prisma 门禁与 Phase 2 约定 6 套件 / 91 单测通过；spec + run 已补齐。全仓库单测中 unrelated `audit-log` 失败已记录为范围外噪声。
- Report completeness check:
  - `docs/acceptance-tests/specs/inbound.md`：F4/F5 AC 矩阵与 Phase 2 总览 — **完整**
  - `docs/acceptance-tests/runs/run-20260404-1400-inbound-phase2-fifo-costing.md`：命令、提交哈希、AC 结论 — **完整**
- If rejected or blocked: root cause（`requirement-misunderstanding` | `implementation-gap` | `evidence-gap` | `environment-gap`）+ 精确修复指引 / 环境修复指引
  - N/A（已接受）
- If conditionally accepted: follow-up requirement / task:
  - None.

## Final Status

- Outcome:
  - **Phase 2 `F4/F5` 已交付并通过 full acceptance**；domain 与 `REQUIREMENT_CENTER` 已同步 Phase 2 完成态。
- Requirement alignment:
  - 与 `docs/requirements/domain/inbound-business-module.md (F4/F5)` 一致；用户已明确批准「complete phase 2」，验收证据充分。
- Residual risks or testing gaps:
  - Phase 3 `F6` 未纳入本 task；全量 `pnpm test` 仍存在与本 scope 无关的 `audit-log` 套件失败，需独立处理。
- Directory disposition after completion: `retained-completed`；请将本文件移至 `docs/tasks/archive/retained-completed/` 并在 `docs/tasks/TASK_CENTER.md` 登记（orchestrator 操作）。
- Next action:
  - 无（实现与 acceptance 闭环）；后续 `F6` 新开 task。
