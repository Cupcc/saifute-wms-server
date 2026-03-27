# Workspace Dashboard

> 最后更新: 2026-03-26

## 当前状态

`system-readiness` 已完成最终 `customer` / 销售域补齐并归档；当前活跃工作流仅剩 `rd-subwarehouse` 后续切片与 `monthly-reporting` 设计准备。

## 需要你确认的

当前无待确认项。

## AI 待办

| 优先级 | 任务                             | 状态       | 说明                                                                                                   |
| --- | ------------------------------ | -------- | ---------------------------------------------------------------------------------------------------- |
| 1   | rd-subwarehouse                | Slice 1 已完成，待后续切片 | 已完成研发独立工作台、固定仓别隔离、项目领用、本仓报废与研发侧报表基础；后续仍需主仓自动交接、研发采购链路与小仓盘点/调整；[详情](rd-subwarehouse/README.md) |
| 2   | monthly-reporting              | 需求已确认，待设计 | 已确认“全包含”指标与销售域口径、固定正式月报 + 人工重算 + 日期范围报表、系统查看 + Excel 导出，以及补录后重算且需保证追溯；[详情](monthly-reporting/README.md) |

## 活跃工作流

| 工作流                                                            | 阶段   | 健康度    | 简述                |
| -------------------------------------------------------------- | ---- | ------ | ----------------- |
| [rd-subwarehouse](rd-subwarehouse/README.md)                  | Slice 1 已完成 | ● 稳定   | 研发独立工作台、固定仓别隔离、项目领用、本仓报废与研发侧库存/报表基础已落地，后续能力待新切片 |
| [monthly-reporting](monthly-reporting/README.md)               | 需求已确认 | ● 稳定   | 5 项核心口径已确认，下一步进入详细设计与实施规划 |

## 已归档

| 工作流                                                                                       | 完成时间       | 简述                      |
| ----------------------------------------------------------------------------------------- | ---------- | ----------------------- |
| [system-readiness](archive/retained-completed/system-readiness/README.md)                 | 2026-03-26 | 最终 `customer` / 销售域缺口已关闭；首页、菜单、四个页面与关键动作入口均通过 fresh login 浏览器验证 |
| [outbound-customer-rename](archive/retained-completed/outbound-customer-rename/README.md) | 2026-03-26 | repo 内 `outbound` 兼容层已清理完成；工作流已归档 |
| [migration-java-to-nestjs](archive/retained-completed/migration-java-to-nestjs/README.md) | 2026-03-25 | 全域数据搬家 + 库存重放已完成；工作流已归档 |
