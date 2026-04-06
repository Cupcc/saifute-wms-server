# Master Data 物料分类前后端对齐与 F2 浏览器失败修复

## Metadata

- Scope: 修复 `master-data` 中物料分类真源与前端消费链路不一致导致的 `F2` 浏览器失败；补齐物料分类前端管理入口，收口物料新增时的无效分类错误语义，并让物料页及相关消费面改为依赖真实 `material-category` 主数据。
- Related requirement: `docs/requirements/domain/master-data-management.md` (F1, F2)
- Status: `completed`
- Review status: `reviewed-clean`
- Delivery mode: `autonomous`
- Acceptance mode: `light`
- Acceptance status: `accepted`
- Complete test report required: `no`
- Lifecycle disposition: `retained-completed`
- Planner: `assistant`
- Coder: `coder`
- Reviewer: `assistant`
- Acceptance QA: `agent-browser`
- Last updated: `2026-04-06`
- Related checklist: `None`
- Related acceptance spec: `docs/acceptance-tests/specs/master-data.md`
- Related acceptance run: `docs/acceptance-tests/runs/run-20260406-0124-master-data-f1-f2-browser-alignment.md`
- Related files:
  - `docs/requirements/domain/master-data-management.md`
  - `docs/architecture/00-architecture-overview.md`
  - `docs/architecture/modules/master-data.md`
  - `docs/acceptance-tests/specs/master-data.md`
  - `docs/acceptance-tests/runs/run-20260406-0043-master-data-f2-browser-qa.md`
  - `docs/acceptance-tests/runs/run-20260406-0124-master-data-f1-f2-browser-alignment.md`
  - `src/modules/master-data/application/master-data.service.ts`
  - `src/modules/master-data/application/master-data.service.spec.ts`
  - `web/src/views/base/material/index.vue`
  - `web/src/views/base/material-category/index.vue`
  - `web/src/utils/dict.js`
  - `web/src/api/base/material.js`
  - `web/src/api/base/material-category.js`
  - `web/src/store/modules/permission.js`

## Requirement Alignment

- Domain capability:
  - `docs/requirements/domain/master-data-management.md` (F1, F2)
- User intent summary:
  - 需要判断 `F2` 浏览器失败的根因，并以可持续方式修复，而不是仅靠临时 fixture 掩盖。
  - 需要明确是否应新增“物料分类管理”前端页面，并将其纳入本轮收口范围。
  - 需要通过规划文档先固定执行边界，再由 Subagent 实施。
- Acceptance criteria carried into this task:
  - `[AC-1]` 物料新增/修改时，如果提交了不存在或不可用的 `categoryId`，后端返回明确业务错误，不再冒出 `500`。
  - `[AC-2]` 前端存在真实可用的“物料分类管理”入口，对接 `/api/master-data/material-categories`，覆盖 F1 的基础新增/修改/停用/列表能力。
  - `[AC-3]` 物料页及其相关分类下拉不再通过“查询已有物料再反推分类”的旧兼容逻辑取数，而是直接依赖真实 `material-category` 主数据。
  - `[AC-4]` 物料页不再默认提交硬编码 `categoryId=1`；分类为空或无可选项时，前端行为与需求口径一致且可解释。
  - `[AC-5]` 相关 focused 自动化验证通过，并补充至少一次针对 F1/F2 用户流的浏览器或验收证据。
- Requirement evidence expectations:
  - 代码证据：后端分类校验、前端页面/路由/API 接入、旧字典依赖清理。
  - 行为证据：无分类前置或非法分类输入时不再返回 `500`。
  - 用户流证据：物料分类可先维护，随后物料页可消费该分类，浏览器链路可复现。
  - 验收证据：更新或补充 `master-data` 的 targeted acceptance 记录。
- Open questions requiring user confirmation:
  - None. 本 task 已按 requirement 当前口径“所属分类非必填”完成实现与验证。

## Progress Sync

- Phase progress:
  - 代码实现、focused 自动化验证、`agent-browser` 真实页面复验与文档收口均已完成；task 已切换为 `retained-completed`。
- Current state:
  - 后端 `createMaterial` / `updateMaterial` 已在持久化前校验 `categoryId`，非法或停用分类现在返回明确 `400` 业务错误，不再冒出 `500`。
  - 前端已补齐 `物料分类管理` 页面，并将物料页分类数据源切换为真实 `/api/master-data/material-categories`。
  - 物料页已移除默认 `categoryId=1` 与前端“分类必填”规则，保持 requirement 中“所属分类非必填”的产品口径。
- Acceptance state:
  - `accepted`
- Blockers:
  - None.
