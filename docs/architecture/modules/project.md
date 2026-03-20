# `project` 模块设计

## 模块目标与职责

负责原 `article` 包中的项目/BOM 和项目物料消耗能力。该模块不是纯静态 BOM，而是带库存副作用的事务型领域。

## 原 Java 来源与映射范围

- `business/src/main/java/com/saifute/article`
- `business/src/main/resources/mapper/article`

## 领域对象与核心用例

核心对象：

- `Project`
- `ProjectMaterial`
- `ProjectInventoryConsumption`

核心用例：

- 创建项目并登记物料消耗
- 修改项目物料并按差量调整库存
- 删除或作废项目并恢复库存
- 导出项目总表与明细

## Controller 接口草案

- `GET /projects`
- `POST /projects`
- `PATCH /projects/:id`
- `POST /projects/:id/void`
- `GET /projects/:id/materials`

## Application 层编排

- `CreateProjectUseCase`
- `UpdateProjectUseCase`
- `VoidProjectUseCase`
- `ExportProjectUseCase`

编排要点：

- 项目创建与修改时统一通过 `inventory-core` 处理消耗和回补
- 项目物料差量调整必须显式计算新增、修改、删除三路变化
- 自动补建客户/供应商/人员必须通过 `master-data` 受控入口

## Domain 规则与约束

- `article` 是旧命名，NestJS 中统一收敛为 `project`
- 项目修改不能直接覆盖旧明细，必须先算差量
- 项目删除若兼容现状，应保留恢复库存语义
- 项目域不直接维护审核流，必要时后续再接 `workflow`

## Infrastructure 设计

- 项目主表、明细基础读写可用 Prisma
- 导出、多条件联查、复杂筛选优先 raw SQL
- 需要独立的 `ProjectInventoryPolicy` 处理库存差量策略

## 与其他模块的依赖关系

- 依赖 `master-data`
- 依赖 `inventory-core`
- 导出和审计接入 `audit-log`

## 事务边界与一致性要求

- 项目主表、明细、库存、库存日志、来源追踪必须同事务提交
- 修改项目时差量计算与库存调整必须原子完成

## 权限点、数据权限、审计要求

- 项目查询、创建、修改、作废、导出需要独立权限点
- 查询通常受客户、供应商、人员等数据权限影响
- 自动补建主数据和库存调整都应记录审计

## 优化后表设计冻结

- 项目域继续保留独立主表 `project` 与明细表 `project_material_line`
- 不并入通用单据家族表，避免项目业务事实被普通出入库语义稀释
- 库存消耗与回补仍通过 `inventory-core` 执行
- 第一阶段不接 `workflow`，主表 `auditStatusSnapshot` 固定走 `NOT_REQUIRED`
- 详细业务流程与字段建议见 `docs/20-wms-business-flow-and-optimized-schema.md`

## 待补测试清单

- 创建项目并扣减库存测试
- 修改项目明细差量调整测试
- 作废项目恢复库存测试
- 自动补建主数据测试

## 暂不实现范围

- 完整项目生命周期管理
- 标准制造 BOM 引擎
