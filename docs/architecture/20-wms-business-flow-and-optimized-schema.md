# WMS 业务流程与优化表设计

## 1. 文档目标

本文件用于在 `docs/architecture/00-architecture-overview.md` 的模块边界之上，进一步冻结：

- 共享核心与事务单据的业务流程
- 优化后的逻辑数据模型
- 面向 MySQL / Prisma 的物理表设计原则
- `Prisma` 模型与数据结构映射口径

该文档解决的问题是：原 Java 设计可能把主数据、库存副作用、审核状态、单据字段混杂在一起，导致模块职责和表职责不清。NestJS 版本统一按领域重构，不直接照搬旧表。

## 2. 设计原则

### 2.1 边界冻结

- `master-data` 只负责主数据与快照查询，不直接维护库存或审核状态
- `inventory-core` 是唯一库存写入口，单据模块不能绕过它直接改库存
- `workflow` 只负责审核投影与审核动作，不替代业务单据主状态
- `reporting` 只做读模型与汇总查询，不拥有事务写模型

### 2.2 单据建模原则

- 不设计“一张超级单据表 + 一张超级明细表”
- 按业务家族拆为入库、客户收发、车间物料、项目四类写模型
- 单据表只保存业务事实和必要快照
- 库存日志、来源追踪、编号区间、审核状态下沉到共享核心

### 2.3 状态设计原则

库存型单据不再依赖一个混杂的 `status` 字段，而是拆成三条状态轴：

- `lifecycleStatus`：`EFFECTIVE`、`VOIDED`
- `auditStatusSnapshot`：`NOT_REQUIRED`、`PENDING`、`APPROVED`、`REJECTED`
- `inventoryEffectStatus`：`POSTED`、`REVERSED`

其中：

- 单据主状态由业务模块维护
- 审核状态以 `workflow_audit_document` 为准，单据表仅保留快照字段方便列表查询
- 库存副作用状态由 `inventory-core` 控制

### 2.4 事务原则

- 单据主表、明细、库存现值、库存流水、来源追踪、审核投影优先同事务提交
- 修改单据必须按明细差量处理，不允许“直接覆盖旧明细”
- 作废必须走逆操作，不允许直接改回库存结果
- 审计日志允许异步，但主业务事实和库存副作用不能拆事务

### 2.5 库存范围与归属分离原则

- 实物库存范围与业务归属维度必须分离，不能让一个字段同时承担“货放在哪”和“算到谁头上”
- 第一阶段真实库存范围只承接 `MAIN`（主仓）与 `RD_SUB`（研发小仓）
- `workshop` 只承担主仓领料、退料、报废的归属与成本核算，不建立车间库存余额
- `project` 只承担研发归集，不直接等同库存池
- 同一物料不同入库批次允许存在不同成本层，出库、领料、退料必须按来源分配传递成本

## 3. 业务流程总览

```mermaid
flowchart TD
    masterData[MasterData]
    documentFamily[DocumentFamily]
    inventoryCore[InventoryCore]
    workflow[Workflow]
    reporting[ReportingViews]

    masterData -->|"snapshot / ensure"| documentFamily
    documentFamily -->|"increase / decrease / reverse"| inventoryCore
    documentFamily -->|"create / reset / approve"| workflow
    inventoryCore --> reporting
    workflow --> reporting
    documentFamily --> reporting
```

### 3.1 当前 NestJS 模块与单据家族映射

本章正文按“单据家族 / 共享核心”来写，而不是按 controller 名称来写。为避免阅读时误以为 `inbound` 缺席，先补一张“模块 -> 表 -> 单据家族”的阅读映射表：

