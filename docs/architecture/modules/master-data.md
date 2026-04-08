# `master-data` 模块设计

## 模块目标与职责

负责基础资料主档，包括物料、客户、供应商、人员、车间，以及被多个业务域共享的基础查询能力。第一阶段不把项目/BOM 继续混入本模块。

**口径**：产品语境中的「生产车间」应按基础数据中的 `workshop` 主档划分；若页面需要左侧筛选或分栏，也应基于 `workshop`，而不是系统管理中的 `department`。`workshop` 主档用于单据归属与成本核算，不承担独立库存池语义（详见库存与车间物料域文档）。

## 当前实现成熟度

当前代码已实现物料（`material`）的新增、修改、作废和查询路径。客户、供应商、人员、车间目前以列表和只读查询为主，完整写路径（新增、修改、作废）属于目标范围，尚未全部落地。此差距不影响模块边界归属：这些实体的写路径仍由 `master-data` 拥有，不应移交给其他模块。

## 原 Java 来源与映射范围

- `business/src/main/java/com/saifute/base`
- `business/src/main/resources/mapper/base`
- 与项目强耦合但应拆出的部分来源于 `business/src/main/java/com/saifute/article`

映射规则：

- `base` 中纯主数据能力 -> `master-data`
- `article` 中项目/BOM 相关能力 -> `project`

## 领域对象与核心用例

核心对象：

- `Material`
- `Customer`
- `Supplier`
- `Personnel`
- `Workshop`

核心用例：

- 主数据列表、详情、新增、修改、作废
- 物料分类与辅助字典查询
- 为单据模块提供标准下拉和快照查询
- 在业务明确要求时执行受控的“自动补建主数据”

## Controller 接口草案

- `GET /master-data/materials`
- `POST /master-data/materials`
- `PATCH /master-data/materials/:id`
- `GET /master-data/customers`
- `GET /master-data/suppliers`
- `GET /master-data/personnel`
- `GET /master-data/workshops`

## Application 层编排

- `CreateMaterialUseCase`
- `UpdateMaterialUseCase`
- `VoidMaterialUseCase`
- `SearchMasterDataUseCase`
- `EnsureMasterDataExistsUseCase`

说明：

- `EnsureMasterDataExistsUseCase` 只对确有历史兼容需求的单据流程开放，避免任意业务隐式创建主数据

## Domain 规则与约束

- 主数据作废优先采用逻辑停用，不直接物理删除
- 物料作废前必须校验库存与未完成业务引用
- 编码生成、唯一性和名称规范要显式建模，避免继续散落在 SQL 中
- 自动补建主数据必须可审计、可回溯

## Infrastructure 设计

- 基础主表 CRUD 使用 Prisma
- 树形客户、分类字典、复杂筛选可使用 raw SQL
- 提供 `MasterDataQueryService` 给其他模块读取稳定视图
- 对外暴露主数据快照 DTO，避免其他模块直接耦合内部表结构

## 与其他模块的依赖关系

- 被 `inventory-core`、`inbound`、`customer`、`workshop-material`、`project` 依赖
- 依赖 `rbac` 提供权限与数据权限
- 变更审计接入 `audit-log`

## 事务边界与一致性要求

- 主数据自身 CRUD 保持单事务
- 涉及“自动补建主数据 + 单据创建”的场景，应由上层业务模块统一控制事务边界

## 权限点、数据权限、审计要求

- 主数据管理接口需要明确 `Permissions`
- 列表查询需评估是否应用部门/人员类数据权限
- 新增、修改、作废都必须产生操作审计

## 优化后表设计冻结

- 对应主表：`material_category`、`material`、`customer`、`supplier`、`personnel`、`workshop`
- 第一阶段不把客户、供应商、人员合并成统一主体表
- 自动补建先保留在各主表，通过 `creationMode`、`sourceDocumentType`、`sourceDocumentId` 追溯来源
- 单据侧只拿快照，不允许直接联查主数据内部结构
- 详细业务流程与字段建议见 `docs/architecture/20-wms-database-tables-and-schema.md`

## 待补测试清单

- 物料新增与唯一性测试
- 物料作废前库存校验测试
- 主数据快照查询测试
- 自动补建主数据审计测试

## 暂不实现范围

- 项目/BOM
- 主数据批量导入优化
- 主数据版本化

