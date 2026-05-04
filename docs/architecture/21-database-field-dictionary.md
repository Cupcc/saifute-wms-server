# WMS 数据库字段字典

## 1. 文档目标

本文件为 `20-wms-database-tables-and-schema.md` 的配套字段字典，逐表逐字段说明每个数据库列的含义、类型与约束。

阅读顺序建议：

1. 先阅读 `20-wms-database-tables-and-schema.md` 理解模块划分、设计原则与业务流程
2. 再使用本文件作为开发实施时的字段级参考

## 2. 通用约定

### 2.1 通用审计字段

除特殊说明外，所有业务核心表（`master-data`、`inventory-core`、`approval`、四大单据家族、R&D）统一包含以下审计字段，后续各表不再重复列出：


| 字段名         | 数据类型        | 必填  | 默认值     | 说明      |
| ----------- | ----------- | --- | ------- | ------- |
| `createdBy` | VARCHAR(64) | 否   | —       | 创建人标识   |
| `createdAt` | DATETIME    | 是   | `now()` | 创建时间    |
| `updatedBy` | VARCHAR(64) | 否   | —       | 最后修改人标识 |
| `updatedAt` | DATETIME    | 是   | 自动更新    | 最后修改时间  |


### 2.2 作废字段

可作废的单据主表（`stock_in_order`、`sales_stock_order`、`workshop_material_order`、`rd_project`、`rd_handoff_order`、`rd_procurement_request`、`rd_stocktake_order`）额外包含：


| 字段名          | 数据类型         | 必填  | 默认值 | 说明    |
| ------------ | ------------ | --- | --- | ----- |
| `voidReason` | VARCHAR(500) | 否   | —   | 作废原因  |
| `voidedBy`   | VARCHAR(64)  | 否   | —   | 作废操作人 |
| `voidedAt`   | DATETIME     | 否   | —   | 作废时间  |


### 2.3 三轴状态字段

库存型单据主表统一包含以下三条状态轴，后续各单据表不再重复列出：


| 字段名                     | 数据类型                                                    | 必填  | 默认值         | 说明                                         |
| ----------------------- | ------------------------------------------------------- | --- | ----------- | ------------------------------------------ |
| `lifecycleStatus`       | ENUM(`EFFECTIVE`, `VOIDED`)                             | 是   | `EFFECTIVE` | 单据生命周期状态                                   |
| `auditStatusSnapshot`   | ENUM(`NOT_REQUIRED`, `PENDING`, `APPROVED`, `REJECTED`) | 是   | 按单据类型       | 审核状态快照（实际状态以 `approval_document` 为准） |
| `inventoryEffectStatus` | ENUM(`POSTED`, `REVERSED`)                              | 是   | `POSTED`    | 库存副作用状态                                    |


### 2.4 明细快照字段

所有事务单据明细行统一包含物料快照，后续各明细表不再重复列出：


| 字段名                    | 数据类型         | 必填  | 默认值 | 说明                |
| ---------------------- | ------------ | --- | --- | ----------------- |
| `materialCodeSnapshot` | VARCHAR(64)  | 是   | —   | 物料编码快照（创建时从主数据拍照） |
| `materialNameSnapshot` | VARCHAR(128) | 是   | —   | 物料名称快照            |
| `materialSpecSnapshot` | VARCHAR(128) | 否   | —   | 规格型号快照            |
| `unitCodeSnapshot`     | VARCHAR(32)  | 是   | —   | 计量单位编码快照          |


### 2.5 精度规范


| 业务语义         | 数据类型            | 说明                              |
| ------------ | --------------- | ------------------------------- |
| 数量           | `DECIMAL(18,6)` | 所有数量字段统一 6 位小数,适用yu"个/千克/米"等单位 |
| 金额 / 单价 / 成本 | `DECIMAL(18,2)` | 所有金额字段统一 2 位小数                  |


---

## 3. `master-data` 主数据表

### 3.1 `material_category` — 物料分类


| 字段名            | 数据类型                       | 必填  | 默认值      | 唯一  | 说明                       |
| -------------- | -------------------------- | --- | -------- | --- | ------------------------ |
| `id`           | INT                        | 是   | 自增       | PK  | 主键                       |
| `categoryCode` | VARCHAR(64)                | 是   | —        | 是   | 分类编码，全局唯一                |
| `categoryName` | VARCHAR(128)               | 是   | —        | —   | 分类名称                     |
| `sortOrder`    | INT                        | 是   | `0`      | —   | 同级排序号                    |
| `status`       | ENUM(`ACTIVE`, `DISABLED`) | 是   | `ACTIVE` | —   | 启用状态                     |

### 3.2 `material` — 物料主档


| 字段名                  | 数据类型                           | 必填  | 默认值      | 唯一  | 说明                               |
| -------------------- | ------------------------------ | --- | -------- | --- | -------------------------------- |
| `id`                 | INT                            | 是   | 自增       | PK  | 主键                               |
| `materialCode`       | VARCHAR(64)                    | 是   | —        | 是   | 物料编码，全局唯一                        |
| `materialName`       | VARCHAR(128)                   | 是   | —        | —   | 物料名称                             |
| `specModel`          | VARCHAR(128)                   | 否   | —        | —   | 规格型号                             |
| `categoryId`         | INT                            | 否   | —        | —   | 所属分类 ID → `material_category.id` |
| `unitCode`           | VARCHAR(32)                    | 是   | —        | —   | 计量单位编码                           |
| `warningMinQty`      | DECIMAL(18,6)                  | 否   | —        | —   | 库存预警下限数量                         |
| `warningMaxQty`      | DECIMAL(18,6)                  | 否   | —        | —   | 库存预警上限数量                         |
| `status`             | ENUM(`ACTIVE`, `DISABLED`)     | 是   | `ACTIVE` | —   | 启用状态                             |
| `creationMode`       | ENUM(`MANUAL`, `AUTO_CREATED`) | 是   | `MANUAL` | —   | 创建方式：手工维护 / 单据自动补建               |
| `sourceDocumentType` | VARCHAR(64)                    | 否   | —        | —   | 自动补建来源单据类型（仅 `AUTO_CREATED` 时有值） |
| `sourceDocumentId`   | INT                            | 否   | —        | —   | 自动补建来源单据 ID                      |


索引：`categoryId`

### 3.3 `customer` — 客户主档


| 字段名                  | 数据类型                           | 必填  | 默认值      | 唯一  | 说明                      |
| -------------------- | ------------------------------ | --- | -------- | --- | ----------------------- |
| `id`                 | INT                            | 是   | 自增       | PK  | 主键                      |
| `customerCode`       | VARCHAR(64)                    | 是   | —        | 是   | 客户编码，全局唯一               |
| `customerName`       | VARCHAR(128)                   | 是   | —        | —   | 客户名称                    |
| `contactPerson`      | VARCHAR(128)                   | 否   | —        | —   | 联系人                     |
| `contactPhone`       | VARCHAR(32)                    | 否   | —        | —   | 联系方式                    |
| `address`            | VARCHAR(255)                   | 否   | —        | —   | 客户地址                    |
| `parentId`           | INT                            | 否   | —        | —   | 父客户 ID，支持客户层级树，自关联 `id` |
| `status`             | ENUM(`ACTIVE`, `DISABLED`)     | 是   | `ACTIVE` | —   | 启用状态                    |
| `creationMode`       | ENUM(`MANUAL`, `AUTO_CREATED`) | 是   | `MANUAL` | —   | 创建方式                    |
| `sourceDocumentType` | VARCHAR(64)                    | 否   | —        | —   | 自动补建来源单据类型              |
| `sourceDocumentId`   | INT                            | 否   | —        | —   | 自动补建来源单据 ID             |


索引：`parentId`

### 3.4 `supplier` — 供应商主档


| 字段名                  | 数据类型                           | 必填  | 默认值      | 唯一  | 说明          |
| -------------------- | ------------------------------ | --- | -------- | --- | ----------- |
| `id`                 | INT                            | 是   | 自增       | PK  | 主键          |
| `supplierCode`       | VARCHAR(64)                    | 是   | —        | 是   | 供应商编码，全局唯一  |
| `supplierName`       | VARCHAR(128)                   | 是   | —        | —   | 供应商名称       |
| `status`             | ENUM(`ACTIVE`, `DISABLED`)     | 是   | `ACTIVE` | —   | 启用状态        |
| `creationMode`       | ENUM(`MANUAL`, `AUTO_CREATED`) | 是   | `MANUAL` | —   | 创建方式        |
| `sourceDocumentType` | VARCHAR(64)                    | 否   | —        | —   | 自动补建来源单据类型  |
| `sourceDocumentId`   | INT                            | 否   | —        | —   | 自动补建来源单据 ID |


### 3.5 `personnel` — 人员主档


| 字段名                  | 数据类型                           | 必填  | 默认值      | 唯一  | 说明          |
| -------------------- | ------------------------------ | --- | -------- | --- | ----------- |
| `id`                 | INT                            | 是   | 自增       | PK  | 主键          |
| `personnelCode`      | VARCHAR(64)                    | 否   | —        | 是   | 人员编码        |
| `personnelType`      | VARCHAR(64)                    | 否   | —        | —   | 人员类型        |
| `personnelName`      | VARCHAR(128)                   | 是   | —        | —   | 人员名称        |
| `contactPhone`       | VARCHAR(32)                    | 否   | —        | —   | 联系电话        |
| `status`             | ENUM(`ACTIVE`, `DISABLED`)     | 是   | `ACTIVE` | —   | 启用状态        |

> 说明：`personnel` 只支持手工维护，不保留 `creationMode`、`sourceDocumentType`、`sourceDocumentId` 字段。


### 3.6 `workshop` — 车间主档


| 字段名            | 数据类型                       | 必填  | 默认值      | 唯一  | 说明        |
| -------------- | -------------------------- | --- | -------- | --- | --------- |
| `id`           | INT                        | 是   | 自增       | PK  | 主键        |
| `workshopName` | VARCHAR(128)               | 是   | —        | 是   | 车间名称      |
| `defaultHandlerPersonnelId` | INT           | 否   | —        | —   | 默认经办人 ID → `personnel.id` |
| `status`       | ENUM(`ACTIVE`, `DISABLED`) | 是   | `ACTIVE` | —   | 启用状态      |

> 说明：`workshop` 只用于单据归属与成本核算维度，不承担库存余额。无 `workshopCode`、无 `creationMode` 字段。

### 3.7 `stock_scope` — 库存范围


| 字段名         | 数据类型                       | 必填  | 默认值      | 唯一  | 说明                           |
| ----------- | -------------------------- | --- | -------- | --- | ---------------------------- |
| `id`        | INT                        | 是   | 自增       | PK  | 主键                           |
| `scopeCode` | VARCHAR(64)                | 是   | —        | 是   | 范围编码（如 `MAIN`、`RD_SUB`），全局唯一 |
| `scopeName` | VARCHAR(128)               | 是   | —        | —   | 范围名称                         |
| `status`    | ENUM(`ACTIVE`, `DISABLED`) | 是   | `ACTIVE` | —   | 启用状态                         |


