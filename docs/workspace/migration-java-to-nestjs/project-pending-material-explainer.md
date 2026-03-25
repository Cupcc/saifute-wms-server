# `project` 自动补建物料说明

## 一句话结论

`project` 域已经不再因为“找不到对应物料”而卡在人工 backlog。

现在的规则是：

- 若项目明细能直接映射到已迁入的 `material`，就直接复用
- 若按 `material_name + specification + unit` 能唯一命中现有目标物料，也直接复用
- 若确认没有对应目标物料，则按稳定规则自动生成 `materialCode` 并补建 `material`
- 只有真正缺少关键证据或出现多候选歧义时，才继续保留为 `pending`

在当前真实数据上，`project` 域已经全部准入 live，没有残余 pending 行。

## 当前真实数据结果

| 项目 | 数量 |
| --- | --- |
| 旧项目头 `saifute_composite_product` | `5` |
| 旧项目行 `saifute_product_material` | `138` |
| live `project` | `5` |
| live `project_material_line` | `138` |
| 自动补建 `AUTO_CREATED` 物料 | `126` |
| `pending_relations` | `0` |
| 结构性排除项目 | `0` |

对应验证证据见：

- `scripts/migration/reports/project-execute-report.json`
- `scripts/migration/reports/project-validate-report.json`

## 为什么是 126 条自动补建物料，不是 134 条

因为自动补建不是“每行新建一条物料”，而是先按稳定键分组：

- 分组键：`normalize(material_name) + normalize(specification) + normalize(unit)`
- 同一个稳定键，只补建一条 `material`
- 多条项目明细如果文本归一化后完全一致，会复用同一条自动补建物料

所以：

- 原先待决的 `134` 条明细里，有一部分会合并到同一物料
- 最终真实数据只需要补建 `126` 条 `material`

## 自动补建规则

### 1. 什么时候触发

仅在下面条件同时满足时触发：

- 项目行本身结构合法
- 现有主数据映射无法确定目标 `material.id`
- 按严格 `名称 + 规格 + 单位` 在目标物料中也找不到唯一可复用对象
- 业务口径允许“确无对应物料时自动补建”

### 2. 生成什么编码

自动补建物料的编码格式为：

`MAT-PROJECT-AUTO-L<代表行legacyId>-<hash>`

例子：

- `MAT-PROJECT-AUTO-L13-B4DE5748`
- `MAT-PROJECT-AUTO-L24-F29CC24D`

其中：

- `L<代表行legacyId>` 用于保留来源可追溯性
- `<hash>` 来自稳定键哈希，保证编码稳定且避免碰撞

### 3. 谁是“代表行”

同一稳定键分组后，取该组中最早的项目行 `legacyId` 作为代表行。

这样可以保证：

- 同一批源数据多次重跑时，编码稳定
- 同组多行不会重复造出多个 `materialCode`

## 补建后的物料如何留痕

自动补建的 `material` 会写入：

- `creationMode = AUTO_CREATED`
- `sourceDocumentType = ProjectAutoCreatedMaterial`
- `sourceDocumentId = <代表行legacyId>`

同时，`migration_staging.archived_field_payload` 还会保存：

- 代表行是谁
- 该物料由哪些项目行归并而来
- 每条来源行的名称、规格、单位、数量、单价等证据

这保证了自动补建不是“静默造数”，而是可重跑、可审计、可回溯。

## 重跑时会不会重复插入

不会。

重跑逻辑会先读取已存在的 `ProjectAutoCreatedMaterial`：

- 如果同一稳定键对应的自动补建物料已经存在，就直接复用
- 不会为同一稳定键再次生成新编码
- writer 侧对 `material` 使用 upsert，因此是幂等的

## 这是否意味着允许 fuzzy matching

不是。

这里仍然没有放宽到模糊匹配或相似度匹配。

保留的原则是：

- 能直接证明是现有物料，就复用现有物料
- 不能证明是现有物料，但又明确没有对应物料，就新建一条带审计来源的物料
- 不会因为“看起来像”而把项目行硬挂到某条现有物料上

## `project-pending-material-template.*` 现在还有什么用

模板导出能力仍然保留，用于未来残余 pending 场景，例如：

- 行缺少关键字段，无法补建
- 同名同规格同单位出现多候选歧义
- 依赖基线异常，导致不能安全出计划

但在当前真实数据上：

- `project-pending-material-template.json`
- `project-pending-material-template.csv`

都已经导出为空结果，说明当前没有残余 pending backlog。

## 现在还剩什么 blocker

`project` 域当前剩余 blocker 已经不再是物料映射，而是：

- inventory replay 还未确认
- `scrap` 切片还未补齐
- 全局 cutover 还未完成最终收口

也就是说，`project` 这部分现在已经从“物料 backlog 阻塞”切换为“准入已完成，等待切换确认”。
