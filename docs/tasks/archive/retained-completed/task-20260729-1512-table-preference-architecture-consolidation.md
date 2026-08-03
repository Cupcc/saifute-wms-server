# 表格偏好架构收敛与报表折叠状态持久化

## Metadata

- Scope: `web/` 表格列偏好公共组件、浏览型表格、月度报表折叠状态，以及验收中发现的 reporting RBAC 路由缺口
- Related requirement: `docs/requirements/domain/frontend-old-style-adaptation.md (F3)`
- Status: `accepted`
- Review status: `passed`
- Delivery mode: `standard`
- Acceptance mode: `light`
- Acceptance status: `accepted`
- Complete test report required: `no`
- Lifecycle disposition: `retained-completed`
- Planner: parent
- Coder: parent
- Reviewer: parent
- Acceptance QA: parent
- Last updated: 2026-07-29
- Related files: `web/src/components/AdaptiveTable/**`, `web/src/components/RightToolbar/**`, `web/src/utils/*Preferences*`, `web/src/utils/tableColumnCoverage.test.js`, `web/src/views/**`, `web/src/store/modules/permission.js`, `src/modules/rbac/{application,infrastructure}/**`

## Requirement Alignment

- Domain capability: `frontend-old-style-adaptation F3` 业务列表页交互节奏与表格体验。
- User intent summary: 消除“页面手写 columns”与“自动列”两套含糊接入合同，形成简洁、易维护的单一架构；用户调整列或折叠月报区块后，刷新页面仍保留偏好。
- Requirement evidence expectations: 架构使用面审计、单一公共合同静态守卫、偏好纯函数测试、生产构建、RBAC 合同测试与真实页面浏览器验收。
- Scope boundary: 本任务完成 F3 的表格偏好与月报折叠切片，不宣称 F3 的其他视觉节奏工作全部完成。

## Progress Sync

- Phase progress: discovery、implementation、review、light acceptance 与归档均已完成。
- Current state: `55` 个浏览型页面文件统一使用 `<adaptive-table column-preferences>`；模板 `el-table-column` 是唯一列定义真源。月报路由内 `10` 张表使用独立 `table-key`。
- Explicit exceptions: `8` 个编辑器、详情核对或主从选择器保留固定语义表格；它们是显式关闭个性化能力，不是第二套列配置架构。
- Acceptance state: `accepted`
- Blockers: 无。

## Goal And Acceptance Criteria

- Goal: 让浏览型表格以模板列声明为唯一真源，由 `AdaptiveTable` 统一负责列发现、显隐、排序与持久化；同时持久化月报折叠状态。
- Acceptance criteria:
  - `[AC-1]` 所有浏览型表格只使用 `column-preferences`；页面不再维护仅用于显隐/排序的 `columns` 数组、下标 `v-if`、`:column-config` 或 `RightToolbar :columns`。
  - `[AC-2]` 选择、序号、展开、操作、固定列继续排除；动态 `v-if` 列、树形表格和同路由多表 key 行为保持正确。
  - `[AC-3]` 原有默认隐藏列通过语义字段保留；既有 `label:*` / `field:*` 偏好可兼容读取，不要求用户重新配置。
  - `[AC-4]` `RightToolbar` 只负责搜索与刷新；列设置由独立组件负责，公共接口和内部命名不再表达 auto/controlled 双模式。
  - `[AC-5]` 月报 `7` 个区块的折叠状态按用户与路由保存；刷新及视角切换后恢复，未知新区块、损坏 JSON 和旧版本数据安全回退默认展开。
  - `[AC-6]` 路由反向覆盖守卫、focused tests、类型检查、前后端生产构建、diff check 与真实浏览器验收通过。

## Scope And Ownership

- Allowed code paths: `web/src/components/AdaptiveTable/**`, `web/src/components/RightToolbar/**`, `web/src/utils/**`, 纳入列偏好的 `web/src/views/**`, `web/src/store/modules/permission.js`, `src/modules/rbac/application/rbac.service.spec.ts`, `src/modules/rbac/infrastructure/rbac-routes.repository.ts`，以及当前 task/requirement 索引文档。
- Frozen or shared paths: `.env*`, `biome.json`, `package.json`, `bun.lock`, `pnpm-lock.yaml`, `prisma/**` 与其余 `src/**`。
- Contracts preserved: Element Plus 表格事件/方法透传、表格高度、固定功能列位置、既有偏好存储键、默认隐藏列和 reporting 权限字符串。
- Pre-existing working tree changes preserved: `.env.dev`, `biome.json`, `package.json`, `bun.lock`, `pnpm-lock.yaml`；不纳入本任务范围。

