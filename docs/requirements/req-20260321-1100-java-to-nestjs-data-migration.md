# 数据迁移：Java 源库 → NestJS 目标库（全量业务域迁移与切换收口）

## Metadata

- ID: `req-20260321-1100-java-to-nestjs-data-migration`
- Status: `confirmed`
- Lifecycle disposition: `active`
- Owner: `user`
- Related tasks:
  - `docs/tasks/task-20260321-1140-architecture-migration-reference.md`
  - `docs/tasks/task-20260323-1530-migration-project-material-resolution-readiness.md`
- Related requirement:
  - `docs/requirements/archive/retained-completed/req-20260320-1830-migration-active-slices.md`（已完成切片的交互真源）

## 用户需求

- [ ] 本文档用于承接“Java 源库 `saifute` → NestJS 目标库 `saifute-wsm`”的整体验证、迁移与 cutover 收口，不再只讨论“剩余域”。
- [ ] 迁移目标不是把旧库 `58` 张表逐表照搬到新库 `25` 张表，而是按业务域保留仍有经营、库存、追溯价值的业务事实，并在新库找到正确落点。
- [ ] 需要明确每个业务域在上线后的处理方式：正式迁入、业务排除并签收、仅保留旧库归档查询，或明确不迁。
- [ ] 本轮已确认迁移口径：
  - `project` 域需要保留到 NestJS 新库；若项目明细确无对应目标物料，可按 `material_name + specification + unit` 的稳定键生成 `materialCode` 并自动补建 `material`，随后正式重跑迁移。
  - `scrap` 即使当前历史数据为 `0`，也要纳入本次范围并先补齐迁移能力。
  - 平台账号 / 权限 / 菜单 / 日志 / 调度不迁旧平台历史，NestJS 新系统按新方案重建。
  - 全局 cutover 先在 `project` / `scrap` / 平台表范围确认后，再统一推进最终收口。

### 关键业务口径

- `project` 域：旧 Java 中原 `article`/项目域，对应“项目/工程/组合产品”业务。它记录一个项目主单，以及该项目实际使用或采购的物料明细。该域不是单纯静态 BOM，而是带库存副作用的事务域：项目新增、修改、作废都会影响物料消耗与库存追溯。
- 旧库主表：`saifute_composite_product`。主要描述项目名称、客户、分类、业务日期、业务员、总金额、备注等项目头信息。
- 旧库明细表：`saifute_product_material`。一行代表某个项目下的一种物料明细，包含物料、数量、单价、供应商、验收日期、出厂编号等信息。
- `material_id`：`saifute_product_material` 中指向 `saifute_material.material_id` 的业务主键。它的作用不是“展示名称”，而是唯一确定“到底是哪一个标准物料”，从而把项目明细挂到目标库 `material.id`，并继续关联库存扣减、库存日志、来源追踪、单据关系等语义。
- `material_name` / `specification`：更像名称与规格快照，可用于展示或辅助识别，但不能稳定替代 `material_id` 做正式迁移。
- `product_id`：说明该明细属于哪个项目主单。
- `quantity` / `unit_price` / `tax_included_price`：说明项目中该物料的数量与金额口径。
- `supplier_id` / `acceptance_date` / `interval`：分别表示供应商、验收日期、出厂编号/批次类信息，用于后续追溯。

### 当前全量迁移基线

| 类别 | 业务域 | 当前结论 |
| --- | --- | --- |
| 已完成并有验证证据 | 主数据、入库、基础出库、预留、车间领料、销售退货、车间退料、退货 post-admission | 已有对应 batch、validate 或 cutoverReady 证据，可作为全量迁移已完成部分 |
| 已补迁并待切换确认 | `project` | `project` 切片已新增“无对应物料时自动补建 material”规则；当前 `5` 个项目、`138` 条项目物料明细已全部准入 live，并额外自动补建 `126` 条 `AUTO_CREATED` 物料，剩余 cutover blocker 为库存重放确认 |
| 已确认纳入范围，待补迁移能力 | `scrap`（报废） | 源表当前行数为 `0`，但目标模型已预留，仍需在本次范围内补齐迁移能力、验证口径与 cutover 说明 |
| 重放 / 重建，不做旧表直拷 | 旧库存现值 / 库存流水 / 来源追踪 / 库存预警 | 进入 `inventory_balance`、`inventory_log`、`inventory_source_usage`、`vw_inventory_warning` 的新语义，不按旧表一对一复制 |
| 不迁旧平台历史，NestJS 侧重建 | 平台账号 / 权限 / 菜单 / 组织 / 配置 / 公告 / 日志 / 调度 / 代码生成器 | 旧平台历史不进入新库正式业务迁移；新系统按新方案重建，仅保留新系统运行期自己的日志与调度表 |

### `project` 域当前结论

- 来源表：`saifute_composite_product` `5` 行、`saifute_product_material` `138` 行。
- 现状：`project` 补迁切片代码、focused tests、dry-run / execute / validate 已全部通过，并在本轮加入“无候选物料时自动补建 `material`”能力。
- 当前执行结果：`batch2b-project` 当前已写入 `5` 行 live `project`、`138` 行 live `project_material_line`、`0` 个 `pending-material-resolution` 项目、`0` 条 `pending_relations`、`0` 个结构性排除项目。
- 自动补建结果：本轮对真实数据共补建 `126` 条 `AUTO_CREATED` 物料，编码格式为 `MAT-PROJECT-AUTO-L<代表行legacyId>-<hash>`；相同 `material_name + specification + unit` 会复用同一条补建物料。
- 审计口径：自动补建物料写入 `material.creationMode = AUTO_CREATED`、`sourceDocumentType = ProjectAutoCreatedMaterial`、`sourceDocumentId = <代表行legacyId>`，并在 `migration_staging.archived_field_payload` 保留来源行证据。
- 业务影响：`project` 域当前已不再被物料映射 backlog 阻塞；剩余 cutover 阻塞从“待人工物料映射”收敛为“项目库存重放与下游确认尚未签收”。
- 结论：`project` 迁移能力与真实数据准入均已打通，后续重点转为 inventory replay 确认、`scrap` 切片补齐，以及全局 cutover 收口。

## 当前进展

- 阶段进度: 已完成 `project` 域自动补建物料能力、回归验证和真实数据重跑，当前该 slice 在现有真实数据上已从 pending 收敛为 fully admitted。
- 当前状态: `scripts/migration/project/**` 现已支持三态 admission、deterministic fallback、自动补建 `AUTO_CREATED` 物料、`archived_field_payload` 审计留痕，以及 blocker-aware validate / cutover readiness 输出。当前 validate 结果为 `5` 个 migrated project、`138` 条 migrated line、`126` 条 auto-created material、`0` `pending_relations`、`0` structural exclusion、`cutoverReady = false`（仅因 inventory replay 未确认）。
- 阻塞项: `project` 域已无人工物料映射 backlog；当前剩余阻塞为 `PROJECT_INVENTORY_REPLAY_CONFIRMED` 尚未签收，以及 `scrap` 迁移脚本与最终全局 cutover 收口仍待推进。
- 下一步: 确认 `project` 域 inventory replay 与下游消费者 readiness，随后继续推进 `scrap` 切片与全量 cutover 收口。

## 待确认

- None
