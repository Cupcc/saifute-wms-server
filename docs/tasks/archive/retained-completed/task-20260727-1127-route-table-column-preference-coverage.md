# 路由表格列偏好全覆盖审计与补齐

## Metadata

- Scope: `web/` 当前路由可达的主列表、报表与辅助查询表格
- Related requirement: `docs/requirements/domain/frontend-old-style-adaptation.md (F3)`
- Status: `accepted`
- Review status: `reviewed`
- Delivery mode: `standard`
- Acceptance mode: `light`
- Acceptance status: `accepted`
- Complete test report required: `no`
- Lifecycle disposition: `retained-completed`
- Planner: parent
- Coder: parent
- Reviewer: parent
- Acceptance QA: parent
- Last updated: 2026-07-27
- Related checklist: -
- Related acceptance spec: -
- Related acceptance run: -
- Related files: `web/src/components/AdaptiveTable/**`, `web/src/components/RightToolbar/**`, `web/src/views/**`, table-column coverage audit, current task/requirement indexes

## Requirement Alignment

- Domain capability: `frontend-old-style-adaptation F3` 业务列表页旧风格节奏细化。
- User intent summary: 所有适合浏览和查询的页面表格都应支持左右拖动列、选择显隐、刷新恢复，不应只覆盖原本已声明 `columns` 的页面；月度报表各汇总/明细区块还应支持点击标题折叠。
- Acceptance criteria carried into this task: 从路由入口反向审计；补齐 reporting 与其他遗漏页面；固定功能列和编辑型表格不被错误纳入；月报区块默认展开且折叠不重新请求数据。
- Requirement evidence expectations: 自动覆盖审计、纯函数/组件 focused tests、前端生产构建、reporting 与代表性业务页浏览器交互验证。
- Open questions requiring user confirmation: 无；按用户最初的全局意图补齐所有当前可达且适合个性化查看的数据表格。

## Progress Sync

- Phase progress: discovery、implementation、review、light acceptance 均已完成。
- Current state: 已有 `29` 个显式列配置文件保持兼容；路由反查发现的 `21` 个主导航表格文件与 `4` 个辅助路由表格文件已全部接入自动列模式，reporting 的 `12` 张表全部覆盖，月报 `7` 类区块支持独立折叠。
- Acceptance state: `accepted`
- Blockers: 无。
- Next step: 本任务无剩余动作；后续新增受支持路由表格由静态覆盖测试守卫。

## Goal And Acceptance Criteria

- Goal: 让当前路由可达且用于浏览/查询的数据表格统一支持列拖动、显隐、恢复默认和按用户/表格隔离持久化，并通过静态守卫防止新增页面再次漏接。
- Acceptance criteria:
  - `[AC-1]` reporting 的库存汇总、分类汇总和月度报表全部数据表可拖动及显隐；`/reporting` 图表首页明确判定为无表格、不适用。
  - `[AC-2]` 审计发现的 `21` 个主导航文件与 `4` 个辅助路由文件中的主查询表全部接入；既有 `29` 个配置文件保持兼容。
  - `[AC-3]` 自动列模式从运行时表头生成稳定配置，选择/序号/展开/操作/固定功能列不参与拖动或隐藏。
  - `[AC-4]` 同一路由多表格使用独立 table key，顺序和显隐按用户与表格持久化，刷新后恢复并可恢复默认。
  - `[AC-5]` 静态覆盖审计从路由注册表反查并对明确排除项记录理由，后续新增遗漏会使测试失败。
  - `[AC-6]` focused tests、`pnpm build:prod`、`git diff --check` 与 reporting/业务/系统代表页浏览器验收通过。
  - `[AC-7]` 月度报表的领域汇总、单据类型汇总、业务汇总、车间使用汇总、分类汇总、物料汇总和明细默认展开，可点击标题或用键盘折叠/展开；右侧操作不误触发，折叠不清空数据或重新请求。

## Scope And Ownership

- Allowed code paths: `web/src/components/AdaptiveTable/**`, `web/src/components/RightToolbar/**`, `web/src/utils/**`, `web/src/views/**`, focused audit/tests，当前 task/requirement 索引文档。
- Frozen or shared paths: `.env*`, `biome.json`, `package.json`, `bun.lock`, `pnpm-lock.yaml`, `prisma/**`, `src/**`。
- Task doc owner: parent。
- Contracts that must not change silently: 既有显式 `columns[index].visible` 页面合同、Element Plus 表格事件/方法透传、固定功能列位置、用户/路由偏好存储键。

### Included route-table files

