# Biome Lint Cleanup

## Metadata

- Scope: 基于当前真实 Biome 失败面收口全仓 `pnpm lint`，修复 `web/`、`scripts/`、`src/`、`test/` 中现有 error，让仓库根目录 lint 恢复通过；本轮不得通过放宽规则、缩小检查范围或创建 commit 来伪造完成
- Related requirement: `docs/requirements/archive/retained-completed/req-20260328-1855-biome-lint-cleanup.md`
- Status: `completed`
- Review status: `reviewed-no-findings`
- Lifecycle disposition: `retained-completed`
- Planner: `assistant`
- Coder: `assistant`
- Reviewer: `assistant`
- Last updated: `2026-03-28`

## Requirement Alignment

- Requirement doc:
  - `docs/requirements/archive/retained-completed/req-20260328-1855-biome-lint-cleanup.md`
- User intent summary:
  - 修复当前导致仓库根目录 `pnpm lint` 失败的问题
  - 本轮是全仓 lint 收口，不是单模块小修
  - 本轮只做规划与后续执行锚点，不创建 commit
- Acceptance criteria carried into this task:
  - 仓库根目录 `pnpm lint` 恢复通过
  - 修复基于当前真实失败面，不通过禁用规则、修改 lint 命令或排除路径来绕过问题
  - 改动范围收敛在当前失败文件及其必要的最小相邻代码
  - `docs/tasks/archive/retained-completed/task-20260328-1855-biome-lint-cleanup.md` 与 `docs/tasks/TASK_CENTER.md` 保留为本轮执行真源
- Open questions requiring user confirmation:
  - None

## Requirement Sync

- Req-facing phase progress:
  - 已完成 lint 收口执行、closing review 与生命周期同步
- Req-facing current state:
  - 根目录 `pnpm lint` 返回 `0`，`web` Biome error 校验通过；此前 open 的 4 处日期范围守卫 finding 已关闭，本 task 达到 `reviewed-no-findings`
- Req-facing blockers:
  - None
- Req-facing next step:
  - 归档 / 等待新需求；若后续要继续收口全仓 warnings / infos，需另开新 scope
- Requirement doc sync owner:
  - `assistant`

## Goal And Acceptance Criteria

- Goal:
  - 在不放宽仓库 lint 合约的前提下，修复当前所有导致根目录 `pnpm lint` 失败的 Biome error，让 lint 重新成为可信的仓库级质量闸门
- Acceptance criteria:
  - 在仓库根目录运行 `pnpm lint` 返回 `0`
  - 当前 error 族全部清空：
    - `web/` 下的 `lint/suspicious/noDoubleEquals`
    - `web/` 下的 `lint/suspicious/useIterableCallbackReturn`
    - `web/` 下的 `lint/suspicious/noAssignInExpressions`
    - `web/` 下的 correctness / a11y / CSS 规则错误
    - `scripts/`、`src/`、`test/` 下的 `format` 与 `assist/source/organizeImports`
  - `biome.json`、`package.json`、根目录 `lint` 命令保持现有合约，不以降级规则或排除路径作为完成手段
  - 对 `web/` 旧前端代码中的相等比较和表达式赋值修复必须保持原有业务语义；若需要行为判断，必须显式写出意图，而不是机械替换后静默改变分支逻辑
  - 非 `web/` 桶中的格式化与 import 整理改动应保持语义等价

## Scope And Ownership

- Allowed code paths:
  - `docs/tasks/archive/retained-completed/task-20260328-1855-biome-lint-cleanup.md`
  - `docs/tasks/TASK_CENTER.md`
  - `web/index.html`
  - `web/html/ie.html`
  - `web/src/**`
  - `scripts/migration/customer-sales-return-finalize/**`
  - `scripts/migration/return-post-admission/planner.ts`
  - `src/modules/customer/customer.module.ts`
  - `src/modules/inventory-core/application/inventory.service.spec.ts`
  - `test/migration/customer*.spec.ts`
  - `test/migration/customer-reservation*.spec.ts`
  - `test/migration/customer-sales-return*.spec.ts`
- Frozen or shared paths:
  - `docs/requirements/**`、`docs/workspace/**`、`docs/architecture/**` 仍由 parent 管理，本轮不得改写
  - `biome.json`、`package.json`、`pnpm-lock.yaml` 与其他根配置视为共享冻结面；除非 parent 明确重新定 scope，否则不得通过调整 lint 配置或命令来取巧
  - 不在当前失败面内的业务模块文件默认冻结；若共享工具文件改动会波及相邻代码，只允许做与 lint 修复直接相关的最小调整
- Task doc owner:
  - `assistant`
