# 入库业务模块主题需求

## Metadata

- ID: `domain-inbound-business-module`
- Status: `confirmed`
- Scope: `domain-level`
- 状态说明: `Phase 1` 与 `Phase 2`（`F4`/`F5`）已按 `task-20260404-1315-inbound-phase2-fifo-costing` 交付并 full acceptance；`Phase 3` 中 `F8` 已按 `task-20260405-2136-price-layer-outbound-and-inbound-price-correction` 交付，`F6/F7` 仍待独立 task。领域长期约束与能力合同仍以本文档为真源。

## 主题定义

- `inbound` 是长期业务主题，解决验收单、生产入库单如何在统一入库家族下完成录入、过账、修改、作废、追溯与下游协同。
- 成品入库统一走 `inbound`（`/inbound/into-orders` 生产入库单），与验收单共用 `stock_in_order` / `stock_in_order_line`。
- 当前范围覆盖 `/inbound/orders` 验收单、`/inbound/into-orders` 生产入库单，以及与 `inventory-core`、`audit`、车间领料和来源成本追溯的长期边界。
- 本文档只保留长期约束、长期业务口径、能力清单和能力合同；单次交付直接从本 domain 创建 `task-*.md`。

## 承接的项目级能力版图

### 入库（`inbound`）

- 本 domain 承接项目总纲中的 `inbound` 模块详细职责，作为入库家族的长期真源。
- 成品 / 生产入库统一走 `inbound`，与客户退货等其它回流路径区分，不另起平行模块。
- 第一阶段默认覆盖采购 / 验收入库和生产入库等真实入库事务，并在录入后立即影响实时库存。
- 需要支持单据新增、修改、作废、查询、导出，以及按供应商、物料、日期等常见维度追溯入库记录。
- 入库单据应与主数据、库存、审核记录保持关联，改单和作废时需同步处理库存与追溯结果。

### 相邻共享边界

- `inventory-core` 继续作为所有库存变动的唯一写入口；入库只负责组织单据语义，不旁路改库存。
- `audit` 第一阶段默认采用轻量审核模式，审核更多用于记录、查询、追溯和纠偏，不阻塞入库落账。

## 长期约束

- `C1` 家族模型统一：验收单与生产入库单共用 `stock_in_order` / `stock_in_order_line`，差异只通过 `orderType`、权限前缀和应用服务入口区分。状态：`生效中`
- `C2` 主仓准入优先：第一阶段验收单与生产入库单默认写入主仓 `MAIN`；RD 采购到货在验收时也先入主仓，再由后续协同过账转入 RD 小仓。状态：`生效中`
- `C3` 真实库存轴访问：查询、详情、修改、作废等访问控制必须沿真实库存范围 `stockScope` 判断，不能退回旧 `workshopId` 轴。状态：`生效中`
- `C4` 来源层成本语义：同一物料 / 型号在不同入库批次下可存在不同单价；入库价格必须成为后续出库、领料、退料等消耗动作的来源成本真源。状态：`生效中`
- `C5` 默认 FIFO：未手动指定来源时，后续消耗类动作默认按先进先出确定来源层；手动指定来源时，系统仍必须保留可审计来源分配记录。状态：`生效中`
- `C6` 双向快捷协同：允许从入库页面以“立即出库”方式发起到指定车间的下游领料，也允许在车间页面反选某张入库单据物料直接发起领料；后台仍必须沉淀为独立、可作废、可追溯的下游业务单据，且同一入库单据最多只允许创建一次对应出库。状态：`生效中`
- `C7` 成品入库路径统一：凡属成品入库，一律经本 domain 的 `inbound`（生产入库单）落库与过账，不分散到客户收发或其它家族。状态：`生效中`
- `C8` 已消费来源禁改价：当入库来源流水已被 `inventory_source_usage` 占用时，禁止直接修改原 `stock_in_order_line.unitPrice` 和原来源流水 `inventory_log.unitCost`；必须通过入库调价单以补偿型修正处理。未被任何来源占用的入库行仍允许走现有"修改入库单 → reverseStock + repost"路径。状态：`生效中`

## 长期业务口径

