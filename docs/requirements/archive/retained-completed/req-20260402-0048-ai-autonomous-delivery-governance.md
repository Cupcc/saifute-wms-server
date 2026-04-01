# AI 自主交付与完整测试报告规范

## Metadata

- ID: `req-20260402-0048-ai-autonomous-delivery-governance`
- Status: `confirmed`
- Lifecycle disposition: `retained-completed`
- Owner: `user`
- Delivery mode: `standard`
- Desired acceptance mode: `light`
- Related tasks:
  - `docs/tasks/archive/retained-completed/task-20260402-0048-ai-autonomous-delivery-governance.md`

## 用户需求

- [x] 把“AI 自主完成整个项目”的要求沉淀成仓库内可执行的标准流程。
- [x] 明确 requirement 应该怎么写，才能让 AI 不靠猜测推进。
- [x] 把“最终交付需要完整测试报告，用来判断需求是否完成”落成仓库模板与 SOP。

## 交付范围

- In scope:
  - 升级 requirement 模板与说明，使其支持 `[AC-*]`、证据类型与完成定义。
  - 升级 task / acceptance 文档协议，使“自主交付模式”默认走 `full` 验收。
  - 提供一份可复用的 AI 自主交付 SOP。
  - 让 acceptance run 模板可直接作为完整测试报告。
- Out of scope / non-goals:
  - 不改业务代码或模块运行时行为。
  - 不为历史已归档任务补写 acceptance run。
  - 不强制所有历史轻量任务 retroactively 升级为 `full`。

## 验收标准

- `[AC-1]` requirement 模板能明确表达范围、非目标、验收标准、证据类型与完成定义。
- `[AC-2]` task / acceptance 文档协议能明确“自主交付模式”的触发条件与默认 `full` 验收门槛。
- `[AC-3]` 仓库内存在一份 AI 自主交付 SOP，可指导后续新需求直接按该模式执行。
- `[AC-4]` acceptance run 模板可直接作为完整测试报告使用，而不需要另起平行格式。

## 验收证据要求

- `[AC-1]` 文档模板 diff 与模板内字段说明。
- `[AC-2]` `docs/tasks/**`、`docs/acceptance-tests/**` README / 模板更新。
- `[AC-3]` 新增 SOP 文档并被流程文档引用。
- `[AC-4]` `docs/acceptance-tests/runs/_template.md` 明确包含范围、覆盖矩阵、环境、执行结果与最终判定。

## 完成定义

- 本切片完成的标志是：仓库内模板、流程说明和 SOP 已同步更新，后续新需求无需额外口头解释即可按“自主交付 + 完整测试报告”开工。
- 若只有原则说明、没有仓库内模板与文档落地，不算完成。
- 若 acceptance run 仍不能承担完整测试报告职责，只能算“有条件通过”而非完成。

## 当前进展

- 阶段进度: 已完成本轮 docs 治理切片并归档。
- 当前状态: requirement / task / acceptance 模板、README 与 orchestration SOP 已同步升级；后续新切片可以直接按“自主交付模式”建档与验收。
- 验收状态: `验收通过`
- 阻塞项: None
- 下一步: None；后续如要把这套协议推广到具体业务主题，可从对应 `topics/*.md` 再开新切片。

## 待确认

- None