> 说明：第一阶段真实库存范围固定为 `MAIN`（主仓）与 `RD_SUB`（研发小仓），不等同标准 WMS 的仓库/库位体系。

---

## 4. `inventory-core` 库存核心表

### 4.1 `inventory_balance` — 库存现值


| 字段名              | 数据类型          | 必填  | 默认值 | 唯一  | 说明                                |
| ---------------- | ------------- | --- | --- | --- | --------------------------------- |
| `id`             | INT           | 是   | 自增  | PK  | 主键                                |
| `materialId`     | INT           | 是   | —   | 联合① | 物料 ID → `material.id`             |
| `stockScopeId`   | INT           | 否   | —   | 联合① | 库存范围 ID → `stock_scope.id`        |
| `quantityOnHand` | DECIMAL(18,6) | 是   | `0` | —   | 当前库存数量                            |
| `rowVersion`     | INT           | 是   | `0` | —   | 乐观锁版本号，每次更新递增                     |


> 说明：`inventory_balance` 仅以 `stockScopeId` 作为库存轴，车间归属转而通过 `inventory_log.workshopId` 以及关联单据字段承载。

唯一约束：

- ① `materialId + stockScopeId`

索引：`stockScopeId`

### 4.2 `inventory_log` — 库存流水


| 字段名                      | 数据类型              | 必填  | 默认值     | 唯一  | 说明                                 |
| ------------------------ | ----------------- | --- | ------- | --- | ---------------------------------- |
| `id`                     | INT               | 是   | 自增      | PK  | 主键                                 |
| `balanceId`              | INT               | 是   | —       | —   | 关联的库存现值记录 → `inventory_balance.id` |
| `materialId`             | INT               | 是   | —       | —   | 物料 ID → `material.id`              |
| `stockScopeId`           | INT               | 否   | —       | —   | 库存范围 ID → `stock_scope.id`         |
| `bizDate`                | DATE              | 是   | —       | —   | 业务归属日期；月度 / 区间统计以此为准          |
| `workshopId`             | INT               | 否   | —       | —   | 车间 ID → `workshop.id`，用于归属与成本核算维度 |
| `projectTargetId`        | INT               | 否   | —       | —   | 统一目标维度 ID → `project_target.id` |
| `direction`              | ENUM(`IN`, `OUT`) | 是   | —       | —   | 库存增减方向真源；与始终为正的 `changeQty` 一起表达结果 |
| `operationType`          | ENUM(见下文)         | 是   | —       | —   | 库存动作语义；用于动作分类、报表口径与部分来源层规则 |
| `businessModule`         | VARCHAR(64)       | 是   | —       | —   | 来源业务模块标识；用于来源分类与审计，不作单据关联键 |
| `businessDocumentType`   | VARCHAR(64)       | 是   | —       | —   | 来源单据类型（如 `StockInOrder`、`SalesStockOrder`、`WorkshopMaterialOrder`） |
| `businessDocumentId`     | INT               | 是   | —       | —   | 来源单据主表 ID；与 `businessDocumentType` 共同定位单据 |
| `businessDocumentNumber` | VARCHAR(64)       | 是   | —       | —   | 来源单据编号快照；用于展示 / 搜索，不作真实关联键 |
| `businessDocumentLineId` | INT               | 否   | —       | —   | 来源单据明细行 ID；存在时用于行级追溯，字段可空且不保证唯一 |
| `changeQty`              | DECIMAL(18,6)     | 是   | —       | —   | 变动数量（始终为正值，方向由 `direction` 决定）     |
| `beforeQty`              | DECIMAL(18,6)     | 是   | —       | —   | 变动前库存数量                            |
| `afterQty`               | DECIMAL(18,6)     | 是   | —       | —   | 变动后库存数量                            |
| `unitCost`               | DECIMAL(18,2)     | 否   | —       | —   | 单位成本；入库方向来源流水的价格层真源，价格层查询按该字段聚合可用来源 |
| `costAmount`             | DECIMAL(18,2)     | 否   | —       | —   | 成本金额                               |
| `operatorId`             | VARCHAR(64)       | 否   | —       | —   | 操作人标识                              |
| `occurredAt`             | DATETIME          | 是   | `now()` | —   | 流水实际落库时间戳；当前实现通常等同写入时间 |
| `reversalOfLogId`        | INT               | 否   | —       | 是   | 所冲销的原始流水 ID；一条原流水最多对应一条逆操作，自关联 `id` |
| `idempotencyKey`         | VARCHAR(128)      | 是   | —       | 是   | 幂等键；按单次库存副作用写入意图去重，保障重试不重复落账 |
| `note`                   | VARCHAR(500)      | 否   | —       | —   | 备注                                 |


`operationType` 枚举值：


| 值                         | 方向  | 说明      |
| ------------------------- | --- | ------- |
| `ACCEPTANCE_IN`           | IN  | 验收入库    |
| `PRODUCTION_RECEIPT_IN`   | IN  | 生产入库    |
| `OUTBOUND_OUT`            | OUT | 销售出库    |
| `SALES_RETURN_IN`         | IN  | 销售退货入库  |
| `PICK_OUT`                | OUT | 车间领料出库  |
| `RETURN_IN`               | IN  | 车间退料入库  |
| `SCRAP_OUT`               | OUT | 报废出库    |
| `RD_PROJECT_OUT`      | OUT | 研发项目出库  |
| `RD_HANDOFF_OUT`          | OUT | 研发交接出库  |
| `RD_HANDOFF_IN`           | IN  | 研发交接入库  |
| `RD_STOCKTAKE_IN`         | IN  | 研发盘盈入库  |
| `RD_STOCKTAKE_OUT`        | OUT | 研发盘亏出库  |
| `PRICE_CORRECTION_OUT`    | OUT | 调价转出（剩余数量从原来源转出）                |
| `PRICE_CORRECTION_IN`     | IN  | 调价转入（按正确单价重新转入，纳入 FIFO 来源） |
| `REVERSAL_IN`             | IN  | 逆操作冲回入库 |
| `REVERSAL_OUT`            | OUT | 逆操作冲回出库 |

> 说明：`balanceId` / `stockScopeId` 承载真实库存轴；`workshopId` / `projectTargetId` 只承载归属或目标维度，不参与库存余额唯一键。`bizDate` 是业务归属日期，`occurredAt` 是流水实际落库时间戳，补录历史单据时两者可不同。`direction` 是增减方向真源，`changeQty` 始终记录正值。`businessDocumentType` + `businessDocumentId` + `businessDocumentLineId` 用于把流水回连到具体单据行，`businessDocumentNumber` 仅保留编号快照。`operationType` 表示库存动作语义，不等同 `businessDocumentType`；同一单据类型可对应多个动作，逆操作也会沿用原单据类型但把动作改为 `REVERSAL_IN` / `REVERSAL_OUT`。`idempotencyKey` 用于防重复写入，`reversalOfLogId` 用于逆操作闭环。销售出库价格层不单独建余额表，而是查询当前可用的入库来源流水并按 `unitCost` 聚合。


索引：`balanceId`、`stockScopeId`、`bizDate + direction`、`bizDate + operationType`、`stockScopeId + bizDate`、`workshopId + operationType + bizDate`、`businessDocumentType + businessDocumentId`、`businessDocumentType + businessDocumentId + businessDocumentLineId`、`occurredAt`

### 4.3 `inventory_source_usage` — 来源分配追踪


| 字段名                    | 数据类型                                                | 必填  | 默认值         | 唯一  | 说明                             |
| ---------------------- | --------------------------------------------------- | --- | ----------- | --- | ------------------------------ |
| `id`                   | INT                                                 | 是   | 自增          | PK  | 主键                             |
| `materialId`           | INT                                                 | 是   | —           | —   | 物料 ID → `material.id`          |
| `sourceLogId`          | INT                                                 | 是   | —           | 联合  | 来源入库流水 ID → `inventory_log.id` |
| `consumerDocumentType` | VARCHAR(64)                                         | 是   | —           | 联合  | 消耗单据类型                         |
| `consumerDocumentId`   | INT                                                 | 是   | —           | —   | 消耗单据主表 ID                      |
| `consumerLineId`       | INT                                                 | 是   | —           | 联合  | 消耗单据明细行 ID                     |
| `allocatedQty`         | DECIMAL(18,6)                                       | 是   | —           | —   | 已分配数量                          |
| `releasedQty`          | DECIMAL(18,6)                                       | 是   | `0`         | —   | 已释放数量（作废/退料时回补）                |
| `status`               | ENUM(`ALLOCATED`, `PARTIALLY_RELEASED`, `RELEASED`) | 是   | `ALLOCATED` | —   | 分配状态                           |


唯一约束：`consumerDocumentType + consumerLineId + sourceLogId`

索引：`materialId`、`consumerDocumentType + consumerDocumentId`

> 成本追溯说明：本表只记录消费行与来源流水之间的数量分配 / 释放关系，不冗余分配单价和金额。出库成本通过 `sourceLogId -> inventory_log.unitCost` 追溯来源价格层，并在消费单据行上固化 `costUnitPrice` / `costAmount` 快照。

### 4.4 `factory_number_reservation` — 出厂编号区间占用


| 字段名                      | 数据类型                                     | 必填  | 默认值        | 唯一  | 说明                         |
| ------------------------ | ---------------------------------------- | --- | ---------- | --- | -------------------------- |
| `id`                     | INT                                      | 是   | 自增         | PK  | 主键                         |
| `materialId`             | INT                                      | 是   | —          | —   | 物料 ID → `material.id`      |
| `stockScopeId`           | INT                                      | 否   | —          | —   | 库存范围 ID → `stock_scope.id` |
| `workshopId`             | INT                                      | 是   | —          | —   | 车间 ID → `workshop.id`      |
| `businessDocumentType`   | VARCHAR(64)                              | 是   | —          | 联合  | 业务单据类型                     |
| `businessDocumentId`     | INT                                      | 是   | —          | —   | 业务单据主表 ID                  |
| `businessDocumentLineId` | INT                                      | 是   | —          | 联合  | 业务单据明细行 ID                 |
| `startNumber`            | VARCHAR(64)                              | 是   | —          | 联合  | 起始出厂编号                     |
| `endNumber`              | VARCHAR(64)                              | 是   | —          | 联合  | 结束出厂编号                     |
| `status`                 | ENUM(`RESERVED`, `RELEASED`, `REVERSED`) | 是   | `RESERVED` | —   | 占用状态                       |
| `reservedAt`             | DATETIME                                 | 是   | `now()`    | —   | 占用时间                       |
| `releasedAt`             | DATETIME                                 | 否   | —          | —   | 释放时间                       |


