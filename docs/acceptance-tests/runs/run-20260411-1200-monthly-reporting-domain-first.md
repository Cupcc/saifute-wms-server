# 月度对账 domain-first redesign focused 验证记录

## Metadata

- 时间：`2026-04-11 12:00 CST`
- 关联 task：`docs/tasks/task-20260411-1105-monthly-reporting-domain-first-redesign.md`
- 关联 spec：`docs/acceptance-tests/specs/monthly-reporting.md`
- 环境：`local workspace`
- 验证面：`focused automated evidence`
- 当前结论：`passed-with-browser-pending`

## 本次验证范围

- 把月度对账从旧的“总类 / 主题”切法重构为：
  - `总入 / 总出 / 净发生`
  - `领域汇总`
  - `业务操作汇总`
  - `车间汇总`
  - `销售项目汇总`
  - `研发项目汇总`
  - `主仓到RD交接汇总`
  - `单据头明细`
- 页面和导出的用户可见名称统一为业务实际名称，例如：
  - `领料 / 退料 / 报废`
  - `销售出库 / 销售退货`
  - `主仓到RD交接`

## 执行命令

```bash
bun run test -- src/modules/reporting/application/monthly-reporting.shared.spec.ts src/modules/reporting/application/monthly-reporting.service.spec.ts src/modules/reporting/infrastructure/reporting.repository.spec.ts
bun run typecheck
pnpm --dir web build:prod
bun run test:e2e -- test/batch-d-slice.e2e-spec.ts
```

## 结果

- `unit`：通过
  - 新增 / 更新断言覆盖 `domainCatalog / topicCatalog / workshopItems / salesProjectItems / rdProjectItems / rdHandoffItems`
  - 继续覆盖 `sourceBizMonth / sourceDocumentNo / abnormalLabels`
- `typecheck`：通过
- `web build`：通过
- `e2e`：通过
  - 现有 `batch-d-slice` 回归未被 redesign 打断

## 结论

- 后端与前端合同已经切到“领域优先”。
- 导出与明细字段已经同步到新口径。
- 当前还缺一轮 redesign 后页面结构的独立浏览器 acceptance，因此本次 run 不直接给出 `accepted`，而是保留为 `passed-with-browser-pending`。
