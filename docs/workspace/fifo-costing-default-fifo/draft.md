# 草稿

最后更新: 2026-04-04
状态: 探索中
文档说明: 记录“默认 FIFO 成本核算”在当前仓库中的可行落点、最小必要变更、以及为什么此时不建议直接上完整批次模型。

## 用户意图

- 希望系统默认采用 `FIFO`，即先进先消耗。
- 目标优先级是“入库价可查、出库成本可算、反向冲回可解释”，不是先做完整批次追溯体系。
- 希望尽量沿用当前系统已有结构，避免不必要的大改。
- 已确认完全可信的 FIFO 追溯以“先入后出”和“不允许负库存”为前提；允许补单，但补单不得重排已经生效的库存事实。
- 已确认能力目标最终覆盖 `customer` 出库、车间领料、项目领用和 `RD handoff` 四类链路，其中 `RD handoff` 至少承担成本桥接职责。

## 当前系统判断

### 1. 已有能力

- 单据行可保存业务价格：
  - `stock_in_order_line.unitPrice`
  - `customer_stock_order_line.unitPrice`
  - `workshop_material_order_line.unitPrice`
- 库存核心已具备：
  - 汇总余额 `inventory_balance`
  - 库存流水 `inventory_log`
  - 来源占用 `inventory_source_usage`
- 车间领料已经证明“出库线 -> 入库流水来源”这条语义在系统里是可落的。

### 2. 当前缺口

- `inventory_balance` 只有数量，没有库存金额或成本字段。
- `inventory_log` 只有数量变化，没有不可变的成本快照。
- 普通出库未自动分配来源入库流水，无法稳定得出“本次成本来自哪些入库层”。
- 入库改单的价格变更目前不会把成本层稳定化；如果以后靠“回查单据行价格”算成本，历史结果会漂移。

### 3. 关键判断

仅靠“单据行上有价格”只能回答：

- 某笔入库当时记了什么价格
- 某笔出库单行当时录了什么业务单价

但还不能稳定回答：

- 某笔出库实际消耗了哪些入库层
- 某笔出库的成本总额是多少
- 某次作废/退货应把成本释放回哪几层

## 推荐方案

### 方案名称

`FIFO 成本层模型`

### 核心思想

- 保留 `inventory_balance` 作为汇总数量余额，不把它升级成批次层主表。
- 将每条有效的入库 `inventory_log(IN)` 视为一个可被消耗的 FIFO 成本层。
- 使用 `inventory_source_usage` 记录“某条出库线分别消耗了哪些入库层以及各自数量”。
- 在出库落账时，系统自动按 `occurredAt ASC, id ASC` 选择最早仍有剩余数量的入库层。
- 在出库单行和出库流水上写入本次成本快照，避免后续回查上游单据时结果漂移。
- 完全可信的 FIFO 不接受负库存，也不接受靠事后倒填单据去改写已生效的来源层顺序。

### 为什么不直接做完整批次模型

当前目标是成本核算，不是完整物理批次管理。完整批次模型通常还要引入：

- 批次号
- 生产日期
- 有效期
- 召回链
- 指定批次出库
- 同批次/跨批次的业务规则

这些内容会显著扩大改造面。若当前最重要的是 `FIFO 成本核算`，则先做“成本层”比先做“批次层”更符合目标。

## 数据结构草案

### A. 保留现有表

- `inventory_balance`
- `inventory_log`
- `inventory_source_usage`

### B. 建议新增字段

#### `inventory_log`

新增建议：

- `unitCost Decimal(18,2) NULL`
- `costAmount Decimal(18,2) NULL`
- `costSettledAt DateTime NULL`

语义：

- 对 `IN` 流水，`unitCost` / `costAmount` 是该入库层的不可变成本快照。
- 对 `OUT` 流水，`unitCost` / `costAmount` 是本次出库按 FIFO 结转后的成本结果。

#### `customer_stock_order_line`

新增建议：

- `costUnitPrice Decimal(18,2) NULL`
- `costAmount Decimal(18,2) NULL`

