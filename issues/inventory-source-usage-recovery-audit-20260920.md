# 销售出库改单来源占用异常审查

**审查时间**：2026-09-20（Asia/Shanghai）  
**审查范围**：生产运行库（通过 `/Users/sft/Projects/saifute-wms-deploy/.env.prod` 只读查询）  
**审查对象**：销售出库改单后，库存流水已经冲回并重发，但 `inventory_source_usage` 没有恢复有效来源占用的情况。  
**数据变更**：本次没有执行任何数据库写入、修复、补流水或重算。

## 一、判定口径

本次审查没有把所有 `RELEASED` 状态都视为错误。销售退货、改单删除明细、换物料后旧来源失效，都会合法地产生已释放的历史来源记录。只有同时满足下面条件的明细才计入“确认异常”：

1. 存在当前仍有效的销售出库 `OUTBOUND_OUT` 流水（没有被后续 `REVERSAL_IN` 逆操作）。
2. 出库流水对应的销售明细仍存在，且数量与当前有效出库流水一致。
3. 只统计来源流水物料与当前销售明细物料一致的来源占用。
4. 扣除有效销售退货后，按来源占用链计算的净占用小于当前实际出库数量。

逐明细核对公式：

```text
应有净占用 = 当前有效出库数量 - 当前有效退货数量
实际净占用 = Σ(allocated_qty - released_qty)
异常差异 = 应有净占用 - 实际净占用
```

改单重发流水通过幂等键识别：

```text
SalesStockOrder:<orderId>:rev:<revision>:line:<lineId>
```

## 二、总体审查结果

| 项目 | 数量 |
| --- | ---: |
| 当前有效销售出库流水 | 1,467 条，涉及 1,130 张出库单 |
| 识别到的改单重发出库流水（历史总量） | 32 条，涉及 28 张出库单 |
| 仍是当前有效的改单重发明细 | 25 条 |
| 后续已经再次冲回的改单重发流水 | 7 条 |
| 当前有效改单明细中核对正常 | 20 条 |
| **确认存在来源占用净额不足的明细** | **5 条，涉及 4 张出库单** |
| **确认少计的来源占用数量** | **23 台** |

5 条异常均没有有效销售退货记录，且差异直接表现为价格层可用数量多于库存余额。两条是“全部旧占用被释放”（15 台），三条是“部分旧占用仍被释放”（8 台）。

## 三、确认异常明细

| 出库单 | 行号 / 明细 ID | 物料 | 原有效出库 | 冲回流水 | 当前有效出库 | 当前来源占用记录（分配/释放） | 实际净占用 | 少计 |
| --- | ---: | --- | ---: | ---: | ---: | --- | ---: | ---: |
| CK20260531008 | 2 / 826 | cp002 / ZY30X(F) | 7（41718） | 7（41746） | 5（41747） | 22505（5/5）、22506（2/2） | 0 | **5** |
| CK20260611007 | 1 / 915 | wg174 | 2（43184） | 2（43234） | 6（43235） | 23270（6/2） | 4 | **2** |
| CK20260611007 | 2 / 916 | wg173 | 2（43185） | 2（43236） | 6（43237） | 23271（6/2） | 4 | **2** |
| CK20260603004 | 3 / 838 | cp009 / ZYJ-M6 6气6水 | 35（41733） | 35（46541） | 10（46542） | 22542（10/10）、22543（25/25） | 0 | **10** |
| CK20260804008 | 1 / 1369 | cp013 / ZYJ-M8(D) 8气8水 | 4（47113） | 4（47445） | 15（47446） | 25752（1/1）、25753（3/3）、26003（11/0） | 11 | **4** |

合计：`5 + 2 + 2 + 10 + 4 = 23` 台。

### 逐条证据说明

- **CK20260531008 第 2 行**：原来 7 台拆成来源 22505 的 5 台和 22506 的 2 台；改单为 5 台后两个来源都仍是完全释放状态，新的 41747 已实际扣减 5 台，但没有形成净占用。
- **CK20260603004 第 3 行**：原来 35 台的两个来源记录全部释放，新的 46542 扣减 10 台，当前净占用为 0。
- **CK20260611007 第 1、2 行**：原来流水各为 2 台，改单后各为 6 台；来源记录虽然累计分配 6 台，但各自保留 2 台释放量，净占用只有 4 台。
- **CK20260804008 第 1 行**：原来 4 台的 1 台、3 台来源均释放，重发后新增来源只形成 11 台净占用，当前流水实际扣减 15 台，少计 4 台。