- Next step:
  - `None`；task 已完成并归档。

## Goal And Acceptance Criteria

- Goal:
  - 让 `material-category` 真正成为前后端一致的主数据真源，消除 `F2` 浏览器新增链路对临时 fixture 和硬编码 `categoryId=1` 的隐式依赖，并补齐 F1 的前端管理入口。
- Acceptance criteria:
  - `[AC-1]` `POST/PATCH /api/master-data/materials` 在 `categoryId` 非法时返回明确 `4xx` 业务错误，不再出现服务器内部错误。
  - `[AC-2]` 新增“物料分类管理”页面，并接入权限与菜单兼容层；可完成最小闭环的列表 / 新增 / 修改 / 停用。
  - `[AC-3]` `web` 中物料分类下拉统一改为读取 `/api/master-data/material-categories`，不再从 `/api/master-data/materials` 反推分类。
  - `[AC-4]` 物料页不再默认写死分类 `1`；若当前无可用分类，界面应表现为可理解状态，并避免发送伪造分类 ID。
  - `[AC-5]` focused 单测 / build / targeted browser 或 acceptance evidence 覆盖本次变更面。

## Scope And Ownership

- Allowed code paths:
  - `src/modules/master-data/application/master-data.service.ts`
  - `src/modules/master-data/infrastructure/master-data.repository.ts`
  - `src/modules/master-data/controllers/master-data.controller.ts`
  - `src/modules/master-data/dto/*.ts`
  - `src/modules/master-data/application/master-data.service.spec.ts`
  - `src/modules/master-data/controllers/master-data.controller.spec.ts`
  - `web/src/api/base/material.js`
  - `web/src/api/base/*.js`
  - `web/src/views/base/material/index.vue`
  - `web/src/views/base/material-category/index.vue`
  - `web/src/utils/dict.js`
  - `web/src/store/modules/permission.js`
- Frozen or shared paths:
  - `docs/requirements/domain/master-data-management.md`
  - `docs/architecture/**`
  - `docs/tasks/TASK_CENTER.md`
  - `docs/acceptance-tests/**`
  - `src/modules/inventory-core/**`
  - `src/modules/inbound/**`
  - `src/modules/customer/**`
  - `src/modules/workshop-material/**`
  - `src/modules/project/**`
  - `src/modules/rbac/**`
  - `web/src/router/**`
  - `web/src/layout/**`
- Task doc owner:
  - `assistant`
- Contracts that must not change silently:
  - `master-data` 继续拥有 `material-category` 与 `material` 的真源与写路径。
  - 物料分类是否必填，默认遵循 requirement 当前口径“非必填”；未经确认不得静默改成必填业务规则。
  - `permissionCompat` 中已有 `master:*` 与 legacy `base:*` 兼容关系必须保持可用。
  - 不得把库存、审核或其他单据模块的写路径混入本 task。

## Implementation Plan

- [x] Step 1: 修复后端错误语义与分类约束。
  - 在 `createMaterial` / `updateMaterial` 进入 repository 前校验 `categoryId` 是否存在，必要时校验其 `status`。
  - 将非法 `categoryId` 统一转换为明确 `BadRequestException` 或 `NotFoundException`，避免 Prisma/DB 约束上抛为 `500`。
  - 补对应 service/controller focused 测试。
- [x] Step 2: 建立前端真实 `material-category` API 访问层。
  - 新增 `web/src/api/base/material-category.js` 或等价封装，对接 `/api/master-data/material-categories`。
  - 不再通过 `web/src/utils/dict.js` 中“请求 materials 再反推分类”的兼容加载逻辑为物料页供数。
- [x] Step 3: 补齐物料分类前端管理页。
  - 新增 `web/src/views/base/material-category/index.vue`。
  - 在 `web/src/store/modules/permission.js` 增加对应路由映射，使其与现有基础资料菜单体系兼容。
  - 范围限定为最小可用 CRUD，不扩大到树形拖拽、批量迁移或复杂运营功能。
- [x] Step 4: 改造物料页对分类真源的依赖方式。
  - 移除 `category: 1` 默认值。
  - 将新增/修改/搜索中的分类下拉改为直接使用真实分类列表。
  - 若 requirement 仍为“分类非必填”，同步去除前端必填校验；若实现中发现现有业务面强依赖必填，必须回报 parent，不可自行改 requirement。
- [x] Step 5: 收口验证与验收证据。
  - 跑 focused 单测和 `web build`。
  - 补 targeted 浏览器或 acceptance evidence，至少覆盖“先建分类，再建物料；无分类或非法分类不再 500”。

## Coder Handoff