| NestJS 模块           | 路由前缀                 | 覆盖对象   | 对应核心表                                                                                     | 说明                                     |
| ------------------- | -------------------- | ------ | ----------------------------------------------------------------------------------------- | -------------------------------------- |
| `master-data`       | `/master-data`       | 主数据    | `material_category`、`material`、`customer`、`supplier`、`personnel`、`workshop`、`stock_scope` | 为事务单据提供主档、归属维度与真实库存范围                  |
| `inventory-core`    | `/inventory`         | 库存核心   | `inventory_balance`、`inventory_log`、`inventory_source_usage`、`factory_number_reservation` | 库存唯一写入口                                |
| `workflow`          | `/workflow`          | 审核投影   | `workflow_audit_document`                                                                 | 单据表只保留审核快照                             |
| `inbound`           | `/inbound`           | 入库家族   | `stock_in_order`、`stock_in_order_line`                                                    | `orders` 对应验收单，`into-orders` 对应生产入库单   |
| `customer`          | `/customer`          | 客户收发家族 | `customer_stock_order`、`customer_stock_order_line`                                        | `orders` 对应出库单，`sales-returns` 对应销售退货单 |
| `workshop-material` | `/workshop-material` | 车间物料家族 | `workshop_material_order`、`workshop_material_order_line`                                  | `pick` / `return` / `scrap` 共用一套主从表    |
| `project`           | `/projects`          | 项目家族   | `project`、`project_material_line`                                                         | 默认不走审核                                 |
| `reporting`         | `/reporting`         | 只读报表   | 读取事务表与视图                                                                                  | 不拥有事务写模型                               |

补充说明：

- 因此本文第 `5.1` 节“入库家族”就是当前 NestJS 的 `inbound` 模块设计口径，不是遗漏。
- NestJS 按“模块聚合 + 家族共表”组织接口，而不是按 Java 的“每类单据一套 controller + 一套表”复刻。

## 4. 共享核心业务流程

### 4.1 `master-data`

主流程：

1. 维护物料、客户、供应商、人员、车间、库存范围主档
2. 为单据提供标准查询与快照能力
3. 在被明确允许时，为历史兼容场景执行受控自动补建

关键约束：

- 作废优先逻辑停用，不物理删除
- 物料停用前必须校验库存余额和未完成业务引用
- 自动补建必须记录来源单据和来源操作人
- 单据只读取快照，不直接耦合主数据内部表结构

### 4.2 `inventory-core`

主流程：

1. 根据单据命令和目标 `stockScopeId` 执行 `increaseStock()` 或 `decreaseStock()`
2. 同事务写入 `inventory_balance` 与 `inventory_log`
3. 如涉及消耗来源，维护 `inventory_source_usage` 并记录来源成本层分配
4. 如涉及出厂编号区间，维护 `factory_number_reservation`
5. 作废时通过 `reverseStock()` 生成逆向流水并释放占用

关键约束：

- `inventory-core` 是库存唯一写入口
- 库存现值与库存日志必须同时存在
- `inventory_source_usage` 与逆操作补偿不可省略
- 真实库存范围与 `workshop` / `project` 归属必须分离
- 同一物料不同来源批次可保留不同成本层，出库成本必须通过来源分配传递
- 幂等通过 `idempotencyKey` 保证，避免重复写库存

### 4.3 `workflow`

主流程：

1. 单据创建后创建或刷新 `workflow_audit_document`
2. 审核执行通过、拒绝、重置等动作
3. 单据修改后是否重置审核由业务模块决定，但统一由 `workflow` 落表
4. 作废前通过查询服务校验下游依赖和审核约束

关键约束：

- 仅兼容三态审核：待审、通过、拒绝
- 审核记录是横切投影，不替代业务单据主状态
- 审核表不直接持有库存逻辑
- 审核模块不直接反向写业务单据，只返回明确结果

## 5. 单据家族业务流程

### 5.1 入库家族

范围：

- `stock_in_order`：验收单、生产入库单
- `stock_in_order_line`

流程：

1. 校验供应商、经办人、库存范围、车间、物料等主数据
2. 写主表与明细
3. 调用 `inventory-core.increaseStock()`
4. 创建或刷新审核记录
5. 修改时按明细差量重算库存并重置审核
6. 作废时调用 `reverseStock()` 冲回已入库结果

