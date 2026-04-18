# Java -> NestJS 数据迁移总览

## 1. 文档目标

本文档用于一次性讲清楚旧 Java 库 `saifute` 到 NestJS 目标库 `saifute-wsm` 的数据迁移口径：

- 旧库有哪些表，分别承担什么业务作用
- 这些表进入现在哪些表、视图或 staging 结构
- 现在这些表在 NestJS 架构中承担什么作用
- 哪些对象是正式迁入，哪些是重放/重建，哪些只归档，哪些明确排除或后移

它是迁移参考文档，不是执行日志：

- 模块边界、技术栈、冻结约束以 `docs/architecture/00-architecture-overview.md` 为准
- 业务流程与优化后 schema 设计以 `docs/architecture/20-wms-database-tables-and-schema.md` 为准
- 迁移批次、历史证据、阶段性结论以各批次 validate report 为准（task-20260319-1905 迁移主计划已归档，见 git log）

### 1.1 当前冻结基线

当前迁移工作统一以以下真源作为冻结基线，不再把“当前代码已经实现到哪里”误写成目标边界：

- `docs/architecture/00-architecture-overview.md`：模块边界、跨模块约束、共享核心规则
- `docs/architecture/20-wms-database-tables-and-schema.md`：业务流程、目标 schema、表职责与状态语义
- 本文档：legacy -> target 的迁移映射、`migrated / replayed / archived / excluded` 口径，以及 cutover 术语
- `docs/architecture/modules/*.md`：仅用于补充模块级 `current vs target` 澄清，不用于下调迁移目标基线

### 1.2 目标数据库边界

本轮确认后，目标数据库边界按以下口径理解：

- `prisma/schema.prisma`：NestJS 运行期正式业务表的主真源
- `docs/architecture/20-wms-database-tables-and-schema.md`：正式表、只读视图与共享表语义的设计真源
- `scripts/migration/sql/000-create-migration-staging.sql`：`migration_staging` 下 mapping、archive、pending、excluded 等受控迁移结构真源
- 新库中存在 `sys_job`、`sys_job_log`、`sys_logininfor`、`sys_oper_log`，表示 NestJS 新系统保留运行期日志与调度表，不表示旧平台历史要导入这些表
- 旧平台账号 / 权限 / 菜单 / 组织 / 配置 / 公告 / Quartz / 代码生成器历史不属于本次正式业务导入边界

## 2. 阅读约定

| 标签      | 含义                                        |
| ------- | ----------------------------------------- |
| `已迁入`   | 历史业务事实已经进入 NestJS 正式业务表                   |
| `重放/重建` | 不直接复制旧表，而是基于已迁入事实重新生成目标表                  |
| `归档`    | 不进入正式业务表，但保留在 `migration_staging` 供追溯或签收  |
| `排除`    | 当前无法安全迁入正式表，进入 `excluded_documents` 等受控清单 |
| `后移`    | 目标模型存在，但当前批次不做或等待范围确认                     |
| `无目标落点` | 新架构不再保留该类持久化对象，通常改为重建、视图、系统重建或旧库归档        |

迁移不是旧表到新表的一对一复制，而是把旧业务事实收敛到新的领域模型：

- 旧库 `58` 张表，混合了业务表、平台表、Quartz 表、代码生成器表
- 新库当前 `25` 张表，重点保留主数据、库存核心、工作流投影、四类事务单据、关系表、日志与调度表

## 3. 旧库总览：有哪些表，它们做什么

### 3.1 业务主数据表

| 旧表                  | 旧作用   |
| ------------------- | ----- |
| `saifute_material`  | 物料主档  |
| `saifute_customer`  | 客户主档  |
| `saifute_supplier`  | 供应商主档 |
| `saifute_personnel` | 人员主档  |
| `saifute_workshop`  | 车间主档  |

### 3.2 业务单据表

