# 历史销售项目验收单与项目占用拆分修复

## Metadata

- Scope:
  - 基于旧库 `saifute_composite_product` / `saifute_product_material` 的真实字段，重新拆分历史销售项目物料来源。
  - 只把旧项目物料行中 `acceptance_date IS NOT NULL` 且没有旧库库存选择证据的部分生成项目验收 / 收货单据。
  - 对存在 `material_id`、`saifute_inventory_used.after_order_type = 8` 或 `saifute_inventory_log.related_order_type = 8` 证据的项目物料，按已有库存选择 / 项目归属调整处理，不伪造成验收入库。
  - 对 `acceptance_date IS NULL` 且没有库存选择证据、旧物料主数据为空、业务确认只用于对应项目的 `254` 行，按历史项目专用补录入库处理；验收日期写旧项目数据 `create_time` 的日期。
  - 修复当前 live 库中已经过度生成的 `YS-PROJ-*` 项目验收入库单，避免未到货验收或已有库存选择物料继续抬高项目库存和月报入库数。
- Related requirement:
  - `docs/requirements/domain/sales-project-management.md (F2,F3,F5)`
  - `docs/requirements/domain/inventory-core-module.md (C1,C4,C9)`
  - `docs/architecture/modules/sales-project.md`
  - `docs/architecture/30-java-to-nestjs-data-migration-reference.md`
- Status: `in-progress`
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
- Last updated: `2026-05-16`
- Related upstream task:
  - `docs/tasks/task-20260513-1605-sales-project-live-forward-repair.md`
- Related reports:
  - `scripts/migration/reports/sales-project-legacy-admission-split-audit-report.json`
  - `scripts/migration/reports/sales-project-legacy-admission-split-recovery-dry-run-report.json`
  - `scripts/migration/reports/sales-project-legacy-admission-split-recovery-execute-report.json`
  - `scripts/migration/reports/sales-project-legacy16-admit-dry-run-report.json`
  - `scripts/migration/reports/sales-project-legacy16-admit-execute-report.json`
  - `scripts/migration/reports/sales-project-accepted-inbound-backfill-dry-run-report.json`
  - `scripts/migration/reports/sales-project-accepted-inbound-backfill-execute-report.json`
  - `scripts/migration/reports/inventory-replay-dry-run-report.json`
  - `scripts/migration/reports/inventory-replay-execute-report.json`
  - `scripts/migration/reports/inventory-replay-validate-report.json`
  - `scripts/migration/reports/sales-project-acceptance-backfill-dry-run-report.json`
  - `scripts/migration/reports/sales-project-acceptance-backfill-execute-report.json`
  - `scripts/migration/reports/monthly-reporting-material-category-snapshot-execute-report.json`
- Related files:
  - `docs/tasks/analysis-20260516-sales-project-no-acceptance-and-legacy16.md`
  - `scripts/migration/sales-project-live-forward-repair/backfill-project-acceptance-orders.ts`
  - `scripts/migration/sales-project-live-forward-repair/**`
  - `scripts/migration/inventory-replay/**`
  - `src/modules/sales-project/**`
  - `src/modules/sales/**`
  - `src/modules/inventory-core/**`
  - `src/modules/inbound/**`
  - `web/src/views/sales-project/**`

## Requirement Alignment

- User intent summary:
  - 不再把历史销售项目的全部物料行都当成项目验收入库。
  - 旧项目物料中确认为到货验收且没有已有库存选择证据的部分可以生成验收单。
  - 项目所需物料中直接从已有库存选择的部分，应进入库存归属 / 选择模型，不伪造成到货验收单。
  - 未验收、无库存选择证据且旧物料主数据为空的 `254` 行，已确认是旧系统省略验收单和物料主数据的项目专用物料，应补建项目绑定验收单 / 入库单；验收日期取旧项目 `create_time` 的日期。
  - 项目出库时再实时判断库存是否足够；足够时一键全部出库，不足时返回短缺清单，让用户重新选择。
- Confirmed domain rules:
  - 销售项目不是目标清单，也不是独立仓库；项目实际库存来自真实入库、销售出库 / 退货和明确的库存归属事实。
  - 销售项目本身不得直接过账库存；真实库存减少必须落到 `sales` 出库单。
  - 普通库存转项目 / 项目预留属于独立能力，不能伪造成验收入库或销售出库。
  - 入库时绑定销售项目是项目实际库存；出库时消耗普通库存候选是销售出库事务内的用户选择，不是提前改库存。
- Historical source of truth:
  - 旧项目表：`LEGACY_DATABASE_URL.saifute_composite_product`
  - 旧项目物料表：`LEGACY_DATABASE_URL.saifute_product_material`
  - 判定字段：
    - `saifute_product_material.acceptance_date IS NOT NULL`：只能说明旧项目物料行记录了验收日期，不能单独证明是到货验收入库。
    - `saifute_product_material.material_id IS NOT NULL` + `saifute_inventory_used.after_order_type = 8` / `saifute_inventory_log.related_order_type = 8`：项目直接从已有库存选择 / 消耗的证据。
    - `saifute_product_material.acceptance_date IS NULL` 且无库存选择证据、`material_id IS NULL`：项目专用历史补录入库；旧明细表没有创建时间，验收日期取 `saifute_composite_product.create_time` 的日期。
    - `saifute_composite_product.del_flag = 2`：作废项目，停止自动生成，需人工确认。
