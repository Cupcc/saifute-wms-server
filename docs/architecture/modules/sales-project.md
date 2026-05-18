# 销售项目模块设计

## 模块目标与职责

目标业务语义上的 `sales-project` 模块应承接“销售项目”主题，而不是 `RD` 内部研发项目。它负责销售项目主档、项目归属实际库存 / 价格层视图、项目维度发货统计，以及可选普通库存转项目 / 项目预留能力。

## 当前实现与目标范围

**当前实现**：

- 当前运行时已经把历史 `RD` 内部项目实现收口到 `src/modules/rd-project`，对外接口为 `/rd-projects`，逻辑模型为 `RdProject*`。
- 当前 RD 运行时的物理表已经独立为 `rd_project*`，库存动作类型为 `RD_PROJECT_OUT`，目标类型为 `RD_PROJECT`。
- 当前系统里已经不存在“用 `project` 名称承接 RD 运行时”的代码合同；销售项目已形成独立 `src/modules/sales-project` 与 `sales_project*` 逻辑模型，项目详情已按 `projectTargetId` 聚合项目归属实际库存 / 价格层，项目出库草稿与正式销售出库已按项目来源层 FIFO 口径收口。

**目标范围**（见 `docs/requirements/domain/sales-project-management.md`）：

- 销售项目主档轻量 `CRUD`
- 项目归属实际库存 / 价格层视图
- 项目验收 / 项目收货归属查询
- 项目关联销售出库与一键生成草稿
- 项目维度发货 / 退货 / 净发货统计
- 可选普通库存转项目 / 项目预留

目标范围下，销售项目本身不直接过账库存；项目归属实际库存由绑定销售项目的 `inbound` 入库 / 验收、`sales` 出库 / 退货和后续明确的库存归属调整沉淀。项目页上的出库快捷动作应沉淀为 `sales` 草稿，不能绕过 `sales` / `inventory-core` 直接扣库存。

## 原 Java 来源与映射范围

- `business/src/main/java/com/saifute/article`
- `business/src/main/resources/mapper/article`

> 注意：旧 `article -> project` 的迁移映射主要承接的是历史内部研发项目实现，不应继续反向定义新的销售项目领域边界。

## 领域对象与核心用例

目标核心对象：

- `SalesProject`
- `SalesProjectAttributedInventoryView`
- `SalesProjectPriceLayerView`
- `SalesProjectInboundLedger`
- `SalesProjectShipmentLedger`
- `SalesProjectStockAttributionAdjustment` / `SalesProjectReservation`（可选）

目标核心用例：

- 创建销售项目主档
- 查看项目归属物料的实际库存 / 项目价格层 / 已发货情况
- 查看项目验收 / 项目收货记录
- 从项目页按项目实际库存和价格层生成销售出库草稿
- 统计项目维度的出库、退货和净发货结果
- 可选地把普通库存改归属或预留给某项目，再转销售出库

## Controller 接口草案

- `GET /sales-projects`
- `POST /sales-projects`
- `PATCH /sales-projects/:id`
- `POST /sales-projects/:id/void`
- `GET /sales-projects/:id/materials`
- `GET /sales-projects/:id/price-layers`
- `GET /sales-projects/:id/inbound-orders`
- `POST /sales-projects/:id/sales-outbound-draft`
- `POST /sales-projects/:id/stock-attribution-adjustments`（可选）
- `POST /sales-projects/:id/reservations`（可选）

## Application 层编排

- `CreateSalesProjectUseCase`
- `UpdateSalesProjectUseCase`
- `VoidSalesProjectUseCase`
- `GetSalesProjectAttributedInventoryViewUseCase`
- `GetSalesProjectPriceLayerViewUseCase`
- `GetSalesProjectInboundLedgerUseCase`
- `CreateSalesProjectSalesOutboundDraftUseCase`
- `CreateSalesProjectStockAttributionAdjustmentUseCase`（可选）
- `CreateSalesProjectReservationUseCase`（可选）

编排要点：

- 销售项目不直接写库存；真实库存动作必须落到 `sales` 或其他真实单据家族。
- 项目页的一键出库本质上是按项目归属实际库存生成 `sales` 出库草稿，而不是直接扣减库存。
- 项目出库不只写 `salesProjectId`；库存来源分配必须限制在当前项目 `projectTargetId` 对应的来源层。
- 入库 / 验收单绑定销售项目后，库存来源层必须携带项目归属，用于项目库存视图和后续项目出库。
- 普通库存转项目 / 项目预留若启用，必须形成独立记录，不得伪造成销售出库。
- 项目相关统计优先复用 `sales` 出库 / 退货行上的 `salesProjectId` 与项目快照事实，不维护平行发货账。

