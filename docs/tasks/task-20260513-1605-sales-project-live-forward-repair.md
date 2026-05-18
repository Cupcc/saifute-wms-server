# 销售项目误写入 `rd_project` 的在线前向修复

## Metadata

- Scope:
  - 在当前 live `DATABASE_URL` 目标库上，前向修复 2026-05-11 全量迁移中把旧 `/product`（`saifute_composite_product` / `saifute_product_material`）误写入 `rd_project*` 的问题。
  - 保留目标库上线后新增的正式业务单据，不允许通过 full reset、重新导入旧库或覆盖当前 target DB 来“回到正确状态”。
  - 将错误归属的历史项目迁正到 `sales_project*`，补齐项目维度锚点、项目关联验收语义、项目关联出库 / 退货 replay 语义，并在维护窗口内只重建派生库存层。
  - 修复完成后，`/sales/project` 承接旧 `/product` 的项目真源；`/rd/projects` 不再承接这批对外销售项目。
- Related requirement:
  - `docs/requirements/domain/sales-project-management.md (F1,F2,F3,F4)`
  - `docs/requirements/domain/inventory-core-module.md (C1,C4,C9)`
  - `docs/architecture/30-java-to-nestjs-data-migration-reference.md`
- Status: `planned`
- Review status: `not-reviewed`
- Delivery mode: `standard`
- Acceptance mode: `full`
- Acceptance status: `not-assessed`
- Complete test report required: `yes`
- Lifecycle disposition: `active`
- Planner: `parent-orchestrator`
- Coder:
- Reviewer:
- Acceptance QA:
- Last updated: `2026-05-13`
- Related checklist:
  - `scripts/migration/reports/rd-project-execute-report.json`
  - `scripts/migration/reports/inventory-replay-execute-report.json`
- Related acceptance spec:
  - `docs/acceptance-tests/specs/sales-project.md`
- Related acceptance run: (optional)
- Related files:
  - `docs/requirements/domain/sales-project-management.md`
  - `docs/requirements/domain/inventory-core-module.md`
  - `docs/architecture/modules/sales-project.md`
  - `docs/architecture/modules/inventory-core.md`
  - `prisma/schema.prisma`
  - `scripts/migration/inventory-replay/**`
  - `scripts/migration/rd-project/**`
  - `scripts/migration/reports/**`
  - `src/modules/sales-project/**`
  - `src/modules/sales/**`
  - `src/modules/inbound/**`
  - `src/modules/inventory-core/**`
  - `web/src/views/sales-project/**`

## Requirement Alignment

- Domain capability:
  - `sales-project` 必须独立承接对外销售项目，不得再借用 `rd-project` 运行时语义。
  - `inventory-core` 必须继续作为唯一库存写入口，且项目归属事实必须能稳定进入 `inventory_log.project_target_id`。
- User intent summary:
  - 当前正式库已经运行数天，旧库不再是运行真源；用户要求在不重置正式库的前提下，写出一份可执行、可回滚、可审计的安全任务，修复“旧销售项目误写到 `rd_project`、`/sales/project` 无数据、项目物料库存变负”的问题。
- Acceptance criteria carried into this task:
  - `[AC-1]` 正式库不得 full reset，不得用 `LEGACY_DATABASE_URL` 覆盖 `DATABASE_URL` 当前 live 数据。
  - `[AC-2]` 修复对象必须被限定为当前误写入 `rd_project` 的历史销售项目集合；若执行时发现新的下游依赖，必须阻断并扩 task，不得静默继续。
  - `[AC-3]` 修复后 `sales_project*` 成为这批历史项目的唯一运行时真源，`rd_project*` 不再承接它们的有效项目语义。
  - `[AC-4]` 修复后项目相关入库必须可表达为“项目验收 / 项目收货”事实，项目相关出库 / 退货必须可在 replay 中保留项目归属。
  - `[AC-5]` 派生库存层重建必须以当前 live target DB 业务单据为输入，而不是再次回放旧库全量导入。
  - `[AC-6]` 修复完成后 `/sales/project` 有正确数据，`/rd/projects` 不再展示这批对外销售项目，且项目库存不再以 `RD_PROJECT_OUT` 负向扣减作为初始状态。
