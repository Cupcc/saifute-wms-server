# 月度对账（monthly-reporting）验收规格

## 元数据

| 字段 | 值 |
|------|------|
| 模块 | monthly-reporting |
| 需求源 | docs/requirements/domain/monthly-reporting.md |
| 最近更新 | 2026-04-17 |

## 能力覆盖

| 能力 | 说明 | 状态 |
|------|------|------|
| F1 | 本期发生金额月度口径 | `已验收` |
| F2 | 领域优先目录与业务汇总 | `待复核` |
| F3 | 领域汇总到单据头追溯 | `待复核` |
| F4 | 异常 / 跨月修正展示规则 | `已验收` |
| F5 | 仓库侧查看与导出 | `待复核` |
| F9 | 物料分类视角月度对账 | `已验收` |

## F1-F5 / F9 总体验收摘要

- accepted 基线：`docs/tasks/archive/retained-completed/task-20260411-0301-monthly-reporting-phase1-delivery.md`
- 当前 redesign 任务：`docs/tasks/task-20260411-1105-monthly-reporting-domain-first-redesign.md`
- 验收模式：`full`
- 当前结论：`in_review`
- 理由摘要：
  - accepted `Phase 1` 基线已经证明月度对账的权限、导出、`RD_SUB` 范围隔离、异常标识与基础 live API 合同成立。
  - `2026-04-11` 新增的“领域优先”重切实现，已经把页面和导出从旧的“总类 / 主题”口径切成“总入 / 总出 / 净发生 -> 领域汇总 -> 业务操作汇总 -> 车间 / 销售项目 / 研发项目汇总 -> 单据头明细”。
  - 这轮 redesign 的 focused 自动化证据已通过：shared/service/repository tests、e2e、`typecheck` 与 web build 全部通过。
  - 当前仍缺一轮基于 redesign 后页面结构的独立浏览器 acceptance，因此 `F2/F3/F5` 暂保持 `待复核`。
  - `2026-04-15` follow-on 重构已落地：`RD handoff` 直接并入 `研发项目` 领域和项目汇总，不再保留 `rdHandoffItems` 历史桶；live API 与自动化证据冻结在 `docs/acceptance-tests/runs/run-20260415-1048-monthly-reporting-rd-project-handoff-refactor.md`。
  - `2026-04-16` follow-on `F9` 已落地：`/reporting/monthly-reporting` 同页新增 `物料分类视角`，分类月报基于 `stock_in_order_line` / `sales_stock_order_line` 行级快照聚合，并已补齐本地 `.env.dev` schema/backfill、focused tests、e2e、live API、browser walkthrough 与 UI 导出证据。
  - `2026-04-17` follow-on `F9` requirement alignment 已落地：物料分类视角取消多级分类树与父级汇总，`summary/detail/export` 全部切到单层最终分类聚合；focused reporting tests、`batch-d` e2e、`typecheck` 与 web build 已通过。

### 验证摘要

| 时间 | 关联 task | 环境 | 结果 |
|------|-----------|------|------|
| 2026-04-11 08:34 CST | `archive/retained-completed/task-20260411-0301-monthly-reporting-phase1-delivery.md` | `.env.dev`; backend `http://127.0.0.1:8112`; web `http://127.0.0.1:5175`; agent-browser + live API + focused automated evidence | `failed` |
| 2026-04-11 09:04 CST | `archive/retained-completed/task-20260411-0301-monthly-reporting-phase1-delivery.md` | `.env.dev`; backend `http://127.0.0.1:8112`; web `http://127.0.0.1:5173`; agent-browser + live API + focused automated evidence | `passed` |
| 2026-04-11 12:00 CST | `task-20260411-1105-monthly-reporting-domain-first-redesign.md` | local workspace; focused automated evidence (`unit + e2e + typecheck + web build`) | `passed-with-browser-pending` |
| 2026-04-15 10:48 CST | `task-20260414-1418-rd-sub-project-attribution-and-reporting-alignment.md` | `.env.dev`; backend `http://127.0.0.1:8112`; live API + focused automated evidence (`typecheck + reporting tests + build + e2e`) | `passed` |
| 2026-04-16 12:13 CST | `archive/retained-completed/task-20260416-1017-monthly-reporting-material-category-view.md` | `.env.dev`; backend `http://127.0.0.1:8112`; web `http://127.0.0.1:5173`; migration execute + live API + browser + focused automated evidence | `passed` |
| 2026-04-17 16:13 CST | `task-20260417-0930-monthly-reporting-material-category-single-level-alignment.md` | local workspace; focused automated evidence (`reporting tests + batch-d e2e + typecheck + web build`) | `passed` |