唯一约束：`businessDocumentType + businessDocumentLineId + startNumber + endNumber`

索引：`materialId + stockScopeId`、`materialId + workshopId`、`businessDocumentType + businessDocumentId`

---

## 5. `approval` 审核投影表

### 5.1 `approval_document` — 审核投影


| 字段名              | 数据类型                                                               | 必填  | 默认值       | 唯一  | 说明                              |
| ---------------- | ------------------------------------------------------------------ | --- | --------- | --- | ------------------------------- |
| `id`             | INT                                                                | 是   | 自增        | PK  | 主键                              |
| `documentFamily` | ENUM(`STOCK_IN`, `SALES_STOCK`, `WORKSHOP_MATERIAL`, `PROJECT`) | 是   | —         | —   | 单据家族                            |
| `documentType`   | VARCHAR(64)                                                        | 是   | —         | 联合  | 单据类型（如 `ACCEPTANCE`、`OUTBOUND`） |
| `documentId`     | INT                                                                | 是   | —         | 联合  | 单据主表 ID                         |
| `documentNumber` | VARCHAR(64)                                                        | 是   | —         | —   | 单据编号（快照）                        |
| `auditStatus`    | ENUM(`NOT_REQUIRED`, `PENDING`, `APPROVED`, `REJECTED`)            | 是   | `PENDING` | —   | 当前审核状态                          |
| `submittedBy`    | VARCHAR(64)                                                        | 否   | —         | —   | 提交审核人                           |
| `submittedAt`    | DATETIME                                                           | 否   | —         | —   | 提交审核时间                          |
| `decidedBy`      | VARCHAR(64)                                                        | 否   | —         | —   | 审核决策人                           |
| `decidedAt`      | DATETIME                                                           | 否   | —         | —   | 审核决策时间                          |
| `rejectReason`   | VARCHAR(500)                                                       | 否   | —         | —   | 拒绝原因                            |
| `resetCount`     | INT                                                                | 是   | `0`       | —   | 审核重置次数（单据修改后重置累加）               |
| `lastResetAt`    | DATETIME                                                           | 否   | —         | —   | 最近一次重置时间                        |


唯一约束：`documentType + documentId`

索引：`documentFamily + auditStatus`、`documentNumber`

---

## 6. `inbound` 入库家族表

### 6.1 `stock_in_order` — 入库单主表

承载验收单（`ACCEPTANCE`）和生产入库单（`PRODUCTION_RECEIPT`）。


| 字段名                                | 数据类型                                     | 必填  | 默认值 | 唯一  | 说明                                           |
| ---------------------------------- | ---------------------------------------- | --- | --- | --- | -------------------------------------------- |
| `id`                               | INT                                      | 是   | 自增  | PK  | 主键                                           |
| `documentNo`                       | VARCHAR(64)                              | 是   | —   | 是   | 单据编号，全局唯一                                    |
| `orderType`                        | ENUM(`ACCEPTANCE`, `PRODUCTION_RECEIPT`) | 是   | —   | —   | 入库单类型                                        |
| `bizDate`                          | DATE                                     | 是   | —   | —   | 业务日期                                         |
| `supplierId`                       | INT                                      | 否   | —   | —   | 供应商 ID → `supplier.id`（验收单使用）                |
| `handlerPersonnelId`               | INT                                      | 否   | —   | —   | 经办人 ID → `personnel.id`                      |
| `stockScopeId`                     | INT                                      | 否   | —   | —   | 库存范围 ID → `stock_scope.id`                   |
| `workshopId`                       | INT                                      | 是   | —   | —   | 车间 ID → `workshop.id`                        |
| `rdProcurementRequestId`           | INT                                      | 否   | —   | —   | 关联的 RD 采购申请 ID → `rd_procurement_request.id` |
| `revisionNo`                       | INT                                      | 是   | `1` | —   | 修订版本号，每次修改递增                                 |
| `supplierCodeSnapshot`             | VARCHAR(64)                              | 否   | —   | —   | 供应商编码快照                                      |
| `supplierNameSnapshot`             | VARCHAR(128)                             | 否   | —   | —   | 供应商名称快照                                      |
| `handlerNameSnapshot`              | VARCHAR(128)                             | 否   | —   | —   | 经办人姓名快照                                      |
| `workshopNameSnapshot`             | VARCHAR(128)                             | 是   | —   | —   | 车间名称快照                                       |
| `rdProcurementRequestNoSnapshot`   | VARCHAR(64)                              | 否   | —   | —   | 关联 RD 采购申请单号快照                               |
| `rdProcurementProjectCodeSnapshot` | VARCHAR(64)                              | 否   | —   | —   | 关联 RD 采购项目编码快照                               |
| `rdProcurementProjectNameSnapshot` | VARCHAR(128)                             | 否   | —   | —   | 关联 RD 采购项目名称快照                               |
| `totalQty`                         | DECIMAL(18,6)                            | 是   | `0` | —   | 明细合计数量                                       |
| `totalAmount`                      | DECIMAL(18,2)                            | 是   | `0` | —   | 明细合计金额                                       |
| `remark`                           | VARCHAR(500)                             | 否   | —   | —   | 备注                                           |


> 三轴状态、作废字段、审计字段参见第 2 节通用约定。`auditStatusSnapshot` 默认值为 `PENDING`。

索引：`bizDate + orderType`、`supplierId`、`stockScopeId`、`workshopId`、`rdProcurementRequestId`

### 6.2 `stock_in_order_line` — 入库单明细


| 字段名                          | 数据类型          | 必填  | 默认值 | 唯一  | 说明                                                 |
| ---------------------------- | ------------- | --- | --- | --- | -------------------------------------------------- |
| `id`                         | INT           | 是   | 自增  | PK  | 主键                                                 |
| `orderId`                    | INT           | 是   | —   | 联合  | 主表 ID → `stock_in_order.id`，主表删除时级联删除              |
| `lineNo`                     | INT           | 是   | —   | 联合  | 行号，同一主表内唯一                                         |
| `materialId`                 | INT           | 是   | —   | —   | 物料 ID → `material.id`                              |
| `rdProcurementRequestLineId` | INT           | 否   | —   | —   | 关联的 RD 采购申请行 ID → `rd_procurement_request_line.id` |
| `quantity`                   | DECIMAL(18,6) | 是   | —   | —   | 入库数量                                               |
| `unitPrice`                  | DECIMAL(18,2) | 是   | `0` | —   | 单价                                                 |
| `amount`                     | DECIMAL(18,2) | 是   | `0` | —   | 金额                                                 |
| `remark`                     | VARCHAR(500)  | 否   | —   | —   | 备注                                                 |


> 物料快照字段、审计字段参见第 2 节通用约定。

唯一约束：`orderId + lineNo`

索引：`materialId`、`rdProcurementRequestLineId`

### 6.3 `stock_in_price_correction_order` — 入库调价单主表（计划中）

当入库单价写错且来源已被部分消费时，通过调价单安全纠偏。


| 字段名                        | 数据类型          | 必填  | 默认值 | 唯一  | 说明                      |
| -------------------------- | ------------- | --- | --- | --- | ----------------------- |
| `id`                       | INT           | 是   | 自增  | PK  | 主键                      |
| `documentNo`               | VARCHAR(64)   | 是   | —   | 是   | 单据编号，全局唯一               |
| `bizDate`                  | DATE          | 是   | —   | —   | 业务日期                    |
| `stockScopeId`             | INT           | 否   | —   | —   | 库存范围 ID → `stock_scope.id` |
| `workshopId`               | INT           | 是   | —   | —   | 车间 ID → `workshop.id`   |
| `totalLineCount`           | INT           | 是   | `0` | —   | 明细行数                    |
| `totalHistoricalDiffAmount`| DECIMAL(18,2) | 是   | `0` | —   | 所有明细行历史差异金额合计           |
| `remark`                   | VARCHAR(500)  | 否   | —   | —   | 备注                      |


> 三轴状态、作废字段、审计字段参见第 2 节通用约定。`auditStatusSnapshot` 默认值为 `PENDING`。

索引：`bizDate`、`stockScopeId`、`workshopId`

### 6.4 `stock_in_price_correction_order_line` — 入库调价单明细（计划中）


| 字段名                        | 数据类型          | 必填  | 默认值 | 唯一  | 说明                                              |
| -------------------------- | ------------- | --- | --- | --- | ----------------------------------------------- |
| `id`                       | INT           | 是   | 自增  | PK  | 主键                                              |
| `orderId`                  | INT           | 是   | —   | 联合  | 主表 ID → `stock_in_price_correction_order.id`    |
| `lineNo`                   | INT           | 是   | —   | 联合  | 行号，同一主表内唯一                                      |
| `materialId`               | INT           | 是   | —   | —   | 物料 ID → `material.id`                           |
| `sourceStockInOrderId`     | INT           | 是   | —   | —   | 原入库单主表 ID → `stock_in_order.id`                 |
| `sourceStockInOrderLineId` | INT           | 是   | —   | —   | 原入库单明细 ID → `stock_in_order_line.id`            |
| `sourceInventoryLogId`     | INT           | 是   | —   | —   | 原入库来源流水 ID → `inventory_log.id`                 |
| `sourceDocumentNoSnapshot` | VARCHAR(64)   | 是   | —   | —   | 原入库单号快照                                         |
| `sourceBizDateSnapshot`    | DATE          | 否   | —   | —   | 原入库业务日期快照                                       |
| `wrongUnitCost`            | DECIMAL(18,2) | 是   | —   | —   | 原来源流水上的错误成本单价                                   |
| `correctUnitCost`          | DECIMAL(18,2) | 是   | —   | —   | 本次确认后的正确成本单价                                    |
| `sourceInQty`              | DECIMAL(18,6) | 是   | —   | —   | 原来源流水入库数量（审核时重算）                                |
| `consumedQtyAtCorrection`  | DECIMAL(18,6) | 是   | `0` | —   | 审核时已被下游消费的数量（审核时重算）                             |
| `remainingQtyAtCorrection` | DECIMAL(18,6) | 是   | `0` | —   | 审核时尚未消费的剩余数量（审核时重算）                             |
| `historicalDiffAmount`     | DECIMAL(18,2) | 是   | `0` | —   | 已出部分历史差异金额 = `(correctUnitCost - wrongUnitCost) × consumedQtyAtCorrection` |
| `generatedOutLogId`        | INT           | 否   | —   | —   | 审核过账生成的 `PRICE_CORRECTION_OUT` 流水 ID → `inventory_log.id` |
| `generatedInLogId`         | INT           | 否   | —   | —   | 审核过账生成的 `PRICE_CORRECTION_IN` 流水 ID → `inventory_log.id`  |
| `remark`                   | VARCHAR(500)  | 否   | —   | —   | 备注                                              |


