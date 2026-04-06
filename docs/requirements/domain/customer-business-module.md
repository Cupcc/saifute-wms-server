# 客户收发主题需求

## Metadata

- ID: `domain-customer-business-module`
- Status: `draft`
- Scope: `domain-level`
- 状态说明: 骨架与长期约束已补全；`F2/F3` 已按 `task-20260405-2136-price-layer-outbound-and-inbound-price-correction` 交付，`F1` 基础家族模型与 `F4` 退货上下游联动仍待后续 task 收口。

## 主题定义

- `customer` 是长期业务主题，解决客户出库单、销售退货单如何在统一家族下完成录入、过账、修改、作废、追溯与成本核算。
- 当前范围覆盖成品出库与销售退货两类核心事务，兼顾客户维度查询与追溯。
- 出库单与销售退货单共用 `customer_stock_order` / `customer_stock_order_line`，通过 `orderType` 区分。
- 本文档只保留长期约束、长期业务口径、能力清单和能力合同；单次交付直接从本 domain 创建 `task-*.md`。

## 承接的项目级能力版图

### 客户收发（`customer`）

- 本 domain 承接项目总纲中 `customer` 模块的详细职责，作为客户收发家族的长期真源。
- 第一阶段默认覆盖成品出库与销售退货两类核心事务，兼顾客户维度查询与追溯。
- 出库后立即影响实时库存，销售退货用于回补库存，并需保留与原出库关系的追溯能力。
- 第一阶段以完成真实客户收发闭环和统计为先，不默认扩展复杂物流履约、波次或发运编排能力。

### 相邻共享边界

- `inventory-core` 继续作为所有库存变动的唯一写入口；客户收发只负责组织单据语义，不旁路改库存。
- `audit` 第一阶段默认采用轻量审核模式。
- `inbound` 的来源层与 FIFO 追溯（`F4`/`F5`）是本 domain 价格层出库的上游前置依赖。

## 长期约束

- `C1` 家族模型统一：出库单与销售退货单共用 `customer_stock_order` / `customer_stock_order_line`，差异只通过 `orderType`、权限前缀和应用服务入口区分。状态：`生效中`
- `C2` 价格层出库选择：出库时用户按 `物料 + 价格层 + 数量` 录单；价格只能从当前有库存的价格层中选择，不允许手输库存中不存在的价格。状态：`生效中`
- `C3` 同价内自动 FIFO：用户选定价格层后，系统在该价格层内部自动按 FIFO 分配到具体入库来源，用户无需选择具体批次。状态：`生效中`
- `C4` 价格层互不借用：同一出库行只能消耗所选价格层的库存，不能自动借用其他价格层的库存。状态：`生效中`
- `C5` 已出库历史成本快照：出库完成后保留历史成本快照，不因后续入库改单价而回算。状态：`生效中`
- `C6` 退货与出库关系追溯：销售退货创建时需校验来源出库单关系，作废出库前必须确认不存在未作废的退货下游。状态：`生效中`

## 长期业务口径

- `customer_stock_order_line.unitPrice` 保持业务金额口径，不承载库存价格层语义；库存价格层选择单独落在 `selectedUnitCost`。
- 同一单据内 `同一物料 + 同一 selectedUnitCost` 只能有一条明细行。
- 价格层可用库存口径：按 `物料 + 单价` 聚合现有可用来源流水得到，不需要新建独立的"价格库存余额主表"。
- 出库行成本口径：用户选定 `selectedUnitCost` → 系统在该价格层内自动 FIFO → `costAmount` 由实际来源分配汇总 → `costUnitPrice` 作为历史成本快照保存。
- 出库追溯：用户视角追到价格层，系统视角追到入库单行或 `inventory_log.sourceLogId`；内部追溯至少要到 `inventory_log.id` 级别，不能只记入库单据号。
- 如果出库来源是调价后的 `PRICE_CORRECTION_IN` 流水，追溯查询应能展示调价关系链（新来源 → 调价单 → 原入库单行）。