## Domain 规则与约束

- `sales-project` 专指对外销售的大型项目，不包含 `RD` 内部主题。
- 不引入 `立项 / 暂停 / 关闭` 这类项目管理状态机。
- 项目不是新的物理仓库或 `stockScope`；项目归属库存是带 `projectTargetId` 的实际库存归属。
- 项目物料不是主档目标清单。项目页面展示的物料必须来自项目验收 / 收货、销售退货回补或明确的库存归属调整等真实事实。
- 与 `sales` 的跨模块合同必须显式使用 `salesProjectId`、`salesProjectCodeSnapshot`、`salesProjectNameSnapshot` 之类的销售项目命名，不能再复用裸 `projectId`。
- 入库页选择销售项目时，后台必须写入验收 / 入库单项目归属和库存流水项目归属；这不是预留，也不是销售出库。
- 销售出库页选择销售项目时，价格层查询和 FIFO 来源分配必须按当前项目归属来源层过滤，不能借用普通库存或其他项目库存。
- 当前 `rd-project` 运行时与销售项目严格分域，不能继续复用同一套对象、接口或报表口径。

## Infrastructure 设计

- 销售项目主表、读模型和查询可继续用 Prisma + raw SQL 组合实现。
- 项目库存与价格层查询应优先复用 `inventory-core` 的 `projectTargetId` 归属流水和来源层能力，按 `material + projectTargetId + unitCost` 聚合可用量。
- 项目统计查询应优先复用 `inbound`、`sales`、`inventory-core`、`master-data` 的稳定读模型。
- 若后续启用普通库存转项目 / 项目预留，应新增独立表或稳定读写模型，不建议把预留语义写进 `inventory_balance` 主键或直接并入 `sales_stock_order_line`。

## 与其他模块的依赖关系

- 依赖 `sales`：真实销售出库 / 退货、项目维度发货统计
- 依赖 `inventory-core`：库存余额、项目归属来源层、项目价格层、来源成本、共享查询
- 依赖 `inbound`：真实入库结果与项目验收 / 项目收货归属
- 依赖 `master-data`：客户、物料、人员等基础数据
- 导出和审计接入 `audit-log`

## 事务边界与一致性要求

- 项目主档写入与引用校验在项目事务内完成。
- 普通库存转项目 / 项目预留若落地，主记录与状态变更需独立事务提交，并与后续转销售出库的关系可追溯。
- 真实库存和来源分配的一致性继续由 `inbound` / `sales` / `inventory-core` 保证，而不是由项目模块自行维护。
- 项目出库草稿转正式出库时，必须把项目归属传给库存结算的来源过滤条件，保证项目出库只消耗项目来源层。

## 权限点、数据权限、审计要求

- 销售项目查询、创建、修改、作废、导出需要独立权限点。
- 项目出库草稿生成、项目验收查看、普通库存转项目 / 项目预留创建 / 释放建议使用独立权限点。
- 查询通常受客户、项目、物料等数据权限影响。
- 项目主档修改、普通库存转项目 / 项目预留创建 / 释放、项目出库草稿生成都应记录审计。

## 当前缺口 / 迁移注意

- 不能把现有 `src/modules/rd-project` 视为销售项目运行时；销售项目已经独立落在 `src/modules/sales-project`，后续不得回退去借用 `rd-project`。
- 文档必须持续区分“`sales-project` 真源”和“`rd-project` 运行时”。
- `sales_project_material_line` 只能作为历史 / 兼容主档明细存在，不再作为项目详情库存主线；项目详情主线必须来自 `inventory_log.project_target_id`、项目价格层和销售出退货事实。
- 项目出库实现必须持续校验库存结算传入项目来源过滤条件，避免回退成“出库行属于项目，但来源消耗普通库存或其他项目库存”。

## 待补测试清单

- 销售项目主档 CRUD 测试
- 项目归属实际库存 / 项目价格层查询测试
- 项目验收入库绑定销售项目并写入项目来源层测试
- 项目实际库存上下文生成销售出库草稿测试
- 项目出库只消耗当前项目来源层测试
- 普通库存转项目 / 项目预留创建、释放、转出库测试（若启用）

## 暂不实现范围

- 完整项目生命周期管理
- 甘特图 / 任务协同
- 把销售项目直接做成库存写模型