### 证据索引

| 执行面 | 证据文件/命令 | 结果 |
|--------|-------------|------|
| unit | `bun run test -- src/modules/reporting/application/monthly-reporting.shared.spec.ts src/modules/reporting/application/monthly-reporting.service.spec.ts src/modules/reporting/infrastructure/reporting.repository.spec.ts` | pass |
| e2e | `bun run test:e2e -- test/batch-d-slice.e2e-spec.ts` | pass |
| typecheck | `bun run typecheck` | pass |
| build | `pnpm --dir web build:prod` | pass |
| browser | `agent-browser` 管理员 walkthrough：`/reporting/monthly-reporting`（accepted `Phase 1` 基线） | historical pass |
| live API | `GET /api/reporting/monthly-reporting`、`GET /api/reporting/monthly-reporting/details`、`POST /api/reporting/monthly-reporting/export`（accepted `Phase 1` 基线） | historical pass |
| migration | `bun run migration:monthly-reporting-material-category-snapshot:dry-run`、`bun run migration:monthly-reporting-material-category-snapshot:execute` | pass |
| unit | `bun run test -- src/modules/reporting/application/monthly-reporting.shared.spec.ts src/modules/reporting/application/monthly-reporting.service.spec.ts src/modules/reporting/infrastructure/reporting.repository.spec.ts src/modules/inbound/application/inbound.service.spec.ts src/modules/sales/application/sales.service.spec.ts` | pass |
| browser | `agent-browser` 管理员 walkthrough：`/reporting/monthly-reporting` 切换到 `物料分类视角`，验证分类汇总、行明细、操作筛选与 UI 导出 | pass |
| live API | `GET /api/reporting/monthly-reporting?yearMonth=2026-04&viewMode=MATERIAL_CATEGORY`、`GET /api/reporting/monthly-reporting/details?...&viewMode=MATERIAL_CATEGORY`、`POST /api/reporting/monthly-reporting/export` | pass |
| auth routes | `GET /api/auth/routes`（`rd-operator`）包含 `/rd/monthly-reporting`，权限为 `reporting:monthly-reporting:view` | historical pass |
| browser + live API | `rd-operator` 访问 `/rd/monthly-reporting`，页面可达、范围限定为 `RD_SUB`、且无导出按钮 | historical pass |
| acceptance run | `docs/acceptance-tests/runs/run-20260411-0834-monthly-reporting-phase1.md` | historical fail |
| acceptance run | `docs/acceptance-tests/runs/run-20260411-0904-monthly-reporting-phase1.md` | historical pass |
| acceptance run | `docs/acceptance-tests/runs/run-20260411-1200-monthly-reporting-domain-first.md` | focused pass; browser pending |
| acceptance run | `docs/acceptance-tests/runs/run-20260415-1048-monthly-reporting-rd-project-handoff-refactor.md` | pass |
| acceptance run | `docs/acceptance-tests/runs/run-20260416-1213-monthly-reporting-material-category-view.md` | pass |

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
| AC-2 | 页面与导出先按领域组织，再展示业务操作与车间 / 销售项目 / 研发项目汇总，且不把技术逆操作暴露为独立主题 | `met` | unit + build + live API | service tests 已断言 `domainCatalog / topicCatalog / workshopItems / salesProjectItems / rdProjectItems` 合同；web build 通过；live API 已证明 `RD_HANDOFF` 归属 `RD_PROJECT` 且不存在 `rdHandoffItems` | browser walkthrough 仍可继续补强，但不再阻断当前口径签收 |

