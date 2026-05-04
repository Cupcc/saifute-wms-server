# `workshop-material` 模块设计

## 模块目标与职责

负责领料单、退料单、报废单的统一建模与实现。该模块把原 Java 中分散在 `take` 和 `stock` 包里的车间物料流转能力收拢为单一领域。

**口径**：产品「生产车间」侧能力应按基础数据中的 `workshop` 划分；界面若提供左侧筛选，也应展示 `workshop` 维度，而不是系统管理中的 `department`。本模块只覆盖领料、退料、报废。**成品入库**（生产完工入库）不属于本模块，统一走 `inbound`（生产入库单）。
**补充口径**：`报废` 在本模块中按独立真实事务处理，不默认视为“已领料的结果拆分”；车间物料默认走轻审核，审核只做追溯不阻断业务时机；车间净耗用默认按 `领料 - 退料 + 报废` 汇总，用于核算与报表，不代表车间库存余额。

## 原 Java 来源与映射范围

- `business/src/main/java/com/saifute/take`
- `business/src/main/java/com/saifute/stock` 中报废相关能力
- `business/src/main/resources/mapper/take`
- `business/src/main/resources/mapper/stock`

## 领域对象与核心用例

核心对象：

- `PickOrder`
- `PickOrderDetail`
- `ReturnOrder`
- `ReturnOrderDetail`
- `ScrapOrder`
- `ScrapOrderDetail`

核心用例：

- 新建领料单并扣减库存
- 新建退料单并回补库存
- 新建报废单并扣减库存
- 维护 `inventory_used` 来源追踪
- 作废领料、退料、报废并执行逆操作

## Controller 接口草案

- `GET /workshop-material/pick-orders`
- `POST /workshop-material/pick-orders`
- `POST /workshop-material/pick-orders/:id/void`
- `GET /workshop-material/return-orders`
- `POST /workshop-material/return-orders`
- `GET /workshop-material/scrap-orders`
- `POST /workshop-material/scrap-orders`

## Application 层编排

- `CreatePickOrderUseCase`
- `VoidPickOrderUseCase`
- `CreateReturnOrderUseCase`
- `VoidReturnOrderUseCase`
- `CreateScrapOrderUseCase`
- `VoidScrapOrderUseCase`

编排要点：

- 领料和报废调用 `inventory-core.decreaseStock()`
- 退料调用 `inventory-core.increaseStock()`
- 领料、退料、报废明细里的 `unitPrice / amount` 按内部成本核算口径使用，不是销售价
- 涉及来源追踪的动作同步维护 `inventory_used`
- 审核状态不作为库存过账与业务生效前置，轻审核仅保留追溯记录
- 退料应尽量回指原领料行，以价格对齐与回补追溯为主；无法可靠匹配时允许无源退料
- 报废若引用领料或其他上游关系，该关系仅用于追溯与成本分析，不改变报废作为独立事务的语义
- 领料作废前需校验未作废退料下游

## Domain 规则与约束

- 领料、退料、报废属于同一车间物料流转域，但审核覆盖范围可能不同
- `净耗用` 是只读核算指标，默认按已过账且未作废的 `领料 - 退料 + 报废` 计算，轻审核状态不影响纳入时点
- `inventory_used` 是关键副模型，不得省略
- 作废规则必须体现上下游依赖和逆向补偿
- 修改单据不能只改表头，需重新计算明细差异与库存副作用

## Infrastructure 设计

- 主从表基础读写用 Prisma
- 复杂列表、来源回溯、导出优先 raw SQL
- 报废能力虽然来源于 `stock` 包，但在 NestJS 中放入同一模块实现

## 与其他模块的依赖关系

- 依赖 `master-data`
- 依赖 `inventory-core`
- 依赖 `approval`
- 审计和导出接入 `audit-log`

## 事务边界与一致性要求

- 主表、明细、库存、副日志、来源追踪必须同事务提交
- 作废、逆操作、来源释放必须原子完成

## 权限点、数据权限、审计要求

- 领料、退料、报废分别定义权限点
- 查询受车间、经办人、物料等数据权限影响
- 新增、修改、作废、导出必须记录审计

## 优化后表设计冻结

- 车间物料家族统一收敛到 `workshop_material_order`、`workshop_material_order_line`
- 通过 `orderType` 区分领料、退料、报废，不再拆散在多个来源模块中
- `inventory_used` 语义在新模型中统一落到 `inventory_source_usage`
- 退料与领料的上下游关系通过关系表表达，避免在业务字段中隐式推断
- 退料关系以“尽量绑定原领料行、价格能对上”为目标，不做阻断式强绑定；无法可靠匹配时允许无源退料
- 报废可选引用上游单据或来源分配，但引用仅用于追溯、责任分析和成本回溯，不改变统计口径
- 表结构保留审核快照与追溯能力，但审核不阻断单据创建、库存过账和实时查询
- 详细业务流程与字段建议见 `docs/architecture/20-wms-database-tables-and-schema.md`

## 待补测试清单

- 领料扣减库存与来源追踪测试
- 退料回补库存测试
- 报废扣减库存测试
- 领料作废前下游退料校验测试

## 暂不实现范围

- 工单驱动领退料
- 车间工位级库存