- Execution brief:
  - 先收口错误语义和真源对齐，再补前端入口。不要把这次工作做成大范围 UI 重构或主数据全量翻修。
  - 默认以 requirement 当前口径“物料分类非必填”推进；如果代码现实和 requirement 冲突到无法安全落地，停止并上报 parent。
- Required source docs or files:
  - `docs/requirements/domain/master-data-management.md`
  - `docs/architecture/00-architecture-overview.md`
  - `docs/architecture/modules/master-data.md`
  - `docs/acceptance-tests/specs/master-data.md`
  - `docs/acceptance-tests/runs/run-20260406-0043-master-data-f2-browser-qa.md`
  - 本 task doc
- Owned paths:
  - `src/modules/master-data/**`
  - `web/src/api/base/**`
  - `web/src/views/base/material/index.vue`
  - `web/src/views/base/material-category/index.vue`
  - `web/src/utils/dict.js`
  - `web/src/store/modules/permission.js`
- Forbidden shared files:
  - `docs/tasks/**`
  - `docs/acceptance-tests/**`
  - `docs/requirements/**`
  - `docs/architecture/**`
  - `src/modules/rbac/**`
  - `src/modules/inventory-core/**`
  - `src/modules/inbound/**`
  - `src/modules/customer/**`
  - `src/modules/workshop-material/**`
  - `src/modules/project/**`
  - `web/src/router/**`
- Constraints and non-goals:
  - 不引入新的跨模块写路径，不改 `inventory-core`、`audit`、`rbac` 语义。
  - 不扩 scope 去改所有历史页面，只处理本 task 明确涉及的物料分类真源和 F1/F2 用户流。
  - 不修改 task doc；如需文档更新，由 parent 处理。
  - 若页面接入必须依赖后端当前未暴露的字段或接口，先报告阻塞，不要擅自扩控制器协议。
- Validation command for this scope:
  - `pnpm test -- src/modules/master-data/application/master-data.service.spec.ts src/modules/master-data/controllers/master-data.controller.spec.ts`
  - `pnpm --dir web build:prod`
  - 如需更高信心，可补跑与物料相关的 targeted e2e 或浏览器验证，但不要自行修改 acceptance docs

## Reviewer Handoff

- Review focus:
  - 非法 `categoryId` 是否彻底从 `500` 收敛为明确业务错误。
  - 前端是否真的切到 `/api/master-data/material-categories` 真源，而不是换个位置继续反推。
  - 新增的物料分类管理页是否保持在 F1 最小闭环，不引入与 requirement 不一致的扩 scope。
  - 物料分类“非必填”口径是否被尊重；若被改成必填，必须有明确上游确认。
- Requirement alignment check:
  - 对照 `[AC-1]` ~ `[AC-5]` 检查，重点关注 requirement 与前端实现是否一致。
- Final validation gate:
  - `pnpm test -- src/modules/master-data/application/master-data.service.spec.ts src/modules/master-data/controllers/master-data.controller.spec.ts`
  - `pnpm --dir web build:prod`
- Required doc updates:
  - reviewer 不更新 `docs/tasks/**` 以外文档；如发现 acceptance 证据不足，仅回报 parent。

### Acceptance Evidence Package

- Covered criteria:
  - `[AC-1]` 非法分类错误语义
  - `[AC-2]` 物料分类管理页
  - `[AC-3]` 分类真源切换
  - `[AC-4]` 物料页默认分类与空状态修复
  - `[AC-5]` focused 验证与 targeted 用户流证据
- Evidence pointers:
  - `src/modules/master-data/**`
  - `web/src/api/base/**`
  - `web/src/views/base/material/index.vue`
  - `web/src/views/base/material-category/index.vue`
  - `web/src/utils/dict.js`
  - `web/src/store/modules/permission.js`
  - `docs/acceptance-tests/specs/master-data.md`
- Evidence gaps, if any:
  - None.
- Complete test report requirement: `no`

### Acceptance Test Expectations

- Acceptance mode: `light`
- User-visible flow affected: `yes`
- Cross-module write path: `no`
- Irreversible or high-cost business effect: `no`
- Existing automated user-flow coverage: `partial`
- Browser test required: `yes`
- Browser waiver reason:
  - `N/A`
- Related acceptance cases:
  - `docs/acceptance-tests/cases/master-data.json` 中 `F2-BROWSER-1`
- Related acceptance spec:
  - `docs/acceptance-tests/specs/master-data.md`
- Separate acceptance run required: `optional`
- Complete test report required: `no`
- Required regression / high-risk tags:
  - `master-data-f1`
  - `master-data-f2`
  - `browser-smoke`