### 残余风险

- 当前 browser walkthrough 仍可继续补强，但自动化与 live API 已证明旧 handoff 历史桶已经删除。

## F3 领域汇总到单据头追溯

### 验收矩阵

| AC | 描述 | 结论 | 执行面 | 关键证据 | 备注 |
|----|------|------|--------|----------|------|
| AC-3 | 用户可从领域汇总、业务操作汇总或业务汇总追到单据头清单，并看到数量、金额、成本与差异定位字段 | `met` | unit + e2e + build + live API | service tests 已覆盖领域汇总、销售项目汇总和研发项目汇总；明细合同包含 `领域 / 操作 / 仓别 / 车间 / 销售项目 / 研发项目 / 来源目标仓别车间 / 数量 / 金额 / 成本 / 异常标识 / 来源月份 / 来源单据`；e2e 与 live API 已覆盖 API 明细与导出 | handoff 已通过研发项目领域下钻，不再需要独立 handoff 汇总页签 |

### 残余风险

- 浏览器点击路径可继续补强，但 API、导出与类型构建已通过。

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

## F9 物料分类视角月度对账

### 验收矩阵

| AC | 描述 | 结论 | 执行面 | 关键证据 | 备注 |
|----|------|------|--------|----------|------|
| AC-9.1 | `/reporting/monthly-reporting` 在不替换既有领域视角的前提下，新增 `物料分类视角` 切换，并输出 `验收入库 / 生产入库 / 销售出库 / 销售退货 / 净发生` 金额 | `met` | browser + live API | browser walkthrough 证实默认仍落在领域视角，切换到分类视角后 summary cards、分类汇总和单据行明细正常渲染；live API 返回 `viewMode = MATERIAL_CATEGORY` 与四类金额汇总 | 同页切换成立，旧领域视角未回归 |
| AC-9.2 | 分类归属使用业务发生时快照，历史行通过 schema/backfill 补齐，不在查询时回读当前主数据重算 | `met` | migration + unit + live API | 本地 `.env.dev` 执行 `migration:monthly-reporting-material-category-snapshot:dry-run/execute` 后，两个行表新增四个快照字段并回填 `5` 行，剩余缺口为 `0`；focused inbound/sales/reporting tests 覆盖写侧快照与读侧解析 | backfill 以本地当前主数据为基线，符合 follow-on 合同 |
| AC-9.3 | 分类月报基于单据行事实，只按稳定最终分类单层聚合，明细下钻到单据行 | `met` | unit + e2e + browser | service/repository tests 覆盖 `stock_in_order_line` 与 `sales_stock_order_line` 行级事实、单层分类聚合与单据行明细；batch-d e2e 覆盖 category summary/detail/export；browser 页面展示分类汇总表和单据行明细表 | 第一版范围冻结在 `验收入库 / 生产入库 / 销售出库 / 销售退货` |
| AC-9.4 | 分类视角与导出、筛选、异常/来源追溯合同保持一致 | `met` | browser + live API + e2e | browser walkthrough 在分类视角下把操作过滤到 `销售退货`，页面只保留 `1` 行明细且 UI 导出成功；live API 与 e2e 共同证明分类筛选已切到 leaf-only `categoryNodeKey`，且 Excel 工作表不再输出 `分类路径 / 层级`，同时保留 `sourceBizMonth / sourceDocumentNo` 与异常标识 | 导出与页面同口径成立 |

### 残余风险

- 当前 browser walkthrough 基于 `.env.dev` 本地样本，只证明当前 dev 数据上的分类视角成立；若后续扩到 `workshop-material`、`rd-project`、`rd-subwarehouse`，需要新 acceptance run。