## 能力清单


| 编号   | 能力                | 验收口径                                                         | 阶段      | 状态    | 关联任务 |
| ---- | ----------------- | ------------------------------------------------------------ | ------- | ----- | ---- |
| `F1` | 客户出库单家族统一模型       | 出库单与退货单共用同一套主从表、服务骨架和库存写入路径；出库扣减库存、退货回补库存、作废逆操作、编号区间管理均可正常工作 | Phase 1 | `未开始` | `-`  |
| `F2` | 价格层出库选择与同价内 FIFO  | 出库时用户按 `物料 + 价格层 + 数量` 录单，系统在同价内自动 FIFO 到具体来源；价格只能选有库存的价格层，数量不能超过该价格层可用量 | Phase 2 | `已完成` | `task-20260405-2136-price-layer-outbound-and-inbound-price-correction`  |
| `F3` | 出库成本追溯与来源查询      | 出库完成后可追溯每条出库行最终使用的具体来源层，支持展示价格层、来源入库单号、调价关系等追溯信息            | Phase 2 | `已完成` | `task-20260405-2136-price-layer-outbound-and-inbound-price-correction`  |
| `F4` | 销售退货与出库上下游联动     | 销售退货创建时校验来源出库单关系，退货回补库存，作废出库前拦截未作废退货下游                       | Phase 3 | `未开始` | `-`  |


## 能力合同

### `F1` 客户出库单家族统一模型

- In scope:
  - 出库单与销售退货单共用 `customer_stock_order` / `customer_stock_order_line`，通过 `orderType` 区分。
  - 出库创建时校验主数据、库存充足性和编号区间。
  - 出库创建后立即扣减库存，修改时按明细差异补偿库存，作废时冲回。
  - 出厂编号区间占用与释放统一交由 `inventory-core`。
  - 单据修改后默认重置审核状态。
- Out of scope / non-goals:
  - 不在本合同中引入价格层选择逻辑，留给 F2。
  - 不在本合同中展开退货与出库的上下游校验，留给 F4。
  - 不引入复杂物流履约、波次或发运编排能力。
- Completion criteria:
  - `[TC-1]` 出库单创建后，对应物料库存立即减少。
  - `[TC-2]` 出库单作废后，库存冲回且编号区间释放。
  - `[TC-3]` 出库单修改后，明细差异正确补偿库存，审核状态重置。
  - `[TC-4]` 退货单创建后，库存正确回补。
- Evidence expectation:
  - 功能验证与 QA 测试。
- Default derived slice acceptance mode: `light`

### `F2` 价格层出库选择与同价内 FIFO

- In scope:
  - 出库录入交互：选择物料 → 选择价格层（下拉只显示当前有库存的价格层，显示可用量如 `104元（可用100）`）→ 输入数量。
  - 价格层可用库存查询：按 `物料 + 单价` 聚合现有来源层可用量，不新建独立价格库存余额主表。
  - 数量超出该价格层库存时，立即提示并禁止提交。
  - 同一单据内重复录入 `同一物料 + 同一价格` 时，立即提示并禁止提交。
  - 后台按同价格内 FIFO 自动分配到具体入库来源，写入 `inventory_source_usage`。
  - `costUnitPrice` = 选定价格层单价，`costAmount` = 数量 × 选定价格，作为历史成本快照保存。
- Out of scope / non-goals:
  - 不新增"价格库存余额主表"，优先基于现有来源层聚合。
  - 不在本合同中引入手动指定具体来源批次的能力。
  - 不把批次复杂度暴露给用户。