> 物料快照字段、审计字段参见第 2 节通用约定。

唯一约束：`orderId + lineNo`

应用层约束：同一 `sourceInventoryLogId` 不允许存在多张未作废、未完成的调价单

索引：`materialId`、`sourceStockInOrderId`、`sourceInventoryLogId`

---

## 7. `sales` 销售业务家族表

### 7.1 `sales_stock_order` — 销售业务主表

承载出库单（`OUTBOUND`）和销售退货单（`SALES_RETURN`）。


| 字段名                    | 数据类型                             | 必填  | 默认值 | 唯一  | 说明                         |
| ---------------------- | -------------------------------- | --- | --- | --- | -------------------------- |
| `id`                   | INT                              | 是   | 自增  | PK  | 主键                         |
| `documentNo`           | VARCHAR(64)                      | 是   | —   | 是   | 单据编号，全局唯一                  |
| `orderType`            | ENUM(`OUTBOUND`, `SALES_RETURN`) | 是   | —   | —   | 单据类型                       |
| `bizDate`              | DATE                             | 是   | —   | —   | 业务日期                       |
| `customerId`           | INT                              | 否   | —   | —   | 客户 ID → `customer.id`      |
| `handlerPersonnelId`   | INT                              | 否   | —   | —   | 经办人 ID → `personnel.id`    |
| `stockScopeId`         | INT                              | 否   | —   | —   | 库存范围 ID → `stock_scope.id` |
| `workshopId`           | INT                              | 是   | —   | —   | 车间 ID → `workshop.id`      |
| `revisionNo`           | INT                              | 是   | `1` | —   | 修订版本号                      |
| `customerCodeSnapshot` | VARCHAR(64)                      | 否   | —   | —   | 客户编码快照                     |
| `customerNameSnapshot` | VARCHAR(128)                     | 否   | —   | —   | 客户名称快照                     |
| `handlerNameSnapshot`  | VARCHAR(128)                     | 否   | —   | —   | 经办人姓名快照                    |
| `workshopNameSnapshot` | VARCHAR(128)                     | 是   | —   | —   | 车间名称快照                     |
| `totalQty`             | DECIMAL(18,6)                    | 是   | `0` | —   | 明细合计数量                     |
| `totalAmount`          | DECIMAL(18,2)                    | 是   | `0` | —   | 明细合计金额                     |
| `remark`               | VARCHAR(500)                     | 否   | —   | —   | 备注                         |


> 三轴状态、作废字段、审计字段参见第 2 节。`auditStatusSnapshot` 默认值为 `PENDING`。

索引：`bizDate + orderType`、`customerId`、`stockScopeId`、`workshopId`

### 7.2 `sales_stock_order_line` — 销售业务明细


| 字段名                    | 数据类型          | 必填  | 默认值 | 唯一  | 说明                                          |
| ---------------------- | ------------- | --- | --- | --- | ------------------------------------------- |
| `id`                   | INT           | 是   | 自增  | PK  | 主键                                          |
| `orderId`              | INT           | 是   | —   | 联合  | 主表 ID → `sales_stock_order.id`，主表删除时级联删除 |
| `lineNo`               | INT           | 是   | —   | 联合  | 行号，同一主表内唯一                                  |
| `materialId`           | INT           | 是   | —   | —   | 物料 ID → `material.id`                       |
| `quantity`             | DECIMAL(18,6) | 是   | —   | —   | 数量                                          |
| `unitPrice`            | DECIMAL(18,2) | 是   | `0` | —   | 对客户的业务销售单价，不是库存成本价，不承载库存价格层语义                         |
| `amount`               | DECIMAL(18,2) | 是   | `0` | —   | 金额                                          |
| `selectedUnitCost`     | DECIMAL(18,2) | 是   | —   | —   | 用户选定的库存价格层单价，对应可用来源流水的 `inventory_log.unitCost` |
| `costUnitPrice`        | DECIMAL(18,2) | 否   | —   | —   | 成本单价，由同价格层内 FIFO 来源分配汇总后固化                    |
| `costAmount`           | DECIMAL(18,2) | 否   | —   | —   | 成本金额，由实际来源分配汇总后固化                            |
| `startNumber`          | VARCHAR(64)   | 否   | —   | —   | 出厂编号区间起始号（出库单使用）                            |
| `endNumber`            | VARCHAR(64)   | 否   | —   | —   | 出厂编号区间结束号                                   |
| `sourceDocumentType`   | VARCHAR(64)   | 否   | —   | —   | 来源单据类型（退货时指向出库单类型）                          |
| `sourceDocumentId`     | INT           | 否   | —   | —   | 来源单据主表 ID                                   |
| `sourceDocumentLineId` | INT           | 否   | —   | —   | 来源单据明细行 ID                                  |
| `remark`               | VARCHAR(500)  | 否   | —   | —   | 备注                                          |


> 物料快照字段、审计字段参见第 2 节。

唯一约束：`orderId + lineNo`

索引：`materialId`、`sourceDocumentType + sourceDocumentId + sourceDocumentLineId`

---

## 8. `workshop-material` 车间物料家族表

### 8.1 `workshop_material_order` — 车间物料主表

承载领料单（`PICK`）、退料单（`RETURN`）和报废单（`SCRAP`）。

> `SCRAP` 在车间物料域中按独立真实事务处理，不默认视为 `PICK` 的附属结果；车间净耗用与成本汇总应在读模型层按 `领料 - 退料 + 报废` 统一计算，不回写本表字段。

> 车间物料默认走轻审核；审核记录只做追溯，不阻断单据创建、库存过账和实时查询。


| 字段名                    | 数据类型                            | 必填  | 默认值 | 唯一  | 说明                                         |
| ---------------------- | ------------------------------- | --- | --- | --- | ------------------------------------------ |
| `id`                   | INT                             | 是   | 自增  | PK  | 主键                                         |
| `documentNo`           | VARCHAR(64)                     | 是   | —   | 是   | 单据编号，全局唯一                                  |
| `orderType`            | ENUM(`PICK`, `RETURN`, `SCRAP`) | 是   | —   | —   | 单据类型；`SCRAP` 为独立报废事务，不默认附属于 `PICK` |
| `bizDate`              | DATE                            | 是   | —   | —   | 业务日期                                       |
| `handlerPersonnelId`   | INT                             | 否   | —   | —   | 经办人 ID → `personnel.id`                    |
| `stockScopeId`         | INT                             | 否   | —   | —   | 库存范围 ID → `stock_scope.id`（第一阶段固定为主仓 MAIN） |
| `workshopId`           | INT                             | 是   | —   | —   | 车间 ID → `workshop.id`（归属与成本核算维度）           |
| `revisionNo`           | INT                             | 是   | `1` | —   | 修订版本号                                      |
| `handlerNameSnapshot`  | VARCHAR(128)                    | 否   | —   | —   | 经办人姓名快照                                    |
| `workshopNameSnapshot` | VARCHAR(128)                    | 是   | —   | —   | 车间名称快照                                     |
| `totalQty`             | DECIMAL(18,6)                   | 是   | `0` | —   | 明细合计数量                                     |
| `totalAmount`          | DECIMAL(18,2)                   | 是   | `0` | —   | 明细合计金额                                     |
| `remark`               | VARCHAR(500)                    | 否   | —   | —   | 备注                                         |


> 三轴状态、作废字段、审计字段参见第 2 节。`auditStatusSnapshot` 默认值为 `PENDING`。

索引：`bizDate + orderType`、`stockScopeId`、`workshopId`

### 8.2 `workshop_material_order_line` — 车间物料明细


| 字段名                    | 数据类型          | 必填  | 默认值 | 唯一  | 说明                                             |
| ---------------------- | ------------- | --- | --- | --- | ---------------------------------------------- |
| `id`                   | INT           | 是   | 自增  | PK  | 主键                                             |
| `orderId`              | INT           | 是   | —   | 联合  | 主表 ID → `workshop_material_order.id`，主表删除时级联删除 |
| `lineNo`               | INT           | 是   | —   | 联合  | 行号，同一主表内唯一                                     |
| `materialId`           | INT           | 是   | —   | —   | 物料 ID → `material.id`                          |
| `quantity`             | DECIMAL(18,6) | 是   | —   | —   | 数量                                             |
| `unitPrice`            | DECIMAL(18,2) | 是   | `0` | —   | 内部成本核算单价，不是销售价；实际消耗成本仍需可追溯到来源层                                             |
| `amount`               | DECIMAL(18,2) | 是   | `0` | —   | 成本核算金额                                             |
| `costUnitPrice`        | DECIMAL(18,2) | 否   | —   | —   | 成本单价（由来源分配计算填入）                                |
| `costAmount`           | DECIMAL(18,2) | 否   | —   | —   | 成本金额                                           |
| `sourceDocumentType`   | VARCHAR(64)   | 否   | —   | —   | 来源单据类型；退料时通常指向领料单，报废也可选填上游单据用于追溯 |
| `sourceDocumentId`     | INT           | 否   | —   | —   | 来源单据主表 ID；仅用于来源追溯、责任分析、价格对齐与成本回溯             |
| `sourceDocumentLineId` | INT           | 否   | —   | —   | 来源单据明细行 ID；退料应尽量回指原领料行，但允许为空，不改变报废独立事务口径 |
| `remark`               | VARCHAR(500)  | 否   | —   | —   | 备注                                             |


> 物料快照字段、审计字段参见第 2 节。退料在线运行时应尽量回指原领料关系，以价格对齐与追溯可用为主；若无法可靠匹配允许无源退料。报废允许不绑定领料而独立发生，若填写 `sourceDocument*` 仅表示追溯关系，不表示“报废属于领料”。

唯一约束：`orderId + lineNo`

索引：`materialId`、`sourceDocumentType + sourceDocumentId + sourceDocumentLineId`

---

## 9. `rd_project*` 研发项目家族表

### 9.1 `RdProject` 逻辑模型 / `rd_project` 物理表


