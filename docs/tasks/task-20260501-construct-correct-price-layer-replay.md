# Construct Correct Price-Layer Replay

## Metadata

- Scope:
  - 构建真正正确的库存价格层：以已填充的历史业务单据为原料，按业务时间顺序重放库存事实，生成带成本价的 `inventory_log` 来源流水，并按 FIFO 重建 `inventory_source_usage` 来源分配。
  - 本 task 不是 UI 展示修复，也不是新增“价格库存余额表”；目标是让现有 `inventory-core.listPriceLayerAvailability()` 能从真实来源层自然聚合出正确价格层。
  - 本 task 必须先 dry-run、对账、阻塞异常，再允许 execute；不能为了让页面有价格而直接按当前余额伪造一层库存。
- Related requirement:
  - `docs/requirements/domain/inventory-core-module.md (F3/F4)`
  - `docs/requirements/domain/sales-business-module.md (F2/F3)`
  - `docs/requirements/domain/inbound-business-module.md (F4/F8)`
  - `docs/requirements/domain/workshop-material-module.md (C4)`
- Status: `in-progress`
- Review status: `not-reviewed`
- Delivery mode: `standard`
- Acceptance mode: `full`
- Acceptance status: `not-assessed`
- Complete test report required: `yes`
- Lifecycle disposition: `active`
- Planner: `parent-orchestrator`
- Coder: `parent-orchestrator`
- Reviewer: `saifute-code-reviewer`
- Acceptance QA: `saifute-acceptance-qa`
- Last updated: `2026-05-04`
- Related checklist: `-`
- Related acceptance spec:
  - `docs/acceptance-tests/specs/inbound.md`
  - `docs/acceptance-tests/specs/workshop-material.md`
  - `docs/acceptance-tests/specs/sales-project.md`
- Related acceptance run: (optional)
- Related files:
  - `docs/architecture/20-wms-database-tables-and-schema.md`
  - `docs/architecture/21-database-field-dictionary.md`
  - `docs/architecture/30-java-to-nestjs-data-migration-reference.md`
  - `docs/architecture/modules/inventory-core.md`
  - `docs/architecture/modules/inbound.md`
  - `docs/architecture/modules/sales.md`
  - `docs/workspace/notes/price-layer-outbound-traceability.md`
  - `docs/workspace/notes/inbound-price-correction-after-consumption.md`
  - `prisma/schema.prisma`
  - `src/modules/inventory-core/application/inventory-query.service.ts`
  - `src/modules/inventory-core/application/inventory-settlement.service.ts`
  - `src/modules/inventory-core/infrastructure/inventory.repository.ts`
  - `scripts/migration/inventory-replay/**`
  - related migration reports under `scripts/migration/reports/**`

## Requirement Alignment

- Domain capability:
  - `inventory-core F3/F4`: FIFO 来源追溯、来源成本桥接、价格层可用库存与调价来源切换。
  - `sales F2/F3`: 出库价格层选择、同价内 FIFO、出库来源追溯。
  - `inbound F4/F8`: 入库来源成本快照、入库调价后剩余来源切换。
  - `workshop-material C4`: 领料 / 报废来源不可省略，退料尽量回指原领料行并保持价格可解释。
- User intent summary:
  - 用户已填充历史业务单据，但价格层仍为空或不可信，需要一份可执行 task 来说明如何基于历史单据构建真正正确的价格层。
  - 用户明确希望用“人话”理解后落执行计划：历史单据只是原料，正确价格层必须来自“入库来源 - 已消费来源”的重放结果。
- Acceptance criteria carried into this task:
  - `[AC-1]` 重放后每条可作为库存来源的入库事实都有 `inventory_log.unit_cost` / `cost_amount`。
  - `[AC-2]` 每条出库、领料、报废、调价出库等消费事实都能按 FIFO 或显式来源写入 `inventory_source_usage`。
  - `[AC-3]` 每个 `materialId + stockScopeId` 的价格层可用量合计必须等于 `inventory_balance.quantity_on_hand`。
  - `[AC-4]` replay dry-run 能报告并阻塞负库存、未批准缺单价、孤儿 source usage、重复幂等键、余额不一致等异常；已批准的未知价 / 赠品入库可按 `0.00` 成本留痕进入来源层。
  - `[AC-5]` execute 必须事务化、可预检、可回滚；禁止在异常未确认时覆盖当前库存事实。
- Requirement evidence expectations:
  - migration dry-run report 能列出事件数、来源数、消费分配数、余额对账、价格层对账、异常清单。
  - focused tests 覆盖多价格入库、同价内 FIFO、跨价格禁止借用、退料 / 退货回补、零成本来源留痕、负库存阻塞。
  - live DB 验证能证明 `inventory_log`、`inventory_source_usage`、`inventory_balance` 三者闭环。
- Open questions requiring user confirmation:
  - 如果历史单据重放出的余额与当前 `inventory_balance` 不一致，以哪一个为准？本 task 默认以“历史单据”为权威；差异必须修历史单据或形成显式调整单，不能静默取当前余额。
  - 对 11 个缺最新入库价格但有当前余额的物料，是否补历史入库单价 / 调整单价，还是导入期初成本价？本 task 默认阻塞并要求补价；`2026-05-02` 已批准的历史 `0.00` 入库来源按未知价 / 赠品零估值处理。

## Progress Sync

- Phase progress:
  - `configured target DB reachable; execute attempted and correctly blocked by dry-run blockers`