语义：

- 保存该业务出库行最终结转的成本快照。
- `unitPrice` 继续代表业务单价，不与成本价混用。

#### `workshop_material_order_line`

新增建议：

- `costUnitPrice Decimal(18,2) NULL`
- `costAmount Decimal(18,2) NULL`

语义同上。

#### `project_material_line`

项目领用属于统一成本口径内的最终消耗链，因此同样新增：

- `costUnitPrice Decimal(18,2) NULL`
- `costAmount Decimal(18,2) NULL`

#### `rd_handoff_order_line`

若本轮先不把 `RD handoff` 作为最终成本分析单据，也应至少补足桥接所需能力，例如：

- 保存或可回查主仓侧来源层继承结果
- 保证交接入 RD 后，后续 `project` / RD 消耗仍能沿既有来源链继续追溯

### C. 是否要新增 `inventory_layer` 表

当前建议：`先不新增`。

原因：

- 现有 `inventory_log(IN)` 已天然具备“入库层”身份。
- 现有 `inventory_source_usage` 已天然具备“层消耗记录”身份。
- 在当前系统体量下，可以先用这两张表完成 FIFO 闭环。

后续若出现：

- 来源分配查询性能不足
- 需要独立维护层状态
- 不同类型入库语义过多，回查成本来源分支太复杂

再升级为专门的 `inventory_layer` 表会更稳。

## 写路径草图

### 1. 入库

目标：

- 增加汇总库存数量
- 生成一条 `IN inventory_log`
- 将本次成本固化到该 `IN log`

建议：

- 入库过账时，`inventoryService.increaseStock()` 接口扩展支持：
  - `unitCost`
  - `costAmount`
- 写入 `inventory_log` 时同步落成本快照。

结果：

- 每一条有效入库流水都是一个可供 FIFO 消耗的成本层。

### 2. 普通出库

目标：

- 先校验汇总库存够不够
- 再从最早可用的 `IN log` 开始分配
- 生成多条 `inventory_source_usage`
- 汇总得出本次出库 `costAmount`
- 写入 `OUT inventory_log` 和业务单行成本快照

建议新增库存核心能力：

- `allocateByFifo(materialId, stockScopeId/workshopId, quantity, consumerDocumentType, consumerDocumentId, consumerLineId)`

前提约束：

- 出库时必须已经存在可用入库层。
- 不允许通过负库存、暂估占位或事后补来源的方式声称结果是“完全可信 FIFO”。

输出建议包含：

- `allocations: [{ sourceLogId, qty, unitCost, costAmount }]`
- `settledUnitCost`
- `settledCostAmount`

### 3. 车间领料

兼容两种模式：

- 若显式传了 `sourceLogId`，走指定来源模式
- 若未传，则默认走 FIFO 自动分配

这样可以保留现有特殊业务的可控性，同时把默认行为统一到库存核心。

### 4. RD handoff

建议定位为“成本桥接链”，而不是独立于 FIFO 之外的例外链路：

- 主仓交接出库侧要明确消耗了哪些主仓来源层
- RD 入库侧要继承这批来源关系，而不是把交接入 RD 视为一笔全新、无来源的成本层
- 这样 RD 后续项目领用、报废、退回时，成本链才能不断

## 反向流程草图

### 1. 出库作废

目标：

- 释放该出库线对应的 `inventory_source_usage`
- 冲回库存数量
- 清理或标记出库成本快照

原则：

- 先释放来源层，再做数量冲回，保证来源层可用量恢复正确。

### 2. 退货/退料

目标：

- 将数量按原消耗来源顺序或原关联关系返还
- 不允许“退货数量 > 原已消耗数量”

建议：

- 若已有明确上游出库线关系，则优先按该线既有 `inventory_source_usage` 反向释放。
- 不建议退货直接重新走一遍“新的 FIFO”，否则会破坏成本还原。

### 3. 入库改单/作废

这是当前方案中最需要收紧的点。

建议约束：