| 字段名                    | 数据类型          | 必填  | 默认值 | 唯一  | 说明                         |
| ---------------------- | ------------- | --- | --- | --- | -------------------------- |
| `id`                   | INT           | 是   | 自增  | PK  | 主键                         |
| `projectCode`       | VARCHAR(64)   | 是   | —   | 是   | 研发项目编码，全局唯一 |
| `projectName`       | VARCHAR(128)  | 是   | —   | —   | 研发项目名称      |
| `bizDate`              | DATE          | 是   | —   | —   | 业务日期                       |
| `customerId`           | INT           | 否   | —   | —   | 客户 ID → `customer.id`      |
| `supplierId`           | INT           | 否   | —   | —   | 供应商 ID → `supplier.id`     |
| `managerPersonnelId`   | INT           | 否   | —   | —   | 项目负责人 ID → `personnel.id`  |
| `stockScopeId`         | INT           | 否   | —   | —   | 库存范围 ID → `stock_scope.id` |
| `workshopId`           | INT           | 是   | —   | —   | 车间 ID → `workshop.id`      |
| `projectTargetId`   | INT           | 否   | —   | 是   | 统一目标维度 ID → `project_target.id` |
| `revisionNo`           | INT           | 是   | `1` | —   | 修订版本号                      |
| `customerCodeSnapshot` | VARCHAR(64)   | 否   | —   | —   | 客户编码快照                     |
| `customerNameSnapshot` | VARCHAR(128)  | 否   | —   | —   | 客户名称快照                     |
| `supplierCodeSnapshot` | VARCHAR(64)   | 否   | —   | —   | 供应商编码快照                    |
| `supplierNameSnapshot` | VARCHAR(128)  | 否   | —   | —   | 供应商名称快照                    |
| `managerNameSnapshot`  | VARCHAR(128)  | 否   | —   | —   | 研发项目负责人姓名快照                |
| `workshopNameSnapshot` | VARCHAR(128)  | 是   | —   | —   | 车间名称快照                     |
| `totalQty`             | DECIMAL(18,6) | 是   | `0` | —   | 明细合计数量                     |
| `totalAmount`          | DECIMAL(18,2) | 是   | `0` | —   | 明细合计金额                     |
| `remark`               | VARCHAR(500)  | 否   | —   | —   | 备注                         |


> 系统生命周期字段、作废字段、审计字段参见第 2 节。这里的 `lifecycleStatus` / `auditStatusSnapshot` / `inventoryEffectStatus` 用于系统控制与追溯，不代表项目业务阶段。`auditStatusSnapshot` 默认值为 `NOT_REQUIRED`（项目默认不接审核）。

> 当前实现中，研发项目主档会自动生成一条 `project_target(targetType = RD_PROJECT)` 并通过 `projectTargetId` 一对一绑定；逻辑模型名为 `RdProject*`，物理层为 `rd_project*` 表。

索引：`bizDate`、`customerId`、`supplierId`、`stockScopeId`、`workshopId`

### 9.2 `RdProjectMaterialLine` 逻辑模型 / `rd_project_material_line` 物理表


| 字段名             | 数据类型          | 必填  | 默认值 | 唯一  | 说明                               |
| --------------- | ------------- | --- | --- | --- | -------------------------------- |
| `id`            | INT           | 是   | 自增  | PK  | 主键                               |
| `projectId`  | INT           | 是   | —   | 联合  | 研发项目主表 ID |
| `lineNo`        | INT           | 是   | —   | 联合  | 行号，同一项目内唯一                       |
| `materialId`    | INT           | 是   | —   | —   | 物料 ID → `material.id`            |
| `quantity`      | DECIMAL(18,6) | 是   | —   | —   | 数量                               |
| `unitPrice`     | DECIMAL(18,2) | 是   | `0` | —   | 单价                               |
| `amount`        | DECIMAL(18,2) | 是   | `0` | —   | 金额                               |
| `costUnitPrice` | DECIMAL(18,2) | 否   | —   | —   | 成本单价                             |
| `costAmount`    | DECIMAL(18,2) | 否   | —   | —   | 成本金额                             |
| `remark`        | VARCHAR(500)  | 否   | —   | —   | 备注                               |


> 物料快照字段、审计字段参见第 2 节。

唯一约束：`projectId + lineNo`

索引：`materialId`

---

## 10. `rd-subwarehouse` 研发小仓表

### 10.1 `rd_handoff_order` — 研发交接单主表


| 字段名                          | 数据类型          | 必填  | 默认值 | 唯一  | 说明                                |
| ---------------------------- | ------------- | --- | --- | --- | --------------------------------- |
| `id`                         | INT           | 是   | 自增  | PK  | 主键                                |
| `documentNo`                 | VARCHAR(64)   | 是   | —   | 是   | 单据编号，全局唯一                         |
| `bizDate`                    | DATE          | 是   | —   | —   | 业务日期                              |
| `handlerPersonnelId`         | INT           | 否   | —   | —   | 经办人 ID → `personnel.id`           |
| `sourceStockScopeId`         | INT           | 否   | —   | —   | 源库存范围 ID → `stock_scope.id`（交出方）  |
| `targetStockScopeId`         | INT           | 否   | —   | —   | 目标库存范围 ID → `stock_scope.id`（接收方） |
| `sourceWorkshopId`           | INT           | 是   | —   | —   | 源车间 ID → `workshop.id`            |
| `targetWorkshopId`           | INT           | 是   | —   | —   | 目标车间 ID → `workshop.id`           |
| `revisionNo`                 | INT           | 是   | `1` | —   | 修订版本号                             |
| `handlerNameSnapshot`        | VARCHAR(128)  | 否   | —   | —   | 经办人姓名快照                           |
| `sourceWorkshopNameSnapshot` | VARCHAR(128)  | 是   | —   | —   | 源车间名称快照                           |
| `targetWorkshopNameSnapshot` | VARCHAR(128)  | 是   | —   | —   | 目标车间名称快照                          |
| `totalQty`                   | DECIMAL(18,6) | 是   | `0` | —   | 明细合计数量                            |
| `totalAmount`                | DECIMAL(18,2) | 是   | `0` | —   | 明细合计金额                            |
| `remark`                     | VARCHAR(500)  | 否   | —   | —   | 备注                                |


> 三轴状态、作废字段、审计字段参见第 2 节。`auditStatusSnapshot` 默认值为 `NOT_REQUIRED`。

索引：`bizDate`、`sourceStockScopeId`、`targetStockScopeId`、`sourceWorkshopId`、`targetWorkshopId`

### 10.2 `rd_handoff_order_line` — 研发交接单明细


| 字段名                    | 数据类型          | 必填  | 默认值 | 唯一  | 说明                                      |
| ---------------------- | ------------- | --- | --- | --- | --------------------------------------- |
| `id`                   | INT           | 是   | 自增  | PK  | 主键                                      |
| `orderId`              | INT           | 是   | —   | 联合  | 主表 ID → `rd_handoff_order.id`，主表删除时级联删除 |
| `lineNo`               | INT           | 是   | —   | 联合  | 行号                                      |
| `materialId`           | INT           | 是   | —   | —   | 物料 ID → `material.id`                   |
| `quantity`             | DECIMAL(18,6) | 是   | —   | —   | 交接数量                                    |
| `unitPrice`            | DECIMAL(18,2) | 是   | `0` | —   | 单价                                      |
| `amount`               | DECIMAL(18,2) | 是   | `0` | —   | 金额                                      |
| `costUnitPrice`        | DECIMAL(18,2) | 否   | —   | —   | 成本单价                                    |
| `costAmount`           | DECIMAL(18,2) | 否   | —   | —   | 成本金额                                    |
| `sourceDocumentType`   | VARCHAR(64)   | 否   | —   | —   | 来源单据类型                                  |
| `sourceDocumentId`     | INT           | 否   | —   | —   | 来源单据主表 ID                               |
| `sourceDocumentLineId` | INT           | 否   | —   | —   | 来源单据明细行 ID                              |
| `remark`               | VARCHAR(500)  | 否   | —   | —   | 备注                                      |


> 物料快照字段、审计字段参见第 2 节。

唯一约束：`orderId + lineNo`

索引：`materialId`、`sourceDocumentType + sourceDocumentId + sourceDocumentLineId`

### 10.3 `rd_procurement_request` — 研发采购申请主表


| 字段名                    | 数据类型          | 必填  | 默认值 | 唯一  | 说明                         |
| ---------------------- | ------------- | --- | --- | --- | -------------------------- |
| `id`                   | INT           | 是   | 自增  | PK  | 主键                         |
| `documentNo`           | VARCHAR(64)   | 是   | —   | 是   | 单据编号，全局唯一                  |
| `bizDate`              | DATE          | 是   | —   | —   | 业务日期                       |
| `projectCode`       | VARCHAR(64)   | 是   | —   | —   | 关联研发项目编码（冗余快照，不建外键；物理列映射 `projectCode`） |
| `projectName`       | VARCHAR(128)  | 是   | —   | —   | 关联研发项目名称（物理列映射 `projectName`） |
| `supplierId`           | INT           | 否   | —   | —   | 供应商 ID → `supplier.id`     |
| `handlerPersonnelId`   | INT           | 否   | —   | —   | 经办人 ID → `personnel.id`    |
| `stockScopeId`         | INT           | 否   | —   | —   | 库存范围 ID → `stock_scope.id` |
| `workshopId`           | INT           | 是   | —   | —   | 车间 ID → `workshop.id`      |
| `revisionNo`           | INT           | 是   | `1` | —   | 修订版本号                      |
| `supplierCodeSnapshot` | VARCHAR(64)   | 否   | —   | —   | 供应商编码快照                    |
| `supplierNameSnapshot` | VARCHAR(128)  | 否   | —   | —   | 供应商名称快照                    |
| `handlerNameSnapshot`  | VARCHAR(128)  | 否   | —   | —   | 经办人姓名快照                    |
| `workshopNameSnapshot` | VARCHAR(128)  | 是   | —   | —   | 车间名称快照                     |
| `totalQty`             | DECIMAL(18,6) | 是   | `0` | —   | 明细合计数量                     |
| `totalAmount`          | DECIMAL(18,2) | 是   | `0` | —   | 明细合计金额                     |
| `remark`               | VARCHAR(500)  | 否   | —   | —   | 备注                         |


> `lifecycleStatus` + `auditStatusSnapshot`（默认 `NOT_REQUIRED`）+ 作废字段 + 审计字段参见第 2 节。注意此表无 `inventoryEffectStatus`（采购申请不直接产生库存副作用）。

索引：`bizDate`、`projectCode`、`supplierId`、`stockScopeId`、`workshopId`

### 10.4 `rd_procurement_request_line` — 研发采购申请明细


| 字段名          | 数据类型          | 必填  | 默认值 | 唯一  | 说明                                            |
| ------------ | ------------- | --- | --- | --- | --------------------------------------------- |
| `id`         | INT           | 是   | 自增  | PK  | 主键                                            |
| `requestId`  | INT           | 是   | —   | 联合  | 主表 ID → `rd_procurement_request.id`，主表删除时级联删除 |
| `lineNo`     | INT           | 是   | —   | 联合  | 行号                                            |
| `materialId` | INT           | 是   | —   | —   | 物料 ID → `material.id`                         |
| `quantity`   | DECIMAL(18,6) | 是   | —   | —   | 申请数量                                          |
| `unitPrice`  | DECIMAL(18,2) | 是   | `0` | —   | 单价                                            |
| `amount`     | DECIMAL(18,2) | 是   | `0` | —   | 金额                                            |
| `remark`     | VARCHAR(500)  | 否   | —   | —   | 备注                                            |


> 物料快照字段、审计字段参见第 2 节。