- Current state observed in local target DB:
  - `inventory_balance` 有数据，但 `inventory_log` 为 `0`；价格层查询没有来源层可聚合。
  - `inventory_source_usage` 存在历史残留，但当前全是孤儿占用，不能作为可信追溯链。
  - 已有 `scripts/migration/inventory-replay` 基础，但当前只适合继续扩展，不能直接视为完整价格层重建工具。
  - `2026-05-01` implementation pass:
    - replay dry-run now plans `inventory_log` and `inventory_source_usage` together, maintains an in-memory FIFO source pool, and reports blocker-level reconciliation failures.
    - linked sales / workshop / RD returns release original consumer source usages instead of creating a duplicate return source layer.
    - RD handoff OUT now creates allocation-piece RD handoff IN source logs in the plan so transferred stock preserves price-layer granularity.
    - `StockInPriceCorrectionOrder` remains an explicit coverage blocker until source-log remapping is implemented.
    - `.env.dev` currently points to `192.168.6.41:3306/saifute-wms`; TCP connection timed out from this machine, so the configured target dry-run did not complete.
    - One-off local validation against the same database name on `127.0.0.1` completed dry-run with `totalEvents=3`, `plannedLogs=3`, `plannedSourceUsages=0`, `plannedPriceLayers=3`, and `blockers=0`. This is not a substitute for the configured target DB run.
  - `2026-05-01` configured target execution attempt:
    - `bun run migration:inventory-replay:dry-run` reached `saifute-wms` and produced `totalEvents=4547`, `plannedLogs=4540`, `plannedSourceUsages=2527`, `plannedPriceLayers=964`.
    - dry-run reported `409` blockers: `fifo-source-insufficient=120`, `negative-balance-during-replay=99`, `price-layer-balance-mismatch=100`, `return-source-link-missing=63`, `source-log-cost-missing=20`, `invalid-event-quantity=7`.
    - existing target facts before execute remained `inventory_balance=835`, `inventory_log=0`, `inventory_source_usage=1897`, all `source_usage` rows orphaned.
    - `bun run migration:inventory-replay:execute` was attempted and correctly exited `1` with `Replay plan has blockers. Execute is disabled until dry-run is clean.` No replay write was applied.
    - `bun run migration:inventory-replay:validate` exited `1`, as expected for a blocked / not-executed replay: `expectedLogs=4540`, `actualLogs=0`, `expectedSourceUsages=2527`, `actualSourceUsages=1897`, `balanceMismatches=529`, `validationIssues=1370`.
  - `2026-05-01` negative stock-in offset pass:
    - Confirmed the `7` invalid quantities were historical stock-in offset rows, not positive inbound sources.
    - Replay now maps negative `stock_in_order_line.quantity` rows to `REVERSAL_OUT` with positive `changeQty`, preserving `StockInOrder` as the business document and using the row `unit_price` as selected cost for same-price source consumption.
    - Focused validation passed: `bun run migration:typecheck`; `bun run test -- test/migration/inventory-replay.spec.ts --runInBand`; `bunx biome check --write scripts/migration/inventory-replay test/migration/inventory-replay.spec.ts`.
    - Configured-target dry-run now reports `invalid-event-quantity=0`, `REVERSAL_OUT=7`, and `411` remaining blockers: `fifo-source-insufficient=124`, `negative-balance-during-replay=102`, `price-layer-balance-mismatch=102`, `return-source-link-missing=63`, `source-log-cost-missing=20`.
    - Four offset rows still expose source issues and need source-line/date/scope investigation: `YS20260103011` line 4 missing `1000` of `zjq095`, `RK20260306005` line 1 missing `4` of `wg17`, `RK20260321001` line 1 missing `2` of `cp001`, `YS20260324003` line 2 missing `6` of `zh45`.
  - `2026-05-01` future-source offset safety pass:
    - Replay now allows only `REVERSAL_OUT` offset rows to consume matched future stock-in sources, guarded by same material, same stock scope, same unit cost, and future source document type `StockInOrder`; normal outbound / pick rows still cannot borrow future sources.
    - Focused safety validation passed: `bun run migration:typecheck`; `bun run test -- test/migration/inventory-replay.spec.ts --runInBand`; `bunx biome check --write scripts/migration/inventory-replay test/migration/inventory-replay.spec.ts`.
    - Configured-target dry-run now reports `406` remaining blockers: `fifo-source-insufficient=121`, `negative-balance-during-replay=101`, `price-layer-balance-mismatch=101`, `return-source-link-missing=63`, `source-log-cost-missing=20`.
    - Future-source matches are reported as warnings for audit:
      - `YS20260103011` line 4 consumed future source `YS20260130009` line 3 for `1000` of `zjq095` at `0.18`.
      - `RK20260321001` line 1 consumed future source `RK20260325005` line 2 for `2` of `cp001` at `117.00`.
      - `YS20260324003` line 2 consumed future source `YS20260422002` line 1 for `6` of `zh45` at `2.10`.
    - One offset row remains unresolved: `RK20260306005` line 1 (`wg17`, material `446`, `-4 @ 397.00`) has no matched positive source at the same unit cost in current posted stock-in data.
  - `2026-05-01` deferred unresolved offset pass:
    - `wg17` / `RK20260306005` line 1 (`materialId=446`, `lineId=2651`, `-4 @ 397.00`) was confirmed to have no positive `397.00` stock-in source, even without lifecycle/status filtering.
    - Replay now treats fully unmatched `REVERSAL_OUT` offset rows as deferred document-only blockers: no `inventory_log` or `inventory_source_usage` is planned for that row, but execute remains blocked by `stock-in-offset-source-unresolved`.
    - Focused validation passed: `bun run migration:typecheck`; `bun run test -- test/migration/inventory-replay.spec.ts --runInBand`; `bunx biome check --write scripts/migration/inventory-replay test/migration/inventory-replay.spec.ts`.
    - Configured-target dry-run now reports `403` blockers: `fifo-source-insufficient=120`, `negative-balance-during-replay=99`, `price-layer-balance-mismatch=100`, `return-source-link-missing=63`, `source-log-cost-missing=20`, `stock-in-offset-source-unresolved=1`.
    - Negative stock-in offset handling is now stable for this pass: `invalid-event-quantity=0`; six offset rows are resolved by same-price past/future source allocation; `wg17` is isolated as the single explicitly deferred offset blocker.
  - `2026-05-02` zero-cost source decision:
    - User confirmed the 20 `source-log-cost-missing` rows are acceptable to process as `0.00` cost for now because the real price is unknown or the material is a gifted / not-price-tracked item.
    - Replay now marks these source logs with note `Accepted zero-cost source: unknown price or gifted item.` and reports warnings instead of blocking execution on this category.
    - Any future source row with negative cost, or with inconsistent positive amount but missing unit price, still needs investigation; the approved shortcut is only for unknown / gifted zero valuation, not arbitrary cost rewriting.
    - `bun run migration:inventory-replay:dry-run` now reports `source-log-cost-missing=0`, `zero-cost source warnings=20`, and `362` remaining blockers: `fifo-source-insufficient=110`, `negative-balance-during-replay=99`, `price-layer-balance-mismatch=89`, `return-source-link-missing=63`, `stock-in-offset-source-unresolved=1`.
    - Historical consumer rows with `selected_unit_cost=0.00` are still treated as “no explicit selected price” in replay because many legacy rows use `0.00` as a default, not a real user-selected zero-price layer.
  - `2026-05-02` return-source candidate report pass:
    - Replay now emits `returnSourceLinkCandidates` in the dry-run report for unlinked `SALES_RETURN_IN` / `RETURN_IN` rows.
    - Candidate matching is diagnostic-only and does not auto-write `source_document_*`: same return family, same material, same stock scope, source date not after return date, subtracts already linked return quantity, treats legacy `0.00` consumer / return cost as unknown rather than a cost match, then sorts by same workshop, unit-cost match, nearest previous date, and remaining returnable quantity.
    - Rows with one covering candidate are marked `review-and-link-unique-covering-candidate` only when quantity covers the return and known workshop / cost signals do not conflict; multiple / partial / conflicting-cost / no-candidate rows remain manual-review cases.
    - Focused validation passed: `bun run migration:typecheck`; `bun run test -- test/migration/inventory-replay.spec.ts --runInBand`.
    - Configured-target dry-run completed and still correctly blocked execute with `362` blockers. Candidate summary: `totalMissingLinks=63`, `review-and-link-unique-covering-candidate=5`, `manual-review-multiple-covering-candidates=31`, `manual-review-no-full-quantity-candidate=7`, `manual-review-no-candidate=20`.
    - Human-readable candidate reports:
      - `scripts/migration/reports/inventory-replay-return-source-link-candidates.md`
      - `scripts/migration/reports/inventory-replay-return-source-link-candidates.tsv`
  - `2026-05-02` self-decidable return-source backfill pass:
    - Applied the 5 `review-and-link-unique-covering-candidate` rows to the configured target DB in one guarded transaction, updating only return lines whose `source_document_type/source_document_id/source_document_line_id` were still null.
    - Backfilled rows:
      - `TH20260111001` line 23 -> `CK20260106003` line 197
      - `TH20260114003` line 30 -> `CK20260114009` line 252
      - `TH20260306001` line 44 -> `CK20260209001` line 355
      - `TH20260403001` line 58 -> `CK20260403001` line 623
      - `TH20260403001` line 59 -> `CK20260403001` line 624
    - Replay planner now reorders same-day linked returns after their source outbound line, so `TH20260114003` line 30 can release its original source usage.
    - Configured-target dry-run after backfill and ordering repair still correctly blocked execute with `359` blockers: `fifo-source-insufficient=109`, `negative-balance-during-replay=101`, `price-layer-balance-mismatch=88`, `return-source-link-missing=58`, `return-source-release-insufficient=2`, `stock-in-offset-source-unresolved=1`.
    - The 2 remaining `return-source-release-insufficient` rows are linked returns whose original outbound lines have no releasable planned source usage because those outbound rows themselves replay from zero available stock: `TH20260403001` line 58, `TH20260403001` line 59.
    - Human-readable backfill report:
      - `scripts/migration/reports/inventory-replay-return-source-link-backfill-report.md`
  - `2026-05-03` unfunded outbound linked-return offset pass:
    - User confirmed historical stock movement allowed outbound before return; when an original `OUTBOUND_OUT` / `PICK_OUT` line is fully unfunded and linked return quantity exactly equals the original outbound quantity, replay treats the pair as document-only zero-net offset.
    - Offset rows do not create `inventory_log`, `inventory_source_usage`, or price layers, and are emitted as `UNFUNDED_RETURN_OFFSET` warnings instead of blockers.
    - Applied to `CK20260403001` line 623 <-> `TH20260403001` line 58 and `CK20260403001` line 624 <-> `TH20260403001` line 59.
    - Configured-target dry-run now correctly blocks execute with `353` blockers: `fifo-source-insufficient=107`, `negative-balance-during-replay=99`, `price-layer-balance-mismatch=88`, `return-source-link-missing=58`, `stock-in-offset-source-unresolved=1`; `return-source-release-insufficient=0`.
  - `2026-05-03` best-candidate return-source backfill pass:
    - User authorized Codex to choose the best candidate where candidates exist.
    - Added guarded tooling: `migration:inventory-replay:return-source-links:dry-run` / `execute`; selection is deterministic, consumes candidate remaining quantity globally, and simulates the chosen links before write so selections that would still raise `return-source-release-insufficient` are skipped.
    - Applied `30` net safe source-link backfills on the configured target (`sales_stock_order_line=25`, `workshop_material_order_line=5`), updating only still-null `source_document_type/source_document_id/source_document_line_id` rows.
    - Three initially selected rows were cleared because replay proved the selected source could not release the full return quantity; no `return-source-release-insufficient` blocker remains.
    - Configured-target dry-run now correctly blocks execute with `311` blockers: `fifo-source-insufficient=101`, `negative-balance-during-replay=99`, `price-layer-balance-mismatch=82`, `return-source-link-missing=28`, `stock-in-offset-source-unresolved=1`; `return-source-release-insufficient=0`.
  - `2026-05-04` remark-first mismatch handling pass:
    - 对剩余退货 / 退料来源链不干净的数据，replay dry-run 现在把单头备注和行备注写入候选 JSON、中文 MD 和 TSV 报告。
    - 备注中的日期线索（例如 `冲25.10.31`、`冲红26.1.6`）会解析成标准业务日期，并在候选排序中优先命中对应日期的原出库 / 原领料；`TH20260320001` line 53 因 `冲红26.1.6` 明确选中 `CK20260106015` line 190。
    - `已报废`、`送检`、客户 / 地点名称等业务说明先作为处置信号进入报告；在没有可证明来源关系或明确业务规则前，不自动伪造成库存来源。
  - `2026-05-04` sales-price-vs-cost rule:
    - 用户确认“出库可能和入库的价格不一样”，因为入库记录的是库存成本价，销售出库记录的是销售价。
    - Replay 读取销售历史事件时不再把 `sales_stock_order_line.unit_price / amount` 当作库存成本回填；销售成本只信任 `cost_unit_price`、`selected_unit_cost`，以及原消费行释放出的 `inventory_source_usage`。
    - 车间领料 / 报废 / 退料的 `unit_price / amount` 按内部成本核算口径处理，不按销售价口径处理。
    - 退货来源候选仍报告单据价格 / 成本信号差异，但该差异不再排除可覆盖候选；原单关系应优先看物料、库存范围、日期备注、数量可覆盖、车间等业务链路。
    - Guarded execute applied `3` additional source-link backfills: `TL20260207001` line 17 -> `LL20260202001` line 460, `TH20260320001` line 53 -> `CK20260106015` line 190, and `TL20260407001` line 30 -> `LL20260202001` line 460.
    - Configured-target dry-run now correctly blocks execute with `74` blockers: `fifo-source-insufficient=20`, `negative-balance-during-replay=9`, `price-layer-balance-mismatch=17`, `return-source-link-missing=25`, `return-source-release-insufficient=2`, `stock-in-offset-source-unresolved=1`.
  - `2026-05-04` standalone no-source workshop return pass:
    - 对“无候选但有明确正成本”的历史车间退料，replay 不再伪造原领料关系，也不再阻塞为 `return-source-link-missing`；而是将退料行作为独立 `RETURN_IN` 来源层，使用退料行 `unitPrice` / `amount` 作为成本，并写入 `STANDALONE_RETURN_SOURCE` warning 和 log note。
    - 该规则只适用于 `RETURN_IN`、无 `source_document_*`、候选数为 `0`、`unitCost > 0` 且 `costAmount` 非负的行；销售退货、无成本退料、有候选但需拆多来源的退料仍然保持 blocker。
    - Configured-target dry-run now correctly blocks execute with `51` blockers: `fifo-source-insufficient=14`, `negative-balance-during-replay=8`, `price-layer-balance-mismatch=13`, `return-source-link-missing=13`, `return-source-release-insufficient=2`, `stock-in-offset-source-unresolved=1`.
    - Best-candidate dry-run now selects `0` rows and skips `13`: `no-candidate=8`, `no-single-candidate-can-cover-return-quantity=5`.