### Fixed-semantic exceptions

- `monitor/cache/list.vue`：缓存名称与键名组成的主从选择器。
- `rd/procurement-requests/components/RdProcurementItemLinesEditor.vue`：采购品项行编辑器。
- `rd/projects/detail.vue`：研发项目详情、BOM 与动作行编辑工作流。
- `sales/components/SalesOrderDetailDialog.vue`：销售单据详情核对表。
- `sales/components/SalesOrderEditorDialog.vue`：销售单据行编辑器。
- `sales-project/components/SalesProjectAcceptanceOrderDetailDialog.vue`：项目验收单详情核对表。
- `sales-project/components/SalesProjectAcceptanceOrderDialog.vue`：项目验收单行编辑器。
- `sales-project/components/SalesProjectDetailPage.vue`：项目物料选择与销售草稿创建工作流。

## Architecture Decision

- 统一公共入口：`<adaptive-table column-preferences>`。
- 页面模板中的 `<el-table-column>` 是 label、prop、默认顺序的唯一声明；少量默认隐藏列只通过 `default-hidden-columns` 声明。
- `AdaptiveTable` 隔离 Element Plus 运行时列同步与表头拖动；`ColumnSettings` 负责设置 UI 和持久化；`RightToolbar` 只负责查询区显示和刷新。
- 通用 `preferenceStorage` 只负责按版本、用户、作用域生成 key 与安全 JSON 读写；列偏好和区块折叠分别维护自己的领域合并规则。
- 历史 `auto:` 偏好 ID 与 `saifute:table-columns:v1` 存储格式继续兼容，但不再代表一套可选架构。
- 固定语义表格不启用 `column-preferences`，由覆盖测试中的带理由白名单约束。

## Implementation Plan

- [x] 盘点显式、自动和固定语义表格用途，确认迁移与排除边界。
- [x] 建立单一 `column-preferences` API、独立列设置组件和通用偏好存储工具。
- [x] 迁移 `29` 个页面受控文件与 `25` 个自动列文件，并将原始趋势报表纳入统一入口，共覆盖 `55` 个浏览型页面文件。
- [x] 保留默认隐藏、动态列、固定功能列、同路由多表和旧偏好兼容语义。
- [x] 完成月报 `7` 个区块折叠状态持久化并补测试。
- [x] 增加覆盖守卫，禁止旧接入合同重新出现，并要求所有原始表格明确分类。
- [x] 修复验收发现的三个标准报表前后端 RBAC 路由缺口。
- [x] 完成代码简化复核、focused tests、构建、浏览器 light acceptance 与归档。

## Coder Handoff

- Execution summary: 页面列数组和下标显隐已删除；列偏好从模板运行时列生成，公共组件内统一应用顺序与显隐，设置组件按用户和路由/表 key 持久化。
- Constraints honored: 未改变业务 API、数据库、权限字符串或固定语义表格交互；未改写用户的工具链文件。
- Future extension rule: 新增浏览型表格只声明模板列并开启 `column-preferences`；同路由多表必须提供稳定唯一的 `table-key`。

## Reviewer Handoff

- Review focus: 单一真源、旧偏好兼容、默认隐藏映射、动态列生命周期、事件/高度透传、固定功能列位置、组件职责边界、RBAC 路由合同和无死代码。
- Result: `passed`；无 blocking / important finding。
- Residual technical boundary: 列重排依赖 Element Plus 内部运行时列 store，但该依赖只存在于 `AdaptiveTable` 适配层；升级 Element Plus 时需重跑覆盖测试和代表页浏览器回归。

### Acceptance Test Expectations

- User-visible flow affected: `yes`
- Cross-module write path: `no`
- Irreversible or high-cost business effect: `no`
- Existing automated user-flow coverage: `no`
- Browser test required: `yes`
- Related acceptance cases: task-local `[AC-1]`~`[AC-6]`
- Separate acceptance run required: `no`
- Complete test report required: `no`

## Parallelization Safety

- Status: `not-safe`
- Reason: 公共组件 API、迁移页面和覆盖守卫必须原子收敛；本任务保持单写者完成。

## Review Log

