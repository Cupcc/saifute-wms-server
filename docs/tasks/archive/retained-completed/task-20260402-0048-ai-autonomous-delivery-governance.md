# AI 自主交付与完整测试报告规范

## Metadata

- Scope: 将“AI 自主完成需求 + 最终交付完整测试报告”的口头要求沉淀为仓库内模板、流程文档和可复用 SOP。
- Related requirement: `docs/requirements/archive/retained-completed/req-20260402-0048-ai-autonomous-delivery-governance.md`
- Status: `completed`
- Review status: `reviewed-clean`
- Delivery mode: `standard`
- Acceptance mode: `light`
- Acceptance status: `accepted`
- Complete test report required: `no`
- Lifecycle disposition: `retained-completed`
- Planner: `assistant`
- Coder: `assistant`
- Reviewer: `assistant`
- Acceptance QA: `assistant`
- Last updated: `2026-04-02`
- Related checklist: `None`
- Related acceptance spec: `None`
- Related acceptance run: `None`
- Related files:
  - `docs/requirements/_template.md`
  - `docs/requirements/README.md`
  - `docs/tasks/_template.md`
  - `docs/tasks/README.md`
  - `docs/acceptance-tests/README.md`
  - `docs/acceptance-tests/specs/_template.md`
  - `docs/acceptance-tests/runs/_template.md`
  - `docs/playbooks/orchestration/ai-autonomous-delivery-sop.md`
  - `docs/requirements/REQUIREMENT_CENTER.md`
  - `docs/tasks/TASK_CENTER.md`

## Requirement Alignment

- Requirement doc:
  - `docs/requirements/archive/retained-completed/req-20260402-0048-ai-autonomous-delivery-governance.md`
- User intent summary:
  - 希望 AI 后续可以更自主地端到端推进项目，而不是每次都靠额外口头说明。
  - 希望 requirement 自身能写成可判定合同，而不是散文式 PRD。
  - 希望最终交付有一份完整测试报告，用来回答“需求到底有没有完成”。
- Acceptance criteria carried into this task:
  - `[AC-1]` requirement 模板支持范围、非目标、`[AC-*]`、证据类型与完成定义。
  - `[AC-2]` task / acceptance 协议明确自主交付模式与默认 `full` 验收门槛。
  - `[AC-3]` 仓库内存在一份可复用 SOP。
  - `[AC-4]` acceptance run 模板可直接作为完整测试报告。
- Requirement evidence expectations:
  - 以文档模板与 README 更新为主，不需要独立业务 acceptance run。
- Open questions requiring user confirmation:
  - None.

## Requirement Sync

- Req-facing phase progress:
  - 已完成 docs 治理切片，并把流程沉淀为模板与 SOP。
- Req-facing current state:
  - 后续新需求可直接按“自主交付模式”建 requirement/task，并通过 acceptance run 交付完整测试报告。
- Req-facing acceptance state:
  - `验收通过`
- Req-facing blockers:
  - None.
- Req-facing next step:
  - None；后续只需在具体业务切片中按新模板执行。
- Requirement doc sync owner:
  - `assistant`

## Goal And Acceptance Criteria

- Goal:
  - 把 AI 自主交付的关键制度层补齐，让“可执行 requirement + full acceptance + 完整测试报告”成为仓库内可复用流程。
- Acceptance criteria:
  - [x] `[AC-1]` requirement 模板升级为可执行 contract。
  - [x] `[AC-2]` task / acceptance 流程文档明确自主交付模式。
  - [x] `[AC-3]` 新增 AI 自主交付 SOP。
  - [x] `[AC-4]` acceptance run 模板可直接承担完整测试报告职责。

## Scope And Ownership

- Allowed code paths:
  - `docs/requirements/**`
  - `docs/tasks/**`
  - `docs/acceptance-tests/**`
  - `docs/playbooks/orchestration/**`
- Frozen or shared paths:
  - `src/**`
  - `prisma/**`
  - `web/**`
- Task doc owner:
  - `assistant`
- Contracts that must not change silently:
  - requirement 仍保持面向用户、简洁可读，不退化为实现日志。
  - task doc 仍是执行 brief 真源。
  - acceptance run 作为完整测试报告，不替代 requirement 与 task 的职责边界。

## Implementation Plan

- [x] Step 1: 新建本轮 requirement / task 锚点，并确定这是 docs-only governance 切片。
- [x] Step 2: 升级 requirement 模板与 README，使切片 requirement 支持 `[AC-*]`、证据类型与完成定义。
- [x] Step 3: 升级 task / acceptance README 与模板，把自主交付模式、完整测试报告与 `full` 验收门槛写清。
- [x] Step 4: 新增 AI 自主交付 SOP，并同步 requirements/tasks 看板归档记录。

## Coder Handoff

- Execution brief:
  - 这是 docs-only governance 切片；目标不是写业务代码，而是把后续交付协议写成仓库内真源。