| 旧表组                                                          | 旧作用                                            |
| ------------------------------------------------------------ | ---------------------------------------------- |
| `saifute_inbound_order` + `saifute_inbound_detail`           | 验收单头和明细                                        |
| `saifute_into_order` + `saifute_into_detail`                 | 生产入库单头和明细                                      |
| `saifute_outbound_order` + `saifute_outbound_detail`         | 出库单头和明细                                        |
| `saifute_sales_return_order` + `saifute_sales_return_detail` | 销售退货单头和明细                                      |
| `saifute_pick_order` + `saifute_pick_detail`                 | 领料单头和明细                                        |
| `saifute_return_order` + `saifute_return_detail`             | 退料单头和明细                                        |
| `saifute_scrap_order` + `saifute_scrap_detail`               | 报废单头和明细                                        |
| `saifute_composite_product` + `saifute_product_material`     | 项目头和项目物料明细，旧命名来自 `article` 域，本质上是带库存副作用的项目事务数据 |

### 3.3 业务辅助与副作用表

| 旧表                          | 旧作用                |
| --------------------------- | ------------------ |
| `saifute_inventory`         | 旧库存现值              |
| `saifute_inventory_log`     | 旧库存流水              |
| `saifute_inventory_used`    | 旧来源占用/消耗追踪         |
| `saifute_inventory_warning` | 旧库存预警结果表           |
| `saifute_interval`          | 编号区间、出厂编号类数据，旧语义混杂 |
| `saifute_audit_document`    | 旧审核投影              |
| `saifute_change_record`     | 旧字段变更/修改原因记录       |

### 3.4 平台组织、权限与配置表

| 旧表              | 旧作用     |
| --------------- | ------- |
| `sys_user`      | 用户      |
| `sys_role`      | 角色      |
| `sys_role_dept` | 角色与部门关系 |
| `sys_role_menu` | 角色与菜单关系 |
| `sys_user_post` | 用户与岗位关系 |
| `sys_user_role` | 用户与角色关系 |
| `sys_menu`      | 菜单与按钮   |
| `sys_dept`      | 部门组织    |
| `sys_post`      | 岗位      |
| `sys_config`    | 系统配置    |
| `sys_dict_type` | 字典类型    |
| `sys_dict_data` | 字典数据    |
| `sys_notice`    | 通知公告    |

### 3.5 平台日志与调度表

| 旧表               | 旧作用    |
| ---------------- | ------ |
| `sys_job`        | 任务定义   |
| `sys_job_log`    | 任务执行日志 |
| `sys_logininfor` | 登录日志   |
| `sys_oper_log`   | 操作日志   |

### 3.6 Quartz 内部表

`qrtz_blob_triggers`、`qrtz_calendars`、`qrtz_cron_triggers`、`qrtz_fired_triggers`、`qrtz_job_details`、`qrtz_locks`、`qrtz_paused_trigger_grps`、`qrtz_scheduler_state`、`qrtz_simple_triggers`、`qrtz_simprop_triggers`、`qrtz_triggers`

作用：Quartz 运行时内部状态，不是业务事实表。

### 3.7 代码生成器表

`gen_table`、`gen_table_column`

作用：RuoYi 代码生成器元数据，不属于业务运行时事实。

## 4. 新库总览：现在有哪些表，它们做什么

### 4.1 主数据表

| 目标表                 | 现在的作用                  |
| ------------------- | ---------------------- |
| `material_category` | 物料分类                           |
| `material`          | 物料主档；被库存、入库、出库、车间、项目复用        |
| `customer`       | 客户主档；被销售业务和项目复用               |
| `supplier`          | 供应商主档；被入库和项目复用                |
| `personnel`         | 人员主档；承接经办人、负责人等角色             |
| `workshop`          | 车间主档；承接单据归属与成本核算，不再作为库存维度    |
| `stock_scope`       | 库存范围主档；第一阶段真实库存范围仅主仓与 RD 小仓 |

### 4.2 库存核心表

| 目标表                          | 现在的作用                              |
| ---------------------------- | ---------------------------------- |
| `inventory_balance`          | 按 `materialId + stockScopeId` 保存库存现值      |
| `inventory_log`              | 保存不可变库存流水、库存范围和来源成本层                |
| `inventory_source_usage`     | 保存来源占用、释放与成本分配，承接旧 `inventory_used` 语义 |
| `factory_number_reservation` | 保存出厂编号区间占用与释放                      |

### 4.3 工作流投影表

| 目标表                       | 现在的作用               |
| ------------------------- | ------------------- |
| `approval_document` | 保存当前有效审核投影，不替代业务主状态 |

### 4.4 四类事务单据表