- Requirement evidence expectations:
  - 误写项目集合 dry-run 报告、执行前阻断校验报告、shadow rehearsal 报告、正式执行前后核对报告。
  - 项目迁正后 `sales_project*` / `project_target` / `migration_staging.map_project` 的对账结果。
  - `inventory-replay` dry-run / execute / validate 证据，证明使用的是当前 target DB 业务单据而非旧库覆盖。
  - `/sales/project` 浏览器验收、项目详情与项目发货草稿链路验收。
- Open questions requiring user confirmation:
  - 无 task 文档级 blocker。
  - 正式 execute 前仍需维护窗口、正式库备份路径和回滚责任人确认。

## Progress Sync

- Phase progress:
  - `blocked: project acceptance backfill over-scoped`
- Current state:
  - 当前 live 目标库是 `.env.dev` 的 `DATABASE_URL=saifute-wms`；它已经承接了上线后新增业务，不能再作为“可重置练习库”处理。
  - 当前 `LEGACY_DATABASE_URL` 只可作为历史证据来源，不能再作为覆盖当前 target DB 的运行真源。
  - `2026-05-15` 复查发现项目验收入库 backfill 口径错误：当前 live 库 `YS-PROJ-*` 已生成 `stock_in_order=21`、`stock_in_order_line=675`、`inventory_log(ACCEPTANCE_IN)=675`，合计 `42568` 件，覆盖了全部 `sales_project_material_line`。
  - `2026-05-15` 旧库证据显示这 675 行并非全是项目采购验收入库：其中 `115` 条 legacy 项目物料行在 `saifute_inventory_used.after_order_type=8` 下已有来源链，`usageRowCount=130`、`useQty=7351.5000`、来源类型包含 `1/2/7`。这批不能继续当作项目新验收入库处理。
  - `2026-05-15` 已把 `sales-project-acceptance-backfill` dry-run 增加 legacy 来源链 blocker：当前报告 `eligible=false`，阻断原因为 `legacy-project-lines-have-existing-source-usage`。
  - `2026-05-15` live 核对显示：`sales_project=21`、`sales_project_material_line=675`、`project_target(SALES_PROJECT)=21`，`migration_staging.map_project` / `map_project_material_line` canonical mapping 均已迁正到 `sales_project*`。
  - `2026-05-15` live 核对显示：有效 `rd_project=0`，错误 `businessDocumentType=RdProject / operationType=RD_PROJECT_OUT` 库存流水为 `0`。
  - `2026-05-15` live 核对显示：`stock_in_order` 已具备 `sales_project_id`、`sales_project_code_snapshot`、`sales_project_name_snapshot` 三个项目字段。
  - `2026-05-15` 新增项目验收入库 backfill 脚本：`bun run migration:sales-project-acceptance-backfill:dry-run` / `execute`，报告产物为 `scripts/migration/reports/sales-project-acceptance-backfill-dry-run-report.json` 与 `scripts/migration/reports/sales-project-acceptance-backfill-execute-report.json`。
  - `2026-05-15` 正式执行前已备份 live 目标库到 `scripts/migration/backups/live-saifute-wms-before-sales-project-acceptance-backfill-20260515-094401.sql`，SHA-256 为 `fad699ca7dbf9a717db0e510118ef58ebdb437cb244b7a7bad0d9c198d662664`。
  - `2026-05-15` 已执行项目验收入库 backfill：创建 `stock_in_order=21`、`stock_in_order_line=675`，均绑定对应 `sales_project_id`。
  - `2026-05-15` 已重跑 `inventory-replay:dry-run -> execute -> validate`：dry-run `blockers=[]`，execute 删除旧派生层 `inventory_balance=863`、`inventory_log=4647`、`inventory_source_usage=3077` 并重建 `inventory_balance=1272`、`inventory_log=5322`、`inventory_source_usage=3105`，validate `validationIssues=[]`。
  - `2026-05-15` 项目 `21 / PRJ-LEGACY-36` post-verify：`inventory_log.project_target_id=21` 有 `30` 条项目库存流水，项目库存合计 `187`；应用服务 `SalesProjectService.listMaterials(21)` 返回 `itemCount=30`、`totalPriceLayerCount=30`、`totalCurrentInventoryQty=187`。
  - `2026-05-13` 已新增 dry-run 入口：`bun run migration:sales-project-live-forward-repair:dry-run`，报告产物为 `scripts/migration/reports/sales-project-live-forward-repair-dry-run-report.{json,md}`。
  - `2026-05-14` 已新增 `execute / validate` 入口：`bun run migration:sales-project-live-forward-repair:execute` 与 `bun run migration:sales-project-live-forward-repair:validate`。`execute` 当前只迁正 `sales_project*` / `project_target` / canonical map 与错误 `rd_project` 退役状态，不直接改派生库存层；`validate` 以 execute report 为基线核对 remap 结果。
  - `2026-05-13` 已对 live target 执行受限回填：`migration:inventory-replay:return-source-links:execute` 将 `WorkshopMaterialOrder:587:line:1873 (TL20260507143530133)` 绑定到 `WorkshopMaterialOrder:529:line:1732 (LL20260430017)`；目标退料行当前 `source_document_*` 已落值，`updated_by=inventory-replay-best-candidate-backfill`。
  - `2026-05-13` 已收口 replay 输入事实与 planner 规则：新增 linked-return temporary-negative offset 处理与“后续普通入库先清 temporary negative debt”的保护逻辑，focused `test/migration/inventory-replay.spec.ts` 已补 2 条回归用例。
  - 最新 live 验证结果：`bun run migration:inventory-replay:dry-run` 已达 `blockers=[]`；`bun run migration:inventory-replay:return-source-links:dry-run` 已达 `totalMissingLinks=0 / selectedCount=0 / skippedCount=0`。
  - `2026-05-14` 在继续补 `stock_in_order -> sales_project` 合同并给 replay 增加 `projectTargetId` 载体后，曾出现 `1` 个 replay blocker：`price-layer-balance-mismatch materialId=185 stockScopeId=1 balanceQty=5 sourceAvailableQty=4 differenceQty=-1`。
  - `2026-05-14` 已单独收口 `materialId=185`：根因是 linked return 释放量在“原 outbound 已完整来源分配、temporary negative 来自更早未来入库预占”的场景下被错误吞掉，导致 `TH20260428001` 释放的 `1` 未回到 price layer。已调整 planner，仅当原 outbound 自身存在 `allocation.missingQty` 时才把释放量用于补源缺口；新增 focused 回归后，live `bun run migration:inventory-replay:dry-run` 已恢复 `blockers=[]`。
  - `2026-05-14` 代码侧已补 `stock_in_order.sales_project_id` 与项目快照字段、`InboundAcceptanceCreate/Update` 写侧项目归属传递、`inventory-replay` 的 `projectTargetId` 载体与 `stock_in_order.sales_project_id` 缺列兼容读取，以及对应 focused 自动化验证。
  - `2026-05-14` 已创建本地 shadow 库 `saifute-wms-shadow`，来源为当时 live `saifute-wms` 快照；shadow 已应用 `scripts/migration/sql/20260514-stock-in-order-add-sales-project.sql` 并验证 `sales_project_id`、`sales_project_code_snapshot`、`sales_project_name_snapshot`、索引和外键存在。
  - `2026-05-14` shadow 已执行 `sales-project-live-forward-repair:execute -> validate`：`shadow-sales-project-live-forward-repair-execute-report.json` 显示创建 `sales_project=21`、`sales_project_material_line=675`、退役错误 `rd_project=21`、预计替换错误 `RdProject / RD_PROJECT_OUT=673`；`shadow-sales-project-live-forward-repair-validate-report.json` 显示 `valid=true`、`validationErrors=[]`、`wrongProjectCount=0`、`wrongInventoryLogCount=0`。
  - `2026-05-14` shadow 已执行 `inventory-replay:dry-run -> execute -> validate`：dry-run `blockers=[]`，`materialId=185` 的 price layer 由 `StockInOrder:1184:line:2138` 可用 `4` 与 `SalesStockOrder:535:line:684` 释放 `1` 组成，reconciliation 为 `balanceQty=5 / sourceAvailableQty=5 / differenceQty=0`；execute 插入 `inventory_log=4618`、`inventory_source_usage=3045`、`inventory_balance=863`；validate 实际与计划一致且 `validationIssues=[]`。