- Acceptance state:
  - `not-assessed`
- Blockers:
  - 必须先解决历史单据重放后出现的负库存 / 未批准缺价 / 余额差异；不能带异常 execute。最近一次 configured-target dry-run 是 `2026-05-04` 的 `51` 个 blocker。
  - 必须明确业务退货、车间退料、RD handoff、调价等入库型事实是否作为后续 FIFO 来源，以及对应成本如何继承。
  - 必须处理剩余 `13` 条退货 / 退料缺来源链、`14` 条消费来源不足、`8` 条重放负余额、`13` 条价格层余额差异、`2` 条已关联但原出库来源不可释放，以及 `1` 条已明确延期的 `stock-in-offset-source-unresolved`；原 `20` 条成本价为 `0.00` 的来源入库已按用户确认标记为零成本来源并转为 warning，`12` 条无候选但有正成本的车间退料已按独立来源留痕处理。负数入库行已按历史对冲语义映射为 `REVERSAL_OUT`，并允许受限匹配未来 stock-in 来源，不再作为 `invalid-event-quantity` 阻塞。
- Next step:
  - 按 blocker 分类修复历史单据或补显式期初 / 调整事实，然后重新运行 configured-target dry-run；只有报告 `blockers=[]` 时才允许 execute。

### Blocker Repair Order