| 目标表组                                                       | 现在的作用                |
| ---------------------------------------------------------- | -------------------- |
| `stock_in_order` + `stock_in_order_line`                   | 统一承接验收单、生产入库单        |
| `sales_stock_order` + `sales_stock_order_line`       | 统一承接出库单、销售退货单        |
| `workshop_material_order` + `workshop_material_order_line` | 统一承接领料单、退料单、报废单      |
| `rd_project` + `rd_project_material_line`                  | 承接研发项目及项目物料消耗，且保持库存副作用 |

### 4.5 关系表

| 目标表                      | 现在的作用    |
| ------------------------ | -------- |
| `document_relation`      | 表头级上下游关系 |
| `document_line_relation` | 行级上下游关系  |

### 4.6 平台日志与调度表

| 目标表              | 现在的作用         |
| ---------------- | ------------- |
| `sys_job`        | NestJS 调度任务定义 |
| `sys_job_log`    | NestJS 调度执行日志 |
| `sys_logininfor` | 登录日志          |
| `sys_oper_log`   | 操作日志          |

补充：

- `vw_inventory_warning` 在新设计中是只读视图，不再保留为交易表
- 新库里存在 `sys_job`、`sys_job_log`、`sys_logininfor`、`sys_oper_log`，不代表旧平台层已整体迁移

## 5. 按业务域的旧表 -> 新表映射

### 5.1 主数据域

| 旧表组                                                      | 旧作用     | 新表组                 | 新作用     | 迁移方式     | 当前状态                                  |
| -------------------------------------------------------- | ------- | ------------------- | ------- | -------- | ------------------------------------- |
| `sys_dict_data`（`dict_type='saifute_material_category'`） | 旧物料分类字典 | `material_category` | 独立物料分类 | 转换生成     | 已迁入，`8 -> 8`                          |
| `saifute_material`                                       | 物料主档    | `material`          | 标准物料主档  | 字段归一化迁移  | 已迁入 `437 / 458`，`21` 条因主数据问题被阻塞       |
| `saifute_customer`                                       | 客户主档    | `customer`       | 客户主档    | 字段归一化迁移  | 已迁入，`184 / 184`                       |
| `saifute_supplier`                                       | 供应商主档   | `supplier`          | 供应商主档   | 字段归一化迁移  | 已迁入，`93 / 93`                         |
| `saifute_personnel`                                      | 人员主档    | `personnel`         | 人员主档    | 字段归一化迁移  | 已迁入，`51 / 51`                         |
| `saifute_workshop`                                       | 车间主档    | `workshop`          | 车间主档（归属 / 核算维度）    | 字段归一化迁移 | 已迁入；后续不再把 `workshop` 当成库存范围兜底 |
| 无稳定旧业务真源（按已确认运行口径受控生成）                                | 库存范围    | `stock_scope`       | 主仓 / RD 小仓库存范围 | 受控生成     | 第一阶段固定 `MAIN` / `RD_SUB`，不复刻旧 `warehouse/location` 设计 |

### 5.2 入库域

| 旧表组                                                | 旧作用   | 新表组                                      | 新作用                                 | 迁移方式        | 当前状态   |
| -------------------------------------------------- | ----- | ---------------------------------------- | ----------------------------------- | ----------- | ------ |
| `saifute_inbound_order` + `saifute_inbound_detail` | 验收单   | `stock_in_order` + `stock_in_order_line` | `orderType=ACCEPTANCE` 的入库单         | 两套旧表收敛为一套新表 | 已迁入一部分 |
| `saifute_into_order` + `saifute_into_detail`       | 生产入库单 | `stock_in_order` + `stock_in_order_line` | `orderType=PRODUCTION_RECEIPT` 的入库单 | 两套旧表收敛为一套新表 | 已迁入一部分 |

当前状态：

- 旧 `210` 张入库单、`389` 行明细
- 新库已迁入 `190` 单、`307` 行
- `20` 张单据被排除，`286` 份遗留字段进入 `archived_field_payload`

### 5.3 销售业务域：出库

| 旧表组                                                  | 旧作用    | 新表组                                                                                   | 新作用                         | 迁移方式        | 当前状态     |
| ---------------------------------------------------- | ------ | ------------------------------------------------------------------------------------- | --------------------------- | ----------- | -------- |
| `saifute_outbound_order` + `saifute_outbound_detail` | 出库单    | `sales_stock_order` + `sales_stock_order_line`                                  | `orderType=OUTBOUND` 的销售出库单 | 直接收敛到销售业务家族 | 已迁入主单据   |
| `saifute_interval`（`order_type=4`）                   | 出库编号区间 | `factory_number_reservation`，并按条件回填 `sales_stock_order_line.startNumber/endNumber` | 编号区间占用                      | 分流转换，不直拷    | 已迁入受支持部分 |