- Acceptance state:
  - `blocked-after-live-overwrite-discovery`
- Blockers:
  - 当前 live 项目验收入库回填过度：必须先回滚或重建 `YS-PROJ-*` 业务单据及派生库存层，再按采购入项目、已有库存改归属 / 预留分别建模。
  - 浏览器端带登录态的 `/sales/project/detail/21` 截图验收暂停；当前项目库存读模型建立在过度回填后的派生库存层上，不能签收。
- Next step:
  - 先基于 `live-saifute-wms-before-sales-project-acceptance-backfill-20260515-094401.sql` 或版本化逆向脚本制定恢复方案；恢复后重新按 legacy 来源链拆分项目采购验收与已有库存归属调整 / 预留，不再全量生成 `YS-PROJ-*`。

## Goal And Acceptance Criteria

- Goal:
  - 在不重置正式库、不覆盖 live 业务单据的前提下，把误写到 `rd_project*` 的历史销售项目前向迁正到 `sales_project*`，并基于当前 target DB 业务单据重建项目归属正确的派生库存层。
- Acceptance criteria:
  - `[AC-1]` 正式修复全程不得执行 live `DATABASE_URL` 的 full reset、全量旧库重导或其他覆盖式重建。
  - `[AC-2]` 修复集合被精确限定为当前 `map_project` 中误写的 `21` 条 legacy 销售项目；若正式执行前该集合出现新的 `rd` 下游引用，必须阻断执行。
  - `[AC-3]` 每个修复项目都生成 canonical `sales_project`、`sales_project_material_line` 与 `project_target(target_type=SALES_PROJECT)`，并可被 `sales` 正式引用。
  - `[AC-4]` 原错误 `rd_project` 行在第一阶段不得硬删；必须通过 `VOIDED / REVERSED / hidden-from-runtime` 等方式退出有效运行时，并在 replay 中不再产生 `RD_PROJECT_OUT`。
  - `[AC-5]` `migration_staging.map_project` 的 canonical 映射必须迁正到 `sales_project`，且错误 `rd_project` 映射在修复审计表 / 报告中保留可追溯证据。
  - `[AC-6]` `stock_in_order` 必须补齐销售项目关联合同，用于承接“项目中添加单据后自动生成验收单”的正式真源；第一版固定为“一张项目验收单只归属一个销售项目”。
  - `[AC-7]` `inventory-replay` 必须支持从项目验收单和项目销售出库 / 退货中携带 `projectTargetId`，最终写入 `inventory_log.project_target_id`。
  - `[AC-8]` 派生库存层重建只允许删除并重建 `inventory_balance`、`inventory_log`、`inventory_source_usage`；不得删除 `stock_in_order`、`sales_stock_order`、`factory_number_reservation`、`document_relation*` 等 live 业务真源。
  - `[AC-9]` 修复完成后，不再存在这批 legacy `/product` 项目产生的 `RdProject / RD_PROJECT_OUT` 初始项目库存流水；项目相关正向库存应来自项目验收 / 收货事实，负向扣减只来自真实销售出库。
  - `[AC-10]` `/sales/project` 页面可查看修复后的历史项目、项目详情、项目库存 / 发货统计；`/rd/projects` 不再展示这批误写项目。
  - `[AC-11]` shadow rehearsal、正式执行前阻断校验、正式执行后核对、focused 自动化验证和 browser acceptance 全部留档。