唯一约束：`requestId + lineNo`

索引：`materialId`

### 10.5 `rd_material_status_ledger` — 研发物料状态台账

每条采购申请明细行对应一条台账，记录该行物料在各状态下的数量分布。


| 字段名                | 数据类型          | 必填  | 默认值 | 唯一  | 说明                                              |
| ------------------ | ------------- | --- | --- | --- | ----------------------------------------------- |
| `id`               | INT           | 是   | 自增  | PK  | 主键                                              |
| `requestLineId`    | INT           | 是   | —   | 是   | 采购申请行 ID → `rd_procurement_request_line.id`，一对一 |
| `pendingQty`       | DECIMAL(18,6) | 是   | `0` | —   | 待采购数量                                           |
| `inProcurementQty` | DECIMAL(18,6) | 是   | `0` | —   | 采购中数量                                           |
| `canceledQty`      | DECIMAL(18,6) | 是   | `0` | —   | 已取消数量                                           |
| `acceptedQty`      | DECIMAL(18,6) | 是   | `0` | —   | 已验收数量                                           |
| `handedOffQty`     | DECIMAL(18,6) | 是   | `0` | —   | 已交接数量                                           |
| `scrappedQty`      | DECIMAL(18,6) | 是   | `0` | —   | 已报废数量                                           |
| `returnedQty`      | DECIMAL(18,6) | 是   | `0` | —   | 已退回数量                                           |
| `lastEventAt`      | DATETIME      | 否   | —   | —   | 最后一次状态变更时间                                      |


### 10.6 `rd_material_status_history` — 研发物料状态变更历史


| 字段名                     | 数据类型          | 必填  | 默认值     | 唯一  | 说明                                          |
| ----------------------- | ------------- | --- | ------- | --- | ------------------------------------------- |
| `id`                    | INT           | 是   | 自增      | PK  | 主键                                          |
| `requestLineId`         | INT           | 是   | —       | —   | 采购申请行 ID → `rd_procurement_request_line.id` |
| `eventType`             | ENUM(见下文)     | 是   | —       | —   | 事件类型                                        |
| `fromStatus`            | ENUM(见下文)     | 否   | —       | —   | 变更前状态（首次创建时为空）                              |
| `toStatus`              | ENUM(见下文)     | 是   | —       | —   | 变更后状态                                       |
| `quantity`              | DECIMAL(18,6) | 是   | —       | —   | 本次变更数量                                      |
| `sourceDocumentType`    | VARCHAR(64)   | 否   | —       | —   | 触发变更的来源单据类型                                 |
| `sourceDocumentId`      | INT           | 否   | —       | —   | 触发变更的来源单据 ID                                |
| `sourceDocumentLineId`  | INT           | 否   | —       | —   | 触发变更的来源单据行 ID                               |
| `sourceDocumentNumber`  | VARCHAR(64)   | 否   | —       | —   | 触发变更的来源单据编号                                 |
| `referenceNo`           | VARCHAR(128)  | 否   | —       | —   | 业务参考号                                       |
| `reason`                | VARCHAR(500)  | 否   | —       | —   | 变更原因                                        |
| `note`                  | VARCHAR(500)  | 否   | —       | —   | 备注                                          |
| `relatedInventoryLogId` | INT           | 否   | —       | —   | 关联的库存流水 ID → `inventory_log.id`             |
| `reversalOfHistoryId`   | INT           | 否   | —       | 是   | 所冲销的原始历史记录 ID，自关联 `id`                      |
| `isReversed`            | BOOLEAN       | 是   | `false` | —   | 该记录是否已被冲销                                   |
| `reversedBy`            | VARCHAR(64)   | 否   | —       | —   | 冲销操作人                                       |
| `reversedAt`            | DATETIME      | 否   | —       | —   | 冲销时间                                        |


`eventType` 枚举值：


| 值                      | 说明        |
| ---------------------- | --------- |
| `REQUEST_CREATED`      | 采购申请创建    |
| `PROCUREMENT_STARTED`  | 开始采购      |
| `MANUAL_CANCELLED`     | 手动取消      |
| `ACCEPTANCE_CONFIRMED` | 验收确认      |
| `HANDOFF_CONFIRMED`    | 交接确认      |
| `SCRAP_CONFIRMED`      | 报废确认      |
| `MANUAL_RETURNED`      | 手动退回      |
| `FACT_ROLLBACK`        | 事实回滚（逆操作） |
| `REQUEST_VOIDED`       | 采购申请作废    |


`fromStatus` / `toStatus` 枚举值：


| 值                     | 说明  |
| --------------------- | --- |
| `PENDING_PROCUREMENT` | 待采购 |
| `IN_PROCUREMENT`      | 采购中 |
| `CANCELLED`           | 已取消 |
| `ACCEPTED`            | 已验收 |
| `HANDED_OFF`          | 已交接 |
| `SCRAPPED`            | 已报废 |
| `RETURNED`            | 已退回 |


索引：`requestLineId + createdAt`、`sourceDocumentType + sourceDocumentId`

### 10.7 `rd_stocktake_order` — 研发盘点单主表


| 字段名                  | 数据类型          | 必填  | 默认值 | 唯一  | 说明                         |
| -------------------- | ------------- | --- | --- | --- | -------------------------- |
| `id`                 | INT           | 是   | 自增  | PK  | 主键                         |
| `documentNo`         | VARCHAR(64)   | 是   | —   | 是   | 单据编号，全局唯一                  |
| `bizDate`            | DATE          | 是   | —   | —   | 业务日期                       |
| `stockScopeId`       | INT           | 否   | —   | —   | 库存范围 ID → `stock_scope.id` |
| `workshopId`         | INT           | 是   | —   | —   | 车间 ID → `workshop.id`      |
| `revisionNo`         | INT           | 是   | `1` | —   | 修订版本号                      |
| `countedBy`          | VARCHAR(128)  | 否   | —   | —   | 盘点人                        |
| `approvedBy`         | VARCHAR(128)  | 否   | —   | —   | 审批人                        |
| `totalBookQty`       | DECIMAL(18,6) | 是   | `0` | —   | 账面数量合计                     |
| `totalCountQty`      | DECIMAL(18,6) | 是   | `0` | —   | 实盘数量合计                     |
| `totalAdjustmentQty` | DECIMAL(18,6) | 是   | `0` | —   | 调整数量合计（盘盈为正，盘亏为负）          |
| `remark`             | VARCHAR(500)  | 否   | —   | —   | 备注                         |


> 三轴状态（`auditStatusSnapshot` 默认 `NOT_REQUIRED`）、作废字段、审计字段参见第 2 节。

索引：`bizDate`、`stockScopeId`、`workshopId`

### 10.8 `rd_stocktake_order_line` — 研发盘点单明细


| 字段名              | 数据类型          | 必填  | 默认值 | 唯一  | 说明                                        |
| ---------------- | ------------- | --- | --- | --- | ----------------------------------------- |
| `id`             | INT           | 是   | 自增  | PK  | 主键                                        |
| `orderId`        | INT           | 是   | —   | 联合① | 主表 ID → `rd_stocktake_order.id`，主表删除时级联删除 |
| `lineNo`         | INT           | 是   | —   | 联合① | 行号                                        |
| `materialId`     | INT           | 是   | —   | 联合② | 物料 ID → `material.id`                     |
| `bookQty`        | DECIMAL(18,6) | 是   | —   | —   | 账面数量                                      |
| `countedQty`     | DECIMAL(18,6) | 是   | —   | —   | 实盘数量                                      |
| `adjustmentQty`  | DECIMAL(18,6) | 是   | —   | —   | 调整数量（`countedQty - bookQty`）              |
| `inventoryLogId` | INT           | 否   | —   | 是   | 关联的库存流水 ID → `inventory_log.id`（盘点过账后填入）  |
| `reason`         | VARCHAR(500)  | 否   | —   | —   | 差异原因                                      |
| `remark`         | VARCHAR(500)  | 否   | —   | —   | 备注                                        |


> 物料快照字段、审计字段参见第 2 节。

唯一约束：

- ① `orderId + lineNo`
- ② `orderId + materialId`（同一盘点单内每种物料只出现一行）

索引：`materialId`

---

## 11. 跨单据关系表

### 11.1 `document_relation` — 表头级上下游关系


| 字段名                      | 数据类型                                                               | 必填  | 默认值    | 唯一  | 说明             |
| ------------------------ | ------------------------------------------------------------------ | --- | ------ | --- | -------------- |
| `id`                     | INT                                                                | 是   | 自增     | PK  | 主键             |
| `relationType`           | ENUM(见下文)                                                          | 是   | —      | 联合  | 关系类型           |
| `upstreamFamily`         | ENUM(`STOCK_IN`, `SALES_STOCK`, `WORKSHOP_MATERIAL`, `PROJECT`) | 是   | —      | 联合  | 上游单据家族         |
| `upstreamDocumentType`   | VARCHAR(64)                                                        | 是   | —      | —   | 上游单据类型         |
| `upstreamDocumentId`     | INT                                                                | 是   | —      | 联合  | 上游单据主表 ID      |
| `downstreamFamily`       | ENUM(同上)                                                           | 是   | —      | 联合  | 下游单据家族         |
| `downstreamDocumentType` | VARCHAR(64)                                                        | 是   | —      | —   | 下游单据类型         |
| `downstreamDocumentId`   | INT                                                                | 是   | —      | 联合  | 下游单据主表 ID      |
| `isActive`               | BOOLEAN                                                            | 是   | `true` | —   | 关系是否有效（逻辑删除标记） |


`relationType` 枚举值：


| 值                            | 说明       |
| ---------------------------- | -------- |
| `SALES_RETURN_FROM_OUTBOUND` | 销售退货来自出库 |
| `WORKSHOP_RETURN_FROM_PICK`  | 车间退料来自领料 |
| `REVERSAL_REFERENCE`         | 逆操作冲销引用  |
| `TRACEABILITY_REFERENCE`     | 追溯参考（通用） |


唯一约束：`relationType + upstreamFamily + upstreamDocumentId + downstreamFamily + downstreamDocumentId`

索引：`upstreamFamily + upstreamDocumentId`、`downstreamFamily + downstreamDocumentId`

### 11.2 `document_line_relation` — 行级上下游关系