## 四、价格层与库存余额交叉核对

按库存价格层的实际实现（只取 MAIN、无项目目标、未被逆操作的入库来源层，并包含代码中特殊放行的历史独立退货来源）重新汇总，5 条异常对应的物料差异如下：

| 物料 | 当前库存余额 | 价格层可用数量 | 价格层多计 | 对应异常明细 |
| --- | ---: | ---: | ---: | --- |
| cp002 | 47 | 52 | **5** | CK20260531008-2 |
| cp009 | 108 | 118 | **10** | CK20260603004-3 |
| cp013 | 33 | 37 | **4** | CK20260804008-1 |
| wg173 | 0 | 2 | **2** | CK20260611007-2 |
| wg174 | 0 | 2 | **2** | CK20260611007-1 |
| **合计** |  |  | **23** |  |

这说明 23 台并非由库存流水余额计算错误造成，而是来源占用链少计；当前库存流水净额仍是实际出库事实。

## 五、排除项：同一核对中发现但不属于“改单来源恢复”

`CK20260224002` 第 1 行（明细 ID 198）当前有效出库为 1 台，来源占用 18959 为 `1/1`，但存在 3 张有效销售退货单各退 1 台：

- `XT20260316001`：1 台
- `XT20260305001`：1 台
- `XT20260423003`：1 台

因此该行的核对差异为 `1 - 3 - 0 = -2`，属于“有效退货数量超过原出库数量”的独立历史数据问题；该出库单 `revision_no=1`，没有改单重发流水，不应与本次 5 条来源占用异常合并修复。建议另立退货数量/来源释放问题单处理。

## 六、后续数据修复建议

1. **先备份并冻结修复范围**：以本报告 5 个“出库单 + 明细 ID”作为唯一修复白名单，保存 `inventory_log`、`inventory_source_usage`、`inventory_balance`、有效销售退货明细的修复前快照。
2. **只重建来源占用，不改库存流水**：库存流水 41747、43235、43237、46542、47446 是实际已发生的出库事实，不应删除、改数量或重新生成。
3. **按来源层容量重新分配**：目标是使每行的 `Σ(allocated_qty - released_qty)` 等于当前有效出库数量减有效退货数量，并且每个入库来源层满足：

   ```text
   0 <= Σ(allocated_qty - released_qty) <= sourceLog.changeQty
   ```

4. **禁止批量把 released_qty 清零**：
   - 816、861 的旧来源层当前已经没有可用余量，直接恢复释放会造成来源层超分配；
   - 2482 的旧来源层也已被其他占用消耗，直接恢复 4 台同样可能违反来源层容量；
   - 988 两行各自的来源层当前有 2 台可用余量，理论上可以恢复 2 台，但仍应在事务中重新校验并保留快照。
5. **修复后验收**：重新执行本报告的逐行核对 SQL，并同时检查 5 个物料的价格层汇总是否回到库存余额；再检查所有来源层没有负可用量、没有净占用大于入库数量。
6. **独立处理排除项**：`CK20260224002-1` 的 2 台超额退货不要在本批来源占用修复中顺带处理。

## 七、可复核查询口径（只读）

以下是本次审查的核心查询逻辑，实际执行时使用生产库只读连接；查询不包含 `UPDATE`、`DELETE`、`INSERT` 或事务写入：