NestJS `inbound` 模块映射补充：

- `/inbound/orders` 对应 `StockInOrderType.ACCEPTANCE`，即验收单
- `/inbound/into-orders` 对应 `StockInOrderType.PRODUCTION_RECEIPT`，即生产入库单
- 两类单据共用 `stock_in_order` / `stock_in_order_line`，差异通过 `orderType`、权限前缀、应用服务入口区分
- 第一阶段验收单与生产入库单默认写入主仓 `MAIN`；RD 采购到货在验收时也先入主仓，再由后续协同过账转入 RD 小仓

### 5.2 客户收发家族

范围：

- `customer_stock_order`：出库单、销售退货单
- `customer_stock_order_line`

流程：

1. 出库时校验库存充足、客户主数据、编号区间
2. 销售退货时校验来源出库关系和可退数量
3. 写主表与明细
4. 调用 `inventory-core.decreaseStock()` 或 `increaseStock()`
5. 对出库行维护 `factory_number_reservation`
6. 通过 `document_relation`、`document_line_relation` 表达退货与出库上下游关系
7. 作废时逆操作库存并释放编号区间

NestJS `customer` 模块映射补充：

- 模块 canonical 命名为 `customer`，对外路由前缀为 `/customer`
- `/customer/orders` 对应 `CustomerStockOrderType.OUTBOUND`，即出库单
- `/customer/sales-returns` 对应 `CustomerStockOrderType.SALES_RETURN`，即销售退货单
- 两类单据共用 `customer_stock_order` / `customer_stock_order_line`
- 销售退货与出库的来源关系优先通过 `document_relation`、`document_line_relation` 表达，而不是继续拆独立关系表
- 第一阶段客户出库与销售退货默认作用于主仓 `MAIN`

历史数据兼容补充：

- 在线运行时仍可保持“销售退货创建时优先校验来源出库关系”的策略。
- 历史迁移数据在无法证明上游关系时，行内 `sourceDocumentType/sourceDocumentId/sourceDocumentLineId` 可为空。

### 5.3 车间物料家族

范围：

- `workshop_material_order`：领料单、退料单、报废单
- `workshop_material_order_line`

流程：

1. 领料、报废走对主仓 `MAIN` 的 `decreaseStock()`
2. 退料走对主仓 `MAIN` 的 `increaseStock()`
3. `workshopId` 只用于归属与成本核算，不建立车间库存余额
4. 对消耗类动作维护 `inventory_source_usage`
5. 通过单据关系表表达退料对领料的回冲关系
6. 作废时执行逆操作并释放来源占用

历史数据兼容补充：

- 在线运行时仍可保持“退料优先校验来源领料关系”的策略。
- 历史迁移数据在无法证明上游领料关系时，行内 `sourceDocumentType/sourceDocumentId/sourceDocumentLineId` 可为空。

审核策略补充：

- `workshop_material_order.auditStatusSnapshot` 在表结构上默认按 `PENDING` 处理
- 若某类 `orderType` 明确不走审核，由应用层在创建时显式写入 `NOT_REQUIRED`

NestJS `workshop-material` 模块映射补充：

- `/workshop-material/pick-orders` 对应 `WorkshopMaterialOrderType.PICK`
- `/workshop-material/return-orders` 对应 `WorkshopMaterialOrderType.RETURN`
- `/workshop-material/scrap-orders` 对应 `WorkshopMaterialOrderType.SCRAP`
- 三类车间物料单据共用 `workshop_material_order` / `workshop_material_order_line`，由 `orderType` 和库存方向决定业务语义

### 5.4 项目家族

范围：

- `project`
- `project_material_line`

流程：

