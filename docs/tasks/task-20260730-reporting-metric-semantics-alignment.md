# 报表指标语义对齐

## Metadata

- Scope: `/reporting` 首页、趋势、月度领域视角、物料分类视角及导出指标口径
- Related requirement: `docs/requirements/domain/monthly-reporting.md (F1/F2/F5/F9)`
- Status: `in-progress`
- Review status: `reviewed-with-open-business-decision`
- Delivery mode: `standard`
- Acceptance mode: `light`
- Acceptance status: `not-assessed`
- Complete test report required: `no`
- Lifecycle disposition: `active`
- Planner: `Codex / root`
- Coder: `Codex / root`
- Reviewer: `Codex / root`
- Acceptance QA: `Codex / root`
- Last updated: `2026-07-30`
- Related checklist: `-`
- Related acceptance spec: `-`
- Related acceptance run: `-`
- Related files: `docs/tasks/analysis-20260729-reporting-metric-semantics-review.md`、`docs/requirements/domain/monthly-reporting.md`

## Requirement Alignment

- Domain capability: 仓库侧月度报表、首页概览与趋势指标应采用可解释、可导出的稳定业务口径。
- User intent summary: 删除净生产和跨物料数量；接受金额拆分、车间净耗用、趋势单据数、首页退厂、库存健康、后端 Decimal 合计及其他字段命名建议；先调查数量小数和研发成本疑点；月报不冻结；历史分类方案只分析不修。
- Acceptance criteria carried into this task: 页面、API、导出和帮助文案不再暴露已确认无意义或错误的指标，并由定向测试保护新公式。
- Requirement evidence expectations: focused unit tests、类型检查、前端构建，以及可运行环境下的报表页面冒烟检查。
- Open questions requiring user confirmation: 当有效且未冲销的库存流水成本和已保存的`costAmount`都不存在时，研发成本应排除并标记缺失，还是回退录入`amount`；历史分类方案本轮只给分析结论，不实施。

## Progress Sync

- Phase progress: 已完成代码、数据、自动化测试和浏览器验证；等待唯一的研发缺失成本业务决定。
- Current state: 已接受口径均已落地；研发成本已实现“有效库存流水成本 → 已保存`costAmount`”优先级，两者都缺失时当前仍会形成 0，尚未固化为目标合同。
- Acceptance state: `not-assessed`
- Blockers: 研发成本两种实际成本来源都缺失时的业务处理尚待用户确认。
- Next step: 获得该决定后完成 AC-6、执行最终回归并归档任务。

## Goal And Acceptance Criteria

- Goal: 让报表只展示量纲成立、金额基础清晰、公式与领域真源一致的指标。
- Acceptance criteria:
  - `[AC-1]` `净生产`从 API、页面、帮助文案和导出删除，入库事实保持验收、生产、退厂分列，并提供采购净入库金额。
  - `[AC-2]` 只有单一物料粒度展示数量；顶层、领域、项目、车间、分类、趋势及单据头的跨物料数量全部删除。
  - `[AC-3]` 混合金额改成明确的库存成本、WMS 销售价或入库计价口径，前端不再用 JS `Number`生成权威财务合计。
  - `[AC-4]` 车间净耗用统一为`领料 - 退料 + 报废`，趋势单据数按真实业务单据去重。
  - `[AC-5]` 首页退厂不再正向并入入库，库存健康在`物料 × 仓别`粒度拆分低库存、正常、超上限、未配置。
  - `[AC-6]` 研发项目汇总采用实际成本字段；其余已接受字段命名与帮助文案同步。
  - `[AC-7]` 数量小数、实时月报和历史分类分别留下调查证据；本轮不改数量格式、不冻结月报、不修历史分类。
  - `[AC-8]` 首页“今天”、趋势显式日期范围和自然月边界按数据库`DATE`字面日期闭区间查询，不因业务时区换算偏移到前一天。

## Scope And Ownership