按依赖关系处理，不按数量大小处理。直接历史数据问题要先解决，`price-layer-balance-mismatch` 属于派生对账结果，应放在最后复核。

1. `stock-in-offset-source-unresolved=1`
   - 当前只剩 `wg17` / `RK20260306005` line 1 (`materialId=446`, `lineId=2651`, `-4 @ 397.00`) 无法匹配同样价格的正向入库 stock-in 来源。
   - 处理方式：确认是否缺历史正向来源、单价录错、日期 / 状态错误，或业务上需要形成显式调整事实；不能把该行静默并入普通出库，也不能生成无成本来源。
2. `source-log-cost-missing=20` — `2026-05-02` 已按用户确认改为零成本留痕来源
   - 人话解释：这些行只填了数量，没填价格；用户确认先按 `0.00` 处理，因为不知道价格，或属于赠品 / 不关注价格的物料。
   - 处理方式：replay 不再把这 20 条作为 blocker；对应 `inventory_log.unit_cost = 0.00`、`cost_amount = 0.00`，并写入 note `Accepted zero-cost source: unknown price or gifted item.`。
   - 后续要求：如果以后查到真实历史价，再通过显式调价 / 估值调整修正，不能静默改掉已执行 replay 的来源事实。
3. `return-source-link-missing=13` / `return-source-release-insufficient=2`
   - 退货 / 退料优先回指原销售出库行或原领料行，才能释放原 `inventory_source_usage` 并继承原来源成本。
   - 处理方式：先看 dry-run report 的 `returnSourceLinkCandidates`；有候选时可运行最佳候选回填脚本，但必须满足单条候选能覆盖退回数量，且模拟 replay 后不会产生 `return-source-release-insufficient`。
   - 已关联但原出库完全无来源且退货数量精确等于原出库数量的行，已按历史先出后退的零净额对冲规则跳过库存事实并保留 `UNFUNDED_RETURN_OFFSET` warning；部分退回或数量不等仍必须 blocker。
   - `2026-05-04` 已按“销售价不等于库存成本价”的业务口径执行 `3` 条安全候选回填，并按“无候选但有正成本车间退料可作为独立来源”的口径处理 `12` 条历史退料；当前最佳候选 dry-run 可选择 `0` 条、跳过 `13` 条，跳过原因主要是销售退货无候选或退料需要拆多来源。
