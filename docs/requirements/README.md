# 需求文档说明

`docs/requirements/**` 用于保存面向用户的需求真源与简洁进展说明。这里记录“要做什么、为什么做、做到哪了”；详细执行方案、验证过程和 review 结论继续放在 `docs/tasks/*.md`。当任务进入验收阶段时，requirement 只保留聚合后的 `验收状态`，不承载详细测试证据。

## 目录职责

| 路径 | 作用 | 不写什么 |
| --- | --- | --- |
| `PROJECT_REQUIREMENTS.md` | 项目级、长期稳定、跨任务持续生效的需求与背景 | 单次切片交付、当前回合进展 |
| `topics/*.md` | 某个长期业务主题的约束、能力清单、阶段路线图 | 单次切片进展、执行日志 |
| `req-*.md` | 单次任务、切片或会话级需求，以及简洁 `当前进展` 与 requirement 级 `验收状态` | 长期主题边界、执行日志、详细测试步骤 |
| `REQUIREMENT_CENTER.md` | 需求索引看板 | 正文细节 |
| `_template.md` | `req-*.md` 模板 | 主题模板职责 |
| `topics/_template.md` | `topics/*.md` 模板 | 切片模板职责 |
| `archive/**` | 已闭环但需保留溯源的需求 | 活跃占位 |

默认不要混用：

- 项目长期需求，不写进 `req-*.md`。
- 主题级长期边界，不写进切片 `req-*.md`。
- 单次切片交付，不写进 `topics/*.md`。
- 单次任务进展，不写进 `PROJECT_REQUIREMENTS.md`。
- 详细执行计划、review 结论、验收步骤、浏览器实测记录，不写进 `docs/requirements/**`。
- 文档机制、归档规则、命名约定，统一写在本 `README.md`，不要分散写进需求正文。

## 目录布局

```text
docs/requirements/
├── PROJECT_REQUIREMENTS.md
├── REQUIREMENT_CENTER.md
├── README.md
├── _template.md
├── topics/
│   ├── _template.md
│   └── *.md
├── req-*.md
└── archive/
    ├── retained-completed/
    └── cleanup-candidate/
```

## 先判断写哪一层

- 如果这条需求会跨很多轮交付、长期生效，并影响多个主题，写进 `PROJECT_REQUIREMENTS.md`。
- 如果这条需求只属于某个长期业务主题，但会拆成多个阶段推进，写进 `topics/*.md`。
- 如果这条需求描述的是“本次要交付什么”，写进 `req-*.md`。
- 如果内容是在说明怎么做、怎么验、review 结论如何，不写进 requirement，写进 `docs/tasks/*.md` 或 `docs/acceptance-tests/**`。

## 每层怎么写

| 层级 | 重点 | 推荐模板 |
| --- | --- | --- |
| 项目级 | 长期背景、长期目标、统一业务口径 | 直接维护 `PROJECT_REQUIREMENTS.md` |
| 主题级 | 长期约束、能力清单、阶段路线图 | `topics/_template.md` |
| 切片级 | 本次交付范围、当前进展、聚合验收状态、待确认 | `_template.md` |

补充约束：

- `topics/*.md` 不写当前回合进展。
- `req-*.md` 不重新定义长期主题边界。
- 若切片属于已有长期主题，可在 Metadata 中补充 `Topic requirement` 指向 `topics/*.md`。

## 编写约定

- 全文用中文撰写；路径、文件名、 metadata 可保留英文。
- 内容保持简洁，优先把用户需求讲清楚，不擅自展开实现方案。
- `当前进展` 只写关键阶段状态，不写成长执行日志。
- `req-*.md` 建议固定使用 `用户需求`、`当前进展`、`待确认` 三段。
- `当前进展` 建议固定为 `阶段进度`、`当前状态`、`验收状态`、`阻塞项`、`下一步` 五行。
- `需求矩阵（可选）` 不是必填项；仅当某份切片文档需要作为后续工作的稳定基线时才保留。
- 若某个已归档切片文档仍承担后续切片复用的稳定基线，可保留必要的矩阵或边界说明；不要为了统一格式强行删空。