- Completion criteria:
  - `[TC-1]` 某物料存在 104 元库存 100 个、117 元库存 200 个时，界面能展示这两个价格层及可用量。
  - `[TC-2]` 选择 `104元 + 50` 可提交。
  - `[TC-3]` 选择 `104元 + 101` 不可提交。
  - `[TC-4]` 同一单据重复录入 `物料A + 104元` 第二条时，不可提交。
  - `[TC-5]` `104元` 出库只消耗 104 元价格层库存，不自动借用 117 元库存。
  - `[TC-6]` 后台可追溯到每条出库行最终使用的具体来源层。
  - `[TC-7]` 出库完成后保留历史成本快照，不因后续入库改价而回算。
- Evidence expectation:
  - 价格层下拉展示 + 数量/重复校验 + 来源分配验证 + QA 测试。
- Default derived slice acceptance mode: `light`
- AI derivation note:
  - 价格层可用库存查询应复用 `inventory-core` 现有来源层数据，按 `unitCost` 聚合；出库时的来源分配仍走 `inventory-core.allocateInventorySource()`，只是在分配前先按用户选定的价格层过滤可用来源范围。

### `F3` 出库成本追溯与来源查询

- In scope:
  - 出库行追溯查询至少展示：来源流水 ID、来源流水的操作类型、入库单号、入库行号。
  - 如果来源是 `PRICE_CORRECTION_IN` 流水，额外展示对应调价单号、原入库单号、错价、正价。
  - 价格层库存查询把 `PRICE_CORRECTION_IN` 视为有效来源、`PRICE_CORRECTION_OUT` 视为普通消耗。
- Out of scope / non-goals:
  - 不在本合同中引入面向财务的月度差异汇总报表。
- Completion criteria:
  - `[TC-1]` 出库行可追溯到具体来源流水及对应的入库单行。
  - `[TC-2]` 调价后的来源可展示完整调价关系链。
  - `[TC-3]` 价格层库存查询正确处理调价来源的可用量。
- Evidence expectation:
  - 追溯查询页面验证 + QA 测试。
- Default derived slice acceptance mode: `light`

### `F4` 销售退货与出库上下游联动

- In scope:
  - 销售退货创建时校验来源出库单关系。
  - 退货回补库存，并保留与原出库的追溯关系。
  - 作废出库单前必须确认不存在未作废的退货下游。
  - 退货与出库的上下游关系通过 `document_relation` / `document_line_relation` 表达。
- Out of scope / non-goals:
  - 不在本合同中引入退货对原出库来源的精确回补（V1 退货回补视为普通入库来源）。
- Completion criteria:
  - `[TC-1]` 退货单可关联到原出库单。
  - `[TC-2]` 退货回补库存后，库存余额正确增加。
  - `[TC-3]` 存在未作废退货时，原出库单不可作废。
- Evidence expectation:
  - 上下游关系验证 + QA 测试。
- Default derived slice acceptance mode: `light`

## 阶段路线图


| 阶段      | 目标                              | 当前状态  |
| ------- | ------------------------------- | ----- |
| Phase 1 | 收口客户收发统一家族模型、基础 CRUD 与库存联动       | `未开始` |
| Phase 2 | 落地价格层出库选择、同价内 FIFO 与出库成本追溯      | `已完成` |
| Phase 3 | 完善销售退货与出库上下游联动，扩展客户维度统计与报表      | `未开始` |


## 待确认

- 退货回补是否需要精确回补到原出库来源（V1 建议先视为普通入库来源）。

## 文档关系

- 项目级长期背景：`docs/requirements/PROJECT_REQUIREMENTS.md`
- 架构设计：`docs/architecture/modules/customer.md`
- 架构设计：`docs/architecture/20-wms-database-tables-and-schema.md`
- 上游依赖：`docs/requirements/domain/inbound-business-module.md`（F4/F5 来源层与 FIFO、F8 调价单）
- 关联执行任务：`docs/tasks/*.md`
- 后续继续推进时，直接从本 domain 能力合同创建 `docs/tasks/task-*.md`（`Related requirement` 指向本 domain 对应 `Fx`）。
