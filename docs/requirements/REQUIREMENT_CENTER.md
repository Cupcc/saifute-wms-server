# 需求中心

本文件只做索引看板。详细规则见 `docs/requirements/README.md`。

需求真源统一维护在 `topics/*.md`，不使用切片 `req-*.md`。

## 固定项目需求

| 需求文档 | 状态 | 说明 |
| --- | --- | --- |
| `PROJECT_REQUIREMENTS.md` | `confirmed` | 固定项目需求真源；核心需求已收敛为"清晰易维护的 NestJS WMS、贴合小型仓库场景、按业务域迁移、保证库存与追溯语义正确"，并补充真实环境、流程、统计口径（约 3 人、Excel + 手工记账、主仓 + 研发小仓是真实库存范围等长期口径）。 |

## 主题需求

| 需求文档 | 状态 | 说明 |
| --- | --- | --- |
| `topics/system-management-module.md` | `confirmed` | 系统管理模块主题真源；F4 `conditionally-accepted`（规范化落库完成，browser smoke 待补跑 `[ENV-GAP-1]`）；后续推进直接开 `task-*.md`。 |
| `topics/master-data-management.md` | `confirmed` | 基础数据管理主题真源；`Phase 1` 的 `F1`~`F8` 已完成并归档（`F4` 供应商 CRUD 保留为上游 accepted 基线，`task-20260402-1802` 完成 phase-level 收口）；后续仅剩 `F9/F10` 等后续阶段能力待推进。 |
| `topics/rd-subwarehouse.md` | `confirmed` | RD 小仓主题真源；Phase 1–5 能力已全部完成。 |
| `topics/inbound-business-module.md` | `needs-confirmation` | 入库业务模块主题真源；长期约束已沉淀，后续入库扩展从该 topic 开 task。 |
| `topics/monthly-reporting.md` | `confirmed` | 月度报表主题真源；口径已确认，实施路线图待开 task。 |
| `topics/frontend-old-style-adaptation.md` | `confirmed` | 前端旧风格回归主题真源；Phase 1-2 已完成，后续推进开新 task。 |

## 维护

- 新增主题时在表中添加行。
- 能力状态变更时更新 topic 文档与本表说明列。
- 历史溯源通过 `docs/tasks/archive/` 与 git log 查阅。