1. 创建项目主表与项目物料明细
2. 与 RD 小仓有关的领用、退料、报废默认对 `RD_SUB` 调用 `inventory-core`，项目只承担归集
3. 默认不接 `workflow`，`auditStatusSnapshot` 固定为 `NOT_REQUIRED`
4. 作废项目时回补库存，并保留项目历史事实

NestJS `project` / `reporting` 模块映射补充：

- `/projects` 直接对应 `project` / `project_material_line`
- `/reporting` 不拥有单独事务表，统一读取四类单据家族、库存表与只读视图
- 因此项目域是独立写模型，而报表域是独立读模型，两者不应在实现上混成一个“统计增强版项目模块”

## 6. 优化后的逻辑数据模型

### 6.1 数据表总表

| 所属模块                | 名称                             | 类型  | 说明                 |
| ------------------- | ------------------------------ | --- | ------------------ |
| `master-data`       | `material_category`            | 表   | 物料分类               |
| `master-data`       | `material`                     | 表   | 物料主档               |
| `master-data`       | `customer`                     | 表   | 客户主档               |
| `master-data`       | `supplier`                     | 表   | 供应商主档              |
| `master-data`       | `personnel`                    | 表   | 人员主档               |
| `master-data`       | `workshop`                     | 表   | 车间主档（归属 / 核算维度）    |
| `master-data`       | `stock_scope`                  | 表   | 库存范围主档（主仓 / RD 小仓） |
| `inventory-core`    | `inventory_balance`            | 表   | 库存现值               |
| `inventory-core`    | `inventory_log`                | 表   | 库存流水               |
| `inventory-core`    | `inventory_source_usage`       | 表   | 来源分配 / 释放追踪        |
| `inventory-core`    | `factory_number_reservation`   | 表   | 出厂编号区间占用           |
| `workflow`          | `workflow_audit_document`      | 表   | 审核投影表              |
| `inbound`           | `stock_in_order`               | 表   | 入库家族主表，承载验收单与生产入库单 |
| `inbound`           | `stock_in_order_line`          | 表   | 入库家族明细             |
| `customer`          | `customer_stock_order`         | 表   | 客户收发主表，承载出库单与销售退货单 |
| `customer`          | `customer_stock_order_line`    | 表   | 客户收发明细             |
| `workshop-material` | `workshop_material_order`      | 表   | 车间物料主表，承载领料、退料、报废  |
| `workshop-material` | `workshop_material_order_line` | 表   | 车间物料明细             |
| `project`           | `project`                      | 表   | 项目主表               |
| `project`           | `project_material_line`        | 表   | 项目物料明细             |
| `cross-document`    | `document_relation`            | 表   | 表头级上下游关系           |
| `cross-document`    | `document_line_relation`       | 表   | 行级上下游关系            |
| `audit-log`         | `sys_logininfor`               | 表   | 登录日志               |
| `audit-log`         | `sys_oper_log`                 | 表   | 操作日志               |
| `scheduler`         | `sys_job`                      | 表   | 定时任务定义             |
| `scheduler`         | `sys_job_log`                  | 表   | 定时任务执行日志           |
| `reporting`         | `vw_inventory_warning`         | 视图  | 库存预警读模型            |
| `reporting`         | `vw_document_summary`          | 视图  | 单据汇总读模型            |
| `reporting`         | `vw_document_line_summary`     | 视图  | 单据行汇总读模型           |

补充说明：

- `session` 当前走 `Redis`，不落单独 MySQL 业务表。
- `auth`、`rbac`、`file-storage`、`ai-assistant`、`reporting` 主要提供认证、路由、文件、AI、报表读接口，不额外拥有新的事务写模型表。

## 6.2 `master-data` 表

