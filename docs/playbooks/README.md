# Playbooks

本目录按主题记录任务执行中的可复用经验。

Playbooks 介于冻结规则（`rules/*.mdc`）和单次任务文档（`docs/tasks/*.md`）之间。这里记录的是已经有复用价值、但还没有固化成规则的做法。

## 知识分层 (knowledge ladder)

```
rules/*.mdc                      L4  冻结规则 (frozen constraints)
.codex/skills/*/SKILL.md         L3  结构化技能 (structured skills)
docs/playbooks/*/playbook.md     L2  主题经验 (domain experience)
docs/playbooks/*/*.ts|sh         L2  复用脚本 (reusable scripts)
docs/tasks/*.md                  L1  任务运行态 (task runtime state)
```

## 辅助上下文层 (supporting context layers)

```
docs/workspace/**                决策工作区 (decision workspace)
docs/requirements/*.md           需求文档 (requirements)
```

这些目录不属于上面的“知识分层”，因为它们不表示经验成熟度；但在编排和执行任务时，经常要一起看。

## 机器检索层 (machine retrieval)

```text
docs/catalog/catalog.jsonl         统一知识索引 (machine retrieval index)
docs/catalog/README.md             索引字段、命中规则和 miss 修复流程
scripts/knowledge/search-doc-catalog.mjs  本地 catalog 检索工具
```

`playbook.md` 继续承担人类可读正文；`docs/catalog/catalog.jsonl` 负责机器命中。不要把长文经验直接改写成纯 JSONL，也不要只维护正文不维护索引。

编辑约定：

- 改动 `playbook.md` 条目时，同一轮同步更新 `docs/catalog/catalog.jsonl`
- 所有新条目都要有稳定 ID，例如 `DR-001`、`ORCH-002`
- agent 先查 `catalog.jsonl`，命中后再打开具体正文，不直接全文乱搜

## 相关参考层 (reference layers)

- `docs/dependencies/`：外部库版本、API 和弃用信息 (deprecation notes)
- `docs/architecture/`：模块边界、业务流程和 schema 设计
- `docs/workspace/`：决策工作区，见 `docs/workspace/README.md`

## 目录结构 (layout)

每个主题单独建目录。先写 `playbook.md`；当某个检查或操作重复出现 2 次以上，再提炼成脚本。

```text
docs/playbooks/
├── README.md                          # 本说明
├── browser/
│   ├── playbook.md
│   └── ...
└── <domain>/
    ├── playbook.md
    └── ...
```

## 条目格式 (entry format)

Playbook 条目默认使用中文。命令、路径、代码标识和外部系统原文名称可以保留原文。能自然翻译的术语，优先写成“中文 (english)”；不适合翻译的专有名词，直接保留英文。

`playbook.md` 条目默认使用下面这套结构：

```markdown
## PB-001 short title

> 用 1 到 2 句话说明这条经验解决什么问题，读者要不要继续往下看

**场景**: 发生了什么
**结论**: 从这件事里得出了什么判断
**做法**: 下次可以直接复用的动作
**成熟度**: 初步观察 | 已验证 ✓ | 已提升到 rules/xxx.mdc
```

`Source task` 和日期都不是默认字段。Playbooks 记录的是经验本身，不是任务来源索引，也不是时间线。只有当来源会影响理解时，才在“场景”里补一句相关任务或上下文；真要追溯时间，直接看 git history。

编辑建议：标题下面的 `>` 只写一两句。先把结论说清楚，再决定读者要不要继续看。后面的“场景 / 结论 / 做法”不是机械必填；如果两段内容重复，可以合并或省略，优先保证好读、好扫。

## 条目 ID 与 catalog 索引

稳定 ID 是 Playbook 的机器锚点。每个可复用条目都应满足：

- Markdown 标题使用稳定 ID：`## DR-001 ...`
- `docs/catalog/catalog.jsonl` 里有对应 `id`
- `source_path + source_heading` 能跳回正文
- `keywords`、`tags`、`audiences`、`stages`、`surfaces` 足够支持低成本命中

如果条目正文更新到已经改变检索语义，也要同步补关键词，而不是只改正文标题。

## 脚本约定 (script conventions)

- 脚本放在所属主题的 `playbook.md` 同目录下。
- 它们是辅助工具，不是项目运行时依赖；`docs/playbooks/` 不应进入应用的 import graph。
- 文件开头加一行使用说明，例如：`// Usage: npx tsx docs/playbooks/<domain>/check-foo.ts [args]`
- 尽量保持自包含，减少对 `src/` 的直接依赖。

## 生命周期 (lifecycle)

```text
任务执行中发现一个可复用的模式
       ↓
  先写进 docs/playbooks/{domain}/playbook.md（成熟度：初步观察）
       ↓  同一个检查或动作重复出现 2 次以上
  再提炼成 docs/playbooks/{domain}/*.ts 脚本
       ↓  后续任务继续验证这条经验
  把成熟度更新为“已验证 ✓”
       ↓  经验已经足够稳定，适合结构化复用
  提升到 .codex/skills/{domain}/SKILL.md（skill 可以引用 playbook）
       ↓  单条经验已经冻结，而且适合跨任务通用
  提升到 rules/*.mdc
  并把条目标记为“promoted → rules/xxx.mdc”
```

## 什么时候写 (when to write)

通常在任务完成后的复盘阶段 (retrospect) 补写 Playbook；当然，任何时候手动补充也可以。

下面这些情况值得写：

- 一个不明显的模式导致了成功或失败
- 同一个根因触发了 2 次以上评审到修复 (review → fix) 循环
- 很晚才暴露出验证缺口
- 编排或子代理协作 (subagent coordination) 问题被真正解决了

下面这些情况不要写进 Playbook：

- 明显、而且已有成熟文档的库行为（写进 `docs/dependencies/`）
- 一次性任务状态（写进 `docs/tasks/`）
- 已经冻结的架构约束（放在 `docs/architecture/` 或 `rules/`）

## 如何发现 (discovery)

所有任务都应先做一次低成本 catalog lookup，再决定打开哪些正文。

默认流程：

1. `orchestrator` 先运行 `node ./scripts/knowledge/search-doc-catalog.mjs --query "..." --agent orchestrator --stage discovery`
2. 命中后只打开 top `1~5` 条相关正文，不全文乱搜
3. 如果流程里有 `planner`，把命中的 refs 交给 `planner`
4. 如果简单任务跳过 `planner`，直接把 refs 交给 `coder`
5. `code-reviewer` 和 `acceptance-qa` 可以在已有 refs 基础上做阶段性窄检索
6. agent 输出里记录 `Referenced Docs`

如果任务后来证明“应该命中但没命中”，不要只怪执行 agent，要回到 `docs/catalog/catalog.jsonl` 调查并修复：

- `catalog_missing`：索引里根本没有对应条目
- `metadata_weak`：条目有，但关键词、标签、surface 太弱
- `routing_wrong`：命中了，但没有被分发给正确角色