- Current live evidence:
  - 修复前 live 目标库曾生成 `YS-PROJ-*` 项目验收入库单：`stock_in_order=21`、`stock_in_order_line=675`，覆盖了当时已迁正的 `sales_project_material_line` 全量，不区分 `acceptance_date`。
  - `2026-05-16` 已先删除旧过度生成单据，并一度按 accepted-only 旧口径重建为 `148` 张 / `501` 行。
  - `2026-05-16` 进一步按旧库库存证据复核：旧 `501` 行 accepted-only 口径中有 `121` 行存在已有库存选择证据。
  - `2026-05-16` 已完成历史项目专用补录入库口径 live 刷新：执行 `recover:execute -> accepted-inbound:execute -> return-source-links:execute -> inventory-replay:execute -> validate` 后，当前 live `YS-PROJ-*` 收敛为 `109` 张 / `634` 行，`overgeneratedYsProjectLineCount=0`。
  - 最新 `migration:sales-project-admission-split:accepted-inbound:dry-run` 复核为 `blockers=[]`、`wouldCreateOrders=0`、`wouldCreateLines=0`。
  - 最新 `inventory-replay:validate` 复核为 `validationIssues=[]`；`inventory-replay:execute` 保留 `303` 条历史 warnings，未形成本 task blocker。
  - 旧库全量项目：`24` 个项目、`758` 条项目物料行。
  - 原有效项目 accepted-inbound 目标 `501` 行、allocation-candidate 目标 `255` 行是按 `acceptance_date` 单一字段拆出的旧口径；按库存选择证据刷新后，候选 / 归属调整 / 到货验收边界需重算。
  - `legacy=22` 是作废项目，`2` 行有验收日期但不得自动计入有效项目 accepted-only 入库；`legacy=30` 作废无明细，`legacy=33` 有效无明细。
  - `migration:sales-project-admission-split:audit` 已改为库存证据感知分类，并已把 `EXPECTED_BASELINE` 切到历史项目专用补录入库修复后状态：`existingGeneratedOrderCount=109`、`existingGeneratedLineCount=634`、`overgeneratedYsProjectLineCount=0`。
  - `2026-05-16` 业务确认：原先 `pendingSelection=254` 的行不是普通库存待选择，而是旧系统因“一次性、只用于这些项目”省略物料主数据和验收单的项目专用物料。脚本目标已调整并正式执行为项目补录入库，项目入库目标为 `380 + 254 = 634` 行、`109` 张 `YS-PROJ-*` 单据。
  - 旧库事实复核：`saifute_product_material` 没有行级 `create_time/created_at`；这 `254` 行对应项目头 `saifute_composite_product.create_time` 均不为空，因此补录验收日期统一取项目头 `create_time` 的日期。
- Requirement-derived risk:
  - 如果未来重新引入“全量 `sales_project_material_line` 都生成验收入库”的规则，会再次把未验收物料写成项目实际库存，并污染项目库存、月报、价格层和出库可选来源。
  - 如果未来继续用 `acceptance_date IS NOT NULL` 作为唯一验收依据，会把旧库里已经从普通库存选择 / 消耗的项目物料重复伪造成到货验收入库。
  - 如果继续把 `254` 行作为普通库存待选择，会丢失旧系统已经归属项目的业务事实，导致项目库存和出库价格层缺来源。
  - 如果补录入库绕过项目绑定验收单直接写库存流水，会失去单据、月报和库存重放的一致性。

## Progress Sync

- Current state:
  - `sales_project*` 迁正已完成；旧销售项目不应再落到 `rd_project*` 运行时。
  - 项目验收入库 backfill 曾被发现过度生成：修复前 live 有 `21` 张 `YS-PROJ-*`，共 `675` 条行。
  - `2026-05-15` 已对 `stock_in_order_line` 缺失物料分类快照执行补齐，当前分类快照缺失为 `0`；这只是修复报表分类，不改变本 task 的验收 / 占用拆分问题。
  - `2026-05-15` 初步调查确认：不能再用“所有 `sales_project_material_line` 都生成验收单”的规则；当时暂用旧库 `acceptance_date` 作为拆分依据。
  - `2026-05-15` 已新增并执行只读审计脚本 `migration:sales-project-admission-split:audit`；报告 `blockers=[]`，确认修复前基线为 `24` 个旧项目、`758` 条旧项目物料行、`465` 条已验收入库行、`208` 条项目占用候选行、`83` 条 `legacy=16` 待修复行、`2` 条作废项目搁置行，以及 `210` 条当时 `YS-PROJ-*` 过度覆盖行。
  - `2026-05-15` 已新增并执行恢复 dry-run `migration:sales-project-admission-split:recover:dry-run`；报告 `blockers=[]`，恢复范围为 `21` 张 `YS-PROJ-*`、`675` 条行，非 replay 下游引用均为 `0`，现存 replay 派生引用为 `inventory_log=675`、`inventory_source_usage(source)=39`。
  - `2026-05-15` 已禁用旧的 `migration:sales-project-acceptance-backfill:execute`，避免继续按全量 `sales_project_material_line` 生成错误项目验收入库。
  - `2026-05-16` 已执行正式恢复和 accepted-only 重建：删除旧 `YS-PROJ-PRJ-LEGACY-*` 单据 `21` 张 / `675` 行；新建按 `salesProject + acceptance_date` 分组的项目验收入库 `139` 张 / `465` 行。
  - `2026-05-16` 已完成派生库存层重建：`inventory-replay:dry-run -> execute -> validate` 均通过，`blockers=[]`、`validationIssues=[]`；重建后新 accepted-only 项目验收入库对应 `inventory_log=465`，旧过度生成单据为 `0`。
  - `2026-05-16` 已关闭历史缺单位 / 映射 blocker，并完成 accepted-inbound 增量补建；随后幂等 dry-run 为 `wouldCreateOrders=0 / wouldCreateLines=0`。
  - `2026-05-16` 已再次执行 `inventory-replay:dry-run -> execute -> validate`：dry-run `blockers=[]`，execute 插入 `inventory_log=5161`、`inventory_source_usage=3087`、`inventory_balance=1189`，validate `validationIssues=[]`。
  - `2026-05-16` 文档复核时重跑 `migration:sales-project-admission-split:accepted-inbound:dry-run`：`blockers=[]`、`eligibleAcceptedLineCount=501`、`wouldCreateOrders=0`、`wouldCreateLines=0`。
  - `2026-05-16` 库存选择证据复核：旧项目物料表本身没有库存来源行字段，但 `material_id IS NOT NULL` 的有效项目物料行与 `saifute_inventory_used.after_order_type = 8`、`saifute_inventory_log.related_order_type = 8` 项目库存使用证据对应。有效项目 `756` 行应拆为 `380` 行到货验收、`122` 行已有库存选择、`254` 行无验收且无库存选择证据；无验收日期 `255` 行里只有 `1` 行可确认已从库存选择。
  - `2026-05-16` 已刷新 `audit-legacy-project-admission-split.ts` 的 generated-line 匹配逻辑：不再用错误的 `salesProjectId + lineNo` 硬对，而改为按 `salesProjectId + acceptanceDate + materialId + quantity + unitPrice + amount` 多重集匹配，post-repair audit 当前 `blockers=0`。
  - `2026-05-16` 已执行库存证据口径正式恢复与重建：
    - `recover:execute` 删除旧 `YS-PROJ-*` `148` 张 / `501` 行。
    - `accepted-inbound:dry-run` 复核为 `blockers=0`、`wouldCreateOrders=99`、`wouldCreateLines=380`。
    - `accepted-inbound:execute` 新建 `99` 张 / `380` 行。
    - `inventory-replay:validate` 通过，`validationIssues=[]`，warnings=`303`。
    - `accepted-inbound:dry-run` 幂等复核为 `blockers=0`、`wouldCreateOrders=0`、`wouldCreateLines=0`。
    - `audit` 幂等复核为 `blockers=0`、`arrivalAccepted=380`、`existingInventorySelection=122`、`pendingSelection=254`、`overgenerated=0`。
  - `2026-05-16` 用户确认 `254` 行应改为历史项目专用补录入库后，`accepted-inbound` 和 `audit` 脚本已调整并执行目标口径：
    - `380` 行保留旧 `acceptance_date`。
    - `254` 行使用旧项目 `create_time` 日期作为验收日期。
    - `122` 行已有库存选择证据继续排除在补录验收单之外。
    - 新目标为 `634` 行项目入库、`109` 张 `YS-PROJ-*` 单据；当前 live 已完成 `recover -> accepted-inbound -> inventory-replay`，并通过 replay validate。