- Required source docs or files:
  - `docs/requirements/README.md`
  - `docs/tasks/README.md`
  - `docs/acceptance-tests/README.md`
  - 对应 `_template.md` 文件
- Owned paths:
  - `docs/requirements/**`
  - `docs/tasks/**`
  - `docs/acceptance-tests/**`
  - `docs/playbooks/orchestration/**`
- Forbidden shared files:
  - `src/**`
  - `prisma/**`
  - `web/**`
- Constraints and non-goals:
  - 不重写业务 topic。
  - 不为旧任务补做追溯性 acceptance run。
- Validation command for this scope:
  - 文档语义复核 + 模板/README 交叉一致性检查。

## Reviewer Handoff

- Review focus:
  - 模板、README、SOP 三者是否一致，是否真的能支撑“自主交付 + 完整测试报告”。
- Requirement alignment check:
  - 确认 requirement 中的四个 `[AC-*]` 都有明确文档落点。
- Final validation gate:
  - 逐份 reread 更新后的 requirement/task/acceptance 模板与 SOP，确认字段、触发条件、产物职责、完整测试报告定义一致。
- Required doc updates:
  - `REQUIREMENT_CENTER.md`
  - `TASK_CENTER.md`

### Acceptance Evidence Package

- Covered criteria:
  - `[AC-1]` ~ `[AC-4]`
- Evidence pointers:
  - 模板与 README 更新
  - 新增 `docs/playbooks/orchestration/ai-autonomous-delivery-sop.md`
- Evidence gaps, if any:
  - None.
- Complete test report requirement: `no`

### Acceptance Test Expectations

- Acceptance mode: `light`
- Browser test required: `no`
- Related acceptance spec: `None`
- Separate acceptance run required: `no`
- Complete test report required: `no`
- Required regression / high-risk tags:
  - `docs-governance`
- Suggested environment / accounts:
  - `None`
- Environment owner / setup source:
  - `None`

## Parallelization Safety

- Status: `not-assessed`
- If safe, list the exact disjoint writable scopes:
  - N/A
- If not safe, list the shared files or contracts that require a single writer:
  - requirement / task / acceptance 模板与 README 之间存在强耦合，需要单一 writer 保持口径一致。

## Review Log

- Validation results:
  - 逐份复读并交叉核对以下文件：
    - `docs/requirements/_template.md`
    - `docs/requirements/README.md`
    - `docs/tasks/_template.md`
    - `docs/tasks/README.md`
    - `docs/acceptance-tests/README.md`
    - `docs/acceptance-tests/specs/_template.md`
    - `docs/acceptance-tests/runs/_template.md`
    - `docs/playbooks/orchestration/ai-autonomous-delivery-sop.md`
  - 确认 `autonomous delivery` 的进入条件、默认 `full` 验收、完整测试报告定义与 acceptance run 模板字段一致。
- Findings:
  - No findings.
- Follow-up action:
  - None.

## Acceptance

- Acceptance status: `accepted`
- Acceptance QA: `assistant`
- Acceptance date: `2026-04-02`
- Complete test report:
  - `None`；本切片是 docs-only governance 交付，采用 `light` 验收，不单独生成 acceptance run。

### Acceptance Checklist

- [x] `[AC-1]` requirement 模板支持范围、非目标、`[AC-*]`、证据类型与完成定义 — Evidence: `docs/requirements/_template.md`, `docs/requirements/README.md` — Verdict: `✓ met`
- [x] `[AC-2]` task / acceptance 协议明确自主交付模式与默认 `full` 验收门槛 — Evidence: `docs/tasks/README.md`, `docs/tasks/_template.md`, `docs/acceptance-tests/README.md` — Verdict: `✓ met`
- [x] `[AC-3]` 仓库内新增可复用 SOP — Evidence: `docs/playbooks/orchestration/ai-autonomous-delivery-sop.md` — Verdict: `✓ met`
- [x] `[AC-4]` acceptance run 模板可直接作为完整测试报告 — Evidence: `docs/acceptance-tests/runs/_template.md` — Verdict: `✓ met`

### Acceptance Notes

- Acceptance path used: `light`
- Acceptance summary:
  - 本轮以文档治理交付为主，已把 requirement / task / acceptance 的协议补齐，后续新切片可直接按此流程执行。
- Report completeness check:
  - 已明确：后续业务切片在 `Acceptance mode = full` 时，由 `docs/acceptance-tests/runs/run-*.md` 承担完整测试报告职责。
- If rejected or blocked:
  - `N/A`
- If conditionally accepted:
  - `N/A`

## Final Status

- Outcome:
  - 已完成“AI 自主交付 + 完整测试报告”规范落地，模板、README、SOP 与看板已同步更新。
- Requirement alignment:
  - 已满足 requirement 定义的四项 `[AC-*]`，且后续新需求可直接按该协议推进。
- Residual risks or testing gaps:
  - 历史旧任务不会自动补齐为 `full` 模式；这套协议从后续新切片开始最稳妥。
- Directory disposition after completion: `retained-completed`
- Next action:
  - None.
