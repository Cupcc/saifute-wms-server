# `reporting` 模块设计

## 模块目标与职责

负责首页统计、库存报表和跨单据聚合查询。该模块是只读查询模块，不拥有事务型写模型。

## 原 Java 来源与映射范围

- `business/src/main/java/com/saifute/base` 中 `HomeStatistics*`、`Report*`
- `business/src/main/resources/mapper/stock` 中统计查询
- 统计口径依赖 `entry`、`out`、`take`、`stock`

## 领域对象与核心用例

核心对象：

- `HomeDashboard`
- `InventoryReport`
- `MaterialCategoryReport`
- `TrendSeriesPoint`

核心用例：

- 首页看板统计
- 单据趋势查询
- 物料库存汇总与分类统计
- 跨时间范围的业务与财务导出

## Controller 接口草案

- `GET /reporting/home`
- `GET /reporting/inventory-summary`
- `GET /reporting/material-category-summary`
- `GET /reporting/trends`
- `GET /reporting/export`

## Application 层编排

- `GetHomeDashboardUseCase`
- `GetInventorySummaryUseCase`
- `GetTrendSeriesUseCase`
- `ExportReportUseCase`

## Domain 规则与约束

- `reporting` 只读，不允许写业务表
- 统计口径必须显式绑定来源模块与时间边界
- 合计行、分类汇总、金额精度规则需要固定下来，避免前后端各自重算

## Infrastructure 设计

- 主要采用 raw SQL 查询模型
- 如有必要，应用层再做轻量聚合和导出 DTO 拼装
- 与业务模块通过 query service 或稳定 SQL 视图协作

## 与其他模块的依赖关系

- 依赖 `inventory-core`
- 依赖 `inbound`
- 依赖 `outbound`
- 依赖 `workshop-material`
- 可复用 `master-data` 的物料分类查询

## 事务边界与一致性要求

- 该模块本身无写事务
- 报表允许读取已提交数据，不要求跨模块强一致快照，但口径必须可解释

## 权限点、数据权限、审计要求

- 报表查询和导出需要独立权限点
- 通常受物料分类、车间、客户、供应商等数据权限影响
- 导出操作应记录审计

## 待补测试清单

- 首页统计口径测试
- 库存分类汇总测试
- 趋势时间边界测试
- 导出结果结构测试

## 暂不实现范围

- 实时数仓
- OLAP 多维分析