| 表名                  | 说明    | 关键字段                                                                                                       | 关键约束               |
| ------------------- | ----- | ---------------------------------------------------------------------------------------------------------- | ------------------ |
| `material_category` | 物料分类树 | `categoryCode`、`categoryName`、`parentId`                                                                   | `categoryCode` 唯一  |
| `material`          | 物料主档  | `materialCode`、`materialName`、`specModel`、`categoryId`、`unitCode`、`warningMinQty`、`warningMaxQty`、`status` | `materialCode` 唯一  |
| `customer`          | 客户主档  | `customerCode`、`customerName`、`parentId`、`status`                                                          | `customerCode` 唯一  |
| `supplier`          | 供应商主档 | `supplierCode`、`supplierName`、`status`                                                                     | `supplierCode` 唯一  |
| `personnel`         | 人员主档  | `personnelCode`、`personnelName`、`status`                                                                   | `personnelCode` 唯一 |
| `workshop`          | 车间主档  | `workshopCode`、`workshopName`、`status`                                                                     | `workshopCode` 唯一  |
| `stock_scope`       | 库存范围  | `scopeCode`、`scopeName`、`scopeType`、`status`                                                               | `scopeCode` 唯一     |

补充说明：

- 自动补建不单独拆交易表，在主数据主表保留 `creationMode`、`sourceDocumentType`、`sourceDocumentId` 追溯来源
- 物料分类与主数据字典分离，不把分类字段直接塞进 `material`
- 客户、供应商、人员保持分表，不并表为通用主体
- `stock_scope` 用于表达主仓、研发小仓等真实库存范围，不等同标准 WMS 的仓库 / 库位体系
- `workshop` 只用于单据归属与成本核算，不承担库存余额维度

## 6.3 `inventory-core` 表

| 表名                           | 说明       | 关键字段                                                                                                                                                                          | 关键约束                                                     |
| ---------------------------- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| `inventory_balance`          | 物料库存现值   | `materialId`、`stockScopeId`、`quantityOnHand`、`rowVersion`                                                                                                                     | `materialId + stockScopeId` 唯一                           |
| `inventory_log`              | 不可变库存流水  | `balanceId`、`stockScopeId`、`direction`、`operationType`、`businessDocumentType`、`businessDocumentId`、`changeQty`、`beforeQty`、`afterQty`、`unitCost`、`totalCost`、`idempotencyKey` | `idempotencyKey` 唯一                                      |
| `inventory_source_usage`     | 消耗来源追踪   | `materialId`、`sourceLogId`、`consumerDocumentType`、`consumerDocumentId`、`consumerLineId`、`allocatedQty`、`releasedQty`、`allocatedUnitCost`、`allocatedAmount`                    | `consumerDocumentType + consumerLineId + sourceLogId` 唯一 |
| `factory_number_reservation` | 出厂编号区间占用 | `materialId`、`businessDocumentType`、`businessDocumentId`、`businessDocumentLineId`、`startNumber`、`endNumber`、`status`                                                          | 单据行与区间组合唯一                                               |

补充说明：

- 第一阶段真实库存范围固定为 `MAIN` 与 `RD_SUB`
- 对历史上无法明确判定库存范围的数据，默认归到 `MAIN`；确需留痕时使用受控历史兜底范围，而不是默认车间
- `workshopId` 只用于主仓领退料的归属与成本核算，不参与库存余额唯一键
- `projectId` 只用于研发归集，不直接等同库存池
- 同一物料不同来源批次允许不同成本层；入库类成本写入来源流水，出库类成本由 `inventory_source_usage` 分配
- `inventory_warning` 不落交易表，改为读模型视图 `vw_inventory_warning`

## 6.4 `workflow` 表

| 表名                        | 说明    | 关键字段                                                                                                               | 关键约束                           |
| ------------------------- | ----- | ------------------------------------------------------------------------------------------------------------------ | ------------------------------ |
| `workflow_audit_document` | 审核投影表 | `documentFamily`、`documentType`、`documentId`、`documentNumber`、`auditStatus`、`submittedBy`、`decidedBy`、`resetCount` | `documentType + documentId` 唯一 |

补充说明：