当前状态：

- 出库单已迁入 `108 / 112`，明细已迁入 `137 / 141`
- `4` 张出库头被排除
- 区间表 `161` 条旧记录中，`80` 条 `order_type=4` 进入 live reservation
- 其余 `81` 条进入 `archived_intervals`，其中 `74` 条为 `order_type=2`，`5` 条为 `order_type=7`，`2` 条为归档的 `order_type=4`

### 5.4 销售业务域：销售退货

| 旧表组                                                          | 旧作用        | 新表组                                                            | 新作用                           | 迁移方式                        | 当前状态     |
| ------------------------------------------------------------ | ---------- | -------------------------------------------------------------- | ----------------------------- | --------------------------- | -------- |
| `saifute_sales_return_order` + `saifute_sales_return_detail` | 销售退货单      | `sales_stock_order` + `sales_stock_order_line`           | `orderType=SALES_RETURN` 的退货单 | formal admission 先入正式表，关系后补 | 已部分迁入    |
| 旧头表 `source_id/source_type`、旧明细关系线索                          | 退货对出库的来源关系 | `document_relation`、`document_line_relation`、`sourceDocument*` | 退货上下游关系与行内来源                  | 恢复式迁移，不强造关系                 | 仍有后续增强空间 |

当前状态：

- 已正式准入 `9 / 10` 张销售退货单、`13 / 14` 行
- `13` 条 admitted 行当前允许 `sourceDocument*` 为空，后续按可证明证据补强
- 旧头中仍有一部分结构性无效记录进入 `excluded_documents`
- 相关未决关系进入 `archived_relations` 或后续共享增强范围

### 5.5 车间物料域：领料

| 旧表组                                          | 旧作用 | 新表组                                                        | 新作用                   | 迁移方式      | 当前状态   |
| -------------------------------------------- | --- | ---------------------------------------------------------- | --------------------- | --------- | ------ |
| `saifute_pick_order` + `saifute_pick_detail` | 领料单 | `workshop_material_order` + `workshop_material_order_line` | `orderType=PICK` 的领料单 | 收敛到车间物料家族 | 已迁入主单据 |

当前状态：

- 已迁入 `61 / 75` 张领料单、`145 / 197` 行
- `14` 张单据被排除
- 本批只做正式业务行准入，不直接写库存、来源追踪、关系表

### 5.6 车间物料域：退料

| 旧表组                                              | 旧作用 | 新表组                                                        | 新作用                     | 迁移方式                        | 当前状态  |
| ------------------------------------------------ | --- | ---------------------------------------------------------- | ----------------------- | --------------------------- | ----- |
| `saifute_return_order` + `saifute_return_detail` | 退料单 | `workshop_material_order` + `workshop_material_order_line` | `orderType=RETURN` 的退料单 | formal admission 先入正式表，关系后补 | 已部分迁入 |

当前状态：

- 已正式准入 `3` 张退料单、`4` 行
- `4` 条 admitted 行当前允许 `sourceDocument*` 为空
- 当前 `excludedDocumentCount = 0`
- 尚未证明上游领料的 `4` 条关系线索进入 `pending_relations`，而不是把已准入退料头再次打回 `excluded_documents`

### 5.7 车间物料域：报废

| 旧表组                                            | 旧作用 | 新表组                                                        | 新作用                    | 迁移方式    | 当前状态 |
| ---------------------------------------------- | --- | ---------------------------------------------------------- | ---------------------- | ------- | ---- |
| `saifute_scrap_order` + `saifute_scrap_detail` | 报废单 | `workshop_material_order` + `workshop_material_order_line` | `orderType=SCRAP` 的报废单 | 已完成 | `scripts/migration/scrap/`，batch `batch3g-workshop-scrap` |

当前状态：

- 迁移能力已补齐，dry-run / execute / validate 全通过
- 源数据 0 行；若后续产生报废数据，迁移脚本可直接重跑

### 5.8 项目域