4. `fifo-source-insufficient=14` 与 `negative-balance-during-replay=8`
   - 这两类通常同源：消费发生时，`materialId + stockScopeId` 没有足够已成本化来源。
   - 处理方式：按物料 / 库存范围拉时间线，检查缺前置入库、`bizDate` 顺序、`stock_scope_id` / workshop 归属、重复过账、错误状态；若历史期初就有库存，应补显式期初成本来源，而不是改当前 `inventory_balance`。
5. `price-layer-balance-mismatch=13`
   - 最后处理。它是计划余额与来源层剩余量不一致的结果，不是独立根因。
   - 处理方式：前四类清理后重新 dry-run；若仍存在，按 `sourceAvailableQty < balanceQty` 查“入库未形成来源”，按 `sourceAvailableQty > balanceQty` 查“出库未成功占用来源”。

每完成一批修复都必须重新运行 configured-target dry-run，并用 blocker 分组结果确认趋势。只有 `blockers=[]` 时才能进入 execute。

## Goal And Acceptance Criteria

- Goal:
  - 从已填充的历史业务单据重建可信库存来源层，让现有价格层查询按 `material + stockScope + unitCost` 聚合出真实剩余库存，并让后续出库可以继续按价格层做 FIFO 与成本追溯。
- Acceptance criteria:
  - `[AC-1]` `scripts/migration/inventory-replay` 能读取所有影响库存的有效历史单据，并生成确定性事件流。
  - `[AC-2]` 入库类事件写入 `inventory_log` 时携带稳定成本价；成本来源优先级明确。已批准的未知价 / 赠品来源允许 `0.00` 成本，但必须在 log note 和 dry-run warning 中标记。
  - `[AC-3]` 出库类事件按 FIFO 分配来源并写入 `inventory_source_usage`；若用户选了价格层，则只在该价格层内分配。
  - `[AC-4]` 退货 / 退料 / 回补类事件能保持成本可解释：优先回指原消费来源；无法回指时必须按显式业务单价形成新的可追溯来源层并在报告中标记。
  - `[AC-5]` replay 结果满足：`sum(priceLayer.availableQty) = inventory_balance.quantityOnHand`，并且每个 source log 的 `allocatedQty - releasedQty <= changeQty`。
  - `[AC-6]` dry-run 对异常采取 blocker，而不是 warning-only：负库存、未批准缺单价、来源不足、孤儿占用、重复幂等键、不可解释退料都必须阻止 execute；已批准零成本来源只作为 warning。
  - `[AC-7]` execute 必须在单事务或可恢复批次内完成，产出执行报告，并保留执行前 counts / checksum。
  - `[AC-8]` 完成后库存页面“价格库存明细”有数据，且任一物料价格层数量与库存余额一致。

## Scope And Ownership

- Allowed code paths:
  - `scripts/migration/inventory-replay/**`
  - `scripts/migration/reports/**`
  - `test/migration/**`
  - `src/modules/inventory-core/application/inventory-query.service.ts`
  - `src/modules/inventory-core/application/inventory-settlement.service.ts`
  - `src/modules/inventory-core/infrastructure/inventory.repository.ts`
  - `src/modules/inventory-core/application/inventory.constants.ts`
  - narrowly related DTO / test files if runtime source eligibility must be corrected
- Frozen or shared paths:
  - `prisma/schema.prisma` is read-only unless implementation proves schema cannot express the required replay facts.
  - Business modules are read-only by default; replay should consume historical documents, not rewrite business services.
  - Frontend files are read-only by default; UI already has a price-layer entry point and should not be used to fake data.
- Task doc owner:
  - `parent-orchestrator`
