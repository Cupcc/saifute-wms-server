# `project` 模块设计

## 模块目标与职责

负责原 `article` 包中的项目主档、轻量 `BOM`、项目物料归集与项目成本引用能力。该模块不是项目管理系统，也不只是纯静态 `BOM`；当发生项目领退报废或客户销售引用项目成品时，需要与库存和客户域协同。

## 当前实现与目标范围

**当前实现**：代码目前已实现项目物料消耗链路，通过 `project` + `project_material_line` 记录物料消耗，并通过 `inventory-core` 差量扣减库存。当前最小归集模型已补充统一 `allocation_target` 主表，`project` 自动映射为 `RD_PROJECT`，对应已落地的单据类型为 `PROJECT_CONSUMPTION_OUT`。

**目标范围**（见 `docs/requirements/domain/project-management.md`）：项目域目标覆盖项目主档轻量 `CRUD`、固定 `RD_SUB` 作业口径、轻量 `BOM`、缺料预警与采购辅助、项目领料 / 退料 / 报废库存联动、项目净耗用 / 成本台账，以及 `customer` 销售对项目成品成本快照的引用。实际采购、验收、主仓入库和主仓到 `RD_SUB` 交接不由本模块主导，仍由相邻业务域承接。当前代码只实现了目标范围中的一部分。

## 原 Java 来源与映射范围

- `business/src/main/java/com/saifute/article`
- `business/src/main/resources/mapper/article`

## 领域对象与核心用例

核心对象：

- `Project`
- `ProjectBomLine`
- `ProjectMaterialLedger`
- `ProjectProductCostSnapshot`

核心用例：

- 创建项目主档并维护轻量 `BOM`
- 维护项目物料领用并按差量调整库存
- 记录项目退料 / 报废并更新项目净耗用成本
- 生成项目成品成本快照并提供给 `customer` 域引用

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

- 项目库存动作统一通过 `inventory-core` 处理消耗和回补
- 项目物料差量调整必须显式计算新增、修改、删除三路变化
- 项目缺料和补货状态优先通过 `BOM` + 仓别库存 + 采购协同结果派生
- 当前最小实现不引入 `label`，统一使用 `allocationTargetId` 作为归集真源
- 自动补建客户/供应商必须通过 `master-data` 受控入口

## Domain 规则与约束

- `article` 是旧命名，NestJS 中统一收敛为 `project`
- 不引入 `立项 / 暂停 / 关闭` 这类项目状态管理
- 项目修改不能直接覆盖旧明细，必须先算差量
- 项目删除若兼容现状，应保留恢复库存语义
- 项目域不直接维护审核流，必要时后续再接 `approval`

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
- 项目成品成本快照与 `customer` 引用需要保留冻结时点语义

## 权限点、数据权限、审计要求

- 项目查询、创建、修改、作废、导出需要独立权限点
- 查询通常受客户、供应商、人员等数据权限影响
- 自动补建主数据和库存调整都应记录审计

## 优化后表设计冻结

- 项目域继续保留独立主表 `project` 与明细表 `project_material_line`
- 统一归集对象使用 `allocation_target`；当前只有 `RD_PROJECT` 与 `project` 一对一绑定
- 不并入通用单据家族表，避免项目业务事实被普通出入库语义稀释
- 库存消耗与回补仍通过 `inventory-core` 执行
- 第一阶段不接 `approval`，主表 `auditStatusSnapshot` 固定走 `NOT_REQUIRED`
- 详细业务流程与字段建议见 `docs/architecture/20-wms-database-tables-and-schema.md`

## 待补测试清单

- 创建项目并扣减库存测试
- 修改项目明细差量调整测试
- 作废项目恢复库存测试
- 自动补建主数据测试

## 暂不实现范围

- 完整项目生命周期管理
- 标准制造 BOM 引擎