| 旧表组                                                      | 旧作用          | 新表组                                 | 新作用           | 迁移方式              | 当前状态    |
| -------------------------------------------------------- | ------------ | ----------------------------------- | ------------- | ----------------- | ------- |
| `saifute_composite_product` + `saifute_product_material` | 项目头与项目物料消耗明细 | `rd_project` + `rd_project_material_line` | 研发项目事务数据与项目物料消耗 | 事务型迁移，不是静态 BOM 复制 | 已迁入 |

当前状态：

- 源表 `5` 个项目、`138` 条项目物料明细
- 已迁入 `5 / 5` 个项目、`138 / 138` 条项目明细
- 其中 `4` 行直接命中既有物料，`134` 行通过自动补建 `126` 条 `AUTO_CREATED` 物料后准入
- `project` validate 已显示 `cutoverReady = true`，且已完成 `138` 条项目消耗库存重放

### 5.9 库存、审核、关系与辅助域

| 旧表组                                                        | 旧作用           | 新表组                                                 | 新作用                         | 迁移方式              | 当前状态                                  |
| ---------------------------------------------------------- | ------------- | --------------------------------------------------- | --------------------------- | ----------------- | ------------------------------------- |
| `saifute_inventory`                                        | 旧库存现值         | `inventory_balance`                                 | 新库存现值                       | 重放/重建，不直拷         | 当前已由全域 admitted 业务单据重放出 `428` 条余额     |
| `saifute_inventory_log`                                    | 旧库存流水         | `inventory_log`                                     | 新库存流水                       | 重放/重建，不直拷         | 当前已重放出 `733` 条流水                      |
| `saifute_inventory_used`                                   | 旧来源占用         | `inventory_source_usage`                            | 来源占用与释放                     | 转换迁移，不直拷          | 当前仍为 `0`；本地迁移完成口径接受该受控留白，线上切换前需复核 |
| `saifute_interval`                                         | 旧区间、编号、批次混合语义 | `factory_number_reservation` + `archived_intervals` | 编号区间 live reservation 与归档区间 | 按 `order_type` 分流 | 已部分完成                                 |
| `saifute_audit_document`                                   | 旧审核投影         | `approval_document`                           | 当前有效审核投影                    | 投影重建              | 当前已生成 `360` 条审核投影                     |
| 旧头表 `source_id/source_type` + `saifute_inventory_used` 等线索 | 旧上下游关系证据      | `document_relation` + `document_line_relation`      | 新上下游关系模型                    | 恢复式构造，不强造关系       | 当前仍为 `0`；本地迁移完成口径接受该受控留白，线上切换前需复核 |
| `saifute_inventory_warning`                                | 旧库存预警结果表      | `vw_inventory_warning`                              | 只读预警视图                      | 视图替代              | 不做表对表迁移                               |
| `saifute_change_record`                                    | 旧变更记录         | 无稳定同名业务表                                            | 作为历史辅助信息保留                  | 归档或旧库留存           | 当前无正式目标表                              |

### 5.10 平台、日志与调度域

| 旧表组                                                                                                                                              | 旧作用            | 新表组                               | 新作用                       | 迁移方式           | 当前状态       |
| ------------------------------------------------------------------------------------------------------------------------------------------------ | -------------- | --------------------------------- | ------------------------- | -------------- | ---------- |
| `sys_job` + `sys_job_log`                                                                                                                        | 旧调度定义与执行日志     | `sys_job` + `sys_job_log`         | NestJS 调度定义与日志            | 保留目标表，但不导入旧历史   | 新系统运行期自行生成 |
| `sys_logininfor` + `sys_oper_log`                                                                                                                | 平台日志           | `sys_logininfor` + `sys_oper_log` | 登录日志与操作日志                 | 保留目标表，但不导入旧历史   | 新系统运行期自行生成 |
| `sys_user`、`sys_role`、`sys_role_dept`、`sys_role_menu`、`sys_user_post`、`sys_user_role`、`sys_menu`、`sys_dept`、`sys_post`、`sys_config`、`sys_notice` | 旧平台组织、权限、配置与公告 | 无当前正式业务落点                         | NestJS 端改为重建用户、角色、菜单、权限模型 | 不按业务迁移处理       | 当前不迁入正式业务表 |
| `sys_dict_type` + `sys_dict_data`                                                                                                                | 旧平台字典          | 仅部分语义进入业务表，如 `material_category`  | 新架构尽量避免继续依赖平台字典存业务事实      | 仅按需要拆分承接       | 不是整表迁移     |
| `gen_table` + `gen_table_column`                                                                                                                 | 代码生成器元数据       | 无目标表                              | 不属于运行时业务事实                | 不迁             | 当前不迁       |
| `qrtz_*`                                                                                                                                         | Quartz 内部状态    | 无目标表                              | 新架构不继续保留 Quartz 内部库表      | 不迁             | 当前不迁       |