- Acceptance state:
  - `partial-evidence-collected`；历史项目补录入库和 replay 已验证，完整 acceptance 仍需 Step 4 / Step 5 / Step 7 / Step 8。
- Blockers:
  - 全部有效项目当前共有 `122` 行已有库存选择证据物料，需要独立建模为已有库存选择 / 项目归属调整，不得伪造成验收入库。
  - `legacy=22` 为作废项目，虽然 2 行有验收日期，但未人工确认前不得自动计入有效项目 accepted-only 入库；需人工确认处理。
- Next step:
  - 当前 live 已从 `99` 张 / `380` 行项目验收入库刷新到 `109` 张 / `634` 行历史项目入库口径；下一步处理 `122` 行已有库存选择 / 项目归属调整模型，并继续项目出库、读模型、月报和 browser acceptance。

## Investigation Baseline

> `2026-05-16` 注意：以下两张表是旧的 `acceptance_date` 单一字段口径，只能保留为历史调查记录。最终执行基线已按用户确认刷新：到货验收 `380` 行、历史项目专用补录入库 `254` 行、已有库存选择 `122` 行。

### 旧口径：整项目可直接生成验收单

这些项目所有明细行都有 `acceptance_date`，不存在项目占用候选。

| legacy | 项目 | 验收行数 | 当前状态 |
| ---: | --- | ---: | --- |
| `17` | 西上庄硐室 | `72` | 当前已生成 `YS-PROJ-PRJ-LEGACY-17`，重建时可全量保留 |
| `25` | 25年硐室维护 | `4` | 当前已生成 `YS-PROJ-PRJ-LEGACY-25`，重建时可全量保留 |
| `34` | 辅助设施（滑轨） | `1` | 当前已生成 `YS-PROJ-PRJ-LEGACY-34`，重建时可全量保留 |
| `35` | 辅助设施 （滑轨） | `5` | 当前已生成 `YS-PROJ-PRJ-LEGACY-35`，重建时可全量保留 |
| `36` | 榆横除颤仪配件 | `30` | 当前已生成 `YS-PROJ-PRJ-LEGACY-36`，重建时可全量保留 |

### 旧口径：混合项目按验收日期拆分

| legacy | 项目 | 明细 | 有验收日期 | 无验收日期 | 当前状态 |
| ---: | --- | ---: | ---: | ---: | --- |
| `13` | 白龙山硐室 | `42` | `40` | `2` | 已按 40 行重建验收入库；2 行待候选 |
| `14` | 雨汪硐室 | `31` | `30` | `1` | 已按 30 行重建验收入库；1 行待候选 |
| `15` | 转龙湾硐室 | `60` | `59` | `1` | 已按 59 行重建验收入库；1 行待候选 |
| `18` | 凤凰山硐室 | `152` | `108` | `44` | 已按 108 行重建验收入库；44 行待候选 |
| `19` | 梁家矿湿式除尘器300D 共3台 | `20` | `7` | `13` | 已按 7 行重建验收入库；13 行待候选 |
| `20` | 白庄湿式除尘器300D 共2台 | `23` | `7` | `16` | 已按 7 行重建验收入库；16 行待候选 |
| `21` | 新巨龙湿式除尘器300D 共2台 | `18` | `7` | `11` | 已按 7 行重建验收入库；11 行待候选 |
| `23` | 白庄辅助设施 | `8` | `5` | `3` | 已按 5 行重建验收入库；3 行待候选 |
| `24` | 梁宝寺辅助设施 | `7` | `6` | `1` | 已按 6 行重建验收入库；1 行待候选 |
| `26` | 天地煤机2台450D湿式除尘器 | `32` | `11` | `21` | 已按 11 行重建验收入库；21 行待候选 |
| `27` | 天地煤机1台300湿式除尘器 | `37` | `16` | `21` | 已按 16 行重建验收入库；21 行待候选 |
| `28` | 天地煤机1台500D湿式除尘器 | `33` | `13` | `20` | 已按 13 行重建验收入库；20 行待候选 |
| `29` | 青海兰金电子科技有限公司避难硐室材料一批 | `72` | `31` | `41` | 已按 31 行重建验收入库；41 行待候选 |
| `31` | 彭庄1台500D湿式除尘器 | `9` | `6` | `3` | 已按 6 行重建验收入库；3 行待候选 |
| `32` | 朱集西煤矿机载临时支护 | `17` | `7` | `10` | 已按 7 行重建验收入库；10 行待候选 |