- 主导航 `21` 个：`monitor/{job,logininfor,online,operlog}`、`rd/{inbound-results,inventory-logs,procurement-requests,projects,scrap-orders,stocktake-orders,workbench}`、`reporting/{inventory-summary,material-category-summary,monthly-reporting}`、`system/{config,dept,dict,menu,notice,post,role}`。
- 辅助路由 `4` 个：`monitor/job/log.vue`、`system/dict/data.vue`、`system/role/authUser.vue`、`system/user/authRole.vue`。
- reporting 范围：库存汇总 `1` 表、分类汇总 `1` 表、月度报表 `10` 表。

### Explicit exclusions

- `reporting/home`：指标卡与图表页，没有表格列。
- 表单行编辑器、单据详情弹窗、行选择弹窗：列承担固定业务输入/核对语义，不属于个性化浏览列表。
- `rd/projects/detail.vue`、`tool/gen/editTable.vue`：详情/结构编辑页，不属于 F3 列表查看节奏。
- `reporting/trends`、`web/src/views/report/**`、`tool/gen/index.vue`：当前受支持路由注册表不可达，不作为本轮运行态覆盖口径。

## Implementation Plan

- [x] 冻结路由反向审计清单与排除理由。
- [x] 为 `AdaptiveTable` 增加显式 opt-in 的自动列发现/显隐模式和内置列设置入口。
- [x] 将纳入范围的主查询表迁移到自动列模式，多表页配置独立 table key。
- [x] 为月度报表 `7` 类汇总/明细区块增加独立折叠。
- [x] 增加覆盖审计、折叠接线与自动列辅助逻辑测试。
- [x] 执行构建、browser light acceptance、review 与文档归档。

## Coder Handoff

- Execution brief: 保持已有显式列配置合同不变；新增 `auto-columns` opt-in，从 Element Plus 运行时列生成偏好配置，并仅对新迁移表格使用运行时显隐。
- Required source docs or files: `docs/requirements/domain/frontend-old-style-adaptation.md (F3)`、前序列偏好 task、`AdaptiveTable`、`RightToolbar`、`tableColumnPreferences.js`。
- Owned paths: Scope 中 Allowed code paths。
- Forbidden shared files: Scope 中 Frozen or shared paths。
- Constraints and non-goals: 不改 API/RBAC/后端；不让选择、序号、展开、操作、固定列参与配置；不把编辑/详情表格误判为浏览列表。
- Validation command for this scope: `bun test web/src/utils/tableColumnPreferences.test.js <新增测试>`；在 `web/` 下 `pnpm build:prod`；`agent-browser` 验证代表页面。

## Reviewer Handoff

- Review focus: 自动发现稳定性、隐藏后重新插回运行时列、固定列边界、多表 key 隔离、动态列与既有显式模式兼容、覆盖审计是否从路由反查。
- Requirement alignment check: 对照 `[AC-1]`~`[AC-7]`。
- Final validation gate: focused tests + production build + reporting 月报多表/折叠、RD 主列表、系统树/普通列表至少各一条浏览器交互路径。
- Required doc updates: 当前 task、Task Center、F3 domain/requirement center；完成后归档并保留前序 task 为公共基线。

### Acceptance Evidence Package

- Covered criteria: `[AC-1]`~`[AC-7]`。
- Evidence pointers: `web/src/utils/tableColumnPreferences.test.js`、`web/src/utils/tableColumnCoverage.test.js`、`pnpm build:prod`、本地真实路由 browser acceptance。
- Evidence gaps, if any: 无；使用本地管理员账号访问真实 reporting、RD、system 与 stock 路由完成验收，未创建临时 QA 路由或 mock 数据。
- Complete test report requirement: `no`

### Acceptance Test Expectations

- Acceptance mode: `light`
- User-visible flow affected: `yes`
- Cross-module write path: `no`
- Irreversible or high-cost business effect: `no`
- Existing automated user-flow coverage: `no`
- Browser test required: `yes`
- Browser waiver reason: -
- Related acceptance cases: task-local `[AC-1]`~`[AC-7]`
- Related acceptance spec: -
- Separate acceptance run required: `no`
- Complete test report required: `no`
- Required regression / high-risk tags: auto-column-discovery, runtime-visibility, fixed-columns, multi-table-isolation, route-coverage
- Suggested environment / accounts: 本地开发环境，具备 reporting/RD/system 路由权限的管理员账号。
- Environment owner / setup source: `.env.dev` 本地环境（禁止写入 task）。

## Parallelization Safety

- Status: `not-safe`
- If safe, list the exact disjoint writable scopes: -
- If not safe, list the shared files or contracts that require a single writer: 所有迁移页依赖同一 `AdaptiveTable` 自动列合同，先完成并验证公共能力后顺序迁移；用户未要求子代理，本轮保持单写者。

## Review Log