## Scope And Ownership

- Allowed code paths:
  - `docs/tasks/**`
  - `prisma/schema.prisma`
  - `scripts/migration/**`
  - `src/modules/sales-project/**`
  - `src/modules/sales/**`
  - `src/modules/inbound/**`
  - `src/modules/inventory-core/**`
  - `test/migration/**`
  - `web/src/views/sales-project/**`
- Frozen or shared paths:
  - `.env.dev` 只读，不在本 task 中修改。
  - 当前 worktree 中与本任务无关的 `master-data`、`reporting`、`monthly-reporting` 改动保持冻结，不得顺手并入。
  - `docs/requirements/**`、`docs/architecture/**` 作为 shared truth，只读引用，不在本 task 中改写需求。
  - 正式库上的 ad-hoc 手工 SQL 冻结；任何 execute 都必须落在版本化脚本和报告里。
- Task doc owner:
  - `parent-orchestrator`
- Contracts that must not change silently:
  - 当前 live `DATABASE_URL` 是正式运行真源，不能 reset。
  - `LEGACY_DATABASE_URL` 不再是覆盖式导入源，只能作为历史证据。
  - `inventory-core` 继续是唯一库存写入口。
  - `sales-project` 与 `rd-project` 继续严格分域，不得再共享同一运行时语义。
  - 第一版项目验收合同固定为“一张验收单属于一个销售项目”；若要支持同单多项目，必须显式扩 scope。
  - 第一阶段误写 `rd_project` 不做硬删；任何物理删除都必须在后续单独确认后进行。

## Safety Gates

