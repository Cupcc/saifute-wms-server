# Knowledge Catalog

`docs/catalog/catalog.jsonl` 是仓库的统一知识检索索引。它不替代正文文档，只负责让 agent 先低成本命中，再按角色打开最相关的正文。

## 目标

- 让所有任务都先做一次 cheap lookup，而不是靠记忆或全文乱搜
- 把命中的知识 refs 交给最合适的角色，而不是让每个 agent 重新摸索
- 让 miss 可以被诊断和修复，而不是长期重复犯同样的错误

## 真源关系

- 更新正文时，如果条目会影响命中语义，必须同轮更新 catalog

## 检索流程

1. `orchestrator` 先运行一次 catalog lookup
2. 只打开命中的 top `1~5` 条正文
3. 如果流程里有 `planner`，把 matched refs 交给 `planner`
4. 如果跳过 `planner`，把 matched refs 直接交给 `coder`
5. `code-reviewer` / `acceptance-qa` 在已有 refs 不够时，再做阶段性窄检索
6. 每个 agent 在输出里记录 `Referenced Docs`

推荐命令：

```bash
node ./scripts/knowledge/search-doc-catalog.mjs \
  --query "用户请求或当前 scope" \
  --agent orchestrator \
  --stage discovery \
  --surface prisma/schema.prisma \
  --limit 5
```

## JSONL 结构

每一行代表一个可检索知识条目，可以是整篇参考文档，也可以是某个 playbook 条目。

必备字段：

- `id`: 稳定 ID，例如 `DR-001`
- `doc_type`: `playbook | requirements | architecture | acceptance | dependency | task | meta`
- `topic`: 主题归类
- `title`: 展示标题
- `summary`: 给 agent 的短摘要
- `keywords`: 自然语言检索词
- `tags`: 规范化标签
- `audiences`: 适用角色，如 `orchestrator`、`planner`、`coder`
- `stages`: 适用阶段，如 `discovery`、`planning`、`implementation`
- `surfaces`: 典型改动面、路径或语义入口
- `when_to_read`: 命中后应该去读的场景
- `source_path`: 正文路径
- `source_heading`: 正文标题锚点，没有则填 `null`
- `maturity`: `canonical | reference | initial_observation | validated`

示例：

```json
{
  "id": "DR-001",
  "doc_type": "playbook",
  "topic": "domain-refactor",
  "title": "动 schema 后先 generate 再继续写代码",
  "summary": "修改 prisma/schema.prisma 后必须先刷新 generated client，再继续改 repository/service/controller。",
  "keywords": ["prisma", "schema", "generate", "字段删除"],
  "tags": ["schema_change", "contract_change"],
  "audiences": ["orchestrator", "planner", "coder", "code-reviewer"],
  "stages": ["discovery", "planning", "implementation", "review"],
  "surfaces": ["prisma/schema.prisma", "src/generated/prisma/**"],
  "when_to_read": ["schema changed", "field removed"],
  "source_path": "docs/playbooks/domain-refactor/playbook.md",
  "source_heading": "DR-001 动 schema 后先 generate 再继续写代码",
  "maturity": "initial_observation"
}
```

## Miss 分类

当任务后来证明“应该命中但没命中”，复盘时按这 3 类归因：

- `catalog_missing`: 经验或参考文档没有被建索引
- `metadata_weak`: 条目存在，但关键词、标签、stage 或 surface 太弱
- `routing_wrong`: 条目命中了，但没有被交给正确角色

复盘修复顺序：

1. 补或修 `docs/catalog/catalog.jsonl`
2. 必要时补正文里的稳定 ID、标题或摘要
3. 如果问题在角色分发，再修 `.codex/skills/**` 或 `.codex/agents/**`

## 维护规则

- 优先索引高频、高价值、能显著改变执行路径的文档
- 一个条目只描述一个清晰经验或一个清晰参考入口
- 不要把一次性任务运行态直接塞进 catalog，除非它是稳定入口，比如 `TASK_CENTER.md`
- 当某条经验成熟后升到更高等级的规则或技能时，保留 catalog 条目，但把 `maturity` 更新为更高等级