- Contracts that must not change silently:
  - 仓库级 lint 合约仍是根目录 `pnpm lint` => `biome check .`
  - 不允许通过新增 ignore、关闭规则、降低检查级别或缩小根命令覆盖面来获取“假绿”
  - `web/` 中旧代码的宽松相等、赋值表达式、回调返回值问题如果涉及运行时语义，必须显式保持原意
  - `scripts/` / `src/` / `test/` 中本轮优先视为格式与 import 收口，不应顺手扩写为无关重构

## Implementation Plan

- [ ] Step 1: 以当前 `pnpm lint` 结果作为唯一基线，锁定非目标项：不改 `biome.json`、不改根 `lint` 命令、不创建 commit
- [ ] Step 2: 先清理低风险噪音桶：
  - `scripts/migration/customer-sales-return-finalize/**`
  - `scripts/migration/return-post-admission/planner.ts`
  - `src/modules/customer/customer.module.ts`
  - `src/modules/inventory-core/application/inventory.service.spec.ts`
  - `test/migration/customer*.spec.ts` / `customer-reservation*.spec.ts` / `customer-sales-return*.spec.ts`
  - 这些文件当前以 `format` / `assist/source/organizeImports` 为主，应先收口以降低后续噪音
- [ ] Step 3: 再处理 `web/` 中的结构性错误与明确 correctness 问题：
  - `web/index.html` 的 `useHtmlLang` / `useGenericFontNames`
  - `web/html/ie.html` 的 `noShorthandPropertyOverrides`
  - `web/src/components/Crontab/index.vue` 的 duplicate keys
  - `web/src/plugins/download.js` 的 `noInvalidUseBeforeDeclaration` / `noRedeclare`
  - `web/src/components/Breadcrumb/index.vue`、`AiChatPanel.vue`、`web/src/utils/generator/js.js`、`web/src/views/tool/build/index.vue` 等 `noAssignInExpressions`
  - `web/src/utils/ruoyi.js`、`web/src/utils/generator/css.js`、`web/src/components/TopNav/index.vue` 等 `useIterableCallbackReturn` / `noInnerDeclarations`
- [ ] Step 4: 最后集中处理 `web/` 的 `noDoubleEquals` 大头：
  - 先修共享 util / store / component：`web/src/utils/ruoyi.js`、`web/src/utils/validate.js`、`web/src/utils/index.js`、`web/src/store/modules/dict.js`、`web/src/components/**`
  - 再修页面级 `views/**`
  - 每处都要根据 `null` / `undefined` / 数字 / 字符串语义决定使用 `===`、`!==` 或显式类型转换，禁止机械替换
- [ ] Step 5: 每完成一个错误桶先跑对应局部 Biome 校验，最后统一运行根目录 `pnpm lint`；若发现某条规则无法在不改变业务语义的前提下修复，应停下并把阻塞回抛给 parent，而不是临时降级规则

## Coder Handoff

- Execution brief:
  - 这是一次全仓 lint 收口，不是配置调整任务
  - 推荐修复顺序：
    - 先 `scripts/` + `src/` + `test/` 的 `format` / `organizeImports`
    - 再 `web/` 的 a11y / correctness / assignment / iterable callback 等结构性错误
    - 最后 `web/` 的 `noDoubleEquals`
  - `web/` 中任何涉及逻辑判断的替换都要以“保持原业务语义”为第一原则
- Required source docs or files:
  - `docs/requirements/archive/retained-completed/req-20260328-1855-biome-lint-cleanup.md`
  - `package.json`
  - `biome.json`
  - 当前基线命令：根目录 `pnpm lint`
  - 高密度失败文件：
    - `web/src/utils/ruoyi.js`
    - `web/src/components/TopNav/index.vue`
    - `web/src/views/base/customer/index.vue`
- Owned paths:
  - `web/index.html`
  - `web/html/ie.html`
  - `web/src/**`
  - `scripts/migration/customer-sales-return-finalize/**`
  - `scripts/migration/return-post-admission/planner.ts`
  - `src/modules/customer/customer.module.ts`
  - `src/modules/inventory-core/application/inventory.service.spec.ts`
  - `test/migration/customer*.spec.ts`
  - `test/migration/customer-reservation*.spec.ts`
  - `test/migration/customer-sales-return*.spec.ts`
- Forbidden shared files:
  - `docs/requirements/**`
  - `docs/workspace/**`
  - `docs/architecture/**`
  - `biome.json`
  - `package.json`
  - `pnpm-lock.yaml`
  - archived task docs
- Constraints and non-goals:
  - 不要通过关闭规则、增加排除、改变脚本命令来规避错误
  - 不要顺手做与 lint 无关的业务重构
  - 不要创建 commit
  - 如果某个 `==` / `!=` 背后依赖旧代码的隐式类型转换，需改成显式比较或显式转换，而不是直接生硬替换