- Allowed code paths: `src/modules/reporting/**`、`web/src/views/reporting/**`、`web/src/views/index.vue`、`web/src/api/system/home.js`、相关 reporting tests、`docs/requirements/domain/monthly-reporting.md`、`docs/requirements/REQUIREMENT_CENTER.md`、本任务及审查文档。
- Frozen or shared paths: 现有无关未提交改动；数据库 schema 与迁移文件不在本轮修改。
- Task doc owner: `Codex / root`
- Contracts that must not change silently: 月报 JSON、Excel/CSV 列、指标公式、业务日期口径。

## Implementation Plan

- [x] 收敛后端指标合同与公式。
- [x] 同步页面、导出和帮助文案。
- [x] 调查数量精度、实时导出流程、研发成本和历史分类并写入分析结论。
- [x] 运行 focused tests、typecheck、build、真实数据核对和页面冒烟验证。
- [ ] 按用户决定收口研发实际成本两种来源都缺失时的行为。

## Coder Handoff

- Execution brief: 按用户逐条拍板实施，不把第 4、10、12 条扩大为代码改造。
- Required source docs or files: 本任务、关联审查文档、`monthly-reporting.md`、车间与 RD 领域需求。
- Owned paths: `src/modules/reporting/**`、`web/src/views/reporting/**`、`web/src/views/index.vue`、`web/src/api/system/home.js`、上述文档。
- Forbidden shared files: 与本任务无关的现有脏文件。
- Constraints and non-goals: 不修改数量格式；不建设月报冻结/版本；不落历史分类方案；不修改数据库。
- Validation command for this scope: reporting focused Jest + `bun run typecheck` + `pnpm --dir web build:prod`。

## Reviewer Handoff

- Review focus: 量纲、方向、金额基础、Decimal 边界、页面/API/导出一致性、既有脏改动保护。
- Requirement alignment check: 对照 `[AC-1..8]` 与审查文档业务决策。
- Final validation gate: focused tests、typecheck、web build、diff review。
- Required doc updates: 审查文档决策记录、月报领域合同、任务验收记录。

### Acceptance Evidence Package

- Covered criteria: `[AC-1..8]`
- Evidence pointers: reporting 20 套件 65 项测试、前端指标帮助 5 项测试、TypeScript typecheck、前端生产构建、真实 7 月数据库/API 逐项核对和三个用户可见报表路由浏览器烟测。
- Evidence gaps, if any: `[AC-6]` 中“两种实际成本来源都缺失”的处理待用户决定；当前有效 RD 数据没有受影响记录，无法用现存生产样本替代业务判断。
- Complete test report requirement: `no`

### Acceptance Test Expectations

- Acceptance mode: `light`
- User-visible flow affected: `yes`
- Cross-module write path: `no`
- Irreversible or high-cost business effect: `no`
- Existing automated user-flow coverage: `no`
- Browser test required: `yes`
- Browser waiver reason: `-`
- Related acceptance cases: `-`
- Related acceptance spec: `-`
- Separate acceptance run required: `no`
- Complete test report required: `no`
- Required regression / high-risk tags: reporting semantics, Excel export, Decimal aggregation
- Suggested environment / accounts: 本地开发环境中的仓库或财务只读账号。
- Environment owner / setup source: 仓库现有 `.env.dev` 与本地服务。

## Parallelization Safety

- Status: `safe-for-read-only-audits`
- If safe, list the exact disjoint writable scopes: 子代理仅分别审计后端、前端和数据语义；代码由 root 单一写入。
- If not safe, list the shared files or contracts that require a single writer: 月报返回合同、导出列和页面字段必须由同一写入者同步。

## Review Log