### 特殊项目

| legacy | 项目 | 现状 | 处理 |
| ---: | --- | --- | --- |
| `22` | 化学氧校验仪（自主研发） | `del_flag=2` 作废；`2` 行有验收日期 | 不自动计入有效项目 accepted-only 入库；人工确认是否保留 / 回滚 |
| `30` | 双利矿 | 作废且无明细 | 忽略 |
| `33` | 25年硐室维护 | 有效但无明细 | 不生成 |

### 期望数量基线

- 修复前 live 曾过度生成：`21` 张项目验收入库单、`675` 行。
- 全部有效项目按库存证据刷新的当前目标：
  - 到货验收入库行数：`380`。
  - 历史项目专用补录入库行数：`254`；验收日期取旧项目 `create_time` 日期。
  - 已有库存选择 / 项目归属调整行数：`122`。
- `legacy=22` 作废项目的 `2` 行不得自动计入上述有效项目目标。

## Goal And Acceptance Criteria

- Goal:
  - 把历史销售项目物料从“全量项目验收入库”修正为“到货验收入项目库存 + 历史项目专用补录入库 + 已有库存选择 / 归属调整”的真实业务口径。
- Acceptance criteria:
  - `[AC-1]` 正式库不得 full reset，不得用旧库覆盖当前 live target DB。
  - `[AC-2]` 每条 legacy 项目物料行必须有明确分类：`arrival-accepted-inbound`、`historical-project-direct-inbound`、`existing-inventory-selection`、`pending-selection-candidate`、`voided-project-hold`、`excluded-needs-repair` 或 `ignored-no-lines`。
  - `[AC-3]` 当前过度生成的 `YS-PROJ-*` 单据必须被版本化脚本逆向修复或安全恢复；不得保留已有库存选择行产生的项目入库库存。
  - `[AC-4]` 新生成的项目验收 / 收货单据覆盖 `380` 行 `acceptance_date IS NOT NULL` 且没有旧库库存选择证据的 legacy 行，并保留旧 `acceptance_date`。
  - `[AC-5]` `254` 行 `acceptance_date IS NULL` 且没有旧库库存选择证据的历史项目专用物料，必须补建项目绑定验收单 / 入库单；验收日期取旧项目 `create_time` 日期；已有库存选择证据的行必须走独立库存归属 / 选择模型，不得伪造成验收入库。
  - `[AC-6]` 项目一键出库必须是全量实时校验：项目可出库库存全部足够时生成销售出库草稿 / 单据；任一物料不足时不自动部分出库，返回短缺清单让用户重选。
  - `[AC-7]` 出库确认时的库存扣减必须继续走 `sales` / `inventory-core`，不得由 `sales-project` 直接改库存。
  - `[AC-8]` 作废项目 `legacy=22` 的处理必须有人工确认记录；未确认前不得自动保留其 `YS-PROJ-*` 入库。
  - `[AC-9]` `legacy=16` 必须先修缺单位 / 映射 blocker，再进入验收 / 占用拆分；不得因缺单位而静默丢行。
  - `[AC-10]` 修复完成后，项目库存、月报物料分类、库存流水和项目出库候选数量必须相互一致。
  - `[AC-11]` shadow rehearsal、正式执行前报告、正式执行后报告、replay validate、项目页面 / 出库流程验收全部留档。

## Scope And Ownership

- Owned paths for implementation:
  - `scripts/migration/sales-project-live-forward-repair/**`
  - `scripts/migration/inventory-replay/**`
  - `prisma/schema.prisma`（仅当新增项目占用 / 预留表时）
  - `src/modules/sales-project/**`
  - `src/modules/sales/**`
  - `src/modules/inventory-core/**`
  - `src/modules/inbound/**`
  - `test/migration/**`
  - `web/src/views/sales-project/**`
  - `web/src/api/sales-project.js`
- Current task-doc owned path:
  - `docs/tasks/task-20260515-1626-sales-project-legacy-admission-split-repair.md`
- Forbidden or frozen paths:
  - `.env.dev` 只读。
  - 不允许未入 repo 的临时 SQL 直接修改 live。
  - 不得顺手修改与本任务无关的 `reporting`、`master-data`、`rd-subwarehouse` 在途改动。
  - 旧库 `LEGACY_DATABASE_URL` 只作为历史证据，不作为覆盖式导入源。
- Live data policy:
  - business truth 先修正，derived inventory 后重建。
  - 业务表上的删除 / 作废必须只针对脚本生成的 `YS-PROJ-*` 范围，并通过 dry-run 证明不会误伤用户手工单据。
  - 派生库存层只通过版本化 replay 脚本删除 / 重建。

## Implementation Plan

- [x] Step 0: 冻结证据与执行窗口。
  - 重新确认当前 `.env.dev` 指向的 `DATABASE_URL` 和 `LEGACY_DATABASE_URL`。
  - 创建 live 备份，记录文件路径、大小、SHA-256、恢复命令。
  - 停止或冻结会影响 `stock_in_order`、`sales_stock_order`、`sales_project`、`inventory_*` 的写入流量。
  - 在进入正式 execute 前重新跑本 task 的 read-only audit。
  - Result:
    - `2026-05-16` 目标库确认：`DATABASE_URL=127.0.0.1:3306/saifute-wms`，`LEGACY_DATABASE_URL=120.26.116.249:3306/saifute`，source/target 不同库。
    - `2026-05-16` 已停止本仓库后端写入口；前端 Vite 不直接写库。
    - 备份文件：`scripts/migration/backups/target-before-sales-project-admission-split-recovery-20260516-090428.sql`
    - 备份大小：`5231575` bytes
    - SHA-256：`ca07a2490194df42129da14ee2fc0ec5227f7cf5d908a12d0dc9b4b5a51a26c1`
    - 恢复命令：`mysql --defaults-extra-file=<client.cnf> saifute-wms < scripts/migration/backups/target-before-sales-project-admission-split-recovery-20260516-090428.sql`
    - `2026-05-16` legacy=16 admit 前增量备份：
      - 备份文件：`scripts/migration/backups/target-before-sales-project-legacy16-admit-20260516-094852.sql`
      - 备份大小：`5167936` bytes
      - SHA-256：`9511e59a4c6b3af44c3a4db643eb00cd76e9edd86e4d36ca007f1ab2d1e143a8`
    - `2026-05-16` 历史项目专用补录入库 apply 前增量备份：
      - 备份文件：`scripts/migration/backups/target-before-sales-project-historical-direct-inbound-apply-20260516-143106.sql`
      - 备份大小：`5162106` bytes
      - SHA-256：`de65da969b71499e8383d8f73fc98e6037eed5aa627c536d83873b9eeda9c594`