## 验收文档关系

- `none` 模式：requirement 只写 `验收状态: 已跳过` 或保持未进入验收，不创建独立验收资产。
- `light` 模式：详细验收证据通常留在 task doc 的 `## Acceptance`，requirement 只保留聚合结果。
- `full` 模式：详细验收证据主要留在 `docs/acceptance-tests/specs/**` 与 `docs/acceptance-tests/runs/**`，requirement 只保留聚合结果。
- requirement 的 `验收状态` 必须反映 linked tasks 的聚合结论，不能用某一个 task 的最后一次写入覆盖事实。

## 命名与模板

- 固定项目需求文档使用 `PROJECT_REQUIREMENTS.md`。
- 主题需求文档使用 `topics/<topic>.md`。
- 切片需求文档使用 `req-YYYYMMDD-HHMM-short-topic.md`。
- 新建主题需求优先使用 `topics/_template.md`；新建切片需求优先使用根目录 `_template.md`。
- 需求已闭环时允许写 `阻塞项: None`、`下一步: None / 归档 / 等待新需求`；不要为了套模板编造待确认项或假 blocker。

## 状态与生命周期

`Status` 表示交互状态：

- `needs-confirmation`：刚创建或刚实质改写，必须先给用户确认。
- `confirmed`：用户已明确确认，可作为后续规划与执行依据。
- `draft`：仅用于尚未整理成可发给用户确认的草稿。

`draft` 的边界：

- `req-*.md` 中的 `Status: draft` 只表示“文档本身还没整理好”，不是承载长期脑暴日志的地方。
- 用户与 AI 对话中产生的原始想法、意图假设、简洁留痕，优先写入 `docs/workspace/<workflow>/draft.md`。
- 只有当内容已经被整理成可直接发给用户确认的条目时，才进入 `req-*.md` 的 `用户需求` 或 `待确认`。

`Lifecycle disposition` 表示文件所处阶段，并与目录位置保持一致：

- `active`：文件位于 `docs/requirements/` 根目录，仍参与当前交互或执行。
- `retained-completed`：文件位于 `archive/retained-completed/`，需求已闭环但需保留溯源。
- `cleanup-candidate`：文件位于 `archive/cleanup-candidate/`，后续经用户确认后可删除。
- 若需求已客观完成且没有真实活跃 follow-up，不得继续留在根目录充当 resume 占位；应在同一轮同步归档 requirement、task、acceptance run、workspace。

## 使用流程

1. 先判断是否属于轻量直做。若需求清晰、范围很小、低风险、无需 durable handoff，可直接处理，不必强制创建 requirement 或 task 文档。
2. 若不属于轻量直做，先判断该需求属于项目级、主题级还是切片级，再定位文档。
3. 新建主题文档时，用 `topics/_template.md` 起稿；新建切片文档时，用根目录 `_template.md` 起稿。
4. 任务需求若尚未获用户确认，`Status` 设为 `needs-confirmation`；确认后改为 `confirmed`。
5. 在关键阶段推进、进入阻塞或准备结束当前回合前，同步简洁 `当前进展`。
6. 根据任务风险选择 `Acceptance mode: none | light | full`，并同步 requirement 侧 `验收状态`。
7. 需求闭环后优先归档而不是删除；归档时同步更新 `REQUIREMENT_CENTER.md`、相关 task 的 `Related requirement`，以及需求内的 `Related tasks`。
8. 恢复旧对话或处理 `continue` 时，先以 `REQUIREMENT_CENTER.md` 的 lifecycle 分类判断是否仍属活跃需求；归档需求默认只作溯源，不直接当作当前执行锚点。

## 与任务文档的关系

- `docs/tasks/*.md` 承接详细执行计划、验证过程、review 结论与 light-mode acceptance 记录。
- `docs/acceptance-tests/**` 承接 full-mode acceptance 的长期 specs 与单次 runs。
- 根目录活跃 `task-*.md` 应绑定仍存在且 `Lifecycle disposition = active` 的 `req-*.md`。
- 归档 task 若继续引用 requirement，应改为归档后的完整路径。
