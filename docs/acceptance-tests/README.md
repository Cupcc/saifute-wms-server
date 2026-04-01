# Acceptance Testing Docs

`docs/acceptance-tests/**` 保存 full-mode 验收测试资产。这里的重点不是替代 task doc，而是在 task doc 内证据已经不够用时，提供可复用、可审计、可追溯的验收测试层。

当任务处于“AI 自主交付模式”时，这里的 `run` 不只是执行记录，也应直接承担“完整测试报告”职责，用来回答“需求到底有没有完成”。

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
  - 在 `full` 模式下，它也是本次交付的完整测试报告。
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
- 只要 agent 验收或测试需要真实浏览器操作，统一使用 `Agent Browser`；不要混用其他临时浏览器通道，避免执行证据与操作口径漂移。
- 需要实际操作步骤、证据写法或故障排查时，优先参考 `docs/playbooks/orchestration/agent-browser-reference.md`。
- 如果用户要求“完整测试报告”，默认通过 `runs/run-*.md` 交付，不另起一套平行格式。

## 最小覆盖基线

- `light` 模式：覆盖所有 in-scope `[AC-*]` 与关键风险点即可，通常留在 task doc。
- `full` 模式：至少覆盖所有 in-scope `[AC-*]`、受影响主流程、相关 `regression-critical` case，以及明确标记的 `high-risk` case。

## 完整测试报告最少应包含

- 报告范围：关联 requirement、task、spec、环境与待测版本
- 覆盖矩阵：每个 `[AC-*]` 对应哪些 case、证据类型与最终结论
- 环境准备：账号、数据、入口、依赖、开关、是否 ready
- 执行结果：逐 case 的预期、实际、证据与 pass/fail/blocked 结果
- 回归结果：自动化测试、静态检查、浏览器/手工验证、数据验证
- 缺陷与阻塞：未通过项、环境缺口、后续 owner
- 最终建议：`accept` | `reject` | `conditional` | `block`
- 残余风险：这次交付后仍明确存在但不阻断签收的风险

参考 SOP：`docs/playbooks/orchestration/ai-autonomous-delivery-sop.md`