| 字段名                      | 数据类型          | 必填  | 默认值 | 唯一  | 说明         |
| ------------------------ | ------------- | --- | --- | --- | ---------- |
| `id`                     | INT           | 是   | 自增  | PK  | 主键         |
| `relationType`           | ENUM(同上)      | 是   | —   | 联合  | 关系类型       |
| `upstreamFamily`         | ENUM(同上)      | 是   | —   | 联合  | 上游单据家族     |
| `upstreamDocumentType`   | VARCHAR(64)   | 是   | —   | —   | 上游单据类型     |
| `upstreamDocumentId`     | INT           | 是   | —   | —   | 上游单据主表 ID  |
| `upstreamLineId`         | INT           | 是   | —   | 联合  | 上游单据明细行 ID |
| `downstreamFamily`       | ENUM(同上)      | 是   | —   | 联合  | 下游单据家族     |
| `downstreamDocumentType` | VARCHAR(64)   | 是   | —   | —   | 下游单据类型     |
| `downstreamDocumentId`   | INT           | 是   | —   | —   | 下游单据主表 ID  |
| `downstreamLineId`       | INT           | 是   | —   | 联合  | 下游单据明细行 ID |
| `linkedQty`              | DECIMAL(18,6) | 是   | —   | —   | 关联数量       |


唯一约束：`relationType + upstreamFamily + upstreamLineId + downstreamFamily + downstreamLineId`

索引：`upstreamFamily + upstreamDocumentId + upstreamLineId`、`downstreamFamily + downstreamDocumentId + downstreamLineId`

---

## 12. `audit-log` 审计日志表

### 12.1 `sys_logininfor` — 登录日志


| 字段名          | 数据类型                       | 必填  | 默认值     | 唯一  | 说明             |
| ------------ | -------------------------- | --- | ------- | --- | -------------- |
| `id`         | INT                        | 是   | 自增      | PK  | 主键             |
| `action`     | ENUM(`LOGIN`, `LOGOUT`)    | 是   | —       | —   | 动作类型           |
| `username`   | VARCHAR(64)                | 是   | —       | —   | 登录用户名          |
| `userId`     | INT                        | 否   | —       | —   | 用户 ID（登录成功时填入） |
| `sessionId`  | VARCHAR(64)                | 否   | —       | —   | 会话 ID          |
| `ip`         | VARCHAR(64)                | 否   | —       | —   | 客户端 IP 地址      |
| `userAgent`  | VARCHAR(500)               | 否   | —       | —   | 客户端 User-Agent |
| `result`     | ENUM(`SUCCESS`, `FAILURE`) | 是   | —       | —   | 操作结果           |
| `reason`     | VARCHAR(128)               | 否   | —       | —   | 失败原因           |
| `occurredAt` | DATETIME                   | 是   | `now()` | —   | 发生时间           |


索引：`action + result + occurredAt`、`username`、`occurredAt`

> 说明：本表不含通用审计字段（`createdBy` 等），因为日志本身就是审计记录。

### 12.2 `sys_oper_log` — 操作日志


| 字段名            | 数据类型                       | 必填  | 默认值     | 唯一  | 说明                                   |
| -------------- | -------------------------- | --- | ------- | --- | ------------------------------------ |
| `id`           | INT                        | 是   | 自增      | PK  | 主键                                   |
| `title`        | VARCHAR(128)               | 是   | —       | —   | 操作模块标题                               |
| `action`       | VARCHAR(64)                | 是   | —       | —   | 操作动作标识                               |
| `method`       | VARCHAR(16)                | 是   | —       | —   | HTTP 方法（GET / POST / PUT / DELETE 等） |
| `path`         | VARCHAR(255)               | 是   | —       | —   | 请求路径                                 |
| `operatorId`   | INT                        | 否   | —       | —   | 操作人用户 ID                             |
| `operatorName` | VARCHAR(64)                | 否   | —       | —   | 操作人用户名                               |
| `ip`           | VARCHAR(64)                | 否   | —       | —   | 客户端 IP 地址                            |
| `userAgent`    | VARCHAR(500)               | 否   | —       | —   | 客户端 User-Agent                       |
| `requestData`  | LONGTEXT                   | 否   | —       | —   | 请求参数（JSON 序列化）                       |
| `responseData` | LONGTEXT                   | 否   | —       | —   | 响应数据（JSON 序列化）                       |
| `errorMessage` | LONGTEXT                   | 否   | —       | —   | 错误信息                                 |
| `durationMs`   | INT                        | 是   | —       | —   | 操作耗时（毫秒）                             |
| `status`       | ENUM(`SUCCESS`, `FAILURE`) | 是   | —       | —   | 操作结果                                 |
| `occurredAt`   | DATETIME                   | 是   | `now()` | —   | 发生时间                                 |


索引：`status + occurredAt`、`title + occurredAt`、`operatorName`

---

## 13. `scheduler` 定时任务表

### 13.1 `sys_job` — 定时任务定义


| 字段名                 | 数据类型                             | 必填  | 默认值                | 唯一  | 说明                       |
| ------------------- | -------------------------------- | --- | ------------------ | --- | ------------------------ |
| `id`                | INT                              | 是   | 自增                 | PK  | 主键                       |
| `jobName`           | VARCHAR(128)                     | 是   | —                  | 是   | 任务名称，全局唯一                |
| `invokeTarget`      | VARCHAR(128)                     | 是   | —                  | —   | 调用目标（如 `service.method`） |
| `cronExpression`    | VARCHAR(64)                      | 是   | —                  | —   | Cron 表达式                 |
| `status`            | ENUM(`ACTIVE`, `PAUSED`)         | 是   | `ACTIVE`           | —   | 任务状态                     |
| `concurrencyPolicy` | ENUM(`ALLOW`, `FORBID`)          | 是   | `FORBID`           | —   | 并发策略：是否允许同一任务并发执行        |
| `misfirePolicy`     | ENUM(`FIRE_AND_PROCEED`, `SKIP`) | 是   | `FIRE_AND_PROCEED` | —   | 错过触发策略：补执行 / 跳过          |
| `remark`            | VARCHAR(500)                     | 否   | —                  | —   | 备注                       |
| `lastRunAt`         | DATETIME                         | 否   | —                  | —   | 最后一次执行时间                 |


索引：`status + updatedAt`、`invokeTarget`

### 13.2 `sys_job_log` — 定时任务执行日志


| 字段名            | 数据类型                       | 必填  | 默认值     | 唯一  | 说明                            |
| -------------- | -------------------------- | --- | ------- | --- | ----------------------------- |
| `id`           | INT                        | 是   | 自增      | PK  | 主键                            |
| `jobId`        | INT                        | 否   | —       | —   | 任务 ID → `sys_job.id`（任务删除后置空） |
| `jobName`      | VARCHAR(128)               | 是   | —       | —   | 任务名称快照                        |
| `invokeTarget` | VARCHAR(128)               | 是   | —       | —   | 调用目标快照                        |
| `status`       | ENUM(`SUCCESS`, `FAILURE`) | 是   | —       | —   | 执行结果                          |
| `message`      | LONGTEXT                   | 否   | —       | —   | 执行结果消息                        |
| `errorMessage` | LONGTEXT                   | 否   | —       | —   | 错误信息                          |
| `durationMs`   | INT                        | 是   | —       | —   | 执行耗时（毫秒）                      |
| `startedAt`    | DATETIME                   | 是   | —       | —   | 开始时间                          |
| `finishedAt`   | DATETIME                   | 是   | —       | —   | 完成时间                          |
| `createdAt`    | DATETIME                   | 是   | `now()` | —   | 记录创建时间                        |


索引：`jobId + startedAt`、`status + startedAt`、`jobName + startedAt`

---

## 14. `system-management` 系统管理表

> 说明：系统管理表来自兼容若依（RuoYi）框架的设计，Prisma 字段通过 `@map` 映射为下划线风格的数据库列名。以下均使用实际数据库列名。

### 14.1 `sys_dept` — 部门


| 列名           | 数据类型         | 必填  | 默认值     | 说明                             |
| ------------ | ------------ | --- | ------- | ------------------------------ |
| `dept_id`    | INT          | 是   | 自增      | 主键                             |
| `parent_id`  | INT          | 是   | `0`     | 父部门 ID，`0` 表示顶级                |
| `ancestors`  | VARCHAR(256) | 是   | `"0"`   | 祖先路径（如 `"0,100,200"`），用于快速查询层级 |
| `dept_name`  | VARCHAR(128) | 是   | —       | 部门名称                           |
| `order_num`  | INT          | 是   | `0`     | 排序号                            |
| `leader`     | VARCHAR(64)  | 是   | `""`    | 负责人                            |
| `phone`      | VARCHAR(32)  | 是   | `""`    | 联系电话                           |
| `email`      | VARCHAR(128) | 是   | `""`    | 联系邮箱                           |
| `status`     | VARCHAR(1)   | 是   | `"0"`   | 状态：`"0"` 正常 / `"1"` 停用         |
| `created_at` | DATETIME     | 是   | `now()` | 创建时间                           |
| `updated_at` | DATETIME     | 是   | 自动更新    | 更新时间                           |


索引：`parent_id`

### 14.2 `sys_post` — 岗位


| 列名           | 数据类型         | 必填  | 默认值     | 说明                     |
| ------------ | ------------ | --- | ------- | ---------------------- |
| `post_id`    | INT          | 是   | 自增      | 主键                     |
| `post_code`  | VARCHAR(64)  | 是   | —       | 岗位编码                   |
| `post_name`  | VARCHAR(128) | 是   | —       | 岗位名称                   |
| `post_sort`  | INT          | 是   | `0`     | 排序号                    |
| `status`     | VARCHAR(1)   | 是   | `"0"`   | 状态：`"0"` 正常 / `"1"` 停用 |
| `remark`     | VARCHAR(500) | 是   | `""`    | 备注                     |
| `created_at` | DATETIME     | 是   | `now()` | 创建时间                   |
| `updated_at` | DATETIME     | 是   | 自动更新    | 更新时间                   |


### 14.3 `sys_menu` — 菜单权限


| 列名           | 数据类型         | 必填  | 默认值     | 说明                            |
| ------------ | ------------ | --- | ------- | ----------------------------- |
| `menu_id`    | INT          | 是   | 自增      | 主键                            |
| `parent_id`  | INT          | 是   | `0`     | 父菜单 ID                        |
| `menu_name`  | VARCHAR(128) | 是   | —       | 菜单名称                          |
| `order_num`  | INT          | 是   | `0`     | 排序号                           |
| `path`       | VARCHAR(256) | 是   | `""`    | 路由地址                          |
| `component`  | VARCHAR(256) | 是   | `""`    | 组件路径                          |
| `route_name` | VARCHAR(128) | 是   | `""`    | 路由名称                          |
| `menu_type`  | VARCHAR(1)   | 是   | `"M"`   | 菜单类型：`M` 目录 / `C` 菜单 / `F` 按钮 |
| `visible`    | VARCHAR(1)   | 是   | `"0"`   | 是否可见：`"0"` 显示 / `"1"` 隐藏      |
| `status`     | VARCHAR(1)   | 是   | `"0"`   | 状态：`"0"` 正常 / `"1"` 停用        |
| `perms`      | VARCHAR(128) | 是   | `""`    | 权限标识（如 `inbound:orders:list`） |
| `icon`       | VARCHAR(128) | 是   | `""`    | 菜单图标                          |
| `query`      | VARCHAR(256) | 是   | `""`    | 路由参数                          |
| `is_frame`   | VARCHAR(1)   | 是   | `"1"`   | 是否外链：`"0"` 是 / `"1"` 否        |
| `is_cache`   | VARCHAR(1)   | 是   | `"0"`   | 是否缓存：`"0"` 缓存 / `"1"` 不缓存     |
| `created_at` | DATETIME     | 是   | `now()` | 创建时间                          |
| `updated_at` | DATETIME     | 是   | 自动更新    | 更新时间                          |