- Validation results:
  - `bun run test -- src/modules/reporting`：20 个套件、65 项测试通过。
  - `bun run typecheck`：通过。
  - `bun test web/src/views/reporting/reportingMetricHelp.test.js`：5 项测试、16 个断言通过。
  - `cd web && corepack pnpm run build:prod`：通过，转换 2584 个模块。
  - scoped Biome：无错误；仅保留 7 个既有/随功能增长产生的超 500 行警告。
  - reporting 与本任务路径`git diff --check`：通过；全仓检查只命中本任务之外既有前端尾随空格。
  - 2026-07 真实数据：API 返回 21 个日期/类型桶、139 张业务单据、库存成本净变动`993610.6550`；独立重算 322 条有效未冲销流水逐项一致，且未纳入 6 月 30 日的 101 条流水/47 张单据。
  - 浏览器：`/reporting/home`、`/reporting/monthly-reporting`、`/reporting/monthly-reporting-material-category`可见口径正确、报表接口 200；页面无报表异常。开发环境通知 WebSocket 有既有连接失败日志，不影响报表请求与渲染。
- Findings: 后端复核发现并修复历史成本回退不一致、销售冲销重复计入、调价历史耗用差额误计库存流入、Excel 数字列类型和数据库`DATE`日界偏移；补充了研发有效流水成本优先级与首页日期边界回归测试。
- Follow-up action: 等待用户决定研发成本两种实际来源都缺失时是“排除并标记缺失”还是“回退录入金额”。

## Acceptance

- Acceptance status: `not-assessed`
- Acceptance QA: `Codex / root`
- Acceptance date: `-`
- Complete test report: `not-required`

### Acceptance Checklist

- [x] `[AC-1]` 删除净生产并保留正确入库口径 — Evidence: API/UI/Excel 合同测试与浏览器月报 — Verdict: `✓ met`
- [x] `[AC-2]` 删除跨物料数量 — Evidence: 领域、分类、趋势、项目、车间和单据头合同测试；数量只在物料/单据行 — Verdict: `✓ met`
- [x] `[AC-3]` 金额基础与 Decimal 合计清晰 — Evidence: 精度回归测试、页面帮助、真实数据核对 — Verdict: `✓ met`
- [x] `[AC-4]` 车间净耗用和趋势单据数正确 — Evidence: 车间`788744.5450 - 51541.3200 + 0 = 737203.2250`；趋势 139 张单据与数据库一致 — Verdict: `✓ met`
- [x] `[AC-5]` 首页与库存健康正确 — Evidence: 四状态单测及首页浏览器烟测 — Verdict: `✓ met`
- [ ] `[AC-6]` 研发实际成本与字段名称正确 — Evidence: 有效库存流水成本优先、`costAmount`回退及排除冲销已有仓储层测试；两者都缺失的合同待确认 — Verdict: `△ partially met`
- [x] `[AC-7]` 暂缓项有证据且未越界修改 — Evidence: 数量小数数据审计、实时导出流程、分类历史四方案分析 — Verdict: `✓ met`
- [x] `[AC-8]` 数据库 DATE 日界正确 — Evidence: today/显式范围单测及 7 月真实 API 不含 6 月 30 日 — Verdict: `✓ met`

### Acceptance Notes

- Acceptance path used: `light`
- Acceptance summary: 除研发实际成本两种来源都缺失时的业务决定外，已接受范围均实现并通过自动化、真实数据和浏览器验证；任务保持活动状态，不提前作条件验收或归档。
- Report completeness check: `[AC-1..5,7,8]`证据完整；`[AC-6]`明确记录部分通过与唯一缺口。
- If rejected or blocked: `-`
- If conditionally accepted: 尚未进入条件验收；待用户决定后完成本任务。

## Final Status

- Outcome: 主体实现与验证完成，等待研发缺失成本业务决定。
- Requirement alignment: 已落实删除净生产/跨物料数量、金额拆分、车间/趋势/首页/库存健康/Decimal 等决定；实时月报按业务决定明确不冻结。
- Residual risks or testing gaps: 数量格式和历史分类按用户要求暂缓；研发实际成本两种来源都缺失时的行为尚未确认。实时重算不是待修缺口，正式依据为财务归档导出文件。
- Directory disposition after completion: 完成后转入 `retained-completed`。
- Next action: 取得研发缺失成本决定后补实现/测试、最终验收并转入`retained-completed`。
