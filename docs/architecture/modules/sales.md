# `sales` 模块设计

## 模块目标与职责

负责销售业务域中的销售出库单、销售退货单及其明细的全生命周期管理。该模块是库存减少和回补并存的单据域，需兼容编号区间、退货约束和下游校验。

## 原 Java 来源与映射范围

- `business/src/main/java/com/saifute/out`
- `business/src/main/resources/mapper/out`

包含来源：

- `SaifuteOutboundOrder*`
- `SaifuteSalesReturnOrder*`

## 领域对象与核心用例

核心对象：

- `OutboundOrder`
- `OutboundOrderDetail`
- `SalesReturnOrder`
- `SalesReturnOrderDetail`

核心用例：

- 新建出库单并扣减库存
- 新建销售退货单并回补库存
- 修改单据并重置审核
- 作废单据并执行逆操作
- 校验退货与出库的上下游关系
- 管理出厂编号区间
- 价格层出库选择 — 用户按 `物料 + 价格层 + 数量` 录单，系统在同价内自动 FIFO 到具体来源
- 出库成本追溯查询 — 追溯到具体来源层，支持展示调价关系链

## Controller 接口草案

- 模块 canonical 命名保持 `sales`
- 对外路由前缀为 `/sales`
- `GET /sales/orders`
- `POST /sales/orders`
- `PATCH /sales/orders/:id`
- `POST /sales/orders/:id/void`
- `GET /sales/sales-returns`
- `POST /sales/sales-returns`

## Application 层编排

- `CreateOutboundOrderUseCase`
- `UpdateOutboundOrderUseCase`
- `VoidOutboundOrderUseCase`
- `CreateSalesReturnOrderUseCase`
- `VoidSalesReturnOrderUseCase`

编排要点：

- 出库创建需要先校验库存充足性、编号区间和客户主数据
- 销售退货创建需要校验来源出库单关系
- 作废出库前必须确认不存在未作废退货下游
- 编号区间占用与释放统一交由 `inventory-core`

## Domain 规则与约束

- 出库和销售退货共享部分领域规则，但库存方向相反
- 若出库或退货行属于销售项目，则必须保存 `salesProjectId` 及必要项目快照，供销售项目统计与月报复用
- 出厂编号区间必须可验证、可追踪、可释放
- 修改单据不能绕过明细差异、库存重算和审核重置
- 作废规则必须显式处理下游退货约束

## Infrastructure 设计

- 主从表基础读写可用 Prisma
- 列表、回查最近单据、区间解析、导出等使用 raw SQL
- 编号区间解析规则集中在模块内策略服务，不分散在控制器

## 与其他模块的依赖关系

- 依赖 `master-data`
- 依赖 `inventory-core`
- 依赖 `approval`
- 被未来的 `sales-project` 作为真实发货事实真源依赖
- 审计和导出接入 `audit-log`

## 事务边界与一致性要求

- 主表、明细、库存、编号区间、审核记录需在单事务内维护
- 出库作废与编号区间释放必须原子完成

## 权限点、数据权限、审计要求

- 模块内部命名、对外路由和权限码统一为 `sales:*` / `/sales`
- 列表、详情、新增、修改、作废、导出、退货均需独立权限点
- 查询通常受客户、经办人、物料等数据权限影响
- 所有命令类操作记录审计

## 优化后表设计冻结

- 销售业务家族统一收敛到 `sales_stock_order`、`sales_stock_order_line`
- 通过 `orderType` 区分出库单和销售退货单，不再维护两套重复结构
- 出厂编号区间从单据表规则中剥离，统一下沉到 `factory_number_reservation`
- 退货与出库的上下游关系通过 `document_relation`、`document_line_relation` 表达
- 详细业务流程与字段建议见 `docs/architecture/20-wms-database-tables-and-schema.md`

## 待补测试清单

- 出库扣减库存测试
- 销售退货回补库存测试
- 出厂编号区间校验与释放测试
- 作废前下游退货校验测试

## 价格层与成本追溯

以下由销售业务需求（F2/F3）引入：

- 价格层可用库存查询接口：调用 `inventory-core.listPriceLayerAvailability()` 按 `物料 + 库存范围 + unitCost` 聚合可用来源量
- 出库按价格层录入：销售出库行使用 `selectedUnitCost` 记录用户选择的库存价格层，`unitPrice` 保持对客户的业务销售单价，不作为库存成本价
- 出库过账：调用 `inventory-core.settleConsumerOut()`，在选定价格层内 FIFO 分配来源，并写入 `inventory_source_usage`
- 成本快照：过账后把实际来源分配汇总为 `costUnitPrice` / `costAmount`，固化在出库明细行
- 出库成本追溯读模型：串联出库行 → `inventory_source_usage` → 来源流水 → 调价单（如有）→ 原入库单

详见需求：`docs/requirements/domain/sales-business-module.md`（F2/F3）。

## 暂不实现范围

- 更复杂的物流履约状态
- 发运波次