- Automated validation:
  - `bun test web/src/utils/preferenceStorage.test.js web/src/utils/tableColumnPreferences.test.js web/src/utils/sectionExpansionPreferences.test.js web/src/utils/tableColumnCoverage.test.js`：`24 pass / 0 fail / 84 assertions`。
  - `node_modules/.bin/jest src/modules/rbac/application/rbac.service.spec.ts --runInBand`：`8 pass / 0 fail`。
  - `node_modules/.bin/tsc --noEmit`：通过。
  - `node_modules/.bin/nest build --path tsconfig.build.json`：通过。
  - `pnpm build:prod`（`web/`）：通过，`2578 modules transformed`。
  - `git -c core.whitespace=cr-at-eol diff --check`：通过。
- Static architecture audit:
  - `55` 个浏览型页面文件启用 `column-preferences`。
  - 旧 `auto-columns`、`:column-config`、`RightToolbar :columns`、`columns[index].visible` 合同均为 `0`。
  - `8` 个原始表格文件全部命中带理由的固定语义分类，无遗漏或失效白名单。
- Browser acceptance:
  - `/stock/log`：隐藏“备注”、拖动“业务日期”、刷新恢复与“恢复默认”均通过。
  - `/reporting/monthly-reporting`：领域汇总折叠后刷新仍折叠；领域与物料分类月报路由状态隔离。
  - `/entry/detail`：原默认隐藏“验收单号”保持，设置面板正确显示未勾选。
  - `/rd/procurement-requests`：展开列和操作列不进入设置，行展开正常。
  - `/system/user`、`/system/dept`：选择/操作列边界与树形表格行为正常。
  - `/reporting/inventory-summary`、`/reporting/material-category-summary`、`/reporting/trends`：补齐 RBAC 合同后均可直接访问并显示列设置。
  - 本地证据：`/tmp/saifute-table-preferences-qa/report.md` 与 `/tmp/saifute-table-preferences-qa/screenshots/`。
- Findings and fixes:
  - 验收发现三个标准报表因前后端路由注册缺失进入 404；已补齐同名路由和既有权限，并增加 RBAC/前端覆盖守卫。
  - 迁移语义审计修正 `base/customer` 与 `entry/detail` 的原默认列顺序，避免机械删除页面数组后改变用户看到的顺序。
  - 删除失效 `columns数组` 注释，修复 `SalesDetailPage.vue` 换行粘连，并将内部残留的 `Config` 命名统一为 `Preferences`。
  - 根目录 `pnpm test` 曾被现有 `ERR_PNPM_IGNORED_BUILDS` 安装门禁阻断；使用已安装 Jest 直接运行本任务 RBAC suite 并通过，未修改工具链配置。

## Acceptance

- Acceptance status: `accepted`
- Acceptance QA: parent
- Acceptance date: 2026-07-29
- Complete test report: not required。

### Acceptance Checklist

- [x] `[AC-1]` 单一列偏好入口 — Evidence: `55` 个浏览型页面统一启用；静态守卫确认四类旧合同为 `0` — Verdict: `✓ met`
- [x] `[AC-2]` 功能列、动态列、多表与树表边界 — Evidence: focused tests + RD/system/月报代表页浏览器回归 — Verdict: `✓ met`
- [x] `[AC-3]` 默认隐藏与旧偏好兼容 — Evidence: 纯函数测试、`/entry/detail` 与 `/stock/log` 浏览器验证 — Verdict: `✓ met`
- [x] `[AC-4]` 组件职责和命名收敛 — Evidence: 独立 `ColumnSettings`，精简 `RightToolbar`，公共接口无双模式 — Verdict: `✓ met`
- [x] `[AC-5]` 折叠状态持久化 — Evidence: 月报折叠刷新恢复、跨路由隔离和损坏 JSON/新区块测试 — Verdict: `✓ met`
- [x] `[AC-6]` 自动化与浏览器门禁 — Evidence: `24` 个前端测试、`8` 个 RBAC 测试、类型检查、前后端构建、diff check 与真实页面验收全部通过 — Verdict: `✓ met`

## Final Status

- Outcome: `accepted`；浏览型表格已收敛到一套公共偏好架构，月报折叠偏好可持久化，三个标准报表路由恢复可访问。
- Requirement alignment: 完成本任务承接的 F3 表格体验切片；F3 更大的页面节奏能力继续保持 `进行中`。
- Residual risks or testing gaps: 偏好仍按账号保存在当前浏览器，不跨设备同步；Element Plus 运行时 store 升级风险已隔离在 `AdaptiveTable`。
- Directory disposition after completion: `retained-completed`，作为后续浏览型表格接入和架构守卫的稳定基线。
- Next action: 新增浏览型路由表格时复用 `column-preferences`；若确属固定语义表格，必须在覆盖守卫中登记明确理由。
