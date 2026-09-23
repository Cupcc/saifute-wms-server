# 价格层多来源出库成本分配修复

## Metadata

- Status: `accepted`
- Scope: `inventory-core`、`sales`、库存流水读模型、生产历史数据
- Trigger: `CK20260401001 / cp002` 的真实来源为 116 元 22 台、117 元 975 台，但库存流水把加权平均价 116.98 当成价格层。

## Goal And Acceptance Criteria

- 文档统一：平均成本只作单据汇总；每个实际价格层生成一条库存流水，价格层行数量和金额直接落在流水行上。
- 新过账：同一单据明细的多个价格层流水在一个过账组内原子提交；同一价格层内部可继续记录多个来源成本分配，逆操作逐层复制并反向记账。
- 查询：价格层快照直接按价格层流水行累计，来源分配用于追溯；多层出库不再出现 116.98 的虚假价格层。
- 历史：按现有来源占用回填成本分配，不重跑 FIFO，不改库存数量或来源占用；若来源真值与旧成本快照冲突，必须通过有备份、有审计的历史成本重分类处理。
- 发布：类型检查、Prisma 校验/生成、定向单测、生产构建和健康检查通过。

## Referenced Docs

- `docs/workspace/notes/price-layer-outbound-traceability.md`
- `docs/architecture/modules/inventory-core.md`
- `docs/architecture/20-wms-database-tables-and-schema.md`
- `docs/requirements/domain/inventory-core-module.md`
- `docs/requirements/domain/sales-business-module.md`

## 口径修正（2026-09-21）

本任务早期文案“`inventory_log` 保留一条总数量事务、读模型再拆成多行”已经废止。正式口径是：同一单据明细中每个实际成本价格层各生成一条 `inventory_log`；总库存余额在同一事务中按这些层行数量合计更新，不再生成用户可见的总数量主流水。历史兼容迁移和 cp002 闭合方案见 [cp002 价格层历史闭合设计](../../issues/cp002-price-layer-history-closure-design-20260921.md)。

## Execution Plan

1. Add `inventory_log_cost_allocation` as an immutable cost split table.
2. Write split rows together with consumer OUT logs and reversal IN logs.
3. Change inventory log price-layer read model to expand one total transaction into one row per price layer.
4. Add UI columns for each price-layer row, including its own before/change/after quantity.
5. Validate and deploy the application.
6. Backup production, backfill historical splits from source usages, and run reconciliation queries.

## Safety Rules

- Never delete existing `inventory_log`, `inventory_balance`, or source usage facts. Ordinary backfill does not overwrite them; an evidence-backed historical cost reclassification may update only the affected cost snapshot after recording old/new values in `inventory_log_cost_reclassification`.
- Backfill is idempotent on `(inventory_log_id, source_log_id)`.
- A backfill row is created only when the source usage identifies the source log and allocated quantity.
- Any unreconcilable row is reported and left untouched.

## Progress

- [x] Unified documentation and catalog entry
- [x] Schema and runtime code
- [x] Tests and build
- [x] Production release
- [x] Historical backfill and reconciliation

## Delivery Evidence

- Production backup: `/Users/sft/Projects/saifute-wms-deploy/storage/database-backups/saifute-wms-price-layer-pre-20260920T073612Z.sql`
- Backup SHA-256: `d587224e0937aea6e262ad199bdec95e9336a760ae4409bad3a5be99b6abdff9`
- Production DDL: added only `inventory_log_cost_allocation`; unrelated pending schema changes were excluded.
- Release baseline: backend `0.1.5`, frontend `1.0.9`; this follow-up release bumps backend to `0.1.6` and frontend to `1.0.10`.
- Post-release health: `/api/auth/captcha` and `/` both returned HTTP 200; LaunchAgent state `running`.
- Historical repair: all 6,874 evidence-complete outbound logs were eligible; the transaction backfilled 8,535 outbound allocation rows plus 457 reversal allocation rows (8,995 rows total including the original 3 target rows). Quantity/cost reconciliation mismatches after backfill: `0`.
- `CK20260401001` / line `432` / inventory log `38796` received three idempotent allocation rows:
  - source `38626`: 116 元 × 20
  - source `38701`: 116 元 × 2
  - source `38618`: 117 元 × 975
- Reconciliation: quantity `997`, cost `116,627`; price-layer breakdown `116 元 × 22` and `117 元 × 975`; original `inventory_log` and `inventory_balance` were unchanged. The exact breakdown is verified; its historical before/after snapshot remains marked unresolved where earlier legacy logs lack source decomposition.
- Focused regression: 6 suites / 33 tests passed; typecheck, Prisma validate/generate, backend build and frontend production build passed. Full Jest ran 115 suites / 586 tests; 112 suites / 582 tests passed. The 3 failing RBAC suites assert the pre-existing RD procurement permission contract changed by unrelated dirty-worktree edits (`rd:procurement-request:*` versus `rd:procurement-demand:*`) and are outside this task.

## Split-row follow-up (2026-09-21)

- User-facing correction: the inventory log must render one row per price layer, while the underlying inventory transaction remains one quantity transaction with immutable cost allocations.
- `inventory-core` now pages price-layer rows directly. The target model stores one `inventory_log` row per document price layer; legacy aggregate rows are compatibility audit data only.
- CK20260401001 production read-model verification: `total=2`, rows `116×22 / 2,552 / before 38 / after 16` and `117×975 / 114,075 / before 967 / after -8`; the two rows represent the document's two price-layer entries.
- A negative 117 price-layer balance is displayed and highlighted for investigation; it is not silently clamped to zero because the historical source sequence contains a later-dated 117-cost source used by earlier records.
- Follow-up release: backend `0.1.6`, frontend `1.0.10`; runtime snapshot `/Users/sft/Projects/saifute-wms-deploy/rollback/pre-deploy-price-layer-split-20260921T000359Z`.

## Deploy API fix (2026-09-21)

- Root cause: the deploy artifact contained the new price-layer paginator but an older `inventory-log-query.repository` bundle. The paginator returned `116/117` row keys while the snapshot reader still returned only the legacy `116.98` parent row, causing `库存价格层行缺失` and HTTP 500.
- Fix: rebuilt the deploy artifact with the matching query repository, snapshot reader, and page repository together.
- Verification: deployed reader returns `total=2`, row keys `38796:none:116` and `38796:none:117`; API and web health checks return HTTP 200.
- Deploy rollback snapshot: `/Users/sft/Projects/saifute-wms-deploy/rollback/pre-deploy-price-layer-deploy-fix-20260921T001444Z`.

## cp002 历史闭合执行（2026-09-21）

- 执行标识：`data-repair-20260921-cp002-layer-closure-v1`。
- 补齐 39865、45159 的成本来源分配，并将 41747 按 48701 / 117 元来源重分类；库存余额保持 47 台不变。
- cp002 价格层重放结果：116 元层 `0`、117 元层 `47`、总库存 `47`；历史未解析集合清零。
- 41747 的旧 116 元 / 580 元与新 117 元 / 585 元差异写入 `inventory_log_cost_reclassification` 审计表。
- 生产备份与前后定向快照见 [cp002 价格层历史闭合设计](../../issues/cp002-price-layer-history-closure-design-20260921.md)。
