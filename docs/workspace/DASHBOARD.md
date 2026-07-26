# Dashboard

> 最后更新: 2026-07-09

## 当前状态

入库 Phase 2（FIFO + 来源成本）、基础数据 Phase 1、月度对账 Phase 1、销售项目 Phase 1/2、`rd-project` Phase 1-3、RD 小仓 Phase 1-6 均已交付。

2026-07-09 交付 RD 完善切片：主仓→RD 交接 UI（创建 / 作废）、回写退回库存结转（`RD_RETURN_OUT` / `RD_RETURN_IN`）、状态动作撤销、研发项目交接入 / 在库成本指标、报废 scope 显式化，以及配套清理；对抗性 review 与 live 验证进行中（见 `docs/tasks/task-20260709-rd-completion-slice.md`）。

## 需要你确认的

待确认：

- `docs/requirements/domain/ai-assistant-module.md`（其余领域需求文档均已 `confirmed`）

## AI 下一步

| 优先级 | 事项 | 指向 |
|---|---|---|
| 1 | 确认并冻结 `ai-assistant-module.md` 领域需求文档（其余 5 份已 confirmed） | `requirements/REQUIREMENT_CENTER.md` |
| 2 | 月度报表：Phase 1（F1-F5）已验收为基线，F6 正式月报冻结 / F7 日期范围报表未开始 | `requirements/domain/monthly-reporting.md` |
| 3 | 前端旧风格：F3-F4 待实现 | `requirements/domain/frontend-old-style-adaptation.md` |
| 4 | 系统管理：F5 运维邻接能力待定义 | `requirements/domain/system-management-module.md` |
| 5 | 基础数据：F9-F10 待实现 | `requirements/domain/master-data-management.md` |