- Validation command for this scope:
  - `pnpm exec biome check scripts src test --diagnostic-level=error`
  - `pnpm exec biome check web --diagnostic-level=error`
  - 针对高风险文件可补跑单文件命令，例如：`pnpm exec biome check web/src/utils/ruoyi.js web/src/components/TopNav/index.vue --diagnostic-level=error`
  - 最终总闸门：`pnpm lint`

## Reviewer Handoff

- Review focus:
  - 是否严格按“修错误而不是降规则”完成
  - `web/` 中 `noDoubleEquals` / `noAssignInExpressions` 修复是否保持旧业务语义
  - `scripts/`、`src/`、`test/` 改动是否确实为格式化 / import 整理的语义等价变更
  - 改动范围是否仍收敛在当前失败文件与必要的最小相邻代码
- Requirement alignment check:
  - 确认本轮交付只针对根目录 `pnpm lint` 恢复通过
  - 确认未创建 commit，且未改写 requirement / workspace / 其他越界文档
- Final validation gate:
  - `pnpm lint`
  - 若 reviewer 认为 `web/` 语义变更风险偏高，可补跑 `pnpm exec biome check web --diagnostic-level=error`
- Required doc updates:
  - 在本 task 文档记录 review 结果、最终验证情况与残余风险
  - requirement 进展同步由 parent 负责写回

## Parallelization Safety

- Status: `not-safe`
- If not safe, list the shared files or contracts that require a single writer:
  - 本轮最终闸门是单一的仓库根目录 `pnpm lint`，任何子目录局部通过都不能独立宣告完成
  - `web/` 占当前 `109` 个 error 中的 `93` 个，且错误集中在共享 util / store / component / views 之间，尤其是 `web/src/utils/ruoyi.js`、`web/src/utils/index.js`、`web/src/store/modules/dict.js`、`web/src/components/TopNav/index.vue` 等高连接文件，拆分多 writer 很容易产生语义不一致与 rebase 冲突
  - `biome.json`、`package.json` 与根 lint 合约属于共享冻结面，必须由单一执行链路统一解释“修错”与“禁配”的边界
  - `scripts/` / `src/` / `test/` 虽然风险较低，但仍共享同一个根闸门；在 `web/` 主错误面未清空前并行切分的收益不足以覆盖协调成本

## Review Log

- Validation results:
  - Re-read `docs/requirements/archive/retained-completed/req-20260328-1855-biome-lint-cleanup.md` 与本 task，确认本次 closing review 仅聚焦此前 open `[important]` 的四处日期范围守卫。
  - 逐文件复核 `web/src/views/stock/log/index.vue`、`web/src/views/stock/scrapOrder/index.vue`、`web/src/views/take/returnDetail/index.vue`、`web/src/views/take/returnOrder/index.vue` 当前实现；四处都已改为基于 `Array.isArray(range.value) && range.value.length === 2` 的显式判断，且统一读取 `.value`，不再依赖“数组与空字符串比较”或“直接判断 ref 对象本身”的 legacy 写法。
  - 复跑 `pnpm exec biome check web --diagnostic-level=error`；命令通过。
  - 复跑根目录 `pnpm lint`；命令返回 `0`。当前仓库仍会输出 warnings / infos，但无 error，且不影响本 task 以返回码为准的最终闸门。
- Findings:
  - `No blocking findings.`
  - `No important findings.`
  - 此前针对四处日期范围守卫的 open `[important]` 已关闭；当前实现已把“只有选中完整区间时才写入 begin/end 查询参数”的意图显式表达出来。
- Follow-up action:
  - closing review 已完成；后续仅需由 parent 按 requirement/task 生命周期决定是否同步归档。

## Final Status

- Outcome:
  - 此前 open `[important]` 已在 targeted rereview 中关闭；当前 lint 收口任务达到 `reviewed-no-findings` 的 clean sign-off
- Requirement alignment:
  - 与已确认 requirement 对齐：根目录 `pnpm lint` 已返回 `0`，`web` 局部 Biome error 校验通过，未见通过改写 `biome.json` / 根 `lint` 命令 / requirement 文档来取巧，且本轮未创建 commit
- Residual risks or testing gaps:
  - 本次 closing review 仅复核此前 open finding 的四处日期范围守卫；对其余 lint 收口改动沿用上一轮已完成的 review 结论
  - 根目录 `pnpm lint` 仍会输出 warnings / infos；它们不阻断当前 task 的返回码闸门，但若后续目标升级为“全仓零告警”，需要单独开 scope
- Directory disposition after completion:
  - 已迁入 `archive/retained-completed/`，作为本轮 lint 收口的执行 provenance 保留
- Next action:
  - None
