# 用户表格列顺序与显隐偏好

## Metadata

- Scope: `web/` 业务列表页公共表格列交互
- Related requirement: `docs/requirements/domain/frontend-old-style-adaptation.md (F3，部分切片)`
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
- Last updated: 2026-07-27
- Related checklist: -
- Related acceptance spec: -
- Related acceptance run: -
- Related files: `web/src/components/RightToolbar/**`, `web/src/components/AdaptiveTable/**`, `web/src/utils/tableColumnPreferences*`, 28 个已接入列配置的业务列表页

## Requirement Alignment

- Domain capability: `frontend-old-style-adaptation F3` 业务列表页交互节奏细化。
- User intent summary: 用户可直接左右拖动业务表格列，把重要列放到左侧；也可隐藏不关心的列。
- Acceptance criteria carried into this task: 列顺序与显隐可调整、可恢复，并在刷新后为当前用户保留。
- Requirement evidence expectations: 纯函数测试、前端生产构建、目标业务列表浏览器交互验证。
- Open questions requiring user confirmation: 无；默认覆盖已经接入 `RightToolbar :columns` 的业务列表，偏好采用账号隔离的浏览器本地存储，不新增后端表。

## Progress Sync

- Phase progress: discovery、implementation、review、light acceptance 均已完成。
- Current state: 28 个已有列显隐配置的业务列表已统一支持表头/面板拖动、显隐、偏好恢复和恢复默认。
- Acceptance state: `accepted`
- Blockers: 无。
- Next step: 本切片无剩余动作；后续表格接入时复用相同 `column-config` 契约。

## Goal And Acceptance Criteria

- Goal: 在不改变业务 API、权限和表格固定功能列的前提下，为既有业务列表提供统一的列排序、显隐和偏好恢复体验。
- Acceptance criteria:
  - `[AC-1]` 用户可拖动可配置表头左右换位；序号、选择和操作等固定列不参与拖动。
  - `[AC-2]` 列设置面板可拖动完整列清单，并可逐列显示或隐藏。
  - `[AC-3]` 顺序与显隐按用户和路由隔离持久化，刷新后恢复；新增列能与旧偏好安全合并。
  - `[AC-4]` 用户可一键恢复当前页面默认列顺序和显隐。
  - `[AC-5]` 未提供列配置的 `AdaptiveTable` 与现有页面行为保持不变。

## Scope And Ownership

- Allowed code paths: `web/src/components/RightToolbar/**`, `web/src/components/AdaptiveTable/**`, `web/src/utils/**`, 已接入列显隐的业务列表页，当前 task/requirement 索引文档。
- Frozen or shared paths: `prisma/schema.prisma`, `src/**`, 业务 API 与 RBAC 合同。
- Task doc owner: parent。
- Contracts that must not change silently: 现有 `columns[index].visible` 页面契约、固定列位置、业务表格事件与方法透传。

## Implementation Plan

- [x] 新增列偏好标识、合并、排序、持久化纯函数与测试。
- [x] 升级 `RightToolbar` 列设置面板，支持拖动、显隐、恢复默认和账号/路由隔离保存。
- [x] 升级 `AdaptiveTable`，支持直接拖动表头并同步 Element Plus 运行时列顺序。
- [x] 为已有列配置的业务列表显式传入 `column-config`。
- [x] 运行测试、构建与目标浏览器验证，完成 review 和文档收口。

## Coder Handoff

- Execution brief: 复用现有数值 `key + label + visible` 配置，不重排页面原数组；以额外 `order` 元数据驱动运行时列排序。
- Required source docs or files: `docs/requirements/domain/frontend-old-style-adaptation.md`, `web/src/components/RightToolbar/index.vue`, `web/src/components/AdaptiveTable/index.vue`。
- Owned paths: Scope 中列出的 `web/` 与本 task 文档。
- Forbidden shared files: `.env*`, `prisma/**`, `src/**`。
- Constraints and non-goals: 不新增数据库表或后端接口；不把未接入列配置的全部历史表格强行纳入本切片。
- Validation command for this scope: `bun test web/src/utils/tableColumnPreferences.test.js`; 在 `web/` 下运行 `pnpm build:prod`。

## Reviewer Handoff

- Review focus: 下标契约是否保持、隐藏列参与排序时是否稳定、固定列是否被移动、本地偏好损坏/版本演进是否安全、多个页面是否隔离。
- Requirement alignment check: 对照 `[AC-1]`~`[AC-5]`。
- Final validation gate: focused test + production build + 至少一个多列业务页浏览器拖拽/隐藏/刷新/恢复验证。
- Required doc updates: 完成后更新本 task、Task Center 和 F3 关联状态。

### Acceptance Evidence Package

