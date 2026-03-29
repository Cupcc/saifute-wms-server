# Workspace Dashboard

> 最后更新: 2026-03-29

## 当前状态

`migration-stage-planning` 仍在等待阶段拆分主轴确认；RD 的 `rd-procurement-main-acceptance-linkage` 已完成并归档，后续若继续推进 RD，应在新切片中继续保持“先连续完成 RD 切片，最后统一 smoke”的节奏。

## 需要你确认的

- `migration-stage-planning`: 请确认阶段划分更偏 `业务价值可见性` / `技术底座先行` / `需求确认→实现→验收` / `混合口径`。

## AI 待办

| 优先级 | 任务                             | 状态       | 说明                                                                                                   |
| --- | ------------------------------ | -------- | ---------------------------------------------------------------------------------------------------- |
| 1   | migration-stage-planning       | 等待用户输入 | 新工作流已创建并启用 `draft.md`；迁移范围与成功展示主受众已澄清，当前待确认阶段拆分主轴；确认后即可进入阶段拆解与展示模板头脑风暴；[详情](migration-stage-planning/README.md) |
| 2   | monthly-reporting              | 需求已确认，待设计 | 已确认“全包含”指标与销售域口径、固定正式月报 + 人工重算 + 日期范围报表、系统查看 + Excel 导出，以及补录后重算且需保证追溯；[详情](monthly-reporting/README.md) |

## 活跃工作流

| 工作流                                                            | 阶段   | 健康度    | 简述                |
| -------------------------------------------------------------- | ---- | ------ | ----------------- |
| [migration-stage-planning](migration-stage-planning/README.md) | 需求确认 | ○ 等待输入 | 目标是明确迁移开发阶段、每阶段的成功展示口径与后续沉淀方式；已启用 `draft.md` 沉淀脑暴与意图挖掘，当前等待用户确认阶段拆分主轴 |
| [monthly-reporting](monthly-reporting/README.md)               | 需求已确认 | ● 稳定   | 5 项核心口径已确认，下一步进入详细设计与实施规划 |

## 已归档

| 工作流                                                                                       | 完成时间       | 简述                      |
| ----------------------------------------------------------------------------------------- | ---------- | ----------------------- |
| [system-readiness](archive/retained-completed/system-readiness/README.md)                 | 2026-03-26 | 最终 `customer` / 销售域缺口已关闭；首页、菜单、四个页面与关键动作入口均通过 fresh login 浏览器验证 |
| [outbound-customer-rename](archive/retained-completed/outbound-customer-rename/README.md) | 2026-03-26 | repo 内 `outbound` 兼容层已清理完成；工作流已归档 |
| [migration-java-to-nestjs](archive/retained-completed/migration-java-to-nestjs/README.md) | 2026-03-25 | 全域数据搬家 + 库存重放已完成；工作流已归档 |
| [rd-subwarehouse-main-to-rd-handoff](archive/retained-completed/rd-subwarehouse-main-to-rd-handoff/README.md) | 2026-03-28 | 主仓到 RD 自动交接 foundation 已落地并 clean sign-off；当前作为 RD 后续切片的上游基线保留 |
| [rd-subwarehouse](archive/retained-completed/rd-subwarehouse/README.md)                   | 2026-03-28 | RD Phase 1 已归档为稳定基线；后续主仓到 RD 自动交接、采购链路、状态链与盘点/调整需另开新切片 |
| [rd-procurement-main-acceptance-linkage](archive/retained-completed/rd-procurement-main-acceptance-linkage/README.md) | 2026-03-29 | RD 采购需求真源与主仓验收联动 foundation 已落地；累计验收量保护、权限/入口与前后端联动已收口，live smoke 继续留待 RD 全切片完成后统一执行 |
