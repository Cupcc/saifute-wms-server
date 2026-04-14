# 月度对账（monthly-reporting）验收规格

## 元数据

| 字段 | 值 |
|------|------|
| 模块 | monthly-reporting |
| 需求源 | docs/requirements/domain/monthly-reporting.md |
| 最近更新 | 2026-04-11 |

## 能力覆盖

| 能力 | 说明 | 状态 |
|------|------|------|
| F1 | 本期发生金额月度口径 | `已验收` |
| F2 | 领域优先目录与业务汇总 | `待复核` |
| F3 | 领域汇总到单据头追溯 | `待复核` |
| F4 | 异常 / 跨月修正展示规则 | `已验收` |
| F5 | 仓库侧查看与导出 | `待复核` |

## F1-F5 总体验收摘要

- accepted 基线：`docs/tasks/archive/retained-completed/task-20260411-0301-monthly-reporting-phase1-delivery.md`
- 当前 redesign 任务：`docs/tasks/task-20260411-1105-monthly-reporting-domain-first-redesign.md`
- 验收模式：`full`
- 当前结论：`in_review`
- 理由摘要：
  - accepted `Phase 1` 基线已经证明月度对账的权限、导出、`RD_SUB` 范围隔离、异常标识与基础 live API 合同成立。
  - `2026-04-11` 新增的“领域优先”重切实现，已经把页面和导出从旧的“总类 / 主题”口径切成“总入 / 总出 / 净发生 -> 领域汇总 -> 业务操作汇总 -> 车间 / 销售项目 / 研发项目 / 主仓到RD交接汇总 -> 单据头明细”。
  - 这轮 redesign 的 focused 自动化证据已通过：shared/service/repository tests、e2e、`typecheck` 与 web build 全部通过。
  - 当前仍缺一轮基于 redesign 后页面结构的独立浏览器 acceptance，因此 `F2/F3/F5` 暂保持 `待复核`。

### 验证摘要

| 时间 | 关联 task | 环境 | 结果 |
|------|-----------|------|------|
| 2026-04-11 08:34 CST | `archive/retained-completed/task-20260411-0301-monthly-reporting-phase1-delivery.md` | `.env.dev`; backend `http://127.0.0.1:8112`; web `http://127.0.0.1:5175`; agent-browser + live API + focused automated evidence | `failed` |
| 2026-04-11 09:04 CST | `archive/retained-completed/task-20260411-0301-monthly-reporting-phase1-delivery.md` | `.env.dev`; backend `http://127.0.0.1:8112`; web `http://127.0.0.1:5173`; agent-browser + live API + focused automated evidence | `passed` |
| 2026-04-11 12:00 CST | `task-20260411-1105-monthly-reporting-domain-first-redesign.md` | local workspace; focused automated evidence (`unit + e2e + typecheck + web build`) | `passed-with-browser-pending` |

### 证据索引

| 执行面 | 证据文件/命令 | 结果 |
|--------|-------------|------|
| unit | `bun run test -- src/modules/reporting/application/monthly-reporting.shared.spec.ts src/modules/reporting/application/monthly-reporting.service.spec.ts src/modules/reporting/infrastructure/reporting.repository.spec.ts` | pass |
| e2e | `bun run test:e2e -- test/batch-d-slice.e2e-spec.ts` | pass |
| typecheck | `bun run typecheck` | pass |
| build | `pnpm --dir web build:prod` | pass |
| browser | `agent-browser` 管理员 walkthrough：`/reporting/monthly-reporting`（accepted `Phase 1` 基线） | historical pass |
| live API | `GET /api/reporting/monthly-reporting`、`GET /api/reporting/monthly-reporting/details`、`POST /api/reporting/monthly-reporting/export`（accepted `Phase 1` 基线） | historical pass |
| auth routes | `GET /api/auth/routes`（`rd-operator`）包含 `/rd/monthly-reporting`，权限为 `reporting:monthly-reporting:view` | historical pass |
| browser + live API | `rd-operator` 访问 `/rd/monthly-reporting`，页面可达、范围限定为 `RD_SUB`、且无导出按钮 | historical pass |
| acceptance run | `docs/acceptance-tests/runs/run-20260411-0834-monthly-reporting-phase1.md` | historical fail |
| acceptance run | `docs/acceptance-tests/runs/run-20260411-0904-monthly-reporting-phase1.md` | historical pass |
| acceptance run | `docs/acceptance-tests/runs/run-20260411-1200-monthly-reporting-domain-first.md` | focused pass; browser pending |