- Contracts that must not change silently:
  - `inventory-core` remains the only stock fact model; no new price-layer balance table.
  - `inventory_balance` remains keyed by `materialId + stockScopeId`; price is a source-layer attribute, not a balance dimension.
  - `inventory_log.unitCost` is the source-layer cost truth.
  - `inventory_source_usage` is required for every real consumption chain that affects source availability.
  - Historical cost snapshots are facts; do not rewrite old consumer line costs except through an explicit migration decision and report.
  - `sales_stock_order_line.unitPrice / amount` is the sales business price, not inventory source cost; replay must not derive cost layers from it.
  - `workshop_material_order_line.unitPrice / amount` is an internal consumption-cost accounting signal, not a sales price.

## Implementation Plan

- [ ] Step 1: Freeze replay authority and inventory event coverage.
  - List every effective historical document family that can change stock:
    - `stock_in_order` / `stock_in_order_line`
    - `sales_stock_order` / `sales_stock_order_line`
    - `workshop_material_order` / `workshop_material_order_line`
    - `rd_project` / `rd_project_material_line` if still part of accepted historical flow
    - `rd_project_material_action` / `_line`
    - `rd_handoff_order` / `_line`
    - `rd_stocktake_order` / `_line`
    - `stock_in_price_correction_order` / `_line`
  - For each family, define whether the event is source-producing `IN`, source-consuming `OUT`, source-returning `IN`, reversal, or adjustment.
  - Decide and document whether historical voided documents should be skipped or replayed as original + reversal. Default: replay only `EFFECTIVE` posted documents unless audit evidence requires reversal history.

- [ ] Step 2: Define cost-source rules before coding allocations.
  - `ACCEPTANCE_IN` / `PRODUCTION_RECEIPT_IN`: use `stock_in_order_line.unit_price`; `cost_amount = quantity * unit_price` or line `amount` if already frozen.
  - `PRICE_CORRECTION_IN`: use correction line `correct_unit_cost`; generated source points back to original stock-in / source log.
  - `RD_HANDOFF_IN`: inherit actual allocated source cost from `RD_HANDOFF_OUT`; if one handoff line consumes multiple prices, either split generated source logs by price or preserve allocation pieces so price layer remains exact.
  - `SALES_RETURN_IN` / `RETURN_IN`: if linked to original outbound / pick line, inherit returned source cost; if unlinked, require explicit line cost and mark as no-source return in report.
  - `OUTBOUND_OUT`: sales `unit_price / amount` is sales-price data, not a trusted cost source; use `selected_unit_cost` for selected price-layer allocation and use actual FIFO allocations for settled outbound cost.
  - `PICK_OUT` / `SCRAP_OUT` / `RETURN_IN`: workshop-material `unit_price / amount` is cost-accounting data; keep it separate from the sales-price meaning of `sales.unit_price`.
  - `RD_STOCKTAKE_IN`: require explicit adjustment cost rule; default blocker unless the line carries a trusted cost or the business accepts a documented valuation source.
  - `2026-05-02` approved valuation rule: historical source rows with unknown price or gifted / not-price-tracked items may be replayed at `0.00` cost, but must be marked in `inventory_log.note` and dry-run warnings.
  - Never fill missing cost with material master data unless a separate explicit valuation rule is approved.

- [x] Step 3: Build deterministic event planning and preflight reports.
  - Sort by `bizDate`, then stable business priority, then document id / line id; document any same-day assumptions.
  - Generate planned `inventory_balance` and planned `inventory_log` without writing DB.
  - Report:
    - event counts by operation type
    - source-producing count, approved zero-cost source count / warnings, and remaining missing-cost count
    - planned balance by `materialId + stockScopeId`
    - negative balance buckets
    - duplicate idempotency keys
    - document families not covered by replay
  - Default behavior: any negative bucket or unapproved missing cost is an execute blocker; approved zero-cost sources are warning-only.

- [x] Step 4: Implement FIFO allocation planner.
  - Maintain an in-memory source pool keyed by at least `materialId + stockScopeId`.
  - Each source pool entry carries `sourceLogKey`, `availableQty`, `unitCost`, `bizDate`, document refs, and optional project attribution.
  - For each consumption event:
    - if selected price exists, allocate only from matching `unitCost`
    - if explicit source exists, allocate from that source only
    - otherwise allocate FIFO from oldest available eligible source
  - Emit planned `inventory_source_usage` rows for each allocation piece.
  - Emit blocker when source is insufficient, wrong price, wrong scope, missing project attribution, or cost cannot be computed.

- [ ] Step 5: Reconcile returns, releases, and source eligibility.
  - Implemented for linked `SALES_RETURN_IN` / `RETURN_IN` by releasing original consumer source usages.
  - Implemented a narrow zero-net historical offset for fully unfunded `OUTBOUND_OUT` / `PICK_OUT` rows whose linked return quantity exactly equals the original outbound quantity; these rows are document-only and do not create price layers.
  - Still blocked for unlinked returns and price correction until explicit valuation / source remapping rules are accepted.
  - Decide runtime source eligibility for `RETURN_IN`, `SALES_RETURN_IN`, `RD_HANDOFF_IN`, `RD_STOCKTAKE_IN`, and `PRICE_CORRECTION_IN`.
  - Align `FIFO_SOURCE_OPERATION_TYPES` with replay semantics; returned stock that is allowed to be consumed later must be represented as a costed source layer or as a released original source, not both.
  - For linked returns, prefer preserving cost traceability to original source allocation.
  - For unlinked returns, create a new source layer only with explicit trusted cost and report it as no-source return.

- [ ] Step 6: Write execute path with transactional safety.
  - Code path now inserts planned `inventory_source_usage` after planned logs and blocks execute when dry-run has blockers.
  - Live execute not run because the configured `.env.dev` target is unreachable.
  - Before execute:
    - confirm no blockers
    - record pre-execute counts and checksums for `inventory_balance`, `inventory_log`, `inventory_source_usage`
    - verify all current `inventory_source_usage` rows are either valid and intentionally preserved, or orphaned and intentionally removed
  - Execute:
    - clear orphan source usages only when fully proven orphaned
    - rebuild `inventory_balance`
    - insert planned `inventory_log`
    - insert planned `inventory_source_usage`
    - optionally update consumer cost snapshots only if the task explicitly adds that as an accepted migration output
  - After execute:
    - write execution report with inserted / deleted counts and reconciliation summary
    - fail if post-checks do not match dry-run plan