- 创建单据后立即写入库存，修改时按明细补偿库存，作废时冲回；入库单据不能直接兼做下游消耗单据，快捷操作须自动生成独立的车间领料单并保留上下游引用关系。
- 入库明细的数量、单价、金额是来源成本层的业务真源；当同一物料存在多笔不同价格入库时，系统必须能追溯每笔下游消耗对应的入库来源；后续消耗成本不得退化为物料主档静态单价。
- 入库单价写错且已被部分消费时，不允许静默改写原入库行和原来源流水的历史成本；必须通过专用调价单走补偿型修正，确保历史审计证据不丢失、后续 FIFO 可解释。
- 后续扩展上游联动、来源成本追溯或快捷协同体验，必须在不破坏统一家族模型与库存真源的前提下推进。

## 能力清单


| 编号   | 能力              | 验收口径                                               | 阶段      | 状态    | 关联任务                                             |
| ---- | --------------- | -------------------------------------------------- | ------- | ----- | ------------------------------------------------ |
| `F1` | 统一入库家族模型        | 验收单与生产入库单共用同一套主从表、服务骨架和库存写入路径                      | Phase 1 | `已完成` | `-`                                              |
| `F2` | 主仓准入与库存范围约束     | 验收单与生产入库单默认归主仓，RD 到货验收也先入主仓                        | Phase 1 | `已完成` | `-`                                              |
| `F3` | 真实库存轴访问控制       | 查询、详情、修改、作废按 `stockScope` 判断，且关键路径具备测试覆盖           | Phase 1 | `已完成` | `-`                                              |
| `F4` | 入库来源层与成本追溯      | 入库价格可作为后续消耗的来源成本真源，支持按入库来源追溯同物料 / 型号的实际消耗成本        | Phase 2 | `已完成` | `task-20260404-1315-inbound-phase2-fifo-costing` |
| `F5` | 默认 FIFO 与手动来源指定 | 消耗类动作默认按 FIFO 分配来源层，并支持按业务依据手动指定来源且保留可审计分配记录       | Phase 2 | `已完成` | `task-20260404-1315-inbound-phase2-fifo-costing` |
| `F6` | 入库到车间的一键双向协同    | 支持入库页“立即出库”生成车间领料单、车间页反选入库来源发起领料，且同一入库单据只能成功出库一次   | Phase 3 | `未开始` | `-`                                              |
| `F7` | 后续入库扩展切片承接      | 后续若继续扩展上游联动、校验补强或体验优化，仍以本 domain 约束作为长期真源          | Phase 3 | `未开始` | `-`                                              |
| `F8` | 入库调价单（入库错价纠偏）   | 入库单价写错且来源已被部分消费时，通过调价单安全纠偏：剩余数量切换新来源、已出部分记录差异、不改历史 | Phase 3 | `已完成` | `task-20260405-2136-price-layer-outbound-and-inbound-price-correction` |


## 能力合同（推荐）···

### `F4` 入库来源层与成本追溯

- In scope:
  - 明确入库价格在来源层、库存流水、下游消耗追溯中的长期语义。
  - 明确同一物料 / 型号多价格入库时，系统需要保留的最小追溯证据。
  - 明确入库改动、作废与历史追溯之间的补偿边界。
- Out of scope / non-goals:
  - 不在本 domain 内直接升级为完整批次、库位、多仓 WMS 模型。
  - 不要求在本能力合同中定义完整报表或月结实现细节。
- Completion criteria:
  - `[TC-1]` 入库明细价格被定义为后续消耗来源成本的业务真源，且文档口径不再允许退化为物料主档静态单价。
  - `[TC-2]` 文档明确下游消耗需保留"消费行 -> 来源入库层 / 来源流水"的可追溯关系。
  - `[TC-3]` 文档明确改单、作废、逆操作不能破坏既有来源追溯语义。
- Evidence expectation:
  - domain 文档更新 + 后续对应 task 的 schema / service / validation 设计说明。
- Default derived slice acceptance mode: `light`
- AI derivation note:
  - 优先以 `inventory_log(IN)` + `inventory_source_usage` 作为演进基础，先补来源分配闭环与成本快照，不默认直接新建完整批次子系统。

### `F5` 默认 FIFO 与手动来源指定

