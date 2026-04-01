# Acceptance Testing Docs

`docs/acceptance-tests/**` 保存 full-mode 验收测试资产。这里的重点不是替代 task doc，而是在 task doc 内证据已经不够用时，提供可复用、可审计、可追溯的验收测试层。

## 什么时候用

- `Acceptance mode = none`：不使用本目录。
- `Acceptance mode = light`：默认不使用本目录，优先把验收记录写在 task doc 的 `## Acceptance`。
- `Acceptance mode = full`：使用本目录，由 `acceptance-qa` 维护 spec 和 run。

## 目录布局

```text
docs/acceptance-tests/
├── README.md
├── specs/
│   ├── _template.md
│   └── *.md
└── runs/
    ├── _template.md
    └── run-*.md
```

## 两类资产

- `specs/**`
  - 长期维护的验收测试规格。
  - 回答“这个模块或这类需求应该怎么测”。
  - 适合模块级、主题级、跨任务复用的测试用例。
- `runs/**`
  - 某一次 task、发布或切片的执行记录。
  - 回答“这次具体测了哪些 case、结果如何、证据是什么”。
  - 适合留存具体执行基线与验收证据。

## 命名建议

- `specs/<module-or-topic>.md`
- `runs/run-YYYYMMDD-HHMM-<scope>.md`

## 关键规则

- `spec` 是长期资产，默认不随单个 task 归档。
- `run` 是一次执行记录，可跟随 task 生命周期归档。
- `full` 模式下，run 必须冻结 `Selected Case Snapshot`，不能只引用一个会继续演化的 spec。
- 环境不就绪时，将 run 标记为 `blocked`，并记录 `environment-gap`，不要误判成实现缺陷。
- case 选择必须满足最小覆盖基线，不能随意挑顺手的 case。

## 最小覆盖基线

- `light` 模式：覆盖所有 in-scope `[AC-*]` 与关键风险点即可，通常留在 task doc。
- `full` 模式：至少覆盖所有 in-scope `[AC-*]`、受影响主流程、相关 `regression-critical` case，以及明确标记的 `high-risk` case。