- [ ] Step 7: Add validation command and standalone audit.
  - Validation now checks source-usage count, orphan usages, material mismatch, over-allocation, and price-layer-vs-balance mismatch.
  - Extend `migration:inventory-replay:validate` so it checks:
    - planned balance equals DB balance
    - every source usage references existing source log
    - every source usage material matches source log material
    - every allocated net quantity is within source log `change_qty`
    - every positive balance has at least one source layer, including approved zero-cost layers, unless explicitly exempted
    - price-layer quantity sum equals balance quantity for each material / scope
  - Add report examples for blockers and successful replay.

- [ ] Step 8: Add automated tests for replay and runtime query.
  - Added focused planner tests for FIFO, selected price, insufficient source, linked return release, unfunded outbound linked-return offset, best-candidate source-link selection with candidate remaining consumption, zero-cost source, and duplicate idempotency keys.
  - Test multiple prices:
    - IN 100 @ 10, IN 50 @ 12, OUT 80 => price layers `10:20`, `12:50`.
  - Test selected price:
    - selected `12`, OUT 30 consumes only `12` source.
  - Test insufficient selected price:
    - selected `10`, OUT beyond `10` source blocks even if `12` has stock.
  - Test return:
    - linked return restores or recreates source at original cost; resulting price layer is correct.
    - fully unfunded outbound plus exact linked return is skipped as zero-net document-only offset; partial return remains blocked.
    - best-candidate backfill selection does not overuse the same source line across multiple returns.
  - Test zero-cost source:
    - approved source-producing historical line without cost is replayed as `0.00` with log note and dry-run warning.
  - Test current local data shape:
    - orphan `source_usage` is detected and cannot corrupt new source log ids.

- [ ] Step 9: Perform staged live verification.
  - `bun run migration:typecheck`: passed.
  - `bun run test -- test/migration/inventory-replay.spec.ts --runInBand`: passed.
  - `bunx biome check --write scripts/migration/inventory-replay test/migration/inventory-replay.spec.ts`: formatted changed files.
  - `bun run migration:inventory-replay:dry-run`: failed against configured `.env.dev` target because `192.168.6.41:3306` timed out.
  - one-off local dry-run with `DATABASE_URL` host overridden to `127.0.0.1`: passed and wrote `scripts/migration/reports/inventory-replay-dry-run-report.json`.
  - `bun run migration:inventory-replay:dry-run` on configured `.env.dev` target: reached DB and blocked with `409` blockers.
  - `bun run migration:inventory-replay:execute` on configured `.env.dev` target: exited `1` before write because blockers exist.
  - `bun run migration:inventory-replay:validate` on configured `.env.dev` target: exited `1`, confirming replay has not been applied and current DB still mismatches the plan.
  - Run dry-run on local target DB and inspect blocker report.
  - Resolve blocker data by fixing historical documents or adding explicit adjustment / valuation rows.
  - Run execute only after dry-run is clean.
  - Run validate after execute.
  - Verify API:
    - `GET /api/inventory/price-layers?materialId=<id>&stockScope=MAIN`
  - Verify UI:
    - stock inventory detail dialog shows price rows.

## Coder Handoff

- Execution brief:
  - Build a historical replay engine, not a UI workaround.
  - Start with dry-run and reports; do not implement destructive execute until the planned event stream and allocation report are reviewable.
  - The correct price layer is the remaining unconsumed quantity of source logs grouped by `unitCost`, including explicitly marked `0.00` layers for unknown-price / gifted items.
  - Use existing `inventory-core` semantics where possible, but migration code may need its own deterministic planner because it reconstructs historical facts offline.
- Required source docs or files:
  - `docs/requirements/domain/inventory-core-module.md`
  - `docs/requirements/domain/sales-business-module.md`
  - `docs/requirements/domain/workshop-material-module.md`
  - `docs/architecture/20-wms-database-tables-and-schema.md`
  - `docs/architecture/30-java-to-nestjs-data-migration-reference.md`
  - `docs/architecture/modules/inventory-core.md`
  - `docs/workspace/notes/price-layer-outbound-traceability.md`
  - `docs/workspace/notes/inbound-price-correction-after-consumption.md`
  - `scripts/migration/inventory-replay/**`
  - `src/modules/inventory-core/application/inventory-query.service.ts`
  - `src/modules/inventory-core/application/inventory-settlement.service.ts`
  - `src/modules/inventory-core/infrastructure/inventory.repository.ts`
- Owned paths:
  - `scripts/migration/inventory-replay/**`
  - `test/migration/**`
  - `src/modules/inventory-core/application/inventory.constants.ts`
  - focused inventory-core specs if source eligibility changes
  - `docs/tasks/task-20260501-construct-correct-price-layer-replay.md`
- Forbidden shared files:
  - `web/src/**` unless API verification proves frontend response mapping is wrong.
  - business module services unless replay exposes an actual runtime contract bug.
  - `prisma/schema.prisma` unless schema cannot represent required facts.
- Constraints and non-goals:
  - Do not add a price-layer balance table.
  - Do not derive costs from material master data by default.
  - Do not silently accept negative inventory.
  - Do not rebuild only `inventory_log` and leave `inventory_source_usage` empty.
  - Do not preserve orphan `inventory_source_usage` rows if they can collide with new source log ids.
  - Do not execute against target DB without clean dry-run, report, and explicit command boundary.