- [x] Step 1: 新增 read-only 分类审计脚本。
  - 建议脚本：`scripts/migration/sales-project-live-forward-repair/audit-legacy-project-admission-split.ts`
  - 输入：
    - `LEGACY_DATABASE_URL.saifute_composite_product`
    - `LEGACY_DATABASE_URL.saifute_product_material`
    - 当前 `DATABASE_URL` 的 `migration_staging.map_project*`、`sales_project*`、`stock_in_order*`、`inventory_log`
  - 输出：
    - 项目级表：每个 legacy 项目的 `lineCount / arrivalAcceptedLineCount / historicalProjectDirectInboundLineCount / existingInventorySelectionLineCount / pendingSelectionLineCount / status / mappedTarget / existingYsProjectOrder`。
    - 行级表：每条 legacy line 的目标分类、目标 `materialId`、目标 `salesProjectId`、是否存在旧库 `material_id`、`saifute_inventory_used`、`saifute_inventory_log` 项目库存证据、是否已被当前 `YS-PROJ-*` 覆盖。
    - 数量基线：`arrival-accepted-inbound`、`historical-project-direct-inbound`、`existing-inventory-selection`、`pending-selection-candidate`、`voided-project-hold`、`excluded-needs-repair`。
  - Gate:
    - 若分类结果不等于本 task 的 Investigation Baseline，必须阻断并更新 task。
  - Result:
    - `2026-05-15` 已落地 `scripts/migration/sales-project-live-forward-repair/audit-legacy-project-admission-split.ts`。
    - `bun run migration:sales-project-admission-split:audit` 通过，报告 `blockers=[]`，分类计数匹配 Investigation Baseline。
    - `2026-05-16` `legacy=16` 修复后再次重跑 audit：分类计数已经进入 post-repair 状态（`accepted-inbound=501`、`allocation-candidate=255`、`excluded-needs-repair=0`、`voided-project-hold=2`），但当前脚本仍硬编码修复前 `EXPECTED_BASELINE` 和旧 `generatedBy=sales-project-acceptance-backfill`，因此报告 `blockers=8`。
    - `2026-05-16` 按库存选择证据复核后，audit 已从 `acceptance_date` 单一规则升级为库存证据感知规则；不能再用 `accepted-inbound=501 / allocation-candidate=255` 作为最终 gate。
    - `2026-05-16` 用户确认 `254` 行为历史项目专用补录入库后，audit 分类已新增 `historical-project-direct-inbound=254`，最终目标 baseline 调整为 `existingGeneratedOrderCount=109`、`existingGeneratedLineCount=634`、`pendingSelectionCandidateLineCount=0`。

- [x] Step 2: 设计当前过度生成 `YS-PROJ-*` 的逆向恢复脚本。
  - 建议脚本：`scripts/migration/sales-project-live-forward-repair/recover-overgenerated-project-acceptance-orders.ts`
  - `dry-run` 必须输出：
    - 将处理的 `stock_in_order` 数量、行数、documentNo 列表。
    - 每张单据是否满足：`document_no LIKE 'YS-PROJ-%'`、`created_by='sales-project-acceptance-backfill'`、`sales_project_id IS NOT NULL`。
    - 是否存在非 replay 下游引用；若存在，阻断。
  - `execute` 允许的业务真源操作：
    - 优先删除或作废仅由 migration 生成且可重建的 `YS-PROJ-*` 单据与行。
    - 不删除 `sales_project*`、`project_target`、`sales_project_material_line`。
  - 派生层操作：
    - 不在恢复脚本里直接手工删 `inventory_log`；业务真源恢复后，通过 `inventory-replay` 统一重建。
  - Gate:
    - 若有任何 `YS-PROJ-*` 不是 migration 生成，或已有人工下游业务引用，必须阻断。
  - Result:
    - `2026-05-15` 已落地 `scripts/migration/sales-project-live-forward-repair/recover-overgenerated-project-acceptance-orders.ts`。
    - `bun run migration:sales-project-admission-split:recover:dry-run` 通过，报告 `blockers=[]`；只发现 replay 派生引用，不存在 `document_relation`、`approval_document`、`factory_number_reservation`、`stock_in_price_correction_order_line` 等非 replay 下游引用。
    - `2026-05-16` 已执行 `bun run migration:sales-project-admission-split:recover:execute`，删除旧过度生成业务真源 `21` 张 / `675` 行。
    - `2026-05-16` 历史项目专用补录入库 apply 时，按当前 live 事实将 recovery scope gate 对齐为 `99` 张 / `380` 行；`recover:dry-run` 通过，`recover:execute` 删除旧口径 `YS-PROJ-*` `99` 张 / `380` 行。

