# 数据迁移：Java → NestJS

关联需求: `docs/requirements/req-20260321-1100-java-to-nestjs-data-migration.md`
关联任务: `docs/tasks/task-20260323-1530-migration-project-material-resolution-readiness.md`
阶段: 执行中
创建: 2026-03-21
最后更新: 2026-03-25

## 当前状况

Java 旧库（58 张表）向 NestJS 新库（25 张表）的全量业务域迁移。主数据、入库、出库、预留、车间领料、销售退货、车间退料、退货后处理等域已完成并有验证证据。当前 `project`（项目/研发）域已在真实数据上完成正式准入：`5` 个项目、`138` 条项目物料明细全部迁入 live，同时按稳定规则自动补建了 `126` 条 `AUTO_CREATED` 物料。`scrap`（报废）域虽然源数据为空，仍需补齐迁移能力。

## 待决策项

→ 详见 [decisions.md](decisions.md#pending)

当前无待决策项；最近已落地的关键决策是 `project` 域对“确无对应物料”的项目明细执行自动补建 `material`。

## 背景与上下文

### 迁移不是照搬

迁移目标不是把旧表逐表复制，而是按业务域保留仍有经营、库存、追溯价值的业务事实，在新库中找到正确落点。库存现值、流水、来源追踪等派生数据通过重放生成，不做直拷。

### Project 域的特殊性

`project` 域不是静态 BOM，而是带库存副作用的事务域。项目物料明细的 `material_id` 决定了库存扣减、日志追溯、来源关联等下游语义，映射错误会导致 BOM 成本失真和库存数据污染。因此采用严格的 deterministic 映射策略，宁可 pending 也不允许 fuzzy matching。

### 当前数据分布

- 旧库 `saifute_composite_product`: 5 行（5 个项目）
- 旧库 `saifute_product_material`: 138 行（项目物料明细）
- 已按现有主数据直接映射: 4 行（含原始 legacy `material_id` 与严格 `名称+规格+单位` 命中）
- 通过自动补建物料后准入: 134 行（归并为 `126` 条 `AUTO_CREATED` 物料）
- Pending: 0 行
- 结构性排除: 0 行

## 关键里程碑


| 时间    | 事件                             |
| ----- | ------------------------------ |
| 03-17 | 基础出库、预留、车间领料迁移完成               |
| 03-19 | 销售退货、车间退料 formal admission 完成  |
| 03-19 | 退货族 shared post-admission 迁移完成 |
| 03-21 | 全量迁移需求确认，project/scrap 纳入范围    |
| 03-23 | project 域三态 admission 实现完成     |
| 03-24 | project 域复审通过，人工确认模板导出         |
| 03-25 | project 域加入自动补建物料规则并完成真实数据重跑   |
| 待定    | scrap 域迁移能力补齐                  |
| 待定    | 全局 cutover 收口                  |


## 各域迁移进度


| 域                             | 状态           | 说明                                               |
| ----------------------------- | ------------ | ------------------------------------------------ |
| 主数据 (master-data)             | ✅ 完成         | 有验证证据                                            |
| 入库 (inbound)                  | ✅ 完成         | 有验证证据                                            |
| 基础出库 (customer-base)          | ✅ 完成         | 有验证证据                                            |
| 预留 (reservations)             | ✅ 完成         | 有验证证据                                            |
| 车间领料 (workshop-pick)          | ✅ 完成         | 有验证证据                                            |
| 销售退货 (sales-return)           | ✅ 完成         | 有验证证据                                            |
| 车间退料 (workshop-return)        | ✅ 完成         | 有验证证据                                            |
| 退货后处理 (return post-admission) | ✅ 完成         | 有验证证据                                            |
| 项目/研发 (project)               | ⚠ 已迁入，待切换确认  | 5 项目 / 138 行已准入；剩余 blocker 为 inventory replay 确认 |
| 报废 (scrap)                    | ○ 待补迁移能力     | 源数据为空，需补代码                                       |
| 库存重放                          | ○ 待全域完成后统一执行 |                                                  |
| 全局 cutover                    | ○ 待推进        |                                                  |


## 本文件夹资产索引


| 文件                                                                               | 用途                               |
| -------------------------------------------------------------------------------- | -------------------------------- |
| [decisions.md](decisions.md)                                                     | 决策日志（待决 + 已决）                    |
| [project-pending-material-explainer.md](project-pending-material-explainer.md)   | `project` 域自动补建物料规则、编码规则与当前结果说明  |
| [project-pending-material-template.csv](project-pending-material-template.csv)   | 残余 pending 行的人工处理模板；当前真实数据导出结果为空 |
| [project-pending-material-template.json](project-pending-material-template.json) | 模板的 JSON 格式（含指引和统计）；当前真实数据导出结果为空 |