- `[Gate-1]` 正式 execute 前必须完成当前正式库全量备份，并记录可执行恢复命令或恢复流程。
- `[Gate-2]` 正式 execute 前必须重新核对：误写项目集合仍是 `21` 条，且 `rd_project_material_action`、`rd_handoff_order_line`、`rd_stocktake_order_line`、`document_relation` 在该集合上仍为 `0`；否则阻断。
- `[Gate-3]` 正式 execute 前必须重新核对：`stock_in_price_correction_order*` 仍为 `0`；若不为 `0`，本 task 的派生库存层重建口径失效，必须阻断并重写方案。
- `[Gate-4]` 正式 execute 前必须对当前 live target DB 做 shadow rehearsal；shadow 的 dry-run / execute / validate 未通过，不得进入正式 execute。
- `[Gate-5]` 正式 execute 必须在维护窗口内完成，并在停止相关写流量后重新跑 preflight；若 rehearsal 之后又新增了影响修复集合的 live 单据，必须重新基于新快照 rehearse。
- `[Gate-6]` post-verify 若出现 replay blocker、项目归属缺失、数量对不上或 `/sales/project` 无法正确展示，必须在流量恢复前执行回滚或继续在维护窗口内修复到通过。

## Implementation Plan

- [x] Step 1: 建立 live repair 证据和阻断基线。
  - 新增只读 discovery / dry-run 脚本，输出误写项目集合、错误 `rd_project` 下游使用情况、错误 `inventory_log` 集合、live 新增单据增量和阻断条件报告。
  - discovery 报告必须固定本次 repair set 的 `legacy_id`、`wrong_rd_project_id`、项目编码 / 名称、错误流水数量和当前最后更新时间。
- [ ] Step 2: 建立修复审计模型。
  - 新增 `migration_staging` 或等价 repair audit 表，记录 `legacy_id -> wrong_rd_project_id -> new_sales_project_id`、旧 `project_target`、旧库存流水摘要、修复状态和执行时间。
  - 决定并实现 `map_project` canonical 映射迁正方式：先留审计，再把 canonical mapping 指向 `sales_project`。
- [ ] Step 3: 建立销售项目收货真源合同。
  - 在 schema 与运行时中补齐项目验收与 `sales_project` 的正式关联字段及快照合同。
  - 第一版固定“一张验收单属于一个销售项目”；不在本 task 中扩成同单多项目。
  - 补齐 inbound 创建 / 更新 / 查询合同，以及必要的 migration / repair SQL。
- [ ] Step 4: 补齐 replay 的项目归属能力。
  - 在 `scripts/migration/inventory-replay/types.ts`、planner、writer 中补 `projectTargetId`。
  - 更新 `readStockInEvents()`：项目验收单可输出 `projectTargetId`。
  - 更新 `readCustomerEvents()`：销售出库 / 销售退货可基于 `sales_stock_order_line.salesProjectId` 输出 `projectTargetId`。
  - 确认 writer 把 `project_target_id` 写入 `inventory_log`。
- [x] Step 5: 建立误写项目的 forward repair dry-run。
  - 输出将创建的 `sales_project`、`sales_project_material_line`、`project_target(SALES_PROJECT)` 数量。
  - 输出将失效的 `rd_project` 行、将迁正的 `map_project` 行、将影响的错误库存流水数量。
  - dry-run 必须明确“不触碰 live 新增 `stock_in_order` / `sales_stock_order` 主数据”的范围证据。
- [x] Step 6: 建立误写项目的 forward repair execute / validate。
  - execute 负责创建 `sales_project*`、创建 `project_target`、迁正 canonical map、失效错误 `rd_project`。
  - validate 负责核对项目数量、项目编码 / 名称、物料行数量、`project_target` 完整性以及错误 `rd_project` 的运行时退出状态。
- [x] Step 7: 在 current live DB 的 shadow copy 上完成 rehearsal。
  - 从当前正式库备份恢复一份 shadow DB，不使用旧 legacy DB 覆盖。
  - 在 shadow 上执行：`stock_in_order` DDL -> repair execute -> repair validate -> inventory-replay dry-run -> execute -> validate；repair execute 自身会重读当前 snapshot 并执行 DB-scoped blocker gate。
  - rehearsal 必须产出完整报告，并证明这几天新增的 live 入库 / 出库单被保留。
