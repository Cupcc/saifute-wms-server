# `inventory-core` 模块设计

## 模块目标与职责

作为所有事务型单据唯一可依赖的库存中心域，负责主仓 / RD 小仓库存现值、库存日志、来源追踪、预警和编号区间。任何业务模块不得直接改库存底表。

当前已确认的 `F5` 第一版范围：预警只保留只读视图 / 报表提示；出厂编号区间能力只服务 `customer` 出库链路，不扩成多业务家族统一平台。

## 原 Java 来源与映射范围

- `business/src/main/java/com/saifute/stock`
- `business/src/main/resources/mapper/stock`
- 被 `entry`、`out`、`take`、`article` 广泛调用的库存副作用逻辑

## 领域对象与核心用例

核心对象：

- `InventoryBalance`
- `InventoryLog`
- `InventorySourceUsage`
- `InventoryWarning`
- `FactoryNumberInterval`

核心用例：

- `increaseStock()`
- `decreaseStock()`
- `reverseStock()`
- `recordInventoryLog()`
- `allocateInventorySource()`
- `releaseInventorySource()`
- `checkInventoryWarning()`
- `reserveFactoryNumberInterval()`
- `queryPriceLayerAvailability()` — 按 `物料 + 单价` 聚合可用来源层，供客户出库价格层选择（计划中）
- `allocateInventorySourceByPriceLayer()` — 在指定价格层内按 FIFO 分配来源（计划中）

## Controller 接口草案

- `GET /inventory/balances`
- `GET /inventory/logs`
- `GET /inventory/warnings`
- `GET /inventory/source-usages`

说明：

- 写操作原则上不直接对外暴露 HTTP API，而是通过其他业务模块的应用服务间接调用

## Application 层编排

- `IncreaseStockUseCase`
- `DecreaseStockUseCase`
- `ReverseStockUseCase`
- `AllocateInventorySourceUseCase`
- `ReleaseInventorySourceUseCase`
- `QueryInventoryBalanceUseCase`

编排约束：

- 库存变更必须同时产生库存日志
- 涉及来源追踪的业务必须同时维护 `InventorySourceUsage`
- 单据作废走逆操作，不允许直接重写库存结果
- 来源分配/释放建议以“同一消费行 + 同一来源流水”的累计目标数量编排，避免重试时重复分配或重复释放
- 当上游业务模块需要把单据主表、库存副作用、来源追踪放进同一事务时，应由上游应用层显式开启事务，并把事务上下文传给 `inventory-core` 的写服务组合调用

## Domain 规则与约束

- `inventory-core` 是库存唯一写入口
- 单据模块必须传入业务类型、单据号、来源标识和操作者
- 面向完全可信的来源追溯与 FIFO 成本核算时，不允许负库存；所有出库必须先有可用入库来源，历史纠正应通过补录期初、逆操作重建或受控重放处理，而不是把负库存作为常态策略
- 所有数量字段迁移时优先改用精度明确的十进制类型
- 来源追踪与逆操作补偿是不可省略的关键语义
- `reverseStock()` 必须保证同一条来源流水最多只生成一条逆向流水，且调用方应为同一来源流水使用稳定的 `idempotencyKey`

## Infrastructure 设计

- 简单库存主表读写可用 Prisma
- 库存分配、报表查询、历史回溯优先 raw SQL
- 通过 `InventoryTransactionService` 统一封装库存事务边界
- 若并发扣减风险较高，可在实现层补悲观锁或版本号控制

## 与其他模块的依赖关系

- 依赖 `master-data` 获取物料等基础快照
- 被 `inbound`、`customer`、`workshop-material`、`project` 依赖
- 与 `approval` 只通过业务模块协作，不直接耦合审核表

## 事务边界与一致性要求

- 库存主表、库存日志、来源追踪必须在同一数据库事务内提交
- 业务单据与库存副作用原则上同事务完成
- 不允许只写主表不写日志，或只回滚主表不释放来源占用
- `increaseStock()`、`decreaseStock()`、`reverseStock()`、`allocateInventorySource()`、`releaseInventorySource()` 默认可独立开启事务执行；若调用方已持有事务，应复用同一个事务上下文完成组合编排
- `factory_number_reservation` 第一版仅支持 `customer` 出库链路的占用、释放与查询；其他业务家族如需接入，后续单独扩 scope

## 权限点、数据权限、审计要求

- 库存查询接口需要权限控制
- 库存列表、日志、预警通常受物料/部门数据权限影响
- 库存写操作的审计由上游业务单据和 `audit-log` 共同承担

## 优化后表设计冻结

- 对应核心表：`inventory_balance`、`inventory_log`、`inventory_source_usage`、`factory_number_reservation`
- 第一阶段库存唯一维度固定为 `materialId + stockScopeId`，其中真实库存范围仅包含 `MAIN` 与 `RD_SUB`
- `workshop` 只承担主仓领退料归属与成本核算，不参与库存余额唯一键
- 同一物料不同入库批次可存在不同成本层；出库、领料、退料的成本必须通过来源分配传递
- `inventory_warning` 收敛为只读视图 `vw_inventory_warning`，不单独落交易表
- `inventory_warning` 第一版只承担读模型 / 报表提示职责，不派生独立预警处理流
- 单据模块必须通过 `businessDocumentType`、`businessDocumentId`、`businessDocumentLineId` 向库存中心传递来源语义
- `inventory_log.reversalOfLogId` 应保持唯一，确保同一条原始流水只能被逆操作一次
- 详细业务流程与字段建议见 `docs/architecture/20-wms-database-tables-and-schema.md`

## 待补测试清单

- 库存增加、减少、逆操作测试
- 库存日志必写测试
- 来源分配与释放测试
- 并发扣减一致性测试
- 预警生成测试

## 计划新增操作类型

以下操作类型由入库调价单（`inbound` F8）引入，实现后需纳入 `InventoryOperationType`：

- `PRICE_CORRECTION_OUT` — 把原来源流水中尚未消费的剩余数量转出
- `PRICE_CORRECTION_IN` — 按正确单价重新转入，形成新的 FIFO 来源流水；需纳入 `FIFO_SOURCE_OPERATION_TYPES`

详见需求：`docs/requirements/domain/inbound-business-module.md`（F8）。

## 暂不实现范围

- 标准 WMS 仓库/库位/批次模型升级
- 冻结库存
- 移库
- 主仓盘点 / 通用盘点单独切片；当前不并入 `inventory-core`
- `RD` 小仓盘点 / 调整继续由 `rd-subwarehouse` 承接
