# 90 端口库存流水待核实修复

**执行日期**：2026-09-22（Asia/Shanghai）  
**运行服务**：`/Users/sft/Projects/saifute-wms-deploy`，HTTP `:90`  
**执行标识**：`reversed-outbound-history-20260922001315107`

## 根因

历史回填为逆操作流水复制成本来源时，部分 `REVERSAL_IN` 的成本分配明细仍保留了原出库的 `OUT` 方向。快照回放会拒绝方向不一致的分配，进而将该流水及其后续价格层余额显示为“待核实”。

## 修复

- 在完整生产备份后，以固定证据清单补齐 7 组旧出库及其冲回的 20 条成本分配。
- 出库分配为 `OUT`，冲回分配为 `IN`；每条分配的来源、数量、单价和金额与原流水闭合。
- 事务内校验 `inventory_balance` 与 `inventory_log` 未变化，并将修复前后快照写入：
  `/Users/sft/Projects/saifute-wms-deploy/storage/database-backups/reversed-outbound-history-20260922001315107/`
- 生产备份：
  `/Users/sft/Projects/saifute-wms-deploy/storage/database-backups/saifute-wms-reversed-outbound-pre-20260922001308017.sql`
- 备份 SHA-256：`2b68038b4bf014d0097765d8912c8b7de8d6998df9adf3b5beca5e060892df4b`

## 验收

- 修复前快照：`VERIFIED 13,845 / UNRESOLVED 18 / SNAPSHOT_UNRESOLVED 50`
- 修复后快照：`VERIFIED 13,907 / UNRESOLVED 4 / SNAPSHOT_UNRESOLVED 2`
- 来源占用数量/金额闭合异常：`0`
- 90 端口 `/`：HTTP `200`
- 90 端口 `/api/auth/captcha`：HTTP `200`
- TypeScript、Biome、价格层快照和逆操作单测通过（14 tests）

## 保留的历史待核实

剩余 4 条是两组改单前旧流水：`43980/43981`（`CK20260625002`）和 `43984/44441`（`CK20260625004`）。当前来源占用分别为 `40` 和 `250`，而旧流水数量分别为 `34` 和 `90`；这些占用是后续修订累计结果，无法唯一拆回旧流水。继续自动分配会伪造成本来源，因此保留为待核实。两条 `SNAPSHOT_UNRESOLVED` 是其后续流水受到这两个历史断点的连锁影响。

## 防回归

- `scripts/lib/price-layer-reversal-plan.mjs` 统一验证逆操作引用、物料、库存范围、数量、方向和来源成本。
- `scripts/lib/price-layer-reversal-plan.test.mjs` 覆盖正常逆操作、入库冲回、证据不匹配和方向复用错误。
- `scripts/repair-reversed-outbound-history.mjs` 默认只读；执行必须提供备份路径及 SHA-256，并在事务内做不变量校验。
- `scripts/repair-price-layer-history.mjs` 不再把原出库方向直接复制到逆操作，并拒绝已有方向错配时直接应用。

## 2026-09-22 后续闭合与状态拆分

- 按业务确认的 FIFO 口径补齐：`43980 = 43262×5 + 43257×29`，`43984 = 43904×90`；对应 `43981`、`44441` 以 `IN` 方向冲回。
- 新备份：`/Users/sft/Projects/saifute-wms-deploy/storage/database-backups/saifute-wms-reversed-outbound-pre-20260922004032731.sql`。
- 新备份 SHA-256：`f15527733a0aba2750988f409b3740280790bf7ceeff8f6d6afa1d36881dac98`。
- 当前生产数据库回放：`VERIFIED 13,914 / UNRESOLVED 0 / SNAPSHOT_UNRESOLVED 0`。
- 读模型新增 `SOURCE_UNRESOLVED`：有流水单价和数量时照常计算价格层数量，同时单独提示来源分配未唯一确认；只有缺少单价/数量证据时才显示数量待核实。