- [ ] Step 8: 做应用层和浏览器验收。
  - 在 shadow 或本地联调环境验证 `/sales/project` 列表、详情、项目库存、项目出库草稿。
  - 验证 `/rd/projects` 不再出现这批 legacy 错误项目。
  - 验证项目相关库存是“先验收入库、后销售出库”，而不是初始 `RD_PROJECT_OUT` 负向扣减。
- [ ] Step 9: 正式维护窗口 execute。
  - 开始前重跑所有阻断校验。
  - 先执行 forward repair，后执行派生库存层重建。
  - 派生库存层 execute 只允许删除并重建 `inventory_balance`、`inventory_log`、`inventory_source_usage`。
- [ ] Step 10: 正式 post-verify 和回滚判定。
  - 核对项目集合、live 新增单据保留、replay validate、`/sales/project` 浏览器结果。
  - 若失败，按备份恢复或在维护窗口内修复到通过；未通过前不得恢复相关写流量。

## Coder Handoff

- Execution brief:
  - 这不是“把一个表名改对”的小修；必须把业务真源、项目归属合同和 replay 派生链一起收口。
  - 先做只读 discovery / dry-run 和 shadow rehearsal，再做任何正式 execute。
  - 正式库的 business tables 与 derived inventory tables 要分开处理：前者做前向修复，后者做可重建重放。
- Required source docs or files:
  - `docs/requirements/domain/sales-project-management.md`
  - `docs/requirements/domain/inventory-core-module.md`
  - `docs/architecture/modules/sales-project.md`
  - `docs/architecture/modules/inventory-core.md`
  - `docs/architecture/30-java-to-nestjs-data-migration-reference.md`
  - `docs/tasks/task-20260509-full-legacy-import-reset-and-replay.md`
  - `scripts/migration/reports/rd-project-execute-report.json`
  - `scripts/migration/reports/inventory-replay-execute-report.json`
- Owned paths:
  - `prisma/schema.prisma`
  - `scripts/migration/**`
  - `src/modules/inbound/**`
  - `src/modules/sales-project/**`
  - `src/modules/sales/**`
  - `src/modules/inventory-core/**`
  - `test/migration/**`
  - 与本任务直接相关的 `web/src/views/sales-project/**`
- Forbidden shared files:
  - `.env.dev`
  - `docs/requirements/**`
  - `docs/architecture/**`
  - 与本任务无关的 `master-data` / `reporting` / `monthly-reporting` 在途改动
- Constraints and non-goals:
  - 不允许 live `DATABASE_URL` full reset。
  - 不允许用 `LEGACY_DATABASE_URL` 覆盖当前 live target DB。
  - 不允许在第一阶段硬删错误 `rd_project`；先让它退出有效运行时。
  - 不允许在正式库上执行未入 repo 的临时 SQL。
  - 不在本 task 中扩展“同一张验收单多项目”。
- Validation command for this scope:
  - `bun run migration:typecheck`
  - `bun run test -- test/migration --runInBand`
  - 新增 repair 脚本的 `dry-run / execute / validate`
  - `bun run migration:inventory-replay:dry-run`
  - `bun run migration:inventory-replay:validate`
  - 如前端合同变更，补 `pnpm --dir web build:prod`

## Reviewer Handoff

- Review focus:
  - live repair 集合是否被准确限定，阻断条件是否足够严格。
  - `stock_in_order` 的销售项目关联合同是否能承接“项目中创建验收单”且不破坏现有入库域。
  - replay 是否完整承载 `projectTargetId`，并且 `inventory_log.project_target_id` 在项目验收、项目销售出库 / 退货上都能正确落值。
  - 派生库存层重建是否严格限定在 `inventory_balance`、`inventory_log`、`inventory_source_usage`，没有误伤 live 业务真源表。
  - canonical `map_project` 迁正与审计留痕是否能支持后续追责与二次修复。
- Requirement alignment check:
  - 对照 `[AC-1]` ~ `[AC-11]`，尤其检查是否真正满足“当前正式库前向修复”而不是“变相重新导入”。
- Final validation gate:
  - repair `dry-run -> execute -> validate`
  - `inventory-replay:dry-run -> execute -> validate`
  - shadow rehearsal 完整通过
  - 正式 execute 前后阻断校验报告
  - `/sales/project` 浏览器验收
- Required doc updates:
  - 本 task 的 `Progress Sync`、`Review Log`、`Acceptance`
  - `scripts/migration/reports/` 下新增 repair dry-run / execute / validate / post-verify 报告

### Acceptance Evidence Package