## F1 本期发生金额月度口径

### 验收矩阵

| AC | 描述 | 结论 | 执行面 | 关键证据 | 备注 |
|----|------|------|--------|----------|------|
| AC-1 | 系统按 `bizDate + 自然月` 统计仓库侧本期发生金额，并支持按月、仓别、车间、领域、操作过滤 | `met` | unit + e2e + typecheck | shared/repository tests 覆盖业务时区月边界；service tests 断言 `totalInAmount / totalOutAmount / totalTransferAmount / netAmount`；typecheck 通过 | redesign 后统计口径与 accepted 基线一致 |

### 残余风险

- redesign 后尚未重新做 live browser 验证，但自动化证据已覆盖核心聚合合同。

## F2 领域优先目录与业务汇总

### 验收矩阵

| AC | 描述 | 结论 | 执行面 | 关键证据 | 备注 |
|----|------|------|--------|----------|------|
| AC-2 | 页面与导出先按领域组织，再展示业务操作与车间 / 销售项目 / 研发项目 / 主仓到RD交接汇总，且不把技术逆操作暴露为独立主题 | `partially_met` | unit + build | service tests 已断言 `domainCatalog / topicCatalog / workshopItems / salesProjectItems / rdProjectItems / rdHandoffItems` 合同；web build 通过；需求文档已切到领域优先 | redesign 后页面结构尚缺独立 browser walkthrough |

### 残余风险

- 当前主要依赖 focused 自动化证据证明页面结构与导出合同，浏览器侧未复走。

## F3 领域汇总到单据头追溯

### 验收矩阵

| AC | 描述 | 结论 | 执行面 | 关键证据 | 备注 |
|----|------|------|--------|----------|------|
| AC-3 | 用户可从领域汇总、业务操作汇总或业务汇总追到单据头清单，并看到数量、金额、成本与差异定位字段 | `partially_met` | unit + e2e + build | service tests 已覆盖领域汇总、销售项目汇总和主仓到RD交接汇总；明细合同包含 `领域 / 操作 / 仓别 / 车间 / 销售项目 / 研发项目 / 来源目标仓别车间 / 数量 / 金额 / 成本 / 异常标识 / 来源月份 / 来源单据`；e2e 覆盖 API 明细与导出 | redesign 后浏览器点击路径尚未复测 |

### 残余风险

- 当前无法用浏览器证据证明用户真实点击路径，但 API、导出与类型构建已通过。

## F4 异常 / 跨月修正展示规则

### 验收矩阵

| AC | 描述 | 结论 | 执行面 | 关键证据 | 备注 |
|----|------|------|--------|----------|------|
| AC-4 | 异常 / 跨月修正金额归原业务操作并保留异常标识或异常列 | `met` | unit + e2e | shared/service/repository tests 继续覆盖 `abnormalLabels / sourceBizMonth / sourceDocumentNo` 合同；e2e 仍通过 export / detail 接口 | redesign 未改变异常归属逻辑 |

### 残余风险

- live fixture 是否有非空异常样本，仍需依赖实际环境数据。

## F5 仓库侧查看与导出

### 验收矩阵

| AC | 描述 | 结论 | 执行面 | 关键证据 | 备注 |
|----|------|------|--------|----------|------|
| AC-5 | 系统内可查看月度对账，并支持与页面同口径的 `Excel` 导出，且 `RD_SUB` 保持自身范围隔离查看 | `partially_met` | e2e + build + historical browser/live API | redesign 后 `POST /api/reporting/monthly-reporting/export` 已被 e2e 复测，build 通过；accepted 基线已证明管理员导出与 `RD_SUB` 范围隔离可成立 | redesign 后页面和导出文案尚缺新的 browser/live API 复测 |

### 残余风险

- 若 redesign 改动了页面上的实际下钻顺序或导出文案，当前还缺浏览器侧最终确认。