- 一旦某条 `IN log` 已存在未完全释放的来源占用，不允许直接改单成本价。
- 如确需改价，应走专门的“红字冲回 + 新入库重建”路径，并要求下游无未回退消耗。
- 补录历史单据或补填业务日期，不得直接改写已经生效的来源层顺序；如需纠正历史，应走冲回重建或受控重放。

原因：

- FIFO 成本层一旦被消费，原层成本就必须不可变，否则历史成本会漂移。

## 为什么这是比“只改业务单据”更好的方案

只在业务单据层做改造的问题：

- 每个出库模块都要自己实现一套 FIFO
- `customer`、`workshop-material`、`project` 容易口径分裂
- 作废/退货时很难保证来源层释放逻辑一致

把 FIFO 放到库存核心的好处：

- 规则单点收口
- 各出库模块只关心“我要出多少”
- 真实的成本来源和释放逻辑统一

## 分阶段实施建议

### 阶段 1：Schema 最小扩展

- 给 `inventory_log` 增加成本快照字段
- 给出库类业务明细表增加成本快照字段

### 阶段 2：库存核心支持 FIFO 自动分配

- 在 `inventory-core` 中实现可用入库层查询
- 实现 FIFO 分配与成本汇总
- 实现统一释放逻辑

### 阶段 3：接入普通出库

- `customer`
- `project`
- `workshop-material` 默认路径

### 阶段 4：接入反向流程

- 作废
- 退货/退料
- 改单限制

### 阶段 5：报表与对账

- 按业务单看成本
- 按库存流水看成本
- 按来源占用看 FIFO 消耗明细

## 风险与注意点

### 1. 入库价格变更风险

若成本不固化在 `inventory_log`，而是靠回查业务单行价格，则历史成本会被改单污染。

### 2. 多来源拆分

一条出库线可能拆到多条入库层，因此：

- 业务单行上的 `costUnitPrice` 应理解为本次实际加权成本
- 更细的来源明细仍应看 `inventory_source_usage`

### 3. 性能

FIFO 查询会依赖：

- 入库流水
- 来源占用聚合
- 有效性过滤

若数据量增大，后续可能需要：

- 专门的可用层索引
- 专门的 `inventory_layer` 表

### 4. 旧数据

历史出库目前没有来源分配记录，无法自动补出完全可信的 FIFO 成本。若需要历史补算，必须定义：

- 起算日期
- 历史重放规则
- 异常数据处理策略

推荐口径：

- 约定一个起算时间 `T0`
- `T0` 之后的新生效数据必须满足完整来源分配与可信 FIFO 规则
- `T0` 之前的数据允许保留业务价格与数量事实，但不承诺来源层级上的完全可信 FIFO 成本

## 当前推荐结论

推荐采用：

- `保留汇总库存`
- `以入库 inventory_log 作为 FIFO 成本层`
- `以 inventory_source_usage 作为层消耗明细`
- `在库存核心统一实现默认 FIFO`
- `在出库类业务单行保存成本快照`
- `最终覆盖 customer / workshop-material / project / RD handoff 四类链路，其中 RD handoff 承担成本桥接职责`
- `把先入后出、禁止负库存、补录不重排库存事实作为可信 FIFO 的前提规则`

不推荐当前就直接上完整批次模型。

## 对话留痕

| 时间 | 来源 | 关键信息 |
|------|------|----------|
| 2026-03-31 | 用户 | 希望沿用现有结构，采用默认 FIFO，判断是否要像车间领料那样改造。 |
| 2026-03-31 | 代码现状 | 当前单据行能存价格，库存余额和库存流水不存成本，普通出库未进入来源分配闭环。 |
| 2026-03-31 | AI 建议 | 推荐使用 `InventoryLog + InventorySourceUsage` 演进为 FIFO 成本层模型，而不是直接上完整批次模型。 |
| 2026-04-04 | 用户确认 | 可信 FIFO 以先入后出和禁止负库存为前提；允许补单但不允许重排已生效库存事实；四类链路最终覆盖，历史按起算时间起提供完全可信追溯。 |