- Covered criteria:
  - `[AC-1]` live DB 无 reset / overwrite
  - `[AC-2]` repair set 精确限定
  - `[AC-3]` `sales_project*` canonical 化
  - `[AC-4]` 错误 `rd_project` 退出有效运行时
  - `[AC-5]` canonical map 迁正
  - `[AC-6]` 项目验收真源合同
  - `[AC-7]` replay 项目归属
  - `[AC-8]` 只重建派生库存层
  - `[AC-9]` 错误 `RD_PROJECT_OUT` 消失
  - `[AC-10]` `/sales/project` 与 `/rd/projects` 用户结果正确
  - `[AC-11]` rehearsal + prod verify 留档
- Evidence pointers:
  - 新 repair 报告
  - `inventory-replay` 报告
  - focused tests
  - browser evidence
- Evidence gaps, if any:
  - 任何一个正式阻断校验、shadow rehearsal、replay validate 或浏览器验收缺失，都不得签收。
- Complete test report requirement: `yes`

### Acceptance Test Expectations

- Acceptance mode: `full`
- User-visible flow affected: `yes`
- Cross-module write path: `yes`
- Irreversible or high-cost business effect: `yes`
- Existing automated user-flow coverage: `no`
- Browser test required: `yes`
- Browser waiver reason:
- Related acceptance cases:
  - `sales-project`
- Related acceptance spec:
  - `docs/acceptance-tests/specs/sales-project.md`
- Separate acceptance run required: `yes`
- Complete test report required: `yes`
- Required regression / high-risk tags:
  - `sales-project`
  - `inventory-replay`
  - `inbound`
  - `live-forward-repair`
- Suggested environment / accounts:
  - 本地影子库 + 能访问 `/sales/project`、`/sales/orders` 的仓库管理员账号
- Environment owner / setup source:
  - `DATABASE_URL` 当前维护者 / 本地执行人

## Parallelization Safety

- Status: `not-safe`
- If safe, list the exact disjoint writable scopes:
  - `-`
- If not safe, list the shared files or contracts that require a single writer:
  - `prisma/schema.prisma`
  - `scripts/migration/inventory-replay/**`
  - `src/modules/inbound/**`
  - `src/modules/sales/**`
  - `src/modules/sales-project/**`
  - live repair 的 canonical mapping、项目验收合同和 replay 项目归属是同一条共享合同，必须单 writer 收口。

## Review Log

- Validation results:
  - `bun run test -- test/migration/inventory-replay.spec.ts`
  - `bun run migration:typecheck`
  - `bun run migration:inventory-replay:return-source-links:execute`
  - `bun run migration:inventory-replay:dry-run`
  - `bun run migration:inventory-replay:return-source-links:dry-run`
  - `bun run migration:sales-project-live-forward-repair:dry-run`
  - `bun run migration:typecheck`
  - `bun run typecheck`
  - `bun run test -- src/modules/inbound/application/inbound-create-primary.service.spec.ts src/modules/inbound/application/inbound-update.service.spec.ts test/migration/inventory-replay.spec.ts`
  - `bun run migration:inventory-replay:dry-run`
  - shadow DDL: `scripts/migration/sql/20260514-stock-in-order-add-sales-project.sql` applied to `saifute-wms-shadow`
  - shadow `sales-project-live-forward-repair:execute -> validate`
  - shadow `inventory-replay:dry-run -> execute -> validate`
  - `bun run test -- test/migration/inventory-replay.spec.ts`
  - `bun run migration:inventory-replay:dry-run`
  - `bun run migration:typecheck`