- In scope:
  - 定义默认 FIFO 适用范围。
  - 定义手动来源指定的覆盖规则、审计要求与逆操作要求。
  - 定义库存核心与业务单据之间的分工边界。
  - 明确 `customer`、`workshop-material`、`project`、`rd-subwarehouse` 四类链路的覆盖边界与分阶段策略。
  - 明确完全可信 FIFO 的前提条件，包括先入后出、禁止负库存、补录与历史修正规则。
  - 明确历史缺少来源分配记录时的起算时间口径。
- Out of scope / non-goals:
  - 不在本合同中展开 UI 交互细节。
  - 不强制要求历史旧数据自动补齐完全可信的 FIFO 成本。
  - 不在本合同中承诺为起算时间前缺少来源分配记录的数据补算出完全可信的 FIFO 成本。
- Completion criteria:
  - `[TC-1]` 文档明确最终覆盖 `customer`、`workshop-material`、`project`、`rd-subwarehouse` 四类链路，并说明前三者是最终消耗链、`rd-subwarehouse` 至少承担成本桥接职责。
  - `[TC-2]` 文档明确默认未指定来源时按 FIFO 分配，且可信前提是先有可用入库来源、后有出库消耗。
  - `[TC-3]` 文档明确手动指定来源后，扣减、成本、逆操作与追溯均以指定结果为准。
  - `[TC-4]` 文档明确无论 FIFO 还是手动指定，系统都必须保留来源分配记录。
  - `[TC-5]` 文档明确系统不允许负库存；补录历史单据或补填业务日期不得改写已生效库存事实顺序。
  - `[TC-6]` 文档明确历史旧数据若缺少来源分配记录，可自约定起算时间起提供完全可信 FIFO 成本追溯，起算时间前不作该承诺。
- Evidence expectation:
  - domain 文档更新 + 后续 task 中的接口 / service contract 与测试清单。
- Default derived slice acceptance mode: `light`
- AI derivation note:
  - 默认从库存核心统一下沉 FIFO 能力，优先落地 `customer`、`workshop-material`、`project` 三类最终消耗链，同时让 `rd-subwarehouse` 的 `RD handoff` 承担成本桥接职责，不要在各模块重复实现。

### `F6` 入库到车间的一键双向协同

- In scope:
  - 支持从入库页面以“立即出库”方式，复用当前入库单据的物料明细直接发起下游领料。
  - 发起时允许补充车间/部门、领料人等下游必要信息，避免用户重复录入物料信息。
  - 确认后系统自动生成对应车间领料单。
  - 支持从车间页面反选入库单据物料并快速生成领料。
  - 明确上下游单据引用、作废边界、追溯要求和重复创建拦截规则。
- Out of scope / non-goals:
  - 不把入库单与领料单合并成单一业务表。
  - 不在本合同中引入车间在手库存余额。
- Completion criteria:
  - `[TC-1]` 文档明确双向快捷入口只改变发起方式，不改变后台单据边界。
  - `[TC-2]` 文档明确“立即出库”由入库领域发起，但确认后必须自动生成独立的车间领料单，并保留库存副作用和上下游引用。
  - `[TC-3]` 文档明确同一入库单据只能成功创建一次对应出库，系统必须拦截重复创建。
  - `[TC-4]` 文档明确车间仍只作为归属 / 核算维度，不变成真实库存池。
- Evidence expectation:
  - domain 文档更新 + 后续 task 中的页面入口、接口契约和逆操作说明。
- Default derived slice acceptance mode: `light`
- AI derivation note:
  - 优先复用 `sourceDocumentType/sourceDocumentId/sourceDocumentLineId` 与 `document_relation` / `document_line_relation` 体系，不要为快捷操作单独再造一套关系表。

### `F8` 入库调价单（入库错价纠偏）

