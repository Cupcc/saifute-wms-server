# 月度对账 Phase 1 验收报告

## 元数据

| 字段 | 值 |
|------|------|
| 关联 spec | `docs/acceptance-tests/specs/monthly-reporting.md` |
| 关联 task | `docs/tasks/archive/retained-completed/task-20260411-0301-monthly-reporting-phase1-delivery.md` |
| 创建原因 | 冻结月度对账 `Phase 1` full acceptance 证据与 live 环境阻塞现状 |
| 状态 | `failed` |
| 环境 | `.env.dev`; backend `http://127.0.0.1:8112`; web `http://127.0.0.1:5175`; agent-browser + live API |
| 时间 | `2026-04-11 08:34 CST` |

## 执行记录

- 复核用户提供的 passing 自动化证据：
  - `bun run test -- src/modules/reporting/application/monthly-reporting.shared.spec.ts src/modules/reporting/application/monthly-reporting.service.spec.ts src/modules/reporting/infrastructure/reporting.repository.spec.ts`
  - `bun run test:e2e -- test/batch-d-slice.e2e-spec.ts`
  - `bun run typecheck`
  - `pnpm --dir web build:prod`
- live API 复核：
  - `POST /api/auth/login` 登录 `admin / admin123` 成功，`GET /api/reporting/monthly-reporting?yearMonth=2026-04` 返回 `200`，`topicCatalog` 数量为 `15`，一级目录包含 `入库 / 出库 / 消耗`。
  - `GET /api/reporting/monthly-reporting/details?yearMonth=2026-04&groupKey=OUTBOUND&keyword=XSTH` 返回 `200`，命中 `销售退货单 XSTH20260410195443469`，且包含 `sourceBizMonth = 2026-04`、`sourceDocumentNo = CK20260410195409732`。
  - `GET /api/reporting/monthly-reporting/details?yearMonth=2026-04&abnormalOnly=true` 返回 `200`，但 live fixture 中无异常样本，结果 `0` 条。
  - `POST /api/reporting/monthly-reporting/export` 发送 `{ yearMonth: "2026-04", groupKey: "OUTBOUND", keyword: "XSTH" }` 返回 `201`，响应头 `content-type = application/vnd.ms-excel; charset=utf-8`、`content-disposition = attachment; filename="monthly-reporting-2026-04.xls"`；响应文本包含 `销售退货 / XSTH20260410195443469 / CK20260410195409732`，且不包含 `销售出库`，说明导出与筛选合同一致。
- `agent-browser` 管理员 walkthrough：
  - 访问 `/reporting/monthly-reporting` 成功进入页面，顶部筛选包含 `月份 / 仓别 / 车间 / 总类 / 业务主题 / 异常单据 / 关键字`。
  - 汇总表展示 `总类 / 业务主题 / 单据数 / 数量 / 金额 / 成本 / 异常单据数 / 异常金额`；明细表展示 `异常标识 / 来源月份 / 来源单据` 等差异定位字段。
  - 页面当前 live 数据样本中，所有汇总项的 `异常单据数 / 异常金额` 为 `0 / 0.00`，异常路径由 passing tests 补证。
- `RD_SUB` 角色复核：
  - `rd-operator` 登录返回的 reporting 权限仅包含 `reporting:home:view / reporting:inventory-summary:view / reporting:material-category-summary:view / reporting:export`，缺少 `reporting:monthly-reporting:view`。
  - `GET /api/reporting/monthly-reporting?yearMonth=2026-04` 在 `rd-operator` token 下返回 `403 当前用户缺少所需权限`。
  - 浏览器访问 `/rd/monthly-reporting` 落入前端 `404`，且 `RD_SUB` 控制台菜单未出现“月度对账”入口。

## 验收矩阵

| AC | 结论 | 关键证据 | 备注 |
|----|------|----------|------|
| AC-1 | `partially-met` | admin live summary `200` 且返回月度汇总；`rd-operator` live summary `403` | 统计口径存在，但角色范围不完整 |
| AC-2 | `met` | 页面与 live summary 均输出两层目录；未暴露独立 `REVERSAL_*` 主题 | “调整 / 协同”在当前 live 样本中无非零值 |
| AC-3 | `met` | live detail query 命中 `XSTH20260410195443469`，返回 `quantity / amount / cost / sourceBizMonth / sourceDocumentNo` | 关键字筛选与明细合同成立 |
| AC-4 | `met` | 汇总 / 明细表均暴露异常相关列；passing tests/e2e 已覆盖 `abnormalLabels / sourceBizMonth / sourceDocumentNo` 与业务时区月边界异常判断 | live fixture 当前没有非空异常样本 |
| AC-5 | `partially-met` | admin 页面查看与导出成立；`rd-operator` 页面入口缺失且 API `403` | 小仓隔离查看合同未成立 |
| AC-6 | `not-met` | 自动化证据与 live `.env.dev` 角色行为不一致 | full acceptance 无法给出 `accepted` 结论 |

## 总结

- 建议：`reject`
- 残余风险：
  - 当前最新运行代码在 live `.env.dev` 中未给 `rd-operator` 授予 `reporting:monthly-reporting:view`，导致 `RD_SUB` 完全无法查看月度对账。
  - 自动化 e2e 已覆盖 `RD_SUB` 范围合同，但 live 权限集与 e2e/stub 真源发生漂移；在该漂移被消除前，不应将 `Phase 1` 标记为最终签收。
