# `reporting` 模块设计

## 模块目标与职责

负责首页统计、库存报表和跨单据聚合查询。该模块是只读查询模块，不拥有事务型写模型。

## 当前实现与目标范围

**当前实现**：代码目前覆盖首页看板统计、库存汇总与分类统计、单据趋势查询，以及跨 `inbound`/`sales`/`workshop-material` 的导出路径。销售项目与 `RD` 小仓协同尚未完整纳入查询依赖与统计口径。

**目标范围**（见 `docs/requirements/PROJECT_REQUIREMENTS.md` 4.2.1 节及第 5 节）：报表目标还包括月度自动汇总（公司整体、按生产车间、按销售域、按销售项目、按 `RD` 小仓协同），以及按销售项目查看发货 / 退货 / 净发货汇总明细和项目维度的金额 / 成本相关报表。该部分均属 `reporting` 的只读聚合职责，目前尚未实现。


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
- 依赖 `sales`
- 依赖 `workshop-material`
- 目标范围依赖 `sales-project`（销售项目月报与项目统计，尚未实现）
- 目标范围依赖 `rd-subwarehouse`（RD 小仓协同月报，尚未实现）
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

- 月度自动汇总报表（公司整体、按生产车间、按销售域、按销售项目、按 `RD` 小仓协同）
- 按销售项目查看发货 / 退货 / 净发货汇总明细及项目金额 / 成本相关报表
- 实时数仓
- OLAP 多维分析
