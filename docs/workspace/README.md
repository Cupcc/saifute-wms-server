# Workspace

项目白板。人类打开看全局状态，AI 恢复上下文看下一步。

## 结构

```text
docs/workspace/
├── README.md        # 本文件
├── DASHBOARD.md     # 全局状态白板
└── notes/           # 探索笔记（临时）
    └── *.md         # 一个话题一个文件，无模板
```
`notes/` 存放跨对话的探索笔记，收敛后成果搬走、笔记标记为待删除。
不归档。历史在 git 里。

## notes/ 规则

- 一个主题一个文件，纯语义命名（如 `fifo-costing.md`）

```markdown
# title
**version**: v1.0 | **domain**: 关联领域（可选） | **status**: 探索中 / 已收敛

> 1～3句话的简介

（结构清晰、开发者易懂、表述不失专业性也不过度抽象，建议增加图表）
```

- `status: 已收敛` 表示成果已搬入 requirements 或 architecture，笔记可删
- 对话、草案存储落地点

## DASHBOARD.md 规则

三段式，从上到下：

1. **当前状态** — 一句话说清全局
2. **需要你确认的** — 阻塞 AI 继续推进的确认项，带链接指向 requirements 原文；无待确认时写"当前无待确认项"
3. **AI 下一步** — 按优先级列出可推进的事项，指向 requirements/domain 的具体能力项

每条一行。不展开细节、不讲故事、不做 trade-off 分析。