- 审核表只保存当前有效审核状态
- 审核动作的细粒度日志继续落 `audit-log`
- `workflow` 不和单据表建立多态外键，避免跨模块强耦合

## 6.5 `inbound` 表

| 表名                    | 说明          | 关键字段                                                                                        | 关键约束                  |
| --------------------- | ----------- | ------------------------------------------------------------------------------------------- | --------------------- |
| `stock_in_order`      | 验收单、生产入库单主表 | `documentNo`、`orderType`、`stockScopeId`、`supplierId`、`handlerPersonnelId`、`workshopId`、三轴状态 | `documentNo` 唯一       |
| `stock_in_order_line` | 入库明细        | `orderId`、`lineNo`、`materialId`、`quantity`、`unitPrice`、`amount`                             | `orderId + lineNo` 唯一 |

补充说明：

- `StockInOrderType.ACCEPTANCE` 与 `StockInOrderType.PRODUCTION_RECEIPT` 共用同一套主从表
- `inbound` 模块里的验收单与生产入库单只是在应用层入口不同，不再拆成两套独立表
- 第一阶段验收单与生产入库单默认写入主仓 `MAIN`
- 修改时必须按明细差量处理，不允许直接覆盖旧明细后忽略库存补偿

## 6.6 `customer` 表

| 表名                          | 说明          | 关键字段                                                                                      | 关键约束                  |
| --------------------------- | ----------- | ----------------------------------------------------------------------------------------- | --------------------- |
| `customer_stock_order`      | 出库单、销售退货单主表 | `documentNo`、`orderType`、`stockScopeId`、`customerId`、`handlerPersonnelId`、三轴状态            | `documentNo` 唯一       |
| `customer_stock_order_line` | 客户收发明细      | `orderId`、`lineNo`、`materialId`、`quantity`、`unitPrice`、`amount`、`startNumber`、`endNumber` | `orderId + lineNo` 唯一 |

补充说明：

- `CustomerStockOrderType.OUTBOUND` 与 `CustomerStockOrderType.SALES_RETURN` 共用同一套主从表
- 销售退货与出库的主关系优先通过关系表表达，不在主表持续堆砌特化字段
- 第一阶段客户出库与销售退货默认作用于主仓 `MAIN`
- 对历史迁移数据，行级 `sourceDocument*` 可作为可空增强字段

## 6.7 `workshop-material` 表

| 表名                             | 说明         | 关键字段                                                                           | 关键约束                  |
| ------------------------------ | ---------- | ------------------------------------------------------------------------------ | --------------------- |
| `workshop_material_order`      | 领料、退料、报废主表 | `documentNo`、`orderType`、`stockScopeId`、`workshopId`、`handlerPersonnelId`、三轴状态 | `documentNo` 唯一       |
| `workshop_material_order_line` | 车间物料明细     | `orderId`、`lineNo`、`materialId`、`quantity`、`unitPrice`、`amount`                | `orderId + lineNo` 唯一 |

补充说明：

- `WorkshopMaterialOrderType.PICK`、`RETURN`、`SCRAP` 共用同一套主从表
- 退料与领料的回冲关系优先通过关系表表达，不继续复制 Java 的零散关系设计
- 第一阶段 `workshop-material` 的 `stockScopeId` 固定为主仓 `MAIN`；`workshopId` 只用于归属与成本核算，不代表车间库存
- 对历史迁移数据，行级 `sourceDocument*` 可作为可空增强字段

## 6.8 `project` 表

| 表名                      | 说明     | 关键字段                                                                             | 关键约束                    |
| ----------------------- | ------ | -------------------------------------------------------------------------------- | ----------------------- |
| `project`               | 项目主表   | `projectCode`、`projectName`、`customerId`、`supplierId`、`managerPersonnelId`、三轴状态  | `projectCode` 唯一        |
| `project_material_line` | 项目物料明细 | `projectId`、`lineNo`、`materialId`、`stockScopeId`、`quantity`、`unitPrice`、`amount` | `projectId + lineNo` 唯一 |