- Validation results:
  - `bun test web/src/utils/tableColumnPreferences.test.js web/src/utils/tableColumnCoverage.test.js`：`14 pass / 0 fail / 50 assertions`。
  - `pnpm build:prod`（`web/`）：通过，`2573 modules transformed`。
  - 路由反向覆盖守卫：`21` 个主导航文件、`4` 个辅助路由文件无遗漏；月报恰有 `10` 个独立自动表格 key；已有显式 toolbar 列合同均连接 `column-config`。
  - browser reporting：月报表头拖动、逐列隐藏、多表 key 隔离、刷新恢复、恢复默认、动态销售列移除/恢复均通过；领域视角 `4` 个区块、物料分类视角 `4` 个区块（共 `7` 类）折叠/展开通过，折叠 HAR 均为 `0 requests`。
  - browser regression：`/rd/procurement-requests` 展开列与固定操作列边界、`height="100%"` 布局和行展开通过；`/system/config` 选择列、`/system/dept` 树表与操作列边界通过；`/stock/log` 列设置入口仍正常。
  - `git diff --check`：通过；未创建临时路由、白名单或 mock 页面。
- Findings:
  - 前序 task 的 `29/29` 统计只证明“已接入页面内部一致”，没有证明全部路由表格已接入；本 task 已改为从受支持路由反向覆盖。
  - browser review 发现“刷新后恢复默认未重新显示隐藏列”：自动配置现显式携带声明态 `defaultVisible`，并增加回归测试。
  - browser review 发现动态 `v-if` 销售列会被误当作用户隐藏列重新插回：现通过 Element Plus 列挂载索引区分“仍声明但隐藏”和“条件卸载”，并验证动态列偏好往返。
- Follow-up action: blocking / important findings 均已修复并重新通过 focused tests、生产构建和浏览器回归；无未决动作。

## Acceptance

- Acceptance status: `accepted`
- Acceptance QA: parent
- Acceptance date: 2026-07-27
- Complete test report: not required。

### Acceptance Checklist

- [x] `[AC-1]` reporting 全部适用表格支持 — Evidence: 库存汇总、分类汇总与月报 `10` 表均接入；月报真实页面完成拖动、隐藏、刷新、恢复默认和动态列验证 — Verdict: `✓ met`
- [x] `[AC-2]` 全部纳入路由表格接入且旧页面兼容 — Evidence: 路由反查覆盖测试无遗漏，既有显式配置合同测试通过，生产构建通过 — Verdict: `✓ met`
- [x] `[AC-3]` 固定功能列边界正确 — Evidence: RD 采购展开/固定操作列、system 选择/操作列均未进入拖动或列设置，原交互正常 — Verdict: `✓ met`
- [x] `[AC-4]` 多表偏好隔离与持久化正确 — Evidence: 月报领域表拖动/隐藏未影响单据类型表，reload 恢复，恢复默认后完整复原并删除存储键 — Verdict: `✓ met`
- [x] `[AC-5]` 路由反向静态审计守卫有效 — Evidence: coverage test 从 `SUPPORTED_BACKEND_ROUTE_META` 与辅助路由反查，并断言月报 `10` 个独立 key — Verdict: `✓ met`
- [x] `[AC-6]` 自动化与浏览器验证通过 — Evidence: `14 pass`、production build、diff check 与 reporting/RD/system/stock browser paths 全部通过 — Verdict: `✓ met`
- [x] `[AC-7]` 月报区块可访问折叠且不重新请求 — Evidence: 标题按钮均暴露 `aria-expanded`，Enter 键可操作；领域/分类视角折叠内容节点归零、body 无空白、HAR 为 `0 requests`，右侧清筛操作不触发折叠 — Verdict: `✓ met`

### Acceptance Notes

- Acceptance path used: `light`
- Acceptance summary: `[AC-1]`~`[AC-7]` 全部满足；自动列全路由覆盖、固定功能列边界、多表持久化、动态列和月报折叠均有自动化及真实路由证据。
- Report completeness check: complete for light acceptance。

## Final Status

- Outcome: accepted；当前所有受支持且适合个性化浏览的路由表格已覆盖，月报汇总/明细区块可独立折叠。
- Requirement alignment: 承接 F3 的全部当前路由表格列偏好补齐，不宣称 F3 其他视觉/编辑流能力完成。
- Residual risks or testing gaps: 列偏好仍按账号保存在当前浏览器，不跨设备同步；编辑器、详情核对表和不可达旧页面按任务口径明确排除。
- Directory disposition after completion: `retained-completed`，作为路由表格覆盖和自动列接入的稳定基线。
- Next action: 后续新增受支持路由中的浏览型表格必须接入显式或自动列配置，否则 coverage test 会失败。