- [x] Step 3: 重建项目验收 / 历史项目专用补录入库单据。
  - 建议脚本：`scripts/migration/sales-project-live-forward-repair/backfill-project-accepted-inbound-orders.ts`
  - `2026-05-16` 用户确认 `254` 行历史项目专用补录入库后，本步骤需要重新执行 `recover -> accepted-inbound`，不能停留在旧 `380` 行状态。
  - 生成规则：
    - 处理 `acceptance_date IS NOT NULL`、项目有效、且没有旧库库存选择证据的 `380` 行。
    - 处理 `acceptance_date IS NULL`、`material_id IS NULL`、无旧库库存选择证据、业务确认只用于项目的 `254` 行；验收日期取旧项目 `saifute_composite_product.create_time` 的日期。
    - `legacy=22` 作废项目默认不处理，除非用户明确确认保留。
    - `legacy=16` 默认不处理，直到映射 blocker 修复；缺单位已确认按 `个` 在迁移侧补齐。
  - 推荐单据粒度：
    - 按 `salesProjectId + bizDate` 分组生成项目验收入库单。
    - `bizDate = acceptance_date` 用于 `380` 行到货验收。
    - `bizDate = DATE(saifute_composite_product.create_time)` 用于 `254` 行历史项目专用补录。
    - documentNo 使用稳定可重跑格式，例如 `YS-PROJ-<salesProjectCode>-<yyyyMMdd>-<seq>`。
  - 行级要求：
    - 保留 material 快照、单位、数量、单价、金额、供应商、备注和物料分类快照。
    - 写入 `sales_project_id`、`sales_project_code_snapshot`、`sales_project_name_snapshot`。
  - Gate:
    - 旧口径 `dry-run` 的 accepted line count 为 `465`，修复 `legacy=16` 后为 `501`。
    - 新库存证据 + 项目专用补录口径下，项目入库目标必须刷新为 `634` 行、预计 `109` 张单据。
  - Result:
    - `2026-05-16` 已落地 `scripts/migration/sales-project-live-forward-repair/backfill-project-accepted-inbound-orders.ts`。
    - `bun run migration:sales-project-admission-split:accepted-inbound:dry-run` 通过，报告 `blockers=[]`，计划生成 `139` 张 / `465` 行；`legacy=16` 缺映射 accepted 行 `36` 条，作废 `legacy=22` accepted 行 `2` 条，均未自动生成。
    - `bun run migration:sales-project-admission-split:accepted-inbound:execute` 已执行，新建 accepted-only 项目验收入库 `139` 张 / `465` 行。
    - `2026-05-16` 已新增并执行 `scripts/migration/sales-project-live-forward-repair/admit-repaired-legacy-sales-project.ts`，将 `legacy=16` 直接补入 `sales_project`，未走 `rd_project:execute` 错误域。
    - `bun run migration:sales-project-admission-split:admit-legacy16:dry-run` 通过：`blockers=[]`、计划 `salesProject=1`、`salesProjectMaterialLines=83`、`projectTarget=1`，其中 `accepted=36`、`allocationCandidate=47`。
    - `bun run migration:sales-project-admission-split:admit-legacy16:execute` 已执行：创建 `PRJ-LEGACY-16`，`projectTargetId=22`，项目物料明细 map `83` 条。
    - `bun run migration:sales-project-admission-split:accepted-inbound:execute` 已再次执行：新增 `legacy=16` 项目验收入库 `9` 张 / `36` 行；总 `YS-PROJ-*` 为 `148` 张 / `501` 行。
    - 后续 `accepted-inbound:dry-run` 幂等复核为 `blockers=[]`、`wouldCreateOrders=0`、`wouldCreateLines=0`。
    - `2026-05-16` 文档复核时再次重跑 `accepted-inbound:dry-run`：`eligibleAcceptedLineCount=501`、`existingGeneratedOrderCount=148`、`voidedAcceptedLineCount=2`、`missingProjectMapLineCount=0`、`missingLineMapLineCount=0`、`wouldCreateOrders=0`、`wouldCreateLines=0`。
    - `2026-05-16` 库存选择证据复核后，本步骤结果被标记为旧口径产物：`501` 行里包含 `121` 行已有库存选择证据。后续必须先刷新脚本为库存证据感知，再决定回滚 / 重建范围。
    - `2026-05-16` 用户确认 `254` 行历史项目专用补录入库后，脚本已刷新并执行为 `634` 行目标：`380` 行使用旧 `acceptance_date`，`254` 行使用旧项目 `create_time` 日期。
    - `bun run migration:sales-project-admission-split:accepted-inbound:dry-run` 通过：`blockers=[]`、`wouldCreateOrders=109`、`wouldCreateLines=634`、`existingInventorySelectionLineCount=122`。
    - `bun run migration:sales-project-admission-split:accepted-inbound:execute` 已执行：新建 `109` 张 / `634` 行。
    - 后续 `accepted-inbound:dry-run` 幂等复核为 `blockers=[]`、`wouldCreateOrders=0`、`wouldCreateLines=0`。
    - 后续 `audit` 复核为 `blockers=0`、`arrivalAccepted=380`、`historicalProjectDirectInbound=254`、`existingInventorySelection=122`、`pendingSelection=0`、`overgenerated=0`。

- [ ] Step 4: 建立已有库存选择 / 项目归属调整模型。
  - 范围：
    - `122` 行已有旧库库存选择 / 消耗证据。
  - 规则：
    - 这些行不得进入历史补录验收单。
    - 后续需要用库存归属 / 选择模型表达旧库普通库存转项目或项目消耗事实。
    - 若只恢复已发生事实，应保持来源链可追溯，不用项目验收入库伪造来源。
  - Gate:
    - audit 必须证明 `existingInventorySelection=122`。
    - audit 必须证明这 `122` 行未被 `YS-PROJ-*` 补录验收单覆盖。

- [ ] Step 5: 实现项目一键出库实时校验。
  - 入口：
    - 项目详情页选择候选行，点击一键出库。
    - 后端读取候选行并按物料聚合需求数量。
  - 校验：
    - 查询当前主仓普通可用库存或用户选择的价格层。
    - 排除已转换、已取消、重复选择的候选行。
    - 若任一物料不足，返回全部短缺明细：`materialCode / materialName / requiredQty / availableQty / shortageQty`。
  - 成功路径：
    - 全部物料足够时，一次性生成 `sales` 出库草稿或正式销售出库单。
    - 出库行绑定 `salesProjectId` 和项目快照。
    - 库存扣减仍由 `sales` / `inventory-core` 完成。
    - 候选行状态置为 `CONVERTED`，记录对应出库单 / 行。
  - 失败路径:
    - 不自动部分出库。
    - 不写库存流水。
    - 不改变候选状态，或只记录一次失败校验日志。