- Covered criteria: `[AC-1]`~`[AC-5]`。
- Evidence pointers: `web/src/utils/tableColumnPreferences.test.js` 5 tests；`pnpm build:prod`；本地真实 Vue/Element Plus 组件浏览器验收。
- Evidence gaps, if any: 未使用真实业务账号访问业务数据页；为避免凭据泄露，浏览器验收采用临时免登录测试路由直接加载相同公共组件，验收后已完整移除。该缺口不影响公共组件交互与持久化合同的判断。
- Complete test report requirement: `no`

### Acceptance Test Expectations

- Acceptance mode: `light`
- User-visible flow affected: `yes`
- Cross-module write path: `no`
- Irreversible or high-cost business effect: `no`
- Existing automated user-flow coverage: `no`
- Browser test required: `yes`
- Browser waiver reason: -
- Related acceptance cases: task-local `[AC-1]`~`[AC-5]`
- Related acceptance spec: -
- Separate acceptance run required: `no`
- Complete test report required: `no`
- Required regression / high-risk tags: table-column-order, visibility, preference-isolation, fixed-columns
- Suggested environment / accounts: 本地开发环境，任一具备库存列表权限的账号。
- Environment owner / setup source: `.env.dev` 本地环境（不写入 task）。

## Parallelization Safety

- Status: `not-safe`
- If safe, list the exact disjoint writable scopes: -
- If not safe, list the shared files or contracts that require a single writer: `RightToolbar`、`AdaptiveTable` 和所有页面共享同一列配置契约，按单写者顺序实施。

## Review Log

- Validation results:
  - `bun test web/src/utils/tableColumnPreferences.test.js`：`5 pass / 0 fail / 16 assertions`。
  - `pnpm build:prod`（`web/`）：通过，`2573 modules transformed`。
  - `@biomejs/biome@2.4.7` task-scoped format/lint：新增纯 JS 文件 lint 通过，两个公共 Vue 组件 format check 通过；Vue 模板变量由 Vite production build 校验。
  - 接入审计：已有 `RightToolbar :columns` 的 `28/28` 个列表均传入 `column-config`，配置 label 与运行时表头对齐。
  - `git diff --check`：通过；临时 QA 路由、白名单与页面均已移除。
- Validation environment note: 默认 pre-commit 的 `lint-staged` 调用了本地 Biome `2.5.5`，与仓库 `biome.json` 的 `2.4.7` schema/规则不兼容；未扩展本 task 去迁移全仓工具链，改用显式锁定的 `2.4.7` 完成上述 task-scoped 校验。
- Findings: 无 blocking / important finding；review 中修正了领料明细“单价/成本价层”和报废单“创建者/创建人”两处既有配置标签漂移，确保列映射稳定。
- Follow-up action: 无；F3 仍是更大的进行中能力，其他尚未提供列配置的历史表格可按页面节奏后续接入。

## Acceptance

- Acceptance status: `accepted`
- Acceptance QA: parent
- Acceptance date: 2026-07-27
- Complete test report: not required。

### Acceptance Checklist

- [x] `[AC-1]` 可配置表头左右拖动且固定列不动 — Evidence: 浏览器中顺序由“序号/编码/名称/重要程度/操作”拖为“序号/重要程度/编码/名称/操作”，表头与行数据同步，首尾固定列未移动 — Verdict: `✓ met`
- [x] `[AC-2]` 面板拖动和逐列显隐 — Evidence: 浏览器中显示默认隐藏的“备注”、隐藏“名称”，并把“备注”从末位拖到首个业务列，表格即时同步 — Verdict: `✓ met`
- [x] `[AC-3]` 用户/路由隔离持久化与新增列合并 — Evidence: 浏览器确认存储键含测试用户与 table key，reload 后恢复顺序；focused tests 覆盖跨用户 key 和新增列合并 — Verdict: `✓ met`
- [x] `[AC-4]` 恢复默认 — Evidence: 点击后恢复默认顺序/显隐、偏好键删除，reload 后仍为默认 — Verdict: `✓ met`
- [x] `[AC-5]` 无配置表格保持兼容 — Evidence: `column-config` 为可选 prop，未传时不创建 Sortable 或触碰 Element Plus 列 store；生产构建通过 — Verdict: `✓ met`

### Acceptance Notes

- Acceptance path used: `light`
- Acceptance summary: 5 条 AC 全部满足；浏览器控制台无 JS error，交互、持久化、默认恢复和兼容边界均符合任务合同。
- Report completeness check: complete for light acceptance。

## Final Status

- Outcome: accepted；公共列偏好能力已覆盖 28 个已有列配置的业务列表。
- Requirement alignment: 完成本 task 所承接的 F3 部分切片，不宣称整个“业务列表页旧风格节奏细化”能力完成。
- Residual risks or testing gaps: 偏好按账号隔离保存在当前浏览器，不跨设备同步；尚未提供 `columns` 配置的历史表格不在本切片范围。
- Directory disposition after completion: `retained-completed`，作为后续表格接入的公共契约与验收基线。
- Next action: 后续页面需要该能力时，为 `RightToolbar` 与主 `AdaptiveTable` 传入同一份列配置即可。