补充说明：

- 项目域虽然是事务型领域，但默认不接 `workflow`
- 项目消耗或回补库存仍必须走 `inventory-core`
- 与 RD 小仓有关的项目库存动作默认来自 `RD_SUB`；项目本身不形成新的物理库存池

## 6.9 跨单据关系表

| 表名                       | 说明       | 关键字段                                                                                           | 关键约束   |
| ------------------------ | -------- | ---------------------------------------------------------------------------------------------- | ------ |
| `document_relation`      | 表头级上下游关系 | `relationType`、`upstreamFamily`、`upstreamDocumentId`、`downstreamFamily`、`downstreamDocumentId` | 关系组合唯一 |
| `document_line_relation` | 行级上下游关系  | `relationType`、`upstreamLineId`、`downstreamLineId`、`linkedQty`                                 | 关系组合唯一 |

补充说明：

- 销售退货与出库、退料与领料优先通过关系表表达
- 单据行保留物料编码、名称、规格、单位等快照，避免历史口径被主数据修改污染

## 6.10 只读视图

只读视图包括：

- `vw_inventory_warning`
- `vw_document_summary`
- `vw_document_line_summary`

用途：

- 统一 `reporting` 的查询口径
- 减少报表层直接拼接多张主从表和库存表的复杂度
- 让导出与首页统计可以依赖稳定 SQL 视图

## 7. 统一字段规范

### 7.1 通用审计字段

所有核心表与单据表统一包含：

- `createdBy`
- `createdAt`
- `updatedBy`
- `updatedAt`

作废型表另外包含：

- `voidedBy`
- `voidedAt`
- `voidReason`

### 7.2 快照字段

所有事务单据明细统一保留：

- `materialCodeSnapshot`
- `materialNameSnapshot`
- `materialSpecSnapshot`
- `stockScopeNameSnapshot`
- `unitCodeSnapshot`

有主体信息的表头按需保留：

- `customerCodeSnapshot`
- `customerNameSnapshot`
- `supplierCodeSnapshot`
- `supplierNameSnapshot`
- `handlerNameSnapshot`
- `workshopNameSnapshot`

### 7.3 精度规范

- 数量统一 `decimal(18,6)`
- 金额统一 `decimal(18,2)`
- 不使用浮点类型承载库存与财务口径

## 8. MySQL 约束与索引策略

### 8.1 必须落物理唯一键的约束

- 主数据编码唯一
- 单据编号唯一
- 主从表 `parentId + lineNo` 唯一
- `inventory_balance(materialId, stockScopeId)` 唯一
- `inventory_log.idempotencyKey` 唯一
- `workflow_audit_document(documentType, documentId)` 唯一

### 8.2 需要应用层补充的约束

- 出厂编号区间不重叠
- 作废前下游依赖校验
- 单据修改时的差量计算
- 负库存策略

### 8.3 查询索引

- 单据主表：`bizDate`、`orderType`、`customerId` 或 `supplierId`、`stockScopeId`、`workshopId`
- 单据明细：`materialId`
- 库存流水：`businessDocumentType + businessDocumentId`、`occurredAt`
- 关系表：`upstreamDocumentId`、`downstreamDocumentId`
- 审核表：`auditStatus`、`documentFamily`

## 9. Prisma 模型映射

### 9.1 `schema.prisma` 模型分组

模型分组：

- 枚举：主数据状态、单据状态、库存方向、操作类型、关系类型
- 共享核心：`Material`、`Workshop`、`StockScope`、`InventoryBalance`、`InventoryLog`、`InventorySourceUsage`、`WorkflowAuditDocument`
- 单据家族：`StockInOrder`、`CustomerStockOrder`、`WorkshopMaterialOrder`、`Project`
- 关系与只读协作：`DocumentRelation`、`DocumentLineRelation`