## 6. 哪些对象是重放/重建，不是复制

以下对象不能按 `INSERT ... SELECT * ...` 处理：

| 对象                                             | 原因                                                         | 当前承接方式                    |
| ---------------------------------------------- | ---------------------------------------------------------- | ------------------------- |
| `inventory_balance`                            | 新库以 `materialId + stockScopeId` 为唯一维度；旧库存是单维，且与“车间归属”不是同一语义 | 基于 admitted 业务单据重放        |
| `inventory_log`                                | 新库存流水需要统一 `businessDocumentType`、`operationType`、幂等键和逆操作语义 | 基于 admitted 业务单据重放        |
| `inventory_source_usage`                       | 旧 `inventory_used` 不能机械一对一回填，新模型要求消费行与来源流水精确对齐             | 按可证明关系转换；当前仍待补强           |
| `approval_document`                      | 新库只保留当前有效审核投影，不复制旧审核全过程                                    | 对需要审核的 admitted 单据重建投影    |
| `document_relation` / `document_line_relation` | 新关系模型比旧头表 `source_id/source_type` 更严格                      | 依据可证明证据恢复                 |
| `factory_number_reservation`                   | 旧 `saifute_interval` 混合了多类区间，不都属于 live reservation         | 按 `order_type` 分流，非目标部分归档 |
| `material_category`                            | 旧库没有独立分类表，分类挂在字典中                                          | 从字典拆分生成新表                 |
| `workshop.workshopCode`、`project.projectCode`  | 旧表没有稳定目标编码列                                                | 按确定性规则生成                  |

## 7. 哪些旧表没有目标落点，为什么

### 7.1 无正式业务落点

| 旧表                             | 原因                                     |
| ------------------------------ | -------------------------------------- |
| `gen_table`、`gen_table_column` | 代码生成器元数据，不属于运行时业务事实                    |
| 全部 `qrtz_*`                    | Quartz 内部状态，不再作为 NestJS 调度持久化模型        |
| `saifute_change_record`        | 新库没有对应的通用字段变更表，不能硬塞进业务表                |
| `saifute_inventory_warning`    | 新设计改为读视图 `vw_inventory_warning`，不保留交易表 |

### 7.2 目标表存在，但不等于导入旧历史

| 旧表组                                          | 原因                           |
| -------------------------------------------- | ---------------------------- |
| `sys_job`、`sys_job_log`                      | 目标表保留给 NestJS 新系统运行期，旧平台调度历史不导入 |
| `sys_logininfor`、`sys_oper_log`              | 目标表保留给 NestJS 新系统运行期，旧平台日志历史不导入 |
| `saifute_scrap_order`、`saifute_scrap_detail` | 已纳入迁移范围；当前源数据为 `0`，但迁移能力与 validate 口径已补齐，后续有新历史数据时可直接重跑 |

### 7.3 当前不进入新业务表

| 旧表组                                                                                   | 原因                                       |
| ------------------------------------------------------------------------------------- | ---------------------------------------- |
| `sys_user`、`sys_role`、`sys_role_dept`、`sys_role_menu`、`sys_user_post`、`sys_user_role` | NestJS 侧采用新的 `rbac` 实现，不把旧平台授权关系原样带入业务迁移 |
| `sys_menu`、`sys_dept`、`sys_post`、`sys_config`、`sys_notice`                            | 平台管理数据，不是当前业务事实迁移主线                      |
| `sys_dict_type`、`sys_dict_data`                                                       | 只按需要拆出业务事实；不是整表保留                        |

## 8. staged / archived / excluded 数据如何处理

`migration_staging` 不是失败垃圾箱，而是受控迁移层。它至少承接四类对象：

### 8.1 `map_*`