- [x] Step 6: 重建派生库存层。
  - 在业务真源恢复并重建后，执行：
    - `bun run migration:inventory-replay:dry-run`
    - `bun run migration:inventory-replay:execute`
    - `bun run migration:inventory-replay:validate`
  - Gate:
    - dry-run `blockers=[]`
    - validate `validationIssues=[]` 或仅有经 task 明确接受的 warning。
    - `YS-PROJ-*` 产生的 `ACCEPTANCE_IN` 库存流水数量应对应 `380` 行旧验收日期入库 + `254` 行历史项目专用补录入库，不得覆盖 `122` 行已有库存选择证据。
  - Result:
    - `2026-05-16` 首次 `bun run migration:inventory-replay:dry-run` 通过：`blockers=[]`，`totalEvents=5122`，`plannedLogs=5122`，`plannedSourceUsages=3086`，`plannedBalances=1160`，`plannedPriceLayers=854`。
    - `2026-05-16` 首次 `bun run migration:inventory-replay:execute` 通过：`blockers=[]`。
    - `2026-05-16` 首次 `bun run migration:inventory-replay:validate` 通过：`validationIssues=[]`；存在 `302` 条 warnings，未形成本次 blocker。
    - DB 复核：旧 `YS-PROJ-PRJ-LEGACY-*` 单据 `0`；新 accepted-only 项目验收入库 `139` 张 / `465` 行；对应库存流水 `465` 条。
    - `2026-05-16` legacy=16 admit 后再次 replay：`dry-run blockers=[]`，`execute` 插入 `inventory_log=5161`、`inventory_source_usage=3087`、`inventory_balance=1189`，`validate validationIssues=[]`。
    - DB 复核：总 `YS-PROJ-*` 单据 `148` 张 / `501` 行；`PRJ-LEGACY-16` 项目物料 `83` 条，对应项目验收入库库存流水 `36` 条。
    - `2026-05-16` 历史项目专用补录入库后，`inventory-replay:dry-run` 首次发现 `2` 个退料来源链 blocker；执行 `inventory-replay:return-source-links:dry-run -> execute`，回填 `WorkshopMaterialOrder` 退料行 `1978`、`1979` 的来源链。
    - 再次 `inventory-replay:dry-run` 通过：`blockers=[]`、`totalEvents=5343`、`plannedLogs=5343`、`plannedSourceUsages=3123`、`plannedBalances=1345`、`plannedPriceLayers=1057`，warnings=`303`。
    - `inventory-replay:execute` 通过：删除旧 `inventory_log=5089`、`inventory_source_usage=3118`、`inventory_balance=1190`，插入新 `inventory_log=5343`、`inventory_source_usage=3123`、`inventory_balance=1345`。
    - `inventory-replay:validate` 通过：`validationIssues=[]`。
    - DB 复核：`YS-PROJ-*` 单据 `109` 张 / `634` 行，均由 `sales-project-accepted-inbound-backfill` 创建；对应 `StockInOrder` 库存流水 `634` 条。

- [ ] Step 7: 验证 reporting 和项目读模型。
  - 验证 `cp049 / 2026-03` 等样例：
    - 若作废 `legacy=22` 被回滚，月报不应再把作废项目验收入库计入有效项目库存。
    - 若用户确认保留作废项目 `22`，必须在报告中说明保留原因。
  - 验证项目详情：
    - 已验收行显示为项目实际库存 / 项目价格层。
    - 历史项目专用补录行显示为项目实际库存 / 项目价格层。
    - 已有库存选择行按独立归属 / 选择模型验证，不进入补录验收单。
  - 验证项目一键出库：
    - 库存足够：生成销售出库草稿 / 单据。
    - 库存不足：返回短缺清单，用户可重新选择。

- [ ] Step 8: browser acceptance 和最终收口。
  - 覆盖页面：
    - `/sales/project`
    - 项目详情
    - 项目候选出库入口
    - 销售出库草稿 / 编辑页
    - 月报物料分类视图抽样
  - 记录截图 / API 响应 / 数据库核对证据。
  - 更新本 task 的 `Review Log`、`Acceptance`、`Final Status`。

## Coder Handoff

- Execution brief:
  - 当前不是新增一个报表字段，而是修复 live business truth：先恢复旧口径项目验收入库，再按 `380` 行旧 `acceptance_date` + `254` 行项目 `create_time` 补录日期重建项目入库；`122` 行已有库存选择证据另走库存归属 / 选择模型。
  - 所有 live execute 必须有 `dry-run`、报告、备份和 shadow rehearsal。
  - 任何脚本都必须可重跑、可审计、可阻断，不允许人工 SQL 游离在 repo 外。
- Required source refs:
  - `docs/requirements/domain/sales-project-management.md`
  - `docs/architecture/modules/sales-project.md`
  - `docs/architecture/30-java-to-nestjs-data-migration-reference.md`
  - `docs/tasks/task-20260513-1605-sales-project-live-forward-repair.md`
  - `scripts/migration/sales-project-live-forward-repair/backfill-project-acceptance-orders.ts`
- Owned paths:
  - `scripts/migration/sales-project-live-forward-repair/**`
  - `scripts/migration/inventory-replay/**`
  - `prisma/schema.prisma` if new candidate model is needed
  - `src/modules/sales-project/**`
  - `src/modules/sales/**`
  - `src/modules/inventory-core/**`
  - `src/modules/inbound/**`
  - `web/src/views/sales-project/**`
  - `test/migration/**`
- Forbidden shared files:
  - `.env.dev`
  - unrelated reporting / master-data / rd-subwarehouse worktree changes
- Required validation:
  - `bun run migration:typecheck`
  - focused migration tests under `test/migration`
  - new audit / recovery / accepted-inbound / candidate scripts `dry-run`
  - shadow execute / validate before live execute
  - `bun run migration:inventory-replay:dry-run`
  - `bun run migration:inventory-replay:execute`
  - `bun run migration:inventory-replay:validate`
  - frontend build if sales-project UI changes: `bun --cwd web build:stage`

## Reviewer Handoff