- Validation command for this scope:
  - `bun run migration:typecheck`
  - `bun run migration:inventory-replay:dry-run`
  - `bun run migration:inventory-replay:validate`
  - `bun run test -- test/migration/inventory-replay*.spec.ts src/modules/inventory-core/application/inventory-query-and-cost.service.spec.ts src/modules/inventory-core/application/inventory-settlement-fifo.service.spec.ts`
  - `bun run typecheck`

## Reviewer Handoff

- Review focus:
  - Does replay construct source truth, not just balances?
  - Are costs inherited from the correct historical document fields?
  - Are all consuming documents represented in `inventory_source_usage`?
  - Are returns / handoff / stocktake semantics explicit and not double-counted?
  - Are blockers strict enough to prevent a misleading price layer?
- Requirement alignment check:
  - `inventory-core C1/C4/C6/C8` must remain true.
  - `sales F2/F3` selected price cannot borrow other price layers.
  - `workshop-material C4` return traceability must be preserved or explicitly reported as no-source.
- Final validation gate:
  - Review dry-run report, execute guard behavior, post-execute validation logic, and focused tests.
- Required doc updates:
  - Update this task with validation evidence.
  - If runtime source eligibility changes, update `docs/architecture/modules/inventory-core.md` and relevant domain docs in a separate documented slice or explicit follow-up.

### Acceptance Evidence Package

- Covered criteria:
  - `[AC-1]` through `[AC-8]`
- Evidence pointers:
  - dry-run report path
  - execute report path
  - validate report path
  - focused test output
  - DB verification SQL snippets
  - API / UI verification notes
- Evidence gaps, if any:
  - Must list unresolved historical data gaps by material / document / line.
- Complete test report requirement: `yes`

### Acceptance Test Expectations

- Acceptance mode: `full`
- User-visible flow affected: `yes`
- Cross-module write path: `yes`
- Irreversible or high-cost business effect: `yes`
- Existing automated user-flow coverage: `partial`
- Browser test required: `yes`
- Browser waiver reason: `-`
- Related acceptance cases:
  - inventory stock detail price-layer view
  - sales outbound selected price-layer submit
  - workshop pick / return source traceability
- Related acceptance spec:
  - `docs/acceptance-tests/specs/inbound.md`
  - `docs/acceptance-tests/specs/workshop-material.md`
  - `docs/acceptance-tests/specs/sales-project.md`
- Separate acceptance run required: `yes`
- Complete test report required: `yes`
- Required regression / high-risk tags:
  - `inventory-replay`
  - `price-layer`
  - `fifo-source-usage`
  - `migration-execute-guard`
- Suggested environment / accounts:
  - local target DB from `.env.dev`; account with inventory balance and sales outbound permissions
- Environment owner / setup source:
  - local developer environment; see `.env.dev` and migration reports

## Parallelization Safety

- Status: `not-safe-initially`
- If safe, list the exact disjoint writable scopes:
  - After Step 1/2 are frozen, tests and report formatting can be split from replay allocation implementation.
- If not safe, list the shared files or contracts that require a single writer:
  - `scripts/migration/inventory-replay/**`
  - source eligibility rules in `inventory-core`
  - cost inheritance rules for returns / handoff / stocktake
  - execute guard and destructive DB cleanup behavior

## Review Log

- Validation results:
  - `pending`
- Findings:
  - `pending`
- Follow-up action:
  - `pending`

## Acceptance

- Acceptance status: `not-assessed`
- Acceptance QA:
  - `saifute-acceptance-qa`
- Acceptance date:
  - `-`
- Complete test report:
  - `required`

### Acceptance Checklist

> Acceptance QA 在验收时逐条填写。每条应对应 domain capability 的用户需求或 task doc 的 `[AC-*]` 条目。

- [ ] `[AC-1]` 所有来源入库流水有可信 `unit_cost` / `cost_amount` — Evidence: ... — Verdict: `✓ met` | `✗ not met` | `△ partially met`
- [ ] `[AC-2]` 所有消费链写入 `inventory_source_usage` — Evidence: ... — Verdict: `✓ met` | `✗ not met` | `△ partially met`
- [ ] `[AC-3]` 价格层数量合计等于库存余额 — Evidence: ... — Verdict: `✓ met` | `✗ not met` | `△ partially met`
- [ ] `[AC-4]` dry-run 对异常严格阻塞 — Evidence: ... — Verdict: `✓ met` | `✗ not met` | `△ partially met`
- [ ] `[AC-5]` execute 有事务保护和执行报告 — Evidence: ... — Verdict: `✓ met` | `✗ not met` | `△ partially met`
- [ ] `[AC-6]` 页面和 API 能查看正确价格层 — Evidence: ... — Verdict: `✓ met` | `✗ not met` | `△ partially met`

### Acceptance Notes

- Acceptance path used: `full`
- Acceptance summary:
  - `pending`
- Report completeness check:
  - `pending`
- If rejected or blocked:
  - root cause + precise fix pointer required
- If conditionally accepted:
  - follow-up requirement / task required

## Final Status

- Outcome:
  - `planned`
- Requirement alignment:
  - aligns with source-layer price truth and inventory-core single-writer rules
- Residual risks or testing gaps:
  - historical documents may still contain gaps that require business-side correction or explicit adjustment documents
  - return / handoff source eligibility may require runtime contract clarification
- Directory disposition after completion:
  - keep `active` while the task is still open; once completed, move to `archive/retained-completed/` and sync `docs/tasks/TASK_CENTER.md`
- Next action:
  - implement Step 1 dry-run event coverage and allocation report before any execute path