索引：`parent_id`

### 14.4 `sys_role` — 角色


| 列名                    | 数据类型         | 必填  | 默认值     | 唯一  | 说明                                                               |
| --------------------- | ------------ | --- | ------- | --- | ---------------------------------------------------------------- |
| `role_id`             | INT          | 是   | 自增      | PK  | 主键                                                               |
| `role_name`           | VARCHAR(128) | 是   | —       | —   | 角色名称                                                             |
| `role_key`            | VARCHAR(64)  | 是   | —       | 是   | 角色标识键（如 `admin`、`warehouse-keeper`），全局唯一                         |
| `role_sort`           | INT          | 是   | `0`     | —   | 排序号                                                              |
| `status`              | VARCHAR(1)   | 是   | `"0"`   | —   | 状态：`"0"` 正常 / `"1"` 停用                                           |
| `data_scope`          | VARCHAR(1)   | 是   | `"1"`   | —   | 数据范围：`"1"` 全部 / `"2"` 自定义 / `"3"` 本部门 / `"4"` 本部门及以下 / `"5"` 仅本人 |
| `menu_check_strictly` | BOOLEAN      | 是   | `true`  | —   | 菜单树选择时是否父子联动                                                     |
| `dept_check_strictly` | BOOLEAN      | 是   | `true`  | —   | 部门树选择时是否父子联动                                                     |
| `remark`              | VARCHAR(500) | 是   | `""`    | —   | 备注                                                               |
| `created_at`          | DATETIME     | 是   | `now()` | —   | 创建时间                                                             |
| `updated_at`          | DATETIME     | 是   | 自动更新    | —   | 更新时间                                                             |


### 14.5 `sys_user` — 用户


| 列名                  | 数据类型         | 必填  | 默认值         | 唯一  | 说明                              |
| ------------------- | ------------ | --- | ----------- | --- | ------------------------------- |
| `user_id`           | INT          | 是   | 自增          | PK  | 主键                              |
| `dept_id`           | INT          | 否   | —           | —   | 所属部门 ID → `sys_dept.dept_id`    |
| `user_name`         | VARCHAR(64)  | 是   | —           | 是   | 登录用户名，全局唯一                      |
| `nick_name`         | VARCHAR(64)  | 是   | —           | —   | 用户昵称                            |
| `avatar_url`        | VARCHAR(500) | 否   | —           | —   | 头像 URL                          |
| `email`             | VARCHAR(128) | 是   | `""`        | —   | 邮箱                              |
| `phonenumber`       | VARCHAR(32)  | 是   | `""`        | —   | 手机号                             |
| `sex`               | VARCHAR(1)   | 是   | `"2"`       | —   | 性别：`"0"` 男 / `"1"` 女 / `"2"` 未知 |
| `status`            | VARCHAR(1)   | 是   | `"0"`       | —   | 账号状态：`"0"` 正常 / `"1"` 停用        |
| `deleted`           | BOOLEAN      | 是   | `false`     | —   | 逻辑删除标记                          |
| `remark`            | VARCHAR(500) | 是   | `""`        | —   | 备注                              |
| `password_hash`     | VARCHAR(256) | 是   | —           | —   | 密码哈希值                           |
| `console_mode`      | VARCHAR(32)  | 是   | `"default"` | —   | 控制台模式                           |
| `workshop_scope`    | JSON         | 否   | —           | —   | 车间数据权限范围（JSON 数组）               |
| `extra_permissions` | JSON         | 否   | —           | —   | 额外权限配置（JSON 数组）                 |
| `created_at`        | DATETIME     | 是   | `now()`     | —   | 创建时间                            |
| `updated_at`        | DATETIME     | 是   | 自动更新        | —   | 更新时间                            |


索引：`dept_id`

### 14.6 `sys_dict_type` — 字典类型


| 列名           | 数据类型         | 必填  | 默认值     | 唯一  | 说明                            |
| ------------ | ------------ | --- | ------- | --- | ----------------------------- |
| `dict_id`    | INT          | 是   | 自增      | PK  | 主键                            |
| `dict_name`  | VARCHAR(128) | 是   | —       | —   | 字典类型名称                        |
| `dict_type`  | VARCHAR(64)  | 是   | —       | 是   | 字典类型标识（如 `sys_user_sex`），全局唯一 |
| `status`     | VARCHAR(1)   | 是   | `"0"`   | —   | 状态：`"0"` 正常 / `"1"` 停用        |
| `remark`     | VARCHAR(500) | 是   | `""`    | —   | 备注                            |
| `created_at` | DATETIME     | 是   | `now()` | —   | 创建时间                          |
| `updated_at` | DATETIME     | 是   | 自动更新    | —   | 更新时间                          |


### 14.7 `sys_dict_data` — 字典数据


| 列名           | 数据类型         | 必填  | 默认值     | 说明                                 |
| ------------ | ------------ | --- | ------- | ---------------------------------- |
| `dict_code`  | INT          | 是   | 自增      | 主键                                 |
| `dict_sort`  | INT          | 是   | `0`     | 排序号                                |
| `dict_label` | VARCHAR(128) | 是   | —       | 字典标签（显示名称）                         |
| `dict_value` | VARCHAR(128) | 是   | —       | 字典值（存储值）                           |
| `dict_type`  | VARCHAR(64)  | 是   | —       | 所属字典类型 → `sys_dict_type.dict_type` |
| `css_class`  | VARCHAR(64)  | 是   | `""`    | 样式属性                               |
| `list_class` | VARCHAR(64)  | 是   | `""`    | 列表回显样式                             |
| `is_default` | VARCHAR(1)   | 是   | `"N"`   | 是否默认：`"Y"` 是 / `"N"` 否             |
| `status`     | VARCHAR(1)   | 是   | `"0"`   | 状态：`"0"` 正常 / `"1"` 停用             |
| `remark`     | VARCHAR(500) | 是   | `""`    | 备注                                 |
| `created_at` | DATETIME     | 是   | `now()` | 创建时间                               |
| `updated_at` | DATETIME     | 是   | 自动更新    | 更新时间                               |


索引：`dict_type`

### 14.8 `sys_config` — 系统配置


| 列名             | 数据类型         | 必填  | 默认值     | 唯一  | 说明                               |
| -------------- | ------------ | --- | ------- | --- | -------------------------------- |
| `config_id`    | INT          | 是   | 自增      | PK  | 主键                               |
| `config_name`  | VARCHAR(128) | 是   | —       | —   | 配置名称                             |
| `config_key`   | VARCHAR(128) | 是   | —       | 是   | 配置键（如 `sys.index.skinName`），全局唯一 |
| `config_value` | VARCHAR(500) | 是   | —       | —   | 配置值                              |
| `config_type`  | VARCHAR(1)   | 是   | `"N"`   | —   | 是否系统内置：`"Y"` 是 / `"N"` 否         |
| `remark`       | VARCHAR(500) | 是   | `""`    | —   | 备注                               |
| `created_at`   | DATETIME     | 是   | `now()` | —   | 创建时间                             |
| `updated_at`   | DATETIME     | 是   | 自动更新    | —   | 更新时间                             |


### 14.9 `sys_notice` — 通知公告


| 列名               | 数据类型         | 必填  | 默认值     | 说明                     |
| ---------------- | ------------ | --- | ------- | ---------------------- |
| `notice_id`      | INT          | 是   | 自增      | 主键                     |
| `notice_title`   | VARCHAR(256) | 是   | —       | 公告标题                   |
| `notice_type`    | VARCHAR(1)   | 是   | `"1"`   | 类型：`"1"` 通知 / `"2"` 公告 |
| `notice_content` | LONGTEXT     | 是   | —       | 公告内容                   |
| `status`         | VARCHAR(1)   | 是   | `"0"`   | 状态：`"0"` 正常 / `"1"` 关闭 |
| `remark`         | VARCHAR(500) | 是   | `""`    | 备注                     |
| `created_at`     | DATETIME     | 是   | `now()` | 创建时间                   |
| `updated_at`     | DATETIME     | 是   | 自动更新    | 更新时间                   |


---

## 15. 系统关联表

### 15.1 `sys_user_role` — 用户角色关联


| 列名        | 数据类型 | 必填  | 唯一  | 说明                              |
| --------- | ---- | --- | --- | ------------------------------- |
| `id`      | INT  | 是   | PK  | 主键                              |
| `user_id` | INT  | 是   | 联合  | 用户 ID → `sys_user.user_id`，级联删除 |
| `role_id` | INT  | 是   | 联合  | 角色 ID → `sys_role.role_id`，级联删除 |


唯一约束：`user_id + role_id`

索引：`role_id`

### 15.2 `sys_user_post` — 用户岗位关联


| 列名        | 数据类型 | 必填  | 唯一  | 说明                              |
| --------- | ---- | --- | --- | ------------------------------- |
| `id`      | INT  | 是   | PK  | 主键                              |
| `user_id` | INT  | 是   | 联合  | 用户 ID → `sys_user.user_id`，级联删除 |
| `post_id` | INT  | 是   | 联合  | 岗位 ID → `sys_post.post_id`，级联删除 |


唯一约束：`user_id + post_id`

索引：`post_id`

### 15.3 `sys_role_menu` — 角色菜单关联


| 列名        | 数据类型 | 必填  | 唯一  | 说明                              |
| --------- | ---- | --- | --- | ------------------------------- |
| `id`      | INT  | 是   | PK  | 主键                              |
| `role_id` | INT  | 是   | 联合  | 角色 ID → `sys_role.role_id`，级联删除 |
| `menu_id` | INT  | 是   | 联合  | 菜单 ID → `sys_menu.menu_id`，级联删除 |


唯一约束：`role_id + menu_id`

索引：`menu_id`

### 15.4 `sys_role_dept` — 角色部门关联


| 列名        | 数据类型 | 必填  | 唯一  | 说明                              |
| --------- | ---- | --- | --- | ------------------------------- |
| `id`      | INT  | 是   | PK  | 主键                              |
| `role_id` | INT  | 是   | 联合  | 角色 ID → `sys_role.role_id`，级联删除 |
| `dept_id` | INT  | 是   | 联合  | 部门 ID → `sys_dept.dept_id`，级联删除 |


唯一约束：`role_id + dept_id`

索引：`dept_id`
