# RD 采购需求与主仓验收联动

关联需求: `docs/requirements/archive/retained-completed/req-20260328-1831-rd-procurement-main-acceptance-linkage.md`
关联任务: `docs/tasks/archive/retained-completed/task-20260328-1831-rd-procurement-main-acceptance-linkage.md`
阶段: 已完成并归档
创建: 2026-03-28
最后更新: 2026-03-29

## 当前状况

本工作流已完成“RD 采购需求 -> 主仓验收联动 foundation”这一切片：RD 采购需求现在是独立的真实上游业务事实，主仓验收可以直接搜索、选择并自动带出需求内容，同时仍被强约束为“先入主仓”，不会在验收时把库存直接写入 RD 小仓。

本轮交付刻意没有把 RD 物料独立状态链、小仓盘点 / 调整或最终 live smoke 混入同一切片；这些仍是后续 RD 工作的独立范围。当前 workspace 作为已完成切片的决策与状态摘要保留归档。

## 已收口事项

- 已新增 RD 采购需求页与后端真源模型，支持录入、列表、详情、作废。
- 已完成主仓验收页与 RD 采购需求的选择 / 自动带出 / 追溯联动。
- 已补上“关联后仍先入主仓”的硬约束与“累计验收量不得超过需求量”的保护。
- 已同步 RD / 主仓 / 系统管理侧的权限与前端路由可见性。
- 已完成 `prisma` / `swagger` / `typecheck` / 全量 Jest / 前端生产构建验证。

## 关键里程碑

| 时间 | 事件 |
|------|------|
| 2026-03-28 | 基于已归档 `RD handoff foundation`，确定下一切片聚焦“研发采购需求与主仓验收联动 foundation” |
| 2026-03-29 | 落地 RD 采购需求真源、主仓验收选择/带出联动、权限与前端入口 |
| 2026-03-29 | 修复 review 暴露的累计超量与搜索语义问题，完成 closing review 与全量验证 |

## 后续边界

- RD 物料独立状态链：未在本切片实现。
- RD 小仓盘点 / 库存调整：未在本切片实现。
- live smoke：继续按既定策略延后到 RD 全部切片完成后统一执行。