- In scope:
  - 新增专用调价单据（`stock_in_price_correction_order` / `stock_in_price_correction_order_line`），不复用原入库单修改路径。
  - 新增两种库存操作类型 `PRICE_CORRECTION_OUT` / `PRICE_CORRECTION_IN`，用于把原来源流水的剩余数量转出并按正确单价重新转入。
  - 调价单审核时，系统重新锁定并计算原来源流水的剩余数量和已消费数量，不使用制单时缓存值。
  - 剩余数量通过一笔内部 OUT + 一笔内部 IN 切换来源，库存余额净变化为零；新 `PRICE_CORRECTION_IN` 流水纳入 `FIFO_SOURCE_OPERATION_TYPES`，成为后续消耗的真实来源。
  - 已消费部分不做库存数量动作、不改已有 `inventory_source_usage`；只在调价单明细上记录 `historicalDiffAmount = (correctUnitCost - wrongUnitCost) × consumedQtyAtCorrection`。
  - 调价后追溯规则：调价前的消费行继续追原 `sourceLogId`，调价后新消费追新生成的 `PRICE_CORRECTION_IN` 流水；如需追到最初入库行，通过调价单明细反查。
  - 不允许对同一原来源流水存在多张未作废、未完成的调价单。
- Out of scope / non-goals:
  - V1 不回写历史消费行的 `costUnitPrice / costAmount`，避免静默改写既有审计事实。
  - 不在本合同中引入完整的"成本更正凭证"读模型。
  - 不允许直接修改原 `stock_in_order_line.unitPrice` 或 `inventory_log.unitCost`（约束 C8）。
- Completion criteria:
  - `[TC-1]` 调价单审核通过后，原来源流水剩余可用量归零，新 `PRICE_CORRECTION_IN` 流水成为后续 FIFO 的可用来源。
  - `[TC-2]` 调价前已发生的消费行保持原 `sourceLogId` 不变，调价后新消费使用新来源。
  - `[TC-3]` `inventory_balance.quantityOnHand` 在调价前后净变化为零。
  - `[TC-4]` 调价单明细正确记录已消费数量和历史差异金额。
  - `[TC-5]` 价格层库存查询把 `PRICE_CORRECTION_IN` 视为有效来源、`PRICE_CORRECTION_OUT` 视为普通消耗。
  - `[TC-6]` 出库追溯查询能展示调价来源关系（新来源 → 调价单 → 原入库单行）。
- Evidence expectation:
  - domain 文档更新 + 调价单 CRUD / 审核过账 / 库存联动 / 追溯查询的功能验证与 QA 测试。
- Default derived slice acceptance mode: `light`
- AI derivation note:
  - 调价单的库存副作用仍统一走 `inventory-core`，不旁路改库存；`PRICE_CORRECTION_OUT` 的来源分配必须强制指向原 `sourceInventoryLogId`，不走默认 FIFO 分配。

## 阶段路线图


| 阶段      | 目标                                   | 当前状态  |
| ------- | ------------------------------------ | ----- |
| Phase 1 | 收口当前入库家族的统一模型、主仓准入和真实库存轴访问约束         | `已完成` |
| Phase 2 | 收敛入库来源层、默认 FIFO 和来源成本追溯口径            | `已完成` |
| Phase 3 | 落地入库调价单纠偏能力、入库与车间双向快捷协同，并继续扩展联动与体验优化 | `进行中` |


## 已确认补充口径（2026-04-04）

- 入库价格追溯能力目标上覆盖 `customer` 出库、车间领料、项目领用和 `RD handoff` 四类链路；首轮实现优先收敛前三类最终消耗链，`RD handoff` 同步承担主仓到 RD 小仓的成本桥接职责。
- 历史旧出库 / 领料数据若缺少来源分配记录，接受以约定起算时间之后的数据开始提供完全可信的 FIFO 成本追溯。
- 完全可信的 FIFO 追溯以“先入后出”和“不允许负库存”为前提；允许补单，但补单不得重排已经生效的库存事实。

## 文档关系（可选）

- 项目级长期背景：`docs/requirements/PROJECT_REQUIREMENTS.md`
- 架构设计：`docs/architecture/modules/inventory-core.md`
- 架构设计：`docs/architecture/modules/inbound.md`
- 架构设计：`docs/architecture/20-wms-database-tables-and-schema.md`
- 方案草案：`docs/workspace/fifo-costing-default-fifo/README.md`
- 后续继续推进时，直接从本 domain 能力合同创建 `docs/tasks/task-*.md`（`Related requirement` 指向本 domain 对应 `Fx`）。
