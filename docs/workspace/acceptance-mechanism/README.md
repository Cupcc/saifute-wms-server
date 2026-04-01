# 验收机制设计

关联需求: 无（机制设计阶段，确认后视需要创建 requirement）
关联任务: 无（draft 确认后再创建 task 落地）
阶段: 待落地
创建: 2026-04-01
最后更新: 2026-04-01

## 当前状况

draft 已收口到 v1.9。当前设计按最佳实践明确采用三层文档：`requirement docs`、`task docs`、`acceptance testing docs`。其中第三层进一步拆为长期维护的 `specs` 和按 task / 发布执行的 `runs`。新增角色统一命名为 `Acceptance QA / acceptance-qa`，负责测试设计、上线前验收测试、浏览器实测和验收文档回写，但不修改业务代码。v1.9 进一步把机制改成“硬护栏 + 默认路径 + 验收强度分级”，不再把所有任务都压进同一条 full QA 流程。

## 待决策项

当前无待决策项。详见 [draft.md § 已确认决策](./draft.md#9-已确认决策) 与 [draft.md § 落地文件清单](./draft.md#11-落地文件清单)。

## 草稿入口

[draft.md](./draft.md) — 验收机制 v1.9 设计草案。若无异议，可直接据此落地。

## 背景与上下文

- 灵感来源: 软件工程中的 Verification vs Validation 分离原则
- 当前流程的三个角色定义在 `.cursor/agents/` 下
- 模板和工作流规则在 `docs/tasks/README.md` 和 `docs/requirements/README.md`

## 关键里程碑

| 时间 | 事件 |
|------|------|
| 2026-04-01 | 用户提出验收机制需求 |
| 2026-04-01 | draft v1 完成 |
| 2026-04-01 | 明确“可写”是写验收文档，不是改代码 |
| 2026-04-01 | 按最佳实践引入第三层 `acceptance testing docs` |
| 2026-04-01 | 将角色统一命名为 `Acceptance QA / acceptance-qa` |
| 2026-04-01 | 将测试资产拆分为长期维护的 `specs` 和按次执行的 `runs` |
| 2026-04-01 | 补入 requirement 聚合、run 基线冻结、`environment-gap` / `blocked`、最小覆盖规则 |
| 2026-04-01 | 引入“硬护栏 + 默认路径 + `none | light | full`”的分层设计 |
| 2026-04-01 | draft 收口为 v1.9 |

## 本文件夹资产索引

| 文件 | 用途 |
|------|------|
| README.md | 工作流入口与状况概述 |
| draft.md | 验收机制 v1.9 设计草案 |