- Findings focus:
  - `254` 行历史项目专用补录入库是否都使用旧项目 `create_time` 日期作为验收日期。
  - 当前过度生成的 `YS-PROJ-*` 是否被安全逆向修复，且没有误伤人工单据。
  - `122` 行已有库存选择证据是否没有被补录验收单覆盖。
  - 一键出库是否全量校验库存，不足时阻断并返回短缺清单。
  - `legacy=16`、`legacy=22`、`legacy=30`、`legacy=33` 是否按特殊规则处理。
  - replay 后项目库存、月报、库存流水是否一致。
- Browser decision inputs:
  - User-visible flow affected: `yes`，项目详情和一键出库。
  - Cross-module write path: `yes`，`sales-project -> sales -> inventory-core`。
  - Irreversible or high-cost business effect: `yes`，live business truth 和派生库存层。
  - Existing automated user-flow coverage: `partial`，需要补 migration 和 sales-project UI / API 验收。
  - Browser test required: `yes`。
- Acceptance evidence package:
  - Audit report: classification of all legacy project rows.
  - Recovery report: overgenerated `YS-PROJ-*` repaired.
  - Project inbound report: `380` accepted rows + `254` historical project-direct rows generated, with date source counts.
  - Existing-inventory-selection report: `122` rows remain outside补录验收单.
  - Replay reports: dry-run / execute / validate.
  - Browser/API evidence for project detail and one-click outbound.

## Parallelization Safety

- Safe to parallelize:
  - Read-only audit script and UI design review can proceed in parallel.
  - Migration recovery script and existing-inventory-selection model design can be designed in parallel, but not executed in parallel.
- Not safe to parallelize:
  - Any live execute touching `stock_in_order*`, `sales_project*`, `inventory_*` must be serialized.
  - `inventory-replay:execute` must run only after business truth scripts complete and validate.
  - Multiple writers must not edit the same migration script set without explicit ownership split.
- Recommended ownership split if subagents are explicitly requested later:
  - Planner: update task and acceptance spec.
  - Coder A: migration audit / recovery / accepted-inbound scripts.
  - Coder B: existing-inventory-selection model and sales-project outbound flow.
  - Reviewer: read-only review of data safety, replay coupling, UI/API contract.
  - Acceptance QA: browser and live API validation after parent approves execution.

## Review Log

- `2026-05-15`: Task created from live investigation. Review not yet run.
- `2026-05-15`: Step 1 applied. Read-only audit script added and executed; legacy / target split baseline matches the task investigation, so recovery-script design can proceed.
- `2026-05-15`: Step 2 dry-run applied. Recovery script scoped the generated `YS-PROJ-*` orders and found no non-replay downstream references; live execute remains gated by backup / freeze.
- `2026-05-16`: Live execution completed for Step 0 / Step 2 / Step 3 / Step 6. Backup captured, backend writes frozen, overgenerated project acceptance orders removed, accepted-only project inbound rebuilt, and inventory replay validate passed with no validation issues.
- `2026-05-16`: `legacy=16` 缺单位处理已按用户确认值 `个` 固化到迁移 transformer；真实 dry-run 复核 `legacy=16` 已进入迁移计划，6 个销轴自动创建物料单位均为 `个`。
- `2026-05-16`: Executed next step for `legacy=16`: created a fresh target backup, stopped backend write entry, admitted `PRJ-LEGACY-16` directly into `sales_project` with `83` lines, added accepted-only project inbound `9` orders / `36` lines, reran inventory replay execute/validate, and verified `validationIssues=[]`.
- `2026-05-16`: Documentation check reran `accepted-inbound:dry-run` and confirmed no remaining accepted-inbound work (`wouldCreateOrders=0 / wouldCreateLines=0`). The read-only audit script now reports post-repair classification counts but still raises pre-repair expected-drift blockers, so its gate must be refreshed before final acceptance.
- `2026-05-16`: User confirmed the `254` no-acceptance/no-inventory-evidence rows are historical project-only materials, not普通库存待选择. Updated audit and accepted-inbound scripts so these rows are `historical-project-direct-inbound` and use old project `create_time` as the补录验收日期.
- `2026-05-16`: Applied the historical project-direct inbound repair on live target: backed up current target, recovered old `99` / `380` `YS-PROJ-*` rows, generated new `109` / `634` rows, backfilled two return source links, reran inventory replay execute / validate, and verified `validationIssues=[]`.

## Acceptance

- Mode: `full`
- Status: `partial-evidence-collected`
- Required cases:
  - `[CASE-1]` audit report classifies all `24` legacy projects and all `758` legacy project material rows.
  - `[CASE-2]` overgenerated `YS-PROJ-*` recovery dry-run and execute match expected counts and do not touch non-generated business rows.
  - `[CASE-3]` 到货验收入库 generation 覆盖没有库存选择证据的验收行；按当前有效项目刷新目标为 `380` 行。
  - `[CASE-4]` 历史项目专用补录入库覆盖无验收且无库存选择证据的 `254` 行，验收日期取旧项目 `create_time` 日期。
  - `[CASE-4a]` existing-inventory-selection classification 覆盖当前有效项目 `122` 行，并且不得伪造成项目验收入库。
  - `[CASE-5]` `YS-PROJ-*` 生成目标为 `634` 行项目入库，且 date source counts 能区分 `acceptance_date=380` 与 `project_create_time=254`。
  - `[CASE-6]` project one-click outbound succeeds when all selected project inventory quantities are available.
  - `[CASE-7]` project one-click outbound fails all-or-nothing and returns shortage details when any selected quantity is unavailable.
  - `[CASE-8]` replay validate passes after business truth repair.
  - `[CASE-9]` project detail page shows accepted and historical project-direct inbound rows as actual project inventory / price layers.
  - `[CASE-10]` monthly reporting counts accepted + historical project-direct inbound consistently and does not count existing-inventory-selection rows as project acceptance inbound.

## Final Status

- Current status: `in-progress`
- Legacy repair status: `historical project-direct inbound applied and replay-validated`
- Completion condition:
  - Task stays active until the `122` existing-inventory-selection flow, project one-click outbound, browser acceptance, and final reporting consistency checks are complete.
  - After acceptance, retain this task as provenance because it documents a high-risk live data repair and the final source-of-truth split between accepted project inbound, historical project-direct inbound, and existing-inventory-selection rows.