```sql
WITH active_out AS (
  SELECT l.*
  FROM inventory_log l
  LEFT JOIN inventory_log r ON r.reversal_of_log_id = l.id
  WHERE l.business_document_type = 'SalesStockOrder'
    AND l.operation_type = 'OUTBOUND_OUT'
    AND l.direction = 'OUT'
    AND r.id IS NULL
), usage_sum AS (
  SELECT
    u.consumer_document_id AS order_id,
    u.consumer_line_id,
    sl.material_id,
    SUM(u.allocated_qty - u.released_qty) AS net_usage
  FROM inventory_source_usage u
  JOIN inventory_log sl ON sl.id = u.source_log_id
  WHERE u.consumer_document_type = 'SalesStockOrder'
  GROUP BY u.consumer_document_id, u.consumer_line_id, sl.material_id
), returned AS (
  SELECT
    rl.source_document_id AS order_id,
    rl.source_document_line_id AS line_id,
    SUM(rl.quantity) AS returned_qty
  FROM sales_stock_order ro
  JOIN sales_stock_order_line rl ON rl.order_id = ro.id
  WHERE ro.order_type = 'SALES_RETURN'
    AND ro.lifecycle_status = 'EFFECTIVE'
    AND ro.inventory_effect_status = 'POSTED'
    AND rl.source_document_type = 'SalesStockOrder'
    AND rl.source_document_id IS NOT NULL
    AND rl.source_document_line_id IS NOT NULL
  GROUP BY rl.source_document_id, rl.source_document_line_id
)
SELECT
  o.document_no,
  l.id AS line_id,
  ao.change_qty AS out_qty,
  COALESCE(ret.returned_qty, 0) AS returned_qty,
  COALESCE(us.net_usage, 0) AS net_usage,
  ao.change_qty
    - COALESCE(ret.returned_qty, 0)
    - COALESCE(us.net_usage, 0) AS gap
FROM active_out ao
JOIN sales_stock_order o ON o.id = ao.business_document_id
JOIN sales_stock_order_line l ON l.id = ao.business_document_line_id
LEFT JOIN usage_sum us
  ON us.order_id = o.id
 AND us.consumer_line_id = l.id
 AND us.material_id = l.material_id
LEFT JOIN returned ret
  ON ret.order_id = o.id
 AND ret.line_id = l.id
WHERE ABS(
  ao.change_qty
    - COALESCE(ret.returned_qty, 0)
    - COALESCE(us.net_usage, 0)
) > 0.000001;
```

## 八、结论

当前存量中可以明确归因于“销售出库改单后来源占用未恢复”的，是 4 张单据的 5 条明细，共 23 台：`cp002 5`、`cp009 10`、`cp013 4`、`wg173 2`、`wg174 2`。本报告不执行数据修改；后续应按明细白名单、来源层容量和事务快照进行修复，并以同一查询作为修复前后验收依据。

## 九、数据修复执行记录

上面的“本报告不执行数据修改”描述的是审查阶段状态。修复已于 **2026-09-20 14:31:16（Asia/Shanghai）** 在生产库 `saifute-wms` 的单事务中完成，执行标识为 `data-repair-20260920`。

修复前完整备份：

- `/Users/sft/Projects/saifute-wms-deploy/storage/database-backups/saifute-wms-inventory-recovery-pre-20260920T061423Z.sql`
- SHA-256：`fb89a1f59b226585b2debb6cec72bc47c59d9690881cbc055a06fc07e9208555`
- 定向快照目录：`/Users/sft/Projects/saifute-wms-deploy/storage/database-backups/inventory-recovery-pre-20260920T061530Z/`

实际变更如下：

| 明细 ID | 变更 | 来源流水 | 来源占用记录 |
| ---: | --- | ---: | ---: |
| 826 | 新增 5 台占用 | 48701 | 新建 27441 |
| 838 | 新增 10 台占用 | 47279 | 新建 27442 |
| 915 | 释放量 `2 → 0`，状态改为 `ALLOCATED` | 42005 | 更新 23270 |
| 916 | 释放量 `2 → 0`，状态改为 `ALLOCATED` | 42004 | 更新 23271 |
| 1369 | 新增 4 台占用 | 44084 | 新建 27443 |

本批没有修改 `inventory_log`、`inventory_balance`、销售退货记录或库存流水数量；排除项 `CK20260224002-1` 也未处理。

修复后验收结果：

- 报告逐明细差异查询（限定上述 5 行）返回 0 行；净占用分别为 `5、10、6、6、15`。
- 5 个物料的价格层可用量回到库存余额：`cp002=47`、`cp009=108`、`cp013=33`、`wg173=0`、`wg174=0`。
- 全库入库来源层“净占用为负或超过入库数量”的违规数为 0。
- 备份文件 SHA-256 复核通过。