- Suggested environment / accounts:
  - `.env.dev`
  - backend `:8112`
  - web `:90`
  - 具备 `master:*` 或兼容 `base:*` 权限的账号
- Environment owner / setup source:
  - 当前仓库本地标准开发环境

## Parallelization Safety

- Status: `not_safe`
- If safe, list the exact disjoint writable scopes:
  - `N/A`
- If not safe, list the shared files or contracts that require a single writer:
  - `src/modules/master-data/application/master-data.service.ts`
  - `web/src/views/base/material/index.vue`
  - `web/src/utils/dict.js`
  - `web/src/store/modules/permission.js`
  - 前后端关于 `categoryId` 的交互契约需要单写者统一收口

## Review Log

- Validation results:
  - `2026-04-06`: `pnpm test -- src/modules/master-data/application/master-data.service.spec.ts src/modules/master-data/controllers/master-data.controller.spec.ts` ✅
  - `2026-04-06`: `pnpm --dir web build:prod` ✅
  - `2026-04-06`: `agent-browser` 真实页面复验 ✅；`/base/material-category` 可访问并成功新增分类，`/base/material` 在“未选分类”与“有效分类”下新增物料均返回 `201`，非法 `categoryId=999999` 返回 `400`
- Findings:
  - `2026-04-06`: 未发现阻塞或重要问题；代码与浏览器证据均表明旧的 `categoryId=1` / `500` 失败面已收口。
- Follow-up action:
  - `None.`

## Acceptance

- Acceptance status: `accepted`
- Acceptance QA:
  - `agent-browser`
- Acceptance date:
  - `2026-04-06`
- Complete test report:
  - `2026-04-06`: focused 单测、`web build:prod` 与 `docs/acceptance-tests/runs/run-20260406-0124-master-data-f1-f2-browser-alignment.md` 均通过。

### Acceptance Checklist

> Acceptance QA 在验收时逐条填写。每条应对应 domain capability 的用户需求或 task doc 的 `[AC-*]` 条目。

- [x] `[AC-1]` 非法 `categoryId` 不再返回 `500`，而是明确 `4xx` 业务错误 — Evidence: `src/modules/master-data/application/master-data.service.ts`，`src/modules/master-data/application/master-data.service.spec.ts`，`run-20260406-0124-master-data-f1-f2-browser-alignment.md` — Verdict: `✓ met`
- [x] `[AC-2]` 物料分类管理页可完成最小闭环维护 — Evidence: `web/src/views/base/material-category/index.vue`，`web/src/api/base/material-category.js`，`run-20260406-0124-master-data-f1-f2-browser-alignment.md` — Verdict: `✓ met`
- [x] `[AC-3]` 物料页与相关分类下拉改为读取真实 `material-category` 主数据 — Evidence: `web/src/views/base/material/index.vue`，`web/src/utils/dict.js` — Verdict: `✓ met`
- [x] `[AC-4]` 物料页不再默认提交硬编码分类，空状态行为可解释 — Evidence: `web/src/views/base/material/index.vue`，`web/src/api/base/material.js`，`run-20260406-0124-master-data-f1-f2-browser-alignment.md` — Verdict: `✓ met`
- [x] `[AC-5]` focused 自动化验证与 targeted 浏览器证据齐备 — Evidence: `pnpm test -- src/modules/master-data/application/master-data.service.spec.ts src/modules/master-data/controllers/master-data.controller.spec.ts`，`pnpm --dir web build:prod`，`run-20260406-0124-master-data-f1-f2-browser-alignment.md` — Verdict: `✓ met`

### Acceptance Notes

- Acceptance path used: `light`
- Acceptance summary:
  - 本 task 已完成 `material-category` 真源对齐、F1 页面补齐与 F2 浏览器失败修复；自动化验证和真实 UI 复验均通过。
- Report completeness check:
  - 与本 task 相关的 focused code evidence 与 targeted browser evidence 已齐备；未额外创建 full acceptance spec/run。
- If rejected or blocked: root cause（`requirement-misunderstanding` | `implementation-gap` | `evidence-gap` | `environment-gap`）+ 精确修复指引 / 环境修复指引
- If conditionally accepted: follow-up requirement / task:

## Final Status

- Outcome:
  - `accepted`
- Requirement alignment:
  - 交付结果与 `master-data` F1/F2 requirement 对齐，并按 requirement 保持“物料分类非必填”口径。
- Residual risks or testing gaps:
  - 其他仍使用旧分类兼容字典的页面未纳入本 task；若后续出现用户流依赖，需单独开 task 收口。
- Directory disposition after completion: `retained-completed`
- Next action:
  - `None.`