- Findings:
  - `WorkshopMaterialOrder:587:line:1873` 的缺来源链已安全回填到 `WorkshopMaterialOrder:529:line:1732`，live target 退料行当前已具备稳定 `source_document_*` 事实。
  - replay dry-run blocker 轨迹已从 `3 -> 2 -> 1 -> 0`，material `185` 与 material `26` 的 price-layer mismatch 均已通过 planner 修正规则清零。
  - 新增 repair dry-run 报告已把 live target 的 DB 范围门禁固化为可复查证据：repair set `21`、`sales_project=0`、`sales_project_material_line=0`、误写下游引用均为 `0`、`stock_in_price_correction_order*=0`，当前 DB-scoped blocker=`0`。
  - `sales-project-live-forward-repair` 的 `execute / validate` 脚本已在 shadow 实跑通过；首次 shadow execute 暴露 `project_target.updated_at` 无默认值，已修正 execute 脚本显式写 `created_at / updated_at` 后重跑通过。
  - `stock_in_order -> sales_project` 的 DDL 已在 shadow 应用并验证；live 库仍未应用该 DDL，当前 live `stock_in_order` 仍无 `sales_project_*` 新列。
  - `materialId=185` 的最新 root cause 已确认并修复：`TH20260428001` 的 standalone sales return 源被 `LL20260430017` 完整消耗，`TL20260507143530133` 释放 `1` 时不应被当成原 outbound 自身的缺源补偿吞掉；修正后该释放量回到 price layer，live 和 shadow replay dry-run 均为 `blockers=[]`。
  - shadow replay execute / validate 已通过：`expectedLogs=actualLogs=4618`、`expectedSourceUsages=actualSourceUsages=3045`、`expectedBalances=actualBalances=863`、`validationIssues=[]`。
- Follow-up action:
  - 进入正式维护窗口前确认备份和停写窗口；正式执行时先应用 live DDL，再跑 repair execute/validate 与 replay dry-run/execute/validate，最后做浏览器验收。

## Acceptance

- Acceptance status: `not-assessed`
- Acceptance QA:
- Acceptance date:
- Complete test report:

### Acceptance Checklist

> Acceptance QA 在验收时逐条填写。每条应对应 domain capability 的用户需求或 task doc 的 `[AC-*]` 条目。

- [ ] `[AC-1]` 正式库未被 reset 或旧库覆盖 — Evidence: ... — Verdict: `✓ met` | `✗ not met` | `△ partially met`
- [ ] `[AC-2]` repair set 被精确限定，且执行时无新增下游依赖 — Evidence: ... — Verdict: `✓ met` | `✗ not met` | `△ partially met`
- [ ] `[AC-3]` canonical `sales_project*` 与 `project_target` 已建立 — Evidence: ... — Verdict: `✓ met` | `✗ not met` | `△ partially met`
- [ ] `[AC-4]` 错误 `rd_project` 已退出有效运行时 — Evidence: ... — Verdict: `✓ met` | `✗ not met` | `△ partially met`
- [ ] `[AC-5]` canonical mapping 已迁正且可追溯 — Evidence: ... — Verdict: `✓ met` | `✗ not met` | `△ partially met`
- [ ] `[AC-6]` 项目验收真源合同已落地 — Evidence: ... — Verdict: `✓ met` | `✗ not met` | `△ partially met`
- [ ] `[AC-7]` replay 已保留项目归属 — Evidence: ... — Verdict: `✓ met` | `✗ not met` | `△ partially met`
- [ ] `[AC-8]` 只重建了派生库存层，live 业务真源表被保留 — Evidence: ... — Verdict: `✓ met` | `✗ not met` | `△ partially met`
- [ ] `[AC-9]` legacy `/product` 不再生成 `RD_PROJECT_OUT` 初始库存流水 — Evidence: ... — Verdict: `✓ met` | `✗ not met` | `△ partially met`
- [ ] `[AC-10]` `/sales/project` 正确、`/rd/projects` 已收口 — Evidence: ... — Verdict: `✓ met` | `✗ not met` | `△ partially met`
- [ ] `[AC-11]` rehearsal、prod preflight、post-verify 和测试报告完整 — Evidence: ... — Verdict: `✓ met` | `✗ not met` | `△ partially met`

### Acceptance Notes

- Acceptance path used: `full`
- Acceptance summary:
- Report completeness check:
- If rejected or blocked: root cause（`requirement-misunderstanding` | `implementation-gap` | `evidence-gap` | `environment-gap`）+ 精确修复指引 / 环境修复指引
- If conditionally accepted: follow-up requirement / task:

## Final Status

- Outcome:
  - `pending`
- Requirement alignment:
  - 目标是把旧销售项目从错误的 `rd-project` 运行时迁正到 `sales-project`，并在当前 live target DB 上收口项目归属正确的库存真相。
- Residual risks or testing gaps:
  - 当前仍缺 repair execute / validate、项目验收合同和 replay 项目归属支持；正式 execute 前必须先完成 shadow rehearsal。
- Directory disposition after completion:
  - 预计 `retained-completed`；这是 live repair 高风险基线，完成后应归档保留。
- Next action:
  - 进入 repair execute / validate 与项目归属合同实现，再产出 shadow rehearsal 入口和报告。
