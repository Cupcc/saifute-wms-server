# 月度对账 Phase 1 验收报告

## 元数据

| 字段 | 值 |
|------|------|
| 关联 spec | `docs/acceptance-tests/specs/monthly-reporting.md` |
| 关联 task | `docs/tasks/archive/retained-completed/task-20260411-0301-monthly-reporting-phase1-delivery.md` |
| 创建原因 | 冻结月度对账 `Phase 1` 修复 RBAC 漂移后的 full acceptance 证据 |
| 状态 | `passed` |
| 环境 | `.env.dev`; backend `http://127.0.0.1:8112`; web `http://127.0.0.1:5173`; agent-browser + live API |
| 时间 | `2026-04-11 09:04 CST` |

## 执行记录

- 先复核 review fix loop 后的自动化证据：
  - `bun run test -- src/modules/rbac/infrastructure/in-memory-rbac.repository.spec.ts src/modules/reporting/application/monthly-reporting.shared.spec.ts src/modules/reporting/application/monthly-reporting.service.spec.ts src/modules/reporting/infrastructure/reporting.repository.spec.ts`
  - `bun run test:e2e -- test/batch-d-slice.e2e-spec.ts`
  - `bun run typecheck`
  - `pnpm --dir web build:prod`
- 再复核 live 后端重启与 bootstrap repair：
  - `bun run dev:node` 重新拉起后端后，日志出现 `SystemManagementBootstrapService Repaired seed permission drift for monthly reporting baseline`。
  - `rd-operator` 登录返回的权限集中已包含 `reporting:monthly-reporting:view`，且不再包含 `reporting:export`。
  - `GET /api/auth/routes` 在 `rd-operator` token 下返回 `/rd/monthly-reporting`，组件为 `reporting/monthly-reporting/index`。
- live API 复核：
  - `GET /api/reporting/monthly-reporting?yearMonth=2026-04` 在 `admin` 与 `rd-operator` token 下均返回 `200`；`rd-operator` 响应过滤范围为 `stockScope = RD_SUB`。
  - `GET /api/reporting/monthly-reporting/details?yearMonth=2026-04&groupKey=OUTBOUND&keyword=XSTH` 返回 `XSTH20260410195443469`，并包含 `sourceBizMonth = 2026-04`、`sourceDocumentNo = CK20260410195409732`、`abnormalLabels` 合同。
  - `POST /api/reporting/monthly-reporting/export` 返回 `201`，响应头 `content-type = application/vnd.ms-excel; charset=utf-8`，导出内容与页面筛选一致。
- `agent-browser` 管理员 walkthrough：
  - 访问 `/reporting/monthly-reporting` 成功进入页面，页面显示 `导出 Excel` 按钮。
  - 汇总表展示 `总类 / 业务主题 / 单据数 / 数量 / 金额 / 成本 / 异常单据数 / 异常金额`；明细表展示 `异常标识 / 来源月份 / 来源单据` 等字段。
- `agent-browser` `RD_SUB` walkthrough：
  - 登录 `rd-operator / rd123456` 后，工作台菜单出现“月度对账”入口，点击后进入 `/rd/monthly-reporting`。
  - 页面可正常查看月度对账结果，`仓别` 控件保持禁用，且无 `导出 Excel` 按钮，符合只读范围隔离与导出权限设计。
- 历史阻塞说明：
  - 同日 `08:34` 的上一轮 full acceptance 因 live `.env.dev` 的 seed / role menu 漂移而失败，详情保留在 `docs/acceptance-tests/runs/run-20260411-0834-monthly-reporting-phase1.md`。

## 验收矩阵

| AC | 结论 | 关键证据 | 备注 |
|----|------|----------|------|
| AC-1 | `met` | `admin` 与 `rd-operator` 的 monthly summary API 均返回 `200`；shared/repository tests 覆盖 `Asia/Shanghai` 月边界 | 月度口径与角色范围合同同时成立 |
| AC-2 | `met` | 页面与 live summary 输出 `15` 个 topic catalog，覆盖冻结主题家族；未出现独立 `REVERSAL_*` | 当前 live 样本中“调整 / 协同”无非零值 |
| AC-3 | `met` | live detail query 返回 `sourceBizMonth / sourceDocumentNo / abnormalLabels`；页面明细表字段完整 | 单据头追溯合同成立 |
| AC-4 | `met` | 汇总 / 明细表已展示异常相关列；focused tests 与 e2e 覆盖跨月异常标签与业务时区逻辑 | live fixture 当前没有非空异常样本 |
| AC-5 | `met` | 管理员页面查看 + 导出成立；`rd-operator` 页面可达且无导出按钮；`/api/auth/routes` 输出 `/rd/monthly-reporting` | 查看、导出与隔离合同一致 |
| AC-6 | `met` | review fix loop、unit/e2e/typecheck/build、browser walkthrough、spec/run 证据齐全 | acceptance 证据完整 |

## 总结

- 建议：`accept`
- 残余风险：
  - live fixture 当前没有非空异常单据，异常展示的强证据仍主要来自 passing tests 与 e2e。
  - live 样本中“调整 / 协同”仍以零值为主，目录覆盖主要依赖 API 输出与 focused tests 证明。