作用：保存旧主键到新主键、旧编码到新编码的稳定映射。

代表表：

- `map_material_category`
- `map_material`
- `map_customer`
- `map_supplier`
- `map_personnel`
- `map_workshop`
- `map_stock_in_order` / `_line`
- `map_sales_stock_order` / `_line`
- `map_workshop_material_order` / `_line`
- `map_project` / `_line`
- `map_factory_number_reservation`

### 8.2 `archived_field_payload`

作用：保存旧表中有业务参考价值、但新表没有直接字段落点的 payload，避免静默丢字段。

### 8.3 `pending_relations` / `archived_relations`

作用：

- `pending_relations`：当前证据不足，但未来可能恢复的关系
- `archived_relations`：当前确认无法恢复或不应进入 live relation 的关系证据

### 8.4 `archived_intervals`

作用：保存不进入 `factory_number_reservation` 的旧 `saifute_interval` 记录，避免把不兼容区间写进 live reservation。

### 8.5 `excluded_documents`

作用：保存当前无法安全进入正式业务表的旧单据头。它表达的是“已知不准入”，不是“处理失败重试池”。

当前最重要的 `excluded_documents` 例子：

- 一部分销售退货头
- 一部分入库头、出库头、领料头

## 9. cutover 口径：什么算 migrated，什么只算 replayed / archived / excluded / 未完成

### 9.1 可以算 `migrated`

满足以下条件的历史数据，才算正式迁移完成：

- 业务事实已进入目标业务表
- 必要的 mapping 已写入 `map_*`
- 需要的共享投影已经生成，或有明确的后续增强口径
- 没有依赖“猜测关系”或“凭名称硬匹配”才能成立

按当前证据，可以明确写成已进入正式表的包括：

- 主数据
- 入库家族的大部分记录
- 出库家族的大部分记录
- 领料家族的大部分记录
- 销售退货、退料 formal admission 已准入的正式行
- `project` 域全部 `5` 个项目和 `138` 条项目明细

### 9.2 只能算 `replayed`

以下对象即使目标表已有数据，也应写成“重放/重建”，不能写成“旧表已迁完”：

- `inventory_balance`
- `inventory_log`
- `inventory_source_usage`
- `approval_document`
- `document_relation`
- `document_line_relation`
- `factory_number_reservation`

### 9.3 只能算 `archived`

以下对象只表示“保留了历史证据”，不表示已进入正式业务模型：

- `archived_field_payload`
- `archived_relations`
- `archived_intervals`

### 9.4 只能算 `excluded`

以下对象表示当前不准入目标正式表：

- 一部分销售退货、入库、出库、领料头

### 9.5 不能直接按 `completed` 理解的对象

以下对象虽然目标侧已有表、已有能力或已有局部结果，但不能等同理解为“旧平台历史整体无差异迁完”：

- 历史 `sys_job` / `sys_job_log`：旧平台调度历史不导入，只保留新系统运行期表
- 历史 `sys_logininfor` / `sys_oper_log`：旧平台日志历史不导入，只保留新系统运行期表
- 整体平台层账号、角色、菜单、组织、配置数据：按新系统方案重建，不纳入旧历史业务导入
- `inventory_source_usage`、`document_relation`、`document_line_relation`：当前本地迁移完成口径接受目标表为 `0` 的受控留白，但线上切换前仍需结合追溯诉求重新复核

## 10. 线上迁移前仍需复核的事项与阅读边界

当前本地数据库迁移已完成，但如果后续要对线上库执行正式 cutover，仍应复核以下事项：

1. `inventory_source_usage`、`document_relation`、`document_line_relation` 当前仍为 `0`。
  本地迁移已按“业务事实准入 + 库存可重放 + validate 无 blocker”完成；如果线上切换要求完整来源追踪或上下游关系查询，需要先补齐证据恢复策略。
2. `excluded_documents` 非空的家族仍要做业务签收。
  本地迁移可以接受“受控排除 + 文档留痕”；线上 cutover 前要明确这些排除项是继续保留、人工补录，还是关账后放弃迁入。
3. 全局库存重放后存在 `230` 个负余额 bucket warning。
  当前解释是缺少期初库存或历史先后顺序漂移，local validate 将其视为 accepted warning；线上切换前应明确是否需要补录期初库存，或接受以当前余额起账。
