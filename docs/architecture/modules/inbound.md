# `inbound` 模块设计

## 模块目标与职责

负责验收单、生产入库单及其明细的创建、修改、作废、查询和导出。该模块是库存增加型单据域，所有库存副作用必须走 `inventory-core`。

## 原 Java 来源与映射范围

- `business/src/main/java/com/saifute/entry`
- `business/src/main/resources/mapper/entry`

包含来源：

- `SaifuteInboundOrder*`
- `SaifuteIntoOrder*`

## 领域对象与核心用例

核心对象：

- `InboundOrder`
- `InboundOrderDetail`
- `IntoOrder`
- `IntoOrderDetail`

核心用例：

- 新建验收单
- 新建生产入库单
- 修改单据并重置审核
- 作废单据并冲回库存
- 按供应商、物料、日期追溯入库记录

## Controller 接口草案

- `GET /inbound/orders`
- `POST /inbound/orders`
- `PATCH /inbound/orders/:id`
- `POST /inbound/orders/:id/void`
- `GET /inbound/into-orders`
- `POST /inbound/into-orders`

## Application 层编排

- `CreateInboundOrderUseCase`
- `UpdateInboundOrderUseCase`
- `VoidInboundOrderUseCase`
- `CreateIntoOrderUseCase`
- `VoidIntoOrderUseCase`

编排要点：

- 创建单据时先校验主数据，再写主从表，再调用 `inventory-core.increaseStock()`
- 创建后统一创建或刷新审核记录
- 修改单据时必须显式处理明细新增、修改、删除差异，不能只改表头
- 作废走逆操作，调用 `inventory-core.reverseStock()`

## Domain 规则与约束

- 单据修改后默认重置为待审
- 作废前需校验下游依赖和当前审核状态
- 主表、明细、库存、副作用日志必须一起建模
- 自动补建供应商或人员只允许通过 `master-data` 受控入口实现

## Infrastructure 设计

- 主表和明细基础 CRUD 可用 Prisma
- 列表联查、导出、历史回溯优先 raw SQL
- 与库存交互只通过 `inventory-core` 应用服务
- 审核状态由 `workflow` 统一提供，不直接查 `audit_document`

## 与其他模块的依赖关系

- 依赖 `master-data`
- 依赖 `inventory-core`
- 依赖 `workflow`
- 导出和审计依赖 `audit-log`

## 事务边界与一致性要求

- 主表、明细、库存增加、库存日志、审核记录应放在同一事务中
- 单据作废、库存逆操作、审核重置必须原子提交

## 权限点、数据权限、审计要求

- 列表、详情、新增、修改、作废、导出分别定义 `Permissions`
- 列表查询通常受供应商、车间、经办人等数据权限影响
- 新增、修改、作废、导出都需要操作审计

## 优化后表设计冻结

- 入库家族统一收敛到 `stock_in_order`、`stock_in_order_line`
- 通过 `orderType` 区分验收单和生产入库单，不再拆两套高度重复主从表
- 库存增加与逆操作继续下沉到 `inventory-core`
- 审核状态继续下沉到 `workflow`，主表只保留快照
- 详细业务流程与字段建议见 `docs/architecture/20-wms-business-flow-and-optimized-schema.md`

## 待补测试清单

- 验收单创建与库存增加测试
- 修改单据后审核重置测试
- 作废冲回库存测试
- 明细差异更新测试

## 暂不实现范围

- 单据模板配置
- 批量导入验收单