4. 新库中已有 `sys_job`、`sys_job_log`、`sys_logininfor`、`sys_oper_log`，但它们属于 NestJS 新系统运行期表，不等于旧平台历史数据要迁入这些表。
5. 旧平台账号 / 权限 / 菜单 / 组织 / 配置 / 公告历史不属于本次正式业务导入边界；线上迁移时要单独准备新系统账号、角色、菜单与权限初始化方案。

阅读边界：

- 想看目标边界与模块职责，读 `00-architecture-overview.md`
- 想看业务流程与优化后表设计，读 `20-wms-database-tables-and-schema.md`
- 想看迁移运行时证据、批次状态、validate 细节，读 `docs/tasks/**` 与 `scripts/migration/reports/*.json`

## 11. 本地迁移经验总结：给后续线上迁移

### 11.1 已验证有效的做法

- 先冻结迁移边界，再写脚本。迁移单位应该是“业务事实 + 目标模型”，不是“旧表逐张复制”。
- 先迁主数据，再迁事务单据，最后统一做全局库存重放。库存余额和流水是共享副作用，不能在业务域只迁一半时提前生成。
- 把迁移结果明确分成 `migrated / replayed / archived / excluded / pending`，避免“写进库了就算完成”的假完成。
- 所有批次都坚持 `dry-run -> execute -> validate`，并保留 batch、mapping 和 validate report，确保可重跑、可对账、可解释。
- 对关键外键和库存语义坚持 deterministic mapping。像 `project_material.material_id` 这类关键字段，宁可自动补建并留痕，也不要 fuzzy matching。
- `migration_staging` 必须当成受控迁移层，而不是失败垃圾箱；`map_*`、`archived_*`、`pending_relations`、`excluded_documents` 都是 cutover 证据的一部分。
- 本地迁移能完成，不代表线上可直接照搬。线上新增的复杂度主要来自停写窗口、最终补跑、业务签收和回退预案。

### 11.2 本地经验对线上迁移的直接启发

| 线上课题 | 本地迁移给出的经验 | 线上建议 |
| --- | --- | --- |
| 数据冻结 | 本地库是静态数据，脚本结果稳定 | 线上必须先定义停写时间点，并在停写后做最后一次幂等补跑 |
| 幂等重跑 | 当前迁移依赖 batch、`map_*`、validate report 保证可复核 | 线上必须保持同样的 batch-owned rows / maps 口径，避免“补跑重复插入” |
| 库存重放 | 库存副作用必须在全域单据迁完后统一 replay | 线上不能边迁边重放；应在最终数据搬家完成后一次性 replay 并验数 |
| 负库存 warning | 本地接受了缺少期初库存导致的 `230` 个负余额 warning | 线上要提前决定是补录期初库存，还是接受以切换时余额为起点 |
| 排除项治理 | `excluded_documents` 可以让迁移先完成，再做受控签收 | 线上必须为每类 excluded 指定责任人和处置方式，不能把它们留成模糊尾项 |
| 平台数据切换 | 账号、角色、菜单、日志、调度不在旧历史业务导入主线 | 线上要把“业务数据迁移”和“新系统初始化”拆成两套 checklist 执行 |
| 上线信心 | 本地真实库验证能证明脚本逻辑，但不能替代生产演练 | 线上至少要对生产快照做一次全链路 rehearsal，再安排正式 cutover |

注：本节中的“负库存 warning”仅描述历史迁移 / replay 阶段对旧数据缺少期初库存时的受控观察结果，不代表当前正式业务口径；正式业务下，若要求完全可信的 FIFO 成本追溯，则仍以“先入后出、禁止负库存”为准。

### 11.3 推荐的线上 cutover 顺序

1. 先用线上库快照做一次全链路 rehearsal，确认 counts、`excluded_documents`、库存 replay、负库存 warning 和抽样单据都可解释。
2. 明确业务停写窗口、回退条件和责任人，特别是排除项、账号初始化和报表核对负责人。
3. 旧系统停写后，重跑一次幂等迁移脚本，把最后增量搬到新库。
4. 在最终业务数据到位后执行全局 `inventory replay`，再跑 validate。
5. 对关键域做抽样验收，并让业务签收 `excluded / archived / warning` 的最终口径。
6. 最后再开启 NestJS 新系统写入；如需回退，只回退流量，不回退已归档的迁移证据。
